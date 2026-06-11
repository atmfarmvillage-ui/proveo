// ══════════════════════════════════════════════════
// PROVENDA — MODULE PRODUITS VÉTO
// Catalogue + stock par PDV (en lots, avec péremption) + réception + alertes
// La vente est gérée dans ventes.js (type_produit='veto').
// ══════════════════════════════════════════════════

let GP_VETO_CATALOGUE = [];
const VETO_UNITES = ['unité','100g','1Kg','100ml','flacon','boîte','dose','sachet','ml','comprimé'];
const VETO_CATEGORIES = ['vaccin','antibiotique','vitamine','déparasitant','désinfectant','autre'];

async function loadVetoCatalogue(){
  const{data}=await SB.from('gp_produits_veto').select('*')
    .eq('admin_id',GP_ADMIN_ID).order('nom');
  GP_VETO_CATALOGUE = data||[];
  return GP_VETO_CATALOGUE;
}

// Stock courant agrégé par produit pour un PDV donné (somme des lots)
function vetoStockCourant(lots, pdvNom){
  const map={};
  (lots||[]).filter(l=>l.pdv_nom===pdvNom).forEach(l=>{
    const k=l.produit_id||l.produit_nom;
    if(!map[k]) map[k]={produit_id:l.produit_id,nom:l.produit_nom,unite:l.unite,qte:0};
    map[k].qte += Number(l.qte||0);
  });
  return map;
}

async function renderVeto(){
  if(!GP_ADMIN_ID) return;
  await loadVetoCatalogue();
  const{data:pdvsData}=await SB.from('gp_points_vente').select('nom')
    .eq('admin_id',GP_ADMIN_ID).order('nom');
  const PDVS=(pdvsData||[]).map(p=>p.nom);
  const{data:lotsData}=await SB.from('gp_stock_veto').select('*')
    .eq('admin_id',GP_ADMIN_ID).order('date_peremption',{ascending:true});
  const L=lotsData||[];

  remplirSelectsVeto(PDVS);

  // Cloisonnement : un non-admin ne voit que son PDV + Production
  const monPDV = GP_POINT_VENTE||'Production';
  const lotsVisibles = (GP_ROLE==='admin') ? L : L.filter(l=>l.pdv_nom===monPDV||l.pdv_nom==='Production');

  // ── Dates pour la péremption ──
  const todayStr=(typeof today==='function')?today():new Date().toISOString().slice(0,10);
  const in30=new Date(Date.now()+30*86400000).toISOString().slice(0,10);

  // ── KPIs ──
  const nbProduits=GP_VETO_CATALOGUE.length;
  const totalUnites=lotsVisibles.reduce((s,l)=>s+Number(l.qte||0),0);
  const lotsExpires=lotsVisibles.filter(l=>l.date_peremption&&l.qte>0&&l.date_peremption<todayStr).length;
  const lotsProches=lotsVisibles.filter(l=>l.date_peremption&&l.qte>0&&l.date_peremption>=todayStr&&l.date_peremption<=in30).length;
  const kpisEl=document.getElementById('veto-kpis');
  if(kpisEl) kpisEl.innerHTML=`
    <div class="econo-box"><div class="econo-val">${nbProduits}</div><div class="econo-lbl">Produits au catalogue</div></div>
    <div class="econo-box"><div class="econo-val">${fmt(totalUnites)}</div><div class="econo-lbl">Unités en stock</div></div>
    <div class="econo-box"><div class="econo-val" style="color:${lotsProches>0?'var(--gold)':'var(--green)'}">${lotsProches}</div><div class="econo-lbl">Lots proches péremption</div></div>
    <div class="econo-box"><div class="econo-val" style="color:${lotsExpires>0?'var(--red)':'var(--green)'}">${lotsExpires}</div><div class="econo-lbl">Lots périmés</div></div>`;

  // ── Alertes (péremption + stock bas) ──
  renderVetoAlertes(lotsVisibles, todayStr, in30);

  // ── Catalogue ──
  renderVetoCatalogue();

  // ── Stock par PDV (cloisonné) ──
  renderVetoStockParPDV(lotsVisibles, todayStr, in30);
}

