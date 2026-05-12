-- ══════════════════════════════════════════════════
-- COMPLÉMENT VALEURS NUTRITIONNELLES MP
-- Source : ATM Farm Village "BASE DE DONNEES MP.xlsx"
-- Tables EGRAN + INRA 2004 + F. Lebas
-- À exécuter dans Supabase SQL Editor
-- ══════════════════════════════════════════════════
-- Stratégie : pour chaque MP du fichier, on UPDATE les MP en base
-- dont le nom matche (ILIKE) avec un pattern court. COALESCE pour
-- ne pas écraser les valeurs déjà saisies par l'utilisateur (sauf si NULL).
-- Prémix de chair
UPDATE gp_ingredients SET
  matiere_seche      = COALESCE(matiere_seche, 99)
WHERE LOWER(nom) ILIKE '%premix de chair%';

-- Riz blanc)
UPDATE gp_ingredients SET
  matiere_seche      = COALESCE(matiere_seche, 88),
  proteines          = 8,
  energie            = 3552,
  lipides            = 1.2,
  fibres             = 0.5,
  lysine             = 0.3,
  methionine         = 0.13,
  meth_cyst          = 0.38,
  threonine          = 0.27,
  tryptophane        = 0.09,
  calcium            = 0.01,
  phosphore_total    = 0.2,
  sodium             = 0.02,
  chlore             = 0.01
WHERE LOWER(nom) ILIKE '%riz%';

-- Al132 robénidine (blé 40%, CaCo3 60%)
UPDATE gp_ingredients SET
  matiere_seche      = COALESCE(matiere_seche, 95),
  proteines          = 4.3,
  energie            = 1208,
  lipides            = 0.7,
  fibres             = 0.9,
  lysine             = 0.13,
  methionine         = 0.07,
  meth_cyst          = 0.18,
  threonine          = 0.14,
  tryptophane        = 0.06,
  calcium            = 22.5,
  phosphore_total    = 0.14,
  sodium             = 0.01,
  chlore             = 0.02
WHERE LOWER(nom) ILIKE '%al132%';

-- MG2MIX chair
UPDATE gp_ingredients SET
  matiere_seche      = COALESCE(matiere_seche, 96),
  proteines          = 12,
  energie            = 2400,
  lipides            = 3.95,
  lysine             = 7,
  methionine         = 9,
  calcium            = 17,
  phosphore_total    = 4.6,
  sodium             = 6.2
WHERE LOWER(nom) ILIKE '%mg2mix%';

-- Tourteau de coprah expeller (INRA 172)
UPDATE gp_ingredients SET
  matiere_seche      = COALESCE(matiere_seche, 91),
  proteines          = 20.5,
  energie            = 2740,
  lipides            = 8.2,
  fibres             = 12.5,
  lysine             = 0.53,
  methionine         = 0.29,
  meth_cyst          = 0.55,
  threonine          = 0.62,
  tryptophane        = 0.27,
  calcium            = 0.14,
  phosphore_total    = 0.54,
  sodium             = 0.06,
  chlore             = 0.63
WHERE LOWER(nom) ILIKE '%tourteau de coprah expeller%';

-- Sorgho (INRA 90)
UPDATE gp_ingredients SET
  matiere_seche      = COALESCE(matiere_seche, 87),
  proteines          = 9.4,
  energie            = 2880,
  lipides            = 2.9,
  fibres             = 2.4,
  lysine             = 0.22,
  methionine         = 0.15,
  meth_cyst          = 0.33,
  threonine          = 0.31,
  tryptophane        = 0.09,
  calcium            = 0.03,
  phosphore_total    = 0.28,
  sodium             = 0.02,
  chlore             = 0.06
WHERE LOWER(nom) ILIKE '%sorgho%';

-- Tourteau de tournesol 28 (INRA 194)
UPDATE gp_ingredients SET
  matiere_seche      = COALESCE(matiere_seche, 89),
  proteines          = 27.9,
  energie            = 2040,
  lipides            = 2.7,
  fibres             = 25.2,
  lysine             = 1,
  methionine         = 0.64,
  meth_cyst          = 1.12,
  threonine          = 1,
  tryptophane        = 0.33,
  calcium            = 0.35,
  phosphore_total    = 1,
  sodium             = 0.03,
  chlore             = 0.15
WHERE LOWER(nom) ILIKE '%tourteau de tournesol 28%';

-- Luzerne déshydratée 18 (INRA 254)
UPDATE gp_ingredients SET
  matiere_seche      = COALESCE(matiere_seche, 90),
  proteines          = 18,
  energie            = 1840,
  lipides            = 3.6,
  fibres             = 21.6,
  lysine             = 0.83,
  methionine         = 0.27,
  meth_cyst          = 0.5,
  threonine          = 0.74,
  tryptophane        = 0.25,
  calcium            = 1.6,
  phosphore_total    = 0.27,
  sodium             = 0.08,
  chlore             = 0.49
WHERE LOWER(nom) ILIKE '%luzerne deshydratee 18%';

-- Epulchure de Manioc
UPDATE gp_ingredients SET
  matiere_seche      = COALESCE(matiere_seche, 89),
  proteines          = 4,
  energie            = 2700,
  lipides            = 1.5,
  fibres             = 20,
  calcium            = 0.2,
  phosphore_total    = 0.04
WHERE LOWER(nom) ILIKE '%epulchure%';

-- Coquilles d''œuf séchées
UPDATE gp_ingredients SET
  matiere_seche      = COALESCE(matiere_seche, 95),
  proteines          = 7.5,
  calcium            = 35,
  phosphore_total    = 0.12,
  sodium             = 0.15,
  chlore             = 0.1
WHERE LOWER(nom) ILIKE '%coquilles d uf sechees%';

-- Féverole à fleurs colorées (INRA 146)
UPDATE gp_ingredients SET
  matiere_seche      = COALESCE(matiere_seche, 86.5),
  proteines          = 25.4,
  energie            = 2820,
  lipides            = 1.3,
  fibres             = 7.9,
  lysine             = 1.65,
  methionine         = 0.18,
  meth_cyst          = 0.51,
  threonine          = 0.91,
  tryptophane        = 0.2,
  calcium            = 0.14,
  phosphore_total    = 0.46,
  sodium             = 0.01,
  chlore             = 0.07
WHERE LOWER(nom) ILIKE '%feverole%';

