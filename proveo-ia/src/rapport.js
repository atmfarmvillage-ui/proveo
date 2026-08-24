// ══════════════════════════════════════════════════
// PROVENDA — RAPPORT POUR KEPELA
// Expose le rapport de l'entreprise dans un format normalisé, que KEPELA
// (plateforme MIGNA) relaie sur WhatsApp. KEPELA n'accède JAMAIS à cette base :
// il appelle ce point d'accès et se contente de transmettre. C'est ce qui
// permet à d'autres entreprises de rejoindre la plateforme sans confier leurs
// clés à qui que ce soit.
//
//   GET /rapport?type=quotidien&key=<RAPPORT_KEY>
//
// Secrets à définir :  wrangler secret put SUPABASE_SERVICE_KEY
//                      wrangler secret put RAPPORT_KEY
// ══════════════════════════════════════════════════

const ROLES_DESTINATAIRES = ['admin', 'logistique', 'daf'];
const INDICATIF_PAYS = '228';           // Togo
const SEUIL_MP_DEFAUT = 200;            // kg, si la fiche n'a pas de seuil

// ── Accès Supabase avec la clé de service ─────────
// Le cron n'a pas de session utilisateur : la clé anon serait bloquée par la
// RLS. La clé de service reste dans ce worker, qui ne sert que cette base.
async function sb(env, chemin) {
  const r = await fetch(`${env.SUPABASE_URL}/rest/v1/${chemin}`, {
    headers: {
      apikey: env.SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
      'content-type': 'application/json',
    },
  });
  if (!r.ok) throw new Error(`Supabase ${r.status} sur ${chemin.split('?')[0]}`);
  return r.json();
}

// Charge une table entière : PostgREST plafonne à 1000 lignes par requête, et
// sans pagination les stocks sortent faux (entrées manquantes → nets négatifs).
async function sbTout(env, chemin, page = 1000) {
  const sep = chemin.includes('?') ? '&' : '?';
  let tout = [], de = 0;
  for (let garde = 0; garde < 30; garde++) {
    const lot = await sb(env, `${chemin}${sep}offset=${de}&limit=${page}`);
    if (!lot.length) break;
    tout = tout.concat(lot);
    if (lot.length < page) break;
    de += page;
  }
  return tout;
}

// ── Dates (le Togo est à UTC+0, pas de décalage à gérer) ──
function aujourdhui() { return new Date().toISOString().slice(0, 10); }
function debutMois() { return aujourdhui().slice(0, 7) + '-01'; }

function fmt(n) { return Math.round(Number(n) || 0).toLocaleString('fr-FR'); }

// Nom normalisé — même règle d'identité que l'app : deux libellés qui ne
// diffèrent que par la casse ou les espaces désignent la même matière.
const RE_DIACRITIQUES = new RegExp('[\u0300-\u036f]', 'g');
function norm(s) {
  return String(s || '').normalize('NFD').replace(RE_DIACRITIQUES, '')
    .replace(/\s+/g, ' ').trim().toLowerCase();
}

// Numéro au format international, sinon Meta refuse l'envoi.
function normaliserTel(tel) {
  const chiffres = String(tel || '').replace(/\D/g, '');
  if (!chiffres) return null;
  if (chiffres.startsWith(INDICATIF_PAYS)) return chiffres;
  if (chiffres.length === 8) return INDICATIF_PAYS + chiffres;   // numéro local
  return chiffres.length >= 10 ? chiffres : null;
}

