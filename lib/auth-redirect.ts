const SAFE_ORIGIN = "https://jumpserve.local";

export function getSafeNextPath(value: string | null) {
  if (!value || !value.startsWith("/") || value.includes("\\")) {
    return "/";
  }

  try {
    const url = new URL(value, SAFE_ORIGIN);

    if (url.origin !== SAFE_ORIGIN) {
      return "/";
    }

    return `${url.pathname}${url.search}`;
  } catch {
    return "/";
  }
}

// Resume the requested action immediately after sign-in, preserving its query.
export function getPostLoginPath(value: string | null) {
  let nextPath = getSafeNextPath(value);
  let url = new URL(nextPath, SAFE_ORIGIN);
  if (url.pathname === "/") {
    nextPath = getSafeNextPath(url.searchParams.get("next"));
    url = new URL(nextPath, SAFE_ORIGIN);
    if (url.pathname === "/") return "/";
  }
  if (url.pathname === "/login" || url.pathname === "/auth/callback") return "/";
  return nextPath;
}
