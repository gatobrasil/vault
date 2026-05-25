// ============================================================
// VOZIA ADMIN COMPLETO — Supabase + Backup + Áudios por usuário
// Coloque em: public/admin.js
// ============================================================

const $ = (id) => document.getElementById(id);

let adminUsers = [];
let adminRecordings = [];
let adminLegacy = [];
let adminCare = [];
let signedCache = {};

const VOICE_BUCKETS = [
  "voice-recordings",
  "gravações de voz",
  "gravacoes de voz",
  "gravações-de-voz",
  "gravacoes-de-voz"
];

const LEGACY_BUCKETS = [
  "legacy-audios",
  "áudios legados",
  "audios legados",
  "áudios-legados",
  "audios-legados"
];

function adminMsg(text, ok = false) {
  const el = $("adminMsg");
  if (!el) return;
  el.textContent = text;
  el.className = "msg" + (ok ? " ok" : "");
  el.style.display = "block";
}

function hideAdminMsg() {
  const el = $("adminMsg");
  if (el) el.style.display = "none";
}

async function adminIsAllowed(user) {
  const sb = voziaSupabase || iniciarSupabase();
  if (!sb) throw new Error("Supabase não configurado.");
  if (!user || !user.email) return false;

  const { data, error } = await sb
    .from("admin_users")
    .select("email, role, active")
    .eq("active", true)
    .ilike("email", user.email)
    .maybeSingle();

  if (error) {
    console.error(error);
    throw new Error("Erro ao consultar admin_users. Rode o SQL do admin.");
  }

  return !!data;
}

async function adminLogin() {
  try {
    adminMsg("Entrando...", true);

    await voziaSignIn({
      email: $("adminEmail")?.value?.trim(),
      password: $("adminPassword")?.value?.trim()
    });

    await adminCheck();
  } catch (e) {
    adminMsg(e.message || "Erro ao entrar no admin.");
  }
}

async function adminLogout() {
  try {
    if (typeof voziaSignOut === "function") await voziaSignOut();
  } catch (e) {}
  location.reload();
}

async function adminCheck() {
  try {
    const user = await voziaGetUser();

    if (!user) {
      $("adminLoginCard")?.classList.remove("hidden");
      $("adminArea")?.classList.add("hidden");
      return;
    }

    const allowed = await adminIsAllowed(user);

    if (!allowed) {
      adminMsg("Este e-mail não está autorizado. Adicione-o na tabela admin_users.");
      $("adminLoginCard")?.classList.remove("hidden");
      $("adminArea")?.classList.add("hidden");
      return;
    }

    $("adminLoginCard")?.classList.add("hidden");
    $("adminArea")?.classList.remove("hidden");

    if ($("adminWho")) $("adminWho").textContent = "Administrador conectado: " + user.email;

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
      sb.from("recordings").select("*").order("created_at", { ascending: false }).limit(2000),
      sb.from("legacy_messages").select("*").order("created_at", { ascending: false }).limit(2000),
      sb.from("vozia_care_requests").select("*").order("created_at", { ascending: false }).limit(2000)
    ]);

    if (profiles.error) throw profiles.error;
    if (recs.error) throw recs.error;
    if (legacy.error) throw legacy.error;
    if (care.error) throw care.error;

    adminUsers = profiles.data || [];
    adminRecordings = recs.data || [];
    adminLegacy = legacy.data || [];
    adminCare = care.data || [];
    signedCache = {};

    adminRenderAll();
    hideAdminMsg();
  } catch (e) {
    console.error(e);
    adminMsg("Erro ao carregar dados: " + (e.message || "erro") + ". Confira as policies SQL do admin.");
  }
}

function adminRenderAll() {
  $("stTotal").textContent = adminUsers.length;
  $("stRecordings").textContent = adminRecordings.length;
  $("stLegacy").textContent = adminLegacy.length;
  $("stCare").textContent = adminCare.length;

  renderUsers();
  renderRecordings();
  renderLegacy();
  renderCare();
  renderReturns();
}