-- Son de maïs (INRA 122)
UPDATE gp_ingredients SET
  matiere_seche      = COALESCE(matiere_seche, 88),
  proteines          = 9.6,
  energie            = 2110,
  lipides            = 3.6,
  fibres             = 12.8,
  lysine             = 0.36,
  methionine         = 0.16,
  meth_cyst          = 0.37,
  threonine          = 0.33,
  tryptophane        = 0.06,
  calcium            = 0.47,
  phosphore_total    = 0.29,
  sodium             = 0.03,
  chlore             = 0.21
WHERE LOWER(nom) ILIKE '%son de mais%';

-- Son de riz déshuilé ( INRA 136)
UPDATE gp_ingredients SET
  matiere_seche      = COALESCE(matiere_seche, 90),
  proteines          = 14.4,
  energie            = 2110,
  lipides            = 15.3,
  fibres             = 8.1,
  lysine             = 0.65,
  methionine         = 0.32,
  meth_cyst          = 0.62,
  threonine          = 0.53,
  tryptophane        = 0.19,
  calcium            = 0.12,
  phosphore_total    = 1.6,
  sodium             = 0.06,
  chlore             = 0.08
WHERE LOWER(nom) ILIKE '%son de riz deshuile%';

-- Graisse animale (INRA 283)
UPDATE gp_ingredients SET
  matiere_seche      = COALESCE(matiere_seche, 99.5),
  energie            = 8000,
  lipides            = 99,
  fibres             = 0,
  lysine             = 0,
  methionine         = 0,
  meth_cyst          = 0,
  threonine          = 0,
  tryptophane        = 0,
  calcium            = 0,
  phosphore_total    = 0,
  sodium             = 0,
  chlore             = 0
WHERE LOWER(nom) ILIKE '%graisse animale%';

-- Huile Palmiste
UPDATE gp_ingredients SET
  matiere_seche      = COALESCE(matiere_seche, 99.5),
  energie            = 8500,
  lipides            = 99,
  fibres             = 0,
  lysine             = 0,
  methionine         = 0,
  meth_cyst          = 0,
  threonine          = 0,
  tryptophane        = 0,
  calcium            = 0,
  phosphore_total    = 0,
  sodium             = 0,
  chlore             = 0
WHERE LOWER(nom) ILIKE '%huile palmiste%';

-- Farine de poisson Pur type 72%
UPDATE gp_ingredients SET
  matiere_seche      = COALESCE(matiere_seche, 92),
  proteines          = 72,
  energie            = 3000,
  lipides            = 9.7,
  fibres             = 0,
  lysine             = 5.4,
  methionine         = 2.02,
  meth_cyst          = 2.66,
  threonine          = 3.02,
  tryptophane        = 0.72,
  calcium            = 2.41,
  phosphore_total    = 2.06,
  sodium             = 0.95,
  chlore             = 1.51
WHERE LOWER(nom) ILIKE '%farine de poisson pur%';

-- Huile de tournesol (INRA 285)
UPDATE gp_ingredients SET
  matiere_seche      = COALESCE(matiere_seche, 99.5),
  energie            = 8500,
  lipides            = 99,
  fibres             = 0,
  lysine             = 0,
  methionine         = 0,
  meth_cyst          = 0,
  threonine          = 0,
  tryptophane        = 0,
  calcium            = 0,
  phosphore_total    = 0,
  sodium             = 0,
  chlore             = 0
WHERE LOWER(nom) ILIKE '%huile de tournesol%';

-- Levure de brasserie déshydratée (INRA 220)
UPDATE gp_ingredients SET
  matiere_seche      = COALESCE(matiere_seche, 93),
  proteines          = 46.5,
  energie            = 3650,
  lipides            = 3.9,
  fibres             = 1.9,
  lysine             = 2.89,
  methionine         = 0.7,
  meth_cyst          = 0.98,
  threonine          = 2,
  tryptophane        = 0.47,
  calcium            = 0.32,
  phosphore_total    = 1.16,
  sodium             = 0.17,
  chlore             = 0.29
WHERE LOWER(nom) ILIKE '%levure de brasserie deshydratee%';

-- Farine basse blé tendre (INRA 98)
UPDATE gp_ingredients SET
  matiere_seche      = COALESCE(matiere_seche, 88.2),
  proteines          = 12.7,
  energie            = 3180,
  lipides            = 2.4,
  fibres             = 1.5,
  lysine             = 0.46,
  methionine         = 0.19,
  meth_cyst          = 0.44,
  threonine          = 0.38,
  tryptophane        = 0.5,
  calcium            = 0.09,
  phosphore_total    = 0.36,
  sodium             = 0.01,
  chlore             = 0.06
WHERE LOWER(nom) ILIKE '%farine basse ble tendre%';

-- Méthionine - DL - 99%
UPDATE gp_ingredients SET
  matiere_seche      = COALESCE(matiere_seche, 99),
  proteines          = 58.7,
  methionine         = 99,
  meth_cyst          = 99,
  calcium            = 0.02
WHERE LOWER(nom) ILIKE '%methionine%';

-- Luzerne déshydratée 12 (INRA 250)
UPDATE gp_ingredients SET
  matiere_seche      = COALESCE(matiere_seche, 90),
  proteines          = 12.6,
  energie            = 1520,
  lipides            = 2.3,
  fibres             = 29.7,
  lysine             = 0.53,
  methionine         = 0.16,
  meth_cyst          = 0.35,
  threonine          = 0.5,
  tryptophane        = 0.18,
  calcium            = 1.4,
  phosphore_total    = 0.26,
  sodium             = 0.06,
  chlore             = 0.35
WHERE LOWER(nom) ILIKE '%luzerne deshydratee 12%';

-- Herbe déshydratée (INRA 248)
UPDATE gp_ingredients SET
  matiere_seche      = COALESCE(matiere_seche, 90),
  proteines          = 15,
  energie            = 1830,
  lipides            = 3,
  fibres             = 22.5,
  lysine             = 0.62,
  methionine         = 0.21,
  meth_cyst          = 0.35,
  threonine          = 0.57,
  tryptophane        = 0.21,
  calcium            = 0.7,
  phosphore_total    = 0.4,
  sodium             = 0.1,
  chlore             = 0.08
WHERE LOWER(nom) ILIKE '%herbe%';

