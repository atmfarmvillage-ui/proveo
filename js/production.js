// ── PRODUCTION ─────────────────────────────────────
function onFormuleChange(){
  const nom=document.getElementById('lot_formule').value;
  const qte=+document.getElementById('lot_qte').value||0;
  if(nom)chargerCoutsFormule(nom).then(()=>previewLot());
  else previewLot();
  if(nom){
    const prix=getPrix(nom);
    // No prix input in production form — just show
  }
}
// Formule précédente pour pré-cocher une seule fois
let _lastFormule='';

// Coûts chargés depuis gp_formules
let _formuleCoûts={};

async function chargerCoutsFormule(nom){
  // Chercher dans gp_prix_formules (où les coûts sont définis via le bouton ⚙️)
  const[{data:pf},{data:gf}]=await Promise.all([
    SB.from('gp_prix_formules').select('cout_mo_tonne,cout_emballage_kg,cout_transport_lot')
      .eq('admin_id',GP_ADMIN_ID).eq('formule_nom',nom).maybeSingle(),
    SB.from('gp_formules').select('cout_mo_tonne,cout_emballage_kg,cout_transport_lot')
      .eq('admin_id',GP_ADMIN_ID).eq('nom',nom).maybeSingle()
  ]);
  const d=pf||gf;
  if(d&&(d.cout_mo_tonne||d.cout_emballage_kg||d.cout_transport_lot)){
    _formuleCoûts={mo:d.cout_mo_tonne||0,emb:d.cout_emballage_kg||0,trans:d.cout_transport_lot||0};
  } else {
    // Fallback FORMULES_SADARI
    const fs=FORMULES_SADARI.find(x=>x.nom===nom);
    _formuleCoûts={mo:fs?.cout_mo_tonne||0,emb:fs?.cout_emballage_kg||0,trans:fs?.cout_transport_lot||0};
  }
}

