// ── CLIENTS ────────────────────────────────────────
async function saveClient(){
  const nom=document.getElementById('cl_nom').value.trim();
  const err=document.getElementById('cl_err');
  if(!nom){err.textContent='Nom requis.';return;}
  const{error}=await SB.from('gp_clients').insert({
    admin_id:GP_ADMIN_ID,nom,
    point_vente:(GP_ROLE==='admin' ? null : (GP_POINT_VENTE||'Production')),
    telephone:document.getElementById('cl_tel').value.trim()||null,
    localisation:document.getElementById('cl_loc').value.trim()||null,
    type_elevage:document.getElementById('cl_type').value,
    note:document.getElementById('cl_note').value.trim()||null
  });
  if(error){err.textContent='Erreur: '+error.message;return;}
  ['cl_nom','cl_tel','cl_loc','cl_note'].forEach(id=>document.getElementById(id).value='');
  err.textContent='';
  await loadClients();populateSelects();renderClients();
  notify('Client ajouté ✓');
}

// ── RÉGULARITÉ CLIENT (calculée depuis l'historique des ventes) ──
let GP_CLIENT_STATS = null;
async function loadClientStats(force){
  if(GP_CLIENT_STATS && !force) return GP_CLIENT_STATS;
  const{data}=await SB.from('gp_ventes')
    .select('client_id,date,formule_nom,montant_total')
    .eq('admin_id',GP_ADMIN_ID).is('deleted_at',null).not('client_id','is',null);
  const map={};
  (data||[]).forEach(v=>{
    if(!v.client_id)return;
    const s=map[v.client_id]=map[v.client_id]||{dates:[],formules:{},totalCA:0};
    if(v.date)s.dates.push(v.date);
    if(v.formule_nom)s.formules[v.formule_nom]=(s.formules[v.formule_nom]||0)+1;
    s.totalCA+=Number(v.montant_total||0);
  });
  Object.values(map).forEach(s=>{
    const ds=[...new Set(s.dates)].sort();           // jours distincts = visites
    s.nbAchats=ds.length;
    s.premier=ds[0]||null;
    s.dernier=ds[ds.length-1]||null;
    s.freqMoyenne=ds.length>=2
      ? Math.max(1,Math.round((new Date(ds[ds.length-1])-new Date(ds[0]))/86400000/(ds.length-1)))
      : null;
    const fe=Object.entries(s.formules).sort((a,b)=>b[1]-a[1]);
    s.produitHabituel=fe.length?fe[0][0]:null;
  });
  GP_CLIENT_STATS=map;
  return map;
}

// Statut auto : 🟢 Régulier · 🟠 En retard · 🔴 Perdu · ⚪ Nouveau
function clientStatut(s){
  if(!s||!s.nbAchats) return {key:'aucun',label:'—',color:'var(--textm)',emoji:'⚪',jours:null};
  if(s.nbAchats===1)  return {key:'nouveau',label:'Nouveau',color:'var(--textm)',emoji:'⚪',jours:null};
  const jours=Math.floor((Date.now()-new Date(s.dernier))/86400000);
  const f=s.freqMoyenne||30;
  if(jours>60 || jours>2*f) return {key:'perdu',label:'Perdu',color:'var(--red)',emoji:'🔴',jours};
  if(jours>f*1.5)           return {key:'retard',label:'En retard',color:'var(--gold)',emoji:'🟠',jours};
  return {key:'regulier',label:'Régulier',color:'var(--green)',emoji:'🟢',jours};
}

// ── ÉDITION CLIENT ─────────────────────────────────
function openEditClient(id){
  const c=GP_CLIENTS.find(x=>x.id===id); if(!c)return;
  document.getElementById('ecl_id').value=c.id;
  document.getElementById('ecl_nom').value=c.nom||'';
  document.getElementById('ecl_tel').value=c.telephone||'';
  document.getElementById('ecl_loc').value=c.localisation||c.localite||'';
  document.getElementById('ecl_type').value=c.type_elevage||'autre';
  document.getElementById('ecl_typeclient').value=c.type_client||'detail';
  document.getElementById('ecl_note').value=c.note||'';
  document.getElementById('ecl_err').textContent='';
  document.getElementById('modal-edit-client').style.display='flex';
}
function closeEditClient(){ document.getElementById('modal-edit-client').style.display='none'; }

// ── FUSION DE DOUBLONS CLIENTS ─────────────────────
function openFusion(){
  const opts=(GP_CLIENTS||[]).slice().sort((a,b)=>(a.nom||'').localeCompare(b.nom||''))
    .map(c=>`<option value="${c.id}">${(c.nom||'—').replace(/</g,'&lt;')}${c.telephone?' · '+c.telephone:' · (sans n°)'}</option>`).join('');
  document.getElementById('fus-garde').innerHTML='<option value="">— Fiche à GARDER —</option>'+opts;
  document.getElementById('fus-doublon').innerHTML='<option value="">— Doublon à fusionner —</option>'+opts;
  document.getElementById('fus-err').textContent='';
  document.getElementById('modal-fusion').style.display='flex';
}
function closeFusion(){ document.getElementById('modal-fusion').style.display='none'; }
async function saveFusion(){
  const garde=document.getElementById('fus-garde').value;
  const doublon=document.getElementById('fus-doublon').value;
  const err=document.getElementById('fus-err');
  if(!garde||!doublon){ err.textContent='Choisis les deux fiches.'; return; }
  if(garde===doublon){ err.textContent='Choisis deux fiches différentes.'; return; }
  const gNom=GP_CLIENTS.find(c=>c.id===garde)?.nom||'?';
  const dNom=GP_CLIENTS.find(c=>c.id===doublon)?.nom||'?';
  if(!confirm(`Fusionner « ${dNom} » dans « ${gNom} » ?\n\nToutes les ventes/relances du doublon iront sur la fiche gardée, le n° manquant sera récupéré, et le doublon sera supprimé.\nIrréversible.`)) return;
  err.textContent='Fusion…';
  const{data,error}=await SB.rpc('fusionner_clients',{p_garde:garde,p_doublon:doublon});
  if(error){ err.textContent='Erreur: '+error.message; return; }
  if(data&&data.error){ err.textContent='⚠ '+data.error; return; }
  closeFusion();
  GP_CLIENT_STATS=null;
  await loadClients(); populateSelects(); renderClients();
  notify('Fusion effectuée ✓');
}
async function saveClientEdit(){
  const id=document.getElementById('ecl_id').value;
  const nom=document.getElementById('ecl_nom').value.trim();
  const err=document.getElementById('ecl_err');
  if(!nom){err.textContent='Nom requis.';return;}
  const{error}=await SB.from('gp_clients').update({
    nom,
    telephone:document.getElementById('ecl_tel').value.trim()||null,
    localisation:document.getElementById('ecl_loc').value.trim()||null,
    type_elevage:document.getElementById('ecl_type').value,
    type_client:document.getElementById('ecl_typeclient').value,
    note:document.getElementById('ecl_note').value.trim()||null
  }).eq('id',id).eq('admin_id',GP_ADMIN_ID);
  if(error){err.textContent='Erreur: '+error.message;return;}
  closeEditClient();
  await loadClients();populateSelects();renderClients();
  notify('Client modifié ✓');
}

