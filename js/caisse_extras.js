// ══════════════════════════════════════════════════
// PROVENDA — CAISSE EXTRAS
// Options 1/2/3 : dépense→caisse auto, modif solde initial, filtres PDV
// ══════════════════════════════════════════════════

// ── HELPER : caisses accessibles selon rôle/PDV ─────
// Admin/gérant : voit toutes les caisses actives.
// Autres rôles avec GP_POINT_VENTE : caisses de son PDV + caisses siège (point_vente null).
async function caissesAccessibles(){
  const{data}=await SB.from('gp_caisses').select('*')
    .eq('admin_id',GP_ADMIN_ID).eq('actif',true).order('type').order('nom');
  const C = data||[];
  if(GP_ROLE === 'admin' || GP_EST_GERANT) return C;
  if(!GP_POINT_VENTE) return C; // pas de scope → tout (fallback safe)
  return C.filter(c => !c.point_vente || c.point_vente === GP_POINT_VENTE);
}

// Remplir un <select> avec les caisses accessibles
async function remplirSelectCaisses(selectId, optionVide){
  const sel = document.getElementById(selectId);
  if(!sel) return;
  const C = await caissesAccessibles();
  // Garder la sélection courante si elle existe encore
  const curId = sel.value;
  // Charger les soldes calculés pour affichage
  const soldes = await calcSoldesCaisses(C);
  sel.innerHTML =
    (optionVide ? `<option value="">${optionVide}</option>` : '') +
    C.map(c => `<option value="${c.id}" ${c.id===curId?'selected':''}>${c.type==='banque'?'🏦':'💵'} ${c.nom} (${fmt(soldes[c.id]||0)} F)</option>`).join('');
  // Si curId n'existe plus, prendre la 1ère
  if(curId && !C.some(c=>c.id===curId)) sel.value = C[0]?.id || '';
}

// ── PLAFOND DE CRÉDIT CLIENTS (config admin) ──
function loadCreditPlafond(){
  const a=document.getElementById('cfg_credit_actif');
  const m=document.getElementById('cfg_credit_montant');
  if(a) a.checked = !!(typeof GP_CONFIG!=='undefined' && GP_CONFIG && GP_CONFIG.credit_plafond_actif);
  if(m && typeof GP_CONFIG!=='undefined' && GP_CONFIG && GP_CONFIG.credit_plafond_montant) m.value = GP_CONFIG.credit_plafond_montant;
}
async function saveCreditPlafond(){
  const actif=document.getElementById('cfg_credit_actif')?.checked||false;
  const montant=+document.getElementById('cfg_credit_montant')?.value||0;
  const{error}=await SB.from('gp_config').upsert(
    {user_id:GP_ADMIN_ID, credit_plafond_actif:actif, credit_plafond_montant:montant},
    {onConflict:'user_id'});
  if(error){ notify('Erreur: '+error.message,'r'); return; }
  if(typeof GP_CONFIG!=='undefined' && GP_CONFIG){ GP_CONFIG.credit_plafond_actif=actif; GP_CONFIG.credit_plafond_montant=montant; }
  notify(`Plafond de crédit ${actif?'activé ('+fmt(montant)+' F)':'désactivé'} ✓`,'gold');
}

// Pré-sélectionne, dans un select de caisse, la caisse du PDV connecté (ou siège pour l'admin)
async function preselectCaissePDV(selectId){
  const sel=document.getElementById(selectId);
  if(!sel) return;
  try{
    let cq=SB.from('gp_caisses').select('id,point_vente').eq('admin_id',GP_ADMIN_ID).eq('type','physique').eq('actif',true);
    cq = GP_POINT_VENTE ? cq.eq('point_vente',GP_POINT_VENTE) : cq.is('point_vente',null);
    const{data}=await cq.limit(1);
    const id=data?.[0]?.id;
    if(id && [...sel.options].some(o=>o.value===id)) sel.value=id;
  }catch(e){}
}

