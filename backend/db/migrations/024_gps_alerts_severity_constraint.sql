-- Migrasi 024: Penyesuaian Check Constraint Severity gps_alerts (info, warning, high)
-- Sesuai spesifikasi PRD GPS: severity (info | warning | high)

ALTER TABLE gps_alerts DROP CONSTRAINT IF EXISTS gps_alerts_severity_check;

ALTER TABLE gps_alerts ADD CONSTRAINT gps_alerts_severity_check
  CHECK (severity IN ('info', 'warning', 'high', 'low', 'medium', 'critical'));