// ── FICHE CLIENT DÉTAILLÉE ─────────────────────────
async function openClientDetail(id){
  const c=GP_CLIENTS.find(x=>x.id===id); if(!c)return;
  await loadClientStats();
  const s=GP_CLIENT_STATS[id]||{};
  const st=clientStatut(s);
  const jours=s.dernier?Math.floor((Date.now()-new Date(s.dernier))/86400000):null;

  const{data:V}=await SB.from('gp_ventes')
    .select('date,formule_nom,quantite,montant_total,montant_paye,statut_paiement')
    .eq('admin_id',GP_ADMIN_ID).eq('client_id',id).is('deleted_at',null)
    .order('date',{ascending:false}).limit(50);
  const hist=(V||[]).length?`<table class="tbl" style="font-size:11px"><thead><tr>
      <th>Date</th><th>Formule</th><th class="num">Qté</th><th class="num">Montant</th><th></th>
    </tr></thead><tbody>${(V||[]).map(v=>`<tr>
      <td style="font-size:10px">${fmtDate?fmtDate(v.date):v.date}</td>
      <td style="font-size:10px">${v.formule_nom||'—'}</td>
      <td class="num">${v.quantite?fmtKg(v.quantite)+' kg':'—'}</td>
      <td class="num">${fmt(v.montant_total||0)} F</td>
      <td><span class="badge ${v.statut_paiement==='paye'?'bdg-g':v.statut_paiement==='partiel'?'bdg-gold':'bdg-r'}" style="font-size:8px">${v.statut_paiement||'—'}</span></td>
    </tr>`).join('')}</tbody></table>`
    :'<div style="color:var(--textm);font-size:12px">Aucun achat enregistré.</div>';

  const telClean=c.telephone?String(c.telephone).replace(/\s/g,''):'';
  document.getElementById('cd-content').innerHTML=`
    <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px;margin-bottom:12px">
      <div style="min-width:0">
        <div style="font-weight:800;font-size:16px">${c.nom} <span style="font-size:11px;color:${st.color}">${st.emoji} ${st.label}</span></div>
        <div style="font-size:11px;color:var(--textm);margin-top:3px">📞 ${c.telephone||'—'}${(c.localisation||c.localite)?' · 📍 '+(c.localisation||c.localite):''}</div>
      </div>
      <button class="btn btn-out btn-sm" onclick="openEditClient('${c.id}')">✏️ Modifier</button>
    </div>
    <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:8px;margin-bottom:12px">
      <div class="econo-box"><div class="econo-val" style="color:var(--gold)">${fmt((s.totalCA)||c.total_achats||0)}</div><div class="econo-lbl">CA total (F)</div></div>
      <div class="econo-box"><div class="econo-val">${s.nbAchats||0}</div><div class="econo-lbl">Achats</div></div>
      <div class="econo-box"><div class="econo-val">${s.freqMoyenne?s.freqMoyenne+' j':'—'}</div><div class="econo-lbl">Fréquence moy.</div></div>
      <div class="econo-box"><div class="econo-val" style="color:${st.color}">${jours!=null?jours+' j':'—'}</div><div class="econo-lbl">Depuis dernier achat</div></div>
    </div>
    ${s.produitHabituel?`<div style="font-size:12px;margin-bottom:10px">🌾 Produit habituel : <b>${s.produitHabituel}</b></div>`:''}
    <div style="display:flex;gap:8px;margin-bottom:14px">
      <button class="btn btn-g btn-sm" style="flex:1;justify-content:center" onclick="closeClientDetail();ouvrirModalWA('${c.id}')">📲 Relancer</button>
      ${telClean?`<a class="btn btn-out btn-sm" style="flex:1;justify-content:center" href="tel:${telClean}">📞 Appeler</a>`:''}
    </div>
    <div style="font-weight:700;font-size:12px;margin-bottom:6px">🧾 Historique des achats</div>
    <div style="max-height:240px;overflow:auto">${hist}</div>`;
  document.getElementById('modal-client-detail').style.display='flex';
}
function closeClientDetail(){ document.getElementById('modal-client-detail').style.display='none'; }

// Relance rédigée par l'IA (marketing) → ouvre la modale WhatsApp pré-remplie
async function redigerRelanceIA(id){
  const c=GP_CLIENTS.find(x=>x.id===id); if(!c)return;
  if(typeof iaGenerate!=='function'){ notify('Assistant IA indisponible','r'); return; }
  await loadClientStats();
  const s=GP_CLIENT_STATS[id]||{};
  const jours=s.dernier?Math.floor((Date.now()-new Date(s.dernier))/86400000):'?';
  notify('✍️ Rédaction du message…','gold');
  try{
    const q=`Rédige UNIQUEMENT un message WhatsApp court, chaleureux et personnalisé pour relancer le client "${c.nom}" qui n'a pas acheté depuis ${jours} jours${s.produitHabituel?` (son aliment habituel : ${s.produitHabituel})`:''}. Objectif : le faire revenir acheter chez SADARI. Termine par la signature SADARI. Donne seulement le message, sans commentaire.`;
    const txt=await iaGenerate('marketing', q, 'eco');
    if(typeof ouvrirModalWA==='function'){
      ouvrirModalWA(id);
      setTimeout(()=>{ const ta=document.getElementById('wa-preview'); if(ta) ta.value=txt; }, 60);
    } else { alert(txt); }
  }catch(e){ notify('Échec rédaction IA : '+(e.message||e),'r'); }
}

async function renderClients(){
  const search=document.getElementById('cl-search')?.value.toLowerCase()||'';
  let filtered=GP_CLIENTS.filter(c=>c.nom.toLowerCase().includes(search)||(c.telephone||'').includes(search));
  // Cloisonnement : un PDV (hors admin/principal) ne voit que SES clients (+ clients sans PDV)
  if(GP_ROLE!=='admin' && !GP_EST_PRINCIPAL){
    const mine=GP_POINT_VENTE||null;
    filtered=filtered.filter(c=> !c.point_vente || c.point_vente===mine);
  }

  // Charger les ventes impayées/partielles pour calculer les dettes
  const mois=new Date().toISOString().slice(0,7);
  const{data:vImpayees}=await SB.from('gp_ventes').select('client_id,montant_total,montant_paye,statut_paiement,date,formule_nom')
    .eq('admin_id',GP_ADMIN_ID).is('deleted_at',null).in('statut_paiement',['impaye','partiel']);

  // Calculer dette par client
  const dettes={};
  (vImpayees||[]).forEach(v=>{
    if(!v.client_id)return;
    if(!dettes[v.client_id])dettes[v.client_id]={total:0,ventes:[]};
    const reste=Number(v.montant_total||0)-Number(v.montant_paye||0);
    dettes[v.client_id].total+=reste;
    dettes[v.client_id].ventes.push(v);
  });

  await loadClientStats(true);

  document.getElementById('clients-liste').innerHTML=filtered.length?`
    <table class="tbl"><thead><tr>
      <th>Nom & Contact</th><th>Type</th>
      <th class="num">CA total</th>
      <th class="num" style="color:var(--red)">Dette</th>
      <th></th>
    </tr></thead><tbody>
    ${filtered.map(c=>{
      const dette=dettes[c.id];
      const montantDu=dette?.total||0;
      const s=GP_CLIENT_STATS?.[c.id];
      const st=clientStatut(s);
      const dernierTxt=(s&&s.dernier)?' · 🛒 '+(st.jours!=null?'il y a '+st.jours+' j':fmtDate(s.dernier)):'';
      return`<tr style="cursor:pointer" onclick="openClientDetail('${c.id}')">
        <td>
          <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
            <span style="font-weight:700">${c.nom}</span>
            <span style="font-size:9px;font-weight:700;color:${st.color}">${st.emoji} ${st.label}</span>
            ${montantDu>0?`<span class="badge bdg-r" style="font-size:9px">⚠ ${fmt(montantDu)} F</span>`:''}
            ${c.point_vente && (GP_ROLE==='admin'||GP_EST_PRINCIPAL||c.point_vente!==GP_POINT_VENTE)?`<span class="badge bdg-b" style="font-size:8px">📍 ${c.point_vente}</span>`:''}
          </div>
          <div style="font-size:10px;color:var(--textm)">
            ${c.telephone?'📞 '+c.telephone:''}
            ${c.nom_ferme?' · 🏠 '+c.nom_ferme:''}
            ${c.localite?' · 📍 '+c.localite:''}${dernierTxt}
          </div>
        </td>
        <td>
          <span class="badge bdg-b" style="font-size:9px">${c.type_client==='gros'?'Grossiste':'Détaillant'}</span>
          ${Number(c.points_fidelite)>0?`<span class="badge bdg-gold" style="font-size:9px;margin-left:3px">🎁 ${c.points_fidelite} pts</span>`:''}
        </td>
        <td class="num" style="color:var(--gold)">${fmt((GP_CLIENT_STATS?.[c.id]?.totalCA)||c.total_achats||0)} F</td>
        <td class="num" style="color:${montantDu>0?'var(--red)':'var(--green)'}">
          ${montantDu>0?fmt(montantDu)+' F':'✅'}
        </td>
        <td style="white-space:nowrap" onclick="event.stopPropagation()">
          ${montantDu>0?`
            <button class="btn btn-g btn-sm" onclick="ouvrirPayerDette('${c.id}','${c.nom.replace(/'/g,"\\'").replace(/"/g,'&quot;')}',${montantDu})" title="Solder la dette">💳</button>
            <button class="btn btn-out btn-sm" onclick="envoyerRappelDette('${c.id}')" title="Envoyer rappel WhatsApp" style="color:#25D366;border-color:rgba(37,211,102,.3)">📲</button>
          `:''}
          <button class="btn btn-out btn-sm" onclick="openEditClient('${c.id}')" title="Modifier le client">✏️</button>
          <button class="btn btn-out btn-sm" onclick="ouvrirCarteClient('${c.id}')" title="Carte de fidélité" style="color:var(--gold);border-color:rgba(232,197,71,.4)">🪪</button>
          ${Number(c.points_fidelite)>0?`<button class="btn btn-out btn-sm" onclick="ouvrirEchangePoints('${c.id}')" title="Échanger les points (${c.points_fidelite} pts)" style="color:var(--gold);border-color:rgba(232,197,71,.4)">🎁</button>`:''}
          ${c.qr_token?`<button class="btn btn-out btn-sm" onclick="regenererQRClient('${c.id}')" title="Régénérer la carte (perte)" style="color:var(--textm);font-size:10px">↺</button>`:''}
          <button class="btn btn-red btn-sm" onclick="deleteClient('${c.id}')">✕</button>
        </td>
      </tr>`;
    }).join('')}
    </tbody></table>`
  :'<div style="color:var(--textm);font-size:12px">Aucun client.</div>';
}
// ══════════════════════════════════════════════════
// FIDÉLITÉ — Catalogue de récompenses + échange de points
// ══════════════════════════════════════════════════
let GP_RECOMPENSES = [];