function remplirSelectsVeto(PDVS){
  // Select PDV de réception : non-admin verrouillé sur son PDV
  const selPdv=document.getElementById('vtk_pdv');
  if(selPdv){
    if(GP_ROLE==='admin'){
      selPdv.innerHTML='<option value="Production">🏭 Production (siège)</option>'+
        (PDVS||[]).map(n=>`<option value="${n}">${n}</option>`).join('');
      selPdv.disabled=false;
    } else {
      const monPDV=GP_POINT_VENTE||'Production';
      selPdv.innerHTML=`<option value="${monPDV}">${monPDV}</option>`;
      selPdv.value=monPDV; selPdv.disabled=true;
    }
  }
  // Select produit (catalogue)
  const selProd=document.getElementById('vtk_produit');
  if(selProd){
    selProd.innerHTML='<option value="">— Produit véto —</option>'+
      GP_VETO_CATALOGUE.map(p=>`<option value="${p.id}" data-unite="${p.unite||'unité'}" data-prix="${p.prix_achat||0}">${p.nom}</option>`).join('');
  }
  // Selects du formulaire catalogue (unité + catégorie)
  const selUnite=document.getElementById('vcat_unite');
  if(selUnite&&!selUnite.dataset.filled){
    selUnite.innerHTML=VETO_UNITES.map(u=>`<option value="${u}">${u}</option>`).join('');
    selUnite.dataset.filled='1';
  }
  const selCat=document.getElementById('vcat_cat');
  if(selCat&&!selCat.dataset.filled){
    selCat.innerHTML=VETO_CATEGORIES.map(c=>`<option value="${c}">${c.charAt(0).toUpperCase()+c.slice(1)}</option>`).join('');
    selCat.dataset.filled='1';
  }
}

// Préremplit unité + prix d'achat quand on choisit un produit dans la réception
function onVetoProduitChange(){
  const sel=document.getElementById('vtk_produit');
  const opt=sel?.selectedOptions?.[0];
  if(!opt||!opt.value) return;
  const uEl=document.getElementById('vtk_unite_label');
  if(uEl) uEl.textContent=opt.dataset.unite||'unité';
  const prixEl=document.getElementById('vtk_prix');
  if(prixEl&&!prixEl.value) prixEl.value=opt.dataset.prix||0;
}

// ── CATALOGUE ─────────────────────────────────────
async function saveProduitVeto(){
  const nom=document.getElementById('vcat_nom')?.value.trim();
  const cat=document.getElementById('vcat_cat')?.value||'autre';
  const unite=document.getElementById('vcat_unite')?.value||'unité';
  const prixA=+document.getElementById('vcat_prix_achat')?.value||0;
  const prixV=+document.getElementById('vcat_prix_vente')?.value||0;
  const seuil=+document.getElementById('vcat_seuil')?.value||5;
  const err=document.getElementById('vcat_err');
  if(err) err.textContent='';
  if(!nom){ if(err)err.textContent='Le nom du produit est requis.'; return; }
  const{error}=await SB.from('gp_produits_veto').insert({
    admin_id:GP_ADMIN_ID, nom, categorie:cat, unite,
    prix_achat:prixA, prix_vente:prixV, seuil_alerte:seuil, actif:true
  });
  if(error){ if(err)err.textContent='Erreur : '+error.message; return; }
  ['vcat_nom','vcat_prix_achat','vcat_prix_vente'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});
  notify(`Produit véto "${nom}" ajouté ✓`,'gold');
  await renderVeto();
}

async function supprimerProduitVeto(id, nom){
  if(!confirm(`Supprimer "${nom}" du catalogue véto ?\n(Le stock déjà saisi reste, mais le produit ne sera plus proposé.)`)) return;
  const{error}=await SB.from('gp_produits_veto').delete().eq('id',id);
  if(error){ notify('Erreur : '+error.message,'r'); return; }
  notify('Produit retiré du catalogue ✓','gold');
  await renderVeto();
}

