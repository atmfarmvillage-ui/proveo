// ══════════════════════════════════════════════════
// PROVENDA — MESSAGES WHATSAPP PDV
// Motivation · Classement · Reconnaissance
// ══════════════════════════════════════════════════

// ── TEMPLATES MESSAGES DYNAMIQUES ────────────────

const TEMPLATES_HEBDO = [
  (data) => `Bonjour ${data.responsable||'cher partenaire'} 👋

Voici votre bilan de la semaine *${data.periode}* pour le PDV *${data.pdv}* :

${data.rang === 1 ? '🥇 *FÉLICITATIONS !* Vous êtes en tête du classement cette semaine !' :
  data.rang === 2 ? '🥈 Belle performance ! Vous êtes 2ème du classement cette semaine !' :
  data.rang === 3 ? '🥉 Très bien ! Vous occupez la 3ème place cette semaine !' :
  `📊 Vous êtes *${data.rang}ème* au classement cette semaine.`}

💰 *Chiffre d'affaires :* ${data.ca} F
${data.progression > 0 ? `📈 En hausse de *+${data.progression}%* vs semaine dernière — continuez sur cette lancée !` :
  data.progression < 0 ? `📉 En baisse de ${Math.abs(data.progression)}% — nous croyons en votre rebond la semaine prochaine !` :
  '➡ Stable par rapport à la semaine dernière.'}
${data.produit_star ? `⭐ *Produit star :* ${data.produit_star}` : ''}

Votre engagement fait la force de *${data.provenderie}*. Merci pour votre dévouement ! 💪

_Bonne fin de semaine,_
_${data.provenderie}_`,

  (data) => `Bonsoir ${data.responsable||'cher responsable'} 🌟

*Résultats hebdomadaires — Semaine ${data.periode}*
Point de vente : *${data.pdv}*

${data.rang === 1 ? '👑 *N°1 du classement !* Vous menez la danse cette semaine. Quelle performance !' :
  data.rang <= 3 ? `🏆 *Top ${data.rang} !* Vous êtes parmi les meilleurs cette semaine. Continuez !` :
  `🎯 *${data.rang}ème position* — Chaque semaine est une nouvelle opportunité de progresser !`}

📊 *Vos chiffres :*
   • CA réalisé : *${data.ca} F*
   • Ventes : *${data.nb_ventes} transactions*
${data.produit_star ? `   • ⭐ Top produit : *${data.produit_star}*` : ''}

${data.rang > 3 ? `💡 Le 1er est à *${data.ecart_leader} F* — vous pouvez y arriver !` : ''}

Nous sommes fiers de vous avoir dans l'équipe *${data.provenderie}*. 🙏

_À la semaine prochaine !_`,

  (data) => `Bonsoir cher(e) ${data.responsable||'partenaire'} 😊

*📅 Récap semaine ${data.periode} — ${data.pdv}*

${data.rang === 1 ? `✨ *CHAMPION DE LA SEMAINE !* 🎉\nVotre PDV est en tête avec ${data.ca} F. Un résultat exceptionnel qui mérite d'être célébré !` :
  `Rang cette semaine : *${data.rang}ème sur ${data.total_pdv} PDV*`}

💵 CA : *${data.ca} F*
${data.progression !== 0 ? `Évolution : ${data.progression > 0 ? `🟢 +${data.progression}%` : `🔴 ${data.progression}%`}` : ''}

${data.rang === 1 ? 'Votre rigueur et votre professionnalisme sont un exemple pour tous. Merci !' :
  data.rang <= 3 ? 'Vous êtes sur la bonne voie ! Votre travail porte ses fruits. 🌱' :
  'Chaque jour est une occasion de briller. Nous croyons en vous ! 💪'}

Avec toute notre reconnaissance,
_L\'équipe ${data.provenderie}_ 🌾`,
];

const TEMPLATES_MENSUEL = [
  (data) => `Bonjour ${data.responsable||'cher(e) partenaire'} 🎉

*🏆 BILAN MENSUEL — ${data.mois_label} — ${data.pdv}*

${data.rang === 1 ? `🥇 *PREMIER DU CLASSEMENT MENSUEL !*\nC\'est une performance remarquable que vous avez réalisée ce mois !` :
  data.rang === 2 ? `🥈 *2ème du classement mensuel !*\nUne excellente performance, nous en sommes très fiers !` :
  data.rang === 3 ? `🥉 *3ème du classement mensuel !*\nVotre travail acharné paie. Félicitations !` :
  `📊 *${data.rang}ème position ce mois.*`}