// Charge les récompenses ; auto-crée les 3 paliers par défaut si aucun (admin only)
async function loadRecompenses(){
  let{data}=await SB.from('gp_fidelite_recompenses').select('*')
    .eq('admin_id',GP_ADMIN_ID).eq('actif',true).order('points_requis');
  let recs=data||[];
  if(GP_ROLE==='admin' && recs.length===0){
    const defauts=[
      {nom:'1 sac aliment Lapin OU 7 500 F', points_requis:100, valeur_reduction:7500, objet_fixe:null, description:'Sac de lapin offert ou bon de 7 500 F'},
      {nom:'T-shirt + (1 sac Lapin OU 7 500 F)', points_requis:300, valeur_reduction:7500, objet_fixe:'T-shirt', description:'T-shirt + sac (ou bon 7 500 F)'},
      {nom:'T-shirt + gadgets + (2 sacs OU 15 000 F)', points_requis:600, valeur_reduction:15000, objet_fixe:'T-shirt + gadgets', description:'T-shirt + gadgets + 2 sacs (ou bon 15 000 F)'}
    ];
    try{
      const{data:ins}=await SB.from('gp_fidelite_recompenses')
        .insert(defauts.map(d=>({admin_id:GP_ADMIN_ID,...d}))).select();
      if(ins) recs=ins.sort((a,b)=>a.points_requis-b.points_requis);
    }catch(e){}
  }
  GP_RECOMPENSES=recs;
  return recs;
}

async function ouvrirEchangePoints(clientId){
  const client=GP_CLIENTS.find(c=>c.id===clientId);
  if(!client){notify('Client introuvable','r');return;}
  const modal=document.getElementById('modal-echange-points');
  if(!modal)return;
  modal.style.display='flex';
  document.getElementById('ep-client-id').value=clientId;
  document.getElementById('ep-client-nom').textContent=client.nom||'';
  const pts=Number(client.points_fidelite)||0;
  document.getElementById('ep-points').textContent=pts+' pts';
  document.getElementById('ep-liste').innerHTML='<div style="color:var(--textm);font-size:12px;padding:16px">⏳ Chargement…</div>';
  await loadRecompenses();
  if(!GP_RECOMPENSES.length){
    document.getElementById('ep-liste').innerHTML='<div style="color:var(--textm);font-size:12px;padding:16px">Aucune récompense configurée.</div>';
    return;
  }
  document.getElementById('ep-liste').innerHTML=GP_RECOMPENSES.map(r=>{
    const ok=pts>=r.points_requis;
    const aReduction=Number(r.valeur_reduction)>0;
    let actions;
    if(!ok){
      actions=`<span style="font-size:10px;color:var(--textm);white-space:nowrap">manque ${r.points_requis-pts} pts</span>`;
    } else if(aReduction){
      actions=`<div style="display:flex;flex-direction:column;gap:4px">
        <button class="btn btn-out btn-sm" onclick="echangerRecompense('${r.id}','objet')" title="Remettre le sac/objet physiquement">🎁 Donner</button>
        <button class="btn btn-g btn-sm" onclick="echangerRecompense('${r.id}','reduction')" title="Créditer une réduction sur sa prochaine vente">💵 ${fmt(r.valeur_reduction)} F</button>
      </div>`;
    } else {
      actions=`<button class="btn btn-g btn-sm" onclick="echangerRecompense('${r.id}','objet')">Échanger</button>`;
    }
    return `<div style="display:flex;justify-content:space-between;align-items:center;gap:10px;padding:12px;border-radius:10px;margin-bottom:8px;background:var(--card);border:1px solid ${ok?'rgba(232,197,71,.4)':'var(--border)'};opacity:${ok?1:.55}">
      <div style="flex:1;min-width:0">
        <div style="font-weight:700;font-size:13px;color:var(--text)">🎁 ${r.nom}</div>
        <div style="font-size:10px;color:var(--textm)">${r.description||''}</div>
        <div style="font-size:11px;color:var(--gold);font-weight:700;margin-top:2px">${r.points_requis} points</div>
      </div>
      ${actions}
    </div>`;
  }).join('');
}

function fermerEchangePoints(){
  const m=document.getElementById('modal-echange-points');
  if(m)m.style.display='none';
}

