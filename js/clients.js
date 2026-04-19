// ── CLIENTS ────────────────────────────────────────
async function saveClient(){
  const nom=document.getElementById('cl_nom').value.trim();
  const err=document.getElementById('cl_err');
  if(!nom){err.textContent='Nom requis.';return;}
  const{error}=await SB.from('gp_clients').insert({
    admin_id:GP_ADMIN_ID,nom,
    telephone:document.getElementById('cl_tel').value.trim()||null,
    localisation:document.getElementById('cl_loc').value.trim()||null,
    type_elevage:document.getElementById('cl_type').value,
    note:document.getElementById('cl_note').value.trim()||null
  });
  if(error){err.textContent='Erreur: '+error.message;return;}
  ['cl_nom','cl_tel','cl_loc','cl_note'].forEach(id=>document.getElementById(id).value='');
  err.textContent='';
  await loadClients();populateSelects();renderClients();
  notify('Client ajouté ✓');
}
function renderClients(){
  const search=document.getElementById('cl-search')?.value.toLowerCase()||'';
  const filtered=GP_CLIENTS.filter(c=>c.nom.toLowerCase().includes(search)||(c.telephone||'').includes(search));
  document.getElementById('clients-liste').innerHTML=filtered.length?`
    <table class="tbl"><thead><tr><th>Nom</th><th>Téléphone</th><th>Type</th><th class="num">Achats</th>${GP_ROLE==='admin'?'<th class="num">Total</th>':''}<th></th></tr></thead><tbody>
    ${filtered.map(c=>`<tr>
      <td><div style="font-weight:600">${c.nom}</div><div style="font-size:10px;color:var(--textm)">${c.localisation||''}</div></td>
      <td>${c.telephone||'—'}</td>
      <td><span class="badge bdg-b" style="font-size:9px">${c.type_elevage||'—'}</span></td>
      <td class="num">${c.nb_achats||0}</td>
      ${GP_ROLE==='admin'?`<td class="num" style="color:var(--gold)">${fmt(c.total_achats||0)} F</td>`:''}
      <td><button class="btn btn-red btn-sm" onclick="deleteClient('${c.id}')">✕</button></td>
    </tr>`).join('')}</tbody></table>`:'<div style="color:var(--textm);font-size:12px">Aucun client.</div>';
}
async function deleteClient(id){
  if(!confirm('Supprimer ce client ?'))return;
  await SB.from('gp_clients').delete().eq('id',id);
  await loadClients();populateSelects();renderClients();notify('Client supprimé','r');
}

