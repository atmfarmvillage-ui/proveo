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
      style="padding:10px 14px;cursor:pointer;border-bottom:1px solid var(--card2);transition:background .15s;color:var(--text)"
      onmouseover="this.style.background='rgba(22,163,74,.1)'" onmouseout="this.style.background=''">
      <div style="font-weight:600;font-size:12px;color:var(--text)">${c.nom}${detteBadge}</div>
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
  // Afficher les defaults (dernière vente) du client
  if(c.derniere_formule){
    infos.push(`🔁 Dernier achat : ${c.derniere_formule}${c.derniere_qte?' · '+fmtKg(c.derniere_qte)+' kg':''}`);
  }
  // Points de fidélité
  if(Number(c.points_fidelite)>0){
    infos.push(`🎁 ${c.points_fidelite} pts fidélité`);
  }
  if(infoEl)infoEl.innerHTML=infos.join(' · ');

  // Masquer nouveau client
  const nv=document.getElementById('vt-nouveau-client');
  if(nv)nv.style.display='none';
  // Cacher la zone des suggestions de doublons
  const sim=document.getElementById('vt-cl-similaires');
  if(sim)sim.style.display='none';

  // ── DEFAULTS INTELLIGENTS : pré-remplir avec le dernier achat du client ──
  prefillDefaultsDernierAchatClient(c);

  // ── BON DE FIDÉLITÉ : afficher si le client a un crédit disponible ──
  window._bonFidelite = 0; // remis à zéro à chaque changement de client
  renderBonFidelite(c);

  // Charger le prix selon type client et formule + coût de prod
  onVenteFormuleChange();
  calcVente();
}

// Pré-remplit le formulaire produit avec le dernier achat du client (defaults intelligents)
function prefillDefaultsDernierAchatClient(c){
  if(!c) return;
  // Ne pas écraser si l'utilisateur a déjà saisi quelque chose
  const formuleSel=document.getElementById('vt_formule');
  const qteEl=document.getElementById('vt_qte');
  const condEl=document.getElementById('vt_poids_sac');
  if(formuleSel && !formuleSel.value && c.derniere_formule){
    // Vérifier que la formule existe encore dans la liste
    const opt=Array.from(formuleSel.options).find(o=>o.value===c.derniere_formule);
    if(opt){
      formuleSel.value=c.derniere_formule;
      // Déclencher le changement (charge le prix)
      onVenteFormuleChange();
    }
  }
  if(condEl && c.dernier_conditionnement){
    const opt=Array.from(condEl.options).find(o=>o.value===String(c.dernier_conditionnement));
    if(opt){ condEl.value=String(c.dernier_conditionnement); if(typeof onConditionnementChange==='function') onConditionnementChange(); }
  }
  if(qteEl && !qteEl.value && c.derniere_qte){
    qteEl.value=Number(c.derniere_qte);
  }
}

// ── ANTI-DOUBLON CLIENTS : recherche live des clients similaires ──
// Normalise une chaîne pour comparaison fuzzy : lowercase + sans accents + trim
function normaliserNomClient(s){
  return (s||'').toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g,'')
    .replace(/\s+/g,' ').trim();
}
// Normalise un téléphone : ne garde que les 8 derniers chiffres
function normaliserTelClient(t){
  return (t||'').replace(/\D/g,'').slice(-8);
}

// Recherche des clients similaires sur (nom + prénom) OU téléphone
function chercherClientsSimilaires(nom, tel){
  const nomN = normaliserNomClient(nom);
  const telN = normaliserTelClient(tel);
  if(nomN.length<2 && telN.length<4) return [];
  return GP_CLIENTS.filter(c=>{
    const cNom = normaliserNomClient(c.nom);
    const cTel = normaliserTelClient(c.telephone);
    // Match si nom contenu OU tel contenu (≥4 chiffres)
    const nomMatch = nomN.length>=2 && (cNom.includes(nomN) || nomN.includes(cNom));
    const telMatch = telN.length>=4 && cTel && (cTel.includes(telN) || telN.includes(cTel));
    return nomMatch || telMatch;
  }).slice(0,5);
}

// Debounce simple (250ms) pour ne pas chercher à chaque touche
let _simDebounce=null;
function chercherClientsSimilairesDebounced(){
  if(_simDebounce) clearTimeout(_simDebounce);
  _simDebounce=setTimeout(()=>{
    const nom = document.getElementById('vt_cl_nom')?.value||'';
    const tel = document.getElementById('vt_cl_tel')?.value||'';
    const matches = chercherClientsSimilaires(nom.trim(), tel);
    const wrap = document.getElementById('vt-cl-similaires');
    if(!wrap) return;
    if(!matches.length){ wrap.style.display='none'; return; }
    wrap.innerHTML = `<div style="font-size:11px;font-weight:700;color:var(--gold);margin-bottom:6px">⚠ ${matches.length} client${matches.length>1?'s':''} ressemble${matches.length>1?'nt':''} déjà à votre saisie :</div>`
      + matches.map(c=>{
          const tel=c.telephone||'—';
          const ferme=c.nom_ferme?' · '+c.nom_ferme:'';
          return `<div style="background:rgba(0,0,0,.15);border-radius:6px;padding:6px 10px;margin-bottom:4px;display:flex;justify-content:space-between;align-items:center;gap:8px">
            <div style="font-size:11px;flex:1">
              <div style="font-weight:600">${c.nom}</div>
              <div style="font-size:10px;color:var(--textm)">${tel}${ferme}</div>
            </div>
            <button onclick="selectionnerClientVente('${c.id}')" class="btn btn-g btn-sm" style="font-size:10px;padding:4px 10px">Utiliser celui-ci</button>
          </div>`;
        }).join('')
      + `<div style="font-size:10px;color:var(--textm);margin-top:4px">Si vraiment différent, continuez à remplir et enregistrez.</div>`;
    wrap.style.display='block';
  },250);
}

function effacerClientVente(){
  document.getElementById('vt_client').value='';
  document.getElementById('vt_tel_search').value='';
  const badge=document.getElementById('vt-client-badge');
  if(badge)badge.style.display='none';
  document.getElementById('vt_client_results').style.display='none';
  // Réinitialiser le bon de fidélité
  window._bonFidelite=0;
  const bon=document.getElementById('vt-bon-fidelite');
  if(bon)bon.style.display='none';
  if(typeof calcVente==='function')calcVente();
}

// ── BON DE FIDÉLITÉ (crédit client appliqué en remise) ──
function renderBonFidelite(client){
  const el=document.getElementById('vt-bon-fidelite');
  if(!el)return;
  const credit=Number(client?.credit_fidelite)||0;
  if(credit<=0){ el.style.display='none'; return; }
  el.style.display='flex';
  if(window._bonFidelite>0){
    el.innerHTML=`<span style="font-size:12px;color:var(--gold);font-weight:700">✅ Bon fidélité appliqué : −${fmt(window._bonFidelite)} F</span>
      <button onclick="retirerBonFidelite()" style="background:rgba(239,68,68,.1);border:1px solid rgba(239,68,68,.3);color:var(--red);padding:4px 10px;border-radius:6px;cursor:pointer;font-size:11px">Retirer</button>`;
  } else {
    el.innerHTML=`<span style="font-size:12px;color:var(--gold);font-weight:700">💳 Bon fidélité disponible : ${fmt(credit)} F</span>
      <button onclick="appliquerBonFidelite()" class="btn btn-g btn-sm" style="font-size:11px">Appliquer</button>`;
  }
}

function appliquerBonFidelite(){
  const clientId=document.getElementById('vt_client')?.value;
  const client=GP_CLIENTS.find(c=>c.id===clientId);
  const credit=Number(client?.credit_fidelite)||0;
  if(credit<=0)return;
  // Total courant (lignes ajoutées ou ligne en cours)
  const totalActuel=VT_LIGNES.length
    ? VT_LIGNES.reduce((s,l)=>s+Number(l.montant_ligne||0),0)
    : Math.round((+document.getElementById('vt_qte')?.value||0)*(+document.getElementById('vt_prix')?.value||0));
  // Le bon ne dépasse pas le total
  window._bonFidelite=Math.min(credit, totalActuel||credit);
  renderBonFidelite(client);
  calcVente();
}

