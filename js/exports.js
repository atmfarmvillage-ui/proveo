// ══════════════════════════════════════════════════
// PROVENDA — EXPORTS PDF / EXCEL (génériques)
// Utilise jsPDF + autoTable + XLSX (déjà chargés dans index.html)
// columns = [{label, key}] ou [{label, render:(row)=>val}]
// ══════════════════════════════════════════════════

function _gpStrip(s){ return String(s==null?'':s).replace(/<[^>]*>/g,'').replace(/\s+/g,' ').trim(); }

function gpExportExcel(titre, columns, rows, filename){
  if(typeof XLSX==='undefined'){ notify('Lib Excel pas encore chargée — réessaie dans 2s','r'); return; }
  if(!rows||!rows.length){ notify('Rien à exporter','r'); return; }
  const data=rows.map(r=>{ const o={}; columns.forEach(c=>{ o[c.label]=_gpStrip(c.render?c.render(r):r[c.key]); }); return o; });
  const ws=XLSX.utils.json_to_sheet(data);
  ws['!cols']=columns.map(c=>({wch:Math.max(String(c.label).length+2,14)}));
  const wb=XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, (_gpStrip(titre).slice(0,30))||'Export');
  XLSX.writeFile(wb, filename);
  notify('Excel téléchargé ✓','gold');
}

function gpExportPDF(titre, columns, rows, filename, sousTitre){
  if(typeof window.jspdf==='undefined'){ notify('Lib PDF pas encore chargée — réessaie dans 2s','r'); return; }
  if(!rows||!rows.length){ notify('Rien à exporter','r'); return; }
  const { jsPDF }=window.jspdf;
  const doc=new jsPDF({orientation:'landscape', unit:'mm', format:'a4'});
  const prov=(typeof GP_CONFIG!=='undefined' && GP_CONFIG && GP_CONFIG.nom_provenderie) || 'SADARI';
  doc.setFontSize(14); doc.setFont('helvetica','bold'); doc.text(prov, 14, 15);
  doc.setFontSize(11); doc.setTextColor(22,163,74); doc.text(_gpStrip(titre), 14, 23);
  if(sousTitre){ doc.setTextColor(90); doc.setFontSize(9); doc.text(_gpStrip(sousTitre), 14, 29); }
  doc.setTextColor(0);
  doc.autoTable({
    startY: sousTitre?34:30,
    head:[columns.map(c=>c.label)],
    body:rows.map(r=>columns.map(c=>_gpStrip(c.render?c.render(r):r[c.key]))),
    styles:{fontSize:8}, headStyles:{fillColor:[22,163,74],textColor:255}
  });
  doc.save(filename);
  notify('PDF téléchargé ✓','gold');
}

// ── COMPARATIF PDV ────────────────────────────────
function exportComparatif(type){
  const E=window._compExport;
  if(!E||!E.lignes?.length){ notify('Ouvre le Comparatif PDV d\'abord','r'); return; }
  const cols=[
    {label:'Point de vente',key:'nom'},
    {label:'Ventes (CA)',render:r=>fmt(r.ca)},
    {label:'Encaissé',render:r=>fmt(r.enc)},
    {label:'Dépenses',render:r=>fmt(r.dep)},
    {label:'Résultat',render:r=>fmt(r.enc-r.dep)},
    {label:'Nb ventes',key:'nb'},
    {label:'Alertes stock',key:'alertes'}
  ];
  const rows=E.lignes.map(([nom,o])=>({nom, ...o}));
  const fn=`comparatif_pdv_${E.mois}`;
  if(type==='pdf') gpExportPDF('Comparatif PDV', cols, rows, fn+'.pdf', 'Période '+E.mois);
  else gpExportExcel('Comparatif PDV', cols, rows, fn+'.xlsx');
}

// ── BILAN CONSOLIDÉ RÉSEAU ────────────────────────
function exportBilanReseau(type){
  const E=window._bilanReseau;
  if(!E||!E.rows?.length){ notify('Ouvre le Comparatif PDV d\'abord','r'); return; }
  const cols=[{label:'Poste',key:'poste'},{label:'Montant (F)',render:r=>fmt(r.montant)}];
  const fn=`bilan_reseau_${E.mois}`;
  if(type==='pdf') gpExportPDF('Bilan consolidé réseau', cols, E.rows, fn+'.pdf', 'Période '+E.mois+' · Marge nette '+E.margePct+'%');
  else gpExportExcel('Bilan réseau', cols, E.rows, fn+'.xlsx');
}

// ── VENTES ────────────────────────────────────────
function exportVentes(type){
  const E=window._ventesExport;
  if(!E||!E.rows?.length){ notify('Aucune vente à exporter','r'); return; }
  const cols=[
    {label:'Date',key:'date'},
    {label:'Client',key:'client_nom'},
    {label:'Téléphone',key:'client_tel'},
    {label:'PDV',render:r=>r.point_vente||'Production'},
    {label:'Produit',key:'formule_nom'},
    {label:'Qté (kg)',key:'qte_vendue'},
    {label:'Total',render:r=>fmt(r.montant_total)},
    {label:'Payé',render:r=>fmt(r.montant_paye)},
    {label:'Statut',key:'statut_paiement'}
  ];
  const fn=`ventes_${(E.pdv||'tous')}_${today()}`;
  if(type==='pdf') gpExportPDF('Ventes — '+(E.label||''), cols, E.rows, fn+'.pdf', (E.pdv||'Tous PDV'));
  else gpExportExcel('Ventes', cols, E.rows, fn+'.xlsx');
}

// ── DÉPENSES ──────────────────────────────────────
function exportDepenses(type){
  const E=window._depExport;
  if(!E||!E.rows?.length){ notify('Aucune dépense à exporter','r'); return; }
  const cols=[
    {label:'Date',key:'date'},
    {label:'Catégorie',key:'categorie'},
    {label:'Description',key:'description'},
    {label:'Bénéficiaire',key:'beneficiaire'},
    {label:'PDV',render:r=>r.point_vente||'Production'},
    {label:'Montant',render:r=>fmt(r.montant)}
  ];
  const fn=`depenses_${(E.pdv||'tous')}_${E.mois||today()}`;
  const st=`${E.pdv||'Tous PDV'} · ${E.mois||''} · Total ${fmt(E.total||0)} F`;
  if(type==='pdf') gpExportPDF('Dépenses', cols, E.rows, fn+'.pdf', st);
  else gpExportExcel('Dépenses', cols, E.rows, fn+'.xlsx');
}