async function echangerRecompense(recompenseId, mode){
  const clientId=document.getElementById('ep-client-id').value;
  const client=GP_CLIENTS.find(c=>c.id===clientId);
  const rec=GP_RECOMPENSES.find(r=>r.id===recompenseId);
  if(!client||!rec)return;
  const pts=Number(client.points_fidelite)||0;
  if(pts<rec.points_requis){notify('Points insuffisants','r');return;}

  const valeur=Number(rec.valeur_reduction)||0;
  const enReduction = (mode==='reduction' && valeur>0);
  const objet=rec.objet_fixe?(' + '+rec.objet_fixe):'';
  // Libellé clair selon le mode choisi
  const detail = enReduction
    ? `💵 Bon de ${fmt(valeur)} F${objet} (crédité sur sa prochaine vente)`
    : `🎁 ${rec.nom} (remis physiquement)`;
  if(!confirm(`Confirmer l'échange ?\n\n${client.nom} échange ${rec.points_requis} points contre :\n${detail}\n\nSolde points après : ${pts-rec.points_requis}`))return;

  const nouveauSoldePts=pts-rec.points_requis;
  try{
    // Journal points (déduction)
    await SB.from('gp_fidelite_mouvements').insert({
      admin_id:GP_ADMIN_ID, client_id:clientId,
      points:-rec.points_requis, type:'cadeau',
      description: enReduction ? `Bon ${fmt(valeur)} F${objet}` : rec.nom
    });
    const maj={ points_fidelite:nouveauSoldePts };
    // Si réduction : créditer le compte (cumulable)
    if(enReduction){
      const creditAvant=Number(client.credit_fidelite)||0;
      maj.credit_fidelite=creditAvant+valeur;
    }
    await SB.from('gp_clients').update(maj).eq('id',clientId).eq('admin_id',GP_ADMIN_ID);
    const ci=GP_CLIENTS.findIndex(c=>c.id===clientId);
    if(ci>=0){
      GP_CLIENTS[ci].points_fidelite=nouveauSoldePts;
      if(enReduction) GP_CLIENTS[ci].credit_fidelite=(Number(client.credit_fidelite)||0)+valeur;
    }
  }catch(e){notify('Erreur échange: '+(e.message||e),'r');return;}
  notify(enReduction
    ? `💵 Bon de ${fmt(valeur)} F crédité (−${rec.points_requis} pts)`
    : `🎁 Cadeau remis : ${rec.nom} (−${rec.points_requis} pts)`, 'gold');
  fermerEchangePoints();
  renderClients();
}

async function deleteClient(id){
  if(!confirm('Supprimer ce client ?'))return;
  await SB.from('gp_clients').delete().eq('id',id);
  await loadClients();populateSelects();renderClients();notify('Client supprimé','r');
}

// ── SUIVI & APPELS ─────────────────────────────────
async function renderSuivi(){
  await loadClientStats(true);
  const seg={retard:[],perdu:[]};
  GP_CLIENTS.forEach(c=>{
    const s=GP_CLIENT_STATS[c.id]; if(!s||!s.nbAchats)return;
    const st=clientStatut(s);
    if(st.key==='retard') seg.retard.push({c,st,s});
    else if(st.key==='perdu') seg.perdu.push({c,st,s});
  });
  seg.retard.sort((a,b)=>b.st.jours-a.st.jours);
  seg.perdu.sort((a,b)=>b.st.jours-a.st.jours);

  const ligne=(c,st,s)=>`<div style="padding:10px;background:rgba(239,68,68,${st.key==='perdu'?'.08':'.05'});border:1px solid rgba(239,68,68,.2);border-radius:8px;margin-bottom:8px">
    <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px">
      <div style="min-width:0;cursor:pointer" onclick="openClientDetail('${c.id}')">
        <div style="font-weight:700;color:var(--text)">${c.nom} <span style="font-size:9px;color:${st.color}">${st.emoji} ${st.label}</span></div>
        <div style="font-size:10px;color:var(--textm);margin-top:2px">📞 ${c.telephone||'—'} · Dernier achat il y a <b style="color:var(--red)">${st.jours} j</b>${s.freqMoyenne?' (habituel : '+s.freqMoyenne+' j)':''}</div>
      </div>
      <div style="display:flex;gap:5px;flex-shrink:0">
        <button class="btn btn-out btn-sm" onclick="event.stopPropagation();preFillAppel('${c.id}')" title="Enregistrer un appel">📞</button>
        <button class="btn btn-out btn-sm" onclick="event.stopPropagation();redigerRelanceIA('${c.id}')" title="Rédiger la relance (IA)">✍️</button>
        <button class="btn btn-g btn-sm" onclick="event.stopPropagation();ouvrirModalWA('${c.id}')" title="Relancer (WhatsApp)">📲</button>
      </div>
    </div>
  </div>`;

  const html=
    (seg.retard.length?`<div style="font-size:11px;font-weight:700;color:var(--gold);margin:4px 0 6px">🟠 En retard (${seg.retard.length})</div>`+seg.retard.map(x=>ligne(x.c,x.st,x.s)).join(''):'')+
    (seg.perdu.length?`<div style="font-size:11px;font-weight:700;color:var(--red);margin:10px 0 6px">🔴 Perdus / à reconquérir (${seg.perdu.length})</div>`+seg.perdu.map(x=>ligne(x.c,x.st,x.s)).join(''):'');
  document.getElementById('clients-relance').innerHTML=html||'<div style="color:var(--green);font-size:12px">✅ Tous tes clients actifs sont dans leur fréquence habituelle.</div>';

  SB.from('gp_appels').select('*').eq('admin_id',GP_ADMIN_ID).order('date_appel',{ascending:false}).limit(30).then(({data})=>{
    const A=data||[];
    document.getElementById('appels-liste').innerHTML=A.length?`
      <div style="overflow-x:auto"><table class="tbl"><thead><tr><th>Date</th><th>Client</th><th>Résultat</th><th>Note</th><th>Observation</th><th></th></tr></thead><tbody>
      ${A.map(a=>`<tr>
        <td style="font-size:10px;font-family:'DM Mono',monospace">${new Date(a.date_appel).toLocaleDateString('fr-FR')}</td>
        <td style="font-weight:600">${a.client_nom||'—'}</td>
        <td><span class="badge ${a.resultat==='interesse'||a.resultat==='commande_passee'?'bdg-g':a.resultat==='pas_repondu'||a.resultat==='bientot'?'bdg-gold':'bdg-r'}" style="font-size:9px">${a.resultat||'—'}</span></td>
        <td style="font-size:10px;color:var(--textm);max-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${a.note||'—'}</td>
        <td style="font-size:10px;color:var(--textm);max-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${a.note_observation||'—'}</td>
        <td>${a.client_id?`<button class="btn btn-g btn-sm" onclick="ouvrirModalWA('${a.client_id}')" title="WhatsApp">📲</button>`:'—'}</td>
      </tr>`).join('')}</tbody></table>`:'<div style="color:var(--textm);font-size:12px">Aucun appel enregistré.</div>';
  });
}

function preFillAppel(clientId){
  document.getElementById('app_client').value=clientId;
  onClientAppelChange();
  document.getElementById('app_client').scrollIntoView({behavior:'smooth',block:'center'});
}

function onClientAppelChange(){
  const clientId=document.getElementById('app_client')?.value;
  // Auto-remplir téléphone
  const telEl=document.getElementById('app_tel');
  if(clientId&&clientId!==''){
    const client=GP_CLIENTS.find(c=>c.id===clientId);
    if(client&&telEl){
      telEl.value=client.telephone||client.whatsapp||'';
      telEl.setAttribute('readonly','true');
      telEl.style.background='var(--card2)';
      telEl.style.color='var(--textm)';
    }
  } else {
    if(telEl){
      telEl.value='';
      telEl.removeAttribute('readonly');
      telEl.style.background='';
      telEl.style.color='';
    }
  }
  // Auto-remplir nom de l'appelante
  const appelantEl=document.getElementById('app_appelant');
  if(appelantEl&&!appelantEl.value){
    appelantEl.value=GP_USER?.email?.split('@')[0]||'';
  }
}


