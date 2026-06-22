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

  // Bloc diagnostic IA — 2 moteurs : Pro (DeepSeek) / Premium (Claude)
  const ia = `<div class="card">
    <div class="card-title"><div class="ct-left"><span>🧠 Diagnostic du Directeur Marketing</span></div>
      <div style="display:flex;gap:6px">
        <button class="btn btn-g btn-sm" id="mkt-ia-pro" onclick="analyserMarketingIA('eco')" title="DeepSeek — rapide & éco">🚀 Pro</button>
        <button class="btn btn-out btn-sm" id="mkt-ia-prem" onclick="analyserMarketingIA('pro')" title="Claude — qualité max">💎 Premium</button>
      </div>
    </div>
    <div id="mkt-ia-result" style="font-size:13px;line-height:1.5;white-space:pre-wrap;color:var(--text)">
      <span style="color:var(--textm)">Clique <b>🚀 Pro</b> (DeepSeek) ou <b>💎 Premium</b> (Claude) pour un diagnostic : où concentrer tes formules.</span>
    </div>
  </div>`;

  root.innerHTML = kpis + matrice + tbl + ia + '<div id="mkt-seg-zone"><div style="color:var(--textm);font-size:12px;padding:10px">⏳ Chargement des segments clients…</div></div>';
  renderMarketingSegments();
}

async function analyserMarketingIA(tier){
  tier = tier || 'eco';
  const out = document.getElementById('mkt-ia-result');
  const bPro = document.getElementById('mkt-ia-pro'), bPrem = document.getElementById('mkt-ia-prem');
  if(!out) return;
  if(!MKT_ROWS.length){ out.textContent = 'Aucune donnée à analyser.'; return; }
  if(typeof iaGenerate!=='function'){ out.textContent = '⚠ Assistant IA indisponible.'; return; }
  if(bPro) bPro.disabled = true; if(bPrem) bPrem.disabled = true;
  out.innerHTML = `<span style="color:var(--textm)">⏳ Le Directeur Marketing réfléchit (${tier==='eco'?'Pro · DeepSeek':'Premium · Claude'})…</span>`;

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
    // Pro = 'eco' (DeepSeek) par défaut · Premium = 'pro' (Claude) pour les cas extrêmes
    const txt = await iaGenerate('marketing', q, tier);
    out.textContent = txt || 'Réponse vide.';
  }catch(e){
    out.innerHTML = '⚠ ' + (e.message||e);
  }
  if(bPro) bPro.disabled = false; if(bPrem) bPrem.disabled = false;
}

// ── SEGMENTS CLIENTS & RELANCES (Lot 2) ───────────
var MKT_SEG = 'contacter';   // segment affiché
const MKT_SEG_DEF = {
  contacter: {label:'🎯 À contacter',  hint:'En retard + perdus, les plus rentables d\'abord'},
  nouveau:   {label:'🆕 Nouveaux',     hint:'1 seul achat — pousser le 2e'},
  regulier:  {label:'🟢 Fidèles',      hint:'Réguliers — remercier / réappro'},
  retard:    {label:'🟠 En retard',    hint:'Au-delà de leur rythme habituel'},
  perdu:     {label:'🔴 Perdus',       hint:'Plus de 60 j ou 2× leur fréquence'},
};

function mktSetSeg(seg){
  MKT_SEG = seg;
  document.querySelectorAll('.mkt-seg-btn').forEach(b=>b.classList.toggle('on', b.dataset.seg===seg));
  _mktRenderListe();
}

var _MKT_SEGS = null; // cache des clients segmentés

async function renderMarketingSegments(){
  const zone = document.getElementById('mkt-seg-zone');
  if(!zone) return;
  if(typeof loadClients==='function' && (typeof GP_CLIENTS==='undefined' || !GP_CLIENTS.length)) await loadClients();
  if(typeof loadClientStats==='function') await loadClientStats();
  const clients = (typeof GP_CLIENTS!=='undefined' ? GP_CLIENTS : []) || [];

  // Segmenter
  const segs = {nouveau:[],regulier:[],retard:[],perdu:[],aucun:[]};
  const tous = [];
  clients.forEach(c=>{
    const s = (GP_CLIENT_STATS||{})[c.id] || {};
    const st = (typeof clientStatut==='function') ? clientStatut(s) : {key:'aucun'};
    const item = {c, s, st, jours:st.jours, ca:Number(s.totalCA||0)};
    (segs[st.key]||segs.aucun).push(item);
    tous.push(item);
  });
  mktComputeRFM(tous);   // attribue x.rfm à chaque client
  _MKT_SEGS = segs;

  const cnt = k => (segs[k]||[]).length;
  const nbContacter = cnt('retard') + cnt('perdu');

  const chips = `<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px">
    <button class="mkt-seg-btn on" data-seg="contacter" onclick="mktSetSeg('contacter')">🎯 À contacter (${nbContacter})</button>
    <button class="mkt-seg-btn" data-seg="nouveau" onclick="mktSetSeg('nouveau')">🆕 Nouveaux (${cnt('nouveau')})</button>
    <button class="mkt-seg-btn" data-seg="regulier" onclick="mktSetSeg('regulier')">🟢 Fidèles (${cnt('regulier')})</button>
    <button class="mkt-seg-btn" data-seg="retard" onclick="mktSetSeg('retard')">🟠 En retard (${cnt('retard')})</button>
    <button class="mkt-seg-btn" data-seg="perdu" onclick="mktSetSeg('perdu')">🔴 Perdus (${cnt('perdu')})</button>
  </div>`;

  zone.innerHTML = `
    <style>
      .mkt-seg-btn{font-size:11px;padding:5px 10px;border:1px solid var(--border);background:var(--card2);color:var(--textm);border-radius:14px;cursor:pointer;font-weight:600}
      .mkt-seg-btn.on{background:var(--g4,#16A34A);color:#fff;border-color:var(--g4,#16A34A)}
    </style>
    <div id="mkt-cycle-zone"></div>
    <div id="mkt-crosssell-zone"></div>
    <div id="mkt-relance-stats"></div>
    <div class="card">
      <div class="card-title"><div class="ct-left"><span>📣 Relances clients par segment</span></div></div>
      ${chips}
      <div id="mkt-seg-liste"></div>
    </div>
    ${_mktNouveauContactCard()}
    ${_mktFicheCard()}`;
  _mktRenderListe();
  mktRenderCycle();
  mktRenderCrossSell();
  mktRenderRelanceStats();
}

