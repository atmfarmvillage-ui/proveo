// ══════════════════════════════════════════════════
// PROVENDA — CARTES CLIENT QR
// Génération QR (logo SADARI + couleurs) + envoi WhatsApp + scan caméra
// ══════════════════════════════════════════════════

// ── GÉNÉRATION DU TOKEN ──────────────────────────
// S'assure qu'un client a un qr_token. Génère et persiste si absent.
async function assurerQRToken(client){
  if(client?.qr_token) return client.qr_token;
  const token = (crypto.randomUUID ? crypto.randomUUID() : (Date.now()+'-'+Math.random().toString(36).slice(2)));
  const{error}=await SB.from('gp_clients').update({qr_token:token})
    .eq('id', client.id).eq('admin_id', GP_ADMIN_ID);
  if(error){ console.warn('qr_token update:', error); }
  client.qr_token = token;
  // Mettre à jour le cache local
  const i = GP_CLIENTS.findIndex(c=>c.id===client.id);
  if(i>=0) GP_CLIENTS[i].qr_token = token;
  return token;
}

// ── GÉNÉRATION DE L'IMAGE QR ─────────────────────
// Utilise QRious (lib browser fiable, produit des QR scannables partout)
// + overlay manuel du logo SADARI au centre via canvas.
async function genererImageQR(payload){
  if(typeof QRious === 'undefined'){
    throw new Error('Lib QRious non chargée');
  }
  const size = 480;
  // QRious génère directement dans un canvas que nous fournissons
  const canvas = document.createElement('canvas');
  new QRious({
    element: canvas,
    value: payload,
    size: size,
    level: 'H',           // 30% de redondance pour résister au logo
    padding: 12,
    background: '#FFFFFF',
    foreground: '#16A34A' // vert PROVENDA
  });
  // Overlay logo SADARI au centre
  await dessinerLogoCentre(canvas);
  return new Promise((resolve, reject)=>{
    canvas.toBlob(b=>{
      if(!b) return reject(new Error('Conversion PNG échouée'));
      resolve(b);
    }, 'image/png');
  });
}

// Dessine le logo au centre du canvas QR (zone blanche + logo)
async function dessinerLogoCentre(canvas){
  return new Promise((resolve)=>{
    const ctx = canvas.getContext('2d');
    const size = canvas.width;
    const logoSize = Math.round(size * 0.18); // 18% — sûr pour niveau H
    const x = (size - logoSize) / 2;
    const y = (size - logoSize) / 2;
    // Zone blanche pour le logo (avec marge)
    const margin = 6;
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(x - margin, y - margin, logoSize + margin*2, logoSize + margin*2);
    // Charger et dessiner le logo
    const img = new Image();
    img.onload = ()=>{
      ctx.drawImage(img, x, y, logoSize, logoSize);
      resolve();
    };
    img.onerror = ()=>{ resolve(); /* QR sans logo si erreur — pas grave */ };
    img.src = '/icons/logo.png';
  });
}

// Helper : compose le payload QR
function composerPayloadQR(client){
  return `provenda:c:${GP_ADMIN_ID}:${client.id}:${client.qr_token}`;
}

// ── HELPERS CANVAS (carte de fidélité) ───────────
function _rrPath(ctx,x,y,w,h,r){ ctx.beginPath(); ctx.moveTo(x+r,y); ctx.arcTo(x+w,y,x+w,y+h,r); ctx.arcTo(x+w,y+h,x,y+h,r); ctx.arcTo(x,y+h,x,y,r); ctx.arcTo(x,y,x+w,y,r); ctx.closePath(); }
function _rrFill(ctx,x,y,w,h,r){ _rrPath(ctx,x,y,w,h,r); ctx.fill(); }
function _fitText(ctx,text,maxW){ if(ctx.measureText(text).width<=maxW) return text; let t=text; while(t.length>3 && ctx.measureText(t+'…').width>maxW) t=t.slice(0,-1); return t+'…'; }
function _canvasToBlob(cv){ return new Promise((res,rej)=>cv.toBlob(b=>b?res(b):rej(new Error('toBlob échoué')),'image/png')); }
function _chargerLogoImg(){
  return new Promise((resolve)=>{
    const img=new Image();
    img.onload=()=>resolve(img);
    img.onerror=()=>resolve(null);
    img.src='/icons/logo.png'; // same-origin → pas de taint canvas
  });
}

