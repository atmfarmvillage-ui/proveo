// ══════════════════════════════════════════════════
// PROVENDA — MODULE DETTES SECRÉTAIRES
// ══════════════════════════════════════════════════

async function renderDettes(){
  const{data:dettes}=await SB.from('gp_dettes_secretaires').select('*,gp_membres(*)')
    .eq('admin_id',GP_ADMIN_ID).order('created_at',{ascending:false});
  const D=dettes||[];

  const totalDu=D.reduce((s,d)=>s+Number(d.montant_du||0),0);
  const totalPaye=D.reduce((s,d)=>s+Number(d.montant_paye||0),0);
  const totalReste=totalDu-totalPaye;
  const enCours=D.filter(d=>d.statut!=='rembourse').length;

  document.getElementById('dettes-kpis').innerHTML=`
    <div class="econo-box"><div class="econo-val">${enCours}</div><div class="econo-lbl">Dettes en cours</div></div>
    <div class="econo-box"><div class="econo-val" style="color:var(--red)">${fmt(totalDu)}</div><div class="econo-lbl">Total dettes (F)</div></div>
    <div class="econo-box"><div class="econo-val" style="color:var(--green)">${fmt(totalPaye)}</div><div class="econo-lbl">Total remboursé (F)</div></div>
    <div class="econo-box"><div class="econo-val" style="color:${totalReste>0?'var(--red)':'var(--green)'}">${fmt(totalReste)}</div><div class="econo-lbl">Reste à payer (F)</div></div>`;

  // Remplir select membres
  const{data:membres}=await SB.from('gp_membres').select('id,nom,email')
    .eq('admin_id',GP_ADMIN_ID);
  const sel=document.getElementById('dette-membre-select');
  if(sel&&membres){
    sel.innerHTML='<option value="">— Sélectionner —</option>'+
      membres.map(m=>`<option value="${m.id}">${m.nom||m.email}</option>`).join('');
  }

  document.getElementById('dettes-liste').innerHTML=D.length?`<table class="tbl" style="font-size:11px">
      <thead><tr><th>Secrétaire</th><th class="num">Montant dû</th><th class="num">Remboursé</th><th class="num">Reste</th><th>Statut</th></tr></thead>
      <tbody>
      ${D.map(d=>{
        const reste=Number(d.montant_du||0)-Number(d.montant_paye||0);
        return `<tr>
          <td style="font-weight:600">${d.gp_membres?.nom||'—'}</td>
          <td class="num" style="color:var(--red)">${fmt(d.montant_du)} F</td>
          <td class="num" style="color:var(--green)">${fmt(d.montant_paye)} F</td>
          <td class="num" style="color:${reste>0?'var(--red)':'var(--green)'}">${reste>0?fmt(reste)+' F':'✓ Soldé'}</td>
          <td><span class="badge ${d.statut==='rembourse'?'bdg-g':d.statut==='partiel'?'bdg-gold':'bdg-r'}" style="font-size:9px">${d.statut}</span></td>
        </tr>`;}).join('')}
      </tbody>
    </table>`:'<div style="color:var(--textm);font-size:12px">Aucune dette enregistrée.</div>';
}

async function saveRemboursement(){
  const membreId=document.getElementById('dette-membre-select')?.value;
  const montant=+document.getElementById('dette-montant')?.value||0;
  const mode=document.getElementById('dette-mode')?.value||'especes';
  const note=document.getElementById('dette-note')?.value.trim()||null;
  const err=document.getElementById('dette-err');
  if(!membreId||!montant){err.textContent='Sélectionnez une secrétaire et entrez le montant.';return;}

  // Trouver la dette en cours pour ce membre
  const{data:dettes}=await SB.from('gp_dettes_secretaires').select('*')
    .eq('admin_id',GP_ADMIN_ID).eq('membre_id',membreId)
    .neq('statut','rembourse').order('created_at',{ascending:true});

  if(!dettes?.length){
    // Créer une nouvelle dette (remboursement sans dette préexistante)
    err.textContent='Aucune dette en cours pour ce membre.';return;
  }

  const dette=dettes[0];
  const nouveauPaye=Number(dette.montant_paye||0)+montant;
  const statut=nouveauPaye>=Number(dette.montant_du)?'rembourse':nouveauPaye>0?'partiel':'du';

  await SB.from('gp_dettes_secretaires').update({
    montant_paye:nouveauPaye,statut,
    note:note||dette.note
  }).eq('id',dette.id);

  err.textContent='';
  document.getElementById('dette-montant').value='';
  notify(`Remboursement de ${fmt(montant)} F enregistré ✓`,'gold');
  await renderDettes();
}