-- Oléine
UPDATE gp_ingredients SET
  matiere_seche      = COALESCE(matiere_seche, 99.5),
  energie            = 7500,
  lipides            = 99,
  fibres             = 0,
  lysine             = 0,
  methionine         = 0,
  meth_cyst          = 0,
  threonine          = 0,
  tryptophane        = 0,
  calcium            = 0,
  phosphore_total    = 0,
  sodium             = 0,
  chlore             = 0
WHERE LOWER(nom) ILIKE '%oleine%';

-- Son de blé/cubé
UPDATE gp_ingredients SET
  matiere_seche      = COALESCE(matiere_seche, 88),
  proteines          = 15.5,
  energie            = 1619,
  lipides            = 3.4,
  fibres             = 9.5,
  lysine             = 0.6,
  methionine         = 0.23,
  meth_cyst          = 0.57,
  threonine          = 0.5,
  tryptophane        = 0.2,
  calcium            = 0.15,
  phosphore_total    = 1.09,
  sodium             = 0.03,
  chlore             = 0.08
WHERE LOWER(nom) ILIKE '%son de ble cube%';

-- Tourteau de soja 46 ("48 profat" INRA 190)
UPDATE gp_ingredients SET
  matiere_seche      = COALESCE(matiere_seche, 88),
  proteines          = 45,
  energie            = 2880,
  lipides            = 1.8,
  fibres             = 6.3,
  lysine             = 2.75,
  methionine         = 0.63,
  meth_cyst          = 1.31,
  threonine          = 1.76,
  tryptophane        = 0.59,
  calcium            = 0.29,
  phosphore_total    = 0.61,
  sodium             = 0.02,
  chlore             = 0.04
WHERE LOWER(nom) ILIKE '%tourteau de soja 46%';

-- Caroube, farine de gousse (INRA 218)
UPDATE gp_ingredients SET
  matiere_seche      = COALESCE(matiere_seche, 85),
  proteines          = 4.4,
  energie            = 2130,
  lipides            = 0.4,
  fibres             = 7.3,
  lysine             = 0.15,
  methionine         = 0.09,
  meth_cyst          = 0.14,
  threonine          = 0.14,
  tryptophane        = 0.08,
  calcium            = 0.45,
  phosphore_total    = 0.1,
  sodium             = 0.02,
  chlore             = 0.15
WHERE LOWER(nom) ILIKE '%caroube%';

-- Tourteau de pépin de raisin (INRA 184)
UPDATE gp_ingredients SET
  matiere_seche      = COALESCE(matiere_seche, 90),
  proteines          = 9.9,
  energie            = 780,
  lipides            = 1.4,
  fibres             = 44.1,
  lysine             = 0.41,
  methionine         = 0.17,
  meth_cyst          = 0.38,
  threonine          = 0.36,
  tryptophane        = 0.12,
  calcium            = 0.6,
  phosphore_total    = 0.12,
  sodium             = 0.01,
  chlore             = 0.01
WHERE LOWER(nom) ILIKE '%tourteau de pepin de%';

-- Huile de soja (INRA 285)
UPDATE gp_ingredients SET
  matiere_seche      = COALESCE(matiere_seche, 99.5),
  energie            = 8500,
  lipides            = 99,
  fibres             = 0,
  lysine             = 0,
  methionine         = 0,
  meth_cyst          = 0,
  threonine          = 0,
  tryptophane        = 0,
  calcium            = 0,
  phosphore_total    = 0,
  sodium             = 0,
  chlore             = 0
WHERE LOWER(nom) ILIKE '%huile de soja%';

-- Remoulage demi blanc blé (wheat short,INRA 102)
UPDATE gp_ingredients SET
  matiere_seche      = COALESCE(matiere_seche, 88),
  proteines          = 15.5,
  energie            = 2520,
  lipides            = 3.6,
  fibres             = 7,
  lysine             = 0.62,
  methionine         = 0.23,
  meth_cyst          = 0.56,
  threonine          = 0.5,
  tryptophane        = 0.2,
  calcium            = 0.14,
  phosphore_total    = 1.05,
  sodium             = 0.03,
  chlore             = 0.08
WHERE LOWER(nom) ILIKE '%remoulage%';

-- Prémix de ponte
UPDATE gp_ingredients SET
  matiere_seche      = COALESCE(matiere_seche, 99)
WHERE LOWER(nom) ILIKE '%premix de ponte%';

-- Coques de soja ( INRA 214)
UPDATE gp_ingredients SET
  matiere_seche      = COALESCE(matiere_seche, 90),
  proteines          = 12.2,
  energie            = 1640,
  lipides            = 2,
  fibres             = 35.5,
  lysine             = 0.72,
  methionine         = 0.15,
  meth_cyst          = 0.34,
  threonine          = 0.44,
  tryptophane        = 0.15,
  calcium            = 0.5,
  phosphore_total    = 0.16,
  sodium             = 0.02,
  chlore             = 0.03
WHERE LOWER(nom) ILIKE '%coques de soja%';

-- Drèche de Manioc
UPDATE gp_ingredients SET
  matiere_seche      = COALESCE(matiere_seche, 89),
  proteines          = 2.4,
  energie            = 2414,
  lipides            = 0.6,
  fibres             = 17.2,
  calcium            = 0.74,
  phosphore_total    = 0.04
WHERE LOWER(nom) ILIKE '%dreche de manioc%';

-- Tourteau d''arachide détoxifié (INRA 166)
UPDATE gp_ingredients SET
  matiere_seche      = COALESCE(matiere_seche, 89),
  proteines          = 40.2,
  energie            = 2199,
  lipides            = 0.9,
  fibres             = 12,
  lysine             = 1.33,
  methionine         = 0.4,
  meth_cyst          = 0.76,
  threonine          = 1.09,
  tryptophane        = 0.48,
  calcium            = 0.19,
  phosphore_total    = 0.56,
  sodium             = 0.19,
  chlore             = 0.1
WHERE LOWER(nom) ILIKE '%tourteau d arachide detoxifie%';

-- Féverole à fleurs blanches (INRA 144)
UPDATE gp_ingredients SET
  matiere_seche      = COALESCE(matiere_seche, 86.1),
  proteines          = 26.8,
  energie            = 3020,
  lipides            = 1.1,
  fibres             = 7.5,
  lysine             = 1.72,
  methionine         = 0.19,
  meth_cyst          = 0.54,
  threonine          = 0.96,
  tryptophane        = 0.21,
  calcium            = 0.14,
  phosphore_total    = 0.47,
  sodium             = 0.01,
  chlore             = 0.07
