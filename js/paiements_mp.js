// ══════════════════════════════════════════════════
// PROVENDA — PAIEMENTS MP & DETTES FOURNISSEURS
// ══════════════════════════════════════════════════

async function renderPaiementsMP(){
  if(!GP_ADMIN_ID)return;

  // Charger achats avec solde restant
  const{data:achats}=await SB.from('gp_achats').select('*')
    .eq('admin_id',GP_ADMIN_ID)
    .in('condition_paiement',['credit','tranches','avance'])
    .order('date_commande',{ascending:false});

  const{data:paiements}=await SB.from('gp_achats_paiements').select('*')
    .eq('admin_id',GP_ADMIN_ID)
    .order('date_paiement',{ascending:false});

  const A=achats||[];
  const P=paiements||[];

  // Calculer totaux
  const totalDu=A.reduce((s,a)=>{
    const reste=Number(a.montant_total||0)-Number(a.montant_paye||0);
    return s+(reste>0?reste:0);
  },0);
  const payeMois=P.filter(p=>p.date_paiement>=thisMonth()+'-01').reduce((s,p)=>s+Number(p.montant||0),0);
  const enAttente=A.filter(a=>Number(a.montant_total||0)>Number(a.montant_paye||0)).length;
  const soldes=A.filter(a=>Number(a.montant_total||0)<=Number(a.montant_paye||0)).length;

  // KPIs
  document.getElementById('pmt-kpis').innerHTML=`
    <div class="econo-box"><div class="econo-val" style="color:var(--red)">${fmt(totalDu)}</div><div class="econo-lbl">Total dû (F)</div></div>
    <div class="econo-box"><div class="econo-val" style="color:var(--green)">${fmt(payeMois)}</div><div class="econo-lbl">Payé ce mois (F)</div></div>
    <div class="econo-box"><div class="econo-val" style="color:var(--gold)">${enAttente}</div><div class="econo-lbl">Achats en attente</div></div>
    <div class="econo-box"><div class="econo-val" style="color:var(--green)">${soldes}</div><div class="econo-lbl">Achats soldés</div></div>`;

  // Liste achats à payer
  const aPayerHtml=A.map(a=>{
    const total=Number(a.montant_total||0);
    const paye=Number(a.montant_paye||0);
    const reste=total-paye;
    const pct=total>0?Math.round(paye/total*100):0;
    const solde=reste<=0;
    return `
    <div style="background:rgba(14,20,40,.6);border:1px solid ${solde?'rgba(22,163,74,.3)':'rgba(30,45,74,.7)'};border-radius:10px;padding:14px;margin-bottom:8px">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;flex-wrap:wrap">
        <div style="flex:1;min-width:0">
          <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-bottom:4px">
            <span style="font-weight:700;font-size:14px">${a.fournisseur_nom||'—'}</span>
            <span class="badge ${solde?'bdg-g':'bdg-gold'}" style="font-size:9px">${solde?'✅ Soldé':'⏳ En cours'}</span>
            <span style="font-size:10px;color:var(--textm)">${a.ref||''}</span>
          </div>
          <div style="font-size:11px;color:var(--textm);margin-bottom:8px">
            📅 ${a.date_commande} · 
            ${a.condition_paiement==='tranches'?'🔄 Tranches':a.condition_paiement==='credit'?'💳 Crédit':'⬆ Avance'} · 
            ${a.nb_ingredients||'—'} ingrédients
          </div>
          <!-- Barre progression paiement -->
          <div style="background:rgba(30,45,74,.8);border-radius:20px;height:6px;margin-bottom:6px;overflow:hidden">
            <div style="width:${pct}%;height:100%;background:${pct>=100?'var(--green)':pct>50?'var(--gold)':'var(--red)'};border-radius:20px;transition:width .3s"></div>
          </div>
          <div style="display:flex;justify-content:space-between;font-size:11px">
            <span style="color:var(--green)">Payé : <strong>${fmt(paye)} F</strong></span>
            <span style="color:var(--textm)">${pct}%</span>
            <span style="color:${reste>0?'var(--red)':'var(--green)'}">Reste : <strong>${fmt(Math.max(0,reste))} F</strong></span>
          </div>
        </div>
        <div style="display:flex;flex-direction:column;gap:6px;align-items:flex-end;flex-shrink:0">
          <div style="font-family:'DM Mono',monospace;font-size:16px;font-weight:700;color:var(--gold)">${fmt(total)} F</div>
          ${!solde?`<button class="btn btn-g btn-sm pmt-payer-btn"
            data-id="${a.id}"
            data-nom="${(a.fournisseur_nom||'').replace(/"/g,'&quot;')}"
            data-total="${total}"
            data-paye="${paye}"
            style="white-space:nowrap">
            💳 Payer
          </button>`:`<span style="font-size:11px;color:var(--green)">✓ Soldé</span>`}
          <button class="btn btn-out btn-sm pmt-histo-btn"
            data-id="${a.id}"
            data-nom="${(a.fournisseur_nom||'').replace(/"/g,'&quot;')}">
            📋 Historique
          </button>
        </div>
      </div>
    </div>`;
  }).join('');

  document.getElementById('pmt-achats-liste').innerHTML=A.length
    ? aPayerHtml
    : '<div style="color:var(--textm);font-size:12px;text-align:center;padding:20px">Aucun achat à crédit ou en tranches.</div>';

  // Délégation événements — boutons Payer et Historique
  document.querySelectorAll('.pmt-payer-btn').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      ouvrirModalPaiement(
        btn.dataset.id,
        btn.dataset.nom,
        +btn.dataset.total,
        +btn.dataset.paye
      );
    });
  });
  document.querySelectorAll('.pmt-histo-btn').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      voirHistoPaiements(btn.dataset.id, btn.dataset.nom);
    });
  });

  // Historique global des paiements
  const histoHtml=P.slice(0,30).map(p=>`
    <tr>
      <td style="font-size:11px">${p.date_paiement}</td>
      <td style="font-weight:600">${achats?.find(a=>a.id===p.achat_id)?.fournisseur_nom||'—'}</td>
      <td style="font-size:10px;color:var(--textm)">${p.mode_paiement||'—'}</td>
      <td style="font-size:10px;color:var(--textm)">${p.reference||'—'}</td>
      <td class="num" style="color:var(--green);font-weight:700">${fmt(p.montant)} F</td>
      <td style="font-size:10px;color:var(--textm)">${p.enregistre_par_nom||'—'}</td>
    </tr>`).join('');

  document.getElementById('pmt-histo').innerHTML=P.length?`
    <table class="tbl">
      <thead><tr><th>Date</th><th>Fournisseur</th><th>Mode</th><th>Référence</th><th class="num">Montant</th><th>Par</th></tr></thead>
      <tbody>${histoHtml}</tbody>
    </table>`
    :'<div style="color:var(--textm);font-size:12px">Aucun paiement enregistré.</div>';
}

