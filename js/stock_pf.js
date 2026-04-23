// ══════════════════════════════════════════════════
// PROVENDA — STOCK PRODUITS FINIS + LIVRAISONS PDV
// ══════════════════════════════════════════════════

async function renderStockPF(){
  if(!GP_ADMIN_ID)return;

  const[{data:stocks},{data:livraisons},{data:pdvs}]=await Promise.all([
    SB.from('gp_stock_produits_finis').select('*').eq('admin_id',GP_ADMIN_ID).order('pdv_nom'),
    SB.from('gp_livraisons_pdv').select('*').eq('admin_id',GP_ADMIN_ID).order('date',{ascending:false}).limit(30),
    SB.from('gp_points_vente').select('nom,type').eq('admin_id',GP_ADMIN_ID),
  ]);

  const S=stocks||[];const L=livraisons||[];const P=pdvs||[];

  // KPIs
  const totalSacs=S.reduce((s,x)=>s+Number(x.nb_sacs||0),0);
  const totalKg=S.reduce((s,x)=>s+Number(x.nb_sacs||0)*Number(x.poids_sac||25),0);
  const enAlerte=S.filter(x=>Number(x.nb_sacs||0)<=Number(x.seuil_alerte||10)).length;
  const pdvActifs=new Set(S.map(x=>x.pdv_nom)).size;

  document.getElementById('spf-kpis').innerHTML=`
    <div class="econo-box"><div class="econo-val">${fmt(totalSacs)}</div><div class="econo-lbl">Sacs en stock</div></div>
    <div class="econo-box"><div class="econo-val">${fmt(totalKg)}</div><div class="econo-lbl">Kg total</div></div>
    <div class="econo-box"><div class="econo-val" style="color:${enAlerte>0?'var(--red)':'var(--green)'}">${enAlerte}</div><div class="econo-lbl">Alertes stock</div></div>
    <div class="econo-box"><div class="econo-val">${pdvActifs}</div><div class="econo-lbl">PDV actifs</div></div>`;

  // Filtre PDV
  const filtre=document.getElementById('spf-filtre-pdv');
  const filtreVal=filtre?.value||'';
  if(filtre&&filtre.options.length<=1){
    const pdvNoms=[...new Set(S.map(x=>x.pdv_nom))];
    pdvNoms.forEach(n=>{const o=document.createElement('option');o.value=n;o.textContent=n;filtre.appendChild(o);});
  }

  // Stock par PDV
  const filtered=filtreVal?S.filter(x=>x.pdv_nom===filtreVal):S;
  const grouped={};
  filtered.forEach(x=>{
    if(!grouped[x.pdv_nom])grouped[x.pdv_nom]=[];
    grouped[x.pdv_nom].push(x);
  });

  document.getElementById('spf-liste').innerHTML=Object.entries(grouped).map(([pdv,items])=>{
    const rows=items.sort((a,b)=>a.formule_nom.localeCompare(b.formule_nom)).map(item=>{
      const alerte=Number(item.nb_sacs||0)<=Number(item.seuil_alerte||10);
      const epuise=Number(item.nb_sacs||0)===0;
      return`<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid rgba(30,45,74,.3)">
        <div>
          <div style="font-size:12px;font-weight:600">${item.formule_nom}</div>
          <div style="font-size:10px;color:var(--textm)">${item.poids_sac} kg/sac · ${fmt(Number(item.nb_sacs||0)*Number(item.poids_sac||25))} kg</div>
        </div>
        <div style="text-align:right">
          <div style="font-size:18px;font-weight:700;color:${epuise?'var(--red)':alerte?'var(--gold)':'var(--g6)'}">${item.nb_sacs} sacs</div>
          <span class="badge ${epuise?'bdg-r':alerte?'bdg-gold':'bdg-g'}" style="font-size:9px">${epuise?'⛔ ÉPUISÉ':alerte?'⚠ FAIBLE':'✅ OK'}</span>
        </div>
      </div>`;
    }).join('');

    const sacsPDV=items.reduce((s,x)=>s+Number(x.nb_sacs||0),0);
    return`<div style="margin-bottom:14px">
      <div style="font-size:11px;font-weight:700;color:var(--g6);text-transform:uppercase;letter-spacing:1px;padding:6px 0;border-bottom:1px solid rgba(22,163,74,.2);margin-bottom:6px;display:flex;justify-content:space-between">
        <span>📍 ${pdv}</span>
        <span style="color:var(--textm)">${sacsPDV} sacs total</span>
      </div>
      ${rows||'<div style="color:var(--textm);font-size:11px;padding:4px 0">Aucun stock.</div>'}
    </div>`;
  }).join('')||'<div style="color:var(--textm);font-size:12px;padding:10px">Aucun stock produits finis enregistré.</div>';

  // Peupler selects BL
  populateBLSelects(P,S);

  // Historique livraisons
  document.getElementById('bl-historique').innerHTML=L.length?`
    <table class="tbl" style="font-size:11px">
      <thead><tr><th>Date</th><th>Réf</th><th>De → Vers</th><th>Formule</th><th class="num">Sacs</th></tr></thead>
      <tbody>${L.map(l=>`<tr>
        <td>${l.date}</td>
        <td style="font-size:10px;color:var(--textm)">${l.ref||'—'}</td>
        <td style="font-size:10px">${l.pdv_source} → ${l.pdv_dest}</td>
        <td style="font-size:10px">${l.formule_nom}</td>
        <td class="num" style="font-weight:700">${l.nb_sacs} sacs</td>
      </tr>`).join('')}</tbody>
    </table>`
    :'<div style="color:var(--textm);font-size:12px">Aucune livraison.</div>';

  // Date par défaut
  const blDate=document.getElementById('bl_date');
  if(blDate&&!blDate.value)blDate.value=typeof today==='function'?today():new Date().toISOString().slice(0,10);

  // Réf auto
  const blRef=document.getElementById('bl_ref');
  if(blRef&&!blRef.value)blRef.value='BL-'+new Date().getFullYear()+'-'+String(Math.floor(Math.random()*900)+100);
}

