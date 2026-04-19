// ── VENTES ─────────────────────────────────────────
function onClientChange(){
  const val=document.getElementById('vt_client').value;
  document.getElementById('vt-nouveau-client').style.display=val==='__nouveau__'?'block':'none';
}
function onVenteFormuleChange(){
  const nom=document.getElementById('vt_formule').value;
  if(nom){
    const prix=getPrix(nom);
    // Secrétaire voit le prix mais ne peut pas modifier
    const prixEl=document.getElementById('vt_prix');
    if(prixEl&&prix){
      prixEl.value=prix;
      prixEl.readOnly=GP_ROLE!=='admin';
    }
    document.getElementById('vt-prix-lock').style.display=GP_ROLE==='admin'?'none':'inline';
  }
  calcVente();
}
function calcVente(){
  const qte=+document.getElementById('vt_qte').value||0;
  const prix=+document.getElementById('vt_prix').value||0;
  const remise=+document.getElementById('vt_remise').value||0;
  const statut=document.getElementById('vt_statut').value;
  const total=qte*prix-remise;
  const remisePct=qte*prix>0?remise/(qte*prix)*100:0;
  document.getElementById('vt-paye-wrap').style.display=statut!=='paye'?'block':'none';
  const warn=document.getElementById('vt-remise-warning');
  warn.style.display=remisePct>GP_REMISE_MAX?'block':'none';
  document.getElementById('vt-preview').innerHTML=qte&&prix?`
    <div style="display:flex;justify-content:space-between;font-size:12px">
      <span style="color:var(--textm)">${fmt(qte)} kg × ${fmt(prix)} F ${remise?'− '+fmt(remise)+' F remise':''}</span>
      <strong style="color:var(--gold);font-family:'DM Mono',monospace">${fmt(total)} FCFA</strong>
    </div>`:'Saisissez les informations pour voir le total.';
}
async function saveVente(){
  const clientId=document.getElementById('vt_client').value;
  const nom_v=document.getElementById('vt_formule').value;
  const date=document.getElementById('vt_date').value;
  const qte=+document.getElementById('vt_qte').value||0;
  const prix=+document.getElementById('vt_prix').value||0;
  const remise=+document.getElementById('vt_remise').value||0;
  const statut=document.getElementById('vt_statut').value;
  const pv=document.getElementById('vt_pv').value.trim();
  const err=document.getElementById('vt_err');
  if(!nom_v||!date||!qte||!prix){err.textContent='Formule, date, quantité et prix requis.';return;}
  const total=qte*prix-remise;
  const paye=statut==='paye'?total:(+document.getElementById('vt_paye').value||0);
  // Check remise approval
  const remisePct=qte*prix>0?remise/(qte*prix)*100:0;
  if(remisePct>GP_REMISE_MAX&&GP_ROLE!=='admin'){
    // Store remise request
    await SB.from('gp_remises_attente').insert({
      admin_id:GP_ADMIN_ID,demande_par:GP_USER.id,
      client_nom:document.getElementById('vt_cl_nom')?.value||GP_CLIENTS.find(c=>c.id===clientId)?.nom||'Inconnu',
      formule_nom:nom_v,qte,prix_base:prix,remise
    });
    notify('Remise envoyée pour validation admin — vente en attente','gold');
    err.textContent='';checkPendingRemises();return;
  }
  // Client management
  let finalClientId=clientId;
  let clientNom='',clientTel='';
  if(clientId==='__nouveau__'){
    clientNom=document.getElementById('vt_cl_nom').value.trim();
    clientTel=document.getElementById('vt_cl_tel').value.trim();
    if(!clientNom){err.textContent='Nom du nouveau client requis.';return;}
    const{data:newC}=await SB.from('gp_clients').insert({admin_id:GP_ADMIN_ID,nom:clientNom,telephone:clientTel}).select().single();
    if(newC){finalClientId=newC.id;await loadClients();populateSelects();}
  } else if(clientId){
    const c=GP_CLIENTS.find(x=>x.id===clientId);
    clientNom=c?.nom||'';clientTel=c?.telephone||'';
  }
  err.textContent='Enregistrement...';
  const espece=FORMULES_SADARI.find(f=>f.nom===nom_v)?.espece||'';
  const{error}=await SB.from('gp_ventes').insert({
    admin_id:GP_ADMIN_ID,saisi_par:GP_USER.id,date,
    client_id:finalClientId||null,client_nom:clientNom,client_tel:clientTel,
    formule_nom:nom_v,espece,qte_vendue:qte,prix_unitaire:prix,remise,remise_validee:true,
    montant_total:total,statut_paiement:statut,montant_paye:paye,point_vente:pv
  });
  if(error){err.textContent='Erreur: '+error.message;return;}
  // Update client stats
  if(finalClientId&&finalClientId!=='__nouveau__'){
    const c=GP_CLIENTS.find(x=>x.id===finalClientId);
    const prevDate=c?.dernier_achat;
    let freqJours=c?.frequence_jours;
    if(prevDate){
      const diff=Math.ceil((new Date(date)-new Date(prevDate))/86400000);
      freqJours=Math.round(((freqJours||diff)*2+diff)/3);// rolling avg
    }
    await SB.from('gp_clients').update({
      dernier_achat:date,nb_achats:(c?.nb_achats||0)+1,
      total_achats:(c?.total_achats||0)+total,frequence_jours:freqJours
    }).eq('id',finalClientId);
    await loadClients();
  }
  err.textContent='';
  ['vt_qte','vt_prix','vt_paye','vt_cl_nom','vt_cl_tel'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});
  document.getElementById('vt_remise').value='0';
  document.getElementById('vt-nouveau-client').style.display='none';
  document.getElementById('vt-preview').textContent='Saisissez les informations pour voir le total.';
  document.getElementById('vt-remise-warning').style.display='none';
  notify('Vente enregistrée ✓','gold');
  renderVentes();updateVentesKPIs();
}
async function updateVentesKPIs(){
  const{data:V}=await SB.from('gp_ventes').select('*').eq('admin_id',GP_ADMIN_ID).gte('date',today()).lte('date',today());
  const vd=V||[];
  const ca=vd.reduce((s,v)=>s+Number(v.montant_total||0),0);
  const impaye=vd.reduce((s,v)=>s+(Number(v.montant_total||0)-Number(v.montant_paye||0)),0);
  document.getElementById('ventes-kpis').innerHTML=`
    <div class="econo-box"><div class="econo-val">${vd.length}</div><div class="econo-lbl">Ventes du jour</div></div>
    <div class="econo-box"><div class="econo-val" style="color:var(--gold)">${GP_ROLE==='admin'?fmt(ca)+' F':'—'}</div><div class="econo-lbl">CA du jour</div></div>
    <div class="econo-box"><div class="econo-val" style="color:${impaye>0?'var(--red)':'var(--green)'}">${GP_ROLE==='admin'?fmt(impaye)+' F':'—'}</div><div class="econo-lbl">Impayés du jour</div></div>
    <div class="econo-box"><div class="econo-val">${vd.reduce((s,v)=>s+Number(v.qte_vendue||0),0).toFixed(0)}</div><div class="econo-lbl">Kg vendus</div></div>`;
}
async function renderVentes(){
  const filtDate=document.getElementById('vt-filtre-date')?.value||'';
  const filtStatut=document.getElementById('vt-filtre-statut')?.value||'';
  let q=SB.from('gp_ventes').select('*').eq('admin_id',GP_ADMIN_ID).order('created_at',{ascending:false}).limit(50);
  if(filtDate)q=q.eq('date',filtDate);
  if(filtStatut)q=q.eq('statut_paiement',filtStatut);
  const{data}=await q;
  const V=data||[];
  document.getElementById('ventes-liste').innerHTML=V.length?`
    <table class="tbl" style="font-size:11px"><thead><tr><th>Date</th><th>Client</th><th>Formule</th><th class="num">Qté (kg)</th>${GP_ROLE==='admin'?'<th class="num">Total</th>':''}<th>Statut</th><th></th></tr></thead><tbody>
    ${V.map(v=>`<tr>
      <td style="font-family:'DM Mono',monospace;font-size:10px">${v.date}</td>
      <td><div style="font-weight:600">${v.client_nom||'—'}</div><div style="font-size:9px;color:var(--textm)">${v.client_tel||''}</div></td>
      <td style="font-size:10px">${ESPECE_ICON[v.espece]||''} ${v.formule_nom||'—'}</td>
      <td class="num">${fmtKg(v.qte_vendue)}</td>
      ${GP_ROLE==='admin'?`<td class="num" style="color:var(--gold)">${fmt(v.montant_total)} F</td>`:''}
      <td><span class="badge ${v.statut_paiement==='paye'?'bdg-g':v.statut_paiement==='partiel'?'bdg-gold':'bdg-r'}">${v.statut_paiement==='paye'?'✅':'⚠'}</span></td>
      <td style="display:flex;gap:4px">
        <button class="btn btn-print btn-sm" onclick="imprimerVente('${encodeURIComponent(JSON.stringify(v))}')">🖨️</button>
        <button class="btn btn-red btn-sm" onclick="deleteVente('${v.id}')">✕</button>
      </td>
    </tr>`).join('')}</tbody></table>`:'<div style="color:var(--textm);font-size:12px;padding:10px">Aucune vente.</div>';
}
async function deleteVente(id){
  if(!confirm('Supprimer cette vente ?'))return;
  await SB.from('gp_ventes').delete().eq('id',id);
  renderVentes();updateVentesKPIs();notify('Vente supprimée','r');
}

