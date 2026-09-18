(function(){
  const sidebar=document.getElementById('appSidebar');
  const toggle=document.getElementById('sidebarToggle');
  const backdrop=document.getElementById('sidebarBackdrop');
  const key='handover-sidebar-collapsed';
  const mobile=()=>window.innerWidth<=900;

  function setCollapsed(v){
    document.body.classList.toggle('sidebar-collapsed',!!v);
    if(!mobile()) document.body.classList.remove('sidebar-hover');
    try{localStorage.setItem(key,v?'1':'0')}catch(e){}
  }

  if(sidebar){
    // Desktop: sidebar is normally compact and expands while the mouse is over it.
    // Mobile: keep the click-to-open drawer behavior.
    if(mobile()){
      document.body.classList.remove('sidebar-collapsed');
    }else{
      // Auto-collapse is the default. A previous expanded preference is intentionally ignored
      // so all three workspaces start with the same compact navigation.
      document.body.classList.add('sidebar-collapsed');
      try{localStorage.setItem(key,'1')}catch(e){}
      sidebar.addEventListener('mouseenter',()=>{
        if(!mobile()) document.body.classList.add('sidebar-hover');
      });
      sidebar.addEventListener('mouseleave',()=>{
        if(!mobile()) document.body.classList.remove('sidebar-hover');
      });
    }

    toggle?.addEventListener('click',()=>{
      if(mobile()){
        document.body.classList.toggle('sidebar-open');
      }else{
        // Keep the manual button useful: click toggles a temporary expanded state.
        const expanded=document.body.classList.contains('sidebar-hover');
        document.body.classList.toggle('sidebar-hover',!expanded);
      }
    });
    backdrop?.addEventListener('click',()=>document.body.classList.remove('sidebar-open'));
    sidebar.querySelectorAll('.nav-tabs button').forEach(btn=>btn.addEventListener('click',()=>{
      if(mobile()) document.body.classList.remove('sidebar-open');
    }));
  }

  document.querySelectorAll('[data-close-notice]').forEach(btn=>btn.addEventListener('click',()=>{
    const n=btn.closest('.floating-notice');
    if(!n)return;
    n.classList.add('is-closed');
    try{localStorage.setItem('notice-closed-'+(n.id||location.pathname),'1')}catch(e){}
  }));
  document.querySelectorAll('.floating-notice').forEach(n=>{
    try{if(localStorage.getItem('notice-closed-'+(n.id||location.pathname))==='1')n.classList.add('is-closed')}catch(e){}
  });

  const login=document.getElementById('loginView'),main=document.getElementById('mainView');
  function sync(){
    const logged=main?getComputedStyle(main).display!=='none':(login?getComputedStyle(login).display==='none':true);
    document.body.classList.toggle('is-authenticated',logged);
  }
  if(login||main){
    sync();
    const mo=new MutationObserver(sync);
    if(login)mo.observe(login,{attributes:true,attributeFilter:['style','class']});
    if(main)mo.observe(main,{attributes:true,attributeFilter:['style','class']});
  }
})();

(function(){
  const home=document.querySelector('.staff-nav-home'),checklist=document.querySelector('.staff-nav-checklist');
  home?.addEventListener('click',()=>{
    document.getElementById('homeView')?.style.setProperty('display','block');
    document.getElementById('editorView')?.style.setProperty('display','none');
    document.getElementById('loginView')?.style.setProperty('display','none');
    document.querySelectorAll('.staff-nav-home,.staff-nav-checklist').forEach(x=>x.classList.remove('active'));
    home.classList.add('active');window.scrollTo({top:0,behavior:'smooth'});
  });
  checklist?.addEventListener('click',()=>{
    const homeView=document.getElementById('homeView'),editor=document.getElementById('editorView');
    if(editor&&editor.style.display!=='none'){
      document.querySelectorAll('.staff-nav-home,.staff-nav-checklist').forEach(x=>x.classList.remove('active'));
      checklist.classList.add('active');window.scrollTo({top:0,behavior:'smooth'});return;
    }
    if(homeView&&homeView.style.display!=='none'){
      document.querySelectorAll('.staff-nav-home,.staff-nav-checklist').forEach(x=>x.classList.remove('active'));
      checklist.classList.add('active');window.scrollTo({top:0,behavior:'smooth'});
    }
  });
})();
