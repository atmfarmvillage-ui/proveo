// ══════════════════════════════════════════════════
// PROVENDA — PRODUITS DE LA FERME
// Catalogue + stock réel. « On met 300 lapins en stock et au fur et à mesure
// qu'on vend, on voit le reste. »
//
// Bâti sur le modèle du véto, avec UNE différence qui change tout : un animal
// vivant sort du stock SANS être vendu. Il meurt, on l'offre, on le mange, il
// s'échappe. Si les sorties ne pouvaient être que des ventes, le stock ne
// collerait jamais à la réalité et plus personne n'y croirait au bout de deux
// mois. D'où les sorties à motif, et l'ajustement par comptage — le comptage
// fait foi, comme pour les matières premières.
//
// Un SEUL stock, celui de la ferme : les animaux sont à un endroit, même si on
// les vend depuis plusieurs comptoirs. Le point de vente de la VENTE reste
// enregistré, lui, par la vente.
// ══════════════════════════════════════════════════

let GP_FERME_CATALOGUE = [];
let GP_FERME_MOUVEMENTS = [];

const FERME_UNITES = ['unité', 'plateau', 'kg', 'douzaine', 'carton'];
const FERME_CATEGORIES = ['lapin', 'oeuf', 'volaille', 'porc', 'poisson', 'autre'];
// Ce que le motif fait au stock. Une entrée ajoute, une sortie retire.
const FERME_MOTIFS_SORTIE = [
  { cle: 'mortalite',    libelle: '💀 Mortalité' },
  { cle: 'consommation', libelle: '🍽️ Consommation interne' },
  { cle: 'cadeau',       libelle: '🎁 Don / cadeau' },
  { cle: 'perte',        libelle: '❓ Perte, vol, fuite' },
];
const FERME_MOTIFS_ENTREE = [
  { cle: 'naissance', libelle: '🐣 Naissance / sevrage' },
  { cle: 'achat',     libelle: '🛒 Achat' },
  { cle: 'retour',    libelle: '↩️ Retour client' },
  { cle: 'autre',     libelle: '📦 Autre entrée' },
];

