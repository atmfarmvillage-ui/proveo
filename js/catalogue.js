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
    SB.from('gp_formules').select('nom,nom_commercial,espece,stade,actif,prix_defaut,poids_sac,ordre,mode_prix').eq('actif', true),
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
      // Le nom IMPRIMÉ est le nom de vente quand il existe. Le nom technique
      // est conservé à côté : c'est lui qu'on cite dans les avertissements,
      // sinon on désignerait une ligne que personne ne retrouve dans l'app.
      nom: (f.nom_commercial || '').trim() || f.nom,
      _technique: f.nom,
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

// ── Regroupement par NOM COMMERCIAL ──────────────────────────────
// « LAPIN Repro A » et « LAPIN reproduction B » sont deux RECETTES : deux
// compositions, deux coûts, deux marges. Mais un seul PRODUIT au comptoir —
// le client demande de l'aliment lapin reproduction, pas une recette. Elles
// se fondent donc en une ligne unique sur l'affiche.
// Tant qu'aucun nom commercial n'est saisi, la clé reste le nom de la formule :
// chaque formule garde sa ligne et rien ne change.
function catRegrouper(lignes) {
  const groupes = new Map();
  lignes.forEach(l => {
    // Même clé que l'enregistrement : casse ET espaces multiples ignorés.
    // Plusieurs noms techniques portent de doubles espaces (« LAPIN  Repro A ») ;
    // sans ça, deux écritures du même nom feraient deux lignes sur l'affiche.
    const cle = (l.nom || '').toLowerCase().split(' ').filter(Boolean).join(' ');
    if (!groupes.has(cle)) groupes.set(cle, []);
    groupes.get(cle).push(l);
  });
  return [...groupes.values()].map(m => {
    // La représentante est celle au plus petit `ordre` : c'est elle qui décide
    // de la place de la ligne sur l'affiche, de son espèce et de son poids de
    // sac. Prendre « la première venue » rendrait l'affiche instable d'une
    // impression à l'autre, l'ordre d'une requête n'étant pas garanti.
    const tri = m.slice().sort((a, b) => (a.ordre - b.ordre) || String(a._technique).localeCompare(String(b._technique), 'fr'));
    const rep = tri[0];
    const prix = k => tri.map(x => Number(x[k]) || 0).find(v => v > 0) || 0;
    const distincts = k => new Set(m.map(x => Number(x[k]) || 0).filter(v => v > 0)).size;
    return Object.assign({}, rep, {
      gros: prix('gros'),
      detail: prix('detail'),
      _grosKg: m.some(x => x._grosKg > 0) ? 1 : 0,
      _membres: tri.map(x => x._technique),
      // Deux prix différents sous un même nom de vente, c'est une contradiction :
      // on la signale au lieu d'en imprimer un au hasard.
      _conflit: distincts('detail') > 1 || distincts('gros') > 1,
    });
  });
}

