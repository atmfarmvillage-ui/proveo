// ═══════════════════════════════════════════════════════════════════════════
// PROVENDA — AJUSTEMENT DE STOCK, À TOUT MOMENT
//
// Avant, la seule façon de corriger un stock était l'inventaire MENSUEL : on
// saisissait, ça attendait la validation d'un autre admin, et pendant ce temps
// le stock affiché restait faux — tout le monde le savait, personne ne pouvait
// rien y faire. Le modèle d'AGRI-X est l'inverse et c'est le bon : LE COMPTAGE
// FAIT FOI. On enregistre, le stock bouge tout de suite, et les autres admins
// sont PRÉVENUS. La validation vient après : elle acte, elle ne retarde pas.
//
// Un manque descend le stock même sous zéro. Un stock négatif n'est pas une
// erreur d'affichage : il dit que les sorties enregistrées dépassent ce qui
// existe réellement. Le ramener à zéro effacerait précisément l'information
// qu'on cherche — c'est le même principe que l'étiquette qui refuse de mentir.
//
// Écriture en DEUX temps, volontairement :
//   · `gp_stock_mp`          : le mouvement, qui fait le stock (comme un achat) ;
//   · `gp_ajustements_stock` : la trace — qui, quand, pourquoi.
// Le mouvement seul ne dirait pas POURQUOI ; la trace seule ne bougerait rien.
//
// PERSONNE N'A À VALIDER (décision du 23/09). Les autres administrateurs sont
// PRÉVENUS, c'est tout. La seule confirmation demandée l'est à celui qui saisit,
// au moment où il fait BAISSER un stock : on ne descend pas un stock par
// distraction. L'annulation reste possible, par un mouvement inverse.
// ═══════════════════════════════════════════════════════════════════════════

const AJ_MOTIFS = [
  ['comptage',  'Comptage physique — écart constaté'],
  ['casse',     'Casse ou sac éventré'],
  ['perte',     'Perte : humidité, rongeurs, moisissure'],
  ['vol',       'Vol suspecté'],
  ['saisie',    'Erreur de saisie à corriger'],
  ['preleve',   'Prélèvement interne non enregistré'],
];
// Un manque fait perdre de la valeur : on demande confirmation à celui qui saisit.
// Un excédent, non — il n'y a rien à perdre à en trouver.

