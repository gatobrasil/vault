// ============================================================
// VOZIA ADMIN — Storage Real por storage.list()
// Coloque em: public/admin.js
//
// Corrige:
// - Não depende de storage.objects.
// - Lista arquivos reais com supabase.storage.from(bucket).list()
// - Encontra áudios dentro de voice-recordings/USER_ID/frase-xxx
// - Faz backup ZIP com arquivos reais.
// ============================================================

const $ = (id) => document.getElementById(id);

let adminUsers = [];
let adminRecordings = [];
let adminLegacy = [];
let adminCare = [];
let storageFiles = [];
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

const ALL_AUDIO_BUCKETS = [...VOICE_BUCKETS, ...LEGACY_BUCKETS];

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

    if ($("adminWho")) {
      $("adminWho").textContent = "Administrador conectado: " + user.email;
    }

    await adminLoadAll();
  } catch (e) {
    adminMsg(e.message || "Erro ao verificar administrador.");
  }
}

async function adminLoadAll() {
  const sb = voziaSupabase || iniciarSupabase();

  try {
    adminMsg("Carregando dados...", true);
    clearProgress();

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

    progress("Procurando arquivos reais no Storage...");
    await loadRealStorageFilesByList();

    adminRenderAll();

    if ($("adminMsg")) $("adminMsg").style.display = "none";
  } catch (e) {
    adminMsg("Erro ao carregar dados: " + (e.message || "erro") + ". Confira SQL/policies do admin.");
  }
}

// Lista recursivamente usando Storage API, não storage.objects
async function listBucketRecursive(bucket, path = "", depth = 0) {
  const sb = voziaSupabase || iniciarSupabase();
  const results = [];

  if (depth > 5) return results;

  const { data, error } = await sb.storage
    .from(bucket)
    .list(path, {
      limit: 1000,
      offset: 0,
      sortBy: { column: "name", order: "asc" }
    });

  if (error) {
    throw new Error(`${bucket}/${path || ""}: ${error.message}`);
  }

  for (const item of data || []) {
    const fullPath = path ? `${path}/${item.name}` : item.name;

    // Pasta no Supabase geralmente não tem metadata.size e pode ter id null
    const isFolder =
      item.id === null ||
      item.metadata === null ||
      item.metadata === undefined ||
      item.metadata?.mimetype === undefined && item.metadata?.size === undefined;

    if (isFolder) {
      const children = await listBucketRecursive(bucket, fullPath, depth + 1);
      results.push(...children);
    } else {
      results.push({
        bucket_id: bucket,
        name: fullPath,
        id: item.id,
        metadata: item.metadata || {},
        created_at: item.created_at || null,
        updated_at: item.updated_at || null
      });
    }
  }

  return results;
}

async function loadRealStorageFilesByList() {
  storageFiles = [];
  const logs = [];

  for (const bucket of ALL_AUDIO_BUCKETS) {
    try {
      const files = await listBucketRecursive(bucket);
      storageFiles.push(...files);
      logs.push(`OK ${bucket}: ${files.length} arquivo(s)`);
    } catch (e) {
      logs.push(`ERRO ${bucket}: ${e.message}`);
    }
  }

  progress("Resultado Storage:");
  logs.forEach(l => progress(l));
  progress(`Total de arquivos reais encontrados: ${storageFiles.length}`);

  return storageFiles;
}

