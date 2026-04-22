// ══════════════════════════════════════════════════
// PROVENDA — MODULE RAPPORTS & BILAN
// Sprint 4 : Drill-down · Bilan annuel · WhatsApp
// ══════════════════════════════════════════════════

// ── BILAN MENSUEL DRILL-DOWN ──────────────────────
async function renderBilanAvance(){
  const mois=document.getElementById('bilan-mois')?.value||thisMonth();
  const[annee,moisNum]=mois.split('-');

  // Charger données parallèlement
  // Debug : vérifier GP_ADMIN_ID
  if(!GP_ADMIN_ID){
    document.getElementById('bilan-kpis').innerHTML='<div style="color:var(--red)">Erreur : non connecté.</div>';
    return;
  }

  const[ventesRes,depRes,lotsRes,salRes]=await Promise.all([
    SB.from('gp_ventes').select('montant_total,montant_paye,statut_paiement,point_vente,date')
      .eq('admin_id',GP_ADMIN_ID).gte('date',mois+'-01').lte('date',finMois(mois)),
    SB.from('gp_depenses').select('montant,categorie,description,point_vente,date,prix_unitaire,quantite')
      .eq('admin_id',GP_ADMIN_ID).gte('date',mois+'-01').lte('date',finMois(mois)),
    SB.from('gp_lots').select('formule_nom,quantite_kg,cout_total,date')
      .eq('admin_id',GP_ADMIN_ID).gte('date',mois+'-01').lte('date',finMois(mois)),
    SB.from('gp_salaires').select('montant,nom_prenom')
      .eq('admin_id',GP_ADMIN_ID).eq('mois',mois)
  ]);

  const ventes=ventesRes.data||[];
  const depenses=depRes.data||[];
  const lots=lotsRes.data||[];
  const salaires=salRes.data||[];

  const totalVentes=ventes.reduce((s,v)=>s+Number(v.montant_total||0),0);
  const totalEncaisse=ventes.reduce((s,v)=>s+Number(v.montant_paye||0),0);
  const totalDep=depenses.reduce((s,d)=>s+Number(d.montant||0),0);
  const totalSal=salaires.reduce((s,x)=>s+Number(x.montant||0),0);
  const totalProd=lots.reduce((s,l)=>s+Number(l.quantite_kg||0),0);
  const benefice=totalEncaisse-totalDep-totalSal;

  // KPIs
  document.getElementById('bilan-kpis').innerHTML=`
    <div class="econo-box"><div class="econo-val" style="color:var(--gold)">${fmt(totalVentes)}</div><div class="econo-lbl">CA total (F)</div></div>
    <div class="econo-box"><div class="econo-val" style="color:var(--green)">${fmt(totalEncaisse)}</div><div class="econo-lbl">Encaissé (F)</div></div>
    <div class="econo-box"><div class="econo-val" style="color:var(--red)">${fmt(totalDep+totalSal)}</div><div class="econo-lbl">Dépenses (F)</div></div>
    <div class="econo-box"><div class="econo-val" style="color:${benefice>=0?'var(--green)':'var(--red)'}">${fmt(benefice)}</div><div class="econo-lbl">Bénéfice net (F)</div></div>`;

  // Dépenses groupées par catégorie (drill-down)
  const depParCat={};
  depenses.forEach(d=>{
    const cat=d.categorie||'Autre';
    if(!depParCat[cat])depParCat[cat]={total:0,items:[]};
    depParCat[cat].total+=Number(d.montant||0);
    depParCat[cat].items.push(d);
  });
  if(totalSal>0){
    depParCat['Salaires']={total:totalSal,items:salaires.map(s=>({description:s.nom_prenom,montant:s.montant}))};
  }

  const catHtml=Object.entries(depParCat)
    .sort((a,b)=>b[1].total-a[1].total)
    .map(([cat,data])=>`
      <div style="border:1px solid var(--border);border-radius:8px;margin-bottom:6px;overflow:hidden">
        <div onclick="toggleDrillDown('dd-${cat.replace(/\s/g,'-')}')"
          style="display:flex;justify-content:space-between;align-items:center;padding:10px 14px;cursor:pointer;background:rgba(14,20,40,.6)">
          <div style="font-weight:600;font-size:12px">${cat}</div>
          <div style="display:flex;align-items:center;gap:10px">
            <span style="color:var(--red);font-weight:700">${fmt(data.total)} F</span>
            <span style="color:var(--textm);font-size:12px">▼</span>
          </div>
        </div>
        <div id="dd-${cat.replace(/\s/g,'-')}" style="display:none;padding:8px 14px">
          ${data.items.map(i=>`
            <div style="display:flex;justify-content:space-between;font-size:11px;padding:4px 0;border-bottom:1px solid rgba(30,45,74,.4)">
              <span style="color:var(--textm)">${i.description||'—'}${i.point_vente?` · ${i.point_vente}`:''}</span>
              <span style="color:var(--red)">${fmt(i.montant)} F</span>
            </div>`).join('')}
        </div>
      </div>`).join('');

  // Ventes par point de vente
  const ventesPDV={};
  ventes.forEach(v=>{
    const pv=v.point_vente||'Siège';
    if(!ventesPDV[pv])ventesPDV[pv]={total:0,count:0};
    ventesPDV[pv].total+=Number(v.montant_total||0);
    ventesPDV[pv].count++;
  });

  document.getElementById('bilan-content').innerHTML=`
    <div class="g2" style="align-items:start">
      <div>
        <div style="font-size:11px;font-weight:700;color:var(--g6);text-transform:uppercase;letter-spacing:1px;margin-bottom:10px">Dépenses par catégorie</div>
        ${catHtml||'<div style="color:var(--textm);font-size:12px">Aucune dépense ce mois.</div>'}
      </div>
      <div>
        <div style="font-size:11px;font-weight:700;color:var(--g6);text-transform:uppercase;letter-spacing:1px;margin-bottom:10px">Ventes par point de vente</div>
        ${Object.entries(ventesPDV).map(([pv,data])=>`
          <div style="display:flex;justify-content:space-between;padding:10px;background:rgba(14,20,40,.6);border:1px solid var(--border);border-radius:8px;margin-bottom:6px">
            <div>
              <div style="font-weight:600;font-size:12px">📍 ${pv}</div>
              <div style="font-size:10px;color:var(--textm)">${data.count} vente${data.count>1?'s':''}</div>
            </div>
            <div style="font-weight:700;color:var(--gold)">${fmt(data.total)} F</div>
          </div>`).join('')||'<div style="color:var(--textm);font-size:12px">Aucune vente.</div>'}
        <div style="margin-top:12px">
          <div style="font-size:11px;font-weight:700;color:var(--g6);text-transform:uppercase;letter-spacing:1px;margin-bottom:10px">Production</div>
          ${lots.map(l=>`
            <div style="display:flex;justify-content:space-between;font-size:11px;padding:6px 0;border-bottom:1px solid rgba(30,45,74,.3)">
              <span style="font-weight:600">${l.formule_nom}</span>
              <span style="color:var(--g6)">${l.quantite_kg} kg</span>
            </div>`).join('')||'<div style="color:var(--textm);font-size:12px">Aucun lot ce mois.</div>'}
          ${lots.length?`<div style="font-weight:700;font-size:12px;padding:6px 0;color:var(--gold)">Total : ${fmt(totalProd)} kg</div>`:''}
        </div>
      </div>
    </div>
    <div style="margin-top:14px;display:flex;gap:8px;flex-wrap:wrap">
      <button class="btn btn-g btn-sm" onclick="envoyerBilanWhatsApp('${mois}')">📲 Envoyer bilan WhatsApp</button>
      <button class="btn btn-print btn-sm" onclick="imprimerBilan('${mois}')">🖨️ Imprimer</button>
    </div>`;
}

