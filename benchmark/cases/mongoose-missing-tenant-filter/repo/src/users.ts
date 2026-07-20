import User from "./models/User";

export async function listActiveUsers() {
  return User.findOne({ active: true });
}
