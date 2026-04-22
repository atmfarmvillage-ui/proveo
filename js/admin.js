// ── FORMULES & PRIX ────────────────────────────────

async function savePrixFormule(){
  const nom=document.getElementById('pf_formule').value;
  const prix=+document.getElementById('pf_prix').value||0;
  const err=document.getElementById('pf_err');
  if(!nom||!prix){err.textContent='Formule et prix requis.';return;}
  const{error}=await SB.from('gp_prix_formules').upsert({admin_id:GP_ADMIN_ID,formule_nom:nom,prix},{onConflict:'admin_id,formule_nom'});
  if(error){
    // Try insert instead
    await SB.from('gp_prix_formules').insert({admin_id:GP_ADMIN_ID,formule_nom:nom,prix});
  }
  GP_PRIX[nom]=prix;
  document.getElementById('pf_prix').value='';
  err.textContent='';
  notify(`Prix ${nom} → ${fmt(prix)} F/kg ✓`,'gold');
  renderPrixFormules();
}


function editerPrix(id){
  document.getElementById('prix-val-'+id).style.display='none';
  document.getElementById('prix-inp-'+id).style.display='inline-block';
  document.getElementById('edit-btn-'+id).style.display='none';
  document.getElementById('save-btn-'+id).style.display='inline-flex';
  document.getElementById('prix-inp-'+id).focus();
}
function annulerEdit(id){
  document.getElementById('prix-val-'+id).style.display='inline';
  document.getElementById('prix-inp-'+id).style.display='none';
  document.getElementById('edit-btn-'+id).style.display='inline-flex';
  document.getElementById('save-btn-'+id).style.display='none';
}
async function sauverPrixIngr(id){
  const val=+document.getElementById('prix-inp-'+id).value||0;
  const{error}=await SB.from('gp_ingredients').update({prix_actuel:val}).eq('id',id);
  if(error){notify('Erreur: '+error.message,'r');return;}
  const ingr=GP_INGREDIENTS.find(i=>i.id===id);
  if(ingr)ingr.prix_actuel=val;
  document.getElementById('prix-val-'+id).textContent=fmt(val);
  annulerEdit(id);
  notify('Prix mis à jour ✓','gold');
}
function editerSeuil(id){
  document.getElementById('seuil-val-'+id).style.display='none';
  document.getElementById('seuil-inp-'+id).style.display='inline-block';
  document.getElementById('seuil-edit-'+id).style.display='none';
  document.getElementById('seuil-save-'+id).style.display='inline-flex';
  document.getElementById('seuil-inp-'+id).focus();
  document.getElementById('seuil-inp-'+id).select();
}
function annulerSeuil(id){
  document.getElementById('seuil-val-'+id).style.display='inline';
  document.getElementById('seuil-inp-'+id).style.display='none';
  document.getElementById('seuil-edit-'+id).style.display='inline-flex';
  document.getElementById('seuil-save-'+id).style.display='none';
}
async function sauverSeuil(id){
  const val=+document.getElementById('seuil-inp-'+id).value||100;
  const{error}=await SB.from('gp_ingredients').update({seuil_alerte:val}).eq('id',id);
  if(error){notify('Erreur: '+error.message,'r');return;}
  const ingr=GP_INGREDIENTS.find(i=>i.id===id);
  if(ingr)ingr.seuil_alerte=val;
  document.getElementById('seuil-val-'+id).textContent=fmt(val);
  annulerSeuil(id);
  notify('Seuil d\'alerte mis à jour ✓','gold');
}
async function saveIngredient(){
  const nom=document.getElementById('ni_nom').value.trim();
  const prix=+document.getElementById('ni_prix').value||0;
  const prot=+document.getElementById('ni_prot')?.value||null;
  const em=+document.getElementById('ni_em')?.value||null;
  const seuil=+document.getElementById('ni_seuil').value||200;
  const err=document.getElementById('ni_err');
  if(!nom){err.textContent='Nom requis.';return;}
  const{error}=await SB.from('gp_ingredients').insert({
    admin_id:GP_ADMIN_ID,nom,prix_actuel:prix,
    proteines:prot,energie:em,
    seuil_alerte:seuil,
    fournisseur:document.getElementById('ni_fourn').value.trim()||null
  });
  if(error){err.textContent='Erreur: '+error.message;return;}
  ['ni_nom','ni_prix','ni_prot','ni_em','ni_fourn'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});
  document.getElementById('ni_seuil').value='200';
  err.textContent='';
  await loadIngredients();populateSelects();renderIngrAdmin();
  notify('Matière première ajoutée ✓');
}
async function deleteIngredient(id){
  if(!confirm('Supprimer cet ingrédient ?'))return;
  await SB.from('gp_ingredients').delete().eq('id',id);
  await loadIngredients();populateSelects();renderIngrAdmin();
}
function openNewFormule(){notify('Nouvelle formule — fonctionnalité en développement','gold');}

// ── ÉQUIPE ─────────────────────────────────────────


async function deleteMembre(id){
  if(!confirm('Supprimer ce membre ?'))return;
  await SB.from('gp_membres').delete().eq('id',id);
  renderEquipe();
  notify('Membre supprimé','r');
}

async function deleteMembre(id){
  if(!confirm('Retirer ce membre ?'))return;
  await SB.from('gp_membres').delete().eq('id',id);
  renderEquipe();notify('Membre retiré','r');
}

