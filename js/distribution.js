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
  // Source = PDV du membre connecté (automatique)
  const srcLabel=document.getElementById('dist_source_label');
  const srcInput=document.getElementById('dist_source');
  const srcPDV=GP_POINT_VENTE||'Production';
  if(srcLabel)srcLabel.textContent=srcPDV;
  if(srcInput)srcInput.value=srcPDV;

  // Destination : tous les PDV sauf la source
  const destEl=document.getElementById('dist_dest');
  if(destEl)destEl.innerHTML=pdvOptions;

  // Remplir select formule (depuis FORMULES_SADARI + GP_INGREDIENTS)
  const distFormule=document.getElementById('dist_formule');
  if(distFormule){
    if(!GP_INGREDIENTS.length)await loadIngredients();
    const allF=getAllFormules();
    const groups={};
    allF.forEach(f=>{if(!groups[f.espece])groups[f.espece]=[];groups[f.espece].push(f);});
    let html='<option value="">— Sélectionner un produit —</option>';
    Object.entries(groups).forEach(([esp,fs])=>{
      html+=`<optgroup label="${ESPECE_ICON[esp]||''} ${esp.charAt(0).toUpperCase()+esp.slice(1)}">`;
      fs.forEach(f=>{html+=`<option value="${f.nom}">${f.nom}</option>`;});
      html+='</optgroup>';
    });
    distFormule.innerHTML=html;
  }

  // Charger livraisons
  const{data:livs}=await SB.from('gp_livraisons_pdv').select('*')
    .eq('admin_id',GP_ADMIN_ID)
    .order('created_at',{ascending:false}).limit(50);
  let L=livs||[];

  // CLOISONNEMENT PDV : un membre non-admin ne voit que les livraisons qui
  // concernent SON point de vente (entrantes ou sortantes). L'admin voit tout.
  // GP_POINT_VENTE null = secrétaire central → rattaché à "Production".
  const monPDV = GP_POINT_VENTE || 'Production';
  if(GP_ROLE!=='admin'){
    L = L.filter(l => l.pdv_dest_nom===monPDV || l.pdv_source_nom===monPDV);
  }

  // KPIs
  const totalEnvoye=L.reduce((s,l)=>s+Number(l.montant_total||0),0);
  // Un PDV PRINCIPAL est un prolongement de la Production : la livraison est un
  // transfert interne (pas de dette). Seuls les PDV secondaires (revendeurs) doivent.
  const totalDu=L.reduce((s,l)=> s + (_livInterne(l)?0:(Number(l.montant_total||0)-Number(l.montant_paye||0))),0);
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
        const interne=_livInterne(l);
        const reste=Number(l.montant_total||0)-Number(l.montant_paye||0);
        return `<tr>
          <td style="font-size:10px">${l.date_livraison}</td>
          <td style="font-size:11px"><strong>${l.pdv_source_nom||'—'}</strong><br>→ ${l.pdv_dest_nom||'—'}</td>
          <td style="font-weight:600">${l.formule_nom}</td>
          <td class="num">${l.qte_envoyee}</td>
          <td class="num" style="color:${l.qte_confirmee<l.qte_envoyee?'var(--red)':'var(--green)'}">${l.qte_confirmee||'—'}</td>
          <td class="num">${fmt(l.montant_total)} F</td>
          <td class="num" style="color:${interne?'var(--textm)':(reste>0?'var(--red)':'var(--green)')}">${interne?'📦 interne':(reste>0?fmt(l.montant_paye)+' F':'✓')}</td>
          <td>${statutLivBadge(l.statut, interne?'na':l.statut_paiement)}</td>
          <td><div style="display:flex;gap:3px">${actionsLivraison(l)}</div></td>
        </tr>`;
      }).join('')}
      </tbody>
    </table>`:'<div style="color:var(--textm);font-size:12px">Aucune livraison enregistrée.</div>';

  // Selects de la saisie manuelle (départ / inventaire)
  if(typeof remplirSelectsStockManuel==='function') remplirSelectsStockManuel();

  // Stock produits finis par PDV
  await renderStockPDV();
}

// Livraison "interne" = destination est un PDV PRINCIPAL (prolongement de Production) → pas de dette.
function _livInterne(l){
  if(!l) return false;
  const list = (typeof GP_PDV_LIST!=='undefined') ? GP_PDV_LIST : [];
  const p = list.find(x=> x.id===l.pdv_dest_id || x.nom===l.pdv_dest_nom);
  return p?.type_pdv==='principal';
}

// ══════════════════════════════════════════════════════════════════
// TRAÇABILITÉ STOCK (déterministe) — reconstruit la chaîne d'un stock PF
// depuis les vraies tables : reçu (livraisons confirmées) + produit (lots) −
// vendu (ventes) − redistribué (livraisons sortantes) ± écart (inventaire).
// Utilisé par le modal 🔎 (A) ET injecté dans le contexte IA (B).
// ══════════════════════════════════════════════════════════════════
async function calcTracabiliteStockAll(){
  const [liv, vts, stk, lots] = await Promise.all([
    SB.from('gp_livraisons_pdv').select('pdv_source_nom,pdv_dest_nom,formule_nom,qte_envoyee,qte_confirmee,poids_sac,statut').eq('admin_id',GP_ADMIN_ID),
    SB.from('gp_ventes').select('point_vente,formule_nom,qte_vendue').eq('admin_id',GP_ADMIN_ID).is('deleted_at',null),
    SB.from('gp_stock_produits_pdv').select('pdv_nom,formule_nom,qte_disponible').eq('admin_id',GP_ADMIN_ID),
    SB.from('gp_lots').select('formule_nom,qte_produite').eq('admin_id',GP_ADMIN_ID)
  ]);
  const map={};
  const get=(p,f)=>{ const k=(p||'Production')+'||'+f; if(!map[k]) map[k]={pdv:p||'Production',produit:f,recu:0,produit_kg:0,vendu:0,redistribue:0,stock:0}; return map[k]; };
  // Reçu (dest) / redistribué (source) — livraisons confirmées, converties en kg
  (liv.data||[]).forEach(l=>{
    if(!l.formule_nom) return;
    const kg=Number(l.qte_confirmee||l.qte_envoyee||0)*Number(l.poids_sac||1);
    if(l.pdv_dest_nom)   get(l.pdv_dest_nom,l.formule_nom).recu += kg;
    if(l.pdv_source_nom) get(l.pdv_source_nom,l.formule_nom).redistribue += kg;
  });
  // Vendu (ventes) — déjà en kg
  (vts.data||[]).forEach(v=>{ if(v.formule_nom) get(v.point_vente||'Production',v.formule_nom).vendu += Number(v.qte_vendue||0); });
  // Produit (lots) → entrées de la Production
  (lots.data||[]).forEach(l=>{ if(l.formule_nom) get('Production',l.formule_nom).produit_kg += Number(l.qte_produite||0); });
  // Stock actuel
  (stk.data||[]).forEach(s=>{ if(s.formule_nom) get(s.pdv_nom,s.formule_nom).stock = Number(s.qte_disponible||0); });
  return Object.values(map).map(o=>{
    const entrees=o.recu+o.produit_kg;
    const theorique=entrees - o.vendu - o.redistribue;
    return {...o, entrees, theorique, ecart: Math.round((o.stock - theorique)*10)/10};
  });
}

// Modal 🔎 : traçabilité d'un (PDV, produit)
async function ouvrirTracabilite(pdvNom, formuleNom){
  let host=document.getElementById('modal-tracabilite');
  if(!host){ host=document.createElement('div'); host.id='modal-tracabilite'; document.body.appendChild(host); }
  host.style.cssText='position:fixed;inset:0;z-index:1000;background:rgba(0,0,0,.75);display:flex;align-items:center;justify-content:center;padding:16px';
  host.innerHTML=`<div style="background:var(--card2);border:1px solid var(--border);border-radius:14px;padding:20px;max-width:460px;width:100%"><div style="color:var(--textm)">⏳ Calcul de la traçabilité…</div></div>`;
  let row;
  try{
    const all=await calcTracabiliteStockAll();
    row=all.find(r=>r.pdv===pdvNom && r.produit===formuleNom) || {pdv:pdvNom,produit:formuleNom,recu:0,produit_kg:0,vendu:0,redistribue:0,stock:0,entrees:0,theorique:0,ecart:0};
  }catch(e){ row={pdv:pdvNom,produit:formuleNom,_err:e.message}; }
  const L=(lbl,val,color)=>`<div style="display:flex;justify-content:space-between;padding:7px 0;border-bottom:1px solid var(--border);font-size:13px"><span>${lbl}</span><span style="font-weight:700;${color?'color:'+color:''}">${val}</span></div>`;
  host.innerHTML=`<div style="background:var(--card2);border:1px solid var(--border);border-radius:14px;padding:20px;max-width:460px;width:100%;max-height:88vh;overflow-y:auto">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
      <div style="font-weight:700;font-size:15px">🔎 Traçabilité stock</div>
      <button onclick="document.getElementById('modal-tracabilite').remove()" style="background:none;border:none;color:var(--textm);font-size:20px;cursor:pointer">✕</button>
    </div>
    <div style="font-size:12px;color:var(--textm);margin-bottom:12px">${formuleNom} · ${pdvNom}</div>
    ${row._err?`<div style="color:var(--red);font-size:12px">Erreur : ${row._err}</div>`:`
      ${row.produit_kg>0?L('🏭 Produit (lots)','+'+fmtKg(row.produit_kg)+' kg','var(--green)'):''}
      ${L('📥 Reçu (livraisons)','+'+fmtKg(row.recu)+' kg','var(--green)')}
      ${L('🛒 Vendu (ventes)','−'+fmtKg(row.vendu)+' kg','var(--red)')}
      ${row.redistribue>0?L('🚚 Redistribué (vers d\'autres PDV)','−'+fmtKg(row.redistribue)+' kg','var(--red)'):''}
      <div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:2px solid var(--border);font-size:13px"><span>= Théorique</span><span style="font-weight:700">${fmtKg(row.theorique)} kg</span></div>
      ${L('📦 Stock réel affiché',fmtKg(row.stock)+' kg','var(--gold)')}
      ${Math.abs(row.ecart)>0.1?`<div style="margin-top:10px;background:rgba(245,158,11,.1);border:1px solid rgba(245,158,11,.35);border-radius:8px;padding:8px 10px;font-size:11px">⚠ Écart de <b>${fmtKg(row.ecart)} kg</b> entre le théorique et le stock affiché — probablement un <b>ajustement d'inventaire / saisie manuelle</b>.</div>`:`<div style="margin-top:10px;color:var(--g6);font-size:11px">✅ Le stock affiché correspond exactement au calcul (reçu/produit − vendu − redistribué).</div>`}
    `}
  </div>`;
}

