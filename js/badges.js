// ══════════════════════════════════════════════════
// PROVENDA — BADGE DE TERRAIN
// Un commercial qui frappe à la porte d'un éleveur doit prouver qui il est, et
// l'éleveur doit pouvoir vérifier sans nous appeler. Le badge se fabrique depuis
// la fiche du membre : on recrute, on clique, on envoie l'imprimeur par WhatsApp.
//
// UN SEUL DESSIN. Le même canvas sert d'aperçu à l'écran ET d'image dans le PDF :
// ce qu'on voit est exactement ce qui s'imprime, pas deux rendus qui divergent.
// Le canvas fait 638 x 1011 px = 54 x 85,6 mm à 300 dpi (format carte bancaire),
// et la page PDF fait cette taille exacte — l'imprimeur n'a rien à recalculer.
//
// Rien n'est écrit en dur : le logo, le nom, le numéro officiel, le lieu et la
// gamme d'aliments viennent des paramètres et des formules actives. Une autre
// provenderie qui utilise PROVENDA sort ses propres badges.
// ══════════════════════════════════════════════════

const BDG_W = 540, BDG_H = 856;            // unités de dessin (mm x10)
const BDG_PX_W = 638, BDG_PX_H = 1011;     // 54 x 85,6 mm à 300 dpi
const BDG_MM_W = 54, BDG_MM_H = 85.6;
const BDG_VERT = '#15803D', BDG_ENCRE = '#0F1B14', BDG_GRIS = '#6B7A6D';
const BDG_ROUGE = '#DC2626', BDG_PIED = '#F2F6F1', BDG_TRAIT = '#D5DECE';
const BDG_FONTE = "'Outfit','Segoe UI',Roboto,Helvetica,Arial,sans-serif";

// Libellé imprimé sur le badge selon le rôle technique. Le rôle sert aux droits
// dans l'app ; le poste, lui, est ce que l'éleveur lit. Les deux ne se confondent
// pas — et le poste reste modifiable avant impression.
const BDG_POSTES = {
  directeur:   'Directeur Commercial',
  commercial:  'Responsable Commercial',
  gerant:      'Gérant',
  daf:         'Directeur Administratif et Financier',
  technicien:  'Technicien Nutritionniste',
  logistique:  'Responsable Logistique',
  secretaire:  'Secrétaire',
  admin:       'Direction'
};

const BDG_ESPECES_TITRES = {
  pondeuse: 'Pondeuse', chair: 'Poulet de chair', goliath: 'Goliath', lapin: 'Lapin',
  tilapia: 'Poisson', porc: 'Porc', canard: 'Canard', betail: 'Bétail'
};

let BDG_MEMBRE = null;   // membre en cours d'édition
let BDG_LOGO = null;     // {src,w,h} logo rogné de ses marges transparentes
let BDG_LOGO_URL = null; // logo déjà chargé : on ne le retaille pas à chaque ouverture
let BDG_PHOTO = null;    // Image du porteur
let BDG_GAMME = [];      // espèces réellement produites
let BDG_URLS = [];       // objectURL à libérer à la fermeture

function _bdgFonte(poids, taille) { return `${poids} ${taille}px ${BDG_FONTE}`; }
function _bdgEsc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

function _bdgSansAccent(s) {
  return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '');
}

// ── Outils de dessin ─────────────────────────────────────────────────────────

// Largeur d'un texte, interlettrage compris.
function _bdgLarg(ctx, t, ls) {
  let w = ctx.measureText(t).width;
  if (ls) w += ls * Math.max(0, String(t).length - 1);
  return w;
}

// L'interlettrage (`letterSpacing`) n'existe pas partout sur canvas : on pose
// les lettres une par une. C'est ce qui donne aux titres leur allure de badge.
function _bdgTxt(ctx, t, x, y, ls) {
  t = String(t == null ? '' : t);
  if (!ls) { ctx.fillText(t, x, y); return; }
  let cx = x;
  for (const ch of t) { ctx.fillText(ch, cx, y); cx += ctx.measureText(ch).width + ls; }
}

function _bdgCentre(ctx, t, cx, y, ls) {
  _bdgTxt(ctx, t, cx - _bdgLarg(ctx, t, ls || 0) / 2, y, ls || 0);
}

