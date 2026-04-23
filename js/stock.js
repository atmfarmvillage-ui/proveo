
// ── SÉLECTION MP DYNAMIQUE ────────────────────────
function filtrerMPStock(){
  const q=document.getElementById('mp_ingr_search')?.value.toLowerCase().trim()||'';
  const results=document.getElementById('mp_ingr_results');
  if(!results)return;

  // Calculer les niveaux de stock actuels
  const niveaux=calcNiveaux(window._stockNiveaux||[]);

  // Trier : rupture d'abord, puis les plus utilisés (par nb occurrences en formule)
  let liste=[...GP_INGREDIENTS];

  // Score de chaque ingrédient
  liste=liste.map(ingr=>{
    const nv=niveaux[ingr.nom]||0;
    const seuil=ingr.seuil_alerte||200;
    const enRupture=nv<=0;
    const faible=nv<seuil;
    // Compter usage dans les formules SADARI
    const nbFormules=FORMULES_SADARI.filter(f=>f.ingredients?.some(i=>i.nom===ingr.nom)).length;
    return{...ingr,nv,enRupture,faible,nbFormules};
  }).sort((a,b)=>{
    // 1. Rupture d'abord
    if(a.enRupture!==b.enRupture)return a.enRupture?-1:1;
    // 2. Stock faible ensuite
    if(a.faible!==b.faible)return a.faible?-1:1;
    // 3. Plus utilisés
    return b.nbFormules-a.nbFormules;
  });

  // Filtrer par recherche
  if(q)liste=liste.filter(i=>i.nom.toLowerCase().includes(q));

  if(!liste.length){
    results.innerHTML='<div style="padding:12px;color:var(--textm);font-size:12px;text-align:center">Aucune MP trouvée</div>';
    results.style.display='block';
    return;
  }

  results.innerHTML=liste.slice(0,12).map(ingr=>{
    const nv=ingr.nv;
    const seuil=ingr.seuil_alerte||200;
    let badge='';
    let bgColor='';
    if(nv<=0){badge='<span style="background:rgba(239,68,68,.15);color:var(--red);border:1px solid rgba(239,68,68,.3);padding:1px 6px;border-radius:10px;font-size:9px;font-weight:700">⚠ RUPTURE</span>';bgColor='rgba(239,68,68,.04)';}
    else if(nv<seuil){badge='<span style="background:rgba(245,158,11,.12);color:var(--gold);border:1px solid rgba(245,158,11,.3);padding:1px 6px;border-radius:10px;font-size:9px;font-weight:700">⬇ FAIBLE</span>';bgColor='rgba(245,158,11,.04)';}
    else{badge='<span style="background:rgba(22,163,74,.12);color:var(--green);padding:1px 6px;border-radius:10px;font-size:9px">✓ OK</span>';}
    
    return`<div onclick="selectionnerMPStock('${ingr.id}','${ingr.nom.replace(/'/g,"\'")}',${ingr.prix_actuel||0})"
      style="padding:10px 14px;cursor:pointer;border-bottom:1px solid rgba(30,45,74,.3);background:${bgColor};transition:background .15s"
      onmouseover="this.style.background='rgba(22,163,74,.08)'" onmouseout="this.style.background='${bgColor}'">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:8px">
        <div>
          <div style="font-size:12px;font-weight:600">${ingr.nom}</div>
          <div style="font-size:10px;color:var(--textm)">${fmtKg(nv)} kg en stock · ${fmt(ingr.prix_actuel||0)} F/kg</div>
        </div>
        <div style="display:flex;align-items:center;gap:4px;flex-shrink:0">${badge}</div>
      </div>
    </div>`;
  }).join('');
  results.style.display='block';
}

function selectionnerMPStock(id,nom,prix){
  document.getElementById('mp_ingr').value=id;
  document.getElementById('mp_ingr_search').value=nom;
  document.getElementById('mp_prix').value=prix;
  const selDiv=document.getElementById('mp_ingr_selected');
  const nomEl=document.getElementById('mp_ingr_nom');
  if(selDiv){selDiv.style.display='flex';}
  if(nomEl)nomEl.textContent=nom;
  document.getElementById('mp_ingr_results').style.display='none';
  document.getElementById('mp_qte')?.focus();
}