async function catChargerMP() {
  const r = await SB.from('gp_ingredients')
    // ⚠️ LES PRIX DE VENTE, PAS `prix_actuel`. Ce dernier est le prix
    // d'ACHAT, réécrit à chaque réception de marchandise : l'imprimer sur un
    // document client revient à afficher sa marge en boutique.
    .select('nom,prix_vente_kg,prix_vente_sac,poids_sac_kg,unite,actif')
    // ⚠️ `gp_ingredients` porte un admin_id (admin.js:274 filtre dessus). Sans
    // ce scope on s'en remettait à la RLS seule — et on vient de voir, avec les
    // caisses, ce que vaut « la base filtrera bien » quand personne ne le
    // vérifie. Un catalogue client se vérifie deux fois plutôt qu'une.
    .eq('admin_id', GP_ADMIN_ID)
    .eq('actif', true).order('nom');
  if (r.error) throw r.error;
  // Un prix au sac sans poids n'est pas interprétable : on ne saurait ni le
  // ramener au kilo, ni dire à quel conditionnement il donne droit.
  return (r.data || []).map(i => ({
    nom: i.nom,
    kg: Number(i.prix_vente_kg) || 0,
    sac: Number(i.prix_vente_sac) || 0,
    poids: Number(i.poids_sac_kg) || 0,
  })).filter(i => i.kg > 0 || (i.sac > 0 && i.poids > 0));
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
    /* ⚠️ SANS CECI LE CATALOGUE SORT BLANC. Chrome n'imprime pas les fonds
       colorés tant que l'utilisateur ne coche pas « Graphiques d'arrière-plan ».
       Toute la mise en page repose sur des aplats verts : on force le rendu
       plutôt que de compter sur une case à cocher. */
    *{box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact}
    body{margin:0;padding:14px;font-family:'Segoe UI',Arial,sans-serif;background:#fff;color:#1a1a1a;
      -webkit-print-color-adjust:exact;print-color-adjust:exact}
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
    .slogan{text-align:center;font-style:italic;font-weight:700;font-size:15px;margin:14px 0 4px;flex:1}
    .finale{display:flex;align-items:flex-end;justify-content:space-between;gap:22px;margin-top:6px}
    .an{height:74px;width:auto;display:block}
    /* Le porc chevauche la bande verte par le MILIEU, comme sur l'affiche : la
       bande y est vide (téléphone à gauche, boutiques à droite). Hors du flux,
       pour ne pousser aucun texte. */
    .pied{position:relative}
    .an-porc{position:absolute;left:50%;transform:translateX(-50%);bottom:0;height:60px}
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

// La fenêtre du catalogue s'ouvre sur `about:blank` : une adresse relative
// n'y résout pas. On bâtit l'URL complète depuis l'origine de l'app.
const CAT_IMG = location.origin + location.pathname.replace(/[^/]*$/, '') + 'img/';

function catPied() {
  const d = new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });
  // Les animaux sont disposés comme sur l'affiche d'origine : lapin à gauche,
  // volaille à droite du slogan, porc dans la bande verte.
  return `
    <div class="finale">
      <img class="an" src="${CAT_IMG}lapin.png" alt="">
      <div class="slogan">« La marque de l'Excellence »</div>
      <img class="an" src="${CAT_IMG}volaille.png" alt="">
    </div>
    <div class="pied">
      <img class="an an-porc" src="${CAT_IMG}porc.png" alt="">
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
    <div class="barre">
      <button onclick="window.print()">🖨️ Imprimer / Enregistrer en PDF</button>
      <div style="font-size:11px;color:#666;margin-top:6px">
        Si le document sort sans couleurs, coche « Graphiques d'arrière-plan » dans la fenêtre d'impression.
      </div>
    </div>
    ${corps}</body></html>`);
  w.document.close();
  // ⏳ On attend que les images soient chargées. Avec un délai fixe, la boîte
  // d'impression pouvait s'ouvrir avant elles et sortir des cadres vides —
  // sur un document qu'on remet au client. Filet de sécurité à 4 s : une image
  // qui ne répond jamais ne doit pas empêcher d'imprimer les prix.
  const lancer = () => { try { w.print(); } catch (e) {} };
  const imgs = Array.from(w.document.images || []);
  let restant = imgs.length;
  if (!restant) { setTimeout(lancer, 600); return; }
  const fini = () => { if (restant > 0 && --restant === 0) setTimeout(lancer, 150); };
  imgs.forEach(i => { if (i.complete) fini(); else { i.onload = fini; i.onerror = fini; } });
  setTimeout(() => { if (restant > 0) { restant = 0; lancer(); } }, 4000);
}

