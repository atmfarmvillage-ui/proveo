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
    default: document.getElementById('kpi-drill-content').innerHTML = '<div>Type inconnu : '+type+'</div>';
  }
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

  // Récup numéros clients
  const ids = [...new Set(ventes.map(v=>v.client_id).filter(Boolean))];
  let clientsMap = {};
  if(ids.length){
    const{data:cli}=await SB.from('gp_clients').select('id,nom,telephone,whatsapp').in('id',ids);
    (cli||[]).forEach(c=>{clientsMap[c.id]=c;});
  }
  window._kpiDrillClientsMap = clientsMap;

  const cols = [
    {key:'date', label:'Date'},
    {key:'client_nom', label:'Client', render:r=>{
      const tel = clientsMap[r.client_id]?.whatsapp || clientsMap[r.client_id]?.telephone || '';
      return `<div style="font-weight:600">${r.client_nom||'—'}</div><div style="font-size:9px;color:var(--textm)">${tel||'(sans tél)'}</div>`;
    }},
    {key:'montant_total', label:'Total', align:'num', render:r=>fmt(r.montant_total||0)+' F'},
    {key:'montant_paye', label:'Payé', align:'num', style:'color:var(--green)', render:r=>fmt(r.montant_paye||0)+' F'},
    {key:'_reste', label:'Reste dû', align:'num', style:'color:var(--red);font-weight:700', render:r=>fmt(r._reste||0)+' F'},
    {key:'_action', label:'', render:r=>{
      const tel = clientsMap[r.client_id]?.whatsapp || clientsMap[r.client_id]?.telephone || '';
      return tel ? `<button class="btn btn-g btn-sm" style="background:#25D366;color:#fff;border:none;padding:4px 8px" onclick="relancerImpayeWA('${r.id}','${r.client_id||''}','${r._reste}')">📞</button>` : '';
    }}
  ];
  _renderKpiTable(cols, ventes, `TOTAL DÛ`, fmt(total)+' F');
  _renderKpiFooter('Voir Suivi & Appels', "showGP('suivi');fermerKpiDrill();");

  window._kpiDrillData = { type:'impayes', titre:'Impayés du mois', rows:ventes, columns:cols, total };
}

// Relancer UN impayé par WhatsApp (pop-up wa.me avec message)
function relancerImpayeWA(venteId, clientId, reste){
  const c = window._kpiDrillClientsMap?.[clientId];
  if(!c){ notify('Client introuvable','r'); return; }
  const tel = (c.whatsapp || c.telephone || '').replace(/[^0-9]/g,'');
  if(!tel){ notify('Pas de téléphone pour '+(c.nom||'ce client'),'r'); return; }
  const prov = GP_CONFIG?.nom_provenderie || 'SADARI';
  const msg = `🌾 Bonjour ${c.nom||''},\n\n` +
              `Petit rappel amical : il vous reste *${fmt(reste)} F* à régler chez ${prov} sur votre achat récent.\n\n` +
              `Quand pouvez-vous passer pour le règlement ? Merci 🙏`;
  const p = (typeof detecterPays==='function')?detecterPays(tel):{numero_whatsapp:tel};
  window.open('https://wa.me/'+p.numero_whatsapp+'?text='+encodeURIComponent(msg), '_blank');
}

// Relancer TOUS les impayés visibles dans la table (ouvre 1 onglet WA par client)
async function relancerTousImpayes(){
  const rows = (window._kpiDrillData?.rows)||[];
  const map = window._kpiDrillClientsMap||{};
  const avecTel = rows.filter(r=>{
    const c = map[r.client_id];
    return c && (c.whatsapp || c.telephone);
  });
  if(!avecTel.length){ notify('Aucun client avec téléphone trouvé','r'); return; }
  if(!confirm(`Ouvrir ${avecTel.length} fenêtres WhatsApp ?\n(une par client à relancer)`)) return;
  for(const r of avecTel){
    relancerImpayeWA(r.id, r.client_id, r._reste);
    await new Promise(res=>setTimeout(res, 300)); // espacer un peu pour pas que le navigateur bloque
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
