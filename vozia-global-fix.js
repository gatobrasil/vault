// VOZIA GLOBAL FIX — BOTÕES VOLTAR / SAIR
(function(){
  function homePath(){var p=location.pathname.toLowerCase();return p==="/"||p.endsWith("/index.html")||p==="";}
  function visible(el){if(!el)return false;var cs=getComputedStyle(el);return cs.display!=="none"&&cs.visibility!=="hidden"&&el.offsetHeight>10;}
  function internal(){return !homePath()||visible(document.getElementById("app"))||visible(document.getElementById("adminArea"));}
  function signOut(){
    try{ if(typeof voziaSignOut==="function"){ Promise.resolve(voziaSignOut()).finally(function(){location.href="/"}); return; } }catch(e){}
    try{ if(window.voziaSupabase&&window.voziaSupabase.auth){ window.voziaSupabase.auth.signOut().finally(function(){location.href="/"}); return; } }catch(e){}
    location.href="/";
  }
  function back(){ if(!homePath()&&history.length>1){history.back(); setTimeout(function(){if(document.visibilityState==="visible") location.href="/";},500);} else location.href="/"; }
  function restore(){
    document.querySelectorAll("button,.btn,a.ghost,button.ghost").forEach(function(el){
      el.style.visibility="visible"; el.style.opacity="1"; el.style.pointerEvents="auto";
      if((el.tagName==="BUTTON"||el.classList.contains("btn")||el.classList.contains("ghost")) && (!el.style.display||el.style.display==="none")) el.style.display="inline-flex";
    });
    document.querySelectorAll("button,a").forEach(function(el){
      var t=(el.textContent||"").trim().toLowerCase();
      if(t==="voltar"&&!el.dataset.voziaBackFixed){el.dataset.voziaBackFixed="1";el.addEventListener("click",function(ev){if(el.tagName==="BUTTON"||el.getAttribute("href")==="#"){ev.preventDefault();back();}});}
      if((t==="sair"||t==="logout")&&!el.dataset.voziaLogoutFixed){el.dataset.voziaLogoutFixed="1";el.addEventListener("click",function(ev){ev.preventDefault();signOut();});}
    });
  }
  function topActions(){
    var box=document.getElementById("voziaGlobalTopActions");
    if(!internal()){ if(box) box.style.display="none"; return; }
    if(!box){
      box=document.createElement("div"); box.id="voziaGlobalTopActions"; box.className="vozia-global-top-actions";
      box.innerHTML='<button type="button" id="voziaGlobalBackBtn">Voltar</button><button type="button" id="voziaGlobalLogoutBtn">Sair</button>';
      document.body.appendChild(box);
      document.getElementById("voziaGlobalBackBtn").addEventListener("click",back);
      document.getElementById("voziaGlobalLogoutBtn").addEventListener("click",signOut);
    }
    box.style.display="flex";
  }
  function openAuth(){
    document.body.classList.add("home-open-auth");
    var auth=document.getElementById("auth");
    if(auth){auth.classList.remove("hidden");auth.removeAttribute("hidden");auth.style.display="block";auth.style.visibility="visible";auth.style.opacity="1";setTimeout(function(){auth.scrollIntoView({behavior:"smooth",block:"start"});},80);}
  }
  window.voziaIrParaCadastroDefinitivo=openAuth; window.voziaIrParaCadastro=openAuth; window.voziaAbrirCadastroHome=openAuth;
  function run(){restore();topActions();["startBtn","startBtn2"].forEach(function(id){var b=document.getElementById(id);if(b&&!b.dataset.voziaOpenAuth){b.dataset.voziaOpenAuth="1";b.addEventListener("click",function(e){e.preventDefault();openAuth();});}});document.querySelectorAll("button").forEach(function(b){var t=(b.textContent||"").toLowerCase();if((t.includes("criar meu cofre agora")||t.includes("criar cofre de voz"))&&!b.dataset.voziaOpenAuth){b.dataset.voziaOpenAuth="1";b.addEventListener("click",function(e){e.preventDefault();openAuth();});}});}
  document.addEventListener("DOMContentLoaded",function(){run();setTimeout(run,500);setTimeout(run,1200);setTimeout(run,2500);});
  document.addEventListener("click",function(){setTimeout(run,80);},true);
  window.voziaGlobalButtonsFix=run;
})();