WHERE LOWER(nom) ILIKE '%feverole%';

-- Tourteau de colza (INRA 170)
UPDATE gp_ingredients SET
  matiere_seche      = COALESCE(matiere_seche, 90),
  proteines          = 33.7,
  energie            = 2380,
  lipides            = 2.5,
  fibres             = 12.1,
  lysine             = 1.79,
  methionine         = 0.67,
  meth_cyst          = 1.52,
  threonine          = 1.45,
  tryptophane        = 0.44,
  calcium            = 0.7,
  phosphore_total    = 1,
  sodium             = 0.07,
  chlore             = 0.03
WHERE LOWER(nom) ILIKE '%tourteau de colza%';

-- Manioc 60
UPDATE gp_ingredients SET
  matiere_seche      = COALESCE(matiere_seche, 88),
  proteines          = 2.5,
  energie            = 2850,
  lipides            = 0.7,
  fibres             = 4.8,
  lysine             = 0.1,
  methionine         = 0.04,
  meth_cyst          = 0.09,
  threonine          = 0.08,
  tryptophane        = 0.02,
  calcium            = 0.3,
  phosphore_total    = 0.12,
  sodium             = 0.04,
  chlore             = 0.11
WHERE LOWER(nom) ILIKE '%manioc 60%';

-- Coques de cacao (INRA 212)
UPDATE gp_ingredients SET
  matiere_seche      = COALESCE(matiere_seche, 88),
  proteines          = 16.1,
  energie            = 1250,
  lipides            = 5.1,
  fibres             = 18.3,
  lysine             = 0.69,
  methionine         = 0.14,
  meth_cyst          = 0.64,
  threonine          = 0.64,
  tryptophane        = 0.19,
  calcium            = 0.3,
  phosphore_total    = 0.35,
  sodium             = 0.08,
  chlore             = 0.15
WHERE LOWER(nom) ILIKE '%coques de cacao%';

-- Manioc 65 (INRA 200)
UPDATE gp_ingredients SET
  matiere_seche      = COALESCE(matiere_seche, 88),
  proteines          = 2.7,
  energie            = 2960,
  lipides            = 0.7,
  fibres             = 4.4,
  lysine             = 0.11,
  methionine         = 0.05,
  meth_cyst          = 0.09,
  threonine          = 0.08,
  tryptophane        = 0.02,
  calcium            = 0.25,
  phosphore_total    = 0.11,
  sodium             = 0.03,
  chlore             = 0.07
WHERE LOWER(nom) ILIKE '%manioc 65%';

-- Drèches d''orge de brasserie (INRA 130)
UPDATE gp_ingredients SET
  matiere_seche      = COALESCE(matiere_seche, 91.9),
  proteines          = 24.1,
  energie            = 2300,
  lipides            = 7.4,
  fibres             = 15.3,
  lysine             = 0.77,
  methionine         = 0.77,
  meth_cyst          = 0.77,
  threonine          = 0.75,
  tryptophane        = 0.27,
  calcium            = 0.21,
  phosphore_total    = 0.58,
  sodium             = 0.02,
  chlore             = 0.1
WHERE LOWER(nom) ILIKE '%dreches%';

-- pulpe de baobab
UPDATE gp_ingredients SET
  matiere_seche      = COALESCE(matiere_seche, 90),
  proteines          = 2.3
WHERE LOWER(nom) ILIKE '%pulpe de baobab%';

-- Feuille de leucena sèche
UPDATE gp_ingredients SET
  matiere_seche      = COALESCE(matiere_seche, 89),
  proteines          = 23.3,
  energie            = 1000,
  lipides            = 4,
  fibres             = 19.9,
  lysine             = 5.5,
  methionine         = 1.5,
  calcium            = 1.01,
  phosphore_total    = 0.21,
  sodium             = 0.1
WHERE LOWER(nom) ILIKE '%feuille de leucena seche%';

-- Blé tendre (INRA 80)
UPDATE gp_ingredients SET
  matiere_seche      = COALESCE(matiere_seche, 88),
  proteines          = 10.8,
  energie            = 3020,
  lipides            = 1.8,
  fibres             = 2.2,
  lysine             = 0.31,
  methionine         = 0.17,
  meth_cyst          = 0.43,
  threonine          = 0.33,
  tryptophane        = 0.13,
  calcium            = 0.04,
  phosphore_total    = 0.35,
  sodium             = 0.02,
  chlore             = 0.06
WHERE LOWER(nom) ILIKE '%ble%';

-- Concentré ponte Layermax
UPDATE gp_ingredients SET
  matiere_seche      = COALESCE(matiere_seche, 99),
  proteines          = 30,
  energie            = 2400,
  lipides            = 0,
  lysine             = 3,
  methionine         = 3,
  meth_cyst          = 3.5,
  threonine          = 1,
  calcium            = 5,
  phosphore_total    = 5,
  sodium             = 0.01,
  chlore             = 4.47
WHERE LOWER(nom) ILIKE '%concentre ponte layermax%';

-- Pulpe de betterave déshydratée (INRA 232)
UPDATE gp_ingredients SET
  matiere_seche      = COALESCE(matiere_seche, 90),
  proteines          = 8.1,
  energie            = 2420,
  lipides            = 0.9,
  fibres             = 17.3,
  lysine             = 0.64,
  methionine         = 0.19,
  meth_cyst          = 0.26,
  threonine          = 0.4,
  tryptophane        = 0.08,
  calcium            = 1.32,
  phosphore_total    = 0.09,
  sodium             = 0.29,
  chlore             = 0.12
WHERE LOWER(nom) ILIKE '%pulpe de betterave deshydratee%';

-- Avoine (INRA 74)
UPDATE gp_ingredients SET
  matiere_seche      = COALESCE(matiere_seche, 88),
  proteines          = 10.6,
  energie            = 2500,
  lipides            = 5.1,
  fibres             = 11.1,
  lysine             = 0.45,
  methionine         = 0.19,
  meth_cyst          = 0.54,
  threonine          = 0.37,
  tryptophane        = 0.14,
  calcium            = 0.1,
  phosphore_total    = 0.3,
  sodium             = 0.02,
  chlore             = 0.07
WHERE LOWER(nom) ILIKE '%avoine%';

-- MG2MIX ponte
UPDATE gp_ingredients SET
  proteines          = 7,
  lysine             = 2.4,
  methionine         = 7.2,
  calcium            = 23.3,
  phosphore_total    = 2.7,
  sodium             = 5.9
