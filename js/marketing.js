// ══════════════════════════════════════════════════
// PROVENDA — DIRECTEUR MARKETING IA (Lot 1)
// Analyse des marges par formule + matrice de concentration + diagnostic IA.
// Tous les chiffres sont calculés ici (réels) puis donnés à l'IA → zéro hallucination.
// ══════════════════════════════════════════════════

var MKT_PERIODE = 'mois';
var MKT_ROWS = [];   // dernière analyse calculée (pour l'IA)

// Coût/kg théorique d'une formule (ingrédients pct × prix MP + emballage + main-d'œuvre)
function mktCoutKgTheorique(nom){
  const f = (typeof getFormule==='function' && getFormule(nom)) || (FORMULES_SADARI||[]).find(x=>x.nom===nom);
  if(!f || !Array.isArray(f.ingredients)) return 0;
  let c = 0;
  f.ingredients.forEach(ing=>{
    const d = (typeof trouverIngrParNom==='function') ? trouverIngrParNom(ing.nom) : null;
    c += (Number(ing.pct||0)/100) * Number(d?.prix_actuel||0);
  });
  c += Number(f.cout_emballage_kg||0);
  c += Number(f.cout_mo_tonne||0)/1000;
  return Math.round(c);
}

function _mktMedian(arr){
  if(!arr.length) return 0;
  const s = arr.slice().sort((a,b)=>a-b);
  const m = Math.floor(s.length/2);
  return s.length%2 ? s[m] : (s[m-1]+s[m])/2;
}

function mktSetPeriode(p){
  MKT_PERIODE = p;
  document.querySelectorAll('.mkt-per-btn').forEach(b=>b.classList.toggle('on', b.dataset.per===p));
  renderMarketing();
}

const MKT_QUAD = {
  star:      {label:'⭐ À pousser',     desc:'Fort volume + forte marge',   color:'var(--green)',  bg:'rgba(22,163,74,.10)'},
  cash:      {label:'🐄 Vache à lait',  desc:'Fort volume, marge moyenne',  color:'var(--gold)',   bg:'rgba(232,197,71,.10)'},
  potentiel: {label:'❓ Potentiel',      desc:'Faible volume, forte marge',  color:'#3b82f6',       bg:'rgba(59,130,246,.10)'},
  revoir:    {label:'🐕 À revoir',       desc:'Faible volume + faible marge',color:'var(--red)',    bg:'rgba(239,68,68,.10)'},
};

