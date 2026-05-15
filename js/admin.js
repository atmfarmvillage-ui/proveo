
// ── DÉTECTION PAYS DEPUIS NUMÉRO ─────────────────
function detecterPays(tel){
  const t=tel.replace(/[\s\-\.\(\)]/g,'');
  // Retourne {indicatif, pays, numero_local}
  const pays=[
    {code:'+228',pays:'Togo',flag:'🇹🇬'},
    {code:'+225',pays:'Côte d\'Ivoire',flag:'🇨🇮'},
    {code:'+229',pays:'Bénin',flag:'🇧🇯'},
    {code:'+226',pays:'Burkina Faso',flag:'🇧🇫'},
    {code:'+223',pays:'Mali',flag:'🇲🇱'},
    {code:'+221',pays:'Sénégal',flag:'🇸🇳'},
    {code:'+224',pays:'Guinée',flag:'🇬🇳'},
    {code:'+227',pays:'Niger',flag:'🇳🇪'},
    {code:'+237',pays:'Cameroun',flag:'🇨🇲'},
    {code:'+242',pays:'Congo',flag:'🇨🇬'},
    {code:'+243',pays:'RDC',flag:'🇨🇩'},
    {code:'+233',pays:'Ghana',flag:'🇬🇭'},
    {code:'+234',pays:'Nigeria',flag:'🇳🇬'},
    {code:'+212',pays:'Maroc',flag:'🇲🇦'},
    {code:'+213',pays:'Algérie',flag:'🇩🇿'},
    {code:'+216',pays:'Tunisie',flag:'🇹🇳'},
    {code:'+33',pays:'France',flag:'🇫🇷'},
    {code:'+1',pays:'USA/Canada',flag:'🇺🇸'},
  ];
  // Tester avec indicatif (ex: +228, 00228, 228)
  for(const p of pays){
    const ind=p.code.replace('+','');
    if(t.startsWith('+'+ind)||t.startsWith('00'+ind)||t.startsWith(ind)){
      const local=t.replace(/^(\+|00)?/,'').replace(/^0*/,'').slice(ind.length);
      return {...p,numero_complet:p.code+local,numero_whatsapp:ind+local};
    }
  }
  // Par défaut Togo si 8 chiffres
  if(t.replace(/^0+/,'').length===8) return {code:'+228',pays:'Togo',flag:'🇹🇬',numero_complet:'+228'+t,numero_whatsapp:'228'+t};
  return {code:'',pays:'Inconnu',flag:'🌍',numero_complet:'+'+t,numero_whatsapp:t};
}
// ── FORMULES & PRIX ────────────────────────────────

async function savePrixFormule(){
  const nom=document.getElementById('pf_formule').value;
  const prix=+document.getElementById('pf_prix').value||0;
  const err=document.getElementById('pf_err');
  if(!nom||!prix){err.textContent='Formule et prix requis.';return;}
  const{error}=await SB.from('gp_prix_formules').upsert({admin_id:GP_ADMIN_ID,formule_nom:nom,prix},{onConflict:'admin_id,formule_nom'});
  if(error){
    // Try insert instead
    await SB.from('gp_prix_formules').insert({admin_id:GP_ADMIN_ID,formule_nom:nom,prix});
  }
  GP_PRIX[nom]=prix;
  document.getElementById('pf_prix').value='';
  err.textContent='';
  notify(`Prix ${nom} → ${fmt(prix)} F/kg ✓`,'gold');
  renderPrixFormules();
}


function editerPrix(id){
  document.getElementById('prix-val-'+id).style.display='none';
  document.getElementById('prix-inp-'+id).style.display='inline-block';
  document.getElementById('edit-btn-'+id).style.display='none';
  document.getElementById('save-btn-'+id).style.display='inline-flex';
  document.getElementById('prix-inp-'+id).focus();
}
function annulerEdit(id){
  document.getElementById('prix-val-'+id).style.display='inline';
  document.getElementById('prix-inp-'+id).style.display='none';
  document.getElementById('edit-btn-'+id).style.display='inline-flex';
  document.getElementById('save-btn-'+id).style.display='none';
}
async function sauverPrixIngr(id){
  const val=+document.getElementById('prix-inp-'+id).value||0;
  const{error}=await SB.from('gp_ingredients').update({prix_actuel:val}).eq('id',id);
  if(error){notify('Erreur: '+error.message,'r');return;}
  const ingr=GP_INGREDIENTS.find(i=>i.id===id);
  if(ingr)ingr.prix_actuel=val;
  document.getElementById('prix-val-'+id).textContent=fmt(val);
  annulerEdit(id);
  notify('Prix mis à jour ✓','gold');
}
function editerSeuil(id){
  document.getElementById('seuil-val-'+id).style.display='none';
  document.getElementById('seuil-inp-'+id).style.display='inline-block';
  document.getElementById('seuil-edit-'+id).style.display='none';
  document.getElementById('seuil-save-'+id).style.display='inline-flex';
  document.getElementById('seuil-inp-'+id).focus();
  document.getElementById('seuil-inp-'+id).select();
}
function annulerSeuil(id){
  document.getElementById('seuil-val-'+id).style.display='inline';
  document.getElementById('seuil-inp-'+id).style.display='none';
  document.getElementById('seuil-edit-'+id).style.display='inline-flex';
  document.getElementById('seuil-save-'+id).style.display='none';
}
async function sauverSeuil(id){
  const val=+document.getElementById('seuil-inp-'+id).value||100;
  const{error}=await SB.from('gp_ingredients').update({seuil_alerte:val}).eq('id',id);
  if(error){notify('Erreur: '+error.message,'r');return;}
  const ingr=GP_INGREDIENTS.find(i=>i.id===id);
  if(ingr)ingr.seuil_alerte=val;
  document.getElementById('seuil-val-'+id).textContent=fmt(val);
  annulerSeuil(id);
  notify('Seuil d\'alerte mis à jour ✓','gold');
}
async function saveIngredient(){
  const nom=document.getElementById('ni_nom').value.trim();
  const prix=+document.getElementById('ni_prix').value||0;
  const prot=+document.getElementById('ni_prot')?.value||null;
  const em=+document.getElementById('ni_em')?.value||null;
  const seuil=+document.getElementById('ni_seuil').value||200;
  const err=document.getElementById('ni_err');
  if(!nom){err.textContent='Nom requis.';return;}
  const{error}=await SB.from('gp_ingredients').insert({
    admin_id:GP_ADMIN_ID,nom,prix_actuel:prix,
    proteines:prot,energie:em,
    seuil_alerte:seuil,
    fournisseur:document.getElementById('ni_fourn').value.trim()||null
  });
  if(error){err.textContent='Erreur: '+error.message;return;}
  ['ni_nom','ni_prix','ni_prot','ni_em','ni_fourn'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});
  document.getElementById('ni_seuil').value='200';
  err.textContent='';
  await loadIngredients();populateSelects();renderIngrAdmin();
  notify('Matière première ajoutée ✓');
}
async function deleteIngredient(id){
  if(!confirm('Supprimer cet ingrédient ?'))return;
  await SB.from('gp_ingredients').delete().eq('id',id);
  await loadIngredients();populateSelects();renderIngrAdmin();
}
// ══════════════════════════════════════════════════
// ÉDITEUR DE FORMULES — VERSION FORMULATION PRO
// ══════════════════════════════════════════════════
let MF_INGREDIENTS = []; // [{id, nom, pct}]

const NUTRIMENTS = [
  {key:'proteines',     label:'Protéines',    unite:'%',     decimals:2, besoinMin:'pb_min',           besoinMax:'pb_max'},
  {key:'energie',       label:'EM',           unite:'kcal/kg',decimals:0, besoinMin:'em_min',           besoinMax:'em_max'},
  {key:'lipides',       label:'Lipides',      unite:'%',     decimals:2, besoinMin:'lipides_min',      besoinMax:'lipides_max'},
  {key:'fibres',        label:'Fibres',       unite:'%',     decimals:2, besoinMin:'fibres_min',       besoinMax:'fibres_max'},
  {key:'lysine',        label:'Lysine',       unite:'%',     decimals:3, besoinMin:'lysine_min',       besoinMax:'lysine_max'},
  {key:'methionine',    label:'Méthionine',   unite:'%',     decimals:3, besoinMin:'methionine_min',   besoinMax:'methionine_max'},
  {key:'meth_cyst',     label:'Méth+Cyst',    unite:'%',     decimals:3, besoinMin:'meth_cyst_min',    besoinMax:'meth_cyst_max'},
  {key:'threonine',     label:'Thréonine',    unite:'%',     decimals:3, besoinMin:'threonine_min',    besoinMax:'threonine_max'},
  {key:'tryptophane',   label:'Tryptophane',  unite:'%',     decimals:3, besoinMin:'tryptophane_min',  besoinMax:'tryptophane_max'},
  {key:'calcium',       label:'Calcium',      unite:'%',     decimals:2, besoinMin:'calcium_min',      besoinMax:'calcium_max'},
  {key:'phosphore_disp',label:'P disponible', unite:'%',     decimals:2, besoinMin:'phosphore_disp_min',besoinMax:'phosphore_disp_max'},
  {key:'sodium',        label:'Sodium',       unite:'%',     decimals:3, besoinMin:'sodium_min',       besoinMax:'sodium_max'},
  {key:'chlore',        label:'Chlore',       unite:'%',     decimals:3, besoinMin:'chlore_min',       besoinMax:'chlore_max'},
];

function openNewFormule(){
  document.getElementById('mf-titre').textContent='🧪 Nouvelle formule';
  document.getElementById('mf_id').value='';
  ['mf_nom','mf_prix','mf_emb','mf_mo','mf_trans','mf_new_pct','mf_ingr_search','mf_new_ingr_id','mf_new_ingr'].forEach(id=>{
    const el=document.getElementById(id); if(el) el.value='';
  });
  document.getElementById('mf_err').textContent='';
  MF_INGREDIENTS = [];
  _remplirSelectEspeceMF();
  const espSel = document.getElementById('mf_espece');
  if(espSel) espSel.value = (GP_CATEGORIES[0]?.espece) || '';
  onChangeEspeceMF();
  _renderMFIngredients();
  _renderAnalyseNutritionnelle();
  document.getElementById('modal-formule').style.display='flex';
  setTimeout(()=>document.getElementById('mf_nom').focus(),100);
}

function fermerModalFormule(){
  document.getElementById('modal-formule').style.display='none';
}

async function editerFormule(id){
  const f = FORMULES_SADARI.find(x=>x.id===id);
  if(!f){ notify('Formule introuvable','r'); return; }
  document.getElementById('mf-titre').textContent='✏️ Modifier — '+f.nom;
  document.getElementById('mf_id').value=f.id;
  document.getElementById('mf_nom').value=f.nom;
  document.getElementById('mf_prix').value=f.prix_defaut||0;
  document.getElementById('mf_emb').value=f.cout_emballage_kg||0;
  document.getElementById('mf_mo').value=f.cout_mo_tonne||0;
  document.getElementById('mf_trans').value=f.cout_transport_lot||0;
  _remplirSelectEspeceMF();
  document.getElementById('mf_espece').value = f.espece || (GP_CATEGORIES[0]?.espece) || '';
  onChangeEspeceMF();
  document.getElementById('mf_categorie').value = f.stade || '';
  onChangeCategorieMF();

  MF_INGREDIENTS = (f.ingredients||[]).map(i => {
    const ing = (GP_INGREDIENTS||[]).find(x => x.nom === i.nom);
    return { id: ing?.id || null, nom: i.nom, pct: Number(i.pct) || 0 };
  });
  _renderMFIngredients();
  _renderAnalyseNutritionnelle();
  document.getElementById('mf_err').textContent='';
  document.getElementById('modal-formule').style.display='flex';
}

// ── DROPDOWNS ESPÈCE/CATÉGORIE DYNAMIQUES ────────────
function _remplirSelectEspeceMF(){
  const sel = document.getElementById('mf_espece');
  if(!sel) return;
  const especes = [...new Map((GP_CATEGORIES||[]).map(c => [c.espece, c])).values()];
  sel.innerHTML = especes.map(e =>
    `<option value="${e.espece}">${e.espece_icon||'📦'} ${e.espece_label||e.espece}</option>`
  ).join('');
}

function onChangeEspeceMF(){
  const espece = document.getElementById('mf_espece').value;
  const sel = document.getElementById('mf_categorie');
  if(!sel) return;
  const cats = (GP_CATEGORIES||[]).filter(c => c.espece === espece).sort((a,b)=>a.ordre-b.ordre);
  sel.innerHTML = '<option value="">— Choisir catégorie —</option>' +
    cats.map(c => `<option value="${c.categorie}">${c.categorie_label||c.categorie}</option>`).join('');
  onChangeCategorieMF();
}

function onChangeCategorieMF(){
  const espece = document.getElementById('mf_espece').value;
  const categorie = document.getElementById('mf_categorie').value;
  const besoin = (GP_BESOINS||[]).find(b => b.espece === espece && b.categorie === categorie);
  const src = document.getElementById('mf-besoin-source');
  if(src){
    src.textContent = besoin
      ? `📚 Cibles : ${besoin.source || 'standard'}`
      : (categorie ? '⚠ Aucun standard pour cette catégorie' : '');
  }
  _renderAnalyseNutritionnelle();
}

