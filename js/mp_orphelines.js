// ══════════════════════════════════════════════════
// PROVENDA — MP ORPHELINES
// Détecte les libellés de matière première utilisés dans les compositions de
// formules ou dans les mouvements de stock qui ne correspondent à AUCUNE fiche.
// Ce sont eux qui scindent un stock en deux (entrées sous un nom, sorties sous
// l'autre → net négatif) et qui font compter une MP à 0 F dans les coûts.
// Pour chacun : rattacher à une fiche existante, ou créer la fiche manquante.
// ══════════════════════════════════════════════════

let _MPO_LISTE = [];   // orphelins détectés (index utilisé par les handlers)
let _MPO_BUSY  = false;

function _mpoNorm(s){
  return (typeof normalizeMpNom === 'function')
    ? normalizeMpNom(s)
    : (s||'').toString().normalize('NFD').replace(/\p{Diacritic}/gu,'')
        .replace(/\s+/g,' ').trim().toLowerCase();
}

// Une fiche MP correspond-elle à ce couple (id, nom) ?
function _mpoFiche(id, nom){
  const L = GP_INGREDIENTS || [];
  if(id){
    const byId = L.find(i => i.id === id);
    if(byId) return byId;
  }
  const n = _mpoNorm(nom);
  if(!n) return null;
  return L.find(i => _mpoNorm(i.nom) === n) || null;
}

// ── DÉTECTION ─────────────────────────────────────
async function detecterMpOrphelines(){
  const orph = {};   // cle normalisée → { libelle, formules[], nbMvts, netKg }
  // Les variantes brutes d'un même libellé (« Son fin » / « Son  fin ») sont
  // regroupées sous une clé normalisée, mais TOUTES doivent être réécrites en
  // base — d'où le Set `bruts`.
  const add = (libelle) => {
    const k = _mpoNorm(libelle);
    const e = orph[k] || (orph[k] = { libelle, cle:k, bruts:new Set(), formules:[], nbMvts:0, netKg:0 });
    e.bruts.add(libelle);
    return e;
  };

  // 1) Compositions de formules
  (FORMULES_SADARI||[]).forEach(f=>{
    (f.ingredients||[]).forEach(ing=>{
      if(_mpoFiche(ing.id, ing.nom)) return;
      if(!ing.nom) return;
      add(ing.nom).formules.push({ nom:f.nom, pct:Number(ing.pct||0) });
    });
  });

  // 2) Mouvements de stock. gp_stock_mp sert AUSSI aux produits finis envoyés
  //    en distribution : on écarte tout libellé qui est un nom de formule,
  //    sinon on proposerait de créer une fiche MP pour « PONDEUSE Ponte A ».
  const nomsFormules = new Set((FORMULES_SADARI||[]).map(f=>_mpoNorm(f.nom)));
  let S = [];
  try{ S = (typeof _fetchAllStockMp === 'function') ? await _fetchAllStockMp() : []; }catch(_){ S = []; }
  (S||[]).forEach(m=>{
    const nom = m.ingredient_nom;
    if(!nom || nomsFormules.has(_mpoNorm(nom))) return;
    if(_mpoFiche(m.ingredient_id, nom)) return;
    const e = add(nom);
    e.nbMvts++;
    e.netKg += (m.type === 'entree' ? 1 : -1) * Number(m.quantite||0);
  });

  _MPO_LISTE = Object.values(orph).sort((a,b)=>
    (b.formules.length - a.formules.length) || (b.nbMvts - a.nbMvts));
  return _MPO_LISTE;
}

