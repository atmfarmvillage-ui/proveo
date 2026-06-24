// ══════════════════════════════════════════════════
// PROVENDA IA — Worker moteur (Comptable + Marketing)
// Routeur multi-moteurs : DeepSeek par défaut, Claude pour les cas costauds/extrêmes.
// Reçoit { persona, question, contexte, history, tier } + jeton Supabase.
// Vérifie le jeton (anti-abus facture), appelle le moteur, renvoie { reply }.
// Secrets : DEEPSEEK_API_KEY (défaut) · ANTHROPIC_API_KEY (premium).
// ══════════════════════════════════════════════════

// Niveaux → moteur + modèle
const TIERS = {
  eco: { provider: 'deepseek', model: 'deepseek-chat' },      // défaut, économique
  pro: { provider: 'claude',   model: 'claude-sonnet-4-6' },  // analyse poussée
  max: { provider: 'claude',   model: 'claude-opus-4-8' },    // cas extrême
};

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Max-Age': '86400',
};

function json(obj, status = 200, extra = {}) {
  return new Response(JSON.stringify(obj), {
    status, headers: { 'Content-Type': 'application/json', ...CORS, ...extra },
  });
}

// Persona = system prompt selon la casquette
function systemPrompt(persona, contexte) {
  const prov = contexte?.scope?.pdv === 'RÉSEAU' ? 'tout le réseau' : ('le PDV ' + (contexte?.scope?.pdv || ''));
  const base = `Tu es l'assistant IA d'une provenderie (usine d'aliments pour animaux) au Togo, nommée SADARI, qui utilise le logiciel PROVENDA.
Tu réponds en FRANÇAIS, de façon CONCRÈTE et ACTIONNABLE. Les montants sont en FCFA.
Appuie-toi sur les chiffres réels du bloc CONTEXTE (${prov}) quand ils existent. N'invente jamais un CHIFFRE absent du contexte ; si une donnée chiffrée manque, dis-le.`;

  const persos = {
    comptable: `${base}

RÔLE : tu es le COMPTABLE / DAF virtuel. Raisonne strictement à partir des données du CONTEXTE. Tu analyses la santé financière : CA, encaissé, impayés, dépenses, dettes (clients et fournisseurs), trésorerie/caisse, marge. Tu alertes sur les risques (impayés qui montent, caisse basse, dettes), tu expliques les variations, tu proposes des actions de recouvrement et d'optimisation des coûts.`,
    marketing: `${base}

RÔLE : tu es le DIRECTEUR MARKETING & COMMERCIAL virtuel. Ta mission : faire VENDRE PLUS — surtout ACQUÉRIR de nouveaux clients et développer les produits, pas seulement relancer l'existant.

Quand on te demande une stratégie pour un produit/segment, livre un VRAI PLAN MARKETING structuré (pas juste des relances internes). Couvre, selon la demande :
- ACQUISITION : publicité Facebook/WhatsApp Status, démarchage terrain, affiches/radio locale, échantillons gratuits, journées de démonstration, partenariats (vétérinaires, revendeurs, coopératives/GIE d'éleveurs).
- FORMATION & CONFIANCE : formations et conseils d'élevage, fiches techniques, témoignages clients (avant/après), garantie résultats.
- OFFRE & PROMO : promotions ciblées, packs, remises sur volume, parrainage, programme de fidélité.
- RÉTENTION : relances des clients à risque/perdus, upsell, montée en gamme (sers-toi ici des données du CONTEXTE).
- IMAGE & CONTENU : notoriété SADARI, publications régulières, preuves de résultats.

Présente la réponse comme un PLAN : Objectif → Cible → Canaux & actions concrètes → Message clé → Effort/Budget (faible/moyen/élevé) → Calendrier (cette semaine / ce mois) → Indicateur de succès.
Utilise les chiffres du CONTEXTE pour PRIORISER (ex. concentrer l'acquisition sur le produit à plus forte marge ou plus fort volume), mais tu PEUX proposer des tactiques externes même si elles ne sont pas dans les données. Tu peux aussi rédiger des messages WhatsApp / posts / scripts d'appel prêts à l'emploi.
ATTENTION : ne qualifie JAMAIS un client de « perdu » s'il a acheté récemment (même un AUTRE produit). Distingue « client à reconquérir » (n'achète plus rien) de « client actif qui n'a pas repris TEL produit » (= opportunité de cross-sell, pas une perte). Si le contexte ne donne que l'ancienneté par produit, reste prudent sur le mot « perdu ».`,
  };
  return persos[persona] || persos.comptable;
}

// Vérifie le jeton Supabase (l'appelant est un membre connecté)
async function verifierUtilisateur(token, env) {
  if (!token) return false;
  try {
    const r = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
      headers: { apikey: env.SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` },
    });
    return r.ok;
  } catch (e) { return false; }
}

// ── Moteur DeepSeek (format OpenAI) ───────────────
async function callDeepSeek(system, messages, model, env) {
  if (!env.DEEPSEEK_API_KEY) throw { status: 500, detail: 'DEEPSEEK_API_KEY non configurée' };
  const r = await fetch('https://api.deepseek.com/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.DEEPSEEK_API_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      model, max_tokens: 1500,
      messages: [{ role: 'system', content: system }, ...messages],
    }),
  });
  if (!r.ok) throw { status: 502, detail: 'DeepSeek ' + r.status + ' ' + (await r.text()).slice(0, 200) };
  const data = await r.json();
  return data?.choices?.[0]?.message?.content?.trim() || '';
}

// ── Moteur Claude (API Messages) ──────────────────
async function callClaude(system, messages, model, env) {
  if (!env.ANTHROPIC_API_KEY) throw { status: 500, detail: 'ANTHROPIC_API_KEY non configurée' };
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({ model, max_tokens: 1500, system, messages }),
  });
  if (!r.ok) throw { status: 502, detail: 'Claude ' + r.status + ' ' + (await r.text()).slice(0, 200) };
  const data = await r.json();
  return (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n').trim();
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });
    if (request.method !== 'POST') return json({ error: 'POST uniquement' }, 405);

    // Auth : jeton Supabase de l'appelant
    const auth = request.headers.get('Authorization') || '';
    const token = auth.replace(/^Bearer\s+/i, '');
    if (!(await verifierUtilisateur(token, env))) return json({ error: 'Non autorisé' }, 401);

    let body;
    try { body = await request.json(); } catch (e) { return json({ error: 'JSON invalide' }, 400); }
    const { persona = 'comptable', question = '', contexte = {}, history = [], tier = 'eco' } = body;
    if (!question.trim()) return json({ error: 'Question vide' }, 400);

    const route = TIERS[tier] || TIERS.eco;
    const system = systemPrompt(persona, contexte)
      + `\n\nCONTEXTE (données réelles, JSON) :\n${JSON.stringify(contexte)}`;
    const messages = [
      ...(Array.isArray(history) ? history.slice(-8) : []),
      { role: 'user', content: question },
    ];

    try {
      const reply = route.provider === 'claude'
        ? await callClaude(system, messages, route.model, env)
        : await callDeepSeek(system, messages, route.model, env);
      return json({ reply: reply || '(pas de réponse)', provider: route.provider, model: route.model });
    } catch (e) {
      return json({ error: 'Moteur IA indisponible', detail: (e?.detail || String(e)).slice(0, 300) }, e?.status || 502);
    }
  },
};