function effacerSelectionMP(){
  document.getElementById('mp_ingr').value='';
  document.getElementById('mp_ingr_search').value='';
  document.getElementById('mp_prix').value='';
  const selDiv=document.getElementById('mp_ingr_selected');
  if(selDiv)selDiv.style.display='none';
  document.getElementById('mp_ingr_search')?.focus();
}

// Fermer les résultats si clic ailleurs
document.addEventListener('click',e=>{
  const results=document.getElementById('mp_ingr_results');
  const search=document.getElementById('mp_ingr_search');
  if(results&&!results.contains(e.target)&&e.target!==search){
    results.style.display='none';
  }
});

// ── STOCK MP ───────────────────────────────────────
function calcNiveaux(mouvements){
  const niveaux={};
  (mouvements||[]).forEach(m=>{
    if(!niveaux[m.ingredient_nom])niveaux[m.ingredient_nom]=0;
    if(m.type==='entree')niveaux[m.ingredient_nom]+=Number(m.quantite||0);
    else niveaux[m.ingredient_nom]-=Number(m.quantite||0);
  });
  return niveaux;
}
async function renderStockNiveaux(){
  const{data:S}=await SB.from('gp_stock_mp').select('*').eq('admin_id',GP_ADMIN_ID);
  window._stockNiveaux=S;
  const niveaux=calcNiveaux(S);
  // Stock value
  const valeur=Object.entries(niveaux).reduce((s,[nom,qte])=>{
    const ingr=GP_INGREDIENTS.find(i=>i.nom===nom);
    return s+Math.max(0,qte)*(ingr?.prix_actuel||0);
  },0);
  const alertes=Object.entries(niveaux).filter(([nom,n])=>{const i=GP_INGREDIENTS.find(x=>x.nom===nom);return n<(i?.seuil_alerte||200);}).length;
  document.getElementById('stock-kpis').innerHTML=`
    <div class="econo-box"><div class="econo-val">${Object.keys(niveaux).length}</div><div class="econo-lbl">Références</div></div>
    <div class="econo-box"><div class="econo-val" style="color:var(--gold)">${GP_ROLE==='admin'?fmt(valeur)+' F':'—'}</div><div class="econo-lbl">Valeur stock</div></div>
    <div class="econo-box"><div class="econo-val" style="color:${alertes>0?'var(--red)':'var(--green)'}">${alertes}</div><div class="econo-lbl">Alertes</div></div>
    <div class="econo-box"><div class="econo-val">${(S||[]).length}</div><div class="econo-lbl">Mouvements</div></div>`;
  const sorted=Object.entries(niveaux).sort((a,b)=>{
    const [nomA,nvA]=a; const [nomB,nvB]=b;
    const ingrA=GP_INGREDIENTS.find(i=>i.nom===nomA);
    const ingrB=GP_INGREDIENTS.find(i=>i.nom===nomB);
    const seuilA=ingrA?.seuil_alerte||200;
    const seuilB=ingrB?.seuil_alerte||200;
    // 1. Épuisés (stock=0) en premier
    const epuiseA=nvA<=0; const epuiseB=nvB<=0;
    if(epuiseA!==epuiseB)return epuiseA?-1:1;
    // 2. Stock faible (< seuil) ensuite
    const faibleA=nvA<seuilA; const faibleB=nvB<seuilB;
    if(faibleA!==faibleB)return faibleA?-1:1;
    // 3. Tri alphabétique pour le reste
    return nomA.localeCompare(nomB);
  });
  document.getElementById('stock-niveaux').innerHTML=sorted.length?`<table class="tbl"><thead><tr>
      <th>Ingrédient</th>
      <th class="num">Stock (kg)</th>
      ${GP_ROLE==='admin'?'<th class="num">Prix/kg</th>':''}
      <th>Statut</th>
    </tr></thead><tbody>
    ${sorted.map(([nom,n])=>{
      const ingr=GP_INGREDIENTS.find(i=>i.nom===nom);
      const ingrId=ingr?.id||'';
      const prixActuel=ingr?.prix_actuel||0;
      const seuil=ingr?.seuil_alerte||200;
      const statut=n<=0?'❌ Épuisé':n<seuil*0.5?'🔴 Critique':n<seuil?'🟡 Bas':'🟢 OK';
      const cls=n<=0?'bad':n<seuil*0.5?'bad':n<seuil?'warn':'good';
      return `<tr class="stock-row" data-nom="${nom.toLowerCase()}">
        <td style="font-weight:600">${nom}</td>
        <td class="num ${cls}">${fmtKg(n)}</td>
        <td class="num">${fmt(prixActuel)} F</td>
        <td><span class="badge ${n<seuil?n<=0?'bdg-r':'bdg-gold':'bdg-g'}">${statut}</span></td>
      </tr>`;}).join('')}
    </tbody></table>`:'<div style="color:var(--textm);font-size:12px">Aucun stock enregistré. Réceptionnez des MP.</div>';
}

