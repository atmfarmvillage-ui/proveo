// ══════════════════════════════════════════════════
// PROVENDA — RÉSERVATIONS (PDV) + AVIS (direction)
// Reçues depuis la carte de fidélité. Notif Realtime in-app.
// ══════════════════════════════════════════════════

let GP_RESA_CHANNEL = null;
let GP_FB_CHANNEL   = null;

// ── Périmètre par rôle ────────────────────────────
// (gérant → GP_ROLE='admin' déjà, cf auth.js)
function canSeeResa(){ return GP_ROLE === 'admin' || GP_ROLE === 'secretaire'; }
function canSeeAvis(){ return ['admin','directeur','daf'].includes(GP_ROLE); }

// Une réservation est-elle dans le périmètre de l'utilisateur courant ?
function resaInScope(r){
  if(GP_ROLE === 'admin') return true;            // admin/gérant : tout le réseau
  if(!GP_POINT_VENTE) return true;                // secrétaire centrale : tout
  return r.pdv_nom === GP_POINT_VENTE;            // secrétaire PDV : son PDV
}

// ── Helpers temps ─────────────────────────────────
function _resaTimeAgo(d){
  const s = Math.floor((Date.now() - new Date(d).getTime())/1000);
  if(s < 60)    return "à l'instant";
  if(s < 3600)  return 'il y a ' + Math.floor(s/60) + ' min';
  if(s < 86400) return 'il y a ' + Math.floor(s/3600) + ' h';
  return 'il y a ' + Math.floor(s/86400) + ' j';
}
function _resaExpireIn(d){
  const s = Math.floor((new Date(d).getTime() - Date.now())/1000);
  if(s <= 0)   return 'expirée';
  if(s < 3600) return 'expire dans ' + Math.floor(s/60) + ' min';
  return 'expire dans ' + Math.floor(s/3600) + ' h';
}

// ── Badge nav ─────────────────────────────────────
function _setNavBadge(id, n){
  const b = document.getElementById(id);
  if(!b) return;
  if(n > 0){ b.textContent = n > 99 ? '99+' : String(n); b.style.display = 'inline-flex'; }
  else b.style.display = 'none';
}

// ── Petit son d'alerte (pas d'asset, Web Audio) ───
function _resaPing(){
  try{
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if(!Ctx) return;
    const ctx = new Ctx();
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.connect(g); g.connect(ctx.destination);
    o.type = 'sine'; o.frequency.value = 880;
    g.gain.setValueAtTime(0.001, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.2, ctx.currentTime + 0.02);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
    o.start(); o.stop(ctx.currentTime + 0.42);
    o.onended = ()=>{ try{ ctx.close(); }catch(e){} };
  }catch(e){ /* audio bloqué tant qu'aucune interaction : on ignore */ }
}

// ══════════════════════════════════════════════════
// RÉSERVATIONS
// ══════════════════════════════════════════════════
async function refreshResaBadge(){
  if(!GP_ADMIN_ID || !canSeeResa()) return;
  try{
    const { data } = await SB.from('gp_reservations')
      .select('id,pdv_nom,statut')
      .eq('admin_id', GP_ADMIN_ID).eq('statut','en_attente')
      .gt('expire_at', new Date().toISOString());
    const rows = (data||[]).filter(resaInScope);
    _setNavBadge('nav-badge-resa', rows.length);
  }catch(e){ /* silencieux */ }
}

