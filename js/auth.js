// ── UTILS ──────────────────────────────────────────
function fmt(n){return new Intl.NumberFormat('fr-FR').format(Math.round(n||0));}
function fmtKg(n){return Number(n||0).toFixed(1);}
function fmtDate(d){return d?new Date(d+'T12:00:00').toLocaleDateString('fr-FR'):'—';}
function today(){return new Date().toISOString().slice(0,10);}
function thisMonth(){return new Date().toISOString().slice(0,7);}

function notify(msg,type=''){
  const el=document.getElementById('notif-toast');
  el.textContent=msg;el.className='notif show '+(type==='r'?'red':type==='gold'?'gold':'');
  setTimeout(()=>el.classList.remove('show'),3500);
}
function togglePw(id,btn){
  const el=document.getElementById(id);
  el.type=el.type==='password'?'text':'password';
  btn.textContent=el.type==='password'?'👁':'🙈';
}
function showAuthForm(f){
  document.getElementById('auth-login-form').style.display=f==='login'?'block':'none';
  document.getElementById('auth-signup-form').style.display=f==='signup'?'block':'none';
  const jf=document.getElementById('auth-join-form');if(jf)jf.style.display=f==='join'?'block':'none';
}

function getAllFormules(){
  // Merge sadari + custom from GP_PRIX keys
  const custom=Object.keys(GP_PRIX).filter(k=>!FORMULES_SADARI.find(f=>f.nom===k)).map(k=>({nom:k,prix_defaut:GP_PRIX[k]}));
  return [...FORMULES_SADARI,...custom];
}
function getPrix(formuleNom){
  return GP_PRIX[formuleNom]||FORMULES_SADARI.find(f=>f.nom===formuleNom)?.prix_defaut||0;
}
function getFormule(nom){
  return FORMULES_SADARI.find(f=>f.nom===nom);
}

// ── AUTH ───────────────────────────────────────────
async function doLogin(){
  if(!SB)return;
  const email=document.getElementById('a_email').value.trim();
  const pass=document.getElementById('a_pass').value;
  const err=document.getElementById('a_err');
  if(!email||!pass){err.textContent='Email et mot de passe requis.';return;}
  err.textContent='Connexion...';
  const{data,error}=await SB.auth.signInWithPassword({email,password:pass});
  if(error){err.textContent=error.message==='Invalid login credentials'?'Email ou mot de passe incorrect.':error.message;return;}
  err.textContent='';
  bootApp(data.user);
}
async function doSignup(){
  if(!SB)return;
  const nom=document.getElementById('s_nom').value.trim();
  const email=document.getElementById('s_email').value.trim();
  const pass=document.getElementById('s_pass').value;
  const err=document.getElementById('s_err');const ok=document.getElementById('s_ok');
  if(!nom||!email||!pass){err.textContent='Tous les champs requis.';return;}
  if(pass.length<6){err.textContent='Mot de passe min. 6 caractères.';return;}
  err.textContent='Création...';
  const{data,error}=await SB.auth.signUp({email,password:pass,options:{data:{nom}}});
  if(error){err.textContent=error.message;return;}
  err.textContent='';ok.textContent='✓ Compte créé ! Connectez-vous.';
  if(data?.user){
    // Vérifier si cet email est un membre en attente
    const{data:membre}=await SB.from('gp_membres').select('*')
      .eq('email',email).is('user_id',null).maybeSingle();
    if(membre){
      await SB.from('gp_membres').update({user_id:data.user.id,code_invitation:null,code_expire_le:null})
        .eq('id',membre.id);
      ok.textContent='✓ Compte créé ! Vous êtes membre de l\'équipe. Connectez-vous.';
    } else {
      // Nouvel admin — initialiser le trial de 15 jours
      await SB.from('gp_config').upsert({
        user_id:data.user.id,
        plan:'TRIAL',
        trial_debut:new Date().toISOString(),
        trial_utilise:true,
        plan_expire_le:new Date(Date.now()+15*24*60*60*1000).toISOString()
      },{onConflict:'user_id'});
    }
  }
  setTimeout(()=>showAuthForm('login'),2000);
}
async function doForgot(){
  const email=document.getElementById('a_email').value.trim()||prompt('Entrez votre email :');
  if(!email)return;
  await SB.auth.resetPasswordForEmail(email,{redirectTo:window.location.href});
  notify('Email de réinitialisation envoyé !','gold');
}
async function doLogout(){
  await SB.auth.signOut();
  GP_USER=null;GP_ROLE='secretaire';GP_ADMIN_ID=null;
  document.getElementById('authScreen').classList.remove('hidden');
  ['topbar','sidebar','main'].forEach(id=>document.getElementById(id).style.display='none');
}