function renderVetoCatalogue(){
  const el=document.getElementById('veto-catalogue-liste');
  if(!el) return;
  if(!GP_VETO_CATALOGUE.length){
    el.innerHTML='<div style="color:var(--textm);font-size:12px">Aucun produit au catalogue. Ajoute-en un ci-dessus.</div>';
    return;
  }
  el.innerHTML=`<table class="tbl" style="font-size:11px">
    <thead><tr><th>Produit</th><th>Catégorie</th><th>Unité</th>${GP_ROLE==='admin'?'<th class="num">Prix achat</th>':''}<th class="num">Prix vente</th>${GP_ROLE==='admin'?'<th></th>':''}</tr></thead>
    <tbody>${GP_VETO_CATALOGUE.map(p=>`<tr>
      <td style="font-weight:600">${p.nom}</td>
      <td style="color:var(--textm)">${p.categorie||'—'}</td>
      <td>${p.unite||'unité'}</td>
      ${GP_ROLE==='admin'?`<td class="num">${fmt(p.prix_achat||0)} F</td>`:''}
      <td class="num">${fmt(p.prix_vente||0)} F</td>
      ${GP_ROLE==='admin'?`<td><button onclick="supprimerProduitVeto('${p.id}','${(p.nom||'').replace(/'/g,'')}')" style="background:none;border:none;cursor:pointer;font-size:13px;opacity:.6">🗑</button></td>`:''}
    </tr>`).join('')}</tbody></table>`;
}

// ── RÉCEPTION (entrée de stock = un lot) ───────────
async function saveEntreeVeto(){
  const produitId=document.getElementById('vtk_produit')?.value;
  const pdv=document.getElementById('vtk_pdv')?.value;
  const qte=+document.getElementById('vtk_qte')?.value||0;
  const perem=document.getElementById('vtk_perem')?.value||null;
  const prix=+document.getElementById('vtk_prix')?.value||0;
  const fourn=document.getElementById('vtk_fourn')?.value.trim()||null;
  const err=document.getElementById('vtk_err');
  if(err) err.textContent='';
  if(!produitId){ if(err)err.textContent='Choisis un produit véto.'; return; }
  if(!pdv){ if(err)err.textContent='Choisis le point de vente.'; return; }
  if(!qte||qte<=0){ if(err)err.textContent='Quantité invalide.'; return; }
  const prod=GP_VETO_CATALOGUE.find(p=>p.id===produitId);
  const{error}=await SB.from('gp_stock_veto').insert({
    admin_id:GP_ADMIN_ID, pdv_nom:pdv,
    produit_id:produitId, produit_nom:prod?.nom||'Produit véto',
    qte, unite:prod?.unite||'unité',
    prix_achat:prix, date_peremption:perem, fournisseur:fourn,
    saisi_par:GP_USER?.id
  });
  if(error){ if(err)err.textContent='Erreur : '+error.message; return; }
  ['vtk_qte','vtk_prix','vtk_fourn'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});
  const perm=document.getElementById('vtk_perem'); if(perm)perm.value='';
  notify(`Entrée véto enregistrée : ${qte} ${prod?.unite||''} de ${prod?.nom||''} → ${pdv} ✓`,'gold');
  await renderVeto();
}

