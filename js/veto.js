// ══════════════════════════════════════════════════
// PROVENDA — BOUTIQUE VÉTO & MATÉRIEL D'ÉLEVAGE
//
// Porté depuis la boutique de ZONEO (public/js/boutique.js), à fonctionnalités
// égales, MAIS sur le modèle de Provéo : le stock reste en LOTS
// (`gp_stock_veto`, une ligne par réception, avec sa propre péremption) parce
// qu'un vaccin acheté en mars et un acheté en octobre ne périment pas le même
// jour, et que la vente sort en FIFO par péremption. ZONEO garde son stock dans
// une colonne : il n'a pas besoin du lot.
//
// Ce que la leçon de ZONEO apporte ici :
//   · six statuts, péremption d'abord, dont « Manque N » — un négatif n'est PAS
//     une rupture : « rupture » dit de réapprovisionner, un négatif dit que le
//     stock noté est FAUX et qu'il faut compter ;
//   · un négatif compte pour ZÉRO dans la valeur du stock, sinon la valeur mentirait ;
//   · sorties manuelles tracées (perte, casse, péremption, don) — un flacon cassé
//     ne pouvait jusqu'ici sortir que par une vente, donc restait éternellement en stock ;
//   · photo réduite au navigateur, fiche remplie par KEPELA, repère de prix,
//     « un client cherche… », palmarès des demandes, publication sur le marché MIGNA.
//
// La vente reste dans ventes.js (type_produit='veto') : on n'ouvre pas un
// deuxième chemin vers le stock.
// ══════════════════════════════════════════════════

let GP_VETO_CATALOGUE = [];
let GP_VETO_LOTS = [];          // lots visibles du dernier rendu (sert aux modales)

// ⚠️ Valeurs ACCENTUÉES conservées telles quelles : elles sont déjà en base.
// « matériel » est ajouté pour les outils d'élevage (mangeoire, abreuvoir, pince).
const VETO_CATEGORIES = ['vaccin','antibiotique','vitamine','déparasitant','désinfectant','matériel','autre'];
const VETO_CAT_INFO = {
  'vaccin':        { icon:'💉', l:'Vaccin' },
  'antibiotique':  { icon:'💊', l:'Antibiotique' },
  'vitamine':      { icon:'🧪', l:'Vitamine' },
  'déparasitant':  { icon:'🐛', l:'Déparasitant' },
  'désinfectant':  { icon:'🧼', l:'Désinfectant' },
  'matériel':      { icon:'🪣', l:'Matériel d\'élevage' },
  'autre':         { icon:'📦', l:'Autre' },
};
const VETO_UNITES = ['unité','pièce','flacon','boîte','sachet','dose','comprimé','paquet','lot','100g','1Kg','kg','100ml','ml','L'];

// Motifs d'une sortie qui n'est PAS une vente. Sans eux, un produit cassé ou
// périmé reste en stock pour toujours et l'inventaire ne tombe jamais juste.
const VETO_MOTIFS = [
  { v:'perte',      l:'Perte / vol' },
  { v:'casse',      l:'Casse' },
  { v:'peremption', l:'Périmé — détruit' },
  { v:'don',        l:'Don / échantillon' },
  { v:'usage',      l:'Utilisé à la ferme' },
  { v:'ajustement', l:'Ajustement d\'inventaire' },
];