// ── RECHERCHE MP AUTOCOMPLETE ────────────────────────
async function filtrerIngrFormule(){
  const q = normalizeSearch(document.getElementById('mf_ingr_search')?.value || '');
  const results = document.getElementById('mf_ingr_results');
  if(!results) return;
  if(!GP_INGREDIENTS || !GP_INGREDIENTS.length){
    const{data} = await SB.from('gp_ingredients').select('*').eq('admin_id', GP_ADMIN_ID).order('nom');
    if(data) GP_INGREDIENTS = data;
  }
  const dejaPris = new Set(MF_INGREDIENTS.map(i => i.nom));
  let liste = (GP_INGREDIENTS||[]).filter(i => !dejaPris.has(i.nom));
  if(q) liste = liste.filter(i => normalizeSearch(i.nom).includes(q));
  liste.sort((a,b) => a.nom.localeCompare(b.nom));
  liste = liste.slice(0, 12);

  if(!liste.length){
    results.innerHTML = '<div style="padding:10px;color:var(--textm);font-size:11px;text-align:center">Aucun résultat</div>';
    results.style.display = 'block';
    return;
  }

  results.innerHTML = liste.map(i => {
    const prot = i.proteines || 0;
    const em = i.energie || 0;
    const hasData = prot > 0 || em > 0;
    return `<div onclick="selectionnerIngrFormule('${i.id}','${i.nom.replace(/'/g,"\\'").replace(/"/g,'&quot;')}')"
      style="padding:8px 12px;cursor:pointer;border-bottom:1px solid rgba(30,45,74,.4);transition:background .15s"
      onmouseover="this.style.background='rgba(22,163,74,.1)'" onmouseout="this.style.background=''">
      <div style="font-size:12px;font-weight:600">${i.nom}</div>
      <div style="font-size:10px;color:var(--textm)">
        ${hasData
          ? `PB ${prot}% · EM ${em} kcal · ${fmt(i.prix_actuel||0)} F/kg`
          : `⚠ Valeurs nutri manquantes · ${fmt(i.prix_actuel||0)} F/kg`}
      </div>
    </div>`;
  }).join('');
  results.style.display = 'block';
}

function selectionnerIngrFormule(id, nom){
  document.getElementById('mf_new_ingr_id').value = id;
  document.getElementById('mf_new_ingr').value = nom;
  document.getElementById('mf_ingr_search').value = nom;
  document.getElementById('mf_ingr_results').style.display = 'none';
  document.getElementById('mf_new_pct').focus();
}

document.addEventListener('click', e => {
  const s = document.getElementById('mf_ingr_search');
  const r = document.getElementById('mf_ingr_results');
  if(s && r && !s.contains(e.target) && !r.contains(e.target)) r.style.display = 'none';
});

// ── AJOUT / MODIF / SUPPRESSION INGRÉDIENT ────────────
function ajouterIngredientFormule(){
  const id = document.getElementById('mf_new_ingr_id').value;
  const nom = document.getElementById('mf_new_ingr').value || document.getElementById('mf_ingr_search').value;
  const pct = +document.getElementById('mf_new_pct').value || 0;
  const err = document.getElementById('mf_err');
  if(!id || !nom){ err.textContent='Sélectionnez une MP depuis la liste.'; return; }
  if(pct<=0){ err.textContent='Pourcentage doit être > 0.'; return; }
  MF_INGREDIENTS.push({id, nom, pct});
  document.getElementById('mf_new_ingr_id').value='';
  document.getElementById('mf_new_ingr').value='';
  document.getElementById('mf_ingr_search').value='';
  document.getElementById('mf_new_pct').value='';
  err.textContent='';
  _renderMFIngredients();
  _renderAnalyseNutritionnelle();
}

function modifierPctIngrFormule(idx, val){
  MF_INGREDIENTS[idx].pct = +val || 0;
  _renderMFIngredients();
  _renderAnalyseNutritionnelle();
}

function supprimerIngredientFormule(idx){
  MF_INGREDIENTS.splice(idx, 1);
  _renderMFIngredients();
  _renderAnalyseNutritionnelle();
}

function _renderMFIngredients(){
  const el = document.getElementById('mf-ingredients-liste');
  if(!el) return;
  const total = MF_INGREDIENTS.reduce((s,i)=>s+Number(i.pct||0),0);
  const tot = document.getElementById('mf-total-pct');
  if(tot){
    tot.textContent = `Total : ${total.toFixed(2)}%`;
    tot.style.color = Math.abs(total-100)<0.01 ? 'var(--green)' : (total>100?'var(--red)':'var(--gold)');
  }
  if(!MF_INGREDIENTS.length){
    el.innerHTML = '<div style="font-size:11px;color:var(--textm);padding:8px 0">Aucune MP. Cherchez ci-dessous pour ajouter.</div>';
    return;
  }
  const espece = document.getElementById('mf_espece')?.value;
  el.innerHTML = MF_INGREDIENTS.map((ing, i) => {
    const ingData = (GP_INGREDIENTS||[]).find(x => x.id === ing.id);
    const prix = ingData?.prix_actuel || 0;
    const violation = _violationMP(espece, ing.nom, ing.pct);
    const bg = violation ? 'rgba(239,68,68,.08)' : 'rgba(14,20,40,.4)';
    const border = violation ? 'rgba(239,68,68,.4)' : 'var(--border)';
    const warn = violation
      ? `<div style="grid-column:1/-1;font-size:9px;color:var(--red);margin-top:3px">⚠ ${violation.type==='max'?'Maximum':'Minimum'} : ${violation.limite}%${violation.note?' — '+violation.note:''}</div>`
      : '';
    return `<div style="display:grid;grid-template-columns:1fr 80px 80px 28px;gap:6px;align-items:center;padding:6px 8px;background:${bg};border:1px solid ${border};border-radius:6px;margin-bottom:4px">
      <div style="font-size:11px;font-weight:600;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${ing.nom}">${ing.nom}</div>
      <input type="number" step="0.01" value="${ing.pct}" onchange="modifierPctIngrFormule(${i}, this.value)"
        style="font-size:11px;padding:3px 5px;text-align:right;${violation?'color:var(--red);font-weight:700':''}">
      <div style="font-size:10px;color:var(--textm);text-align:right">${fmt(Math.round(ing.pct*10*prix))} F/t</div>
      <button onclick="supprimerIngredientFormule(${i})"
        style="background:rgba(239,68,68,.1);border:1px solid rgba(239,68,68,.3);color:var(--red);width:26px;height:26px;border-radius:6px;cursor:pointer">✕</button>
      ${warn}
    </div>`;
  }).join('');
}

// ── CONTRAINTES D'INCORPORATION MP × ESPÈCE ─────────
function _contraintesMP(espece, ingrNom){
  if(!espece || !ingrNom) return [];
  const nNom = normalizeSearch(ingrNom);
  return (GP_CONTRAINTES_MP||[]).filter(c =>
    c.espece === espece &&
    nNom.includes(normalizeSearch(c.ingredient_pattern))
  );
}

// Renvoie {type:'max'|'min', limite, note} ou null
function _violationMP(espece, ingrNom, pct){
  const cs = _contraintesMP(espece, ingrNom);
  for(const c of cs){
    if(c.pct_max != null && pct > Number(c.pct_max) + 0.001){
      return {type:'max', limite:Number(c.pct_max), note:c.note};
    }
    if(c.pct_min != null && pct < Number(c.pct_min) - 0.001){
      return {type:'min', limite:Number(c.pct_min), note:c.note};
    }
  }
  return null;
}

// Plafond max d'une MP (si plusieurs contraintes, le plus restrictif gagne)
function _plafondMP(espece, ingrNom){
  const cs = _contraintesMP(espece, ingrNom);
  let max = null;
  for(const c of cs){
    if(c.pct_max != null){
      max = (max == null) ? Number(c.pct_max) : Math.min(max, Number(c.pct_max));
    }
  }
  return max;
}

// ── CALCUL NUTRIMENTS LIVE + ANALYSE ──────────────────
function _calculerNutriments(){
  const out = {};
  for(const n of NUTRIMENTS) out[n.key] = 0;
  let coutMP = 0;
  for(const ing of MF_INGREDIENTS){
    const data = (GP_INGREDIENTS||[]).find(x => x.id === ing.id);
    if(!data) continue;
    const pct = Number(ing.pct) || 0;
    coutMP += pct * 10 * (data.prix_actuel || 0);
    for(const n of NUTRIMENTS){
      const v = Number(data[n.key]) || 0;
      out[n.key] += (pct / 100) * v;
    }
  }
  return {nutriments: out, coutMP};
}

function _renderAnalyseNutritionnelle(){
  const el = document.getElementById('mf-analyse-table');
  const coutEl = document.getElementById('mf-cout-mp');
  if(!el) return;

  const espece = document.getElementById('mf_espece')?.value;
  const categorie = document.getElementById('mf_categorie')?.value;
  const besoin = (GP_BESOINS||[]).find(b => b.espece === espece && b.categorie === categorie);
  const {nutriments, coutMP} = _calculerNutriments();

  el.innerHTML = `<table class="tbl" style="width:100%;font-size:10px"><thead>
    <tr><th>Nutriment</th><th class="num">Calc.</th><th class="num">Cible</th><th></th></tr>
  </thead><tbody>${NUTRIMENTS.map(n => {
    const v = nutriments[n.key];
    const min = besoin?.[n.besoinMin];
    const max = besoin?.[n.besoinMax];
    let statut = '⚪', color = 'var(--textm)';
    if(min != null || max != null){
      if(min != null && v < Number(min) * 0.97){ statut = '🔴'; color = 'var(--red)'; }
      else if(max != null && v > Number(max) * 1.03){ statut = '🟠'; color = 'var(--gold)'; }
      else { statut = '🟢'; color = 'var(--green)'; }
    }
    const cible = (min != null && max != null)
      ? `${Number(min).toFixed(n.decimals)} – ${Number(max).toFixed(n.decimals)}`
      : (min != null ? `≥ ${Number(min).toFixed(n.decimals)}`
         : (max != null ? `≤ ${Number(max).toFixed(n.decimals)}` : '—'));
    return `<tr>
      <td style="font-size:10px">${n.label} <span style="color:var(--textm);font-size:9px">${n.unite}</span></td>
      <td class="num" style="color:${color};font-weight:700">${v.toFixed(n.decimals)}</td>
      <td class="num" style="color:var(--textm);font-size:9px">${cible}</td>
      <td>${statut}</td>
    </tr>`;
  }).join('')}</tbody></table>`;

  if(coutEl){
    coutEl.innerHTML = `<div style="display:flex;justify-content:space-between"><span style="color:var(--textm)">💰 Coût MP / tonne</span><strong style="color:var(--gold)">${fmt(Math.round(coutMP))} F</strong></div>`;
  }

  // Suggestions d'ajustement (Phase 2)
  _renderSuggestions(besoin, nutriments, espece);
}

// ── PHASE 2 : SUGGESTIONS INTELLIGENTES D'AJUSTEMENT ──
function _calculerSuggestions(besoin, nutriments, espece){
  if(!besoin || !espece) return [];
  const suggestions = [];

  for(const n of NUTRIMENTS){
    const v = nutriments[n.key];
    const min = besoin[n.besoinMin];
    const max = besoin[n.besoinMax];

    if(min != null && v < Number(min) * 0.97){
      // MANQUE → trouver MP riches dont on peut augmenter sans dépasser contrainte
      const ecart = Number(min) - v;
      const candidats = (GP_INGREDIENTS||[])
        .map(mp => {
          const richesse = Number(mp[n.key]) || 0;
          if(richesse <= 0) return null;
          const existing = MF_INGREDIENTS.find(i => i.id === mp.id);
          const pctActuel = existing?.pct || 0;
          const plafond = _plafondMP(espece, mp.nom);
          const margePct = plafond != null
            ? Math.max(0, plafond - pctActuel)
            : Math.max(0, 50 - pctActuel); // garde-fou
          // pct à ajouter pour combler l'écart : ecart / (richesse/100)
          const pctAjout = ecart * 100 / richesse;
          const pctAjoutPossible = Math.min(pctAjout, margePct);
          if(pctAjoutPossible <= 0.05) return null;
          const cout = pctAjoutPossible * 10 * (mp.prix_actuel || 0);
          return {
            mp, pctAjout: pctAjoutPossible,
            apportNutriment: pctAjoutPossible * richesse / 100,
            cout, plafond
          };
        })
        .filter(Boolean)
        .sort((a,b) => a.cout - b.cout)
        .slice(0, 3);
      if(candidats.length){
        suggestions.push({type:'manque', nutriment:n, ecart, candidats, decimals:n.decimals, unite:n.unite});
      }
    }

    if(max != null && v > Number(max) * 1.03){
      // EXCÈS → trouver MP riches qu'on pourrait réduire
      const exces = v - Number(max);
      const candidats = MF_INGREDIENTS
        .map(ing => {
          const mp = (GP_INGREDIENTS||[]).find(x => x.id === ing.id);
          if(!mp) return null;
          const richesse = Number(mp[n.key]) || 0;
          if(richesse <= 0) return null;
          // % à retirer pour redescendre sous le max
          const pctRetirer = exces * 100 / richesse;
          const pctRetirerPossible = Math.min(pctRetirer, ing.pct);
          if(pctRetirerPossible <= 0.05) return null;
          return {
            mp, pctActuel: ing.pct,
            pctRetirer: pctRetirerPossible,
            economie: pctRetirerPossible * 10 * (mp.prix_actuel || 0)
          };
        })
        .filter(Boolean)
        .sort((a,b) => b.economie - a.economie)
        .slice(0, 2);
      if(candidats.length){
        suggestions.push({type:'exces', nutriment:n, exces, candidats, decimals:n.decimals, unite:n.unite});
      }
    }
  }

  return suggestions;
}

