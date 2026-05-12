-- ══════════════════════════════════════════════════
-- MIGRATION : Suivi des communications client (reçu, WA, SMS)
-- Date : 2026-05-12
-- À exécuter dans Supabase SQL Editor
-- ══════════════════════════════════════════════════

ALTER TABLE gp_ventes
  ADD COLUMN IF NOT EXISTS recu_imprime    boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS recu_imprime_at timestamptz,
  ADD COLUMN IF NOT EXISTS wa_envoye       boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS wa_envoye_at    timestamptz,
  ADD COLUMN IF NOT EXISTS sms_envoye      boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS sms_envoye_at   timestamptz;

CREATE INDEX IF NOT EXISTS idx_ventes_communications
  ON gp_ventes(admin_id, date, recu_imprime, wa_envoye, sms_envoye);