async function renderReservations(){
  if(!GP_ADMIN_ID) return;
  const liste = document.getElementById('resa-liste');
  const { data } = await SB.from('gp_reservations').select('*')
    .eq('admin_id', GP_ADMIN_ID)
    .in('statut', ['en_attente','confirmee'])
    .gt('expire_at', new Date().toISOString())
    .order('created_at', { ascending:false });
  const R = (data||[]).filter(resaInScope);

  // Téléphones clients (pour le bouton Appeler)
  const ids = [...new Set(R.map(r=>r.client_id).filter(Boolean))];
  const telMap = {};
  if(ids.length){
    try{
      const { data:cl } = await SB.from('gp_clients').select('id,telephone').in('id', ids);
      (cl||[]).forEach(c=>{ telMap[c.id] = c.telephone; });
    }catch(e){ /* la secrétaire a normalement accès ; sinon pas de tél */ }
  }

  // KPIs
  const nNew  = R.filter(r=>r.statut==='en_attente').length;
  const nConf = R.filter(r=>r.statut==='confirmee').length;
  const totalSacs = R.reduce((s,r)=>s + (r.items||[]).reduce((a,i)=>a + Number(i.nb_sacs||0), 0), 0);
  const kpis = document.getElementById('resa-kpis');
  if(kpis) kpis.innerHTML = `
    <div class="econo-box"><div class="econo-val" style="color:var(--gold)">${nNew}</div><div class="econo-lbl">À confirmer</div></div>
    <div class="econo-box"><div class="econo-val" style="color:var(--green)">${nConf}</div><div class="econo-lbl">Confirmées</div></div>
    <div class="econo-box"><div class="econo-val">${totalSacs}</div><div class="econo-lbl">Sacs réservés</div></div>`;

  if(!liste) return;
  liste.innerHTML = R.length ? R.map(r=>{
    const items = (r.items||[]).map(i=>`${i.nb_sacs} sac${Number(i.nb_sacs)>1?'s':''} ${i.formule}`).join(' · ');
    const isNew = r.statut === 'en_attente';
    const badge = isNew
      ? '<span class="badge bdg-gold">⏳ À confirmer</span>'
      : '<span class="badge bdg-g">✅ Confirmée</span>';
    const tel = telMap[r.client_id];
    const telClean = tel ? String(tel).replace(/\s/g,'') : '';
    return `<div class="card" style="border-left:3px solid ${isNew?'var(--gold)':'var(--green)'}">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:10px">
        <div style="min-width:0">
          <div style="font-weight:700;font-size:13px">${r.client_nom||'Client'} ${badge}</div>
          <div style="font-size:11px;color:var(--textm);margin-top:2px">📍 ${r.pdv_nom} · ${_resaTimeAgo(r.created_at)} · ${_resaExpireIn(r.expire_at)}</div>
          <div style="margin-top:6px;font-size:12px;font-weight:600">${items||'—'}</div>
        </div>
        <div style="display:flex;gap:6px;flex-wrap:wrap">
          ${isNew?`<button class="btn btn-g btn-sm" onclick="confirmerResa('${r.id}')">✅ Confirmer</button>`:''}
          ${telClean?`<a class="btn btn-out btn-sm" href="tel:${telClean}">📞 Appeler</a>`:''}
          <button class="btn btn-g btn-sm" onclick="recupererResa('${r.id}')">📦 Récupérée</button>
          <button class="btn btn-red btn-sm" onclick="annulerResa('${r.id}')">❌ Annuler</button>
        </div>
      </div>
    </div>`;
  }).join('') : '<div class="card" style="text-align:center;color:var(--textm);font-size:13px;padding:20px">✅ Aucune réservation active.</div>';
}

async function confirmerResa(id){
  await SB.from('gp_reservations').update({
    statut:'confirmee', confirme_par:GP_USER?.id, confirme_at:new Date().toISOString()
  }).eq('id', id);
  notify('Réservation confirmée ✓','gold');
  renderReservations(); refreshResaBadge();
}
async function recupererResa(id){
  if(!confirm('Marquer cette réservation comme RÉCUPÉRÉE (le client est venu, vente encaissée) ?')) return;
  await SB.from('gp_reservations').update({ statut:'recuperee' }).eq('id', id);
  notify('Réservation récupérée ✓','gold');
  renderReservations(); refreshResaBadge();
}
async function annulerResa(id){
  if(!confirm('Annuler cette réservation ? Le stock sera de nouveau disponible pour les autres.')) return;
  await SB.from('gp_reservations').update({ statut:'annulee' }).eq('id', id);
  notify('Réservation annulée','r');
  renderReservations(); refreshResaBadge();
}

// ══════════════════════════════════════════════════
// AVIS & RÉCLAMATIONS (direction)
// ══════════════════════════════════════════════════
async function refreshAvisBadge(){
  if(!GP_ADMIN_ID || !canSeeAvis()) return;
  try{
    const { data } = await SB.from('gp_feedback')
      .select('id').eq('admin_id', GP_ADMIN_ID).eq('statut','nouveau');
    _setNavBadge('nav-badge-avis', (data||[]).length);
  }catch(e){ /* silencieux */ }
}