// ── DÉPENSES ───────────────────────────────────────
async function saveDep(){
  const desc=document.getElementById('dep_desc').value.trim();
  const montant=+document.getElementById('dep_montant').value||0;
  const date=document.getElementById('dep_date').value;
  const err=document.getElementById('dep_err');
  if(!desc||!montant||!date){err.textContent='Description, montant et date requis.';return;}
  const{error}=await SB.from('gp_depenses').insert({
    admin_id:GP_ADMIN_ID,saisi_par:GP_USER.id,date,
    categorie:document.getElementById('dep_cat').value,
    description:desc,montant,
    beneficiaire:document.getElementById('dep_benef').value.trim()||null,
    point_vente:document.getElementById('dep_pv').value.trim()||null
  });
  if(error){err.textContent='Erreur: '+error.message;return;}
  err.textContent='';
  ['dep_desc','dep_montant','dep_benef','dep_pv'].forEach(id=>document.getElementById(id).value='');
  notify('Dépense enregistrée ✓','gold');
  renderDep();
}
async function renderDep(){
  const filtMois=document.getElementById('dep-filtre-mois')?.value||thisMonth();
  let q=SB.from('gp_depenses').select('*').eq('admin_id',GP_ADMIN_ID).order('date',{ascending:false}).limit(100);
  if(filtMois)q=q.gte('date',filtMois+'-01').lte('date',filtMois+'-31');
  const{data}=await q;
  const D=data||[];
  const total=D.reduce((s,d)=>s+Number(d.montant||0),0);
  document.getElementById('dep-liste').innerHTML=`
    ${GP_ROLE==='admin'?`<div style="font-size:11px;color:var(--textm);margin-bottom:8px">Total : <strong style="color:var(--red)">${fmt(total)} FCFA</strong></div>`:''}
    <div style="overflow-x:auto">${D.length?`<table class="tbl" style="font-size:11px"><thead><tr><th>Date</th><th>Catégorie</th><th>Description</th><th>Bénéficiaire</th>${GP_ROLE==='admin'?'<th class="num">Montant</th>':''}<th></th></tr></thead><tbody>
    ${D.map(d=>`<tr>
      <td style="font-size:10px">${d.date}</td>
      <td><span class="badge bdg-gold" style="font-size:9px">${CAT_LABELS[d.categorie]||d.categorie}</span></td>
      <td>${d.description}</td>
      <td style="color:var(--textm);font-size:10px">${d.beneficiaire||'—'}</td>
      ${GP_ROLE==='admin'?`<td class="num" style="color:var(--red)">${fmt(d.montant)} F</td>`:''}
      <td><button class="btn btn-red btn-sm" onclick="deleteDep('${d.id}')">✕</button></td>
    </tr>`).join('')}</tbody></table>`:'<div style="color:var(--textm);font-size:12px;padding:10px">Aucune dépense.</div>'}</div>`;
}
async function deleteDep(id){
  if(!confirm('Supprimer cette dépense ?'))return;
  await SB.from('gp_depenses').delete().eq('id',id);
  renderDep();notify('Dépense supprimée','r');
}