function previewLot(){
  const nom=document.getElementById('lot_formule')?.value;
  const qte=+document.getElementById('lot_qte')?.value||0;
  const f=getFormule(nom)||FORMULES_SADARI.find(x=>x.nom===nom)||null;
  const coutZone=document.getElementById('lot-couts-auto');

  if(!f||!nom){
    if(coutZone)coutZone.style.display='none';
    document.getElementById('lot-preview').textContent='Sélectionnez une formule et une quantité.';
    document.getElementById('lot-mp-preview').style.display='none';
    return;
  }

  if(coutZone)coutZone.style.display='block';

  // Pré-cocher cases SEULEMENT quand la formule change (pas à chaque frappe de quantité)
  if(nom!==_lastFormule){
    _lastFormule=nom;
    const avecEmbCheck=document.getElementById('lot_avec_emb');
    const avecTransCheck=document.getElementById('lot_avec_trans');
    if(avecEmbCheck)avecEmbCheck.checked=true; // coché par défaut
    if(avecTransCheck)avecTransCheck.checked=false; // décoché par défaut
  }

  if(!nom||!qte){
    document.getElementById('lot-preview').textContent='Sélectionnez une formule et une quantité.';
    document.getElementById('lot-mp-preview').style.display='none';
    return;
  }

  const avecEmb=document.getElementById('lot_avec_emb')?.checked||false;
  const avecTrans=document.getElementById('lot_avec_trans')?.checked||false;
  const avecMO=document.getElementById('lot_avec_mo')?.checked!==false;

  // Coûts : depuis la formule si disponible, sinon depuis les champs manuels
  const coutMoParTonne=_formuleCoûts.mo||f?.cout_mo_tonne||0;
  const coutEmbParKg=_formuleCoûts.emb||f?.cout_emballage_kg||0;
  const coutTransPort=_formuleCoûts.trans||f?.cout_transport_lot||0;

  const moVal=avecMO?coutMoParTonne*(qte/1000):0;
  const embVal=avecEmb?coutEmbParKg*qte:0;
  const transVal=avecTrans?coutTransPort:0;

  // Mettre à jour labels et hidden inputs
  const moLabel=document.getElementById('lot_mo_label');
  const embLabel=document.getElementById('lot_emb_label');
  const transLabel=document.getElementById('lot_trans_label');
  if(moLabel)moLabel.textContent=fmt(moVal)+' F';
  if(embLabel)embLabel.textContent=fmt(embVal)+' F';
  if(transLabel)transLabel.textContent=fmt(transVal)+' F';
  if(document.getElementById('lot_mo'))document.getElementById('lot_mo').value=moVal;
  if(document.getElementById('lot_emb'))document.getElementById('lot_emb').value=embVal;


  const prixVente=getPrix(nom);
  const margeKg=prixVente-coutTotal/Math.max(1,qte);
  document.getElementById('lot-preview').innerHTML=`
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;font-size:11px">
      ${GP_ROLE==='admin'?`<div>Coût MP : <strong style="color:var(--gold)">${fmt(coutMP)} F</strong></div>
      <div>Coût total : <strong style="color:var(--red)">${fmt(coutTotal)} F</strong></div>
      <div>Prix vente : <strong style="color:var(--g6)">${fmt(prixVente)} F/kg</strong></div>
      <div>Marge/kg : <strong style="color:${margeKg>=0?'var(--green)':'var(--red)'}">${fmt(margeKg)} F</strong></div>`
      :`<div>Formule : <strong style="color:var(--g6)">${nom}</strong></div>
      <div>Quantité : <strong style="color:var(--g6)">${fmt(qte)} kg</strong></div>`}
    </div>`;
}
async function saveLot(){
  const nom=document.getElementById('lot_formule').value;
  const date=document.getElementById('lot_date').value;
  const qte=+document.getElementById('lot_qte').value||0;
  const ref=document.getElementById('lot_ref').value.trim();
  // Lire les coûts depuis les champs hidden (mis à jour par previewLot)
  const mo=+document.getElementById('lot_mo')?.value||0;
  const emb=+document.getElementById('lot_emb')?.value||0;
  const fData=getFormule(nom);
  const avecTrans=document.getElementById('lot_avec_trans')?.checked;
  const transport=avecTrans?(_formuleCoûts.trans||fData?.cout_transport_lot||0):0;
  const obs=document.getElementById('lot_obs').value.trim();
  const pv=GP_POINT_VENTE||'';
  const err=document.getElementById('lot_err');
  if(!nom||!date||!qte){err.textContent='Formule, date et quantité requis.';return;}
  err.textContent='Enregistrement...';
  const f=getFormule(nom);
  let coutMP=0;const mpSorties=[];
  if(f){
    f.ingredients.forEach(ing=>{
      const kgNeeded=(ing.pct/100)*qte;
      const ingData=GP_INGREDIENTS.find(i=>i.nom.toLowerCase().includes(ing.nom.toLowerCase().slice(0,6)));
      if(ingData)coutMP+=kgNeeded*ingData.prix_actuel;
      mpSorties.push({nom:ing.nom,kg:kgNeeded,ingrData:ingData});
    });
  }
  const coutTotal=coutMP+mo+emb+(transport||0);
  const prixVente=getPrix(nom);
  const espece=FORMULES_SADARI.find(x=>x.nom===nom)?.espece||'';
  // Insert lot
  const{data:lot,error}=await SB.from('gp_lots').insert({
    admin_id:GP_ADMIN_ID,saisi_par:GP_USER.id,date,formule_nom:nom,espece,ref,
    qte_produite:qte,cout_mp:coutMP,cout_main_oeuvre:mo,cout_emballage:emb,
    cout_total:coutTotal,prix_vente_kg:prixVente,observations:obs,stock_mis_a_jour:true,
    poids_sac:+document.getElementById('lot_poids_sac')?.value||25,
    nb_sacs:+document.getElementById('lot_nb_sacs')?.value||0,
    kg_pertes:Math.max(0,qte-(+document.getElementById('lot_nb_sacs')?.value||0)*(+document.getElementById('lot_poids_sac')?.value||25)),
    pdv_production:document.getElementById('lot_pdv_prod')?.value||GP_POINT_VENTE||null
  }).select().maybeSingle();
  if(error){err.textContent='Erreur: '+error.message;return;}
  // Auto-create stock sorties
  for(const s of mpSorties){
    if(s.ingrData){
      await SB.from('gp_stock_mp').insert({
        admin_id:GP_ADMIN_ID,saisi_par:GP_USER.id,type:'sortie_production',date,
        ingredient_id:s.ingrData.id,ingredient_nom:s.nom,quantite:s.kg,
        prix_unit:s.ingrData.prix_actuel,lot_id:lot?.id,ref:'Production '+ref
      });
    }
  }
  err.textContent='';

  // Récupérer les valeurs sacs AVANT le reset
  const nbSacsSaves=+document.getElementById('lot_nb_sacs')?.value||0;
  const poidsSacSaves=+document.getElementById('lot_poids_sac')?.value||25;
  const pdvProdSaves=document.getElementById('lot_pdv_prod')?.value||GP_POINT_VENTE||'Production';

  ['lot_qte','lot_mo','lot_emb','lot_obs','lot_nb_sacs'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});
  document.getElementById('lot_mo').value='0';document.getElementById('lot_emb').value='0';
  document.getElementById('lot_ref').value='LOT-'+new Date().getFullYear()+'-'+String(Math.floor(Math.random()*900)+100);
  document.getElementById('lot-preview').textContent='Sélectionnez une formule et une quantité.';
  document.getElementById('lot-mp-preview').style.display='none';

  // Alimenter le stock produits finis
  if(nbSacsSaves>0&&pdvProdSaves&&typeof upsertStockPF==='function'){
    await upsertStockPF(pdvProdSaves,nom,poidsSacSaves,nbSacsSaves);
  }

  // Afficher la feuille de fabrication
  afficherFeuilleFabrication({nom,qte,poidsSac:poidsSacSaves,nbSacs:nbSacsSaves,ref,date,pdv:pdvProdSaves,lotId:lot?.id});

  notify(`✓ Lot enregistré — ${mpSorties.length} MP déduites du stock automatiquement`,'gold');
  // Afficher bouton impression immédiatement
  afficherBoutonImpressionLot(nom, ref, qte, date);
  await renderLots();
}

