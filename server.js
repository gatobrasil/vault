const express = require("express");
const session = require("express-session");
const multer = require("multer");
const bcrypt = require("bcryptjs");
const Database = require("better-sqlite3");
const archiver = require("archiver");
const path = require("path");
const fs = require("fs");
const os = require("os");

const app = express();
const PORT = process.env.PORT || 3000;
const ROOT = __dirname;
const DB_DIR = path.join(ROOT, "database");
const UPLOADS_DIR = path.join(ROOT, "uploads");
const BACKUPS_DIR = path.join(ROOT, "backups");
const DB_PATH = path.join(DB_DIR, "vozia_vault.sqlite");

if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true });
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });
if (!fs.existsSync(BACKUPS_DIR)) fs.mkdirSync(BACKUPS_DIR, { recursive: true });

const db = new Database(DB_PATH);

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  vault_id TEXT UNIQUE,
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  photo_path TEXT,
  plan TEXT DEFAULT 'avaliacao',
  accepted_terms INTEGER DEFAULT 0,
  accepted_terms_at TEXT,
  guardian_name TEXT DEFAULT '',
  guardian_email TEXT DEFAULT '',
  guardian_phone TEXT DEFAULT '',
  guardian_relation TEXT DEFAULT '',
  guardian_document TEXT DEFAULT '',
  guardian2_name TEXT DEFAULT '',
  guardian2_email TEXT DEFAULT '',
  guardian2_phone TEXT DEFAULT '',
  guardian2_relation TEXT DEFAULT '',
  guardian2_document TEXT DEFAULT '',
  annual_review_status TEXT DEFAULT 'pendente',
  annual_review_last_at TEXT DEFAULT '',
  annual_review_note TEXT DEFAULT '',
  subscription_status TEXT DEFAULT 'ativo',
  plan_expires_at TEXT DEFAULT '',
  plan_price REAL DEFAULT 0,
  internal_note TEXT DEFAULT '',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS recordings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  phrase_index INTEGER NOT NULL,
  phrase_text TEXT NOT NULL,
  category TEXT DEFAULT '',
  file_path TEXT NOT NULL,
  duration_ms INTEGER DEFAULT 0,
  quality_note TEXT DEFAULT '',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, phrase_index)
);

CREATE TABLE IF NOT EXISTS legacy_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  text_note TEXT DEFAULT '',
  file_path TEXT NOT NULL,
  duration_ms INTEGER DEFAULT 0,
  is_priority INTEGER DEFAULT 0,
  recipient TEXT DEFAULT '',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS backup_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  requester_name TEXT NOT NULL,
  requester_relation TEXT NOT NULL,
  requester_document TEXT DEFAULT '',
  status TEXT DEFAULT 'pendente',
  decision_note TEXT DEFAULT '',
  decided_at TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS deletion_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  reason TEXT DEFAULT '',
  status TEXT DEFAULT 'pendente',
  decision_note TEXT DEFAULT '',
  decided_at TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS payment_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  plan TEXT NOT NULL,
  amount REAL DEFAULT 0,
  method TEXT DEFAULT 'simulado',
  status TEXT DEFAULT 'confirmado',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  action TEXT NOT NULL,
  detail TEXT DEFAULT '',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS system_settings (
  key TEXT PRIMARY KEY,
  value TEXT DEFAULT ''
);

CREATE TABLE IF NOT EXISTS license (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  license_key TEXT DEFAULT '',
  plan TEXT DEFAULT 'avaliacao',
  valid_until TEXT DEFAULT '',
  status TEXT DEFAULT 'inativo',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS auto_backups (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  file_path TEXT NOT NULL,
  type TEXT DEFAULT 'manual',
  size_bytes INTEGER DEFAULT 0,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS vozia_care_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  app_model TEXT DEFAULT 'botoes_fixos',
  keyboard_interest TEXT DEFAULT 'nao',
  notes TEXT DEFAULT '',
  status TEXT DEFAULT 'pendente',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
`);

function addColumnIfMissing(table, col, def){
  const cols = db.prepare(`PRAGMA table_info(${table})`).all().map(c => c.name);
  if(!cols.includes(col)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${def}`);
}
[
  ["users","vault_id","TEXT"],
  ["users","accepted_terms_at","TEXT"],
  ["users","guardian_name","TEXT DEFAULT ''"],
  ["users","guardian_email","TEXT DEFAULT ''"],
  ["users","guardian_phone","TEXT DEFAULT ''"],
  ["users","guardian_relation","TEXT DEFAULT ''"],
  ["users","guardian_document","TEXT DEFAULT ''"],
  ["users","guardian2_name","TEXT DEFAULT ''"],
  ["users","guardian2_email","TEXT DEFAULT ''"],
  ["users","guardian2_phone","TEXT DEFAULT ''"],
  ["users","guardian2_relation","TEXT DEFAULT ''"],
  ["users","guardian2_document","TEXT DEFAULT ''"],
  ["users","annual_review_status","TEXT DEFAULT 'pendente'"],
  ["users","annual_review_last_at","TEXT DEFAULT ''"],
  ["users","annual_review_note","TEXT DEFAULT ''"],
  ["users","subscription_status","TEXT DEFAULT 'ativo'"],
  ["users","plan_expires_at","TEXT DEFAULT ''"],
  ["users","plan_price","REAL DEFAULT 0"],
  ["users","internal_note","TEXT DEFAULT ''"],
  ["backup_requests","decision_note","TEXT DEFAULT ''"],
  ["backup_requests","decided_at","TEXT"]
].forEach(x=>addColumnIfMissing(...x));
addColumnIfMissing("legacy_messages","is_priority","INTEGER DEFAULT 0");
addColumnIfMissing("legacy_messages","recipient","TEXT DEFAULT ''");

