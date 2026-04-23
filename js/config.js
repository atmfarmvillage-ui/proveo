const PROVENDA_VERSION = '1.5.0';

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

// ── 24 FORMULES SADARI PRÉ-CHARGÉES ───────────────
const FORMULES_SADARI = [
  {nom:'SADARI CROÎT LAPIN',espece:'lapin',stade:'Croissance/Engraissement',prix_defaut:380,ingredients:[{nom:'Maïs',pct:40},{nom:'Son de blé',pct:20},{nom:'Tourteau de soja',pct:18},{nom:'Foin légumineuses',pct:10},{nom:'Tourteau de palmiste',pct:5},{nom:'Coquilles huîtres',pct:2},{nom:'Prémix lapin',pct:2},{nom:'Sel',pct:0.5},{nom:'Lysine',pct:0.4},{nom:'Méthionine',pct:0.3},{nom:'SADARI BLEND LAPIN',pct:0.08},{nom:'Phosphate bicalcique',pct:1.72}]},
  {nom:'SADARI REPRO LAPIN',espece:'lapin',stade:'Reproduction',prix_defaut:400,ingredients:[{nom:'Maïs',pct:38},{nom:'Son de blé',pct:18},{nom:'Tourteau de soja',pct:20},{nom:'Foin légumineuses',pct:12},{nom:'Tourteau de palmiste',pct:4},{nom:'Coquilles huîtres',pct:3},{nom:'Prémix lapin',pct:2},{nom:'Sel',pct:0.5},{nom:'Lysine',pct:0.5},{nom:'Méthionine',pct:0.4},{nom:'SADARI BLEND LAPIN',pct:0.08},{nom:'Phosphate bicalcique',pct:1.52}]},
  {nom:'SADARI DÉMARRAGE PONDEUSE',espece:'pondeuse',stade:'Démarrage 0-6sem',prix_defaut:330,ingredients:[{nom:'Maïs',pct:55},{nom:'Tourteau de soja',pct:28},{nom:'Tourteau de palmiste',pct:5},{nom:'Coquilles huîtres',pct:1},{nom:'Prémix volaille',pct:2.5},{nom:'Sel',pct:0.3},{nom:'Lysine',pct:0.4},{nom:'Méthionine',pct:0.4},{nom:'SADARI BLEND VOLAILLE',pct:0.05},{nom:'Son de blé',pct:5},{nom:'Phosphate bicalcique',pct:2.35}]},
  {nom:'SADARI CROISSANCE PONDEUSE',espece:'pondeuse',stade:'Croissance 6-17sem',prix_defaut:310,ingredients:[{nom:'Maïs',pct:58},{nom:'Tourteau de soja',pct:22},{nom:'Son de blé',pct:8},{nom:'Tourteau de palmiste',pct:5},{nom:'Coquilles huîtres',pct:1.5},{nom:'Prémix volaille',pct:2},{nom:'Sel',pct:0.3},{nom:'Lysine',pct:0.35},{nom:'Méthionine',pct:0.35},{nom:'SADARI BLEND VOLAILLE',pct:0.05},{nom:'Phosphate bicalcique',pct:2.45}]},
  {nom:'SADARI PONTE 1',espece:'pondeuse',stade:'Ponte 17-45sem',prix_defaut:320,ingredients:[{nom:'Maïs',pct:60},{nom:'Tourteau de soja',pct:20},{nom:'Son de blé',pct:5},{nom:'Tourteau de palmiste',pct:4},{nom:'Coquilles huîtres',pct:4},{nom:'Prémix volaille',pct:2.5},{nom:'Sel',pct:0.3},{nom:'Lysine',pct:0.4},{nom:'Méthionine',pct:0.4},{nom:'SADARI BLEND VOLAILLE',pct:0.05},{nom:'Phosphate bicalcique',pct:3.35}]},
  {nom:'SADARI PONTE 2',espece:'pondeuse',stade:'Ponte tardive 45-80sem',prix_defaut:315,ingredients:[{nom:'Maïs',pct:58},{nom:'Tourteau de soja',pct:18},{nom:'Son de blé',pct:7},{nom:'Tourteau de palmiste',pct:4},{nom:'Coquilles huîtres',pct:5.5},{nom:'Prémix volaille',pct:2.5},{nom:'Sel',pct:0.3},{nom:'Lysine',pct:0.4},{nom:'Méthionine',pct:0.35},{nom:'SADARI BLEND VOLAILLE',pct:0.05},{nom:'Phosphate bicalcique',pct:3.9}]},
  {nom:'SADARI DÉMARRAGE CHAIR',espece:'chair',stade:'Démarrage J1-J14',prix_defaut:340,ingredients:[{nom:'Maïs',pct:52},{nom:'Tourteau de soja',pct:30},{nom:'Tourteau de palmiste',pct:6},{nom:'Graisse végétale',pct:4},{nom:'Prémix volaille',pct:3},{nom:'Sel',pct:0.3},{nom:'Lysine',pct:0.5},{nom:'Méthionine',pct:0.5},{nom:'Thréonine',pct:0.2},{nom:'SADARI BLEND VOLAILLE',pct:0.05},{nom:'Coquilles huîtres',pct:0.95},{nom:'Phosphate bicalcique',pct:2.5}]},
  {nom:'SADARI CROISSANCE CHAIR',espece:'chair',stade:'Croissance J14-J35',prix_defaut:315,ingredients:[{nom:'Maïs',pct:55},{nom:'Tourteau de soja',pct:26},{nom:'Tourteau de palmiste',pct:7},{nom:'Graisse végétale',pct:4},{nom:'Prémix volaille',pct:2.5},{nom:'Sel',pct:0.3},{nom:'Lysine',pct:0.45},{nom:'Méthionine',pct:0.4},{nom:'Thréonine',pct:0.15},{nom:'SADARI BLEND VOLAILLE',pct:0.05},{nom:'Coquilles huîtres',pct:1.15},{nom:'Phosphate bicalcique',pct:3}]},
  {nom:'SADARI FINITION CHAIR',espece:'chair',stade:'Finition J35+',prix_defaut:300,ingredients:[{nom:'Maïs',pct:60},{nom:'Tourteau de soja',pct:22},{nom:'Tourteau de palmiste',pct:8},{nom:'Graisse végétale',pct:3},{nom:'Prémix volaille',pct:2},{nom:'Sel',pct:0.3},{nom:'Lysine',pct:0.4},{nom:'Méthionine',pct:0.35},{nom:'Thréonine',pct:0.1},{nom:'SADARI BLEND VOLAILLE',pct:0.05},{nom:'Coquilles huîtres',pct:1.3},{nom:'Phosphate bicalcique',pct:2.5}]},
  {nom:'SADARI DÉMARRAGE PORC',espece:'porc',stade:'Porcelet 7-25kg',prix_defaut:290,ingredients:[{nom:'Maïs',pct:50},{nom:'Tourteau de soja',pct:25},{nom:'Son de blé',pct:10},{nom:'Tourteau de palmiste',pct:5},{nom:'Farine de poisson',pct:5},{nom:'Prémix porc',pct:2},{nom:'Sel',pct:0.5},{nom:'Lysine',pct:0.6},{nom:'Méthionine',pct:0.3},{nom:'Coquilles huîtres',pct:1},{nom:'Phosphate bicalcique',pct:0.6}]},
  {nom:'SADARI CROISSANCE PORC',espece:'porc',stade:'Croissance 25-60kg',prix_defaut:265,ingredients:[{nom:'Maïs',pct:55},{nom:'Tourteau de soja',pct:20},{nom:'Son de blé',pct:13},{nom:'Tourteau de palmiste',pct:5},{nom:'Farine de poisson',pct:3},{nom:'Prémix porc',pct:1.5},{nom:'Sel',pct:0.5},{nom:'Lysine',pct:0.5},{nom:'Méthionine',pct:0.3},{nom:'Coquilles huîtres',pct:0.8},{nom:'Phosphate bicalcique',pct:0.4}]},
  {nom:'SADARI FINITION PORC',espece:'porc',stade:'Finition 60kg+',prix_defaut:255,ingredients:[{nom:'Maïs',pct:60},{nom:'Tourteau de soja',pct:16},{nom:'Son de blé',pct:14},{nom:'Tourteau de palmiste',pct:5},{nom:'Farine de poisson',pct:2},{nom:'Prémix porc',pct:1},{nom:'Sel',pct:0.5},{nom:'Lysine',pct:0.4},{nom:'Méthionine',pct:0.25},{nom:'Coquilles huîtres',pct:0.6},{nom:'Phosphate bicalcique',pct:0.25}]},
  {nom:'SADARI TRUIE',espece:'porc',stade:'Truie gestante/allaitante',prix_defaut:270,ingredients:[{nom:'Maïs',pct:52},{nom:'Tourteau de soja',pct:18},{nom:'Son de blé',pct:16},{nom:'Tourteau de palmiste',pct:6},{nom:'Farine de poisson',pct:3},{nom:'Prémix porc',pct:2},{nom:'Sel',pct:0.5},{nom:'Lysine',pct:0.5},{nom:'Méthionine',pct:0.3},{nom:'Coquilles huîtres',pct:1.2},{nom:'Phosphate bicalcique',pct:0.5}]},
  {nom:'SADARI DÉMARRAGE CANARD',espece:'canard',stade:'Démarrage 0-3sem',prix_defaut:330,ingredients:[{nom:'Maïs',pct:52},{nom:'Tourteau de soja',pct:28},{nom:'Son de blé',pct:8},{nom:'Tourteau de palmiste',pct:4},{nom:'Prémix volaille',pct:3},{nom:'Sel',pct:0.3},{nom:'Lysine',pct:0.45},{nom:'Méthionine',pct:0.4},{nom:'SADARI BLEND VOLAILLE',pct:0.05},{nom:'Coquilles huîtres',pct:1.2},{nom:'Phosphate bicalcique',pct:2.6}]},
  {nom:'SADARI CROISSANCE CANARD',espece:'canard',stade:'Croissance 3-7sem',prix_defaut:310,ingredients:[{nom:'Maïs',pct:56},{nom:'Tourteau de soja',pct:24},{nom:'Son de blé',pct:9},{nom:'Tourteau de palmiste',pct:4},{nom:'Prémix volaille',pct:2.5},{nom:'Sel',pct:0.3},{nom:'Lysine',pct:0.4},{nom:'Méthionine',pct:0.35},{nom:'SADARI BLEND VOLAILLE',pct:0.05},{nom:'Coquilles huîtres',pct:1},{nom:'Phosphate bicalcique',pct:2.4}]},
  {nom:'SADARI FINITION CANARD',espece:'canard',stade:'Finition 7-12sem',prix_defaut:295,ingredients:[{nom:'Maïs',pct:60},{nom:'Tourteau de soja',pct:20},{nom:'Son de blé',pct:10},{nom:'Tourteau de palmiste',pct:4.5},{nom:'Prémix volaille',pct:2},{nom:'Sel',pct:0.3},{nom:'Lysine',pct:0.35},{nom:'Méthionine',pct:0.3},{nom:'SADARI BLEND VOLAILLE',pct:0.05},{nom:'Coquilles huîtres',pct:0.8},{nom:'Phosphate bicalcique',pct:1.7}]},
  {nom:'SADARI TILAPIA ALEVINS',espece:'tilapia',stade:'Alevins <5g',prix_defaut:450,ingredients:[{nom:'Farine de poisson',pct:40},{nom:'Tourteau de soja',pct:25},{nom:'Maïs',pct:15},{nom:'Son de blé',pct:8},{nom:'Liant fécule',pct:5},{nom:'Prémix poisson',pct:3},{nom:'Sel',pct:0.5},{nom:'Lysine',pct:0.7},{nom:'Méthionine',pct:0.5},{nom:'Phosphate bicalcique',pct:2.3}]},
  {nom:'SADARI TILAPIA GROSSISSEMENT',espece:'tilapia',stade:'Grossissement 5g-200g',prix_defaut:380,ingredients:[{nom:'Farine de poisson',pct:25},{nom:'Tourteau de soja',pct:28},{nom:'Maïs',pct:25},{nom:'Son de blé',pct:12},{nom:'Liant fécule',pct:4},{nom:'Prémix poisson',pct:2.5},{nom:'Sel',pct:0.5},{nom:'Lysine',pct:0.6},{nom:'Méthionine',pct:0.4},{nom:'Phosphate bicalcique',pct:2}]},
  {nom:'SADARI TILAPIA FINITION',espece:'tilapia',stade:'Finition >200g',prix_defaut:350,ingredients:[{nom:'Farine de poisson',pct:20},{nom:'Tourteau de soja',pct:25},{nom:'Maïs',pct:30},{nom:'Son de blé',pct:14},{nom:'Liant fécule',pct:4},{nom:'Prémix poisson',pct:2},{nom:'Sel',pct:0.5},{nom:'Lysine',pct:0.5},{nom:'Méthionine',pct:0.35},{nom:'Phosphate bicalcique',pct:3.65}]},
  {nom:'SADARI GOLIATH DÉMARRAGE',espece:'goliath',stade:'Têtards & juvéniles',prix_defaut:420,ingredients:[{nom:'Farine de poisson',pct:45},{nom:'Tourteau de soja',pct:20},{nom:'Maïs',pct:15},{nom:'Son de blé',pct:8},{nom:'Liant fécule',pct:5},{nom:'Prémix poisson',pct:3},{nom:'Sel',pct:0.5},{nom:'Lysine',pct:0.6},{nom:'Méthionine',pct:0.5},{nom:'Phosphate bicalcique',pct:2.4}]},
  {nom:'SADARI GOLIATH CROISSANCE',espece:'goliath',stade:'Croissance 50g-300g',prix_defaut:390,ingredients:[{nom:'Farine de poisson',pct:35},{nom:'Tourteau de soja',pct:24},{nom:'Maïs',pct:20},{nom:'Son de blé',pct:10},{nom:'Liant fécule',pct:4},{nom:'Prémix poisson',pct:2.5},{nom:'Sel',pct:0.5},{nom:'Lysine',pct:0.55},{nom:'Méthionine',pct:0.45},{nom:'Phosphate bicalcique',pct:3}]},
  {nom:'SADARI GOLIATH FINITION',espece:'goliath',stade:'Finition avant vente',prix_defaut:370,ingredients:[{nom:'Farine de poisson',pct:30},{nom:'Tourteau de soja',pct:22},{nom:'Maïs',pct:25},{nom:'Son de blé',pct:12},{nom:'Liant fécule',pct:4},{nom:'Prémix poisson',pct:2},{nom:'Sel',pct:0.5},{nom:'Lysine',pct:0.5},{nom:'Méthionine',pct:0.4},{nom:'Phosphate bicalcique',pct:3.6}]},
  {nom:'SADARI GOLIATH REPRO',espece:'goliath',stade:'Reproducteurs',prix_defaut:410,ingredients:[{nom:'Farine de poisson',pct:38},{nom:'Tourteau de soja',pct:22},{nom:'Maïs',pct:18},{nom:'Son de blé',pct:10},{nom:'Liant fécule',pct:4},{nom:'Prémix poisson',pct:3},{nom:'Sel',pct:0.5},{nom:'Lysine',pct:0.6},{nom:'Méthionine',pct:0.5},{nom:'Phosphate bicalcique',pct:3.4}]},
];
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
