// ══════════════════════════════════════════════════
// PROVENDA — STOCK CENTRAL & RÉAPPRO (PDV secondaire ↔ principal/Production)
// Le secondaire voit le stock central et demande un réappro.
// Le principal/Production (ou admin) confirme → crée la livraison (vente_gros).
// ══════════════════════════════════════════════════

// Rôles de cette page
function _scEstDemandeur(){ return GP_EST_SECONDAIRE === true; }
function _scEstSource(){
  return GP_ROLE==='admin' || GP_EST_PRINCIPAL || (GP_ROLE==='secretaire' && !GP_POINT_VENTE);
}

// Nom du PDV principal (depuis la liste chargée, sinon requête)
async function _scPrincipalNom(){
  if(typeof GP_PDV_LIST!=='undefined' && GP_PDV_LIST?.length){
    const p=GP_PDV_LIST.find(x=>x.type_pdv==='principal');
    if(p) return p.nom;
  }
  try{
    const{data}=await SB.from('gp_points_vente').select('nom').eq('admin_id',GP_ADMIN_ID).eq('type_pdv','principal').maybeSingle();
    return data?.nom||null;
  }catch(e){ return null; }
}

function _scPoidsMap(lots){
  const ps={};
  (lots||[]).forEach(l=>{ if(!ps[l.formule_nom] && l.poids_sac) ps[l.formule_nom]=Number(l.poids_sac); });
  return ps;
}
function _scSacs(kg, poids){ const p=poids||25; return Math.floor(Number(kg||0)/p); }

