// ══════════════════════════════════════════════════
// PROVENDA — MODULE ACHATS MP (Workflow 3 niveaux)
// Logistique → Secrétaire → DAF
// ══════════════════════════════════════════════════

let ACHAT_LIGNES = []; // lignes du bon en cours

// ── PAGE PRINCIPALE ───────────────────────────────
async function renderAchats(){
  await populateFournisseurSelect();
  populateIngredientsAchat();

  const{data}=await SB.from('gp_achats').select('*')
    .eq('admin_id',GP_ADMIN_ID)
    .order('created_at',{ascending:false}).limit(50);
  const A=data||[];

  // KPIs
  const enCours=A.filter(a=>!['valide_daf','annule'].includes(a.statut)).length;
  const aValider=A.filter(a=>a.statut==='recu_complet'||a.statut==='recu_partiel').length;
  const totalMois=A.filter(a=>a.date_commande?.startsWith(thisMonth())).reduce((s,a)=>s+Number(a.montant_total||0),0);

  document.getElementById('achats-kpis').innerHTML=`
    <div class="econo-box"><div class="econo-val">${enCours}</div><div class="econo-lbl">En cours</div></div>
    <div class="econo-box"><div class="econo-val" style="color:${aValider>0?'var(--gold)':'var(--green)'}">${aValider}</div><div class="econo-lbl">À valider DAF</div></div>
    <div class="econo-box"><div class="econo-val" style="color:var(--gold)">${fmt(totalMois)}</div><div class="econo-lbl">Achats ce mois (F)</div></div>
    <div class="econo-box"><div class="econo-val">${A.filter(a=>a.statut==='valide_daf').length}</div><div class="econo-lbl">Validés</div></div>`;

  // Liste
  document.getElementById('achats-liste').innerHTML=A.length?`
    <div style="overflow-x:auto"><table class="tbl" style="font-size:11px">
      <thead><tr><th>Date</th><th>Réf</th><th>Fournisseur</th><th class="num">Montant</th><th class="num">Payé</th><th>Statut</th><th>Actions</th></tr></thead>
      <tbody>
      ${A.map(a=>{
        const reste=Number(a.montant_total||0)-Number(a.montant_paye||0);
        return `<tr>
          <td style="font-size:10px;font-family:'DM Mono',monospace">${a.date_commande}</td>
          <td style="font-size:10px;font-weight:600">${a.ref||'—'}</td>
          <td style="font-weight:600">${a.fournisseur_nom||'—'}</td>
          <td class="num">${fmt(a.montant_total)}</td>
          <td class="num" style="color:${reste>0?'var(--red)':'var(--green)'}">${reste>0?fmt(Number(a.montant_paye||0))+' F':'✓ Payé'}</td>
          <td>${statutAchatBadge(a.statut)}</td>
          <td><div style="display:flex;gap:3px">${actionsAchat(a)}</div></td>
        </tr>`;
      }).join('')}
      </tbody>
    </table></div>`:'<div style="color:var(--textm);font-size:12px">Aucun achat enregistré.</div>';
}

function statutAchatBadge(s){
  const labels={
    brouillon:'⏳ Brouillon',confirme:'✅ Confirmé',
    en_livraison:'🚚 En livraison',recu_partiel:'⚠ Reçu partiel',
    recu_complet:'📦 Reçu complet',valide_daf:'✅ Validé DAF',annule:'❌ Annulé'
  };
  const colors={
    brouillon:'bdg-gold',confirme:'bdg-b',en_livraison:'bdg-b',
    recu_partiel:'bdg-gold',recu_complet:'bdg-g',valide_daf:'bdg-g',annule:'bdg-r'
  };
  return `<span class="badge ${colors[s]||'bdg-gold'}" style="font-size:9px">${labels[s]||s}</span>`;
}

function actionsAchat(a){
  let btns='';
  // Logistique/Admin : confirmer
  if(a.statut==='brouillon'){
    btns+=`<button class="btn btn-g btn-sm" onclick="confirmerAchat('${a.id}')">✓ Confirmer</button>`;
  }
  // Secrétaire/Admin : confirmer réception
  if(['confirme','en_livraison'].includes(a.statut)&&(GP_ROLE==='secretaire'||GP_ROLE==='admin'||GP_ROLE==='logistique')){
    btns+=`<button class="btn btn-out btn-sm" onclick="ouvrirReception('${a.id}')">📦 Réception</button>`;
  }
  // DAF/Admin : valider
  if(['recu_complet','recu_partiel'].includes(a.statut)&&(GP_ROLE==='daf'||GP_ROLE==='admin')){
    btns+=`<button class="btn btn-g btn-sm" onclick="validerAchatDAF('${a.id}',true)">✅ Valider</button>`;
    btns+=`<button class="btn btn-red btn-sm" onclick="validerAchatDAF('${a.id}',false)">✕</button>`;
  }
  // Voir détail
  btns+=`<button class="btn btn-out btn-sm" onclick="voirDetailAchat('${a.id}')">👁</button>`;
  return btns;
}