📈 *Résultats de ${data.mois_label} :*
   • Chiffre d'affaires : *${data.ca} F*
   • Nombre de ventes : *${data.nb_ventes}*
   • Taux d'encaissement : *${data.tx_enc}%*
${data.produit_star ? `   • ⭐ Produit phare : *${data.produit_star}*` : ''}
${data.top_client ? `   • 🤝 Client fidèle : *${data.top_client}*` : ''}

${data.rang === 1 ? '🌟 Vous êtes un pilier essentiel de notre succès collectif. Votre engagement et votre professionnalisme sont une source d\'inspiration pour toute l\'équipe.' :
  '💪 Votre engagement au quotidien construit notre réussite commune. Continuez sur cette belle lancée !'}

Merci pour votre fidélité et votre travail sans relâche. 🙏

_Cordialement,_
_${data.provenderie}_ 🌾`,

  (data) => `${data.responsable||'Cher(e) partenaire'}, bonsoir ! 🌙

C\'est avec beaucoup de fierté que nous partageons votre bilan du mois de *${data.mois_label}*.

${data.rang === 1 ? `👑 *VOUS ÊTES N°1 CE MOIS !*\nQuel mois exceptionnel ! ${data.ca} F de chiffre d\'affaires — une performance digne des plus grands.` :
  `Classement mensuel : *${data.rang}ème/${data.total_pdv} PDV*`}

*📊 Vos performances :*
┌─────────────────────────────
│ CA mensuel : *${data.ca} F*
│ Ventes réalisées : *${data.nb_ventes}*
│ Encaissement : *${data.tx_enc}%*
${data.produit_star ? `│ ⭐ Top produit : *${data.produit_star}*` : ''}
└─────────────────────────────

${data.rang <= 3 ? '🎯 Votre excellence commerciale est un exemple pour l\'ensemble du réseau. Vous faites la fierté de ' + data.provenderie + ' !' :
  '🎯 Chaque mois est une nouvelle chance de briller. Vos efforts ne passent pas inaperçus !'}

${data.tx_enc >= 80 ? '💰 Votre taux d\'encaissement est excellent — c\'est la marque des meilleurs !' :
  data.tx_enc >= 60 ? '💡 Continuez à améliorer votre taux d\'encaissement — vous y êtes presque !' : ''}

Ensemble, nous construisons quelque chose de grand. Merci ! 💪

_Avec toute notre gratitude,_
_${data.provenderie}_ 🌱`,

  (data) => `Bonsoir ${data.responsable||'cher responsable'} ✨

*Fin de mois — ${data.mois_label} pour ${data.pdv}*

${data.rang === 1 ? `🏅 *CHAMPION DU MOIS ${data.mois_label.toUpperCase()} !*\nVous avez dominé le classement avec brio. C\'est une victoire collective que vous portez !` :
  data.rang <= 5 ? `🌟 *Top 5 du mois !* — Rang ${data.rang}/${data.total_pdv}\nVotre régularité et votre engagement font de vous l\'un des meilleurs du réseau.` :
  `📍 Rang ${data.rang}/${data.total_pdv} ce mois.\nChaque position gagnée est une victoire. Continuez à progresser !`}

💰 CA mensuel : *${data.ca} F*
📦 ${data.nb_ventes} ventes réalisées
✅ Encaissement : ${data.tx_enc}%

${data.rang === 1 ? `Vous portez haut les couleurs de *${data.provenderie}* ! 🎉` :
  data.rang === 2 ? `La 1ère place n\'est qu\'à portée de main ! Continuez l\'effort ! 💪` :
  data.rang === 3 ? `Vous êtes dans le peloton de tête — la constance paye toujours ! 🌱` :
  `Votre travail quotidien est la fondation de notre croissance commune. Merci de faire partie de l\'aventure *${data.provenderie}* ! 🙏`}

_Bonne soirée,_
_L\'équipe de direction ${data.provenderie}_ 🌾`,
];

