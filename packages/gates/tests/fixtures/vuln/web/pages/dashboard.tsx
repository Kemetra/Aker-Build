// VIOLATION (TG-G1): a frontend page importing backend internals directly.
import { db } from "../../apps/api/db/database";

export function Dashboard() {
  const rows = db.query("select * from tenants");
  return rows;
}
