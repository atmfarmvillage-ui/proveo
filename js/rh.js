// ══════════════════════════════════════════════════
// PROVENDA — MODULE RH (Ouvriers · Pointage · Règles · Bulletins auto · Ordre de virement)
// S'intègre à la page Salaires existante (onglets). N'écrase rien.
// Multi-tenant : tout scopé par GP_ADMIN_ID + point_vente.
// ══════════════════════════════════════════════════

// Défauts de l'en-tête de l'ordre de virement (valeurs SADARI ; éditables dans Paramètres → gp_config)
const ETAT_DEFAUTS = {
  siege: 'Amoussoukopé',
  rccm: 'TG-LFW-01-2023-A10-06807',
  numero_compte: '6363/5162',
  etabli_par_nom: 'GALLEY Kossi Biaglo',
  etabli_par_fonction: 'Directeur Administratif et Financier',
  responsable_nom: 'ATCHOU A. Messan',
  comptable_libelle: 'Comptable / Directeur de la CECAV SOLIDARITÉ'
};
function _cfgEtat(k){ const v=(GP_CONFIG||{})[k]; return (v!=null && v!=='') ? v : ETAT_DEFAUTS[k]; }

// Mapping champ Paramètres → colonne gp_config
const _ETAT_MAP=[
  ['cfg_etat_siege','siege'],['cfg_etat_rccm','rccm'],['cfg_etat_compte','numero_compte'],
  ['cfg_etat_etabli_nom','etabli_par_nom'],['cfg_etat_etabli_fonction','etabli_par_fonction'],
  ['cfg_etat_responsable','responsable_nom'],['cfg_etat_comptable','comptable_libelle']
];
function loadEtatEntete(){
  _ETAT_MAP.forEach(([id,col])=>{
    const e=document.getElementById(id); if(!e) return;
    const v=(GP_CONFIG||{})[col];
    e.value=(v!=null&&v!=='')?v:'';
    if(!e.placeholder) e.placeholder=ETAT_DEFAUTS[col]||'';
  });
}
async function saveEtatEntete(){
  if(!GP_ADMIN_ID){ notify('Session non prête','r'); return; }
  const obj={user_id:GP_ADMIN_ID};
  _ETAT_MAP.forEach(([id,col])=>{ const e=document.getElementById(id); obj[col]=(e?.value.trim())||null; });
  const {error}=await SB.from('gp_config').upsert(obj,{onConflict:'user_id'});
  if(error){ notify('Erreur: '+error.message,'r'); return; }
  _ETAT_MAP.forEach(([,col])=>{ GP_CONFIG[col]=obj[col]; });
  const ok=document.getElementById('cfg_etat_ok'); if(ok){ ok.textContent='✓ En-tête enregistré'; setTimeout(()=>ok.textContent='',3000); }
  notify('En-tête de l\'ordre de virement enregistré ✓','gold');
}

// Cache local des ouvriers actifs (pour pré-remplir la saisie de salaire)
let GP_OUVRIERS = [];

// ── Onglets de la page Salaires ───────────────────────
function showSalTab(name){
  ['bulletins','ouvriers','pointage','virement'].forEach(t=>{
    const pane=document.getElementById('saltab-'+t);
    if(pane) pane.style.display = (t===name)?'block':'none';
    const btn=document.getElementById('saltabbtn-'+t);
    if(btn) btn.classList.toggle('active', t===name);
  });
  if(name==='ouvriers') renderOuvriers();
  else if(name==='pointage') renderPointage();
  else if(name==='virement') renderApercuVirement();
  else if(name==='bulletins' && typeof renderSalaires==='function') renderSalaires();
}

// ════════════════════════════════════════════════════
// 1. REGISTRE DES OUVRIERS
// ════════════════════════════════════════════════════
async function loadOuvriers(){
  if(!GP_ADMIN_ID) return [];
  const {data} = await SB.from('gp_ouvriers').select('*')
    .eq('admin_id',GP_ADMIN_ID).order('nom_prenom');
  GP_OUVRIERS = (data||[]).filter(o=>o.statut!=='inactif');
  return data||[];
}