function retirerBonFidelite(){
  window._bonFidelite=0;
  const clientId=document.getElementById('vt_client')?.value;
  const client=GP_CLIENTS.find(c=>c.id===clientId);
  renderBonFidelite(client);
  calcVente();
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

// Prix au sac ↔ prix au kg — synchronisation auto selon le conditionnement.
// source='kg' : on a saisi le prix/kg → recalcule le prix/sac.
// source='sac': on a saisi le prix/sac → recalcule le prix/kg (utilisé pour le calcul).
function syncPrixVente(source){
  const poids=+document.getElementById('vt_poids_sac')?.value||0; // 0 en mode vrac (kg)
  const prixKgEl=document.getElementById('vt_prix');
  const prixSacEl=document.getElementById('vt_prix_sac');
  if(!prixKgEl||!prixSacEl||poids<=0) return; // vrac : pas de prix/sac
  if(source==='sac'){
    const ps=+prixSacEl.value||0;
    prixKgEl.value = ps>0 ? Math.round(ps/poids*100)/100 : '';
  } else {
    const pk=+prixKgEl.value||0;
    prixSacEl.value = pk>0 ? Math.round(pk*poids) : '';
  }
}

// Stock disponible à la vente (gp_stock_produits_pdv) — pour annoter le menu des formules.
// + poids_sac par formule (depuis le dernier lot de production) → affichage en sacs.
var GP_POIDS_SAC_VENTE = {};

// Détermine le PDV source pour le stock de la vente :
// 1. GP_POINT_VENTE (rôle avec PDV affecté : secrétaire, vendeur, etc.)
// 2. Valeur du sélecteur vt_pv_select / vt_pv (admin qui choisit)
// 3. "Production" par défaut (siège — admin sans PDV)
function pdvSourceVente(){
  if(GP_POINT_VENTE) return GP_POINT_VENTE;
  const sel = document.getElementById('vt_pv_select')?.value;
  const hidden = document.getElementById('vt_pv')?.value;
  return sel || hidden || 'Production';
}

async function loadStockVente(){
  GP_STOCK_VENTE = {};
  GP_POIDS_SAC_VENTE = {};
  // Charger les poids/sac depuis le dernier lot de chaque formule
  try{
    const{data:lots}=await SB.from('gp_lots').select('formule_nom,poids_sac,date')
      .eq('admin_id',GP_ADMIN_ID).order('date',{ascending:false});
    (lots||[]).forEach(l=>{
      if(!GP_POIDS_SAC_VENTE[l.formule_nom] && l.poids_sac){
        GP_POIDS_SAC_VENTE[l.formule_nom] = Number(l.poids_sac);
      }
    });
  }catch(e){}
  // Charger le stock du PDV source (déterminé dynamiquement)
  const pdvNom = pdvSourceVente();
  window._STOCK_PDV_NOM_VENTE = pdvNom;
  try{
    const{data}=await SB.from('gp_stock_produits_pdv').select('formule_nom,qte_disponible')
      .eq('admin_id',GP_ADMIN_ID).eq('pdv_nom',pdvNom);
    (data||[]).forEach(r=>{
      GP_STOCK_VENTE[r.formule_nom]=(GP_STOCK_VENTE[r.formule_nom]||0)+Number(r.qte_disponible||0);
    });
  }catch(e){}
}

// Setup du sélecteur PDV admin (à appeler à l'ouverture de la page Ventes)
async function setupVentePdvSelector(){
  const isAdmin = GP_ROLE === 'admin' || GP_EST_GERANT;
  const staticEl = document.querySelector('.vt-pv-static');
  const selectEl = document.getElementById('vt_pv_select');
  const hiddenEl = document.getElementById('vt_pv');
  // Si secrétaire/vendeur avec PDV affecté → static (déjà géré par auth.js)
  if(GP_POINT_VENTE){
    if(selectEl) selectEl.style.display = 'none';
    if(staticEl) staticEl.style.display = '';
    if(hiddenEl) hiddenEl.value = GP_POINT_VENTE;
    return;
  }
  // Si admin sans PDV → afficher le sélecteur avec tous les PDV (+ "Production" par défaut)
  if(isAdmin && selectEl){
    if(staticEl) staticEl.style.display = 'none';
    selectEl.style.display = '';
    // Récupérer tous les PDV
    const{data:pdvs}=await SB.from('gp_points_vente').select('nom').eq('admin_id',GP_ADMIN_ID).order('nom');
    const noms = ['Production', ...((pdvs||[]).map(p=>p.nom).filter(n=>n && n!=='Production'))];
    selectEl.innerHTML = noms.map(n=>`<option value="${n}">${n==='Production'?'🏭 Production (siège)':'📍 '+n}</option>`).join('');
    selectEl.value = 'Production';
    if(hiddenEl) hiddenEl.value = 'Production';
  }
}

// Handler du changement de PDV (admin sélectionne autre source)
async function onPdvVenteChange(){
  const sel = document.getElementById('vt_pv_select');
  const val = sel?.value || 'Production';
  const hidden = document.getElementById('vt_pv');
  if(hidden) hidden.value = val;
  await loadStockVente();
  // Re-display stock pour la formule en cours
  const formuleNom = document.getElementById('vt_formule')?.value;
  if(formuleNom && typeof afficherStockFormuleVente === 'function'){
    afficherStockFormuleVente(formuleNom);
  }
}

// Affiche le stock dispo pour la formule sélectionnée (kg + sacs + PDV source)
function afficherStockFormuleVente(formuleNom){
  const box = document.getElementById('vt-stock-info');
  if(!box) return;
  if(!formuleNom){ box.style.display = 'none'; return; }
  const kg = Number(GP_STOCK_VENTE[formuleNom]||0);
  const ps = Number(GP_POIDS_SAC_VENTE[formuleNom]||0);
  const pdvNom = window._STOCK_PDV_NOM_VENTE || pdvSourceVente();
  const pdvLabel = `<span style="font-size:10px;font-weight:500;opacity:.85"> · à ${pdvNom}</span>`;
  box.style.display = 'block';
  if(kg <= 0){
    box.style.background = 'rgba(239,68,68,.15)';
    box.style.border = '2px solid rgba(239,68,68,.5)';
    box.style.color = 'var(--red)';
    box.innerHTML = `⛔ <b>STOCK ÉPUISÉ</b> pour <b>${formuleNom}</b> à <b>${pdvNom}</b><br>
      <span style="font-size:10px;font-weight:500">Lance une production, attends une livraison, ou change la source de vente (📍 en haut).</span>`;
  } else if(ps > 0){
    const nb = Math.round(kg/ps*10)/10;
    const stockLow = kg < ps;
    box.style.background = stockLow ? 'rgba(245,158,11,.15)' : 'rgba(22,163,74,.12)';
    box.style.border = stockLow ? '1px solid rgba(245,158,11,.5)' : '1px solid rgba(22,163,74,.4)';
    box.style.color = stockLow ? 'var(--gold)' : 'var(--green)';
    box.innerHTML = `${stockLow?'⚠':'✅'} Stock dispo : <b>${fmt(kg)} kg</b> ≈ <b>${nb} sacs (${ps}kg)</b>${pdvLabel}`;
  } else {
    box.style.background = 'rgba(22,163,74,.12)';
    box.style.border = '1px solid rgba(22,163,74,.4)';
    box.style.color = 'var(--green)';
    box.innerHTML = `✅ Stock dispo : <b>${fmt(kg)} kg</b>${pdvLabel}`;
  }
}

// Favoris formules — uniquement les formules effectivement vendues (max 8).
// Croît naturellement avec les ventes : 0 vente = 0 favori, 3 ventes différentes = 3 favoris, etc.
let GP_FAVORIS_FORMULES = [];
async function loadFavorisFormules(){
  GP_FAVORIS_FORMULES = [];
  try{
    const il_y_a_30j = new Date(Date.now()-30*86400000).toISOString().slice(0,10);
    let q = SB.from('gp_ventes_lignes')
      .select('formule_nom,quantite,gp_ventes!inner(point_vente,date,admin_id)')
      .eq('admin_id',GP_ADMIN_ID)
      .eq('type_produit','formule')
      .gte('gp_ventes.date', il_y_a_30j);
    if(GP_POINT_VENTE) q = q.eq('gp_ventes.point_vente', GP_POINT_VENTE);
    const{data}=await q;
    const agg = {};
    (data||[]).forEach(l=>{
      if(!l.formule_nom) return;
      agg[l.formule_nom] = (agg[l.formule_nom]||0) + Number(l.quantite||0);
    });
    GP_FAVORIS_FORMULES = Object.entries(agg)
      .sort((a,b)=>b[1]-a[1])
      .slice(0,8)
      .map(([nom,kg])=>({nom, kg}));
  }catch(e){ /* silencieux */ }
  renderFavorisFormules();
}

// Affiche les favoris dans TOUS les sélecteurs de formule de l'app
function renderFavorisFormules(){
  renderFavorisInto('vt-favoris-formules',  'vt_formule',  'onVenteFormuleChange');
  renderFavorisInto('lot-favoris-formules', 'lot_formule', 'onFormuleChange');
  renderFavorisInto('dist-favoris-formules','dist_formule', null);
  renderFavorisInto('pf-favoris-formules',  'pf_formule',  null);
}

// Rend les boutons favoris dans un conteneur donné, ciblant un <select> précis
function renderFavorisInto(containerId, selectId, cbName){
  const wrap = document.getElementById(containerId);
  if(!wrap) return;
  if(!GP_FAVORIS_FORMULES.length){ wrap.innerHTML=''; return; }
  wrap.innerHTML = GP_FAVORIS_FORMULES.map(f=>{
    const nom = (f.nom||'').replace(/'/g,"\\'");
    const cb = cbName ? `'${cbName}'` : 'null';
    return `<button type="button" onclick="choisirFavori('${selectId}','${nom}',${cb})"
      title="Vendu ${fmtKg(f.kg)} kg sur 30j"
      style="font-size:10px;padding:5px 9px;border-radius:14px;background:rgba(232,197,71,.1);border:1px solid rgba(232,197,71,.3);color:var(--gold);cursor:pointer;font-weight:600;font-family:inherit;white-space:nowrap">
      ⭐ ${f.nom}
    </button>`;
  }).join('');
}

// Sélectionne une formule favorite dans n'importe quel <select> + déclenche son callback
function choisirFavori(selectId, nom, cbName){
  const sel = document.getElementById(selectId);
  if(!sel) return;
  const opt = Array.from(sel.options).find(o=>o.value===nom);
  if(!opt){ notify('Formule indisponible dans cette liste (stock ?)','r'); return; }
  sel.value = nom;
  // Vider le champ de recherche associé si présent (ex: vt_formule_search)
  const search = document.getElementById(selectId+'_search');
  if(search) search.value='';
  if(cbName && typeof window[cbName]==='function') window[cbName]();
  // En vente : focus direct sur la quantité
  if(selectId==='vt_formule') setTimeout(()=>document.getElementById('vt_qte')?.focus(),50);
}

// Alias rétro-compat
function choisirFavoriFormule(nom){ choisirFavori('vt_formule', nom, 'onVenteFormuleChange'); }

// Charge les favoris si pas déjà fait, sinon re-render (évite une requête à chaque page)
function ensureFavorisFormules(){
  if(GP_FAVORIS_FORMULES && GP_FAVORIS_FORMULES.length) renderFavorisFormules();
  else if(typeof loadFavorisFormules==='function') loadFavorisFormules();
}

// Catalogue des prestations (décorticage, mouture…) — alimente le select Service
let GP_SERVICES = [];
async function loadServices(){
  try{
    const{data}=await SB.from('gp_services').select('id,nom,unite,prix_unitaire,actif')
      .eq('admin_id',GP_ADMIN_ID).eq('actif',true).order('nom');
    GP_SERVICES = data || [];
    const sel = document.getElementById('vt_service');
    if(sel){
      sel.innerHTML = '<option value="">— Sélectionner —</option>' +
        GP_SERVICES.map(s=>`<option value="${s.id}">${s.nom} (${s.prix_unitaire} F/${s.unite})</option>`).join('');
    }
  }catch(e){ GP_SERVICES = []; }
}

// ── ADMIN PRESTATIONS (page Configuration) ──────────
async function renderServicesAdmin(){
  const cont=document.getElementById('svc-admin-liste');
  if(!cont) return;
  const{data}=await SB.from('gp_services').select('*').eq('admin_id',GP_ADMIN_ID).order('nom');
  const list=data||[];
  if(!list.length){ cont.innerHTML='<div style="color:var(--textm);font-size:12px;padding:8px">Aucune prestation. Ajoute-en une ci-dessus.</div>'; return; }
  cont.innerHTML=list.map(s=>`
    <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:8px;border-bottom:1px solid var(--border);${s.actif?'':'opacity:.55'}">
      <div style="flex:1;min-width:120px">
        <div style="font-weight:600;font-size:12px">${s.nom}</div>
        <div style="font-size:10px;color:var(--textm)">unité : ${s.unite}</div>
      </div>
      <input type="number" value="${s.prix_unitaire||0}" onchange="updateServicePrix('${s.id}',this.value)" style="width:90px;text-align:right;font-size:11px;padding:3px 6px"><span style="font-size:10px;color:var(--textm)">F/${s.unite}</span>
      <button class="btn btn-out btn-sm" onclick="toggleServiceActif('${s.id}',${s.actif})" style="font-size:10px;padding:3px 8px">${s.actif?'🟢 Actif':'⚪ Inactif'}</button>
      <button class="btn btn-red btn-sm" onclick="deleteService('${s.id}')" style="padding:3px 7px">✕</button>
    </div>`).join('');
}
async function saveService(){
  const nom=document.getElementById('svc-nom')?.value.trim();
  const unite=document.getElementById('svc-unite')?.value||'kg';
  const prix=+document.getElementById('svc-prix')?.value||0;
  const err=document.getElementById('svc-err');
  if(err) err.textContent='';
  if(!nom){ if(err) err.textContent='Nom de la prestation requis.'; return; }
  const{error}=await SB.from('gp_services').insert({admin_id:GP_ADMIN_ID,nom,unite,prix_unitaire:prix,actif:true});
  if(error){ if(err) err.textContent='Erreur: '+error.message; return; }
  const n=document.getElementById('svc-nom'); if(n)n.value='';
  const p=document.getElementById('svc-prix'); if(p)p.value='';
  notify('Prestation ajoutée ✓','gold');
  renderServicesAdmin();
}
async function updateServicePrix(id,val){
  const prix=+val||0;
  await SB.from('gp_services').update({prix_unitaire:prix}).eq('id',id).eq('admin_id',GP_ADMIN_ID);
  notify('Prix mis à jour ✓','gold');
}
async function toggleServiceActif(id,actif){
  await SB.from('gp_services').update({actif:!actif}).eq('id',id).eq('admin_id',GP_ADMIN_ID);
  renderServicesAdmin();
}
async function deleteService(id){
  if(!confirm('Supprimer cette prestation définitivement ?')) return;
  await SB.from('gp_services').delete().eq('id',id).eq('admin_id',GP_ADMIN_ID);
  notify('Prestation supprimée','r');
  renderServicesAdmin();
}

function onVenteServiceChange(){
  const id = document.getElementById('vt_service')?.value;
  const s = GP_SERVICES.find(x=>x.id===id);
  if(!s){ document.getElementById('vt-prestation-info').textContent=''; return; }
  // Auto-remplit prix unitaire et adapte le conditionnement
  const prixEl = document.getElementById('vt_prix');
  if(prixEl) prixEl.value = s.prix_unitaire || 0;
  // Force le conditionnement selon l'unité du service
  const condEl = document.getElementById('vt_poids_sac');
  if(condEl){
    if(s.unite==='sac'){ condEl.value='50'; }
    else { condEl.value='kg'; }
    if(typeof onConditionnementChange==='function') onConditionnementChange();
  }
  document.getElementById('vt-prestation-info').textContent =
    s.unite==='forfait' ? 'Forfait — entrez 1 en quantité.' : `Tarif : ${s.prix_unitaire} F par ${s.unite}.`;
  calcVente();
}

// ── REMISE ────────────────────────────────────────
// Quantité totale de la vente (lignes ajoutées, ou ligne en cours de saisie).
function getTotalQteVente(){
  let q=VT_LIGNES.reduce((s,l)=>s+Number(l.quantite||0),0);
  if(q<=0){
    const nb=+document.getElementById('vt_nb_sacs')?.value||0;
    const poids=document.getElementById('vt_poids_sac')?.value;
    let qte=+document.getElementById('vt_qte')?.value||0;
    if(nb>0&&poids&&poids!=='kg'&&poids!=='unite'&&qte===0)qte=nb*+poids;
    q=qte;
  }
  return q;
}

// Quantité totale en sacs de la vente (lignes ajoutées, ou ligne en cours)
function getTotalSacsVente(){
  let s=VT_LIGNES.reduce((acc,l)=>acc+Number(l.nb_sacs||0),0);
  if(s<=0)s=+document.getElementById('vt_nb_sacs')?.value||0;
  return s;
}

// Calcule la remise de la LIGNE en cours selon le type : par kg / par sac / total.
function computeRemiseLigneVente(qte, nbSacs){
  const type=document.getElementById('vt_remise_type')?.value||'totale';
  const valeur=+document.getElementById('vt_remise_valeur')?.value||0;
  if(valeur<=0)return 0;
  if(type==='kg') return Math.round(valeur*Number(qte||0));
  if(type==='sac')return Math.round(valeur*Number(nbSacs||0));
  return Math.round(valeur); // totale
}

// Met à jour le libellé du champ remise selon le type choisi.
function majLabelRemise(){
  const type=document.getElementById('vt_remise_type')?.value||'totale';
  const lbl=document.getElementById('vt-remise-valeur-label');
  if(lbl)lbl.textContent=type==='kg'?'Remise par kg (F/kg)':type==='sac'?'Remise par sac (F/sac)':'Remise — montant total (F)';
}

// Affiche/masque le champ « Autorisé par » selon la case
function onRemiseValideeToggle(){
  const checked=document.getElementById('vt_remise_validee')?.checked;
  const row=document.getElementById('vt-remise-par-row');
  if(row)row.style.display=checked?'block':'none';
}

// Pré-coche la validation si l'utilisateur connecté est admin
function initRemiseVente(){
  const chk=document.getElementById('vt_remise_validee');
  const parEl=document.getElementById('vt_remise_par');
  if(!chk)return;
  if(GP_ROLE==='admin'){
    chk.checked=true;
    if(parEl&&!parEl.value)parEl.value=GP_USER?.email?.split('@')[0]||'Admin';
  }
  onRemiseValideeToggle();
  // Cacher les champs admin-only pour les non-admins
  if(GP_ROLE!=='admin'){
    document.querySelectorAll('.vt-admin-only').forEach(el=>el.style.display='none');
  }
}

// ── BLOC REMISE par produit : toggle replier / deplier ──
function toggleRemiseProduit(){
  const bloc=document.getElementById('vt-remise-bloc');
  if(!bloc) return;
  const visible = bloc.style.display!=='none';
  bloc.style.display = visible ? 'none' : 'block';
  if(!visible){
    // Au déploiement, focus sur le champ valeur
    setTimeout(()=>document.getElementById('vt_remise_valeur')?.focus(),50);
  }
  majBoutonRemise();
}

// Met à jour le label du bouton remise (affiche le montant si > 0)
function majBoutonRemise(){
  const btn=document.getElementById('vt-remise-toggle');
  const lbl=document.getElementById('vt-remise-toggle-label');
  if(!btn||!lbl) return;
  const val=+document.getElementById('vt_remise_valeur')?.value||0;
  const bloc=document.getElementById('vt-remise-bloc');
  const visible = bloc && bloc.style.display!=='none';
  if(val>0){
    lbl.textContent = `Remise active : ${fmt(val)} F`;
    btn.style.background='rgba(232,197,71,.2)';
    btn.style.borderStyle='solid';
    btn.style.color='var(--gold)';
  } else {
    lbl.textContent = visible ? 'Annuler la remise' : 'Ajouter une remise';
    btn.style.background='rgba(232,197,71,.08)';
    btn.style.borderStyle='dashed';
    btn.style.color='var(--gold)';
  }
}

// ── RACCOURCIS CLAVIER (page Ventes uniquement) ──
// Ctrl+S = enregistrer la vente. Esc = vider les champs du produit en cours.
// Enter dans qté est géré inline dans index.html (appelle ajouterLigneVente).
document.addEventListener('keydown',(e)=>{
  const onVentes = document.getElementById('page-ventes')?.classList.contains('active');
  if(!onVentes) return;
  // Ctrl+S / Cmd+S
  if((e.ctrlKey||e.metaKey) && (e.key==='s'||e.key==='S')){
    e.preventDefault();
    if(typeof enregistrerVenteRapide==='function') enregistrerVenteRapide();
    return;
  }
  // Esc : vider le produit en cours (mais conserver client + lignes ajoutées)
  if(e.key==='Escape'){
    const tag = document.activeElement?.tagName;
    if(tag && ['INPUT','SELECT','TEXTAREA'].includes(tag)){
      ['vt_qte','vt_nb_sacs','vt_prix','vt_prix_sac','vt_remise_valeur','vt_ferme_desc','vt_prestation_detail']
        .forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});
      const fs=document.getElementById('vt_formule_search'); if(fs) fs.value='';
      const remBloc=document.getElementById('vt-remise-bloc'); if(remBloc) remBloc.style.display='none';
      if(typeof majBoutonRemise==='function') majBoutonRemise();
      if(typeof calcVente==='function') calcVente();
      document.activeElement.blur();
    }
  }
});