function _renderSuggestions(besoin, nutriments, espece){
  // Insérer après le coût MP (créer le conteneur si absent)
  const coutEl = document.getElementById('mf-cout-mp');
  if(!coutEl) return;
  let sugEl = document.getElementById('mf-suggestions');
  if(!sugEl){
    sugEl = document.createElement('div');
    sugEl.id = 'mf-suggestions';
    sugEl.style.cssText = 'margin-top:10px;padding-top:10px;border-top:1px dashed var(--border)';
    coutEl.parentNode.appendChild(sugEl);
  }

  if(!besoin || !MF_INGREDIENTS.length){
    sugEl.innerHTML = '';
    return;
  }

  const sugs = _calculerSuggestions(besoin, nutriments, espece);
  if(!sugs.length){
    sugEl.innerHTML = '<div style="font-size:10px;color:var(--green)">✓ Aucun ajustement majeur nécessaire</div>';
    return;
  }

  sugEl.innerHTML = `
    <div style="font-size:11px;font-weight:700;color:var(--gold);margin-bottom:6px">💡 Suggestions d'ajustement</div>
    ${sugs.slice(0,5).map(s => {
      if(s.type === 'manque'){
        return `<div style="font-size:10px;background:rgba(239,68,68,.06);border-left:2px solid var(--red);padding:6px 8px;margin-bottom:5px;border-radius:4px">
          <div style="color:var(--red);font-weight:600">🔴 ${s.nutriment.label} : manque ${s.ecart.toFixed(s.decimals)} ${s.unite}</div>
          ${s.candidats.map(c => `
            <div style="display:flex;justify-content:space-between;align-items:center;margin-top:3px;gap:4px">
              <span style="font-size:10px;color:var(--text);flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${c.mp.nom}">+ ${c.mp.nom}</span>
              <button onclick="appliquerSuggestion('${c.mp.id}','${c.mp.nom.replace(/'/g,"\\'").replace(/"/g,'&quot;')}',${c.pctAjout.toFixed(2)})"
                style="background:rgba(22,163,74,.15);color:var(--green);border:1px solid rgba(22,163,74,.4);border-radius:4px;padding:2px 6px;cursor:pointer;font-size:9px;font-family:'Outfit',sans-serif">
                +${c.pctAjout.toFixed(1)}% (~${fmt(Math.round(c.cout))}F)
              </button>
            </div>`).join('')}
        </div>`;
      } else {
        return `<div style="font-size:10px;background:rgba(245,158,11,.06);border-left:2px solid var(--gold);padding:6px 8px;margin-bottom:5px;border-radius:4px">
          <div style="color:var(--gold);font-weight:600">🟠 ${s.nutriment.label} : excès ${s.exces.toFixed(s.decimals)} ${s.unite}</div>
          ${s.candidats.map(c => `
            <div style="display:flex;justify-content:space-between;align-items:center;margin-top:3px;gap:4px">
              <span style="font-size:10px;color:var(--text);flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${c.mp.nom}">− ${c.mp.nom}</span>
              <button onclick="appliquerReduction('${c.mp.id}',${c.pctRetirer.toFixed(2)})"
                style="background:rgba(245,158,11,.15);color:var(--gold);border:1px solid rgba(245,158,11,.4);border-radius:4px;padding:2px 6px;cursor:pointer;font-size:9px;font-family:'Outfit',sans-serif">
                −${c.pctRetirer.toFixed(1)}% (~${fmt(Math.round(c.economie))}F éco.)
              </button>
            </div>`).join('')}
        </div>`;
      }
    }).join('')}
  `;
}

// Applique une suggestion : ajoute la MP si absente, ou augmente son pct
function appliquerSuggestion(mpId, mpNom, pctAjout){
  const idx = MF_INGREDIENTS.findIndex(i => i.id === mpId);
  if(idx >= 0){
    MF_INGREDIENTS[idx].pct = Math.round((MF_INGREDIENTS[idx].pct + Number(pctAjout)) * 100) / 100;
  } else {
    MF_INGREDIENTS.push({ id: mpId, nom: mpNom, pct: Number(pctAjout) });
  }
  _renderMFIngredients();
  _renderAnalyseNutritionnelle();
}

// ══════════════════════════════════════════════════
// PHASE 3 : OPTIMISATION SIMPLEX (formulation auto)
// ══════════════════════════════════════════════════
let OPT_MP_SELECTION = new Set();  // IDs des MP cochées par l'utilisateur

function ouvrirOptimiseur(){
  const espece = document.getElementById('mf_espece')?.value;
  const categorie = document.getElementById('mf_categorie')?.value;
  if(!espece || !categorie){
    notify('Choisissez d\'abord une espèce et une catégorie','r');
    return;
  }
  const besoin = (GP_BESOINS||[]).find(b => b.espece === espece && b.categorie === categorie);
  if(!besoin){
    notify('Aucun besoin nutritionnel défini pour cette espèce/catégorie','r');
    return;
  }
  const especeData = (GP_CATEGORIES||[]).find(c => c.espece === espece);
  const catData = (GP_CATEGORIES||[]).find(c => c.espece === espece && c.categorie === categorie);
  document.getElementById('opt-contexte').textContent =
    `${especeData?.espece_icon||''} ${especeData?.espece_label||espece} · ${catData?.categorie_label||categorie}`;

  // Pré-sélectionner les MP déjà dans la formule
  OPT_MP_SELECTION = new Set(MF_INGREDIENTS.map(i => i.id));
  // Par défaut, si aucune MP saisie, présélectionner les MP basiques courantes
  if(OPT_MP_SELECTION.size === 0){
    const patterns = ['mais','tourteau de soja','son de ble','tourteau de palmiste',
      'foin','luzerne','phosphate','carbonate','coquilles huitres','sel','premix','lysine','methionine'];
    for(const p of patterns){
      const mp = (GP_INGREDIENTS||[]).find(i => normalizeSearch(i.nom).includes(p));
      if(mp) OPT_MP_SELECTION.add(mp.id);
    }
  }

  document.getElementById('opt-err').textContent = '';
  document.getElementById('opt-search').value = '';
  renderOptMPListe();
  document.getElementById('modal-optimiseur').style.display = 'flex';
}

function fermerOptimiseur(){
  document.getElementById('modal-optimiseur').style.display = 'none';
}

function renderOptMPListe(){
  const q = normalizeSearch(document.getElementById('opt-search')?.value || '');
  const liste = (GP_INGREDIENTS||[])
    .filter(i => !q || normalizeSearch(i.nom).includes(q))
    .sort((a,b) => a.nom.localeCompare(b.nom));

  const el = document.getElementById('opt-mp-liste');
  el.innerHTML = liste.length ? liste.map(i => {
    const checked = OPT_MP_SELECTION.has(i.id);
    const prot = i.proteines || 0;
    const em = i.energie || 0;
    const hasData = prot > 0 || em > 0;
    const dataInfo = hasData
      ? `PB ${prot}% · EM ${em} · ${fmt(i.prix_actuel||0)} F/kg`
      : `⚠ Valeurs manquantes · ${fmt(i.prix_actuel||0)} F/kg`;
    return `<label style="display:grid;grid-template-columns:auto 1fr;gap:8px;padding:6px 8px;cursor:pointer;border-radius:5px;${checked?'background:rgba(168,85,247,.1);':''}">
      <input type="checkbox" ${checked?'checked':''} onchange="optToggleMP('${i.id}',this.checked)">
      <div>
        <div style="font-size:11px;font-weight:600">${i.nom}</div>
        <div style="font-size:9px;color:var(--textm)">${dataInfo}</div>
      </div>
    </label>`;
  }).join('') : '<div style="color:var(--textm);font-size:11px;padding:10px;text-align:center">Aucun résultat</div>';

  document.getElementById('opt-compteur').textContent = OPT_MP_SELECTION.size;
}

function optToggleMP(id, checked){
  if(checked) OPT_MP_SELECTION.add(id);
  else OPT_MP_SELECTION.delete(id);
  document.getElementById('opt-compteur').textContent = OPT_MP_SELECTION.size;
}

function optToggleAll(state){
  const q = normalizeSearch(document.getElementById('opt-search')?.value || '');
  const liste = (GP_INGREDIENTS||[]).filter(i => !q || normalizeSearch(i.nom).includes(q));
  for(const i of liste){
    if(state) OPT_MP_SELECTION.add(i.id);
    else OPT_MP_SELECTION.delete(i.id);
  }
  renderOptMPListe();
}

// ── CONSTRUCTION DU MODÈLE LP ─────────────────────────
function _construireModeleLP(espece, categorie, mpSelectionnees){
  const besoin = (GP_BESOINS||[]).find(b => b.espece === espece && b.categorie === categorie);
  if(!besoin) return null;

  const variables = {};
  const constraints = { total: { equal: 100 } };

  // Contraintes nutritionnelles
  for(const n of NUTRIMENTS){
    const minVal = besoin[n.besoinMin];
    const maxVal = besoin[n.besoinMax];
    const c = {};
    if(minVal != null) c.min = Number(minVal);
    if(maxVal != null) c.max = Number(maxVal);
    if(Object.keys(c).length) constraints[n.key] = c;
  }

  // Contraintes MP × espèce (max et min par MP)
  for(const mp of mpSelectionnees){
    const contraintes = _contraintesMP(espece, mp.nom);
    for(const c of contraintes){
      if(c.pct_max != null) constraints[`mpmax_${mp.id}`] = { max: Number(c.pct_max) };
      if(c.pct_min != null) constraints[`mpmin_${mp.id}`] = { min: Number(c.pct_min) };
    }
  }

  // Variables (1 par MP sélectionnée)
  for(const mp of mpSelectionnees){
    const v = {
      cout: Number(mp.prix_actuel || 0),
      total: 1,
    };
    // Coefficients nutritionnels : nutriment_i / 100 (car x_i en %)
    for(const n of NUTRIMENTS){
      const val = Number(mp[n.key]) || 0;
      v[n.key] = val / 100;
    }
    // Coefficients de contraintes MP
    if(constraints[`mpmax_${mp.id}`]) v[`mpmax_${mp.id}`] = 1;
    if(constraints[`mpmin_${mp.id}`]) v[`mpmin_${mp.id}`] = 1;
    variables[mp.id] = v;
  }

  return {
    optimize: 'cout',
    opType: 'min',
    constraints,
    variables,
  };
}

// ── DIAGNOSTIC D'INFAISABILITÉ ────────────────────────
function _diagnosticInfaisabilite(espece, categorie, mpSelectionnees){
  const besoin = (GP_BESOINS||[]).find(b => b.espece === espece && b.categorie === categorie);
  const issues = [];

  // 1. Vérifier que les nutriments critiques peuvent être atteints avec les MP sélectionnées
  for(const n of NUTRIMENTS){
    const minCible = besoin?.[n.besoinMin];
    if(minCible == null) continue;
    // Apport max théorique : max nutriment_i de toutes les MP sélectionnées
    const maxApport = Math.max(0, ...mpSelectionnees.map(mp => Number(mp[n.key]) || 0));
    if(maxApport < Number(minCible)){
      issues.push(`Aucune MP sélectionnée ne contient assez de <strong>${n.label}</strong> (besoin min ${minCible} ${n.unite}, meilleure MP : ${maxApport})`);
    }
  }

  // 2. Contraintes MP qui empêchent la formule
  for(const mp of mpSelectionnees){
    const c = _contraintesMP(espece, mp.nom);
    for(const ct of c){
      if(ct.pct_min != null && Number(ct.pct_min) > 100){
        issues.push(`Contrainte min de ${mp.nom} > 100% — incohérent`);
      }
    }
  }

  // 3. Vérifier que les seuils ne sont pas mutuellement exclusifs
  if(besoin){
    if(besoin.pb_min != null && besoin.pb_max != null && besoin.pb_min > besoin.pb_max){
      issues.push('PB min > PB max — besoin incohérent');
    }
  }

  if(!issues.length){
    issues.push('Les contraintes combinées sont incompatibles. Essayez de :');
    issues.push('• Ajouter plus de MP variées (surtout sources de protéines)');
    issues.push('• Vérifier les besoins de l\'espèce/catégorie');
    issues.push('• Assouplir les contraintes d\'incorporation');
  }

  return issues;
}

// ── LANCEMENT DE L'OPTIMISATION ───────────────────────
function lancerOptimisation(){
  const errEl = document.getElementById('opt-err');
  errEl.innerHTML = '';

  if(typeof solver === 'undefined'){
    errEl.innerHTML = '<span style="color:var(--red)">⚠ Solveur non chargé. Rechargez la page (Ctrl+Shift+R).</span>';
    return;
  }

  if(OPT_MP_SELECTION.size < 3){
    errEl.innerHTML = '<span style="color:var(--red)">⚠ Sélectionnez au moins 3 matières premières.</span>';
    return;
  }

  const espece = document.getElementById('mf_espece')?.value;
  const categorie = document.getElementById('mf_categorie')?.value;
  const mpSelectionnees = (GP_INGREDIENTS||[]).filter(mp => OPT_MP_SELECTION.has(mp.id));

  const model = _construireModeleLP(espece, categorie, mpSelectionnees);
  if(!model){
    errEl.innerHTML = '<span style="color:var(--red)">⚠ Impossible de construire le modèle.</span>';
    return;
  }

  let result;
  try {
    result = solver.Solve(model);
  } catch(e){
    errEl.innerHTML = '<span style="color:var(--red)">⚠ Erreur solveur : ' + e.message + '</span>';
    return;
  }

  if(!result.feasible){
    const issues = _diagnosticInfaisabilite(espece, categorie, mpSelectionnees);
    errEl.innerHTML = `<div style="background:rgba(239,68,68,.08);border:1px solid rgba(239,68,68,.3);border-radius:8px;padding:12px;font-size:11px">
      <div style="font-weight:700;color:var(--red);margin-bottom:8px">❌ Aucune solution mathématique trouvée</div>
      <div style="color:var(--textm);line-height:1.6">${issues.map(i=>`<div>${i}</div>`).join('')}</div>
    </div>`;
    return;
  }

  // Solution trouvée → appliquer
  const nouveau = [];
  for(const mp of mpSelectionnees){
    const pct = result[mp.id] || 0;
    if(pct > 0.01){
      nouveau.push({ id: mp.id, nom: mp.nom, pct: Math.round(pct * 100) / 100 });
    }
  }

  if(!nouveau.length){
    errEl.innerHTML = '<span style="color:var(--red)">⚠ Solveur retourne une formule vide.</span>';
    return;
  }

  MF_INGREDIENTS = nouveau;
  _renderMFIngredients();
  _renderAnalyseNutritionnelle();
  fermerOptimiseur();
  notify(`🎯 Formule optimisée — ${nouveau.length} MP, coût ${fmt(Math.round(result.result*10))} F/t`, 'gold');
}