// ── CARTE FIDÉLITÉ — RECTO (branding + nom client) ──
async function genererCarteRecto(client){
  const W=640,H=400;
  const cv=document.createElement('canvas'); cv.width=W; cv.height=H;
  const ctx=cv.getContext('2d');
  // Fond dégradé vert PROVENDA
  const g=ctx.createLinearGradient(0,0,W,H);
  g.addColorStop(0,'#16A34A'); g.addColorStop(1,'#0C5424');
  ctx.fillStyle=g; ctx.fillRect(0,0,W,H);
  // Liseré or en haut
  ctx.fillStyle='#E8C547'; ctx.fillRect(0,0,W,5);

  const nomProv=(GP_CONFIG?.nom_provenderie)||'SADARI';
  const tel=(GP_CONFIG?.telephone)||'';

  // Logo + nom provenderie
  const logo=await _chargerLogoImg();
  if(logo){ ctx.save(); _rrPath(ctx,32,30,56,56,12); ctx.clip(); ctx.drawImage(logo,32,30,56,56); ctx.restore(); }
  ctx.textBaseline='middle'; ctx.textAlign='left';
  ctx.fillStyle='#FFFFFF'; ctx.font='bold 26px Outfit, Arial, sans-serif';
  ctx.fillText(nomProv.toUpperCase(),100,50);
  ctx.fillStyle='rgba(255,255,255,.8)'; ctx.font='13px Outfit, Arial, sans-serif';
  ctx.fillText('Gestion Provenderie',100,72);

  // Titre
  ctx.textAlign='center'; ctx.fillStyle='#FFE082'; ctx.font='bold 23px Outfit, Arial, sans-serif';
  ctx.fillText('★  CARTE DE FIDÉLITÉ  ★',W/2,140);

  // Bloc nom client
  ctx.fillStyle='rgba(255,255,255,.12)'; _rrFill(ctx,40,170,W-80,76,14);
  ctx.textAlign='left'; ctx.fillStyle='#FFFFFF'; ctx.font='bold 30px Outfit, Arial, sans-serif';
  ctx.fillText(_fitText(ctx,(client.nom||'Client').toUpperCase(),W-120),62,198);
  ctx.fillStyle='rgba(255,255,255,.7)'; ctx.font='13px "DM Mono", monospace';
  ctx.fillText('Membre N° '+(client.id||'').slice(0,6).toUpperCase(),62,226);

  // Tagline
  ctx.textAlign='center'; ctx.fillStyle='#FFE082'; ctx.font='17px Outfit, Arial, sans-serif';
  ctx.fillText('🎁 Cumulez des points à chaque achat',W/2,288);

  // Footer : contact SADARI (gros) + crédit PROVENDA (très discret)
  ctx.fillStyle='rgba(255,255,255,.55)'; ctx.font='11px Outfit, Arial, sans-serif';
  ctx.fillText('Valable dans tous nos points de vente',W/2,330);
  ctx.fillStyle='#FFFFFF'; ctx.font='bold 15px Outfit, Arial, sans-serif';
  ctx.fillText(`${nomProv}${tel?'   ·   '+tel:''}`,W/2,356);
  ctx.fillStyle='rgba(255,255,255,.32)'; ctx.font='9px Outfit, Arial, sans-serif';
  ctx.fillText('propulsé par PROVENDA',W/2,386);

  return _canvasToBlob(cv);
}

// ── CARTE FIDÉLITÉ — VERSO (QR + instructions) ──
async function genererCarteVerso(client){
  const W=640,H=400;
  const cv=document.createElement('canvas'); cv.width=W; cv.height=H;
  const ctx=cv.getContext('2d');
  ctx.fillStyle='#FFFFFF'; ctx.fillRect(0,0,W,H);
  // Bandeau vert haut
  ctx.fillStyle='#16A34A'; ctx.fillRect(0,0,W,46);
  ctx.fillStyle='#FFFFFF'; ctx.font='bold 18px Outfit, Arial, sans-serif'; ctx.textAlign='center'; ctx.textBaseline='middle';
  ctx.fillText('📲 Scannez votre carte',W/2,23);

  // QR centré
  const qrSize=224;
  const qrCanvas=document.createElement('canvas');
  new QRious({element:qrCanvas, value:composerPayloadQR(client), size:qrSize, level:'H', padding:8, background:'#FFFFFF', foreground:'#16A34A'});
  await dessinerLogoCentre(qrCanvas);
  ctx.drawImage(qrCanvas,(W-qrSize)/2,66,qrSize,qrSize);

  const nomProv=(GP_CONFIG?.nom_provenderie)||'SADARI';
  const tel=(GP_CONFIG?.telephone)||'';
  // Instructions
  ctx.fillStyle='#0F1B14'; ctx.font='15px Outfit, Arial, sans-serif';
  ctx.fillText('Présentez cette carte à chaque visite',W/2,322);
  ctx.fillStyle='rgba(15,27,20,.6)'; ctx.font='12px Outfit, Arial, sans-serif';
  ctx.fillText('pour cumuler vos points et gagner des cadeaux',W/2,344);
  // Footer
  ctx.fillStyle='#16A34A'; ctx.font='bold 14px Outfit, Arial, sans-serif';
  ctx.fillText(`${nomProv}${tel?'   ·   '+tel:''}`,W/2,372);
  ctx.fillStyle='rgba(0,0,0,.28)'; ctx.font='9px Outfit, Arial, sans-serif';
  ctx.fillText('propulsé par PROVENDA',W/2,390);

  return _canvasToBlob(cv);
}