// Un badge est une carte de 54 mm : « ADJOVI-KOUKOUSSI » ou « Directeur
// Administratif et Financier » déborderaient. On rétrécit la police jusqu'à ce
// que ça tienne, plutôt que de couper le nom de quelqu'un.
function _bdgFit(ctx, t, maxW, poids, taille, ls) {
  let s = taille;
  ctx.font = _bdgFonte(poids, s);
  while (s > 9 && _bdgLarg(ctx, t, ls || 0) > maxW) {
    s -= 0.5;
    ctx.font = _bdgFonte(poids, s);
  }
  return s;
}

function _bdgRR(ctx, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// Photo recadrée en rond, façon « cover ». `ancre` = 0 haut, 1 bas : sur un
// portrait, le visage n'est presque jamais au centre géométrique du cliché.
function _bdgRond(ctx, img, cx, cy, r, ancre) {
  ctx.save();
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.clip();
  const iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height;
  const s = Math.max((2 * r) / iw, (2 * r) / ih);
  const w = iw * s, h = ih * s;
  ctx.drawImage(img, cx - w / 2, (cy - r) - (h - 2 * r) * (ancre == null ? 0.45 : ancre), w, h);
  ctx.restore();
}

// Silhouette grise quand aucune photo n'a été choisie : un badge sans visage
// n'authentifie rien, mais autant voir tout de suite ce qui manque.
function _bdgSilhouette(ctx, cx, cy, r) {
  ctx.save();
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.clip();
  ctx.fillStyle = '#EEF4EE'; ctx.fillRect(cx - r, cy - r, 2 * r, 2 * r);
  ctx.fillStyle = '#C3D2C5';
  ctx.beginPath(); ctx.arc(cx, cy - r * 0.18, r * 0.33, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(cx, cy + r * 0.72, r * 0.60, Math.PI, 0); ctx.fill();
  ctx.restore();
}

// Découpe une suite de morceaux (normaux / gras) en lignes qui tiennent dans
// `maxW`. Le gras sert à faire ressortir le nom de la provenderie au verso.
function _bdgLignes(ctx, morceaux, maxW, taille) {
  const lignes = [];
  let cur = [], curW = 0;
  morceaux.forEach(m => {
    const police = _bdgFonte(m.b ? '700' : '400', taille);
    String(m.t).split(/(\s+)/).forEach(mot => {
      if (!mot) return;
      ctx.font = police;
      const w = ctx.measureText(mot).width;
      const blanc = !/\S/.test(mot);
      if (!blanc && curW + w > maxW && cur.length) { lignes.push(cur); cur = []; curW = 0; }
      if (blanc && !cur.length) return;
      cur.push({ t: mot, b: !!m.b, w });
      curW += w;
    });
  });
  if (cur.length) lignes.push(cur);
  return lignes;
}

function _bdgDessinerLignes(ctx, lignes, x, y, taille, interligne) {
  lignes.forEach(ligne => {
    let cx = x;
    ligne.forEach(mot => {
      ctx.font = _bdgFonte(mot.b ? '700' : '400', taille);
      ctx.fillStyle = mot.b ? BDG_VERT : BDG_ENCRE;
      ctx.fillText(mot.t, cx, y);
      cx += mot.w;
    });
    y += interligne;
  });
  return y;
}

// ── Chargement des images ────────────────────────────────────────────────────

// On passe par un blob : une image d'une autre origine « salit » le canvas et
// `toDataURL` devient interdit — donc plus de PDF du tout. Si le fetch échoue
// (file://, réseau capricieux), on retombe sur un chargement direct.
async function _bdgImage(url) {
  if (!url) return null;
  try {
    const r = await fetch(url, { cache: 'reload' });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const u = URL.createObjectURL(await r.blob());
    BDG_URLS.push(u);
    return await _bdgCharger(u);
  } catch (e) {
    try { return await _bdgCharger(url); }
    catch (e2) { console.warn('badge : image illisible', url, e2); return null; }
  }
}

function _bdgCharger(src) {
  return new Promise((ok, ko) => {
    const i = new Image();
    i.onload = () => ok(i);
    i.onerror = () => ko(new Error('image illisible'));
    i.src = src;
  });
}

// Un logo PNG traîne souvent de larges marges transparentes. Les garder, c'est
// imprimer du vide à la place du blason. On les enlève avant de dessiner.
function _bdgRogner(img) {
  const iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height;
  const c = document.createElement('canvas');
  c.width = iw; c.height = ih;
  const x = c.getContext('2d');
  x.drawImage(img, 0, 0);
  let d;
  try { d = x.getImageData(0, 0, iw, ih).data; }
  catch (e) { return { src: img, w: iw, h: ih }; }
  let x0 = iw, y0 = ih, x1 = -1, y1 = -1;
  for (let y = 0; y < ih; y++) {
    for (let xx = 0; xx < iw; xx++) {
      if (d[(y * iw + xx) * 4 + 3] > 8) {
        if (xx < x0) x0 = xx; if (xx > x1) x1 = xx;
        if (y < y0) y0 = y; if (y > y1) y1 = y;
      }
    }
  }
  if (x1 < 0) return { src: img, w: iw, h: ih };
  const w = x1 - x0 + 1, h = y1 - y0 + 1;
  const t = document.createElement('canvas');
  t.width = w; t.height = h;
  t.getContext('2d').drawImage(c, x0, y0, w, h, 0, 0, w, h);
  return { src: t, w, h };
}

// ── Les deux faces ───────────────────────────────────────────────────────────

function _bdgCtx(cv) {
  cv.width = BDG_PX_W; cv.height = BDG_PX_H;
  const ctx = cv.getContext('2d');
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, cv.width, cv.height);
  ctx.scale(BDG_PX_W / BDG_W, BDG_PX_W / BDG_W);
  ctx.textBaseline = 'top';
  return ctx;
}

function badgeRecto(cv, d) {
  const ctx = _bdgCtx(cv);
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, BDG_W, BDG_H);
  ctx.strokeStyle = BDG_VERT; ctx.lineWidth = 6;
  ctx.strokeRect(3, 3, BDG_W - 6, BDG_H - 6);

  let y = 12;

  // En-tête : le logo, ou le nom de la maison si aucun logo n'est configuré.
  if (BDG_LOGO) {
    const w = 272, h = Math.round(w * BDG_LOGO.h / BDG_LOGO.w);
    ctx.drawImage(BDG_LOGO.src, (BDG_W - w) / 2, y, w, h);
    y += h + 10;
  } else {
    ctx.fillStyle = BDG_VERT; ctx.font = _bdgFonte('800', 34);
    _bdgCentre(ctx, (d.entreprise || '').toUpperCase(), BDG_W / 2, y + 20, 2);
    y += 74;
  }

  ctx.fillStyle = BDG_VERT; _bdgRR(ctx, 34, y, BDG_W - 68, 6, 3); ctx.fill();
  y += 6 + 20;

  // Photo
  const r = 108, cx = BDG_W / 2, cy = y + r;
  if (BDG_PHOTO) _bdgRond(ctx, BDG_PHOTO, cx, cy, r - 3, d.cadrage);
  else _bdgSilhouette(ctx, cx, cy, r - 3);
  ctx.strokeStyle = BDG_VERT; ctx.lineWidth = 5;
  ctx.beginPath(); ctx.arc(cx, cy, r - 2.5, 0, Math.PI * 2); ctx.stroke();
  y += 2 * r + 20;

  ctx.fillStyle = BDG_ENCRE;
  const nom = (d.nom || '').toUpperCase();
  const tNom = _bdgFit(ctx, nom, BDG_W - 60, '800', 42, 0);
  _bdgCentre(ctx, nom, cx, y + (42 - tNom) / 2, 0);
  y += 50;

  if (d.prenoms) {
    _bdgFit(ctx, d.prenoms, BDG_W - 60, '600', 30, 0);
    _bdgCentre(ctx, d.prenoms, cx, y, 0);
    y += 38;
  }

  // Pastille du poste
  if (d.poste) {
    y += 6;
    const poste = d.poste.toUpperCase(), ls = 1.5;
    _bdgFit(ctx, poste, BDG_W - 100, '700', 17, ls);
    const pw = Math.min(BDG_W - 60, _bdgLarg(ctx, poste, ls) + 40), ph = 36;
    ctx.fillStyle = BDG_VERT; _bdgRR(ctx, cx - pw / 2, y, pw, ph, ph / 2); ctx.fill();
    ctx.fillStyle = '#fff';
    _bdgFit(ctx, poste, BDG_W - 100, '700', 17, ls);
    _bdgCentre(ctx, poste, cx, y + 9, ls);
    y += ph + 20;
  }

  if (d.telephone) {
    ctx.fillStyle = BDG_GRIS; ctx.font = _bdgFonte('600', 13);
    _bdgCentre(ctx, 'SON NUMÉRO', cx, y, 1);
    y += 17;
    ctx.fillStyle = BDG_ENCRE;
    _bdgFit(ctx, d.telephone, BDG_W - 60, '700', 24, 0);
    _bdgCentre(ctx, d.telephone, cx, y, 0);
  }

  // Pied : numéro de badge et validité
  const ph = 62, py = BDG_H - 6 - ph;
  ctx.fillStyle = BDG_PIED; ctx.fillRect(6, py, BDG_W - 12, ph);
  ctx.fillStyle = BDG_TRAIT; ctx.fillRect(6, py, BDG_W - 12, 2);
  ctx.fillStyle = BDG_VERT; ctx.font = _bdgFonte('700', 15);
  _bdgCentre(ctx, 'BADGE N° ' + (d.numero || '—'), cx, py + 15, 1);
  ctx.fillStyle = BDG_GRIS; ctx.font = _bdgFonte('400', 12.5);
  _bdgCentre(ctx, d.validite ? 'Valable jusqu\'au ' + d.validite : 'Sans date de fin', cx, py + 36, 0);
}