// ── ENREGISTREMENT RAPIDE (vente unique) ──
// Si aucun produit n'est dans VT_LIGNES mais le formulaire contient un produit complet,
// ajoute la ligne automatiquement puis enregistre. Sinon, enregistre directement.
async function enregistrerVenteRapide(){
  const err=document.getElementById('vt_err');
  if(err) err.textContent='';
  // Si la liste est vide, on tente d'ajouter le produit en cours
  if(VT_LIGNES.length===0){
    const formuleChoisie=document.getElementById('vt_formule')?.value
      || document.getElementById('vt_mp_id')?.value
      || document.getElementById('vt_service')?.value
      || document.getElementById('vt_sous_type')?.value;
    const qte=+document.getElementById('vt_qte')?.value||0;
    if(!formuleChoisie || !qte){
      if(err) err.textContent='Sélectionnez un produit et une quantité avant d\'enregistrer.';
      return;
    }
    ajouterLigneVente();
    // Si ajouterLigneVente a mis un message d'erreur ou que rien n'a été ajouté, on stoppe
    if(VT_LIGNES.length===0){ return; }
  }
  await saveVente();
}

function calcVente(){
  const nb=+document.getElementById('vt_nb_sacs')?.value||0;
  const poids=+document.getElementById('vt_poids_sac')?.value||25;
  let qte=+document.getElementById('vt_qte')?.value||0;
  if(nb>0&&poids!=='kg'&&qte===0)qte=nb*+poids;
  const prix=+document.getElementById('vt_prix')?.value||0;
  const remis=+document.getElementById('vt_paye')?.value||0;

  // montant_ligne des lignes ajoutées = déjà NET de remise.
  let sousTotal, remise, total;
  if(VT_LIGNES.length){
    total     = VT_LIGNES.reduce((s,l)=>s+Number(l.montant_ligne||0),0);
    remise    = VT_LIGNES.reduce((s,l)=>s+Number(l.remise||0),0);
    sousTotal = total + remise;
  } else {
    // Aperçu de la ligne en cours de saisie
    const brut = Math.round(qte*prix);
    const remL = computeRemiseLigneVente(qte, nb);
    sousTotal  = brut;
    remise     = Math.min(remL, brut);
    total      = Math.max(0, brut - remise);
  }
  majLabelRemise();
  const remiseTotEl=document.getElementById('vt-remise-totale');
  if(remiseTotEl)remiseTotEl.textContent=fmt(remise)+' F';
  // Afficher le bloc des remises totales (avec motif + validation admin) uniquement si remise > 0
  const remiseTotauxBloc=document.getElementById('vt-remise-totaux-bloc');
  if(remiseTotauxBloc) remiseTotauxBloc.style.display = remise>0 ? 'block' : 'none';

  // ── BON DE FIDÉLITÉ : appliqué comme réduction globale sur le total ──
  let bonApplique=Number(window._bonFidelite)||0;
  if(bonApplique>0){
    bonApplique=Math.min(bonApplique, total); // jamais plus que le total
    window._bonFidelite=bonApplique;
    total=Math.max(0, total-bonApplique);
  }

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
  const sousTotalEl=document.getElementById('vt-sous-total');
  if(sousTotalEl)sousTotalEl.textContent=fmt(sousTotal)+' F';
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
  // Affichage du stock dès le choix (toujours, même si nom vide → cache la box)
  afficherStockFormuleVente(nom);
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
  syncPrixVente('kg'); // met à jour le prix/sac affiché

  calcVente();
}

// Points de fidélité gagnés sur une vente : par sac d'aliment (formules uniquement)
// 25 kg = 3 pts · 50 kg = 5 pts · vrac = 0,12 pt/kg (3 pts les 25 kg)
function calcPointsVente(lignes){
  let pts=0;
  for(const l of (lignes||[])){
    if(l.type_produit!=='formule') continue; // points seulement sur l'aliment
    const cond=String(l.conditionnement||'kg');
    const qte=Number(l.quantite)||0;
    if(cond==='25'||cond==='50'){
      const poids=Number(cond);
      const sacs=Number(l.nb_sacs)>0 ? Number(l.nb_sacs) : Math.round(qte/poids);
      pts += sacs * (cond==='25' ? 3 : 5);
    } else {
      pts += Math.round(qte * 0.12); // vrac
    }
  }
  return pts;
}