// ── BOOT & INIT ─────────────────────────────────────
async function bootApp(user){
  GP_USER=user;
  // Check if admin or member
  // Chercher le membre par user_id d'abord
  let{data:membre}=await SB.from('gp_membres').select('*').eq('user_id',user.id).maybeSingle();

  // Si pas trouvé par user_id, chercher par email (compte récemment créé via code)
  if(!membre){
    const{data:membreEmail}=await SB.from('gp_membres').select('*')
      .eq('email',user.email).maybeSingle();
    if(membreEmail){
      membre=membreEmail;
      // Lier le user_id — utiliser l'email comme clé (RLS autorise user_id = auth.uid() OR admin_id)
      // On tente les deux approches
      const{error:updErr}=await SB.from('gp_membres').update({
        user_id:user.id,
        code_invitation:null,
        code_expire_le:null
      }).eq('email',user.email).is('user_id',null);
      if(updErr) console.warn('Update user_id failed silently:', updErr.message);
    }
  }

  if(membre){
    // Vérifier si le compte est désactivé
    if(membre.actif===false){
      await SB.auth.signOut();
      document.getElementById('authScreen').classList.remove('hidden');
      ['topbar','sidebar','main'].forEach(id=>document.getElementById(id).style.display='none');
      document.getElementById('a_err').textContent='Votre compte a été désactivé. Contactez votre administrateur.';
      return;
    }
    GP_ROLE=membre.role;
    GP_ADMIN_ID=membre.admin_id;
    GP_POINT_VENTE=membre.point_vente||null;
  } else {
    GP_ROLE='admin';
    GP_ADMIN_ID=user.id;
    GP_POINT_VENTE=null;
  }
  // Show UI
  document.getElementById('authScreen').classList.add('hidden');
  document.getElementById('topbar').style.display='flex';
  document.getElementById('sidebar').style.display='block';
  // Gérer visibilité nav selon rôle (appel unique)
  applyRoleRestrictions();
  document.getElementById('main').style.display='block';
  // Set role in topbar
  document.getElementById('tb-role-badge').textContent=GP_ROLE.toUpperCase();
  document.getElementById('tb-role-badge').className='tb-role '+GP_ROLE;
  document.getElementById('tb-user-info').textContent=user.email?.split('@')[0]||'';
  // Afficher le point de vente dans la topbar et formulaire vente
  const pvNomEl=document.getElementById('vt-pv-nom');
  const pvHiddenEl=document.getElementById('vt_pv');
  if(pvNomEl)pvNomEl.textContent=GP_POINT_VENTE||'Siège principal';
  if(pvHiddenEl)pvHiddenEl.value=GP_POINT_VENTE||'';
  // Point de vente dans dépenses
  const depPvNomEl=document.getElementById('dep-pv-nom');
  const depPvHiddenEl=document.getElementById('dep_pv');
  if(depPvNomEl)depPvNomEl.textContent=GP_POINT_VENTE||'Siège principal';
  if(depPvHiddenEl)depPvHiddenEl.value=GP_POINT_VENTE||'';
  const pvBadge=document.getElementById('tb-pv-badge');
  if(pvBadge){
    if(GP_POINT_VENTE){
      pvBadge.innerHTML=pvBadgeHtml(GP_POINT_VENTE);
      pvBadge.style.display='inline-block';
      pvBadge.style.background='none';
      pvBadge.style.border='none';
      pvBadge.style.padding='0';
    }
    else pvBadge.style.display='none';
  }
  // (role restrictions déjà appliquées ci-dessus)
  // Load base data
  await Promise.all([loadConfig(),loadIngredients(),loadClients(),loadPrix()]);
  // Vérifier le statut du trial/licence
  verifierLicence();
  // Auto-check stock alerts via CallMeBot
  setTimeout(autoVerifierStockAlerte, 5000);
  // Set defaults
  ['lot_date','mp_date','vt_date','dep_date','bj_date'].forEach(id=>{const el=document.getElementById(id);if(el)el.value=today();});
  ['lot-filtre-mois','mp-filtre-mois','dep-filtre-mois','inv-mois','rpt-mois','inv-phys-mois'].forEach(id=>{const el=document.getElementById(id);if(el)el.value=thisMonth();});
  document.getElementById('vt-filtre-date').value=today();
  populateSelects();
  renderDashboard();
  // Vérifier si une mise à jour est disponible
  verifierMiseAJour();
  // Initialiser présence en ligne
  mettreAJourPresence(true);
  // Check pending remises
  checkPendingRemises();
  // Auto lot ref
  document.getElementById('lot_ref').value='LOT-'+new Date().getFullYear()+'-'+String(Math.floor(Math.random()*900)+100);
  // Auto refresh toutes les 30s
  setInterval(()=>{
    const active=document.querySelector('.page.active')?.id?.replace('page-','');
    if(active)showGP(active);
    checkPendingRemises();
  },30000);

  // Realtime sync — recharger la page active à chaque changement DB
  initRealtimeSync();
}
function applyRoleRestrictions(){
  document.querySelectorAll('.nav-item').forEach(el=>{
    const roles=el.dataset.roles;
    // data-roles a priorité absolue sur admin-only
    if(roles){
      const allowed=roles.split(',').map(r=>r.trim());
      el.style.display=allowed.includes(GP_ROLE)?'flex':'none';
      return; // STOP — ne pas tester admin-only ensuite
    }
    // Sinon : admin-only standard
    if(el.classList.contains('admin-only')){
      el.style.display=GP_ROLE==='admin'?'flex':'none';
      return;
    }
    // Par défaut : visible
    el.style.display='flex';
  });
}
// ── ROUTER COMPLET ────────────────────────────────
var PAGE_RENDERERS = {
  dashboard:     renderDashboard,
  stock:         renderStockNiveaux,
  matieres:      renderMatieresPremieresPage,
  inventaire:    renderInventaire,
  inventaire_physique: function(){
    const el=document.getElementById('invp-mois');
    if(el&&!el.value)el.value=thisMonth();
    renderInventairePhysique();
  },
  production:    renderLots,
  rapport:       renderRapport,
  formules:      function(){
    renderPrixFormules();
    loadIngredients().then(()=>{renderIngrAdmin();populateSelects();});
  },
  ventes:        renderVentes,
  depenses:      renderDep,
  bilan_jour:    renderBilanJour,
  bilan_avance:  function(){
    const bm=document.getElementById('bilan-mois');
    const rm=document.getElementById('rapport-mois');
    if(bm&&!bm.value)bm.value=thisMonth();
    if(rm&&!rm.value)rm.value=thisMonth();
    renderBilanAvance();
  },
  remises:       renderRemises,
  clients:       renderClients,
  suivi:         renderSuivi,
  classement:    renderClassement,
  fournisseurs:  renderFournisseurs,
  achats:        renderAchats,
  caisse:        renderCaisse,
  distribution:  renderDistribution,
  reversements:  renderReversements,
  salaires:      function(){
    const sm=document.getElementById('sal-mois');
    const ss=document.getElementById('sal_mois_saisie');
    if(sm&&!sm.value)sm.value=thisMonth();
    if(ss&&!ss.value)ss.value=thisMonth();
    renderSalaires();
  },
  dettes:        renderDettes,
  equipe:        function(){renderPDV();initChat();},
  config:        loadConfigForm,
};

