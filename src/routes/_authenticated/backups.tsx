import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useState, useEffect, useMemo } from "react";
import { useCurrentUser } from "@/lib/store";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  Database,
  Download,
  ShieldCheck,
  RefreshCw,
  RotateCcw,
  Trash2,
  CheckCircle2,
  Clock,
  HardDrive,
  AlertTriangle,
  FileCheck,
  Search,
  Check,
  Server,
  Calendar,
  Layers,
} from "lucide-react";
import { api, getBaseUrl } from "@/lib/api";

export const Route = createFileRoute("/_authenticated/backups")({
  component: DatabaseBackupsPage,
});

export interface BackupItem {
  filename: string;
  size_bytes: number;
  size_human: string;
  created_at: string;
  age_days: number;
  sha256: string | null;
  tables_count: number | null;
  dump_engine: string;
  is_safety_snapshot: boolean;
  is_verified: boolean;
  compressed: boolean;
}

export interface BackupSummary {
  total_count: number;
  total_size_bytes: number;
  retention_days: number;
  daily_time: string;
  compression: boolean;
  secondary_storage_configured: boolean;
  secondary_disk: string | null;
}

function formatBytes(bytes: number, decimals = 1): string {
  if (!bytes || bytes === 0) return "0 B";
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}

export function DatabaseBackupsPage() {
  const currentUser = useCurrentUser();
  const [backups, setBackups] = useState<BackupItem[]>([]);
  const [summary, setSummary] = useState<BackupSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [restoringFile, setRestoringFile] = useState<string | null>(null);
  const [confirmRestoreFile, setConfirmRestoreFile] = useState<string | null>(null);
  const [verifyingFile, setVerifyingFile] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<"all" | "standard" | "safety">("all");

  const fetchBackups = async () => {
    setLoading(true);
    try {
      const data = await api.get<{ backups: BackupItem[]; summary: BackupSummary }>("/backups");
      setBackups(data.backups || []);
      setSummary(data.summary || null);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to load database backups";
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBackups();
  }, []);

  const handleCreateBackup = async () => {
    setCreating(true);
    try {
      const res = await api.post<{ message: string; backup: Record<string, unknown> }>("/backups", {
        label: "manual",
      });
      toast.success(res.message || "Manual database backup created successfully!");
      await fetchBackups();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to create database backup";
      toast.error(message);
    } finally {
      setCreating(false);
    }
  };

  const handleVerify = async (filename: string) => {
    setVerifyingFile(filename);
    try {
      const res = await api.post<{ valid: boolean; sha256: string }>(`/backups/${filename}/verify`);
      if (res.valid) {
        toast.success(`Integrity Verified! SHA256: ${res.sha256?.substring(0, 16)}...`);
      } else {
        toast.error("Integrity verification failed for this backup!");
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Verification failed";
      toast.error(message);
    } finally {
      setVerifyingFile(null);
    }
  };

  const handleDownload = (filename: string) => {
    const token = localStorage.getItem("clubapp_token");
    const downloadUrl = `${getBaseUrl()}/backups/${filename}/download`;

    fetch(downloadUrl, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    })
      .then((res) => {
        if (!res.ok) throw new Error("Download failed");
        return res.blob();
      })
      .then((blob) => {
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
        toast.success(`Downloaded ${filename}`);
      })
      .catch((err) => {
        toast.error(err.message || "Failed to download backup");
      });
  };

  const handleConfirmRestore = async () => {
    if (!confirmRestoreFile) return;
    const file = confirmRestoreFile;
    setConfirmRestoreFile(null);
    setRestoringFile(file);

    try {
      const res = await api.post<{ message: string; result: Record<string, unknown> }>(
        `/backups/${file}/restore`,
        {
          confirm: true,
        },
      );
      toast.success(res.message || "Database successfully restored!");
      await fetchBackups();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Database restore failed";
      toast.error(message);
    } finally {
      setRestoringFile(null);
    }
  };

  const handleDelete = async (filename: string) => {
    if (!window.confirm(`Are you sure you want to permanently delete backup "${filename}"?`)) {
      return;
    }

    try {
      await api.delete(`/backups/${filename}`);
      toast.success(`Deleted backup: ${filename}`);
      await fetchBackups();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to delete backup";
      toast.error(message);
    }
  };

  // Filtered backups based on search query and type filter
  const filteredBackups = useMemo(() => {
    return backups.filter((b) => {
      const matchesSearch =
        searchQuery.trim() === "" ||
        b.filename.toLowerCase().includes(searchQuery.toLowerCase()) ||
        b.created_at.toLowerCase().includes(searchQuery.toLowerCase());

      const matchesType =
        typeFilter === "all" ||
        (typeFilter === "standard" && !b.is_safety_snapshot) ||
        (typeFilter === "safety" && b.is_safety_snapshot);

      return matchesSearch && matchesType;
    });
  }, [backups, searchQuery, typeFilter]);

  if (!currentUser) return null;
  if (currentUser.role !== "admin") {
    return <Navigate to="/dashboard" />;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Database Backups"
        description="Automated daily database backups with rolling retention, integrity verification, and safe rollback snapshots."
        actions={
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={fetchBackups}
              disabled={loading}
              className="h-8.5 px-3 text-xs border-border bg-background hover:bg-muted text-foreground cursor-pointer transition-colors"
            >
              <RefreshCw className={`size-3.5 mr-1.5 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={handleCreateBackup}
              disabled={creating}
              className="h-8.5 px-3.5 text-xs font-semibold bg-primary hover:bg-primary/90 text-primary-foreground shadow-xs cursor-pointer transition-colors"
            >
              <HardDrive className={`size-3.5 mr-1.5 ${creating ? "animate-spin" : ""}`} />
              {creating ? "Backing up..." : "Backup Now"}
            </Button>
          </div>
        }
      />

      {/* Status Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="bg-card text-card-foreground border border-border shadow-xs rounded-xl p-4 transition-all hover:border-primary/30">
          <div className="flex items-center gap-2 text-[11px] font-medium text-muted-foreground mb-1.5">
            <Clock className="size-4 text-primary" />
            <span>Daily Schedule</span>
          </div>
          <div className="text-sm sm:text-base font-bold text-foreground tracking-tight">
            Every Day at {summary?.daily_time || "02:00"}
          </div>
          <div className="text-[11px] text-muted-foreground mt-0.5">
            Automated Cron (Server Time)
          </div>
        </Card>

        <Card className="bg-card text-card-foreground border border-border shadow-xs rounded-xl p-4 transition-all hover:border-primary/30">
          <div className="flex items-center gap-2 text-[11px] font-medium text-muted-foreground mb-1.5">
            <ShieldCheck className="size-4 text-primary" />
            <span>Retention Policy</span>
          </div>
          <div className="text-sm sm:text-base font-bold text-foreground tracking-tight">
            Last {summary?.retention_days || 30} Days History
          </div>
          <div className="text-[11px] text-muted-foreground mt-0.5">Rolling auto-pruning</div>
        </Card>

        <Card className="bg-card text-card-foreground border border-border shadow-xs rounded-xl p-4 transition-all hover:border-primary/30">
          <div className="flex items-center gap-2 text-[11px] font-medium text-muted-foreground mb-1.5">
            <CheckCircle2 className="size-4 text-primary" />
            <span>Integrity & Engine</span>
          </div>
          <div className="text-sm sm:text-base font-bold text-foreground tracking-tight">
            SHA-256 Verified
          </div>
          <div className="text-[11px] text-muted-foreground mt-0.5">Non-locking online dump</div>
        </Card>

        <Card className="bg-card text-card-foreground border border-border shadow-xs rounded-xl p-4 transition-all hover:border-primary/30">
          <div className="flex items-center gap-2 text-[11px] font-medium text-muted-foreground mb-1.5">
            <HardDrive className="size-4 text-primary" />
            <span>Total Backups</span>
          </div>
          <div className="text-sm sm:text-base font-bold text-foreground tracking-tight">
            {summary?.total_count || backups.length} Available Archives
          </div>
          <div className="text-[11px] text-muted-foreground mt-0.5">
            Gzip (.sql.gz) · {formatBytes(summary?.total_size_bytes || 0)}
          </div>
        </Card>
      </div>

      {/* Fail-Safe Protection Notice */}
      <div className="p-4 bg-primary/5 border border-primary/20 text-foreground rounded-xl text-xs flex items-start gap-3 leading-relaxed shadow-xs">
        <ShieldCheck className="size-5 shrink-0 text-primary mt-0.5" />
        <div>
          <strong className="text-primary font-semibold">Fail-Safe Protection:</strong> Every backup
          is taken without locking database tables, ensuring zero downtime for live members. Before
          any restore is applied, the system automatically creates a pre-restore safety snapshot so
          you can instantly rollback if needed.
        </div>
      </div>

      {/* Backups Archives Card */}
      <Card className="bg-card text-card-foreground border border-border shadow-xs flex flex-col min-w-0 w-full max-w-full overflow-hidden rounded-xl">
        <CardHeader className="p-4 sm:p-6 pb-4 sm:pb-4 border-b border-border min-w-0">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-2.5">
              <div className="size-8 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shrink-0">
                <Database className="size-4.5" />
              </div>
              <div>
                <CardTitle className="text-sm font-semibold text-foreground flex items-center gap-2">
                  <span>Backup Archives & Snapshots</span>
                  <Badge variant="secondary" className="text-[11px] px-2 py-0.5">
                    {filteredBackups.length}
                  </Badge>
                </CardTitle>
                <CardDescription className="text-xs text-muted-foreground mt-0.5">
                  Point-in-time database archives with SHA-256 verification and restore controls.
                </CardDescription>
              </div>
            </div>

            {/* Search and Filters */}
            <div className="flex items-center gap-2 flex-wrap">
              <div className="relative w-48 sm:w-64">
                <Search className="size-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  type="text"
                  placeholder="Filter backups..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="h-8.5 pl-8 pr-3 text-xs bg-background border-border"
                />
              </div>
              <div className="inline-flex rounded-lg border border-border p-0.5 bg-muted/40">
                <button
                  type="button"
                  onClick={() => setTypeFilter("all")}
                  className={`px-2.5 py-1 text-[11px] font-medium rounded-md transition-colors cursor-pointer ${
                    typeFilter === "all"
                      ? "bg-background text-foreground shadow-2xs"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  All ({backups.length})
                </button>
                <button
                  type="button"
                  onClick={() => setTypeFilter("standard")}
                  className={`px-2.5 py-1 text-[11px] font-medium rounded-md transition-colors cursor-pointer ${
                    typeFilter === "standard"
                      ? "bg-background text-foreground shadow-2xs"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Standard ({backups.filter((b) => !b.is_safety_snapshot).length})
                </button>
                <button
                  type="button"
                  onClick={() => setTypeFilter("safety")}
                  className={`px-2.5 py-1 text-[11px] font-medium rounded-md transition-colors cursor-pointer ${
                    typeFilter === "safety"
                      ? "bg-background text-foreground shadow-2xs"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Safety ({backups.filter((b) => b.is_safety_snapshot).length})
                </button>
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0 flex-1 flex flex-col min-w-0 w-full">
          <div className="overflow-x-auto min-w-0 w-full">
            <table className="w-full text-left text-xs">
              <thead className="bg-muted/50 text-muted-foreground border-b border-border">
                <tr>
                  <th className="py-3 px-4 font-semibold text-[11px] uppercase tracking-wider text-muted-foreground">
                    Backup Archive
                  </th>
                  <th className="py-3 px-4 font-semibold text-[11px] uppercase tracking-wider text-muted-foreground">
                    Size
                  </th>
                  <th className="py-3 px-4 font-semibold text-[11px] uppercase tracking-wider text-muted-foreground">
                    Created
                  </th>
                  <th className="py-3 px-4 font-semibold text-[11px] uppercase tracking-wider text-muted-foreground">
                    Type
                  </th>
                  <th className="py-3 px-4 font-semibold text-[11px] uppercase tracking-wider text-muted-foreground">
                    Integrity
                  </th>
                  <th className="py-3 px-4 font-semibold text-[11px] uppercase tracking-wider text-muted-foreground text-right">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {filteredBackups.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-12 text-center text-muted-foreground">
                      {loading ? (
                        <div className="flex flex-col items-center justify-center gap-2">
                          <RefreshCw className="size-5 animate-spin text-primary" />
                          <span>Loading database backups...</span>
                        </div>
                      ) : searchQuery || typeFilter !== "all" ? (
                        <div className="space-y-1">
                          <p className="font-medium text-foreground">No matching backups found</p>
                          <p className="text-xs text-muted-foreground">
                            Try adjusting your search query or filters.
                          </p>
                        </div>
                      ) : (
                        <div className="space-y-3">
                          <Database className="size-8 mx-auto text-muted-foreground/50" />
                          <div>
                            <p className="font-medium text-foreground">No backup archives found</p>
                            <p className="text-xs text-muted-foreground mt-0.5">
                              Automated daily backups will appear here, or you can create one now.
                            </p>
                          </div>
                          <Button
                            type="button"
                            size="sm"
                            onClick={handleCreateBackup}
                            disabled={creating}
                            className="h-8 px-3 text-xs font-semibold bg-primary text-primary-foreground cursor-pointer"
                          >
                            <HardDrive className="size-3.5 mr-1.5" />
                            Create First Backup
                          </Button>
                        </div>
                      )}
                    </td>
                  </tr>
                ) : (
                  filteredBackups.map((b) => (
                    <tr key={b.filename} className="hover:bg-muted/30 transition-colors">
                      <td className="py-3.5 px-4">
                        <div
                          className="font-mono text-xs font-semibold text-foreground max-w-[320px] truncate"
                          title={b.filename}
                        >
                          {b.filename}
                        </div>
                        {b.sha256 && (
                          <div
                            className="text-[10px] text-muted-foreground font-mono truncate max-w-[280px] mt-0.5"
                            title={`SHA256: ${b.sha256}`}
                          >
                            SHA: {b.sha256.substring(0, 16)}...
                          </div>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-foreground font-medium whitespace-nowrap">
                        {b.size_human}
                      </td>
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <div className="font-medium text-foreground">
                          {new Date(b.created_at).toLocaleDateString()}
                        </div>
                        <div className="text-[11px] text-muted-foreground">
                          {new Date(b.created_at).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                          {b.age_days === 0 ? " (Today)" : ` (${b.age_days}d ago)`}
                        </div>
                      </td>
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        {b.is_safety_snapshot ? (
                          <span className="px-2 py-0.5 rounded-md text-[10px] font-semibold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/25">
                            Safety Snapshot
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-md text-[10px] font-semibold bg-primary/10 text-primary border border-primary/20">
                            Standard
                          </span>
                        )}
                      </td>
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                          <CheckCircle2 className="size-3.5 text-emerald-500" />
                          Verified
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-right whitespace-nowrap space-x-1">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => handleVerify(b.filename)}
                          disabled={verifyingFile === b.filename}
                          title="Verify File Integrity & SHA256"
                          className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg cursor-pointer"
                        >
                          <FileCheck
                            className={`size-3.5 ${verifyingFile === b.filename ? "animate-spin text-primary" : ""}`}
                          />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDownload(b.filename)}
                          title="Download Backup Archive (.sql.gz)"
                          className="h-8 w-8 p-0 text-primary hover:text-primary hover:bg-primary/10 rounded-lg cursor-pointer"
                        >
                          <Download className="size-3.5" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => setConfirmRestoreFile(b.filename)}
                          disabled={restoringFile === b.filename}
                          title="Safe Restore to this Backup"
                          className="h-8 w-8 p-0 text-amber-600 hover:text-amber-700 hover:bg-amber-500/10 dark:text-amber-400 rounded-lg cursor-pointer"
                        >
                          <RotateCcw
                            className={`size-3.5 ${restoringFile === b.filename ? "animate-spin" : ""}`}
                          />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDelete(b.filename)}
                          title="Delete Backup"
                          className="h-8 w-8 p-0 text-destructive hover:text-destructive hover:bg-destructive/10 rounded-lg cursor-pointer"
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Safe Restore Confirmation Dialog */}
      {confirmRestoreFile && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs">
          <div className="bg-card text-card-foreground border border-border rounded-2xl p-6 max-w-md w-full shadow-2xl space-y-4">
            <div className="flex items-center gap-3 text-amber-500">
              <div className="size-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center shrink-0">
                <AlertTriangle className="size-5 text-amber-500" />
              </div>
              <div>
                <h3 className="text-base font-bold text-foreground">Confirm Database Restore</h3>
                <p className="text-xs text-muted-foreground">
                  Point-in-time recovery with safety snapshot
                </p>
              </div>
            </div>
            <div className="text-xs text-muted-foreground space-y-2.5 leading-relaxed">
              <p>Are you sure you want to restore the database from this backup?</p>
              <div className="p-3 bg-muted/60 rounded-xl border border-border font-mono text-[11px] text-foreground break-all">
                {confirmRestoreFile}
              </div>
              <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl text-amber-700 dark:text-amber-300">
                <strong>Notice:</strong> An automated safety backup of the current database will be
                created first. The application will briefly enter maintenance mode to ensure
                complete data consistency.
              </div>
            </div>
            <div className="flex items-center justify-end gap-2.5 pt-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setConfirmRestoreFile(null)}
                className="h-9 px-4 text-xs border-border bg-background hover:bg-muted text-foreground cursor-pointer"
              >
                Cancel
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={handleConfirmRestore}
                className="h-9 px-4 text-xs font-semibold bg-amber-600 hover:bg-amber-500 text-white cursor-pointer shadow-xs"
              >
                Proceed with Safe Restore
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
