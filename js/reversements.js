// ══════════════════════════════════════════════════
// PROVENDA — REVERSEMENTS DÉPÔT-VENTE
// ══════════════════════════════════════════════════

async function renderReversements(){
  // Charger PDV principaux
  const{data:pdvs}=await SB.from('gp_points_vente').select('*')
    .eq('admin_id',GP_ADMIN_ID)
    .in('type_pdv',['principal','production']).order('nom');
  const P=pdvs||[];

  // Remplir select PDV
  const sel=document.getElementById('rev_pdv');
  if(sel)sel.innerHTML='<option value="">— Sélectionner le PDV —</option>'+
    P.map(p=>`<option value="${p.id}" data-nom="${p.nom}">${p.nom}</option>`).join('');

  // Mois par défaut
  const revMois=document.getElementById('rev_mois');
  if(revMois&&!revMois.value)revMois.value=thisMonth();

  // Charger reversements
  const{data:revs}=await SB.from('gp_reversements_depot').select('*')
    .eq('admin_id',GP_ADMIN_ID)
    .order('created_at',{ascending:false}).limit(50);
  const R=revs||[];

  // KPIs
  const totalMois=R.filter(r=>r.mois===thisMonth()).reduce((s,r)=>s+Number(r.montant||0),0);
  const totalAnnuel=R.reduce((s,r)=>s+Number(r.montant||0),0);

  document.getElementById('rev-kpis').innerHTML=`
    <div class="econo-box"><div class="econo-val">${R.length}</div><div class="econo-lbl">Reversements total</div></div>
    <div class="econo-box"><div class="econo-val" style="color:var(--green)">${fmt(totalMois)}</div><div class="econo-lbl">Ce mois (F)</div></div>
    <div class="econo-box"><div class="econo-val" style="color:var(--gold)">${fmt(totalAnnuel)}</div><div class="econo-lbl">Total annuel (F)</div></div>
    <div class="econo-box"><div class="econo-val">${P.length}</div><div class="econo-lbl">PDV en dépôt-vente</div></div>`;

  document.getElementById('rev-liste').innerHTML=R.length?`<table class="tbl" style="font-size:11px">
      <thead><tr><th>PDV</th><th>Mois</th><th class="num">Montant</th><th>Mode</th><th>Note</th><th>Par</th></tr></thead>
      <tbody>
      ${R.map(r=>`<tr>
        <td style="font-weight:600">${r.pdv_nom||'—'}</td>
        <td style="font-size:10px">${r.mois||'—'}</td>
        <td class="num" style="color:var(--green)">${fmt(r.montant)} F</td>
        <td style="font-size:10px">${r.mode||'—'}</td>
        <td style="font-size:10px;color:var(--textm)">${r.note||'—'}</td>
        <td style="font-size:10px;color:var(--textm)">${r.enregistre_par_nom||'—'}</td>
      </tr>`).join('')}
      </tbody>
    </table>`:'<div style="color:var(--textm);font-size:12px">Aucun reversement enregistré.</div>';
}

async function saveReversement(){
  const pdvId=document.getElementById('rev_pdv')?.value;
  const pdvNom=document.getElementById('rev_pdv')?.options[document.getElementById('rev_pdv').selectedIndex]?.dataset.nom;
  const mois=document.getElementById('rev_mois')?.value||thisMonth();
  const montant=+document.getElementById('rev_montant')?.value||0;
  const mode=document.getElementById('rev_mode')?.value||'especes';
  const note=document.getElementById('rev_note')?.value.trim()||null;
  const err=document.getElementById('rev_err');

  if(!pdvId||!montant){err.textContent='Sélectionnez un PDV et entrez le montant.';return;}

  const{error}=await SB.from('gp_reversements_depot').insert({
    admin_id:GP_ADMIN_ID,
    pdv_id:pdvId,pdv_nom:pdvNom,
    mois,montant,mode,note,
    date_reversement:today(),
    enregistre_par:GP_USER.id,
    enregistre_par_nom:GP_USER.email?.split('@')[0]||'—'
  });

  if(error){err.textContent='Erreur: '+error.message;return;}

  // Mouvement caisse automatique — entrée dans caisse Production
  const{data:caisses}=await SB.from('gp_caisses').select('id')
    .eq('admin_id',GP_ADMIN_ID).eq('type','physique').limit(1);
  if(caisses?.length){
    await SB.from('gp_mouvements_caisse').insert({
      admin_id:GP_ADMIN_ID,caisse_id:caisses[0].id,
      type:'entree',categorie:'reversement_depot',
      montant,date_mouvement:today(),
      description:`Reversement ${pdvNom} — ${mois}`,
      enregistre_par:GP_USER.id,
      enregistre_par_nom:GP_USER.email?.split('@')[0]
    });
  }

  err.textContent='';
  document.getElementById('rev_montant').value='';
  document.getElementById('rev_note').value='';
  notify(`Reversement de ${fmt(montant)} F enregistré ✓`,'gold');
  renderReversements();
}
