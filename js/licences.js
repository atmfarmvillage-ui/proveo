// ══════════════════════════════════════════════════
// PROVENDA — GESTION DES LICENCES (clés d'activation)
// ══════════════════════════════════════════════════
// Algorithme repris du générateur ATM original (mêmes paramètres)

const _ATM_SECRET = "ATM_SECRET_SADARI_2026";

function _hash32(s){
  let h = 0x811c9dc5;
  for(let i=0; i<s.length; i++){
    h ^= s.charCodeAt(i);
    h = (h * 0x01000193) >>> 0;
  }
  return h;
}

function _b36pad(n, l){
  return n.toString(36).toUpperCase().padStart(l, '0').slice(-l);
}

// Génère une clé compatible avec le générateur ATM
// Format : ATM-TIER-KYxx-XXXX
function genererCleATM(jours, tier = 'PROV'){
  const d1 = _b36pad(Math.floor(jours / 36**2), 2) + _b36pad(jours % 36**2, 2);
  const S1 = tier;
  const S2 = 'KY' + d1.slice(0, 2);
  // nonce aléatoire : sans lui la clé serait identique pour une même durée/tier
  // (l'activation valide par recherche en base + format, pas par recalcul du checksum)
  const nonce = Math.random().toString(36).slice(2) + Date.now();
  const cs = _hash32(S1 + S2 + jours + _ATM_SECRET + nonce);
  const S3 = _b36pad(cs, 4);
  return `ATM-${S1}-${S2}-${S3}`;
}

// Vérifie le format d'une clé (sanity check)
function _formatCleValide(cle){
  return /^ATM-[A-Z0-9]{4}-KY[A-Z0-9]{2}-[A-Z0-9]{4}$/.test((cle || '').trim().toUpperCase());
}

// ══════════════════════════════════════════════════
// PAGE ADMIN — GESTION DES LICENCES (OWNER only)
// ══════════════════════════════════════════════════
function _estOwner(){
  return (typeof GP_CONFIG !== 'undefined') && GP_CONFIG?.plan === 'OWNER';
}

async function renderPageLicences(){
  // Protection : seuls les OWNER (équipe interne ATM) peuvent accéder
  if(!_estOwner()){
    document.getElementById('lic-kpis').innerHTML = '';
    document.getElementById('lic-liste').innerHTML = `
      <div style="background:rgba(239,68,68,.08);border:1px solid rgba(239,68,68,.3);border-radius:10px;padding:20px;text-align:center">
        <div style="font-size:14px;color:var(--red);font-weight:700;margin-bottom:8px">🔒 Accès restreint</div>
        <div style="font-size:11px;color:var(--textm)">Cette page est réservée à l'équipe interne ATM Farm Village (plan OWNER).</div>
      </div>`;
    return;
  }
  // Filtres
  const filtre = document.getElementById('lic-filtre')?.value || 'all';
  const{data:cles} = await SB.from('gp_cles')
    .select('*')
    .eq('cree_par', GP_ADMIN_ID)
    .order('cree_le', { ascending: false });
  const L = cles || [];
  const filtered = filtre === 'all' ? L
    : filtre === 'disponibles' ? L.filter(c => !c.utilisee_par)
    : L.filter(c => c.utilisee_par);

  const dispo = L.filter(c => !c.utilisee_par).length;
  const utilisees = L.filter(c => c.utilisee_par).length;

  document.getElementById('lic-kpis').innerHTML = `
    <div class="econo-box"><div class="econo-val">${L.length}</div><div class="econo-lbl">Total</div></div>
    <div class="econo-box"><div class="econo-val" style="color:var(--green)">${dispo}</div><div class="econo-lbl">Disponibles</div></div>
    <div class="econo-box"><div class="econo-val" style="color:var(--textm)">${utilisees}</div><div class="econo-lbl">Utilisées</div></div>
  `;

  document.getElementById('lic-liste').innerHTML = filtered.length ? `
    <div style="overflow-x:auto"><table class="tbl" style="font-size:11px">
      <thead><tr>
        <th>Clé</th><th>Durée</th><th>Créée le</th><th>Statut</th><th>Note</th><th></th>
      </tr></thead>
      <tbody>
      ${filtered.map(c => {
        const enUtilisation = !!c.utilisee_par;
        return `<tr style="${enUtilisation?'opacity:.6':''}">
          <td style="font-family:'DM Mono',monospace;font-size:10px">${c.cle}</td>
          <td>${c.duree_jours} j</td>
          <td style="font-size:10px;color:var(--textm)">${c.cree_le.slice(0,10)}</td>
          <td>
            ${enUtilisation
              ? `<span class="badge bdg-gold" style="font-size:9px">UTILISÉE</span><br><span style="font-size:9px;color:var(--textm)">${c.utilisee_le?.slice(0,10)||''}</span>`
              : '<span class="badge bdg-g" style="font-size:9px">DISPONIBLE</span>'}
          </td>
          <td style="font-size:10px;color:var(--textm)">${c.note || '—'}</td>
          <td>
            ${!enUtilisation ? `
              <button class="btn btn-out btn-sm" onclick="copierCleAdmin('${c.cle}')" title="Copier" style="padding:3px 7px">📋</button>
              <a href="https://wa.me/?text=${encodeURIComponent('🔑 Voici votre clé d\'activation PROVENDA :\n\n'+c.cle+'\n\nValide '+c.duree_jours+' jours.\n\nUtilisez-la sur : '+window.location.origin+'/gp_paiement.html')}" target="_blank" class="btn btn-g btn-sm" style="padding:3px 7px;text-decoration:none">📲</a>
              <button class="btn btn-red btn-sm" onclick="supprimerCle('${c.id}')" style="padding:3px 7px">✕</button>
            ` : ''}
          </td>
        </tr>`;
      }).join('')}
      </tbody>
    </table></div>
  ` : '<div style="color:var(--textm);font-size:12px;padding:14px;text-align:center">Aucune clé. Cliquez "➕ Générer une nouvelle clé".</div>';
}

