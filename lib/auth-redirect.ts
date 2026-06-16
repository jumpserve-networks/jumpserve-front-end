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
