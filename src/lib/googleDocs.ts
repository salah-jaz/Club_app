/**
 * Convert a Google Docs URL (edit / preview / pub / share link) into the
 * mobilebasic HTML view, which embeds cleanly in an iframe without the
 * black page-canvas chrome used by /preview.
 */
export function toGoogleDocsEmbedUrl(url: string): string {
  try {
    const parsed = new URL(url);
    if (!parsed.hostname.includes("docs.google.com")) {
      return url;
    }

    const match = parsed.pathname.match(/\/document\/d\/([^/]+)/);
    if (!match?.[1]) {
      return url;
    }

    return `https://docs.google.com/document/d/${match[1]}/mobilebasic`;
  } catch {
    return url;
  }
}
