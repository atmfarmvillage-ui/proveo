// ═══════════════════════════════════════════════════════════════════════════
// PROVENDA — DEVIS & FACTURES
//
// LE BESOIN, dit par le DG : « le client décide de prendre nos MP, par exemple
// maïs 400 kg, lysine 2 kg, et demande ça peut coûter combien, ou même il
// l'achète. Les secrétaires saisissent ça à la main. »
//
// À la main veut dire : une calculatrice, un prix de mémoire, et un chiffre
// annoncé au téléphone que personne ne retrouve le lendemain. D'où cette page :
// la secrétaire pose le panier, l'application chiffre avec LES PRIX DE VENTE
// DE LA BASE, et le client reçoit un document à son nom.
//
// CE QU'ON NE REFAIT PAS — tout existait déjà, éparpillé :
//   · les prix de vente des MP vivent dans la fiche matière (prixvente.js,
//     `prix_vente_kg` / `prix_vente_sac` / `poids_sac_kg`, lus par pvPrixKg) ;
//   · les prix des aliments viennent de la grille (getPrix, auth.js) ;
//   · l'envoi d'un PDF sur WhatsApp est déjà résolu par catEnvoyerPdf
//     (catalogue.js) : feuille de partage du téléphone, repli téléchargement.
//
// LA RÈGLE QUI COMMANDE TOUT LE RESTE : un devis n'écrit QUE lui-même.
// Pas de sortie de stock, pas de caisse, pas de dette, pas de points. Sept
// chemins touchent déjà le stock et c'est ce qui a produit des soldes faux —
// on n'en ajoute pas un huitième. Quand le client achète pour de bon, le
// panier part dans la page Ventes, qui reste la SEULE route d'une vente.
//
// Décisions du DG (31/10/2026) : facture très simple (ni TVA ni NIF),
// devis valable 7 jours, le panier accepte MP ET aliments, et tout le monde
// peut établir un devis.
// ═══════════════════════════════════════════════════════════════════════════

const DEV_VALIDITE_JOURS = 7;   // les prix MP bougent : la lysine a fait +33 % en 4 mois

let DEV_LIGNES = [];
let DEV_CLIENT = { id: null, nom: '', tel: '' };
let DEV_LISTE  = [];

// ── LE CALCUL (pur, testable hors navigateur) ─────────────────────────────

// Le catalogue vendable : les matières qui ont un prix de vente, et les
// aliments de la grille. Une matière sans prix de vente n'y est PAS : la
// chiffrer reviendrait à la proposer au prix d'achat, donc à perte.
function devCatalogue(ingredients, formules, prixFormules) {
  const out = [];
  (ingredients || []).forEach(i => {
    if (i.actif === false) return;
    if (!(i.prix_vente_kg != null || i.prix_vente_sac != null)) return;
    out.push({
      type: 'mp', id: i.id, nom: i.nom,
      prix_kg: i.prix_vente_kg != null ? Number(i.prix_vente_kg) : null,
      prix_sac: i.prix_vente_sac != null ? Number(i.prix_vente_sac) : null,
      poids_sac: Number(i.poids_sac_kg) || 0,
    });
  });
  (formules || []).forEach(f => {
    const p = Number((prixFormules || {})[f.nom] || f.prix_defaut || 0);
    if (!(p > 0)) return;
    out.push({
      type: 'formule', id: f.id || null, nom: f.nom,
      prix_kg: p, prix_sac: null, poids_sac: Number(f.poids_sac) || 0,
    });
  });
  return out.sort((a, b) => String(a.nom).localeCompare(String(b.nom)));
}

// Le prix au kilo applicable. Le tarif « au sac » ne vaut que pour le sac
// ENTIER : 25 kg d'une matière conditionnée en 50 n'y donnent pas droit.
function devPrixKg(produit, unite) {
  if (!produit) return null;
  if (unite === 'sac' && produit.prix_sac != null && produit.poids_sac > 0) {
    return produit.prix_sac / produit.poids_sac;
  }
  return produit.prix_kg != null ? produit.prix_kg : null;
}

// Une ligne du panier. `quantite` est exprimée dans `unite` ; tout est ramené
// au kilo, parce que c'est la seule unité commune aux MP et aux aliments.
function devLigneCalc(produit, quantite, unite, prixKgForce) {
  const q = Number(quantite) || 0;
  const poids = Number(produit && produit.poids_sac) || 0;
  const kg = (unite === 'sac' && poids > 0) ? q * poids : q;
  const prixKg = (prixKgForce != null && prixKgForce !== '')
    ? Number(prixKgForce)
    : devPrixKg(produit, unite);
  if (prixKg == null || !(kg > 0)) return null;
  return {
    type_produit: produit.type,
    ingredient_id: produit.type === 'mp' ? produit.id : null,
    designation: produit.nom,
    quantite: q,
    unite: unite === 'sac' ? 'sac' : 'kg',
    poids_sac: unite === 'sac' ? poids : 0,
    quantite_kg: Math.round(kg * 1000) / 1000,
    prix_kg: Math.round(prixKg * 100) / 100,
    montant_ligne: Math.round(kg * prixKg),
  };
}

