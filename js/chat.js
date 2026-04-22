// ══════════════════════════════════════════════════
// PROVENDA — CHAT ÉQUIPE & PRÉSENCE EN LIGNE
// Realtime Supabase
// ══════════════════════════════════════════════════

let CHAT_CHANNEL = null;
let PRESENCE_INTERVAL = null;
let CHAT_PAGE = 1;
const CHAT_PAGE_SIZE = 30;

// ── INITIALISATION ────────────────────────────────
async function initChat(){
  await mettreAJourPresence(true);
  await renderChat();
  await renderPresence();
  abonnerChatRealtime();
  // Mettre à jour présence toutes les 60s
  if(PRESENCE_INTERVAL) clearInterval(PRESENCE_INTERVAL);
  PRESENCE_INTERVAL = setInterval(()=>{
    mettreAJourPresence(true);
    renderPresence();
  }, 60000);
  // Marquer hors ligne à la fermeture
  window.addEventListener('beforeunload', ()=>mettreAJourPresence(false));
}

// ── PRÉSENCE ──────────────────────────────────────
async function mettreAJourPresence(enLigne){
  if(!GP_USER||!GP_ADMIN_ID)return;
  const nom=GP_USER.user_metadata?.nom||GP_USER.email?.split('@')[0]||'—';
  await SB.from('gp_presence').upsert({
    admin_id:GP_ADMIN_ID,
    user_id:GP_USER.id,
    nom,
    role:GP_ROLE,
    point_vente:GP_POINT_VENTE||null,
    derniere_vue:new Date().toISOString(),
    en_ligne:enLigne
  },{onConflict:'admin_id,user_id'});
}

async function renderPresence(){
  const{data:membres}=await SB.from('gp_presence').select('*')
    .eq('admin_id',GP_ADMIN_ID)
    .order('en_ligne',{ascending:false})
    .order('derniere_vue',{ascending:false});
  const M=membres||[];

  const container=document.getElementById('presence-liste');
  if(!container)return;

  const enLigne=M.filter(m=>m.en_ligne&&diffMinutes(m.derniere_vue)<5);
  const horsLigne=M.filter(m=>!enLigne.find(e=>e.user_id===m.user_id));

  container.innerHTML=`
    <div style="font-size:10px;font-weight:700;color:var(--green);text-transform:uppercase;letter-spacing:1px;margin-bottom:6px">
      🟢 En ligne (${enLigne.length})
    </div>
    ${enLigne.map(m=>presenceBadge(m,true)).join('')}
    ${horsLigne.length?`
    <div style="font-size:10px;font-weight:700;color:var(--textm);text-transform:uppercase;letter-spacing:1px;margin:10px 0 6px">
      ⚫ Hors ligne (${horsLigne.length})
    </div>
    ${horsLigne.map(m=>presenceBadge(m,false)).join('')}`:''}`;
}

function presenceBadge(m,enLigne){
  const depuis=tempsDepuis(m.derniere_vue);
  const pal=m.point_vente?pvPalette(m.point_vente):{bg:'rgba(30,45,74,.5)',border:'rgba(100,116,139,.3)',text:'#94A3B8',emoji:'🏭'};
  return `<div style="display:flex;align-items:center;gap:8px;padding:6px 8px;border-radius:8px;margin-bottom:4px;background:rgba(14,20,40,.5)">
    <div style="width:8px;height:8px;border-radius:50%;background:${enLigne?'#22c55e':'#475569'};flex-shrink:0"></div>
    <div style="flex:1;min-width:0">
      <div style="font-size:12px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${m.nom}</div>
      <div style="font-size:10px;color:var(--textm)">${m.role?.toUpperCase()||'—'} ${m.point_vente?'· '+m.point_vente:''}</div>
    </div>
    <div style="font-size:10px;color:var(--textm);white-space:nowrap">${enLigne?'<span style="color:var(--green)">maintenant</span>':depuis}</div>
  </div>`;
}

function diffMinutes(dateStr){
  return Math.floor((Date.now()-new Date(dateStr).getTime())/60000);
}

function tempsDepuis(dateStr){
  const diff=diffMinutes(dateStr);
  if(diff<1)return 'À l\'instant';
  if(diff<60)return `Il y a ${diff}min`;
  if(diff<1440)return `Il y a ${Math.floor(diff/60)}h`;
  return `Il y a ${Math.floor(diff/1440)}j`;
}