function populateBLSelects(pdvs, stocks){
  const pdvNoms=[...new Set([...(pdvs||[]).map(p=>p.nom),...(stocks||[]).map(s=>s.pdv_nom)])].sort();

  ['bl_source','bl_dest'].forEach(id=>{
    const el=document.getElementById(id);
    if(!el)return;
    const val=el.value;
    el.innerHTML='<option value="">— Sélectionner —</option>'+
      pdvNoms.map(n=>`<option value="${n}">${n}</option>`).join('');
    if(val)el.value=val;
  });

  // Formules
  const blForm=document.getElementById('bl_formule');
  if(blForm&&blForm.options.length<=1){
    const formules=[...new Set((stocks||[]).map(s=>s.formule_nom))].sort();
    formules.forEach(f=>{const o=document.createElement('option');o.value=f;o.textContent=f;blForm.appendChild(o);});
    // Ajouter aussi les formules SADARI
    if(typeof FORMULES_SADARI!=='undefined'){
      FORMULES_SADARI.forEach(f=>{
        if(!formules.includes(f.nom)){const o=document.createElement('option');o.value=f.nom;o.textContent=f.nom;blForm.appendChild(o);}
      });
    }
  }
}

async function onBLSourceChange(){
  const source=document.getElementById('bl_source')?.value;
  const formule=document.getElementById('bl_formule')?.value;
  const poids=document.getElementById('bl_poids_sac')?.value||25;
  if(source&&formule)await afficherStockDispo(source,formule,poids);
}

async function onBLFormuleChange(){
  await onBLSourceChange();
}

async function afficherStockDispo(pdv,formule,poids){
  const{data}=await SB.from('gp_stock_produits_finis').select('nb_sacs,poids_sac')
    .eq('admin_id',GP_ADMIN_ID).eq('pdv_nom',pdv).eq('formule_nom',formule).eq('poids_sac',+poids).maybeSingle();
  const dispo=data?.nb_sacs||0;
  const el=document.getElementById('bl-stock-dispo');
  if(el)el.innerHTML=`<span style="color:${dispo>0?'var(--green)':'var(--red)'}">
    ${dispo>0?'✅':'⛔'} Stock disponible à <strong>${pdv}</strong> : <strong>${dispo} sacs</strong> de ${formule}
  </span>`;
}

function calcBL(){
  const nb=+document.getElementById('bl_nb_sacs')?.value||0;
  const poids=+document.getElementById('bl_poids_sac')?.value||25;
  const el=document.getElementById('bl-stock-dispo');
  const kgEl=document.getElementById('bl-kg-total');
  if(kgEl)kgEl.textContent=`= ${fmt(nb*poids)} kg`;
}