function devTotal(lignes) {
  return (lignes || []).reduce((s, l) => s + (Number(l.montant_ligne) || 0), 0);
}

// DV-2026-0007 / FA-2026-0003. Le compteur repart à 1 chaque année, par
// entreprise : deux provenderies ne se marchent pas dessus.
function devNumeroSuivant(type, numerosExistants, annee) {
  const an = annee || new Date().getFullYear();
  const pre = (type === 'facture' ? 'FA' : 'DV') + '-' + an + '-';
  let max = 0;
  (numerosExistants || []).forEach(n => {
    const s = String(n || '');
    if (s.indexOf(pre) !== 0) return;
    const v = parseInt(s.slice(pre.length), 10);
    if (!isNaN(v) && v > max) max = v;
  });
  return pre + String(max + 1).padStart(4, '0');
}

function devValideJusqu(dateISO, jours) {
  const d = new Date((dateISO || new Date().toISOString().slice(0, 10)) + 'T12:00:00');
  d.setDate(d.getDate() + (jours == null ? DEV_VALIDITE_JOURS : jours));
  return d.toISOString().slice(0, 10);
}

// ── LA PAGE ───────────────────────────────────────────────────────────────

function devProduits() {
  return devCatalogue(
    typeof GP_INGREDIENTS !== 'undefined' ? GP_INGREDIENTS : [],
    typeof FORMULES_SADARI !== 'undefined' ? FORMULES_SADARI : [],
    typeof GP_PRIX !== 'undefined' ? GP_PRIX : {}
  );
}

// ── RECHERCHE (le motif de achat_ingr_search, repris tel quel) ───────────
function _devNorm(s) {
  return (typeof normalizeSearch === 'function')
    ? normalizeSearch(s)
    : String(s == null ? '' : s).toLowerCase().normalize('NFD')
        .replace(/\p{Diacritic}/gu, '').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
}

function _devEchappe(s) {
  return String(s == null ? '' : s).replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '&quot;');
}

function _devFermer(id) {
  const el = document.getElementById(id);
  if (el) el.style.display = 'none';
}

function devFiltrerClient() {
  const q = _devNorm(document.getElementById('dev-client')?.value);
  const box = document.getElementById('dev-client-results');
  if (!box) return;
  if (!q) { box.style.display = 'none'; return; }
  const l = ((typeof GP_CLIENTS !== 'undefined' ? GP_CLIENTS : []) || [])
    .filter(c => _devNorm(c.nom).includes(q)).slice(0, 10);
  if (!l.length) { box.style.display = 'none'; return; }
  box.style.display = 'block';
  box.innerHTML = l.map(c => `<div onclick="devChoisirClient('${_devEchappe(c.nom)}','${_devEchappe(c.telephone || '')}')"
      style="padding:8px 12px;cursor:pointer;font-size:12px;border-bottom:1px solid var(--border)"
      onmouseover="this.style.background='rgba(22,163,74,.1)'" onmouseout="this.style.background=''">
      <span style="font-weight:600">${c.nom}</span>
      ${c.telephone ? `<span style="color:var(--textm);margin-left:8px">${c.telephone}</span>` : ''}
    </div>`).join('');
}

function devChoisirClient(nom, tel) {
  const n = document.getElementById('dev-client'); if (n) n.value = nom;
  const t = document.getElementById('dev-tel');    if (t && !t.value && tel) t.value = tel;
  _devFermer('dev-client-results');
}

// Le produit retenu, mémorisé : la case peut contenir une faute de frappe
// sans que le panier se trompe de matière.
let DEV_PRODUIT_SEL = null;

function devFiltrerProduit() {
  const q = _devNorm(document.getElementById('dev-produit')?.value);
  const box = document.getElementById('dev-produit-results');
  DEV_PRODUIT_SEL = null;
  if (!box) return;
  if (!q) { box.style.display = 'none'; devMajUnites(); return; }
  const l = devProduits().filter(p => _devNorm(p.nom).includes(q)).slice(0, 12);
  if (!l.length) { box.style.display = 'none'; devMajUnites(); return; }
  box.style.display = 'block';
  box.innerHTML = l.map(p => {
    const pk = devPrixKg(p, 'kg');
    const stock = p.type === 'mp' ? devStockDe(p.id) : null;
    return `<div onclick="devChoisirProduit('${_devEchappe(p.nom)}')"
      style="padding:8px 12px;cursor:pointer;font-size:12px;border-bottom:1px solid var(--border)"
      onmouseover="this.style.background='rgba(22,163,74,.1)'" onmouseout="this.style.background=''">
      <span style="font-weight:600">${p.type === 'mp' ? '🌾 ' : '🥣 '}${p.nom}</span>
      ${pk != null ? `<span style="color:var(--gold);margin-left:8px;font-weight:700">${fmt(Math.round(pk))} F/kg</span>` : ''}
      ${p.prix_sac != null && p.poids_sac > 0 ? `<span style="color:var(--textm);margin-left:6px">ou ${fmt(p.prix_sac)} F le sac de ${fmt(p.poids_sac)} kg</span>` : ''}
      ${stock != null ? `<span style="margin-left:8px;color:${stock > 0 ? 'var(--g6)' : 'var(--red)'}">· ${fmtKg(Math.max(0, stock))} kg en stock</span>` : ''}
    </div>`;
  }).join('');
}

