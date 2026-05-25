// ============================================================
// VOZIA ADMIN — Supabase com tabela admin_users
// Coloque este arquivo em: public/admin.js
// ============================================================

const $ = (id) => document.getElementById(id);

let adminUsers = [];
let adminRecordings = [];
let adminLegacy = [];
let adminCare = [];

function adminMsg(text, ok = false) {
  const el = $("adminMsg") || $("msg");
  if (!el) return;
  el.textContent = text;
  el.className = "msg" + (ok ? " ok" : "");
  el.style.display = "block";
}

async function adminIsAllowed(user) {
  const sb = voziaSupabase || iniciarSupabase();

  if (!sb) {
    throw new Error("Supabase não configurado.");
  }

  if (!user || !user.email) {
    return false;
  }

  const { data, error } = await sb
    .from("admin_users")
    .select("email, role, active")
    .eq("active", true)
    .ilike("email", user.email)
    .maybeSingle();

  if (error) {
    console.error(error);
    throw new Error("Erro ao consultar tabela admin_users. Rode o SQL de admin no Supabase.");
  }

  return !!data;
}

async function adminLogin() {
  try {
    adminMsg("Entrando...");

    await voziaSignIn({
      email: $("adminEmail")?.value?.trim() || $("email")?.value?.trim(),
      password: $("adminPassword")?.value?.trim() || $("password")?.value?.trim()
    });

    await adminCheck();
  } catch (e) {
    adminMsg(e.message || "Erro ao entrar no admin.");
  }
}

async function adminLogout() {
  try {
    if (typeof voziaSignOut === "function") {
      await voziaSignOut();
    }
  } catch (e) {
    console.warn(e);
  }

  location.reload();
}

async function adminCheck() {
  try {
    const user = await voziaGetUser();

    if (!user) {
      $("adminLoginCard")?.classList.remove("hidden");
      $("loginCard")?.classList.remove("hidden");
      $("adminArea")?.classList.add("hidden");
      return;
    }

    const allowed = await adminIsAllowed(user);

    if (!allowed) {
      adminMsg("Este e-mail não está autorizado como administrador. Adicione este e-mail na tabela admin_users.");
      $("adminLoginCard")?.classList.remove("hidden");
      $("loginCard")?.classList.remove("hidden");
      $("adminArea")?.classList.add("hidden");
      return;
    }

    $("adminLoginCard")?.classList.add("hidden");
    $("loginCard")?.classList.add("hidden");
    $("adminArea")?.classList.remove("hidden");

    if ($("adminWho")) {
      $("adminWho").textContent = "Administrador conectado: " + user.email;
    }

    await adminLoadAll();
  } catch (e) {
    console.error(e);
    adminMsg(e.message || "Erro ao verificar administrador.");
  }
}

async function adminLoadAll() {
  const sb = voziaSupabase || iniciarSupabase();

  if (!sb) {
    adminMsg("Supabase não configurado.");
    return;
  }

  try {
    adminMsg("Carregando dados...", true);

    const [profiles, recs, legacy, care] = await Promise.all([
      sb.from("profiles").select("*").order("created_at", { ascending: false }),
      sb.from("recordings").select("*").order("created_at", { ascending: false }).limit(500),
      sb.from("legacy_messages").select("*").order("created_at", { ascending: false }).limit(500),
      sb.from("vozia_care_requests").select("*").order("created_at", { ascending: false }).limit(500)
    ]);

    if (profiles.error) throw profiles.error;
    if (recs.error) throw recs.error;
    if (legacy.error) throw legacy.error;
    if (care.error) throw care.error;

    adminUsers = profiles.data || [];
    adminRecordings = recs.data || [];
    adminLegacy = legacy.data || [];
    adminCare = care.data || [];

    adminRender();

    const msg = $("adminMsg") || $("msg");
    if (msg) msg.style.display = "none";
  } catch (e) {
    console.error(e);
    adminMsg(
      "Erro ao carregar dados. Rode o SQL de admin no Supabase. Detalhe: " +
      (e.message || "erro")
    );
  }
}