// ── CROSS-SELL : produits manquants du cycle ──────
// Détecte les TROUS internes : un client qui achète plusieurs stades d'une
// espèce mais en saute un (= il l'achète ailleurs) → on lui propose le manquant.
function mktCrossSellOpps(){
  const clients = (typeof GP_CLIENTS!=='undefined'?GP_CLIENTS:[]) || [];
  const cats = (typeof GP_CATEGORIES!=='undefined'?GP_CATEGORIES:[]) || [];
  const opps = [];
  clients.forEach(c=>{
    const s=(GP_CLIENT_STATS||{})[c.id]; if(!s||!s.formules) return;
    const byEsp={};
    Object.keys(s.formules).forEach(fn=>{
      const f=(typeof getFormule==='function'?getFormule(fn):null)||(FORMULES_SADARI||[]).find(x=>x.nom===fn);
      if(!f||!f.espece||!f.stade) return;
      const cat=cats.find(x=>x.espece===f.espece&&x.categorie===f.stade);
      if(!cat) return;
      byEsp[f.espece]=byEsp[f.espece]||{ordres:new Set(),stades:new Set()};
      byEsp[f.espece].ordres.add(Number(cat.ordre||0));
      byEsp[f.espece].stades.add(f.stade);
    });
    Object.entries(byEsp).forEach(([esp,info])=>{
      if(info.stades.size<2) return; // besoin d'au moins 2 stades pour parler de cycle
      const ec=cats.filter(x=>x.espece===esp).sort((a,b)=>(a.ordre||0)-(b.ordre||0));
      const minO=Math.min(...info.ordres), maxO=Math.max(...info.ordres);
      ec.forEach(cat=>{
        if((cat.ordre||0)>minO && (cat.ordre||0)<maxO && !info.stades.has(cat.categorie)){
          const fn=_formulePourStade(esp,cat.categorie);
          opps.push({c, espece:esp, manque:(cat.categorie_label||cat.categorie), formule: fn?fn.nom:null, ca:Number(s.totalCA||0)});
        }
      });
    });
  });
  return opps.sort((a,b)=>b.ca-a.ca);
}

function mktRenderCrossSell(){
  const zone=document.getElementById('mkt-crosssell-zone');
  if(!zone) return;
  const opps=mktCrossSellOpps();
  if(!opps.length){
    zone.innerHTML=`<div class="card"><div class="card-title"><div class="ct-left"><span>🔗 Cross-sell — produits manquants</span></div></div>
      <div style="color:var(--textm);font-size:12px;padding:6px">Aucun trou de cycle détecté. (On repère les clients qui achètent plusieurs stades d'une espèce mais en sautent un.)</div></div>`;
    return;
  }
  const top=opps.slice(0,30);
  zone.innerHTML=`<div class="card"><div class="card-title"><div class="ct-left"><span>🔗 Cross-sell — produits manquants (${opps.length})</span></div></div>
    <div style="font-size:11px;color:var(--textm);margin-bottom:8px">Ces clients achètent leur cycle chez nous… sauf une étape. Récupère-la.</div>
    <div style="overflow-x:auto"><table class="tbl" style="font-size:11px"><thead><tr>
      <th>Client</th><th>Espèce</th><th>Manque</th><th>Formule à proposer</th><th></th>
    </tr></thead><tbody>
    ${top.map(o=>`<tr>
      <td><b>${(o.c.nom||'—').replace(/</g,'&lt;')}</b></td>
      <td style="font-size:10px;text-transform:capitalize">${o.espece}</td>
      <td><span style="color:var(--gold);font-weight:700;font-size:10px">${o.manque}</span></td>
      <td style="font-size:10px;color:var(--g6)">${o.formule||'—'}</td>
      <td style="white-space:nowrap">
        <button class="btn btn-g btn-sm" style="padding:4px 7px" title="DeepSeek" onclick="relanceCrossSellIA('${o.c.id}','${(o.formule||o.manque).replace(/'/g,"\\'")}','eco')">🚀</button>
        <button class="btn btn-out btn-sm" style="padding:4px 7px" title="Claude" onclick="relanceCrossSellIA('${o.c.id}','${(o.formule||o.manque).replace(/'/g,"\\'")}','pro')">💎</button>
      </td>
    </tr>`).join('')}
    </tbody></table></div></div>`;
}