// ── Catalogue ALIMENTS ────────────────────────────────────────────────────
async function catalogueAliments() {
  try {
    notify('Préparation du catalogue…', 'gold');
    const lignes = catRegrouper(await catChargerAliments());
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
    // Un même nom de vente porté par deux formules à deux prix : l'affiche ne
    // peut en montrer qu'un. On dit lequel et on dit lesquelles, sinon le
    // prix retenu ressemblerait à une erreur d'impression.
    const conflits = utiles.filter(l => l._conflit);
    conflits.forEach(l => notify(
      `« ${l.nom} » : ${(l._membres || []).join(' + ')} n'ont pas le même prix. `
      + `${catPrix(l.detail)} imprimé.`, 'r', 9000));
  } catch (e) {
    notify('Erreur : ' + (e.message || e), 'r', 5000);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// PARTAGE WHATSAPP — le catalogue en TEXTE
//
// Le PDF est fait pour la boutique ; sur WhatsApp, c'est le texte qui circule.
// Il se lit sans ouvrir de fichier, sur n'importe quel téléphone, se transfère
// d'un éleveur à l'autre, et il sort de la base à chaque envoi : il ne peut pas
// être périmé, contrairement à une photo d'affiche qui traîne depuis des mois.
//
// Deux chemins, dans cet ordre :
//   · `navigator.share` — la feuille de partage du téléphone (WhatsApp, SMS…) ;
//   · à défaut, `wa.me` — WhatsApp s'ouvre avec le texte déjà écrit.
// Le presse-papier sert de dernier recours : le texte n'est jamais perdu.
// ═══════════════════════════════════════════════════════════════════════════

function catPrixTxt(v) {
  const n = Number(v || 0);
  return n > 0 ? new Intl.NumberFormat('fr-FR').format(Math.round(n)).replace(/ | /g, ' ') + ' F' : null;
}

// En-tête et pied du message : l'entreprise du compte, jamais un nom en dur —
// Provéo sert plusieurs provenderies.
function catEntete(titre) {
  const cfg = (typeof GP_CONFIG !== 'undefined' && GP_CONFIG) || {};
  const d = new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });
  const l = [`*${(cfg.nom_provenderie || 'Nos prix').toUpperCase()} — ${titre.toUpperCase()}*`, `Prix du ${d}`];
  if (cfg.slogan) l.push(`_${cfg.slogan}_`);
  return l.join('\n');
}
function catPiedTxt() {
  const cfg = (typeof GP_CONFIG !== 'undefined' && GP_CONFIG) || {};
  const l = [];
  const tel = [cfg.telephone, cfg.tel_dirigeant].filter(Boolean).join(' / ');
  if (tel) l.push(`📞 ${tel}`);
  if (cfg.localisation) l.push(`📍 ${cfg.localisation}`);
  return l.join('\n');
}