function devChoisirProduit(nom) {
  const el = document.getElementById('dev-produit'); if (el) el.value = nom;
  DEV_PRODUIT_SEL = devTrouverProduit(nom);
  _devFermer('dev-produit-results');
  devMajUnites();
}

function devTrouverProduit(nom) {
  const n = String(nom || '').trim().toLowerCase();
  if (!n) return null;
  return devProduits().find(p => String(p.nom).trim().toLowerCase() === n) || null;
}

async function renderDevis() {
  if (typeof loadClients === 'function' && (typeof GP_CLIENTS === 'undefined' || !GP_CLIENTS.length)) {
    try { await loadClients(); } catch (_) {}
  }
  // Les niveaux de stock ne sont peuplés que par la page Stock. Si la
  // secrétaire arrive directement ici, l'avertissement « il n'en reste que
  // X kg » ne s'afficherait jamais — une alerte muette ne vaut rien.
  if (!window._stockNiveaux && typeof _fetchAllStockMp === 'function') {
    try { window._stockNiveaux = await _fetchAllStockMp(); } catch (_) {}
  }
  devMajUnites();
  devRenderPanier();
  await devRenderListe();
}

// Quand le produit change : proposer kg ou sac selon ce que la fiche permet,
// et afficher le tarif en clair. Un prix annoncé de mémoire est un prix faux.
function devMajUnites() {
  const p = devTrouverProduit(document.getElementById('dev-produit')?.value);
  const sel = document.getElementById('dev-unite');
  const info = document.getElementById('dev-prix-info');
  if (!sel) return;
  const avantSac = sel.value === 'sac';
  sel.innerHTML = '<option value="kg">kg</option>'
    + (p && p.poids_sac > 0 ? `<option value="sac">sac de ${fmt(p.poids_sac)} kg</option>` : '');
  if (avantSac && p && p.poids_sac > 0) sel.value = 'sac';
  if (!info) return;
  if (!p) { info.innerHTML = ''; return; }
  const pk = devPrixKg(p, sel.value);
  if (pk == null) {
    info.innerHTML = `<span style="color:var(--red);font-weight:700">⚠️ Aucun prix de vente pour « ${p.nom} »</span>`;
    return;
  }
  const auSac = sel.value === 'sac' && p.prix_sac != null && p.poids_sac > 0;
  info.innerHTML = `<span style="color:var(--g6);font-weight:700">💰 ${auSac
    ? `${fmt(p.prix_sac)} F le sac de ${fmt(p.poids_sac)} kg`
    : `${fmt(Math.round(pk))} F/kg`}</span>`
    + (auSac ? `<span style="color:var(--textm)"> (soit ${fmt(Math.round(pk))} F/kg)</span>` : '');
}

function devAjouterLigne() {
  const err = document.getElementById('dev-err');
  if (err) err.textContent = '';
  const nom = document.getElementById('dev-produit')?.value;
  // Celui choisi dans la liste fait foi ; sinon le nom tapé en entier.
  const p = (DEV_PRODUIT_SEL && _devNorm(DEV_PRODUIT_SEL.nom) === _devNorm(nom))
    ? DEV_PRODUIT_SEL : devTrouverProduit(nom);
  if (!p) {
    if (err) err.textContent = '⛔ Choisis un produit dans la liste. '
      + 'Une matière absente n\'a pas de prix de vente : fixe-le dans 🌾 Matières premières.';
    return;
  }
  const qte = Number(document.getElementById('dev-qte')?.value || 0);
  if (!(qte > 0)) { if (err) err.textContent = '⛔ Indique une quantité.'; return; }
  const unite = document.getElementById('dev-unite')?.value || 'kg';
  const prixManuel = document.getElementById('dev-prix-manuel')?.value;
  const ligne = devLigneCalc(p, qte, unite, prixManuel);
  if (!ligne) { if (err) err.textContent = '⛔ Aucun prix de vente pour ce produit — saisis-en un à la main.'; return; }
  ligne.prix_modifie = !!(prixManuel !== '' && prixManuel != null
    && Number(prixManuel) !== devPrixKg(p, unite));
  DEV_LIGNES.push(ligne);
  ['dev-produit', 'dev-qte', 'dev-prix-manuel'].forEach(id => {
    const el = document.getElementById(id); if (el) el.value = '';
  });
  DEV_PRODUIT_SEL = null;
  devMajUnites();
  devRenderPanier();
}

function devSupprimerLigne(i) { DEV_LIGNES.splice(i, 1); devRenderPanier(); }
function devViderPanier() { DEV_LIGNES = []; DEV_CLIENT = { id: null, nom: '', tel: '' }; DEV_PRODUIT_SEL = null;
  ['dev-client', 'dev-tel', 'dev-note'].forEach(id => { const e = document.getElementById(id); if (e) e.value = ''; });
  devRenderPanier(); }