WHERE LOWER(nom) ILIKE '%mg2mix%';

-- Colza graine entière (INRA 140)
UPDATE gp_ingredients SET
  matiere_seche      = COALESCE(matiere_seche, 90),
  proteines          = 19.1,
  energie            = 4800,
  lipides            = 42,
  fibres             = 8.2,
  lysine             = 1.18,
  methionine         = 0.42,
  meth_cyst          = 0.9,
  threonine          = 0.92,
  tryptophane        = 0.25,
  calcium            = 0.4,
  phosphore_total    = 0.6,
  sodium             = 0.03,
  chlore             = 0.06
WHERE LOWER(nom) ILIKE '%colza%';

-- Remoulage blanc blé (wheat feed, INRA 100)
UPDATE gp_ingredients SET
  matiere_seche      = COALESCE(matiere_seche, 88),
  proteines          = 14.9,
  energie            = 2810,
  lipides            = 4,
  fibres             = 5,
  lysine             = 0.58,
  methionine         = 0.22,
  meth_cyst          = 0.54,
  threonine          = 0.48,
  tryptophane        = 0.19,
  calcium            = 0.1,
  phosphore_total    = 0.9,
  sodium             = 0.02,
  chlore             = 0.09
WHERE LOWER(nom) ILIKE '%remoulage%';

-- Soja graine entière (toastée=INRA 160)
UPDATE gp_ingredients SET
  matiere_seche      = COALESCE(matiere_seche, 88.6),
  proteines          = 35.2,
  energie            = 3730,
  lipides            = 19.2,
  fibres             = 5.6,
  lysine             = 2.18,
  methionine         = 0.53,
  meth_cyst          = 1.09,
  threonine          = 1.41,
  tryptophane        = 0.46,
  calcium            = 0.32,
  phosphore_total    = 0.53,
  sodium             = 0.08,
  chlore             = 0.05
WHERE LOWER(nom) ILIKE '%soja%';

-- feuilles de baobab fraiche
UPDATE gp_ingredients SET
  matiere_seche      = COALESCE(matiere_seche, 14),
  proteines          = 4,
  lipides            = 0.2,
  fibres             = 3,
  calcium            = 0.4,
  phosphore_total    = 0.6,
  sodium             = 0.2,
  chlore             = 0.5
WHERE LOWER(nom) ILIKE '%feuilles%';

-- PROTEIN 100
UPDATE gp_ingredients SET
  proteines          = 98
WHERE LOWER(nom) ILIKE '%protein%';

-- Triticale (INRA 92)
UPDATE gp_ingredients SET
  matiere_seche      = COALESCE(matiere_seche, 88),
  proteines          = 11,
  energie            = 2970,
  lipides            = 1.6,
  fibres             = 2.3,
  lysine             = 0.44,
  methionine         = 0.2,
  meth_cyst          = 0.48,
  threonine          = 0.37,
  tryptophane        = 0.14,
  calcium            = 0.05,
  phosphore_total    = 0.34,
  sodium             = 0.01,
  chlore             = 0.05
WHERE LOWER(nom) ILIKE '%triticale%';

-- Blé dur (INRA 78)
UPDATE gp_ingredients SET
  matiere_seche      = COALESCE(matiere_seche, 88),
  proteines          = 14.5,
  energie            = 3060,
  lipides            = 1.8,
  fibres             = 2.7,
  lysine             = 0.38,
  methionine         = 0.23,
  meth_cyst          = 0.54,
  threonine          = 0.42,
  tryptophane        = 0.16,
  calcium            = 0.08,
  phosphore_total    = 0.34,
  sodium             = 0.01,
  chlore             = 0.13
WHERE LOWER(nom) ILIKE '%ble%';

-- Lin graine (INTA 148)
UPDATE gp_ingredients SET
  matiere_seche      = COALESCE(matiere_seche, 90),
  proteines          = 22.6,
  energie            = 4032,
  lipides            = 32.7,
  fibres             = 9.2,
  lysine             = 0.88,
  methionine         = 0.43,
  meth_cyst          = 0.88,
  threonine          = 1.04,
  tryptophane        = 0.38,
  calcium            = 38,
  phosphore_total    = 0.61,
  sodium             = 0.07,
  chlore             = 0.06
WHERE LOWER(nom) ILIKE '%lin%';

-- Radicelle d''orge (INRA 132)
UPDATE gp_ingredients SET
  matiere_seche      = COALESCE(matiere_seche, 90),
  proteines          = 21.8,
  energie            = 2370,
  lipides            = 1.9,
  fibres             = 12.6,
  lysine             = 0.96,
  methionine         = 0.33,
  meth_cyst          = 0.72,
  threonine          = 0.68,
  tryptophane        = 0.24,
  calcium            = 0.21,
  phosphore_total    = 0.66,
  sodium             = 0.06,
  chlore             = 0.4
WHERE LOWER(nom) ILIKE '%radicelle%';

-- Son de lin (balle de lin / flax chaff)
UPDATE gp_ingredients SET
  matiere_seche      = COALESCE(matiere_seche, 90),
  proteines          = 10.2,
  energie            = 1000,
  lipides            = 3.5,
  fibres             = 31.5,
  lysine             = 0.31,
  methionine         = 0.05,
  meth_cyst          = 0.1,
  threonine          = 0.15,
  calcium            = 1.8,
  phosphore_total    = 0.3,
  sodium             = 0.06,
  chlore             = 0.09
WHERE LOWER(nom) ILIKE '%son de lin%';

-- Tourteau de soja 48 ("50 profat" INRA 192)
UPDATE gp_ingredients SET
  matiere_seche      = COALESCE(matiere_seche, 88),
  proteines          = 46.8,
  energie            = 3040,
  lipides            = 1.8,
  fibres             = 5,
  lysine             = 2.85,
  methionine         = 0.66,
  meth_cyst          = 1.36,
  threonine          = 1.83,
  tryptophane        = 0.61,
  calcium            = 0.29,
  phosphore_total    = 0.64,
  sodium             = 0.02,
  chlore             = 0.04
WHERE LOWER(nom) ILIKE '%tourteau de soja 48%';