function catPartager(titre, corps) {
  const texte = [catEntete(titre), '', corps, '', catPiedTxt()].filter(x => x !== null).join('\n').trim();
  // La feuille de partage native demande un clic direct de l'utilisateur : elle
  // est appelée sans await préalable, sinon le navigateur la refuse.
  if (navigator.share) {
    navigator.share({ text: texte }).catch(() => {});
    return;
  }
  const w = window.open('https://wa.me/?text=' + encodeURIComponent(texte), '_blank');
  if (!w) {
    if (navigator.clipboard) navigator.clipboard.writeText(texte).then(
      () => notify('Catalogue copié : colle-le dans WhatsApp', 'gold', 6000),
      () => notify('Autorise les fenêtres pour partager', 'r', 6000));
    else notify('Autorise les fenêtres pour partager', 'r', 6000);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// PARTAGE EN PDF
//
// Le client reçoit un vrai document, qu'il garde, imprime et fait circuler.
// Le message texte l'accompagne : sur WhatsApp, un fichier seul arrive nu.
//
// Trois chemins, dans cet ordre :
//   · `navigator.share` AVEC le fichier — le téléphone ouvre sa feuille de
//     partage, le PDF part dans la conversation ;
//   · à défaut (ordinateur, navigateur sans partage de fichier), le PDF est
//     téléchargé et le message copié : il ne reste qu'à le joindre ;
//   · si l'utilisateur ferme la feuille de partage, on ne fait rien — annuler
//     n'est pas une erreur.
// ═══════════════════════════════════════════════════════════════════════════

const CAT_PDF_VERT = [22, 163, 74];

function catPdfPrix(v) { return catPrixTxt(v) || '—'; }

// Sections du PDF des aliments : une par espèce, en-têtes adaptés au mode de
// vente. Fonction pure — c'est elle qui porte les règles, donc elle se teste.
function catSectionsAliments(lignes, especes) {
  const liste = (lignes || []).slice();
  const connues = new Set((especes || []).map(e => e.cle));
  const section = (titre, l) => {
    if (!l.length) return null;
    // Le porc ne se vend pas en gros/détail mais avec ou sans prémix : garder
    // les mots de l'affiche évite qu'un client compare deux choses différentes.
    const premix = l.some(x => x.mode === 'premix');
    const rows = l.slice()
      .sort((a, b) => (a.ordre - b.ordre) || String(a.nom).localeCompare(String(b.nom), 'fr'))
      .map(x => premix
        ? [x.nom, x.poids ? x.poids + ' kg' : '—', catPdfPrix(x.gros), catPdfPrix(x.detail)]
        : [x.nom, x.poids ? x.poids + ' kg' : '—', catPdfPrix(x.detail), catPdfPrix(x.gros)]);
    return {
      titre,
      entetes: premix ? ['Formule', 'Sac', 'Sans prémix', 'Avec prémix']
                      : ['Formule', 'Sac', 'Détail', 'Gros'],
      // Les PRIX en gras, le reste normal : c'est ce que le client cherche.
      // Chaque tableau décrit ses colonnes, les deux catalogues n'ont pas les
      // mêmes (ici la 2e est un poids, dans les matières c'est un prix).
      // Largeurs FIXES : sans elles chaque espece dimensionnait ses colonnes
      // selon son contenu, et les tableaux ne s'alignaient plus entre eux.
      colonnes: [{ largeur: 74 }, { largeur: 36, halign: 'center' },
                 { largeur: 36, halign: 'right', gras: true },
                 { largeur: 36, halign: 'right', gras: true }],
      rows
    };
  };
  const out = (especes || []).map(e => section(e.titre, liste.filter(x => x.espece === e.cle)));
  const autres = liste.filter(x => !connues.has(x.espece));
  if (autres.length) out.push(section('AUTRES', autres));
  return out.filter(Boolean);
}

function catSectionMP(mp) {
  const rows = (mp || []).map(i => [
    i.nom,
    (i.sac > 0 && i.poids > 0) ? catPdfPrix(i.sac) : '—',
    (i.sac > 0 && i.poids > 0) ? i.poids + ' kg' : '—',
    catPdfPrix(i.kg)
  ]);
  return rows.length ? [{
    titre: null,
    entetes: ['Matière première', 'Le sac', 'Poids', 'Au kilo'],
    colonnes: [{ largeur: 74 }, { largeur: 36, halign: 'right', gras: true },
               { largeur: 36, halign: 'center' },
               { largeur: 36, halign: 'right', gras: true }],
    rows
  }] : [];
}

// Assemble le document. Les nombres passent par `catPrixTxt`, qui remplace
// l'espace insécable de `Intl` : jsPDF ne sait pas la dessiner et la ligne
// sort tronquée.
function catPdfDoc(titre, sections) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const cfg = (typeof GP_CONFIG !== 'undefined' && GP_CONFIG) || {};
  const W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight(), M = 14;
  const d = new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });

  doc.setFont('helvetica', 'bold'); doc.setFontSize(24); doc.setTextColor(0);
  doc.text(String(cfg.nom_provenderie || 'Nos prix').toUpperCase(), M, 22);
  doc.setFontSize(16); doc.setTextColor.apply(doc, CAT_PDF_VERT);
  doc.text(titre, M, 32);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(11); doc.setTextColor(80);
  doc.text('Prix du ' + d, M, 39);
  if (cfg.slogan) { doc.setFontSize(10); doc.text(String(cfg.slogan), M, 45); }
  // Un filet vert épais : il sépare l'en-tête du tableau et donne son bord au document.
  doc.setDrawColor.apply(doc, CAT_PDF_VERT); doc.setLineWidth(0.9);
  doc.line(M, cfg.slogan ? 49 : 43, W - M, cfg.slogan ? 49 : 43);
  doc.setLineWidth(0.2);

  let y = (cfg.slogan ? 49 : 43) + 10;
  sections.forEach(s => {
    if (s.titre) {
      if (y > H - 45) { doc.addPage(); y = 22; }
      doc.setFont('helvetica', 'bold'); doc.setFontSize(13);
      doc.setTextColor.apply(doc, CAT_PDF_VERT);
      doc.text(s.titre, M, y); y += 3;
    }
    // Chaque colonne prend l'alignement et la graisse décrits par sa section.
    const cols = {};
    (s.colonnes || []).forEach((c, i) => {
      cols[i] = {};
      if (c.halign) cols[i].halign = c.halign;
      if (c.gras) cols[i].fontStyle = 'bold';
      if (c.largeur) cols[i].cellWidth = c.largeur;
    });
    doc.autoTable({
      startY: y + 2, head: [s.entetes], body: s.rows, margin: { left: M, right: M },
      theme: 'grid',
      // 12 pt et un filet visible sur chaque case : le catalogue se lit sur un
      // téléphone, souvent dehors. En dessous, les chiffres se confondent.
      styles: {
        fontSize: 12, cellPadding: 3.4, textColor: 25, valign: 'middle',
        lineColor: [120, 140, 120], lineWidth: 0.25, overflow: 'linebreak'
      },
      headStyles: {
        fillColor: CAT_PDF_VERT, textColor: 255, fontStyle: 'bold', fontSize: 12.5,
        halign: 'center', lineColor: [255, 255, 255], lineWidth: 0.25, cellPadding: 3.6
      },
      alternateRowStyles: { fillColor: [235, 244, 236] },
      columnStyles: cols,
      // L'en-tête se répète en haut de chaque page : sans lui, la 2e page est
      // une colonne de chiffres dont on ne sait plus ce qu'ils désignent.
      showHead: 'everyPage'
    });
    y = doc.lastAutoTable.finalY + 10;
  });

  const tel = [cfg.telephone, cfg.tel_dirigeant].filter(Boolean).join(' / ');
  const pied = [tel ? 'Tel : ' + tel : null, cfg.localisation || null].filter(Boolean).join('   |   ');
  const n = doc.internal.getNumberOfPages();
  for (let p = 1; p <= n; p++) {
    doc.setPage(p);
    doc.setDrawColor(200); doc.setLineWidth(0.2); doc.line(M, H - 15, W - M, H - 15);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(100);
    if (pied) doc.text(pied, M, H - 9);
    doc.text(p + '/' + n, W - M, H - 9, { align: 'right' });
  }
  return doc;
}

