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
        <td style="white-space:nowrap">
          <button class="btn btn-print btn-sm" onclick="imprimerFichePaie('${s.id}')" title="Fiche de paie PDF">🖨️</button>
          <button class="btn btn-out btn-sm" onclick="envoyerFichePayeWA('${s.id}')" title="Envoyer WhatsApp" style="background:rgba(37,211,102,.1);border-color:rgba(37,211,102,.3);color:#25D366">📲</button>
          <button class="btn btn-out btn-sm" onclick="afficherBilanEmploye('${s.nom_prenom}')" title="Bilan cumulé">📊</button>
          <button class="btn btn-red btn-sm" onclick="deleteSalaire('${s.id}')">✕</button>
        </td>
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

// ── FICHE DE PAIE PDF THERMIQUE ──────────────────
async function imprimerFichePaie(salId){
  const{data:s}=await SB.from('gp_salaires').select('*').eq('id',salId).maybeSingle();
  if(!s)return;

  // Historique complet de cet employé
  const{data:histo}=await SB.from('gp_salaires').select('mois,montant,mode,primes,avances')
    .eq('admin_id',GP_ADMIN_ID).eq('nom_prenom',s.nom_prenom)
    .order('mois',{ascending:true});

  const H=histo||[];
  const totalPercu=H.reduce((t,h)=>t+Number(h.montant||0),0);
  const totalPrimes=H.reduce((t,h)=>t+Number(h.primes||0),0);
  const moisLabel=new Date(s.mois+'-15').toLocaleDateString('fr-FR',{month:'long',year:'numeric'});
  const cfg=GP_CONFIG||{};
  const prov=cfg.nom_provenderie||'PROVENDERIE SADARI';

  const html=`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Fiche paie ${s.nom_prenom}</title>
<style>
@page{size:A5;margin:10mm}
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:Arial,sans-serif;font-size:11px;color:#000;background:#fff}
.entete{text-align:center;border-bottom:2px solid #000;padding-bottom:8px;margin-bottom:10px}
.entete h1{font-size:16px;font-weight:bold}
.entete h2{font-size:13px;font-weight:normal}
.section{margin-bottom:10px}
.section-titre{font-weight:bold;font-size:12px;background:#f0f0f0;padding:4px 8px;margin-bottom:6px}
.row{display:flex;justify-content:space-between;padding:3px 8px;border-bottom:1px solid #eee}
.row.total{font-weight:bold;background:#f8f8f8;font-size:12px}
.row.net{font-weight:bold;background:#000;color:#fff;font-size:13px;padding:6px 8px}
.histo table{width:100%;border-collapse:collapse;font-size:10px}
.histo th{background:#333;color:#fff;padding:3px 6px;text-align:left}
.histo td{padding:3px 6px;border-bottom:1px solid #ddd}
.signature{display:flex;justify-content:space-between;margin-top:16px}
.sign-box{text-align:center;flex:1}
.sign-line{border-bottom:1px solid #000;width:80%;margin:0 auto 4px}
</style></head><body>

<div class="entete">
  <h1>${prov}</h1>
  <h2>BULLETIN DE PAIE — ${moisLabel.toUpperCase()}</h2>
  ${cfg.adresse?`<div>${cfg.adresse}</div>`:''}
</div>

<div class="section">
  <div class="section-titre">INFORMATIONS EMPLOYÉ</div>
  <div class="row"><span>Nom & Prénom</span><span><strong>${s.nom_prenom}</strong></span></div>
  <div class="row"><span>Matricule</span><span>${s.matricule||'—'}</span></div>
  ${s.poste?`<div class="row"><span>Poste</span><span>${s.poste}</span></div>`:''}
  ${s.point_vente?`<div class="row"><span>Point de vente</span><span>${s.point_vente}</span></div>`:''}
  ${s.date_embauche?`<div class="row"><span>Date d'embauche</span><span>${s.date_embauche}</span></div>`:''}
  <div class="row"><span>Période</span><span>${moisLabel}</span></div>
  <div class="row"><span>Date de paiement</span><span>${s.date_paiement||today()}</span></div>
</div>

<div class="section">
  <div class="section-titre">RÉMUNÉRATION</div>
  <div class="row"><span>Salaire de base</span><span>${fmt(s.salaire_base||s.montant)} F</span></div>
  ${Number(s.primes||0)>0?`<div class="row"><span>Primes</span><span>${fmt(s.primes)} F</span></div>`:''}
  <div class="row total"><span>Brut à payer</span><span>${fmt(Number(s.salaire_base||s.montant)+Number(s.primes||0))} F</span></div>
  ${Number(s.avances||0)>0?`<div class="row"><span>Avances / Retenues</span><span>− ${fmt(s.avances)} F</span></div>`:''}
  <div class="row net"><span>NET À PAYER</span><span>${fmt(s.montant)} F</span></div>
</div>

<div class="row"><span>Mode de paiement</span><span>${s.mode==='mobile_money'?'Mobile Money':s.mode==='virement'?'Virement':s.mode==='cheque'?'Chèque':'Espèces'}</span></div>

<div class="section histo" style="margin-top:10px">
  <div class="section-titre">CUMUL DEPUIS L'EMBAUCHE</div>
  <table>
    <thead><tr><th>Mois</th><th>Salaire</th><th>Primes</th><th>Total mois</th></tr></thead>
    <tbody>
      ${H.map(h=>`<tr>
        <td>${h.mois}</td>
        <td>${fmt(h.montant)} F</td>
        <td>${fmt(h.primes||0)} F</td>
        <td>${fmt(Number(h.montant||0)+Number(h.primes||0))} F</td>
      </tr>`).join('')}
      <tr style="font-weight:bold;background:#f0f0f0">
        <td>TOTAL CUMULÉ</td>
        <td>${fmt(totalPercu)} F</td>
        <td>${fmt(totalPrimes)} F</td>
        <td>${fmt(totalPercu+totalPrimes)} F</td>
      </tr>
    </tbody>
  </table>
</div>

<div class="signature">
  <div class="sign-box">
    <div class="sign-line"></div>
    <div>Signature employeur</div>
  </div>
  <div class="sign-box">
    <div class="sign-line"></div>
    <div>Signature employé</div>
  </div>
</div>

</body></html>`;

  const win=window.open('','_blank','width=600,height=800');
  if(!win){notify('Popup bloqué — autorisez les popups','r');return;}
  win.document.write(html);
  win.document.close();
  win.focus();
  setTimeout(()=>{win.print();setTimeout(()=>win.close(),500);},400);
}

// ── ENVOI FICHE PAIE WHATSAPP ────────────────────
async function envoyerFichePayeWA(salId){
  const{data:s}=await SB.from('gp_salaires').select('*').eq('id',salId).maybeSingle();
  if(!s){notify('Salarié introuvable','r');return;}

  const tel=s.whatsapp||s.telephone||'';
  const moisLabel=new Date(s.mois+'-15').toLocaleDateString('fr-FR',{month:'long',year:'numeric'});
  const prov=GP_CONFIG?.nom_provenderie||'PROVENDA';

  const msg=`Bonjour ${s.nom_prenom} 👋

Nous avons le plaisir de vous informer que votre *fiche de paie du mois de ${moisLabel}* est disponible.

💰 *Détail de votre rémunération :*
   • Salaire de base : *${fmt(s.salaire_base||s.montant)} F*${Number(s.primes||0)>0?`
   • Primes : *${fmt(s.primes)} F*`:''}
   • Net perçu : *${fmt(s.montant)} F*
   • Mode : ${s.mode||'Espèces'}

Merci pour votre travail et votre engagement au sein de *${prov}*. 🙏

_Cordialement,_
_Direction ${prov}_`;

  if(tel){
    const paysInfo=detecterPays(tel);
    if(paysInfo.numero_whatsapp){
      window.open('https://wa.me/'+paysInfo.numero_whatsapp+'?text='+encodeURIComponent(msg),'_blank');
      return;
    }
  }
  // Pas de numéro — demander
  const num=prompt(`Numéro WhatsApp de ${s.nom_prenom} (ex: +22890000000) :`);
  if(num){
    const paysInfo=detecterPays(num.trim());
    if(paysInfo.numero_whatsapp){
      window.open('https://wa.me/'+paysInfo.numero_whatsapp+'?text='+encodeURIComponent(msg),'_blank');
    }
  }
}

// ── BILAN CUMULÉ D'UN EMPLOYÉ ─────────────────────
async function afficherBilanEmploye(nomPrenom){
  const{data:H}=await SB.from('gp_salaires').select('*')
    .eq('admin_id',GP_ADMIN_ID).eq('nom_prenom',nomPrenom)
    .order('mois',{ascending:true});

  if(!H?.length){notify('Aucun historique trouvé','r');return;}

  const totalPercu=H.reduce((t,h)=>t+Number(h.montant||0),0);
  const totalPrimes=H.reduce((t,h)=>t+Number(h.primes||0),0);
  const moisDebut=H[0].mois;
  const moisFin=H[H.length-1].mois;

  const modal=document.getElementById('modal-bilan-employe');
  if(!modal)return;
  document.getElementById('bilan-employe-contenu').innerHTML=`
    <div style="margin-bottom:14px">
      <div style="font-size:16px;font-weight:700">${nomPrenom}</div>
      <div style="font-size:11px;color:var(--textm)">${moisDebut} → ${moisFin} · ${H.length} mois</div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:14px">
      <div style="text-align:center;background:rgba(22,163,74,.08);border-radius:8px;padding:10px">
        <div style="font-size:20px;font-weight:700;color:var(--gold)">${fmt(totalPercu)} F</div>
        <div style="font-size:10px;color:var(--textm)">Total salaires perçus</div>
      </div>
      <div style="text-align:center;background:rgba(245,158,11,.08);border-radius:8px;padding:10px">
        <div style="font-size:20px;font-weight:700;color:var(--green)">${fmt(totalPrimes)} F</div>
        <div style="font-size:10px;color:var(--textm)">Total primes</div>
      </div>
      <div style="text-align:center;background:rgba(14,20,40,.6);border-radius:8px;padding:10px;grid-column:1/-1">
        <div style="font-size:22px;font-weight:700;color:var(--g6)">${fmt(totalPercu+totalPrimes)} F</div>
        <div style="font-size:10px;color:var(--textm)">Total cumulé depuis l'embauche</div>
      </div>
    </div>
    <div style="font-size:11px;font-weight:700;color:var(--g6);margin-bottom:8px">Détail mois par mois</div>
    <div style="max-height:250px;overflow-y:auto">
      <table class="tbl" style="font-size:11px">
        <thead><tr><th>Mois</th><th class="num">Salaire</th><th class="num">Primes</th><th class="num">Avances</th><th class="num">Net</th><th>Mode</th></tr></thead>
        <tbody>
          ${H.map(h=>`<tr>
            <td>${h.mois}</td>
            <td class="num" style="color:var(--gold)">${fmt(h.montant)} F</td>
            <td class="num" style="color:var(--green)">${fmt(h.primes||0)} F</td>
            <td class="num" style="color:var(--red)">${fmt(h.avances||0)} F</td>
            <td class="num" style="font-weight:700">${fmt(h.montant)} F</td>
            <td style="font-size:10px">${h.mode||'—'}</td>
          </tr>`).join('')}
        </tbody>
      </table>
    </div>`;
  modal.style.display='flex';
}

function fermerBilanEmploye(){
  document.getElementById('modal-bilan-employe').style.display='none';
}