async function renderOuvriers(){
  const el=document.getElementById('ouvriers-liste');
  if(!el) return;
  const all=await loadOuvriers();
  const actifs=all.filter(o=>o.statut!=='inactif');
  const masse=actifs.reduce((s,o)=>s+Number(o.salaire_base||0),0);

  const kpi=document.getElementById('ouvriers-kpis');
  if(kpi) kpi.innerHTML=`
    <div class="econo-box"><div class="econo-val">${actifs.length}</div><div class="econo-lbl">Ouvriers actifs</div></div>
    <div class="econo-box"><div class="econo-val" style="color:var(--gold)">${fmt(masse)}</div><div class="econo-lbl">Masse salariale de base (F)</div></div>
    <div class="econo-box"><div class="econo-val">${actifs.filter(o=>o.equipe_production).length}</div><div class="econo-lbl">Équipe production</div></div>`;

  if(!all.length){ el.innerHTML='<div style="color:var(--textm);font-size:12px;padding:14px">Aucun ouvrier enregistré. Ajoutez-en ci-dessus.</div>'; return; }
  el.innerHTML=`<div style="overflow-x:auto"><table class="tbl" style="font-size:11px">
    <thead><tr><th>Nom & Prénom</th><th>Matricule</th><th>Fonction</th><th>RIB</th><th class="num">Salaire base</th><th>Prod.</th><th>Statut</th><th></th></tr></thead>
    <tbody>${all.map(o=>{
      const actif=o.statut!=='inactif';
      return `<tr style="${actif?'':'opacity:.5'}">
        <td style="font-weight:700">${o.nom_prenom}</td>
        <td style="font-size:10px;color:var(--textm)">${o.matricule||'—'}</td>
        <td style="font-size:10px">${o.fonction||'—'}</td>
        <td style="font-size:10px;color:var(--textm)">${o.numero_compte||'—'}</td>
        <td class="num" style="color:var(--gold)">${fmt(o.salaire_base||0)} F</td>
        <td style="font-size:14px;text-align:center">${o.equipe_production?'🏭':'—'}</td>
        <td><span class="badge ${actif?'bdg-g':'bdg-r'}" style="font-size:9px">${actif?'Actif':'Inactif'}</span></td>
        <td style="white-space:nowrap;display:flex;gap:3px">
          <button class="btn btn-out btn-sm" onclick="editOuvrier('${o.id}')" title="Modifier">✏️</button>
          <button class="btn btn-out btn-sm" onclick="toggleOuvrierStatut('${o.id}','${o.statut||'actif'}')" title="${actif?'Désactiver':'Réactiver'}">${actif?'⏸':'▶'}</button>
          ${GP_ROLE==='admin'?`<button class="btn btn-red btn-sm" onclick="deleteOuvrier('${o.id}')" title="Supprimer">✕</button>`:''}
        </td>
      </tr>`;
    }).join('')}</tbody></table></div>`;
}

async function saveOuvrier(){
  const nom=document.getElementById('ouv_nom')?.value.trim();
  const err=document.getElementById('ouv_err');
  if(!nom){ if(err)err.textContent='Nom & Prénom requis.'; return; }
  const obj={
    admin_id:GP_ADMIN_ID,
    nom_prenom:nom,
    matricule:document.getElementById('ouv_matricule')?.value.trim()||null,
    fonction:document.getElementById('ouv_fonction')?.value.trim()||null,
    numero_compte:document.getElementById('ouv_rib')?.value.trim()||null,
    telephone:document.getElementById('ouv_tel')?.value.trim()||null,
    whatsapp:document.getElementById('ouv_tel')?.value.trim()||null,
    date_embauche:document.getElementById('ouv_embauche')?.value||null,
    salaire_base:+document.getElementById('ouv_salaire')?.value||0,
    point_vente:null, // salaires = site de production uniquement
    equipe_production:document.getElementById('ouv_prod')?.checked||false,
    statut:'actif'
  };
  const editId=document.getElementById('ouv_edit_id')?.value||'';
  let error;
  if(editId){ ({error}=await SB.from('gp_ouvriers').update(obj).eq('id',editId)); }
  else { ({error}=await SB.from('gp_ouvriers').insert(obj)); }
  if(error){ if(err)err.textContent='Erreur: '+error.message; return; }
  if(err)err.textContent='';
  resetOuvrierForm();
  notify(editId?'Ouvrier modifié ✓':`Ouvrier ${nom} enregistré ✓`,'gold');
  await renderOuvriers();
  if(typeof remplirSelectOuvriers==='function') await remplirSelectOuvriers();
}

async function editOuvrier(id){
  const {data:o}=await SB.from('gp_ouvriers').select('*').eq('id',id).maybeSingle();
  if(!o){ notify('Ouvrier introuvable','r'); return; }
  const set=(k,v)=>{ const e=document.getElementById(k); if(e)e.value=v??''; };
  set('ouv_edit_id',o.id); set('ouv_nom',o.nom_prenom); set('ouv_matricule',o.matricule);
  set('ouv_fonction',o.fonction); set('ouv_rib',o.numero_compte); set('ouv_tel',o.telephone||o.whatsapp);
  set('ouv_embauche',o.date_embauche); set('ouv_salaire',o.salaire_base); set('ouv_pdv',o.point_vente);
  const prod=document.getElementById('ouv_prod'); if(prod)prod.checked=!!o.equipe_production;
  const btn=document.getElementById('ouv_save_btn'); if(btn)btn.textContent='💾 Enregistrer les modifications';
  const cancel=document.getElementById('ouv_cancel_btn'); if(cancel)cancel.style.display='inline-flex';
  document.getElementById('ouv_nom')?.scrollIntoView({behavior:'smooth',block:'center'});
}