// ── MOTEUR D'ENVOI ────────────────────────────────
async function verifierEtEnvoyerMessages(){
  if(!GP_ADMIN_ID||GP_ROLE!=='admin')return;

  const now=new Date();
  const jourSemaine=now.getDay(); // 1=lundi
  const jourMois=now.getDate();
  
  // Calculer période courante
  const annee=now.getFullYear();
  const mois=now.toISOString().slice(0,7);
  const numSemaine=getNumSemaine(now);
  const periodeHebdo=`${annee}-W${String(numSemaine).padStart(2,'0')}`;

  // Vérifier si déjà envoyé cette semaine / ce mois
  const[{data:msgHebdo},{data:msgMensuel}]=await Promise.all([
    SB.from('gp_messages_pdv').select('id').eq('admin_id',GP_ADMIN_ID)
      .eq('type_message','hebdo').eq('periode',periodeHebdo).limit(1),
    SB.from('gp_messages_pdv').select('id').eq('admin_id',GP_ADMIN_ID)
      .eq('type_message','mensuel').eq('periode',mois).limit(1)
  ]);

  const doitEnvoyerHebdo=(jourSemaine===5||jourSemaine===6)&&(!msgHebdo||msgHebdo.length===0);
  const doitEnvoyerMensuel=(jourMois>=28)&&(!msgMensuel||msgMensuel.length===0);

  if(doitEnvoyerHebdo||doitEnvoyerMensuel){
    await preparerMessagesEnvoi(doitEnvoyerHebdo?'hebdo':null, doitEnvoyerMensuel?'mensuel':null);
  }
}

function getNumSemaine(date){
  const d=new Date(Date.UTC(date.getFullYear(),date.getMonth(),date.getDate()));
  const dayNum=d.getUTCDay()||7;
  d.setUTCDate(d.getUTCDate()+4-dayNum);
  const yearStart=new Date(Date.UTC(d.getUTCFullYear(),0,1));
  return Math.ceil((((d-yearStart)/86400000)+1)/7);
}

async function preparerMessagesEnvoi(typeHebdo, typeMensuel){
  // Charger données classement
  const now=new Date();
  const mois=now.toISOString().slice(0,7);
  const[{data:V},{data:VL},{data:PDVs}]=await Promise.all([
    SB.from('gp_ventes').select('id,montant_total,montant_paye,point_vente,client_nom,formule_nom')
      .eq('admin_id',GP_ADMIN_ID).gte('date',mois+'-01').lte('date',_finMois(mois)),
    SB.from('gp_ventes_lignes').select('formule_nom,quantite,vente_id')
      .eq('admin_id',GP_ADMIN_ID),
    SB.from('gp_points_vente').select('nom,whatsapp,telephone,responsable')
      .eq('admin_id',GP_ADMIN_ID)
  ]);

  if(!(PDVs||[]).length)return;

  // Calculer stats par PDV
  const statsPDV=calculerStatsPDV(V||[],VL||[],PDVs||[]);
  if(!statsPDV.length)return;

  // Construire la liste de messages
  const moisLabel=new Date(mois+'-15').toLocaleDateString('fr-FR',{month:'long',year:'numeric'});
  const messages=statsPDV.map((pdv,i)=>{
    const rang=i+1;
    const tel=pdv.whatsapp||pdv.telephone||'';
    const paysInfo=tel?detecterPays(tel):{numero_whatsapp:''};
    const data={
      pdv:pdv.nom, responsable:pdv.responsable||'',
      rang, total_pdv:statsPDV.length,
      ca:fmt(pdv.ca), nb_ventes:pdv.nb,
      tx_enc:pdv.ca>0?Math.round(pdv.enc/pdv.ca*100):0,
      produit_star:pdv.produit_star||'',
      top_client:pdv.top_client||'',
      progression:pdv.progression||0,
      mois_label:moisLabel, periode:'',
      ecart_leader:rang>1?fmt(statsPDV[0].ca-pdv.ca):'0',
      provenderie:GP_CONFIG?.nom_provenderie||'PROVENDA'
    };

    // Choisir template aléatoire
    let msgText='';
    if(typeHebdo){
      const numSemaine=getNumSemaine(new Date());
      data.periode=`${new Date().getFullYear()}-W${String(numSemaine).padStart(2,'0')}`;
      const tpl=TEMPLATES_HEBDO[Math.floor(Math.random()*TEMPLATES_HEBDO.length)];
      msgText=tpl(data);
    } else {
      data.periode=mois;
      const tpl=TEMPLATES_MENSUEL[Math.floor(Math.random()*TEMPLATES_MENSUEL.length)];
      msgText=tpl(data);
    }

    return{
      pdv:pdv.nom, rang, tel:paysInfo.numero_whatsapp||'',
      responsable:pdv.responsable||'', ca:pdv.ca,
      msg:msgText, type:typeHebdo?'hebdo':'mensuel',
      periode:typeHebdo?data.periode:mois
    };
  });

  // Afficher le modal d'envoi
  afficherModalMessages(messages);
}