// ── CHAT ──────────────────────────────────────────
async function renderChat(){
  const container=document.getElementById('chat-messages');
  if(!container)return;
  container.innerHTML='<div style="color:var(--textm);font-size:11px;text-align:center;padding:12px">Chargement...</div>';

  const{data:msgs}=await SB.from('gp_messages_equipe').select('*')
    .eq('admin_id',GP_ADMIN_ID)
    .order('created_at',{ascending:false})
    .range(0, CHAT_PAGE*CHAT_PAGE_SIZE-1);

  const M=(msgs||[]).reverse();
  if(!M.length){
    container.innerHTML='<div style="color:var(--textm);font-size:11px;text-align:center;padding:20px">Aucun message. Soyez le premier à écrire !</div>';
    return;
  }

  container.innerHTML=M.map(m=>{
    const estMoi=m.auteur_id===GP_USER?.id;
    const heure=new Date(m.created_at).toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'});
    const date=new Date(m.created_at).toLocaleDateString('fr-FR',{day:'2-digit',month:'short'});
    const isToday=new Date(m.created_at).toDateString()===new Date().toDateString();
    return `<div style="display:flex;flex-direction:${estMoi?'row-reverse':'row'};gap:8px;margin-bottom:10px;align-items:flex-end">
      <div style="width:28px;height:28px;border-radius:50%;background:${estMoi?'var(--vert2)':'rgba(30,45,74,.8)'};display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;flex-shrink:0;color:${estMoi?'#fff':'var(--g6)'}">${(m.auteur_nom||'?')[0].toUpperCase()}</div>
      <div style="max-width:75%">
        ${!estMoi?`<div style="font-size:10px;color:var(--textm);margin-bottom:2px;${estMoi?'text-align:right':''}">${m.auteur_nom} <span style="opacity:.6">· ${m.auteur_role||''}</span></div>`:''}
        <div style="background:${estMoi?'var(--vert2)':'rgba(30,45,74,.8)'};border:1px solid ${estMoi?'transparent':'var(--border)'};border-radius:${estMoi?'12px 12px 2px 12px':'12px 12px 12px 2px'};padding:8px 12px;font-size:13px;line-height:1.5">${m.message}</div>
        <div style="font-size:10px;color:var(--textm);margin-top:2px;${estMoi?'text-align:right':''}">${isToday?heure:date+' '+heure}</div>
      </div>
    </div>`;
  }).join('');

  // Scroll vers le bas
  container.scrollTop=container.scrollHeight;
}

async function envoyerMessage(){
  const inp=document.getElementById('chat-input');
  const message=inp?.value.trim();
  if(!message)return;
  inp.value='';

  const nom=GP_USER.user_metadata?.nom||GP_USER.email?.split('@')[0]||'—';
  const{error}=await SB.from('gp_messages_equipe').insert({
    admin_id:GP_ADMIN_ID,
    auteur_id:GP_USER.id,
    auteur_nom:nom,
    auteur_role:GP_ROLE,
    message
  });
  if(error){notify('Erreur envoi message: '+error.message,'r');}
}

function chatKeydown(e){
  if(e.key==='Enter'&&!e.shiftKey){
    e.preventDefault();
    envoyerMessage();
  }
}

// ── REALTIME ──────────────────────────────────────
function abonnerChatRealtime(){
  if(CHAT_CHANNEL) SB.removeChannel(CHAT_CHANNEL);
  CHAT_CHANNEL=SB.channel('chat-equipe-'+GP_ADMIN_ID)
    .on('postgres_changes',{
      event:'INSERT',
      schema:'public',
      table:'gp_messages_equipe',
      filter:'admin_id=eq.'+GP_ADMIN_ID
    },(payload)=>{
      ajouterMessageRealtime(payload.new);
    })
    .subscribe();
}

function ajouterMessageRealtime(msg){
  const container=document.getElementById('chat-messages');
  if(!container)return;
  const estMoi=msg.auteur_id===GP_USER?.id;
  // Ne pas ajouter si c'est notre propre message (déjà ajouté par renderChat)
  const heure=new Date(msg.created_at).toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'});
  const div=document.createElement('div');
  div.style.cssText=`display:flex;flex-direction:${estMoi?'row-reverse':'row'};gap:8px;margin-bottom:10px;align-items:flex-end`;
  div.innerHTML=`
    <div style="width:28px;height:28px;border-radius:50%;background:${estMoi?'var(--vert2)':'rgba(30,45,74,.8)'};display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;flex-shrink:0;color:${estMoi?'#fff':'var(--g6)'}">${(msg.auteur_nom||'?')[0].toUpperCase()}</div>
    <div style="max-width:75%">
      ${!estMoi?`<div style="font-size:10px;color:var(--textm);margin-bottom:2px">${msg.auteur_nom} <span style="opacity:.6">· ${msg.auteur_role||''}</span></div>`:''}
      <div style="background:${estMoi?'var(--vert2)':'rgba(30,45,74,.8)'};border:1px solid ${estMoi?'transparent':'var(--border)'};border-radius:${estMoi?'12px 12px 2px 12px':'12px 12px 12px 2px'};padding:8px 12px;font-size:13px;line-height:1.5">${msg.message}</div>
      <div style="font-size:10px;color:var(--textm);margin-top:2px;${estMoi?'text-align:right':''}">${heure}</div>
    </div>`;
  container.appendChild(div);
  container.scrollTop=container.scrollHeight;
  // Notif si pas sur la page chat
  const activePage=document.querySelector('.page.active')?.id;
  if(activePage!=='page-equipe'&&!estMoi){
    notify(`💬 ${msg.auteur_nom} : ${msg.message.slice(0,40)}${msg.message.length>40?'...':''}`, 'gold');
  }
}

async function chargerPlusDeMessages(){
  CHAT_PAGE++;
  await renderChat();
}
