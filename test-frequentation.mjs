// Fréquentation (Lot E1 des caméras MIGNA) : node test-frequentation.mjs
import { createRequire } from 'node:module';
const { frequentation } = createRequire(import.meta.url)('./js/frequentation.js');

let echecs = 0;
const ok = (c, m) => { console.log((c ? 'ok   - ' : 'ÉCHEC - ') + m); if (!c) echecs++; };
const T = (h, m = 0) => new Date(2026, 9, 15, h, m).getTime();
const zones = { 'g1:entree': 'Lomé Centre', 'g1:quai': 'Lomé Centre', 'g2:porte': 'Kpalimé' };
const E = (h, cle = 'g1:entree', employe = false) => ({ t: T(h, 10), cle, employe });
const entrees = [E(8), E(8), E(9, 'g1:quai'), E(10), E(10), E(10), E(10), E(10), E(10), E(7, 'g1:entree', true), E(7, 'g1:entree', true), E(11, 'g9:autre')];
const ventes = [{ t: T(8, 20), point_vente: 'Lomé Centre' }, { t: T(9, 5), point_vente: 'Lomé Centre' }, { t: T(15), point_vente: 'Lomé Centre' }, { t: T(15, 30), point_vente: 'Lomé Centre' },
  { t: T(9), point_vente: 'Production' }];
const r = frequentation(entrees, ventes, zones);
const lome = r.find((x) => x.pdv === 'Lomé Centre'), kpal = r.find((x) => x.pdv === 'Kpalimé');
ok(lome.entrees === 9 && lome.ventes === 4 && lome.taux === 44, 'Lomé Centre : 9 entrées (2 zones), 4 ventes → 44 % de clients servis');
ok(!lome.heures.some((h) => h.h === 7), 'les 2 passages d\'employés reconnus (7 h) ne comptent pas comme clients');
ok(lome.alertes.includes('10 h : 6 entrées, aucune vente'), 'alerte : 6 entrées à 10 h, aucune vente');
ok(lome.alertes.includes('15 h : 2 ventes sans aucune entrée vue'), 'alerte : 2 ventes à 15 h sans entrée vue (caméra active ce jour-là)');
ok(kpal && kpal.entrees === 0 && kpal.taux === null && !kpal.camera && kpal.alertes.length === 0, 'Kpalimé : caméra muette ce jour → pas de taux, pas d\'alerte (on n\'accuse pas sans données)');
ok(!r.some((x) => x.pdv === 'Production'), 'point de vente sans caméra : hors du tableau');
ok(r.every((x) => !x.alertes.some((a) => a.startsWith('11 h'))), 'zone inconnue (g9) : ignorée');
console.log(echecs ? `${echecs} échec(s)` : 'Tout est bon.');
process.exit(echecs ? 1 : 0);
