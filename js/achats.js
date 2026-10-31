// ══════════════════════════════════════════════════
// PROVENDA — MODULE ACHATS MP (Workflow 3 niveaux)
// Logistique → Secrétaire → DAF
// ══════════════════════════════════════════════════

let ACHAT_LIGNES = []; // lignes du bon en cours
let MODIF_LIGNES = []; // lignes du bon en cours de modification (modal)

// ── NOTIFIER L'ADMIN (DAF absent) ─────────────────
// Numéro WhatsApp de l'admin = contact provenderie.
function _adminWaUrl(msg){
  const tel = GP_CONFIG?.whatsapp || GP_CONFIG?.telephone || '';
  if(!tel || typeof detecterPays!=='function') return '';
  const p = detecterPays(tel);
  return p.numero_whatsapp ? 'https://wa.me/'+p.numero_whatsapp+'?text='+encodeURIComponent(msg) : '';
}
// Push auto à l'admin + (option) ouverture WhatsApp pré-rempli.
// Ne fait rien si l'acteur EST déjà l'admin (inutile de se notifier soi-même).
function notifierAdmin(titrePush, corpsPush, msgWa, openWa){
  const estAdmin = GP_USER?.id === GP_ADMIN_ID;
  if(estAdmin) return '';
  if(typeof pushSendToUsers === 'function' && GP_ADMIN_ID){
    try{ pushSendToUsers([GP_ADMIN_ID], titrePush, corpsPush, {tag:'achat-admin'}); }catch(e){}
  }
  const url = _adminWaUrl(msgWa);
  if(openWa && url){ try{ window.open(url,'_blank'); }catch(e){} }
  return url;
}

// ── DROIT DE PAYER LES FOURNISSEURS MP ────────────
// Autorisé : admin/gérant · Production-siège (sans PDV) · PDV de type 'principal'.
// Bloqué : secrétaires des PDV secondaires.
let GP_PEUT_PAYER_MP = null;
async function peutPayerMP(){
  if(GP_PEUT_PAYER_MP !== null) return GP_PEUT_PAYER_MP;
  if(GP_ROLE === 'admin'){ GP_PEUT_PAYER_MP = true; return true; }   // admin + gérant
  if(!GP_POINT_VENTE){ GP_PEUT_PAYER_MP = true; return true; }       // Production / siège
  try{
    const{data}=await SB.from('gp_points_vente').select('type_pdv')
      .eq('admin_id',GP_ADMIN_ID).eq('nom',GP_POINT_VENTE).maybeSingle();
    GP_PEUT_PAYER_MP = (data?.type_pdv === 'principal');
  }catch(e){ GP_PEUT_PAYER_MP = false; }
  return GP_PEUT_PAYER_MP;
}

// ── PAGE PRINCIPALE ───────────────────────────────
async function renderAchats(){
  // Recharger les ingrédients si nécessaire
  if(!GP_INGREDIENTS.length) await loadIngredients();
  await populateFournisseurSelect();
  // Préchauffer le droit de gestion (utilisé en synchrone par actionsAchat)
  if(typeof peutPayerMP==='function') await peutPayerMP();

  // Niveaux de stock MP (affichés dans la recherche d'ingrédient)
  try{
    const Smp=await _fetchAllStockMp();
    window._stockNiveaux=Smp||[];
    window._mpNiveaux=(typeof calcNiveaux==='function')?calcNiveaux(Smp||[]):{};
  }catch(e){ window._mpNiveaux=window._mpNiveaux||{}; }

  const{data}=await SB.from('gp_achats').select('*')
    .eq('admin_id',GP_ADMIN_ID)
    .order('created_at',{ascending:false}).limit(50);
  const A=data||[];

  // Lignes (MP + quantités achetées) — groupées par achat pour l'affichage
  const lignesParAchat={};
  if(A.length){
    const{data:lignes}=await SB.from('gp_achats_lignes')
      .select('achat_id,ingredient_nom,qte_commandee,qte_recue,prix_unitaire')
      .in('achat_id',A.map(a=>a.id));
    (lignes||[]).forEach(l=>{(lignesParAchat[l.achat_id]=lignesParAchat[l.achat_id]||[]).push(l);});
  }

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
          <td style="font-weight:600">${a.fournisseur_nom||'—'}
            <div style="font-size:9px;color:var(--textm);font-weight:500;line-height:1.5;margin-top:2px">${(lignesParAchat[a.id]||[]).map(l=>{
              const cmd=Number(l.qte_commandee||0);
              const rec=(l.qte_recue===null||l.qte_recue===undefined||l.qte_recue==='')?null:Number(l.qte_recue);
              const manque=(rec!==null && rec<cmd-0.01) ? cmd-rec : 0;
              return `🌾 ${l.ingredient_nom} · <b>${fmtKg(rec!==null?rec:cmd)} kg</b>`
                + (manque?` <span style="color:var(--red);font-weight:700">⚠ manque ${fmtKg(manque)} kg</span>`:'');
            }).join('<br>')||'—'}</div>
          </td>
          <td class="num">${fmt(a.montant_total)}</td>
          <td class="num" style="color:${reste>0?'var(--red)':'var(--green)'}">${reste>0?fmt(Number(a.montant_paye||0))+' F':'✓ Payé'}</td>
          <td>${statutAchatBadge(a.statut)}</td>
          <td><div style="display:flex;gap:3px">${actionsAchat(a)}</div></td>
        </tr>`;
      }).join('')}
      </tbody>
    </table>`:'<div style="color:var(--textm);font-size:12px">Aucun achat enregistré.</div>';
}