// ── SUIVI & APPELS ─────────────────────────────────
function renderSuivi(){
  const now=new Date();
  const aRelancer=GP_CLIENTS.filter(c=>{
    if(!c.dernier_achat||!c.frequence_jours)return false;
    const last=new Date(c.dernier_achat);
    const seuil=(c.frequence_jours+7);
    return Math.ceil((now-last)/86400000)>seuil;
  });
  document.getElementById('clients-relance').innerHTML=aRelancer.length?aRelancer.map(c=>{
    const joursDepuis=Math.ceil((now-new Date(c.dernier_achat))/86400000);
    return `<div style="padding:10px;background:rgba(239,68,68,.06);border:1px solid rgba(239,68,68,.2);border-radius:8px;margin-bottom:8px">
      <div style="display:flex;justify-content:space-between;align-items:flex-start">
        <div>
          <div style="font-weight:700;color:var(--text)">${c.nom}</div>
          <div style="font-size:10px;color:var(--textm);margin-top:2px">📞 ${c.telephone||'—'} · Dernier achat : ${fmtDate(c.dernier_achat)}</div>
          <div style="font-size:10px;color:var(--red);margin-top:2px">⏰ ${joursDepuis} jours sans achat (fréquence : ${c.frequence_jours}j)</div>
        </div>
        <div style="display:flex;gap:5px;flex-shrink:0">
          <button class="btn btn-out btn-sm" onclick="preFillAppel('${c.id}')" title="Enregistrer un appel">📞</button>
          <button class="btn btn-g btn-sm" onclick="ouvrirModalWA('${c.id}')" title="Envoyer un message WhatsApp">📲</button>
        </div>
      </div>
    </div>`;}).join(''):'<div style="color:var(--green);font-size:12px">✅ Tous les clients sont dans leur fréquence habituelle.</div>';

  SB.from('gp_appels').select('*').eq('admin_id',GP_ADMIN_ID).order('date_appel',{ascending:false}).limit(30).then(({data})=>{
    const A=data||[];
    document.getElementById('appels-liste').innerHTML=A.length?`
      <div style="overflow-x:auto"><table class="tbl"><thead><tr><th>Date</th><th>Client</th><th>Résultat</th><th>Note</th><th>Observation</th><th></th></tr></thead><tbody>
      ${A.map(a=>`<tr>
        <td style="font-size:10px;font-family:'DM Mono',monospace">${new Date(a.date_appel).toLocaleDateString('fr-FR')}</td>
        <td style="font-weight:600">${a.client_nom||'—'}</td>
        <td><span class="badge ${a.resultat==='interesse'||a.resultat==='commande_passee'?'bdg-g':a.resultat==='pas_repondu'||a.resultat==='bientot'?'bdg-gold':'bdg-r'}" style="font-size:9px">${a.resultat||'—'}</span></td>
        <td style="font-size:10px;color:var(--textm);max-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${a.note||'—'}</td>
        <td style="font-size:10px;color:var(--textm);max-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${a.note_observation||'—'}</td>
        <td>${a.client_id?`<button class="btn btn-g btn-sm" onclick="ouvrirModalWA('${a.client_id}')" title="WhatsApp">📲</button>`:'—'}</td>
      </tr>`).join('')}</tbody></table></div>`:'<div style="color:var(--textm);font-size:12px">Aucun appel enregistré.</div>';
  });
}

function preFillAppel(clientId){
  document.getElementById('app_client').value=clientId;
  document.getElementById('app_client').scrollIntoView({behavior:'smooth',block:'center'});
}

async function saveAppel(){
  const clientId=document.getElementById('app_client').value;
  const tel=document.getElementById('app_tel').value.trim();
  const resultatSelect=document.getElementById('app_resultat').value;
  const resultatAutre=document.getElementById('app_resultat_autre')?.value.trim();
  const resultat=resultatSelect==='autre'&&resultatAutre?resultatAutre:resultatSelect;
  const note=document.getElementById('app_note').value.trim();
  const observation=document.getElementById('app_observation')?.value.trim()||'';
  const err=document.getElementById('app_err');
  if(!clientId){err.textContent='Sélectionnez un client.';return;}
  const client=GP_CLIENTS.find(c=>c.id===clientId);
  const{error}=await SB.from('gp_appels').insert({
    admin_id:GP_ADMIN_ID,saisi_par:GP_USER.id,
    client_id:clientId,client_nom:client?.nom||'',
    client_tel:tel||client?.telephone||'',
    resultat, note,
    note_observation:observation||null
  });
  if(error){err.textContent='Erreur: '+error.message;return;}
  err.textContent='';
  document.getElementById('app_note').value='';
  document.getElementById('app_tel').value='';
  if(document.getElementById('app_observation'))document.getElementById('app_observation').value='';
  if(document.getElementById('app_resultat_autre'))document.getElementById('app_resultat_autre').value='';
  document.getElementById('app_resultat').value='interesse';
  document.getElementById('autre-resultat-champ').style.display='none';
  notify('Appel enregistré ✓','gold');
  renderSuivi();
}

