// ══════════════════════════════════════════════════
// PROVENDA — PAGE MATIÈRES PREMIÈRES
// ══════════════════════════════════════════════════

async function renderMatieresPremieresPage(){
  const search = (document.getElementById('mp-search-page')?.value||'').toLowerCase();
  const filtered = GP_INGREDIENTS.filter(i=>
    !search || i.nom.toLowerCase().includes(search)
  );

  // KPIs
  const totalMP = GP_INGREDIENTS.length;
  const sansPrix = GP_INGREDIENTS.filter(i=>!i.prix_actuel||i.prix_actuel===0).length;
  const sansSeuil = GP_INGREDIENTS.filter(i=>!i.seuil_alerte||i.seuil_alerte===0).length;

  // Calcul alertes depuis stock
  const{data:S}=await SB.from('gp_stock_mp').select('ingredient_nom,type,quantite').eq('admin_id',GP_ADMIN_ID);
  const niveaux={};
  (S||[]).forEach(m=>{
    const q=Number(m.quantite||0);
    niveaux[m.ingredient_nom]=(niveaux[m.ingredient_nom]||0)+(m.type==='entree'?q:-q);
  });
  const enAlerte=GP_INGREDIENTS.filter(i=>{
    const qte=niveaux[i.nom]||0;
    return qte<(i.seuil_alerte||200);
  }).length;

  document.getElementById('mp-kpis').innerHTML=`
    <div class="econo-box"><div class="econo-val">${totalMP}</div><div class="econo-lbl">Total MP</div></div>
    <div class="econo-box"><div class="econo-val" style="color:${enAlerte>0?'var(--red)':'var(--green)'}">${enAlerte}</div><div class="econo-lbl">En alerte</div></div>
    <div class="econo-box"><div class="econo-val" style="color:${sansPrix>0?'var(--gold)':'var(--green)'}">${sansPrix}</div><div class="econo-lbl">Sans prix</div></div>
    <div class="econo-box"><div class="econo-val" style="color:${sansSeuil>0?'var(--gold)':'var(--green)'}">${sansSeuil}</div><div class="econo-lbl">Sans seuil</div></div>`;

  if(!filtered.length){
    document.getElementById('mp-liste-page').innerHTML='<div style="color:var(--textm);font-size:12px;padding:12px">Aucune matière première trouvée.</div>';
    return;
  }

  // Trier par nom
  const sorted=[...filtered].sort((a,b)=>a.nom.localeCompare(b.nom));

  document.getElementById('mp-liste-page').innerHTML=`
    <table class="tbl" style="font-size:11px">
      <thead><tr>
        <th>Nom</th>
        <th class="num">Prix/kg (F)</th>
        <th class="num">Seuil critique (kg)</th>
        <th class="num">Stock actuel</th>
        <th class="num">Protéines</th>
        <th class="num">EM (kcal)</th>
        <th>Statut</th>
        <th></th>
      </tr></thead>
      <tbody>
      ${sorted.map(i=>{
        const qteStock=niveaux[i.nom]||0;
        const seuil=i.seuil_alerte||200;
        const statut=qteStock<=0?'❌ Épuisé':qteStock<seuil*0.5?'🔴 Critique':qteStock<seuil?'🟡 Bas':'🟢 OK';
        const cls=qteStock<=0?'bad':qteStock<seuil*0.5?'bad':qteStock<seuil?'warn':'good';
        return `<tr>
          <td style="font-weight:600">${i.nom}</td>

          <!-- Prix inline edit -->
          <td class="num">
            <div style="display:flex;align-items:center;justify-content:flex-end;gap:3px">
              <span id="mpp-prix-val-${i.id}">${fmt(i.prix_actuel||0)}</span>
              <input type="number" id="mpp-prix-inp-${i.id}" value="${i.prix_actuel||0}"
                style="width:70px;display:none;padding:2px 5px;font-size:11px;text-align:right"
                onkeydown="if(event.key==='Enter')mppSauverPrix('${i.id}');if(event.key==='Escape')mppAnnulerPrix('${i.id}')">
              ${GP_ROLE==='admin'?`<button class="btn btn-out btn-sm" onclick="mppEditerPrix('${i.id}')" id="mpp-prix-edit-${i.id}" style="padding:2px 4px;font-size:9px" title="Admin uniquement">✏️</button>
              <button class="btn btn-g btn-sm" onclick="mppSauverPrix('${i.id}')" id="mpp-prix-save-${i.id}" style="padding:2px 4px;font-size:9px;display:none">✓</button>`:''}
            </div>
          </td>

          <!-- Seuil inline edit -->
          <td class="num">
            <div style="display:flex;align-items:center;justify-content:flex-end;gap:3px">
              <span id="mpp-seuil-val-${i.id}" style="color:${seuil===200?'var(--textm)':'var(--text)'}">${fmt(seuil)}</span>
              <input type="number" id="mpp-seuil-inp-${i.id}" value="${seuil}"
                style="width:70px;display:none;padding:2px 5px;font-size:11px;text-align:right"
                onkeydown="if(event.key==='Enter')mppSauverSeuil('${i.id}');if(event.key==='Escape')mppAnnulerSeuil('${i.id}')">
              <button class="btn btn-out btn-sm" onclick="mppEditerSeuil('${i.id}')" id="mpp-seuil-edit-${i.id}" style="padding:2px 4px;font-size:9px">✏️</button>
              <button class="btn btn-g btn-sm" onclick="mppSauverSeuil('${i.id}')" id="mpp-seuil-save-${i.id}" style="padding:2px 4px;font-size:9px;display:none">✓</button>
            </div>
          </td>

          <td class="num ${cls}">${fmtKg(Math.max(0,qteStock))}</td>
          <td class="num" style="color:var(--textm)">${i.proteines||'—'}%</td>
          <td class="num" style="color:var(--textm)">${i.energie||'—'}</td>
          <td><span class="badge ${qteStock<=0?'bdg-r':qteStock<seuil?'bdg-gold':'bdg-g'}" style="font-size:9px">${statut}</span></td>
          <td><button class="btn btn-red btn-sm" onclick="deleteMPPage('${i.id}','${i.nom.replace(/'/g,'')}')">✕</button></td>
        </tr>`;
      }).join('')}
      </tbody>
    </table>`;

  // Remplir aussi le select du seuil rapide
  populateMPSelect();
}