async function relanceCrossSellIA(clientId, produit, tier){
  tier=tier||'eco';
  const c=(GP_CLIENTS||[]).find(x=>x.id===clientId); if(!c) return;
  if(typeof iaGenerate!=='function'){ notify('IA indisponible','r'); return; }
  notify(`✍️ Rédaction (${tier==='eco'?'Pro':'Premium'})…`,'gold');
  try{
    const q=`Rédige UNIQUEMENT un message WhatsApp court et malin pour le client "${c.nom}" de la provenderie SADARI. Ce client achète déjà chez nous mais ne prend pas "${produit}" (il l'achète sûrement ailleurs). Propose-lui naturellement de prendre aussi "${produit}" chez nous — avantage : tout au même endroit, qualité homogène sur tout le cycle. Reste subtil, pas agressif. Termine par la signature SADARI. Donne seulement le message, sans commentaire ni guillemets.`;
    const txt=await iaGenerate('marketing', q, tier);
    if(typeof ouvrirModalWA==='function'){ ouvrirModalWA(clientId); setTimeout(()=>{const ta=document.getElementById('wa-preview'); if(ta) ta.value=txt;},60); }
    else alert(txt);
    if(typeof logRelance==='function') logRelance(clientId, 'cross-sell', c.nom);
  }catch(e){ notify('Échec IA : '+(e.message||e),'r'); }
}

// ── SCORE RFM (Récence × Fréquence × Montant) ─────
function _mktScore5(arr, val, invert){
  if(!arr.length) return 3;
  const s = arr.slice().sort((a,b)=>a-b);
  const rank = s.filter(v=>v<=val).length / s.length; // 0..1
  let sc = Math.ceil(rank*5) || 1;
  if(sc>5) sc=5;
  return invert ? (6-sc) : sc;
}
function mktComputeRFM(items){
  const ws = items.filter(x=>x.s && x.s.nbAchats);
  const rec = ws.map(x=> x.jours==null?9999:x.jours);
  const freq = ws.map(x=> x.s.nbAchats||0);
  const mon = ws.map(x=> x.ca||0);
  ws.forEach(x=>{
    const r = _mktScore5(rec, x.jours==null?9999:x.jours, true);  // récent (peu de jours) = bon
    const f = _mktScore5(freq, x.s.nbAchats||0, false);
    const m = _mktScore5(mon, x.ca||0, false);
    const score = r+f+m;
    x.rfm = {r,f,m,score, label: score>=12?'🔥 VIP':score>=9?'⭐ Bon':score>=6?'👍 Moyen':'💤 Faible'};
  });
}

// ── CALENDRIER DE CYCLE D'ÉLEVAGE ─────────────────
const _CYCLE_DUREE = [
  {kw:['demarr','starter','start','pre-dem','0-'], j:14},
  {kw:['poussin','poulette','pullet','elevage','pre-ponte','preponte'], j:42},
  {kw:['croiss','grower','growth','2-'], j:21},
  {kw:['finition','finish','final','engrais'], j:21},
  {kw:['ponte','pondeuse','layer','lay','production'], j:null}, // continu → fréquence
];
function _cycleDuree(stade){
  const s=(stade||'').toLowerCase();
  for(const d of _CYCLE_DUREE){ if(d.kw.some(k=>s.includes(k))) return d.j; }
  return 30; // défaut prudent
}
function _cycleNextCateg(espece, stade){
  const cats=((typeof GP_CATEGORIES!=='undefined'?GP_CATEGORIES:[])||[])
    .filter(c=>c.espece===espece).sort((a,b)=>(a.ordre||0)-(b.ordre||0));
  const i=cats.findIndex(c=>c.categorie===stade);
  if(i<0) return null;
  return cats[i+1]||null; // null = fin de cycle
}
function _formulePourStade(espece, categorie){
  const list=((typeof getAllFormules==='function'?getAllFormules():FORMULES_SADARI)||[]);
  return list.find(f=>f.espece===espece && f.stade===categorie) || null;
}
// Prévision : quand ce client aura besoin de sa prochaine formule
function mktCycleNext(s){
  if(!s || !s.derniereFormule || !s.dernier) return null;
  const f=(typeof getFormule==='function'?getFormule(s.derniereFormule):null) || (FORMULES_SADARI||[]).find(x=>x.nom===s.derniereFormule);
  if(!f) return null;
  const duree=_cycleDuree(f.stade);
  const last=new Date(s.dernier);
  if(duree==null){ // ponte → réappro selon fréquence
    const fr=s.freqMoyenne||30;
    const next=new Date(last); next.setDate(last.getDate()+fr);
    return {prochaine:next, jours:Math.round((next-Date.now())/86400000), formuleSuivante:f.nom, stade:f.stade||'ponte', type:'reappro'};
  }
  const next=new Date(last); next.setDate(last.getDate()+duree);
  const nextCat=_cycleNextCateg(f.espece, f.stade);
  let formuleSuivante=null, type='suite';
  if(nextCat){ const fn=_formulePourStade(f.espece, nextCat.categorie); formuleSuivante = fn?fn.nom:(nextCat.categorie_label||nextCat.categorie); }
  else { type='nouveau_cycle'; }
  return {prochaine:next, jours:Math.round((next-Date.now())/86400000), formuleSuivante, stade:f.stade, type};
}

