// ═══════════════════════════════════════════════════════════════════════════
// CATALOGUE DE PRIX — généré depuis la base, jamais ressaisi.
//
// Pourquoi : aujourd'hui le catalogue imprimé et l'app sont deux vérités
// séparées. On change un prix dans Provéo, l'affiche reste à l'ancien — et
// c'est un point de vente qui vend au mauvais prix, découvert des semaines
// plus tard. Générer depuis la source rend cet écart impossible.
//
// Deux catalogues :
//   · ALIMENTS — deux prix par formule (gros / détail), groupés par espèce ;
//   · MATIÈRES PREMIÈRES — un seul prix (gp_ingredients.prix_actuel).
//
// LE CAS DU PORC : sur l'affiche, ses deux colonnes ne sont pas « gros /
// détail » mais « sans premix / avec premix ». C'est une autre nature
// d'information au même endroit. Sans `mode_prix`, le tableau serait juste en
// apparence et faux sur le fond. Confirmé avec le DG : le porc est le seul cas.
//
// L'impression suit le patron de js/print.js : une fenêtre, @media print, et
// le bouton masqué au moment d'imprimer. Le navigateur produit le PDF —
// aucune bibliothèque, rien à installer, marche hors ligne.
// ═══════════════════════════════════════════════════════════════════════════

// Libellés d'affiche par espèce. L'ordre de ce tableau EST l'ordre du
// catalogue : c'est la logique de lecture du document, pas l'alphabet.
const CAT_ESPECES = [
  { cle: 'pondeuse', titre: 'POULE PONDEUSE' },
  { cle: 'chair',    titre: 'POULET DE CHAIR' },
  { cle: 'goliath',  titre: 'GOLIATH' },
  { cle: 'lapin',    titre: 'LAPIN' },
  { cle: 'tilapia',  titre: 'POISSON' },
  { cle: 'porc',     titre: 'PORC' },
  { cle: 'canard',   titre: 'CANARD' },
  { cle: 'betail',   titre: 'BÉTAIL' },
];

const CAT_VERT = '#2f7a4d';
const CAT_VERT_F = '#256140';
const CAT_JAUNE = '#f5c033';

function catEsc(s) {
  return String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}
function catPrix(v) {
  const n = Number(v || 0);
  return n > 0 ? new Intl.NumberFormat('fr-FR').format(Math.round(n)) + 'F' : '-';
}

// ── Chargement ────────────────────────────────────────────────────────────
// On relit la base plutôt que d'utiliser GP_PRIX en mémoire : un catalogue
// doit refléter ce qui est enregistré, pas ce qu'un écran a chargé plus tôt.
async function catChargerAliments() {
  const [rf, rp] = await Promise.all([
    SB.from('gp_formules').select('nom,espece,stade,actif,prix_defaut,poids_sac,ordre,mode_prix').eq('actif', true),
    SB.from('gp_prix_formules').select('formule_nom,prix,prix_gros').eq('admin_id', GP_ADMIN_ID),
  ]);
  // On remonte les erreurs : une requête en échec renverrait une liste vide,
  // indiscernable d'un catalogue sans produit.
  if (rf.error) throw rf.error;
  if (rp.error) throw rp.error;

  const prix = {};
  (rp.data || []).forEach(p => { prix[p.formule_nom] = p; });

  return (rf.data || []).map(f => {
    const p = prix[f.nom] || {};
    const poids = Number(f.poids_sac) || 50;
    // ⚠️ LES PRIX SONT AU KILO. marge_aliment.js les multiplie par 1000 pour
    // obtenir un prix à la tonne — la preuve. L'affiche, elle, annonce le prix
    // du SAC : sans cette multiplication, on imprimerait 370F au lieu de
    // 18 500F. Un catalogue faux d'un facteur 50, distribué en boutique.
    const detailKg = Number(p.prix) || Number(f.prix_defaut) || 0;   // la table des
    const grosKg = Number(p.prix_gros) || 0;                          // prix = exception
    return {
      nom: f.nom,
      espece: (f.espece || '').toLowerCase(),
      poids,
      ordre: Number(f.ordre) || 100,
      mode: f.mode_prix || 'gros_detail',
      gros: grosKg * poids,
      detail: detailKg * poids,
      // Gardés pour l'avertissement : un prix de gros non saisi laisse une
      // colonne vide sur le catalogue, et il vaut mieux le dire.
      _grosKg: grosKg,
    };
  });
}