// ── PROSPECTION AMÉLIORÉE ─────────────────────────
async function verifierProspect(){
  const tel=document.getElementById('app_tel')?.value.trim();
  const nom=document.getElementById('app_nom')?.value.trim();
  if(!tel&&!nom)return;
  const info=document.getElementById('prospect-info');
  if(!info)return;

  // Chercher dans les clients existants
  let query=SB.from('gp_clients').select('*').eq('admin_id',GP_ADMIN_ID);
  if(GP_ROLE!=='admin') query=query.eq('point_vente', GP_POINT_VENTE||'Production');
  if(tel) query=query.eq('telephone',tel);
  else if(nom) query=query.ilike('nom','%'+nom+'%');
  const{data:clients}=await query.limit(1);

  if(clients?.length){
    const c=clients[0];
    info.innerHTML=`<div style="background:rgba(22,163,74,.1);border:1px solid rgba(22,163,74,.3);border-radius:8px;padding:8px 12px;font-size:11px">
      ✅ <strong>Client existant :</strong> ${c.nom} — ${c.telephone||'—'}
      <span class="badge ${c.type_client==='gros'?'bdg-gold':'bdg-g'}" style="font-size:9px;margin-left:4px">${c.type_client==='gros'?'GROSSISTE':'DÉTAILLANT'}</span>
      <div style="font-size:10px;color:var(--textm);margin-top:2px">Total achats : ${fmt(c.total_achats||0)} F</div>
    </div>`;
  } else if(tel||nom){
    info.innerHTML=`<div style="background:rgba(245,158,11,.08);border:1px solid rgba(245,158,11,.2);border-radius:8px;padding:8px 12px;font-size:11px">
      🔍 Prospect non enregistré
      <button class="btn btn-g btn-sm" style="margin-left:8px" onclick="convertirProspectEnClient()">➕ Ajouter comme client</button>
    </div>`;
  }
}

async function convertirProspectEnClient(){
  const tel=document.getElementById('app_tel')?.value.trim();
  const nom=document.getElementById('app_nom')?.value.trim();
  if(!nom){notify('Entrez le nom du prospect','r');return;}
  const{error}=await SB.from('gp_clients').insert({
    admin_id:GP_ADMIN_ID,nom,telephone:tel,
    point_vente:(GP_ROLE==='admin' ? null : (GP_POINT_VENTE||'Production')),
    type_client:'detail',total_achats:0
  });
  if(error){notify('Erreur: '+error.message,'r');return;}
  await loadClients();
  populateSelects();
  notify(nom+' ajouté comme client ✓','gold');
  verifierProspect();
}

async function saveAppel(){
  const clientId=document.getElementById('app_client').value;
  const tel=document.getElementById('app_tel').value.trim();
  const resultatSelect=document.getElementById('app_resultat').value;
  const resultatAutre=document.getElementById('app_resultat_autre')?.value.trim();
  const resultat=resultatSelect==='autre'&&resultatAutre?resultatAutre:resultatSelect;
  const note=document.getElementById('app_note').value.trim();
  const observation=document.getElementById('app_observation')?.value.trim()||'';
  const err=document.getElementById('app_err');
  if(!clientId){err.textContent='Sélectionnez un client.';return;}
  const client=GP_CLIENTS.find(c=>c.id===clientId);
  const{error}=await SB.from('gp_appels').insert({
    admin_id:GP_ADMIN_ID,saisi_par:GP_USER.id,
    client_id:clientId,client_nom:client?.nom||'',
    client_tel:tel||client?.telephone||'',
    appele_par:document.getElementById('app_appelant')?.value||GP_USER?.email?.split('@')[0]||'',
    resultat, note,
    note_observation:observation||null
  });
  if(error){err.textContent='Erreur: '+error.message;return;}
  err.textContent='';
  document.getElementById('app_note').value='';
  document.getElementById('app_tel').value='';
  if(document.getElementById('app_observation'))document.getElementById('app_observation').value='';
  if(document.getElementById('app_resultat_autre'))document.getElementById('app_resultat_autre').value='';
  document.getElementById('app_resultat').value='interesse';
  document.getElementById('autre-resultat-champ').style.display='none';
  notify('Appel enregistré ✓','gold');
  await renderSuivi();
}

// ── CLASSEMENT ─────────────────────────────────────
async function renderClassement(){
  const periode=document.getElementById('class-filtre-periode')?.value||'all';
  let q=SB.from('gp_ventes').select('client_id,client_nom,client_tel,qte_vendue,montant_total,date').eq('admin_id',GP_ADMIN_ID).is('deleted_at',null);
  const now=new Date();
  if(periode==='month'){const m=thisMonth();q=q.gte('date',m+'-01').lte('date',m+'-31');}
  else if(periode==='3months'){const d=new Date(now);d.setMonth(d.getMonth()-3);q=q.gte('date',d.toISOString().slice(0,10));}
  else if(periode==='year'){q=q.gte('date',now.getFullYear()+'-01-01');}
  const{data:V}=await q;
  const ventes=V||[];
  // Aggregate by client
  const stats={};
  ventes.forEach(v=>{
    const k=v.client_id||v.client_nom||'Inconnu';
    if(!stats[k])stats[k]={nom:v.client_nom||'Inconnu',tel:v.client_tel||'',nbAchats:0,totalKg:0,totalCA:0};
    stats[k].nbAchats++;
    stats[k].totalKg+=Number(v.qte_vendue||0);
    stats[k].totalCA+=Number(v.montant_total||0);
  });
  // Trier par CA du mois (selon période sélectionnée)
  const sorted=Object.values(stats).sort((a,b)=>b.totalCA-a.totalCA);
  const totKg=sorted.reduce((s,c)=>s+c.totalKg,0);
  const totCA=sorted.reduce((s,c)=>s+c.totalCA,0);
  document.getElementById('class-kpis').innerHTML=`
    <div class="econo-box"><div class="econo-val">${sorted.length}</div><div class="econo-lbl">Clients actifs</div></div>
    <div class="econo-box"><div class="econo-val" style="color:var(--g6)">${fmt(totKg)}</div><div class="econo-lbl">Kg total vendus</div></div>
    ${GP_ROLE==='admin'?`<div class="econo-box"><div class="econo-val" style="color:var(--gold)">${fmt(totCA)}</div><div class="econo-lbl">CA total (F)</div></div>`:'<div></div>'}
    <div class="econo-box"><div class="econo-val">${totKg>0&&sorted.length>0?fmt(Math.round(totKg/sorted.length)):0}</div><div class="econo-lbl">Moy kg/client</div></div>`;
  // Afficher bouton envoi top 3
  const btnTop3=document.getElementById('btn-wa-top3');
  if(btnTop3)btnTop3.style.display=sorted.length>=3?'flex':'none';

  document.getElementById('classement-liste').innerHTML=sorted.length?`<table class="tbl"><thead><tr><th>#</th><th>Client</th><th>Téléphone</th><th class="num">Achats</th><th class="num">Kg total</th>${GP_ROLE==='admin'?'<th class="num">CA (F)</th>':''}<th>Segment</th></tr></thead><tbody>
    ${sorted.map((c,i)=>{
      const pos=i+1;
      const cls=pos<=15?'client-vert':pos<=30?'client-jaune':'';
      const seg=pos<=15?'<span class="badge bdg-g">🥇 Top 15</span>':pos<=30?'<span class="badge bdg-gold">🥈 16-30</span>':'<span class="badge" style="background:var(--card2);color:var(--textm);">Standard</span>';
      return `<tr class="${cls}"><td style="font-weight:700;color:${pos<=15?'var(--green)':pos<=30?'var(--gold)':'var(--textm)'}">#${pos}</td><td style="font-weight:600">${c.nom}</td><td>${c.tel||'—'}</td><td class="num">${c.nbAchats}</td><td class="num">${fmt(c.totalKg)} kg</td>${GP_ROLE==='admin'?`<td class="num" style="color:var(--gold)">${fmt(c.totalCA)} F</td>`:''}  <td>${seg}</td></tr>`;}).join('')}</tbody></table>`:'<div style="color:var(--textm);font-size:12px;padding:10px">Aucune vente enregistrée.</div>';
}
// ── MESSAGES WHATSAPP ──────────────────────────────
let waClientCourant = null;

