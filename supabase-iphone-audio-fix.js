// ============================================================
// VOZIA VAULT — iPhone Audio Fix + Bucket Fallback
// Versão V8.12
//
// Problema corrigido:
// - iPhone/Safari não toca bem audio/webm.
// - Buckets no Supabase estavam com nomes em português.
// - Este arquivo força preferência por audio/mp4 no Safari/iPhone,
//   mas usa fallback conforme suporte do navegador.
// ============================================================

(function () {
  let recorder = null;
  let stream = null;
  let chunks = [];
  let startedAt = 0;
  let timerId = null;
  let blob = null;
  let url = null;
  let duration = 0;
  let selectedMime = "";
  let selectedExt = "webm";

  function $(id) { return document.getElementById(id); }

  function isIOS() {
    return /iPad|iPhone|iPod/.test(navigator.userAgent) ||
      (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  }

  function chooseMime() {
    const ios = isIOS();

    const iosPreferred = [
      { mime: "audio/mp4", ext: "mp4" },
      { mime: "audio/aac", ext: "aac" },
      { mime: "audio/webm;codecs=opus", ext: "webm" },
      { mime: "audio/webm", ext: "webm" },
      { mime: "", ext: ios ? "mp4" : "webm" }
    ];

    const desktopPreferred = [
      { mime: "audio/webm;codecs=opus", ext: "webm" },
      { mime: "audio/webm", ext: "webm" },
      { mime: "audio/mp4", ext: "mp4" },
      { mime: "audio/ogg;codecs=opus", ext: "ogg" },
      { mime: "", ext: "webm" }
    ];

    const list = ios ? iosPreferred : desktopPreferred;

    if (!window.MediaRecorder) {
      throw new Error("Este navegador não suporta gravação por MediaRecorder.");
    }

    for (const item of list) {
      if (!item.mime) return item;
      try {
        if (MediaRecorder.isTypeSupported(item.mime)) return item;
      } catch (e) {}
    }

    return { mime: "", ext: ios ? "mp4" : "webm" };
  }

  function getLimit() {
    try { if (typeof phraseLimit === "function") return phraseLimit(); } catch (e) {}
    try { if (currentUser?.limits?.phrases) return currentUser.limits.phrases; } catch (e) {}
    return 100;
  }

  function getIndex() {
    try { if (typeof currentIndex !== "undefined") return Number(currentIndex || 0); } catch (e) {}
    return Number(localStorage.getItem("vozia_current_phrase") || "0");
  }

  function setIndex(value) {
    const n = Math.max(0, Number(value || 0));
    try { if (typeof currentIndex !== "undefined") currentIndex = n; } catch (e) {}
    localStorage.setItem("vozia_current_phrase", String(n));
  }

  function getPhrase() {
    const idx = getIndex();
    try {
      if (typeof phrases !== "undefined" && phrases[idx]) return phrases[idx];
    } catch (e) {}
    return { category: "Banco de voz", text: "Frase de teste." };
  }

  function fmt(ms) {
    const total = Math.max(0, Math.floor(ms / 1000));
    return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
  }

  function msg(text, ok = false) {
    ensureUi();
    const el = $("recordDebugMsg");
    if (!el) return;
    el.textContent = text;
    el.className = "msg" + (ok ? " ok" : "");
    el.classList.remove("hidden");
    el.style.display = "block";
  }

  function clearMsg() {
    const el = $("recordDebugMsg");
    if (el) {
      el.classList.add("hidden");
      el.style.display = "none";
    }
  }

  function ensureUi() {
    const card = document.querySelector(".phraseCard");
    if (!card) return;

    if (!$("recordTimerBox")) {
      const box = document.createElement("div");
      box.id = "recordTimerBox";
      box.className = "recordTimerBox hidden";
      box.innerHTML = `
        <div class="recordPulse"></div>
        <div>
          <b id="recordTimer">00:00</b>
          <span id="recordTimerLabel">Pronto para gravar</span>
        </div>`;
      const volume = document.querySelector(".volumeWrap");
      if (volume?.parentNode) volume.parentNode.insertBefore(box, volume.nextSibling);
      else card.prepend(box);
    }

    if (!$("listenFixedBtn")) {
      const btn = document.createElement("button");
      btn.id = "listenFixedBtn";
      btn.type = "button";
      btn.className = "ghost";
      btn.textContent = "▶ Ouvir gravação";
      btn.disabled = true;
      const actions = card.querySelector(".actions");
      if (actions) {
        const save = $("saveBtn");
        if (save) actions.insertBefore(btn, save);
        else actions.appendChild(btn);
      }
    }

    if (!$("recordDebugMsg")) {
      const debug = document.createElement("div");
      debug.id = "recordDebugMsg";
      debug.className = "msg hidden";
      card.appendChild(debug);
    }
  }

  function setButtons(state) {
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
    if (box) box.classList.remove("hidden");
    if ($("recordTimer")) $("recordTimer").textContent = "00:00";
    if ($("recordTimerLabel")) $("recordTimerLabel").textContent = "Gravando no microfone";

    clearInterval(timerId);
    timerId = setInterval(() => {
      if ($("recordTimer")) $("recordTimer").textContent = fmt(Date.now() - startedAt);
    }, 200);
  }

  function stopTimer() {
    clearInterval(timerId);
    timerId = null;
    if ($("recordTimer")) $("recordTimer").textContent = fmt(duration);
    if ($("recordTimerLabel")) $("recordTimerLabel").textContent = "Gravação finalizada";
  }

  function resetAudio() {
    blob = null;
    duration = 0;
    if (url) {
      try { URL.revokeObjectURL(url); } catch (e) {}
      url = null;
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
    const p = getPhrase();
    const idx = getIndex();
    if ($("category")) $("category").textContent = p.category || "Banco de voz";
    if ($("counter")) $("counter").textContent = `Frase ${idx + 1} de ${getLimit()}`;
    if ($("phraseText")) $("phraseText").textContent = p.text || "";
  }

  async function reloadRecordings() {
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

  async function nextPhrase() {
    const rows = await reloadRecordings();
    const done = new Set(rows.map(r => Number(r.phrase_index)));
    const limit = getLimit();
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

  async function startRecording(ev) {
    ev.preventDefault();
    ev.stopPropagation();
    ev.stopImmediatePropagation();

    try {
      clearMsg();
      resetAudio();

      if (!window.isSecureContext) {
        msg("No iPhone, o microfone só funciona em HTTPS. Use o link da Vercel com https://", false);
        return;
      }

      if (!navigator.mediaDevices?.getUserMedia) {
        msg("Este navegador não liberou getUserMedia. No iPhone use Safari atualizado ou Chrome atualizado.", false);
        return;
      }

      const chosen = chooseMime();
      selectedMime = chosen.mime;
      selectedExt = chosen.ext;

      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      chunks = [];

      recorder = new MediaRecorder(stream, selectedMime ? { mimeType: selectedMime } : undefined);

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunks.push(e.data);
      };

      recorder.onerror = (e) => {
        console.error(e);
        msg("Erro do gravador: " + (e.error?.message || "erro desconhecido"), false);
      };

      recorder.onstop = () => {
        try { stream?.getTracks()?.forEach(t => t.stop()); } catch (e) {}

        duration = Date.now() - startedAt;
        stopTimer();

        const realType = chunks[0]?.type || selectedMime || (isIOS() ? "audio/mp4" : "audio/webm");
        blob = new Blob(chunks, { type: realType });

        if (!blob || blob.size < 100) {
          msg("O áudio ficou vazio. Verifique se o iPhone permitiu o microfone e tente falar por mais tempo.", false);
          setButtons("idle");
          return;
        }

        url = URL.createObjectURL(blob);

        try {
          if (typeof pendingBlob !== "undefined") pendingBlob = blob;
          if (typeof pendingDuration !== "undefined") pendingDuration = duration;
        } catch (e) {}

        const audio = $("audioPreview");
        if (audio) {
          audio.controls = true;
          audio.preload = "metadata";
          audio.src = url;
          audio.load();
        }

        if ($("previewInfo")) {
          $("previewInfo").textContent =
            `Duração: ${Math.round(duration / 1000)}s • Formato: ${blob.type || "padrão"} • Tamanho: ${Math.round(blob.size / 1024)} KB`;
        }

        if ($("previewBox")) $("previewBox").classList.remove("hidden");

        setButtons("ready");
        msg("Áudio capturado. Clique em Ouvir gravação ou Aprovar e avançar.", true);
      };

      recorder.start();
      startTimer();
      setButtons("recording");

      if ($("recordStatus")) {
        $("recordStatus").textContent = "● Gravando...";
        $("recordStatus").classList.remove("hidden");
      }

      msg(`Gravando... Formato escolhido: ${selectedMime || "padrão do navegador"}`, true);
    } catch (e) {
      console.error(e);
      msg("Erro ao iniciar gravação: " + (e.message || "erro"), false);
      setButtons("idle");
    }
  }

  function stopRecording(ev) {
    ev.preventDefault();
    ev.stopPropagation();
    ev.stopImmediatePropagation();

    try {
      if (!recorder || recorder.state === "inactive") {
        msg("Nenhuma gravação em andamento.", false);
        return;
      }

      if ($("recordStatus")) $("recordStatus").classList.add("hidden");

      // iPhone/Safari pode demorar a soltar o último chunk.
      try { recorder.requestData(); } catch (e) {}

      setTimeout(() => {
        try {
          if (recorder && recorder.state !== "inactive") recorder.stop();
        } catch (e) {
          msg("Erro ao parar: " + (e.message || "erro"), false);
        }
      }, isIOS() ? 350 : 120);
    } catch (e) {
      console.error(e);
      msg("Erro ao parar gravação: " + (e.message || "erro"), false);
    }
  }

  function listen(ev) {
    ev.preventDefault();
    ev.stopPropagation();
    ev.stopImmediatePropagation();

    try {
      if (!blob || !url) {
        msg("Nenhum áudio pronto para ouvir.", false);
        return;
      }

      const audio = $("audioPreview");
      if (!audio) {
        const a = new Audio(url);
        a.play().catch(err => msg("Erro ao tocar: " + err.message, false));
        return;
      }

      audio.src = url;
      audio.load();

      const p = audio.play();
      if (p?.catch) {
        p.catch(err => {
          console.error(err);
          msg("O iPhone não conseguiu tocar este formato. Tente gravar novamente. Detalhe: " + (err.message || err.name), false);
        });
      }
    } catch (e) {
      msg("Erro ao ouvir: " + (e.message || "erro"), false);
    }
  }

  function retry(ev) {
    ev.preventDefault();
    ev.stopPropagation();
    ev.stopImmediatePropagation();
    resetAudio();
    clearMsg();
  }

  async function save(ev) {
    ev.preventDefault();
    ev.stopPropagation();
    ev.stopImmediatePropagation();

    try {
      if (!blob) {
        msg("Grave e pare antes de aprovar.", false);
        return;
      }

      if (typeof voziaGetUser === "function") {
        const user = await voziaGetUser();
        if (!user) throw new Error("Usuário não logado.");
      }

      if (typeof voziaUploadVoiceRecording !== "function") {
        throw new Error("Função voziaUploadVoiceRecording não encontrada.");
      }

      const p = getPhrase();
      const idx = getIndex();

      setButtons("saving");
      if ($("saveBtn")) $("saveBtn").textContent = "Salvando...";

      await voziaUploadVoiceRecording({
        phraseIndex: idx,
        phraseCategory: p.category || "Banco de voz",
        phraseText: p.text || "",
        audioBlob: blob,
        durationMs: duration,
        mimeType: blob.type || selectedMime || (isIOS() ? "audio/mp4" : "audio/webm"),
        extension: selectedExt
      });

      msg("Salvo no Supabase. Avançando...", true);
      resetAudio();
      await nextPhrase();
    } catch (e) {
      console.error(e);
      msg("Erro ao salvar: " + (e.message || "erro"), false);
      setButtons("ready");
    } finally {
      if ($("saveBtn")) $("saveBtn").textContent = "✅ Aprovar e avançar";
    }
  }

  function connect() {
    ensureUi();
    renderPhrase();

    const bind = (id, fn) => {
      const el = $(id);
      if (!el || el.dataset.iphoneFix) return;
      el.dataset.iphoneFix = "1";
      el.addEventListener("click", fn, true);
    };

    bind("recordBtn", startRecording);
    bind("stopBtn", stopRecording);
    bind("listenFixedBtn", listen);
    bind("retryBtn", retry);
    bind("saveBtn", save);
  }

  document.addEventListener("DOMContentLoaded", () => {
    connect();
    setTimeout(() => {
      connect();
      reloadRecordings().then(nextPhrase).catch(() => {});
    }, 700);
  });

  document.addEventListener("click", () => setTimeout(connect, 80), true);

  window.voziaIphoneAudioFix = { connect, chooseMime, isIOS };
})();