// ── CONFIG ─────────────────────────────────────────
function applyColor(c){
  document.documentElement.style.setProperty('--g4',c);
  document.documentElement.style.setProperty('--g5',c);
}
function applyLogo(url){
  const tb=document.getElementById('tb-logo');
  if(tb)tb.innerHTML=`<img src="${url}" style="width:30px;height:30px;object-fit:contain;border-radius:6px">`;
  const preview=document.getElementById('cfg-logo-preview');
  if(preview)preview.innerHTML=`<img src="${url}" style="width:90px;height:90px;object-fit:contain;border-radius:12px;margin:0 auto 8px;display:block">`;
}
async function loadConfigForm(){
  if(GP_CONFIG.nom_provenderie)document.getElementById('cfg_nom').value=GP_CONFIG.nom_provenderie;
  if(GP_CONFIG.slogan)document.getElementById('cfg_slogan').value=GP_CONFIG.slogan;
  if(GP_CONFIG.telephone)document.getElementById('cfg_tel').value=GP_CONFIG.telephone;
  if(GP_CONFIG.email)document.getElementById('cfg_email').value=GP_CONFIG.email;
  if(GP_CONFIG.localisation)document.getElementById('cfg_loc').value=GP_CONFIG.localisation;
  if(GP_CONFIG.couleur)document.getElementById('cfg_couleur').value=GP_CONFIG.couleur;
  if(GP_CONFIG.tel_alerte_stock)document.getElementById('cfg_tel_alerte').value=GP_CONFIG.tel_alerte_stock;
  if(GP_CONFIG.callmebot_apikey)document.getElementById('cfg_callmebot_apikey').value=GP_CONFIG.callmebot_apikey;
  if(GP_CONFIG.logo_url)applyLogo(GP_CONFIG.logo_url);
}
async function saveConfig(){
  const nom=document.getElementById('cfg_nom').value.trim();
  const err=document.getElementById('cfg_err');const ok=document.getElementById('cfg_ok');
  if(!nom){err.textContent='Nom requis.';return;}
  const couleur=document.getElementById('cfg_couleur').value;
  const telAlerte=document.getElementById('cfg_tel_alerte')?.value.trim()||null;
  const{error}=await SB.from('gp_config').upsert({
    user_id:GP_ADMIN_ID,nom_provenderie:nom,
    slogan:document.getElementById('cfg_slogan').value.trim(),
    telephone:document.getElementById('cfg_tel').value.trim(),
    email:document.getElementById('cfg_email').value.trim(),
    localisation:document.getElementById('cfg_loc').value.trim(),
    couleur,logo_url:GP_CONFIG.logo_url||null,
    tel_alerte_stock:telAlerte,
    callmebot_apikey:document.getElementById('cfg_callmebot_apikey')?.value.trim()||null
  },{onConflict:'user_id'});
  if(error){err.textContent='Erreur: '+error.message;return;}
  GP_CONFIG.nom_provenderie=nom;GP_CONFIG.couleur=couleur;
  if(telAlerte)GP_CONFIG.tel_alerte_stock=telAlerte;
  const apikey=document.getElementById('cfg_callmebot_apikey')?.value.trim();
  if(apikey)GP_CONFIG.callmebot_apikey=apikey;
  document.getElementById('tb-name').textContent=nom;
  applyColor(couleur);
  err.textContent='';ok.textContent='✓ Configuration sauvegardée !';
  setTimeout(()=>ok.textContent='',3000);
  notify('Configuration mise à jour ✓','gold');
}
async function saveRemiseMax(){
  const val=+document.getElementById('cfg_remise_max').value||5;
  GP_REMISE_MAX=val;
  await SB.from('gp_config').upsert({user_id:GP_ADMIN_ID,remise_max:val},{onConflict:'user_id'});
  notify(`Remise max : ${val}% ✓`,'gold');
}
async function uploadLogo(){
  const file=document.getElementById('cfg_logo').files?.[0];
  const err=document.getElementById('logo_err');const ok=document.getElementById('logo_ok');
  if(!file){err.textContent='Sélectionnez un fichier.';return;}
  if(file.size>2*1024*1024){err.textContent='Max 2MB.';return;}
  err.textContent='Upload...';
  const ext=file.name.split('.').pop();
  const path=`logos/${GP_ADMIN_ID}/logo.${ext}`;
  const{error:upErr}=await SB.storage.from('gp-logos').upload(path,file,{upsert:true});
  if(upErr){err.textContent='Erreur: '+upErr.message;return;}
  const{data:urlData}=SB.storage.from('gp-logos').getPublicUrl(path);
  const logo_url=urlData?.publicUrl;
  await SB.from('gp_config').upsert({user_id:GP_ADMIN_ID,logo_url},{onConflict:'user_id'});
  GP_CONFIG.logo_url=logo_url;
  applyLogo(logo_url);
  err.textContent='';ok.textContent='✓ Logo mis à jour !';
  setTimeout(()=>ok.textContent='',3000);
  notify('Logo uploadé ✓','gold');
}

// ── BOOT ───────────────────────────────────────────
window.addEventListener('load',function(){
  try{SB=supabase.createClient(GP_URL,GP_KEY);}
  catch(e){document.getElementById('a_err').textContent='Erreur réseau. Rechargez la page.';return;}
  SB.auth.getSession().then(function(res){
    const session=res.data&&res.data.session;
    if(session)bootApp(session.user);
  }).catch(function(e){console.error('Session check failed:',e);});
});
async function testerCallMeBot(){
  const apikey=document.getElementById('cfg_callmebot_apikey')?.value.trim();
  const tel=(document.getElementById('cfg_tel_alerte')?.value||document.getElementById('cfg_tel')?.value||'').replace(/[\s\-\+]/g,'').replace(/^00/,'').replace(/^228/,'');
  const status=document.getElementById('callmebot-status');
  if(!apikey){status.style.color='#ef4444';status.textContent='⚠ Entrez votre clé API CallMeBot.';return;}
  if(!tel){status.style.color='#ef4444';status.textContent='⚠ Entrez votre numéro de téléphone.';return;}
  status.style.color='#94A3B8';status.textContent='⏳ Envoi en cours...';
  const msg=encodeURIComponent('✅ Test PROVENDA — Vos alertes stock automatiques sont activées !');
  const url=`https://api.callmebot.com/whatsapp.php?phone=228${tel}&text=${msg}&apikey=${apikey}`;
  try{
    const res=await fetch(url);
    const txt=await res.text();
    if(txt.includes('Message Sent')||txt.includes('queued')){
      status.style.color='#25D366';
      status.textContent='✅ Message envoyé ! Vérifiez votre WhatsApp.';
    } else {
      status.style.color='#ef4444';
      status.textContent='⚠ Erreur: '+txt.slice(0,80);
    }
  } catch(e){
    status.style.color='#ef4444';
    status.textContent='⚠ Erreur réseau: '+e.message;
  }
}

// ══════════════════════════════════════════════════
// POINTS DE VENTE & ÉQUIPE
// ══════════════════════════════════════════════════


// ── BADGE COULEUR PAR POINT DE VENTE ──────────────
const PDV_PALETTES = [
  {bg:'#1e3a5f', border:'#3b82f6', text:'#93c5fd', emoji:'🔵'},
  {bg:'#3b1f5e', border:'#a855f7', text:'#d8b4fe', emoji:'🟣'},
  {bg:'#7c2d12', border:'#f97316', text:'#fdba74', emoji:'🟠'},
  {bg:'#164e2e', border:'#22c55e', text:'#86efac', emoji:'🟢'},
  {bg:'#7f1d1d', border:'#ef4444', text:'#fca5a5', emoji:'🔴'},
  {bg:'#1e3a5f', border:'#06b6d4', text:'#67e8f9', emoji:'🩵'},
  {bg:'#4a1942', border:'#ec4899', text:'#f9a8d4', emoji:'🩷'},
  {bg:'#78350f', border:'#f59e0b', text:'#fde68a', emoji:'🟡'},
  {bg:'#1a3a3a', border:'#14b8a6', text:'#5eead4', emoji:'🩵'},
  {bg:'#1f2937', border:'#6366f1', text:'#a5b4fc', emoji:'🔷'},
];

function pvPalette(nom){
  let hash=0;
  for(let i=0;i<nom.length;i++) hash=(hash*31+nom.charCodeAt(i))>>>0;
  return PDV_PALETTES[hash % PDV_PALETTES.length];
}

function pvBadgeHtml(nom, size='sm'){
  const p=pvPalette(nom);
  const fs=size==='lg'?'13px':'11px';
  const pad=size==='lg'?'5px 14px':'3px 10px';
  return `<span style="background:${p.bg};color:${p.text};border:1px solid ${p.border};padding:${pad};border-radius:20px;font-size:${fs};font-weight:700;white-space:nowrap">${p.emoji} ${nom}</span>`;
}

function ouvrirModalEq(pvNom){
  document.getElementById('modal-eq').style.display='flex';
  document.getElementById('eq_pv_hidden').value=pvNom||'';
  document.getElementById('modal-eq-pv-label').innerHTML=pvNom?pvBadgeHtml(pvNom,'lg'):'<span style="font-size:13px;color:var(--textm)">🏭 Siège principal</span>';
  document.getElementById('eq_nom').value='';
  document.getElementById('eq_email').value='';
  document.getElementById('eq_tel').value='';
  document.getElementById('eq_role').value='secretaire';
  document.getElementById('eq_err').textContent='';
  document.getElementById('eq_ok').innerHTML='';
  setTimeout(()=>document.getElementById('eq_nom').focus(),100);
}
function fermerModalEq(){
  document.getElementById('modal-eq').style.display='none';
}