function adminRender() {
  if ($("stTotal")) $("stTotal").textContent = adminUsers.length;
  if ($("stRecordings")) $("stRecordings").textContent = adminRecordings.length;
  if ($("stLegacy")) $("stLegacy").textContent = adminLegacy.length;
  if ($("stCare")) $("stCare").textContent = adminCare.length;

  // Compatibilidade com admin antigo
  if ($("stComp")) $("stComp").textContent = adminUsers.filter(u => u.subscription_status === "ativo").length;
  if ($("stInc")) $("stInc").textContent = adminUsers.filter(u => u.subscription_status !== "ativo").length;
  if ($("stAnual")) $("stAnual").textContent = adminUsers.filter(u => u.plan === "anual").length;
  if ($("stVitalicio")) $("stVitalicio").textContent = adminUsers.filter(u => u.plan === "vitalicio").length;
  if ($("stReceita")) $("stReceita").textContent = "R$0";

  renderUsers();
  renderCare();
  renderLegacy();
  renderRecordings();
}

function renderUsers() {
  const box = $("adminUsersList") || $("usersList") || $("patientsList");
  if (!box) return;

  const q = ($("adminSearch")?.value || $("search")?.value || "").toLowerCase();

  const rows = adminUsers.filter(u => {
    const hay = [
      u.name,
      u.email,
      u.plan,
      u.vault_id,
      u.subscription_status
    ].join(" ").toLowerCase();

    return hay.includes(q);
  });

  if (!rows.length) {
    box.innerHTML = "<p class='small'>Nenhum paciente encontrado.</p>";
    return;
  }

  box.innerHTML = rows.map(u => {
    const recordings = adminRecordings.filter(r => r.user_id === u.id);
    const legacy = adminLegacy.filter(m => m.user_id === u.id);
    const care = adminCare.filter(c => c.user_id === u.id);

    return `
      <div class="dataItem">
        <b>${escapeHtml(u.name || "Sem nome")}</b>
        <p class="small">
          ${escapeHtml(u.email || "")}<br>
          Plano: ${escapeHtml(u.plan || "avaliacao")} • Cofre: ${escapeHtml(u.vault_id || "")}<br>
          Gravações: ${recordings.length} • Mensagens: ${legacy.length} • Pedidos Care: ${care.length}<br>
          Criado em: ${u.created_at ? new Date(u.created_at).toLocaleString("pt-BR") : "-"}<br>
          Termos: ${u.accepted_terms_at ? new Date(u.accepted_terms_at).toLocaleString("pt-BR") : "não informado"}
        </p>
        <button type="button" class="ghost" onclick="adminOpenPatient('${u.id}')">Ver áudios</button>
      </div>
    `;
  }).join("");
}

function adminOpenPatient(userId) {
  const user = adminUsers.find(u => u.id === userId);
  const recordings = adminRecordings
    .filter(r => r.user_id === userId)
    .sort((a, b) => Number(a.phrase_index) - Number(b.phrase_index));

  let box = $("adminPatientDetail");

  if (!box) {
    box = document.createElement("section");
    box.id = "adminPatientDetail";
    box.className = "card";
    document.querySelector("#adminArea")?.appendChild(box);
  }

  if (!recordings.length) {
    box.innerHTML = `
      <h2>Áudios de ${escapeHtml(user?.name || "paciente")}</h2>
      <p class="small">Este paciente ainda não tem gravações.</p>
    `;
    box.scrollIntoView({ behavior: "smooth" });
    return;
  }

  box.innerHTML = `
    <h2>Áudios de ${escapeHtml(user?.name || "paciente")}</h2>
    <p class="small">${escapeHtml(user?.email || "")} • ${recordings.length} gravações</p>
    <div class="legacyList">
      ${recordings.map(r => `
        <div class="dataItem">
          <b>Frase ${Number(r.phrase_index || 0) + 1}</b>
          <p class="small">
            ${escapeHtml(r.phrase_text || "")}<br>
            Duração: ${r.duration_ms ? Math.round(r.duration_ms / 1000) + "s" : "-"}<br>
            Arquivo: ${escapeHtml(r.audio_path || "")}
          </p>
          <button type="button" onclick="adminDownloadAudio('${escapeAttr(r.audio_path || "")}')">Baixar/Ouvir</button>
        </div>
      `).join("")}
    </div>
  `;

  box.scrollIntoView({ behavior: "smooth" });
}

