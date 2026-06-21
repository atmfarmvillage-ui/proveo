// ══════════════════════════════════════════════════
// PROVENDA — DASHBOARD KPI DRILL-DOWN
// Clic sur un KPI → modal détaillé avec table + PDF/Excel/WhatsApp
// ══════════════════════════════════════════════════

// Données du drill courant (utilisées par les exports + filtre)
window._kpiDrillData = { type:'', titre:'', rows:[], columns:[], total:0 };

function fermerKpiDrill(){
  document.getElementById('modal-kpi-drill').style.display = 'none';
  document.getElementById('kpi-drill-search').value = '';
}

// Dispatcher : route vers la fonction qui charge les détails selon le type
async function dashKpiDrill(type){
  document.getElementById('modal-kpi-drill').style.display = 'flex';
  document.getElementById('kpi-drill-content').innerHTML =
    '<div style="text-align:center;padding:30px;color:var(--textm)">⏳ Chargement…</div>';
  document.getElementById('kpi-drill-actions').innerHTML = '';
  document.getElementById('kpi-drill-footer').innerHTML = '';
  document.getElementById('kpi-drill-summary').innerHTML = '';
  switch(type){
    case 'ca':         await drillCA(); break;
    case 'encaisse':   await drillEncaisse(); break;
    case 'impayes':    await drillImpayes(); break;
    case 'depenses':   await drillDepenses(); break;
    case 'lots':       await drillLots(); break;
    case 'ca_ferme':   await drillCAFerme(); break;
    case 'caisse':     await drillSoldeCaisse(); break;
    case 'dette_fourn':await drillDetteFournisseurs(); break;
    case 'alertes_mp': await drillAlertesMP(); break;
    default: document.getElementById('kpi-drill-content').innerHTML = '<div>Type inconnu : '+type+'</div>';
  }
}

// ── DRILL : SOLDE CAISSE TOTAL ─────────────────────
async function drillSoldeCaisse(){
  document.getElementById('kpi-drill-titre').textContent = '💵 Détail des caisses';
  const {data:C} = await SB.from('gp_caisses').select('*').eq('admin_id',GP_ADMIN_ID).eq('actif',true).order('type').order('nom');
  const caisses = C||[];
  const {data:M} = await SB.from('gp_mouvements_caisse').select('*').eq('admin_id',GP_ADMIN_ID);
  const soldes = {};
  caisses.forEach(c=>{ soldes[c.id]=Number(c.solde_initial||0); });
  (M||[]).forEach(m=>{
    if(m.type==='entree' && soldes[m.caisse_id]!==undefined) soldes[m.caisse_id]+=Number(m.montant||0);
    if(m.type==='sortie' && soldes[m.caisse_id]!==undefined) soldes[m.caisse_id]-=Number(m.montant||0);
    if(m.type==='ajustement' && soldes[m.caisse_id]!==undefined) soldes[m.caisse_id]+=Number(m.montant||0);
    if(m.type==='transfert'){
      if(soldes[m.caisse_id]!==undefined) soldes[m.caisse_id]-=Number(m.montant||0);
      if(m.caisse_dest_id && soldes[m.caisse_dest_id]!==undefined) soldes[m.caisse_dest_id]+=Number(m.montant||0);
    }
  });
  const total = Object.values(soldes).reduce((s,v)=>s+v,0);
  const rows = caisses.map(c=>({
    nom: (c.type==='banque'?'🏦 ':'💵 ')+c.nom,
    pdv: c.point_vente||'Siège',
    solde_initial: fmt(c.solde_initial||0)+' F',
    solde_actuel: fmt(soldes[c.id]||0)+' F'
  }));
  document.getElementById('kpi-drill-summary').innerHTML =
    `<div style="display:flex;justify-content:space-between;align-items:center;padding:10px;background:rgba(232,197,71,.08);border-radius:8px"><span>Total trésorerie</span><b style="font-size:18px;color:var(--gold)">${fmt(total)} F</b></div>`;
  _renderKpiTable([
    {label:'Caisse',key:'nom'},
    {label:'PDV',key:'pdv'},
    {label:'Solde initial',key:'solde_initial',align:'num'},
    {label:'Solde actuel',key:'solde_actuel',align:'num',style:'color:var(--gold);font-weight:700'},
  ], rows, '', '');
  document.getElementById('kpi-drill-actions').innerHTML =
    `<button class="btn btn-out btn-sm" onclick="document.getElementById('modal-kpi-drill').style.display='none';showGP('caisse')">🔗 Page Caisse</button>`;
}