// Applique une réduction : retire pct d'une MP existante
function appliquerReduction(mpId, pctRetirer){
  const idx = MF_INGREDIENTS.findIndex(i => i.id === mpId);
  if(idx >= 0){
    const nouveau = MF_INGREDIENTS[idx].pct - Number(pctRetirer);
    if(nouveau <= 0.01){
      MF_INGREDIENTS.splice(idx, 1);
    } else {
      MF_INGREDIENTS[idx].pct = Math.round(nouveau * 100) / 100;
    }
    _renderMFIngredients();
    _renderAnalyseNutritionnelle();
  }
}

// ── AJOUT ESPÈCE / CATÉGORIE ────────────────────
function ouvrirAjoutEspece(){
  ['ae_code','ae_label','ae_icon'].forEach(id => document.getElementById(id).value = '');
  document.getElementById('ae_err').textContent = '';
  document.getElementById('modal-ajout-espece').style.display = 'flex';
}

async function saveAjoutEspece(){
  const err = document.getElementById('ae_err');
  const code = document.getElementById('ae_code').value.trim().toLowerCase().replace(/\s+/g,'_');
  const label = document.getElementById('ae_label').value.trim();
  const icon = document.getElementById('ae_icon').value.trim() || '📦';
  if(!code || !label){ err.textContent = 'Code et nom requis.'; return; }
  const{error} = await SB.from('gp_categories_aliment').insert({
    admin_id: GP_ADMIN_ID, espece: code, espece_label: label, espece_icon: icon,
    categorie: 'standard', categorie_label: 'Standard', ordre: 1
  });
  if(error){ err.textContent = 'Erreur : ' + error.message; return; }
  await loadCategoriesAliment();
  _remplirSelectEspeceMF();
  document.getElementById('mf_espece').value = code;
  onChangeEspeceMF();
  document.getElementById('modal-ajout-espece').style.display = 'none';
  notify(`Espèce ${label} ajoutée ✓`, 'gold');
}

function ouvrirAjoutCategorie(){
  const espece = document.getElementById('mf_espece').value;
  if(!espece){ notify('Choisissez une espèce d\'abord', 'r'); return; }
  const especeData = (GP_CATEGORIES||[]).find(c => c.espece === espece);
  document.getElementById('ac-espece-label').textContent =
    `Pour : ${especeData?.espece_icon||''} ${especeData?.espece_label||espece}`;
  ['ac_code','ac_label'].forEach(id => document.getElementById(id).value = '');
  document.getElementById('ac_err').textContent = '';
  document.getElementById('modal-ajout-categorie').style.display = 'flex';
}

async function saveAjoutCategorie(){
  const err = document.getElementById('ac_err');
  const espece = document.getElementById('mf_espece').value;
  const code = document.getElementById('ac_code').value.trim().toLowerCase().replace(/\s+/g,'_');
  const label = document.getElementById('ac_label').value.trim();
  if(!code || !label || !espece){ err.textContent = 'Code et nom requis.'; return; }
  const especeData = (GP_CATEGORIES||[]).find(c => c.espece === espece);
  const ordre = Math.max(0, ...((GP_CATEGORIES||[]).filter(c => c.espece === espece).map(c => c.ordre||0))) + 1;
  const{error} = await SB.from('gp_categories_aliment').insert({
    admin_id: GP_ADMIN_ID, espece, espece_label: especeData?.espece_label,
    espece_icon: especeData?.espece_icon, categorie: code, categorie_label: label, ordre
  });
  if(error){ err.textContent = 'Erreur : ' + error.message; return; }
  await loadCategoriesAliment();
  onChangeEspeceMF();
  document.getElementById('mf_categorie').value = code;
  onChangeCategorieMF();
  document.getElementById('modal-ajout-categorie').style.display = 'none';
  notify(`Catégorie ${label} ajoutée ✓`, 'gold');
}

async function saveFormule(){
  const err=document.getElementById('mf_err');
  err.textContent='';
  const id = document.getElementById('mf_id').value || null;
  const nom = document.getElementById('mf_nom').value.trim();
  const espece = document.getElementById('mf_espece').value;
  const stade = document.getElementById('mf_categorie')?.value || null;  // code catégorie
  const prix = +document.getElementById('mf_prix').value || 0;
  const emb = +document.getElementById('mf_emb').value || 0;
  const mo = +document.getElementById('mf_mo').value || 0;
  const trans = +document.getElementById('mf_trans').value || 0;

  if(!nom){ err.textContent='Nom requis.'; return; }
  if(!MF_INGREDIENTS.length){ err.textContent='Ajoutez au moins une matière première.'; return; }

  const total = MF_INGREDIENTS.reduce((s,i)=>s+Number(i.pct||0),0);
  if(Math.abs(total-100) > 0.5){
    if(!confirm(`Le total est ${total.toFixed(2)}% (pas 100%). Enregistrer quand même ?`)) return;
  }

  // Stocker la composition avec nom + pct (id en bonus si dispo)
  const composition = MF_INGREDIENTS.map(i => ({ nom: i.nom, pct: i.pct, id: i.id || null }));
  const payload = {
    admin_id: GP_ADMIN_ID,
    nom, espece, stade,
    prix_defaut: prix,
    ingredients: composition,
    cout_emballage_kg: emb,
    cout_mo_tonne: mo,
    cout_transport_lot: trans,
    actif: true,
  };

  if(id){
    const { error } = await SB.from('gp_formules').update(payload).eq('id', id);
    if(error){ err.textContent='Erreur: '+error.message; return; }
  } else {
    const { error } = await SB.from('gp_formules').insert(payload);
    if(error){ err.textContent='Erreur: '+error.message; return; }
  }

  // Aligner le prix de vente dans gp_prix_formules
  if(prix){
    await SB.from('gp_prix_formules').upsert(
      { admin_id: GP_ADMIN_ID, formule_nom: nom, prix },
      { onConflict: 'admin_id,formule_nom' }
    );
    GP_PRIX[nom] = prix;
  }

  fermerModalFormule();
  await loadFormules();
  populateSelects();
  renderPrixFormules();
  if(typeof renderCustomFormules === 'function') renderCustomFormules();
  notify(`Formule "${nom}" ${id?'mise à jour':'créée'} ✓`, 'gold');
}

async function supprimerFormule(id){
  const f = FORMULES_SADARI.find(x=>x.id===id);
  if(!f) return;
  if(!confirm(`Supprimer la formule "${f.nom}" ?\n\nElle ne sera plus disponible à la production / vente.\nL'historique des lots/ventes existants reste préservé.`)) return;
  // Soft delete : actif=false, pour ne pas casser les FK
  const { error } = await SB.from('gp_formules').update({ actif: false }).eq('id', id);
  if(error){ notify('Erreur: '+error.message, 'r'); return; }
  await loadFormules();
  populateSelects();
  renderPrixFormules();
  if(typeof renderCustomFormules === 'function') renderCustomFormules();
  notify(`Formule "${f.nom}" supprimée`, 'r');
}

function renderCustomFormules(){
  const el = document.getElementById('custom-formules-liste');
  if(!el) return;
  if(!FORMULES_SADARI.length){
    el.innerHTML = `
      <div style="font-size:12px;color:var(--textm);padding:14px;text-align:center;background:rgba(14,20,40,.4);border:1px dashed var(--border);border-radius:8px">
        Aucune formule encore créée.<br>
        <span style="font-size:10px">Cliquez sur <strong>➕ Nouvelle formule</strong> pour commencer.</span>
      </div>`;
    return;
  }
  el.innerHTML = FORMULES_SADARI.map(f => `
    <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 12px;background:rgba(14,20,40,.4);border:1px solid var(--border);border-radius:8px;margin-bottom:6px">
      <div style="flex:1;min-width:0">
        <div style="font-weight:600;font-size:12px">${ESPECE_ICON[f.espece]||'📦'} ${f.nom}</div>
        <div style="font-size:10px;color:var(--textm)">${f.stade||'—'} · ${f.ingredients?.length||0} MP · ${fmt(f.prix_defaut)} F/kg</div>
      </div>
      <div style="display:flex;gap:4px">
        <button class="btn btn-out btn-sm" onclick="editerFormule('${f.id}')" style="padding:4px 8px">✏️</button>
        <button class="btn btn-red btn-sm" onclick="supprimerFormule('${f.id}')" style="padding:4px 8px">✕</button>
      </div>
    </div>`).join('');
}

// ── ÉQUIPE ─────────────────────────────────────────
// (deleteMembre est défini plus bas — version unique et complète)

// ── CONFIG ─────────────────────────────────────────
function applyColor(c){
  document.documentElement.style.setProperty('--g4',c);
  document.documentElement.style.setProperty('--g5',c);
}
function applyLogo(url){
  const tb=document.getElementById('tb-logo');
  if(tb)tb.innerHTML=`<img src="${url}" style="width:30px;height:30px;object-fit:contain;border-radius:6px">`;
  const preview=document.getElementById('cfg-logo-preview');
  if(preview)preview.innerHTML=`<img src="${url}" style="width:90px;height:90px;object-fit:contain;border-radius:12px;margin:0 auto 8px;display:block">`;
}

// ── ANIMATION COUNT-UP DES KPI ────────────────────
// Anime le contenu numérique des .stat-val et .econo-val depuis 0 jusqu'à leur valeur finale.
// Idempotent : ne ré-anime pas un élément déjà animé dans la session.
function animateKpis(root){
  const scope = root || document;
  const els = scope.querySelectorAll('.stat-val, .econo-val');
  els.forEach(el => {
    if(el.dataset.animDone === '1') return;
    const finalTxt = el.textContent;
    const m = finalTxt.match(/-?\d[\d\s.,]*/);
    if(!m) return;
    const cleaned = m[0].replace(/\s/g,'').replace(/\.(?=\d{3}\b)/g,'').replace(',','.');
    const target = parseFloat(cleaned);
    if(!isFinite(target) || Math.abs(target) < 5){el.dataset.animDone='1';return;}
    const prefix = finalTxt.slice(0, m.index);
    const suffix = finalTxt.slice(m.index + m[0].length);
    el.dataset.animDone = '1';
    const start = performance.now();
    const dur = 650;
    const fmtFr = n => new Intl.NumberFormat('fr-FR').format(Math.round(n));
    function tick(now){
      const t = Math.min(1, (now-start)/dur);
      const eased = 1 - Math.pow(1-t, 3);
      el.textContent = prefix + fmtFr(target * eased) + suffix;
      if(t < 1) requestAnimationFrame(tick);
      else el.textContent = finalTxt;
    }
    requestAnimationFrame(tick);
  });
}

// ── THÈME CLAIR/SOMBRE ────────────────────────────
function toggleTheme(){
  const cur=document.documentElement.getAttribute('data-theme')||'dark';
  const next=cur==='dark'?'light':'dark';
  document.documentElement.setAttribute('data-theme',next);
  try{localStorage.setItem('gp_theme',next);}catch(e){}
  const btn=document.getElementById('theme-toggle-btn');
  if(btn)btn.textContent=next==='dark'?'🌙':'☀️';
}

// ── EXTRACTION COULEUR DOMINANTE DU LOGO ──────────
// Prend un File (image) et renvoie une string '#RRGGBB' représentant la couleur dominante.
// Ignore les pixels trop clairs (proche blanc), trop sombres (proche noir) et trop gris.
function extraireCouleurDominante(file){
  return new Promise((resolve,reject)=>{
    const reader=new FileReader();
    reader.onerror=()=>reject('fichier illisible');
    reader.onload=()=>{
      const img=new Image();
      img.onload=()=>{
        try{
          const canvas=document.createElement('canvas');
          const size=60;
          canvas.width=size;canvas.height=size;
          const ctx=canvas.getContext('2d');
          ctx.drawImage(img,0,0,size,size);
          const data=ctx.getImageData(0,0,size,size).data;
          const buckets={};
          for(let i=0;i<data.length;i+=4){
            const r=data[i],g=data[i+1],b=data[i+2],a=data[i+3];
            if(a<200)continue;
            const max=Math.max(r,g,b),min=Math.min(r,g,b);
            if(max>240&&min>240)continue; // proche blanc
            if(max<25)continue; // proche noir
            if(max-min<20)continue; // proche gris
            const key=`${r>>5},${g>>5},${b>>5}`;
            buckets[key]=(buckets[key]||0)+1;
          }
          const sorted=Object.entries(buckets).sort((a,b)=>b[1]-a[1]);
          if(!sorted.length)return reject('aucune couleur dominante');
          const [r,g,b]=sorted[0][0].split(',').map(n=>Math.min(255,(+n*32)+16));
          const hex='#'+[r,g,b].map(n=>n.toString(16).padStart(2,'0')).join('');
          resolve(hex);
        }catch(e){reject(e);}
      };
      img.onerror=()=>reject('image invalide');
      img.src=reader.result;
    };
    reader.readAsDataURL(file);
  });
}
async function loadConfigForm(){
  if(GP_CONFIG.nom_provenderie)document.getElementById('cfg_nom').value=GP_CONFIG.nom_provenderie;
  if(GP_CONFIG.slogan)document.getElementById('cfg_slogan').value=GP_CONFIG.slogan;
  if(GP_CONFIG.telephone)document.getElementById('cfg_tel').value=GP_CONFIG.telephone;
  if(GP_CONFIG.email)document.getElementById('cfg_email').value=GP_CONFIG.email;
  if(GP_CONFIG.localisation)document.getElementById('cfg_loc').value=GP_CONFIG.localisation;
  if(GP_CONFIG.couleur)document.getElementById('cfg_couleur').value=GP_CONFIG.couleur;
  if(GP_CONFIG.tel_alerte_stock)document.getElementById('cfg_tel_alerte').value=GP_CONFIG.tel_alerte_stock;
  if(GP_CONFIG.logo_url)applyLogo(GP_CONFIG.logo_url);
}
async function saveConfig(){
  const nom=document.getElementById('cfg_nom').value.trim();
  const err=document.getElementById('cfg_err');const ok=document.getElementById('cfg_ok');
  if(!nom){err.textContent='Nom requis.';return;}
  const couleur=document.getElementById('cfg_couleur').value;
  const telAlerte=document.getElementById('cfg_tel_alerte')?.value.trim()||null;
  const{error}=await SB.from('gp_config').upsert({
    user_id:GP_ADMIN_ID,nom_provenderie:nom,
    slogan:document.getElementById('cfg_slogan').value.trim(),
    telephone:document.getElementById('cfg_tel').value.trim(),
    email:document.getElementById('cfg_email').value.trim(),
    localisation:document.getElementById('cfg_loc').value.trim(),
    couleur,logo_url:GP_CONFIG.logo_url||null,
    tel_alerte_stock:telAlerte
  },{onConflict:'user_id'});
  if(error){err.textContent='Erreur: '+error.message;return;}
  GP_CONFIG.nom_provenderie=nom;GP_CONFIG.couleur=couleur;
  if(telAlerte)GP_CONFIG.tel_alerte_stock=telAlerte;
  document.getElementById('tb-name').textContent=nom;
  applyColor(couleur);
  err.textContent='';ok.textContent='✓ Configuration sauvegardée !';
  setTimeout(()=>ok.textContent='',3000);
  notify('Configuration mise à jour ✓','gold');
}
async function saveRemiseMax(){
  const val=+document.getElementById('cfg_remise_max').value||5;
  GP_REMISE_MAX=val;
  await SB.from('gp_config').upsert({user_id:GP_ADMIN_ID,remise_max:val},{onConflict:'user_id'});
  notify(`Remise max : ${val}% ✓`,'gold');
}
async function uploadLogo(){
  const file=document.getElementById('cfg_logo').files?.[0];
  const err=document.getElementById('logo_err');const ok=document.getElementById('logo_ok');
  if(!file){err.textContent='Sélectionnez un fichier.';return;}
  if(file.size>2*1024*1024){err.textContent='Max 2MB.';return;}
  err.textContent='Upload...';
  const ext=file.name.split('.').pop();
  const path=`logos/${GP_ADMIN_ID}/logo.${ext}`;
  const{error:upErr}=await SB.storage.from('gp-logos').upload(path,file,{upsert:true});
  if(upErr){err.textContent='Erreur: '+upErr.message;return;}
  const{data:urlData}=SB.storage.from('gp-logos').getPublicUrl(path);
  const logo_url=urlData?.publicUrl;

  // Extraire la couleur dominante du logo pour l'utiliser comme accent
  let couleurExtraite=null;
  try{
    couleurExtraite=await extraireCouleurDominante(file);
  }catch(e){console.warn('Extraction couleur logo échouée:',e);}

  const upd={user_id:GP_ADMIN_ID,logo_url};
  if(couleurExtraite) upd.couleur=couleurExtraite;
  await SB.from('gp_config').upsert(upd,{onConflict:'user_id'});
  GP_CONFIG.logo_url=logo_url;
  if(couleurExtraite){
    GP_CONFIG.couleur=couleurExtraite;
    applyColor(couleurExtraite);
    const colorEl=document.getElementById('cfg_couleur');
    if(colorEl)colorEl.value=couleurExtraite;
  }
  applyLogo(logo_url);
  err.textContent='';
  ok.textContent=couleurExtraite?`✓ Logo + couleur ${couleurExtraite} appliqués !`:'✓ Logo mis à jour !';
  setTimeout(()=>ok.textContent='',3500);
  notify('Logo uploadé ✓','gold');
}