// ── Destinataires : la règle vit dans les rôles, pas dans une liste ──
// Un membre ajouté avec le bon rôle et un téléphone reçoit le rapport le soir
// même. Personne à inscrire nulle part.
async function destinataires(env, adminId, type) {
  const [membres, config] = await Promise.all([
    sb(env, `gp_membres?admin_id=eq.${adminId}&select=*`).catch(() => []),
    sb(env, `gp_config?user_id=eq.${adminId}&select=telephone,tel_dirigeant,tel_alerte_stock,nom_provenderie`).catch(() => []),
  ]);

  const liste = [];

  // Le PROPRIÉTAIRE d'abord : il n'apparaît pas dans gp_membres (c'est le compte
  // qui a créé l'espace), son contact est dans gp_config. L'oublier revenait à
  // envoyer le rapport à tout le monde sauf au patron.
  const cfg = (config || [])[0] || {};
  // Le numéro du dirigeant prime sur celui de la provenderie : le second est le
  // contact PUBLIC de l'entreprise (souvent l'accueil), pas celui du patron.
  const telChef = cfg.tel_dirigeant || cfg.telephone;
  if (telChef) {
    liste.push({
      nom: cfg.tel_dirigeant ? 'Dirigeant' : (cfg.nom_provenderie || 'Provenderie'),
      role: cfg.tel_dirigeant ? 'dirigeant' : 'proprietaire',
      tel: normaliserTel(telChef),
    });
  }
  // Numéro dédié aux alertes de stock, s'il est renseigné et qu'on envoie ça.
  if (type === 'stock' && cfg.tel_alerte_stock) {
    liste.push({ nom: 'Alerte stock', role: 'alerte_stock', tel: normaliserTel(cfg.tel_alerte_stock) });
  }

  (membres || [])
    .filter(m => m.actif !== false && ROLES_DESTINATAIRES.includes(m.role))
    .forEach(m => liste.push({ nom: m.nom || m.email || 'Membre', role: m.role, tel: normaliserTel(m.telephone) }));

  const vus = new Set();
  return liste.filter(d => {
    if (!d.tel || vus.has(d.tel)) return false;   // un même numéro ne reçoit qu'une fois
    vus.add(d.tel);
    return true;
  });
}

// ── MP réellement utilisées ───────────────────────
// Le catalogue compte une centaine de fiches jamais employées, toutes à 0 kg :
// alerter dessus noie les vraies ruptures sous 80 lignes. On ne retient que les
// matières qui entrent dans une formule active ou qui ont déjà bougé.
async function mpUtilisees(env, adminId, mouvements) {
  let formules = [];
  try {
    formules = await sb(env, `gp_formules?admin_id=eq.${adminId}&actif=eq.true&select=ingredients`);
  } catch (e) { formules = []; }
  const cles = new Set();
  (formules || []).forEach(f => {
    let ings = f.ingredients;
    if (typeof ings === 'string') { try { ings = JSON.parse(ings); } catch (e) { ings = []; } }
    (Array.isArray(ings) ? ings : []).forEach(i => { if (i && i.nom) cles.add(norm(i.nom)); });
  });
  // Une MP qui a bougé compte aussi, même hors formule : vente de MP, ajustement.
  (mouvements || []).forEach(m => { if (m.ingredient_nom) cles.add(norm(m.ingredient_nom)); });
  return cles;
}

// ── Niveaux de stock MP, rattachés à leur fiche ───
// Empiler sur le libellé brut scinde le stock dès qu'une saisie varie : les
// entrées sous un nom, les sorties sous un autre, et un net négatif sur du
// stock bien réel.
function niveauxMp(mouvements, fiches) {
  const parId = {}, parNom = {};
  (fiches || []).forEach(f => { parId[f.id] = f.nom; parNom[norm(f.nom)] = f.nom; });
  const niveaux = {};
  (mouvements || []).forEach(m => {
    const cle = (m.ingredient_id && parId[m.ingredient_id])
      || parNom[norm(m.ingredient_nom)]
      || m.ingredient_nom || '';
    const q = Number(m.quantite || 0);
    niveaux[cle] = (niveaux[cle] || 0) + (m.type === 'entree' ? q : -q);
  });
  return niveaux;
}

