// ============================================================
// VOZIA ADMIN BACKUP REAL — baixa áudios em ZIP
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
  "gravacoes-de-voz",
  "voz do banco vo zia",
  "voz do banco vozia"
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
  const el = $("backupProgress");
  const out = $("backupOutput");
  if (el) {
    el.style.display = "block";
    el.textContent = text;
  }
  if (out) {
    out.value += text + "\n";
    out.scrollTop = out.scrollHeight;
  }
}

function clearProgress() {
  if ($("backupOutput")) $("backupOutput").value = "";
  if ($("backupProgress")) {
    $("backupProgress").style.display = "none";
    $("backupProgress").textContent = "";
  }
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

  if (error) throw new Error("Erro ao consultar admin_users. Rode o SQL do admin.");

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
    adminMsg(e.message || "Erro ao verificar administrador.");
  }
}

async function adminLoadAll() {
  const sb = voziaSupabase || iniciarSupabase();

  try {
    adminMsg("Carregando dados...", true);

    const [profiles, recs, legacy, care] = await Promise.all([
      sb.from("profiles").select("*").order("created_at", { ascending: false }),
      sb.from("recordings").select("*").order("created_at", { ascending: false }).limit(5000),
      sb.from("legacy_messages").select("*").order("created_at", { ascending: false }).limit(5000),
      sb.from("vozia_care_requests").select("*").order("created_at", { ascending: false }).limit(5000)
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
    $("adminMsg").style.display = "none";
  } catch (e) {
    adminMsg("Erro ao carregar dados: " + (e.message || "erro") + ". Confira SQL/policies do admin.");
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

function userFolderName(u) {
  return safeFile(`${u?.name || "paciente"}-${u?.email || u?.id || "sem-email"}`);
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
              ID: ${escapeHtml(u.id || "")}
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
          <button type="button" class="green" onclick="backupPatientZip('${u.id}')">Baixar ZIP do paciente</button>
          <button type="button" class="ghost" onclick="debugPatientAudio('${u.id}')">Diagnosticar áudios</button>
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

  box.innerHTML = adminRecordings.slice(0, 120).map(r => `
    <div class="dataItem">
      <b>${escapeHtml(userLabel(r.user_id))}</b>
      <p class="small">
        Frase ${Number(r.phrase_index || 0) + 1} • ${escapeHtml(r.phrase_category || "-")}<br>
        ${escapeHtml(r.phrase_text || "")}<br>
        Caminho: ${escapeHtml(r.audio_path || "")}<br>
        Duração: ${r.duration_ms ? Math.round(r.duration_ms / 1000) + "s" : "-"}
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
        Caminho: ${escapeHtml(m.audio_path || "")}<br>
        ${escapeHtml(m.note || "")}
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
        Observação: ${escapeHtml(c.notes || "")}
      </p>
    </div>
  `).join("");
}

function renderReturns() {
  const box = $("adminReturnList");
  if (!box) return;

  box.innerHTML = adminUsers.map(u => {
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

    return `
      <div class="dataItem ${cls}">
        <b>${escapeHtml(u.name || "Sem nome")}</b>
        <p class="small">
          ${escapeHtml(u.email || "")}<br>
          Status: <b>${escapeHtml(status)}</b><br>
          Gravações: ${c.recordings} • Mensagens: ${c.legacy} • Pedidos Care: ${c.care}
        </p>
        <button type="button" onclick="adminOpenPatient('${u.id}')">Abrir acompanhamento</button>
      </div>
    `;
  }).join("");
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
      <button onclick="backupPatientZip('${userId}')" type="button" class="green">Baixar ZIP do paciente</button>
      <button onclick="debugPatientAudio('${userId}')" type="button" class="ghost">Diagnosticar áudios</button>
    </div>

    <h3>Áudios do Banco de Voz</h3>
    <div class="adminAudioGrid">
      ${
        recordings.length
          ? recordings.map(r => `
            <div class="adminAudioItem">
              <b>Frase ${Number(r.phrase_index || 0) + 1}</b>
              <p class="small">${escapeHtml(r.phrase_text || "")}<br>Caminho: ${escapeHtml(r.audio_path || "")}</p>
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
              <p class="small">Para: ${escapeHtml(m.recipient || "-")}<br>${escapeHtml(m.note || "")}<br>Caminho: ${escapeHtml(m.audio_path || "")}</p>
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
  let errors = [];

  for (const bucket of buckets) {
    const { data, error } = await sb.storage
      .from(bucket)
      .createSignedUrl(path, 60 * 30);

    if (!error && data?.signedUrl) {
      signedCache[cacheKey] = data.signedUrl;
      return data.signedUrl;
    }

    errors.push(`${bucket}: ${error?.message || "sem URL"}`);
  }

  throw new Error("Não encontrei o áudio. Tentativas: " + errors.join(" | "));
}

async function fetchAudioBlob(path, type = "voice") {
  const url = await signedUrl(path, type);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Falha ao baixar ${path}: HTTP ${res.status}`);
  return await res.blob();
}

function getExt(path, fallback = "mp4") {
  const m = String(path || "").match(/\.([a-z0-9]+)(\?|$)/i);
  return m ? m[1].toLowerCase() : fallback;
}

async function adminOpenAudio(path, type = "voice") {
  try {
    const url = await signedUrl(path, type);
    window.open(url, "_blank");
  } catch (e) {
    alert("Erro ao abrir áudio: " + (e.message || "erro"));
  }
}

async function backupPatientZip(userId) {
  try {
    clearProgress();

    const user = userById(userId);
    if (!user) throw new Error("Paciente não encontrado.");

    const recordings = adminRecordings
      .filter(r => r.user_id === userId)
      .sort((a,b) => Number(a.phrase_index) - Number(b.phrase_index));

    const legacy = adminLegacy.filter(m => m.user_id === userId && m.audio_path);

    if (!recordings.length && !legacy.length) {
      alert("Este paciente ainda não tem áudios para backup.");
      return;
    }

    const zip = new JSZip();
    const root = zip.folder(userFolderName(user));
    const voiceFolder = root.folder("banco-de-voz");
    const legacyFolder = root.folder("mensagens-legado");

    root.file("manifesto-paciente.json", JSON.stringify({
      generated_at: new Date().toISOString(),
      profile: user,
      recordings,
      legacy_messages: adminLegacy.filter(m => m.user_id === userId),
      care_requests: adminCare.filter(c => c.user_id === userId)
    }, null, 2));

    let total = recordings.length + legacy.length;
    let done = 0;

    for (const r of recordings) {
      done++;
      progress(`Baixando áudio ${done}/${total}: frase ${Number(r.phrase_index) + 1}`);

      const blob = await fetchAudioBlob(r.audio_path, "voice");
      const ext = getExt(r.audio_path, "mp4");
      const fileName = `frase-${String(Number(r.phrase_index) + 1).padStart(3, "0")}.${ext}`;

      voiceFolder.file(fileName, blob);
      voiceFolder.file(`frase-${String(Number(r.phrase_index) + 1).padStart(3, "0")}.txt`, r.phrase_text || "");
    }

    for (const m of legacy) {
      done++;
      progress(`Baixando mensagem ${done}/${total}: ${m.title || "mensagem"}`);

      const blob = await fetchAudioBlob(m.audio_path, "legacy");
      const ext = getExt(m.audio_path, "mp4");
      const fileName = `${safeFile(m.title || "mensagem")}-${m.id || Date.now()}.${ext}`;

      legacyFolder.file(fileName, blob);
      legacyFolder.file(`${safeFile(m.title || "mensagem")}-${m.id || Date.now()}.txt`, m.note || "");
    }

    progress("Gerando arquivo ZIP...");
    const zipBlob = await zip.generateAsync({ type: "blob" });
    downloadBlob(`backup-vozia-${userFolderName(user)}.zip`, zipBlob);
    progress("Backup ZIP finalizado.");
  } catch (e) {
    alert("Erro no backup: " + (e.message || "erro"));
    progress("ERRO: " + (e.message || "erro"));
  }
}

async function backupAllAudioZip() {
  try {
    clearProgress();

    const zip = new JSZip();
    const manifest = {
      generated_at: new Date().toISOString(),
      total_users: adminUsers.length,
      total_recordings: adminRecordings.length,
      total_legacy_messages: adminLegacy.length,
      users: []
    };

    let total = adminRecordings.length + adminLegacy.filter(m => m.audio_path).length;
    let done = 0;

    for (const user of adminUsers) {
      const userRoot = zip.folder(userFolderName(user));
      const voiceFolder = userRoot.folder("banco-de-voz");
      const legacyFolder = userRoot.folder("mensagens-legado");

      const recordings = adminRecordings
        .filter(r => r.user_id === user.id)
        .sort((a,b) => Number(a.phrase_index) - Number(b.phrase_index));

      const legacy = adminLegacy.filter(m => m.user_id === user.id);
      const legacyWithAudio = legacy.filter(m => m.audio_path);

      manifest.users.push({
        profile: user,
        recordings,
        legacy_messages: legacy,
        care_requests: adminCare.filter(c => c.user_id === user.id)
      });

      userRoot.file("manifesto-paciente.json", JSON.stringify(manifest.users[manifest.users.length - 1], null, 2));

      for (const r of recordings) {
        done++;
        progress(`Baixando ${done}/${total}: ${user.email || user.id} frase ${Number(r.phrase_index) + 1}`);

        try {
          const blob = await fetchAudioBlob(r.audio_path, "voice");
          const ext = getExt(r.audio_path, "mp4");
          voiceFolder.file(`frase-${String(Number(r.phrase_index) + 1).padStart(3, "0")}.${ext}`, blob);
          voiceFolder.file(`frase-${String(Number(r.phrase_index) + 1).padStart(3, "0")}.txt`, r.phrase_text || "");
        } catch (e) {
          voiceFolder.file(`ERRO-frase-${String(Number(r.phrase_index) + 1).padStart(3, "0")}.txt`, e.message || "erro");
        }
      }

      for (const m of legacyWithAudio) {
        done++;
        progress(`Baixando ${done}/${total}: ${user.email || user.id} legado ${m.title || ""}`);

        try {
          const blob = await fetchAudioBlob(m.audio_path, "legacy");
          const ext = getExt(m.audio_path, "mp4");
          legacyFolder.file(`${safeFile(m.title || "mensagem")}-${m.id || Date.now()}.${ext}`, blob);
          legacyFolder.file(`${safeFile(m.title || "mensagem")}-${m.id || Date.now()}.txt`, m.note || "");
        } catch (e) {
          legacyFolder.file(`ERRO-${safeFile(m.title || "mensagem")}.txt`, e.message || "erro");
        }
      }
    }

    zip.file("manifesto-geral.json", JSON.stringify(manifest, null, 2));

    progress("Gerando ZIP geral...");
    const zipBlob = await zip.generateAsync({ type: "blob" });
    downloadBlob(`backup-geral-vozia-audios-${new Date().toISOString().slice(0,10)}.zip`, zipBlob);
    progress("Backup geral finalizado.");
  } catch (e) {
    alert("Erro no backup geral: " + (e.message || "erro"));
    progress("ERRO: " + (e.message || "erro"));
  }
}

async function debugPatientAudio(userId) {
  clearProgress();
  const user = userById(userId);
  const recordings = adminRecordings.filter(r => r.user_id === userId);

  progress(`Paciente: ${user?.email || userId}`);
  progress(`Total de registros na tabela recordings: ${recordings.length}`);

  if (!recordings.length) {
    progress("A tabela recordings não tem nenhum áudio para este usuário.");
    return;
  }

  for (const r of recordings) {
    progress(`Testando frase ${Number(r.phrase_index) + 1}: ${r.audio_path}`);
    try {
      const url = await signedUrl(r.audio_path, "voice");
      progress(`OK: link gerado`);
    } catch (e) {
      progress(`ERRO: ${e.message}`);
    }
  }

  $("backupOutput").scrollIntoView({ behavior: "smooth" });
}

async function adminBackupJson() {
  const manifest = {
    generated_at: new Date().toISOString(),
    users: adminUsers,
    recordings: adminRecordings,
    legacy_messages: adminLegacy,
    care_requests: adminCare
  };
  downloadText(`manifesto-vozia-${new Date().toISOString().slice(0,10)}.json`, JSON.stringify(manifest, null, 2), "application/json");
}

function adminBackupCsv() {
  const rows = [["nome","email","plano","vault_id","total_gravacoes","total_mensagens","total_care","created_at"]];
  adminUsers.forEach(u => {
    const c = getUserCounts(u.id);
    rows.push([u.name || "", u.email || "", u.plan || "", u.vault_id || "", c.recordings, c.legacy, c.care, u.created_at || ""]);
  });
  const csv = rows.map(r => r.map(v => `"${String(v).replaceAll('"','""')}"`).join(",")).join("\n");
  downloadText(`pacientes-vozia-${new Date().toISOString().slice(0,10)}.csv`, csv, "text/csv");
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

function downloadText(filename, text, type) {
  downloadBlob(filename, new Blob([text], { type }));
}

function safeFile(text) {
  return String(text || "arquivo")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9-_@.]+/gi, "-")
    .replace(/-+/g, "-")
    .slice(0, 90);
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

  $("backupAllAudioZipBtn")?.addEventListener("click", backupAllAudioZip);
  $("backupJsonBtn")?.addEventListener("click", adminBackupJson);
  $("backupCsvBtn")?.addEventListener("click", adminBackupCsv);

  setupTabs();
  setTimeout(adminCheck, 500);
});
