// ── FORMULES & PRIX ────────────────────────────────
function renderPrixFormules(){
  const all=getAllFormules();
  document.getElementById('prix-formules-liste').innerHTML=`
    <table class="tbl" style="font-size:11px"><thead><tr><th>Formule</th><th>Espèce</th><th class="num">Prix/kg (FCFA)</th></tr></thead><tbody>
    ${all.slice(0,24).map(f=>`<tr><td style="font-weight:600;font-size:11px">${f.nom}</td><td>${ESPECE_ICON[f.espece]||''} ${f.espece||'—'}</td><td class="num" style="color:var(--gold)">${fmt(getPrix(f.nom))} F</td><td><button class="btn btn-print btn-sm" onclick="imprimerFiche('${f.nom}')">🖨️ Fiche</button></td></tr>`).join('')}
    </tbody></table>`;
  renderIngrAdmin();
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
  const role=document.getElementById('eq_role').value;
  const err=document.getElementById('eq_err');const ok=document.getElementById('eq_ok');
  if(!nom||!email){err.textContent='Nom et email requis.';return;}
  // Invite via Supabase (creates magic link)
  const{error}=await SB.auth.admin?.inviteUserByEmail?.(email,{data:{nom,role:role,admin_id:GP_ADMIN_ID}});
  // If no admin SDK, store the invitation in gp_membres pending
  await SB.from('gp_membres').insert({admin_id:GP_ADMIN_ID,nom,email,role}).catch(()=>{});
  err.textContent='';
  ok.textContent=`✓ ${nom} ajouté(e). Il/elle peut créer son compte avec l'email ${email}.`;
  ['eq_nom','eq_email'].forEach(id=>document.getElementById(id).value='');
  notify(`${nom} ajouté(e) comme ${role} ✓`,'gold');
  renderEquipe();
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
