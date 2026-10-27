import { useRef, useState, useEffect } from "react";
import {
  FileText,
  Upload,
  Download,
  Eye,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  Loader2,
  ShieldCheck,
  FileCheck,
  Trash2,
  AlertTriangle,
  ExternalLink,
  Link2,
  Check,
} from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useStore } from "@/lib/store";
import { api } from "@/lib/api";
import { PolicyDocumentModal } from "./PolicyDocumentModal";
import { openPolicyExternal, isValidGoogleDocUrl, normalizeGoogleDocUrl } from "@/lib/policies";
import type { PolicyType, PolicySourceType } from "@/lib/types";
import { toast } from "sonner";

interface PolicyCardProps {
  type: PolicyType;
  title: string;
  description: string;
}

export function PolicyCard({ type, title, description }: PolicyCardProps) {
  const policy = useStore((s) => s.policies[type]);
  const uploadPolicy = useStore((s) => s.uploadPolicy);
  const updatePolicySource = useStore((s) => s.updatePolicySource);
  const deletePolicy = useStore((s) => s.deletePolicy);

  // Active source mode
  const currentSource: PolicySourceType = policy?.sourceType || "upload";
  const [selectedSource, setSelectedSource] = useState<PolicySourceType>(currentSource);

  // Sync selected tab whenever server state changes
  useEffect(() => {
    if (policy?.sourceType) {
      setSelectedSource(policy.sourceType);
    }
  }, [policy?.sourceType]);

  // Google Docs URL input state
  const [googleDocsUrlInput, setGoogleDocsUrlInput] = useState(policy?.googleDocsUrl || "");
  const [isSavingUrl, setIsSavingUrl] = useState(false);

  useEffect(() => {
    if (policy?.googleDocsUrl !== undefined) {
      setGoogleDocsUrlInput(policy.googleDocsUrl || "");
    }
  }, [policy?.googleDocsUrl]);

  // Upload state
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const hasDocument = Boolean(policy?.hasDocument);
  const hasFile = Boolean(policy?.hasFile || (policy?.sourceType === "upload" && policy?.hasDocument));
  const hasGoogleDoc = Boolean(policy?.hasGoogleDoc || (policy?.sourceType === "google_doc" && policy?.hasDocument));
  const Icon = type === "privacy_policy" ? ShieldCheck : FileText;

  // Handle switching source selector
  const handleSourceSelect = async (newSource: PolicySourceType) => {
    if (newSource === selectedSource) return;
    setErrorMessage(null);
    setSelectedSource(newSource);

    // If switching to upload and a file already exists, persist immediately
    if (newSource === "upload") {
      try {
        await updatePolicySource(type, { sourceType: "upload" });
        toast.success(`Switched ${title} source to Upload Document`);
      } catch (err: any) {
        console.error("Failed to switch source:", err);
      }
    } else if (newSource === "google_doc" && policy?.googleDocsUrl) {
      // If switching to Google Doc and a URL was already saved, persist immediately
      try {
        await updatePolicySource(type, {
          sourceType: "google_doc",
          googleDocsUrl: policy.googleDocsUrl,
        });
        toast.success(`Switched ${title} source to Google Docs URL`);
      } catch (err: any) {
        console.error("Failed to switch source:", err);
      }
    }
  };

  // Save Google Docs URL
  const handleSaveGoogleDocsUrl = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const trimmed = googleDocsUrlInput.trim();

    if (!trimmed) {
      const err = "Please enter a Google Docs URL.";
      setErrorMessage(err);
      toast.error(err);
      return;
    }

    if (!isValidGoogleDocUrl(trimmed)) {
      const err = "Please enter a valid Google Docs document URL (e.g. docs.google.com/document/d/...).";
      setErrorMessage(err);
      toast.error(err);
      return;
    }

    setErrorMessage(null);
    setIsSavingUrl(true);

    try {
      const normalizedUrl = normalizeGoogleDocUrl(trimmed);
      await updatePolicySource(type, {
        sourceType: "google_doc",
        googleDocsUrl: normalizedUrl,
        title,
      });
      toast.success(`${title} Google Docs URL saved successfully`);
    } catch (err: any) {
      const msg = err.message || `Failed to save ${title} URL. Please try again.`;
      setErrorMessage(msg);
      toast.error(msg);
    } finally {
      setIsSavingUrl(false);
    }
  };

  // Upload PDF file
  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }

    if (!file) return;

    // Frontend validation
    const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
    if (!isPdf) {
      const err = "Only PDF documents (.pdf) are allowed.";
      setErrorMessage(err);
      toast.error(err);
      return;
    }

    // 10 MB limit
    const maxBytes = 10 * 1024 * 1024;
    if (file.size > maxBytes) {
      const err = "The selected file exceeds the 10 MB size limit.";
      setErrorMessage(err);
      toast.error(err);
      return;
    }

    setErrorMessage(null);
    setIsUploading(true);
    setUploadProgress(20);

    const progressTimer = setInterval(() => {
      setUploadProgress((prev) => (prev < 85 ? prev + 15 : prev));
    }, 150);

    try {
      await uploadPolicy(type, file, title);
      setSelectedSource("upload");
      setUploadProgress(100);
      toast.success(`${title} document uploaded successfully`);
    } catch (err: any) {
      const msg = err.message || `Failed to upload ${title}. Please try again.`;
      setErrorMessage(msg);
      toast.error(msg);
    } finally {
      clearInterval(progressTimer);
      setTimeout(() => {
        setIsUploading(false);
        setUploadProgress(0);
      }, 400);
    }
  };

  // Download PDF
  const handleDownload = async () => {
    if (!hasFile) return;
    setIsDownloading(true);
    try {
      const downloadUrl = api.getPolicyUrl(type, "download");
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
      toast.error(err.message || "Failed to download document.");
    } finally {
      setIsDownloading(false);
    }
  };

  // External Link action
  const handleExternalLink = async () => {
    await openPolicyExternal(type);
  };

  // Delete policy
  const handleDelete = async (e?: React.MouseEvent) => {
    if (e) e.preventDefault();
    if (isDeleting) return;

    setIsDeleting(true);
    setErrorMessage(null);

    try {
      await deletePolicy(type);
      setGoogleDocsUrlInput("");
      toast.success(`${title} removed successfully`);
      setDeleteDialogOpen(false);
    } catch (err: any) {
      const msg = err.message || `Failed to delete ${title}. Please try again.`;
      setErrorMessage(msg);
      toast.error(msg);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <>
      <Card className="bg-card text-card-foreground border-border signature-card-top flex flex-col justify-between shadow-sm min-w-0 w-full max-w-full overflow-hidden">
        <CardHeader className="p-4 sm:p-6 pb-3 sm:pb-3 border-b border-border/60 min-w-0">
          <div className="flex flex-col xs:flex-row sm:flex-row sm:items-center justify-between gap-2 min-w-0">
            <CardTitle className="text-xs font-semibold tracking-[0.12em] text-primary uppercase flex items-center gap-2 min-w-0">
              <Icon className="size-4 text-primary shrink-0" />
              <span className="truncate">{title}</span>
            </CardTitle>

            <div className="flex items-center gap-1.5 shrink-0 flex-wrap">
              {hasDocument ? (
                <>
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-medium bg-primary/10 text-primary border border-primary/20 shrink-0">
                    <CheckCircle2 className="size-3" />
                    Active
                  </span>
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-muted text-muted-foreground border border-border shrink-0">
                    {policy?.sourceType === "google_doc" ? "Google Doc" : "PDF"}
                  </span>
                </>
              ) : (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-medium bg-muted text-muted-foreground border border-border shrink-0">
                  Not Configured
                </span>
              )}
            </div>
          </div>
          <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{description}</p>

          {/* Source Selector Control */}
          <div className="pt-3 min-w-0 w-full">
            <div className="flex items-center p-1 rounded-lg bg-muted/60 border border-border/70 text-xs min-w-0 w-full">
              <button
                type="button"
                onClick={() => handleSourceSelect("upload")}
                className={`flex-1 min-w-0 flex items-center justify-center gap-1.5 py-1.5 px-2 sm:px-3 rounded-md font-medium transition-all cursor-pointer ${
                  selectedSource === "upload"
                    ? "bg-background text-foreground shadow-sm border border-border/80"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Upload className="size-3.5 shrink-0" />
                <span className="truncate">Upload Document</span>
                {hasFile && <span className="size-1.5 rounded-full bg-primary shrink-0 ml-0.5" />}
              </button>

              <button
                type="button"
                onClick={() => handleSourceSelect("google_doc")}
                className={`flex-1 min-w-0 flex items-center justify-center gap-1.5 py-1.5 px-2 sm:px-3 rounded-md font-medium transition-all cursor-pointer ${
                  selectedSource === "google_doc"
                    ? "bg-background text-foreground shadow-sm border border-border/80"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Link2 className="size-3.5 shrink-0" />
                <span className="truncate">Google Docs URL</span>
                {hasGoogleDoc && <span className="size-1.5 rounded-full bg-primary shrink-0 ml-0.5" />}
              </button>
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-4 sm:p-6 pt-4 sm:pt-4 flex-1 flex flex-col justify-between space-y-4 min-w-0 w-full">
          {/* Validation error display */}
          {errorMessage && (
            <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20 flex items-start gap-2.5 text-xs text-destructive">
              <AlertCircle className="size-4 shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="font-medium">Notice</p>
                <p className="opacity-90">{errorMessage}</p>
              </div>
            </div>
          )}

          {/* ================= OPTION 1: UPLOAD DOCUMENT ================= */}
          {selectedSource === "upload" && (
            <div className="space-y-4">
              {/* Hidden File Input */}
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,application/pdf"
                className="hidden"
                onChange={handleFileSelect}
                disabled={isUploading || isDeleting}
              />

              {/* Upload Progress Bar */}
              {isUploading && (
                <div className="space-y-1.5 p-3 rounded-lg bg-primary/5 border border-primary/20">
                  <div className="flex items-center justify-between text-xs text-primary">
                    <span className="flex items-center gap-1.5">
                      <Loader2 className="size-3.5 animate-spin text-primary" />
                      {hasFile ? "Replacing document..." : "Uploading document..."}
                    </span>
                    <span className="font-mono">{uploadProgress}%</span>
                  </div>
                  <div className="w-full bg-muted h-1.5 rounded-full overflow-hidden">
                    <div
                      className="bg-primary h-full transition-all duration-200 rounded-full"
                      style={{ width: `${uploadProgress}%` }}
                    />
                  </div>
                </div>
              )}

              {/* Document Info or Upload Placeholder */}
              {hasFile ? (
                <div className="p-4 rounded-lg bg-muted/40 border border-border flex items-start gap-3">
                  <div className="w-10 h-10 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0 text-primary">
                    <FileCheck className="size-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-foreground truncate" title={policy?.fileName || ""}>
                      {policy?.fileName || `${title}.pdf`}
                    </p>
                    <div className="flex flex-wrap items-center gap-2 mt-1 text-[11px] text-muted-foreground">
                      {policy?.formattedSize && <span>{policy.formattedSize}</span>}
                      {policy?.formattedSize && policy?.updatedAt && <span>•</span>}
                      {policy?.updatedAt && (
                        <span>Updated {new Date(policy.updatedAt).toLocaleDateString()}</span>
                      )}
                    </div>
                  </div>
                </div>
              ) : (
                <div
                  onClick={() => !isUploading && fileInputRef.current?.click()}
                  className="border border-dashed border-border hover:border-primary/50 rounded-lg p-6 text-center cursor-pointer transition-colors bg-muted/20 hover:bg-muted/40 flex flex-col items-center justify-center min-h-[110px]"
                >
                  <Upload className="size-6 text-muted-foreground mb-2" />
                  <p className="text-xs font-medium text-foreground">No PDF uploaded yet</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    Click to browse or drop your PDF here (max 10 MB)
                  </p>
                </div>
              )}

              {/* Action Buttons for Upload Document */}
              <div className="pt-2 min-w-0 w-full">
                {hasFile ? (
                  <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-2 min-w-0 w-full">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handleExternalLink}
                      disabled={isUploading || isDeleting}
                      className="btn-premium-outline text-xs h-9 cursor-pointer w-full sm:w-auto sm:flex-1 min-w-0 truncate justify-center"
                      title="Open PDF directly in a new browser tab"
                    >
                      <ExternalLink className="size-3.5 mr-1.5 text-primary shrink-0" />
                      <span className="truncate">External Link</span>
                    </Button>

                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setPreviewOpen(true)}
                      disabled={isUploading || isDeleting}
                      className="btn-premium-outline text-xs h-9 cursor-pointer w-full sm:w-auto sm:flex-1 min-w-0 truncate justify-center"
                    >
                      <Eye className="size-3.5 mr-1.5 text-primary shrink-0" />
                      <span className="truncate">Preview</span>
                    </Button>

                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handleDownload}
                      disabled={isUploading || isDownloading || isDeleting}
                      className="btn-premium-outline text-xs h-9 cursor-pointer w-full sm:w-auto sm:flex-1 min-w-0 truncate justify-center"
                    >
                      {isDownloading ? (
                        <Loader2 className="size-3.5 animate-spin mr-1.5 text-primary shrink-0" />
                      ) : (
                        <Download className="size-3.5 mr-1.5 text-primary shrink-0" />
                      )}
                      <span className="truncate">Download</span>
                    </Button>

                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={isUploading || isDeleting}
                      className="btn-premium-violet-outline text-xs h-9 cursor-pointer w-full sm:w-auto sm:flex-1 min-w-0 truncate justify-center"
                    >
                      <RefreshCw className="size-3.5 mr-1.5 shrink-0" />
                      <span className="truncate">Replace</span>
                    </Button>

                    <Button
                      type="button"
                      size="sm"
                      onClick={() => setDeleteDialogOpen(true)}
                      disabled={isUploading || isDeleting}
                      className="btn-premium-danger text-xs h-9 cursor-pointer col-span-2 sm:col-span-1 w-full sm:w-auto sm:flex-1 min-w-0 truncate justify-center"
                    >
                      <Trash2 className="size-3.5 mr-1.5 shrink-0" />
                      <span className="truncate">Delete</span>
                    </Button>
                  </div>
                ) : (
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isUploading}
                    className="w-full btn-premium-solid text-xs h-9 cursor-pointer flex items-center justify-center gap-1.5 min-w-0"
                  >
                    <Upload className="size-3.5 shrink-0" />
                    <span className="truncate">Upload Document</span>
                  </Button>
                )}
              </div>
            </div>
          )}

          {/* ================= OPTION 2: GOOGLE DOCS URL ================= */}
          {selectedSource === "google_doc" && (
            <div className="space-y-4 min-w-0 w-full">
              <form onSubmit={handleSaveGoogleDocsUrl} className="space-y-3 min-w-0 w-full">
                <div className="space-y-1.5 min-w-0 w-full">
                  <label htmlFor={`gdoc-url-${type}`} className="text-xs font-medium text-foreground flex items-center justify-between gap-2 min-w-0">
                    <span className="truncate">Google Docs URL</span>
                    {hasGoogleDoc && (
                      <span className="text-[11px] text-primary flex items-center gap-1 shrink-0">
                        <Check className="size-3 shrink-0" /> Saved & Active
                      </span>
                    )}
                  </label>
                  <div className="relative min-w-0 w-full">
                    <Input
                      id={`gdoc-url-${type}`}
                      type="url"
                      value={googleDocsUrlInput}
                      onChange={(e) => {
                        setGoogleDocsUrlInput(e.target.value);
                        setErrorMessage(null);
                      }}
                      placeholder="https://docs.google.com/document/d/..."
                      className="text-xs h-9 pr-8 bg-muted/30 border-border focus:border-primary font-mono text-[11px] w-full min-w-0"
                      disabled={isSavingUrl || isDeleting}
                    />
                    <Link2 className="size-4 text-muted-foreground absolute right-2.5 top-2.5 pointer-events-none opacity-60 shrink-0" />
                  </div>
                  <p className="text-[11px] text-muted-foreground leading-normal">
                    Paste a viewable Google Docs or Drive link (ensure permissions are set to &quot;Anyone with the link can view&quot;).
                  </p>
                </div>

                {/* Action buttons for Google Docs URL */}
                <div className="pt-1 grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-2 min-w-0 w-full">
                  <Button
                    type="submit"
                    size="sm"
                    disabled={isSavingUrl || !googleDocsUrlInput.trim()}
                    className="btn-premium-solid text-xs h-9 cursor-pointer w-full sm:w-auto sm:flex-1 min-w-0 truncate justify-center"
                  >
                    {isSavingUrl ? (
                      <>
                        <Loader2 className="size-3.5 animate-spin mr-1.5 shrink-0" />
                        <span className="truncate">Saving...</span>
                      </>
                    ) : (
                      <>
                        <Check className="size-3.5 mr-1.5 shrink-0" />
                        <span className="truncate">{hasGoogleDoc ? "Update URL" : "Save URL"}</span>
                      </>
                    )}
                  </Button>

                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleExternalLink}
                    disabled={!policy?.googleDocsUrl && !isValidGoogleDocUrl(googleDocsUrlInput)}
                    className="btn-premium-outline text-xs h-9 cursor-pointer w-full sm:w-auto sm:flex-1 min-w-0 truncate justify-center"
                    title="Open Google Doc directly in a new browser tab"
                  >
                    <ExternalLink className="size-3.5 mr-1.5 text-primary shrink-0" />
                    <span className="truncate">External Link</span>
                  </Button>

                  {hasGoogleDoc && (
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => setDeleteDialogOpen(true)}
                      disabled={isSavingUrl || isDeleting}
                      className="btn-premium-danger text-xs h-9 cursor-pointer col-span-2 sm:col-span-1 w-full sm:w-auto sm:flex-1 min-w-0 truncate justify-center"
                    >
                      <Trash2 className="size-3.5 mr-1.5 shrink-0" />
                      <span className="truncate">Clear</span>
                    </Button>
                  )}
                </div>
              </form>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Confirmation Dialog for Deletion */}
      <AlertDialog
        open={deleteDialogOpen}
        onOpenChange={(open) => {
          if (!isDeleting) setDeleteDialogOpen(open);
        }}
      >
        <AlertDialogContent className="bg-card border-border text-card-foreground max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-foreground">
              <AlertTriangle className="size-5 text-amber-500 shrink-0" />
              Remove {title}
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="text-muted-foreground text-left space-y-2.5 pt-1 text-xs sm:text-sm">
                <p>
                  Are you sure you want to remove{" "}
                  <span className="font-semibold text-foreground">
                    {policy?.fileName || policy?.googleDocsUrl || title}
                  </span>
                  ? This will safely remove the policy reference from the server.
                </p>
                <p className="text-[11px] text-muted-foreground">
                  Members will no longer be able to access this document until a new document or URL is configured.
                </p>
                {type === "privacy_policy" && (
                  <div className="p-2.5 rounded-md bg-primary/10 border border-primary/20 text-primary text-xs">
                    <strong>Registration Requirement:</strong> New members must still accept the Club Privacy Policy to register.
                  </div>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2 sm:gap-2">
            <AlertDialogCancel
              disabled={isDeleting}
              className="btn-premium-outline cursor-pointer mt-0"
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={isDeleting}
              onClick={handleDelete}
              className="btn-premium-danger cursor-pointer"
            >
              {isDeleting ? (
                <>
                  <Loader2 className="size-3.5 animate-spin mr-1.5" />
                  Removing...
                </>
              ) : (
                "Remove Document"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Preview Modal (kept for PDF upload preview as required) */}
      <PolicyDocumentModal
        open={previewOpen}
        onOpenChange={setPreviewOpen}
        type={type}
        title={title}
        subtitle={description}
      />
    </>
  );
}