function statutAchatBadge(s){
  const labels={
    brouillon:'⏳ Brouillon',confirme:'✅ Confirmé',
    en_livraison:'🚚 En livraison',recu_partiel:'⚠ Reçu partiel',
    recu_complet:'📦 Reçu complet',valide_daf:'✅ En stock',annule:'❌ Annulé'
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
  // « Reçu partiel » en fait partie : c'est par là que le reste de la
  // livraison entre, et le crédit du stock est désormais différentiel.
  if(['confirme','en_livraison','recu_partiel'].includes(a.statut)&&(GP_ROLE==='secretaire'||GP_ROLE==='admin'||GP_ROLE==='logistique')){
    btns+=`<button class="btn ${a.statut==='recu_partiel'?'btn-g':'btn-out'} btn-sm" onclick="ouvrirReception('${a.id}')">📦 ${a.statut==='recu_partiel'?'Réception du reste':'Réception'}</button>`;
  }
  // Réception déjà faite mais stock pas encore crédité (anciens bons) : permettre de finaliser
  if(['recu_complet','recu_partiel'].includes(a.statut)&&(GP_ROLE==='daf'||GP_ROLE==='admin'||GP_ROLE==='secretaire'||GP_ROLE==='logistique')){
    btns+=`<button class="btn btn-g btn-sm" onclick="validerAchatDAF('${a.id}',true)">✅ Entrer en stock</button>`;
  }
  const gereMP = (GP_PEUT_PAYER_MP===true); // admin / Production / PDV principal
  // Modifier — tant que le bon n'est pas annulé
  if(a.statut!=='annule' && gereMP){
    btns+=`<button class="btn btn-out btn-sm" onclick="ouvrirModificationAchat('${a.id}')" title="Modifier">✏️</button>`;
  }
  // Annuler — tant que le bon n'est pas annulé
  if(a.statut!=='annule' && gereMP){
    btns+=`<button class="btn btn-red btn-sm" onclick="annulerAchat('${a.id}')" title="Annuler le bon">❌</button>`;
  }
  // Re-créditer le stock — répare un achat dont l'entrée n'est pas passée. Idempotent.
  // Visible pour les rôles qui gèrent les MP (mêmes que la réception).
  if((['admin','secretaire','logistique','daf'].includes(GP_ROLE)||GP_EST_GERANT) && a.statut!=='annule' && a.statut!=='brouillon'){
    btns+=`<button class="btn btn-out btn-sm" style="border-color:var(--g6);color:var(--g6)" onclick="recrediterAchat('${a.id}')" title="Re-créditer le stock si l'entrée n'est pas passée">🔄 Stock</button>`;
  }
  // Supprimer définitivement — n'importe quel bon, admin seul
  if(GP_ROLE==='admin'){
    btns+=`<button class="btn btn-red btn-sm" onclick="supprimerAchat('${a.id}')" title="Supprimer définitivement">🗑</button>`;
  }
  // Voir détail
  btns+=`<button class="btn btn-out btn-sm" onclick="voirDetailAchat('${a.id}')">👁</button>`;
  return btns;
}

// ── PRIX SAC ↔ KG ─────────────────────────────────
// Saisie du prix au sac OU au kg ; l'autre se calcule via le poids du sac.
// Le prix/kg reste la valeur de référence stockée dans la ligne d'achat.
function syncPrixAchat(source){
  const poidsSac=+document.getElementById('achat_poids_sac')?.value||0;
  const prixSacEl=document.getElementById('achat_prix_sac');
  const prixKgEl=document.getElementById('achat_prix');
  if(!prixSacEl||!prixKgEl)return;
  if(poidsSac<=0){
    // Sans poids de sac valide, on ne peut pas convertir
    if(source==='sac')prixKgEl.value='';
    else prixSacEl.value='';
    return;
  }
  if(source==='sac'){
    const prixSac=+prixSacEl.value||0;
    prixKgEl.value=prixSac?(prixSac/poidsSac).toFixed(2):'';
  } else {
    const prixKg=+prixKgEl.value||0;
    prixSacEl.value=prixKg?Math.round(prixKg*poidsSac):'';
  }
}

// Quand le poids du sac change : recalcule à partir du champ déjà rempli
function onPoidsSacChange(){
  const prixSac=+document.getElementById('achat_prix_sac')?.value||0;
  syncPrixAchat(prixSac>0?'sac':'kg');
}

// ── CRÉER UN BON DE COMMANDE ──────────────────────
function ajouterLigneAchat(){
  const ingr=document.getElementById('achat_ingr')?.value;
  const ingrNom=document.getElementById('achat_ingr_search')?.value.trim();
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
  const prixSacEl=document.getElementById('achat_prix_sac');
  if(prixSacEl)prixSacEl.value='';
  document.getElementById('achat_ingr').value='';
  document.getElementById('achat_ingr_search').value='';
  const sel=document.getElementById('achat_ingr_selected');
  if(sel){sel.style.display='none';sel.innerHTML='';}
  renderLignesAchat();
}

function supprimerLigneAchat(idx){
  ACHAT_LIGNES.splice(idx,1);
  renderLignesAchat();
}

function renderLignesAchat(){
  const total=ACHAT_LIGNES.reduce((s,l)=>s+l.montant_ligne,0);
  document.getElementById('achat-lignes-preview').innerHTML=ACHAT_LIGNES.length?`<table class="tbl" style="font-size:11px;margin-top:8px">
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

  // Sous clé de saisie : un bon de commande renvoyé deux fois créerait deux
  // commandes chez le même fournisseur, avec deux fois les lignes — et le
  // stock entrerait en double à la réception.
  const _envoiAchat = await idemInserer('gp_achats', {
    admin_id:GP_ADMIN_ID,fournisseur_id:fournId,fournisseur_nom:fournNom,
    ref,date_commande:date,date_livraison_prev:dateLiv,
    condition_paiement:condition,note_logistique:note,
    montant_total:total,montant_paye:0,
    statut:'brouillon',cree_par:GP_USER.id,
    cree_par_nom:GP_USER.email,
    point_vente:GP_POINT_VENTE||'Production'
  }, 'achat', '*');
  if(_envoiAchat.doublon){
    err.textContent='';
    notify('Cette commande est déjà enregistrée — rien n\'a été ajouté ✓','gold');
    idemTerminee('achat');
    if(typeof renderAchats==='function') renderAchats();
    return;
  }
  const achat=_envoiAchat.data, error=_envoiAchat.error;

  if(error){err.textContent='Erreur: '+error.message;return;}
  idemTerminee('achat');

  // Insérer les lignes
  await SB.from('gp_achats_lignes').insert(
    ACHAT_LIGNES.map(l=>({...l,achat_id:achat.id,admin_id:GP_ADMIN_ID}))
  );

  // 🔔 Notifier l'admin + la Production (membres sans point de vente) qu'un achat MP attend confirmation
  try{
    const{data:valideurs}=await SB.from('gp_membres').select('user_id')
      .eq('admin_id',GP_ADMIN_ID).is('point_vente',null);
    const ids=[...new Set([GP_ADMIN_ID,...(valideurs||[]).map(m=>m.user_id)].filter(Boolean))];
    if(typeof pushSendToUsers==='function' && ids.length){
      pushSendToUsers(ids,'🛒 Achat MP à confirmer',
        `${fournNom||'Fournisseur'} · ${fmt(total)} F — à confirmer dans Stock MP`,
        {url:'#stock',tag:'achat-mp'});
    }
  }catch(e){}

  // 📲 WhatsApp pré-rempli vers le confirmeur (Production / PDV principal).
  // Seulement si le créateur ne peut pas confirmer lui-même (secrétaire d'un PDV).
  const estConfirmeur = GP_ROLE==='admin' || !GP_POINT_VENTE;
  if(!estConfirmeur && typeof notifierConfirmeurWA==='function'){
    const lignesTxt = ACHAT_LIGNES.map(l=>`• ${l.ingredient_nom} : ${fmtKg(l.qte_commandee)} kg × ${fmt(l.prix_unitaire)} F = ${fmt(l.montant_ligne)} F`).join('\n');
    const msg = `🛒 *Achat MP à confirmer*\n`+
      `PDV : ${GP_POINT_VENTE||'Production'}\n`+
      `Fournisseur : ${fournNom||'—'}\nRéf : ${ref}\n\n`+
      `${lignesTxt}\n─────────────\nTotal : *${fmt(total)} F*\n\n`+
      `Merci de confirmer la réception et les quantités dans 📦 Stock MP.\n\n_${GP_CONFIG?.nom_provenderie||'PROVENDA'}_`;
    notifierConfirmeurWA({ titre:'Achat MP à confirmer', message:msg, cibleNom:'principal' });
  }

  ACHAT_LIGNES=[];
  renderLignesAchat();
  err.textContent='';
  ['achat_note'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});
  await renderAchats();
  notify(`Bon de commande ${ref} créé ✓`,'gold');
}

// ── MODIFIER UN ACHAT VALIDÉ (modal) ──────────────
// Ouvre le modal de modification, pré-rempli avec l'achat choisi.
async function ouvrirModificationAchat(id){
  const{data:a}=await SB.from('gp_achats').select('*').eq('id',id).maybeSingle();
  if(!a){notify('Achat introuvable','r');return;}
  const{data:lignes}=await SB.from('gp_achats_lignes').select('*').eq('achat_id',id);
  if(!GP_INGREDIENTS.length)await loadIngredients();
  // Fermer le modal détail s'il est ouvert
  const det=document.getElementById('modal-detail-achat');
  if(det)det.style.display='none';

  MODIF_LIGNES=(lignes||[]).map(l=>({
    ingredient_id:l.ingredient_id,
    ingredient_nom:l.ingredient_nom,
    qte_commandee:Number(l.qte_commandee||0),
    prix_unitaire:Number(l.prix_unitaire||0),
    montant_ligne:Number(l.montant_ligne||0)
  }));

  // Remplir le select fournisseur du modal
  const fsel=document.getElementById('modif_fournisseur');
  if(fsel){
    const{data:F}=await SB.from('gp_fournisseurs').select('id,nom')
      .eq('admin_id',GP_ADMIN_ID).order('nom');
    fsel.innerHTML='<option value="">— Sélectionner —</option>'
      +(F||[]).map(f=>`<option value="${f.id}">${f.nom}</option>`).join('');
    fsel.value=a.fournisseur_id||'';
  }

  const set=(elId,val)=>{const el=document.getElementById(elId);if(el)el.value=val;};
  set('modif_achat_id',id);
  set('modif_condition',a.condition_paiement||'livraison');
  set('modif_date',a.date_commande||today());
  set('modif_date_liv',a.date_livraison_prev||'');
  ['modif_ingr_id','modif_ingr_search','modif_ingr_qte','modif_ingr_prix'].forEach(x=>set(x,''));
  const ref=document.getElementById('modif-achat-ref');
  if(ref)ref.textContent=a.ref||'';
  const err=document.getElementById('modif_err');if(err)err.textContent='';
  renderModifLignes();
  document.getElementById('modal-modifier-achat').style.display='flex';
}

function fermerModalModif(){
  const m=document.getElementById('modal-modifier-achat');
  if(m)m.style.display='none';
  MODIF_LIGNES=[];
}

// Affiche les lignes éditables du bon en cours de modification
function renderModifLignes(){
  const c=document.getElementById('modif-lignes');
  if(!c)return;
  if(!MODIF_LIGNES.length){
    c.innerHTML='<div style="color:var(--textm);font-size:12px">Aucun ingrédient — ajoutez-en ci-dessous.</div>';
    majTotalModif();return;
  }
  c.innerHTML=MODIF_LIGNES.map((l,i)=>`
    <div style="display:flex;gap:6px;align-items:center;padding:5px 0;border-bottom:1px solid var(--border)">
      <span style="flex:1;font-weight:600;font-size:12px">${l.ingredient_nom}</span>
      <input type="number" value="${l.qte_commandee}" step="0.1" title="Quantité (kg)"
        oninput="modifLigneChange(${i},'qte',this.value)"
        style="width:70px;font-size:11px;padding:4px 6px">
      <input type="number" value="${l.prix_unitaire}" title="Prix/kg (F)"
        oninput="modifLigneChange(${i},'prix',this.value)"
        style="width:70px;font-size:11px;padding:4px 6px">
      <span id="modif-mnt-${i}" style="width:80px;text-align:right;font-size:11px;color:var(--gold)">${fmt(l.montant_ligne)} F</span>
      <button class="btn btn-red btn-sm" onclick="supprimerModifLigne(${i})" style="padding:3px 7px">✕</button>
    </div>`).join('');
  majTotalModif();
}

function modifLigneChange(idx,champ,val){
  const l=MODIF_LIGNES[idx];if(!l)return;
  if(champ==='qte')l.qte_commandee=+val||0;
  else l.prix_unitaire=+val||0;
  l.montant_ligne=Math.round(l.qte_commandee*l.prix_unitaire);
  const mnt=document.getElementById('modif-mnt-'+idx);
  if(mnt)mnt.textContent=fmt(l.montant_ligne)+' F';
  majTotalModif();
}

function supprimerModifLigne(idx){
  MODIF_LIGNES.splice(idx,1);
  renderModifLignes();
}

function majTotalModif(){
  const t=MODIF_LIGNES.reduce((s,l)=>s+Number(l.montant_ligne||0),0);
  const el=document.getElementById('modif-total');
  if(el)el.textContent=fmt(t)+' F';
}

// Recherche d'ingrédient dans le modal de modification
function filtrerIngrModif(){
  const search=normalizeSearch(document.getElementById('modif_ingr_search')?.value||'');
  const results=document.getElementById('modif_ingr_results');
  if(!results)return;
  if(!search){results.style.display='none';return;}
  const filtered=[...GP_INGREDIENTS]
    .filter(i=>i.actif!==false && normalizeSearch(i.nom).includes(search))
    .sort((a,b)=>a.nom.localeCompare(b.nom)).slice(0,10);
  if(!filtered.length){results.style.display='none';return;}
  results.style.display='block';
  results.innerHTML=filtered.map(i=>`
    <div onclick="selectionnerIngrModif('${i.id}','${i.nom.replace(/'/g,"\\'").replace(/"/g,'&quot;')}',${i.prix_actuel||0})"
      style="padding:8px 12px;cursor:pointer;font-size:12px;border-bottom:1px solid var(--border)"
      onmouseover="this.style.background='rgba(22,163,74,.1)'"
      onmouseout="this.style.background=''">
      <span style="font-weight:600">${i.nom}</span>
      <span style="color:var(--textm);margin-left:8px">${fmt(i.prix_actuel||0)} F/kg</span>
    </div>`).join('');
}

function selectionnerIngrModif(id,nom,prix){
  document.getElementById('modif_ingr_id').value=id;
  document.getElementById('modif_ingr_search').value=nom;
  document.getElementById('modif_ingr_results').style.display='none';
  const prixEl=document.getElementById('modif_ingr_prix');
  if(prixEl&&prix>0)prixEl.value=prix;
}

function ajouterModifLigne(){
  const id=document.getElementById('modif_ingr_id')?.value;
  const nom=document.getElementById('modif_ingr_search')?.value.trim();
  const qte=+document.getElementById('modif_ingr_qte')?.value||0;
  const prix=+document.getElementById('modif_ingr_prix')?.value||0;
  if(!id||!qte||!prix){notify('Sélectionnez un ingrédient, quantité et prix','r');return;}
  MODIF_LIGNES.push({
    ingredient_id:id,ingredient_nom:nom,
    qte_commandee:qte,prix_unitaire:prix,
    montant_ligne:Math.round(qte*prix)
  });
  ['modif_ingr_id','modif_ingr_search','modif_ingr_qte','modif_ingr_prix']
    .forEach(x=>{const el=document.getElementById(x);if(el)el.value='';});
  const res=document.getElementById('modif_ingr_results');
  if(res)res.style.display='none';
  renderModifLignes();
}

// Enregistre la modification : vérifie le stock, met à jour l'achat + ses lignes,
// recrée les entrées de stock, ré-applique les prix.
async function saveModificationAchat(){
  const err=document.getElementById('modif_err');
  if(err)err.textContent='';
  const id=document.getElementById('modif_achat_id')?.value;
  const fsel=document.getElementById('modif_fournisseur');
  const fournId=fsel?.value;
  const fournNom=fsel?.options[fsel.selectedIndex]?.text;
  const date=document.getElementById('modif_date')?.value||today();
  const dateLiv=document.getElementById('modif_date_liv')?.value||null;
  const condition=document.getElementById('modif_condition')?.value||'livraison';

  if(!id){if(err)err.textContent='Achat introuvable.';return;}
  if(!fournId){if(err)err.textContent='Sélectionnez un fournisseur.';return;}
  if(!MODIF_LIGNES.length){if(err)err.textContent='Ajoutez au moins un ingrédient.';return;}

  const{data:achat}=await SB.from('gp_achats').select('*').eq('id',id).maybeSingle();
  if(!achat){if(err)err.textContent='Achat introuvable.';return;}

  // Anciennes entrées de stock de cet achat (par achat_id, repli sur ref texte)
  let{data:ancStock}=await SB.from('gp_stock_mp').select('*').eq('achat_id',id);
  if((!ancStock||!ancStock.length)&&achat.ref){
    const r=await SB.from('gp_stock_mp').select('*')
      .eq('admin_id',GP_ADMIN_ID).eq('ref','Achat '+achat.ref).is('achat_id',null);
    ancStock=r.data||[];
  }
  ancStock=ancStock||[];

  // Apport ancien / nouveau par ingrédient
  const ancienApport={},nouvelApport={};
  ancStock.forEach(s=>{if(s.ingredient_id)ancienApport[s.ingredient_id]=(ancienApport[s.ingredient_id]||0)+Number(s.quantite||0);});
  MODIF_LIGNES.forEach(l=>{if(l.ingredient_id)nouvelApport[l.ingredient_id]=(nouvelApport[l.ingredient_id]||0)+Number(l.qte_commandee||0);});

  // Stock actuel par ingrédient (entrées − sorties)
  const tousStock=await _fetchAllStockMp();
  const stockActuel={};
  (tousStock||[]).forEach(s=>{
    if(!s.ingredient_id)return;
    const signe=s.type==='entree'?1:-1;
    stockActuel[s.ingredient_id]=(stockActuel[s.ingredient_id]||0)+signe*Number(s.quantite||0);
  });

  // BLOCAGE : aucun ingrédient ne doit passer sous zéro
  const problemes=[];
  new Set([...Object.keys(ancienApport),...Object.keys(nouvelApport)]).forEach(iid=>{
    const fin=(stockActuel[iid]||0)-(ancienApport[iid]||0)+(nouvelApport[iid]||0);
    if(fin<-0.01){
      const nom=GP_INGREDIENTS.find(x=>x.id===iid)?.nom||'ingrédient';
      problemes.push(`${nom} (${fmtKg(fin)} kg)`);
    }
  });
  if(problemes.length){
    if(err)err.textContent='🚫 Modification bloquée — stock négatif : '+problemes.join(' · ');
    notify('Modification bloquée — stock insuffisant','r');
    return;
  }

  const total=MODIF_LIGNES.reduce((s,l)=>s+l.montant_ligne,0);

  // Avertir si le montant déjà payé dépasse le nouveau total
  if(Number(achat.montant_paye||0)>total){
    if(!confirm(`⚠️ Le montant déjà payé (${fmt(achat.montant_paye)} F) dépasse le nouveau total (${fmt(total)} F).\n\nEnregistrer quand même ?`))return;
  }

  // Trace de modification (ajoutée à la note DAF)
  const qui=GP_USER?.email?.split('@')[0]||'admin';
  const trace=`✏️ Modifié le ${today()} par ${qui} (total ${fmt(achat.montant_total)} → ${fmt(total)} F)`;
  const noteDaf=(achat.note_daf?achat.note_daf+'\n':'')+trace;

  // 1. Mettre à jour l'achat
  await SB.from('gp_achats').update({
    fournisseur_id:fournId,fournisseur_nom:fournNom,
    date_commande:date,date_livraison_prev:dateLiv,
    condition_paiement:condition,
    montant_total:total,note_daf:noteDaf
  }).eq('id',id);

  // 2. Remplacer les lignes
  await SB.from('gp_achats_lignes').delete().eq('achat_id',id);
  await SB.from('gp_achats_lignes').insert(
    MODIF_LIGNES.map(l=>({
      achat_id:id,admin_id:GP_ADMIN_ID,
      ingredient_id:l.ingredient_id,ingredient_nom:l.ingredient_nom,
      qte_commandee:l.qte_commandee,qte_recue:l.qte_commandee,
      prix_unitaire:l.prix_unitaire,montant_ligne:l.montant_ligne
    }))
  );

  // 3 & 4 — IMPACT STOCK/PRIX : seulement si le bon est DÉJÀ en stock.
  // Un brouillon/confirmé/reçu non crédité ne doit PAS toucher le stock.
  const dejaEnStock = (achat.statut==='valide_daf') || ancStock.length>0;
  if(dejaEnStock){
    // Supprimer les anciennes entrées → recréer
    if(ancStock.length){
      await SB.from('gp_stock_mp').delete().in('id',ancStock.map(s=>s.id));
    }
    await SB.from('gp_stock_mp').insert(
      MODIF_LIGNES.map(l=>({
        admin_id:GP_ADMIN_ID,saisi_par:GP_USER.id,achat_id:id,
        type:'entree',date:date,
        ingredient_id:l.ingredient_id,ingredient_nom:l.ingredient_nom,
        quantite:l.qte_commandee,prix_unit:l.prix_unitaire,
        ref:'Achat '+(achat.ref||id.slice(0,8)),note:'Achat modifié'
      }))
    );
    // Ré-appliquer les prix des ingrédients
    for(const l of MODIF_LIGNES){
      if(l.ingredient_id){
        await majPrixMP(l.ingredient_id, l.prix_unitaire);
      }
    }
  }

  fermerModalModif();
  await renderAchats();
  if(typeof renderStockNiveaux==='function')renderStockNiveaux();
  notify(dejaEnStock?'Achat modifié ✓ — stock recalculé':'Achat modifié ✓','gold');
}

// ── FRAIS ANNEXES (dédouanement, transport…) ───────────────────
// Le bloc vit DANS la fiche du bon : une commande, son argent et son coût réel
// se lisent au même endroit. Le détail du calcul est affiché — un prix de
// revient qu'on ne peut pas refaire à la main n'est pas cru.
function _achatBlocFrais(a, L, F, CR){
  if(F === null){
    return `<div style="margin-top:12px;font-size:11.5px;color:var(--textm)">
      Les frais annexes ne sont pas lisibles — passe le SQL <b>gp_achats_frais</b> (fourni dans le chat).</div>`;
  }
  const clos = !!a.cloture_le;
  const total = (F||[]).reduce((s,f)=>s+(Number(f.montant)||0),0);
  const peut = (typeof GP_PEUT_PAYER_MP!=='undefined' && GP_PEUT_PAYER_MP===true) || GP_ROLE==='admin';
  const liste = (F||[]).length ? `<table class="tbl" style="font-size:11px">
      <thead><tr><th>Date</th><th>Frais</th><th class="num">Montant</th><th></th></tr></thead><tbody>
      ${F.map(f=>`<tr>
        <td>${String(f.date||'').slice(0,10)}</td>
        <td>${String(f.libelle||'').replace(/</g,'&lt;')}</td>
        <td class="num" style="color:var(--red)">${fmt(f.montant)} F</td>
        <td class="num">${(peut&&!clos)?`<button class="btn btn-red btn-sm" onclick="supprimerFraisAchat('${f.id}','${a.id}')" title="Retirer ce frais">✕</button>`:''}</td>
      </tr>`).join('')}
      <tr style="font-weight:700"><td colspan="2">TOTAL FRAIS</td>
        <td class="num" style="color:var(--red)">${fmt(total)} F</td><td></td></tr>
      </tbody></table>` : '<div style="color:var(--textm);font-size:12px">Aucun frais annexe.</div>';

  // Le coût réel, ligne par ligne. Répartir au prorata de la VALEUR revient à
  // appliquer le même coefficient partout : on l'affiche, ça se vérifie en une
  // division.
  const detail = (CR && CR.coef > 0) ? `
    <div style="font-size:11px;color:var(--textm);margin:8px 0 4px">
      Coût réel = prix fournisseur + <b>${Math.round(CR.coef*1000)/10} %</b>
      (${fmt(CR.totalFrais)} F de frais sur ${fmt(CR.totalValeur)} F de marchandise)
    </div>
    <table class="tbl" style="font-size:11px"><thead><tr>
      <th>Ingrédient</th><th class="num">Prix fournisseur</th><th class="num">Part des frais</th><th class="num">Coût réel</th>
    </tr></thead><tbody>
    ${L.map(l=>{const c=CR.lignes[l.id]; if(!c) return ''; return `<tr>
      <td>${String(l.ingredient_nom||'—').replace(/</g,'&lt;')}</td>
      <td class="num">${fmt(c.prix_fournisseur)} F</td>
      <td class="num" style="color:var(--red)">+${fmt(c.part_frais)} F</td>
      <td class="num" style="font-weight:700;color:var(--gold)">${fmt(c.prix_reel)} F</td>
    </tr>`;}).join('')}
    </tbody></table>` : '';

  const form = (peut && !clos) ? `
    <div style="display:grid;grid-template-columns:1.4fr 1fr 1fr auto;gap:6px;align-items:end;margin-top:8px">
      <div class="fr" style="margin:0"><label>Frais</label>
        <input id="af_lib" type="text" placeholder="Dédouanement, transport…"></div>
      <div class="fr" style="margin:0"><label>Montant</label>
        <input id="af_montant" type="number" min="0" step="1"></div>
      <div class="fr" style="margin:0"><label>Date</label>
        <input id="af_date" type="date" value="${new Date().toISOString().slice(0,10)}"></div>
      <button class="btn btn-g btn-sm" onclick="ajouterFraisAchat('${a.id}')">+ Ajouter</button>
    </div>
    <div style="font-size:10.5px;color:var(--textm);margin-top:4px">
      Saisis le frais le jour où tu le <b>paies</b>. Il renchérit le kilo pour les
      prochains lots — <b>les lots déjà produits gardent leur coût</b>.
    </div>` : '';

  const cloture = !peut ? '' : (clos
    ? `<div style="display:flex;align-items:center;gap:8px;margin-top:8px;font-size:11.5px">
         <span style="color:var(--green);font-weight:700">🔒 Clôturé le ${String(a.cloture_le).slice(0,10)}${a.cloture_par_nom?' par '+a.cloture_par_nom:''}</span>
         <button class="btn btn-out btn-sm" onclick="rouvrirAchatFrais('${a.id}')">Rouvrir</button></div>`
    : `<div style="margin-top:8px"><button class="btn btn-out btn-sm" onclick="cloturerAchatFrais('${a.id}')">🔒 Clôturer — plus aucun frais</button>
         <span style="font-size:10.5px;color:var(--textm);margin-left:6px">fige le coût de cet achat</span></div>`);

  return `<div style="margin-top:14px;border-top:1px solid var(--border);padding-top:10px">
    <div style="font-size:11px;font-weight:700;color:var(--g6);margin-bottom:6px">💸 Frais annexes — dédouanement, transport</div>
    ${liste}${detail}${form}${cloture}
  </div>`;
}

async function ajouterFraisAchat(achatId){
  const lib=(document.getElementById('af_lib')||{}).value||'';
  const mt=(document.getElementById('af_montant')||{}).value||0;
  const dt=(document.getElementById('af_date')||{}).value||'';
  const r=await achatFraisAjouter(achatId, lib, mt, dt, null);
  if(r.error){ notify(r.error,'r'); return; }
  // Le coût réel se recalcule, et on DIT ce que ça ne change pas.
  const app=await achatAppliquerCoutReel(achatId);
  let msg='Frais ajouté ✓';
  if(app && app.calc && app.calc.coef>0) msg+=' · coût réel +'+(Math.round(app.calc.coef*1000)/10)+' %';
  try{
    const{data:st}=await SB.from('gp_stock_mp').select('date').eq('achat_id',achatId)
      .eq('admin_id',GP_ADMIN_ID).order('date').limit(1);
    const n=(st&&st[0])?await achatLotsDepuis(st[0].date):0;
    if(n>0) msg+=' — '+n+' lot(s) déjà produits depuis l’entrée en stock gardent leur coût';
  }catch(_){}
  notify(msg,'gold');
  await voirDetailAchat(achatId);
}

async function supprimerFraisAchat(fraisId, achatId){
  if(!confirm('Retirer ce frais ? Le coût réel sera recalculé.')) return;
  try{
    const{error}=await SB.from('gp_achats_frais').delete().eq('id',fraisId).eq('admin_id',GP_ADMIN_ID);
    if(error) throw error;
  }catch(e){ notify('Suppression impossible : '+((e&&e.message)||e),'r'); return; }
  await achatAppliquerCoutReel(achatId);
  notify('Frais retiré ✓ · coût recalculé','gold');
  await voirDetailAchat(achatId);
}

async function cloturerAchatFrais(achatId){
  if(!confirm('Clôturer cet achat ? Plus aucun frais ne pourra s’y rattacher et le coût sera figé.')) return;
  const r=await achatCloturer(achatId);
  if(r.error){ notify('Clôture impossible : '+r.error,'r'); return; }
  notify('Achat clôturé ✓ — coût figé','gold');
  await voirDetailAchat(achatId);
}

async function rouvrirAchatFrais(achatId){
  const r=await achatRouvrir(achatId);
  if(r.error){ notify('Réouverture impossible : '+r.error,'r'); return; }
  notify('Achat rouvert — tu peux ajouter un frais','gold');
  await voirDetailAchat(achatId);
}

// ── CONFIRMER ─────────────────────────────────────
async function confirmerAchat(id){
  await SB.from('gp_achats').update({statut:'confirme'}).eq('id',id);
  await renderAchats();
  notify('Commande confirmée ✓','gold');
}

// ── RÉCEPTION ────────────────────────────────────
async function ouvrirReception(achatId){
  const{data:lignes,error:eL}=await SB.from('gp_achats_lignes').select('*').eq('achat_id',achatId);
  if(eL) throw eL;
  const L=lignes||[];
  const modal=document.getElementById('modal-reception');
  if(!modal || !document.getElementById('reception-achat-id') || !document.getElementById('reception-lignes')){
    alert('⚠️ Fenêtre de réception introuvable. Recharge la page (Ctrl+Maj+R).'); return;
  }
  if(!L.length){
    alert('⚠️ Ce bon n\'a aucune ligne de produit à ajuster.\nUtilise plutôt ✏️ Modifier sur la page 🛒 Achats MP.');
    return;
  }
  // Sortir le modal de tout conteneur ayant un transform/filter (qui casse position:fixed → modal invisible)
  if(modal.parentElement !== document.body){ try{ document.body.appendChild(modal); }catch(_){} }
  document.getElementById('reception-achat-id').value=achatId;
  document.getElementById('reception-lignes').innerHTML=`<table class="tbl" style="font-size:11px">
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

// ── ÉCART DE RÉCEPTION ────────────────────────────
// CE QUI A COÛTÉ 360 000 F. Le 24/10/2026, un bon de 250 kg de lysine est
// réceptionné à 25 kg : un zéro oublié. L'application avait TOUT vu — elle
// calculait déjà l'écart, et écrivait même « ⚠️ avec écarts » dans le WhatsApp
// de l'admin. Mais elle créditait quand même, fermait le bon en « ✅ En stock »,
// et trois jours plus tard laissait payer 400 000 F pour 40 000 F de
// marchandise. Le signal existait depuis le début : il était câblé sur une
// décoration au lieu d'un frein.
//
// Désormais un manque ARRÊTE la confirmation et pose la seule question que le
// logiciel ne peut pas trancher à la place de l'humain : le reste va-t-il
// arriver ? Recalculer le montant tout seul effacerait une avance chez le
// fournisseur ; ne rien faire laisse l'argent sortir sans marchandise.

function checkEcartReception(ligneId,qteCmdee){
  const recu=+document.getElementById('rec-'+ligneId)?.value||0;
  const el=document.getElementById('ecart-'+ligneId);
  if(!el)return;
  const ecart=recu-qteCmdee;
  if(Math.abs(ecart)<0.01){el.textContent='';return;}
  const pct=qteCmdee>0?Math.round(Math.abs(ecart)/qteCmdee*100):0;
  el.style.fontWeight='700';
  el.style.color=ecart<0?'var(--red)':'var(--green)';
  el.textContent=ecart<0
    ? `⚠ Manque ${fmtKg(Math.abs(ecart))} kg — ${pct} % de la commande`
    : `+${fmtKg(ecart)} kg en surplus`;
}

// Les lignes reçues EN MOINS. Un surplus ne bloque personne.
function _manquesReception(saisies){
  return (saisies||[]).filter(s=>Number(s.recu) < Number(s.ligne.qte_commandee||0)-0.01);
}

// La question posée en grand, avec les trois seules suites possibles.
// Rend 'corriger' | 'partiel' | 'solder'.
function _demanderSuiteEcart(manques){
  return new Promise(resolve=>{
    const li=manques.map(m=>{
      const cmd=Number(m.ligne.qte_commandee||0), rec=Number(m.recu||0);
      const pct=cmd>0?Math.round((cmd-rec)/cmd*100):0;
      return `<li style="margin-bottom:5px"><b>${m.ligne.ingredient_nom}</b> — commandé ${fmtKg(cmd)} kg, reçu ${fmtKg(rec)} kg<br>
        <span style="color:var(--red);font-weight:700">il manque ${fmtKg(cmd-rec)} kg (${pct} %)</span></li>`;
    }).join('');
    const perdu=manques.reduce((s,m)=>
      s+(Number(m.ligne.qte_commandee||0)-Number(m.recu||0))*Number(m.ligne.prix_unitaire||0),0);
    const ov=document.createElement('div');
    ov.id='ecart-overlay';
    ov.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:100000;'
      +'display:flex;align-items:center;justify-content:center;padding:16px';
    const btn='width:100%;justify-content:center;margin-top:8px;min-height:46px;font-size:13px';
    ov.innerHTML=`<div style="background:var(--card2);color:var(--text);border:2px solid var(--red);border-radius:14px;padding:22px;max-width:520px;width:100%;max-height:88vh;overflow-y:auto">
      <div style="font-weight:800;font-size:16px;color:var(--red);margin-bottom:10px">⚠️ Il manque de la marchandise</div>
      <ul style="font-size:12px;line-height:1.55;padding-left:18px;margin:0 0 12px">${li}</ul>
      <div style="font-size:12px;line-height:1.6;background:rgba(239,68,68,.08);border:1px solid rgba(239,68,68,.3);border-radius:8px;padding:10px;margin-bottom:14px">
        Soit <b>${fmt(Math.round(perdu))} F</b> facturés sans marchandise en face.<br>
        <b>Le reste va-t-il arriver ?</b>
      </div>
      <button class="btn btn-out" id="ec-corriger" style="${btn}">✏️ Je me suis trompé — je corrige la quantité</button>
      <button class="btn btn-g"   id="ec-partiel"  style="${btn}">🚚 Livraison partielle — le reste arrive</button>
      <button class="btn btn-red" id="ec-solder"   style="${btn}">🔒 Le fournisseur en reste là — solder le bon</button>
      <div style="font-size:10.5px;color:var(--textm);margin-top:12px;line-height:1.55">
        <b>Le reste arrive</b> : le bon reste ouvert, le montant ne bouge pas, et la prochaine réception créditera la différence.<br>
        <b>Solder</b> : le montant est ramené à ce qui est arrivé, et le trop-payé devient un avoir chez le fournisseur.
      </div>
    </div>`;
    const fin=(choix)=>{ try{ov.remove();}catch(_){} resolve(choix); };
    document.body.appendChild(ov);
    ov.querySelector('#ec-corriger').onclick=()=>fin('corriger');
    ov.querySelector('#ec-partiel').onclick =()=>fin('partiel');
    ov.querySelector('#ec-solder').onclick  =()=>fin('solder');
    // Fermer en cliquant à côté = ne rien enregistrer. Le doute profite au bon.
    ov.onclick=(e)=>{ if(e.target===ov) fin('corriger'); };
  });
}

async function confirmerReception(){
  const achatId=document.getElementById('reception-achat-id')?.value;
  const note=document.getElementById('reception-note')?.value.trim()||null;
  const err=document.getElementById('reception-err');
  if(err)err.textContent='';
  const{data:lignes}=await SB.from('gp_achats_lignes').select('*').eq('achat_id',achatId);
  const L=lignes||[];

  // UN CHAMP ABSENT N'EST PAS « ZÉRO REÇU ». L'ancien code faisait
  // `+undefined || 0` : un écran incomplet enregistrait 0 kg reçu, en silence,
  // et effaçait une livraison entière. On refuse plutôt que d'inventer.
  const saisies=[], absents=[];
  L.forEach(l=>{
    const el=document.getElementById('rec-'+l.id);
    if(!el){ absents.push(l.ingredient_nom||'ligne'); return; }
    saisies.push({ligne:l, recu:Number(el.value||0)});
  });
  if(absents.length){
    const m='Écran de réception incomplet ('+absents.join(', ')+') — recharge la page (Ctrl+Maj+R). Rien n\'a été enregistré.';
    if(err)err.textContent='⛔ '+m; else alert(m);
    return;
  }
  if(!saisies.length){ if(err)err.textContent='⛔ Aucune ligne à réceptionner.'; return; }

  // LE FREIN. Un manque arrête tout et demande la suite.
  const manques=_manquesReception(saisies);
  let suite='complet';
  if(manques.length){
    suite=await _demanderSuiteEcart(manques);
    if(suite==='corriger') return;   // la fenêtre reste ouverte, la case est modifiable
  }

  // Quantités reçues
  await Promise.all(saisies.map(s=>
    SB.from('gp_achats_lignes').update({qte_recue:s.recu}).eq('id',s.ligne.id)));

  // Trace de la réception (qui / note)
  await SB.from('gp_achats').update({
    note_reception:note,
    recu_par:GP_USER.id,recu_par_nom:GP_USER.email
  }).eq('id',achatId);

  // SOLDER : le bon est ramené à ce qui est arrivé, et le trop-payé devient un
  // AVOIR chez le fournisseur — affiché dans la fiche, pas un trou silencieux.
  let _avoir=0;
  if(suite==='solder'){
    let total=0;
    for(const s of saisies){
      const mnt=Math.round(Number(s.recu)*Number(s.ligne.prix_unitaire||0));
      total+=mnt;
      await SB.from('gp_achats_lignes').update({montant_ligne:mnt}).eq('id',s.ligne.id);
    }
    const{data:av}=await SB.from('gp_achats').select('montant_paye').eq('id',achatId).maybeSingle();
    _avoir=Math.max(0, Number(av?.montant_paye||0)-total);
    await SB.from('gp_achats').update({montant_total:total}).eq('id',achatId);
  }

  // Le stock reçoit ce qui est arrivé, dans tous les cas. Mais le STATUT dit la
  // vérité : « reçu partiel » rouvre le bon dans la file des entrées à
  // confirmer au lieu de le classer en vert.
  window._mpAjustCredit=false;
  let _creditOk=true, _creditErr='';
  try{ await crediterStockDepuisAchat(achatId, suite==='partiel'?'recu_partiel':'valide_daf'); }
  catch(e){ _creditOk=false; _creditErr=(e.message||e); }
  const _modal=document.getElementById('modal-reception');
  if(_modal)_modal.style.display='none';

  // 🔔 Notifier l'admin. LE MESSAGE DIT CE QUI MANQUE — l'ancien annonçait le
  // montant de la commande et « stock crédité », ce qui se lisait comme une
  // bonne nouvelle le jour même où 225 kg manquaient.
  const{data:a}=await SB.from('gp_achats').select('fournisseur_nom,ref,montant_total').eq('id',achatId).maybeSingle();
  const qui=GP_USER?.email?.split('@')[0]||'secrétaire';
  const titre=!manques.length ? '📦 Réception MP'
    : (suite==='partiel' ? '🚚 Réception PARTIELLE — il manque de la marchandise'
                         : '⚠️ Réception INCOMPLÈTE — bon soldé sur le reçu');
  const detailManque=manques.map(m=>
    `• ${m.ligne.ingredient_nom} : ${fmtKg(Number(m.ligne.qte_commandee||0)-Number(m.recu||0))} kg manquants `
    +`sur ${fmtKg(m.ligne.qte_commandee)} commandés`).join('\n');
  const blocManque=!manques.length ? '' :
    ('\n\n⚠️ *IL MANQUE :*\n'+detailManque
     +(suite==='partiel' ? '\n➡️ Le reste est attendu — le bon reste ouvert.'
                         : '\n➡️ Bon soldé sur ce qui est arrivé.')
     +(_avoir>0 ? `\n💰 Avoir fournisseur : *${fmt(_avoir)} F*` : ''));
  const stockTxt=_creditOk?'Stock crédité de ce qui est arrivé.'
    :('⚠️ STOCK NON CRÉDITÉ ('+_creditErr+') — à re-créditer (bouton 🔄 Stock).');
  notifierAdmin(
    titre+(_creditOk?'':' — STOCK NON CRÉDITÉ'),
    `${a?.fournisseur_nom||'Fournisseur'} · ${fmt(a?.montant_total||0)} F — reçu par ${qui}`
      +(manques.length?` · ${manques.length} ligne(s) incomplète(s)`:''),
    `${titre}\nFournisseur : ${a?.fournisseur_nom||'—'}\nRéf : ${a?.ref||'—'}\n`
      +`Montant du bon : ${fmt(a?.montant_total||0)} F\nReçu par : ${qui}${blocManque}\n${stockTxt}\n\n`
      +`_${GP_CONFIG?.nom_provenderie||'PROVENDA'}_`,
    true /* ouvrir WhatsApp admin */
  );

  notify(!_creditOk ? ('⚠ Réception enregistrée mais STOCK NON CRÉDITÉ : '+_creditErr)
    : suite==='partiel' ? 'Réception partielle — le bon reste ouvert, le reste est attendu ✓'
    : suite==='solder'  ? ('Bon soldé sur le reçu'+(_avoir>0?` — avoir fournisseur de ${fmt(_avoir)} F`:'')+' ✓')
    : 'Réception confirmée — stock crédité ✓',
    _creditOk?'gold':'r');
  // Rafraîchir seulement les vues présentes (le bouton Ajuster vient de la page Stock,
  // où renderAchats() planterait car ses éléments DOM n'existent pas).
  try{ if(document.getElementById('achats-liste') && typeof renderAchats==='function') await renderAchats(); }catch(e){}
  try{ if(typeof renderStockNiveaux==='function') await renderStockNiveaux(); }catch(e){}
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
    await renderAchats();
    return;
  }

  // Valider — créditer le stock MP (erreur remontée clairement, plus de crédit silencieux)
  try{ await crediterStockDepuisAchat(achatId); }
  catch(e){ notify('⚠ STOCK NON CRÉDITÉ : '+(e.message||e)+' — clique « 🔄 Stock » (admin) ou vérifie les droits/RLS.','r'); return; }
  notify('Achat validé et stock mis à jour ✓','gold');
  try{ renderAchats(); }catch(e){}
  try{ renderStockNiveaux(); }catch(e){}
}

