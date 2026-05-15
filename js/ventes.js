// ══════════════════════════════════════════════════
// PROVENDA — MODULE VENTES
// ══════════════════════════════════════════════════

let VT_LIGNES=[];

function rechercherClientTel(){
  const q=document.getElementById('vt_tel_search')?.value.toLowerCase().trim()||'';
  const results=document.getElementById('vt_client_results');
  if(!results)return;

  // Si champ vide : afficher tous les clients récents
  const liste=q
    ? GP_CLIENTS.filter(c=>c.nom?.toLowerCase().includes(q)||c.telephone?.includes(q)||c.nom_ferme?.toLowerCase().includes(q))
    : GP_CLIENTS.slice(0,10);

  if(!liste.length){
    results.innerHTML='<div style="padding:10px;color:var(--textm);font-size:12px">Aucun client trouvé</div>';
    results.style.display='block';
    return;
  }

  results.innerHTML=liste.map(c=>{
    const detteBadge=Number(c.solde_impaye||0)>0?`<span style="color:var(--red);font-size:9px"> · Dette: ${fmt(c.solde_impaye)} F</span>`:'';
    return`<div onclick="selectionnerClientVente('${c.id}')"
      style="padding:10px 14px;cursor:pointer;border-bottom:1px solid rgba(30,45,74,.3);transition:background .15s"
      onmouseover="this.style.background='rgba(22,163,74,.1)'" onmouseout="this.style.background=''">
      <div style="font-weight:600;font-size:12px">${c.nom}${detteBadge}</div>
      <div style="font-size:10px;color:var(--textm)">${c.telephone||'—'} · ${c.nom_ferme||''} ${c.localite?'· '+c.localite:''} · <span class="badge ${c.type_client==='gros'?'bdg-gold':'bdg-b'}" style="font-size:8px">${c.type_client==='gros'?'GROS':'DÉTAIL'}</span></div>
    </div>`;
  }).join('');
  results.style.display='block';
}

function selectionnerClientVente(clientId){
  const c=GP_CLIENTS.find(x=>x.id===clientId);
  if(!c)return;
  document.getElementById('vt_client').value=clientId;
  document.getElementById('vt_tel_search').value=c.nom;
  document.getElementById('vt_client_results').style.display='none';

  // Badge client avec toutes les coordonnées
  const badge=document.getElementById('vt-client-badge');
  const nomEl=document.getElementById('vt-client-nom');
  const infoEl=document.getElementById('vt-client-info');
  if(badge)badge.style.display='flex';
  if(nomEl)nomEl.textContent=c.nom;

  // Afficher toutes les infos disponibles
  const infos=[];
  if(c.telephone)infos.push('📞 '+c.telephone);
  if(c.nom_ferme)infos.push('🏠 '+c.nom_ferme);
  if(c.localite)infos.push('📍 '+c.localite);
  if(c.type_client)infos.push(c.type_client==='gros'?'💼 Grossiste':'🛒 Détaillant');
  // Badge dette si client a des impayés
  const detteClt=Number(c.montant_du||0);
  if(detteClt>0)infos.push(`⚠ Dette : ${fmt(detteClt)} F`);
  if(infoEl)infoEl.innerHTML=infos.join(' · ');

  // Masquer nouveau client
  const nv=document.getElementById('vt-nouveau-client');
  if(nv)nv.style.display='none';

  // Charger le prix selon type client et formule + coût de prod
  onVenteFormuleChange();
  calcVente();
}

function effacerClientVente(){
  document.getElementById('vt_client').value='';
  document.getElementById('vt_tel_search').value='';
  const badge=document.getElementById('vt-client-badge');
  if(badge)badge.style.display='none';
  document.getElementById('vt_client_results').style.display='none';
}

function ouvrirNouveauClient(){
  const div=document.getElementById('vt-nouveau-client');
  if(!div)return;
  div.style.display=div.style.display==='none'?'block':'none';
  if(div.style.display==='block'){
    document.getElementById('vt_client').value='__nouveau__';
    document.getElementById('vt-client-badge').style.display='none';
    setTimeout(()=>document.getElementById('vt_cl_nom')?.focus(),100);
  } else {
    document.getElementById('vt_client').value='';
  }
}

function calcVenteFromSacs(){
  const nb=+document.getElementById('vt_nb_sacs')?.value||0;
  const poids=+document.getElementById('vt_poids_sac')?.value||25;
  if(nb>0&&poids!=='kg'){
    const qteEl=document.getElementById('vt_qte');
    if(qteEl)qteEl.value=nb*poids;
  }
  calcVente();
}

function calcVente(){
  const nb=+document.getElementById('vt_nb_sacs')?.value||0;
  const poids=+document.getElementById('vt_poids_sac')?.value||25;
  let qte=+document.getElementById('vt_qte')?.value||0;
  if(nb>0&&poids!=='kg'&&qte===0)qte=nb*+poids;
  const prix=+document.getElementById('vt_prix')?.value||0;
  const remis=+document.getElementById('vt_paye')?.value||0;

  // Total depuis les lignes déjà ajoutées + ligne en cours
  const totalLignes=VT_LIGNES.reduce((s,l)=>s+Number(l.montant_ligne||0),0);
  const ligneEnCours=Math.round(qte*prix);
  const total=totalLignes||(ligneEnCours);

  // Système monnaie : si remis > total → monnaie à rendre, payé conservé = total
  // Si remis < total → reste à payer
  let monnaie=0, reste=0, paye;
  if(remis >= total && total > 0){
    paye = total;
    monnaie = remis - total;
  } else {
    paye = remis;
    reste = total - remis;
  }

  // Montant total
  const totalEl=document.getElementById('vt-montant-total');
  const resteRow=document.getElementById('vt-reste-row');
  const resteEl=document.getElementById('vt-reste-du');
  const monnaieRow=document.getElementById('vt-monnaie-row');
  const monnaieEl=document.getElementById('vt-monnaie');
  mettreAJourLigneVente();
  if(totalEl)totalEl.textContent=fmt(total)+' F';

  if(monnaie > 0){
    if(monnaieRow) monnaieRow.style.display='flex';
    if(monnaieEl) monnaieEl.textContent='+'+fmt(monnaie)+' F';
    if(resteRow) resteRow.style.display='none';
  } else {
    if(monnaieRow) monnaieRow.style.display='none';
    if(resteRow) resteRow.style.display='flex';
    if(resteEl){
      resteEl.textContent=fmt(reste)+' F';
      resteEl.style.color=reste>0?'var(--red)':'var(--green)';
    }
  }

  // Statut automatique (basé sur paye conservé, pas remis)
  const statut = paye<=0 ? 'impaye' : paye>=total ? 'paye' : 'partiel';
  const badge=document.getElementById('vt-statut-badge');
  if(badge){
    const map={
      impaye:['rgba(239,68,68,.1)','var(--red)','rgba(239,68,68,.2)','⏳ Impayé'],
      partiel:['rgba(245,158,11,.1)','var(--gold)','rgba(245,158,11,.2)',`⚠ Paiement partiel — Reste : ${fmt(reste)} F`],
      paye:['rgba(22,163,74,.1)','var(--green)','rgba(22,163,74,.2)',
        monnaie>0
          ? `✅ Payé · 💰 Rendre ${fmt(monnaie)} F`
          : '✅ Payé intégralement']
    };
    const[bg,color,border,label]=map[statut];
    badge.style.background=bg;badge.style.color=color;badge.style.borderColor=border;badge.textContent=label;
  }

  // Stocker pour saveVente
  window._vtMonnaie = { total, remis, paye, monnaie, reste };
}

async function onVenteFormuleChange(){
  const nom=document.getElementById('vt_formule')?.value;
  if(!nom)return;

  // Charger le prix depuis gp_prix_formules ou GP_PRIX
  const clientId=document.getElementById('vt_client')?.value;
  const client=GP_CLIENTS.find(c=>c.id===clientId);
  const typeClient=client?.type_client||'detail';

  let prix=typeClient==='gros'?(GP_PRIX_GROS?.[nom]||GP_PRIX?.[nom]||0):(GP_PRIX?.[nom]||0);

  if(!prix){
    const{data:pf}=await SB.from('gp_prix_formules').select('prix_detail,prix_gros,cout_mo_tonne,cout_emballage_kg,cout_transport_lot')
      .eq('admin_id',GP_ADMIN_ID).eq('formule_nom',nom).maybeSingle();
    if(pf)prix=typeClient==='gros'?(pf.prix_gros||pf.prix_detail||0):(pf.prix_detail||0);
    // Afficher coût de revient estimé
    if(pf){
      const cr=(pf.cout_mo_tonne||0)/1000+(pf.cout_emballage_kg||0)+(pf.cout_transport_lot||0)/1000;
      const el=document.getElementById('vt-cout-info');
      if(el&&cr>0)el.textContent=`Coût estimé : ~${fmt(Math.round(cr))} F/kg`;
    }
  }

  const prixEl=document.getElementById('vt_prix');
  if(prixEl&&prix)prixEl.value=prix;

  calcVente();
}

