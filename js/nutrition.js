// ══════════════════════════════════════════════════
// PROVENDA — VALEURS NUTRITIONNELLES DES MATIÈRES PREMIÈRES
// La fiche de la matière première fait foi pour l'étiquette du sac.
// Avant, une petite table codée en dur devinait les valeurs par le NOM, et tout
// ingrédient inconnu comptait pour ZÉRO sans le dire : un aliment lapin sortait
// à 901 kcal au lieu de 2527, sur un document remis au client avec le RCCM.
// ══════════════════════════════════════════════════

// Repères usuels (matière brute) pour aider à la saisie — jamais imposés.
const NUTRI_REPERES = {
  prot: 'Protéine brute % — maïs 8,5 · blé 11,5 · drèche orge 25 · leucena 22 · concentré 35-40 · tourteau soja 44',
  mg:   'Matière grasse % — maïs 3,8 · huile 99 · tourteau palmiste 7,5',
  cb:   'Cellulose brute % — maïs 2,2 · son de blé 10,5 · leucena 15 · tourteau palmiste 17',
  mm:   'Matière minérale % (cendres) — maïs 1,3 · coquilles 97 · carbonate de calcium 95',
  em:   'Énergie digestible kcal/kg — maïs 3300 · blé 3070 · huile 8800 · coquilles 0',
  ca:   'Calcium % — maïs 0,03 · coquilles 38 · carbonate de calcium 38',
  lys:  'Lysine % — maïs 0,24 · tourteau soja 2,80',
  met:  'Méthionine % — maïs 0,18 · tourteau soja 0,62',
};

const NUTRI_CHAMPS = [
  ['prot','Protéine brute','%'], ['mg','Matière grasse','%'],
  ['cb','Cellulose brute','%'],  ['mm','Matière minérale','%'],
  ['em','Énergie digestible','kcal/kg'], ['ca','Calcium','%'],
  ['lys','Lysine','%'],          ['met','Méthionine','%'],
];

// Une fiche est considérée renseignée dès que la protéine l'est : c'est la valeur
// qu'on ne peut pas ignorer, et elle sert de drapeau au calcul de l'étiquette.
function nutriRenseignee(ing){ return !!ing && ing.nutri_prot != null; }

function ouvrirNutri(id){
  const ing = (GP_INGREDIENTS || []).find(i => i.id === id);
  if(!ing){ notify('Matière première introuvable', 'r'); return; }
  const m = document.getElementById('modal-nutri');
  if(!m){ notify('Recharge la page (Ctrl+Shift+R)', 'r'); return; }
  document.getElementById('nutri-id').value = ing.id;
  document.getElementById('nutri-titre').textContent = ing.nom || '—';
  NUTRI_CHAMPS.forEach(([k]) => {
    const el = document.getElementById('nutri-' + k);
    if(el) el.value = (ing['nutri_' + k] != null) ? ing['nutri_' + k] : '';
  });
  document.getElementById('nutri-err').textContent = '';
  m.style.display = 'flex';
}
function fermerNutri(){ const m = document.getElementById('modal-nutri'); if(m) m.style.display = 'none'; }

async function saveNutri(){
  const id = document.getElementById('nutri-id')?.value;
  const err = document.getElementById('nutri-err');
  if(!id) return;
  const maj = {};
  for(const [k, lib] of NUTRI_CHAMPS){
    const brut = document.getElementById('nutri-' + k)?.value;
    if(brut === '' || brut == null){ maj['nutri_' + k] = null; continue; }
    const v = Number(String(brut).replace(',', '.'));
    if(isNaN(v) || v < 0){ err.textContent = `${lib} : valeur invalide.`; return; }
    // Un pourcentage au-dessus de 100 est une faute de frappe, pas une matière exotique.
    if(k !== 'em' && v > 100){ err.textContent = `${lib} : ${v} % est impossible (maximum 100).`; return; }
    if(k === 'em' && v > 9500){ err.textContent = `Énergie : ${v} kcal/kg dépasse celle d'une huile pure (8800).`; return; }
    maj['nutri_' + k] = v;
  }
  if(maj.nutri_prot == null){ err.textContent = 'La protéine brute est obligatoire : sans elle, la fiche reste incomplète et l\'étiquette refusera de s\'imprimer.'; return; }

  err.textContent = 'Enregistrement…';
  const { error } = await SB.from('gp_ingredients').update(maj).eq('id', id).eq('admin_id', GP_ADMIN_ID);
  if(error){ err.textContent = 'Erreur : ' + error.message; return; }
  const ing = (GP_INGREDIENTS || []).find(i => i.id === id);
  if(ing) Object.assign(ing, maj);
  fermerNutri();
  notify('Valeurs nutritionnelles enregistrées ✓', 'gold');
  if(typeof renderMatieresPremieresPage === 'function') await renderMatieresPremieresPage();
}

// Bandeau d'alerte : combien de matières premières restent sans valeurs.
// Tant qu'il en reste, aucune étiquette contenant l'une d'elles ne peut s'imprimer.
function nutriBandeau(){
  const G = (GP_INGREDIENTS || []).filter(i => i.actif !== false);
  const vides = G.filter(i => !nutriRenseignee(i));
  if(!vides.length) return '';
  const noms = vides.slice(0, 12).map(i => (i.nom || '').replace(/</g, '&lt;')).join(' · ');
  return `<div class="card" style="border:1px solid rgba(239,68,68,.4)">
    <div style="font-weight:700;color:var(--red);font-size:13px">🧪 ${vides.length} matière(s) première(s) sans valeurs nutritionnelles</div>
    <div style="font-size:12px;color:var(--textm);margin-top:4px">
      Toute étiquette contenant l'une d'elles refusera de s'imprimer, plutôt que d'annoncer un chiffre faux au client.
    </div>
    <div style="font-size:11px;color:var(--textm);margin-top:6px">${noms}${vides.length > 12 ? ' …' : ''}</div>
  </div>`;
}