async function renderMarketing(){
  const root = document.getElementById('mkt-content');
  if(!root) return;
  root.innerHTML = '<div style="padding:20px;color:var(--textm)">⏳ Analyse en cours…</div>';

  // Période
  const r = (typeof vtPeriodeRange==='function')
    ? vtPeriodeRange(MKT_PERIODE)
    : {from:'2000-01-01', to:'2999-12-31', label:'toute la période'};

  // Ventes sur la période + lots (coût réel) en parallèle
  const [ventesRes, lotsRes] = await Promise.all([
    SB.from('gp_ventes').select('formule_nom,qte_vendue,montant_total')
      .eq('admin_id',GP_ADMIN_ID).is('deleted_at',null)
      .gte('date',r.from).lte('date',r.to).limit(5000),
    SB.from('gp_lots').select('formule_nom,cout_total,nb_sacs,poids_sac,qte_produite')
      .eq('admin_id',GP_ADMIN_ID)
  ]);
  const ventes = ventesRes.data || [];
  const lots = lotsRes.data || [];

  // Coût/kg RÉEL par formule (depuis les lots de production, toutes périodes pour la stabilité)
  const lotAgg = {};
  lots.forEach(l=>{
    const f = l.formule_nom || '—';
    const kg = (Number(l.nb_sacs||0)*Number(l.poids_sac||25)) || Number(l.qte_produite||0);
    if(!lotAgg[f]) lotAgg[f] = {cout:0, kg:0};
    lotAgg[f].cout += Number(l.cout_total||0);
    lotAgg[f].kg   += kg;
  });
  const coutKgReel = {};
  Object.keys(lotAgg).forEach(f=>{ if(lotAgg[f].kg>0) coutKgReel[f] = Math.round(lotAgg[f].cout/lotAgg[f].kg); });

  // Agréger les ventes par formule
  const agg = {};
  ventes.forEach(v=>{
    const f = v.formule_nom;
    if(!f) return;
    if(!agg[f]) agg[f] = {kg:0, ca:0, n:0};
    agg[f].kg += Number(v.qte_vendue||0);
    agg[f].ca += Number(v.montant_total||0);
    agg[f].n  += 1;
  });

  // Lignes calculées
  let rows = Object.keys(agg).map(f=>{
    const a = agg[f];
    const reel = coutKgReel[f] != null;
    const coutKg = reel ? coutKgReel[f] : mktCoutKgTheorique(f);
    const coutTot = Math.round(a.kg * coutKg);
    const marge = a.ca - coutTot;
    const margeKg = a.kg>0 ? Math.round(marge/a.kg) : 0;
    const pmv = a.kg>0 ? Math.round(a.ca/a.kg) : 0;
    const margePct = a.ca>0 ? Math.round(marge/a.ca*100) : 0;
    const espece = ((typeof getFormule==='function' && getFormule(f))||{}).espece || '';
    return {f, espece, kg:a.kg, ca:a.ca, n:a.n, coutKg, coutTot, marge, margeKg, pmv, margePct, reel};
  }).sort((x,y)=>y.marge - x.marge);

  if(!rows.length){
    root.innerHTML = `<div class="card"><div style="padding:20px;color:var(--textm);text-align:center">Aucune vente de formule ${r.label}. Change de période ou enregistre des ventes.</div></div>`;
    MKT_ROWS = [];
    return;
  }

  // Matrice : médianes volume × marge/kg
  const volMed = _mktMedian(rows.map(x=>x.kg));
  const margeMed = _mktMedian(rows.map(x=>x.margeKg));
  rows.forEach(x=>{
    const hv = x.kg >= volMed, hm = x.margeKg >= margeMed;
    x.quad = hv&&hm ? 'star' : hv&&!hm ? 'cash' : !hv&&hm ? 'potentiel' : 'revoir';
  });
  MKT_ROWS = rows;

  // Totaux
  const totCA = rows.reduce((s,x)=>s+x.ca,0);
  const totMarge = rows.reduce((s,x)=>s+x.marge,0);
  const totKg = rows.reduce((s,x)=>s+x.kg,0);
  const margePctGlob = totCA>0 ? Math.round(totMarge/totCA*100) : 0;

  // KPIs
  const kpis = `<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px">
    <div class="econo-box"><div class="econo-val">${rows.length}</div><div class="econo-lbl">Formules vendues</div></div>
    <div class="econo-box"><div class="econo-val" style="color:var(--gold)">${fmt(totCA)} F</div><div class="econo-lbl">CA (${r.label})</div></div>
    <div class="econo-box"><div class="econo-val" style="color:${totMarge>=0?'var(--green)':'var(--red)'}">${fmt(totMarge)} F</div><div class="econo-lbl">Marge totale</div></div>
    <div class="econo-box"><div class="econo-val">${margePctGlob}%</div><div class="econo-lbl">Marge moyenne</div></div>
    <div class="econo-box"><div class="econo-val">${fmtKg(totKg)}</div><div class="econo-lbl">Kg vendus</div></div>
  </div>`;

  // Matrice 2×2
  const chip = x=>`<span title="${fmtKg(x.kg)} kg · marge ${fmt(x.margeKg)} F/kg" style="display:inline-block;background:var(--card2);border:1px solid var(--border);border-radius:12px;padding:3px 9px;font-size:11px;margin:2px;font-weight:600">${x.f}</span>`;
  const quadBox = q=>{
    const meta = MKT_QUAD[q];
    const list = rows.filter(x=>x.quad===q);
    return `<div style="background:${meta.bg};border:1px solid ${meta.color};border-radius:12px;padding:12px;min-height:90px">
      <div style="font-weight:800;color:${meta.color};font-size:13px">${meta.label}</div>
      <div style="font-size:10px;color:var(--textm);margin-bottom:7px">${meta.desc}</div>
      <div>${list.length?list.map(chip).join(''):'<span style="font-size:11px;color:var(--textm)">—</span>'}</div>
    </div>`;
  };
  const matrice = `<div class="card"><div class="card-title"><div class="ct-left"><span>🎯 Matrice de concentration</span></div></div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
      ${quadBox('star')}${quadBox('potentiel')}${quadBox('cash')}${quadBox('revoir')}
    </div>
    <div style="font-size:10px;color:var(--textm);margin-top:8px">Seuils : volume médian ${fmtKg(volMed)} kg · marge médiane ${fmt(margeMed)} F/kg</div>
  </div>`;

  // Tableau détaillé
  const badge = x=>`<span style="color:${MKT_QUAD[x.quad].color};font-weight:700;font-size:10px">${MKT_QUAD[x.quad].label.split(' ')[0]}</span>`;
  const tbl = `<div class="card"><div class="card-title"><div class="ct-left"><span>📊 Marges par formule</span></div></div>
    <div style="overflow-x:auto"><table class="tbl" style="font-size:11px"><thead><tr>
      <th>Formule</th><th class="num">Kg</th><th class="num">CA</th><th class="num">Coût/kg</th>
      <th class="num">Prix moy.</th><th class="num">Marge/kg</th><th class="num">Marge tot.</th><th class="num">%</th><th></th>
    </tr></thead><tbody>
      ${rows.map(x=>`<tr>
        <td><b>${x.f}</b>${x.espece?` <span style="font-size:9px;color:var(--textm)">${x.espece}</span>`:''}${!x.reel?' <span title="Coût estimé (pas de lot de prod)" style="font-size:9px;color:var(--gold)">~est.</span>':''}</td>
        <td class="num">${fmtKg(x.kg)}</td>
        <td class="num">${fmt(x.ca)}</td>
        <td class="num">${fmt(x.coutKg)}</td>
        <td class="num">${fmt(x.pmv)}</td>
        <td class="num" style="color:${x.margeKg>=0?'var(--green)':'var(--red)'}">${fmt(x.margeKg)}</td>
        <td class="num" style="color:${x.marge>=0?'var(--green)':'var(--red)'};font-weight:700">${fmt(x.marge)}</td>
        <td class="num">${x.margePct}%</td>
        <td>${badge(x)}</td>
      </tr>`).join('')}
    </tbody></table></div>
    <div style="font-size:10px;color:var(--textm);margin-top:6px">« ~est. » = coût estimé depuis les ingrédients (formule sans lot de production sur la base).</div>
  </div>`;

  // Bloc diagnostic IA
  const ia = `<div class="card">
    <div class="card-title"><div class="ct-left"><span>🧠 Diagnostic du Directeur Marketing</span></div>
      <button class="btn btn-g btn-sm" id="mkt-ia-btn" onclick="analyserMarketingIA()">Analyser avec l'IA</button>
    </div>
    <div id="mkt-ia-result" style="font-size:13px;line-height:1.5;white-space:pre-wrap;color:var(--text)">
      <span style="color:var(--textm)">Clique « Analyser avec l'IA » pour un diagnostic stratégique sur où concentrer tes formules.</span>
    </div>
  </div>`;

  root.innerHTML = kpis + matrice + tbl + ia;
}

