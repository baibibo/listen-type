/** Resolve asset URLs relative to this page, so the site works on a GitHub Pages subpath. */
export function baseUrl() {
  const loc = window.location;
  let path = loc.pathname || "/";
  if (!path.endsWith("/")) {
    const last = path.slice(path.lastIndexOf("/") + 1);
    if (last.includes(".")) {
      path = path.slice(0, path.lastIndexOf("/") + 1);
    } else {
      path += "/";
    }
  }
  return new URL(path, loc.origin);
}

export function assetUrl(rel) {
  const clean = String(rel || "").replace(/^\.\//, "").replace(/^\//, "");
  return new URL(clean, baseUrl()).href;
}