function showGP(page){
  // Fermer sidebar sur mobile
  if(window.innerWidth<=768)closeSidebar();
  document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n=>n.classList.remove('active'));
  const pageEl=document.getElementById('page-'+page);
  if(pageEl)pageEl.classList.add('active');
  const navEl=document.querySelector(`[data-page="${page}"]`);
  if(navEl)navEl.classList.add('active');
  if(typeof PAGE_RENDERERS!=='undefined'&&PAGE_RENDERERS[page]){
    try{PAGE_RENDERERS[page]();}
    catch(e){console.error('Erreur page',page,e);}
  }
}


// ── DATA LOADERS ───────────────────────────────────
async function loadConfig(){
  const{data}=await SB.from('gp_config').select('*').eq('user_id',GP_ADMIN_ID).maybeSingle();
  if(data){
    GP_CONFIG=data;
    if(data.couleur)applyColor(data.couleur);
    if(data.nom_provenderie){
      document.getElementById('tb-name').textContent=data.nom_provenderie;
      // Mettre à jour le lien rejoindre dans la page login
      const joinLink=document.getElementById('join-link-text');
      if(joinLink)joinLink.textContent='🔑 Rejoindre '+data.nom_provenderie;
      const joinTitle=document.getElementById('join-form-title');
      if(joinTitle)joinTitle.textContent='Rejoindre '+data.nom_provenderie;
    }
    if(data.logo_url)applyLogo(data.logo_url);
    if(data.remise_max!==undefined)GP_REMISE_MAX=data.remise_max||5;
  }
}
async function loadIngredients(){
  const{data}=await SB.from('gp_ingredients').select('*').eq('admin_id',GP_ADMIN_ID).order('nom');
  GP_INGREDIENTS=data||[];
}
async function loadClients(){
  const{data}=await SB.from('gp_clients').select('*').eq('admin_id',GP_ADMIN_ID).order('total_achats',{ascending:false});
  GP_CLIENTS=data||[];
}
async function loadPrix(){
  const{data}=await SB.from('gp_prix_formules').select('*').eq('admin_id',GP_ADMIN_ID);
  GP_PRIX={};GP_PRIX_GROS={};
  if(data)data.forEach(p=>{
    GP_PRIX[p.formule_nom]=p.prix;
    if(p.prix_gros)GP_PRIX_GROS[p.formule_nom]=p.prix_gros;
  });
  FORMULES_SADARI.forEach(f=>{if(!GP_PRIX[f.nom])GP_PRIX[f.nom]=f.prix_defaut;});
}
function populateSelects(){
  const allF=getAllFormules();
  // Formule selects
  ['lot_formule','vt_formule','pf_formule'].forEach(id=>{
    const el=document.getElementById(id);if(!el)return;
    const groups={};
    allF.forEach(f=>{if(!groups[f.espece])groups[f.espece]=[];groups[f.espece].push(f);});
    let html='<option value="">— Sélectionner une formule —</option>';
    Object.entries(groups).forEach(([esp,fs])=>{
      html+=`<optgroup label="${ESPECE_ICON[esp]||''} ${esp.charAt(0).toUpperCase()+esp.slice(1)}">`;
      fs.forEach(f=>{html+=`<option value="${f.nom}">${f.nom}</option>`;});
      html+='</optgroup>';
    });
    el.innerHTML=html;
  });
  // Client select
  const vtCl=document.getElementById('vt_client');
  if(vtCl)vtCl.innerHTML='<option value="">— Choisir ou nouveau client —</option><option value="__nouveau__">➕ Nouveau client</option>'+
    GP_CLIENTS.map(c=>`<option value="${c.id}">${c.nom} — ${c.telephone||'—'}</option>`).join('');
  const appCl=document.getElementById('app_client');
  if(appCl)appCl.innerHTML='<option value="">— Sélectionner —</option>'+
    GP_CLIENTS.map(c=>`<option value="${c.id}">${c.nom} — ${c.telephone||'—'}</option>`).join('');
  // MP select
  const mpIngr=document.getElementById('mp_ingr');
  if(mpIngr)mpIngr.innerHTML='<option value="">— Sélectionner —</option>'+
    GP_INGREDIENTS.map(i=>`<option value="${i.id}" data-prix="${i.prix_actuel}">${i.nom} (${fmt(i.prix_actuel)} F/kg)</option>`).join('');
}
// ── SYSTÈME DE LICENCE & TRIAL ────────────────────
function verifierLicence(){
  const cfg = GP_CONFIG || {};
  const now = new Date();
  const expiry = cfg.plan_expire_le ? new Date(cfg.plan_expire_le) : null;
  const plan = cfg.plan || 'TRIAL';

  // Secrétaires — pas de vérification, l'admin gère
  if(GP_ROLE === 'secretaire') return;

  // Pas de config encore — nouveau compte, trial démarré
  if(!expiry) return;

  const joursRestants = expiry ? Math.ceil((expiry - now) / 86400000) : 0;

  if(joursRestants > 0){
    // Licence active — afficher bannière si trial et < 5 jours
    if(plan === 'TRIAL' && joursRestants <= 5){
      afficherBanniereTrial(joursRestants);
    }
  } else {
    // Licence expirée — bloquer l'accès
    afficherModalExpire(plan);
  }
}

