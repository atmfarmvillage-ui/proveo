// ══════════════════════════════════════════════════
// Caméras MIGNA × pointage PROVENDA (Lot D5 des caméras, 15/10).
// Le Gardien MIGNA du site reconnaît les employés enregistrés (sur place, avec leur consentement) et en tire un
// pointage du jour. Ici, la provenderie reliée le LIT — noms et heures seulement, jamais de visage ni de photo.
//
//  POST /cameras/lier     { code, nom }  → relie un Gardien (code à 6 chiffres affiché par MIGNA) à l'entreprise
//  POST /cameras/liste    {}             → Gardiens reliés (et en ligne ou non)
//  POST /cameras/pointage { date }       → propositions de pointage du jour (« AAAA-MM-JJ ») de chaque Gardien relié
//  POST /cameras/delier   { g }          → retire un Gardien
// Réservé au RESPONSABLE (propriétaire, admin ou gérant) — même règle que la page Salaires et la RLS de gp_pointage.
// Tout se fait avec le jeton de l'utilisateur (RLS de Supabase) : ce worker n'a aucun accès administrateur.
// Le relais des caméras est joint par une liaison de service (CAMERAS → migna-cameras, point d'entrée Questions).
// ══════════════════════════════════════════════════

const ROLES_RESPONSABLE = ['admin', 'gerant'];

async function sb(env, token, chemin, init = {}) {
  const r = await fetch(`${env.SUPABASE_URL}/rest/v1/${chemin}`, { ...init,
    headers: { apikey: env.SUPABASE_ANON_KEY, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(init.headers || {}) } });
  if (!r.ok) throw new Error(`Supabase ${r.status} sur ${chemin.split('?')[0]} : ${(await r.text()).slice(0, 160)}`);
  return r.status === 204 ? null : r.json().catch(() => null);
}

/** Qui appelle : { id, admin_id, responsable } — membre (gp_membres) ou propriétaire déclaré (gp_config.plan = OWNER). */
export async function quiAppelle(env, token) {
  const u = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, { headers: { apikey: env.SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` } });
  if (!u.ok) return null;
  const { id } = await u.json();
  const m = ((await sb(env, token, `gp_membres?user_id=eq.${id}&select=admin_id,role,actif&limit=1`)) || [])[0];
  if (m && m.actif !== false) return { id, admin_id: m.admin_id, responsable: ROLES_RESPONSABLE.includes(m.role) };
  const c = ((await sb(env, token, `gp_config?user_id=eq.${id}&select=plan&limit=1`)) || [])[0];
  if (c && String(c.plan || '').toUpperCase() === 'OWNER') return { id, admin_id: id, responsable: true };
  return null;
}

/** deps = { json } (réponse avec les en-têtes CORS du worker). */
export async function routeCameras(request, env, url, deps) {
  const { json } = deps;
  if (request.method !== 'POST') return json({ ok: false, erreur: 'POST uniquement' }, 405);
  if (!env.CAMERAS) return json({ ok: false, erreur: 'Caméras MIGNA non disponibles sur ce serveur.' }, 503);
  const token = (request.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  const qui = token ? await quiAppelle(env, token).catch(() => null) : null;
  if (!qui) return json({ ok: false, erreur: 'Non autorisé' }, 401);
  if (!qui.responsable) return json({ ok: false, erreur: 'Réservé au responsable (propriétaire, admin ou gérant).' }, 403);
  let c = {}; try { c = await request.json(); } catch (e) { /* corps vide */ }
  const entreprise = 'proveo:' + qui.admin_id;

  try {
    if (url.pathname === '/cameras/lier') {
      const code = String(c.code || '').replace(/\D/g, '');
      if (code.length !== 6) return json({ ok: false, erreur: 'Le code a 6 chiffres (affiché par MIGNA : Mes caméras → carte de liaison).' }, 400);
      const r = await env.CAMERAS.lier(code, { id: entreprise, nom: String(c.nom || 'Provenderie').slice(0, 60) });
      if (!r || !r.ok) return json({ ok: false, erreur: (r && r.erreur) || 'Liaison impossible.' }, 400);
      await sb(env, token, 'gp_cameras_liaisons?on_conflict=admin_id,gardien', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify({ admin_id: qui.admin_id, gardien: r.g, lieu: String(r.lieu || '').slice(0, 60), lie_par: qui.id, lie_le: new Date().toISOString() }) });
      return json({ ok: true, gardien: r.g, lieu: r.lieu || '', en_ligne: !!r.en_ligne });
    }
    if (url.pathname === '/cameras/liste') {
      const lieux = (await env.CAMERAS.lieuxFerme(entreprise)) || [];
      return json({ ok: true, gardiens: lieux.map((l) => ({ g: l.g, lieu: l.lieu, en_ligne: !!l.en_ligne, parti_a: l.parti_a || null })) });
    }
    if (url.pathname === '/cameras/pointage') {
      const jour = /^\d{4}-\d\d-\d\d$/.test(String(c.date || '')) ? c.date : new Date().toISOString().slice(0, 10);
      const lieux = (await env.CAMERAS.lieuxFerme(entreprise)) || [], gardiens = [];
      for (const l of lieux) {
        if (!l.en_ligne) { gardiens.push({ g: l.g, lieu: l.lieu, en_ligne: false, lignes: [], erreur: 'Gardien hors ligne' }); continue; }
        let r;
        try { r = await env.CAMERAS.demanderFerme(entreprise, l.g, { quoi: 'pointage', jour }); } catch (e) { r = { ok: false, erreur: e.message }; }
        gardiens.push({ g: l.g, lieu: l.lieu, en_ligne: true, actif: !!(r && r.actif), embauche: r && r.embauche, tolerance: r && r.tolerance,
          lignes: (r && r.ok && r.lignes) || [], erreur: r && !r.ok ? (r.erreur || 'Réponse illisible') : undefined });
      }
      return json({ ok: true, jour, gardiens });
    }
    if (url.pathname === '/cameras/delier') {
      const g = String(c.g || '');
      if (!/^[a-f0-9]{32}$/.test(g)) return json({ ok: false, erreur: 'Gardien invalide' }, 400);
      const r = await env.CAMERAS.delierFerme(entreprise, g);
      await sb(env, token, `gp_cameras_liaisons?admin_id=eq.${qui.admin_id}&gardien=eq.${g}`, { method: 'DELETE', headers: { Prefer: 'return=minimal' } });
      return json({ ok: !!(r && r.ok), erreur: r && !r.ok ? r.erreur : undefined });
    }
  } catch (e) {
    return json({ ok: false, erreur: e.message }, 502);
  }
  return json({ ok: false, erreur: 'Introuvable' }, 404);
}