async function renderAvis(){
  if(!GP_ADMIN_ID || !canSeeAvis()) return;
  const liste = document.getElementById('avis-liste');
  const { data } = await SB.from('gp_feedback').select('*')
    .eq('admin_id', GP_ADMIN_ID)
    .order('created_at', { ascending:false }).limit(100);
  const F = data || [];

  const nNew = F.filter(f=>f.statut==='nouveau').length;
  const nPlaintes = F.filter(f=>f.type==='plainte').length;
  const nSugg = F.filter(f=>f.type==='suggestion').length;
  const kpis = document.getElementById('avis-kpis');
  if(kpis) kpis.innerHTML = `
    <div class="econo-box"><div class="econo-val" style="color:var(--gold)">${nNew}</div><div class="econo-lbl">Nouveaux</div></div>
    <div class="econo-box"><div class="econo-val" style="color:var(--red)">${nPlaintes}</div><div class="econo-lbl">Réclamations</div></div>
    <div class="econo-box"><div class="econo-val" style="color:var(--green)">${nSugg}</div><div class="econo-lbl">Suggestions</div></div>`;

  if(!liste) return;
  liste.innerHTML = F.length ? F.map(f=>{
    const who = f.anonyme ? '🕶 Anonyme' : (f.client_nom || 'Client');
    const typeBadge = f.type==='plainte'
      ? '<span class="badge bdg-r">😟 Réclamation</span>'
      : '<span class="badge bdg-gold">💡 Suggestion</span>';
    const isNew = f.statut === 'nouveau';
    const statutTxt = f.statut==='nouveau' ? '🆕 Nouveau' : (f.statut==='lu' ? '👁 Lu' : '✅ Traité');
    const d = new Date(f.created_at).toLocaleString('fr-FR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'});
    return `<div class="card" style="border-left:3px solid ${f.type==='plainte'?'var(--red)':'var(--gold)'};${isNew?'':'opacity:.8'}">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:8px">
        <div style="min-width:0">
          <div style="font-weight:700;font-size:13px">${typeBadge} ${who}</div>
          <div style="font-size:11px;color:var(--textm);margin-top:2px">${f.pdv_nom?'📍 '+f.pdv_nom+' · ':''}${d} · ${statutTxt}</div>
        </div>
        <div style="display:flex;gap:6px;flex-wrap:wrap">
          ${f.statut!=='traite'?`<button class="btn btn-g btn-sm" onclick="traiterAvis('${f.id}')">✅ Traité</button>`:''}
          <button class="btn btn-out btn-sm" onclick="repondreAvis('${f.id}')">✍️ Note</button>
        </div>
      </div>
      <div style="margin-top:8px;font-size:13px;line-height:1.45;white-space:pre-wrap">${(f.message||'').replace(/</g,'&lt;')}</div>
      ${f.reponse?`<div style="margin-top:6px;font-size:12px;color:var(--textm);border-top:1px dashed var(--border2);padding-top:6px">📝 ${(f.reponse||'').replace(/</g,'&lt;')}</div>`:''}
    </div>`;
  }).join('') : '<div class="card" style="text-align:center;color:var(--textm);font-size:13px;padding:20px">Aucun avis pour le moment.</div>';
}

async function traiterAvis(id){
  await SB.from('gp_feedback').update({
    statut:'traite', traite_par:GP_USER?.id, traite_at:new Date().toISOString()
  }).eq('id', id);
  notify('Avis marqué traité ✓','gold');
  renderAvis(); refreshAvisBadge();
}
async function repondreAvis(id){
  const t = prompt('Note interne / réponse :');
  if(t === null) return;
  await SB.from('gp_feedback').update({
    reponse:t, statut:'traite', traite_par:GP_USER?.id, traite_at:new Date().toISOString()
  }).eq('id', id);
  notify('Note enregistrée ✓','gold');
  renderAvis(); refreshAvisBadge();
}

// ══════════════════════════════════════════════════
// REALTIME + INIT (appelé au boot, cf auth.js)
// ══════════════════════════════════════════════════
function initReservationsRealtime(){
  if(!GP_ADMIN_ID || !SB) return;

  refreshResaBadge();
  refreshAvisBadge();

  // Réservations
  if(canSeeResa()){
    if(GP_RESA_CHANNEL) SB.removeChannel(GP_RESA_CHANNEL);
    GP_RESA_CHANNEL = SB.channel('resa-'+GP_ADMIN_ID)
      .on('postgres_changes', {
        event:'*', schema:'public', table:'gp_reservations',
        filter:'admin_id=eq.'+GP_ADMIN_ID
      }, (payload)=>{
        const r = payload.new || payload.old || {};
        if(!resaInScope(r)) return;
        refreshResaBadge();
        if(payload.eventType === 'INSERT'){
          notify('🔔 Nouvelle réservation — ' + (r.client_nom||'client'), 'gold');
          _resaPing();
        }
        const active = document.querySelector('.page.active');
        if(active && active.id === 'page-reservations') renderReservations();
      }).subscribe();
  }

  // Avis (direction)
  if(canSeeAvis()){
    if(GP_FB_CHANNEL) SB.removeChannel(GP_FB_CHANNEL);
    GP_FB_CHANNEL = SB.channel('fb-'+GP_ADMIN_ID)
      .on('postgres_changes', {
        event:'*', schema:'public', table:'gp_feedback',
        filter:'admin_id=eq.'+GP_ADMIN_ID
      }, (payload)=>{
        refreshAvisBadge();
        if(payload.eventType === 'INSERT'){
          const r = payload.new || {};
          notify('💬 Nouvel avis ' + (r.type==='plainte'?'(réclamation)':'(suggestion)'), 'gold');
          _resaPing();
        }
        const active = document.querySelector('.page.active');
        if(active && active.id === 'page-avis') renderAvis();
      }).subscribe();
  }
}

// Enregistrement des pages (ce script est chargé APRÈS auth.js)
if(typeof PAGE_RENDERERS !== 'undefined'){
  PAGE_RENDERERS.reservations = renderReservations;
  PAGE_RENDERERS.avis = renderAvis;
}