async function genererNouvelleCle(){
  const err = document.getElementById('lic-gen-err');
  err.textContent = '';
  if(!_estOwner()){ err.textContent = '🔒 Accès refusé (plan OWNER requis).'; return; }
  const jours = +document.getElementById('lic-jours').value || 0;
  const note = document.getElementById('lic-note').value.trim() || null;

  if(jours < 1 || jours > 3650){
    err.textContent = 'Durée invalide (1 à 3650 jours).';
    return;
  }

  // Choisir le tier en fonction de la durée
  const tier = jours <= 7 ? 'DEMO' : jours >= 1825 ? 'ENTR' : jours >= 365 ? 'PROV' : 'BASE';
  const cle = genererCleATM(jours, tier);

  const{error} = await SB.from('gp_cles').insert({
    cle: cle,
    duree_jours: jours,
    cree_par: GP_ADMIN_ID,
    note: note,
  });

  if(error){
    err.textContent = 'Erreur : ' + error.message;
    return;
  }

  // Afficher la clé générée + bouton copier rapide
  document.getElementById('lic-gen-resultat').style.display = 'block';
  document.getElementById('lic-gen-cle').textContent = cle;
  document.getElementById('lic-gen-info').textContent = `${jours} jours · Tier ${tier}` + (note ? ` · ${note}` : '');
  document.getElementById('lic-jours').value = '';
  document.getElementById('lic-note').value = '';
  notify(`Clé ${cle} générée ✓`, 'gold');
  await renderPageLicences();
}

function copierCleGen(){
  const cle = document.getElementById('lic-gen-cle').textContent;
  navigator.clipboard.writeText(cle).then(() => notify('Clé copiée 📋', 'gold'));
}

function copierCleAdmin(cle){
  navigator.clipboard.writeText(cle).then(() => notify('Clé copiée 📋', 'gold'));
}

async function supprimerCle(id){
  if(!confirm('Supprimer cette clé ? Si elle a été partagée, elle ne fonctionnera plus.')) return;
  const{error} = await SB.from('gp_cles').delete().eq('id', id);
  if(error){ notify('Erreur : '+error.message, 'r'); return; }
  notify('Clé supprimée', 'r');
  await renderPageLicences();
}

