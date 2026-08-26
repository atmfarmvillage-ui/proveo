// ══════════════════════════════════════════════════
// PROVENDA — MODULE DIRECTEUR STRATÉGIQUE
// Gestion contrat + commissions auto + rapports quotidiens
// ══════════════════════════════════════════════════

let CONTRAT_ACTIF = null;  // Contrat sélectionné dans le module

// ── HELPERS ───────────────────────────────────────
function _especeDepuisFormule(formuleNom){
  if(!formuleNom) return 'autres';
  const f = (FORMULES_SADARI||[]).find(x=>x.nom===formuleNom);
  if(f?.espece) return f.espece;
  const lc = formuleNom.toLowerCase();
  if(lc.includes('lapin')) return 'lapin';
  if(lc.includes('tilapia')||lc.includes('poisson')) return 'poisson';
  return 'autres';
}

function _groupeCommission(espece){
  // Mappe l'espèce vers le groupe de commission du contrat
  if(espece==='lapin') return 'lapin';
  if(espece==='tilapia'||espece==='poisson') return 'poisson';
  return 'autres';
}

function _moisLabel(mois){
  return new Date(mois+'-15').toLocaleDateString('fr-FR',{month:'long',year:'numeric'});
}

function _joursOuvresEntre(debut, fin, exemptDimanche=true){
  // Retourne la liste des dates (YYYY-MM-DD) entre debut et fin inclus, hors dimanches si demandé
  const out = [];
  const d = new Date(debut+'T12:00:00');
  const f = new Date(fin+'T12:00:00');
  while(d<=f){
    if(!exemptDimanche || d.getDay()!==0){
      out.push(d.toISOString().slice(0,10));
    }
    d.setDate(d.getDate()+1);
  }
  return out;
}

// ── CHARGER LE CONTRAT ACTIF ──────────────────────
let CONTRATS_DISPO = [];      // tous les contrats actifs, pour le sélecteur admin
let CONTRAT_CHOISI_ID = null;  // celui que l'admin regarde en ce moment

async function changerContratRegarde(id){
  CONTRAT_CHOISI_ID = id || null;
  await loadContratActif();
  await renderDirecteur();
}

async function loadContratActif(){
  // Si membre connecté : charger SON contrat
  // Si admin : charger le 1er contrat actif (ou laisser sélectionner)
  let q = SB.from('gp_contrats').select('*').eq('admin_id', GP_ADMIN_ID).eq('actif', true);
  const { data } = await q.order('date_debut', { ascending: false });
  const contrats = data || [];

  // Le membre connecté ne voit que SON contrat
  if(GP_ROLE !== 'admin' && GP_ROLE !== 'daf'){
    const { data: monMembre } = await SB.from('gp_membres')
      .select('id').eq('user_id', GP_USER.id).maybeSingle();
    CONTRAT_ACTIF = contrats.find(c => c.membre_id === monMembre?.id) || null;
  } else {
    // L'admin CHOISIT qui il regarde. Avant, on prenait contrats[0] : avec
    // plusieurs personnes sous contrat, les autres étaient invisibles et leur
    // commission n'était jamais consultée.
    CONTRATS_DISPO = contrats;
    const choisi = contrats.find(c => c.id === CONTRAT_CHOISI_ID);
    CONTRAT_ACTIF = choisi || contrats[0] || null;
    CONTRAT_CHOISI_ID = CONTRAT_ACTIF ? CONTRAT_ACTIF.id : null;
  }
  return CONTRAT_ACTIF;
}

// ══════════════════════════════════════════════════
// CALCUL DES COMMISSIONS DU MOIS
// ══════════════════════════════════════════════════
// ══════════════════════════════════════════════════
// MODÈLE « SACS » — contrats commerciaux 2026
// ══════════════════════════════════════════════════
// Le contrat raisonne au SAC, l'app compte en KG. La conversion est faite une
// fois pour toutes dans les règles, en francs par TONNE :
//     100 F le sac de 25 kg = 4 000 F/t   ·   100 F le sac de 50 kg = 2 000 F/t
// Trois choses que l'ancien modèle ne savait pas faire, et que le contrat exige :
//   1. le taux change au 4e mois, ET selon que la vente est au détail ou en gros ;
//   2. un client quitte le portefeuille 6 mois après sa PREMIÈRE VENTE ENCAISSÉE ;
//   3. passé ce délai il ne rapporte plus qu'un résiduel — et seulement s'il
//      achète encore : 60 jours sans achat et la rente s'éteint définitivement.
// Ce modèle ne s'active que si regles_commissions.modele === 'sacs_v2'.
// Les contrats existants continuent d'utiliser le calcul par tonne d'origine.

function _moisEcoules(depuis, jusqua){
  // Nombre de mois pleins entre deux dates 'YYYY-MM-DD'. Sert à savoir si un
  // client a dépassé les 6 mois : on compte en mois de calendrier, pas en jours,
  // parce que c'est ce que dit le contrat et ce qu'une personne vérifie.
  if(!depuis || !jusqua) return 0;
  const a = new Date(depuis + 'T00:00:00Z'), b = new Date(jusqua + 'T00:00:00Z');
  let m = (b.getUTCFullYear() - a.getUTCFullYear()) * 12 + (b.getUTCMonth() - a.getUTCMonth());
  if(b.getUTCDate() < a.getUTCDate()) m--;
  return Math.max(0, m);
}

function _joursEntre(d1, d2){
  if(!d1 || !d2) return 0;
  return Math.round((new Date(d2 + 'T00:00:00Z') - new Date(d1 + 'T00:00:00Z')) / 86400000);
}

function _plusMois(d, n){
  const x = new Date(d + 'T00:00:00Z');
  const jour = x.getUTCDate();
  x.setUTCMonth(x.getUTCMonth() + n);
  if(x.getUTCDate() < jour) x.setUTCDate(0);   // 31 janv. + 1 mois = 28/29 fév.
  return x.toISOString().slice(0, 10);
}

// La rente résiduelle s'éteint DÉFINITIVEMENT au premier trou de plus de N jours
// après la sortie du portefeuille. Renvoie la date après laquelle plus rien
// n'est dû, ou null si la rente est toujours vivante.
// C'est volontairement irréversible : le contrat dit « ne reprend pas ».
function _renteMorteApres(datesPayees, premierePayee, dureeMois, inactJours){
  if(!premierePayee) return null;
  const sortie = _plusMois(premierePayee, dureeMois);
  const apres = datesPayees.filter(d => d > sortie).sort();
  // Le compteur part de la SORTIE, pas du dernier achat qui la precede : la
  // rente nait a ce moment-la, le client dispose donc d'une fenetre pleine
  // pour racheter. Faire courir l'inactivite avant la sortie punirait un
  // creux survenu alors qu'elle etait encore payee au taux plein.
  let ref = sortie;
  for(const d of apres){
    if(_joursEntre(ref, d) > inactJours){
      const mort = new Date(ref + 'T00:00:00Z');
      mort.setUTCDate(mort.getUTCDate() + inactJours);
      return mort.toISOString().slice(0, 10);
    }
    ref = d;
  }
  return null;
}

// Statuts qui valent « encaissé ». La commission est acquise à l'encaissement,
// jamais à la commande — c'est écrit noir sur blanc dans le contrat.
const _PAYE = ['paye', 'payé', 'solde', 'soldé', 'complet'];
const _estPaye = (s) => _PAYE.includes(String(s || '').toLowerCase());