async function saveVente(){
  // Popup WhatsApp pré-ouvert pour contourner le bloqueur de pop-up
  // (les navigateurs interdisent window.open APRÈS un await)
  let _waPopup = null;
  // Helper : afficher une grosse erreur visible (notif + texte rouge) + ferme le popup pré-ouvert
  const _showErr = (msg)=>{
    const e=document.getElementById('vt_err'); if(e) e.textContent=msg;
    if(typeof notify === 'function') notify('⚠ '+msg, 'r');
    if(_waPopup){ try{ _waPopup.close(); }catch(e){} _waPopup = null; }
  };

  let clientId=document.getElementById('vt_client')?.value;
  const wasNewClient = clientId === '__nouveau__';   // mémoriser AVANT que le INSERT change clientId
  const note=document.getElementById('vt_note')?.value.trim()||null;
  // Montant remis OBLIGATOIRE — pas de fallback à 0 sur champ vide
  const remisRaw = document.getElementById('vt_paye')?.value;
  if(remisRaw === '' || remisRaw === null || remisRaw === undefined){
    _showErr('Entre le montant remis par le client (mets 0 si pas payé).');
    return;
  }
  const remis = +remisRaw || 0;
  const pv=GP_POINT_VENTE||document.getElementById('vt_pv')?.value.trim()||null;
  const err=document.getElementById('vt_err');

  if(!VT_LIGNES.length){_showErr('Ajoute au moins un produit.');return;}
  if(!clientId){_showErr('Sélectionne un client (recherche ou ➕ Nouveau client).');return;}

  // ── CONTRÔLE STOCK : empêcher de vendre plus qu'on n'a ──
  if(GP_ROLE !== 'admin'){ // l'admin peut autoriser une vente en surstock (correction)
    await loadStockVente();
    const ruptures = [];
    // Agréger par formule (si plusieurs lignes même formule)
    const demande = {};
    for(const l of VT_LIGNES){
      if(l.type_produit !== 'formule') continue;
      demande[l.formule_nom] = (demande[l.formule_nom]||0) + Number(l.quantite||0);
    }
    for(const [formule, qte] of Object.entries(demande)){
      const dispo = Number(GP_STOCK_VENTE[formule]||0);
      if(qte > dispo + 0.001){
        ruptures.push(`${formule} : demandé ${fmt(qte)} kg · dispo ${fmt(dispo)} kg`);
      }
    }
    if(ruptures.length){
      _showErr(`Stock insuffisant — vente bloquée :\n${ruptures.join('\n')}`);
      return;
    }
  }

  // 🔥 PRÉ-OUVRIR L'ONGLET WHATSAPP MAINTENANT (encore dans le user gesture du click)
  // Sera mis à jour avec l'URL wa.me à la fin. Si validation échoue après → _showErr le ferme.
  try{ _waPopup = window.open('about:blank', '_blank'); }catch(e){}

  // ── NOUVEAU CLIENT ──────────────────────────────
  if(clientId==='__nouveau__'){
    const nomComplet=document.getElementById('vt_cl_nom')?.value.trim();
    const ferme=document.getElementById('vt_cl_ferme')?.value.trim()||null;
    const localite=document.getElementById('vt_cl_localite')?.value.trim()||null;
    const tel=document.getElementById('vt_cl_tel')?.value.trim()||null;
    const typeNv=document.getElementById('vt_cl_type')?.value||'detail';
    if(!nomComplet){_showErr('Entre le nom du nouveau client.');return;}
    if(!tel){_showErr('Le numéro de téléphone est obligatoire pour un nouveau client.');return;}
    if(!localite){_showErr('La localité est obligatoire pour un nouveau client.');return;}
    // ── ANTI-DOUBLON : vérif finale avant INSERT ──
    const similaires=chercherClientsSimilaires(nomComplet, tel);
    if(similaires.length>0){
      const liste=similaires.map(c=>`• ${c.nom}${c.telephone?' ('+c.telephone+')':''}`).join('\n');
      const choix=confirm(
        `⚠ ${similaires.length} client(s) existent déjà avec un nom/téléphone similaire :\n\n${liste}\n\n`+
        `Cliquez "OK" pour utiliser le premier de la liste, ou "Annuler" pour créer quand même un nouveau client.`
      );
      if(choix){
        // Utiliser le premier match — pas d'INSERT, on remplace clientId
        clientId=similaires[0].id;
        notify('Client existant utilisé : '+similaires[0].nom,'gold');
      } else {
        // L'utilisateur force la création — on continue
      }
    }
    if(clientId==='__nouveau__'){
      const parrainSel=document.getElementById('vt_cl_parrain')?.value||null;
      const parrainIdNv = parrainSel && parrainSel!=='' ? parrainSel : null;
      const{data:nc,error:ncErr}=await SB.from('gp_clients').insert({
        admin_id:GP_ADMIN_ID,
        point_vente:(GP_ROLE==='admin' ? null : (GP_POINT_VENTE||'Production')),
        nom:nomComplet,telephone:tel,
        type_client:typeNv,total_achats:0,
        nom_ferme:ferme,localite,
        parrain_id:parrainIdNv
      }).select().maybeSingle();
      if(ncErr){err.textContent='Erreur client: '+ncErr.message;return;}
      clientId=nc?.id||null;
      await loadClients();
      populateSelects();
      notify(nomComplet+' enregistré comme client ✓','gold');
    }
  }

  // montant_ligne = déjà net de remise ; remise_montant = somme des remises de lignes
  let remiseMontant=VT_LIGNES.reduce((s,l)=>s+Number(l.remise||0),0);
  const totalBrut=VT_LIGNES.reduce((s,l)=>s+Number(l.montant_ligne||0),0);
  // ── BON DE FIDÉLITÉ : appliqué en réduction globale ──
  const bonFidelite=Math.min(Number(window._bonFidelite)||0, totalBrut);
  const total=Math.max(0, totalBrut - bonFidelite);
  if(bonFidelite>0) remiseMontant += bonFidelite; // le bon est comptabilisé comme remise
  const remiseValidee=document.getElementById('vt_remise_validee')?.checked||false;
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
    prix_unitaire:VT_LIGNES.length?VT_LIGNES[0].prix_unitaire||0:0,
    remise_montant:remiseMontant,
    remise_motif:document.getElementById('vt_remise_motif')?.value.trim()||null,
    remise_validee:remiseValidee,
    remise_validee_par:remiseValidee?(document.getElementById('vt_remise_par')?.value.trim()||null):null
  }).select().maybeSingle();

  if(error){_showErr('Erreur enregistrement vente : '+error.message);return;}

  // Insérer les lignes
  await SB.from('gp_ventes_lignes').insert(
    VT_LIGNES.map(l=>({
      vente_id:vente.id,admin_id:GP_ADMIN_ID,
      formule_nom:l.formule_nom,quantite:l.quantite,
      prix_unitaire:l.prix_unitaire,montant_ligne:l.montant_ligne,
      remise:l.remise||0,
      type_prix:l.type_prix,
      type_produit:l.type_produit||'formule',
      sous_type:l.sous_type||null,
      ingredient_id:l.ingredient_id||null,
      veto_id:l.veto_id||null
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
      // Trigger B : vérifier seuil critique après sortie MP
      if(typeof verifierAlerteStockMP === 'function') verifierAlerteStockMP(l.ingredient_id);
    }
  }

  // Mouvement caisse automatique — fallback intelligent en cascade
  // 1. caisse dédiée au PDV de la vente
  // 2. fallback : caisse siège (point_vente IS NULL)
  // 3. fallback : N'IMPORTE quelle caisse physique active
  // 4. AUCUNE caisse → notification rouge claire à l'admin
  window._lastVenteCaisseNom = null;
  if(paye>0){
    let caisseTarget = null;
    if(pv){
      const{data:cPdv}=await SB.from('gp_caisses').select('id,nom')
        .eq('admin_id',GP_ADMIN_ID).eq('actif',true)
        .eq('point_vente',pv).maybeSingle();
      if(cPdv) caisseTarget = cPdv;
    }
    if(!caisseTarget){
      const{data:cSiege}=await SB.from('gp_caisses').select('id,nom')
        .eq('admin_id',GP_ADMIN_ID).eq('actif',true)
        .eq('type','physique').is('point_vente',null).maybeSingle();
      if(cSiege) caisseTarget = cSiege;
    }
    if(!caisseTarget){
      const{data:cAny}=await SB.from('gp_caisses').select('id,nom')
        .eq('admin_id',GP_ADMIN_ID).eq('actif',true)
        .eq('type','physique').limit(1).maybeSingle();
      if(cAny) caisseTarget = cAny;
    }
    if(caisseTarget){
      await SB.from('gp_mouvements_caisse').insert({
        admin_id:GP_ADMIN_ID, caisse_id:caisseTarget.id,
        type:'entree', categorie:'vente',
        montant:paye, date_mouvement:today(),
        description:'Vente '+vente.id.slice(0,8),
        vente_id:vente.id,
        enregistre_par:GP_USER?.id,
        enregistre_par_nom:GP_USER?.email?.split('@')[0]
      });
      window._lastVenteCaisseNom = caisseTarget.nom;
    } else {
      // Aucune caisse trouvée → alerte gros et clair
      if(typeof notify==='function'){
        notify(`⚠ ${fmt(paye)} F NON crédité — aucune caisse. Crée-en une via Page Caisse.`,'r');
      }
    }
  }

  // Déduire du stock (formules) — en KG. Utilise le PDV source sélectionné (pdvSourceVente).
  {
    const pdvStock = typeof pdvSourceVente === 'function' ? pdvSourceVente() : (GP_POINT_VENTE || 'Production');
    for(const l of VT_LIGNES){
      if(l.type_produit==='mp') continue; // les MP sont déjà décrémentées dans gp_stock_mp
      if(l.type_produit==='ferme') continue; // les produits ferme ne sont pas du stock provenderie
      if(l.type_produit==='prestation') continue; // les prestations ne touchent aucun stock
      if(l.type_produit==='veto'){ // déduit le stock véto du PDV (FIFO par péremption)
        if(typeof deduireStockVeto==='function' && l.veto_id) await deduireStockVeto(pdvStock, l.veto_id, l.quantite);
        continue;
      }
      const{data:stock}=await SB.from('gp_stock_produits_pdv').select('*')
        .eq('admin_id',GP_ADMIN_ID).eq('pdv_nom',pdvStock)
        .eq('formule_nom',l.formule_nom).maybeSingle();
      if(stock){
        // quantite est en KG (sacs : nb_sacs×poids ; vrac : kg direct)
        const newQte=Math.max(0,Number(stock.qte_disponible)-Number(l.quantite||0));
        await SB.from('gp_stock_produits_pdv').update({qte_disponible:newQte,updated_at:new Date().toISOString()})
          .eq('id',stock.id);
        // Vérifier seuil critique
        if(newQte<=stock.seuil_critique){
          envoyerAlerteSeuil(pdvStock,l.formule_nom,newQte,stock.seuil_critique);
        }
      }
    }
  }

  // ── DEFAULTS INTELLIGENTS : mémoriser le 1er produit (le + courant) sur le client ──
  // On prend la 1re ligne de la vente comme "dernière habitude" du client.
  if(clientId && VT_LIGNES.length){
    const l0=VT_LIGNES[0];
    try{
      await SB.from('gp_clients').update({
        derniere_formule: l0.formule_nom||null,
        dernier_conditionnement: l0.conditionnement?String(l0.conditionnement):null,
        derniere_qte: Number(l0.quantite)||null
      }).eq('id',clientId).eq('admin_id',GP_ADMIN_ID);
      // Mettre à jour le cache local pour les ventes suivantes
      const ci=GP_CLIENTS.findIndex(c=>c.id===clientId);
      if(ci>=0){
        GP_CLIENTS[ci].derniere_formule=l0.formule_nom||null;
        GP_CLIENTS[ci].dernier_conditionnement=l0.conditionnement?String(l0.conditionnement):null;
        GP_CLIENTS[ci].derniere_qte=Number(l0.quantite)||null;
      }
    }catch(e){ /* silencieux — pas critique */ }
  }

  // ── FIDÉLITÉ : points par sac d'aliment (3 pts/sac 25kg, 5 pts/sac 50kg, vrac 0,12 pt/kg) ──
  window._lastVentePoints = null;
  if(clientId){
    const ptsGagnes = calcPointsVente(VT_LIGNES);
    if(ptsGagnes > 0){
      try{
        await SB.from('gp_fidelite_mouvements').insert({
          admin_id:GP_ADMIN_ID, client_id:clientId, vente_id:vente.id,
          points:ptsGagnes, type:'achat',
          description:`Achat (${ptsGagnes} pts)`
        });
        const ci=GP_CLIENTS.findIndex(c=>c.id===clientId);
        const soldeAvant = ci>=0 ? (Number(GP_CLIENTS[ci].points_fidelite)||0) : 0;
        const nouveauSolde = soldeAvant + ptsGagnes;
        await SB.from('gp_clients').update({points_fidelite:nouveauSolde})
          .eq('id',clientId).eq('admin_id',GP_ADMIN_ID);
        if(ci>=0) GP_CLIENTS[ci].points_fidelite = nouveauSolde;
        window._lastVentePoints = { gagnes:ptsGagnes, total:nouveauSolde };
      }catch(e){ /* silencieux — fidélité pas critique pour la vente */ }
    }
  }

  // ── BON DE FIDÉLITÉ utilisé : déduire du crédit du client ──
  if(clientId && bonFidelite>0){
    try{
      const ci=GP_CLIENTS.findIndex(c=>c.id===clientId);
      const creditAvant=ci>=0 ? (Number(GP_CLIENTS[ci].credit_fidelite)||0) : 0;
      const nouveauCredit=Math.max(0, creditAvant - bonFidelite);
      await SB.from('gp_clients').update({credit_fidelite:nouveauCredit})
        .eq('id',clientId).eq('admin_id',GP_ADMIN_ID);
      if(ci>=0) GP_CLIENTS[ci].credit_fidelite=nouveauCredit;
      await SB.from('gp_fidelite_mouvements').insert({
        admin_id:GP_ADMIN_ID, client_id:clientId, vente_id:vente.id,
        points:0, type:'bon_utilise',
        description:`Bon ${fmt(bonFidelite)} F utilisé`
      });
    }catch(e){ /* silencieux */ }
  }

  // ── PARRAINAGE : récompenses au parrain + bon de bienvenue au filleul ──
  if(clientId){
    try{
      const {data:cli} = await SB.from('gp_clients')
        .select('parrain_id,parrainage_recompense_1ere,bon_bienvenue_utilise,credit_fidelite')
        .eq('id',clientId).maybeSingle();
      if(cli?.parrain_id){
        // Compter les sacs 25 kg dans la vente
        let sacs25 = 0;
        for(const l of VT_LIGNES){
          if(l.type_produit!=='formule') continue;
          const cond=String(l.conditionnement||'');
          if(cond==='25'){
            sacs25 += Number(l.nb_sacs)>0 ? Number(l.nb_sacs) : Math.round(Number(l.quantite||0)/25);
          }
        }
        const PLAFOND_PARRAIN = 200;
        const {data:par} = await SB.from('gp_clients')
          .select('id,nom,points_fidelite,parrain_pts_cumules')
          .eq('id',cli.parrain_id).maybeSingle();
        if(par){
          const cumul = Number(par.parrain_pts_cumules)||0;
          const ptsPar = Number(par.points_fidelite)||0;
          const capRest = Math.max(0, PLAFOND_PARRAIN - cumul);
          let ptsAttribuer = 0;
          if(!cli.parrainage_recompense_1ere){
            // 1re vente : seuil 2 sacs 25 kg pour débloquer le bon
            if(sacs25 >= 2){
              const WELCOME = 1000;
              const newCredit = Number(cli.credit_fidelite||0) + WELCOME;
              await SB.from('gp_clients').update({
                credit_fidelite:newCredit,
                parrainage_recompense_1ere:true,
                bon_bienvenue_utilise:true
              }).eq('id',clientId).eq('admin_id',GP_ADMIN_ID);
              const ci=GP_CLIENTS.findIndex(c=>c.id===clientId);
              if(ci>=0){
                GP_CLIENTS[ci].credit_fidelite=newCredit;
                GP_CLIENTS[ci].parrainage_recompense_1ere=true;
                GP_CLIENTS[ci].bon_bienvenue_utilise=true;
              }
              await SB.from('gp_fidelite_mouvements').insert({
                admin_id:GP_ADMIN_ID, client_id:clientId, vente_id:vente.id,
                points:0, type:'bonus_parrainage',
                description:`Bon de bienvenue ${WELCOME} F (parrainé par ${par.nom||''})`
              });
              ptsAttribuer = Math.min(10, capRest);
              notify(`🎉 Bon bienvenue ${fmt(WELCOME)} F crédité + ${ptsAttribuer} pts à ${par.nom||'parrain'}`,'gold');
            }
          } else {
            // Ventes suivantes : 1 pt par sac 25 kg, plafonné
            ptsAttribuer = Math.min(sacs25, capRest);
          }
          if(ptsAttribuer > 0){
            await SB.from('gp_clients').update({
              points_fidelite: ptsPar + ptsAttribuer,
              parrain_pts_cumules: cumul + ptsAttribuer
            }).eq('id',par.id).eq('admin_id',GP_ADMIN_ID);
            const pi=GP_CLIENTS.findIndex(c=>c.id===par.id);
            if(pi>=0){
              GP_CLIENTS[pi].points_fidelite = ptsPar + ptsAttribuer;
              GP_CLIENTS[pi].parrain_pts_cumules = cumul + ptsAttribuer;
            }
            if(cli.parrainage_recompense_1ere){
              await SB.from('gp_fidelite_mouvements').insert({
                admin_id:GP_ADMIN_ID, client_id:par.id, vente_id:vente.id,
                points:ptsAttribuer, type:'parrainage',
                description:`Parrainage filleul (${ptsAttribuer} pts)`
              });
            } else {
              await SB.from('gp_fidelite_mouvements').insert({
                admin_id:GP_ADMIN_ID, client_id:par.id, vente_id:vente.id,
                points:ptsAttribuer, type:'parrainage_1ere',
                description:`Parrainage 1ʳᵉ vente (${ptsAttribuer} pts)`
              });
            }
          }
        }
      }
    }catch(e){ console.warn('parrainage:', e); }
  }

  window._bonFidelite=0;
  const bonEl=document.getElementById('vt-bon-fidelite'); if(bonEl) bonEl.style.display='none';

  // Rafraîchir le stock affiché dans le menu des formules
  await loadStockVente();
  populateSelects();

  const lignes_a_insert=VT_LIGNES.slice();
  VT_LIGNES=[];renderLignesVente();
  // Nettoyer TOUS les champs du formulaire pour repartir d'une page vierge
  [
    'vt_note','vt_paye','vt_remise_valeur','vt_remise_motif',
    'vt_formule_search','vt_qte','vt_prix','vt_prix_sac','vt_nb_sacs',
    'vt_tel_search',
    'vt_cl_nom','vt_cl_tel','vt_cl_ferme','vt_cl_localite'
  ].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});
  // Resets sélecteurs
  const sel = (id,val)=>{const e=document.getElementById(id);if(e)e.value=val;};
  sel('vt_remise_type','totale');
  sel('vt_client','');
  sel('vt_formule','');
  sel('vt_poids_sac','25');
  sel('vt_cl_type','detail');
  sel('vt_cl_parrain','');
  // Cacher la zone nouveau client + badge + résultats recherche
  ['vt-nouveau-client','vt-cl-similaires','vt-client-badge','vt_client_results']
    .forEach(id=>{const el=document.getElementById(id);if(el)el.style.display='none';});
  const info=document.getElementById('vt-client-info'); if(info) info.innerHTML='';
  // Checkboxes
  const remiseChk=document.getElementById('vt_remise_validee');
  if(remiseChk)remiseChk.checked=false;
  const remiseParEl=document.getElementById('vt_remise_par');
  if(remiseParEl)remiseParEl.value='';
  // Fidélité
  window._bonFidelite=0;
  initRemiseVente();
  err.textContent='';

  // Notification claire (rappel monnaie si applicable + caisse créditée)
  const caisseSuffix = window._lastVenteCaisseNom ? ` · 💵 ${window._lastVenteCaisseNom}` : '';
  if(monnaie > 0){
    notify(`✅ Vente enregistrée — 💰 Rendre ${fmt(monnaie)} F au client${caisseSuffix}`, 'gold');
  } else {
    notify(`✅ Vente enregistrée${caisseSuffix}`, 'gold');
  }

  // Afficher bloc d'actions (Imprimer + WhatsApp) sous le formulaire
  const clientFinal = GP_CLIENTS.find(c=>c.id===clientId) || client;
  afficherActionsApresVente({...vente, lignes: lignes_a_insert}, clientFinal, total, remis, paye, monnaie);

  // AUTO-OUVRIR WHATSAPP avec message adapté (nouveau client → + carte fidélité)
  const reste = Math.max(0, total - paye);
  autoOuvrirWAApresVente(clientFinal, vente, wasNewClient, lignes_a_insert, total, paye, reste, _waPopup);

  renderVentes();
}