// ══════════════════════════════════════════════════
// POINTS DE VENTE & ÉQUIPE
// ══════════════════════════════════════════════════


// ── BADGE COULEUR PAR POINT DE VENTE ──────────────
const PDV_PALETTES = [
  {bg:'#1e3a5f', border:'#3b82f6', text:'#93c5fd', emoji:'🔵'},
  {bg:'#3b1f5e', border:'#a855f7', text:'#d8b4fe', emoji:'🟣'},
  {bg:'#7c2d12', border:'#f97316', text:'#fdba74', emoji:'🟠'},
  {bg:'#164e2e', border:'#22c55e', text:'#86efac', emoji:'🟢'},
  {bg:'#7f1d1d', border:'#ef4444', text:'#fca5a5', emoji:'🔴'},
  {bg:'#1e3a5f', border:'#06b6d4', text:'#67e8f9', emoji:'🩵'},
  {bg:'#4a1942', border:'#ec4899', text:'#f9a8d4', emoji:'🩷'},
  {bg:'#78350f', border:'#f59e0b', text:'#fde68a', emoji:'🟡'},
  {bg:'#1a3a3a', border:'#14b8a6', text:'#5eead4', emoji:'🩵'},
  {bg:'#1f2937', border:'#6366f1', text:'#a5b4fc', emoji:'🔷'},
];

function pvPalette(nom){
  let hash=0;
  for(let i=0;i<nom.length;i++) hash=(hash*31+nom.charCodeAt(i))>>>0;
  return PDV_PALETTES[hash % PDV_PALETTES.length];
}

function pvBadgeHtml(nom, size='sm'){
  const p=pvPalette(nom);
  const fs=size==='lg'?'13px':'11px';
  const pad=size==='lg'?'5px 14px':'3px 10px';
  return `<span style="background:${p.bg};color:${p.text};border:1px solid ${p.border};padding:${pad};border-radius:20px;font-size:${fs};font-weight:700;white-space:nowrap">${p.emoji} ${nom}</span>`;
}

// (ouvrirModalEq / fermerModalEq sont définis plus bas — version unique)

function localisermoi(){
  if(!navigator.geolocation){notify('GPS non disponible','r');return;}
  notify('Récupération de votre position...','gold');
  navigator.geolocation.getCurrentPosition(
    pos=>{
      document.getElementById('pv_lat').value=pos.coords.latitude.toFixed(6);
      document.getElementById('pv_lng').value=pos.coords.longitude.toFixed(6);
      notify('Position GPS obtenue ✓','gold');
    },
    ()=>notify('Impossible d\'obtenir la position GPS','r')
  );
}

async function savePDV(){
  if(GP_ROLE!=='admin'){notify('Action réservée à l\'administrateur','r');return;}
  const nom=document.getElementById('pv_nom')?.value.trim();
  const tel=document.getElementById('pv_tel')?.value.trim()||null;
  const adresse=document.getElementById('pv_adresse')?.value.trim()||null;
  const lat=parseFloat(document.getElementById('pv_lat')?.value)||null;
  const lng=parseFloat(document.getElementById('pv_lng')?.value)||null;
  const err=document.getElementById('pv_err');
  if(!nom){err.textContent='Nom requis.';return;}
  const typePdv=document.getElementById('pv_type')?.value||'secondaire';
  const secSalariee=document.getElementById('pv_sec_type')?.value==='true';
  const whatsapp=document.getElementById('pv_whatsapp')?.value.trim()||null;
  const responsable=document.getElementById('pv_responsable')?.value.trim()||null;
  const{error}=await SB.from('gp_points_vente').insert({
    admin_id:GP_ADMIN_ID,nom,telephone:tel,whatsapp,responsable,adresse,
    latitude:lat,longitude:lng,
    type_pdv:typePdv,
    secretaire_salariee:secSalariee
  });
  if(error){err.textContent='Erreur: '+error.message;return;}
  // Créer automatiquement la caisse physique du PDV
  await SB.from('gp_caisses').insert({
    admin_id:GP_ADMIN_ID,
    nom:'Caisse '+nom,
    type:'physique',
    point_vente:nom,
    solde_initial:0,
    solde_actuel:0,
    couleur:pvPalette(nom).border,
    actif:true
  });
  ['pv_nom','pv_tel','pv_whatsapp','pv_responsable','pv_adresse','pv_lat','pv_lng'].forEach(id=>{
    const el=document.getElementById(id);if(el)el.value='';
  });
  err.textContent='';
  await renderPDV();
  notify('Point de vente "'+nom+'" créé avec sa caisse ✓','gold');
}

async function deletePDV(id,nom){
  if(GP_ROLE!=='admin'){notify('Action réservée à l\'administrateur','r');return;}
  if(!confirm(`Supprimer le point de vente "${nom}" ?\nLes membres assignés passeront au siège principal.`))return;
  // Retirer le point_vente des membres
  await SB.from('gp_membres').update({point_vente:null}).eq('admin_id',GP_ADMIN_ID).eq('point_vente',nom);
  await SB.from('gp_points_vente').delete().eq('id',id);
  await renderPDV();
  notify('Point de vente supprimé','r');
}

// ── COÛTS DE PRODUCTION PAR FORMULE ──────────────
function editerCoutsFormule(formuleNom){
  const f=getAllFormules().find(x=>x.nom===formuleNom);
  if(!f)return;
  const modal=document.getElementById('modal-couts-formule');
  document.getElementById('cf-formule-nom').textContent=formuleNom;
  document.getElementById('cf-emballage').value=f.cout_emballage_kg||0;
  document.getElementById('cf-mo').value=f.cout_mo_tonne||0;
  document.getElementById('cf-transport').value=f.cout_transport_lot||0;
  document.getElementById('cf-avec-emballage').checked=f.avec_emballage!==false;
  document.getElementById('cf-avec-transport').checked=f.avec_transport===true;
  document.getElementById('cf-formule-id').value=f.id||'';
  document.getElementById('cf-formule-nom-hidden').value=formuleNom;
  modal.style.display='flex';
}

async function saveCoutsFormule(){
  const id=document.getElementById('cf-formule-id')?.value;
  const nom=document.getElementById('cf-formule-nom-hidden')?.value;
  const emballage=+document.getElementById('cf-emballage')?.value||0;
  const mo=+document.getElementById('cf-mo')?.value||0;
  const transport=+document.getElementById('cf-transport')?.value||0;
  const avecEmb=document.getElementById('cf-avec-emballage')?.checked;
  const avecTrans=document.getElementById('cf-avec-transport')?.checked;

  if(id){
    await SB.from('gp_formules').update({
      cout_emballage_kg:emballage,
      cout_mo_tonne:mo,
      cout_transport_lot:transport,
      avec_emballage:avecEmb,
      avec_transport:avecTrans
    }).eq('id',id);
  }
  // Mettre à jour FORMULES_SADARI en mémoire aussi
  const f=getAllFormules().find(x=>x.nom===nom);
  if(f){
    f.cout_emballage_kg=emballage;
    f.cout_mo_tonne=mo;
    f.cout_transport_lot=transport;
    f.avec_emballage=avecEmb;
    f.avec_transport=avecTrans;
  }
  document.getElementById('modal-couts-formule').style.display='none';
  renderPrixFormules();
  notify('Coûts de production mis à jour ✓','gold');
}async function renderPrixFormules(){
  const all=getAllFormules();
  // Grouper par espèce
  const groups={};
  all.forEach(f=>{
    if(!groups[f.espece])groups[f.espece]=[];
    groups[f.espece].push(f);
  });

  document.getElementById('prix-formules-liste').innerHTML=`
    ${Object.entries(groups).map(([esp,formules])=>`
      <div class="formule-groupe" style="margin-bottom:8px;border:1px solid var(--border);border-radius:10px;overflow:hidden">
        <div onclick="toggleGroupe('grp-${esp}')"
          style="display:flex;justify-content:space-between;align-items:center;padding:10px 14px;background:rgba(22,163,74,.08);cursor:pointer;user-select:none">
          <div style="font-weight:700;font-size:13px">${ESPECE_ICON[esp]||'🌾'} ${esp.charAt(0).toUpperCase()+esp.slice(1)} <span style="font-size:11px;color:var(--textm);font-weight:400">(${formules.length} formule${formules.length>1?'s':''})</span></div>
          <span id="grp-arr-${esp}" style="color:var(--textm)">▼</span>
        </div>
        <div id="grp-${esp}" style="display:none">
          <table class="tbl" style="font-size:11px">
            <thead><tr><th>Formule</th><th class="num">Prix/kg</th><th class="num">Emballage/kg</th><th class="num">MO/tonne</th><th></th></tr></thead>
            <tbody>
            ${formules.map(f=>`<tr>
              <td style="font-weight:600">${f.nom}<br><span style="font-size:10px;color:var(--textm)">${f.stade||''}</span></td>
              <td class="num" style="color:var(--gold)">
                <div style="display:flex;align-items:center;justify-content:flex-end;gap:4px">
                  <span id="pf-val-${f.nom.replace(/\s/g,'-')}">${fmt(getPrix(f.nom))}</span>
                  <input type="number" id="pf-inp-${f.nom.replace(/\s/g,'-')}" value="${getPrix(f.nom)}"
                    style="width:70px;display:none;font-size:10px;padding:2px 4px;text-align:right"
                    onkeydown="if(event.key==='Enter')sauverPrixFormule('${f.nom}');if(event.key==='Escape')annulerPrixFormule('${f.nom}')">
                  <button class="btn btn-out btn-sm" id="pf-edit-${f.nom.replace(/\s/g,'-')}" onclick="editerPrixFormule('${f.nom}')" style="padding:2px 4px;font-size:9px">✏️</button>
                  <button class="btn btn-g btn-sm" id="pf-save-${f.nom.replace(/\s/g,'-')}" onclick="sauverPrixFormule('${f.nom}')" style="padding:2px 4px;font-size:9px;display:none">✓</button>
                </div>
              </td>
              <td class="num" style="color:rgba(245,158,11,.8)">
                <div style="display:flex;align-items:center;justify-content:flex-end;gap:4px">
                  <span id="pg-val-${f.nom.replace(/\s/g,'-')}">${fmt(GP_PRIX_GROS[f.nom]||0)}</span>
                  <input type="number" id="pg-inp-${f.nom.replace(/\s/g,'-')}" value="${GP_PRIX_GROS[f.nom]||0}"
                    style="width:70px;display:none;font-size:10px;padding:2px 4px;text-align:right"
                    onkeydown="if(event.key==='Enter')sauverPrixGros('${f.nom}');if(event.key==='Escape')annulerPrixGros('${f.nom}')">
                  <button class="btn btn-out btn-sm" id="pg-edit-${f.nom.replace(/\s/g,'-')}" onclick="editerPrixGros('${f.nom}')" style="padding:2px 4px;font-size:9px;border-color:rgba(245,158,11,.4)">✏️</button>
                  <button class="btn btn-g btn-sm" id="pg-save-${f.nom.replace(/\s/g,'-')}" onclick="sauverPrixGros('${f.nom}')" style="padding:2px 4px;font-size:9px;display:none">✓</button>
                </div>
              </td>
              <td class="num" style="color:var(--textm)">${f.cout_emballage_kg?fmt(f.cout_emballage_kg)+' F':'-'}</td>
              <td class="num" style="color:var(--textm)">${f.cout_mo_tonne?fmt(f.cout_mo_tonne)+' F':'-'}</td>
              <td>
                <div style="display:flex;gap:3px">
                  <button class="btn btn-out btn-sm" onclick="editerCoutsFormule('${f.nom}')" title="Coûts de production">⚙️</button>
                  <button class="btn btn-print btn-sm" onclick="imprimerFiche('${f.nom}')" title="Fiche technique">🖨️</button>
                </div>
              </td>
            </tr>`).join('')}
            </tbody>
          </table>
        </div>
      </div>`).join('')}`;
}

