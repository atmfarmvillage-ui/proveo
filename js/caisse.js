// ══════════════════════════════════════════════════
// PROVENDA — MODULE CAISSE
// Caisse physique + Banques + Transferts
// ══════════════════════════════════════════════════

// ── CHARGER LES CAISSES ───────────────────────────
async function renderCaisse(){
  const{data:C}=await SB.from('gp_caisses').select('*')
    .eq('admin_id',GP_ADMIN_ID).eq('actif',true).order('type').order('nom');
  const caisses=C||[];

  // Calculer soldes actuels depuis les mouvements
  const{data:mvts}=await SB.from('gp_mouvements_caisse').select('*')
    .eq('admin_id',GP_ADMIN_ID);
  const M=mvts||[];

  const soldes={};
  caisses.forEach(c=>{soldes[c.id]=Number(c.solde_initial||0);});
  M.forEach(m=>{
    if(m.type==='entree'&&soldes[m.caisse_id]!==undefined) soldes[m.caisse_id]+=Number(m.montant||0);
    if(m.type==='sortie'&&soldes[m.caisse_id]!==undefined) soldes[m.caisse_id]-=Number(m.montant||0);
    if(m.type==='transfert'){
      if(soldes[m.caisse_id]!==undefined) soldes[m.caisse_id]-=Number(m.montant||0);
      if(m.caisse_dest_id&&soldes[m.caisse_dest_id]!==undefined) soldes[m.caisse_dest_id]+=Number(m.montant||0);
    }
  });

  const totalGeneral=Object.values(soldes).reduce((s,v)=>s+v,0);
  const physique=caisses.filter(c=>c.type==='physique').reduce((s,c)=>s+(soldes[c.id]||0),0);
  const banque=caisses.filter(c=>c.type==='banque').reduce((s,c)=>s+(soldes[c.id]||0),0);

  document.getElementById('caisse-kpis').innerHTML=`
    <div class="econo-box"><div class="econo-val" style="color:var(--gold)">${fmt(totalGeneral)}</div><div class="econo-lbl">Total général (F)</div></div>
    <div class="econo-box"><div class="econo-val" style="color:var(--green)">${fmt(physique)}</div><div class="econo-lbl">Caisse physique (F)</div></div>
    <div class="econo-box"><div class="econo-val" style="color:var(--g6)">${fmt(banque)}</div><div class="econo-lbl">En banque (F)</div></div>
    <div class="econo-box"><div class="econo-val">${caisses.length}</div><div class="econo-lbl">Comptes actifs</div></div>`;

  // Cartes des caisses
  document.getElementById('caisses-cartes').innerHTML=caisses.map(c=>{
    const solde=soldes[c.id]||0;
    const couleur=c.couleur||'#16A34A';
    return `<div style="background:rgba(14,20,40,.8);border:1px solid rgba(30,45,74,.8);border-left:4px solid ${couleur};border-radius:12px;padding:18px">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:12px">
        <div>
          <div style="font-size:11px;color:var(--textm);text-transform:uppercase;letter-spacing:1px">${c.type==='banque'?'🏦 Banque':'💵 Caisse physique'}</div>
          <div style="font-weight:700;font-size:15px;margin-top:2px">${c.nom}</div>
        </div>
        <div style="text-align:right">
          <div style="font-family:'DM Mono',monospace;font-size:22px;font-weight:700;color:${solde>=0?couleur:'var(--red)'}">${fmt(solde)}</div>
          <div style="font-size:10px;color:var(--textm)">FCFA</div>
        </div>
      </div>
      <div style="display:flex;gap:6px;flex-wrap:wrap">
        <button class="btn btn-g btn-sm" onclick="ouvrirTransfert('${c.id}','${c.nom}')">⇄ Transfert</button>
        <button class="btn btn-out btn-sm" onclick="voirHistoriqueCaisse('${c.id}','${c.nom}')">📋 Historique</button>
        ${GP_ROLE==='admin'?`<button class="btn btn-out btn-sm" style="border-color:var(--gold);color:var(--gold)" onclick="ouvrirCorrectionEcart('${c.id}','${c.nom}')">⚠ Correction</button>`:''}
        ${GP_ROLE==='admin'?`<button class="btn btn-red btn-sm" onclick="supprimerCaisse('${c.id}')">✕</button>`:''}
      </div>
    </div>`;
  }).join('');

  // Remplir les selects de transfert
  populateCaisseSelects(caisses,soldes);

  // Remplir les selects de transfert (après rendu)
  // Mouvements récents
  const recents=M.sort((a,b)=>new Date(b.created_at)-new Date(a.created_at)).slice(0,20);
  const caisseMap={};
  caisses.forEach(c=>caisseMap[c.id]=c.nom);
  document.getElementById('mouvements-caisse-liste').innerHTML=recents.length?`
    <div style="overflow-x:auto"><table class="tbl" style="font-size:11px">
      <thead><tr><th>Date</th><th>Caisse</th><th>Type</th><th>Catégorie</th><th class="num">Montant</th><th>Par</th></tr></thead>
      <tbody>${recents.map(m=>`<tr>
        <td style="font-size:10px">${m.date_mouvement}</td>
        <td>${caisseMap[m.caisse_id]||'—'}${m.caisse_dest_id?` → ${caisseMap[m.caisse_dest_id]||'—'}`:''}</td>
        <td><span class="badge ${m.type==='entree'?'bdg-g':m.type==='sortie'?'bdg-r':'bdg-b'}" style="font-size:9px">${m.type}</span></td>
        <td style="font-size:10px;color:var(--textm)">${m.categorie||'—'}</td>
        <td class="num" style="color:${m.type==='entree'?'var(--green)':'var(--red)'}">${m.type==='entree'?'+':'−'}${fmt(m.montant)}</td>
        <td style="font-size:10px;color:var(--textm)">${m.enregistre_par_nom||'—'}</td>
      </tr>`).join('')}</tbody>
    </table></div>`:'<div style="color:var(--textm);font-size:12px">Aucun mouvement.</div>';
}