function ouvrirModalWA(clientId){
  const client = GP_CLIENTS.find(c => c.id === clientId);
  if(!client){ notify('Client introuvable','r'); return; }
  waClientCourant = client;
  document.getElementById('wa-client-nom').textContent = client.nom;
  document.getElementById('wa-type').value = 'relance';
  document.getElementById('modal-wa').style.display = 'flex';
  document.getElementById('wa-promo-champ').style.display = 'none';
  document.getElementById('wa-produit-champ').style.display = 'none';
  previewWA();
}

function fermerModalWA(){
  document.getElementById('modal-wa').style.display = 'none';
  waClientCourant = null;
}

function previewWA(){
  const type = document.getElementById('wa-type').value;
  const cfg = GP_CONFIG || {};
  const client = waClientCourant;
  if(!client) return;

  // Afficher/cacher les champs selon le type
  document.getElementById('wa-promo-champ').style.display = type === 'promo' ? 'block' : 'none';
  document.getElementById('wa-produit-champ').style.display = type === 'nouveau_produit' ? 'block' : 'none';

  const prov = cfg.nom_provenderie || 'Provenderie Sadari';
  const tel = cfg.telephone || '';
  const prenom = client.nom.split(' ')[0];
  let msg = '';

  if(type === 'relance'){
    const joursAbsence = client.dernier_achat
      ? Math.floor((new Date() - new Date(client.dernier_achat)) / 86400000)
      : null;
    msg = `Bonjour ${prenom} 👋\n\n`
      + `Nous pensons à vous chez *${prov}* !\n\n`
      + (joursAbsence ? `Cela fait ${joursAbsence} jours que nous n'avons pas eu le plaisir de vous servir.\n\n` : '')
      + `Nos aliments sont disponibles et prêts à livrer. Avez-vous besoin de vous réapprovisionner ?\n\n`
      + `N'hésitez pas à nous contacter 📞 ${tel}\n\n`
      + `_${prov}_`;
  } else if(type === 'merci'){
    msg = `Bonjour ${prenom} 👋\n\n`
      + `*${prov}* tient à vous adresser ses sincères remerciements ! 🙏\n\n`
      + `Vous faites partie de nos meilleurs clients et nous sommes très fiers de votre confiance.\n\n`
      + `Votre fidélité est notre motivation pour continuer à vous offrir des aliments de qualité.\n\n`
      + `Merci et à très bientôt ! 🌾\n\n`
      + `_${prov} · ${tel}_`;
  } else if(type === 'promo'){
    const detail = document.getElementById('wa-promo-detail')?.value || 'Promotion spéciale en cours';
    msg = `🎉 *Promotion spéciale — ${prov}*\n\n`
      + `Bonjour ${prenom},\n\n`
      + `Bonne nouvelle ! *${detail}*\n\n`
      + `C'est le moment de faire vos stocks ! Contactez-nous vite pour en profiter.\n\n`
      + `📞 ${tel}\n\n`
      + `_Offre valable jusqu'à épuisement des stocks_\n`
      + `_${prov}_`;
  } else if(type === 'nouveau_produit'){
    const produit = document.getElementById('wa-produit-nom')?.value || 'Nouveau produit';
    msg = `🆕 *Nouveau produit — ${prov}*\n\n`
      + `Bonjour ${prenom},\n\n`
      + `Nous avons le plaisir de vous annoncer le lancement de notre nouveau produit :\n\n`
      + `*🌾 ${produit}*\n\n`
      + `Formulé spécialement pour maximiser les performances de vos animaux.\n\n`
      + `Contactez-nous pour plus d'informations ou pour passer votre commande :\n`
      + `📞 ${tel}\n\n`
      + `_${prov}_`;
  } else if(type==='dette'){
    // Chercher les ventes impayées du client
    const detteEl=document.getElementById('wa-preview');
    if(detteEl) detteEl.value='⏳ Calcul de la dette en cours...';
    SB.from('gp_ventes').select('montant_total,montant_paye,formule_nom,date')
      .eq('admin_id',GP_ADMIN_ID).is('deleted_at',null)
      .eq('client_id',client.id)
      .neq('statut_paiement','paye')
      .order('date',{ascending:false})
      .then(({data:ventes})=>{
        const V=ventes||[];
        const totalDu=V.reduce((s,v)=>s+Number(v.montant_total||0)-Number(v.montant_paye||0),0);
        const lignes=V.slice(0,5).map(v=>`• ${v.date} — ${v.formule_nom} : ${fmt(Number(v.montant_total||0)-Number(v.montant_paye||0))} F`).join('\n');
        const detteMsg=
          `Bonjour ${prenom} 👋\n\n`
          +`Nous espérons que vous allez bien.\n\n`
          +`*${cfg.nom_provenderie||'Provenderie'}* vous contacte concernant votre solde en attente.\n\n`
          +`📋 *Détail de votre solde :*\n`
          +(lignes?lignes+'\n\n':`Vous avez un règlement en attente.\n\n`)
          +`💰 *Total à régler : ${totalDu>0?fmt(totalDu)+' FCFA':'Montant à confirmer'}*\n\n`
          +`Nous vous serions reconnaissants de bien vouloir régulariser cette situation dans les meilleurs délais pour continuer à bénéficier de nos services.\n\n`
          +`Pour tout arrangement de paiement, contactez-nous :\n`
          +`📞 ${cfg.telephone||''}\n\n`
          +`Merci pour votre compréhension. 🙏\n\n`
          +`_${cfg.nom_provenderie||'Provenderie'}_`;
        if(detteEl) detteEl.value=detteMsg;
      });
    return; // retour immédiat, le .then() met à jour l'aperçu
  } else if(type==='prosp_intro'||type==='prosp_essai'||type==='prosp_suivi'||type==='prosp_parrainage'||type==='prosp_eleveur'){
    const elevage=client.type_elevage||'';
    msg=genMsgProspect(type,client.nom,elevage,'',cfg);
  } else {
    msg = `Bonjour ${prenom},\n\n\n\n_${prov}_`;
  }

  document.getElementById('wa-preview').value = msg;
}