function badgeVerso(cv, d) {
  const ctx = _bdgCtx(cv);
  const E = (d.entreprise || 'la provenderie');
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, BDG_W, BDG_H);
  ctx.strokeStyle = BDG_VERT; ctx.lineWidth = 6;
  ctx.strokeRect(3, 3, BDG_W - 6, BDG_H - 6);

  // Bandeau titre
  const bh = 76;
  ctx.fillStyle = BDG_VERT; ctx.fillRect(6, 6, BDG_W - 12, bh);
  ctx.fillStyle = '#fff';
  _bdgFit(ctx, 'CE QUE CE BADGE ENGAGE', BDG_W - 44, '800', 22, 2);
  _bdgCentre(ctx, 'CE QUE CE BADGE ENGAGE', BDG_W / 2, 6 + (bh - 26) / 2, 2);

  let y = 6 + bh + 30;
  const xT = 76, maxW = BDG_W - 32 - xT;

  const regles = [
    [{ t: 'Son porteur représente ' }, { t: E, b: 1 },
     { t: ' sur le terrain. Il peut présenter nos aliments, prendre une commande et vous mettre en relation avec la provenderie.' }],
    [{ t: 'Toute commande est confirmée par un ' }, { t: 'reçu de ' + E, b: 1 },
     { t: ". Sans reçu, il n'y a pas de commande." }],
    [{ t: 'Ce badge reste la propriété de ' + E + ' et doit être rendu à la fin de sa mission.' }]
  ];

  regles.forEach((segs, i) => {
    ctx.fillStyle = BDG_VERT;
    ctx.beginPath(); ctx.arc(32 + 16, y + 16, 16, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.font = _bdgFonte('800', 17);
    _bdgCentre(ctx, String(i + 1), 32 + 16, y + 5, 0);
    const lignes = _bdgLignes(ctx, segs, maxW, 17.5);
    const fin = _bdgDessinerLignes(ctx, lignes, xT, y + 4, 17.5, 26);
    y = Math.max(fin, y + 36) + 14;
  });

  // Avertissement
  y += 8;
  const aw = BDG_W - 64, ax = 32, ah = 104;
  ctx.fillStyle = '#FDECEC'; _bdgRR(ctx, ax, y, aw, ah, 12); ctx.fill();
  ctx.strokeStyle = BDG_ROUGE; ctx.lineWidth = 2; _bdgRR(ctx, ax, y, aw, ah, 12); ctx.stroke();
  ctx.fillStyle = BDG_ROUGE;
  _bdgFit(ctx, 'NE LUI REMETTEZ AUCUN ARGENT', aw - 24, '800', 19, 0.5);
  _bdgCentre(ctx, 'NE LUI REMETTEZ AUCUN ARGENT', BDG_W / 2, y + 18, 0.5);
  ctx.fillStyle = BDG_ENCRE; ctx.font = _bdgFonte('400', 15);
  _bdgCentre(ctx, 'Les paiements se font uniquement à la provenderie', BDG_W / 2, y + 48, 0);
  _bdgCentre(ctx, 'ou sur le numéro officiel ci-dessous.', BDG_W / 2, y + 70, 0);

  // Pied officiel
  const ph = 76, py = BDG_H - 6 - ph;
  ctx.fillStyle = BDG_VERT; ctx.fillRect(6, py, BDG_W - 12, ph);
  ctx.fillStyle = 'rgba(255,255,255,.9)'; ctx.font = _bdgFonte('400', 14);
  _bdgCentre(ctx, 'En cas de doute, appelez-nous', BDG_W / 2, py + 16, 0);
  ctx.fillStyle = '#fff';
  _bdgFit(ctx, d.telOfficiel || '—', BDG_W - 60, '800', 23, 1);
  _bdgCentre(ctx, d.telOfficiel || '—', BDG_W / 2, py + 38, 1);

  // Gamme + lieu. Le nombre d'espèces change d'une provenderie à l'autre : on
  // mesure le bloc AVANT de le poser, puis on le centre dans l'espace qui reste
  // entre l'avertissement et le pied — sinon on imprime un trou.
  ctx.font = _bdgFonte('600', 15);
  const maxL = BDG_W - 64;
  const rangs = [];
  let rang = [], rw = 0;
  BDG_GAMME.map(n => ({ n, w: ctx.measureText(n).width + 28 })).forEach(c => {
    if (rang.length && rw + 8 + c.w > maxL) { rangs.push(rang); rang = []; rw = 0; }
    rang.push(c); rw += (rang.length > 1 ? 8 : 0) + c.w;
  });
  if (rang.length) rangs.push(rang);

  const hGamme = rangs.length ? 24 + rangs.length * 40 : 0;
  const hLieu = d.lieu ? 22 : 0;
  const hBloc = hGamme + hLieu;
  const bas = y + ah;
  let gy = bas + Math.max(14, (py - bas - hBloc) / 2);

  if (rangs.length) {
    ctx.fillStyle = BDG_VERT; ctx.font = _bdgFonte('800', 14);
    _bdgCentre(ctx, 'NOS ALIMENTS', BDG_W / 2, gy, 2);
    gy += 24;
    rangs.forEach(r => {
      const total = r.reduce((s, c) => s + c.w, 0) + 8 * (r.length - 1);
      let x = (BDG_W - total) / 2;
      r.forEach(c => {
        ctx.fillStyle = BDG_PIED; _bdgRR(ctx, x, gy, c.w, 32, 16); ctx.fill();
        ctx.strokeStyle = BDG_TRAIT; ctx.lineWidth = 1.5; _bdgRR(ctx, x, gy, c.w, 32, 16); ctx.stroke();
        ctx.fillStyle = BDG_ENCRE; ctx.font = _bdgFonte('600', 15);
        _bdgCentre(ctx, c.n, x + c.w / 2, gy + 7, 0);
        x += c.w + 8;
      });
      gy += 40;
    });
  }
  if (d.lieu) {
    ctx.fillStyle = BDG_GRIS;
    _bdgFit(ctx, d.lieu, BDG_W - 44, '400', 14.5, 0);
    _bdgCentre(ctx, d.lieu, BDG_W / 2, Math.min(gy, py - 26), 0);
  }
}

