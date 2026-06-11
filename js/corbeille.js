// ══════════════════════════════════════════════════
// PROVENDA — CORBEILLE DES VENTES
// Liste, restauration (re-applique impacts), purge définitive
// ══════════════════════════════════════════════════

async function renderCorbeille(){
  if(!GP_ADMIN_ID) return;
  const search = (document.getElementById('corb-search')?.value||'').trim().toLowerCase();
  const mois = document.getElementById('corb-mois')?.value || '';

  let q = SB.from('gp_ventes').select('*')
    .eq('admin_id', GP_ADMIN_ID)
    .not('deleted_at', 'is', null)
    .order('deleted_at', {ascending: false});
  if(mois){
    q = q.gte('deleted_at', mois+'-01T00:00:00').lte('deleted_at', mois+'-31T23:59:59');
  }
  const {data} = await q;
  let V = data||[];
  if(search){
    V = V.filter(v => (v.client_nom||'').toLowerCase().includes(search));
  }

  const totalMontant = V.reduce((s,v)=>s+Number(v.montant_total||0),0);
  const totalPaye = V.reduce((s,v)=>s+Number(v.montant_paye||0),0);

  document.getElementById('corb-kpis').innerHTML = `
    <div class="econo-box"><div class="econo-val">${V.length}</div><div class="econo-lbl">Ventes en corbeille</div></div>
    <div class="econo-box"><div class="econo-val" style="color:var(--gold)">${fmt(totalMontant)}</div><div class="econo-lbl">Montant total (F)</div></div>
    <div class="econo-box"><div class="econo-val" style="color:var(--green)">${fmt(totalPaye)}</div><div class="econo-lbl">Avait été encaissé (F)</div></div>
    <div class="econo-box"><div class="econo-val" style="color:var(--red)">${fmt(totalMontant-totalPaye)}</div><div class="econo-lbl">Impayés annulés (F)</div></div>`;

  const liste = document.getElementById('corb-liste');
  if(!V.length){
    liste.innerHTML = '<div style="color:var(--textm);font-size:12px;padding:20px;text-align:center">✨ Aucune vente en corbeille</div>';
    return;
  }

  liste.innerHTML = `<div style="overflow-x:auto"><table class="tbl" style="font-size:11px">
    <thead><tr>
      <th>Supprimée le</th><th>Par</th>
      <th>Client</th><th>Date vente</th>
      <th class="num">Montant</th><th class="num">Payé</th>
      <th>Statut</th><th></th>
    </tr></thead>
    <tbody>${V.map(v=>`<tr>
      <td style="font-family:'DM Mono',monospace;font-size:10px">${(v.deleted_at||'').slice(0,16).replace('T',' ')}</td>
      <td style="font-size:10px">${v.deleted_by_nom||'—'}</td>
      <td style="font-weight:600">${v.client_nom||'—'}</td>
      <td style="font-family:'DM Mono',monospace;font-size:10px">${v.date||'—'}</td>
      <td class="num" style="color:var(--gold)">${fmt(v.montant_total||0)} F</td>
      <td class="num" style="color:var(--green)">${fmt(v.montant_paye||0)} F</td>
      <td><span class="badge ${v.statut_paiement==='paye'?'bdg-g':v.statut_paiement==='partiel'?'bdg-gold':'bdg-r'}" style="font-size:9px">${v.statut_paiement||'—'}</span></td>
      <td style="display:flex;gap:4px;flex-wrap:nowrap">
        <button class="btn btn-g btn-sm" onclick="restaurerVente('${v.id}')" title="Restaurer + ré-appliquer impacts" style="padding:4px 7px">🔄</button>
        <button class="btn btn-red btn-sm" onclick="purgerVente('${v.id}')" title="Suppression DÉFINITIVE" style="padding:4px 7px">⛔</button>
      </td>
    </tr>`).join('')}</tbody>
  </table></div>`;
}