function toggleDrillDown(id){
  const el=document.getElementById(id);
  if(!el)return;
  el.style.display=el.style.display==='none'?'block':'none';
}

// ── BILAN ANNUEL ──────────────────────────────────
async function renderBilanAnnuel(){
  const annee=document.getElementById('bilan-annee')?.value||new Date().getFullYear();
  const mois=['01','02','03','04','05','06','07','08','09','10','11','12'];
  const nomsMois=['Jan','Fév','Mar','Avr','Mai','Jun','Jul','Aoû','Sep','Oct','Nov','Déc'];

  const donnees=await Promise.all(mois.map(async(m)=>{
    const moisStr=`${annee}-${m}`;
    const[v,d,s]=await Promise.all([
      SB.from('gp_ventes').select('montant_paye').eq('admin_id',GP_ADMIN_ID)
        .gte('date',moisStr+'-01').lte('date',moisStrfinMois(mois)),
      SB.from('gp_depenses').select('montant').eq('admin_id',GP_ADMIN_ID)
        .gte('date',moisStr+'-01').lte('date',moisStrfinMois(mois)),
      SB.from('gp_salaires').select('montant').eq('admin_id',GP_ADMIN_ID).eq('mois',moisStr)
    ]);
    const recettes=(v.data||[]).reduce((s,x)=>s+Number(x.montant_paye||0),0);
    const charges=(d.data||[]).reduce((s,x)=>s+Number(x.montant||0),0)+
                  (s.data||[]).reduce((s,x)=>s+Number(x.montant||0),0);
    return{mois:nomsMois[+m-1],recettes,charges,benefice:recettes-charges};
  }));

  const totalRec=donnees.reduce((s,d)=>s+d.recettes,0);
  const totalCha=donnees.reduce((s,d)=>s+d.charges,0);
  const totalBen=totalRec-totalCha;

  document.getElementById('bilan-annuel-content').innerHTML=`
    <div class="g4" style="margin-bottom:14px">
      <div class="econo-box"><div class="econo-val" style="color:var(--green)">${fmt(totalRec)}</div><div class="econo-lbl">Recettes annuelles</div></div>
      <div class="econo-box"><div class="econo-val" style="color:var(--red)">${fmt(totalCha)}</div><div class="econo-lbl">Charges annuelles</div></div>
      <div class="econo-box"><div class="econo-val" style="color:${totalBen>=0?'var(--gold)':'var(--red)'}">${fmt(totalBen)}</div><div class="econo-lbl">Bénéfice annuel</div></div>
      <div class="econo-box"><div class="econo-val">${totalRec>0?(totalBen/totalRec*100).toFixed(1)+'%':'—'}</div><div class="econo-lbl">Marge nette</div></div>
    </div>
    <div style="overflow-x:auto"><table class="tbl" style="font-size:11px">
      <thead><tr>
        <th>Mois</th><th class="num">Recettes</th><th class="num">Charges</th>
        <th class="num">Bénéfice</th><th>Tendance</th>
      </tr></thead>
      <tbody>
      ${donnees.map((d,i)=>{
        const prev=i>0?donnees[i-1].benefice:0;
        const trend=i>0?d.benefice>prev?'📈':d.benefice<prev?'📉':'➡':'—';
        return `<tr onclick="goToBilanMois('${annee}-${mois[i]}')" style="cursor:pointer" onmouseover="this.style.background='rgba(22,163,74,.05)'" onmouseout="this.style.background=''">
          <td style="font-weight:600">${d.mois}</td>
          <td class="num" style="color:var(--green)">${d.recettes>0?fmt(d.recettes)+' F':'—'}</td>
          <td class="num" style="color:var(--red)">${d.charges>0?fmt(d.charges)+' F':'—'}</td>
          <td class="num" style="color:${d.benefice>=0?'var(--gold)':'var(--red)'}">
            ${d.recettes>0||d.charges>0?fmt(d.benefice)+' F':'—'}
          </td>
          <td style="font-size:14px">${trend}</td>
        </tr>`;}).join('')}
      <tr style="font-weight:700;background:rgba(22,163,74,.05)">
        <td>TOTAL</td>
        <td class="num" style="color:var(--green)">${fmt(totalRec)} F</td>
        <td class="num" style="color:var(--red)">${fmt(totalCha)} F</td>
        <td class="num" style="color:${totalBen>=0?'var(--gold)':'var(--red)'}">${fmt(totalBen)} F</td>
        <td></td>
      </tr>
      </tbody>
    </table></div>
    <div style="margin-top:10px;font-size:10px;color:var(--textm)">💡 Cliquez sur un mois pour voir le bilan détaillé</div>`;
}