function toggleGroupe(id){
  const el=document.getElementById(id);
  if(!el)return;
  const esp=id.replace('grp-','');
  const arr=document.getElementById('grp-arr-'+esp);
  const open=el.style.display==='none';
  el.style.display=open?'block':'none';
  if(arr)arr.textContent=open?'▲':'▼';
}


async function savePrixFormule(){
  const nom=document.getElementById('pf_formule').value;
  const prix=+document.getElementById('pf_prix').value||0;
  const err=document.getElementById('pf_err');
  if(!nom||!prix){err.textContent='Formule et prix requis.';return;}
  const{error}=await SB.from('gp_prix_formules').upsert({admin_id:GP_ADMIN_ID,formule_nom:nom,prix},{onConflict:'admin_id,formule_nom'});
  if(error){
    // Try insert instead
    await SB.from('gp_prix_formules').insert({admin_id:GP_ADMIN_ID,formule_nom:nom,prix});
  }
  GP_PRIX[nom]=prix;
  document.getElementById('pf_prix').value='';
  err.textContent='';
  notify(`Prix ${nom} → ${fmt(prix)} F/kg ✓`,'gold');
  renderPrixFormules();
}
function renderIngrAdmin(){
  const search=normalizeSearch(document.getElementById('ingr-search')?.value||'');
  const filtered=GP_INGREDIENTS.filter(i=>!search||normalizeSearch(i.nom).includes(search));
  document.getElementById('ingr-liste-admin').innerHTML=filtered.length?`
    <div style="overflow-x:auto">
    <table class="tbl" style="font-size:11px">
      <thead><tr>
        <th>Ingrédient</th>
        <th class="num">Prix/kg (F)</th>
        <th class="num">Protéines</th>
        <th class="num">EM (kcal)</th>
        <th class="num">Seuil</th>
        <th></th>
      </tr></thead>
      <tbody>
      ${filtered.map(i=>`<tr>
        <td style="font-weight:600">${i.nom}</td>
        <td class="num" id="prix-cell-${i.id}">
          <div style="display:flex;align-items:center;justify-content:flex-end;gap:4px">
            <span id="prix-val-${i.id}">${fmt(i.prix_actuel)}</span>
            <input type="number" id="prix-inp-${i.id}" value="${i.prix_actuel}"
              style="width:70px;display:none;padding:2px 5px;font-size:11px;text-align:right"
              onkeydown="if(event.key==='Enter')sauverPrixIngr('${i.id}');if(event.key==='Escape')annulerEdit('${i.id}')">
          </div>
        </td>
        <td class="num" style="color:var(--textm)">${i.proteines||'—'}%</td>
        <td class="num" style="color:var(--textm)">${i.energie||'—'}</td>
        <td class="num">
          <div style="display:flex;align-items:center;justify-content:flex-end;gap:4px">
            <span id="seuil-val-${i.id}">${fmt(i.seuil_alerte||200)}</span>
            <input type="number" id="seuil-inp-${i.id}" value="${i.seuil_alerte||200}"
              style="width:65px;display:none;padding:2px 5px;font-size:11px;text-align:right"
              onkeydown="if(event.key==='Enter')sauverSeuil('${i.id}');if(event.key==='Escape')annulerSeuil('${i.id}')">
            <button class="btn btn-out btn-sm" onclick="editerSeuil('${i.id}')" id="seuil-edit-${i.id}" style="padding:2px 4px;font-size:9px" title="Modifier le seuil">✏️</button>
            <button class="btn btn-g btn-sm" onclick="sauverSeuil('${i.id}')" id="seuil-save-${i.id}" style="padding:2px 4px;font-size:9px;display:none">✓</button>
          </div>
        </td>
        <td>
          <div style="display:flex;gap:3px">
            <button class="btn btn-out btn-sm" onclick="editerPrix('${i.id}')" id="edit-btn-${i.id}" title="Modifier le prix">✏️</button>
            <button class="btn btn-g btn-sm" onclick="sauverPrixIngr('${i.id}')" id="save-btn-${i.id}" style="display:none" title="Sauvegarder">✓</button>
            <button class="btn btn-red btn-sm" onclick="deleteIngredient('${i.id}')">✕</button>
          </div>
        </td>
      </tr>`).join('')}
      </tbody>
    </table>`
  :'<div style="color:var(--textm);font-size:12px">Aucun ingrédient trouvé.</div>';
}

function editerPrix(id){
  document.getElementById('prix-val-'+id).style.display='none';
  document.getElementById('prix-inp-'+id).style.display='inline-block';
  document.getElementById('edit-btn-'+id).style.display='none';
  document.getElementById('save-btn-'+id).style.display='inline-flex';
  document.getElementById('prix-inp-'+id).focus();
}
function annulerEdit(id){
  document.getElementById('prix-val-'+id).style.display='inline';
  document.getElementById('prix-inp-'+id).style.display='none';
  document.getElementById('edit-btn-'+id).style.display='inline-flex';
  document.getElementById('save-btn-'+id).style.display='none';
}
async function sauverPrixIngr(id){
  const val=+document.getElementById('prix-inp-'+id).value||0;
  const{error}=await SB.from('gp_ingredients').update({prix_actuel:val}).eq('id',id);
  if(error){notify('Erreur: '+error.message,'r');return;}
  const ingr=GP_INGREDIENTS.find(i=>i.id===id);
  if(ingr)ingr.prix_actuel=val;
  document.getElementById('prix-val-'+id).textContent=fmt(val);
  annulerEdit(id);
  notify('Prix mis à jour ✓','gold');
}
function editerSeuil(id){
  document.getElementById('seuil-val-'+id).style.display='none';
  document.getElementById('seuil-inp-'+id).style.display='inline-block';
  document.getElementById('seuil-edit-'+id).style.display='none';
  document.getElementById('seuil-save-'+id).style.display='inline-flex';
  document.getElementById('seuil-inp-'+id).focus();
  document.getElementById('seuil-inp-'+id).select();
}
function annulerSeuil(id){
  document.getElementById('seuil-val-'+id).style.display='inline';
  document.getElementById('seuil-inp-'+id).style.display='none';
  document.getElementById('seuil-edit-'+id).style.display='inline-flex';
  document.getElementById('seuil-save-'+id).style.display='none';
}
async function sauverSeuil(id){
  const val=+document.getElementById('seuil-inp-'+id).value||100;
  const{error}=await SB.from('gp_ingredients').update({seuil_alerte:val}).eq('id',id);
  if(error){notify('Erreur: '+error.message,'r');return;}
  const ingr=GP_INGREDIENTS.find(i=>i.id===id);
  if(ingr)ingr.seuil_alerte=val;
  document.getElementById('seuil-val-'+id).textContent=fmt(val);
  annulerSeuil(id);
  notify('Seuil d\'alerte mis à jour ✓','gold');
}
async function saveIngredient(){
  const nom=document.getElementById('ni_nom').value.trim();
  const prix=+document.getElementById('ni_prix').value||0;
  const prot=+document.getElementById('ni_prot')?.value||null;
  const em=+document.getElementById('ni_em')?.value||null;
  const seuil=+document.getElementById('ni_seuil').value||200;
  const err=document.getElementById('ni_err');
  if(!nom){err.textContent='Nom requis.';return;}
  const{error}=await SB.from('gp_ingredients').insert({
    admin_id:GP_ADMIN_ID,nom,prix_actuel:prix,
    proteines:prot,energie:em,
    seuil_alerte:seuil,
    fournisseur:document.getElementById('ni_fourn').value.trim()||null
  });
  if(error){err.textContent='Erreur: '+error.message;return;}
  ['ni_nom','ni_prix','ni_prot','ni_em','ni_fourn'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});
  document.getElementById('ni_seuil').value='200';
  err.textContent='';
  await loadIngredients();populateSelects();renderIngrAdmin();
  notify('Matière première ajoutée ✓');
}
async function deleteIngredient(id){
  if(!confirm('Supprimer cet ingrédient ?'))return;
  await SB.from('gp_ingredients').delete().eq('id',id);
  await loadIngredients();populateSelects();renderIngrAdmin();
}
// (openNewFormule est défini plus haut avec l'éditeur complet — le stub a été supprimé)

// ── ÉQUIPE ─────────────────────────────────────────
async function saveEquipe(){
  const nom=document.getElementById('eq_nom').value.trim();
  const email=document.getElementById('eq_email').value.trim();
  const tel=document.getElementById('eq_tel')?.value.trim()||'';
  const role=document.getElementById('eq_role').value;
  const pv=document.getElementById('eq_pv_hidden')?.value.trim()||null;
  const err=document.getElementById('eq_err');
  const ok=document.getElementById('eq_ok');
  if(GP_ROLE!=='admin'){err.textContent='Action réservée à l\'administrateur.';return;}
  if(!nom||!email){err.textContent='Nom et email requis.';return;}
  if(!tel){err.textContent='Numéro WhatsApp requis pour envoyer l\'invitation.';return;}
  err.textContent='';ok.innerHTML='';

  // Vérifier doublon
  const{data:exist}=await SB.from('gp_membres').select('id').eq('email',email).eq('admin_id',GP_ADMIN_ID);
  if(exist&&exist.length>0){err.textContent='Cet email est déjà dans votre équipe.';return;}

  // Si rôle directeur : valider les champs contrat
  if(role==='directeur'){
    const dDebut=document.getElementById('eq_ctr_debut')?.value;
    const sal=+document.getElementById('eq_ctr_salaire')?.value||0;
    if(!dDebut){err.textContent='Date de début du contrat requise.';return;}
    if(!sal){err.textContent='Salaire de base requis.';return;}
  }

  // Générer un code d'invitation à 6 chiffres valide 48h
  const code=String(Math.floor(100000+Math.random()*900000));
  const expiration=new Date(Date.now()+48*60*60*1000).toISOString();

  // Enregistrer le membre avec le code
  const{data:membreCree,error}=await SB.from('gp_membres').insert({
    admin_id:GP_ADMIN_ID,
    nom,email,role,
    point_vente:pv,
    telephone:tel,
    code_invitation:code,
    code_expire_le:expiration,
    user_id:null
  }).select().single();
  if(error){err.textContent='Erreur: '+error.message;return;}

  // Si rôle directeur : créer le contrat lié
  if(role==='directeur' && membreCree){
    const dateFin=document.getElementById('eq_ctr_fin')?.value||null;
    const objectifs=[];
    if(document.getElementById('eq_ctr_obj_lapin')?.checked){
      objectifs.push({
        libelle:'Doubler ventes aliments lapins',
        cible:20000,unite:'kg',type:'ventes_kg_espece',
        espece:'lapin',deadline:dateFin
      });
    }
    if(document.getElementById('eq_ctr_obj_lapins_vifs')?.checked){
      objectifs.push({
        libelle:'Vendre 100 lapins par mois',
        cible:100,unite:'lapins',type:'lapins_vivants_mois',deadline:null
      });
    }
    const{error:errCtr}=await SB.from('gp_contrats').insert({
      admin_id:GP_ADMIN_ID,
      membre_id:membreCree.id,
      nom_complet:nom,
      poste:document.getElementById('eq_ctr_poste')?.value.trim()||'Directeur de la Stratégie Commerciale',
      type_contrat:dateFin?'CDD':'CDI',
      date_debut:document.getElementById('eq_ctr_debut').value,
      date_fin:dateFin,
      salaire_base:+document.getElementById('eq_ctr_salaire').value||0,
      regles_commissions:{
        lapin_par_tonne:+document.getElementById('eq_ctr_lapin')?.value||0,
        autres_par_tonne:+document.getElementById('eq_ctr_autres')?.value||0,
        poisson_par_tonne:+document.getElementById('eq_ctr_poisson')?.value||0,
        lapin_vivant_unite:+document.getElementById('eq_ctr_lapin_vif')?.value||0
      },
      objectifs,
      rapport_quotidien_obligatoire:document.getElementById('eq_ctr_rapport_obli')?.checked||false,
      penalite_rapport_manquant:+document.getElementById('eq_ctr_penalite')?.value||0,
      exempt_dimanche:document.getElementById('eq_ctr_dim_exempt')?.checked!==false,
      actif:true
    });
    if(errCtr){
      // Le membre a été créé mais le contrat a échoué — informer sans tout annuler
      err.textContent='Membre créé, mais erreur création contrat : '+errCtr.message;
      // On continue quand même pour envoyer l'invitation
    }
  }

  // Envoyer invitation WhatsApp avec le code
  const siteUrl=window.location.origin;
  const paysInfo=detecterPays(tel);
  const telClean=paysInfo.numero_whatsapp;
  const roleLabel=role==='admin'?'Administrateur':role==='daf'?'DAF':role==='logistique'?'Logistique':role==='directeur'?'Directeur Stratégique Commercial':'Secrétaire';
  const msg=encodeURIComponent(
    `Bonjour ${nom} 👋\n\n`+
    `Vous êtes invité(e) à rejoindre *${GP_CONFIG?.nom_provenderie||'PROVENDA'}* en tant que *${roleLabel}*`+
    (pv?`\n📍 Point de vente : *${pv}*`:'')+
    `\n\n`+
    `🔑 *Votre code d'invitation :*\n`+
    `\`${code}\`\n`+
    `_(appuyez longuement pour copier le code)_\n\n`+
    `⏰ Valide pendant *48 heures*\n\n`+
    `📧 *Votre email de connexion :*\n`+
    `\`${email}\`\n`+
    `_(appuyez longuement pour copier l'email)_\n\n`+
    `📌 *Comment rejoindre l'équipe :*\n`+
    `1. Ouvrez ce lien : ${siteUrl}\n`+
    `2. Cliquez *"🔑 Rejoindre une équipe avec un code"*\n`+
    `3. Entrez votre email et le code ci-dessus\n`+
    `4. Choisissez un mot de passe\n\n`+
    `_PROVENDA · ATM Farm Village_`
  );

  ['eq_nom','eq_email','eq_tel'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});

  ok.innerHTML=`
    <div style="color:var(--green);margin-bottom:8px">✓ <strong>${nom}</strong> ajouté(e) — ${roleLabel}${pv?' · '+pv:''}</div>
    <a href="https://wa.me/${paysInfo.numero_whatsapp}?text=${msg}" target="_blank"
      class="btn btn-g btn-sm" style="display:inline-flex;text-decoration:none;width:100%;justify-content:center">
      📲 Envoyer l'invitation WhatsApp à ${nom}
    </a>`;

  notify(`${nom} ajouté(e) ✓`,'gold');
  await renderPDV();
}

