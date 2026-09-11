// ══════════════════════════════════════════════════
// PROVENDA — PRIX DE VENTE DES MATIÈRES PREMIÈRES
//
// ⚠️ POURQUOI CE MODULE EXISTE.
// À la vente, l'app pré-remplissait le prix avec `prix_actuel` — le prix
// d'ACHAT, mis à jour tout seul à chaque réception (achats.js). La ligne
// annonçait « Prix d'achat : 690 F/kg » et posait 690 dans le champ « Prix/kg ».
// Sans intervention, la matière partait à prix coûtant, marge zéro, en silence.
// Le prix de vente est désormais une donnée à part entière : saisie une fois,
// affichée en rouge au moment de vendre.
//
// DEUX PRIX, PAS UN : les matières se vendent au sac ET au kilo, et le sac
// n'est presque jamais au même tarif au kilo. Le poids du sac vit sur la fiche :
// le maïs se vend en 50 kg, le prémix en 25.
// ══════════════════════════════════════════════════

// Une fiche est « renseignée » dès qu'un des deux prix existe : vendre au kilo
// sans vendre au sac est un cas normal (une matière qu'on ne conditionne pas).
function pvRenseigne(ing) {
  return !!ing && (ing.prix_vente_kg != null || ing.prix_vente_sac != null);
}

function pvNum(v) {
  if (v === '' || v == null) return null;
  const n = Number(String(v).replace(',', '.'));
  return isNaN(n) ? null : n;
}

// LE PRIX APPLICABLE selon le conditionnement choisi à la vente.
// Le tarif « au sac » ne vaut que pour le sac ENTIER de la matière : vendre
// 25 kg d'une matière conditionnée en 50 ne donne pas droit au prix du sac,
// sinon le tarif de gros s'appliquerait à une demi-quantité.
function pvPrixKg(ing, cond) {
  if (!ing) return null;
  const kg = pvNum(ing.prix_vente_kg);
  if (cond === 'kg' || cond == null || cond === '') return kg;
  const poidsFiche = pvNum(ing.poids_sac_kg);
  const sac = pvNum(ing.prix_vente_sac);
  if (sac != null && poidsFiche > 0 && Number(cond) === poidsFiche) return sac / poidsFiche;
  return kg;
}

// ── FICHE DE PRIX ─────────────────────────────────────────────────────────
function ouvrirPrixVente(id) {
  const ing = (GP_INGREDIENTS || []).find(i => i.id === id);
  if (!ing) { notify('Matière première introuvable', 'r'); return; }
  const m = document.getElementById('modal-prixvente');
  if (!m) { notify('Recharge la page (Ctrl+Shift+R)', 'r'); return; }
  document.getElementById('pv-id').value = ing.id;
  document.getElementById('pv-titre').textContent = ing.nom || '—';
  document.getElementById('pv-achat').textContent = ing.prix_actuel
    ? `${fmt(ing.prix_actuel)} F/kg` : 'non renseigné';
  document.getElementById('pv_kg').value = ing.prix_vente_kg != null ? ing.prix_vente_kg : '';
  // 50 kg par défaut : c'est le conditionnement le plus courant ici. Le prémix
  // en 25 kg est l'exception, et elle se saisit.
  document.getElementById('pv_poids').value = ing.poids_sac_kg != null ? ing.poids_sac_kg : 50;
  document.getElementById('pv_sac').value = ing.prix_vente_sac != null ? ing.prix_vente_sac : '';
  document.getElementById('pv-err').textContent = '';
  pvApercu();
  m.style.display = 'flex';
}

function fermerPrixVente() {
  const m = document.getElementById('modal-prixvente');
  if (m) m.style.display = 'none';
}