// ══════════════════════════════════════════════════
// CÔTÉ CLIENT — ACTIVATION D'UNE CLÉ (utilisée par gp_paiement.html)
// ══════════════════════════════════════════════════
// Retourne {success, message, plan_expire_le}
async function activerCleATM(sbClient, userId, cleRaw){
  const cle = (cleRaw || '').trim().toUpperCase();
  if(!_formatCleValide(cle)){
    return { success: false, message: 'Format de clé invalide. Format attendu : ATM-XXXX-KYxx-XXXX' };
  }

  // Lookup en DB
  const{data:cleData, error:errLookup} = await sbClient.from('gp_cles')
    .select('*').eq('cle', cle).maybeSingle();
  if(errLookup){
    return { success: false, message: 'Erreur base de données : ' + errLookup.message };
  }
  if(!cleData){
    return { success: false, message: 'Clé inconnue. Vérifiez la saisie ou demandez une nouvelle clé.' };
  }
  if(cleData.utilisee_par){
    return { success: false, message: 'Cette clé a déjà été utilisée le ' + (cleData.utilisee_le?.slice(0,10) || '?') };
  }

  // Marquer la clé utilisée
  const{error:errUpd} = await sbClient.from('gp_cles').update({
    utilisee_par: userId,
    utilisee_le: new Date().toISOString(),
  }).eq('id', cleData.id).is('utilisee_par', null);  // double-check pour éviter race condition

  if(errUpd){
    return { success: false, message: 'Erreur activation : ' + errUpd.message };
  }

  // Calculer la nouvelle date d'expiration (prolonge la date actuelle si dans le futur)
  const{data:cfg} = await sbClient.from('gp_config').select('plan_expire_le')
    .eq('user_id', userId).maybeSingle();
  const maintenant = new Date();
  const baseDate = (cfg?.plan_expire_le && new Date(cfg.plan_expire_le) > maintenant)
    ? new Date(cfg.plan_expire_le)
    : maintenant;
  const nouvelleExpiration = new Date(baseDate.getTime() + cleData.duree_jours * 24*60*60*1000);

  // Mettre à jour gp_config
  await sbClient.from('gp_config').upsert({
    user_id: userId,
    plan: 'CLE_ACTIVEE',
    plan_expire_le: nouvelleExpiration.toISOString(),
  }, { onConflict: 'user_id' });

  return {
    success: true,
    message: `Clé activée ! Accès prolongé de ${cleData.duree_jours} jours.`,
    plan_expire_le: nouvelleExpiration,
    duree_jours: cleData.duree_jours,
  };
}