async function analyserMarketingIA(){
  const out = document.getElementById('mkt-ia-result');
  const btn = document.getElementById('mkt-ia-btn');
  if(!out) return;
  if(!MKT_ROWS.length){ out.textContent = 'Aucune donnée à analyser.'; return; }
  if(typeof iaGenerate!=='function'){ out.textContent = '⚠ Assistant IA indisponible.'; return; }
  if(btn){ btn.disabled = true; btn.textContent = '⏳ Analyse…'; }
  out.innerHTML = '<span style="color:var(--textm)">⏳ Le Directeur Marketing réfléchit…</span>';

  const r = (typeof vtPeriodeRange==='function') ? vtPeriodeRange(MKT_PERIODE) : {label:'la période'};
  const lignes = MKT_ROWS.map(x=>
    `- ${x.f} (${x.espece||'—'}) [${x.quad}] : ${fmtKg(x.kg)} kg vendus, CA ${fmt(x.ca)} F, coût ${fmt(x.coutKg)} F/kg, prix moyen ${fmt(x.pmv)} F/kg, marge ${fmt(x.margeKg)} F/kg (${x.margePct}%), marge totale ${fmt(x.marge)} F`
  ).join('\n');

  const q = `Tu es le Directeur Marketing de la provenderie SADARI. Voici l'analyse RÉELLE des marges par formule sur ${r.label} :
${lignes}

Légende des quadrants : star=fort volume+forte marge, cash=fort volume+marge moyenne, potentiel=faible volume+forte marge, revoir=faible volume+faible marge.

Donne un diagnostic stratégique CONCRET et chiffré :
1) Sur quelles formules CONCENTRER nos efforts commerciaux (meilleur volume × marge) et pourquoi.
2) Lesquelles repositionner, abandonner, ou dont il faut revoir le prix (avec une suggestion de prix si pertinent).
3) Les 3 actions prioritaires de la semaine.
Cite les formules et les chiffres. Sois percutant et actionnable. Pas de blabla.`;

  try{
    const txt = await iaGenerate('marketing', q, 'pro'); // tier "pro" (Claude) pour la stratégie
    out.textContent = txt || 'Réponse vide.';
  }catch(e){
    out.innerHTML = '⚠ ' + (e.message||e);
  }
  if(btn){ btn.disabled = false; btn.textContent = 'Réanalyser'; }
}