// ── RESTAURER : ré-applique les impacts (inverse de la soft-deletion)
async function restaurerVente(id){
  if(GP_ROLE !== 'admin' && !GP_EST_GERANT){ notify('Action réservée à l\'admin','r'); return; }
  const {data:vente} = await SB.from('gp_ventes').select('*').eq('id',id).maybeSingle();
  if(!vente){ notify('Vente introuvable','r'); return; }
  if(!vente.deleted_at){ notify('Cette vente n\'est pas en corbeille','r'); return; }

  const {data:lignes} = await SB.from('gp_ventes_lignes').select('*').eq('vente_id',id);
  const L = lignes||[];

  // Construire la liste des ré-applications à montrer
  const ops = [];
  for(const l of L){
    if(l.type_produit === 'formule'){
      ops.push(`−${fmt(l.quantite)} kg ${l.formule_nom} ← stock`);
    } else if(l.type_produit === 'mp'){
      ops.push(`−${fmt(l.quantite)} kg ${l.formule_nom} ← stock MP`);
    } else if(l.type_produit === 'veto'){
      ops.push(`−${fmt(l.quantite)} ${l.formule_nom} ← stock véto`);
    }
  }
  if(Number(vente.montant_paye)>0){
    ops.push(`+${fmt(vente.montant_paye)} F ← caisse (mouvement recréé)`);
  }

  const ok = await confirmRestoreModal(vente, ops);
  if(!ok) return;

  const pdvStock = vente.point_vente || 'Production';

  // 1. Re-décrémenter stock formules
  for(const l of L){
    if(l.type_produit === 'formule'){
      const {data:stk} = await SB.from('gp_stock_produits_pdv').select('id,qte_disponible')
        .eq('admin_id',GP_ADMIN_ID).eq('pdv_nom',pdvStock).eq('formule_nom',l.formule_nom).maybeSingle();
      if(stk){
        await SB.from('gp_stock_produits_pdv').update({
          qte_disponible: Math.max(0, Number(stk.qte_disponible||0) - Number(l.quantite||0)),
          updated_at: new Date().toISOString()
        }).eq('id', stk.id);
      }
    } else if(l.type_produit === 'veto'){
      if(typeof deduireStockVeto==='function' && l.veto_id){
        await deduireStockVeto(pdvStock, l.veto_id, l.quantite);
      }
    }
  }

  // 2. Recréer sorties stock MP
  const refVente = 'Vente '+id.slice(0,8);
  for(const l of L){
    if(l.type_produit === 'mp' && l.ingredient_id){
      await SB.from('gp_stock_mp').insert({
        admin_id: GP_ADMIN_ID, saisi_par: GP_USER?.id,
        type: 'sortie_vente', date: vente.date,
        ingredient_id: l.ingredient_id, ingredient_nom: l.formule_nom,
        quantite: l.quantite, prix_unit: l.prix_unitaire,
        ref: refVente
      });
    }
  }

  // 3. Re-créer le mouvement caisse (avec fallback PDV → siège → any)
  if(Number(vente.montant_paye)>0){
    let caisseId = null;
    if(vente.point_vente){
      const {data:c} = await SB.from('gp_caisses').select('id').eq('admin_id',GP_ADMIN_ID).eq('actif',true).eq('point_vente',vente.point_vente).maybeSingle();
      if(c) caisseId = c.id;
    }
    if(!caisseId){
      const {data:c} = await SB.from('gp_caisses').select('id').eq('admin_id',GP_ADMIN_ID).eq('actif',true).eq('type','physique').is('point_vente',null).maybeSingle();
      if(c) caisseId = c.id;
    }
    if(!caisseId){
      const {data:c} = await SB.from('gp_caisses').select('id').eq('admin_id',GP_ADMIN_ID).eq('actif',true).eq('type','physique').limit(1).maybeSingle();
      if(c) caisseId = c.id;
    }
    if(caisseId){
      await SB.from('gp_mouvements_caisse').insert({
        admin_id: GP_ADMIN_ID, caisse_id: caisseId,
        type: 'entree', categorie: 'vente',
        montant: vente.montant_paye, date_mouvement: vente.date,
        description: 'Vente '+id.slice(0,8)+' (restaurée)',
        vente_id: id,
        enregistre_par: GP_USER?.id,
        enregistre_par_nom: GP_USER?.email?.split('@')[0]||'admin'
      });
    }
  }

  // 4. Recréer les points fidélité (recalcul depuis les lignes)
  if(vente.client_id && typeof calcPointsVente === 'function'){
    const ptsGagnes = calcPointsVente(L);
    if(ptsGagnes > 0){
      const {data:c} = await SB.from('gp_clients').select('points_fidelite').eq('id',vente.client_id).maybeSingle();
      if(c){
        await SB.from('gp_clients').update({
          points_fidelite: Number(c.points_fidelite||0) + ptsGagnes
        }).eq('id', vente.client_id);
        await SB.from('gp_fidelite_mouvements').insert({
          admin_id: GP_ADMIN_ID, client_id: vente.client_id, vente_id: id,
          points: ptsGagnes, type: 'achat',
          description: `Achat (${ptsGagnes} pts) — restauré`
        });
      }
    }
  }

  // 5. Unset deleted_at
  await SB.from('gp_ventes').update({
    deleted_at: null, deleted_by: null, deleted_by_nom: null
  }).eq('id',id).eq('admin_id',GP_ADMIN_ID);

  // 6. Audit log
  try{
    await SB.from('gp_audit_log').insert({
      admin_id: GP_ADMIN_ID,
      table_name: 'gp_ventes',
      record_id: id,
      action: 'restore',
      performed_by: GP_USER?.id,
      performed_by_nom: GP_USER?.email?.split('@')[0]||'admin',
      details: { ops: ops, client: vente.client_nom, montant: vente.montant_total }
    });
  }catch(e){ console.warn('audit log', e); }

  await renderCorbeille();
  notify('Vente restaurée — impacts ré-appliqués ✓','gold');
}

