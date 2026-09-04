// ══════════════════════════════════════════════════
// PROVENDA — INVENTAIRE PHYSIQUE
// ══════════════════════════════════════════════════

// ── CHARGER / CRÉER UN INVENTAIRE ────────────────
async function renderInventairePhysique(){
  const box=document.getElementById('invp-content');
  const mois=document.getElementById('invp-mois')?.value||thisMonth();
  // Feedback immédiat : le bouton « Charger » réagit toujours (fini le « rien ne se passe »).
  if(box) box.innerHTML='<div style="color:var(--textm);font-size:12px;padding:10px">⏳ Chargement de l\'inventaire de <strong>'+mois+'</strong>…</div>';
  try{
    // Chercher inventaire existant pour ce mois
    const{data:existing,error}=await SB.from('gp_inventaires').select('*')
      .eq('admin_id',GP_ADMIN_ID).eq('mois',mois).maybeSingle();
    if(error) throw error;
    if(existing){
      await afficherInventaireExistant(existing,mois);
    } else {
      await creerNouvelInventaire(mois);
    }
  }catch(e){
    if(box) box.innerHTML='<div style="color:var(--red);font-size:12px;padding:10px">⚠️ Impossible de charger l\'inventaire : '+((e&&e.message)||e)+'<br><span style="color:var(--textm)">Réessaie, ou vérifie ta connexion.</span></div>';
    if(typeof notify==='function') notify('Erreur chargement inventaire','r');
  }
}

// Matières premières RÉELLEMENT UTILISÉES = celles qui entrent dans au moins une formule.
// Le reste (anciens lots, achats ponctuels, essais) encombre l'inventaire sans être consommé.
function _mpUtilisees(){
  const set=new Set();
  try{
    (getAllFormules()||[]).forEach(f=>{
      (f.ingredients||[]).forEach(ing=>{
        const ingData=(typeof trouverIngr==='function') ? trouverIngr(ing) : null;
        set.add(normalizeMpNom(ingData?.nom || ing.nom));
      });
    });
  }catch(e){}
  return set;
}

async function creerNouvelInventaire(mois){
  // Calculer les niveaux théoriques
  const S=await _fetchAllStockMp();
  const niveaux=calcNiveaux(S||[]);

  const utilisees=_mpUtilisees();
  const lignes=Object.entries(niveaux)
    .filter(([nom,qte])=>qte>0)
    .map(([nom,qte])=>{
      const ingr=GP_INGREDIENTS.find(i=>i.nom===nom);
      return{nom,qte_theorique:Math.max(0,qte),prix:ingr?.prix_actuel||0,
             utilisee:utilisees.has(normalizeMpNom(nom))};
    })
    // Les matières utilisées d'abord, alphabétiques dans chaque groupe.
    .sort((a,b)=> (b.utilisee-a.utilisee) || a.nom.localeCompare(b.nom));

  document.getElementById('invp-content').innerHTML=`
    <div style="background:rgba(22,163,74,.06);border:1px solid rgba(22,163,74,.2);border-radius:8px;padding:12px;margin-bottom:14px;font-size:12px;color:var(--textm)">
      📋 Inventaire physique pour <strong style="color:var(--text)">${mois}</strong> — Saisissez les quantités réelles
    </div>
    <div style="overflow-x:auto"><table class="tbl" style="font-size:11px" id="invp-table">
      <thead><tr>
        <th>Ingrédient</th>
        <th class="num">Qté théorique (kg)</th>
        <th class="num">Qté physique (kg) *</th>
        <th class="num">Écart</th>
        <th class="num">Prix/kg</th>
        <th class="num">Coût écart</th>
      </tr></thead>
      <tbody>
      ${lignes.map((l,i)=>`${(i===0||lignes[i-1].utilisee!==l.utilisee) ? `<tr><td colspan="6" style="background:var(--card2);font-weight:700;font-size:11px;padding:7px 8px;border-top:2px solid var(--border)">${l.utilisee?'✅ Matières utilisées dans les formules ('+lignes.filter(x=>x.utilisee).length+')':'💤 Non utilisées dans aucune formule ('+lignes.filter(x=>!x.utilisee).length+')'}</td></tr>` : ''}<tr id="invp-row-${l.nom.replace(/\s/g,'-')}">
        <td style="font-weight:600">${l.nom}</td>
        <td class="num" style="color:var(--textm)">${fmtKg(l.qte_theorique)}</td>
        <td class="num">
          <input type="number" class="invp-physique" data-nom="${l.nom}"
            data-theorique="${l.qte_theorique}" data-prix="${l.prix}"
            value="" placeholder="${l.qte_theorique.toFixed(1)}" step="0.1"
            title="Laisse vide = garder le stock actuel · Saisis le vrai comptage pour corriger"
            style="width:100px;text-align:right;font-size:11px;padding:3px 6px"
            oninput="calcEcartLigne(this)">
        </td>
        <td class="num" id="ecart-${l.nom.replace(/\s/g,'-')}">0</td>
        <td class="num" style="color:var(--textm)">${fmt(l.prix)}</td>
        <td class="num" id="cout-ecart-${l.nom.replace(/\s/g,'-')}" style="color:var(--textm)">0</td>
      </tr>`).join('')}
      </tbody>
      <tfoot>
        <tr style="font-weight:700;background:rgba(239,68,68,.05)">
          <td colspan="5">COÛT TOTAL DES ÉCARTS</td>
          <td class="num" id="invp-total-cout" style="color:var(--red)">0 F</td>
        </tr>
      </tfoot>
    </table></div>
    <div class="fr" style="margin-top:12px"><label>Note de l'inventaire</label>
      <textarea id="invp-note" rows="2" placeholder="Observations, conditions de l'inventaire..."></textarea>
    </div>
    <div style="display:flex;gap:8px;margin-top:10px">
      <button class="btn btn-g" onclick="sauvegarderInventairePhysique('${mois}')" style="flex:1;justify-content:center">
        💾 Sauvegarder et soumettre
      </button>
      <button class="btn btn-print" onclick="imprimerFicheInventaire('${mois}')" style="flex:1;justify-content:center">
        🖨️ Imprimer la fiche
      </button>
    </div>`;
}

