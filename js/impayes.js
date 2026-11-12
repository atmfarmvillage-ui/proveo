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

// Le dernier versement de CHAQUE client : date et montant.
// `gp_reglements_clients` est le registre des règlements DATÉS — la vraie date
// de chaque versement, pas celle de la vente qu'il solde.
async function _impDerniersVersements(){
  const out = {};
  try{
    // On lit le MODE et la NOTE aussi : « 250 000 F » sans savoir si c'est du
    // Flooz ou des espèces ne vaut rien devant un client qui conteste.
    const { data, error } = await SB.from('gp_reglements_clients')
      .select('client_id,date_paiement,montant,mode,note')
      .eq('admin_id', GP_ADMIN_ID).is('deleted_at', null)
      .order('date_paiement', { ascending:false }).limit(5000);
    if(error) throw new Error(error.message);
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
        <span style="font-weight:700;font-size:13px">${_impEsc(x.nom)}</span>
        <span style="font-weight:700;color:#c0392b">doit ${fmt(x.total)} F</span>
      </div>
      <div style="font-size:11px;color:var(--textm);margin-top:2px">💰 dernier versement : ${silence}</div>
      <div style="font-size:11px;color:var(--textm)">🛒 ${x.achatJours != null ? 'dernière facture impayée il y a ' + x.achatJours + ' j' : 'facture sans date'} · ${x.lignes.length} facture${x.lignes.length > 1 ? 's' : ''} impayée${x.lignes.length > 1 ? 's' : ''}${x.tel ? ' · 📞 ' + _impEsc(x.tel) : ' · <span style="color:var(--gold)">sans téléphone</span>'}</div>
      <div style="margin-top:5px;display:flex;gap:6px;flex-wrap:wrap">
        ${x.tel ? `<button class="btn btn-g btn-sm" style="background:#25D366;color:#fff;border:none;font-size:10px;padding:3px 9px" onclick="relancerDebiteurWA('${_impEsc(x.cle)}')">📞 Relancer</button>` : ''}
        <button class="btn btn-out btn-sm" style="font-size:10px;padding:3px 9px" onclick="_impToggle('${_impEsc(x.cle)}')">
          <span id="impi-${_impEsc(x.cle)}">▸</span> Ses factures
        </button>
        <button class="btn btn-out btn-sm" style="font-size:10px;padding:3px 9px" onclick="_impToggle('v${_impEsc(x.cle)}')">
          <span id="impi-v${_impEsc(x.cle)}">▸</span> 💰 Ses versements${x.versements.length ? ' (' + x.versements.length + ')' : ''}
        </button>
      </div>
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