async function saveVente(){
  let clientId=document.getElementById('vt_client')?.value;
  const note=document.getElementById('vt_note')?.value.trim()||null;
  const remis=+document.getElementById('vt_paye')?.value||0;
  const pv=GP_POINT_VENTE||document.getElementById('vt_pv')?.value.trim()||null;
  const err=document.getElementById('vt_err');

  if(!VT_LIGNES.length){err.textContent='Ajoutez au moins un produit.';return;}

  // ── NOUVEAU CLIENT ──────────────────────────────
  if(clientId==='__nouveau__'){
    const nom=document.getElementById('vt_cl_nom')?.value.trim();
    const prenom=document.getElementById('vt_cl_prenom')?.value.trim()||'';
    const ferme=document.getElementById('vt_cl_ferme')?.value.trim()||null;
    const localite=document.getElementById('vt_cl_localite')?.value.trim()||null;
    const tel=document.getElementById('vt_cl_tel')?.value.trim()||null;
    const typeNv=document.getElementById('vt_cl_type')?.value||'detail';
    if(!nom){err.textContent='Entrez le nom du nouveau client.';return;}
    const nomComplet=(nom+(prenom?' '+prenom:'')).trim();
    const{data:nc,error:ncErr}=await SB.from('gp_clients').insert({
      admin_id:GP_ADMIN_ID,
      nom:nomComplet,telephone:tel,
      type_client:typeNv,total_achats:0,
      nom_ferme:ferme,localite
    }).select().maybeSingle();
    if(ncErr){err.textContent='Erreur client: '+ncErr.message;return;}
    clientId=nc?.id||null;
    await loadClients();
    populateSelects();
    notify(nomComplet+' enregistré comme client ✓','gold');
  }

  const total=VT_LIGNES.reduce((s,l)=>s+l.montant_ligne,0);
  // Calcul monnaie : si remis >= total, payé conservé = total et rendu = remis - total
  const paye = remis >= total ? total : remis;
  const monnaie = remis > total ? (remis - total) : 0;
  // Statut paiement automatique
  const statut = paye<=0 ? 'impaye' : paye>=total ? 'paye' : 'partiel';

  // Déterminer type client
  const client=GP_CLIENTS.find(c=>c.id===clientId);
  const typeClient=client?.type_client||document.getElementById('vt_cl_type')?.value||'detail';

  const{data:vente,error}=await SB.from('gp_ventes').insert({
    admin_id:GP_ADMIN_ID,
    client_id:clientId||null,
    client_nom:client?.nom||'Client comptant',
    montant_total:total,
    montant_paye:paye,
    montant_remis:remis,
    monnaie_rendue:monnaie,
    statut_paiement:statut,
    type_client:typeClient,
    nb_produits:VT_LIGNES.length,
    point_vente:pv,
    note:note||null,
    date:today(),
    saisi_par:GP_USER?.id,
    formule_nom:VT_LIGNES.map(l=>l.formule_nom).join(', '),
    qte_vendue:VT_LIGNES.reduce((s,l)=>s+Number(l.quantite||0),0)||0,
    prix_unitaire:VT_LIGNES.length?VT_LIGNES[0].prix_unitaire||0:0
  }).select().maybeSingle();

  if(error){err.textContent='Erreur: '+error.message;return;}

  // Insérer les lignes
  await SB.from('gp_ventes_lignes').insert(
    VT_LIGNES.map(l=>({
      vente_id:vente.id,admin_id:GP_ADMIN_ID,
      formule_nom:l.formule_nom,quantite:l.quantite,
      prix_unitaire:l.prix_unitaire,montant_ligne:l.montant_ligne,
      type_prix:l.type_prix,
      type_produit:l.type_produit||'formule',
      ingredient_id:l.ingredient_id||null
    }))
  );

  // Décrément stock MP pour les lignes type 'mp'
  for(const l of VT_LIGNES){
    if(l.type_produit==='mp' && l.ingredient_id){
      await SB.from('gp_stock_mp').insert({
        admin_id:GP_ADMIN_ID,
        saisi_par:GP_USER?.id,
        type:'sortie_vente',
        date:today(),
        ingredient_id:l.ingredient_id,
        ingredient_nom:l.formule_nom,
        quantite:l.quantite,
        prix_unit:l.prix_unitaire,
        ref:'Vente '+vente.id.slice(0,8)
      });
    }
  }

  // Mouvement caisse automatique
  if(paye>0){
    const{data:caisses}=await SB.from('gp_caisses').select('id')
      .eq('admin_id',GP_ADMIN_ID)
      .eq('point_vente',pv||'').maybeSingle();
    if(caisses){
      await SB.from('gp_mouvements_caisse').insert({
        admin_id:GP_ADMIN_ID,caisse_id:caisses.id,
        type:'entree',categorie:'vente',
        montant:paye,date_mouvement:today(),
        description:'Vente '+vente.id.slice(0,8),
        vente_id:vente.id,
        enregistre_par:GP_USER?.id,
        enregistre_par_nom:GP_USER?.email?.split('@')[0]
      });
    }
  }

  // Déduire du stock PDV si applicable (uniquement pour les formules, pas les MP)
  if(GP_POINT_VENTE){
    for(const l of VT_LIGNES){
      if(l.type_produit==='mp') continue; // les MP sont déjà décrémentées dans gp_stock_mp
      const{data:stock}=await SB.from('gp_stock_produits_pdv').select('*')
        .eq('admin_id',GP_ADMIN_ID).eq('pdv_nom',GP_POINT_VENTE)
        .eq('formule_nom',l.formule_nom).maybeSingle();
      if(stock){
        const newQte=Math.max(0,Number(stock.qte_disponible)-Number(l.quantite));
        await SB.from('gp_stock_produits_pdv').update({qte_disponible:newQte,updated_at:new Date().toISOString()})
          .eq('id',stock.id);
        // Vérifier seuil critique
        if(newQte<=stock.seuil_critique){
          envoyerAlerteSeuil(GP_POINT_VENTE,l.formule_nom,newQte,stock.seuil_critique);
        }
      }
    }
  }

  const lignes_a_insert=VT_LIGNES.slice();
  VT_LIGNES=[];renderLignesVente();
  ['vt_note','vt_paye'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});
  document.getElementById('vt_client').value='';
  err.textContent='';

  // Notification claire (rappel monnaie si applicable)
  if(monnaie > 0){
    notify(`✅ Vente enregistrée — 💰 Rendre ${fmt(monnaie)} F au client`, 'gold');
  } else {
    notify('✅ Vente enregistrée', 'gold');
  }

  // Afficher bloc d'actions (Imprimer + WhatsApp) sous le formulaire
  afficherActionsApresVente({...vente, lignes: lignes_a_insert}, client, total, remis, paye, monnaie);

  renderVentes();
}