function afficherBanniereTrial(jours){
  const banniere = document.getElementById('trial-banniere');
  if(!banniere) return;
  banniere.style.display = 'flex';
  banniere.innerHTML = `
    <span>⏰ Votre essai gratuit expire dans <strong>${jours} jour${jours>1?'s':''}</strong></span>
    <a href="gp_paiement.html" style="background:var(--gold);color:#1a1a1a;padding:4px 14px;border-radius:20px;font-size:11px;font-weight:700;text-decoration:none;white-space:nowrap">Payer maintenant →</a>`;
}

function afficherModalExpire(plan){
  const modal = document.getElementById('licence-modal');
  if(!modal) return;
  const estTrial = plan === 'TRIAL';
  modal.style.display = 'flex';
  modal.innerHTML = `
    <div style="background:linear-gradient(135deg,#0E1428,#080B18);border:1px solid rgba(22,163,74,.3);border-radius:16px;padding:40px;max-width:440px;width:100%;text-align:center;box-shadow:0 20px 60px rgba(0,0,0,.8)">
      <div style="font-size:48px;margin-bottom:16px">${estTrial?'⏰':'🔒'}</div>
      <div style="font-family:'Crimson Pro',serif;font-size:26px;font-weight:700;color:#E2E8F0;margin-bottom:10px">
        ${estTrial ? 'Votre essai gratuit est terminé' : 'Votre licence a expiré'}
      </div>
      <p style="color:#94A3B8;font-size:14px;margin-bottom:24px;line-height:1.6">
        ${estTrial
          ? 'Vos 15 jours d\'essai gratuit sont écoulés. Abonnez-vous pour continuer à utiliser PROVENDA.'
          : 'Votre abonnement PROVENDA est expiré. Renouvelez pour accéder à vos données.'}
      </p>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:20px">
        <div style="background:rgba(22,163,74,.08);border:1px solid rgba(22,163,74,.2);border-radius:10px;padding:16px;text-align:center">
          <div style="font-size:11px;color:#94A3B8;margin-bottom:6px">MENSUEL</div>
          <div style="font-family:'Crimson Pro',serif;font-size:24px;color:#86EFAC;font-weight:700">20 000</div>
          <div style="font-size:10px;color:#94A3B8">FCFA / mois</div>
        </div>
        <div style="background:rgba(245,158,11,.08);border:2px solid rgba(245,158,11,.4);border-radius:10px;padding:16px;text-align:center;position:relative">
          <div style="position:absolute;top:-10px;left:50%;transform:translateX(-50%);background:var(--gold);color:#1a1a1a;padding:2px 10px;border-radius:20px;font-size:9px;font-weight:700;white-space:nowrap">2 MOIS OFFERTS</div>
          <div style="font-size:11px;color:#94A3B8;margin-bottom:6px">ANNUEL</div>
          <div style="font-family:'Crimson Pro',serif;font-size:24px;color:var(--gold);font-weight:700">200 000</div>
          <div style="font-size:10px;color:#94A3B8">FCFA / an</div>
        </div>
      </div>
      <a href="gp_paiement.html" style="display:block;background:linear-gradient(135deg,#16A34A,#15803D);color:white;padding:14px;border-radius:10px;font-size:16px;font-weight:700;text-decoration:none;margin-bottom:12px;transition:all .2s">
        💳 Payer maintenant et continuer
      </a>
      <a href="https://wa.me/22899313110" target="_blank" style="display:block;background:rgba(37,211,102,.15);border:1px solid rgba(37,211,102,.3);color:#25D366;padding:10px;border-radius:8px;font-size:13px;text-decoration:none">
        📲 Contacter sur WhatsApp : (+228) 99313110
      </a>
      <button onclick="doLogout()" style="margin-top:12px;background:none;border:none;color:#475569;font-size:12px;cursor:pointer;font-family:'Outfit',sans-serif">
        Se déconnecter
      </button>
    </div>`;
}

