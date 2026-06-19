CREATE TABLE invoices (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  amount_cents INTEGER NOT NULL
);
