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

function idemNouvelle(saisie){
  IDEM_CLES[saisie] = (typeof crypto !== 'undefined' && crypto.randomUUID)
    ? crypto.randomUUID()
    : String(Date.now()) + '-' + Math.random().toString(36).slice(2);
  return IDEM_CLES[saisie];
}

function idemCle(saisie){
  return IDEM_CLES[saisie] || idemNouvelle(saisie);
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
async function idemInserer(table, payload, saisie, select){
  const cols = select || 'id';
  const avecCle = Object.assign({}, payload, { idempotence: idemCle(saisie) });
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
}
