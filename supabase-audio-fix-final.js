// ============================================================
// VOZIA VAULT — AUDIO FIX FINAL
// Versão V8.11
//
// Correção real:
// 1. Não força mais audio/webm em navegador que não suporta.
// 2. Usa o melhor MIME suportado pelo navegador.
// 3. Cria botão "Ouvir gravação" próprio, além do player.
// 4. Remove dependência do gravador antigo.
// 5. Salva no Supabase Storage com contentType correto.
// ============================================================

(function () {
  let rec = null;
  let stream = null;
  let chunks = [];
  let startedAt = 0;
  let timerId = null;
  let currentBlob = null;
  let currentUrl = null;
  let currentDuration = 0;
  let currentMime = "";
  let currentExt = "webm";

  function $(id) {
    return document.getElementById(id);
  }

  function log(...args) {
    console.log("[VoziaAudioFix]", ...args);
  }

  function chooseMime() {
    const options = [
      { mime: "audio/webm;codecs=opus", ext: "webm" },
      { mime: "audio/webm", ext: "webm" },
      { mime: "audio/mp4", ext: "mp4" },
      { mime: "audio/mpeg", ext: "mp3" },
      { mime: "audio/ogg;codecs=opus", ext: "ogg" },
      { mime: "", ext: "webm" }
    ];

    if (!window.MediaRecorder) {
      throw new Error("Este navegador não suporta MediaRecorder.");
    }

    for (const opt of options) {
      if (!opt.mime) return opt;
      try {
        if (MediaRecorder.isTypeSupported(opt.mime)) return opt;
      } catch (e) {}
    }

    return { mime: "", ext: "webm" };
  }

  function getLimit() {
    try {
      if (typeof phraseLimit === "function") return phraseLimit();
    } catch (e) {}
    try {
      if (currentUser?.limits?.phrases) return currentUser.limits.phrases;
    } catch (e) {}
    return 100;
  }

  function getIndex() {
    try {
      if (typeof currentIndex !== "undefined") return Number(currentIndex || 0);
    } catch (e) {}
    return Number(localStorage.getItem("vozia_current_phrase") || "0");
  }

  function setIndex(value) {
    const n = Math.max(0, Number(value || 0));
    try {
      if (typeof currentIndex !== "undefined") currentIndex = n;
    } catch (e) {}
    localStorage.setItem("vozia_current_phrase", String(n));
  }

  function getPhrase() {
    const idx = getIndex();
    try {
      if (typeof phrases !== "undefined" && phrases[idx]) return phrases[idx];
    } catch (e) {}
    return { category: "Banco de voz", text: "Frase de teste do banco de voz." };
  }

  function fmt(ms) {
    const s = Math.max(0, Math.floor(ms / 1000));
    return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
  }

  function ensureUi() {
    const phraseCard = document.querySelector(".phraseCard");
    if (!phraseCard) return;

    let timer = $("recordTimerBox");
    if (!timer) {
      timer = document.createElement("div");
      timer.id = "recordTimerBox";
      timer.className = "recordTimerBox hidden";
      timer.innerHTML = `
        <div class="recordPulse"></div>
        <div>
          <b id="recordTimer">00:00</b>
          <span id="recordTimerLabel">Pronto para gravar</span>
        </div>
      `;
      const volume = document.querySelector(".volumeWrap");
      if (volume?.parentNode) volume.parentNode.insertBefore(timer, volume.nextSibling);
      else phraseCard.prepend(timer);
    }

    let listenBtn = $("listenFixedBtn");
    if (!listenBtn) {
      listenBtn = document.createElement("button");
      listenBtn.id = "listenFixedBtn";
      listenBtn.type = "button";
      listenBtn.className = "ghost";
      listenBtn.textContent = "▶ Ouvir gravação";
      listenBtn.disabled = true;

      const actions = phraseCard.querySelector(".actions");
      if (actions) {
        const save = $("saveBtn");
        if (save && save.parentNode === actions) actions.insertBefore(listenBtn, save);
        else actions.appendChild(listenBtn);
      }
    }

    if (!$("recordDebugMsg")) {
      const dbg = document.createElement("div");
      dbg.id = "recordDebugMsg";
      dbg.className = "msg hidden";
      phraseCard.appendChild(dbg);
    }
  }

  function debugMsg(text, ok = false) {
    const el = $("recordDebugMsg");
    if (!el) return;
    el.textContent = text;
    el.className = "msg" + (ok ? " ok" : "");
    el.classList.remove("hidden");
    el.style.display = "block";
  }

  function clearDebug() {
    const el = $("recordDebugMsg");
    if (!el) return;
    el.classList.add("hidden");
    el.style.display = "none";
  }

  function setButtons(state) {
    // state: idle, recording, ready, saving
    const recording = state === "recording";
    const ready = state === "ready";
    const saving = state === "saving";

    if ($("recordBtn")) $("recordBtn").disabled = recording || saving;
    if ($("stopBtn")) $("stopBtn").disabled = !recording;
    if ($("pauseBtn")) $("pauseBtn").disabled = true;
    if ($("resumeBtn")) $("resumeBtn").classList.add("hidden");
    if ($("pauseBtn")) $("pauseBtn").classList.remove("hidden");
    if ($("saveBtn")) $("saveBtn").disabled = !ready || saving;
    if ($("retryBtn")) $("retryBtn").disabled = !ready || saving;
    if ($("listenFixedBtn")) $("listenFixedBtn").disabled = !ready || saving;
  }

  function startTimer() {
    startedAt = Date.now();
    const box = $("recordTimerBox");
    const timer = $("recordTimer");
    const label = $("recordTimerLabel");

    if (box) box.classList.remove("hidden");
    if (timer) timer.textContent = "00:00";
    if (label) label.textContent = "Gravação em andamento";

    clearInterval(timerId);
    timerId = setInterval(() => {
      if ($("recordTimer")) $("recordTimer").textContent = fmt(Date.now() - startedAt);
    }, 200);
  }

  function stopTimer(ms) {
    clearInterval(timerId);
    timerId = null;
    if ($("recordTimer")) $("recordTimer").textContent = fmt(ms);
    if ($("recordTimerLabel")) $("recordTimerLabel").textContent = "Gravação finalizada";
  }

  function resetAudio() {
    currentBlob = null;
    currentDuration = 0;
    currentMime = "";
    currentExt = "webm";

    if (currentUrl) {
      try { URL.revokeObjectURL(currentUrl); } catch (e) {}
      currentUrl = null;
    }

    try {
      if (typeof pendingBlob !== "undefined") pendingBlob = null;
      if (typeof pendingDuration !== "undefined") pendingDuration = 0;
    } catch (e) {}

    const audio = $("audioPreview");
    if (audio) {
      audio.pause();
      audio.removeAttribute("src");
      audio.load();
    }

    if ($("previewBox")) $("previewBox").classList.add("hidden");
    if ($("previewInfo")) $("previewInfo").textContent = "";

    setButtons("idle");
  }

  function renderPhrase() {
    const idx = getIndex();
    const limit = getLimit();
    const p = getPhrase();

    if ($("category")) $("category").textContent = p.category || "Banco de voz";
    if ($("counter")) $("counter").textContent = `Frase ${idx + 1} de ${limit}`;
    if ($("phraseText")) $("phraseText").textContent = p.text || "";
  }

  async function reloadRows() {
    if (typeof voziaListRecordings !== "function") return [];

    const rows = await voziaListRecordings();
    const limit = getLimit();
    const done = rows.filter(r => Number(r.phrase_index) < limit).length;
    const pct = Math.round((done / limit) * 100);

    try {
      if (typeof recordings !== "undefined") {
        recordings = {};
        rows.forEach(r => recordings[r.phrase_index] = r);
      }
    } catch (e) {}

    if ($("doneCount")) $("doneCount").textContent = done;
    if ($("percent")) $("percent").textContent = pct + "%";
    if ($("bar")) $("bar").style.width = pct + "%";

    return rows;
  }

  async function goNext() {
    const rows = await reloadRows();
    const limit = getLimit();
    const done = new Set(rows.map(r => Number(r.phrase_index)));

    let next = 0;
    for (let i = 0; i < limit; i++) {
      if (!done.has(i)) {
        next = i;
        break;
      }
      next = Math.min(i + 1, limit - 1);
    }

    setIndex(next);
    renderPhrase();

    try { if (typeof renderMap === "function") renderMap(); } catch (e) {}
    try { if (typeof renderProtocolState === "function") renderProtocolState(); } catch (e) {}
  }

  async function onRecord(ev) {
    ev.preventDefault();
    ev.stopPropagation();
    ev.stopImmediatePropagation();

    clearDebug();

    try {
      resetAudio();

      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error("Microfone não disponível neste navegador.");
      }

      const selected = chooseMime();
      currentMime = selected.mime || "";
      currentExt = selected.ext || "webm";

      log("MIME escolhido:", currentMime || "padrão do navegador");

      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      chunks = [];

      rec = new MediaRecorder(stream, currentMime ? { mimeType: currentMime } : undefined);

      rec.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunks.push(e.data);
      };

      rec.onerror = (e) => {
        console.error("MediaRecorder error:", e);
        debugMsg("Erro do gravador: " + (e.error?.message || "erro desconhecido"));
      };

      rec.onstop = () => {
        try { stream?.getTracks()?.forEach(t => t.stop()); } catch (e) {}

        currentDuration = Date.now() - startedAt;
        stopTimer(currentDuration);

        const type = chunks[0]?.type || currentMime || "audio/webm";
        currentBlob = new Blob(chunks, { type });

        log("Blob gerado:", currentBlob.type, currentBlob.size);

        if (!currentBlob || currentBlob.size < 100) {
          debugMsg("O áudio ficou vazio. Tente gravar por mais tempo e verifique a permissão do microfone.");
          setButtons("idle");
          return;
        }

        currentUrl = URL.createObjectURL(currentBlob);

        try {
          if (typeof pendingBlob !== "undefined") pendingBlob = currentBlob;
          if (typeof pendingDuration !== "undefined") pendingDuration = currentDuration;
        } catch (e) {}

        const audio = $("audioPreview");
        if (audio) {
          audio.controls = true;
          audio.preload = "auto";
          audio.src = currentUrl;
          audio.load();
        }

        if ($("previewInfo")) {
          $("previewInfo").textContent =
            `Duração: ${Math.round(currentDuration / 1000)}s • ` +
            `Formato: ${currentBlob.type || "padrão"} • ` +
            `Tamanho: ${Math.round(currentBlob.size / 1024)} KB`;
        }

        if ($("previewBox")) $("previewBox").classList.remove("hidden");

        setButtons("ready");
        debugMsg("Gravação pronta. Clique em ouvir ou aprovar e avançar.", true);
      };

      rec.start();
      startTimer();
      setButtons("recording");

      if ($("recordStatus")) {
        $("recordStatus").textContent = "● Gravando...";
        $("recordStatus").classList.remove("hidden");
      }

      debugMsg("Gravando... fale a frase e depois clique em Parar.", true);
    } catch (e) {
      console.error(e);
      debugMsg(e.message || "Erro ao iniciar gravação.");
      setButtons("idle");
    }
  }

  function onStop(ev) {
    ev.preventDefault();
    ev.stopPropagation();
    ev.stopImmediatePropagation();

    try {
      if (!rec || rec.state === "inactive") {
        debugMsg("Nenhuma gravação em andamento.");
        return;
      }

      if ($("recordStatus")) $("recordStatus").classList.add("hidden");

      // Garante que o último pedaço seja emitido antes do stop em alguns navegadores.
      try { rec.requestData(); } catch (e) {}

      setTimeout(() => {
        try {
          if (rec && rec.state !== "inactive") rec.stop();
        } catch (e) {
          console.error(e);
          debugMsg("Erro ao parar gravação: " + (e.message || "erro"));
        }
      }, 120);
    } catch (e) {
      console.error(e);
      debugMsg(e.message || "Erro ao parar gravação.");
    }
  }

  function onListen(ev) {
    ev.preventDefault();
    ev.stopPropagation();
    ev.stopImmediatePropagation();

    try {
      if (!currentBlob || !currentUrl) {
        debugMsg("Nenhum áudio pronto para ouvir. Grave e pare primeiro.");
        return;
      }

      const audio = $("audioPreview");
      if (!audio) {
        const temp = new Audio(currentUrl);
        temp.play().catch(err => debugMsg("Erro ao tocar áudio: " + err.message));
        return;
      }

      audio.src = currentUrl;
      audio.load();

      const playPromise = audio.play();
      if (playPromise?.catch) {
        playPromise.catch((err) => {
          console.error("Erro no play:", err);
          debugMsg(
            "O navegador recusou o play desse formato. Tente pelo Chrome/Edge ou grave novamente. Detalhe: " +
            (err.message || err.name)
          );
        });
      }
    } catch (e) {
      console.error(e);
      debugMsg("Erro ao ouvir: " + (e.message || "erro"));
    }
  }

  function onRetry(ev) {
    ev.preventDefault();
    ev.stopPropagation();
    ev.stopImmediatePropagation();
    resetAudio();
    clearDebug();
  }

  async function onSave(ev) {
    ev.preventDefault();
    ev.stopPropagation();
    ev.stopImmediatePropagation();

    try {
      if (!currentBlob) {
        debugMsg("Grave e pare antes de aprovar.");
        return;
      }

      if (typeof voziaGetUser === "function") {
        const user = await voziaGetUser();
        if (!user) throw new Error("Usuário não está logado.");
      }

      if (typeof voziaUploadVoiceRecording !== "function") {
        throw new Error("Função de upload Supabase não encontrada.");
      }

      const idx = getIndex();
      const p = getPhrase();

      setButtons("saving");
      if ($("saveBtn")) $("saveBtn").textContent = "Salvando...";

      await voziaUploadVoiceRecording({
        phraseIndex: idx,
        phraseCategory: p.category || "Banco de voz",
        phraseText: p.text || "",
        audioBlob: currentBlob,
        durationMs: currentDuration,
        mimeType: currentBlob.type || currentMime || "audio/webm",
        extension: currentExt
      });

      debugMsg("Salvo no Supabase. Indo para próxima frase.", true);

      resetAudio();
      await goNext();
    } catch (e) {
      console.error(e);
      debugMsg("Erro ao salvar: " + (e.message || "erro"));
      setButtons("ready");
    } finally {
      if ($("saveBtn")) $("saveBtn").textContent = "✅ Aprovar e avançar";
    }
  }

  function connect() {
    ensureUi();
    renderPhrase();

    const recordBtn = $("recordBtn");
    const stopBtn = $("stopBtn");
    const retryBtn = $("retryBtn");
    const saveBtn = $("saveBtn");
    const listenBtn = $("listenFixedBtn");

    if (recordBtn && !recordBtn.dataset.audioFixFinal2) {
      recordBtn.dataset.audioFixFinal2 = "1";
      recordBtn.addEventListener("click", onRecord, true);
    }

    if (stopBtn && !stopBtn.dataset.audioFixFinal2) {
      stopBtn.dataset.audioFixFinal2 = "1";
      stopBtn.addEventListener("click", onStop, true);
    }

    if (retryBtn && !retryBtn.dataset.audioFixFinal2) {
      retryBtn.dataset.audioFixFinal2 = "1";
      retryBtn.addEventListener("click", onRetry, true);
    }

    if (saveBtn && !saveBtn.dataset.audioFixFinal2) {
      saveBtn.dataset.audioFixFinal2 = "1";
      saveBtn.addEventListener("click", onSave, true);
    }

    if (listenBtn && !listenBtn.dataset.audioFixFinal2) {
      listenBtn.dataset.audioFixFinal2 = "1";
      listenBtn.addEventListener("click", onListen, true);
    }
  }

  document.addEventListener("DOMContentLoaded", () => {
    connect();
    setTimeout(() => {
      connect();
      reloadRows().then(goNext).catch(() => {});
    }, 800);
  });

  document.addEventListener("click", () => {
    setTimeout(connect, 80);
  }, true);

  window.voziaAudioFixFinal = {
    connect,
    reload: goNext,
    chooseMime
  };
})();