// ── BLOC D'ACTIONS APRÈS VENTE (Imprimer + WhatsApp + SMS) ──
function afficherActionsApresVente(venteComplete, client, total, remis, paye, monnaie){
  const old = document.getElementById('vt-post-vente');
  if(old) old.remove();

  const tel = client?.whatsapp || client?.telephone || '';
  const hasContact = !!tel;

  window._lastVenteData = venteComplete;
  window._lastVenteClient = client;

  const block = document.createElement('div');
  block.id = 'vt-post-vente';
  block.style.cssText = `
    background:linear-gradient(135deg,rgba(22,163,74,.12),rgba(245,158,11,.06));
    border:1px solid rgba(22,163,74,.4);border-radius:10px;
    padding:14px;margin-top:12px`;

  const ref = venteComplete.id?.slice(0,8) || '—';
  const monnaieBlock = monnaie > 0
    ? `<div style="background:rgba(22,163,74,.18);border:1px solid rgba(22,163,74,.4);border-radius:8px;padding:10px;margin-bottom:10px;text-align:center;font-weight:700;color:var(--green);font-size:14px">
        💰 Monnaie à rendre au client : ${fmt(monnaie)} F
      </div>` : '';

  block.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:10px">
      <div>
        <div style="font-weight:700;font-size:13px;color:var(--green)">✅ Vente enregistrée</div>
        <div style="font-size:11px;color:var(--textm)">N°${ref} · ${client?.nom||'Client comptant'} · ${fmt(total)} F</div>
      </div>
      <button onclick="document.getElementById('vt-post-vente').remove()"
        style="background:none;border:none;color:var(--textm);font-size:18px;cursor:pointer;padding:0;margin-left:8px">✕</button>
    </div>
    ${monnaieBlock}
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
      <button id="post-vente-print"
        onclick="actionImprimerVente('${venteComplete.id}')"
        style="min-height:44px;padding:10px;border-radius:8px;cursor:pointer;font-family:'Outfit',sans-serif;font-weight:700;font-size:13px;background:#1b5e20;color:white;border:none">
        🖨️ Imprimer reçu
      </button>
      <button id="post-vente-wa"
        onclick="ouvrirPreviewWA('${venteComplete.id}')"
        style="min-height:44px;padding:10px;border-radius:8px;cursor:pointer;font-family:'Outfit',sans-serif;font-weight:700;font-size:13px;background:#25D366;color:white;border:none">
        📲 WhatsApp${hasContact?'':' <small style="font-size:9px;opacity:.8">(num. manuel)</small>'}
      </button>
      <button id="post-vente-sms"
        onclick="actionEnvoyerSMS('${venteComplete.id}')"
        style="grid-column:span 2;min-height:38px;padding:8px;border-radius:8px;cursor:pointer;font-family:'Outfit',sans-serif;font-weight:600;font-size:12px;background:rgba(59,130,246,.15);color:#93c5fd;border:1px solid rgba(59,130,246,.4)"
        ${hasContact?'':'disabled'}>
        💬 Envoyer SMS de secours${hasContact?'':' (numéro client manquant)'}
      </button>
    </div>
    <div style="font-size:10px;color:var(--textm);margin-top:8px;text-align:center">
      ℹ️ Le message WhatsApp s'adapte au profil client (fidèle/nouveau/dette). SMS = secours si WA absent.
    </div>
  `;

  const errEl = document.getElementById('vt_err');
  if(errEl && errEl.parentNode){
    errEl.parentNode.insertBefore(block, errEl.nextSibling);
  }

  setTimeout(() => {
    const b = document.getElementById('vt-post-vente');
    if(b) b.remove();
  }, 180000); // 3 minutes
}

// ── ACTION IMPRIMER (avec marquage en DB) ──
async function actionImprimerVente(venteId){
  imprimerRecuThermique(window._lastVenteData);
  await SB.from('gp_ventes').update({
    recu_imprime: true,
    recu_imprime_at: new Date().toISOString()
  }).eq('id', venteId);
  const btn = document.getElementById('post-vente-print');
  if(btn){
    btn.style.background = 'rgba(22,163,74,.3)';
    btn.style.opacity = '.7';
    btn.innerHTML = '✓ Reçu imprimé';
  }
}

// ── IMPRESSION DEPUIS DASHBOARD (charge la vente depuis DB) ──
async function imprimerDepuisDashboard(venteId){
  const{data:v} = await SB.from('gp_ventes').select('*').eq('id', venteId).maybeSingle();
  if(!v){ notify('Vente introuvable', 'r'); return; }
  const{data:lignes} = await SB.from('gp_ventes_lignes').select('*').eq('vente_id', venteId);
  imprimerRecuThermique({...v, lignes: lignes||[]});
  await SB.from('gp_ventes').update({
    recu_imprime: true,
    recu_imprime_at: new Date().toISOString()
  }).eq('id', venteId);
  notify('Reçu envoyé à l\'impression ✓', 'gold');
  // Re-render dashboard pour refléter
  if(typeof renderDashboard === 'function') setTimeout(renderDashboard, 1500);
}

// ── ACTION SMS DE SECOURS ──
async function actionEnvoyerSMS(venteId){
  const v = window._lastVenteData;
  const client = window._lastVenteClient;
  const tel = client?.whatsapp || client?.telephone;
  if(!tel){
    const num = prompt('Numéro de téléphone du client :');
    if(!num) return;
  }
  const total = Number(v.montant_total||0);
  const paye = Number(v.montant_paye||0);
  const reste = total - paye;
  const prov = GP_CONFIG?.nom_provenderie || 'PROVENDA';
  const ref = v.id.slice(0,8);
  // Message SMS court (160 car max recommandé)
  const msg = reste > 0
    ? `${prov}: Merci pour votre achat n°${ref} du ${v.date}. Total ${fmt(total)}F, payé ${fmt(paye)}F, reste dû ${fmt(reste)}F. Tel: ${GP_CONFIG?.telephone||''}`
    : `${prov}: Merci pour votre achat n°${ref} du ${v.date}. Total ${fmt(total)}F entièrement réglé. A bientôt!`;

  const num = tel || prompt('Numéro de téléphone :');
  if(!num) return;
  const p = detecterPays(num.trim());
  const numClean = p.numero_complet?.replace('+','') || num;

  // Ouvrir SMS app native
  window.open(`sms:+${numClean}?body=${encodeURIComponent(msg)}`, '_blank');

  // Marquer
  await SB.from('gp_ventes').update({
    sms_envoye: true,
    sms_envoye_at: new Date().toISOString()
  }).eq('id', venteId);
  const btn = document.getElementById('post-vente-sms');
  if(btn){
    btn.style.background = 'rgba(59,130,246,.3)';
    btn.style.opacity = '.7';
    btn.innerHTML = '✓ SMS envoyé';
  }
}

// ── PRÉVISUALISATION + ÉDITION DU MESSAGE WHATSAPP ──
async function ouvrirPreviewWA(venteId){
  const{data:v} = await SB.from('gp_ventes').select('*').eq('id',venteId).maybeSingle();
  if(!v) return;
  const{data:lignes} = await SB.from('gp_ventes_lignes').select('*').eq('vente_id',venteId);
  const{data:histo} = await SB.from('gp_ventes').select('montant_total,date,formule_nom')
    .eq('admin_id',GP_ADMIN_ID).eq('client_id',v.client_id||'').order('date',{ascending:false}).limit(10);

  const client = GP_CLIENTS.find(c=>c.id===v.client_id);
  const tel = client?.whatsapp || client?.telephone || '';
  const total = Number(v.montant_total||0);
  const paye = Number(v.montant_paye||0);
  const reste = Math.max(0, total-paye);
  const prov = GP_CONFIG?.nom_provenderie || 'PROVENDA';
  const H = histo || [];
  const nbAchats = H.length;
  const totalHistorique = H.reduce((s,x)=>s+Number(x.montant_total||0),0);
  const localite = client?.localite || '';
  const L = lignes || [];
  const produitsLine = L.map(l=>`   🌾 ${l.formule_nom} — ${l.quantite} kg × ${fmt(l.prix_unitaire)} F = *${fmt(l.montant_ligne)} F*`).join('\n');
  const especeEmoji = {pondeuse:'🐔',chair:'🐔',lapin:'🐰',porc:'🐷',canard:'🦆',tilapia:'🐟',goliath:'🐟'};
  const formuleStr = L.map(l=>l.formule_nom).join(', ');
  const especeIcon = Object.entries(especeEmoji).find(([k])=>formuleStr.toLowerCase().includes(k))?.[1] || '🌾';

  const msg = reste>0
    ? construireMessageRappelDette(v, produitsLine, total, paye, reste, prov, localite, nbAchats, especeIcon, nbAchats>=5)
    : construireMessageRemerciement(v, produitsLine, total, prov, localite, nbAchats, totalHistorique, especeIcon, nbAchats>=5, totalHistorique>=500000, nbAchats<=1);

  // Ouvrir modal
  const modal = document.getElementById('modal-preview-wa');
  document.getElementById('pwa-tel').value = tel;
  document.getElementById('pwa-message').value = msg;
  document.getElementById('pwa-vente-id').value = venteId;
  document.getElementById('pwa-client-nom').textContent = client?.nom || 'Client';
  modal.style.display = 'flex';
}

function fermerPreviewWA(){
  document.getElementById('modal-preview-wa').style.display = 'none';
}

async function envoyerWAPreview(){
  const tel = document.getElementById('pwa-tel').value.trim();
  const msg = document.getElementById('pwa-message').value;
  const venteId = document.getElementById('pwa-vente-id').value;
  if(!tel){
    alert('Saisissez un numéro de téléphone');
    return;
  }
  if(!msg.trim()){
    alert('Le message est vide');
    return;
  }
  const p = detecterPays(tel);
  const url = 'https://wa.me/' + p.numero_whatsapp + '?text=' + encodeURIComponent(msg);
  window.open(url, '_blank');
  // Marquer
  await SB.from('gp_ventes').update({
    wa_envoye: true,
    wa_envoye_at: new Date().toISOString()
  }).eq('id', venteId);
  const btn = document.getElementById('post-vente-wa');
  if(btn){
    btn.style.background = 'rgba(37,211,102,.3)';
    btn.style.opacity = '.7';
    btn.innerHTML = '✓ WhatsApp envoyé';
  }
  fermerPreviewWA();
}

async function renderVentes(){
  const filtDate=document.getElementById('vt-filtre-date')?.value||'';
  const filtStatut=document.getElementById('vt-filtre-statut')?.value||'';
  let q=SB.from('gp_ventes').select('*').eq('admin_id',GP_ADMIN_ID).order('created_at',{ascending:false}).limit(50);
  if(filtDate)q=q.eq('date',filtDate);
  if(filtStatut)q=q.eq('statut_paiement',filtStatut);
  const{data}=await q;
  const V=data||[];
  document.getElementById('ventes-liste').innerHTML=V.length?`<table class="tbl" style="font-size:11px"><thead><tr><th>Date</th><th>Client</th><th>Formule</th><th class="num">Qté (kg)</th>${GP_ROLE==='admin'?'<th class="num">Total</th>':''}<th>Statut</th><th></th></tr></thead><tbody>
    ${V.map(v=>`<tr>
      <td style="font-family:'DM Mono',monospace;font-size:10px">${v.date}</td>
      <td><div style="font-weight:600">${v.client_nom||'—'}</div><div style="font-size:9px;color:var(--textm)">${v.client_tel||''}</div></td>
      <td style="font-size:10px">${ESPECE_ICON[v.espece]||''} ${v.formule_nom||'—'}</td>
      <td class="num">${fmtKg(v.qte_vendue)}</td>
      ${GP_ROLE==='admin'?`<td class="num" style="color:var(--gold)">${fmt(v.montant_total)} F</td>`:''}
      <td><span class="badge ${v.statut_paiement==='paye'?'bdg-g':v.statut_paiement==='partiel'?'bdg-gold':'bdg-r'}">${v.statut_paiement==='paye'?'✅':'⚠'}</span></td>
      <td style="display:flex;gap:4px;flex-wrap:wrap">
        <button class="btn btn-out btn-sm" onclick="envoyerWAVente('${v.id}')" title="WhatsApp" style="color:#25D366;border-color:rgba(37,211,102,.3);padding:4px 7px">📲</button>
        <button class="btn btn-print btn-sm" onclick="imprimerVente('${encodeURIComponent(JSON.stringify(v))}')">🖨️</button>
        ${GP_ROLE==='admin'?`
          <button class="btn btn-out btn-sm" onclick="ouvrirModifierVente('${v.id}')" title="Modifier" style="padding:4px 7px">✏️</button>
          <button class="btn btn-red btn-sm" onclick="supprimerVente('${v.id}')" style="padding:4px 7px">✕</button>
        `:''}
      </td>
    </tr>`).join('')}</tbody></table>`:'<div style="color:var(--textm);font-size:12px;padding:10px">Aucune vente.</div>';
}

async function updateVentesKPIs(){
  const{data:V}=await SB.from('gp_ventes').select('*').eq('admin_id',GP_ADMIN_ID).gte('date',today()).lte('date',today());
  const vd=V||[];
  const ca=vd.reduce((s,v)=>s+Number(v.montant_total||0),0);
  const impaye=vd.reduce((s,v)=>s+(Number(v.montant_total||0)-Number(v.montant_paye||0)),0);
  document.getElementById('ventes-kpis').innerHTML=`
    <div class="econo-box"><div class="econo-val">${vd.length}</div><div class="econo-lbl">Ventes du jour</div></div>
    <div class="econo-box"><div class="econo-val" style="color:var(--gold)">${GP_ROLE==='admin'?fmt(ca)+' F':'—'}</div><div class="econo-lbl">CA du jour</div></div>
    <div class="econo-box"><div class="econo-val" style="color:${impaye>0?'var(--red)':'var(--green)'}">${GP_ROLE==='admin'?fmt(impaye)+' F':'—'}</div><div class="econo-lbl">Impayés du jour</div></div>
    <div class="econo-box"><div class="econo-val">${vd.reduce((s,v)=>s+Number(v.qte_vendue||0),0).toFixed(0)}</div><div class="econo-lbl">Kg vendus</div></div>`;
}

async function renderDep(){
  const filtMois=document.getElementById('dep-filtre-mois')?.value||thisMonth();
  let q=SB.from('gp_depenses').select('*').eq('admin_id',GP_ADMIN_ID).order('date',{ascending:false}).limit(100);
  if(filtMois)q=q.gte('date',filtMois+'-01').lte('date',finMois(filtMois));
  const{data}=await q;
  const D=data||[];
  const total=D.reduce((s,d)=>s+Number(d.montant||0),0);
  document.getElementById('dep-liste').innerHTML=`
    ${GP_ROLE==='admin'?`<div style="font-size:11px;color:var(--textm);margin-bottom:8px">Total : <strong style="color:var(--red)">${fmt(total)} FCFA</strong></div>`:''}
    <div style="overflow-x:auto">${D.length?`<table class="tbl" style="font-size:11px"><thead><tr><th>Date</th><th>Catégorie</th><th>Description</th><th>Bénéficiaire</th>${GP_ROLE==='admin'?'<th class="num">Montant</th>':''}<th></th></tr></thead><tbody>
    ${D.map(d=>`<tr>
      <td style="font-size:10px">${d.date}</td>
      <td><span class="badge bdg-gold" style="font-size:9px">${CAT_LABELS[d.categorie]||d.categorie}</span></td>
      <td>${d.description}</td>
      <td style="color:var(--textm);font-size:10px">${d.beneficiaire||'—'}</td>
      ${GP_ROLE==='admin'?`<td class="num" style="color:var(--red)">${fmt(d.montant)} F</td>`:''}
      <td><button class="btn btn-red btn-sm" onclick="deleteDep('${d.id}')">✕</button></td>
    </tr>`).join('')}</tbody></table>`:'<div style="color:var(--textm);font-size:12px;padding:10px">Aucune dépense.</div>'}</div>`;
}

async function saveDep(){
  const desc=document.getElementById('dep_desc').value.trim();
  const montant=+document.getElementById('dep_montant').value||0;
  const date=document.getElementById('dep_date').value;
  const err=document.getElementById('dep_err');
  if(!desc||!montant||!date){err.textContent='Description, montant et date requis.';return;}
  const{error}=await SB.from('gp_depenses').insert({
    admin_id:GP_ADMIN_ID,saisi_par:GP_USER.id,date,
    categorie:document.getElementById('dep_cat').value,
    description:desc,montant,
    beneficiaire:document.getElementById('dep_benef').value.trim()||null,
    point_vente:document.getElementById('dep_pv').value.trim()||null
  });
  if(error){err.textContent='Erreur: '+error.message;return;}
  err.textContent='';
  ['dep_desc','dep_montant','dep_benef','dep_pv'].forEach(id=>document.getElementById(id).value='');
  notify('Dépense enregistrée ✓','gold');
  await renderDep();
}

async function deleteDep(id){
  if(!confirm('Supprimer cette dépense ?'))return;
  await SB.from('gp_depenses').delete().eq('id',id);
  renderDep();notify('Dépense supprimée','r');
}

function mettreAJourLigneVente(){} // stub — mise à jour manuelle uniquement

// ── BASCULE TYPE PRODUIT (formule / matière première) ──
function basculerTypeProduitVente(type){
  document.getElementById('vt_type_produit').value = type;
  const btnF = document.getElementById('vt_type_formule_btn');
  const btnM = document.getElementById('vt_type_mp_btn');
  const wrapF = document.getElementById('vt-formule-wrap');
  const wrapM = document.getElementById('vt-mp-wrap');
  const actif = 'background:rgba(22,163,74,.15);border:1px solid rgba(22,163,74,.4);color:var(--g6)';
  const inactif = 'background:rgba(30,45,74,.4);border:1px solid var(--border);color:var(--textm)';
  if(type === 'mp'){
    btnF.style.cssText = btnF.style.cssText.replace(actif, '') + ';' + inactif;
    btnM.style.cssText = btnM.style.cssText.replace(inactif, '') + ';' + actif;
    wrapF.style.display = 'none';
    wrapM.style.display = 'block';
    populateSelectMPVente();
  } else {
    btnF.style.cssText = btnF.style.cssText.replace(inactif, '') + ';' + actif;
    btnM.style.cssText = btnM.style.cssText.replace(actif, '') + ';' + inactif;
    wrapF.style.display = 'block';
    wrapM.style.display = 'none';
  }
  // Reset champs prix/qté
  ['vt_qte','vt_nb_sacs','vt_prix'].forEach(id => {
    const el = document.getElementById(id); if(el) el.value = '';
  });
  document.getElementById('vt-cout-info').textContent = '';
}

// Précharge MP + stock en mémoire (appelé au passage en mode "MP")
async function populateSelectMPVente(){
  // Fetch direct des MP (resync si désynchronisé)
  const{data:ingrFresh, error:errI} = await SB.from('gp_ingredients').select('*')
    .eq('admin_id', GP_ADMIN_ID).order('nom');
  if(errI){
    document.getElementById('vt-mp-stock-info').innerHTML =
      `<span style="color:var(--red)">⚠ Erreur : ${errI.message}</span>`;
    return;
  }
  if(ingrFresh && ingrFresh.length) GP_INGREDIENTS = ingrFresh;
  // Niveaux de stock toujours frais
  const{data:S} = await SB.from('gp_stock_mp').select('*').eq('admin_id', GP_ADMIN_ID);
  window._stockNiveaux = S || [];
  if(!ingrFresh || !ingrFresh.length){
    document.getElementById('vt-mp-stock-info').innerHTML =
      '<span style="color:var(--gold)">⚠ Aucune matière première dans votre base.</span>';
  }
  // Reset champ recherche
  const search = document.getElementById('vt_mp_search');
  if(search) search.value = '';
  document.getElementById('vt_mp_id').value = '';
  const sel = document.getElementById('vt_mp_selected');
  if(sel){ sel.style.display = 'none'; sel.innerHTML = ''; }
  document.getElementById('vt_mp_results').style.display = 'none';
}

// Filtre dynamique des MP (au tap) — insensible aux accents
function filtrerIngrVente(){
  const q = normalizeSearch(document.getElementById('vt_mp_search')?.value || '');
  const results = document.getElementById('vt_mp_results');
  if(!results) return;

  const niveaux = (typeof calcNiveaux === 'function')
    ? calcNiveaux(window._stockNiveaux || []) : {};

  let liste = [...(GP_INGREDIENTS||[])];
  if(q) liste = liste.filter(i => normalizeSearch(i.nom).includes(q));
  // Trier : ceux en stock d'abord, puis alpha
  liste.sort((a,b) => {
    const sa = niveaux[a.nom] || 0;
    const sb = niveaux[b.nom] || 0;
    if((sa>0) !== (sb>0)) return sa>0 ? -1 : 1;
    return a.nom.localeCompare(b.nom);
  });
  liste = liste.slice(0, 12);

  if(!liste.length){
    results.innerHTML = '<div style="padding:10px;color:var(--textm);font-size:11px;text-align:center">Aucun résultat</div>';
    results.style.display = 'block';
    return;
  }

  results.innerHTML = liste.map(i => {
    const stock = niveaux[i.nom] || 0;
    const enRupture = stock <= 0;
    const seuil = i.seuil_alerte || 200;
    const faible = stock > 0 && stock < seuil;
    let badge, bgColor;
    if(enRupture){
      badge = '<span style="background:rgba(239,68,68,.2);color:var(--red);border:1px solid rgba(239,68,68,.4);padding:1px 8px;border-radius:10px;font-size:9px;font-weight:700">🚫 RUPTURE</span>';
      bgColor = 'rgba(239,68,68,.06)';
    } else if(faible){
      badge = `<span style="background:rgba(245,158,11,.15);color:var(--gold);border:1px solid rgba(245,158,11,.3);padding:1px 8px;border-radius:10px;font-size:9px;font-weight:700">⬇ FAIBLE</span>`;
      bgColor = 'rgba(245,158,11,.04)';
    } else {
      badge = '<span style="background:rgba(22,163,74,.15);color:var(--green);padding:1px 8px;border-radius:10px;font-size:9px">✓ OK</span>';
      bgColor = '';
    }
    const cursorStyle = enRupture ? 'cursor:not-allowed;opacity:.5' : 'cursor:pointer';
    const onclick = enRupture
      ? `onclick="notify('🚫 ${i.nom.replace(/'/g,"\\'").replace(/"/g,'&quot;')} en rupture — vente impossible','r')"`
      : `onclick="selectionnerIngrVente('${i.id}','${i.nom.replace(/'/g,"\\'").replace(/"/g,'&quot;')}',${i.prix_actuel||0},${stock})"`;
    return `<div ${onclick}
      style="padding:9px 12px;${cursorStyle};border-bottom:1px solid rgba(30,45,74,.4);background:${bgColor};transition:background .15s"
      onmouseover="if(${!enRupture})this.style.background='rgba(22,163,74,.1)'"
      onmouseout="this.style.background='${bgColor}'">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:8px">
        <div style="flex:1;min-width:0">
          <div style="font-size:12px;font-weight:600;color:${enRupture?'var(--red)':'var(--text)'}">${i.nom}</div>
          <div style="font-size:10px;color:${enRupture?'var(--red)':'var(--textm)'}">${fmtKg(stock)} kg en stock · ${fmt(i.prix_actuel||0)} F/kg</div>
        </div>
        ${badge}
      </div>
    </div>`;
  }).join('');
  results.style.display = 'block';
}