function calcEcartLigne(input){
  const nom=input.dataset.nom;
  const theorique=parseFloat(input.dataset.theorique)||0;
  const prix=parseFloat(input.dataset.prix)||0;
  // Champ vide = pas de comptage → on garde le théorique (écart 0, pas de mise à 0 accidentelle)
  const physique=(String(input.value).trim()==='')?theorique:(parseFloat(input.value)||0);
  const ecart=physique-theorique;
  const coutEcart=Math.abs(ecart)*prix;
  const key=nom.replace(/\s/g,'-');

  const ecartEl=document.getElementById('ecart-'+key);
  const coutEl=document.getElementById('cout-ecart-'+key);
  if(ecartEl){
    ecartEl.textContent=(ecart>=0?'+':'')+ecart.toFixed(1)+' kg';
    ecartEl.style.color=ecart<0?'var(--red)':ecart>0?'var(--green)':'var(--textm)';
  }
  if(coutEl){
    coutEl.textContent=ecart!==0?fmt(coutEcart)+' F':'0';
    coutEl.style.color=ecart<0?'var(--red)':'var(--textm)';
  }

  // Recalculer total
  let total=0;
  document.querySelectorAll('.invp-physique').forEach(inp=>{
    const t=parseFloat(inp.dataset.theorique)||0;
    const p2=parseFloat(inp.dataset.prix)||0;
    const ph=(String(inp.value).trim()==='')?t:(parseFloat(inp.value)||0);
    total+=Math.abs(ph-t)*p2;
  });
  const totalEl=document.getElementById('invp-total-cout');
  if(totalEl)totalEl.textContent=fmt(total)+' F';
}

