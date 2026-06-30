// ══════════════════════════════════════════════════
// PROVENDA — BILAN JOURNALIER & CLÔTURE DE CAISSE (par PDV)
// CA + encaissé + dépenses + réconciliation cash physique
// Attendu = SOLDE CUMULÉ de la caisse du PDV (tout le tiroir). Écart enregistré.
// ══════════════════════════════════════════════════

// Solde cumulé d'une caisse jusqu'à une date incluse (solde_initial + entrées − sorties ± transferts ± ajustements)
function soldeCaisseCumul(caisse, mvts, dateMax){
  let s=Number(caisse.solde_initial||0);
  (mvts||[]).forEach(m=>{
    if(m.date_mouvement && dateMax && m.date_mouvement>dateMax) return;
    if(m.type==='entree' && m.caisse_id===caisse.id) s+=Number(m.montant||0);
    else if(m.type==='sortie' && m.caisse_id===caisse.id) s-=Number(m.montant||0);
    else if(m.type==='ajustement' && m.caisse_id===caisse.id) s+=Number(m.montant||0);
    else if(m.type==='transfert' && m.statut_transfert!=='refuse'){
      if(m.caisse_id===caisse.id) s-=Number(m.montant||0);
      if(m.caisse_dest_id===caisse.id) s+=Number(m.montant||0);
    }
  });
  return s;
}