// ── AUTO-WA APRÈS VENTE ─────────────────────────────────
// Nouveau client : message bienvenue + lien carte fidélité numérique
// Ancien client : message de remerciement / récap vente
// prePopup : onglet pré-ouvert (about:blank) qu'on redirige vers wa.me (anti-blocker).
async function autoOuvrirWAApresVente(client, vente, isNewClient, lignes, total, paye, reste, prePopup){
  if(!client?.id){
    if(prePopup){ try{ prePopup.close(); }catch(e){} }
    return;
  }
  const tel = client.whatsapp || client.telephone || '';
  if(!tel){
    if(prePopup){ try{ prePopup.close(); }catch(e){} }
    notify('Pas de numéro WhatsApp — message non envoyé','gold');
    return;
  }
  const prov = GP_CONFIG?.nom_provenderie || 'SADARI';
  const produitsLines = (lignes||[]).map(l=>
    `• ${l.formule_nom} : ${fmtKg(l.quantite)} kg = ${fmt(l.montant_ligne)} F`
  ).join('\n');
  const payeLine = reste > 0
    ? `💵 Payé : ${fmt(paye)} F · Reste à payer : *${fmt(reste)} F*`
    : `✓ Payé intégralement`;

  let msg;
  if(isNewClient){
    // Construire le lien carte fidélité court
    let carteUrl = '';
    try{
      if(typeof assurerQRToken === 'function') await assurerQRToken(client);
      if(typeof encoderLienCarte === 'function' && client.qr_token){
        const num = client.numero_membre || client.id.slice(0,6).toUpperCase();
        const tok = encoderLienCarte({
          c: client.id, t: client.qr_token, a: GP_ADMIN_ID,
          n: client.nom||'', m: num, pa: null, pn:'', og: '3'
        });
        carteUrl = 'https://fidelite.avifarmer.net/carte#' + tok;
      }
    }catch(e){ console.warn('carte url:', e); }

    msg = `🌾 Bienvenue *${client.nom}* chez *${prov}* !\n\n` +
          `✅ Ta 1ʳᵉ vente est enregistrée :\n${produitsLines}\n` +
          `*Total : ${fmt(total)} F*\n` +
          `${payeLine}\n\n` +
          (carteUrl
            ? `🎁 *Ta carte de fidélité numérique* (toujours dans ton téléphone) :\n${carteUrl}\n\n` +
              `Présente ce QR à chaque achat pour cumuler des points et gagner des cadeaux 🎁\n\n`
            : '') +
          `Bienvenue dans la famille ${prov} 🤝`;
  } else {
    const pts = window._lastVentePoints;
    const ptsLine = (pts && pts.gagnes>0)
      ? `\n🎁 +${pts.gagnes} pts fidélité (total : ${pts.total} pts)`
      : '';
    msg = `🌾 Bonjour *${client.nom}*,\n\n` +
          `✅ Ton achat chez *${prov}* :\n${produitsLines}\n` +
          `*Total : ${fmt(total)} F*\n` +
          `${payeLine}${ptsLine}\n\n` +
          `Merci de ta confiance 🤝`;
  }

  // Construire l'URL WhatsApp
  const p = (typeof detecterPays === 'function')
    ? detecterPays(tel)
    : { numero_whatsapp: String(tel).replace(/[^0-9]/g,'') };
  const url = 'https://wa.me/' + p.numero_whatsapp + '?text=' + encodeURIComponent(msg);

  // 1. Tentative idéale : rediriger le popup pré-ouvert (préserve le user gesture)
  let ouverture_ok = false;
  if(prePopup && !prePopup.closed){
    try{ prePopup.location.href = url; ouverture_ok = true; }catch(e){ console.warn('prePopup redirect failed', e); }
  }
  // 2. Tentative 2 : window.open direct (échouera souvent à cause du bloqueur)
  if(!ouverture_ok){
    const fresh = window.open(url, '_blank');
    if(fresh){ ouverture_ok = true; }
  }
  // 3. Fallback : grosse overlay avec gros bouton vert que l'utilisateur peut taper
  if(!ouverture_ok){
    afficherOverlayWAManuel(url, client.nom||'le client');
  }

  // Marquer la vente comme envoyée
  try{
    await SB.from('gp_ventes').update({
      wa_envoye: true,
      wa_envoye_at: new Date().toISOString()
    }).eq('id', vente.id);
  }catch(e){ /* silencieux */ }
}