function membreCard(m){
  const telClean=(m.telephone||'').replace(/[\s\-\+]/g,'').replace(/^00/,'').replace(/^228/,'');
  const siteUrl=window.location.origin;
  const reinvitMsg=encodeURIComponent(
    `Bonjour ${m.nom} 👋\n\nRappel : connectez-vous sur PROVENDA avec cet email : *${m.email}*\n\nLien : ${siteUrl}\n\n_PROVENDA · ATM Farm Village_`
  );
  return `<div style="padding:10px;background:rgba(14,20,40,.5);border:1px solid var(--border);border-radius:8px;margin-bottom:6px">
    <div style="display:flex;justify-content:space-between;align-items:center">
      <div>
        <div style="font-weight:700;font-size:13px">${m.nom||'—'}</div>
        <div style="font-size:10px;color:var(--textm)">${m.email||'—'} ${m.telephone?'· '+m.telephone:''}</div>
        <div style="display:flex;gap:4px;margin-top:4px;flex-wrap:wrap">
          <span class="badge ${m.role==='admin'?'bdg-gold':'bdg-g'}" style="font-size:9px">${(m.role||'secretaire').toUpperCase()}</span>
          <span class="badge" style="font-size:9px;background:${m.user_id?'rgba(22,163,74,.1)':'rgba(239,68,68,.1)'};color:${m.user_id?'var(--green)':'var(--red)'};">${m.user_id?'✅ Connecté':'⏳ En attente'}</span>
          ${m.point_vente?pvBadgeHtml(m.point_vente):''}
        </div>
      </div>
      <div style="display:flex;gap:4px">
        ${m.telephone&&!m.user_id?`<a href="https://wa.me/228${telClean}?text=${reinvitMsg}" target="_blank" class="btn btn-g btn-sm" title="Renvoyer invitation">📲</a>`:''}
        <button class="btn btn-red btn-sm" onclick="deleteMembre('${m.id}')">✕</button>
      </div>
    </div>
  </div>`;
}

function localisermoi(){
  if(!navigator.geolocation){notify('GPS non disponible','r');return;}
  notify('Récupération de votre position...','gold');
  navigator.geolocation.getCurrentPosition(
    pos=>{
      document.getElementById('pv_lat').value=pos.coords.latitude.toFixed(6);
      document.getElementById('pv_lng').value=pos.coords.longitude.toFixed(6);
      notify('Position GPS obtenue ✓','gold');
    },
    ()=>notify('Impossible d\'obtenir la position GPS','r')
  );
}

async function savePDV(){
  const nom=document.getElementById('pv_nom')?.value.trim();
  const tel=document.getElementById('pv_tel')?.value.trim()||null;
  const adresse=document.getElementById('pv_adresse')?.value.trim()||null;
  const lat=parseFloat(document.getElementById('pv_lat')?.value)||null;
  const lng=parseFloat(document.getElementById('pv_lng')?.value)||null;
  const err=document.getElementById('pv_err');
  if(!nom){err.textContent='Nom requis.';return;}
  const typePdv=document.getElementById('pv_type')?.value||'secondaire';
  const secSalariee=document.getElementById('pv_sec_type')?.value==='true';
  const{error}=await SB.from('gp_points_vente').insert({
    admin_id:GP_ADMIN_ID,nom,telephone:tel,adresse,
    latitude:lat,longitude:lng,
    type_pdv:typePdv,
    secretaire_salariee:secSalariee
  });
  if(error){err.textContent='Erreur: '+error.message;return;}
  // Créer automatiquement la caisse physique du PDV
  await SB.from('gp_caisses').insert({
    admin_id:GP_ADMIN_ID,
    nom:'Caisse '+nom,
    type:'physique',
    point_vente:nom,
    solde_initial:0,
    solde_actuel:0,
    couleur:pvPalette(nom).border,
    actif:true
  });
  ['pv_nom','pv_tel','pv_adresse','pv_lat','pv_lng'].forEach(id=>{
    const el=document.getElementById(id);if(el)el.value='';
  });
  err.textContent='';
  await renderPDV();
  notify('Point de vente "'+nom+'" créé avec sa caisse ✓','gold');
}

async function deletePDV(id,nom){
  if(!confirm(`Supprimer le point de vente "${nom}" ?\nLes membres assignés passeront au siège principal.`))return;
  // Retirer le point_vente des membres
  await SB.from('gp_membres').update({point_vente:null}).eq('admin_id',GP_ADMIN_ID).eq('point_vente',nom);
  await SB.from('gp_points_vente').delete().eq('id',id);
  renderPDV();
  notify('Point de vente supprimé','r');
}

// ── COÛTS DE PRODUCTION PAR FORMULE ──────────────
function editerCoutsFormule(formuleNom){
  const f=getAllFormules().find(x=>x.nom===formuleNom);
  if(!f)return;
  const modal=document.getElementById('modal-couts-formule');
  document.getElementById('cf-formule-nom').textContent=formuleNom;
  document.getElementById('cf-emballage').value=f.cout_emballage_kg||0;
  document.getElementById('cf-mo').value=f.cout_mo_tonne||0;
  document.getElementById('cf-transport').value=f.cout_transport_lot||0;
  document.getElementById('cf-avec-emballage').checked=f.avec_emballage!==false;
  document.getElementById('cf-avec-transport').checked=f.avec_transport===true;
  document.getElementById('cf-formule-id').value=f.id||'';
  document.getElementById('cf-formule-nom-hidden').value=formuleNom;
  modal.style.display='flex';
}

