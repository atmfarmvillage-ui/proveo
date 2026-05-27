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
let _qrBlob = null;
let _qrClient = null;

async function ouvrirCarteClient(clientId){
  const client = GP_CLIENTS.find(c=>c.id===clientId);
  if(!client){ notify('Client introuvable','r'); return; }
  const modal = document.getElementById('modal-carte-qr');
  if(!modal){ notify('Modal carte QR introuvable','r'); return; }
  modal.style.display='flex';
  document.getElementById('cqr-client-nom').textContent = client.nom||'';
  document.getElementById('cqr-client-tel').textContent = client.telephone||'(pas de téléphone)';
  document.getElementById('cqr-preview').innerHTML = '<div style="color:var(--textm);font-size:12px;padding:30px">⏳ Génération du QR…</div>';
  document.getElementById('cqr-err').textContent='';
  try{
    await assurerQRToken(client);
    const payload = composerPayloadQR(client);
    _qrBlob = await genererImageQR(payload);
    _qrClient = client;
    // Affichage preview
    const url = URL.createObjectURL(_qrBlob);
    document.getElementById('cqr-preview').innerHTML =
      `<img src="${url}" style="width:240px;height:240px;border-radius:12px;background:#FFFFFF;padding:8px">`;
  }catch(e){
    document.getElementById('cqr-err').textContent = 'Erreur : '+(e.message||e);
    document.getElementById('cqr-preview').innerHTML='';
  }
}

function fermerCarteClient(){
  const modal = document.getElementById('modal-carte-qr');
  if(modal) modal.style.display='none';
  _qrBlob = null; _qrClient = null;
}

// ── ENVOI WHATSAPP ───────────────────────────────
async function envoyerCarteWhatsApp(){
  if(!_qrBlob || !_qrClient){ notify('Génère d\'abord le QR','r'); return; }
  const client = _qrClient;
  const tel = (client.telephone||'').replace(/\D/g,'');
  const nomProv = GP_CONFIG?.nom_provenderie || 'PROVENDA';
  const msgTexte = `Bienvenue ${client.nom||''} 🌾\nVoici votre carte client ${nomProv}. Présentez-la à la secrétaire à chaque visite pour un service plus rapide.`;

  // ── Tentative 1 : Web Share API native (mobile Android) ──
  // Partage QR + texte directement à WhatsApp ou autre app
  const file = new File([_qrBlob], `carte-${client.nom||client.id}.png`, {type:'image/png'});
  if(navigator.canShare && navigator.canShare({files:[file]})){
    try{
      await navigator.share({
        title: 'Carte client '+nomProv,
        text: msgTexte,
        files: [file]
      });
      notify('Carte partagée ✓','gold');
      fermerCarteClient();
      return;
    }catch(e){
      if(e?.name === 'AbortError') return;
      // continue vers fallback
    }
  }

  // ── Tentative 2 : Clipboard image + ouverture WhatsApp Web (desktop) ──
  // Copie l'image dans le presse-papier puis ouvre wa.me — l'utilisateur fait Ctrl+V
  let imageCopiee = false;
  try{
    if(navigator.clipboard && window.ClipboardItem){
      await navigator.clipboard.write([
        new ClipboardItem({ 'image/png': _qrBlob })
      ]);
      imageCopiee = true;
    }
  }catch(e){ /* clipboard refusé ou non supporté */ }

  // Upload aussi vers Storage (lien de secours dans le message)
  let urlPublique = null;
  try{ urlPublique = await uploaderQRClient(client, _qrBlob); }catch(e){}

  if(imageCopiee){
    // Cas idéal desktop : image dans clipboard, ouvre wa.me sans URL, utilisateur colle
    const msg = encodeURIComponent(msgTexte + (urlPublique ? `\n\n(Lien de secours : ${urlPublique})` : ''));
    if(tel){
      const p = (typeof detecterPays==='function')?detecterPays(tel):{numero_whatsapp:tel};
      window.open(`https://wa.me/${p.numero_whatsapp}?text=${msg}`, '_blank');
    } else {
      window.open(`https://web.whatsapp.com/`, '_blank');
    }
    // Notification persistante pour expliquer
    const errEl = document.getElementById('cqr-err');
    if(errEl){
      errEl.innerHTML = `<div style="background:rgba(22,163,74,.15);border:1px solid var(--g4);color:var(--g6);padding:10px;border-radius:8px;font-size:11px;line-height:1.5">
        ✅ <strong>QR copié dans le presse-papier !</strong><br>
        Dans WhatsApp Web : clic dans la conversation puis <strong>Ctrl+V</strong> pour coller l'image, puis Entrée pour envoyer.
      </div>`;
    }
    notify('QR copié — colle (Ctrl+V) dans WhatsApp','gold');
    return; // ne pas fermer le modal pour que l'utilisateur lise l'instruction
  }

  // ── Tentative 3 : Clipboard refusé → propose téléchargement + ouverture WhatsApp ──
  if(urlPublique){
    if(!tel){
      const errEl = document.getElementById('cqr-err');
      if(errEl){
        errEl.innerHTML = `<div style="color:var(--gold);font-size:11px">📋 Pas de téléphone. Lien à partager manuellement :<br><a href="${urlPublique}" target="_blank" style="color:var(--g6);word-break:break-all">${urlPublique}</a></div>`;
      }
      return;
    }
    const msg = encodeURIComponent(msgTexte + `\n\nVotre carte : ${urlPublique}`);
    const p = (typeof detecterPays==='function')?detecterPays(tel):{numero_whatsapp:tel};
    window.open(`https://wa.me/${p.numero_whatsapp}?text=${msg}`, '_blank');
    // Aussi télécharger le PNG pour le client
    telechargerCarteQR();
    const errEl = document.getElementById('cqr-err');
    if(errEl){
      errEl.innerHTML = `<div style="background:rgba(232,197,71,.12);border:1px solid var(--gold);color:var(--gold);padding:10px;border-radius:8px;font-size:11px;line-height:1.5">
        📥 QR téléchargé + WhatsApp ouvert.<br>
        Glisse le fichier <strong>carte-${client.nom||client.id}.png</strong> depuis tes Téléchargements vers la conversation WhatsApp.
      </div>`;
    }
    notify('QR téléchargé — glisse-le dans WhatsApp','gold');
    return;
  }
  // Sinon : erreur générale
  const errEl = document.getElementById('cqr-err');
  if(errEl) errEl.textContent = 'Impossible d\'envoyer. Utilise "💾 Télécharger PNG" puis envoie manuellement.';
}

// ── TÉLÉCHARGEMENT LOCAL (option) ────────────────
function telechargerCarteQR(){
  if(!_qrBlob || !_qrClient) return;
  const url = URL.createObjectURL(_qrBlob);
  const a = document.createElement('a');
  a.href = url; a.download = `carte-${_qrClient.nom||_qrClient.id}.png`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(()=>URL.revokeObjectURL(url), 1000);
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
    _qrScanner = new Html5Qrcode('sqr-reader');
    await _qrScanner.start(
      { facingMode: 'environment' },
      { fps: 10, qrbox: { width: 250, height: 250 } },
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
    const scannerFile = new Html5Qrcode('sqr-reader');
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
