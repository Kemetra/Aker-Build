type Handler = () => void;

const router: { post: (path: string, handler: Handler) => void } = {
  post: () => undefined,
};

router.post("/sync", () => {
  // Demo-only worker route; Aker Build should flag this boundary issue.
});