async function _commissionsSacs(c, mois, debutCalc, finCalc, userIdTitulaire){
  const R      = c.regles_commissions || {};
  const taux   = R.taux || {};
  const role   = R.role || 'commercial';                 // 'commercial' | 'reprise'
  const dureeM = Number(R.portefeuille_mois  || 6);
  const inact  = Number(R.inactivite_jours   || 60);
  const ph1    = Number(R.phase1_mois        || 3);

  // Phase du contrat pour le mois calculé : les 3 premiers mois sont au taux
  // unique de lancement, ensuite le barème distingue détail et gros.
  const moisContrat = _moisEcoules(c.date_debut, mois + '-01') + 1;
  const phase = moisContrat <= ph1 ? 1 : 2;

  // ── Ventes du mois ──────────────────────────────────────────────────────
  const { data: ventes } = await SB.from('gp_ventes')
    .select('id,date,statut_paiement,saisi_par,client_id')
    .eq('admin_id', GP_ADMIN_ID).is('deleted_at', null)
    .gte('date', debutCalc).lte('date', finCalc);
  const vParId = {}; (ventes || []).forEach(v => vParId[v.id] = v);
  const venteIds = (ventes || []).map(v => v.id);

  let lignes = [];
  if(venteIds.length){
    const { data: L } = await SB.from('gp_ventes_lignes')
      .select('vente_id,formule_nom,quantite,type_produit,sous_type,type_prix')
      .in('vente_id', venteIds);
    lignes = L || [];
  }

  // ── Histoire de chaque client concerné ───────────────────────────────────
  // On a besoin, pour CHAQUE client touché ce mois-ci, de sa première vente
  // encaissée (le point de départ des 6 mois) et de sa dernière vente (pour
  // savoir s'il est encore actif). Ces deux dates se calculent : aucune
  // colonne à stocker, donc rien qui puisse se désynchroniser.
  const clientIds = [...new Set((ventes || []).map(v => v.client_id).filter(Boolean))];
  const histo = {};
  if(clientIds.length){
    const { data: H } = await SB.from('gp_ventes')
      .select('client_id,date,statut_paiement')
      .eq('admin_id', GP_ADMIN_ID).is('deleted_at', null)
      .in('client_id', clientIds);
    (H || []).forEach(v => {
      const h = histo[v.client_id] || (histo[v.client_id] = { premierePayee: null, payees: [] });
      if(!_estPaye(v.statut_paiement)) return;
      if(!h.premierePayee || v.date < h.premierePayee) h.premierePayee = v.date;
      h.payees.push(v.date);
    });
    // Une fois par client : la date après laquelle la rente est éteinte.
    Object.values(histo).forEach(h => {
      h.morteApres = _renteMorteApres(h.payees, h.premierePayee, dureeM, inact);
    });
  }
  // Qui a apporté le client — pivot de toute prime d'apport.
  const apporteur = {};
  if(clientIds.length){
    const { data: CL } = await SB.from('gp_clients')
      .select('id,cree_par,enregistre_le').in('id', clientIds);
    (CL || []).forEach(x => apporteur[x.id] = x);
  }

  // ── Ventilation ─────────────────────────────────────────────────────────
  const seaux = { propre_detail: {}, propre_gros: {}, residuel: {}, reprise: {} };
  const vide  = () => ({ lapin: 0, autres: 0, poisson: 0 });
  Object.keys(seaux).forEach(k => seaux[k] = vide());
  const ignores = { pas_a_moi: 0, client_inactif: 0, non_encaisse: 0 };

  for(const l of lignes){
    const v = vParId[l.vente_id]; if(!v) continue;
    if(l.type_produit === 'ferme' || l.type_produit === 'veto') continue;   // hors barème sacs
    const kg = Number(l.quantite || 0); if(!kg) continue;

    // Acquise à l'encaissement, jamais à la commande.
    if(!_estPaye(v.statut_paiement)){ ignores.non_encaisse += kg; continue; }

    const grp = (l.type_produit === 'mp') ? 'autres'
              : _groupeCommission(_especeDepuisFormule(l.formule_nom));
    const h   = histo[v.client_id] || {};
    const age = _moisEcoules(h.premierePayee, v.date);
    const sorti = h.premierePayee && age >= dureeM;
    // « actif » ne veut pas dire « a acheté récemment » : la rente est morte
    // ou vivante, et une fois morte elle ne revit pas.
    const actif = !h.morteApres || v.date <= h.morteApres;

    if(role === 'reprise'){
      // La secrétaire ne touche QUE sur les clients passés au Groupe, encore
      // actifs, et sur les ventes qu'elle enregistre elle-même. Un même sac ne
      // donne jamais lieu à deux commissions de reprise : c'est cette double
      // condition qui l'empêche.
      if(!sorti){ ignores.pas_a_moi += kg; continue; }
      if(userIdTitulaire && v.saisi_par !== userIdTitulaire){ ignores.pas_a_moi += kg; continue; }
      if(!actif){ ignores.client_inactif += kg; continue; }
      seaux.reprise[grp] += kg;
      continue;
    }

    // Commercial : ses ventes propres, ET les clients de son portefeuille même
    // si la vente est saisie par quelqu'un d'autre — c'est l'article 6.6.
    const sienne = (userIdTitulaire && v.saisi_par === userIdTitulaire)
                || (userIdTitulaire && apporteur[v.client_id]?.cree_par === userIdTitulaire);
    if(!sienne){ ignores.pas_a_moi += kg; continue; }

    if(sorti){
      // Sorti du portefeuille : résiduel, et seulement tant qu'il achète.
      if(!actif){ ignores.client_inactif += kg; continue; }
      seaux.residuel[grp] += kg;
    } else {
      const canal = (phase === 1) ? 'propre_detail'                 // taux unique en phase 1
                  : (String(l.type_prix || 'detail') === 'gros' ? 'propre_gros' : 'propre_detail');
      seaux[canal][grp] += kg;
    }
  }

  // ── Francs ──────────────────────────────────────────────────────────────
  const tarif = (grp, quoi) => Number((taux[grp] || {})[quoi] || 0);
  const clefTaux = { propre_detail: (phase === 1 ? 'p1' : 'detail'),
                     propre_gros:   (phase === 1 ? 'p1' : 'gros'),
                     residuel: 'residuel', reprise: 'reprise' };
  const parSeau = {}; let totalAliments = 0;
  for(const [seau, kgs] of Object.entries(seaux)){
    const q = clefTaux[seau];
    const m = { lapin: 0, autres: 0, poisson: 0 };
    for(const g of ['lapin', 'autres', 'poisson']){
      m[g] = Math.round((kgs[g] / 1000) * tarif(g, q));
    }
    parSeau[seau] = { kg: kgs, montants: m, total: m.lapin + m.autres + m.poisson };
    totalAliments += parSeau[seau].total;
  }

  // ── Prime d'apport ──────────────────────────────────────────────────────
  // Due seulement si le prospect a été enregistré AVANT sa première vente, et
  // dans les 90 jours qui l'ont précédée. Un client qui se présente seul, sans
  // enregistrement antérieur, est un client du Groupe : rien n'est dû.
  const pa = R.prime_apport || {};
  const montantApport = Number(pa.montant || 0), validite = Number(pa.validite_jours || 90);
  const apports = [];
  if(montantApport && userIdTitulaire){
    for(const cid of clientIds){
      const a = apporteur[cid], h = histo[cid] || {};
      if(!a || a.cree_par !== userIdTitulaire) continue;
      if(!h.premierePayee) continue;
      if(h.premierePayee < debutCalc || h.premierePayee > finCalc) continue;   // acquise le mois de la 1re vente
      const enr = String(a.enregistre_le || '').slice(0, 10);
      if(!enr || enr > h.premierePayee) continue;                              // enregistré APRÈS : rien
      if(_joursEntre(enr, h.premierePayee) > validite) continue;               // enregistrement périmé
      apports.push({ client_id: cid, enregistre_le: enr, premiere_vente: h.premierePayee });
    }
  }
  const totalApports = apports.length * montantApport;

  return { phase, moisContrat, role, seaux: parSeau, ignores,
           apports, montantApport, totalApports, totalAliments };
}

async function calculerCommissionsMois(contratId, mois){
  // 1. Charger le contrat
  const { data: c } = await SB.from('gp_contrats').select('*').eq('id', contratId).maybeSingle();
  if(!c) return null;

  const regles = c.regles_commissions || {};
  const tarifs = {
    lapin:    Number(regles.lapin_par_tonne   || 0),
    autres:   Number(regles.autres_par_tonne  || 0),
    poisson:  Number(regles.poisson_par_tonne || 0),
    lapinVif: Number(regles.lapin_vivant_unite|| 0),
    oeuf:     Number(regles.oeuf_unite        || 0),
    poulet:   Number(regles.poulet_unite      || 0),
    autreFerme: Number(regles.autre_ferme_unite || 0),
  };

  // 2. Bornes du mois (intersection avec la période du contrat)
  const moisDebut = mois + '-01';
  const moisFin   = finMois(mois);
  const debutCalc = moisDebut > c.date_debut ? moisDebut : c.date_debut;
  const finCalc   = c.date_fin && moisFin > c.date_fin ? c.date_fin : moisFin;

  // 2b. Récupérer le user_id du directeur via le membre lié au contrat (attribution)
  let userIdDirecteur = null;
  if(c.membre_id){
    const { data: mb } = await SB.from('gp_membres').select('user_id').eq('id', c.membre_id).maybeSingle();
    userIdDirecteur = mb?.user_id || null;
  }

  // 2c. MODÈLE « SACS » (contrats commerciaux 2026) — barème au sac converti en
  //     F/tonne, phases, détail/gros, cycle de vie du client. On ne dérive que
  //     si les règles le demandent : les contrats existants ne bougent pas.
  if(String(regles.modele || '') === 'sacs_v2'){
    const sacs = await _commissionsSacs(c, mois, debutCalc, finCalc, userIdDirecteur);
    const kgParGroupe = { lapin: 0, autres: 0, poisson: 0 };
    Object.values(sacs.seaux).forEach(sq => {
      kgParGroupe.lapin   += sq.kg.lapin;
      kgParGroupe.autres  += sq.kg.autres;
      kgParGroupe.poisson += sq.kg.poisson;
    });
    const commissions = { lapin: 0, autres: 0, poisson: 0, lapinVif: 0, oeuf: 0, poulet: 0, autreFerme: 0 };
    Object.values(sacs.seaux).forEach(sq => {
      commissions.lapin   += sq.montants.lapin;
      commissions.autres  += sq.montants.autres;
      commissions.poisson += sq.montants.poisson;
    });
    // Pénalité de rapport : le modèle sacs s'appuie sur un rapport HEBDOMADAIRE,
    // pas quotidien. On laisse le compteur à zéro plutôt que d'inventer.
    return {
      contrat: c, mois, bornes: { debut: debutCalc, fin: finCalc },
      kgParGroupe,
      tonnes: { lapin: kgParGroupe.lapin / 1000, autres: kgParGroupe.autres / 1000, poisson: kgParGroupe.poisson / 1000 },
      unitesFerme: { lapinVif: 0, oeuf: 0, poulet: 0, autreFerme: 0 },
      // Taux AFFICHÉS : ceux réellement appliqués ce mois-ci. Sans ça l'écran
      // montrerait « 0 F/tonne » à côté d'une commission bien calculée — le
      // genre d'incohérence qui fait douter de tout le reste.
      tarifs: {
        lapin:   Number(((regles.taux || {}).lapin   || {})[sacs.phase === 1 ? 'p1' : 'detail'] || 0),
        autres:  Number(((regles.taux || {}).autres  || {})[sacs.phase === 1 ? 'p1' : 'detail'] || 0),
        poisson: Number(((regles.taux || {}).poisson || {})[sacs.phase === 1 ? 'p1' : 'detail'] || 0),
        lapinVif: 0, oeuf: 0, poulet: 0, autreFerme: 0,
      },
      commissions,
      totalCommissionsAliments: sacs.totalAliments,
      totalCommissionsFerme: 0,
      sacs,
      rapports: { obligatoire: false, joursAttendus: 0, manques: 0, penalite_unitaire: 0, penalite_totale: 0 },
    };
  }

  // 3. Charger les ventes du mois (filtrées par saisi_par si membre lié)
  let qV = SB.from('gp_ventes')
    .select('id,date,statut_paiement,saisi_par')
    .eq('admin_id', GP_ADMIN_ID).is('deleted_at',null)
    .gte('date', debutCalc).lte('date', finCalc);
  if(userIdDirecteur) qV = qV.eq('saisi_par', userIdDirecteur);
  const { data: ventes } = await qV;
  const venteIds = (ventes||[]).map(v=>v.id);

  // 4. Charger les lignes correspondantes
  let lignes = [];
  if(venteIds.length){
    const { data: L } = await SB.from('gp_ventes_lignes')
      .select('formule_nom,quantite,vente_id,type_produit,sous_type')
      .in('vente_id', venteIds);
    lignes = L || [];
  }

  // 5. Agréger : kg pour les aliments (formules + MP), unités pour les produits ferme
  const kgParGroupe = { lapin: 0, autres: 0, poisson: 0 };
  const unitesFerme = { lapinVif: 0, oeuf: 0, poulet: 0, autreFerme: 0 };
  for(const l of lignes){
    if(l.type_produit === 'ferme'){
      const st = l.sous_type || 'autre_ferme';
      if(st === 'lapin_vivant') unitesFerme.lapinVif += Number(l.quantite || 0);
      else if(st === 'oeuf') unitesFerme.oeuf += Number(l.quantite || 0);
      else if(st === 'poulet') unitesFerme.poulet += Number(l.quantite || 0);
      else unitesFerme.autreFerme += Number(l.quantite || 0);
    } else {
      const grp = (l.type_produit === 'mp')
        ? 'autres'
        : _groupeCommission(_especeDepuisFormule(l.formule_nom));
      kgParGroupe[grp] += Number(l.quantite || 0);
    }
  }

  // 6. Convertir en tonnes et calculer les commissions
  const tonnes = {
    lapin:   kgParGroupe.lapin   / 1000,
    autres:  kgParGroupe.autres  / 1000,
    poisson: kgParGroupe.poisson / 1000,
  };
  const commissions = {
    lapin:   Math.round(tonnes.lapin   * tarifs.lapin),
    autres:  Math.round(tonnes.autres  * tarifs.autres),
    poisson: Math.round(tonnes.poisson * tarifs.poisson),
    lapinVif: Math.round(unitesFerme.lapinVif * tarifs.lapinVif),
    oeuf:     Math.round(unitesFerme.oeuf * tarifs.oeuf),
    poulet:   Math.round(unitesFerme.poulet * tarifs.poulet),
    autreFerme: Math.round(unitesFerme.autreFerme * tarifs.autreFerme),
  };
  const totalCommissionsAliments = commissions.lapin + commissions.autres + commissions.poisson;
  const totalCommissionsFerme = commissions.lapinVif + commissions.oeuf + commissions.poulet + commissions.autreFerme;

  // 7. Compter les rapports quotidiens manqués
  let nbRapportsManques = 0;
  let joursAttendus = [];
  if(c.rapport_quotidien_obligatoire){
    // Ne compter QUE les jours déjà passés (≤ aujourd'hui)
    const aujourdhui = today();
    const finReports = finCalc > aujourdhui ? aujourdhui : finCalc;
    joursAttendus = _joursOuvresEntre(debutCalc, finReports, c.exempt_dimanche !== false);

    if(joursAttendus.length){
      const { data: R } = await SB.from('gp_rapports_quotidiens')
        .select('date_rapport')
        .eq('contrat_id', contratId)
        .in('date_rapport', joursAttendus);
      const datesSoumises = new Set((R||[]).map(r=>r.date_rapport));
      nbRapportsManques = joursAttendus.filter(d=>!datesSoumises.has(d)).length;
    }
  }
  const penalite = nbRapportsManques * Number(c.penalite_rapport_manquant || 0);

  return {
    contrat: c,
    mois,
    bornes: { debut: debutCalc, fin: finCalc },
    kgParGroupe,
    tonnes,
    unitesFerme,
    tarifs,
    commissions,
    totalCommissionsAliments,
    totalCommissionsFerme,
    rapports: {
      obligatoire: c.rapport_quotidien_obligatoire,
      joursAttendus: joursAttendus.length,
      manques: nbRapportsManques,
      penalite_unitaire: Number(c.penalite_rapport_manquant || 0),
      penalite_totale: penalite,
    },
  };
}

