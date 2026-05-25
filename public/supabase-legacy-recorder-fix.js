// ============================================================
// VOZIA VAULT — LEGADO / MENSAGEM PARA FAMÍLIA FIX
// Versão V8.14
//
// Corrige a etapa 3:
// - Gravação de mensagem para família usando o mesmo padrão do Banco de Voz.
// - Compatível com iPhone/Safari: prefere audio/mp4 quando suportado.
// - Mostra cronômetro.
// - Permite ouvir antes de salvar.
// - Salva no Supabase em legacy_messages + Storage.
// ============================================================

(function () {
  let recorder = null;
  let stream = null;
  let chunks = [];
  let startedAt = 0;
  let timerId = null;
  let legacyBlob = null;
  let legacyUrl = null;
  let legacyDuration = 0;
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

  function fmt(ms) {
    const total = Math.max(0, Math.floor(ms / 1000));
    return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
  }

  function ensureLegacyUi() {
    const legacy = $("legacySection");
    if (!legacy) return;

    let box = $("legacyTimerBox");
    if (!box) {
      box = document.createElement("div");
      box.id = "legacyTimerBox";
      box.className = "recordTimerBox hidden";
      box.innerHTML = `
        <div class="recordPulse"></div>
        <div>
          <b id="legacyTimer">00:00</b>
          <span id="legacyTimerLabel">Pronto para gravar a mensagem</span>
        </div>
      `;

      const recBtn = $("legacyRecordBtn");
      if (recBtn && recBtn.parentNode) {
        recBtn.parentNode.parentNode.insertBefore(box, recBtn.parentNode.nextSibling);
      } else {
        legacy.appendChild(box);
      }
    }

    let listen = $("legacyListenBtn");
    if (!listen) {
      listen = document.createElement("button");
      listen.id = "legacyListenBtn";
      listen.type = "button";
      listen.className = "ghost";
      listen.textContent = "▶ Ouvir mensagem";
      listen.disabled = true;

      const save = $("legacySaveBtn");
      if (save && save.parentNode) {
        save.parentNode.insertBefore(listen, save);
      } else {
        legacy.appendChild(listen);
      }
    }

    if (!$("legacyDebugMsg")) {
      const msg = document.createElement("div");
      msg.id = "legacyDebugMsg";
      msg.className = "msg hidden";
      legacy.appendChild(msg);
    }
  }

  function showMsg(text, ok = false) {
    ensureLegacyUi();
    const el = $("legacyDebugMsg");
    if (!el) return;

    el.textContent = text;
    el.className = "msg" + (ok ? " ok" : "");
    el.classList.remove("hidden");
    el.style.display = "block";
  }

  function clearMsg() {
    const el = $("legacyDebugMsg");
    if (!el) return;
    el.classList.add("hidden");
    el.style.display = "none";
  }

  function setButtons(state) {
    const recording = state === "recording";
    const ready = state === "ready";
    const saving = state === "saving";

    if ($("legacyRecordBtn")) $("legacyRecordBtn").disabled = recording || saving;
    if ($("legacyStopBtn")) $("legacyStopBtn").disabled = !recording;
    if ($("legacyListenBtn")) $("legacyListenBtn").disabled = !ready || saving;
    if ($("legacySaveBtn")) $("legacySaveBtn").disabled = !ready || saving;
  }

  function startTimer() {
    startedAt = Date.now();
    const box = $("legacyTimerBox");
    if (box) box.classList.remove("hidden");

    if ($("legacyTimer")) $("legacyTimer").textContent = "00:00";
    if ($("legacyTimerLabel")) $("legacyTimerLabel").textContent = "Gravando mensagem para família";

    clearInterval(timerId);
    timerId = setInterval(() => {
      if ($("legacyTimer")) $("legacyTimer").textContent = fmt(Date.now() - startedAt);
    }, 200);
  }

  function stopTimer() {
    clearInterval(timerId);
    timerId = null;

    if ($("legacyTimer")) $("legacyTimer").textContent = fmt(legacyDuration);
    if ($("legacyTimerLabel")) $("legacyTimerLabel").textContent = "Mensagem gravada";
  }

  function resetLegacyAudio() {
    legacyBlob = null;
    legacyDuration = 0;

    if (legacyUrl) {
      try { URL.revokeObjectURL(legacyUrl); } catch (e) {}
      legacyUrl = null;
    }

    try {
      if (typeof legacyBlobPending !== "undefined") legacyBlobPending = null;
      if (typeof legacyDurationPending !== "undefined") legacyDurationPending = 0;
    } catch (e) {}

    const audio = $("legacyPreview");
    if (audio) {
      audio.pause();
      audio.removeAttribute("src");
      audio.load();
    }

    setButtons("idle");
  }

  async function startLegacyRecording(ev) {
    ev.preventDefault();
    ev.stopPropagation();
    ev.stopImmediatePropagation();

    try {
      clearMsg();
      resetLegacyAudio();

      if (!window.isSecureContext) {
        showMsg("No iPhone, o microfone só funciona em HTTPS. Use o link da Vercel com https://");
        return;
      }

      if (!navigator.mediaDevices?.getUserMedia) {
        showMsg("Este navegador não liberou o microfone. Use Safari/Chrome atualizado e permita o microfone.");
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
        showMsg("Erro do gravador: " + (e.error?.message || "erro desconhecido"));
      };

      recorder.onstop = () => {
        try { stream?.getTracks()?.forEach(t => t.stop()); } catch (e) {}

        legacyDuration = Date.now() - startedAt;
        stopTimer();

        const realType = chunks[0]?.type || selectedMime || (isIOS() ? "audio/mp4" : "audio/webm");
        legacyBlob = new Blob(chunks, { type: realType });

        if (!legacyBlob || legacyBlob.size < 100) {
          showMsg("A mensagem ficou vazia. Verifique a permissão do microfone e tente falar por mais tempo.");
          setButtons("idle");
          return;
        }

        legacyUrl = URL.createObjectURL(legacyBlob);

        try {
          if (typeof legacyBlobPending !== "undefined") legacyBlobPending = legacyBlob;
          if (typeof legacyDurationPending !== "undefined") legacyDurationPending = legacyDuration;
        } catch (e) {}

        const audio = $("legacyPreview");
        if (audio) {
          audio.controls = true;
          audio.preload = "metadata";
          audio.src = legacyUrl;
          audio.load();
        }

        setButtons("ready");

        showMsg(
          `Mensagem capturada. Duração: ${Math.round(legacyDuration / 1000)}s • Formato: ${legacyBlob.type || "padrão"} • Tamanho: ${Math.round(legacyBlob.size / 1024)} KB`,
          true
        );
      };

      recorder.start();
      startTimer();
      setButtons("recording");
      showMsg(`Gravando mensagem... Formato escolhido: ${selectedMime || "padrão do navegador"}`, true);
    } catch (e) {
      console.error(e);
      showMsg("Erro ao iniciar gravação da mensagem: " + (e.message || "erro"));
      setButtons("idle");
    }
  }

  function stopLegacyRecording(ev) {
    ev.preventDefault();
    ev.stopPropagation();
    ev.stopImmediatePropagation();

    try {
      if (!recorder || recorder.state === "inactive") {
        showMsg("Nenhuma mensagem em gravação.");
        return;
      }

      try { recorder.requestData(); } catch (e) {}

      setTimeout(() => {
        try {
          if (recorder && recorder.state !== "inactive") recorder.stop();
        } catch (e) {
          showMsg("Erro ao parar gravação: " + (e.message || "erro"));
        }
      }, isIOS() ? 350 : 120);
    } catch (e) {
      showMsg("Erro ao parar gravação: " + (e.message || "erro"));
    }
  }

  function listenLegacy(ev) {
    ev.preventDefault();
    ev.stopPropagation();
    ev.stopImmediatePropagation();

    try {
      if (!legacyBlob || !legacyUrl) {
        showMsg("Nenhuma mensagem pronta para ouvir. Grave e pare primeiro.");
        return;
      }

      const audio = $("legacyPreview");
      if (!audio) {
        const a = new Audio(legacyUrl);
        a.play().catch(err => showMsg("Erro ao tocar: " + err.message));
        return;
      }

      audio.src = legacyUrl;
      audio.load();

      const p = audio.play();
      if (p?.catch) {
        p.catch(err => {
          console.error(err);
          showMsg("O navegador não conseguiu tocar esse formato. Tente gravar novamente. Detalhe: " + (err.message || err.name));
        });
      }
    } catch (e) {
      showMsg("Erro ao ouvir mensagem: " + (e.message || "erro"));
    }
  }

  function getValue(id, fallback = "") {
    const el = $(id);
    return el ? (el.value || "").trim() : fallback;
  }

  async function saveLegacy(ev) {
    ev.preventDefault();
    ev.stopPropagation();
    ev.stopImmediatePropagation();

    try {
      if (!legacyBlob) {
        showMsg("Grave e pare a mensagem antes de salvar.");
        return;
      }

      if (typeof voziaGetUser === "function") {
        const user = await voziaGetUser();
        if (!user) throw new Error("Usuário não logado.");
      }

      if (typeof voziaSaveLegacyMessage !== "function") {
        throw new Error("Função voziaSaveLegacyMessage não encontrada no supabase-api.js.");
      }

      const title = getValue("legacyTitle", "Mensagem para família");
      const recipient = getValue("legacyRecipient", "Família");
      const note = getValue("legacyNote", "");

      if ($("legacySaveBtn")) {
        $("legacySaveBtn").disabled = true;
        $("legacySaveBtn").textContent = "Salvando...";
      }

      await voziaSaveLegacyMessage({
        title,
        recipient,
        note,
        isPriority: true,
        audioBlob: legacyBlob,
        durationMs: legacyDuration,
        mimeType: legacyBlob.type || selectedMime || (isIOS() ? "audio/mp4" : "audio/webm"),
        extension: selectedExt
      });

      showMsg("Mensagem de legado salva com sucesso.", true);

      resetLegacyAudio();

      try {
        if (typeof loadLegacyMessages === "function") await loadLegacyMessages();
      } catch (e) {}

      try {
        if (typeof renderProtocolState === "function") renderProtocolState();
      } catch (e) {}

      try {
        if (window.voziaFlexibleProtocol?.renderFlexibleProtocolState) {
          window.voziaFlexibleProtocol.renderFlexibleProtocolState();
        }
      } catch (e) {}

      if ($("legacySaveBtn")) $("legacySaveBtn").textContent = "Salvar mensagem";
    } catch (e) {
      console.error(e);
      showMsg("Erro ao salvar mensagem: " + (e.message || "erro"));
      setButtons("ready");
    } finally {
      if ($("legacySaveBtn")) {
        $("legacySaveBtn").textContent = "Salvar mensagem";
      }
    }
  }

  function connectLegacyFix() {
    ensureLegacyUi();

    const rec = $("legacyRecordBtn");
    const stop = $("legacyStopBtn");
    const listen = $("legacyListenBtn");
    const save = $("legacySaveBtn");

    if (rec && !rec.dataset.legacyFixV814) {
      rec.dataset.legacyFixV814 = "1";
      rec.addEventListener("click", startLegacyRecording, true);
    }

    if (stop && !stop.dataset.legacyFixV814) {
      stop.dataset.legacyFixV814 = "1";
      stop.addEventListener("click", stopLegacyRecording, true);
    }

    if (listen && !listen.dataset.legacyFixV814) {
      listen.dataset.legacyFixV814 = "1";
      listen.addEventListener("click", listenLegacy, true);
    }

    if (save && !save.dataset.legacyFixV814) {
      save.dataset.legacyFixV814 = "1";
      save.addEventListener("click", saveLegacy, true);
    }
  }

  document.addEventListener("DOMContentLoaded", () => {
    setTimeout(connectLegacyFix, 500);
    setTimeout(connectLegacyFix, 1200);
  });

  document.addEventListener("click", () => setTimeout(connectLegacyFix, 80), true);

  window.voziaLegacyRecorderFix = {
    connect: connectLegacyFix
  };
})();