function mktRenderCycle(){
  const zone=document.getElementById('mkt-cycle-zone');
  if(!zone || !_MKT_SEGS) return;
  const tous=[..._MKT_SEGS.nouveau,..._MKT_SEGS.regulier,..._MKT_SEGS.retard,..._MKT_SEGS.perdu];
  const items=[];
  tous.forEach(x=>{
    const cy=mktCycleNext(x.s);
    if(!cy) return;
    if(cy.jours<=7 && cy.jours>=-30) items.push({...x, cy}); // bientôt dû ou en retard récent
  });
  items.sort((a,b)=>a.cy.jours-b.cy.jours);
  if(!items.length){
    zone.innerHTML=`<div class="card"><div class="card-title"><div class="ct-left"><span>⏰ Cycle d'élevage — à relancer bientôt</span></div></div>
      <div style="color:var(--textm);font-size:12px;padding:6px">Aucun client à relancer dans les 7 prochains jours. (Basé sur la dernière formule achetée + durée de phase.)</div></div>`;
    return;
  }
  const top=items.slice(0,40);
  zone.innerHTML=`<div class="card"><div class="card-title"><div class="ct-left"><span>⏰ Cycle d'élevage — à relancer bientôt (${items.length})</span></div></div>
    <div style="font-size:11px;color:var(--textm);margin-bottom:8px">Anticipe le prochain besoin selon la dernière formule + la durée de phase.</div>
    <div style="overflow-x:auto"><table class="tbl" style="font-size:11px"><thead><tr>
      <th>Client</th><th>Dernière formule</th><th>Échéance</th><th>Prochaine formule</th><th></th>
    </tr></thead><tbody>
    ${top.map(x=>{
      const j=x.cy.jours;
      const ech = j<0?`<span style="color:var(--red)">en retard ${-j} j</span>` : j===0?'<span style="color:var(--gold)">aujourd\'hui</span>' : `dans ${j} j`;
      const suiv = x.cy.type==='nouveau_cycle' ? '🔄 nouveau cycle' : (x.cy.formuleSuivante||'—');
      return `<tr>
        <td><b>${(x.c.nom||'—').replace(/</g,'&lt;')}</b>${x.c.telephone?'':' <span style="font-size:9px;color:var(--red)">sans n°</span>'}</td>
        <td style="font-size:10px">${x.s.derniereFormule||'—'}</td>
        <td>${ech}</td>
        <td style="font-size:10px;color:var(--g6)">${suiv}</td>
        <td style="white-space:nowrap">
          <button class="btn btn-g btn-sm" style="padding:4px 7px" title="DeepSeek" onclick="relanceCycleIA('${x.c.id}','eco')">🚀</button>
          <button class="btn btn-out btn-sm" style="padding:4px 7px" title="Claude" onclick="relanceCycleIA('${x.c.id}','pro')">💎</button>
        </td>
      </tr>`;
    }).join('')}
    </tbody></table></div></div>`;
}

// Relance "cycle" : message IA centré sur la prochaine formule du cycle
async function relanceCycleIA(clientId, tier){
  tier=tier||'eco';
  const c=(GP_CLIENTS||[]).find(x=>x.id===clientId); if(!c) return;
  if(typeof iaGenerate!=='function'){ notify('IA indisponible','r'); return; }
  if(typeof loadClientStats==='function') await loadClientStats();
  const s=(GP_CLIENT_STATS||{})[clientId]||{};
  const cy=mktCycleNext(s);
  notify(`✍️ Rédaction (${tier==='eco'?'Pro':'Premium'})…`,'gold');
  try{
    let contexte;
    if(cy && cy.type==='reappro') contexte=`Il achète régulièrement "${s.derniereFormule}". Propose-lui de se réapprovisionner maintenant pour ne pas tomber en rupture.`;
    else if(cy && cy.type==='nouveau_cycle') contexte=`Il a terminé un cycle d'élevage (dernière formule "${s.derniereFormule}"). Propose-lui de démarrer une nouvelle bande avec nos aliments.`;
    else if(cy && cy.formuleSuivante) contexte=`Son élevage passe à l'étape suivante : après "${s.derniereFormule}", il a maintenant besoin de "${cy.formuleSuivante}". Propose-lui de venir le chercher au bon moment.`;
    else contexte=`Propose-lui de se réapprovisionner en aliments.`;
    const q=`Rédige UNIQUEMENT un message WhatsApp court, chaleureux et opportun pour le client "${c.nom}" de la provenderie SADARI. ${contexte} Sois précis sur le bon timing. Termine par la signature SADARI. Donne seulement le message, sans commentaire ni guillemets.`;
    const txt=await iaGenerate('marketing', q, tier);
    if(typeof ouvrirModalWA==='function'){ ouvrirModalWA(clientId); setTimeout(()=>{const ta=document.getElementById('wa-preview'); if(ta) ta.value=txt;},60); }
    else alert(txt);
    if(typeof logRelance==='function') logRelance(clientId, 'cycle', c.nom);
  }catch(e){ notify('Échec IA : '+(e.message||e),'r'); }
}