// Re-créditer le stock d'un achat (admin) — idempotent : répare un achat dont l'entrée
// n'est pas passée (crédit échoué). Sûr : si déjà crédité, crediterStockDepuisAchat ne double pas.
async function recrediterAchat(id){
  if(!(['admin','secretaire','logistique','daf'].includes(GP_ROLE)||GP_EST_GERANT)){ notify('Action non autorisée pour votre rôle','r'); return; }
  try{
    // État AVANT : entrées de stock déjà liées à cet achat ?
    const{data:av}=await SB.from('gp_stock_mp').select('id').eq('achat_id',id).eq('admin_id',GP_ADMIN_ID);
    const nAvant=(av||[]).length;

    await crediterStockDepuisAchat(id);

    // État APRÈS
    const{data:ap}=await SB.from('gp_stock_mp').select('id,type,quantite,ingredient_nom').eq('achat_id',id).eq('admin_id',GP_ADMIN_ID);
    const nApres=(ap||[]).length;
    const kgAchat=(ap||[]).filter(x=>x.type==='entree').reduce((s,x)=>s+Number(x.quantite||0),0);
    const nom=(ap||[])[0]?.ingredient_nom||'';

    try{ if(document.getElementById('achats-liste') && typeof renderAchats==='function') await renderAchats(); }catch(_){}
    try{ if(typeof renderStockNiveaux==='function') await renderStockNiveaux(); }catch(_){}

    if(nAvant>0 && nApres===nAvant){
      // Rien ajouté : l'entrée existait déjà.
      let net=null;
      if(nom){
        const{data:all}=await SB.from('gp_stock_mp').select('type,quantite').eq('admin_id',GP_ADMIN_ID).eq('ingredient_nom',nom);
        net=(all||[]).reduce((s,x)=>s+(x.type==='entree'?1:-1)*Number(x.quantite||0),0);
      }
      if(net!=null && net>0.01){
        // Stock présent sous ce libellé → si l'écran affiche 0 pour un libellé proche = DOUBLON de nom.
        alert(`✅ Le stock N'EST PAS perdu.\n\n« ${nom} » a un stock net de ${fmtKg(net)} kg (dont ${fmtKg(kgAchat)} kg de ce bon).\n\n⚠️ Si « Niveaux actuels » affiche 0 pour un libellé quasi identique, c'est un DOUBLON d'écriture (majuscule/espace/accent). Le stock est bien là, juste sous une autre orthographe. → À fusionner (l'admin a le SQL).`);
      } else {
        alert(`ℹ️ L'entrée de cet achat existe (${fmtKg(kgAchat)} kg) mais le stock net de « ${nom} » est ${net!=null?fmtKg(net)+' kg':'0'}.\n\n➡️ Le 0 vient d'une CONSOMMATION en production, pas d'un crédit manquant. Ce n'est pas un bug.`);
      }
    } else if(nApres>nAvant){
      alert(`✅ Stock crédité : +${fmtKg(kgAchat)} kg de « ${nom} » ajoutés.\n\nL'entrée n'était effectivement pas passée — c'est réparé.`);
    } else {
      alert('⚠️ Aucune entrée de stock trouvée pour cet achat, et rien n\'a pu être ajouté. Vérifie que le bon a bien des lignes (ingrédient + quantité). Envoie-moi une capture du détail 👁 du bon.');
    }
  }catch(e){ alert('⚠️ Échec crédit stock : '+(e.message||e)+'\n\nCopie ce message — c\'est la cause exacte (droits/RLS/contrainte).'); }
}

