const $ = id => document.getElementById(id);
let currentUser=null, settings={}, recordings={}, legacyMessages=[], backupRequests=[], deletionRequests=[], careAppRequests=[], currentIndex=0;
let mediaRecorder=null, mediaStream=null, audioContext=null, analyser=null, volumeRAF=null;
let pendingBlob=null, pendingDuration=0, legacyBlob=null, legacyDuration=0;
const phrases = window.VOZIA_PHRASES || [];

function showMsg(id,text,ok=false){const el=$(id); if(!el)return; el.textContent=text; el.className='msg'+(ok?' ok':''); el.style.display='block';}
function hideMsg(id){const el=$(id); if(el) el.style.display='none';}
async function api(url,opts={}){const res=await fetch(url,opts); const data=await res.json().catch(()=>({})); if(!res.ok) throw new Error(data.error||'Erro.'); return data;}
function phraseLimit(){return currentUser?.limits?.phrases||100}
function legacyLimit(){return currentUser?.limits?.legacy||5}
function qualityNote(ms){if(ms<900)return'Áudio muito curto. Regrave se a frase não ficou completa.'; if(ms>16000)return'Áudio longo. Verifique pausas e ruídos.'; return'Boa duração.'}
function daysUntil(dateStr){if(!dateStr)return null; const today=new Date(); const end=new Date(dateStr+'T23:59:59'); return Math.ceil((end-today)/(1000*60*60*24));}

async function refreshMe(){
  const data=await api('/api/me'); currentUser=data.user; settings=data.settings||{};
  $('logoutBtn')?.classList.toggle('hidden',!currentUser); $('dataBtn')?.classList.toggle('hidden',!currentUser);
  $('landing')?.classList.toggle('hidden',!!currentUser); $('auth')?.classList.add('hidden'); $('app')?.classList.toggle('hidden',!currentUser);
  if(!currentUser) return;
  $('welcome').textContent='Cofre de Voz de '+currentUser.name;
  $('vaultIdBadge').textContent=currentUser.vault_id;
  $('vaultMeta').textContent=`Plano ${currentUser.limits.label} • status ${currentUser.subscription_status||'ativo'}${currentUser.plan_expires_at?' • vence em '+currentUser.plan_expires_at:''} • início em ${new Date(currentUser.created_at).toLocaleDateString('pt-BR')}`;
  $('phraseLimitText').textContent=`/${phraseLimit()} frases`;
  $('legacyLimitText').textContent=legacyLimit()>=999?'mensagens ilimitadas':`/${legacyLimit()} mensagens`;
  $('legacyPlanText').textContent=legacyLimit()>=999?'Seu plano permite mensagens de legado ilimitadas.':`Seu plano permite até ${legacyLimit()} mensagem(ns) de legado.`;
  if(currentUser.plan==='avaliacao') $('legacyPlanText').textContent += ' Plano Avaliação: 7 dias, sem app final.';
  $('legalStatus').textContent=`Contrato aceito: ${currentUser.accepted_terms_at?new Date(currentUser.accepted_terms_at).toLocaleString('pt-BR'):'registrado'} • ID: ${currentUser.vault_id} • ${currentUser.limits.policy||''}`;
  $('guardianInfo').textContent=currentUser.guardian_name?`${currentUser.guardian_name} • ${currentUser.guardian_relation||''} • ${currentUser.guardian_phone||''} • ${currentUser.guardian_email||''}${currentUser.guardian2_name?' | 2º contato: '+currentUser.guardian2_name+' • '+(currentUser.guardian2_phone||''):''}`:'Nenhum familiar autorizado informado.';
  if($('annualReviewBox')) $('annualReviewBox').innerHTML=`<b>Status:</b> ${currentUser.annual_review_status||'pendente'}<br><b>Última revisão:</b> ${currentUser.annual_review_last_at||'não realizada'}<br><b>Observação:</b> ${currentUser.annual_review_note||'sem observação'}`;
  renderSystemBanner(); renderExpirationCard(); await loadProgress(); pickNext(); renderAll();
}

function protocolDoneCount(){
  return Object.keys(recordings||{}).filter(i=>Number(i)<phraseLimit()).length;
}

function protocolVoiceComplete(){
  return protocolDoneCount()>=phraseLimit();
}

function protocolLegacyComplete(){
  return (legacyMessages||[]).length>0;
}

function protocolCareRequested(){
  return (careAppRequests||[]).length>0;
}