// ── BOUCLE D'APPRENTISSAGE : efficacité des relances ──
async function mktRenderRelanceStats(){
  const zone=document.getElementById('mkt-relance-stats');
  if(!zone) return;
  let rel=[];
  try{
    const{data,error}=await SB.from('gp_relances').select('*')
      .eq('admin_id',GP_ADMIN_ID).order('created_at',{ascending:false}).limit(500);
    if(error) throw error;
    rel=data||[];
  }catch(e){
    zone.innerHTML=`<div class="card"><div class="card-title"><div class="ct-left"><span>📈 Efficacité des relances</span></div></div>
      <div style="color:var(--textm);font-size:12px;padding:6px">Suivi non activé. Passe le SQL <b>gp_relances</b> (fourni dans le chat) pour mesurer l'impact de tes relances.</div></div>`;
    return;
  }
  if(!rel.length){
    zone.innerHTML=`<div class="card"><div class="card-title"><div class="ct-left"><span>📈 Efficacité des relances</span></div></div>
      <div style="color:var(--textm);font-size:12px;padding:6px">Aucune relance enregistrée. Lance des relances ⬇️ et reviens mesurer les rachats.</div></div>`;
    return;
  }
  if(typeof loadClientStats==='function') await loadClientStats();
  const stats=GP_CLIENT_STATS||{};
  let conv=0; const delais=[]; const parSeg={};
  rel.forEach(r=>{
    const rd=(r.created_at||'').slice(0,10);
    const s=stats[r.client_id];
    let racheté=false, delai=null;
    if(s && s.dates){
      const after=s.dates.filter(d=>d>rd).sort();
      if(after.length){ racheté=true; delai=Math.round((new Date(after[0])-new Date(rd))/86400000); }
    }
    const seg=r.segment||'autre';
    parSeg[seg]=parSeg[seg]||{n:0,r:0};
    parSeg[seg].n++;
    if(racheté){ parSeg[seg].r++; conv++; if(delai!=null) delais.push(delai); }
  });
  const taux=rel.length?Math.round(conv/rel.length*100):0;
  const delaiMoy=delais.length?Math.round(delais.reduce((a,b)=>a+b,0)/delais.length):null;
  const segRows=Object.entries(parSeg).sort((a,b)=>b[1].n-a[1].n).map(([seg,v])=>
    `<tr><td>${seg}</td><td class="num">${v.n}</td><td class="num">${v.r}</td><td class="num" style="color:${v.n&&v.r/v.n>=0.3?'var(--green)':'var(--textm)'}">${v.n?Math.round(v.r/v.n*100):0}%</td></tr>`
  ).join('');
  zone.innerHTML=`<div class="card">
    <div class="card-title"><div class="ct-left"><span>📈 Efficacité des relances</span></div></div>
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px">
      <div class="econo-box"><div class="econo-val">${rel.length}</div><div class="econo-lbl">Relances</div></div>
      <div class="econo-box"><div class="econo-val" style="color:var(--green)">${conv}</div><div class="econo-lbl">Rachats</div></div>
      <div class="econo-box"><div class="econo-val" style="color:${taux>=30?'var(--green)':'var(--gold)'}">${taux}%</div><div class="econo-lbl">Taux de conversion</div></div>
      <div class="econo-box"><div class="econo-val">${delaiMoy!=null?delaiMoy+' j':'—'}</div><div class="econo-lbl">Délai moyen rachat</div></div>
    </div>
    <div style="overflow-x:auto"><table class="tbl" style="font-size:11px"><thead><tr>
      <th>Segment</th><th class="num">Relances</th><th class="num">Rachats</th><th class="num">Taux</th>
    </tr></thead><tbody>${segRows}</tbody></table></div>
    <div style="font-size:10px;color:var(--textm);margin-top:6px">Un rachat = un achat enregistré après la date de la relance.</div>
  </div>`;
}

