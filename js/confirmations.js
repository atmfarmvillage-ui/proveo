// ══════════════════════════════════════════════════════════════════
// PROVENDA — NOTIFIER LE CONFIRMEUR PAR WHATSAPP
// Quand une action doit être confirmée par quelqu'un d'autre (ex : un
// achat MP créé par le PDV Sanguera doit être confirmé par la Production),
// on ouvre WhatsApp pré-rempli vers le bon destinataire :
//   • Cible directe : le vrai numéro du PDV/personne qui doit confirmer.
//   • Si aucun numéro enregistré : modal de choix (cocher un destinataire
//     existant ou saisir un numéro à la main).
// Réutilisé par : achats MP, dépenses, transferts de caisse.
// ══════════════════════════════════════════════════════════════════

// URL wa.me à partir d'un numéro + message (gère l'indicatif pays).
function _confWaUrl(tel, msg){
  if(!tel) return '';
  const p = (typeof detecterPays==='function')
    ? detecterPays(String(tel))
    : { numero_whatsapp: String(tel).replace(/\D/g,'') };
  return p.numero_whatsapp ? 'https://wa.me/'+p.numero_whatsapp+'?text='+encodeURIComponent(msg) : '';
}

// Liste des destinataires possibles : PDV (avec numéro), membres du siège
// (= Production), et le contact principal de la provenderie. Dédupliqué.
async function _confCandidats(){
  const out = [];
  try{
    const{data:pv}=await SB.from('gp_points_vente')
      .select('nom,whatsapp,telephone,responsable,type_pdv').eq('admin_id',GP_ADMIN_ID);
    (pv||[]).forEach(p=>{
      const tel = p.whatsapp || p.telephone;
      if(tel) out.push({ label:`${p.nom}${p.responsable?' ('+p.responsable+')':''}`, tel, type:p.type_pdv });
    });
  }catch(e){}
  try{
    const{data:m}=await SB.from('gp_membres')
      .select('nom,role,telephone,point_vente,actif').eq('admin_id',GP_ADMIN_ID);
    (m||[]).filter(x=>x.actif!==false && !x.point_vente && x.telephone).forEach(x=>{
      out.push({ label:`${x.nom||x.role||'Membre'} · Production`, tel:x.telephone, type:'production' });
    });
  }catch(e){}
  const provTel = (typeof GP_CONFIG!=='undefined') ? (GP_CONFIG?.whatsapp || GP_CONFIG?.telephone) : '';
  if(provTel) out.push({ label:`${(typeof GP_CONFIG!=='undefined'&&GP_CONFIG?.nom_provenderie)||'Provenderie'} (contact principal)`, tel:provTel, type:'prov' });
  // Dédupe par numéro
  const seen=new Set();
  return out.filter(c=>{ const k=String(c.tel).replace(/\D/g,''); if(!k||seen.has(k)) return false; seen.add(k); return true; });
}

// Point d'entrée. opts = { titre, message, cibleNom?, preferProv? }
//  - cibleNom : sous-chaîne du nom du destinataire visé (ex 'Production', nom du PDV).
//  - preferProv : viser en priorité le contact principal (cas validation admin).
async function notifierConfirmeurWA(opts){
  const { message, titre='Action à confirmer', cibleNom=null, preferProv=false } = opts||{};
  const cands = await _confCandidats();

  // Résolution de la cible
  let cible = null;
  if(cibleNom) cible = cands.find(c=>(c.label||'').toLowerCase().includes(String(cibleNom).toLowerCase()));
  if(!cible && preferProv) cible = cands.find(c=>c.type==='prov');
  if(!cible) cible = cands.find(c=>c.type==='principal');     // PDV principal = confirmeur MP
  if(!cible) cible = cands.find(c=>c.type==='production');     // membre siège
  if(!cible && preferProv) cible = cands.find(c=>c.type==='prov');

  if(cible && cible.tel){
    const url = _confWaUrl(cible.tel, message);
    if(url){
      try{ window.open(url,'_blank'); }catch(e){}
      _confAfficherModal({ message, titre, cands, cibleLabel:cible.label, url });
      return;
    }
  }
  // Pas de numéro → laisser choisir
  _confAfficherModal({ message, titre, cands, cibleLabel:null, url:'' });
}

