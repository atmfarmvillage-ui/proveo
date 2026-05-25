// ══════════════════════════════════════════════════
// PROVENDA — NOTIFICATIONS IN-APP (badge cloche topbar)
// Compteur de messages chat non lus + refresh polling + Realtime
// ══════════════════════════════════════════════════

let CHAT_BADGE_POLL = null;
let CHAT_BADGE_RT_SUB = null;

// Calcule le nombre de messages chat non lus pour l'utilisateur courant
async function refreshChatBadge(){
  if(!GP_USER?.id||!GP_ADMIN_ID) return;
  // 1. Récupérer la date de dernière lecture du channel équipe
  const{data:lect}=await SB.from('gp_message_lectures')
    .select('last_read_at')
    .eq('user_id',GP_USER.id).eq('admin_id',GP_ADMIN_ID).eq('channel','equipe')
    .maybeSingle();
  const lastReadAt = lect?.last_read_at || '1970-01-01T00:00:00Z';
  // 2. Compter les messages plus récents que la dernière lecture, qui ne sont pas de moi
  const{count}=await SB.from('gp_messages_equipe')
    .select('id',{count:'exact',head:true})
    .eq('admin_id',GP_ADMIN_ID)
    .gt('created_at',lastReadAt)
    .neq('auteur_id',GP_USER.id);
  // 3. Mettre à jour le badge
  const badge=document.getElementById('chat-unread-badge');
  if(!badge) return;
  const n=count||0;
  if(n>0){
    badge.textContent = n>99 ? '99+' : String(n);
    badge.style.display='inline-flex';
  } else {
    badge.style.display='none';
  }
}

// Subscribe Realtime sur gp_messages_equipe pour rafraîchir le badge en direct
function chatBadgeSubscribe(){
  if(CHAT_BADGE_RT_SUB||!GP_ADMIN_ID) return;
  CHAT_BADGE_RT_SUB = SB.channel('chat-badge-'+GP_ADMIN_ID)
    .on('postgres_changes',{
      event:'INSERT',
      schema:'public',
      table:'gp_messages_equipe',
      filter:'admin_id=eq.'+GP_ADMIN_ID
    },()=>{
      refreshChatBadge();
    })
    .subscribe();
}

// Lance le polling toutes les 60s en complément du Realtime (sécurité)
function startChatBadgePolling(){
  if(CHAT_BADGE_POLL) clearInterval(CHAT_BADGE_POLL);
  refreshChatBadge();
  chatBadgeSubscribe();
  CHAT_BADGE_POLL = setInterval(refreshChatBadge, 60000);
}

// À appeler une fois après bootApp
function initNotifications(){
  if(!GP_USER||!GP_ADMIN_ID) return;
  startChatBadgePolling();
}