async function catEnvoyerPdf(doc, fichier, texte) {
  const blob = doc.output('blob');
  if (typeof File === 'function' && navigator.canShare) {
    const f = new File([blob], fichier, { type: 'application/pdf' });
    if (navigator.canShare({ files: [f] })) {
      try { await navigator.share({ files: [f], text: texte }); return; }
      // Fermer la feuille de partage n'est pas un échec : ne rien télécharger.
      catch (e) { if (e && e.name === 'AbortError') return; }
    }
  }
  doc.save(fichier);
  if (navigator.clipboard) { try { await navigator.clipboard.writeText(texte); } catch (_) {} }
  notify('PDF téléchargé — joins-le dans WhatsApp, le message est déjà copié', 'gold', 9000);
}

function catNomFichier(base) {
  const cfg = (typeof GP_CONFIG !== 'undefined' && GP_CONFIG) || {};
  const prov = String(cfg.nom_provenderie || 'Prix').normalize('NFD')
    .replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return `${prov}-${base}-${new Date().toISOString().slice(0, 10)}.pdf`;
}

function catPdfPret() {
  if (typeof window.jspdf === 'undefined' || typeof window.jspdf.jsPDF !== 'function') {
    notify('Lib PDF pas encore chargée — réessaie dans 2 s', 'r', 6000);
    return false;
  }
  return true;
}

