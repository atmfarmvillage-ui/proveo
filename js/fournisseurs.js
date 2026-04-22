// ══════════════════════════════════════════════════
// PROVENDA — MODULE FOURNISSEURS
// ══════════════════════════════════════════════════

// ── LISTE FOURNISSEURS ────────────────────────────
async function renderFournisseurs(){
  const{data}=await SB.from('gp_fournisseurs').select('*')
    .eq('admin_id',GP_ADMIN_ID).eq('actif',true).order('nom');
  const F=data||[];
  document.getElementById('fourn-kpis').innerHTML=`
    <div class="econo-box"><div class="econo-val">${F.length}</div><div class="econo-lbl">Fournisseurs</div></div>
    <div class="econo-box"><div class="econo-val" id="fourn-total-achats">—</div><div class="econo-lbl">Total achats</div></div>
    <div class="econo-box"><div class="econo-val" id="fourn-total-du" style="color:var(--red)">—</div><div class="econo-lbl">Total impayé</div></div>
    <div class="econo-box"><div class="econo-val">${F.filter(f=>f.condition_paiement==='credit').length}</div><div class="econo-lbl">À crédit</div></div>`;
  loadFournisseurStats();
  document.getElementById('fourn-liste').innerHTML=F.length?`
    <table class="tbl" style="font-size:11px">
      <thead><tr><th>Fournisseur</th><th>Contact</th><th>Condition</th><th class="num">Achats</th><th class="num">Impayé</th><th></th></tr></thead>
      <tbody>
      ${F.map(f=>`<tr>
        <td><div style="font-weight:700">${f.nom}</div><div style="font-size:10px;color:var(--textm)">${f.adresse||''}</div></td>
        <td><div style="font-size:11px">${f.contact_nom||'—'}</div><div style="font-size:10px;color:var(--textm)">${f.whatsapp||''}</div></td>
        <td><span class="badge ${f.condition_paiement==='credit'?'bdg-gold':f.condition_paiement==='avance'?'bdg-r':'bdg-g'}" style="font-size:9px">${condLabel(f.condition_paiement)}</span></td>
        <td class="num" id="fa-${f.id}">—</td>
        <td class="num" id="fd-${f.id}" style="color:var(--red)">—</td>
        <td>
          <div style="display:flex;gap:4px">
            ${f.whatsapp?`<a href="https://wa.me/228${f.whatsapp.replace(/[\s\-\+]/g,'').replace(/^228/,'')}" target="_blank" class="btn btn-g btn-sm">📲</a>`:''}
            <button class="btn btn-out btn-sm" onclick="ouvrirBilanFourn('${f.id}','${f.nom}')">📊</button>
            <button class="btn btn-red btn-sm" onclick="deleteFourn('${f.id}')">✕</button>
          </div>
        </td>
      </tr>`).join('')}
      </tbody>
    </table>`:'<div style="color:var(--textm);font-size:12px">Aucun fournisseur enregistré.</div>';

  // Charger stats par fournisseur
  F.forEach(f=>loadStatsFourn(f.id));
}

function condLabel(c){
  return c==='avance'?'Avance':c==='livraison'?'À la livraison':c==='credit'?'Crédit':c==='tranches'?'En tranches':'—';
}

async function loadStatsFourn(id){
  const{data:achats}=await SB.from('gp_achats').select('montant_total,montant_paye')
    .eq('admin_id',GP_ADMIN_ID).eq('fournisseur_id',id).eq('statut','valide_daf');
  if(!achats)return;
  const total=achats.reduce((s,a)=>s+Number(a.montant_total||0),0);
  const paye=achats.reduce((s,a)=>s+Number(a.montant_paye||0),0);
  const du=total-paye;
  const elA=document.getElementById('fa-'+id);
  const elD=document.getElementById('fd-'+id);
  if(elA)elA.textContent=fmt(total)+' F';
  if(elD)elD.textContent=du>0?fmt(du)+' F':'✓';
  if(elD&&du<=0)elD.style.color='var(--green)';
}

async function loadFournisseurStats(){
  const{data:achats}=await SB.from('gp_achats').select('montant_total,montant_paye')
    .eq('admin_id',GP_ADMIN_ID).eq('statut','valide_daf');
  if(!achats)return;
  const total=achats.reduce((s,a)=>s+Number(a.montant_total||0),0);
  const du=achats.reduce((s,a)=>s+(Number(a.montant_total||0)-Number(a.montant_paye||0)),0);
  const elT=document.getElementById('fourn-total-achats');
  const elD=document.getElementById('fourn-total-du');
  if(elT)elT.textContent=fmt(total)+' F';
  if(elD)elD.textContent=fmt(du)+' F';
}

