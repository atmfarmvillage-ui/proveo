// ══════════════════════════════════════════════════
// PROVENDA — MODULE IMPRESSION
// Reçu thermique 58mm + Étiquettes sac A4 (8/page)
// ══════════════════════════════════════════════════

// ── BASE DE DONNÉES NUTRITIONNELLE ─────────────────
const NUTRI_DB = {
  'mais':       {prot:8.5,  mg:3.8,  cb:2.2,  mm:1.3,  em:3300, ca:0.03, lys:0.24, met:0.18},
  'ble':        {prot:11.5, mg:1.8,  cb:2.8,  mm:1.8,  em:3070, ca:0.05, lys:0.33, met:0.21},
  'son de ble': {prot:15.0, mg:3.5,  cb:10.5, mm:5.5,  em:1630, ca:0.14, lys:0.60, met:0.24},
  'son de riz': {prot:12.0, mg:13.0, cb:12.0, mm:10.0, em:2800, ca:0.08, lys:0.45, met:0.20},
  'soja':       {prot:44.0, mg:1.8,  cb:6.5,  mm:6.5,  em:2240, ca:0.30, lys:2.80, met:0.62},
  'palmiste':   {prot:16.0, mg:7.5,  cb:17.0, mm:4.5,  em:1670, ca:0.29, lys:0.58, met:0.36},
  'poisson':    {prot:65.0, mg:9.5,  cb:0.5,  mm:18.0, em:2890, ca:5.50, lys:5.10, met:1.90},
  'premix':     {prot:0.0,  mg:0.0,  cb:0.0,  mm:60.0, em:0,    ca:20.0, lys:0.00, met:0.00},
  'coquilles':  {prot:0.0,  mg:0.0,  cb:0.0,  mm:97.0, em:0,    ca:38.0, lys:0.00, met:0.00},
  'huitres':    {prot:0.0,  mg:0.0,  cb:0.0,  mm:97.0, em:0,    ca:38.0, lys:0.00, met:0.00},
  'phosphate':  {prot:0.0,  mg:0.0,  cb:0.0,  mm:95.0, em:0,    ca:24.0, lys:0.00, met:0.00},
  'lysine':     {prot:95.0, mg:0.0,  cb:0.0,  mm:0.5,  em:3600, ca:0.00, lys:78.8, met:0.00},
  'methionine': {prot:58.0, mg:0.0,  cb:0.0,  mm:0.5,  em:3600, ca:0.00, lys:0.00, met:99.0},
  'threonine':  {prot:78.0, mg:0.0,  cb:0.0,  mm:0.5,  em:3600, ca:0.00, lys:0.00, met:0.00},
  'sel':        {prot:0.0,  mg:0.0,  cb:0.0,  mm:99.0, em:0,    ca:0.00, lys:0.00, met:0.00},
  'graisse':    {prot:0.0,  mg:99.0, cb:0.0,  mm:0.0,  em:8800, ca:0.00, lys:0.00, met:0.00},
  'huile':      {prot:0.0,  mg:99.0, cb:0.0,  mm:0.0,  em:8800, ca:0.00, lys:0.00, met:0.00},
  'foin':       {prot:18.0, mg:2.5,  cb:28.0, mm:8.0,  em:1400, ca:1.20, lys:0.70, met:0.25},
  'fecule':     {prot:1.0,  mg:0.5,  cb:0.5,  mm:0.5,  em:3500, ca:0.00, lys:0.00, met:0.00},
  'liant':      {prot:1.0,  mg:0.5,  cb:0.5,  mm:0.5,  em:3500, ca:0.00, lys:0.00, met:0.00},
  'blend':      {prot:0.0,  mg:0.0,  cb:5.0,  mm:5.0,  em:0,    ca:0.00, lys:0.00, met:0.00},
};