function statutLivBadge(statut,statutPaiement){
  const labels={envoye:'📤 Envoyé',confirme:'✅ Confirmé',litige:'⚠ Litige',solde:'✅ Soldé',annule:'❌ Annulé'};
  const colors={envoye:'bdg-gold',confirme:'bdg-g',litige:'bdg-r',solde:'bdg-g',annule:'bdg-r'};
  const pmt = statutPaiement==='na'
    ? `<span class="badge bdg-b" style="font-size:9px;display:block;margin-top:2px">📦 transfert interne</span>`
    : (statutPaiement!=='paye'
        ? `<span class="badge ${statutPaiement==='partiel'?'bdg-gold':'bdg-r'}" style="font-size:9px;display:block;margin-top:2px">${statutPaiement}</span>`
        : '');
  return `<div>
    <span class="badge ${colors[statut]}" style="font-size:9px">${labels[statut]||statut}</span>
    ${pmt}
  </div>`;
}

function actionsLivraison(l){
  let btns='';
  // Seul le PDV DESTINATAIRE confirme sa propre réception (l'admin peut confirmer partout).
  const monPDV = GP_POINT_VENTE || 'Production';
  const peutConfirmer = GP_ROLE==='admin' || l.pdv_dest_nom===monPDV;
  if(l.statut==='envoye' && peutConfirmer){
    btns+=`<button class="btn btn-g btn-sm" onclick="ouvrirConfirmationReception('${l.id}')">📦 Confirmer</button>`;
  }
  if(l.statut==='confirme'&&l.statut_paiement!=='paye'&&l.type_relation==='vente_gros'&&!_livInterne(l)){
    btns+=`<button class="btn btn-out btn-sm" onclick="ouvrirPaiementLivraison('${l.id}','${l.pdv_dest_nom}',${Number(l.montant_total)-Number(l.montant_paye)})">💳 Payer</button>`;
  }
  if(GP_ROLE==='admin'){
    btns+=`<button class="btn btn-red btn-sm" onclick="supprimerLivraison('${l.id}')" title="Supprimer — rend le stock source, retire le stock reçu, annule les paiements" style="padding:2px 6px">🗑</button>`;
  }
  btns+=`<button class="btn btn-out btn-sm" onclick="voirDetailLivraison('${l.id}')">👁</button>`;
  return btns;
}

