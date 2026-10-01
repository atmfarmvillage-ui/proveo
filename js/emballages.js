// ══════════════════════════════════════════════════
// PROVENDA — EMBALLAGES
// « Des fois l'emballage finit sans qu'on ne sache. » Le stock n'est que le
// moyen ; ce qu'on veut, c'est l'alerte AVANT la rupture.
//
// Ce qui rend ce module tenable : l'app connaît DÉJÀ la consommation. Quand la
// production déclare « 10 sacs de 25 kg, 20 de 15, 5 de 50 », c'est exactement
// ce qui est sorti du magasin d'emballages. La sortie se déduit donc toute
// seule, et sur la DIFFÉRENCE seulement — corriger les sacs obtenus ne doit pas
// décompter deux fois. Un stock qu'il faut nourrir à la main à chaque
// production est abandonné en un mois ; celui-ci se tient à jour tout seul.
//
// Trois façons de consommer, déclarées par l'article :
//   • espece + format_kg → « Sac Lapin 25 kg » : toutes les formules lapin
//                          produites en sacs de 25 kg. C'est la bonne maille :
//                          Lapin Repro et Lapin Engraissement partagent le même
//                          sac imprimé, et une troisième formule lapin le
//                          prendra sans qu'on touche à rien.
//   • format_kg seul     → sac neutre, non imprimé : n'importe quelle formule.
//   • par_sac            → une étiquette, un bout de fil : un par sac, quel que
//                          soit le format et l'espèce.
// `formules` (liste de noms) passe avant tout : pour l'aliment qui aurait, un
// jour, son sac bien à lui.
// ══════════════════════════════════════════════════

let GP_EMBALLAGES = [];
let GP_STOCK_EMB = [];

const EMB_UNITES = ['unité', 'rouleau', 'paquet', 'bobine', 'mètre'];
const EMB_MOTIFS_SORTIE = [
  { cle: 'perte',        libelle: '❓ Perte, déchirure' },
  { cle: 'consommation', libelle: '🍽️ Usage interne' },
  { cle: 'don',          libelle: '🎁 Don' },
];
const EMB_MOTIFS_ENTREE = [
  { cle: 'achat',  libelle: '🛒 Achat / livraison' },
  { cle: 'retour', libelle: '↩️ Retour' },
  { cle: 'autre',  libelle: '📦 Autre entrée' },
];
const EMB_SEUIL_DEFAUT = 200;
// Mêmes clés que les formules : c'est `gp_lots.espece` qui sert à retrouver le sac.
const EMB_ESPECES = [
  { cle:'pondeuse', libelle:'🥚 Pondeuse' }, { cle:'chair',   libelle:'🍗 Poulet de chair' },
  { cle:'goliath',  libelle:'🐔 Goliath' },  { cle:'lapin',   libelle:'🐰 Lapin' },
  { cle:'porc',     libelle:'🐖 Porc' },     { cle:'tilapia', libelle:'🐟 Poisson' },
  { cle:'canard',   libelle:'🦆 Canard' },   { cle:'betail',  libelle:'🐄 Bétail' },
];