function userById(id) {
  return adminUsers.find(u => u.id === id);
}

function userLabel(id) {
  const u = userById(id);
  if (!u) return id || "-";
  return `${u.name || "Sem nome"} — ${u.email || ""}`;
}

function getUserCounts(userId) {
  return {
    recordings: adminRecordings.filter(r => r.user_id === userId).length,
    legacy: adminLegacy.filter(m => m.user_id === userId).length,
    care: adminCare.filter(c => c.user_id === userId).length
  };
}

function renderUsers() {
  const box = $("adminUsersList");
  if (!box) return;

  const q = ($("adminSearch")?.value || "").toLowerCase();

  const rows = adminUsers.filter(u => {
    const hay = [u.name, u.email, u.plan, u.vault_id, u.subscription_status].join(" ").toLowerCase();
    return hay.includes(q);
  });

  if (!rows.length) {
    box.innerHTML = "<p class='small'>Nenhum paciente encontrado.</p>";
    return;
  }

  box.innerHTML = rows.map(u => {
    const c = getUserCounts(u.id);
    return `
      <div class="dataItem">
        <div class="adminPatientHeader">
          <div>
            <b>${escapeHtml(u.name || "Sem nome")}</b>
            <p class="small">
              ${escapeHtml(u.email || "")}<br>
              Plano: ${escapeHtml(u.plan || "avaliação")} • Cofre: ${escapeHtml(u.vault_id || "")}<br>
              Criado em: ${u.created_at ? new Date(u.created_at).toLocaleString("pt-BR") : "-"}
            </p>
          </div>
          <div>
            <span class="adminBadge">${c.recordings} áudios</span>
            <span class="adminBadge">${c.legacy} mensagens</span>
            <span class="adminBadge">${c.care} pedidos</span>
          </div>
        </div>
        <div class="adminToolbar">
          <button type="button" onclick="adminOpenPatient('${u.id}')">Abrir paciente</button>
          <button type="button" class="ghost" onclick="adminBackupPatient('${u.id}')">Backup do paciente</button>
          <button type="button" class="green" onclick="adminGeneratePatientAudioLinks('${u.id}')">Gerar links dos áudios</button>
        </div>
      </div>
    `;
  }).join("");
}

function renderRecordings() {
  const box = $("adminRecordingsList");
  if (!box) return;

  if (!adminRecordings.length) {
    box.innerHTML = "<p class='small'>Nenhuma gravação ainda.</p>";
    return;
  }

  box.innerHTML = adminRecordings.slice(0, 80).map(r => `
    <div class="dataItem">
      <b>${escapeHtml(userLabel(r.user_id))}</b>
      <p class="small">
        Frase ${Number(r.phrase_index || 0) + 1} • ${escapeHtml(r.phrase_category || "-")}<br>
        ${escapeHtml(r.phrase_text || "")}<br>
        Duração: ${r.duration_ms ? Math.round(r.duration_ms / 1000) + "s" : "-"} • ${r.created_at ? new Date(r.created_at).toLocaleString("pt-BR") : ""}
      </p>
      <button type="button" onclick="adminOpenAudio('${escapeAttr(r.audio_path || "")}', 'voice')">Ouvir/Baixar</button>
    </div>
  `).join("");
}

function renderLegacy() {
  const box = $("adminLegacyList");
  if (!box) return;

  if (!adminLegacy.length) {
    box.innerHTML = "<p class='small'>Nenhuma mensagem de legado ainda.</p>";
    return;
  }

  box.innerHTML = adminLegacy.map(m => `
    <div class="dataItem">
      <b>${escapeHtml(m.title || "Mensagem")}</b>
      <p class="small">
        Paciente: ${escapeHtml(userLabel(m.user_id))}<br>
        Para: ${escapeHtml(m.recipient || "-")} • Prioritária: ${m.is_priority ? "sim" : "não"}<br>
        ${escapeHtml(m.note || "")}<br>
        ${m.created_at ? new Date(m.created_at).toLocaleString("pt-BR") : ""}
      </p>
      ${m.audio_path ? `<button type="button" onclick="adminOpenAudio('${escapeAttr(m.audio_path)}', 'legacy')">Ouvir/Baixar áudio legado</button>` : ""}
    </div>
  `).join("");
}

