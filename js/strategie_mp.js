// ══════════════════════════════════════════════════
// PROVENDA — STRATÉGIE D'ACHAT MATIÈRES PREMIÈRES
// Production anticipée (manuel / mois précédent / mois en cours)
// → besoin MP via compositions → comparé au stock → manquant + coût.
// → rentabilité anticipée par formule (coût de revient vs prix de vente).
// ══════════════════════════════════════════════════

let GP_STRAT_PARAMS = {};   // { formule_nom: { mode, tonnes, inclus } }
let _STRAT = null;          // données chargées (prod mensuelle, niveaux stock, labels)
let _STRAT_ROWS = [];       // dernier besoin MP calculé (pour l'IA)
let _STRAT_TOTAUX = {};     // { nbManq, cout, coutAnt, marge, taux }
let _STRAT_MARGE = [];      // rentabilité par formule (pour l'IA)
let _STRAT_HAS_INCLUS = true; // colonne `inclus` présente en base ?
let _STRAT_COMM = false;    // déduire la commission PDV du coût de revient
const _STRAT_OPEN_F  = new Set(); // formules dépliées (voir leurs MP)
const _STRAT_OPEN_MP = new Set(); // MP dépliées (voir les formules qui la consomment)

// Nom normalisé : casse, accents et espaces (dont insécables) ignorés.
// Sans ça, « Sel (NaCl) » et « Sel (NaCl) » comptent pour deux MP différentes.
// Délègue à normalizeMpNom (config.js) : une seule règle d'identité pour toute
// l'app — production, stock et stratégie doivent recoller les mêmes libellés.
const _RE_DIACRITIQUES = new RegExp('[\\u0300-\\u036f]', 'g'); // accents décomposés
function _stratNorm(s){
  if(typeof normalizeMpNom === 'function') return normalizeMpNom(s);
  return String(s||'').normalize('NFD').replace(_RE_DIACRITIQUES,'')
    .replace(/\s+/g,' ').trim().toLowerCase();
}

// Fiche MP d'un ingrédient de formule : par id d'abord (fiable même si renommée),
// puis par nom normalisé. Pas de correspondance approximative : « Son de blé » et
// « Son de riz » ne doivent JAMAIS être confondus.
function _stratMp(ing){
  const L = (typeof GP_INGREDIENTS !== 'undefined' ? GP_INGREDIENTS : []) || [];
  if(ing && ing.id){
    const byId = L.find(i => i.id === ing.id);
    if(byId) return byId;
  }
  const n = _stratNorm(ing && ing.nom);
  if(!n) return null;
  return L.find(i => _stratNorm(i.nom) === n) || null;
}

// Niveaux stock MP (fallback si calcNiveaux absent)
function _stratNiveaux(S){
  if(typeof calcNiveaux === 'function') return calcNiveaux(S);
  const n = {};
  (S||[]).forEach(m=>{
    const q = Number(m.quantite||0);
    n[m.ingredient_nom] = (n[m.ingredient_nom]||0) + (m.type==='entree' ? q : -q);
  });
  return n;
}

// Stock agrégé par nom normalisé (les libellés qui ne diffèrent que par la casse
// ou les espaces se recollent — sinon entrées et sorties partent sur deux lignes).
function _stratNiveauxNorm(niveaux){
  const out = {};
  Object.keys(niveaux||{}).forEach(k=>{
    const n = _stratNorm(k);
    out[n] = (out[n]||0) + Number(niveaux[k]||0);
  });
  return out;
}

// Production réelle sur un mois 'YYYY-MM' : kg, nb de lots et coût total par formule.
async function _stratProdMois(mois){
  const debut = mois + '-01';
  const [y,m] = mois.split('-').map(Number);
  const fin = new Date(y, m, 1).toISOString().slice(0,10); // 1er du mois suivant
  const req = (cols)=> SB.from('gp_lots').select(cols)
    .eq('admin_id', GP_ADMIN_ID).gte('date', debut).lt('date', fin);
  let data = null;
  try{
    const r = await req('formule_nom,qte_produite,cout_total,date');
    if(r.error) throw r.error;
    data = r.data;
  }catch(_){
    // Schéma plus ancien (pas de cout_total) : on retombe sur le minimum vital.
    const r = await req('formule_nom,qte_produite,date');
    data = r.data;
  }
  const kg = {}, lots = {}, cout = {};
  (data||[]).forEach(l=>{
    const f = l.formule_nom;
    kg[f]   = (kg[f]||0)   + Number(l.qte_produite||0);
    lots[f] = (lots[f]||0) + 1;
    cout[f] = (cout[f]||0) + Number(l.cout_total||0);
  });
  return { kg, lots, cout };
}

// kg anticipés pour une formule selon son mode
function _stratAnticipeKg(f){
  const p = GP_STRAT_PARAMS[f.nom] || { mode:'mois_precedent', tonnes:0 };
  if(p.mode === 'manuel')        return Number(p.tonnes||0) * 1000;
  if(p.mode === 'mois_courant')  return Number(_STRAT.courant.kg[f.nom]||0);
  return Number(_STRAT.prec.kg[f.nom]||0); // mois_precedent
}

function _stratInclus(nom){
  return (GP_STRAT_PARAMS[nom]||{}).inclus !== false;
}

