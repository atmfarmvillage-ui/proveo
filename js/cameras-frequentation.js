// ══════════════════════════════════════════════════
// Fréquentation par les caméras MIGNA (Lot E1, 15/10) — page Comparatif PDV, RESPONSABLE seulement.
// Entrées comptées par le Gardien (zones « entrée » rattachées à un point de vente) contre ventes Provéo, par heure.
// Calcul : frequentation() (js/frequentation.js). Rattachements : gp_cameras_zones_pdv. Aucun visage, aucune photo.
// ══════════════════════════════════════════════════

async function renderFrequentation() {
  const el = document.getElementById('comp-frequentation');
  if (!el) return;
  if (GP_ROLE !== 'admin') { el.innerHTML = ''; return; }
  const champ = document.getElementById('freq-date');
  const date = (champ && champ.value) || today();
  const entete = `<div class="card-title"><div class="ct-left"><span>📹 Fréquentation : entrés contre servis</span></div>
    <input type="date" id="freq-date" value="${date}" onchange="renderFrequentation()" style="width:auto"></div>`;
  el.innerHTML = `<div class="card" style="margin-top:14px">${entete}<div style="font-size:12px;color:var(--textm)">📹 Lecture des caméras…</div></div>`;
  const liste = await camAppel('/cameras/liste');
  if (!liste.ok || !liste.gardiens.length) {
    el.innerHTML = `<div class="card" style="margin-top:14px">${entete}<div style="font-size:12px;color:var(--textm)">${liste.ok
      ? 'Aucune caméra MIGNA reliée. Reliez-les depuis Salaires → Pointage (« Relier les caméras »), puis rattachez ici chaque zone d\'entrée à son point de vente.'
      : camEsc(liste.erreur || '?')}</div></div>`;
    return;
  }
  const [ent, rats, ventes, pdvs] = await Promise.all([
    camAppel('/cameras/entrees', { date }),
    SB.from('gp_cameras_zones_pdv').select('*').eq('admin_id', GP_ADMIN_ID).then((r) => r.data || []),
    SB.from('gp_ventes').select('point_vente,created_at').eq('admin_id', GP_ADMIN_ID).is('deleted_at', null).eq('date', date).then((r) => r.data || []),
    SB.from('gp_points_vente').select('nom').eq('admin_id', GP_ADMIN_ID).then((r) => (r.data || []).map((p) => p.nom).filter(Boolean)),
  ]);
  const zonesPdv = {}; rats.forEach((z) => { if (z.point_vente) zonesPdv[z.gardien + ':' + z.zone_id] = z.point_vente; });
  const r = frequentation(ent.entrees || [], ventes.map((v) => ({ t: Date.parse(v.created_at), point_vente: v.point_vente })), zonesPdv);
  const barres = (p) => {
    const max = Math.max(1, ...p.heures.map((x) => Math.max(x.entrees, x.ventes)));
    return `<div style="display:flex;align-items:flex-end;gap:3px;height:54px;margin-top:6px">${p.heures.map((x) => `<div title="${x.h} h : ${x.entrees} entrées, ${x.ventes} ventes" style="flex:1;display:flex;flex-direction:column;justify-content:flex-end;gap:1px;min-width:10px">
        <div style="height:${Math.round(48 * x.entrees / max)}px;background:var(--blue,#3B82F6);border-radius:3px 3px 0 0"></div>
        <div style="height:${Math.round(48 * x.ventes / max)}px;background:var(--green);border-radius:0 0 3px 3px"></div></div>`).join('')}</div>
      <div style="display:flex;justify-content:space-between;font-size:9px;color:var(--textm)">${p.heures.length ? `<span>${p.heures[0].h} h</span><span>${p.heures[p.heures.length - 1].h} h</span>` : ''}</div>`;
  };
  const blocs = r.length ? r.map((p) => `<div style="background:var(--card2);border-radius:10px;padding:10px 12px;margin-bottom:8px">
      <div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap"><b style="font-size:13px">${camEsc(p.pdv)}</b>
        <span style="font-size:12px">${p.camera ? `<b>${p.entrees}</b> entrées · <b>${p.ventes}</b> ventes · <b style="color:var(--green)">${p.taux == null ? '—' : p.taux + ' %'}</b> servis` : '<span style="color:var(--textm)">caméra muette ce jour-là</span>'}</span></div>
      ${p.heures.length ? barres(p) : ''}
      ${p.alertes.map((a) => `<div style="font-size:11px;color:var(--gold);margin-top:4px">⚠️ ${camEsc(a)}</div>`).join('')}</div>`).join('')
    : '<div style="font-size:12px;color:var(--textm)">Rattachez d\'abord une zone d\'entrée à un point de vente (ci-dessous).</div>';
  const zonesHtml = await freqZonesHtml(rats, pdvs);
  el.innerHTML = `<div class="card" style="margin-top:14px">${entete}
    <div style="font-size:11px;color:var(--textm);margin-bottom:8px"><span style="color:var(--blue,#3B82F6)">■</span> entrées comptées par la caméra · <span style="color:var(--green)">■</span> ventes enregistrées. Les employés reconnus ne comptent pas.</div>
    ${blocs}
    ${(ent.erreurs || []).length ? `<div style="font-size:11px;color:var(--gold);margin:6px 0">⚠️ ${ent.erreurs.map(camEsc).join(' · ')}</div>` : ''}
    <details style="margin-top:8px"><summary style="cursor:pointer;font-size:12px;font-weight:700">⚙️ Zones d'entrée → point de vente</summary>${zonesHtml}</details>
    <div style="font-size:10px;color:var(--textm);margin-top:8px">Une même personne peut être comptée deux fois si elle ressort et rentre. Les alertes sont des pistes à vérifier, pas des preuves.</div></div>`;
}