// ── RENDU ─────────────────────────────────────────
async function renderMpOrphelines(){
  const el = document.getElementById('mp-orphelines');
  if(!el) return;
  await detecterMpOrphelines();

  if(!_MPO_LISTE.length){ el.innerHTML = ''; el.style.display = 'none'; return; }
  el.style.display = 'block';

  const admin = GP_ROLE === 'admin';
  const options = [...(GP_INGREDIENTS||[])]
    .sort((a,b)=>a.nom.localeCompare(b.nom))
    .map(i=>`<option value="${i.id}">${i.nom}${i.prix_actuel>0?' — '+fmt(i.prix_actuel)+' F/kg':' — sans prix'}</option>`)
    .join('');

  el.innerHTML = `<div class="card" style="border-color:rgba(239,68,68,.35)">
    <div class="card-title"><div class="ct-left">
      <span>🔗 ${_MPO_LISTE.length} matière${_MPO_LISTE.length>1?'s':''} première${_MPO_LISTE.length>1?'s':''} sans fiche</span></div>
      <button class="btn btn-out btn-sm" onclick="renderMpOrphelines()">↻ Réanalyser</button>
    </div>
    <div style="font-size:11px;color:var(--textm);margin-bottom:10px">
      Ces libellés sont utilisés en production ou en stock mais ne correspondent à aucune fiche MP.
      Tant qu'ils ne sont pas rattachés, leur coût compte pour <b>0 F</b> et leur stock est compté à part
      (ce qui produit des stocks négatifs).
      ${admin?'':'<br><b>Seul un administrateur peut corriger.</b>'}
    </div>
    ${_MPO_LISTE.map((o,idx)=>{
      const usage = [
        o.formules.length ? `<b>${o.formules.length}</b> formule${o.formules.length>1?'s':''}` : null,
        o.nbMvts ? `<b>${o.nbMvts}</b> mouvement${o.nbMvts>1?'s':''} de stock (net ${fmt(Math.round(o.netKg))} kg)` : null
      ].filter(Boolean).join(' · ') || 'aucun usage';
      const listeF = o.formules.length
        ? `<div style="font-size:10px;color:var(--textm);margin-top:3px">${o.formules.map(f=>f.nom+' ('+f.pct+'%)').join(' · ')}</div>`
        : '';
      return `<div style="background:var(--card2);border:1px solid var(--border);border-radius:8px;padding:10px;margin-bottom:8px">
        <div style="font-size:12px;font-weight:700">« ${o.libelle} »</div>
        <div style="font-size:11px;color:var(--textm);margin-top:2px">${usage}</div>
        ${listeF}
        ${admin?`<div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin-top:8px">
          <select id="mpo-sel-${idx}" style="font-size:11px;padding:4px 6px;max-width:230px">
            <option value="">— Rattacher à une fiche existante —</option>${options}
          </select>
          <button class="btn btn-g btn-sm" onclick="mpoRattacher(${idx})">🔗 Rattacher</button>
          <span style="color:var(--textm);font-size:11px">ou</span>
          <input type="number" id="mpo-prix-${idx}" placeholder="Prix F/kg" min="0" step="1"
            style="width:90px;font-size:11px;padding:4px 6px;text-align:right">
          <button class="btn btn-out btn-sm" onclick="mpoCreer(${idx})">➕ Créer la fiche</button>
        </div>`:''}
      </div>`;
    }).join('')}
  </div>`;
}

// ── ACTIONS ───────────────────────────────────────
// Réécrit partout le libellé orphelin vers la fiche cible : mouvements de stock,
// lignes d'achat, lignes d'inventaire et compositions de formules — en posant
// l'ingredient_id, ce qui rend le rattachement définitif même après renommage.
async function _mpoAppliquer(orph, fiche){
  const A = GP_ADMIN_ID;
  const anciens = Array.from(orph.bruts || [orph.libelle]);

  // 1) Mouvements de stock
  await SB.from('gp_stock_mp')
    .update({ ingredient_nom: fiche.nom, ingredient_id: fiche.id })
    .eq('admin_id', A).in('ingredient_nom', anciens);

  // 2) Lignes d'achat (historique des prix)
  try{
    await SB.from('gp_achats_lignes')
      .update({ ingredient_nom: fiche.nom, ingredient_id: fiche.id })
      .eq('admin_id', A).in('ingredient_nom', anciens);
  }catch(_){}

  // 3) Lignes d'inventaire
  try{
    await SB.from('gp_inventaires_lignes')
      .update({ ingredient_nom: fiche.nom })
      .eq('admin_id', A).in('ingredient_nom', anciens);
  }catch(_){}

  // 4) Compositions de formules : nom + id, en fusionnant si la fiche cible est
  //    déjà présente dans la même formule (sinon on créerait deux lignes du même
  //    ingrédient et le total des pourcentages serait faux).
  let nbFormules = 0;
  for(const f of (FORMULES_SADARI||[])){
    const ings = f.ingredients || [];
    if(!ings.some(i => _mpoNorm(i.nom) === orph.cle)) continue;
    const out = [];
    for(const ing of ings){
      const estOrphelin = _mpoNorm(ing.nom) === orph.cle;
      const nom = estOrphelin ? fiche.nom : ing.nom;
      const id  = estOrphelin ? fiche.id  : (ing.id || null);
      const deja = out.find(x => _mpoNorm(x.nom) === _mpoNorm(nom));
      if(deja) deja.pct = Math.round((Number(deja.pct||0) + Number(ing.pct||0)) * 100) / 100;
      else out.push({ nom, pct: Number(ing.pct||0), id });
    }
    const { error } = await SB.from('gp_formules').update({ ingredients: out }).eq('id', f.id);
    if(error) throw new Error('Formule « '+f.nom+' » : '+error.message);
    f.ingredients = out;   // cache local à jour
    nbFormules++;
  }
  return nbFormules;
}

