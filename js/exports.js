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

// Word : document HTML téléchargé en .doc (Word ouvre parfaitement le HTML). Aucune librairie requise.
function _gpHtmlEsc(s){ return _gpStrip(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
function gpExportWord(titre, columns, rows, filename, sousTitre){
  if(!rows||!rows.length){ notify('Rien à exporter','r'); return; }
  const prov=(typeof GP_CONFIG!=='undefined' && GP_CONFIG && GP_CONFIG.nom_provenderie) || 'SADARI';
  const th=columns.map(c=>`<th style="background:#16A34A;color:#fff;border:1px solid #999;padding:5px;font-size:11px;text-align:left">${_gpHtmlEsc(c.label)}</th>`).join('');
  const trs=rows.map(r=>'<tr>'+columns.map(c=>`<td style="border:1px solid #ccc;padding:4px;font-size:10px">${_gpHtmlEsc(c.render?c.render(r):r[c.key])}</td>`).join('')+'</tr>').join('');
  const html=`<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">
    <head><meta charset="utf-8"><title>${_gpHtmlEsc(titre)}</title></head>
    <body style="font-family:Calibri,Arial,sans-serif">
      <h2 style="margin:0">${_gpHtmlEsc(prov)}</h2>
      <h3 style="color:#16A34A;margin:4px 0">${_gpHtmlEsc(titre)}</h3>
      ${sousTitre?`<p style="color:#555;font-size:11px;margin:0 0 8px">${_gpHtmlEsc(sousTitre)}</p>`:''}
      <table style="border-collapse:collapse;width:100%"><thead><tr>${th}</tr></thead><tbody>${trs}</tbody></table>
    </body></html>`;
  const blob=new Blob(['﻿'+html], {type:'application/msword'});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');
  a.href=url; a.download=filename; document.body.appendChild(a); a.click();
  setTimeout(()=>{ document.body.removeChild(a); URL.revokeObjectURL(url); }, 500);
  notify('Word téléchargé ✓','gold');
}

// PDF à partir d'un TEXTE libre (ex. fiche technique), avec en-tête provenderie.
function gpExportTextePDF(titre, texte, filename, sousTitre){
  if(typeof window.jspdf==='undefined'){ notify('Lib PDF pas encore chargée — réessaie dans 2s','r'); return; }
  const t=String(texte||'').trim();
  if(!t){ notify('Rien à exporter','r'); return; }
  const { jsPDF }=window.jspdf;
  const doc=new jsPDF({unit:'mm', format:'a4'});
  const prov=(typeof GP_CONFIG!=='undefined' && GP_CONFIG && GP_CONFIG.nom_provenderie) || 'SADARI';
  const W=doc.internal.pageSize.getWidth(), H=doc.internal.pageSize.getHeight();
  const M=16; let y=18;
  doc.setFontSize(15); doc.setFont('helvetica','bold'); doc.setTextColor(0); doc.text(prov, M, y); y+=8;
  doc.setFontSize(12); doc.setTextColor(22,163,74); doc.text(_gpStrip(titre), M, y); y+=7;
  if(sousTitre){ doc.setTextColor(90); doc.setFontSize(9); doc.text(_gpStrip(sousTitre), M, y); y+=6; }
  doc.setDrawColor(220); doc.line(M, y, W-M, y); y+=6;
  doc.setTextColor(20); doc.setFontSize(10); doc.setFont('helvetica','normal');
  const lines=doc.splitTextToSize(t, W-2*M);
  const lh=5.3;
  lines.forEach(ln=>{
    if(y > H-16){ doc.addPage(); y=18; }
    doc.text(ln, M, y); y+=lh;
  });
  doc.setFontSize(8); doc.setTextColor(120);
  doc.text('Généré par '+prov, M, H-10);
  doc.save(filename);
  notify('PDF téléchargé ✓','gold');
}

// PDF d'une fiche en Markdown léger (texte + tableaux |...| rendus en vrais tableaux).
function gpExportFichePDF(titre, md, filename, sousTitre){
  if(typeof window.jspdf==='undefined'){ notify('Lib PDF pas encore chargée — réessaie dans 2s','r'); return; }
  const t=String(md||'').trim();
  if(!t){ notify('Rien à exporter','r'); return; }
  const { jsPDF }=window.jspdf;
  const doc=new jsPDF({unit:'mm', format:'a4'});
  const prov=(typeof GP_CONFIG!=='undefined' && GP_CONFIG && GP_CONFIG.nom_provenderie) || 'SADARI';
  const W=doc.internal.pageSize.getWidth(), H=doc.internal.pageSize.getHeight();
  const M=16; let y=18;
  doc.setFontSize(15); doc.setFont('helvetica','bold'); doc.setTextColor(0); doc.text(prov, M, y); y+=8;
  doc.setFontSize(12); doc.setTextColor(22,163,74); doc.text(_gpStrip(titre), M, y); y+=7;
  if(sousTitre){ doc.setTextColor(90); doc.setFontSize(9); doc.text(_gpStrip(sousTitre), M, y); y+=6; }
  doc.setDrawColor(220); doc.line(M, y, W-M, y); y+=6;

  const _md=s=>String(s||'').replace(/\*\*(.+?)\*\*/g,'$1').replace(/`/g,''); // enlever le gras markdown pour le PDF
  const isRow=l=>/^\s*\|.*\|\s*$/.test(l), isSep=l=>/^\s*\|[\s:|-]+\|\s*$/.test(l);
  const cells=l=>l.trim().replace(/^\|/,'').replace(/\|$/,'').split('|').map(c=>_md(c.trim()));
  const flush=buf=>{
    if(!buf.length) return;
    doc.setTextColor(20); doc.setFontSize(10); doc.setFont('helvetica','normal');
    const wrapped=doc.splitTextToSize(_md(buf.join('\n')), W-2*M);
    wrapped.forEach(ln=>{ if(y>H-16){ doc.addPage(); y=18; } doc.text(ln, M, y); y+=5.3; });
  };
  const lines=t.split(/\r?\n/); let buf=[], i=0;
  while(i<lines.length){
    if(isRow(lines[i])){
      flush(buf); buf=[];
      const block=[]; while(i<lines.length && isRow(lines[i])){ block.push(lines[i]); i++; }
      const rows=block.filter(x=>!isSep(x)).map(cells).filter(r=>r.length);
      if(rows.length && typeof doc.autoTable==='function'){
        doc.autoTable({ startY:y+1, head:[rows[0]], body:rows.slice(1),
          styles:{fontSize:9}, headStyles:{fillColor:[22,163,74],textColor:255}, margin:{left:M,right:M} });
        y=(doc.lastAutoTable?doc.lastAutoTable.finalY:y)+4;
      } else if(rows.length){ flush(rows.map(r=>r.join(' — '))); }
      continue;
    }
    buf.push(lines[i]); i++;
  }
  flush(buf);
  doc.setFontSize(8); doc.setTextColor(120); doc.text('Généré par '+prov, M, H-10);
  doc.save(filename);
  notify('PDF téléchargé ✓','gold');
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