// ── CLASSEMENT ─────────────────────────────────────
async function renderClassement(){
  const periode=document.getElementById('class-filtre-periode')?.value||'all';
  let q=SB.from('gp_ventes').select('client_id,client_nom,client_tel,qte_vendue,montant_total,date').eq('admin_id',GP_ADMIN_ID);
  const now=new Date();
  if(periode==='month'){const m=thisMonth();q=q.gte('date',m+'-01').lte('date',m+'-31');}
  else if(periode==='3months'){const d=new Date(now);d.setMonth(d.getMonth()-3);q=q.gte('date',d.toISOString().slice(0,10));}
  else if(periode==='year'){q=q.gte('date',now.getFullYear()+'-01-01');}
  const{data:V}=await q;
  const ventes=V||[];
  // Aggregate by client
  const stats={};
  ventes.forEach(v=>{
    const k=v.client_id||v.client_nom||'Inconnu';
    if(!stats[k])stats[k]={nom:v.client_nom||'Inconnu',tel:v.client_tel||'',nbAchats:0,totalKg:0,totalCA:0};
    stats[k].nbAchats++;
    stats[k].totalKg+=Number(v.qte_vendue||0);
    stats[k].totalCA+=Number(v.montant_total||0);
  });
  const sorted=Object.values(stats).sort((a,b)=>b.totalKg-a.totalKg);
  const totKg=sorted.reduce((s,c)=>s+c.totalKg,0);
  const totCA=sorted.reduce((s,c)=>s+c.totalCA,0);
  document.getElementById('class-kpis').innerHTML=`
    <div class="econo-box"><div class="econo-val">${sorted.length}</div><div class="econo-lbl">Clients actifs</div></div>
    <div class="econo-box"><div class="econo-val" style="color:var(--g6)">${fmt(totKg)}</div><div class="econo-lbl">Kg total vendus</div></div>
    ${GP_ROLE==='admin'?`<div class="econo-box"><div class="econo-val" style="color:var(--gold)">${fmt(totCA)}</div><div class="econo-lbl">CA total (F)</div></div>`:'<div></div>'}
    <div class="econo-box"><div class="econo-val">${totKg>0&&sorted.length>0?fmt(Math.round(totKg/sorted.length)):0}</div><div class="econo-lbl">Moy kg/client</div></div>`;
  document.getElementById('classement-liste').innerHTML=sorted.length?`
    <table class="tbl"><thead><tr><th>#</th><th>Client</th><th>Téléphone</th><th class="num">Achats</th><th class="num">Kg total</th>${GP_ROLE==='admin'?'<th class="num">CA (F)</th>':''}<th>Segment</th></tr></thead><tbody>
    ${sorted.map((c,i)=>{
      const pos=i+1;
      const cls=pos<=15?'client-vert':pos<=30?'client-jaune':'';
      const seg=pos<=15?'<span class="badge bdg-g">🥇 Top 15</span>':pos<=30?'<span class="badge bdg-gold">🥈 16-30</span>':'<span class="badge" style="background:rgba(30,45,74,.5);color:var(--textm);">Standard</span>';
      return `<tr class="${cls}"><td style="font-weight:700;color:${pos<=15?'var(--green)':pos<=30?'var(--gold)':'var(--textm)'}">#${pos}</td><td style="font-weight:600">${c.nom}</td><td>${c.tel||'—'}</td><td class="num">${c.nbAchats}</td><td class="num">${fmt(c.totalKg)} kg</td>${GP_ROLE==='admin'?`<td class="num" style="color:var(--gold)">${fmt(c.totalCA)} F</td>`:''}  <td>${seg}</td></tr>`;}).join('')}</tbody></table>`:'<div style="color:var(--textm);font-size:12px;padding:10px">Aucune vente enregistrée.</div>';
}
// ── MESSAGES WHATSAPP ──────────────────────────────
let waClientCourant = null;

function ouvrirModalWA(clientId){
  const client = GP_CLIENTS.find(c => c.id === clientId);
  if(!client){ notify('Client introuvable','r'); return; }
  waClientCourant = client;
  document.getElementById('wa-client-nom').textContent = client.nom;
  document.getElementById('wa-type').value = 'relance';
  document.getElementById('modal-wa').style.display = 'flex';
  document.getElementById('wa-promo-champ').style.display = 'none';
  document.getElementById('wa-produit-champ').style.display = 'none';
  previewWA();
}