// Supprime une livraison (admin) en ANNULANT tous ses effets :
//  1) recrédite le stock de la SOURCE (formule) ou supprime la sortie MP
//  2) retire du stock de la DEST ce qui avait été confirmé
//  3) supprime les paiements liés + leurs entrées de caisse
async function supprimerLivraison(id){
  if(GP_ROLE!=='admin'){ notify('Suppression réservée à l\'administrateur','r'); return; }
  const{data:l}=await SB.from('gp_livraisons_pdv').select('*').eq('id',id).maybeSingle();
  if(!l){ notify('Livraison introuvable','r'); return; }
  const{data:pmts}=await SB.from('gp_paiements_livraison_pdv').select('*').eq('livraison_id',id);
  const P=pmts||[];
  const poids=Number(l.poids_sac||25);
  let msg=`Supprimer la livraison ${l.ref||''} (${l.formule_nom} → ${l.pdv_dest_nom}) ?\n\n`;
  msg+=`• Stock rendu à ${l.pdv_source_nom}.\n`;
  if(Number(l.qte_confirmee||0)>0) msg+=`• Stock reçu chez ${l.pdv_dest_nom} retiré.\n`;
  if(P.length) msg+=`• ${P.length} paiement(s) = ${fmt(P.reduce((s,p)=>s+Number(p.montant||0),0))} F supprimés + retirés de la caisse.\n`;
  msg+=`\nAction irréversible.`;
  if(!confirm(msg)) return;

  // 1) Stock SOURCE
  if(l.type_produit==='formule'){
    await ajusterStockPDV(l.pdv_source_nom, l.formule_nom, +Number(l.qte_envoyee||0)*poids);
    // 2) Stock DEST (ce qui avait été confirmé)
    if(Number(l.qte_confirmee||0)>0){
      await ajusterStockPDV(l.pdv_dest_nom, l.formule_nom, -Number(l.qte_confirmee||0)*poids);
    }
  } else if(l.type_produit==='mp'){
    try{ await SB.from('gp_stock_mp').delete()
      .eq('admin_id',GP_ADMIN_ID).eq('ref','Livraison '+String(l.id).slice(0,8)+' → '+l.pdv_dest_nom); }catch(e){}
  }

  // 3) Paiements + entrées caisse
  for(const p of P){
    try{
      const{data:mv}=await SB.from('gp_mouvements_caisse').select('id')
        .eq('admin_id',GP_ADMIN_ID).eq('type','entree').eq('categorie','vente_gros')
        .eq('montant',p.montant).eq('description',`Règlement livraison → ${l.pdv_dest_nom||''} · ${p.mode}`).limit(1);
      if(mv&&mv.length) await SB.from('gp_mouvements_caisse').delete().eq('id',mv[0].id);
    }catch(e){}
  }
  if(P.length){ try{ await SB.from('gp_paiements_livraison_pdv').delete().eq('livraison_id',id); }catch(e){} }

  // 4) La livraison elle-même
  await SB.from('gp_livraisons_pdv').delete().eq('id',id).eq('admin_id',GP_ADMIN_ID);
  notify('Livraison supprimée — stock et caisse ajustés ✓','r');
  await renderDistribution();
}

