// ══════════════════════════════════════════════════
// PROVENDA — PUSH NOTIFICATIONS (système Android/iOS)
// VAPID + Service Worker + Supabase Edge Function send-push
// ══════════════════════════════════════════════════

// Clé publique VAPID — publique, OK dans le code client
const VAPID_PUBLIC_KEY = 'BOLIrq_FjcAwn4b5KrPEewAGkvp0NGj7vzSsQSBvL2VypDBBIzjjqWwEKiWvBUPVfleMiQ75ZEgS_AyCzOWSsgU';

// URL de l'Edge Function (utilise l'URL Supabase et le anon key déjà initialisés)
function getEdgeFunctionUrl(){
  // SB._supabaseUrl est privé mais accessible. Fallback : extraction depuis la connexion.
  const url = (SB && SB.supabaseUrl) || (SB && SB._supabaseUrl) || null;
  if(url) return `${url}/functions/v1/send-push`;
  return null;
}

// Convertit la clé VAPID base64url en Uint8Array (format requis par PushManager)
function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  const output = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) output[i] = rawData.charCodeAt(i);
  return output;
}

// Le push est-il supporté par ce navigateur ?
function pushIsSupported(){
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

// Statut actuel : granted | denied | default | unsupported
function pushGetStatus(){
  if(!pushIsSupported()) return 'unsupported';
  return Notification.permission; // granted | denied | default
}

// Active les notifications push pour l'utilisateur courant
async function pushEnable(){
  if(!pushIsSupported()){
    notify('Notifications non supportées par ce navigateur.','r');
    return false;
  }
  if(!GP_USER?.id || !GP_ADMIN_ID){
    notify('Tu dois être connecté pour activer les notifications.','r');
    return false;
  }
  try{
    // 1. Demander la permission
    const perm = await Notification.requestPermission();
    if(perm !== 'granted'){
      notify(perm==='denied' ? 'Permission refusée. Active-la dans les réglages du navigateur.' : 'Permission non accordée.','r');
      pushUpdateUI();
      return false;
    }
    // 2. Récupérer le SW prêt
    const reg = await navigator.serviceWorker.ready;
    // 3. S'abonner au PushManager avec la clé VAPID
    let sub = await reg.pushManager.getSubscription();
    if(!sub){
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
      });
    }
    // 4. Persister la subscription en base
    const json = sub.toJSON();
    const{error}=await SB.from('gp_push_subscriptions').upsert({
      user_id: GP_USER.id,
      admin_id: GP_ADMIN_ID,
      endpoint: json.endpoint,
      p256dh: json.keys.p256dh,
      auth: json.keys.auth,
      device_label: navigator.platform || null,
      user_agent: navigator.userAgent?.slice(0,200) || null,
      last_used_at: new Date().toISOString()
    }, { onConflict: 'user_id,endpoint' });
    if(error){
      notify('Erreur enregistrement subscription : '+error.message,'r');
      return false;
    }
    notify('🔔 Notifications activées','gold');
    pushUpdateUI();
    return true;
  }catch(e){
    notify('Erreur activation : '+(e?.message||e),'r');
    return false;
  }
}

// Désactive les notifications push (unsubscribe + suppression DB)
async function pushDisable(){
  if(!pushIsSupported()) return;
  try{
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if(sub){
      const endpoint = sub.endpoint;
      await sub.unsubscribe();
      // Supprimer de la DB
      await SB.from('gp_push_subscriptions').delete()
        .eq('user_id', GP_USER.id).eq('endpoint', endpoint);
    }
    notify('🔕 Notifications désactivées sur cet appareil','gold');
    pushUpdateUI();
  }catch(e){
    notify('Erreur désactivation : '+(e?.message||e),'r');
  }
}

// Vérifie si l'utilisateur courant est abonné sur cet appareil
async function pushIsSubscribed(){
  if(!pushIsSupported()) return false;
  try{
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    return !!sub;
  }catch(e){ return false; }
}

