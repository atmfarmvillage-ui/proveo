// ══════════════════════════════════════════════════
// PROVENDA — BILANSS VENTES + DÉPENSES + CLASSEMENT PDV
// ══════════════════════════════════════════════════

const CAT_ICONS={
  matiere_premiere:'🌾',salaire:'👤',transport:'🚚',
  emballage:'📦',energie:'⚡',maintenance:'🔧',autre:'📝'
};

// ── BILAN DÉPENSES ────────────────────────────────
async function renderBilanDepenses(depData){
  const el=document.getElementById('dep-bilan');
  if(!el)return;
  const mois=document.getElementById('dep-filtre-mois')?.value||
    new Date().toISOString().slice(0,7);

  let D=depData;
  if(!D){
    const{data}=await SB.from('gp_depenses').select('*')
      .eq('admin_id',GP_ADMIN_ID)
      .gte('date',mois+'-01').lte('date',_finMois(mois));
    D=data||[];
  }

  // Ajouter paiements MP + salaires
  const[{data:pmts},{data:sals}]=await Promise.all([
    SB.from('gp_achats_paiements').select('montant,date_paiement')
      .eq('admin_id',GP_ADMIN_ID)
      .gte('date_paiement',mois+'-01').lte('date_paiement',_finMois(mois)),
    SB.from('gp_salaires').select('montant,beneficiaire,point_vente')
      .eq('admin_id',GP_ADMIN_ID).eq('mois',mois)
  ]);

  const totalCourantes=D.reduce((s,d)=>s+Number(d.montant||0),0);
  const totalMP=(pmts||[]).reduce((s,p)=>s+Number(p.montant||0),0);
  const totalSal=(sals||[]).reduce((s,s2)=>s+Number(s2.montant||0),0);
  const totalGeneral=totalCourantes+totalMP+totalSal;

  // Par catégorie (dépenses courantes)
  const parCat={};
  D.forEach(d=>{
    const c=d.categorie||'autre';
    if(!parCat[c])parCat[c]=0;
    parCat[c]+=Number(d.montant||0);
  });
  // Ajouter MP et salaires comme catégories
  if(totalMP>0)parCat['achats_mp']=(parCat['achats_mp']||0)+totalMP;
  if(totalSal>0)parCat['salaire']=(parCat['salaire']||0)+totalSal;

  const catSorted=Object.entries(parCat).sort((a,b)=>b[1]-a[1]);

  // Par PDV
  const parPDV={};
  D.forEach(d=>{
    const p=d.point_vente||'Siège';
    if(!parPDV[p])parPDV[p]=0;
    parPDV[p]+=Number(d.montant||0);
  });
  (sals||[]).forEach(s=>{
    const p=s.point_vente||'Siège';
    if(!parPDV[p])parPDV[p]=0;
    parPDV[p]+=Number(s.montant||0);
  });
  const pdvSorted=Object.entries(parPDV).sort((a,b)=>b[1]-a[1]);

  const catLabel={'achats_mp':'🛒 Achats MP','matiere_premiere':'🌾 Mat. Première',
    'salaire':'👤 Salaires','transport':'🚚 Transport','emballage':'📦 Emballage',
    'energie':'⚡ Énergie','maintenance':'🔧 Maintenance','autre':'📝 Autre'};

  el.innerHTML=`
    <!-- Totaux -->
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:14px">
      <div style="background:rgba(239,68,68,.08);border:1px solid rgba(239,68,68,.2);border-radius:8px;padding:10px;text-align:center;grid-column:1/-1">
        <div style="font-family:'Crimson Pro',serif;font-size:26px;font-weight:700;color:var(--red)">${fmt(totalGeneral)} F</div>
        <div style="font-size:10px;color:var(--textm);text-transform:uppercase">Total dépenses ${mois}</div>
      </div>
      <div style="background:rgba(14,20,40,.6);border:1px solid var(--border);border-radius:8px;padding:8px;text-align:center">
        <div style="font-size:14px;font-weight:700;color:var(--red)">${fmt(totalMP)} F</div>
        <div style="font-size:10px;color:var(--textm)">🛒 Achats MP</div>
      </div>
      <div style="background:rgba(14,20,40,.6);border:1px solid var(--border);border-radius:8px;padding:8px;text-align:center">
        <div style="font-size:14px;font-weight:700;color:var(--red)">${fmt(totalSal)} F</div>
        <div style="font-size:10px;color:var(--textm)">👤 Salaires</div>
      </div>
    </div>

    <!-- Par catégorie -->
    <div style="font-size:10px;font-weight:700;color:var(--g6);text-transform:uppercase;letter-spacing:1px;margin-bottom:8px">Par catégorie</div>
    ${catSorted.map(([cat,val])=>{
      const pct=totalGeneral>0?Math.round(val/totalGeneral*100):0;
      return`<div style="margin-bottom:8px">
        <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:3px">
          <span style="font-weight:600">${catLabel[cat]||cat}</span>
          <span style="font-family:'DM Mono',monospace;color:var(--red)">${fmt(val)} F <span style="color:var(--textm);font-size:10px">(${pct}%)</span></span>
        </div>
        <div style="background:rgba(30,45,74,.8);border-radius:20px;height:5px;overflow:hidden">
          <div style="width:${pct}%;height:100%;background:linear-gradient(90deg,var(--red),rgba(239,68,68,.5));border-radius:20px"></div>
        </div>
      </div>`;
    }).join('')}

    <!-- Par PDV -->
    ${pdvSorted.length>1?`<div style="font-size:10px;font-weight:700;color:var(--g6);text-transform:uppercase;letter-spacing:1px;margin:12px 0 8px">Par point de vente</div>
    <table style="width:100%;border-collapse:collapse;font-size:11px">
      <thead><tr>
        <th style="text-align:left;color:var(--textm);padding:4px 0;border-bottom:1px solid var(--border)">PDV</th>
        <th style="text-align:right;color:var(--textm);padding:4px 0;border-bottom:1px solid var(--border)">Montant</th>
        <th style="text-align:right;color:var(--textm);padding:4px 0;border-bottom:1px solid var(--border)">%</th>
      </tr></thead>
      <tbody>${pdvSorted.map(([p,v])=>`<tr>
        <td style="padding:5px 0;border-bottom:1px solid rgba(30,45,74,.3);font-weight:600">📍 ${p}</td>
        <td style="text-align:right;padding:5px 0;border-bottom:1px solid rgba(30,45,74,.3);color:var(--red);font-family:'DM Mono',monospace">${fmt(v)} F</td>
        <td style="text-align:right;padding:5px 0;border-bottom:1px solid rgba(30,45,74,.3);color:var(--textm)">${totalGeneral>0?Math.round(v/totalGeneral*100):0}%</td>
      </tr>`).join('')}</tbody>
    </table>`:''} `;
}