// ── DRILL : DETTE FOURNISSEURS ─────────────────────
async function drillDetteFournisseurs(){
  document.getElementById('kpi-drill-titre').textContent = '🏢 Dette fournisseurs';
  const {data:A} = await SB.from('gp_achats').select('id,fournisseur_nom,date_commande,ref,montant_total,montant_paye,condition_paiement').eq('admin_id',GP_ADMIN_ID).gt('montant_total',0).order('date_commande',{ascending:false});
  const dettes = (A||[]).filter(a=>Number(a.montant_total||0) > Number(a.montant_paye||0));
  const totalDette = dettes.reduce((s,a)=>s+(Number(a.montant_total||0)-Number(a.montant_paye||0)),0);
  document.getElementById('kpi-drill-summary').innerHTML =
    `<div style="display:flex;justify-content:space-between;align-items:center;padding:10px;background:rgba(239,68,68,.08);border-radius:8px"><span>${dettes.length} achat(s) non soldé(s)</span><b style="font-size:18px;color:var(--red)">${fmt(totalDette)} F à payer</b></div>`;
  _renderKpiTable([
    {label:'Date',key:'date_commande'},
    {label:'Fournisseur',key:'fournisseur_nom'},
    {label:'Réf',key:'ref'},
    {label:'Total',align:'num',render:r=>fmt(r.montant_total||0)+' F'},
    {label:'Payé',align:'num',render:r=>`<span style="color:var(--green)">${fmt(r.montant_paye||0)} F</span>`},
    {label:'Reste',align:'num',render:r=>`<span style="color:var(--red);font-weight:700">${fmt((r.montant_total||0)-(r.montant_paye||0))} F</span>`}
  ], dettes, 'TOTAL DÛ', `<span style="color:var(--red)">${fmt(totalDette)} F</span>`);
  document.getElementById('kpi-drill-actions').innerHTML =
    `<button class="btn btn-out btn-sm" onclick="document.getElementById('modal-kpi-drill').style.display='none';showGP('paiements_mp')">🔗 Paiements MP</button>`;
}

// ── DRILL : ALERTES STOCK MP ───────────────────────
async function drillAlertesMP(){
  document.getElementById('kpi-drill-titre').textContent = '⚠ Alertes stock MP';
  const {data:S} = await SB.from('gp_stock_mp').select('*').eq('admin_id',GP_ADMIN_ID);
  const stock = S||[];
  const niveaux = (typeof calcNiveaux==='function')?calcNiveaux(stock):{};
  const ingrs = (typeof GP_INGREDIENTS!=='undefined')?GP_INGREDIENTS:[];
  const alertes = Object.entries(niveaux).map(([nom,n])=>{
    const ingr = ingrs.find(i=>i.nom===nom);
    const seuil = ingr?.seuil_alerte || 200;
    return { nom, stock_actuel: n, seuil, manque: Math.max(0, seuil-n), prix: Number(ingr?.prix_actuel||0) };
  }).filter(a=>a.stock_actuel < a.seuil).sort((a,b)=>a.stock_actuel-b.stock_actuel);
  const valeurManque = alertes.reduce((s,a)=>s+a.manque*a.prix,0);
  document.getElementById('kpi-drill-summary').innerHTML =
    `<div style="display:flex;justify-content:space-between;align-items:center;padding:10px;background:rgba(239,68,68,.08);border-radius:8px"><span>${alertes.length} MP sous seuil critique</span><b style="font-size:14px;color:var(--gold)">≈ ${fmt(valeurManque)} F à réapprovisionner</b></div>`;
  _renderKpiTable([
    {label:'Matière première',key:'nom'},
    {label:'Stock actuel (kg)',align:'num',render:r=>`<span style="color:var(--red);font-weight:700">${fmt(r.stock_actuel)}</span>`},
    {label:'Seuil',align:'num',render:r=>fmt(r.seuil)},
    {label:'Manque',align:'num',render:r=>fmt(r.manque)+' kg'},
    {label:'Valeur (F)',align:'num',render:r=>fmt(r.manque*r.prix)}
  ], alertes, 'VALEUR TOTALE À RÉAPPRO.', fmt(valeurManque)+' F');
  document.getElementById('kpi-drill-actions').innerHTML =
    `<button class="btn btn-out btn-sm" onclick="document.getElementById('modal-kpi-drill').style.display='none';showGP('stock')">🔗 Stock MP</button>
     <button class="btn btn-out btn-sm" onclick="document.getElementById('modal-kpi-drill').style.display='none';showGP('achats')">🔗 Achats MP</button>`;
}

