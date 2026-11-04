-- Migration 027: Allow 'rented' status in motorcycles check constraint
ALTER TABLE motorcycles DROP CONSTRAINT IF EXISTS chk_motorcycles_status;
ALTER TABLE motorcycles ADD CONSTRAINT chk_motorcycles_status 
  CHECK (status IN ('active', 'maintenance', 'inactive', 'rented'));
