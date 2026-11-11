import { toast } from "sonner";
import { useStore } from "@/lib/store";
import { api } from "@/lib/api";
import type { PolicyType } from "@/lib/types";

/**
 * Validate that a URL is a valid Google Docs / Google Drive link.
 */
export function isValidGoogleDocUrl(rawUrl: string): boolean {
  if (!rawUrl || typeof rawUrl !== "string") return false;
  const trimmed = rawUrl.trim();
  if (!trimmed) return false;

  const urlToParse = trimmed.startsWith("http://") || trimmed.startsWith("https://")
    ? trimmed
    : `https://${trimmed}`;

  try {
    const parsed = new URL(urlToParse);
    const host = parsed.hostname.toLowerCase();
    return host.includes("docs.google.com") || host.includes("drive.google.com");
  } catch {
    return false;
  }
}

/**
 * Normalize Google Docs URL to ensure protocol exists.
 */
export function normalizeGoogleDocUrl(rawUrl: string): string {
  const trimmed = rawUrl.trim();
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    return trimmed;
  }
  return `https://${trimmed}`;
}

/**
 * Opens the configured policy document in a new browser tab directly without a modal.
 * Respects the configured source (Uploaded PDF vs Google Docs URL).
 * Enforces authentication token for Member Policy.
 */
export async function openPolicyExternal(type: PolicyType): Promise<void> {
  const store = useStore.getState();
  let policy = store.policies[type];

  // Refresh policies if not loaded yet or document info might be stale
  if (!policy || !policy.hasDocument) {
    try {
      const refreshed = await store.fetchPolicies();
      if (refreshed?.[type]) {
        policy = refreshed[type];
      }
    } catch {
      // Continue with available state
    }
  }

  const defaultTitle = type === "member_policy" ? "Member Policy" : "Privacy Policy";
  const title = policy?.title || defaultTitle;
  const currentUser = store.currentUser;

  // Handle missing or unconfigured document
  if (!policy || !policy.hasDocument) {
    if (currentUser?.role === "admin") {
      toast.error(`No ${title} document is currently configured. Configure it in Settings → Policies & Documents.`);
    } else {
      toast.info(`The ${title} document has not been uploaded yet. Please check back later.`);
    }
    return;
  }

  // 1. Google Docs source
  if (policy.sourceType === "google_doc") {
    const rawUrl = policy.googleDocsUrl?.trim();
    if (!rawUrl) {
      toast.error(`No Google Docs URL is configured for ${title}.`);
      return;
    }

    if (!isValidGoogleDocUrl(rawUrl)) {
      toast.error(`The configured Google Docs URL for ${title} is invalid.`);
      return;
    }

    const targetUrl = normalizeGoogleDocUrl(rawUrl);
    window.open(targetUrl, "_blank", "noopener,noreferrer");
    return;
  }

  // 2. Uploaded Document source (PDF) — fetch with Bearer, never put token in the URL
  const token = typeof window !== "undefined" ? localStorage.getItem("clubapp_token") : null;

  if (type === "member_policy" && !token && !currentUser) {
    toast.error("Unauthorized. Please sign in to view the Member Policy.");
    return;
  }

  try {
    const objectUrl = await api.fetchPolicyBlobUrl(type, "preview");
    window.open(objectUrl, "_blank", "noopener,noreferrer");
  } catch {
    toast.error(`Unable to open ${title}. Please sign in and try again.`);
  }
}
