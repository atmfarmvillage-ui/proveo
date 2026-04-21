// ══════════════════════════════════════════════════
// PROVENDA — MODULE DISTRIBUTION PDV
// ══════════════════════════════════════════════════

let GP_PDV_LIST = [];

async function renderDistribution(){
  // Charger les PDV
  const{data:pdvs}=await SB.from('gp_points_vente').select('*')
    .eq('admin_id',GP_ADMIN_ID).order('nom');
  GP_PDV_LIST=pdvs||[];

  // Remplir selects PDV
  const pdvOptions='<option value="">— Sélectionner —</option>'+
    GP_PDV_LIST.map(p=>`<option value="${p.id}">${p.nom} (${p.type_pdv||'secondaire'})</option>`).join('');
  ['dist_source','dist_dest'].forEach(id=>{
    const el=document.getElementById(id);
    if(el)el.innerHTML=pdvOptions;
  });

  // Charger livraisons
  const{data:livs}=await SB.from('gp_livraisons_pdv').select('*')
    .eq('admin_id',GP_ADMIN_ID)
    .order('created_at',{ascending:false}).limit(50);
  const L=livs||[];

  // KPIs
  const totalEnvoye=L.reduce((s,l)=>s+Number(l.montant_total||0),0);
  const totalDu=L.reduce((s,l)=>s+(Number(l.montant_total||0)-Number(l.montant_paye||0)),0);
  const enAttente=L.filter(l=>l.statut==='envoye').length;

  document.getElementById('dist-kpis').innerHTML=`
    <div class="econo-box"><div class="econo-val">${L.length}</div><div class="econo-lbl">Livraisons</div></div>
    <div class="econo-box"><div class="econo-val" style="color:var(--gold)">${fmt(totalEnvoye)}</div><div class="econo-lbl">Total livré (F)</div></div>
    <div class="econo-box"><div class="econo-val" style="color:var(--red)">${fmt(totalDu)}</div><div class="econo-lbl">Total dû (F)</div></div>
    <div class="econo-box"><div class="econo-val" style="color:${enAttente>0?'var(--gold)':'var(--green)'}">${enAttente}</div><div class="econo-lbl">En attente confirmation</div></div>`;

  // Liste
  document.getElementById('dist-liste').innerHTML=L.length?`
    <div style="overflow-x:auto"><table class="tbl" style="font-size:11px">
      <thead><tr>
        <th>Date</th><th>De → Vers</th><th>Produit</th>
        <th class="num">Qté envoyée</th><th class="num">Qté confirmée</th>
        <th class="num">Montant</th><th class="num">Payé</th>
        <th>Statut</th><th>Actions</th>
      </tr></thead>
      <tbody>
      ${L.map(l=>{
        const reste=Number(l.montant_total||0)-Number(l.montant_paye||0);
        return `<tr>
          <td style="font-size:10px">${l.date_livraison}</td>
          <td style="font-size:11px"><strong>${l.pdv_source_nom||'—'}</strong><br>→ ${l.pdv_dest_nom||'—'}</td>
          <td style="font-weight:600">${l.formule_nom}</td>
          <td class="num">${l.qte_envoyee}</td>
          <td class="num" style="color:${l.qte_confirmee<l.qte_envoyee?'var(--red)':'var(--green)'}">${l.qte_confirmee||'—'}</td>
          <td class="num">${fmt(l.montant_total)} F</td>
          <td class="num" style="color:${reste>0?'var(--red)':'var(--green)'}">${reste>0?fmt(l.montant_paye)+' F':'✓'}</td>
          <td>${statutLivBadge(l.statut,l.statut_paiement)}</td>
          <td><div style="display:flex;gap:3px">${actionsLivraison(l)}</div></td>
        </tr>`;
      }).join('')}
      </tbody>
    </table></div>`:'<div style="color:var(--textm);font-size:12px">Aucune livraison enregistrée.</div>';

  // Stock produits finis par PDV
  await renderStockPDV();
}

function statutLivBadge(statut,statutPaiement){
  const labels={envoye:'📤 Envoyé',confirme:'✅ Confirmé',litige:'⚠ Litige',solde:'✅ Soldé',annule:'❌ Annulé'};
  const colors={envoye:'bdg-gold',confirme:'bdg-g',litige:'bdg-r',solde:'bdg-g',annule:'bdg-r'};
  return `<div>
    <span class="badge ${colors[statut]}" style="font-size:9px">${labels[statut]||statut}</span>
    ${statutPaiement!=='paye'?`<span class="badge ${statutPaiement==='partiel'?'bdg-gold':'bdg-r'}" style="font-size:9px;display:block;margin-top:2px">${statutPaiement}</span>`:''}
  </div>`;
}