function afficherBoutonImpressionLot(formuleNom, numLot, qteProduite, dateLot){
  const container=document.getElementById('lot-print-zone');
  if(!container)return;
  container.style.display='block';
  container.innerHTML=`
    <div style="background:rgba(22,163,74,.1);border:1px solid rgba(22,163,74,.4);border-radius:10px;padding:14px;margin-top:12px">
      <div style="font-size:11px;font-weight:700;color:var(--g6);margin-bottom:8px">✅ Lot enregistré — Prêt à imprimer</div>
      <div style="display:flex;justify-content:space-between;font-size:11px;color:var(--textm);margin-bottom:12px">
        <span>📦 <strong style="color:var(--text)">${formuleNom}</strong></span>
        <span>🔖 <strong style="color:var(--gold)">${numLot}</strong></span>
        <span>⚖️ <strong style="color:var(--text)">${fmt(qteProduite)} kg</strong></span>
      </div>
      <button class="btn btn-print" style="width:100%;justify-content:center;font-size:13px;padding:10px"
        onclick="imprimerEtiquettesLot('${formuleNom}','${numLot}','${qteProduite}','${dateLot}')">
        🖨️ Imprimer les étiquettes du lot ${numLot}
      </button>
      <div style="font-size:10px;color:var(--textm);text-align:center;margin-top:6px">8 étiquettes par page A4 · Numéro de lot inclus</div>
    </div>`;
}
async function renderLots(){
  const filtMois=document.getElementById('lot-filtre-mois')?.value||thisMonth();
  let q=SB.from('gp_lots').select('*').eq('admin_id',GP_ADMIN_ID).order('date',{ascending:false});
  if(filtMois)q=q.gte('date',filtMois+'-01').lte('date',_finMois(filtMois));
  const{data}=await q;
  const L=data||[];
  renderBilanProduction(L);
  const total=L.reduce((s,l)=>s+Number(l.qte_produite||0),0);
  document.getElementById('lots-liste').innerHTML=`
    <div style="font-size:11px;color:var(--textm);margin-bottom:8px">Ce mois : <strong style="color:var(--g6)">${fmt(total)} kg</strong> produits · ${L.length} lots</div>
    <div style="overflow-x:auto">${L.length?`<table class="tbl" style="font-size:11px"><thead><tr><th>Date</th><th>Formule</th><th>Réf</th><th class="num">Qté (kg)</th>${GP_ROLE==='admin'?'<th class="num">Coût/kg</th>':''}<th></th></tr></thead><tbody>
    ${L.map(l=>`<tr>
      <td style="font-family:'DM Mono',monospace;font-size:10px">${l.date}</td>
      <td><div style="font-weight:600">${ESPECE_ICON[l.espece]||''} ${l.formule_nom}</div></td>
      <td style="font-size:10px;color:var(--textm)">${l.ref||'—'}</td>
      <td class="num" style="color:var(--g6)">${fmt(l.qte_produite)}</td>
      ${GP_ROLE==='admin'?`<td class="num" style="color:var(--textm)">${l.qte_produite>0?fmt(Math.round(Number(l.cout_total||0)/l.qte_produite)):0} F</td>`:''}
      <td><button class="btn btn-red btn-sm" onclick="deleteLot('${l.id}')">✕</button></td>
    </tr>`).join('')}</tbody></table>`:'<div style="color:var(--textm);font-size:12px">Aucun lot ce mois.</div>'}</div>`;
}
async function deleteLot(id){
  if(!confirm('Supprimer ce lot ? Les sorties de stock associées seront supprimées.'))return;
  await SB.from('gp_stock_mp').delete().eq('lot_id',id);
  await SB.from('gp_lots').delete().eq('id',id);
  renderLots();notify('Lot supprimé','r');
}