function calculerStatsPDV(ventes, lignes, pdvs){
  const stats={};
  ventes.forEach(v=>{
    const p=v.point_vente||'Siège';
    if(!stats[p])stats[p]={nom:p,ca:0,enc:0,nb:0,clients:{},formules:{}};
    stats[p].ca+=Number(v.montant_total||0);
    stats[p].enc+=Number(v.montant_paye||0);
    stats[p].nb++;
    if(v.client_nom)stats[p].clients[v.client_nom]=(stats[p].clients[v.client_nom]||0)+1;
  });

  lignes.forEach(l=>{
    const v=ventes.find(x=>x.id===l.vente_id);
    if(!v)return;
    const p=v.point_vente||'Siège';
    if(!stats[p])return;
    const f=l.formule_nom||'—';
    stats[p].formules[f]=(stats[p].formules[f]||0)+Number(l.quantite||0);
  });

  return Object.values(stats).sort((a,b)=>b.ca-a.ca).map(s=>{
    // Produit star
    const fEntries=Object.entries(s.formules);
    s.produit_star=fEntries.length?fEntries.sort((a,b)=>b[1]-a[1])[0][0]:'';
    // Top client
    const cEntries=Object.entries(s.clients);
    s.top_client=cEntries.length?cEntries.sort((a,b)=>b[1]-a[1])[0][0]:'';
    // Infos PDV (tel, responsable)
    const pdvInfo=pdvs.find(p=>p.nom===s.nom);
    s.whatsapp=pdvInfo?.whatsapp||'';
    s.telephone=pdvInfo?.telephone||'';
    s.responsable=pdvInfo?.responsable||'';
    return s;
  });
}

// ── MODAL ENVOI MESSAGES ──────────────────────────
function afficherModalMessages(messages){
  const modal=document.getElementById('modal-messages-pdv');
  if(!modal)return;

  document.getElementById('msg-pdv-titre').textContent=
    messages[0]?.type==='hebdo'?'📱 Messages hebdomadaires PDV':'📱 Messages mensuels PDV';

  // Stocker les messages globalement pour accès via data-attributes
  window._msgsPDV=messages;
  document.getElementById('msg-pdv-liste').innerHTML=messages.map((m,i)=>{
    const medal=i===0?'🥇':i===1?'🥈':i===2?'🥉':`#${i+1}`;
    return`<div id="msg-pdv-card-${i}" style="background:rgba(14,20,40,.6);border:1px solid ${m.tel?'rgba(37,211,102,.3)':'rgba(239,68,68,.3)'};border-radius:10px;padding:12px;margin-bottom:8px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
        <div>
          <span style="font-weight:700;font-size:13px">${medal} ${m.pdv}</span>
          ${m.responsable?`<span style="font-size:10px;color:var(--textm)"> · ${m.responsable}</span>`:''}
          <div style="font-size:11px;color:var(--gold)">CA : ${m.ca?fmt(m.ca)+' F':'—'}</div>
        </div>
        <div style="text-align:right">
          ${m.tel
            ? `<a class="msg-wa-link" data-idx="${i}" data-tel="${m.tel}" data-pdv="${m.pdv}" data-rang="${m.rang}" data-type="${m.type}" data-periode="${m.periode}" data-ca="${m.ca||0}"
                href="#"
                style="background:linear-gradient(135deg,#25D366,#128C7E);color:white;padding:7px 14px;border-radius:8px;font-size:12px;font-weight:700;text-decoration:none;display:inline-flex;align-items:center;gap:5px;cursor:pointer">
                📲 Envoyer
              </a>`
            : `<div>
                <input type="tel" class="msg-tel-input" data-idx="${i}" placeholder="+228 90 00 00 00"
                  style="font-size:11px;padding:5px 8px;border-radius:6px;border:1px solid var(--border2);background:rgba(14,20,40,.8);color:var(--text);width:140px;margin-bottom:4px">
                <button class="msg-send-btn" data-idx="${i}" data-pdv="${m.pdv}" data-rang="${m.rang}" data-type="${m.type}" data-periode="${m.periode}" data-ca="${m.ca||0}"
                  style="background:linear-gradient(135deg,#25D366,#128C7E);color:white;border:none;padding:6px 12px;border-radius:7px;font-size:11px;font-weight:700;cursor:pointer;width:100%">
                  📲 Envoyer
                </button>
              </div>`
          }
        </div>
      </div>
      <details style="font-size:10px;color:var(--textm)">
        <summary style="cursor:pointer;color:var(--g6)">Voir le message</summary>
        <pre style="white-space:pre-wrap;font-family:'Outfit',sans-serif;font-size:10px;margin-top:6px;padding:8px;background:rgba(22,163,74,.05);border-radius:6px;border:1px solid rgba(22,163,74,.15)">${m.msg}</pre>
      </details>
    </div>`;
  }).join('');

  modal.style.display='flex';

  // Délégation événements — évite problèmes de guillemets dans onclick
  document.querySelectorAll('.msg-wa-link').forEach(el=>{
    el.onclick=(e)=>{
      e.preventDefault();
      const i=+el.dataset.idx;
      const m=window._msgsPDV[i];
      if(!m)return;
      window.open('https://wa.me/'+el.dataset.tel+'?text='+encodeURIComponent(m.msg),'_blank');
      marquerEnvoye(i,m.pdv,m.rang,m.type,m.periode,m.ca,m.msg);
    };
  });
  document.querySelectorAll('.msg-send-btn').forEach(btn=>{
    btn.onclick=()=>{
      const i=+btn.dataset.idx;
      const inp=document.querySelector('.msg-tel-input[data-idx="'+i+'"]');
      const m=window._msgsPDV[i];
      if(!m)return;
      envoyerAvecNumeroData(i,m,inp?.value.trim()||'');
    };
  });
}