// ══════════════════════════════════════════════════
// RENDU DU MODULE
// ══════════════════════════════════════════════════
async function showDirecteur(){
  await loadContratActif();
  if(!CONTRAT_ACTIF){
    document.getElementById('dir-content').innerHTML = `
      <div style="background:rgba(245,158,11,.08);border:1px solid rgba(245,158,11,.3);border-radius:10px;padding:20px;text-align:center">
        <div style="font-size:14px;color:var(--gold);margin-bottom:10px">⚠ Aucun contrat actif</div>
        <div style="font-size:12px;color:var(--textm);margin-bottom:14px">
          ${GP_ROLE==='admin'?'Créez un contrat pour un membre de l\'équipe pour activer la génération auto des salaires.':'Aucun contrat actif vous concernant.'}
        </div>
        ${GP_ROLE==='admin'?'<button class="btn btn-g" onclick="ouvrirCreerContrat()">➕ Créer un contrat</button>':''}
      </div>`;
    return;
  }
  await renderDirecteur();
}

// Remplit le sélecteur de personne. Sans lui, l'admin ne voyait qu'un seul
// contrat — celui qui sortait en tête — et les autres n'étaient jamais consultés.
function _dirRemplirSelecteur(){
  const sel = document.getElementById('dir-qui');
  if(!sel || !CONTRATS_DISPO.length) return;
  sel.innerHTML = CONTRATS_DISPO.map(c => {
    const r = (c.regles_commissions || {}).role;
    const suffixe = r === 'reprise' ? ' · reprise' : (r === 'commercial' ? ' · commercial' : '');
    return `<option value="${c.id}" ${c.id === CONTRAT_CHOISI_ID ? 'selected' : ''}>${c.nom_complet || c.poste || '—'}${suffixe}</option>`;
  }).join('');
}

// Le detail du calcul, seau par seau. C'est ce qu'on montre a la personne
// concernee en fin de mois : un montant sans son chemin se conteste.
// On affiche aussi ce qui a ete ECARTE — c'est toujours la premiere question.
function _dirVentilation(calc){
  const S = calc.sacs;
  if(!S) return '';   // ancien modele : rien a ventiler

  const LIB = {
    propre_detail: { t: 'Ses ventes \u2014 prix de d\u00e9tail', a: S.phase === 1 ? 'taux de lancement' : 'taux plein d\u00e9tail' },
    propre_gros:   { t: 'Ses ventes \u2014 prix de gros',   a: S.phase === 1 ? 'taux de lancement' : 'taux gros' },
    residuel:      { t: 'Clients pass\u00e9s au Groupe',    a: 'r\u00e9siduel, tant que le client ach\u00e8te encore' },
    reprise:       { t: 'Clients repris et suivis',    a: 'commission de suivi' },
  };
  const G = [['lapin', '\ud83d\udc30 Lapin'], ['poisson', '\ud83d\udc1f Poisson'], ['autres', '\ud83c\udf3e Autres']];

  const lignes = Object.entries(S.seaux)
    .filter(([, v]) => v.total > 0)
    .map(([cle, v]) => {
      const kgTot = v.kg.lapin + v.kg.poisson + v.kg.autres;
      const detail = G.filter(([g]) => v.kg[g] > 0)
        .map(([g, lib]) => lib + ' ' + fmtKg(v.kg[g] / 1000) + ' t').join(' \u00b7 ');
      return '<tr>'
        + '<td><div style="font-weight:600">' + (LIB[cle] ? LIB[cle].t : cle) + '</div>'
        + '<div style="font-size:10px;color:var(--textm)">' + (LIB[cle] ? LIB[cle].a : '') + '</div>'
        + (detail ? '<div style="font-size:10px;color:var(--textm);margin-top:2px">' + detail + '</div>' : '')
        + '</td>'
        + '<td class="num">' + fmtKg(kgTot / 1000) + ' t</td>'
        + '<td class="num" style="color:var(--gold);font-weight:700">' + fmt(v.total) + ' F</td>'
        + '</tr>';
    }).join('');

  const inact = (calc.contrat && calc.contrat.regles_commissions && calc.contrat.regles_commissions.inactivite_jours) || 60;
  const ecarte = [];
  if(S.ignores.non_encaisse > 0)
    ecarte.push(fmtKg(S.ignores.non_encaisse / 1000) + ' t non encaiss\u00e9es \u2014 la commission est acquise au paiement, pas \u00e0 la commande');
  if(S.ignores.client_inactif > 0)
    ecarte.push(fmtKg(S.ignores.client_inactif / 1000) + ' t sur des clients dont la rente est \u00e9teinte (plus de ' + inact + ' jours sans achat)');
  if(S.ignores.pas_a_moi > 0)
    ecarte.push(fmtKg(S.ignores.pas_a_moi / 1000) + ' t hors de son p\u00e9rim\u00e8tre');

  const apports = S.apports.length
    ? '<tr><td><div style="font-weight:600">Primes d\u2019apport</div>'
      + '<div style="font-size:10px;color:var(--textm)">' + S.apports.length
      + ' nouveau(x) client(s), enregistr\u00e9(s) avant leur premi\u00e8re vente</div></td>'
      + '<td class="num">' + S.apports.length + '</td>'
      + '<td class="num" style="color:var(--gold);font-weight:700">' + fmt(S.totalApports) + ' F</td></tr>'
    : '';

  const corps = lignes
    ? '<table class="tbl" style="font-size:11px;width:100%">'
      + '<thead><tr><th>Origine</th><th class="num">Volume</th><th class="num">Montant</th></tr></thead>'
      + '<tbody>' + lignes + apports
      + '<tr style="background:rgba(22,163,74,.05);font-weight:700"><td colspan="2">Total</td>'
      + '<td class="num" style="color:var(--gold)">' + fmt(S.totalAliments + S.totalApports) + ' F</td></tr>'
      + '</tbody></table>'
    : '<div style="padding:14px;color:var(--textm);font-size:12px">Aucune commission ce mois-ci.</div>';

  const blocEcarte = ecarte.length
    ? '<div style="margin-top:10px;background:rgba(245,158,11,.07);border:1px solid rgba(245,158,11,.2);border-radius:8px;padding:9px;font-size:11px">'
      + '<div style="font-weight:600;margin-bottom:3px">\u00c9cart\u00e9 du calcul</div>'
      + ecarte.map(e => '<div style="color:var(--textm)">\u2022 ' + e + '</div>').join('')
      + '</div>'
    : '';

  return '<div class="card" style="margin-bottom:14px">'
    + '<div class="card-title"><div class="ct-left"><span>\ud83e\uddee Comment ce montant est calcul\u00e9</span></div>'
    + '<span class="badge bdg-gold" style="font-size:10px">Mois ' + S.moisContrat + ' \u00b7 phase ' + S.phase + '</span></div>'
    + corps + blocEcarte + '</div>';
}