// ── ÉDITION PRIX ────────────────────────────────────
function mppEditerPrix(id){
  document.getElementById('mpp-prix-val-'+id).style.display='none';
  document.getElementById('mpp-prix-inp-'+id).style.display='inline-block';
  document.getElementById('mpp-prix-edit-'+id).style.display='none';
  document.getElementById('mpp-prix-save-'+id).style.display='inline-flex';
  document.getElementById('mpp-prix-inp-'+id).focus();
  document.getElementById('mpp-prix-inp-'+id).select();
}
function mppAnnulerPrix(id){
  document.getElementById('mpp-prix-val-'+id).style.display='inline';
  document.getElementById('mpp-prix-inp-'+id).style.display='none';
  document.getElementById('mpp-prix-edit-'+id).style.display='inline-flex';
  document.getElementById('mpp-prix-save-'+id).style.display='none';
}
async function mppSauverPrix(id){
  if(GP_ROLE!=='admin'){notify('Seul l\'admin peut modifier les prix','r');return;}
  const val=+document.getElementById('mpp-prix-inp-'+id).value||0;
  const ingr=GP_INGREDIENTS.find(i=>i.id===id);
  // Alerte si hausse de prix
  if(ingr&&ingr.prix_actuel>0&&val>ingr.prix_actuel){
    const pct=((val-ingr.prix_actuel)/ingr.prix_actuel*100).toFixed(1);
    if(!confirm(`⚠️ Hausse de prix détectée !\n\nPrix actuel : ${fmt(ingr.prix_actuel)} F/kg\nNouveau prix : ${fmt(val)} F/kg\nHausse : +${pct}%\n\nConfirmer quand même ?`)){
      mppAnnulerPrix(id);return;
    }
  }
  const{error}=await SB.from('gp_ingredients').update({prix_actuel:val}).eq('id',id);
  if(error){notify('Erreur: '+error.message,'r');return;}
  if(ingr)ingr.prix_actuel=val;
  document.getElementById('mpp-prix-val-'+id).textContent=fmt(val);
  mppAnnulerPrix(id);
  notify('Prix mis à jour ✓','gold');
}