// ── PROSPECTION ────────────────────────────────────
function genMsgProspect(type, nom, elevage, parrain, cfg){
  const prov = cfg.nom_provenderie || 'Provenderie Sadari';
  const tel  = cfg.telephone || '';
  const site = 'avifarmer.net';
  const prenom = nom ? nom.split(' ')[0] : 'Bonjour';

  if(type === 'prosp_intro'){
    return `Bonjour ${prenom} 👋\n\n`
      + `Je me permets de vous contacter de la part de *${prov}*, fabricant d'aliments pour animaux basé à Lomé.\n\n`
      + `Nous produisons des aliments de qualité pour${elevage?' *'+elevage+'*':' vos animaux'} — formulés localement avec des matières premières sélectionnées.\n\n`
      + `✅ Livraison rapide\n`
      + `✅ Prix compétitifs\n`
      + `✅ Suivi technique inclus\n\n`
      + `Seriez-vous intéressé(e) par un devis ou un échantillon ?\n\n`
      + `📞 ${tel}\n🌐 ${site}\n\n`
      + `_${prov}_`;
  }
  if(type === 'prosp_essai'){
    return `Bonjour ${prenom} 👋\n\n`
      + `*${prov}* vous offre l'opportunité de tester nos aliments sur votre élevage${elevage?' de *'+elevage+'*':''}. \n\n`
      + `🎁 *Première commande : tarif découverte*\n\n`
      + `Nos formules sont développées spécifiquement pour le contexte ouest-africain — résultats rapides sur la croissance et la ponte.\n\n`
      + `Envoyez-nous simplement votre besoin et nous vous préparons un devis sur mesure.\n\n`
      + `📞 ${tel}\n\n`
      + `_${prov}_`;
  }
  if(type === 'prosp_suivi'){
    return `Bonjour ${prenom} 👋\n\n`
      + `Suite à notre précédent échange, je souhaitais prendre de vos nouvelles et savoir si vous avez pu réfléchir à notre offre.\n\n`
      + `Nous sommes toujours disponibles pour vous accompagner dans votre élevage${elevage?' de *'+elevage+'*':''}. \n\n`
      + `N'hésitez pas à me poser toutes vos questions — nous sommes là pour vous aider à maximiser vos performances.\n\n`
      + `📞 ${tel}\n\n`
      + `_${prov}_`;
  }
  if(type === 'prosp_parrainage'){
    return `Bonjour ${prenom} 👋\n\n`
      + `*${parrain||'Un de vos collègues éleveurs'}* nous a parlé de vous et nous a recommandé de vous contacter.\n\n`
      + `Je suis de *${prov}*, fabricant d'aliments pour${elevage?' *'+elevage+'*':" animaux d'élevage"}.\n\n`
      + `Nos clients comme ${parrain||'votre collègue'} font confiance à nos produits pour leurs résultats sur la croissance et la productivité.\n\n`
      + `Je serais ravi(e) de vous faire une démonstration ou de vous envoyer un devis.\n\n`
      + `📞 ${tel}\n\n`
      + `_${prov}_`;
  }
  if(type === 'prosp_eleveur'){
    return `Bonjour ${prenom} 👋\n\n`
      + `Je vous contacte car vous êtes éleveur${elevage?' de *'+elevage+'*':''} et nous pensons pouvoir vous aider à améliorer vos résultats.\n\n`
      + `*${prov}* fabrique des aliments complets${elevage?' spécialisés pour les *'+elevage+'*':''}, adaptés aux conditions d'élevage au Togo.\n\n`
      + `💡 *Nos avantages :*\n`
      + `• Formules testées et validées localement\n`
      + `• Ingrédients de qualité contrôlée\n`
      + `• Suivi technique gratuit\n`
      + `• Livraison à domicile disponible\n\n`
      + `Puis-je vous envoyer notre catalogue de produits ?\n\n`
      + `📞 ${tel}\n🌐 ${site}\n\n`
      + `_${prov}_`;
  }
  return `Bonjour ${prenom},\n\n\n\n_${prov}_`;
}

function previewProspect(){
  const type = document.getElementById('prosp_type')?.value;
  const nom = document.getElementById('prosp_nom')?.value.trim() || 'Prospect';
  const elevage = document.getElementById('prosp_elevage')?.value || '';
  const parrain = document.getElementById('prosp_parrain')?.value.trim() || '';
  const cfg = GP_CONFIG || {};

  // Afficher/cacher champ parrain
  const parrainChamp = document.getElementById('prosp-parrain-champ');
  if(parrainChamp) parrainChamp.style.display = type === 'prosp_parrainage' ? 'block' : 'none';

  const msg = genMsgProspect(type, nom, elevage, parrain, cfg);
  const preview = document.getElementById('prosp-preview');
  if(preview) preview.value = msg;
}

function envoyerProspect(){
  const nom = document.getElementById('prosp_nom')?.value.trim();
  const tel = document.getElementById('prosp_tel')?.value.trim();
  const err = document.getElementById('prosp_err');

  if(!nom){ err.textContent = 'Entrez le nom du prospect.'; return; }
  if(!tel){ err.textContent = 'Entrez le numéro de téléphone.'; return; }
  err.textContent = '';

  const msg = document.getElementById('prosp-preview')?.value || '';
  const telClean = tel.replace(/[\s\-\+]/g,'').replace(/^00/,'').replace(/^228/,'');
  window.open(`https://wa.me/228${telClean}?text=${encodeURIComponent(msg)}`, '_blank');
}

// Aussi ajouter les types de prospection dans previewWA pour le modal existant


function envoyerWAClient(){
  const client = waClientCourant;
  if(!client){ notify('Client introuvable','r'); return; }
  const msg = document.getElementById('wa-preview').value;
  const tel = (client.telephone||'').replace(/[\s\-\+]/g,'').replace(/^00/,'').replace(/^228/,'');
  if(!tel){ notify('Ce client n\'a pas de numéro de téléphone','r'); return; }
  window.open(`https://wa.me/228${tel}?text=${encodeURIComponent(msg)}`, '_blank');
  fermerModalWA();
}

// ── AUTRE RÉSULTAT ─────────────────────────────────
function toggleAutreResultat(){
  const val = document.getElementById('app_resultat').value;
  const champ = document.getElementById('autre-resultat-champ');
  champ.style.display = val === 'autre' ? 'block' : 'none';
}

// ── MESSAGES TOP 3 CLIENTS ───────────────────────
const TEMPLATES_TOP3=[
  (d)=>`Bonjour ${d.client} 👋\n\nNous tenons à vous exprimer notre profonde gratitude pour votre fidélité et votre confiance envers *${d.provendef}*.\n\n🏆 *Vous faites partie de nos ${d.rang <= 1 ? 'meilleur' : d.rang <= 2 ? '2ème meilleur' : '3ème meilleur'} client ce mois !*\n\n📊 Vos achats ce mois :\n   • CA : *${d.ca} F*\n   • Commandes : *${d.nbAchats}*\n\nVotre partenariat est une source d'inspiration pour toute notre équipe. Merci infiniment !\n\nCordialement,\n_${d.provendef}_ 🌾`,

  (d)=>`Bonsoir ${d.client} ✨\n\n*${d.provendef}* tient à vous témoigner toute sa reconnaissance.\n\n${d.rang===1?'🥇 *MEILLEUR CLIENT DU MOIS !* \nVotre engagement exceptionnel fait de vous notre partenaire N°1 !':d.rang===2?'🥈 *2ème CLIENT DU MOIS !*\nVotre fidélité est un trésor pour nous.':'🥉 *3ème CLIENT DU MOIS !*\nVotre loyauté nous touche profondément.'}\n\nCA ce mois : *${d.ca} F*\n\nNous nous engageons à continuer à vous offrir des produits de la meilleure qualité. 💪\n\nAvec toute notre gratitude,\n_${d.provendef}_`,

  (d)=>`${d.client}, bonsoir ! 🌟\n\nUn mois de plus ensemble — et quel mois !\n\n${d.rang===1?`👑 Vous êtes notre *CHAMPION* ce mois avec *${d.ca} F* d'achats !`:` Vous êtes classé *${d.rang}ème* ce mois avec *${d.ca} F* — Une performance remarquable !`}\n\n🎯 Votre partenariat avec *${d.provendef}* est notre fierté. Nous mettons tout en œuvre pour mériter votre confiance chaque jour.\n\nMerci d'être là. Merci de croire en nous. 🙏\n\n_L'équipe ${d.provendef}_`
];

async function envoyerMessagesTop3(){
  const mois=new Date().toISOString().slice(0,7);
  const{data:V}=await SB.from('gp_ventes').select('client_id,client_nom,montant_total,date')
    .eq('admin_id',GP_ADMIN_ID).is('deleted_at',null).gte('date',mois+'-01').lte('date',_finMois(mois));

  const stats={};
  (V||[]).forEach(v=>{
    const k=v.client_id||v.client_nom||'';
    if(!k)return;
    if(!stats[k])stats[k]={nom:v.client_nom||'Client',id:v.client_id,ca:0,nb:0};
    stats[k].ca+=Number(v.montant_total||0);
    stats[k].nb++;
  });
  const top3=Object.values(stats).sort((a,b)=>b.ca-a.ca).slice(0,3);
  if(!top3.length){notify('Aucun client ce mois','r');return;}

  const provendef=GP_CONFIG?.nom_provenderie||'PROVENDA';
  const messages=top3.map((c,i)=>{
    const rang=i+1;
    const tpl=TEMPLATES_TOP3[Math.floor(Math.random()*TEMPLATES_TOP3.length)];
    const msg=tpl({client:c.nom,rang,ca:fmt(c.ca),nbAchats:c.nb,provendef});
    // Chercher téléphone
    const cl=GP_CLIENTS.find(x=>x.id===c.id);
    const tel=cl?.whatsapp||cl?.telephone||'';
    const paysInfo=tel?detecterPays(tel):{numero_whatsapp:''};
    return{nom:c.nom,rang,ca:c.ca,tel:paysInfo.numero_whatsapp,msg,id:c.id};
  });

  afficherModalTop3(messages);
}