// ── Données du badge ─────────────────────────────────────────────────────────

function _bdgVal(id) { const e = document.getElementById(id); return e ? String(e.value || '').trim() : ''; }

function _bdgDateFr(iso) {
  if (!iso) return '';
  const d = new Date(iso + 'T00:00:00');
  if (isNaN(d)) return '';
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
}

function badgeDonnees() {
  const cfg = (typeof GP_CONFIG !== 'undefined' && GP_CONFIG) || {};
  return {
    entreprise: (cfg.nom_provenderie || 'PROVENDA').toUpperCase(),
    nom: _bdgVal('bdg_nom'),
    prenoms: _bdgVal('bdg_prenoms'),
    poste: _bdgVal('bdg_poste'),
    telephone: _bdgVal('bdg_tel'),
    numero: _bdgVal('bdg_num'),
    validite: _bdgDateFr(_bdgVal('bdg_valide')),
    telOfficiel: _bdgVal('bdg_tel_officiel'),
    lieu: cfg.localisation || cfg.siege || '',
    cadrage: (+_bdgVal('bdg_cadrage') || 45) / 100
  };
}

function badgeRendre() {
  const d = badgeDonnees();
  const r = document.getElementById('bdg-recto'), v = document.getElementById('bdg-verso');
  if (r) badgeRecto(r, d);
  if (v) badgeVerso(v, d);
  const av = document.getElementById('bdg-avert');
  if (av) {
    av.style.display = BDG_PHOTO ? 'none' : 'block';
    av.textContent = "⚠️ Aucune photo : un badge sans visage ne prouve rien. Choisis une photo avant d'imprimer.";
  }
}