// ── ANNULER UN BON ────────────────────────────────
// Retire les entrées de stock de cet achat, en BLOQUANT si la MP a déjà été consommée.
async function _retirerStockAchat(id){
  let{data:entr}=await SB.from('gp_stock_mp').select('*').eq('achat_id',id);
  entr=entr||[];
  if(!entr.length) return true; // rien à retirer
  // Niveau actuel par ingrédient
  const tous=await _fetchAllStockMp();
  const niv={};
  (tous||[]).forEach(s=>{ if(!s.ingredient_id)return; niv[s.ingredient_id]=(niv[s.ingredient_id]||0)+(s.type==='entree'?1:-1)*Number(s.quantite||0); });
  // Apport de cet achat
  const apport={};
  entr.forEach(s=>{ if(s.ingredient_id) apport[s.ingredient_id]=(apport[s.ingredient_id]||0)+Number(s.quantite||0); });
  const probl=[];
  Object.keys(apport).forEach(iid=>{
    if((niv[iid]||0)-apport[iid] < -0.01){
      probl.push((GP_INGREDIENTS||[]).find(x=>x.id===iid)?.nom||'ingrédient');
    }
  });
  if(probl.length){
    notify('🚫 Annulation bloquée — MP déjà consommée : '+probl.join(', '),'r');
    return false;
  }
  await SB.from('gp_stock_mp').delete().in('id',entr.map(s=>s.id));
  return true;
}