async function renderBilanJour(){
  const dateEl=document.getElementById('bj_date');
  if(dateEl && !dateEl.value) dateEl.value=today();
  const date=dateEl?.value||today();

  // ── Caisses (physique) — scopées par PDV pour une secrétaire ──
  let{data:CA}=await SB.from('gp_caisses').select('*')
    .eq('admin_id',GP_ADMIN_ID).eq('actif',true).eq('type','physique').order('nom');
  let caisses=CA||[];
  if(GP_ROLE!=='admin' && !GP_EST_GERANT && GP_POINT_VENTE){
    caisses=caisses.filter(c=>!c.point_vente||c.point_vente===GP_POINT_VENTE);
  }

  // Sélecteur de caisse
  const selEl=document.getElementById('bj_caisse');
  if(selEl){
    const cur=selEl.value;
    selEl.innerHTML=caisses.map(c=>`<option value="${c.id}">${c.nom}${c.point_vente?' ('+c.point_vente+')':' (Siège)'}</option>`).join('');
    if(cur && caisses.some(c=>c.id===cur)) selEl.value=cur;
  }
  const selectedId=selEl?.value||caisses[0]?.id||null;
  const caisse=caisses.find(c=>c.id===selectedId)||caisses[0]||null;
  const pdvSel = caisse ? (caisse.point_vente||'Production') : (GP_POINT_VENTE||'Production');

  // ── Données du jour + mouvements cumulés (≤ date) ──
  const [{data:ventes},{data:depenses},{data:mvtsAll}]=await Promise.all([
    SB.from('gp_ventes').select('*').eq('admin_id',GP_ADMIN_ID).is('deleted_at',null).eq('date',date).order('created_at'),
    SB.from('gp_depenses').select('*').eq('admin_id',GP_ADMIN_ID).eq('date',date).order('created_at'),
    SB.from('gp_mouvements_caisse').select('*').eq('admin_id',GP_ADMIN_ID).lte('date_mouvement',date).order('created_at')
  ]);

  // Scope ventes/dépenses au PDV de la caisse sélectionnée
  const V=(ventes||[]).filter(v=>(v.point_vente||'Production')===pdvSel);
  const D=(depenses||[]).filter(d=>(d.point_vente||'Production')===pdvSel);
  const MALL=mvtsAll||[];
  // Mouvements du JOUR pour la caisse sélectionnée (flux du jour)
  const Mday=MALL.filter(m=>m.date_mouvement===date && (m.caisse_id===selectedId||m.caisse_dest_id===selectedId));

  // ── KPIs ──
  const caTotal=V.reduce((s,v)=>s+Number(v.montant_total||0),0);
  const cashEncaisse=V.reduce((s,v)=>s+Number(v.montant_paye||0),0);
  const creditAccorde=Math.max(0,caTotal-cashEncaisse);
  const totDepenses=D.reduce((s,d)=>s+Number(d.montant||0),0);
  const entreesCaisse=Mday.filter(m=>(m.type==='entree')||(m.type==='transfert'&&m.statut_transfert!=='refuse'&&m.caisse_dest_id===selectedId)).reduce((s,m)=>s+Number(m.montant||0),0);
  const sortiesCaisse=Mday.filter(m=>(m.type==='sortie')||(m.type==='transfert'&&m.statut_transfert!=='refuse'&&m.caisse_id===selectedId)).reduce((s,m)=>s+Number(m.montant||0),0);
  const balanceJour=entreesCaisse-sortiesCaisse;
  const margeBrute=caTotal-totDepenses;

  document.getElementById('bj-kpis').innerHTML=`
    <div class="econo-box"><div class="econo-val" style="color:var(--green)">${fmt(caTotal)}</div><div class="econo-lbl">CA du jour (F)</div></div>
    <div class="econo-box"><div class="econo-val" style="color:var(--g6)">${fmt(cashEncaisse)}</div><div class="econo-lbl">Encaissé (F)</div></div>
    <div class="econo-box"><div class="econo-val" style="color:var(--gold)">${fmt(creditAccorde)}</div><div class="econo-lbl">Crédit accordé (F)</div></div>
    <div class="econo-box"><div class="econo-val" style="color:var(--red)">${fmt(totDepenses)}</div><div class="econo-lbl">Dépenses (F)</div></div>`;

  // ── Ventes du jour ──
  document.getElementById('bj-ventes').innerHTML=V.length
    ? `<table class="tbl" style="font-size:11px"><thead><tr><th>Client</th><th>Produits</th><th class="num">Total</th><th class="num">Payé</th><th>Statut</th></tr></thead><tbody>
      ${V.map(v=>`<tr>
        <td><div style="font-weight:600">${v.client_nom||'—'}</div><div style="font-size:9px;color:var(--textm)">${(v.created_at||'').slice(11,16)}</div></td>
        <td style="font-size:10px">${v.formule_nom||''}</td>
        <td class="num" style="color:var(--gold)">${fmt(v.montant_total||0)} F</td>
        <td class="num" style="color:var(--green)">${fmt(v.montant_paye||0)} F</td>
        <td><span class="badge ${v.statut_paiement==='paye'?'bdg-g':v.statut_paiement==='partiel'?'bdg-gold':'bdg-r'}" style="font-size:9px">${v.statut_paiement==='paye'?'✅ Payée':v.statut_paiement==='partiel'?'⚠ Partiel':'❌ Impayée'}</span></td>
      </tr>`).join('')}
      <tr style="font-weight:700;background:rgba(22,163,74,.1)"><td colspan="2">TOTAL — ${V.length} ventes</td><td class="num" style="color:var(--gold)">${fmt(caTotal)} F</td><td class="num" style="color:var(--green)">${fmt(cashEncaisse)} F</td><td></td></tr>
    </tbody></table>`
    : '<div style="color:var(--textm);font-size:12px">Aucune vente ce jour.</div>';

  // ── Dépenses du jour ──
  document.getElementById('bj-depenses').innerHTML=D.length
    ? `<table class="tbl" style="font-size:11px"><thead><tr><th>Catégorie</th><th>Description</th><th class="num">Montant</th></tr></thead><tbody>
      ${D.map(d=>`<tr><td style="font-weight:600;font-size:11px">${d.categorie||'—'}</td><td style="font-size:10px">${d.description||''}</td><td class="num" style="color:var(--red)">${fmt(d.montant||0)} F</td></tr>`).join('')}
      <tr style="font-weight:700;background:rgba(239,68,68,.1)"><td colspan="2">TOTAL — ${D.length} dépenses</td><td class="num" style="color:var(--red)">${fmt(totDepenses)} F</td></tr>
    </tbody></table>`
    : '<div style="color:var(--textm);font-size:12px">Aucune dépense ce jour.</div>';

  // ── Réconciliation : attendu = SOLDE CUMULÉ de la caisse ──
  const cashAttendu = caisse ? soldeCaisseCumul(caisse, MALL, date) : 0;
  window._bj_cashAttendu=cashAttendu;
  window._bj_cloture={date, pdv:pdvSel, caisseId:selectedId, caisseNom:caisse?.nom||'', attendu:cashAttendu};

  const sansCaisse = !caisse;
  document.getElementById('bj-bilan').innerHTML=`
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;margin-bottom:14px">
      <div style="background:rgba(22,163,74,.08);border:1px solid rgba(22,163,74,.3);border-radius:10px;padding:12px">
        <div style="font-size:10px;color:var(--textm);text-transform:uppercase;letter-spacing:1px;margin-bottom:4px">Entrées caisse (jour)</div>
        <div style="font-size:18px;font-weight:800;color:var(--green)">+${fmt(entreesCaisse)} F</div>
      </div>
      <div style="background:rgba(239,68,68,.08);border:1px solid rgba(239,68,68,.3);border-radius:10px;padding:12px">
        <div style="font-size:10px;color:var(--textm);text-transform:uppercase;letter-spacing:1px;margin-bottom:4px">Sorties caisse (jour)</div>
        <div style="font-size:18px;font-weight:800;color:var(--red)">−${fmt(sortiesCaisse)} F</div>
      </div>
      <div style="background:rgba(232,197,71,.12);border:2px solid var(--gold);border-radius:10px;padding:12px">
        <div style="font-size:10px;color:var(--textm);text-transform:uppercase;letter-spacing:1px;margin-bottom:4px">Solde du jour</div>
        <div style="font-size:18px;font-weight:800;color:${balanceJour>=0?'var(--gold)':'var(--red)'}">${balanceJour>=0?'+':''}${fmt(balanceJour)} F</div>
      </div>
    </div>

    <div style="background:rgba(34,197,94,.05);border-left:4px solid var(--green);border-radius:8px;padding:12px;margin-bottom:14px">
      <div style="display:flex;justify-content:space-between;align-items:center">
        <div><div style="font-size:11px;color:var(--textm);text-transform:uppercase;letter-spacing:1px">Marge brute du jour</div>
        <div style="font-size:9px;color:var(--textm);margin-top:2px">CA ${fmt(caTotal)} − Dépenses ${fmt(totDepenses)}</div></div>
        <div style="font-size:22px;font-weight:800;color:${margeBrute>=0?'var(--green)':'var(--red)'}">${margeBrute>=0?'+':''}${fmt(margeBrute)} F</div>
      </div>
    </div>

    <!-- CLÔTURE DE CAISSE -->
    <div style="background:var(--card2);border:2px solid var(--gold);border-radius:12px;padding:16px">
      <div style="font-size:13px;font-weight:700;color:var(--gold);margin-bottom:4px">🧮 Clôture de caisse — ${caisse?caisse.nom:'(aucune caisse)'} · ${pdvSel}</div>
      <div style="font-size:10px;color:var(--textm);margin-bottom:10px">Compte tout le cash présent dans le tiroir, puis valide. L'écart est enregistré.</div>
      ${sansCaisse?'<div style="color:var(--red);font-size:12px">Aucune caisse physique pour ce point de vente.</div>':`
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;align-items:end">
        <div><label style="font-size:11px;color:var(--textm);display:block;margin-bottom:4px">Solde théorique (tiroir)</label>
          <div style="font-size:18px;font-weight:700;color:var(--g6);padding:8px 10px;background:rgba(0,0,0,.15);border-radius:8px">${fmt(cashAttendu)} F</div></div>
        <div><label style="font-size:11px;color:var(--textm);display:block;margin-bottom:4px">💵 Cash compté (F)</label>
          <input type="number" id="bj-cash-compte" placeholder="0" oninput="bjCalcEcart()" style="font-size:18px;font-weight:700;padding:8px 10px;width:100%;border:2px solid var(--gold);border-radius:8px;background:rgba(232,197,71,.05);color:var(--gold)"></div>
        <div><label style="font-size:11px;color:var(--textm);display:block;margin-bottom:4px">Écart</label>
          <div id="bj-ecart" style="font-size:18px;font-weight:700;padding:8px 10px;border-radius:8px;text-align:center;background:rgba(255,255,255,.05);color:var(--textm)">—</div></div>
      </div>
      <input type="text" id="bj-cloture-note" placeholder="Note (optionnel, ex: explication de l'écart)" style="width:100%;margin-top:10px;font-size:12px">
      <button class="btn btn-g" style="width:100%;justify-content:center;margin-top:10px" onclick="saveCloture()">✅ Valider la clôture du jour</button>
      `}
    </div>

    ${Mday.length?`<div class="card-title" style="font-size:12px;color:var(--textm);margin-top:14px">📋 Mouvements de caisse du jour</div>
    <table class="tbl" style="font-size:10px"><thead><tr><th>Heure</th><th>Type</th><th>Catégorie</th><th>Description</th><th class="num">Montant</th></tr></thead><tbody>
      ${Mday.map(m=>`<tr><td style="font-family:'DM Mono',monospace">${(m.created_at||'').slice(11,16)}</td>
        <td><span class="badge ${m.type==='entree'?'bdg-g':m.type==='sortie'?'bdg-r':'bdg-b'}" style="font-size:8px">${m.type}</span></td>
        <td>${m.categorie||'—'}</td><td style="font-size:10px">${m.description||''}</td>
        <td class="num" style="color:${m.type==='entree'?'var(--green)':'var(--red)'}">${fmt(m.montant||0)} F</td></tr>`).join('')}
    </tbody></table>`:''}
  `;

  // Si déjà clôturée ce jour, pré-remplir
  const{data:dejaC}=await SB.from('gp_clotures').select('*').eq('admin_id',GP_ADMIN_ID).eq('date',date).eq('caisse_id',selectedId).maybeSingle();
  if(dejaC){
    const inp=document.getElementById('bj-cash-compte'); if(inp){inp.value=dejaC.cash_compte; bjCalcEcart();}
    const noteEl=document.getElementById('bj-cloture-note'); if(noteEl&&dejaC.note)noteEl.value=dejaC.note;
  }

  renderClotures();
}