// ── FICHE TECHNIQUE IA (calcul réel + interprétation) ──
const _MKT_NUTRI_LBL = {
  prot:{l:'Protéines',u:'%'}, em:{l:'Énergie',u:'kcal/kg'}, mg:{l:'Mat. grasses',u:'%'},
  cb:{l:'Cellulose',u:'%'}, ca:{l:'Calcium',u:'%'}, lys:{l:'Lysine',u:'%'},
  met:{l:'Méthionine',u:'%'}, mm:{l:'Mat. minérales',u:'%'}
};

function _mktFicheCard(){
  const formules = (typeof getAllFormules==='function' ? getAllFormules() : (FORMULES_SADARI||[]));
  const opts = (formules||[]).map(f=>`<option value="${(f.nom||'').replace(/"/g,'&quot;')}">${f.nom}</option>`).join('');
  return `<div class="card">
    <div class="card-title"><div class="ct-left"><span>📄 Fiche technique IA</span></div></div>
    <div style="font-size:11px;color:var(--textm);margin-bottom:8px">Valeurs calculées depuis la composition réelle ; l'IA rédige la fiche descriptive + vérifie la conformité aux normes.</div>
    <div class="fr"><label>Formule</label>
      <select id="mkt-ft-formule" onchange="mktFichePreview()">${opts?'<option value="">— Choisir une formule —</option>'+opts:'<option value="">Aucune formule</option>'}</select>
    </div>
    <div id="mkt-ft-nutri"></div>
    <div style="display:flex;gap:6px;margin:8px 0">
      <button class="btn btn-g btn-sm" onclick="ficheTechniqueIA('eco')" title="DeepSeek">🚀 Pro</button>
      <button class="btn btn-out btn-sm" onclick="ficheTechniqueIA('pro')" title="Claude">💎 Premium</button>
    </div>
    <div id="mkt-ft-result" style="font-size:13px;line-height:1.5;white-space:pre-wrap;color:var(--text)"></div>
  </div>`;
}

// Profil nutritionnel + conformité aux normes pour une formule
function _mktProfilFormule(nom){
  const f = (typeof getFormule==='function' && getFormule(nom)) || (FORMULES_SADARI||[]).find(x=>x.nom===nom);
  if(!f || typeof calcNutri!=='function') return null;
  const n = calcNutri(f);
  // Normes (besoins) pour espèce + stade
  const besoin = (typeof GP_BESOINS!=='undefined' ? GP_BESOINS : []).find(b=>b.espece===f.espece && b.categorie===(f.stade||b.categorie));
  const checks = [];
  const cmp = (key, val, min, max)=>{
    val = Number(val);
    let verdict = 'ok';
    if(min!=null && val < Number(min)) verdict='bas';
    else if(max!=null && val > Number(max)) verdict='haut';
    checks.push({key, val, min, max, verdict});
  };
  if(besoin){
    cmp('prot', n.prot, besoin.pb_min, besoin.pb_max);
    cmp('em',   n.em,   besoin.em_min, besoin.em_max);
    cmp('ca',   n.ca,   besoin.calcium_min, besoin.calcium_max);
    cmp('lys',  n.lys,  besoin.lysine_min, besoin.lysine_max);
    cmp('met',  n.met,  besoin.methionine_min, besoin.methionine_max);
  }
  return { f, n, besoin, checks };
}

function mktFichePreview(){
  const box = document.getElementById('mkt-ft-nutri');
  const res = document.getElementById('mkt-ft-result');
  if(res) res.innerHTML = '';
  if(!box) return;
  const nom = document.getElementById('mkt-ft-formule')?.value;
  if(!nom){ box.innerHTML=''; return; }
  const p = _mktProfilFormule(nom);
  if(!p){ box.innerHTML='<div style="color:var(--textm);font-size:12px">Profil indisponible.</div>'; return; }
  const vcol = {ok:'var(--green)', bas:'var(--red)', haut:'var(--gold)'};
  const vico = {ok:'✅', bas:'⬇ bas', haut:'⬆ haut'};
  const chk = k => { const c=p.checks.find(x=>x.key===k); return c?` <span style="font-size:9px;color:${vcol[c.verdict]}">${vico[c.verdict]}</span>`:''; };
  const cells = Object.keys(_MKT_NUTRI_LBL).map(k=>{
    const m=_MKT_NUTRI_LBL[k];
    return `<div class="econo-box"><div class="econo-val" style="font-size:14px">${p.n[k]}${chk(k)}</div><div class="econo-lbl">${m.l} (${m.u})</div></div>`;
  }).join('');
  box.innerHTML = `<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:6px">${cells}</div>
    <div style="font-size:10px;color:var(--textm);margin-top:6px">${p.besoin?('Normes : '+p.f.espece+' / '+(p.f.stade||p.besoin.categorie)):'Pas de norme enregistrée pour cette formule (espèce/stade).'}</div>`;
}