async function toggleMembreActif(id, estActif){
  if(GP_ROLE!=='admin'){notify('Action réservée à l\'administrateur','r');return;}
  const action=estActif?'désactiver':'réactiver';
  if(!confirm(`Voulez-vous ${action} ce membre ?`))return;
  await SB.from('gp_membres').update({actif:!estActif}).eq('id',id);
  await renderPDV();
  notify(`Membre ${estActif?'désactivé':'réactivé'} ✓`,'gold');
}
async function deleteMembre(id){
  if(GP_ROLE!=='admin'){notify('Action réservée à l\'administrateur','r');return;}
  if(!confirm('Supprimer définitivement ce membre ? Cette action est irréversible.'))return;
  await SB.from('gp_membres').delete().eq('id',id);
  await renderPDV();
  notify('Membre supprimé ✓','r');
}

// ── CONFIG ─────────────────────────────────────────
function applyColor(c){
  document.documentElement.style.setProperty('--g4',c);
  document.documentElement.style.setProperty('--g5',c);
}
function applyLogo(url){
  const tb=document.getElementById('tb-logo');
  if(tb)tb.innerHTML=`<img src="${url}" style="width:30px;height:30px;object-fit:contain;border-radius:6px">`;
  const preview=document.getElementById('cfg-logo-preview');
  if(preview)preview.innerHTML=`<img src="${url}" style="width:90px;height:90px;object-fit:contain;border-radius:12px;margin:0 auto 8px;display:block">`;
}

// ── ANIMATION COUNT-UP DES KPI ────────────────────
// Anime le contenu numérique des .stat-val et .econo-val depuis 0 jusqu'à leur valeur finale.
// Idempotent : ne ré-anime pas un élément déjà animé dans la session.
function animateKpis(root){
  const scope = root || document;
  const els = scope.querySelectorAll('.stat-val, .econo-val');
  els.forEach(el => {
    if(el.dataset.animDone === '1') return;
    const finalTxt = el.textContent;
    const m = finalTxt.match(/-?\d[\d\s.,]*/);
    if(!m) return;
    const cleaned = m[0].replace(/\s/g,'').replace(/\.(?=\d{3}\b)/g,'').replace(',','.');
    const target = parseFloat(cleaned);
    if(!isFinite(target) || Math.abs(target) < 5){el.dataset.animDone='1';return;}
    const prefix = finalTxt.slice(0, m.index);
    const suffix = finalTxt.slice(m.index + m[0].length);
    el.dataset.animDone = '1';
    const start = performance.now();
    const dur = 650;
    const fmtFr = n => new Intl.NumberFormat('fr-FR').format(Math.round(n));
    function tick(now){
      const t = Math.min(1, (now-start)/dur);
      const eased = 1 - Math.pow(1-t, 3);
      el.textContent = prefix + fmtFr(target * eased) + suffix;
      if(t < 1) requestAnimationFrame(tick);
      else el.textContent = finalTxt;
    }
    requestAnimationFrame(tick);
  });
}

// ── THÈME CLAIR/SOMBRE ────────────────────────────
function toggleTheme(){
  const cur=document.documentElement.getAttribute('data-theme')||'dark';
  const next=cur==='dark'?'light':'dark';
  document.documentElement.setAttribute('data-theme',next);
  try{localStorage.setItem('gp_theme',next);}catch(e){}
  const btn=document.getElementById('theme-toggle-btn');
  if(btn)btn.textContent=next==='dark'?'🌙':'☀️';
}

// ── EXTRACTION COULEUR DOMINANTE DU LOGO ──────────
// Prend un File (image) et renvoie une string '#RRGGBB' représentant la couleur dominante.
// Ignore les pixels trop clairs (proche blanc), trop sombres (proche noir) et trop gris.
function extraireCouleurDominante(file){
  return new Promise((resolve,reject)=>{
    const reader=new FileReader();
    reader.onerror=()=>reject('fichier illisible');
    reader.onload=()=>{
      const img=new Image();
      img.onload=()=>{
        try{
          const canvas=document.createElement('canvas');
          const size=60;
          canvas.width=size;canvas.height=size;
          const ctx=canvas.getContext('2d');
          ctx.drawImage(img,0,0,size,size);
          const data=ctx.getImageData(0,0,size,size).data;
          const buckets={};
          for(let i=0;i<data.length;i+=4){
            const r=data[i],g=data[i+1],b=data[i+2],a=data[i+3];
            if(a<200)continue;
            const max=Math.max(r,g,b),min=Math.min(r,g,b);
            if(max>240&&min>240)continue; // proche blanc
            if(max<25)continue; // proche noir
            if(max-min<20)continue; // proche gris
            const key=`${r>>5},${g>>5},${b>>5}`;
            buckets[key]=(buckets[key]||0)+1;
          }
          const sorted=Object.entries(buckets).sort((a,b)=>b[1]-a[1]);
          if(!sorted.length)return reject('aucune couleur dominante');
          const [r,g,b]=sorted[0][0].split(',').map(n=>Math.min(255,(+n*32)+16));
          const hex='#'+[r,g,b].map(n=>n.toString(16).padStart(2,'0')).join('');
          resolve(hex);
        }catch(e){reject(e);}
      };
      img.onerror=()=>reject('image invalide');
      img.src=reader.result;
    };
    reader.readAsDataURL(file);
  });
}
async function loadConfigForm(){
  if(GP_CONFIG.nom_provenderie)document.getElementById('cfg_nom').value=GP_CONFIG.nom_provenderie;
  if(GP_CONFIG.slogan)document.getElementById('cfg_slogan').value=GP_CONFIG.slogan;
  if(GP_CONFIG.telephone)document.getElementById('cfg_tel').value=GP_CONFIG.telephone;
  if(GP_CONFIG.email)document.getElementById('cfg_email').value=GP_CONFIG.email;
  if(GP_CONFIG.localisation)document.getElementById('cfg_loc').value=GP_CONFIG.localisation;
  if(GP_CONFIG.couleur)document.getElementById('cfg_couleur').value=GP_CONFIG.couleur;
  if(GP_CONFIG.tel_alerte_stock)document.getElementById('cfg_tel_alerte').value=GP_CONFIG.tel_alerte_stock;
  if(GP_CONFIG.logo_url)applyLogo(GP_CONFIG.logo_url);
}
async function saveConfig(){
  const nom=document.getElementById('cfg_nom').value.trim();
  const err=document.getElementById('cfg_err');const ok=document.getElementById('cfg_ok');
  if(!nom){err.textContent='Nom requis.';return;}
  const couleur=document.getElementById('cfg_couleur').value;
  const telAlerte=document.getElementById('cfg_tel_alerte')?.value.trim()||null;
  const{error}=await SB.from('gp_config').upsert({
    user_id:GP_ADMIN_ID,nom_provenderie:nom,
    slogan:document.getElementById('cfg_slogan').value.trim(),
    telephone:document.getElementById('cfg_tel').value.trim(),
    email:document.getElementById('cfg_email').value.trim(),
    localisation:document.getElementById('cfg_loc').value.trim(),
    couleur,logo_url:GP_CONFIG.logo_url||null,
    tel_alerte_stock:telAlerte
  },{onConflict:'user_id'});
  if(error){err.textContent='Erreur: '+error.message;return;}
  GP_CONFIG.nom_provenderie=nom;GP_CONFIG.couleur=couleur;
  if(telAlerte)GP_CONFIG.tel_alerte_stock=telAlerte;
  document.getElementById('tb-name').textContent=nom;
  applyColor(couleur);
  err.textContent='';ok.textContent='✓ Configuration sauvegardée !';
  setTimeout(()=>ok.textContent='',3000);
  notify('Configuration mise à jour ✓','gold');
}
async function saveRemiseMax(){
  const val=+document.getElementById('cfg_remise_max').value||5;
  GP_REMISE_MAX=val;
  await SB.from('gp_config').upsert({user_id:GP_ADMIN_ID,remise_max:val},{onConflict:'user_id'});
  notify(`Remise max : ${val}% ✓`,'gold');
}
async function uploadLogo(){
  const file=document.getElementById('cfg_logo').files?.[0];
  const err=document.getElementById('logo_err');const ok=document.getElementById('logo_ok');
  if(!file){err.textContent='Sélectionnez un fichier.';return;}
  if(file.size>2*1024*1024){err.textContent='Max 2MB.';return;}
  err.textContent='Upload...';
  const ext=file.name.split('.').pop();
  const path=`logos/${GP_ADMIN_ID}/logo.${ext}`;
  const{error:upErr}=await SB.storage.from('gp-logos').upload(path,file,{upsert:true});
  if(upErr){err.textContent='Erreur: '+upErr.message;return;}
  const{data:urlData}=SB.storage.from('gp-logos').getPublicUrl(path);
  const logo_url=urlData?.publicUrl;

  // Extraire la couleur dominante du logo pour l'utiliser comme accent
  let couleurExtraite=null;
  try{
    couleurExtraite=await extraireCouleurDominante(file);
  }catch(e){console.warn('Extraction couleur logo échouée:',e);}

  const upd={user_id:GP_ADMIN_ID,logo_url};
  if(couleurExtraite) upd.couleur=couleurExtraite;
  await SB.from('gp_config').upsert(upd,{onConflict:'user_id'});
  GP_CONFIG.logo_url=logo_url;
  if(couleurExtraite){
    GP_CONFIG.couleur=couleurExtraite;
    applyColor(couleurExtraite);
    const colorEl=document.getElementById('cfg_couleur');
    if(colorEl)colorEl.value=couleurExtraite;
  }
  applyLogo(logo_url);
  err.textContent='';
  ok.textContent=couleurExtraite?`✓ Logo + couleur ${couleurExtraite} appliqués !`:'✓ Logo mis à jour !';
  setTimeout(()=>ok.textContent='',3500);
  notify('Logo uploadé ✓','gold');
}

// ── BOOT ───────────────────────────────────────────
window.addEventListener('load',function(){
  try{SB=supabase.createClient(GP_URL,GP_KEY);}
  catch(e){document.getElementById('a_err').textContent='Erreur réseau. Rechargez la page.';return;}
  SB.auth.getSession().then(function(res){
    const session=res.data&&res.data.session;
    if(session)bootApp(session.user);
  }).catch(function(e){console.error('Session check failed:',e);});
});
// ══════════════════════════════════════════════════
// POINTS DE VENTE & ÉQUIPE
// ══════════════════════════════════════════════════


// ── BADGE COULEUR PAR POINT DE VENTE ──────────────

function ouvrirModalEq(pvNom){
  document.getElementById('modal-eq').style.display='flex';
  document.getElementById('eq_pv_hidden').value=pvNom||'';
  document.getElementById('modal-eq-pv-label').innerHTML=pvNom?pvBadgeHtml(pvNom,'lg'):'<span style="font-size:13px;color:var(--textm)">🏭 Siège principal</span>';
  document.getElementById('eq_nom').value='';
  document.getElementById('eq_email').value='';
  document.getElementById('eq_tel').value='';
  document.getElementById('eq_role').value='secretaire';
  document.getElementById('eq_err').textContent='';
  document.getElementById('eq_ok').innerHTML='';
  toggleContratFields(); // masque la section contrat à l'ouverture
  setTimeout(()=>document.getElementById('eq_nom').focus(),100);
}
function fermerModalEq(){
  document.getElementById('modal-eq').style.display='none';
}
function toggleContratFields(){
  const role=document.getElementById('eq_role')?.value;
  const fields=document.getElementById('eq_contrat_fields');
  if(!fields)return;
  fields.style.display=role==='directeur'?'block':'none';
}

