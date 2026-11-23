// Test du détail par période d'un débiteur (page Impayés, PROVENDA) + lecture complète des versements.
// Lancer : node test-impayes-periode.mjs (depuis la racine du dépôt)
import fs from 'node:fs'; import vm from 'node:vm'; import { fileURLToPath } from 'node:url';
const R = fileURLToPath(new URL('./js/', import.meta.url));
let echecs = 0; const ok = (c, m) => { console.log((c ? 'ok   - ' : 'ÉCHEC - ') + m); if (!c) echecs++; };

// ── fausse base ──
const VENTES = [], REGS = [];
let id = 1;
// Fairfield (c1) : achats et versements depuis janvier ; un mois d'octobre SANS rien
const achat = (date, mt, f = 'Pondeuse ponte A') => VENTES.push({ id: id++, admin_id: 'A', client_id: 'c1', date, formule_nom: f, qte_vendue: 1000, montant_total: mt, point_vente: 'Production', deleted_at: null });
const verse = (date, mt, mode = 'Espèces') => REGS.push({ id: id++, admin_id: 'A', client_id: 'c1', date_paiement: date, montant: mt, mode, note: '', point_vente: 'Production', deleted_at: null });
achat('2026-01-10', 1000000); verse('2026-02-05', 400000);
achat('2026-08-03', 500000); verse('2026-08-20', 300000, 'Flooz');           // avant la période
achat('2026-09-15', 200000); verse('2026-09-30', 100000);
achat('2026-11-02', 300000); verse('2026-11-02', 250000, 'Virement'); verse('2026-11-18', 150000);
// 1500 versements d'autres clients : la lecture « derniers versements » doit tout voir
for (let i = 0; i < 1500; i++) REGS.push({ id: id++, admin_id: 'A', client_id: 'x' + (i % 40), date_paiement: '2026-03-01', montant: 1000, mode: 'Espèces', note: '', deleted_at: null });
// le plus ancien versement d'un client à part, rangé APRÈS les 1500 en id
REGS.push({ id: id++, admin_id: 'A', client_id: 'vieux', date_paiement: '2025-06-01', montant: 77000, mode: 'Espèces', note: '', deleted_at: null });

let panne = false;
const requete = (table) => {
  const f = []; let rng = null;
  const q = {
    select() { return q; }, eq(k, v) { f.push((r) => r[k] === v); return q; }, is(k, v) { f.push((r) => (r[k] ?? null) === v); return q; },
    order() { return q; }, or() { return q; }, range(a, b) { rng = [a, b]; return q; }, limit() { return q; },
    then(res) {
      if (panne) return res({ data: null, error: { message: 'réseau coupé' } });
      const src = table === 'gp_ventes' ? VENTES : table === 'gp_reglements_clients' ? REGS : [];
      let d = src.filter((r) => f.every((g) => g(r)));
      const [a, b] = rng || [0, 999];
      res({ data: d.slice(a, Math.min(b, a + 999) + 1), error: null });   // jamais plus de 1000
    },
  };
  return q;
};
const els = {};
const el = (i) => els[i] || (els[i] = { id: i, innerHTML: '', textContent: '', style: { display: 'none' } });
const ctx = { console, Date, Math, Number, String, Object, Array, JSON, Promise, setTimeout,
  document: { getElementById: el }, window: {}, SB: { from: requete }, GP_ADMIN_ID: 'A', GP_ROLE: 'admin',
  fmt: (n) => String(Math.round(n)), notify() {}, gpExportPDF: (...a) => { ctx._pdf = a; } };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(R + 'impayes.js', 'utf8').replace(/^let IMP_DATA/m, 'var IMP_DATA').replace(/^const IMP_P/m, 'var IMP_P'), ctx);
const run = (c) => vm.runInContext(c, ctx);

// 1. versements : plus de 1000 lignes, plus rien de perdu
const V = await run('_impDerniersVersements()');
ok(V.vieux && V.vieux.montant === 77000, 'au-delà de 1000 versements : le plus ancien client est encore vu');
ok(V.c1 && V.c1.date === '2026-11-18' && V.c1.tous.length === 5 && V.c1.tous[0].date === '2026-11-18', 'Fairfield : dernier versement 18/11, 5 versements du plus récent au plus ancien');

// 2. raccourcis (aujourd'hui = 23/11/2026)
const p = (c, j = '2026-11-23') => run(`JSON.stringify(impCalculerPeriode('${c}','${j}'))`);
ok(p('2m') === '{"du":"2026-10-01","au":"2026-11-23"}', '2 derniers mois : 01/10 → aujourd’hui');
ok(p('3m') === '{"du":"2026-09-01","au":"2026-11-23"}' && p('mois_dernier') === '{"du":"2026-10-01","au":"2026-10-31"}', '3 derniers mois et mois dernier');
ok(p('2m', '2026-01-15') === '{"du":"2025-12-01","au":"2026-01-15"}', 'passage d’année');

