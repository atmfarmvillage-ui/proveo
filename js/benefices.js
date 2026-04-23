// ══════════════════════════════════════════════════
// PROVENDA — PAGE BÉNÉFICES & RENTABILITÉ
// ══════════════════════════════════════════════════

let _benefPeriode='mois';

async function renderBenefices(){
  if(!GP_ADMIN_ID)return;
  const now=new Date();
  const today=now.toISOString().slice(0,10);
  const mois=now.toISOString().slice(0,7);
  const annee=now.getFullYear().toString();

  // Calculer les 3 périodes en parallèle
  const[jour,moisData,anneeData]=await Promise.all([
    calculerBenefPeriode(today,today),
    calculerBenefPeriode(mois+'-01',_finMois(mois)),
    calculerBenefPeriode(annee+'-01-01',annee+'-12-31')
  ]);

  // KPIs rapides
  document.getElementById('benef-kpis').innerHTML=`
    <div class="stat-box" style="cursor:pointer;${_benefPeriode==='jour'?'border-color:rgba(22,163,74,.5)':''}" onclick="setPeriodeBenef('jour')">
      <div class="stat-val" style="font-size:22px;color:${jour.net>=0?'var(--green)':'var(--red)'}">${fmt(jour.net)} F</div>
      <div class="stat-lbl">Bénéfice du jour</div>
    </div>
    <div class="stat-box" style="cursor:pointer;${_benefPeriode==='mois'?'border-color:rgba(22,163,74,.5)':''}" onclick="setPeriodeBenef('mois')">
      <div class="stat-val" style="font-size:22px;color:${moisData.net>=0?'var(--green)':'var(--red)'}">${fmt(moisData.net)} F</div>
      <div class="stat-lbl">Bénéfice du mois</div>
    </div>
    <div class="stat-box" style="cursor:pointer;${_benefPeriode==='annee'?'border-color:rgba(22,163,74,.5)':''}" onclick="setPeriodeBenef('annee')">
      <div class="stat-val" style="font-size:22px;color:${anneeData.net>=0?'var(--green)':'var(--red)'}">${fmt(anneeData.net)} F</div>
      <div class="stat-lbl">Bénéfice ${annee}</div>
    </div>`;

  // Afficher le détail de la période sélectionnée
  const data=_benefPeriode==='jour'?jour:_benefPeriode==='mois'?moisData:anneeData;
  afficherDetailBenef(data, _benefPeriode);
}

function setPeriodeBenef(periode){
  _benefPeriode=periode;
  renderBenefices();
}