function fermerModalWA(){
  document.getElementById('modal-wa').style.display = 'none';
  waClientCourant = null;
}

function previewWA(){
  const type = document.getElementById('wa-type').value;
  const cfg = GP_CONFIG || {};
  const client = waClientCourant;
  if(!client) return;

  // Afficher/cacher les champs selon le type
  document.getElementById('wa-promo-champ').style.display = type === 'promo' ? 'block' : 'none';
  document.getElementById('wa-produit-champ').style.display = type === 'nouveau_produit' ? 'block' : 'none';

  const prov = cfg.nom_provenderie || 'Provenderie Sadari';
  const tel = cfg.telephone || '';
  const prenom = client.nom.split(' ')[0];
  let msg = '';

  if(type === 'relance'){
    const joursAbsence = client.dernier_achat
      ? Math.floor((new Date() - new Date(client.dernier_achat)) / 86400000)
      : null;
    msg = `Bonjour ${prenom} 👋\n\n`
      + `Nous pensons à vous chez *${prov}* !\n\n`
      + (joursAbsence ? `Cela fait ${joursAbsence} jours que nous n'avons pas eu le plaisir de vous servir.\n\n` : '')
      + `Nos aliments sont disponibles et prêts à livrer. Avez-vous besoin de vous réapprovisionner ?\n\n`
      + `N'hésitez pas à nous contacter 📞 ${tel}\n\n`
      + `_${prov}_`;
  } else if(type === 'merci'){
    msg = `Bonjour ${prenom} 👋\n\n`
      + `*${prov}* tient à vous adresser ses sincères remerciements ! 🙏\n\n`
      + `Vous faites partie de nos meilleurs clients et nous sommes très fiers de votre confiance.\n\n`
      + `Votre fidélité est notre motivation pour continuer à vous offrir des aliments de qualité.\n\n`
      + `Merci et à très bientôt ! 🌾\n\n`
      + `_${prov} · ${tel}_`;
  } else if(type === 'promo'){
    const detail = document.getElementById('wa-promo-detail')?.value || 'Promotion spéciale en cours';
    msg = `🎉 *Promotion spéciale — ${prov}*\n\n`
      + `Bonjour ${prenom},\n\n`
      + `Bonne nouvelle ! *${detail}*\n\n`
      + `C'est le moment de faire vos stocks ! Contactez-nous vite pour en profiter.\n\n`
      + `📞 ${tel}\n\n`
      + `_Offre valable jusqu'à épuisement des stocks_\n`
      + `_${prov}_`;
  } else if(type === 'nouveau_produit'){
    const produit = document.getElementById('wa-produit-nom')?.value || 'Nouveau produit';
    msg = `🆕 *Nouveau produit — ${prov}*\n\n`
      + `Bonjour ${prenom},\n\n`
      + `Nous avons le plaisir de vous annoncer le lancement de notre nouveau produit :\n\n`
      + `*🌾 ${produit}*\n\n`
      + `Formulé spécialement pour maximiser les performances de vos animaux.\n\n`
      + `Contactez-nous pour plus d'informations ou pour passer votre commande :\n`
      + `📞 ${tel}\n\n`
      + `_${prov}_`;
  } else if(type==='dette'){
    // Chercher les ventes impayées du client
    const detteEl=document.getElementById('wa-preview');
    if(detteEl) detteEl.value='⏳ Calcul de la dette en cours...';
    SB.from('gp_ventes').select('montant_total,montant_paye,formule_nom,date')
      .eq('admin_id',GP_ADMIN_ID)
      .eq('client_id',client.id)
      .neq('statut_paiement','paye')
      .order('date',{ascending:false})
      .then(({data:ventes})=>{
        const V=ventes||[];
        const totalDu=V.reduce((s,v)=>s+Number(v.montant_total||0)-Number(v.montant_paye||0),0);
        const lignes=V.slice(0,5).map(v=>`• ${v.date} — ${v.formule_nom} : ${fmt(Number(v.montant_total||0)-Number(v.montant_paye||0))} F`).join('\n');
        const detteMsg=
          `Bonjour ${prenom} 👋\n\n`
          +`Nous espérons que vous allez bien.\n\n`
          +`*${cfg.nom_provenderie||'Provenderie'}* vous contacte concernant votre solde en attente.\n\n`
          +`📋 *Détail de votre solde :*\n`
          +(lignes?lignes+'\n\n':`Vous avez un règlement en attente.\n\n`)
          +`💰 *Total à régler : ${totalDu>0?fmt(totalDu)+' FCFA':'Montant à confirmer'}*\n\n`
          +`Nous vous serions reconnaissants de bien vouloir régulariser cette situation dans les meilleurs délais pour continuer à bénéficier de nos services.\n\n`
          +`Pour tout arrangement de paiement, contactez-nous :\n`
          +`📞 ${cfg.telephone||''}\n\n`
          +`Merci pour votre compréhension. 🙏\n\n`
          +`_${cfg.nom_provenderie||'Provenderie'}_`;
        if(detteEl) detteEl.value=detteMsg;
      });
    return; // retour immédiat, le .then() met à jour l'aperçu
  } else if(type==='prosp_intro'||type==='prosp_essai'||type==='prosp_suivi'||type==='prosp_parrainage'||type==='prosp_eleveur'){
    const elevage=client.type_elevage||'';
    msg=genMsgProspect(type,client.nom,elevage,'',cfg);
  } else {
    msg = `Bonjour ${prenom},\n\n\n\n_${prov}_`;
  }

  document.getElementById('wa-preview').value = msg;
}