// Calcule les soldes de toutes les caisses passées (même logique que renderCaisse)
async function calcSoldesCaisses(caisses){
  const ids = caisses.map(c=>c.id);
  if(!ids.length) return {};
  const{data:mvts}=await SB.from('gp_mouvements_caisse').select('*')
    .eq('admin_id',GP_ADMIN_ID).in('caisse_id', ids);
  const M = mvts||[];
  const soldes = {};
  caisses.forEach(c=>{soldes[c.id] = Number(c.solde_initial||0);});
  M.forEach(m=>{
    if(m.type==='entree' && soldes[m.caisse_id]!==undefined) soldes[m.caisse_id] += Number(m.montant||0);
    if(m.type==='sortie' && soldes[m.caisse_id]!==undefined) soldes[m.caisse_id] -= Number(m.montant||0);
    if(m.type==='ajustement' && soldes[m.caisse_id]!==undefined) soldes[m.caisse_id] += Number(m.montant||0);
    if(m.type==='transfert' && m.statut_transfert!=='refuse'){
      if(soldes[m.caisse_id]!==undefined) soldes[m.caisse_id] -= Number(m.montant||0);
      if(m.caisse_dest_id && soldes[m.caisse_dest_id]!==undefined) soldes[m.caisse_dest_id] += Number(m.montant||0);
    }
  });
  return soldes;
}

// ── OPTION 1 : DÉPENSE → SORTIE CAISSE AUTO ──────
// Toggle visuel quand on coche/décoche le checkbox
function onDepCaisseToggle(){
  const chk = document.getElementById('dep_sortir_caisse');
  const wrap = document.getElementById('dep-caisse-select-wrap');
  if(!chk || !wrap) return;
  wrap.style.display = chk.checked ? 'block' : 'none';
}

// Wrapper de saveDep : ajoute le mouvement caisse OU affiche le rappel manuel
// Override de saveDep — on conserve la fonction d'origine
if(typeof window._saveDepOriginal === 'undefined' && typeof saveDep === 'function'){
  window._saveDepOriginal = saveDep;
}

async function saveDep(){
  const desc = document.getElementById('dep_desc')?.value.trim();
  const montant = +document.getElementById('dep_montant')?.value || 0;
  const date = document.getElementById('dep_date')?.value;
  const err = document.getElementById('dep_err');
  if(!desc || !montant || !date){ err.textContent = 'Description, montant et date requis.'; if(typeof notify==='function') notify('⚠ Description, montant et date requis','r'); return; }
  const caisseSel = document.getElementById('dep_caisse_id')?.value || null;

  // 1. Insert dépense
  const{data:dep, error}=await SB.from('gp_depenses').insert({
    admin_id: GP_ADMIN_ID, saisi_par: GP_USER?.id, date,
    categorie: document.getElementById('dep_cat').value,
    description: desc, montant,
    beneficiaire: document.getElementById('dep_benef').value.trim() || null,
    point_vente: document.getElementById('dep_pv').value.trim() || null
  }).select().maybeSingle();
  if(error){ err.textContent = 'Erreur: '+error.message; return; }

  err.textContent = '';
  ['dep_desc','dep_montant','dep_benef','dep_pv'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});

  // 2. Débit caisse OBLIGATOIRE. Comme les ventes : si ça réussit → caisse_debitee=true.
  //    Si la connexion coupe → reste false → RATTRAPÉ auto au refresh (synchroniserCaisseDepenses).
  try{
    await _debiterCaisseDepense(dep, caisseSel);
    try{ await SB.from('gp_depenses').update({caisse_debitee:true}).eq('id',dep.id); }catch(_){}
    notify(`✓ Dépense · ${fmt(montant)} F sortis de la caisse`,'gold');
  }catch(e){
    try{ alert('⚠️ La caisse n\'a pas pu être débitée (connexion ?).\nLa dépense est enregistrée — elle sera débitée AUTOMATIQUEMENT au prochain rafraîchissement de l\'app.'); }catch(_){}
  }
  if(typeof renderDep === 'function') await renderDep();
}