function _moisLabel(mois){
  return new Date(mois + '-15').toLocaleDateString('fr-FR',{month:'long',year:'numeric'});
}

// ── Rendu principal (fetch + UI) ──────────────────
async function renderStrategieMP(){
  if(!GP_ADMIN_ID) return;
  // S'assurer que les formules sont chargées
  if(typeof FORMULES_SADARI === 'undefined' || !FORMULES_SADARI.length){
    if(typeof loadFormules === 'function') await loadFormules();
  }
  // Règles de commission (optionnelles — l'écran fonctionne sans)
  if(typeof chargerReglesCommission === 'function'){ try{ await chargerReglesCommission(); }catch(_){} }

  const now = new Date();
  const moisCourant = now.toISOString().slice(0,7);
  const moisPrec    = new Date(now.getFullYear(), now.getMonth()-1, 1).toISOString().slice(0,7);

  const [{ data:params }, prec, courant, { data:S }] = await Promise.all([
    SB.from('gp_strategie_mp').select('*').eq('admin_id', GP_ADMIN_ID),
    _stratProdMois(moisPrec),
    _stratProdMois(moisCourant),
    (typeof _fetchAllStockMp==='function'?_fetchAllStockMp():Promise.resolve([])).then(d=>({data:d}),()=>({data:[]}))
  ]);

  GP_STRAT_PARAMS = {};
  (params||[]).forEach(p=>{
    GP_STRAT_PARAMS[p.formule_nom] = {
      mode: p.mode, tonnes: Number(p.tonnes||0),
      inclus: p.inclus !== false   // colonne absente (undefined) = inclus
    };
  });

  const niveaux = _stratNiveaux(S);
  _STRAT = {
    prec, courant,
    niveaux, niveauxNorm: _stratNiveauxNorm(niveaux),
    moisPrecLabel: _moisLabel(moisPrec),
    moisCourantLabel: _moisLabel(moisCourant)
  };

  _stratRenderUI();
}

