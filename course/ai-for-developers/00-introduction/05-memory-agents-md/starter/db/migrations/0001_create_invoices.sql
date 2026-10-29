-- 0001_create_invoices.sql
CREATE TABLE invoices (
    id INTEGER PRIMARY KEY,
    customer TEXT NOT NULL,
    amount_cents INTEGER NOT NULL,
    currency TEXT NOT NULL,
    issued_on TEXT NOT NULL
);