// Crée le mouvement de SORTIE caisse d'une dépense (résout la caisse via son PDV).
// Réutilisé par saveDep ET par le rattrapage. LÈVE en cas d'erreur réseau.
async function _debiterCaisseDepense(dep, preferredCaisseId){
  let caisseId = preferredCaisseId || null;
  if(!caisseId){
    const pv = dep.point_vente || GP_POINT_VENTE || null;
    let cq = SB.from('gp_caisses').select('id').eq('admin_id',dep.admin_id).eq('type','physique');
    cq = pv ? cq.eq('point_vente',pv) : cq.is('point_vente',null);
    let{data:cc}=await cq.limit(1);
    if(!cc || !cc.length){ const r=await SB.from('gp_caisses').select('id').eq('admin_id',dep.admin_id).eq('type','physique').limit(1); cc=r.data; }
    caisseId = cc?.[0]?.id || null;
  }
  if(!caisseId) throw new Error('Aucune caisse disponible pour débiter la dépense');
  const{error}=await SB.from('gp_mouvements_caisse').insert({
    admin_id: dep.admin_id, caisse_id: caisseId,
    type: 'sortie', categorie: 'depense',
    montant: dep.montant, date_mouvement: dep.date,
    description: `Dépense : ${dep.description}`,
    enregistre_par: dep.saisi_par, enregistre_par_nom: GP_USER?.email?.split('@')[0]
  });
  if(error) throw error;
}

// ── RATTRAPAGE AUTO : débite la caisse des dépenses restées caisse_debitee=false ──
// Appelé à l'ouverture + au retour de connexion. Idempotent (claim atomique).
let _syncCaisseDepEnCours = false;
async function synchroniserCaisseDepenses(){
  if(_syncCaisseDepEnCours) return;
  if(typeof navigator!=='undefined' && navigator.onLine===false) return;
  if(typeof GP_ADMIN_ID==='undefined' || !GP_ADMIN_ID) return;
  _syncCaisseDepEnCours = true;
  try{
    const{data:deps}=await SB.from('gp_depenses').select('*')
      .eq('admin_id',GP_ADMIN_ID).eq('caisse_debitee',false).order('date',{ascending:true}).limit(100);
    if(!deps || !deps.length) return;
    let n=0;
    for(const d of deps){
      const{data:claim}=await SB.from('gp_depenses').update({caisse_debitee:true})
        .eq('id',d.id).eq('caisse_debitee',false).select('id');
      if(!claim || !claim.length) continue;
      try{ await _debiterCaisseDepense(d, null); n++; }
      catch(e){ try{ await SB.from('gp_depenses').update({caisse_debitee:false}).eq('id',d.id); }catch(_){} }
    }
    if(n>0 && typeof notify==='function') notify(`🔄 ${n} dépense(s) synchronisée(s) — caisse à jour`,'gold');
    if(n>0 && typeof renderCaisse==='function'){ try{ renderCaisse(); }catch(_){} }
  }catch(e){ /* silencieux : réessai au prochain refresh */ }
  finally{ _syncCaisseDepEnCours=false; }
}

// Overlay de rappel quand la secrétaire dit "j'ai déjà sorti le cash manuellement"
function afficherRappelSortieCash(montant, desc){
  const old = document.getElementById('rappel-sortie-cash');
  if(old) old.remove();
  const ov = document.createElement('div');
  ov.id = 'rappel-sortie-cash';
  ov.style.cssText = `
    position:fixed;inset:0;background:rgba(0,0,0,.85);backdrop-filter:blur(6px);
    z-index:99999;display:flex;align-items:center;justify-content:center;padding:16px`;
  ov.innerHTML = `
    <div style="background:#fff;border-radius:20px;padding:32px 26px;max-width:420px;width:100%;
      text-align:center;box-shadow:0 25px 70px rgba(0,0,0,.5);border-top:6px solid #F59E0B">
      <div style="font-size:56px;margin-bottom:6px">⚠</div>
      <div style="font-size:20px;font-weight:800;color:#0F172A;margin-bottom:8px">N'oublie pas de sortir le cash</div>
      <div style="font-size:14px;color:#64748B;margin-bottom:18px;line-height:1.5">
        Tu as enregistré une dépense de <b style="color:#F59E0B">${fmt(montant)} F</b>
        ${desc?`<br>(${desc.length>40?desc.slice(0,40)+'…':desc})`:''}
        <br><br>
        ⚠ Le cash n'a PAS été retiré automatiquement de la caisse.
        <br>Sors <b style="color:#0F172A">${fmt(montant)} F</b> physiquement OU enregistre une sortie manuelle.
      </div>
      <button onclick="document.getElementById('rappel-sortie-cash').remove()"
        style="background:linear-gradient(135deg,#F59E0B,#FBBF24);color:#1a1a1a;border:none;border-radius:14px;
        padding:16px 32px;font-size:16px;font-weight:800;cursor:pointer;width:100%;
        box-shadow:0 6px 18px rgba(245,158,11,.4)">
        ✓ J'ai bien noté
      </button>
    </div>`;
  document.body.appendChild(ov);
}

