// ============================================================
// VOZIA ADMIN — backup por paciente + pedidos de exclusão
// Versão estável: não mexe no login do paciente.
// ============================================================

const $ = (id) => document.getElementById(id);

let adminUsers = [];
let adminRecordings = [];
let adminLegacy = [];
let adminCare = [];
let adminDeletionRequests = [];
let signedCache = {};

const ADMIN_EMAILS = [
  "thalesrenogrilo@gmail.com"
];

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

function userById(userId) {
  return adminUsers.find(u => u.id === userId);
}

function userLabel(userId) {
  const u = userById(userId);
  if (!u) return userId || "-";
  return `${u.name || "Sem nome"} — ${u.email || ""}`;
}

function getUserCounts(userId) {
  return {
    recordings: adminRecordings.filter(r => r.user_id === userId).length,
    legacy: adminLegacy.filter(m => m.user_id === userId).length,
    care: adminCare.filter(c => c.user_id === userId).length,
    deletion: adminDeletionRequests.filter(d => d.user_id === userId).length
  };
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

function getExt(path, fallback = "webm") {
  const m = String(path || "").match(/\.([a-z0-9]+)(\?|$)/i);
  return m ? m[1].toLowerCase() : fallback;
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
  try {
    await voziaSignOut();
  } catch (e) {}
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

  if ($("adminWho")) {
    $("adminWho").textContent = "Administrador conectado: " + user.email;
  }

  await adminLoadAll();
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
      sb.from("profiles").select("*").order("created_at", { ascending: false }),
      sb.from("recordings").select("*").order("created_at", { ascending: false }).limit(5000),
      sb.from("legacy_messages").select("*").order("created_at", { ascending: false }).limit(5000),
      sb.from("vozia_care_requests").select("*").order("created_at", { ascending: false }).limit(5000),
      sb.from("deletion_requests").select("*").order("created_at", { ascending: false }).limit(5000)
    ]);

    if (profiles.error) throw profiles.error;
    if (recs.error) throw recs.error;
    if (legacy.error) throw legacy.error;
    if (care.error) throw care.error;
    if (deletion.error) throw deletion.error;

    adminUsers = profiles.data || [];
    adminRecordings = recs.data || [];
    adminLegacy = legacy.data || [];
    adminCare = care.data || [];
    adminDeletionRequests = deletion.data || [];
    signedCache = {};

    adminRender();
    adminMsg("Dados atualizados.", true);
    setTimeout(() => {
      const el = $("adminMsg");
      if (el) el.style.display = "none";
    }, 1200);
  } catch (e) {
    console.error(e);
    adminMsg(
      "Erro ao carregar dados. Rode o SQL de correção do admin no Supabase. Detalhe: " +
      (e.message || "erro")
    );
  }
}

function adminRender() {
  $("stTotal").textContent = adminUsers.length;
  $("stRecordings").textContent = adminRecordings.length;
  $("stLegacy").textContent = adminLegacy.length;
  $("stCare").textContent = adminCare.length;

  renderUsers();
  renderCare();
  renderLegacy();
  renderRecordings();
  renderDeletionRequests();
}