/** Liste des zones des caméras, chacune avec son point de vente (ou « pas un point de vente »). */
async function freqZonesHtml(rats, pdvs) {
  const z = await camAppel('/cameras/zones');
  if (!z.ok) return `<div style="font-size:12px;color:var(--red)">${camEsc(z.erreur || '?')}</div>`;
  const parCle = {}; rats.forEach((x) => { parCle[x.gardien + ':' + x.zone_id] = x.point_vente || ''; });
  const noms = [...new Set(['Production', ...pdvs])];
  const lignes = [];
  for (const g of z.gardiens) {
    if (!g.en_ligne) { lignes.push(`<div style="font-size:11px;color:var(--textm);margin:6px 0">${camEsc(g.lieu || 'Gardien')} : hors ligne (ses zones s'afficheront à son retour)</div>`); continue; }
    for (const cam of g.cameras || []) for (const zo of cam.zones || []) {
      const cle = g.g + ':' + zo.id, actuel = parCle[cle] || '';
      lignes.push(`<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin:6px 0"><span style="font-size:12px;flex:1;min-width:150px"><b>${camEsc(zo.nom)}</b> · ${camEsc(cam.nom)}</span>
        <select style="min-width:180px" onchange='freqRattacher(${JSON.stringify(g.g)}, ${JSON.stringify(zo.id)}, ${JSON.stringify(zo.nom)}, ${JSON.stringify(cam.nom)}, this.value)'>
          <option value="">— pas un point de vente —</option>${noms.map((n) => `<option${n === actuel ? ' selected' : ''}>${camEsc(n)}</option>`).join('')}</select></div>`);
    }
  }
  return lignes.join('') || '<div style="font-size:12px;color:var(--textm)">Aucune zone dessinée sur les caméras : dessinez-en dans MIGNA (🎯 Zones).</div>';
}

async function freqRattacher(gardien, zoneId, zoneNom, cameraNom, pdv) {
  const { error } = await SB.from('gp_cameras_zones_pdv').upsert({ admin_id: GP_ADMIN_ID, gardien, zone_id: zoneId, zone_nom: zoneNom, camera_nom: cameraNom, point_vente: pdv || null, maj_le: new Date().toISOString() },
    { onConflict: 'admin_id,gardien,zone_id' });
  if (error) { notify('Rattachement non enregistré : ' + error.message, 'r'); return; }
  notify(pdv ? `✓ « ${zoneNom} » → ${pdv}` : `« ${zoneNom} » n'est plus un point de vente`, 'g');
  renderFrequentation();
}