// Ce qui reste en stock, pour prévenir — jamais pour bloquer. Un client peut
// commander ce qu'on n'a pas encore : c'est le rôle d'un devis.
function devStockDe(ingredientId) {
  if (!ingredientId) return null;
  const niv = window._stockNiveaux;
  if (!niv || !niv.length) return null;
  let net = 0;
  niv.forEach(m => {
    if (m.ingredient_id !== ingredientId) return;
    net += (m.type === 'entree' ? 1 : -1) * Number(m.quantite || 0);
  });
  return net;
}

function devStockDispo(ligne) {
  if (ligne.type_produit !== 'mp') return null;
  return devStockDe(ligne.ingredient_id);
}

function devRenderPanier() {
  const box = document.getElementById('dev-panier');
  if (!box) return;
  const total = devTotal(DEV_LIGNES);
  box.innerHTML = !DEV_LIGNES.length
    ? '<div style="color:var(--textm);font-size:12px;padding:10px">Panier vide — ajoute une matière ou un aliment.</div>'
    : `<table class="tbl" style="font-size:11.5px">
      <thead><tr><th>Désignation</th><th class="num">Quantité</th><th class="num">Prix/kg</th><th class="num">Montant</th><th></th></tr></thead>
      <tbody>
      ${DEV_LIGNES.map((l, i) => {
        const dispo = devStockDispo(l);
        const manque = dispo != null && dispo < l.quantite_kg - 0.01;
        return `<tr>
          <td style="font-weight:600">${l.type_produit === 'mp' ? '🌾 ' : '🥣 '}${l.designation}
            ${l.prix_modifie ? '<span class="badge bdg-gold" style="font-size:8px;margin-left:4px">prix modifié</span>' : ''}
            ${manque ? `<div style="font-size:9px;color:var(--red);font-weight:700">⚠ il n'en reste que ${fmt(Math.max(0, dispo))} kg en stock</div>` : ''}
          </td>
          <td class="num">${fmt(l.quantite)} ${l.unite === 'sac' ? `sac${l.quantite > 1 ? 's' : ''} de ${fmt(l.poids_sac)} kg` : 'kg'}
            ${l.unite === 'sac' ? `<div style="font-size:9px;color:var(--textm)">${fmt(l.quantite_kg)} kg</div>` : ''}</td>
          <td class="num">${fmt(Math.round(l.prix_kg))} F</td>
          <td class="num" style="font-weight:700">${fmt(l.montant_ligne)} F</td>
          <td class="num"><button class="btn btn-red btn-sm" onclick="devSupprimerLigne(${i})" style="padding:2px 6px">🗑</button></td>
        </tr>`;
      }).join('')}
      <tr style="font-weight:800;font-size:13px"><td colspan="3">TOTAL</td>
        <td class="num" style="color:var(--gold)">${fmt(total)} F</td><td></td></tr>
      </tbody></table>`;
  const t = document.getElementById('dev-total');
  if (t) t.textContent = fmt(total) + ' F';
}

// ── ENREGISTREMENT ────────────────────────────────────────────────────────

function devLireClient() {
  const nom = (document.getElementById('dev-client')?.value || '').trim();
  const tel = (document.getElementById('dev-tel')?.value || '').trim();
  const connu = ((typeof GP_CLIENTS !== 'undefined' ? GP_CLIENTS : []) || [])
    .find(c => String(c.nom || '').trim().toLowerCase() === nom.toLowerCase());
  return { id: connu ? connu.id : null, nom, tel: tel || (connu ? connu.telephone : '') || '' };
}

// Le téléphone d'un client connu se remplit tout seul : une secrétaire qui le
// retape se trompe un jour sur deux, et le devis part chez quelqu'un d'autre.
function devClientChange() {
  const c = devLireClient();
  const t = document.getElementById('dev-tel');
  if (t && !t.value && c.tel) t.value = c.tel;
}

