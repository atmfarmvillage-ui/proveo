// ══════════════════════════════════════════════════
// PROVENDA — ANTI-DOUBLON CLIENT
// Deux éleveurs peuvent vraiment s'appeler Koffi. Deux personnes ne partagent
// pas un numéro de téléphone. D'où deux régimes :
//   • même NUMÉRO  → refusé, point. C'est le même client.
//   • même NOM     → on prévient, on laisse passer si la personne insiste,
//                    et on trace pour que l'admin et le point de vente le sachent.
//
// Pourquoi ça ne peut PAS être un contrôle purement JavaScript : `gp_clients`
// porte une policy RESTRICTIVE `pdv_scope_select`. Un commercial ne VOIT pas
// les clients des autres points de vente — il créerait donc tranquillement le
// doublon d'une fiche qu'il n'a jamais pu lire. La recherche passe par la RPC
// `gp_clients_doublons`, qui regarde toute la provenderie et ne renvoie que le
// strict nécessaire : nom, point de vente, qui le suit, dernier achat.
// ══════════════════════════════════════════════════

// Mêmes règles qu'en base (gp_tel_norme / gp_nom_norme) : si les deux
// normalisations divergent, l'app annoncerait « libre » ce que la base refuse.
function dblTel(t) { return String(t == null ? '' : t).replace(/\D/g, '').slice(-8); }

function dblNom(s) {
  return String(s == null ? '' : s).toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ').trim();
}