// ── PURGER : suppression définitive (les impacts ont déjà été revertés)
async function purgerVente(id){
  if(GP_ROLE !== 'admin' && !GP_EST_GERANT){ notify('Action réservée à l\'admin','r'); return; }
  const {data:vente} = await SB.from('gp_ventes').select('*').eq('id',id).maybeSingle();
  if(!vente){ notify('Vente introuvable','r'); return; }
  if(!vente.deleted_at){ notify('Purge uniquement depuis la corbeille','r'); return; }

  const ok = await confirmPurgeModal(vente);
  if(!ok) return;

  // 1. Hard delete les lignes
  await SB.from('gp_ventes_lignes').delete().eq('vente_id', id);
  // 2. Hard delete la vente
  const {error} = await SB.from('gp_ventes').delete().eq('id', id).eq('admin_id', GP_ADMIN_ID);
  if(error){ notify('Erreur : '+error.message,'r'); return; }
  // 3. Audit
  try{
    await SB.from('gp_audit_log').insert({
      admin_id: GP_ADMIN_ID,
      table_name: 'gp_ventes',
      record_id: id,
      action: 'hard_delete',
      performed_by: GP_USER?.id,
      performed_by_nom: GP_USER?.email?.split('@')[0]||'admin',
      details: { client: vente.client_nom, montant: vente.montant_total, date_vente: vente.date }
    });
  }catch(e){ console.warn('audit log', e); }

  await renderCorbeille();
  notify('Vente purgée définitivement ✓','r');
}

// ── MODALS de confirmation ───────────────────────

function confirmRestoreModal(vente, ops){
  return new Promise(resolve=>{
    const old = document.getElementById('modal-restore-vente'); if(old) old.remove();
    const opsHtml = ops.length ? ops.map(o=>`• ${o}`).join('<br>') : 'Aucun impact à ré-appliquer.';
    const ov = document.createElement('div');
    ov.id = 'modal-restore-vente';
    ov.style.cssText = `position:fixed;inset:0;background:rgba(0,0,0,.8);backdrop-filter:blur(6px);z-index:9999;display:flex;align-items:center;justify-content:center;padding:16px`;
    ov.innerHTML = `
      <div style="background:var(--card2,#fff);border:2px solid var(--green);border-radius:16px;padding:24px;max-width:480px;width:100%;max-height:90vh;overflow-y:auto">
        <div style="font-size:18px;font-weight:800;color:var(--green);margin-bottom:8px">🔄 Restaurer la vente ?</div>
        <div style="font-size:13px;color:var(--text);margin-bottom:14px">
          Client : <b>${vente.client_nom||'—'}</b><br>
          Montant : <b>${fmt(vente.montant_total||0)} F</b> (payé ${fmt(vente.montant_paye||0)} F)<br>
          Date originale : ${vente.date||'—'}
        </div>
        <div style="background:rgba(22,163,74,.08);border:1px solid rgba(22,163,74,.3);border-radius:10px;padding:12px;margin-bottom:14px">
          <div style="font-weight:700;color:var(--green);margin-bottom:6px;font-size:12px">🔁 Ceci va RÉAPPLIQUER :</div>
          <div style="font-size:12px;color:var(--text);line-height:1.6">${opsHtml}</div>
        </div>
        <div style="font-size:11px;color:var(--textm);margin-bottom:14px;line-height:1.4">
          ℹ La vente redevient active. Les points fidélité du client sont recalculés.
        </div>
        <div style="display:flex;gap:8px">
          <button id="rvm-confirm" class="btn btn-g" style="flex:1;justify-content:center;font-weight:800">✓ Confirmer la restauration</button>
          <button id="rvm-cancel" class="btn btn-out" style="padding:0 18px">Annuler</button>
        </div>
      </div>`;
    document.body.appendChild(ov);
    document.getElementById('rvm-confirm').onclick = ()=>{ ov.remove(); resolve(true); };
    document.getElementById('rvm-cancel').onclick = ()=>{ ov.remove(); resolve(false); };
    ov.onclick = (e)=>{ if(e.target===ov){ ov.remove(); resolve(false); } };
  });
}