function selectionnerIngrVente(id, nom, prix, stock){
  document.getElementById('vt_mp_id').value = id;
  document.getElementById('vt_mp_search').value = nom;
  document.getElementById('vt_mp_results').style.display = 'none';
  const sel = document.getElementById('vt_mp_selected');
  if(sel){
    sel.style.display = 'flex';
    sel.style.justifyContent = 'space-between';
    sel.style.alignItems = 'center';
    sel.innerHTML = `<span>✓ ${nom}</span><button onclick="effacerSelectionMPVente()" style="background:none;border:none;color:var(--textm);cursor:pointer;font-size:14px">✕</button>`;
  }
  document.getElementById('vt-mp-stock-info').innerHTML =
    `📊 Stock : <strong>${fmtKg(stock)} kg</strong> · Prix d'achat : <strong>${fmt(prix)} F/kg</strong>`;
  // Pré-remplir le prix de vente
  const prixEl = document.getElementById('vt_prix');
  if(prixEl && !prixEl.value) prixEl.value = prix;
  document.getElementById('vt-cout-info').textContent =
    prix ? `Coût : ${fmt(prix)} F/kg` : '';
  // Stock pour blocage à l'ajout
  window._vtMPStock = stock;
  document.getElementById('vt_qte')?.focus();
  calcVente();
}

