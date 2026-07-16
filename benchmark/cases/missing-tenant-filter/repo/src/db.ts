export async function listAllInvoices(db: any) {
  return db.select("SELECT * FROM invoices WHERE status = 'open'");
}