// Modal : confirme l'ouverture (avec bouton de secours) OU laisse choisir
// le destinataire si aucun numéro n'était disponible.
function _confAfficherModal({ message, titre, cands, cibleLabel, url }){
  let host = document.getElementById('modal-conf-wa');
  if(!host){ host=document.createElement('div'); host.id='modal-conf-wa'; document.body.appendChild(host); }

  const safeMsg = String(message||'').replace(/[<>]/g,'');
  const listeDest = (cands||[]).map((c,i)=>`
    <label style="display:flex;align-items:center;gap:8px;padding:8px;border:1px solid var(--border);border-radius:8px;margin-bottom:6px;cursor:pointer">
      <input type="radio" name="conf-wa-dest" value="${i}">
      <span style="font-size:12px">${c.label} · <span style="color:var(--textm)">${c.tel}</span></span>
    </label>`).join('');

  host.style.cssText='position:fixed;inset:0;z-index:1000;background:rgba(0,0,0,.75);display:flex;align-items:center;justify-content:center;padding:16px';
  host.innerHTML=`
    <div style="background:var(--card2);border:1px solid var(--border);border-radius:14px;padding:20px;max-width:460px;width:100%;max-height:85vh;overflow-y:auto">
      <div style="font-weight:700;font-size:15px;margin-bottom:10px">📲 ${titre}</div>
      ${cibleLabel
        ? `<div style="background:rgba(37,211,102,.08);border:1px solid rgba(37,211,102,.3);border-radius:8px;padding:8px 10px;font-size:12px;margin-bottom:10px">WhatsApp ouvert vers <b>${cibleLabel}</b>. S'il ne s'est pas ouvert tout seul, utilise le bouton vert ci-dessous.</div>`
        : `<div style="background:rgba(245,158,11,.08);border:1px solid rgba(245,158,11,.35);border-radius:8px;padding:8px 10px;font-size:12px;margin-bottom:10px">⚠️ Aucun numéro enregistré pour le confirmeur. Choisis le destinataire :</div>`}
      <pre style="white-space:pre-wrap;background:var(--card);border-radius:8px;padding:8px;font-size:11px;max-height:160px;overflow:auto;margin-bottom:10px">${safeMsg}</pre>
      ${!cibleLabel ? `
        <div style="margin-bottom:10px">
          ${listeDest||'<div style="font-size:12px;color:var(--textm);margin-bottom:6px">Aucun contact enregistré.</div>'}
          <div class="fr" style="margin-top:6px"><label style="font-size:11px">Ou saisir un numéro</label>
            <input type="tel" id="conf-wa-num" placeholder="+228 90 00 00 00"></div>
        </div>` : ''}
      <div style="display:flex;gap:8px">
        <a id="conf-wa-go" href="${url||'#'}" target="_blank" rel="noopener noreferrer"
          style="flex:1;text-align:center;background:linear-gradient(135deg,#25D366,#128C7E);color:#fff;padding:12px;border-radius:10px;font-weight:700;text-decoration:none">📲 Ouvrir WhatsApp</a>
        <button onclick="document.getElementById('modal-conf-wa').remove()" class="btn btn-out" style="padding:12px">Fermer</button>
      </div>
    </div>`;

  // Si on doit choisir : recalculer le lien à chaque sélection / saisie
  if(!cibleLabel){
    const go = host.querySelector('#conf-wa-go');
    const maj = ()=>{
      let tel='';
      const sel = host.querySelector('input[name="conf-wa-dest"]:checked');
      if(sel) tel = cands[+sel.value]?.tel || '';
      const manuel = host.querySelector('#conf-wa-num')?.value.trim();
      if(manuel) tel = manuel;
      go.href = _confWaUrl(tel, message) || '#';
    };
    host.querySelectorAll('input[name="conf-wa-dest"]').forEach(r=>r.addEventListener('change',maj));
    host.querySelector('#conf-wa-num')?.addEventListener('input',maj);
  }
}
