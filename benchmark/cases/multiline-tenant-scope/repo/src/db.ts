export async function listInvoices(prisma: any, tenantId: string) {
  return prisma.invoice.findMany({
    where: { tenantId },
  });
}
