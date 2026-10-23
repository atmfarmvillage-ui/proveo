// ══════════════════════════════════════════════════
// Fréquentation : entrés contre servis, par point de vente (Lot E1 des caméras MIGNA, 15/10).
// Le Gardien MIGNA compte les ENTRÉES dans les zones « entrée » (aucun visage, aucune photo ne sort) ; Provéo connaît
// les VENTES. Une zone est rattachée à UN point de vente (gp_cameras_zones_pdv). Les passages d'employés reconnus
// (pointage, Lot D) ne comptent pas comme clients.
// Fonction PURE : frequentation(entrees, ventes, zonesPdv) — testée par test-frequentation.mjs.
//   entrees : [{ t (ms), cle: 'gardien:zid', employe }] ; ventes : [{ t (ms), point_vente }] ; zonesPdv : { 'gardien:zid': 'PDV' }
// Rend [{ pdv, entrees, ventes, taux, heures: [{h, entrees, ventes}], alertes: [texte] }] (PDV ayant au moins une zone).
// Alertes : une heure à ≥ ENTREES_SANS_VENTE entrées et aucune vente (vendeur absent ? rupture ? file trop longue ?) ;
//           une heure à ≥ VENTES_SANS_ENTREE ventes sans aucune entrée vue alors que la caméra comptait ce jour-là.
// ══════════════════════════════════════════════════

const ENTREES_SANS_VENTE = 5, VENTES_SANS_ENTREE = 2;

function frequentation(entrees, ventes, zonesPdv) {
  const parPdv = {};
  const pdv = (nom) => (parPdv[nom] = parPdv[nom] || { pdv: nom, entrees: 0, ventes: 0, h: Array.from({ length: 24 }, () => ({ e: 0, v: 0 })), actif: false });
  for (const nom of new Set(Object.values(zonesPdv || {}))) if (nom) pdv(nom);
  for (const e of entrees || []) {
    const nom = (zonesPdv || {})[e.cle];
    if (!nom) continue;
    const p = pdv(nom); p.actif = true;                      // la caméra a compté ce jour-là
    if (e.employe) continue;                                 // un employé reconnu n'est pas un client
    p.entrees++; p.h[new Date(e.t).getHours()].e++;
  }
  for (const v of ventes || []) {
    const p = parPdv[v.point_vente || 'Production'];
    if (!p) continue;                                        // point de vente sans caméra : hors de ce tableau
    p.ventes++; p.h[new Date(v.t).getHours()].v++;
  }
  return Object.values(parPdv).map((p) => {
    const alertes = [];
    p.h.forEach((x, h) => {
      if (x.e >= ENTREES_SANS_VENTE && x.v === 0) alertes.push(`${h} h : ${x.e} entrées, aucune vente`);
      if (p.actif && x.v >= VENTES_SANS_ENTREE && x.e === 0) alertes.push(`${h} h : ${x.v} ventes sans aucune entrée vue`);
    });
    return { pdv: p.pdv, entrees: p.entrees, ventes: p.ventes, taux: p.entrees ? Math.min(100, Math.round(100 * p.ventes / p.entrees)) : null,
      camera: p.actif, heures: p.h.map((x, h) => ({ h, entrees: x.e, ventes: x.v })).filter((x) => x.entrees || x.ventes), alertes };
  }).sort((a, b) => b.entrees - a.entrees);
}

if (typeof module !== 'undefined' && module.exports) module.exports = { frequentation, ENTREES_SANS_VENTE, VENTES_SANS_ENTREE };