// ── REJOINDRE UNE ÉQUIPE PAR CODE ────────────────
async function joinEquipe(){
  const email=document.getElementById('j_email')?.value.trim();
  const code=document.getElementById('j_code')?.value.trim();
  const pass=document.getElementById('j_pass')?.value;
  const err=document.getElementById('j_err');
  const ok=document.getElementById('j_ok');
  if(!email||!code||!pass){err.textContent='Tous les champs sont requis.';return;}
  if(pass.length<6){err.textContent='Mot de passe min. 6 caractères.';return;}
  err.textContent='Vérification du code...';

  // Chercher par code uniquement d'abord
  const{data:membreCode}=await SB.from('gp_membres').select('*')
    .eq('code_invitation',code)
    .maybeSingle();

  if(!membreCode){
    err.textContent='Code invalide. Vérifiez le code à 6 chiffres reçu par WhatsApp.';
    return;
  }

  // Charger le nom de la provenderie pour affichage
  const{data:cfg}=await SB.from('gp_config').select('nom_provenderie')
    .eq('user_id',membreCode.admin_id).maybeSingle();
  const nomProv=cfg?.nom_provenderie||'PROVENDA';
  const joinTitle=document.getElementById('join-form-title');
  if(joinTitle)joinTitle.textContent='Rejoindre '+nomProv;

  // Vérifier l'email (insensible à la casse)
  if(membreCode.email.toLowerCase().trim()!==email.toLowerCase().trim()){
    err.textContent='Email incorrect. Utilisez exactement l\'email indiqué dans le message WhatsApp : '+membreCode.email;
    return;
  }

  // Vérifier si déjà utilisé
  if(membreCode.user_id){
    err.textContent='Ce code a déjà été utilisé. Connectez-vous normalement.';
    return;
  }

  const membre=membreCode;

  // Vérifier expiration
  if(membre.code_expire_le&&new Date(membre.code_expire_le)<new Date()){
    err.textContent='Ce code a expiré (validité 48h). Demandez un nouveau code à votre admin.';
    return;
  }

  err.textContent='Création du compte...';

  // Créer le compte Supabase
  const{data,error}=await SB.auth.signUp({email,password:pass,options:{data:{nom:membre.nom}}});
  if(error){err.textContent=error.message;return;}
  if(!data?.user){err.textContent='Erreur lors de la création du compte.';return;}

  // Marquer le code comme utilisé (user_id sera lié au prochain login)
  // On utilise le code comme clé car l'user n'est pas encore authentifié
  await SB.from('gp_membres').update({
    code_invitation:'USED_'+data.user.id,
    code_expire_le:null
  }).eq('code_invitation',code);

  // Connexion automatique après création du compte
  err.textContent='';
  ok.innerHTML='<div style="color:var(--green);font-weight:600">✓ Compte créé ! Connexion en cours...</div>';
  const{data:loginData,error:loginErr}=await SB.auth.signInWithPassword({email,password:pass});
  if(loginErr||!loginData?.user){
    ok.innerHTML='<div style="color:var(--green)">✓ Compte créé !</div><div style="font-size:11px;color:var(--textm)">Connectez-vous maintenant.</div>';
    setTimeout(()=>showAuthForm('login'),2000);
  }
  // bootApp sera appelé automatiquement par onAuthStateChange
}