function renderProtocolState(){
  const done=protocolDoneCount();
  const voiceOk=protocolVoiceComplete();
  const legacyOk=protocolLegacyComplete();
  const careOk=protocolCareRequested();

  const next = $('protocolNextText');
  const btn = $('startProtocolBtn');

  const setStep=(id, status)=>{
    const el=$(id);
    if(!el) return;
    el.classList.remove('stepDone','stepActive','stepLocked');
    el.classList.add(status);
  };

  setStep('stepConsent','stepDone');

  if(!voiceOk){
    setStep('stepVoice','stepActive');
    setStep('stepLegacy','stepLocked');
    setStep('stepCare','stepLocked');
    if(next) next.textContent=`Próxima fase: Banco de Voz. ${done}/${phraseLimit()} frases gravadas.`;
    if(btn) btn.textContent = done>0 ? 'Continuar Banco de Voz' : 'Iniciar Protocolo';
    return;
  }

  setStep('stepVoice','stepDone');

  if(!legacyOk){
    setStep('stepLegacy','stepActive');
    setStep('stepCare','stepLocked');
    if(next) next.textContent='Próxima fase: Mensagens. Cadastre pelo menos uma mensagem de legado prioritário.';
    if(btn) btn.textContent='Continuar Protocolo';
    return;
  }

  setStep('stepLegacy','stepDone');

  if(!careOk){
    setStep('stepCare','stepActive');
    if(next) next.textContent='Próxima fase: Vozia Care. Solicite a geração do app para uso prático da voz.';
    if(btn) btn.textContent='Pedir Vozia Care';
    return;
  }

  setStep('stepCare','stepDone');
  if(next) next.textContent='Protocolo concluído: Banco de Voz, Mensagens e solicitação do Vozia Care finalizados.';
  if(btn) btn.textContent='Protocolo Concluído';
}

function iniciarProtocoloPaciente(){
  if(!currentUser){
    openAuth();
    return;
  }

  const voiceOk=protocolVoiceComplete();
  const legacyOk=protocolLegacyComplete();
  const careOk=protocolCareRequested();

  if(!voiceOk){
    $('checklistCard')?.classList.remove('hidden');
    $('recorder')?.classList.add('hidden');
    $('legacySection')?.classList.add('hidden');
    $('voziaCareRequestBox')?.classList.add('hidden');
    setTimeout(()=>$('checklistCard')?.scrollIntoView({behavior:'smooth', block:'start'}),80);
    renderProtocolState();
    return;
  }

  if(!legacyOk){
    $('legacySection')?.classList.remove('hidden');
    $('recorder')?.classList.add('hidden');
    $('checklistCard')?.classList.add('hidden');
    $('voziaCareRequestBox')?.classList.add('hidden');
    setTimeout(()=>$('legacySection')?.scrollIntoView({behavior:'smooth', block:'start'}),80);
    renderProtocolState();
    return;
  }

  if(!careOk){
    $('voziaCareRequestBox')?.classList.remove('hidden');
    $('recorder')?.classList.add('hidden');
    $('checklistCard')?.classList.add('hidden');
    $('legacySection')?.classList.add('hidden');
    setTimeout(()=>$('voziaCareRequestBox')?.scrollIntoView({behavior:'smooth', block:'start'}),80);
    renderProtocolState();
    return;
  }

  $('completeBox')?.classList.remove('hidden');
  setTimeout(()=>$('completeBox')?.scrollIntoView({behavior:'smooth', block:'start'}),80);
  renderProtocolState();
}

$('startProtocolBtn')?.addEventListener('click',iniciarProtocoloPaciente);