function fermerModalMessages(){
  document.getElementById('modal-messages-pdv').style.display='none';
}

async function marquerEnvoye(idx, pdv, rang, type, periode, ca, msg){
  const card=document.getElementById('msg-pdv-card-'+idx);
  if(card)card.style.borderColor='rgba(22,163,74,.5)';
  // Sauvegarder en base
  await SB.from('gp_messages_pdv').insert({
    admin_id:GP_ADMIN_ID, pdv_nom:pdv, type_message:type,
    periode, rang, ca_periode:ca, message_txt:msg,
    envoye_par:GP_USER?.id
  }).catch(()=>{});
}

async function envoyerAvecNumero(idx, msg, pdv, rang, type, periode, ca){
  const inp=document.getElementById('msg-tel-'+idx);
  const tel=inp?.value.trim();
  if(!tel){if(inp)inp.style.borderColor='var(--red)';return;}
  const paysInfo=detecterPays(tel);
  if(!paysInfo.numero_whatsapp){if(inp)inp.style.borderColor='var(--red)';return;}
  // Sauvegarder le numéro dans la fiche PDV
  const card=document.getElementById('msg-pdv-card-'+idx);
  window.open('https://wa.me/'+paysInfo.numero_whatsapp+'?text='+encodeURIComponent(msg),'_blank');
  await marquerEnvoye(idx,pdv,rang,type,periode,ca,msg);
  if(card)card.style.borderColor='rgba(22,163,74,.5)';
}

// Envoi manuel depuis le classement PDV
async function envoyerMessagesManuel(type){
  if(type==='hebdo'){
    await preparerMessagesEnvoi('hebdo',null);
  } else {
    await preparerMessagesEnvoi(null,'mensuel');
  }
}

async function envoyerAvecNumeroData(idx,m,tel){
  if(!tel){
    const inp=document.querySelector('.msg-tel-input[data-idx="'+idx+'"]');
    if(inp)inp.style.borderColor='var(--red)';
    return;
  }
  const paysInfo=detecterPays(tel);
  if(!paysInfo.numero_whatsapp)return;
  window.open('https://wa.me/'+paysInfo.numero_whatsapp+'?text='+encodeURIComponent(m.msg),'_blank');
  await marquerEnvoye(idx,m.pdv,m.rang,m.type,m.periode,m.ca,m.msg);
  const card=document.getElementById('msg-pdv-card-'+idx);
  if(card)card.style.borderColor='rgba(22,163,74,.5)';
}
