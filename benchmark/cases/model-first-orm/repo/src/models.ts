import { User } from "./schema";

export async function findUserByEmail(email: string) {
  return User.findOne({ email });
}