// ── OPTION 2 : MODIFIER SOLDE INITIAL (admin only) ──
async function ouvrirModifSoldeInit(caisseId){
  if(GP_ROLE !== 'admin' && !GP_EST_GERANT){ notify('Action réservée à l\'admin','r'); return; }
  const{data:c}=await SB.from('gp_caisses').select('*').eq('id',caisseId).maybeSingle();
  if(!c){ notify('Caisse introuvable','r'); return; }
  // Calculer solde actuel (entrées + sorties + ajustements + transferts entrants/sortants)
  const{data:mvts}=await SB.from('gp_mouvements_caisse').select('*')
    .eq('admin_id',GP_ADMIN_ID)
    .or(`caisse_id.eq.${caisseId},caisse_dest_id.eq.${caisseId}`);
  let soldeAct = Number(c.solde_initial||0);
  (mvts||[]).forEach(m=>{
    if(m.type==='entree' && m.caisse_id===caisseId) soldeAct += Number(m.montant||0);
    if(m.type==='sortie' && m.caisse_id===caisseId) soldeAct -= Number(m.montant||0);
    if(m.type==='ajustement' && m.caisse_id===caisseId) soldeAct += Number(m.montant||0);
    if(m.type==='transfert' && m.statut_transfert!=='refuse'){
      if(m.caisse_id===caisseId) soldeAct -= Number(m.montant||0);
      if(m.caisse_dest_id===caisseId) soldeAct += Number(m.montant||0);
    }
  });
  document.getElementById('msi-caisse-id').value = caisseId;
  document.getElementById('msi-caisse-nom').textContent = c.nom;
  document.getElementById('msi-solde-actuel').textContent = fmt(soldeAct) + ' F';
  document.getElementById('msi-solde-initial-actuel').textContent = fmt(c.solde_initial||0) + ' F';
  document.getElementById('msi-nouveau').value = '';
  document.getElementById('msi-motif').value = '';
  document.getElementById('msi-err').textContent = '';
  document.getElementById('modal-modif-solde-init').style.display = 'flex';
  // Désactiver le bouton tant que motif vide
  onMsiMotifChange();
}

function fermerModalModifSoldeInit(){
  document.getElementById('modal-modif-solde-init').style.display = 'none';
}

function onMsiMotifChange(){
  const motif = document.getElementById('msi-motif')?.value.trim() || '';
  const nouveau = document.getElementById('msi-nouveau')?.value;
  const btn = document.getElementById('msi-valider');
  if(!btn) return;
  const peutValider = motif.length >= 5 && nouveau !== '' && nouveau !== null;
  btn.disabled = !peutValider;
  btn.style.opacity = peutValider ? '1' : '.4';
  btn.style.cursor = peutValider ? 'pointer' : 'not-allowed';
}