function renderCare() {
  const box = $("adminCareList");
  if (!box) return;

  if (!adminCare.length) {
    box.innerHTML = "<p class='small'>Nenhum pedido Vozia Care ainda.</p>";
    return;
  }

  box.innerHTML = adminCare.map(c => `
    <div class="dataItem">
      <b>${escapeHtml(userLabel(c.user_id))}</b>
      <p class="small">
        Modelo: ${escapeHtml(c.app_model || "Vozia Care")}<br>
        Status: ${escapeHtml(c.status || "solicitado")}<br>
        Teclado: ${escapeHtml(c.keyboard_interest || "não")}<br>
        Observação: ${escapeHtml(c.notes || "")}<br>
        ${c.created_at ? new Date(c.created_at).toLocaleString("pt-BR") : ""}
      </p>
    </div>
  `).join("");
}

function renderReturns() {
  const box = $("adminReturnList");
  if (!box) return;

  const rows = adminUsers.map(u => {
    const c = getUserCounts(u.id);
    let status = "Precisa contato";
    let cls = "adminDanger";

    if (c.legacy > 0 && c.care > 0) {
      status = "Fluxo essencial completo";
      cls = "adminOk";
    } else if (c.legacy > 0) {
      status = "Mensagem feita — falta Care";
      cls = "";
    } else if (c.recordings > 0) {
      status = "Começou banco de voz";
      cls = "";
    }

    return { u, c, status, cls };
  });

  box.innerHTML = rows.map(({u, c, status, cls}) => `
    <div class="dataItem ${cls}">
      <b>${escapeHtml(u.name || "Sem nome")}</b>
      <p class="small">
        ${escapeHtml(u.email || "")}<br>
        Status: <b>${escapeHtml(status)}</b><br>
        Gravações: ${c.recordings} • Mensagens: ${c.legacy} • Pedidos Care: ${c.care}
      </p>
      <button type="button" onclick="adminOpenPatient('${u.id}')">Abrir acompanhamento</button>
    </div>
  `).join("");
}

async function adminOpenPatient(userId) {
  const u = userById(userId);
  const recordings = adminRecordings
    .filter(r => r.user_id === userId)
    .sort((a,b) => Number(a.phrase_index) - Number(b.phrase_index));

  const legacy = adminLegacy.filter(m => m.user_id === userId);
  const care = adminCare.filter(c => c.user_id === userId);
  const box = $("adminPatientDetail");

  if (!box) return;

  box.classList.remove("hidden");

  box.innerHTML = `
    <h2>${escapeHtml(u?.name || "Paciente")}</h2>
    <p class="small">
      ${escapeHtml(u?.email || "")}<br>
      ID: ${escapeHtml(u?.id || "")}<br>
      Cofre: ${escapeHtml(u?.vault_id || "")} • Plano: ${escapeHtml(u?.plan || "")}
    </p>

    <div class="adminMiniGrid">
      <div><b>${recordings.length}</b><br><span class="small">áudios</span></div>
      <div><b>${legacy.length}</b><br><span class="small">mensagens</span></div>
      <div><b>${care.length}</b><br><span class="small">pedidos Care</span></div>
      <div><b>${u?.subscription_status || "ativo"}</b><br><span class="small">status</span></div>
    </div>

    <div class="adminToolbar">
      <button onclick="adminBackupPatient('${userId}')" type="button">Baixar backup JSON</button>
      <button onclick="adminGeneratePatientAudioLinks('${userId}')" type="button" class="green">Gerar links de todos os áudios</button>
      <button onclick="adminCopyPatientSummary('${userId}')" type="button" class="ghost">Copiar resumo</button>
    </div>

    <h3>Áudios do Banco de Voz</h3>
    <div class="adminAudioGrid">
      ${
        recordings.length
          ? recordings.map(r => `
            <div class="adminAudioItem">
              <b>Frase ${Number(r.phrase_index || 0) + 1}</b>
              <p class="small">${escapeHtml(r.phrase_text || "")}</p>
              <button type="button" onclick="adminOpenAudio('${escapeAttr(r.audio_path || "")}', 'voice')">Ouvir/Baixar</button>
            </div>
          `).join("")
          : "<p class='small'>Nenhuma gravação ainda.</p>"
      }
    </div>

    <h3>Mensagens de legado</h3>
    <div class="adminList">
      ${
        legacy.length
          ? legacy.map(m => `
            <div class="dataItem">
              <b>${escapeHtml(m.title || "Mensagem")}</b>
              <p class="small">Para: ${escapeHtml(m.recipient || "-")}<br>${escapeHtml(m.note || "")}</p>
              ${m.audio_path ? `<button onclick="adminOpenAudio('${escapeAttr(m.audio_path)}', 'legacy')" type="button">Ouvir/Baixar áudio</button>` : ""}
            </div>
          `).join("")
          : "<p class='small'>Nenhuma mensagem ainda.</p>"
      }
    </div>
  `;

  box.scrollIntoView({ behavior: "smooth", block: "start" });
}

