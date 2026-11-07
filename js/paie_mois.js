// ══════════════════════════════════════════════════
// PROVENDA — FICHE DE PAIE DU MOIS (07/11/2026)
// Demande du DG : chaque employé a DEUX salaires — le salaire par défaut (fixe,
// sans calcul) et le salaire calculé (heures d'arrivée, absences, primes).
// En fin de mois l'admin choisit lequel retenir, ajuste (motif obligatoire),
// puis imprime :
//   • la fiche de paie COLLECTIVE, avec une case de signature « j'ai reçu » ;
//   • l'ordre de virement pour la banque (onglet 🏦, mêmes montants) ;
//   • la fiche ANNUELLE d'un employé : ce qu'il a perçu chaque mois.
// Les montants viennent de gp_salaires (calculés par genererBulletinOuvrier, rh.js).
// ══════════════════════════════════════════════════

function _fpMois(){ return document.getElementById('sal-mois')?.value || thisMonth(); }
function _fpEsc(t){ return String(t==null?'':t).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }
function _fpMoisLabel(mois){
  const l=new Date(mois+'-15').toLocaleDateString('fr-FR',{month:'long',year:'numeric'});
  return l.charAt(0).toUpperCase()+l.slice(1);
}
function _fpMoisLabelEn(mois){ return new Date(mois+'-15').toLocaleDateString('en-GB',{month:'long',year:'numeric'}); }
function _fpNet(s){ return Number(s.net_a_payer!=null?s.net_a_payer:s.montant)||0; }
// Le salaire retenu : celui choisi, plus l'ajustement de l'admin.
function fpNetRetenu(s){
  const defaut=Number(s.salaire_defaut!=null?s.salaire_defaut:s.salaire_base)||0;
  const calcule=Number(s.salaire_calcule!=null?s.salaire_calcule:_fpNet(s))||0;
  const base=(s.choix_salaire==='defaut')?defaut:calcule;
  return Math.max(0, Math.round(base+(Number(s.ajustement)||0)));
}

async function _fpCharger(mois){
  const {data,error}=await SB.from('gp_salaires').select('*').eq('admin_id',GP_ADMIN_ID).eq('mois',mois).order('nom_prenom');
  if(error) throw new Error(error.message);
  return data||[];
}

