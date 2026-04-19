// ── DASHBOARD ──────────────────────────────────────
async function renderDashboard(){
  const m=thisMonth();
  const mDebut=m+'-01';
  const[{data:ventes},{data:depenses},{data:lots},{data:stock}]=await Promise.all([
    SB.from('gp_ventes').select('*').eq('admin_id',GP_ADMIN_ID),
    SB.from('gp_depenses').select('*').eq('admin_id',GP_ADMIN_ID),
    SB.from('gp_lots').select('*').eq('admin_id',GP_ADMIN_ID).order('date',{ascending:false}).limit(5),
    SB.from('gp_stock_mp').select('*').eq('admin_id',GP_ADMIN_ID),
  ]);
  const V=ventes||[];const D=depenses||[];const L=lots||[];const S=stock||[];
  const caMois=V.filter(v=>v.date>=mDebut).reduce((s,v)=>s+Number(v.montant_total||0),0);
  const impaye=V.reduce((s,v)=>s+(Number(v.montant_total||0)-Number(v.montant_paye||0)),0);
  const depMois=D.filter(d=>d.date>=mDebut).reduce((s,d)=>s+Number(d.montant||0),0);
  const prodMois=L.filter(l=>l.date>=mDebut).reduce((s,l)=>s+Number(l.qte_produite||0),0);
  // Stock alerts
  const niveaux=calcNiveaux(S);
  const alertes=Object.entries(niveaux).filter(([nom,n])=>{
    const ingr=GP_INGREDIENTS.find(i=>i.nom===nom);
    return n<(ingr?.seuil_alerte||200);
  });
  document.getElementById('dash-date-sub').textContent=`${new Date().toLocaleDateString('fr-FR',{weekday:'long',day:'numeric',month:'long',year:'numeric'})} — Données temps réel`;
  const isAdmin=GP_ROLE==='admin';
  document.getElementById('dash-kpis').innerHTML=`
    ${isAdmin?`<div class="stat-box"><div class="stat-val" style="color:var(--gold)">${fmt(caMois)}</div><div class="stat-lbl">CA ce mois (FCFA)</div></div>
    <div class="stat-box"><div class="stat-val" style="color:${impaye>0?'var(--red)':'var(--green)'}">${fmt(impaye)}</div><div class="stat-lbl">Impayés (FCFA)</div></div>
    <div class="stat-box"><div class="stat-val" style="color:${depMois>caMois?'var(--red)':'var(--textm)'}">${fmt(depMois)}</div><div class="stat-lbl">Dépenses ce mois</div></div>`:''}
    <div class="stat-box"><div class="stat-val">${fmt(prodMois)}</div><div class="stat-lbl">Kg produits ce mois</div></div>
    ${!isAdmin?`<div class="stat-box"><div class="stat-val" style="color:${alertes.length>0?'var(--red)':'var(--green)'}">${alertes.length}</div><div class="stat-lbl">Alertes stock bas</div></div>`:''}`;
  // Body
  const derniersLots=L.slice(0,4).map(l=>`
    <div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid rgba(30,45,74,.3);font-size:11px">
      <div><div style="font-weight:600">${ESPECE_ICON[l.espece]||''} ${l.formule_nom}</div><div style="color:var(--textm)">${l.date} · ${l.ref||''}</div></div>
      <div style="text-align:right;font-family:'DM Mono',monospace;color:var(--g6)">${fmt(l.qte_produite)} kg</div>
    </div>`).join('');
  const alerteH=alertes.slice(0,5).map(([nom,n])=>`
    <div style="display:flex;justify-content:space-between;padding:5px 0;font-size:11px;border-bottom:1px solid rgba(239,68,68,.1)">
      <span style="color:var(--red)">⚠ ${nom}</span>
      <span style="font-family:'DM Mono',monospace;color:var(--red)">${fmtKg(n)} kg</span>
    </div>`).join('');
  const ventesH=V.filter(v=>v.date===today()).slice(0,5).map(v=>`
    <div style="display:flex;justify-content:space-between;padding:5px 0;border-bottom:1px solid rgba(30,45,74,.3);font-size:11px">
      <div><div style="font-weight:600">${v.client_nom||'—'}</div><div style="color:var(--textm)">${v.formule_nom||'—'} · ${fmtKg(v.qte_vendue)} kg</div></div>
      ${isAdmin?`<div style="text-align:right"><div style="font-family:'DM Mono',monospace;color:var(--gold)">${fmt(v.montant_total)} F</div><span class="badge ${v.statut_paiement==='paye'?'bdg-g':v.statut_paiement==='partiel'?'bdg-gold':'bdg-r'}" style="font-size:9px">${v.statut_paiement}</span></div>`:'<div></div>'}
    </div>`).join('');
  document.getElementById('dash-body').innerHTML=`
    <div>
      <div class="card">
        <div class="card-title"><div class="ct-left"><span>🏭 Dernière production</span></div></div>
        ${derniersLots||'<div style="color:var(--textm);font-size:12px">Aucune production. <span style="color:var(--g6);cursor:pointer" onclick="showGP(\'production\')">→ Enregistrer</span></div>'}
        <button class="btn btn-g btn-sm no-print" style="width:100%;justify-content:center;margin-top:8px" onclick="showGP('production')">+ Nouveau lot</button>
      </div>
      <div class="card">
        <div class="card-title"><div class="ct-left"><span>⚠ Alertes stock</span></div></div>
        ${alerteH||'<div style="color:var(--green);font-size:12px">✓ Tous les stocks sont suffisants.</div>'}
        <button class="btn btn-out btn-sm no-print" style="width:100%;justify-content:center;margin-top:8px" onclick="showGP('stock')">Gérer le stock →</button>
      </div>
    </div>
    <div>
      <div class="card">
        <div class="card-title"><div class="ct-left"><span>💰 Ventes du jour</span></div></div>
        ${ventesH||'<div style="color:var(--textm);font-size:12px">Aucune vente aujourd\'hui.</div>'}
        <button class="btn btn-g btn-sm no-print" style="width:100%;justify-content:center;margin-top:8px" onclick="showGP('ventes')">+ Nouvelle vente</button>
      </div>
      ${isAdmin?`<div class="card">
        <div class="card-title"><div class="ct-left"><span>📊 Bilan rapide ce mois</span></div></div>
        <div style="display:flex;flex-direction:column;gap:8px;font-size:12px">
          <div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid rgba(30,45,74,.3)"><span style="color:var(--textm)">CA ventes</span><span style="color:var(--green);font-family:'DM Mono',monospace">${fmt(caMois)} F</span></div>
          <div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid rgba(30,45,74,.3)"><span style="color:var(--textm)">Dépenses</span><span style="color:var(--red);font-family:'DM Mono',monospace">− ${fmt(depMois)} F</span></div>
          <div style="display:flex;justify-content:space-between;padding:6px 0"><span style="font-weight:700">Bénéfice estimé</span><span style="color:${caMois-depMois>=0?'var(--gold)':'var(--red)'};font-family:'DM Mono',monospace;font-size:14px;font-weight:700">${fmt(caMois-depMois)} F</span></div>
        </div>
        <button class="btn btn-out btn-sm no-print" style="width:100%;justify-content:center;margin-top:8px" onclick="showGP('bilan_jour')">Bilan journalier →</button>
      </div>`:''}
    </div>`;
}