// Overlay plein écran avec gros bouton WhatsApp — fallback si le popup a été bloqué
function afficherOverlayWAManuel(waUrl, clientNom){
  const existing = document.getElementById('auto-wa-overlay');
  if(existing) existing.remove();
  const overlay = document.createElement('div');
  overlay.id = 'auto-wa-overlay';
  overlay.style.cssText = `
    position:fixed;inset:0;background:rgba(0,0,0,.85);backdrop-filter:blur(6px);
    z-index:99999;display:flex;align-items:center;justify-content:center;padding:16px`;
  overlay.innerHTML = `
    <div style="background:#fff;border-radius:20px;padding:32px 26px;max-width:380px;
      text-align:center;box-shadow:0 25px 70px rgba(0,0,0,.5);width:100%">
      <div style="font-size:56px;margin-bottom:8px">✅</div>
      <div style="font-size:20px;font-weight:800;color:#0F172A;margin-bottom:6px">Vente enregistrée</div>
      <div style="font-size:14px;color:#64748B;margin-bottom:24px;line-height:1.4">
        Tape sur le bouton pour envoyer la confirmation à <b style="color:#0F172A">${clientNom}</b> via WhatsApp.
      </div>
      <a href="${waUrl.replace(/"/g,'&quot;')}" target="_blank" rel="noopener"
        onclick="setTimeout(()=>{const el=document.getElementById('auto-wa-overlay');if(el)el.remove();},300)"
        style="display:flex;align-items:center;justify-content:center;gap:12px;
        background:linear-gradient(135deg,#25D366,#128C7E);color:#fff;border:none;border-radius:16px;
        padding:20px;font-size:18px;font-weight:800;text-decoration:none;
        box-shadow:0 8px 24px rgba(37,211,102,.5);text-transform:uppercase;letter-spacing:.5px">
        📲 Envoyer WhatsApp
      </a>
      <button onclick="document.getElementById('auto-wa-overlay').remove()"
        style="background:none;border:none;color:#94A3B8;font-size:13px;
        margin-top:18px;cursor:pointer;font-family:inherit;font-weight:500">
        Plus tard
      </button>
    </div>`;
  document.body.appendChild(overlay);
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

  // Bloc fidélité : points gagnés sur cette vente
  const pts = window._lastVentePoints;
  const fideliteBlock = (pts && pts.gagnes>0 && client?.id)
    ? `<div style="background:rgba(232,197,71,.12);border:1px solid rgba(232,197,71,.4);border-radius:8px;padding:10px;margin-bottom:10px;text-align:center;color:var(--gold);font-size:13px;font-weight:600">
        🎁 +${pts.gagnes} point${pts.gagnes>1?'s':''} de fidélité · Total : ${pts.total} pts
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
    ${fideliteBlock}
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
      ${client?.id?`
      <button id="post-vente-carte"
        onclick="ouvrirCarteClient('${client.id}')"
        style="grid-column:span 2;min-height:38px;padding:8px;border-radius:8px;cursor:pointer;font-family:'Outfit',sans-serif;font-weight:600;font-size:12px;background:rgba(232,197,71,.12);color:var(--gold);border:1px solid rgba(232,197,71,.4)">
        📲 Envoyer la carte client (QR)
      </button>`:''}
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
  let produitsLine = L.map(l=>`   🌾 ${l.formule_nom} — ${l.quantite} kg × ${fmt(l.prix_unitaire)} F = *${fmt(l.montant_ligne)} F*`).join('\n');
  if(Number(v.remise_montant||0)>0) produitsLine += `\n   🎁 Remise accordée : *-${fmt(v.remise_montant)} F*`;
  const especeEmoji = {pondeuse:'🐔',chair:'🐔',lapin:'🐰',porc:'🐷',canard:'🦆',tilapia:'🐟',goliath:'🐔'};
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
  initRemiseVente();
  const filtDate=document.getElementById('vt-filtre-date')?.value||'';
  const filtStatut=document.getElementById('vt-filtre-statut')?.value||'';
  let q=SB.from('gp_ventes').select('*').eq('admin_id',GP_ADMIN_ID)
    .is('deleted_at', null)  // exclure les ventes en corbeille
    .order('created_at',{ascending:false}).limit(50);
  if(GP_ROLE!=='admin') q=q.eq('point_vente', GP_POINT_VENTE||'Production'); // cloisonnement PDV
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
        ${v.statut_paiement!=='paye'?`<button class="btn btn-g btn-sm" onclick="ouvrirPaiementVente('${v.id}')" title="Encaisser un paiement" style="padding:4px 7px">💳</button>`:''}
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
  let qk=SB.from('gp_ventes').select('*').eq('admin_id',GP_ADMIN_ID).gte('date',today()).lte('date',today());
  if(GP_ROLE!=='admin') qk=qk.eq('point_vente', GP_POINT_VENTE||'Production'); // cloisonnement PDV
  const{data:V}=await qk;
  const vd=V||[];
  // Sépare CA provenderie / ferme du jour
  const{provenderie:caProvMap, ferme:caFermeMap} = await separerCAProvFerme(vd.map(v=>v.id));
  const ca = vd.reduce((s,v)=>s+(caProvMap[v.id]||0),0);
  const caFerme = vd.reduce((s,v)=>s+(caFermeMap[v.id]||0),0);
  let impaye=0;
  vd.forEach(v=>{
    const r=ratioProvenderie(v.id,caProvMap,caFermeMap);
    const totalProv=caProvMap[v.id]||0;
    const payeProv=Number(v.montant_paye||0)*r;
    const reste=totalProv-payeProv;
    if(reste>0)impaye+=reste;
  });
  document.getElementById('ventes-kpis').innerHTML=`
    <div class="econo-box"><div class="econo-val">${vd.length}</div><div class="econo-lbl">Ventes du jour</div></div>
    <div class="econo-box"><div class="econo-val" style="color:var(--gold)">${GP_ROLE==='admin'?fmt(ca)+' F':'—'}</div><div class="econo-lbl">CA Prov. du jour</div></div>
    ${caFerme>0?`<div class="econo-box"><div class="econo-val" style="color:var(--g6)">🚜 ${fmt(caFerme)} F</div><div class="econo-lbl">CA Ferme du jour</div></div>`:''}
    <div class="econo-box"><div class="econo-val" style="color:${impaye>0?'var(--red)':'var(--green)'}">${GP_ROLE==='admin'?fmt(impaye)+' F':'—'}</div><div class="econo-lbl">Impayés du jour</div></div>
    <div class="econo-box"><div class="econo-val">${vd.reduce((s,v)=>s+Number(v.qte_vendue||0),0).toFixed(0)}</div><div class="econo-lbl">Kg vendus</div></div>`;
}

async function renderDep(){
  // Datalist Bénéficiaire = fournisseurs + clients enregistrés (recherche + auto-complétion)
  try{
    const[{data:fournDL},{data:clientsDL}]=await Promise.all([
      SB.from('gp_fournisseurs').select('nom').eq('admin_id',GP_ADMIN_ID).eq('actif',true).order('nom'),
      SB.from('gp_clients').select('nom').eq('admin_id',GP_ADMIN_ID).order('nom')
    ]);
    const dl=document.getElementById('dep-fourn-list');
    if(dl){
      const fourns=(fournDL||[]).map(f=>`<option value="${(f.nom||'').replace(/"/g,'&quot;')}">Fournisseur</option>`);
      const cls=(clientsDL||[]).map(c=>`<option value="${(c.nom||'').replace(/"/g,'&quot;')}">Client</option>`);
      dl.innerHTML=[...fourns,...cls].join('');
    }
  }catch(e){}
  // Cloisonnement PDV : verrouiller le champ "point de vente" sur celui du secrétaire
  const depPvEl=document.getElementById('dep_pv');
  if(depPvEl && GP_ROLE!=='admin'){ depPvEl.value=GP_POINT_VENTE||'Production'; depPvEl.readOnly=true; depPvEl.style.opacity='.7'; }
  const filtMois=document.getElementById('dep-filtre-mois')?.value||thisMonth();
  let q=SB.from('gp_depenses').select('*').eq('admin_id',GP_ADMIN_ID).order('date',{ascending:false}).limit(100);
  if(GP_ROLE!=='admin') q=q.eq('point_vente', GP_POINT_VENTE||'Production'); // ne voit que SES dépenses
  if(filtMois)q=q.gte('date',filtMois+'-01').lte('date',finMois(filtMois));
  const{data}=await q;
  const D=data||[];
  const total=D.reduce((s,d)=>s+Number(d.montant||0),0);

  // Achats MP de la période (LECTURE SEULE) : déjà comptés via le module Achats.
  // Affichés ici pour que la secrétaire voie qu'ils sont pris en compte → évite la re-saisie en dépense (double comptage).
  let mpRows=[];
  // Les achats MP sont centraux → bloc visible seulement par admin + Production (pas les PDV de vente)
  const peutVoirMP = GP_ROLE==='admin' || !GP_POINT_VENTE;
  if(peutVoirMP){
    try{
      let qa=SB.from('gp_achats_paiements').select('montant,mode_paiement,date_paiement,reference')
        .eq('admin_id',GP_ADMIN_ID).order('date_paiement',{ascending:false}).limit(100);
      if(filtMois)qa=qa.gte('date_paiement',filtMois+'-01').lte('date_paiement',finMois(filtMois));
      const{data:pa}=await qa;
      mpRows=pa||[];
    }catch(e){}
  }
  const totalMP=mpRows.reduce((s,p)=>s+Number(p.montant||0),0);
  const mpBanner=`<div style="background:rgba(22,163,74,.06);border:1px solid rgba(22,163,74,.25);border-radius:8px;padding:10px 12px;margin-bottom:12px">
    <div style="font-weight:700;color:var(--g6);font-size:12px;margin-bottom:4px">🔒 Achats matières premières (module 🛒 Achats MP)</div>
    <div style="color:var(--textm);font-size:10px;margin-bottom:6px">Déjà comptés dans les dépenses — <b>ne pas les re-saisir ci-dessous.</b>${GP_ROLE==='admin'?` Total payé sur la période : <b style="color:var(--red)">${fmt(totalMP)} F</b>`:''}</div>
    ${mpRows.length?`<table class="tbl" style="font-size:10px"><tbody>${mpRows.slice(0,8).map(p=>`<tr>
      <td style="color:var(--textm)">${p.date_paiement}</td>
      <td>${p.reference||p.mode_paiement||'paiement fournisseur'}</td>
      ${GP_ROLE==='admin'?`<td class="num" style="color:var(--red)">${fmt(p.montant)} F</td>`:''}
    </tr>`).join('')}</tbody></table>${mpRows.length>8?`<div style="font-size:9px;color:var(--textm);margin-top:4px">… et ${mpRows.length-8} autre(s)</div>`:''}`:`<div style="color:var(--textm);font-size:10px">Aucun paiement MP sur la période.</div>`}
  </div>`;

  document.getElementById('dep-liste').innerHTML=`
    ${peutVoirMP?mpBanner:''}
    ${GP_ROLE==='admin'?`<div style="font-size:11px;color:var(--textm);margin-bottom:8px">Total dépenses (hors achats MP) : <strong style="color:var(--red)">${fmt(total)} FCFA</strong></div>`:''}
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
    point_vente:(GP_ROLE==='admin' ? (document.getElementById('dep_pv').value.trim()||null) : (GP_POINT_VENTE||'Production'))
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

// ── BASCULE TYPE PRODUIT (formule / matière première / produit ferme / prestation) ──
function basculerTypeProduitVente(type){
  document.getElementById('vt_type_produit').value = type;
  document.getElementById('vt_sous_type').value = type==='ferme' ? '' : '';
  const btnF = document.getElementById('vt_type_formule_btn');
  const btnM = document.getElementById('vt_type_mp_btn');
  const btnFE = document.getElementById('vt_type_ferme_btn');
  const btnP = document.getElementById('vt_type_prestation_btn');
  const btnV = document.getElementById('vt_type_veto_btn');
  const wrapF = document.getElementById('vt-formule-wrap');
  const wrapM = document.getElementById('vt-mp-wrap');
  const wrapFE = document.getElementById('vt-ferme-wrap');
  const wrapP = document.getElementById('vt-prestation-wrap');
  const wrapV = document.getElementById('vt-veto-wrap');
  const actif = 'background:rgba(22,163,74,.15);border:1px solid rgba(22,163,74,.4);color:var(--g6)';
  const inactif = 'background:var(--card2);border:1px solid var(--border);color:var(--textm)';
  const setActif = (btn, on) => {
    if(!btn) return;
    btn.style.cssText = (on ? btn.style.cssText.replace(inactif,'')+';'+actif
                            : btn.style.cssText.replace(actif,'')+';'+inactif);
  };
  setActif(btnF, type==='formule');
  setActif(btnM, type==='mp');
  setActif(btnFE, type==='ferme');
  setActif(btnP, type==='prestation');
  setActif(btnV, type==='veto');
  wrapF.style.display  = type==='formule' ? 'block' : 'none';
  wrapM.style.display  = type==='mp' ? 'block' : 'none';
  wrapFE.style.display = type==='ferme' ? 'block' : 'none';
  if(wrapP) wrapP.style.display = type==='prestation' ? 'block' : 'none';
  if(wrapV) wrapV.style.display = type==='veto' ? 'block' : 'none';
  // Cacher le conditionnement (sac kg) pour ferme et véto (vendus à l'unité)
  const condWrap = document.getElementById('vt_poids_sac')?.closest('.fr');
  if(condWrap) condWrap.style.display = (type==='ferme'||type==='veto') ? 'none' : 'block';
  // Adapter les labels Quantité / Prix selon le type
  const qteLbl = document.getElementById('vt-qte-label');
  if(qteLbl) qteLbl.textContent = (type==='ferme'||type==='veto') ? 'Quantité (unités)' : type==='prestation' ? 'Quantité travaillée (kg)' : 'Quantité (kg)';
  // Le label "Prix/kg" est inline, on cible son texte par parent
  const prixInput = document.getElementById('vt_prix');
  const prixLab = prixInput?.parentElement?.querySelector('label');
  if(prixLab) prixLab.textContent = (type==='ferme'||type==='veto') ? 'Prix/unité (FCFA)' : type==='prestation' ? 'Tarif (F/unité)' : 'Prix/kg (FCFA)';

  if(type === 'mp') populateSelectMPVente();
  if(type === 'prestation') loadServices();
  if(type === 'veto' && typeof populateSelectVetoVente==='function') populateSelectVetoVente();
  // Reset champs prix/qté
  ['vt_qte','vt_nb_sacs','vt_prix','vt_ferme_desc','vt_prestation_detail','vt_veto'].forEach(id => {
    const el = document.getElementById(id); if(el) el.value = '';
  });
  const vvId=document.getElementById('vt_veto_id'); if(vvId)vvId.value='';
  const vvInfo=document.getElementById('vt-veto-stock-info'); if(vvInfo)vvInfo.textContent='';
  const svcSel = document.getElementById('vt_service'); if(svcSel) svcSel.value = '';
  const svcInfo = document.getElementById('vt-prestation-info'); if(svcInfo) svcInfo.textContent = '';
  // Reset boutons sous-type ferme
  document.querySelectorAll('.vt-ferme-btn').forEach(b=>{
    b.style.cssText = b.style.cssText.replace(actif,'')+';'+inactif;
  });
  document.getElementById('vt-cout-info').textContent = '';
}

// Peuple le sélecteur véto avec les produits disponibles au PDV de vente (stock + prix)
async function populateSelectVetoVente(){
  const sel=document.getElementById('vt_veto');
  if(!sel) return;
  const pdv=(typeof pdvSourceVente==='function')?pdvSourceVente():(GP_POINT_VENTE||'Production');
  let dispo={};
  try{ if(typeof vetoDispoPourVente==='function') dispo=await vetoDispoPourVente(pdv); }catch(e){}
  // Prix de vente depuis le catalogue
  const cat={}; (typeof GP_VETO_CATALOGUE!=='undefined'?GP_VETO_CATALOGUE:[]).forEach(p=>{cat[p.id]=p;});
  const items=Object.values(dispo);
  if(!items.length){
    sel.innerHTML='<option value="">— Aucun produit véto en stock à '+pdv+' —</option>';
    return;
  }
  sel.innerHTML='<option value="">— Sélectionner —</option>'+items.map(it=>{
    const prixV=cat[it.produit_id]?.prix_vente||0;
    return `<option value="${it.produit_id}" data-nom="${(it.nom||'').replace(/"/g,'&quot;')}" data-stock="${it.qte}" data-prix="${prixV}" data-unite="${it.unite||'unité'}">${it.nom} · ${fmt(it.qte)} ${it.unite||''} dispo</option>`;
  }).join('');
}

function onVenteVetoChange(){
  const sel=document.getElementById('vt_veto');
  const opt=sel?.selectedOptions?.[0];
  const info=document.getElementById('vt-veto-stock-info');
  const idEl=document.getElementById('vt_veto_id');
  if(!opt||!opt.value){ if(idEl)idEl.value=''; if(info)info.textContent=''; return; }
  if(idEl) idEl.value=opt.value;
  const prixEl=document.getElementById('vt_prix');
  if(prixEl && !prixEl.value) prixEl.value=opt.dataset.prix||0;
  const stock=Number(opt.dataset.stock||0);
  if(info){
    info.style.color = stock>0 ? 'var(--green)' : 'var(--red)';
    info.textContent = `${stock>0?'✅':'⛔'} ${fmt(stock)} ${opt.dataset.unite||''} en stock`;
  }
}