// ── Rendu UI (sans refetch — instantané sur changement) ──
function _stratRenderUI(){
  if(!_STRAT) return;

  // 1) Paramètres groupés par espèce
  const groupes = {};
  FORMULES_SADARI.forEach(f=>{
    const esp = (f.espece || 'autre');
    (groupes[esp] = groupes[esp] || []).push(f);
  });

  const paramsEl = document.getElementById('strat-params');
  if(paramsEl){
    paramsEl.innerHTML = `<div style="font-size:11px;color:var(--textm);margin-bottom:10px">
      📅 Mois précédent = <b>${_STRAT.moisPrecLabel}</b> · Mois en cours = <b>${_STRAT.moisCourantLabel}</b>
      · <span style="color:var(--g6)">Décoche une formule pour la sortir du calcul · clique son nom pour voir ses MP</span></div>` +
      Object.keys(groupes).sort().map(esp=>{
        const espEsc = esp.replace(/'/g,"\\'");
        const rows = groupes[esp].sort((a,b)=>a.nom.localeCompare(b.nom)).map(f=>{
          const p = GP_STRAT_PARAMS[f.nom] || { mode:'mois_precedent', tonnes:0 };
          const nEsc = f.nom.replace(/'/g,"\\'");
          const kg = _stratAnticipeKg(f);
          const inc = _stratInclus(f.nom);
          const open = _STRAT_OPEN_F.has(f.nom);
          const sel = (v)=> p.mode===v ? 'selected' : '';
          return `<tr style="opacity:${inc?1:.45}">
            <td style="width:26px">
              <input type="checkbox" ${inc?'checked':''} onchange="stratSetInclus('${nEsc}',this.checked)"
                title="Inclure dans le calcul" style="width:16px;height:16px;accent-color:var(--g6);cursor:pointer">
            </td>
            <td style="font-size:12px">
              <span onclick="stratToggleFormule('${nEsc}')" style="cursor:pointer;user-select:none"
                title="Voir les matières premières de cette formule">${open?'▾':'▸'} ${f.nom}</span>
            </td>
            <td>
              <select onchange="stratSetMode('${nEsc}',this.value)" style="font-size:11px;padding:4px 6px;border-radius:6px;border:1px solid var(--border2);background:var(--card2);color:var(--text)">
                <option value="mois_precedent" ${sel('mois_precedent')}>Mois précédent</option>
                <option value="mois_courant" ${sel('mois_courant')}>Mois en cours</option>
                <option value="manuel" ${sel('manuel')}>Manuel (tonnes)</option>
              </select>
            </td>
            <td class="num">
              <input type="number" inputmode="decimal" min="0" step="0.1" value="${p.tonnes||0}"
                onchange="stratSetTonnes('${nEsc}',this.value)"
                style="width:70px;font-size:12px;padding:4px 6px;border-radius:6px;border:1px solid var(--border2);background:var(--card2);color:var(--text);text-align:right;${p.mode==='manuel'?'':'display:none'}">
            </td>
            <td class="num" style="font-weight:700">${fmt(Math.round(kg))} kg</td>
          </tr>` + (open ? _stratDetailFormule(f, kg) : '');
        }).join('');
        return `<div style="margin-bottom:14px">
          <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:6px">
            <span style="font-size:12px;font-weight:700;color:var(--g6);text-transform:capitalize">${esp}</span>
            <span style="display:flex;gap:6px;flex-wrap:wrap">
              <button class="btn btn-out btn-sm" onclick="stratQuickEspece('${espEsc}','mois_precedent')">Tout : mois préc.</button>
              <button class="btn btn-out btn-sm" onclick="stratQuickEspece('${espEsc}','mois_courant')">Tout : mois en cours</button>
              <button class="btn btn-out btn-sm" onclick="stratQuickEspece('${espEsc}','manuel')">Tout : manuel</button>
              <button class="btn btn-out btn-sm" onclick="stratQuickInclus('${espEsc}',true)" title="Tout inclure">☑ Tout</button>
              <button class="btn btn-out btn-sm" onclick="stratQuickInclus('${espEsc}',false)" title="Tout exclure">☐ Aucun</button>
            </span>
          </div>
          <table class="tbl" style="font-size:12px"><thead><tr>
            <th></th><th>Formule</th><th>Mode</th><th class="num">Tonnes</th><th class="num">Anticipé</th>
          </tr></thead><tbody>${rows}</tbody></table>
        </div>`;
      }).join('');
  }

  // 2) Besoin MP = somme des compositions × kg anticipés (formules cochées seulement)
  const besoin = {};
  let nbRetenues = 0;
  FORMULES_SADARI.forEach(f=>{
    if(!_stratInclus(f.nom)) return;
    const kg = _stratAnticipeKg(f);
    if(kg <= 0) return;
    nbRetenues++;
    (f.ingredients||[]).forEach(ing=>{
      const mp  = _stratMp(ing);
      const key = mp ? 'id:'+mp.id : 'nom:'+_stratNorm(ing.nom);
      const q   = (Number(ing.pct||0)/100)*kg;
      const e   = besoin[key] || (besoin[key] = { key, nom: mp?.nom || ing.nom, mp, ant:0, parFormule:[] });
      e.ant += q;
      e.parFormule.push({ formule:f.nom, kg:q, pct:Number(ing.pct||0) });
    });
  });

  const nivN = _STRAT.niveauxNorm;
  const rows = Object.keys(besoin).map(k=>{
    const b    = besoin[k];
    const stk  = nivN[_stratNorm(b.nom)] || 0;
    const manq = Math.max(0, b.ant - stk);
    const prix = Number(b.mp?.prix_actuel || 0);
    // 'inconnue' = aucune fiche MP ne correspond · 'sans_prix' = fiche sans prix_actuel
    const statut = !b.mp ? 'inconnue' : (prix > 0 ? 'ok' : 'sans_prix');
    return { key:b.key, nom:b.nom, ant:b.ant, stk, manq, prix, statut,
             parFormule:b.parFormule, coutAnt:b.ant*prix, cout:manq*prix };
  }).sort((a,b)=> b.manq - a.manq);

  const totalManq    = rows.filter(r=>r.manq>0).length;
  const totalCout    = rows.reduce((s,r)=>s + r.cout, 0);
  const totalCoutAnt = rows.reduce((s,r)=>s + r.coutAnt, 0);
  const totalAntKg   = rows.reduce((s,r)=>s + r.ant, 0);
  const totalStkKg   = rows.reduce((s,r)=>s + r.stk, 0);
  const totalManqKg  = rows.reduce((s,r)=>s + r.manq, 0);

  // 3) Rentabilité anticipée par formule
  const marge = _stratMarges();
  const caTot     = marge.reduce((s,m)=>s + m.ca, 0);
  const margeTot  = marge.reduce((s,m)=>s + m.margeTot, 0);
  const taux      = caTot > 0 ? (margeTot/caTot)*100 : 0;

  // Mémoriser pour le conseiller IA
  _STRAT_ROWS   = rows;
  _STRAT_MARGE  = marge;
  _STRAT_TOTAUX = { nbManq: totalManq, cout: Math.round(totalCout), coutAnt: Math.round(totalCoutAnt),
                    ca: Math.round(caTot), marge: Math.round(margeTot), taux: taux, nbFormules: nbRetenues };
  _stratRenderIA();

  const kpis = document.getElementById('strat-kpis');
  if(kpis) kpis.innerHTML = `
    <div class="econo-box"><div class="econo-val">${rows.length}</div><div class="econo-lbl">Matières concernées</div></div>
    <div class="econo-box"><div class="econo-val" style="color:${totalManq>0?'var(--red)':'var(--green)'}">${totalManq}</div><div class="econo-lbl">En manque</div></div>
    <div class="econo-box"><div class="econo-val" style="color:var(--g6)">${fmt(Math.round(totalCoutAnt))}</div><div class="econo-lbl">Coût total anticipé (F)</div></div>
    <div class="econo-box"><div class="econo-val" style="color:var(--gold)">${fmt(Math.round(totalCout))}</div><div class="econo-lbl">Budget achat (F)</div></div>
    <div class="econo-box"><div class="econo-val" style="color:${margeTot>=0?'var(--green)':'var(--red)'}">${fmt(Math.round(margeTot))}</div><div class="econo-lbl">Marge anticipée (F)</div></div>
    <div class="econo-box"><div class="econo-val" style="color:${taux>=0?'var(--green)':'var(--red)'}">${taux.toFixed(1)}%</div><div class="econo-lbl">Taux de marge</div></div>`;

  const res = document.getElementById('strat-result');
  if(res){
    res.innerHTML = rows.length
      ? _stratAlerteDonnees(rows, nbRetenues) + `<table class="tbl"><thead><tr>
      <th>Matière première</th>
      <th class="num">Total anticipé</th>
      <th class="num">Coût total anticipé</th>
      <th class="num">Total stock</th>
      <th class="num">Manquant</th>
      <th class="num">Coût estimé</th>
    </tr></thead><tbody>${rows.map(r=>{
      const kEsc = r.key.replace(/'/g,"\\'");
      const open = _STRAT_OPEN_MP.has(r.key);
      const alerte = r.statut==='inconnue'
        ? `<span style="color:var(--red)" title="Aucune fiche MP ne porte ce nom : crée-la ou corrige le nom dans la formule">⚠ MP inconnue</span>`
        : (r.statut==='sans_prix'
          ? `<span style="color:var(--gold)" title="Fiche MP trouvée mais sans prix : saisis-le dans Matières premières">⚠ prix manquant</span>`
          : null);
      return `<tr>
      <td style="font-weight:600"><span onclick="stratToggleMp('${kEsc}')" style="cursor:pointer;user-select:none"
        title="Voir les formules qui consomment cette MP">${open?'▾':'▸'} ${r.nom}</span></td>
      <td class="num">${fmt(Math.round(r.ant))} kg</td>
      <td class="num" style="color:var(--g6)">${alerte || fmt(Math.round(r.coutAnt))+' F'}</td>
      <td class="num" style="color:${r.stk<0?'var(--red)':'inherit'}"${r.stk<0?' title="Stock négatif : des sorties ont été saisies sans les entrées correspondantes, ou la MP existe sous deux libellés"':''}>${fmt(Math.round(r.stk))} kg</td>
      <td class="num" style="font-weight:700;color:${r.manq>0?'var(--red)':'var(--green)'}">${r.manq>0?fmt(Math.round(r.manq))+' kg':'✅ 0'}</td>
      <td class="num" style="color:var(--gold)">${r.manq>0?(r.prix>0?fmt(Math.round(r.cout))+' F':'⚠'):'—'}</td>
    </tr>` + (open ? _stratDetailMp(r) : '');
    }).join('')}</tbody>
    <tfoot>
    <tr style="font-weight:700;border-top:2px solid var(--border2)">
      <td>TOTAL</td>
      <td class="num">${fmt(Math.round(totalAntKg))} kg</td>
      <td class="num" style="color:var(--g6)">${fmt(Math.round(totalCoutAnt))} F</td>
      <td class="num">${fmt(Math.round(totalStkKg))} kg</td>
      <td class="num" style="color:${totalManqKg>0?'var(--red)':'var(--green)'}">${fmt(Math.round(totalManqKg))} kg</td>
      <td class="num" style="color:var(--gold)">${fmt(Math.round(totalCout))} F</td>
    </tr></tfoot></table>`
    : '<div class="card" style="text-align:center;color:var(--textm);font-size:13px;padding:20px">Configure tes paramètres ci-dessus (tonnes manuelles ou base mensuelle) pour voir le besoin en matières premières.</div>';
  }

  _stratRenderMarge(marge, caTot, margeTot, taux);
}

// Bandeau d'alerte : prix manquants, MP inconnues, stocks négatifs.
// Sans ça, un coût sous-estimé passe pour une bonne marge.
function _stratAlerteDonnees(rows, nbRetenues){
  const sansPrix  = rows.filter(r=>r.statut==='sans_prix');
  const inconnues = rows.filter(r=>r.statut==='inconnue');
  const negatifs  = rows.filter(r=>r.stk < 0);
  const base = `<div style="font-size:11px;color:var(--textm);margin-bottom:8px">
    Basé sur <b>${nbRetenues}</b> formule${nbRetenues>1?'s':''} sélectionnée${nbRetenues>1?'s':''}.</div>`;
  if(!sansPrix.length && !inconnues.length && !negatifs.length) return base;
  const ligne = (icone, couleur, txt) =>
    `<div style="font-size:11px;color:${couleur};margin-top:3px">${icone} ${txt}</div>`;
  return base + `<div style="background:rgba(245,158,11,.10);border:1px solid rgba(245,158,11,.35);border-radius:8px;padding:8px 10px;margin-bottom:10px">
    <div style="font-size:11px;font-weight:700;color:var(--gold)">⚠ Coût et marge sous-estimés</div>
    ${sansPrix.length  ? ligne('•','var(--gold)',`<b>${sansPrix.length}</b> MP sans prix (comptées à 0 F) : ${sansPrix.map(r=>r.nom).join(', ')} — saisis le prix dans <b>Matières premières</b>.`) : ''}
    ${inconnues.length ? ligne('•','var(--red)', `<b>${inconnues.length}</b> MP sans fiche : ${inconnues.map(r=>r.nom).join(', ')} — le nom dans la formule ne correspond à aucune MP.`) : ''}
    ${negatifs.length  ? ligne('•','var(--red)', `<b>${negatifs.length}</b> stock${negatifs.length>1?'s':''} négatif${negatifs.length>1?'s':''} : ${negatifs.map(r=>r.nom).join(', ')} — le manquant est surévalué.`) : ''}
  </div>`;
}

// Détail déplié : les MP d'une formule, avec leur poids réel dans le tonnage anticipé.
function _stratDetailFormule(f, kg){
  const ings = (f.ingredients||[]).slice().sort((a,b)=>Number(b.pct||0)-Number(a.pct||0));
  if(!ings.length) return `<tr><td colspan="5" style="font-size:11px;color:var(--textm);padding:6px 10px">Aucune MP dans cette formule.</td></tr>`;
  const c = _stratCoutsFormule(f);
  const lignes = ings.map(ing=>{
    const mp   = _stratMp(ing);
    const prix = Number(mp?.prix_actuel||0);
    const q    = (Number(ing.pct||0)/100)*kg;
    const etat = !mp ? '<span style="color:var(--red)">⚠ pas de fiche</span>'
               : (prix<=0 ? '<span style="color:var(--gold)">⚠ pas de prix</span>' : fmt(prix)+' F/kg');
    return `<tr style="font-size:11px">
      <td style="padding-left:24px;color:var(--textm)">${mp?.nom || ing.nom}</td>
      <td class="num" style="color:var(--textm)">${Number(ing.pct||0).toFixed(2)} %</td>
      <td class="num" style="color:var(--textm)">${fmt(Math.round(q))} kg</td>
      <td class="num" style="color:var(--textm)">${etat}</td>
      <td class="num" style="color:var(--g6)">${prix>0?fmt(Math.round(q*prix))+' F':'—'}</td>
    </tr>`;
  }).join('');
  return `<tr><td colspan="5" style="padding:0 0 8px 0;background:var(--card2)">
    <table class="tbl" style="font-size:11px;margin:0"><thead><tr>
      <th style="padding-left:24px">Matière première</th><th class="num">%</th>
      <th class="num">kg anticipés</th><th class="num">Prix</th><th class="num">Coût</th>
    </tr></thead><tbody>${lignes}</tbody>
    <tfoot><tr style="font-weight:700">
      <td colspan="4" class="num">Coût MP</td>
      <td class="num" style="color:var(--g6)">${fmt(Math.round(c.mpKg))} F/kg</td>
    </tr></tfoot></table></td></tr>`;
}

// Détail déplié : quelles formules consomment cette MP (et combien).
function _stratDetailMp(r){
  const parF = (r.parFormule||[]).slice().sort((a,b)=>b.kg-a.kg);
  const lignes = parF.map(x=>`<tr style="font-size:11px">
    <td style="padding-left:24px;color:var(--textm)">${x.formule}</td>
    <td class="num" style="color:var(--textm)">${x.pct.toFixed(2)} %</td>
    <td class="num" style="color:var(--textm)">${fmt(Math.round(x.kg))} kg</td>
    <td class="num" style="color:var(--g6)">${r.prix>0?fmt(Math.round(x.kg*r.prix))+' F':'—'}</td>
  </tr>`).join('');
  return `<tr><td colspan="6" style="padding:0 0 8px 0;background:var(--card2)">
    <table class="tbl" style="font-size:11px;margin:0"><thead><tr>
      <th style="padding-left:24px">Consommée par</th><th class="num">%</th>
      <th class="num">kg</th><th class="num">Coût</th>
    </tr></thead><tbody>${lignes}</tbody></table></td></tr>`;
}

// ── RENTABILITÉ ANTICIPÉE ─────────────────────────
// Taille de lot moyenne du mois précédent — sert à ramener le transport
// (facturé au lot) à un coût par kg.
function _stratTailleLot(nom){
  const p = _STRAT?.prec;
  if(!p) return 0;
  if(p.lots[nom] > 0) return p.kg[nom] / p.lots[nom];
  const kgTot   = Object.values(p.kg).reduce((s,v)=>s+v,0);
  const lotsTot = Object.values(p.lots).reduce((s,v)=>s+v,0);
  return lotsTot > 0 ? kgTot/lotsTot : 0;
}

// Coût de revient réel du mois précédent (F/kg), issu des lots produits.
function _stratReelKg(nom){
  const p = _STRAT?.prec;
  if(!p || !(p.kg[nom] > 0) || !(p.cout[nom] > 0)) return 0;
  return p.cout[nom] / p.kg[nom];
}

// Commission PDV ramenée au kg (barème détail, règles « tous PDV »).
function _stratCommKg(f){
  if(!_STRAT_COMM) return 0;
  if(typeof _commRegle !== 'function') return 0;
  if(typeof GP_COMM_REGLES === 'undefined' || !GP_COMM_REGLES) return 0;
  const r = _commRegle(null, f.espece, f.nom, 'detail');
  const m = Number(r?.montant_par_sac||0);
  if(m <= 0) return 0;
  const ps = (typeof GP_POIDS_SAC_VENTE !== 'undefined' && GP_POIDS_SAC_VENTE[f.nom]) || 25;
  return ps > 0 ? m/ps : 0;
}

// Coûts par kg d'une formule : MP + transformation (emballage, main-d'œuvre, transport).
function _stratCoutsFormule(f){
  let mpKg = 0, incomplet = false;
  (f.ingredients||[]).forEach(ing=>{
    const mp   = _stratMp(ing);
    const prix = Number(mp?.prix_actuel||0);
    if(!mp || prix <= 0) incomplet = true;
    mpKg += (Number(ing.pct||0)/100)*prix;
  });
  const emb = f.avec_emballage !== false ? Number(f.cout_emballage_kg||0) : 0;
  const mo  = Number(f.cout_mo_tonne||0)/1000;
  let trans = 0;
  if(f.avec_transport === true && Number(f.cout_transport_lot||0) > 0){
    const taille = _stratTailleLot(f.nom);
    if(taille > 0) trans = Number(f.cout_transport_lot)/taille;
  }
  return { mpKg, transfoKg: emb+mo+trans, emb, mo, trans, incomplet };
}

function _stratMarges(){
  return FORMULES_SADARI.map(f=>{
    if(!_stratInclus(f.nom)) return null;
    const kg = _stratAnticipeKg(f);
    if(kg <= 0) return null;
    const c       = _stratCoutsFormule(f);
    const comm    = _stratCommKg(f);
    const revient = c.mpKg + c.transfoKg + comm;
    const prix    = (typeof getPrix==='function' ? getPrix(f.nom) : 0) || Number(f.prix_defaut||0);
    const margeKg = prix - revient;
    return {
      nom:f.nom, espece:f.espece||'', kg, prix,
      mpKg:c.mpKg, transfoKg:c.transfoKg, comm, revient, margeKg,
      reel:_stratReelKg(f.nom), incomplet:c.incomplet,
      ca:prix*kg, margeTot:margeKg*kg
    };
  }).filter(Boolean).sort((a,b)=> a.margeKg - b.margeKg); // les moins rentables d'abord
}

function _stratRenderMarge(marge, caTot, margeTot, taux){
  const el = document.getElementById('strat-marge');
  if(!el) return;

  const toggleComm = `<label style="display:flex;align-items:center;gap:6px;font-size:11px;color:var(--textm);cursor:pointer">
    <input type="checkbox" ${_STRAT_COMM?'checked':''} onchange="stratSetComm(this.checked)"
      style="width:15px;height:15px;accent-color:var(--g6);cursor:pointer">
    Déduire la commission PDV (barème détail)</label>`;

  if(!marge.length){
    el.innerHTML = toggleComm + `<div style="text-align:center;color:var(--textm);font-size:13px;padding:16px">
      Sélectionne au moins une formule avec un tonnage anticipé pour voir sa rentabilité.</div>`;
    return;
  }

  const nbIncomplet = marge.filter(m=>m.incomplet).length;
  const totalKg     = marge.reduce((s,m)=>s+m.kg,0);
  const revientMoy  = totalKg > 0 ? marge.reduce((s,m)=>s+m.revient*m.kg,0)/totalKg : 0;
  const prixMoy     = totalKg > 0 ? caTot/totalKg : 0;

  el.innerHTML = `<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:8px">
      <div style="font-size:11px;color:var(--textm)">Prévisionnel — coût de revient calculé sur les prix MP du jour.
        Le réalisé constaté est dans <b>Bénéfices</b>.</div>
      ${toggleComm}
    </div>
    ${nbIncomplet ? `<div style="font-size:11px;color:var(--gold);margin-bottom:8px">⚠ ${nbIncomplet} formule${nbIncomplet>1?'s':''} contient une MP sans prix : sa marge est <b>surestimée</b>.</div>` : ''}
    <div style="overflow-x:auto"><table class="tbl"><thead><tr>
      <th>Formule</th>
      <th class="num">kg anticipés</th>
      <th class="num">Prix vente</th>
      <th class="num">Coût MP</th>
      <th class="num">Transfo</th>
      ${_STRAT_COMM?'<th class="num">Commission</th>':''}
      <th class="num">Coût revient</th>
      <th class="num">Réel M-1</th>
      <th class="num">Marge/kg</th>
      <th class="num">Marge totale</th>
      <th class="num">%</th>
    </tr></thead><tbody>${marge.map(m=>{
      const tx = m.prix > 0 ? (m.margeKg/m.prix)*100 : 0;
      const col = m.margeKg >= 0 ? 'var(--green)' : 'var(--red)';
      // Écart entre le revient anticipé et le réel du mois dernier : >15% = prévisionnel douteux
      const ecart = (m.reel > 0 && m.revient > 0) ? ((m.revient-m.reel)/m.reel)*100 : null;
      const reelTxt = m.reel > 0
        ? `${fmt(Math.round(m.reel))} F${ecart!==null && Math.abs(ecart)>15 ? ` <span style="color:var(--gold)" title="Écart de ${ecart.toFixed(0)}% avec le coût de revient réel du mois dernier">⚠</span>` : ''}`
        : '<span style="color:var(--textm)">—</span>';
      return `<tr>
      <td style="font-weight:600">${m.nom}${m.incomplet?' <span style="color:var(--gold)" title="Une MP de cette formule n\'a pas de prix">⚠</span>':''}</td>
      <td class="num">${fmt(Math.round(m.kg))} kg</td>
      <td class="num">${fmt(Math.round(m.prix))} F</td>
      <td class="num" style="color:var(--textm)">${fmt(Math.round(m.mpKg))} F</td>
      <td class="num" style="color:var(--textm)">${fmt(Math.round(m.transfoKg))} F</td>
      ${_STRAT_COMM?`<td class="num" style="color:var(--textm)">${m.comm>0?fmt(Math.round(m.comm))+' F':'—'}</td>`:''}
      <td class="num" style="color:var(--gold)">${fmt(Math.round(m.revient))} F</td>
      <td class="num" style="color:var(--textm)">${reelTxt}</td>
      <td class="num" style="font-weight:700;color:${col}">${fmt(Math.round(m.margeKg))} F</td>
      <td class="num" style="color:${col}">${fmt(Math.round(m.margeTot))} F</td>
      <td class="num" style="color:${col}">${tx.toFixed(1)}%</td>
    </tr>`;
    }).join('')}</tbody>
    <tfoot><tr style="font-weight:700;border-top:2px solid var(--border2)">
      <td>TOTAL</td>
      <td class="num">${fmt(Math.round(totalKg))} kg</td>
      <td class="num">${fmt(Math.round(prixMoy))} F</td>
      <td class="num" colspan="${_STRAT_COMM?3:2}" style="color:var(--textm);text-align:right">CA anticipé ${fmt(Math.round(caTot))} F</td>
      <td class="num" style="color:var(--gold)">${fmt(Math.round(revientMoy))} F</td>
      <td class="num"></td>
      <td class="num" style="color:${margeTot>=0?'var(--green)':'var(--red)'}">${fmt(Math.round(prixMoy-revientMoy))} F</td>
      <td class="num" style="color:${margeTot>=0?'var(--green)':'var(--red)'}">${fmt(Math.round(margeTot))} F</td>
      <td class="num" style="color:${margeTot>=0?'var(--green)':'var(--red)'}">${taux.toFixed(1)}%</td>
    </tr></tfoot></table></div>`;
}

// ── CONSEILLER IA ACHATS (admin uniquement) ───────
function _stratRenderIA(){
  const zone = document.getElementById('strat-ia-zone');
  if(!zone) return;
  if(GP_ROLE !== 'admin'){ zone.innerHTML = ''; return; } // IA réservée à l'admin
  zone.innerHTML = `<div class="card">
    <div class="card-title"><div class="ct-left"><span>🧠 Conseiller IA — stratégie d'achat</span></div>
      <div style="display:flex;gap:6px">
        <button class="btn btn-g btn-sm" id="strat-ia-pro" onclick="analyserStrategieMpIA('eco')" title="DeepSeek — rapide & éco">🚀 Pro</button>
        <button class="btn btn-out btn-sm" id="strat-ia-prem" onclick="analyserStrategieMpIA('pro')" title="Claude — qualité max">💎 Premium</button>
      </div>
    </div>
    <div id="strat-ia-result" style="font-size:13px;line-height:1.5;white-space:pre-wrap;color:var(--text)">
      <span style="color:var(--textm)">Clique <b>🚀 Pro</b> (DeepSeek) ou <b>💎 Premium</b> (Claude) : l'IA priorise tes achats, anticipe les ruptures et optimise ton budget.</span>
    </div>
  </div>`;
}

async function analyserStrategieMpIA(tier){
  tier = tier || 'eco';
  const out = document.getElementById('strat-ia-result');
  const bPro = document.getElementById('strat-ia-pro'), bPrem = document.getElementById('strat-ia-prem');
  if(!out) return;
  if(typeof iaGenerate !== 'function'){ out.textContent = '⚠ Assistant IA indisponible.'; return; }
  const rows = (_STRAT_ROWS||[]).filter(r=>r.ant>0);
  if(!rows.length){ out.textContent = 'Configure d\'abord ta production anticipée ci-dessus.'; return; }
  if(bPro) bPro.disabled = true; if(bPrem) bPrem.disabled = true;
  out.innerHTML = `<span style="color:var(--textm)">⏳ Analyse des achats (${tier==='eco'?'Pro · DeepSeek':'Premium · Claude'})…</span>`;

  const lignes = rows.map(r=>
    `- ${r.nom} : besoin ${fmt(Math.round(r.ant))} kg (valeur totale ${r.prix>0?fmt(Math.round(r.coutAnt))+' F':'PRIX INCONNU'}), stock ${fmt(Math.round(r.stk))} kg, manquant ${r.manq>0?fmt(Math.round(r.manq))+' kg':'0 (OK)'}, coût estimé ${r.manq>0&&r.prix>0?fmt(Math.round(r.cout))+' F':'0'}`
  ).join('\n');

  const lignesMarge = (_STRAT_MARGE||[]).map(m=>
    `- ${m.nom} : ${fmt(Math.round(m.kg))} kg, vente ${fmt(Math.round(m.prix))} F/kg, revient ${fmt(Math.round(m.revient))} F/kg (dont MP ${fmt(Math.round(m.mpKg))}), marge ${fmt(Math.round(m.margeKg))} F/kg → ${fmt(Math.round(m.margeTot))} F${m.incomplet?' [MP sans prix : marge surestimée]':''}`
  ).join('\n');

  const q = `Tu es le responsable des achats matières premières de la provenderie SADARI (Togo). Voici le besoin RÉEL en MP pour la production anticipée (chiffres calculés) :
${lignes}

Coût total des MP anticipées (besoin complet, stock inclus) : ${fmt(_STRAT_TOTAUX.coutAnt||0)} F.
Budget d'achat total estimé (manquant seulement) : ${fmt(_STRAT_TOTAUX.cout||0)} F · ${_STRAT_TOTAUX.nbManq||0} matières en manque.

RENTABILITÉ ANTICIPÉE par formule (${_STRAT_TOTAUX.nbFormules||0} formules retenues) :
${lignesMarge || '(non calculée)'}
CA anticipé ${fmt(_STRAT_TOTAUX.ca||0)} F · marge ${fmt(_STRAT_TOTAUX.marge||0)} F · taux ${(_STRAT_TOTAUX.taux||0).toFixed(1)}%.

Donne un plan CONCRET et chiffré :
1) Quelles MP acheter EN PRIORITÉ (risque de rupture / impact production) et dans quel ordre.
2) Comment optimiser le budget (regroupement de commandes, quantités, ce qui peut attendre).
3) Quelles formules produire en priorité au vu de leur marge, et lesquelles corriger (prix de vente trop bas ou coût MP trop haut).
Cite les matières, les formules et les chiffres. Sois bref et actionnable.`;

  try{
    const txt = await iaGenerate('comptable', q, tier); // moteur : Pro=DeepSeek, Premium=Claude
    out.textContent = txt || 'Réponse vide.';
  }catch(e){
    out.innerHTML = '⚠ ' + (e.message||e);
  }
  if(bPro) bPro.disabled = false; if(bPrem) bPrem.disabled = false;
}

// ── Handlers ──────────────────────────────────────
function _stratParam(formule){
  if(!GP_STRAT_PARAMS[formule]) GP_STRAT_PARAMS[formule] = { mode:'mois_precedent', tonnes:0, inclus:true };
  return GP_STRAT_PARAMS[formule];
}

// Upsert tolérant : si la colonne `inclus` n'a pas encore été passée en base,
// on rejoue sans elle plutôt que de perdre mode et tonnes.
async function _stratUpsert(rows){
  const payload = _STRAT_HAS_INCLUS ? rows : rows.map(r=>{ const {inclus, ...rest} = r; return rest; });
  const { error } = await SB.from('gp_strategie_mp').upsert(payload, { onConflict:'admin_id,formule_nom' });
  if(error && _STRAT_HAS_INCLUS && /inclus/i.test(error.message||'')){
    _STRAT_HAS_INCLUS = false;
    return _stratUpsert(rows);
  }
  if(error) console.warn('strat persist', error);
}

async function _stratPersist(formule){
  const p = GP_STRAT_PARAMS[formule];
  if(!p) return;
  try{
    await _stratUpsert([{
      admin_id:GP_ADMIN_ID, formule_nom:formule, mode:p.mode, tonnes:Number(p.tonnes||0),
      inclus: p.inclus !== false, updated_at:new Date().toISOString()
    }]);
  }catch(e){ console.warn('strat persist', e); }
}

function stratSetMode(formule, mode){
  _stratParam(formule).mode = mode;
  _stratRenderUI();
  _stratPersist(formule);
}
function stratSetTonnes(formule, val){
  _stratParam(formule).tonnes = Number(val)||0;
  _stratRenderUI();
  _stratPersist(formule);
}
function stratSetInclus(formule, inclus){
  _stratParam(formule).inclus = !!inclus;
  _stratRenderUI();
  _stratPersist(formule);
}
function stratSetComm(on){
  _STRAT_COMM = !!on;
  _stratRenderUI();
}
function stratToggleFormule(formule){
  if(_STRAT_OPEN_F.has(formule)) _STRAT_OPEN_F.delete(formule); else _STRAT_OPEN_F.add(formule);
  _stratRenderUI();
}
function stratToggleMp(key){
  if(_STRAT_OPEN_MP.has(key)) _STRAT_OPEN_MP.delete(key); else _STRAT_OPEN_MP.add(key);
  _stratRenderUI();
}

async function stratQuickEspece(espece, mode){
  const cibles = FORMULES_SADARI.filter(f=>(f.espece||'autre')===espece);
  cibles.forEach(f=>{ _stratParam(f.nom).mode = mode; });
  _stratRenderUI();
  await _stratQuickPersist(cibles);
}
async function stratQuickInclus(espece, inclus){
  const cibles = FORMULES_SADARI.filter(f=>(f.espece||'autre')===espece);
  cibles.forEach(f=>{ _stratParam(f.nom).inclus = !!inclus; });
  _stratRenderUI();
  await _stratQuickPersist(cibles);
}
async function _stratQuickPersist(cibles){
  try{
    const rows = cibles.map(f=>{
      const p = _stratParam(f.nom);
      return {
        admin_id:GP_ADMIN_ID, formule_nom:f.nom,
        mode:p.mode, tonnes:Number(p.tonnes||0), inclus: p.inclus !== false,
        updated_at:new Date().toISOString()
      };
    });
    if(rows.length) await _stratUpsert(rows);
  }catch(e){ console.warn('strat quick persist', e); }
}

// Enregistrement de la page (chargé après auth.js)
if(typeof PAGE_RENDERERS !== 'undefined'){
  PAGE_RENDERERS.strategie_mp = renderStrategieMP;
}