// ══════════════════════════════════════════════════
// PAGE "MA LICENCE" — TOUS LES UTILISATEURS (admin + membres)
// ══════════════════════════════════════════════════
async function renderPageLicenceClient(){
  const root = document.getElementById('licence-content');
  if(!root) return;

  const cfg = GP_CONFIG || {};
  const plan = cfg.plan || 'FREE';
  const exp = cfg.plan_expire_le ? new Date(cfg.plan_expire_le) : null;
  const now = new Date();

  // Statut + jours restants
  let joursRest = null;
  let statutBadge = '';
  let statutColor = 'green';
  if(plan === 'OWNER'){
    statutBadge = '👑 OWNER';
    statutColor = 'gold';
  } else if(!exp){
    statutBadge = '⚠️ Sans abonnement';
    statutColor = 'red';
  } else {
    joursRest = Math.ceil((exp - now) / (1000*60*60*24));
    if(joursRest < 0){statutBadge = '❌ Expiré'; statutColor = 'red';}
    else if(joursRest <= 7){statutBadge = '⚠️ Bientôt expiré'; statutColor = 'red';}
    else if(joursRest <= 30){statutBadge = '🟡 À renouveler'; statutColor = 'gold';}
    else {statutBadge = '✅ Actif'; statutColor = 'green';}
  }

  const planLabel = {
    'OWNER': 'Propriétaire (ATM Farm Village)',
    'CLE_ACTIVEE': 'Abonnement actif',
    'PROV': 'Provenderie',
    'SADARI': 'Sadari',
    'FREE': 'Compte gratuit',
  }[plan] || plan;

  const isAdmin = GP_ROLE === 'admin';
  const colorVar = statutColor === 'green' ? 'var(--green)' : statutColor === 'gold' ? 'var(--gold)' : 'var(--red)';
  const colorRgb = statutColor === 'green' ? '22,163,74' : statutColor === 'gold' ? '232,197,71' : '239,68,68';

  // Historique des clés activées par le compte admin de la provenderie
  const{data:historique} = await SB.from('gp_cles')
    .select('cle,duree_jours,utilisee_le,note')
    .eq('utilisee_par', GP_ADMIN_ID)
    .order('utilisee_le', {ascending:false});
  const H = historique || [];

  const joursRestTxt = joursRest === null ? '' :
    (joursRest >= 0 ? `${joursRest} jour${joursRest>1?'s':''}` : `expiré depuis ${Math.abs(joursRest)} jour${Math.abs(joursRest)>1?'s':''}`);

  root.innerHTML = `
    <div class="g2" style="align-items:start;gap:14px">
      <div class="card">
        <div class="card-title"><div class="ct-left"><span>🪪 Mon abonnement</span></div></div>
        <div style="text-align:center;padding:18px 8px">
          <div style="font-size:11px;color:var(--textm);text-transform:uppercase;letter-spacing:1px;margin-bottom:6px">Plan</div>
          <div style="font-size:18px;font-weight:700;margin-bottom:14px">${planLabel}</div>
          <div style="display:inline-block;background:rgba(${colorRgb},.12);color:${colorVar};border:1px solid rgba(${colorRgb},.4);border-radius:18px;padding:5px 14px;font-size:11px;font-weight:700">${statutBadge}</div>
        </div>
        ${exp ? `
        <div style="border-top:1px solid var(--border);padding-top:14px;margin-top:6px">
          <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:6px">
            <span style="color:var(--textm)">Expire le</span>
            <span style="font-weight:600;font-family:'DM Mono',monospace">${exp.toLocaleDateString('fr-FR',{day:'2-digit',month:'long',year:'numeric'})}</span>
          </div>
          ${joursRest !== null ? `
          <div style="display:flex;justify-content:space-between;font-size:12px">
            <span style="color:var(--textm)">Jours restants</span>
            <span style="font-weight:700;color:${colorVar}">${joursRestTxt}</span>
          </div>` : ''}
        </div>` : ''}
        ${isAdmin && plan !== 'OWNER' ? `
        <div style="margin-top:14px">
          <a href="gp_paiement.html" class="btn btn-out" style="width:100%;justify-content:center;text-decoration:none">💳 Renouveler l'abonnement</a>
        </div>` : ''}
        ${!isAdmin ? `
        <div style="margin-top:14px;font-size:10px;color:var(--textm);text-align:center;padding:8px;background:rgba(255,255,255,.02);border-radius:6px;line-height:1.5">
          ℹ️ Cette licence appartient à votre administrateur. Contactez-le pour la renouveler.
        </div>` : ''}
      </div>

      ${isAdmin ? `
      <div class="card">
        <div class="card-title"><div class="ct-left"><span>🔑 Activer une clé</span></div></div>
        <div style="font-size:11px;color:var(--textm);margin-bottom:10px;line-height:1.5">
          Si vous avez reçu une clé d'activation (format <code style="background:rgba(0,0,0,.2);padding:1px 5px;border-radius:3px;font-size:10px">ATM-XXXX-KYxx-XXXX</code>), saisissez-la ici.
        </div>
        <div class="fr"><label>Clé d'activation</label>
          <input type="text" id="lic-client-cle" placeholder="ATM-XXXX-KYxx-XXXX" style="font-family:'DM Mono',monospace;letter-spacing:1px;text-transform:uppercase">
        </div>
        <button class="btn btn-g" style="width:100%;justify-content:center" onclick="activerCleDepuisApp()">✓ Activer</button>
        <div id="lic-client-msg" style="font-size:11px;margin-top:8px;min-height:18px"></div>
      </div>` : ''}
    </div>

    <div class="card" style="margin-top:14px">
      <div class="card-title"><div class="ct-left"><span>📜 Historique des activations</span></div></div>
      ${H.length ? `
        <div style="overflow-x:auto"><table class="tbl" style="font-size:11px">
          <thead><tr>
            <th>Clé</th><th>Durée</th><th>Activée le</th><th>Note</th>
          </tr></thead>
          <tbody>
          ${H.map(h => `<tr>
            <td style="font-family:'DM Mono',monospace;font-size:10px">${h.cle}</td>
            <td>${h.duree_jours} j</td>
            <td style="font-size:10px;color:var(--textm)">${h.utilisee_le ? new Date(h.utilisee_le).toLocaleDateString('fr-FR') : '—'}</td>
            <td style="font-size:10px;color:var(--textm)">${h.note || '—'}</td>
          </tr>`).join('')}
          </tbody>
        </table></div>
      ` : '<div style="color:var(--textm);font-size:12px;padding:14px;text-align:center">Aucune clé activée pour le moment.</div>'}
    </div>
  `;
}

async function activerCleDepuisApp(){
  const msg = document.getElementById('lic-client-msg');
  const cleInput = document.getElementById('lic-client-cle');
  const cle = (cleInput?.value || '').trim().toUpperCase();
  if(!cle){msg.style.color='var(--red)';msg.textContent='⚠ Entrez une clé.';return;}
  if(GP_ROLE !== 'admin'){msg.style.color='var(--red)';msg.textContent='⚠ Action réservée à l\'administrateur.';return;}

  msg.style.color='var(--textm)';msg.textContent='⏳ Activation...';
  const result = await activerCleATM(SB, GP_ADMIN_ID, cle);

  if(result.success){
    msg.style.color='var(--green)';msg.textContent='✅ '+result.message;
    cleInput.value = '';
    notify('Licence activée ✓', 'gold');
    await loadConfig();
    await renderPageLicenceClient();
  } else {
    msg.style.color='var(--red)';msg.textContent='❌ '+result.message;
  }
}