async function sauvegarderInventairePhysique(mois){
  const note=document.getElementById('invp-note')?.value.trim()||null;
  const inputs=document.querySelectorAll('.invp-physique');
  if(!inputs.length){notify('Aucune donnée à sauvegarder','r');return;}

  let coutTotal=0;
  const lignes=[];
  inputs.forEach(inp=>{
    const nom=inp.dataset.nom;
    const theorique=parseFloat(inp.dataset.theorique)||0;
    const prix=parseFloat(inp.dataset.prix)||0;
    // Champ vide = pas recompté → on conserve le stock actuel (physique = théorique, écart 0)
    const physique=(String(inp.value).trim()==='')?theorique:(parseFloat(inp.value)||0);
    const ecart=physique-theorique;
    const coutEcart=Math.abs(ecart)*prix;
    coutTotal+=coutEcart;
    lignes.push({admin_id:GP_ADMIN_ID,ingredient_nom:nom,
      qte_theorique:theorique,qte_physique:physique,
      ecart,prix_unitaire:prix,cout_ecart:coutEcart});
  });

  // Créer l'inventaire
  const{data:inv,error}=await SB.from('gp_inventaires').insert({
    admin_id:GP_ADMIN_ID,mois,
    date_inventaire:today(),
    saisi_par:GP_USER.id,
    saisi_par_nom:GP_USER.email?.split('@')[0]||'—',
    statut:'soumis',note,
    cout_ecart_total:coutTotal
  }).select().maybeSingle();

  if(error){notify('Erreur: '+error.message,'r');return;}

  // Insérer les lignes
  await SB.from('gp_inventaires_lignes').insert(
    lignes.map(l=>({...l,inventaire_id:inv.id}))
  );

  notify('Inventaire soumis — en attente de validation ✓','gold');
  await renderInventairePhysique();
}

// ── AFFICHER INVENTAIRE EXISTANT ─────────────────
async function afficherInventaireExistant(inv,mois){
  const{data:lignes}=await SB.from('gp_inventaires_lignes').select('*')
    .eq('inventaire_id',inv.id).order('ingredient_nom');
  const L=lignes||[];
  const ecarts=L.filter(l=>Math.abs(l.ecart)>0.1);
  const peutValider=GP_ROLE==='admin'&&inv.saisi_par!==GP_USER.id&&inv.statut==='soumis';

  document.getElementById('invp-content').innerHTML=`
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;flex-wrap:wrap;gap:8px">
      <div>
        <span class="badge ${inv.statut==='valide'?'bdg-g':inv.statut==='soumis'?'bdg-gold':'bdg-r'}" style="font-size:11px">${inv.statut.toUpperCase()}</span>
        <span style="font-size:11px;color:var(--textm);margin-left:8px">Saisi par ${inv.saisi_par_nom||'—'}</span>
        ${inv.valide_par_nom?`<span style="font-size:11px;color:var(--green);margin-left:8px">· Validé par ${inv.valide_par_nom}</span>`:''}
      </div>
      <div style="display:flex;gap:6px">
        ${peutValider?`
          <button class="btn btn-g btn-sm" onclick="validerInventaire('${inv.id}')">✅ Valider</button>
          <button class="btn btn-red btn-sm" onclick="refuserInventaire('${inv.id}')">✕ Refuser</button>`:''}
        ${GP_ROLE==='admin'&&inv.statut==='valide'&&ecarts.length?`<button class="btn btn-out btn-sm" onclick="reappliquerStockInventaire('${inv.id}')" title="Corrige le stock si l'ajustement n'avait pas pris">🔄 Ré-appliquer au stock</button>`:''}
        <button class="btn btn-print btn-sm" onclick="imprimerFicheInventaire('${mois}')">🖨️ Imprimer</button>
        ${inv.statut!=='valide'&&inv.saisi_par===GP_USER.id?`<button class="btn btn-red btn-sm" onclick="supprimerInventaire('${inv.id}')">🗑️ Refaire</button>`:''}
      </div>
    </div>

    ${ecarts.length?`<div style="background:rgba(239,68,68,.06);border:1px solid rgba(239,68,68,.2);border-radius:8px;padding:10px;margin-bottom:12px">
      <div style="font-size:11px;font-weight:700;color:var(--red);margin-bottom:4px">⚠ ${ecarts.length} écart(s) détecté(s) — Coût total : ${fmt(inv.cout_ecart_total)} F</div>
    </div>`:'<div style="background:rgba(22,163,74,.06);border:1px solid rgba(22,163,74,.2);border-radius:8px;padding:8px;margin-bottom:12px;font-size:11px;color:var(--green)">✅ Aucun écart — Inventaire conforme</div>'}

    <div style="overflow-x:auto"><table class="tbl" style="font-size:11px">
      <thead><tr>
        <th>Ingrédient</th>
        <th class="num">Théorique</th>
        <th class="num">Physique</th>
        <th class="num">Écart</th>
        <th class="num">Coût écart</th>
      </tr></thead>
      <tbody>
      ${L.map(l=>`<tr>
        <td style="font-weight:600">${l.ingredient_nom}</td>
        <td class="num" style="color:var(--textm)">${fmtKg(l.qte_theorique)}</td>
        <td class="num">${fmtKg(l.qte_physique)}</td>
        <td class="num" style="color:${l.ecart<-0.1?'var(--red)':l.ecart>0.1?'var(--green)':'var(--textm)'}">${l.ecart>=0?'+':''}${fmtKg(l.ecart)}</td>
        <td class="num" style="color:${Math.abs(l.ecart)>0.1?'var(--red)':'var(--textm)'}">${Math.abs(l.ecart)>0.1?fmt(l.cout_ecart)+' F':'—'}</td>
      </tr>`).join('')}
      <tr style="font-weight:700"><td colspan="4">COÛT TOTAL ÉCARTS</td>
        <td class="num" style="color:var(--red)">${fmt(inv.cout_ecart_total)} F</td>
      </tr>
      </tbody>
    </table></div>
    ${inv.note?`<div style="margin-top:10px;font-size:11px;color:var(--textm)">📝 ${inv.note}</div>`:''}`;
}