async function renderDirecteur(){
  const c = CONTRAT_ACTIF;
  _dirRemplirSelecteur();
  const mois = document.getElementById('dir-mois')?.value || thisMonth();
  const calc = await calculerCommissionsMois(c.id, mois);
  if(!calc) return;

  const isAdminOrDaf = GP_ROLE === 'admin' || GP_ROLE === 'daf';

  // En-tête contrat
  const enTete = `
    <div style="background:linear-gradient(135deg,rgba(22,163,74,.08),rgba(245,158,11,.05));border:1px solid rgba(22,163,74,.25);border-radius:14px;padding:18px;margin-bottom:14px">
      <div style="display:flex;justify-content:space-between;flex-wrap:wrap;gap:14px;align-items:flex-start">
        <div>
          <div style="font-size:18px;font-weight:700;color:var(--text)">${c.nom_complet}</div>
          <div style="font-size:12px;color:var(--gold);margin:4px 0">${c.poste}</div>
          <div style="font-size:11px;color:var(--textm)">
            ${c.type_contrat} · du <strong>${c.date_debut}</strong>${c.date_fin?` au <strong>${c.date_fin}</strong>`:''}
          </div>
        </div>
        <div style="text-align:right">
          <div style="font-size:11px;color:var(--textm)">Salaire base mensuel</div>
          <div style="font-size:22px;font-weight:700;color:var(--gold)">${fmt(c.salaire_base)} F</div>
        </div>
      </div>
    </div>`;

  // Objectifs
  const objectifsHtml = await _renderObjectifs(c, mois);

  // Détail commissions — Aliments
  const ligneFerme = (icone, label, qte, tarif, comm) => qte>0 || tarif>0 ? `
    <tr><td>${icone} ${label}</td><td class="num">${qte} u</td><td class="num">${fmt(tarif)} F/u</td><td class="num" style="color:var(--gold);font-weight:700">${fmt(comm)} F</td></tr>
  ` : '';

  const ventilation = _dirVentilation(calc);

  const detailCommissions = `
    <div class="card" style="margin-bottom:14px">
      <div class="card-title"><div class="ct-left"><span>💰 Commissions aliments — ${_moisLabel(mois)}</span></div></div>
      <table class="tbl" style="font-size:11px;width:100%">
        <thead><tr><th>Catégorie</th><th class="num">Tonnes vendues</th><th class="num">Tarif</th><th class="num">Commission</th></tr></thead>
        <tbody>
          <tr><td>🐰 Aliments lapins</td><td class="num">${fmtKg(calc.tonnes.lapin)} t</td><td class="num">${fmt(calc.tarifs.lapin)} F/t</td><td class="num" style="color:var(--gold);font-weight:700">${fmt(calc.commissions.lapin)} F</td></tr>
          <tr><td>🌾 Autres aliments</td><td class="num">${fmtKg(calc.tonnes.autres)} t</td><td class="num">${fmt(calc.tarifs.autres)} F/t</td><td class="num" style="color:var(--gold);font-weight:700">${fmt(calc.commissions.autres)} F</td></tr>
          <tr><td>🐟 Aliments poissons</td><td class="num">${fmtKg(calc.tonnes.poisson)} t</td><td class="num">${fmt(calc.tarifs.poisson)} F/t</td><td class="num" style="color:var(--gold);font-weight:700">${fmt(calc.commissions.poisson)} F</td></tr>
          <tr style="background:rgba(22,163,74,.05);font-weight:700">
            <td colspan="3">Total commissions aliments</td>
            <td class="num" style="color:var(--gold)">${fmt(calc.totalCommissionsAliments)} F</td>
          </tr>
        </tbody>
      </table>
    </div>
    ${(calc.totalCommissionsFerme>0 || calc.tarifs.lapinVif>0 || calc.tarifs.oeuf>0 || calc.tarifs.poulet>0 || calc.tarifs.autreFerme>0) ? `
    <div class="card" style="margin-bottom:14px">
      <div class="card-title"><div class="ct-left"><span>🚜 Commissions produits ferme — ${_moisLabel(mois)}</span></div></div>
      <table class="tbl" style="font-size:11px;width:100%">
        <thead><tr><th>Catégorie</th><th class="num">Unités vendues</th><th class="num">Tarif</th><th class="num">Commission</th></tr></thead>
        <tbody>
          ${ligneFerme('🐰','Lapins vivants', calc.unitesFerme.lapinVif, calc.tarifs.lapinVif, calc.commissions.lapinVif)}
          ${ligneFerme('🥚','Œufs', calc.unitesFerme.oeuf, calc.tarifs.oeuf, calc.commissions.oeuf)}
          ${ligneFerme('🐔','Poulets', calc.unitesFerme.poulet, calc.tarifs.poulet, calc.commissions.poulet)}
          ${ligneFerme('📦','Autres produits ferme', calc.unitesFerme.autreFerme, calc.tarifs.autreFerme, calc.commissions.autreFerme)}
          <tr style="background:rgba(22,163,74,.05);font-weight:700">
            <td colspan="3">Total commissions ferme</td>
            <td class="num" style="color:var(--gold)">${fmt(calc.totalCommissionsFerme)} F</td>
          </tr>
        </tbody>
      </table>
      <div style="font-size:10px;color:var(--textm);margin-top:8px">
        💡 Les commissions ferme sont calculées automatiquement depuis les ventes enregistrées dans la page Ventes (type « Produit ferme »).
      </div>
    </div>` : ''}`;

  // Rapports
  const rapportsHtml = calc.rapports.obligatoire ? `
    <div class="card" style="margin-bottom:14px">
      <div class="card-title"><div class="ct-left"><span>📋 Rapports quotidiens — ${_moisLabel(mois)}</span></div></div>
      <div class="g4" style="margin-bottom:10px">
        <div class="econo-box"><div class="econo-val">${calc.rapports.joursAttendus}</div><div class="econo-lbl">Jours attendus</div></div>
        <div class="econo-box"><div class="econo-val" style="color:var(--green)">${calc.rapports.joursAttendus - calc.rapports.manques}</div><div class="econo-lbl">Soumis</div></div>
        <div class="econo-box"><div class="econo-val" style="color:var(--red)">${calc.rapports.manques}</div><div class="econo-lbl">Manqués</div></div>
        <div class="econo-box"><div class="econo-val" style="color:var(--red)">−${fmt(calc.rapports.penalite_totale)} F</div><div class="econo-lbl">Pénalité</div></div>
      </div>
      <div id="dir-calendrier"></div>
    </div>` : '';

  // Bouton génération
  const boutonGen = isAdminOrDaf ? `
    <div class="card" style="margin-bottom:14px;background:rgba(245,158,11,.06);border-color:rgba(245,158,11,.3)">
      <div class="card-title"><div class="ct-left"><span>🧮 Génération du salaire</span></div></div>
      <div style="font-size:12px;color:var(--textm);margin-bottom:10px">
        Calcul automatique : <strong style="color:var(--gold)">${fmt(c.salaire_base)} F</strong>
        (salaire base) + <strong style="color:var(--gold)">${fmt(calc.totalCommissionsAliments)} F</strong>
        (commissions aliments)
        ${calc.totalCommissionsFerme>0?` + <strong style="color:var(--gold)">${fmt(calc.totalCommissionsFerme)} F</strong> (commissions ferme)`:''}
        ${calc.rapports.penalite_totale>0?` − <strong style="color:var(--red)">${fmt(calc.rapports.penalite_totale)} F</strong> (pénalités)`:''}
        = Net pré-calculé <strong style="color:var(--green)">${fmt(Number(c.salaire_base)+calc.totalCommissionsAliments+calc.totalCommissionsFerme-calc.rapports.penalite_totale)} F</strong>
      </div>
      <button class="btn btn-g" style="width:100%;justify-content:center" onclick="ouvrirGenererSalaire('${c.id}','${mois}')">
        💰 Générer le salaire de ${_moisLabel(mois)}
      </button>
    </div>` : '';

  // Historique salaires
  const histoHtml = await _renderHistoSalairesDirecteur(c);

  document.getElementById('dir-content').innerHTML = `
    ${enTete}
    ${objectifsHtml}
    ${ventilation}
    ${detailCommissions}
    ${rapportsHtml}
    ${boutonGen}
    ${histoHtml}
  `;

  if(calc.rapports.obligatoire) _renderCalendrierRapports(c.id, mois);
}

async function _renderObjectifs(c, mois){
  const obj = c.objectifs || [];
  if(!obj.length) return '';

  // Récupérer le user_id du membre lié au contrat pour filtrer les ventes
  let userIdDir = null;
  if(c.membre_id){
    const { data: mb } = await SB.from('gp_membres').select('user_id').eq('id', c.membre_id).maybeSingle();
    userIdDir = mb?.user_id || null;
  }

  const cards = await Promise.all(obj.map(async o => {
    let realise = 0;
    let pct = 0;
    let detail = '';

    if(o.type === 'ventes_kg_espece'){
      // Total kg vendus depuis date_debut jusqu'à la deadline (ou aujourd'hui)
      const fin = o.deadline && o.deadline < today() ? o.deadline : today();
      let qV = SB.from('gp_ventes').select('id')
        .eq('admin_id', GP_ADMIN_ID).is('deleted_at',null)
        .gte('date', c.date_debut).lte('date', fin);
      if(userIdDir) qV = qV.eq('saisi_par', userIdDir);
      const { data: V } = await qV;
      const ids = (V||[]).map(v=>v.id);
      if(ids.length){
        const { data: L } = await SB.from('gp_ventes_lignes')
          .select('formule_nom,quantite,type_produit').in('vente_id', ids);
        realise = (L||[]).filter(l => l.type_produit !== 'ferme' && l.type_produit !== 'mp' && _especeDepuisFormule(l.formule_nom) === o.espece)
                         .reduce((s,l)=>s+Number(l.quantite||0), 0);
      }
      pct = Math.min(100, Math.round(realise / o.cible * 100));
      detail = `${fmtKg(realise/1000)} t / ${fmtKg(o.cible/1000)} t`;
    } else if(o.type === 'lapins_vivants_mois'){
      // Source 1 : ventes ferme sous_type='lapin_vivant' du mois
      let qV = SB.from('gp_ventes').select('id')
        .eq('admin_id', GP_ADMIN_ID).is('deleted_at',null)
        .gte('date', mois+'-01').lte('date', finMois(mois));
      if(userIdDir) qV = qV.eq('saisi_par', userIdDir);
      const { data: V } = await qV;
      const ids = (V||[]).map(v=>v.id);
      let lapinsVentes = 0;
      if(ids.length){
        const { data: L } = await SB.from('gp_ventes_lignes')
          .select('quantite,sous_type,type_produit').in('vente_id', ids);
        lapinsVentes = (L||[]).filter(l => l.type_produit==='ferme' && l.sous_type==='lapin_vivant')
                              .reduce((s,l)=>s+Number(l.quantite||0), 0);
      }
      // Source 2 : saisies manuelles dans les salaires (rétrocompat)
      const { data: S } = await SB.from('gp_salaires').select('detail_calcul')
        .eq('contrat_id', c.id).eq('mois', mois);
      const lapinsManuel = (S||[]).reduce((s,x)=>s+Number(x.detail_calcul?.lapins_vivants||0),0);
      realise = lapinsVentes + lapinsManuel;
      pct = Math.min(100, Math.round(realise / o.cible * 100));
      detail = `${realise} / ${o.cible} lapins`;
    }

    const couleur = pct >= 100 ? 'var(--green)' : pct >= 50 ? 'var(--gold)' : 'var(--red)';
    return `
      <div style="background:var(--card2);border:1px solid var(--border);border-radius:10px;padding:14px;margin-bottom:10px">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:6px">
          <div style="font-size:12px;font-weight:600;color:var(--text)">${o.libelle}</div>
          <div style="font-size:11px;color:${couleur};font-weight:700">${pct}%</div>
        </div>
        <div style="font-size:10px;color:var(--textm);margin-bottom:8px">
          ${detail}${o.deadline?` · échéance ${o.deadline}`:''}
        </div>
        <div style="background:var(--card2);border-radius:20px;height:8px;overflow:hidden">
          <div style="height:100%;width:${pct}%;background:${couleur};border-radius:20px;transition:width .3s"></div>
        </div>
      </div>`;
  }));

  return `
    <div class="card" style="margin-bottom:14px">
      <div class="card-title"><div class="ct-left"><span>🎯 Objectifs</span></div></div>
      ${cards.join('')}
    </div>`;
}