// Remboursement caisse : crée une ENTRÉE compensatoire (annulation d'un achat déjà payé).
// Restaure le solde, dans la caisse physique du PDV (ou siège).
async function _rembourserCaisseAchat(montant, ref){
  if(!montant || montant<=0) return;
  // La caisse du PDV, et AUCUNE autre. Rembourser dans le tiroir d'un autre point
  // de vente gonfle un solde et en creuse un autre : c'est ainsi qu'on fabrique
  // un solde negatif que personne ne sait expliquer.
  let caisse=null;
  try{ caisse = await caisseDuPdv(GP_POINT_VENTE, 'physique'); }catch(_){}
  if(!caisse){
    // On ne fait pas semblant : l'achat est bien annule, mais l'argent n'est pas
    // revenu en caisse et il faut que quelqu'un le sache.
    if(typeof notify==='function') notify(
      `Achat annul\u00e9, mais le remboursement de ${typeof fmt==='function'?fmt(montant):montant} F n'a pas pu \u00eatre plac\u00e9 : `
      + `aucune caisse physique sur ${GP_POINT_VENTE||'Production'}. Cr\u00e9e-la puis r\u00e9gularise.`, 'r');
    return;
  }
  {
    await SB.from('gp_mouvements_caisse').insert({
      admin_id:GP_ADMIN_ID, caisse_id:caisse.id,
      type:'entree', categorie:'annulation_achat',
      montant, date_mouvement:today(),
      description:`Remboursement annulation achat ${ref||''}`.trim(),
      enregistre_par:GP_USER?.id, enregistre_par_nom:GP_USER?.email?.split('@')[0]
    });
  }
}