function setSetting(key, value){
  db.prepare("INSERT INTO system_settings (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(key, String(value));
}
function getSetting(key, fallback=""){
  const row = db.prepare("SELECT value FROM system_settings WHERE key=?").get(key);
  return row ? row.value : fallback;
}
if(!getSetting("mode")) setSetting("mode","teste");
if(!getSetting("admin_must_change_password")) setSetting("admin_must_change_password","true");
if(!db.prepare("SELECT * FROM license WHERE id=1").get()){
  db.prepare("INSERT INTO license (id,license_key,plan,valid_until,status) VALUES (1,'','avaliacao','','inativo')").run();
}

function vaultIdFor(id){
  return "VOZIA-" + new Date().getFullYear() + "-" + String(id).padStart(5,"0");
}
const usersNoVault = db.prepare("SELECT id FROM users WHERE vault_id IS NULL OR vault_id=''").all();
usersNoVault.forEach(u => db.prepare("UPDATE users SET vault_id=? WHERE id=?").run(vaultIdFor(u.id), u.id));

const adminEmail = "admin@vozia.local";
const adminPassword = "admin123";
const admin = db.prepare("SELECT id FROM users WHERE email=?").get(adminEmail);
if (!admin) {
  db.prepare("INSERT INTO users (vault_id,name,email,password_hash,plan,accepted_terms,accepted_terms_at,subscription_status) VALUES (?,?,?,?,?,?,CURRENT_TIMESTAMP,?)")
    .run("VOZIA-ADMIN", "Administrador Vozia", adminEmail, bcrypt.hashSync(adminPassword, 10), "admin", 1, "ativo");
  setSetting("admin_must_change_password","true");
}

app.use(express.json({ limit: "80mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(session({
  secret: "vozia-vault-v8-estabilidade-licenca",
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 1000 * 60 * 60 * 12 }
}));
app.use(express.static(path.join(ROOT, "public")));
app.use("/uploads", express.static(UPLOADS_DIR));
app.use("/backups", express.static(BACKUPS_DIR));

function ensureDir(id) {
  const dir = path.join(UPLOADS_DIR, String(id));
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, ensureDir(req.session.userId || "temp")),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname || "") || ".webm";
    cb(null, Date.now() + "-" + Math.round(Math.random()*1e9) + ext);
  }
});
const upload = multer({ storage });

function log(userId, action, detail=""){
  db.prepare("INSERT INTO audit_log (user_id,action,detail) VALUES (?,?,?)").run(userId || null, action, detail);
}
function normalizePlan(plan){
  if(["avaliacao","anual","vitalicio"].includes(plan)) return plan;
  return "avaliacao";
}
function planPrice(plan){
  if(plan === "avaliacao") return 0;
  if(plan === "vitalicio") return 1497;
  if(plan === "admin") return 0;
  return 297;
}
function planLimits(plan){
  if(plan === "avaliacao") return { phrases: 10, legacy: 1, label:"Avaliação", days: 7, backup: false, policy:"Avaliação de 7 dias. Após o período, os dados poderão ser apagados e não há direito a backup." };
  if(plan === "vitalicio") return { phrases: 100, legacy: 999, label:"Vitalício", days: null, backup: true, policy:"Preservação estendida com direito a backup conforme análise e autorização." };
  if(plan === "admin") return { phrases: 100, legacy: 999, label:"Admin", days: null, backup: true, policy:"Acesso administrativo." };
  return { phrases: 100, legacy: 5, label:"Anual", days: 365, backup: true, policy:"Plano anual com direito a solicitação de backup conforme análise e autorização." };
}
function isEvaluationExpired(u){
  if(!u || u.plan !== "avaliacao") return false;
  if(!u.plan_expires_at) return false;
  const today = new Date().toISOString().slice(0,10);
  return today > u.plan_expires_at;
}
function isLicenseActive(){
  const lic = db.prepare("SELECT * FROM license WHERE id=1").get();
  if(!lic || lic.status !== "ativo") return false;
  if(!lic.valid_until) return true;
  const today = new Date().toISOString().slice(0,10);
  return today <= lic.valid_until;
}
function cleanUser(u) {
  if (!u) return null;
  return {
    id: u.id,
    vault_id: u.vault_id || vaultIdFor(u.id),
    name: u.name,
    email: u.email,
    photo_path: u.photo_path,
    plan: u.plan,
    limits: planLimits(u.plan),
    accepted_terms: !!u.accepted_terms,
    accepted_terms_at: u.accepted_terms_at,
    guardian_name: u.guardian_name || "",
    guardian_email: u.guardian_email || "",
    guardian_phone: u.guardian_phone || "",
    guardian_relation: u.guardian_relation || "",
    guardian_document: u.guardian_document || "",
    guardian2_name: u.guardian2_name || "",
    guardian2_email: u.guardian2_email || "",
    guardian2_phone: u.guardian2_phone || "",
    guardian2_relation: u.guardian2_relation || "",
    guardian2_document: u.guardian2_document || "",
    annual_review_status: u.annual_review_status || "pendente",
    annual_review_last_at: u.annual_review_last_at || "",
    annual_review_note: u.annual_review_note || "",
    subscription_status: isEvaluationExpired(u) ? "expirado" : (u.subscription_status || "ativo"),
    plan_expires_at: u.plan_expires_at || "",
    plan_price: u.plan_price || planPrice(u.plan),
    expired: isEvaluationExpired(u),
    created_at: u.created_at,
    is_admin: u.email === adminEmail
  };
}
function requireLogin(req,res,next){ if(!req.session.userId) return res.status(401).json({error:"Faça login."}); next(); }
function requireAdmin(req,res,next){
  const u = db.prepare("SELECT * FROM users WHERE id=?").get(req.session.userId);
  if(!u || u.email !== adminEmail) return res.status(403).json({error:"Acesso restrito."});
  next();
}

