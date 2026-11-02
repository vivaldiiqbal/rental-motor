-- Migrasi 010: Mengizinkan peran 'staff' pada tabel users untuk RBAC Admin & Operasional
ALTER TABLE users DROP CONSTRAINT IF EXISTS chk_users_role;
ALTER TABLE users ADD CONSTRAINT chk_users_role CHECK (role IN ('customer', 'admin', 'staff'));