// ── BASCULE TYPE PRODUIT POUR DISTRIBUTION ───────
function basculerTypeProduitDist(type){
  document.getElementById('dist_type_produit').value = type;
  const btnF = document.getElementById('dist_type_formule_btn');
  const btnM = document.getElementById('dist_type_mp_btn');
  const wrapF = document.getElementById('dist-formule-wrap');
  const wrapM = document.getElementById('dist-mp-wrap');
  const actif = 'background:rgba(22,163,74,.15);border:1px solid rgba(22,163,74,.4);color:var(--g6)';
  const inactif = 'background:var(--card2);border:1px solid var(--border);color:var(--textm)';
  const qteLabel = document.getElementById('dist-qte-label');
  const prixLabel = document.getElementById('dist-prix-label');
  if(type === 'mp'){
    btnF.style.cssText = btnF.style.cssText.replace(actif,'') + ';' + inactif;
    btnM.style.cssText = btnM.style.cssText.replace(inactif,'') + ';' + actif;
    wrapF.style.display = 'none';
    wrapM.style.display = 'block';
    if(qteLabel) qteLabel.textContent = 'Quantité (kg)';
    if(prixLabel) prixLabel.textContent = 'Prix gros/kg (F)';
    populateSelectMPDist();
  } else {
    btnF.style.cssText = btnF.style.cssText.replace(inactif,'') + ';' + actif;
    btnM.style.cssText = btnM.style.cssText.replace(actif,'') + ';' + inactif;
    wrapF.style.display = 'block';
    wrapM.style.display = 'none';
    if(qteLabel) qteLabel.textContent = 'Quantité (sacs)';
    if(prixLabel) prixLabel.textContent = 'Prix gros/sac (F)';
  }
  ['dist_qte','dist_prix'].forEach(id => { const el = document.getElementById(id); if(el) el.value = ''; });
}

async function populateSelectMPDist(){
  const sel = document.getElementById('dist_mp');
  if(!sel) return;
  // Fetch direct pour garantir la fraîcheur
  const{data:ingrFresh, error:errI} = await SB.from('gp_ingredients').select('*')
    .eq('admin_id', GP_ADMIN_ID).order('nom');
  if(errI){
    sel.innerHTML = `<option value="">⚠ Erreur : ${errI.message}</option>`;
    return;
  }
  if(ingrFresh && ingrFresh.length) GP_INGREDIENTS = ingrFresh;

  const{data:S} = await SB.from('gp_stock_mp').select('*').eq('admin_id', GP_ADMIN_ID);
  window._stockNiveaux = S || [];
  const niveaux = (typeof calcNiveaux === 'function')
    ? calcNiveaux(window._stockNiveaux) : {};

  const list = ingrFresh || [];
  if(!list.length){
    sel.innerHTML = '<option value="">— Aucune MP enregistrée —</option>';
    return;
  }

  sel.innerHTML = '<option value="">— Sélectionner une MP —</option>' +
    list.map(i => {
      const stock = niveaux[i.nom] || 0;
      return `<option value="${i.id}" data-nom="${i.nom}" data-prix="${i.prix_actuel||0}">${i.nom} · ${fmtKg(stock)} kg dispo</option>`;
    }).join('');
  sel.onchange = () => {
    const opt = sel.selectedOptions[0];
    if(!opt || !opt.value){ document.getElementById('dist_mp_id').value=''; return; }
    document.getElementById('dist_mp_id').value = opt.value;
    const prixEl = document.getElementById('dist_prix');
    if(prixEl && !prixEl.value) prixEl.value = opt.dataset.prix || 0;
  };
}

