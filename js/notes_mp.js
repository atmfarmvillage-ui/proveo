// ══════════════════════════════════════════════════
// PROVENDA — NOTE TECHNIQUE D'UNE MATIÈRE PREMIÈRE
// Certaines MP ne se versent pas telles quelles : un blend d'arômes se dose
// à 100 g par sac et doit être dilué en cascade, sinon l'arôme se concentre
// sur quelques sacs. Cette consigne vivait dans une conversation ; elle vit
// maintenant sur la fiche, et remonte à l'écran de production — là où
// quelqu'un tient le seau.
// ══════════════════════════════════════════════════

function noteMpTxt(ing){
  return (ing && typeof ing.note_technique === 'string') ? ing.note_technique.trim() : '';
}

function noteMpPeutEditer(){
  return GP_ROLE === 'admin' || (typeof GP_EST_GERANT !== 'undefined' && GP_EST_GERANT);
}

function _noteEchap(s){
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

// Bouton de la ligne MP. Doré quand une consigne existe : on doit la voir sans
// cliquer, sinon personne ne la lit.
function noteMpBouton(ing){
  const a = !!noteMpTxt(ing);
  if(!a && !noteMpPeutEditer()) return '';
  return `<button class="btn btn-out btn-sm" onclick="ouvrirNoteMP('${ing.id}')"
    style="padding:2px 5px;font-size:9px${a?';border-color:var(--gold);color:var(--gold)':''}"
    title="${a?'Consigne de préparation':'Ajouter une consigne de préparation'}">📋</button>`;
}

function ouvrirNoteMP(id){
  const ing = (GP_INGREDIENTS || []).find(i => i.id === id);
  if(!ing){ notify('Matière première introuvable','r'); return; }
  const m = document.getElementById('modal-note-mp');
  if(!m){ notify('Recharge la page (Ctrl+Shift+R)','r'); return; }
  const editable = noteMpPeutEditer();
  document.getElementById('note-mp-id').value = ing.id;
  document.getElementById('note-mp-titre').textContent = ing.nom || '—';
  const txt = noteMpTxt(ing);
  const zone = document.getElementById('note-mp-zone');
  const lect = document.getElementById('note-mp-lecture');
  zone.value = txt;
  zone.style.display = editable ? 'block' : 'none';
  lect.style.display = editable ? 'none' : 'block';
  lect.innerHTML = txt
    ? _noteEchap(txt).replace(/\n/g,'<br>')
    : '<span style="color:var(--textm)">Aucune consigne pour cette matière.</span>';
  document.getElementById('note-mp-actions').style.display = editable ? 'flex' : 'none';
  document.getElementById('note-mp-err').textContent = '';
  m.style.display = 'flex';
}

function fermerNoteMP(){
  const m = document.getElementById('modal-note-mp');
  if(m) m.style.display = 'none';
}

async function saveNoteMP(){
  const id = document.getElementById('note-mp-id').value;
  const err = document.getElementById('note-mp-err');
  const val = (document.getElementById('note-mp-zone').value || '').trim();
  err.textContent = 'Enregistrement…';
  const {error} = await SB.from('gp_ingredients')
    .update({note_technique: val || null}).eq('id', id).eq('admin_id', GP_ADMIN_ID);
  if(error){
    // La colonne peut manquer si la migration n'a pas été jouée : le dire,
    // plutôt que de laisser croire que la consigne est enregistrée.
    err.textContent = /note_technique/.test(error.message)
      ? 'La colonne note_technique n\'existe pas encore — lance la migration SQL.'
      : 'Erreur : ' + error.message;
    return;
  }
  const ing = (GP_INGREDIENTS || []).find(i => i.id === id);
  if(ing) ing.note_technique = val || null;
  err.textContent = '';
  fermerNoteMP();
  notify('Consigne enregistrée ✓','gold');
  if(typeof renderMatieresPremieresPage === 'function') renderMatieresPremieresPage();
}

// Consignes des MP présentes dans un lot de production. `compo` = LOT_COMPO.
function notesLotHtml(compo){
  const vues = new Set(), blocs = [];
  (compo || []).forEach(c => {
    if(!c.id || vues.has(c.id)) return;
    vues.add(c.id);
    const ing = (GP_INGREDIENTS || []).find(i => i.id === c.id);
    const txt = noteMpTxt(ing);
    if(txt) blocs.push(`<div style="margin-bottom:6px"><b>${_noteEchap(ing.nom)}</b><br>${_noteEchap(txt).replace(/\n/g,'<br>')}</div>`);
  });
  if(!blocs.length) return '';
  return `<div style="font-size:10.5px;line-height:1.55;color:var(--text);background:rgba(232,197,71,.10);
    border:1px solid rgba(232,197,71,.35);border-radius:8px;padding:8px 10px;margin-top:8px">
    <div style="font-weight:700;color:var(--gold);margin-bottom:4px">📋 Consignes de préparation</div>
    ${blocs.join('')}</div>`;
}
