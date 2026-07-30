import { requireRole } from "./middleware";

export function registerRoutes(app: any) {
  app.get("/admin/reports", requireRole("admin"), async (req: any, res: any) => {
    res.json({ ok: true });
  });
}
