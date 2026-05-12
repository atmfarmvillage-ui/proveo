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
  if(lc.includes('tilapia')||lc.includes('goliath')||lc.includes('poisson')) return 'poisson';
  return 'autres';
}

function _groupeCommission(espece){
  // Mappe l'espèce vers le groupe de commission du contrat
  if(espece==='lapin') return 'lapin';
  if(espece==='tilapia'||espece==='goliath'||espece==='poisson') return 'poisson';
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
    CONTRAT_ACTIF = contrats[0] || null;
  }
  return CONTRAT_ACTIF;
}

// ══════════════════════════════════════════════════
// CALCUL DES COMMISSIONS DU MOIS
// ══════════════════════════════════════════════════
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
  };

  // 2. Bornes du mois (intersection avec la période du contrat)
  const moisDebut = mois + '-01';
  const moisFin   = finMois(mois);
  const debutCalc = moisDebut > c.date_debut ? moisDebut : c.date_debut;
  const finCalc   = c.date_fin && moisFin > c.date_fin ? c.date_fin : moisFin;

  // 3. Charger les ventes du mois
  const { data: ventes } = await SB.from('gp_ventes')
    .select('id,date,statut_paiement')
    .eq('admin_id', GP_ADMIN_ID)
    .gte('date', debutCalc).lte('date', finCalc);
  const venteIds = (ventes||[]).map(v=>v.id);

  // 4. Charger les lignes correspondantes
  let lignes = [];
  if(venteIds.length){
    const { data: L } = await SB.from('gp_ventes_lignes')
      .select('formule_nom,quantite,vente_id,type_produit')
      .in('vente_id', venteIds);
    lignes = L || [];
  }

  // 5. Agréger les kg par groupe de commission
  // - Formules : déduction de l'espèce depuis le nom de la formule
  // - MP (matières premières) : toujours classées en « autres aliments »
  //   (un nom de MP contenant "lapin" ne signifie pas un aliment lapin)
  const kgParGroupe = { lapin: 0, autres: 0, poisson: 0 };
  for(const l of lignes){
    const grp = (l.type_produit === 'mp')
      ? 'autres'
      : _groupeCommission(_especeDepuisFormule(l.formule_nom));
    kgParGroupe[grp] += Number(l.quantite || 0);
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
  };
  const totalCommissionsAliments = commissions.lapin + commissions.autres + commissions.poisson;

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
    tarifs,
    commissions,
    totalCommissionsAliments,
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

async function renderDirecteur(){
  const c = CONTRAT_ACTIF;
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

  // Détail commissions
  const detailCommissions = `
    <div class="card" style="margin-bottom:14px">
      <div class="card-title"><div class="ct-left"><span>💰 Commissions du mois — ${_moisLabel(mois)}</span></div></div>
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
      <div style="font-size:10px;color:var(--textm);margin-top:8px">
        💡 La commission « 100 F par lapin vivant vendu » est saisie manuellement lors de la génération du salaire.
      </div>
    </div>`;

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
        ${calc.rapports.penalite_totale>0?`− <strong style="color:var(--red)">${fmt(calc.rapports.penalite_totale)} F</strong> (pénalités)`:''}
        = Net pré-calculé <strong style="color:var(--green)">${fmt(Number(c.salaire_base)+calc.totalCommissionsAliments-calc.rapports.penalite_totale)} F</strong>
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

  const cards = await Promise.all(obj.map(async o => {
    let realise = 0;
    let pct = 0;
    let detail = '';

    if(o.type === 'ventes_kg_espece'){
      // Total kg vendus depuis date_debut jusqu'à la deadline (ou aujourd'hui)
      const fin = o.deadline && o.deadline < today() ? o.deadline : today();
      const { data: V } = await SB.from('gp_ventes')
        .select('id').eq('admin_id', GP_ADMIN_ID)
        .gte('date', c.date_debut).lte('date', fin);
      const ids = (V||[]).map(v=>v.id);
      if(ids.length){
        const { data: L } = await SB.from('gp_ventes_lignes')
          .select('formule_nom,quantite').in('vente_id', ids);
        realise = (L||[]).filter(l => _especeDepuisFormule(l.formule_nom) === o.espece)
                         .reduce((s,l)=>s+Number(l.quantite||0), 0);
      }
      pct = Math.min(100, Math.round(realise / o.cible * 100));
      detail = `${fmtKg(realise/1000)} t / ${fmtKg(o.cible/1000)} t`;
    } else if(o.type === 'lapins_vivants_mois'){
      // Compte les lapins vivants saisis dans les salaires du mois courant
      const { data: S } = await SB.from('gp_salaires').select('detail_calcul')
        .eq('contrat_id', c.id).eq('mois', mois);
      const lapins = (S||[]).reduce((s,x)=>s+Number(x.detail_calcul?.lapins_vivants||0),0);
      realise = lapins;
      pct = Math.min(100, Math.round(realise / o.cible * 100));
      detail = `${realise} / ${o.cible} lapins`;
    }

    const couleur = pct >= 100 ? 'var(--green)' : pct >= 50 ? 'var(--gold)' : 'var(--red)';
    return `
      <div style="background:rgba(14,20,40,.5);border:1px solid var(--border);border-radius:10px;padding:14px;margin-bottom:10px">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:6px">
          <div style="font-size:12px;font-weight:600;color:var(--text)">${o.libelle}</div>
          <div style="font-size:11px;color:${couleur};font-weight:700">${pct}%</div>
        </div>
        <div style="font-size:10px;color:var(--textm);margin-bottom:8px">
          ${detail}${o.deadline?` · échéance ${o.deadline}`:''}
        </div>
        <div style="background:rgba(30,45,74,.6);border-radius:20px;height:8px;overflow:hidden">
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
    if(estHorsContrat){ bg='rgba(30,45,74,.2)'; txt='var(--textm)'; titre='Hors période contrat'; }
    else if(estDimanche && exemptDim){ bg='rgba(30,45,74,.3)'; txt='var(--textm)'; titre='Dimanche (exempt)'; }
    else if(estFutur){ bg='rgba(30,45,74,.4)'; txt='var(--textm)'; titre='Jour futur'; }
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
  const commLapinsVifs = nbLapins * tarifLapinVif;

  const base = Number(c.salaire_base);
  const commAliments = data.calc.totalCommissionsAliments;
  const penalite = data.calc.rapports.penalite_totale;
  const primesManuelles = +document.getElementById('gs-primes').value || 0;
  const avancesManuelles = +document.getElementById('gs-avances').value || 0;

  const totalPrimes = commAliments + commLapinsVifs + primesManuelles;
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
        <details style="background:rgba(14,20,40,.5);border:1px solid var(--border);border-radius:8px;padding:10px;margin-bottom:8px">
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
   'ctr_lapin','ctr_autres','ctr_poisson','ctr_lapin_vif','ctr_penalite','ctr_notes']
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
