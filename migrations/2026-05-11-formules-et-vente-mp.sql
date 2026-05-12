-- ══════════════════════════════════════════════════
-- MIGRATION : Formules dynamiques + Vente de MP
-- Date : 2026-05-11
-- À exécuter dans Supabase SQL Editor
-- ══════════════════════════════════════════════════

-- ─────────────────────────────────────────────────
-- 1. Étendre gp_formules pour stocker la composition complète
-- ─────────────────────────────────────────────────
-- (Si la table n'existe pas : on la crée. Si elle existe : on ajoute les colonnes manquantes.)

CREATE TABLE IF NOT EXISTS gp_formules (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id     uuid NOT NULL,
  nom          text NOT NULL,
  created_at   timestamptz DEFAULT now()
);

ALTER TABLE gp_formules
  ADD COLUMN IF NOT EXISTS espece              text,
  ADD COLUMN IF NOT EXISTS stade               text,
  ADD COLUMN IF NOT EXISTS prix_defaut         numeric(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ingredients         jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS cout_emballage_kg   numeric(10,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cout_mo_tonne       numeric(10,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cout_transport_lot  numeric(10,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS avec_emballage      boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS avec_transport      boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS actif               boolean DEFAULT true;

-- Unicité du nom par admin (utile pour upsert/évite doublons)
CREATE UNIQUE INDEX IF NOT EXISTS idx_formules_admin_nom
  ON gp_formules(admin_id, nom);

CREATE INDEX IF NOT EXISTS idx_formules_actif
  ON gp_formules(admin_id, actif);

-- ─────────────────────────────────────────────────
-- 2. Étendre gp_ventes_lignes pour distinguer formule vs MP
-- ─────────────────────────────────────────────────
ALTER TABLE gp_ventes_lignes
  ADD COLUMN IF NOT EXISTS type_produit  text DEFAULT 'formule',  -- 'formule' ou 'mp'
  ADD COLUMN IF NOT EXISTS ingredient_id uuid;

-- ─────────────────────────────────────────────────
-- 3. Étendre gp_distribution_livraisons pour livrer aussi des MP
-- (On suppose que la table existe — si le nom diffère, adapter)
-- ─────────────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'gp_distribution_livraisons') THEN
    ALTER TABLE gp_distribution_livraisons
      ADD COLUMN IF NOT EXISTS type_produit  text DEFAULT 'formule',
      ADD COLUMN IF NOT EXISTS ingredient_id uuid;
  END IF;
END$$;

-- ─────────────────────────────────────────────────
-- 4. RLS pour gp_formules
-- ─────────────────────────────────────────────────
ALTER TABLE gp_formules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS formules_select ON gp_formules;
CREATE POLICY formules_select ON gp_formules
  FOR SELECT USING (
    admin_id = auth.uid()
    OR EXISTS (SELECT 1 FROM gp_membres WHERE user_id = auth.uid() AND admin_id = gp_formules.admin_id)
  );

DROP POLICY IF EXISTS formules_modify ON gp_formules;
CREATE POLICY formules_modify ON gp_formules
  FOR ALL USING (admin_id = auth.uid())
  WITH CHECK (admin_id = auth.uid());