-- Feuilles d''olivier
UPDATE gp_ingredients SET
  matiere_seche      = COALESCE(matiere_seche, 90),
  proteines          = 9,
  energie            = 1270,
  lipides            = 4,
  fibres             = 20,
  calcium            = 1.1,
  phosphore_total    = 0.08,
  sodium             = 0.17,
  chlore             = 0.45
WHERE LOWER(nom) ILIKE '%feuilles%';

-- Marc de raisin (INRA 222)
UPDATE gp_ingredients SET
  matiere_seche      = COALESCE(matiere_seche, 92),
  proteines          = 13.1,
  energie            = 1190,
  lipides            = 5.9,
  fibres             = 22.4,
  lysine             = 0.54,
  methionine         = 0.22,
  meth_cyst          = 0.5,
  threonine          = 0.26,
  tryptophane        = 0.12,
  calcium            = 0.7,
  phosphore_total    = 0.2,
  sodium             = 0.01,
  chlore             = 0.01
WHERE LOWER(nom) ILIKE '%marc%';

-- Lupin "blanc", graine (INRA 150)
UPDATE gp_ingredients SET
  matiere_seche      = COALESCE(matiere_seche, 88),
  proteines          = 32.6,
  energie            = 2720,
  lipides            = 7,
  fibres             = 12.8,
  lysine             = 1.6,
  methionine         = 0.26,
  meth_cyst          = 0.78,
  threonine          = 1.21,
  tryptophane        = 0.23,
  calcium            = 0.34,
  phosphore_total    = 0.38,
  sodium             = 0.04,
  chlore             = 0.05
WHERE LOWER(nom) ILIKE '%lupin%';

-- Corn Gluten meal (INRA 116)
UPDATE gp_ingredients SET
  matiere_seche      = COALESCE(matiere_seche, 90),
  proteines          = 60.6,
  energie            = 4320,
  lipides            = 6.3,
  fibres             = 1.1,
  lysine             = 1.09,
  methionine         = 1.03,
  meth_cyst          = 2.55,
  threonine          = 2.06,
  tryptophane        = 0.3,
  calcium            = 0.07,
  phosphore_total    = 0.49,
  sodium             = 0.09,
  chlore             = 0.07
WHERE LOWER(nom) ILIKE '%corn%';

-- Paille de blé (INRA 258)
UPDATE gp_ingredients SET
  matiere_seche      = COALESCE(matiere_seche, 90),
  proteines          = 3.6,
  energie            = 640,
  lipides            = 1.2,
  fibres             = 39.5,
  lysine             = 0.03,
  methionine         = 0.01,
  meth_cyst          = 0.02,
  threonine          = 0.02,
  tryptophane        = 0,
  calcium            = 0.38,
  phosphore_total    = 0.08,
  sodium             = 0.16,
  chlore             = 0.46
WHERE LOWER(nom) ILIKE '%paille de ble%';

-- Mélasse de betterave (INRA 224)
UPDATE gp_ingredients SET
  matiere_seche      = COALESCE(matiere_seche, 75),
  proteines          = 11,
  energie            = 2450,
  lipides            = 0.2,
  fibres             = 0,
  lysine             = 0.17,
  methionine         = 0.02,
  meth_cyst          = 0.1,
  threonine          = 0.07,
  tryptophane        = 0.09,
  calcium            = 0.1,
  phosphore_total    = 0.02,
  sodium             = 0.07
WHERE LOWER(nom) ILIKE '%melasse de betterave%';

-- Tourteau de coton 14-20%CB (INRA 176)
UPDATE gp_ingredients SET
  matiere_seche      = COALESCE(matiere_seche, 90),
  proteines          = 36.3,
  energie            = 2740,
  lipides            = 2.7,
  fibres             = 16.9,
  lysine             = 1.45,
  methionine         = 0.54,
  meth_cyst          = 1.13,
  threonine          = 1.16,
  tryptophane        = 0.47,
  calcium            = 0.24,
  phosphore_total    = 1.14,
  sodium             = 0.08,
  chlore             = 0.05
WHERE LOWER(nom) ILIKE '%tourteau de coton 14%';

-- Maïs
UPDATE gp_ingredients SET
  matiere_seche      = COALESCE(matiere_seche, 88),
  proteines          = 9.6,
  energie            = 3050,
  lipides            = 3.5,
  fibres             = 1.9,
  lysine             = 0.29,
  methionine         = 0.2,
  meth_cyst          = 0.44,
  threonine          = 0.36,
  tryptophane        = 0.06,
  calcium            = 0.02,
  phosphore_total    = 0.25,
  sodium             = 0.01,
  chlore             = 0.05
WHERE LOWER(nom) ILIKE '%mais%';

-- Paille de blé  traitée
UPDATE gp_ingredients SET
  matiere_seche      = COALESCE(matiere_seche, 90),
  proteines          = 3.2,
  energie            = 870,
  lipides            = 0.8,
  fibres             = 36.5,
  lysine             = 0.03,
  methionine         = 0.01,
  meth_cyst          = 0.01,
  threonine          = 0.02,
  tryptophane        = 0,
  calcium            = 0.43,
  phosphore_total    = 0.06,
  sodium             = 0.86,
  chlore             = 0.43
WHERE LOWER(nom) ILIKE '%paille de ble traitee%';

-- concentré ponte Havens
UPDATE gp_ingredients SET
  matiere_seche      = COALESCE(matiere_seche, 99),
  proteines          = 45,
  energie            = 2300,
  lipides            = 0,
  lysine             = 2.95,
  methionine         = 1.9,
  meth_cyst          = 2.5,
  calcium            = 2.75,
  phosphore_total    = 2.5,
  sodium             = 0.01,
  chlore             = 4.47
WHERE LOWER(nom) ILIKE '%concentre ponte havens%';

-- Farine de poisson type 50 %
UPDATE gp_ingredients SET
  matiere_seche      = COALESCE(matiere_seche, 94),
  proteines          = 50,
  energie            = 2900,
  lipides            = 9.2,
  fibres             = 0,
  lysine             = 3.7,
  methionine         = 1.3,
  meth_cyst          = 1.7,
  threonine          = 2.05,
  tryptophane        = 0.5,
  calcium            = 5.54,
  phosphore_total    = 3.1,
  sodium             = 1.12,
  chlore             = 1.63
WHERE LOWER(nom) ILIKE '%farine de poisson type%';