async function renderStockCentral(){
  if(!GP_ADMIN_ID) return;
  const cont=document.getElementById('sc-content');
  if(!cont) return;
  cont.innerHTML='<div style="color:var(--textm);font-size:12px;padding:10px">Chargement…</div>';

  const principal=await _scPrincipalNom();
  const sources=['Production']; if(principal) sources.push(principal);

  const[{data:stock},{data:lots},{data:reaps}]=await Promise.all([
    SB.from('gp_stock_produits_pdv').select('*').eq('admin_id',GP_ADMIN_ID).in('pdv_nom',sources),
    SB.from('gp_lots').select('formule_nom,poids_sac,date').eq('admin_id',GP_ADMIN_ID).order('date',{ascending:false}),
    SB.from('gp_reappros').select('*').eq('admin_id',GP_ADMIN_ID).order('created_at',{ascending:false}).limit(50)
  ]);
  const ps=_scPoidsMap(lots);
  const S=(stock||[]).filter(s=>Number(s.qte_disponible||0)>0);
  const R=reaps||[];

  let html='';

  // ── SECTION : stock central (lecture) + (si demandeur) formulaire ──
  sources.forEach(src=>{
    const lignes=S.filter(s=>s.pdv_nom===src).sort((a,b)=>a.formule_nom.localeCompare(b.formule_nom));
    const emoji = src==='Production' ? '🏭' : '🏪';
    html+=`<div class="card" style="margin-bottom:12px">
      <div style="font-weight:700;font-size:13px;margin-bottom:8px">${emoji} ${src}</div>`;
    if(!lignes.length){
      html+='<div style="color:var(--textm);font-size:12px">Aucun stock disponible.</div></div>';
      return;
    }
    html+=`<table class="tbl" style="font-size:12px"><thead><tr>
      <th>Formule</th><th class="num">Dispo</th>${_scEstDemandeur()?'<th class="num">À commander</th>':''}
    </tr></thead><tbody>`;
    lignes.forEach(s=>{
      const poids=ps[s.formule_nom]||25;
      const sacs=_scSacs(s.qte_disponible,poids);
      html+=`<tr>
        <td style="font-weight:600">${s.formule_nom}</td>
        <td class="num"><b style="color:var(--g6)">${sacs}</b> sac${sacs>1?'s':''} <span style="color:var(--textm);font-size:9px">(${poids}kg)</span></td>
        ${_scEstDemandeur()?`<td class="num"><input type="number" inputmode="numeric" min="0" max="${sacs}" value="0"
          data-src="${String(src).replace(/"/g,'&quot;')}" data-formule="${String(s.formule_nom).replace(/"/g,'&quot;')}" data-poids="${poids}"
          style="width:60px;text-align:right;font-size:13px;padding:4px 6px;border:1px solid var(--border2);border-radius:6px;background:var(--card2);color:var(--text)"></td>`:''}
      </tr>`;
    });
    html+='</tbody></table>';
    if(_scEstDemandeur()){
      html+=`<button class="btn btn-g" style="width:100%;justify-content:center;margin-top:8px"
        onclick="demanderReappro('${String(src).replace(/'/g,"\\'")}')">📦 Demander le réappro à ${src}</button>`;
    }
    html+='</div>';
  });

  // ── SECTION : demandes reçues (source) ──
  if(_scEstSource()){
    const enAttente=R.filter(r=>r.statut==='demande');
    html+=`<div class="card" style="margin-bottom:12px">
      <div style="font-weight:700;font-size:13px;margin-bottom:8px">📥 Demandes de réappro reçues ${enAttente.length?`<span class="badge bdg-gold" style="font-size:9px">${enAttente.length}</span>`:''}</div>`;
    html+= enAttente.length ? enAttente.map(r=>{
      const items=(r.items||[]).map(i=>`${i.nb_sacs} sac${Number(i.nb_sacs)>1?'s':''} ${i.formule}`).join(' · ');
      return `<div style="border:1px solid var(--border2);border-radius:8px;padding:10px;margin-bottom:8px">
        <div style="font-weight:700;font-size:13px">${r.pdv_demandeur} <span style="font-size:10px;color:var(--textm)">← ${r.source}</span></div>
        <div style="font-size:12px;margin:4px 0">${items}</div>
        <div style="display:flex;gap:6px">
          <button class="btn btn-g btn-sm" onclick="confirmerReappro('${r.id}')">✅ Confirmer & livrer</button>
          <button class="btn btn-red btn-sm" onclick="refuserReappro('${r.id}')">❌ Refuser</button>
        </div>
      </div>`;
    }).join('') : '<div style="color:var(--textm);font-size:12px">Aucune demande en attente.</div>';
    html+='</div>';
  }

  // ── SECTION : mes demandes (demandeur) ──
  if(_scEstDemandeur()){
    const miennes=R.filter(r=>r.pdv_demandeur===GP_POINT_VENTE);
    html+=`<div class="card"><div style="font-weight:700;font-size:13px;margin-bottom:8px">📋 Mes demandes</div>`;
    html+= miennes.length ? miennes.map(r=>{
      const items=(r.items||[]).map(i=>`${i.nb_sacs} ${i.formule}`).join(' · ');
      const b={demande:'bdg-gold',livre:'bdg-g',refuse:'bdg-r',annule:'bdg-r'}[r.statut]||'bdg-gold';
      const lbl={demande:'⏳ En attente',livre:'✅ Livrée (à réceptionner)',refuse:'❌ Refusée',annule:'Annulée'}[r.statut]||r.statut;
      return `<div style="border:1px solid var(--border2);border-radius:8px;padding:10px;margin-bottom:8px">
        <div style="display:flex;justify-content:space-between;gap:8px">
          <div><div style="font-size:12px;font-weight:600">${r.source}</div><div style="font-size:12px">${items}</div></div>
          <span class="badge ${b}" style="font-size:9px;height:fit-content">${lbl}</span>
        </div>
        ${r.statut==='livre'?'<div style="font-size:10px;color:var(--textm);margin-top:4px">→ Va dans <b>Distribution PDV</b> pour confirmer la réception.</div>':''}
      </div>`;
    }).join('') : '<div style="color:var(--textm);font-size:12px">Aucune demande pour l\'instant.</div>';
    html+='</div>';
  }

  cont.innerHTML=html || '<div style="color:var(--textm);font-size:12px;padding:10px">Rien à afficher.</div>';
}

// ── Demander un réappro (PDV secondaire) ──────────
async function demanderReappro(source){
  const inputs=document.querySelectorAll('#sc-content input[data-src][data-formule]');
  const items=[];
  inputs.forEach(inp=>{
    if(inp.dataset.src!==source) return;
    const q=parseInt(inp.value,10)||0;
    if(q>0) items.push({formule:inp.dataset.formule, nb_sacs:q, poids_sac:Number(inp.dataset.poids)||25});
  });
  if(!items.length){ notify('Choisis au moins 1 sac à commander.','r'); return; }
  const{error}=await SB.from('gp_reappros').insert({
    admin_id:GP_ADMIN_ID, pdv_demandeur:GP_POINT_VENTE||'?', source, items, statut:'demande'
  });
  if(error){ notify('Erreur: '+error.message,'r'); return; }
  _scNotifSource(source, items);
  notify('Demande de réappro envoyée ✓','gold');
  renderStockCentral();
}