// ══════════════════════════════════════════════════
// RAPPORT QUOTIDIEN
// ══════════════════════════════════════════════════
async function rapportQuotidien(env, adminId) {
  const jour = aujourdhui();
  const mois = debutMois();

  const [ventesJour, ventesImpayees, lotsJour, fiches, caisses, mvtsCaisse] = await Promise.all([
    sb(env, `gp_ventes?admin_id=eq.${adminId}&date=eq.${jour}&deleted_at=is.null&select=montant_total,montant_paye,statut_paiement,qte_vendue`),
    sb(env, `gp_ventes?admin_id=eq.${adminId}&deleted_at=is.null&statut_paiement=neq.paye&select=montant_total,montant_paye,client_nom,date`),
    sb(env, `gp_lots?admin_id=eq.${adminId}&date=eq.${jour}&select=qte_produite,formule_nom`),
    sb(env, `gp_ingredients?admin_id=eq.${adminId}&select=id,nom,seuil_alerte,prix_actuel`),
    sb(env, `gp_caisses?admin_id=eq.${adminId}&actif=eq.true&select=id,nom,solde_initial`),
    sbTout(env, `gp_mouvements_caisse?admin_id=eq.${adminId}&select=caisse_id,type,montant,statut_transfert,caisse_dest_id`),
  ]);

  // Ventes du jour
  const ca = ventesJour.reduce((s, v) => s + Number(v.montant_total || 0), 0);
  const encaisse = ventesJour.reduce((s, v) => s + Number(v.montant_paye || 0), 0);
  const kgVendus = ventesJour.reduce((s, v) => s + Number(v.qte_vendue || 0), 0);

  // Impayés — le cumul, tous mois confondus
  const impayeTotal = ventesImpayees.reduce(
    (s, v) => s + Math.max(0, Number(v.montant_total || 0) - Number(v.montant_paye || 0)), 0);
  const parClient = {};
  ventesImpayees.forEach(v => {
    const du = Math.max(0, Number(v.montant_total || 0) - Number(v.montant_paye || 0));
    if (du > 0) parClient[v.client_nom || '—'] = (parClient[v.client_nom || '—'] || 0) + du;
  });
  const topImpayes = Object.entries(parClient).sort((a, b) => b[1] - a[1]).slice(0, 3);

  // Production du jour
  const kgProduits = lotsJour.reduce((s, l) => s + Number(l.qte_produite || 0), 0);

  // Stock MP sous seuil
  const mvtsStock = await sbTout(env, `gp_stock_mp?admin_id=eq.${adminId}&select=ingredient_id,ingredient_nom,type,quantite`);
  const niveaux = niveauxMp(mvtsStock, fiches);
  const utilisees = await mpUtilisees(env, adminId, mvtsStock);
  const alertes = (fiches || []).filter(f => utilisees.has(norm(f.nom))).map(f => {
    const stock = niveaux[f.nom] || 0;
    const seuil = Number(f.seuil_alerte || SEUIL_MP_DEFAUT);
    return { nom: f.nom, stock, seuil, manque: Math.max(0, seuil - stock) };
  }).filter(a => a.stock < a.seuil).sort((a, b) => a.stock - b.stock);

  // Solde de caisse
  const soldes = {};
  (caisses || []).forEach(c => { soldes[c.id] = Number(c.solde_initial || 0); });
  (mvtsCaisse || []).forEach(m => {
    const mt = Number(m.montant || 0);
    if (soldes[m.caisse_id] === undefined) return;
    if (m.type === 'entree' || m.type === 'ajustement') soldes[m.caisse_id] += mt;
    else if (m.type === 'sortie') soldes[m.caisse_id] -= mt;
    else if (m.type === 'transfert' && m.statut_transfert !== 'refuse') {
      soldes[m.caisse_id] -= mt;
      if (m.caisse_dest_id && soldes[m.caisse_dest_id] !== undefined) soldes[m.caisse_dest_id] += mt;
    }
  });
  const soldeCaisse = Object.values(soldes).reduce((s, v) => s + v, 0);

  // ── Le texte complet, pour la page web et le repli hors template ──
  const lignes = [
    `📊 *SADARI — rapport du ${jour}*`,
    ``,
    `💰 CA du jour : ${fmt(ca)} F  (${ventesJour.length} vente${ventesJour.length > 1 ? 's' : ''})`,
    `✅ Encaissé : ${fmt(encaisse)} F`,
    `📦 Vendu : ${fmt(kgVendus)} kg`,
    `🏭 Produit : ${fmt(kgProduits)} kg  (${lotsJour.length} lot${lotsJour.length > 1 ? 's' : ''})`,
    `💵 Caisse : ${fmt(soldeCaisse)} F`,
    ``,
    `🔴 Impayés : ${fmt(impayeTotal)} F`,
  ];
  topImpayes.forEach(([nom, du]) => lignes.push(`   • ${nom} — ${fmt(du)} F`));
  lignes.push('');
  if (alertes.length) {
    lignes.push(`⚠️ ${alertes.length} MP sous seuil :`);
    alertes.slice(0, 5).forEach(a => lignes.push(`   • ${a.nom} — ${fmt(a.stock)} kg (seuil ${fmt(a.seuil)})`));
    if (alertes.length > 5) lignes.push(`   … et ${alertes.length - 5} autre(s)`);
  } else {
    lignes.push(`✅ Aucune alerte de stock`);
  }

  return {
    type: 'quotidien',
    date: jour,
    titre: `Rapport du ${jour}`,
    // Les 5 valeurs qui alimentent les paramètres du template Meta.
    // Un template est court : le détail se lit dans le texte ou sur la page.
    parametres: [jour, fmt(ca), fmt(encaisse), fmt(impayeTotal), String(alertes.length)],
    chiffres: [
      { label: 'CA du jour', valeur: Math.round(ca), unite: 'F' },
      { label: 'Encaissé', valeur: Math.round(encaisse), unite: 'F' },
      { label: 'Vendu', valeur: Math.round(kgVendus), unite: 'kg' },
      { label: 'Produit', valeur: Math.round(kgProduits), unite: 'kg' },
      { label: 'Solde caisse', valeur: Math.round(soldeCaisse), unite: 'F' },
      { label: 'Impayés', valeur: Math.round(impayeTotal), unite: 'F' },
      { label: 'Alertes stock', valeur: alertes.length, unite: '' },
    ],
    alertes: alertes.slice(0, 10).map(a => ({ nom: a.nom, stock: Math.round(a.stock), seuil: a.seuil })),
    impayes: topImpayes.map(([nom, du]) => ({ client: nom, montant: Math.round(du) })),
    texte: lignes.join('\n'),
    mois_en_cours: mois,
  };
}

