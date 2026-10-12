// ═══════════════════════════════════════════════════════════════════════════
// PROVENDA — FRAIS ANNEXES D'UN ACHAT (dédouanement, transport, manutention)
//
// LE PROBLÈME, dit par le DG : « imagine on avait donné avance ou même on avait
// commandé en Chine, 2 mois ça vient et on doit encore dédouaner donc faire
// d'autres dépenses ». Une commande d'import, c'est une avance, un solde, un
// dédouanement et un transport — quatre sorties d'argent étalées sur deux mois
// pour une seule arrivée.
//
// CE QUE ÇA CASSAIT : le stock était valorisé au SEUL prix de la ligne
// (`prix_unit: l.prix_unitaire`), c'est-à-dire le prix facturé par le
// fournisseur. Le dédouanement n'entrait nulle part. Un ingrédient à 300 F/kg
// qui coûte 60 F de douane était compté 300 : le prix de revient sous-estimé,
// et les marges plus belles qu'elles ne sont — sur la ligne la plus lourde de
// l'exploitation.
//
// LA RÈGLE DE RÉPARTITION : au prorata de la VALEUR de chaque ligne. C'est la
// règle comptable usuelle quand le transitaire facture le conteneur en bloc.
// Conséquence remarquable : répartir au prorata de la valeur revient à
// appliquer le MÊME coefficient à toutes les lignes — ce qui rend le calcul
// vérifiable à la main en une division.
//
// DEUX DÉCISIONS DU DG, à ne pas rouvrir :
//   1. LE PASSÉ NE BOUGE PAS. Un frais qui tombe après la production ne
//      réécrit pas le coût des lots déjà faits — `gp_lots.cout_total` est figé
//      à la production, et il le reste. Seuls les lots suivants en tiendront
//      compte. L'écran le DIT au moment où le frais est saisi, au lieu de le
//      laisser découvrir.
//   2. ON CLÔTURE. Tant que l'achat est ouvert le coût se recalcule à chaque
//      frais ; à la clôture il est figé et plus rien ne s'y rattache, sauf
//      réouverture explicite et tracée. Sans ça, le coût d'un achat de janvier
//      pourrait encore bouger en mars et plus personne ne saurait quel chiffre
//      fait foi.
// ═══════════════════════════════════════════════════════════════════════════

// ── LE CALCUL (pur, testable hors navigateur) ──────────────────────────────
// Rend, pour chaque ligne, son coût unitaire RÉEL = prix fournisseur + sa part
// de frais. `lignes` : [{id, prix_unitaire, qte_recue|qte_commandee}].
function coutReelAchat(lignes, frais){
  const L = (lignes || []).filter(l => l);
  const totalFrais = (frais || []).reduce((s, f) => s + (Number(f.montant) || 0), 0);
  const qteDe = l => Number(l.qte_recue) > 0 ? Number(l.qte_recue) : (Number(l.qte_commandee) || 0);
  const valeurDe = l => qteDe(l) * (Number(l.prix_unitaire) || 0);
  const totalValeur = L.reduce((s, l) => s + valeurDe(l), 0);
  // Pas de valeur, ou pas de frais : le coût reste le prix fournisseur. On ne
  // divise jamais par zéro et on n'invente aucune répartition.
  const coef = (totalValeur > 0 && totalFrais > 0) ? (totalFrais / totalValeur) : 0;
  const out = {};
  L.forEach(l => {
    const pu = Number(l.prix_unitaire) || 0;
    const q = qteDe(l);
    out[l.id] = {
      prix_fournisseur: pu,
      part_frais: Math.round(pu * coef * q),          // ce que cette ligne supporte
      prix_reel: Math.round(pu * (1 + coef)),         // au prorata de la valeur
      quantite: q,
    };
  });
  return { coef, totalFrais, totalValeur, lignes: out };
}

// ── LECTURE ────────────────────────────────────────────────────────────────
async function achatFraisLire(achatId){
  try{
    const{data,error}=await SB.from('gp_achats_frais').select('*')
      .eq('admin_id',GP_ADMIN_ID).eq('achat_id',achatId).order('date');
    if(error) throw error;
    return data || [];
  }catch(e){
    console.warn('frais d\'achat illisibles', e);
    return null;   // null = on n'a PAS pu lire ; [] = il n'y en a pas
  }
}

// Combien de lots ont été produits depuis que cette marchandise est entrée en
// stock. Sert uniquement à AVERTIR : leur coût ne bougera pas.
async function achatLotsDepuis(dateEntree){
  if(!dateEntree) return 0;
  try{
    const{data,error}=await SB.from('gp_lots').select('id')
      .eq('admin_id',GP_ADMIN_ID).gte('date',String(dateEntree).slice(0,10)).limit(500);
    if(error) throw error;
    return (data||[]).length;
  }catch(e){ return 0; }
}