function populateCaisseSelects(caisses,soldes){
  ['mvt-caisse','transfert-source','transfert-dest'].forEach(id=>{
    const el=document.getElementById(id);
    if(!el)return;
    const cur=el.value; // Garder la sélection actuelle
    el.innerHTML='<option value="">— Sélectionner —</option>'+
      caisses.map(c=>`<option value="${c.id}" ${c.id===cur?'selected':''}>${c.type==='banque'?'🏦':'💵'} ${c.nom} (${fmt(soldes[c.id]||0)} F)</option>`).join('');
  });
}

// ── CRÉER UNE CAISSE ──────────────────────────────
// ── CAISSES ARCHIVÉES ────────────────────────────
async function renderCaissesArchivees(){
  if(GP_ROLE!=='admin'){return;}
  const{data}=await SB.from('gp_caisses').select('*')
    .eq('admin_id',GP_ADMIN_ID).eq('actif',false).order('nom');
  const arch=data||[];
  const container=document.getElementById('caisses-archivees');
  if(!container)return;
  if(!arch.length){
    container.innerHTML='<div style="color:var(--textm);font-size:12px">Aucune caisse archivée.</div>';
    return;
  }
  container.innerHTML=arch.map(c=>`
    <div style="display:flex;justify-content:space-between;align-items:center;padding:10px;background:rgba(14,20,40,.5);border:1px solid var(--border);border-radius:8px;margin-bottom:6px;opacity:.7">
      <div>
        <span style="font-weight:600">${c.type==='banque'?'🏦':'💵'} ${c.nom}</span>
        ${c.point_vente?`<span style="font-size:10px;color:var(--textm);margin-left:8px">📍 ${c.point_vente}</span>`:''}
      </div>
      <button class="btn btn-g btn-sm" onclick="reactiverCaisse('${c.id}')">🔄 Réactiver</button>
    </div>`).join('');
}

async function reactiverCaisse(id){
  await SB.from('gp_caisses').update({actif:true}).eq('id',id);
  renderCaisse();
  notify('Caisse réactivée ✓','gold');
}

// ── CORRECTION D'ÉCART ───────────────────────────
function ouvrirCorrectionEcart(caisseId,nom){
  const montant=prompt(`Correction d'écart — ${nom}

Entrez le montant (positif = excédent, négatif = manque) :`);
  if(montant===null)return;
  const val=parseFloat(montant);
  if(isNaN(val)){notify('Montant invalide','r');return;}
  const note=prompt('Note justificative obligatoire :');
  if(!note?.trim()){notify('Note obligatoire','r');return;}
  const type=val>=0?'entree':'sortie';
  SB.from('gp_mouvements_caisse').insert({
    admin_id:GP_ADMIN_ID,caisse_id:caisseId,
    type,montant:Math.abs(val),
    categorie:'correction_ecart',
    description:'⚠ Correction écart: '+note,
    date_mouvement:today(),
    enregistre_par:GP_USER.id,
    enregistre_par_nom:GP_USER.email?.split('@')[0]
  }).then(()=>{
    renderCaisse();
    notify('Correction enregistrée ✓','gold');
  });
}

