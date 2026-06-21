// ══════════════════════════════════════════════════
// PROVENDA IA — Front : assistant (Comptable + Marketing)
// Bouton flottant + panneau de chat. get_ia_contexte → Worker proveo-ia.
// ══════════════════════════════════════════════════

const IA_WORKER = 'https://proveo-ia.atm-farmvillage.workers.dev';

let _iaPersona = 'comptable';
let _iaTier = 'eco';
let _iaCtx = null;           // contexte chargé (cache par ouverture)
let _iaHistory = [];         // [{role, content}]
let _iaBusy = false;

function _iaAllowed(){
  return ['admin','secretaire','daf','directeur'].includes(GP_ROLE);
}

function initIA(){
  if(!GP_ADMIN_ID || !_iaAllowed()) return;
  if(document.getElementById('ia-fab')) { document.getElementById('ia-fab').style.display='flex'; return; }
  // Persona par défaut selon le rôle
  _iaPersona = (GP_ROLE==='secretaire') ? 'marketing' : 'comptable';

  // Bouton flottant
  const fab = document.createElement('button');
  fab.id = 'ia-fab';
  fab.title = 'Assistant IA SADARI';
  fab.innerHTML = '🤖';
  fab.style.cssText = 'position:fixed;bottom:20px;right:20px;z-index:1200;width:56px;height:56px;border-radius:50%;border:none;'
    + 'background:linear-gradient(135deg,var(--g4,#16A34A),var(--g6,#15803D));color:#fff;font-size:26px;cursor:pointer;'
    + 'box-shadow:0 6px 18px rgba(22,163,74,.45);display:flex;align-items:center;justify-content:center';
  fab.onclick = openIA;
  document.body.appendChild(fab);

  // Panneau (drawer)
  const panel = document.createElement('div');
  panel.id = 'ia-panel';
  panel.style.cssText = 'position:fixed;inset:0;z-index:1201;background:rgba(0,0,0,.45);display:none;align-items:stretch;justify-content:flex-end';
  panel.innerHTML = `
    <div onclick="event.stopPropagation()" style="background:var(--card2,#fff);width:100%;max-width:440px;height:100%;display:flex;flex-direction:column;box-shadow:-8px 0 24px rgba(0,0,0,.2)">
      <div style="padding:14px 16px;border-bottom:1px solid var(--border,#e2e8f0);display:flex;align-items:center;justify-content:space-between">
        <div style="font-weight:800;font-size:15px;color:var(--text)">🤖 Assistant SADARI</div>
        <button onclick="closeIA()" style="background:none;border:none;font-size:22px;cursor:pointer;color:var(--textm,#64748b)">×</button>
      </div>
      <div style="padding:10px 14px;display:flex;gap:8px;align-items:center;border-bottom:1px solid var(--border,#e2e8f0);flex-wrap:wrap">
        <button id="ia-p-comptable" class="ia-perso" onclick="setIAPersona('comptable')">🧮 Comptable</button>
        <button id="ia-p-marketing" class="ia-perso" onclick="setIAPersona('marketing')">📣 Marketing</button>
        <label style="margin-left:auto;font-size:11px;color:var(--textm,#64748b);display:flex;align-items:center;gap:5px;cursor:pointer">
          <input type="checkbox" id="ia-deep" onchange="_iaTier=this.checked?'pro':'eco'"> 🧠 Approfondir
        </label>
      </div>
      <div id="ia-msgs" style="flex:1;overflow-y:auto;padding:14px;display:flex;flex-direction:column;gap:10px;background:var(--bg,#f0fdf4)"></div>
      <div style="padding:10px 12px;border-top:1px solid var(--border,#e2e8f0);display:flex;gap:8px">
        <textarea id="ia-input" rows="1" placeholder="Pose ta question…"
          style="flex:1;resize:none;padding:10px;border:1px solid #ccc;border-radius:10px;font-size:14px;font-family:inherit;color:var(--text);background:#fff"
          onkeydown="if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();sendIA();}"></textarea>
        <button id="ia-send" onclick="sendIA()" style="background:var(--g4,#16A34A);color:#fff;border:none;border-radius:10px;padding:0 16px;font-size:18px;cursor:pointer">➤</button>
      </div>
    </div>`;
  panel.onclick = closeIA;
  document.body.appendChild(panel);

  // Styles des boutons persona
  const st = document.createElement('style');
  st.textContent = `.ia-perso{padding:6px 10px;border-radius:8px;border:2px solid #e2e8f0;background:#fff;cursor:pointer;font-size:12px;font-weight:700;color:var(--text)}
    .ia-perso.on{border-color:var(--g4,#16A34A);background:var(--bg,#f0fdf4);color:var(--g6,#15803D)}`;
  document.head.appendChild(st);
}

