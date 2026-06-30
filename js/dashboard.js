// ── DASHBOARD ──────────────────────────────────────
// Fonctions date autonomes — pas de dépendance externe
function _finMois(mois){
  const[y,mo]=(mois||new Date().toISOString().slice(0,7)).split('-').map(Number);
  return mois+'-'+String(new Date(y,mo,0).getDate()).padStart(2,'0');
}

// ── COMPARATIF PDV (admin) ─────────────────────────
async function renderComparatifPDV(){
  const tbl=document.getElementById('comp-table');
  if(!tbl) return;
  if(GP_ROLE!=='admin'){ tbl.innerHTML='<div style="color:var(--textm);font-size:12px;padding:10px">Réservé à l\'administrateur.</div>'; return; }
  const moisEl=document.getElementById('comp-mois');
  const m=(moisEl&&moisEl.value)?moisEl.value:(typeof thisMonth==='function'?thisMonth():new Date().toISOString().slice(0,7));
  if(moisEl&&!moisEl.value)moisEl.value=m;
  const debut=m+'-01', fin=_finMois(m);

  const safe=async(q)=>{try{return await q;}catch(e){return {data:[]};}};
  const[{data:ventes},{data:depenses},{data:stock},{data:lots},{data:vlignes},{data:salaires}]=await Promise.all([
    safe(SB.from('gp_ventes').select('point_vente,montant_total,montant_paye').eq('admin_id',GP_ADMIN_ID).is('deleted_at',null).gte('date',debut).lte('date',fin)),
    safe(SB.from('gp_depenses').select('point_vente,montant').eq('admin_id',GP_ADMIN_ID).gte('date',debut).lte('date',fin)),
    safe(SB.from('gp_stock_produits_pdv').select('pdv_nom,qte_disponible,seuil_critique').eq('admin_id',GP_ADMIN_ID)),
    safe(SB.from('gp_lots').select('formule_nom,cout_total,nb_sacs,poids_sac,qte_produite').eq('admin_id',GP_ADMIN_ID).gte('date',debut).lte('date',fin)),
    safe(SB.from('gp_ventes_lignes').select('formule_nom,quantite,gp_ventes!inner(point_vente,date,deleted_at)').eq('admin_id',GP_ADMIN_ID).gte('gp_ventes.date',debut).lte('gp_ventes.date',fin).is('gp_ventes.deleted_at',null)),
    safe(SB.from('gp_salaires').select('montant').eq('admin_id',GP_ADMIN_ID).eq('mois',m)),
  ]);

  const byPDV={};
  const get=(p)=>{const k=p||'Production'; if(!byPDV[k])byPDV[k]={ca:0,enc:0,dep:0,nb:0,alertes:0}; return byPDV[k];};
  (ventes||[]).forEach(v=>{const o=get(v.point_vente); o.ca+=Number(v.montant_total||0); o.enc+=Number(v.montant_paye||0); o.nb++;});
  (depenses||[]).forEach(d=>{const o=get(d.point_vente); o.dep+=Number(d.montant||0);});
  (stock||[]).forEach(s=>{const o=get(s.pdv_nom); if(Number(s.qte_disponible||0)<=Number(s.seuil_critique||0)) o.alertes++;});

  const lignes=Object.entries(byPDV).sort((a,b)=>b[1].ca-a[1].ca);
  window._compExport={lignes, mois:m}; // pour l'export PDF/Excel
  const tot=lignes.reduce((t,[,o])=>{t.ca+=o.ca;t.enc+=o.enc;t.dep+=o.dep;t.nb+=o.nb;t.alertes+=o.alertes;return t;},{ca:0,enc:0,dep:0,nb:0,alertes:0});

  const kpis=document.getElementById('comp-kpis');
  if(kpis) kpis.innerHTML=`
    <div class="econo-box"><div class="econo-val">${lignes.length}</div><div class="econo-lbl">Points de vente actifs</div></div>
    <div class="econo-box"><div class="econo-val" style="color:var(--gold)">${fmt(tot.ca)}</div><div class="econo-lbl">CA total (F)</div></div>
    <div class="econo-box"><div class="econo-val" style="color:var(--red)">${fmt(tot.dep)}</div><div class="econo-lbl">Dépenses total (F)</div></div>
    <div class="econo-box"><div class="econo-val" style="color:${(tot.enc-tot.dep)>=0?'var(--green)':'var(--red)'}">${fmt(tot.enc-tot.dep)}</div><div class="econo-lbl">Résultat caisse (F)</div></div>`;

  if(!lignes.length){ tbl.innerHTML='<div style="color:var(--textm);font-size:12px;padding:10px">Aucune donnée sur la période.</div>'; return; }

  const badge=(nom)=> (typeof pvBadgeHtml==='function')?pvBadgeHtml(nom):('📍 '+nom);

  // ── Compte de résultat par PDV : COGS = kg vendus × coût de production/kg ──
  const lotsByF={};
  (lots||[]).forEach(l=>{const f=l.formule_nom||'—'; if(!lotsByF[f])lotsByF[f]={cout:0,kg:0}; lotsByF[f].cout+=Number(l.cout_total||0); lotsByF[f].kg+=(Number(l.nb_sacs||0)*Number(l.poids_sac||25))||Number(l.qte_produite||0);});
  const coutKg={}; Object.entries(lotsByF).forEach(([f,o])=>{coutKg[f]=o.kg>0?o.cout/o.kg:0;});
  const cogs={};
  (vlignes||[]).forEach(l=>{const pdv=(l.gp_ventes&&l.gp_ventes.point_vente)||'Production'; cogs[pdv]=(cogs[pdv]||0)+Number(l.quantite||0)*(coutKg[l.formule_nom]||0);});
  const totalSal=(salaires||[]).reduce((s,x)=>s+Number(x.montant||0),0);
  let pCA=0,pCOGS=0,pDep=0,pRes=0;
  const plLignes=lignes.map(([nom,o])=>{const cg=Math.round(cogs[nom]||0); const marge=o.ca-cg; const res=marge-o.dep; pCA+=o.ca;pCOGS+=cg;pDep+=o.dep;pRes+=res; return {nom,ca:o.ca,cogs:cg,marge,dep:o.dep,res};});
  const netGlobal=pRes-totalSal;
  const plHtml=`
    <div style="font-weight:700;color:var(--g6);margin:18px 0 8px;font-size:13px">📊 Compte de résultat par PDV — ${m}</div>
    <div style="overflow-x:auto"><table class="tbl" style="font-size:11px">
      <thead><tr><th>Point de vente</th><th class="num">CA</th><th class="num">Coût produits</th><th class="num">Marge brute</th><th class="num">Dépenses</th><th class="num">Résultat net</th></tr></thead>
      <tbody>
      ${plLignes.map(p=>`<tr>
        <td>${badge(p.nom)}</td>
        <td class="num" style="color:var(--gold)">${fmt(p.ca)}</td>
        <td class="num" style="color:var(--red)">${fmt(p.cogs)}</td>
        <td class="num">${fmt(p.marge)}</td>
        <td class="num" style="color:var(--red)">${fmt(p.dep)}</td>
        <td class="num" style="font-weight:700;color:${p.res>=0?'var(--green)':'var(--red)'}">${fmt(p.res)}</td>
      </tr>`).join('')}
      <tr style="background:rgba(22,163,74,.06);font-weight:700">
        <td>TOTAL PDV</td>
        <td class="num" style="color:var(--gold)">${fmt(pCA)}</td>
        <td class="num" style="color:var(--red)">${fmt(pCOGS)}</td>
        <td class="num">${fmt(pCA-pCOGS)}</td>
        <td class="num" style="color:var(--red)">${fmt(pDep)}</td>
        <td class="num" style="color:${pRes>=0?'var(--green)':'var(--red)'}">${fmt(pRes)}</td>
      </tr>
      </tbody></table></div>
    <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;margin-top:10px;padding:10px 14px;background:var(--card2);border-radius:10px">
      <span style="font-size:12px;color:var(--textm)">Charges communes (siège) · salaires : <b style="color:var(--red)">${fmt(totalSal)} F</b> <span style="font-size:10px">(non réparties sur les PDV)</span></span>
      <span style="font-size:13px;color:var(--textm)">Résultat net global : <b style="font-size:20px;color:${netGlobal>=0?'var(--green)':'var(--red)'}">${fmt(netGlobal)} F</b></span>
    </div>
    <div style="font-size:10px;color:var(--textm);margin-top:6px">Coût produits = kg vendus × coût de production/kg (du mois). Net global = Σ résultats PDV − salaires.</div>`;

  // ── BILAN CONSOLIDÉ RÉSEAU (vue groupe) ──
  const margeNettePct = pCA>0 ? Math.round(netGlobal/pCA*100) : 0;
  window._bilanReseau={mois:m, margePct:margeNettePct, rows:[
    {poste:"Chiffre d'affaires réseau", montant:pCA},
    {poste:"Coût des produits vendus", montant:-pCOGS},
    {poste:"= Marge brute", montant:pCA-pCOGS},
    {poste:"Dépenses (tous PDV)", montant:-pDep},
    {poste:"Salaires (siège)", montant:-totalSal},
    {poste:"= Bénéfice net réseau", montant:netGlobal},
  ]};
  const bilanHtml=`
    <div style="border:1px solid var(--gold);background:rgba(232,197,71,.06);border-radius:12px;padding:14px;margin-bottom:14px">
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:8px">
        <span style="font-weight:700;color:var(--g6);font-size:13px">🌐 Bilan consolidé réseau — ${m}</span>
        <span style="display:flex;gap:4px">
          <button class="btn btn-out btn-sm" onclick="exportBilanReseau('pdf')" style="font-size:10px;padding:3px 8px">📄 PDF</button>
          <button class="btn btn-out btn-sm" onclick="exportBilanReseau('excel')" style="font-size:10px;padding:3px 8px">📊 Excel</button>
        </span>
      </div>
      <table class="tbl" style="font-size:12px"><tbody>
        <tr><td>Chiffre d'affaires réseau</td><td class="num" style="color:var(--gold)">${fmt(pCA)} F</td></tr>
        <tr><td>− Coût des produits vendus</td><td class="num" style="color:var(--red)">${fmt(pCOGS)} F</td></tr>
        <tr style="font-weight:700"><td>= Marge brute</td><td class="num">${fmt(pCA-pCOGS)} F</td></tr>
        <tr><td>− Dépenses (tous PDV)</td><td class="num" style="color:var(--red)">${fmt(pDep)} F</td></tr>
        <tr><td>− Salaires (siège)</td><td class="num" style="color:var(--red)">${fmt(totalSal)} F</td></tr>
        <tr style="font-weight:800;background:rgba(22,163,74,.08)"><td>= Bénéfice net réseau</td><td class="num" style="font-size:16px;color:${netGlobal>=0?'var(--green)':'var(--red)'}">${fmt(netGlobal)} F</td></tr>
      </tbody></table>
      <div style="font-size:11px;color:var(--textm);margin-top:6px">Marge nette : <b>${margeNettePct}%</b> du CA réseau</div>
    </div>`;

  tbl.innerHTML=`${bilanHtml}<div style="overflow-x:auto"><table class="tbl" style="font-size:11px">
    <thead><tr><th>Point de vente</th><th class="num">Ventes (CA)</th><th class="num">Encaissé</th><th class="num">Dépenses</th><th class="num">Résultat*</th><th class="num">Nb ventes</th><th class="num">Alertes stock</th></tr></thead>
    <tbody>
    ${lignes.map(([nom,o])=>{const res=o.enc-o.dep; return `<tr>
      <td>${badge(nom)}</td>
      <td class="num" style="color:var(--gold)">${fmt(o.ca)}</td>
      <td class="num" style="color:var(--green)">${fmt(o.enc)}</td>
      <td class="num" style="color:var(--red)">${fmt(o.dep)}</td>
      <td class="num" style="font-weight:700;color:${res>=0?'var(--green)':'var(--red)'}">${fmt(res)}</td>
      <td class="num">${o.nb}</td>
      <td class="num"><span class="badge ${o.alertes>0?'bdg-r':'bdg-g'}" style="font-size:9px">${o.alertes}</span></td>
    </tr>`;}).join('')}
    <tr style="background:rgba(22,163,74,.06);font-weight:700">
      <td>TOTAL</td>
      <td class="num" style="color:var(--gold)">${fmt(tot.ca)}</td>
      <td class="num" style="color:var(--green)">${fmt(tot.enc)}</td>
      <td class="num" style="color:var(--red)">${fmt(tot.dep)}</td>
      <td class="num" style="color:${(tot.enc-tot.dep)>=0?'var(--green)':'var(--red)'}">${fmt(tot.enc-tot.dep)}</td>
      <td class="num">${tot.nb}</td>
      <td class="num">${tot.alertes}</td>
    </tr>
    </tbody></table></div>
    <div style="font-size:10px;color:var(--textm);margin-top:8px">* Résultat caisse = Encaissé − Dépenses (cash). Le compte de résultat ci-dessous intègre le coût des produits.</div>
    ${plHtml}`;
}