// L'aperçu vivant : il traduit le prix du sac en prix au kilo et le compare au
// coût. C'est là qu'une vente à perte se voit AVANT d'être enregistrée.
function pvApercu() {
  const el = document.getElementById('pv-apercu');
  if (!el) return;
  const id = document.getElementById('pv-id')?.value;
  const ing = (GP_INGREDIENTS || []).find(i => i.id === id) || {};
  const achat = pvNum(ing.prix_actuel) || 0;
  const kg = pvNum(document.getElementById('pv_kg')?.value);
  const poids = pvNum(document.getElementById('pv_poids')?.value) || 0;
  const sac = pvNum(document.getElementById('pv_sac')?.value);

  const bouts = [];
  const perte = [];
  if (kg != null) {
    bouts.push(`Au kilo : <b>${fmt(kg)} F/kg</b>`);
    if (achat > 0 && kg < achat) perte.push(`au kilo (${fmt(kg)} < ${fmt(achat)})`);
  }
  if (sac != null && poids > 0) {
    const parKg = sac / poids;
    bouts.push(`Au sac : <b>${fmt(sac)} F</b> le sac de ${fmt(poids)} kg — soit <b>${fmt(Math.round(parKg))} F/kg</b>`);
    if (achat > 0 && parKg < achat) perte.push(`au sac (${fmt(Math.round(parKg))} < ${fmt(achat)})`);
  }
  if (!bouts.length) { el.innerHTML = ''; return; }

  let html = `<div>${bouts.join('<br>')}</div>`;
  if (achat > 0 && kg != null && sac != null && poids > 0) {
    const marge = kg - achat, margeSac = (sac / poids) - achat;
    html += `<div style="margin-top:6px;opacity:.85">Marge : ${fmt(Math.round(marge))} F/kg au détail · ${fmt(Math.round(margeSac))} F/kg au sac</div>`;
  }
  if (perte.length) {
    html += `<div style="margin-top:6px;color:var(--red);font-weight:700">⚠️ Vente À PERTE ${perte.join(' et ')} — le prix d'achat est de ${fmt(achat)} F/kg.</div>`;
  }
  el.innerHTML = html;
}

async function savePrixVente() {
  if (GP_ROLE !== 'admin') { notify("Seul l'admin fixe les prix de vente", 'r'); return; }
  const id = document.getElementById('pv-id')?.value;
  const err = document.getElementById('pv-err');
  if (!id) return;

  const kg = pvNum(document.getElementById('pv_kg')?.value);
  const poids = pvNum(document.getElementById('pv_poids')?.value);
  const sac = pvNum(document.getElementById('pv_sac')?.value);

  if (kg != null && kg < 0) { err.textContent = 'Le prix au kilo ne peut pas être négatif.'; return; }
  if (sac != null && sac < 0) { err.textContent = 'Le prix au sac ne peut pas être négatif.'; return; }
  // Un prix au sac sans poids ne veut rien dire : on ne saurait pas le ramener
  // au kilo, ni savoir quel conditionnement y donne droit.
  if (sac != null && !(poids > 0)) {
    err.textContent = "Indiquez le poids du sac : sans lui, un prix « au sac » n'est pas interprétable.";
    return;
  }
  if (poids != null && poids > 0 && (poids < 1 || poids > 200)) {
    err.textContent = `Un sac de ${poids} kg est improbable. Vérifiez.`;
    return;
  }
  if (kg == null && sac == null) {
    err.textContent = 'Renseignez au moins un des deux prix.';
    return;
  }

  const { error } = await SB.from('gp_ingredients')
    .update({ prix_vente_kg: kg, prix_vente_sac: sac, poids_sac_kg: poids })
    .eq('id', id).eq('admin_id', GP_ADMIN_ID);
  if (error) { err.textContent = 'Erreur : ' + error.message; return; }

  const ing = (GP_INGREDIENTS || []).find(i => i.id === id);
  if (ing) { ing.prix_vente_kg = kg; ing.prix_vente_sac = sac; ing.poids_sac_kg = poids; }
  fermerPrixVente();
  notify('Prix de vente enregistré ✓', 'gold');
  if (typeof renderMatieresPremieres === 'function') renderMatieresPremieres();
}
