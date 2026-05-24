const $=id=>document.getElementById(id);let allUsers=[];
async function api(url,opts={}){const res=await fetch(url,opts);const data=await res.json().catch(()=>({}));if(!res.ok)throw new Error(data.error||"Erro.");return data;}
function msg(t){const el=$("msg");el.textContent=t;el.style.display="block";}
$("loginBtn").onclick=async()=>{try{await api("/api/login",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({email:$("email").value,password:$("password").value})});check();}catch(e){msg(e.message);}};
$("logoutBtn").onclick=async()=>{await api("/api/logout",{method:"POST"});location.reload();};
$("filter").onchange=()=>renderUsers();$("search").oninput=()=>renderUsers();
async function check(){const me=await api("/api/me");const ok=me.user&&me.user.is_admin;$("loginCard").classList.toggle("hidden",ok);$("adminArea").classList.toggle("hidden",!ok);if(ok){$("securityCard").classList.toggle("hidden",!(me.settings&&me.settings.admin_must_change_password));$("newAdminEmail").value=me.user.email; loadAdmin(); loadVersion(); loadFunnel(); loadDeletionRequests(); loadDiagnostic(); loadLicense(); loadCareRequests(); loadAnnualReview();}}
$("changeAdminBtn").onclick=async()=>{try{await api("/api/admin/change-password",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({email:$("newAdminEmail").value,new_password:$("newAdminPassword").value})});alert("Admin alterado. Faça login novamente.");await api("/api/logout",{method:"POST"});location.reload();}catch(e){alert(e.message);}};
async function loadAdmin(){const u=await api("/api/admin/users");allUsers=u.users;$("stTotal").textContent=u.stats.total;$("stComp").textContent=u.stats.completos;$("stInc").textContent=u.stats.incompletos;$("stAnual").textContent=u.stats.anual||0;$("stVitalicio").textContent=u.stats.vitalicio||0;$("stReceita").textContent="R$"+Number(u.stats.receita_estimada||0).toLocaleString("pt-BR");renderUsers();await loadRequests();}
function limitFor(plan){return plan==="avaliacao"?10:100}
function renderUsers(){const f=$("filter").value;const q=$("search").value.toLowerCase();let users=allUsers.filter(u=>{const match=!q||`${u.name} ${u.email} ${u.vault_id}`.toLowerCase().includes(q);if(!match)return false;if(f==="todos")return true;if(f==="completos")return u.recordings_count>=limitFor(u.plan);if(f==="incompletos")return u.recordings_count<limitFor(u.plan);if(["anual","vitalicio","avaliacao"].includes(f))return u.plan===f;return true;});$("users").innerHTML=users.map(user=>{const lim=limitFor(user.plan);const pct=Math.round((user.recordings_count/lim)*100);return `<div class="card" style="margin:12px 0"><div class="row"><div><h3>${user.name}</h3><p class="small">${user.vault_id} • ${user.email} • plano: ${user.plan} • ${user.recordings_count}/${lim} • ${pct}% • legado: ${user.legacy_count}</p><p class="small">Contrato: ${user.accepted_terms_at?new Date(user.accepted_terms_at).toLocaleString("pt-BR"):"registrado"} • Familiar: ${user.guardian_name||"não informado"}</p><div class="progress"><div style="width:${Math.min(pct,100)}%"></div></div></div><div class="actions"><button onclick="viewUser(${user.id})">Ver detalhes</button><a href="/api/admin/user/${user.id}/backup.zip"><button class="green">Backup ZIP</button></a></div></div></div>`;}).join("")||"<p class='small'>Nenhum usuário.</p>";}
async function viewUser(id){const data=await api(`/api/admin/user/${id}/recordings`);$("details").classList.remove("hidden");$("details").innerHTML=`<h2>${data.user.name}</h2><p class="small">${data.user.vault_id} • plano ${data.user.limits.label}</p><h3>Nota interna</h3><textarea id="internalNote"></textarea><button onclick="saveNote(${id})">Salvar nota</button><h3>Auditoria</h3>`+(data.logs.map(l=>`<div class="requestItem"><b>${l.action}</b><p class="small">${l.detail||""} • ${new Date(l.created_at).toLocaleString("pt-BR")}</p></div>`).join("")||"<p class='small'>Sem logs.</p>")+`<h3>Mensagens de legado</h3>`+(data.legacy.map(m=>`<div class="card" style="margin:12px 0"><b>${m.title}</b><p class="small">${m.text_note||""} • ${Math.round((m.duration_ms||0)/1000)}s</p><audio controls style="width:100%" src="${m.file_path}"></audio></div>`).join("")||"<p class='small'>Sem mensagens de legado.</p>")+`<h3>Frases</h3>`+(data.recordings.map(r=>`<div class="card" style="margin:12px 0"><b>${String(r.phrase_index+1).padStart(3,"0")} — ${r.phrase_text}</b><p class="small">${r.category} • ${Math.round((r.duration_ms||0)/1000)}s • ${r.quality_note||""}</p><audio controls style="width:100%" src="${r.file_path}"></audio></div>`).join("")||"<p class='small'>Sem gravações.</p>");$("details").scrollIntoView({behavior:"smooth"});}
async function saveNote(id){await api(`/api/admin/user/${id}/note`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({note:$("internalNote").value})});alert("Nota salva");}
async function loadRequests(){const r=await api("/api/admin/backup-requests");$("requests").innerHTML=r.requests.map(req=>`<div class="card" style="margin:12px 0"><b>${req.requester_name}</b> <span class="status">${req.status}</span><p class="small">Cofre: ${req.vault_id} • Usuário: ${req.user_name} (${req.user_email}) • Vínculo: ${req.requester_relation}</p><label>Observação da decisão</label><input id="note-${req.id}" value="${req.decision_note||""}"><div class="actions"><button onclick="decide(${req.id},'em_analise')">Em análise</button><button class="green" onclick="decide(${req.id},'aprovado')">Aprovar</button><button class="red" onclick="decide(${req.id},'recusado')">Recusar</button><a href="/api/admin/backup-request/${req.id}/release-term" target="_blank"><button>Termo</button></a><a href="/api/admin/user/${req.user_id}/backup.zip"><button>Backup</button></a></div></div>`).join("")||"<p class='small'>Nenhuma solicitação.</p>";}
async function decide(id,status){await api(`/api/admin/backup-request/${id}/decision`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({status,decision_note:$(`note-${id}`).value})});await loadRequests();}
async function loadVersion(){try{const v=await api("/api/admin/version");$("versionBox").innerHTML=`<b>${v.name} ${v.version}</b><br>Modo: ${v.mode}<br>Banco: ${v.database}<br>Usuários: ${v.users}<br>Frases: ${v.recordings}<br>Legado: ${v.legacy_messages}<br>Pedidos backup: ${v.backup_requests}<br><br>${v.notes.map(n=>"- "+n).join("<br>")}`;}catch(e){}}
async function loadFunnel(){try{const data=await api("/api/admin/funnel");const f=data.funnel;$("funnelBox").innerHTML=`<div><b>${f.avaliacao}</b><span>avaliação</span></div><div><b>${f.avaliacao_vencendo}</b><span>vencendo</span></div><div><b>${f.avaliacao_vencida}</b><span>vencida</span></div><div><b>${f.anual}</b><span>anual</span></div><div><b>${f.vitalicio}</b><span>vitalício</span></div><div><b>${f.upgrade_potencial}</b><span>upgrade</span></div>`;}catch(e){}}
async function loadDeletionRequests(){try{const data=await api("/api/admin/deletion-requests");$("deletionRequests").innerHTML=data.requests.map(req=>`<div class="card" style="margin:12px 0"><b>${req.user_name}</b> <span class="status">${req.status}</span><p class="small">${req.vault_id} • ${req.user_email} • ${req.reason||""}</p><label>Observação</label><input id="delnote-${req.id}" value="${req.decision_note||""}"><label><input type="checkbox" id="delexec-${req.id}" style="width:auto"> Executar exclusão se aprovado</label><div class="actions"><button onclick="decideDelete(${req.id},'em_analise')">Em análise</button><button class="green" onclick="decideDelete(${req.id},'aprovado')">Aprovar</button><button class="red" onclick="decideDelete(${req.id},'recusado')">Recusar</button></div></div>`).join("")||"<p class='small'>Nenhuma solicitação de exclusão.</p>";}catch(e){}}
async function decideDelete(id,status){await api(`/api/admin/deletion-request/${id}/decision`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({status,decision_note:$(`delnote-${id}`).value,execute_delete:$(`delexec-${id}`)?.checked||false})});await loadDeletionRequests();await loadAdmin();}
async function setMode(mode){await api("/api/admin/mode",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({mode})});await loadDiagnostic();alert("Modo alterado para "+mode);}
async function loadDiagnostic(){try{const d=await api("/api/admin/diagnostic");$("modeText").textContent="Modo atual: "+d.mode;$("diagBox").innerHTML=`Banco: ${d.dbOk?"OK":"ERRO"}<br>Uploads: ${d.uploadsOk?"OK":"ERRO"}<br>Node: ${d.node}<br>Plataforma: ${d.platform}<br>Licença ativa: ${d.license_active?"sim":"não"}<br>Senha admin pendente: ${d.admin_must_change_password?"sim":"não"}<br>Último backup: ${d.lastBackup?d.lastBackup.created_at:"nunca"}<br>Backups mantidos: ${d.backups.length}`;}catch(e){}}
$("manualBackupBtn").onclick=async()=>{try{const r=await api("/api/admin/system-backup",{method:"POST"});alert("Backup criado: "+r.backup.filepath);await loadDiagnostic();}catch(e){alert(e.message);}};
async function loadLicense(){try{const r=await api("/api/admin/license");const l=r.license;$("licenseBox").innerHTML=`Status: ${l.status} • Plano: ${l.plan} • Validade: ${l.valid_until||"sem validade"} • Ativa: ${r.active?"sim":"não"}`;$("licenseKey").value=l.license_key||"";$("licensePlan").value=l.plan==="vitalicio"?"vitalicio":"anual";$("licenseUntil").value=l.valid_until||"";}catch(e){}}
$("saveLicenseBtn").onclick=async()=>{try{await api("/api/admin/license",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({license_key:$("licenseKey").value,plan:$("licensePlan").value,valid_until:$("licenseUntil").value})});alert("Licença salva");await loadLicense();await loadDiagnostic();}catch(e){alert(e.message);}};
check();