// ── L'ÉCRAN DE FIN DE MOIS ──
async function renderFicheMois(){
  const el=document.getElementById('fiche-mois'); if(!el) return;
  const mois=_fpMois();
  el.innerHTML='<div style="color:var(--textm);font-size:12px;padding:12px">Chargement…</div>';
  let S;
  try{ S=await _fpCharger(mois); }
  catch(e){ el.innerHTML=`<div style="color:var(--red);font-size:12px;padding:12px">⚠ ${_fpEsc(e.message)}</div>`; return; }
  const entete=`<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px">
      <button class="btn btn-g btn-sm" onclick="genererTousBulletins()">⚙️ Calculer / mettre à jour ${_fpMoisLabel(mois)}</button>
      ${S.length?`<button class="btn btn-print btn-sm" onclick="imprimerFicheCollective()">🖨️ Fiche de paie collective (PDF)</button>
      <button class="btn btn-out btn-sm" onclick="showSalTab('virement')">🏦 Ordre de virement</button>`:''}
    </div>`;
  if(!S.length){
    el.innerHTML=entete+`<div style="color:var(--textm);font-size:12px;padding:12px">Aucun salaire pour ${_fpMoisLabel(mois)}. Appuie sur « Calculer » : chaque employé actif reçoit son salaire par défaut et son salaire calculé.</div>`;
    return;
  }
  const total=S.reduce((t,s)=>t+fpNetRetenu(s),0);
  el.innerHTML=entete+`
    <div style="font-size:11px;color:var(--textm);margin-bottom:8px">Pour chaque personne : choisis le salaire retenu, ajoute un ajustement si besoin (motif obligatoire). Tout est enregistré dès que tu changes une case. Total retenu : <b style="color:var(--gold)">${fmt(total)} F</b></div>
    <div style="overflow-x:auto"><table class="tbl" style="font-size:11px">
      <thead><tr><th>Nom</th><th class="num">Par défaut</th><th class="num">Calculé</th><th>Retenu</th><th class="num">Ajustement</th><th>Motif</th><th class="num">Net</th></tr></thead>
      <tbody>${S.map(s=>{
        const defaut=Number(s.salaire_defaut!=null?s.salaire_defaut:s.salaire_base)||0;
        const calcule=Number(s.salaire_calcule!=null?s.salaire_calcule:_fpNet(s))||0;
        const bloque=!!s.paye;
        const dis=bloque?'disabled title="Déjà payé : non modifiable"':'';
        const detail=[s.jours_absence?`${s.jours_absence} abs.`:'', s.minutes_retard?`${s.minutes_retard} min de retard`:'', Number(s.primes)>0?`+${fmt(s.primes)} primes`:''].filter(Boolean).join(' · ');
        return `<tr style="${bloque?'opacity:.7':''}">
          <td><b>${_fpEsc(s.nom_prenom)}</b><div style="font-size:9.5px;color:var(--textm)">${_fpEsc(s.poste||'')}${bloque?' · ✅ payé':''}</div></td>
          <td class="num">${fmt(defaut)}</td>
          <td class="num">${fmt(calcule)}${detail?`<div style="font-size:9px;color:var(--textm)">${_fpEsc(detail)}</div>`:''}</td>
          <td><select ${dis} onchange="majLigneFiche('${s.id}')" id="fp-choix-${s.id}" style="padding:4px">
            <option value="calcule" ${s.choix_salaire!=='defaut'?'selected':''}>Calculé</option>
            <option value="defaut" ${s.choix_salaire==='defaut'?'selected':''}>Par défaut</option></select></td>
          <td class="num"><input ${dis} type="number" step="500" id="fp-aj-${s.id}" value="${Number(s.ajustement)||0}" onchange="majLigneFiche('${s.id}')" style="width:90px;padding:4px;text-align:right"></td>
          <td><input ${dis} type="text" id="fp-motif-${s.id}" value="${_fpEsc(s.ajustement_motif||'')}" placeholder="ex. avance, prime exceptionnelle" onchange="majLigneFiche('${s.id}')" style="width:150px;padding:4px"></td>
          <td class="num" id="fp-net-${s.id}" style="color:var(--gold);font-weight:700">${fmt(fpNetRetenu(s))}</td>
        </tr>`;
      }).join('')}
      <tr style="font-weight:700"><td colspan="6">TOTAL</td><td class="num" style="color:var(--gold)">${fmt(total)} F</td></tr>
      </tbody></table></div>`;
}

// Une case a changé : on enregistre la ligne (choix, ajustement, motif → net à payer).
async function majLigneFiche(id){
  const choix=document.getElementById('fp-choix-'+id)?.value||'calcule';
  const aj=Math.round(Number(document.getElementById('fp-aj-'+id)?.value)||0);
  const motifEl=document.getElementById('fp-motif-'+id);
  const motif=(motifEl?.value||'').trim();
  if(aj!==0 && !motif){
    if(motifEl){ motifEl.style.borderColor='var(--red)'; motifEl.placeholder='Motif obligatoire'; motifEl.focus(); }
    notify('⚠ Indique le motif de l\'ajustement (avance, prime, sanction…)','r'); return;
  }
  if(motifEl) motifEl.style.borderColor='';
  const {data:s,error:e0}=await SB.from('gp_salaires').select('*').eq('id',id).maybeSingle();
  if(e0||!s){ notify('⚠ Ligne introuvable : '+((e0&&e0.message)||''),'r'); return; }
  if(s.paye){ notify('Ce salaire est déjà payé : il ne se modifie plus.','gold'); return renderFicheMois(); }
  const maj={ choix_salaire:choix, ajustement:aj, ajustement_motif:motif||null };
  const net=fpNetRetenu({...s, ...maj});
  maj.net_a_payer=net; maj.montant=net;
  const {error}=await SB.from('gp_salaires').update(maj).eq('id',id).eq('admin_id',GP_ADMIN_ID);
  if(error){ notify('⚠ Non enregistré : '+error.message,'r'); return; }
  const c=document.getElementById('fp-net-'+id); if(c) c.textContent=fmt(net);
  notify(`${s.nom_prenom} : ${fmt(net)} F ✓`,'gold');
}

