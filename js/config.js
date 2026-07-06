const PROVENDA_VERSION = '3.3.0';

// ══════════════════════════════════════════════════
// PROVENDA — CONFIGURATION SUPABASE
// ══════════════════════════════════════════════════
const GP_URL = 'https://edvgtxzwpopqflaxbown.supabase.co';
const GP_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVkdmd0eHp3cG9wcWZsYXhib3duIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYxMTQ3MDksImV4cCI6MjA5MTY5MDcwOX0.kLbvBJUg91_6yp_MXcf0RrozQ6qB3R7ZOXuMcmiVXoY';
let SB = null;
let GP_USER = null;
let GP_ROLE = 'secretaire';
let GP_EST_GERANT = false; // true si le membre est gérant (traité comme admin, sauf Configuration)
let GP_ADMIN_ID = null;
let GP_CONFIG = {};
let GP_INGREDIENTS = [];
let GP_CLIENTS = [];
let GP_PRIX = {};
let GP_REMISE_MAX = 5;
let GP_CHARTS = {};
let GP_POINT_VENTE = null;
let GP_PRIX_GROS = {}; // Prix grossiste par formule // Point de vente du membre connecté
let GP_STOCK_VENTE = {}; // {formule_nom: qte_disponible en kg} au PDV courant — pour le menu de vente
let GP_CATEGORIES = []; // [{espece, espece_label, espece_icon, categorie, categorie_label, ordre}]
let GP_BESOINS = [];    // [{espece, categorie, pb_min, pb_max, em_min, ..., source}]
let GP_CONTRAINTES_MP = []; // [{espece, ingredient_pattern, pct_min, pct_max, note}]

// Normalisation pour recherche insensible aux accents et à la casse
// "Drèche d'Orge" → "dreche d orge" → matche "dreche", "orge", "dreche d orge", etc.
function normalizeSearch(s){
  return (s||'').toString().toLowerCase()
    .normalize('NFD').replace(/\p{Diacritic}/gu,'')   // retire accents (toutes les marques diacritiques)
    .replace(/[^a-z0-9 ]/g,' ')                       // autres chars → espace
    .replace(/\s+/g,' ').trim();
}

// ── FORMULES (chargées dynamiquement depuis la DB par loadFormules) ─
// Le tableau est rempli au boot par loadFormules() depuis gp_formules.
// Toutes les références FORMULES_SADARI dans les autres modules
// continuent de fonctionner — elles voient les formules saisies par l'admin.
const FORMULES_SADARI = [];
const ESPECE_ICON={lapin:'🐰',pondeuse:'🥚',chair:'🐔',porc:'🐷',canard:'🦆',tilapia:'🐟',goliath:'🐔'};
const CAT_LABELS={matiere_premiere:'🌾 MP',salaire:'👤 Salaire',transport:'🚚 Transport',emballage:'📦 Emballage',energie:'⚡ Énergie',maintenance:'🔧 Maintenance',autre:'📝 Autre'};
// ── FONCTIONS DATE ────────────────────────────────
function today(){
  return new Date().toISOString().slice(0,10);
}
function thisMonth(){
  return new Date().toISOString().slice(0,7);
}
function finMois(mois){
  const[y,m]=(mois||thisMonth()).split('-').map(Number);
  const lastDay=new Date(y,m,0).getDate();
  return `${mois}-${String(lastDay).padStart(2,'0')}`;
}
function fmt(n){
  return Number(n||0).toLocaleString('fr-FR');
}
function fmtKg(n){
  return Number(n||0).toLocaleString('fr-FR',{maximumFractionDigits:1});
}

// ══════════════════════════════════════════════════
// ANTI-DOUBLON GLOBAL — empêche le double-clic (ou re-clic réseau lent)
// d'enregistrer 2× la même action (vente, dépense, paiement, transfert…).
// Sur le 1er clic d'un bouton d'action : on le verrouille ~2,5 s (grisé) ;
// les clics suivants sur CE bouton sont ignorés. Si la liste se rafraîchit,
// le nouveau bouton est immédiatement réutilisable.
// ══════════════════════════════════════════════════
(function(){
  const MUT = /(save|enregistr|payer|paiement|encaisse|confirm|valid|supprim|delete|donner|échang|echang|transfert|soumettre|recept|rembours|ajouter|creer|créer|generer|générer)/i;
  const WIN = 2500; // ms
  document.addEventListener('click', function(e){
    const b = e.target.closest('button, .btn');
    if(!b) return;
    const sig = (b.getAttribute('onclick')||'') + ' ' + (b.textContent||'');
    if(!MUT.test(sig)) return;
    if(b.dataset._locked){                 // clic répété trop rapide → on bloque
      e.preventDefault(); e.stopImmediatePropagation(); return false;
    }
    b.dataset._locked = '1';               // 1er clic : on laisse passer + on verrouille
    const opq = b.style.opacity;
    b.style.opacity = '.55';
    setTimeout(function(){
      try{ if(b){ delete b.dataset._locked; b.style.opacity = opq; } }catch(_){}
    }, WIN);
  }, true); // phase capture : bloque avant l'onclick inline
})();

// ── RATTRAPAGE STOCK au RETOUR de connexion ──
// Dès que le réseau revient, on déduit le stock des ventes restées non déduites.
window.addEventListener('online', function(){
  if(typeof synchroniserStockVentes==='function'){ try{ synchroniserStockVentes(); }catch(e){} }
  if(typeof synchroniserCaisseDepenses==='function'){ try{ synchroniserCaisseDepenses(); }catch(e){} }
});
