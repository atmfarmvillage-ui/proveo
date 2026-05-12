const PROVENDA_VERSION = '3.3.0';

// ══════════════════════════════════════════════════
// PROVENDA — CONFIGURATION SUPABASE
// ══════════════════════════════════════════════════
const GP_URL = 'https://edvgtxzwpopqflaxbown.supabase.co';
const GP_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVkdmd0eHp3cG9wcWZsYXhib3duIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYxMTQ3MDksImV4cCI6MjA5MTY5MDcwOX0.kLbvBJUg91_6yp_MXcf0RrozQ6qB3R7ZOXuMcmiVXoY';
let SB = null;
let GP_USER = null;
let GP_ROLE = 'secretaire';
let GP_ADMIN_ID = null;
let GP_CONFIG = {};
let GP_INGREDIENTS = [];
let GP_CLIENTS = [];
let GP_PRIX = {};
let GP_REMISE_MAX = 5;
let GP_CHARTS = {};
let GP_POINT_VENTE = null;
let GP_PRIX_GROS = {}; // Prix grossiste par formule // Point de vente du membre connecté

// ── FORMULES (chargées dynamiquement depuis la DB par loadFormules) ─
// Le tableau est rempli au boot par loadFormules() depuis gp_formules.
// Toutes les références FORMULES_SADARI dans les autres modules
// continuent de fonctionner — elles voient les formules saisies par l'admin.
const FORMULES_SADARI = [];
const ESPECE_ICON={lapin:'🐰',pondeuse:'🥚',chair:'🐔',porc:'🐷',canard:'🦆',tilapia:'🐟',goliath:'🐸'};
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
