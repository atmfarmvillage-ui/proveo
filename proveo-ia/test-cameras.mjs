// Caméras MIGNA × pointage (Lot D5) : node test-cameras.mjs — faux Supabase (fetch) et faux relais (env.CAMERAS).
import { routeCameras, quiAppelle } from './src/cameras.js';

let echecs = 0;
const ok = (c, m) => { console.log((c ? 'ok   - ' : 'ÉCHEC - ') + m); if (!c) echecs++; };
const ADMIN = '11fdf99b-f2f3-48f9-907d-0c32944c46f6';
const utilisateurs = { patron: { id: 'u-patron', membre: { admin_id: ADMIN, role: 'gerant', actif: true } }, vendeur: { id: 'u-vendeur', membre: { admin_id: ADMIN, role: 'secretaire', actif: true } },
  owner: { id: ADMIN, membre: null, plan: 'OWNER' }, inconnu: { id: 'u-x', membre: null, plan: null }, desactive: { id: 'u-d', membre: { admin_id: ADMIN, role: 'admin', actif: false } } };
const ecrits = [];
globalThis.fetch = async (url, o = {}) => {
  const u = new URL(String(url)), jeton = (o.headers && o.headers.Authorization || '').replace('Bearer ', ''), qui = utilisateurs[jeton];
  if (u.pathname === '/auth/v1/user') return qui ? new Response(JSON.stringify({ id: qui.id })) : new Response('{}', { status: 401 });
  if (u.pathname.endsWith('/gp_membres')) return new Response(JSON.stringify(qui && qui.membre ? [qui.membre] : []));
  if (u.pathname.endsWith('/gp_config')) return new Response(JSON.stringify(qui && qui.plan ? [{ plan: qui.plan }] : []));
  if (u.pathname.endsWith('/gp_cameras_liaisons')) { ecrits.push({ m: o.method, q: u.search, corps: o.body ? JSON.parse(o.body) : null }); return new Response(null, { status: 201 }); }
  return new Response('[]');
};
const appels = [];
const env = { SUPABASE_URL: 'https://sb.test', SUPABASE_ANON_KEY: 'anon', CAMERAS: {
  lier: async (code, f) => { appels.push(['lier', code, f.id]); return code === '482193' ? { ok: true, g: 'a'.repeat(32), lieu: 'Provenderie', en_ligne: true } : { ok: false, erreur: 'Code inconnu ou expiré' }; },
  lieuxFerme: async (f) => [{ g: 'a'.repeat(32), lieu: 'Provenderie', en_ligne: true }, { g: 'b'.repeat(32), lieu: 'Magasin', en_ligne: false }],
  demanderFerme: async (f, g, d) => { appels.push(['demander', f, g, d.quoi, d.jour]); return { ok: true, actif: true, embauche: '07:30', tolerance: 10, lignes: [{ id: 'k', nom: 'Kossi', arrivee: 1, depart: null, passages: 1, statut: 'present' }] }; },
  delierFerme: async () => ({ ok: true }),
} };
const json = (o, s = 200) => new Response(JSON.stringify(o), { status: s });
const appeler = async (chemin, jeton, corps) => {
  const r = await routeCameras(new Request('https://ia.test' + chemin, { method: 'POST', headers: { Authorization: 'Bearer ' + jeton }, body: JSON.stringify(corps || {}) }), env, new URL('https://ia.test' + chemin), { json });
  return { s: r.status, ...(await r.json()) };
};

ok((await quiAppelle(env, 'patron')).responsable && (await quiAppelle(env, 'owner')).admin_id === ADMIN, 'gérant et propriétaire = responsables');
ok(!(await quiAppelle(env, 'vendeur')).responsable && (await quiAppelle(env, 'inconnu')) === null && (await quiAppelle(env, 'desactive')) === null, 'secrétaire pas responsable ; inconnu et compte désactivé refusés');
ok((await appeler('/cameras/pointage', 'vendeur')).s === 403, 'une secrétaire ne lit pas le pointage des caméras (comme la page Salaires)');
ok((await appeler('/cameras/pointage', 'personne')).s === 401, 'sans connexion : refusé');
let r = await appeler('/cameras/lier', 'patron', { code: '482 193', nom: 'SADARI' });
ok(r.ok && appels[0][1] === '482193' && appels[0][2] === 'proveo:' + ADMIN && ecrits[0].corps.admin_id === ADMIN && ecrits[0].q.includes('on_conflict=admin_id,gardien'), 'liaison : code nettoyé, entreprise « proveo:<id> », Gardien retenu dans gp_cameras_liaisons');
ok((await appeler('/cameras/lier', 'patron', { code: '111111' })).erreur === 'Code inconnu ou expiré', 'code faux : la raison du relais est montrée');
ok((await appeler('/cameras/lier', 'patron', { code: '12' })).s === 400, 'code trop court : refusé avant le relais');
r = await appeler('/cameras/pointage', 'owner', { date: '2026-10-15' });
ok(r.ok && r.gardiens.length === 2 && r.gardiens[0].lignes[0].nom === 'Kossi' && r.gardiens[1].erreur === 'Gardien hors ligne' && appels.some((a) => a[0] === 'demander' && a[3] === 'pointage' && a[4] === '2026-10-15'), 'pointage : propositions du Gardien en ligne ; l\'autre signalé hors ligne');
r = await appeler('/cameras/delier', 'patron', { g: 'a'.repeat(32) });
ok(r.ok && ecrits.some((e) => e.m === 'DELETE' && e.q.includes('gardien=eq.' + 'a'.repeat(32))), 'délier : relais + ligne effacée');
console.log(echecs ? `${echecs} échec(s)` : 'Tout est bon.');
process.exit(echecs ? 1 : 0);
