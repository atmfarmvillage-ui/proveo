// ══════════════════════════════════════════════════
// PROVENDA → MIGNA : le pont (boutique véto & matériel d'élevage)
//
// Partage des rôles, le même que pour ZONEO : PROVENDA est le MAGASIN — stock
// en lots, caisse, péremption, prix d'achat : la vérité. MIGNA est la VITRINE
// publique — découverte, partage, mise en relation. On projette vers MIGNA, on
// ne lit jamais MIGNA pour écrire ici.
//
// Ce fichier ne fait que RELAYER. Deux secrets, aucun dans le navigateur :
//   · MIGNA_BRIDGE_KEY — la clé de pont partagée (= ATMBI_BRIDGE_KEY côté MIGNA)
//   · le jeton Supabase de l'utilisateur, qui sert d'AUTORISATION
//
// AUTORISATION = LA RLS. Pour publier, on rejoue le jeton de l'utilisateur
// contre PostgREST : si la ligne lui revient, il y a droit. Aucune clé de
// service ne traîne ici, donc aucun moyen de publier le produit d'un autre.
//
// PIÈGE CLOUDFLARE : un fetch() direct vers migna.live depuis un Worker du même
// compte peut reboucler sur l'appelant. D'où le service binding `MIGNA`
// (wrangler.jsonc) et `env.MIGNA.fetch(req)`, avec repli sur fetch() pour que
// le code marche aussi hors binding.
// ══════════════════════════════════════════════════

const MIGNA_ORIGIN = 'https://migna.live';

// Vrai si le jeton correspond à un utilisateur connecté. L'IA coûte : on ne la
// laisse pas appeler par un anonyme.
async function authOk(jwt, env) {
  if (!jwt) return false;
  try {
    const r = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
      headers: { apikey: env.SUPABASE_ANON_KEY, Authorization: `Bearer ${jwt}` },
    });
    return r.ok;
  } catch (e) { return false; }
}

// Lit UNE ligne avec les droits de l'utilisateur (donc filtrée par la RLS).
async function sbAsUser(jwt, env, path) {
  const r = await fetch(`${env.SUPABASE_URL}/rest/v1/${path}`, {
    headers: { apikey: env.SUPABASE_ANON_KEY, Authorization: `Bearer ${jwt}`, Accept: 'application/json' },
  });
  if (!r.ok) return null;
  const d = await r.json().catch(() => null);
  return Array.isArray(d) ? (d[0] || null) : d;
}

// Appel du Worker MIGNA : binding d'abord, fetch ensuite.
async function versMigna(env, chemin, payload) {
  const req = new Request(MIGNA_ORIGIN + chemin, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-bridge-key': env.MIGNA_BRIDGE_KEY },
    body: JSON.stringify(payload),
  });
  const r = env.MIGNA ? await env.MIGNA.fetch(req) : await fetch(req);
  const out = await r.json().catch(() => ({}));
  return { r, out };
}

// ── Cerveau KEPELA loué à MIGNA (fiche depuis photo · besoin → produit) ──
// On ne réécrit PAS l'IA ici : elle vit une seule fois, dans MIGNA, avec sa
// règle de sécurité (jamais de posologie, renvoi au vétérinaire).
async function handleIa(request, env, kind, json) {
  const jwt = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (!jwt) return json({ error: 'Non connecté.' }, 401);
  if (!env.MIGNA_BRIDGE_KEY) return json({ error: 'Pont non configuré (MIGNA_BRIDGE_KEY).' }, 503);
  if (!(await authOk(jwt, env))) return json({ error: 'Session expirée — reconnecte-toi.' }, 401);

  let body = {};
  try { body = await request.json(); } catch (e) {}
  const payload = { kind, lang: body.lang === 'en' ? 'en' : 'fr' };
  if (kind === 'fiche') {
    payload.images = Array.isArray(body.images) ? body.images.slice(0, 3) : [];
    payload.notes = String(body.notes || '').slice(0, 300);
    payload.cats = Array.isArray(body.cats) ? body.cats.slice(0, 24) : [];
    payload.unites = Array.isArray(body.unites) ? body.unites.slice(0, 20) : [];
    // Le champ « soigne » : les maladies que le produit traite. Demande explicite,
    // pour ne pas changer la forme de reponse attendue par les autres appelants.
    payload.soigne = body.soigne === true;
    if (!payload.images.length) return json({ error: 'Photo manquante.' }, 400);
  } else if (kind === 'besoin') {
    payload.texte = String(body.texte || '').slice(0, 400);
    payload.cats = Array.isArray(body.cats) ? body.cats.slice(0, 24) : [];
    if (!payload.texte.trim()) return json({ error: 'Besoin vide.' }, 400);
  } else if (kind === 'soigne') {
    // Rattrapage d un catalogue deja saisi : a partir du NOM seul, sans photo.
    payload.nom = String(body.nom || '').slice(0, 160);
    payload.cats = Array.isArray(body.cats) ? body.cats.slice(0, 20) : [];
    if (!payload.nom.trim()) return json({ error: 'Nom du produit manquant.' }, 400);
  } else {
    return json({ error: 'Type inconnu.' }, 400);
  }

  try {
    const { r, out } = await versMigna(env, '/api/mp/ia', payload);
    return json(out, r.ok ? 200 : (r.status || 502));
  } catch (e) {
    // Jamais de repli muet : on dit pourquoi.
    return json({ error: 'KEPELA injoignable.', detail: String((e && e.message) || e).slice(0, 200) }, 502);
  }
}