// ── VALIDATION PAR ADMIN DIFFÉRENT ───────────────
// Applique au stock les écarts d'un inventaire — ROBUSTE + IDEMPOTENT.
// - un seul champ `ref` (comme la réception qui marche) : plus de champ `note` hors-schéma qui
//   faisait planter tout l'insert en silence ;
// - le SENS (excédent/manque) est porté par le type ('entree'/'sortie') ET par la ref ;
// - ne ré-insère PAS un ingrédient déjà ajusté pour ce mois (rattrapage sans double comptage) ;
// - renvoie {ok, error, inserted, skipped} — l'appelant DÉCIDE (fini l'échec silencieux).
async function _appliquerAjustementStockInventaire(inv, lignes){
  const avecEcarts=(lignes||[]).filter(l=>Math.abs(l.ecart)>0.1);
  if(!avecEcarts.length) return {ok:true,inserted:0,skipped:0};
  const refBase='Inventaire physique '+inv.mois;
  // Idempotence : quels ingrédients ont DÉJÀ un mouvement d'ajustement pour ce mois ?
  const {data:deja}=await SB.from('gp_stock_mp').select('ingredient_nom,ref')
    .eq('admin_id',GP_ADMIN_ID).like('ref',refBase+'%');
  const dejaSet=new Set((deja||[]).map(m=>m.ingredient_nom));
  // Rattachement ROBUSTE à la fiche MP (nom exact, sinon nom normalisé) : sans ingredient_id
  // le mouvement se détache de sa fiche et fausse les niveaux.
  const _norm=(s)=>(typeof normalizeMpNom==='function')?normalizeMpNom(s):String(s||'').trim().toLowerCase();
  const _fiche=(nom)=>(GP_INGREDIENTS||[]).find(i=>i.nom===nom)
                  ||(GP_INGREDIENTS||[]).find(i=>_norm(i.nom)===_norm(nom))||null;
  let inserted=0, skipped=0; const erreurs=[];
  for(const l of avecEcarts){
    const fiche=_fiche(l.ingredient_nom);
    const nom=fiche?.nom||l.ingredient_nom;
    if(dejaSet.has(nom)){ skipped++; continue; }
    const row={
      admin_id:GP_ADMIN_ID,saisi_par:GP_USER.id,
      // ⚠️ La base a une contrainte CHECK sur `type` : 'sortie' est REFUSÉ (l'app utilise
      // 'entree' / 'sortie_production' / 'ajustement'). calcNiveaux ajoute 'entree' et
      // retranche tout le reste → excédent='entree', manque='ajustement'.
      type:l.ecart>0?'entree':'ajustement',date:today(),
      ingredient_id:fiche?.id||null,
      ingredient_nom:nom,
      quantite:Math.abs(l.ecart),
      prix_unit:l.prix_unitaire,
      ref:refBase+(l.ecart>0?' (excédent)':' (manque)')
    };
    // Ligne par ligne : une MP problématique ne fait plus échouer les 14 autres.
    const {error}=await SB.from('gp_stock_mp').insert(row);
    if(error) erreurs.push(nom+' → '+(error.message||'erreur'));
    else inserted++;
  }
  return {ok:erreurs.length===0,inserted,skipped,erreurs};
}