// ══════════════════════════════════════════════════
// ALERTES STOCK — appelable indépendamment du rapport
// ══════════════════════════════════════════════════
async function rapportStock(env, adminId) {
  const [fiches, mvts] = await Promise.all([
    sb(env, `gp_ingredients?admin_id=eq.${adminId}&select=id,nom,seuil_alerte,prix_actuel`),
    sbTout(env, `gp_stock_mp?admin_id=eq.${adminId}&select=ingredient_id,ingredient_nom,type,quantite`),
  ]);
  const niveaux = niveauxMp(mvts, fiches);
  const utilisees = await mpUtilisees(env, adminId, mvts);
  const alertes = (fiches || []).filter(f => utilisees.has(norm(f.nom))).map(f => {
    const stock = niveaux[f.nom] || 0;
    const seuil = Number(f.seuil_alerte || SEUIL_MP_DEFAUT);
    const prix = Number(f.prix_actuel || 0);
    return { nom: f.nom, stock, seuil, manque: Math.max(0, seuil - stock), valeur_manque: Math.max(0, seuil - stock) * prix };
  }).filter(a => a.stock < a.seuil).sort((a, b) => a.stock - b.stock);

  const budget = alertes.reduce((s, a) => s + a.valeur_manque, 0);
  const lignes = [`⚠️ *SADARI — alerte stock matières premières*`, ``];
  alertes.slice(0, 10).forEach(a => lignes.push(`• ${a.nom} — ${fmt(a.stock)} kg (seuil ${fmt(a.seuil)})`));
  if (alertes.length > 10) lignes.push(`… et ${alertes.length - 10} autre(s)`);
  lignes.push('', `💰 Réapprovisionnement estimé : ${fmt(budget)} F`);

  return {
    type: 'stock',
    date: aujourdhui(),
    titre: `${alertes.length} matière(s) sous seuil`,
    parametres: [aujourdhui(), String(alertes.length), fmt(budget)],
    alertes: alertes.slice(0, 20).map(a => ({ nom: a.nom, stock: Math.round(a.stock), seuil: a.seuil, manque: Math.round(a.manque) })),
    texte: alertes.length ? lignes.join('\n') : null,   // null = rien à signaler, KEPELA n'envoie pas
  };
}

