import { describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { detectCoverage } from "../src/detect/signature-packs.js";

function fixture(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), "aker-build-coverage-"));
  for (const [rel, content] of Object.entries(files)) {
    const abs = join(root, rel);
    mkdirSync(join(abs, ".."), { recursive: true });
    writeFileSync(abs, content);
  }
  return root;
}

describe("framework signature-pack coverage", () => {
  it("reports every required pack with deterministic capabilities and counts", () => {
    const files = {
      "src/express.ts": `import express from "express";\napp.get("/users", requireAuth, handler);\n`,
      "src/fastify.ts": `import Fastify from "fastify";\nfastify.get("/users", handler);\n`,
      "app/api/users/route.ts": `export async function GET() { return Response.json([]); }\n`,
      "src/users.controller.ts": `@Controller("users")\n@UseGuards(AuthGuard)\n@Get()\nlist() {}\n`,
      "src/prisma.ts": `prisma.user.findMany({ where: { tenantId } });\n`,
      "src/mongoose.ts": `import User from "./models/User";\nUser.findOne({ tenantId });\n`,
      "api/views.py": `from django.urls import path\nUser.objects.filter(tenant_id=tenant_id)\n`,
      "api/sqlalchemy.py": `from sqlalchemy import select\nsession.query(User).filter(User.tenant_id == tenant_id)\n`,
      "src/generic.ts": `db.user.findMany({ where: { tenantId } });\n`,
      "src/raw.ts": `run("SELECT id FROM users WHERE tenant_id = ?")\n`,
      "README.md": `prisma.user.findMany()\n`,
    };
    const root = fixture(files);

    expect(detectCoverage(root, Object.keys(files))).toEqual({
      source_files_examined: 10,
      packs: [
        { id: "django", capabilities: ["auth", "data_access", "routes"], matched_files: 1 },
        { id: "express", capabilities: ["auth", "routes"], matched_files: 1 },
        { id: "fastify", capabilities: ["auth", "routes"], matched_files: 1 },
        { id: "generic-js-db", capabilities: ["data_access"], matched_files: 1 },
        { id: "mongoose", capabilities: ["data_access"], matched_files: 1 },
        { id: "nestjs", capabilities: ["auth", "routes"], matched_files: 1 },
        { id: "nextjs-app-router", capabilities: ["routes"], matched_files: 1 },
        { id: "prisma", capabilities: ["data_access"], matched_files: 1 },
        { id: "raw-sql", capabilities: ["data_access"], matched_files: 1 },
        { id: "sqlalchemy", capabilities: ["data_access"], matched_files: 1 },
      ],
    });
  });

  it("reports no matched packs instead of fabricating coverage", () => {
    const root = fixture({
      "src/math.ts": `export const add = (a, b) => a + b;\n`,
      "src/comments.ts": `// import express from "express";\n// prisma.user.findMany();\n`,
    });

    expect(detectCoverage(root, ["missing.ts", "src/math.ts", "src/comments.ts", "notes.md"])).toEqual({
      source_files_examined: 2,
      packs: [],
    });
  });
});