// ── CRÉER UNE LIVRAISON ───────────────────────────
async function saveLivraison(){
  // dist_source contient un NOM (PDV du membre ou "Production"/siège), pas un UUID
  const sourceNom=document.getElementById('dist_source')?.value||GP_POINT_VENTE||'Production';
  const destId=document.getElementById('dist_dest')?.value;
  const typeProduit = document.getElementById('dist_type_produit')?.value || 'formule';
  const qte=+document.getElementById('dist_qte')?.value||0;
  const poidsSac=+document.getElementById('dist_poids')?.value||25;
  const prixGros=+document.getElementById('dist_prix')?.value||0;
  const typeRel=document.getElementById('dist_type')?.value||'vente_gros';
  const err=document.getElementById('dist_err');

  // Récupérer le produit selon le type
  let produitNom, ingredientId = null;
  if(typeProduit === 'mp'){
    ingredientId = document.getElementById('dist_mp_id')?.value;
    if(!ingredientId){ err.textContent='Sélectionnez une matière première.'; return; }
    const opt = document.querySelector(`#dist_mp option[value="${ingredientId}"]`);
    produitNom = opt?.dataset.nom || 'Matière première';
  } else {
    produitNom = document.getElementById('dist_formule')?.value;
    if(!produitNom){ err.textContent='Sélectionnez une formule.'; return; }
  }

  if(!sourceNom||!destId||!qte||!prixGros){
    err.textContent='Tous les champs sont requis.';return;
  }

  // Résoudre la source par son NOM : si c'est un vrai PDV → son UUID ; sinon (Production/siège) → null
  const source=GP_PDV_LIST.find(p=>p.nom===sourceNom);
  const dest=GP_PDV_LIST.find(p=>p.id===destId);
  const sourceUuid=source?.id||null;          // null = Production/siège (pas un PDV)
  const sourceNomFinal=source?.nom||sourceNom; // ex: "Production"

  if(dest && dest.nom===sourceNomFinal){err.textContent='Source et destination doivent être différents.';return;}
  if(sourceUuid && sourceUuid===destId){err.textContent='Source et destination doivent être différents.';return;}

  // ── BLOCAGE : la source doit avoir assez de stock (formules ; MP gérée par gp_stock_mp) ──
  // Stock en KG ; quantité distribuée = qte sacs × poids du sac
  const kgDistribue = qte * poidsSac;
  if(typeProduit==='formule'){
    const{data:srcStock}=await SB.from('gp_stock_produits_pdv').select('qte_disponible')
      .eq('admin_id',GP_ADMIN_ID).eq('pdv_nom',sourceNomFinal).eq('formule_nom',produitNom).maybeSingle();
    const dispoKg=Number(srcStock?.qte_disponible||0);
    if(dispoKg < kgDistribue){
      err.textContent=`🚫 Stock insuffisant à ${sourceNomFinal} : ${fmt(dispoKg)} kg dispo pour ${produitNom}, ${fmt(kgDistribue)} kg demandés (${qte} sac(s) × ${poidsSac} kg).`;
      return;
    }
  }

  const refLiv='LIV-'+new Date().getFullYear()+'-'+String(Math.floor(Math.random()*9000)+1000);
  const{data:liv,error}=await SB.from('gp_livraisons_pdv').insert({
    admin_id:GP_ADMIN_ID,
    ref:refLiv,
    pdv_source_id:sourceUuid,pdv_dest_id:destId,
    pdv_source_nom:sourceNomFinal,pdv_dest_nom:dest?.nom,
    type_relation:typeRel,
    formule_nom:produitNom,
    type_produit:typeProduit,
    ingredient_id:ingredientId,
    qte_envoyee:qte,qte_confirmee:0,
    poids_sac:poidsSac,
    prix_gros_unitaire:prixGros,
    montant_total:qte*prixGros,
    montant_paye:0,
    statut:'envoye',
    statut_paiement:'impaye',
    envoye_par:GP_USER.id,
    date_livraison:today()
  }).select().maybeSingle();

  if(error){err.textContent='Erreur: '+error.message;return;}

  // Déduire le stock de la SOURCE à l'envoi. Si échec → drapeau false → RATTRAPÉ au refresh.
  let _stockOk=true;
  if(typeProduit==='formule'){
    _stockOk = await ajusterStockPDV(sourceNomFinal, produitNom, -kgDistribue);
  } else if(typeProduit === 'mp' && ingredientId){
    const{error:eMp}=await SB.from('gp_stock_mp').insert({
      admin_id:GP_ADMIN_ID, saisi_par:GP_USER?.id, type:'sortie_distribution', date:today(),
      ingredient_id:ingredientId, ingredient_nom:produitNom, quantite:qte, prix_unit:prixGros,
      ref:'Livraison '+(liv?.id||'').slice(0,8)+' → '+dest?.nom
    });
    _stockOk = !eMp;
  }
  if(liv?.id){ try{ await SB.from('gp_livraisons_pdv').update({stock_applique:_stockOk}).eq('id',liv.id); }catch(_){} }

  err.textContent='';
  ['dist_qte','dist_prix'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});
  notify(`Livraison ${produitNom} → ${dest?.nom} enregistrée ✓`,'gold');

  // 📲 Prévenir le PDV destinataire par WhatsApp (bon de livraison pré-rempli)
  try{
    const telDest = dest?.whatsapp || dest?.telephone || '';
    const interne = dest?.type_pdv==='principal';
    const prov = (typeof GP_CONFIG!=='undefined' && GP_CONFIG?.nom_provenderie) || 'PROVENDA';
    const kg = qte*poidsSac;
    const msg = interne
      ? `📦 *Transfert interne* — ${refLiv}\nDe : ${sourceNomFinal}\n${produitNom} : ${qte} sac(s) (~${fmtKg(kg)} kg)\n\nMerci de confirmer la réception dans l'app.\n\n_${prov}_`
      : `📦 *Bon de livraison* — ${refLiv}\nDe : ${sourceNomFinal}\n${produitNom} : ${qte} sac(s) (~${fmtKg(kg)} kg)\n💰 Montant à régler : *${fmt(qte*prixGros)} F*\n\nMerci de confirmer la réception et de régler.\n\n_${prov}_`;
    if(telDest && typeof detecterPays==='function'){
      const p = detecterPays(telDest);
      if(p.numero_whatsapp){ window.open('https://wa.me/'+p.numero_whatsapp+'?text='+encodeURIComponent(msg),'_blank'); }
      else notify(`Livraison OK ✓ — n° WhatsApp de ${dest?.nom} invalide`,'gold');
    } else {
      notify(`Livraison OK ✓ — ajoute un n° WhatsApp à ${dest?.nom} (Équipe & PDV) pour l'alerte auto`,'gold');
    }
  }catch(e){}

  await renderDistribution();
}