// ── INVENTAIRE MENSUEL ─────────────────────────────
async function renderInventaire(){
  const mois=document.getElementById('inv-mois')?.value||thisMonth();
  const debut=mois+'-01';
  const fin=finMois(mois);
  const[{data:S},{data:L},{data:Sprev}]=await Promise.all([
    SB.from('gp_stock_mp').select('*').eq('admin_id',GP_ADMIN_ID).gte('date',debut).lte('date',fin).order('date'),
    SB.from('gp_lots').select('*').eq('admin_id',GP_ADMIN_ID).gte('date',debut).lte('date',fin).order('date'),
    SB.from('gp_stock_mp').select('*').eq('admin_id',GP_ADMIN_ID).lt('date',debut),
  ]);
  const stock=S||[];const lots=L||[];
  const niveauxDebut=calcNiveaux(Sprev||[]);
  const niveauxFin={...niveauxDebut};
  stock.forEach(m=>{
    if(!niveauxFin[m.ingredient_nom])niveauxFin[m.ingredient_nom]=0;
    if(m.type==='entree')niveauxFin[m.ingredient_nom]+=Number(m.quantite||0);
    else niveauxFin[m.ingredient_nom]-=Number(m.quantite||0);
  });
  // KPIs
  const totEntrees=stock.filter(m=>m.type==='entree').reduce((s,m)=>s+Number(m.quantite||0),0);
  const totSorties=stock.filter(m=>m.type!=='entree').reduce((s,m)=>s+Number(m.quantite||0),0);
  const totProd=lots.reduce((s,l)=>s+Number(l.qte_produite||0),0);
  const valEntrees=GP_ROLE==='admin'?stock.filter(m=>m.type==='entree').reduce((s,m)=>s+Number(m.quantite||0)*Number(m.prix_unit||0),0):0;
  document.getElementById('inv-kpis').innerHTML=`
    <div class="econo-box"><div class="econo-val" style="color:var(--green)">${fmt(totEntrees)}</div><div class="econo-lbl">Kg reçus</div></div>
    <div class="econo-box"><div class="econo-val" style="color:var(--red)">${fmt(totSorties)}</div><div class="econo-lbl">Kg utilisés</div></div>
    <div class="econo-box"><div class="econo-val">${fmt(totProd)}</div><div class="econo-lbl">Kg produits</div></div>
    ${GP_ROLE==='admin'?`<div class="econo-box"><div class="econo-val" style="color:var(--gold)">${fmt(valEntrees)}</div><div class="econo-lbl">Valeur achats (F)</div></div>`:'<div class="econo-box"><div class="econo-val">${lots.length}</div><div class="econo-lbl">Lots produits</div></div>'}`;
  // Entrées
  const entrees=stock.filter(m=>m.type==='entree');
  document.getElementById('inv-entrees').innerHTML=entrees.length?`<table class="tbl" style="font-size:11px"><thead><tr><th>Date</th><th>Ingrédient</th><th class="num">Qté (kg)</th>${GP_ROLE==='admin'?'<th class="num">Valeur</th>':''}</tr></thead><tbody>
    ${entrees.map(m=>`<tr><td style="font-size:10px">${m.date}</td><td>${m.ingredient_nom}</td><td class="num good">${fmtKg(m.quantite)}</td>${GP_ROLE==='admin'?`<td class="num">${fmt(Number(m.quantite)*Number(m.prix_unit||0))} F</td>`:''}</tr>`).join('')}
    </tbody></table>`:'<div style="color:var(--textm);font-size:12px">Aucune entrée ce mois.</div>';
  // Sorties
  const sorties=stock.filter(m=>m.type!=='entree');
  document.getElementById('inv-sorties').innerHTML=sorties.length?`<table class="tbl" style="font-size:11px"><thead><tr><th>Date</th><th>Ingrédient</th><th class="num">Qté (kg)</th><th>Type</th></tr></thead><tbody>
    ${sorties.map(m=>`<tr><td style="font-size:10px">${m.date}</td><td>${m.ingredient_nom}</td><td class="num bad">${fmtKg(m.quantite)}</td><td><span class="badge ${m.type==='sortie_production'?'bdg-b':'bdg-r'}" style="font-size:9px">${m.type==='sortie_production'?'Production':'Perte'}</span></td></tr>`).join('')}
    </tbody></table>`:'<div style="color:var(--textm);font-size:12px">Aucune sortie ce mois.</div>';
  // Consommation par ingrédient
  const conso={};
  sorties.forEach(m=>{conso[m.ingredient_nom]=(conso[m.ingredient_nom]||0)+Number(m.quantite||0);});
  document.getElementById('inv-conso-table').innerHTML=Object.keys(conso).length?`<table class="tbl"><thead><tr><th>Ingrédient</th><th class="num">Consommé (kg)</th><th>% du total</th></tr></thead><tbody>
    ${Object.entries(conso).sort((a,b)=>b[1]-a[1]).map(([nom,qte])=>`<tr>
      <td style="font-weight:600">${nom}</td>
      <td class="num">${fmtKg(qte)}</td>
      <td><div style="display:flex;align-items:center;gap:8px"><div style="flex:1;height:6px;background:rgba(30,45,74,.8);border-radius:3px"><div style="width:${totSorties>0?qte/totSorties*100:0}%;height:100%;background:var(--g4);border-radius:3px"></div></div><span style="font-size:10px;color:var(--textm)">${totSorties>0?(qte/totSorties*100).toFixed(1):0}%</span></div></td>
    </tr>`).join('')}</tbody></table>`:'<div style="color:var(--textm);font-size:12px">Aucune consommation ce mois.</div>';
  // Production par formule
  const prodFormule={};
  lots.forEach(l=>{
    if(!prodFormule[l.formule_nom])prodFormule[l.formule_nom]={qte:0,espece:l.espece,nb:0};
    prodFormule[l.formule_nom].qte+=Number(l.qte_produite||0);
    prodFormule[l.formule_nom].nb++;
  });
  document.getElementById('inv-prod-table').innerHTML=Object.keys(prodFormule).length?`<table class="tbl"><thead><tr><th>Formule</th><th>Espèce</th><th class="num">Lots</th><th class="num">Qté (kg)</th><th class="num">% total</th></tr></thead><tbody>
    ${Object.entries(prodFormule).sort((a,b)=>b[1].qte-a[1].qte).map(([nom,d])=>`<tr>
      <td style="font-weight:600">${nom}</td>
      <td>${ESPECE_ICON[d.espece]||''} ${d.espece||'—'}</td>
      <td class="num">${d.nb}</td>
      <td class="num" style="color:var(--g6)">${fmt(d.qte)}</td>
      <td class="num" style="color:var(--textm)">${totProd>0?(d.qte/totProd*100).toFixed(1):0}%</td>
    </tr>`).join('')}</tbody></table>`:'<div style="color:var(--textm);font-size:12px">Aucune production ce mois.</div>';
  // Stock restant
  document.getElementById('inv-stock-restant').innerHTML=`<table class="tbl"><thead><tr><th>Ingrédient</th><th class="num">Stock début mois</th><th class="num">Reçu</th><th class="num">Utilisé</th><th class="num">Stock fin mois</th><th>Statut</th></tr></thead><tbody>
    ${Object.keys({...niveauxDebut,...niveauxFin}).sort().map(nom=>{
      const debut2=niveauxDebut[nom]||0;
      const recu=entrees.filter(m=>m.ingredient_nom===nom).reduce((s,m)=>s+Number(m.quantite),0);
      const utilise=sorties.filter(m=>m.ingredient_nom===nom).reduce((s,m)=>s+Number(m.quantite),0);
      const fin2=niveauxFin[nom]||0;
      const ingr=GP_INGREDIENTS.find(i=>i.nom===nom);
      const seuil=ingr?.seuil_alerte||200;
      return `<tr>
        <td style="font-weight:600">${nom}</td>
        <td class="num" style="color:var(--textm)">${fmtKg(debut2)}</td>
        <td class="num" style="color:var(--green)">+${fmtKg(recu)}</td>
        <td class="num" style="color:var(--red)">−${fmtKg(utilise)}</td>
        <td class="num ${fin2<seuil?fin2<=0?'bad':'warn':'good'}">${fmtKg(fin2)}</td>
        <td><span class="badge ${fin2<=0?'bdg-r':fin2<seuil?'bdg-gold':'bdg-g'}" style="font-size:9px">${fin2<=0?'Épuisé':fin2<seuil?'Bas':'OK'}</span></td>
      </tr>`;}).join('')}</tbody></table>`;
}
function exportInventaireExcel(){notify('Fonction export Excel — en cours de développement','gold');}