async function signedUrl(path, type = "voice") {
  if (!path) throw new Error("Arquivo sem caminho.");

  const cacheKey = `${type}:${path}`;
  if (signedCache[cacheKey]) return signedCache[cacheKey];

  const sb = voziaSupabase || iniciarSupabase();
  const buckets = type === "legacy" ? LEGACY_BUCKETS : VOICE_BUCKETS;
  let lastError = null;

  for (const bucket of buckets) {
    const { data, error } = await sb.storage
      .from(bucket)
      .createSignedUrl(path, 60 * 20);

    if (!error && data?.signedUrl) {
      signedCache[cacheKey] = data.signedUrl;
      return data.signedUrl;
    }

    lastError = error;
  }

  throw lastError || new Error("Não consegui gerar link assinado.");
}

async function adminOpenAudio(path, type = "voice") {
  try {
    const url = await signedUrl(path, type);
    window.open(url, "_blank");
  } catch (e) {
    alert("Erro ao abrir áudio: " + (e.message || "erro"));
  }
}

async function adminGeneratePatientAudioLinks(userId) {
  const recordings = adminRecordings
    .filter(r => r.user_id === userId)
    .sort((a,b) => Number(a.phrase_index) - Number(b.phrase_index));

  if (!recordings.length) {
    alert("Este paciente ainda não tem áudios.");
    return;
  }

  const lines = [];
  for (const r of recordings) {
    try {
      const url = await signedUrl(r.audio_path, "voice");
      lines.push(`Frase ${Number(r.phrase_index) + 1}: ${url}`);
    } catch (e) {
      lines.push(`Frase ${Number(r.phrase_index) + 1}: ERRO - ${e.message}`);
    }
  }

  $("backupOutput").value = lines.join("\n\n");
  $("backupOutput").scrollIntoView({ behavior: "smooth" });
}