// 3. le calcul : dette au début, acheté, versé, dette à la fin, bilan par mois
const data = { ventes: VENTES, regs: REGS.filter((r) => r.client_id === 'c1') };
ctx._d = data;
const C = run(`impReleveCalculer(_d, '2026-09-01', '2026-11-23')`);
ok(C.detteDebut === 800000, 'dette au 01/09 = 1 500 000 acheté − 700 000 versé avant = 800 000');
ok(C.achete === 500000 && C.verse === 500000, 'sur la période : 500 000 acheté, 500 000 versé');
ok(C.detteFin === 800000, 'dette au 23/11 = 800 000');
ok(C.bilans.map((b) => b.ym).join() === '2026-11,2026-10,2026-09', '3 mois, le plus récent en haut');
const oct = C.bilans[1], nov = C.bilans[0], sep = C.bilans[2];
ok(oct.lignes.length === 0 && oct.dette === 900000 && oct.verse === 0, 'octobre sans rien : le mois est montré, la dette reportée (900 000)');
ok(sep.achete === 200000 && sep.verse === 100000 && sep.dette === 900000, 'septembre : 200 000 acheté, 100 000 versé, dette 900 000');
ok(nov.nbVers === 2 && nov.verse === 400000 && nov.dette === 800000, 'novembre : 2 versements, 400 000, dette 800 000');
ok(nov.lignes[nov.lignes.length - 1].t === 'a' && nov.lignes[nov.lignes.length - 1].solde === 1200000, 'même jour : l’achat passe avant le versement (solde 1 200 000 puis 950 000)');
const D2 = run(`impReleveCalculer(_d, '2026-12-01', '2026-12-31')`);
ok(D2.detteDebut === 800000 && D2.detteFin === 800000 && D2.bilans.length === 1, 'période sans mouvement : la dette est reportée, rien n’est inventé');
ctx._d2 = { ventes: [{ date: null, montant_total: 50000 }], regs: [] };
ok(run(`impReleveCalculer(_d2,'2026-11-01','2026-11-30').sansDate`) === 1 && run(`impReleveCalculer(_d2,'2026-11-01','2026-11-30').detteFin`) === 50000, 'ligne sans date : comptée dans la dette et signalée');

// 4. l'écran : clic sur le client → 2 derniers mois par défaut
ctx.IMP_DATA = { debiteurs: [{ cle: 'c1', nom: 'Fairfield', total: 800000 }] };
run(`IMP_DATA = this.IMP_DATA`);
await run(`impPeriodeOuvrir('c1')`);
const h = el('impd-pc1').innerHTML;
ok(el('impd-pc1').style.display === '' && /2 derniers mois/.test(h), 'le clic ouvre le détail (2 derniers mois par défaut)');
ok(/Novembre 2026/.test(h) && /Octobre 2026/.test(h) && !/Septembre 2026/.test(h), 'bilans de novembre et octobre, pas septembre');
ok(/18\/11\/2026/.test(h) && /Virement/.test(h) && />150000 F</.test(h), 'chaque versement : date, mode, montant');
ok(/Dette au 01\/10\/2026/.test(h) && />900000 F</.test(h), 'compteur « dette au 01/10 » = 900 000');
ok(!/Écart/.test(h), 'relevé = factures impayées : pas d’alerte d’écart');
run(`impPeriodeRaccourci('c1','annee')`);
ok(/Janvier 2026/.test(el('impd-pc1').innerHTML) && /Dette au 01\/01\/2026/.test(el('impd-pc1').innerHTML), '« Cette année » : de janvier à novembre');
run(`impPeriodeDates('c1','2026-11-30','2026-09-01')`);
ok(run(`IMP_P.c1.du`) === '2026-09-01' && run(`IMP_P.c1.au`) === '2026-11-30', 'Du > Au : remis dans l’ordre');
run(`impPeriodePDF('c1')`);
ok(ctx._pdf && /Relevé de compte — Fairfield/.test(ctx._pdf[0]) && ctx._pdf[2].some((r) => r.op === 'BILAN NOVEMBRE 2026' && r.verse === 400000) && /Dette au début : 800000/.test(ctx._pdf[4]), 'PDF : relevé daté avec un bilan par mois');

// 5. écart signalé, client sans fiche, panne de lecture
ctx.IMP_DATA.debiteurs[0].total = 600000;
run(`impPeriodeRaccourci('c1','2m')`);
ok(/Écart : 200000 F/.test(el('impd-pc1').innerHTML), 'relevé ≠ factures impayées : l’écart est dit');
await run(`impPeriodeOuvrir('nom:jean')`);
ok(/pas de fiche client/.test(el('impd-pnom:jean').innerHTML), 'client sans fiche : on explique, pas de faux relevé');
panne = true;
await run(`impPeriodeOuvrir('c9')`);
ok(/Historique illisible : réseau coupé/.test(el('impd-pc9').innerHTML), 'lecture en panne : la raison est affichée');
panne = false;

console.log(echecs ? `\n❌ ${echecs} échec(s)` : '\n✅ Impayés par période : tout passe');
process.exit(echecs ? 1 : 0);