function _fermeEsc(s){
  return String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function _fermeAdmin(){ return GP_ROLE === 'admin' || (typeof GP_EST_GERANT !== 'undefined' && GP_EST_GERANT); }

// ── Chargement ───────────────────────────────────────────────────────────────

async function loadFermeCatalogue(){
  try{
    const{data,error}=await SB.from('gp_produits_ferme').select('*')
      .eq('admin_id',GP_ADMIN_ID).order('nom');
    if(error) throw error;
    GP_FERME_CATALOGUE = data||[];
  }catch(e){ console.warn('produits ferme : catalogue indisponible', e); GP_FERME_CATALOGUE=[]; }
  return GP_FERME_CATALOGUE;
}

async function loadFermeMouvements(){
  try{
    const{data,error}=await SB.from('gp_stock_ferme').select('*')
      .eq('admin_id',GP_ADMIN_ID).order('date',{ascending:false}).limit(500);
    if(error) throw error;
    GP_FERME_MOUVEMENTS = data||[];
  }catch(e){ console.warn('produits ferme : stock indisponible', e); GP_FERME_MOUVEMENTS=[]; }
  return GP_FERME_MOUVEMENTS;
}

// Le solde n'est jamais stocké : il se recalcule depuis les mouvements. Un
// chiffre qu'on peut refaire à la main est un chiffre auquel on peut croire.
function fermeSolde(produitId, mouvements){
  const M = mouvements || GP_FERME_MOUVEMENTS;
  return (M||[]).filter(m => m.produit_id === produitId)
    .reduce((s,m)=> s + (m.type === 'entree' ? Number(m.qte||0) : -Number(m.qte||0)), 0);
}

function fermeProduit(id){ return (GP_FERME_CATALOGUE||[]).find(p=>p.id===id) || null; }

// ── Écriture ─────────────────────────────────────────────────────────────────

async function _fermeMouvement(produitId, type, qte, motif, opts){
  opts = opts || {};
  const p = fermeProduit(produitId);
  const ligne = {
    admin_id: GP_ADMIN_ID,
    produit_id: produitId,
    produit_nom: p ? p.nom : (opts.nom || null),
    type, motif,
    qte: Math.abs(Number(qte)||0),
    date: opts.date || (typeof today === 'function' ? today() : new Date().toISOString().slice(0,10)),
    vente_id: opts.vente_id || null,
    note: opts.note || null,
    saisi_par: (typeof GP_USER !== 'undefined' && GP_USER) ? GP_USER.id : null,
    saisi_par_nom: (typeof GP_USER !== 'undefined' && GP_USER && GP_USER.email)
      ? GP_USER.email.split('@')[0] : null,
  };
  // Une sortie de vente part souvent en rafale avec la vente elle-même : elle
  // hérite donc de la protection anti-doublon quand elle est disponible.
  if(opts.saisie && typeof idemInserer === 'function'){
    const r = await idemInserer('gp_stock_ferme', ligne, opts.saisie, 'id');
    return { data:r.data, error:r.error, doublon:r.doublon };
  }
  const r = await SB.from('gp_stock_ferme').insert(ligne).select('id').maybeSingle();
  return { data:r.data, error:r.error, doublon:false };
}

// ── Ce que la vente appelle ──────────────────────────────────────────────────

// Disponible par produit, pour remplir le menu de la vente.
async function fermeDispoPourVente(){
  await loadFermeCatalogue();
  await loadFermeMouvements();
  const dispo = {};
  (GP_FERME_CATALOGUE||[]).filter(p=>p.actif!==false).forEach(p=>{
    dispo[p.id] = { nom:p.nom, unite:p.unite||'unité', prix:Number(p.prix_vente||0), qte:fermeSolde(p.id) };
  });
  return dispo;
}

async function deduireStockFerme(produitId, qte, venteId){
  if(!produitId || !(Number(qte)>0)) return;
  try{ await _fermeMouvement(produitId, 'sortie', qte, 'vente', { vente_id:venteId }); }
  catch(e){ console.warn('produits ferme : sortie non enregistrée', e); }
}

// Une vente supprimée rend la marchandise : sans ça, le stock baisse pour une
// vente qui n'existe plus.
async function recrediterStockFerme(produitId, qte, venteId, nom){
  if(!produitId || !(Number(qte)>0)) return;
  try{ await _fermeMouvement(produitId, 'entree', qte, 'retour', { vente_id:venteId, nom, note:'Vente annulée' }); }
  catch(e){ console.warn('produits ferme : retour non enregistré', e); }
}

// ── Écran ────────────────────────────────────────────────────────────────────

async function renderProduitsFerme(){
  const zone = document.getElementById('ferme-content');
  if(!zone) return;
  await loadFermeCatalogue();
  await loadFermeMouvements();

  const actifs = (GP_FERME_CATALOGUE||[]).filter(p=>p.actif!==false);
  const lignes = actifs.map(p=>{
    const solde = fermeSolde(p.id);
    const coul = solde <= 0 ? 'var(--red)' : solde <= 5 ? 'var(--gold)' : 'var(--green)';
    return `<tr>
      <td>
        <div style="font-weight:700">${_fermeEsc(p.nom)}</div>
        <div style="font-size:10px;color:var(--textm)">${_fermeEsc(p.categorie||'—')} · ${_fermeEsc(p.unite||'unité')}${
          Number(p.prix_vente)>0 ? ' · '+fmt(p.prix_vente)+' F' : ''}</div>
      </td>
      <td class="num" style="color:${coul};font-weight:800;font-size:15px">${fmt(solde)}</td>
      <td style="white-space:nowrap">
        <button class="btn btn-g btn-sm" onclick="ouvrirEntreeFerme('${p.id}')" title="Ajouter au stock">➕</button>
        <button class="btn btn-out btn-sm" onclick="ouvrirSortieFerme('${p.id}')" title="Sortie sans vente (mortalité, don…)">➖</button>
        <button class="btn btn-out btn-sm" onclick="ouvrirComptageFerme('${p.id}')" title="Comptage réel">🔢</button>
        ${_fermeAdmin()?`<button class="btn btn-red btn-sm" onclick="supprimerProduitFerme('${p.id}','${_fermeEsc(p.nom)}')">✕</button>`:''}
      </td>
    </tr>`;
  }).join('');

  const hist = (GP_FERME_MOUVEMENTS||[]).slice(0,25).map(m=>{
    const signe = m.type==='entree' ? '+' : '−';
    const coul  = m.type==='entree' ? 'var(--green)' : 'var(--red)';
    const lib = [].concat(FERME_MOTIFS_ENTREE, FERME_MOTIFS_SORTIE)
      .find(x=>x.cle===m.motif);
    const motif = m.motif==='vente' ? '🧾 Vente'
      : m.motif==='comptage' ? '🔢 Comptage'
      : (lib ? lib.libelle : (m.motif||'—'));
    return `<div style="display:flex;justify-content:space-between;gap:8px;padding:6px 0;border-bottom:1px solid var(--border);font-size:11.5px">
      <div>
        <b>${_fermeEsc(m.produit_nom||'—')}</b> · ${motif}
        <div style="font-size:10px;color:var(--textm)">${_fermeEsc(m.date||'')}${m.note?' · '+_fermeEsc(m.note):''}${m.saisi_par_nom?' · '+_fermeEsc(m.saisi_par_nom):''}</div>
      </div>
      <div style="color:${coul};font-weight:700;white-space:nowrap">${signe}${fmt(m.qte)}</div>
    </div>`;
  }).join('');

  zone.innerHTML = `
    <div class="card">
      <div class="card-title">
        <div class="ct-left"><span>🐔 Stock de la ferme</span></div>
        ${_fermeAdmin()?`<button class="btn btn-g btn-sm" onclick="ouvrirNouveauProduitFerme()">➕ Nouveau produit</button>`:''}
      </div>
      <div style="font-size:11px;color:var(--textm);margin-bottom:10px">
        Le reste se calcule à chaque fois depuis les entrées et les sorties — rien n'est stocké d'avance.
        Un animal qui meurt, qu'on offre ou qu'on mange se sort avec ➖, sinon le compte ne tombera jamais juste.
      </div>
      ${actifs.length ? `<table class="tbl"><thead><tr>
          <th>Produit</th><th class="num">Reste</th><th></th>
        </tr></thead><tbody>${lignes}</tbody></table>`
        : '<div style="color:var(--textm);font-size:12px">Aucun produit. Crée-en un avec ➕ Nouveau produit.</div>'}
    </div>
    <div class="card" style="margin-top:14px">
      <div class="card-title"><div class="ct-left"><span>📜 Derniers mouvements</span></div></div>
      ${hist || '<div style="color:var(--textm);font-size:12px">Aucun mouvement.</div>'}
    </div>`;
}

// ── Catalogue ────────────────────────────────────────────────────────────────

function ouvrirNouveauProduitFerme(){
  const m = document.getElementById('modal-ferme');
  if(!m){ notify('Recharge la page (Ctrl+Shift+R)','r'); return; }
  document.getElementById('ferme-modal-titre').textContent = '➕ Nouveau produit de la ferme';
  document.getElementById('ferme-modal-corps').innerHTML = `
    <div class="fr"><label>Nom *</label>
      <input type="text" id="fp_nom" placeholder="Lapin vivant, Œuf, Poulet Goliath…"></div>
    <div class="fg2">
      <div class="fr"><label>Catégorie</label><select id="fp_cat">
        ${FERME_CATEGORIES.map(c=>`<option value="${c}">${c}</option>`).join('')}</select></div>
      <div class="fr"><label>Unité</label><select id="fp_unite">
        ${FERME_UNITES.map(u=>`<option value="${u}">${u}</option>`).join('')}</select></div>
    </div>
    <div class="fr"><label>Prix de vente (F / unité)</label>
      <input type="number" id="fp_prix" min="0" step="25" value="0"></div>`;
  document.getElementById('ferme-modal-ok').setAttribute('onclick','saveProduitFerme()');
  document.getElementById('ferme-modal-err').textContent = '';
  m.style.display = 'flex';
}

async function saveProduitFerme(){
  const err = document.getElementById('ferme-modal-err');
  const nom = (document.getElementById('fp_nom')?.value||'').trim();
  if(!nom){ err.textContent = 'Donne un nom au produit.'; return; }
  const {error} = await SB.from('gp_produits_ferme').insert({
    admin_id: GP_ADMIN_ID, nom,
    categorie: document.getElementById('fp_cat')?.value || 'autre',
    unite: document.getElementById('fp_unite')?.value || 'unité',
    prix_vente: +document.getElementById('fp_prix')?.value || 0,
    actif: true
  });
  if(error){
    err.textContent = /gp_produits_ferme/.test(error.message||'')
      ? "La table des produits ferme n'existe pas encore — lance la migration SQL."
      : 'Erreur : '+error.message;
    return;
  }
  fermerModalFerme();
  notify('Produit créé ✓','gold');
  renderProduitsFerme();
}

async function supprimerProduitFerme(id, nom){
  if(!_fermeAdmin()){ notify('Réservé à l\'administrateur','r'); return; }
  const solde = fermeSolde(id);
  if(solde !== 0 && !confirm(`« ${nom} » a encore ${fmt(solde)} en stock.\nLe retirer quand même ? L'historique des mouvements est conservé.`)) return;
  if(solde === 0 && !confirm(`Retirer « ${nom} » du catalogue ?`)) return;
  // On désactive au lieu de supprimer : les mouvements passés gardent un sens.
  const {error} = await SB.from('gp_produits_ferme').update({actif:false})
    .eq('id',id).eq('admin_id',GP_ADMIN_ID);
  if(error){ notify('Erreur : '+error.message,'r'); return; }
  notify('Produit retiré du catalogue','gold');
  renderProduitsFerme();
}

// ── Entrée, sortie, comptage ─────────────────────────────────────────────────

function _fermeOuvrirModal(titre, corps, action){
  const m = document.getElementById('modal-ferme');
  if(!m){ notify('Recharge la page (Ctrl+Shift+R)','r'); return; }
  document.getElementById('ferme-modal-titre').textContent = titre;
  document.getElementById('ferme-modal-corps').innerHTML = corps;
  document.getElementById('ferme-modal-ok').setAttribute('onclick', action);
  document.getElementById('ferme-modal-err').textContent = '';
  m.style.display = 'flex';
}

function fermerModalFerme(){
  const m = document.getElementById('modal-ferme');
  if(m) m.style.display = 'none';
}

function ouvrirEntreeFerme(id){
  const p = fermeProduit(id); if(!p) return;
  _fermeOuvrirModal(`➕ Entrée — ${p.nom}`, `
    <input type="hidden" id="fm_id" value="${id}">
    <div style="font-size:11px;color:var(--textm);margin-bottom:10px">
      Reste actuel : <b>${fmt(fermeSolde(id))} ${_fermeEsc(p.unite||'unité')}</b>
    </div>
    <div class="fg2">
      <div class="fr"><label>Quantité *</label><input type="number" id="fm_qte" min="0" step="1" placeholder="300"></div>
      <div class="fr"><label>Date</label><input type="date" id="fm_date" value="${typeof today==='function'?today():''}"></div>
    </div>
    <div class="fr"><label>D'où vient-elle ?</label><select id="fm_motif">
      ${FERME_MOTIFS_ENTREE.map(x=>`<option value="${x.cle}">${x.libelle}</option>`).join('')}</select></div>
    <div class="fr"><label>Note</label><input type="text" id="fm_note" placeholder="Bande sevrée du 12/09…"></div>`,
    'saveEntreeFerme()');
}

function ouvrirSortieFerme(id){
  const p = fermeProduit(id); if(!p) return;
  _fermeOuvrirModal(`➖ Sortie sans vente — ${p.nom}`, `
    <input type="hidden" id="fm_id" value="${id}">
    <div style="font-size:11px;color:var(--textm);margin-bottom:10px">
      Reste actuel : <b>${fmt(fermeSolde(id))} ${_fermeEsc(p.unite||'unité')}</b>.
      Les ventes se sortent toutes seules — ici on déclare ce qui part <b>sans</b> être vendu.
    </div>
    <div class="fg2">
      <div class="fr"><label>Quantité *</label><input type="number" id="fm_qte" min="0" step="1"></div>
      <div class="fr"><label>Date</label><input type="date" id="fm_date" value="${typeof today==='function'?today():''}"></div>
    </div>
    <div class="fr"><label>Motif *</label><select id="fm_motif">
      ${FERME_MOTIFS_SORTIE.map(x=>`<option value="${x.cle}">${x.libelle}</option>`).join('')}</select></div>
    <div class="fr"><label>Note</label><input type="text" id="fm_note" placeholder="Détail utile…"></div>`,
    'saveSortieFerme()');
}

function ouvrirComptageFerme(id){
  const p = fermeProduit(id); if(!p) return;
  const solde = fermeSolde(id);
  _fermeOuvrirModal(`🔢 Comptage — ${p.nom}`, `
    <input type="hidden" id="fm_id" value="${id}">
    <input type="hidden" id="fm_avant" value="${solde}">
    <div style="font-size:11px;color:var(--textm);margin-bottom:10px">
      L'app annonce <b>${fmt(solde)} ${_fermeEsc(p.unite||'unité')}</b>.
      Saisis ce que tu as réellement compté : c'est le comptage qui fait foi, l'écart est enregistré.
    </div>
    <div class="fg2">
      <div class="fr"><label>Compté sur place *</label><input type="number" id="fm_qte" min="0" step="1"></div>
      <div class="fr"><label>Date</label><input type="date" id="fm_date" value="${typeof today==='function'?today():''}"></div>
    </div>
    <div class="fr"><label>Note</label><input type="text" id="fm_note" placeholder="Qui a compté, dans quelles conditions…"></div>`,
    'saveComptageFerme()');
}

function _fermeLire(){
  const id = document.getElementById('fm_id')?.value;
  const qte = +(document.getElementById('fm_qte')?.value);
  const date = document.getElementById('fm_date')?.value || null;
  const motif = document.getElementById('fm_motif')?.value || null;
  const note = (document.getElementById('fm_note')?.value||'').trim() || null;
  return { id, qte, date, motif, note };
}

function _fermeErreur(e){
  const err = document.getElementById('ferme-modal-err');
  if(!err) return;
  err.textContent = /gp_stock_ferme/.test((e&&e.message)||'')
    ? "La table du stock ferme n'existe pas encore — lance la migration SQL."
    : 'Erreur : '+((e&&e.message)||e);
}

async function saveEntreeFerme(){
  const v = _fermeLire();
  const err = document.getElementById('ferme-modal-err');
  if(!(v.qte > 0)){ err.textContent = 'Entre une quantité.'; return; }
  const r = await _fermeMouvement(v.id, 'entree', v.qte, v.motif||'autre', {date:v.date, note:v.note, saisie:'ferme_mvt'});
  if(r.doublon){ fermerModalFerme(); notify('Cette entrée est déjà enregistrée ✓','gold'); if(typeof idemTerminee==='function') idemTerminee('ferme_mvt'); renderProduitsFerme(); return; }
  if(r.error){ _fermeErreur(r.error); return; }
  if(typeof idemTerminee==='function') idemTerminee('ferme_mvt');
  fermerModalFerme();
  notify('+'+fmt(v.qte)+' en stock ✓','gold');
  renderProduitsFerme();
}

async function saveSortieFerme(){
  const v = _fermeLire();
  const err = document.getElementById('ferme-modal-err');
  if(!(v.qte > 0)){ err.textContent = 'Entre une quantité.'; return; }
  if(!v.motif){ err.textContent = 'Choisis un motif : sans lui, personne ne saura où sont passées les bêtes.'; return; }
  const r = await _fermeMouvement(v.id, 'sortie', v.qte, v.motif, {date:v.date, note:v.note, saisie:'ferme_mvt'});
  if(r.doublon){ fermerModalFerme(); notify('Cette sortie est déjà enregistrée ✓','gold'); if(typeof idemTerminee==='function') idemTerminee('ferme_mvt'); renderProduitsFerme(); return; }
  if(r.error){ _fermeErreur(r.error); return; }
  if(typeof idemTerminee==='function') idemTerminee('ferme_mvt');
  fermerModalFerme();
  notify('−'+fmt(v.qte)+' sorti du stock','gold');
  renderProduitsFerme();
}

async function saveComptageFerme(){
  const v = _fermeLire();
  const err = document.getElementById('ferme-modal-err');
  const compte = +(document.getElementById('fm_qte')?.value);
  if(!(compte >= 0) || document.getElementById('fm_qte')?.value === ''){ err.textContent = 'Entre ce que tu as compté.'; return; }
  const avant = +(document.getElementById('fm_avant')?.value) || 0;
  const ecart = compte - avant;
  if(ecart === 0){ fermerModalFerme(); notify('Le compte tombe juste ✓','g'); return; }
  // L'écart devient un mouvement visible : on ne réécrit jamais le passé.
  const r = await _fermeMouvement(v.id, ecart > 0 ? 'entree' : 'sortie', Math.abs(ecart), 'comptage',
    {date:v.date, note:(v.note? v.note+' · ' : '')+'Comptage : '+fmt(compte)+' au lieu de '+fmt(avant), saisie:'ferme_mvt'});
  if(r.doublon){ fermerModalFerme(); notify('Ce comptage est déjà enregistré ✓','gold'); if(typeof idemTerminee==='function') idemTerminee('ferme_mvt'); renderProduitsFerme(); return; }
  if(r.error){ _fermeErreur(r.error); return; }
  if(typeof idemTerminee==='function') idemTerminee('ferme_mvt');
  fermerModalFerme();
  notify(ecart>0 ? 'Comptage enregistré : +'+fmt(ecart) : 'Comptage enregistré : '+fmt(ecart),'gold');
  renderProduitsFerme();
}

if (typeof window !== 'undefined') {
  window.renderProduitsFerme = renderProduitsFerme;
  window.loadFermeCatalogue = loadFermeCatalogue;
  window.loadFermeMouvements = loadFermeMouvements;
  window.fermeSolde = fermeSolde;
  window.fermeDispoPourVente = fermeDispoPourVente;
  window.deduireStockFerme = deduireStockFerme;
  window.recrediterStockFerme = recrediterStockFerme;
  window.ouvrirNouveauProduitFerme = ouvrirNouveauProduitFerme;
  window.saveProduitFerme = saveProduitFerme;
  window.supprimerProduitFerme = supprimerProduitFerme;
  window.ouvrirEntreeFerme = ouvrirEntreeFerme;
  window.ouvrirSortieFerme = ouvrirSortieFerme;
  window.ouvrirComptageFerme = ouvrirComptageFerme;
  window.saveEntreeFerme = saveEntreeFerme;
  window.saveSortieFerme = saveSortieFerme;
  window.saveComptageFerme = saveComptageFerme;
  window.fermerModalFerme = fermerModalFerme;
}

// ── Le menu du formulaire de vente ───────────────────────────────────────────
// Le disponible s'affiche à côté du nom : on ne vend pas à l'aveugle, et si le
// stock manque on le voit AVANT d'ajouter la ligne.
async function remplirSelectFerme(){
  const sel = document.getElementById('vt_ferme_produit');
  if(!sel) return;
  const dispo = await fermeDispoPourVente();
  const ids = Object.keys(dispo);
  const garde = sel.value;
  sel.innerHTML = '<option value="">— Hors catalogue (pas de stock) —</option>'
    + ids.map(id => {
        const d = dispo[id];
        const etat = d.qte <= 0 ? ' · ÉPUISÉ' : ' · reste ' + fmt(d.qte) + ' ' + d.unite;
        return `<option value="${id}" data-nom="${_fermeEsc(d.nom)}" data-stock="${d.qte}" data-prix="${d.prix}">`
          + `${_fermeEsc(d.nom)}${etat}</option>`;
      }).join('');
  if(garde && dispo[garde]) sel.value = garde;
}

// Choisir un produit remplit le prix : c'est celui du catalogue, modifiable.
function onFermeProduitChange(){
  const sel = document.getElementById('vt_ferme_produit');
  const opt = sel && sel.options[sel.selectedIndex];
  if(!opt || !sel.value) return;
  const prix = Number(opt.dataset.prix || 0);
  const champ = document.getElementById('vt_prix');
  if(prix > 0 && champ && !champ.value) champ.value = prix;
  if(typeof calcVente === 'function') calcVente();
}

if (typeof window !== 'undefined') {
  window.remplirSelectFerme = remplirSelectFerme;
  window.onFermeProduitChange = onFermeProduitChange;
}