// ── CONFIRMATION RÉCEPTION ────────────────────────
async function ouvrirConfirmationReception(livId){
  const{data:l}=await SB.from('gp_livraisons_pdv').select('*').eq('id',livId).maybeSingle();
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

  const{data:l}=await SB.from('gp_livraisons_pdv').select('*').eq('id',livId).maybeSingle();
  if(!l)return;

  // Sécurité : un non-admin ne confirme que les livraisons destinées à SON PDV.
  const monPDV = GP_POINT_VENTE || 'Production';
  if(GP_ROLE!=='admin' && l.pdv_dest_nom!==monPDV){
    notify('Vous ne pouvez confirmer que les livraisons destinées à votre point de vente.','r');
    document.getElementById('modal-confirm-reception').style.display='none';
    return;
  }

  const statut=qteConfirmee<l.qte_envoyee?'litige':'confirme';

  await SB.from('gp_livraisons_pdv').update({
    qte_confirmee:qteConfirmee,
    statut,note,
    confirme_par:GP_USER.id
  }).eq('id',livId);

  // Si MP : pas de stock produits finis à mettre à jour (le stock MP central a déjà été décrémenté à l'envoi)
  if(l.type_produit==='mp'){
    document.getElementById('modal-confirm-reception').style.display='none';
    notify('Réception confirmée ✓','gold');
    await renderDistribution();
    return;
  }

  // Crédite le stock du PDV destination — en KG (qté confirmée en sacs × poids du sac)
  const kgRecu = qteConfirmee * Number(l.poids_sac||25);
  await ajusterStockPDV(l.pdv_dest_nom, l.formule_nom, kgRecu);

  // Si écart → créer dette secrétaire
  if(qteConfirmee<l.qte_envoyee){
    const ecart=l.qte_envoyee-qteConfirmee;
    const montantEcart=ecart*Number(l.prix_gros_unitaire);
    notify(`⚠ Écart de ${ecart} sacs détecté — ${fmt(montantEcart)} F de différence`,'gold');
  } else {
    notify('Réception confirmée ✓','gold');
  }

  document.getElementById('modal-confirm-reception').style.display='none';
  await renderDistribution();
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

  const{data:l}=await SB.from('gp_livraisons_pdv').select('montant_total,montant_paye,pdv_source_nom,pdv_dest_nom').eq('id',livId).maybeSingle();
  if(l){
    const nouveauPaye=Number(l.montant_paye||0)+montant;
    const statutPaiement=nouveauPaye>=Number(l.montant_total)?'paye':nouveauPaye>0?'partiel':'impaye';
    const statutLiv=statutPaiement==='paye'?'solde':'confirme';
    await SB.from('gp_livraisons_pdv').update({
      montant_paye:nouveauPaye,
      statut_paiement:statutPaiement,
      statut:statutLiv
    }).eq('id',livId);

    // 💵 ENTRÉE en caisse du PDV SOURCE (principal/Production) — l'argent reçu du secondaire
    const source=l.pdv_source_nom;
    let cq=SB.from('gp_caisses').select('id').eq('admin_id',GP_ADMIN_ID).eq('type','physique');
    cq = (source && source!=='Production' && source!=='Siège')
      ? cq.eq('point_vente', source)
      : cq.is('point_vente', null);
    const{data:caisses}=await cq.limit(1);
    if(caisses?.length){
      await SB.from('gp_mouvements_caisse').insert({
        admin_id:GP_ADMIN_ID, caisse_id:caisses[0].id,
        type:'entree', categorie:'vente_gros',
        montant, date_mouvement:today(),
        description:`Règlement livraison → ${l.pdv_dest_nom||''} · ${mode}`,
        enregistre_par:GP_USER?.id, enregistre_par_nom:GP_USER?.email?.split('@')[0]
      });
    }
    notify(`Paiement de ${fmt(montant)} F enregistré ✓`,'gold');
  }

  document.getElementById('modal-paiement-livraison').style.display='none';
  await renderDistribution();
}

// ── STOCK PRODUITS FINIS PAR PDV ─────────────────
// Ajuste le stock d'un PDV (ou de "Production") pour une formule. delta en KG (+ entrée / - sortie).
// Table unique gp_stock_produits_pdv = vérité opérationnelle (Production = pseudo-PDV). Tout en KG.
// Renvoie true si l'ajustement a réussi, false en cas d'erreur DB (pour le rattrapage).
// Les appelants existants ignorent la valeur — non-cassant.
async function ajusterStockPDV(pdvNom, formuleNom, deltaKg){
  if(!pdvNom || !formuleNom) return false;
  const{data:rows,error:eSel}=await SB.from('gp_stock_produits_pdv').select('id,qte_disponible')
    .eq('admin_id',GP_ADMIN_ID).eq('pdv_nom',pdvNom).eq('formule_nom',formuleNom)
    .order('qte_disponible',{ascending:false});
  if(eSel) return false;
  const st=(rows&&rows.length)?rows[0]:null;
  if(st){
    const{error}=await SB.from('gp_stock_produits_pdv').update({
      qte_disponible:Math.max(0,Number(st.qte_disponible||0)+deltaKg),
      updated_at:new Date().toISOString()
    }).eq('id',st.id);
    return !error;
  } else if(deltaKg>0){
    const{error}=await SB.from('gp_stock_produits_pdv').insert({
      admin_id:GP_ADMIN_ID, pdv_nom:pdvNom, formule_nom:formuleNom,
      qte_disponible:Math.max(0,deltaKg), seuil_critique:100
    });
    return !error;
  }
  return true; // deltaKg<=0 sans ligne : rien à faire, considéré OK
}

// Définit la valeur ABSOLUE du stock d'un PDV/formule (init départ ou inventaire). kg.
async function setStockPDV(pdvNom, formuleNom, kgAbsolu){
  if(!pdvNom||!formuleNom) return;
  // TOUTES les lignes (gère les doublons) : on garde la 1re et on n'en crée pas de nouvelle s'il en existe
  const{data:rows}=await SB.from('gp_stock_produits_pdv').select('id')
    .eq('admin_id',GP_ADMIN_ID).eq('pdv_nom',pdvNom).eq('formule_nom',formuleNom).limit(1);
  const st=(rows&&rows.length)?rows[0]:null;
  if(st){
    await SB.from('gp_stock_produits_pdv').update({qte_disponible:Math.max(0,kgAbsolu),updated_at:new Date().toISOString()}).eq('id',st.id);
  } else {
    await SB.from('gp_stock_produits_pdv').insert({
      admin_id:GP_ADMIN_ID, pdv_nom:pdvNom, formule_nom:formuleNom,
      qte_disponible:Math.max(0,kgAbsolu), seuil_critique:100
    });
  }
}