function renderSystemBanner(){const b=$('systemBanner'); if(!b)return; let html=''; if(settings.mode==='teste') html += "<b>Modo TESTE ativo.</b><p class='small'>Use apenas para demonstração. Não misture com dados reais.</p>"; if(settings.mode==='producao') html += "<b>Modo PRODUÇÃO ativo.</b><p class='small'>Dados reais: mantenha backup e controle de autorização.</p>"; if(!settings.license_active) html += "<p class='small'>Licença local ainda não ativada. O admin pode ativar em /admin.html.</p>"; b.innerHTML=html; b.classList.remove('hidden'); b.classList.toggle('bannerWarn', settings.mode==='teste'); b.classList.toggle('bannerDanger', !settings.license_active);}
function renderExpirationCard(){const card=$('expirationCard'); if(!card||!currentUser)return; const isEval=currentUser.plan==='avaliacao'; card.classList.toggle('hidden',!isEval&&!currentUser.expired); if(isEval){const d=daysUntil(currentUser.plan_expires_at); $('expirationText').textContent=(currentUser.expired||d<0)?'Seu período de avaliação expirou. Migre para continuar.':`Você está no plano Avaliação. Restam ${d} dia(s). Após 7 dias, os dados poderão ser apagados e não há direito ao app final.`;}}
function openAuth(){ $('landing').classList.add('hidden'); $('auth').classList.remove('hidden'); setTimeout(()=>$('auth').scrollIntoView({behavior:'smooth'}),80); }
$('startBtn')?.addEventListener('click',openAuth); $('startBtn2')?.addEventListener('click',openAuth);
$('dataBtn')?.addEventListener('click',async()=>{$('dataPanel').classList.toggle('hidden'); if(!$('dataPanel').classList.contains('hidden')) await loadMyData();});
const contract=$('contractBox'); if(contract){contract.addEventListener('scroll',()=>{if(contract.scrollTop+contract.clientHeight>=contract.scrollHeight-8)$('regTerms').disabled=false;});}
$('regTerms')?.addEventListener('change',()=>{$('registerBtn').disabled=!$('regTerms').checked;});
$('registerBtn')?.addEventListener('click',async()=>{hideMsg('regMsg'); try{const fd=new FormData(); const ids=['regName','regEmail','regPassword','regPlan','guardianName','guardianEmail','guardianPhone','guardianRelation','guardianDocument','guardian2Name','guardian2Email','guardian2Phone','guardian2Relation','guardian2Document']; const map={regName:'name',regEmail:'email',regPassword:'password',regPlan:'plan',guardianName:'guardian_name',guardianEmail:'guardian_email',guardianPhone:'guardian_phone',guardianRelation:'guardian_relation',guardianDocument:'guardian_document',guardian2Name:'guardian2_name',guardian2Email:'guardian2_email',guardian2Phone:'guardian2_phone',guardian2Relation:'guardian2_relation',guardian2Document:'guardian2_document'}; ids.forEach(id=>fd.append(map[id],($(id)?.value||'').trim())); fd.append('accepted_terms',$('regTerms').checked?'true':'false'); if($('regPhoto').files[0]) fd.append('photo',$('regPhoto').files[0]); await api('/api/register',{method:'POST',body:fd}); await 
document.addEventListener("click", (ev)=>{
  const btn = ev.target.closest(".promptBtn");
  if(btn){
    const note = document.getElementById("legacyNote");
    const rec = document.getElementById("legacyRecipient");
    const pri = document.getElementById("legacyPriority");
    if(note) note.value = btn.dataset.note || "";
    if(rec) rec.value = btn.dataset.recipient || "";
    if(pri && /família/i.test(btn.dataset.recipient || "")) pri.checked = true;
    if(note) note.scrollIntoView({behavior:"smooth", block:"center"});
  }
});

refreshMe();}catch(e){showMsg('regMsg',e.message);}});
$('loginBtn')?.addEventListener('click',async()=>{hideMsg('loginMsg'); try{await api('/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:$('loginEmail').value,password:$('loginPassword').value})}); await 
document.addEventListener("click", (ev)=>{
  const btn = ev.target.closest(".promptBtn");
  if(btn){
    const note = document.getElementById("legacyNote");
    const rec = document.getElementById("legacyRecipient");
    const pri = document.getElementById("legacyPriority");
    if(note) note.value = btn.dataset.note || "";
    if(rec) rec.value = btn.dataset.recipient || "";
    if(pri && /família/i.test(btn.dataset.recipient || "")) pri.checked = true;
    if(note) note.scrollIntoView({behavior:"smooth", block:"center"});
  }
});

refreshMe();}catch(e){showMsg('loginMsg',e.message);}});
$('logoutBtn')?.addEventListener('click',async()=>{await api('/api/logout',{method:'POST'}); location.reload();});

async function loadProgress(){const data=await api('/api/progress'); recordings={}; data.recordings.forEach(r=>recordings[r.phrase_index]=r); legacyMessages=data.legacy||[]; backupRequests=data.requests||[]; deletionRequests=data.deletion_requests||[]; careAppRequests=data.vozia_care_requests||[];}
function pickNext(){for(let i=0;i<phraseLimit();i++){if(!recordings[i]){currentIndex=i;return;}} currentIndex=Math.max(0,phraseLimit()-1);}
function renderAll(){
  const done=Object.keys(recordings).filter(i=>Number(i)<phraseLimit()).length;
  const pct=Math.round(done/phraseLimit()*100);
  const voiceComplete = done>=phraseLimit();
  const legacyComplete = (legacyMessages||[]).length>0;
  const careRequested = (careAppRequests||[]).length>0;

  $('doneCount').textContent=done;
  $('percent').textContent=pct+'%';
  $('legacyCount').textContent=legacyMessages.length;
  $('bar').style.width=pct+'%';

  $('completeBox').classList.toggle('hidden',!voiceComplete);
  if($('voziaCareRequestBox')) $('voziaCareRequestBox').classList.toggle('hidden',!(voiceComplete && legacyComplete && !careRequested));
  if($('legacySection')) $('legacySection').classList.toggle('hidden',!(voiceComplete && !legacyComplete));

  if(voiceComplete) $('certText').textContent=`Certificado ${currentUser.vault_id} • ${currentUser.name} • ${new Date().toLocaleDateString('pt-BR')} • Plano ${currentUser.limits.label}`;

  const p=phrases[currentIndex]||phrases[0];
  $('category').textContent=p.category;
  $('counter').textContent=`Frase ${currentIndex+1} de ${phraseLimit()}`;
  $('phraseText').textContent=p.text;
  $('previewBox').classList.add('hidden');
  $('audioPreview').removeAttribute('src');
  $('saveBtn').disabled=true;
  $('retryBtn').disabled=true;
  pendingBlob=null;

  renderMap();
  renderLegacy();
  renderRequests();
  renderDeletionRequests();
  renderCareAppRequests();
  renderQuality();
  renderTimeline();
  renderJourney();
  renderProtocolState();

  const expired=currentUser&&currentUser.expired;
  ['recordBtn','saveBtn','legacyRecordBtn','legacySaveBtn'].forEach(id=>{if($(id)&&expired)$(id).disabled=true;});
}
function renderMap(){$('phraseMap').innerHTML=phrases.map((p,i)=>{const locked=i>=phraseLimit(); return `<button class="dot${recordings[i]?' done':''}${i===currentIndex?' active':''}${locked?' lock':''}" data-i="${i}" ${locked?'disabled':''}>${i+1}</button>`;}).join(''); document.querySelectorAll('.dot:not(.lock)').forEach(btn=>btn.onclick=()=>{currentIndex=Number(btn.dataset.i); renderAll();});}

function abrirBancoDeVoz(){
  $('checklistCard')?.classList.add('hidden');
  $('recorder')?.classList.remove('hidden');
  $('legacySection')?.classList.add('hidden');
  $('voziaCareRequestBox')?.classList.add('hidden');
  setTimeout(()=>$('recorder')?.scrollIntoView({behavior:'smooth'}),100);
  renderAll();
}
$('beginGuideBtn')?.addEventListener('click',abrirBancoDeVoz);


async function countdown(){const c=$('countdown'); if(!c)return; c.classList.remove('hidden'); for(let i=3;i>=1;i--){c.textContent=i; await new Promise(r=>setTimeout(r,700));} c.textContent='Gravando'; await new Promise(r=>setTimeout(r,300)); c.classList.add('hidden');}
function startMeter(stream){try{audioContext=new (window.AudioContext||window.webkitAudioContext)(); const source=audioContext.createMediaStreamSource(stream); analyser=audioContext.createAnalyser(); analyser.fftSize=256; source.connect(analyser); const data=new Uint8Array(analyser.frequencyBinCount); const loop=()=>{analyser.getByteFrequencyData(data); const avg=data.reduce((a,b)=>a+b,0)/data.length; $('volumeBar').style.width=Math.min(100,avg*1.4)+'%'; volumeRAF=requestAnimationFrame(loop);}; loop();}catch(e){}}
function stopMeter(){if(volumeRAF) cancelAnimationFrame(volumeRAF); volumeRAF=null; if(audioContext) audioContext.close().catch(()=>{}); audioContext=null; if($('volumeBar')) $('volumeBar').style.width='0%';}
async function startGenericRecorder(onStop, withCountdown=false){const stream=await navigator.mediaDevices.getUserMedia({audio:true}); mediaStream=stream; if(withCountdown) await countdown(); const rec=new MediaRecorder(stream); const chunks=[]; const start=Date.now(); startMeter(stream); rec.ondataavailable=e=>chunks.push(e.data); rec.onstop=()=>{const duration=Date.now()-start; const blob=new Blob(chunks,{type:'audio/webm'}); stream.getTracks().forEach(t=>t.stop()); stopMeter(); $('recordStatus')?.classList.add('hidden'); onStop(blob,duration);}; rec.start(); $('recordStatus')?.classList.remove('hidden'); return rec;}
$('recordBtn')?.addEventListener('click',async()=>{try{mediaRecorder=await startGenericRecorder((blob,duration)=>{pendingBlob=blob; pendingDuration=duration; $('audioPreview').src=URL.createObjectURL(blob); $('previewInfo').textContent=`Duração: ${Math.round(duration/1000)}s • ${qualityNote(duration)}${duration<700?' • Atenção: quase não houve fala.':''}`; $('previewBox').classList.remove('hidden'); $('saveBtn').disabled=false; $('retryBtn').disabled=false; $('recordBtn').disabled=false; $('pauseBtn').disabled=true; $('stopBtn').disabled=true;},true); $('recordBtn').disabled=true; $('pauseBtn').disabled=false; $('stopBtn').disabled=false;}catch(e){alert('Não foi possível acessar o microfone.');}});
$('pauseBtn')?.addEventListener('click',()=>{if(mediaRecorder&&mediaRecorder.state==='recording'){mediaRecorder.pause(); $('pauseBtn').classList.add('hidden'); $('resumeBtn').classList.remove('hidden'); $('recordStatus').textContent='Pausado';}});
$('resumeBtn')?.addEventListener('click',()=>{if(mediaRecorder&&mediaRecorder.state==='paused'){mediaRecorder.resume(); $('resumeBtn').classList.add('hidden'); $('pauseBtn').classList.remove('hidden'); $('recordStatus').textContent='● Gravando...';}});
$('stopBtn')?.addEventListener('click',()=>{if(mediaRecorder&&(mediaRecorder.state==='recording'||mediaRecorder.state==='paused'))mediaRecorder.stop();});
$('retryBtn')?.addEventListener('click',()=>{pendingBlob=null; $('previewBox').classList.add('hidden'); $('saveBtn').disabled=true; $('retryBtn').disabled=true;});
$('saveBtn')?.addEventListener('click',async()=>{if(!pendingBlob)return alert('Grave antes de salvar.'); const p=phrases[currentIndex]; const fd=new FormData(); fd.append('phrase_index',String(currentIndex)); fd.append('phrase_text',p.text); fd.append('category',p.category); fd.append('duration_ms',String(pendingDuration)); fd.append('quality_note',qualityNote(pendingDuration)); fd.append('audio',pendingBlob,`frase-${currentIndex+1}.webm`); await api('/api/recordings',{method:'POST',body:fd}); await loadProgress(); pickNext(); renderAll();});
$('deleteBtn')?.addEventListener('click',async()=>{if(!recordings[currentIndex])return alert('Esta frase ainda não foi salva.'); if(!confirm('Apagar gravação desta frase?'))return; await api(`/api/recordings/${currentIndex}`,{method:'DELETE'}); await loadProgress(); renderAll();});

$('legacyRecordBtn')?.addEventListener('click',async()=>{try{mediaRecorder=await startGenericRecorder((blob,duration)=>{legacyBlob=blob; legacyDuration=duration; $('legacyPreview').src=URL.createObjectURL(blob); $('legacySaveBtn').disabled=false; $('legacyRecordBtn').disabled=false; $('legacyStopBtn').disabled=true;}); $('legacyRecordBtn').disabled=true; $('legacyStopBtn').disabled=false;}catch(e){alert('Não foi possível acessar o microfone.');}});
$('legacyStopBtn')?.addEventListener('click',()=>{if(mediaRecorder&&mediaRecorder.state==='recording')mediaRecorder.stop();});
$('legacySaveBtn')?.addEventListener('click',async()=>{if(!legacyBlob)return alert('Grave uma mensagem primeiro.'); const fd=new FormData(); fd.append('title',$('legacyTitle').value); fd.append('recipient',$('legacyRecipient')?.value||''); fd.append('text_note',$('legacyNote').value); fd.append('is_priority',$('legacyPriority')?.checked?'1':'0'); fd.append('duration_ms',String(legacyDuration)); fd.append('audio',legacyBlob,'legado.webm'); try{await api('/api/legacy',{method:'POST',body:fd}); legacyBlob=null; $('legacySaveBtn').disabled=true; $('legacyPreview').removeAttribute('src'); $('legacyNote').value=''; if($('legacyRecipient')) $('legacyRecipient').value=''; if($('legacyPriority')) $('legacyPriority').checked=false; await loadProgress(); renderAll();}catch(e){alert(e.message);}});
function renderLegacy(){$('legacyList').innerHTML=legacyMessages.map(m=>`<div class="legacyItem"><b>${Number(m.is_priority)===1?'⭐ PRIORITÁRIA — ':''}${m.title}</b><p class="small">${m.recipient?'Para: '+m.recipient+' • ':''}${m.text_note||''} • ${Math.round((m.duration_ms||0)/1000)}s • ${new Date(m.created_at).toLocaleString('pt-BR')}</p><audio controls src="${m.file_path}"></audio><div class="actions"><button class="ghost" onclick="setPriorityLegacy(${m.id})">Definir como prioritária</button><button class="ghost" onclick="deleteLegacy(${m.id})">Apagar</button></div></div>`).join('')||"<p class='small'>Nenhuma mensagem de legado gravada ainda.</p>";}
window.setPriorityLegacy=async(id)=>{await api(`/api/legacy/${id}/priority`,{method:'POST'}); await loadProgress(); renderAll();};
window.deleteLegacy=async(id)=>{if(!confirm('Apagar mensagem de legado?'))return; await api(`/api/legacy/${id}`,{method:'DELETE'}); await loadProgress(); renderAll();};

function renderRequests(){const box=$('requestList'); if(box) box.innerHTML='';}
$('deleteRequestBtn')?.addEventListener('click',async()=>{hideMsg('deleteMsg'); try{await api('/api/deletion-request',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({reason:$('deleteReason').value})}); showMsg('deleteMsg','Solicitação de exclusão enviada para análise.',true); $('deleteReason').value=''; await loadProgress(); renderAll();}catch(e){showMsg('deleteMsg',e.message);}});
function renderDeletionRequests(){if(!$('deleteRequestList'))return; $('deleteRequestList').innerHTML=(deletionRequests||[]).map(r=>`<div class="requestItem"><b>Exclusão solicitada</b> <span class="status">${r.status}</span><p class="small">${r.reason||''} • ${new Date(r.created_at).toLocaleString('pt-BR')}</p>${r.decision_note?`<p class="small">Decisão: ${r.decision_note}</p>`:''}</div>`).join('')||"<p class='small'>Nenhuma solicitação de exclusão.</p>";}