function vetoCatInfo(v){ return VETO_CAT_INFO[v] || VETO_CAT_INFO['autre']; }
function _vEsc(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function _vQ(n){ n=Number(n)||0; return (Math.round(n*100)/100).toLocaleString('fr-FR'); }
function _vToday(){ return (typeof today==='function') ? today() : new Date().toISOString().slice(0,10); }
function _vIaBase(){ return (typeof IA_WORKER!=='undefined' && IA_WORKER) ? IA_WORKER : 'https://proveo-ia.atm-farmvillage.workers.dev'; }
async function _vToken(){ try{ const{data:{session}}=await SB.auth.getSession(); return session?.access_token||null; }catch(e){ return null; } }

async function loadVetoCatalogue(){
  const{data,error}=await SB.from('gp_produits_veto').select('*')
    .eq('admin_id',GP_ADMIN_ID).order('nom');
  if(error){ console.error('[veto] catalogue', error); }
  // Le catalogue garde les produits archivés hors de la vue, mais leur stock
  // existe encore : il reste visible dans « Stock par point de vente ».
  GP_VETO_CATALOGUE = (data||[]).filter(p=>p.actif!==false);
  return GP_VETO_CATALOGUE;
}

// LECTURE PAGINÉE. C'est la raison pour laquelle ZONEO a mis le stock en
// colonne : au-delà de 1000 lignes, PostgREST tronque EN SILENCE et le stock
// affiché devient faux. On a déjà payé ce piège sur les matières premières.
async function _vetoFetchLots(){
  const PAS=1000; let from=0, out=[];
  for(;;){
    const{data,error}=await SB.from('gp_stock_veto').select('*')
      .eq('admin_id',GP_ADMIN_ID)
      .order('date_peremption',{ascending:true,nullsFirst:false})
      .range(from, from+PAS-1);
    if(error){ console.error('[veto] lots', error); break; }
    const n=(data||[]).length;
    out=out.concat(data||[]);
    if(n<PAS) break;
    from+=PAS;
  }
  return out;
}

// Stock courant agrégé par produit pour un PDV donné (somme des lots).
// Utilisé par la vente — signature inchangée.
function vetoStockCourant(lots, pdvNom){
  const map={};
  (lots||[]).filter(l=>l.pdv_nom===pdvNom).forEach(l=>{
    const k=l.produit_id||l.produit_nom;
    if(!map[k]) map[k]={produit_id:l.produit_id,nom:l.produit_nom,unite:l.unite,qte:0};
    map[k].qte += Number(l.qte||0);
  });
  return map;
}

// Agrège TOUS les PDV visibles par produit, et retient la péremption la plus
// proche parmi les lots qui ont encore de la quantité : une date sur un lot vide
// n'alerte personne.
function vetoAgregerLots(lots){
  const map={};
  (lots||[]).forEach(l=>{
    const k=l.produit_id||l.produit_nom;
    if(!map[k]) map[k]={produit_id:l.produit_id,nom:l.produit_nom,unite:l.unite,qte:0,perem:null,nbLots:0};
    const a=map[k];
    a.qte += Number(l.qte||0);
    if(Number(l.qte||0)>0){
      a.nbLots++;
      if(l.date_peremption && (!a.perem || l.date_peremption < a.perem)) a.perem = l.date_peremption;
    }
  });
  return map;
}

function vetoJoursPeremption(d){
  if(!d) return null;
  const minuit=new Date(); minuit.setHours(0,0,0,0);
  return Math.round((new Date(d+'T00:00:00') - minuit)/86400000);
}

// Statut prioritaire : la péremption passe devant le stock (un produit périmé
// ne se vend pas, même s'il en reste cent).
function vetoStatut(agg, seuil){
  const jp = vetoJoursPeremption(agg && agg.perem);
  if(jp!=null && jp<0)   return { k:'perime',  l:'Périmé',               c:'var(--red)',   r:0 };
  const stock = Number((agg&&agg.qte)||0), s = Number(seuil||0);
  // ⚠️ Négatif ≠ rupture. « Rupture » = va réapprovisionner.
  //    Négatif = le stock noté est faux, il faut COMPTER.
  if(stock<0)            return { k:'negatif', l:'Manque '+_vQ(-stock), c:'var(--red)',   r:0 };
  if(stock===0)          return { k:'rupture', l:'Rupture',              c:'var(--red)',   r:0 };
  if(jp!=null && jp<=30){
    const l = jp===0 ? 'Périme ce jour' : jp===1 ? 'Périme demain' : 'Périme dans '+jp+' j';
    return { k:'bientot', l, c:'var(--gold)', r:1 };
  }
  if(s>0 && stock<=s)    return { k:'bas',     l:'Stock bas',            c:'var(--gold)',  r:1 };
  return { k:'ok', l:'OK', c:'var(--green)', r:2 };
}

// Valeur du stock + compteurs d'alerte, en UNE fonction pure et testée.
// Un négatif compte pour ZÉRO dans la valeur : un produit à −2 n'est pas de
// l'argent en moins sur l'étagère, c'est un comptage à refaire. Chez ZONEO,
// avoir oublié ce Math.max a retiré 3 000 F du patrimoine pour un seul article.
function vetoValeurEtCompteurs(catalogue, AGG){
  const out={valeur:0,nbPerime:0,nbBientot:0,nbRupture:0,nbBas:0};
  (catalogue||[]).forEach(p=>{
    const a=(AGG||{})[p.id] || {qte:0,perem:null};
    out.valeur += Math.max(0, Number(a.qte||0)) * Number(p.prix_vente||0);
    const k=vetoStatut(a, p.seuil_alerte).k;
    if(k==='perime') out.nbPerime++;
    else if(k==='bientot') out.nbBientot++;
    else if(k==='rupture'||k==='negatif') out.nbRupture++;
    else if(k==='bas') out.nbBas++;
  });
  return out;
}

// ══════════════════════════════════════════════════
// L'ÉCRAN
// ══════════════════════════════════════════════════
async function renderVeto(){
  if(!GP_ADMIN_ID) return;
  await loadVetoCatalogue();
  const{data:pdvsData}=await SB.from('gp_points_vente').select('nom')
    .eq('admin_id',GP_ADMIN_ID).order('nom');
  const PDVS=(pdvsData||[]).map(p=>p.nom);
  const L=await _vetoFetchLots();

  remplirSelectsVeto(PDVS);

  // Cloisonnement : un non-admin ne voit que son PDV + Production
  const monPDV = GP_POINT_VENTE||'Production';
  const lotsVisibles = (GP_ROLE==='admin') ? L : L.filter(l=>l.pdv_nom===monPDV||l.pdv_nom==='Production');
  GP_VETO_LOTS = lotsVisibles;

  const todayStr=_vToday();
  const in30=new Date(Date.now()+30*86400000).toISOString().slice(0,10);

  const AGG = vetoAgregerLots(lotsVisibles);
  const parProduitId = {}; GP_VETO_CATALOGUE.forEach(p=>{ parProduitId[p.id]=p; });

  // ── KPIs ──
  // La valeur du stock ignore les négatifs : un produit à −2 n'est pas de
  // l'argent en moins sur l'étagère, c'est un comptage à refaire.
  const {valeur, nbPerime, nbBientot, nbRupture, nbBas} = vetoValeurEtCompteurs(GP_VETO_CATALOGUE, AGG);
  const kpisEl=document.getElementById('veto-kpis');
  if(kpisEl) kpisEl.innerHTML=`
    <div class="econo-box"><div class="econo-val">${GP_VETO_CATALOGUE.length}</div><div class="econo-lbl">Produits au catalogue</div></div>
    <div class="econo-box"><div class="econo-val" style="color:var(--green)">${fmt(valeur)} F</div><div class="econo-lbl">Valeur du stock</div></div>
    <div class="econo-box"><div class="econo-val" style="color:${(nbPerime+nbBientot)?'var(--gold)':'var(--green)'}">${nbPerime+nbBientot}</div><div class="econo-lbl">Péremption</div></div>
    <div class="econo-box"><div class="econo-val" style="color:${(nbRupture+nbBas)?'var(--red)':'var(--green)'}">${nbRupture+nbBas}</div><div class="econo-lbl">Rupture / manque / bas</div></div>`;

  renderVetoAlertes(lotsVisibles, todayStr, in30);
  renderVetoCatalogue(AGG);
  renderVetoStockParPDV(lotsVisibles, todayStr, in30);

  // Le micro n'est proposé que si le téléphone sait dicter : on ne promet pas
  // un bouton qui ne marchera pas.
  const mic=document.getElementById('vbz-mic');
  if(mic) mic.style.display = (window.SpeechRecognition||window.webkitSpeechRecognition) ? '' : 'none';
  renderVetoDemandes();
}

function remplirSelectsVeto(PDVS){
  // Select PDV de réception : non-admin verrouillé sur son PDV
  const selPdv=document.getElementById('vtk_pdv');
  if(selPdv){
    if(GP_ROLE==='admin'){
      selPdv.innerHTML='<option value="Production">🏭 Production (siège)</option>'+
        (PDVS||[]).map(n=>`<option value="${_vEsc(n)}">${_vEsc(n)}</option>`).join('');
      selPdv.disabled=false;
    } else {
      const monPDV=GP_POINT_VENTE||'Production';
      selPdv.innerHTML=`<option value="${_vEsc(monPDV)}">${_vEsc(monPDV)}</option>`;
      selPdv.value=monPDV; selPdv.disabled=true;
    }
  }
  // Select produit (catalogue)
  const selProd=document.getElementById('vtk_produit');
  if(selProd){
    const garde=selProd.value;
    selProd.innerHTML='<option value="">— Produit —</option>'+
      GP_VETO_CATALOGUE.map(p=>`<option value="${p.id}" data-unite="${_vEsc(p.unite||'unité')}" data-prix="${p.prix_achat||0}">${vetoCatInfo(p.categorie).icon} ${_vEsc(p.nom)}</option>`).join('');
    if(garde) selProd.value=garde;
  }
  // Selects de la modale produit
  const selUnite=document.getElementById('vcat_unite');
  if(selUnite&&!selUnite.dataset.filled){
    selUnite.innerHTML=VETO_UNITES.map(u=>`<option value="${u}">${u}</option>`).join('');
    selUnite.dataset.filled='1';
  }
  const selCat=document.getElementById('vcat_cat');
  if(selCat&&!selCat.dataset.filled){
    selCat.innerHTML=VETO_CATEGORIES.map(c=>`<option value="${c}">${vetoCatInfo(c).icon} ${vetoCatInfo(c).l}</option>`).join('');
    selCat.dataset.filled='1';
  }
  const selMotif=document.getElementById('vmv_motif');
  if(selMotif&&!selMotif.dataset.filled){
    selMotif.innerHTML=VETO_MOTIFS.map(m=>`<option value="${m.v}">${m.l}</option>`).join('');
    selMotif.dataset.filled='1';
  }
}

// Préremplit unité + prix d'achat quand on choisit un produit dans la réception
function onVetoProduitChange(){
  const sel=document.getElementById('vtk_produit');
  const opt=sel&&sel.selectedOptions&&sel.selectedOptions[0];
  if(!opt||!opt.value) return;
  const uEl=document.getElementById('vtk_unite_label');
  if(uEl) uEl.textContent=opt.dataset.unite||'unité';
  const prixEl=document.getElementById('vtk_prix');
  if(prixEl&&!prixEl.value) prixEl.value=opt.dataset.prix||0;
  vetoMajTotalEntree();
}

// Le montant de la dépense est calculé sous les yeux de la secrétaire : c'est
// ce chiffre-là qui sortira de la caisse, il ne doit pas être une surprise.
function vetoMajTotalEntree(){
  const q=+((document.getElementById('vtk_qte')||{}).value)||0;
  const p=+((document.getElementById('vtk_prix')||{}).value)||0;
  const el=document.getElementById('vtk_total');
  if(el) el.textContent = (q>0&&p>0) ? ('Coût de l\'entrée : '+fmt(q*p)+' F') : '';
}

// ══════════════════════════════════════════════════
// MODALE PRODUIT (catalogue)
// ══════════════════════════════════════════════════
function vetoOuvrirProduit(id){
  const err=document.getElementById('vcat_err'); if(err) err.textContent='';
  remplirSelectsVeto(null);
  const p = id ? GP_VETO_CATALOGUE.find(x=>x.id===id) : null;
  const set=(k,v)=>{ const el=document.getElementById(k); if(el) el.value = (v==null?'':v); };
  document.getElementById('vcat_titre').textContent = p ? '✏️ Modifier le produit' : '➕ Nouveau produit';
  set('vcat_id', p?p.id:'');
  set('vcat_nom', p?p.nom:'');
  set('vcat_cat', p?(p.categorie||'vaccin'):'vaccin');
  set('vcat_unite', p?(p.unite||'unité'):'unité');
  set('vcat_prix_achat', p?(p.prix_achat||''):'');
  set('vcat_prix_vente', p?(p.prix_vente||''):'');
  set('vcat_seuil', p?(p.seuil_alerte||5):5);
  set('vcat_desc', p?(p.description||''):'');
  set('vcat_migna_prix', p?(p.migna_prix||''):'');
  vetoPhotoSet(p?(p.photo_url||''):'');
  const info=document.getElementById('vcat_photo_info');
  if(info) info.textContent='Prise de vue ou galerie — l\'image est réduite avant l\'envoi.';
  vetoPrixHint();
  const m=document.getElementById('modal-veto-produit'); if(m) m.style.display='flex';
}
function vetoFermerProduit(){ const m=document.getElementById('modal-veto-produit'); if(m) m.style.display='none'; }

// Repère de prix : la MÉDIANE des prix DÉJÀ pratiqués dans la même catégorie.
// Jamais un prix inventé — c'est son propre chiffre qu'on lui rend.
function vetoPrixHint(){
  const hint=document.getElementById('vcat_pv_hint'); if(!hint) return;
  const sel=document.getElementById('vcat_cat'); if(!sel){ hint.textContent=''; return; }
  const cat=sel.value;
  const prix=GP_VETO_CATALOGUE.filter(p=>p.categorie===cat && Number(p.prix_vente)>0)
    .map(p=>Number(p.prix_vente)).sort((a,b)=>a-b);
  if(prix.length<2){ hint.textContent=''; return; }
  const med=prix[Math.floor(prix.length/2)];
  hint.textContent='💡 Médiane '+vetoCatInfo(cat).l.toLowerCase()+' : '+fmt(med)+' F (de '+fmt(prix[0])+' à '+fmt(prix[prix.length-1])+' F)';
}

async function saveProduitVeto(){
  const err=document.getElementById('vcat_err');
  if(err) err.textContent='';
  const g=k=>((document.getElementById(k)||{}).value||'');
  const nom=g('vcat_nom').trim();
  if(!nom){ if(err)err.textContent='Le nom du produit est requis.'; return; }
  const rec={
    admin_id:GP_ADMIN_ID,
    nom,
    categorie:g('vcat_cat')||'autre',
    unite:g('vcat_unite')||'unité',
    prix_achat:+g('vcat_prix_achat')||0,
    prix_vente:+g('vcat_prix_vente')||0,
    seuil_alerte:+g('vcat_seuil')||5,
    description:g('vcat_desc').trim()||null,
    photo_url:g('vcat_photo').trim()||null,
    migna_prix:+g('vcat_migna_prix')||null,
    actif:true,
  };
  const id=g('vcat_id');
  let error;
  if(id){ ({error}=await SB.from('gp_produits_veto').update(rec).eq('id',id).eq('admin_id',GP_ADMIN_ID)); }
  else  { ({error}=await SB.from('gp_produits_veto').insert(rec)); }
  if(error){ if(err)err.textContent='Erreur : '+error.message; return; }
  vetoFermerProduit();
  notify(id?`Produit "${nom}" modifié ✓`:`Produit "${nom}" ajouté ✓`,'gold');
  await renderVeto();
}

// ARCHIVER, jamais effacer : le stock et les ventes déjà saisis pointent sur ce
// produit. Un delete sec laisserait des lignes orphelines.
async function supprimerProduitVeto(id, nom){
  const p=GP_VETO_CATALOGUE.find(x=>x.id===id);
  const publie=!!(p&&p.migna_publie_le);
  if(!confirm(`Retirer "${nom}" du catalogue ?\n\nLe produit est ARCHIVÉ : il ne sera plus proposé à la vente ni à la réception, mais son stock et son historique restent lisibles.`
    +(publie?'\n\nSa fiche sera aussi retirée du marché MIGNA.':''))) return;
  // L'ORDRE COMPTE : on dépublie AVANT d'archiver. Le pont refuse un produit
  // archivé — l'inverse laisserait la fiche en vente sur MIGNA pour toujours.
  let avert='';
  if(publie){
    try{
      const token=await _vToken();
      const r=await fetch(_vIaBase()+'/migna/depublier',{
        method:'POST',
        headers:{'content-type':'application/json',Authorization:'Bearer '+token},
        body:JSON.stringify({produit_id:id})
      });
      const out=await r.json().catch(()=>({}));
      if(!r.ok||out.ok===false) avert=' ⚠️ La fiche est TOUJOURS sur MIGNA ('+((out&&out.error)||('erreur '+r.status))+').';
    }catch(e){ avert=' ⚠️ La fiche est TOUJOURS sur MIGNA ('+((e&&e.message)||e)+').'; }
  }
  const{error}=await SB.from('gp_produits_veto').update({actif:false}).eq('id',id).eq('admin_id',GP_ADMIN_ID);
  if(error){ notify('Erreur : '+error.message,'r'); return; }
  notify('Produit archivé ✓'+avert, avert?'r':'gold');
  await renderVeto();
}

// ══════════════════════════════════════════════════
// PHOTO — réduite au navigateur avant l'envoi
// ══════════════════════════════════════════════════
function vetoPhotoSet(url){
  const inp=document.getElementById('vcat_photo');
  const prev=document.getElementById('vcat_photo_prev');
  const del=document.getElementById('vcat_photo_del');
  if(inp) inp.value=url||'';
  if(prev){
    prev.style.backgroundImage = url ? `url("${url}")` : '';
    prev.textContent = url ? '' : '📷';
  }
  if(del) del.style.display = url ? '' : 'none';
}
function vetoPhotoRetirer(){
  vetoPhotoSet('');
  ['vcat_photo_file','vcat_photo_cam'].forEach(id=>{const e=document.getElementById(id); if(e)e.value='';});
  const info=document.getElementById('vcat_photo_info'); if(info) info.textContent='Photo retirée.';
}

async function vetoPhotoUpload(input){
  const file=input.files&&input.files[0]; if(!file) return;
  const info=document.getElementById('vcat_photo_info');
  if(!/^image\//.test(file.type||'')){ if(info)info.textContent='⚠️ Choisis une image.'; input.value=''; return; }
  if(info) info.textContent='⏳ Préparation…';
  let blob=file;
  // On réutilise le compresseur de la maison (chat.js) : une photo de téléphone
  // fait 3 à 5 Mo, inutile pour une vignette et cher en données sur le terrain.
  try{ if(typeof chatCompresserImage==='function') blob=await chatCompresserImage(file); }
  catch(e){ if(info) info.textContent='⚠️ Image illisible ('+(e.message||e)+').'; input.value=''; return; }
  if(blob.size>3*1024*1024){ if(info)info.textContent='⚠️ Image trop lourde (max 3 Mo).'; input.value=''; return; }
  if(info) info.textContent='⏳ Envoi…';
  try{
    // Même préfixe que les logos : c'est ce dossier qui est couvert par les
    // politiques du bucket. Un autre premier dossier serait refusé.
    const path=`logos/${GP_ADMIN_ID}/veto_${Date.now()}.jpg`;
    let{error}=await SB.storage.from('gp-logos').upload(path, blob, {upsert:true, contentType:'image/jpeg'});
    if(error && /jwt|expired|exp claim/i.test(error.message||'')){
      if(info) info.textContent='⏳ Session rafraîchie, nouvel essai…';
      try{ await SB.auth.refreshSession(); }catch(_){}
      ({error}=await SB.storage.from('gp-logos').upload(path, blob, {upsert:true, contentType:'image/jpeg'}));
    }
    if(error) throw error;
    const{data}=SB.storage.from('gp-logos').getPublicUrl(path);
    const u=data&&data.publicUrl;
    if(!u) throw new Error('URL introuvable');
    vetoPhotoSet(u);
    if(info) info.textContent='✅ Photo ajoutée — ✨ KEPELA lit l\'étiquette…';
    vetoFicheDepuisPhoto(blob);
  }catch(e){
    // Jamais de repli muet : on dit la raison.
    if(info) info.textContent = /jwt|expired|exp claim/i.test((e&&e.message)||'')
      ? '⚠️ Session expirée — reconnecte-toi puis réessaie.'
      : '⚠️ Envoi impossible ('+((e&&e.message)||e)+').';
  }
  input.value='';
}

function _vBlobToDataUrl(blob){
  return new Promise(res=>{ const r=new FileReader(); r.onload=()=>res(r.result); r.onerror=()=>res(null); r.readAsDataURL(blob); });
}

// ✨ KEPELA lit l'étiquette et remplit les champs VIDES seulement : on n'écrase
// jamais ce que la secrétaire a déjà tapé.
async function vetoFicheDepuisPhoto(blob){
  const info=document.getElementById('vcat_photo_info');
  try{
    const dataUrl=await _vBlobToDataUrl(blob); if(!dataUrl) return;
    const token=await _vToken(); if(!token) return;
    const cats=VETO_CATEGORIES.map(c=>({v:c,l:vetoCatInfo(c).l}));
    const r=await fetch(_vIaBase()+'/ia/fiche',{
      method:'POST',
      headers:{'content-type':'application/json',Authorization:'Bearer '+token},
      body:JSON.stringify({images:[dataUrl],cats,unites:VETO_UNITES,lang:'fr'})
    });
    const out=await r.json().catch(()=>({}));
    if(!r.ok||!out.ok||!out.fiche){
      if(info) info.textContent='✅ Photo ajoutée. '+(out.error?('✨ '+out.error):'✨ KEPELA n\'a pas pu lire la photo.');
      return;
    }
    const f=out.fiche;
    const siVide=(id,val)=>{ const el=document.getElementById(id); if(el&&!String(el.value||'').trim()&&val) el.value=val; };
    siVide('vcat_nom', f.titre);
    siVide('vcat_desc', f.description);
    // Les listes : on ne remplace que la valeur par défaut, pas un choix fait.
    if(f.categorie){ const s=document.getElementById('vcat_cat'); if(s&&s.value==='vaccin') s.value=f.categorie; }
    if(f.unite){ const u=document.getElementById('vcat_unite'); if(u&&u.value==='unité') u.value=f.unite; }
    vetoPrixHint();
    if(info) info.textContent='✨ KEPELA a rempli la fiche — vérifie et corrige si besoin.';
  }catch(e){ if(info) info.textContent='✅ Photo ajoutée. ✨ KEPELA injoignable.'; }
}

// ══════════════════════════════════════════════════
// RÉCEPTION (une entrée = un lot) + LA DÉPENSE
// ══════════════════════════════════════════════════
async function saveEntreeVeto(){
  const produitId=(document.getElementById('vtk_produit')||{}).value;
  const pdv=(document.getElementById('vtk_pdv')||{}).value;
  const qte=+((document.getElementById('vtk_qte')||{}).value)||0;
  const perem=(document.getElementById('vtk_perem')||{}).value||null;
  const prix=+((document.getElementById('vtk_prix')||{}).value)||0;
  const fourn=((document.getElementById('vtk_fourn')||{}).value||'').trim()||null;
  const payer=!!((document.getElementById('vtk_depense')||{}).checked);
  const err=document.getElementById('vtk_err');
  if(err) err.textContent='';
  // Chaque champ manquant est nommé, avec ce qu'il faut y mettre.
  if(!produitId){ if(err)err.textContent='Choisis le produit reçu.'; return; }
  if(!pdv){ if(err)err.textContent='Choisis le point de vente qui reçoit.'; return; }
  if(!qte||qte<=0){ if(err)err.textContent='Indique la quantité reçue (un nombre supérieur à 0).'; return; }
  if(payer && prix<=0){ if(err)err.textContent='Pour enregistrer la dépense, indique le prix d\'achat par unité.'; return; }
  const prod=GP_VETO_CATALOGUE.find(p=>p.id===produitId);
  const{error}=await SB.from('gp_stock_veto').insert({
    admin_id:GP_ADMIN_ID, pdv_nom:pdv,
    produit_id:produitId, produit_nom:(prod&&prod.nom)||'Produit véto',
    qte, unite:(prod&&prod.unite)||'unité',
    prix_achat:prix, date_peremption:perem, fournisseur:fourn,
    saisi_par:GP_USER&&GP_USER.id
  });
  if(error){ if(err)err.textContent='Erreur : '+error.message; return; }

  // LA DÉPENSE. Sans elle, le stock monte et l'argent ne sort nulle part : la
  // vente de véto gonfle le résultat d'un coût qui n'a jamais été compté.
  // On passe par le moteur de la maison (caisse_debitee:false puis
  // synchroniserCaisseDepenses) et jamais par une écriture de caisse à la main.
  let avertDep='';
  if(payer){
    const montant=Math.round(qte*prix);
    const{error:eDep}=await SB.from('gp_depenses').insert({
      admin_id:GP_ADMIN_ID, saisi_par:GP_USER&&GP_USER.id, date:_vToday(),
      categorie:'veto',
      description:`Achat ${(prod&&prod.nom)||'produit véto'} — ${_vQ(qte)} ${(prod&&prod.unite)||''}`.trim(),
      montant,
      beneficiaire:fourn,
      point_vente:pdv,
      caisse_debitee:false
    });
    if(eDep){
      // Le stock est entré, la dépense non : on le DIT, on ne le tait pas.
      avertDep=' ⚠️ La dépense de '+fmt(montant)+' F n\'a PAS été enregistrée ('+eDep.message+') — saisis-la dans 💸 Dépenses.';
    } else if(typeof synchroniserCaisseDepenses==='function'){
      try{ await synchroniserCaisseDepenses(); }catch(_){}
    }
  }

  ['vtk_qte','vtk_prix','vtk_fourn','vtk_perem'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});
  vetoMajTotalEntree();
  if(avertDep && err) err.textContent=avertDep.trim();
  notify(`Entrée enregistrée : ${_vQ(qte)} ${(prod&&prod.unite)||''} de ${(prod&&prod.nom)||''} → ${pdv} ✓`+(payer&&!avertDep?' · dépense créée':''),'gold');
  await renderVeto();
}

// ══════════════════════════════════════════════════
// SORTIE MANUELLE (perte, casse, périmé, don…)
// Les ENTRÉES sont les lots eux-mêmes : on ne les retrace pas une 2e fois,
// deux histoires du même fait finiraient par se contredire.
// ══════════════════════════════════════════════════
function vetoOuvrirMouvement(produitId){
  const p=GP_VETO_CATALOGUE.find(x=>x.id===produitId); if(!p) return;
  const err=document.getElementById('vmv_err'); if(err) err.textContent='';
  remplirSelectsVeto(null);
  document.getElementById('vmv_produit').value=produitId;
  document.getElementById('vmv_qte').value='';
  document.getElementById('vmv_titre').textContent='➖ Sortie — '+p.nom;
  // Les PDV où ce produit a réellement du stock : on ne propose pas de sortir
  // d'un endroit où il n'y a rien.
  const parPdv={};
  GP_VETO_LOTS.filter(l=>l.produit_id===produitId).forEach(l=>{ parPdv[l.pdv_nom]=(parPdv[l.pdv_nom]||0)+Number(l.qte||0); });
  const sel=document.getElementById('vmv_pdv');
  const entries=Object.entries(parPdv);
  if(sel){
    sel.innerHTML = entries.length
      ? entries.map(([n,q])=>`<option value="${_vEsc(n)}">${_vEsc(n)} — ${_vQ(q)} ${_vEsc(p.unite||'')}</option>`).join('')
      : `<option value="">— aucun stock pour ce produit —</option>`;
  }
  const u=document.getElementById('vmv_unite_label'); if(u) u.textContent=p.unite||'unité';
  const m=document.getElementById('modal-veto-mvt'); if(m) m.style.display='flex';
}
function vetoFermerMouvement(){ const m=document.getElementById('modal-veto-mvt'); if(m) m.style.display='none'; }

async function vetoEnregistrerMouvement(){
  const err=document.getElementById('vmv_err'); if(err) err.textContent='';
  const produitId=(document.getElementById('vmv_produit')||{}).value;
  const pdv=(document.getElementById('vmv_pdv')||{}).value;
  const qte=+((document.getElementById('vmv_qte')||{}).value)||0;
  const motif=(document.getElementById('vmv_motif')||{}).value||'ajustement';
  const note=((document.getElementById('vmv_note')||{}).value||'').trim()||null;
  if(!pdv){ if(err)err.textContent='Aucun stock à sortir pour ce produit.'; return; }
  if(!qte||qte<=0){ if(err)err.textContent='Indique la quantité qui sort (un nombre supérieur à 0).'; return; }
  const p=GP_VETO_CATALOGUE.find(x=>x.id===produitId);
  const dispo=GP_VETO_LOTS.filter(l=>l.produit_id===produitId&&l.pdv_nom===pdv)
    .reduce((s,l)=>s+Number(l.qte||0),0);
  if(qte>dispo+0.001){
    if(err)err.textContent=`Il n'y a que ${_vQ(dispo)} ${(p&&p.unite)||''} à ${pdv}. Si le comptage dit autre chose, fais d'abord l'entrée qui manque.`;
    return;
  }
  try{
    await deduireStockVeto(pdv, produitId, qte);
  }catch(e){ if(err)err.textContent='Erreur : '+((e&&e.message)||e); return; }
  // Trace du POURQUOI. Si elle échoue, on le dit : un stock qui bouge sans
  // raison écrite est exactement ce qu'on cherche à éviter.
  const{error:eMv}=await SB.from('gp_mouvements_veto').insert({
    admin_id:GP_ADMIN_ID, pdv_nom:pdv,
    produit_id:produitId, produit_nom:(p&&p.nom)||'Produit véto',
    type:'sortie', motif, quantite:qte, unite:(p&&p.unite)||'unité',
    prix_unitaire:(p&&p.prix_vente)||0, note,
    date:_vToday(), saisi_par:GP_USER&&GP_USER.id
  });
  vetoFermerMouvement();
  const lbl=(VETO_MOTIFS.find(m=>m.v===motif)||{}).l||motif;
  notify(`−${_vQ(qte)} ${(p&&p.unite)||''} sorti de ${pdv} (${lbl}) ✓`+(eMv?' — ⚠️ motif non enregistré : '+eMv.message:''), eMv?'r':'gold');
  await renderVeto();
}

// ══════════════════════════════════════════════════
// LE CATALOGUE (tableau, alertes en haut)
// ══════════════════════════════════════════════════
function renderVetoCatalogue(AGG){
  const el=document.getElementById('veto-catalogue-liste');
  if(!el) return;
  const A = AGG || vetoAgregerLots(GP_VETO_LOTS);
  if(!GP_VETO_CATALOGUE.length){
    el.innerHTML='<div style="color:var(--textm);font-size:12px;padding:10px">Aucun produit au catalogue. Clique « ➕ Nouveau produit » pour commencer.</div>';
    return;
  }
  const lignes=GP_VETO_CATALOGUE.slice().map(p=>{
    const a=A[p.id]||{qte:0,perem:null};
    return {p, a, st:vetoStatut(a, p.seuil_alerte)};
  }).sort((x,y)=> x.st.r-y.st.r || String(x.p.nom).localeCompare(String(y.p.nom)));

  el.innerHTML=`<div style="overflow-x:auto"><table class="tbl" style="font-size:11px">
    <thead><tr>
      <th>Produit</th><th class="num">Stock</th>
      ${GP_ROLE==='admin'?'<th class="num">Prix achat</th>':''}
      <th class="num">Prix vente</th><th>Péremption</th><th>Statut</th><th></th>
    </tr></thead>
    <tbody>${lignes.map(({p,a,st})=>{
      const ci=vetoCatInfo(p.categorie);
      const vign = p.photo_url
        ? `<img src="${_vEsc(p.photo_url)}" alt="" loading="lazy" onerror="this.style.display='none'" style="width:36px;height:36px;flex:0 0 36px;border-radius:8px;object-fit:cover;background:var(--card2)">`
        : `<div style="width:36px;height:36px;flex:0 0 36px;border-radius:8px;background:var(--card2);display:flex;align-items:center;justify-content:center;font-size:15px">${ci.icon}</div>`;
      const migna = p.migna_publie_le
        ? `<span onclick="event.stopPropagation();vetoOuvrirSurMigna('${p.id}')" title="Voir la fiche sur le marché MIGNA" style="cursor:pointer;font-size:9px;color:var(--green);border:1px solid var(--green);border-radius:5px;padding:1px 4px;margin-left:4px">🛍️ MIGNA</span>`
        : '';
      return `<tr>
        <td><div style="display:flex;gap:8px;align-items:center">${vign}<div style="min-width:0">
          <div style="font-weight:600">${_vEsc(p.nom)}</div>
          <div style="font-size:9px;color:var(--textm)">${ci.icon} ${ci.l}${migna}</div>
        </div></div></td>
        <td class="num" style="font-weight:700">${_vQ(a.qte)} <span style="font-size:9px;color:var(--textm)">${_vEsc(p.unite||'')}</span></td>
        ${GP_ROLE==='admin'?`<td class="num">${fmt(p.prix_achat||0)} F</td>`:''}
        <td class="num">${fmt(p.prix_vente||0)} F</td>
        <td style="font-size:10px;color:var(--textm)">${a.perem||'—'}</td>
        <td><span style="font-size:9px;font-weight:700;color:${st.c}">${st.l}</span></td>
        <td><div style="display:flex;gap:3px;flex-wrap:wrap;justify-content:flex-end">
          <button class="btn btn-sm" title="Sortie (perte, casse, périmé…)" onclick="vetoOuvrirMouvement('${p.id}')">➖</button>
          <button class="btn btn-sm" title="Modifier la fiche" onclick="vetoOuvrirProduit('${p.id}')">✏️</button>
          ${GP_ROLE==='admin'?`<button class="btn btn-sm" title="${p.migna_publie_le?'Republier sur le marché MIGNA':'Publier sur le marché MIGNA'}" onclick="vetoPublierSurMigna('${p.id}',this)">${p.migna_publie_le?'🔄':'🛍️'}</button>`:''}
          ${GP_ROLE==='admin'?`<button class="btn btn-sm btn-red" title="Archiver" onclick="supprimerProduitVeto('${p.id}','${_vEsc((p.nom||'').replace(/'/g,''))}')">🗑</button>`:''}
        </div></td>
      </tr>`;
    }).join('')}</tbody></table></div>`;
}

// ══════════════════════════════════════════════════
// STOCK PAR PDV (le détail des lots — c'est la vérité du véto)
// ══════════════════════════════════════════════════
function renderVetoStockParPDV(lots, todayStr, in30){
  const el=document.getElementById('veto-stock-liste');
  if(!el) return;
  if(!lots.length){
    el.innerHTML='<div style="color:var(--textm);font-size:12px">Aucun stock enregistré.</div>';
    return;
  }
  const byPDV={};
  lots.forEach(l=>{(byPDV[l.pdv_nom]=byPDV[l.pdv_nom]||[]).push(l);});
  el.innerHTML=Object.entries(byPDV).map(([pdv,ls])=>{
    const parProduit={};
    ls.forEach(l=>{const k=l.produit_id||l.produit_nom; (parProduit[k]=parProduit[k]||{nom:l.produit_nom,unite:l.unite,qte:0,lots:[]}); parProduit[k].qte+=Number(l.qte||0); parProduit[k].lots.push(l);});
    return `<div style="border:1px solid var(--border);border-radius:10px;overflow:hidden;margin-bottom:10px">
      <div style="background:var(--card2);padding:8px 12px;font-weight:700;font-size:12px">📍 ${_vEsc(pdv)}</div>
      <table class="tbl" style="font-size:11px">
        <thead><tr><th>Produit</th><th class="num">Stock</th><th>Lots / péremption</th></tr></thead>
        <tbody>${Object.values(parProduit).map(p=>{
          const cat=GP_VETO_CATALOGUE.find(c=>c.nom===p.nom);
          const seuil=(cat&&cat.seuil_alerte)||5;
          const bas=p.qte<=seuil;
          const lotsHtml=p.lots.filter(l=>Number(l.qte||0)>0).map(l=>{
            if(!l.date_peremption) return `<span style="font-size:9px;color:var(--textm);margin-right:6px">${_vQ(l.qte)} (sans date)</span>`;
            const exp=l.date_peremption<todayStr;
            const proche=!exp && l.date_peremption<=in30;
            const col=exp?'var(--red)':proche?'var(--gold)':'var(--textm)';
            const ic=exp?'⛔':proche?'⚠':'';
            return `<span style="font-size:9px;color:${col};display:inline-block;margin-right:6px">${ic}${_vQ(l.qte)} → ${l.date_peremption}</span>`;
          }).join('')||'<span style="font-size:9px;color:var(--textm)">—</span>';
          return `<tr>
            <td style="font-weight:600">${_vEsc(p.nom)}</td>
            <td class="num ${bas?'bad':''}" style="font-weight:700">${_vQ(p.qte)} <span style="font-size:9px;color:var(--textm)">${_vEsc(p.unite||'')}</span></td>
            <td>${lotsHtml}</td>
          </tr>`;
        }).join('')}</tbody>
      </table>
    </div>`;
  }).join('');
}

// ══════════════════════════════════════════════════
// ALERTES
// ══════════════════════════════════════════════════
function renderVetoAlertes(lots, todayStr, in30){
  const el=document.getElementById('veto-alertes');
  if(!el) return;
  const expires=lots.filter(l=>l.date_peremption&&Number(l.qte||0)>0&&l.date_peremption<todayStr);
  const proches=lots.filter(l=>l.date_peremption&&Number(l.qte||0)>0&&l.date_peremption>=todayStr&&l.date_peremption<=in30);
  const A=vetoAgregerLots(lots);
  const manques=[], ruptures=[], bas=[];
  GP_VETO_CATALOGUE.forEach(p=>{
    const st=vetoStatut(A[p.id]||{qte:0,perem:null}, p.seuil_alerte);
    if(st.k==='negatif') manques.push({p,st});
    else if(st.k==='rupture') ruptures.push({p,st});
    else if(st.k==='bas') bas.push({p,st});
  });
  if(!expires.length&&!proches.length&&!manques.length&&!ruptures.length&&!bas.length){
    el.innerHTML='<div style="color:var(--green);font-size:12px">✅ Aucune alerte — rien de périmé, rien en rupture.</div>';
    return;
  }
  const ligne=(ic,g,d,col)=>`<div style="display:flex;justify-content:space-between;gap:8px;padding:5px 0;font-size:11px;border-bottom:1px solid var(--border)">
    <span style="color:${col}">${ic} ${g}</span><span style="color:${col};white-space:nowrap">${d}</span></div>`;
  el.innerHTML=
    expires.map(l=>ligne('⛔',`${_vEsc(l.produit_nom)} · ${_vEsc(l.pdv_nom)}`,`${_vQ(l.qte)} ${_vEsc(l.unite||'')} · périmé le ${l.date_peremption}`,'var(--red)')).join('')
    // Un « manque » n'est pas une rupture : il dit « va compter », pas « va acheter ».
    + manques.map(({p,st})=>ligne('🧮',`${_vEsc(p.nom)} — le stock noté est faux, à compter`,st.l,'var(--red)')).join('')
    + ruptures.map(({p})=>ligne('📦',`${_vEsc(p.nom)}`,'Rupture','var(--red)')).join('')
    + proches.map(l=>ligne('⏳',`${_vEsc(l.produit_nom)} · ${_vEsc(l.pdv_nom)}`,`${_vQ(l.qte)} ${_vEsc(l.unite||'')} · expire le ${l.date_peremption}`,'var(--gold)')).join('')
    + bas.map(({p})=>ligne('📉',`${_vEsc(p.nom)}`,'Stock bas','var(--gold)')).join('');
}

// ══════════════════════════════════════════════════
// 🔎 UN CLIENT CHERCHE… (KEPELA comprend, on cherche dans TON stock)
// ══════════════════════════════════════════════════
function _vNorm(s){
  if(typeof normalizeSearch==='function') return normalizeSearch(s);
  return String(s||'').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'');
}