// ── LA FICHE DE PAIE COLLECTIVE (PDF via impression) ──
function _fpStyle(){ return `@page{size:A4 landscape;margin:10mm}
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:Arial,sans-serif;font-size:12px;color:#000}
.entete{text-align:center;border-bottom:2px solid #000;padding-bottom:8px;margin-bottom:6px}
.entete h1{font-size:19px;letter-spacing:1px}
.entete .meta{font-size:11px;margin-top:3px;line-height:1.5}
.titre{text-align:center;font-size:15px;font-weight:bold;margin:12px 0 2px}
.titre-en{text-align:center;font-size:11px;color:#444;margin-bottom:8px}
.souslig{display:flex;justify-content:space-between;font-size:12px;margin:6px 2px}
table{width:100%;border-collapse:collapse;margin-top:6px}
th,td{border:1px solid #000;padding:5px 6px;font-size:11.5px;vertical-align:middle}
th{background:#e8e8e8;text-align:left;font-size:11px}
th small{display:block;font-weight:normal;color:#444;font-size:9.5px}
td.num,th.num{text-align:right}
td.sign{height:34px;width:150px}
.total td{font-weight:bold;background:#f4f4f4;font-size:12.5px}
.signatures{display:flex;justify-content:space-between;margin-top:18px;gap:20px}
.sig{flex:1;font-size:11px;line-height:1.8}
.sig .l{border-bottom:1px solid #000;height:30px;margin-top:4px}
.note{font-size:10px;color:#333;margin-top:6px}`; }
function _fpEntete(){
  const cfg=GP_CONFIG||{}, prov=(cfg.nom_provenderie||'SADARI');
  const etat=(k)=> (typeof _cfgEtat==='function') ? _cfgEtat(k) : (cfg[k]||'');
  return `<div class="entete"><h1>${_fpEsc(prov.toUpperCase())}</h1><div class="meta">
    Siège : ${_fpEsc(etat('siege'))}${cfg.telephone?` · Tél : ${_fpEsc(cfg.telephone)}`:''}<br>
    N° RCCM : ${_fpEsc(etat('rccm'))} · Compte : ${_fpEsc(etat('numero_compte'))}</div></div>`;
}
function _fpOuvrir(html, titre){
  const win=window.open('','_blank','width=1100,height=800');
  if(!win){ notify('Popup bloqué — autorise les popups pour imprimer','r'); return; }
  win.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${_fpEsc(titre)}</title><style>${_fpStyle()}</style></head><body>${html}</body></html>`);
  win.document.close(); win.focus(); setTimeout(()=>win.print(),400);
}
function fpHtmlCollective(S, mois){
  const total=S.reduce((t,s)=>t+fpNetRetenu(s),0);
  const dateEtab=new Date().toLocaleDateString('fr-FR');
  const etat=(k)=> (typeof _cfgEtat==='function') ? _cfgEtat(k) : '';
  return `${_fpEntete()}
<div class="titre">FICHE DE PAIE COLLECTIVE — ${_fpMoisLabel(mois).toUpperCase()}</div>
<div class="titre-en">Collective payslip — ${_fpMoisLabelEn(mois)}</div>
<div class="souslig"><span><b>Effectif / Staff :</b> ${S.length}</span><span><b>Établie le / Issued on :</b> ${dateEtab}</span></div>
<table><thead><tr>
  <th style="width:30px">N°</th>
  <th>Nom et prénom<small>Full name</small></th>
  <th>Fonction<small>Position</small></th>
  <th class="num">Salaire par défaut<small>Base salary</small></th>
  <th class="num">Salaire calculé<small>Computed salary</small></th>
  <th class="num">Ajustement<small>Adjustment</small></th>
  <th class="num">Net à payer<small>Net pay (F CFA)</small></th>
  <th>Signature — j'ai reçu mon salaire<small>Signature — salary received</small></th>
</tr></thead><tbody>
${S.map((s,i)=>{
  const defaut=Number(s.salaire_defaut!=null?s.salaire_defaut:s.salaire_base)||0;
  const calcule=Number(s.salaire_calcule!=null?s.salaire_calcule:_fpNet(s))||0;
  const aj=Number(s.ajustement)||0;
  const retenuDefaut=s.choix_salaire==='defaut';
  return `<tr>
  <td>${String(i+1).padStart(2,'0')}</td>
  <td>${_fpEsc(s.nom_prenom)}</td>
  <td>${_fpEsc(s.poste||'')}</td>
  <td class="num">${retenuDefaut?'<b>':''}${fmt(defaut)}${retenuDefaut?'</b> ✓':''}</td>
  <td class="num">${!retenuDefaut?'<b>':''}${fmt(calcule)}${!retenuDefaut?'</b> ✓':''}</td>
  <td class="num">${aj?(aj>0?'+':'')+fmt(aj):'—'}${aj&&s.ajustement_motif?`<div style="font-size:9px">${_fpEsc(s.ajustement_motif)}</div>`:''}</td>
  <td class="num"><b>${fmt(fpNetRetenu(s))}</b></td>
  <td class="sign"></td></tr>`;}).join('')}
<tr class="total"><td colspan="6">TOTAL</td><td class="num">${fmt(total)} F CFA</td><td></td></tr>
</tbody></table>
<div class="note">✓ = salaire retenu / salary applied. La signature vaut reçu du net indiqué. / The signature acknowledges receipt of the net amount shown.</div>
<div class="signatures">
  <div class="sig"><b>Établi par / Prepared by :</b><br>Nom : ${_fpEsc(etat('etabli_par_nom'))}<br>Fonction : ${_fpEsc(etat('etabli_par_fonction'))}<br>Signature :<div class="l"></div></div>
  <div class="sig"><b>Visa du responsable / Approved by :</b><br>Nom : ${_fpEsc(etat('responsable_nom'))}<br>Signature :<div class="l"></div></div>
  <div class="sig"><b>Visa du ${_fpEsc(etat('comptable_libelle')||'comptable')} / Accountant :</b><br>Nom : ___________________<br>Signature :<div class="l"></div></div>
</div>`;
}
async function imprimerFicheCollective(){
  const mois=_fpMois();
  let S; try{ S=await _fpCharger(mois); }catch(e){ notify('⚠ '+e.message,'r'); return; }
  if(!S.length){ notify('Aucun salaire pour ce mois — calcule-le d\'abord.','r'); return; }
  _fpOuvrir(fpHtmlCollective(S, mois), 'Fiche de paie '+mois);
}

// ── LA FICHE ANNUELLE D'UN EMPLOYÉ : ce qu'il a perçu chaque mois ──
function fpHtmlAnnuelle(o, annee, H){
  const parMois={}; H.forEach(h=>{ parMois[h.mois]=h; });
  const lignes=[]; let tot=0, totAj=0, totPaye=0;
  for(let m=1;m<=12;m++){
    const k=annee+'-'+String(m).padStart(2,'0'); const h=parMois[k];
    const net=h?fpNetRetenu(h):0; if(h){ tot+=net; totAj+=Number(h.ajustement)||0; if(h.paye) totPaye+=net; }
    lignes.push(`<tr><td>${_fpMoisLabel(k)}</td>
      <td class="num">${h?fmt(Number(h.salaire_defaut!=null?h.salaire_defaut:h.salaire_base)||0):'—'}</td>
      <td class="num">${h?fmt(Number(h.salaire_calcule!=null?h.salaire_calcule:_fpNet(h))||0):'—'}</td>
      <td class="num">${h&&Number(h.ajustement)?((h.ajustement>0?'+':'')+fmt(h.ajustement)):'—'}${h&&h.ajustement_motif?`<div style="font-size:9px">${_fpEsc(h.ajustement_motif)}</div>`:''}</td>
      <td class="num"><b>${h?fmt(net):'—'}</b></td>
      <td>${h?(h.paye?('Payé'+(h.paye_le?' le '+new Date(h.paye_le).toLocaleDateString('fr-FR'):'')):'Non payé'):''}</td></tr>`);
  }
  return `${_fpEntete()}
<div class="titre">FICHE DE PAIE ANNUELLE — ${annee}</div>
<div class="titre-en">Annual pay statement — ${annee}</div>
<div class="souslig"><span><b>Nom / Name :</b> ${_fpEsc(o.nom_prenom)}${o.matricule?' · Matricule '+_fpEsc(o.matricule):''}</span><span><b>Fonction / Position :</b> ${_fpEsc(o.fonction||'')}</span></div>
<div class="souslig"><span><b>Salaire par défaut actuel / Current base salary :</b> ${fmt(o.salaire_base||0)} F</span><span><b>Compte / Account :</b> ${_fpEsc(o.numero_compte||'—')}</span></div>
<table><thead><tr><th>Mois<small>Month</small></th><th class="num">Par défaut<small>Base</small></th><th class="num">Calculé<small>Computed</small></th><th class="num">Ajustement<small>Adjustment</small></th><th class="num">Net retenu<small>Net pay</small></th><th>Paiement<small>Payment</small></th></tr></thead>
<tbody>${lignes.join('')}
<tr class="total"><td>TOTAL ${annee}</td><td></td><td></td><td class="num">${totAj?((totAj>0?'+':'')+fmt(totAj)):'—'}</td><td class="num">${fmt(tot)} F CFA</td><td>Payé : ${fmt(totPaye)} F</td></tr>
</tbody></table>
<div class="signatures"><div class="sig"><b>Établi par / Prepared by :</b><br>Signature :<div class="l"></div></div><div class="sig"><b>L'employé(e) / Employee :</b><br>Signature :<div class="l"></div></div></div>`;
}
async function ficheAnnuelleOuvrier(ouvrierId){
  const anneeDef=String(new Date().getFullYear());
  const annee=(prompt('Fiche annuelle — quelle année ?', anneeDef)||'').trim();
  if(!/^\d{4}$/.test(annee)) return;
  const {data:o}=await SB.from('gp_ouvriers').select('*').eq('id',ouvrierId).maybeSingle();
  if(!o){ notify('Employé introuvable','r'); return; }
  const {data:H,error}=await SB.from('gp_salaires').select('*').eq('admin_id',GP_ADMIN_ID).eq('ouvrier_id',ouvrierId)
    .gte('mois',annee+'-01').lte('mois',annee+'-12').order('mois');
  if(error){ notify('⚠ '+error.message,'r'); return; }
  if(!(H||[]).length){ notify(`Aucun salaire enregistré pour ${o.nom_prenom} en ${annee}.`,'gold'); return; }
  _fpOuvrir(fpHtmlAnnuelle(o, annee, H), 'Fiche annuelle '+o.nom_prenom+' '+annee);
}

if(typeof window!=='undefined'){ Object.assign(window,{ renderFicheMois, majLigneFiche, imprimerFicheCollective, ficheAnnuelleOuvrier }); }
if(typeof module!=='undefined' && module.exports){ module.exports={ fpNetRetenu, fpHtmlCollective, fpHtmlAnnuelle, _fpStyle }; }
