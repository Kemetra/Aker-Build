import { Router } from "express";
import { requireAuth } from "./middleware.js";

const router = Router();
router.use(requireAuth);

router.get("/invoices", async (req: any, res: any) => {
  res.json({ ok: true });
});

export default router;