function addFolderToArchive(archive, folderPath, zipName){
  if(!fs.existsSync(folderPath)) return;
  fs.readdirSync(folderPath).forEach(item=>{
    const full = path.join(folderPath,item);
    const rel = path.join(zipName,item);
    if(fs.statSync(full).isDirectory()) addFolderToArchive(archive, full, rel);
    else archive.file(full,{name:rel});
  });
}
function createSystemBackup(type="manual"){
  const stamp = new Date().toISOString().replace(/[:.]/g,"-");
  const filename = `vozia-backup-${type}-${stamp}.zip`;
  const filepath = path.join(BACKUPS_DIR, filename);
  return new Promise((resolve,reject)=>{
    const output = fs.createWriteStream(filepath);
    const archive = archiver("zip",{zlib:{level:9}});
    output.on("close",()=>{
      const size = fs.existsSync(filepath) ? fs.statSync(filepath).size : 0;
      db.prepare("INSERT INTO auto_backups (file_path,type,size_bytes) VALUES (?,?,?)").run(`/backups/${filename}`, type, size);
      pruneOldBackups();
      resolve({filepath:`/backups/${filename}`,size});
    });
    archive.on("error",err=>reject(err));
    archive.pipe(output);
    if(fs.existsSync(DB_PATH)) archive.file(DB_PATH,{name:"database/vozia_vault.sqlite"});
    addFolderToArchive(archive, UPLOADS_DIR, "uploads");
    archive.append(JSON.stringify({version:"8.5.0",type,generated_at:new Date().toISOString()},null,2),{name:"LEIA-ME-BACKUP-SISTEMA.json"});
    archive.finalize();
  });
}
function pruneOldBackups(){
  const rows = db.prepare("SELECT * FROM auto_backups ORDER BY created_at DESC").all();
  rows.slice(7).forEach(row=>{
    const abs = path.join(ROOT, row.file_path.replace(/^\//,""));
    if(fs.existsSync(abs)) fs.unlinkSync(abs);
    db.prepare("DELETE FROM auto_backups WHERE id=?").run(row.id);
  });
}
function scheduleDailyBackup(){
  const now = new Date();
  const next = new Date();
  next.setHours(3,0,0,0);
  if(next <= now) next.setDate(next.getDate()+1);
  const delay = next - now;
  setTimeout(async ()=>{
    try { await createSystemBackup("automatico_diario"); }
    catch(e){ console.error("Erro backup automático", e); }
    setInterval(()=>createSystemBackup("automatico_diario").catch(e=>console.error(e)), 24*60*60*1000);
  }, delay);
}
scheduleDailyBackup();

process.on("SIGINT", async ()=>{
  try { await createSystemBackup("ao_fechar"); } catch(e){}
  process.exit();
});
process.on("SIGTERM", async ()=>{
  try { await createSystemBackup("ao_fechar"); } catch(e){}
  process.exit();
});

app.get("/api/me", (req,res)=>{
  if(!req.session.userId) return res.json({user:null});
  const u = db.prepare("SELECT * FROM users WHERE id=?").get(req.session.userId);
  const settings = {
    mode: getSetting("mode","teste"),
    admin_must_change_password: getSetting("admin_must_change_password","false") === "true",
    license_active: isLicenseActive()
  };
  res.json({user: cleanUser(u), settings});
});

app.post("/api/register", upload.single("photo"), (req,res)=>{
  const {name,email,password,plan,accepted_terms,guardian_name, guardian_email, guardian_phone, guardian_relation, guardian_document, guardian2_name, guardian2_email, guardian2_phone, guardian2_relation, guardian2_document} = req.body;
  if(!name || !email || !password) return res.status(400).json({error:"Preencha nome, e-mail e senha."});
  if(accepted_terms !== "true") return res.status(400).json({error:"Leia e aceite o contrato."});
  if(!req.file) return res.status(400).json({error:"Envie uma foto do titular."});

  const selectedPlan = normalizePlan(plan);
  try{
    const expires = selectedPlan === "anual" ? new Date(Date.now() + 365*24*60*60*1000).toISOString().slice(0,10) : (selectedPlan === "avaliacao" ? new Date(Date.now() + 7*24*60*60*1000).toISOString().slice(0,10) : "");
    const info = db.prepare(`
      INSERT INTO users (vault_id,name,email,password_hash,photo_path,plan,accepted_terms,accepted_terms_at,guardian_name,guardian_email,guardian_phone,guardian_relation,guardian_document,guardian2_name,guardian2_email,guardian2_phone,guardian2_relation,guardian2_document,subscription_status,plan_expires_at,plan_price)
      VALUES (?,?,?,?,?,?,?,CURRENT_TIMESTAMP,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `).run("", name,email,bcrypt.hashSync(password,10),"",selectedPlan,1, guardian_name || "", guardian_email || "", guardian_phone || "", guardian_relation || "", guardian_document || "", guardian2_name || "", guardian2_email || "", guardian2_phone || "", guardian2_relation || "", guardian2_document || "", "ativo", expires, planPrice(selectedPlan));

    const vId = vaultIdFor(info.lastInsertRowid);
    const dir = ensureDir(info.lastInsertRowid);
    const newPath = path.join(dir, path.basename(req.file.path));
    fs.renameSync(req.file.path, newPath);
    const publicPath = `/uploads/${info.lastInsertRowid}/${path.basename(newPath)}`;
    db.prepare("UPDATE users SET vault_id=?, photo_path=? WHERE id=?").run(vId, publicPath, info.lastInsertRowid);
    req.session.userId = info.lastInsertRowid;
    log(info.lastInsertRowid, "register", "Cadastro e aceite do contrato.");
    res.json({ok:true});
  }catch(e){ res.status(400).json({error:"E-mail já cadastrado ou dados inválidos."}); }
});

app.post("/api/login", (req,res)=>{
  const u = db.prepare("SELECT * FROM users WHERE email=?").get(req.body.email);
  if(!u || !bcrypt.compareSync(req.body.password || "", u.password_hash)) return res.status(401).json({error:"E-mail ou senha inválidos."});
  req.session.userId = u.id;
  log(u.id, "login", "Login realizado.");
  res.json({ok:true,user:cleanUser(u)});
});
app.post("/api/logout", (req,res)=>req.session.destroy(()=>res.json({ok:true})));

app.get("/api/progress", requireLogin, (req,res)=>{
  const rows = db.prepare("SELECT phrase_index, phrase_text, category, file_path, duration_ms, quality_note, created_at FROM recordings WHERE user_id=? ORDER BY phrase_index").all(req.session.userId);
  const legacy = db.prepare("SELECT id, title, text_note, file_path, duration_ms, is_priority, recipient, created_at FROM legacy_messages WHERE user_id=? ORDER BY is_priority DESC, created_at DESC").all(req.session.userId);
  const requests = db.prepare("SELECT id, requester_name, requester_relation, status, decision_note, decided_at, created_at FROM backup_requests WHERE user_id=? ORDER BY created_at DESC").all(req.session.userId);
  const deletion_requests = db.prepare("SELECT reason, status, decision_note, decided_at, created_at FROM deletion_requests WHERE user_id=? ORDER BY created_at DESC").all(req.session.userId);
  const vozia_care_requests = db.prepare("SELECT id, app_model, keyboard_interest, notes, status, created_at FROM vozia_care_requests WHERE user_id=? ORDER BY created_at DESC").all(req.session.userId);
  res.json({recordings:rows,total:rows.length,legacy,requests,deletion_requests,vozia_care_requests});
});

app.post("/api/recordings", requireLogin, upload.single("audio"), (req,res)=>{
  const u = db.prepare("SELECT * FROM users WHERE id=?").get(req.session.userId);
  if(isEvaluationExpired(u)) return res.status(403).json({error:"Seu período de Avaliação expirou. Faça upgrade para continuar."});
  const limit = planLimits(u.plan).phrases;
  const {phrase_index, phrase_text, category, duration_ms, quality_note} = req.body;
  const idx = Number(phrase_index);
  if(idx >= limit) return res.status(403).json({error:`Seu plano permite gravar até ${limit} frases.`});
  if(!req.file) return res.status(400).json({error:"Áudio não enviado."});

  const old = db.prepare("SELECT file_path FROM recordings WHERE user_id=? AND phrase_index=?").get(req.session.userId, idx);
  if(old?.file_path){
    const abs = path.join(ROOT, old.file_path.replace(/^\//,""));
    if(fs.existsSync(abs)) fs.unlinkSync(abs);
  }
  const publicPath = `/uploads/${req.session.userId}/${path.basename(req.file.path)}`;
  db.prepare(`
    INSERT INTO recordings (user_id, phrase_index, phrase_text, category, file_path, duration_ms, quality_note)
    VALUES (?,?,?,?,?,?,?)
    ON CONFLICT(user_id, phrase_index)
    DO UPDATE SET phrase_text=excluded.phrase_text, category=excluded.category, file_path=excluded.file_path,
    duration_ms=excluded.duration_ms, quality_note=excluded.quality_note, created_at=CURRENT_TIMESTAMP
  `).run(req.session.userId, idx, phrase_text, category || "", publicPath, Number(duration_ms || 0), quality_note || "");
  log(req.session.userId, "save_recording", `Frase ${idx+1} salva.`);
  res.json({ok:true,file_path:publicPath});
});

app.delete("/api/recordings/:idx", requireLogin, (req,res)=>{
  const idx = Number(req.params.idx);
  const old = db.prepare("SELECT file_path FROM recordings WHERE user_id=? AND phrase_index=?").get(req.session.userId, idx);
  if(old?.file_path){
    const abs = path.join(ROOT, old.file_path.replace(/^\//,""));
    if(fs.existsSync(abs)) fs.unlinkSync(abs);
  }
  db.prepare("DELETE FROM recordings WHERE user_id=? AND phrase_index=?").run(req.session.userId, idx);
  log(req.session.userId, "delete_recording", `Frase ${idx+1} apagada.`);
  res.json({ok:true});
});

app.post("/api/legacy", requireLogin, upload.single("audio"), (req,res)=>{
  const u = db.prepare("SELECT * FROM users WHERE id=?").get(req.session.userId);
  if(isEvaluationExpired(u)) return res.status(403).json({error:"Seu período de Avaliação expirou. Faça upgrade para continuar."});
  const limit = planLimits(u.plan).legacy;
  const current = db.prepare("SELECT COUNT(*) as c FROM legacy_messages WHERE user_id=?").get(req.session.userId).c;
  if(current >= limit) return res.status(403).json({error:`Seu plano permite ${limit} mensagem(ns) de legado.`});
  const {title, text_note, duration_ms, is_priority, recipient} = req.body;
  if(!title) return res.status(400).json({error:"Informe o título da mensagem."});
  if(!req.file) return res.status(400).json({error:"Áudio não enviado."});
  const publicPath = `/uploads/${req.session.userId}/${path.basename(req.file.path)}`;
  if(is_priority === "1" || is_priority === 1 || is_priority === true) db.prepare("UPDATE legacy_messages SET is_priority=0 WHERE user_id=?").run(req.session.userId);
  db.prepare("INSERT INTO legacy_messages (user_id,title,text_note,file_path,duration_ms,is_priority,recipient) VALUES (?,?,?,?,?,?,?)")
    .run(req.session.userId, title, text_note || "", publicPath, Number(duration_ms || 0), (is_priority === "1" || is_priority === 1 || is_priority === true) ? 1 : 0, recipient || "");
  log(req.session.userId, "save_legacy", title);
  res.json({ok:true});
});

app.post("/api/legacy/:id/priority", requireLogin, (req,res)=>{
  const id = Number(req.params.id);
  db.prepare("UPDATE legacy_messages SET is_priority=0 WHERE user_id=?").run(req.session.userId);
  db.prepare("UPDATE legacy_messages SET is_priority=1 WHERE user_id=? AND id=?").run(req.session.userId, id);
  log(req.session.userId, "legacy_priority", `Mensagem ${id} definida como prioritária.`);
  res.json({ok:true});
});

app.delete("/api/legacy/:id", requireLogin, (req,res)=>{
  const row = db.prepare("SELECT file_path FROM legacy_messages WHERE user_id=? AND id=?").get(req.session.userId, Number(req.params.id));
  if(row?.file_path){
    const abs = path.join(ROOT, row.file_path.replace(/^\//,""));
    if(fs.existsSync(abs)) fs.unlinkSync(abs);
  }
  db.prepare("DELETE FROM legacy_messages WHERE user_id=? AND id=?").run(req.session.userId, Number(req.params.id));
  log(req.session.userId, "delete_legacy", `Mensagem ${req.params.id}`);
  res.json({ok:true});
});

app.post("/api/backup-request", requireLogin, (req,res)=>{
  return res.status(403).json({error:"O backup não é solicitado diretamente pelo usuário. A preservação permanece protegida na plataforma e qualquer liberação depende de análise interna da equipe Vozia."});
});

app.post("/api/upgrade-plan", requireLogin, (req,res)=>{
  const {plan} = req.body;
  const selectedPlan = normalizePlan(plan);
  if(selectedPlan === "avaliacao") return res.status(400).json({error:"Escolha Anual ou Vitalício para fazer upgrade."});
  const expires = selectedPlan === "anual" ? new Date(Date.now() + 365*24*60*60*1000).toISOString().slice(0,10) : "";
  db.prepare("UPDATE users SET plan=?, subscription_status='ativo', plan_expires_at=?, plan_price=? WHERE id=?")
    .run(selectedPlan, expires, planPrice(selectedPlan), req.session.userId);
  log(req.session.userId, "upgrade_plan", `Upgrade para ${selectedPlan}`);
  res.json({ok:true});
});

app.post("/api/simulate-payment", requireLogin, (req,res)=>{
  const {plan} = req.body;
  const selectedPlan = normalizePlan(plan);
  if(selectedPlan === "avaliacao") return res.status(400).json({error:"Escolha Anual ou Vitalício."});
  const expires = selectedPlan === "anual" ? new Date(Date.now() + 365*24*60*60*1000).toISOString().slice(0,10) : "";
  const amount = planPrice(selectedPlan);
  db.prepare("INSERT INTO payment_events (user_id, plan, amount, method, status) VALUES (?,?,?,?,?)")
    .run(req.session.userId, selectedPlan, amount, "simulado", "confirmado");
  db.prepare("UPDATE users SET plan=?, subscription_status='ativo', plan_expires_at=?, plan_price=? WHERE id=?")
    .run(selectedPlan, expires, amount, req.session.userId);
  log(req.session.userId, "payment_simulated", `Pagamento simulado: ${selectedPlan} R$${amount}`);
  res.json({ok:true});
});

app.post("/api/deletion-request", requireLogin, (req,res)=>{
  const {reason} = req.body;
  db.prepare("INSERT INTO deletion_requests (user_id, reason) VALUES (?,?)")
    .run(req.session.userId, reason || "");
  log(req.session.userId, "deletion_request", reason || "Solicitação de exclusão de dados.");
  res.json({ok:true});
});

app.post("/api/vozia-care-request", requireLogin, (req,res)=>{
  const u = db.prepare("SELECT * FROM users WHERE id=?").get(req.session.userId);
  const count = db.prepare("SELECT COUNT(*) as c FROM recordings WHERE user_id=?").get(req.session.userId).c;
  const limit = planLimits(u.plan).phrases;
  if(count < limit) return res.status(400).json({error:`Complete as ${limit} frases do seu plano antes de solicitar o app Vozia Care.`});
  const {app_model, keyboard_interest, notes} = req.body;
  db.prepare("INSERT INTO vozia_care_requests (user_id, app_model, keyboard_interest, notes) VALUES (?,?,?,?)")
    .run(req.session.userId, app_model || "botoes_fixos", keyboard_interest || "nao", notes || "");
  log(req.session.userId, "vozia_care_request", `Solicitação do app Vozia Care: ${app_model || "botoes_fixos"}`);
  res.json({ok:true});
});

app.get("/api/my-data", requireLogin, (req,res)=>{
  const u = db.prepare("SELECT * FROM users WHERE id=?").get(req.session.userId);
  const logs = db.prepare("SELECT action, detail, created_at FROM audit_log WHERE user_id=? ORDER BY created_at DESC LIMIT 50").all(req.session.userId);
  const payments = db.prepare("SELECT plan, amount, method, status, created_at FROM payment_events WHERE user_id=? ORDER BY created_at DESC").all(req.session.userId);
  const deletion_requests = db.prepare("SELECT reason, status, decision_note, decided_at, created_at FROM deletion_requests WHERE user_id=? ORDER BY created_at DESC").all(req.session.userId);
  res.json({user:cleanUser(u),logs,payments,deletion_requests});
});

app.post("/api/update-guardian", requireLogin, (req,res)=>{
  const {guardian_name, guardian_email, guardian_phone, guardian_relation, guardian_document, guardian2_name, guardian2_email, guardian2_phone, guardian2_relation, guardian2_document} = req.body;
  db.prepare("UPDATE users SET guardian_name=?, guardian_email=?, guardian_phone=?, guardian_relation=?, guardian_document=?, guardian2_name=?, guardian2_email=?, guardian2_phone=?, guardian2_relation=?, guardian2_document=? WHERE id=?")
    .run(guardian_name||"", guardian_email||"", guardian_phone||"", guardian_relation||"", guardian_document||"", guardian2_name||"", guardian2_email||"", guardian2_phone||"", guardian2_relation||"", guardian2_document||"", req.session.userId);
  log(req.session.userId, "update_guardian", "Familiar autorizado atualizado.");
  res.json({ok:true});
});

// ADMIN
app.get("/api/admin/funnel", requireLogin, requireAdmin, (req,res)=>{
  const users = db.prepare("SELECT * FROM users WHERE email != ?").all(adminEmail);
  const today = new Date().toISOString().slice(0,10);
  const soon = new Date(Date.now()+3*24*60*60*1000).toISOString().slice(0,10);
  const funnel = {
    avaliacao: users.filter(u=>u.plan==="avaliacao").length,
    avaliacao_vencendo: users.filter(u=>u.plan==="avaliacao" && u.plan_expires_at && u.plan_expires_at >= today && u.plan_expires_at <= soon).length,
    avaliacao_vencida: users.filter(u=>u.plan==="avaliacao" && u.plan_expires_at && u.plan_expires_at < today).length,
    anual: users.filter(u=>u.plan==="anual").length,
    vitalicio: users.filter(u=>u.plan==="vitalicio").length,
    upgrade_potencial: users.filter(u=>u.plan==="avaliacao").length
  };
  res.json({funnel});
});

app.get("/api/admin/vozia-care-requests", requireLogin, requireAdmin, (req,res)=>{
  const rows = db.prepare(`
    SELECT vcr.*, u.name as user_name, u.email as user_email, u.vault_id, u.plan
    FROM vozia_care_requests vcr JOIN users u ON u.id=vcr.user_id
    ORDER BY vcr.created_at DESC
  `).all();
  res.json({requests: rows});
});

app.post("/api/admin/vozia-care-request/:id/status", requireLogin, requireAdmin, (req,res)=>{
  const {status} = req.body;
  if(!["pendente","em_producao","entregue","recusado"].includes(status)) return res.status(400).json({error:"Status inválido."});
  db.prepare("UPDATE vozia_care_requests SET status=? WHERE id=?").run(status, Number(req.params.id));
  res.json({ok:true});
});

app.get("/api/admin/users", requireLogin, requireAdmin, (req,res)=>{
  const users = db.prepare(`
    SELECT u.id,u.vault_id,u.name,u.email,u.photo_path,u.plan,u.created_at,u.accepted_terms_at,u.guardian_name,u.guardian_email,u.guardian_phone,u.guardian_relation,u.internal_note,u.subscription_status,u.plan_expires_at,u.plan_price,
    COUNT(DISTINCT r.id) as recordings_count,
    COUNT(DISTINCT lm.id) as legacy_count,
    COALESCE(AVG(NULLIF(r.duration_ms,0)),0) as avg_duration
    FROM users u
    LEFT JOIN recordings r ON r.user_id=u.id
    LEFT JOIN legacy_messages lm ON lm.user_id=u.id
    GROUP BY u.id ORDER BY u.created_at DESC
  `).all();
  const stats = {
    total: users.length,
    completos: users.filter(u=>u.recordings_count >= planLimits(u.plan).phrases && u.email !== adminEmail).length,
    incompletos: users.filter(u=>u.recordings_count > 0 && u.recordings_count < planLimits(u.plan).phrases).length,
    vazios: users.filter(u=>u.recordings_count === 0 && u.email !== adminEmail).length,
    avaliacao: users.filter(u=>u.plan === "avaliacao").length,
    anual: users.filter(u=>u.plan === "anual").length,
    vitalicio: users.filter(u=>u.plan === "vitalicio").length,
    receita_estimada: users.filter(u=>u.email !== adminEmail).reduce((s,u)=>s + Number(u.plan_price || planPrice(u.plan)), 0)
  };
  res.json({users,stats});
});

app.get("/api/admin/user/:id/recordings", requireLogin, requireAdmin, (req,res)=>{
  const user = db.prepare("SELECT * FROM users WHERE id=?").get(Number(req.params.id));
  const rows = db.prepare("SELECT phrase_index, phrase_text, category, file_path, duration_ms, quality_note, created_at FROM recordings WHERE user_id=? ORDER BY phrase_index").all(Number(req.params.id));
  const legacy = db.prepare("SELECT id,title,text_note,file_path,duration_ms,is_priority,recipient,created_at FROM legacy_messages WHERE user_id=? ORDER BY is_priority DESC, created_at DESC").all(Number(req.params.id));
  const logs = db.prepare("SELECT action,detail,created_at FROM audit_log WHERE user_id=? ORDER BY created_at DESC LIMIT 30").all(Number(req.params.id));
  res.json({user: cleanUser(user), recordings:rows, legacy, logs});
});

app.get("/api/admin/backup-requests", requireLogin, requireAdmin, (req,res)=>{
  const rows = db.prepare("SELECT br.*, u.name as user_name, u.email as user_email, u.vault_id FROM backup_requests br JOIN users u ON u.id=br.user_id ORDER BY br.created_at DESC").all();
  res.json({requests:rows});
});
app.post("/api/admin/backup-request/:id/decision", requireLogin, requireAdmin, (req,res)=>{
  const {status, decision_note} = req.body;
  if(!["aprovado","recusado","em_analise","pendente"].includes(status)) return res.status(400).json({error:"Status inválido."});
  db.prepare("UPDATE backup_requests SET status=?, decision_note=?, decided_at=CURRENT_TIMESTAMP WHERE id=?")
    .run(status, decision_note || "", Number(req.params.id));
  log(req.session.userId, "backup_decision", `Pedido ${req.params.id}: ${status}`);
  res.json({ok:true});
});
app.get("/api/admin/backup-request/:id/release-term", requireLogin, requireAdmin, (req,res)=>{
  const row = db.prepare(`
    SELECT br.*, u.name as user_name, u.email as user_email, u.vault_id, u.guardian_name, u.guardian_relation
    FROM backup_requests br JOIN users u ON u.id=br.user_id
    WHERE br.id=?
  `).get(Number(req.params.id));
  if(!row) return res.status(404).send("Pedido não encontrado.");
  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Termo de Liberação de Backup</title>
  <style>body{font-family:Arial;padding:40px;line-height:1.6}h1{color:#123D68}.box{border:1px solid #ccc;padding:20px;border-radius:12px;margin:16px 0}</style></head><body>
  <h1>Termo de Liberação de Backup Vocal</h1><div class="box">
  <b>ID do Cofre:</b> ${row.vault_id}<br><b>Titular:</b> ${row.user_name} (${row.user_email})<br>
  <b>Solicitante:</b> ${row.requester_name}<br><b>Vínculo informado:</b> ${row.requester_relation}<br>
  <b>Documento/observação:</b> ${row.requester_document || ""}<br><b>Status:</b> ${row.status}<br>
  <b>Decisão:</b> ${row.decision_note || ""}<br><b>Data do pedido:</b> ${row.created_at}<br><b>Data da decisão:</b> ${row.decided_at || ""}</div>
  <p>Este termo registra a análise administrativa da solicitação de backup vocal. A voz é considerada dado sensível de identidade vocal e deve ser tratada com confidencialidade.</p>
  <p>Assinatura do responsável administrativo: ________________________________</p><script>window.print()</script></body></html>`;
  res.send(html);
});

app.get("/api/admin/deletion-requests", requireLogin, requireAdmin, (req,res)=>{
  const rows = db.prepare(`
    SELECT dr.*, u.name as user_name, u.email as user_email, u.vault_id
    FROM deletion_requests dr JOIN users u ON u.id=dr.user_id
    ORDER BY dr.created_at DESC
  `).all();
  res.json({requests:rows});
});
app.post("/api/admin/deletion-request/:id/decision", requireLogin, requireAdmin, (req,res)=>{
  const {status, decision_note, execute_delete} = req.body;
  if(!["pendente","em_analise","aprovado","recusado"].includes(status)) return res.status(400).json({error:"Status inválido."});
  const request = db.prepare("SELECT * FROM deletion_requests WHERE id=?").get(Number(req.params.id));
  if(!request) return res.status(404).json({error:"Pedido não encontrado."});
  db.prepare("UPDATE deletion_requests SET status=?, decision_note=?, decided_at=CURRENT_TIMESTAMP WHERE id=?")
    .run(status, decision_note || "", Number(req.params.id));

  if(status === "aprovado" && execute_delete === true){
    const userId = request.user_id;
    const files = [];
    db.prepare("SELECT file_path FROM recordings WHERE user_id=?").all(userId).forEach(r=>files.push(r.file_path));
    db.prepare("SELECT file_path FROM legacy_messages WHERE user_id=?").all(userId).forEach(r=>files.push(r.file_path));
    const user = db.prepare("SELECT photo_path FROM users WHERE id=?").get(userId);
    if(user && user.photo_path) files.push(user.photo_path);
    files.forEach(fp=>{
      const abs = path.join(ROOT, String(fp || "").replace(/^\//,""));
      if(fs.existsSync(abs)) fs.unlinkSync(abs);
    });
    db.prepare("DELETE FROM recordings WHERE user_id=?").run(userId);
    db.prepare("DELETE FROM legacy_messages WHERE user_id=?").run(userId);
    db.prepare("UPDATE users SET photo_path='', subscription_status='dados_excluidos' WHERE id=?").run(userId);
    log(userId, "data_deleted", "Dados de voz/foto excluídos por solicitação aprovada.");
  }
  res.json({ok:true});
});

app.post("/api/admin/user/:id/annual-review", requireLogin, requireAdmin, (req,res)=>{
  const {status, note} = req.body;
  const allowed = ["pendente","realizada","contato_confirmado","obito_informado","mensagem_enviada","sem_mensagem"];
  const finalStatus = allowed.includes(status) ? status : "pendente";
  db.prepare("UPDATE users SET annual_review_status=?, annual_review_note=?, annual_review_last_at=CURRENT_TIMESTAMP WHERE id=?").run(finalStatus, note || "", Number(req.params.id));
  log(Number(req.params.id), "annual_review", `${finalStatus}: ${note || ""}`);
  res.json({ok:true});
});

app.get("/api/admin/annual-review-list", requireLogin, requireAdmin, (req,res)=>{
  const rows = db.prepare(`SELECT u.id,u.vault_id,u.name,u.email,u.guardian_name,u.guardian_phone,u.guardian2_name,u.guardian2_phone,u.annual_review_status,u.annual_review_last_at,u.annual_review_note, COUNT(lm.id) as legacy_count, SUM(CASE WHEN lm.is_priority=1 THEN 1 ELSE 0 END) as priority_count FROM users u LEFT JOIN legacy_messages lm ON lm.user_id=u.id WHERE u.email != ? GROUP BY u.id ORDER BY u.annual_review_status ASC, u.name ASC`).all(adminEmail);
  res.json({rows});
});

app.get("/api/report", requireLogin, (req,res)=>{
  const u = db.prepare("SELECT * FROM users WHERE id=?").get(req.session.userId);
  const recCount = db.prepare("SELECT COUNT(*) as c FROM recordings WHERE user_id=?").get(req.session.userId).c;
  const legacy = db.prepare("SELECT title, text_note, is_priority, recipient, created_at FROM legacy_messages WHERE user_id=? ORDER BY is_priority DESC, created_at DESC").all(req.session.userId);
  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Relatório do Cofre</title><style>body{font-family:Arial;padding:36px;line-height:1.55;color:#111}h1{color:#123D68}.box{border:1px solid #ccc;border-radius:12px;padding:16px;margin:12px 0}.small{color:#555}</style></head><body><h1>Relatório do Cofre de Voz</h1><div class="box"><b>ID:</b> ${u.vault_id}<br><b>Titular:</b> ${u.name}<br><b>Plano:</b> ${u.plan}<br><b>Frases gravadas:</b> ${recCount}/${planLimits(u.plan).phrases}<br><b>Contato 1:</b> ${u.guardian_name || ""} - ${u.guardian_phone || ""}<br><b>Contato 2:</b> ${u.guardian2_name || ""} - ${u.guardian2_phone || ""}<br><b>Revisão anual:</b> ${u.annual_review_status || "pendente"}<br><b>Última revisão:</b> ${u.annual_review_last_at || "não realizada"}</div><h2>Mensagens de legado</h2>${legacy.map(m=>`<div class="box"><b>${m.is_priority ? "PRIORITÁRIA — " : ""}${m.title}</b><br><span class="small">${m.recipient || ""} • ${m.created_at}</span><p>${m.text_note || ""}</p></div>`).join("") || "<p>Nenhuma mensagem registrada.</p>"}<script>window.print()</script></body></html>`;
  res.send(html);
});

app.post("/api/admin/user/:id/note", requireLogin, requireAdmin, (req,res)=>{
  db.prepare("UPDATE users SET internal_note=? WHERE id=?").run(req.body.note || "", Number(req.params.id));
  res.json({ok:true});
});

app.post("/api/admin/change-password", requireLogin, requireAdmin, (req,res)=>{
  const {email,new_password} = req.body;
  if(!email || !new_password || new_password.length < 6) return res.status(400).json({error:"Informe novo e-mail e senha com pelo menos 6 caracteres."});
  db.prepare("UPDATE users SET email=?, password_hash=? WHERE id=?").run(email, bcrypt.hashSync(new_password,10), req.session.userId);
  setSetting("admin_must_change_password","false");
  log(req.session.userId, "admin_password_changed", "Senha/e-mail admin alterados.");
  res.json({ok:true});
});

app.post("/api/admin/mode", requireLogin, requireAdmin, (req,res)=>{
  const mode = req.body.mode === "producao" ? "producao" : "teste";
  setSetting("mode", mode);
  log(req.session.userId, "mode_changed", mode);
  res.json({ok:true,mode});
});

app.get("/api/admin/license", requireLogin, requireAdmin, (req,res)=>{
  const lic = db.prepare("SELECT * FROM license WHERE id=1").get();
  res.json({license:lic,active:isLicenseActive()});
});
app.post("/api/admin/license", requireLogin, requireAdmin, (req,res)=>{
  const {license_key, plan, valid_until} = req.body;
  const key = String(license_key || "").trim();
  if(!key.startsWith("VOZIA-")) return res.status(400).json({error:"Chave inválida. Use formato VOZIA-..."});
  const selectedPlan = normalizePlan(plan);
  db.prepare("UPDATE license SET license_key=?, plan=?, valid_until=?, status='ativo' WHERE id=1").run(key, selectedPlan, valid_until || "");
  log(req.session.userId, "license_updated", key);
  res.json({ok:true});
});

app.get("/api/admin/diagnostic", requireLogin, requireAdmin, (req,res)=>{
  const dbOk = fs.existsSync(DB_PATH);
  const uploadsOk = fs.existsSync(UPLOADS_DIR);
  const backups = db.prepare("SELECT * FROM auto_backups ORDER BY created_at DESC LIMIT 7").all();
  const lastBackup = backups[0] || null;
  let freeDisk = null;
  try { freeDisk = os.freemem(); } catch(e){}
  res.json({
    dbOk, uploadsOk, node: process.version,
    platform: process.platform,
    mode: getSetting("mode","teste"),
    license_active: isLicenseActive(),
    admin_must_change_password: getSetting("admin_must_change_password","false") === "true",
    lastBackup,
    backups,
    freeMemory: freeDisk
  });
});

app.post("/api/admin/system-backup", requireLogin, requireAdmin, async (req,res)=>{
  try{
    const out = await createSystemBackup("manual");
    res.json({ok:true,backup:out});
  }catch(e){ res.status(500).json({error:"Erro ao criar backup."}); }
});

app.get("/api/admin/system-backup.zip", requireLogin, requireAdmin, async (req,res)=>{
  try{
    const out = await createSystemBackup("manual_download");
    const abs = path.join(ROOT, out.filepath.replace(/^\//,""));
    res.download(abs);
  }catch(e){ res.status(500).send("Erro ao criar backup."); }
});

app.get("/api/admin/version", requireLogin, requireAdmin, (req,res)=>{
  const users = db.prepare("SELECT COUNT(*) as c FROM users WHERE email != ?").get(adminEmail).c;
  const rec = db.prepare("SELECT COUNT(*) as c FROM recordings").get().c;
  const leg = db.prepare("SELECT COUNT(*) as c FROM legacy_messages").get().c;
  const reqs = db.prepare("SELECT COUNT(*) as c FROM backup_requests").get().c;
  const dels = db.prepare("SELECT COUNT(*) as c FROM deletion_requests").get().c;
  const pays = db.prepare("SELECT COUNT(*) as c FROM payment_events").get().c;
  res.json({
    version:"8.5.0", name:"Vozia Vault", mode:getSetting("mode","teste"),
    users, recordings:rec, legacy_messages:leg, backup_requests:reqs, deletion_requests:dels, payment_events:pays,
    database:"SQLite local", storage:"uploads/",
    notes:["Sistema local com banco SQLite.","Admin oculto em /admin.html.","Avaliação dura 7 dias, sem backup.","Backup automático diário e ao fechar.","Mantém últimos 7 backups."]
  });
});

app.get("/api/admin/export.csv", requireLogin, requireAdmin, (req,res)=>{
  const users = db.prepare(`
    SELECT u.vault_id,u.name,u.email,u.plan,u.created_at,u.accepted_terms_at,u.guardian_name,u.guardian_phone,u.guardian_relation,
    COUNT(DISTINCT r.id) as recordings_count, COUNT(DISTINCT lm.id) as legacy_count
    FROM users u
    LEFT JOIN recordings r ON r.user_id=u.id
    LEFT JOIN legacy_messages lm ON lm.user_id=u.id
    GROUP BY u.id ORDER BY u.created_at DESC
  `).all();
  const header = "vault_id,name,email,plan,created_at,accepted_terms_at,guardian_name,guardian_phone,guardian_relation,recordings_count,legacy_count\n";
  const csv = header + users.map(u => Object.values(u).map(v => `"${String(v ?? "").replace(/"/g,'""')}"`).join(",")).join("\n");
  res.setHeader("Content-Type","text/csv; charset=utf-8");
  res.setHeader("Content-Disposition","attachment; filename=vozia-usuarios.csv");
  res.send(csv);
});

function addUserToArchive(archive, u) {
  const rows = db.prepare("SELECT * FROM recordings WHERE user_id=? ORDER BY phrase_index").all(u.id);
  const legacy = db.prepare("SELECT * FROM legacy_messages WHERE user_id=? ORDER BY created_at DESC").all(u.id);
  const logs = db.prepare("SELECT * FROM audit_log WHERE user_id=? ORDER BY created_at DESC").all(u.id);
  archive.append(JSON.stringify({user:cleanUser(u),recordings:rows,legacy_messages:legacy,audit_log:logs},null,2), {name:`usuario-${u.id}/manifesto.json`});
  if(u.photo_path){
    const photoAbs = path.join(ROOT, u.photo_path.replace(/^\//,""));
    if(fs.existsSync(photoAbs)) archive.file(photoAbs,{name:`usuario-${u.id}/foto${path.extname(photoAbs)}`});
  }
  rows.forEach(r=>{
    const abs = path.join(ROOT, r.file_path.replace(/^\//,""));
    if(fs.existsSync(abs)) archive.file(abs,{name:`usuario-${u.id}/audios/frases/frase-${String(r.phrase_index+1).padStart(3,"0")}${path.extname(abs)}`});
  });
  legacy.forEach(l=>{
    const abs = path.join(ROOT, l.file_path.replace(/^\//,""));
    if(fs.existsSync(abs)) archive.file(abs,{name:`usuario-${u.id}/audios/legado/${l.title.replace(/[^\w\-]+/g,"_")}${path.extname(abs)}`});
  });
}
app.get("/api/admin/user/:id/backup.zip", requireLogin, requireAdmin, (req,res)=>{
  const u = db.prepare("SELECT * FROM users WHERE id=?").get(Number(req.params.id));
  if(!u) return res.status(404).send("Usuário não encontrado.");
  res.setHeader("Content-Type","application/zip");
  res.setHeader("Content-Disposition",`attachment; filename=${u.vault_id || "vozia-backup"}.zip`);
  const archive = archiver("zip",{zlib:{level:9}});
  archive.pipe(res);
  addUserToArchive(archive,u);
  archive.finalize();
});
app.get("/api/admin/all-backups.zip", requireLogin, requireAdmin, (req,res)=>{
  const users = db.prepare("SELECT * FROM users WHERE email != ? ORDER BY id").all(adminEmail);
  res.setHeader("Content-Type","application/zip");
  res.setHeader("Content-Disposition","attachment; filename=vozia-todos-backups.zip");
  const archive = archiver("zip",{zlib:{level:9}});
  archive.pipe(res);
  users.forEach(u=>addUserToArchive(archive,u));
  archive.finalize();
});

app.listen(PORT,()=>{
  console.log("VOZIA VAULT V8.5 JORNADA LEGADO rodando em http://localhost:"+PORT);
  console.log("Admin oculto: http://localhost:"+PORT+"/admin.html");
});