function effacerSelectionMPVente(){
  document.getElementById('vt_mp_id').value = '';
  document.getElementById('vt_mp_search').value = '';
  const sel = document.getElementById('vt_mp_selected');
  if(sel){ sel.style.display = 'none'; sel.innerHTML = ''; }
  document.getElementById('vt-mp-stock-info').textContent = '';
  document.getElementById('vt-cout-info').textContent = '';
  window._vtMPStock = undefined;
}

// Fermer la liste si clic ailleurs
document.addEventListener('click', e => {
  const search = document.getElementById('vt_mp_search');
  const results = document.getElementById('vt_mp_results');
  if(search && results && !search.contains(e.target) && !results.contains(e.target)){
    results.style.display = 'none';
  }
});

function ajouterLigneVente(){
  const err = document.getElementById('vt_err');
  const typeProduit = document.getElementById('vt_type_produit')?.value || 'formule';

  // Récupérer le produit selon le type
  let produitNom, ingredientId = null;
  if(typeProduit === 'mp'){
    ingredientId = document.getElementById('vt_mp_id')?.value;
    if(!ingredientId){ err.textContent = 'Sélectionnez une matière première.'; return; }
    produitNom = document.getElementById('vt_mp_search')?.value || 'Matière première';

    // Blocage rupture
    const stockDispo = window._vtMPStock || 0;
    if(stockDispo <= 0){
      err.textContent = `🚫 ${produitNom} en rupture de stock — vente impossible.`;
      return;
    }
    // Vérifier qté demandée vs stock dispo (warning, pas blocage strict)
    const qteSaisie = +document.getElementById('vt_qte')?.value || 0;
    if(qteSaisie > stockDispo){
      if(!confirm(`⚠ Stock insuffisant : ${fmtKg(stockDispo)} kg dispo, vous voulez vendre ${qteSaisie} kg.\nContinuer quand même (créera un stock négatif) ?`)){
        return;
      }
    }
  } else {
    produitNom = document.getElementById('vt_formule')?.value;
    if(!produitNom){ err.textContent = 'Sélectionnez une formule.'; return; }
  }

  const cond = document.getElementById('vt_poids_sac')?.value || 'kg';
  const nbSacs = cond !== 'kg' ? +document.getElementById('vt_nb_sacs')?.value || 0 : 0;
  let qte = +document.getElementById('vt_qte')?.value || 0;
  if(cond !== 'kg' && nbSacs > 0 && qte === 0) qte = nbSacs * +cond;
  if(!qte || qte <= 0){ err.textContent = 'Entrez une quantité.'; return; }

  const prixUnit = +document.getElementById('vt_prix')?.value || 0;
  if(!prixUnit){ err.textContent = 'Le prix/kg est requis.'; return; }

  // Construire la ligne (formule_nom sert d'étiquette dans tous les cas)
  const ligne = {
    formule_nom: produitNom,
    quantite: qte,
    prix_unitaire: prixUnit,
    montant_ligne: Math.round(qte * prixUnit),
    conditionnement: cond,
    nb_sacs: nbSacs,
    type_produit: typeProduit,         // 'formule' ou 'mp'
    ingredient_id: ingredientId,        // null si formule
    type_prix: 'detail',                // par défaut
  };

  // Si même produit existe déjà — mise à jour
  const idx = VT_LIGNES.findIndex(l =>
    l.formule_nom === produitNom && l.type_produit === typeProduit
  );
  if(idx >= 0){
    VT_LIGNES[idx] = ligne;
    notify('Ligne mise à jour ✓', 'gold');
  } else {
    VT_LIGNES.push(ligne);
  }

  // Reset champs
  ['vt_qte','vt_nb_sacs','vt_prix'].forEach(id => {
    const el = document.getElementById(id); if(el) el.value = '';
  });
  if(typeProduit === 'formule'){
    document.getElementById('vt_formule').value = '';
    const fs = document.getElementById('vt_formule_search'); if(fs) fs.value = '';
  } else {
    effacerSelectionMPVente();
  }
  err.textContent = '';
  calcVente();
  renderLignesVente();
}

async function supprimerLigneVente(idx){
  VT_LIGNES.splice(idx,1);
  renderLignesVente();
}

async function renderLignesVente(){
  const total=VT_LIGNES.reduce((s,l)=>s+l.montant_ligne,0);
  const container=document.getElementById('vt-lignes-preview');
  if(!container)return;
  container.innerHTML=VT_LIGNES.length?`<table class="tbl" style="font-size:11px;margin-top:8px">
      <thead><tr><th>Produit</th><th>Cond.</th><th class="num">Qté</th><th class="num">Prix/kg</th><th class="num">Montant</th><th></th></tr></thead>
      <tbody>
      ${VT_LIGNES.map((l,i)=>`<tr>
        <td style="font-weight:600">${l.type_produit==='mp'?'🌾 ':''}${l.formule_nom}
          <span class="badge ${l.type_produit==='mp'?'bdg-b':l.type_prix==='gros'?'bdg-gold':'bdg-g'}" style="font-size:8px;margin-left:4px">${l.type_produit==='mp'?'MP':l.type_prix||'detail'}</span>
        </td>
        <td class="num">${l.quantite}</td>
        <td class="num">${fmt(l.prix_unitaire)} F</td>
        <td class="num" style="color:var(--gold)">${fmt(l.montant_ligne)} F</td>
        <td><button class="btn btn-red btn-sm" onclick="supprimerLigneVente(${i})">✕</button></td>
      </tr>`).join('')}
      <tr style="font-weight:700">
        <td colspan="3">TOTAL</td>
        <td class="num" style="color:var(--gold)">${fmt(total)} F</td>
        <td></td>
      </tr>
      </tbody>
    </table>`:'';
}

