import { router } from "../server";
import { requireAuth, requireRole } from "../middleware/auth";

// CLEAN: every route carries an auth guard; the admin route carries a role guard.
router.get("/users", requireAuth, (req, res) => {
  res.json({ users: [] });
});

router.get("/admin/settings", requireAuth, requireRole("admin"), (req, res) => {
  res.json({ settings: {} });
});