// ── ÉDITION SEUIL ───────────────────────────────────
function mppEditerSeuil(id){
  document.getElementById('mpp-seuil-val-'+id).style.display='none';
  document.getElementById('mpp-seuil-inp-'+id).style.display='inline-block';
  document.getElementById('mpp-seuil-edit-'+id).style.display='none';
  document.getElementById('mpp-seuil-save-'+id).style.display='inline-flex';
  document.getElementById('mpp-seuil-inp-'+id).focus();
  document.getElementById('mpp-seuil-inp-'+id).select();
}
function mppAnnulerSeuil(id){
  document.getElementById('mpp-seuil-val-'+id).style.display='inline';
  document.getElementById('mpp-seuil-inp-'+id).style.display='none';
  document.getElementById('mpp-seuil-edit-'+id).style.display='inline-flex';
  document.getElementById('mpp-seuil-save-'+id).style.display='none';
}
async function mppSauverSeuil(id){
  const val=+document.getElementById('mpp-seuil-inp-'+id).value||100;
  const{error}=await SB.from('gp_ingredients').update({seuil_alerte:val}).eq('id',id);
  if(error){notify('Erreur: '+error.message,'r');return;}
  const ingr=GP_INGREDIENTS.find(i=>i.id===id);
  if(ingr)ingr.seuil_alerte=val;
  document.getElementById('mpp-seuil-val-'+id).textContent=fmt(val);
  document.getElementById('mpp-seuil-val-'+id).style.color='var(--text)';
  mppAnnulerSeuil(id);
  notify('Seuil critique mis à jour ✓','gold');
}

// ── AJOUTER UNE MP ──────────────────────────────────
async function saveMPPage(){
  const nom=document.getElementById('mpp_nom').value.trim();
  const prix=+document.getElementById('mpp_prix').value||0;
  const seuil=+document.getElementById('mpp_seuil').value||200;
  const prot=+document.getElementById('mpp_prot').value||null;
  const em=+document.getElementById('mpp_em').value||null;
  const fourn=document.getElementById('mpp_fourn').value.trim()||null;
  const err=document.getElementById('mpp_err');
  if(!nom){err.textContent='Nom requis.';return;}
  err.textContent='';
  const{error}=await SB.from('gp_ingredients').insert({
    admin_id:GP_ADMIN_ID,nom,prix_actuel:prix,
    unite:'kg',proteines:prot,energie:em,
    seuil_alerte:seuil,fournisseur:fourn
  });
  if(error){err.textContent='Erreur: '+error.message;return;}
  ['mpp_nom','mpp_prix','mpp_prot','mpp_em','mpp_fourn'].forEach(id=>{
    const el=document.getElementById(id);if(el)el.value='';
  });
  document.getElementById('mpp_seuil').value='200';
  await loadIngredients();
  populateSelects();
  renderMatieresPremieresPage();
  notify('"'+nom+'" ajouté ✓','gold');
}

// ── SUPPRIMER ───────────────────────────────────────
async function deleteMPPage(id,nom){
  if(!confirm(`Supprimer "${nom}" ?`))return;
  await SB.from('gp_ingredients').delete().eq('id',id);
  await loadIngredients();
  populateSelects();
  renderMatieresPremieresPage();
  notify('Matière première supprimée','r');
}

// ── SEUIL RAPIDE ────────────────────────────────────
function populateMPSelect(){
  const sel=document.getElementById('mpp_seuil_ingr');
  if(!sel)return;
  const cur=sel.value;
  sel.innerHTML='<option value="">— Sélectionner —</option>'+
    [...GP_INGREDIENTS].sort((a,b)=>a.nom.localeCompare(b.nom))
    .map(i=>`<option value="${i.id}" ${i.id===cur?'selected':''}>${i.nom}</option>`).join('');
}

function prefillSeuilRapide(){
  const id=document.getElementById('mpp_seuil_ingr').value;
  const ingr=GP_INGREDIENTS.find(i=>i.id===id);
  if(!ingr)return;
  document.getElementById('mpp_seuil_val').value=ingr.seuil_alerte||200;
  document.getElementById('mpp_seuil_actuel').textContent=
    `Seuil actuel : ${fmt(ingr.seuil_alerte||200)} kg · Prix actuel : ${fmt(ingr.prix_actuel||0)} FCFA/kg`;
}

async function sauverSeuilRapide(){
  const id=document.getElementById('mpp_seuil_ingr').value;
  const val=+document.getElementById('mpp_seuil_val').value||100;
  const err=document.getElementById('mpp_seuil_err');
  if(!id){err.textContent='Sélectionnez une matière première.';return;}
  const{error}=await SB.from('gp_ingredients').update({seuil_alerte:val}).eq('id',id);
  if(error){err.textContent='Erreur: '+error.message;return;}
  const ingr=GP_INGREDIENTS.find(i=>i.id===id);
  if(ingr)ingr.seuil_alerte=val;
  err.textContent='';
  document.getElementById('mpp_seuil_actuel').textContent=
    `✓ Seuil mis à jour : ${fmt(val)} kg`;
  renderMatieresPremieresPage();
  notify('Seuil critique mis à jour ✓','gold');
}