function ajEsc(s){ return String(s==null?'':s).replace(/[&<>"]/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }
function ajPeut(){ return GP_ROLE==='admin' || GP_EST_GERANT; }

// Stock théorique d'une MP, à partir des mouvements déjà chargés par l'écran stock.
// On relit la base si on ne les a pas : un ajustement se décide sur le stock du
// moment, pas sur celui qu'un écran affichait il y a une heure.
async function ajStockActuel(nom){
  let mvts = window._stockNiveaux;
  if(!Array.isArray(mvts) && typeof _fetchAllStockMp === 'function') mvts = await _fetchAllStockMp();
  const niveaux = (typeof calcNiveaux==='function') ? calcNiveaux(mvts||[]) : {};
  return Number(niveaux[nom] || 0);
}

// ── LA FENÊTRE ────────────────────────────────────────────────────────────
async function ouvrirAjustement(id){
  if(!ajPeut()){ notify('Seul un administrateur ou un gérant peut ajuster le stock','r'); return; }
  const ing = (GP_INGREDIENTS||[]).find(i=>i.id===id);
  if(!ing){ notify('Matière première introuvable','r'); return; }
  const m = document.getElementById('modal-ajust');
  if(!m){ notify('Recharge la page (Ctrl+Shift+R)','r'); return; }
  // La fenêtre garde la position de défilement du précédent affichage : sans ce
  // retour en haut, le titre et le stock théorique restent hors de l'écran.
  m.scrollTop = 0;
  const actuel = await ajStockActuel(ing.nom);
  document.getElementById('aj-id').value = ing.id;
  document.getElementById('aj-nom').textContent = ing.nom;
  document.getElementById('aj-theorique').textContent = fmt(Math.round(actuel*100)/100);
  document.getElementById('aj-unite').textContent = ing.unite || 'kg';
  document.getElementById('aj-compte').value = '';
  document.getElementById('aj-note').value = '';
  document.getElementById('aj-motif').value = 'comptage';
  document.getElementById('aj-ecart').innerHTML = '';
  m.dataset.theorique = String(actuel);
  m.style.display = 'flex';
  setTimeout(()=>document.getElementById('aj-compte').focus(), 80);
}
function fermerAjustement(){ const m=document.getElementById('modal-ajust'); if(m) m.style.display='none'; }

// L'écart s'affiche AVANT d'enregistrer, avec ce qu'il implique : personne ne
// doit découvrir après coup qu'il vient de faire passer un stock sous zéro.
function ajCalculerEcart(){
  const m = document.getElementById('modal-ajust'); if(!m) return;
  const theo = Number(m.dataset.theorique||0);
  const v = document.getElementById('aj-compte').value;
  const el = document.getElementById('aj-ecart');
  if(v === '' || isNaN(Number(v))){ el.innerHTML=''; return; }
  const ecart = Number(v) - theo;
  if(Math.abs(ecart) < 0.001){ el.innerHTML = '<span style="color:var(--textm)">Aucun écart — rien ne sera enregistré.</span>'; return; }
  const manque = ecart < 0;
  const pct = theo > 0 ? Math.abs(ecart)/theo : 1;
  el.innerHTML = `<span style="color:${manque?'var(--red)':'var(--green)'};font-weight:800">`
    + `${manque?'Manque':'Excédent'} de ${fmt(Math.abs(Math.round(ecart*100)/100))}</span>`
    + (theo>0 ? ` <span style="color:var(--textm)">(${Math.round(pct*100)} % du stock)</span>` : '')
    + (manque ? '<div style="color:var(--gold);font-size:11px;margin-top:3px">Le stock va baisser tout de suite. L\'équipe sera prévenue.</div>' : '');
}

// ── ENREGISTREMENT ────────────────────────────────────────────────────────
async function enregistrerAjustement(){
  if(!ajPeut()){ notify('Action réservée aux administrateurs','r'); return; }
  const m = document.getElementById('modal-ajust');
  const id = document.getElementById('aj-id').value;
  const ing = (GP_INGREDIENTS||[]).find(i=>i.id===id);
  if(!ing){ notify('Matière première introuvable','r'); return; }
  const theo = Number(m.dataset.theorique||0);
  const compte = Number(document.getElementById('aj-compte').value);
  const motif = document.getElementById('aj-motif').value;
  const note = (document.getElementById('aj-note').value||'').trim();
  if(document.getElementById('aj-compte').value==='' || isNaN(compte)){ notify('Saisis le stock compté','r'); return; }
  const ecart = Math.round((compte - theo)*1000)/1000;
  if(Math.abs(ecart) < 0.001){ notify('Aucun écart — rien à enregistrer','gold'); fermerAjustement(); return; }
  // Un gros écart sans explication écrite ne laisse aucune chance de comprendre
  // dans six mois. Le seuil est volontairement bas : c'est une ligne à écrire.
  const pct = theo > 0 ? Math.abs(ecart)/theo : 1;
  if(pct > 0.20 && !note){ notify('Écart de plus de 20 % : explique-le dans la note','r',6000); return; }

  const manque = ecart < 0;
  // La seule confirmation du circuit : faire baisser un stock n'est jamais anodin.
  if(manque && !confirm(`${ing.nom}\n\nLe stock va passer de ${fmt(theo)} à ${fmt(compte)}, soit un manque de ${fmt(Math.abs(ecart))}.\nLe changement est immédiat et l'équipe sera prévenue.\n\nConfirmer ?`)) return;
  const ref = 'Ajustement ' + today() + ' — ' + motif;
  // ⚠️ `type` porte une contrainte CHECK : 'entree' ajoute, tout le reste retranche
  // (voir calcNiveaux). Un excédent est donc une 'entree', un manque un 'ajustement'.
  const mouvement = {
    admin_id: GP_ADMIN_ID, saisi_par: GP_USER.id,
    type: ecart > 0 ? 'entree' : 'ajustement',
    date: today(),
    ingredient_id: ing.id,          // rattachement par ID : le nom seul scinde le stock
    ingredient_nom: ing.nom,
    quantite: Math.abs(ecart),
    prix_unit: ing.prix_actuel || 0,
    ref
  };
  const {data:mv, error:eMv} = await SB.from('gp_stock_mp').insert(mouvement).select('id').maybeSingle();
  if(eMv){ notify('Stock non modifié : '+(eMv.message||'erreur'),'r',6000); return; }

  const trace = {
    admin_id: GP_ADMIN_ID, ingredient_id: ing.id, ingredient_nom: ing.nom,
    ancienne_val: theo, nouvelle_val: compte, ecart,
    motif, note: note||null,
    mouvement_id: mv?.id || null,
    statut: 'applique',                 // personne n'a à valider : la trace suffit
    saisi_par: GP_USER.id,
    saisi_par_nom: (GP_USER.email||'').split('@')[0] || '—'
  };
  const {error:eTr} = await SB.from('gp_ajustements_stock').insert(trace);
  // La trace a échoué mais le stock a bougé : on le DIT, sinon l'écart devient
  // invisible et inexplicable. Le mouvement, lui, reste : il est juste.
  if(eTr) notify('Stock ajusté, mais la trace n\'a pas été enregistrée : '+(eTr.message||''),'r',8000);

  fermerAjustement();
  notify(`${ing.nom} : ${fmt(theo)} → ${fmt(compte)} (${ecart>0?'+':''}${fmt(ecart)})`, ecart>0?'gold':'r', 5000);

  // Les autres admins sont prévenus tout de suite. C'est ce qui remplace le
  // blocage : on n'attend personne, mais personne n'est mis devant le fait accompli.
  if(typeof pushSendToTeam === 'function'){
    const qui = trace.saisi_par_nom;
    pushSendToTeam(
      (manque?'📉 Manque en stock':'📈 Excédent en stock'),
      `${qui} : ${ing.nom} ${fmt(theo)} → ${fmt(compte)} (${ecart>0?'+':''}${fmt(ecart)}, ${motif})`,
      { excludeSelf:true, tag:'ajustement', url:'#stock' }
    );
  }
  if(typeof logAction === 'function') logAction('ajustement_stock', `${ing.nom}: ${theo} → ${compte} (${motif})`);
  if(typeof renderStockNiveaux === 'function') await renderStockNiveaux();
  await renderAjustementsRecents();
}

// ── LE JOURNAL DES DERNIERS AJUSTEMENTS ───────────────────────────────────
// Pas une file d'attente : un journal. Le stock est déjà à jour. C'est là que
// l'équipe voit ce qui a bougé, qui l'a fait et pourquoi — et peut annuler une
// erreur. La notification prévient ; le journal garde la mémoire.
async function renderAjustementsRecents(){
  const box = document.getElementById('aj-liste');
  if(!box) return;
  const {data, error} = await SB.from('gp_ajustements_stock')
    .select('*').eq('admin_id', GP_ADMIN_ID).is('deleted_at', null)
    .order('created_at', {ascending:false}).limit(15);
  if(error){ box.innerHTML = '<div style="color:var(--red);font-size:12px">Journal indisponible : '+ajEsc(error.message)+'</div>'; return; }
  const L = data||[];
  if(!L.length){ box.innerHTML = '<div style="color:var(--textm);font-size:12px;padding:6px 0">Aucun ajustement enregistré.</div>'; return; }
  box.innerHTML = L.map(a=>{
    const manque = Number(a.ecart) < 0;
    const annule = a.statut === 'annule';
    return `<div style="border:1px solid var(--border);border-left:4px solid ${annule?'var(--textm)':manque?'var(--red)':'var(--green)'};border-radius:8px;padding:8px 10px;margin-bottom:6px;${annule?'opacity:.55':''}">
      <div style="font-weight:700;font-size:13px">${ajEsc(a.ingredient_nom)}
        <span style="color:${manque?'var(--red)':'var(--green)'};font-weight:800">${a.ecart>0?'+':''}${fmt(a.ecart)}</span>
        <span style="color:var(--textm);font-weight:500;font-size:11px">(${fmt(a.ancienne_val)} → ${fmt(a.nouvelle_val)})</span>
        ${annule?'<span class="badge bdg-r" style="font-size:9px;margin-left:6px">ANNULÉ</span>':''}
      </div>
      <div style="font-size:11px;color:var(--textm)">${ajEsc(a.motif)}${a.note?' · '+ajEsc(a.note):''} — ${ajEsc(a.saisi_par_nom||'')}, ${new Date(a.created_at).toLocaleString('fr-FR')}</div>
      ${annule?'':`<div style="margin-top:6px"><button class="btn btn-out btn-sm" onclick="annulerAjustement('${a.id}')" style="padding:3px 8px;font-size:11px" title="Remet le stock comme avant, par un mouvement inverse">↩️ Annuler</button></div>`}
    </div>`;
  }).join('');
}
// Ancien nom, encore appelé par l'écran stock des versions précédentes.
const renderAjustementsAValider = renderAjustementsRecents;

// Annuler = revenir en arrière. Le stock retrouve sa valeur d'avant par un
// mouvement INVERSE : on ne supprime pas le mouvement d'origine, on ne réécrit
// pas l'histoire. Les deux lignes restent visibles dans les mouvements.
async function annulerAjustement(id){
  if(!ajPeut()){ notify('Action réservée aux administrateurs','r'); return; }
  const {data:a} = await SB.from('gp_ajustements_stock').select('*').eq('id',id).maybeSingle();
  if(!a){ notify('Ajustement introuvable','r'); return; }
  if(!confirm(`Annuler l'ajustement de ${a.ingredient_nom} (${a.ecart>0?'+':''}${a.ecart}) et remettre le stock comme avant ?`)) return;
  const ecart = Number(a.ecart)||0;
  const {error:eMv} = await SB.from('gp_stock_mp').insert({
    admin_id: GP_ADMIN_ID, saisi_par: GP_USER.id,
    type: ecart > 0 ? 'ajustement' : 'entree',     // le sens INVERSE du mouvement initial
    date: today(),
    ingredient_id: a.ingredient_id,
    ingredient_nom: a.ingredient_nom,
    quantite: Math.abs(ecart),
    prix_unit: 0,
    ref: 'Annulation ajustement ' + (a.created_at||'').slice(0,10)
  });
  if(eMv){ notify('Annulation impossible : '+(eMv.message||''),'r',6000); return; }
  await SB.from('gp_ajustements_stock').update({
    statut:'annule', valide_par:GP_USER.id,
    valide_par_nom:(GP_USER.email||'').split('@')[0]||'—', valide_le:new Date().toISOString()
  }).eq('id',id);
  notify('Ajustement annulé — stock rétabli','r');
  if(typeof pushSendToTeam === 'function'){
    pushSendToTeam('↩️ Ajustement annulé',
      `${(GP_USER.email||'').split('@')[0]} a annulé l'ajustement de ${a.ingredient_nom} — stock rétabli`,
      { excludeSelf:true, tag:'ajustement' });
  }
  if(typeof renderStockNiveaux === 'function') await renderStockNiveaux();
  await renderAjustementsRecents();
}