function editerPrixStock(id){
  document.getElementById('sp-val-'+id).style.display='none';
  document.getElementById('sp-inp-'+id).style.display='inline-block';
  document.getElementById('sp-edit-'+id).style.display='none';
  document.getElementById('sp-save-'+id).style.display='inline-flex';
  document.getElementById('sp-inp-'+id).focus();
  document.getElementById('sp-inp-'+id).select();
}
function annulerPrixStock(id){
  document.getElementById('sp-val-'+id).style.display='inline';
  document.getElementById('sp-inp-'+id).style.display='none';
  document.getElementById('sp-edit-'+id).style.display='inline-flex';
  document.getElementById('sp-save-'+id).style.display='none';
}
async function sauverPrixStock(id){
  const val=+document.getElementById('sp-inp-'+id).value||0;
  const{error}=await SB.from('gp_ingredients').update({prix_actuel:val}).eq('id',id);
  if(error){notify('Erreur: '+error.message,'r');return;}
  const ingr=GP_INGREDIENTS.find(i=>i.id===id);
  if(ingr)ingr.prix_actuel=val;
  document.getElementById('sp-val-'+id).textContent=fmt(val)+' F';
  annulerPrixStock(id);
  notify('Prix mis à jour ✓','gold');
}
async function renderMouvements(){
  const filtType=document.getElementById('mp-filtre-type')?.value||'';
  const filtMois=document.getElementById('mp-filtre-mois')?.value||'';
  let q=SB.from('gp_stock_mp').select('*').eq('admin_id',GP_ADMIN_ID).order('date',{ascending:false}).limit(100);
  if(filtType)q=q.eq('type',filtType);
  if(filtMois)q=q.gte('date',filtMois+'-01').lte('date',filtMoisfinMois(mois));
  const{data}=await q;
  const M=data||[];
  document.getElementById('mouvements-liste').innerHTML=M.length?`<table class="tbl"><thead><tr><th>Date</th><th>Type</th><th>Ingrédient</th><th class="num">Qté (kg)</th>${GP_ROLE==='admin'?'<th class="num">Prix/kg</th>':''}<th>Réf/Lot</th></tr></thead><tbody>
    ${M.map(m=>`<tr>
      <td style="font-family:'DM Mono',monospace;font-size:10px">${m.date}</td>
      <td><span class="badge ${m.type==='entree'?'bdg-g':m.type==='sortie_production'?'bdg-b':'bdg-r'}">${m.type==='entree'?'📥 Entrée':m.type==='sortie_production'?'🏭 Production':'📤 Sortie'}</span></td>
      <td style="font-weight:600">${m.ingredient_nom}</td>
      <td class="num" style="color:${m.type==='entree'?'var(--green)':'var(--red)'}">${m.type==='entree'?'+':'−'}${fmtKg(m.quantite)}</td>
      ${GP_ROLE==='admin'?`<td class="num" style="color:var(--textm)">${fmt(m.prix_unit)} F</td>`:''}
      <td style="font-size:10px;color:var(--textm)">${m.ref||m.note||'—'}</td>
    </tr>`).join('')}
    </tbody></table>`:'<div style="color:var(--textm);font-size:12px;padding:10px">Aucun mouvement.</div>';
}
function onMPChange(){
  // Géré par selectionnerMPStock() désormais
}
async function saveMPEntree(){
  const ingrId=document.getElementById('mp_ingr').value;
  const qte=+document.getElementById('mp_qte').value||0;
  const prix=+document.getElementById('mp_prix').value||0;
  const date=document.getElementById('mp_date').value;
  const err=document.getElementById('mp_err');
  if(!ingrId||!qte||!date){err.textContent='Ingrédient, quantité et date requis.';return;}
  const ingr=GP_INGREDIENTS.find(i=>i.id===ingrId);
  if(!ingr){err.textContent='Ingrédient introuvable.';return;}
  err.textContent='Enregistrement...';
  const{error}=await SB.from('gp_stock_mp').insert({
    admin_id:GP_ADMIN_ID,saisi_par:GP_USER.id,type:'entree',date,
    ingredient_id:ingrId,ingredient_nom:ingr.nom,quantite:qte,prix_unit:prix,
    ref:document.getElementById('mp_fourn').value+' — '+document.getElementById('mp_ref').value
  });
  if(error){err.textContent='Erreur: '+error.message;return;}
  // Update ingredient price
  if(prix>0)await SB.from('gp_ingredients').update({prix_actuel:prix}).eq('id',ingrId);
  err.textContent='';
  ['mp_qte','mp_prix','mp_fourn','mp_ref'].forEach(id=>document.getElementById(id).value='');
  effacerSelectionMP();
  notify('Réception enregistrée ✓ — Stock mis à jour','gold');
  renderStockNiveaux();renderMouvements();
}
// ── NOUVELLE MP DEPUIS PAGE STOCK ─────────────────
function toggleNouvelleMP(){
  const form = document.getElementById('nouvelle-mp-form');
  form.style.display = form.style.display === 'none' ? 'block' : 'none';
  if(form.style.display === 'block'){
    document.getElementById('nmp_nom').focus();
  }
}

