// ══════════════════════════════════════════════════
// Pointage proposé par les caméras MIGNA (Lot D5, 15/10) — onglet Salaires → Pointage, RESPONSABLE seulement.
// Le Gardien MIGNA du site reconnaît les employés enregistrés (avec leur consentement, sur place) ; Provéo lit ses
// propositions par le worker proveo-ia (/cameras/…) : noms et heures, jamais de visage.
//  - Une personne vue par la caméra est associée UNE FOIS à un ouvrier du registre (gp_cameras_personnes).
//  - Mode « validation » (défaut) : le responsable valide d'un geste ; mode « automatique » : les ouvriers pas encore
//    pointés le sont seuls, marqués 📹 (source = 'camera'). Un pointage déjà saisi n'est JAMAIS écrasé.
// Tables : gp_cameras_liaisons, gp_cameras_personnes, gp_cameras_reglages ; gp_pointage.source / arrivee_camera / depart_camera.
// ══════════════════════════════════════════════════

const CAM_WORKER = (typeof IA_WORKER !== 'undefined' ? IA_WORKER : 'https://proveo-ia.atm-farmvillage.workers.dev');
const CAM_STATUTS = { present: ['✓ Présent', 'var(--green)'], retard: ['⏰ Retard', 'var(--gold)'], absent: ['✕ Absent', 'var(--red)'] };

async function camAppel(chemin, corps) {
  const jeton = (await SB.auth.getSession())?.data?.session?.access_token;
  try {
    const r = await fetch(CAM_WORKER + chemin, { method: 'POST', headers: { Authorization: 'Bearer ' + jeton, 'Content-Type': 'application/json' }, body: JSON.stringify(corps || {}) });
    return await r.json();
  } catch (e) { return { ok: false, erreur: 'Serveur injoignable : ' + e.message }; }
}