function toggleSidebar(){
  const sb=document.getElementById('sidebar');
  const ov=document.getElementById('overlay');
  sb.classList.toggle('open');
  if(ov)ov.classList.toggle('show');
}
function closeSidebar(){
  const sb=document.getElementById('sidebar');
  const ov=document.getElementById('overlay');
  sb.classList.remove('open');
  if(ov)ov.classList.remove('show');
}
// ── REALTIME SYNC GLOBAL ─────────────────────
function initRealtimeSync(){
  if(!GP_ADMIN_ID)return;
  const tables=[
    'gp_ventes','gp_clients','gp_depenses','gp_lots',
    'gp_stock_mp','gp_fournisseurs','gp_achats',
    'gp_caisses','gp_mouvements_caisse','gp_membres',
    'gp_stock_produits_pdv','gp_livraisons_pdv',
    'gp_ingredients','gp_prix_formules','gp_points_vente'
  ];

  // Un seul canal pour tous les changements
  const channel=SB.channel('provenda-sync-'+GP_ADMIN_ID);

  tables.forEach(table=>{
    channel.on('postgres_changes',{
      event:'*',
      schema:'public',
      table:table,
      filter:'admin_id=eq.'+GP_ADMIN_ID
    },()=>{
      // Recharger les données globales si besoin
      if(['gp_clients'].includes(table))loadClients();
      if(['gp_prix_formules'].includes(table))loadPrix();
      if(['gp_ingredients'].includes(table))loadIngredients();
      // Rafraîchir la page active
      const active=document.querySelector('.page.active')?.id?.replace('page-','');
      if(active&&PAGE_RENDERERS[active]){
        try{PAGE_RENDERERS[active]();}catch(e){}
      }
    });
  });

  channel.subscribe();
}