// Sélection d'un sous-type ferme (lapin_vivant / oeuf / poulet / autre_ferme)
function choisirSousTypeFerme(st){
  document.getElementById('vt_sous_type').value = st;
  const actif = 'background:rgba(22,163,74,.15);border:1px solid rgba(22,163,74,.4);color:var(--g6)';
  const inactif = 'background:var(--card2);border:1px solid var(--border);color:var(--textm)';
  document.querySelectorAll('.vt-ferme-btn').forEach(b=>{
    const on = b.dataset.type === st;
    b.style.cssText = (on ? b.style.cssText.replace(inactif,'')+';'+actif
                          : b.style.cssText.replace(actif,'')+';'+inactif);
  });
  // Pré-remplir description avec un placeholder selon le type
  const desc = document.getElementById('vt_ferme_desc');
  if(desc && !desc.value){
    desc.placeholder = ({
      lapin_vivant: 'Ex: Race rex 2 kg, Race californien…',
      oeuf: 'Ex: Œufs de poule pondeuse, Œufs bio…',
      poulet: 'Ex: Poulet de chair 1.5 kg, Pintade…',
      autre_ferme: 'Ex: Fumier 50 kg, Caneton…',
    })[st] || '';
  }
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
      style="padding:9px 12px;${cursorStyle};border-bottom:1px solid var(--card2);background:${bgColor};transition:background .15s"
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

// Fermer la liste MP si clic ailleurs
document.addEventListener('click', e => {
  const search = document.getElementById('vt_mp_search');
  const results = document.getElementById('vt_mp_results');
  if(search && results && !search.contains(e.target) && !results.contains(e.target)){
    results.style.display = 'none';
  }
});

// Fermer la liste CLIENT (résultats recherche par nom/tel) si clic ailleurs + bouton Nouveau client
document.addEventListener('click', e => {
  const search = document.getElementById('vt_tel_search');
  const results = document.getElementById('vt_client_results');
  const btnNouveau = document.querySelector('[onclick="ouvrirNouveauClient()"]');
  if(!search || !results) return;
  if(!search.contains(e.target) && !results.contains(e.target) && (!btnNouveau || !btnNouveau.contains(e.target))){
    results.style.display = 'none';
  }
});

function ajouterLigneVente(){
  const err = document.getElementById('vt_err');
  const typeProduit = document.getElementById('vt_type_produit')?.value || 'formule';
  const sousType = document.getElementById('vt_sous_type')?.value || null;

  // Récupérer le produit selon le type
  let produitNom, ingredientId = null, vetoId = null;
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
  } else if(typeProduit === 'ferme'){
    if(!sousType){ err.textContent = 'Choisissez le sous-type ferme (lapin / œuf / poulet / autre).'; return; }
    const desc = document.getElementById('vt_ferme_desc')?.value.trim();
    const labels = {lapin_vivant:'🐰 Lapin vivant', oeuf:'🥚 Œuf', poulet:'🐔 Poulet', autre_ferme:'📦 Produit ferme'};
    produitNom = labels[sousType] + (desc ? ` — ${desc}` : '');
  } else if(typeProduit === 'prestation'){
    const svcId = document.getElementById('vt_service')?.value;
    const svc = GP_SERVICES.find(x=>x.id===svcId);
    if(!svc){ err.textContent = 'Sélectionnez un service (Décorticage, Mouture…).'; return; }
    const detail = document.getElementById('vt_prestation_detail')?.value.trim();
    produitNom = '🛠 ' + svc.nom + (detail ? ` — ${detail}` : '');
  } else if(typeProduit === 'veto'){
    vetoId = document.getElementById('vt_veto_id')?.value || document.getElementById('vt_veto')?.value;
    if(!vetoId){ err.textContent = 'Sélectionnez un produit véto.'; return; }
    const opt = document.querySelector(`#vt_veto option[value="${vetoId}"]`);
    produitNom = opt?.dataset.nom || 'Produit véto';
    const stockDispo = Number(opt?.dataset.stock || 0);
    const qteSaisie = +document.getElementById('vt_qte')?.value || 0;
    if(stockDispo <= 0){ err.textContent = `🚫 ${produitNom} en rupture — vente impossible.`; return; }
    if(qteSaisie > stockDispo){
      if(!confirm(`⚠ Stock insuffisant : ${fmt(stockDispo)} dispo, vous voulez vendre ${qteSaisie}.\nContinuer quand même ?`)) return;
    }
  } else {
    produitNom = document.getElementById('vt_formule')?.value;
    if(!produitNom){ err.textContent = 'Sélectionnez une formule.'; return; }
  }

  const cond = (typeProduit==='ferme'||typeProduit==='veto') ? 'unite' : (document.getElementById('vt_poids_sac')?.value || 'kg');
  const nbSacs = cond !== 'kg' && cond !== 'unite' ? +document.getElementById('vt_nb_sacs')?.value || 0 : 0;
  let qte = +document.getElementById('vt_qte')?.value || 0;
  if(cond !== 'kg' && cond !== 'unite' && nbSacs > 0 && qte === 0) qte = nbSacs * +cond;
  if(!qte || qte <= 0){ err.textContent = 'Entrez une quantité.'; return; }

  const prixUnit = +document.getElementById('vt_prix')?.value || 0;
  if(!prixUnit){ err.textContent = typeProduit==='ferme' ? 'Le prix/unité est requis.' : 'Le prix/kg est requis.'; return; }

  // Remise de la ligne (selon le champ remise du formulaire), plafonnée au montant brut
  const montantBrut = Math.round(qte * prixUnit);
  const remiseLigne = Math.min(computeRemiseLigneVente(qte, nbSacs), montantBrut);

  // Construire la ligne (formule_nom sert d'étiquette dans tous les cas)
  const ligne = {
    formule_nom: produitNom,
    quantite: qte,
    prix_unitaire: prixUnit,
    remise: remiseLigne,
    montant_ligne: Math.max(0, montantBrut - remiseLigne),  // NET de remise
    conditionnement: cond,
    nb_sacs: nbSacs,
    type_produit: typeProduit,         // 'formule' | 'mp' | 'ferme' | 'prestation'
    sous_type: typeProduit==='ferme'
      ? sousType
      : (typeProduit==='prestation' ? (document.getElementById('vt_prestation_detail')?.value.trim() || null) : null),
    ingredient_id: ingredientId,        // null si formule/ferme/prestation
    veto_id: vetoId,                    // uuid produit véto (en mémoire) — sert à déduire le stock à la vente
    type_prix: (typeProduit==='ferme'||typeProduit==='veto') ? 'unite' : 'detail',
  };

  // Si même produit existe déjà — mise à jour
  const idx = VT_LIGNES.findIndex(l =>
    l.formule_nom === produitNom && l.type_produit === typeProduit && (l.sous_type||null) === (sousType||null)
  );
  if(idx >= 0){
    VT_LIGNES[idx] = ligne;
    notify('Ligne mise à jour ✓', 'gold');
  } else {
    VT_LIGNES.push(ligne);
  }

  // Reset champs
  ['vt_qte','vt_nb_sacs','vt_prix','vt_prix_sac','vt_remise_valeur','vt_ferme_desc'].forEach(id => {
    const el = document.getElementById(id); if(el) el.value = '';
  });
  if(typeProduit === 'formule'){
    document.getElementById('vt_formule').value = '';
    const fs = document.getElementById('vt_formule_search'); if(fs) fs.value = '';
  } else if(typeProduit === 'mp'){
    effacerSelectionMPVente();
  }
  // Replier le bloc remise et réinitialiser le bouton (la remise vient d'être appliquée à la ligne)
  const remBloc = document.getElementById('vt-remise-bloc');
  if(remBloc) remBloc.style.display = 'none';
  if(typeof majBoutonRemise === 'function') majBoutonRemise();
  err.textContent = '';
  calcVente();
  renderLignesVente();
}

async function supprimerLigneVente(idx){
  VT_LIGNES.splice(idx,1);
  renderLignesVente();
  calcVente();
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
          <span class="badge ${l.type_produit==='mp'?'bdg-b':l.type_produit==='prestation'?'bdg-gold':l.type_prix==='gros'?'bdg-gold':'bdg-g'}" style="font-size:8px;margin-left:4px">${l.type_produit==='mp'?'MP':l.type_produit==='prestation'?'PRESTA':l.type_prix||'detail'}</span>
          ${Number(l.remise)>0?`<div style="font-size:9px;color:var(--red)">remise −${fmt(l.remise)} F</div>`:''}
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
  if(val==='__nouveau__') populateParrainSelect();
}

function populateParrainSelect(){
  const sel=document.getElementById('vt_cl_parrain');
  if(!sel || sel.dataset.filled==='1') return;
  const opts=['<option value="">— Aucun —</option>'];
  const list=(GP_CLIENTS||[]).slice().sort((a,b)=>(a.nom||'').localeCompare(b.nom||''));
  for(const c of list){
    if(!c?.id || !c?.nom) continue;
    const nom=c.nom.replace(/</g,'&lt;');
    const tel=c.telephone?' · '+c.telephone:'';
    opts.push(`<option value="${c.id}">${nom}${tel}</option>`);
  }
  sel.innerHTML=opts.join('');
  sel.dataset.filled='1';
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
  const prixSacWrap=document.getElementById('vt-prix-sac-wrap');
  const remiseTypeEl=document.getElementById('vt_remise_type');

  if(val==='kg'){
    // Mode vrac — saisir directement les kg
    if(nbWrap)nbWrap.style.display='none';
    if(qteLabel)qteLabel.textContent='Quantité (kg)';
    if(nbInput)nbInput.value='';
    if(qteInput){qteInput.value='';qteInput.placeholder='Ex: 5';}
    if(prixSacWrap)prixSacWrap.style.display='none';
    if(remiseTypeEl)remiseTypeEl.value='kg'; // remise par kg en mode vrac
  } else {
    // Mode sacs
    if(nbWrap)nbWrap.style.display='block';
    if(qteLabel)qteLabel.textContent='Kg total (auto)';
    if(qteInput){qteInput.value='';qteInput.placeholder='';}
    if(prixSacWrap)prixSacWrap.style.display='block';
    syncPrixVente('kg'); // recalcule le prix/sac avec le nouveau poids
    if(remiseTypeEl)remiseTypeEl.value='sac'; // remise par sac en mode sacs
  }
  majLabelRemise();
  calcVente();
}

