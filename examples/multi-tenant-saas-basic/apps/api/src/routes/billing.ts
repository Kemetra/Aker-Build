import { queryInvoices, processPayment } from "../../internal/db";

type Handler = (req: { params: Record<string, string>; body?: Record<string, unknown> }, res: { json: (value: unknown) => void }) => void;

export const router: { get: (path: string, handler: Handler) => void; post: (path: string, handler: Handler) => void } = {
  get: () => undefined,
  post: () => undefined,
};

router.get("/tenant/:tenant_id/invoices", (req, res) => {
  res.json(queryInvoices(req.params.tenant_id));
});

router.get("/admin/reports", (_req, res) => {
  res.json({ status: "demo-report" });
});

router.post("/webhooks/billing", (req, res) => {
  const tenantId = String(req.body?.tenant_id ?? "demo");
  processPayment(tenantId, 1000);
  res.json({ ok: true });
});