// ── DASHBOARD ──────────────────────────────────────
async function renderDashboard(){
  const m=(typeof thisMonth==='function'?thisMonth():new Date().toISOString().slice(0,7));
  const mDebut=m+'-01';
  const mFin=_finMois(m);

  // Charger uniquement les données du mois en cours depuis Supabase
  // Requêtes parallèles avec gestion d'erreur individuelle
  const safe=async(q)=>{try{const r=await q;return r;}catch(e){return {data:[]};}}
  const[
    r1,r2,r3,r4,r5,r6,r7,r8,r9,r10,r11,r12
  ]=await Promise.all([
    safe(SB.from('gp_ventes').select('id,montant_total,montant_paye,statut_paiement,point_vente,date,client_nom,formule_nom,qte_vendue').eq('admin_id',GP_ADMIN_ID).is('deleted_at',null).gte('date',mDebut).lte('date',mFin)),
    safe(SB.from('gp_ventes').select('id,client_id,montant_total,montant_paye,statut_paiement,client_nom,formule_nom,qte_vendue,point_vente,date,recu_imprime,wa_envoye,sms_envoye').eq('admin_id',GP_ADMIN_ID).is('deleted_at',null).eq('date',(typeof today==='function'?today():new Date().toISOString().slice(0,10)))),
    safe(SB.from('gp_depenses').select('montant,date').eq('admin_id',GP_ADMIN_ID).gte('date',mDebut).lte('date',mFin)),
    safe(SB.from('gp_achats_paiements').select('montant,date_paiement').eq('admin_id',GP_ADMIN_ID).gte('date_paiement',mDebut).lte('date_paiement',mFin)),
    safe(SB.from('gp_salaires').select('montant').eq('admin_id',GP_ADMIN_ID).eq('mois',m)),
    safe(SB.from('gp_lots').select('qte_produite,nb_sacs,poids_sac,date,formule_nom,ref,espece').eq('admin_id',GP_ADMIN_ID).gte('date',mDebut).lte('date',mFin)),
    safe(SB.from('gp_lots').select('qte_produite,nb_sacs,poids_sac,date,formule_nom,ref,espece').eq('admin_id',GP_ADMIN_ID).order('date',{ascending:false}).limit(4)),
    safe(SB.from('gp_stock_mp').select('*').eq('admin_id',GP_ADMIN_ID)),
    // r9 : caisses actives (pour Solde Caisse Total)
    safe(SB.from('gp_caisses').select('id,solde_initial,type,actif,point_vente').eq('admin_id',GP_ADMIN_ID).eq('actif',true)),
    // r10 : mouvements caisse (pour calculer le solde réel)
    safe(SB.from('gp_mouvements_caisse').select('caisse_id,caisse_dest_id,type,montant,statut_transfert').eq('admin_id',GP_ADMIN_ID)),
    // r11 : achats fournisseurs avec dette résiduelle (pour Dette Fournisseurs)
    safe(SB.from('gp_achats').select('id,montant_total,montant_paye').eq('admin_id',GP_ADMIN_ID).gt('montant_total',0)),
    // r12 : livraisons inter-PDV du mois (ventes en gros) — pour le CA "ventes en gros" par PDV source
    safe(SB.from('gp_livraisons_pdv').select('montant_total,montant_paye,pdv_source_nom,date_livraison').eq('admin_id',GP_ADMIN_ID).gte('date_livraison',mDebut).lte('date_livraison',mFin)),
  ]);
  // Extraire les tableaux — garantir que c'est toujours un Array
  const toArr=r=>Array.isArray(r?.data)?r.data:(r?.data?Object.values(r.data):[]);
  const[ventesMoisD,toutesVentesD,depensesD,paiementsMP,salairesD,lotsMoisD,derniersLotsD,stockD,caissesD,mvtsCaisseD,achatsD,livMoisD]=
    [r1,r2,r3,r4,r5,r6,r7,r8,r9,r10,r11,r12].map(toArr);
  // VUE COMPLÈTE = admin, gérant, principal, et secrétaire du siège (tout le monde sauf revendeur secondaire).
  // Seul un revendeur de PDV secondaire est cloisonné à son point de vente.
  const vueComplete = !(typeof estCloisonnePDV==='function' && estCloisonnePDV());
  const monPDVDash = GP_POINT_VENTE || 'Production';
  const _matchPV = v => (typeof appartientAuPDV==='function') ? appartientAuPDV(v.point_vente) : (vueComplete || v.point_vente===monPDVDash);
  const VMois = vueComplete ? ventesMoisD : ventesMoisD.filter(_matchPV);
  const VJ = vueComplete ? toutesVentesD : toutesVentesD.filter(_matchPV);
  const D=depensesD;
  const PA=paiementsMP;
  const SAL=salairesD;
  const LM=lotsMoisD;
  const DL=derniersLotsD;
  const S=stockD;

  // ── CALCULS CORRECTS ─────────────────────────────
  // Sépare le CA provenderie (aliments + MP) du CA ferme (lapin/œuf/poulet/autre)
  const{provenderie:caProvMap, ferme:caFermeMap} = await separerCAProvFerme(VMois.map(v=>v.id));

  // CA du mois — provenderie uniquement (formules + MP)
  const caMois = VMois.reduce((s,v)=>s+(caProvMap[v.id]||0),0);
  // CA ferme du mois (lapin, œuf, poulet, autre produit ferme)
  const caFermeMois = VMois.reduce((s,v)=>s+(caFermeMap[v.id]||0),0);

  // Impayés/encaissé : on répartit montant_paye au prorata (provenderie / ferme)
  let impayeMois = 0, encaisseMois = 0;
  for(const v of VMois){
    const r = ratioProvenderie(v.id, caProvMap, caFermeMap);
    const totalProv = caProvMap[v.id] || 0;
    const payeProv = Number(v.montant_paye||0) * r;
    encaisseMois += payeProv;
    const resteProv = totalProv - payeProv;
    if(resteProv > 0) impayeMois += resteProv;
  }

  // Dépenses courantes (fonctionnement)
  const depCourantes=D.reduce((s,d)=>s+Number(d.montant||0),0);
  // Paiements achats MP du mois
  const depAchatsMP=PA.reduce((s,p)=>s+Number(p.montant||0),0);
  // Salaires du mois
  const depSalaires=SAL.reduce((s,s2)=>s+Number(s2.montant||0),0);
  // Total dépenses réelles du mois
  const depMois=depCourantes+depAchatsMP+depSalaires;

  // Kg produits ce mois = tous les lots du mois
  // kg nets emballés = nb_sacs × poids_sac (plus précis que qte brute)
  const prodMois=LM.reduce((s,l)=>{
    const nets=Number(l.nb_sacs||0)*Number(l.poids_sac||25);
    return s+(nets>0?nets:Number(l.qte_produite||0));
  },0);
  const nbSacsMois=LM.reduce((s,l)=>s+Number(l.nb_sacs||0),0);

  // Bénéfice = encaissé - dépenses (pas CA car impayés non reçus)
  const beneficeMois=encaisseMois-depMois;

  // Ventes en gros (livraisons inter-PDV) — vue complète = réseau ; sinon, gros du PDV source du membre
  const LIVG=vueComplete?livMoisD:livMoisD.filter(l=>(typeof appartientAuPDV==='function')?appartientAuPDV(l.pdv_source_nom):l.pdv_source_nom===monPDVDash);
  const caGros=LIVG.reduce((s,l)=>s+Number(l.montant_total||0),0);
  const encGros=LIVG.reduce((s,l)=>s+Number(l.montant_paye||0),0);

  // Alertes stock
  const niveaux=calcNiveaux(S);
  const alertes=Object.entries(niveaux).filter(([nom,n])=>{
    const ingr=GP_INGREDIENTS.find(i=>i.nom===nom);
    return n<(ingr?.seuil_alerte||200);
  });

  // ── KPIs SUPPLÉMENTAIRES ─────────────────────────
  // 1. Solde caisse total (somme des soldes de toutes les caisses actives)
  const soldesCaisse = {};
  (caissesD||[]).forEach(c=>{ soldesCaisse[c.id] = Number(c.solde_initial||0); });
  (mvtsCaisseD||[]).forEach(m=>{
    if(m.type==='entree' && soldesCaisse[m.caisse_id]!==undefined) soldesCaisse[m.caisse_id] += Number(m.montant||0);
    if(m.type==='sortie' && soldesCaisse[m.caisse_id]!==undefined) soldesCaisse[m.caisse_id] -= Number(m.montant||0);
    if(m.type==='ajustement' && soldesCaisse[m.caisse_id]!==undefined) soldesCaisse[m.caisse_id] += Number(m.montant||0);
    if(m.type==='transfert' && m.statut_transfert!=='refuse'){
      if(soldesCaisse[m.caisse_id]!==undefined) soldesCaisse[m.caisse_id] -= Number(m.montant||0);
      if(m.caisse_dest_id && soldesCaisse[m.caisse_dest_id]!==undefined) soldesCaisse[m.caisse_dest_id] += Number(m.montant||0);
    }
  });
  const soldeCaisseTotal = Object.values(soldesCaisse).reduce((s,v)=>s+v,0);
  const nbCaisses = (caissesD||[]).length;
  // Solde caisse du PDV courant : caisses du périmètre du membre (+ caisses sans PDV)
  const caissesPDV = (caissesD||[]).filter(c=> (typeof appartientAuPDV==='function') ? appartientAuPDV(c.point_vente) : (!c.point_vente || c.point_vente===monPDVDash));
  const soldeCaissePDV = caissesPDV.reduce((s,c)=>s+(soldesCaisse[c.id]||0),0);
  const nbCaissesPDV = caissesPDV.length;
  // Total des ventes (montant_total brut, provenderie+ferme) du périmètre visible
  const venteTotalMois = VMois.reduce((s,v)=>s+Number(v.montant_total||0),0);

  // 2. Dette fournisseurs (somme des restes à payer sur achats)
  const detteFournisseurs = (achatsD||[]).reduce((s,a)=>{
    const reste = Math.max(0, Number(a.montant_total||0) - Number(a.montant_paye||0));
    return s + reste;
  },0);
  const nbAchatsAvecDette = (achatsD||[]).filter(a=>Number(a.montant_total||0) > Number(a.montant_paye||0)).length;

  // ── AFFICHAGE ────────────────────────────────────
  document.getElementById('dash-date-sub').textContent=
    `${new Date().toLocaleDateString('fr-FR',{weekday:'long',day:'numeric',month:'long',year:'numeric'})} — Données temps réel`;

  const isAdmin=GP_ROLE==='admin';

  // Helper KPI : icône pastel + libellé + valeur + delta optionnel + onClick optionnel
  const kpi=(icon,iconColor,label,value,delta,onClick)=>`
    <div class="stat-box ${onClick?'kpi-clickable':''}" ${onClick?`onclick="${onClick}" title="Voir le détail"`:''}>
      <div class="kpi-head">
        <div class="kpi-icon ${iconColor}">${icon}</div>
        <div class="stat-lbl">${label}</div>
      </div>
      <div class="stat-val">${value}</div>
      ${delta?`<div class="kpi-delta ${delta.type||'flat'}">${delta.text}</div>`:''}
    </div>`;

  document.getElementById('dash-kpis').innerHTML=`
    ${vueComplete?`
    ${kpi('💰','gold','CA Provenderie ce mois',fmt(caMois),null,"dashKpiDrill('ca')")}
    ${kpi('✓','green','Encaissé Provenderie',fmt(encaisseMois),
      caMois>0?{type:'up',text:`${Math.round(encaisseMois/caMois*100)} % du CA`}:null,"dashKpiDrill('encaisse')")}
    ${kpi('🧾','blue','Ventes totales ce mois',fmt(venteTotalMois),null,"dashKpiDrill('ca')")}
    ${kpi('⚠','red','Impayés du mois',fmt(impayeMois),
      impayeMois>0?{type:'down',text:'à relancer'}:{type:'up',text:'rien à relancer'},"dashKpiDrill('impayes')")}
    ${kpi('💸','orange','Dépenses ce mois',fmt(depMois),
      depMois>encaisseMois?{type:'down',text:'> encaissé'}:{type:'flat',text:'sous contrôle'},"dashKpiDrill('depenses')")}
    ${caFermeMois>0?kpi('🚜','blue','CA Ferme ce mois',fmt(caFermeMois),null,"dashKpiDrill('ca_ferme')"):''}
    ${caGros>0?kpi('🚚','blue','Ventes en gros (réseau)',fmt(caGros),{type:'flat',text:'encaissé '+fmt(encGros)}):''}
    ${kpi('📦','blue','Produits ce mois',`${fmt(prodMois)} kg`,nbSacsMois>0?{type:'flat',text:`${nbSacsMois} sacs`}:null,"dashKpiDrill('lots')")}
    ${kpi('💵','gold','Solde caisse total',fmt(soldeCaisseTotal),
      nbCaisses>0?{type:'flat',text:`${nbCaisses} caisse${nbCaisses>1?'s':''}`}:null,"dashKpiDrill('caisse')")}
    ${kpi('🏢','red','Dette fournisseurs',fmt(detteFournisseurs),
      detteFournisseurs>0?{type:'down',text:`${nbAchatsAvecDette} à payer`}:{type:'up',text:'soldé'},"dashKpiDrill('dette_fourn')")}
    ${kpi('⚠',alertes.length>0?'red':'green','Alertes stock MP',alertes.length,
      alertes.length>0?{type:'down',text:'à réapprovisionner'}:{type:'up',text:'tout est OK'},"dashKpiDrill('alertes_mp')")}
    `:`
    ${kpi('💰','gold','Mon CA ce mois',fmt(caMois),null,"dashKpiDrill('ca')")}
    ${kpi('✓','green','Encaissé',fmt(encaisseMois),caMois>0?{type:'up',text:Math.round(encaisseMois/caMois*100)+' % du CA'}:null,"dashKpiDrill('encaisse')")}
    ${kpi('🧾','blue','Ventes totales ce mois',fmt(venteTotalMois),null,"dashKpiDrill('ca')")}
    ${kpi('⚠','red','Impayés du mois',fmt(impayeMois),impayeMois>0?{type:'down',text:'à relancer'}:{type:'up',text:'rien à relancer'},"dashKpiDrill('impayes')")}
    ${caGros>0?kpi('🚚','blue','Ventes en gros',fmt(caGros),{type:'flat',text:'encaissé '+fmt(encGros)}):''}
    ${kpi('📦','blue','Produits ce mois',`${fmt(prodMois)} kg`,nbSacsMois>0?{type:'flat',text:`${nbSacsMois} sacs`}:null)}
    ${kpi('💵','gold','Solde caisse PDV',fmt(soldeCaissePDV),nbCaissesPDV>0?{type:'flat',text:`${nbCaissesPDV} caisse${nbCaissesPDV>1?'s':''}`}:null,"dashKpiDrill('caisse')")}
    ${kpi('⚠',alertes.length>0?'red':'green','Alertes stock',alertes.length,alertes.length>0?{type:'down',text:'à vérifier'}:{type:'up',text:'tout est OK'})}
    `}`;

  // Derniers lots
  const derniersLotsHtml=DL.map(l=>`
    <div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--card2);font-size:11px">
      <div>
        <div style="font-weight:600">${ESPECE_ICON[l.espece]||'🌾'} ${l.formule_nom}</div>
        <div style="color:var(--textm)">${l.date} · ${l.ref||''}</div>
      </div>
      <div style="font-family:'DM Mono',monospace;color:var(--g6)">${fmt(Number(l.nb_sacs||0)*Number(l.poids_sac||25)||l.qte_produite||0)} kg</div>
    </div>`).join('');

  // Alertes stock
  const alerteHtml=alertes.slice(0,5).map(([nom,n])=>`
    <div style="display:flex;justify-content:space-between;padding:5px 0;font-size:11px;border-bottom:1px solid rgba(239,68,68,.1)">
      <span style="color:var(--red)">⚠ ${nom}</span>
      <span style="font-family:'DM Mono',monospace;color:var(--red)">${fmtKg(n)} kg</span>
    </div>`).join('');

  // Ventes du jour
  const ventesJourHtml=VJ.map(v=>`
    <div style="display:flex;justify-content:space-between;padding:5px 0;border-bottom:1px solid var(--card2);font-size:11px">
      <div>
        <div style="font-weight:600">${v.client_nom||'Client comptant'}</div>
        <div style="color:var(--textm)">${v.formule_nom||'—'}</div>
      </div>
      ${vueComplete?`<div style="text-align:right">
        <div style="font-family:'DM Mono',monospace;color:var(--gold)">${fmt(v.montant_total)} F</div>
        <span class="badge ${v.statut_paiement==='paye'?'bdg-g':v.statut_paiement==='partiel'?'bdg-gold':'bdg-r'}" style="font-size:9px">${v.statut_paiement}</span>
      </div>`:''}
    </div>`).join('');

  // Dashboard PDV secrétaire
  if(GP_POINT_VENTE){
    const banner=document.getElementById('dash-pdv-banner');
    if(banner)banner.style.display='block';
    const nomEl=document.getElementById('dash-pdv-nom');
    if(nomEl)nomEl.textContent=GP_POINT_VENTE;
    const{data:stockPDV}=await SB.from('gp_stock_produits_pdv').select('*')
      .eq('admin_id',GP_ADMIN_ID).eq('pdv_nom',GP_POINT_VENTE);
    const SP=stockPDV||[];
    const ok=SP.filter(s=>Number(s.qte_disponible||0)>Number(s.seuil_critique||0)).length;
    const alerte=SP.filter(s=>Number(s.qte_disponible||0)<=Number(s.seuil_critique||0)).length;
    const stockOkEl=document.getElementById('dash-pdv-stock-ok');
    const stockAlEl=document.getElementById('dash-pdv-stock-alert');
    if(stockOkEl)stockOkEl.textContent=ok;
    if(stockAlEl){stockAlEl.textContent=alerte;stockAlEl.style.color=alerte>0?'var(--red)':'var(--green)';}
    // Ventes du jour de ce PDV
    const ventesAujPDV=VJ.filter(v=>v.point_vente===GP_POINT_VENTE);
    const ventesJourEl=document.getElementById('dash-pdv-ventes-jour');
    if(ventesJourEl)ventesJourEl.textContent=fmt(ventesAujPDV.reduce((s,v)=>s+Number(v.montant_total||0),0))+' F';
  }

  // Vérifier feuilles incomplètes
  if(typeof verifierFeuillesIncompletes==='function')verifierFeuillesIncompletes();

  // Bilan production du mois dans le dashboard
  setTimeout(()=>{
    if(typeof renderBilanProduction==='function'){
      renderBilanProduction(LM).then(()=>{
        // Déplacer le contenu du bilan production vers le dashboard
        const src=document.getElementById('prod-bilan-mois');
        const dest=document.getElementById('dash-bilan-prod');
        if(src&&dest)dest.innerHTML=src.innerHTML;
      }).catch(()=>{});
    }
  },100);

  try{ _renderDashChart(); }catch(e){}
  try{ _renderIABriefing(); }catch(e){}

  document.getElementById('dash-body').innerHTML=`
    <div>
      <div class="card">
        <div class="card-title"><div class="ct-left"><span>🏭 Dernière production</span></div></div>
        ${derniersLotsHtml||'<div style="color:var(--textm);font-size:12px">Aucune production. <span style="color:var(--g6);cursor:pointer" onclick="showGP(\'production\')">→ Enregistrer</span></div>'}
        <button class="btn btn-g btn-sm no-print" style="width:100%;justify-content:center;margin-top:8px" onclick="showGP('production')">+ Nouveau lot</button>
      </div>
      <div class="card">
        <div class="card-title"><div class="ct-left"><span>⚠ Alertes stock MP</span></div></div>
        ${alerteHtml||'<div style="color:var(--green);font-size:12px">✓ Tous les stocks sont suffisants.</div>'}
        <button class="btn btn-out btn-sm no-print" style="width:100%;justify-content:center;margin-top:8px" onclick="showGP('stock')">Gérer le stock →</button>
      </div>
    </div>
    <div>
      <div class="card">
        <div class="card-title"><div class="ct-left"><span>💰 Ventes du jour</span></div></div>
        ${ventesJourHtml||'<div style="color:var(--textm);font-size:12px">Aucune vente aujourd\'hui.</div>'}
        <button class="btn btn-g btn-sm no-print" style="width:100%;justify-content:center;margin-top:8px" onclick="showGP('ventes')">+ Nouvelle vente</button>
      </div>
      ${isAdmin?`<div class="card">
        <div class="card-title"><div class="ct-left"><span>📊 Bilan ${m}</span></div></div>
        <div style="display:flex;flex-direction:column;gap:8px;font-size:12px">
          <div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--card2)">
            <span style="color:var(--textm)">CA Provenderie</span>
            <span style="color:var(--gold);font-family:'DM Mono',monospace">${fmt(caMois)} F</span>
          </div>
          ${caFermeMois>0?`<div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--card2)">
            <span style="color:var(--textm)">🚜 CA Ferme</span>
            <span style="color:var(--g6);font-family:'DM Mono',monospace">${fmt(caFermeMois)} F</span>
          </div>`:''}
          <div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--card2)">
            <span style="color:var(--textm)">Encaissé Provenderie</span>
            <span style="color:var(--green);font-family:'DM Mono',monospace">${fmt(encaisseMois)} F</span>
          </div>
          <div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--card2)">
            <span style="color:var(--textm)">Achats MP payés</span>
            <span style="color:var(--red);font-family:'DM Mono',monospace">− ${fmt(depAchatsMP)} F</span>
          </div>
          <div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--card2)">
            <span style="color:var(--textm)">Dépenses courantes</span>
            <span style="color:var(--red);font-family:'DM Mono',monospace">− ${fmt(depCourantes)} F</span>
          </div>
          <div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--card2)">
            <span style="color:var(--textm)">Salaires</span>
            <span style="color:var(--red);font-family:'DM Mono',monospace">− ${fmt(depSalaires)} F</span>
          </div>
          <div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--card2)">
            <span style="color:var(--textm);font-weight:600">Total dépenses</span>
            <span style="color:var(--red);font-family:'DM Mono',monospace;font-weight:700">− ${fmt(depMois)} F</span>
          </div>
          <div style="display:flex;justify-content:space-between;padding:6px 0">
            <span style="font-weight:700">Bénéfice net</span>
            <span style="color:${beneficeMois>=0?'var(--gold)':'var(--red)'};font-family:'DM Mono',monospace;font-size:14px;font-weight:700">${fmt(beneficeMois)} F</span>
          </div>
        </div>
        <button class="btn btn-out btn-sm no-print" style="width:100%;justify-content:center;margin-top:8px" onclick="showGP('bilan_avance')">Bilan complet →</button>
      </div>`:''}
      ${(() => {
        const aCommuniquer = VJ.filter(v => !v.recu_imprime || (!v.wa_envoye && !v.sms_envoye));
        if(!aCommuniquer.length) return '';
        return `<div class="card" style="border-color:rgba(245,158,11,.4);background:rgba(245,158,11,.04)">
          <div class="card-title"><div class="ct-left"><span>📋 À communiquer aujourd'hui (${aCommuniquer.length})</span></div></div>
          <div style="font-size:10px;color:var(--textm);margin-bottom:8px">Ventes du jour sans reçu imprimé ou sans message envoyé</div>
          ${aCommuniquer.slice(0,8).map(v => {
            const reste = Number(v.montant_total||0) - Number(v.montant_paye||0);
            const statutCom = [
              v.recu_imprime ? '🖨️✓' : '🖨️',
              v.wa_envoye ? '📲✓' : (v.sms_envoye ? '💬✓' : '📲'),
            ].join(' ');
            return `<div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px solid var(--card2);font-size:11px">
              <div style="flex:1;min-width:0">
                <div style="font-weight:600">${v.client_nom||'Comptant'}</div>
                <div style="color:var(--textm);font-size:10px">${fmt(v.montant_total)} F · ${statutCom}</div>
              </div>
              <div style="display:flex;gap:4px">
                ${!v.recu_imprime?`<button class="btn btn-out btn-sm" onclick="imprimerDepuisDashboard('${v.id}')" title="Imprimer" style="padding:3px 7px;font-size:11px">🖨️</button>`:''}
                ${(!v.wa_envoye && !v.sms_envoye)?`<button class="btn btn-out btn-sm" onclick="ouvrirPreviewWA('${v.id}')" title="WhatsApp" style="padding:3px 7px;font-size:11px;color:#25D366;border-color:rgba(37,211,102,.3)">📲</button>`:''}
              </div>
            </div>`;
          }).join('')}
          ${aCommuniquer.length>8?`<div style="font-size:10px;color:var(--textm);text-align:center;margin-top:6px">… et ${aCommuniquer.length-8} autres</div>`:''}
        </div>`;
      })()}
    </div>
    ${isAdmin?`<div class="card" style="grid-column:1/-1">
      <div class="card-title">
        <div class="ct-left"><span>🏭 Production ${m}</span></div>
        <button class="btn btn-out btn-sm" onclick="showGP('production')" style="font-size:10px">Voir détail →</button>
      </div>
      <div id="dash-bilan-prod"><div style="color:var(--textm);font-size:12px">Chargement...</div></div>
    </div>`:''}`;

  // Injecter le bilan production
  if(isAdmin&&typeof renderBilanProduction==='function'){
    setTimeout(async()=>{
      const src=document.getElementById('prod-bilan-mois');
      // Déclencher le calcul sur une div temporaire si besoin
      if(!src){
        const tmp=document.createElement('div');
        tmp.id='prod-bilan-mois';
        tmp.style.display='none';
        document.body.appendChild(tmp);
        await renderBilanProduction(LM);
        const dest=document.getElementById('dash-bilan-prod');
        if(dest)dest.innerHTML=tmp.innerHTML;
        tmp.remove();
      } else {
        await renderBilanProduction(LM);
        const dest=document.getElementById('dash-bilan-prod');
        if(dest)dest.innerHTML=src.innerHTML;
      }
    },50);
  }
}