async function loadCareRequests(){
  try{
    const data = await api("/api/admin/vozia-care-requests");
    if($("careRequests")){
      $("careRequests").innerHTML = data.requests.map(r=>`
        <div class="card" style="margin:12px 0">
          <b>${r.user_name}</b> <span class="status">${r.status}</span>
          <p class="small">${r.vault_id} • ${r.user_email} • Plano: ${r.plan}</p>
          <p class="small">Modelo: ${r.app_model === "teclado_upgrade" ? "Teclado ativo por upgrade mensal" : "Botões fixos com voz gravada"} • Interesse teclado: ${r.keyboard_interest}</p>
          ${r.notes ? `<p class="small">Obs: ${r.notes}</p>` : ""}
          <div class="actions">
            <button onclick="setCareStatus(${r.id},'em_producao')">Em produção</button>
            <button class="green" onclick="setCareStatus(${r.id},'entregue')">Entregue</button>
            <button class="red" onclick="setCareStatus(${r.id},'recusado')">Recusar</button>
          </div>
        </div>
      `).join("") || "<p class='small'>Nenhuma solicitação do Vozia Care.</p>";
    }
  }catch(e){}
}
async function setCareStatus(id,status){
  await api(`/api/admin/vozia-care-request/${id}/status`,{
    method:"POST",
    headers:{"Content-Type":"application/json"},
    body:JSON.stringify({status})
  });
  await loadCareRequests();
}