// ── AJOUTER FOURNISSEUR ───────────────────────────
async function saveFournisseur(){
  const nom=document.getElementById('fn_nom')?.value.trim()||null;
  const contact=document.getElementById('fn_contact')?.value.trim()||null;
  const err=document.getElementById('fn_err');
  // Au moins un des deux doit être rempli
  if(!nom&&!contact){err.textContent='Remplissez au moins le nom de l\'entreprise ou la personne de contact.';return;}
  // Nom d'affichage : entreprise si disponible, sinon contact
  const nomAffichage=nom||contact;
  const{error}=await SB.from('gp_fournisseurs').insert({
    admin_id:GP_ADMIN_ID,
    nom:nomAffichage,
    whatsapp:document.getElementById('fn_wa')?.value.trim()||null,
    adresse:document.getElementById('fn_adresse')?.value.trim()||null,
    contact_nom:contact,
    condition_paiement:document.getElementById('fn_condition')?.value||'livraison',
    delai_credit_jours:+document.getElementById('fn_delai')?.value||0,
  });
  if(error){err.textContent='Erreur: '+error.message;return;}
  err.textContent='';
  ['fn_nom','fn_wa','fn_adresse','fn_contact'].forEach(id=>{
    const el=document.getElementById(id);if(el)el.value='';
  });
  populateFournisseurSelect();
  await renderFournisseurs();
  notify('Fournisseur ajouté ✓','gold');
}

async function deleteFourn(id){
  if(!confirm('Archiver ce fournisseur ?'))return;
  await SB.from('gp_fournisseurs').update({actif:false}).eq('id',id);
  await renderFournisseurs();
  notify('Fournisseur archivé','r');
}

// ── POPULATE SELECT FOURNISSEURS ──────────────────
async function populateFournisseurSelect(){
  const{data}=await SB.from('gp_fournisseurs').select('id,nom')
    .eq('admin_id',GP_ADMIN_ID).eq('actif',true).order('nom');
  const F=data||[];
  ['achat_fournisseur'].forEach(id=>{
    const el=document.getElementById(id);
    if(!el)return;
    el.innerHTML='<option value="">— Sélectionner —</option>'+
      F.map(f=>`<option value="${f.id}">${f.nom}</option>`).join('');
  });
}

// ── BILAN FOURNISSEUR ─────────────────────────────
async function ouvrirBilanFourn(id,nom){
  const{data:achats}=await SB.from('gp_achats').select('*')
    .eq('admin_id',GP_ADMIN_ID).eq('fournisseur_id',id)
    .order('date_commande',{ascending:false});
  const A=achats||[];
  const total=A.reduce((s,a)=>s+Number(a.montant_total||0),0);
  const paye=A.reduce((s,a)=>s+Number(a.montant_paye||0),0);
  const du=total-paye;

  const modal=document.getElementById('modal-bilan-fourn');
  modal.style.display='flex';
  document.getElementById('bilan-fourn-titre').textContent='📊 Bilan — '+nom;
  document.getElementById('bilan-fourn-content').innerHTML=`
    <div class="g4" style="margin-bottom:14px">
      <div class="econo-box"><div class="econo-val">${A.length}</div><div class="econo-lbl">Commandes</div></div>
      <div class="econo-box"><div class="econo-val" style="color:var(--gold)">${fmt(total)} F</div><div class="econo-lbl">Total achats</div></div>
      <div class="econo-box"><div class="econo-val" style="color:var(--green)">${fmt(paye)} F</div><div class="econo-lbl">Payé</div></div>
      <div class="econo-box"><div class="econo-val" style="color:${du>0?'var(--red)':'var(--green)'}">${fmt(du)} F</div><div class="econo-lbl">Reste à payer</div></div>
    </div>
    <div style="overflow-x:auto">
    <table class="tbl" style="font-size:11px">
      <thead><tr><th>Date</th><th>Réf</th><th class="num">Montant</th><th class="num">Payé</th><th class="num">Reste</th><th>Statut</th></tr></thead>
      <tbody>
      ${A.map(a=>{
        const reste=Number(a.montant_total||0)-Number(a.montant_paye||0);
        return `<tr>
          <td style="font-size:10px">${a.date_commande}</td>
          <td style="font-size:10px">${a.ref||'—'}</td>
          <td class="num">${fmt(a.montant_total)}</td>
          <td class="num" style="color:var(--green)">${fmt(a.montant_paye)}</td>
          <td class="num" style="color:${reste>0?'var(--red)':'var(--green)'}">${reste>0?fmt(reste):'✓'}</td>
          <td><span class="badge ${statutBadge(a.statut)}" style="font-size:9px">${a.statut}</span></td>
        </tr>`;
      }).join('')}
      </tbody>
    </table></div>
    ${du>0?`<div style="margin-top:12px"><button class="btn btn-g btn-sm" onclick="ouvrirPaiementFourn('${id}','${nom}',${du})">💳 Enregistrer un paiement</button></div>`:''}`;
}