async function loadMyData(){const data=await api('/api/my-data'); const u=data.user; $('myDataBox').innerHTML=`<div class="dataItem"><b>ID:</b> ${u.vault_id}<br><b>Plano:</b> ${u.limits.label}<br><b>Status:</b> ${u.subscription_status||'ativo'}<br><b>Contrato aceito em:</b> ${u.accepted_terms_at?new Date(u.accepted_terms_at).toLocaleString('pt-BR'):'registrado'}<br><b>Contato 1:</b> ${u.guardian_name||'não informado'} ${u.guardian_phone||''}<br><b>Contato 2:</b> ${u.guardian2_name||'não informado'} ${u.guardian2_phone||''}</div>`; ['Name','Email','Phone','Relation','Document'].forEach(x=>{const k='guardian'+(x==='Name'?'_name':x==='Email'?'_email':x==='Phone'?'_phone':x==='Relation'?'_relation':'_document'); const el=$('editGuardian'+x); if(el) el.value=u[k]||'';}); ['Name','Email','Phone','Relation','Document'].forEach(x=>{const k='guardian2'+(x==='Name'?'_name':x==='Email'?'_email':x==='Phone'?'_phone':x==='Relation'?'_relation':'_document'); const el=$('editGuardian2'+x); if(el) el.value=u[k]||'';}); $('auditList').innerHTML=data.logs.map(l=>`<div class="requestItem"><b>${l.action}</b><p class="small">${l.detail||''} • ${new Date(l.created_at).toLocaleString('pt-BR')}</p></div>`).join('');}
$('saveGuardianBtn')?.addEventListener('click',async()=>{await api('/api/update-guardian',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({guardian_name:$('editGuardianName').value,guardian_email:$('editGuardianEmail').value,guardian_phone:$('editGuardianPhone').value,guardian_relation:$('editGuardianRelation').value,guardian_document:$('editGuardianDocument')?.value||'',guardian2_name:$('editGuardian2Name')?.value||'',guardian2_email:$('editGuardian2Email')?.value||'',guardian2_phone:$('editGuardian2Phone')?.value||'',guardian2_relation:$('editGuardian2Relation')?.value||'',guardian2_document:$('editGuardian2Document')?.value||''})}); await 
document.addEventListener("click", (ev)=>{
  const btn = ev.target.closest(".promptBtn");
  if(btn){
    const note = document.getElementById("legacyNote");
    const rec = document.getElementById("legacyRecipient");
    const pri = document.getElementById("legacyPriority");
    if(note) note.value = btn.dataset.note || "";
    if(rec) rec.value = btn.dataset.recipient || "";
    if(pri && /família/i.test(btn.dataset.recipient || "")) pri.checked = true;
    if(note) note.scrollIntoView({behavior:"smooth", block:"center"});
  }
});

refreshMe(); await loadMyData();});
async function simulatePayment(plan){try{await api('/api/simulate-payment',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({plan})}); alert('Pagamento simulado registrado. Plano atualizado.'); await 
document.addEventListener("click", (ev)=>{
  const btn = ev.target.closest(".promptBtn");
  if(btn){
    const note = document.getElementById("legacyNote");
    const rec = document.getElementById("legacyRecipient");
    const pri = document.getElementById("legacyPriority");
    if(note) note.value = btn.dataset.note || "";
    if(rec) rec.value = btn.dataset.recipient || "";
    if(pri && /família/i.test(btn.dataset.recipient || "")) pri.checked = true;
    if(note) note.scrollIntoView({behavior:"smooth", block:"center"});
  }
});

refreshMe();}catch(e){alert(e.message);}}
$('payAnualBtn')?.addEventListener('click',()=>simulatePayment('anual')); $('payVitalicioBtn')?.addEventListener('click',()=>simulatePayment('vitalicio'));
async function upgradePlan(plan){try{await api('/api/upgrade-plan',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({plan})}); alert('Plano atualizado com sucesso.'); await 
document.addEventListener("click", (ev)=>{
  const btn = ev.target.closest(".promptBtn");
  if(btn){
    const note = document.getElementById("legacyNote");
    const rec = document.getElementById("legacyRecipient");
    const pri = document.getElementById("legacyPriority");
    if(note) note.value = btn.dataset.note || "";
    if(rec) rec.value = btn.dataset.recipient || "";
    if(pri && /família/i.test(btn.dataset.recipient || "")) pri.checked = true;
    if(note) note.scrollIntoView({behavior:"smooth", block:"center"});
  }
});

refreshMe();}catch(e){alert(e.message);}}
$('upgradeAnualBtn')?.addEventListener('click',()=>upgradePlan('anual')); $('upgradeVitalicioBtn')?.addEventListener('click',()=>upgradePlan('vitalicio'));
$('requestCareAppBtn')?.addEventListener('click',async()=>{hideMsg('careAppMsg'); try{const model=$('careAppModel').value; await api('/api/vozia-care-request',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({app_model:model,keyboard_interest:model==='teclado_upgrade'?'sim':'nao',notes:$('careAppNotes').value})}); showMsg('careAppMsg','Solicitação enviada. A equipe Vozia poderá gerar o app com os botões fixos da voz gravada. Para teclado ativo com voz sintética, entraremos em contato sobre o upgrade mensal.',true); $('careAppNotes').value=''; await loadProgress(); renderAll();}catch(e){showMsg('careAppMsg',e.message);}});
function renderCareAppRequests(){if(!$('careAppRequests'))return; $('careAppRequests').innerHTML=(careAppRequests||[]).map(r=>`<div class="requestItem"><b>Solicitação Vozia Care</b> <span class="status">${r.status}</span><p class="small">Modelo: ${r.app_model==='teclado_upgrade'?'Teclado ativo por upgrade mensal':'Botões fixos com voz gravada'} • ${new Date(r.created_at).toLocaleString('pt-BR')}</p>${r.notes?`<p class="small">${r.notes}</p>`:''}</div>`).join('')||"<p class='small'>Nenhuma solicitação do app Vozia Care ainda.</p>";}

