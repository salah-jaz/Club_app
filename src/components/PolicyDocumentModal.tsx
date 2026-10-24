import { useEffect, useState, useMemo } from "react";
import {
  FileText,
  Download,
  ExternalLink,
  FileQuestion,
  Loader2,
  ShieldCheck,
  Link2,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useStore } from "@/lib/store";
import { api } from "@/lib/api";
import { openPolicyExternal } from "@/lib/policies";
import type { PolicyType } from "@/lib/types";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  type: PolicyType;
  title: string;
  subtitle?: string;
}

export function PolicyDocumentModal({
  open,
  onOpenChange,
  type,
  title,
  subtitle,
}: Props) {
  const policy = useStore((s) => s.policies[type]);
  const fetchPolicies = useStore((s) => s.fetchPolicies);
  const currentUser = useStore((s) => s.currentUser);

  const [downloading, setDownloading] = useState(false);
  const [iframeLoading, setIframeLoading] = useState(true);

  // Always refresh policy metadata when modal opens to ensure latest version is shown
  useEffect(() => {
    if (open) {
      setIframeLoading(true);
      fetchPolicies();
    }
  }, [open, fetchPolicies]);

  const isGoogleDoc = policy?.sourceType === "google_doc";
  const hasDocument = Boolean(policy?.hasDocument);
  const hasFile = Boolean(policy?.hasFile || (!isGoogleDoc && hasDocument));
  const hasGoogleDoc = Boolean(policy?.hasGoogleDoc || (isGoogleDoc && policy?.googleDocsUrl));

  // Compute URLs with cache busting query param and auth token if applicable
  const { previewUrl, downloadUrl } = useMemo(() => {
    if (!hasFile) return { previewUrl: null, downloadUrl: null };

    const preview = api.getPolicyUrl(type, "preview");
    const download = api.getPolicyUrl(type, "download");
    const version = policy?.updatedAt ? new Date(policy.updatedAt).getTime() : Date.now();
    const delimP = preview.includes("?") ? "&" : "?";
    const delimD = download.includes("?") ? "&" : "?";

    return {
      previewUrl: `${preview}${delimP}v=${version}`,
      downloadUrl: `${download}${delimD}v=${version}`,
    };
  }, [hasFile, type, policy?.updatedAt]);

  const handleDownload = async () => {
    if (!downloadUrl) return;
    setDownloading(true);
    try {
      const token = typeof window !== "undefined" ? localStorage.getItem("clubapp_token") : null;
      const headers: Record<string, string> = {};
      if (token && type === "member_policy") {
        headers["Authorization"] = `Bearer ${token}`;
      }

      const res = await fetch(downloadUrl, { headers });
      if (!res.ok) {
        throw new Error("Failed to download document");
      }
      const blob = await res.blob();
      const objectUrl = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = objectUrl;
      a.download = policy?.fileName || `${title.replace(/\s+/g, "_")}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(objectUrl);
      document.body.removeChild(a);
      toast.success("Download started");
    } catch (err: any) {
      toast.error(err.message || "Unable to download the document. Please try again.");
    } finally {
      setDownloading(false);
    }
  };

  const Icon = type === "privacy_policy" ? ShieldCheck : FileText;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-card border-border text-card-foreground w-[calc(100%-1rem)] sm:max-w-5xl h-[90dvh] max-h-[90dvh] p-0 gap-0 overflow-hidden flex flex-col overscroll-contain shadow-2xl">
        <DialogHeader className="px-4 sm:px-6 py-3.5 border-b border-border shrink-0 flex flex-row items-center justify-between text-left pr-12">
          <div className="min-w-0 pr-3">
            <DialogTitle className="flex items-center gap-2 text-foreground text-base sm:text-lg font-semibold truncate">
              <Icon className="size-5 text-primary shrink-0" />
              <span>{policy?.title || title}</span>
              {hasDocument && (
                <span className="hidden sm:inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-primary/10 text-primary border border-primary/20">
                  {isGoogleDoc ? "Google Doc" : "PDF"}
                </span>
              )}
            </DialogTitle>
            <DialogDescription className="text-muted-foreground text-xs sm:text-sm truncate mt-0.5">
              {isGoogleDoc && hasGoogleDoc ? (
                <span className="truncate block font-mono text-[11px]">
                  {policy?.googleDocsUrl}
                </span>
              ) : hasFile && policy?.fileName ? (
                <span>
                  {policy.fileName}
                  {policy.formattedSize ? ` • ${policy.formattedSize}` : ""}
                  {policy.updatedAt
                    ? ` • Updated ${new Date(policy.updatedAt).toLocaleDateString()}`
                    : ""}
                </span>
              ) : (
                subtitle || `Official ${title} for AeroShuttle Badminton Club`
              )}
            </DialogDescription>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {hasFile && downloadUrl && (
              <Button
                type="button"
                size="sm"
                onClick={handleDownload}
                disabled={downloading}
                className="h-8 px-3 text-xs btn-premium-solid cursor-pointer"
              >
                {downloading ? (
                  <Loader2 className="size-3.5 animate-spin mr-1.5" />
                ) : (
                  <Download className="size-3.5 mr-1.5" />
                )}
                <span className="hidden sm:inline">Download</span>
              </Button>
            )}

            {hasDocument && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => openPolicyExternal(type)}
                className="h-8 px-2.5 text-xs btn-premium-outline cursor-pointer flex items-center gap-1.5"
                title="Open in new window"
              >
                <ExternalLink className="size-3.5 text-primary" />
                <span className="hidden sm:inline">External Link</span>
              </Button>
            )}
          </div>
        </DialogHeader>

        <div className="flex-1 min-h-0 bg-background relative overflow-hidden flex flex-col">
          {/* View Mode 1: Google Docs external presentation */}
          {isGoogleDoc && hasGoogleDoc ? (
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center max-w-lg mx-auto my-auto">
              <div className="w-16 h-16 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center mb-5 text-primary">
                <Link2 className="size-8" />
              </div>
              <h3 className="text-lg font-semibold text-foreground mb-2">
                Google Docs Document
              </h3>
              <p className="text-xs text-muted-foreground leading-relaxed mb-4">
                This document is managed in Google Docs. Click below to view the latest live version directly in a new tab.
              </p>
              <div className="w-full max-w-md p-3 rounded-lg bg-muted/40 border border-border text-left mb-6 font-mono text-xs text-muted-foreground truncate">
                {policy?.googleDocsUrl}
              </div>
              <Button
                type="button"
                size="sm"
                onClick={() => openPolicyExternal(type)}
                className="btn-premium-solid text-xs h-10 px-5 cursor-pointer flex items-center gap-2"
              >
                <ExternalLink className="size-4" />
                Open Google Document
              </Button>
            </div>
          ) : !isGoogleDoc && hasFile && previewUrl ? (
            /* View Mode 2: Uploaded PDF embedded iframe */
            <>
              {iframeLoading && (
                <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-background/90 text-muted-foreground gap-2">
                  <Loader2 className="size-6 animate-spin text-primary" />
                  <p className="text-xs">Loading document...</p>
                </div>
              )}
              <iframe
                title={policy?.title || title}
                src={`${previewUrl}#toolbar=1&navpanes=0`}
                onLoad={() => setIframeLoading(false)}
                className="w-full h-full border-0 bg-background"
              />
            </>
          ) : (
            /* Empty state */
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center max-w-md mx-auto my-auto">
              <div className="w-14 h-14 rounded-full bg-muted/60 border border-border flex items-center justify-center mb-4 text-muted-foreground">
                <FileQuestion className="size-7" />
              </div>
              <h3 className="text-base font-medium text-foreground mb-1.5">
                No Document Configured Yet
              </h3>
              <p className="text-xs text-muted-foreground leading-relaxed mb-6">
                The club administrator has not yet configured the {title.toLowerCase()}.
                Please check back soon or contact the club administrator.
              </p>
              {currentUser?.role === "admin" && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    onOpenChange(false);
                    if (window.location.pathname !== "/settings") {
                      window.location.href = "/settings";
                    }
                  }}
                  className="text-xs btn-premium-outline cursor-pointer"
                >
                  Go to Settings to Configure
                </Button>
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