async function devEnregistrer(type) {
  const err = document.getElementById('dev-err');
  if (err) err.textContent = '';
  const cli = devLireClient();
  if (!cli.nom) { if (err) err.textContent = '⛔ Mets au moins le nom du client.'; return null; }
  if (!DEV_LIGNES.length) { if (err) err.textContent = '⛔ Le panier est vide.'; return null; }

  const date = (typeof today === 'function') ? today() : new Date().toISOString().slice(0, 10);
  const an = new Date(date).getFullYear();
  // Numéro : on relit les numéros de l'année et on prend le suivant. L'index
  // unique en base tranche si deux secrétaires enregistrent au même instant —
  // on réessaie alors, au lieu de laisser l'erreur à l'écran.
  for (let essai = 0; essai < 3; essai++) {
    let numeros = [];
    try {
      const { data } = await SB.from('gp_devis').select('numero')
        .eq('admin_id', GP_ADMIN_ID).like('numero', '%-' + an + '-%');
      numeros = (data || []).map(d => d.numero);
    } catch (_) {}
    const numero = devNumeroSuivant(type, numeros, an);
    const entete = {
      admin_id: GP_ADMIN_ID, numero, type,
      client_id: cli.id, client_nom: cli.nom, client_tel: cli.tel || null,
      date, valable_jusqu_au: type === 'devis' ? devValideJusqu(date) : null,
      montant_total: devTotal(DEV_LIGNES),
      note: (document.getElementById('dev-note')?.value || '').trim() || null,
      point_vente: (typeof GP_POINT_VENTE !== 'undefined' && GP_POINT_VENTE) || 'Production',
      cree_par: GP_USER?.id || null,
      cree_par_nom: GP_USER?.email ? String(GP_USER.email).split('@')[0] : null,
    };
    const { data: d, error } = await SB.from('gp_devis').insert(entete).select().maybeSingle();
    if (error) {
      // 23505 = numéro déjà pris : une autre saisie est passée avant. On retente.
      if (String(error.code) === '23505' && essai < 2) continue;
      if (err) err.textContent = '⛔ Enregistrement impossible : ' + error.message;
      if (typeof notify === 'function') notify('Devis non enregistré : ' + error.message, 'r', 8000);
      return null;
    }
    const { error: eL } = await SB.from('gp_devis_lignes').insert(
      DEV_LIGNES.map(l => ({
        admin_id: GP_ADMIN_ID, devis_id: d.id,
        type_produit: l.type_produit, ingredient_id: l.ingredient_id,
        designation: l.designation, quantite: l.quantite, unite: l.unite,
        poids_sac: l.poids_sac || null, quantite_kg: l.quantite_kg,
        prix_kg: l.prix_kg, montant_ligne: l.montant_ligne,
      })));
    if (eL) {
      // Un en-tête sans lignes serait un document vide : on le dit, on ne le cache pas.
      if (err) err.textContent = '⛔ Lignes non enregistrées : ' + eL.message;
      if (typeof notify === 'function') notify('Lignes non enregistrées : ' + eL.message, 'r', 8000);
      return null;
    }
    if (typeof notify === 'function') {
      notify((type === 'facture' ? 'Facture ' : 'Devis ') + numero + ' enregistré ✓', 'gold');
    }
    return Object.assign({}, d, { lignes: DEV_LIGNES.slice() });
  }
  return null;
}

// ── LE DOCUMENT ───────────────────────────────────────────────────────────
// Un seul document, deux usages : le PDF qui part sur WhatsApp et la feuille
// qu'on imprime. Deux mises en page auraient divergé au premier changement.

function devPdfPret() {
  if (typeof window.jspdf === 'undefined' || typeof window.jspdf.jsPDF !== 'function') {
    if (typeof notify === 'function') notify('Lib PDF pas encore chargée — réessaie dans 2 s', 'r', 6000);
    return false;
  }
  return true;
}

async function devLogoDataUrl() {
  const url = (typeof GP_CONFIG !== 'undefined' && GP_CONFIG && GP_CONFIG.logo_url) || null;
  if (!url) return null;
  try {
    const r = await fetch(url, { mode: 'cors' });
    if (!r.ok) return null;
    const b = await r.blob();
    return await new Promise((res, rej) => {
      const fr = new FileReader();
      fr.onload = () => res(fr.result); fr.onerror = rej;
      fr.readAsDataURL(b);
    });
  } catch (_) { return null; }   // un logo absent ne doit pas empêcher le document
}

