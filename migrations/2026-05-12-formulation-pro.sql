-- ══════════════════════════════════════════════════
-- MIGRATION : Outil de formulation nutritionnelle pro
-- Date : 2026-05-12
-- Tables : catégories d'aliment + besoins nutritionnels
-- Extension : gp_ingredients avec aminogramme complet
-- Seeds : standards Hyline/Ross/ITAVI/NRC + valeurs INRA
-- À exécuter dans Supabase SQL Editor
-- ══════════════════════════════════════════════════

-- ─────────────────────────────────────────────────
-- 1. EXTENSION gp_ingredients : valeurs nutritionnelles
-- ─────────────────────────────────────────────────
ALTER TABLE gp_ingredients
  ADD COLUMN IF NOT EXISTS matiere_seche      numeric,
  ADD COLUMN IF NOT EXISTS lipides            numeric,
  ADD COLUMN IF NOT EXISTS fibres             numeric,
  ADD COLUMN IF NOT EXISTS cendres            numeric,
  ADD COLUMN IF NOT EXISTS lysine             numeric,
  ADD COLUMN IF NOT EXISTS methionine         numeric,
  ADD COLUMN IF NOT EXISTS meth_cyst          numeric,
  ADD COLUMN IF NOT EXISTS threonine          numeric,
  ADD COLUMN IF NOT EXISTS tryptophane        numeric,
  ADD COLUMN IF NOT EXISTS calcium            numeric,
  ADD COLUMN IF NOT EXISTS phosphore_total    numeric,
  ADD COLUMN IF NOT EXISTS phosphore_disp     numeric,
  ADD COLUMN IF NOT EXISTS sodium             numeric,
  ADD COLUMN IF NOT EXISTS chlore             numeric;

