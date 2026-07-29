// ══════════════════════════════════════════════════
// PROVENDA — COMMISSIONS PDV (hors caisse)
// Une commission (ex. 500 F / sac d'aliment lapin vendu par le PDV principal)
// s'accumule dans un REGISTRE SÉPARÉ `gp_commissions` à chaque vente au DÉTAIL.
// → AUCUN mouvement de caisse : la caisse reste = argent réellement encaissé.
// Le règlement au bénéficiaire se fait séparément (un seul vrai versement).
// Règles configurables par l'admin : PDV × espèce → montant/sac (gp_commissions_regles).
// ══════════════════════════════════════════════════

var GP_COMM_REGLES = null;   // cache des règles actives
var _COMM_DETAIL = {};        // détail par PDV pour le rendu

async function chargerReglesCommission(force){
  if(GP_COMM_REGLES && !force) return GP_COMM_REGLES;
  try{
    const{data}=await SB.from('gp_commissions_regles').select('*')
      .eq('admin_id',GP_ADMIN_ID).eq('actif',true);
    GP_COMM_REGLES = data||[];
  }catch(e){ GP_COMM_REGLES = []; }
  return GP_COMM_REGLES;
}

// Espèce d'une formule
function _commEspece(formuleNom){
  const f=(typeof getFormule==='function' && getFormule(formuleNom))
    || (typeof FORMULES_SADARI!=='undefined' ? (FORMULES_SADARI||[]).find(x=>x.nom===formuleNom) : null);
  return f?.espece || null;
}

// Nb de sacs d'une ligne (même logique que les points fidélité ; vrac = équivalent sacs)
function _commSacs(l){
  const cond=String(l.conditionnement||'kg');
  const qte=Number(l.quantite)||0;
  if(cond==='25'||cond==='50'){
    const poids=Number(cond);
    return Number(l.nb_sacs)>0 ? Number(l.nb_sacs) : Math.round(qte/poids);
  }
  // vrac (kg) → équivalent sacs au prorata du poids de sac de la formule
  const ps=(typeof GP_POIDS_SAC_VENTE!=='undefined' && GP_POIDS_SAC_VENTE[l.formule_nom]) || 25;
  return ps>0 ? (qte/ps) : 0;
}

// Trouve la règle applicable pour (PDV, espèce, formule).
// Règle sans PDV = tous PDV ; sans formule = toutes formules ; sans espèce = toutes espèces.
// Priorité à la plus spécifique : formule > espèce > PDV.
function _commRegle(pointVente, espece, formuleNom, typeVente){
  const regles=GP_COMM_REGLES||[];
  const cands=regles.filter(r=>
    (!r.point_vente || r.point_vente===(pointVente||null)) &&
    (!r.formule_nom || r.formule_nom===formuleNom) &&
    (!r.espece || r.espece===espece) &&
    (!r.type_vente || r.type_vente===typeVente));
  const sc=r=>(r.formule_nom?4:0)+(r.espece?2:0)+(r.point_vente?1:0)+(r.type_vente?1:0);
  cands.sort((a,b)=> sc(b)-sc(a));
  return cands[0]||null;
}

// Calcule les commissions d'une vente. estGros → type de vente ('gros' sinon 'detail').
// La règle applicable dépend du type de vente (détail et gros = 2 barèmes distincts).
function calcCommissionVente(lignes, pointVente, estGros){
  const typeVente = estGros ? 'gros' : 'detail';
  const out=[];
  (lignes||[]).forEach(l=>{
    if(l.type_produit!=='formule') return;
    const esp=_commEspece(l.formule_nom);
    if(!esp) return;
    const r=_commRegle(pointVente, esp, l.formule_nom, typeVente);
    if(!r || !Number(r.montant_par_sac)) return;
    const sacs=_commSacs(l);
    if(sacs<=0) return;
    const montant=Math.round(sacs*Number(r.montant_par_sac));
    if(montant>0) out.push({
      espece:esp, formule_nom:l.formule_nom, type_vente:typeVente,
      nb_sacs:Math.round(sacs*100)/100,
      montant_unitaire:Number(r.montant_par_sac), montant
    });
  });
  return out;
}

