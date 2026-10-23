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
  demanderFerme: async (f, g, d) => { appels.push(['demander', f, g, d.quoi, d.jour]);
    if (d.quoi === 'zones') return { ok: true, cameras: [{ id: 'c1', nom: 'Entrée', zones: [{ id: 'z1', nom: 'Porte' }] }] };
    if (d.quoi === 'evenements') { const j = Date.parse('2026-10-15T00:00:00Z'); return { ok: true, evenements: [{ t: j - 5000, zid: 'z1', type: 'personne' }, { t: j + 3600e3, zid: 'z1', type: 'personne', nom: 'secret' }, { t: j + 7200e3, zid: 'z1', type: 'personne', employe: true }, { t: j + 9000e3, zid: 'z1', type: 'vehicule_rentre' }] }; }
    return { ok: true, actif: true, embauche: '07:30', tolerance: 10, lignes: [{ id: 'k', nom: 'Kossi', arrivee: 1, depart: null, passages: 1, statut: 'present' }] }; },
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
r = await appeler('/cameras/zones', 'patron');
ok(r.ok && r.gardiens[0].cameras[0].zones[0].nom === 'Porte' && r.gardiens[1].en_ligne === false, 'zones des caméras reliées (Gardien hors ligne signalé)');
r = await appeler('/cameras/entrees', 'patron', { date: '2026-10-15' });
ok(r.ok && r.entrees.length === 2 && r.entrees[0].cle === 'a'.repeat(32) + ':z1' && r.entrees[1].employe === true && !JSON.stringify(r).includes('secret') && r.erreurs.length === 1,
  'entrées du jour seulement (veille et véhicule exclus), employé marqué, aucun autre champ ne sort');
ok((await appeler('/cameras/entrees', 'vendeur')).s === 403, 'fréquentation réservée au responsable');
console.log(echecs ? `${echecs} échec(s)` : 'Tout est bon.');
process.exit(echecs ? 1 : 0);
