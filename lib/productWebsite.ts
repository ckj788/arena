import { publicHttpUrl } from "./site";

export function normalizeProductWebsite(value: string) {
  const raw = value.trim();
  if (!raw || (/^[a-z][a-z\d+.-]*:\/\//i.test(raw) && !/^https?:\/\//i.test(raw))) return undefined;
  return publicHttpUrl(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
}