// ── CRÉER UN BON DE COMMANDE ──────────────────────
function ajouterLigneAchat(){
  const ingr=document.getElementById('achat_ingr')?.value;
  const ingrNom=document.getElementById('achat_ingr')?.options[document.getElementById('achat_ingr').selectedIndex]?.text?.split(' (')[0];
  const qte=+document.getElementById('achat_qte')?.value||0;
  const prix=+document.getElementById('achat_prix')?.value||0;

  if(!ingr||!qte||!prix){notify('Sélectionnez un ingrédient, quantité et prix','r');return;}

  // Vérifier augmentation de prix
  const ingrData=GP_INGREDIENTS.find(i=>i.id===ingr);
  if(ingrData&&prix>ingrData.prix_actuel&&ingrData.prix_actuel>0){
    const pct=((prix-ingrData.prix_actuel)/ingrData.prix_actuel*100).toFixed(1);
    if(!confirm(`⚠️ Prix en hausse de ${pct}% !\nPrix habituel : ${fmt(ingrData.prix_actuel)} F/kg\nNouveaux prix : ${fmt(prix)} F/kg\n\nConfirmer quand même ?`)) return;
  }

  ACHAT_LIGNES.push({ingredient_id:ingr,ingredient_nom:ingrNom,qte_commandee:qte,prix_unitaire:prix,montant_ligne:qte*prix});
  document.getElementById('achat_qte').value='';
  document.getElementById('achat_prix').value='';
  renderLignesAchat();
}

function supprimerLigneAchat(idx){
  ACHAT_LIGNES.splice(idx,1);
  renderLignesAchat();
}

function renderLignesAchat(){
  const total=ACHAT_LIGNES.reduce((s,l)=>s+l.montant_ligne,0);
  document.getElementById('achat-lignes-preview').innerHTML=ACHAT_LIGNES.length?`
    <table class="tbl" style="font-size:11px;margin-top:8px">
      <thead><tr><th>Ingrédient</th><th class="num">Qté (kg)</th><th class="num">Prix/kg</th><th class="num">Montant</th><th></th></tr></thead>
      <tbody>
      ${ACHAT_LIGNES.map((l,i)=>`<tr>
        <td style="font-weight:600">${l.ingredient_nom}</td>
        <td class="num">${fmtKg(l.qte_commandee)}</td>
        <td class="num">${fmt(l.prix_unitaire)} F</td>
        <td class="num" style="color:var(--gold)">${fmt(l.montant_ligne)} F</td>
        <td><button class="btn btn-red btn-sm" onclick="supprimerLigneAchat(${i})">✕</button></td>
      </tr>`).join('')}
      <tr style="font-weight:700;background:rgba(22,163,74,.05)">
        <td colspan="3">TOTAL</td>
        <td class="num" style="color:var(--gold)">${fmt(total)} F</td>
        <td></td>
      </tr>
      </tbody>
    </table>`:'';
}

async function saveAchat(){
  const fournId=document.getElementById('achat_fournisseur')?.value;
  const fournNom=document.getElementById('achat_fournisseur')?.options[document.getElementById('achat_fournisseur').selectedIndex]?.text;
  const date=document.getElementById('achat_date')?.value||today();
  const dateLiv=document.getElementById('achat_date_liv')?.value||null;
  const condition=document.getElementById('achat_condition')?.value||'livraison';
  const note=document.getElementById('achat_note')?.value.trim()||null;
  const err=document.getElementById('achat_err');

  if(!fournId){err.textContent='Sélectionnez un fournisseur.';return;}
  if(!ACHAT_LIGNES.length){err.textContent='Ajoutez au moins un ingrédient.';return;}

  const total=ACHAT_LIGNES.reduce((s,l)=>s+l.montant_ligne,0);
  const ref='BC-'+Date.now().toString().slice(-6);

  const{data:achat,error}=await SB.from('gp_achats').insert({
    admin_id:GP_ADMIN_ID,fournisseur_id:fournId,fournisseur_nom:fournNom,
    ref,date_commande:date,date_livraison_prev:dateLiv,
    condition_paiement:condition,note_logistique:note,
    montant_total:total,montant_paye:0,
    statut:'brouillon',cree_par:GP_USER.id,
    cree_par_nom:GP_USER.email
  }).select().single();

  if(error){err.textContent='Erreur: '+error.message;return;}

  // Insérer les lignes
  await SB.from('gp_achats_lignes').insert(
    ACHAT_LIGNES.map(l=>({...l,achat_id:achat.id,admin_id:GP_ADMIN_ID}))
  );

  ACHAT_LIGNES=[];
  renderLignesAchat();
  err.textContent='';
  ['achat_note'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});
  renderAchats();
  notify(`Bon de commande ${ref} créé ✓`,'gold');
}

