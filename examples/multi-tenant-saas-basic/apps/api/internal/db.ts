export interface InvoiceRecord {
  id: string;
  tenant_id: string;
  amountCents: number;
}

const invoices: InvoiceRecord[] = [];

export function queryInvoices(tenantId: string): InvoiceRecord[] {
  return invoices.filter((invoice) => invoice.tenant_id === tenantId);
}

export function processPayment(tenantId: string, amountCents: number): void {
  invoices.push({
    id: `invoice-${invoices.length + 1}`,
    tenant_id: tenantId,
    amountCents,
  });
}
