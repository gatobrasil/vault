// ============================================================
// VOZIA VAULT — GRAVAÇÃO FINAL CORRIGIDA
// Versão: V8.10
//
// Corrige:
// - Cronômetro durante gravação
// - Player/escuta após parar
// - Salvamento no Supabase por usuário
// - Avançar para próxima frase sem depender de /api
// - Estado local sincronizado com Supabase
// ============================================================

(function () {
  let recorder = null;
  let stream = null;
  let chunks = [];
  let startedAt = 0;
  let timerInterval = null;
  let audioUrl = null;
  let audioBlob = null;
  let audioDuration = 0;
  let audioReady = false;

  function $(id) {
    return document.getElementById(id);
  }

  function getPhraseLimitSafe() {
    try {
      if (typeof phraseLimit === "function") return phraseLimit();
    } catch (e) {}

    try {
      if (typeof currentUser !== "undefined" && currentUser?.limits?.phrases) {
        return currentUser.limits.phrases;
      }
    } catch (e) {}

    return 100;
  }

  function getCurrentIndexSafe() {
    try {
      if (typeof currentIndex !== "undefined") return Number(currentIndex || 0);
    } catch (e) {}
    const local = Number(localStorage.getItem("vozia_current_phrase") || "0");
    return Number.isFinite(local) ? local : 0;
  }

  function setCurrentIndexSafe(value) {
    const next = Math.max(0, Number(value || 0));

    try {
      if (typeof currentIndex !== "undefined") {
        currentIndex = next;
      }
    } catch (e) {}

    localStorage.setItem("vozia_current_phrase", String(next));
  }

  function getPhraseSafe() {
    const idx = getCurrentIndexSafe();

    try {
      if (typeof phrases !== "undefined" && phrases[idx]) return phrases[idx];
      if (typeof phrases !== "undefined" && phrases[0]) return phrases[0];
    } catch (e) {}

    return {
      category: "Banco de voz",
      text: "Frase de teste do banco de voz."
    };
  }

  function formatTime(ms) {
    const total = Math.max(0, Math.floor(ms / 1000));
    const min = String(Math.floor(total / 60)).padStart(2, "0");
    const sec = String(total % 60).padStart(2, "0");
    return `${min}:${sec}`;
  }

  function qualityText(ms) {
    try {
      if (typeof qualityNote === "function") return qualityNote(ms);
    } catch (e) {}

    if (!ms) return "Duração não informada.";
    if (ms < 900) return "Áudio muito curto. Regrave se a frase não ficou completa.";
    if (ms > 16000) return "Áudio longo. Verifique pausas e ruídos.";
    return "Boa duração.";
  }

  function ensureTimerBox() {
    const phraseCard = document.querySelector(".phraseCard");
    if (!phraseCard) return null;

    let box = $("recordTimerBox");
    if (!box) {
      box = document.createElement("div");
      box.id = "recordTimerBox";
      box.className = "recordTimerBox hidden";
      box.innerHTML = `
        <div class="recordPulse"></div>
        <div>
          <b id="recordTimer">00:00</b>
          <span id="recordTimerLabel">Gravação em andamento</span>
        </div>
      `;

      const volume = document.querySelector(".volumeWrap");
      if (volume && volume.parentNode) {
        volume.parentNode.insertBefore(box, volume.nextSibling);
      } else {
        phraseCard.prepend(box);
      }
    }

    return box;
  }

  function setTimerVisible(visible) {
    ensureTimerBox();
    const box = $("recordTimerBox");
    if (box) box.classList.toggle("hidden", !visible);
  }

  function startTimer() {
    startedAt = Date.now();
    setTimerVisible(true);

    const timer = $("recordTimer");
    const label = $("recordTimerLabel");

    if (timer) timer.textContent = "00:00";
    if (label) label.textContent = "Gravação em andamento";

    clearInterval(timerInterval);
    timerInterval = setInterval(() => {
      const t = $("recordTimer");
      if (t) t.textContent = formatTime(Date.now() - startedAt);
    }, 200);
  }

  function stopTimer(finalMs) {
    clearInterval(timerInterval);
    timerInterval = null;

    const timer = $("recordTimer");
    const label = $("recordTimerLabel");

    if (timer) timer.textContent = formatTime(finalMs);
    if (label) label.textContent = "Gravação finalizada";
  }

  function resetPreview() {
    audioReady = false;
    audioBlob = null;
    audioDuration = 0;

    if (audioUrl) {
      try { URL.revokeObjectURL(audioUrl); } catch (e) {}
      audioUrl = null;
    }

    try {
      if (typeof pendingBlob !== "undefined") pendingBlob = null;
      if (typeof pendingDuration !== "undefined") pendingDuration = 0;
    } catch (e) {}

    const preview = $("previewBox");
    const info = $("previewInfo");
    const audio = $("audioPreview");

    if (preview) preview.classList.add("hidden");
    if (info) info.textContent = "";

    if (audio) {
      audio.pause();
      audio.removeAttribute("src");
      audio.load();
    }

    if ($("saveBtn")) $("saveBtn").disabled = true;
    if ($("retryBtn")) $("retryBtn").disabled = true;
  }

  function setButtonsRecording(isRecording) {
    if ($("recordBtn")) $("recordBtn").disabled = isRecording;
    if ($("stopBtn")) $("stopBtn").disabled = !isRecording;
    if ($("pauseBtn")) $("pauseBtn").disabled = true;
    if ($("resumeBtn")) $("resumeBtn").classList.add("hidden");
    if ($("pauseBtn")) $("pauseBtn").classList.remove("hidden");
  }

  function showStatus(text, show = true) {
    const status = $("recordStatus");
    if (!status) return;
    status.textContent = text;
    status.classList.toggle("hidden", !show);
  }

  function renderPhraseHeaderSafe() {
    const idx = getCurrentIndexSafe();
    const limit = getPhraseLimitSafe();
    const p = getPhraseSafe();

    if ($("category")) $("category").textContent = p.category || "Banco de voz";
    if ($("counter")) $("counter").textContent = `Frase ${idx + 1} de ${limit}`;
    if ($("phraseText")) $("phraseText").textContent = p.text || "Frase de teste do banco de voz.";
  }

  function markMapActiveSafe() {
    const idx = getCurrentIndexSafe();
    document.querySelectorAll(".dot").forEach((btn) => {
      const i = Number(btn.dataset.i);
      btn.classList.toggle("active", i === idx);
    });
  }

  function syncRecordingsObject(rows) {
    try {
      if (typeof recordings !== "undefined") {
        recordings = {};
        (rows || []).forEach((r) => {
          recordings[r.phrase_index] = r;
        });
      }
    } catch (e) {}
  }

  async function loadRecordingsFromSupabaseSafe() {
    if (typeof voziaListRecordings !== "function") return [];

    const rows = await voziaListRecordings();
    syncRecordingsObject(rows);

    const limit = getPhraseLimitSafe();
    const done = (rows || []).filter(r => Number(r.phrase_index) < limit).length;
    const pct = Math.round((done / limit) * 100);

    if ($("doneCount")) $("doneCount").textContent = done;
    if ($("percent")) $("percent").textContent = pct + "%";
    if ($("bar")) $("bar").style.width = pct + "%";

    return rows || [];
  }

  async function findNextPhraseIndex() {
    const limit = getPhraseLimitSafe();
    let rows = [];

    try {
      rows = await loadRecordingsFromSupabaseSafe();
    } catch (e) {
      console.warn("Não consegui recarregar gravações do Supabase:", e);
    }

    const doneSet = new Set((rows || []).map(r => Number(r.phrase_index)));

    for (let i = 0; i < limit; i++) {
      if (!doneSet.has(i)) return i;
    }

    return Math.max(0, limit - 1);
  }

  async function refreshAfterSave() {
    const next = await findNextPhraseIndex();
    setCurrentIndexSafe(next);

    try {
      if (typeof pickNext === "function") {
        // Evita pickNext antigo com estado desatualizado: só usamos se recordings foi sincronizado.
        pickNext();
      }
    } catch (e) {}

    renderPhraseHeaderSafe();
    markMapActiveSafe();

    try {
      if (typeof renderMap === "function") renderMap();
    } catch (e) {}

    try {
      if (typeof renderProtocolState === "function") renderProtocolState();
    } catch (e) {}
  }

  async function startRecording(ev) {
    ev.preventDefault();
    ev.stopPropagation();
    ev.stopImmediatePropagation();

    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        alert("Microfone não disponível. Use Chrome/Edge e acesse por HTTPS ou localhost.");
        return;
      }

      resetPreview();
      chunks = [];

      stream = await navigator.mediaDevices.getUserMedia({ audio: true });

      let options = {};
      if (window.MediaRecorder && MediaRecorder.isTypeSupported("audio/webm;codecs=opus")) {
        options.mimeType = "audio/webm;codecs=opus";
      } else if (window.MediaRecorder && MediaRecorder.isTypeSupported("audio/webm")) {
        options.mimeType = "audio/webm";
      }

      recorder = new MediaRecorder(stream, options);

      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) chunks.push(event.data);
      };

      recorder.onerror = (event) => {
        console.error("MediaRecorder error", event);
        alert("Erro durante gravação. Tente novamente.");
      };

      recorder.onstop = () => {
        try {
          stream?.getTracks()?.forEach(track => track.stop());
        } catch (e) {}

        audioDuration = Date.now() - startedAt;
        stopTimer(audioDuration);
        showStatus("", false);

        const type = chunks[0]?.type || options.mimeType || "audio/webm";
        audioBlob = new Blob(chunks, { type });

        if (!audioBlob || audioBlob.size < 200) {
          alert("O áudio ficou vazio ou muito curto. Tente gravar novamente.");
          setButtonsRecording(false);
          return;
        }

        try {
          if (typeof pendingBlob !== "undefined") pendingBlob = audioBlob;
          if (typeof pendingDuration !== "undefined") pendingDuration = audioDuration;
        } catch (e) {}

        audioUrl = URL.createObjectURL(audioBlob);
        audioReady = true;

        const audio = $("audioPreview");
        const preview = $("previewBox");
        const info = $("previewInfo");

        if (audio) {
          audio.controls = true;
          audio.src = audioUrl;
          audio.load();

          audio.oncanplay = () => {
            audioReady = true;
          };

          audio.onerror = () => {
            console.warn("Erro no player local. Recriando URL...");
            try {
              audioUrl = URL.createObjectURL(audioBlob);
              audio.src = audioUrl;
              audio.load();
            } catch (e) {
              console.error(e);
            }
          };
        }

        if (info) {
          const seconds = Math.round(audioDuration / 1000);
          const kb = Math.round(audioBlob.size / 1024);
          info.textContent = `Duração: ${seconds}s • Tamanho: ${kb} KB • ${qualityText(audioDuration)}`;
        }

        if (preview) preview.classList.remove("hidden");
        if ($("saveBtn")) $("saveBtn").disabled = false;
        if ($("retryBtn")) $("retryBtn").disabled = false;

        setButtonsRecording(false);
      };

      recorder.start(250);
      showStatus("● Gravando...", true);
      startTimer();
      setButtonsRecording(true);
    } catch (e) {
      console.error(e);
      alert("Não foi possível acessar o microfone. Verifique a permissão do navegador.");
      setButtonsRecording(false);
      showStatus("", false);
      stopTimer(0);
    }
  }

  function stopRecording(ev) {
    ev.preventDefault();
    ev.stopPropagation();
    ev.stopImmediatePropagation();

    try {
      if (recorder && recorder.state !== "inactive") {
        recorder.stop();
        return;
      }

      alert("Nenhuma gravação em andamento.");
    } catch (e) {
      console.error(e);
      alert("Erro ao parar gravação.");
    }
  }

  function playRecording(ev) {
    // Captura clique no player para impedir listener antigo se houver.
    const target = ev.target;
    if (!target || target.id !== "audioPreview") return;

    if (!audioBlob || !audioUrl) return;

    try {
      target.src = audioUrl;
    } catch (e) {}
  }

  function retryRecording(ev) {
    ev.preventDefault();
    ev.stopPropagation();
    ev.stopImmediatePropagation();

    resetPreview();
    setTimerVisible(false);
  }

  async function saveRecording(ev) {
    ev.preventDefault();
    ev.stopPropagation();
    ev.stopImmediatePropagation();

    try {
      if (!audioBlob || !audioReady) {
        alert("Grave e pare a gravação antes de aprovar.");
        return;
      }

      if (typeof voziaGetUser === "function") {
        const user = await voziaGetUser();
        if (!user) {
          alert("Você precisa estar logado para salvar a gravação.");
          return;
        }
      }

      const idx = getCurrentIndexSafe();
      const p = getPhraseSafe();

      const saveBtn = $("saveBtn");
      if (saveBtn) {
        saveBtn.disabled = true;
        saveBtn.textContent = "Salvando no Supabase...";
      }

      if (typeof voziaUploadVoiceRecording !== "function") {
        throw new Error("Função voziaUploadVoiceRecording não encontrada. Verifique supabase-api.js.");
      }

      await voziaUploadVoiceRecording({
        phraseIndex: idx,
        phraseCategory: p.category || "Banco de voz",
        phraseText: p.text || "",
        audioBlob,
        durationMs: audioDuration
      });

      resetPreview();

      await refreshAfterSave();

      alert("Gravação salva. Avançando para a próxima frase.");

      const sb = $("saveBtn");
      if (sb) sb.textContent = "✅ Aprovar e avançar";
    } catch (e) {
      console.error(e);
      alert(e.message || "Erro ao salvar gravação no Supabase.");
    } finally {
      const saveBtn = $("saveBtn");
      if (saveBtn) {
        saveBtn.textContent = "✅ Aprovar e avançar";
        saveBtn.disabled = !audioBlob;
      }
    }
  }

  function connectFixedRecorder() {
    ensureTimerBox();
    renderPhraseHeaderSafe();

    const recordBtn = $("recordBtn");
    const stopBtn = $("stopBtn");
    const retryBtn = $("retryBtn");
    const saveBtn = $("saveBtn");
    const audio = $("audioPreview");

    if (recordBtn && !recordBtn.dataset.voziaFinalFix) {
      recordBtn.dataset.voziaFinalFix = "1";
      recordBtn.addEventListener("click", startRecording, true);
    }

    if (stopBtn && !stopBtn.dataset.voziaFinalFix) {
      stopBtn.dataset.voziaFinalFix = "1";
      stopBtn.addEventListener("click", stopRecording, true);
    }

    if (retryBtn && !retryBtn.dataset.voziaFinalFix) {
      retryBtn.dataset.voziaFinalFix = "1";
      retryBtn.addEventListener("click", retryRecording, true);
    }

    if (saveBtn && !saveBtn.dataset.voziaFinalFix) {
      saveBtn.dataset.voziaFinalFix = "1";
      saveBtn.addEventListener("click", saveRecording, true);
    }

    if (audio && !audio.dataset.voziaFinalFix) {
      audio.dataset.voziaFinalFix = "1";
      audio.addEventListener("play", playRecording, true);
    }
  }

  document.addEventListener("DOMContentLoaded", () => {
    connectFixedRecorder();
    setTimeout(async () => {
      try {
        await loadRecordingsFromSupabaseSafe();
        await refreshAfterSave();
      } catch (e) {}
    }, 700);
  });

  document.addEventListener("click", () => {
    setTimeout(connectFixedRecorder, 60);
  }, true);

  window.voziaRecorderFinalFix = {
    connect: connectFixedRecorder,
    reload: refreshAfterSave
  };
})();
