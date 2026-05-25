// VOZIA — Botões Voltar / Sair sem interferir no login/painel
(function(){
  function pathIsHome(){
    var p=(location.pathname||"/").toLowerCase();
    return p==="/" || p.endsWith("/index.html");
  }
  function isVisible(el){
    if(!el) return false;
    var cs=getComputedStyle(el);
    return cs.display!=="none" && cs.visibility!=="hidden" && el.offsetHeight>30 && el.offsetWidth>30;
  }
  function shouldShowButtons(){
    if(!pathIsHome()) return true;
    if(isVisible(document.getElementById("app"))) return true;
    if(isVisible(document.getElementById("adminArea"))) return true;
    return false;
  }
  async function doLogout(){
    try{
      if(typeof voziaSignOut==="function"){
        await voziaSignOut();
        location.href="/";
        return;
      }
    }catch(e){}
    try{
      if(window.voziaSupabase && window.voziaSupabase.auth){
        await window.voziaSupabase.auth.signOut();
        location.href="/";
        return;
      }
    }catch(e){}
    try{
      localStorage.removeItem("vozia_current_user");
      sessionStorage.clear();
    }catch(e){}
    location.href="/";
  }
  function goHome(){ location.href="/"; }
  function ensureButtons(){
    var box=document.getElementById("voziaTopSafeActions");
    if(!box){
      box=document.createElement("div");
      box.id="voziaTopSafeActions";
      box.className="vozia-top-safe-actions";
      box.innerHTML='<button type="button" id="voziaSafeHomeBtn">Voltar</button><button type="button" class="vozia-safe-logout" id="voziaSafeLogoutBtn">Sair</button>';
      document.body.appendChild(box);
      document.getElementById("voziaSafeHomeBtn").addEventListener("click",goHome);
      document.getElementById("voziaSafeLogoutBtn").addEventListener("click",doLogout);
    }
    if(shouldShowButtons()) document.body.classList.add("vozia-show-safe-actions");
    else document.body.classList.remove("vozia-show-safe-actions");
  }
  function fixExistingTextButtons(){
    document.querySelectorAll("button,a").forEach(function(el){
      var text=(el.textContent||"").trim().toLowerCase();
      if(text==="voltar" && !el.dataset.voziaSafeBack){
        el.dataset.voziaSafeBack="1";
        el.addEventListener("click",function(ev){
          var href=el.getAttribute("href");
          if(el.tagName==="BUTTON" || !href || href==="#"){
            ev.preventDefault();
            goHome();
          }
        });
      }
      if((text==="sair" || text==="logout") && !el.dataset.voziaSafeLogout){
        el.dataset.voziaSafeLogout="1";
        el.addEventListener("click",function(ev){
          ev.preventDefault();
          doLogout();
        });
      }
    });
  }
  function run(){ ensureButtons(); fixExistingTextButtons(); }
  document.addEventListener("DOMContentLoaded",function(){
    run();
    setTimeout(run,600);
    setTimeout(run,1500);
    setTimeout(run,3000);
  });
  document.addEventListener("click",function(){
    setTimeout(run,250);
    setTimeout(run,1200);
  },true);
  window.voziaSafeNavButtons=run;
})();