// ── Publier un produit véto / matériel sur le marché MIGNA ──
async function handlePublier(request, env, json) {
  const jwt = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (!jwt) return json({ error: 'Non connecté.' }, 401);
  if (!env.MIGNA_BRIDGE_KEY) return json({ error: 'Pont non configuré (MIGNA_BRIDGE_KEY).' }, 503);

  let body = {};
  try { body = await request.json(); } catch (e) {}
  const pid = String(body.produit_id || '').replace(/[^A-Za-z0-9-]/g, '');
  if (!pid) return json({ error: 'Produit manquant.' }, 400);

  // La RLS décide : si la ligne revient, l'utilisateur en a le droit.
  const prod = await sbAsUser(jwt, env, `gp_produits_veto?id=eq.${pid}&select=*&limit=1`);
  if (!prod) return json({ error: 'Produit introuvable ou non autorisé.' }, 404);
  if (prod.actif === false) return json({ error: 'Produit archivé — réactive-le avant de le publier.' }, 400);

  const prix = Number(prod.migna_prix) > 0 ? Number(prod.migna_prix) : Number(prod.prix_vente) || null;
  if (!prix) return json({ error: 'Donne un prix de vente au produit avant de le publier.' }, 400);

  // L'identité de la boutique vient de la fiche entreprise, pas d'une constante.
  const cfg = await sbAsUser(jwt, env, `gp_config?user_id=eq.${encodeURIComponent(prod.admin_id)}&select=nom_provenderie,localisation,telephone,tel_dirigeant&limit=1`);

  // Les médicaments vétérinaires sont RÉGLEMENTÉS : visibles et cherchables sur
  // le marché, mise en relation possible, mais JAMAIS de commande à distance.
  // Le matériel d'élevage (mangeoire, abreuvoir, pince) se commande normalement.
  const cat = String(prod.categorie || '');
  const retraitSeul = !['matériel', 'materiel-veto'].includes(cat);

  const payload = {
    // Le préfixe distingue l'origine : 'proveo:<id>' ne peut pas écraser un
    // produit 'atmbi:<id>' de ZONEO, et une republication met à jour la même fiche.
    source: 'proveo',
    boutique_ref: 'admin-' + prod.admin_id,
    produit_ref: prod.id,
    boutique_nom: (cfg && cfg.nom_provenderie) || 'PROVENDA',
    ville: (cfg && cfg.localisation) || null,
    whatsapp: (cfg && (cfg.telephone || cfg.tel_dirigeant)) || null,
    owner_email: String(body.owner_email || '').toLowerCase() || null,
    titre: prod.nom,
    description: [prod.description || '', prod.soigne ? ('Soigne : ' + prod.soigne + '.') : '']
      .filter(Boolean).join(' ').trim() || null,
    photos: prod.photo_url ? [prod.photo_url] : [],
    prix,
    categorie: cat || null,
    // On publie la DISPONIBILITÉ, jamais le stock exact : ce chiffre est une
    // information commerciale privée. Le navigateur la calcule sur les lots.
    en_stock: body.en_stock !== false,
    retrait_seul: retraitSeul,
  };

  let r, out;
  try {
    ({ r, out } = await versMigna(env, '/api/mp/import', payload));
  } catch (e) {
    return json({ error: 'Marché MIGNA injoignable.', detail: String((e && e.message) || e).slice(0, 200) }, 502);
  }
  if (!r.ok || !out.ok) return json({ error: out.error || ('Publication refusée (' + r.status + ').') }, 400);

  return json({
    ok: true,
    produit_id: out.produit_id,
    boutique_id: out.boutique_id,
    boutique_slug: out.boutique_slug || null,
    retrait_seul: retraitSeul,
    // Toute URL rendue à l'utilisateur est sur migna.live, jamais *.workers.dev.
    url: out.produit_id ? (MIGNA_ORIGIN + '/p?id=' + encodeURIComponent(out.produit_id)) : null,
  });
}

// ── Dépublier (produit archivé côté PROVENDA) ──
async function handleDepublier(request, env, json) {
  const jwt = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (!jwt) return json({ error: 'Non connecté.' }, 401);
  if (!env.MIGNA_BRIDGE_KEY) return json({ error: 'Pont non configuré (MIGNA_BRIDGE_KEY).' }, 503);
  let body = {};
  try { body = await request.json(); } catch (e) {}
  const pid = String(body.produit_id || '').replace(/[^A-Za-z0-9-]/g, '');
  if (!pid) return json({ error: 'Produit manquant.' }, 400);
  // Même garde : la RLS doit rendre la ligne à cet utilisateur.
  const prod = await sbAsUser(jwt, env, `gp_produits_veto?id=eq.${pid}&select=id&limit=1`);
  if (!prod) return json({ error: 'Produit introuvable ou non autorisé.' }, 404);
  try {
    const { r, out } = await versMigna(env, '/api/mp/import-off', { source: 'proveo', produit_ref: pid });
    return json(out, r.ok ? 200 : (r.status || 502));
  } catch (e) {
    return json({ error: 'Marché MIGNA injoignable.' }, 502);
  }
}

export async function routeMigna(request, env, url, { json }) {
  if (request.method !== 'POST') return json({ error: 'POST uniquement' }, 405);
  if (url.pathname === '/ia/fiche') return handleIa(request, env, 'fiche', json);
  if (url.pathname === '/ia/besoin') return handleIa(request, env, 'besoin', json);
  if (url.pathname === '/ia/soigne') return handleIa(request, env, 'soigne', json);
  if (url.pathname === '/migna/publier') return handlePublier(request, env, json);
  if (url.pathname === '/migna/depublier') return handleDepublier(request, env, json);
  return json({ error: 'Route inconnue' }, 404);
}