function resetOuvrierForm(){
  ['ouv_edit_id','ouv_nom','ouv_matricule','ouv_fonction','ouv_rib','ouv_tel','ouv_embauche','ouv_salaire','ouv_pdv'].forEach(id=>{
    const e=document.getElementById(id); if(e)e.value='';
  });
  const prod=document.getElementById('ouv_prod'); if(prod)prod.checked=false;
  const btn=document.getElementById('ouv_save_btn'); if(btn)btn.textContent='➕ Ajouter l\'ouvrier';
  const cancel=document.getElementById('ouv_cancel_btn'); if(cancel)cancel.style.display='none';
}

async function toggleOuvrierStatut(id,statut){
  const actif=statut!=='inactif';
  await SB.from('gp_ouvriers').update({statut:actif?'inactif':'actif'}).eq('id',id);
  notify(actif?'Ouvrier désactivé':'Ouvrier réactivé','gold');
  await renderOuvriers();
}

async function deleteOuvrier(id){
  if(GP_ROLE!=='admin'){ notify('Suppression réservée à l\'administrateur','r'); return; }
  if(!confirm('Supprimer cet ouvrier ?\n(S\'il a un historique de salaire/pointage, préférez « Désactiver ».)')) return;
  const {error}=await SB.from('gp_ouvriers').delete().eq('id',id);
  if(error){ // FK (pointage/salaires liés) → on désactive
    await SB.from('gp_ouvriers').update({statut:'inactif'}).eq('id',id);
    notify('Ouvrier archivé (historique existant) — désactivé au lieu d\'être supprimé.','gold');
  } else notify('Ouvrier supprimé','r');
  await renderOuvriers();
}

// ════════════════════════════════════════════════════
// 2. POINTAGE JOURNALIER (présent / retard / absent)
// ════════════════════════════════════════════════════
async function renderPointage(){
  const el=document.getElementById('pointage-liste');
  if(!el) return;
  const date=document.getElementById('point-date')?.value||today();
  const all=await loadOuvriers();
  const actifs=all.filter(o=>o.statut!=='inactif');
  // Cloisonnement PDV : un non-admin ne pointe que son PDV
  const visibles = (GP_ROLE!=='admin' && !GP_EST_GERANT && GP_POINT_VENTE)
    ? actifs.filter(o=>!o.point_vente || o.point_vente===GP_POINT_VENTE) : actifs;

  const {data:pts}=await SB.from('gp_pointage').select('*')
    .eq('admin_id',GP_ADMIN_ID).eq('date',date);
  const pMap={}; (pts||[]).forEach(p=>{ pMap[p.ouvrier_id]=p.statut; });

  if(!visibles.length){ el.innerHTML='<div style="color:var(--textm);font-size:12px;padding:14px">Aucun ouvrier actif. Enregistrez-les dans l\'onglet Ouvriers.</div>'; return; }

  const BTN=(oid,val,label,color,cur)=>`<button onclick="setPointage('${oid}','${val}')"
    style="flex:1;padding:7px 4px;border-radius:7px;border:1px solid ${cur===val?color:'var(--border)'};cursor:pointer;font-size:11px;font-weight:${cur===val?'700':'500'};
    background:${cur===val?color:'transparent'};color:${cur===val?'#fff':'var(--textm)'}">${label}</button>`;

  el.innerHTML=visibles.map(o=>{
    const cur=pMap[o.id]||'';
    return `<div style="background:var(--card2);border-radius:10px;padding:10px 12px;margin-bottom:7px;display:flex;align-items:center;gap:10px;flex-wrap:wrap">
      <div style="flex:1;min-width:150px">
        <div style="font-size:12px;font-weight:700">${o.nom_prenom}</div>
        <div style="font-size:10px;color:var(--textm)">${o.fonction||'—'}${o.point_vente?' · '+o.point_vente:''}</div>
      </div>
      <div style="display:flex;gap:5px;min-width:230px;flex:1">
        ${BTN(o.id,'present','✓ Présent','var(--green)',cur)}
        ${BTN(o.id,'retard','⏰ Retard','var(--gold)',cur)}
        ${BTN(o.id,'absent','✕ Absent','var(--red)',cur)}
      </div>
    </div>`;
  }).join('');
}

async function setPointage(ouvrierId,statut){
  const date=document.getElementById('point-date')?.value||today();
  const o=GP_OUVRIERS.find(x=>x.id===ouvrierId);
  const {error}=await SB.from('gp_pointage').upsert({
    admin_id:GP_ADMIN_ID, ouvrier_id:ouvrierId, date, statut,
    point_vente:o?.point_vente||GP_POINT_VENTE||null, saisi_par:GP_USER?.id
  },{onConflict:'ouvrier_id,date'});
  if(error){ notify('Erreur pointage: '+error.message,'r'); return; }
  await renderPointage();
}