async function adminDownloadAudio(audioPath) {
  try {
    const sb = voziaSupabase || iniciarSupabase();

    if (!audioPath) {
      alert("Arquivo não encontrado.");
      return;
    }

    const bucketCandidates = [
      "voice-recordings",
      "gravações de voz",
      "gravacoes de voz",
      "gravações-de-voz",
      "gravacoes-de-voz"
    ];

    let lastError = null;

    for (const bucket of bucketCandidates) {
      const { data, error } = await sb.storage
        .from(bucket)
        .createSignedUrl(audioPath, 60 * 10);

      if (!error && data?.signedUrl) {
        window.open(data.signedUrl, "_blank");
        return;
      }

      lastError = error;
    }

    throw lastError || new Error("Não foi possível gerar link do áudio.");
  } catch (e) {
    alert("Erro ao abrir áudio: " + (e.message || "erro"));
  }
}

function renderCare() {
  const box = $("adminCareList") || $("careList");
  if (!box) return;

  if (!adminCare.length) {
    box.innerHTML = "<p class='small'>Nenhum pedido do Vozia Care ainda.</p>";
    return;
  }

  box.innerHTML = adminCare.map(r => `
    <div class="dataItem">
      <b>${escapeHtml(r.app_model || "Vozia Care")}</b>
      <p class="small">
        Paciente: ${escapeHtml(findUserEmail(r.user_id))}<br>
        Status: ${escapeHtml(r.status || "solicitado")}<br>
        Interesse teclado: ${escapeHtml(r.keyboard_interest || "não")}<br>
        ${escapeHtml(r.notes || "")}<br>
        ${r.created_at ? new Date(r.created_at).toLocaleString("pt-BR") : ""}
      </p>
    </div>
  `).join("");
}

function renderLegacy() {
  const box = $("adminLegacyList") || $("legacyAdminList");
  if (!box) return;

  if (!adminLegacy.length) {
    box.innerHTML = "<p class='small'>Nenhuma mensagem ainda.</p>";
    return;
  }

  box.innerHTML = adminLegacy.map(m => `
    <div class="dataItem">
      <b>${escapeHtml(m.title || "Mensagem")}</b>
      <p class="small">
        Paciente: ${escapeHtml(findUserEmail(m.user_id))}<br>
        Para: ${escapeHtml(m.recipient || "-")}<br>
        Prioritária: ${m.is_priority ? "sim" : "não"}<br>
        ${escapeHtml(m.note || "")}<br>
        ${m.created_at ? new Date(m.created_at).toLocaleString("pt-BR") : ""}
      </p>
    </div>
  `).join("");
}

function renderRecordings() {
  const box = $("adminRecordingsList") || $("recordingsList");
  if (!box) return;

  if (!adminRecordings.length) {
    box.innerHTML = "<p class='small'>Nenhuma gravação ainda.</p>";
    return;
  }

  box.innerHTML = adminRecordings.slice(0, 50).map(r => `
    <div class="dataItem">
      <b>${escapeHtml(findUserEmail(r.user_id))} — Frase ${Number(r.phrase_index || 0) + 1}</b>
      <p class="small">
        Categoria: ${escapeHtml(r.phrase_category || "-")}<br>
        Duração: ${r.duration_ms ? Math.round(r.duration_ms / 1000) + "s" : "-"}<br>
        ${escapeHtml(r.phrase_text || "")}
      </p>
      <button type="button" onclick="adminDownloadAudio('${escapeAttr(r.audio_path || "")}')">Baixar/Ouvir</button>
    </div>
  `).join("");
}

function findUserEmail(userId) {
  const user = adminUsers.find(u => u.id === userId);
  return user?.email || userId || "-";
}

function escapeHtml(text) {
  return String(text ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeAttr(text) {
  return String(text ?? "")
    .replaceAll("\\", "\\\\")
    .replaceAll("'", "\\'")
    .replaceAll('"', "&quot;");
}

document.addEventListener("DOMContentLoaded", () => {
  $("adminLoginBtn")?.addEventListener("click", adminLogin);
  $("loginBtn")?.addEventListener("click", adminLogin);

  $("adminLogoutBtn")?.addEventListener("click", adminLogout);
  $("logoutBtn")?.addEventListener("click", adminLogout);

  $("reloadAdminBtn")?.addEventListener("click", adminLoadAll);

  $("adminSearch")?.addEventListener("input", renderUsers);
  $("search")?.addEventListener("input", renderUsers);

  setTimeout(adminCheck, 500);
});
