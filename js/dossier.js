// ══════════════════════════════════════════════════
// PROVENDA — DOSSIER DE FINANCEMENT
// Synthèse financière (CA aliment, coût MP, charges, bénéfice) via
// calculerBenefPeriode() + actifs/garanties (stock MP) + SIMULATEUR de
// capacité d'emprunt (12/18/24/36 mois) + verdict anti-surendettement +
// impression brandée (window.print). Aide la banque ET le producteur.
// ══════════════════════════════════════════════════

let DOS = null;        // données calculées (pour le simulateur, sans re-fetch)
let DOS_MOIS = 12;     // période analysée (mois)

const DOS_DUREES = [12, 18, 24, 36];
const DOS_INP = 'padding:8px;border:1px solid var(--border);border-radius:8px;background:var(--card2);color:var(--text);font-weight:800;font-size:16px';

function _dosFmt(n){ return (typeof fmt==='function') ? fmt(n) : Math.round(Number(n)||0).toLocaleString('fr-FR'); }
function _dosNum(n){ return Number(n)||0; }
function _dosPct(a,b){ return b>0 ? Math.round(a/b*100) : 0; }
function _dosEsc(s){ return String(s==null?'':s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }
function _dosDate(){ try{ return new Date().toLocaleDateString('fr-FR'); }catch(_){ return ''; } }

// Mensualité (intérêt simple/dégressif « flat »)
function _dosEcheance(P, dureeMois, tauxAnnuel){ const a=dureeMois/12; return P>0 ? P*(1+(tauxAnnuel/100)*a)/dureeMois : 0; }
function _dosMaxLoan(ech, dureeMois, tauxAnnuel){ const a=dureeMois/12; return ech>0 ? ech*dureeMois/(1+(tauxAnnuel/100)*a) : 0; }

function _dosSetMois(m){ DOS_MOIS = m; renderDossier(); }

async function renderDossier(){
  const el = document.getElementById('page-dossier');
  if(!el) return;
  if(typeof GP_ADMIN_ID==='undefined' || !GP_ADMIN_ID){ el.innerHTML = _dosTitre()+'<div style="padding:16px;color:var(--textm)">Connexion requise.</div>'; return; }
  el.innerHTML = _dosTitre()+'<div style="padding:20px;color:var(--textm)">Analyse de tes données…</div>';

  // Période : DOS_MOIS derniers mois
  const now = new Date();
  const fin = now.toISOString().slice(0,10);
  const start = new Date(now.getFullYear(), now.getMonth()-(DOS_MOIS-1), 1);
  const debut = start.toISOString().slice(0,10);

  let d;
  try{ d = await calculerBenefPeriode(debut, fin); }
  catch(e){ console.error('dossier', e); el.innerHTML = _dosTitre()+'<div style="padding:16px;color:var(--textm)">Impossible de charger tes données, réessaie.</div>'; return; }

  // Valeur du stock MP (actif) — inventaire = niveaux × prix ingrédient
  let valStock = 0;
  try{
    if(typeof _fetchAllStockMp==='function' && typeof calcNiveaux==='function'){
      const mvts = await _fetchAllStockMp();
      const niv = calcNiveaux(mvts) || {};
      valStock = Object.entries(niv).reduce((s,[nom,qte])=>{
        const ig = (typeof GP_INGREDIENTS!=='undefined'?GP_INGREDIENTS:[]||[]).find(i=>i.nom===nom);
        return s + Math.max(0, _dosNum(qte)) * _dosNum(ig && ig.prix_actuel);
      }, 0);
    }
  }catch(_){}

  const cfg = (typeof GP_CONFIG!=='undefined' && GP_CONFIG) ? GP_CONFIG : {};
  const nom  = (cfg.nom_provenderie||'').trim() || 'Ma provenderie';
  const lieu = cfg.localisation || '';
  const logo = cfg.logo_url || '';

  DOS = { d, nbMois:DOS_MOIS, nom, lieu, logo, valStock, valMachine:0,
    benefNetMensuel: _dosNum(d.benefNet)/DOS_MOIS, taux:12, securite:50 };

  el.innerHTML = _dosUI();
  _dosSimuler();
}

function _dosTitre(){ return '<div style="font-size:20px;font-weight:800;color:var(--text);margin:4px 0 14px">🏦 Dossier de financement</div>'; }

// ── Rendu ──
function _dosUI(){
  const o = DOS, d = o.d;
  const nb = o.nbMois;
  const mens = n => _dosNum(n)/nb;
  const autresProd = _dosNum(d.coutMO)+_dosNum(d.coutEmb)+_dosNum(d.coutTrans);

  const row = (label, montant, ratio, analyse, strong, neg) => `<tr>
    <td style="padding:9px 10px;${strong?'font-weight:800':'font-weight:600'};color:var(--text)">${label}</td>
    <td style="padding:9px 10px;text-align:right;font-weight:${strong?800:700};font-size:15px;color:var(--text);font-family:'DM Mono',monospace">${neg?'− ':''}${_dosFmt(mens(montant))}</td>
    <td style="padding:9px 10px;text-align:right;color:var(--textm);font-weight:600">${ratio}</td>
    <td style="padding:9px 10px;text-align:right;font-weight:${strong?800:700};font-size:15px;color:${(strong&&montant<0)?'var(--red)':'var(--text)'};font-family:'DM Mono',monospace">${neg?'− ':''}${_dosFmt(montant)}</td>
    <td style="padding:9px 10px;color:var(--textm);font-size:12px">${analyse}</td>
  </tr>`;

  const per = (m,l)=>`<button onclick="_dosSetMois(${m})" style="border:1px solid ${DOS_MOIS===m?'var(--green)':'var(--border)'};background:${DOS_MOIS===m?'rgba(22,163,74,.15)':'var(--card2)'};color:var(--text);border-radius:20px;padding:6px 13px;cursor:pointer;font-size:12.5px;font-weight:${DOS_MOIS===m?800:500}">${l}</button>`;
  const periode = `<div class="card" style="padding:12px 14px;display:flex;align-items:center;gap:8px;flex-wrap:wrap">
    <span style="font-size:12.5px;color:var(--textm)">Période analysée :</span>${per(3,'3 mois')}${per(6,'6 mois')}${per(12,'12 mois')}</div>`;

  const synth = `<div class="card" style="padding:0;overflow:hidden">
    <div style="padding:12px 14px;font-weight:800;color:var(--text)">📊 Synthèse financière <span style="font-weight:500;color:var(--textm);font-size:12px">· ${nb} mois (base encaissée)</span></div>
    <div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:13px;min-width:540px">
      <thead><tr style="background:var(--card2)">
        <th style="padding:8px 10px;text-align:left;color:var(--textm);font-weight:700">Indicateur</th>
        <th style="padding:8px 10px;text-align:right;color:var(--textm);font-weight:700">Mensuel (F)</th>
        <th style="padding:8px 10px;text-align:right;color:var(--textm);font-weight:700">Ratio</th>
        <th style="padding:8px 10px;text-align:right;color:var(--textm);font-weight:700">Cumul (F)</th>
        <th style="padding:8px 10px;text-align:left;color:var(--textm);font-weight:700">Analyse</th>
      </tr></thead><tbody>
      ${row('Chiffre d\'affaires', d.ca, '100 %', 'Ventes d\'aliment (provenderie)')}
      ${row('Encaissé', d.enc, _dosPct(d.enc,d.ca)+' %', 'Réellement reçu (base du calcul)')}
      ${row('Coût matières premières', d.coutMP, _dosPct(d.coutMP,d.enc)+' %', 'Maïs, soja, son, concentrés', false, true)}
      ${row('Autres coûts de production', autresProd, _dosPct(autresProd,d.enc)+' %', 'Main d\'œuvre, emballage, transport', false, true)}
      ${row('Bénéfice brut', d.benefBrut, _dosPct(d.benefBrut,d.enc)+' %', 'Encaissé − coûts de production', true)}
      ${row('Masse salariale', d.totalSal, _dosPct(d.totalSal,d.enc)+' %', 'Personnel', false, true)}
      ${row('Dépenses courantes', d.depCourantes, _dosPct(d.depCourantes,d.enc)+' %', 'Énergie, maintenance, divers', false, true)}
      ${row('Bénéfice net', d.benefNet, _dosPct(d.benefNet,d.enc)+' %', '✅ Ce que la provenderie gagne', true)}
    </tbody></table></div></div>`;

  const kpiProd = `<div class="card" style="padding:14px">
    <div style="font-weight:800;color:var(--text);margin-bottom:6px">🏭 Indicateurs</div>
    ${_dosKV('Production nette', _dosFmt(d.kgNets)+' kg')}
    ${_dosKV('Coût de revient', _dosFmt(d.coutRevient)+' F/kg')}
    ${_dosKV('Prix de vente moyen', _dosFmt(d.prixVenteMoy)+' F/kg')}
    ${_dosKV('Marge / kg', _dosFmt(d.prixVenteMoy-d.coutRevient)+' F/kg')}
    ${_dosKV('Impayés (créances)', _dosFmt(d.impaye)+' F')}
  </div>`;

  const actifs = `<div class="card" style="padding:14px">
    <div style="font-weight:800;color:var(--text);margin-bottom:8px">💼 Actifs &amp; garanties</div>
    <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;padding:9px 0;border-bottom:1px solid var(--border);font-size:13px"><span style="color:var(--textm)">Valeur du stock MP <span style="font-size:11px">(inventaire × prix)</span></span><input id="dos-valstock" type="number" value="${Math.round(o.valStock)}" oninput="_dosSimuler()" style="width:160px;text-align:right;${DOS_INP}"></div>
    <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;padding:9px 0;border-bottom:1px solid var(--border);font-size:13px"><span style="color:var(--textm)">Valeur machine / équipement <span style="font-size:11px">(à renseigner)</span></span><input id="dos-valmachine" type="number" value="0" oninput="_dosSimuler()" style="width:160px;text-align:right;${DOS_INP}"></div>
    <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 0 2px;font-size:14px"><span style="color:var(--text);font-weight:800">Total actifs</span><b id="dos-actifs-total" style="color:var(--green);font-size:18px;font-family:'DM Mono',monospace">${_dosFmt(o.valStock)} F</b></div>
    <div style="font-size:11.5px;color:var(--textm);margin-top:6px">La valeur de ta machine (moulin) est une garantie forte pour la banque — renseigne-la.</div>
  </div>`;

  const lab = t=>`<label style="font-size:12px;color:var(--textm)">${t}<br>`;
  const reglages = `<div class="card" style="padding:14px">
    <div style="font-weight:800;color:var(--text);margin-bottom:10px">🧮 Simulateur de prêt</div>
    <div style="display:flex;gap:12px;flex-wrap:wrap">
      ${lab('Taux (%/an)')}<input id="dos-taux" type="number" value="${o.taux}" oninput="_dosSimuler()" style="width:90px;${DOS_INP}"></label>
      ${lab('Part du bénéfice engagée (%)')}<input id="dos-secu" type="number" value="${o.securite}" oninput="_dosSimuler()" style="width:110px;${DOS_INP}"></label>
    </div>
    <div style="font-size:11.5px;color:var(--textm);margin-top:6px">On n'engage qu'une partie du bénéfice (marge de sécurité) pour rester à l'aise.</div>
    <div id="dos-sim-out" style="margin-top:12px"></div>
  </div>`;

  const cible = `<div class="card" style="padding:14px">
    <div style="font-weight:800;color:var(--text);margin-bottom:10px">🎯 Je veux un montant précis</div>
    <div style="display:flex;gap:12px;flex-wrap:wrap;align-items:flex-end">
      ${lab('Montant (F)')}<input id="dos-montant" type="number" placeholder="ex: 30000000" oninput="_dosSimuler()" style="width:160px;${DOS_INP}"></label>
      ${lab('Durée')}<select id="dos-duree" onchange="_dosSimuler()" style="${DOS_INP}">${DOS_DUREES.map(x=>`<option value="${x}">${x} mois</option>`).join('')}</select></label>
    </div>
    <div id="dos-cible-out" style="margin-top:12px"></div>
  </div>`;

  const actions = `<div class="card" style="padding:14px;display:flex;gap:10px;flex-wrap:wrap;align-items:center">
    <button onclick="_dosImprimer()" style="background:var(--green,#1F7A4C);color:#fff;border:0;border-radius:10px;padding:11px 16px;font-weight:700;cursor:pointer">🖨️ Imprimer / PDF le dossier</button>
    <span style="font-size:12px;color:var(--textm)">Document brandé « ${_dosEsc(o.nom)} » prêt à déposer à la microfinance.</span>
  </div>`;

  return `${_dosTitre()}
    <div style="display:flex;flex-direction:column;gap:12px">
      <div class="card" style="padding:14px">
        <div style="font-weight:800;font-size:16px;color:var(--text)">${_dosEsc(o.nom)}</div>
        <div style="color:var(--textm);font-size:12.5px">${_dosEsc(o.lieu)||'—'} · dossier basé sur tes données réelles (${nb} mois)</div>
      </div>
      ${periode}
      ${synth}
      ${kpiProd}
      ${actifs}
      ${reglages}
      ${cible}
      ${actions}
    </div>`;
}

function _dosKV(lab,val){ return `<div style="display:flex;justify-content:space-between;gap:8px;padding:9px 0;border-bottom:1px solid var(--border);font-size:13px"><span style="color:var(--textm)">${lab}</span><b style="color:var(--text);font-family:'DM Mono',monospace">${val}</b></div>`; }

// ── Recalcul du simulateur (sans re-fetch) ──
function _dosSimuler(){
  if(!DOS) return;
  const taux = Math.max(0, _dosNum(document.getElementById('dos-taux')?.value)) || 0;
  const secu = Math.min(100, Math.max(0, _dosNum(document.getElementById('dos-secu')?.value))) || 0;
  DOS.taux = taux; DOS.securite = secu;

  // Actifs
  const vs = _dosNum(document.getElementById('dos-valstock')?.value);
  const vm = _dosNum(document.getElementById('dos-valmachine')?.value);
  DOS.valStock = vs; DOS.valMachine = vm;
  const at = document.getElementById('dos-actifs-total');
  if(at) at.textContent = _dosFmt(vs+vm)+' F';

  const benef = DOS.benefNetMensuel;
  const capacite = benef * (secu/100);

  const out = document.getElementById('dos-sim-out');
  if(out){
    if(capacite<=0){
      out.innerHTML = `<div style="color:var(--textm);font-size:13px">Bénéfice net insuffisant sur la période pour proposer un montant. Régularise tes encaissements ou allonge la période.</div>`;
    } else {
      const rows = DOS_DUREES.map(dd=>{
        const P=_dosMaxLoan(capacite,dd,taux); const it=P*(taux/100)*(dd/12);
        return `<tr>
          <td style="padding:9px 8px;color:var(--text);font-weight:700">${dd} mois</td>
          <td style="padding:9px 8px;text-align:right;font-weight:800;color:var(--green);font-size:16px;font-family:'DM Mono',monospace">${_dosFmt(P)} F</td>
          <td style="padding:9px 8px;text-align:right;color:var(--text);font-weight:700;font-family:'DM Mono',monospace">${_dosFmt(capacite)} F</td>
          <td style="padding:9px 8px;text-align:right;color:var(--textm);font-family:'DM Mono',monospace">${_dosFmt(it)} F</td>
        </tr>`;
      }).join('');
      out.innerHTML = `<div style="font-size:13px;color:var(--textm);margin-bottom:8px">Capacité de remboursement sûre : <b style="color:var(--text);font-size:17px">${_dosFmt(capacite)} F/mois</b> (${secu}% du bénéfice net mensuel de ${_dosFmt(benef)} F).</div>
        <div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:12.5px;min-width:420px">
        <thead><tr style="background:var(--card2)"><th style="padding:7px 8px;text-align:left;color:var(--textm)">Durée</th><th style="padding:7px 8px;text-align:right;color:var(--textm)">Montant empruntable</th><th style="padding:7px 8px;text-align:right;color:var(--textm)">Échéance/mois</th><th style="padding:7px 8px;text-align:right;color:var(--textm)">Coût du crédit</th></tr></thead>
        <tbody>${rows}</tbody></table></div>
        <div style="font-size:11.5px;color:var(--textm);margin-top:6px">Plus la durée est longue → plus tu peux emprunter (échéance identique).</div>`;
    }
  }

  const cout = document.getElementById('dos-cible-out');
  if(cout){
    const M = _dosNum(document.getElementById('dos-montant')?.value);
    const dd = _dosNum(document.getElementById('dos-duree')?.value)||24;
    if(M<=0){ cout.innerHTML = `<div style="font-size:12.5px;color:var(--textm)">Saisis un montant pour voir si c'est tenable.</div>`; }
    else {
      const ech = _dosEcheance(M, dd, taux);
      const ratio = ech>0 ? benef/ech : 0;
      let verdict, coul;
      if(benef<=0){ verdict='Bénéfice actuel insuffisant — dossier à consolider'; coul='var(--red)'; }
      else if(ech<=capacite){ verdict=`✅ Confortable — ton bénéfice couvre l'échéance ${ratio.toFixed(1)}×`; coul='var(--green)'; }
      else if(ech<=benef){ verdict=`⚠️ Tenable mais serré — l'échéance prend ${_dosPct(ech,benef)}% de ton bénéfice`; coul='var(--gold)'; }
      else { verdict='❌ Trop élevé — réduis le montant ou allonge la durée'; coul='var(--red)'; }
      const total = ech*dd;
      cout.innerHTML = `<div style="display:flex;flex-direction:column;gap:8px;font-size:14px">
          <div style="display:flex;justify-content:space-between;align-items:center"><span style="color:var(--textm)">Échéance mensuelle</span><b style="color:var(--text);font-size:20px;font-family:'DM Mono',monospace">${_dosFmt(ech)} F</b></div>
          <div style="display:flex;justify-content:space-between;align-items:center"><span style="color:var(--textm)">Total remboursé (${dd} mois)</span><b style="color:var(--text);font-size:18px;font-family:'DM Mono',monospace">${_dosFmt(total)} F</b></div>
          <div style="display:flex;justify-content:space-between;align-items:center;border-top:1px solid var(--border);padding-top:8px"><span style="color:var(--textm)">Verdict</span><b style="color:${coul};text-align:right;max-width:60%;font-size:14px">${verdict}</b></div>
        </div>`;
    }
  }
}

// ── Impression / PDF (fenêtre autonome brandée) ──
function _dosImprimer(){
  if(!DOS) return;
  const o = DOS, d = o.d, nb = o.nbMois;
  const mens = n => _dosNum(n)/nb;
  const autresProd = _dosNum(d.coutMO)+_dosNum(d.coutEmb)+_dosNum(d.coutTrans);
  const capacite = o.benefNetMensuel * (o.securite/100);
  const simRows = DOS_DUREES.map(dd=>{ const P=_dosMaxLoan(capacite,dd,o.taux); const it=P*(o.taux/100)*(dd/12);
    return `<tr><td>${dd} mois</td><td class="r"><b>${_dosFmt(P)}</b></td><td class="r">${_dosFmt(capacite)}</td><td class="r">${_dosFmt(it)}</td></tr>`; }).join('');
  const sr = (l,m,r,strong,neg)=>`<tr class="${strong?'st':''}"><td>${l}</td><td class="r">${neg?'− ':''}${_dosFmt(mens(m))}</td><td class="r">${r}</td><td class="r">${neg?'− ':''}${_dosFmt(m)}</td></tr>`;
  const rccm = (typeof _cfgEtat==='function') ? _cfgEtat('rccm') : '';
  const cpte = (typeof _cfgEtat==='function') ? _cfgEtat('numero_compte') : '';
  const dateStr = _dosDate();
  const logoHtml = o.logo ? `<img src="${o.logo}" style="height:64px;margin-bottom:6px">` : '';
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Dossier financement — ${_dosEsc(o.nom)}</title>
  <style>
    *{box-sizing:border-box} body{font-family:Segoe UI,Arial,sans-serif;color:#242a25;margin:28px;font-size:12.5px}
    h1{font-family:Georgia,serif;color:#1F5138;font-size:22px;margin:2px 0}
    .eyebrow{color:#8A6314;font-weight:700;letter-spacing:2px;font-size:9px;text-transform:uppercase}
    .sub{color:#5c665e;font-size:11px} .muted{color:#5c665e}
    .bar{border-bottom:3px solid #1F5138;margin:8px 0 14px}
    h2{color:#1F5138;font-family:Georgia,serif;font-size:14px;margin:16px 0 6px}
    table{width:100%;border-collapse:collapse;margin-top:4px} th,td{border:1px solid #d9ded6;padding:6px 9px;text-align:left}
    th{background:#eaf1ec;font-size:11px} td.r{text-align:right} tr.st td{background:#f3f7f3;font-weight:800}
    .grid{display:flex;gap:16px;flex-wrap:wrap} .box{flex:1;min-width:230px;border:1px solid #d9ded6;border-radius:8px;padding:10px}
    .kv{display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid #eef2ec}
    .callout{background:#f6eedd;border-radius:8px;padding:10px;margin-top:8px}
    @media print{ body{margin:12mm} button{display:none} }
  </style></head><body>
  <div style="text-align:center">${logoHtml}<div class="eyebrow">Dossier de demande de financement</div>
    <h1>${_dosEsc(o.nom)}</h1><div class="sub">${_dosEsc(o.lieu)||''} · ${dateStr}${rccm?' · RCCM '+_dosEsc(rccm):''}</div></div>
  <div class="bar"></div>
  <div class="sub">Document généré par PROVENDA à partir des données réelles de l'exploitation — période : ${nb} mois (base encaissée).</div>

  <h2>1. Synthèse financière</h2>
  <table><thead><tr><th>Indicateur</th><th class="r">Mensuel (F)</th><th class="r">Ratio</th><th class="r">Cumul (F)</th></tr></thead><tbody>
    ${sr('Chiffre d\'affaires', d.ca, '100 %')}
    ${sr('Encaissé', d.enc, _dosPct(d.enc,d.ca)+' %')}
    ${sr('Coût matières premières', d.coutMP, _dosPct(d.coutMP,d.enc)+' %', false, true)}
    ${sr('Autres coûts de production', autresProd, _dosPct(autresProd,d.enc)+' %', false, true)}
    ${sr('Bénéfice brut', d.benefBrut, _dosPct(d.benefBrut,d.enc)+' %', true)}
    ${sr('Masse salariale', d.totalSal, _dosPct(d.totalSal,d.enc)+' %', false, true)}
    ${sr('Dépenses courantes', d.depCourantes, _dosPct(d.depCourantes,d.enc)+' %', false, true)}
    ${sr('Bénéfice net', d.benefNet, _dosPct(d.benefNet,d.enc)+' %', true)}
  </tbody></table>

  <h2>2. Indicateurs &amp; actifs</h2>
  <div class="grid"><div class="box">
    <div class="kv"><span class="muted">Production nette</span><b>${_dosFmt(d.kgNets)} kg</b></div>
    <div class="kv"><span class="muted">Coût de revient</span><b>${_dosFmt(d.coutRevient)} F/kg</b></div>
    <div class="kv"><span class="muted">Marge / kg</span><b>${_dosFmt(d.prixVenteMoy-d.coutRevient)} F/kg</b></div>
  </div><div class="box">
    <div class="kv"><span class="muted">Valeur stock MP</span><b>${_dosFmt(o.valStock)} F</b></div>
    <div class="kv"><span class="muted">Valeur machine/équipement</span><b>${_dosFmt(o.valMachine)} F</b></div>
    <div class="kv"><span class="muted"><b>Total actifs (garanties)</b></span><b>${_dosFmt(o.valStock+o.valMachine)} F</b></div>
    <div class="kv"><span class="muted">Créances (impayés)</span><b>${_dosFmt(d.impaye)} F</b></div>
  </div></div>

  <h2>3. Capacité d'emprunt (taux ${o.taux} %/an)</h2>
  <div class="sub">Capacité de remboursement retenue : <b>${_dosFmt(capacite)} F/mois</b> (${o.securite}% du bénéfice net mensuel de ${_dosFmt(o.benefNetMensuel)} F).</div>
  <table><thead><tr><th>Durée</th><th class="r">Montant empruntable</th><th class="r">Échéance/mois</th><th class="r">Coût du crédit</th></tr></thead><tbody>${simRows}</tbody></table>
  <div class="callout"><b>Lecture :</b> l'exploitation peut assurer une échéance d'environ ${_dosFmt(capacite)} F/mois. Le montant sollicité doit rester dans ces limites pour un remboursement sans tension de trésorerie.</div>

  <div style="display:flex;justify-content:space-between;margin-top:34px">
    <div class="sub">Fait à ${_dosEsc(o.lieu)||'________'}, le ${dateStr}<br><br>Le promoteur — signature${cpte?'<br><span class="muted">Compte : '+_dosEsc(cpte)+'</span>':''}</div>
    <div class="sub">Contact : ________________</div>
  </div>
  <div style="text-align:center;margin-top:16px;color:#8a938b;font-size:9px">PROVENDA · Dossier bâti sur données réelles — à accompagner des pièces justificatives (factures MP, relevés, registre de production).</div>
  <div style="text-align:center;margin-top:14px"><button onclick="window.print()" style="background:#1F5138;color:#fff;border:0;border-radius:8px;padding:10px 18px;font-weight:700;cursor:pointer">Imprimer</button></div>
  </body></html>`;

  const w = window.open('', '_blank');
  if(!w){ (typeof notify==='function'?notify('Autorise les pop-up pour imprimer.','r'):alert('Autorise les pop-up.')); return; }
  w.document.open(); w.document.write(html); w.document.close();
  setTimeout(()=>{ try{ w.focus(); w.print(); }catch(_){} }, 400);
}

window.renderDossier = renderDossier;
window._dosSetMois = _dosSetMois;
window._dosSimuler = _dosSimuler;
window._dosImprimer = _dosImprimer;
if(typeof PAGE_RENDERERS!=='undefined'){ PAGE_RENDERERS.dossier = renderDossier; }