// Compte retards/absences d'un ouvrier sur un mois (YYYY-MM)
async function _pointageMois(ouvrierId,mois){
  const debut=mois+'-01', fin=finMois(mois);
  const {data}=await SB.from('gp_pointage').select('statut')
    .eq('admin_id',GP_ADMIN_ID).eq('ouvrier_id',ouvrierId).gte('date',debut).lte('date',fin);
  const P=data||[];
  return {
    retards: P.filter(p=>p.statut==='retard').length,
    absences: P.filter(p=>p.statut==='absent').length,
    presents: P.filter(p=>p.statut==='present').length
  };
}

// ════════════════════════════════════════════════════
// 3. RÈGLES DE PAIE (Paramètres)
// ════════════════════════════════════════════════════
const _RP_FIELDS=[
  'quota_kg','bonus_quota_montant','bonus_depassement_tonne','bonus_assiduite',
  'perte_seuil_pct','bonus_perte_montant','malus_perte_montant',
  'malus_retard','malus_absence','plancher_salaire','plafond_retranchement'
];
async function loadReglesPaie(){
  if(!GP_ADMIN_ID) return;
  const {data}=await SB.from('gp_regles_paie').select('*').eq('admin_id',GP_ADMIN_ID).maybeSingle();
  if(!data) return;
  _RP_FIELDS.forEach(k=>{ const e=document.getElementById('rp_'+k); if(e&&data[k]!=null)e.value=data[k]; });
}
async function saveReglesPaie(){
  if(!GP_ADMIN_ID){ notify('Session non prête','r'); return; }
  const obj={admin_id:GP_ADMIN_ID, updated_at:new Date().toISOString()};
  _RP_FIELDS.forEach(k=>{ const e=document.getElementById('rp_'+k); obj[k]=+(e?.value||0); });
  if(obj.plafond_retranchement>50){ notify('Plafond de retranchement > 50 % : gardé sous 30 % recommandé','r'); return; }
  const {error}=await SB.from('gp_regles_paie').upsert(obj,{onConflict:'admin_id'});
  if(error){ notify('Erreur: '+error.message,'r'); return; }
  notify('Règles de paie enregistrées ✓','gold');
}
async function getReglesPaie(){
  const {data}=await SB.from('gp_regles_paie').select('*').eq('admin_id',GP_ADMIN_ID).maybeSingle();
  return data||{};
}

