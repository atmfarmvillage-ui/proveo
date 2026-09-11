// ══════════════════════════════════════════════════
// PROVENDA — DÉTECTION DES MISES À JOUR
//
// ⚠️ POURQUOI CE FICHIER EXISTE.
// L'app croyait déjà prévenir : `index.html` écoute `updatefound` du service
// worker et appelle `afficherBanniereMAJ('nouvelle')`. Deux défauts empilés :
//
//   1. `updatefound` ne part que si le FICHIER `sw.js` change d'octets. Or il
//      n'a pas bougé depuis des mois — les livraisons touchent les scripts,
//      jamais le worker. L'événement ne s'est donc jamais produit.
//   2. `afficherBanniereMAJ` n'était définie NULLE PART. La garde
//      `typeof === 'function'` avalait l'absence sans un mot.
//
// Résultat : personne n'a jamais été prévenu d'une mise à jour, et il fallait
// un Ctrl+Shift+R manuel — impossible dans l'app installée, où le raccourci
// n'existe pas.
//
// LA MÉTHODE RETENUE ne dépend ni du worker ni d'un numéro de version à tenir
// à jour à la main : on relit `index.html` depuis le réseau et on compare la
// LISTE DES SCRIPTS ET DE LEURS `?v=` avec celle de la page ouverte. Ces
// numéros changent à chaque livraison — c'est le rituel de déploiement. Rien
// de plus à maintenir, et aucune discipline supplémentaire à tenir.
// ══════════════════════════════════════════════════

// La signature d'une version = les scripts chargés, avec leur `?v=`.
function majSignatureLocale() {
  return Array.from(document.scripts)
    .map(s => s.getAttribute('src') || '')
    .filter(s => /\.js\?v=/.test(s))
    .join('|');
}

function majSignatureHtml(html) {
  return (html.match(/[\w./-]+\.js\?v=[\w.]+/g) || []).join('|');
}

// Signature déjà signalée : on ne remontre pas la même bannière en boucle.
let MAJ_SIGNALEE = null;
let MAJ_EN_COURS = false;

async function majVerifier() {
  if (MAJ_EN_COURS || document.getElementById('maj-banniere')) return;
  MAJ_EN_COURS = true;
  try {
    const url = location.origin + location.pathname + '?_maj=' + Date.now();
    const r = await fetch(url, { cache: 'no-store' });
    if (!r.ok) return;
    const distante = majSignatureHtml(await r.text());
    const locale = majSignatureLocale();
    // Une signature vide des deux côtés ne prouve rien : on se tait plutôt que
    // d'annoncer une mise à jour imaginaire.
    if (!distante || !locale || distante === locale) return;
    if (distante === MAJ_SIGNALEE) return;
    MAJ_SIGNALEE = distante;
    afficherBanniereMAJ('nouvelle');
  } catch (e) {
    // Hors ligne, ou serveur muet : ce n'est pas une mise à jour, c'est une
    // absence de réponse. On ne dérange personne.
  } finally {
    MAJ_EN_COURS = false;
  }
}

// ── LA BANNIÈRE ───────────────────────────────────────────────────────────
// Appelée aussi par `updatefound` dans index.html : les deux chemins mènent
// ici, celui qui se déclenche le premier gagne.
function afficherBanniereMAJ() {
  if (document.getElementById('maj-banniere')) return;
  const b = document.createElement('div');
  b.id = 'maj-banniere';
  b.style.cssText = 'position:fixed;left:0;right:0;bottom:0;z-index:9998;'
    + 'background:var(--g6,#16A34A);color:#fff;padding:11px 14px;'
    + 'display:flex;align-items:center;justify-content:center;gap:12px;'
    + 'flex-wrap:wrap;font-size:13px;box-shadow:0 -3px 14px rgba(0,0,0,.22)';
  b.innerHTML =
    '<span>✨ <b>Une nouvelle version de PROVENDA est disponible.</b></span>'
    + '<button id="maj-appliquer" style="background:#fff;color:#16A34A;border:none;'
    + 'border-radius:7px;padding:7px 16px;font-weight:700;cursor:pointer;font-size:13px">'
    + 'Mettre à jour</button>'
    + '<button id="maj-plus-tard" style="background:none;color:#fff;border:1px solid rgba(255,255,255,.55);'
    + 'border-radius:7px;padding:7px 12px;cursor:pointer;font-size:12px">Plus tard</button>';
  document.body.appendChild(b);
  document.getElementById('maj-appliquer').onclick = appliquerMAJ;
  document.getElementById('maj-plus-tard').onclick = () => b.remove();
}

// Recharger ne suffit pas toujours : dans l'app installée, le service worker
// peut resservir l'ancienne coquille. On vide ses caches et on le force à se
// mettre à jour AVANT de recharger — c'est la seule manœuvre qui marche sans
// Ctrl+Shift+R, lequel n'existe pas en mode installé.
async function appliquerMAJ() {
  const btn = document.getElementById('maj-appliquer');
  if (btn) { btn.textContent = 'Mise à jour…'; btn.disabled = true; }
  try {
    if ('serviceWorker' in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map(r => r.update().catch(() => {})));
    }
    if (window.caches) {
      const cles = await caches.keys();
      await Promise.all(cles.map(k => caches.delete(k)));
    }
  } catch (e) {
    // Un cache qu'on n'arrive pas à vider ne doit pas empêcher de recharger :
    // les scripts sont de toute façon versionnés par `?v=`.
  }
  location.reload();
}

// ── QUAND VÉRIFIER ────────────────────────────────────────────────────────
// Au démarrage (une fois la page installée), au retour dans l'app — le cas
// courant sur téléphone, où l'on revient sans jamais fermer — et toutes les
// 15 minutes pour les postes qui restent ouverts la journée.
(function majPlanifier() {
  const demarrer = () => {
    setTimeout(majVerifier, 8000);
    setInterval(majVerifier, 15 * 60 * 1000);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') majVerifier();
    });
  };
  if (document.readyState === 'complete') demarrer();
  else window.addEventListener('load', demarrer);
})();