async function saveCoutsFormule(){
  const id=document.getElementById('cf-formule-id')?.value;
  const nom=document.getElementById('cf-formule-nom-hidden')?.value;
  const emballage=+document.getElementById('cf-emballage')?.value||0;
  const mo=+document.getElementById('cf-mo')?.value||0;
  const transport=+document.getElementById('cf-transport')?.value||0;
  const avecEmb=document.getElementById('cf-avec-emballage')?.checked;
  const avecTrans=document.getElementById('cf-avec-transport')?.checked;

  if(id){
    await SB.from('gp_formules').update({
      cout_emballage_kg:emballage,
      cout_mo_tonne:mo,
      cout_transport_lot:transport,
      avec_emballage:avecEmb,
      avec_transport:avecTrans
    }).eq('id',id);
  }
  // Mettre à jour FORMULES_SADARI en mémoire aussi
  const f=getAllFormules().find(x=>x.nom===nom);
  if(f){
    f.cout_emballage_kg=emballage;
    f.cout_mo_tonne=mo;
    f.cout_transport_lot=transport;
    f.avec_emballage=avecEmb;
    f.avec_transport=avecTrans;
  }
  document.getElementById('modal-couts-formule').style.display='none';
  renderPrixFormules();
  notify('Coûts de production mis à jour ✓','gold');
}async function renderPrixFormules(){
  const all=getAllFormules();
  // Grouper par espèce
  const groups={};
  all.forEach(f=>{
    if(!groups[f.espece])groups[f.espece]=[];
    groups[f.espece].push(f);
  });

  document.getElementById('prix-formules-liste').innerHTML=`
    ${Object.entries(groups).map(([esp,formules])=>`
      <div class="formule-groupe" style="margin-bottom:8px;border:1px solid var(--border);border-radius:10px;overflow:hidden">
        <div onclick="toggleGroupe('grp-${esp}')"
          style="display:flex;justify-content:space-between;align-items:center;padding:10px 14px;background:rgba(22,163,74,.08);cursor:pointer;user-select:none">
          <div style="font-weight:700;font-size:13px">${ESPECE_ICON[esp]||'🌾'} ${esp.charAt(0).toUpperCase()+esp.slice(1)} <span style="font-size:11px;color:var(--textm);font-weight:400">(${formules.length} formule${formules.length>1?'s':''})</span></div>
          <span id="grp-arr-${esp}" style="color:var(--textm)">▼</span>
        </div>
        <div id="grp-${esp}" style="display:none">
          <table class="tbl" style="font-size:11px">
            <thead><tr><th>Formule</th><th class="num">Prix/kg</th><th class="num">Emballage/kg</th><th class="num">MO/tonne</th><th></th></tr></thead>
            <tbody>
            ${formules.map(f=>`<tr>
              <td style="font-weight:600">${f.nom}<br><span style="font-size:10px;color:var(--textm)">${f.stade||''}</span></td>
              <td class="num" style="color:var(--gold)">
                <div style="display:flex;align-items:center;justify-content:flex-end;gap:4px">
                  <span id="pf-val-${f.nom.replace(/\s/g,'-')}">${fmt(getPrix(f.nom))}</span>
                  <input type="number" id="pf-inp-${f.nom.replace(/\s/g,'-')}" value="${getPrix(f.nom)}"
                    style="width:70px;display:none;font-size:10px;padding:2px 4px;text-align:right"
                    onkeydown="if(event.key==='Enter')sauverPrixFormule('${f.nom}');if(event.key==='Escape')annulerPrixFormule('${f.nom}')">
                  <button class="btn btn-out btn-sm" id="pf-edit-${f.nom.replace(/\s/g,'-')}" onclick="editerPrixFormule('${f.nom}')" style="padding:2px 4px;font-size:9px">✏️</button>
                  <button class="btn btn-g btn-sm" id="pf-save-${f.nom.replace(/\s/g,'-')}" onclick="sauverPrixFormule('${f.nom}')" style="padding:2px 4px;font-size:9px;display:none">✓</button>
                </div>
              </td>
              <td class="num" style="color:rgba(245,158,11,.8)">
                <div style="display:flex;align-items:center;justify-content:flex-end;gap:4px">
                  <span id="pg-val-${f.nom.replace(/\s/g,'-')}">${fmt(GP_PRIX_GROS[f.nom]||0)}</span>
                  <input type="number" id="pg-inp-${f.nom.replace(/\s/g,'-')}" value="${GP_PRIX_GROS[f.nom]||0}"
                    style="width:70px;display:none;font-size:10px;padding:2px 4px;text-align:right"
                    onkeydown="if(event.key==='Enter')sauverPrixGros('${f.nom}');if(event.key==='Escape')annulerPrixGros('${f.nom}')">
                  <button class="btn btn-out btn-sm" id="pg-edit-${f.nom.replace(/\s/g,'-')}" onclick="editerPrixGros('${f.nom}')" style="padding:2px 4px;font-size:9px;border-color:rgba(245,158,11,.4)">✏️</button>
                  <button class="btn btn-g btn-sm" id="pg-save-${f.nom.replace(/\s/g,'-')}" onclick="sauverPrixGros('${f.nom}')" style="padding:2px 4px;font-size:9px;display:none">✓</button>
                </div>
              </td>
              <td class="num" style="color:var(--textm)">${f.cout_emballage_kg?fmt(f.cout_emballage_kg)+' F':'-'}</td>
              <td class="num" style="color:var(--textm)">${f.cout_mo_tonne?fmt(f.cout_mo_tonne)+' F':'-'}</td>
              <td>
                <div style="display:flex;gap:3px">
                  <button class="btn btn-out btn-sm" onclick="editerCoutsFormule('${f.nom}')" title="Coûts de production">⚙️</button>
                  <button class="btn btn-print btn-sm" onclick="imprimerFiche('${f.nom}')" title="Fiche technique">🖨️</button>
                </div>
              </td>
            </tr>`).join('')}
            </tbody>
          </table>
        </div>
      </div>`).join('')}`;
}

function toggleGroupe(id){
  const el=document.getElementById(id);
  if(!el)return;
  const esp=id.replace('grp-','');
  const arr=document.getElementById('grp-arr-'+esp);
  const open=el.style.display==='none';
  el.style.display=open?'block':'none';
  if(arr)arr.textContent=open?'▲':'▼';
}


async function savePrixFormule(){
  const nom=document.getElementById('pf_formule').value;
  const prix=+document.getElementById('pf_prix').value||0;
  const err=document.getElementById('pf_err');
  if(!nom||!prix){err.textContent='Formule et prix requis.';return;}
  const{error}=await SB.from('gp_prix_formules').upsert({admin_id:GP_ADMIN_ID,formule_nom:nom,prix},{onConflict:'admin_id,formule_nom'});
  if(error){
    // Try insert instead
    await SB.from('gp_prix_formules').insert({admin_id:GP_ADMIN_ID,formule_nom:nom,prix});
  }
  GP_PRIX[nom]=prix;
  document.getElementById('pf_prix').value='';
  err.textContent='';
  notify(`Prix ${nom} → ${fmt(prix)} F/kg ✓`,'gold');
  renderPrixFormules();
}
function renderIngrAdmin(){
  const search=document.getElementById('ingr-search')?.value?.toLowerCase()||'';
  const filtered=GP_INGREDIENTS.filter(i=>i.nom.toLowerCase().includes(search));
  document.getElementById('ingr-liste-admin').innerHTML=filtered.length?`
    <div style="overflow-x:auto">
    <table class="tbl" style="font-size:11px">
      <thead><tr>
        <th>Ingrédient</th>
        <th class="num">Prix/kg (F)</th>
        <th class="num">Protéines</th>
        <th class="num">EM (kcal)</th>
        <th class="num">Seuil</th>
        <th></th>
      </tr></thead>
      <tbody>
      ${filtered.map(i=>`<tr>
        <td style="font-weight:600">${i.nom}</td>
        <td class="num" id="prix-cell-${i.id}">
          <div style="display:flex;align-items:center;justify-content:flex-end;gap:4px">
            <span id="prix-val-${i.id}">${fmt(i.prix_actuel)}</span>
            <input type="number" id="prix-inp-${i.id}" value="${i.prix_actuel}"
              style="width:70px;display:none;padding:2px 5px;font-size:11px;text-align:right"
              onkeydown="if(event.key==='Enter')sauverPrixIngr('${i.id}');if(event.key==='Escape')annulerEdit('${i.id}')">
          </div>
        </td>
        <td class="num" style="color:var(--textm)">${i.proteines||'—'}%</td>
        <td class="num" style="color:var(--textm)">${i.energie||'—'}</td>
        <td class="num">
          <div style="display:flex;align-items:center;justify-content:flex-end;gap:4px">
            <span id="seuil-val-${i.id}">${fmt(i.seuil_alerte||200)}</span>
            <input type="number" id="seuil-inp-${i.id}" value="${i.seuil_alerte||200}"
              style="width:65px;display:none;padding:2px 5px;font-size:11px;text-align:right"
              onkeydown="if(event.key==='Enter')sauverSeuil('${i.id}');if(event.key==='Escape')annulerSeuil('${i.id}')">
            <button class="btn btn-out btn-sm" onclick="editerSeuil('${i.id}')" id="seuil-edit-${i.id}" style="padding:2px 4px;font-size:9px" title="Modifier le seuil">✏️</button>
            <button class="btn btn-g btn-sm" onclick="sauverSeuil('${i.id}')" id="seuil-save-${i.id}" style="padding:2px 4px;font-size:9px;display:none">✓</button>
          </div>
        </td>
        <td>
          <div style="display:flex;gap:3px">
            <button class="btn btn-out btn-sm" onclick="editerPrix('${i.id}')" id="edit-btn-${i.id}" title="Modifier le prix">✏️</button>
            <button class="btn btn-g btn-sm" onclick="sauverPrixIngr('${i.id}')" id="save-btn-${i.id}" style="display:none" title="Sauvegarder">✓</button>
            <button class="btn btn-red btn-sm" onclick="deleteIngredient('${i.id}')">✕</button>
          </div>
        </td>
      </tr>`).join('')}
      </tbody>
    </table></div>`
  :'<div style="color:var(--textm);font-size:12px">Aucun ingrédient trouvé.</div>';
}

