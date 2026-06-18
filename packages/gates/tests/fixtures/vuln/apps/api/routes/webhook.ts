import { router } from "../server";

// VIOLATION (TG-G5): webhook handler with no signature/idempotency tracking.
// (also TG-G4: route without auth guard)
router.post("/webhook/stripe", (req, res) => {
  const event = req.body;
  processPayment(event);
  res.json({ received: true });
});

function processPayment(event: unknown): void {
  void event;
}