const camHeure = (t) => (t ? new Date(t).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : '—');
const camEsc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** Carte « 📹 Caméras MIGNA » au-dessus du pointage du jour. */
async function renderCamPointage() {
  const el = document.getElementById('cam-pointage');
  if (!el) return;
  if (GP_ROLE !== 'admin') { el.innerHTML = ''; return; }        // admin = propriétaire, admin ou gérant (aliasé)
  const date = document.getElementById('point-date')?.value || today();
  el.innerHTML = '<div class="card" style="margin-bottom:14px;font-size:12px;color:var(--textm)">📹 Lecture des caméras…</div>';
  const liste = await camAppel('/cameras/liste');
  if (!liste.ok) { el.innerHTML = `<div class="card" style="margin-bottom:14px;font-size:12px;color:var(--red)">📹 ${camEsc(liste.erreur || '?')}</div>`; return; }
  if (!liste.gardiens.length) {
    el.innerHTML = `<div class="card" style="margin-bottom:14px">
      <div class="card-title"><div class="ct-left"><span>📹 Pointage par les caméras MIGNA</span></div></div>
      <div style="font-size:12px;color:var(--textm);margin-bottom:10px">Les caméras MIGNA du site reconnaissent les employés enregistrés (avec leur accord) et proposent leurs arrivées et départs ici. Dans MIGNA : Mes caméras → carte de liaison → « Obtenir un code de liaison », puis tapez le code :</div>
      <div style="display:flex;gap:8px;flex-wrap:wrap"><input id="cam-code" inputmode="numeric" maxlength="7" placeholder="482193" style="width:140px;font-family:monospace;letter-spacing:2px">
        <button class="btn btn-primary" onclick="camLier()">🔗 Relier les caméras</button></div>
      <div id="cam-msg" style="font-size:12px;margin-top:8px"></div></div>`;
    return;
  }
  const [pt, assoc, reg, deja] = await Promise.all([
    camAppel('/cameras/pointage', { date }),
    SB.from('gp_cameras_personnes').select('*').eq('admin_id', GP_ADMIN_ID).then((r) => r.data || []),
    SB.from('gp_cameras_reglages').select('mode').eq('admin_id', GP_ADMIN_ID).maybeSingle().then((r) => (r.data && r.data.mode) || 'validation'),
    SB.from('gp_pointage').select('ouvrier_id,statut,source').eq('admin_id', GP_ADMIN_ID).eq('date', date).then((r) => r.data || []),
  ]);
  const ouvriers = (await loadOuvriers()).filter((o) => o.statut !== 'inactif');
  const parPersonne = {}; assoc.forEach((a) => { parPersonne[a.personne_id] = a; });
  const pointe = {}; deja.forEach((p) => { pointe[p.ouvrier_id] = p; });
  const lignes = [], aAssocier = [], erreurs = [];
  for (const g of (pt.gardiens || [])) {
    if (g.erreur) erreurs.push(`${g.lieu || 'Gardien'} : ${g.erreur}`);
    for (const l of g.lignes || []) {
      const a = parPersonne[l.id];
      if (!a || !a.ouvrier_id) { aAssocier.push(l); continue; }
      const o = ouvriers.find((x) => x.id === a.ouvrier_id);
      if (o) lignes.push({ ...l, ouvrier: o, deja: pointe[o.id] });
    }
  }
  // Mode automatique : les ouvriers PAS ENCORE pointés ce jour-là le sont seuls (jamais d'écrasement).
  let ecritsAuto = 0;
  if (reg === 'auto') {
    for (const l of lignes) if (!l.deja) { if (await camEcrire(l.ouvrier, date, l, true)) { l.deja = { statut: l.statut, source: 'camera' }; ecritsAuto++; } }
    if (ecritsAuto && typeof renderPointage === 'function') renderPointage();
  }
  const ligneHtml = (l) => {
    const p = CAM_STATUTS[l.statut] || ['?', 'var(--textm)'];
    const etat = l.deja ? `<span style="font-size:11px;color:var(--textm)">${l.deja.source === 'camera' ? '📹 ' : ''}pointé : <b>${camEsc((CAM_STATUTS[l.deja.statut] || [l.deja.statut])[0])}</b></span>`
      : `<button class="btn btn-sm" style="background:${p[1]};color:#fff" onclick='camValider(${JSON.stringify(l.ouvrier.id)}, ${JSON.stringify(l)})'>${camEsc(p[0])}</button>`;
    return `<div style="background:var(--card2);border-radius:10px;padding:9px 12px;margin-bottom:6px;display:flex;align-items:center;gap:10px;flex-wrap:wrap">
      <div style="flex:1;min-width:160px"><div style="font-size:12px;font-weight:700">${camEsc(l.ouvrier.nom_prenom)}</div>
        <div style="font-size:10px;color:var(--textm)">📹 arrivée ${camHeure(l.arrivee)} · départ ${camHeure(l.depart)} · proposé : ${camEsc(p[0])}</div></div>${etat}</div>`;
  };
  const opts = '<option value="">— Quel ouvrier ? —</option>' + ouvriers.map((o) => `<option value="${o.id}">${camEsc(o.nom_prenom)}</option>`).join('');
  el.innerHTML = `<div class="card" style="margin-bottom:14px">
    <div class="card-title"><div class="ct-left"><span>📹 Proposé par les caméras</span></div>
      <label style="font-size:11px;display:flex;align-items:center;gap:6px;cursor:pointer"><input type="checkbox" ${reg === 'auto' ? 'checked' : ''} onchange="camMode(this.checked)"> pointer automatiquement</label></div>
    ${ecritsAuto ? `<div style="font-size:12px;color:var(--green);margin-bottom:8px">✓ ${ecritsAuto} pointage(s) écrit(s) automatiquement (marqués 📹).</div>` : ''}
    ${lignes.length ? lignes.map(ligneHtml).join('') : '<div style="font-size:12px;color:var(--textm)">Aucun employé reconnu ce jour-là.</div>'}
    ${aAssocier.length ? `<div style="font-size:12px;font-weight:700;margin:12px 0 6px">À associer une fois (personne vue par la caméra → ouvrier du registre)</div>` + aAssocier.map((l) => `
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:6px"><span style="font-size:12px;min-width:120px">📹 <b>${camEsc(l.nom)}</b></span>
        <select style="flex:1;min-width:180px" onchange='camAssocier(${JSON.stringify(l.id)}, ${JSON.stringify(l.nom)}, this.value)'>${opts}</select></div>`).join('') : ''}
    ${erreurs.length ? `<div style="font-size:11px;color:var(--gold);margin-top:8px">⚠️ ${erreurs.map(camEsc).join(' · ')}</div>` : ''}
    <div style="font-size:10px;color:var(--textm);margin-top:10px">Une caméra peut se tromper (contre-jour, casquette) : en mode validation, rien n'est écrit sans vous. Un pointage déjà saisi n'est jamais remplacé.
      · <a href="#" onclick="camDelierTout();return false" style="color:var(--red)">Délier les caméras</a></div></div>`;
}