// ══════════════════════════════════════════════════
// IMPAYÉS — le détail par client, pour la relance
// ══════════════════════════════════════════════════
async function rapportImpayes(env, adminId) {
  const ventes = await sbTout(env,
    `gp_ventes?admin_id=eq.${adminId}&deleted_at=is.null&statut_paiement=neq.paye&select=id,client_nom,client_id,montant_total,montant_paye,date`);

  const parClient = {};
  (ventes || []).forEach(v => {
    const du = Math.max(0, Number(v.montant_total || 0) - Number(v.montant_paye || 0));
    if (du <= 0) return;
    const k = v.client_nom || '—';
    if (!parClient[k]) parClient[k] = { client: k, client_id: v.client_id || null, montant: 0, ventes: 0, plus_ancienne: v.date };
    parClient[k].montant += du;
    parClient[k].ventes++;
    if (v.date < parClient[k].plus_ancienne) parClient[k].plus_ancienne = v.date;
  });

  const liste = Object.values(parClient).sort((a, b) => b.montant - a.montant);
  const total = liste.reduce((s, c) => s + c.montant, 0);

  const lignes = [`🔴 *SADARI — impayés au ${aujourdhui()}*`, ``, `Total dû : ${fmt(total)} F sur ${liste.length} client(s)`, ``];
  liste.slice(0, 10).forEach(c => lignes.push(`• ${c.client} — ${fmt(c.montant)} F (depuis le ${c.plus_ancienne})`));
  if (liste.length > 10) lignes.push(`… et ${liste.length - 10} autre(s)`);

  return {
    type: 'impayes',
    date: aujourdhui(),
    titre: `${fmt(total)} F dus par ${liste.length} client(s)`,
    parametres: [aujourdhui(), fmt(total), String(liste.length)],
    clients: liste.slice(0, 30).map(c => ({ ...c, montant: Math.round(c.montant) })),
    texte: liste.length ? lignes.join('\n') : null,
  };
}

// ══════════════════════════════════════════════════
// POINT D'ACCÈS
// ══════════════════════════════════════════════════
export async function handleRapport(request, env, url) {
  const j = (o, s = 200) => new Response(JSON.stringify(o, null, 2), {
    status: s, headers: { 'content-type': 'application/json; charset=utf-8' },
  });

  // Le secret partagé est la seule protection : ce point d'accès expose du CA,
  // des impayés et des numéros. Sans clé configurée, il reste fermé.
  const cle = url.searchParams.get('key') || '';
  if (!env.RAPPORT_KEY || cle !== env.RAPPORT_KEY) return j({ error: 'forbidden' }, 403);
  if (!env.SUPABASE_SERVICE_KEY) return j({ error: 'SUPABASE_SERVICE_KEY non configurée' }, 500);

  const adminId = url.searchParams.get('admin_id') || env.ADMIN_ID || '';
  if (!/^[0-9a-f-]{36}$/i.test(adminId)) return j({ error: 'admin_id absent ou invalide' }, 400);

  const type = (url.searchParams.get('type') || 'quotidien').toLowerCase();

  try {
    let corps;
    if (type === 'stock') corps = await rapportStock(env, adminId);
    else if (type === 'impayes') corps = await rapportImpayes(env, adminId);
    else corps = await rapportQuotidien(env, adminId);

    // L'entreprise fournit elle-même ses destinataires : KEPELA n'a pas à
    // connaître le modèle utilisateur de chaque tenant.
    const cfg = (await sb(env, `gp_config?user_id=eq.${adminId}&select=nom_provenderie`).catch(() => []))[0] || {};
    corps.entreprise = cfg.nom_provenderie || 'SADARI';
    corps.destinataires = await destinataires(env, adminId, type);
    return j(corps);
  } catch (e) {
    return j({ error: 'Rapport indisponible', detail: String(e && e.message || e).slice(0, 300) }, 502);
  }
}