// ── BILAN JOURNALIER ───────────────────────────────
async function renderBilanJour(){
  if(GP_ROLE!=='admin'){document.getElementById('bj-bilan').innerHTML='<div style="color:var(--textm)">Réservé aux administrateurs.</div>';return;}
  const date=document.getElementById('bj_date').value;
  const[{data:V},{data:D},{data:L},{data:S}]=await Promise.all([
    SB.from('gp_ventes').select('*').eq('admin_id',GP_ADMIN_ID).eq('date',date),
    SB.from('gp_depenses').select('*').eq('admin_id',GP_ADMIN_ID).eq('date',date),
    SB.from('gp_lots').select('*').eq('admin_id',GP_ADMIN_ID).eq('date',date),
    SB.from('gp_stock_mp').select('*').eq('admin_id',GP_ADMIN_ID).eq('date',date).eq('type','entree'),
  ]);
  const v=V||[];const d=D||[];const l=L||[];const s=S||[];
  const caJour=v.reduce((s,x)=>s+Number(x.montant_total||0),0);
  const depJour=d.reduce((s,x)=>s+Number(x.montant||0),0);
  const impaye=v.reduce((s,x)=>s+(Number(x.montant_total||0)-Number(x.montant_paye||0)),0);
  const prodJour=l.reduce((s,x)=>s+Number(x.qte_produite||0),0);
  const achatJour=s.reduce((s,x)=>s+Number(x.quantite||0)*Number(x.prix_unit||0),0);
  const bilan=caJour-depJour;
  const dateAff=date?new Date(date+'T12:00:00').toLocaleDateString('fr-FR',{weekday:'long',day:'2-digit',month:'long',year:'numeric'}):'—';
  const cfg=GP_CONFIG||{};

  document.getElementById('bj-kpis').innerHTML=`
    <div class="econo-box"><div class="econo-val" style="color:var(--green)">${fmt(caJour)}</div><div class="econo-lbl">Recettes (F)</div></div>
    <div class="econo-box"><div class="econo-val" style="color:var(--red)">${fmt(depJour)}</div><div class="econo-lbl">Dépenses (F)</div></div>
    <div class="econo-box"><div class="econo-val" style="color:${impaye>0?'var(--red)':'var(--green)'}">${fmt(impaye)}</div><div class="econo-lbl">Impayés (F)</div></div>
    <div class="econo-box"><div class="econo-val">${fmt(prodJour)}</div><div class="econo-lbl">Kg produits</div></div>`;

  document.getElementById('bj-ventes').innerHTML=v.length?`
    <table class="tbl" style="font-size:11px"><thead><tr><th>Client</th><th>Formule</th><th class="num">Qté (kg)</th><th class="num">Total (F)</th><th>Statut</th></tr></thead><tbody>
    ${v.map(x=>`<tr>
      <td>${x.client_nom||'—'}</td>
      <td style="font-size:10px">${x.formule_nom||'—'}</td>
      <td class="num">${fmtKg(x.qte_vendue)}</td>
      <td class="num" style="color:var(--gold)">${fmt(x.montant_total)}</td>
      <td><span class="badge ${x.statut_paiement==='paye'?'bdg-g':x.statut_paiement==='partiel'?'bdg-gold':'bdg-r'}" style="font-size:9px">${x.statut_paiement}</span></td>
    </tr>`).join('')}
    <tr style="font-weight:700;background:rgba(22,163,74,.05)"><td colspan="3">TOTAL</td><td class="num" style="color:var(--gold)">${fmt(caJour)}</td><td></td></tr>
    </tbody></table>`:'<div style="color:var(--textm);font-size:12px">Aucune vente ce jour.</div>';

  document.getElementById('bj-depenses').innerHTML=d.length?`
    <table class="tbl" style="font-size:11px"><thead><tr><th>Catégorie</th><th>Description</th><th class="num">Montant (F)</th></tr></thead><tbody>
    ${d.map(x=>`<tr><td><span class="badge bdg-gold" style="font-size:9px">${CAT_LABELS[x.categorie]||x.categorie}</span></td><td>${x.description}</td><td class="num" style="color:var(--red)">${fmt(x.montant)}</td></tr>`).join('')}
    <tr style="font-weight:700;background:rgba(239,68,68,.05)"><td colspan="2">TOTAL</td><td class="num" style="color:var(--red)">${fmt(depJour)}</td></tr>
    </tbody></table>`:'<div style="color:var(--textm);font-size:12px">Aucune dépense ce jour.</div>';

  document.getElementById('bj-bilan').innerHTML=`
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;font-size:13px">
      <div style="padding:12px;background:rgba(34,197,94,.08);border:1px solid rgba(34,197,94,.2);border-radius:8px">
        <div style="color:var(--textm);font-size:10px;text-transform:uppercase;margin-bottom:4px">Total recettes</div>
        <div style="font-family:'DM Mono',monospace;font-size:20px;color:var(--green)">${fmt(caJour)} F</div>
      </div>
      <div style="padding:12px;background:rgba(239,68,68,.08);border:1px solid rgba(239,68,68,.2);border-radius:8px">
        <div style="color:var(--textm);font-size:10px;text-transform:uppercase;margin-bottom:4px">Total dépenses</div>
        <div style="font-family:'DM Mono',monospace;font-size:20px;color:var(--red)">${fmt(depJour)} F</div>
      </div>
      <div style="padding:12px;background:${bilan>=0?'rgba(22,163,74,.08)':'rgba(239,68,68,.08)'};border:1px solid ${bilan>=0?'rgba(22,163,74,.3)':'rgba(239,68,68,.3)'};border-radius:8px;grid-column:1/-1">
        <div style="color:var(--textm);font-size:10px;text-transform:uppercase;margin-bottom:4px">${bilan>=0?'Bénéfice net du jour':'Perte du jour'}</div>
        <div style="font-family:'DM Mono',monospace;font-size:28px;font-weight:700;color:${bilan>=0?'var(--gold)':'var(--red)'}">${fmt(bilan)} FCFA</div>
        ${impaye>0?`<div style="font-size:11px;color:var(--red);margin-top:6px">⚠ ${fmt(impaye)} F impayés non compris</div>`:''}
      </div>
      ${l.length?`<div style="padding:12px;background:rgba(22,163,74,.05);border:1px solid rgba(22,163,74,.15);border-radius:8px;grid-column:1/-1">
        <div style="color:var(--textm);font-size:10px;text-transform:uppercase;margin-bottom:8px">🏭 Lots produits (${l.length})</div>
        ${l.map(x=>`<div style="display:flex;justify-content:space-between;font-size:12px;padding:4px 0;border-bottom:1px solid rgba(30,45,74,.3)">
          <span>${ESPECE_ICON[x.espece]||''} ${x.formule_nom}</span>
          <span style="color:var(--g6);font-weight:700">${fmt(x.qte_produite)} kg</span>
        </div>`).join('')}
        <div style="display:flex;justify-content:space-between;font-size:12px;padding:6px 0;font-weight:700">
          <span>TOTAL PRODUIT</span><span style="color:var(--g6)">${fmt(prodJour)} kg</span>
        </div>
      </div>`:''}
    </div>
    <div style="margin-top:12px">
      <button class="btn btn-print no-print" onclick="imprimerRapportJour('${date}','${dateAff}',${caJour},${depJour},${impaye},${prodJour},${bilan})" style="width:100%;justify-content:center">
        🖨️ Imprimer le rapport du jour
      </button>
    </div>`;
}