async function devPdfDoc(dv) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const cfg = (typeof GP_CONFIG !== 'undefined' && GP_CONFIG) || {};
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 15;
  const estFacture = dv.type === 'facture';
  const jolie = (d) => d ? new Date(d + 'T12:00:00').toLocaleDateString('fr-FR',
    { day: '2-digit', month: 'long', year: 'numeric' }) : '';

  let y = M;
  const logo = await devLogoDataUrl();
  if (logo) { try { doc.addImage(logo, 'PNG', M, y, 20, 20); } catch (_) {} }
  const xT = logo ? M + 25 : M;
  doc.setFont('helvetica', 'bold'); doc.setFontSize(16); doc.setTextColor(20);
  doc.text(String(cfg.nom_provenderie || 'PROVENDERIE').toUpperCase(), xT, y + 7);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(90);
  const coord = [cfg.localisation, [cfg.telephone, cfg.tel_dirigeant].filter(Boolean).join(' / ')]
    .filter(Boolean);
  coord.forEach((t, i) => doc.text(String(t), xT, y + 13 + i * 5));

  // Le titre, à droite, en gros : on doit savoir en un coup d'œil si c'est un
  // devis (une proposition) ou une facture (une somme à payer).
  doc.setFont('helvetica', 'bold'); doc.setFontSize(20);
  doc.setTextColor(estFacture ? 180 : 22, estFacture ? 50 : 163, estFacture ? 50 : 74);
  doc.text(estFacture ? 'FACTURE' : 'DEVIS', W - M, y + 8, { align: 'right' });
  doc.setFont('helvetica', 'normal'); doc.setFontSize(11); doc.setTextColor(60);
  doc.text(String(dv.numero || ''), W - M, y + 15, { align: 'right' });
  doc.text(jolie(dv.date), W - M, y + 21, { align: 'right' });

  y += 30;
  doc.setDrawColor(200); doc.setLineWidth(0.3); doc.line(M, y, W - M, y);
  y += 8;

  doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(110);
  doc.text('Client', M, y);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(13); doc.setTextColor(20);
  doc.text(String(dv.client_nom || '—'), M, y + 7);
  if (dv.client_tel) {
    doc.setFont('helvetica', 'normal'); doc.setFontSize(11); doc.setTextColor(90);
    doc.text(String(dv.client_tel), M, y + 13);
  }
  y += 20;

  const corps = (dv.lignes || []).map(l => [
    l.designation,
    l.unite === 'sac'
      ? `${fmt(l.quantite)} sac${l.quantite > 1 ? 's' : ''} de ${fmt(l.poids_sac)} kg  (${fmt(l.quantite_kg)} kg)`
      : `${fmt(l.quantite)} kg`,
    fmt(Math.round(l.prix_kg)) + ' F',
    fmt(l.montant_ligne) + ' F',
  ]);
  doc.autoTable({
    startY: y,
    head: [['Désignation', 'Quantité', 'Prix / kg', 'Montant']],
    body: corps,
    margin: { left: M, right: M },
    styles: { font: 'helvetica', fontSize: 11, cellPadding: 3, textColor: 30 },
    headStyles: { fillColor: [22, 163, 74], textColor: 255, fontStyle: 'bold', fontSize: 11 },
    alternateRowStyles: { fillColor: [247, 250, 247] },
    columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' }, 3: { halign: 'right', fontStyle: 'bold' } },
    showHead: 'everyPage',
  });
  y = doc.lastAutoTable.finalY + 6;

  doc.setFillColor(22, 163, 74);
  doc.rect(W - M - 85, y, 85, 14, 'F');
  doc.setFont('helvetica', 'bold'); doc.setFontSize(14); doc.setTextColor(255);
  doc.text('TOTAL', W - M - 80, y + 9);
  doc.text(fmt(dv.montant_total) + ' F', W - M - 4, y + 9, { align: 'right' });
  y += 22;

  doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(90);
  if (!estFacture && dv.valable_jusqu_au) {
    doc.setTextColor(180, 80, 0);
    doc.text(`Prix valables jusqu'au ${jolie(dv.valable_jusqu_au)}.`, M, y);
    doc.setTextColor(90); y += 6;
  }
  if (dv.note) { doc.text(doc.splitTextToSize(String(dv.note), W - 2 * M), M, y); y += 6; }

  const pied = [cfg.localisation, [cfg.telephone, cfg.tel_dirigeant].filter(Boolean).join(' / ')]
    .filter(Boolean).join('   |   ');
  const n = doc.internal.getNumberOfPages();
  for (let p = 1; p <= n; p++) {
    doc.setPage(p);
    doc.setDrawColor(210); doc.setLineWidth(0.2); doc.line(M, H - 15, W - M, H - 15);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(120);
    if (pied) doc.text(pied, M, H - 9);
    doc.text(p + '/' + n, W - M, H - 9, { align: 'right' });
  }
  return doc;
}

function devNomFichier(dv) {
  const net = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return `${dv.numero || 'Document'}-${net(dv.client_nom) || 'client'}.pdf`;
}

function devTexteWa(dv) {
  const cfg = (typeof GP_CONFIG !== 'undefined' && GP_CONFIG) || {};
  const l = [];
  l.push(dv.type === 'facture'
    ? `*Facture ${dv.numero}* — ${cfg.nom_provenderie || ''}`.trim()
    : `*Devis ${dv.numero}* — ${cfg.nom_provenderie || ''}`.trim());
  l.push('');
  (dv.lignes || []).forEach(x => l.push(`• ${x.designation} — ${x.unite === 'sac'
    ? `${fmt(x.quantite)} sac${x.quantite > 1 ? 's' : ''} (${fmt(x.quantite_kg)} kg)`
    : `${fmt(x.quantite)} kg`} : ${fmt(x.montant_ligne)} F`));
  l.push('');
  l.push(`*TOTAL : ${fmt(dv.montant_total)} F*`);
  if (dv.type !== 'facture' && dv.valable_jusqu_au) {
    l.push(`Prix valables jusqu'au ${new Date(dv.valable_jusqu_au + 'T12:00:00')
      .toLocaleDateString('fr-FR')}.`);
  }
  const tel = [cfg.telephone, cfg.tel_dirigeant].filter(Boolean).join(' / ');
  if (tel) { l.push(''); l.push(`📞 ${tel}`); }
  return l.join('\n');
}