function renderQuality(){if(!$('qualityScore'))return; const done=Object.keys(recordings).filter(i=>Number(i)<phraseLimit()).length; const pctPart=Math.round((done/phraseLimit())*70); const legacyPart=Math.min(legacyMessages.length*5,15); let good=0; Object.values(recordings).forEach(r=>{const d=Number(r.duration_ms||0); if(d>=900&&d<=16000)good++;}); const qualityPart=done?Math.round((good/done)*15):0; const score=Math.min(100,pctPart+legacyPart+qualityPart); $('qualityScore').textContent=score; $('qualityExplain').textContent=`Base: ${done}/${phraseLimit()} frases, ${good} áudios com duração adequada e ${legacyMessages.length} mensagem(ns) de legado.`;}
function renderTimeline(){if(!$('timeline'))return; const events=[]; events.push({title:'Cofre criado',detail:new Date(currentUser.created_at).toLocaleString('pt-BR')}); if(currentUser.accepted_terms_at)events.push({title:'Contrato aceito',detail:new Date(currentUser.accepted_terms_at).toLocaleString('pt-BR')}); const done=Object.keys(recordings).filter(i=>Number(i)<phraseLimit()).length; if(done>0)events.push({title:'Primeira frase gravada',detail:`${done}/${phraseLimit()} frases gravadas`}); if(done>=Math.ceil(phraseLimit()/2))events.push({title:'50% concluído',detail:'Metade do banco vocal preservado'}); if(done>=phraseLimit())events.push({title:'100% concluído',detail:'Banco vocal completo'}); if(legacyMessages.length)events.push({title:'Mensagem de legado criada',detail:`${legacyMessages.length} mensagem(ns)`}); if(careAppRequests.length)events.push({title:'Vozia Care solicitado',detail:`${careAppRequests[0].status}`}); $('timeline').innerHTML=events.map(e=>`<div class="timeItem"><b>${e.title}</b><p class="small">${e.detail}</p></div>`).join('');}
function renderJourney(){if(!$('journeyGrid'))return; const done=Object.keys(recordings).filter(i=>Number(i)<phraseLimit()).length; const completed=done>=phraseLimit(); const hasLegacy=legacyMessages.length>0; const hasPriority=legacyMessages.some(m=>Number(m.is_priority)===1); const careRequested=(careAppRequests||[]).length>0; const steps=[{title:'Cadastro e aceite',ok:!!currentUser.accepted_terms_at,detail:'Contrato inicial aceito'},{title:'Gravação das frases',ok:completed,detail:`${done}/${phraseLimit()} frases gravadas`},{title:'Mensagem de legado',ok:hasLegacy,detail:hasPriority?'Mensagem prioritária definida':'Grave uma mensagem para família'},{title:'Vozia Care',ok:careRequested,detail:careRequested?'Solicitado':'Solicite após concluir as gravações'},{title:'Revisão anual',ok:currentUser.annual_review_status&&currentUser.annual_review_status!=='pendente',detail:currentUser.annual_review_status||'pendente'},{title:'Relatório do cofre',ok:true,detail:'Disponível em Meus dados'}]; $('journeyGrid').innerHTML=steps.map(s=>`<div class="journeyStep ${s.ok?'ok':''}"><b>${s.ok?'✓':'○'} ${s.title}</b><p class="small">${s.detail}</p></div>`).join('');}
function speakDemoText(text){try{if(!('speechSynthesis' in window)){alert('Este navegador não possui voz de teste disponível.');return;} window.speechSynthesis.cancel(); const utter=new SpeechSynthesisUtterance(text); utter.lang='pt-BR'; utter.rate=.92; const voices=window.speechSynthesis.getVoices(); const brVoice=voices.find(v=>/pt-BR|Portuguese|Brasil|Google/i.test(v.lang+' '+v.name)); if(brVoice) utter.voice=brVoice; window.speechSynthesis.speak(utter);}catch(e){alert('Não foi possível testar a voz neste navegador.');}}
document.addEventListener('click',ev=>{const btn=ev.target.closest('.speakDemo'); if(btn) speakDemoText(btn.dataset.text||btn.textContent.trim());});

document.addEventListener("click", (ev)=>{
  const btn = ev.target.closest(".promptBtn");
  if(btn){
    const note = document.getElementById("legacyNote");
    const rec = document.getElementById("legacyRecipient");
    const pri = document.getElementById("legacyPriority");
    if(note) note.value = btn.dataset.note || "";
    if(rec) rec.value = btn.dataset.recipient || "";
    if(pri && /família/i.test(btn.dataset.recipient || "")) pri.checked = true;
    if(note) note.scrollIntoView({behavior:"smooth", block:"center"});
  }
});

refreshMe();