async function vetoChercherBesoin(){
  const q=((document.getElementById('vbz-q')||{}).value||'').trim();
  const res=document.getElementById('vbz-res');
  if(!res) return;
  if(!q){ res.innerHTML=''; return; }
  res.innerHTML='<div style="color:var(--textm);font-size:12px;padding:8px">⏳ KEPELA réfléchit…</div>';
  const token=await _vToken();
  if(!token){ res.innerHTML='<div class="a-err">Session expirée — reconnecte-toi.</div>'; return; }
  let out={};
  try{
    const r=await fetch(_vIaBase()+'/ia/besoin',{
      method:'POST',
      headers:{'content-type':'application/json',Authorization:'Bearer '+token},
      body:JSON.stringify({texte:q,cats:VETO_CATEGORIES.map(c=>({v:c,l:vetoCatInfo(c).l})),lang:'fr'})
    });
    out=await r.json().catch(()=>({}));
    if(!r.ok||!out.ok){ res.innerHTML='<div class="a-err">'+_vEsc(out.error||'KEPELA indisponible, réessaie.')+'</div>'; return; }
  }catch(e){ res.innerHTML='<div class="a-err">KEPELA injoignable ('+_vEsc((e&&e.message)||e)+').</div>'; return; }
  const b=out.besoin||{};
  const n=_vBesoinRendre(q,b);
  _vBesoinLog(q,b,n);
}