// ── ÉCRITURE D'UN FRAIS ────────────────────────────────────────────────────
// L'argent sort par le MÊME chemin que les paiements fournisseur : on ne
// réécrit pas la mécanique de caisse, on la réutilise.
async function achatFraisAjouter(achatId, libelle, montant, date, caisseId){
  const m = Number(montant) || 0;
  if(!libelle || !String(libelle).trim()) return { error: 'Donne un libellé au frais (dédouanement, transport…).' };
  if(m <= 0) return { error: 'Le montant doit être supérieur à zéro.' };
  try{
    const{data:a}=await SB.from('gp_achats').select('cloture_le,ref').eq('id',achatId).maybeSingle();
    if(a && a.cloture_le){
      return { error: 'Cet achat est clôturé le '+String(a.cloture_le).slice(0,10)+'. Rouvre-le d\'abord si un frais manque.' };
    }
    const{data:f,error}=await SB.from('gp_achats_frais').insert({
      admin_id:GP_ADMIN_ID, achat_id:achatId,
      libelle:String(libelle).trim(), montant:m,
      date:date || new Date().toISOString().slice(0,10),
      caisse_id:caisseId || null,
      cree_par_nom:(typeof GP_USER!=='undefined' && GP_USER && GP_USER.email) ? String(GP_USER.email).split('@')[0] : null,
    }).select().maybeSingle();
    if(error) throw error;
    return { frais:f };
  }catch(e){ return { error:(e && e.message) || String(e) }; }
}

// ── APPLIQUER LE COÛT RÉEL ────────────────────────────────────────────────
// Recalcule `gp_stock_mp.prix_unit` des entrées de cet achat et republie le
// prix de l'ingrédient. N'écrit RIEN sur les lots : le passé ne bouge pas.
async function achatAppliquerCoutReel(achatId){
  try{
    const[{data:lignes},frais]=await Promise.all([
      SB.from('gp_achats_lignes').select('*').eq('achat_id',achatId),
      achatFraisLire(achatId),
    ]);
    if(frais === null) return { error:'Frais illisibles — coût non recalculé.' };
    const L = lignes || [];
    const calc = coutReelAchat(L, frais);
    let majStock = 0, majPrix = 0;
    for(const l of L){
      const c = calc.lignes[l.id];
      if(!c) continue;
      try{
        const{error}=await SB.from('gp_stock_mp').update({prix_unit:c.prix_reel})
          .eq('admin_id',GP_ADMIN_ID).eq('achat_id',achatId).eq('ingredient_id',l.ingredient_id);
        if(!error) majStock++;
      }catch(_){}
      if(l.ingredient_id && typeof majPrixMP==='function'){
        try{ await majPrixMP(l.ingredient_id, c.prix_reel); majPrix++; }catch(_){}
      }
    }
    return { calc, majStock, majPrix };
  }catch(e){ return { error:(e && e.message) || String(e) }; }
}

// ── CLÔTURE ───────────────────────────────────────────────────────────────
async function achatCloturer(achatId){
  try{
    const{error}=await SB.from('gp_achats').update({
      cloture_le:new Date().toISOString().slice(0,10),
      cloture_par_nom:(typeof GP_USER!=='undefined' && GP_USER && GP_USER.email) ? String(GP_USER.email).split('@')[0] : null,
    }).eq('id',achatId).eq('admin_id',GP_ADMIN_ID);
    if(error) throw error;
    return {};
  }catch(e){ return { error:(e && e.message) || String(e) }; }
}

async function achatRouvrir(achatId){
  try{
    const{error}=await SB.from('gp_achats').update({cloture_le:null,cloture_par_nom:null})
      .eq('id',achatId).eq('admin_id',GP_ADMIN_ID);
    if(error) throw error;
    return {};
  }catch(e){ return { error:(e && e.message) || String(e) }; }
}

// ── ENGAGÉ, PAS ENCORE REÇU ───────────────────────────────────────────────
// L'argent est sorti, la marchandise n'est pas là. Pour un import à deux mois,
// c'est l'information qui manquait le plus.
function achatsEngagesNonRecus(achats, paiements, frais){
  const PAS_RECU = ['brouillon','confirme','en_livraison'];
  const parAchat = {};
  (paiements||[]).forEach(p=>{ parAchat[p.achat_id]=(parAchat[p.achat_id]||0)+(Number(p.montant)||0); });
  (frais||[]).forEach(f=>{ parAchat[f.achat_id]=(parAchat[f.achat_id]||0)+(Number(f.montant)||0); });
  const auj = new Date();
  return (achats||[])
    .filter(a => PAS_RECU.includes(a.statut) && (parAchat[a.id]||0) > 0)
    .map(a => {
      const d = a.date_commande ? new Date(String(a.date_commande).slice(0,10)+'T00:00:00') : null;
      const jours = d ? Math.max(0, Math.round((auj - d)/86400000)) : null;
      return { id:a.id, ref:a.ref, statut:a.statut, fournisseur:a.fournisseur_nom||a.fournisseur||'—',
               paye:parAchat[a.id]||0, date_commande:a.date_commande||null, jours };
    })
    .sort((x,y)=>(y.jours||0)-(x.jours||0));
}

if(typeof window!=='undefined'){
  window.coutReelAchat = coutReelAchat;
  window.achatFraisLire = achatFraisLire;
  window.achatLotsDepuis = achatLotsDepuis;
  window.achatFraisAjouter = achatFraisAjouter;
  window.achatAppliquerCoutReel = achatAppliquerCoutReel;
  window.achatCloturer = achatCloturer;
  window.achatRouvrir = achatRouvrir;
  window.achatsEngagesNonRecus = achatsEngagesNonRecus;
}
