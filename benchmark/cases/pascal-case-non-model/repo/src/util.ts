export const first = (xs: any[]) => Array.find(xs);
export const pick = (k: string) => Object.select(k);
export const lookup = (id: string) => Registry.find(id);
export const cached = (key: string) => Cache.find(key);
export const route = (path: string) => Router.find(path);
