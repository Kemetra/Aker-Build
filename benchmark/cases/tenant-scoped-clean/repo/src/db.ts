export async function listInvoices(db: any, tenantId: string) {
  return db.select("SELECT * FROM invoices WHERE tenant_id = $1", [tenantId]);
}