async function _renderCalendrierRapports(contratId, mois){
  const el = document.getElementById('dir-calendrier');
  if(!el) return;
  const [y, m] = mois.split('-').map(Number);
  const nbJours = new Date(y, m, 0).getDate();

  const { data: R } = await SB.from('gp_rapports_quotidiens')
    .select('date_rapport').eq('contrat_id', contratId)
    .gte('date_rapport', mois+'-01').lte('date_rapport', finMois(mois));
  const soumis = new Set((R||[]).map(r=>r.date_rapport));
  const ajdh = today();

  const c = CONTRAT_ACTIF;
  const exemptDim = c.exempt_dimanche !== false;
  const dateDebut = c.date_debut;
  const dateFin = c.date_fin;

  let html = '<div style="display:grid;grid-template-columns:repeat(7,1fr);gap:4px">';
  // En-têtes jours
  ['L','M','M','J','V','S','D'].forEach(j=>{
    html += `<div style="text-align:center;font-size:9px;color:var(--textm);padding:4px">${j}</div>`;
  });
  // Padding avant le 1er
  const premier = new Date(y, m-1, 1);
  const padding = (premier.getDay() + 6) % 7;
  for(let i=0;i<padding;i++) html += '<div></div>';

  for(let d=1; d<=nbJours; d++){
    const dateStr = `${mois}-${String(d).padStart(2,'0')}`;
    const date = new Date(y, m-1, d);
    const estDimanche = date.getDay() === 0;
    const estHorsContrat = dateStr < dateDebut || (dateFin && dateStr > dateFin);
    const estFutur = dateStr > ajdh;
    const estSoumis = soumis.has(dateStr);

    let bg, txt, titre;
    if(estHorsContrat){ bg='var(--card2)'; txt='var(--textm)'; titre='Hors période contrat'; }
    else if(estDimanche && exemptDim){ bg='var(--card2)'; txt='var(--textm)'; titre='Dimanche (exempt)'; }
    else if(estFutur){ bg='var(--card2)'; txt='var(--textm)'; titre='Jour futur'; }
    else if(estSoumis){ bg='rgba(22,163,74,.2)'; txt='var(--green)'; titre='Rapport soumis ✓'; }
    else { bg='rgba(239,68,68,.15)'; txt='var(--red)'; titre='Rapport manqué — pénalité 500 F'; }

    html += `<div title="${dateStr} · ${titre}" style="background:${bg};color:${txt};text-align:center;padding:8px 4px;border-radius:6px;font-size:11px;font-weight:600">${d}</div>`;
  }
  html += '</div>';
  el.innerHTML = html;
}

async function _renderHistoSalairesDirecteur(c){
  const { data: S } = await SB.from('gp_salaires').select('*')
    .eq('contrat_id', c.id).order('mois', { ascending: false });
  const H = S || [];
  if(!H.length){
    return `<div class="card"><div class="card-title"><div class="ct-left"><span>📊 Historique salaires</span></div></div>
      <div style="font-size:11px;color:var(--textm)">Aucun salaire généré pour ce contrat.</div></div>`;
  }
  return `<div class="card">
    <div class="card-title"><div class="ct-left"><span>📊 Historique salaires</span></div></div>
    <table class="tbl" style="font-size:11px;width:100%">
      <thead><tr><th>Mois</th><th class="num">Base</th><th class="num">Commissions</th><th class="num">Pénalité</th><th class="num">Net</th><th>Date paiement</th><th></th></tr></thead>
      <tbody>
        ${H.map(s=>`<tr>
          <td>${_moisLabel(s.mois)}</td>
          <td class="num">${fmt(s.salaire_base||0)} F</td>
          <td class="num" style="color:var(--gold)">${fmt(s.primes||0)} F</td>
          <td class="num" style="color:var(--red)">${fmt(s.avances||0)} F</td>
          <td class="num" style="color:var(--green);font-weight:700">${fmt(s.montant)} F</td>
          <td style="font-size:10px">${s.date_paiement||'—'}</td>
          <td><button class="btn btn-print btn-sm" onclick="imprimerFichePaie('${s.id}')">🖨️</button></td>
        </tr>`).join('')}
      </tbody>
    </table>
  </div>`;
}

// ══════════════════════════════════════════════════
// GÉNÉRATION DU SALAIRE
// ══════════════════════════════════════════════════
async function ouvrirGenererSalaire(contratId, mois){
  const calc = await calculerCommissionsMois(contratId, mois);
  if(!calc) return;
  const c = calc.contrat;

  // Vérifier qu'un salaire n'existe pas déjà
  const { data: existe } = await SB.from('gp_salaires')
    .select('id').eq('contrat_id', contratId).eq('mois', mois).maybeSingle();
  if(existe){
    if(!confirm(`Un salaire existe déjà pour ${_moisLabel(mois)}.\n\nVoulez-vous le remplacer ?`)) return;
    await SB.from('gp_salaires').delete().eq('id', existe.id);
  }

  // Stocker pour le modal
  window._GEN_SALAIRE = { calc, mois };
  document.getElementById('gs-titre').textContent = `Générer le salaire — ${_moisLabel(mois)}`;
  document.getElementById('gs-nom').textContent = c.nom_complet;
  document.getElementById('gs-base').textContent = fmt(c.salaire_base) + ' F';
  document.getElementById('gs-comm-aliments').textContent = fmt(calc.totalCommissionsAliments) + ' F';
  document.getElementById('gs-comm-detail').innerHTML = `
    🐰 Lapins : ${fmt(calc.commissions.lapin)} F (${fmtKg(calc.tonnes.lapin)} t)<br>
    🌾 Autres : ${fmt(calc.commissions.autres)} F (${fmtKg(calc.tonnes.autres)} t)<br>
    🐟 Poissons : ${fmt(calc.commissions.poisson)} F (${fmtKg(calc.tonnes.poisson)} t)`;
  // Commissions ferme (auto depuis ventes)
  const commFerme = calc.totalCommissionsFerme || 0;
  document.getElementById('gs-comm-ferme-wrap').style.display = commFerme>0 ? 'flex' : 'none';
  document.getElementById('gs-comm-ferme').textContent = fmt(commFerme) + ' F';
  document.getElementById('gs-comm-ferme-detail').innerHTML = commFerme>0 ? `
    🐰 Lapins vifs : ${fmt(calc.commissions.lapinVif)} F (${calc.unitesFerme.lapinVif} u)<br>
    🥚 Œufs : ${fmt(calc.commissions.oeuf)} F (${calc.unitesFerme.oeuf} u)<br>
    🐔 Poulets : ${fmt(calc.commissions.poulet)} F (${calc.unitesFerme.poulet} u)<br>
    📦 Autres : ${fmt(calc.commissions.autreFerme)} F (${calc.unitesFerme.autreFerme} u)` : '';
  document.getElementById('gs-penalite').textContent = `−${fmt(calc.rapports.penalite_totale)} F`;
  document.getElementById('gs-penalite-detail').textContent =
    calc.rapports.obligatoire ? `${calc.rapports.manques} rapport(s) manqué(s) × ${fmt(calc.rapports.penalite_unitaire)} F` : 'Non applicable';
  document.getElementById('gs-lapins').value = 0;
  recalcGenSalaire();
  document.getElementById('modal-gen-salaire').style.display = 'flex';
}

function recalcGenSalaire(){
  const data = window._GEN_SALAIRE;
  if(!data) return;
  const c = data.calc.contrat;
  const tarifLapinVif = Number(c.regles_commissions?.lapin_vivant_unite || 0);
  const nbLapins = +document.getElementById('gs-lapins').value || 0;
  const commLapinsVifs = nbLapins * tarifLapinVif;  // saisie manuelle additionnelle (hors ventes)

  const base = Number(c.salaire_base);
  const commAliments = data.calc.totalCommissionsAliments;
  const commFerme = data.calc.totalCommissionsFerme || 0;  // depuis les ventes ferme
  const penalite = data.calc.rapports.penalite_totale;
  const primesManuelles = +document.getElementById('gs-primes').value || 0;
  const avancesManuelles = +document.getElementById('gs-avances').value || 0;

  const totalPrimes = commAliments + commFerme + commLapinsVifs + primesManuelles;
  const totalAvances = penalite + avancesManuelles;
  const net = base + totalPrimes - totalAvances;

  document.getElementById('gs-comm-lapins-vifs').textContent =
    `${fmt(commLapinsVifs)} F (${nbLapins} × ${fmt(tarifLapinVif)} F)`;
  document.getElementById('gs-total-primes').textContent = fmt(totalPrimes) + ' F';
  document.getElementById('gs-total-avances').textContent = '−' + fmt(totalAvances) + ' F';
  document.getElementById('gs-net').textContent = fmt(net) + ' F';

  window._GEN_SALAIRE.totalPrimes = totalPrimes;
  window._GEN_SALAIRE.totalAvances = totalAvances;
  window._GEN_SALAIRE.net = net;
  window._GEN_SALAIRE.nbLapins = nbLapins;
  window._GEN_SALAIRE.commLapinsVifs = commLapinsVifs;
}