// ── MODAL PAIEMENT ────────────────────────────────
function ouvrirModalPaiement(achatId, fournisseurNom, montantTotal, montantPaye){
  const reste=montantTotal-montantPaye;
  const modal=document.getElementById('modal-paiement-mp');
  document.getElementById('pmt-modal-titre').textContent='Paiement — '+fournisseurNom;
  document.getElementById('pmt-modal-reste').textContent='Reste dû : '+fmt(reste)+' F';
  document.getElementById('pmt-modal-montant').value=reste;
  document.getElementById('pmt-modal-montant').max=reste;
  document.getElementById('pmt-modal-date').value=today();
  document.getElementById('pmt-modal-err').textContent='';
  document.getElementById('pmt-modal-achat-id').value=achatId;
  document.getElementById('pmt-modal-total').value=montantTotal;
  document.getElementById('pmt-modal-paye').value=montantPaye;
  modal.style.display='flex';
  setTimeout(()=>document.getElementById('pmt-modal-montant').focus(),100);
}

function fermerModalPaiement(){
  document.getElementById('modal-paiement-mp').style.display='none';
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
  if(montant>montantTotal-montantPaye){
    err.textContent='Montant supérieur au reste dû ('+fmt(montantTotal-montantPaye)+' F).';return;
  }

  const nouveauPaye=montantPaye+montant;
  const reste=montantTotal-nouveauPaye;
  const statutPaiement=reste<=0?'solde':'partiel';

  const{error}=await SB.from('gp_achats_paiements').insert({
    achat_id:achatId,admin_id:GP_ADMIN_ID,
    montant,mode_paiement:mode,
    date_paiement:date,reference:ref,
    enregistre_par:GP_USER?.id,
    enregistre_par_nom:GP_USER?.email?.split('@')[0]
  });

  if(error){err.textContent='Erreur: '+error.message;return;}

  await SB.from('gp_achats').update({
    montant_paye:nouveauPaye,statut_paiement:statutPaiement
  }).eq('id',achatId);

  // Mouvement caisse
  const{data:caisse}=await SB.from('gp_caisses').select('id')
    .eq('admin_id',GP_ADMIN_ID).eq('type','physique').limit(1);
  if(caisse?.length){
    await SB.from('gp_mouvements_caisse').insert({
      admin_id:GP_ADMIN_ID,caisse_id:caisse[0].id,
      type:'sortie',categorie:'paiement_fournisseur',
      montant,date_mouvement:date,
      description:`Paiement fournisseur · ${ref||mode}`,
      enregistre_par:GP_USER?.id,
      enregistre_par_nom:GP_USER?.email?.split('@')[0]
    });
  }

  notify(`Paiement de ${fmt(montant)} F enregistré ✓`,'gold');

  // Récupérer numéro WhatsApp du fournisseur
  const{data:achat}=await SB.from('gp_achats').select('fournisseur_id,fournisseur_nom,ref')
    .eq('id',achatId).maybeSingle();
  if(achat?.fournisseur_id){
    const{data:fourn}=await SB.from('gp_fournisseurs').select('telephone,whatsapp,nom')
      .eq('id',achat.fournisseur_id).maybeSingle();
    const telFourn=fourn?.whatsapp||fourn?.telephone||null;
    if(telFourn){
      const paysInfo=detecterPays(telFourn);
      const modeLabel={especes:'Espèces',mobile_money:'Mobile Money',virement:'Virement',cheque:'Chèque'}[mode]||mode;
      const nomFourn=fourn.nom||achat.fournisseur_nom||'Partenaire';
      const provNom=GP_CONFIG?.nom_provenderie||'PROVENDA';

      // Messages d'intro dynamiques
      const intros=[
        `Nous avons le plaisir de vous confirmer le règlement suivant`,
        `Nous vous adressons ce message pour confirmer notre paiement`,
        `C'est avec plaisir que nous vous informons du règlement effectué`,
        `Nous vous confirmons la bonne réception de votre livraison et le paiement correspondant`,
      ];
      const motivations=[
        `Votre sérieux et la qualité de vos produits font de vous un partenaire précieux pour nous.`,
        `Nous apprécions énormément votre fiabilité et la qualité constante de vos livraisons.`,
        `Votre professionnalisme est un atout précieux pour notre activité. Merci de votre confiance.`,
        `C'est un honneur de travailler avec un fournisseur aussi sérieux et ponctuel que vous.`,
      ];
      const closings=[
        `Nous espérons poursuivre cette belle collaboration encore longtemps.`,
        `Nous comptons sur vous pour de futures commandes et restons à votre disposition.`,
        `Votre partenariat est très important pour nous et nous tenons à vous en remercier sincèrement.`,
        `Nous vous renouvelons notre confiance et espérons renforcer notre partenariat.`,
      ];
      const intro=intros[Math.floor(Math.random()*intros.length)];
      const motiv=motivations[Math.floor(Math.random()*motivations.length)];
      const closing=closings[Math.floor(Math.random()*closings.length)];

      let msgText;

      if(reste<=0){
        // Dernier paiement — message de solde complet avec historique
        const{data:allPmts}=await SB.from('gp_achats_paiements').select('*')
          .eq('achat_id',achatId).order('date_paiement');
        const lignesHisto=(allPmts||[]).map((p,i)=>
          `   ${i+1}. ${p.date_paiement} — ${fmt(p.montant)} F (${({especes:'Espèces',mobile_money:'Mobile Money',virement:'Virement',cheque:'Chèque'}[p.mode_paiement]||p.mode_paiement)})`
        ).join('\n');

        msgText=
          `Monsieur/Madame ${nomFourn},\n\n`+
          `${intro} concernant notre commande *${achat.ref||achatId.slice(0,8)}*.\n\n`+
          `✅ *SOLDE COMPLET*\n`+
          `Nous avons le plaisir de vous informer que l'intégralité du montant dû a été réglée.\n\n`+
          `💳 *Dernier paiement :*\n`+
          `   • Montant : *${fmt(montant)} F*\n`+
          `   • Mode : ${modeLabel}\n`+
          (ref?`   • Réf : ${ref}\n`:'')+
          `   • Date : ${date}\n\n`+
          `📋 *Récapitulatif de tous les paiements :*\n`+
          lignesHisto+`\n`+
          `   ─────────────────────\n`+
          `   Total réglé : *${fmt(nouveauPaye)} F*\n\n`+
          `${motiv}\n\n`+
          `${closing}\n\n`+
          `Cordialement,\n*${provNom}*`;
      } else {
        // Paiement partiel
        const pct=Math.round(nouveauPaye/montantTotal*100);
        msgText=
          `Monsieur/Madame ${nomFourn},\n\n`+
          `${intro} concernant notre commande *${achat.ref||achatId.slice(0,8)}*.\n\n`+
          `💵 *Paiement effectué :*\n`+
          `   • Montant : *${fmt(montant)} F*\n`+
          `   • Mode : ${modeLabel}\n`+
          (ref?`   • Réf : ${ref}\n`:'')+
          `   • Date : ${date}\n\n`+
          `📊 *État du règlement :*\n`+
          `   • Montant total : ${fmt(montantTotal)} F\n`+
          `   • Total payé : *${fmt(nouveauPaye)} F* (${pct}%)\n`+
          `   • ⏳ Reste dû : *${fmt(reste)} F*\n\n`+
          `${motiv}\n\n`+
          `Nous procéderons au règlement du solde restant dans les meilleurs délais.\n\n`+
          `Cordialement,\n*${provNom}*`;
      }

      const msg=encodeURIComponent(msgText);
      // Ouvrir WhatsApp
      // Afficher bouton WhatsApp visible plutôt que window.open (évite blocage navigateur)
      afficherBoutonWA(paysInfo.numero_whatsapp, msg);
    }
  }

  fermerModalPaiement();
  await renderPaiementsMP();
}