-- ─────────────────────────────────────────────────
-- 2. TABLE gp_categories_aliment (espèce + catégorie)
-- admin_id NULL = catégorie standard (lecture publique)
-- admin_id = uuid → catégorie custom propre à un admin
-- ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS gp_categories_aliment (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id        uuid,
  espece          text NOT NULL,
  espece_label    text,
  espece_icon     text,
  categorie       text NOT NULL,
  categorie_label text,
  ordre           int DEFAULT 0,
  actif           boolean DEFAULT true,
  created_at      timestamptz DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_cat_aliment_unique
  ON gp_categories_aliment(COALESCE(admin_id, '00000000-0000-0000-0000-000000000000'::uuid), espece, categorie);

-- ─────────────────────────────────────────────────
-- 3. TABLE gp_besoins_nutritionnels (cibles par espèce+catégorie)
-- admin_id NULL = besoin standard partagé
-- ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS gp_besoins_nutritionnels (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id            uuid,
  espece              text NOT NULL,
  categorie           text NOT NULL,
  -- Bornes (% de la formule, ou kcal/kg pour EM)
  pb_min              numeric, pb_max              numeric,
  em_min              numeric, em_max              numeric,
  lipides_min         numeric, lipides_max         numeric,
  fibres_max          numeric,
  lysine_min          numeric, lysine_max          numeric,
  methionine_min      numeric, methionine_max      numeric,
  meth_cyst_min       numeric, meth_cyst_max       numeric,
  threonine_min       numeric, threonine_max       numeric,
  tryptophane_min     numeric, tryptophane_max     numeric,
  calcium_min         numeric, calcium_max         numeric,
  phosphore_disp_min  numeric, phosphore_disp_max  numeric,
  sodium_min          numeric, sodium_max          numeric,
  chlore_min          numeric, chlore_max          numeric,
  source              text,
  notes               text,
  created_at          timestamptz DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_besoins_unique
  ON gp_besoins_nutritionnels(COALESCE(admin_id, '00000000-0000-0000-0000-000000000000'::uuid), espece, categorie);

-- ─────────────────────────────────────────────────
-- 4. RLS : lecture publique pour les standards, écriture pour admin
-- ─────────────────────────────────────────────────
ALTER TABLE gp_categories_aliment    ENABLE ROW LEVEL SECURITY;
ALTER TABLE gp_besoins_nutritionnels ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS cat_select ON gp_categories_aliment;
CREATE POLICY cat_select ON gp_categories_aliment
  FOR SELECT USING (
    admin_id IS NULL
    OR admin_id = auth.uid()
    OR EXISTS (SELECT 1 FROM gp_membres WHERE user_id = auth.uid() AND admin_id = gp_categories_aliment.admin_id)
  );

DROP POLICY IF EXISTS cat_modify ON gp_categories_aliment;
CREATE POLICY cat_modify ON gp_categories_aliment
  FOR ALL USING (admin_id = auth.uid())
  WITH CHECK (admin_id = auth.uid());

DROP POLICY IF EXISTS bes_select ON gp_besoins_nutritionnels;
CREATE POLICY bes_select ON gp_besoins_nutritionnels
  FOR SELECT USING (
    admin_id IS NULL
    OR admin_id = auth.uid()
    OR EXISTS (SELECT 1 FROM gp_membres WHERE user_id = auth.uid() AND admin_id = gp_besoins_nutritionnels.admin_id)
  );

DROP POLICY IF EXISTS bes_modify ON gp_besoins_nutritionnels;
CREATE POLICY bes_modify ON gp_besoins_nutritionnels
  FOR ALL USING (admin_id = auth.uid())
  WITH CHECK (admin_id = auth.uid());

-- ═══════════════════════════════════════════════════════
-- 5. SEED — CATÉGORIES STANDARDS (admin_id NULL)
-- ═══════════════════════════════════════════════════════
INSERT INTO gp_categories_aliment (admin_id, espece, espece_label, espece_icon, categorie, categorie_label, ordre) VALUES
-- Pondeuse
(NULL,'pondeuse','Poule pondeuse','🥚','demarrage','Démarrage (0-6 sem)',1),
(NULL,'pondeuse','Poule pondeuse','🥚','croissance','Croissance (6-17 sem)',2),
(NULL,'pondeuse','Poule pondeuse','🥚','preponte','Pré-ponte (17-19 sem)',3),
(NULL,'pondeuse','Poule pondeuse','🥚','ponte_pic','Ponte pic (19-45 sem)',4),
(NULL,'pondeuse','Poule pondeuse','🥚','ponte_persistance','Ponte persistance (45+ sem)',5),
-- Poulet de chair
(NULL,'chair','Poulet de chair','🐔','demarrage','Démarrage (J1-J10)',1),
(NULL,'chair','Poulet de chair','🐔','croissance','Croissance (J11-J24)',2),
(NULL,'chair','Poulet de chair','🐔','finition','Finition (J25+)',3),
-- Lapin
(NULL,'lapin','Lapin','🐰','lapereau','Lapereau pré-sevrage',1),
(NULL,'lapin','Lapin','🐰','engraissement','Engraissement (sevrage-90j)',2),
(NULL,'lapin','Lapin','🐰','reproduction','Reproduction (femelle)',3),
-- Porc
(NULL,'porc','Porc','🐷','porcelet','Porcelet post-sevrage (7-25 kg)',1),
(NULL,'porc','Porc','🐷','croissance','Croissance (25-60 kg)',2),
(NULL,'porc','Porc','🐷','finition','Finition (60+ kg)',3),
(NULL,'porc','Porc','🐷','truie_gestante','Truie gestante',4),
(NULL,'porc','Porc','🐷','truie_allaitante','Truie allaitante',5),
-- Canard
(NULL,'canard','Canard','🦆','demarrage','Démarrage (0-3 sem)',1),
(NULL,'canard','Canard','🦆','croissance','Croissance (3-7 sem)',2),
(NULL,'canard','Canard','🦆','finition','Finition (7-12 sem)',3),
-- Tilapia
(NULL,'tilapia','Tilapia','🐟','alevin','Alevin (<5g)',1),
(NULL,'tilapia','Tilapia','🐟','grossissement','Grossissement (5-200g)',2),
(NULL,'tilapia','Tilapia','🐟','finition','Finition (>200g)',3),
-- Grenouille goliath
(NULL,'goliath','Grenouille Goliath','🐸','tetard','Têtards & juvéniles',1),
(NULL,'goliath','Grenouille Goliath','🐸','croissance','Croissance (50-300g)',2),
(NULL,'goliath','Grenouille Goliath','🐸','finition','Finition avant vente',3),
(NULL,'goliath','Grenouille Goliath','🐸','reproduction','Reproducteurs',4),
-- Dindon
(NULL,'dindon','Dindon','🦃','demarrage','Démarrage (0-4 sem)',1),
(NULL,'dindon','Dindon','🦃','croissance','Croissance (4-12 sem)',2),
(NULL,'dindon','Dindon','🦃','finition','Finition (12+ sem)',3)
ON CONFLICT DO NOTHING;

-- ═══════════════════════════════════════════════════════
-- 6. SEED — BESOINS NUTRITIONNELS STANDARDS
-- Sources : Hyline (pondeuse) · Ross 308 (chair) · ITAVI (lapin)
--           NRC (porc) · Grimaud (canard) · NRC fish (tilapia)
-- ═══════════════════════════════════════════════════════
INSERT INTO gp_besoins_nutritionnels (admin_id, espece, categorie,
  pb_min, pb_max, em_min, em_max, lipides_min, fibres_max,
  lysine_min, methionine_min, meth_cyst_min, threonine_min, tryptophane_min,
  calcium_min, calcium_max, phosphore_disp_min,
  sodium_min, chlore_min, source) VALUES

-- ── Pondeuses Hyline Brown ──
(NULL,'pondeuse','demarrage', 20.0,21.0, 2900,2950, 3.0, 4.5, 1.20, 0.49, 0.94, 0.85, 0.23, 1.00,1.20, 0.45, 0.18, 0.17, 'Hyline Brown 2022'),
(NULL,'pondeuse','croissance', 17.5,18.5, 2850,2900, 3.0, 5.0, 0.90, 0.38, 0.74, 0.65, 0.18, 1.00,1.20, 0.40, 0.17, 0.16, 'Hyline Brown 2022'),
(NULL,'pondeuse','preponte', 17.0,18.0, 2800,2850, 3.0, 5.0, 0.85, 0.40, 0.75, 0.62, 0.17, 2.00,2.50, 0.45, 0.17, 0.16, 'Hyline Brown 2022'),
(NULL,'pondeuse','ponte_pic', 17.5,18.5, 2800,2900, 4.0, 5.0, 0.91, 0.43, 0.80, 0.65, 0.20, 4.20,4.50, 0.45, 0.18, 0.17, 'Hyline Brown 2022'),
(NULL,'pondeuse','ponte_persistance', 16.5,17.5, 2780,2850, 4.0, 5.5, 0.86, 0.41, 0.76, 0.62, 0.19, 4.30,4.60, 0.42, 0.17, 0.16, 'Hyline Brown 2022'),

-- ── Poulet chair Ross 308 ──
(NULL,'chair','demarrage', 22.5,24.0, 2950,3050, 5.0, 4.0, 1.43, 0.51, 1.08, 0.94, 0.24, 1.00,1.20, 0.48, 0.19, 0.20, 'Ross 308 2019'),
(NULL,'chair','croissance', 21.0,22.5, 3050,3150, 6.0, 4.0, 1.24, 0.47, 0.99, 0.83, 0.20, 0.95,1.10, 0.45, 0.18, 0.19, 'Ross 308 2019'),
(NULL,'chair','finition', 19.0,20.5, 3150,3250, 6.5, 4.0, 1.09, 0.43, 0.89, 0.74, 0.18, 0.85,1.00, 0.42, 0.16, 0.18, 'Ross 308 2019'),

-- ── Lapin ITAVI 2018 ──
(NULL,'lapin','lapereau', 18.5,19.5, 2400,2500, 3.5,15.0, 0.95, 0.45, 0.70, 0.70, 0.18, 1.10,1.30, 0.55, 0.22, 0.30, 'ITAVI 2018'),
(NULL,'lapin','engraissement', 15.0,16.5, 2400,2500, 3.0,15.0, 0.75, 0.35, 0.55, 0.55, 0.14, 0.80,1.00, 0.40, 0.20, 0.30, 'ITAVI 2018'),
(NULL,'lapin','reproduction', 17.5,18.5, 2500,2600, 3.5,14.0, 0.85, 0.40, 0.65, 0.65, 0.16, 1.10,1.30, 0.55, 0.22, 0.30, 'ITAVI 2018'),

-- ── Porc NRC 2012 ──
(NULL,'porc','porcelet', 20.0,22.0, 3300,3400, 4.0, 4.0, 1.35, 0.40, 0.74, 0.84, 0.22, 0.80,1.00, 0.42, 0.25, 0.22, 'NRC 2012'),
(NULL,'porc','croissance', 17.0,18.5, 3250,3350, 3.5, 4.5, 1.00, 0.30, 0.57, 0.62, 0.17, 0.65,0.80, 0.31, 0.18, 0.16, 'NRC 2012'),
(NULL,'porc','finition', 14.5,16.0, 3250,3350, 3.0, 5.0, 0.80, 0.24, 0.46, 0.50, 0.14, 0.55,0.70, 0.27, 0.15, 0.13, 'NRC 2012'),
(NULL,'porc','truie_gestante', 13.0,14.5, 3100,3200, 3.0, 7.0, 0.58, 0.16, 0.34, 0.40, 0.10, 0.85,1.00, 0.40, 0.15, 0.14, 'NRC 2012'),
(NULL,'porc','truie_allaitante', 17.5,19.0, 3300,3400, 4.5, 5.0, 1.00, 0.27, 0.53, 0.59, 0.18, 0.85,1.00, 0.40, 0.20, 0.18, 'NRC 2012'),

-- ── Canard Grimaud ──
(NULL,'canard','demarrage', 21.0,22.5, 2950,3050, 4.5, 4.5, 1.25, 0.48, 0.94, 0.82, 0.22, 0.95,1.10, 0.45, 0.18, 0.18, 'Grimaud Frères'),
(NULL,'canard','croissance', 18.0,19.5, 3000,3100, 5.5, 4.5, 1.00, 0.40, 0.79, 0.66, 0.18, 0.85,1.00, 0.40, 0.17, 0.17, 'Grimaud Frères'),
(NULL,'canard','finition', 16.0,17.5, 3100,3200, 6.0, 4.5, 0.85, 0.34, 0.66, 0.55, 0.15, 0.80,0.95, 0.38, 0.16, 0.16, 'Grimaud Frères'),

-- ── Tilapia NRC Fish ──
(NULL,'tilapia','alevin', 35.0,40.0, 3500,3700, 8.0, 5.0, 2.00, 0.90, 1.30, 1.50, 0.40, 1.20,1.50, 0.60, 0.30, 0.30, 'NRC Fish 2011'),
(NULL,'tilapia','grossissement', 28.0,32.0, 3300,3500, 7.0, 5.0, 1.60, 0.75, 1.10, 1.20, 0.30, 1.00,1.20, 0.55, 0.25, 0.25, 'NRC Fish 2011'),
(NULL,'tilapia','finition', 22.0,26.0, 3200,3400, 6.0, 5.0, 1.30, 0.60, 0.95, 1.00, 0.25, 0.90,1.10, 0.50, 0.22, 0.22, 'NRC Fish 2011'),

-- ── Grenouille Goliath (valeurs adaptées tilapia) ──
(NULL,'goliath','tetard', 38.0,42.0, 3500,3700, 8.0, 5.0, 2.10, 0.95, 1.35, 1.55, 0.40, 1.20,1.50, 0.60, 0.30, 0.30, 'NRC Amphibian adapted'),
(NULL,'goliath','croissance', 30.0,34.0, 3300,3500, 7.0, 5.0, 1.70, 0.80, 1.15, 1.25, 0.32, 1.00,1.20, 0.55, 0.25, 0.25, 'NRC Amphibian adapted'),
(NULL,'goliath','finition', 25.0,28.0, 3200,3400, 6.0, 5.0, 1.40, 0.65, 1.00, 1.05, 0.27, 0.90,1.10, 0.50, 0.22, 0.22, 'NRC Amphibian adapted'),
(NULL,'goliath','reproduction', 32.0,36.0, 3400,3600, 7.5, 5.0, 1.80, 0.85, 1.20, 1.30, 0.33, 1.10,1.30, 0.58, 0.27, 0.27, 'NRC Amphibian adapted'),

-- ── Dindon Aviagen ──
(NULL,'dindon','demarrage', 27.0,28.5, 2800,2900, 4.0, 4.0, 1.80, 0.65, 1.30, 1.10, 0.30, 1.20,1.40, 0.55, 0.18, 0.19, 'Aviagen Turkey'),
(NULL,'dindon','croissance', 22.0,23.5, 2950,3050, 5.0, 4.5, 1.45, 0.55, 1.10, 0.92, 0.24, 1.00,1.20, 0.50, 0.17, 0.18, 'Aviagen Turkey'),
(NULL,'dindon','finition', 17.5,19.0, 3100,3200, 6.0, 4.5, 1.05, 0.42, 0.85, 0.70, 0.19, 0.85,1.00, 0.45, 0.16, 0.17, 'Aviagen Turkey')
ON CONFLICT DO NOTHING;

-- ═══════════════════════════════════════════════════════
-- 7. SEED — VALEURS NUTRITIONNELLES INRA POUR MP COURANTES
-- Source : tables INRA-CIRAD-AFZ Feedipedia
-- UPDATE conditionnel (ne touche pas les MP déjà saisies)
-- ═══════════════════════════════════════════════════════
-- Fonction utilitaire : appliquer un set de valeurs sur les MP dont le nom matche
DO $$
DECLARE
  ref jsonb := '[
    {"match":"maïs|mais|mais grain|mais jaune",  "prot":8.5, "em":3300, "lip":3.8, "fib":2.5, "lys":0.25, "met":0.18, "mc":0.36, "thr":0.30, "trp":0.06, "ca":0.02, "pd":0.10, "pt":0.27, "na":0.02, "cl":0.05},
    {"match":"tourteau de soja 44|tourteau soja 44", "prot":44, "em":2400, "lip":1.5, "fib":7.0, "lys":2.75, "met":0.60, "mc":1.20, "thr":1.65, "trp":0.55, "ca":0.30, "pd":0.20, "pt":0.65, "na":0.03, "cl":0.05},
    {"match":"tourteau de soja 46|tourteau soja 46", "prot":46, "em":2440, "lip":1.5, "fib":6.5, "lys":2.88, "met":0.63, "mc":1.27, "thr":1.73, "trp":0.58, "ca":0.30, "pd":0.21, "pt":0.66, "na":0.03, "cl":0.05},
    {"match":"tourteau de soja 48|tourteau soja 48", "prot":48, "em":2480, "lip":1.5, "fib":6.0, "lys":3.00, "met":0.66, "mc":1.33, "thr":1.80, "trp":0.62, "ca":0.30, "pd":0.22, "pt":0.67, "na":0.03, "cl":0.05},
    {"match":"soja torrefie|soja torréfié|graine de soja", "prot":36, "em":3300, "lip":18, "fib":5.5, "lys":2.30, "met":0.55, "mc":1.05, "thr":1.50, "trp":0.48, "ca":0.30, "pd":0.20, "pt":0.55, "na":0.02, "cl":0.04},
    {"match":"son de ble|son de blé", "prot":15, "em":1500, "lip":3.5, "fib":11, "lys":0.55, "met":0.20, "mc":0.50, "thr":0.45, "trp":0.18, "ca":0.13, "pd":0.20, "pt":1.10, "na":0.02, "cl":0.06},
    {"match":"ble tendre|blé tendre|blé", "prot":11.5, "em":3000, "lip":1.7, "fib":2.6, "lys":0.35, "met":0.18, "mc":0.40, "thr":0.32, "trp":0.13, "ca":0.05, "pd":0.13, "pt":0.32, "na":0.02, "cl":0.05},
    {"match":"orge", "prot":11, "em":2800, "lip":1.9, "fib":4.5, "lys":0.38, "met":0.17, "mc":0.42, "thr":0.36, "trp":0.13, "ca":0.06, "pd":0.13, "pt":0.36, "na":0.02, "cl":0.15},
    {"match":"sorgho", "prot":9.5, "em":3200, "lip":3.1, "fib":2.2, "lys":0.21, "met":0.15, "mc":0.33, "thr":0.30, "trp":0.10, "ca":0.03, "pd":0.10, "pt":0.28, "na":0.02, "cl":0.10},
    {"match":"manioc", "prot":2.5, "em":3100, "lip":0.6, "fib":3.5, "lys":0.10, "met":0.03, "mc":0.07, "thr":0.08, "trp":0.03, "ca":0.18, "pd":0.05, "pt":0.10, "na":0.02, "cl":0.02},
    {"match":"farine de poisson 50|farine poisson 50", "prot":50, "em":2750, "lip":9, "fib":1.0, "lys":3.80, "met":1.40, "mc":1.95, "thr":2.10, "trp":0.55, "ca":5.50, "pd":2.80, "pt":3.10, "na":0.50, "cl":0.65},
    {"match":"farine de poisson 72|farine poisson 72", "prot":72, "em":3100, "lip":11, "fib":0.5, "lys":5.50, "met":2.00, "mc":2.80, "thr":3.00, "trp":0.78, "ca":4.20, "pd":2.50, "pt":2.80, "na":0.45, "cl":0.55},
    {"match":"tourteau de palmiste|tourteau palmiste", "prot":17, "em":1900, "lip":7, "fib":17, "lys":0.55, "met":0.28, "mc":0.55, "thr":0.55, "trp":0.18, "ca":0.30, "pd":0.18, "pt":0.55, "na":0.03, "cl":0.06},
    {"match":"tourteau arachide", "prot":45, "em":2700, "lip":7, "fib":7, "lys":1.55, "met":0.50, "mc":1.10, "thr":1.30, "trp":0.45, "ca":0.20, "pd":0.20, "pt":0.60, "na":0.03, "cl":0.04},
    {"match":"tourteau de coton|tourteau coton", "prot":40, "em":2200, "lip":4, "fib":11, "lys":1.65, "met":0.55, "mc":1.20, "thr":1.30, "trp":0.50, "ca":0.20, "pd":0.30, "pt":1.00, "na":0.03, "cl":0.04},
    {"match":"tourteau de tournesol 28|tourteau tournesol 28", "prot":28, "em":1900, "lip":2, "fib":24, "lys":1.00, "met":0.65, "mc":1.30, "thr":1.05, "trp":0.40, "ca":0.35, "pd":0.30, "pt":1.00, "na":0.02, "cl":0.10},
    {"match":"tourteau de tournesol 32|tourteau tournesol 32", "prot":32, "em":2000, "lip":2, "fib":21, "lys":1.15, "met":0.74, "mc":1.48, "thr":1.20, "trp":0.45, "ca":0.35, "pd":0.30, "pt":1.05, "na":0.02, "cl":0.10},
    {"match":"tourteau de colza|tourteau colza", "prot":34, "em":2050, "lip":3, "fib":12, "lys":1.85, "met":0.70, "mc":1.50, "thr":1.50, "trp":0.45, "ca":0.65, "pd":0.40, "pt":1.10, "na":0.02, "cl":0.06},
    {"match":"melasse|mélasse", "prot":4.5, "em":2200, "lip":0.2, "fib":0.5, "lys":0.05, "met":0.03, "mc":0.07, "thr":0.08, "trp":0.03, "ca":0.90, "pd":0.05, "pt":0.10, "na":0.20, "cl":2.20},
    {"match":"coquilles huitres|coquilles d''huitres|coquilles huitre|coquille huitre", "prot":0, "em":0, "lip":0, "fib":0, "lys":0, "met":0, "mc":0, "thr":0, "trp":0, "ca":38, "pd":0.04, "pt":0.04, "na":0.20, "cl":0.20},
    {"match":"carbonate de calcium", "prot":0, "em":0, "lip":0, "fib":0, "lys":0, "met":0, "mc":0, "thr":0, "trp":0, "ca":39, "pd":0.02, "pt":0.02, "na":0.10, "cl":0.10},
    {"match":"phosphate bicalcique|phosphate bical|phosphate", "prot":0, "em":0, "lip":0, "fib":0, "lys":0, "met":0, "mc":0, "thr":0, "trp":0, "ca":23, "pd":18.0, "pt":18.5, "na":0.05, "cl":0.05},
    {"match":"sel|sel nacl|sel de cuisine", "prot":0, "em":0, "lip":0, "fib":0, "lys":0, "met":0, "mc":0, "thr":0, "trp":0, "ca":0, "pd":0, "pt":0, "na":39, "cl":60},
    {"match":"l-lysine|lysine hcl|lysine", "prot":94, "em":3300, "lip":0, "fib":0, "lys":78, "met":0, "mc":0, "thr":0, "trp":0, "ca":0, "pd":0, "pt":0, "na":0, "cl":19},
    {"match":"methionine|méthionine|dl-methionine|methionine dl", "prot":58, "em":3300, "lip":0, "fib":0, "lys":0, "met":99, "mc":99, "thr":0, "trp":0, "ca":0, "pd":0, "pt":0, "na":0, "cl":0},
    {"match":"threonine|thréonine|l-threonine", "prot":74, "em":3300, "lip":0, "fib":0, "lys":0, "met":0, "mc":0, "thr":98, "trp":0, "ca":0, "pd":0, "pt":0, "na":0, "cl":0},
    {"match":"huile de soja|huile soja", "prot":0, "em":8500, "lip":99, "fib":0, "lys":0, "met":0, "mc":0, "thr":0, "trp":0, "ca":0, "pd":0, "pt":0, "na":0, "cl":0},
    {"match":"huile de tournesol|huile tournesol", "prot":0, "em":8500, "lip":99, "fib":0, "lys":0, "met":0, "mc":0, "thr":0, "trp":0, "ca":0, "pd":0, "pt":0, "na":0, "cl":0},
    {"match":"huile palmiste|huile de palmiste", "prot":0, "em":8500, "lip":99, "fib":0, "lys":0, "met":0, "mc":0, "thr":0, "trp":0, "ca":0, "pd":0, "pt":0, "na":0, "cl":0},
    {"match":"huile rouge|huile de palme", "prot":0, "em":8500, "lip":99, "fib":0, "lys":0, "met":0, "mc":0, "thr":0, "trp":0, "ca":0, "pd":0, "pt":0, "na":0, "cl":0},
    {"match":"graisse vegetale|graisse végétale|graisse animale", "prot":0, "em":8000, "lip":99, "fib":0, "lys":0, "met":0, "mc":0, "thr":0, "trp":0, "ca":0, "pd":0, "pt":0, "na":0, "cl":0},
    {"match":"luzerne deshydratee|luzerne déshydratée|luzerne", "prot":18, "em":1500, "lip":2.5, "fib":24, "lys":0.85, "met":0.30, "mc":0.55, "thr":0.75, "trp":0.40, "ca":1.45, "pd":0.20, "pt":0.28, "na":0.10, "cl":0.45},
    {"match":"foin|paille", "prot":7, "em":1300, "lip":1.5, "fib":30, "lys":0.30, "met":0.15, "mc":0.30, "thr":0.30, "trp":0.10, "ca":0.40, "pd":0.10, "pt":0.20, "na":0.05, "cl":0.10},
    {"match":"feuille de leucena|leucena|leucaena", "prot":24, "em":1700, "lip":4.5, "fib":15, "lys":1.10, "met":0.30, "mc":0.55, "thr":0.85, "trp":0.30, "ca":1.20, "pd":0.20, "pt":0.27, "na":0.10, "cl":0.20},
    {"match":"avoine", "prot":11, "em":2600, "lip":4.5, "fib":11, "lys":0.45, "met":0.20, "mc":0.45, "thr":0.40, "trp":0.15, "ca":0.10, "pd":0.16, "pt":0.34, "na":0.02, "cl":0.10},
    {"match":"feverole|féverole", "prot":26, "em":2400, "lip":1.5, "fib":8, "lys":1.65, "met":0.20, "mc":0.55, "thr":0.95, "trp":0.25, "ca":0.13, "pd":0.20, "pt":0.55, "na":0.02, "cl":0.10},
    {"match":"pois|pois fourrager", "prot":22, "em":2500, "lip":1.5, "fib":6, "lys":1.55, "met":0.20, "mc":0.55, "thr":0.85, "trp":0.20, "ca":0.10, "pd":0.20, "pt":0.45, "na":0.02, "cl":0.10}
  ]'::jsonb;
  item jsonb;
BEGIN
  FOR item IN SELECT * FROM jsonb_array_elements(ref) LOOP
    UPDATE gp_ingredients
    SET proteines       = COALESCE(NULLIF(proteines,0), (item->>'prot')::numeric),
        energie         = COALESCE(NULLIF(energie,0),   (item->>'em')::numeric),
        lipides         = COALESCE(lipides,             (item->>'lip')::numeric),
        fibres          = COALESCE(fibres,              (item->>'fib')::numeric),
        lysine          = COALESCE(lysine,              (item->>'lys')::numeric),
        methionine      = COALESCE(methionine,          (item->>'met')::numeric),
        meth_cyst       = COALESCE(meth_cyst,           (item->>'mc')::numeric),
        threonine       = COALESCE(threonine,           (item->>'thr')::numeric),
        tryptophane     = COALESCE(tryptophane,         (item->>'trp')::numeric),
        calcium         = COALESCE(calcium,             (item->>'ca')::numeric),
        phosphore_disp  = COALESCE(phosphore_disp,      (item->>'pd')::numeric),
        phosphore_total = COALESCE(phosphore_total,     (item->>'pt')::numeric),
        sodium          = COALESCE(sodium,              (item->>'na')::numeric),
        chlore          = COALESCE(chlore,              (item->>'cl')::numeric)
    WHERE LOWER(nom) ~ (item->>'match');
  END LOOP;
END$$;
