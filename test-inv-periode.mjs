// Test de la période libre de l'Inventaire (PROVENDA) : raccourcis, Du/Au, pagination > 1000, export.
// Lancer : node test-inv-periode.mjs (depuis la racine du dépôt)
import fs from 'node:fs'; import vm from 'node:vm'; import { fileURLToPath } from 'node:url';
const R = fileURLToPath(new URL('./js/', import.meta.url));
let echecs = 0; const ok = (c, m) => { console.log((c ? 'ok   - ' : 'ÉCHEC - ') + m); if (!c) echecs++; };
const els = {};
const el = (id) => els[id] || (els[id] = { id, value: '', innerHTML: '', style: {}, dataset: {}, options: [], appendChild() {}, querySelectorAll: () => [] });
const boutons = ['mois', 'mois_dernier', '3m', '4m', '6m', 'annee'].map((p) => ({ dataset: { p }, style: {} }));
// fausse base : 5000 mouvements MP sur 2026 (le plafond Supabase est 1000 par lecture)
const pad = (n) => String(n).padStart(2, '0');
const MVT = [];
for (let i = 0; i < 5000; i++) { const d = new Date(2026, 0, 1 + (i % 327)); MVT.push({ id: i + 1, admin_id: 'A', date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`, ingredient_nom: i % 7 === 0 ? 'Soja' : 'Maïs', type: i % 5 === 0 ? 'entree' : 'sortie_production', quantite: 10, prix_unit: 100 }); }
const requete = (table) => {
  const f = []; let rng = null;
  const q = {
    select() { return q; }, eq(k, v) { f.push((r) => r[k] === v); return q; }, gte(k, v) { f.push((r) => r[k] >= v); return q; },
    lte(k, v) { f.push((r) => r[k] <= v); return q; }, lt(k, v) { f.push((r) => r[k] < v); return q; }, order() { return q; },
    range(a, b) { rng = [a, b]; return q; },
    then(res) {
      const src = table === 'gp_stock_mp' ? MVT : [];
      let d = src.filter((r) => f.every((g) => g(r)));
      const [a, b] = rng || [0, 999];
      d = d.slice(a, Math.min(b, a + 999) + 1);   // jamais plus de 1000 lignes par lecture
      res({ data: d, error: null });
    },
  };
  return q;
};
const ctx = {
  console, Date, Math, Number, String, Object, Array, JSON, Promise, setTimeout,
  document: { getElementById: el, querySelectorAll: (s) => (/inv-raccourcis/.test(s) ? boutons : []) },
  SB: { from: requete }, GP_ADMIN_ID: 'A', GP_ROLE: 'admin', GP_INGREDIENTS: [{ id: 'i1', nom: 'Maïs', seuil_alerte: 200 }, { id: 'i2', nom: 'Soja', seuil_alerte: 200 }],
  fmt: (n) => String(Math.round(n)), fmtKg: (n) => String(n), notify() {}, ESPECE_ICON: {}, normalizeMpNom: (s) => String(s || '').trim().toLowerCase(),
  gpExportPDF: (...a) => { ctx._pdf = a; }, gpExportExcel: (...a) => { ctx._xls = a; },
};
vm.createContext(ctx);
const pick = (src, nom) => { const i = src.indexOf(nom); if (i < 0) throw new Error(nom); const j = src.indexOf('\n}', i); return src.slice(i, j + 2); };
const cfg = fs.readFileSync(R + 'config.js', 'utf8');
vm.runInContext(['function finMois', 'function thisMonth', 'async function _fetchAllPages'].map((n) => pick(cfg, n)).join('\n'), ctx);
const stk = fs.readFileSync(R + 'stock.js', 'utf8');
vm.runInContext(pick(stk, 'function calcNiveaux') + '\n' + (stk.includes('function _normStockMp') ? pick(stk, 'function _normStockMp') : 'function _normStockMp(s){return String(s||"").trim().toLowerCase();}'), ctx);
const prod = fs.readFileSync(R + 'production.js', 'utf8');
const debut = prod.indexOf('// ── INVENTAIRE MENSUEL ──'), fin = prod.indexOf('// ── RAPPORT PRODUCTION');
vm.runInContext(prod.slice(debut, fin).replace(/^let _INV_EXPORT/m, 'var _INV_EXPORT'), ctx);
const run = (c) => vm.runInContext(c, ctx);
const attendre = () => new Promise((r) => setTimeout(r, 30));

// 1. raccourcis (aujourd'hui = 23/11/2026)
const r = (c, j = '2026-11-23') => run(`JSON.stringify(invCalculerRaccourci('${c}','${j}'))`);
ok(r('mois') === '{"du":"2026-11-01","au":"2026-11-30"}', 'Ce mois : 01/11 → 30/11');
ok(r('mois_dernier') === '{"du":"2026-10-01","au":"2026-10-31"}', 'Mois dernier : 01/10 → 31/10');
ok(r('3m') === '{"du":"2026-09-01","au":"2026-11-23"}', '3 derniers mois : 01/09 → aujourd’hui');
ok(r('4m') === '{"du":"2026-08-01","au":"2026-11-23"}', '4 derniers mois : 01/08 → aujourd’hui');
ok(r('6m') === '{"du":"2026-06-01","au":"2026-11-23"}', '6 mois : 01/06 → aujourd’hui');
ok(r('annee') === '{"du":"2026-01-01","au":"2026-11-23"}', 'Cette année : 01/01 → aujourd’hui');
ok(r('3m', '2026-02-10') === '{"du":"2025-12-01","au":"2026-02-10"}', 'passage d’année (février → décembre précédent)');
ok(r('mois_dernier', '2026-03-31') === '{"du":"2026-02-01","au":"2026-02-28"}', 'mois dernier depuis le 31 mars : février entier');
ok(run(`_invMoisExact('2026-11-01','2026-11-30')`) === '2026-11' && run(`_invMoisExact('2026-08-01','2026-11-23')`) === '', 'un mois civil garde son nom, une période non');

// 2. ouverture de la page : Du/Au vides, le mois fait foi
el('inv-mois').value = '2026-11';
await run(`renderInventaire()`);
ok(el('inv-du').value === '2026-11-01' && el('inv-au').value === '2026-11-30', 'à l’ouverture : Du/Au remplis depuis le mois');

// 3. période de 4 mois : > 1000 mouvements, plus rien de tronqué
el('inv-du').value = '2026-08-01'; el('inv-au').value = '2026-11-23';
run(`invPeriodeLibre()`); await attendre();
const dedans = MVT.filter((m) => m.date >= '2026-08-01' && m.date <= '2026-11-23');
const recu = dedans.filter((m) => m.type === 'entree').length * 10, util = dedans.filter((m) => m.type !== 'entree').length * 10;
ok(dedans.length > 1000, `la période contient ${dedans.length} mouvements (> 1000)`);
ok(el('inv-kpis').innerHTML.includes(`>${recu}<`) && el('inv-kpis').innerHTML.includes(`>${util}<`), `KPI complets : ${recu} kg reçus, ${util} kg utilisés`);
const avant = MVT.filter((m) => m.date < '2026-08-01');
const stockDebut = avant.filter((m) => m.ingredient_nom === 'Maïs').reduce((s, m) => s + (m.type === 'entree' ? 10 : -10), 0);
ok(avant.length > 1000 && el('inv-stock-restant').innerHTML.includes(`>${stockDebut}<`), `stock au début de période juste sur ${avant.length} lignes d’historique (${stockDebut})`);
ok(el('inv-mois').value === '', 'le champ Mois se vide sur une période libre');
ok(/début période/.test(el('inv-stock-restant').innerHTML) && /fin période/.test(el('inv-stock-restant').innerHTML), 'en-têtes « début / fin période »');

// 3 bis. reste de la MP en stock à la fin de la période (tout l'historique jusqu'à « Au »)
const resteAttendu = MVT.filter((m) => m.date <= '2026-11-23').reduce((s, m) => s + (m.type === 'entree' ? 10 : -10), 0);
const resteMais = MVT.filter((m) => m.date <= '2026-11-23' && m.ingredient_nom === 'Maïs').reduce((s, m) => s + (m.type === 'entree' ? 10 : -10), 0);
const caseReste = () => (el('inv-kpis').innerHTML.match(/>(-?\d+)<\/div><div class="econo-lbl">Kg en stock au ([0-9/]+)/) || []);
ok(caseReste()[1] === String(resteAttendu), `reste en stock = ${resteAttendu} kg (tout l’historique jusqu’à « Au »)`);
el('inv-mp').value = 'Maïs'; run(`invSetMp()`); await attendre();
ok(caseReste()[1] === String(resteMais) && resteMais !== resteAttendu, 'filtré sur une matière : le reste de CETTE matière');
el('inv-type').value = 'sortie_vente'; run(`invSetMp()`); await attendre();
ok(caseReste()[1] === String(resteMais), 'un filtre « type de consommation » ne fausse pas le stock');
el('inv-type').value = ''; el('inv-mp').value = '';
el('inv-du').value = '2026-08-01'; el('inv-au').value = '2026-08-31'; run(`invPeriodeLibre()`); await attendre();
const resteAout = MVT.filter((m) => m.date <= '2026-08-31').reduce((s, m) => s + (m.type === 'entree' ? 10 : -10), 0);
ok(caseReste()[1] === String(resteAout) && caseReste()[2] === '31/08/2026', `période passée : stock au 31/08/2026 (${resteAout})`);
ok(!/\$\{lots\.length\}/.test(el('inv-kpis').innerHTML), 'aucun « ${…} » brut affiché');
run(`GP_ROLE='membre'`); run(`invPeriodeLibre()`); await attendre();
ok(/>\d+<\/div><div class="econo-lbl">Lots produits/.test(el('inv-kpis').innerHTML), 'non-admin : le nombre de lots s’affiche (il était écrit « ${lots.length} »)');
run(`GP_ROLE='admin'`);
el('inv-du').value = '2026-08-01'; el('inv-au').value = '2026-11-23';

// 4. Du après Au : remis dans l'ordre
el('inv-du').value = '2026-11-23'; el('inv-au').value = '2026-08-01';
run(`invPeriodeLibre()`); await attendre();
ok(el('inv-du').value === '2026-08-01' && el('inv-au').value === '2026-11-23', 'Du > Au : remis dans l’ordre plutôt qu’une page vide');

// 5. raccourci : bouton marqué
run(`invRaccourci('3m')`); await attendre();
ok(boutons.find((b) => b.dataset.p === '3m').style.background === 'var(--g6)' && !boutons.find((b) => b.dataset.p === '4m').style.background, 'le raccourci choisi est mis en évidence');

// 6. export
el('inv-du').value = '2026-08-01'; el('inv-au').value = '2026-11-23'; run(`invPeriodeLibre()`); await attendre();
run(`exportInventaire('pdf','tout')`);
ok(ctx._pdf && /Période : du 01\/08\/2026 au 23\/11\/2026/.test(ctx._pdf[4]) && /2026-08-01_au_2026-11-23\.pdf$/.test(ctx._pdf[3]), 'PDF : « du 01/08/2026 au 23/11/2026 » et nom de fichier daté');
el('inv-mois').value = '2026-10'; run(`invChoisirMois()`); await attendre();
run(`exportInventaire('excel','tout')`);
ok(el('inv-du').value === '2026-10-01' && el('inv-au').value === '2026-10-31' && /_2026-10\.xlsx$/.test(ctx._xls[3]), 'choisir un mois remplit Du/Au ; l’export reste « Mois : 2026-10 »');

console.log(echecs ? `\n❌ ${echecs} échec(s)` : '\n✅ Inventaire par période : tout passe');
process.exit(echecs ? 1 : 0);