// Helper : filtrer les périodes (mois courant)
function _moisRangeCe(){
  const m = thisMonth(); // "2026-06"
  return {debut: m+'-01', fin: _finMoisDrill(m), label:'mois courant ('+m+')'};
}
function _finMoisDrill(m){
  const [y, mo] = m.split('-').map(Number);
  const lastDay = new Date(y, mo, 0).getDate();
  return `${y}-${String(mo).padStart(2,'0')}-${String(lastDay).padStart(2,'0')}`;
}

// Helper : rendre le tableau (générique)
function _renderKpiTable(columns, rows, totalLabel, totalValue){
  let html = `<table class="tbl" style="font-size:11px;width:100%">
    <thead><tr>${columns.map(c=>`<th class="${c.align==='num'?'num':''}">${c.label}</th>`).join('')}</tr></thead>
    <tbody id="kpi-drill-tbody">
    ${rows.map(r=>`<tr>${columns.map(c=>`<td class="${c.align==='num'?'num':''}" style="${c.style||''}">${c.render?c.render(r):r[c.key]||'—'}</td>`).join('')}</tr>`).join('')}
    </tbody>
    ${totalLabel?`<tfoot><tr style="font-weight:700;background:rgba(232,197,71,.08)"><td colspan="${columns.length-1}">${totalLabel}</td><td class="num" style="color:var(--gold)">${totalValue}</td></tr></tfoot>`:''}
  </table>`;
  document.getElementById('kpi-drill-content').innerHTML = html;
}

// Filtre la table (recherche)
function filtrerKpiDrillTable(){
  const q = document.getElementById('kpi-drill-search').value.toLowerCase().trim();
  const tbody = document.getElementById('kpi-drill-tbody');
  if(!tbody) return;
  Array.from(tbody.querySelectorAll('tr')).forEach(tr=>{
    const txt = tr.textContent.toLowerCase();
    tr.style.display = (!q || txt.includes(q)) ? '' : 'none';
  });
}

// ── 1. CA (Ventes du mois) ─────────────────────────
async function drillCA(){
  const {debut, fin} = _moisRangeCe();
  const{data:V}=await SB.from('gp_ventes').select('*')
    .eq('admin_id',GP_ADMIN_ID).is('deleted_at',null).gte('date',debut).lte('date',fin)
    .order('date',{ascending:false});
  const ventes = V||[];
  const total = ventes.reduce((s,v)=>s+Number(v.montant_total||0),0);

  document.getElementById('kpi-drill-titre').textContent = `💰 CA Provenderie — ${ventes.length} ventes`;
  document.getElementById('kpi-drill-summary').innerHTML =
    `<b style="color:var(--gold);font-size:18px">${fmt(total)} F</b> de chiffre d'affaires sur le mois courant`;

  const cols = [
    {key:'date', label:'Date'},
    {key:'client_nom', label:'Client'},
    {key:'formule_nom', label:'Produits', render:r=>r.formule_nom||'—'},
    {key:'montant_total', label:'Total', align:'num', style:'color:var(--gold);font-weight:700', render:r=>fmt(r.montant_total||0)+' F'},
    {key:'statut_paiement', label:'Statut', render:r=>`<span class="badge ${r.statut_paiement==='paye'?'bdg-g':r.statut_paiement==='partiel'?'bdg-gold':'bdg-r'}" style="font-size:9px">${r.statut_paiement||'—'}</span>`}
  ];
  _renderKpiTable(cols, ventes, `TOTAL — ${ventes.length} ventes`, fmt(total)+' F');
  _renderKpiFooter('Voir la page Ventes complète', "showGP('ventes');fermerKpiDrill();");

  window._kpiDrillData = { type:'ca', titre:'CA Provenderie', rows:ventes, columns:cols, total };
}