function goToBilanMois(mois){
  document.getElementById('bilan-mois').value=mois;
  document.getElementById('bilan-tab-mensuel').click();
  renderBilanAvance();
}

// ── ENVOI BILAN WHATSAPP ──────────────────────────
async function envoyerBilanWhatsApp(mois){
  const cfg=GP_CONFIG||{};
  const apikey=cfg.callmebot_apikey||'';
  const tel=(cfg.tel_alerte_stock||cfg.telephone||'').replace(/[\s\-\+]/g,'').replace(/^228/,'');

  const[ventesRes,depRes,salRes]=await Promise.all([
    SB.from('gp_ventes').select('montant_total,montant_paye').eq('admin_id',GP_ADMIN_ID)
      .gte('date',mois+'-01').lte('date',finMois(mois)),
    SB.from('gp_depenses').select('montant').eq('admin_id',GP_ADMIN_ID)
      .gte('date',mois+'-01').lte('date',finMois(mois)),
    SB.from('gp_salaires').select('montant').eq('admin_id',GP_ADMIN_ID).eq('mois',mois)
  ]);

  const totalVentes=(ventesRes.data||[]).reduce((s,v)=>s+Number(v.montant_total||0),0);
  const encaisse=(ventesRes.data||[]).reduce((s,v)=>s+Number(v.montant_paye||0),0);
  const depenses=(depRes.data||[]).reduce((s,d)=>s+Number(d.montant||0),0);
  const salaires=(salRes.data||[]).reduce((s,x)=>s+Number(x.montant||0),0);
  const benefice=encaisse-depenses-salaires;

  const texte=
    `📊 *Bilan Mensuel — ${mois}*\n`+
    `*${cfg.nom_provenderie||'PROVENDA'}*\n\n`+
    `💰 CA total : ${fmt(totalVentes)} F\n`+
    `✅ Encaissé : ${fmt(encaisse)} F\n`+
    `💸 Dépenses : ${fmt(depenses)} F\n`+
    `👤 Salaires : ${fmt(salaires)} F\n`+
    `━━━━━━━━━━━━━━\n`+
    `${benefice>=0?'📈':'📉'} Bénéfice net : *${fmt(benefice)} F*\n\n`+
    `_Envoyé via PROVENDA_`;

  if(apikey&&tel){
    const url=`https://api.callmebot.com/whatsapp.php?phone=228${tel}&text=${encodeURIComponent(texte)}&apikey=${apikey}`;
    fetch(url).then(()=>notify('Bilan envoyé via WhatsApp ✓','gold')).catch(()=>{});
  } else {
    const msg=encodeURIComponent(texte);
    window.open(`https://wa.me/?text=${msg}`,'_blank');
  }
}