// ── MISE À JOUR AUTOMATIQUE ──────────────────
async function verifierMiseAJour(){
  try{
    // Charger la version depuis le serveur (fichier config.js rechargé)
    const r=await fetch('/js/config.js?t='+Date.now());
    const txt=await r.text();
    const match=txt.match(/PROVENDA_VERSION\s*=\s*'([^']+)'/);
    if(!match)return;
    const versionServeur=match[1];
    if(versionServeur!==PROVENDA_VERSION){
      afficherBanniereMAJ(versionServeur);
    }
  } catch(e){}
}

function afficherBanniereMAJ(nouvelleVersion){
  const banniere=document.createElement('div');
  banniere.id='maj-banniere';
  banniere.style.cssText='position:fixed;top:var(--topbar);left:0;right:0;z-index:998;background:linear-gradient(90deg,rgba(22,163,74,.95),rgba(21,128,61,.95));padding:10px 20px;display:flex;align-items:center;justify-content:space-between;gap:12px;font-size:12px;color:white;box-shadow:0 2px 12px rgba(0,0,0,.4)';
  banniere.innerHTML=`
    <span>🔄 Nouvelle version <strong>v${nouvelleVersion}</strong> disponible — Vos données sont sauvegardées automatiquement</span>
    <div style="display:flex;gap:8px">
      <button onclick="window.location.reload()" style="background:white;color:#15803D;border:none;padding:6px 16px;border-radius:6px;font-weight:700;cursor:pointer;font-size:12px">Mettre à jour maintenant</button>
      <button onclick="this.closest('#maj-banniere').remove()" style="background:rgba(255,255,255,.2);color:white;border:none;padding:6px 12px;border-radius:6px;cursor:pointer;font-size:12px">Plus tard</button>
    </div>`;
  document.body.appendChild(banniere);
}

// Vérifier toutes les 5 minutes
setInterval(verifierMiseAJour, 5*60*1000);