// ── TRANSFERT AVEC VALIDATION ─────────────────────
async function saveTransfertAvecValidation(){
  const source=document.getElementById('transfert-source')?.value;
  const dest=document.getElementById('transfert-dest')?.value;
  const montant=+document.getElementById('transfert-montant')?.value||0;
  const desc=document.getElementById('transfert-desc')?.value.trim()||null;
  const err=document.getElementById('transfert-err');
  if(!source||!dest){err.textContent='Sélectionnez les deux caisses.';return;}
  if(source===dest){err.textContent='Source et destination doivent être différentes.';return;}
  if(!montant){err.textContent='Montant requis.';return;}

  // Admin/DAF → transfert direct
  // Secrétaire → transfert en attente de validation
  const statut=GP_ROLE==='admin'||GP_ROLE==='daf'?'valide':'en_attente';

  await SB.from('gp_mouvements_caisse').insert({
    admin_id:GP_ADMIN_ID,caisse_id:source,caisse_dest_id:dest,
    type:'transfert',montant,description:desc,
    statut_transfert:statut,
    date_mouvement:today(),
    enregistre_par:GP_USER.id,
    enregistre_par_nom:GP_USER.email?.split('@')[0]
  });

  err.textContent='';
  document.getElementById('modal-transfert').style.display='none';
  document.getElementById('transfert-montant').value='';
  document.getElementById('transfert-desc').value='';

  if(statut==='en_attente'){
    notify('Transfert soumis — en attente de validation admin ✓','gold');
  } else {
    notify('Transfert effectué ✓','gold');
  }
  renderCaisse();
}

async function saveCaisse(){
  if(GP_ROLE!=='admin'){notify('Seul l\'admin peut créer des caisses','r');return;}
  const nom=document.getElementById('caisse_nom')?.value.trim();
  const type=document.getElementById('caisse_type')?.value||'physique';
  const solde=+document.getElementById('caisse_solde_init')?.value||0;
  const couleur=document.getElementById('caisse_couleur')?.value||'#16A34A';
  const err=document.getElementById('caisse_err');
  if(!nom){err.textContent='Nom requis.';return;}
  const{error}=await SB.from('gp_caisses').insert({
    admin_id:GP_ADMIN_ID,nom,type,solde_initial:solde,solde_actuel:solde,couleur
  });
  if(error){err.textContent='Erreur: '+error.message;return;}
  err.textContent='';
  document.getElementById('caisse_nom').value='';
  document.getElementById('caisse_solde_init').value='0';
  renderCaisse();
  notify('Caisse "'+nom+'" créée ✓','gold');
}

async function supprimerCaisse(id){
  if(!confirm('Archiver cette caisse ?'))return;
  await SB.from('gp_caisses').update({actif:false}).eq('id',id);
  renderCaisse();
}

// ── MOUVEMENTS ────────────────────────────────────
let mvtCaisseId='',mvtCaisseType='';
function ouvrirMouvement(caisseId,nom,type){
  mvtCaisseId=caisseId;mvtCaisseType=type;
  document.getElementById('modal-mvt-caisse').style.display='flex';
  document.getElementById('mvt-caisse-titre').textContent=(type==='entree'?'+ Entrée':'- Sortie')+' — '+nom;
  document.getElementById('mvt-montant').value='';
  document.getElementById('mvt-desc').value='';
  document.getElementById('mvt-err').textContent='';
}

async function saveMouvement(){
  const montant=+document.getElementById('mvt-montant')?.value||0;
  const categorie=document.getElementById('mvt-categorie')?.value||'';
  const desc=document.getElementById('mvt-desc')?.value.trim()||null;
  const err=document.getElementById('mvt-err');
  if(!montant){err.textContent='Montant requis.';return;}
  await SB.from('gp_mouvements_caisse').insert({
    admin_id:GP_ADMIN_ID,caisse_id:mvtCaisseId,type:mvtCaisseType,
    montant,categorie,description:desc,
    date_mouvement:today(),
    enregistre_par:GP_USER.id,
    enregistre_par_nom:GP_USER.email?.split('@')[0]
  });
  document.getElementById('modal-mvt-caisse').style.display='none';
  renderCaisse();
  notify('Mouvement enregistré ✓','gold');
}

// ── TRANSFERT ─────────────────────────────────────
async function saveTransfert(){ // gardé pour compatibilité
  return saveTransfertAvecValidation();
}
async function saveTransfertAvecValidation_OLD(){
  const source=document.getElementById('transfert-source')?.value;
  const dest=document.getElementById('transfert-dest')?.value;
  const montant=+document.getElementById('transfert-montant')?.value||0;
  const desc=document.getElementById('transfert-desc')?.value.trim()||null;
  const err=document.getElementById('transfert-err');
  if(!source||!dest){err.textContent='Sélectionnez les deux caisses.';return;}
  if(source===dest){err.textContent='Source et destination doivent être différentes.';return;}
  if(!montant){err.textContent='Montant requis.';return;}
  await SB.from('gp_mouvements_caisse').insert({
    admin_id:GP_ADMIN_ID,caisse_id:source,caisse_dest_id:dest,
    type:'transfert',montant,description:desc,
    date_mouvement:today(),
    enregistre_par:GP_USER.id,
    enregistre_par_nom:GP_USER.email?.split('@')[0]
  });
  err.textContent='';
  document.getElementById('modal-transfert').style.display='none';
  renderCaisse();
  notify('Transfert effectué ✓','gold');
}