function actionsLivraison(l){
  let btns='';
  if(l.statut==='envoye'){
    btns+=`<button class="btn btn-g btn-sm" onclick="ouvrirConfirmationReception('${l.id}')">📦 Confirmer</button>`;
  }
  if(l.statut==='confirme'&&l.statut_paiement!=='paye'&&l.type_relation==='vente_gros'){
    btns+=`<button class="btn btn-out btn-sm" onclick="ouvrirPaiementLivraison('${l.id}','${l.pdv_dest_nom}',${Number(l.montant_total)-Number(l.montant_paye)})">💳 Payer</button>`;
  }
  btns+=`<button class="btn btn-out btn-sm" onclick="voirDetailLivraison('${l.id}')">👁</button>`;
  return btns;
}

// ── CRÉER UNE LIVRAISON ───────────────────────────
async function saveLivraison(){
  const sourceId=document.getElementById('dist_source')?.value;
  const destId=document.getElementById('dist_dest')?.value;
  const formule=document.getElementById('dist_formule')?.value;
  const qte=+document.getElementById('dist_qte')?.value||0;
  const prixGros=+document.getElementById('dist_prix')?.value||0;
  const typeRel=document.getElementById('dist_type')?.value||'vente_gros';
  const err=document.getElementById('dist_err');

  if(!sourceId||!destId||!formule||!qte||!prixGros){
    err.textContent='Tous les champs sont requis.';return;
  }
  if(sourceId===destId){err.textContent='Source et destination doivent être différents.';return;}

  const source=GP_PDV_LIST.find(p=>p.id===sourceId);
  const dest=GP_PDV_LIST.find(p=>p.id===destId);

  const{error}=await SB.from('gp_livraisons_pdv').insert({
    admin_id:GP_ADMIN_ID,
    pdv_source_id:sourceId,pdv_dest_id:destId,
    pdv_source_nom:source?.nom,pdv_dest_nom:dest?.nom,
    type_relation:typeRel,
    formule_nom:formule,
    qte_envoyee:qte,qte_confirmee:0,
    prix_gros_unitaire:prixGros,
    montant_total:qte*prixGros,
    montant_paye:0,
    statut:'envoye',
    statut_paiement:'impaye',
    envoye_par:GP_USER.id,
    date_livraison:today()
  });

  if(error){err.textContent='Erreur: '+error.message;return;}

  err.textContent='';
  ['dist_qte','dist_prix'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});
  notify(`Livraison ${formule} → ${dest?.nom} enregistrée ✓`,'gold');
  renderDistribution();
}

// ── CONFIRMATION RÉCEPTION ────────────────────────
async function ouvrirConfirmationReception(livId){
  const{data:l}=await SB.from('gp_livraisons_pdv').select('*').eq('id',livId).single();
  if(!l)return;
  const modal=document.getElementById('modal-confirm-reception');
  document.getElementById('cr-livraison-id').value=livId;
  document.getElementById('cr-info').innerHTML=`
    <div style="font-size:12px;margin-bottom:10px">
      <strong>${l.formule_nom}</strong> — ${l.qte_envoyee} sacs envoyés<br>
      <span style="color:var(--textm)">De ${l.pdv_source_nom} → ${l.pdv_dest_nom}</span>
    </div>`;
  document.getElementById('cr-qte').value=l.qte_envoyee;
  document.getElementById('cr-note').value='';
  modal.style.display='flex';
}

async function confirmerReceptionLivraison(){
  const livId=document.getElementById('cr-livraison-id')?.value;
  const qteConfirmee=+document.getElementById('cr-qte')?.value||0;
  const note=document.getElementById('cr-note')?.value.trim()||null;

  const{data:l}=await SB.from('gp_livraisons_pdv').select('*').eq('id',livId).single();
  if(!l)return;

  const statut=qteConfirmee<l.qte_envoyee?'litige':'confirme';

  await SB.from('gp_livraisons_pdv').update({
    qte_confirmee:qteConfirmee,
    statut,note,
    confirme_par:GP_USER.id
  }).eq('id',livId);

  // Mettre à jour stock PDV destination
  const{data:stockExist}=await SB.from('gp_stock_produits_pdv').select('*')
    .eq('admin_id',GP_ADMIN_ID).eq('pdv_nom',l.pdv_dest_nom).eq('formule_nom',l.formule_nom).single();

  if(stockExist){
    await SB.from('gp_stock_produits_pdv').update({
      qte_disponible:Number(stockExist.qte_disponible)+qteConfirmee,
      updated_at:new Date().toISOString()
    }).eq('id',stockExist.id);
  } else {
    await SB.from('gp_stock_produits_pdv').insert({
      admin_id:GP_ADMIN_ID,
      pdv_nom:l.pdv_dest_nom,formule_nom:l.formule_nom,
      qte_disponible:qteConfirmee,seuil_critique:10,prix_vente_local:0
    });
  }

  // Si écart → créer dette secrétaire
  if(qteConfirmee<l.qte_envoyee){
    const ecart=l.qte_envoyee-qteConfirmee;
    const montantEcart=ecart*Number(l.prix_gros_unitaire);
    notify(`⚠ Écart de ${ecart} sacs détecté — ${fmt(montantEcart)} F de différence`,'gold');
  } else {
    notify('Réception confirmée ✓','gold');
  }

  document.getElementById('modal-confirm-reception').style.display='none';
  renderDistribution();
}

