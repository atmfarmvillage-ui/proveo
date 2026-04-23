// ══════════════════════════════════════════════════
// PROVENDA — PAIEMENTS MP & DETTES FOURNISSEURS
// ══════════════════════════════════════════════════

// URL WhatsApp stockée globalement après paiement
var PROVENDA_WA_URL = '';

// ── LISTE DES ACHATS À PAYER ──────────────────────
async function renderPaiementsMP(){
  if(!GP_ADMIN_ID)return;
  const{data:achats}=await SB.from('gp_achats').select('*')
    .eq('admin_id',GP_ADMIN_ID)
    .gt('montant_total', 0)  // Tous les achats avec un montant
    .order('date_commande',{ascending:false});
  const{data:paiements}=await SB.from('gp_achats_paiements').select('*')
    .eq('admin_id',GP_ADMIN_ID).order('date_paiement',{ascending:false});
  const A=achats||[];const P=paiements||[];

  const totalDu=A.reduce((s,a)=>s+Math.max(0,Number(a.montant_total||0)-Number(a.montant_paye||0)),0);
  const payeMois=P.filter(p=>p.date_paiement>=(thisMonth()+'-01')).reduce((s,p)=>s+Number(p.montant||0),0);
  const enAttente=A.filter(a=>Number(a.montant_total||0)>Number(a.montant_paye||0)).length;

  document.getElementById('pmt-kpis').innerHTML=`
    <div class="econo-box"><div class="econo-val" style="color:var(--red)">${fmt(totalDu)}</div><div class="econo-lbl">Total dû (F)</div></div>
    <div class="econo-box"><div class="econo-val" style="color:var(--green)">${fmt(payeMois)}</div><div class="econo-lbl">Payé ce mois (F)</div></div>
    <div class="econo-box"><div class="econo-val" style="color:var(--gold)">${enAttente}</div><div class="econo-lbl">En attente</div></div>
    <div class="econo-box"><div class="econo-val">${A.length-enAttente}</div><div class="econo-lbl">Soldés</div></div>`;

  document.getElementById('pmt-achats-liste').innerHTML=A.length?A.map(a=>{
    const total=Number(a.montant_total||0);
    const paye=Number(a.montant_paye||0);
    const reste=total-paye;
    const pct=total>0?Math.round(paye/total*100):0;
    const solde=reste<=0;
    return `<div style="background:rgba(14,20,40,.6);border:1px solid ${solde?'rgba(22,163,74,.3)':'rgba(30,45,74,.7)'};border-radius:10px;padding:14px;margin-bottom:8px">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;flex-wrap:wrap">
        <div style="flex:1;min-width:0">
          <div style="font-weight:700;font-size:14px;margin-bottom:4px">${a.fournisseur_nom||'—'}
            <span class="badge ${solde?'bdg-g':'bdg-gold'}" style="font-size:9px;margin-left:4px">${solde?'✅ Soldé':'⏳ En cours'}</span>
          </div>
          <div style="font-size:11px;color:var(--textm);margin-bottom:8px">${a.date_commande} · ${a.ref||''} · ${a.condition_paiement}</div>
          <div style="background:rgba(30,45,74,.8);border-radius:20px;height:6px;margin-bottom:6px">
            <div style="width:${pct}%;height:100%;background:${pct>=100?'var(--green)':pct>50?'var(--gold)':'var(--red)'};border-radius:20px"></div>
          </div>
          <div style="display:flex;justify-content:space-between;font-size:11px">
            <span style="color:var(--green)">Payé : <strong>${fmt(paye)} F</strong></span>
            <span>${pct}%</span>
            <span style="color:${reste>0?'var(--red)':'var(--green)'}">Reste : <strong>${fmt(Math.max(0,reste))} F</strong></span>
          </div>
        </div>
        <div style="display:flex;flex-direction:column;gap:6px;align-items:flex-end">
          <div style="font-size:16px;font-weight:700;color:var(--gold)">${fmt(total)} F</div>
          ${!solde?`<button class="btn btn-g btn-sm pmt-payer" data-id="${a.id}" data-fourn="${(a.fournisseur_nom||'').replace(/"/g,'')}" data-total="${total}" data-paye="${paye}">💳 Payer</button>`:''}
          <button class="btn btn-out btn-sm pmt-histo" data-id="${a.id}" data-fourn="${(a.fournisseur_nom||'').replace(/"/g,'')}">📋 Historique</button>
        </div>
      </div>
    </div>`;
  }).join(''):'<div style="color:var(--textm);text-align:center;padding:20px">Aucun achat enregistré.</div>';

  // Historique global
  document.getElementById('pmt-histo').innerHTML=P.length?`
    <table class="tbl"><thead><tr><th>Date</th><th>Fournisseur</th><th>Mode</th><th>Réf</th><th class="num">Montant</th><th>Par</th></tr></thead>
    <tbody>${P.slice(0,30).map(p=>`<tr>
      <td>${p.date_paiement}</td>
      <td>${A.find(a=>a.id===p.achat_id)?.fournisseur_nom||'—'}</td>
      <td>${p.mode_paiement||'—'}</td>
      <td style="font-size:10px">${p.reference||'—'}</td>
      <td class="num" style="color:var(--green);font-weight:700">${fmt(p.montant)} F</td>
      <td style="font-size:10px">${p.enregistre_par_nom||'—'}</td>
    </tr>`).join('')}</tbody></table>`
    :'<div style="color:var(--textm);font-size:12px">Aucun paiement.</div>';

  // Boutons via addEventListener
  document.querySelectorAll('.pmt-payer').forEach(btn=>{
    btn.onclick=()=>ouvrirModalPaiement(btn.dataset.id,btn.dataset.fourn,+btn.dataset.total,+btn.dataset.paye);
  });
  document.querySelectorAll('.pmt-histo').forEach(btn=>{
    btn.onclick=()=>voirHistoPaiements(btn.dataset.id,btn.dataset.fourn);
  });
}

// ── MODAL PAIEMENT ────────────────────────────────
function ouvrirModalPaiement(achatId,fournisseurNom,montantTotal,montantPaye){
  const reste=montantTotal-montantPaye;
  document.getElementById('pmt-modal-titre').textContent='Paiement — '+fournisseurNom;
  document.getElementById('pmt-modal-reste').textContent='Reste dû : '+fmt(reste)+' F';
  document.getElementById('pmt-modal-achat-id').value=achatId;
  document.getElementById('pmt-modal-total').value=montantTotal;
  document.getElementById('pmt-modal-paye').value=montantPaye;
  document.getElementById('pmt-modal-montant').value=reste;
  document.getElementById('pmt-modal-date').value=today();
  document.getElementById('pmt-modal-ref').value='';
  document.getElementById('pmt-modal-err').textContent='';
  // Restaurer le formulaire si on avait affiché le succès
  document.getElementById('pmt-modal-form').style.display='block';
  document.getElementById('pmt-modal-succes').style.display='none';
  document.getElementById('modal-paiement-mp').style.display='flex';
}

function fermerModalPaiement(){
  document.getElementById('modal-paiement-mp').style.display='none';
  PROVENDA_WA_URL='';
}

async function saveModalPaiement(){
  const achatId=document.getElementById('pmt-modal-achat-id').value;
  const montantTotal=+document.getElementById('pmt-modal-total').value;
  const montantPaye=+document.getElementById('pmt-modal-paye').value;
  const montant=+document.getElementById('pmt-modal-montant').value||0;
  const mode=document.getElementById('pmt-modal-mode').value||'especes';
  const date=document.getElementById('pmt-modal-date').value||today();
  const ref=document.getElementById('pmt-modal-ref').value.trim()||null;
  const err=document.getElementById('pmt-modal-err');

  if(!montant||montant<=0){err.textContent='Entrez un montant valide.';return;}
  if(montant>montantTotal-montantPaye){err.textContent='Montant supérieur au reste dû.';return;}

  const nouveauPaye=montantPaye+montant;
  const reste=montantTotal-nouveauPaye;

  // Enregistrer paiement
  const{error}=await SB.from('gp_achats_paiements').insert({
    achat_id:achatId,admin_id:GP_ADMIN_ID,
    montant,mode_paiement:mode,date_paiement:date,reference:ref,
    enregistre_par:GP_USER?.id,enregistre_par_nom:GP_USER?.email?.split('@')[0]
  });
  if(error){err.textContent='Erreur: '+error.message;return;}

  await SB.from('gp_achats').update({
    montant_paye:nouveauPaye,statut_paiement:reste<=0?'solde':'partiel'
  }).eq('id',achatId);

  // Mouvement caisse
  const{data:caisse}=await SB.from('gp_caisses').select('id').eq('admin_id',GP_ADMIN_ID).eq('type','physique').limit(1);
  if(caisse?.length){
    await SB.from('gp_mouvements_caisse').insert({
      admin_id:GP_ADMIN_ID,caisse_id:caisse[0].id,
      type:'sortie',categorie:'paiement_fournisseur',
      montant,date_mouvement:date,
      description:`Paiement fournisseur · ${ref||mode}`,
      enregistre_par:GP_USER?.id,enregistre_par_nom:GP_USER?.email?.split('@')[0]
    });
  }

  // Construire message WhatsApp
  const{data:achat}=await SB.from('gp_achats').select('fournisseur_id,fournisseur_nom,ref').eq('id',achatId).maybeSingle();
  const{data:fourn}=achat?.fournisseur_id
    ? await SB.from('gp_fournisseurs').select('telephone,whatsapp,nom').eq('id',achat.fournisseur_id).maybeSingle()
    : {data:null};

  const tel=fourn?.whatsapp||fourn?.telephone||'';
  const paysInfo=tel?detecterPays(tel):{numero_whatsapp:''};
  const nomFourn=fourn?.nom||achat?.fournisseur_nom||'';
  const provNom=GP_CONFIG?.nom_provenderie||'PROVENDA';
  const modeLabel={especes:'Espèces',mobile_money:'Mobile Money',virement:'Virement',cheque:'Chèque'}[mode]||mode;

  const intros=['Nous avons le plaisir de vous confirmer le règlement suivant','Nous vous adressons ce message pour confirmer notre paiement','C\'est avec plaisir que nous vous informons du règlement effectué'];
  const motivs=['Votre sérieux et la qualité de vos produits font de vous un partenaire précieux.','Nous apprécions énormément votre fiabilité et la qualité constante de vos livraisons.','Votre professionnalisme est un atout précieux pour notre activité.'];
  const closings=['Nous espérons poursuivre cette belle collaboration encore longtemps.','Nous comptons sur vous pour de futures commandes.','Votre partenariat est très important pour nous.'];

  let msgText;
  if(reste<=0){
    const{data:allPmts}=await SB.from('gp_achats_paiements').select('*').eq('achat_id',achatId).order('date_paiement');
    const histo=(allPmts||[]).map((p,i)=>`   ${i+1}. ${p.date_paiement} — ${fmt(p.montant)} F (${({especes:'Espèces',mobile_money:'Mobile Money',virement:'Virement',cheque:'Chèque'}[p.mode_paiement]||p.mode_paiement)})`).join('\n');
    msgText=`Monsieur/Madame ${nomFourn},\n\n${intros[Math.floor(Math.random()*intros.length)]} concernant notre commande *${achat?.ref||achatId.slice(0,8)}*.\n\n✅ *SOLDE COMPLET*\n\n💳 *Dernier paiement :*\n   • Montant : *${fmt(montant)} F*\n   • Mode : ${modeLabel}${ref?'\n   • Réf : '+ref:''}\n   • Date : ${date}\n\n📋 *Récapitulatif :*\n${histo}\n   ─────────────────\n   Total réglé : *${fmt(nouveauPaye)} F*\n\n${motivs[Math.floor(Math.random()*motivs.length)]}\n${closings[Math.floor(Math.random()*closings.length)]}\n\nCordialement,\n*${provNom}*`;
  } else {
    const pct=Math.round(nouveauPaye/montantTotal*100);
    msgText=`Monsieur/Madame ${nomFourn},\n\n${intros[Math.floor(Math.random()*intros.length)]} concernant notre commande *${achat?.ref||achatId.slice(0,8)}*.\n\n💵 *Paiement effectué :*\n   • Montant : *${fmt(montant)} F*\n   • Mode : ${modeLabel}${ref?'\n   • Réf : '+ref:''}\n   • Date : ${date}\n\n📊 *Règlement :*\n   • Total : ${fmt(montantTotal)} F\n   • Payé : *${fmt(nouveauPaye)} F* (${pct}%)\n   • ⏳ Reste : *${fmt(reste)} F*\n\n${motivs[Math.floor(Math.random()*motivs.length)]}\n\nNous procéderons au règlement du solde dans les meilleurs délais.\n\nCordialement,\n*${provNom}*`;
  }

  // Stocker l'URL WhatsApp
  PROVENDA_WA_URL=paysInfo.numero_whatsapp
    ? 'https://wa.me/'+paysInfo.numero_whatsapp+'?text='+encodeURIComponent(msgText)
    : '';

  // Afficher écran succès dans le modal
  document.getElementById('pmt-modal-form').style.display='none';
  const succes=document.getElementById('pmt-modal-succes');
  succes.innerHTML=`
    <div style="text-align:center;padding:8px 0 16px">
      <div style="font-size:40px;margin-bottom:8px">✅</div>
      <div style="font-size:18px;font-weight:700;color:var(--green)">${fmt(montant)} F enregistrés</div>
      <div style="font-size:12px;color:var(--textm);margin-top:4px">Pour : ${nomFourn||'Fournisseur'}</div>
    </div>
    ${!paysInfo.numero_whatsapp?`<div class="fr" style="margin-bottom:12px">
      <label>📱 Numéro WhatsApp du fournisseur</label>
      <input type="tel" id="wa-num-input" placeholder="+228 90 00 00 00" oninput="majLienWA(this.value,'${encodeURIComponent(msgText)}')">
    </div>`:''}
    <div style="display:flex;flex-direction:column;gap:8px;margin-top:4px">
      <a id="wa-lien-final" href="${PROVENDA_WA_URL||'#'}" target="_blank" rel="noopener noreferrer"
        style="width:100%;background:linear-gradient(135deg,#25D366,#128C7E);color:white;padding:13px;border-radius:10px;font-size:14px;font-weight:700;text-align:center;text-decoration:none;display:block">
        📲 Envoyer confirmation WhatsApp
      </a>
      <button onclick="fermerModalPaiement()"
        style="width:100%;background:rgba(30,45,74,.6);border:1px solid var(--border2);color:var(--textm);padding:11px;border-radius:10px;font-size:13px;cursor:pointer">
        Fermer sans envoyer
      </button>
    </div>`;
  succes.style.display='block';

  await renderPaiementsMP();
  notify(`Paiement de ${fmt(montant)} F enregistré ✓`,'gold');
}

function majLienWA(tel, msgEncoded){
  if(!tel.trim())return;
  const paysInfo=detecterPays(tel.trim());
  const lien=document.getElementById('wa-lien-final');
  if(lien&&paysInfo.numero_whatsapp){
    lien.href='https://wa.me/'+paysInfo.numero_whatsapp+'?text='+msgEncoded;
  }
}

// ── HISTORIQUE PAR ACHAT ──────────────────────────
async function voirHistoPaiements(achatId, fournisseurNom){
  const{data:P}=await SB.from('gp_achats_paiements').select('*').eq('achat_id',achatId).order('date_paiement');
  const{data:a}=await SB.from('gp_achats').select('montant_total,montant_paye').eq('id',achatId).maybeSingle();
  document.getElementById('pmt-modal-titre').textContent='Historique — '+fournisseurNom;
  document.getElementById('pmt-modal-reste').textContent='';
  document.getElementById('pmt-modal-form').style.display='none';
  const succes=document.getElementById('pmt-modal-succes');
  succes.innerHTML=`
    ${(P||[]).map(p=>`<div style="display:flex;justify-content:space-between;padding:10px;background:rgba(14,20,40,.5);border-radius:8px;margin-bottom:6px">
      <div><div style="font-size:12px;font-weight:600">${p.date_paiement}</div>
      <div style="font-size:10px;color:var(--textm)">${p.mode_paiement} ${p.reference?'· '+p.reference:''}</div></div>
      <div style="font-size:15px;font-weight:700;color:var(--green)">${fmt(p.montant)} F</div>
    </div>`).join('')||'<div style="color:var(--textm);font-size:12px">Aucun paiement.</div>'}
    <div style="border-top:1px solid var(--border);padding-top:10px;margin-top:8px;display:flex;justify-content:space-between;font-weight:700">
      <span>Total payé</span><span style="color:var(--green)">${fmt(a?.montant_paye||0)} / ${fmt(a?.montant_total||0)} F</span>
    </div>
    <button onclick="fermerModalPaiement()" class="btn btn-out" style="width:100%;justify-content:center;margin-top:10px">Fermer</button>`;
  succes.style.display='block';
  document.getElementById('modal-paiement-mp').style.display='flex';
}