-- Son fin
UPDATE gp_ingredients SET
  matiere_seche      = COALESCE(matiere_seche, 87),
  proteines          = 14.6,
  energie            = 2330,
  lipides            = 4.4,
  fibres             = 10.1,
  lysine             = 0.57,
  methionine         = 0.22,
  meth_cyst          = 0.54,
  threonine          = 0.47,
  tryptophane        = 0.19,
  calcium            = 0.14,
  phosphore_total    = 0.97,
  sodium             = 0.1,
  chlore             = 0.08
WHERE LOWER(nom) ILIKE '%son fin%';

-- Drèche et solubles distillerie (DDGS; INRA 118)
UPDATE gp_ingredients SET
  matiere_seche      = COALESCE(matiere_seche, 90),
  proteines          = 24.6,
  energie            = 2810,
  lipides            = 9,
  fibres             = 8.1,
  lysine             = 0.62,
  methionine         = 0.42,
  meth_cyst          = 0.91,
  threonine          = 0.84,
  tryptophane        = 0.17,
  calcium            = 0.14,
  phosphore_total    = 0.73,
  sodium             = 0.05,
  chlore             = 0.2
WHERE LOWER(nom) ILIKE '%dreche et solubles distillerie%';

-- Mélasse de canne (INRA 226)
UPDATE gp_ingredients SET
  matiere_seche      = COALESCE(matiere_seche, 75),
  proteines          = 4,
  energie            = 2330,
  lipides            = 1.1,
  fibres             = 0,
  lysine             = 0.02,
  methionine         = 0.02,
  meth_cyst          = 0.05,
  threonine          = 0.06,
  tryptophane        = 0.03,
  calcium            = 0.74,
  phosphore_total    = 0.06,
  sodium             = 0.23,
  chlore             = 1.59
WHERE LOWER(nom) ILIKE '%melasse de canne%';

-- Son de riz gras (INRA 138)
UPDATE gp_ingredients SET
  matiere_seche      = COALESCE(matiere_seche, 90.1),
  proteines          = 13.8,
  energie            = 2860,
  lipides            = 16.4,
  fibres             = 7.8,
  lysine             = 0.61,
  methionine         = 0.3,
  meth_cyst          = 0.59,
  threonine          = 0.51,
  tryptophane        = 0.18,
  calcium            = 0.08,
  phosphore_total    = 1.61,
  sodium             = 0.04,
  chlore             = 0.08
WHERE LOWER(nom) ILIKE '%son de riz gras%';

-- Manioc 70 ( INRA 202)
UPDATE gp_ingredients SET
  matiere_seche      = COALESCE(matiere_seche, 88),
  proteines          = 2.5,
  energie            = 3100,
  lipides            = 0.7,
  fibres             = 3.1,
  lysine             = 0.1,
  methionine         = 0.04,
  meth_cyst          = 0.09,
  threonine          = 0.08,
  tryptophane        = 0.02,
  calcium            = 0.2,
  phosphore_total    = 0.1,
  sodium             = 0.03,
  chlore             = 0.07
WHERE LOWER(nom) ILIKE '%manioc 70%';

-- Corn gluten feed (INRA 114)
UPDATE gp_ingredients SET
  matiere_seche      = COALESCE(matiere_seche, 90),
  proteines          = 19.3,
  energie            = 2540,
  lipides            = 4.3,
  fibres             = 7.8,
  lysine             = 0.58,
  methionine         = 0.33,
  meth_cyst          = 0.69,
  threonine          = 0.66,
  tryptophane        = 0.12,
  calcium            = 0.17,
  phosphore_total    = 0.86,
  sodium             = 0.22,
  chlore             = 0.22
WHERE LOWER(nom) ILIKE '%corn%';

-- HAVENS
UPDATE gp_ingredients SET
  matiere_seche      = COALESCE(matiere_seche, 96),
  proteines          = 30,
  fibres             = 5,
  lysine             = 2.8,
  methionine         = 2.4,
  calcium            = 6.5,
  phosphore_total    = 2.4,
  sodium             = 1.4,
  chlore             = 1.8
WHERE LOWER(nom) ILIKE '%havens%';

-- Huile rouge
UPDATE gp_ingredients SET
  matiere_seche      = COALESCE(matiere_seche, 99.5),
  energie            = 8400,
  lipides            = 99,
  fibres             = 0,
  lysine             = 0,
  methionine         = 0,
  meth_cyst          = 0,
  threonine          = 0,
  tryptophane        = 0,
  calcium            = 0,
  phosphore_total    = 0,
  sodium             = 0,
  chlore             = 0
WHERE LOWER(nom) ILIKE '%huile rouge%';

-- Orge (INRA 84)
UPDATE gp_ingredients SET
  matiere_seche      = COALESCE(matiere_seche, 88),
  proteines          = 10.1,
  energie            = 2980,
  lipides            = 2,
  fibres             = 4.6,
  lysine             = 0.38,
  methionine         = 0.17,
  meth_cyst          = 0.4,
  threonine          = 0.34,
  tryptophane        = 0.12,
  calcium            = 0.06,
  phosphore_total    = 0.36,
  sodium             = 0.02,
  chlore             = 0.14
WHERE LOWER(nom) ILIKE '%orge%';

-- Tourteau de soja 44 ("46 Profat" INRA 188)
UPDATE gp_ingredients SET
  matiere_seche      = COALESCE(matiere_seche, 88),
  proteines          = 44,
  energie            = 2770,
  lipides            = 1.8,
  fibres             = 7.7,
  lysine             = 2.68,
  methionine         = 0.62,
  meth_cyst          = 1.28,
  threonine          = 1.72,
  tryptophane        = 0.57,
  calcium            = 0.29,
  phosphore_total    = 0.6,
  sodium             = 0.02,
  chlore             = 0.04
WHERE LOWER(nom) ILIKE '%tourteau de soja 44%';

-- Panicum
UPDATE gp_ingredients SET
  matiere_seche      = COALESCE(matiere_seche, 90),
  proteines          = 12.6,
  energie            = 1600,
  lipides            = 2.3,
  fibres             = 29.7,
  lysine             = 0.53,
  methionine         = 0.16,
  meth_cyst          = 0.35,
  threonine          = 0.5,
  tryptophane        = 0.18,
  calcium            = 0.6,
  phosphore_total    = 0.26,
  sodium             = 0.06,
  chlore             = 0.35
WHERE LOWER(nom) ILIKE '%panicum%';

