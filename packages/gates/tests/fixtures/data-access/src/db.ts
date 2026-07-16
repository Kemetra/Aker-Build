export async function listInvoices(db: any) {
  return db.select("SELECT * FROM invoices WHERE status = 'open'");
}

export async function listTenantInvoices(db: any, tenantId: string) {
  return db.select("SELECT * FROM invoices WHERE tenant_id = $1", [tenantId]);
}