async function annulerAchat(id){
  if(typeof peutPayerMP==='function' && !(await peutPayerMP())){
    notify('Annulation réservée à la Production / PDV principal','r'); return;
  }
  const{data:a}=await SB.from('gp_achats').select('*').eq('id',id).maybeSingle();
  if(!a){notify('Bon introuvable','r');return;}
  if(a.statut==='annule'){notify('Bon déjà annulé','gold');return;}
  if(Number(a.montant_paye||0)>0 &&
     !confirm(`⚠️ ${fmt(a.montant_paye)} F déjà payés sur ce bon.\nAnnuler quand même ? (un remboursement sera ajouté en caisse)`)) return;
  const raison=prompt('Raison de l\'annulation :');
  if(!raison)return;
  // Si déjà en stock → retirer les entrées (bloque si MP consommée)
  if(a.statut==='valide_daf'){
    const ok=await _retirerStockAchat(id);
    if(!ok) return;
  }
  // Remboursement caisse des montants déjà payés
  if(Number(a.montant_paye||0)>0) await _rembourserCaisseAchat(Number(a.montant_paye), a.ref);
  const qui=GP_USER?.email?.split('@')[0]||'admin';
  await SB.from('gp_achats').update({
    statut:'annule',
    note_daf:(a.note_daf?a.note_daf+'\n':'')+`❌ Annulé le ${today()} par ${qui} : ${raison}`,
    valide_par:GP_USER?.id, valide_par_nom:GP_USER?.email
  }).eq('id',id);
  // Notifier l'admin
  if(typeof notifierAdmin==='function') notifierAdmin(
    '❌ Bon d\'achat annulé',
    `${a.fournisseur_nom||'Fournisseur'} · ${fmt(a.montant_total||0)} F annulé par ${qui}`,
    `❌ *Bon d'achat annulé*\n${a.fournisseur_nom||'—'} · Réf ${a.ref||'—'}\nMontant : ${fmt(a.montant_total||0)} F\nPar : ${qui}\nMotif : ${raison}\n\n_${GP_CONFIG?.nom_provenderie||'PROVENDA'}_`,
    false
  );
  notify('Bon annulé','r');
  await renderAchats();
  try{ if(typeof renderStockNiveaux==='function') renderStockNiveaux(); }catch(e){}
}

// ── SUPPRIMER DÉFINITIVEMENT UN BON (admin uniquement) ─────
// Marche pour n'importe quel statut. Reprend le stock si le bon l'avait crédité
// (bloque si la MP a déjà été consommée). Supprime aussi ses paiements.
async function supprimerAchat(id){
  if(GP_ROLE!=='admin'){ notify('Suppression réservée à l\'admin','r'); return; }
  const{data:a}=await SB.from('gp_achats').select('*').eq('id',id).maybeSingle();
  if(!a){notify('Bon introuvable','r');return;}

  let msg=`Supprimer DÉFINITIVEMENT le bon ${a.ref||''} (${a.fournisseur_nom||''}) ?`;
  if(a.statut==='valide_daf') msg+='\n\n• Le stock crédité par ce bon sera retiré.';
  if(Number(a.montant_paye||0)>0) msg+=`\n• ${fmt(a.montant_paye)} F de paiements supprimés + remboursement ajouté en caisse.`;
  msg+='\n\nCette action est irréversible.';
  if(!confirm(msg)) return;

  // Reprise du stock si déjà crédité (bloque si MP consommée)
  if(a.statut==='valide_daf'){
    const ok=await _retirerStockAchat(id);
    if(!ok) return;
  }
  // Remboursement caisse des montants déjà payés
  if(Number(a.montant_paye||0)>0) await _rembourserCaisseAchat(Number(a.montant_paye), a.ref);
  await SB.from('gp_achats_paiements').delete().eq('achat_id',id);
  await SB.from('gp_achats_lignes').delete().eq('achat_id',id);
  await SB.from('gp_achats').delete().eq('id',id);
  notify('Bon supprimé définitivement','gold');
  await renderAchats();
  try{ if(typeof renderStockNiveaux==='function') renderStockNiveaux(); }catch(e){}
}