// Auto-calcul kg = sacs × poids. Si poids=1 (vrac), le champ "sacs" devient les kg directs.
function recalcStockSacs(){
  const sacs = +document.getElementById('sm_sacs')?.value || 0;
  const poids = +document.getElementById('sm_poids_sac')?.value || 25;
  const label = document.getElementById('sm_sacs_label');
  if(label){
    label.textContent = poids === 1 ? 'Quantité (kg)' : 'Nombre de sacs';
  }
  if(sacs > 0){
    document.getElementById('sm_kg').value = sacs * poids;
  }
}

// MODIFIER une valeur de stock depuis le tableau (input éditable)
async function mettreAJourStockPDV(stockId, pdvNom, formuleNom, nouvelleValeur){
  const kg = +nouvelleValeur || 0;
  if(kg < 0){ notify('Quantité invalide','r'); return; }
  await SB.from('gp_stock_produits_pdv').update({
    qte_disponible: kg,
    updated_at: new Date().toISOString()
  }).eq('id', stockId);
  notify(`Stock ${formuleNom} à ${pdvNom} → ${fmt(kg)} kg ✓`,'gold');
  await renderStockPDV();
}

// SUPPRIMER une ligne de stock (admin uniquement, avec confirmation)
async function supprimerStockPDV(stockId, formuleNom, pdvNom){
  if(!confirm(`Supprimer le stock de ${formuleNom} à ${pdvNom} ?\n\nLa ligne disparaîtra du tableau. Tu pourras la re-saisir via "Saisir un stock".`)) return;
  const {error} = await SB.from('gp_stock_produits_pdv').delete().eq('id', stockId);
  if(error){ notify('Erreur : '+error.message,'r'); return; }
  notify(`Ligne ${formuleNom} à ${pdvNom} supprimée ✓`,'gold');
  await renderStockPDV();
}

// Saisie manuelle du stock (formulaire départ/inventaire) — accepte sacs OU kg
async function saisirStockManuel(){
  const pdv=document.getElementById('sm_pdv')?.value;
  const formule=document.getElementById('sm_formule')?.value;
  const sacs=+document.getElementById('sm_sacs')?.value||0;
  const poids=+document.getElementById('sm_poids_sac')?.value||25;
  let kg=+document.getElementById('sm_kg')?.value;
  const err=document.getElementById('sm_err');
  if(err) err.textContent='';
  if(!pdv||!formule){ if(err)err.textContent='Choisis le point de vente et la formule.'; return; }
  // Si sacs renseigné et kg vide → calculer
  if(sacs>0 && (!kg||isNaN(kg))) kg = sacs*poids;
  if(isNaN(kg)||kg<0){ if(err)err.textContent='Entre une quantité valide (sacs ou kg).'; return; }
  await setStockPDV(pdv, formule, kg);
  document.getElementById('sm_kg').value='';
  document.getElementById('sm_sacs').value='';
  const detail = sacs>0 ? `${sacs} sacs × ${poids} kg = ${fmt(kg)} kg` : `${fmt(kg)} kg`;
  notify(`Stock ${formule} à ${pdv} défini à ${detail} ✓`,'gold');
  await renderStockPDV();
}

// Remplit les selects de la saisie manuelle (PDV incluant Production + formules)
function remplirSelectsStockManuel(){
  const selPdv=document.getElementById('sm_pdv');
  if(selPdv){
    selPdv.innerHTML='<option value="Production">🏭 Production (siège)</option>'+
      GP_PDV_LIST.map(p=>`<option value="${p.nom}">${p.nom}</option>`).join('');
  }
  const selF=document.getElementById('sm_formule');
  if(selF && typeof getAllFormules==='function'){
    selF.innerHTML='<option value="">— Formule —</option>'+
      getAllFormules().map(f=>`<option value="${f.nom}">${f.nom}</option>`).join('');
  }
}