// ── PROSPECTION ────────────────────────────────────
function genMsgProspect(type, nom, elevage, parrain, cfg){
  const prov = cfg.nom_provenderie || 'Provenderie Sadari';
  const tel  = cfg.telephone || '';
  const site = 'avifarmer.net';
  const prenom = nom ? nom.split(' ')[0] : 'Bonjour';

  if(type === 'prosp_intro'){
    return `Bonjour ${prenom} 👋\n\n`
      + `Je me permets de vous contacter de la part de *${prov}*, fabricant d'aliments pour animaux basé à Lomé.\n\n`
      + `Nous produisons des aliments de qualité pour${elevage?' *'+elevage+'*':' vos animaux'} — formulés localement avec des matières premières sélectionnées.\n\n`
      + `✅ Livraison rapide\n`
      + `✅ Prix compétitifs\n`
      + `✅ Suivi technique inclus\n\n`
      + `Seriez-vous intéressé(e) par un devis ou un échantillon ?\n\n`
      + `📞 ${tel}\n🌐 ${site}\n\n`
      + `_${prov}_`;
  }
  if(type === 'prosp_essai'){
    return `Bonjour ${prenom} 👋\n\n`
      + `*${prov}* vous offre l'opportunité de tester nos aliments sur votre élevage${elevage?' de *'+elevage+'*':''}. \n\n`
      + `🎁 *Première commande : tarif découverte*\n\n`
      + `Nos formules sont développées spécifiquement pour le contexte ouest-africain — résultats rapides sur la croissance et la ponte.\n\n`
      + `Envoyez-nous simplement votre besoin et nous vous préparons un devis sur mesure.\n\n`
      + `📞 ${tel}\n\n`
      + `_${prov}_`;
  }
  if(type === 'prosp_suivi'){
    return `Bonjour ${prenom} 👋\n\n`
      + `Suite à notre précédent échange, je souhaitais prendre de vos nouvelles et savoir si vous avez pu réfléchir à notre offre.\n\n`
      + `Nous sommes toujours disponibles pour vous accompagner dans votre élevage${elevage?' de *'+elevage+'*':''}. \n\n`
      + `N'hésitez pas à me poser toutes vos questions — nous sommes là pour vous aider à maximiser vos performances.\n\n`
      + `📞 ${tel}\n\n`
      + `_${prov}_`;
  }
  if(type === 'prosp_parrainage'){
    return `Bonjour ${prenom} 👋\n\n`
      + `*${parrain||'Un de vos collègues éleveurs'}* nous a parlé de vous et nous a recommandé de vous contacter.\n\n`
      + `Je suis de *${prov}*, fabricant d'aliments pour${elevage?' *'+elevage+'*':" animaux d'élevage"}.\n\n`
      + `Nos clients comme ${parrain||'votre collègue'} font confiance à nos produits pour leurs résultats sur la croissance et la productivité.\n\n`
      + `Je serais ravi(e) de vous faire une démonstration ou de vous envoyer un devis.\n\n`
      + `📞 ${tel}\n\n`
      + `_${prov}_`;
  }
  if(type === 'prosp_eleveur'){
    return `Bonjour ${prenom} 👋\n\n`
      + `Je vous contacte car vous êtes éleveur${elevage?' de *'+elevage+'*':''} et nous pensons pouvoir vous aider à améliorer vos résultats.\n\n`
      + `*${prov}* fabrique des aliments complets${elevage?' spécialisés pour les *'+elevage+'*':''}, adaptés aux conditions d'élevage au Togo.\n\n`
      + `💡 *Nos avantages :*\n`
      + `• Formules testées et validées localement\n`
      + `• Ingrédients de qualité contrôlée\n`
      + `• Suivi technique gratuit\n`
      + `• Livraison à domicile disponible\n\n`
      + `Puis-je vous envoyer notre catalogue de produits ?\n\n`
      + `📞 ${tel}\n🌐 ${site}\n\n`
      + `_${prov}_`;
  }
  return `Bonjour ${prenom},\n\n\n\n_${prov}_`;
}