async function loadAnnualReview(){
  try{
    const data = await api('/api/admin/annual-review-list');
    if($('annualReviewList')){
      $('annualReviewList').innerHTML = data.rows.map(r=>`
        <div class="card" style="margin:12px 0">
          <b>${r.name}</b> <span class="status">${r.annual_review_status}</span>
          <p class="small">${r.vault_id} • Contato 1: ${r.guardian_name||'não informado'} ${r.guardian_phone||''} • Contato 2: ${r.guardian2_name||''} ${r.guardian2_phone||''}</p>
          <p class="small">Mensagens: ${r.legacy_count||0} • Prioritária: ${(r.priority_count||0)>0?'sim':'não'} • Última revisão: ${r.annual_review_last_at||'não realizada'}</p>
          <label>Status</label>
          <select id="annual-status-${r.id}">
            <option value="pendente">Pendente</option>
            <option value="realizada">Revisão realizada</option>
            <option value="contato_confirmado">Contato familiar confirmado</option>
            <option value="obito_informado">Óbito informado</option>
            <option value="mensagem_enviada">Mensagem de legado enviada</option>
            <option value="sem_mensagem">Sem mensagem gravada</option>
          </select>
          <label>Observação</label><input id="annual-note-${r.id}" value="${r.annual_review_note||''}">
          <button onclick="saveAnnualReview(${r.id})">Salvar revisão</button>
        </div>`).join('') || "<p class='small'>Nenhum cofre para revisão.</p>";
      data.rows.forEach(r=>{const sel=$(`annual-status-${r.id}`); if(sel) sel.value=r.annual_review_status||'pendente';});
    }
  }catch(e){}
}
async function saveAnnualReview(id){await api(`/api/admin/user/${id}/annual-review`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({status:$(`annual-status-${id}`).value,note:$(`annual-note-${id}`).value})}); await loadAnnualReview();}