// ── Ouverture ────────────────────────────────────────────────────────────────

async function badgeGamme() {
  try {
    const { data } = await SB.from('gp_formules').select('espece,actif').eq('actif', true);
    const vues = [];
    (data || []).forEach(f => {
      const t = BDG_ESPECES_TITRES[f.espece] || (f.espece ? f.espece[0].toUpperCase() + f.espece.slice(1) : null);
      if (t && !vues.includes(t)) vues.push(t);
    });
    return vues;
  } catch (e) { return []; }
}

function _bdgPrefixe(nom) {
  const s = _bdgSansAccent(nom || 'PRO').replace(/[^A-Za-z]/g, '').toUpperCase();
  return (s.slice(0, 3) || 'PRO');
}

async function _bdgNumeroSuivant() {
  const cfg = (typeof GP_CONFIG !== 'undefined' && GP_CONFIG) || {};
  const prefixe = _bdgPrefixe(cfg.nom_provenderie);
  const an = new Date().getFullYear();
  let max = 0;
  try {
    const { data, error } = await SB.from('gp_membres').select('badge_numero').eq('admin_id', GP_ADMIN_ID);
    if (error) throw error;
    (data || []).forEach(m => {
      const mm = /-(\d+)\s*$/.exec(m.badge_numero || '');
      if (mm) max = Math.max(max, +mm[1]);
    });
  } catch (e) { /* colonne pas encore créée : on part de 1 */ }
  return `${prefixe}-${an}-${String(max + 1).padStart(3, '0')}`;
}

