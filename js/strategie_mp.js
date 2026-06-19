// ══════════════════════════════════════════════════
// PROVENDA — STRATÉGIE D'ACHAT MATIÈRES PREMIÈRES
// Production anticipée (manuel / mois précédent / mois en cours)
// → besoin MP via compositions → comparé au stock → manquant + coût.
// ══════════════════════════════════════════════════

let GP_STRAT_PARAMS = {};   // { formule_nom: { mode, tonnes } }
let _STRAT = null;          // données chargées (prod mensuelle, niveaux stock, labels)

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

// Production réelle (kg) par formule sur un mois 'YYYY-MM'
async function _stratProdMois(mois){
  const debut = mois + '-01';
  const [y,m] = mois.split('-').map(Number);
  const fin = new Date(y, m, 1).toISOString().slice(0,10); // 1er du mois suivant
  const { data } = await SB.from('gp_lots')
    .select('formule_nom,qte_produite,date')
    .eq('admin_id', GP_ADMIN_ID).gte('date', debut).lt('date', fin);
  const agg = {};
  (data||[]).forEach(l=>{ agg[l.formule_nom] = (agg[l.formule_nom]||0) + Number(l.qte_produite||0); });
  return agg;
}

// kg anticipés pour une formule selon son mode
function _stratAnticipeKg(f){
  const p = GP_STRAT_PARAMS[f.nom] || { mode:'mois_precedent', tonnes:0 };
  if(p.mode === 'manuel')        return Number(p.tonnes||0) * 1000;
  if(p.mode === 'mois_courant')  return Number(_STRAT.prodCourant[f.nom]||0);
  return Number(_STRAT.prodPrec[f.nom]||0); // mois_precedent
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

  const now = new Date();
  const moisCourant = now.toISOString().slice(0,7);
  const moisPrec    = new Date(now.getFullYear(), now.getMonth()-1, 1).toISOString().slice(0,7);

  const [{ data:params }, prodPrec, prodCourant, { data:S }] = await Promise.all([
    SB.from('gp_strategie_mp').select('*').eq('admin_id', GP_ADMIN_ID),
    _stratProdMois(moisPrec),
    _stratProdMois(moisCourant),
    SB.from('gp_stock_mp').select('*').eq('admin_id', GP_ADMIN_ID)
  ]);

  GP_STRAT_PARAMS = {};
  (params||[]).forEach(p=>{ GP_STRAT_PARAMS[p.formule_nom] = { mode:p.mode, tonnes:Number(p.tonnes||0) }; });

  _STRAT = {
    prodPrec, prodCourant,
    niveaux: _stratNiveaux(S),
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
      📅 Mois précédent = <b>${_STRAT.moisPrecLabel}</b> · Mois en cours = <b>${_STRAT.moisCourantLabel}</b></div>` +
      Object.keys(groupes).sort().map(esp=>{
        const espEsc = esp.replace(/'/g,"\\'");
        const rows = groupes[esp].sort((a,b)=>a.nom.localeCompare(b.nom)).map(f=>{
          const p = GP_STRAT_PARAMS[f.nom] || { mode:'mois_precedent', tonnes:0 };
          const nEsc = f.nom.replace(/'/g,"\\'");
          const kg = _stratAnticipeKg(f);
          const sel = (v)=> p.mode===v ? 'selected' : '';
          return `<tr>
            <td style="font-size:12px">${f.nom}</td>
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
          </tr>`;
        }).join('');
        return `<div style="margin-bottom:14px">
          <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:6px">
            <span style="font-size:12px;font-weight:700;color:var(--g6);text-transform:capitalize">${esp}</span>
            <span style="display:flex;gap:6px">
              <button class="btn btn-out btn-sm" onclick="stratQuickEspece('${espEsc}','mois_precedent')">Tout : mois préc.</button>
              <button class="btn btn-out btn-sm" onclick="stratQuickEspece('${espEsc}','mois_courant')">Tout : mois en cours</button>
            </span>
          </div>
          <table class="tbl" style="font-size:12px"><thead><tr>
            <th>Formule</th><th>Mode</th><th class="num">Tonnes</th><th class="num">Anticipé</th>
          </tr></thead><tbody>${rows}</tbody></table>
        </div>`;
      }).join('');
  }

  // 2) Besoin MP = somme des compositions × kg anticipés
  const besoin = {};
  FORMULES_SADARI.forEach(f=>{
    const kg = _stratAnticipeKg(f);
    if(kg <= 0) return;
    (f.ingredients||[]).forEach(ing=>{
      besoin[ing.nom] = (besoin[ing.nom]||0) + (Number(ing.pct||0)/100)*kg;
    });
  });

  const niveaux = _STRAT.niveaux;
  const rows = Object.keys(besoin).map(nom=>{
    const ant  = besoin[nom] || 0;
    const stk  = niveaux[nom] || 0;
    const manq = Math.max(0, ant - stk);
    const ingr = (typeof GP_INGREDIENTS !== 'undefined' ? GP_INGREDIENTS : []).find(i=>i.nom===nom);
    const prix = Number(ingr?.prix_actuel || 0);
    return { nom, ant, stk, manq, cout: manq*prix };
  }).sort((a,b)=> b.manq - a.manq);

  const totalManq = rows.filter(r=>r.manq>0).length;
  const totalCout = rows.reduce((s,r)=>s + r.cout, 0);

  const kpis = document.getElementById('strat-kpis');
  if(kpis) kpis.innerHTML = `
    <div class="econo-box"><div class="econo-val">${rows.length}</div><div class="econo-lbl">Matières concernées</div></div>
    <div class="econo-box"><div class="econo-val" style="color:${totalManq>0?'var(--red)':'var(--green)'}">${totalManq}</div><div class="econo-lbl">En manque</div></div>
    <div class="econo-box"><div class="econo-val" style="color:var(--gold)">${fmt(Math.round(totalCout))}</div><div class="econo-lbl">Budget achat (F)</div></div>`;

  const res = document.getElementById('strat-result');
  if(res){
    res.innerHTML = rows.length ? `<table class="tbl"><thead><tr>
      <th>Matière première</th>
      <th class="num">Total anticipé</th>
      <th class="num">Total stock</th>
      <th class="num">Manquant</th>
      <th class="num">Coût estimé</th>
    </tr></thead><tbody>${rows.map(r=>`<tr>
      <td style="font-weight:600">${r.nom}</td>
      <td class="num">${fmt(Math.round(r.ant))} kg</td>
      <td class="num">${fmt(Math.round(r.stk))} kg</td>
      <td class="num" style="font-weight:700;color:${r.manq>0?'var(--red)':'var(--green)'}">${r.manq>0?fmt(Math.round(r.manq))+' kg':'✅ 0'}</td>
      <td class="num" style="color:var(--gold)">${r.manq>0?fmt(Math.round(r.cout))+' F':'—'}</td>
    </tr>`).join('')}</tbody>
    <tfoot><tr style="font-weight:700;border-top:2px solid var(--border2)">
      <td colspan="4" class="num">Budget d'achat total estimé</td>
      <td class="num" style="color:var(--gold)">${fmt(Math.round(totalCout))} F</td>
    </tr></tfoot></table>`
    : '<div class="card" style="text-align:center;color:var(--textm);font-size:13px;padding:20px">Configure tes paramètres ci-dessus (tonnes manuelles ou base mensuelle) pour voir le besoin en matières premières.</div>';
  }
}

// ── Handlers ──────────────────────────────────────
function _stratParam(formule){
  if(!GP_STRAT_PARAMS[formule]) GP_STRAT_PARAMS[formule] = { mode:'mois_precedent', tonnes:0 };
  return GP_STRAT_PARAMS[formule];
}
async function _stratPersist(formule){
  const p = GP_STRAT_PARAMS[formule];
  if(!p) return;
  try{
    await SB.from('gp_strategie_mp').upsert({
      admin_id:GP_ADMIN_ID, formule_nom:formule, mode:p.mode, tonnes:Number(p.tonnes||0),
      updated_at:new Date().toISOString()
    }, { onConflict:'admin_id,formule_nom' });
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
async function stratQuickEspece(espece, mode){
  const cibles = FORMULES_SADARI.filter(f=>(f.espece||'autre')===espece);
  cibles.forEach(f=>{ _stratParam(f.nom).mode = mode; });
  _stratRenderUI();
  // Persistance groupée
  try{
    const rows = cibles.map(f=>({
      admin_id:GP_ADMIN_ID, formule_nom:f.nom,
      mode, tonnes:Number(GP_STRAT_PARAMS[f.nom]?.tonnes||0),
      updated_at:new Date().toISOString()
    }));
    if(rows.length) await SB.from('gp_strategie_mp').upsert(rows, { onConflict:'admin_id,formule_nom' });
  }catch(e){ console.warn('strat quick persist', e); }
}

// Enregistrement de la page (chargé après auth.js)
if(typeof PAGE_RENDERERS !== 'undefined'){
  PAGE_RENDERERS.strategie_mp = renderStrategieMP;
}
