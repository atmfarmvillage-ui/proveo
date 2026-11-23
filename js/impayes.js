// ══════════════════════════════════════════════════════════════════
// PROVENDA — IMPAYÉS
//
// Demande du DG (12/11) : « si on peut même avoir une page impayé ça serait
// bon », après avoir constaté qu'on ne voit nulle part QUAND un débiteur a
// versé pour la dernière fois.
//
// C'est le seul chiffre qui sépare un gros compte qui tourne d'une créance
// perdue. Deux clients qui doivent 9 millions s'affichaient pareil, en rouge,
// que le dernier versement date de la semaine dernière ou de six mois.
//
// ⚠️ La collecte vient de `collecterImpayes()` (dashboard_drill.js), la MÊME
// que le compteur du tableau de bord. Deux collectes donneraient deux totaux
// de la même dette.
//
// Le badge « 🛒 il y a N j » de la liste Clients est le dernier ACHAT. Ici on
// montre le dernier VERSEMENT : ce n'est pas la même information, et c'est
// celle qui dit s'il faut relancer.
// ══════════════════════════════════════════════════════════════════

let IMP_TRI = 'anciennete';     // 'anciennete' (défaut) | 'montant'
let IMP_DATA = null;            // dernier calcul, pour trier sans relire la base

function _impJours(d){
  if(!d) return null;
  const t = Date.parse(String(d).length <= 10 ? String(d) + 'T12:00:00' : d);
  if(Number.isNaN(t)) return null;
  return Math.floor((Date.now() - t) / 86400000);
}
function _impEsc(x){
  return String(x == null ? '' : x)
    .replace(/[&<>"]/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;' }[c]));
}

// Toutes les lignes, page par page (plafond Supabase = 1000 par lecture).
// Contrairement à `_fetchAllPages`, une erreur est LEVÉE : une page manquante
// donnerait un relevé faux mais crédible.
async function _impToutesPages(construire, page = 1000){
  let tout = [], from = 0;
  for(;;){
    const { data, error } = await construire().order('id', { ascending:true }).range(from, from + page - 1);
    if(error) throw new Error(error.message);
    if(!data || !data.length) break;
    tout = tout.concat(data);
    if(data.length < page) break;
    from += page;
  }
  return tout;
}

// Le dernier versement de CHAQUE client : date et montant.
// `gp_reglements_clients` est le registre des règlements DATÉS — la vraie date
// de chaque versement, pas celle de la vente qu'il solde.
async function _impDerniersVersements(){
  const out = {};
  try{
    // On lit le MODE et la NOTE aussi : « 250 000 F » sans savoir si c'est du
    // Flooz ou des espèces ne vaut rien devant un client qui conteste.
    // Page par page (23/11) : `.limit(5000)` ne passait pas le plafond de 1000
    // lignes de Supabase. Au-delà, les plus anciens versements disparaissaient
    // et un client pouvait s'afficher « aucun versement » alors qu'il a payé.
    const data = await _impToutesPages(() => SB.from('gp_reglements_clients')
      .select('id,client_id,date_paiement,montant,mode,note')
      .eq('admin_id', GP_ADMIN_ID).is('deleted_at', null));
    data.sort((a, b) => String(b.date_paiement || '').localeCompare(String(a.date_paiement || '')));
    (data || []).forEach(r => {
      if(!r.client_id) return;
      // La requête est triée du plus récent au plus ancien : le premier vu est
      // le dernier versé, et la liste reste dans le bon ordre.
      if(!out[r.client_id]) out[r.client_id] = { date: r.date_paiement, montant: Number(r.montant) || 0, tous: [] };
      out[r.client_id].tous.push({ date: r.date_paiement, montant: Number(r.montant) || 0,
                                   mode: r.mode || r.note || '' });
    });
  }catch(e){
    // On le DIT : sans ces dates la page perd sa raison d'être, mieux vaut
    // l'annoncer que d'afficher « aucun versement » pour tout le monde.
    console.warn('[impayes] derniers versements : ' + (e && e.message));
    throw e;
  }
  return out;
}

// Un relevé de 15 versements ne se lit pas ligne par ligne. Ce qu'on vérifie
// devant le client, c'est « combien il a versé en octobre ». D'où un BILAN EN
// GRAS en tête de chaque mois.
const _IMP_MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet',
                   'août', 'septembre', 'octobre', 'novembre', 'décembre'];
function _impMoisLisible(ym){
  const m = /^(\d{4})-(\d{2})$/.exec(ym || '');
  if(!m) return 'Mois inconnu';
  const nom = _IMP_MOIS[+m[2] - 1] || '?';
  return nom.charAt(0).toUpperCase() + nom.slice(1) + ' ' + m[1];
}
function _impVersementsHtml(vers){
  // Les versements arrivent déjà du plus récent au plus ancien : on garde cet
  // ordre pour les mois aussi, sans retrier.
  const groupes = {}, ordre = [];
  (vers || []).forEach(p => {
    const ym = String(p.date || '').slice(0, 7) || '?';
    if(!groupes[ym]){ groupes[ym] = { total: 0, n: 0, lignes: [] }; ordre.push(ym); }
    groupes[ym].total += (p.montant || 0);
    groupes[ym].n += 1;
    groupes[ym].lignes.push(p);
  });
  return ordre.map(ym => {
    const g = groupes[ym];
    return `<tr style="background:rgba(10,138,79,.10)">
        <td colspan="2" style="font-size:10px"><b>${_impEsc(_impMoisLisible(ym))}</b>
          <span style="color:var(--textm);font-weight:400"> · ${g.n} versement${g.n > 1 ? 's' : ''}</span></td>
        <td class="num"><b style="color:#0a8a4f">${fmt(g.total)} F</b></td></tr>`
      + g.lignes.map(p =>
        `<tr><td style="font-size:9px">${_impEsc(typeof fmtDate === 'function' && p.date ? fmtDate(p.date) : (p.date || '—'))}</td>
             <td style="font-size:9px">${_impEsc(p.mode || '—')}</td>
             <td class="num" style="color:#0a8a4f">${fmt(p.montant)} F</td></tr>`).join('');
  }).join('');
}

function trierImpayes(mode){
  IMP_TRI = (mode === 'montant') ? 'montant' : 'anciennete';
  _impAfficher();
}

async function renderImpayes(){
  const box = document.getElementById('imp-content');
  if(!box) return;
  box.innerHTML = '<div class="page-sub">Chargement…</div>';
  try{
    if(typeof collecterImpayes !== 'function'){
      throw new Error("La collecte des impayés n'est pas chargée (dashboard_drill.js).");
    }
    const D = await collecterImpayes(true);        // toutes périodes : c'est une DETTE
    let versements = {};
    let erreurVers = '';
    try{ versements = await _impDerniersVersements(); }
    catch(e){ erreurVers = (e && e.message) || String(e); }

    // Un débiteur = une personne, pas une facture.
    const debiteurs = Object.keys(D.byCli || {}).map(k => {
      const d = D.byCli[k];
      // `byCli` est indexé par client_id, ou par « nom:… » quand la vente n'a
      // pas d'identifiant client : dans ce second cas on n'a pas de versement.
      const v = (k && !String(k).startsWith('nom:')) ? versements[k] : null;
      // ⚠️ `lignes` ne contient que les factures IMPAYÉES : cette date est celle
      // de la dernière facture non soldée, PAS du dernier achat. Un client qui
      // paie comptant n'y apparaît pas.
      const dernierAchat = (d.lignes || []).reduce((m, l) => (l.date && l.date > m ? l.date : m), '');
      return {
        cle: k, nom: d.nom || '(sans nom)', tel: d.tel || '', total: d.total || 0,
        lignes: d.lignes || [],
        versDate: v ? v.date : null, versMontant: v ? v.montant : 0,
        versJours: v ? _impJours(v.date) : null,
        versements: (v && v.tous) ? v.tous : [],
        versTotal: (v && v.tous) ? v.tous.reduce((t, p) => t + (p.montant || 0), 0) : 0,
        achatJours: _impJours(dernierAchat),
      };
    }).filter(x => x.total > 0);

    IMP_DATA = { D, debiteurs, erreurVers };
    _impAfficher();
  }catch(e){
    box.innerHTML = `<div class="card"><div style="color:var(--red);font-size:12px">⚠️ ${_impEsc(e && e.message)}</div></div>`;
  }
}

function _impAfficher(){
  const box = document.getElementById('imp-content');
  if(!box || !IMP_DATA) return;
  const { D, debiteurs, erreurVers } = IMP_DATA;

  // Tri par défaut : l'ANCIENNETÉ du dernier versement, pas le montant.
  // Celui qui ne paie plus remonte en tête, pas celui qui doit le plus.
  const liste = debiteurs.slice().sort((a, b) => {
    if(IMP_TRI === 'montant') return b.total - a.total;
    const ja = (a.versJours == null) ? 99999 : a.versJours;   // jamais versé = le pire
    const jb = (b.versJours == null) ? 99999 : b.versJours;
    return jb - ja || b.total - a.total;
  });

  const muets60 = debiteurs.filter(x => x.versJours == null || x.versJours >= 60);
  const duMuets = muets60.reduce((s, x) => s + x.total, 0);

  let h = '';
  if(erreurVers){
    h += `<div class="card" style="margin-bottom:10px"><div style="color:var(--gold);font-size:12px">
      ⚠️ Les dates de versement n'ont pas pu être lues (${_impEsc(erreurVers)}).
      Les dettes ci-dessous restent justes, mais « dernier versement » sera vide pour tout le monde.</div></div>`;
  }

  h += `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(170px,1fr));gap:10px;margin-bottom:14px">
    <div class="stat-box" style="border-color:rgba(192,57,43,.35)">
      <div class="stat-val" style="color:#c0392b">${fmt(D.totalGlobal || 0)}</div>
      <div class="stat-lbl">⚠ À recouvrer (toutes périodes)</div>
    </div>
    <div class="stat-box">
      <div class="stat-val">${debiteurs.length}</div>
      <div class="stat-lbl">👥 Débiteurs</div>
    </div>
    <div class="stat-box" style="border-color:rgba(192,57,43,.35)">
      <div class="stat-val" style="color:#c0392b">${fmt(duMuets)}</div>
      <div class="stat-lbl">🔇 Dû par ceux qui n'ont rien versé depuis 60 j (${muets60.length})</div>
    </div>
  </div>`;

  h += `<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:10px">
    <span style="font-size:11px;color:var(--textm)">Trier par</span>
    <button class="btn btn-sm ${IMP_TRI === 'anciennete' ? '' : 'btn-out'}" onclick="trierImpayes('anciennete')">⏳ Silence le plus long</button>
    <button class="btn btn-sm ${IMP_TRI === 'montant' ? '' : 'btn-out'}" onclick="trierImpayes('montant')">💰 Montant dû</button>
    ${liste.some(x => x.tel) ? `<button class="btn btn-g btn-sm" style="background:#25D366;color:#fff;border:none" onclick="relancerTousImpayes()">📞 Relancer tout le monde</button>` : ''}
  </div>`;

  if(!liste.length){
    h += `<div class="card"><div style="padding:14px;text-align:center;color:var(--textm);font-size:13px">
      🎉 Aucun impayé. Tous les clients sont à jour.</div></div>`;
    box.innerHTML = h;
    return;
  }

  h += '<div class="card">';
  liste.forEach(x => {
    // Le silence, en clair : c'est lui qui déclenche la relance.
    const silence = (x.versJours == null)
      ? `<span style="color:#c0392b;font-weight:700">aucun versement enregistré</span>`
      : `${fmt(x.versMontant)} F <b style="color:${x.versJours >= 60 ? '#c0392b' : x.versJours >= 30 ? '#b8860b' : '#0a8a4f'}">il y a ${x.versJours} j</b>`;
    h += `<div style="padding:9px 0;border-bottom:1px solid var(--border2)">
      <div style="display:flex;justify-content:space-between;align-items:baseline;gap:8px;flex-wrap:wrap">
        <span style="font-weight:700;font-size:13px;cursor:pointer;text-decoration:underline dotted" title="Détail par période" onclick="impPeriodeOuvrir('${_impEsc(x.cle)}')">${_impEsc(x.nom)}</span>
        <span style="font-weight:700;color:#c0392b">doit ${fmt(x.total)} F</span>
      </div>
      <div style="font-size:11px;color:var(--textm);margin-top:2px">💰 dernier versement : ${silence}</div>
      <div style="font-size:11px;color:var(--textm)">🛒 ${x.achatJours != null ? 'dernière facture impayée il y a ' + x.achatJours + ' j' : 'facture sans date'} · ${x.lignes.length} facture${x.lignes.length > 1 ? 's' : ''} impayée${x.lignes.length > 1 ? 's' : ''}${x.tel ? ' · 📞 ' + _impEsc(x.tel) : ' · <span style="color:var(--gold)">sans téléphone</span>'}</div>
      <div style="margin-top:5px;display:flex;gap:6px;flex-wrap:wrap">
        <button class="btn btn-sm" style="font-size:10px;padding:3px 9px" onclick="impPeriodeOuvrir('${_impEsc(x.cle)}')">
          <span id="impi-p${_impEsc(x.cle)}">▸</span> 📅 Détail par période
        </button>
        ${x.tel ? `<button class="btn btn-g btn-sm" style="background:#25D366;color:#fff;border:none;font-size:10px;padding:3px 9px" onclick="relancerDebiteurWA('${_impEsc(x.cle)}')">📞 Relancer</button>` : ''}
        <button class="btn btn-out btn-sm" style="font-size:10px;padding:3px 9px" onclick="_impToggle('${_impEsc(x.cle)}')">
          <span id="impi-${_impEsc(x.cle)}">▸</span> Ses factures
        </button>
        <button class="btn btn-out btn-sm" style="font-size:10px;padding:3px 9px" onclick="_impToggle('v${_impEsc(x.cle)}')">
          <span id="impi-v${_impEsc(x.cle)}">▸</span> 💰 Ses versements${x.versements.length ? ' (' + x.versements.length + ')' : ''}
        </button>
      </div>
      <div id="impd-p${_impEsc(x.cle)}" style="display:none;margin-top:8px"></div>
      <div id="impd-v${_impEsc(x.cle)}" style="display:none;margin-top:6px">
        ${x.versements.length ? `
        <div style="font-size:10px;color:var(--textm);margin-bottom:3px">Total versé par ce client : <b style="color:#0a8a4f">${fmt(x.versTotal)} F</b></div>
        <table class="tbl" style="font-size:10px"><thead><tr><th>Date</th><th>Mode</th><th class="num">Montant</th></tr></thead><tbody>
        ${_impVersementsHtml(x.versements)}
        </tbody></table>`
        : `<div style="font-size:11px;color:var(--textm)">Aucun versement enregistré pour ce client. Les règlements saisis à la vente ou via « Encaisser » apparaîtront ici, datés.</div>`}
      </div>
      <div id="impd-${_impEsc(x.cle)}" style="display:none;margin-top:6px">
        <table class="tbl" style="font-size:10px"><thead><tr><th>Date</th><th>Produit</th><th class="num">Reste dû</th></tr></thead><tbody>
        ${x.lignes.slice().sort((a, b) => String(b.date || '').localeCompare(String(a.date || ''))).map(l =>
          `<tr><td style="font-size:9px">${_impEsc(typeof fmtDate === 'function' && l.date ? fmtDate(l.date) : (l.date || '—'))}</td>
               <td style="font-size:9px">${_impEsc(l.formule || '—')}</td>
               <td class="num" style="color:#c0392b">${fmt(l.reste)} F</td></tr>`).join('')}
        </tbody></table>
      </div>
    </div>`;
  });
  h += '</div>';
  box.innerHTML = h;
}

function _impToggle(cle){
  const d = document.getElementById('impd-' + cle), i = document.getElementById('impi-' + cle);
  if(!d) return;
  const ouvrir = d.style.display === 'none';
  d.style.display = ouvrir ? '' : 'none';
  if(i) i.textContent = ouvrir ? '▾' : '▸';
}

// Relance d'UN débiteur, par sa clé. On réutilise le message agrégé et
// l'ouverture WhatsApp du tableau de bord : un second message divergerait.
function relancerDebiteurWA(cle){
  const d = (window._kpiDrillDebiteurs || {})[cle];
  if(!d){ notify('Client introuvable — recharge la page.', 'r'); return; }
  if(typeof _ouvrirWADeb !== 'function'){ notify('Relance indisponible.', 'r'); return; }
  if(!_ouvrirWADeb(d)) notify('Pas de téléphone pour ' + (d.nom || 'ce client'), 'r');
}

// ══════════════════════════════════════════════════════════════════
// DÉTAIL PAR PÉRIODE D'UN CLIENT (23/11, demande DG) : « si on clique sur
// Fairfield, on voit le détail des paiements par mois, sur deux mois… comme
// l'inventaire ». Une période (raccourcis ou Du/Au), 4 compteurs (dette au
// début, acheté, versé, dette à la fin), un bilan EN GRAS par mois, et sous
// chaque mois chaque ligne : date, achat ou versement, montant, solde.
//
// Même calcul que le Relevé de compte de la fiche client (clients.js) :
// dette = achats (gp_ventes.montant_total) − versements DATÉS
// (gp_reglements_clients). Tout l'historique est lu, page par page : la dette
// au début de la période dépend de TOUT ce qui précède.
// ══════════════════════════════════════════════════════════════════
const IMP_P = {};     // cle → { du, au, code, data:{ventes, regs} | null, erreur }

function _impJourLocal(d){ return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
function impCalculerPeriode(code, auj){
  const a = auj ? new Date(auj + 'T12:00:00') : new Date();
  const y = a.getFullYear(), m = a.getMonth();
  const debutMois = k => _impJourLocal(new Date(y, m - k, 1));
  switch(code){
    case 'mois':         return { du:debutMois(0), au:_impJourLocal(new Date(y, m + 1, 0)) };
    case 'mois_dernier': return { du:debutMois(1), au:_impJourLocal(new Date(y, m, 0)) };
    case '2m':           return { du:debutMois(1), au:_impJourLocal(a) };   // le mois en cours + le précédent
    case '3m':           return { du:debutMois(2), au:_impJourLocal(a) };
    case '6m':           return { du:debutMois(5), au:_impJourLocal(a) };
    case 'annee':        return { du:y + '-01-01', au:_impJourLocal(a) };
  }
  return null;
}
const _IMP_RACC = [['mois', 'Ce mois'], ['mois_dernier', 'Mois dernier'], ['2m', '2 derniers mois'],
                   ['3m', '3 derniers mois'], ['6m', '6 mois'], ['annee', 'Cette année']];
function _impDateFr(d){ return d ? String(d).slice(8, 10) + '/' + String(d).slice(5, 7) + '/' + String(d).slice(0, 4) : '—'; }

async function impPeriodeOuvrir(cle){
  const box = document.getElementById('impd-p' + cle), ico = document.getElementById('impi-p' + cle);
  if(!box) return;
  if(box.style.display !== 'none'){ box.style.display = 'none'; if(ico) ico.textContent = '▸'; return; }
  box.style.display = ''; if(ico) ico.textContent = '▾';
  if(!IMP_P[cle]){ const p = impCalculerPeriode('2m'); IMP_P[cle] = { du:p.du, au:p.au, code:'2m', data:null, erreur:'' }; }
  if(!IMP_P[cle].data && !IMP_P[cle].erreur){
    box.innerHTML = '<div style="font-size:11px;color:var(--textm)">Chargement de l’historique…</div>';
    await _impPeriodeCharger(cle);
  }
  _impPeriodeAfficher(cle);
}

async function _impPeriodeCharger(cle){
  const st = IMP_P[cle];
  if(String(cle).startsWith('nom:')){
    st.erreur = 'Ce client n’a pas de fiche client : ses versements ne lui sont pas rattachés. Crée-lui une fiche (page Clients) pour suivre ses paiements par période.';
    return;
  }
  try{
    // Même périmètre que la fiche client : un point de vente ne voit que ses ventes,
    // et donc que les versements encaissés chez lui (sinon la dette serait fausse).
    const scope = q => (typeof scopeQueryClientsPole === 'function' ? scopeQueryClientsPole(q) : q);
    const [ventes, regs] = await Promise.all([
      _impToutesPages(() => scope(SB.from('gp_ventes')
        .select('id,date,formule_nom,qte_vendue,montant_total,point_vente')
        .eq('admin_id', GP_ADMIN_ID).eq('client_id', cle).is('deleted_at', null))),
      _impToutesPages(() => scope(SB.from('gp_reglements_clients')
        .select('id,date_paiement,montant,mode,note,point_vente')
        .eq('admin_id', GP_ADMIN_ID).eq('client_id', cle).is('deleted_at', null))),
    ]);
    st.data = { ventes, regs };
  }catch(e){
    st.erreur = 'Historique illisible : ' + ((e && e.message) || e) + '. Rien n’est affiché plutôt qu’un relevé faux.';
  }
}

// Le calcul, sans DOM (testé en Node) : lignes datées, solde courant, bilan par mois.
function impReleveCalculer(data, du, au){
  const evts = [];
  (data.ventes || []).forEach(v => evts.push({ d:String(v.date || '').slice(0, 10), t:'a', mt:Number(v.montant_total) || 0,
    lib:v.formule_nom || 'Achat', det:[v.qte_vendue ? (Number(v.qte_vendue) + ' kg') : '', v.point_vente || ''].filter(Boolean).join(' · ') }));
  (data.regs || []).forEach(r => {
    const note = String(r.note || '').trim();
    evts.push({ d:String(r.date_paiement || '').slice(0, 10), t:'p', mt:Number(r.montant) || 0,
      lib:r.mode || 'Versement', det:[note && note !== r.mode ? note.slice(0, 40) : '', r.point_vente || ''].filter(Boolean).join(' · ') });
  });
  // Une ligne sans date ne peut être placée dans aucun mois : elle compte dans la
  // dette (elle existe), et on le DIT, plutôt que de la faire disparaître.
  const okDate = e => /^\d{4}-\d{2}-\d{2}$/.test(e.d);
  const sansDate = evts.filter(e => !okDate(e));
  const dates = evts.filter(okDate);
  dates.sort((a, b) => a.d < b.d ? -1 : a.d > b.d ? 1 : (a.t === 'a' ? -1 : 1));
  let solde = sansDate.reduce((s, e) => s + (e.t === 'a' ? e.mt : -e.mt), 0);
  let detteDebut = null;
  const dans = [];
  dates.forEach(e => {
    if(e.d >= du && detteDebut === null) detteDebut = solde;
    solde += (e.t === 'a' ? e.mt : -e.mt); e.solde = solde;
    if(e.d >= du && e.d <= au) dans.push(e);
  });
  if(detteDebut === null) detteDebut = solde;        // aucune ligne à partir de « Du »
  const avantFin = dates.filter(e => e.d <= au);
  const detteFin = avantFin.length ? avantFin[avantFin.length - 1].solde : detteDebut;
  // Bilan par mois : TOUS les mois de la période, même sans mouvement (un mois
  // vide, c'est justement un client qui n'a rien versé).
  const mois = [];
  let y = +du.slice(0, 4), m = +du.slice(5, 7);
  while((y + '-' + String(m).padStart(2, '0')) <= au.slice(0, 7)){
    mois.push(y + '-' + String(m).padStart(2, '0'));
    m++; if(m > 12){ m = 1; y++; }
  }
  let report = detteDebut;
  const bilans = mois.map(ym => {
    const l = dans.filter(e => e.d.slice(0, 7) === ym);
    const achete = l.filter(e => e.t === 'a').reduce((s, e) => s + e.mt, 0);
    const verse = l.filter(e => e.t === 'p').reduce((s, e) => s + e.mt, 0);
    const fin = l.length ? l[l.length - 1].solde : report;
    report = fin;
    return { ym, achete, verse, nbVers:l.filter(e => e.t === 'p').length, dette:fin, lignes:l.slice().reverse() };
  }).reverse();     // le mois le plus récent en haut, comme les autres listes
  return {
    detteDebut, detteFin, bilans, sansDate:sansDate.length,
    achete:dans.filter(e => e.t === 'a').reduce((s, e) => s + e.mt, 0),
    verse:dans.filter(e => e.t === 'p').reduce((s, e) => s + e.mt, 0),
    lignes:dans,
  };
}

function _impPeriodeAfficher(cle){
  const box = document.getElementById('impd-p' + cle), st = IMP_P[cle];
  if(!box || !st) return;
  const c = _impEsc(cle);
  if(st.erreur){ box.innerHTML = `<div style="font-size:11px;color:var(--red)">⚠️ ${_impEsc(st.erreur)}</div>`; return; }
  const R = impReleveCalculer(st.data, st.du, st.au);
  st.calcul = R;
  const deb = ((IMP_DATA && IMP_DATA.debiteurs) || []).find(x => x.cle === cle);
  const auj = _impJourLocal(new Date());
  const btn = (code, lib) => `<button class="btn btn-sm ${st.code === code ? '' : 'btn-out'}" style="font-size:10px;padding:3px 8px" onclick="impPeriodeRaccourci('${c}','${code}')">${lib}</button>`;
  const kpi = (val, lib, coul) => `<div style="flex:1;min-width:120px;border:1px solid var(--border2);border-radius:8px;padding:6px 8px;text-align:center">
      <div style="font-weight:800;font-size:14px;color:${coul}">${fmt(val)} F</div><div style="font-size:10px;color:var(--textm)">${lib}</div></div>`;
  let h = `<div style="border:1px solid var(--border2);border-radius:10px;padding:8px 10px">
    <div style="display:flex;gap:5px;flex-wrap:wrap;margin-bottom:6px">${_IMP_RACC.map(([k, l]) => btn(k, l)).join('')}</div>
    <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:8px;font-size:11px">
      Du <input type="date" value="${st.du}" style="width:auto;font-size:11px" onchange="impPeriodeDates('${c}',this.value,null)">
      au <input type="date" value="${st.au}" style="width:auto;font-size:11px" onchange="impPeriodeDates('${c}',null,this.value)">
      <button class="btn btn-out btn-sm" style="font-size:10px;padding:3px 9px" onclick="impPeriodePDF('${c}')">📄 PDF du relevé</button>
    </div>
    <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px">
      ${kpi(R.detteDebut, 'Dette au ' + _impDateFr(st.du), 'var(--text)')}
      ${kpi(R.achete, 'Acheté sur la période', '#c0392b')}
      ${kpi(R.verse, 'Versé sur la période', '#0a8a4f')}
      ${kpi(R.detteFin, 'Dette au ' + _impDateFr(st.au < auj ? st.au : auj), R.detteFin > 0 ? '#c0392b' : '#0a8a4f')}
    </div>`;
  // Honnêteté : le relevé (achats − versements datés) et la liste des factures
  // impayées peuvent diverger (vente réglée sans versement daté, par ex.).
  if(deb && st.au >= auj && Math.abs(R.detteFin - deb.total) >= 1){
    h += `<div style="font-size:10px;color:var(--gold);margin-bottom:6px">ℹ️ Les factures impayées de ce client totalisent ${fmt(deb.total)} F ; le relevé (achats − versements datés) donne ${fmt(R.detteFin)} F. Écart : ${fmt(R.detteFin - deb.total)} F — souvent un paiement noté sur la vente sans versement daté.</div>`;
  }
  if(R.sansDate) h += `<div style="font-size:10px;color:var(--gold);margin-bottom:6px">ℹ️ ${R.sansDate} ligne(s) sans date comptent dans la dette mais ne sont rangées dans aucun mois.</div>`;
  h += `<table class="tbl" style="font-size:10px"><thead><tr><th>Date</th><th>Opération</th><th class="num">Acheté</th><th class="num">Versé</th><th class="num">Dette après</th></tr></thead><tbody>`;
  R.bilans.forEach(b => {
    h += `<tr style="background:rgba(10,138,79,.10)">
      <td colspan="2"><b>${_impEsc(_impMoisLisible(b.ym))}</b> <span style="color:var(--textm)">· ${b.nbVers} versement${b.nbVers > 1 ? 's' : ''}</span></td>
      <td class="num"><b style="color:#c0392b">${b.achete ? fmt(b.achete) + ' F' : '—'}</b></td>
      <td class="num"><b style="color:#0a8a4f">${b.verse ? fmt(b.verse) + ' F' : '—'}</b></td>
      <td class="num"><b>${fmt(b.dette)} F</b></td></tr>`;
    if(!b.lignes.length) h += `<tr><td colspan="5" style="font-size:9px;color:var(--textm)">Aucun achat ni versement ce mois-là.</td></tr>`;
    b.lignes.forEach(e => {
      h += `<tr><td style="font-size:9px">${_impDateFr(e.d)}</td>
        <td style="font-size:9px">${e.t === 'a' ? '🛒 ' : '💰 '}${_impEsc(e.lib)}${e.det ? ' <span style="color:var(--textm)">· ' + _impEsc(e.det) + '</span>' : ''}</td>
        <td class="num" style="color:#c0392b">${e.t === 'a' ? fmt(e.mt) + ' F' : ''}</td>
        <td class="num" style="color:#0a8a4f">${e.t === 'p' ? fmt(e.mt) + ' F' : ''}</td>
        <td class="num" style="color:var(--textm)">${fmt(e.solde)} F</td></tr>`;
    });
  });
  h += '</tbody></table></div>';
  box.innerHTML = h;
}

function impPeriodeRaccourci(cle, code){
  const st = IMP_P[cle], p = impCalculerPeriode(code); if(!st || !p) return;
  st.du = p.du; st.au = p.au; st.code = code; _impPeriodeAfficher(cle);
}
function impPeriodeDates(cle, du, au){
  const st = IMP_P[cle]; if(!st) return;
  if(du) st.du = du;
  if(au) st.au = au;
  if(st.du > st.au){ const t = st.du; st.du = st.au; st.au = t; }
  st.code = ''; _impPeriodeAfficher(cle);
}

// Le relevé de la période en PDF : à envoyer au client qui conteste.
function impPeriodePDF(cle){
  const st = IMP_P[cle], R = st && st.calcul;
  if(!R) return;
  const deb = ((IMP_DATA && IMP_DATA.debiteurs) || []).find(x => x.cle === cle);
  const rows = [];
  R.bilans.slice().reverse().forEach(b => {
    b.lignes.slice().reverse().forEach(e => rows.push({ date:_impDateFr(e.d), op:(e.t === 'a' ? 'Achat — ' : 'Versement — ') + e.lib + (e.det ? ' · ' + e.det : ''),
      achete:e.t === 'a' ? e.mt : '', verse:e.t === 'p' ? e.mt : '', solde:e.solde }));
    rows.push({ date:'', op:'BILAN ' + _impMoisLisible(b.ym).toUpperCase(), achete:b.achete, verse:b.verse, solde:b.dette });
  });
  const cols = [{ label:'Date', key:'date' }, { label:'Opération', key:'op' }, { label:'Acheté (F)', key:'achete' },
                { label:'Versé (F)', key:'verse' }, { label:'Dette après (F)', key:'solde' }];
  const nom = (deb && deb.nom) || 'client';
  const sous = 'Du ' + _impDateFr(st.du) + ' au ' + _impDateFr(st.au) + ' · Dette au début : ' + fmt(R.detteDebut)
    + ' F · Acheté : ' + fmt(R.achete) + ' F · Versé : ' + fmt(R.verse) + ' F · Dette à la fin : ' + fmt(R.detteFin) + ' F';
  gpExportPDF('Relevé de compte — ' + nom, cols, rows, 'releve_' + nom.replace(/[^a-zA-Z0-9]+/g, '_') + '_' + st.du + '_au_' + st.au + '.pdf', sous);
}