async function onClientChange(){
  const val=document.getElementById('vt_client').value;
  document.getElementById('vt-nouveau-client').style.display=val==='__nouveau__'?'block':'none';
}

async function checkPendingRemises(){
  if(GP_ROLE!=='admin')return;
  const{data}=await SB.from('gp_remises_attente').select('*').eq('admin_id',GP_ADMIN_ID).eq('statut','attente');
  const n=(data||[]).length;
  const badge=document.getElementById('notif-remises');
  if(n>0){badge.classList.remove('hidden');badge.textContent=n;}
  else badge.classList.add('hidden');
}

async function renderRemises(){
  const{data}=await SB.from('gp_remises_attente').select('*').eq('admin_id',GP_ADMIN_ID).eq('statut','attente').order('created_at',{ascending:false});
  const R=data||[];
  document.getElementById('remises-liste').innerHTML=R.length?R.map(r=>`
    <div class="card" style="border-left:3px solid var(--gold)">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:10px">
        <div>
          <div style="font-weight:700;font-size:13px">${r.client_nom||'—'}</div>
          <div style="font-size:11px;color:var(--textm);margin-top:2px">${r.formule_nom||'—'} · ${fmtKg(r.qte)} kg</div>
          <div style="margin-top:6px;font-size:12px">
            Prix : <strong>${fmt(r.prix_base)} F/kg</strong> · Remise : <strong style="color:var(--red)">${fmt(r.remise)} F</strong>
            (${r.qte*r.prix_base>0?(r.remise/(r.qte*r.prix_base)*100).toFixed(1):0}%)
          </div>
          <div style="font-size:11px;color:var(--textm)">Total demandé : ${fmt(r.qte*r.prix_base-r.remise)} F</div>
        </div>
        <div style="display:flex;gap:8px">
          <button class="btn btn-g btn-sm" onclick="validerRemise('${r.id}','validee')">✅ Valider</button>
          <button class="btn btn-red btn-sm" onclick="validerRemise('${r.id}','refusee')">❌ Refuser</button>
        </div>
      </div>
    </div>`).join(''):'<div class="card" style="text-align:center;color:var(--textm);font-size:13px;padding:20px">✅ Aucune remise en attente.</div>';
}

async function validerRemise(id,statut){
  await SB.from('gp_remises_attente').update({statut}).eq('id',id);
  notify(statut==='validee'?'Remise validée ✓':'Remise refusée',statut==='validee'?'gold':'r');
  renderRemises();checkPendingRemises();
}