// ── RAPPORT PRODUCTION ─────────────────────────────
async function renderRapport(){
  const mois=document.getElementById('rpt-mois')?.value||thisMonth();
  const{data:L}=await SB.from('gp_lots').select('*').eq('admin_id',GP_ADMIN_ID).gte('date',mois+'-01').lte('date',finMois(mois)).order('date');
  const lots=L||[];
  if(!lots.length){document.getElementById('rapport-content').innerHTML='<div class="card"><div style="color:var(--textm);font-size:13px;text-align:center;padding:20px">Aucune production pour ce mois.</div></div>';return;}
  // Group by espece
  const groupEspece={};
  lots.forEach(l=>{
    const esp=l.espece||'autre';
    if(!groupEspece[esp])groupEspece[esp]={lots:[],totalKg:0,totalCout:0};
    groupEspece[esp].lots.push(l);
    groupEspece[esp].totalKg+=Number(l.qte_produite||0);
    groupEspece[esp].totalCout+=Number(l.cout_total||0);
  });
  const totKg=lots.reduce((s,l)=>s+Number(l.qte_produite||0),0);
  const totCout=lots.reduce((s,l)=>s+Number(l.cout_total||0),0);
  const nomMois=new Date(mois+'-15').toLocaleDateString('fr-FR',{month:'long',year:'numeric'});
  let html=`
    <div class="card" style="text-align:center;margin-bottom:14px">
      <div style="font-family:'Crimson Pro',serif;font-size:22px;font-weight:700">RAPPORT DE PRODUCTION</div>
      <div style="font-size:14px;color:var(--textm);margin-top:4px">${GP_CONFIG.nom_provenderie||'Provenderie'} · ${nomMois.charAt(0).toUpperCase()+nomMois.slice(1)}</div>
    </div>
    <div class="g4" style="margin-bottom:14px">
      <div class="econo-box"><div class="econo-val">${lots.length}</div><div class="econo-lbl">Lots produits</div></div>
      <div class="econo-box"><div class="econo-val" style="color:var(--g6)">${fmt(totKg)}</div><div class="econo-lbl">Kg total produits</div></div>
      <div class="econo-box"><div class="econo-val">${Object.keys(groupEspece).length}</div><div class="econo-lbl">Espèces</div></div>
      ${GP_ROLE==='admin'?`<div class="econo-box"><div class="econo-val" style="color:var(--red)">${fmt(totCout)}</div><div class="econo-lbl">Coût total (F)</div></div>`:'<div></div>'}
    </div>`;
  // Par espèce
  Object.entries(groupEspece).sort((a,b)=>b[1].totalKg-a[1].totalKg).forEach(([esp,g])=>{
    // Group by formule within espece
    const formuleG={};
    g.lots.forEach(l=>{if(!formuleG[l.formule_nom])formuleG[l.formule_nom]=0;formuleG[l.formule_nom]+=Number(l.qte_produite||0);});
    html+=`<div class="card">
      <div class="card-title"><div class="ct-left"><span>${ESPECE_ICON[esp]||'📦'} ${esp.charAt(0).toUpperCase()+esp.slice(1)}</span></div>
        <div style="font-family:'DM Mono',monospace;color:var(--g6);font-size:12px">${fmt(g.totalKg)} kg total</div>
      </div>
      <table class="tbl"><thead><tr><th>Formule</th><th class="num">Quantité (kg)</th><th class="num">% du groupe</th>${GP_ROLE==='admin'?'<th class="num">Coût</th>':''}</tr></thead><tbody>
      ${Object.entries(formuleG).sort((a,b)=>b[1]-a[1]).map(([nom,qte])=>{
        const coutF=g.lots.filter(l=>l.formule_nom===nom).reduce((s,l)=>s+Number(l.cout_total||0),0);
        return `<tr><td style="font-weight:600">${nom}</td><td class="num" style="color:var(--g6)">${fmt(qte)}</td><td class="num" style="color:var(--textm)">${g.totalKg>0?(qte/g.totalKg*100).toFixed(1):0}%</td>${GP_ROLE==='admin'?`<td class="num" style="color:var(--red)">${fmt(coutF)} F</td>`:''}</tr>`;}).join('')}
      <tr style="background:rgba(22,163,74,.05);font-weight:700"><td>SOUS-TOTAL ${esp.toUpperCase()}</td><td class="num" style="color:var(--g6)">${fmt(g.totalKg)}</td><td class="num">100%</td>${GP_ROLE==='admin'?`<td class="num" style="color:var(--red)">${fmt(g.totalCout)} F</td>`:''}</tr>
      </tbody></table>
    </div>`;
  });
  html+=`<div class="card" style="border:2px solid rgba(22,163,74,.3)">
    <div class="card-title"><div class="ct-left"><span>📊 RÉCAPITULATIF MENSUEL</span></div></div>
    <table class="tbl"><thead><tr><th>Espèce</th><th class="num">Kg</th><th class="num">% total</th></tr></thead><tbody>
    ${Object.entries(groupEspece).sort((a,b)=>b[1].totalKg-a[1].totalKg).map(([esp,g])=>`
      <tr><td>${ESPECE_ICON[esp]||''} <strong>${esp}</strong></td><td class="num" style="color:var(--g6)">${fmt(g.totalKg)}</td><td class="num">${totKg>0?(g.totalKg/totKg*100).toFixed(1):0}%</td></tr>`).join('')}
    <tr style="font-size:14px;font-weight:700;background:rgba(22,163,74,.07)"><td>TOTAL GÉNÉRAL</td><td class="num" style="color:var(--g6)">${fmt(totKg)}</td><td class="num">100%</td></tr>
    </tbody></table>
  </div>`;
  document.getElementById('rapport-content').innerHTML=html;
}
function exportRapportExcel(){notify('Export Excel en développement','gold');}
// ── ALERTES FEUILLES INCOMPLÈTES ─────────────────
async function verifierFeuillesIncompletes(){
  if(!GP_ADMIN_ID)return;
  const{data}=await SB.from('gp_fabrication_checks').select('*')
    .eq('admin_id',GP_ADMIN_ID).eq('statut','incomplet')
    .order('created_at',{ascending:false});
  const F=data||[];

  // Alerte dans la page Production
  const alertZone=document.getElementById('prod-alertes-fab');
  if(alertZone){
    if(F.length>0){
      alertZone.innerHTML=`
        <div style="background:rgba(239,68,68,.1);border:1px solid rgba(239,68,68,.3);border-radius:10px;padding:12px 16px;margin-bottom:14px">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
            <div style="font-weight:700;color:var(--red);font-size:13px">
              ⚠ ${F.length} feuille${F.length>1?'s':''} de fabrication incomplète${F.length>1?'s':''}
            </div>
            <button onclick="marquerToutesVues()" 
              style="background:rgba(239,68,68,.15);border:1px solid rgba(239,68,68,.4);color:var(--red);padding:4px 10px;border-radius:6px;cursor:pointer;font-size:11px;font-weight:600">
              ✓ Tout marquer comme vu
            </button>
          </div>
          ${F.map(f=>{
            const ingrs=f.ingredients||[];
            const manquants=ingrs.filter(i=>!i.coche);
            return`<div style="padding:8px;background:rgba(239,68,68,.05);border-radius:8px;margin-bottom:6px;font-size:11px">
              <div style="display:flex;justify-content:space-between;align-items:center;gap:8px">
                <div style="flex:1;min-width:0">
                  <strong>${f.lot_ref||'—'}</strong> · ${f.formule_nom}
                  <span style="color:var(--textm)"> · ${f.date_fab||'—'} · par ${f.operateur||'—'}</span>
                  <div style="color:var(--red);margin-top:3px">Non cochés : ${manquants.map(i=>i.nom).join(', ')}</div>
                </div>
                <div style="display:flex;gap:4px;flex-shrink:0">
                  <span class="badge bdg-r">${manquants.length} manquant${manquants.length>1?'s':''}</span>
                  <button onclick="marquerVue('${f.id}')"
                    style="background:rgba(22,163,74,.1);border:1px solid rgba(22,163,74,.3);color:var(--green);padding:3px 8px;border-radius:5px;cursor:pointer;font-size:10px" title="Marquer comme vu">
                    ✓ Vu
                  </button>
                </div>
              </div>
            </div>`;
          }).join('')}
        </div>`;
      alertZone.style.display='block';
    } else {
      alertZone.innerHTML='';
      alertZone.style.display='none';
    }
  }

  // Alerte dans le dashboard
  const dashAlert=document.getElementById('dash-fab-alerte');
  if(dashAlert){
    dashAlert.style.display=F.length>0?'block':'none';
    if(F.length>0)dashAlert.innerHTML=`
      <div style="background:rgba(239,68,68,.1);border:1px solid rgba(239,68,68,.3);border-radius:10px;padding:10px 14px;cursor:pointer" onclick="showGP('production')">
        ⚠ <strong>${F.length} feuille${F.length>1?'s':''} de fabrication incomplète${F.length>1?'s':''}</strong>
        <span style="font-size:10px;color:var(--textm)"> — Cliquer pour voir →</span>
      </div>`;
  }

  // Badge dans nav
  const navBadge=document.getElementById('nav-badge-prod');
  if(navBadge){
    navBadge.style.display=F.length>0?'inline':'none';
    navBadge.textContent=F.length;
  }
}

