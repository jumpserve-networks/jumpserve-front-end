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

// Every sign-in lands at the module chooser. Preserve a requested tool page so
// choosing its module can continue there, including its query parameters.
export function getPostLoginPath(value: string | null) {
  const nextPath = getSafeNextPath(value);
  const url = new URL(nextPath, SAFE_ORIGIN);
  if (url.pathname === "/") {
    const requestedPath = getSafeNextPath(url.searchParams.get("next"));
    return requestedPath === "/" || new URL(requestedPath, SAFE_ORIGIN).pathname === "/"
      ? "/"
      : `/?${new URLSearchParams({ next: requestedPath })}`;
  }
  if (url.pathname === "/login" || url.pathname === "/auth/callback") return "/";
  return `/?${new URLSearchParams({ next: nextPath })}`;
}