// ── PAIEMENT LIVRAISON ────────────────────────────
async function ouvrirPaiementLivraison(livId,destNom,resteAPayer){
  document.getElementById('pl-livraison-id').value=livId;
  document.getElementById('pl-dest-nom').textContent=destNom;
  document.getElementById('pl-reste').textContent=fmt(resteAPayer)+' F';
  document.getElementById('pl-montant').value='';
  document.getElementById('pl-err').textContent='';
  document.getElementById('modal-paiement-livraison').style.display='flex';
}

async function savePaiementLivraison(){
  const livId=document.getElementById('pl-livraison-id')?.value;
  const montant=+document.getElementById('pl-montant')?.value||0;
  const mode=document.getElementById('pl-mode')?.value||'especes';
  const err=document.getElementById('pl-err');
  if(!montant){err.textContent='Montant requis.';return;}

  await SB.from('gp_paiements_livraison_pdv').insert({
    livraison_id:livId,admin_id:GP_ADMIN_ID,montant,mode,date_paiement:today()
  });

  const{data:l}=await SB.from('gp_livraisons_pdv').select('montant_total,montant_paye,pdv_dest_nom').eq('id',livId).single();
  if(l){
    const nouveauPaye=Number(l.montant_paye||0)+montant;
    const statutPaiement=nouveauPaye>=Number(l.montant_total)?'paye':nouveauPaye>0?'partiel':'impaye';
    const statutLiv=statutPaiement==='paye'?'solde':'confirme';
    await SB.from('gp_livraisons_pdv').update({
      montant_paye:nouveauPaye,
      statut_paiement:statutPaiement,
      statut:statutLiv
    }).eq('id',livId);

    // WhatsApp au PDV
    const reste=Number(l.montant_total)-nouveauPaye;
    const cfg=GP_CONFIG||{};
    notify(`Paiement de ${fmt(montant)} F enregistré ✓`,'gold');
  }

  document.getElementById('modal-paiement-livraison').style.display='none';
  renderDistribution();
}

// ── STOCK PRODUITS FINIS PAR PDV ─────────────────
async function renderStockPDV(){
  const{data}=await SB.from('gp_stock_produits_pdv').select('*')
    .eq('admin_id',GP_ADMIN_ID).order('pdv_nom').order('formule_nom');
  const S=data||[];

  // Grouper par PDV
  const byPDV={};
  S.forEach(s=>{
    if(!byPDV[s.pdv_nom])byPDV[s.pdv_nom]=[];
    byPDV[s.pdv_nom].push(s);
  });

  const container=document.getElementById('stock-pdv-liste');
  if(!container)return;

  if(!S.length){
    container.innerHTML='<div style="color:var(--textm);font-size:12px">Aucun stock PDV enregistré.</div>';
    return;
  }

  container.innerHTML=Object.entries(byPDV).map(([pdvNom,stocks])=>{
    const pal=pvPalette(pdvNom);
    return `<div style="border:1px solid ${pal.border};border-radius:10px;overflow:hidden;margin-bottom:10px">
      <div style="background:${pal.bg};padding:10px 14px;font-weight:700;color:${pal.text};display:flex;justify-content:space-between;align-items:center">
        <span>${pal.emoji} ${pdvNom}</span>
        <button class="btn btn-out btn-sm" onclick="ouvrirSeuilPDV('${pdvNom}')" style="font-size:10px">⚙️ Seuils</button>
      </div>
      <table class="tbl" style="font-size:11px">
        <thead><tr><th>Produit</th><th class="num">Stock</th><th class="num">Seuil</th><th class="num">Prix local</th><th>Statut</th></tr></thead>
        <tbody>${stocks.map(s=>`<tr>
          <td style="font-weight:600">${s.formule_nom}</td>
          <td class="num ${s.qte_disponible<=s.seuil_critique?'bad':''}">${s.qte_disponible} sacs</td>
          <td class="num" style="color:var(--textm)">${s.seuil_critique} sacs</td>
          <td class="num">
            ${GP_ROLE==='admin'||GP_ROLE==='secretaire'?
              `<input type="number" value="${s.prix_vente_local||0}" style="width:80px;text-align:right;font-size:10px;padding:2px 4px"
                onchange="mettreAJourPrixLocal('${s.id}',this.value)">`
              :`${fmt(s.prix_vente_local||0)} F`}
          </td>
          <td><span class="badge ${s.qte_disponible<=0?'bdg-r':s.qte_disponible<=s.seuil_critique?'bdg-gold':'bdg-g'}" style="font-size:9px">
            ${s.qte_disponible<=0?'❌ Épuisé':s.qte_disponible<=s.seuil_critique?'⚠ Critique':'✅ OK'}
          </span></td>
        </tr>`).join('')}</tbody>
      </table>
    </div>`;
  }).join('');
}