function editerPrix(id){
  document.getElementById('prix-val-'+id).style.display='none';
  document.getElementById('prix-inp-'+id).style.display='inline-block';
  document.getElementById('edit-btn-'+id).style.display='none';
  document.getElementById('save-btn-'+id).style.display='inline-flex';
  document.getElementById('prix-inp-'+id).focus();
}
function annulerEdit(id){
  document.getElementById('prix-val-'+id).style.display='inline';
  document.getElementById('prix-inp-'+id).style.display='none';
  document.getElementById('edit-btn-'+id).style.display='inline-flex';
  document.getElementById('save-btn-'+id).style.display='none';
}
async function sauverPrixIngr(id){
  const val=+document.getElementById('prix-inp-'+id).value||0;
  const{error}=await SB.from('gp_ingredients').update({prix_actuel:val}).eq('id',id);
  if(error){notify('Erreur: '+error.message,'r');return;}
  const ingr=GP_INGREDIENTS.find(i=>i.id===id);
  if(ingr)ingr.prix_actuel=val;
  document.getElementById('prix-val-'+id).textContent=fmt(val);
  annulerEdit(id);
  notify('Prix mis à jour ✓','gold');
}
function editerSeuil(id){
  document.getElementById('seuil-val-'+id).style.display='none';
  document.getElementById('seuil-inp-'+id).style.display='inline-block';
  document.getElementById('seuil-edit-'+id).style.display='none';
  document.getElementById('seuil-save-'+id).style.display='inline-flex';
  document.getElementById('seuil-inp-'+id).focus();
  document.getElementById('seuil-inp-'+id).select();
}
function annulerSeuil(id){
  document.getElementById('seuil-val-'+id).style.display='inline';
  document.getElementById('seuil-inp-'+id).style.display='none';
  document.getElementById('seuil-edit-'+id).style.display='inline-flex';
  document.getElementById('seuil-save-'+id).style.display='none';
}
async function sauverSeuil(id){
  const val=+document.getElementById('seuil-inp-'+id).value||100;
  const{error}=await SB.from('gp_ingredients').update({seuil_alerte:val}).eq('id',id);
  if(error){notify('Erreur: '+error.message,'r');return;}
  const ingr=GP_INGREDIENTS.find(i=>i.id===id);
  if(ingr)ingr.seuil_alerte=val;
  document.getElementById('seuil-val-'+id).textContent=fmt(val);
  annulerSeuil(id);
  notify('Seuil d\'alerte mis à jour ✓','gold');
}
async function saveIngredient(){
  const nom=document.getElementById('ni_nom').value.trim();
  const prix=+document.getElementById('ni_prix').value||0;
  const prot=+document.getElementById('ni_prot')?.value||null;
  const em=+document.getElementById('ni_em')?.value||null;
  const seuil=+document.getElementById('ni_seuil').value||200;
  const err=document.getElementById('ni_err');
  if(!nom){err.textContent='Nom requis.';return;}
  const{error}=await SB.from('gp_ingredients').insert({
    admin_id:GP_ADMIN_ID,nom,prix_actuel:prix,
    proteines:prot,energie:em,
    seuil_alerte:seuil,
    fournisseur:document.getElementById('ni_fourn').value.trim()||null
  });
  if(error){err.textContent='Erreur: '+error.message;return;}
  ['ni_nom','ni_prix','ni_prot','ni_em','ni_fourn'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});
  document.getElementById('ni_seuil').value='200';
  err.textContent='';
  await loadIngredients();populateSelects();renderIngrAdmin();
  notify('Matière première ajoutée ✓');
}
async function deleteIngredient(id){
  if(!confirm('Supprimer cet ingrédient ?'))return;
  await SB.from('gp_ingredients').delete().eq('id',id);
  await loadIngredients();populateSelects();renderIngrAdmin();
}
function openNewFormule(){notify('Nouvelle formule — fonctionnalité en développement','gold');}

// ── ÉQUIPE ─────────────────────────────────────────
async function saveEquipe(){
  const nom=document.getElementById('eq_nom').value.trim();
  const email=document.getElementById('eq_email').value.trim();
  const tel=document.getElementById('eq_tel')?.value.trim()||'';
  const role=document.getElementById('eq_role').value;
  const pv=document.getElementById('eq_pv_hidden')?.value.trim()||null;
  const err=document.getElementById('eq_err');
  const ok=document.getElementById('eq_ok');
  if(!nom||!email){err.textContent='Nom et email requis.';return;}
  if(!tel){err.textContent='Numéro WhatsApp requis pour envoyer l\'invitation.';return;}
  err.textContent='';ok.innerHTML='';

  // Vérifier doublon
  const{data:exist}=await SB.from('gp_membres').select('id').eq('email',email).eq('admin_id',GP_ADMIN_ID);
  if(exist&&exist.length>0){err.textContent='Cet email est déjà dans votre équipe.';return;}

  // Enregistrer le membre
  const{error}=await SB.from('gp_membres').insert({
    admin_id:GP_ADMIN_ID,
    nom,email,role,
    point_vente:pv,
    telephone:tel,
    user_id:null
  });
  if(error){err.textContent='Erreur: '+error.message;return;}

  // Envoyer invitation WhatsApp au numéro de la secrétaire
  const siteUrl=window.location.origin;
  const telClean=tel.replace(/[\s\-\+]/g,'').replace(/^00/,'').replace(/^228/,'');
  const roleLabel=role==='admin'?'Administrateur':role==='daf'?'DAF':role==='logistique'?'Logistique':'Secrétaire';
  const msg=encodeURIComponent(
    `Bonjour ${nom} 👋\n\n`+
    `Vous avez été ajouté(e) comme *${roleLabel}* sur *PROVENDA*`+
    (pv?`\n📍 Point de vente : *${pv}*`:'')+
    `\n\n`+
    `📌 *Comment accéder au logiciel :*\n`+
    `1. Ouvrez ce lien : *${siteUrl}*\n`+
    `2. Cliquez *"Créer un compte"*\n`+
    `3. Utilisez exactement cet email : *${email}*\n`+
    `4. Choisissez un mot de passe\n\n`+
    `⚠️ Utilisez bien l'adresse email *${email}* — sinon l'accès ne sera pas reconnu.\n\n`+
    `_PROVENDA · ATM Farm Village_`
  );

  ['eq_nom','eq_email','eq_tel'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});

  ok.innerHTML=`
    <div style="color:var(--green);margin-bottom:8px">✓ <strong>${nom}</strong> ajouté(e) — ${roleLabel}${pv?' · '+pv:''}</div>
    <a href="https://wa.me/228${telClean}?text=${msg}" target="_blank"
      class="btn btn-g btn-sm" style="display:inline-flex;text-decoration:none;width:100%;justify-content:center">
      📲 Envoyer l'invitation WhatsApp à ${nom}
    </a>`;

  notify(`${nom} ajouté(e) ✓`,'gold');
  renderEquipe();
}