async function manifestGeneral(withLinks = false) {
  const users = [];

  for (const u of adminUsers) {
    const recordings = adminRecordings.filter(r => r.user_id === u.id);
    const legacy = adminLegacy.filter(m => m.user_id === u.id);
    const care = adminCare.filter(c => c.user_id === u.id);

    const recs = [];
    for (const r of recordings) {
      let url = null;
      if (withLinks && r.audio_path) {
        try { url = await signedUrl(r.audio_path, "voice"); } catch (e) { url = "ERRO: " + e.message; }
      }
      recs.push({ ...r, signed_url: url });
    }

    const leg = [];
    for (const m of legacy) {
      let url = null;
      if (withLinks && m.audio_path) {
        try { url = await signedUrl(m.audio_path, "legacy"); } catch (e) { url = "ERRO: " + e.message; }
      }
      leg.push({ ...m, signed_url: url });
    }

    users.push({ profile: u, recordings: recs, legacy_messages: leg, care_requests: care });
  }

  return {
    generated_at: new Date().toISOString(),
    platform: "Vozia Vault",
    total_users: adminUsers.length,
    total_recordings: adminRecordings.length,
    total_legacy_messages: adminLegacy.length,
    total_care_requests: adminCare.length,
    users
  };
}

async function adminBackupPatient(userId) {
  const manifest = await manifestGeneral(true);
  const patient = manifest.users.find(u => u.profile.id === userId);

  if (!patient) {
    alert("Paciente não encontrado.");
    return;
  }

  downloadJson(`backup-vozia-${safeFile(patient.profile.email || patient.profile.id)}.json`, patient);
}

async function adminBackupJson() {
  const manifest = await manifestGeneral(false);
  $("backupOutput").value = JSON.stringify(manifest, null, 2);
  downloadJson(`backup-geral-vozia-${new Date().toISOString().slice(0,10)}.json`, manifest);
}

async function adminGenerateAllLinks() {
  const manifest = await manifestGeneral(true);
  $("backupOutput").value = JSON.stringify(manifest, null, 2);
}

function adminBackupCsv() {
  const rows = [
    ["nome","email","plano","vault_id","total_gravacoes","total_mensagens","total_care","created_at"]
  ];

  adminUsers.forEach(u => {
    const c = getUserCounts(u.id);
    rows.push([
      u.name || "",
      u.email || "",
      u.plan || "",
      u.vault_id || "",
      c.recordings,
      c.legacy,
      c.care,
      u.created_at || ""
    ]);
  });

  const csv = rows.map(r => r.map(v => `"${String(v).replaceAll('"','""')}"`).join(",")).join("\n");
  downloadText(`pacientes-vozia-${new Date().toISOString().slice(0,10)}.csv`, csv, "text/csv");
}

function adminCopyPatientSummary(userId) {
  const u = userById(userId);
  const c = getUserCounts(userId);
  const text = `Paciente: ${u?.name || ""}
Email: ${u?.email || ""}
Plano: ${u?.plan || ""}
Cofre: ${u?.vault_id || ""}
Gravações: ${c.recordings}
Mensagens: ${c.legacy}
Pedidos Vozia Care: ${c.care}`;

  navigator.clipboard?.writeText(text);
  alert("Resumo copiado.");
}

function downloadJson(filename, data) {
  downloadText(filename, JSON.stringify(data, null, 2), "application/json");
}

function downloadText(filename, text, type) {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function safeFile(text) {
  return String(text || "arquivo").replace(/[^a-z0-9-_@.]+/gi, "-").slice(0, 80);
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

function setupTabs() {
  document.querySelectorAll(".tabBtn").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".tabBtn").forEach(b => b.classList.add("ghost"));
      btn.classList.remove("ghost");

      document.querySelectorAll(".adminPanel").forEach(p => p.classList.remove("active"));
      $(btn.dataset.tab)?.classList.add("active");
    });
  });
}

document.addEventListener("DOMContentLoaded", () => {
  $("adminLoginBtn")?.addEventListener("click", adminLogin);
  $("adminLogoutBtn")?.addEventListener("click", adminLogout);
  $("reloadAdminBtn")?.addEventListener("click", adminLoadAll);
  $("adminSearch")?.addEventListener("input", renderUsers);

  $("backupJsonBtn")?.addEventListener("click", adminBackupJson);
  $("backupCsvBtn")?.addEventListener("click", adminBackupCsv);
  $("generateAllLinksBtn")?.addEventListener("click", adminGenerateAllLinks);

  setupTabs();

  setTimeout(adminCheck, 500);
});