async function validerInventaire(invId){
  const{data:inv}=await SB.from('gp_inventaires').select('*').eq('id',invId).maybeSingle();
  if(!inv)return;
  if(inv.saisi_par===GP_USER.id){
    notify('Vous ne pouvez pas valider votre propre inventaire','r');
    return;
  }
  const{data:lignes}=await SB.from('gp_inventaires_lignes').select('*').eq('inventaire_id',invId);
  const avecEcarts=(lignes||[]).filter(l=>Math.abs(l.ecart)>0.1);
  if(avecEcarts.length){
    if(!confirm(`Cet inventaire a ${avecEcarts.length} écart(s).\nValider va ajuster le stock automatiquement.\n\nConfirmer ?`))return;
    // ATOMIQUE : si l'ajustement du stock échoue, on N'ENREGISTRE PAS « validé »
    // (fini l'inventaire marqué validé alors que le stock n'a pas bougé).
    const res=await _appliquerAjustementStockInventaire(inv,lignes);
    if(!res.ok){
      notify('⚠️ Ajustement du stock ÉCHOUÉ — inventaire NON validé. '+(res.erreurs[0]||''),'r');
      return;
    }
  }
  await SB.from('gp_inventaires').update({
    statut:'valide',
    valide_par:GP_USER.id,
    valide_par_nom:GP_USER.email?.split('@')[0]||'—'
  }).eq('id',invId);
  notify('Inventaire validé et stock ajusté ✓','gold');
  await renderInventairePhysique();
}

// Rattrapage : ré-applique au stock un inventaire DÉJÀ validé dont l'ajustement n'a pas pris
// (ex. échec silencieux d'avant le correctif). Idempotent : ne double jamais un ajustement déjà fait.
async function reappliquerStockInventaire(invId){
  if(GP_ROLE!=='admin'){ notify('Réservé à l\'administrateur','r'); return; }
  const{data:inv}=await SB.from('gp_inventaires').select('*').eq('id',invId).maybeSingle();
  if(!inv)return;
  const{data:lignes}=await SB.from('gp_inventaires_lignes').select('*').eq('inventaire_id',invId);
  const res=await _appliquerAjustementStockInventaire(inv,lignes);
  await renderInventairePhysique();
  // Bandeau PERSISTANT : le toast disparaît trop vite pour être lu (et pour diagnostiquer).
  const box=document.getElementById('invp-content');
  if(box){
    const ok=res.ok&&res.inserted>0, rien=res.ok&&res.inserted===0;
    const coul=ok?'22,163,74':rien?'232,197,71':'239,68,68';
    const titre=ok?'✅ Stock ajusté':rien?'ℹ️ Rien à ré-appliquer':'⚠️ Ajustement incomplet';
    box.insertAdjacentHTML('afterbegin',
      '<div style="background:rgba('+coul+',.08);border:1px solid rgba('+coul+',.35);border-radius:8px;padding:10px;margin-bottom:12px;font-size:12px">'
      +'<b>'+titre+'</b> — '+res.inserted+' ligne(s) appliquée(s)'
      +(res.skipped?' · '+res.skipped+' déjà faite(s)':'')
      +(res.erreurs.length?'<br><b>Erreurs :</b><br>'+res.erreurs.slice(0,6).map(e=>'• '+e).join('<br>'):'')
      +(ok?'<br><span style="color:var(--textm)">Vérifie dans <b>Stock → Mouvements</b> (réf. « '+('Inventaire physique '+inv.mois)+' »).</span>':'')
      +'</div>');
  }
}

async function refuserInventaire(invId){
  await SB.from('gp_inventaires').update({statut:'refuse'}).eq('id',invId);
  notify('Inventaire refusé — à refaire','r');
  await renderInventairePhysique();
}

async function supprimerInventaire(invId){
  if(!confirm('Supprimer cet inventaire et le refaire ?'))return;
  await SB.from('gp_inventaires_lignes').delete().eq('inventaire_id',invId);
  await SB.from('gp_inventaires').delete().eq('id',invId);
  await renderInventairePhysique();
}

