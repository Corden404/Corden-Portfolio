/** Resolve public resources and page links under the configured site path. */
export function assetUrl(path: string) {
  return import.meta.env.BASE_URL + path.replace(/^\/+/, '');
}
