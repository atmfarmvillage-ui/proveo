// ══════════════════════════════════════════════════
// PROVENDA — EMPRUNTS (prêts bancaires / microfinance)
// Un emprunt n'est PAS un revenu : l'argent entre en caisse mais il est dû.
// Sans suivi de la dette, le solde de caisse ment — on décide des achats sur
// de l'argent qui appartient au prêteur.
// Un remboursement n'est PAS une dépense entière : seuls les INTÉRÊTS sont une
// charge. Le capital rendu diminue une dette. Tout passer en dépense écraserait
// la marge brute mois après mois.
// ══════════════════════════════════════════════════

// Échéancier d'amortissement.
//  - 'constant'  : mensualité fixe (annuité constante) — le plus courant.
//  - 'degressif' : capital fixe, mensualité qui baisse.
// La DERNIÈRE échéance solde le restant exact : sans ça, les arrondis laissent
// quelques francs de dette fantôme après le dernier paiement.
function calcEcheancier(montant, tauxAnnuel, dureeMois, type){
  const C = Number(montant) || 0;
  const n = Math.max(1, parseInt(dureeMois) || 1);
  const i = (Number(tauxAnnuel) || 0) / 100 / 12;
  const M = (i > 0) ? C * i / (1 - Math.pow(1 + i, -n)) : C / n;
  const out = []; let restant = C;
  for(let k = 1; k <= n; k++){
    const interets = Math.round(restant * i);
    let capital = (type === 'degressif') ? Math.round(C / n) : Math.round(M - interets);
    if(k === n || capital > restant) capital = Math.round(restant);
    out.push({ numero:k, capital, interets, total: capital + interets, restant: Math.round(restant - capital) });
    restant -= capital;
  }
  return out;
}

// Date de l'échéance n° k à partir de la première (mois calendaires).
function _echDate(premiere, k){
  const d = new Date(premiere + 'T00:00:00');
  if(isNaN(d)) return premiere;
  d.setMonth(d.getMonth() + (k - 1));
  return d.toISOString().slice(0, 10);
}