function previewProspect(){
  const type = document.getElementById('prosp_type')?.value;
  const nom = document.getElementById('prosp_nom')?.value.trim() || 'Prospect';
  const elevage = document.getElementById('prosp_elevage')?.value || '';
  const parrain = document.getElementById('prosp_parrain')?.value.trim() || '';
  const cfg = GP_CONFIG || {};

  // Afficher/cacher champ parrain
  const parrainChamp = document.getElementById('prosp-parrain-champ');
  if(parrainChamp) parrainChamp.style.display = type === 'prosp_parrainage' ? 'block' : 'none';

  const msg = genMsgProspect(type, nom, elevage, parrain, cfg);
  const preview = document.getElementById('prosp-preview');
  if(preview) preview.value = msg;
}

function envoyerProspect(){
  const nom = document.getElementById('prosp_nom')?.value.trim();
  const tel = document.getElementById('prosp_tel')?.value.trim();
  const err = document.getElementById('prosp_err');

  if(!nom){ err.textContent = 'Entrez le nom du prospect.'; return; }
  if(!tel){ err.textContent = 'Entrez le numéro de téléphone.'; return; }
  err.textContent = '';

  const msg = document.getElementById('prosp-preview')?.value || '';
  const telClean = tel.replace(/[\s\-\+]/g,'').replace(/^00/,'').replace(/^228/,'');
  window.open(`https://wa.me/228${telClean}?text=${encodeURIComponent(msg)}`, '_blank');
}

// Aussi ajouter les types de prospection dans previewWA pour le modal existant


function envoyerWAClient(){
  const client = waClientCourant;
  if(!client){ notify('Client introuvable','r'); return; }
  const msg = document.getElementById('wa-preview').value;
  const tel = (client.telephone||'').replace(/[\s\-\+]/g,'').replace(/^00/,'').replace(/^228/,'');
  if(!tel){ notify('Ce client n\'a pas de numéro de téléphone','r'); return; }
  window.open(`https://wa.me/228${tel}?text=${encodeURIComponent(msg)}`, '_blank');
  fermerModalWA();
}

// ── AUTRE RÉSULTAT ─────────────────────────────────
function toggleAutreResultat(){
  const val = document.getElementById('app_resultat').value;
  const champ = document.getElementById('autre-resultat-champ');
  champ.style.display = val === 'autre' ? 'block' : 'none';
}