// ── HISTORIQUE PAR ACHAT ──────────────────────────
async function voirHistoPaiements(achatId, fournisseurNom){
  const{data:P}=await SB.from('gp_achats_paiements').select('*')
    .eq('achat_id',achatId).order('date_paiement');
  const{data:a}=await SB.from('gp_achats').select('montant_total,montant_paye')
    .eq('id',achatId).maybeSingle();

  const modal=document.getElementById('modal-paiement-mp');
  document.getElementById('pmt-modal-titre').textContent='Historique — '+fournisseurNom;
  document.getElementById('pmt-modal-reste').textContent='';

  const rows=(P||[]).map(p=>`
    <div style="display:flex;justify-content:space-between;align-items:center;padding:10px;background:rgba(14,20,40,.5);border-radius:8px;margin-bottom:6px">
      <div>
        <div style="font-size:12px;font-weight:600">${p.date_paiement}</div>
        <div style="font-size:10px;color:var(--textm)">${p.mode_paiement} ${p.reference?'· '+p.reference:''}</div>
        <div style="font-size:10px;color:var(--textm)">Par : ${p.enregistre_par_nom||'—'}</div>
      </div>
      <div style="font-family:'DM Mono',monospace;font-size:15px;font-weight:700;color:var(--green)">${fmt(p.montant)} F</div>
    </div>`).join('');

  document.getElementById('pmt-modal-form').innerHTML=`
    <div>${rows||'<div style="color:var(--textm);font-size:12px">Aucun paiement.</div>'}</div>
    <div style="border-top:1px solid var(--border);padding-top:10px;margin-top:10px;display:flex;justify-content:space-between;font-weight:700">
      <span>Total payé</span>
      <span style="color:var(--green)">${fmt(a?.montant_paye||0)} F / ${fmt(a?.montant_total||0)} F</span>
    </div>
    <button class="btn btn-out" onclick="fermerModalPaiement()" style="width:100%;justify-content:center;margin-top:10px">Fermer</button>`;

  modal.style.display='flex';
}