async function ficheTechniqueIA(tier){
  tier = tier || 'eco';
  const nom = document.getElementById('mkt-ft-formule')?.value;
  const out = document.getElementById('mkt-ft-result');
  if(!out) return;
  if(!nom){ notify('Choisis une formule','r'); return; }
  if(typeof iaGenerate!=='function'){ out.textContent='⚠ IA indisponible.'; return; }
  const p = _mktProfilFormule(nom);
  if(!p){ out.textContent='Profil indisponible.'; return; }
  out.innerHTML = `<span style="color:var(--textm)">⏳ Rédaction de la fiche (${tier==='eco'?'Pro · DeepSeek':'Premium · Claude'})…</span>`;

  const vals = Object.keys(_MKT_NUTRI_LBL).map(k=>`${_MKT_NUTRI_LBL[k].l} : ${p.n[k]} ${_MKT_NUTRI_LBL[k].u}`).join(', ');
  const conf = p.checks.length
    ? 'Conformité aux normes ('+p.f.espece+'/'+(p.f.stade||'')+') : '+p.checks.map(c=>`${_MKT_NUTRI_LBL[c.key].l} ${c.verdict==='ok'?'conforme':c.verdict==='bas'?'EN DESSOUS du minimum ('+c.min+')':'AU-DESSUS du maximum ('+c.max+')'}`).join(', ')+'.'
    : 'Pas de norme de référence enregistrée pour cette formule.';

  const q = `Tu es le nutritionniste de la provenderie SADARI (Togo). Rédige une FICHE TECHNIQUE professionnelle et claire pour l'aliment "${p.f.nom}"${p.f.espece?` (${p.f.espece}${p.f.stade?' — '+p.f.stade:''})`:''}.
Valeurs nutritionnelles RÉELLES (calculées) : ${vals}.
${conf}

Structure la fiche :
1) Présentation courte (à quel animal/stade elle est destinée).
2) Tableau/liste des valeurs nutritionnelles clés (reprends EXACTEMENT les chiffres ci-dessus, n'invente rien).
3) Conseils d'utilisation (dosage, eau, conservation) — généraux et prudents.
4) Un court argumentaire de vente (2-3 phrases).
${p.checks.some(c=>c.verdict!=='ok')?'Mentionne avec tact les écarts aux normes.':''}
Reste factuel, n'invente aucune valeur non fournie. Format lisible (WhatsApp/impression).`;

  try{
    const txt = await iaGenerate('marketing', q, tier);
    out.textContent = txt || 'Réponse vide.';
  }catch(e){ out.innerHTML = '⚠ ' + (e.message||e); }
}

function _mktRenderListe(){
  const box = document.getElementById('mkt-seg-liste');
  if(!box || !_MKT_SEGS) return;
  let liste;
  const byRFM=(a,b)=>((b.rfm?.score||0)-(a.rfm?.score||0))||(b.ca-a.ca); // priorité : valeur RFM puis CA
  if(MKT_SEG==='contacter'){
    liste = [..._MKT_SEGS.retard, ..._MKT_SEGS.perdu].sort(byRFM);
  }else{
    liste = (_MKT_SEGS[MKT_SEG]||[]).slice().sort(byRFM);
  }
  if(!liste.length){ box.innerHTML = `<div style="color:var(--textm);font-size:12px;padding:10px">Aucun client dans ce segment.</div>`; return; }
  const top = liste.slice(0, 40);
  box.innerHTML = `<div style="overflow-x:auto"><table class="tbl" style="font-size:11px"><thead><tr>
      <th>Client</th><th>RFM</th><th>Statut</th><th class="num">CA</th><th class="num">Absence</th><th>Habituel</th><th></th>
    </tr></thead><tbody>
    ${top.map(x=>`<tr>
      <td><b>${(x.c.nom||'—').replace(/</g,'&lt;')}</b>${x.c.telephone?`<div style="font-size:9px;color:var(--textm)">${x.c.telephone}</div>`:'<div style="font-size:9px;color:var(--red)">sans n°</div>'}</td>
      <td><span style="font-size:10px;font-weight:700" title="R${x.rfm?.r||'-'} F${x.rfm?.f||'-'} M${x.rfm?.m||'-'}">${x.rfm?.label||'—'}</span></td>
      <td><span style="color:${x.st.color};font-size:10px;font-weight:700">${x.st.emoji} ${x.st.label}</span></td>
      <td class="num" style="color:var(--gold)">${fmt(x.ca)}</td>
      <td class="num">${x.jours!=null?x.jours+' j':'—'}</td>
      <td style="font-size:10px">${x.s.produitHabituel||'—'}</td>
      <td style="white-space:nowrap">
        <button class="btn btn-g btn-sm" style="padding:4px 7px" title="DeepSeek" onclick="redigerRelanceIA('${x.c.id}','eco')">🚀</button>
        <button class="btn btn-out btn-sm" style="padding:4px 7px" title="Claude" onclick="redigerRelanceIA('${x.c.id}','pro')">💎</button>
      </td>
    </tr>`).join('')}
  </tbody></table></div>
  ${liste.length>top.length?`<div style="font-size:10px;color:var(--textm);margin-top:6px">Affichage des ${top.length} prioritaires (RFM) sur ${liste.length}.</div>`:''}`;
}

