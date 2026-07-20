import User from "./models/User";

export async function listTenantUsers(tenantId: string) {
  return User.findOne({ tenantId, active: true });
}