// ── UPLOAD VERS STORAGE (pour fallback WhatsApp) ──
async function uploaderQRClient(client, blob){
  const path = `${GP_ADMIN_ID}/${client.id}.png`;
  const{error}=await SB.storage.from('client-qr').upload(path, blob, {
    upsert:true, contentType:'image/png'
  });
  if(error) throw error;
  const{data}=SB.storage.from('client-qr').getPublicUrl(path);
  return data?.publicUrl||null;
}

// ── MODAL APERÇU + ENVOI ─────────────────────────
let _carteRectoBlob = null;
let _carteVersoBlob = null;
let _qrClient = null;

async function ouvrirCarteClient(clientId){
  const client = GP_CLIENTS.find(c=>c.id===clientId);
  if(!client){ notify('Client introuvable','r'); return; }
  const modal = document.getElementById('modal-carte-qr');
  if(!modal){ notify('Modal carte introuvable','r'); return; }
  modal.style.display='flex';
  document.getElementById('cqr-client-nom').textContent = client.nom||'';
  document.getElementById('cqr-client-tel').textContent = client.telephone||'(pas de téléphone)';
  document.getElementById('cqr-preview').innerHTML = '<div style="color:var(--textm);font-size:12px;padding:30px">⏳ Génération de la carte…</div>';
  document.getElementById('cqr-err').textContent='';
  try{
    await assurerQRToken(client);
    _qrClient = client;
    _carteRectoBlob = await genererCarteRecto(client);
    _carteVersoBlob = await genererCarteVerso(client);
    const urlR = URL.createObjectURL(_carteRectoBlob);
    const urlV = URL.createObjectURL(_carteVersoBlob);
    document.getElementById('cqr-preview').innerHTML =
      `<div style="display:flex;flex-direction:column;gap:10px;align-items:center">
        <div style="font-size:10px;color:var(--textm);text-transform:uppercase;letter-spacing:1px">Recto</div>
        <img src="${urlR}" style="width:100%;max-width:300px;border-radius:10px;box-shadow:0 4px 16px rgba(0,0,0,.3)">
        <div style="font-size:10px;color:var(--textm);text-transform:uppercase;letter-spacing:1px;margin-top:4px">Verso</div>
        <img src="${urlV}" style="width:100%;max-width:300px;border-radius:10px;box-shadow:0 4px 16px rgba(0,0,0,.3)">
      </div>`;
  }catch(e){
    document.getElementById('cqr-err').textContent = 'Erreur : '+(e.message||e);
    document.getElementById('cqr-preview').innerHTML='';
  }
}

function fermerCarteClient(){
  const modal = document.getElementById('modal-carte-qr');
  if(modal) modal.style.display='none';
  _carteRectoBlob = null; _carteVersoBlob = null; _qrClient = null;
}

