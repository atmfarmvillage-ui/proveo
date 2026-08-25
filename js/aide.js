// ══════════════════════════════════════════════════
// AIDE & PROCÉDURES
//
// Les procédures que l'équipe doit tenir au jour le jour. Elles vivent ici et
// pas dans un document à part : une consigne rangée ailleurs que dans l'outil
// qui l'applique n'est jamais relue.
//
// Chaque fiche déclare les rôles qui la voient. Un secrétaire ne doit pas avoir
// à trier ce qui le concerne — on lui montre son travail, rien d'autre.
// ══════════════════════════════════════════════════

const AIDE_FICHES = [
  {
    id: 'cloture',
    titre: 'Clôturer la caisse chaque soir',
    icone: '🌙',
    roles: ['admin', 'secretaire', 'gerant', 'daf'],
    resume: "Compter le cash et le comparer à ce que l'application attend. À faire tous les soirs, avant de partir.",
    etapes: [
      "Ouvrir <b>📅 Bilan journalier</b> dans le menu.",
      "En haut de la page, vérifier que la <b>Date</b> est celle du jour et choisir <b>sa caisse</b> dans la liste déroulante.",
      "Descendre jusqu'au cadre doré <b>🧮 Clôture de caisse</b>. Le <b>Solde théorique (tiroir)</b> y est déjà calculé : c'est ce que l'application attend.",
      "Compter physiquement l'argent du tiroir — billets et pièces — sans regarder le théorique, pour ne pas s'auto-influencer.",
      "Taper le total dans <b>💵 Cash compté (F)</b>. L'<b>Écart</b> s'affiche aussitôt : vert si la caisse est juste, or s'il y a trop, rouge s'il manque.",
      "Si l'écart n'est pas à zéro, écrire dans la <b>note</b> ce qu'on croit être la cause, même si on n'est pas sûr.",
      "Cliquer sur <b>✅ Valider la clôture du jour</b>.",
    ],
    remarque: "La clôture ne bloque rien et ne sanctionne personne. Elle sert à repérer un écart le soir même, quand on se souvient encore de la journée — pas trois semaines plus tard quand plus personne ne peut expliquer.",
  },
  {
    id: 'ecart',
    titre: "Quand l'écart n'est pas à zéro",
    icone: '⚖️',
    roles: ['admin', 'secretaire', 'gerant'],
    resume: "Un écart n'est pas une faute. C'est un signal : quelque chose n'a pas été saisi.",
    etapes: [
      "Commencer par le tableau <b>📋 Mouvements de caisse du jour</b>, en bas de la même page : il liste heure par heure tout ce qui est entré et sorti. C'est là qu'on retrouve ce qui manque.",
      "<b>Il manque de l'argent</b> — chercher d'abord une sortie non saisie : une dépense payée de la main à la main, un achat réglé cash, un billet avancé à quelqu'un.",
      "<b>Il y a trop d'argent</b> — chercher une entrée non saisie : un client qui a payé une ancienne dette, une vente enregistrée sans son encaissement.",
      "Si on trouve la cause : la <b>saisir normalement</b> (dépense, paiement, vente), puis refaire la clôture. L'écart disparaît de lui-même.",
      "Si on ne trouve pas : enregistrer quand même la clôture avec l'écart et la note. Ne jamais gonfler le montant compté pour faire tomber l'écart à zéro.",
    ],
    remarque: "Un écart écrit et expliqué se corrige. Un écart maquillé devient un trou qu'on découvrira des mois plus tard, sans plus aucun moyen de savoir d'où il vient.",
  },
  {
    id: 'depense',
    titre: 'Enregistrer une dépense',
    icone: '💸',
    roles: ['admin', 'secretaire', 'gerant', 'daf'],
    resume: "Toute sortie d'argent doit être saisie le jour même, sinon la caisse ne tombera jamais juste.",
    etapes: [
      "Ouvrir <b>💸 Dépenses</b> et saisir la description, le montant et la date <b>du jour où l'argent est sorti</b>.",
      "Choisir la catégorie, et le bénéficiaire quand il y en a un.",
      "Enregistrer : l'argent sort automatiquement de la caisse du point de vente.",
    ],
    remarque: "Une dépense payée aujourd'hui et saisie la semaine prochaine crée un écart de clôture aujourd'hui, puis un second écart en sens inverse la semaine prochaine. Deux anomalies pour un seul oubli.",
  },
  {
    id: 'vente',
    titre: 'Enregistrer une vente',
    icone: '💰',
    roles: ['admin', 'secretaire', 'gerant'],
    resume: "La date de la vente est celle de la livraison, et le montant encaissé est celui reçu ce jour-là.",
    etapes: [
      "Ouvrir <b>💰 Ventes</b>, choisir le client puis les produits.",
      "Saisir le <b>montant réellement encaissé</b>. S'il est inférieur au total, la différence devient une dette du client — c'est normal et c'est suivi.",
      "Ne pas saisir comme « payé » un montant qui n'est pas dans le tiroir : la clôture du soir le révélerait aussitôt.",
    ],
    remarque: "Une vente à crédit correctement saisie vaut mieux qu'une vente déclarée payée. La première se relance, la seconde se perd.",
  },
  {
    id: 'controle-admin',
    titre: 'Suivre les clôtures de son équipe',
    icone: '🔍',
    roles: ['admin', 'gerant', 'daf'],
    resume: "Voir qui a clôturé, qui ne l'a pas fait, et comment se comportent les écarts.",
    etapes: [
      "Dans <b>📅 Bilan journalier</b>, la synthèse des écarts par point de vente cumule les manquants et les excédents.",
      "Un point de vente dont les écarts <b>penchent toujours du même côté</b> ne relève pas du hasard : c'est une habitude de saisie, ou un problème.",
      "Un point de vente <b>sans aucune clôture</b> est le cas le plus préoccupant — l'absence de contrôle ne laisse aucune trace, contrairement à un écart.",
    ],
    remarque: null,
  },
];

function renderAide() {
  const el = document.getElementById('aide-contenu');
  if (!el) return;

  const role = (typeof GP_ROLE !== 'undefined' && GP_ROLE) ? GP_ROLE : 'secretaire';
  const gerant = (typeof GP_EST_GERANT !== 'undefined' && GP_EST_GERANT);
  const fiches = AIDE_FICHES.filter(f => f.roles.includes(role) || (gerant && f.roles.includes('gerant')));

  if (!fiches.length) {
    el.innerHTML = '<div class="card"><div style="color:var(--textm);font-size:13px">Aucune procédure pour votre rôle pour le moment.</div></div>';
    return;
  }

  el.innerHTML = fiches.map(f => `
    <div class="card" style="margin-bottom:14px">
      <div class="card-title"><div class="ct-left"><span>${f.icone} ${f.titre}</span></div></div>
      <div style="color:var(--textm);font-size:12.5px;margin:-4px 0 12px">${f.resume}</div>
      <ol style="margin:0;padding-left:20px;line-height:1.9;font-size:13px;color:var(--text)">
        ${f.etapes.map(e => `<li style="margin-bottom:4px">${e}</li>`).join('')}
      </ol>
      ${f.remarque ? `
      <div style="margin-top:12px;padding:10px 12px;border-left:3px solid var(--gold);background:var(--card2);border-radius:0 6px 6px 0;font-size:12.5px;color:var(--text);line-height:1.6">
        ${f.remarque}
      </div>` : ''}
    </div>
  `).join('');
}