function statutBadge(s){
  return s==='valide_daf'?'bdg-g':s==='annule'?'bdg-r':s==='recu_complet'?'bdg-b':'bdg-gold';
}

async function ouvrirPaiementFourn(fournId,fournNom,resteTotal){
  // Trouver la commande impayée
  const{data}=await SB.from('gp_achats').select('id,ref,montant_total,montant_paye')
    .eq('admin_id',GP_ADMIN_ID).eq('fournisseur_id',fournId)
    .neq('statut','annule').order('date_commande',{ascending:false});
  const impayees=(data||[]).filter(a=>Number(a.montant_total||0)>Number(a.montant_paye||0));
  if(!impayees.length){notify('Aucune commande impayée','gold');return;}

  const modal=document.getElementById('modal-paiement-fourn');
  document.getElementById('pf-fourn-nom').textContent=fournNom;
  document.getElementById('pf-achat-select').innerHTML=
    impayees.map(a=>`<option value="${a.id}">Cmd ${a.ref||a.id.slice(0,8)} — Reste: ${fmt(Number(a.montant_total)-Number(a.montant_paye))} F</option>`).join('');
  document.getElementById('pf-montant').value='';
  document.getElementById('pf-err').textContent='';
  modal.style.display='flex';
}

async function savePaiementFourn(){
  const achatId=document.getElementById('pf-achat-select')?.value;
  const montant=+document.getElementById('pf-montant')?.value||0;
  const mode=document.getElementById('pf-mode')?.value||'especes';
  const ref=document.getElementById('pf-ref')?.value.trim()||null;
  const err=document.getElementById('pf-err');
  if(!achatId||!montant){err.textContent='Sélectionnez une commande et entrez le montant.';return;}

  // Enregistrer paiement
  await SB.from('gp_achats_paiements').insert({
    achat_id:achatId,admin_id:GP_ADMIN_ID,
    montant,mode_paiement:mode,reference:ref,
    enregistre_par:GP_USER.id
  });

  // Mettre à jour montant_paye sur l'achat
  const{data:achat}=await SB.from('gp_achats').select('montant_paye,montant_total,fournisseur_id,fournisseur_nom').eq('id',achatId).maybeSingle();
  if(achat){
    const nouveauPaye=Number(achat.montant_paye||0)+montant;
    await SB.from('gp_achats').update({montant_paye:nouveauPaye}).eq('id',achatId);

    // Envoyer WhatsApp au fournisseur si numéro disponible
    const{data:fourn}=await SB.from('gp_fournisseurs').select('whatsapp,nom').eq('id',achat.fournisseur_id).maybeSingle();
    if(fourn?.whatsapp){
      const reste=Number(achat.montant_total)-nouveauPaye;
      const tel=fourn.whatsapp.replace(/[\s\-\+]/g,'').replace(/^228/,'');
      const msg=encodeURIComponent(
        `Bonjour,\n\n`+
        `*PROVENDA* vous informe d'un paiement :\n\n`+
        `💳 *Montant payé :* ${fmt(montant)} FCFA\n`+
        `✅ *Total payé :* ${fmt(nouveauPaye)} FCFA\n`+
        (reste>0?`⏳ *Reste à payer :* ${fmt(reste)} FCFA`:`🎉 *Paiement complet — Merci !*`)+
        `\n\n_PROVENDA · ATM Farm Village_`
      );
      window.open(`https://wa.me/228${tel}?text=${msg}`,'_blank');
    }
  }

  document.getElementById('modal-paiement-fourn').style.display='none';
  await renderFournisseurs();
  notify('Paiement enregistré ✓','gold');
}
