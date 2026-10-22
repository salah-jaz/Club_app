import { useRef, useState } from "react";
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
} from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
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
import type { PolicyType } from "@/lib/types";
import { toast } from "sonner";

interface PolicyCardProps {
  type: PolicyType;
  title: string;
  description: string;
  badgeLabel?: string;
}

export function PolicyCard({ type, title, description }: PolicyCardProps) {
  const policy = useStore((s) => s.policies[type]);
  const uploadPolicy = useStore((s) => s.uploadPolicy);
  const deletePolicy = useStore((s) => s.deletePolicy);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const hasDocument = Boolean(policy?.hasDocument);
  const Icon = type === "privacy_policy" ? ShieldCheck : FileText;

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
      setUploadProgress(100);
      toast.success(`${title} updated successfully`);
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

  const handleDownload = async () => {
    if (!hasDocument) return;
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

  const handleDelete = async (e?: React.MouseEvent) => {
    if (e) e.preventDefault();
    if (!hasDocument || isDeleting) return;

    setIsDeleting(true);
    setErrorMessage(null);

    try {
      await deletePolicy(type);
      toast.success(`${title} deleted successfully`);
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
      <Card className="bg-card text-card-foreground border-border signature-card-top flex flex-col justify-between shadow-sm">
        <CardHeader className="pb-3 border-b border-border/60">
          <div className="flex items-center justify-between">
            <CardTitle className="text-xs font-semibold tracking-[0.12em] text-primary uppercase flex items-center gap-2">
              <Icon className="size-4 text-primary" />
              <span>{title}</span>
            </CardTitle>

            {hasDocument ? (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-medium bg-primary/10 text-primary border border-primary/20">
                <CheckCircle2 className="size-3" />
                Active
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-medium bg-muted text-muted-foreground border border-border">
                Not Uploaded
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{description}</p>
        </CardHeader>

        <CardContent className="pt-5 flex-1 flex flex-col justify-between space-y-4">
          {/* Hidden File Input */}
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,application/pdf"
            className="hidden"
            onChange={handleFileSelect}
            disabled={isUploading || isDeleting}
          />

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

          {/* Upload Progress Bar */}
          {isUploading && (
            <div className="space-y-1.5 p-3 rounded-lg bg-primary/5 border border-primary/20">
              <div className="flex items-center justify-between text-xs text-primary">
                <span className="flex items-center gap-1.5">
                  <Loader2 className="size-3.5 animate-spin text-primary" />
                  {hasDocument ? "Replacing document..." : "Uploading document..."}
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

          {/* Current Document Info */}
          {hasDocument ? (
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
              className="border border-dashed border-border hover:border-primary/50 rounded-lg p-6 text-center cursor-pointer transition-colors bg-muted/20 hover:bg-muted/40 flex flex-col items-center justify-center min-h-[120px]"
            >
              <Upload className="size-6 text-muted-foreground mb-2" />
              <p className="text-xs font-medium text-foreground">No PDF uploaded yet</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Click to browse or drop your PDF here (max 10 MB)
              </p>
            </div>
          )}

          {/* Action Buttons */}
          <div className="pt-2">
            {hasDocument ? (
              <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setPreviewOpen(true)}
                  disabled={isUploading || isDeleting}
                  className="btn-premium-outline text-xs h-9 cursor-pointer flex-1 min-w-[110px]"
                >
                  <Eye className="size-3.5 mr-1.5 text-primary" />
                  Preview
                </Button>

                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleDownload}
                  disabled={isUploading || isDownloading || isDeleting}
                  className="btn-premium-outline text-xs h-9 cursor-pointer flex-1 min-w-[110px]"
                >
                  {isDownloading ? (
                    <Loader2 className="size-3.5 animate-spin mr-1.5 text-primary" />
                  ) : (
                    <Download className="size-3.5 mr-1.5 text-primary" />
                  )}
                  Download
                </Button>

                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isUploading || isDeleting}
                  className="btn-premium-violet-outline text-xs h-9 cursor-pointer flex-1 min-w-[110px]"
                >
                  <RefreshCw className="size-3.5 mr-1.5" />
                  Replace
                </Button>

                <Button
                  type="button"
                  size="sm"
                  onClick={() => setDeleteDialogOpen(true)}
                  disabled={isUploading || isDeleting}
                  className="btn-premium-danger text-xs h-9 cursor-pointer flex-1 min-w-[110px]"
                >
                  <Trash2 className="size-3.5 mr-1.5" />
                  Delete
                </Button>
              </div>
            ) : (
              <Button
                type="button"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploading}
                className="w-full btn-premium-solid text-xs h-9 cursor-pointer flex items-center justify-center gap-1.5"
              >
                <Upload className="size-3.5" />
                Upload Document
              </Button>
            )}
          </div>
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
              Delete {title}
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="text-muted-foreground text-left space-y-2.5 pt-1 text-xs sm:text-sm">
                <p>
                  Are you sure you want to delete{" "}
                  <span className="font-semibold text-foreground">
                    {policy?.fileName || title}
                  </span>
                  ? This will safely remove the document and its database reference from the server.
                </p>
                <p className="text-[11px] text-muted-foreground">
                  Members will no longer be able to preview or download this document until a new one is uploaded.
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
                  Deleting...
                </>
              ) : (
                "Delete Document"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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
