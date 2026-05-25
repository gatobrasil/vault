// ============================================================
// VOZIA VAULT — PROTOCOLO FLEXÍVEL
// Permite gravar mensagem de legado sem concluir todas as frases.
// Versão V8.13
// ============================================================

(function () {
  function $(id) { return document.getElementById(id); }

  function doneCount() {
    try {
      if (typeof recordings !== "undefined") {
        return Object.keys(recordings || {}).filter(i => Number(i) < phraseLimitSafe()).length;
      }
    } catch (e) {}
    return 0;
  }

  function phraseLimitSafe() {
    try {
      if (typeof phraseLimit === "function") return phraseLimit();
    } catch (e) {}
    try {
      if (currentUser?.limits?.phrases) return currentUser.limits.phrases;
    } catch (e) {}
    return 100;
  }

  function legacyCount() {
    try {
      if (typeof legacyMessages !== "undefined" && Array.isArray(legacyMessages)) return legacyMessages.length;
    } catch (e) {}
    return 0;
  }

  function careCount() {
    try {
      if (typeof careAppRequests !== "undefined" && Array.isArray(careAppRequests)) return careAppRequests.length;
    } catch (e) {}
    return 0;
  }

  function hideProtocolSections() {
    $("checklistCard")?.classList.add("hidden");
    $("recorder")?.classList.add("hidden");
    $("legacySection")?.classList.add("hidden");
    $("voziaCareRequestBox")?.classList.add("hidden");
    $("completeBox")?.classList.add("hidden");
  }

  function openVoiceBank() {
    hideProtocolSections();
    $("checklistCard")?.classList.remove("hidden");
    setTimeout(() => $("checklistCard")?.scrollIntoView({ behavior: "smooth", block: "start" }), 80);
    renderFlexibleProtocolState();
  }

  function openLegacyMessage() {
    hideProtocolSections();
    $("legacySection")?.classList.remove("hidden");
    setTimeout(() => $("legacySection")?.scrollIntoView({ behavior: "smooth", block: "start" }), 80);
    renderFlexibleProtocolState();
  }

  function openCareRequest() {
    hideProtocolSections();
    $("voziaCareRequestBox")?.classList.remove("hidden");
    setTimeout(() => $("voziaCareRequestBox")?.scrollIntoView({ behavior: "smooth", block: "start" }), 80);
    renderFlexibleProtocolState();
  }

  function setStep(id, status) {
    const el = $(id);
    if (!el) return;
    el.classList.remove("stepDone", "stepActive", "stepLocked", "stepOptional");
    if (status) el.classList.add(status);
  }

  function renderFlexibleProtocolState() {
    const done = doneCount();
    const limit = phraseLimitSafe();
    const voiceStarted = done > 0;
    const voiceComplete = done >= limit;
    const hasLegacy = legacyCount() > 0;
    const hasCare = careCount() > 0;

    const next = $("protocolNextText");
    const btn = $("startProtocolBtn");

    setStep("stepConsent", "stepDone");

    if (voiceComplete) setStep("stepVoice", "stepDone");
    else if (voiceStarted) setStep("stepVoice", "stepOptional");
    else setStep("stepVoice", "stepActive");

    if (hasLegacy) setStep("stepLegacy", "stepDone");
    else setStep("stepLegacy", "stepActive");

    if (hasCare) setStep("stepCare", "stepDone");
    else setStep("stepCare", hasLegacy ? "stepActive" : "stepOptional");

    if (next) {
      if (!hasLegacy) {
        next.innerHTML =
          `<b>Fluxo flexível:</b> o paciente pode gravar o Banco de Voz completo ou ir direto para uma mensagem de legado. ` +
          `Banco de voz atual: ${done}/${limit} frases. Para casos urgentes, como doença avançada, priorize a mensagem para família.`;
      } else if (!hasCare) {
        next.innerHTML =
          `<b>Mensagem de legado registrada.</b> Agora, se desejar, solicite o Vozia Care. ` +
          `O Banco de Voz pode ser completado depois.`;
      } else {
        next.innerHTML =
          `<b>Protocolo essencial concluído.</b> Mensagem registrada e Vozia Care solicitado. ` +
          `O Banco de Voz pode ser ampliado quando o paciente conseguir.`;
      }
    }

    if (btn) {
      if (!hasLegacy) btn.textContent = "Continuar protocolo";
      else if (!hasCare) btn.textContent = "Pedir Vozia Care";
      else btn.textContent = "Protocolo essencial concluído";
    }
  }

  function startFlexibleProtocol(ev) {
    if (ev) {
      ev.preventDefault();
      ev.stopPropagation();
      ev.stopImmediatePropagation();
    }

    try {
      if (typeof currentUser !== "undefined" && !currentUser) {
        if (typeof openAuth === "function") openAuth();
        return;
      }
    } catch (e) {}

    if (legacyCount() === 0) {
      openLegacyChoice();
      return;
    }

    if (careCount() === 0) {
      openCareRequest();
      return;
    }

    hideProtocolSections();
    $("completeBox")?.classList.remove("hidden");
    setTimeout(() => $("completeBox")?.scrollIntoView({ behavior: "smooth", block: "start" }), 80);
    renderFlexibleProtocolState();
  }

  function openLegacyChoice() {
    hideProtocolSections();

    let box = $("protocolChoiceBox");
    if (!box) {
      box = document.createElement("section");
      box.id = "protocolChoiceBox";
      box.className = "card protocolChoiceBox";
      box.innerHTML = `
        <h2>Escolha a prioridade do paciente</h2>
        <p class="small">
          Nem todo paciente precisa completar 100 frases antes de deixar uma mensagem.
          Em casos urgentes, como câncer avançado, doença terminal ou perda progressiva da voz,
          a prioridade pode ser gravar um recado para família.
        </p>
        <div class="choiceGrid">
          <button id="choiceLegacyBtn" type="button" class="green">
            Gravar mensagem para família agora
          </button>
          <button id="choiceVoiceBtn" type="button" class="ghost">
            Continuar Banco de Voz
          </button>
        </div>
      `;

      const protocolCard = document.querySelector(".protocoloPacienteCard");
      if (protocolCard && protocolCard.parentNode) {
        protocolCard.parentNode.insertBefore(box, protocolCard.nextSibling);
      } else {
        document.querySelector("main")?.prepend(box);
      }

      $("choiceLegacyBtn")?.addEventListener("click", openLegacyMessage);
      $("choiceVoiceBtn")?.addEventListener("click", openVoiceBank);
    }

    box.classList.remove("hidden");
    setTimeout(() => box.scrollIntoView({ behavior: "smooth", block: "start" }), 80);
    renderFlexibleProtocolState();
  }

  function addQuickButtons() {
    const actionBox = $("protocolActionBox");
    if (!actionBox || $("quickLegacyBtn")) return;

    const wrap = document.createElement("div");
    wrap.className = "protocolQuickActions";
    wrap.innerHTML = `
      <button id="quickLegacyBtn" type="button" class="green">Gravar recado familiar agora</button>
      <button id="quickVoiceBtn" type="button" class="ghost">Banco de Voz</button>
    `;

    actionBox.appendChild(wrap);

    $("quickLegacyBtn")?.addEventListener("click", openLegacyMessage);
    $("quickVoiceBtn")?.addEventListener("click", openVoiceBank);
  }

  function connect() {
    addQuickButtons();

    const startBtn = $("startProtocolBtn");
    if (startBtn && !startBtn.dataset.flexProtocol) {
      startBtn.dataset.flexProtocol = "1";
      startBtn.addEventListener("click", startFlexibleProtocol, true);
    }

    renderFlexibleProtocolState();
  }

  document.addEventListener("DOMContentLoaded", () => {
    setTimeout(connect, 500);
    setTimeout(connect, 1200);
  });

  document.addEventListener("click", () => setTimeout(connect, 80), true);

  window.voziaFlexibleProtocol = {
    connect,
    openLegacyMessage,
    openVoiceBank,
    openCareRequest,
    renderFlexibleProtocolState
  };
})();