async function saveNouvelleMP(){
  const nom = document.getElementById('nmp_nom').value.trim();
  const prix = +document.getElementById('nmp_prix').value || 0;
  const seuil = +document.getElementById('nmp_seuil').value || 200;
  const prot = +document.getElementById('nmp_prot').value || null;
  const em = +document.getElementById('nmp_em').value || null;
  const fourn = document.getElementById('nmp_fourn').value.trim() || null;
  const err = document.getElementById('nmp_err');

  if(!nom){ err.textContent = 'Nom requis.'; return; }
  err.textContent = '';

  const{data, error} = await SB.from('gp_ingredients').insert({
    admin_id: GP_ADMIN_ID, nom, prix_actuel: prix,
    unite: 'kg', proteines: prot, energie: em,
    seuil_alerte: seuil, fournisseur: fourn
  }).select().maybeSingle();

  if(error){ err.textContent = 'Erreur: ' + error.message; return; }

  // Recharger et sélectionner la nouvelle MP
  await loadIngredients();
  populateSelects();

  // Fermer le formulaire
  document.getElementById('nouvelle-mp-form').style.display = 'none';
  ['nmp_nom','nmp_prix','nmp_prot','nmp_em','nmp_fourn'].forEach(id => {
    const el = document.getElementById(id);
    if(el) el.value = '';
  });
  document.getElementById('nmp_seuil').value = '200';

  // Sélectionner la nouvelle MP dans le select
  const sel = document.getElementById('mp_ingr');
  if(sel && data){
    for(let i = 0; i < sel.options.length; i++){
      if(sel.options[i].value === data.id){
        sel.selectedIndex = i;
        onMPChange();
        break;
      }
    }
  }

  notify('Matière première "' + nom + '" ajoutée ✓', 'gold');
}

// ── FILTRE STOCK ─────────────────────────────────
let stockNiveauxCache = {};

function filtrerStock(){
  const search = document.getElementById('stock-search')?.value.toLowerCase() || '';
  const rows = document.querySelectorAll('#stock-niveaux .stock-row');
  rows.forEach(row => {
    const nom = row.dataset.nom?.toLowerCase() || '';
    row.style.display = nom.includes(search) ? '' : 'none';
  });
}

