// ══════════════════════════════════════════════════
// PROVENDA — NOTIFICATIONS IN-APP (badge cloche topbar)
// Compteur de messages chat non lus + refresh polling + Realtime
// ══════════════════════════════════════════════════

let CHAT_BADGE_POLL = null;
let _CHAT_BADGE_LAST = 0; // debounce timestamp

// Calcule le nombre de messages chat non lus pour l'utilisateur courant
// Realtime déjà géré par chat.js (ajouterMessageRealtime appelle refreshChatBadge)
// Pas de subscription doublonnée ici, juste un polling de secours espacé + skip si onglet caché.
async function refreshChatBadge(){
  if(!GP_USER?.id||!GP_ADMIN_ID) return;
  // Debounce : ignorer si appelée il y a moins de 1.5s (cas double-trigger Realtime+chat.js)
  const now=Date.now();
  if(now - _CHAT_BADGE_LAST < 1500) return;
  _CHAT_BADGE_LAST = now;
  try{
    const{data:lect}=await SB.from('gp_message_lectures')
      .select('last_read_at')
      .eq('user_id',GP_USER.id).eq('admin_id',GP_ADMIN_ID).eq('channel','equipe')
      .maybeSingle();
    const lastReadAt = lect?.last_read_at || '1970-01-01T00:00:00Z';
    const{count}=await SB.from('gp_messages_equipe')
      .select('id',{count:'exact',head:true})
      .eq('admin_id',GP_ADMIN_ID)
      .gt('created_at',lastReadAt)
      .neq('auteur_id',GP_USER.id);
    const badge=document.getElementById('chat-unread-badge');
    if(!badge) return;
    const n=count||0;
    if(n>0){
      badge.textContent = n>99 ? '99+' : String(n);
      badge.style.display='inline-flex';
    } else {
      badge.style.display='none';
    }
  }catch(e){ /* silencieux */ }
}

// Polling de secours toutes les 5 minutes — seulement si l'onglet est visible
function startChatBadgePolling(){
  if(CHAT_BADGE_POLL) clearInterval(CHAT_BADGE_POLL);
  refreshChatBadge();
  CHAT_BADGE_POLL = setInterval(()=>{
    if(document.visibilityState==='visible') refreshChatBadge();
  }, 300000); // 5 min
}

// À appeler une fois après bootApp
function initNotifications(){
  if(!GP_USER||!GP_ADMIN_ID) return;
  startChatBadgePolling();
}
