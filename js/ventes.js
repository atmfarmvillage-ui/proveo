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
  if(nb>0){
    const qteEl=document.getElementById('vt_qte');
    if(qteEl)qteEl.value=nb*poids;
  }
  calcVente();
}

function calcVente(){
  const nb=+document.getElementById('vt_nb_sacs')?.value||0;
  const poids=+document.getElementById('vt_poids_sac')?.value||25;
  let qte=+document.getElementById('vt_qte')?.value||0;
  if(nb>0&&qte===0)qte=nb*poids;
  const prix=+document.getElementById('vt_prix')?.value||0;
  const paye=+document.getElementById('vt_paye')?.value||0;
  const total=Math.round(qte*prix);
  const reste=Math.max(0,total-paye);

  // Montant total
  const totalEl=document.getElementById('vt-montant-total');
  const resteEl=document.getElementById('vt-reste-du');
  if(totalEl)totalEl.textContent=fmt(total)+' F';
  if(resteEl){resteEl.textContent=fmt(reste)+' F';resteEl.style.color=reste>0?'var(--red)':'var(--green)';}

  // Statut automatique
  const statut=paye<=0?'impaye':paye>=total?'paye':'partiel';
  const badge=document.getElementById('vt-statut-badge');
  if(badge){
    const map={
      impaye:['rgba(239,68,68,.1)','var(--red)','rgba(239,68,68,.2)','⏳ Impayé'],
      partiel:['rgba(245,158,11,.1)','var(--gold)','rgba(245,158,11,.2)',`⚠ Paiement partiel — Reste : ${fmt(reste)} F`],
      paye:['rgba(22,163,74,.1)','var(--green)','rgba(22,163,74,.2)','✅ Payé intégralement']
    };
    const[bg,color,border,label]=map[statut];
    badge.style.background=bg;badge.style.color=color;badge.style.borderColor=border;badge.textContent=label;
  }
}

async function onVenteFormuleChange(){
  const nom=document.getElementById('vt_formule').value;
  if(nom){
    const prix=getPrix(nom);
    // Secrétaire voit le prix mais ne peut pas modifier
    const prixEl=document.getElementById('vt_prix');
    if(prixEl&&prix){
      prixEl.value=prix;
      prixEl.readOnly=GP_ROLE!=='admin';
    }
    document.getElementById('vt-prix-lock').style.display=GP_ROLE==='admin'?'none':'inline';
  }
  calcVente();
}