async function deleteMembre(id){
  if(!confirm('Supprimer ce membre ?'))return;
  await SB.from('gp_membres').delete().eq('id',id);
  renderEquipe();
  notify('Membre supprimé','r');
}
async function renderEquipe(){
  const{data}=await SB.from('gp_membres').select('*').eq('admin_id',GP_ADMIN_ID);
  const M=data||[];
  document.getElementById('equipe-liste').innerHTML=M.length?M.map(m=>`
    <div style="padding:10px;background:var(--g2);border-radius:8px;margin-bottom:6px;display:flex;justify-content:space-between;align-items:center">
      <div>
        <div style="font-weight:700">${m.nom||'—'}</div>
        <div style="font-size:10px;color:var(--textm);margin-top:2px">${m.email||'—'}</div>
        <span class="badge ${m.role==='admin'?'bdg-gold':'bdg-b'}" style="font-size:9px;margin-top:4px">${m.role}</span>
      </div>
      <button class="btn btn-red btn-sm" onclick="deleteMembre('${m.id}')">✕</button>
    </div>`).join(''):'<div style="color:var(--textm);font-size:12px">Aucun membre. Ajoutez un secrétaire.</div>';
}
async function deleteMembre(id){
  if(!confirm('Retirer ce membre ?'))return;
  await SB.from('gp_membres').delete().eq('id',id);
  renderEquipe();notify('Membre retiré','r');
}

// ── CONFIG ─────────────────────────────────────────
function applyColor(c){
  document.documentElement.style.setProperty('--g4',c);
  document.documentElement.style.setProperty('--g5',c);
}
function applyLogo(url){
  const tb=document.getElementById('tb-logo');
  if(tb)tb.innerHTML=`<img src="${url}" style="width:30px;height:30px;object-fit:contain;border-radius:6px">`;
  const preview=document.getElementById('cfg-logo-preview');
  if(preview)preview.innerHTML=`<img src="${url}" style="width:90px;height:90px;object-fit:contain;border-radius:12px;margin:0 auto 8px;display:block">`;
}
async function loadConfigForm(){
  if(GP_CONFIG.nom_provenderie)document.getElementById('cfg_nom').value=GP_CONFIG.nom_provenderie;
  if(GP_CONFIG.slogan)document.getElementById('cfg_slogan').value=GP_CONFIG.slogan;
  if(GP_CONFIG.telephone)document.getElementById('cfg_tel').value=GP_CONFIG.telephone;
  if(GP_CONFIG.email)document.getElementById('cfg_email').value=GP_CONFIG.email;
  if(GP_CONFIG.localisation)document.getElementById('cfg_loc').value=GP_CONFIG.localisation;
  if(GP_CONFIG.couleur)document.getElementById('cfg_couleur').value=GP_CONFIG.couleur;
  if(GP_CONFIG.tel_alerte_stock)document.getElementById('cfg_tel_alerte').value=GP_CONFIG.tel_alerte_stock;
  if(GP_CONFIG.callmebot_apikey)document.getElementById('cfg_callmebot_apikey').value=GP_CONFIG.callmebot_apikey;
  if(GP_CONFIG.logo_url)applyLogo(GP_CONFIG.logo_url);
}
async function saveConfig(){
  const nom=document.getElementById('cfg_nom').value.trim();
  const err=document.getElementById('cfg_err');const ok=document.getElementById('cfg_ok');
  if(!nom){err.textContent='Nom requis.';return;}
  const couleur=document.getElementById('cfg_couleur').value;
  const telAlerte=document.getElementById('cfg_tel_alerte')?.value.trim()||null;
  const{error}=await SB.from('gp_config').upsert({
    user_id:GP_ADMIN_ID,nom_provenderie:nom,
    slogan:document.getElementById('cfg_slogan').value.trim(),
    telephone:document.getElementById('cfg_tel').value.trim(),
    email:document.getElementById('cfg_email').value.trim(),
    localisation:document.getElementById('cfg_loc').value.trim(),
    couleur,logo_url:GP_CONFIG.logo_url||null,
    tel_alerte_stock:telAlerte,
    callmebot_apikey:document.getElementById('cfg_callmebot_apikey')?.value.trim()||null
  },{onConflict:'user_id'});
  if(error){err.textContent='Erreur: '+error.message;return;}
  GP_CONFIG.nom_provenderie=nom;GP_CONFIG.couleur=couleur;
  if(telAlerte)GP_CONFIG.tel_alerte_stock=telAlerte;
  const apikey=document.getElementById('cfg_callmebot_apikey')?.value.trim();
  if(apikey)GP_CONFIG.callmebot_apikey=apikey;
  document.getElementById('tb-name').textContent=nom;
  applyColor(couleur);
  err.textContent='';ok.textContent='✓ Configuration sauvegardée !';
  setTimeout(()=>ok.textContent='',3000);
  notify('Configuration mise à jour ✓','gold');
}
async function saveRemiseMax(){
  const val=+document.getElementById('cfg_remise_max').value||5;
  GP_REMISE_MAX=val;
  await SB.from('gp_config').upsert({user_id:GP_ADMIN_ID,remise_max:val},{onConflict:'user_id'});
  notify(`Remise max : ${val}% ✓`,'gold');
}
async function uploadLogo(){
  const file=document.getElementById('cfg_logo').files?.[0];
  const err=document.getElementById('logo_err');const ok=document.getElementById('logo_ok');
  if(!file){err.textContent='Sélectionnez un fichier.';return;}
  if(file.size>2*1024*1024){err.textContent='Max 2MB.';return;}
  err.textContent='Upload...';
  const ext=file.name.split('.').pop();
  const path=`logos/${GP_ADMIN_ID}/logo.${ext}`;
  const{error:upErr}=await SB.storage.from('gp-logos').upload(path,file,{upsert:true});
  if(upErr){err.textContent='Erreur: '+upErr.message;return;}
  const{data:urlData}=SB.storage.from('gp-logos').getPublicUrl(path);
  const logo_url=urlData?.publicUrl;
  await SB.from('gp_config').upsert({user_id:GP_ADMIN_ID,logo_url},{onConflict:'user_id'});
  GP_CONFIG.logo_url=logo_url;
  applyLogo(logo_url);
  err.textContent='';ok.textContent='✓ Logo mis à jour !';
  setTimeout(()=>ok.textContent='',3000);
  notify('Logo uploadé ✓','gold');
}