// Crédite le stock MP à partir d'un achat (entrées = qté reçue ou, à défaut, commandée),
// met à jour le prix des ingrédients et passe l'achat en "validé".
// Réutilisé par la validation DAF ET par la file "Entrées MP à confirmer" de la page Stock MP.
// CE QUI RESTE À CRÉDITER, ligne par ligne (pur, testable hors navigateur).
// `lignes`  : [{id, ingredient_id, qte_commandee, qte_recue}]
// `entrees` : les mouvements gp_stock_mp portant déjà cet achat_id
// Chaque ligne consomme d'abord ce qui est déjà en stock pour SA matière ;
// seul le reste est à créditer. Deux lignes de la même matière se partagent
// donc correctement le déjà-entré, au lieu que la seconde soit avalée.
function resteACrediter(lignes, entrees){
  const couvert={};
  (entrees||[]).forEach(s=>{
    if(s.type!=='entree') return;
    const k=s.ingredient_id||'';
    couvert[k]=(couvert[k]||0)+Number(s.quantite||0);
  });
  const out={};
  (lignes||[]).forEach(l=>{
    const k=l.ingredient_id||'';
    // 0 reçu est une information, pas un vide : l’ancien repli créditait
    // la quantité COMMANDÉE quand rien n’était arrivé. On ne retombe sur le
    // commandé que si la réception n’a jamais eu lieu.
    const recu=l.qte_recue;
    const du=(recu===null||recu===undefined||recu==='')
      ? (Number(l.qte_commandee)||0)
      : (Number(recu)||0);
    const absorbe=Math.min(du, couvert[k]||0);
    couvert[k]=(couvert[k]||0)-absorbe;
    const reste=Math.round((du-absorbe)*1000)/1000;
    if(reste>0.001) out[l.id]=reste;
  });
  return out;
}

async function crediterStockDepuisAchat(achatId, statutFinal){
  const{data:achat}=await SB.from('gp_achats').select('*').eq('id',achatId).maybeSingle();
  if(!achat) return;
  const{data:lignes}=await SB.from('gp_achats_lignes').select('*').eq('achat_id',achatId);
  const L=lignes||[];

  // CRÉDIT DIFFÉRENTIEL — on crédite CE QUI MANQUE, pas tout ou rien.
  // L'ancien code refusait de créditer dès qu'UNE entrée existait pour ce bon.
  // Conséquence : une livraison partielle complétée la semaine suivante
  // n'entrait jamais en stock, et personne n'en était averti. Désormais chaque
  // ligne consomme d'abord ce qui est déjà entré pour sa matière, et seul le
  // reste est crédité. Repasser deux fois sur un bon inchangé ne fait toujours
  // rien — l'idempotence est conservée, le rattrapage devient possible.
  const{data:entrees}=await SB.from('gp_stock_mp')
    .select('ingredient_id,quantite,type').eq('achat_id',achatId);
  const aCrediter=resteACrediter(L, entrees||[]);

  // LE STOCK VAUT CE QU'IL A COUTÉ, pas ce que le fournisseur a facturé.
  // Le dédouanement et le transport sont dans le prix du kilo, sinon le prix
  // de revient est sous-estimé et les marges paraissent meilleures qu'elles
  // ne sont. Sans frais saisis, le coût réel égale le prix fournisseur :
  // l'ancien comportement est intact.
  let _cr = null;
  try{
    if(typeof achatFraisLire==='function' && typeof coutReelAchat==='function'){
      const _f = await achatFraisLire(achatId);
      if(_f) _cr = coutReelAchat(L, _f);
    }
  }catch(_){}
  const _pu = l => (_cr && _cr.lignes[l.id] && _cr.lignes[l.id].prix_reel) || l.prix_unitaire;

  const stockEntrees=[];
  L.forEach(l=>{
    const reste=aCrediter[l.id];
    if(!(reste>0.001)) return;
    stockEntrees.push({
      admin_id:GP_ADMIN_ID,saisi_par:GP_USER.id,achat_id:achat.id,
      type:'entree',date:achat.date_commande,
      ingredient_id:l.ingredient_id,ingredient_nom:l.ingredient_nom,
      quantite:reste,
      prix_unit:_pu(l),
      ref:'Achat '+achat.ref,note:'Entrée stock validée'
    });
  });
  if(stockEntrees.length){
    const{error}=await SB.from('gp_stock_mp').insert(stockEntrees);
    if(error) throw error;
    for(const l of L){
      if(l.ingredient_id){
        await majPrixMP(l.ingredient_id, _pu(l));
      }
    }
  }

  await SB.from('gp_achats').update({
    statut:statutFinal||'valide_daf',
    valide_par:GP_USER.id,valide_par_nom:GP_USER.email
  }).eq('id',achatId);
  // Drapeau (séparé : inoffensif si colonne absente) — stock bien crédité
  try{ await SB.from('gp_achats').update({stock_credite:true}).eq('id',achatId); }catch(_){}
}