async function saveBonLivraison(){
  const ref=document.getElementById('bl_ref')?.value.trim();
  const date=document.getElementById('bl_date')?.value;
  const source=document.getElementById('bl_source')?.value;
  const dest=document.getElementById('bl_dest')?.value;
  const formule=document.getElementById('bl_formule')?.value;
  const poids=+document.getElementById('bl_poids_sac')?.value||25;
  const nb=+document.getElementById('bl_nb_sacs')?.value||0;
  const note=document.getElementById('bl_note')?.value.trim()||null;
  const err=document.getElementById('bl_err');

  if(!source||!dest||!formule||!nb){err.textContent='Remplissez tous les champs.';return;}
  if(source===dest){err.textContent='Source et destination doivent être différentes.';return;}

  // Vérifier stock disponible à la source
  const{data:stockSrc}=await SB.from('gp_stock_produits_finis').select('nb_sacs,id')
    .eq('admin_id',GP_ADMIN_ID).eq('pdv_nom',source).eq('formule_nom',formule).eq('poids_sac',poids).maybeSingle();

  if(!stockSrc||Number(stockSrc.nb_sacs||0)<nb){
    err.textContent=`Stock insuffisant à ${source} : seulement ${stockSrc?.nb_sacs||0} sacs disponibles.`;
    return;
  }

  err.textContent='Enregistrement...';

  // Enregistrer le bon de livraison
  const{error}=await SB.from('gp_livraisons_pdv').insert({
    admin_id:GP_ADMIN_ID,ref,date,
    pdv_source:source,pdv_dest:dest,
    formule_nom:formule,nb_sacs:nb,poids_sac:poids,
    statut:'livre',note,saisi_par:GP_USER?.id
  });
  if(error){err.textContent='Erreur: '+error.message;return;}

  // Déduire du stock source
  await SB.from('gp_stock_produits_finis').update({
    nb_sacs:Number(stockSrc.nb_sacs)-nb,
    updated_at:new Date().toISOString()
  }).eq('id',stockSrc.id);

  // Ajouter au stock destination
  await upsertStockPF(dest,formule,poids,+nb);

  err.textContent='';
  notify(`✅ ${nb} sacs livrés de ${source} → ${dest}`,'gold');
  document.getElementById('bl_nb_sacs').value='';
  document.getElementById('bl_note').value='';
  document.getElementById('bl_ref').value='BL-'+new Date().getFullYear()+'-'+String(Math.floor(Math.random()*900)+100);
  await renderStockPF();
}

// Upsert stock produits finis (ajouter ou créer)
async function upsertStockPF(pdv, formule, poids, delta){
  const{data:existing}=await SB.from('gp_stock_produits_finis').select('id,nb_sacs')
    .eq('admin_id',GP_ADMIN_ID).eq('pdv_nom',pdv).eq('formule_nom',formule).eq('poids_sac',poids).maybeSingle();

  if(existing){
    await SB.from('gp_stock_produits_finis').update({
      nb_sacs:Math.max(0,Number(existing.nb_sacs||0)+delta),
      updated_at:new Date().toISOString()
    }).eq('id',existing.id);
  } else {
    await SB.from('gp_stock_produits_finis').insert({
      admin_id:GP_ADMIN_ID,pdv_nom:pdv,formule_nom:formule,
      poids_sac:poids,nb_sacs:Math.max(0,delta),seuil_alerte:10
    });
  }
}