function _embEsc(s){
  return String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function _embAdmin(){ return GP_ROLE === 'admin' || (typeof GP_EST_GERANT !== 'undefined' && GP_EST_GERANT); }

// ── Chargement ───────────────────────────────────────────────────────────────

async function loadEmballages(){
  try{
    const{data,error}=await SB.from('gp_emballages').select('*')
      .eq('admin_id',GP_ADMIN_ID).order('nom');
    if(error) throw error;
    GP_EMBALLAGES = data||[];
  }catch(e){ console.warn('emballages : catalogue indisponible', e); GP_EMBALLAGES=[]; }
  return GP_EMBALLAGES;
}

async function loadStockEmballages(){
  try{
    const{data,error}=await SB.from('gp_stock_emballages').select('*')
      .eq('admin_id',GP_ADMIN_ID).order('date',{ascending:false}).limit(500);
    if(error) throw error;
    GP_STOCK_EMB = data||[];
  }catch(e){ console.warn('emballages : stock indisponible', e); GP_STOCK_EMB=[]; }
  return GP_STOCK_EMB;
}

// Le reste se recalcule : jamais stocké, toujours refaisable à la main.
function embSolde(embId, mouvements){
  const M = mouvements || GP_STOCK_EMB;
  return (M||[]).filter(m => m.emballage_id === embId)
    .reduce((s,m)=> s + (m.type === 'entree' ? Number(m.qte||0) : -Number(m.qte||0)), 0);
}

function embArticle(id){ return (GP_EMBALLAGES||[]).find(e=>e.id===id) || null; }
function embSeuil(e){ const s = Number(e && e.seuil_alerte); return s > 0 ? s : EMB_SEUIL_DEFAUT; }

// ── Écriture ─────────────────────────────────────────────────────────────────

async function _embMouvement(embId, type, qte, motif, opts){
  opts = opts || {};
  const a = embArticle(embId);
  const ligne = {
    admin_id: GP_ADMIN_ID,
    emballage_id: embId,
    emballage_nom: a ? a.nom : null,
    type, motif,
    qte: Math.abs(Number(qte)||0),
    date: opts.date || (typeof today === 'function' ? today() : new Date().toISOString().slice(0,10)),
    lot_id: opts.lot_id || null,
    note: opts.note || null,
    saisi_par: (typeof GP_USER !== 'undefined' && GP_USER) ? GP_USER.id : null,
    saisi_par_nom: (typeof GP_USER !== 'undefined' && GP_USER && GP_USER.email)
      ? GP_USER.email.split('@')[0] : null,
  };
  if(opts.saisie && typeof idemInserer === 'function'){
    const r = await idemInserer('gp_stock_emballages', ligne, opts.saisie, 'id');
    return { data:r.data, error:r.error, doublon:r.doublon };
  }
  const r = await SB.from('gp_stock_emballages').insert(ligne).select('id').maybeSingle();
  return { data:r.data, error:r.error, doublon:false };
}

// ── Consommation automatique à la production ────────────────────────────────
// `delta` = { "25": +10, "15": -2, … } : ce qui a été produit EN PLUS (ou EN
// MOINS) depuis la dernière saisie des sacs obtenus. Un delta négatif rend les
// emballages au magasin : corriger une erreur ne doit pas les faire disparaître.
async function consommerEmballagesProduction(delta, lotId, date, ctx){
  if(!delta || typeof delta !== 'object') return { sorties: 0 };
  const formule = (ctx && ctx.formule_nom) || null;
  const espece  = String((ctx && ctx.espece) || '').toLowerCase() || null;
  await loadEmballages();
  if(!GP_EMBALLAGES.length) return { sorties: 0 };

  let totalSacs = 0;
  const touches = [];
  for(const format of Object.keys(delta)){
    const n = Number(delta[format]) || 0;
    if(!n) continue;
    totalSacs += n;
    // Le sac de CE format pour CETTE production. Ordre de préférence : celui
    // qui nomme la formule, puis celui de l'espèce, puis le sac neutre.
    // Si rien ne correspond, on ne bloque pas : on ne peut pas exiger que tout
    // soit catalogué pour qu'un lot passe.
    const art = _embSacPour(format, formule, espece);
    if(!art) continue;
    await _embMouvement(art.id, n > 0 ? 'sortie' : 'entree', Math.abs(n), 'production',
      { lot_id: lotId, date, note: (n > 0 ? 'Production ' : 'Correction ') + format + ' kg' });
    touches.push(art.id);
  }
  // Les articles consommés à chaque sac, quel que soit le format.
  if(totalSacs !== 0){
    for(const art of GP_EMBALLAGES.filter(e => e.actif !== false && e.par_sac)){
      await _embMouvement(art.id, totalSacs > 0 ? 'sortie' : 'entree', Math.abs(totalSacs), 'production',
        { lot_id: lotId, date, note: (totalSacs > 0 ? 'Production ' : 'Correction ') + Math.abs(totalSacs) + ' sac(s)' });
      touches.push(art.id);
    }
  }
  if(touches.length){
    await loadStockEmballages();
    for(const id of [...new Set(touches)]) await verifierAlerteEmballage(id);
  }
  return { sorties: touches.length };
}

// Quel sac pour ce format, cette formule, cette espèce ? L'ordre compte : une
// fiche qui nomme explicitement la formule l'emporte sur la fiche d'espèce, qui
// l'emporte sur le sac neutre.
function _embSacPour(format, formule, espece){
  const f = Number(format);
  const actifs = (GP_EMBALLAGES||[]).filter(e => e.actif !== false && Number(e.format_kg) === f);
  const listeDe = e => {
    const l = e.formules;
    if(Array.isArray(l)) return l;
    if(typeof l === 'string'){ try{ const j=JSON.parse(l); return Array.isArray(j)?j:[]; }catch(_){ return []; } }
    return [];
  };
  const norm = x => String(x||'').trim().toLowerCase();
  if(formule){
    const nomme = actifs.find(e => listeDe(e).some(n => norm(n) === norm(formule)));
    if(nomme) return nomme;
  }
  if(espece){
    const parEspece = actifs.find(e => norm(e.espece) === norm(espece));
    if(parEspece) return parEspece;
  }
  return actifs.find(e => !e.espece && !listeDe(e).length) || null;
}

// ── L'alerte, qui est le cœur de la demande ─────────────────────────────────
// Même mécanique que l'alerte de stock MP : mêmes destinataires, même anti-spam
// de 4 heures — sans lui, une journée de production noierait tout le monde.
const _embAlerteLast = {};
async function verifierAlerteEmballage(embId){
  if(!embId || !GP_ADMIN_ID) return;
  const now = Date.now();
  if(_embAlerteLast[embId] && now - _embAlerteLast[embId] < 4*3600*1000) return;
  try{
    const art = embArticle(embId);
    if(!art) return;
    const niveau = embSolde(embId);
    const seuil = embSeuil(art);
    if(niveau >= seuil) return;
    _embAlerteLast[embId] = now;
    const{data:membres}=await SB.from('gp_membres').select('user_id,role')
      .eq('admin_id',GP_ADMIN_ID).eq('actif',true)
      .in('role',['admin','logistique','gerant','daf']);
    const ids = [...new Set([GP_ADMIN_ID].concat((membres||[]).map(m=>m.user_id).filter(Boolean)))];
    if(ids.length && typeof pushSendToUsers === 'function'){
      pushSendToUsers(ids, '📦 Emballage bientôt épuisé',
        `${art.nom} : il reste ${niveau} ${art.unite||'unité'} (seuil ${seuil}). Commande avant la rupture.`,
        { tag: 'emb-' + embId });
    }
  }catch(e){ console.warn('emballages : alerte impossible', e); }
}

// Les lignes à afficher dans le Centre d'alertes.
async function embAlertesBasses(){
  await loadEmballages();
  await loadStockEmballages();
  return (GP_EMBALLAGES||[]).filter(e=>e.actif!==false).map(e=>{
    const reste = embSolde(e.id), seuil = embSeuil(e);
    return { nom:e.nom, reste, seuil, unite:e.unite||'unité', critique: reste < seuil };
  }).filter(x=>x.critique).sort((a,b)=>a.reste-b.reste);
}

// ── Écran ────────────────────────────────────────────────────────────────────

async function renderEmballages(){
  const zone = document.getElementById('emb-content');
  if(!zone) return;
  await loadEmballages();
  await loadStockEmballages();

  const actifs = (GP_EMBALLAGES||[]).filter(e=>e.actif!==false);
  const lignes = actifs.map(e=>{
    const reste = embSolde(e.id), seuil = embSeuil(e);
    const coul = reste <= 0 ? 'var(--red)' : reste < seuil ? 'var(--gold)' : 'var(--green)';
    const esp = (EMB_ESPECES.find(x=>x.cle===e.espece)||{}).libelle;
    let liste = e.formules;
    if(typeof liste === 'string'){ try{ liste = JSON.parse(liste); }catch(_){ liste = null; } }
    const pour = Array.isArray(liste) && liste.length
      ? (liste.length === 1 ? liste[0] : liste.length + ' aliments')
      : (esp || 'tous aliments');
    const conso = Number(e.format_kg) > 0
      ? `1 par sac de ${e.format_kg} kg · ${pour}`
      : e.par_sac ? '1 par sac, tous formats' : 'à la main';
    return `<tr>
      <td>
        <div style="font-weight:700">${_embEsc(e.nom)}</div>
        <div style="font-size:10px;color:var(--textm)">${conso} · seuil ${fmt(seuil)}${
          Number(e.prix_unitaire)>0 ? ' · '+fmt(e.prix_unitaire)+' F' : ''}</div>
      </td>
      <td class="num" style="color:${coul};font-weight:800;font-size:15px">${fmt(reste)}
        ${reste<seuil?'<div style="font-size:9px;font-weight:700;color:var(--gold)">⚠ à commander</div>':''}</td>
      <td style="white-space:nowrap">
        <button class="btn btn-g btn-sm" onclick="ouvrirEntreeEmb('${e.id}')" title="Réception">➕</button>
        <button class="btn btn-out btn-sm" onclick="ouvrirSortieEmb('${e.id}')" title="Sortie sans production">➖</button>
        <button class="btn btn-out btn-sm" onclick="ouvrirComptageEmb('${e.id}')" title="Comptage réel">🔢</button>
        ${_embAdmin()?`<button class="btn btn-out btn-sm" onclick="ouvrirSeuilEmb('${e.id}')" title="Seuil d'alerte">🔔</button>`:''}
        ${_embAdmin()?`<button class="btn btn-red btn-sm" onclick="supprimerEmballage('${e.id}','${_embEsc(e.nom)}')">✕</button>`:''}
      </td>
    </tr>`;
  }).join('');

  const hist = (GP_STOCK_EMB||[]).slice(0,25).map(m=>{
    const signe = m.type==='entree' ? '+' : '−';
    const coul  = m.type==='entree' ? 'var(--green)' : 'var(--red)';
    const lib = [].concat(EMB_MOTIFS_ENTREE, EMB_MOTIFS_SORTIE).find(x=>x.cle===m.motif);
    const motif = m.motif==='production' ? '🏭 Production'
      : m.motif==='comptage' ? '🔢 Comptage'
      : (lib ? lib.libelle : (m.motif||'—'));
    return `<div style="display:flex;justify-content:space-between;gap:8px;padding:6px 0;border-bottom:1px solid var(--border);font-size:11.5px">
      <div><b>${_embEsc(m.emballage_nom||'—')}</b> · ${motif}
        <div style="font-size:10px;color:var(--textm)">${_embEsc(m.date||'')}${m.note?' · '+_embEsc(m.note):''}${m.saisi_par_nom?' · '+_embEsc(m.saisi_par_nom):''}</div>
      </div>
      <div style="color:${coul};font-weight:700;white-space:nowrap">${signe}${fmt(m.qte)}</div>
    </div>`;
  }).join('');

  zone.innerHTML = `
    <div class="card">
      <div class="card-title">
        <div class="ct-left"><span>📦 Stock des emballages</span></div>
        ${_embAdmin()?`<button class="btn btn-g btn-sm" onclick="ouvrirNouvelEmballage()">➕ Nouvel article</button>`:''}
      </div>
      <div style="font-size:11px;color:var(--textm);margin-bottom:10px">
        Les sorties se font <b>toutes seules</b> à chaque production, d'après les sacs obtenus.
        Tu n'as à saisir que les réceptions — et les pertes, s'il y en a.
      </div>
      ${actifs.length ? `<table class="tbl"><thead><tr>
          <th>Article</th><th class="num">Reste</th><th></th>
        </tr></thead><tbody>${lignes}</tbody></table>`
        : '<div style="color:var(--textm);font-size:12px">Aucun article. Crée-en un avec ➕ Nouvel article.</div>'}
    </div>
    <div class="card" style="margin-top:14px">
      <div class="card-title"><div class="ct-left"><span>📜 Derniers mouvements</span></div></div>
      ${hist || '<div style="color:var(--textm);font-size:12px">Aucun mouvement.</div>'}
    </div>`;
}

// ── Fenêtres ─────────────────────────────────────────────────────────────────

function _embOuvrirModal(titre, corps, action){
  const m = document.getElementById('modal-emb');
  if(!m){ notify('Recharge la page (Ctrl+Shift+R)','r'); return; }
  document.getElementById('emb-modal-titre').textContent = titre;
  document.getElementById('emb-modal-corps').innerHTML = corps;
  document.getElementById('emb-modal-ok').setAttribute('onclick', action);
  document.getElementById('emb-modal-err').textContent = '';
  m.style.display = 'flex';
}
function fermerModalEmb(){ const m=document.getElementById('modal-emb'); if(m) m.style.display='none'; }

function ouvrirNouvelEmballage(){
  _embOuvrirModal('➕ Nouvel article d\'emballage', `
    <div class="fr"><label>Nom *</label>
      <input type="text" id="eb_nom" placeholder="Sac 50 kg, Étiquette, Fil à coudre…"></div>
    <div class="fr"><label>Comment se consomme-t-il ?</label>
      <select id="eb_mode" onchange="onEmbModeChange()">
        <option value="format">Un par sac d'un format précis</option>
        <option value="par_sac">Un par sac, quel que soit le format</option>
        <option value="manuel">À la main uniquement</option>
      </select></div>
    <div id="eb_fmt_wrap">
      <div class="fr"><label>Format du sac (kg)</label>
        <select id="eb_format"><option value="50">50 kg</option><option value="25" selected>25 kg</option>
          <option value="15">15 kg</option><option value="10">10 kg</option><option value="5">5 kg</option></select></div>
      <div class="fr"><label>Ce sac sert à…</label>
        <select id="eb_portee" onchange="onEmbPorteeChange()">
          <option value="tous">Tous les aliments (sac neutre)</option>
          <option value="espece">Toute une espèce</option>
          <option value="precis">Des aliments précis</option>
        </select></div>
      <div class="fr" id="eb_espece_wrap" style="display:none"><label>Espèce</label>
        <select id="eb_espece">
          ${EMB_ESPECES.map(e=>`<option value="${e.cle}">${e.libelle}</option>`).join('')}
        </select>
        <div style="font-size:10.5px;color:var(--textm);margin-top:4px">
          Couvre <b>toutes ses formules</b>, y compris celles que tu créeras plus tard.
        </div></div>
      <div class="fr" id="eb_form_wrap" style="display:none"><label>Aliments concernés</label>
        <div style="max-height:180px;overflow-y:auto;border:1px solid var(--border);border-radius:8px;padding:8px">
          ${_embListeFormules()}
        </div>
        <div style="font-size:10.5px;color:var(--textm);margin-top:4px">
          Coche un seul aliment, ou plusieurs. Un aliment coché passe avant toute règle d'espèce.
        </div></div>
    </div>
    <div class="fg2">
      <div class="fr"><label>Unité</label><select id="eb_unite">
        ${EMB_UNITES.map(u=>`<option value="${u}">${u}</option>`).join('')}</select></div>
      <div class="fr"><label>Seuil d'alerte</label>
        <input type="number" id="eb_seuil" min="0" step="10" value="${EMB_SEUIL_DEFAUT}"></div>
    </div>
    <div class="fr"><label>Prix unitaire (F)</label>
      <input type="number" id="eb_prix" min="0" step="5" value="0"></div>`,
    'saveEmballage()');
}

function onEmbModeChange(){
  const mode = document.getElementById('eb_mode')?.value;
  const w = document.getElementById('eb_fmt_wrap');
  if(w) w.style.display = mode === 'format' ? 'block' : 'none';
}

// Les aliments réellement en catalogue, groupés par espèce : on ne coche pas
// dans une liste inventée, on coche dans les formules qui existent.
function _embListeFormules(){
  const F = (typeof getAllFormules === 'function' ? getAllFormules() : []) || [];
  if(!F.length) return '<div style="font-size:11px;color:var(--textm)">Aucune formule au catalogue.</div>';
  const parEspece = {};
  F.forEach(f => { const e = String(f.espece||'autre').toLowerCase(); (parEspece[e] = parEspece[e] || []).push(f.nom); });
  return Object.keys(parEspece).sort().map(e => {
    const lib = (EMB_ESPECES.find(x=>x.cle===e)||{}).libelle || e;
    return `<div style="font-size:10px;font-weight:700;color:var(--gold);margin:6px 0 3px">${lib}</div>`
      + parEspece[e].sort().map(n =>
          `<label style="display:flex;align-items:center;gap:7px;font-size:11.5px;padding:2px 0">
             <input type="checkbox" class="eb-form-chk" value="${_embEsc(n)}"> ${_embEsc(n)}</label>`
        ).join('');
  }).join('');
}

function onEmbPorteeChange(){
  const p = document.getElementById('eb_portee')?.value;
  const e = document.getElementById('eb_espece_wrap');
  const f = document.getElementById('eb_form_wrap');
  if(e) e.style.display = p === 'espece' ? 'block' : 'none';
  if(f) f.style.display = p === 'precis' ? 'block' : 'none';
}

async function saveEmballage(){
  const err = document.getElementById('emb-modal-err');
  const nom = (document.getElementById('eb_nom')?.value||'').trim();
  if(!nom){ err.textContent = 'Donne un nom à l\'article.'; return; }
  const mode = document.getElementById('eb_mode')?.value || 'manuel';
  const portee = document.getElementById('eb_portee')?.value || 'tous';
  const choisies = [...document.querySelectorAll('.eb-form-chk')].filter(c=>c.checked).map(c=>c.value);
  if(mode === 'format' && portee === 'precis' && !choisies.length){
    err.textContent = 'Coche au moins un aliment, ou choisis « tous ».'; return;
  }
  const {error} = await SB.from('gp_emballages').insert({
    admin_id: GP_ADMIN_ID, nom,
    format_kg: mode === 'format' ? (+document.getElementById('eb_format')?.value || null) : null,
    espece: (mode === 'format' && portee === 'espece')
      ? (document.getElementById('eb_espece')?.value || null) : null,
    formules: (mode === 'format' && portee === 'precis' && choisies.length) ? choisies : null,
    par_sac: mode === 'par_sac',
    unite: document.getElementById('eb_unite')?.value || 'unité',
    seuil_alerte: +document.getElementById('eb_seuil')?.value || EMB_SEUIL_DEFAUT,
    prix_unitaire: +document.getElementById('eb_prix')?.value || 0,
    actif: true
  });
  if(error){
    err.textContent = /gp_emballages/.test(error.message||'')
      ? "La table des emballages n'existe pas encore — lance la migration SQL."
      : 'Erreur : '+error.message;
    return;
  }
  fermerModalEmb();
  notify('Article créé ✓','gold');
  renderEmballages();
}

async function supprimerEmballage(id, nom){
  if(!_embAdmin()){ notify('Réservé à l\'administrateur','r'); return; }
  if(!confirm(`Retirer « ${nom} » du catalogue ? L'historique est conservé.`)) return;
  const {error} = await SB.from('gp_emballages').update({actif:false})
    .eq('id',id).eq('admin_id',GP_ADMIN_ID);
  if(error){ notify('Erreur : '+error.message,'r'); return; }
  notify('Article retiré','gold');
  renderEmballages();
}

function ouvrirSeuilEmb(id){
  const a = embArticle(id); if(!a) return;
  _embOuvrirModal(`🔔 Seuil d'alerte — ${a.nom}`, `
    <input type="hidden" id="em_id" value="${id}">
    <div style="font-size:11px;color:var(--textm);margin-bottom:10px">
      En dessous de ce nombre, l'admin, le logistique, le gérant et le DAF reçoivent une
      notification — au plus une toutes les 4 heures.
    </div>
    <div class="fr"><label>Alerter en dessous de</label>
      <input type="number" id="em_seuil" min="0" step="10" value="${embSeuil(a)}"></div>`,
    'saveSeuilEmb()');
}

async function saveSeuilEmb(){
  const id = document.getElementById('em_id')?.value;
  const seuil = +document.getElementById('em_seuil')?.value || 0;
  const {error} = await SB.from('gp_emballages').update({seuil_alerte:seuil})
    .eq('id',id).eq('admin_id',GP_ADMIN_ID);
  if(error){ document.getElementById('emb-modal-err').textContent='Erreur : '+error.message; return; }
  fermerModalEmb();
  notify('Seuil enregistré ✓','gold');
  renderEmballages();
}

function _embFormMvt(a, titre, motifs, action, extra){
  _embOuvrirModal(titre, `
    <input type="hidden" id="em_id" value="${a.id}">
    ${extra||''}
    <div style="font-size:11px;color:var(--textm);margin-bottom:10px">
      Reste actuel : <b>${fmt(embSolde(a.id))} ${_embEsc(a.unite||'unité')}</b>
    </div>
    <div class="fg2">
      <div class="fr"><label>Quantité *</label><input type="number" id="em_qte" min="0" step="1"></div>
      <div class="fr"><label>Date</label><input type="date" id="em_date" value="${typeof today==='function'?today():''}"></div>
    </div>
    ${motifs?`<div class="fr"><label>Motif *</label><select id="em_motif">
      ${motifs.map(x=>`<option value="${x.cle}">${x.libelle}</option>`).join('')}</select></div>`:''}
    <div class="fr"><label>Note</label><input type="text" id="em_note" placeholder="N° de facture, fournisseur…"></div>`,
    action);
}

// Une réception, c'est de la marchandise ET de l'argent qui sort. Les deux
// écrans ne se parlaient pas : on saisissait les sacs, et la dépense était
// oubliée. On la propose ici, pré-remplie — mais JAMAIS en devinant la caisse :
// sans caisse choisie, on refuse, exactement comme l'écran Dépenses.
function ouvrirEntreeEmb(id){
  const a = embArticle(id); if(!a) return;
  const pu = Number(a.prix_unitaire||0);
  _embFormMvt(a, '➕ Réception — ' + a.nom, EMB_MOTIFS_ENTREE, 'saveEntreeEmb()');
  const corps = document.getElementById('emb-modal-corps');
  if(!corps) return;
  _embMontantTouche = false;
  corps.insertAdjacentHTML('beforeend',
    '<div style="border-top:1px solid var(--border);margin-top:12px;padding-top:12px">'
    + '<label style="display:flex;align-items:center;gap:8px;font-size:12px;font-weight:700">'
    + '<input type="checkbox" id="eb_dep" ' + (pu>0?'checked':'') + ' onchange="onEmbDepToggle()">'
    + '\uD83D\uDCB0 Enregistrer aussi la dépense</label>'
    + '<div id="eb_dep_wrap" style="display:' + (pu>0?'block':'none') + ';margin-top:10px">'
    + '<div class="fg2">'
    + '<div class="fr"><label>Montant payé (FCFA)</label>'
    + '<input type="number" id="eb_dep_montant" min="0" step="100" oninput="_embMontantTouche=true"></div>'
    + '<div class="fr"><label>Fournisseur</label>'
    + '<input type="text" id="eb_dep_benef" placeholder="Nom du fournisseur"></div></div>'
    + '<div class="fr"><label>Caisse à débiter *</label>'
    + '<select id="eb_dep_caisse"></select>'
    + '<div style="font-size:10.5px;color:var(--textm);margin-top:4px">'
    + (pu>0 ? ('Proposé : ' + fmt(pu) + ' F l\'unité.')
            : 'Aucun prix connu — saisis le montant payé.')
    + '</div></div></div></div>');
  // La quantité commande le montant, tant que personne ne l'a corrigé à la main.
  const q = document.getElementById('em_qte');
  if(q) q.addEventListener('input', onEmbQteChange);
  if(typeof remplirSelectCaisses === 'function'){
    remplirSelectCaisses('eb_dep_caisse', '— Choisir la caisse —')
      .then(function(){ if(typeof preselectCaissePDV === 'function') preselectCaissePDV('eb_dep_caisse'); });
  }
}

let _embMontantTouche = false;
function onEmbQteChange(){
  if(_embMontantTouche) return;
  const a = embArticle(document.getElementById('em_id') && document.getElementById('em_id').value);
  const pu = Number((a && a.prix_unitaire) || 0);
  const q = +(document.getElementById('em_qte') || {}).value || 0;
  const m = document.getElementById('eb_dep_montant');
  if(m && pu > 0) m.value = Math.round(pu * q) || '';
}

function onEmbDepToggle(){
  const on = document.getElementById('eb_dep') && document.getElementById('eb_dep').checked;
  const w = document.getElementById('eb_dep_wrap');
  if(w) w.style.display = on ? 'block' : 'none';
}
function ouvrirSortieEmb(id){
  const a=embArticle(id); if(!a) return;
  _embFormMvt(a, `➖ Sortie sans production — ${a.nom}`, EMB_MOTIFS_SORTIE, 'saveSortieEmb()',
    '<div style="font-size:11px;color:var(--gold);margin-bottom:8px">Les sacs utilisés en production sortent tout seuls : ici, seulement ce qui part autrement.</div>');
}
function ouvrirComptageEmb(id){
  const a=embArticle(id); if(!a) return;
  const solde = embSolde(id);
  _embOuvrirModal(`🔢 Comptage — ${a.nom}`, `
    <input type="hidden" id="em_id" value="${id}">
    <input type="hidden" id="em_avant" value="${solde}">
    <div style="font-size:11px;color:var(--textm);margin-bottom:10px">
      L'app annonce <b>${fmt(solde)} ${_embEsc(a.unite||'unité')}</b>. Saisis ce que tu as compté :
      c'est le comptage qui fait foi, l'écart est enregistré.
    </div>
    <div class="fg2">
      <div class="fr"><label>Compté sur place *</label><input type="number" id="em_qte" min="0" step="1"></div>
      <div class="fr"><label>Date</label><input type="date" id="em_date" value="${typeof today==='function'?today():''}"></div>
    </div>
    <div class="fr"><label>Note</label><input type="text" id="em_note" placeholder="Qui a compté…"></div>`,
    'saveComptageEmb()');
}

function _embLire(){
  return {
    id: document.getElementById('em_id')?.value,
    qte: +(document.getElementById('em_qte')?.value),
    brut: document.getElementById('em_qte')?.value,
    date: document.getElementById('em_date')?.value || null,
    motif: document.getElementById('em_motif')?.value || null,
    note: (document.getElementById('em_note')?.value||'').trim() || null,
  };
}

function _embErreur(e){
  const err = document.getElementById('emb-modal-err');
  if(!err) return;
  err.textContent = /gp_stock_emballages/.test((e&&e.message)||'')
    ? "La table du stock emballages n'existe pas encore — lance la migration SQL."
    : 'Erreur : '+((e&&e.message)||e);
}

async function _embEnregistrer(type, motif, qte, v, message){
  const r = await _embMouvement(v.id, type, qte, motif, {date:v.date, note:v.note, saisie:'emb_mvt'});
  if(r.doublon){ fermerModalEmb(); notify('Ce mouvement est déjà enregistré ✓','gold'); if(typeof idemTerminee==='function') idemTerminee('emb_mvt'); renderEmballages(); return true; }
  if(r.error){ _embErreur(r.error); return false; }
  if(typeof idemTerminee==='function') idemTerminee('emb_mvt');
  await loadStockEmballages();
  await verifierAlerteEmballage(v.id);
  fermerModalEmb();
  notify(message,'gold');
  renderEmballages();
  return true;
}

async function saveEntreeEmb(){
  const v=_embLire(), err=document.getElementById('emb-modal-err');
  if(!(v.qte>0)){ err.textContent='Entre une quantité.'; return; }

  const dep = document.getElementById('eb_dep');
  const avecDep = !!(dep && dep.checked);
  const montant = +(document.getElementById('eb_dep_montant') || {}).value || 0;
  const caisseId = (document.getElementById('eb_dep_caisse') || {}).value || null;
  if(avecDep){
    if(!(montant > 0)){ err.textContent='Entre le montant payé, ou décoche la dépense.'; return; }
    // Même règle que l'écran Dépenses : on ne devine JAMAIS la caisse. Sans
    // choix explicite, l'argent sortirait d'un tiroir que personne n'a désigné.
    if(!caisseId){ err.textContent="Choisis la caisse qui a payé — sinon la dépense n'est pas enregistrée."; return; }
  }

  const art = embArticle(v.id);
  const r = await _embMouvement(v.id, 'entree', v.qte, v.motif||'achat', {date:v.date, note:v.note, saisie:'emb_mvt'});
  if(r.doublon){ fermerModalEmb(); notify('Cette réception est déjà enregistrée ✓','gold'); if(typeof idemTerminee==='function') idemTerminee('emb_mvt'); renderEmballages(); return; }
  if(r.error){ _embErreur(r.error); return; }
  if(typeof idemTerminee==='function') idemTerminee('emb_mvt');

  let message = '+'+fmt(v.qte)+' en stock ✓';
  let souci = null;
  if(avecDep){
    souci = await _embEnregistrerDepense(art, v, montant, caisseId);
    if(souci){
      message = '+'+fmt(v.qte)+" en stock — mais la dépense n'est PAS passée : "+souci;
    } else {
      message = '+'+fmt(v.qte)+' en stock · '+fmt(montant)+' F sortis de la caisse ✓';
      // Le prix unitaire se met à jour : la prochaine réception sera pré-remplie
      // juste, au lieu de repartir d'un prix périmé. On le DIT, on ne le fait
      // pas en douce.
      const pu = Math.round(montant / v.qte);
      if(pu > 0 && pu !== Number((art && art.prix_unitaire) || 0)){
        try{ await SB.from('gp_emballages').update({prix_unitaire:pu}).eq('id',v.id).eq('admin_id',GP_ADMIN_ID); }catch(e){}
        message += ' · prix unitaire : '+fmt(pu)+' F';
      }
    }
  }
  await loadStockEmballages();
  await verifierAlerteEmballage(v.id);
  _embMontantTouche = false;
  fermerModalEmb();
  notify(message, souci ? 'r' : 'gold');
  renderEmballages();
}

// Écrit la dépense et débite la caisse par le chemin DÉJÀ éprouvé de l'écran
// Dépenses : pas de second code pour faire sortir de l'argent, c'est comme ça
// qu'on creuse un solde sans s'en apercevoir. Renvoie la raison de l'échec,
// ou null. La réception, elle, est déjà enregistrée et le reste.
async function _embEnregistrerDepense(art, v, montant, caisseId){
  const benef = (document.getElementById('eb_dep_benef') || {}).value || '';
  const ligne = {
    admin_id: GP_ADMIN_ID,
    saisi_par: (typeof GP_USER !== 'undefined' && GP_USER) ? GP_USER.id : null,
    date: v.date || (typeof today==='function' ? today() : null),
    categorie: 'emballage',
    description: 'Emballages : ' + ((art && art.nom) || 'article') + ' × ' + v.qte,
    montant: montant,
    beneficiaire: benef.trim() || null,
    point_vente: (typeof GP_POINT_VENTE !== 'undefined' && GP_POINT_VENTE) || 'Production',
  };
  let d = null;
  try{
    if(typeof idemInserer === 'function'){
      const r = await idemInserer('gp_depenses', ligne, 'emb_depense', '*');
      if(r.doublon) return null;
      if(r.error) return r.error.message;
      d = r.data;
    } else {
      const r = await SB.from('gp_depenses').insert(ligne).select().maybeSingle();
      if(r.error) return r.error.message;
      d = r.data;
    }
    if(typeof idemTerminee==='function') idemTerminee('emb_depense');
    if(typeof _debiterCaisseDepense === 'function') await _debiterCaisseDepense(d, caisseId);
    return null;
  }catch(e){
    return (e && e.message) || String(e);
  }
}

async function saveSortieEmb(){
  const v=_embLire(), err=document.getElementById('emb-modal-err');
  if(!(v.qte>0)){ err.textContent='Entre une quantité.'; return; }
  if(!v.motif){ err.textContent='Choisis un motif.'; return; }
  await _embEnregistrer('sortie', v.motif, v.qte, v, '−'+fmt(v.qte)+' sorti du stock');
}

async function saveComptageEmb(){
  const v=_embLire(), err=document.getElementById('emb-modal-err');
  if(v.brut === '' || !(v.qte >= 0)){ err.textContent='Entre ce que tu as compté.'; return; }
  const avant = +(document.getElementById('em_avant')?.value) || 0;
  const ecart = v.qte - avant;
  if(ecart === 0){ fermerModalEmb(); notify('Le compte tombe juste ✓','g'); return; }
  v.note = (v.note ? v.note+' · ' : '') + 'Comptage : '+fmt(v.qte)+' au lieu de '+fmt(avant);
  await _embEnregistrer(ecart>0?'entree':'sortie', 'comptage', Math.abs(ecart), v,
    'Comptage enregistré : '+(ecart>0?'+':'')+fmt(ecart));
}

if (typeof window !== 'undefined') {
  window.renderEmballages = renderEmballages;
  window.loadEmballages = loadEmballages;
  window.loadStockEmballages = loadStockEmballages;
  window.embSolde = embSolde;
  window.embAlertesBasses = embAlertesBasses;
  window.consommerEmballagesProduction = consommerEmballagesProduction;
  window._embSacPour = _embSacPour;
  window.verifierAlerteEmballage = verifierAlerteEmballage;
  window.ouvrirNouvelEmballage = ouvrirNouvelEmballage;
  window.onEmbModeChange = onEmbModeChange;
  window.onEmbPorteeChange = onEmbPorteeChange;
  window.saveEmballage = saveEmballage;
  window.supprimerEmballage = supprimerEmballage;
  window.ouvrirSeuilEmb = ouvrirSeuilEmb;
  window.saveSeuilEmb = saveSeuilEmb;
  window.ouvrirEntreeEmb = ouvrirEntreeEmb;
  window.ouvrirSortieEmb = ouvrirSortieEmb;
  window.ouvrirComptageEmb = ouvrirComptageEmb;
  window.saveEntreeEmb = saveEntreeEmb;
  window.onEmbDepToggle = onEmbDepToggle;
  window.onEmbQteChange = onEmbQteChange;
  window.saveSortieEmb = saveSortieEmb;
  window.saveComptageEmb = saveComptageEmb;
  window.fermerModalEmb = fermerModalEmb;
}