async function calculerBenefPeriode(debut, fin){
  const[
    {data:ventes},{data:depenses},{data:pmtsMP},{data:salaires},
    {data:lots},{data:stockSorties}
  ]=await Promise.all([
    SB.from('gp_ventes').select('montant_total,montant_paye,point_vente')
      .eq('admin_id',GP_ADMIN_ID).gte('date',debut).lte('date',fin),
    SB.from('gp_depenses').select('montant,categorie')
      .eq('admin_id',GP_ADMIN_ID).gte('date',debut).lte('date',fin),
    SB.from('gp_achats_paiements').select('montant')
      .eq('admin_id',GP_ADMIN_ID).gte('date_paiement',debut).lte('date_paiement',fin),
    SB.from('gp_salaires').select('montant')
      .eq('admin_id',GP_ADMIN_ID).gte('mois',debut.slice(0,7)).lte('mois',fin.slice(0,7)),
    SB.from('gp_lots').select('qte_produite,nb_sacs,poids_sac,kg_pertes,cout_mp,cout_main_oeuvre,cout_emballage,cout_total,formule_nom,espece')
      .eq('admin_id',GP_ADMIN_ID).gte('date',debut).lte('date',fin),
    SB.from('gp_stock_mp').select('quantite,prix_unit,ingredient_nom')
      .eq('admin_id',GP_ADMIN_ID).eq('type','sortie_production')
      .gte('date',debut).lte('date',fin)
  ]);

  const V=ventes||[];const D=depenses||[];
  const PA=pmtsMP||[];const SAL=salaires||[];
  const L=lots||[];const SS=stockSorties||[];

  // REVENUS
  const ca=V.reduce((s,v)=>s+Number(v.montant_total||0),0);
  const enc=V.reduce((s,v)=>s+Number(v.montant_paye||0),0);
  const impaye=ca-enc;

  // COÛTS DE PRODUCTION (Option B — MP consommée)
  const coutMP=SS.reduce((s,m)=>s+Number(m.quantite||0)*Number(m.prix_unit||0),0);
  const coutMO=L.reduce((s,l)=>s+Number(l.cout_main_oeuvre||0),0);
  const coutEmb=L.reduce((s,l)=>s+Number(l.cout_emballage||0),0);
  const coutTrans=L.reduce((s,l)=>{
    const t=Number(l.cout_total||0)-Number(l.cout_mp||0)-Number(l.cout_main_oeuvre||0)-Number(l.cout_emballage||0);
    return s+Math.max(0,t);
  },0);
  const totalCoutProd=coutMP+coutMO+coutEmb+coutTrans;

  // BÉNÉFICE BRUT
  const benefBrut=enc-totalCoutProd;

  // AUTRES CHARGES
  const depCourantes=D.reduce((s,d)=>s+Number(d.montant||0),0);
  const totalSal=SAL.reduce((s,s2)=>s+Number(s2.montant||0),0);
  const autresCharges=depCourantes+totalSal;

  // BÉNÉFICE NET
  const benefNet=benefBrut-autresCharges;

  // PRODUCTION
  const kgNets=L.reduce((s,l)=>{
    const n=Number(l.nb_sacs||0)*Number(l.poids_sac||25);
    return s+(n>0?n:Number(l.qte_produite||0));
  },0);
  const kgBruts=L.reduce((s,l)=>s+Number(l.qte_produite||0),0);
  const pertes=L.reduce((s,l)=>s+Number(l.kg_pertes||0),0);
  const coutRevient=kgNets>0?Math.round(totalCoutProd/kgNets):0;
  const prixVenteMoy=kgNets>0?Math.round(ca/kgNets):0;

  // PAR FORMULE
  const parFormule={};
  L.forEach(l=>{
    const f=l.formule_nom||'—';
    if(!parFormule[f])parFormule[f]={cout:0,kg:0,espece:l.espece||''};
    parFormule[f].cout+=Number(l.cout_total||0);
    parFormule[f].kg+=Number(l.nb_sacs||0)*Number(l.poids_sac||25)||Number(l.qte_produite||0);
  });
  // Associer prix de vente
  Object.keys(parFormule).forEach(f=>{
    parFormule[f].prixVente=GP_PRIX?.[f]||0;
    parFormule[f].coutKg=parFormule[f].kg>0?Math.round(parFormule[f].cout/parFormule[f].kg):0;
    parFormule[f].margeKg=parFormule[f].prixVente-parFormule[f].coutKg;
  });

  return{ca,enc,impaye,coutMP,coutMO,coutEmb,coutTrans,totalCoutProd,
    benefBrut,depCourantes,totalSal,autresCharges,benefNet,
    kgNets,kgBruts,pertes,coutRevient,prixVenteMoy,
    parFormule,nbLots:L.length};
}