-- Tourteau de tournesol 32 (INRA 196)
UPDATE gp_ingredients SET
  matiere_seche      = COALESCE(matiere_seche, 89),
  proteines          = 30.6,
  energie            = 2160,
  lipides            = 2.3,
  fibres             = 22.5,
  lysine             = 1.07,
  methionine         = 0.7,
  meth_cyst          = 1.22,
  threonine          = 1.1,
  tryptophane        = 0.37,
  calcium            = 0.3,
  phosphore_total    = 0.95,
  sodium             = 0.03,
  chlore             = 0.15
WHERE LOWER(nom) ILIKE '%tourteau de tournesol 32%';

-- Tourteau d''Acajou
UPDATE gp_ingredients SET
  matiere_seche      = COALESCE(matiere_seche, 89),
  proteines          = 20,
  energie            = 3762,
  lipides            = 8.5,
  fibres             = 5.3,
  lysine             = 6.1,
  methionine         = 0.3,
  meth_cyst          = 1,
  threonine          = 0.72,
  tryptophane        = 1.6,
  calcium            = 0.4,
  phosphore_total    = 0.14,
  sodium             = 9.1,
  chlore             = 0.16
WHERE LOWER(nom) ILIKE '%tourteau d acajou%';

-- Tourteau de palmiste (INRA 182)
UPDATE gp_ingredients SET
  matiere_seche      = COALESCE(matiere_seche, 90),
  proteines          = 14.7,
  energie            = 2390,
  lipides            = 8.4,
  fibres             = 17.9,
  lysine             = 0.4,
  methionine         = 0.26,
  meth_cyst          = 0.43,
  threonine          = 0.44,
  tryptophane        = 0.19,
  calcium            = 0.21,
  phosphore_total    = 0.58,
  sodium             = 0.02,
  chlore             = 0.16
WHERE LOWER(nom) ILIKE '%tourteau de palmiste%';

-- Pois fourrager (INRA 154)
UPDATE gp_ingredients SET
  matiere_seche      = COALESCE(matiere_seche, 86.4),
  proteines          = 20.7,
  energie            = 2920,
  lipides            = 1.2,
  fibres             = 5.2,
  lysine             = 1.51,
  methionine         = 0.21,
  meth_cyst          = 0.48,
  threonine          = 0.79,
  tryptophane        = 0.19,
  calcium            = 0.1,
  phosphore_total    = 0.4,
  sodium             = 0.02,
  chlore             = 0.04
WHERE LOWER(nom) ILIKE '%pois%';

-- Coques de Tournesol
UPDATE gp_ingredients SET
  matiere_seche      = COALESCE(matiere_seche, 90),
  proteines          = 5.4,
  energie            = 1020,
  lipides            = 4,
  fibres             = 46.8,
  lysine             = 0.23,
  methionine         = 0.12,
  meth_cyst          = 0.25,
  threonine          = 0.23,
  tryptophane        = 0.07,
  calcium            = 0.4,
  phosphore_total    = 0.2,
  sodium             = 0.1,
  chlore             = 0.1
WHERE LOWER(nom) ILIKE '%coques de tournesol%';

-- Paille de riz
UPDATE gp_ingredients SET
  matiere_seche      = COALESCE(matiere_seche, 90),
  proteines          = 6,
  energie            = 560,
  lipides            = 0.5,
  fibres             = 29.5,
  lysine             = 0.05,
  methionine         = 0.01,
  meth_cyst          = 0.03,
  threonine          = 0.04,
  tryptophane        = 0.01,
  calcium            = 0.24,
  phosphore_total    = 0.09,
  sodium             = 0.1,
  chlore             = 0.03
WHERE LOWER(nom) ILIKE '%paille de riz%';

-- concentré chair Havens
UPDATE gp_ingredients SET
  matiere_seche      = COALESCE(matiere_seche, 99),
  proteines          = 42,
  energie            = 2200,
  lipides            = 0,
  lysine             = 2.79,
  methionine         = 3,
  meth_cyst          = 3.54,
  calcium            = 3.11,
  phosphore_total    = 3.5,
  sodium             = 0.01,
  chlore             = 4.89
WHERE LOWER(nom) ILIKE '%concentre chair havens%';

-- feuilles de baobab sèche
UPDATE gp_ingredients SET
  matiere_seche      = COALESCE(matiere_seche, 89.6),
  proteines          = 13.1,
  lipides            = 2.2,
  fibres             = 10.4,
  calcium            = 0.02,
  phosphore_total    = 0.23,
  sodium             = 0.2,
  chlore             = 0.5
WHERE LOWER(nom) ILIKE '%feuilles%';

-- Pulpe d''agrumes déshydratée (INRA 230)
UPDATE gp_ingredients SET
  matiere_seche      = COALESCE(matiere_seche, 89),
  proteines          = 6.3,
  energie            = 2650,
  lipides            = 2.2,
  fibres             = 13.1,
  lysine             = 0.26,
  methionine         = 0.08,
  meth_cyst          = 0.16,
  threonine          = 0.2,
  tryptophane        = 0.05,
  calcium            = 1.59,
  phosphore_total    = 0.12,
  sodium             = 0.1,
  chlore             = 0.06
WHERE LOWER(nom) ILIKE '%pulpe d agrumes deshydratee%';

-- Soja torréfié
UPDATE gp_ingredients SET
  matiere_seche      = COALESCE(matiere_seche, 88.1),
  proteines          = 43.6,
  energie            = 3710,
  lipides            = 17.9,
  fibres             = 5.2,
  lysine             = 2.7,
  methionine         = 0.65,
  meth_cyst          = 1.35,
  threonine          = 1.74,
  tryptophane        = 0.57,
  calcium            = 0.31,
  phosphore_total    = 0.56,
  sodium             = 0.08,
  chlore             = 0.04
WHERE LOWER(nom) ILIKE '%soja%';

-- Luzerne déshydratée 15 (INRA 252) "17LP
UPDATE gp_ingredients SET
  matiere_seche      = COALESCE(matiere_seche, 90),
  proteines          = 15.8,
  energie            = 1660,
  lipides            = 3.2,
  fibres             = 26.1,
  lysine             = 0.71,
  methionine         = 0.22,
  meth_cyst          = 0.44,
  threonine          = 0.63,
  tryptophane        = 0.22,
  calcium            = 1.5,
  phosphore_total    = 0.26,
  sodium             = 0.07,
  chlore             = 0.48
WHERE LOWER(nom) ILIKE '%luzerne deshydratee 15 17lp%';


