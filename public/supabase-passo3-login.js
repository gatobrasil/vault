// ============================================================
// VOZIA VAULT — PASSO 3 MANUAL
// Cadastro, login e logout usando Supabase
// Coloque este arquivo em public/supabase-passo3-login.js
// E carregue DEPOIS do app.js no index.html.
// ============================================================

(function () {
  function $(id) {
    return document.getElementById(id);
  }

  function msg(id, text, ok = false) {
    const el = $(id);
    if (!el) return;
    el.textContent = text;
    el.className = "msg" + (ok ? " ok" : "");
    el.style.display = "block";
  }

  function hideMsg(id) {
    const el = $(id);
    if (el) el.style.display = "none";
  }

  function planoLabel(plan) {
    if (plan === "vitalicio") return "Vitalício";
    if (plan === "anual") return "Anual";
    return "Avaliação";
  }

  function limitesPlano(plan) {
    if (plan === "vitalicio") {
      return { label: "Vitalício", phrases: 100, legacy: 999, policy: "Plano vitalício com mensagens ampliadas." };
    }

    if (plan === "anual") {
      return { label: "Anual", phrases: 100, legacy: 5, policy: "Plano anual com 100 frases e 5 mensagens de legado." };
    }

    return { label: "Avaliação", phrases: 10, legacy: 1, policy: "Plano avaliação com 10 frases e 1 mensagem de legado." };
  }

  async function carregarPacienteSupabase() {
    if (typeof voziaGetUser !== "function" || typeof voziaLoadProfile !== "function") {
      console.warn("Supabase API não carregada.");
      return null;
    }

    const user = await voziaGetUser();
    if (!user) return null;

    let profile = await voziaLoadProfile();

    if (!profile) return null;

    const plan = profile.plan || "avaliacao";
    const limits = limitesPlano(plan);

    const paciente = {
      id: profile.id,
      name: profile.name || user.email,
      email: profile.email || user.email,
      plan,
      limits,
      vault_id: profile.vault_id || "VOZIA",
      accepted_terms_at: profile.accepted_terms_at,
      created_at: profile.created_at || new Date().toISOString(),
      subscription_status: profile.subscription_status || "ativo",
      plan_expires_at: profile.plan_expires_at,
      annual_review_status: profile.annual_review_status || "pendente",
      annual_review_last_at: profile.annual_review_last_at,
      annual_review_note: profile.annual_review_note,
      expired: false
    };

    return paciente;
  }

  async function entrarNoPainelSupabase() {
    const paciente = await carregarPacienteSupabase();
    if (!paciente) return;

    // Tenta usar as variáveis globais do app.js original, se existirem.
    try {
      window.currentUser = paciente;
      if (typeof currentUser !== "undefined") currentUser = paciente;
    } catch (e) {}

    const landing = $("landing");
    const auth = $("auth");
    const app = $("app");
    const logoutBtn = $("logoutBtn");
    const dataBtn = $("dataBtn");

    if (landing) landing.classList.add("hidden");
    if (auth) auth.classList.add("hidden");
    if (app) app.classList.remove("hidden");
    if (logoutBtn) logoutBtn.classList.remove("hidden");
    if (dataBtn) dataBtn.classList.remove("hidden");

    if ($("welcome")) $("welcome").textContent = "Cofre de Voz de " + paciente.name;
    if ($("vaultIdBadge")) $("vaultIdBadge").textContent = paciente.vault_id;
    if ($("vaultMeta")) {
      $("vaultMeta").textContent =
        "Plano " + planoLabel(paciente.plan) +
        " • status " + (paciente.subscription_status || "ativo") +
        " • início em " + new Date(paciente.created_at).toLocaleDateString("pt-BR");
    }

    if ($("phraseLimitText")) $("phraseLimitText").textContent = "/" + paciente.limits.phrases + " frases";
    if ($("legacyLimitText")) {
      $("legacyLimitText").textContent = paciente.limits.legacy >= 999 ? "mensagens ilimitadas" : "/" + paciente.limits.legacy + " mensagens";
    }

    if ($("legalStatus")) {
      $("legalStatus").textContent =
        "Contrato aceito: " +
        (paciente.accepted_terms_at ? new Date(paciente.accepted_terms_at).toLocaleString("pt-BR") : "registrado") +
        " • ID: " + paciente.vault_id +
        " • " + (paciente.limits.policy || "");
    }

    // Carrega dados Supabase se as funções existirem.
    try {
      if (typeof voziaListRecordings === "function") {
        const recs = await voziaListRecordings();
        if (typeof recordings !== "undefined") {
          recordings = {};
          recs.forEach(r => recordings[r.phrase_index] = r);
        }
        if ($("doneCount")) $("doneCount").textContent = recs.length;
        const pct = Math.round((recs.length / paciente.limits.phrases) * 100);
        if ($("percent")) $("percent").textContent = pct + "%";
        if ($("bar")) $("bar").style.width = pct + "%";
      }

      if (typeof voziaListLegacyMessages === "function") {
        const leg = await voziaListLegacyMessages();
        if (typeof legacyMessages !== "undefined") legacyMessages = leg;
        if ($("legacyCount")) $("legacyCount").textContent = leg.length;
      }

      if (typeof voziaListCareRequests === "function") {
        const care = await voziaListCareRequests();
        if (typeof careAppRequests !== "undefined") careAppRequests = care;
      }

      if (typeof renderAll === "function") renderAll();
    } catch (e) {
      console.warn("Painel abriu, mas alguns dados ainda não carregaram:", e);
    }
  }

  async function handleCadastro(ev) {
    ev.preventDefault();
    ev.stopPropagation();
    ev.stopImmediatePropagation();

    hideMsg("regMsg");

    try {
      const name = ($("regName")?.value || "").trim();
      const email = ($("regEmail")?.value || "").trim();
      const password = ($("regPassword")?.value || "").trim();
      const plan = ($("regPlan")?.value || "avaliacao").trim();
      const acceptedTerms = !!$("regTerms")?.checked;

      if (!name || !email || !password) {
        msg("regMsg", "Preencha nome, e-mail e senha.");
        return;
      }

      if (!acceptedTerms) {
        msg("regMsg", "É necessário aceitar os termos para continuar.");
        return;
      }

      const result = await voziaSignUp({
        name,
        email,
        password,
        plan,
        acceptedTerms
      });

      msg("regMsg", result.message || "Cadastro criado no Supabase com sucesso.", true);

      // Tenta entrar direto no painel. Se o Supabase exigir confirmação por e-mail, apenas mostra mensagem.
      const user = await voziaGetUser();
      if (user) {
        await entrarNoPainelSupabase();
      }
    } catch (e) {
      msg("regMsg", e.message || "Erro ao cadastrar no Supabase.");
    }
  }

  async function handleLogin(ev) {
    ev.preventDefault();
    ev.stopPropagation();
    ev.stopImmediatePropagation();

    hideMsg("loginMsg");

    try {
      const email = ($("loginEmail")?.value || "").trim();
      const password = ($("loginPassword")?.value || "").trim();

      if (!email || !password) {
        msg("loginMsg", "Preencha e-mail e senha.");
        return;
      }

      await voziaSignIn({ email, password });
      msg("loginMsg", "Login realizado com sucesso.", true);
      await entrarNoPainelSupabase();
    } catch (e) {
      msg("loginMsg", e.message || "Erro ao entrar.");
    }
  }

  async function handleLogout(ev) {
    ev.preventDefault();
    ev.stopPropagation();
    ev.stopImmediatePropagation();

    try {
      if (typeof voziaSignOut === "function") await voziaSignOut();
    } catch (e) {
      console.warn(e);
    }

    location.reload();
  }

  async function verificarSessaoInicial() {
    try {
      if (typeof voziaGetUser !== "function") return;
      const user = await voziaGetUser();
      if (user) await entrarNoPainelSupabase();
    } catch (e) {
      console.warn("Sem sessão Supabase ativa.", e);
    }
  }

  window.voziaEntrarNoPainelSupabase = entrarNoPainelSupabase;

  document.addEventListener("DOMContentLoaded", () => {
    const registerBtn = $("registerBtn");
    const loginBtn = $("loginBtn");
    const logoutBtn = $("logoutBtn");

    if (registerBtn) registerBtn.addEventListener("click", handleCadastro, true);
    if (loginBtn) loginBtn.addEventListener("click", handleLogin, true);
    if (logoutBtn) logoutBtn.addEventListener("click", handleLogout, true);

    setTimeout(verificarSessaoInicial, 400);
  });
})();