// ── RAPPORT PRODUCTION ────────────────────────────
async function renderRapportProduction(){
  const mois=document.getElementById('rapport-mois')?.value||thisMonth();
  const{data:lots}=await SB.from('gp_lots').select('*')
    .eq('admin_id',GP_ADMIN_ID)
    .gte('date',mois+'-01').lte('date',finMois(mois))
    .order('date',{ascending:false});
  const L=lots||[];

  // Grouper par formule
  const parFormule={};
  L.forEach(l=>{
    if(!parFormule[l.formule_nom])parFormule[l.formule_nom]={lots:[],total_kg:0,cout_total:0};
    parFormule[l.formule_nom].lots.push(l);
    parFormule[l.formule_nom].total_kg+=Number(l.quantite_kg||0);
    parFormule[l.formule_nom].cout_total+=Number(l.cout_total||0);
  });

  const totalKg=L.reduce((s,l)=>s+Number(l.quantite_kg||0),0);
  const totalCout=L.reduce((s,l)=>s+Number(l.cout_total||0),0);

  document.getElementById('rapport-prod-kpis').innerHTML=`
    <div class="econo-box"><div class="econo-val">${L.length}</div><div class="econo-lbl">Lots produits</div></div>
    <div class="econo-box"><div class="econo-val" style="color:var(--gold)">${fmt(totalKg)}</div><div class="econo-lbl">Total kg</div></div>
    <div class="econo-box"><div class="econo-val" style="color:var(--red)">${fmt(totalCout)}</div><div class="econo-lbl">Coût production (F)</div></div>
    <div class="econo-box"><div class="econo-val">${totalKg>0?fmt(Math.round(totalCout/totalKg)):'-'}</div><div class="econo-lbl">Coût/kg moyen</div></div>`;

  document.getElementById('rapport-prod-content').innerHTML=`
    ${Object.entries(parFormule).map(([nom,data])=>`
      <div style="border:1px solid var(--border);border-radius:8px;margin-bottom:8px;overflow:hidden">
        <div onclick="toggleDrillDown('rp-${nom.replace(/\s/g,'-')}')"
          style="display:flex;justify-content:space-between;align-items:center;padding:10px 14px;cursor:pointer;background:rgba(14,20,40,.6)">
          <div style="font-weight:600">${nom}</div>
          <div style="display:flex;gap:16px;align-items:center">
            <span style="font-size:11px;color:var(--g6)">${data.lots.length} lot${data.lots.length>1?'s':''}</span>
            <span style="color:var(--gold);font-weight:700">${fmt(data.total_kg)} kg</span>
            <span style="color:var(--textm);font-size:12px">▼</span>
          </div>
        </div>
        <div id="rp-${nom.replace(/\s/g,'-')}" style="display:none;padding:0">
          <table class="tbl" style="font-size:11px">
            <thead><tr><th>Date</th><th>Réf lot</th><th class="num">Quantité</th><th class="num">Coût</th></tr></thead>
            <tbody>${data.lots.map(l=>`<tr>
              <td style="font-size:10px">${l.date}</td>
              <td style="font-size:10px;color:var(--textm)">${l.reference||'—'}</td>
              <td class="num">${fmt(l.quantite_kg)} kg</td>
              <td class="num" style="color:var(--textm)">${fmt(l.cout_total)} F</td>
            </tr>`).join('')}</tbody>
          </table>
        </div>
      </div>`).join('')||'<div style="color:var(--textm);font-size:12px">Aucune production ce mois.</div>'}
    <div style="margin-top:12px;display:flex;gap:8px;flex-wrap:wrap">
      <button class="btn btn-g btn-sm" onclick="envoyerRapportProdWhatsApp('${mois}')">📲 Envoyer rapport WhatsApp</button>
      <button class="btn btn-print btn-sm" onclick="imprimerRapportProd('${mois}')">🖨️ Imprimer</button>
    </div>`;
}

