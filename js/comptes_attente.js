// ══════════════════════════════════════════════════
// PROVENDA — SALLE D'ATTENTE DES COMPTES
//
// PROVENDA est fermée : personne n'ouvre une provenderie tout seul. Mais un
// prospect qui vient de voir la démonstration doit pouvoir créer son accès et
// attendre qu'on l'appelle — sinon on perd la vente.
//
// Le compte naît donc SANS rien : ni provenderie, ni équipe, ni essai. Il entre
// dans cette liste, et c'est l'administrateur de la plateforme qui décide —
// lui ouvrir sa propre provenderie, ou le rattacher à son équipe.
// ══════════════════════════════════════════════════

function attEsc(s){
  return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function attDate(d){
  if(!d) return '—';
  try{ return new Date(d).toLocaleDateString('fr-FR',{day:'2-digit',month:'short',year:'numeric'}); }
  catch(_){ return String(d).slice(0,10); }
}

// Le bloc n'existe que pour l'administrateur de la plateforme : un propriétaire
// de provenderie cliente n'a rien à voir des prospects des autres.
async function renderComptesAttente(){
  const el = document.getElementById('comptes-attente');
  if(!el) return;
  if(typeof GP_EST_PLATEFORME === 'undefined' || !GP_EST_PLATEFORME){ el.innerHTML=''; return; }

  const { data, error } = await SB.from('gp_comptes_attente')
    .select('*').is('traite_le', null).order('cree_le', { ascending: false }).limit(100);

  if(error){
    // La table peut ne pas exister si la migration n'a pas été jouée : le dire,
    // plutôt que d'afficher une liste vide qui ferait croire qu'aucun prospect n'attend.
    el.innerHTML = `<div class="card" style="border:1px solid rgba(239,68,68,.4)">
      <div style="font-weight:700;color:var(--red);font-size:13px">⏳ Comptes en attente — indisponible</div>
      <div style="font-size:11px;color:var(--textm);margin-top:4px">${attEsc(error.message)}</div></div>`;
    return;
  }

  const L = data || [];
  if(!L.length){
    el.innerHTML = `<div class="card">
      <div style="font-weight:700;font-size:13px">⏳ Comptes en attente</div>
      <div style="font-size:12px;color:var(--textm);margin-top:4px">Personne n'attend une activation.</div></div>`;
    return;
  }

  el.innerHTML = `<div class="card" style="border:1px solid rgba(232,197,71,.45)">
    <div class="card-title"><div class="ct-left"><span>⏳ Comptes en attente — ${L.length}</span></div></div>
    <div style="font-size:11px;color:var(--textm);margin-bottom:8px">
      Ces personnes ont créé un accès et attendent. Appelez-les, puis ouvrez-leur une provenderie
      ou rattachez-les à votre équipe.
    </div>
    <div style="overflow-x:auto"><table class="tbl" style="font-size:11px">
      <thead><tr><th>Personne</th><th>Demandé le</th><th>Souhait</th><th></th></tr></thead>
      <tbody>${L.map(c=>`<tr>
        <td>
          <div style="font-weight:600">${attEsc(c.nom||'—')}</div>
          <div style="font-size:10px;color:var(--textm)">${attEsc(c.email||'')}</div>
          ${c.telephone?`<div style="font-size:10px;color:var(--g6)">📞 ${attEsc(c.telephone)}</div>`:''}
        </td>
        <td style="font-size:10px">${attDate(c.cree_le)}</td>
        <td style="font-size:10px;color:var(--textm)">${attEsc(c.provenderie_souhaitee||'—')}</td>
        <td><div style="display:flex;gap:4px;justify-content:flex-end;flex-wrap:wrap">
          <button class="btn btn-g btn-sm" onclick="attOuvrirProvenderie('${c.user_id}')" style="font-size:10px">🏭 Ouvrir une provenderie</button>
          <button class="btn btn-out btn-sm" onclick="attRattacherEquipe('${c.user_id}')" style="font-size:10px">👥 Mon équipe</button>
          <button class="btn btn-red btn-sm" onclick="attRefuser('${c.user_id}')" style="font-size:10px" title="Écarter sans rien créer">✕</button>
        </div></td>
      </tr>`).join('')}</tbody>
    </table></div>
  </div>`;
}

async function attOuvrirProvenderie(userId){
  const nom = prompt('Nom de la provenderie à ouvrir pour ce client :');
  if(nom === null) return;
  if(!nom.trim()){ notify('Il faut un nom de provenderie','r'); return; }
  const { data, error } = await SB.rpc('gp_activer_provenderie', { p_user: userId, p_nom: nom.trim() });
  if(error || (data && data.error)){
    notify('Activation impossible : ' + (error?.message || data.error), 'r', 8000);
    return;
  }
  notify(`« ${nom.trim()} » est ouverte — prévenez le client qu'il peut se connecter ✓`, 'gold', 9000);
  renderComptesAttente();
}

async function attRattacherEquipe(userId){
  const pdv = prompt('Point de vente où l\'affecter (laisser vide pour le siège) :', '');
  if(pdv === null) return;
  const { data, error } = await SB.rpc('gp_rattacher_equipe', {
    p_user: userId, p_role: 'secretaire', p_pdv: pdv.trim() || null
  });
  if(error || (data && data.error)){
    notify('Rattachement impossible : ' + (error?.message || data.error), 'r', 8000);
    return;
  }
  notify('Rattaché à votre équipe comme secrétaire ✓ — ajustez son rôle dans Équipe', 'gold', 9000);
  renderComptesAttente();
}

async function attRefuser(userId){
  if(!confirm('Écarter cette demande ?\n\nLe compte restera sans accès. Rien n\'est supprimé.')) return;
  const { error } = await SB.from('gp_comptes_attente')
    .update({ traite_le: new Date().toISOString(), resultat: 'refuse' }).eq('user_id', userId);
  if(error){ notify('Erreur : ' + error.message, 'r'); return; }
  notify('Demande écartée', 'gold');
  renderComptesAttente();
}

// Appelé au moment où l'entrée est refusée : c'est le seul instant où l'on est
// SÛR d'avoir une session, donc où la ligne peut s'écrire sous son propre nom.
async function attInscrireEnAttente(user){
  if(!user || !user.id) return;
  const meta = user.user_metadata || {};
  try{
    await SB.from('gp_comptes_attente').upsert({
      user_id: user.id,
      email: user.email || '',
      nom: meta.nom || (user.email||'').split('@')[0],
      telephone: meta.telephone || null,
      provenderie_souhaitee: meta.provenderie || null
    }, { onConflict: 'user_id', ignoreDuplicates: true });
  }catch(_){ /* la salle d'attente ne doit jamais empêcher la déconnexion */ }
}