// ── 2. ENCAISSÉ (paiements reçus) ──────────────────
async function drillEncaisse(){
  const {debut, fin} = _moisRangeCe();
  const{data:V}=await SB.from('gp_ventes').select('*')
    .eq('admin_id',GP_ADMIN_ID).is('deleted_at',null).gte('date',debut).lte('date',fin)
    .gt('montant_paye',0).order('date',{ascending:false});
  const ventes = V||[];
  const total = ventes.reduce((s,v)=>s+Number(v.montant_paye||0),0);

  document.getElementById('kpi-drill-titre').textContent = `✓ Encaissé — ${ventes.length} paiements`;
  document.getElementById('kpi-drill-summary').innerHTML =
    `<b style="color:var(--green);font-size:18px">${fmt(total)} F</b> réellement encaissé sur le mois`;

  const cols = [
    {key:'date', label:'Date'},
    {key:'client_nom', label:'Client'},
    {key:'montant_total', label:'Total vente', align:'num', render:r=>fmt(r.montant_total||0)+' F'},
    {key:'montant_paye', label:'Payé', align:'num', style:'color:var(--green);font-weight:700', render:r=>fmt(r.montant_paye||0)+' F'},
    {key:'statut_paiement', label:'Statut', render:r=>`<span class="badge ${r.statut_paiement==='paye'?'bdg-g':'bdg-gold'}" style="font-size:9px">${r.statut_paiement||'—'}</span>`}
  ];
  _renderKpiTable(cols, ventes, `TOTAL ENCAISSÉ`, fmt(total)+' F');
  _renderKpiFooter('Voir la page Caisse', "showGP('caisse');fermerKpiDrill();");

  window._kpiDrillData = { type:'encaisse', titre:'Encaissé Provenderie', rows:ventes, columns:cols, total };
}