// ── CONFIRMER ─────────────────────────────────────
async function confirmerAchat(id){
  await SB.from('gp_achats').update({statut:'confirme'}).eq('id',id);
  renderAchats();
  notify('Commande confirmée ✓','gold');
}

// ── RÉCEPTION ────────────────────────────────────
async function ouvrirReception(achatId){
  const{data:lignes}=await SB.from('gp_achats_lignes').select('*').eq('achat_id',achatId);
  const L=lignes||[];
  const modal=document.getElementById('modal-reception');
  document.getElementById('reception-achat-id').value=achatId;
  document.getElementById('reception-lignes').innerHTML=`
    <table class="tbl" style="font-size:11px">
      <thead><tr><th>Ingrédient</th><th class="num">Commandé</th><th class="num">Quantité reçue</th></tr></thead>
      <tbody>
      ${L.map(l=>`<tr>
        <td style="font-weight:600">${l.ingredient_nom}</td>
        <td class="num">${fmtKg(l.qte_commandee)} kg</td>
        <td class="num"><input type="number" id="rec-${l.id}" value="${l.qte_commandee}" step="0.1"
          style="width:90px;text-align:right;font-size:11px;padding:3px 6px" oninput="checkEcartReception('${l.id}',${l.qte_commandee})">
          <span id="ecart-${l.id}" style="font-size:10px;display:block"></span>
        </td>
      </tr>`).join('')}
      </tbody>
    </table>`;
  modal.style.display='flex';
}

function checkEcartReception(ligneId,qteCmdee){
  const recu=+document.getElementById('rec-'+ligneId)?.value||0;
  const el=document.getElementById('ecart-'+ligneId);
  if(!el)return;
  const ecart=recu-qteCmdee;
  if(Math.abs(ecart)<0.01){el.textContent='';return;}
  el.style.color=ecart<0?'var(--red)':'var(--green)';
  el.textContent=ecart<0?`⚠ Manque ${fmtKg(Math.abs(ecart))} kg`:`+${fmtKg(ecart)} kg en surplus`;
}

async function confirmerReception(){
  const achatId=document.getElementById('reception-achat-id')?.value;
  const note=document.getElementById('reception-note')?.value.trim()||null;
  const{data:lignes}=await SB.from('gp_achats_lignes').select('*').eq('achat_id',achatId);
  const L=lignes||[];

  let aDesEcarts=false;
  const updates=L.map(l=>{
    const recu=+document.getElementById('rec-'+l.id)?.value||0;
    if(Math.abs(recu-l.qte_commandee)>0.01)aDesEcarts=true;
    return SB.from('gp_achats_lignes').update({qte_recue:recu}).eq('id',l.id);
  });
  await Promise.all(updates);

  const statut=aDesEcarts?'recu_partiel':'recu_complet';
  await SB.from('gp_achats').update({
    statut,note_reception:note,
    recu_par:GP_USER.id,recu_par_nom:GP_USER.email
  }).eq('id',achatId);

  if(aDesEcarts){
    notify('⚠ Des écarts ont été détectés — En attente de validation DAF','gold');
  } else {
    notify('Réception confirmée ✓ — En attente de validation DAF','gold');
  }
  document.getElementById('modal-reception').style.display='none';
  renderAchats();
}

// ── VALIDATION DAF ────────────────────────────────
async function validerAchatDAF(achatId,approuve){
  if(!approuve){
    const raison=prompt('Raison de l\'annulation :');
    if(!raison)return;
    await SB.from('gp_achats').update({
      statut:'annule',note_daf:raison,
      valide_par:GP_USER.id,valide_par_nom:GP_USER.email
    }).eq('id',achatId);
    notify('Achat annulé par le DAF','r');
    renderAchats();
    return;
  }

  // Valider — mettre à jour le stock MP
  const{data:lignes}=await SB.from('gp_achats_lignes').select('*').eq('achat_id',achatId);
  const{data:achat}=await SB.from('gp_achats').select('*').eq('id',achatId).single();
  const L=lignes||[];

  // Créer les entrées stock
  const stockEntrees=L.map(l=>({
    admin_id:GP_ADMIN_ID,saisi_par:GP_USER.id,
    type:'entree',date:achat.date_commande,
    ingredient_id:l.ingredient_id,ingredient_nom:l.ingredient_nom,
    quantite:l.qte_recue||l.qte_commandee,
    prix_unit:l.prix_unitaire,
    ref:'Achat '+achat.ref,note:'Validé DAF'
  }));
  await SB.from('gp_stock_mp').insert(stockEntrees);

  // Mettre à jour le prix actuel des ingrédients
  for(const l of L){
    if(l.ingredient_id){
      await SB.from('gp_ingredients').update({prix_actuel:l.prix_unitaire}).eq('id',l.ingredient_id);
    }
  }

  await SB.from('gp_achats').update({
    statut:'valide_daf',
    valide_par:GP_USER.id,valide_par_nom:GP_USER.email
  }).eq('id',achatId);

  notify('Achat validé et stock mis à jour ✓','gold');
  renderAchats();
  renderStockNiveaux();
}