async function catChargerMP() {
  const r = await SB.from('gp_ingredients')
    .select('nom,prix_actuel,unite,actif').eq('actif', true).order('nom');
  if (r.error) throw r.error;
  return (r.data || []).filter(i => Number(i.prix_actuel) > 0);
}

// ── Rendu d'un bloc espèce ────────────────────────────────────────────────
function catBloc(titre, lignes) {
  if (!lignes.length) return '';
  // Le poids affiché est celui des lignes du bloc ; s'il diffère d'une formule
  // à l'autre, on le montre par ligne plutôt que de mentir dans l'en-tête.
  const poids = [...new Set(lignes.map(l => l.poids))];
  const poidsEntete = poids.length === 1 ? poids[0] + ' KG' : '';
  // Le porc affiche « sans premix / avec premix » à la place de gros/détail.
  const premix = lignes.some(l => l.mode === 'premix');
  const c1 = premix ? 'SANS PREMIX' : 'PRIX DE VENTE<br>EN GROS';
  const c2 = premix ? 'AVEC PREMIX' : 'PRIX DE VENTE<br>EN DÉTAILS';

  return `
  <div class="bloc">
    <div class="bandeau">${catEsc(titre)}</div>
    <table>
      <tr class="ent">
        <td class="poids">${poidsEntete}</td>
        <td class="col">${c1}</td>
        <td class="col">${c2}</td>
      </tr>
      ${lignes.map(l => `
        <tr>
          <td class="nom">${catEsc(l.nom)}${poids.length > 1 ? ` <span class="pds">${l.poids} kg</span>` : ''}</td>
          <td class="val">${catPrix(l.gros)}</td>
          <td class="val">${catPrix(l.detail)}</td>
        </tr>`).join('')}
    </table>
  </div>`;
}

function catStyles() {
  return `
    *{box-sizing:border-box}
    body{margin:0;padding:14px;font-family:'Segoe UI',Arial,sans-serif;background:#fff;color:#1a1a1a}
    .grille{display:grid;grid-template-columns:1fr 1fr;gap:14px;align-items:start}
    .bloc{break-inside:avoid;page-break-inside:avoid;margin-bottom:10px}
    .bandeau{background:${CAT_VERT};color:${CAT_JAUNE};font-weight:800;font-size:13px;
      letter-spacing:.6px;padding:5px 12px;border-radius:3px;text-align:center}
    table{width:100%;border-collapse:collapse;margin-top:3px;font-size:11px}
    td{border:1px solid #fff;padding:4px 7px}
    tr.ent td{background:${CAT_VERT_F};color:#fff;font-size:8.5px;font-weight:700;text-align:center;line-height:1.15}
    tr.ent td.poids{background:transparent;color:#1a1a1a;font-size:12px;font-weight:800;text-align:right;border:none}
    td.nom{background:${CAT_VERT};color:#fff;font-weight:600;width:52%}
    td.val{background:${CAT_VERT_F};color:#fff;text-align:center;font-weight:700;width:24%}
    .pds{opacity:.75;font-weight:400;font-size:9px}
    .pied{margin-top:16px;background:${CAT_VERT};color:#fff;border-radius:4px;padding:10px 14px;
      display:flex;justify-content:space-between;gap:14px;font-size:11px;flex-wrap:wrap}
    .slogan{text-align:center;font-style:italic;font-weight:700;font-size:15px;margin:14px 0 4px}
    .maj{text-align:center;font-size:9px;color:#666;margin-top:6px}
    .barre{text-align:center;margin-bottom:12px}
    button{padding:8px 22px;font-size:13px;cursor:pointer;background:${CAT_VERT};color:#fff;
      border:none;border-radius:5px;font-weight:700}
    @media print{
      button,.barre{display:none!important}
      body{padding:6px}
      @page{size:A4 landscape;margin:8mm}
    }`;
}

function catPied() {
  const d = new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });
  return `
    <div class="slogan">« La marque de l'Excellence »</div>
    <div class="pied">
      <div><b>PASSEZ COMMANDE</b> &nbsp; (00228) 99 31 31 10 &nbsp;/&nbsp; 70 99 20 19</div>
      <div>Boutiques : Amousoukopé · Kara · Zanguera</div>
    </div>
    <div class="maj">Tarifs au ${d} — édités depuis Provéo</div>`;
}