function renderUsers() {
  const box = $("adminUsersList");
  if (!box) return;

  const q = ($("adminSearch")?.value || "").toLowerCase();

  const rows = adminUsers.filter(u => {
    const hay = [
      u.name,
      u.email,
      u.plan,
      u.vault_id,
      u.subscription_status,
      u.id
    ].join(" ").toLowerCase();

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
        <b>${escapeHtml(u.name || "Sem nome")}</b>
        <p class="small">
          ${escapeHtml(u.email || "")}<br>
          Plano: ${escapeHtml(u.plan || "avaliacao")} • Cofre: ${escapeHtml(u.vault_id || "")}<br>
          Criado em: ${u.created_at ? new Date(u.created_at).toLocaleString("pt-BR") : "-"}<br>
          Termos: ${u.accepted_terms_at ? new Date(u.accepted_terms_at).toLocaleString("pt-BR") : "não informado"}<br>
          Gravações: ${c.recordings} • Legado: ${c.legacy} • Care: ${c.care} • Exclusão: ${c.deletion}
        </p>
        <div class="actions">
          <button type="button" class="green" onclick="adminBackupPatientZip('${escapeAttr(u.id)}')">Baixar backup do paciente</button>
          <button type="button" class="ghost" onclick="adminBackupPatientJson('${escapeAttr(u.id)}')">Manifesto JSON</button>
        </div>
      </div>
    `;
  }).join("");
}

function renderCare() {
  const box = $("adminCareList");
  if (!box) return;

  if (!adminCare.length) {
    box.innerHTML = "<p class='small'>Nenhum pedido do Vozia Care ainda.</p>";
    return;
  }

  box.innerHTML = adminCare.map(r => `
    <div class="dataItem">
      <b>${escapeHtml(userLabel(r.user_id))}</b>
      <p class="small">
        Modelo: ${escapeHtml(r.app_model || "Vozia Care")}<br>
        Status: ${escapeHtml(r.status || "solicitado")}<br>
        Interesse teclado: ${escapeHtml(r.keyboard_interest || "não")}<br>
        ${escapeHtml(r.notes || "")}<br>
        ${r.created_at ? new Date(r.created_at).toLocaleString("pt-BR") : ""}
      </p>
    </div>
  `).join("");
}

function renderLegacy() {
  const box = $("adminLegacyList");
  if (!box) return;

  if (!adminLegacy.length) {
    box.innerHTML = "<p class='small'>Nenhuma mensagem ainda.</p>";
    return;
  }

  box.innerHTML = adminLegacy.map(m => `
    <div class="dataItem">
      <b>${escapeHtml(userLabel(m.user_id))}</b>
      <p class="small">
        ${m.is_priority ? "⭐ PRIORITÁRIA<br>" : ""}
        Título: ${escapeHtml(m.title || "Mensagem")}<br>
        Para: ${escapeHtml(m.recipient || "-")}<br>
        ${escapeHtml(m.note || m.text_note || "")}<br>
        Áudio: ${escapeHtml(m.audio_path || "sem áudio")}<br>
        ${m.created_at ? new Date(m.created_at).toLocaleString("pt-BR") : ""}
      </p>
      ${m.audio_path ? `<button type="button" class="ghost" onclick="adminOpenAudio('${escapeAttr(m.audio_path)}','legacy')">Abrir áudio</button>` : ""}
    </div>
  `).join("");
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
      <b>${escapeHtml(userLabel(r.user_id))} — Frase ${Number(r.phrase_index || 0) + 1}</b>
      <p class="small">
        Categoria: ${escapeHtml(r.phrase_category || "-")}<br>
        Duração: ${r.duration_ms ? Math.round(r.duration_ms / 1000) + "s" : "-"}<br>
        ${escapeHtml(r.phrase_text || "")}<br>
        Áudio: ${escapeHtml(r.audio_path || "sem áudio")}<br>
        ${r.created_at ? new Date(r.created_at).toLocaleString("pt-BR") : ""}
      </p>
      ${r.audio_path ? `<button type="button" class="ghost" onclick="adminOpenAudio('${escapeAttr(r.audio_path)}','voice')">Abrir áudio</button>` : ""}
    </div>
  `).join("");
}

function renderDeletionRequests() {
  const box = $("adminDeletionList");
  if (!box) return;

  if (!adminDeletionRequests.length) {
    box.innerHTML = "<p class='small'>Nenhuma solicitação de exclusão.</p>";
    return;
  }

  box.innerHTML = adminDeletionRequests.map(r => {
    const u = userById(r.user_id);
    return `
      <div class="dataItem">
        <b>${escapeHtml(u?.name || "Paciente")} — ${escapeHtml(u?.email || r.user_id || "")}</b>
        <p class="small">
          Status: ${escapeHtml(r.status || "pendente")}<br>
          Motivo: ${escapeHtml(r.reason || "")}<br>
          ${r.decision_note ? "Decisão: " + escapeHtml(r.decision_note) + "<br>" : ""}
          Criado em: ${r.created_at ? new Date(r.created_at).toLocaleString("pt-BR") : ""}
        </p>
      </div>
    `;
  }).join("");
}

async function signedUrl(path, type = "voice") {
  if (!path) throw new Error("Arquivo sem caminho.");

  const buckets = type === "legacy" ? LEGACY_BUCKETS : VOICE_BUCKETS;
  const key = `${type}:${path}`;
  if (signedCache[key]) return signedCache[key];

  const sb = voziaSupabase || iniciarSupabase();
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

async function adminOpenAudio(path, type = "voice") {
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
  const profile = userById(userId);
  return {
    generated_at: new Date().toISOString(),
    profile,
    recordings: adminRecordings.filter(r => r.user_id === userId),
    legacy_messages: adminLegacy.filter(m => m.user_id === userId),
    care_requests: adminCare.filter(c => c.user_id === userId),
    deletion_requests: adminDeletionRequests.filter(d => d.user_id === userId)
  };
}

async function adminBackupPatientJson(userId) {
  const manifest = patientManifest(userId);
  const name = safeFile(manifest.profile?.email || manifest.profile?.name || userId);
  downloadText(`manifesto-vozia-${name}.json`, JSON.stringify(manifest, null, 2), "application/json");
}

async function adminBackupPatientZip(userId) {
  try {
    if (typeof JSZip === "undefined") {
      alert("JSZip não carregou. Atualize a página com Ctrl+F5 e tente novamente.");
      return;
    }

    const manifest = patientManifest(userId);
    const profile = manifest.profile;

    if (!profile) {
      alert("Paciente não encontrado.");
      return;
    }

    const zip = new JSZip();
    const root = zip.folder(safeFile(profile.email || profile.name || userId));
    root.file("manifesto-paciente.json", JSON.stringify(manifest, null, 2));

    const voiceFolder = root.folder("banco-de-voz");
    const legacyFolder = root.folder("mensagens-familia");

    let total = 0;
    let errors = [];

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

    if (errors.length) {
      root.file("ERROS_BACKUP_AUDIO.txt", errors.join("\n"));
    }

    if (total === 0) {
      root.file("SEM_AUDIOS.txt", "Este paciente não possui audio_path em recordings ou legacy_messages.");
    }

    const zipBlob = await zip.generateAsync({ type: "blob" });
    downloadBlob(`backup-vozia-${safeFile(profile.email || profile.name || userId)}.zip`, zipBlob);
  } catch (e) {
    alert("Erro ao gerar backup do paciente: " + (e.message || "erro"));
  }
}

document.addEventListener("DOMContentLoaded", () => {
  $("adminLoginBtn")?.addEventListener("click", adminLogin);
  $("adminLogoutBtn")?.addEventListener("click", adminLogout);
  $("reloadAdminBtn")?.addEventListener("click", adminLoadAll);
  $("adminSearch")?.addEventListener("input", renderUsers);

  setTimeout(adminCheck, 400);
});
