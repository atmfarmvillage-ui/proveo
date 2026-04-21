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
  const clientId=document.getElementById('vt_client')?.value;
  const note=document.getElementById('vt_note')?.value.trim()||null;
  const paye=+document.getElementById('vt_paye')?.value||0;
  const pv=GP_POINT_VENTE||document.getElementById('vt_pv')?.value.trim()||null;
  const err=document.getElementById('vt_err');

  if(!VT_LIGNES.length){err.textContent='Ajoutez au moins un produit.';return;}

  const total=VT_LIGNES.reduce((s,l)=>s+l.montant_ligne,0);
  const statut=paye<=0?'impaye':paye>=total?'paye':'partiel';

  // Déterminer type client
  const client=GP_CLIENTS.find(c=>c.id===clientId);
  const typeClient=client?.type_client||'detail';

  const{data:vente,error}=await SB.from('gp_ventes').insert({
    admin_id:GP_ADMIN_ID,
    client_id:clientId||null,
    client_nom:client?.nom||'Client comptant',
    montant_total:total,
    montant_paye:paye,
    statut_paiement:statut,
    type_client:typeClient,
    nb_produits:VT_LIGNES.length,
    point_vente:pv,
    note,
    date:today(),
    saisi_par:GP_USER?.id,
    formule_nom:VT_LIGNES.map(l=>l.formule_nom).join(', ')
  }).select().single();

  if(error){err.textContent='Erreur: '+error.message;return;}

  // Insérer les lignes
  await SB.from('gp_ventes_lignes').insert(
    VT_LIGNES.map(l=>({
      vente_id:vente.id,admin_id:GP_ADMIN_ID,
      formule_nom:l.formule_nom,quantite:l.quantite,
      prix_unitaire:l.prix_unitaire,montant_ligne:l.montant_ligne,
      type_prix:l.type_prix
    }))
  );

  // Mouvement caisse automatique
  if(paye>0){
    const{data:caisses}=await SB.from('gp_caisses').select('id')
      .eq('admin_id',GP_ADMIN_ID)
      .eq('point_vente',pv||'').single();
    if(caisses){
      await SB.from('gp_mouvements_caisse').insert({
        admin_id:GP_ADMIN_ID,caisse_id:caisses.id,
        type:'entree',categorie:'vente',
        montant:paye,date_mouvement:today(),
        description:'Vente '+vente.id.slice(0,8),
        vente_id:vente.id,
        enregistre_par:GP_USER?.id,
        enregistre_par_nom:GP_USER?.email?.split('@')[0]
      });
    }
  }

  // Déduire du stock PDV si applicable
  if(GP_POINT_VENTE){
    for(const l of VT_LIGNES){
      const{data:stock}=await SB.from('gp_stock_produits_pdv').select('*')
        .eq('admin_id',GP_ADMIN_ID).eq('pdv_nom',GP_POINT_VENTE)
        .eq('formule_nom',l.formule_nom).single();
      if(stock){
        const newQte=Math.max(0,Number(stock.qte_disponible)-Number(l.quantite));
        await SB.from('gp_stock_produits_pdv').update({qte_disponible:newQte,updated_at:new Date().toISOString()})
          .eq('id',stock.id);
        // Vérifier seuil critique
        if(newQte<=stock.seuil_critique){
          envoyerAlerteSeuil(GP_POINT_VENTE,l.formule_nom,newQte,stock.seuil_critique);
        }
      }
    }
  }

  VT_LIGNES=[];renderLignesVente();
  ['vt_note','vt_paye'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});
  document.getElementById('vt_client').value='';
  err.textContent='';
  if(paye>0) imprimerRecu(vente.id);
  notify('Vente enregistrée ✓','gold');
  renderVentes();
}

