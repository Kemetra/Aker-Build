export async function listInvoices(db: any) {
  return db.select("SELECT * FROM invoices WHERE status = 'open'");
}

// The scoped variant lives far enough below that it cannot fall inside the
// unscoped query's statement window (W3a: match line + 5 lines).

export async function listTenantInvoices(db: any, tenantId: string) {
  return db.select("SELECT * FROM invoices WHERE tenant_id = $1", [tenantId]);
}