async function mettreAJourPrixLocal(stockId,prix){
  await SB.from('gp_stock_produits_pdv').update({prix_vente_local:+prix||0}).eq('id',stockId);
  notify('Prix local mis à jour ✓','gold');
}

async function ouvrirSeuilPDV(pdvNom){
  const{data}=await SB.from('gp_stock_produits_pdv').select('*')
    .eq('admin_id',GP_ADMIN_ID).eq('pdv_nom',pdvNom);
  const S=data||[];
  const modal=document.getElementById('modal-seuil-pdv');
  document.getElementById('seuil-pdv-nom').textContent=pdvNom;
  document.getElementById('seuil-pdv-content').innerHTML=S.map(s=>`
    <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid var(--border)">
      <span style="font-size:12px;font-weight:600">${s.formule_nom}</span>
      <div style="display:flex;align-items:center;gap:6px">
        <span style="font-size:11px;color:var(--textm)">Seuil :</span>
        <input type="number" value="${s.seuil_critique}" style="width:70px;text-align:right;font-size:11px;padding:3px 5px"
          onchange="mettreAJourSeuilPDV('${s.id}',this.value)">
        <span style="font-size:10px;color:var(--textm)">sacs</span>
      </div>
    </div>`).join('');
  modal.style.display='flex';
}

async function mettreAJourSeuilPDV(stockId,seuil){
  await SB.from('gp_stock_produits_pdv').update({seuil_critique:+seuil||5}).eq('id',stockId);
  notify('Seuil mis à jour ✓','gold');
}

async function voirDetailLivraison(id){
  const{data:l}=await SB.from('gp_livraisons_pdv').select('*').eq('id',id).single();
  const{data:paiements}=await SB.from('gp_paiements_livraison_pdv').select('*')
    .eq('livraison_id',id).order('date_paiement');
  if(!l)return;
  const P=paiements||[];
  const modal=document.getElementById('modal-detail-livraison');
  document.getElementById('detail-livraison-content').innerHTML=`
    <div style="margin-bottom:12px">
      <div style="font-weight:700;font-size:14px">${l.formule_nom}</div>
      <div style="font-size:11px;color:var(--textm)">${l.pdv_source_nom} → ${l.pdv_dest_nom} · ${l.date_livraison}</div>
      <div style="font-size:11px;color:var(--textm)">${l.type_relation==='depot_vente'?'🤝 Dépôt-vente':'💰 Vente au prix gros'}</div>
    </div>
    <div class="g4" style="margin-bottom:12px">
      <div class="econo-box"><div class="econo-val">${l.qte_envoyee}</div><div class="econo-lbl">Sacs envoyés</div></div>
      <div class="econo-box"><div class="econo-val" style="color:${l.qte_confirmee<l.qte_envoyee?'var(--red)':'var(--green)'}">${l.qte_confirmee||'—'}</div><div class="econo-lbl">Sacs confirmés</div></div>
      <div class="econo-box"><div class="econo-val" style="color:var(--gold)">${fmt(l.montant_total)}</div><div class="econo-lbl">Montant (F)</div></div>
      <div class="econo-box"><div class="econo-val" style="color:${Number(l.montant_total)-Number(l.montant_paye)>0?'var(--red)':'var(--green)'}">${fmt(Number(l.montant_total)-Number(l.montant_paye))}</div><div class="econo-lbl">Reste (F)</div></div>
    </div>
    ${P.length?`<div style="font-size:11px;font-weight:700;color:var(--g6);margin-bottom:6px">Paiements</div>
    <table class="tbl" style="font-size:11px">
      <thead><tr><th>Date</th><th>Mode</th><th class="num">Montant</th></tr></thead>
      <tbody>${P.map(p=>`<tr><td>${p.date_paiement}</td><td>${p.mode}</td><td class="num" style="color:var(--green)">${fmt(p.montant)} F</td></tr>`).join('')}</tbody>
    </table>`:'<div style="color:var(--textm);font-size:12px">Aucun paiement.</div>'}`;
  modal.style.display='flex';
}

function actualiserStockPDV(){renderDistribution();notify('Stock actualisé ✓','gold');}