// ── ENVOI WHATSAPP (2 images : recto + verso) ─────
async function envoyerCarteWhatsApp(){
  if(!_carteRectoBlob || !_carteVersoBlob || !_qrClient){ notify('Génère d\'abord la carte','r'); return; }
  const client = _qrClient;
  const tel = (client.telephone||'').replace(/\D/g,'');
  const nomProv = GP_CONFIG?.nom_provenderie || 'SADARI';
  const base = (client.nom||client.id||'client').replace(/[^a-zA-Z0-9]/g,'_');
  const msgTexte = `Bienvenue ${client.nom||''} 🌾\nVoici votre CARTE DE FIDÉLITÉ ${nomProv} (recto + verso).\nPrésentez le QR (verso) à chaque achat pour cumuler des points et gagner des cadeaux 🎁`;

  const fileR = new File([_carteRectoBlob], `carte-${base}-recto.png`, {type:'image/png'});
  const fileV = new File([_carteVersoBlob], `carte-${base}-verso.png`, {type:'image/png'});

  // ── Tentative 1 : Web Share API native (mobile) — partage les 2 images d'un coup ──
  if(navigator.canShare && navigator.canShare({files:[fileR,fileV]})){
    try{
      await navigator.share({ title:'Carte de fidélité '+nomProv, text:msgTexte, files:[fileR,fileV] });
      notify('Carte partagée ✓','gold');
      fermerCarteClient();
      return;
    }catch(e){ if(e?.name==='AbortError') return; }
  }

  // ── Tentative 2 (desktop) : télécharger les 2 PNG + ouvrir WhatsApp avec le texte ──
  telechargerCarteQR(); // télécharge recto + verso
  let urlR=null, urlV=null;
  try{
    urlR = await uploaderQRClient2(client, _carteRectoBlob, 'recto');
    urlV = await uploaderQRClient2(client, _carteVersoBlob, 'verso');
  }catch(e){}
  const liens = (urlR&&urlV) ? `\n\nRecto : ${urlR}\nVerso : ${urlV}` : '';
  const msg = encodeURIComponent(msgTexte + liens);
  if(tel){
    const p = (typeof detecterPays==='function')?detecterPays(tel):{numero_whatsapp:tel};
    window.open(`https://wa.me/${p.numero_whatsapp}?text=${msg}`, '_blank');
  } else {
    window.open('https://web.whatsapp.com/','_blank');
  }
  const errEl = document.getElementById('cqr-err');
  if(errEl){
    errEl.innerHTML = `<div style="background:rgba(232,197,71,.12);border:1px solid var(--gold);color:var(--gold);padding:10px;border-radius:8px;font-size:11px;line-height:1.5">
      📥 Les 2 images (recto + verso) ont été téléchargées + WhatsApp ouvert.<br>
      Glisse les 2 fichiers <strong>carte-${base}-recto.png</strong> et <strong>-verso.png</strong> depuis tes Téléchargements vers la conversation.${(urlR&&urlV)?'<br>(Liens de secours aussi dans le message.)':''}
    </div>`;
  }
  notify('2 images téléchargées — glisse-les dans WhatsApp','gold');
}

// Upload d'une face vers Storage (suffixe recto/verso)
async function uploaderQRClient2(client, blob, suffixe){
  const path = `${GP_ADMIN_ID}/${client.id}-${suffixe}.png`;
  const{error}=await SB.storage.from('client-qr').upload(path, blob, { upsert:true, contentType:'image/png' });
  if(error) throw error;
  const{data}=SB.storage.from('client-qr').getPublicUrl(path);
  return data?.publicUrl||null;
}

// ── TÉLÉCHARGEMENT LOCAL (recto + verso) ─────────
function telechargerCarteQR(){
  if(!_carteRectoBlob || !_carteVersoBlob || !_qrClient) return;
  const base = (_qrClient.nom||_qrClient.id||'client').replace(/[^a-zA-Z0-9]/g,'_');
  [[_carteRectoBlob,'recto'],[_carteVersoBlob,'verso']].forEach(([blob,suf])=>{
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href=url; a.download=`carte-${base}-${suf}.png`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(()=>URL.revokeObjectURL(url),1500);
  });
}

// ── SCANNER QR (lecteur caméra) ──────────────────
let _qrScanner = null;

async function ouvrirScannerQR(){
  const modal = document.getElementById('modal-scan-qr');
  if(!modal) return;
  modal.style.display='flex';
  document.getElementById('sqr-err').textContent='';
  if(typeof Html5Qrcode === 'undefined'){
    document.getElementById('sqr-err').textContent='Lib scan non chargée. Recharge la page.';
    return;
  }
  try{
    // useBarCodeDetectorIfSupported = utilise le scanner NATIF du navigateur (comme WhatsApp Web)
    // → détection quasi instantanée au lieu du décodeur JS lent
    _qrScanner = new Html5Qrcode('sqr-reader', {
      experimentalFeatures: { useBarCodeDetectorIfSupported: true },
      formatsToSupport: (typeof Html5QrcodeSupportedFormats!=='undefined') ? [Html5QrcodeSupportedFormats.QR_CODE] : undefined
    });
    // qrbox adaptatif : ~70% du plus petit côté de la vidéo (cadre plus grand = plus facile à viser)
    const qrboxFn = (vw, vh)=>{ const m=Math.floor(Math.min(vw,vh)*0.7); return {width:m,height:m}; };
    await _qrScanner.start(
      { facingMode: 'environment' },
      { fps: 15, qrbox: qrboxFn, aspectRatio: 1.0 },
      onScanQRSuccess,
      ()=>{} // erreurs de frame silencieuses
    );
  }catch(e){
    document.getElementById('sqr-err').textContent='Caméra inaccessible : '+(e.message||e);
  }
}

