// ============================================================
// VOZIA ADMIN — Auth email + perfil completo + backup
// - Identifica paciente pelo user_id real
// - Mostra e-mail real do Auth quando a RPC existir
// - Mostra todos os campos do cadastro/profile
// - Backup individual e geral
// ============================================================

const $ = (id) => document.getElementById(id);

let adminUsers = [];
let adminRecordings = [];
let adminLegacy = [];
let adminCare = [];
let adminDeletionRequests = [];
let signedCache = {};

const ADMIN_EMAILS = ["thalesrenogrilo@gmail.com"];

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

function progress(text) {
  const el = $("adminBackupProgress");
  const log = $("adminBackupLog");
  if (el) {
    el.style.display = "block";
    el.textContent = text;
  }
  if (log) {
    log.value += text + "\n";
    log.scrollTop = log.scrollHeight;
  }
}

function clearProgress() {
  if ($("adminBackupProgress")) {
    $("adminBackupProgress").style.display = "none";
    $("adminBackupProgress").textContent = "";
  }
  if ($("adminBackupLog")) $("adminBackupLog").value = "";
}

function adminIsAllowed(user) {
  const email = (user?.email || "").toLowerCase();
  return ADMIN_EMAILS.map(e => e.toLowerCase()).includes(email);
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

function safeFile(text) {
  return String(text || "arquivo")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9-_@.]+/gi, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 90) || "arquivo";
}

function getExt(path, fallback = "webm") {
  const m = String(path || "").match(/\.([a-z0-9]+)(\?|$)/i);
  return m ? m[1].toLowerCase() : fallback;
}

