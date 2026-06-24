// ══════════════════════════════════════════════════
// PROVENDA — CENTRE D'ALERTES
// Agrège : livraisons non confirmées, péremption véto, stock bas, impayés.
// Les données sont cloisonnées par PDV via la RLS (un secrétaire ne voit que les siennes).
// ══════════════════════════════════════════════════

async function renderAlertes(){
  const c=document.getElementById('alertes-content');
  if(!c) return;
  c.innerHTML='<div style="color:var(--textm);font-size:12px;padding:10px">⏳ Chargement des alertes…</div>';

  const todayStr=(typeof today==='function')?today():new Date().toISOString().slice(0,10);
  const in30=new Date(Date.now()+30*86400000).toISOString().slice(0,10);
  const estCentral = GP_ROLE==='admin' || !GP_POINT_VENTE; // admin + Production voient le MP central

  if(typeof loadVetoCatalogue==='function'){ try{ await loadVetoCatalogue(); }catch(e){} }

  const safe=async(q)=>{try{return await q;}catch(e){return {data:[]};}};
  const[{data:liv},{data:vetoLots},{data:stockPF},{data:ventesImp},{data:stockMP}]=await Promise.all([
    safe(SB.from('gp_livraisons_pdv').select('*').eq('admin_id',GP_ADMIN_ID).eq('statut','envoye')),
    safe(SB.from('gp_stock_veto').select('*').eq('admin_id',GP_ADMIN_ID).gt('qte',0)),
    safe(SB.from('gp_stock_produits_pdv').select('*').eq('admin_id',GP_ADMIN_ID)),
    safe(SB.from('gp_ventes').select('client_id,client_nom,point_vente,montant_total,montant_paye,date').eq('admin_id',GP_ADMIN_ID).is('deleted_at',null).in('statut_paiement',['impaye','partiel'])),
    estCentral ? safe(SB.from('gp_stock_mp').select('*').eq('admin_id',GP_ADMIN_ID)) : Promise.resolve({data:[]}),
  ]);

  const L=liv||[], VL=vetoLots||[], SPF=stockPF||[], VI=ventesImp||[];

  // ── 1. Livraisons non confirmées ──
  const monPDV = GP_POINT_VENTE||'Production';
  const livAlertes=L.map(l=>{
    const peutConf = GP_ROLE==='admin' || l.pdv_dest_nom===monPDV || l.pdv_dest===monPDV;
    return {
      l:`${l.pdv_source_nom||l.pdv_source||'—'} → ${l.pdv_dest_nom||l.pdv_dest||'—'} · ${l.formule_nom||''} · ${l.qte_envoyee||0} sac(s)`,
      r:`envoyée ${l.date_livraison||l.date||'?'}`,
      btn: peutConf?`<button class="btn btn-g btn-sm" style="padding:3px 8px" onclick="ouvrirConfirmationReception('${l.id}')">📦 Confirmer</button>`:''
    };
  });

  // ── 2. Péremption véto ──
  const vetoPerimes=VL.filter(v=>v.date_peremption&&v.date_peremption<todayStr);
  const vetoProches=VL.filter(v=>v.date_peremption&&v.date_peremption>=todayStr&&v.date_peremption<=in30);

  // ── 3. Stock bas ──
  const pfBas=SPF.filter(s=>Number(s.qte_disponible||0)<=Number(s.seuil_critique||0));
  // Véto bas : agrégé par produit/pdv vs seuil du catalogue
  const vetoAgg={};
  VL.forEach(v=>{const k=v.pdv_nom+'||'+(v.produit_id||v.produit_nom); if(!vetoAgg[k])vetoAgg[k]={pdv:v.pdv_nom,nom:v.produit_nom,produit_id:v.produit_id,qte:0,unite:v.unite}; vetoAgg[k].qte+=Number(v.qte||0);});
  const cat={}; (typeof GP_VETO_CATALOGUE!=='undefined'?GP_VETO_CATALOGUE:[]).forEach(p=>{cat[p.id]=p;});
  const vetoBas=Object.values(vetoAgg).filter(a=>a.qte<=Number(cat[a.produit_id]?.seuil_alerte||5));
  // MP bas (central uniquement)
  let mpBas=[];
  if(estCentral && typeof calcNiveaux==='function'){
    const niv=calcNiveaux(stockMP||[]);
    mpBas=Object.entries(niv).filter(([nom,q])=>{
      const ing=(typeof GP_INGREDIENTS!=='undefined'?GP_INGREDIENTS:[]).find(i=>i.nom===nom);
      return Number(q)<Number(ing?.seuil_alerte||200);
    }).map(([nom,q])=>({nom,q}));
  }

  // ── 4. Impayés ──
  const detteParClient={};
  VI.forEach(v=>{const reste=Number(v.montant_total||0)-Number(v.montant_paye||0); if(reste<=0)return; const k=v.client_id||('c|'+(v.client_nom||'')); if(!detteParClient[k])detteParClient[k]={id:v.client_id||null,nom:v.client_nom||'Client comptant',pdv:v.point_vente,total:0}; detteParClient[k].total+=reste;});
  const impayes=Object.values(detteParClient).sort((a,b)=>b.total-a.total);
  const totalImpaye=impayes.reduce((s,i)=>s+i.total,0);

  // ── Compteur global ──
  const nbTotal=livAlertes.length+vetoPerimes.length+vetoProches.length+pfBas.length+vetoBas.length+mpBas.length+impayes.length;
  window._GP_NB_ALERTES=nbTotal;

  const section=(titre,couleur,items,vide)=>`
    <div class="card" style="margin-bottom:12px">
      <div class="card-title"><div class="ct-left"><span>${titre} ${items.length?`<span class="badge ${couleur}" style="font-size:9px">${items.length}</span>`:''}</span></div></div>
      ${items.length?items.map(i=>`<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid var(--card2);font-size:11px">
        <span>${i.l}</span>
        <span style="display:flex;align-items:center;gap:6px;flex-shrink:0">${i.r?`<span style="color:var(--textm);text-align:right">${i.r}</span>`:''}${i.btn||''}</span>
      </div>`).join(''):`<div style="color:var(--green);font-size:12px">${vide}</div>`}
    </div>`;

  c.innerHTML=`
    ${section('📦 Livraisons à confirmer','bdg-gold',
      livAlertes,'✓ Aucune livraison en attente.')}
    ${section('⛔ Véto périmé','bdg-r',
      vetoPerimes.map(v=>({l:`${v.produit_nom} · ${v.pdv_nom}`,r:`${fmt(v.qte)} ${v.unite||''} · périmé le ${v.date_peremption}`})),'✓ Aucun véto périmé.')}
    ${section('⚠ Véto proche péremption','bdg-gold',
      vetoProches.map(v=>({l:`${v.produit_nom} · ${v.pdv_nom}`,r:`${fmt(v.qte)} ${v.unite||''} · expire le ${v.date_peremption}`})),'✓ Aucun véto proche péremption.')}
    ${section('📉 Stock aliments bas','bdg-r',
      pfBas.map(s=>({l:`${s.formule_nom} · ${s.pdv_nom}`,r:`${fmt(s.qte_disponible)} kg (seuil ${fmt(s.seuil_critique)})`})),'✓ Stock aliments OK.')}
    ${section('💊 Stock véto bas','bdg-r',
      vetoBas.map(v=>({l:`${v.nom} · ${v.pdv}`,r:`${fmt(v.qte)} ${v.unite||''}`})),'✓ Stock véto OK.')}
    ${estCentral?section('🌾 Stock MP bas','bdg-r',
      mpBas.map(m=>({l:m.nom,r:`${fmtKg(m.q)} kg`})),'✓ Stock MP OK.'):''}
    ${section('💰 Impayés clients','bdg-r',
      impayes.map(i=>({l:`${i.nom}${i.pdv?' · '+i.pdv:''}`,r:`${fmt(i.total)} F dû`,btn:i.id?`<button class="btn btn-out btn-sm" style="padding:3px 8px;color:#25D366;border-color:rgba(37,211,102,.3)" onclick="envoyerRappelDette('${i.id}')">📲 Relancer</button>`:''})),'✓ Aucun impayé.')}
    ${totalImpaye>0?`<div style="font-size:11px;color:var(--textm);text-align:right">Total impayés : <b style="color:var(--red)">${fmt(totalImpaye)} F</b></div>`:''}
  `;

  // Bandeau résumé + bouton push (admin)
  const head=document.getElementById('alertes-head');
  if(head){
    head.innerHTML=`
      <div class="econo-box"><div class="econo-val" style="color:${nbTotal>0?'var(--red)':'var(--green)'}">${nbTotal}</div><div class="econo-lbl">Alertes actives</div></div>
      <div class="econo-box"><div class="econo-val" style="color:var(--gold)">${livAlertes.length}</div><div class="econo-lbl">Livraisons à confirmer</div></div>
      <div class="econo-box"><div class="econo-val" style="color:${(vetoPerimes.length+vetoProches.length)>0?'var(--red)':'var(--green)'}">${vetoPerimes.length+vetoProches.length}</div><div class="econo-lbl">Péremption véto</div></div>
      <div class="econo-box"><div class="econo-val" style="color:${impayes.length>0?'var(--red)':'var(--green)'}">${impayes.length}</div><div class="econo-lbl">Clients en dette</div></div>`;
  }
  const btn=document.getElementById('alertes-push-btn');
  if(btn) btn.style.display = (GP_ROLE==='admin'&&nbTotal>0) ? 'inline-flex' : 'none';
}

// Notifier l'équipe (admin) — push d'un résumé des alertes
async function pousserAlertes(){
  if(GP_ROLE!=='admin') return;
  const n=window._GP_NB_ALERTES||0;
  if(!n){ notify('Aucune alerte à notifier','gold'); return; }
  if(typeof pushSendToTeam==='function'){
    pushSendToTeam('🔔 Alertes PROVENDA', `${n} alerte(s) à traiter : livraisons, stock, péremption, impayés.`, {url:'#alertes',tag:'alertes',excludeSelf:true});
    notify('Équipe notifiée ✓','gold');
  } else {
    notify('Notifications indisponibles','r');
  }
}