async function renderPDV(){
  // Cacher section création PDV pour non-admin
  const creationSection=document.getElementById('pdv-creation-section');
  if(creationSection)creationSection.style.display=GP_ROLE==='admin'?'block':'none';
  // Cacher boutons admin sur les cartes membres si non-admin
  // (appliqué après rendu via CSS)
  setTimeout(()=>{
    document.querySelectorAll('.membre-admin-btn').forEach(btn=>{
      btn.style.display=GP_ROLE==='admin'?'inline-flex':'none';
    });
  },50);
  const{data:P}=await SB.from('gp_points_vente').select('*').eq('admin_id',GP_ADMIN_ID).order('nom');
  const{data:M}=await SB.from('gp_membres').select('*').eq('admin_id',GP_ADMIN_ID);
  const membres=M||[];
  const points=P||[];

  // Remplir select (gardé pour compatibilité)
  const sel=document.getElementById('eq_pv');
  if(sel){
    sel.innerHTML='<option value="">— Aucun (siège principal) —</option>'+
      points.map(p=>`<option value="${p.nom}">${p.nom}</option>`).join('');
  }

  // Afficher liste complète PDV avec membres dedans
  const container=document.getElementById('pdv-liste-complet');
  if(!container)return;

  if(!points.length){
    container.innerHTML='<div style="color:var(--textm);font-size:12px;padding:12px 0">Aucun point de vente créé. Créez-en un ci-dessus.</div>';
  } else {
    container.innerHTML=points.map(p=>{
      const membresP=membres.filter(m=>m.point_vente===p.nom);
      const pal=pvPalette(p.nom);
      return `<div class="card" style="margin-bottom:10px;border-left:4px solid ${pal.border}">
        <div class="card-title">
          <div class="ct-left" style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
            ${pvBadgeHtml(p.nom,'lg')}
            ${p.telephone?`<span style="font-size:10px;color:var(--textm)">📞 ${p.telephone}</span>`:''}
            ${p.adresse?`<span style="font-size:10px;color:var(--textm)">📍 ${p.adresse}</span>`:''}
            ${p.latitude&&p.longitude?`<a href="https://www.google.com/maps?q=${p.latitude},${p.longitude}" target="_blank" style="font-size:10px;color:var(--g6);text-decoration:none">🗺️ Voir sur carte</a>`:''}
          </div>
          <div style="display:flex;gap:6px">
            ${GP_ROLE==='admin'?`<button class="btn btn-g btn-sm" onclick="ouvrirModalEq('${p.nom}')">➕ Ajouter secrétaire</button>`:''}
            ${GP_ROLE==='admin'?`<button class="btn btn-red btn-sm" onclick="deletePDV('${p.id}','${p.nom}')">✕</button>`:''}
          </div>
        </div>
        ${membresP.length
          ? membresP.map(m=>membreCard(m)).join('')
          : '<div style="font-size:11px;color:var(--textm);padding:8px 0">Aucun membre dans ce point de vente.</div>'
        }
      </div>`;
    }).join('');
  }

  // Siège principal — membres sans point de vente
  const siege=membres.filter(m=>!m.point_vente);
  const siegeEl=document.getElementById('equipe-siege');
  if(siegeEl){
    siegeEl.innerHTML=siege.length
      ? siege.map(m=>membreCard(m)).join('')
      : '<div style="font-size:11px;color:var(--textm)">Aucun membre au siège.</div>';
  }
}

function membreCard(m){
  const paysInfo=detecterPays(m.telephone||'');
  const telClean=paysInfo.numero_whatsapp;
  const siteUrl=window.location.origin;
  const code=m.code_invitation&&!m.code_invitation.startsWith('USED_')?m.code_invitation:null;
  const reinvitMsg=encodeURIComponent(
    `Bonjour ${m.nom} 👋\n\n`+
    (code?
      `Votre code d'invitation PROVENDA :\n\`${code}\`\n_(appuyez longuement pour copier)_\n\n📧 Email : \`${m.email}\`\n\nLien : ${siteUrl}\n\n_PROVENDA · ATM Farm Village_`
      :`Rappel : connectez-vous sur PROVENDA.\n\nEmail : *${m.email}*\n\nLien : ${siteUrl}\n\n_PROVENDA · ATM Farm Village_`)
  );

  // Badge PDV avec couleur
  const pvBadge=m.point_vente
    ?pvBadgeHtml(m.point_vente)
    :'<span style="font-size:10px;color:var(--textm);background:rgba(30,45,74,.5);padding:2px 8px;border-radius:10px">🏭 Siège principal</span>';

  // Statut connexion + actif
  const estActif=m.actif!==false;
  const statutBadge=!estActif
    ?'<span style="font-size:9px;background:rgba(239,68,68,.1);color:var(--red);border:1px solid rgba(239,68,68,.2);padding:2px 8px;border-radius:10px">🔒 Désactivé</span>'
    :m.user_id
      ?'<span style="font-size:9px;background:rgba(22,163,74,.15);color:var(--green);border:1px solid rgba(22,163,74,.3);padding:2px 8px;border-radius:10px">✅ Compte actif</span>'
      :'<span style="font-size:9px;background:rgba(245,158,11,.1);color:var(--gold);border:1px solid rgba(245,158,11,.2);padding:2px 8px;border-radius:10px">⏳ En attente</span>';

  // Badge rôle
  const roleColor=m.role==='admin'?'bdg-gold':m.role==='daf'?'bdg-gold':m.role==='directeur'?'bdg-gold':m.role==='logistique'?'bdg-b':'bdg-g';

  return `<div style="padding:12px;background:rgba(14,20,40,.5);border:1px solid ${estActif?'var(--border)':'rgba(239,68,68,.25)'};border-radius:10px;margin-bottom:8px;opacity:${estActif?1:.6}">
    <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px">
      <div style="flex:1;min-width:0">
        <div style="font-weight:700;font-size:13px;margin-bottom:4px">${m.nom||'—'}</div>
        <div style="font-size:10px;color:var(--textm);margin-bottom:6px">${m.email||'—'}${m.telephone?' · '+m.telephone:''}</div>
        <div style="display:flex;gap:5px;flex-wrap:wrap;align-items:center">
          <span class="badge ${roleColor}" style="font-size:9px">${(m.role||'secretaire').toUpperCase()}</span>
          ${pvBadge}
          ${statutBadge}
          ${code?`<span style="font-family:'DM Mono',monospace;font-size:11px;color:var(--gold);background:rgba(245,158,11,.1);border:1px solid rgba(245,158,11,.3);padding:2px 8px;border-radius:6px;letter-spacing:2px">🔑 ${code}</span>`:''}
        </div>
      </div>
      <div style="display:flex;gap:4px;flex-shrink:0;flex-wrap:wrap;justify-content:flex-end">
        ${m.telephone?`<a href="https://wa.me/${paysInfo.numero_whatsapp}?text=${reinvitMsg}" target="_blank" class="btn btn-g btn-sm" title="${m.user_id?'Envoyer message':'Renvoyer invitation'}">📲</a>`:''}
        <button class="btn btn-sm membre-admin-btn" onclick="toggleMembreActif('${m.id}',${m.actif!==false})"
          style="background:${m.actif!==false?'rgba(245,158,11,.15)':'rgba(22,163,74,.15)'};border:1px solid ${m.actif!==false?'rgba(245,158,11,.4)':'rgba(22,163,74,.4)'};color:${m.actif!==false?'var(--gold)':'var(--green)'}">
          ${m.actif!==false?'🔒 Désactiver':'✅ Réactiver'}
        </button>
        <button class="btn btn-red btn-sm membre-admin-btn" onclick="deleteMembre('${m.id}')" title="Supprimer définitivement">🗑 Supprimer</button>
      </div>
    </div>
  </div>`;
}


async function savePDV(){
  if(GP_ROLE!=='admin'){notify('Action réservée à l\'administrateur','r');return;}
  const nom=document.getElementById('pv_nom')?.value.trim();
  const tel=document.getElementById('pv_tel')?.value.trim()||null;
  const adresse=document.getElementById('pv_adresse')?.value.trim()||null;
  const lat=parseFloat(document.getElementById('pv_lat')?.value)||null;
  const lng=parseFloat(document.getElementById('pv_lng')?.value)||null;
  const err=document.getElementById('pv_err');
  if(!nom){err.textContent='Nom requis.';return;}
  const typePdv=document.getElementById('pv_type')?.value||'secondaire';
  const secSalariee=document.getElementById('pv_sec_type')?.value==='true';
  const whatsapp=document.getElementById('pv_whatsapp')?.value.trim()||null;
  const responsable=document.getElementById('pv_responsable')?.value.trim()||null;
  const{error}=await SB.from('gp_points_vente').insert({
    admin_id:GP_ADMIN_ID,nom,telephone:tel,whatsapp,responsable,adresse,
    latitude:lat,longitude:lng,
    type_pdv:typePdv,
    secretaire_salariee:secSalariee
  });
  if(error){err.textContent='Erreur: '+error.message;return;}
  // Créer automatiquement la caisse physique du PDV
  await SB.from('gp_caisses').insert({
    admin_id:GP_ADMIN_ID,
    nom:'Caisse '+nom,
    type:'physique',
    point_vente:nom,
    solde_initial:0,
    solde_actuel:0,
    couleur:pvPalette(nom).border,
    actif:true
  });
  ['pv_nom','pv_tel','pv_whatsapp','pv_responsable','pv_adresse','pv_lat','pv_lng'].forEach(id=>{
    const el=document.getElementById(id);if(el)el.value='';
  });
  err.textContent='';
  await renderPDV();
  notify('Point de vente "'+nom+'" créé avec sa caisse ✓','gold');
}

async function deletePDV(id,nom){
  if(GP_ROLE!=='admin'){notify('Action réservée à l\'administrateur','r');return;}
  if(!confirm(`Supprimer le point de vente "${nom}" ?\nLes membres assignés passeront au siège principal.`))return;
  // Retirer le point_vente des membres
  await SB.from('gp_membres').update({point_vente:null}).eq('admin_id',GP_ADMIN_ID).eq('point_vente',nom);
  await SB.from('gp_points_vente').delete().eq('id',id);
  await renderPDV();
  notify('Point de vente supprimé','r');
}

// ── COÛTS DE PRODUCTION PAR FORMULE ──────────────
function editerCoutsFormule(formuleNom){
  const f=getAllFormules().find(x=>x.nom===formuleNom);
  if(!f)return;
  const modal=document.getElementById('modal-couts-formule');
  document.getElementById('cf-formule-nom').textContent=formuleNom;
  document.getElementById('cf-emballage').value=f.cout_emballage_kg||0;
  document.getElementById('cf-mo').value=f.cout_mo_tonne||0;
  document.getElementById('cf-transport').value=f.cout_transport_lot||0;
  document.getElementById('cf-avec-emballage').checked=f.avec_emballage!==false;
  document.getElementById('cf-avec-transport').checked=f.avec_transport===true;
  document.getElementById('cf-formule-id').value=f.id||'';
  document.getElementById('cf-formule-nom-hidden').value=formuleNom;
  modal.style.display='flex';
}

async function saveCoutsFormule(){
  const id=document.getElementById('cf-formule-id')?.value;
  const nom=document.getElementById('cf-formule-nom-hidden')?.value;
  const emballage=+document.getElementById('cf-emballage')?.value||0;
  const mo=+document.getElementById('cf-mo')?.value||0;
  const transport=+document.getElementById('cf-transport')?.value||0;
  const avecEmb=document.getElementById('cf-avec-emballage')?.checked;
  const avecTrans=document.getElementById('cf-avec-transport')?.checked;

  if(id){
    await SB.from('gp_formules').update({
      cout_emballage_kg:emballage,
      cout_mo_tonne:mo,
      cout_transport_lot:transport,
      avec_emballage:avecEmb,
      avec_transport:avecTrans
    }).eq('id',id);
  }
  // Mettre à jour FORMULES_SADARI en mémoire aussi
  const f=getAllFormules().find(x=>x.nom===nom);
  if(f){
    f.cout_emballage_kg=emballage;
    f.cout_mo_tonne=mo;
    f.cout_transport_lot=transport;
    f.avec_emballage=avecEmb;
    f.avec_transport=avecTrans;
  }
  document.getElementById('modal-couts-formule').style.display='none';
  renderPrixFormules();
  notify('Coûts de production mis à jour ✓','gold');
}

// ── ÉDITION PRIX DÉTAIL PAR FORMULE ──────────────
function editerPrixFormule(nom){
  const key=nom.replace(/\s/g,'-');
  document.getElementById('pf-val-'+key).style.display='none';
  document.getElementById('pf-inp-'+key).style.display='inline-block';
  document.getElementById('pf-edit-'+key).style.display='none';
  document.getElementById('pf-save-'+key).style.display='inline-flex';
  document.getElementById('pf-inp-'+key).focus();
}
function annulerPrixFormule(nom){
  const key=nom.replace(/\s/g,'-');
  document.getElementById('pf-val-'+key).style.display='inline';
  document.getElementById('pf-inp-'+key).style.display='none';
  document.getElementById('pf-edit-'+key).style.display='inline-flex';
  document.getElementById('pf-save-'+key).style.display='none';
}
async function sauverPrixFormule(nom){
  const key=nom.replace(/\s/g,'-');
  const val=+document.getElementById('pf-inp-'+key)?.value||0;
  await SB.from('gp_prix_formules').upsert({
    admin_id:GP_ADMIN_ID,formule_nom:nom,prix:val
  },{onConflict:'admin_id,formule_nom'});
  GP_PRIX[nom]=val;
  document.getElementById('pf-val-'+key).textContent=fmt(val);
  annulerPrixFormule(nom);
  notify('Prix détail mis à jour ✓','gold');
}

// ── ÉDITION PRIX GROS PAR FORMULE ────────────────
function editerPrixGros(nom){
  const key=nom.replace(/\s/g,'-');
  document.getElementById('pg-val-'+key).style.display='none';
  document.getElementById('pg-inp-'+key).style.display='inline-block';
  document.getElementById('pg-edit-'+key).style.display='none';
  document.getElementById('pg-save-'+key).style.display='inline-flex';
  document.getElementById('pg-inp-'+key).focus();
}
function annulerPrixGros(nom){
  const key=nom.replace(/\s/g,'-');
  document.getElementById('pg-val-'+key).style.display='inline';
  document.getElementById('pg-inp-'+key).style.display='none';
  document.getElementById('pg-edit-'+key).style.display='inline-flex';
  document.getElementById('pg-save-'+key).style.display='none';
}
async function sauverPrixGros(nom){
  const key=nom.replace(/\s/g,'-');
  const val=+document.getElementById('pg-inp-'+key)?.value||0;
  await SB.from('gp_prix_formules').upsert({
    admin_id:GP_ADMIN_ID,formule_nom:nom,prix_gros:val
  },{onConflict:'admin_id,formule_nom'});
  GP_PRIX_GROS[nom]=val;
  document.getElementById('pg-val-'+key).textContent=fmt(val);
  annulerPrixGros(nom);
  notify('Prix gros mis à jour ✓','gold');
}