function _vBesoinRendre(q,b){
  const res=document.getElementById('vbz-res');
  const A=vetoAgregerLots(GP_VETO_LOTS);
  const mots=(b.mots_cles||[]).map(_vNorm).filter(Boolean);
  const type=b.type||'';
  const scored=GP_VETO_CATALOGUE.map(p=>{
    const nom=_vNorm(p.nom), des=_vNorm(p.description||'');
    let s=mots.reduce((a,m)=>a+(nom.includes(m)?1:(des.includes(m)?0.5:0)),0);
    if(b.categorie && p.categorie===b.categorie) s+=0.5;
    return {p, s, qte:Number((A[p.id]||{}).qte||0)};
  }).filter(x=>x.s>0).sort((a,b2)=>{
    const sa=a.qte>0?0:1, sb=b2.qte>0?0:1;
    if(sa!==sb) return sa-sb;        // en stock d'abord
    return b2.s-a.s;                 // puis le plus pertinent
  }).slice(0,6);

  // Le conseil de KEPELA ne donne JAMAIS de posologie : pour une dose, on
  // renvoie au vétérinaire. C'est une règle du moteur, pas une politesse.
  const conseil=b.conseil
    ? `<div style="background:rgba(22,163,74,.08);border-left:3px solid var(--green);padding:8px 10px;border-radius:8px;font-size:12px;margin-bottom:10px">💡 <b>${_vEsc(type||'Conseil')}</b><br>${_vEsc(b.conseil)}</div>`
    : '';
  let liste;
  if(scored.length){
    liste=scored.map(({p,qte})=>{
      const dispo=qte>0;
      return `<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;padding:7px 0;border-bottom:1px solid var(--border)">
        <div><b style="font-size:12px">${_vEsc(p.nom)}</b><div style="font-size:10px;color:var(--textm)">${vetoCatInfo(p.categorie).icon} ${fmt(p.prix_vente||0)} F / ${_vEsc(p.unite||'')}</div></div>
        <span style="font-size:9px;font-weight:700;color:${dispo?'var(--green)':'var(--red)'};white-space:nowrap">${dispo?('Stock '+_vQ(qte)):'Rupture'}</span>
      </div>`;
    }).join('');
  } else {
    const sugg=(type||q).replace(/"/g,'');
    liste=`<div style="font-size:12px;color:var(--textm);padding:8px">Rien en stock pour « ${_vEsc(type||q)} ».
      <div style="margin-top:8px"><button class="btn btn-sm" onclick="vetoOuvrirProduitAvecNom(this.dataset.n)" data-n="${_vEsc(sugg)}">➕ À commander / référencer</button></div></div>`;
  }
  res.innerHTML=conseil+liste;
  return scored.length;
}

function vetoOuvrirProduitAvecNom(nom){
  vetoOuvrirProduit('');
  const el=document.getElementById('vcat_nom'); if(el) el.value=nom||'';
}

// Chaque demande est tracée : le palmarès des demandes SANS réponse dit quoi
// acheter. Best effort — une trace qui échoue ne doit pas casser la recherche.
async function _vBesoinLog(q,b,n){
  try{
    await SB.from('gp_besoins_veto').insert({
      admin_id:GP_ADMIN_ID,
      point_vente:(GP_ROLE==='admin'?null:(GP_POINT_VENTE||null)),
      texte:String(q).slice(0,300),
      type:String((b&&b.type)||'').slice(0,80),
      categorie:(b&&b.categorie)||null,
      nb_resultats:n|0,
      saisi_par:GP_USER&&GP_USER.id
    });
  }catch(e){ console.error('[veto] besoin log', e); }
}

// ── Dictée vocale (navigateur) : rapide au comptoir, 0 serveur ──
let _vRec=null, _vRecOn=false;
function vetoBesoinMic(){
  const SR=window.SpeechRecognition||window.webkitSpeechRecognition;
  const btn=document.getElementById('vbz-mic');
  if(!SR){ notify('La dictée n\'est pas disponible sur cet appareil.','gold'); return; }
  if(_vRecOn&&_vRec){ try{_vRec.stop();}catch(_){} return; }
  _vRec=new SR(); _vRec.lang='fr-FR'; _vRec.interimResults=false; _vRec.maxAlternatives=1;
  _vRec.onresult=e=>{ const t=(e.results[0][0].transcript)||''; const q=document.getElementById('vbz-q'); if(q)q.value=t; vetoChercherBesoin(); };
  _vRec.onend=()=>{ _vRecOn=false; if(btn)btn.textContent='🎤'; };
  _vRec.onerror=()=>{ _vRecOn=false; if(btn)btn.textContent='🎤'; };
  try{ _vRec.start(); _vRecOn=true; if(btn)btn.textContent='⏺️'; }catch(_){}
}

// ══════════════════════════════════════════════════
// 📊 CE QUE LES CLIENTS DEMANDENT
// ══════════════════════════════════════════════════
let _vDzJours=30;
function vetoDemandesPeriode(j){ _vDzJours=j; renderVetoDemandes(); }

async function renderVetoDemandes(){
  const res=document.getElementById('vdz-res'); if(!res) return;
  const filtre=document.getElementById('vdz-filtre');
  if(filtre){
    filtre.innerHTML='<div style="display:flex;gap:6px;margin-bottom:9px">'+
      [7,30,90].map(j=>`<button class="btn btn-sm" style="${j===_vDzJours?'background:var(--green);color:#fff;border-color:var(--green)':''}" onclick="vetoDemandesPeriode(${j})">${j} j</button>`).join('')+
      '</div>';
  }
  try{
    const depuis=new Date(Date.now()-_vDzJours*86400000).toISOString();
    const{data,error}=await SB.from('gp_besoins_veto').select('texte,type,nb_resultats,created_at')
      .eq('admin_id',GP_ADMIN_ID).gte('created_at',depuis)
      .order('created_at',{ascending:false}).limit(500);
    if(error){ res.innerHTML='<div style="font-size:11px;color:var(--textm)">Palmarès indisponible : '+_vEsc(error.message)+'</div>'; return; }
    if(!data||!data.length){
      res.innerHTML='<div style="font-size:11px;color:var(--textm)">Aucune demande encore. Utilise « 🔎 Un client cherche… » ci-dessus : chaque recherche nourrit ce palmarès.</div>';
      return;
    }
    const g={};
    data.forEach(r=>{
      const label=String(r.type||r.texte||'—').trim();
      const k=_vNorm(label); if(!k) return;
      if(!g[k]) g[k]={label,n:0,manque:0};
      g[k].n++;
      if(Number(r.nb_resultats||0)===0) g[k].manque++;
    });
    const groupes=Object.values(g);
    const aRef=groupes.filter(x=>x.manque>0).sort((a,b)=>b.manque-a.manque||b.n-a.n).slice(0,8);
    const pop=groupes.slice().sort((a,b)=>b.n-a.n).slice(0,8);
    const lRef=x=>`<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid var(--border);font-size:11px">
      <span>🔴 <b>${_vEsc(x.label)}</b> <span style="color:var(--textm)">· ${x.manque}× sans réponse</span></span>
      <button class="btn btn-sm" onclick="vetoOuvrirProduitAvecNom(this.dataset.n)" data-n="${_vEsc(x.label)}">➕ Référencer</button></div>`;
    const lPop=x=>`<div style="display:flex;justify-content:space-between;gap:8px;padding:5px 0;border-bottom:1px solid var(--border);font-size:11px">
      <span>${_vEsc(x.label)}</span><span style="font-weight:700;color:${x.manque?'var(--gold)':'var(--green)'}">${x.n}×</span></div>`;
    res.innerHTML=
      (aRef.length?`<div style="font-weight:700;font-size:12px;margin:2px 0 5px">🛒 À référencer <span style="color:var(--textm);font-weight:400">— demandé, pas en stock</span></div>${aRef.map(lRef).join('')}`:'')
      +`<div style="font-weight:700;font-size:12px;margin:${aRef.length?'14':'2'}px 0 5px">🔝 Les plus demandés</div>${pop.map(lPop).join('')}`;
  }catch(e){ res.innerHTML='<div style="font-size:11px;color:var(--textm)">Palmarès indisponible ('+_vEsc((e&&e.message)||e)+').</div>'; }
}

// ══════════════════════════════════════════════════
// 🛍️ PUBLIER SUR LE MARCHÉ MIGNA
// Provéo garde le stock, la caisse et la péremption — la VÉRITÉ.
// MIGNA est la vitrine : il reçoit titre, photo, prix, ville. Le stock exact
// n'est JAMAIS publié, seulement « disponible / épuisé ».
// ══════════════════════════════════════════════════
const VETO_MIGNA_ORIGIN='https://migna.live';
function vetoOuvrirSurMigna(id){
  const p=GP_VETO_CATALOGUE.find(x=>x.id===id);
  if(p&&p.migna_produit_id) window.open(VETO_MIGNA_ORIGIN+'/p?id='+encodeURIComponent(p.migna_produit_id),'_blank','noopener');
  else notify('Ce produit n\'est pas encore publié.','gold');
}

async function vetoPublierSurMigna(id, btn){
  const p=GP_VETO_CATALOGUE.find(x=>x.id===id); if(!p) return;
  const A=vetoAgregerLots(GP_VETO_LOTS);
  const dispo=Number((A[p.id]||{}).qte||0)>0;
  if(!p.prix_vente){ notify('Donne d\'abord un prix de vente à « '+p.nom+' » : on ne publie pas un produit sans prix.','r'); return; }
  const label=btn?btn.textContent:'';
  if(btn){ btn.disabled=true; btn.textContent='⏳'; }
  try{
    const token=await _vToken();
    if(!token){ notify('Session expirée — reconnecte-toi.','r'); return; }
    const{data:{session}}=await SB.auth.getSession();
    const r=await fetch(_vIaBase()+'/migna/publier',{
      method:'POST',
      headers:{'content-type':'application/json',Authorization:'Bearer '+token},
      body:JSON.stringify({
        produit_id:id,
        owner_email:(session&&session.user&&session.user.email)||null,
        en_stock:dispo
      })
    });
    const out=await r.json().catch(()=>({}));
    if(!r.ok||!out.ok){ notify('Publication impossible : '+_vEsc(out.error||('erreur '+r.status)),'r'); return; }
    const{error}=await SB.from('gp_produits_veto').update({
      migna_produit_id:out.produit_id,
      migna_boutique_slug:out.boutique_slug||null,
      migna_publie_le:new Date().toISOString()
    }).eq('id',id).eq('admin_id',GP_ADMIN_ID);
    if(error){ notify('Publié sur MIGNA, mais le lien n\'a pas pu être retenu : '+error.message,'r'); }
    else notify(out.retrait_seul?'Publié sur MIGNA — retrait en boutique uniquement ✓':'Publié sur le marché MIGNA ✓','gold');
    if(out.url) window.open(out.url,'_blank','noopener');
    await renderVeto();
  }catch(e){
    notify('Publication impossible : '+((e&&e.message)||e),'r');
  }finally{
    if(btn){ btn.disabled=false; btn.textContent=label; }
  }
}

// ══════════════════════════════════════════════════
// HELPERS POUR LA VENTE (utilisés par ventes.js et corbeille.js)
// ══════════════════════════════════════════════════
// Stock véto disponible pour un PDV (agrégé par produit)
async function vetoDispoPourVente(pdvNom){
  const{data}=await SB.from('gp_stock_veto').select('*')
    .eq('admin_id',GP_ADMIN_ID).eq('pdv_nom',pdvNom);
  return vetoStockCourant(data||[], pdvNom);
}

// Re-crédite une quantité (annulation de vente) : remet dans le lot le plus proche de péremption
// (cohérent avec le FIFO de sortie), sinon crée un lot de restitution.
async function recrediterStockVeto(pdvNom, produitId, qte, produitNom){
  const q=Number(qte||0);
  if(q<=0||!produitId||!pdvNom) return;
  const{data:lots}=await SB.from('gp_stock_veto').select('id,qte')
    .eq('admin_id',GP_ADMIN_ID).eq('pdv_nom',pdvNom).eq('produit_id',produitId)
    .order('date_peremption',{ascending:true,nullsFirst:false}).limit(1);
  if(lots&&lots.length){
    await SB.from('gp_stock_veto').update({qte:Number(lots[0].qte||0)+q}).eq('id',lots[0].id);
  } else {
    const prod=(typeof GP_VETO_CATALOGUE!=='undefined'?GP_VETO_CATALOGUE:[]).find(p=>p.id===produitId);
    await SB.from('gp_stock_veto').insert({
      admin_id:GP_ADMIN_ID, pdv_nom:pdvNom, produit_id:produitId,
      produit_nom:(prod&&prod.nom)||produitNom||'Produit véto', qte:q,
      unite:(prod&&prod.unite)||'unité', prix_achat:(prod&&prod.prix_achat)||0,
      saisi_par:GP_USER&&GP_USER.id
    });
  }
}

// Déduit une quantité du stock véto d'un PDV en FIFO par date de péremption (les plus proches d'abord)
async function deduireStockVeto(pdvNom, produitId, qteAVendre){
  let reste=Number(qteAVendre||0);
  if(reste<=0||!produitId||!pdvNom) return;
  const{data:lots}=await SB.from('gp_stock_veto').select('*')
    .eq('admin_id',GP_ADMIN_ID).eq('pdv_nom',pdvNom).eq('produit_id',produitId)
    .gt('qte',0)
    .order('date_peremption',{ascending:true,nullsFirst:false});
  for(const l of (lots||[])){
    if(reste<=0) break;
    const dispo=Number(l.qte||0);
    const pris=Math.min(dispo,reste);
    await SB.from('gp_stock_veto').update({qte:dispo-pris}).eq('id',l.id);
    reste-=pris;
  }
}