// ── PAGE ──────────────────────────────────────────
async function renderEmprunts(){
  const root = document.getElementById('emprunts-content');
  if(!root) return;
  root.innerHTML = '<div style="padding:20px;color:var(--textm)">⏳ Chargement…</div>';

  const admin = (GP_ROLE === 'admin' || GP_EST_GERANT);
  let E = [], EC = [];
  const { data:dE, error } = await SB.from('gp_emprunts').select('*')
    .eq('admin_id', GP_ADMIN_ID).order('date_debut', { ascending:false });
  if(error){
    root.innerHTML = `<div class="card"><div style="padding:16px;color:var(--textm)">Le suivi des emprunts n'est pas encore activé. Passe le SQL <b>gp_emprunts</b> puis recharge.<div style="font-size:11px;margin-top:6px;color:var(--red)">${error.message}</div></div></div>`;
    return;
  }
  E = dE || [];
  if(E.length){
    const { data:dC } = await SB.from('gp_emprunts_echeances').select('*')
      .eq('admin_id', GP_ADMIN_ID).order('numero');
    EC = dC || [];
  }

  const parEmprunt = {};
  EC.forEach(e => { (parEmprunt[e.emprunt_id] = parEmprunt[e.emprunt_id] || []).push(e); });

  // Reste à rembourser = capital des échéances NON payées. C'est le chiffre qui
  // doit être lu à côté de la trésorerie, jamais séparément.
  let resteTotal = 0, interetsRestants = 0, enRetard = 0;
  const aujourdhui = (typeof today === 'function') ? today() : new Date().toISOString().slice(0,10);
  EC.forEach(e => {
    if(e.statut !== 'paye'){
      resteTotal += Number(e.capital || 0);
      interetsRestants += Number(e.interets || 0);
      if((e.date_prevue || '') < aujourdhui) enRetard++;
    }
  });

  const cartes = E.map(emp => {
    const lignes = (parEmprunt[emp.id] || []).slice().sort((a,b) => a.numero - b.numero);
    const paye = lignes.filter(l => l.statut === 'paye');
    const capitalRestant = lignes.filter(l => l.statut !== 'paye').reduce((s,l) => s + Number(l.capital||0), 0);
    const prochaine = lignes.find(l => l.statut !== 'paye');
    const pct = lignes.length ? Math.round(paye.length / lignes.length * 100) : 0;
    const detId = 'emp-det-' + emp.id.slice(0,8);
    const solde = capitalRestant <= 0;
    return `<div class="card">
      <div class="card-title">
        <div class="ct-left"><span>🏦 ${(emp.preteur||'Prêteur')} — ${fmt(emp.montant||0)} F</span></div>
        ${solde ? '<span class="badge bdg-g" style="font-size:10px">SOLDÉ</span>' : `<span class="badge bdg-gold" style="font-size:10px">${pct}% remboursé</span>`}
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:8px">
        <div class="econo-box"><div class="econo-val" style="color:var(--red)">${fmt(capitalRestant)} F</div><div class="econo-lbl">Capital restant dû</div></div>
        <div class="econo-box"><div class="econo-val">${emp.taux || 0} %</div><div class="econo-lbl">Taux annuel</div></div>
        <div class="econo-box"><div class="econo-val">${paye.length} / ${lignes.length}</div><div class="econo-lbl">Échéances payées</div></div>
        ${prochaine ? `<div class="econo-box"><div class="econo-val" style="color:var(--gold)">${fmt(prochaine.total||0)} F</div><div class="econo-lbl">Prochaine · ${prochaine.date_prevue||''}</div></div>` : ''}
      </div>
      ${prochaine && admin ? `<button class="btn btn-g btn-sm" onclick="payerEcheance('${prochaine.id}')">💵 Payer l'échéance n°${prochaine.numero} — ${fmt(prochaine.total||0)} F</button>` : ''}
      <div style="font-size:11px;color:var(--textm);cursor:pointer;margin-top:8px" onclick="var e=document.getElementById('${detId}');if(e)e.style.display=e.style.display==='none'?'block':'none'">▸ Voir l'échéancier</div>
      <div id="${detId}" style="display:none;overflow-x:auto;margin-top:6px"><table class="tbl" style="font-size:11px"><thead><tr>
        <th>N°</th><th>Prévue</th><th class="num">Capital</th><th class="num">Intérêts</th><th class="num">Total</th><th class="num">Restant après</th><th>Statut</th>
      </tr></thead><tbody>
        ${lignes.map(l => `<tr${l.statut!=='paye' && (l.date_prevue||'')<aujourdhui ? ' style="background:rgba(239,68,68,.08)"' : ''}>
          <td>${l.numero}</td>
          <td style="font-size:10px">${l.date_prevue||''}</td>
          <td class="num">${fmt(l.capital||0)}</td>
          <td class="num" style="color:var(--gold)">${fmt(l.interets||0)}</td>
          <td class="num" style="font-weight:700">${fmt(l.total||0)}</td>
          <td class="num" style="color:var(--textm)">${fmt(l.restant||0)}</td>
          <td>${l.statut==='paye'
              ? `<span class="badge bdg-g" style="font-size:9px">payée${l.date_paiement?' · '+l.date_paiement:''}</span>`
              : ((l.date_prevue||'')<aujourdhui ? '<span class="badge bdg-r" style="font-size:9px">en retard</span>' : '<span class="badge bdg-gold" style="font-size:9px">à payer</span>')}</td>
        </tr>`).join('')}
      </tbody></table></div>
    </div>`;
  }).join('');

  root.innerHTML = `
    ${EC.length ? `<div class="card">
      <div class="card-title"><div class="ct-left"><span>📊 Ce que tu dois</span></div></div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <div class="econo-box"><div class="econo-val" style="color:var(--red)">${fmt(resteTotal)} F</div><div class="econo-lbl">Capital restant dû</div></div>
        <div class="econo-box"><div class="econo-val" style="color:var(--gold)">${fmt(interetsRestants)} F</div><div class="econo-lbl">Intérêts à venir</div></div>
        <div class="econo-box"><div class="econo-val">${fmt(resteTotal+interetsRestants)} F</div><div class="econo-lbl">Total à sortir</div></div>
        ${enRetard ? `<div class="econo-box"><div class="econo-val" style="color:var(--red)">${enRetard}</div><div class="econo-lbl">Échéance(s) en retard</div></div>` : ''}
      </div>
      <div style="font-size:11px;color:var(--textm);margin-top:8px">À lire à côté de ta trésorerie : cet argent est déjà engagé.</div>
    </div>` : ''}
    ${cartes || '<div class="card"><div style="padding:16px;color:var(--textm)">Aucun emprunt enregistré.</div></div>'}
    ${admin ? _empruntFormCard() : ''}`;

  if(admin) await remplirSelectCaisses('emp-caisse', '— Où l\'argent est arrivé —');
}

function _empruntFormCard(){
  const auj = (typeof today === 'function') ? today() : new Date().toISOString().slice(0,10);
  return `<div class="card">
    <div class="card-title"><div class="ct-left"><span>➕ Enregistrer un emprunt</span></div></div>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:8px;align-items:end">
      <div class="fr" style="margin:0"><label>Prêteur</label><input type="text" id="emp-preteur" placeholder="COFINA"></div>
      <div class="fr" style="margin:0"><label>Montant emprunté (F)</label><input type="number" id="emp-montant" placeholder="5000000" oninput="apercuEcheancier()"></div>
      <div class="fr" style="margin:0"><label>Taux annuel (%)</label><input type="number" id="emp-taux" step="0.01" placeholder="12" oninput="apercuEcheancier()"></div>
      <div class="fr" style="margin:0"><label>Durée (mois)</label><input type="number" id="emp-duree" placeholder="24" oninput="apercuEcheancier()"></div>
      <div class="fr" style="margin:0"><label>Type de remboursement</label>
        <select id="emp-type" onchange="apercuEcheancier()">
          <option value="constant">Mensualité fixe</option>
          <option value="degressif">Capital fixe (mensualité dégressive)</option>
        </select>
      </div>
      <div class="fr" style="margin:0"><label>1re échéance</label><input type="date" id="emp-premiere" value="${auj}"></div>
      <div class="fr" style="margin:0"><label>Caisse créditée</label><select id="emp-caisse"></select></div>
      <div class="fr" style="margin:0"><label>Date de réception</label><input type="date" id="emp-recu" value="${auj}"></div>
    </div>
    <label style="display:flex;align-items:center;gap:8px;margin-top:8px;font-size:12px;cursor:pointer">
      <input type="checkbox" id="emp-crediter" checked style="width:auto;margin:0">
      <span>Créditer la caisse du capital reçu (décoche si tu l'as déjà saisi à la main)</span>
    </label>
    <div id="emp-apercu" style="font-size:12px;color:var(--textm);margin-top:8px"></div>
    <button class="btn btn-g" style="margin-top:8px" onclick="saveEmprunt()">💾 Enregistrer l'emprunt</button>
    <div class="a-err" id="emp-err"></div>
  </div>`;
}

// Aperçu avant enregistrement : on voit le coût total AVANT de s'engager.
function apercuEcheancier(){
  const el = document.getElementById('emp-apercu'); if(!el) return;
  const m = +document.getElementById('emp-montant')?.value || 0;
  const t = +document.getElementById('emp-taux')?.value || 0;
  const n = +document.getElementById('emp-duree')?.value || 0;
  const ty = document.getElementById('emp-type')?.value || 'constant';
  if(!m || !n){ el.textContent = ''; return; }
  const ech = calcEcheancier(m, t, n, ty);
  const interets = ech.reduce((s,e) => s + e.interets, 0);
  const prem = ech[0], der = ech[ech.length-1];
  el.innerHTML = `1re mensualité <b>${fmt(prem.total)} F</b>${ty==='degressif' ? ` · dernière <b>${fmt(der.total)} F</b>` : ''} — `
    + `coût total du crédit : <b style="color:var(--gold)">${fmt(interets)} F</b> d'intérêts, `
    + `soit <b>${fmt(m+interets)} F</b> à rembourser.`;
}

async function saveEmprunt(){
  const err = document.getElementById('emp-err');
  if(!(GP_ROLE === 'admin' || GP_EST_GERANT)){ notify('Réservé à l\'admin', 'r'); return; }
  const preteur = document.getElementById('emp-preteur')?.value.trim();
  const montant = +document.getElementById('emp-montant')?.value || 0;
  const taux    = +document.getElementById('emp-taux')?.value || 0;
  const duree   = +document.getElementById('emp-duree')?.value || 0;
  const type    = document.getElementById('emp-type')?.value || 'constant';
  const premiere= document.getElementById('emp-premiere')?.value;
  const recu    = document.getElementById('emp-recu')?.value;
  const caisseId= document.getElementById('emp-caisse')?.value || null;
  const crediter= document.getElementById('emp-crediter')?.checked;
  if(!preteur || !montant || !duree || !premiere){ err.textContent = 'Prêteur, montant, durée et 1re échéance sont requis.'; return; }
  if(crediter && !caisseId){ err.textContent = 'Choisis la caisse qui a reçu l\'argent (ou décoche la case).'; return; }
  err.textContent = 'Enregistrement…';

  const { data:emp, error } = await SB.from('gp_emprunts').insert({
    admin_id:GP_ADMIN_ID, preteur, montant, taux, duree_mois:duree, type_remboursement:type,
    date_debut:recu || premiere, premiere_echeance:premiere,
    caisse_id:caisseId, statut:'en_cours',
    saisi_par:GP_USER?.id, saisi_par_nom:GP_USER?.email?.split('@')[0]
  }).select().maybeSingle();
  if(error || !emp){ err.textContent = 'Erreur : ' + (error?.message || '?'); return; }

  const ech = calcEcheancier(montant, taux, duree, type).map(e => ({
    admin_id:GP_ADMIN_ID, emprunt_id:emp.id, numero:e.numero,
    date_prevue:_echDate(premiere, e.numero),
    capital:e.capital, interets:e.interets, total:e.total, restant:e.restant,
    statut:'a_payer'
  }));
  const { error:e2 } = await SB.from('gp_emprunts_echeances').insert(ech);
  if(e2){ err.textContent = 'Emprunt créé mais échéancier en erreur : ' + e2.message; return; }

  // Le capital reçu entre en caisse. Catégorie dédiée : ce n'est PAS une vente,
  // il ne doit jamais être confondu avec du chiffre d'affaires.
  if(crediter && caisseId){
    await SB.from('gp_mouvements_caisse').insert({
      admin_id:GP_ADMIN_ID, caisse_id:caisseId,
      type:'entree', categorie:'emprunt',
      montant, date_mouvement:recu || premiere,
      description:`Emprunt ${preteur} — capital reçu`,
      enregistre_par:GP_USER?.id, enregistre_par_nom:GP_USER?.email?.split('@')[0]
    }).then(()=>{}, ()=>{});
  }

  err.textContent = '';
  notify(`✓ Emprunt ${preteur} enregistré — ${duree} échéances`, 'gold');
  renderEmprunts();
}

// Payer une échéance : UNE sortie de caisse du total, PLUS une dépense limitée
// aux intérêts (déjà débitée, donc sans double sortie) pour que la marge brute
// supporte la charge financière sans absorber le remboursement du capital.
async function payerEcheance(echId){
  if(!(GP_ROLE === 'admin' || GP_EST_GERANT)){ notify('Réservé à l\'admin', 'r'); return; }
  const { data:e } = await SB.from('gp_emprunts_echeances').select('*').eq('id', echId).maybeSingle();
  if(!e){ notify('Échéance introuvable', 'r'); return; }
  if(e.statut === 'paye'){ notify('Échéance déjà payée', 'r'); return; }
  const { data:emp } = await SB.from('gp_emprunts').select('*').eq('id', e.emprunt_id).maybeSingle();
  if(!emp){ notify('Emprunt introuvable', 'r'); return; }

  const C = await caissesAccessibles();
  const caisse = C.find(c => c.id === emp.caisse_id) || C[0];
  if(!caisse){ notify('Aucune caisse disponible', 'r'); return; }
  if(!confirm(`Payer l'échéance n°${e.numero} de ${fmt(e.total)} F ?\n\n`
    + `Capital : ${fmt(e.capital)} F (diminue la dette)\n`
    + `Intérêts : ${fmt(e.interets)} F (charge du mois)\n\n`
    + `Sortie de ${caisse.nom}.`)) return;

  const dateP = (typeof today === 'function') ? today() : new Date().toISOString().slice(0,10);
  const { error:eM } = await SB.from('gp_mouvements_caisse').insert({
    admin_id:GP_ADMIN_ID, caisse_id:caisse.id,
    type:'sortie', categorie:'remboursement_emprunt',
    montant:e.total, date_mouvement:dateP,
    description:`Emprunt ${emp.preteur} — échéance n°${e.numero} (capital ${fmt(e.capital)} + intérêts ${fmt(e.interets)})`,
    enregistre_par:GP_USER?.id, enregistre_par_nom:GP_USER?.email?.split('@')[0]
  });
  if(eM){ notify('Erreur caisse : ' + eM.message, 'r'); return; }

  if(Number(e.interets) > 0){
    await SB.from('gp_depenses').insert({
      admin_id:GP_ADMIN_ID, saisi_par:GP_USER?.id, date:dateP,
      categorie:'frais_financiers',
      description:`Intérêts emprunt ${emp.preteur} — échéance n°${e.numero}`,
      montant:e.interets,
      point_vente:caisse.point_vente || 'Production',
      caisse_debitee:true   // déjà sortie ci-dessus : ne PAS laisser le rattrapage débiter une 2e fois
    }).then(()=>{}, ()=>{});
  }

  await SB.from('gp_emprunts_echeances').update({ statut:'paye', date_paiement:dateP }).eq('id', echId);

  const { data:reste } = await SB.from('gp_emprunts_echeances').select('id')
    .eq('emprunt_id', emp.id).neq('statut', 'paye').limit(1);
  if(!reste || !reste.length){
    await SB.from('gp_emprunts').update({ statut:'solde' }).eq('id', emp.id);
    notify('🎉 Emprunt intégralement remboursé', 'gold');
  } else {
    notify(`✓ Échéance n°${e.numero} payée — ${fmt(e.total)} F`, 'gold');
  }
  renderEmprunts();
}

if(typeof PAGE_RENDERERS !== 'undefined'){
  PAGE_RENDERERS.emprunts = function(){ if(typeof renderEmprunts === 'function') renderEmprunts(); };
}