// Met à jour le SOLDE COURANT d'une caisse pour qu'il corresponde au comptage
// physique (inventaire). On crée UN SEUL mouvement d'ajustement = écart entre
// le réel compté et le solde calculé actuel. Le solde initial n'est PAS modifié
// (sinon on compterait l'écart deux fois).
async function saveModifSoldeInit(){
  const caisseId = document.getElementById('msi-caisse-id').value;
  const nouveau = +document.getElementById('msi-nouveau').value;
  const motif = document.getElementById('msi-motif').value.trim();
  const err = document.getElementById('msi-err');
  if(!motif || motif.length < 5){ err.textContent = 'Motif obligatoire (5 caractères min)'; notify('⚠ Motif obligatoire','r'); return; }
  if(isNaN(nouveau)){ err.textContent = 'Entre le solde réel compté'; return; }

  const{data:c}=await SB.from('gp_caisses').select('solde_initial,nom').eq('id',caisseId).maybeSingle();
  if(!c){ err.textContent = 'Caisse introuvable'; return; }

  // Recalculer le solde réellement affiché (initial + tous les mouvements)
  const{data:mvts}=await SB.from('gp_mouvements_caisse')
    .select('type,montant,caisse_id,caisse_dest_id,statut_transfert')
    .eq('admin_id',GP_ADMIN_ID)
    .or(`caisse_id.eq.${caisseId},caisse_dest_id.eq.${caisseId}`);
  let soldeAct = Number(c.solde_initial||0);
  (mvts||[]).forEach(m=>{
    if(m.type==='entree' && m.caisse_id===caisseId) soldeAct += Number(m.montant||0);
    if(m.type==='sortie' && m.caisse_id===caisseId) soldeAct -= Number(m.montant||0);
    if(m.type==='ajustement' && m.caisse_id===caisseId) soldeAct += Number(m.montant||0);
    if(m.type==='transfert' && m.statut_transfert!=='refuse'){
      if(m.caisse_id===caisseId) soldeAct -= Number(m.montant||0);
      if(m.caisse_dest_id===caisseId) soldeAct += Number(m.montant||0);
    }
  });

  const diff = nouveau - soldeAct;
  if(diff===0){ fermerModalModifSoldeInit(); notify('Solde déjà à jour ✓','gold'); return; }

  // Un seul ajustement amène le solde affiché à la valeur comptée
  const{error}=await SB.from('gp_mouvements_caisse').insert({
    admin_id: GP_ADMIN_ID, caisse_id: caisseId,
    type: 'ajustement', categorie: 'inventaire',
    montant: diff,
    date_mouvement: today(),
    description: `Mise à jour par inventaire : ${fmt(soldeAct)} → ${fmt(nouveau)} F (écart ${diff>0?'+':''}${fmt(diff)}). Motif : ${motif}`,
    enregistre_par: GP_USER?.id,
    enregistre_par_nom: GP_USER?.email?.split('@')[0]
  });
  if(error){ err.textContent = 'Erreur: '+error.message; return; }

  fermerModalModifSoldeInit();
  notify(`✓ ${c.nom} mise à jour à ${fmt(nouveau)} F`,'gold');
  if(typeof renderCaisse === 'function') await renderCaisse();
}

// ── HOOK : pré-remplir le select caisse à l'ouverture des formulaires concernés ──
// Patche les fonctions existantes pour qu'elles peuplent les selects avant affichage
(function(){
  // Hook page dépenses : à l'ouverture, peupler le select caisse
  if(typeof PAGE_RENDERERS !== 'undefined' && PAGE_RENDERERS.depenses){
    const _origDep = PAGE_RENDERERS.depenses;
    PAGE_RENDERERS.depenses = async function(){
      const r = _origDep();
      if(r && typeof r.then==='function') await r;
      await remplirSelectCaisses('dep_caisse_id');
      await preselectCaissePDV('dep_caisse_id'); // caisse du PDV connecté par défaut
    };
  }
  // Hook page paiements MP idem
  if(typeof PAGE_RENDERERS !== 'undefined' && PAGE_RENDERERS.paiements_mp){
    const _origPmt = PAGE_RENDERERS.paiements_mp;
    PAGE_RENDERERS.paiements_mp = async function(){
      const r = _origPmt();
      if(r && typeof r.then==='function') await r;
      await remplirSelectCaisses('pmt-caisse', '— Caisse par défaut —');
    };
  }
})();

// Wrapper pour le paiement MP : ajoute le caisse_id sélectionné au mouvement
// Override saveModalPaiement pour utiliser la caisse choisie
if(typeof window._saveModalPaiementOrig === 'undefined' && typeof saveModalPaiement === 'function'){
  window._saveModalPaiementOrig = saveModalPaiement;
  // On ne remplace pas — on injecte une variable globale lue par la fonction existante.
  // En fait on patche directement après ce fichier chargé. Si la fonction n'existe pas encore,
  // tant pis : le default behavior actuel reste actif.
}
