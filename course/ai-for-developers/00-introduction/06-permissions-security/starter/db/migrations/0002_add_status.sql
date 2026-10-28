-- 0002_add_status.sql
ALTER TABLE invoices ADD COLUMN status TEXT NOT NULL DEFAULT 'draft';