// Notifier les responsables de la source (push)
async function _scNotifSource(source, items){
  try{
    let q=SB.from('gp_membres').select('user_id').eq('admin_id',GP_ADMIN_ID).eq('actif',true);
    q = source==='Production' ? q.is('point_vente',null) : q.eq('point_vente',source);
    const{data:membres}=await q;
    const ids=[...new Set([GP_ADMIN_ID, ...((membres||[]).map(m=>m.user_id).filter(Boolean))])];
    const resume=(items||[]).map(i=>`${i.nb_sacs} ${i.formule}`).join(', ');
    if(typeof pushSendToUsers==='function' && ids.length){
      pushSendToUsers(ids,'📦 Demande de réappro',
        `${GP_POINT_VENTE||'Un PDV'} demande : ${resume}`,{tag:'reappro',url:'/?page=stock_central'});
    }
  }catch(e){}
}

// ── Confirmer & livrer (source) → crée la/les livraison(s) ──
async function confirmerReappro(id){
  const{data:r}=await SB.from('gp_reappros').select('*').eq('id',id).maybeSingle();
  if(!r || r.statut!=='demande'){ notify('Demande introuvable ou déjà traitée','r'); return; }
  if(!confirm(`Confirmer et livrer le réappro à ${r.pdv_demandeur} ? Le stock de ${r.source} sera décrémenté.`)) return;

  for(const it of (r.items||[])){
    const poids=Number(it.poids_sac)||25;
    const kg=Number(it.nb_sacs)*poids;
    // Prix : prix de vente local de la source (par kg) → montant + prix/sac
    const{data:st}=await SB.from('gp_stock_produits_pdv').select('prix_vente_local')
      .eq('admin_id',GP_ADMIN_ID).eq('pdv_nom',r.source).eq('formule_nom',it.formule).maybeSingle();
    const prixKg=Number(st?.prix_vente_local||0);
    const montant=Math.round(kg*prixKg);
    await SB.from('gp_livraisons_pdv').insert({
      admin_id:GP_ADMIN_ID,
      ref:'REAP-'+Date.now().toString().slice(-6),
      pdv_source_nom:r.source, pdv_dest_nom:r.pdv_demandeur,
      type_relation:'vente_gros', formule_nom:it.formule, type_produit:'formule',
      qte_envoyee:it.nb_sacs, qte_confirmee:0, poids_sac:poids,
      prix_gros_unitaire: poids>0 ? Math.round(prixKg*poids) : prixKg,
      montant_total:montant, montant_paye:0,
      statut:'envoye', statut_paiement:'impaye',
      envoye_par:GP_USER?.id, date_livraison:today()
    });
    if(typeof ajusterStockPDV==='function') await ajusterStockPDV(r.source, it.formule, -kg);
  }

  await SB.from('gp_reappros').update({
    statut:'livre', traite_par:GP_USER?.id, traite_at:new Date().toISOString()
  }).eq('id',id);

  // Notifier le demandeur
  try{
    const{data:membres}=await SB.from('gp_membres').select('user_id')
      .eq('admin_id',GP_ADMIN_ID).eq('actif',true).eq('point_vente',r.pdv_demandeur);
    const ids=(membres||[]).map(m=>m.user_id).filter(Boolean);
    if(typeof pushSendToUsers==='function' && ids.length){
      pushSendToUsers(ids,'✅ Réappro en route',
        `${r.source} a livré ta demande. Confirme la réception dans Distribution PDV.`,{tag:'reappro'});
    }
  }catch(e){}

  notify('Réappro livré ✓ — le PDV doit confirmer la réception','gold');
  renderStockCentral();
  try{ if(typeof renderDistribution==='function') renderDistribution(); }catch(e){}
}

async function refuserReappro(id){
  const motif=prompt('Motif du refus (optionnel) :');
  if(motif===null) return;
  await SB.from('gp_reappros').update({
    statut:'refuse', note:motif||null, traite_par:GP_USER?.id, traite_at:new Date().toISOString()
  }).eq('id',id);
  notify('Demande refusée','r');
  renderStockCentral();
}

// Enregistrement de la page (chargé après auth.js)
if(typeof PAGE_RENDERERS !== 'undefined'){
  PAGE_RENDERERS.stock_central = renderStockCentral;
}