// ── 3. IMPAYÉS (dettes clients) ────────────────────
async function drillImpayes(){
  const {debut, fin} = _moisRangeCe();
  const{data:V}=await SB.from('gp_ventes').select('*')
    .eq('admin_id',GP_ADMIN_ID).is('deleted_at',null).gte('date',debut).lte('date',fin)
    .in('statut_paiement',['partiel','impaye']).order('date',{ascending:false});
  const ventes = (V||[]).map(v=>{
    v._reste = Math.max(0, Number(v.montant_total||0) - Number(v.montant_paye||0));
    return v;
  }).filter(v=>v._reste > 0);
  const total = ventes.reduce((s,v)=>s+v._reste,0);

  document.getElementById('kpi-drill-titre').textContent = `⚠ Impayés — ${ventes.length} dettes à relancer`;
  document.getElementById('kpi-drill-summary').innerHTML =
    `<b style="color:var(--red);font-size:18px">${fmt(total)} F</b> à recouvrer sur le mois`;

  // Action : Relancer tous par WhatsApp
  document.getElementById('kpi-drill-actions').innerHTML =
    `<button class="btn btn-g" onclick="relancerTousImpayes()" style="background:#25D366;color:#FFF;border:none">
      📞 Relancer tous par WhatsApp (${ventes.length})
    </button>`;

  // Récup numéros clients : par client_id OU par nom normalisé (accents/ponctuation/casse ignorés),
  // avec repli sur un éventuel numéro stocké sur la vente elle-même.
  const _norm = s => String(s||'').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[^a-z0-9]/g,'');
  const idMap={}, nameMap={};
  try{
    const{data:cli}=await SB.from('gp_clients').select('id,nom,telephone,whatsapp').eq('admin_id',GP_ADMIN_ID);
    (cli||[]).forEach(c=>{ idMap[c.id]=c; const k=_norm(c.nom); if(k && (c.telephone||c.whatsapp)) nameMap[k]=c; });
  }catch(e){}
  const _resolveCli=(r)=> idMap[r.client_id] || nameMap[_norm(r.client_nom)] || null;
  ventes.forEach(v=>{
    const c=_resolveCli(v);
    v._tel=(c?(c.whatsapp||c.telephone):'') || v.telephone || v.client_tel || v.tel || v.whatsapp || '';
    v._cnom=c?.nom||v.client_nom||'';
  });

  const cols = [
    {key:'date', label:'Date'},
    {key:'client_nom', label:'Client', render:r=>
      `<div style="font-weight:600">${r.client_nom||'—'}</div><div style="font-size:9px;color:var(--textm)">${r._tel||'(sans tél)'}</div>`},
    {key:'montant_total', label:'Total', align:'num', render:r=>fmt(r.montant_total||0)+' F'},
    {key:'montant_paye', label:'Payé', align:'num', style:'color:var(--green)', render:r=>fmt(r.montant_paye||0)+' F'},
    {key:'_reste', label:'Reste dû', align:'num', style:'color:var(--red);font-weight:700', render:r=>fmt(r._reste||0)+' F'},
    {key:'_action', label:'', render:r=>
      r._tel ? `<button class="btn btn-g btn-sm" style="background:#25D366;color:#fff;border:none;padding:4px 8px" onclick="relancerImpayeWA('${r.id}')">📞</button>` : ''}
  ];
  _renderKpiTable(cols, ventes, `TOTAL DÛ`, fmt(total)+' F');
  _renderKpiFooter('Voir Suivi & Appels', "showGP('suivi');fermerKpiDrill();");

  window._kpiDrillData = { type:'impayes', titre:'Impayés du mois', rows:ventes, columns:cols, total };
}

// Relancer UN impayé par WhatsApp (pop-up wa.me avec message) — tél résolu par id OU nom
function relancerImpayeWA(venteId){
  const r = (window._kpiDrillData?.rows||[]).find(x=>String(x.id)===String(venteId));
  if(!r){ notify('Vente introuvable','r'); return; }
  const tel = (r._tel||'').replace(/[^0-9]/g,'');
  if(!tel){ notify('Pas de téléphone pour '+(r._cnom||r.client_nom||'ce client'),'r'); return; }
  const prov = GP_CONFIG?.nom_provenderie || 'SADARI';
  const msg = `🌾 Bonjour ${r._cnom||r.client_nom||''},\n\n` +
              `Petit rappel amical : il vous reste *${fmt(r._reste)} F* à régler chez ${prov} sur votre achat récent.\n\n` +
              `Quand pouvez-vous passer pour le règlement ? Merci 🙏`;
  const p = (typeof detecterPays==='function')?detecterPays(tel):{numero_whatsapp:tel};
  window.open('https://wa.me/'+p.numero_whatsapp+'?text='+encodeURIComponent(msg), '_blank');
}

// Relancer TOUS les impayés visibles dans la table (ouvre 1 onglet WA par client)
async function relancerTousImpayes(){
  const rows = (window._kpiDrillData?.rows)||[];
  const avecTel = rows.filter(r=>r._tel);
  if(!avecTel.length){ notify('Aucun client avec téléphone trouvé','r'); return; }
  if(!confirm(`Ouvrir ${avecTel.length} fenêtre(s) WhatsApp ?\n(une par client à relancer)`)) return;
  for(const r of avecTel){
    relancerImpayeWA(r.id);
    await new Promise(res=>setTimeout(res, 300)); // espacer pour éviter le blocage navigateur
  }
}