function imprimerRapportJour(date, dateAff, ca, dep, impaye, prod, bilan){
  const cfg=GP_CONFIG||{};
  const logoHtml=cfg.logo_url?`<img src="${cfg.logo_url}" style="height:50px;object-fit:contain">`:'<span style="font-size:30px">🌾</span>';

  // Récupérer les données déjà affichées
  const ventesHtml=document.getElementById('bj-ventes').innerHTML;
  const depHtml=document.getElementById('bj-depenses').innerHTML;
  const lotsHtml=document.getElementById('bj-bilan').querySelector('[style*="Lots produits"]')?.outerHTML||'';

  const html=`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Rapport du ${date}</title>
  <style>
    @page{size:A4;margin:12mm}
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:Arial,sans-serif;font-size:11px;color:#000;background:#fff}
    .header{display:flex;justify-content:space-between;align-items:center;border-bottom:2px solid #1b5e20;padding-bottom:10px;margin-bottom:14px}
    .header-right{text-align:right}
    .title{font-size:18px;font-weight:bold;color:#1b5e20}
    .date{font-size:13px;color:#555;margin-top:2px}
    .kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:14px}
    .kpi{border:1px solid #ddd;border-radius:6px;padding:10px;text-align:center}
    .kpi-val{font-size:18px;font-weight:bold;margin-bottom:2px}
    .kpi-lbl{font-size:9px;color:#555;text-transform:uppercase}
    .section{margin-bottom:14px}
    .section-title{font-size:11px;font-weight:bold;color:#1b5e20;text-transform:uppercase;letter-spacing:1px;border-bottom:1px solid #c8e6c9;padding-bottom:4px;margin-bottom:8px}
    table{width:100%;border-collapse:collapse;font-size:10px}
    th{background:#1b5e20;color:#fff;padding:4px 6px;text-align:left}
    td{padding:4px 6px;border-bottom:1px solid #eee}
    .num{text-align:right}
    .bilan-box{border:2px solid #1b5e20;border-radius:8px;padding:14px;text-align:center;margin-top:10px}
    .bilan-val{font-size:28px;font-weight:bold;color:${bilan>=0?'#1b5e20':'#dc2626'}}
    .footer{margin-top:16px;border-top:1px solid #ddd;padding-top:8px;font-size:9px;color:#777;display:flex;justify-content:space-between}
    @media print{button{display:none}}
  </style></head><body>
  <div class="header">
    <div style="display:flex;align-items:center;gap:12px">
      ${logoHtml}
      <div>
        <div style="font-weight:bold;font-size:14px">${cfg.nom_provenderie||'Provenderie'}</div>
        <div style="font-size:10px;color:#555">${cfg.telephone||''} ${cfg.localisation?'· '+cfg.localisation:''}</div>
      </div>
    </div>
    <div class="header-right">
      <div class="title">Rapport Journalier</div>
      <div class="date">${dateAff}</div>
    </div>
  </div>

  <div class="kpis">
    <div class="kpi"><div class="kpi-val" style="color:#16a34a">${fmt(ca)}</div><div class="kpi-lbl">Recettes (F)</div></div>
    <div class="kpi"><div class="kpi-val" style="color:#dc2626">${fmt(dep)}</div><div class="kpi-lbl">Dépenses (F)</div></div>
    <div class="kpi"><div class="kpi-val" style="color:${impaye>0?'#dc2626':'#16a34a'}">${fmt(impaye)}</div><div class="kpi-lbl">Impayés (F)</div></div>
    <div class="kpi"><div class="kpi-val">${fmt(prod)}</div><div class="kpi-lbl">Kg produits</div></div>
  </div>

  <div class="section">
    <div class="section-title">💰 Ventes du jour</div>
    ${ventesHtml}
  </div>

  <div class="section">
    <div class="section-title">🏭 Production du jour</div>
    ${lotsHtml||'<div style="color:#777;font-size:11px">Aucune production ce jour.</div>'}
  </div>

  <div class="section">
    <div class="section-title">💸 Dépenses du jour</div>
    ${depHtml}
  </div>

  <div class="bilan-box">
    <div style="font-size:11px;color:#555;text-transform:uppercase;margin-bottom:6px">${bilan>=0?'Bénéfice net du jour':'Perte du jour'}</div>
    <div class="bilan-val">${fmt(bilan)} FCFA</div>
    ${impaye>0?`<div style="font-size:10px;color:#dc2626;margin-top:6px">⚠ ${fmt(impaye)} F d'impayés non inclus</div>`:''}
  </div>

  <div class="footer">
    <div>Généré par PROVENDA · avifarmer.net</div>
    <div>Imprimé le ${new Date().toLocaleDateString('fr-FR')}</div>
  </div>
  <div style="text-align:center;margin-top:10px">
    <button onclick="window.print()" style="padding:8px 24px;background:#1b5e20;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:13px">🖨️ Imprimer</button>
  </div>
  </body></html>`;

  const w=window.open('','_blank','width=900,height=700');
  w.document.write(html);
  w.document.close();
}


function onConditionnementChange(){
  const val=document.getElementById('vt_poids_sac')?.value;
  const nbWrap=document.getElementById('vt-nb-sacs-wrap');
  const qteLabel=document.getElementById('vt-qte-label');
  const nbInput=document.getElementById('vt_nb_sacs');
  const qteInput=document.getElementById('vt_qte');

  if(val==='kg'){
    // Mode vrac — saisir directement les kg
    if(nbWrap)nbWrap.style.display='none';
    if(qteLabel)qteLabel.textContent='Quantité (kg)';
    if(nbInput)nbInput.value='';
    if(qteInput){qteInput.value='';qteInput.placeholder='Ex: 5';}
  } else {
    // Mode sacs
    if(nbWrap)nbWrap.style.display='block';
    if(qteLabel)qteLabel.textContent='Kg total (auto)';
    if(qteInput){qteInput.value='';qteInput.placeholder='';}
  }
  calcVente();
}

// ── VENTES — ACTIONS ────────────────────────────
async function supprimerVente(id){
  if(!confirm('Supprimer cette vente ? Cette action est irréversible.'))return;
  const{error}=await SB.from('gp_ventes').delete().eq('id',id).eq('admin_id',GP_ADMIN_ID);
  if(error){notify('Erreur suppression: '+error.message,'r');return;}
  await SB.from('gp_ventes_lignes').delete().eq('vente_id',id);
  renderVentes();notify('Vente supprimée ✓','r');
}

async function ouvrirModifierVente(id){
  const{data:v}=await SB.from('gp_ventes').select('*').eq('id',id).maybeSingle();
  if(!v)return;
  const modal=document.getElementById('modal-modifier-vente');
  if(!modal)return;
  document.getElementById('mv-id').value=id;
  document.getElementById('mv-client').textContent=v.client_nom||'Client comptant';
  document.getElementById('mv-total').textContent=fmt(v.montant_total||0)+' F';
  document.getElementById('mv-paye').value=v.montant_paye||0;
  document.getElementById('mv-note').value=v.note||'';
  document.getElementById('mv-date').value=v.date||'';
  modal.style.display='flex';
}

function fermerModifierVente(){
  document.getElementById('modal-modifier-vente').style.display='none';
}

async function saveModifierVente(){
  const id=document.getElementById('mv-id').value;
  const paye=+document.getElementById('mv-paye').value||0;
  const note=document.getElementById('mv-note').value.trim()||null;
  const date=document.getElementById('mv-date').value;
  const{data:v}=await SB.from('gp_ventes').select('montant_total').eq('id',id).maybeSingle();
  const total=Number(v?.montant_total||0);
  const statut=paye<=0?'impaye':paye>=total?'paye':'partiel';
  const{error}=await SB.from('gp_ventes').update({
    montant_paye:paye,statut_paiement:statut,note,date
  }).eq('id',id).eq('admin_id',GP_ADMIN_ID);
  if(error){notify('Erreur: '+error.message,'r');return;}
  fermerModifierVente();renderVentes();
  notify('Vente modifiée ✓','gold');
}

async function envoyerWAVente(id){
  const{data:v}=await SB.from('gp_ventes').select('*').eq('id',id).maybeSingle();
  if(!v)return;
  const{data:lignes}=await SB.from('gp_ventes_lignes').select('*').eq('vente_id',id);
  // Historique client pour personnalisation
  const{data:historique}=await SB.from('gp_ventes').select('montant_total,date,formule_nom')
    .eq('admin_id',GP_ADMIN_ID).eq('client_id',v.client_id||'').order('date',{ascending:false}).limit(10);

  const client=GP_CLIENTS.find(c=>c.id===v.client_id);
  const tel=client?.whatsapp||client?.telephone||'';
  const total=Number(v.montant_total||0);
  const paye=Number(v.montant_paye||0);
  const reste=Math.max(0,total-paye);
  const prov=GP_CONFIG?.nom_provenderie||'PROVENDA';
  const H=historique||[];
  const nbAchats=H.length;
  const totalHistorique=H.reduce((s,x)=>s+Number(x.montant_total||0),0);
  const localite=client?.localite||'';

  // Détails produits
  const L=lignes||[];
  const produitsLine=L.map(l=>`   🌾 ${l.formule_nom} — ${l.quantite} kg × ${fmt(l.prix_unitaire)} F = *${fmt(l.montant_ligne)} F*`).join('\n');

  // Espèce principale achetée pour personnaliser
  const especeEmoji={pondeuse:'🐔',chair:'🐔',lapin:'🐰',porc:'🐷',canard:'🦆',tilapia:'🐟',goliath:'🐟'};
  const formuleStr=L.map(l=>l.formule_nom).join(', ');
  const especeIcon=Object.entries(especeEmoji).find(([k])=>formuleStr.toLowerCase().includes(k))?.[1]||'🌾';

  // Segment client
  const estFidele=nbAchats>=5;
  const estGrosClient=totalHistorique>=500000;
  const estNouveauClient=nbAchats<=1;

  const msg=reste>0
    ? construireMessageRappelDette(v,produitsLine,total,paye,reste,prov,localite,nbAchats,especeIcon,estFidele)
    : construireMessageRemerciement(v,produitsLine,total,prov,localite,nbAchats,totalHistorique,especeIcon,estFidele,estGrosClient,estNouveauClient);

  if(tel){
    const p=detecterPays(tel);
    if(p.numero_whatsapp){window.open('https://wa.me/'+p.numero_whatsapp+'?text='+encodeURIComponent(msg),'_blank');return;}
  }
  const num=prompt('Numéro WhatsApp du client :');
  if(num){const p=detecterPays(num.trim());if(p.numero_whatsapp)window.open('https://wa.me/'+p.numero_whatsapp+'?text='+encodeURIComponent(msg),'_blank');}
}

function construireMessageRappelDette(v,produitsLine,total,paye,reste,prov,localite,nbAchats,especeIcon,estFidele){
  const nom=v.client_nom||'cher client';
  const r=Math.floor(Math.random()*10);
  const templates=[
    ()=>`Bonjour ${nom} 👋\n\nNous espérons que vous allez bien${localite?' à '+localite:''}. Nous nous permettons de vous rappeler avec tout le respect que nous vous devons qu'un solde est en attente pour votre commande du *${v.date}*.\n\n🛒 *Commande :*\n${produitsLine}\n\n💰 Total : ${fmt(total)} F\n✅ Payé : ${fmt(paye)} F\n⏳ *Reste dû : ${fmt(reste)} F*\n\nNous restons disponibles pour tout arrangement. Votre confiance compte beaucoup pour nous. 🙏\n\n_${prov}_ ${especeIcon}`,

    ()=>`${nom}, bonjour ! 🌟\n\nEn tant que client${estFidele?' fidèle':''} de *${prov}*, vous avez toujours notre entière confiance. Nous vous informons simplement qu'un règlement est en attente depuis le *${v.date}*.\n\n🛒 *Détail :*\n${produitsLine}\n\n💰 Total : ${fmt(total)} F | ✅ Payé : ${fmt(paye)} F | ⏳ Reste : *${fmt(reste)} F*\n\nNous sommes convaincus qu'il s'agit d'un oubli. Merci de régulariser à votre prochaine opportunité. 💪\n\n_${prov}_ ${especeIcon}`,

    ()=>`Cher(e) partenaire ${nom} 😊\n\nNous espérons que vos ${especeIcon} se portent à merveille${localite?' à '+localite:''}. Un petit rappel amical : votre commande du *${v.date}* présente encore un solde en attente.\n\n🛒 *Récapitulatif :*\n${produitsLine}\n\n⏳ *Solde restant : ${fmt(reste)} F* (sur ${fmt(total)} F)\n\nN'hésitez pas à nous contacter pour convenir d'un arrangement. Nous sommes là pour vous ! 🤝\n\n_${prov}_ 🌾`,

    ()=>`Bonsoir ${nom} ✨\n\nNous prenons le temps de vous écrire pour un rappel de paiement concernant votre achat du *${v.date}* chez *${prov}*.\n\n📦 *Produits concernés :*\n${produitsLine}\n\n💵 Montant total : ${fmt(total)} F\n✅ Déjà réglé : ${fmt(paye)} F\n🔴 *Balance : ${fmt(reste)} F*\n\nMerci de votre diligence. Votre sérieux est ce qui fait la force de notre partenariat. 🙏\n\n_${prov}_ ${especeIcon}`,

    ()=>`${nom}, bonjour 👋\n\nNotre équipe${localite?' de '+localite:''} vous adresse ce message pour vous rappeler un solde en attente du *${v.date}*.\n\n🛒 *Votre commande :*\n${produitsLine}\n\n💰 Reste à payer : *${fmt(reste)} F*\n(Total : ${fmt(total)} F — Payé : ${fmt(paye)} F)\n\nNous vous remercions d'avance pour votre prompte réponse. Votre fidélité à *${prov}* est très appréciée ! 🌱\n\n_${prov}_ ${especeIcon}`,

    ()=>`Bonjour ${nom} ! 🌾\n\nC'est avec toute la bienveillance qui nous caractérise que nous vous rappelons le règlement en attente pour votre achat du *${v.date}*.\n\n📋 *Détails de la commande :*\n${produitsLine}\n\n⏳ *Solde dû : ${fmt(reste)} F*\n\n${estFidele?`Après ${nbAchats} commandes ensemble, nous savons que vous êtes quelqu'un de sérieux. Nous comptons sur vous !`:'Nous vous faisons confiance pour régulariser rapidement. Merci !'} 💪\n\n_${prov}_ 🌾`,

    ()=>`Cher ${nom} 😊\n\nNous espérons que tout va bien${localite?' à '+localite:''}. Un petit mot pour vous informer qu'un solde de *${fmt(reste)} F* reste en attente depuis votre commande du *${v.date}* chez *${prov}*.\n\n🛒 *Ce que vous avez pris :*\n${produitsLine}\n\nToute notre équipe reste à votre disposition pour faciliter ce règlement. Merci pour votre compréhension et votre fidélité ! 🤝\n\n_${prov}_ ${especeIcon}`,

    ()=>`${nom} 👋 Bonjour !\n\nVoici un rappel amical de votre solde en attente du *${v.date}* :\n\n${produitsLine}\n\n💰 *${fmt(reste)} F restant à régler* sur un total de ${fmt(total)} F.\n\nNous apprécions vraiment notre collaboration${localite?' à '+localite:''}. Votre prochain passage sera l'occasion idéale pour solder. À très bientôt ! 🌟\n\n_${prov}_ ${especeIcon}`,

    ()=>`Bonjour à vous, ${nom} ! ☀️\n\nNous revenons vers vous concernant votre commande du *${v.date}* pour laquelle un montant de *${fmt(reste)} F* est encore attendu.\n\n📦 *Produits :*\n${produitsLine}\n\nNous vous faisons entièrement confiance pour régulariser cette situation. Notre porte est toujours ouverte pour vous. 🏠\n\n_${prov}_ 🌱`,

    ()=>`${nom}, bonsoir ! 🌙\n\nPetit rappel de notre part : votre achat du *${v.date}* chez *${prov}* présente un solde de *${fmt(reste)} F*.\n\n🛒 *Commande concernée :*\n${produitsLine}\n\n${estFidele?`Avec toutes vos commandes chez nous, vous avez toujours été exemplaire. Nous savons que vous régulariserez très prochainement.`:'Nous vous remercions par avance et attendons votre retour.'} 🙏\n\n_${prov}_ ${especeIcon}`,
  ];
  return templates[r]();
}