function imprimerRapportJour(date, dateAff, ca, dep, impaye, prod, bilan){
  const cfg=GP_CONFIG||{};
  const logoHtml=cfg.logo_url?`<img src="${cfg.logo_url}" style="height:50px;object-fit:contain">`:'<span style="font-size:30px">🌾</span>';

  // Récupérer les données déjà affichées
  const ventesHtml=document.getElementById('bj-ventes').innerHTML;
  const depHtml=document.getElementById('bj-depenses').innerHTML;
  const lotsHtml=document.getElementById('bj-bilan').querySelector('[style*="Lots produits"]')?.outerHTML||'';

  const html=`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Rapport du ${date}</title>
  <style>
    @page{size:A4;margin:12mm}
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:Arial,sans-serif;font-size:11px;color:#000;background:#fff}
    .header{display:flex;justify-content:space-between;align-items:center;border-bottom:2px solid #1b5e20;padding-bottom:10px;margin-bottom:14px}
    .header-right{text-align:right}
    .title{font-size:18px;font-weight:bold;color:#1b5e20}
    .date{font-size:13px;color:#555;margin-top:2px}
    .kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:14px}
    .kpi{border:1px solid #ddd;border-radius:6px;padding:10px;text-align:center}
    .kpi-val{font-size:18px;font-weight:bold;margin-bottom:2px}
    .kpi-lbl{font-size:9px;color:#555;text-transform:uppercase}
    .section{margin-bottom:14px}
    .section-title{font-size:11px;font-weight:bold;color:#1b5e20;text-transform:uppercase;letter-spacing:1px;border-bottom:1px solid #c8e6c9;padding-bottom:4px;margin-bottom:8px}
    table{width:100%;border-collapse:collapse;font-size:10px}
    th{background:#1b5e20;color:#fff;padding:4px 6px;text-align:left}
    td{padding:4px 6px;border-bottom:1px solid #eee}
    .num{text-align:right}
    .bilan-box{border:2px solid #1b5e20;border-radius:8px;padding:14px;text-align:center;margin-top:10px}
    .bilan-val{font-size:28px;font-weight:bold;color:${bilan>=0?'#1b5e20':'#dc2626'}}
    .footer{margin-top:16px;border-top:1px solid #ddd;padding-top:8px;font-size:9px;color:#777;display:flex;justify-content:space-between}
    @media print{button{display:none}}
  </style></head><body>
  <div class="header">
    <div style="display:flex;align-items:center;gap:12px">
      ${logoHtml}
      <div>
        <div style="font-weight:bold;font-size:14px">${cfg.nom_provenderie||'Provenderie'}</div>
        <div style="font-size:10px;color:#555">${cfg.telephone||''} ${cfg.localisation?'· '+cfg.localisation:''}</div>
      </div>
    </div>
    <div class="header-right">
      <div class="title">Rapport Journalier</div>
      <div class="date">${dateAff}</div>
    </div>
  </div>

  <div class="kpis">
    <div class="kpi"><div class="kpi-val" style="color:#16a34a">${fmt(ca)}</div><div class="kpi-lbl">Recettes (F)</div></div>
    <div class="kpi"><div class="kpi-val" style="color:#dc2626">${fmt(dep)}</div><div class="kpi-lbl">Dépenses (F)</div></div>
    <div class="kpi"><div class="kpi-val" style="color:${impaye>0?'#dc2626':'#16a34a'}">${fmt(impaye)}</div><div class="kpi-lbl">Impayés (F)</div></div>
    <div class="kpi"><div class="kpi-val">${fmt(prod)}</div><div class="kpi-lbl">Kg produits</div></div>
  </div>

  <div class="section">
    <div class="section-title">💰 Ventes du jour</div>
    ${ventesHtml}
  </div>

  <div class="section">
    <div class="section-title">🏭 Production du jour</div>
    ${lotsHtml||'<div style="color:#777;font-size:11px">Aucune production ce jour.</div>'}
  </div>

  <div class="section">
    <div class="section-title">💸 Dépenses du jour</div>
    ${depHtml}
  </div>

  <div class="bilan-box">
    <div style="font-size:11px;color:#555;text-transform:uppercase;margin-bottom:6px">${bilan>=0?'Bénéfice net du jour':'Perte du jour'}</div>
    <div class="bilan-val">${fmt(bilan)} FCFA</div>
    ${impaye>0?`<div style="font-size:10px;color:#dc2626;margin-top:6px">⚠ ${fmt(impaye)} F d'impayés non inclus</div>`:''}
  </div>

  <div class="footer">
    <div>Généré par PROVENDA · avifarmer.net</div>
    <div>Imprimé le ${new Date().toLocaleDateString('fr-FR')}</div>
  </div>
  <div style="text-align:center;margin-top:10px">
    <button onclick="window.print()" style="padding:8px 24px;background:#1b5e20;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:13px">🖨️ Imprimer</button>
  </div>
  </body></html>`;

  const w=window.open('','_blank','width=900,height=700');
  w.document.write(html);
  w.document.close();
}

// ── REMISES ────────────────────────────────────────
async function checkPendingRemises(){
  if(GP_ROLE!=='admin')return;
  const{data}=await SB.from('gp_remises_attente').select('*').eq('admin_id',GP_ADMIN_ID).eq('statut','attente');
  const n=(data||[]).length;
  const badge=document.getElementById('notif-remises');
  if(n>0){badge.classList.remove('hidden');badge.textContent=n;}
  else badge.classList.add('hidden');
}
async function renderRemises(){
  const{data}=await SB.from('gp_remises_attente').select('*').eq('admin_id',GP_ADMIN_ID).eq('statut','attente').order('created_at',{ascending:false});
  const R=data||[];
  document.getElementById('remises-liste').innerHTML=R.length?R.map(r=>`
    <div class="card" style="border-left:3px solid var(--gold)">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:10px">
        <div>
          <div style="font-weight:700;font-size:13px">${r.client_nom||'—'}</div>
          <div style="font-size:11px;color:var(--textm);margin-top:2px">${r.formule_nom||'—'} · ${fmtKg(r.qte)} kg</div>
          <div style="margin-top:6px;font-size:12px">
            Prix : <strong>${fmt(r.prix_base)} F/kg</strong> · Remise : <strong style="color:var(--red)">${fmt(r.remise)} F</strong>
            (${r.qte*r.prix_base>0?(r.remise/(r.qte*r.prix_base)*100).toFixed(1):0}%)
          </div>
          <div style="font-size:11px;color:var(--textm)">Total demandé : ${fmt(r.qte*r.prix_base-r.remise)} F</div>
        </div>
        <div style="display:flex;gap:8px">
          <button class="btn btn-g btn-sm" onclick="validerRemise('${r.id}','validee')">✅ Valider</button>
          <button class="btn btn-red btn-sm" onclick="validerRemise('${r.id}','refusee')">❌ Refuser</button>
        </div>
      </div>
    </div>`).join(''):'<div class="card" style="text-align:center;color:var(--textm);font-size:13px;padding:20px">✅ Aucune remise en attente.</div>';
}
async function validerRemise(id,statut){
  await SB.from('gp_remises_attente').update({statut}).eq('id',id);
  notify(statut==='validee'?'Remise validée ✓':'Remise refusée',statut==='validee'?'gold':'r');
  renderRemises();checkPendingRemises();
}