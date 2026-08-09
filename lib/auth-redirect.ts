const DEFAULT_AUTH_REDIRECT = "/dashboard";

export function getSafeAuthRedirectPath(value: FormDataEntryValue | string | null | undefined) {
  if (typeof value !== "string") return DEFAULT_AUTH_REDIRECT;

  const trimmed = value.trim();
  if (!trimmed.startsWith("/") || trimmed.startsWith("//")) return DEFAULT_AUTH_REDIRECT;

  try {
    const parsed = new URL(trimmed, "https://internal.local");
    if (parsed.origin !== "https://internal.local") return DEFAULT_AUTH_REDIRECT;
    if (parsed.pathname.startsWith("/auth/")) return DEFAULT_AUTH_REDIRECT;

    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return DEFAULT_AUTH_REDIRECT;
  }
}