// ── BOOT ───────────────────────────────────────────
window.addEventListener('load',function(){
  try{SB=supabase.createClient(GP_URL,GP_KEY);}
  catch(e){document.getElementById('a_err').textContent='Erreur réseau. Rechargez la page.';return;}
  SB.auth.getSession().then(function(res){
    const session=res.data&&res.data.session;
    if(session)bootApp(session.user);
  }).catch(function(e){console.error('Session check failed:',e);});
});
async function testerCallMeBot(){
  const apikey=document.getElementById('cfg_callmebot_apikey')?.value.trim();
  const tel=(document.getElementById('cfg_tel_alerte')?.value||document.getElementById('cfg_tel')?.value||'').replace(/[\s\-\+]/g,'').replace(/^00/,'').replace(/^228/,'');
  const status=document.getElementById('callmebot-status');
  if(!apikey){status.style.color='#ef4444';status.textContent='⚠ Entrez votre clé API CallMeBot.';return;}
  if(!tel){status.style.color='#ef4444';status.textContent='⚠ Entrez votre numéro de téléphone.';return;}
  status.style.color='#94A3B8';status.textContent='⏳ Envoi en cours...';
  const msg=encodeURIComponent('✅ Test PROVENDA — Vos alertes stock automatiques sont activées !');
  const url=`https://api.callmebot.com/whatsapp.php?phone=228${tel}&text=${msg}&apikey=${apikey}`;
  try{
    const res=await fetch(url);
    const txt=await res.text();
    if(txt.includes('Message Sent')||txt.includes('queued')){
      status.style.color='#25D366';
      status.textContent='✅ Message envoyé ! Vérifiez votre WhatsApp.';
    } else {
      status.style.color='#ef4444';
      status.textContent='⚠ Erreur: '+txt.slice(0,80);
    }
  } catch(e){
    status.style.color='#ef4444';
    status.textContent='⚠ Erreur réseau: '+e.message;
  }
}

// ══════════════════════════════════════════════════
// POINTS DE VENTE & ÉQUIPE
// ══════════════════════════════════════════════════


// ── BADGE COULEUR PAR POINT DE VENTE ──────────────

function ouvrirModalEq(pvNom){
  document.getElementById('modal-eq').style.display='flex';
  document.getElementById('eq_pv_hidden').value=pvNom||'';
  document.getElementById('modal-eq-pv-label').innerHTML=pvNom?pvBadgeHtml(pvNom,'lg'):'<span style="font-size:13px;color:var(--textm)">🏭 Siège principal</span>';
  document.getElementById('eq_nom').value='';
  document.getElementById('eq_email').value='';
  document.getElementById('eq_tel').value='';
  document.getElementById('eq_role').value='secretaire';
  document.getElementById('eq_err').textContent='';
  document.getElementById('eq_ok').innerHTML='';
  setTimeout(()=>document.getElementById('eq_nom').focus(),100);
}
function fermerModalEq(){
  document.getElementById('modal-eq').style.display='none';
}

async function renderPDV(){
  const{data:P}=await SB.from('gp_points_vente').select('*').eq('admin_id',GP_ADMIN_ID).order('nom');
  const{data:M}=await SB.from('gp_membres').select('*').eq('admin_id',GP_ADMIN_ID);
  const membres=M||[];
  const points=P||[];

  // Remplir select (gardé pour compatibilité)
  const sel=document.getElementById('eq_pv');
  if(sel){
    sel.innerHTML='<option value="">— Aucun (siège principal) —</option>'+
      points.map(p=>`<option value="${p.nom}">${p.nom}</option>`).join('');
  }

  // Afficher liste complète PDV avec membres dedans
  const container=document.getElementById('pdv-liste-complet');
  if(!container)return;

  if(!points.length){
    container.innerHTML='<div style="color:var(--textm);font-size:12px;padding:12px 0">Aucun point de vente créé. Créez-en un ci-dessus.</div>';
  } else {
    container.innerHTML=points.map(p=>{
      const membresP=membres.filter(m=>m.point_vente===p.nom);
      const pal=pvPalette(p.nom);
      return `<div class="card" style="margin-bottom:10px;border-left:4px solid ${pal.border}">
        <div class="card-title">
          <div class="ct-left" style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
            ${pvBadgeHtml(p.nom,'lg')}
            ${p.telephone?`<span style="font-size:10px;color:var(--textm)">📞 ${p.telephone}</span>`:''}
            ${p.adresse?`<span style="font-size:10px;color:var(--textm)">📍 ${p.adresse}</span>`:''}
            ${p.latitude&&p.longitude?`<a href="https://www.google.com/maps?q=${p.latitude},${p.longitude}" target="_blank" style="font-size:10px;color:var(--g6);text-decoration:none">🗺️ Voir sur carte</a>`:''}
          </div>
          <div style="display:flex;gap:6px">
            <button class="btn btn-g btn-sm" onclick="ouvrirModalEq('${p.nom}')">➕ Ajouter secrétaire</button>
            <button class="btn btn-red btn-sm" onclick="deletePDV('${p.id}','${p.nom}')">✕</button>
          </div>
        </div>
        ${membresP.length
          ? membresP.map(m=>membreCard(m)).join('')
          : '<div style="font-size:11px;color:var(--textm);padding:8px 0">Aucun membre dans ce point de vente.</div>'
        }
      </div>`;
    }).join('');
  }

  // Siège principal — membres sans point de vente
  const siege=membres.filter(m=>!m.point_vente);
  const siegeEl=document.getElementById('equipe-siege');
  if(siegeEl){
    siegeEl.innerHTML=siege.length
      ? siege.map(m=>membreCard(m)).join('')
      : '<div style="font-size:11px;color:var(--textm)">Aucun membre au siège.</div>';
  }
}

function membreCard(m){
  const telClean=(m.telephone||'').replace(/[\s\-\+]/g,'').replace(/^00/,'').replace(/^228/,'');
  const siteUrl=window.location.origin;
  const reinvitMsg=encodeURIComponent(
    `Bonjour ${m.nom} 👋\n\nRappel : connectez-vous sur PROVENDA avec cet email : *${m.email}*\n\nLien : ${siteUrl}\n\n_PROVENDA · ATM Farm Village_`
  );
  return `<div style="padding:10px;background:rgba(14,20,40,.5);border:1px solid var(--border);border-radius:8px;margin-bottom:6px">
    <div style="display:flex;justify-content:space-between;align-items:center">
      <div>
        <div style="font-weight:700;font-size:13px">${m.nom||'—'}</div>
        <div style="font-size:10px;color:var(--textm)">${m.email||'—'} ${m.telephone?'· '+m.telephone:''}</div>
        <div style="display:flex;gap:4px;margin-top:4px;flex-wrap:wrap">
          <span class="badge ${m.role==='admin'?'bdg-gold':'bdg-g'}" style="font-size:9px">${(m.role||'secretaire').toUpperCase()}</span>
          <span class="badge" style="font-size:9px;background:${m.user_id?'rgba(22,163,74,.1)':'rgba(239,68,68,.1)'};color:${m.user_id?'var(--green)':'var(--red)'};">${m.user_id?'✅ Connecté':'⏳ En attente'}</span>
          ${m.point_vente?pvBadgeHtml(m.point_vente):''}
        </div>
      </div>
      <div style="display:flex;gap:4px">
        ${m.telephone&&!m.user_id?`<a href="https://wa.me/228${telClean}?text=${reinvitMsg}" target="_blank" class="btn btn-g btn-sm" title="Renvoyer invitation">📲</a>`:''}
        <button class="btn btn-red btn-sm" onclick="deleteMembre('${m.id}')">✕</button>
      </div>
    </div>
  </div>`;
}

