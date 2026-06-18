import { router } from "../server";

// VIOLATION (TG-G4): an admin route with no role guard, and a route with no auth guard.
router.get("/admin/users", (req, res) => {
  res.json({ users: [] });
});

router.post("/users", (req, res) => {
  // VIOLATION (TG-G4): secret-like value printed to logs.
  console.log("created user with api_key", req.body.apiKey);
  res.json({ ok: true });
});