function _dblEsc(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Interroge la base. Renvoie [] si la RPC n'existe pas encore : on ne bloque
// personne au prétexte qu'une migration n'est pas passée.
async function dblChercher(nom, tel) {
  const t = dblTel(tel), n = dblNom(nom);
  if (t.length < 6 && n.length < 3) return [];
  try {
    const { data, error } = await SB.rpc('gp_clients_doublons', { p_nom: nom || '', p_tel: tel || '' });
    if (error) throw error;
    return data || [];
  } catch (e) {
    console.warn('anti-doublon : RPC indisponible', e);
    return [];
  }
}

function dblParTel(liste) { return (liste || []).find(c => c.motif === 'tel') || null; }

// La carte qui décrit le client déjà connu. C'est elle qui fait la différence
// entre « erreur 23505 » et « ce numéro est déjà celui de Ferme Adekou ».
function dblCarte(c, opts) {
  opts = opts || {};
  const suivi = c.attribution === 'commerciale' && c.responsable_nom
    ? 'suivi par ' + _dblEsc(c.responsable_nom)
    : (c.point_vente ? 'au point de vente ' + _dblEsc(c.point_vente) : 'suivi par le point de vente');
  const dernier = c.dernier_achat
    ? 'dernier achat le ' + (typeof fmtDate === 'function' ? fmtDate(c.dernier_achat) : c.dernier_achat)
    : 'aucun achat enregistré';
  const bordure = opts.bloquant ? 'var(--red)' : 'var(--gold)';
  const fond = opts.bloquant ? 'rgba(239,68,68,.08)' : 'rgba(232,197,71,.08)';
  return `<div style="background:${fond};border:1px solid ${bordure};border-radius:8px;padding:9px 11px;margin-bottom:6px">
    <div style="font-weight:700;font-size:12.5px;color:var(--text)">${_dblEsc(c.nom)}</div>
    <div style="font-size:10.5px;color:var(--textm);line-height:1.5;margin-top:2px">
      ${c.telephone ? '📞 ' + _dblEsc(c.telephone) + ' · ' : ''}${suivi}<br>${dernier}
    </div>
    ${opts.onOuvrir ? `<button class="btn btn-out btn-sm" style="margin-top:6px;font-size:10px"
      onclick="${opts.onOuvrir}('${c.id}')">Ouvrir sa fiche</button>` : ''}
  </div>`;
}

// ── Le verdict, rendu au moment d'enregistrer ────────────────────────────────
// { bloque:'…' }        → un numéro déjà pris : on n'écrit rien.
// { confirmer:[…] }     → un nom déjà pris : à la personne de trancher.
// { ok:true }           → rien de connu.
async function dblVerdict(nom, tel) {
  const trouves = await dblChercher(nom, tel);
  const parTel = dblParTel(trouves);
  if (parTel) return { bloque: parTel, trouves };
  const parNom = trouves.filter(c => c.motif === 'nom');
  if (parNom.length) return { confirmer: parNom, trouves };
  return { ok: true, trouves };
}

function dblMessageBloque(c) {
  const qui = c.attribution === 'commerciale' && c.responsable_nom
    ? ', suivi par ' + c.responsable_nom
    : (c.point_vente ? ', au point de vente ' + c.point_vente : '');
  return `Ce numéro est déjà celui de ${c.nom}${qui}. Ouvre sa fiche plutôt que d'en créer une seconde.`;
}

function dblMessageConfirmer(liste) {
  const l = liste.map(c => {
    const qui = c.responsable_nom ? ' — suivi par ' + c.responsable_nom
      : (c.point_vente ? ' — ' + c.point_vente : '');
    return '• ' + c.nom + (c.telephone ? ' (' + c.telephone + ')' : '') + qui;
  }).join('\n');
  return `Ce nom existe déjà dans la provenderie :\n\n${l}\n\n`
    + `Si c'est la même personne, annule et ouvre sa fiche.\n`
    + `Si c'est vraiment quelqu'un d'autre, confirme : l'administrateur`
    + ` et le point de vente concerné en seront informés.`;
}

// Ce que la création doit écrire quand quelqu'un force malgré l'alerte : la
// trace part DANS l'insert, pas dans une mise a jour qui suivrait. `gp_clients`
// porte une policy RESTRICTIVE en SELECT : relire la ligne qu'on vient d'écrire
// pour la marquer n'est pas garanti, l'écrire d'un coup l'est.
function dblMarqueForce(existant) {
  return existant ? { doublon_force: true, doublon_de: existant.id } : {};
}

// ── Quand quelqu'un force malgré l'alerte ────────────────────────────────────
// Prévenir ceux que ça concerne vraiment : le patron, celui qui suit la fiche
// d'origine, et le point de vente à qui le client appartient.
async function dblNotifierForce(existant) {
  if (!existant) return;
  try {
    const eq = (typeof chargerEquipe === 'function') ? (await chargerEquipe()) || [] : [];
    const cibles = new Set();
    // Le patron, toujours.
    if (GP_ADMIN_ID) cibles.add(GP_ADMIN_ID);
    // Celui qui suit la fiche d'origine.
    if (existant.responsable_nom) {
      const r = eq.find(m => (m.nom || '') === existant.responsable_nom);
      if (r && r.user_id) cibles.add(r.user_id);
    }
    // Et le point de vente concerné : c'est SON client qu'on vient de dédoubler.
    if (existant.point_vente) {
      eq.filter(m => m.point_vente === existant.point_vente && m.user_id)
        .forEach(m => cibles.add(m.user_id));
    }
    cibles.delete(GP_USER?.id);
    if (cibles.size && typeof pushSendToUsers === 'function') {
      const par = String(GP_USER?.email || '').split('@')[0] || 'un membre';
      pushSendToUsers([...cibles], '⚠️ Client créé en double',
        `${par} a créé « ${existant.nom} » une deuxième fois`
        + (existant.point_vente ? ` (point de vente ${existant.point_vente})` : '')
        + '. À fusionner avec le bouton 🔗.',
        { tag: 'doublon-client' });
    }
  } catch (e) { console.warn('anti-doublon : notification impossible', e); }
}

// Badge posé sur la ligne de la liste des clients.
function dblBadge(c) {
  if (!c || !c.doublon_force) return '';
  return `<span class="badge bdg-r" style="font-size:8px" title="Créé malgré une fiche existante — à fusionner">⚠ Doublon</span>`;
}

// ── Alerte vivante pendant la saisie ─────────────────────────────────────────
// Prévenir AVANT d'enregistrer vaut mieux que refuser après : la personne n'a
// pas encore rempli les cinq autres champs.
const _DBL_TIMERS = {};
function dblSurveiller(idNom, idTel, idZone, onOuvrir) {
  clearTimeout(_DBL_TIMERS[idZone]);
  _DBL_TIMERS[idZone] = setTimeout(async () => {
    const zone = document.getElementById(idZone);
    if (!zone) return;
    const nom = document.getElementById(idNom)?.value || '';
    const tel = document.getElementById(idTel)?.value || '';
    const trouves = await dblChercher(nom, tel);
    if (!trouves.length) { zone.style.display = 'none'; zone.innerHTML = ''; return; }
    const parTel = dblParTel(trouves);
    const titre = parTel
      ? `<div style="font-size:11px;font-weight:700;color:var(--red);margin-bottom:6px">⛔ Ce numéro est déjà enregistré</div>`
      : `<div style="font-size:11px;font-weight:700;color:var(--gold);margin-bottom:6px">⚠️ Ce nom existe déjà</div>`;
    zone.innerHTML = titre + trouves.map(c => dblCarte(c, { bloquant: !!parTel, onOuvrir })).join('');
    zone.style.display = 'block';
  }, 400);
}

if (typeof window !== 'undefined') {
  window.dblTel = dblTel;
  window.dblNom = dblNom;
  window.dblChercher = dblChercher;
  window.dblVerdict = dblVerdict;
  window.dblCarte = dblCarte;
  window.dblBadge = dblBadge;
  window.dblSurveiller = dblSurveiller;
  window.dblMarqueForce = dblMarqueForce;
  window.dblNotifierForce = dblNotifierForce;
  window.dblMessageBloque = dblMessageBloque;
  window.dblMessageConfirmer = dblMessageConfirmer;
}
