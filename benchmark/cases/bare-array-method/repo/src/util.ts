export function activeUsers(users: { active: boolean }[]) {
  return users.find((u) => u.active);
}

export function evict(cache: Map<string, string>, key: string) {
  return cache.delete(key);
}