// ── BILAN PRODUCTION DU MOIS ─────────────────────
async function renderBilanProduction(lotsData){
  const mois=document.getElementById('lot-filtre-mois')?.value||
    (typeof _thisMonth==='function'?_thisMonth():new Date().toISOString().slice(0,7));

  // Charger si pas fourni en paramètre
  let L=lotsData;
  if(!L){
    const mDebut=mois+'-01';
    const mFin=_finMois(mois);
    const{data}=await SB.from('gp_lots').select('qte_produite,nb_sacs,poids_sac,kg_pertes,formule_nom,espece,date')
      .eq('admin_id',GP_ADMIN_ID).gte('date',mDebut).lte('date',mFin);
    L=data||[];
  }

  const el=document.getElementById('prod-bilan-mois');
  if(!el)return;
  if(!L.length){el.innerHTML='<div style="color:var(--textm);font-size:12px">Aucune production ce mois.</div>';return;}

  // Totaux globaux
  const totalKgNets=L.reduce((s,l)=>{
    const nets=Number(l.nb_sacs||0)*Number(l.poids_sac||25);
    return s+(nets>0?nets:Number(l.qte_produite||0));
  },0);
  const totalKgBruts=L.reduce((s,l)=>s+Number(l.qte_produite||0),0);
  const totalSacs=L.reduce((s,l)=>s+Number(l.nb_sacs||0),0);
  const totalPertes=L.reduce((s,l)=>s+Number(l.kg_pertes||0),0);
  const pctPertes=totalKgBruts>0?((totalPertes/totalKgBruts)*100).toFixed(2):0;

  // Regrouper par espèce
  const parEspece={};
  L.forEach(l=>{
    const esp=l.espece||'autre';
    if(!parEspece[esp])parEspece[esp]={kg:0,sacs:0,lots:0};
    const kg=Number(l.nb_sacs||0)*Number(l.poids_sac||25)||Number(l.qte_produite||0);
    parEspece[esp].kg+=kg;
    parEspece[esp].sacs+=Number(l.nb_sacs||0);
    parEspece[esp].lots++;
  });

  // Regrouper par formule
  const parFormule={};
  L.forEach(l=>{
    const f=l.formule_nom||'—';
    if(!parFormule[f])parFormule[f]={kg:0,sacs:0,lots:0,espece:l.espece};
    const kg=Number(l.nb_sacs||0)*Number(l.poids_sac||25)||Number(l.qte_produite||0);
    parFormule[f].kg+=kg;
    parFormule[f].sacs+=Number(l.nb_sacs||0);
    parFormule[f].lots++;
  });

  const especeIcon={pondeuse:'🐔',chair:'🐔',lapin:'🐰',porc:'🐷',canard:'🦆',tilapia:'🐟',goliath:'🐟',autre:'🌾'};
  const especeLabel={pondeuse:'Volaille Ponte',chair:'Volaille Chair',lapin:'Lapin',porc:'Porc',canard:'Canard Musqué',tilapia:'Tilapia',goliath:'Goliath',autre:'Autre'};

  // Trier espèces par kg décroissant
  const especesSorted=Object.entries(parEspece).sort((a,b)=>b[1].kg-a[1].kg);
  // Trier formules par kg décroissant
  const formulesSorted=Object.entries(parFormule).sort((a,b)=>b[1].kg-a[1].kg);

  el.innerHTML=`
    <!-- KPIs globaux -->
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:14px">
      <div style="background:rgba(22,163,74,.08);border:1px solid rgba(22,163,74,.2);border-radius:8px;padding:10px;text-align:center">
        <div style="font-family:'Crimson Pro',serif;font-size:24px;font-weight:700;color:var(--g6)">${fmt(Math.round(totalKgNets/1000*10)/10)} t</div>
        <div style="font-size:10px;color:var(--textm);text-transform:uppercase">Production nette</div>
        <div style="font-size:10px;color:var(--textm)">${fmt(totalKgNets)} kg</div>
      </div>
      <div style="background:rgba(245,158,11,.08);border:1px solid rgba(245,158,11,.2);border-radius:8px;padding:10px;text-align:center">
        <div style="font-family:'Crimson Pro',serif;font-size:24px;font-weight:700;color:var(--gold)">${fmt(totalSacs)}</div>
        <div style="font-size:10px;color:var(--textm);text-transform:uppercase">Sacs emballés</div>
        <div style="font-size:10px;color:var(--textm)">${L.length} lots produits</div>
      </div>
      <div style="background:rgba(239,68,68,.06);border:1px solid rgba(239,68,68,.15);border-radius:8px;padding:8px;text-align:center">
        <div style="font-size:14px;font-weight:700;color:${pctPertes>5?'var(--red)':pctPertes>2?'var(--gold)':'var(--green)'}">${fmt(totalPertes)} kg</div>
        <div style="font-size:10px;color:var(--textm)">Pertes (${pctPertes}%)</div>
      </div>
      <div style="background:rgba(14,20,40,.6);border:1px solid var(--border);border-radius:8px;padding:8px;text-align:center">
        <div style="font-size:14px;font-weight:700">${fmt(totalKgBruts)} kg</div>
        <div style="font-size:10px;color:var(--textm)">Bruts produits</div>
      </div>
    </div>

    <!-- Par espèce -->
    <div style="font-size:10px;font-weight:700;color:var(--g6);text-transform:uppercase;letter-spacing:1px;margin-bottom:8px">Par espèce</div>
    ${especesSorted.map(([esp,val])=>{
      const pct=totalKgNets>0?Math.round(val.kg/totalKgNets*100):0;
      return`<div style="margin-bottom:8px">
        <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:3px">
          <span style="font-weight:600">${especeIcon[esp]||'🌾'} ${especeLabel[esp]||esp}</span>
          <span style="font-family:'DM Mono',monospace;color:var(--gold)">${fmt(Math.round(val.kg/1000*10)/10)} t <span style="color:var(--textm);font-size:10px">(${pct}%)</span></span>
        </div>
        <div style="background:rgba(30,45,74,.8);border-radius:20px;height:5px;overflow:hidden">
          <div style="width:${pct}%;height:100%;background:linear-gradient(90deg,var(--g4),var(--g6));border-radius:20px"></div>
        </div>
        <div style="font-size:10px;color:var(--textm);margin-top:1px">${val.sacs} sacs · ${val.lots} lot${val.lots>1?'s':''}</div>
      </div>`;
    }).join('')}

    <!-- Par formule -->
    <div style="font-size:10px;font-weight:700;color:var(--g6);text-transform:uppercase;letter-spacing:1px;margin:12px 0 8px">Par formule</div>
    <table style="width:100%;border-collapse:collapse;font-size:11px">
      <thead><tr>
        <th style="text-align:left;color:var(--textm);font-weight:600;padding:4px 0;border-bottom:1px solid var(--border)">Formule</th>
        <th style="text-align:right;color:var(--textm);font-weight:600;padding:4px 0;border-bottom:1px solid var(--border)">Sacs</th>
        <th style="text-align:right;color:var(--textm);font-weight:600;padding:4px 0;border-bottom:1px solid var(--border)">Kg nets</th>
      </tr></thead>
      <tbody>
        ${formulesSorted.map(([f,val])=>`<tr>
          <td style="padding:5px 0;border-bottom:1px solid rgba(30,45,74,.3)">${especeIcon[val.espece]||'🌾'} <span style="font-weight:600">${f}</span></td>
          <td style="text-align:right;padding:5px 0;border-bottom:1px solid rgba(30,45,74,.3);font-family:'DM Mono',monospace">${val.sacs}</td>
          <td style="text-align:right;padding:5px 0;border-bottom:1px solid rgba(30,45,74,.3);color:var(--g6);font-family:'DM Mono',monospace">${fmt(val.kg)} kg</td>
        </tr>`).join('')}
        <tr style="font-weight:700">
          <td style="padding:6px 0;border-top:1px solid rgba(22,163,74,.3)">TOTAL</td>
          <td style="text-align:right;padding:6px 0;border-top:1px solid rgba(22,163,74,.3);color:var(--gold)">${fmt(totalSacs)}</td>
          <td style="text-align:right;padding:6px 0;border-top:1px solid rgba(22,163,74,.3);color:var(--g6)">${fmt(totalKgNets)} kg</td>
        </tr>
      </tbody>
    </table>`;
}

// ── GESTION ALERTES FEUILLES ─────────────────────
async function marquerVue(fabId){
  // Marquer la feuille comme "vue" en la passant à un statut neutre
  await SB.from('gp_fabrication_checks').update({statut:'incomplet_vu'}).eq('id',fabId);
  notify('Alerte masquée ✓','gold');
  verifierFeuillesIncompletes();
}

async function marquerToutesVues(){
  if(!GP_ADMIN_ID)return;
  await SB.from('gp_fabrication_checks')
    .update({statut:'incomplet_vu'})
    .eq('admin_id',GP_ADMIN_ID)
    .eq('statut','incomplet');
  notify('Toutes les alertes masquées ✓','gold');
  verifierFeuillesIncompletes();
}