function afficherDetailBenef(d, periode){
  const el=document.getElementById('benef-detail');
  if(!el)return;

  const sante=d.benefNet>0?(d.benefNet/Math.max(d.enc,1)>0.15?'green':'gold'):'red';
  const pctBenef=d.enc>0?((d.benefNet/d.enc)*100).toFixed(1):0;

  const especeIcons={pondeuse:'🐔',chair:'🐔',lapin:'🐰',porc:'🐷',canard:'🦆',tilapia:'🐟',goliath:'🐟'};

  el.innerHTML=`
  <div class="g2" style="gap:14px">
    <!-- REVENUS -->
    <div class="card">
      <div class="card-title"><div class="ct-left"><span>💰 Revenus</span></div></div>
      <div style="display:flex;flex-direction:column;gap:8px;font-size:12px">
        <div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--border)">
          <span style="color:var(--textm)">CA total</span>
          <span style="color:var(--gold);font-family:'DM Mono',monospace">${fmt(d.ca)} F</span>
        </div>
        <div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--border)">
          <span style="color:var(--textm)">Encaissé</span>
          <span style="color:var(--green);font-family:'DM Mono',monospace">${fmt(d.enc)} F</span>
        </div>
        <div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--border)">
          <span style="color:var(--textm)">Impayés</span>
          <span style="color:${d.impaye>0?'var(--red)':'var(--green)'};font-family:'DM Mono',monospace">${fmt(d.impaye)} F</span>
        </div>
        <div style="display:flex;justify-content:space-between;padding:6px 0">
          <span style="color:var(--textm)">Taux encaissement</span>
          <span style="color:var(--g6)">${d.ca>0?Math.round(d.enc/d.ca*100):0}%</span>
        </div>
      </div>
    </div>

    <!-- COÛTS PRODUCTION -->
    <div class="card">
      <div class="card-title"><div class="ct-left"><span>🏭 Coûts de production</span></div></div>
      <div style="display:flex;flex-direction:column;gap:8px;font-size:12px">
        <div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--border)">
          <span style="color:var(--textm)">MP consommées</span>
          <span style="color:var(--red);font-family:'DM Mono',monospace">− ${fmt(d.coutMP)} F</span>
        </div>
        <div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--border)">
          <span style="color:var(--textm)">Main d'œuvre</span>
          <span style="color:var(--red);font-family:'DM Mono',monospace">− ${fmt(d.coutMO)} F</span>
        </div>
        <div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--border)">
          <span style="color:var(--textm)">Emballage</span>
          <span style="color:var(--red);font-family:'DM Mono',monospace">− ${fmt(d.coutEmb)} F</span>
        </div>
        <div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--border)">
          <span style="color:var(--textm)">Transport</span>
          <span style="color:var(--red);font-family:'DM Mono',monospace">− ${fmt(d.coutTrans)} F</span>
        </div>
        <div style="display:flex;justify-content:space-between;padding:6px 0;font-weight:700">
          <span>Total coûts prod.</span>
          <span style="color:var(--red);font-family:'DM Mono',monospace">− ${fmt(d.totalCoutProd)} F</span>
        </div>
      </div>
    </div>

    <!-- BÉNÉFICE BRUT -->
    <div class="card" style="border-color:rgba(245,158,11,.3);background:rgba(245,158,11,.03)">
      <div class="card-title"><div class="ct-left"><span>📊 Bénéfice brut</span></div></div>
      <div style="text-align:center;padding:10px 0">
        <div style="font-family:'Crimson Pro',serif;font-size:30px;font-weight:700;color:${d.benefBrut>=0?'var(--gold)':'var(--red)'}">${fmt(d.benefBrut)} F</div>
        <div style="font-size:11px;color:var(--textm);margin-top:4px">Encaissé − Coûts production</div>
        <div style="font-size:11px;color:var(--textm)">${d.enc>0?((d.benefBrut/d.enc)*100).toFixed(1):0}% de marge brute</div>
      </div>
    </div>

    <!-- AUTRES CHARGES -->
    <div class="card">
      <div class="card-title"><div class="ct-left"><span>💸 Autres charges</span></div></div>
      <div style="display:flex;flex-direction:column;gap:8px;font-size:12px">
        <div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--border)">
          <span style="color:var(--textm)">Salaires</span>
          <span style="color:var(--red);font-family:'DM Mono',monospace">− ${fmt(d.totalSal)} F</span>
        </div>
        <div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--border)">
          <span style="color:var(--textm)">Dépenses courantes</span>
          <span style="color:var(--red);font-family:'DM Mono',monospace">− ${fmt(d.depCourantes)} F</span>
        </div>
        <div style="display:flex;justify-content:space-between;padding:6px 0;font-weight:700">
          <span>Total autres charges</span>
          <span style="color:var(--red);font-family:'DM Mono',monospace">− ${fmt(d.autresCharges)} F</span>
        </div>
      </div>
    </div>

    <!-- BÉNÉFICE NET -->
    <div class="card" style="grid-column:1/-1;border-color:rgba(${sante==='green'?'22,163,74':sante==='gold'?'245,158,11':'239,68,68'},.4);background:rgba(${sante==='green'?'22,163,74':sante==='gold'?'245,158,11':'239,68,68'},.05)">
      <div class="card-title"><div class="ct-left"><span>🎯 Bénéfice Net</span></div></div>
      <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px">
        <div>
          <div style="font-family:'Crimson Pro',serif;font-size:36px;font-weight:700;color:${sante==='green'?'var(--green)':sante==='gold'?'var(--gold)':'var(--red)'}">
            ${fmt(d.benefNet)} F
          </div>
          <div style="font-size:12px;color:var(--textm)">Marge nette : ${pctBenef}%</div>
        </div>
        <div style="flex:1;max-width:300px">
          <!-- Jauge bénéfice -->
          <div style="background:rgba(30,45,74,.8);border-radius:20px;height:12px;overflow:hidden;margin-bottom:6px">
            <div style="width:${Math.min(100,Math.max(0,+pctBenef))}%;height:100%;background:${sante==='green'?'var(--green)':sante==='gold'?'var(--gold)':'var(--red)'};border-radius:20px;transition:width .5s"></div>
          </div>
          <div style="font-size:10px;color:var(--textm)">
            ${sante==='green'?'✅ Rentabilité excellente (> 15%)':sante==='gold'?'⚠ Rentabilité correcte (0-15%)':'❌ Pertes — analyser les charges'}
          </div>
        </div>
      </div>
    </div>

    <!-- PRODUCTION -->
    <div class="card">
      <div class="card-title"><div class="ct-left"><span>🏭 Production</span></div></div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:12px">
        <div style="text-align:center;padding:8px;background:rgba(14,20,40,.5);border-radius:8px">
          <div style="font-size:18px;font-weight:700;color:var(--g6)">${fmt(d.kgNets)} kg</div>
          <div style="font-size:10px;color:var(--textm)">Produits nets</div>
        </div>
        <div style="text-align:center;padding:8px;background:rgba(14,20,40,.5);border-radius:8px">
          <div style="font-size:18px;font-weight:700;color:var(--textm)">${d.nbLots}</div>
          <div style="font-size:10px;color:var(--textm)">Lots produits</div>
        </div>
        <div style="text-align:center;padding:8px;background:rgba(14,20,40,.5);border-radius:8px">
          <div style="font-size:18px;font-weight:700;color:var(--gold)">${fmt(d.coutRevient)} F</div>
          <div style="font-size:10px;color:var(--textm)">Coût/kg</div>
        </div>
        <div style="text-align:center;padding:8px;background:rgba(14,20,40,.5);border-radius:8px">
          <div style="font-size:18px;font-weight:700;color:${d.prixVenteMoy>d.coutRevient?'var(--green)':'var(--red)'}">${fmt(d.prixVenteMoy-d.coutRevient)} F</div>
          <div style="font-size:10px;color:var(--textm)">Marge/kg</div>
        </div>
        ${d.pertes>0?`<div style="grid-column:1/-1;text-align:center;padding:6px;background:rgba(239,68,68,.06);border-radius:8px">
          <span style="color:var(--red);font-size:11px">⚠ Pertes production : ${fmt(d.pertes)} kg (${d.kgBruts>0?((d.pertes/d.kgBruts)*100).toFixed(1):0}%)</span>
        </div>`:''}
      </div>
    </div>

    <!-- PAR FORMULE -->
    <div class="card">
      <div class="card-title"><div class="ct-left"><span>📊 Rentabilité par formule</span></div></div>
      ${Object.entries(d.parFormule).sort((a,b)=>b[1].margeKg-a[1].margeKg).map(([f,v])=>`
        <div style="display:flex;justify-content:space-between;align-items:center;padding:7px 0;border-bottom:1px solid var(--border);font-size:11px">
          <span style="font-weight:600">${especeIcons[v.espece]||'🌾'} ${f}</span>
          <div style="text-align:right;font-family:'DM Mono',monospace">
            <div style="font-size:10px;color:var(--textm)">${fmt(v.coutKg)} F/kg coût</div>
            <div style="font-size:10px;color:var(--g6)">${fmt(v.prixVente)} F/kg vente</div>
            <div style="font-weight:700;color:${v.margeKg>=0?'var(--green)':'var(--red)'}">${fmt(v.margeKg)} F/kg marge</div>
          </div>
        </div>`).join('')||'<div style="color:var(--textm);font-size:12px">Aucune production sur la période.</div>'}
    </div>
  </div>`;
}
