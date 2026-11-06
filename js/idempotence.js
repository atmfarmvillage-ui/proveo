// ══════════════════════════════════════════════════
// PROVENDA — IDEMPOTENCE DES ÉCRITURES D'ARGENT
// Le 28/09/2026, une vente est arrivée quatre fois. Les deux premières à DEUX
// MICROSECONDES d'écart : pas un doigt, la même requête partie deux fois sous
// l'interface — un navigateur qui renvoie un POST après une coupure réseau.
// Aucun verrou de bouton ne voit ça. Le seul endroit qui peut refuser un
// doublon, c'est la base.
//
// Principe : une clé unique par SAISIE, pas par clic. Les deux envois d'un même
// geste portent la même clé ; un index unique rejette le second. La clé ne
// change que lorsque l'écriture a réellement abouti.
//
// Ce module est générique : chaque formulaire d'argent s'y branche avec son
// propre nom de saisie. `ventes.js` garde ses helpers historiques (vtCle) qui
// font la même chose ; les nouveaux passent par ici.
// ══════════════════════════════════════════════════

const IDEM_CLES = {};

// ── LE NUMÉRO SURVIT AU RECHARGEMENT (06/11/2026) ──
// Lina ferme (108 s) et Inconnu 1 (9 min) : la seconde saisie portait un NOUVEAU
// numéro — la page avait été rechargée, le numéro gardé en mémoire était perdu.
// On le garde sur le téléphone, lié au CONTENU de la saisie (son empreinte) :
// même contenu dans les 30 min = même numéro, et la base refuse le second.
// Un contenu différent reçoit son propre numéro : une vraie saisie n'est jamais
// refusée à cause d'une ancienne.
const IDEM_TTL = 30 * 60 * 1000;
const IDEM_MEM = {};
function _idemLire(saisie){
  try{ return JSON.parse(localStorage.getItem('idem:' + saisie) || 'null') || IDEM_MEM[saisie] || null; }
  catch(_){ return IDEM_MEM[saisie] || null; }
}
function _idemGarder(saisie, v){
  IDEM_MEM[saisie] = v || null;
  try{ v ? localStorage.setItem('idem:' + saisie, JSON.stringify(v)) : localStorage.removeItem('idem:' + saisie); }catch(_){}
}

function idemNouvelle(saisie, empreinte){
  IDEM_CLES[saisie] = (typeof crypto !== 'undefined' && crypto.randomUUID)
    ? crypto.randomUUID()
    : String(Date.now()) + '-' + Math.random().toString(36).slice(2);
  _idemGarder(saisie, empreinte != null ? { k: IDEM_CLES[saisie], e: String(empreinte), t: Date.now() } : null);
  return IDEM_CLES[saisie];
}

function idemCle(saisie, empreinte){
  if(empreinte != null){
    const g = _idemLire(saisie);
    if(g && g.e === String(empreinte) && Date.now() - g.t < IDEM_TTL) return (IDEM_CLES[saisie] = g.k);
    return idemNouvelle(saisie, empreinte);
  }
  return IDEM_CLES[saisie] || idemNouvelle(saisie);
}

// Une saisie IDENTIQUE vient-elle d'être enregistrée (15 min) ? Rend la plus
// récente, ou null. Ne bloque jamais : sans réseau on ne sait pas, et c'est
// alors le numéro qui protège.
async function idemRessemble(table, egal, minutes, avecDeletedAt){
  try{
    let q = SB.from(table).select('id,created_at').eq('admin_id', GP_ADMIN_ID)
      .gte('created_at', new Date(Date.now() - (minutes || 15) * 60000).toISOString());
    Object.keys(egal).forEach(c => { q = egal[c] == null ? q.is(c, null) : q.eq(c, egal[c]); });
    if(avecDeletedAt) q = q.is('deleted_at', null);
    const { data, error } = await q.order('created_at', { ascending: false }).limit(1);
    if(error) return null;
    return (data && data[0]) || null;
  }catch(_){ return null; }
}

// Rend true si on peut enregistrer. Une saisie identique récente → on DEMANDE.
// « Enregistrer quand même » = un vrai second achat : il reçoit son propre
// numéro, sinon la base le prendrait pour le premier renvoyé.
// `texte(h)` rend la phrase, h = l'heure de la première saisie.
async function idemConfirmerSiRessemble(saisie, empreinte, table, egal, texte, avecDeletedAt){
  const r = await idemRessemble(table, egal, 15, avecDeletedAt);
  if(!r) return true;
  let h = '';
  try{ h = new Date(r.created_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }); }catch(_){}
  const ok = confirm(texte(h) + '\n\nSi c\'est la même saisie, ne fais rien : elle est bien passée.\n\nEnregistrer quand même une DEUXIÈME fois ?');
  if(ok) idemNouvelle(saisie, empreinte);
  return ok;
}

// L'index unique a parlé : cette écriture est déjà en base.
function idemEstDoublon(e){
  const m = (e && (e.message || e.details)) || '';
  return (e && e.code === '23505') || /duplicate key|_idempotence_uniq/i.test(m);
}

// La colonne n'existe pas encore : la migration n'a pas été jouée. On ne bloque
// pas la journée de travail pour ça — on réécrit sans la clé.
function idemSansColonne(e){
  const m = (e && e.message) || '';
  return /idempotence/i.test(m) && /column|schema cache/i.test(m);
}

// Insertion protégée. Renvoie { data, error, doublon } :
//   doublon === true  → l'écriture existait déjà, NE RIEN REJOUER derrière.
//   error             → un vrai problème, à montrer tel quel.
// `select` est la liste de colonnes à relire (par défaut l'id), car plusieurs
// appelants ont besoin de la ligne créée.
async function idemInserer(table, payload, saisie, select, empreinte){
  const cols = select || 'id';
  const avecCle = Object.assign({}, payload, { idempotence: idemCle(saisie, empreinte) });
  let r = await SB.from(table).insert(avecCle).select(cols).maybeSingle();
  if(r.error && idemEstDoublon(r.error)) return { data:null, error:null, doublon:true };
  if(r.error && idemSansColonne(r.error)){
    console.warn(table + '.idempotence absente — écriture sans protection');
    r = await SB.from(table).insert(payload).select(cols).maybeSingle();
  }
  return { data:r.data, error:r.error, doublon:false };
}

// À appeler quand l'opération a réellement abouti : la saisie suivante mérite
// sa propre clé. Oublier cet appel ferait refuser la deuxième vraie écriture.
function idemTerminee(saisie){ idemNouvelle(saisie); }

if (typeof window !== 'undefined') {
  window.idemCle = idemCle;
  window.idemNouvelle = idemNouvelle;
  window.idemEstDoublon = idemEstDoublon;
  window.idemSansColonne = idemSansColonne;
  window.idemInserer = idemInserer;
  window.idemTerminee = idemTerminee;
  window.idemRessemble = idemRessemble;
  window.idemConfirmerSiRessemble = idemConfirmerSiRessemble;
}