// ── DÉTAIL ACHAT ──────────────────────────────────
async function voirDetailAchat(id){
  const{data:a}=await SB.from('gp_achats').select('*').eq('id',id).maybeSingle();
  const{data:lignes}=await SB.from('gp_achats_lignes').select('*').eq('achat_id',id);
  const{data:paiements}=await SB.from('gp_achats_paiements').select('*').eq('achat_id',id).order('date_paiement');
  if(!a)return;
  const L=lignes||[];const P=paiements||[];
  const F=(typeof achatFraisLire==='function') ? await achatFraisLire(id) : [];
  const CR=(typeof coutReelAchat==='function') ? coutReelAchat(L, F||[]) : null;
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
      ${(()=>{
        // LA SOUSTRACTION QUI MANQUAIT. Le bon affichait « 25 kg » et
        // « 400 000 F » sur la même ligne sans jamais les rapprocher.
        const vr=L.reduce((s,l)=>s+(Number(l.qte_recue>0?l.qte_recue:l.qte_commandee)||0)*Number(l.prix_unitaire||0),0);
        return Math.abs(vr-Number(a.montant_total||0))>1
          ? `<tr style="font-weight:700"><td colspan="4" style="color:var(--red)">VALEUR RÉELLEMENT REÇUE</td><td class="num" style="color:var(--red)">${fmt(Math.round(vr))} F</td></tr>`
          : '';
      })()}
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
    ${Number(a.montant_paye||0)>Number(a.montant_total||0)+1?`
    <div style="margin-top:10px;background:rgba(245,158,11,.10);border:1px solid var(--gold);border-radius:8px;padding:10px;font-size:11.5px;line-height:1.6">
      💰 <b>Avoir chez ${a.fournisseur_nom||'le fournisseur'} : ${fmt(Number(a.montant_paye||0)-Number(a.montant_total||0))} F</b><br>
      <span style="color:var(--textm)">Payé ${fmt(a.montant_paye)} F pour ${fmt(a.montant_total)} F de marchandise. À récupérer, ou à imputer sur la prochaine commande.</span>
    </div>`:''}
    ${_achatBlocFrais(a, L, F, CR)}
    ${a.note_logistique?`<div style="margin-top:8px;font-size:11px"><strong>Note logistique :</strong> ${a.note_logistique}</div>`:''}
    ${a.note_reception?`<div style="font-size:11px"><strong>Note réception :</strong> ${a.note_reception}</div>`:''}
    ${a.note_daf?`<div style="font-size:11px"><strong>Note DAF :</strong> ${a.note_daf}</div>`:''}
    ${['credit','tranches','avance'].includes(a.condition_paiement)&&Number(a.montant_total||0)>Number(a.montant_paye||0)?`
    <div style="margin-top:14px;border-top:1px solid var(--border);padding-top:12px;text-align:center">
      <div style="font-size:12px;color:var(--red);font-weight:700;margin-bottom:10px">
        ⏳ Reste dû : ${fmt(Number(a.montant_total||0)-Number(a.montant_paye||0))} F
      </div>
      <button class="btn btn-g" onclick="document.getElementById('modal-detail-achat').style.display='none';showGP('paiements_mp');"
        style="width:100%;justify-content:center;font-size:14px;min-height:44px">
        💳 Aller à la page Paiements MP
      </button>
    </div>`:''}`;
  modal.style.display='flex';
}

function populateIngredientsAchat(){
  // La liste est gérée par la recherche — rien à faire ici
}

function filtrerIngrAchat(){
  const search=normalizeSearch(document.getElementById('achat_ingr_search')?.value||'');
  const results=document.getElementById('achat_ingr_results');
  if(!results)return;
  if(!search){results.style.display='none';return;}

  const filtered=[...GP_INGREDIENTS]
    .filter(i=>i.actif!==false && normalizeSearch(i.nom).includes(search))
    .sort((a,b)=>a.nom.localeCompare(b.nom))
    .slice(0,10);

  if(!filtered.length){
    results.style.display='none';return;
  }

  results.style.display='block';
  const niv=window._mpNiveaux||{};
  results.innerHTML=filtered.map(i=>{
    const stock=Number(niv[i.nom]||0);
    return `
    <div onclick="selectionnerIngrAchat('${i.id}','${i.nom.replace(/'/g,"\\'").replace(/"/g,'&quot;')}',${i.prix_actuel||0})"
      style="padding:8px 12px;cursor:pointer;font-size:12px;border-bottom:1px solid var(--border);transition:background .15s"
      onmouseover="this.style.background='rgba(22,163,74,.1)'"
      onmouseout="this.style.background=''">
      <span style="font-weight:600">${i.nom}</span>
      <span style="color:var(--textm);margin-left:8px">${fmt(i.prix_actuel||0)} F/kg</span>
      <span style="margin-left:8px;color:${stock>0?'var(--g6)':'var(--red)'}">· ${fmtKg(stock)} kg en stock</span>
    </div>`;}).join('');
}

function selectionnerIngrAchat(id,nom,prix){
  document.getElementById('achat_ingr').value=id;
  document.getElementById('achat_ingr_search').value=nom;
  document.getElementById('achat_ingr_results').style.display='none';
  const selected=document.getElementById('achat_ingr_selected');
  if(selected){
    selected.style.display='block';
    const stock=Number((window._mpNiveaux||{})[nom]||0);
    selected.innerHTML=`✓ <strong>${nom}</strong> — Prix habituel : ${fmt(prix)} F/kg · <span style="color:${stock>0?'var(--g6)':'var(--red)'}">${fmtKg(stock)} kg en stock</span>`;
  }
  // Pré-remplir le prix/kg et recalculer le prix/sac
  const prixEl=document.getElementById('achat_prix');
  if(prixEl&&prix>0){prixEl.value=prix;syncPrixAchat('kg');}
}

// Fermer la liste si clic ailleurs
document.addEventListener('click',function(e){
  const search=document.getElementById('achat_ingr_search');
  const results=document.getElementById('achat_ingr_results');
  if(search&&results&&!search.contains(e.target)&&!results.contains(e.target)){
    results.style.display='none';
  }
});

// ── PAIEMENT FOURNISSEUR ─────────────────────────
async function savePaiementAchat(achatId, montantTotal, montantDejaPayé){
  if(typeof peutPayerMP==='function' && !(await peutPayerMP())){
    notify('Paiement réservé à la Production et au PDV principal.','r');
    return;
  }
  const montant=+document.getElementById('pmt_montant')?.value||0;
  const mode=document.getElementById('pmt_mode')?.value||'especes';
  const date=document.getElementById('pmt_date')?.value||today();
  const ref=document.getElementById('pmt_ref')?.value.trim()||null;
  const err=document.getElementById('pmt_err');

  if(!montant||montant<=0){err.textContent='Entrez un montant valide.';return;}

  // GARDE-FOU : payer plus que ce qui est arrivé. Le 27/10/2026, 400 000 F sont
  // sortis de la caisse pour 40 000 F de lysine enregistrée, sans qu'aucun
  // écran ne rapproche les deux. Il les rapproche maintenant.
  try{
    const{data:_ls}=await SB.from('gp_achats_lignes')
      .select('qte_commandee,qte_recue,prix_unitaire').eq('achat_id',achatId);
    const _valeurRecue=(_ls||[]).reduce((s,l)=>
      s+(Number(l.qte_recue>0?l.qte_recue:l.qte_commandee)||0)*Number(l.prix_unitaire||0),0);
    const _apres=Number(montantDejaPayé||0)+montant;
    if(_valeurRecue>0 && _apres>_valeurRecue*1.05 && (_apres-_valeurRecue)>1000){
      if(!confirm(`⚠️ ATTENTION\n\nAprès ce paiement tu auras versé ${fmt(Math.round(_apres))} F `
        +`pour ${fmt(Math.round(_valeurRecue))} F de marchandise réellement reçue.\n\n`
        +`Écart : ${fmt(Math.round(_apres-_valeurRecue))} F.\n\n`
        +`Vérifie la réception du bon avant de payer. Continuer quand même ?`)) return;
    }
  }catch(_){}

  const nouveauPaye=Number(montantDejaPayé)+montant;
  const reste=Number(montantTotal)-nouveauPaye;
  const statutPaiement=reste<=0?'solde':'partiel';

  // Enregistrer le paiement (id capturé pour le rattrapage caisse)
  const{data:paie,error}=await SB.from('gp_achats_paiements').insert({
    achat_id:achatId,
    admin_id:GP_ADMIN_ID,
    montant,mode_paiement:mode,
    date_paiement:date,
    reference:ref,
    enregistre_par:GP_USER?.id,
    enregistre_par_nom:GP_USER?.email?.split('@')[0]
  }).select().maybeSingle();

  if(error){err.textContent='Erreur: '+error.message;return;}

  // Mettre à jour montant_paye et statut sur l'achat
  await SB.from('gp_achats').update({
    montant_paye:nouveauPaye,
    statut_paiement:statutPaiement
  }).eq('id',achatId);

  // Sortie caisse — LA caisse de CE point de vente, jamais une autre. Si elle
  // manque, le paiement reste enregistré et le rattrapage s'en chargera quand la
  // caisse existera ; debiter le tiroir d'un autre PDV serait pire que d'attendre.
  let _caisse=null;
  try{ _caisse = await caisseDuPdv(GP_POINT_VENTE, 'physique'); }catch(_){}
  if(!_caisse && typeof notify==='function') notify(
    `Paiement enregistr\u00e9, mais aucune caisse physique sur ${GP_POINT_VENTE||'Production'} : `
    + `l'argent n'est pas encore sorti de caisse.`, 'r');
  const _caisseId=_caisse?.id||null;
  let _caisseOk=false;
  if(_caisseId && paie?.id){
    const{error:eSortie}=await SB.from('gp_mouvements_caisse').insert({
      admin_id:GP_ADMIN_ID,caisse_id:_caisseId,
      type:'sortie',categorie:'paiement_fournisseur',
      montant,date_mouvement:date,
      description:`Paiement fournisseur · ${ref||mode}`,
      enregistre_par:GP_USER?.id,
      enregistre_par_nom:GP_USER?.email?.split('@')[0]
    });
    _caisseOk=!eSortie;
  }
  if(paie?.id){ try{ await SB.from('gp_achats_paiements').update({caisse_id:_caisseId, caisse_debitee:_caisseOk}).eq('id',paie.id); }catch(_){} }

  // Notification WhatsApp au fournisseur si configuré
  const{data:achat}=await SB.from('gp_achats').select('fournisseur_id,fournisseur_nom,ref')
    .eq('id',achatId).maybeSingle();
  if(achat?.fournisseur_id){
    const{data:fourn}=await SB.from('gp_fournisseurs').select('telephone')
      .eq('id',achat.fournisseur_id).maybeSingle();
    if(fourn?.telephone){
      const paysInfo=detecterPays(fourn.telephone);
      const msg=encodeURIComponent(
        `Bonjour,\n\nNous vous confirmons un paiement de *${fmt(montant)} F* pour la commande *${achat.ref||achatId.slice(0,8)}*.\n`+
        `Mode : ${mode}${ref?' · Réf: '+ref:''}\n`+
        (reste>0?`Reste à payer : *${fmt(reste)} F*`:`✅ Commande entièrement soldée`)+
        `\n\n_${GP_CONFIG?.nom_provenderie||'PROVENDA'}_`
      );
      window.open(`https://wa.me/${paysInfo.numero_whatsapp}?text=${msg}`,'_blank');
    }
  }

  // 🔔 Notifier l'admin du paiement (push ; le WhatsApp fournisseur s'ouvre déjà)
  notifierAdmin(
    '💳 Paiement fournisseur',
    `${fmt(montant)} F → ${achat?.fournisseur_nom||'fournisseur'} (reste ${fmt(reste)} F) par ${GP_USER?.email?.split('@')[0]||''}`,
    `💳 *Paiement fournisseur*\n${achat?.fournisseur_nom||'—'} · ${fmt(montant)} F\nCommande : ${achat?.ref||achatId.slice(0,8)}\nReste dû : ${fmt(reste)} F\nPar : ${GP_USER?.email?.split('@')[0]||'secrétaire'}\n\n_${GP_CONFIG?.nom_provenderie||'PROVENDA'}_`,
    false /* pas d'ouverture auto : le WhatsApp fournisseur occupe déjà l'onglet */
  );

  notify(`Paiement de ${fmt(montant)} F enregistré ✓`,'gold');
  document.getElementById('modal-detail-achat').style.display='none';
  await renderAchats();
}

// ── RATTRAPAGE crédit stock des achats validés (crediterStockDepuisAchat est idempotent) ──
let _syncStockAchatEnCours=false;
async function synchroniserStockAchats(){
  if(_syncStockAchatEnCours) return;
  if(typeof navigator!=='undefined' && navigator.onLine===false) return;
  if(typeof GP_ADMIN_ID==='undefined' || !GP_ADMIN_ID) return;
  _syncStockAchatEnCours=true;
  try{
    const{data:as}=await SB.from('gp_achats').select('id')
      .eq('admin_id',GP_ADMIN_ID).eq('statut','valide_daf').eq('stock_credite',false).limit(100);
    if(!as || !as.length) return;
    let n=0;
    for(const a of as){
      const{data:claim}=await SB.from('gp_achats').update({stock_credite:true}).eq('id',a.id).eq('stock_credite',false).select('id');
      if(!claim || !claim.length) continue;
      try{ await crediterStockDepuisAchat(a.id); n++; }
      catch(e){ try{ await SB.from('gp_achats').update({stock_credite:false}).eq('id',a.id); }catch(_){} }
    }
    if(n>0 && typeof notify==='function') notify(`🔄 ${n} achat(s) crédité(s) au stock`,'gold');
    if(n>0 && typeof renderStockNiveaux==='function'){ try{ renderStockNiveaux(); }catch(_){} }
  }catch(e){}
  finally{ _syncStockAchatEnCours=false; }
}
