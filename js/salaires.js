// ══════════════════════════════════════════════════
// PROVENDA — MODULE SALAIRES
// ══════════════════════════════════════════════════

async function renderSalaires(){
  const mois=document.getElementById('sal-mois')?.value||thisMonth();
  const{data}=await SB.from('gp_salaires').select('*')
    .eq('admin_id',GP_ADMIN_ID).order('mois',{ascending:false}).order('nom_prenom');
  const S=data||[];
  const duMois=S.filter(s=>s.mois===mois);
  const totalMois=duMois.reduce((s,x)=>s+Number(x.montant||0),0);
  const totalAnnuel=S.reduce((s,x)=>s+Number(x.montant||0),0);

  document.getElementById('sal-kpis').innerHTML=`
    <div class="econo-box"><div class="econo-val">${duMois.length}</div><div class="econo-lbl">Salariés ce mois</div></div>
    <div class="econo-box"><div class="econo-val" style="color:var(--gold)">${fmt(totalMois)}</div><div class="econo-lbl">Masse salariale mois (F)</div></div>
    <div class="econo-box"><div class="econo-val" style="color:var(--textm)">${fmt(totalAnnuel)}</div><div class="econo-lbl">Total annuel (F)</div></div>
    <div class="econo-box"><div class="econo-val">${[...new Set(S.map(s=>s.nom_prenom))].length}</div><div class="econo-lbl">Employés actifs</div></div>`;

  document.getElementById('sal-liste').innerHTML=duMois.length?`<table class="tbl" style="font-size:11px">
      <thead><tr><th>Nom & Prénom</th><th>Matricule</th><th>Mois</th><th class="num">Montant</th><th>Mode</th><th></th></tr></thead>
      <tbody>
      ${duMois.map(s=>`<tr>
        <td style="font-weight:700">${s.nom_prenom}</td>
        <td style="font-size:10px;color:var(--textm)">${s.matricule||'—'}</td>
        <td style="font-size:10px">${s.mois}</td>
        <td class="num" style="color:var(--gold)">${fmt(s.montant)} F</td>
        <td style="font-size:10px">${s.mode||'especes'}</td>
        <td><button class="btn btn-red btn-sm" onclick="deleteSalaire('${s.id}')">✕</button></td>
      </tr>`).join('')}
      <tr style="font-weight:700;background:rgba(22,163,74,.05)">
        <td colspan="3">TOTAL</td>
        <td class="num" style="color:var(--gold)">${fmt(totalMois)} F</td>
        <td colspan="2"></td>
      </tr>
      </tbody>
    </table>`:'<div style="color:var(--textm);font-size:12px">Aucun salaire pour ce mois.</div>';
}

async function saveSalaire(){
  const nom=document.getElementById('sal_nom')?.value.trim();
  const mat=document.getElementById('sal_matricule')?.value.trim()||null;
  const mois=document.getElementById('sal_mois_saisie')?.value||thisMonth();
  const montant=+document.getElementById('sal_montant')?.value||0;
  const mode=document.getElementById('sal_mode')?.value||'especes';
  const err=document.getElementById('sal_err');
  if(!nom||!montant){err.textContent='Nom et montant requis.';return;}

  const{error}=await SB.from('gp_salaires').insert({
    admin_id:GP_ADMIN_ID,nom_prenom:nom,matricule:mat,
    mois,montant,mode,date_paiement:today()
  });
  if(error){err.textContent='Erreur: '+error.message;return;}

  // Mouvement caisse automatique
  const{data:caisses}=await SB.from('gp_caisses').select('id')
    .eq('admin_id',GP_ADMIN_ID).eq('type','physique').limit(1);
  if(caisses?.length){
    await SB.from('gp_mouvements_caisse').insert({
      admin_id:GP_ADMIN_ID,caisse_id:caisses[0].id,
      type:'sortie',categorie:'salaire',montant,
      date_mouvement:today(),
      description:`Salaire ${nom} — ${mois}`,
      enregistre_par:GP_USER.id,
      enregistre_par_nom:GP_USER.email?.split('@')[0]
    });
  }

  err.textContent='';
  ['sal_nom','sal_matricule','sal_montant'].forEach(id=>{
    const el=document.getElementById(id);if(el)el.value='';
  });
  notify(`Salaire ${nom} enregistré ✓`,'gold');
  await renderSalaires();
}

async function deleteSalaire(id){
  if(!confirm('Supprimer ce salaire ?'))return;
  await SB.from('gp_salaires').delete().eq('id',id);
  await renderSalaires();
  notify('Salaire supprimé','r');
}