// ── 4. DÉPENSES ────────────────────────────────────
async function drillDepenses(){
  const {debut, fin} = _moisRangeCe();
  const{data:D}=await SB.from('gp_depenses').select('*')
    .eq('admin_id',GP_ADMIN_ID).gte('date',debut).lte('date',fin)
    .order('date',{ascending:false});
  const dep = D||[];
  const total = dep.reduce((s,d)=>s+Number(d.montant||0),0);

  document.getElementById('kpi-drill-titre').textContent = `💸 Dépenses — ${dep.length} entrées`;
  document.getElementById('kpi-drill-summary').innerHTML =
    `<b style="color:var(--red);font-size:18px">${fmt(total)} F</b> de dépenses sur le mois`;

  const cols = [
    {key:'date', label:'Date'},
    {key:'categorie', label:'Catégorie', render:r=>`<span class="badge bdg-gold" style="font-size:9px">${r.categorie||'—'}</span>`},
    {key:'description', label:'Description'},
    {key:'beneficiaire', label:'Bénéficiaire'},
    {key:'montant', label:'Montant', align:'num', style:'color:var(--red);font-weight:700', render:r=>fmt(r.montant||0)+' F'}
  ];
  _renderKpiTable(cols, dep, `TOTAL DÉPENSES`, fmt(total)+' F');
  _renderKpiFooter('Voir la page Dépenses', "showGP('depenses');fermerKpiDrill();");

  window._kpiDrillData = { type:'depenses', titre:'Dépenses du mois', rows:dep, columns:cols, total };
}

// ── 5. LOTS PRODUITS ───────────────────────────────
async function drillLots(){
  const {debut, fin} = _moisRangeCe();
  const{data:L}=await SB.from('gp_lots').select('*')
    .eq('admin_id',GP_ADMIN_ID).gte('date',debut).lte('date',fin)
    .order('date',{ascending:false});
  const lots = L||[];
  const totalKg = lots.reduce((s,l)=>s+Number(l.qte_produite||0),0);
  const totalSacs = lots.reduce((s,l)=>s+Number(l.nb_sacs||0),0);

  document.getElementById('kpi-drill-titre').textContent = `📦 Production — ${lots.length} lots`;
  document.getElementById('kpi-drill-summary').innerHTML =
    `<b style="color:var(--g6);font-size:18px">${fmt(totalKg)} kg</b> produits · ${totalSacs} sacs · sur le mois`;

  const cols = [
    {key:'date', label:'Date'},
    {key:'ref', label:'Réf'},
    {key:'formule_nom', label:'Formule'},
    {key:'qte_produite', label:'Qté (kg)', align:'num', style:'color:var(--g6);font-weight:700', render:r=>fmt(r.qte_produite||0)},
    {key:'nb_sacs', label:'Sacs', align:'num', render:r=>`${r.nb_sacs||0}${r.poids_sac?` × ${r.poids_sac}kg`:''}`},
    {key:'cout_total', label:'Coût', align:'num', render:r=>fmt(r.cout_total||0)+' F'}
  ];
  _renderKpiTable(cols, lots, `TOTAL — ${lots.length} lots`, fmt(totalKg)+' kg');
  _renderKpiFooter('Voir la page Production', "showGP('production');fermerKpiDrill();");

  window._kpiDrillData = { type:'lots', titre:'Production du mois', rows:lots, columns:cols, total:totalKg };
}

// ── 6. CA FERME (bonus) ────────────────────────────
async function drillCAFerme(){
  const {debut, fin} = _moisRangeCe();
  const{data:V}=await SB.from('gp_ventes').select('*')
    .eq('admin_id',GP_ADMIN_ID).is('deleted_at',null).gte('date',debut).lte('date',fin);
  // Filtrer ventes ferme uniquement (espèce non-provenderie)
  const ESPECES_FERME = ['lapin','oeuf','poulet','autre'];
  const ventes = (V||[]).filter(v => {
    const s = String(v.formule_nom||'').toLowerCase();
    return ESPECES_FERME.some(e=>s.includes(e));
  });
  const total = ventes.reduce((s,v)=>s+Number(v.montant_total||0),0);
  document.getElementById('kpi-drill-titre').textContent = `🚜 CA Ferme — ${ventes.length} ventes`;
  document.getElementById('kpi-drill-summary').innerHTML =
    `<b style="color:#3b82f6;font-size:18px">${fmt(total)} F</b> de ventes ferme sur le mois`;
  const cols = [
    {key:'date', label:'Date'},
    {key:'client_nom', label:'Client'},
    {key:'formule_nom', label:'Produit'},
    {key:'montant_total', label:'Montant', align:'num', render:r=>fmt(r.montant_total||0)+' F'}
  ];
  _renderKpiTable(cols, ventes, `TOTAL CA FERME`, fmt(total)+' F');
  _renderKpiFooter('Voir la page Ventes', "showGP('ventes');fermerKpiDrill();");
  window._kpiDrillData = { type:'ca_ferme', titre:'CA Ferme', rows:ventes, columns:cols, total };
}