// Composeur "nouveau contact" : nom + numéro + type → IA rédige → WhatsApp 1 clic
function _mktNouveauContactCard(){
  return `<div class="card">
    <div class="card-title"><div class="ct-left"><span>✍️ Nouveau contact (hors base)</span></div></div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px">
      <div class="fr" style="margin:0"><label>Nom du contact</label><input type="text" id="mkt-nc-nom" placeholder="Ex: M. Kossi"></div>
      <div class="fr" style="margin:0"><label>Numéro WhatsApp</label><input type="text" id="mkt-nc-tel" placeholder="Ex: 90 12 34 56"></div>
    </div>
    <div class="fr"><label>Type de message</label>
      <select id="mkt-nc-type">
        <option value="prospect">🔍 Prospect — première approche</option>
        <option value="essai">🎁 Invitation à essayer nos aliments</option>
        <option value="nouveau">🆕 Bienvenue nouveau client</option>
        <option value="remerciement">🙏 Remerciement</option>
        <option value="relance">🔁 Relance / suivi</option>
      </select>
    </div>
    <div style="display:flex;gap:6px;margin-bottom:8px">
      <button class="btn btn-g btn-sm" onclick="relanceNouveauContactIA('eco')" title="DeepSeek">🚀 Pro</button>
      <button class="btn btn-out btn-sm" onclick="relanceNouveauContactIA('pro')" title="Claude">💎 Premium</button>
    </div>
    <div class="fr"><label>Message</label>
      <textarea id="mkt-nc-msg" rows="6" style="font-size:12px;line-height:1.5;width:100%;resize:vertical" placeholder="Le message rédigé par l'IA apparaîtra ici…"></textarea>
    </div>
    <div style="display:flex;gap:6px">
      <button class="btn btn-g" style="flex:1;justify-content:center" onclick="envoyerNouveauContactWA()">📲 Envoyer WhatsApp</button>
      <button class="btn btn-out" onclick="enregistrerNouveauContact()" title="Ajouter à la base clients">💾 Enregistrer</button>
    </div>
  </div>`;
}

async function relanceNouveauContactIA(tier){
  tier = tier || 'eco';
  const nom = document.getElementById('mkt-nc-nom')?.value.trim();
  const type = document.getElementById('mkt-nc-type')?.value || 'prospect';
  const out = document.getElementById('mkt-nc-msg');
  if(!nom){ notify('Entre le nom du contact','r'); return; }
  if(typeof iaGenerate!=='function'){ notify('IA indisponible','r'); return; }
  const angles = {
    prospect:'C\'est un PROSPECT qui ne nous connaît pas encore. Présente brièvement SADARI (provenderie, aliments de qualité) et donne envie d\'essayer.',
    essai:'Invite ce contact à ESSAYER nos aliments avec une offre découverte attractive.',
    nouveau:'Souhaite la BIENVENUE à ce nouveau client et incite-le à passer commande.',
    remerciement:'REMERCIE chaleureusement ce contact pour sa confiance.',
    relance:'RELANCE doucement ce contact pour reprendre le fil.',
  };
  out.value = '⏳ Rédaction IA ('+(tier==='eco'?'Pro · DeepSeek':'Premium · Claude')+')…';
  try{
    const q = `Rédige UNIQUEMENT un message WhatsApp court, chaleureux et professionnel pour la provenderie SADARI (aliments pour volaille/élevage, Togo). Destinataire : "${nom}". ${angles[type]||angles.prospect} Termine par la signature SADARI. Donne seulement le message, sans commentaire ni guillemets.`;
    const txt = await iaGenerate('marketing', q, tier);
    out.value = txt || '';
  }catch(e){ out.value=''; notify('Échec IA : '+(e.message||e),'r'); }
}

function _mktTelClean(tel){
  return (tel||'').replace(/[\s\-\+]/g,'').replace(/^00/,'').replace(/^228/,'');
}
function envoyerNouveauContactWA(){
  const tel = _mktTelClean(document.getElementById('mkt-nc-tel')?.value);
  const msg = document.getElementById('mkt-nc-msg')?.value || '';
  if(!tel){ notify('Entre le numéro WhatsApp','r'); return; }
  if(!msg.trim()){ notify('Rédige d\'abord le message (🚀 Pro / 💎 Premium)','r'); return; }
  window.open('https://wa.me/228'+tel+'?text='+encodeURIComponent(msg), '_blank');
}
async function enregistrerNouveauContact(){
  const nom = document.getElementById('mkt-nc-nom')?.value.trim();
  const tel = document.getElementById('mkt-nc-tel')?.value.trim();
  if(!nom){ notify('Entre le nom','r'); return; }
  const { error } = await SB.from('gp_clients').insert({
    admin_id: GP_ADMIN_ID, nom,
    telephone: tel||null,
    note: 'Prospect (ajouté depuis Marketing)',
    point_vente: (typeof GP_POINT_VENTE!=='undefined' && GP_POINT_VENTE) ? GP_POINT_VENTE : null
  });
  if(error){ notify('Erreur enregistrement : '+error.message,'r'); return; }
  notify('Contact enregistré comme client ✓');
  if(typeof loadClients==='function') await loadClients();
}