function setIAPersona(p){
  _iaPersona = p;
  document.getElementById('ia-p-comptable')?.classList.toggle('on', p==='comptable');
  document.getElementById('ia-p-marketing')?.classList.toggle('on', p==='marketing');
}

async function openIA(){
  document.getElementById('ia-panel').style.display='flex';
  setIAPersona(_iaPersona);
  if(!_iaHistory.length) _iaAddMsg('ai', 'Bonjour 👋 Je suis ton assistant SADARI. Pose-moi une question sur tes chiffres, tes clients, tes relances…');
  // Recharger le contexte à chaque ouverture (données fraîches)
  _iaCtx = null;
  try{
    const { data } = await SB.rpc('get_ia_contexte');
    _iaCtx = data || {};
  }catch(e){ _iaCtx = {}; }
}
function closeIA(){ document.getElementById('ia-panel').style.display='none'; }

function _iaEsc(s){ return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
function _iaAddMsg(who, text){
  const box = document.getElementById('ia-msgs');
  if(!box) return null;
  const el = document.createElement('div');
  const mine = who==='user';
  el.style.cssText = `max-width:85%;padding:9px 12px;border-radius:12px;font-size:13px;line-height:1.45;white-space:pre-wrap;`
    + (mine ? 'align-self:flex-end;background:var(--g4,#16A34A);color:#fff' : 'align-self:flex-start;background:#fff;color:var(--text);border:1px solid var(--border,#e2e8f0)');
  el.innerHTML = _iaEsc(text);
  box.appendChild(el);
  box.scrollTop = box.scrollHeight;
  return el;
}

async function sendIA(){
  if(_iaBusy) return;
  const inp = document.getElementById('ia-input');
  const q = (inp?.value||'').trim();
  if(!q) return;
  inp.value=''; _iaBusy=true;
  document.getElementById('ia-send').disabled=true;
  _iaAddMsg('user', q);
  const loading = _iaAddMsg('ai', '…');

  try{
    const { data:{ session } } = await SB.auth.getSession();
    const token = session?.access_token;
    if(!token){ loading.innerHTML='⚠ Session expirée, reconnecte-toi.'; _iaBusy=false; document.getElementById('ia-send').disabled=false; return; }
    if(_iaCtx===null){ try{ const{data}=await SB.rpc('get_ia_contexte'); _iaCtx=data||{}; }catch(e){ _iaCtx={}; } }

    const res = await fetch(IA_WORKER, {
      method:'POST',
      headers:{ 'Content-Type':'application/json', Authorization:'Bearer '+token },
      body: JSON.stringify({ persona:_iaPersona, question:q, contexte:_iaCtx, history:_iaHistory.slice(-8), tier:_iaTier })
    });
    const j = await res.json();
    if(!res.ok || j.error){ loading.innerHTML = '⚠ ' + _iaEsc(j.error||('Erreur '+res.status)) + (j.detail?'<br><small>'+_iaEsc(j.detail)+'</small>':''); }
    else {
      loading.innerHTML = _iaEsc(j.reply);
      _iaHistory.push({role:'user',content:q}, {role:'assistant',content:j.reply});
    }
  }catch(e){
    loading.innerHTML = '⚠ Connexion impossible. Réessaie.';
  }
  _iaBusy=false;
  const sb=document.getElementById('ia-send'); if(sb) sb.disabled=false;
}