// Calcule l'écart cash compté − attendu cumulé
function bjCalcEcart(){
  const compte=+document.getElementById('bj-cash-compte')?.value||0;
  const attendu=+window._bj_cashAttendu||0;
  const ecart=compte-attendu;
  const el=document.getElementById('bj-ecart');
  if(!el)return;
  if(!document.getElementById('bj-cash-compte')?.value){ el.textContent='—'; el.style.color='var(--textm)'; el.style.background='rgba(255,255,255,.05)'; return; }
  if(Math.abs(ecart)<1){ el.innerHTML='✅ OK'; el.style.color='var(--green)'; el.style.background='rgba(22,163,74,.15)'; }
  else if(ecart>0){ el.innerHTML=`+${fmt(ecart)} F`; el.style.color='var(--gold)'; el.style.background='rgba(232,197,71,.15)'; }
  else { el.innerHTML=`${fmt(ecart)} F`; el.style.color='var(--red)'; el.style.background='rgba(239,68,68,.15)'; }
}

// Enregistre (ou met à jour) la clôture du jour pour la caisse sélectionnée
async function saveCloture(){
  const info=window._bj_cloture||{};
  if(!info.caisseId){ notify('Aucune caisse sélectionnée','r'); return; }
  const inp=document.getElementById('bj-cash-compte');
  if(!inp||inp.value===''){ notify('Entre le cash compté','r'); return; }
  const compte=+inp.value||0;
  const ecart=compte-Number(info.attendu||0);
  const note=document.getElementById('bj-cloture-note')?.value.trim()||null;
  const payload={
    admin_id:GP_ADMIN_ID, date:info.date, point_vente:info.pdv,
    caisse_id:info.caisseId, caisse_nom:info.caisseNom,
    cash_attendu:info.attendu, cash_compte:compte, ecart, note,
    valide_par:GP_USER?.id, valide_par_nom:GP_USER?.email?.split('@')[0]
  };
  const{data:exist}=await SB.from('gp_clotures').select('id').eq('admin_id',GP_ADMIN_ID).eq('date',info.date).eq('caisse_id',info.caisseId).maybeSingle();
  let error;
  if(exist){ ({error}=await SB.from('gp_clotures').update(payload).eq('id',exist.id)); }
  else { ({error}=await SB.from('gp_clotures').insert(payload)); }
  if(error){ notify('Erreur: '+error.message,'r'); return; }
  notify(`Clôture enregistrée ✓${Math.abs(ecart)>=1?` · écart ${fmt(ecart)} F`:' · caisse juste'}`,'gold');
  renderClotures();
}