// « ADAKO Kodjo Joël » → NOM = ADAKO, prénoms = Kodjo Joël. Convention locale ;
// l'admin corrige en deux secondes quand ce n'est pas le cas.
function _bdgCouper(complet) {
  const p = String(complet || '').trim().split(/\s+/).filter(Boolean);
  if (!p.length) return { nom: '', prenoms: '' };
  if (p.length === 1) return { nom: p[0], prenoms: '' };
  return { nom: p[0], prenoms: p.slice(1).join(' ') };
}

async function ouvrirBadge(membreId) {
  if (GP_ROLE !== 'admin') { notify('Action réservée à l\'administrateur', 'r'); return; }
  const m = document.getElementById('modal-badge');
  if (!m) { notify('Recharge la page (Ctrl+Shift+R)', 'r'); return; }

  const { data: membre, error } = await SB.from('gp_membres').select('*')
    .eq('id', membreId).eq('admin_id', GP_ADMIN_ID).maybeSingle();
  if (error || !membre) { notify('Membre introuvable', 'r'); return; }
  BDG_MEMBRE = membre;

  const cfg = (typeof GP_CONFIG !== 'undefined' && GP_CONFIG) || {};
  const coupe = _bdgCouper(membre.nom);
  const an = new Date().getFullYear();

  document.getElementById('bdg-titre').textContent = membre.nom || '—';
  document.getElementById('bdg_nom').value = membre.badge_nom || coupe.nom;
  document.getElementById('bdg_prenoms').value = membre.badge_prenoms || coupe.prenoms;
  document.getElementById('bdg_poste').value = membre.badge_poste || BDG_POSTES[membre.role] || 'Représentant';
  document.getElementById('bdg_tel').value = membre.telephone || '';
  document.getElementById('bdg_valide').value = membre.badge_valide_jusqu || `${an}-12-31`;
  document.getElementById('bdg_tel_officiel').value = cfg.telephone || cfg.whatsapp || cfg.tel_dirigeant || '';
  document.getElementById('bdg_cadrage').value = Math.round((membre.badge_photo_y == null ? 0.45 : membre.badge_photo_y) * 100);
  document.getElementById('bdg_num').value = membre.badge_numero || await _bdgNumeroSuivant();
  document.getElementById('bdg-err').textContent = '';
  const f = document.getElementById('bdg_photo'); if (f) f.value = '';

  m.style.display = 'flex';

  // Les polices Google doivent être prêtes, sinon le canvas dessine en Arial
  // et l'aperçu ne ressemble pas au PDF.
  try { if (document.fonts && document.fonts.ready) await document.fonts.ready; } catch (e) {}

  BDG_GAMME = await badgeGamme();
  const urlLogo = cfg.logo_url || 'icons/logo.png';
  if (!BDG_LOGO || BDG_LOGO_URL !== urlLogo) {
    const img = await _bdgImage(urlLogo) || await _bdgImage('icons/logo.png');
    BDG_LOGO = img ? _bdgRogner(img) : null;
    BDG_LOGO_URL = urlLogo;
  }
  BDG_PHOTO = await _bdgImage(membre.badge_photo_url);
  badgeRendre();
}

function fermerBadge() {
  const m = document.getElementById('modal-badge');
  if (m) m.style.display = 'none';
  BDG_URLS.forEach(u => { try { URL.revokeObjectURL(u); } catch (e) {} });
  BDG_URLS = [];
  BDG_PHOTO = null;
  BDG_MEMBRE = null;
}

// ── Photo ────────────────────────────────────────────────────────────────────

