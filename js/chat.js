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
  // Marquer le channel comme lu (efface le badge)
  if(typeof chatMarquerLu==='function') chatMarquerLu();
  // Mettre à jour présence toutes les 60s
  if(PRESENCE_INTERVAL) clearInterval(PRESENCE_INTERVAL);
  PRESENCE_INTERVAL = setInterval(()=>{
    mettreAJourPresence(true);
    renderPresence();
  }, 60000);
  // Marquer hors ligne à la fermeture
  window.addEventListener('beforeunload', ()=>mettreAJourPresence(false));
}

// Marque le channel équipe comme lu pour l'utilisateur courant (efface le badge non-lu)
async function chatMarquerLu(){
  if(!GP_USER?.id||!GP_ADMIN_ID) return;
  await SB.from('gp_message_lectures').upsert({
    user_id:GP_USER.id, admin_id:GP_ADMIN_ID, channel:'equipe',
    last_read_at:new Date().toISOString()
  });
  if(typeof refreshChatBadge==='function') refreshChatBadge();
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
  const pvHtml=m.point_vente
    ?`<span style="font-size:9px;background:${pal.bg};color:${pal.text};border:1px solid ${pal.border};padding:1px 6px;border-radius:8px;white-space:nowrap">${pal.emoji} ${m.point_vente}</span>`
    :'<span style="font-size:9px;color:var(--textm)">🏭 Siège</span>';
  return `<div style="display:flex;align-items:center;gap:8px;padding:8px;border-radius:8px;margin-bottom:4px;background:rgba(14,20,40,.5)">
    <div style="width:8px;height:8px;border-radius:50%;background:${enLigne?'#22c55e':'#475569'};flex-shrink:0;margin-top:2px"></div>
    <div style="flex:1;min-width:0">
      <div style="display:flex;align-items:center;gap:5px;flex-wrap:wrap;margin-bottom:2px">
        <span style="font-size:12px;font-weight:700">${m.nom}</span>
        <span style="font-size:9px;font-weight:600;color:var(--g6);background:rgba(30,45,74,.8);padding:1px 6px;border-radius:8px">${(m.role||'').toUpperCase()}</span>
        ${pvHtml}
      </div>
      <div style="font-size:10px;color:var(--textm)">${enLigne?'<span style="color:var(--green);font-weight:600">● En ligne</span>':'<span>● '+depuis+'</span>'}</div>
    </div>
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
    const imgHtml=m.image_url
      ?`<img src="${m.image_url}" style="max-width:240px;max-height:240px;border-radius:8px;cursor:pointer;display:block;margin-bottom:${m.message?'6px':'0'}" onclick="window.open('${m.image_url}','_blank')">`
      :'';
    return `<div style="display:flex;flex-direction:${estMoi?'row-reverse':'row'};gap:8px;margin-bottom:10px;align-items:flex-end">
      <div style="width:28px;height:28px;border-radius:50%;background:${estMoi?'var(--vert2)':'rgba(30,45,74,.8)'};display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;flex-shrink:0;color:${estMoi?'#fff':'var(--g6)'}">${(m.auteur_nom||'?')[0].toUpperCase()}</div>
      <div style="max-width:75%">
        ${!estMoi?`<div style="font-size:10px;color:var(--textm);margin-bottom:2px;${estMoi?'text-align:right':''}">${m.auteur_nom} <span style="opacity:.6">· ${m.auteur_role||''}</span></div>`:''}
        <div style="background:${estMoi?'var(--vert2)':'rgba(30,45,74,.8)'};border:1px solid ${estMoi?'transparent':'var(--border)'};border-radius:${estMoi?'12px 12px 2px 12px':'12px 12px 12px 2px'};padding:8px 12px;font-size:13px;line-height:1.5">${imgHtml}${m.message||''}</div>
        <div style="font-size:10px;color:var(--textm);margin-top:2px;${estMoi?'text-align:right':''}">${isToday?heure:date+' '+heure}</div>
      </div>
    </div>`;
  }).join('');

  // Scroll vers le bas
  container.scrollTop=container.scrollHeight;
}

async function envoyerMessage(){
  const inp=document.getElementById('chat-input');
  const fileInp=document.getElementById('chat-file');
  const message=(inp?.value||'').trim();
  const file=fileInp?.files?.[0];
  if(!message && !file) return; // rien à envoyer

  // Upload image si présente
  let imageUrl=null;
  if(file){
    try{
      const blob=await chatCompresserImage(file);
      const path=`${GP_ADMIN_ID}/${Date.now()}_${Math.random().toString(36).slice(2,8)}.jpg`;
      const{error:upErr}=await SB.storage.from('chat-images').upload(path,blob,{contentType:'image/jpeg'});
      if(upErr) throw upErr;
      const{data:pub}=SB.storage.from('chat-images').getPublicUrl(path);
      imageUrl=pub?.publicUrl||null;
    }catch(e){
      notify('Erreur upload image: '+(e.message||e),'r');
      return;
    }
  }

  const nom=GP_USER.user_metadata?.nom||GP_USER.email?.split('@')[0]||'—';
  const{error}=await SB.from('gp_messages_equipe').insert({
    admin_id:GP_ADMIN_ID,
    auteur_id:GP_USER.id,
    auteur_nom:nom,
    auteur_role:GP_ROLE,
    message: message || '',
    image_url: imageUrl
  });
  if(error){notify('Erreur envoi message: '+error.message,'r');return;}

  // Reset champs
  if(inp) inp.value='';
  if(fileInp) fileInp.value='';
  const prev=document.getElementById('chat-file-preview'); if(prev) prev.innerHTML='';

  // ── PUSH NOTIF aux autres membres de l'équipe (Trigger A) ──
  if(typeof pushSendToTeam === 'function'){
    const preview = message ? (message.length>80 ? message.slice(0,80)+'…' : message) : (imageUrl ? '📷 Photo' : '');
    pushSendToTeam(`💬 ${nom}`, preview, {
      excludeSelf: true,
      tag: 'chat-equipe',
      url: '/?page=equipe'
    });
  }
}

// Compresse une image (max 1200px, JPEG 85%) avant upload
async function chatCompresserImage(file){
  return new Promise((resolve,reject)=>{
    const reader=new FileReader();
    reader.onload=ev=>{
      const img=new Image();
      img.onload=()=>{
        const max=1200;
        let w=img.width, h=img.height;
        if(w>max||h>max){
          if(w>h){ h=Math.round(h*max/w); w=max; }
          else   { w=Math.round(w*max/h); h=max; }
        }
        const cv=document.createElement('canvas');
        cv.width=w; cv.height=h;
        cv.getContext('2d').drawImage(img,0,0,w,h);
        cv.toBlob(b=>b?resolve(b):reject(new Error('Compression échouée')),'image/jpeg',0.85);
      };
      img.onerror=()=>reject(new Error('Image illisible'));
      img.src=ev.target.result;
    };
    reader.onerror=()=>reject(new Error('Lecture fichier échouée'));
    reader.readAsDataURL(file);
  });
}

// Aperçu local de l'image sélectionnée
function chatFilePreview(){
  const fileInp=document.getElementById('chat-file');
  const prev=document.getElementById('chat-file-preview');
  if(!fileInp||!prev) return;
  const f=fileInp.files?.[0];
  if(!f){ prev.innerHTML=''; return; }
  const url=URL.createObjectURL(f);
  prev.innerHTML=`<div style="display:flex;align-items:center;gap:8px;background:rgba(22,163,74,.08);border:1px solid rgba(22,163,74,.3);border-radius:8px;padding:6px 10px;font-size:11px;margin-bottom:6px">
    <img src="${url}" style="width:40px;height:40px;object-fit:cover;border-radius:6px">
    <span style="flex:1;color:var(--g6);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${f.name}</span>
    <button onclick="document.getElementById('chat-file').value='';chatFilePreview()" style="background:none;border:none;color:var(--red);cursor:pointer;font-size:14px">✕</button>
  </div>`;
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
  const imgHtml=msg.image_url
    ?`<img src="${msg.image_url}" style="max-width:240px;max-height:240px;border-radius:8px;cursor:pointer;display:block;margin-bottom:${msg.message?'6px':'0'}" onclick="window.open('${msg.image_url}','_blank')">`
    :'';
  div.innerHTML=`
    <div style="width:28px;height:28px;border-radius:50%;background:${estMoi?'var(--vert2)':'rgba(30,45,74,.8)'};display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;flex-shrink:0;color:${estMoi?'#fff':'var(--g6)'}">${(msg.auteur_nom||'?')[0].toUpperCase()}</div>
    <div style="max-width:75%">
      ${!estMoi?`<div style="font-size:10px;color:var(--textm);margin-bottom:2px">${msg.auteur_nom} <span style="opacity:.6">· ${msg.auteur_role||''}</span></div>`:''}
      <div style="background:${estMoi?'var(--vert2)':'rgba(30,45,74,.8)'};border:1px solid ${estMoi?'transparent':'var(--border)'};border-radius:${estMoi?'12px 12px 2px 12px':'12px 12px 12px 2px'};padding:8px 12px;font-size:13px;line-height:1.5">${imgHtml}${msg.message||''}</div>
      <div style="font-size:10px;color:var(--textm);margin-top:2px;${estMoi?'text-align:right':''}">${heure}</div>
    </div>`;
  container.appendChild(div);
  container.scrollTop=container.scrollHeight;
  // Notif si pas sur la page chat
  const activePage=document.querySelector('.page.active')?.id;
  if(activePage!=='page-equipe'&&!estMoi){
    const preview = msg.message ? msg.message.slice(0,40)+(msg.message.length>40?'...':'') : '📷 Photo';
    notify(`💬 ${msg.auteur_nom} : ${preview}`, 'gold');
  }
  // Si on est sur la page chat, marquer comme lu ; sinon rafraîchir le badge
  if(activePage==='page-equipe'){
    if(typeof chatMarquerLu==='function') chatMarquerLu();
  } else {
    if(typeof refreshChatBadge==='function') refreshChatBadge();
  }
}

async function chargerPlusDeMessages(){
  CHAT_PAGE++;
  await renderChat();
}