// Enregistre les commissions d'une vente (appelé à la vente). ZÉRO mouvement de caisse.
// Ne doit JAMAIS bloquer la vente (try/catch silencieux).
async function enregistrerCommissionsVente(venteId, lignes, pointVente, estGros){
  try{
    await chargerReglesCommission();
    if(!(GP_COMM_REGLES||[]).length) return;
    const comms=calcCommissionVente(lignes, pointVente, estGros);
    if(!comms.length) return;
    const rows=comms.map(c=>({
      admin_id:GP_ADMIN_ID, vente_id:venteId, point_vente:pointVente||null,
      espece:c.espece, formule_nom:c.formule_nom, type_vente:c.type_vente, nb_sacs:c.nb_sacs,
      montant_unitaire:c.montant_unitaire, montant:c.montant,
      date:today(), statut:'due',
      enregistre_par:GP_USER?.id, enregistre_par_nom:GP_USER?.email?.split('@')[0]
    }));
    await SB.from('gp_commissions').insert(rows);
  }catch(e){ /* silencieux : la commission ne bloque jamais la vente */ }
}

// ── AFFICHAGE ─────────────────────────────────────
// Admin / gérant / siège : voient TOUTES les commissions (par PDV) + peuvent régler.
// Un membre de PDV : voit uniquement SES commissions (créance due), sans réglage.
function _commPeutRegler(){
  return GP_ROLE==='admin' || GP_EST_GERANT || (typeof GP_POINT_VENTE==='undefined' || !GP_POINT_VENTE);
}