async function confirmerGenSalaire(){
  const data = window._GEN_SALAIRE;
  if(!data) return;
  const c = data.calc.contrat;
  const err = document.getElementById('gs-err');
  err.textContent = '';

  const mode = document.getElementById('gs-mode').value;
  const datePaiement = document.getElementById('gs-date').value || today();

  const detailCalcul = {
    base: Number(c.salaire_base),
    commissions: data.calc.commissions,
    tonnes: data.calc.tonnes,
    lapins_vivants: data.nbLapins,
    commission_lapins_vivants: data.commLapinsVifs,
    rapports_manques: data.calc.rapports.manques,
    penalite_rapports: data.calc.rapports.penalite_totale,
    primes_manuelles: +document.getElementById('gs-primes').value || 0,
    avances_manuelles: +document.getElementById('gs-avances').value || 0,
    note: document.getElementById('gs-note').value.trim() || null,
  };

  const { error } = await SB.from('gp_salaires').insert({
    admin_id: GP_ADMIN_ID,
    contrat_id: c.id,
    nom_prenom: c.nom_complet,
    poste: c.poste,
    mois: data.mois,
    salaire_base: c.salaire_base,
    primes: data.totalPrimes,
    avances: data.totalAvances,
    montant: data.net,
    mode,
    date_paiement: datePaiement,
    date_embauche: c.date_debut,
    detail_calcul: detailCalcul,
    genere_auto: true,
  });
  if(error){ err.textContent = 'Erreur : ' + error.message; return; }

  // Mouvement caisse auto (comme dans saveSalaire)
  const { data: caisses } = await SB.from('gp_caisses').select('id')
    .eq('admin_id', GP_ADMIN_ID).eq('type', 'physique').limit(1);
  if(caisses?.length){
    await SB.from('gp_mouvements_caisse').insert({
      admin_id: GP_ADMIN_ID, caisse_id: caisses[0].id,
      type: 'sortie', categorie: 'salaire', montant: data.net,
      date_mouvement: datePaiement,
      description: `Salaire ${c.nom_complet} — ${data.mois} (auto)`,
      enregistre_par: GP_USER.id,
      enregistre_par_nom: GP_USER.email?.split('@')[0],
    });
  }

  document.getElementById('modal-gen-salaire').style.display = 'none';
  notify(`Salaire ${c.nom_complet} généré (${fmt(data.net)} F) ✓`, 'gold');
  await renderDirecteur();
}

function fermerGenSalaire(){
  document.getElementById('modal-gen-salaire').style.display = 'none';
}

// ══════════════════════════════════════════════════
// RAPPORTS QUOTIDIENS
// ══════════════════════════════════════════════════
async function showMesRapports(){
  await loadContratActif();
  if(!CONTRAT_ACTIF){
    document.getElementById('rq-content').innerHTML =
      '<div style="color:var(--textm);font-size:12px">Aucun contrat actif vous concernant.</div>';
    return;
  }
  await renderMesRapports();
}