// ── FEUILLE DE FABRICATION ────────────────────────
function afficherFeuilleFabrication(lot){
  const{nom,qte,poidsSac,nbSacs,ref,date,pdv}=lot;
  const f=FORMULES_SADARI.find(x=>x.nom===nom);
  if(!f){notify('Formule non trouvée','r');return;}

  const modal=document.getElementById('modal-fabrication');
  document.getElementById('fab-ref').textContent=`Réf : ${ref||'—'} · ${date}`;

  const kgNets=nbSacs*poidsSac;
  const kgBruts=qte;
  const pertes=Math.max(0,kgBruts-kgNets);

  document.getElementById('fab-header').innerHTML=`
    <div><span style="color:var(--textm)">Formule</span><br><strong>${nom}</strong></div>
    <div><span style="color:var(--textm)">PDV Production</span><br><strong>${pdv||'—'}</strong></div>
    <div><span style="color:var(--textm)">Quantité brute</span><br><strong style="color:var(--gold)">${fmt(kgBruts)} kg</strong></div>
    <div><span style="color:var(--textm)">Sacs emballés</span><br><strong style="color:var(--green)">${nbSacs} sacs × ${poidsSac} kg = ${fmt(kgNets)} kg</strong></div>
    <div><span style="color:var(--textm)">Pertes</span><br><strong style="color:${pertes>0?'var(--red)':'var(--green)'}">${fmt(pertes)} kg (${kgBruts>0?((pertes/kgBruts)*100).toFixed(1):0}%)</strong></div>
    <div><span style="color:var(--textm)">Technicien</span><br><input type="text" id="fab-tech" placeholder="Nom du technicien" style="font-size:11px;padding:3px 6px"></div>`;

  // Ingrédients avec cases à cocher
  const ingrs=f.ingredients||[];
  document.getElementById('fab-ingredients').innerHTML=ingrs.map((ing,i)=>{
    const kg=(ing.pct/100)*kgBruts;
    return`<div id="fab-ing-${i}" style="display:flex;align-items:center;gap:10px;padding:10px 12px;border-radius:8px;margin-bottom:4px;background:rgba(14,20,40,.4);border:1px solid rgba(30,45,74,.3);transition:all .2s">
      <input type="checkbox" id="fab-chk-${i}" onchange="onFabCheck(${i},${ingrs.length})"
        style="width:20px;height:20px;cursor:pointer;accent-color:var(--g4);flex-shrink:0">
      <div style="flex:1">
        <div style="font-size:13px;font-weight:600">${ing.nom}</div>
        <div style="font-size:10px;color:var(--textm)">${ing.pct}% de la formule</div>
      </div>
      <div style="text-align:right">
        <div style="font-family:'DM Mono',monospace;font-size:16px;font-weight:700;color:var(--gold)">${fmtKg(kg)} kg</div>
        <div style="font-size:10px;color:var(--textm)">${Math.ceil(kg)} kg arrondi</div>
      </div>
    </div>`;
  }).join('');

  mettreAJourProgression(ingrs.length);
  document.getElementById('fab-alerte-fin').style.display='none';
  modal.style.display='block';
}

function onFabCheck(idx, total){
  const chk=document.getElementById('fab-chk-'+idx);
  const row=document.getElementById('fab-ing-'+idx);
  if(chk?.checked){
    row.style.background='rgba(22,163,74,.12)';
    row.style.borderColor='rgba(22,163,74,.4)';
  } else {
    row.style.background='rgba(14,20,40,.4)';
    row.style.borderColor='rgba(30,45,74,.3)';
  }
  mettreAJourProgression(total);
}

function mettreAJourProgression(total){
  let coches=0;
  for(let i=0;i<total;i++){if(document.getElementById('fab-chk-'+i)?.checked)coches++;}
  const pct=total>0?Math.round(coches/total*100):0;
  const bar=document.getElementById('fab-progress-bar');
  const prog=document.getElementById('fab-progression');
  if(bar)bar.style.width=pct+'%';
  if(prog)prog.textContent=`${coches} / ${total} ingrédients ajoutés (${pct}%)`;
  const alerte=document.getElementById('fab-alerte-fin');
  if(alerte)alerte.style.display=coches===total&&total>0?'block':'none';
}

function toutCocher(){
  let i=0;
  while(document.getElementById('fab-chk-'+i)){
    const chk=document.getElementById('fab-chk-'+i);
    const row=document.getElementById('fab-ing-'+i);
    chk.checked=true;
    row.style.background='rgba(22,163,74,.12)';
    row.style.borderColor='rgba(22,163,74,.4)';
    i++;
  }
  mettreAJourProgression(i);
}

function reinitCoches(){
  let i=0;
  while(document.getElementById('fab-chk-'+i)){
    const chk=document.getElementById('fab-chk-'+i);
    const row=document.getElementById('fab-ing-'+i);
    chk.checked=false;
    row.style.background='rgba(14,20,40,.4)';
    row.style.borderColor='rgba(30,45,74,.3)';
    i++;
  }
  mettreAJourProgression(i);
  document.getElementById('fab-alerte-fin').style.display='none';
}

function fermerFabrication(){
  document.getElementById('modal-fabrication').style.display='none';
}