// ============================================================
// VOZIA SAFE NAV FIX — Cadastro/Login sem travar
// - Botões da home abrem a área de cadastro/login.
// - Após login/cadastro, se o painel do paciente aparecer, apenas rola até ele.
// - Não esconde landing, não força display:none e não bloqueia navegação.
// ============================================================
(function () {
  function showElement(el) {
    if (!el) return;
    el.classList.remove("hidden");
    el.removeAttribute("hidden");
    el.style.display = "block";
    el.style.visibility = "visible";
    el.style.opacity = "1";
    el.style.height = "auto";
    el.style.maxHeight = "none";
    el.style.overflow = "visible";
  }

  function abrirCadastro() {
    var auth = document.getElementById("auth");
    document.body.classList.add("home-open-auth");
    showElement(auth);

    setTimeout(function () {
      if (auth) {
        auth.scrollIntoView({ behavior: "smooth", block: "start" });
        var first = auth.querySelector('input:not([type="hidden"]), select, textarea');
        if (first && window.innerWidth > 760) {
          setTimeout(function () {
            try { first.focus(); } catch(e) {}
          }, 450);
        }
      }
    }, 80);
  }

  function isVisible(el) {
    if (!el) return false;
    var cs = getComputedStyle(el);
    return cs.display !== "none" &&
      cs.visibility !== "hidden" &&
      el.offsetHeight > 40 &&
      el.offsetWidth > 40;
  }

  function appLooksReady(app) {
    if (!app) return false;
    var text = (app.textContent || "").toLowerCase();
    return text.includes("painel") ||
      text.includes("protocolo") ||
      text.includes("banco de voz") ||
      text.includes("vozia care") ||
      text.includes("gravar") ||
      app.querySelector("button,input,textarea,select,audio");
  }

  function scrollToPatientPanelIfReady() {
    var app = document.getElementById("app");
    if (!app || !isVisible(app) || !appLooksReady(app)) return false;

    // Não esconde nada. Apenas rola até o painel.
    setTimeout(function () {
      try {
        app.scrollIntoView({ behavior: "smooth", block: "start" });
      } catch(e) {}
    }, 150);

    return true;
  }

  function connectHomeButtons() {
    ["startBtn", "startBtn2"].forEach(function (id) {
      var btn = document.getElementById(id);
      if (btn && !btn.dataset.voziaSafeOpenAuth) {
        btn.dataset.voziaSafeOpenAuth = "1";
        btn.addEventListener("click", function (ev) {
          ev.preventDefault();
          abrirCadastro();
        });
      }
    });

    document.querySelectorAll("button").forEach(function (btn) {
      var t = (btn.textContent || "").toLowerCase();
      var isHomeCta =
        t.includes("criar meu cofre agora") ||
        t.includes("criar cofre de voz");

      if (isHomeCta && !btn.dataset.voziaSafeOpenAuth) {
        btn.dataset.voziaSafeOpenAuth = "1";
        btn.addEventListener("click", function (ev) {
          ev.preventDefault();
          abrirCadastro();
        });
      }
    });
  }

  function connectAuthButtonsForPanelScroll() {
    var auth = document.getElementById("auth");
    if (!auth) return;

    auth.querySelectorAll("button").forEach(function (btn) {
      var t = (btn.textContent || "").toLowerCase();
      var isAuthAction =
        t.includes("entrar") ||
        t.includes("cadastrar") ||
        t.includes("criar") ||
        t.includes("continuar");

      if (isAuthAction && !btn.dataset.voziaScrollPanelAfterAuth) {
        btn.dataset.voziaScrollPanelAfterAuth = "1";
        btn.addEventListener("click", function () {
          // Dá tempo do Supabase autenticar e do app antigo renderizar.
          setTimeout(scrollToPatientPanelIfReady, 700);
          setTimeout(scrollToPatientPanelIfReady, 1400);
          setTimeout(scrollToPatientPanelIfReady, 2600);
        });
      }
    });
  }

  function runSafeNavFix() {
    connectHomeButtons();
    connectAuthButtonsForPanelScroll();
  }

  window.voziaIrParaCadastroDefinitivo = abrirCadastro;
  window.voziaIrParaCadastro = abrirCadastro;
  window.voziaAbrirCadastroHome = abrirCadastro;
  window.voziaScrollToPatientPanelIfReady = scrollToPatientPanelIfReady;

  document.addEventListener("DOMContentLoaded", function () {
    runSafeNavFix();
    setTimeout(runSafeNavFix, 500);
    setTimeout(runSafeNavFix, 1200);
  });

  document.addEventListener("click", function () {
    setTimeout(runSafeNavFix, 80);
  }, true);
})();