// ── DÉTAIL ACHAT ──────────────────────────────────
async function voirDetailAchat(id){
  const{data:a}=await SB.from('gp_achats').select('*').eq('id',id).single();
  const{data:lignes}=await SB.from('gp_achats_lignes').select('*').eq('achat_id',id);
  const{data:paiements}=await SB.from('gp_achats_paiements').select('*').eq('achat_id',id).order('date_paiement');
  if(!a)return;
  const L=lignes||[];const P=paiements||[];
  const modal=document.getElementById('modal-detail-achat');
  document.getElementById('detail-achat-content').innerHTML=`
    <div style="margin-bottom:12px">
      <div style="font-size:13px;font-weight:700">${a.fournisseur_nom||'—'} · ${a.ref||'—'}</div>
      <div style="font-size:11px;color:var(--textm)">${a.date_commande} · ${condLabel(a.condition_paiement)} · ${statutAchatBadge(a.statut)}</div>
    </div>
    <div style="font-size:11px;font-weight:700;color:var(--g6);margin-bottom:6px">Ingrédients commandés</div>
    <table class="tbl" style="font-size:11px;margin-bottom:12px">
      <thead><tr><th>Ingrédient</th><th class="num">Commandé</th><th class="num">Reçu</th><th class="num">Prix/kg</th><th class="num">Montant</th></tr></thead>
      <tbody>${L.map(l=>{
        const ecart=Number(l.qte_recue||0)-Number(l.qte_commandee||0);
        return `<tr>
          <td>${l.ingredient_nom}</td>
          <td class="num">${fmtKg(l.qte_commandee)} kg</td>
          <td class="num ${ecart<-0.01?'bad':''}">${l.qte_recue?fmtKg(l.qte_recue)+' kg':'—'}${ecart<-0.01?`<br><span style="color:var(--red);font-size:9px">Écart: ${fmtKg(ecart)} kg</span>`:''}</td>
          <td class="num">${fmt(l.prix_unitaire)} F</td>
          <td class="num">${fmt(l.montant_ligne)} F</td>
        </tr>`;}).join('')}
      <tr style="font-weight:700"><td colspan="4">TOTAL</td><td class="num" style="color:var(--gold)">${fmt(a.montant_total)} F</td></tr>
      </tbody>
    </table>
    <div style="font-size:11px;font-weight:700;color:var(--g6);margin-bottom:6px">Historique paiements</div>
    ${P.length?`<table class="tbl" style="font-size:11px">
      <thead><tr><th>Date</th><th>Mode</th><th>Réf</th><th class="num">Montant</th></tr></thead>
      <tbody>${P.map(p=>`<tr>
        <td>${p.date_paiement}</td>
        <td>${p.mode_paiement}</td>
        <td>${p.reference||'—'}</td>
        <td class="num" style="color:var(--green)">${fmt(p.montant)} F</td>
      </tr>`).join('')}
      <tr style="font-weight:700"><td colspan="3">TOTAL PAYÉ</td><td class="num" style="color:var(--green)">${fmt(a.montant_paye)} F</td></tr>
      </tbody>
    </table>`:'<div style="color:var(--textm);font-size:12px">Aucun paiement enregistré.</div>'}
    ${a.note_logistique?`<div style="margin-top:8px;font-size:11px"><strong>Note logistique :</strong> ${a.note_logistique}</div>`:''}
    ${a.note_reception?`<div style="font-size:11px"><strong>Note réception :</strong> ${a.note_reception}</div>`:''}
    ${a.note_daf?`<div style="font-size:11px"><strong>Note DAF :</strong> ${a.note_daf}</div>`:''}`;
  modal.style.display='flex';
}

function populateIngredientsAchat(){
  const sel=document.getElementById('achat_ingr');
  if(!sel)return;
  sel.innerHTML='<option value="">— Sélectionner —</option>'+
    [...GP_INGREDIENTS].sort((a,b)=>a.nom.localeCompare(b.nom))
    .map(i=>`<option value="${i.id}">${i.nom} (${fmt(i.prix_actuel||0)} F/kg)</option>`).join('');
}