// ── FOOTER avec lien vers la page complète ──────────
function _renderKpiFooter(linkText, onClick){
  document.getElementById('kpi-drill-footer').innerHTML = `
    <span style="font-size:11px;color:var(--textm)">📅 Mois courant — pour autres mois, va sur la page complète.</span>
    <button class="btn btn-out btn-sm" onclick="${onClick}">🔗 ${linkText} →</button>
  `;
}

// ── EXPORT PDF ──────────────────────────────────────
async function exportKpiDrillPDF(){
  if(typeof window.jspdf === 'undefined'){ notify('Lib PDF pas chargée — réessaie dans 2s','r'); return; }
  const { jsPDF } = window.jspdf;
  const D = window._kpiDrillData;
  if(!D?.rows?.length){ notify('Rien à exporter','r'); return; }
  const doc = new jsPDF({orientation:'landscape', unit:'mm', format:'a4'});
  const nomProv = GP_CONFIG?.nom_provenderie || 'SADARI';
  doc.setFontSize(14); doc.setFont('helvetica','bold'); doc.text(nomProv, 14, 16);
  doc.setFontSize(11); doc.setTextColor(22,163,74); doc.text(D.titre, 14, 25);
  doc.setTextColor(0); doc.setFontSize(9);
  doc.text(`${D.rows.length} entrées — Total : ${fmt(D.total)}`, 14, 32);

  // Extraire texte propre pour les cellules
  const stripHtml = (s)=>String(s||'').replace(/<[^>]*>/g,'').replace(/\s+/g,' ').trim();
  doc.autoTable({
    startY: 38,
    head: [D.columns.filter(c=>c.key!=='_action').map(c=>c.label)],
    body: D.rows.map(r=>D.columns.filter(c=>c.key!=='_action').map(c=>{
      const v = c.render ? c.render(r) : r[c.key];
      return stripHtml(v);
    })),
    styles: { fontSize: 8 },
    headStyles: { fillColor: [22,163,74], textColor: 255 }
  });
  doc.save(`${D.type}_${thisMonth()}.pdf`);
  notify('PDF téléchargé ✓','gold');
}

// ── EXPORT EXCEL ────────────────────────────────────
async function exportKpiDrillExcel(){
  if(typeof XLSX === 'undefined'){ notify('Lib Excel pas chargée — réessaie dans 2s','r'); return; }
  const D = window._kpiDrillData;
  if(!D?.rows?.length){ notify('Rien à exporter','r'); return; }
  const stripHtml = (s)=>String(s||'').replace(/<[^>]*>/g,'').replace(/\s+/g,' ').trim();
  const rows = D.rows.map(r => {
    const o = {};
    D.columns.filter(c=>c.key!=='_action').forEach(c=>{
      const v = c.render ? c.render(r) : r[c.key];
      o[c.label] = stripHtml(v);
    });
    return o;
  });
  const ws = XLSX.utils.json_to_sheet(rows);
  const cols = Object.keys(rows[0]||{}).map(k=>({wch: Math.max(k.length+2, 14)}));
  ws['!cols'] = cols;
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, D.titre.slice(0,30));
  XLSX.writeFile(wb, `${D.type}_${thisMonth()}.xlsx`);
  notify('Excel téléchargé ✓','gold');
}
