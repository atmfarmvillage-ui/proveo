// ── DASHBOARD ──────────────────────────────────────
// Fonctions date autonomes — pas de dépendance externe
function _finMois(mois){
  const[y,mo]=(mois||new Date().toISOString().slice(0,7)).split('-').map(Number);
  return mois+'-'+String(new Date(y,mo,0).getDate()).padStart(2,'0');
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
    r1,r2,r3,r4,r5,r6,r7,r8
  ]=await Promise.all([
    safe(SB.from('gp_ventes').select('montant_total,montant_paye,statut_paiement,point_vente,date,client_nom,formule_nom,qte_vendue').eq('admin_id',GP_ADMIN_ID).gte('date',mDebut).lte('date',mFin)),
    safe(SB.from('gp_ventes').select('montant_total,montant_paye,statut_paiement,client_nom,formule_nom,qte_vendue,point_vente,date').eq('admin_id',GP_ADMIN_ID).eq('date',(typeof today==='function'?today():new Date().toISOString().slice(0,10)))),
    safe(SB.from('gp_depenses').select('montant,date').eq('admin_id',GP_ADMIN_ID).gte('date',mDebut).lte('date',mFin)),
    safe(SB.from('gp_achats_paiements').select('montant,date_paiement').eq('admin_id',GP_ADMIN_ID).gte('date_paiement',mDebut).lte('date_paiement',mFin)),
    safe(SB.from('gp_salaires').select('montant').eq('admin_id',GP_ADMIN_ID).eq('mois',m)),
    safe(SB.from('gp_lots').select('qte_produite,nb_sacs,poids_sac,date,formule_nom,ref,espece').eq('admin_id',GP_ADMIN_ID).gte('date',mDebut).lte('date',mFin)),
    safe(SB.from('gp_lots').select('qte_produite,nb_sacs,poids_sac,date,formule_nom,ref,espece').eq('admin_id',GP_ADMIN_ID).order('date',{ascending:false}).limit(4)),
    safe(SB.from('gp_stock_mp').select('*').eq('admin_id',GP_ADMIN_ID)),
  ]);
  // Extraire les tableaux — garantir que c'est toujours un Array
  const toArr=r=>Array.isArray(r?.data)?r.data:(r?.data?Object.values(r.data):[]);
  const[ventesMoisD,toutesVentesD,depensesD,paiementsMP,salairesD,lotsMoisD,derniersLotsD,stockD]=
    [r1,r2,r3,r4,r5,r6,r7,r8].map(toArr);
  const VMois=ventesMoisD;
  const VJ=toutesVentesD;
  const D=depensesD;
  const PA=paiementsMP;
  const SAL=salairesD;
  const LM=lotsMoisD;
  const DL=derniersLotsD;
  const S=stockD;

  // ── CALCULS CORRECTS ─────────────────────────────
  // CA du mois = somme des montants_total des ventes du mois
  const caMois=VMois.reduce((s,v)=>s+Number(v.montant_total||0),0);

  // Impayés du mois = ventes du mois non soldées uniquement
  const impayeMois=VMois.reduce((s,v)=>{
    const reste=Number(v.montant_total||0)-Number(v.montant_paye||0);
    return s+(reste>0?reste:0);
  },0);

  // Encaissé du mois = somme des montants_paye
  const encaisseMois=VMois.reduce((s,v)=>s+Number(v.montant_paye||0),0);

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

  // Alertes stock
  const niveaux=calcNiveaux(S);
  const alertes=Object.entries(niveaux).filter(([nom,n])=>{
    const ingr=GP_INGREDIENTS.find(i=>i.nom===nom);
    return n<(ingr?.seuil_alerte||200);
  });

  // ── AFFICHAGE ────────────────────────────────────
  document.getElementById('dash-date-sub').textContent=
    `${new Date().toLocaleDateString('fr-FR',{weekday:'long',day:'numeric',month:'long',year:'numeric'})} — Données temps réel`;

  const isAdmin=GP_ROLE==='admin';

  document.getElementById('dash-kpis').innerHTML=`
    ${isAdmin?`
    <div class="stat-box">
      <div class="stat-val" style="color:var(--gold)">${fmt(caMois)}</div>
      <div class="stat-lbl">CA ce mois (FCFA)</div>
    </div>
    <div class="stat-box">
      <div class="stat-val" style="color:var(--green)">${fmt(encaisseMois)}</div>
      <div class="stat-lbl">Encaissé ce mois</div>
    </div>
    <div class="stat-box">
      <div class="stat-val" style="color:${impayeMois>0?'var(--red)':'var(--green)'}">${fmt(impayeMois)}</div>
      <div class="stat-lbl">Impayés du mois</div>
    </div>
    <div class="stat-box">
      <div class="stat-val" style="color:${depMois>encaisseMois?'var(--red)':'var(--textm)'}">${fmt(depMois)}</div>
      <div class="stat-lbl">Dépenses ce mois</div>
    </div>`:''}
    <div class="stat-box">
      <div class="stat-val">${fmt(prodMois)} kg</div>
      <div class="stat-lbl">Produits ce mois${nbSacsMois>0?` · ${nbSacsMois} sacs`:''}</div>
    </div>
    ${!isAdmin?`<div class="stat-box">
      <div class="stat-val" style="color:${alertes.length>0?'var(--red)':'var(--green)'}">${alertes.length}</div>
      <div class="stat-lbl">Alertes stock</div>
    </div>`:''}`;

  // Derniers lots
  const derniersLotsHtml=DL.map(l=>`
    <div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid rgba(30,45,74,.3);font-size:11px">
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
    <div style="display:flex;justify-content:space-between;padding:5px 0;border-bottom:1px solid rgba(30,45,74,.3);font-size:11px">
      <div>
        <div style="font-weight:600">${v.client_nom||'Client comptant'}</div>
        <div style="color:var(--textm)">${v.formule_nom||'—'}</div>
      </div>
      ${isAdmin?`<div style="text-align:right">
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
          <div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid rgba(30,45,74,.3)">
            <span style="color:var(--textm)">CA total</span>
            <span style="color:var(--gold);font-family:'DM Mono',monospace">${fmt(caMois)} F</span>
          </div>
          <div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid rgba(30,45,74,.3)">
            <span style="color:var(--textm)">Encaissé</span>
            <span style="color:var(--green);font-family:'DM Mono',monospace">${fmt(encaisseMois)} F</span>
          </div>
          <div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid rgba(30,45,74,.3)">
            <span style="color:var(--textm)">Achats MP payés</span>
            <span style="color:var(--red);font-family:'DM Mono',monospace">− ${fmt(depAchatsMP)} F</span>
          </div>
          <div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid rgba(30,45,74,.3)">
            <span style="color:var(--textm)">Dépenses courantes</span>
            <span style="color:var(--red);font-family:'DM Mono',monospace">− ${fmt(depCourantes)} F</span>
          </div>
          <div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid rgba(30,45,74,.3)">
            <span style="color:var(--textm)">Salaires</span>
            <span style="color:var(--red);font-family:'DM Mono',monospace">− ${fmt(depSalaires)} F</span>
          </div>
          <div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid rgba(30,45,74,.3)">
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