// ── BOUTON WHATSAPP APRÈS PAIEMENT ───────────────
function afficherBoutonWA(numeroWA, msg){
  // Supprimer ancien bouton si présent
  const old=document.getElementById('wa-pmt-btn');
  if(old)old.remove();

  const div=document.createElement('div');
  div.id='wa-pmt-btn';
  div.style.cssText='position:fixed;bottom:90px;right:16px;z-index:9999;display:flex;flex-direction:column;align-items:flex-end;gap:8px;animation:fadeIn .3s ease';
  div.innerHTML=`
    <div style="background:rgba(14,20,40,.95);border:1px solid rgba(37,211,102,.4);border-radius:12px;padding:12px 16px;font-size:12px;color:#E2E8F0;max-width:260px;text-align:right">
      ✅ Paiement enregistré !<br>
      <span style="font-size:11px;color:var(--textm)">Envoyer la confirmation au fournisseur ?</span>
    </div>
    <div style="display:flex;gap:8px">
      <button onclick="this.closest('#wa-pmt-btn').remove()" style="background:rgba(14,20,40,.9);border:1px solid var(--border2);color:var(--textm);padding:8px 14px;border-radius:8px;cursor:pointer;font-size:12px">
        Ignorer
      </button>
      <a href="https://wa.me/${numeroWA}?text=${msg}" target="_blank"
        onclick="setTimeout(()=>this.closest('#wa-pmt-btn').remove(),500)"
        style="background:linear-gradient(135deg,#25D366,#128C7E);color:white;padding:10px 18px;border-radius:8px;font-size:13px;font-weight:700;text-decoration:none;display:flex;align-items:center;gap:6px;box-shadow:0 4px 16px rgba(37,211,102,.4)">
        📲 WhatsApp
      </a>
    </div>`;

  document.body.appendChild(div);

  // Auto-supprimer après 15 secondes
  setTimeout(()=>{const el=document.getElementById('wa-pmt-btn');if(el)el.remove();},15000);
}