function normalise(s){
  return s.toLowerCase()
    .replace(/[àáâ]/g,'a').replace(/[éèêë]/g,'e')
    .replace(/[îï]/g,'i').replace(/[ôö]/g,'o').replace(/[ùûü]/g,'u')
    .replace(/'/g,' ').replace(/-/g,' ');
}

function findNutri(nom){
  const n = normalise(nom);
  for(const [key, val] of Object.entries(NUTRI_DB)){
    if(n.includes(key)) return val;
  }
  return {prot:0, mg:0, cb:0, mm:2, em:0, ca:0, lys:0, met:0};
}

function calcNutri(formule){
  let prot=0, mg=0, cb=0, mm=0, em=0, ca=0, lys=0, met=0;
  (formule.ingredients||[]).forEach(ing=>{
    const pct=ing.pct/100;
    const v=findNutri(ing.nom);
    prot+=pct*v.prot; mg+=pct*v.mg; cb+=pct*v.cb; mm+=pct*v.mm;
    em+=pct*v.em; ca+=pct*v.ca; lys+=pct*v.lys; met+=pct*v.met;
  });
  return{
    mm:mm.toFixed(2), prot:prot.toFixed(2), mg:mg.toFixed(2),
    cb:cb.toFixed(2), lys:lys.toFixed(2), met:met.toFixed(2),
    ca:ca.toFixed(2), em:Math.round(em)
  };
}

// ── REÇU THERMIQUE 58mm ────────────────────────────
function genNumRecu(){
  const d=new Date();
  return 'RC-'+d.getFullYear().toString().slice(2)+
    String(d.getMonth()+1).padStart(2,'0')+
    String(d.getDate()).padStart(2,'0')+'-'+
    String(Math.floor(Math.random()*9000)+1000);
}

function printRecu(vente){
  const cfg=GP_CONFIG||{};
  const num=genNumRecu();
  const now=new Date();
  const dateStr=now.toLocaleDateString('fr-FR',{day:'2-digit',month:'2-digit',year:'numeric'});
  const heureStr=now.toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'});
  const statut=vente.statut_paiement==='paye'?'PAYE':vente.statut_paiement==='partiel'?'PARTIEL':'CREDIT';
  const montantPaye=Number(vente.montant_paye||0);
  const reste=Number(vente.montant_total||0)-montantPaye;
  const logoHtml=cfg.logo_url
    ?('<img src="'+cfg.logo_url+'" style="width:60px;height:60px;object-fit:contain;margin-bottom:4px">')
    :'<div style="font-size:28px;margin-bottom:4px">&#127807;</div>';

  const html='<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Recu '+num+'</title>'
    +'<style>'
    +'@page{size:58mm auto;margin:2mm}'
    +'*{margin:0;padding:0;box-sizing:border-box}'
    +'body{font-family:"Courier New",monospace;font-size:11px;width:54mm;color:#000;background:#fff;padding:2mm}'
    +'.c{text-align:center}.b{font-weight:bold}'
    +'.l{border-top:1px dashed #000;margin:4px 0}'
    +'.r{display:flex;justify-content:space-between;margin:2px 0}'
    +'.t{font-size:13px;font-weight:bold;text-transform:uppercase;margin:3px 0}'
    +'.s{font-size:10px;color:#333}'
    +'.sp{background:#000;color:#fff;padding:2px 6px;font-weight:bold;font-size:12px}'
    +'.spar{border:1px solid #000;padding:2px 6px;font-weight:bold;font-size:12px}'
    +'.scr{background:#333;color:#fff;padding:2px 6px;font-weight:bold;font-size:12px}'
    +'.tot{font-size:14px;font-weight:bold;margin:4px 0}'
    +'@media print{body{width:54mm}button{display:none}}'
    +'</style></head><body>'
    +'<div class="c">'+logoHtml
    +'<div class="t">'+(cfg.nom_provenderie||'PROVENDERIE')+'</div>'
    +(cfg.telephone?'<div class="s">'+cfg.telephone+'</div>':'')
    +(cfg.localisation?'<div class="s">'+cfg.localisation+'</div>':'')
    +'</div>'
    +'<div class="l"></div>'
    +'<div class="c b" style="font-size:12px;letter-spacing:1px">RECU DE VENTE</div>'
    +'<div class="c s">'+num+'</div>'
    +'<div class="c s">'+dateStr+' a '+heureStr+'</div>'
    +'<div class="l"></div>'
    +'<div class="r"><span class="b">Client :</span><span>'+(vente.client_nom||'--')+'</span></div>'
    +(vente.client_tel?'<div class="r"><span>Tel :</span><span>'+vente.client_tel+'</span></div>':'')
    +'<div class="l"></div>'
    +'<div class="b" style="margin-bottom:3px">ALIMENT</div>'
    +'<div style="font-size:10px;margin-bottom:2px">'+(vente.formule_nom||'--')+'</div>'
    +'<div class="r"><span>Quantite :</span><span class="b">'+Number(vente.qte_vendue||0).toFixed(1)+' kg</span></div>'
    +'<div class="r"><span>Prix/kg :</span><span>'+fmt(vente.prix_unitaire)+' FCFA</span></div>'
    +(Number(vente.remise||0)>0?'<div class="r"><span>Remise :</span><span>- '+fmt(vente.remise)+' FCFA</span></div>':'')
    +'<div class="l"></div>'
    +'<div class="r tot"><span>TOTAL :</span><span>'+fmt(vente.montant_total)+' FCFA</span></div>'
    +(vente.statut_paiement!=='paye'?'<div class="r"><span>Paye :</span><span>'+fmt(montantPaye)+' FCFA</span></div><div class="r b"><span>Reste :</span><span>'+fmt(reste)+' FCFA</span></div>':'')
    +'<div class="l"></div>'
    +'<div class="c" style="margin:4px 0"><span class="'+(vente.statut_paiement==='paye'?'sp':vente.statut_paiement==='partiel'?'spar':'scr')+'">'+statut+'</span></div>'
    +'<div class="l"></div>'
    +'<div class="c" style="font-size:10px;font-style:italic">Merci pour votre confiance !</div>'
    +'<div style="height:10mm"></div>'
    +'<div class="c"><button onclick="window.print()" style="padding:6px 16px;font-size:12px;cursor:pointer;background:#000;color:#fff;border:none;border-radius:4px">Imprimer</button></div>'
    +'</body></html>';

  const w=window.open('','_blank','width=300,height=600');
  w.document.write(html);
  w.document.close();
  setTimeout(function(){w.print();},500);
}

// ── ÉTIQUETTES SAC A4 — 8 PAR PAGE ────────────────
function printFicheTechnique(formule){
  const cfg=GP_CONFIG||{};
  const nutri=calcNutri(formule);
  const now=new Date();
  const dateProd=now.toLocaleDateString('fr-FR',{day:'2-digit',month:'2-digit',year:'numeric'});
  const expDate=new Date(now);
  expDate.setDate(expDate.getDate()+90);
  const dateExp=expDate.toLocaleDateString('fr-FR',{day:'2-digit',month:'2-digit',year:'numeric'});
  const logoHtml=cfg.logo_url
    ?('<img src="'+cfg.logo_url+'" style="height:36px;object-fit:contain">')
    :'<span style="font-size:20px">&#127807;</span>';
  const emLabel=['lapin'].includes(formule.espece)?'ED Lapin (kcal/kg)'
    :['porc'].includes(formule.espece)?'ED Porc (kcal/kg)'
    :['tilapia','goliath'].includes(formule.espece)?'ED Poisson (kcal/kg)'
    :'EM Volaille (kcal/kg)';

  function lbl(){
    return '<div class="label">'
      +'<div class="lbl-h">'
        +'<div class="lbl-logo">'+logoHtml+'</div>'
        +'<div class="lbl-info">'
          +'<div class="lbl-prov">'+(cfg.nom_provenderie||'PROVENDERIE SADARI')+'</div>'
          +'<div class="lbl-nom">'+(formule.nom)+'</div>'
          +'<div class="lbl-stade">'+(formule.stade||'')+'</div>'
        +'</div>'
      +'</div>'
      +'<table class="nt">'
        +'<thead><tr><th>Composition</th><th>Apport</th><th></th></tr></thead>'
        +'<tbody>'
          +'<tr><td>Matiere Minerale</td><td>'+nutri.mm+'</td><td>%</td></tr>'
          +'<tr><td>Proteine brute</td><td>'+nutri.prot+'</td><td>%</td></tr>'
          +'<tr><td>Matiere grasse</td><td>'+nutri.mg+'</td><td>%</td></tr>'
          +'<tr><td>Cellulose Brute</td><td>'+nutri.cb+'</td><td>%</td></tr>'
          +'<tr><td>Lysine</td><td>'+nutri.lys+'</td><td>%</td></tr>'
          +'<tr><td>Methionine</td><td>'+nutri.met+'</td><td>%</td></tr>'
          +'<tr><td>Calcium</td><td>'+nutri.ca+'</td><td>%</td></tr>'
          +'<tr><td>'+emLabel+'</td><td>'+nutri.em+'</td><td></td></tr>'
        +'</tbody>'
      +'</table>'
      +'<div class="lbl-f">'
        +'<div class="lbl-d"><span>Date de production</span><span>'+dateProd+'</span></div>'
        +'<div class="lbl-d"><span>Date d expiration</span><span>'+dateExp+'</span></div>'
        +(cfg.telephone?'<div class="lbl-c">'+cfg.telephone+(cfg.localisation?' | '+cfg.localisation:'')+'</div>':'')
      +'</div>'
    +'</div>';
  }

  const html='<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Etiquettes -- '+formule.nom+'</title>'
    +'<style>'
    +'@page{size:A4;margin:8mm}'
    +'*{box-sizing:border-box;margin:0;padding:0}'
    +'body{font-family:Arial,sans-serif;font-size:10px;background:#fff;color:#000}'
    +'.page{display:grid;grid-template-columns:1fr 1fr;grid-template-rows:repeat(4,1fr);gap:4mm;width:194mm;height:281mm}'
    +'.label{border:1.5px solid #1b5e20;border-radius:2mm;display:flex;flex-direction:column;overflow:hidden}'
    +'.lbl-h{background:#1b5e20;color:#fff;padding:3px 6px;display:flex;align-items:center;gap:6px;flex-shrink:0}'
    +'.lbl-logo{width:38px;text-align:center;flex-shrink:0}'
    +'.lbl-prov{font-size:7px;text-transform:uppercase;letter-spacing:.8px;opacity:.85}'
    +'.lbl-nom{font-size:9px;font-weight:bold;line-height:1.2;margin:1px 0}'
    +'.lbl-stade{font-size:7px;opacity:.8;font-style:italic}'
    +'.nt{width:100%;border-collapse:collapse;flex:1;font-size:9px}'
    +'.nt thead tr{border-bottom:1px solid #1b5e20}'
    +'.nt th{font-size:8px;font-weight:bold;padding:2px 4px;text-align:left;color:#1b5e20;background:#f1f8e9}'
    +'.nt td{padding:2px 4px;border-bottom:.5px solid #e8f5e9}'
    +'.nt td:nth-child(2){font-weight:bold;text-align:right;padding-right:2px;color:#1b5e20}'
    +'.nt td:nth-child(3){width:20px;color:#555;font-size:8px}'
    +'.nt tr:nth-child(even){background:#f9fbe7}'
    +'.lbl-f{border-top:1px solid #c8e6c9;padding:3px 6px;font-size:8px;background:#f9fbe7;flex-shrink:0}'
    +'.lbl-d{display:flex;justify-content:space-between;margin-bottom:1px}'
    +'.lbl-d span:first-child{color:#555}'
    +'.lbl-d span:last-child{font-weight:bold}'
    +'.lbl-c{color:#777;font-size:7px;text-align:center;margin-top:2px}'
    +'@media print{button{display:none!important}}'
    +'</style></head><body>'
    +'<div class="page">'
    +lbl()+lbl()+lbl()+lbl()
    +lbl()+lbl()+lbl()+lbl()
    +'</div>'
    +'<div style="text-align:center;margin-top:10px">'
    +'<button onclick="window.print()" style="padding:8px 24px;font-size:13px;cursor:pointer;background:#1b5e20;color:#fff;border:none;border-radius:6px">Imprimer les 8 etiquettes</button>'
    +'</div>'
    +'</body></html>';

  const w=window.open('','_blank','width=880,height=720');
  w.document.write(html);
  w.document.close();
}

// ── FONCTIONS APPELÉES DEPUIS L'UI ─────────────────
function imprimerVente(venteJson){
  const vente=JSON.parse(decodeURIComponent(venteJson));
  printRecu(vente);
}

function imprimerFiche(formuleNom){
  const f=getAllFormules().find(function(x){return x.nom===formuleNom;});
  if(f) printFicheTechnique(f);
  else notify('Formule introuvable','r');
}

async function imprimerDerniereVente(){
  const res=await SB.from('gp_ventes').select('*')
    .eq('admin_id',GP_ADMIN_ID)
    .order('created_at',{ascending:false})
    .limit(1).maybeSingle();
  if(res.data) printRecu(res.data);
  else notify('Aucune vente trouvee','r');
}

// ── IMPRESSION DEPUIS LA PAGE PRODUCTION ───────────
function imprimerEtiquettesLot(formuleNom, numLot, qteProduite, dateLot){
  const f = getAllFormules().find(function(x){ return x.nom === formuleNom; });
  if(!f){ notify('Formule introuvable','r'); return; }
  printFicheTechniqueLot(f, numLot, qteProduite, dateLot);
}

function printFicheTechniqueLot(formule, numLot, qteProduite, dateLot){
  const cfg = GP_CONFIG || {};
  const nutri = calcNutri(formule);

  // Date production depuis le lot
  const dProd = dateLot
    ? new Date(dateLot+'T12:00:00').toLocaleDateString('fr-FR',{day:'2-digit',month:'2-digit',year:'numeric'})
    : new Date().toLocaleDateString('fr-FR',{day:'2-digit',month:'2-digit',year:'numeric'});

  // Date expiration = +90 jours
  const expDate = dateLot ? new Date(dateLot+'T12:00:00') : new Date();
  expDate.setDate(expDate.getDate() + 90);
  const dExp = expDate.toLocaleDateString('fr-FR',{day:'2-digit',month:'2-digit',year:'numeric'});

  const logoHtml = cfg.logo_url
    ? ('<img src="'+cfg.logo_url+'" style="height:32px;object-fit:contain">')
    : '<span style="font-size:18px">&#127807;</span>';

  const emLabel = ['lapin'].includes(formule.espece) ? 'ED Lapin (kcal/kg)'
    : ['porc'].includes(formule.espece) ? 'ED Porc (kcal/kg)'
    : ['tilapia','goliath'].includes(formule.espece) ? 'ED Poisson (kcal/kg)'
    : 'EM Volaille (kcal/kg)';

  function lbl(){
    return '<div class="label">'
      +'<div class="lbl-h">'
        +'<div class="lbl-logo">'+logoHtml+'</div>'
        +'<div class="lbl-info">'
          +'<div class="lbl-prov">'+(cfg.nom_provenderie||'PROVENDERIE SADARI')+'</div>'
          +'<div class="lbl-nom">'+formule.nom+'</div>'
          +'<div class="lbl-stade">'+(formule.stade||'')+'</div>'
        +'</div>'
      +'</div>'
      +'<table class="nt">'
        +'<thead><tr><th>Composition</th><th>Apport</th><th></th></tr></thead>'
        +'<tbody>'
          +'<tr><td>Matiere Minerale</td><td>'+nutri.mm+'</td><td>%</td></tr>'
          +'<tr><td>Proteine brute</td><td>'+nutri.prot+'</td><td>%</td></tr>'
          +'<tr><td>Matiere grasse</td><td>'+nutri.mg+'</td><td>%</td></tr>'
          +'<tr><td>Cellulose Brute</td><td>'+nutri.cb+'</td><td>%</td></tr>'
          +'<tr><td>Lysine</td><td>'+nutri.lys+'</td><td>%</td></tr>'
          +'<tr><td>Methionine</td><td>'+nutri.met+'</td><td>%</td></tr>'
          +'<tr><td>Calcium</td><td>'+nutri.ca+'</td><td>%</td></tr>'
          +'<tr><td>'+emLabel+'</td><td>'+nutri.em+'</td><td></td></tr>'
        +'</tbody>'
      +'</table>'
      +'<div class="lbl-f">'
        +'<div class="lbl-d lbl-lot"><span>N° Lot</span><span class="lot-num">'+numLot+'</span></div>'
        +'<div class="lbl-d"><span>Date production</span><span>'+dProd+'</span></div>'
        +'<div class="lbl-d"><span>Date expiration</span><span>'+dExp+'</span></div>'
        +(cfg.telephone?'<div class="lbl-c">'+cfg.telephone+(cfg.localisation?' | '+cfg.localisation:'')+'</div>':'')
      +'</div>'
    +'</div>';
  }

  const html = '<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Lot '+numLot+' -- '+formule.nom+'</title>'
    +'<style>'
    +'@page{size:A4;margin:8mm}'
    +'*{box-sizing:border-box;margin:0;padding:0}'
    +'body{font-family:Arial,sans-serif;font-size:10px;background:#fff;color:#000}'
    +'.page{display:grid;grid-template-columns:1fr 1fr;grid-template-rows:repeat(4,1fr);gap:4mm;width:194mm;height:281mm}'
    +'.label{border:1.5px solid #1b5e20;border-radius:2mm;display:flex;flex-direction:column;overflow:hidden}'
    +'.lbl-h{background:#1b5e20;color:#fff;padding:3px 6px;display:flex;align-items:center;gap:6px;flex-shrink:0}'
    +'.lbl-logo{width:36px;text-align:center;flex-shrink:0}'
    +'.lbl-prov{font-size:7px;text-transform:uppercase;letter-spacing:.8px;opacity:.85}'
    +'.lbl-nom{font-size:9px;font-weight:bold;line-height:1.2;margin:1px 0}'
    +'.lbl-stade{font-size:7px;opacity:.8;font-style:italic}'
    +'.nt{width:100%;border-collapse:collapse;flex:1;font-size:9px}'
    +'.nt thead tr{border-bottom:1px solid #1b5e20}'
    +'.nt th{font-size:8px;font-weight:bold;padding:2px 4px;text-align:left;color:#1b5e20;background:#f1f8e9}'
    +'.nt td{padding:2px 4px;border-bottom:.5px solid #e8f5e9}'
    +'.nt td:nth-child(2){font-weight:bold;text-align:right;padding-right:2px;color:#1b5e20}'
    +'.nt td:nth-child(3){width:20px;color:#555;font-size:8px}'
    +'.nt tr:nth-child(even){background:#f9fbe7}'
    +'.lbl-f{border-top:1px solid #c8e6c9;padding:3px 6px;font-size:8px;background:#f9fbe7;flex-shrink:0}'
    +'.lbl-d{display:flex;justify-content:space-between;margin-bottom:1px}'
    +'.lbl-d span:first-child{color:#555}'
    +'.lbl-d span:last-child{font-weight:bold}'
    +'.lbl-lot{background:#e8f5e9;border-radius:2px;padding:1px 3px;margin-bottom:2px}'
    +'.lot-num{color:#1b5e20;font-weight:900;font-size:9px;letter-spacing:.5px}'
    +'.lbl-c{color:#777;font-size:7px;text-align:center;margin-top:2px}'
    +'@media print{button{display:none!important}}'
    +'</style></head><body>'
    +'<div style="text-align:center;margin-bottom:6px;font-size:11px;color:#333">'
    +'<strong>'+formule.nom+'</strong> &nbsp;|&nbsp; Lot : <strong>'+numLot+'</strong> &nbsp;|&nbsp; '+qteProduite+' kg &nbsp;|&nbsp; '+dProd
    +'</div>'
    +'<div class="page">'
    +lbl()+lbl()+lbl()+lbl()
    +lbl()+lbl()+lbl()+lbl()
    +'</div>'
    +'<div style="text-align:center;margin-top:10px">'
    +'<button onclick="window.print()" style="padding:8px 24px;font-size:13px;cursor:pointer;background:#1b5e20;color:#fff;border:none;border-radius:6px">'
    +'Imprimer les 8 etiquettes — Lot '+numLot
    +'</button>'
    +'</div>'
    +'</body></html>';

  const w = window.open('','_blank','width:880,height:720');
  w.document.write(html);
  w.document.close();
}

// ── REÇU THERMIQUE 80mm ───────────────────────────
function imprimerRecuThermique(vente){
  const cfg=GP_CONFIG||{};
  const prov=cfg.nom_provenderie||'PROVENDERIE SADARI';
  const lignes=vente.lignes||[];
  const total=lignes.length?lignes.reduce((s,l)=>s+Number(l.montant_ligne||0),0):Number(vente.montant_total||0);
  const paye=Number(vente.montant_paye||0);
  const reste=Math.max(0,total-paye);
  const statut=reste<=0?'✅ PAYÉ':paye>0?'⚠ PARTIEL':'❌ IMPAYÉ';

  // Messages de fidélité dynamiques
  const msgs=[
    'Merci pour votre confiance ! 🌾 Votre fidélité est notre force.',
    'Merci de choisir '+prov+' ! Ensemble, faisons prospérer nos élevages.',
    'Votre satisfaction est notre priorité. À bientôt ! 🐔🐰',
    'Merci et bonne production ! Que vos animaux prospèrent. 🌱',
  ];
  const merci=msgs[Math.floor(Math.random()*msgs.length)];

  const css=`
    @page{size:80mm auto;margin:2mm 3mm}
    @media print{
      body{margin:0;padding:0}
      .no-print{display:none!important}
    }
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:'Courier New',Courier,monospace;font-size:11px;width:76mm;color:#000;background:#fff}
    .center{text-align:center}
    .right{text-align:right}
    .bold{font-weight:bold}
    .line{border-top:1px dashed #000;margin:4px 0}
    .row{display:flex;justify-content:space-between;padding:1px 0}
    h1{font-size:14px;font-weight:bold;text-align:center;margin-bottom:2px}
    h2{font-size:11px;text-align:center;font-weight:normal;margin-bottom:2px}
    .statut{font-size:12px;font-weight:bold;text-align:center;margin:4px 0;padding:3px}
    .merci{font-size:10px;text-align:center;margin-top:6px;font-style:italic}
    table{width:100%;border-collapse:collapse;font-size:10px}
    th{text-align:left;font-weight:bold;border-bottom:1px solid #000;padding:1px 2px}
    td{padding:1px 2px}
    .num{text-align:right}`;

  const html=`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Reçu</title>
<style>${css}</style></head><body>
<div class="center">
  <h1>${prov}</h1>
  ${cfg.adresse?`<h2>${cfg.adresse}</h2>`:''}
  ${cfg.telephone?`<h2>Tél: ${cfg.telephone}</h2>`:''}
</div>
<div class="line"></div>
<div class="center bold" style="font-size:12px">REÇU DE VENTE</div>
<div class="line"></div>
<div class="row"><span>N° :</span><span>${vente.ref||vente.id?.slice(0,8)||'—'}</span></div>
<div class="row"><span>Date :</span><span>${vente.date||new Date().toLocaleDateString('fr-FR')}</span></div>
<div class="row"><span>Client :</span><span>${vente.client_nom||'Comptant'}</span></div>
${vente.point_vente?`<div class="row"><span>PDV :</span><span>${vente.point_vente}</span></div>`:''}
<div class="line"></div>
${lignes.length?`
<table>
  <thead><tr><th>Produit</th><th class="num">Kg</th><th class="num">P.U</th><th class="num">Mnt</th></tr></thead>
  <tbody>
  ${lignes.map(l=>`<tr>
    <td style="max-width:28mm;overflow:hidden">${l.formule_nom||'—'}</td>
    <td class="num">${Number(l.quantite||0)}</td>
    <td class="num">${fmt(l.prix_unitaire||0)}</td>
    <td class="num">${fmt(l.montant_ligne||0)}</td>
  </tr>`).join('')}
  </tbody>
</table>
<div class="line"></div>`:''}
<div class="row bold"><span>TOTAL</span><span>${fmt(total)} F</span></div>
<div class="row"><span>Payé</span><span>${fmt(paye)} F</span></div>
${reste>0?`<div class="row bold"><span>Reste dû</span><span>${fmt(reste)} F</span></div>`:''}
<div class="line"></div>
<div class="statut">${statut}</div>
<div class="line"></div>
<div class="merci">${merci}</div>
<div class="center" style="font-size:9px;margin-top:4px">${new Date().toLocaleString('fr-FR')}</div>
</body></html>`;

  // Créer iframe caché pour impression directe sans popup
  const iframe=document.createElement('iframe');
  iframe.style.cssText='position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden';
  document.body.appendChild(iframe);
  iframe.contentDocument.open();
  iframe.contentDocument.write(html);
  iframe.contentDocument.close();
  iframe.onload=()=>{
    iframe.contentWindow.focus();
    iframe.contentWindow.print();
    setTimeout(()=>iframe.remove(),2000);
  };
}