// Historique des clôtures (RLS : secrétaire = les siennes ; admin = toutes → vue des écarts)
async function renderClotures(){
  if(typeof renderEcartsCaisse==='function') renderEcartsCaisse(); // synthèse des écarts par PDV
  const el=document.getElementById('bj-clotures');
  if(!el)return;
  const{data}=await SB.from('gp_clotures').select('*').eq('admin_id',GP_ADMIN_ID).order('date',{ascending:false}).limit(40);
  const C=data||[];
  if(!C.length){ el.innerHTML='<div style="color:var(--textm);font-size:12px">Aucune clôture enregistrée.</div>'; return; }
  el.innerHTML=`<div style="overflow-x:auto"><table class="tbl" style="font-size:11px">
    <thead><tr><th>Date</th>${GP_ROLE==='admin'?'<th>Point de vente</th>':''}<th class="num">Théorique</th><th class="num">Compté</th><th class="num">Écart</th><th>Par</th></tr></thead>
    <tbody>${C.map(c=>{
      const e=Number(c.ecart||0); const ok=Math.abs(e)<1;
      return `<tr>
        <td style="font-size:10px">${c.date}</td>
        ${GP_ROLE==='admin'?`<td>${typeof pvBadgeHtml==='function'?pvBadgeHtml(c.point_vente||'Production'):(c.point_vente||'—')}</td>`:''}
        <td class="num" style="color:var(--g6)">${fmt(c.cash_attendu)} F</td>
        <td class="num">${fmt(c.cash_compte)} F</td>
        <td class="num" style="font-weight:700;color:${ok?'var(--green)':(e>0?'var(--gold)':'var(--red)')}">${ok?'✅ 0':(e>0?'+'+fmt(e):fmt(e))}</td>
        <td style="font-size:10px;color:var(--textm)">${c.valide_par_nom||'—'}</td>
      </tr>`;
    }).join('')}</tbody></table></div>`;
}