async function envoyerRapportProdWhatsApp(mois){
  const cfg=GP_CONFIG||{};
  const{data:lots}=await SB.from('gp_lots').select('formule_nom,quantite_kg,cout_total')
    .eq('admin_id',GP_ADMIN_ID).gte('date',mois+'-01').lte('date',finMois(mois));
  const L=lots||[];
  const parFormule={};
  L.forEach(l=>{
    if(!parFormule[l.formule_nom])parFormule[l.formule_nom]=0;
    parFormule[l.formule_nom]+=Number(l.quantite_kg||0);
  });
  const totalKg=L.reduce((s,l)=>s+Number(l.quantite_kg||0),0);
  const lignes=Object.entries(parFormule).map(([nom,kg])=>`• ${nom} : ${fmt(kg)} kg`).join('\n');

  const texte=
    `🏭 *Rapport Production — ${mois}*\n`+
    `*${cfg.nom_provenderie||'PROVENDA'}*\n\n`+
    `${lignes}\n\n`+
    `📦 *Total produit : ${fmt(totalKg)} kg*\n\n`+
    `_Envoyé via PROVENDA_`;

  const apikey=cfg.callmebot_apikey||'';
  const tel=(cfg.tel_alerte_stock||cfg.telephone||'').replace(/[\s\-\+]/g,'').replace(/^228/,'');

  if(apikey&&tel){
    fetch(`https://api.callmebot.com/whatsapp.php?phone=228${tel}&text=${encodeURIComponent(texte)}&apikey=${apikey}`)
      .then(()=>notify('Rapport envoyé ✓','gold'));
  } else {
    window.open(`https://wa.me/?text=${encodeURIComponent(texte)}`,'_blank');
  }
}

function imprimerBilan(mois){
  window.print();
}

function imprimerRapportProd(mois){
  window.print();
}

function switchBilanTab(tab){
  ['mensuel','annuel','prod'].forEach(t=>{
    const el=document.getElementById('tab-'+t);
    const btn=document.getElementById('bilan-tab-'+t);
    if(el)el.style.display=t===tab?'block':'none';
    if(btn){
      btn.className=t===tab?'btn btn-g btn-sm':'btn btn-out btn-sm';
    }
  });
  if(tab==='annuel')renderBilanAnnuel();
  if(tab==='prod')renderRapportProduction();
}
