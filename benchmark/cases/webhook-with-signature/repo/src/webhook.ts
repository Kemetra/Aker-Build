import { verifySignature } from "./crypto.js";

export function registerRoutes(app: any) {
  app.post("/webhook/stripe", async (req: any, res: any) => {
    verifySignature(req);
    await handleEvent(req.body);
    res.sendStatus(200);
  });
}

async function handleEvent(event: unknown) {
  return event;
}