// ── BILAN VENTES ──────────────────────────────────
async function renderBilanVentes(){
  const el=document.getElementById('ventes-bilan');
  if(!el)return;
  const mois=new Date().toISOString().slice(0,7);

  const[{data:V},{data:VL}]=await Promise.all([
    SB.from('gp_ventes').select('montant_total,montant_paye,statut_paiement,point_vente,date,formule_nom,client_nom')
      .eq('admin_id',GP_ADMIN_ID).gte('date',mois+'-01').lte('date',_finMois(mois)),
    SB.from('gp_ventes_lignes').select('formule_nom,quantite,montant_ligne,type_prix')
      .eq('admin_id',GP_ADMIN_ID)
  ]);

  const VS=V||[];const VLS=VL||[];
  const ca=VS.reduce((s,v)=>s+Number(v.montant_total||0),0);
  const enc=VS.reduce((s,v)=>s+Number(v.montant_paye||0),0);
  const impaye=ca-enc;
  const txEnc=ca>0?Math.round(enc/ca*100):0;

  // Par formule (depuis lignes)
  const parFormule={};
  VLS.forEach(l=>{
    const f=l.formule_nom||'—';
    if(!parFormule[f])parFormule[f]={kg:0,ca:0};
    parFormule[f].kg+=Number(l.quantite||0);
    parFormule[f].ca+=Number(l.montant_ligne||0);
  });
  const formulesSorted=Object.entries(parFormule).sort((a,b)=>b[1].ca-a[1].ca);
  const totalKg=formulesSorted.reduce((s,[,v])=>s+v.kg,0);

  // Par PDV
  const parPDV={};
  VS.forEach(v=>{
    const p=v.point_vente||'Siège';
    if(!parPDV[p])parPDV[p]={ca:0,enc:0,nb:0};
    parPDV[p].ca+=Number(v.montant_total||0);
    parPDV[p].enc+=Number(v.montant_paye||0);
    parPDV[p].nb++;
  });

  // Évolution par semaine
  const parSemaine={};
  VS.forEach(v=>{
    const d=new Date(v.date);
    const sem=`S${Math.ceil(d.getDate()/7)}`;
    if(!parSemaine[sem])parSemaine[sem]=0;
    parSemaine[sem]+=Number(v.montant_total||0);
  });
  const maxSem=Math.max(...Object.values(parSemaine),1);

  el.innerHTML=`
    <!-- KPIs -->
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:14px">
      <div style="background:rgba(22,163,74,.08);border:1px solid rgba(22,163,74,.2);border-radius:8px;padding:10px;text-align:center;grid-column:1/-1">
        <div style="font-family:'Crimson Pro',serif;font-size:26px;font-weight:700;color:var(--g6)">${fmt(ca)} F</div>
        <div style="font-size:10px;color:var(--textm)">CA ${mois} · ${VS.length} ventes</div>
      </div>
      <div style="background:rgba(22,163,74,.06);border:1px solid rgba(22,163,74,.2);border-radius:8px;padding:8px;text-align:center">
        <div style="font-size:14px;font-weight:700;color:var(--green)">${fmt(enc)} F</div>
        <div style="font-size:10px;color:var(--textm)">Encaissé (${txEnc}%)</div>
      </div>
      <div style="background:rgba(239,68,68,.06);border:1px solid rgba(239,68,68,.15);border-radius:8px;padding:8px;text-align:center">
        <div style="font-size:14px;font-weight:700;color:var(--red)">${fmt(impaye)} F</div>
        <div style="font-size:10px;color:var(--textm)">Impayés</div>
      </div>
    </div>

    <!-- Évolution semaine -->
    <div style="font-size:10px;font-weight:700;color:var(--g6);text-transform:uppercase;letter-spacing:1px;margin-bottom:8px">Évolution hebdomadaire</div>
    <div style="display:flex;align-items:flex-end;gap:4px;height:50px;margin-bottom:12px">
      ${Object.entries(parSemaine).map(([sem,val])=>{
        const h=Math.round(val/maxSem*100);
        return`<div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:2px">
          <div style="width:100%;background:linear-gradient(180deg,var(--g4),var(--g5));border-radius:3px 3px 0 0;height:${h}%"></div>
          <div style="font-size:9px;color:var(--textm)">${sem}</div>
        </div>`;
      }).join('')}
    </div>

    <!-- Par formule -->
    <div style="font-size:10px;font-weight:700;color:var(--g6);text-transform:uppercase;letter-spacing:1px;margin-bottom:8px">Par formule</div>
    ${formulesSorted.slice(0,8).map(([f,v])=>{
      const pct=ca>0?Math.round(v.ca/ca*100):0;
      const espece=FORMULES_SADARI?.find(x=>x.nom===f)?.espece||'';
      const icons={pondeuse:'🐔',chair:'🐔',lapin:'🐰',porc:'🐷',canard:'🦆',tilapia:'🐟',goliath:'🐟'};
      return`<div style="margin-bottom:8px">
        <div style="display:flex;justify-content:space-between;font-size:11px;margin-bottom:3px">
          <span style="font-weight:600">${icons[espece]||'🌾'} ${f}</span>
          <span style="font-family:'DM Mono',monospace;color:var(--gold)">${fmt(v.kg)} kg · ${fmt(v.ca)} F</span>
        </div>
        <div style="background:rgba(30,45,74,.8);border-radius:20px;height:4px;overflow:hidden">
          <div style="width:${pct}%;height:100%;background:linear-gradient(90deg,var(--g4),var(--g6));border-radius:20px"></div>
        </div>
      </div>`;
    }).join('')}`;
}