// ── NOTIFICATION WHATSAPP STOCK BAS ───────────────
async function verifierAlerteStock(){
  const{data:S}=await SB.from('gp_stock_mp').select('*').eq('admin_id',GP_ADMIN_ID);
  if(!S)return;
  window._stockNiveaux=S;
  const niveaux=calcNiveaux(S);
  const alertes=[];
  Object.entries(niveaux).forEach(([nom,qte])=>{
    const ingr=GP_INGREDIENTS.find(i=>i.nom===nom);
    const seuil=ingr?.seuil_alerte||200;
    if(qte<=0) alertes.push({nom,qte:0,statut:'ÉPUISÉ 🔴'});
    else if(qte<seuil) alertes.push({nom,qte:qte.toFixed(1),statut:'BAS 🟡'});
  });
  if(alertes.length===0){
    notify('✓ Tous les stocks sont OK','gold');
    return;
  }
  const cfg=GP_CONFIG||{};
  // Utiliser le numéro d'alerte dédié, sinon le numéro principal
  const telAlerte=(cfg.tel_alerte_stock||cfg.telephone||'').replace(/[\s\-\+]/g,'').replace(/^00/,'').replace(/^228/,'');
  const destAff=cfg.tel_alerte_stock||cfg.telephone||'ton numéro';
  const lignes=alertes.map(a=>`• ${a.nom} : ${a.qte} kg — ${a.statut}`).join('\n');
  const msg=encodeURIComponent(
    `⚠️ *Alerte Stock — ${cfg.nom_provenderie||'Provenderie'}*\n`+
    `📅 ${new Date().toLocaleDateString('fr-FR')} à ${new Date().toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'})}\n\n`+
    `${alertes.length} matière(s) en alerte :\n\n${lignes}\n\n`+
    `_Connectez-vous sur GP pour réapprovisionner._`
  );
  notify(`📲 Envoi alerte à ${destAff}...`,'gold');
  window.open(`https://wa.me/228${telAlerte}?text=${msg}`,'_blank');
}

// ── CALLMEBOT — ALERTES AUTOMATIQUES ─────────────
async function envoyerAlerteCallMeBot(alertes){
  const cfg = GP_CONFIG || {};
  const apikey = cfg.callmebot_apikey || '';
  const tel = (cfg.tel_alerte_stock || cfg.telephone || '').replace(/[\s\-\+]/g,'').replace(/^00/,'').replace(/^228/,'');

  if(!apikey || !tel){
    console.log('CallMeBot: clé API ou téléphone manquant');
    return false;
  }

  const lignes = alertes.map(a => `• ${a.nom}: ${a.qte} kg — ${a.statut}`).join('%0A');
  const msg = encodeURIComponent(
    `⚠️ Alerte Stock — ${cfg.nom_provenderie||'Provenderie'}\n`+
    `${new Date().toLocaleDateString('fr-FR')} ${new Date().toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'})}\n\n`+
    `${alertes.length} matière(s) critique(s) :\n`
  ) + lignes;

  const url = `https://api.callmebot.com/whatsapp.php?phone=228${tel}&text=${msg}&apikey=${apikey}`;

  try{
    const res = await fetch(url);
    const txt = await res.text();
    if(txt.includes('Message Sent') || txt.includes('queued')){
      return true;
    }
    console.warn('CallMeBot response:', txt);
    return false;
  } catch(e){
    console.warn('CallMeBot error:', e);
    return false;
  }
}

// Vérification automatique au chargement du logiciel
async function autoVerifierStockAlerte(){
  if(GP_ROLE !== 'admin') return;
  const cfg = GP_CONFIG || {};
  if(!cfg.callmebot_apikey) return; // Pas configuré

  // Vérifier seulement si la dernière alerte date de plus de 6 heures
  const lastAlerte = localStorage.getItem('gp_last_stock_alerte');
  if(lastAlerte){
    const diff = Date.now() - parseInt(lastAlerte);
    if(diff < 6 * 60 * 60 * 1000) return; // Moins de 6h
  }

  const{data:S} = await SB.from('gp_stock_mp').select('*').eq('admin_id',GP_ADMIN_ID);
  if(!S) return;
  const niveaux = calcNiveaux(S);
  const alertes = [];
  Object.entries(niveaux).forEach(([nom,qte])=>{
    const ingr = GP_INGREDIENTS.find(i=>i.nom===nom);
    const seuil = ingr?.seuil_alerte||200;
    if(qte<=0) alertes.push({nom,qte:0,statut:'ÉPUISÉ 🔴'});
    else if(qte<seuil) alertes.push({nom,qte:qte.toFixed(1),statut:'BAS 🟡'});
  });

  if(alertes.length === 0) return;

  const ok = await envoyerAlerteCallMeBot(alertes);
  if(ok){
    localStorage.setItem('gp_last_stock_alerte', Date.now().toString());
    notify(`📲 Alerte stock envoyée automatiquement (${alertes.length} MP)`, 'gold');
  }
}