// ── IMPRESSION FICHE D'INVENTAIRE ─────────────────
async function imprimerFicheInventaire(mois){
  const{data:inv}=await SB.from('gp_inventaires').select('*')
    .eq('admin_id',GP_ADMIN_ID).eq('mois',mois).maybeSingle();
  const cfg=GP_CONFIG||{};
  const date=new Date().toLocaleDateString('fr-FR',{day:'2-digit',month:'long',year:'numeric'});

  let lignesHtml='';
  if(inv){
    const{data:lignes}=await SB.from('gp_inventaires_lignes').select('*')
      .eq('inventaire_id',inv.id).order('ingredient_nom');
    // Même ordre que l'écran : les matières utilisées en tête. C'est la feuille qu'on
    // emporte pour compter — celles qu'on ne consomme jamais ne doivent pas ouvrir la liste.
    const _ut=_mpUtilisees();
    const _tri=(lignes||[]).slice().sort((a,b)=>{
      const ua=_ut.has(normalizeMpNom(a.ingredient_nom))?1:0;
      const ub=_ut.has(normalizeMpNom(b.ingredient_nom))?1:0;
      return (ub-ua) || String(a.ingredient_nom).localeCompare(String(b.ingredient_nom));
    });
    lignesHtml=_tri.map(l=>`
      <tr>
        <td>${l.ingredient_nom}</td>
        <td style="text-align:right">${fmtKg(l.qte_theorique)}</td>
        <td style="text-align:right;border:1px solid #ccc;background:#f9f9f9">&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</td>
        <td style="text-align:right;color:${l.ecart<-0.1?'#dc2626':l.ecart>0.1?'#16a34a':'#000'}">${l.ecart>=0?'+':''}${fmtKg(l.ecart)}</td>
        <td style="text-align:right;color:${Math.abs(l.ecart)>0.1?'#dc2626':'#000'}">${Math.abs(l.ecart)>0.1?fmt(l.cout_ecart)+' F':'—'}</td>
      </tr>`).join('');
  }

  const html=`<!DOCTYPE html><html><head><meta charset="UTF-8">
    <title>Fiche Inventaire ${mois}</title>
    <style>
      @page{size:A4;margin:12mm}
      body{font-family:Arial,sans-serif;font-size:11px;color:#000}
      .header{display:flex;justify-content:space-between;border-bottom:2px solid #1b5e20;padding-bottom:8px;margin-bottom:12px}
      h1{font-size:16px;font-weight:bold;color:#1b5e20}
      table{width:100%;border-collapse:collapse;margin-top:8px}
      th{background:#1b5e20;color:#fff;padding:5px;text-align:left}
      td{padding:4px 5px;border-bottom:1px solid #eee}
      .signature{margin-top:30px;display:grid;grid-template-columns:1fr 1fr 1fr;gap:20px}
      .sig-box{border-top:1px solid #000;padding-top:6px;text-align:center;font-size:10px}
      @media print{button{display:none}}
    </style></head><body>
    <div class="header">
      <div><h1>${cfg.nom_provenderie||'PROVENDA'}</h1><div>Fiche d'inventaire physique</div></div>
      <div style="text-align:right"><div>Mois : <strong>${mois}</strong></div><div>Date : ${date}</div></div>
    </div>
    <table>
      <thead><tr><th>Ingrédient</th><th>Qté théorique (kg)</th><th>Qté physique (kg)</th><th>Écart</th><th>Coût écart</th></tr></thead>
      <tbody>${lignesHtml||'<tr><td colspan="5" style="text-align:center;color:#999">Aucune donnée</td></tr>'}</tbody>
    </table>
    <div class="signature">
      <div class="sig-box">Responsable inventaire<br><br><br>Nom & Signature</div>
      <div class="sig-box">Validé par (admin)<br><br><br>Nom & Signature</div>
      <div class="sig-box">Date de validation<br><br><br>_______________</div>
    </div>
    <div style="text-align:center;margin-top:16px">
      <button onclick="window.print()" style="padding:8px 20px;background:#1b5e20;color:#fff;border:none;border-radius:6px;cursor:pointer">🖨️ Imprimer</button>
    </div>
    </body></html>`;

  const w=window.open('','_blank','width=900,height=700');
  w.document.write(html);
  w.document.close();
}