// ── STOCK PAR PDV ─────────────────────────────────
function renderVetoStockParPDV(lots, todayStr, in30){
  const el=document.getElementById('veto-stock-liste');
  if(!el) return;
  if(!lots.length){
    el.innerHTML='<div style="color:var(--textm);font-size:12px">Aucun stock véto enregistré.</div>';
    return;
  }
  // Grouper par PDV
  const byPDV={};
  lots.forEach(l=>{(byPDV[l.pdv_nom]=byPDV[l.pdv_nom]||[]).push(l);});
  el.innerHTML=Object.entries(byPDV).map(([pdv,ls])=>{
    // Agréger par produit pour le total + lister les lots avec péremption
    const parProduit={};
    ls.forEach(l=>{const k=l.produit_id||l.produit_nom; (parProduit[k]=parProduit[k]||{nom:l.produit_nom,unite:l.unite,qte:0,lots:[]}); parProduit[k].qte+=Number(l.qte||0); parProduit[k].lots.push(l);});
    return `<div style="border:1px solid var(--border);border-radius:10px;overflow:hidden;margin-bottom:10px">
      <div style="background:var(--card2);padding:8px 12px;font-weight:700;font-size:12px">📍 ${pdv}</div>
      <table class="tbl" style="font-size:11px">
        <thead><tr><th>Produit</th><th class="num">Stock</th><th>Lots / péremption</th></tr></thead>
        <tbody>${Object.values(parProduit).map(p=>{
          const cat=GP_VETO_CATALOGUE.find(c=>c.nom===p.nom);
          const seuil=cat?.seuil_alerte||5;
          const bas=p.qte<=seuil;
          const lotsHtml=p.lots.filter(l=>Number(l.qte||0)>0).map(l=>{
            if(!l.date_peremption) return `<span style="font-size:9px;color:var(--textm)">${fmt(l.qte)} (sans date)</span>`;
            const exp=l.date_peremption<todayStr;
            const proche=!exp && l.date_peremption<=in30;
            const col=exp?'var(--red)':proche?'var(--gold)':'var(--textm)';
            const ic=exp?'⛔':proche?'⚠':'';
            return `<span style="font-size:9px;color:${col};display:inline-block;margin-right:6px">${ic}${fmt(l.qte)} → ${l.date_peremption}</span>`;
          }).join('')||'<span style="font-size:9px;color:var(--textm)">—</span>';
          return `<tr>
            <td style="font-weight:600">${p.nom}</td>
            <td class="num ${bas?'bad':''}" style="font-weight:700">${fmt(p.qte)} <span style="font-size:9px;color:var(--textm)">${p.unite||''}</span></td>
            <td>${lotsHtml}</td>
          </tr>`;
        }).join('')}</tbody>
      </table>
    </div>`;
  }).join('');
}

// ── ALERTES ───────────────────────────────────────
function renderVetoAlertes(lots, todayStr, in30){
  const el=document.getElementById('veto-alertes');
  if(!el) return;
  const expires=lots.filter(l=>l.date_peremption&&Number(l.qte||0)>0&&l.date_peremption<todayStr);
  const proches=lots.filter(l=>l.date_peremption&&Number(l.qte||0)>0&&l.date_peremption>=todayStr&&l.date_peremption<=in30);
  if(!expires.length&&!proches.length){
    el.innerHTML='<div style="color:var(--green);font-size:12px">✓ Aucun produit périmé ni proche de péremption.</div>';
    return;
  }
  el.innerHTML=`
    ${expires.map(l=>`<div style="display:flex;justify-content:space-between;padding:5px 0;font-size:11px;border-bottom:1px solid rgba(239,68,68,.1)">
      <span style="color:var(--red)">⛔ ${l.produit_nom} · ${l.pdv_nom}</span>
      <span style="color:var(--red)">${fmt(l.qte)} ${l.unite||''} · périmé le ${l.date_peremption}</span>
    </div>`).join('')}
    ${proches.map(l=>`<div style="display:flex;justify-content:space-between;padding:5px 0;font-size:11px;border-bottom:1px solid rgba(245,158,11,.1)">
      <span style="color:var(--gold)">⚠ ${l.produit_nom} · ${l.pdv_nom}</span>
      <span style="color:var(--gold)">${fmt(l.qte)} ${l.unite||''} · expire le ${l.date_peremption}</span>
    </div>`).join('')}`;
}

// ── HELPERS POUR LA VENTE (utilisés par ventes.js — Étape B) ──
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
      produit_nom:prod?.nom||produitNom||'Produit véto', qte:q,
      unite:prod?.unite||'unité', prix_achat:prod?.prix_achat||0, saisi_par:GP_USER?.id
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