async function renderMesRapports(){
  const c = CONTRAT_ACTIF;
  const ajdh = today();
  const dejaSoumis = await _rapportDuJour(c.id, ajdh);

  const mois = document.getElementById('rq-mois')?.value || thisMonth();
  const { data: R } = await SB.from('gp_rapports_quotidiens')
    .select('*').eq('contrat_id', c.id)
    .gte('date_rapport', mois+'-01').lte('date_rapport', finMois(mois))
    .order('date_rapport', { ascending: false });

  const formulaire = dejaSoumis ? `
    <div style="background:rgba(22,163,74,.08);border:1px solid rgba(22,163,74,.3);border-radius:10px;padding:14px;margin-bottom:14px">
      <div style="font-weight:700;color:var(--green);margin-bottom:4px">✓ Rapport du jour soumis</div>
      <div style="font-size:11px;color:var(--textm)">Vous avez déjà envoyé votre rapport pour aujourd'hui (${ajdh}).</div>
    </div>` : `
    <div class="card" style="margin-bottom:14px">
      <div class="card-title"><div class="ct-left"><span>📝 Rapport du jour — ${ajdh}</span></div></div>
      <div class="fr"><label>Actions menées</label><textarea id="rq_actions" rows="2" placeholder="Décrivez vos actions du jour..."></textarea></div>
      <div class="fr"><label>Prospects contactés</label><textarea id="rq_prospects" rows="2" placeholder="Nouveaux contacts, présentations..."></textarea></div>
      <div class="fr"><label>Suivis effectués</label><textarea id="rq_suivis" rows="2" placeholder="Relances clients, rappels..."></textarea></div>
      <div class="fr"><label>Ventes réalisées ou en cours</label><textarea id="rq_ventes" rows="2" placeholder="Commandes, négociations..."></textarea></div>
      <div class="fr"><label>Difficultés rencontrées</label><textarea id="rq_difficultes" rows="2" placeholder="Obstacles, besoins..."></textarea></div>
      <button class="btn btn-g" style="width:100%;justify-content:center" onclick="saveRapportQuotidien()">📤 Soumettre le rapport</button>
      <div class="a-err" id="rq_err"></div>
    </div>`;

  const liste = (R||[]).length ? `
    <div class="card">
      <div class="card-title">
        <div class="ct-left"><span>📋 Mes rapports</span></div>
        <input type="month" id="rq-mois" value="${mois}" onchange="renderMesRapports()" style="width:auto;font-size:11px">
      </div>
      ${R.map(r => `
        <details style="background:var(--card2);border:1px solid var(--border);border-radius:8px;padding:10px;margin-bottom:8px">
          <summary style="cursor:pointer;font-weight:600;font-size:12px">📅 ${r.date_rapport} <span style="font-size:10px;color:var(--textm);font-weight:400">· soumis ${new Date(r.heure_soumission).toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'})}</span></summary>
          <div style="margin-top:10px;font-size:11px;line-height:1.6">
            ${r.actions_menees?`<div><strong>Actions :</strong> ${r.actions_menees}</div>`:''}
            ${r.prospects_contactes?`<div><strong>Prospects :</strong> ${r.prospects_contactes}</div>`:''}
            ${r.suivis_effectues?`<div><strong>Suivis :</strong> ${r.suivis_effectues}</div>`:''}
            ${r.ventes_realisees?`<div><strong>Ventes :</strong> ${r.ventes_realisees}</div>`:''}
            ${r.difficultes?`<div><strong>Difficultés :</strong> ${r.difficultes}</div>`:''}
          </div>
        </details>`).join('')}
    </div>` : `<div class="card">
      <div class="card-title">
        <div class="ct-left"><span>📋 Mes rapports</span></div>
        <input type="month" id="rq-mois" value="${mois}" onchange="renderMesRapports()" style="width:auto;font-size:11px">
      </div>
      <div style="font-size:11px;color:var(--textm)">Aucun rapport pour ce mois.</div>
    </div>`;

  document.getElementById('rq-content').innerHTML = formulaire + liste;
}

async function _rapportDuJour(contratId, date){
  const { data } = await SB.from('gp_rapports_quotidiens')
    .select('id').eq('contrat_id', contratId).eq('date_rapport', date).maybeSingle();
  return !!data;
}

async function saveRapportQuotidien(){
  const c = CONTRAT_ACTIF;
  if(!c) return;
  const err = document.getElementById('rq_err');
  const actions = document.getElementById('rq_actions').value.trim();
  if(!actions){ err.textContent = 'Veuillez au moins remplir « Actions menées ».'; return; }

  const { data: monMembre } = await SB.from('gp_membres')
    .select('id').eq('user_id', GP_USER.id).maybeSingle();

  const { error } = await SB.from('gp_rapports_quotidiens').insert({
    admin_id: c.admin_id,
    contrat_id: c.id,
    membre_id: monMembre?.id || null,
    date_rapport: today(),
    actions_menees: actions,
    prospects_contactes: document.getElementById('rq_prospects').value.trim() || null,
    suivis_effectues: document.getElementById('rq_suivis').value.trim() || null,
    ventes_realisees: document.getElementById('rq_ventes').value.trim() || null,
    difficultes: document.getElementById('rq_difficultes').value.trim() || null,
  });
  if(error){ err.textContent = 'Erreur : ' + error.message; return; }
  notify('Rapport soumis ✓', 'gold');
  await renderMesRapports();
}

// ══════════════════════════════════════════════════
// CRÉER / MODIFIER UN CONTRAT (ADMIN)
// ══════════════════════════════════════════════════
async function ouvrirCreerContrat(){
  const { data: M } = await SB.from('gp_membres').select('id,nom')
    .eq('admin_id', GP_ADMIN_ID).order('nom');
  const sel = document.getElementById('ctr_membre');
  sel.innerHTML = '<option value="">— Aucun (créer le contrat seul) —</option>' +
    (M||[]).map(m=>`<option value="${m.id}">${m.nom}</option>`).join('');

  // Reset
  ['ctr_nom','ctr_poste','ctr_date_debut','ctr_date_fin','ctr_salaire',
   'ctr_lapin','ctr_autres','ctr_poisson','ctr_lapin_vif','ctr_oeuf','ctr_poulet','ctr_autre_ferme',
   'ctr_penalite','ctr_notes']
    .forEach(id=>{ const e=document.getElementById(id); if(e) e.value=''; });

  // Valeurs par défaut (contrat type Directeur Stratégique)
  document.getElementById('ctr_poste').value = 'Directeur de la Stratégie Commerciale';
  document.getElementById('ctr_salaire').value = 100000;
  document.getElementById('ctr_lapin').value = 3000;
  document.getElementById('ctr_autres').value = 2000;
  document.getElementById('ctr_poisson').value = 0;
  document.getElementById('ctr_lapin_vif').value = 100;
  document.getElementById('ctr_penalite').value = 500;
  document.getElementById('ctr_rapport_obli').checked = true;
  document.getElementById('ctr_dim_exempt').checked = true;

  document.getElementById('modal-creer-contrat').style.display = 'flex';
}

function fermerCreerContrat(){
  document.getElementById('modal-creer-contrat').style.display = 'none';
}

async function saveContrat(){
  const err = document.getElementById('ctr_err');
  err.textContent = '';

  const membreId = document.getElementById('ctr_membre').value || null;
  let nom = document.getElementById('ctr_nom').value.trim();
  if(!nom && membreId){
    // Récupérer le nom du membre
    const opt = document.querySelector(`#ctr_membre option[value="${membreId}"]`);
    if(opt) nom = opt.textContent;
  }
  const poste = document.getElementById('ctr_poste').value.trim();
  const dateDebut = document.getElementById('ctr_date_debut').value;
  const dateFin = document.getElementById('ctr_date_fin').value || null;
  const salaire = +document.getElementById('ctr_salaire').value || 0;

  if(!nom || !poste || !dateDebut || !salaire){
    err.textContent = 'Nom, poste, date début et salaire requis.';
    return;
  }

  const regles = {
    lapin_par_tonne:    +document.getElementById('ctr_lapin').value || 0,
    autres_par_tonne:   +document.getElementById('ctr_autres').value || 0,
    poisson_par_tonne:  +document.getElementById('ctr_poisson').value || 0,
    lapin_vivant_unite: +document.getElementById('ctr_lapin_vif').value || 0,
    oeuf_unite:         +document.getElementById('ctr_oeuf')?.value || 0,
    poulet_unite:       +document.getElementById('ctr_poulet')?.value || 0,
    autre_ferme_unite:  +document.getElementById('ctr_autre_ferme')?.value || 0,
  };

  // Objectifs (par défaut, ceux du contrat Amezian si CDD ≤ 3 mois)
  const objectifs = [];
  if(document.getElementById('ctr_obj_lapin').checked){
    objectifs.push({
      libelle: 'Doubler ventes aliments lapins',
      cible: 20000, unite: 'kg', type: 'ventes_kg_espece',
      espece: 'lapin', deadline: dateFin,
    });
  }
  if(document.getElementById('ctr_obj_lapins_vifs').checked){
    objectifs.push({
      libelle: 'Vendre 100 lapins par mois',
      cible: 100, unite: 'lapins', type: 'lapins_vivants_mois', deadline: null,
    });
  }

  const { error } = await SB.from('gp_contrats').insert({
    admin_id: GP_ADMIN_ID,
    membre_id: membreId,
    nom_complet: nom, poste,
    type_contrat: dateFin ? 'CDD' : 'CDI',
    date_debut: dateDebut, date_fin: dateFin,
    salaire_base: salaire,
    regles_commissions: regles,
    objectifs: objectifs,
    rapport_quotidien_obligatoire: document.getElementById('ctr_rapport_obli').checked,
    penalite_rapport_manquant: +document.getElementById('ctr_penalite').value || 0,
    exempt_dimanche: document.getElementById('ctr_dim_exempt').checked,
    notes: document.getElementById('ctr_notes').value.trim() || null,
    actif: true,
  });
  if(error){ err.textContent = 'Erreur : ' + error.message; return; }

  fermerCreerContrat();
  notify('Contrat créé ✓', 'gold');
  await showDirecteur();
}

// ══════════════════════════════════════════════════
// ÉDITEUR DE CONTRATS — l'admin change le barème lui-même
// ══════════════════════════════════════════════════
// Sans cet écran, chaque taux, chaque durée, chaque prime passait par du SQL.
// Un système dont on ne peut pas changer les règles soi-même n'appartient pas
// à celui qui l'exploite. Tout ce qui est négociable dans le contrat papier est
// éditable ici : taux par phase et par canal, durée du portefeuille, délai
// d'inactivité, prime d'apport, salaire, dates.
// L'écran se construit tout seul : rien à ajouter dans index.html.

const _CT_GROUPES = [
  { cle: 'lapin',   lib: '🐰 Lapin',   sac: '25 kg' },
  { cle: 'poisson', lib: '🐟 Poisson', sac: '25 kg' },
  { cle: 'autres',  lib: '🌾 Autres formules', sac: '50 kg' },
];
const _CT_COLONNES = [
  { cle: 'p1',       lib: 'Phase 1',   aide: 'les 3 premiers mois, taux unique' },
  { cle: 'detail',   lib: 'Détail',    aide: 'à partir du mois 4' },
  { cle: 'gros',     lib: 'Gros',      aide: 'à partir du mois 4' },
  { cle: 'residuel', lib: 'Résiduel',  aide: 'client passé au Groupe après 6 mois' },
  { cle: 'reprise',  lib: 'Reprise',   aide: 'ce que touche la secrétaire qui suit le client' },
];

// Le contrat parle en francs par SAC, la base stocke des francs par TONNE.
// On affiche les deux : personne ne doit avoir à faire la conversion de tête.
const _ctParSac = (parTonne, kgSac) => Math.round((Number(parTonne) || 0) * kgSac / 1000);
const _ctParTonne = (parSac, kgSac) => Math.round((Number(parSac) || 0) * 1000 / kgSac);

async function ouvrirEditeurContrats(){
  const { data: contrats } = await SB.from('gp_contrats')
    .select('*').eq('admin_id', GP_ADMIN_ID).order('actif', { ascending: false }).order('nom_complet');
  const { data: membres } = await SB.from('gp_membres')
    .select('id,nom,role,point_vente').eq('admin_id', GP_ADMIN_ID).order('nom');
  window._CT = { contrats: contrats || [], membres: membres || [] };

  let el = document.getElementById('modal-contrats');
  if(!el){
    el = document.createElement('div');
    el.id = 'modal-contrats';
    el.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:9000;display:flex;align-items:flex-start;justify-content:center;overflow:auto;padding:20px';
    document.body.appendChild(el);
  }
  el.style.display = 'flex';
  _ctRenderListe();
}

function fermerEditeurContrats(){
  const el = document.getElementById('modal-contrats');
  if(el) el.style.display = 'none';
}

function _ctCadre(contenu){
  return `<div style="background:var(--card,#fff);border-radius:14px;max-width:900px;width:100%;padding:20px;box-shadow:0 10px 40px rgba(0,0,0,.3)">${contenu}</div>`;
}

function _ctRenderListe(){
  const { contrats, membres } = window._CT;
  const nomMembre = {}; membres.forEach(m => nomMembre[m.id] = m.nom);
  const lignes = contrats.length ? contrats.map(c => {
    const R = c.regles_commissions || {};
    const sacs = String(R.modele || '') === 'sacs_v2';
    const roleLib = R.role === 'reprise' ? 'Reprise (secrétaire)' : (sacs ? 'Commercial' : 'Ancien modèle');
    return `<tr style="border-bottom:1px solid var(--border,#eee)">
      <td style="padding:8px 6px">
        <div style="font-weight:600">${c.nom_complet || nomMembre[c.membre_id] || '—'}</div>
        <div style="font-size:11px;color:var(--textm,#888)">${c.poste || ''}</div>
      </td>
      <td style="padding:8px 6px;font-size:12px">${roleLib}</td>
      <td style="padding:8px 6px;font-size:12px">${fmt(c.salaire_base || 0)} F</td>
      <td style="padding:8px 6px;font-size:12px">${c.date_debut || '—'}${c.date_fin ? ' → ' + c.date_fin : ''}</td>
      <td style="padding:8px 6px">
        <span class="badge ${c.actif ? 'bdg-g' : 'bdg-neutre'}" style="font-size:10px">${c.actif ? 'ACTIF' : 'inactif'}</span>
      </td>
      <td style="padding:8px 6px;text-align:right">
        <button class="btn btn-g btn-sm" onclick="_ctEditer('${c.id}')">Éditer</button>
      </td>
    </tr>`;
  }).join('') : `<tr><td colspan="6" style="padding:18px;text-align:center;color:var(--textm,#888)">Aucun contrat. Crée le premier ci-dessous.</td></tr>`;

  document.getElementById('modal-contrats').innerHTML = _ctCadre(`
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
      <div>
        <h3 style="margin:0">📄 Contrats et barèmes</h3>
        <div style="font-size:12px;color:var(--textm,#888)">Tout ce qui se négocie se change ici, sans passer par la base.</div>
      </div>
      <button class="btn btn-g btn-sm" onclick="fermerEditeurContrats()">Fermer</button>
    </div>
    <div style="overflow:auto">
      <table style="width:100%;border-collapse:collapse;font-size:13px">
        <tr style="text-align:left;border-bottom:2px solid var(--border,#eee)">
          <th style="padding:6px">Personne</th><th style="padding:6px">Barème</th>
          <th style="padding:6px">Fixe</th><th style="padding:6px">Période</th>
          <th style="padding:6px">État</th><th></th>
        </tr>
        ${lignes}
      </table>
    </div>
    <div style="margin-top:16px;display:flex;gap:8px;align-items:center;flex-wrap:wrap">
      <select id="ct-new-membre" style="padding:8px;border:1px solid var(--border,#ddd);border-radius:8px">
        <option value="">— choisir une personne —</option>
        ${membres.map(m => `<option value="${m.id}">${m.nom}${m.point_vente ? ' · ' + m.point_vente : ''}</option>`).join('')}
      </select>
      <button class="btn btn-gold btn-sm" onclick="_ctEditer(null)">➕ Nouveau contrat</button>
    </div>`);
}

function _ctEditer(id){
  const { contrats, membres } = window._CT;
  const c = id ? contrats.find(x => x.id === id) : null;
  if(!c){
    const mid = document.getElementById('ct-new-membre')?.value;
    if(!mid){ notify('Choisis d\'abord la personne', 'r'); return; }
    var membre = membres.find(m => m.id === mid);
  }
  const R = (c && c.regles_commissions) || {};
  const role = R.role || 'commercial';

  // ANCIEN MODÈLE : taux plats par tonne, sans phase ni canal. Ouvrir un tel
  // contrat ici afficherait des cases vides — et l'enregistrer mettrait la
  // commission à zéro. On reprend ses taux comme point de départ pour les trois
  // colonnes de vente, et on prévient en haut de l'écran.
  const ancienModele = !!c && String(R.modele || '') !== 'sacs_v2';
  let T = R.taux || {};
  if(ancienModele){
    const rep = (v) => ({ p1: v, detail: v, gros: v, residuel: 0, reprise: 0 });
    T = {
      lapin:   rep(Number(R.lapin_par_tonne   || 0)),
      poisson: rep(Number(R.poisson_par_tonne || 0)),
      autres:  rep(Number(R.autres_par_tonne  || 0)),
    };
  }
  const val = (g, k) => Number((T[g] || {})[k] || 0);

  const grille = _CT_GROUPES.map(g => `
    <tr>
      <td style="padding:5px 6px;font-size:12px;white-space:nowrap">${g.lib}<br>
        <span style="font-size:10px;color:var(--textm,#888)">sac de ${g.sac}</span></td>
      ${_CT_COLONNES.map(col => `<td style="padding:4px">
        <input id="ct-t-${g.cle}-${col.cle}" type="number" min="0" step="10"
               value="${_ctParSac(val(g.cle, col.cle), g.sac === '25 kg' ? 25 : 50)}"
               oninput="_ctMajTonne('${g.cle}','${col.cle}',${g.sac === '25 kg' ? 25 : 50})"
               style="width:74px;padding:6px;border:1px solid var(--border,#ddd);border-radius:6px;text-align:right">
        <div id="ct-tt-${g.cle}-${col.cle}" style="font-size:9px;color:var(--textm,#888);text-align:right">
          ${fmt(val(g.cle, col.cle))} F/t</div>
      </td>`).join('')}
    </tr>`).join('');

  document.getElementById('modal-contrats').innerHTML = _ctCadre(`
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
      <h3 style="margin:0">${c ? 'Éditer' : 'Nouveau'} — ${c ? (c.nom_complet || '') : (membre ? membre.nom : '')}</h3>
      <button class="btn btn-g btn-sm" onclick="_ctRenderListe()">← Retour</button>
    </div>
    ${ancienModele ? `<div style="background:rgba(245,158,11,.12);border:1px solid rgba(245,158,11,.4);border-radius:10px;padding:10px;margin:8px 0;font-size:12px;color:#92400e">
      <b>⚠️ Ce contrat utilise l'ancien barème</b> — un taux unique par tonne, sans phase ni distinction détail/gros.
      Les cases ci-dessous ont été pré-remplies avec ses taux actuels. <b>Enregistrer le convertira au nouveau modèle.</b>
      Vérifie chaque valeur avant de sauver, ou reviens en arrière pour n'y rien changer.
    </div>` : ''}
    <input type="hidden" id="ct-id" value="${c ? c.id : ''}">
    <input type="hidden" id="ct-membre" value="${c ? (c.membre_id || '') : (membre ? membre.id : '')}">
    <input type="hidden" id="ct-nom" value="${c ? (c.nom_complet || '') : (membre ? membre.nom : '')}">

    <div style="display:flex;gap:10px;flex-wrap:wrap;margin:12px 0">
      <label style="flex:1;min-width:200px;font-size:12px">Poste
        <input id="ct-poste" value="${c ? (c.poste || '') : ''}" style="width:100%;padding:8px;border:1px solid var(--border,#ddd);border-radius:8px">
      </label>
      <label style="width:150px;font-size:12px">Salaire fixe
        <input id="ct-salaire" type="number" min="0" step="1000" value="${c ? Number(c.salaire_base || 0) : 0}" style="width:100%;padding:8px;border:1px solid var(--border,#ddd);border-radius:8px;text-align:right">
      </label>
      <label style="width:150px;font-size:12px">Début
        <input id="ct-debut" type="date" value="${c ? (c.date_debut || '') : ''}" style="width:100%;padding:8px;border:1px solid var(--border,#ddd);border-radius:8px">
      </label>
      <label style="width:150px;font-size:12px">Fin (facultatif)
        <input id="ct-fin" type="date" value="${c ? (c.date_fin || '') : ''}" style="width:100%;padding:8px;border:1px solid var(--border,#ddd);border-radius:8px">
      </label>
    </div>

    <div style="background:rgba(245,158,11,.07);border:1px solid rgba(245,158,11,.25);border-radius:10px;padding:10px;margin-bottom:12px;font-size:12px">
      <label style="font-weight:600">Rôle dans le barème
        <select id="ct-role" style="margin-left:8px;padding:6px;border:1px solid var(--border,#ddd);border-radius:6px">
          <option value="commercial" ${role === 'commercial' ? 'selected' : ''}>Commercial — vend et développe son portefeuille</option>
          <option value="reprise" ${role === 'reprise' ? 'selected' : ''}>Reprise — suit les clients passés au Groupe</option>
        </select>
      </label>
      <div style="margin-top:6px;color:var(--textm,#888)">
        Le <b>commercial</b> touche sur ses ventes et sur les clients qu'il a apportés, puis un résiduel après six mois.
        La <b>reprise</b> ne touche que sur les clients déjà sortis du portefeuille, et seulement sur les ventes qu'elle saisit elle-même.
      </div>
    </div>

    <div style="font-weight:600;font-size:13px;margin-bottom:4px">Commission — en francs par sac</div>
    <div style="font-size:11px;color:var(--textm,#888);margin-bottom:6px">
      Tu saisis au sac, comme dans le contrat. La conversion en francs par tonne, que l'app utilise pour calculer, s'affiche sous chaque case.
    </div>
    <div style="overflow:auto">
      <table style="border-collapse:collapse;font-size:12px">
        <tr><th></th>${_CT_COLONNES.map(col => `<th style="padding:4px 6px;font-size:11px;text-align:center">${col.lib}<br>
          <span style="font-weight:400;color:var(--textm,#888);font-size:9px">${col.aide}</span></th>`).join('')}</tr>
        ${grille}
      </table>
    </div>

    <div style="display:flex;gap:10px;flex-wrap:wrap;margin:14px 0">
      <label style="width:170px;font-size:12px">Portefeuille (mois)
        <input id="ct-portef" type="number" min="1" value="${Number(R.portefeuille_mois || 6)}" style="width:100%;padding:8px;border:1px solid var(--border,#ddd);border-radius:8px;text-align:right">
      </label>
      <label style="width:190px;font-size:12px">Inactivité (jours)
        <input id="ct-inact" type="number" min="1" value="${Number(R.inactivite_jours || 60)}" style="width:100%;padding:8px;border:1px solid var(--border,#ddd);border-radius:8px;text-align:right">
      </label>
      <label style="width:150px;font-size:12px">Phase 1 (mois)
        <input id="ct-ph1" type="number" min="0" value="${Number(R.phase1_mois || 3)}" style="width:100%;padding:8px;border:1px solid var(--border,#ddd);border-radius:8px;text-align:right">
      </label>
      <label style="width:170px;font-size:12px">Prime d'apport (F)
        <input id="ct-apport" type="number" min="0" step="500" value="${Number((R.prime_apport || {}).montant || 0)}" style="width:100%;padding:8px;border:1px solid var(--border,#ddd);border-radius:8px;text-align:right">
      </label>
      <label style="width:190px;font-size:12px">Validité prospect (jours)
        <input id="ct-validite" type="number" min="1" value="${Number((R.prime_apport || {}).validite_jours || 90)}" style="width:100%;padding:8px;border:1px solid var(--border,#ddd);border-radius:8px;text-align:right">
      </label>
      <label style="align-self:flex-end;font-size:12px;padding-bottom:8px">
        <input id="ct-actif" type="checkbox" ${(!c || c.actif) ? 'checked' : ''}> Contrat actif
      </label>
    </div>

    <div style="font-size:11px;color:var(--textm,#888);margin-bottom:10px">
      Un client quitte le portefeuille après le nombre de mois indiqué, à compter de sa <b>première vente encaissée</b>.
      Passé ce délai, il ne rapporte plus que le résiduel — et si l'inactivité est dépassée, plus rien du tout, définitivement.
    </div>

    <div style="display:flex;gap:8px;justify-content:flex-end">
      <button class="btn btn-g btn-sm" onclick="_ctRenderListe()">Annuler</button>
      <button class="btn btn-gold" onclick="_ctSauver()">💾 Enregistrer</button>
    </div>`);
}

function _ctMajTonne(groupe, colonne, kgSac){
  const v = +document.getElementById(`ct-t-${groupe}-${colonne}`).value || 0;
  const el = document.getElementById(`ct-tt-${groupe}-${colonne}`);
  if(el) el.textContent = fmt(_ctParTonne(v, kgSac)) + ' F/t';
}

async function _ctSauver(){
  const id = document.getElementById('ct-id').value || null;
  const membreId = document.getElementById('ct-membre').value || null;
  const debut = document.getElementById('ct-debut').value;
  if(!debut){ notify('La date de début est obligatoire', 'r'); return; }

  const taux = {};
  for(const g of _CT_GROUPES){
    const kg = g.sac === '25 kg' ? 25 : 50;
    taux[g.cle] = {};
    for(const col of _CT_COLONNES){
      taux[g.cle][col.cle] = _ctParTonne(+document.getElementById(`ct-t-${g.cle}-${col.cle}`).value || 0, kg);
    }
  }
  const regles = {
    modele: 'sacs_v2',
    role: document.getElementById('ct-role').value,
    taux,
    portefeuille_mois: +document.getElementById('ct-portef').value || 6,
    inactivite_jours:  +document.getElementById('ct-inact').value  || 60,
    phase1_mois:       +document.getElementById('ct-ph1').value    || 0,
    prime_apport: {
      montant:        +document.getElementById('ct-apport').value   || 0,
      validite_jours: +document.getElementById('ct-validite').value || 90,
    },
  };
  const ligne = {
    admin_id: GP_ADMIN_ID,
    membre_id: membreId,
    nom_complet: document.getElementById('ct-nom').value || null,
    poste: document.getElementById('ct-poste').value || null,
    type_contrat: 'CDD',
    date_debut: debut,
    date_fin: document.getElementById('ct-fin').value || null,
    salaire_base: +document.getElementById('ct-salaire').value || 0,
    regles_commissions: regles,
    rapport_quotidien_obligatoire: false,   // les contrats 2026 prévoient un rapport hebdomadaire
    penalite_rapport_manquant: 0,
    exempt_dimanche: true,
    actif: document.getElementById('ct-actif').checked,
  };

  // Deux contrats actifs pour la même personne = le module en choisirait un au
  // hasard et la paie serait fausse. On désactive l'ancien plutôt que d'empiler.
  if(ligne.actif && membreId){
    await SB.from('gp_contrats').update({ actif: false })
      .eq('admin_id', GP_ADMIN_ID).eq('membre_id', membreId).eq('actif', true)
      .then(() => {}, () => {});
  }

  const { error } = id
    ? await SB.from('gp_contrats').update(ligne).eq('id', id)
    : await SB.from('gp_contrats').insert(ligne);
  if(error){ notify('Erreur : ' + error.message, 'r'); return; }
  notify('Contrat enregistré ✓', 'gold');
  await ouvrirEditeurContrats();
}