// ════════════════════════════════════════════════════
// 4. MOTEUR : génération auto du bulletin d'un ouvrier
//    Quota (gp_lots du site) → bonus ; Pointage → malus ; perte fab ; plancher/plafond ; prorata.
// ════════════════════════════════════════════════════
// ── Cœur de calcul PUR (testable en Node) ──────────────
// p = { baseMens, dateEmbauche, mois, jTot, jFin, isCurrentMonth,
//       equipe_production, produitKg, perteKg, pt:{retards,absences,presents}, RG }
function calculerPaie(p){
  const RG=p.RG||{};
  const baseMens=Number(p.baseMens||0);
  const num=v=>Number(v||0);

  // Prorata
  let base=baseMens, prorata=null;
  const emb=p.dateEmbauche;
  if(emb && emb.slice(0,7)===p.mois){
    const jEmb=Number(emb.slice(8,10));
    const jFin=p.isCurrentMonth?p.jFin:p.jTot;
    const jTrav=Math.max(0, jFin-jEmb+1);
    base=Math.round(baseMens/p.jTot*jTrav);
    prorata={jTot:p.jTot,jTrav,baseMens};
  } else if(p.isCurrentMonth){
    base=Math.round(baseMens/p.jTot*p.jFin);
    prorata={jTot:p.jTot,jTrav:p.jFin,baseMens};
  }

  const produitKg=num(p.produitKg), perteKg=num(p.perteKg);
  const quotaKg=num(RG.quota_kg);
  const pertePct=produitKg>0?(perteKg/produitKg*100):0;
  const pt=p.pt||{retards:0,absences:0,presents:0};
  const seuilPerte=num(RG.perte_seuil_pct);

  // BONUS
  let bonus_quota=0, bonus_perte=0, bonus_assiduite=0;
  const details_bonus=[];
  if(p.equipe_production && quotaKg>0 && produitKg>=quotaKg){
    bonus_quota=num(RG.bonus_quota_montant);
    if(bonus_quota>0) details_bonus.push(`Quota atteint (${fmt(produitKg)}/${fmt(quotaKg)} kg) : +${fmt(bonus_quota)}`);
    const tonnesSup=Math.floor((produitKg-quotaKg)/1000);
    const bonusSup=tonnesSup*num(RG.bonus_depassement_tonne);
    if(bonusSup>0){ bonus_quota+=bonusSup; details_bonus.push(`Dépassement ${tonnesSup} t × ${fmt(RG.bonus_depassement_tonne)} : +${fmt(bonusSup)}`); }
  }
  // Bonus faible perte : indépendant du quota (s'applique dès qu'il y a production)
  if(p.equipe_production && produitKg>0 && seuilPerte>0 && pertePct<seuilPerte){
    bonus_perte=num(RG.bonus_perte_montant);
    if(bonus_perte>0) details_bonus.push(`Perte fab ${pertePct.toFixed(1)}% < ${RG.perte_seuil_pct}% : +${fmt(bonus_perte)}`);
  }
  if(pt.absences===0 && (pt.presents>0||pt.retards>0) && num(RG.bonus_assiduite)>0){
    bonus_assiduite=num(RG.bonus_assiduite);
    details_bonus.push(`Assiduité (0 absence) : +${fmt(bonus_assiduite)}`);
  }

  // MALUS
  let malus_retard=pt.retards*num(RG.malus_retard);
  let malus_absence=pt.absences*num(RG.malus_absence);
  let malus_perte=0;
  const details_malus=[];
  if(malus_retard>0) details_malus.push(`${pt.retards} retard(s) × ${fmt(RG.malus_retard)} : −${fmt(malus_retard)}`);
  if(malus_absence>0) details_malus.push(`${pt.absences} absence(s) × ${fmt(RG.malus_absence)} : −${fmt(malus_absence)}`);
  if(p.equipe_production && produitKg>0 && seuilPerte>0 && pertePct>seuilPerte){
    malus_perte=num(RG.malus_perte_montant);
    if(malus_perte>0) details_malus.push(`Perte fab ${pertePct.toFixed(1)}% > ${RG.perte_seuil_pct}% : −${fmt(malus_perte)}`);
  }

  const total_bonus=bonus_quota+bonus_perte+bonus_assiduite;
  let total_malus=malus_retard+malus_absence+malus_perte;

  // Plafond de retranchement (% du salaire de base) — sur le salaire PLEIN, pas le prorata
  const plafPct=num(RG.plafond_retranchement);
  let plafonne=false;
  if(plafPct>0){ const maxR=Math.round(baseMens*plafPct/100); if(total_malus>maxR){ total_malus=maxR; plafonne=true; } }

  let net=base+total_bonus-total_malus;
  const plancher=num(RG.plancher_salaire);
  let plancherApplique=false;
  if(plancher>0 && net<plancher){ net=plancher; plancherApplique=true; }
  net=Math.max(0, Math.round(net));

  return {
    base, produitKg, quotaKg, pertePct,
    bonus_quota, bonus_perte, bonus_assiduite,
    malus_retard, malus_absence, malus_perte,
    total_bonus, total_malus, net,
    prorata, plancherApplique, plafonne, details_bonus, details_malus
  };
}

async function genererBulletinOuvrier(ouvrierId, mois, opts){
  opts=opts||{};
  const RG=await getReglesPaie();
  const {data:o}=await SB.from('gp_ouvriers').select('*').eq('id',ouvrierId).maybeSingle();
  if(!o){ notify('Ouvrier introuvable','r'); return null; }

  const debut=mois+'-01', fin=finMois(mois);
  const baseMens=Number(o.salaire_base||0);
  const pdv=o.point_vente||null;

  // Production du site (pour l'équipe production)
  let produitKg=0, perteKg=0;
  {
    const {data:lots}=await SB.from('gp_lots').select('qte_produite,kg_pertes,pdv_production')
      .eq('admin_id',GP_ADMIN_ID).gte('date',debut).lte('date',fin);
    (lots||[]).forEach(l=>{
      if(pdv && (l.pdv_production||null)!==pdv) return;
      produitKg+=Number(l.qte_produite||0);
      perteKg+=Number(l.kg_pertes||0);
    });
  }
  const pt=await _pointageMois(ouvrierId, mois);

  // Paramètres de date (déterministes, passés au calcul pur)
  const moisActuel=thisMonth();
  const jTot=new Date(+mois.split('-')[0], +mois.split('-')[1], 0).getDate();
  const isCurrentMonth=(mois===moisActuel);
  const jFin=isCurrentMonth?new Date().getDate():jTot;

  const c=calculerPaie({
    baseMens, dateEmbauche:o.date_embauche, mois, jTot, jFin, isCurrentMonth,
    equipe_production:!!o.equipe_production, produitKg, perteKg, pt, RG
  });

  const row={
    admin_id:GP_ADMIN_ID, ouvrier_id:ouvrierId,
    nom_prenom:o.nom_prenom, matricule:o.matricule, poste:o.fonction,
    numero_compte:o.numero_compte, point_vente:pdv, date_embauche:o.date_embauche,
    whatsapp:o.whatsapp||o.telephone, mois,
    salaire_base:c.base, quota_kg:c.quotaKg, produit_kg:c.produitKg,
    bonus_quota:c.bonus_quota, bonus_assiduite:c.bonus_assiduite, bonus_perte:c.bonus_perte,
    malus_retard:c.malus_retard, malus_absence:c.malus_absence, malus_perte:c.malus_perte,
    jours_retard:pt.retards, jours_absence:pt.absences,
    primes:c.total_bonus, avances:c.total_malus,
    montant:c.net, net_a_payer:c.net, mode:opts.mode||'virement',
    date_paiement:today(), paye:false
  };
  const {data:saved,error}=await SB.from('gp_salaires')
    .upsert(row,{onConflict:'ouvrier_id,mois'}).select().maybeSingle();
  if(error){
    // Fallback si contrainte unique absente : delete+insert
    if(String(error.message||'').includes('conflict')||String(error.code||'')==='42P10'){
      await SB.from('gp_salaires').delete().eq('ouvrier_id',ouvrierId).eq('mois',mois);
      const r2=await SB.from('gp_salaires').insert(row).select().maybeSingle();
      if(r2.error){ notify('Erreur bulletin: '+r2.error.message,'r'); return null; }
      return {...r2.data, _details:{details_bonus:c.details_bonus,details_malus:c.details_malus,pertePct:c.pertePct,prorata:c.prorata,plancherApplique:c.plancherApplique,plafonne:c.plafonne}};
    }
    notify('Erreur bulletin: '+error.message,'r'); return null;
  }
  return {...saved, _details:{details_bonus:c.details_bonus,details_malus:c.details_malus,pertePct:c.pertePct,prorata:c.prorata,plancherApplique:c.plancherApplique,plafonne:c.plafonne}};
}