function downloadBlob(filename, blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function downloadText(filename, text, type = "text/plain") {
  downloadBlob(filename, new Blob([text], { type }));
}

function userById(userId) {
  return adminUsers.find(u => u.id === userId);
}

function getAuthEmail(u) {
  return u?.auth_email || u?.login_email || u?.email_auth || "";
}

function getProfileEmail(u) {
  return u?.profile_email || u?.email || "";
}

function getBestEmail(u) {
  return getAuthEmail(u) || getProfileEmail(u) || "";
}

function userDisplayName(userId) {
  const u = userById(userId);
  if (!u) return userId || "-";
  return `${u.name || "Sem nome"} — ${getBestEmail(u) || ""}`;
}

function getUserRows(userId) {
  return {
    profile: userById(userId),
    recordings: adminRecordings.filter(r => r.user_id === userId),
    legacy: adminLegacy.filter(m => m.user_id === userId),
    care: adminCare.filter(c => c.user_id === userId),
    deletion: adminDeletionRequests.filter(d => d.user_id === userId)
  };
}

function getUserCounts(userId) {
  const rows = getUserRows(userId);
  return {
    recordings: rows.recordings.length,
    legacy: rows.legacy.length,
    care: rows.care.length,
    deletion: rows.deletion.length
  };
}

function contactFields(u) {
  const keys = Object.keys(u || {});
  const contactLike = keys.filter(k => {
    const s = k.toLowerCase();
    return (
      s.includes("contact") ||
      s.includes("contato") ||
      s.includes("family") ||
      s.includes("familiar") ||
      s.includes("respons") ||
      s.includes("phone") ||
      s.includes("telefone") ||
      s.includes("whatsapp") ||
      s.includes("email_") ||
      s.includes("authorized")
    );
  });

  return contactLike
    .map(k => [k, u[k]])
    .filter(([k,v]) => v !== null && v !== undefined && String(v).trim() !== "");
}

function profileSearchText(u) {
  return Object.entries(u || {})
    .map(([k,v]) => `${k}:${String(v ?? "")}`)
    .join(" ")
    .toLowerCase();
}

async function adminLogin() {
  try {
    adminMsg("Entrando...");
    await voziaSignIn({
      email: $("adminEmail").value.trim(),
      password: $("adminPassword").value.trim()
    });
    await adminCheck();
  } catch (e) {
    adminMsg(e.message || "Erro ao entrar no admin.");
  }
}

async function adminLogout() {
  try { await voziaSignOut(); } catch (e) {}
  location.reload();
}

async function adminCheck() {
  const user = await voziaGetUser();

  if (!user) {
    $("adminLoginCard")?.classList.remove("hidden");
    $("adminArea")?.classList.add("hidden");
    return;
  }

  if (!adminIsAllowed(user)) {
    adminMsg("Este e-mail não está autorizado no painel admin.");
    $("adminLoginCard")?.classList.remove("hidden");
    $("adminArea")?.classList.add("hidden");
    return;
  }

  $("adminLoginCard")?.classList.add("hidden");
  $("adminArea")?.classList.remove("hidden");

  if ($("adminWho")) $("adminWho").textContent = "Administrador conectado: " + user.email;

  await adminLoadAll();
}

async function fetchProfilesWithAuthEmail(sb) {
  // Preferido: RPC segura que junta profiles + auth.users.email.
  // Precisa rodar o SQL deste pacote.
  try {
    const { data, error } = await sb.rpc("admin_patient_directory");
    if (!error && Array.isArray(data)) {
      return data.map(row => ({
        ...(row.profile_json || {}),
        ...row,
        email: row.profile_email || row.email || "",
        profile_email: row.profile_email || row.email || "",
        auth_email: row.auth_email || null
      }));
    }
    console.warn("RPC admin_patient_directory indisponível, usando profiles.", error);
  } catch (e) {
    console.warn("RPC admin_patient_directory erro, usando profiles.", e);
  }

  const { data, error } = await sb.from("profiles").select("*").order("created_at", { ascending: false }).limit(10000);
  if (error) throw error;

  // fallback: deixa claro que email é o profile.email, não Auth.
  return (data || []).map(p => ({
    ...p,
    profile_email: p.email,
    auth_email: null,
    auth_email_unavailable: true
  }));
}

async function fetchOptionalTable(sb, table) {
  const { data, error } = await sb.from(table).select("*").order("created_at", { ascending: false }).limit(10000);
  if (error) {
    console.warn(table, error);
    return [];
  }
  return data || [];
}

async function adminLoadAll() {
  const sb = voziaSupabase || iniciarSupabase();
  if (!sb) {
    adminMsg("Supabase não configurado.");
    return;
  }

  try {
    adminMsg("Carregando dados...", true);

    const [profiles, recs, legacy, care, deletion] = await Promise.all([
      fetchProfilesWithAuthEmail(sb),
      fetchOptionalTable(sb, "recordings"),
      fetchOptionalTable(sb, "legacy_messages"),
      fetchOptionalTable(sb, "vozia_care_requests"),
      fetchOptionalTable(sb, "deletion_requests")
    ]);

    adminUsers = profiles;
    adminRecordings = recs;
    adminLegacy = legacy;
    adminCare = care;
    adminDeletionRequests = deletion;
    signedCache = {};

    adminRender();

    adminMsg("Dados atualizados.", true);
    setTimeout(() => { if ($("adminMsg")) $("adminMsg").style.display = "none"; }, 1400);
  } catch (e) {
    console.error(e);
    adminMsg("Erro ao carregar dados. Rode o SQL do admin. Detalhe: " + (e.message || "erro"));
  }
}

function adminRender() {
  if ($("stTotal")) $("stTotal").textContent = adminUsers.length;
  if ($("stRecordings")) $("stRecordings").textContent = adminRecordings.length;
  if ($("stLegacy")) $("stLegacy").textContent = adminLegacy.length;
  if ($("stCare")) $("stCare").textContent = adminCare.length;

  renderUsers();
  renderCare();
  renderLegacy();
  renderRecordings();
  renderDeletionRequests();
}

function renderUsers() {
  const box = $("adminUsersList");
  if (!box) return;

  const q = ($("adminSearch")?.value || "").toLowerCase().trim();

  const rows = adminUsers.filter(u => {
    const c = getUserCounts(u.id);
    const related = [
      ...adminRecordings.filter(r => r.user_id === u.id),
      ...adminLegacy.filter(m => m.user_id === u.id),
      ...adminCare.filter(care => care.user_id === u.id),
      ...adminDeletionRequests.filter(d => d.user_id === u.id)
    ].map(x => Object.values(x).join(" ")).join(" ").toLowerCase();

    const hay = `${profileSearchText(u)} ${related} recordings:${c.recordings} legacy:${c.legacy} care:${c.care} deletion:${c.deletion}`;
    return !q || hay.includes(q);
  });

  if (!rows.length) {
    box.innerHTML = "<p class='small'>Nenhum paciente encontrado.</p>";
    return;
  }

  box.innerHTML = rows.map(u => {
    const c = getUserCounts(u.id);
    const authEmail = getAuthEmail(u);
    const profileEmail = getProfileEmail(u);
    const contacts = contactFields(u);

    return `
      <div class="adminPatientCard">
        <div class="adminPatientHeader">
          <div>
            <b>${escapeHtml(u.name || "Sem nome")}</b>
            <p class="small">
              <b>E-mail real do login/Auth:</b> ${authEmail ? escapeHtml(authEmail) : "<span class='adminDanger'>não disponível — rode o SQL novo</span>"}<br>
              <b>E-mail salvo no cadastro/profile:</b> ${escapeHtml(profileEmail || "")}<br>
              ${contacts.length ? `<b>Contatos do cadastro:</b> ${contacts.map(([k,v]) => `${escapeHtml(k)}: ${escapeHtml(v)}`).join(" • ")}<br>` : ""}
              <b>User ID:</b> <span class="adminSmallMuted">${escapeHtml(u.id || "")}</span><br>
              Plano: ${escapeHtml(u.plan || "avaliacao")} • Cofre: ${escapeHtml(u.vault_id || "")}<br>
              Criado em: ${u.created_at ? new Date(u.created_at).toLocaleString("pt-BR") : "-"}
            </p>
          </div>
          <div class="adminBadges">
            <span class="adminBadge">${c.recordings} frases</span>
            <span class="adminBadge">${c.legacy} mensagens</span>
            <span class="adminBadge">${c.care} Care</span>
            <span class="adminBadge ${c.deletion ? "adminDanger" : "adminOk"}">${c.deletion} exclusão</span>
          </div>
        </div>
        <div class="adminToolbar">
          <button type="button" onclick="openPatientDetail('${escapeAttr(u.id)}')">Abrir perfil completo</button>
          <button type="button" class="green" onclick="backupPatientZip('${escapeAttr(u.id)}')">Baixar tudo do paciente</button>
          <button type="button" class="ghost" onclick="backupPatientJson('${escapeAttr(u.id)}')">Manifesto JSON</button>
        </div>
      </div>
    `;
  }).join("");
}

function renderCare() {
  const box = $("adminCareList");
  if (!box) return;
  box.innerHTML = adminCare.map(r => `
    <div class="dataItem">
      <b>${escapeHtml(userDisplayName(r.user_id))}</b>
      <p class="small">
        Modelo: ${escapeHtml(r.app_model || "Vozia Care")}<br>
        Status: ${escapeHtml(r.status || "solicitado")}<br>
        Interesse teclado: ${escapeHtml(r.keyboard_interest || "não")}<br>
        ${escapeHtml(r.notes || "")}<br>
        ${r.created_at ? new Date(r.created_at).toLocaleString("pt-BR") : ""}
      </p>
    </div>
  `).join("") || "<p class='small'>Nenhum pedido do Vozia Care ainda.</p>";
}

function renderLegacy() {
  const box = $("adminLegacyList");
  if (!box) return;
  box.innerHTML = adminLegacy.map(m => `
    <div class="dataItem">
      <b>${escapeHtml(userDisplayName(m.user_id))}</b>
      <p class="small">
        ${m.is_priority ? "⭐ PRIORITÁRIA<br>" : ""}
        Título: ${escapeHtml(m.title || "Mensagem")}<br>
        Para: ${escapeHtml(m.recipient || "-")}<br>
        ${escapeHtml(m.note || m.text_note || "")}<br>
        Áudio: ${escapeHtml(m.audio_path || "sem áudio")}<br>
        ${m.created_at ? new Date(m.created_at).toLocaleString("pt-BR") : ""}
      </p>
      ${m.audio_path ? `<button type="button" class="ghost" onclick="openAudio('${escapeAttr(m.audio_path)}','legacy')">Abrir áudio</button>` : ""}
    </div>
  `).join("") || "<p class='small'>Nenhuma mensagem ainda.</p>";
}

function renderRecordings() {
  const box = $("adminRecordingsList");
  if (!box) return;
  box.innerHTML = adminRecordings.slice(0, 120).map(r => `
    <div class="dataItem">
      <b>${escapeHtml(userDisplayName(r.user_id))} — Frase ${Number(r.phrase_index || 0) + 1}</b>
      <p class="small">
        Categoria: ${escapeHtml(r.phrase_category || "-")}<br>
        Duração: ${r.duration_ms ? Math.round(r.duration_ms / 1000) + "s" : "-"}<br>
        ${escapeHtml(r.phrase_text || "")}<br>
        Áudio: ${escapeHtml(r.audio_path || "sem áudio")}<br>
        ${r.created_at ? new Date(r.created_at).toLocaleString("pt-BR") : ""}
      </p>
      ${r.audio_path ? `<button type="button" class="ghost" onclick="openAudio('${escapeAttr(r.audio_path)}','voice')">Abrir áudio</button>` : ""}
    </div>
  `).join("") || "<p class='small'>Nenhuma gravação ainda.</p>";
}

function renderDeletionRequests() {
  const box = $("adminDeletionList");
  if (!box) return;
  box.innerHTML = adminDeletionRequests.map(r => {
    const u = userById(r.user_id);
    return `
      <div class="dataItem">
        <b>${escapeHtml(u?.name || "Paciente")} — ${escapeHtml(getBestEmail(u) || r.user_id || "")}</b>
        <p class="small">
          <b>User ID:</b> <span class="adminSmallMuted">${escapeHtml(r.user_id || "")}</span><br>
          Status: ${escapeHtml(r.status || "pendente")}<br>
          Motivo: ${escapeHtml(r.reason || "")}<br>
          ${r.decision_note ? "Decisão: " + escapeHtml(r.decision_note) + "<br>" : ""}
          Criado em: ${r.created_at ? new Date(r.created_at).toLocaleString("pt-BR") : ""}
        </p>
      </div>
    `;
  }).join("") || "<p class='small'>Nenhuma solicitação de exclusão.</p>";
}

function openPatientDetail(userId) {
  const box = $("adminPatientDetail");
  if (!box) return;

  const rows = getUserRows(userId);
  const u = rows.profile;

  if (!u) {
    alert("Paciente não encontrado.");
    return;
  }

  box.classList.remove("hidden");

  const authEmail = getAuthEmail(u);
  const profileEmail = getProfileEmail(u);
  const contacts = contactFields(u);

  const allProfileFields = Object.entries(u)
    .sort(([a],[b]) => a.localeCompare(b))
    .map(([k,v]) => {
      const important = ["auth_email", "profile_email", "email", "name", "phone", "contact_email", "family_email", "responsible_email", "authorized_contact_email", "contact_phone", "vault_id", "plan"].includes(k);
      return `<div style="${important ? "border-color:rgba(34,211,238,.35);" : ""}">
        <b>${escapeHtml(k)}</b><br>
        <span class="adminSmallMuted">${escapeHtml(v ?? "")}</span>
      </div>`;
    })
    .join("");

  box.innerHTML = `
    <h2>Perfil completo do paciente</h2>
    <p class="small">
      Este perfil está vinculado ao <b>user_id real</b>: <span class="adminSmallMuted">${escapeHtml(userId)}</span>
    </p>

    <div class="noticeBox">
      <b>E-mail real do login/Auth:</b> ${authEmail ? escapeHtml(authEmail) : "não disponível — rode o SQL novo"}<br>
      <b>E-mail salvo no cadastro/profile:</b> ${escapeHtml(profileEmail || "")}<br>
      ${
        contacts.length
          ? `<b>Contatos familiares/cadastro:</b><br>${contacts.map(([k,v]) => `${escapeHtml(k)}: ${escapeHtml(v)}`).join("<br>")}`
          : "Nenhum campo de contato familiar identificado no profile."
      }
    </div>

    <div class="adminMiniGrid">
      <div><b>${rows.recordings.length}</b><br><span class="small">frases</span></div>
      <div><b>${rows.legacy.length}</b><br><span class="small">mensagens</span></div>
      <div><b>${rows.care.length}</b><br><span class="small">Care</span></div>
      <div><b>${rows.deletion.length}</b><br><span class="small">exclusões</span></div>
      <div><b>${escapeHtml(u.plan || "-")}</b><br><span class="small">plano</span></div>
    </div>

    <div class="adminToolbar">
      <button type="button" class="green" onclick="backupPatientZip('${escapeAttr(userId)}')">Baixar tudo do paciente</button>
      <button type="button" class="ghost" onclick="backupPatientJson('${escapeAttr(userId)}')">Baixar manifesto JSON</button>
    </div>

    <h3>Todos os campos do cadastro/profile</h3>
    <div class="adminDetailGrid">${allProfileFields}</div>

    <h3>Mensagens familiares</h3>
    <div class="adminAudioGrid">
      ${
        rows.legacy.length
          ? rows.legacy.map(m => `
            <div class="adminAudioItem">
              <b>${escapeHtml(m.title || "Mensagem")}</b>
              <p class="small">Para: ${escapeHtml(m.recipient || "-")}<br>${escapeHtml(m.note || m.text_note || "")}<br>${m.created_at ? new Date(m.created_at).toLocaleString("pt-BR") : ""}</p>
              ${m.audio_path ? `<button type="button" class="ghost" onclick="openAudio('${escapeAttr(m.audio_path)}','legacy')">Abrir áudio</button>` : "<p class='small'>Sem áudio.</p>"}
            </div>
          `).join("")
          : "<p class='small'>Nenhuma mensagem familiar.</p>"
      }
    </div>

    <h3>Gravações do banco de voz</h3>
    <div class="adminAudioGrid">
      ${
        rows.recordings.length
          ? rows.recordings.sort((a,b)=>Number(a.phrase_index)-Number(b.phrase_index)).map(r => `
            <div class="adminAudioItem">
              <b>Frase ${Number(r.phrase_index || 0) + 1}</b>
              <p class="small">${escapeHtml(r.phrase_text || "")}<br>${r.duration_ms ? Math.round(r.duration_ms/1000)+"s" : ""}</p>
              ${r.audio_path ? `<button type="button" class="ghost" onclick="openAudio('${escapeAttr(r.audio_path)}','voice')">Abrir áudio</button>` : "<p class='small'>Sem áudio.</p>"}
            </div>
          `).join("")
          : "<p class='small'>Nenhuma gravação.</p>"
      }
    </div>

    <h3>Solicitações de exclusão</h3>
    <div class="adminTableLike">
      ${
        rows.deletion.length
          ? rows.deletion.map(d => `
            <div class="dataItem">
              <b>Status: ${escapeHtml(d.status || "pendente")}</b>
              <p class="small">${escapeHtml(d.reason || "")}<br>${d.created_at ? new Date(d.created_at).toLocaleString("pt-BR") : ""}</p>
            </div>
          `).join("")
          : "<p class='small'>Nenhuma solicitação de exclusão.</p>"
      }
    </div>
  `;

  box.scrollIntoView({ behavior: "smooth", block: "start" });
}

async function signedUrl(path, type = "voice") {
  if (!path) throw new Error("Arquivo sem caminho.");
  const key = `${type}:${path}`;
  if (signedCache[key]) return signedCache[key];

  const sb = voziaSupabase || iniciarSupabase();
  const buckets = type === "legacy" ? LEGACY_BUCKETS : VOICE_BUCKETS;
  const errors = [];

  for (const bucket of buckets) {
    try {
      const { data, error } = await sb.storage.from(bucket).createSignedUrl(path, 60 * 30);
      if (!error && data?.signedUrl) {
        signedCache[key] = data.signedUrl;
        return data.signedUrl;
      }
      errors.push(`${bucket}: ${error?.message || "sem URL"}`);
    } catch (e) {
      errors.push(`${bucket}: ${e.message || e}`);
    }
  }

  throw new Error("Não consegui gerar link do áudio. " + errors.join(" | "));
}

async function openAudio(path, type = "voice") {
  try {
    const url = await signedUrl(path, type);
    window.open(url, "_blank");
  } catch (e) {
    alert(e.message || "Erro ao abrir áudio.");
  }
}

async function fetchAudioBlob(path, type) {
  const url = await signedUrl(path, type);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} ao baixar ${path}`);
  return await res.blob();
}

function patientManifest(userId) {
  const rows = getUserRows(userId);
  return {
    generated_at: new Date().toISOString(),
    identity_note: "Paciente identificado pelo profile.id/user_id do Supabase Auth. auth_email é o email real do Auth quando disponível. profile_email/email são campos salvos no cadastro.",
    profile: rows.profile,
    recordings: rows.recordings,
    legacy_messages: rows.legacy,
    care_requests: rows.care,
    deletion_requests: rows.deletion
  };
}

function platformManifest() {
  return {
    generated_at: new Date().toISOString(),
    patients: adminUsers,
    recordings: adminRecordings,
    legacy_messages: adminLegacy,
    care_requests: adminCare,
    deletion_requests: adminDeletionRequests
  };
}

async function backupPatientJson(userId) {
  const manifest = patientManifest(userId);
  const name = safeFile(getBestEmail(manifest.profile) || manifest.profile?.name || userId);
  downloadText(`manifesto-vozia-${name}.json`, JSON.stringify(manifest, null, 2), "application/json");
}

async function backupPatientZip(userId, existingZipRoot = null) {
  const manifest = patientManifest(userId);
  const profile = manifest.profile;
  if (!profile) throw new Error("Paciente não encontrado.");

  const zip = existingZipRoot ? null : new JSZip();
  const root = existingZipRoot || zip.folder(safeFile(getBestEmail(profile) || profile.name || userId));
  root.file("manifesto-paciente.json", JSON.stringify(manifest, null, 2));

  const voiceFolder = root.folder("banco-de-voz");
  const legacyFolder = root.folder("mensagens-familia");

  let errors = [];
  let total = 0;

  for (const r of manifest.recordings) {
    if (!r.audio_path) continue;
    total++;
    try {
      const blob = await fetchAudioBlob(r.audio_path, "voice");
      const idx = String(Number(r.phrase_index || 0) + 1).padStart(3, "0");
      const ext = getExt(r.audio_path, "webm");
      voiceFolder.file(`frase-${idx}.${ext}`, blob);
      voiceFolder.file(`frase-${idx}.txt`, r.phrase_text || "");
    } catch (e) {
      errors.push(`Frase ${Number(r.phrase_index || 0) + 1}: ${e.message || e}`);
    }
  }

  for (const m of manifest.legacy_messages) {
    if (!m.audio_path) continue;
    total++;
    try {
      const blob = await fetchAudioBlob(m.audio_path, "legacy");
      const ext = getExt(m.audio_path, "webm");
      const name = safeFile(m.title || "mensagem-familia");
      legacyFolder.file(`${name}-${m.id}.${ext}`, blob);
      legacyFolder.file(`${name}-${m.id}.txt`, `${m.title || ""}\nPara: ${m.recipient || ""}\n${m.note || m.text_note || ""}`);
    } catch (e) {
      errors.push(`Mensagem ${m.title || m.id}: ${e.message || e}`);
    }
  }

  if (errors.length) root.file("ERROS_BACKUP_AUDIO.txt", errors.join("\n"));
  if (total === 0) root.file("SEM_AUDIOS.txt", "Este paciente não possui audio_path em recordings ou legacy_messages.");

  if (!existingZipRoot) {
    const zipBlob = await zip.generateAsync({ type: "blob" });
    downloadBlob(`backup-vozia-${safeFile(getBestEmail(profile) || profile.name || userId)}.zip`, zipBlob);
  }
}

async function backupAllPlatformZip() {
  try {
    if (typeof JSZip === "undefined") {
      alert("JSZip não carregou. Atualize com Ctrl+F5.");
      return;
    }

    clearProgress();
    const zip = new JSZip();
    zip.file("manifesto-geral-plataforma.json", JSON.stringify(platformManifest(), null, 2));

    let i = 0;
    for (const u of adminUsers) {
      i++;
      progress(`Gerando backup ${i}/${adminUsers.length}: ${getBestEmail(u) || u.name || u.id}`);
      const folder = zip.folder(safeFile(getBestEmail(u) || u.name || u.id));
      await backupPatientZip(u.id, folder);
    }

    progress("Compactando backup geral...");
    const blob = await zip.generateAsync({ type: "blob" });
    downloadBlob(`backup-vozia-plataforma-${new Date().toISOString().slice(0,10)}.zip`, blob);
    progress("Backup geral finalizado.");
  } catch (e) {
    alert("Erro no backup geral: " + (e.message || "erro"));
    progress("ERRO: " + (e.message || "erro"));
  }
}

function backupAllJson() {
  downloadText(`manifesto-vozia-plataforma-${new Date().toISOString().slice(0,10)}.json`, JSON.stringify(platformManifest(), null, 2), "application/json");
}

function backupPatientsCsv() {
  const rows = [["user_id","nome","email_auth_login","email_profile_cadastro","plano","vault_id","frases","mensagens","care","exclusao","created_at"]];
  adminUsers.forEach(u => {
    const c = getUserCounts(u.id);
    rows.push([u.id || "", u.name || "", getAuthEmail(u) || "", getProfileEmail(u) || "", u.plan || "", u.vault_id || "", c.recordings, c.legacy, c.care, c.deletion, u.created_at || ""]);
  });
  const csv = rows.map(r => r.map(v => `"${String(v).replaceAll('"','""')}"`).join(",")).join("\n");
  downloadText(`pacientes-vozia-${new Date().toISOString().slice(0,10)}.csv`, csv, "text/csv");
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
  $("clearSearchBtn")?.addEventListener("click", () => {
    if ($("adminSearch")) $("adminSearch").value = "";
    renderUsers();
  });

  $("backupAllZipBtn")?.addEventListener("click", backupAllPlatformZip);
  $("backupAllJsonBtn")?.addEventListener("click", backupAllJson);
  $("backupPatientsCsvBtn")?.addEventListener("click", backupPatientsCsv);

  setupTabs();
  setTimeout(adminCheck, 400);
});