async function mpoRattacher(idx){
  if(_MPO_BUSY) return;
  const o = _MPO_LISTE[idx];
  const sel = document.getElementById('mpo-sel-'+idx);
  const ficheId = sel?.value;
  if(!o) return;
  if(!ficheId){ notify('Choisis d\'abord une fiche MP.','red'); return; }
  const fiche = (GP_INGREDIENTS||[]).find(i => i.id === ficheId);
  if(!fiche){ notify('Fiche introuvable.','red'); return; }

  const detail = [
    o.formules.length ? o.formules.length+' formule(s)' : null,
    o.nbMvts ? o.nbMvts+' mouvement(s) de stock (net '+fmt(Math.round(o.netKg))+' kg)' : null
  ].filter(Boolean).join('\n· ');
  if(!confirm(`Rattacher « ${o.libelle} » à la fiche « ${fiche.nom} » ?\n\n· ${detail}\n\n`
    +`Le stock des deux libellés sera fusionné. Cette opération n'est pas réversible.`)) return;

  _MPO_BUSY = true;
  try{
    const n = await _mpoAppliquer(o, fiche);
    notify(`« ${o.libelle} » rattaché à « ${fiche.nom} » — ${n} formule(s) mise(s) à jour ✓`,'gold');
    if(typeof loadFormules === 'function') await loadFormules();
    if(typeof loadIngredients === 'function') await loadIngredients();
    await renderMatieresPremieresPage();
  }catch(e){
    notify('Erreur : '+(e.message||e),'red');
  }finally{ _MPO_BUSY = false; }
}

async function mpoCreer(idx){
  if(_MPO_BUSY) return;
  const o = _MPO_LISTE[idx];
  if(!o) return;
  const prix = Number(document.getElementById('mpo-prix-'+idx)?.value || 0);
  if(!(prix > 0) && !confirm(`Créer « ${o.libelle} » SANS prix ?\n\n`
    +`Sans prix, cette MP comptera pour 0 F dans le coût de production et la marge.`)) return;

  _MPO_BUSY = true;
  try{
    const { data, error } = await SB.from('gp_ingredients').insert({
      admin_id: GP_ADMIN_ID, nom: o.libelle, unite: 'kg',
      prix_actuel: prix, seuil_alerte: 200, actif: true
    }).select().maybeSingle();
    if(error) throw error;
    if(typeof loadIngredients === 'function') await loadIngredients();
    const fiche = (GP_INGREDIENTS||[]).find(i => i.id === data?.id) || data;
    // Rattachement immédiat : la fiche ne sert à rien si les mouvements et les
    // formules continuent de pointer dans le vide.
    const n = fiche ? await _mpoAppliquer(o, fiche) : 0;
    notify(`Fiche « ${o.libelle} » créée${prix>0?' à '+fmt(prix)+' F/kg':''} — ${n} formule(s) rattachée(s) ✓`,'gold');
    if(typeof loadFormules === 'function') await loadFormules();
    await renderMatieresPremieresPage();
  }catch(e){
    notify('Erreur : '+(e.message||e),'red');
  }finally{ _MPO_BUSY = false; }
}