// Génère les bulletins de TOUS les ouvriers actifs pour un mois
async function genererTousBulletins(){
  const mois=document.getElementById('sal-mois')?.value||thisMonth();
  const all=await loadOuvriers();
  const actifs=all.filter(o=>o.statut!=='inactif');
  if(!actifs.length){ notify('Aucun ouvrier actif','r'); return; }
  if(!confirm(`Générer/mettre à jour les bulletins de ${actifs.length} ouvrier(s) pour ${mois} ?\n\nBonus/retranchements calculés automatiquement (production + pointage).`)) return;
  notify('Calcul des bulletins…','gold');
  let n=0;
  for(const o of actifs){ const r=await genererBulletinOuvrier(o.id, mois); if(r)n++; }
  notify(`✓ ${n} bulletin(s) générés pour ${mois}`,'gold');
  if(typeof renderSalaires==='function') await renderSalaires();
}

// ════════════════════════════════════════════════════
// 5. PAIEMENT → DÉPENSE (gp_depenses) + DÉBIT CAISSE
//    Une seule écriture : apparaît dans Dépenses ET déduit la caisse (idempotent + rattrapage hors-ligne).
// ════════════════════════════════════════════════════
async function payerSalaireVersDepense(sal, preferredCaisseId){
  if(!sal) return {error:'Salaire introuvable'};
  if(sal.depense_id){ return {already:true}; }
  const net=Number(sal.net_a_payer!=null?sal.net_a_payer:sal.montant)||0;
  const desc=`Salaire ${sal.nom_prenom} — ${sal.mois}`;
  // Salaires = site de production uniquement → dépense/débit sur la caisse Production (point_vente null).
  const pdv=null;
  const {data:dep,error}=await SB.from('gp_depenses').insert({
    admin_id:GP_ADMIN_ID, saisi_par:GP_USER?.id, date:today(),
    categorie:'salaire', description:desc, montant:net,
    beneficiaire:sal.nom_prenom, point_vente:pdv
  }).select().maybeSingle();
  if(error){ return {error:error.message}; }
  // Lier le bulletin (anti double-paiement) + marquer payé
  try{ await SB.from('gp_salaires').update({paye:true, paye_le:today(), depense_id:dep.id}).eq('id',sal.id); }catch(_){}
  // Débit caisse (réutilise le moteur robuste de caisse_extras.js)
  try{
    if(typeof _debiterCaisseDepense==='function'){
      await _debiterCaisseDepense({...dep, point_vente:pdv, admin_id:GP_ADMIN_ID, montant:net, date:today(), description:desc, saisi_par:GP_USER?.id}, preferredCaisseId||null);
      try{ await SB.from('gp_depenses').update({caisse_debitee:true}).eq('id',dep.id); }catch(_){}
    }
  }catch(e){ /* reste caisse_debitee=false → rattrapé par synchroniserCaisseDepenses() */ }
  return {dep};
}