// ── CLASSEMENT POINTS DE VENTE ────────────────────
async function renderClassementPDV(){
  const el=document.getElementById('ventes-classement-pdv');
  if(!el)return;
  const mois=new Date().toISOString().slice(0,7);

  const[{data:V},{data:VL}]=await Promise.all([
    SB.from('gp_ventes').select('montant_total,montant_paye,statut_paiement,point_vente,client_nom,date')
      .eq('admin_id',GP_ADMIN_ID).gte('date',mois+'-01').lte('date',_finMois(mois)),
    SB.from('gp_ventes_lignes').select('formule_nom,quantite,montant_ligne,vente_id')
      .eq('admin_id',GP_ADMIN_ID)
  ]);

  const VS=V||[];const VLS=VL||[];

  // Construire stats par PDV
  const pdv={};
  VS.forEach(v=>{
    const p=v.point_vente||'Siège';
    if(!pdv[p])pdv[p]={ca:0,enc:0,nb:0,clients:new Set(),formules:{}};
    pdv[p].ca+=Number(v.montant_total||0);
    pdv[p].enc+=Number(v.montant_paye||0);
    pdv[p].nb++;
    if(v.client_nom)pdv[p].clients.add(v.client_nom);
  });

  // Ajouter kg par formule par PDV
  const venteIdToPDV={};
  VS.forEach(v=>venteIdToPDV[v.id||'']=(v.point_vente||'Siège'));
  // Impossible sans jointure — on saute

  const sorted=Object.entries(pdv).sort((a,b)=>b[1].ca-a[1].ca);
  const maxCA=Math.max(...sorted.map(([,v])=>v.ca),1);

  const medals=['🥇','🥈','🥉'];

  el.innerHTML=`
    <div style="font-size:10px;font-weight:700;color:var(--g6);text-transform:uppercase;letter-spacing:1px;margin-bottom:10px">
      Classement par CA — ${mois}
    </div>
    ${sorted.map(([p,v],i)=>{
      const pct=Math.round(v.ca/maxCA*100);
      const txEnc=v.ca>0?Math.round(v.enc/v.ca*100):0;
      const txColor=txEnc>=80?'var(--green)':txEnc>=50?'var(--gold)':'var(--red)';
      return`<div style="background:rgba(14,20,40,.5);border:1px solid ${i===0?'rgba(245,158,11,.4)':'rgba(30,45,74,.5)'};border-radius:10px;padding:12px;margin-bottom:8px">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:8px">
          <div>
            <div style="font-size:14px;font-weight:700">${medals[i]||`#${i+1}`} ${p}</div>
            <div style="font-size:10px;color:var(--textm)">${v.nb} vente${v.nb>1?'s':''} · ${v.clients.size} client${v.clients.size>1?'s':''}</div>
          </div>
          <div style="text-align:right">
            <div style="font-family:'DM Mono',monospace;font-size:16px;font-weight:700;color:var(--gold)">${fmt(v.ca)} F</div>
            <div style="font-size:10px;color:${txColor}">Encaissé : ${txEnc}%${txEnc<50?' ⚠':''}</div>
          </div>
        </div>
        <!-- Barre CA relative -->
        <div style="background:rgba(30,45,74,.8);border-radius:20px;height:5px;overflow:hidden;margin-bottom:6px">
          <div style="width:${pct}%;height:100%;background:${i===0?'linear-gradient(90deg,var(--gold),var(--goldd))':'linear-gradient(90deg,var(--g4),var(--g6))'};border-radius:20px"></div>
        </div>
        <!-- Taux encaissement -->
        <div style="display:flex;gap:6px;flex-wrap:wrap">
          <span style="font-size:9px;background:rgba(22,163,74,.1);border:1px solid rgba(22,163,74,.2);padding:2px 7px;border-radius:10px;color:var(--g6)">${fmt(v.enc)} F encaissé</span>
          <span style="font-size:9px;background:rgba(239,68,68,.1);border:1px solid rgba(239,68,68,.2);padding:2px 7px;border-radius:10px;color:var(--red)">${fmt(v.ca-v.enc)} F impayé</span>
        </div>
      </div>`;
    }).join('')||'<div style="color:var(--textm);font-size:12px">Aucune vente ce mois.</div>'}`;
}