// ── SEUIL DYNAMIQUE ───────────────────────────────
async function calculerSeuilDynamique(){
  // Analyser la consommation des 4 dernières semaines
  const dateLimite=new Date();
  dateLimite.setDate(dateLimite.getDate()-28);
  const dateStr=dateLimite.toISOString().slice(0,10);

  const{data:sorties}=await SB.from('gp_stock_mp').select('ingredient_nom,quantite')
    .eq('admin_id',GP_ADMIN_ID)
    .eq('type','sortie_production')
    .gte('date',dateStr);

  if(!sorties?.length){notify('Pas assez de données de consommation','r');return;}

  // Calculer consommation par semaine par ingrédient
  const conso={};
  sorties.forEach(s=>{
    conso[s.ingredient_nom]=(conso[s.ingredient_nom]||0)+Number(s.quantite||0);
  });

  // Générer suggestions (2 semaines de stock)
  const suggestions=Object.entries(conso).map(([nom,total])=>{
    const parSemaine=total/4;
    const seuilSuggere=Math.ceil(parSemaine*2/50)*50; // arrondi à 50kg
    const ingr=GP_INGREDIENTS.find(i=>i.nom===nom);
    return{nom,parSemaine:parSemaine.toFixed(1),seuilActuel:ingr?.seuil_alerte||200,seuilSuggere,ingrId:ingr?.id};
  }).filter(s=>s.ingrId).sort((a,b)=>b.parSemaine-a.parSemaine);

  // Afficher dans modal
  const modal=document.getElementById('modal-seuil-dynamique');
  document.getElementById('seuil-dynamique-content').innerHTML=`
    <div style="font-size:11px;color:var(--textm);margin-bottom:12px">
      Basé sur la consommation des 4 dernières semaines. Seuil suggéré = 2 semaines de stock.
    </div>
    <div style="overflow-x:auto"><table class="tbl" style="font-size:11px">
      <thead><tr>
        <th>Ingrédient</th>
        <th class="num">Conso/semaine</th>
        <th class="num">Seuil actuel</th>
        <th class="num">Seuil suggéré</th>
        <th></th>
      </tr></thead>
      <tbody>
      ${suggestions.map(s=>`<tr>
        <td style="font-weight:600">${s.nom}</td>
        <td class="num">${s.parSemaine} kg</td>
        <td class="num" style="color:var(--textm)">${fmt(s.seuilActuel)} kg</td>
        <td class="num" style="color:${s.seuilSuggere>s.seuilActuel?'var(--gold)':'var(--green)'}">${fmt(s.seuilSuggere)} kg</td>
        <td>
          <button class="btn btn-g btn-sm" onclick="appliquerSeuilSuggere('${s.ingrId}',${s.seuilSuggere},'${s.nom}',this)">
            Appliquer
          </button>
        </td>
      </tr>`).join('')}
      </tbody>
    </table></div>
    <div style="margin-top:12px;display:flex;gap:8px">
      <button class="btn btn-g btn-sm" onclick="appliquerTousSeuilsSuggeres(${JSON.stringify(suggestions).replace(/'/g,'\\'+'')})">
        ✓ Appliquer tous
      </button>
    </div>`;
  modal.style.display='flex';
}

async function appliquerSeuilSuggere(ingrId,seuil,nom,btn){
  await SB.from('gp_ingredients').update({seuil_alerte:seuil}).eq('id',ingrId);
  const ingr=GP_INGREDIENTS.find(i=>i.id===ingrId);
  if(ingr)ingr.seuil_alerte=seuil;
  if(btn){btn.textContent='✓';btn.disabled=true;btn.classList.remove('btn-g');btn.classList.add('btn-out');}
  notify(nom+' : seuil mis à jour → '+fmt(seuil)+' kg','gold');
}

async function appliquerTousSeuilsSuggeres(suggestions){
  for(const s of suggestions){
    if(s.ingrId){
      await SB.from('gp_ingredients').update({seuil_alerte:s.seuilSuggere}).eq('id',s.ingrId);
      const ingr=GP_INGREDIENTS.find(i=>i.id===s.ingrId);
      if(ingr)ingr.seuil_alerte=s.seuilSuggere;
    }
  }
  document.getElementById('modal-seuil-dynamique').style.display='none';
  renderMatieresPremieresPage();
  notify('Tous les seuils mis à jour ✓','gold');
}