// Briefing IA du jour (1×/jour, cache localStorage) — couvre résumé + alertes + actions
function _iaEscDash(s){ return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
async function _renderIABriefing(){
  const el = document.getElementById('dash-ia');
  if(!el) return;
  if(typeof _iaAllowed!=='function' || !_iaAllowed() || typeof iaGenerate!=='function'){ el.innerHTML=''; return; }
  const key = 'gp-briefing-' + (GP_POINT_VENTE||'R') + '-' + new Date().toISOString().slice(0,10);
  const render = (txt, loading) => {
    el.innerHTML = `<div class="card" style="border-left:3px solid var(--g4,#16A34A)">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
        <div style="font-weight:800;font-size:13px;color:var(--g6,#15803D)">🤖 Briefing du jour</div>
        <button class="btn btn-out btn-sm" onclick="_briefingRefresh()" ${loading?'disabled':''} title="Régénérer">↻</button>
      </div>
      <div style="font-size:13px;line-height:1.5;white-space:pre-wrap;color:var(--text)">${loading?'Génération du briefing…':_iaEscDash(txt)}</div>
    </div>`;
  };
  let cached=null; try{ cached=localStorage.getItem(key); }catch(e){}
  if(cached){ render(cached,false); return; }
  render('', true);
  try{
    const q = "Fais-moi le BRIEFING DU JOUR, très concis (puces) : 1) l'essentiel (CA et encaissé du mois, tendance) ; 2) les ALERTES à surveiller (impayés, caisse basse, dettes fournisseurs) ; 3) les 3 ACTIONS prioritaires aujourd'hui. 6 lignes maximum.";
    const txt = await iaGenerate('comptable', q, 'eco');
    try{ localStorage.setItem(key, txt); }catch(e){}
    render(txt, false);
  }catch(e){
    el.innerHTML = `<div class="card" style="font-size:12px;color:var(--textm)">🤖 Briefing indisponible — ${_iaEscDash(String(e.message||e))}</div>`;
  }
}
function _briefingRefresh(){
  const key = 'gp-briefing-' + (GP_POINT_VENTE||'R') + '-' + new Date().toISOString().slice(0,10);
  try{ localStorage.removeItem(key); }catch(e){}
  _renderIABriefing();
}

// Graphe CA des 6 derniers mois (barres CSS, sans librairie) — cloisonné par PDV
async function _renderDashChart(){
  const el=document.getElementById('dash-chart');
  if(!el) return;
  const now=new Date();
  const debut=new Date(now.getFullYear(), now.getMonth()-5, 1).toISOString().slice(0,10);
  let q=SB.from('gp_ventes').select('montant_total,date,point_vente')
    .eq('admin_id',GP_ADMIN_ID).is('deleted_at',null).gte('date',debut);
  const{data}=await q;
  let V=data||[];
  if(typeof estCloisonnePDV==='function' && estCloisonnePDV()){
    V=V.filter(v=>v.point_vente===(GP_POINT_VENTE||'Production'));
  }
  // 6 buckets mensuels
  const mois=[];
  for(let i=5;i>=0;i--){
    const d=new Date(now.getFullYear(), now.getMonth()-i, 1);
    mois.push({k:d.toISOString().slice(0,7), lbl:d.toLocaleDateString('fr-FR',{month:'short'}), val:0});
  }
  V.forEach(v=>{
    const k=(v.date||'').slice(0,7);
    const b=mois.find(m=>m.k===k);
    if(b) b.val+=Number(v.montant_total||0);
  });
  const max=Math.max(1,...mois.map(m=>m.val));
  const barres=mois.map(m=>{
    const h=Math.round(m.val/max*100);
    return `<div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:4px">
      <div style="font-size:9px;color:var(--textm);font-family:'DM Mono',monospace">${m.val>0?fmt(Math.round(m.val/1000))+'k':''}</div>
      <div style="width:60%;height:90px;display:flex;align-items:flex-end">
        <div style="width:100%;height:${h}%;min-height:2px;background:linear-gradient(180deg,var(--g4),var(--g6));border-radius:4px 4px 0 0"></div>
      </div>
      <div style="font-size:10px;color:var(--textm)">${m.lbl}</div>
    </div>`;
  }).join('');
  el.innerHTML=`<div class="card">
    <div style="font-weight:700;font-size:13px;margin-bottom:10px">📈 CA des 6 derniers mois${(typeof estCloisonnePDV==='function'&&estCloisonnePDV())?' (mon PDV)':''}</div>
    <div style="display:flex;align-items:flex-end;gap:6px;padding:4px 2px">${barres}</div>
  </div>`;
}
