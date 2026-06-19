import { router as billingRouter } from "./routes/billing";

export const app = {
  use: (_path: string, _router: typeof billingRouter) => undefined,
};

app.use("/billing", billingRouter);
