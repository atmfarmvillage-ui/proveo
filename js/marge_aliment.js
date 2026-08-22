// ══════════════════════════════════════════════════
// PROVENDA — MARGE PAR TONNE D'ALIMENT
// Pour chaque formule : ce que coûte une tonne (matières premières d'après la
// composition + transformation) face à ce qu'elle rapporte au prix de gros et
// au prix de détail. Entièrement recalculé à chaque ouverture depuis
// prix_actuel : changer le prix du maïs déplace toutes les marges.
// Le transport (facturé au lot) est volontairement exclu — l'inclure ferait
// dépendre la marge d'une taille de lot hypothétique, invisible à l'écran.
// ══════════════════════════════════════════════════

// Résolution d'une MP de composition vers sa fiche : id d'abord, puis nom
// normalisé. Même règle d'identité que partout ailleurs dans l'app.
function _maNormNom(s){
  return (typeof normalizeMpNom === 'function') ? normalizeMpNom(s)
    : String(s||'').trim().toLowerCase();
}
function _maFiche(ing){
  const L = (typeof GP_INGREDIENTS !== 'undefined' ? GP_INGREDIENTS : []) || [];
  if(ing && ing.id){
    const byId = L.find(i => i.id === ing.id);
    if(byId) return byId;
  }
  const n = _maNormNom(ing && ing.nom);
  if(!n) return null;
  return L.find(i => _maNormNom(i.nom) === n) || null;
}

// Coût d'une tonne pour une formule. `sansPrix` liste les MP comptées à 0 F :
// sans ce signalement, une marge trop belle passerait pour un bon résultat.
function _maCoutTonne(f){
  let mpKg = 0;
  const sansPrix = [];
  (f.ingredients || []).forEach(ing => {
    const fiche = _maFiche(ing);
    const prix = Number(fiche && fiche.prix_actuel || 0);
    const pct = Number(ing.pct || 0);
    if(pct > 0 && (!fiche || prix <= 0)) sansPrix.push((fiche && fiche.nom) || ing.nom || '?');
    mpKg += (pct / 100) * prix;
  });
  const embKg = f.avec_emballage !== false ? Number(f.cout_emballage_kg || 0) : 0;
  const moTonne = Number(f.cout_mo_tonne || 0);
  return {
    mp: mpKg * 1000,
    transfo: embKg * 1000 + moTonne,
    revient: mpKg * 1000 + embKg * 1000 + moTonne,
    sansPrix: sansPrix
  };
}

function _maLignes(){
  return (FORMULES_SADARI || []).map(f => {
    const c = _maCoutTonne(f);
    const gros = Number((typeof GP_PRIX_GROS !== 'undefined' && GP_PRIX_GROS[f.nom]) || 0) * 1000;
    const detail = Number((typeof getPrix === 'function' ? getPrix(f.nom) : 0) || 0) * 1000;
    return {
      nom: f.nom, espece: f.espece || '',
      mp: c.mp, transfo: c.transfo, revient: c.revient, sansPrix: c.sansPrix,
      gros: gros, margeGros: gros > 0 ? gros - c.revient : null,
      detail: detail, margeDetail: detail > 0 ? detail - c.revient : null
    };
  }).sort((a, b) => {
    // Les moins rentables en premier. Une formule sans prix de gros n'est pas
    // comparable : elle part en fin de tableau plutôt qu'en tête à 0.
    if(a.margeGros === null && b.margeGros === null) return a.nom.localeCompare(b.nom);
    if(a.margeGros === null) return 1;
    if(b.margeGros === null) return -1;
    return a.margeGros - b.margeGros;
  });
}