function catOuvrir(titre, corps) {
  const w = window.open('', '_blank', 'width=1100,height=800');
  if (!w) { notify("Le navigateur a bloqué la fenêtre d'impression.", 'r'); return; }
  w.document.write(`<!doctype html><html lang="fr"><head><meta charset="utf-8">
    <title>${catEsc(titre)}</title><style>${catStyles()}</style></head><body>
    <div class="barre"><button onclick="window.print()">🖨️ Imprimer / Enregistrer en PDF</button></div>
    ${corps}</body></html>`);
  w.document.close();
  setTimeout(() => { try { w.print(); } catch (e) {} }, 600);
}

// ── Catalogue ALIMENTS ────────────────────────────────────────────────────
async function catalogueAliments() {
  try {
    notify('Préparation du catalogue…', 'gold');
    const lignes = await catChargerAliments();
    if (!lignes.length) { notify('Aucune formule active avec un prix.', 'r'); return; }

    // Une formule sans prix ne va PAS sur un catalogue client : mieux vaut une
    // ligne absente qu'un tiret que personne ne sait interpréter.
    const utiles = lignes.filter(l => Number(l.gros) > 0 || Number(l.detail) > 0);
    const sansPrix = lignes.length - utiles.length;

    const blocs = CAT_ESPECES.map(e => {
      const l = utiles.filter(x => x.espece === e.cle)
        .sort((a, b) => (a.ordre - b.ordre) || a.nom.localeCompare(b.nom, 'fr'));
      return catBloc(e.titre, l);
    }).filter(Boolean);

    // Une espèce non prévue dans CAT_ESPECES ne doit pas disparaître en silence.
    const connues = new Set(CAT_ESPECES.map(e => e.cle));
    const autres = utiles.filter(x => !connues.has(x.espece));
    if (autres.length) blocs.push(catBloc('AUTRES', autres.sort((a, b) => a.ordre - b.ordre)));

    catOuvrir('Catalogue des prix — Aliments',
      `<div class="grille">${blocs.join('')}</div>${catPied()}`);

    if (sansPrix) notify(`${sansPrix} formule(s) sans prix — non imprimée(s)`, 'gold', 5000);
    // Le prix de gros n'a pas de valeur de base : s'il n'est saisi nulle part,
    // toute la colonne sort en tirets. Mieux vaut le dire que laisser croire
    // à un bug d'impression.
    const sansGros = utiles.filter(l => !(l._grosKg > 0)).length;
    if (sansGros) notify(`${sansGros} formule(s) sans prix de gros — colonne vide`, 'gold', 6000);
  } catch (e) {
    notify('Erreur : ' + (e.message || e), 'r', 5000);
  }
}

// ── Catalogue MATIÈRES PREMIÈRES ──────────────────────────────────────────
// Un seul prix ici (gp_ingredients.prix_actuel), pas deux : c'est le prix de
// reprise, celui qu'on annonce au fournisseur.
async function catalogueMP() {
  try {
    notify('Préparation du catalogue…', 'gold');
    const mp = await catChargerMP();
    if (!mp.length) { notify('Aucune matière première avec un prix.', 'r'); return; }

    const moitie = Math.ceil(mp.length / 2);
    const colonne = (liste) => `
      <div class="bloc">
        <table>
          <tr class="ent"><td class="poids"></td><td class="col">PRIX</td><td class="col">UNITÉ</td></tr>
          ${liste.map(i => `
            <tr>
              <td class="nom">${catEsc(i.nom)}</td>
              <td class="val">${catPrix(i.prix_actuel)}</td>
              <td class="val">${catEsc(i.unite || 'kg')}</td>
            </tr>`).join('')}
        </table>
      </div>`;

    catOuvrir('Catalogue des prix — Matières premières', `
      <div class="bandeau" style="margin-bottom:10px">MATIÈRES PREMIÈRES — PRIX DE REPRISE</div>
      <div class="grille">${colonne(mp.slice(0, moitie))}${colonne(mp.slice(moitie))}</div>
      ${catPied()}`);
  } catch (e) {
    notify('Erreur : ' + (e.message || e), 'r', 5000);
  }
}

window.catalogueAliments = catalogueAliments;
window.catalogueMP = catalogueMP;