// Le PDF part sur WhatsApp. On réutilise catEnvoyerPdf (catalogue.js), qui
// résout déjà les trois cas : feuille de partage du téléphone, téléchargement
// sur ordinateur, et annulation de l'utilisateur (qui n'est pas une erreur).
async function devEnvoyer(type) {
  if (!devPdfPret()) return;
  const dv = await devEnregistrer(type);
  if (!dv) return;
  const doc = await devPdfDoc(dv);
  const texte = devTexteWa(dv);
  if (typeof catEnvoyerPdf === 'function') await catEnvoyerPdf(doc, devNomFichier(dv), texte);
  else doc.save(devNomFichier(dv));
  // Le numéro du client est connu : on ouvre SA conversation, pas le partage
  // générique — sinon la secrétaire doit le chercher dans ses contacts.
  if (dv.client_tel && typeof detecterPays === 'function') {
    try {
      const p = detecterPays(dv.client_tel);
      if (p && p.numero_whatsapp) {
        window.open('https://wa.me/' + p.numero_whatsapp + '?text=' + encodeURIComponent(texte), '_blank');
      }
    } catch (_) {}
  }
  await devRenderListe();
}

async function devImprimer(type) {
  if (!devPdfPret()) return;
  const dv = await devEnregistrer(type);
  if (!dv) return;
  const doc = await devPdfDoc(dv);
  doc.autoPrint();
  const w = window.open(doc.output('bloburl'), '_blank');
  if (!w) { doc.save(devNomFichier(dv)); if (typeof notify === 'function')
    notify('Fenêtre bloquée — le document a été téléchargé', 'gold', 7000); }
  await devRenderListe();
}

// ── HISTORIQUE ────────────────────────────────────────────────────────────

async function devRenderListe() {
  const box = document.getElementById('dev-liste');
  if (!box) return;
  const { data, error } = await SB.from('gp_devis').select('*')
    .eq('admin_id', GP_ADMIN_ID).order('date', { ascending: false })
    .order('numero', { ascending: false }).limit(40);
  if (error) {
    box.innerHTML = `<div style="color:var(--red);font-size:12px;padding:10px">
      Historique illisible : ${error.message}</div>`;
    return;
  }
  DEV_LISTE = data || [];
  const auj = (typeof today === 'function') ? today() : new Date().toISOString().slice(0, 10);
  box.innerHTML = !DEV_LISTE.length
    ? '<div style="color:var(--textm);font-size:12px;padding:10px">Aucun devis pour l\'instant.</div>'
    : `<div style="overflow-x:auto"><table class="tbl" style="font-size:11px">
      <thead><tr><th>N°</th><th>Date</th><th>Client</th><th class="num">Montant</th><th>État</th><th></th></tr></thead>
      <tbody>${DEV_LISTE.map(d => {
        const expire = d.type === 'devis' && d.valable_jusqu_au && d.valable_jusqu_au < auj;
        return `<tr>
          <td style="font-family:'DM Mono',monospace;font-size:10px;font-weight:700">${d.numero}</td>
          <td style="font-size:10px">${d.date}</td>
          <td style="font-weight:600">${d.client_nom || '—'}
            <div style="font-size:9px;color:var(--textm)">${d.client_tel || ''}</div></td>
          <td class="num" style="font-weight:700">${fmt(d.montant_total)} F</td>
          <td>${d.vente_id
            ? '<span class="badge bdg-g" style="font-size:9px">✅ Vendu</span>'
            : d.type === 'facture'
              ? '<span class="badge bdg-b" style="font-size:9px">🧾 Facture</span>'
              : expire
                ? '<span class="badge bdg-r" style="font-size:9px">⏳ Expiré</span>'
                : '<span class="badge bdg-gold" style="font-size:9px">📄 Devis</span>'}</td>
          <td class="num"><div style="display:flex;gap:3px;justify-content:flex-end">
            <button class="btn btn-out btn-sm" onclick="devRouvrir('${d.id}')" title="Recharger ce panier">↩ Reprendre</button>
            <button class="btn btn-g btn-sm" onclick="devRenvoyer('${d.id}')" title="Renvoyer le PDF">📲</button>
          </div></td>
        </tr>`;
      }).join('')}</tbody></table></div>`;
}

async function devChargerLignes(devisId) {
  const { data } = await SB.from('gp_devis_lignes').select('*')
    .eq('admin_id', GP_ADMIN_ID).eq('devis_id', devisId);
  return (data || []).map(l => ({
    type_produit: l.type_produit, ingredient_id: l.ingredient_id,
    designation: l.designation, quantite: Number(l.quantite || 0), unite: l.unite || 'kg',
    poids_sac: Number(l.poids_sac || 0), quantite_kg: Number(l.quantite_kg || 0),
    prix_kg: Number(l.prix_kg || 0), montant_ligne: Number(l.montant_ligne || 0),
  }));
}