// On réduit et on recompresse avant d'envoyer : une photo de téléphone fait
// 4 Mo, le badge n'en a besoin que d'un carré de 900 px.
function _bdgCompresser(file) {
  return new Promise((ok, ko) => {
    const fr = new FileReader();
    fr.onload = () => {
      const img = new Image();
      img.onload = () => {
        const max = 900;
        const s = Math.min(1, max / Math.max(img.width, img.height));
        const c = document.createElement('canvas');
        c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        c.toBlob(b => b ? ok(b) : ko(new Error('compression impossible')), 'image/jpeg', 0.88);
      };
      img.onerror = () => ko(new Error('image illisible'));
      img.src = fr.result;
    };
    fr.onerror = () => ko(new Error('lecture impossible'));
    fr.readAsDataURL(file);
  });
}

async function badgePhotoChoisie(input) {
  const file = input?.files?.[0];
  if (!file || !BDG_MEMBRE) return;
  const err = document.getElementById('bdg-err');
  if (file.size > 10 * 1024 * 1024) { err.textContent = 'Photo trop lourde (max 10 Mo).'; return; }
  err.textContent = 'Envoi de la photo…';
  try {
    const blob = await _bdgCompresser(file);
    // Bucket déjà en place pour les logos : pas de nouveau bucket, donc pas de
    // nouvelle politique de sécurité à écrire.
    const path = `equipe/${GP_ADMIN_ID}/${BDG_MEMBRE.id}.jpg`;
    const { error: upErr } = await SB.storage.from('gp-logos')
      .upload(path, blob, { upsert: true, contentType: 'image/jpeg' });
    if (upErr) throw upErr;
    const { data: pub } = SB.storage.from('gp-logos').getPublicUrl(path);
    // Même chemin à chaque fois : sans ce marqueur, le navigateur ressert
    // l'ancienne photo depuis son cache.
    const url = pub?.publicUrl ? pub.publicUrl + '?t=' + Date.now() : null;
    const { error } = await SB.from('gp_membres')
      .update({ badge_photo_url: url }).eq('id', BDG_MEMBRE.id).eq('admin_id', GP_ADMIN_ID);
    if (error) throw error;
    BDG_MEMBRE.badge_photo_url = url;
    BDG_PHOTO = await _bdgImage(url);
    err.textContent = '';
    badgeRendre();
    notify('Photo enregistrée ✓', 'gold');
  } catch (e) {
    err.textContent = /badge_photo_url/.test(e.message || '')
      ? "La colonne badge_photo_url n'existe pas encore — lance la migration SQL."
      : 'Erreur : ' + (e.message || e);
  }
}

// ── Enregistrement ───────────────────────────────────────────────────────────

async function badgeSauver(silencieux) {
  if (!BDG_MEMBRE) return false;
  const err = document.getElementById('bdg-err');
  const d = badgeDonnees();
  if (!d.nom) { err.textContent = 'Le NOM est obligatoire.'; return false; }
  const maj = {
    badge_nom: d.nom,
    badge_prenoms: d.prenoms || null,
    badge_poste: d.poste || null,
    badge_numero: _bdgVal('bdg_num') || null,
    badge_valide_jusqu: _bdgVal('bdg_valide') || null,
    badge_photo_y: (+_bdgVal('bdg_cadrage') || 45) / 100
  };
  const tel = _bdgVal('bdg_tel');
  if (tel !== (BDG_MEMBRE.telephone || '')) maj.telephone = tel || null;

  const { error } = await SB.from('gp_membres').update(maj)
    .eq('id', BDG_MEMBRE.id).eq('admin_id', GP_ADMIN_ID);
  if (error) {
    err.textContent = /badge_/.test(error.message || '')
      ? "Les colonnes du badge n'existent pas encore — lance la migration SQL."
      : 'Erreur : ' + error.message;
    return false;
  }
  Object.assign(BDG_MEMBRE, maj);

  // Le numéro officiel appartient à la maison, pas au porteur : il va dans les
  // paramètres, d'où tous les documents le tirent déjà.
  const cfg = (typeof GP_CONFIG !== 'undefined' && GP_CONFIG) || {};
  if (d.telOfficiel && d.telOfficiel !== (cfg.telephone || '')) {
    const { error: e2 } = await SB.from('gp_config')
      .upsert({ user_id: GP_ADMIN_ID, telephone: d.telOfficiel }, { onConflict: 'user_id' });
    if (!e2 && typeof GP_CONFIG !== 'undefined') GP_CONFIG.telephone = d.telOfficiel;
  }

  err.textContent = '';
  if (!silencieux) {
    notify('Badge enregistré ✓', 'gold');
    if (typeof renderPDV === 'function') renderPDV();
  }
  return true;
}