function ouvrirTransfert(caisseId,nom){
  document.getElementById('modal-transfert').style.display='flex';
  document.getElementById('transfert-source').value=caisseId;
  document.getElementById('transfert-montant').value='';
  document.getElementById('transfert-desc').value='';
  document.getElementById('transfert-err').textContent='';
}

async function voirHistoriqueCaisse(caisseId,nom){
  const{data}=await SB.from('gp_mouvements_caisse').select('*')
    .or(`caisse_id.eq.${caisseId},caisse_dest_id.eq.${caisseId}`)
    .order('date_mouvement',{ascending:false});
  const M=data||[];
  const modal=document.getElementById('modal-historique-caisse');
  document.getElementById('historique-caisse-titre').textContent='📋 '+nom;
  document.getElementById('historique-caisse-content').innerHTML=M.length?`
    <table class="tbl" style="font-size:11px">
      <thead><tr><th>Date</th><th>Type</th><th>Description</th><th class="num">Montant</th></tr></thead>
      <tbody>${M.map(m=>{
        const entrant=(m.caisse_id===caisseId&&m.type==='entree')||(m.caisse_dest_id===caisseId&&m.type==='transfert');
        return `<tr>
          <td style="font-size:10px">${m.date_mouvement}</td>
          <td><span class="badge ${entrant?'bdg-g':'bdg-r'}" style="font-size:9px">${m.type}</span></td>
          <td style="font-size:10px">${m.description||m.categorie||'—'}</td>
          <td class="num" style="color:${entrant?'var(--green)':'var(--red)'}">${entrant?'+':'−'}${fmt(m.montant)}</td>
        </tr>`;}).join('')}
      </tbody>
    </table>`:'<div style="color:var(--textm);font-size:12px">Aucun mouvement.</div>';
  modal.style.display='flex';
}

// ── TRANSFERTS EN ATTENTE ────────────────────────
async function renderTransfertsAttente(){
  const{data}=await SB.from('gp_mouvements_caisse').select('*')
    .eq('admin_id',GP_ADMIN_ID)
    .eq('type','transfert')
    .eq('statut_transfert','en_attente')
    .order('created_at',{ascending:false});
  const T=data||[];
  const section=document.getElementById('transferts-attente-section');
  if(section) section.style.display=T.length?'block':'none';
  const container=document.getElementById('transferts-attente-liste');
  if(!container)return;
  if(!T.length){container.innerHTML='';return;}

  // Charger les noms des caisses
  const{data:C}=await SB.from('gp_caisses').select('id,nom').eq('admin_id',GP_ADMIN_ID);
  const caisseMap={};
  (C||[]).forEach(c=>caisseMap[c.id]=c.nom);

  container.innerHTML=T.map(t=>`
    <div style="display:flex;justify-content:space-between;align-items:center;padding:10px;background:rgba(245,158,11,.06);border:1px solid rgba(245,158,11,.2);border-radius:8px;margin-bottom:6px">
      <div>
        <div style="font-weight:600;font-size:13px">${caisseMap[t.caisse_id]||'—'} → ${caisseMap[t.caisse_dest_id]||'—'}</div>
        <div style="font-size:11px;color:var(--textm)">${t.date_mouvement} · Par ${t.enregistre_par_nom||'—'}</div>
        ${t.description?`<div style="font-size:10px;color:var(--textm)">${t.description}</div>`:''}
      </div>
      <div style="display:flex;align-items:center;gap:10px">
        <div style="font-family:'DM Mono',monospace;font-size:16px;font-weight:700;color:var(--gold)">${fmt(t.montant)} F</div>
        <button class="btn btn-g btn-sm" onclick="validerTransfert('${t.id}')">✅ Valider</button>
        <button class="btn btn-red btn-sm" onclick="refuserTransfert('${t.id}')">✕ Refuser</button>
      </div>
    </div>`).join('');
}

async function validerTransfert(id){
  await SB.from('gp_mouvements_caisse').update({
    statut_transfert:'valide',
    valide_par:GP_USER.id
  }).eq('id',id);
  renderCaisse();
  notify('Transfert validé ✓','gold');
}

async function refuserTransfert(id){
  const raison=prompt('Raison du refus (optionnel) :');
  await SB.from('gp_mouvements_caisse').update({
    statut_transfert:'refuse',
    description:(raison?'Refusé: '+raison:'Refusé')
  }).eq('id',id);
  renderCaisse();
  notify('Transfert refusé','r');
}