// Bouton « Marquer payé » sur un bulletin
async function marquerSalairePaye(salId){
  const {data:sal}=await SB.from('gp_salaires').select('*').eq('id',salId).maybeSingle();
  if(!sal){ notify('Bulletin introuvable','r'); return; }
  if(sal.paye || sal.depense_id){ notify('Ce salaire est déjà payé.','gold'); return; }
  const net=Number(sal.net_a_payer!=null?sal.net_a_payer:sal.montant)||0;
  if(!confirm(`Payer ${sal.nom_prenom} : ${fmt(net)} F ?\n\n→ Enregistré dans les Dépenses et déduit de la caisse.`)) return;
  const r=await payerSalaireVersDepense(sal);
  if(r.error){ notify('Erreur: '+r.error,'r'); return; }
  notify(`✓ ${sal.nom_prenom} payé · ${fmt(net)} F sortis de la caisse (dépense enregistrée)`,'gold');
  if(typeof renderSalaires==='function') await renderSalaires();
}

// ════════════════════════════════════════════════════
// 6. ÉTAT D'ORDRE DE VIREMENT DE SALAIRE (impression banque)
// ════════════════════════════════════════════════════
async function renderApercuVirement(){
  const el=document.getElementById('virement-apercu');
  if(!el) return;
  const mois=document.getElementById('sal-mois')?.value||thisMonth();
  const {data}=await SB.from('gp_salaires').select('*')
    .eq('admin_id',GP_ADMIN_ID).eq('mois',mois).order('nom_prenom');
  const S=data||[];
  const total=S.reduce((s,x)=>s+Number(x.net_a_payer!=null?x.net_a_payer:x.montant||0),0);
  if(!S.length){ el.innerHTML='<div style="color:var(--textm);font-size:12px;padding:14px">Aucun bulletin pour ce mois. Générez les bulletins d\'abord (onglet Salaires & bulletins).</div>'; return; }
  el.innerHTML=`
    <div style="font-size:11px;color:var(--textm);margin-bottom:10px">Aperçu de l'état à présenter à la banque · <strong>${S.length}</strong> salarié(s) · Total <strong style="color:var(--gold)">${fmt(total)} F</strong></div>
    <div style="overflow-x:auto"><table class="tbl" style="font-size:11px">
      <thead><tr><th>N°</th><th>Nom & Prénom</th><th>Fonction</th><th>N° compte / RIB</th><th class="num">Net à virer (F)</th></tr></thead>
      <tbody>${S.map((s,i)=>`<tr>
        <td>${String(i+1).padStart(2,'0')}</td>
        <td style="font-weight:700">${s.nom_prenom}</td>
        <td style="font-size:10px">${s.poste||'—'}</td>
        <td style="font-size:10px;color:var(--textm)">${s.numero_compte||'—'}</td>
        <td class="num" style="color:var(--gold)">${fmt(s.net_a_payer!=null?s.net_a_payer:s.montant)}</td>
      </tr>`).join('')}
      <tr style="font-weight:700;background:rgba(22,163,74,.06)"><td colspan="4">TOTAL</td><td class="num" style="color:var(--gold)">${fmt(total)} F CFA</td></tr>
      </tbody></table></div>
    <button class="btn btn-print" style="width:100%;justify-content:center;margin-top:12px;font-size:13px;padding:11px" onclick="imprimerOrdreVirement()">🖨️ Imprimer l'ordre de virement — ${mois}</button>`;
}

