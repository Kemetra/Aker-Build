import { queryInvoices } from "../../api/internal/db";

export function Dashboard({ tenantId }: { tenantId: string }) {
  const invoices = queryInvoices(tenantId);
  return `Invoices: ${invoices.length}`;
}