// ── PDF ──────────────────────────────────────────────────────────────────────

function badgeNomFichier() {
  const d = badgeDonnees();
  const net = s => _bdgSansAccent(s).replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return `Badge-${net(d.nom)}${d.prenoms ? '-' + net(d.prenoms.split(' ')[0]) : ''}.pdf`;
}

// Deux pages au format exact de la carte. En PNG le fichier dépassait 5 Mo —
// intransmissible par WhatsApp ; en JPEG de haute qualité il tombe sous 300 Ko
// et, à 300 dpi, l'œil ne voit aucune différence sur le papier.
function badgePdfDoc() {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: 'mm', format: [BDG_MM_W, BDG_MM_H], compress: true });
  const recto = document.getElementById('bdg-recto').toDataURL('image/jpeg', 0.94);
  doc.addImage(recto, 'JPEG', 0, 0, BDG_MM_W, BDG_MM_H);
  doc.addPage([BDG_MM_W, BDG_MM_H]);
  const verso = document.getElementById('bdg-verso').toDataURL('image/jpeg', 0.94);
  doc.addImage(verso, 'JPEG', 0, 0, BDG_MM_W, BDG_MM_H);
  return doc;
}

function badgeTexteWhatsApp() {
  const d = badgeDonnees();
  return [
    `*BADGE ${d.entreprise}*`,
    `${d.nom}${d.prenoms ? ' ' + d.prenoms : ''} — ${d.poste || ''}`.trim(),
    '',
    'Pour l\'imprimeur :',
    '• Carte PVC verticale, 54 x 85,6 mm (format carte bancaire)',
    '• 300 dpi — imprimer à la taille réelle, ne pas redimensionner',
    '• Recto/verso · perforation en haut pour le tour de cou'
  ].join('\n');
}

async function badgePartager() {
  if (typeof window.jspdf === 'undefined' || typeof window.jspdf.jsPDF !== 'function') {
    notify('Lib PDF pas encore chargée — réessaie dans 2 s', 'r'); return;
  }
  if (!await badgeSauver(true)) return;
  try {
    const doc = badgePdfDoc();
    const fichier = badgeNomFichier();
    const texte = badgeTexteWhatsApp();
    const blob = doc.output('blob');
    if (typeof File === 'function' && navigator.canShare) {
      const f = new File([blob], fichier, { type: 'application/pdf' });
      if (navigator.canShare({ files: [f] })) {
        try { await navigator.share({ files: [f], text: texte }); return; }
        catch (e) { if (e && e.name === 'AbortError') return; }
      }
    }
    doc.save(fichier);
    if (navigator.clipboard) { try { await navigator.clipboard.writeText(texte); } catch (e) {} }
    notify('PDF téléchargé — joins-le dans WhatsApp, le message est déjà copié', 'gold');
  } catch (e) {
    document.getElementById('bdg-err').textContent = 'Erreur : ' + (e.message || e);
  }
}

async function badgeTelecharger() {
  if (typeof window.jspdf === 'undefined' || typeof window.jspdf.jsPDF !== 'function') {
    notify('Lib PDF pas encore chargée — réessaie dans 2 s', 'r'); return;
  }
  if (!await badgeSauver(true)) return;
  try { badgePdfDoc().save(badgeNomFichier()); notify('PDF du badge téléchargé ✓', 'gold'); }
  catch (e) { document.getElementById('bdg-err').textContent = 'Erreur : ' + (e.message || e); }
}

// Bouton posé sur la carte du membre, dans Équipe & PDV.
function badgeBouton(m) {
  if (GP_ROLE !== 'admin') return '';
  return `<button class="btn btn-out btn-sm membre-admin-btn" onclick="ouvrirBadge('${m.id}')"
    title="Badge de terrain (PDF à imprimer)"${m.badge_photo_url ? ' style="border-color:var(--gold);color:var(--gold)"' : ''}>🪪</button>`;
}

if (typeof window !== 'undefined') {
  window.ouvrirBadge = ouvrirBadge;
  window.fermerBadge = fermerBadge;
  window.badgeRendre = badgeRendre;
  window.badgeSauver = badgeSauver;
  window.badgePartager = badgePartager;
  window.badgeTelecharger = badgeTelecharger;
  window.badgePhotoChoisie = badgePhotoChoisie;
  window.badgeBouton = badgeBouton;
}