function renderMargeAliment(){
  const el = document.getElementById('marge-aliment');
  if(!el) return;
  if(GP_ROLE !== 'admin'){ el.innerHTML = ''; return; }

  const L = _maLignes();
  if(!L.length){
    el.innerHTML = '<div style="font-size:12px;color:var(--textm);padding:10px">Aucune formule active.</div>';
    return;
  }

  const perte = L.filter(r => r.margeGros !== null && r.margeGros < 0);
  const incomplets = L.filter(r => r.sansPrix.length);
  const sansGros = L.filter(r => !r.gros);
  const mpSansPrix = [...new Set(incomplets.reduce((a, r) => a.concat(r.sansPrix), []))];

  const cell = v => (v === null || v === undefined)
    ? '<span style="color:var(--textm)">—</span>'
    : fmt(Math.round(v));
  const marge = (v, base) => {
    if(v === null) return '<span style="color:var(--textm)">—</span>';
    const col = v >= 0 ? 'var(--green)' : 'var(--red)';
    const tx = base > 0 ? ((v / base) * 100).toFixed(1) + ' %' : '—';
    return '<span style="color:' + col + ';font-weight:700">' + fmt(Math.round(v)) + '</span>'
      + '<div style="font-size:9px;color:' + col + '">' + tx + '</div>';
  };

  const alertePerte = perte.length
    ? '<div style="background:rgba(239,68,68,.10);border:1px solid rgba(239,68,68,.35);border-radius:8px;padding:8px 10px;margin-bottom:8px;font-size:11px;color:var(--red)">'
      + '🚨 <b>' + perte.length + ' formule' + (perte.length > 1 ? 's' : '') + ' vendue' + (perte.length > 1 ? 's' : '')
      + ' à perte au prix de gros</b> : ' + perte.map(r => r.nom).join(', ') + '.</div>'
    : '';
  const alertePrix = mpSansPrix.length
    ? '<div style="background:rgba(232,197,71,.10);border:1px solid rgba(232,197,71,.4);border-radius:8px;padding:8px 10px;margin-bottom:8px;font-size:11px;color:var(--gold)">'
      + '⚠ <b>' + incomplets.length + ' formule' + (incomplets.length > 1 ? 's' : '') + '</b> contien'
      + (incomplets.length > 1 ? 'nent' : 't') + ' une MP sans prix (comptée 0 F) : ' + mpSansPrix.join(', ')
      + ' — leur marge est <b>surévaluée</b>.</div>'
    : '';
  const noteGros = sansGros.length
    ? '<div style="font-size:11px;color:var(--textm);margin-bottom:8px">' + sansGros.length + ' formule'
      + (sansGros.length > 1 ? 's' : '') + ' sans prix de gros renseigné, classée'
      + (sansGros.length > 1 ? 's' : '') + ' en fin de tableau.</div>'
    : '';

  const lignes = L.map(r => '<tr>'
    + '<td style="font-weight:600">' + r.nom
      + (r.sansPrix.length ? ' <span style="color:var(--gold)" title="MP sans prix : ' + r.sansPrix.join(', ') + '">⚠</span>' : '')
    + '</td>'
    + '<td class="num" style="color:var(--textm)">' + cell(r.mp) + '</td>'
    + '<td class="num" style="color:var(--textm)">' + cell(r.transfo) + '</td>'
    + '<td class="num" style="color:var(--gold);font-weight:700" title="Prix en dessous duquel cette formule est vendue à perte">' + cell(r.revient) + '</td>'
    + '<td class="num">' + cell(r.gros || null) + '</td>'
    + '<td class="num">' + marge(r.margeGros, r.gros) + '</td>'
    + '<td class="num" style="color:var(--textm)">' + cell(r.detail || null) + '</td>'
    + '<td class="num">' + marge(r.margeDetail, r.detail) + '</td>'
    + '</tr>').join('');

  el.innerHTML =
    '<div style="font-size:11px;color:var(--textm);margin-bottom:8px">'
      + 'Coût recalculé en direct depuis la composition et le prix du jour de chaque matière première. '
      + 'Modifie un prix dans <b>Matières premières</b> et ces marges suivent. Transport exclu (facturé au lot).</div>'
    + alertePerte + alertePrix + noteGros
    + '<div style="overflow-x:auto"><table class="tbl" style="font-size:11px"><thead><tr>'
      + '<th>Formule</th><th class="num">Coût MP/t</th><th class="num">Transfo/t</th>'
      + '<th class="num">Prix plancher/t</th><th class="num">Gros/t</th><th class="num">Marge gros/t</th>'
      + '<th class="num">Détail/t</th><th class="num">Marge détail/t</th>'
    + '</tr></thead><tbody>' + lignes + '</tbody></table></div>';
}

// ── EXPORTS ───────────────────────────────────────
function exportMargeAliment(type){
  const L = _maLignes();
  if(!L.length){ if(typeof notify === 'function') notify('Aucune formule à exporter', 'r'); return; }
  const cols = [
    {label:'Formule', key:'nom'},
    {label:'Espèce', key:'espece'},
    {label:'Coût MP / t (F)', render:r=>Math.round(r.mp)},
    {label:'Transformation / t (F)', render:r=>Math.round(r.transfo)},
    {label:'Prix plancher / t (F)', render:r=>Math.round(r.revient)},
    {label:'Prix gros / t (F)', render:r=>r.gros?Math.round(r.gros):''},
    {label:'Marge gros / t (F)', render:r=>r.margeGros===null?'':Math.round(r.margeGros)},
    {label:'Marge gros (%)', render:r=>(r.margeGros===null||!r.gros)?'':((r.margeGros/r.gros)*100).toFixed(1)},
    {label:'Prix détail / t (F)', render:r=>r.detail?Math.round(r.detail):''},
    {label:'Marge détail / t (F)', render:r=>r.margeDetail===null?'':Math.round(r.margeDetail)},
    {label:'MP sans prix', render:r=>r.sansPrix.join(', ')}
  ];
  const mpSansPrix = [...new Set(L.reduce((a, r) => a.concat(r.sansPrix), []))];
  const st = 'Prix des MP au ' + today() + ' · transport exclu'
    + (mpSansPrix.length ? ' · comptées à 0 F : ' + mpSansPrix.join(', ') : '');
  const fn = 'marge_par_tonne_' + today();
  if(type === 'pdf') gpExportPDF('Marge par tonne d\'aliment', cols, L, fn + '.pdf', st);
  else gpExportExcel('Marge par tonne', cols, L, fn + '.xlsx');
}
