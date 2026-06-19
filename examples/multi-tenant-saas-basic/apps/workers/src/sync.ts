type Handler = () => void;

const router: { post: (path: string, handler: Handler) => void } = {
  post: () => undefined,
};

router.post("/sync", () => {
  // Demo-only worker route; TenantGuard should flag this boundary issue.
});