function construireMessageRemerciement(v,produitsLine,total,prov,localite,nbAchats,totalHistorique,especeIcon,estFidele,estGrosClient,estNouveauClient){
  const nom=v.client_nom||'cher client';
  const r=Math.floor(Math.random()*10);

  const statut=estNouveauClient
    ? `Nous sommes ravis de vous compter parmi nos clients pour la première fois${localite?' à '+localite:''}. C'est le début d'une belle collaboration ! 🎉`
    : estFidele&&estGrosClient
    ? `Avec *${nbAchats} commandes* et *${fmt(totalHistorique)} F* d'achats cumulés, vous êtes l'un de nos partenaires les plus précieux. Votre fidélité est une source de motivation pour toute notre équipe ! 🏆`
    : estFidele
    ? `Avec *${nbAchats} commandes* passées chez *${prov}*, vous faites partie de nos clients fidèles${localite?' à '+localite:''}. Votre loyauté nous touche profondément ! 💚`
    : `C'est toujours un plaisir de vous servir${localite?' à '+localite:''}. Merci pour la confiance que vous placez en *${prov}* ! 🙏`;

  const produitNote=especeIcon!=='🌾'
    ? `Nous souhaitons à vos animaux ${especeIcon} une excellente croissance et de belles performances !`
    : `Nous espérons que nos produits vous donnent entière satisfaction et contribuent à la réussite de votre élevage !`;

  const templates=[
    ()=>`Bonjour ${nom} 😊\n\nNous vous confirmons la bonne réception de votre paiement pour la commande du *${v.date}*.\n\n🛒 *Commande intégralement réglée :*\n${produitsLine}\n\n✅ *Total payé : ${fmt(total)} F*\n\n${statut}\n\n${produitNote}\n\nÀ très bientôt ! 🌾\n\n_${prov}_ ${especeIcon}`,

    ()=>`${nom}, merci à vous ! 🌟\n\nVotre paiement du *${v.date}* a bien été enregistré dans nos livres.\n\n🛒 *Récapitulatif :*\n${produitsLine}\n\n✅ *${fmt(total)} F — SOLDÉ*\n\n${statut}\n\n${produitNote}\n\nNous sommes toujours là pour vous servir. 💪\n\n_${prov}_ 🌱`,

    ()=>`Cher(e) ${nom} 💚\n\nQuelle belle journée ! Votre commande du *${v.date}* est désormais entièrement soldée. 🎉\n\n📦 *Produits livrés et payés :*\n${produitsLine}\n\n✅ *${fmt(total)} F — MERCI !*\n\n${statut}\n\n${produitNote}\n\nQue vos élevages prospèrent ! ${especeIcon}\n\n_${prov}_ 🌾`,

    ()=>`Bonsoir ${nom} ! ✨\n\nNous avons bien reçu votre règlement de *${fmt(total)} F* pour la commande du *${v.date}*. Merci !\n\n🛒 *Votre commande :*\n${produitsLine}\n\n${statut}\n\n${produitNote}\n\nN'hésitez pas à nous contacter pour vos prochains besoins. À bientôt ! 😊\n\n_${prov}_ ${especeIcon}`,

    ()=>`${nom} 👋 Bonjour !\n\nC'est avec beaucoup de plaisir que nous accusons réception de votre paiement du *${v.date}*.\n\n🛒 *Ce que vous avez acquis :*\n${produitsLine}\n\n💰 *${fmt(total)} F — INTÉGRALEMENT PAYÉ* ✅\n\n${statut}\n\n${produitNote}\n\nVotre confiance est notre meilleure récompense. Merci ! 🙏\n\n_${prov}_ 🌱`,

    ()=>`Bonjour ${nom} ! ☀️\n\nMerci pour votre prompte régularisation de la commande du *${v.date}* !\n\n📋 *Détails :*\n${produitsLine}\n\n✅ *Total réglé : ${fmt(total)} F*\n\n${statut}\n\n${produitNote}\n\nNous espérons vous revoir très bientôt avec de nouvelles commandes. 💚\n\n_${prov}_ ${especeIcon}`,

    ()=>`${nom}, bonsoir ! 🌙\n\nNotre équipe vous remercie chaleureusement pour le règlement de *${fmt(total)} F* correspondant à votre commande du *${v.date}*.\n\n🛒 *Produits :*\n${produitsLine}\n\n${statut}\n\n${produitNote}\n\nC'est un honneur de vous compter parmi nos clients. À la prochaine ! 🌟\n\n_${prov}_ 🌾`,

    ()=>`Cher ${nom} 🌺\n\nNous prenons le temps de vous remercier personnellement pour votre paiement du *${v.date}*.\n\n🛒 *Commande soldée :*\n${produitsLine}\n\n✅ *${fmt(total)} F payés — MERCI !*\n\n${statut}\n\n${produitNote}\n\nVotre partenariat avec *${prov}* est précieux. À très bientôt ! 💛\n\n_${prov}_ ${especeIcon}`,

    ()=>`Bonjour ${nom} ! 🎊\n\nExcellente nouvelle : votre commande du *${v.date}* est entièrement soldée !\n\n📦 *Récapitulatif :*\n${produitsLine}\n\n✅ *Total payé : ${fmt(total)} F*\n\n${statut}\n\n${produitNote}\n\nNous vous souhaitons une excellente continuation. Revenez nous voir bientôt ! 🌾\n\n_${prov}_ ${especeIcon}`,

    ()=>`${nom} 🌟 Bonjour !\n\nUn grand MERCI pour votre fidélité et votre sérieux. Votre règlement de *${fmt(total)} F* du *${v.date}* a bien été enregistré.\n\n🛒 *Ce que vous avez acheté :*\n${produitsLine}\n\n${statut}\n\n${produitNote}\n\nNous sommes fiers de vous compter parmi les partenaires de *${prov}*. À bientôt ! 💪\n\n_${prov}_ ${especeIcon}`,
  ];
  return templates[r]();
}

// ── PUSH AUTO APRÈS VENTE SOLDÉE ─────────────────
async function envoyerWAVenteAuto(venteId,client,lignes,total,paye){
  if(!client)return;
  const tel=client.whatsapp||client.telephone||'';
  if(!tel)return; // Pas de numéro → pas d'envoi auto
  const{data:lignesDB}=await SB.from('gp_ventes_lignes').select('*').eq('vente_id',venteId);
  const L=lignesDB||lignes||[];
  const especeEmoji={pondeuse:'🐔',chair:'🐔',lapin:'🐰',porc:'🐷',canard:'🦆',tilapia:'🐟',goliath:'🐟'};
  const formuleStr=L.map(l=>l.formule_nom).join(', ');
  const especeIcon=Object.entries(especeEmoji).find(([k])=>formuleStr.toLowerCase().includes(k))?.[1]||'🌾';
  const produitsLine=L.map(l=>`   🌾 ${l.formule_nom} — ${l.quantite} kg × ${fmt(l.prix_unitaire)} F = *${fmt(l.montant_ligne)} F*`).join('\n');
  const{data:histo}=await SB.from('gp_ventes').select('montant_total').eq('admin_id',GP_ADMIN_ID).eq('client_id',client.id);
  const nbAchats=(histo||[]).length;
  const totalHisto=(histo||[]).reduce((s,x)=>s+Number(x.montant_total||0),0);
  const v={client_nom:client.nom,date:today()};
  const msg=construireMessageRemerciement(v,produitsLine,total,GP_CONFIG?.nom_provenderie||'PROVENDA',
    client.localite||'',nbAchats,totalHisto,especeIcon,nbAchats>=5,totalHisto>=500000,nbAchats<=1);
  const p=detecterPays(tel);
  if(p.numero_whatsapp)window.open('https://wa.me/'+p.numero_whatsapp+'?text='+encodeURIComponent(msg),'_blank');
}