function localisermoi(){
  if(!navigator.geolocation){notify('GPS non disponible','r');return;}
  notify('Récupération de votre position...','gold');
  navigator.geolocation.getCurrentPosition(
    pos=>{
      document.getElementById('pv_lat').value=pos.coords.latitude.toFixed(6);
      document.getElementById('pv_lng').value=pos.coords.longitude.toFixed(6);
      notify('Position GPS obtenue ✓','gold');
    },
    ()=>notify('Impossible d\'obtenir la position GPS','r')
  );
}

async function savePDV(){
  const nom=document.getElementById('pv_nom')?.value.trim();
  const tel=document.getElementById('pv_tel')?.value.trim()||null;
  const adresse=document.getElementById('pv_adresse')?.value.trim()||null;
  const lat=parseFloat(document.getElementById('pv_lat')?.value)||null;
  const lng=parseFloat(document.getElementById('pv_lng')?.value)||null;
  const err=document.getElementById('pv_err');
  if(!nom){err.textContent='Nom requis.';return;}
  const typePdv=document.getElementById('pv_type')?.value||'secondaire';
  const secSalariee=document.getElementById('pv_sec_type')?.value==='true';
  const{error}=await SB.from('gp_points_vente').insert({
    admin_id:GP_ADMIN_ID,nom,telephone:tel,adresse,
    latitude:lat,longitude:lng,
    type_pdv:typePdv,
    secretaire_salariee:secSalariee
  });
  if(error){err.textContent='Erreur: '+error.message;return;}
  // Créer automatiquement la caisse physique du PDV
  await SB.from('gp_caisses').insert({
    admin_id:GP_ADMIN_ID,
    nom:'Caisse '+nom,
    type:'physique',
    point_vente:nom,
    solde_initial:0,
    solde_actuel:0,
    couleur:pvPalette(nom).border,
    actif:true
  });
  ['pv_nom','pv_tel','pv_adresse','pv_lat','pv_lng'].forEach(id=>{
    const el=document.getElementById(id);if(el)el.value='';
  });
  err.textContent='';
  await renderPDV();
  notify('Point de vente "'+nom+'" créé avec sa caisse ✓','gold');
}

async function deletePDV(id,nom){
  if(!confirm(`Supprimer le point de vente "${nom}" ?\nLes membres assignés passeront au siège principal.`))return;
  // Retirer le point_vente des membres
  await SB.from('gp_membres').update({point_vente:null}).eq('admin_id',GP_ADMIN_ID).eq('point_vente',nom);
  await SB.from('gp_points_vente').delete().eq('id',id);
  renderPDV();
  notify('Point de vente supprimé','r');
}

// ── COÛTS DE PRODUCTION PAR FORMULE ──────────────
function editerCoutsFormule(formuleNom){
  const f=getAllFormules().find(x=>x.nom===formuleNom);
  if(!f)return;
  const modal=document.getElementById('modal-couts-formule');
  document.getElementById('cf-formule-nom').textContent=formuleNom;
  document.getElementById('cf-emballage').value=f.cout_emballage_kg||0;
  document.getElementById('cf-mo').value=f.cout_mo_tonne||0;
  document.getElementById('cf-transport').value=f.cout_transport_lot||0;
  document.getElementById('cf-avec-emballage').checked=f.avec_emballage!==false;
  document.getElementById('cf-avec-transport').checked=f.avec_transport===true;
  document.getElementById('cf-formule-id').value=f.id||'';
  document.getElementById('cf-formule-nom-hidden').value=formuleNom;
  modal.style.display='flex';
}

async function saveCoutsFormule(){
  const id=document.getElementById('cf-formule-id')?.value;
  const nom=document.getElementById('cf-formule-nom-hidden')?.value;
  const emballage=+document.getElementById('cf-emballage')?.value||0;
  const mo=+document.getElementById('cf-mo')?.value||0;
  const transport=+document.getElementById('cf-transport')?.value||0;
  const avecEmb=document.getElementById('cf-avec-emballage')?.checked;
  const avecTrans=document.getElementById('cf-avec-transport')?.checked;

  if(id){
    await SB.from('gp_formules').update({
      cout_emballage_kg:emballage,
      cout_mo_tonne:mo,
      cout_transport_lot:transport,
      avec_emballage:avecEmb,
      avec_transport:avecTrans
    }).eq('id',id);
  }
  // Mettre à jour FORMULES_SADARI en mémoire aussi
  const f=getAllFormules().find(x=>x.nom===nom);
  if(f){
    f.cout_emballage_kg=emballage;
    f.cout_mo_tonne=mo;
    f.cout_transport_lot=transport;
    f.avec_emballage=avecEmb;
    f.avec_transport=avecTrans;
  }
  document.getElementById('modal-couts-formule').style.display='none';
  renderPrixFormules();
  notify('Coûts de production mis à jour ✓','gold');
}

// ── ÉDITION PRIX DÉTAIL PAR FORMULE ──────────────
function editerPrixFormule(nom){
  const key=nom.replace(/\s/g,'-');
  document.getElementById('pf-val-'+key).style.display='none';
  document.getElementById('pf-inp-'+key).style.display='inline-block';
  document.getElementById('pf-edit-'+key).style.display='none';
  document.getElementById('pf-save-'+key).style.display='inline-flex';
  document.getElementById('pf-inp-'+key).focus();
}
function annulerPrixFormule(nom){
  const key=nom.replace(/\s/g,'-');
  document.getElementById('pf-val-'+key).style.display='inline';
  document.getElementById('pf-inp-'+key).style.display='none';
  document.getElementById('pf-edit-'+key).style.display='inline-flex';
  document.getElementById('pf-save-'+key).style.display='none';
}
async function sauverPrixFormule(nom){
  const key=nom.replace(/\s/g,'-');
  const val=+document.getElementById('pf-inp-'+key)?.value||0;
  await SB.from('gp_prix_formules').upsert({
    admin_id:GP_ADMIN_ID,formule_nom:nom,prix:val
  },{onConflict:'admin_id,formule_nom'});
  GP_PRIX[nom]=val;
  document.getElementById('pf-val-'+key).textContent=fmt(val);
  annulerPrixFormule(nom);
  notify('Prix détail mis à jour ✓','gold');
}

// ── ÉDITION PRIX GROS PAR FORMULE ────────────────
function editerPrixGros(nom){
  const key=nom.replace(/\s/g,'-');
  document.getElementById('pg-val-'+key).style.display='none';
  document.getElementById('pg-inp-'+key).style.display='inline-block';
  document.getElementById('pg-edit-'+key).style.display='none';
  document.getElementById('pg-save-'+key).style.display='inline-flex';
  document.getElementById('pg-inp-'+key).focus();
}
function annulerPrixGros(nom){
  const key=nom.replace(/\s/g,'-');
  document.getElementById('pg-val-'+key).style.display='inline';
  document.getElementById('pg-inp-'+key).style.display='none';
  document.getElementById('pg-edit-'+key).style.display='inline-flex';
  document.getElementById('pg-save-'+key).style.display='none';
}
async function sauverPrixGros(nom){
  const key=nom.replace(/\s/g,'-');
  const val=+document.getElementById('pg-inp-'+key)?.value||0;
  await SB.from('gp_prix_formules').upsert({
    admin_id:GP_ADMIN_ID,formule_nom:nom,prix_gros:val
  },{onConflict:'admin_id,formule_nom'});
  GP_PRIX_GROS[nom]=val;
  document.getElementById('pg-val-'+key).textContent=fmt(val);
  annulerPrixGros(nom);
  notify('Prix gros mis à jour ✓','gold');
}