async function saveVente(){
  let clientId=document.getElementById('vt_client')?.value;
  const note=document.getElementById('vt_note')?.value.trim()||null;
  const paye=+document.getElementById('vt_paye')?.value||0;
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
  // Statut paiement automatique
  const statut=paye<=0?'impaye':paye>=total?'paye':'partiel';

  // Déterminer type client
  const client=GP_CLIENTS.find(c=>c.id===clientId);
  const typeClient=client?.type_client||document.getElementById('vt_cl_type')?.value||'detail';

  const{data:vente,error}=await SB.from('gp_ventes').insert({
    admin_id:GP_ADMIN_ID,
    client_id:clientId||null,
    client_nom:client?.nom||'Client comptant',
    montant_total:total,
    montant_paye:paye,
    statut_paiement:statut,
    type_client:typeClient,
    nb_produits:VT_LIGNES.length,
    point_vente:pv,
    note,
    date:today(),
    saisi_par:GP_USER?.id,
    formule_nom:VT_LIGNES.map(l=>l.formule_nom).join(', ')
  }).select().maybeSingle();

  if(error){err.textContent='Erreur: '+error.message;return;}

  // Insérer les lignes
  await SB.from('gp_ventes_lignes').insert(
    VT_LIGNES.map(l=>({
      vente_id:vente.id,admin_id:GP_ADMIN_ID,
      formule_nom:l.formule_nom,quantite:l.quantite,
      prix_unitaire:l.prix_unitaire,montant_ligne:l.montant_ligne,
      type_prix:l.type_prix
    }))
  );

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

  // Déduire du stock PDV si applicable
  if(GP_POINT_VENTE){
    for(const l of VT_LIGNES){
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

  VT_LIGNES=[];renderLignesVente();
  ['vt_note','vt_paye'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});
  document.getElementById('vt_client').value='';
  err.textContent='';
  if(paye>0) imprimerRecu(vente.id);
  notify('Vente enregistrée ✓','gold');
  // Bouton reçu thermique
  if(typeof imprimerRecuThermique==='function'){
    const btnR=document.createElement('button');
    btnR.className='btn btn-print';
    btnR.style.cssText='width:100%;justify-content:center;margin-top:8px';
    btnR.innerHTML='🖨️ Imprimer le reçu thermique';
    btnR.onclick=()=>{
      imprimerRecuThermique({...venteData,lignes:VT_LIGNES,ref:venteData.id?.slice(0,8)});
      btnR.remove();
    };
    const e=document.getElementById('vt_err');
    if(e)e.parentNode.insertBefore(btnR,e.nextSibling);
    setTimeout(()=>btnR.remove(),30000);
  }
  renderVentes();
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
      <td style="display:flex;gap:4px">
        <button class="btn btn-print btn-sm" onclick="imprimerVente('${encodeURIComponent(JSON.stringify(v))}')">🖨️</button>
        <button class="btn btn-red btn-sm" onclick="deleteVente('${v.id}')">✕</button>
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
  if(filtMois)q=q.gte('date',filtMois+'-01').lte('date',filtMoisfinMois(mois));
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

function ajouterLigneVente(){
  const formule=document.getElementById('vt_formule')?.value;
  const qte=+document.getElementById('vt_qte')?.value||0;
  const clientId=document.getElementById('vt_client')?.value;
  const client=GP_CLIENTS.find(c=>c.id===clientId);
  const typeClient=client?.type_client||'detail';
  const err=document.getElementById('vt_err');

  if(!formule||!qte){err.textContent='Sélectionnez un produit et une quantité.';return;}

  // Déterminer le prix selon type client
  const prixGros=GP_PRIX_GROS?.[formule]||0;
  const prixDetail=GP_PRIX?.[formule]||0;
  // Si pas de prix gros défini, utiliser prix détail comme fallback
  const typePrix=(typeClient==='gros'&&prixGros>0)?'gros':'detail';
  const prixUnit=typePrix==='gros'?prixGros:prixDetail;

  // Alerte si quantité grosse mais type détail
  const seuilGros=10; // à rendre configurable
  if(qte>=seuilGros&&typePrix==='detail'&&prixGros>0){
    if(!confirm(`Ce client achète ${qte} sacs. Voulez-vous appliquer le prix gros (${fmt(prixGros)} F) ?`)){
      // garder détail
    } else {
      VT_LIGNES.push({formule_nom:formule,quantite:qte,prix_unitaire:prixGros,montant_ligne:qte*prixGros,type_prix:'gros'});
      document.getElementById('vt_qte').value='';
      renderLignesVente();
      return;
    }
  }

  VT_LIGNES.push({formule_nom:formule,quantite:qte,prix_unitaire:prixUnit,montant_ligne:qte*prixUnit,type_prix:typePrix});
  document.getElementById('vt_qte').value='';
  err.textContent='';
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
      <thead><tr><th>Produit</th><th class="num">Qté</th><th class="num">Prix unit.</th><th class="num">Montant</th><th></th></tr></thead>
      <tbody>
      ${VT_LIGNES.map((l,i)=>`<tr>
        <td style="font-weight:600">${l.formule_nom}
          <span class="badge ${l.type_prix==='gros'?'bdg-gold':'bdg-g'}" style="font-size:8px;margin-left:4px">${l.type_prix}</span>
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