// ── ENVOI VIA EDGE FUNCTION ───────────────────────
// Appelle send-push avec un payload : { user_ids?, admin_id?, exclude_user_id?, title, body, url?, tag? }
async function pushSend(payload){
  const fnUrl = getEdgeFunctionUrl();
  if(!fnUrl){ console.warn('URL Edge Function introuvable'); return; }
  try{
    const{data:{session}}=await SB.auth.getSession();
    const token = session?.access_token || '';
    const res = await fetch(fnUrl, {
      method:'POST',
      headers:{
        'Content-Type':'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify(payload)
    });
    if(!res.ok){
      const err = await res.text();
      console.warn('Push send error:', res.status, err);
    }
  }catch(e){ console.warn('Push send failed:', e); }
}

// Envoie une notif à tous les membres de l'équipe (admin_id courant)
// excluant optionnellement l'utilisateur qui déclenche (ex: l'auteur d'un message)
function pushSendToTeam(title, body, opts={}){
  return pushSend({
    admin_id: GP_ADMIN_ID,
    exclude_user_id: opts.excludeSelf ? GP_USER?.id : undefined,
    title, body,
    url: opts.url,
    tag: opts.tag
  });
}

// Envoie une notif à des utilisateurs spécifiques (user_ids[])
function pushSendToUsers(user_ids, title, body, opts={}){
  if(!Array.isArray(user_ids) || !user_ids.length) return;
  return pushSend({
    user_ids,
    title, body,
    url: opts.url,
    tag: opts.tag
  });
}

// ── UI STATUS dans la page Configuration ─────────
async function pushUpdateUI(){
  const btn = document.getElementById('cfg-push-btn');
  const statusEl = document.getElementById('cfg-push-status');
  if(!btn || !statusEl) return;
  const status = pushGetStatus();
  if(status === 'unsupported'){
    btn.style.display='none';
    statusEl.textContent='❌ Notifications non supportées par ce navigateur (essaie Chrome ou Firefox).';
    statusEl.style.color='var(--textm)';
    return;
  }
  if(status === 'denied'){
    btn.style.display='none';
    statusEl.innerHTML='🚫 Permission refusée. Active manuellement dans les réglages du navigateur (icône 🔒 à gauche de l\'URL → Notifications → Autoriser).';
    statusEl.style.color='var(--red)';
    return;
  }
  const subscribed = await pushIsSubscribed();
  if(subscribed && status==='granted'){
    btn.textContent='🔕 Désactiver les notifications';
    btn.onclick = ()=>pushDisable();
    btn.style.background='rgba(239,68,68,.1)';
    btn.style.borderColor='var(--red)';
    btn.style.color='var(--red)';
    statusEl.textContent='✅ Notifications activées sur cet appareil. Tu recevras les alertes même app fermée.';
    statusEl.style.color='var(--green)';
  } else {
    btn.textContent='🔔 Activer les notifications';
    btn.onclick = ()=>pushEnable();
    btn.style.background='var(--g4)';
    btn.style.borderColor='var(--g4)';
    btn.style.color='#fff';
    statusEl.textContent='Active les notifications pour recevoir les messages chat et alertes stock même quand l\'app est fermée.';
    statusEl.style.color='var(--textm)';
  }
}

// Initialisation au chargement de la page Config
function initPushUI(){
  pushUpdateUI();
}

// ── TRIGGER B : ALERTE STOCK MP ──────────────────
// Vérifie le niveau d'un MP. Si sous le seuil, envoie un push aux admin + logistique + gerant.
// Anti-spam : ne re-push pas pour le même MP avant 4h.
const _alerteStockLast = {};
async function verifierAlerteStockMP(ingredientId){
  if(!ingredientId || !GP_ADMIN_ID) return;
  // Anti-spam : skip si déjà notifié dans les 4 dernières heures
  const now = Date.now();
  if(_alerteStockLast[ingredientId] && now - _alerteStockLast[ingredientId] < 4*3600*1000) return;
  try{
    // Récupérer tous les mouvements de ce MP pour calculer le niveau actuel
    const{data:mvts}=await SB.from('gp_stock_mp').select('quantite,type')
      .eq('admin_id',GP_ADMIN_ID).eq('ingredient_id',ingredientId);
    if(!mvts || !mvts.length) return;
    const niveau = mvts.reduce((s,m)=>{
      const q = Number(m.quantite||0);
      return s + (m.type==='entree' ? q : -q);
    },0);
    // Trouver le MP (nom + seuil) dans le cache
    const ingr = (typeof GP_INGREDIENTS !== 'undefined' ? GP_INGREDIENTS : []).find(i=>i.id===ingredientId);
    if(!ingr) return;
    const seuil = Number(ingr.seuil_alerte||200);
    if(niveau >= seuil) return; // au-dessus du seuil → pas d'alerte
    // Récupérer les destinataires (admin + roles concernés)
    const{data:membres}=await SB.from('gp_membres').select('user_id,role')
      .eq('admin_id',GP_ADMIN_ID).eq('actif',true)
      .in('role',['admin','logistique','gerant','daf']);
    const userIds = [...new Set([
      GP_ADMIN_ID,
      ...((membres||[]).map(m=>m.user_id).filter(Boolean))
    ])];
    if(!userIds.length) return;
    pushSendToUsers(userIds,
      `🚨 Stock critique : ${ingr.nom}`,
      `Niveau : ${niveau.toFixed(1)} kg · seuil : ${seuil} kg. À réapprovisionner.`,
      { tag: `stock-${ingredientId}`, url: '/?page=stock' }
    );
    _alerteStockLast[ingredientId] = now;
  }catch(e){ /* silencieux */ }
}