async function partagerCatalogueAliments() {
  try {
    if (!catPdfPret()) return;
    const lignes = catRegrouper(await catChargerAliments())
      .filter(l => Number(l.gros) > 0 || Number(l.detail) > 0);
    if (!lignes.length) { notify('Aucune formule active avec un prix.', 'r'); return; }
    const sections = catSectionsAliments(lignes, CAT_ESPECES);
    const doc = catPdfDoc('Prix des aliments', sections);
    await catEnvoyerPdf(doc, catNomFichier('aliments'),
      [catEntete('Prix des aliments'), '', catPiedTxt()].filter(Boolean).join('\n').trim());
  } catch (e) {
    notify('Erreur : ' + (e.message || e), 'r', 5000);
  }
}

async function partagerCatalogueMP() {
  try {
    if (!catPdfPret()) return;
    const mp = await catChargerMP();
    if (!mp.length) { notify("Aucune matière première n'a de prix de VENTE.", 'r', 6000); return; }
    const doc = catPdfDoc('Prix des matières premières', catSectionMP(mp));
    await catEnvoyerPdf(doc, catNomFichier('matieres-premieres'),
      [catEntete('Prix des matières premières'), '', catPiedTxt()].filter(Boolean).join('\n').trim());
  } catch (e) {
    notify('Erreur : ' + (e.message || e), 'r', 5000);
  }
}

// ── Catalogue MATIÈRES PREMIÈRES ──────────────────────────────────────────
// Deux prix : au SAC et au KILO — les matières se vendent des deux façons.
// Le poids du sac varie (maïs 50 kg, prémix 25) : il s'affiche sur la ligne,
// jamais en en-tête, annoncer un poids unique serait faux.
async function catalogueMP() {
  try {
    notify('Préparation du catalogue…', 'gold');
    const mp = await catChargerMP();
    if (!mp.length) {
      notify("Aucune matière première n'a de prix de VENTE. Fixe-les avec le bouton 💰 dans 🌾 Matières Premières.", 'r', 8000);
      return;
    }

    const moitie = Math.ceil(mp.length / 2);
    const colonne = (liste) => `
      <div class="bloc">
        <table>
          <tr class="ent"><td class="poids"></td><td class="col">LE SAC</td><td class="col">AU KILO</td></tr>
          ${liste.map(i => `
            <tr>
              <td class="nom">${catEsc(i.nom)}${i.sac > 0 && i.poids > 0 ? ` <span class="pds">sac ${i.poids} kg</span>` : ''}</td>
              <td class="val">${i.sac > 0 && i.poids > 0 ? catPrix(i.sac) : '-'}</td>
              <td class="val">${catPrix(i.kg)}</td>
            </tr>`).join('')}
        </table>
      </div>`;

    catOuvrir('Catalogue des prix — Matières premières', `
      <div class="bandeau" style="margin-bottom:10px">MATIÈRES PREMIÈRES — PRIX DE VENTE</div>
      <div class="grille">${colonne(mp.slice(0, moitie))}${colonne(mp.slice(moitie))}</div>
      ${catPied()}`);
  } catch (e) {
    notify('Erreur : ' + (e.message || e), 'r', 5000);
  }
}

window.catalogueAliments = catalogueAliments;
window.catalogueMP = catalogueMP;