// Synthèse des écarts de clôture par PDV (cumul, manquants/excédents, dernier, statut)
async function renderEcartsCaisse(){
  const el=document.getElementById('bj-ecarts-synthese');
  if(!el) return;
  const{data}=await SB.from('gp_clotures').select('point_vente,date,ecart')
    .eq('admin_id',GP_ADMIN_ID).order('date',{ascending:false}).limit(1000);
  const C=data||[];
  if(!C.length){ el.innerHTML='<div style="color:var(--textm);font-size:12px">Aucune clôture pour le moment — les écarts apparaîtront ici dès que des caisses seront clôturées.</div>'; return; }
  const byPDV={};
  C.forEach(c=>{const k=c.point_vente||'Production'; if(!byPDV[k])byPDV[k]={nb:0,total:0,manq:0,exc:0,dernier:0,dDate:null}; const o=byPDV[k]; const e=Number(c.ecart||0); o.nb++; o.total+=e; if(e<-0.5)o.manq++; else if(e>0.5)o.exc++; if(!o.dDate||c.date>o.dDate){o.dDate=c.date;o.dernier=e;}});
  const rows=Object.entries(byPDV).sort((a,b)=>a[1].total-b[1].total); // pires (manquants) en premier
  const badge=(n)=>(typeof pvBadgeHtml==='function')?pvBadgeHtml(n):('📍 '+n);
  el.innerHTML=`<div style="overflow-x:auto"><table class="tbl" style="font-size:11px">
    <thead><tr><th>Point de vente</th><th class="num">Clôtures</th><th class="num">Écart cumulé</th><th class="num">Manquants</th><th class="num">Excédents</th><th class="num">Dernier écart</th><th>Statut</th></tr></thead>
    <tbody>${rows.map(([nom,o])=>{
      const st = (o.total<-1000 || o.manq>=3) ? '🔴 À surveiller' : ((Math.abs(o.total)<1 && o.manq===0) ? '🟢 Sain' : '🟡 Écarts');
      return `<tr>
        <td>${badge(nom)}</td>
        <td class="num">${o.nb}</td>
        <td class="num" style="font-weight:700;color:${o.total<-0.5?'var(--red)':o.total>0.5?'var(--gold)':'var(--green)'}">${o.total>0?'+'+fmt(o.total):fmt(o.total)} F</td>
        <td class="num" style="color:var(--red)">${o.manq}</td>
        <td class="num" style="color:var(--gold)">${o.exc}</td>
        <td class="num" style="color:${o.dernier<-0.5?'var(--red)':o.dernier>0.5?'var(--gold)':'var(--green)'}">${o.dernier>0?'+'+fmt(o.dernier):fmt(o.dernier)} <span style="font-size:9px;color:var(--textm)">(${o.dDate||''})</span></td>
        <td style="font-size:10px">${st}</td>
      </tr>`;
    }).join('')}</tbody></table></div>
    <div style="font-size:10px;color:var(--textm);margin-top:6px">Écart cumulé négatif = manques récurrents (à investiguer). Liste triée des plus problématiques aux plus saines.</div>`;
}