function adminRenderAll() {
  if ($("stTotal")) $("stTotal").textContent = adminUsers.length;
  if ($("stRecordings")) $("stRecordings").textContent = adminRecordings.length;
  if ($("stLegacy")) $("stLegacy").textContent = adminLegacy.length;
  if ($("stCare")) $("stCare").textContent = adminCare.length;

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

function getRealFilesForUser(userId) {
  return storageFiles.filter(f => {
    const name = String(f.name || "");
    return name === userId || name.startsWith(userId + "/") || name.includes("/" + userId + "/");
  });
}

function getRealFilesForRecording(recording) {
  const path = String(recording?.audio_path || "");
  const userId = String(recording?.user_id || "");
  const phraseIndex = Number(recording?.phrase_index || 0) + 1;
  const phrasePad = String(phraseIndex).padStart(3, "0");

  const exact = storageFiles.filter(f => String(f.name || "") === path);
  if (exact.length) return exact;

  const byEnding = storageFiles.filter(f => path && String(f.name || "").endsWith(path));
  if (byEnding.length) return byEnding;

  const byUserAndPhrase = storageFiles.filter(f => {
    const name = String(f.name || "");
    return name.startsWith(userId + "/") &&
      (
        name.includes(`frase-${phrasePad}`) ||
        name.includes(`frase-${phraseIndex}`) ||
        name.includes(`-${phrasePad}-`)
      );
  });

  if (byUserAndPhrase.length) return byUserAndPhrase;

  return [];
}

function getUserCounts(userId) {
  return {
    recordings: adminRecordings.filter(r => r.user_id === userId).length,
    legacy: adminLegacy.filter(m => m.user_id === userId).length,
    care: adminCare.filter(c => c.user_id === userId).length,
    realFiles: getRealFilesForUser(userId).length
  };
}

function renderUsers() {
  const box = $("adminUsersList");
  if (!box) return;

  const q = ($("adminSearch")?.value || "").toLowerCase();

  const rows = adminUsers.filter(u => {
    const hay = [u.name, u.email, u.plan, u.vault_id, u.subscription_status, u.id].join(" ").toLowerCase();
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
            <span class="adminBadge">${c.recordings} registros</span>
            <span class="adminBadge">${c.realFiles} arquivos reais</span>
            <span class="adminBadge">${c.legacy} mensagens</span>
            <span class="adminBadge">${c.care} pedidos</span>
          </div>
        </div>
        <div class="adminToolbar">
          <button type="button" onclick="adminOpenPatient('${u.id}')">Abrir paciente</button>
          <button type="button" class="green" onclick="backupPatientZip('${u.id}')">Baixar ZIP do paciente</button>
          <button type="button" class="ghost" onclick="debugPatientAudio('${u.id}')">Diagnosticar arquivos reais</button>
        </div>
      </div>
    `;
  }).join("");
}

function renderRecordings() {
  const box = $("adminRecordingsList");
  if (!box) return;

  if (!adminRecordings.length && !storageFiles.length) {
    box.innerHTML = "<p class='small'>Nenhuma gravação e nenhum arquivo real encontrado.</p>";
    return;
  }

  const recHtml = adminRecordings.slice(0, 120).map(r => {
    const real = getRealFilesForRecording(r);
    return `
      <div class="dataItem">
        <b>${escapeHtml(userLabel(r.user_id))}</b>
        <p class="small">
          Frase ${Number(r.phrase_index || 0) + 1} • ${escapeHtml(r.phrase_category || "-")}<br>
          ${escapeHtml(r.phrase_text || "")}<br>
          audio_path na tabela: ${escapeHtml(r.audio_path || "")}<br>
          Arquivos reais encontrados: ${real.length}
        </p>
        ${
          real.length
            ? real.map(f => `<button type="button" onclick="adminOpenRealFile('${escapeAttr(f.bucket_id)}','${escapeAttr(f.name)}')">Abrir real</button>`).join(" ")
            : `<button type="button" onclick="debugRecording('${escapeAttr(r.id || "")}')">Diagnosticar</button>`
        }
      </div>
    `;
  }).join("");

  const orphanHtml = storageFiles.length
    ? `
      <h3>Arquivos reais encontrados no Storage</h3>
      ${storageFiles.slice(0, 200).map(f => `
        <div class="dataItem">
          <b>${escapeHtml(f.bucket_id)}</b>
          <p class="small">${escapeHtml(f.name)}<br>${f.created_at ? new Date(f.created_at).toLocaleString("pt-BR") : ""}</p>
          <button type="button" onclick="adminOpenRealFile('${escapeAttr(f.bucket_id)}','${escapeAttr(f.name)}')">Abrir/Baixar arquivo real</button>
        </div>
      `).join("")}
    `
    : "";

  box.innerHTML = recHtml + orphanHtml;
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
    } else if (c.recordings > 0 || c.realFiles > 0) {
      status = "Começou banco de voz";
      cls = "";
    }

    return `
      <div class="dataItem ${cls}">
        <b>${escapeHtml(u.name || "Sem nome")}</b>
        <p class="small">
          ${escapeHtml(u.email || "")}<br>
          Status: <b>${escapeHtml(status)}</b><br>
          Registros: ${c.recordings} • Arquivos reais: ${c.realFiles} • Mensagens: ${c.legacy} • Care: ${c.care}
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

  const realFiles = getRealFilesForUser(userId);
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
      <div><b>${recordings.length}</b><br><span class="small">registros</span></div>
      <div><b>${realFiles.length}</b><br><span class="small">arquivos reais</span></div>
      <div><b>${legacy.length}</b><br><span class="small">mensagens</span></div>
      <div><b>${care.length}</b><br><span class="small">pedidos Care</span></div>
    </div>

    <div class="adminToolbar">
      <button onclick="backupPatientZip('${userId}')" type="button" class="green">Baixar ZIP do paciente</button>
      <button onclick="debugPatientAudio('${userId}')" type="button" class="ghost">Diagnosticar arquivos reais</button>
    </div>

    <h3>Arquivos reais encontrados no Storage</h3>
    <div class="adminAudioGrid">
      ${
        realFiles.length
          ? realFiles.map(f => `
            <div class="adminAudioItem">
              <b>${escapeHtml(f.bucket_id)}</b>
              <p class="small">${escapeHtml(f.name)}</p>
              <button type="button" onclick="adminOpenRealFile('${escapeAttr(f.bucket_id)}','${escapeAttr(f.name)}')">Ouvir/Baixar real</button>
            </div>
          `).join("")
          : "<p class='small'>Nenhum arquivo real encontrado para o ID deste paciente.</p>"
      }
    </div>

    <h3>Registros na tabela recordings</h3>
    <div class="adminAudioGrid">
      ${
        recordings.length
          ? recordings.map(r => {
              const real = getRealFilesForRecording(r);
              return `
                <div class="adminAudioItem">
                  <b>Frase ${Number(r.phrase_index || 0) + 1}</b>
                  <p class="small">
                    ${escapeHtml(r.phrase_text || "")}<br>
                    audio_path: ${escapeHtml(r.audio_path || "")}<br>
                    arquivos reais ligados: ${real.length}
                  </p>
                  ${real.map(f => `<button type="button" onclick="adminOpenRealFile('${escapeAttr(f.bucket_id)}','${escapeAttr(f.name)}')">Abrir real</button>`).join(" ")}
                </div>
              `;
            }).join("")
          : "<p class='small'>Nenhum registro na tabela recordings.</p>"
      }
    </div>
  `;

  box.scrollIntoView({ behavior: "smooth", block: "start" });
}

async function signedUrlByBucket(bucket, path) {
  const cacheKey = `${bucket}:${path}`;
  if (signedCache[cacheKey]) return signedCache[cacheKey];

  const sb = voziaSupabase || iniciarSupabase();

  const { data, error } = await sb.storage
    .from(bucket)
    .createSignedUrl(path, 60 * 30);

  if (error) throw error;
  if (!data?.signedUrl) throw new Error("Sem signed URL.");

  signedCache[cacheKey] = data.signedUrl;
  return data.signedUrl;
}

async function signedUrl(path, type = "voice") {
  if (!path) throw new Error("Arquivo sem caminho.");

  const realExact = storageFiles.find(f => f.name === path || f.name.endsWith(path));
  if (realExact) return signedUrlByBucket(realExact.bucket_id, realExact.name);

  const buckets = type === "legacy" ? LEGACY_BUCKETS : VOICE_BUCKETS;
  let errors = [];

  for (const bucket of buckets) {
    try {
      return await signedUrlByBucket(bucket, path);
    } catch (e) {
      errors.push(`${bucket}: ${e.message}`);
    }
  }

  throw new Error("Não encontrei o áudio. Tentativas: " + errors.join(" | "));
}

async function adminOpenRealFile(bucket, path) {
  try {
    const url = await signedUrlByBucket(bucket, path);
    window.open(url, "_blank");
  } catch (e) {
    alert("Erro ao abrir arquivo real: " + (e.message || "erro"));
  }
}

async function adminOpenAudio(path, type = "voice") {
  try {
    const url = await signedUrl(path, type);
    window.open(url, "_blank");
  } catch (e) {
    alert("Erro ao abrir áudio: " + (e.message || "erro"));
  }
}

async function fetchRealBlob(bucket, path) {
  const url = await signedUrlByBucket(bucket, path);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Falha ao baixar ${bucket}/${path}: HTTP ${res.status}`);
  return await res.blob();
}

function getExt(path, fallback = "mp4") {
  const m = String(path || "").match(/\.([a-z0-9]+)(\?|$)/i);
  return m ? m[1].toLowerCase() : fallback;
}

async function backupPatientZip(userId) {
  try {
    clearProgress();

    const user = userById(userId);
    if (!user) throw new Error("Paciente não encontrado.");

    const realFiles = getRealFilesForUser(userId);
    const recordings = adminRecordings.filter(r => r.user_id === userId);
    const legacy = adminLegacy.filter(m => m.user_id === userId);
    const care = adminCare.filter(c => c.user_id === userId);

    if (!realFiles.length) {
      alert("Não encontrei arquivos reais no Storage para este paciente. Use Diagnosticar arquivos reais.");
      return;
    }

    const zip = new JSZip();
    const root = zip.folder(userFolderName(user));
    const audioFolder = root.folder("arquivos-reais-storage");

    root.file("manifesto-paciente.json", JSON.stringify({
      generated_at: new Date().toISOString(),
      profile: user,
      recordings,
      legacy_messages: legacy,
      care_requests: care,
      real_storage_files: realFiles
    }, null, 2));

    let done = 0;
    for (const f of realFiles) {
      done++;
      progress(`Baixando arquivo real ${done}/${realFiles.length}: ${f.bucket_id}/${f.name}`);

      try {
        const blob = await fetchRealBlob(f.bucket_id, f.name);
        const ext = getExt(f.name, "mp4");
        const cleanName = safeFile(f.name.split("/").pop() || `audio-${done}.${ext}`);
        audioFolder.file(`${String(done).padStart(3,"0")}-${cleanName}`, blob);
      } catch (e) {
        audioFolder.file(`ERRO-${String(done).padStart(3,"0")}.txt`, `${f.bucket_id}/${f.name}\n${e.message}`);
      }
    }

    progress("Gerando ZIP...");
    const zipBlob = await zip.generateAsync({ type: "blob" });
    downloadBlob(`backup-real-${userFolderName(user)}.zip`, zipBlob);
    progress("Backup finalizado.");
  } catch (e) {
    alert("Erro no backup: " + (e.message || "erro"));
    progress("ERRO: " + (e.message || "erro"));
  }
}

async function backupAllAudioZip() {
  try {
    clearProgress();

    if (!storageFiles.length) {
      alert("Nenhum arquivo real encontrado no Storage.");
      return;
    }

    const zip = new JSZip();
    zip.file("manifesto-storage-geral.json", JSON.stringify({
      generated_at: new Date().toISOString(),
      users: adminUsers,
      recordings: adminRecordings,
      legacy_messages: adminLegacy,
      care_requests: adminCare,
      real_storage_files: storageFiles
    }, null, 2));

    let done = 0;
    for (const f of storageFiles) {
      done++;
      const userId = String(f.name || "").split("/")[0];
      const user = userById(userId);
      const folder = zip.folder(user ? userFolderName(user) : "arquivos-sem-usuario-identificado");

      progress(`Baixando arquivo real ${done}/${storageFiles.length}: ${f.bucket_id}/${f.name}`);

      try {
        const blob = await fetchRealBlob(f.bucket_id, f.name);
        const fileName = safeFile(f.name.replaceAll("/", "-"));
        folder.file(`${String(done).padStart(4,"0")}-${fileName}`, blob);
      } catch (e) {
        folder.file(`ERRO-${String(done).padStart(4,"0")}.txt`, `${f.bucket_id}/${f.name}\n${e.message}`);
      }
    }

    progress("Gerando ZIP geral...");
    const zipBlob = await zip.generateAsync({ type: "blob" });
    downloadBlob(`backup-real-vozia-storage-${new Date().toISOString().slice(0,10)}.zip`, zipBlob);
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
  const realFiles = getRealFilesForUser(userId);

  progress(`Paciente: ${user?.email || userId}`);
  progress(`ID do paciente: ${userId}`);
  progress(`Registros em recordings: ${recordings.length}`);
  progress(`Arquivos reais no Storage com esse ID: ${realFiles.length}`);
  progress(`Total geral de arquivos reais carregados do Storage: ${storageFiles.length}`);
  progress("");

  if (realFiles.length) {
    progress("ARQUIVOS REAIS ENCONTRADOS:");
    realFiles.forEach(f => progress(`- bucket=${f.bucket_id} | name=${f.name}`));
  } else {
    progress("Nenhum arquivo real encontrado começando com o ID do paciente.");
  }

  progress("");
  progress("REGISTROS DA TABELA RECORDINGS:");
  recordings.forEach(r => {
    const matches = getRealFilesForRecording(r);
    progress(`- frase ${Number(r.phrase_index)+1} | audio_path=${r.audio_path} | matches=${matches.length}`);
    matches.forEach(f => progress(`  -> ${f.bucket_id}/${f.name}`));
  });

  $("backupOutput")?.scrollIntoView({ behavior: "smooth" });
}

function debugRecording(recordingId) {
  const r = adminRecordings.find(x => String(x.id) === String(recordingId));
  if (!r) return alert("Registro não encontrado.");

  clearProgress();
  progress(`Registro: ${r.id}`);
  progress(`user_id: ${r.user_id}`);
  progress(`audio_path: ${r.audio_path}`);

  const matches = getRealFilesForRecording(r);
  progress(`Matches encontrados: ${matches.length}`);
  matches.forEach(f => progress(`- ${f.bucket_id}/${f.name}`));
}

async function adminBackupJson() {
  downloadText(`manifesto-vozia-${new Date().toISOString().slice(0,10)}.json`, JSON.stringify({
    generated_at: new Date().toISOString(),
    users: adminUsers,
    recordings: adminRecordings,
    legacy_messages: adminLegacy,
    care_requests: adminCare,
    real_storage_files: storageFiles
  }, null, 2), "application/json");
}

function adminBackupCsv() {
  const rows = [["nome","email","plano","vault_id","registros_recordings","arquivos_reais","mensagens","care","created_at"]];
  adminUsers.forEach(u => {
    const c = getUserCounts(u.id);
    rows.push([u.name || "", u.email || "", u.plan || "", u.vault_id || "", c.recordings, c.realFiles, c.legacy, c.care, u.created_at || ""]);
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
    .slice(0, 100);
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
