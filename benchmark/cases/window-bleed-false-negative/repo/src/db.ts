export async function listAllInvoices(db: any) {
  return db.invoice.findMany({
    orderBy: { createdAt: "desc" },
  });
}

export async function auditFor(db: any, tenantId: string) {
  return db.auditLog.findMany({ where: { tenantId } });
}