async function renderStockPDV(){
  const{data}=await SB.from('gp_stock_produits_pdv').select('*')
    .eq('admin_id',GP_ADMIN_ID).order('pdv_nom').order('formule_nom');
  let S=data||[];

  // CLOISONNEMENT PDV :
  // - admin et PDV PRINCIPAL → voient TOUT le réseau (anticiper les commandes des PDV)
  // - autres PDV → SON stock + celui de la Production (visibilité appro)
  const monPDVStock = GP_POINT_VENTE || 'Production';
  if(GP_ROLE!=='admin' && !GP_EST_PRINCIPAL){
    S = S.filter(s => s.pdv_nom===monPDVStock || s.pdv_nom==='Production');
  }

  // Récupérer le poids/sac par formule depuis le DERNIER lot produit
  // → utilisé pour afficher le bon nombre de sacs (25 ou 50 kg) selon la prod
  const{data:lotsRecents}=await SB.from('gp_lots')
    .select('formule_nom,poids_sac,date')
    .eq('admin_id',GP_ADMIN_ID)
    .order('date',{ascending:false});
  const poidsSacParFormule={};
  (lotsRecents||[]).forEach(l=>{
    if(!poidsSacParFormule[l.formule_nom] && l.poids_sac){
      poidsSacParFormule[l.formule_nom] = Number(l.poids_sac);
    }
  });

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
        ${GP_ROLE==='admin'?`<button class="btn btn-out btn-sm" onclick="ouvrirSeuilPDV('${pdvNom}')" style="font-size:10px">⚙️ Seuils</button>`:''}
      </div>
      <table class="tbl" style="font-size:11px">
        <thead><tr><th>Produit</th><th class="num">Stock (kg)</th><th class="num">Seuil</th><th class="num">Prix local</th><th>Statut</th><th></th></tr></thead>
        <tbody>${stocks.map(s=>`<tr>
          <td style="font-weight:600">${s.formule_nom}</td>
          <td class="num ${s.qte_disponible<=s.seuil_critique?'bad':''}">
            ${GP_ROLE==='admin'?
              `<input type="number" value="${s.qte_disponible}" min="0" step="0.1" style="width:80px;text-align:right;font-size:11px;padding:2px 4px;font-weight:700"
                onchange="mettreAJourStockPDV('${s.id}','${(s.pdv_nom||'').replace(/'/g,'')}','${(s.formule_nom||'').replace(/'/g,'')}',this.value)"
                title="Modifier la valeur — écrase l'ancienne">`
              :`<span style="font-weight:700">${fmt(s.qte_disponible)} kg</span>`}
            ${(()=>{
              const ps = poidsSacParFormule[s.formule_nom];
              if(ps && ps>0){
                const nb = Math.round(s.qte_disponible/ps*10)/10; // 1 décimale
                return `<div style="color:var(--textm);font-size:9px;margin-top:2px">≈ ${nb} sacs (${ps}kg)</div>`;
              }
              // Pas encore de prod pour cette formule → afficher les 2 (fallback)
              return `<div style="color:var(--textm);font-size:9px;margin-top:2px">≈${Math.round(s.qte_disponible/25)} sacs (25kg) · ${Math.round(s.qte_disponible/50)} sacs (50kg)</div>`;
            })()}
          </td>
          <td class="num" style="color:var(--textm)">${fmt(s.seuil_critique)} kg</td>
          <td class="num">
            ${GP_ROLE==='admin'?
              `<input type="number" value="${s.prix_vente_local||0}" style="width:80px;text-align:right;font-size:10px;padding:2px 4px"
                onchange="mettreAJourPrixLocal('${s.id}',this.value)">`
              :`${fmt(s.prix_vente_local||0)} F`}
          </td>
          <td><span class="badge ${s.qte_disponible<=0?'bdg-r':s.qte_disponible<=s.seuil_critique?'bdg-gold':'bdg-g'}" style="font-size:9px">
            ${s.qte_disponible<=0?'❌ Épuisé':s.qte_disponible<=s.seuil_critique?'⚠ Critique':'✅ OK'}
          </span></td>
          <td>
            <button onclick="ouvrirTracabilite('${(s.pdv_nom||'').replace(/'/g,'')}','${(s.formule_nom||'').replace(/'/g,'')}')"
              title="Traçabilité : d'où vient ce stock ?"
              style="background:none;border:none;cursor:pointer;font-size:14px;opacity:.7">🔎</button>
            ${GP_ROLE==='admin'?
              `<button onclick="supprimerStockPDV('${s.id}','${(s.formule_nom||'').replace(/'/g,'')}','${(s.pdv_nom||'').replace(/'/g,'')}')"
                title="Supprimer cette ligne"
                style="background:none;border:none;cursor:pointer;font-size:14px;opacity:.6">🗑</button>`
              :''}
          </td>
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
  const{data:l}=await SB.from('gp_livraisons_pdv').select('*').eq('id',id).maybeSingle();
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

// ── RATTRAPAGE STOCK des livraisons (déduction source non appliquée) ──
async function _appliquerStockLivraison(l){
  if(l.type_produit==='formule' || !l.type_produit){
    const kg=Number(l.qte_envoyee||0)*Number(l.poids_sac||1);
    const ok=await ajusterStockPDV(l.pdv_source_nom, l.formule_nom, -kg);
    if(!ok) throw new Error('Ajustement stock source échoué');
  } else if(l.type_produit==='mp' && l.ingredient_id){
    const ref='Livraison '+String(l.id).slice(0,8)+' → '+(l.pdv_dest_nom||'');
    const{data:deja}=await SB.from('gp_stock_mp').select('id').eq('admin_id',l.admin_id).eq('ref',ref).limit(1);
    if(deja && deja.length) return; // déjà décrémenté (idempotent)
    const{error}=await SB.from('gp_stock_mp').insert({
      admin_id:l.admin_id, saisi_par:l.envoye_par, type:'sortie_distribution', date:l.date_livraison,
      ingredient_id:l.ingredient_id, ingredient_nom:l.formule_nom, quantite:l.qte_envoyee, prix_unit:l.prix_gros_unitaire, ref
    });
    if(error) throw error;
  }
}
let _syncStockLivEnCours=false;
async function synchroniserStockLivraisons(){
  if(_syncStockLivEnCours) return;
  if(typeof navigator!=='undefined' && navigator.onLine===false) return;
  if(typeof GP_ADMIN_ID==='undefined' || !GP_ADMIN_ID) return;
  _syncStockLivEnCours=true;
  try{
    const{data:ls}=await SB.from('gp_livraisons_pdv').select('*')
      .eq('admin_id',GP_ADMIN_ID).eq('stock_applique',false).order('date_livraison',{ascending:true}).limit(100);
    if(!ls || !ls.length) return;
    let n=0;
    for(const l of ls){
      const{data:claim}=await SB.from('gp_livraisons_pdv').update({stock_applique:true}).eq('id',l.id).eq('stock_applique',false).select('id');
      if(!claim || !claim.length) continue;
      try{ await _appliquerStockLivraison(l); n++; }
      catch(e){ try{ await SB.from('gp_livraisons_pdv').update({stock_applique:false}).eq('id',l.id); }catch(_){} }
    }
    if(n>0 && typeof notify==='function') notify(`🔄 ${n} livraison(s) synchronisée(s) — stock à jour`,'gold');
    if(n>0 && typeof renderDistribution==='function'){ try{ renderDistribution(); }catch(_){} }
  }catch(e){}
  finally{ _syncStockLivEnCours=false; }
}