async function renderCommissions(){
  const root=document.getElementById('commissions-content');
  if(!root) return;
  root.innerHTML='<div style="padding:20px;color:var(--textm)">⏳ Chargement…</div>';
  const gestion=_commPeutRegler();
  await chargerReglesCommission(true);
  // Liste des PDV (pour la config) si pas déjà chargée par un autre module.
  // NB : GP_PDV_LIST est un `let` (distribution.js) → on assigne la variable, pas window.
  if(typeof GP_PDV_LIST==='undefined' || !GP_PDV_LIST || !GP_PDV_LIST.length){
    try{
      const{data:_p}=await SB.from('gp_points_vente').select('nom,type_pdv').eq('admin_id',GP_ADMIN_ID).order('nom');
      GP_PDV_LIST=_p||[];
    }catch(_){}
  }

  // Commissions (scopées : un PDV ne voit que les siennes)
  let q=SB.from('gp_commissions').select('*').eq('admin_id',GP_ADMIN_ID).order('date',{ascending:false}).limit(5000);
  if(!gestion && typeof GP_POINT_VENTE!=='undefined' && GP_POINT_VENTE) q=q.eq('point_vente',GP_POINT_VENTE);
  const{data,error}=await q;
  if(error){
    root.innerHTML=`<div class="card"><div style="padding:16px;color:var(--textm)">Le suivi des commissions n'est pas encore activé. Passe le SQL <b>gp_commissions</b> (fourni dans le chat).</div></div>`;
    return;
  }
  const C=data||[];

  // Agrégats par PDV
  const parPdv={};
  const moisCourant=(typeof thisMonth==='function'?thisMonth():new Date().toISOString().slice(0,7));
  C.forEach(c=>{
    const pv=c.point_vente||'—';
    const p=parPdv[pv]=parPdv[pv]||{due:0,dueMois:0,regle:0,lignes:[]};
    const m=Number(c.montant||0);
    if(c.statut==='regle'){ p.regle+=m; }
    else { p.due+=m; if((c.date||'').startsWith(moisCourant)) p.dueMois+=m; }
    p.lignes.push(c);
  });
  _COMM_DETAIL=parPdv;

  const totalDue=Object.values(parPdv).reduce((s,p)=>s+p.due,0);

  // Bloc config (admin uniquement)
  const configBloc = (GP_ROLE==='admin'||GP_EST_GERANT) ? _commConfigCard() : '';

  const pdvKeys=Object.keys(parPdv).sort((a,b)=>parPdv[b].due-parPdv[a].due);
  const cards = pdvKeys.length ? pdvKeys.map(pv=>{
    const p=parPdv[pv];
    const detId='comm-det-'+pv.replace(/[^a-zA-Z0-9]/g,'');
    return `<div class="card">
      <div class="card-title"><div class="ct-left"><span>🧾 ${pv==='—'?'Production':pv}</span></div>
        ${gestion&&p.due>0?`<button class="btn btn-g btn-sm" onclick="reglerCommissions('${pv.replace(/'/g,"\\'")}')">✅ Régler ${fmt(p.due)} F</button>`:''}
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:8px">
        <div class="econo-box"><div class="econo-val" style="color:var(--gold)">${fmt(p.due)} F</div><div class="econo-lbl">Commission due</div></div>
        <div class="econo-box"><div class="econo-val">${fmt(p.dueMois)} F</div><div class="econo-lbl">Due ce mois</div></div>
        <div class="econo-box"><div class="econo-val" style="color:var(--green)">${fmt(p.regle)} F</div><div class="econo-lbl">Déjà réglée</div></div>
      </div>
      <div style="font-size:11px;color:var(--textm);cursor:pointer" onclick="var e=document.getElementById('${detId}');if(e)e.style.display=e.style.display==='none'?'block':'none'">▸ Détail des ventes (${p.lignes.length})</div>
      <div id="${detId}" style="display:none;overflow-x:auto;margin-top:6px"><table class="tbl" style="font-size:11px"><thead><tr>
        <th>Date</th><th>Espèce</th><th>Formule</th><th>Type</th><th class="num">Sacs</th><th class="num">/sac</th><th class="num">Commission</th><th>Statut</th>
      </tr></thead><tbody>
        ${p.lignes.slice(0,300).map(c=>`<tr>
          <td style="font-size:10px">${c.date||''}</td>
          <td style="text-transform:capitalize">${c.espece||'—'}</td>
          <td style="font-size:10px">${c.formule_nom||'—'}</td>
          <td style="font-size:10px">${c.type_vente==='gros'?'💼 Gros':'🛒 Détail'}</td>
          <td class="num">${c.nb_sacs||0}</td>
          <td class="num">${fmt(c.montant_unitaire||0)}</td>
          <td class="num" style="font-weight:700">${fmt(c.montant||0)}</td>
          <td>${c.statut==='regle'?'<span class="badge bdg-g" style="font-size:9px">réglée</span>':'<span class="badge bdg-gold" style="font-size:9px">due</span>'}</td>
        </tr>`).join('')}
      </tbody></table></div>
    </div>`;
  }).join('') : `<div class="card"><div style="padding:16px;color:var(--textm)">Aucune commission enregistrée pour l'instant. Elles s'accumuleront automatiquement aux ventes au détail correspondant à une règle.</div></div>`;

  const entete=`<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px">
    <div class="econo-box"><div class="econo-val" style="color:var(--gold)">${fmt(totalDue)} F</div><div class="econo-lbl">Total commissions dues</div></div>
    <div class="econo-box"><div class="econo-val">${pdvKeys.length}</div><div class="econo-lbl">PDV concernés</div></div>
  </div>
  <div style="font-size:11px;color:var(--textm);margin-bottom:10px">💡 Les commissions n'entrent PAS dans la caisse. Le règlement (bouton « Régler ») crée un seul mouvement de caisse au moment du versement réel.</div>`;

  root.innerHTML = entete + configBloc + cards;
}

// ── CONFIG DES RÈGLES (admin) ─────────────────────
// Sélecteur d'aliment : "Toutes espèces", puis par espèce → "Toutes les formules X" + chaque formule.
function _commAlimentOptions(){
  const list=(typeof getAllFormules==='function'?getAllFormules():(typeof FORMULES_SADARI!=='undefined'?FORMULES_SADARI:[]))||[];
  const byEsp={};
  list.forEach(f=>{ if(!f||!f.nom) return; const e=f.espece||'autre'; (byEsp[e]=byEsp[e]||[]).push(f.nom); });
  let html='<option value="">Toutes espèces / tous aliments</option>';
  Object.keys(byEsp).sort().forEach(e=>{
    const ic=(typeof ESPECE_ICON!=='undefined'&&ESPECE_ICON[e])||'🌾';
    html+=`<optgroup label="${ic} ${e}">`;
    html+=`<option value="esp:${e}">— Toutes les formules ${e} —</option>`;
    byEsp[e].sort().forEach(n=>{ html+=`<option value="form:${String(n).replace(/"/g,'&quot;')}">${n}</option>`; });
    html+='</optgroup>';
  });
  return html;
}
function _commConfigCard(){
  const optEsp = _commAlimentOptions();
  const pdvs = (typeof GP_PDV_LIST!=='undefined' && GP_PDV_LIST.length) ? GP_PDV_LIST : [];
  const optPdv = '<option value="">Tous les PDV</option>'
    + pdvs.map(p=>`<option value="${(p.nom||'').replace(/"/g,'&quot;')}">${p.nom}${p.type_pdv==='principal'?' (principal)':''}</option>`).join('');
  const regles=GP_COMM_REGLES||[];
  const liste = regles.length ? `<div style="overflow-x:auto;margin-top:8px"><table class="tbl" style="font-size:11px"><thead><tr>
      <th>PDV</th><th>Aliment</th><th>Type</th><th class="num">Montant / sac</th><th></th></tr></thead><tbody>
      ${regles.map(r=>`<tr>
        <td>${r.point_vente||'<i>Tous</i>'}</td>
        <td style="text-transform:capitalize">${r.formule_nom?('🎯 '+r.formule_nom):(r.espece?r.espece:'<i>Toutes</i>')}</td>
        <td style="font-size:10px">${r.type_vente==='gros'?'💼 Gros':r.type_vente==='detail'?'🛒 Détail':'Les deux'}</td>
        <td class="num" style="font-weight:700">${fmt(r.montant_par_sac||0)} F</td>
        <td><button class="btn btn-red btn-sm" style="padding:2px 7px" onclick="supprimerRegleCommission('${r.id}')">🗑</button></td>
      </tr>`).join('')}
    </tbody></table></div>` : '<div style="font-size:11px;color:var(--textm);margin-top:6px">Aucune règle. Ajoute-en une ci-dessous (ex. Principal · lapin · 500 F/sac).</div>';
  return `<div class="card">
    <div class="card-title"><div class="ct-left"><span>⚙️ Règles de commission (admin)</span></div></div>
    <div style="font-size:11px;color:var(--textm);margin-bottom:8px">Montant versé au PDV vendeur, par sac d'aliment vendu. Barème distinct possible pour le <b>détail</b> et le <b>gros</b> (ex. détail 500 F, gros 200 F).</div>
    <div style="display:grid;grid-template-columns:1fr 1fr 0.9fr 0.9fr auto;gap:8px;align-items:end">
      <div class="fr" style="margin:0"><label>PDV</label><select id="comm-r-pdv">${optPdv}</select></div>
      <div class="fr" style="margin:0"><label>Aliment (formule ou espèce)</label><select id="comm-r-esp">${optEsp}</select></div>
      <div class="fr" style="margin:0"><label>Type de vente</label>
        <select id="comm-r-type"><option value="detail">🛒 Détail</option><option value="gros">💼 Gros</option><option value="">Les deux</option></select>
      </div>
      <div class="fr" style="margin:0"><label>Montant / sac (F)</label><input type="number" id="comm-r-montant" placeholder="500"></div>
      <button class="btn btn-g" onclick="ajouterRegleCommission()">+ Ajouter</button>
    </div>
    ${liste}
  </div>`;
}

async function ajouterRegleCommission(){
  if(!(GP_ROLE==='admin'||GP_EST_GERANT)){ notify('Réservé à l\'admin','r'); return; }
  let pv=document.getElementById('comm-r-pdv')?.value||'';
  const sel=document.getElementById('comm-r-esp')?.value||''; // '', 'esp:lapin', 'form:LAPIN Repro A'
  const type_vente=document.getElementById('comm-r-type')?.value||null; // 'detail' | 'gros' | '' (les deux)
  const montant=+document.getElementById('comm-r-montant')?.value||0;
  if(!montant){ notify('Entre le montant par sac','r'); return; }
  const point_vente = pv||null; // vide = tous les PDV ; sinon nom du PDV
  let espece=null, formule_nom=null;
  if(sel.startsWith('form:')){ formule_nom=sel.slice(5); espece=_commEspece(formule_nom)||null; }
  else if(sel.startsWith('esp:')){ espece=sel.slice(4); }
  const{error}=await SB.from('gp_commissions_regles').insert({
    admin_id:GP_ADMIN_ID, point_vente, espece, formule_nom, type_vente:type_vente||null,
    montant_par_sac:montant, actif:true
  });
  if(error){ notify('Erreur : '+error.message,'r'); return; }
  notify('Règle de commission ajoutée ✓','gold');
  await chargerReglesCommission(true);
  renderCommissions();
}

async function supprimerRegleCommission(id){
  if(!(GP_ROLE==='admin'||GP_EST_GERANT)){ notify('Réservé à l\'admin','r'); return; }
  if(!confirm('Supprimer cette règle de commission ?')) return;
  await SB.from('gp_commissions_regles').delete().eq('id',id).eq('admin_id',GP_ADMIN_ID);
  await chargerReglesCommission(true);
  renderCommissions();
}

// ── RÈGLEMENT (le SEUL moment où la caisse bouge) ──
async function reglerCommissions(pv){
  if(!_commPeutRegler()){ notify('Réservé à l\'admin / au siège','r'); return; }
  const p=_COMM_DETAIL[pv];
  if(!p || p.due<=0){ notify('Rien à régler pour ce PDV','r'); return; }
  const label = pv==='—'?'Production':pv;
  if(!confirm(`Régler ${fmt(p.due)} F de commission à « ${label} » ?\n\nUn mouvement de caisse (sortie) sera créé, et les commissions concernées passeront en « réglée ».`)) return;

  // 1) Sortie de caisse depuis une caisse du siège (Production) — le siège paie la commission.
  try{
    const{data:cSiege}=await SB.from('gp_caisses').select('id,nom')
      .eq('admin_id',GP_ADMIN_ID).eq('actif',true).eq('type','physique').is('point_vente',null).maybeSingle();
    const caisseId=cSiege?.id;
    if(caisseId){
      await SB.from('gp_mouvements_caisse').insert({
        admin_id:GP_ADMIN_ID, caisse_id:caisseId,
        type:'sortie', categorie:'commission_pdv',
        montant:p.due, date_mouvement:today(),
        description:`Commission versée à ${label}`,
        enregistre_par:GP_USER?.id, enregistre_par_nom:GP_USER?.email?.split('@')[0]
      });
    } else {
      notify('⚠ Aucune caisse Production trouvée — commissions marquées réglées sans mouvement de caisse','gold');
    }
  }catch(e){ /* le mouvement de caisse n'est pas bloquant pour le marquage */ }

  // 2) Marquer les commissions dues de ce PDV comme réglées
  const ids=(p.lignes||[]).filter(c=>c.statut!=='regle').map(c=>c.id);
  if(ids.length){
    const{error}=await SB.from('gp_commissions').update({statut:'regle', date_reglement:today()})
      .in('id',ids).eq('admin_id',GP_ADMIN_ID);
    if(error){ notify('Erreur règlement : '+error.message,'r'); return; }
  }
  notify(`✅ ${fmt(p.due)} F de commission réglés à ${label}`,'gold');
  renderCommissions();
}

// Enregistrer le rendu de page
if(typeof PAGE_RENDERERS!=='undefined'){
  PAGE_RENDERERS.commissions = function(){ if(typeof renderCommissions==='function') renderCommissions(); };
}