function afficherModalTop3(messages){
  const modal=document.getElementById('modal-top3-clients');
  if(!modal)return;
  document.getElementById('top3-liste').innerHTML=messages.map((m,i)=>{
    const medals=['🥇','🥈','🥉'];
    return`<div style="background:var(--card2);border:1px solid rgba(245,158,11,.3);border-radius:10px;padding:12px;margin-bottom:8px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
        <div>
          <span style="font-weight:700;font-size:13px">${medals[i]} ${m.nom}</span>
          <div style="font-size:11px;color:var(--gold)">CA : ${fmt(m.ca)} F</div>
        </div>
        ${m.tel
          ? `<a href="https://wa.me/${m.tel}?text=${encodeURIComponent(m.msg)}" target="_blank" rel="noopener"
              style="background:linear-gradient(135deg,#25D366,#128C7E);color:white;padding:8px 14px;border-radius:8px;font-size:12px;font-weight:700;text-decoration:none">
              📲 Envoyer
            </a>`
          : `<div><input type="tel" id="top3-tel-${i}" placeholder="+228..." style="font-size:11px;padding:5px 8px;border-radius:6px;border:1px solid var(--border2);background:var(--card2);color:var(--text);width:130px;margin-bottom:4px">
              <button onclick="envoyerTop3Manuel(${i},'${encodeURIComponent(m.msg)}')" style="background:linear-gradient(135deg,#25D366,#128C7E);color:white;border:none;padding:6px 12px;border-radius:7px;font-size:11px;font-weight:700;cursor:pointer;width:100%">📲 Envoyer</button>
            </div>`
        }
      </div>
      <details style="font-size:10px;color:var(--textm)">
        <summary style="cursor:pointer;color:var(--g6)">Voir le message</summary>
        <pre style="white-space:pre-wrap;font-size:10px;margin-top:6px;padding:8px;background:rgba(22,163,74,.05);border-radius:6px">${m.msg}</pre>
      </details>
    </div>`;
  }).join('');
  modal.style.display='flex';
}

function fermerTop3(){
  document.getElementById('modal-top3-clients').style.display='none';
}

function envoyerTop3Manuel(idx,msgEncoded){
  const inp=document.getElementById('top3-tel-'+idx);
  const tel=inp?.value.trim();
  if(!tel){if(inp)inp.style.borderColor='var(--red)';return;}
  const paysInfo=detecterPays(tel);
  if(paysInfo.numero_whatsapp){
    window.open('https://wa.me/'+paysInfo.numero_whatsapp+'?text='+msgEncoded,'_blank');
  }
}

// ── GESTION DETTES CLIENTS ────────────────────────
function ouvrirPayerDette(clientId, nom, montantDu){
  const modal=document.getElementById('modal-payer-dette');
  if(!modal)return;
  document.getElementById('dette-client-nom').textContent=nom;
  document.getElementById('dette-montant-du').textContent=fmt(montantDu)+' F';
  document.getElementById('dette-montant-input').value=montantDu;
  document.getElementById('dette-client-id').value=clientId;
  document.getElementById('dette-montant-total').value=montantDu;
  modal.style.display='flex';
}

function fermerPayerDette(){
  document.getElementById('modal-payer-dette').style.display='none';
}

async function savePayerDette(){
  const clientId=document.getElementById('dette-client-id').value;
  const montantTotal=+document.getElementById('dette-montant-total').value;
  const montant=+document.getElementById('dette-montant-input').value||0;
  const err=document.getElementById('dette-err');

  if(!montant||montant<=0){err.textContent='Entrez un montant.';return;}

  // Trouver les ventes impayées et partielles de ce client
  const{data:ventes}=await SB.from('gp_ventes').select('id,montant_total,montant_paye')
    .eq('admin_id',GP_ADMIN_ID).is('deleted_at',null).eq('client_id',clientId)
    .in('statut_paiement',['impaye','partiel']).order('date');

  let restePayer=montant;
  for(const v of(ventes||[])){
    if(restePayer<=0)break;
    const resteVente=Number(v.montant_total)-Number(v.montant_paye);
    const aPayer=Math.min(restePayer,resteVente);
    const nouveauPaye=Number(v.montant_paye)+aPayer;
    const statut=nouveauPaye>=Number(v.montant_total)?'paye':'partiel';
    await SB.from('gp_ventes').update({montant_paye:nouveauPaye,statut_paiement:statut}).eq('id',v.id);
    restePayer-=aPayer;
  }

  notify(`Paiement de ${fmt(montant)} F enregistré ✓`,'gold');
  fermerPayerDette();
  await loadClients();
  renderClients();
}

async function envoyerRappelDette(clientId){
  const c=GP_CLIENTS.find(x=>x.id===clientId);
  if(!c)return;

  const{data:ventes}=await SB.from('gp_ventes').select('montant_total,montant_paye,date,formule_nom')
    .eq('admin_id',GP_ADMIN_ID).is('deleted_at',null).eq('client_id',clientId)
    .in('statut_paiement',['impaye','partiel']).order('date');

  const V=ventes||[];
  if(!V.length){notify('Aucune dette trouvée','r');return;}

  const totalDu=V.reduce((s,v)=>s+Number(v.montant_total||0)-Number(v.montant_paye||0),0);
  const prov=GP_CONFIG?.nom_provenderie||'PROVENDA';

  const detailLignes=V.map(v=>{
    const reste=Number(v.montant_total||0)-Number(v.montant_paye||0);
    return`   • ${v.date} · ${v.formule_nom||'—'} · Reste : ${fmt(reste)} F`;
  }).join('\n');

  const templates=[
    ()=>`Bonjour ${c.nom} 👋\n\nNous espérons que vous allez bien !\n\nNous nous permettons de vous rappeler qu'un solde est en attente de règlement auprès de *${prov}*.\n\n📋 *Détail de vos achats en attente :*\n${detailLignes}\n\n💰 *Total dû : ${fmt(totalDu)} F*\n\nNous sommes convaincus qu'il s'agit d'un oubli et comptons sur vous pour régulariser cette situation dans les meilleurs délais. 🙏\n\nMerci pour votre fidélité et votre compréhension.\n\n_${prov}_`,

    ()=>`${c.nom}, bonjour ! 😊\n\nEn tant que partenaire fidèle de *${prov}*, vous avez toujours notre confiance.\n\nNous tenons à vous informer qu'un montant de *${fmt(totalDu)} F* est en attente de paiement.\n\n📋 *Historique des achats concernés :*\n${detailLignes}\n\nNous restons disponibles pour toute question ou arrangement concernant ce règlement. N'hésitez pas à nous contacter.\n\nCordialement,\n_${prov}_ 🌾`,
  ];

  const msg=templates[Math.floor(Math.random()*templates.length)]();
  const tel=c.whatsapp||c.telephone||'';
  if(tel){
    const paysInfo=detecterPays(tel);
    if(paysInfo.numero_whatsapp){
      window.open('https://wa.me/'+paysInfo.numero_whatsapp+'?text='+encodeURIComponent(msg),'_blank');
      return;
    }
  }
  // Pas de numéro
  const num=prompt(`Numéro WhatsApp de ${c.nom} :`);
  if(num){
    const paysInfo=detecterPays(num.trim());
    if(paysInfo.numero_whatsapp)window.open('https://wa.me/'+paysInfo.numero_whatsapp+'?text='+encodeURIComponent(msg),'_blank');
  }
}