async function fermerScannerQR(){
  const modal = document.getElementById('modal-scan-qr');
  if(_qrScanner){
    try{ await _qrScanner.stop(); _qrScanner.clear(); }catch(e){}
    _qrScanner = null;
  }
  if(modal) modal.style.display='none';
}

// Scan depuis un fichier image (fallback si caméra trop lente / pas de carte physique)
async function scannerDepuisFichier(event){
  const file = event?.target?.files?.[0];
  if(!file) return;
  if(typeof Html5Qrcode === 'undefined'){
    document.getElementById('sqr-err').textContent='Lib scan non chargée.';
    return;
  }
  // Stopper la caméra live si en cours
  if(_qrScanner){
    try{ await _qrScanner.stop(); _qrScanner.clear(); }catch(e){}
    _qrScanner = null;
  }
  // Créer un scanner temporaire pour fichier
  try{
    const scannerFile = new Html5Qrcode('sqr-reader', {
      experimentalFeatures: { useBarCodeDetectorIfSupported: true }
    });
    const decoded = await scannerFile.scanFile(file, false);
    scannerFile.clear();
    await onScanQRSuccess(decoded);
  }catch(e){
    document.getElementById('sqr-err').textContent='Aucun QR détecté dans cette image. ('+(e?.message||e)+')';
  }
}

async function onScanQRSuccess(decodedText){
  // Format attendu : provenda:c:<adminId>:<clientId>:<token>
  const m = String(decodedText||'').match(/^provenda:c:([^:]+):([^:]+):(.+)$/);
  if(!m){
    document.getElementById('sqr-err').textContent='QR non reconnu (format invalide)';
    return;
  }
  const[, adminId, clientId, token] = m;
  if(adminId !== GP_ADMIN_ID){
    document.getElementById('sqr-err').textContent='Cette carte appartient à une autre provenderie.';
    return;
  }
  // Vérification stricte en base
  const{data:client, error}=await SB.from('gp_clients').select('*')
    .eq('id', clientId).eq('admin_id', GP_ADMIN_ID).eq('qr_token', token)
    .maybeSingle();
  if(error || !client){
    document.getElementById('sqr-err').textContent='Carte introuvable ou expirée. Régénérez la carte depuis la fiche client.';
    return;
  }
  // Mettre à jour le cache local si nécessaire
  const i = GP_CLIENTS.findIndex(c=>c.id===client.id);
  if(i>=0) GP_CLIENTS[i] = client; else GP_CLIENTS.push(client);
  await fermerScannerQR();
  if(typeof selectionnerClientVente === 'function'){
    selectionnerClientVente(client.id);
  }
  notify(`✓ Client ${client.nom} sélectionné`,'gold');
}

// ── RÉGÉNÉRATION (en cas de perte) ───────────────
async function regenererQRClient(clientId){
  if(!confirm('Régénérer la carte QR ? L\'ancienne carte ne fonctionnera plus.')) return;
  const client = GP_CLIENTS.find(c=>c.id===clientId);
  if(!client) return;
  const newToken = crypto.randomUUID ? crypto.randomUUID() : (Date.now()+'-'+Math.random().toString(36).slice(2));
  const{error}=await SB.from('gp_clients').update({qr_token:newToken})
    .eq('id', clientId).eq('admin_id', GP_ADMIN_ID);
  if(error){ notify('Erreur régénération : '+error.message,'r'); return; }
  client.qr_token = newToken;
  const i = GP_CLIENTS.findIndex(c=>c.id===clientId);
  if(i>=0) GP_CLIENTS[i].qr_token = newToken;
  notify('Nouvelle carte générée ✓','gold');
  // Ouvrir directement le modal pour envoi
  ouvrirCarteClient(clientId);
}