// Reprendre un devis : le panier revient tel quel, mais les PRIX sont ceux
// d'aujourd'hui s'ils ont bougé — et on le dit. Refacturer au prix d'il y a
// trois semaines, c'est vendre à perte sans le savoir.
async function devRouvrir(devisId) {
  const d = DEV_LISTE.find(x => x.id === devisId);
  if (!d) return;
  const lignes = await devChargerLignes(devisId);
  let bouges = 0;
  lignes.forEach(l => {
    const p = devTrouverProduit(l.designation);
    if (!p) return;
    const actuel = devPrixKg(p, l.unite);
    if (actuel != null && Math.abs(actuel - l.prix_kg) > 0.5) {
      l.prix_kg = Math.round(actuel * 100) / 100;
      l.montant_ligne = Math.round(l.quantite_kg * actuel);
      bouges++;
    }
  });
  DEV_LIGNES = lignes;
  const c = document.getElementById('dev-client'); if (c) c.value = d.client_nom || '';
  const t = document.getElementById('dev-tel');    if (t) t.value = d.client_tel || '';
  const n = document.getElementById('dev-note');   if (n) n.value = d.note || '';
  devRenderPanier();
  if (typeof notify === 'function') {
    notify(bouges ? `Panier repris — ${bouges} prix mis à jour au tarif du jour` : 'Panier repris ✓',
      bouges ? 'gold' : '', bouges ? 8000 : 4000);
  }
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

async function devRenvoyer(devisId) {
  const d = DEV_LISTE.find(x => x.id === devisId);
  if (!d || !devPdfPret()) return;
  const dv = Object.assign({}, d, { lignes: await devChargerLignes(devisId) });
  const doc = await devPdfDoc(dv);
  const texte = devTexteWa(dv);
  if (typeof catEnvoyerPdf === 'function') await catEnvoyerPdf(doc, devNomFichier(dv), texte);
  else doc.save(devNomFichier(dv));
}

// ── LE PASSAGE À LA VENTE ─────────────────────────────────────────────────
// UNE SEULE ROUTE POUR UNE VENTE. Le devis ne touche ni le stock, ni la
// caisse, ni la dette. Quand le client achète, le panier part dans la page
// Ventes — celle qui sait sortir le stock, encaisser et créditer les points —
// et la secrétaire y choisit le mode de paiement. Dupliquer cette mécanique
// ici aurait créé un huitième chemin d'écriture du stock : exactement ce qui
// a produit les soldes faux de la caisse.
function devVersVente() {
  if (!DEV_LIGNES.length) { notify('Le panier est vide', 'r'); return; }
  if (typeof VT_LIGNES === 'undefined') { notify('Page Ventes indisponible — recharge', 'r'); return; }
  VT_LIGNES.length = 0;
  DEV_LIGNES.forEach(l => VT_LIGNES.push({
    formule_nom: l.designation,
    quantite: l.quantite_kg,
    prix_unitaire: l.prix_kg,
    remise: 0,
    montant_ligne: l.montant_ligne,
    conditionnement: l.unite === 'sac' ? String(l.poids_sac) : 'kg',
    nb_sacs: l.unite === 'sac' ? l.quantite : 0,
    type_produit: l.type_produit,
    sous_type: null,
    ingredient_id: l.ingredient_id,
    cout_unitaire: (l.type_produit === 'mp' && l.ingredient_id)
      ? (Number((((typeof GP_INGREDIENTS !== 'undefined' ? GP_INGREDIENTS : []) || [])
          .find(i => i.id === l.ingredient_id) || {}).prix_actuel) || null)
      : null,
    veto_id: null, ferme_produit_id: null, type_prix: 'detail',
  }));
  const cli = devLireClient();
  if (typeof showGP === 'function') showGP('ventes');
  setTimeout(() => {
    const connu = ((typeof GP_CLIENTS !== 'undefined' ? GP_CLIENTS : []) || [])
      .find(c => String(c.nom || '').trim().toLowerCase() === cli.nom.toLowerCase());
    if (connu) {
      const h = document.getElementById('vt_client'); if (h) h.value = connu.id;
      const s = document.getElementById('vt_client_search'); if (s) s.value = connu.nom;
    }
    if (typeof renderLignesVente === 'function') renderLignesVente();
    notify('Panier transféré — choisis le paiement puis enregistre la vente', 'gold', 8000);
  }, 400);
}

if (typeof window !== 'undefined') {
  window.renderDevis = renderDevis;
  window.devAjouterLigne = devAjouterLigne;
  window.devSupprimerLigne = devSupprimerLigne;
  window.devViderPanier = devViderPanier;
  window.devMajUnites = devMajUnites;
  window.devClientChange = devClientChange;
  window.devFiltrerClient = devFiltrerClient;
  window.devChoisirClient = devChoisirClient;
  window.devFiltrerProduit = devFiltrerProduit;
  window.devChoisirProduit = devChoisirProduit;
  window.devStockDe = devStockDe;
  window.devEnvoyer = devEnvoyer;
  window.devImprimer = devImprimer;
  window.devRouvrir = devRouvrir;
  window.devRenvoyer = devRenvoyer;
  window.devVersVente = devVersVente;
  // Exposées pour les tests Node
  window.devCatalogue = devCatalogue;
  window.devPrixKg = devPrixKg;
  window.devLigneCalc = devLigneCalc;
  window.devTotal = devTotal;
  window.devNumeroSuivant = devNumeroSuivant;
  window.devValideJusqu = devValideJusqu;
}
