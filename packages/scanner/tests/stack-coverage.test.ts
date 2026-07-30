import { describe, it, expect } from "vitest";
import { partitionCoverage } from "../src/detect/stack.js";

describe("partitionCoverage", () => {
  it("splits detected frameworks into covered and uncovered", () => {
    expect(partitionCoverage(["express", "nextjs", "react"])).toEqual({
      covered: ["express"],
      uncovered: ["nextjs", "react"],
    });
  });

  it("returns empty lists when no frameworks were detected", () => {
    expect(partitionCoverage([])).toEqual({ covered: [], uncovered: [] });
  });

  it("reports everything uncovered when no detected framework is supported", () => {
    expect(partitionCoverage(["vue", "svelte"])).toEqual({
      covered: [],
      uncovered: ["svelte", "vue"],
    });
  });

  it("counts ORMs as covered — the flagship detector keys on ORM idioms", () => {
    // A coverage field blind to ORMs cannot answer the question it exists to answer: whether the
    // repo's queries were understood.
    expect(partitionCoverage(["prisma", "mongoose", "knex", "sequelize", "typeorm", "drizzle"]))
      .toEqual({
        covered: ["drizzle", "knex", "mongoose", "prisma", "sequelize", "typeorm"],
        uncovered: [],
      });
  });

  it("reports frameworks that are detected but not understood as uncovered", () => {
    // Next.js route handlers and NestJS decorators are not matched by ROUTE_DEF.
    expect(partitionCoverage(["nextjs", "nestjs", "prisma"])).toEqual({
      covered: ["prisma"],
      uncovered: ["nestjs", "nextjs"],
    });
  });
});