function confirmPurgeModal(vente){
  return new Promise(resolve=>{
    const old = document.getElementById('modal-purge-vente'); if(old) old.remove();
    const ov = document.createElement('div');
    ov.id = 'modal-purge-vente';
    ov.style.cssText = `position:fixed;inset:0;background:rgba(0,0,0,.85);backdrop-filter:blur(6px);z-index:9999;display:flex;align-items:center;justify-content:center;padding:16px`;
    ov.innerHTML = `
      <div style="background:var(--card2,#fff);border:3px solid var(--red);border-radius:16px;padding:24px;max-width:480px;width:100%">
        <div style="font-size:20px;font-weight:800;color:var(--red);margin-bottom:8px;text-align:center">⚠⚠⚠ SUPPRESSION DÉFINITIVE</div>
        <div style="font-size:13px;color:var(--text);margin-bottom:14px;line-height:1.5">
          Tu es sur le point de supprimer DÉFINITIVEMENT la vente :<br>
          Client : <b>${vente.client_nom||'—'}</b><br>
          Montant : <b>${fmt(vente.montant_total||0)} F</b><br>
          Date : ${vente.date||'—'}
        </div>
        <div style="background:rgba(239,68,68,.1);border:2px solid var(--red);border-radius:10px;padding:14px;margin-bottom:14px">
          <div style="font-size:12px;color:var(--text);line-height:1.5;font-weight:600">
            ⚠ Cette action est <u>IRRÉVERSIBLE</u>.<br>
            La vente sera effacée à jamais, impossible de la restaurer après.
          </div>
        </div>
        <div class="fr" style="margin-bottom:12px">
          <label style="font-size:11px;color:var(--text)">Pour confirmer, tape <b>PURGER</b> dans la case :</label>
          <input type="text" id="pvm-input" oninput="onPurgeInputChange()" placeholder="PURGER" style="font-size:14px;font-weight:700;text-align:center;border:2px solid var(--red)">
        </div>
        <div style="display:flex;gap:8px">
          <button id="pvm-confirm" class="btn btn-red" disabled style="flex:1;justify-content:center;font-weight:800;opacity:.4;cursor:not-allowed">⛔ Purger définitivement</button>
          <button id="pvm-cancel" class="btn btn-out" style="padding:0 18px">Annuler</button>
        </div>
      </div>`;
    document.body.appendChild(ov);
    window.onPurgeInputChange = ()=>{
      const val = document.getElementById('pvm-input').value;
      const btn = document.getElementById('pvm-confirm');
      const ok = val === 'PURGER';
      btn.disabled = !ok;
      btn.style.opacity = ok ? '1' : '.4';
      btn.style.cursor = ok ? 'pointer' : 'not-allowed';
    };
    document.getElementById('pvm-confirm').onclick = ()=>{ ov.remove(); resolve(true); };
    document.getElementById('pvm-cancel').onclick = ()=>{ ov.remove(); resolve(false); };
    ov.onclick = (e)=>{ if(e.target===ov){ ov.remove(); resolve(false); } };
  });
}