// ── VENTES — ACTIONS ────────────────────────────
// ── SUPPRESSION VENTE — revert complet + soft delete + audit log ──
// Restaure stock, caisse, fidélité, parrainage. Marque deleted_at (récupérable via Corbeille).
async function supprimerVente(id){
  if(GP_ROLE !== 'admin' && !GP_EST_GERANT){ notify('Suppression réservée à l\'admin','r'); return; }

  // 1. Récupérer tous les éléments liés à la vente
  const {data:vente} = await SB.from('gp_ventes').select('*').eq('id',id).eq('admin_id',GP_ADMIN_ID).maybeSingle();
  if(!vente){ notify('Vente introuvable','r'); return; }
  if(vente.deleted_at){ notify('Cette vente est déjà dans la Corbeille','r'); return; }

  const {data:lignes} = await SB.from('gp_ventes_lignes').select('*').eq('vente_id',id);
  const {data:caisseMvts} = await SB.from('gp_mouvements_caisse').select('*').eq('vente_id',id);
  const {data:fidMvts} = await SB.from('gp_fidelite_mouvements').select('*').eq('vente_id',id);
  const L = lignes||[]; const CM = caisseMvts||[]; const FM = fidMvts||[];

  // 2. Construire la liste des reverts à montrer dans la confirmation
  const reverts = [];
  for(const l of L){
    if(l.type_produit === 'formule'){
      reverts.push(`+${fmt(l.quantite)} kg ${l.formule_nom} → stock`);
    } else if(l.type_produit === 'mp'){
      reverts.push(`+${fmt(l.quantite)} kg ${l.formule_nom} → stock MP`);
    } else if(l.type_produit === 'veto'){
      reverts.push(`+${fmt(l.quantite)} ${l.formule_nom} → stock véto`);
    }
  }
  const totalCaisse = CM.reduce((s,m)=>s+Number(m.montant||0),0);
  if(totalCaisse > 0){
    reverts.push(`−${fmt(totalCaisse)} F retirés des caisses (${CM.length} mouvement(s))`);
  }
  const ptsClient = FM.filter(f=>f.type==='achat').reduce((s,f)=>s+Number(f.points||0),0);
  if(ptsClient > 0) reverts.push(`−${ptsClient} pts fidélité au client`);
  const ptsParrain = FM.filter(f=>f.type==='parrainage'||f.type==='parrainage_1ere').reduce((s,f)=>s+Number(f.points||0),0);
  if(ptsParrain > 0) reverts.push(`−${ptsParrain} pts au parrain (parrainage défait)`);
  const bonUtilise = FM.find(f=>f.type==='bon_utilise');
  if(bonUtilise){
    const m = (bonUtilise.description||'').match(/(\d[\d\s]*)\s*F/);
    const amt = m ? parseInt(m[1].replace(/\s/g,''),10) : 0;
    if(amt>0) reverts.push(`+${fmt(amt)} F bon fidélité restauré au client`);
  }
  const welcome = FM.find(f=>f.type==='bonus_parrainage');
  if(welcome) reverts.push(`Bon de bienvenue 1000 F retiré du filleul`);

  // 3. Modal de confirmation détaillée
  const detailHtml = reverts.length
    ? reverts.map(r=>`• ${r}`).join('<br>')
    : 'Aucun impact à reverser (vente vide ou sans paiement).';
  const ok = await confirmDeleteVenteModal(vente, detailHtml);
  if(!ok) return;

  // 4. EXÉCUTION DES REVERTS

  // 4a. Re-créditer le stock formules (gp_stock_produits_pdv)
  const pdvStock = vente.point_vente || 'Production';
  for(const l of L){
    if(l.type_produit === 'formule'){
      const {data:stk} = await SB.from('gp_stock_produits_pdv').select('id,qte_disponible')
        .eq('admin_id',GP_ADMIN_ID).eq('pdv_nom',pdvStock).eq('formule_nom',l.formule_nom).maybeSingle();
      if(stk){
        await SB.from('gp_stock_produits_pdv').update({
          qte_disponible: Number(stk.qte_disponible||0) + Number(l.quantite||0),
          updated_at: new Date().toISOString()
        }).eq('id', stk.id);
      } else {
        // Pas de ligne stock → en créer une avec la quantité restaurée
        await SB.from('gp_stock_produits_pdv').insert({
          admin_id: GP_ADMIN_ID, pdv_nom: pdvStock, formule_nom: l.formule_nom,
          qte_disponible: Number(l.quantite||0), seuil_critique: 100
        });
      }
    } else if(l.type_produit === 'veto'){
      if(typeof recrediterStockVeto==='function' && l.veto_id){
        await recrediterStockVeto(pdvStock, l.veto_id, l.quantite, l.formule_nom);
      }
    }
  }

  // 4b. Supprimer les entrées gp_stock_mp de cette vente (par ref)
  const refVente = 'Vente '+id.slice(0,8);
  await SB.from('gp_stock_mp').delete()
    .eq('admin_id',GP_ADMIN_ID).eq('ref',refVente);

  // 4c. Supprimer les mouvements caisse liés à la vente
  await SB.from('gp_mouvements_caisse').delete().eq('vente_id',id);

  // 4d. Revert fidélité — TRAITER CHAQUE MOUVEMENT INDIVIDUELLEMENT
  for(const f of FM){
    const pts = Number(f.points||0);
    if(pts > 0){
      // Soustraire les pts (achat, parrainage_1ere, parrainage)
      const {data:c} = await SB.from('gp_clients').select('points_fidelite,parrain_pts_cumules')
        .eq('id', f.client_id).maybeSingle();
      if(c){
        const upd = { points_fidelite: Math.max(0, Number(c.points_fidelite||0) - pts) };
        if(f.type === 'parrainage' || f.type === 'parrainage_1ere'){
          upd.parrain_pts_cumules = Math.max(0, Number(c.parrain_pts_cumules||0) - pts);
        }
        await SB.from('gp_clients').update(upd).eq('id', f.client_id);
      }
    } else if(f.type === 'bon_utilise'){
      // Restaurer credit_fidelite du client
      const m = (f.description||'').match(/(\d[\d\s]*)\s*F/);
      const amt = m ? parseInt(m[1].replace(/\s/g,''),10) : 0;
      if(amt > 0){
        const {data:c} = await SB.from('gp_clients').select('credit_fidelite')
          .eq('id', f.client_id).maybeSingle();
        if(c){
          await SB.from('gp_clients').update({
            credit_fidelite: Number(c.credit_fidelite||0) + amt
          }).eq('id', f.client_id);
        }
      }
    } else if(f.type === 'bonus_parrainage'){
      // Retirer le bon bienvenue du filleul + reset flags parrainage
      const m = (f.description||'').match(/(\d[\d\s]*)\s*F/);
      const amt = m ? parseInt(m[1].replace(/\s/g,''),10) : 1000;
      const {data:c} = await SB.from('gp_clients').select('credit_fidelite')
        .eq('id', f.client_id).maybeSingle();
      if(c){
        await SB.from('gp_clients').update({
          credit_fidelite: Math.max(0, Number(c.credit_fidelite||0) - amt),
          parrainage_recompense_1ere: false,
          bon_bienvenue_utilise: false
        }).eq('id', f.client_id);
      }
    }
  }
  // Supprimer les mouvements fidélité
  await SB.from('gp_fidelite_mouvements').delete().eq('vente_id',id);

  // 4e. Soft-delete la vente
  await SB.from('gp_ventes').update({
    deleted_at: new Date().toISOString(),
    deleted_by: GP_USER?.id,
    deleted_by_nom: GP_USER?.email?.split('@')[0] || 'admin'
  }).eq('id',id).eq('admin_id',GP_ADMIN_ID);

  // 5. Audit log
  try{
    await SB.from('gp_audit_log').insert({
      admin_id: GP_ADMIN_ID,
      table_name: 'gp_ventes',
      record_id: id,
      action: 'soft_delete',
      performed_by: GP_USER?.id,
      performed_by_nom: GP_USER?.email?.split('@')[0] || 'admin',
      details: {
        client: vente.client_nom,
        montant_total: vente.montant_total,
        montant_paye: vente.montant_paye,
        reverts: reverts
      }
    });
  }catch(e){ console.warn('audit log err', e); }

  await renderVentes();
  if(typeof renderCaisse === 'function') await renderCaisse();
  notify(`Vente supprimée — ${reverts.length} impact(s) reverté(s) ✓`,'gold');
}

// Modal de confirmation suppression vente
function confirmDeleteVenteModal(vente, detailHtml){
  return new Promise(resolve=>{
    const old = document.getElementById('modal-delete-vente');
    if(old) old.remove();
    const ov = document.createElement('div');
    ov.id = 'modal-delete-vente';
    ov.style.cssText = `position:fixed;inset:0;background:rgba(0,0,0,.8);backdrop-filter:blur(6px);
      z-index:9999;display:flex;align-items:center;justify-content:center;padding:16px`;
    ov.innerHTML = `
      <div style="background:var(--card2,#fff);border:2px solid var(--red);border-radius:16px;padding:24px;max-width:480px;width:100%;max-height:90vh;overflow-y:auto">
        <div style="font-size:18px;font-weight:800;color:var(--red);margin-bottom:8px">⚠ Supprimer la vente ?</div>
        <div style="font-size:13px;color:var(--text);margin-bottom:14px">
          Client : <b>${vente.client_nom||'—'}</b><br>
          Montant : <b>${fmt(vente.montant_total||0)} F</b> (payé ${fmt(vente.montant_paye||0)} F)<br>
          Date : ${vente.date||'—'}
        </div>
        <div style="background:rgba(232,197,71,.1);border:1px solid rgba(232,197,71,.4);border-radius:10px;padding:12px;margin-bottom:14px">
          <div style="font-weight:700;color:var(--gold);margin-bottom:6px;font-size:12px">📦 Ceci va RESTAURER :</div>
          <div style="font-size:12px;color:var(--text);line-height:1.6">${detailHtml}</div>
        </div>
        <div style="font-size:11px;color:var(--textm);margin-bottom:14px;line-height:1.4">
          ℹ La vente sera déplacée dans la <b>Corbeille</b> et pourra être restaurée plus tard.
          Les impacts (stock, caisse, fidélité) sont reversés immédiatement.
        </div>
        <div style="display:flex;gap:8px">
          <button id="dvm-confirm" class="btn btn-red" style="flex:1;justify-content:center;font-weight:800">⚠ Confirmer la suppression</button>
          <button id="dvm-cancel" class="btn btn-out" style="padding:0 18px">Annuler</button>
        </div>
      </div>`;
    document.body.appendChild(ov);
    document.getElementById('dvm-confirm').onclick = ()=>{ ov.remove(); resolve(true); };
    document.getElementById('dvm-cancel').onclick = ()=>{ ov.remove(); resolve(false); };
    ov.onclick = (e)=>{ if(e.target===ov){ ov.remove(); resolve(false); } };
  });
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

// ── ENCAISSER UN PAIEMENT (solde d'une vente partielle/impayée) ──
async function ouvrirPaiementVente(id){
  const{data:v}=await SB.from('gp_ventes').select('*').eq('id',id).maybeSingle();
  if(!v){notify('Vente introuvable','r');return;}
  const total=Number(v.montant_total||0), paye=Number(v.montant_paye||0);
  document.getElementById('pmv-vente-id').value=v.id;
  document.getElementById('pmv-client').textContent=v.client_nom||'Client comptant';
  document.getElementById('pmv-total').textContent=fmt(total)+' F';
  document.getElementById('pmv-deja').textContent=fmt(paye)+' F';
  document.getElementById('pmv-reste').textContent=fmt(Math.max(0,total-paye))+' F';
  document.getElementById('pmv-montant').value='';
  document.getElementById('pmv-err').textContent='';
  document.getElementById('modal-paiement-vente').style.display='flex';
}

function fermerPaiementVente(){
  document.getElementById('modal-paiement-vente').style.display='none';
}

async function savePaiementVente(){
  const id=document.getElementById('pmv-vente-id').value;
  const montant=+document.getElementById('pmv-montant').value||0;
  const mode=document.getElementById('pmv-mode').value||'especes';
  const err=document.getElementById('pmv-err');
  if(!id){err.textContent='Vente introuvable.';return;}
  if(montant<=0){err.textContent='Entrez le montant encaissé.';return;}
  const{data:v}=await SB.from('gp_ventes').select('montant_total,montant_paye,point_vente').eq('id',id).maybeSingle();
  if(!v){err.textContent='Vente introuvable.';return;}
  const total=Number(v.montant_total||0);
  const reste=Math.max(0,total-Number(v.montant_paye||0));
  if(reste<=0){err.textContent='Cette vente est déjà soldée.';return;}
  const montantApplique=Math.min(montant,reste);
  const nouveauPaye=Number(v.montant_paye||0)+montantApplique;
  const statut=nouveauPaye>=total?'paye':'partiel';
  const{error}=await SB.from('gp_ventes').update({
    montant_paye:nouveauPaye,statut_paiement:statut
  }).eq('id',id).eq('admin_id',GP_ADMIN_ID);
  if(error){err.textContent='Erreur: '+error.message;return;}
  // Mouvement de caisse (entrée) — le solde encaissé entre en caisse du PDV
  try{
    const modeLabel={especes:'Espèces',mobile_money:'Mobile Money',virement:'Virement',cheque:'Chèque'}[mode]||mode;
    const{data:caisse}=await SB.from('gp_caisses').select('id')
      .eq('admin_id',GP_ADMIN_ID).eq('point_vente',v.point_vente||'').maybeSingle();
    if(caisse){
      await SB.from('gp_mouvements_caisse').insert({
        admin_id:GP_ADMIN_ID,caisse_id:caisse.id,
        type:'entree',categorie:'vente',
        montant:montantApplique,date_mouvement:today(),
        description:'Solde vente '+id.slice(0,8)+' ('+modeLabel+')',
        vente_id:id,
        enregistre_par:GP_USER?.id,
        enregistre_par_nom:GP_USER?.email?.split('@')[0]
      });
    }
  }catch(e){}
  fermerPaiementVente();
  renderVentes();
  const monnaie=montant-montantApplique;
  notify(`Paiement de ${fmt(montantApplique)} F encaissé ✓`+(statut==='paye'?' — vente soldée 🎉':'')+(monnaie>0?` · Rendre ${fmt(monnaie)} F`:''),'gold');
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
  let produitsLine=L.map(l=>`   🌾 ${l.formule_nom} — ${l.quantite} kg × ${fmt(l.prix_unitaire)} F = *${fmt(l.montant_ligne)} F*`).join('\n');
  if(Number(v.remise_montant||0)>0) produitsLine += `\n   🎁 Remise accordée : *-${fmt(v.remise_montant)} F*`;

  // Espèce principale achetée pour personnaliser
  const especeEmoji={pondeuse:'🐔',chair:'🐔',lapin:'🐰',porc:'🐷',canard:'🦆',tilapia:'🐟',goliath:'🐔'};
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
  const especeEmoji={pondeuse:'🐔',chair:'🐔',lapin:'🐰',porc:'🐷',canard:'🦆',tilapia:'🐟',goliath:'🐔'};
  const formuleStr=L.map(l=>l.formule_nom).join(', ');
  const especeIcon=Object.entries(especeEmoji).find(([k])=>formuleStr.toLowerCase().includes(k))?.[1]||'🌾';
  let produitsLine=L.map(l=>{
    let s=`   🌾 ${l.formule_nom} — ${l.quantite} kg × ${fmt(l.prix_unitaire)} F = *${fmt(l.montant_ligne)} F*`;
    if(Number(l.remise||0)>0) s+=` _(remise −${fmt(l.remise)} F)_`;
    return s;
  }).join('\n');
  const remiseWA=L.reduce((s,l)=>s+Number(l.remise||0),0);
  if(remiseWA>0) produitsLine += `\n   🎁 Remise totale : *-${fmt(remiseWA)} F*`;
  const{data:histo}=await SB.from('gp_ventes').select('montant_total').eq('admin_id',GP_ADMIN_ID).eq('client_id',client.id);
  const nbAchats=(histo||[]).length;
  const totalHisto=(histo||[]).reduce((s,x)=>s+Number(x.montant_total||0),0);
  const v={client_nom:client.nom,date:today()};
  const msg=construireMessageRemerciement(v,produitsLine,total,GP_CONFIG?.nom_provenderie||'PROVENDA',
    client.localite||'',nbAchats,totalHisto,especeIcon,nbAchats>=5,totalHisto>=500000,nbAchats<=1);
  const p=detecterPays(tel);
  if(p.numero_whatsapp)window.open('https://wa.me/'+p.numero_whatsapp+'?text='+encodeURIComponent(msg),'_blank');
}