async function envoyerAlerteSeuil(pdvNom,formule,qteActuelle,seuil){
  const cfg=GP_CONFIG||{};
  const apikey=cfg.callmebot_apikey||'';
  const tel=(cfg.tel_alerte_stock||cfg.telephone||'').replace(/[\s\-\+]/g,'').replace(/^228/,'');
  if(!apikey||!tel)return;
  const msg=encodeURIComponent(
    `⚠️ Stock critique PDV\n`+
    `📍 ${pdvNom}\n`+
    `🌾 ${formule}\n`+
    `Quantité restante : ${qteActuelle} sacs\n`+
    `Seuil : ${seuil} sacs\n\n`+
    `Veuillez réapprovisionner.`
  );
  fetch(`https://api.callmebot.com/whatsapp.php?phone=228${tel}&text=${msg}&apikey=${apikey}`).catch(()=>{});
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
// ── LIGNES DE VENTE ───────────────────────────────
let VT_LIGNES = [];

function ajouterLigneVente(){
  const formule=document.getElementById('vt_formule')?.value;
  const qte=+document.getElementById('vt_qte')?.value||0;
  const clientId=document.getElementById('vt_client')?.value;
  const client=GP_CLIENTS.find(c=>c.id===clientId);
  const typeClient=client?.type_client||'detail';
  const err=document.getElementById('vt_err');

  if(!formule||!qte){err.textContent='Sélectionnez un produit et une quantité.';return;}

  // Déterminer le prix selon type client
  const prixGros=GP_PRIX_GROS?.[formule]||0;
  const prixDetail=GP_PRIX?.[formule]||0;
  const typePrix=typeClient==='gros'?'gros':'detail';
  const prixUnit=typePrix==='gros'?prixGros:prixDetail;

  // Alerte si quantité grosse mais type détail
  const seuilGros=10; // à rendre configurable
  if(qte>=seuilGros&&typePrix==='detail'&&prixGros>0){
    if(!confirm(`Ce client achète ${qte} sacs. Voulez-vous appliquer le prix gros (${fmt(prixGros)} F) ?`)){
      // garder détail
    } else {
      VT_LIGNES.push({formule_nom:formule,quantite:qte,prix_unitaire:prixGros,montant_ligne:qte*prixGros,type_prix:'gros'});
      document.getElementById('vt_qte').value='';
      renderLignesVente();
      return;
    }
  }

  VT_LIGNES.push({formule_nom:formule,quantite:qte,prix_unitaire:prixUnit,montant_ligne:qte*prixUnit,type_prix:typePrix});
  document.getElementById('vt_qte').value='';
  err.textContent='';
  renderLignesVente();
}

function supprimerLigneVente(idx){
  VT_LIGNES.splice(idx,1);
  renderLignesVente();
}

function renderLignesVente(){
  const total=VT_LIGNES.reduce((s,l)=>s+l.montant_ligne,0);
  const container=document.getElementById('vt-lignes-preview');
  if(!container)return;
  container.innerHTML=VT_LIGNES.length?`
    <table class="tbl" style="font-size:11px;margin-top:8px">
      <thead><tr><th>Produit</th><th class="num">Qté</th><th class="num">Prix unit.</th><th class="num">Montant</th><th></th></tr></thead>
      <tbody>
      ${VT_LIGNES.map((l,i)=>`<tr>
        <td style="font-weight:600">${l.formule_nom}
          <span class="badge ${l.type_prix==='gros'?'bdg-gold':'bdg-g'}" style="font-size:8px;margin-left:4px">${l.type_prix}</span>
        </td>
        <td class="num">${l.quantite}</td>
        <td class="num">${fmt(l.prix_unitaire)} F</td>
        <td class="num" style="color:var(--gold)">${fmt(l.montant_ligne)} F</td>
        <td><button class="btn btn-red btn-sm" onclick="supprimerLigneVente(${i})">✕</button></td>
      </tr>`).join('')}
      <tr style="font-weight:700">
        <td colspan="3">TOTAL</td>
        <td class="num" style="color:var(--gold)">${fmt(total)} F</td>
        <td></td>
      </tr>
      </tbody>
    </table>`:'';
}

// Recherche client par téléphone
function rechercherClientTel(){
  const search=(document.getElementById('vt_tel_search')?.value||'').toLowerCase();
  const results=document.getElementById('vt_client_results');
  if(!results)return;
  if(search.length<2){results.style.display='none';return;}
  const found=GP_CLIENTS.filter(c=>
    (c.telephone||'').toLowerCase().includes(search)||
    (c.nom||'').toLowerCase().includes(search)
  ).slice(0,6);
  if(!found.length){results.style.display='none';return;}
  results.style.display='block';
  results.innerHTML=found.map(c=>`
    <div onclick="selectionnerClientVente('${c.id}')"
      style="padding:8px 12px;cursor:pointer;font-size:12px;border-bottom:1px solid var(--border)"
      onmouseover="this.style.background='rgba(22,163,74,.1)'"
      onmouseout="this.style.background=''">
      <div style="font-weight:600">${c.nom}
        <span class="badge ${c.type_client==='gros'?'bdg-gold':'bdg-g'}" style="font-size:8px;margin-left:4px">${c.type_client==='gros'?'GROSSISTE':'DÉTAILLANT'}</span>
      </div>
      <div style="font-size:10px;color:var(--textm)">${c.telephone||'—'}</div>
    </div>`).join('');
}

function selectionnerClientVente(id){
  const c=GP_CLIENTS.find(x=>x.id===id);
  if(!c)return;
  document.getElementById('vt_client').value=id;
  document.getElementById('vt_tel_search').value=c.nom+(c.telephone?' — '+c.telephone:'');
  document.getElementById('vt_client_results').style.display='none';
  // Appliquer prix selon badge client
  notify(c.type_client==='gros'?'Client GROSSISTE — prix gros appliqué':'Client DÉTAILLANT — prix détail appliqué','gold');
}

document.addEventListener('click',function(e){
  const res=document.getElementById('vt_client_results');
  const inp=document.getElementById('vt_tel_search');
  if(res&&inp&&!res.contains(e.target)&&!inp.contains(e.target)) res.style.display='none';
});