async function imprimerOrdreVirement(){
  const mois=document.getElementById('sal-mois')?.value||thisMonth();
  const {data}=await SB.from('gp_salaires').select('*')
    .eq('admin_id',GP_ADMIN_ID).eq('mois',mois).order('nom_prenom');
  const S=data||[];
  if(!S.length){ notify('Aucun bulletin pour ce mois','r'); return; }
  const total=S.reduce((s,x)=>s+Number(x.net_a_payer!=null?x.net_a_payer:x.montant||0),0);
  const cfg=GP_CONFIG||{};
  const prov=cfg.nom_provenderie||'SADARI';
  const moisLabel=new Date(mois+'-15').toLocaleDateString('fr-FR',{month:'long',year:'numeric'});
  const moisCap=moisLabel.charAt(0).toUpperCase()+moisLabel.slice(1);
  const dateEtab=new Date().toLocaleDateString('fr-FR');

  const html=`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Ordre de virement ${prov} ${mois}</title>
<style>
@page{size:A4;margin:14mm}
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:Arial,sans-serif;font-size:12px;color:#000}
.entete{text-align:center;border-bottom:2px solid #000;padding-bottom:10px;margin-bottom:6px}
.entete h1{font-size:20px;font-weight:bold;letter-spacing:1px}
.entete .meta{font-size:11px;margin-top:3px;line-height:1.5}
.titre{text-align:center;font-size:15px;font-weight:bold;text-decoration:underline;margin:16px 0 4px}
.souslig{display:flex;justify-content:space-between;font-size:12px;margin:8px 2px}
table{width:100%;border-collapse:collapse;margin-top:8px}
th,td{border:1px solid #000;padding:6px 8px;font-size:12px}
th{background:#e8e8e8;text-align:left}
td.num,th.num{text-align:right}
.total td{font-weight:bold;background:#f4f4f4;font-size:13px}
.mode{margin:16px 2px;font-size:12px;line-height:2}
.signatures{display:flex;justify-content:space-between;margin-top:26px;gap:20px}
.sig{flex:1;font-size:11px;line-height:1.9}
.sig .l{border-bottom:1px solid #000;height:34px;margin-top:4px}
.chk{display:inline-block;width:13px;height:13px;border:1px solid #000;margin-right:6px;vertical-align:middle}
</style></head><body>
<div class="entete">
  <h1>${prov.toUpperCase()}</h1>
  <div class="meta">
    Siège : ${_cfgEtat('siege')}${cfg.telephone?` &nbsp;·&nbsp; Tél : ${cfg.telephone}`:''}<br>
    N° RCCM : ${_cfgEtat('rccm')}${cfg.email?` &nbsp;·&nbsp; Email : ${cfg.email}`:''}<br>
    Numéro de Compte : ${_cfgEtat('numero_compte')}
  </div>
</div>
<div class="titre">ÉTAT D'ORDRE DE VIREMENT DE SALAIRE</div>
<div class="souslig"><span><strong>Mois de :</strong> ${moisCap}</span><span><strong>Date d'établissement :</strong> ${dateEtab}</span></div>
<table>
  <thead><tr><th style="width:36px">N°</th><th>Nom et Prénom du salarié</th><th>Fonction / Poste</th><th>Numéro de compte / RIB</th><th class="num">Montant Net à Virer (FCFA)</th></tr></thead>
  <tbody>
    ${S.map((s,i)=>`<tr>
      <td>${String(i+1).padStart(2,'0')}</td>
      <td>${s.nom_prenom}</td>
      <td>${s.poste||''}</td>
      <td>${s.numero_compte||''}</td>
      <td class="num">${fmt(s.net_a_payer!=null?s.net_a_payer:s.montant)}</td>
    </tr>`).join('')}
    <tr class="total"><td colspan="4">TOTAL</td><td class="num">${fmt(total)} F CFA</td></tr>
  </tbody>
</table>
<div class="mode">
  <strong>Mode de règlement :</strong><br>
  <span class="chk"></span> Virement bancaire &nbsp;&nbsp;
  <span class="chk"></span> Chèque global &nbsp;&nbsp;
  <span class="chk"></span> Autre (à préciser) : ___________________________
</div>
<div class="signatures">
  <div class="sig">
    <strong>Établi par :</strong><br>
    Nom : ${_cfgEtat('etabli_par_nom')}<br>
    Fonction : ${_cfgEtat('etabli_par_fonction')}<br>
    Signature :<div class="l"></div>
    Date : ${dateEtab}
  </div>
  <div class="sig">
    <strong>Visa du Responsable hiérarchique :</strong><br>
    Nom : ${_cfgEtat('responsable_nom')}<br>
    Signature :<div class="l"></div>
  </div>
  <div class="sig">
    <strong>Visa du ${_cfgEtat('comptable_libelle')} :</strong><br>
    Nom : ___________________<br>
    Signature :<div class="l"></div>
  </div>
</div>
</body></html>`;

  const win=window.open('','_blank','width=800,height=1000');
  if(!win){ notify('Popup bloqué — autorisez les popups','r'); return; }
  win.document.write(html); win.document.close(); win.focus();
  setTimeout(()=>{ win.print(); },400);
}

// ── Pré-remplir le select ouvrier dans la saisie de salaire ──
async function remplirSelectOuvriers(){
  const sel=document.getElementById('sal_ouvrier');
  if(!sel) return;
  const all=await loadOuvriers();
  const actifs=all.filter(o=>o.statut!=='inactif');
  sel.innerHTML='<option value="">— Saisie libre —</option>'+
    actifs.map(o=>`<option value="${o.id}">${o.nom_prenom}${o.fonction?' ('+o.fonction+')':''}</option>`).join('');
}
function onSalOuvrierChange(){
  const id=document.getElementById('sal_ouvrier')?.value;
  const o=GP_OUVRIERS.find(x=>x.id===id);
  const set=(k,v)=>{ const e=document.getElementById(k); if(e)e.value=v??''; };
  if(o){
    set('sal_nom',o.nom_prenom); set('sal_matricule',o.matricule);
    set('sal_montant',o.salaire_base||'');
  }
}

// Export Node (tests) — sans effet dans le navigateur
if(typeof module!=='undefined' && module.exports){ module.exports={ calculerPaie }; }
