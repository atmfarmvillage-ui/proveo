// ═══════════════════════════════════════════════════════════════════════════
// LISIBILITÉ TABLETTE & MOBILE — défilement horizontal automatique des tableaux.
//
// Le problème constaté sur tablette : la première colonne d'un tableau de huit
// colonnes se réduisait à trois caractères, et le texte se cassait lettre par
// lettre (« Blé tend re (INR A 80) »).
//
// La cause était double : aucun des 91 tableaux de l'app n'était placé dans un
// conteneur défilant — la classe `.tbl-wrap` existait dans le CSS mais n'était
// utilisée nulle part — et la règle `word-break:break-word` coupait alors À
// L'INTÉRIEUR des mots pour tenir dans la largeur disponible.
//
// Plutôt que d'éditer 91 emplacements (et d'oublier les prochains), on enveloppe
// ici tout tableau qui ne l'est pas encore. Un tableau doit DÉFILER, jamais
// écraser ses colonnes : mieux vaut glisser du doigt que lire une lettre par
// ligne.
//
// L'observateur suit les rendus dynamiques : dans cette app, les écrans
// réécrivent leur innerHTML en permanence.
// ═══════════════════════════════════════════════════════════════════════════
(function () {
  'use strict';

  // Un tableau déjà dans un conteneur qui défile n'a pas besoin de nous :
  // 38 tableaux portent déjà un `overflow-x:auto` posé à la main.
  function dejaProtege(el) {
    let p = el.parentElement;
    for (let i = 0; p && i < 3; i++, p = p.parentElement) {
      if (p.classList && p.classList.contains('tbl-wrap')) return true;
      try {
        const ox = (p.style && p.style.overflowX) || '';
        if (ox === 'auto' || ox === 'scroll') return true;
        const c = window.getComputedStyle ? window.getComputedStyle(p).overflowX : '';
        if (c === 'auto' || c === 'scroll') return true;
      } catch (e) { /* élément détaché : on continue */ }
    }
    return false;
  }

  function envelopper(root) {
    const cible = (root && root.querySelectorAll) ? root : document;
    let n = 0;
    cible.querySelectorAll('table.tbl').forEach(function (t) {
      if (t.dataset.wrapped === '1') return;
      t.dataset.wrapped = '1';
      if (dejaProtege(t)) return;
      const w = document.createElement('div');
      w.className = 'tbl-wrap';
      t.parentNode.insertBefore(w, t);
      w.appendChild(t);
      n++;
    });
    return n;
  }

  function demarrer() {
    envelopper(document);
    if (typeof MutationObserver === 'undefined') return;
    // Débounce léger : les écrans réécrivent des blocs entiers d'un coup.
    let enAttente = false;
    const obs = new MutationObserver(function () {
      if (enAttente) return;
      enAttente = true;
      setTimeout(function () { enAttente = false; try { envelopper(document); } catch (e) {} }, 60);
    });
    try { obs.observe(document.body, { childList: true, subtree: true }); } catch (e) {}
  }

  if (document.body) demarrer();
  else document.addEventListener('DOMContentLoaded', demarrer);

  // Exposé pour les écrans qui rendent puis mesurent dans la foulée.
  window.envelopperTableaux = envelopper;
})();