/** Écrit le pointage d'un ouvrier à partir d'une proposition (source caméra). */
async function camEcrire(o, date, l, silencieux) {
  const { error } = await SB.from('gp_pointage').upsert({ admin_id: GP_ADMIN_ID, ouvrier_id: o.id, date, statut: l.statut, point_vente: o.point_vente || GP_POINT_VENTE || null,
    saisi_par: GP_USER?.id, source: 'camera', arrivee_camera: l.arrivee ? new Date(l.arrivee).toISOString() : null, depart_camera: l.depart ? new Date(l.depart).toISOString() : null }, { onConflict: 'ouvrier_id,date' });
  if (error) { if (!silencieux) notify('Pointage non enregistré : ' + error.message, 'r'); return false; }
  return true;
}

async function camValider(ouvrierId, l) {
  const o = (await loadOuvriers()).find((x) => x.id === ouvrierId); if (!o) return;
  const date = document.getElementById('point-date')?.value || today();
  if (await camEcrire(o, date, l)) { notify('✓ Pointage enregistré', 'g'); renderPointage(); renderCamPointage(); }
}

async function camAssocier(personneId, nom, ouvrierId) {
  if (!ouvrierId) return;
  const { error } = await SB.from('gp_cameras_personnes').upsert({ admin_id: GP_ADMIN_ID, personne_id: personneId, nom_camera: nom, ouvrier_id: ouvrierId, maj_le: new Date().toISOString() }, { onConflict: 'admin_id,personne_id' });
  if (error) { notify('Association non enregistrée : ' + error.message, 'r'); return; }
  notify('✓ Associé', 'g'); renderCamPointage();
}

async function camMode(auto) {
  const { error } = await SB.from('gp_cameras_reglages').upsert({ admin_id: GP_ADMIN_ID, mode: auto ? 'auto' : 'validation', maj_le: new Date().toISOString() }, { onConflict: 'admin_id' });
  if (error) { notify('Réglage non enregistré : ' + error.message, 'r'); return; }
  renderCamPointage();
}

async function camLier() {
  const code = (document.getElementById('cam-code')?.value || '').replace(/\D/g, ''), m = document.getElementById('cam-msg');
  if (code.length !== 6) { if (m) m.innerHTML = '<span style="color:var(--red)">Le code a 6 chiffres.</span>'; return; }
  if (m) m.textContent = '⏳ Liaison…';
  const nom = (typeof GP_CONFIG !== 'undefined' && GP_CONFIG && (GP_CONFIG.nom_provenderie || GP_CONFIG.nom)) || 'Provenderie';
  const r = await camAppel('/cameras/lier', { code, nom });
  if (!r.ok) { if (m) m.innerHTML = `<span style="color:var(--red)">${camEsc(r.erreur || '?')}</span>`; return; }
  notify(`✓ Caméras de « ${r.lieu || 'MIGNA'} » reliées`, 'g'); renderCamPointage();
}

async function camDelierTout() {
  if (!confirm('Délier les caméras MIGNA ? Les propositions de pointage ne viendront plus ici.')) return;
  const l = await camAppel('/cameras/liste');
  for (const g of (l.gardiens || [])) await camAppel('/cameras/delier', { g: g.g });
  renderCamPointage();
}
