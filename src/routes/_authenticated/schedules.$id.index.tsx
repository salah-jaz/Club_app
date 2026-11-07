import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { useCurrentUser, useStore } from "@/lib/store";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/StatusBadge";
import {
  CourtRotationView,
  cloneRounds,
  courtDisplayName,
  getCourtTimeRange,
  stripEmptySlots,
} from "@/components/CourtRotationView";
import { fmtDateTime, fmtMoney } from "@/lib/format";
import { applyMemberFee, discountsFromStore, playSessionBaseFee } from "@/lib/fees";
import { toast } from "sonner";
import {
  Download,
  FileSpreadsheet,
  FileText,
  Pencil,
  Shuffle,
  Send,
  X,
  RotateCcw,
  AlertTriangle,
  ArrowLeftRight,
  Search,
  Check,
  AlertCircle,
  ArrowRight,
  UserMinus,
  UserPlus,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { PlayInvitation, PlaySchedule, Rotation, RotationRound } from "@/lib/types";
import { jsPDF } from "jspdf";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { ConfirmActionDialog, type ConfirmActionRequest } from "@/components/ConfirmActionDialog";

export const Route = createFileRoute("/_authenticated/schedules/$id/")({ component: SchedulePage });

function byFirstCome(a: PlayInvitation, b: PlayInvitation) {
  const ta = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
  const tb = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
  if (ta !== tb) return ta - tb;
  return a.id.localeCompare(b.id);
}

function csvEscape(value: string) {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

function buildRotationCsv(
  sch: PlaySchedule,
  rot: Rotation,
  nameOf: (id: string) => string,
): string {
  const roundCount = rot.rounds.length;
  const rows: string[] = [
    ["Round", "Court", "Time", "Player 1", "Player 2", "Player 3", "Player 4", "Resting"].join(","),
  ];

  for (const r of rot.rounds) {
    const time = getCourtTimeRange(sch, r.round, roundCount).label;
    const resting = r.resting.map(nameOf).join("; ");
    for (const c of r.courts) {
      const players = [0, 1, 2, 3].map((i) => (c.players[i] ? nameOf(c.players[i]) : ""));
      rows.push(
        [String(r.round), courtDisplayName(c), time, ...players, resting].map(csvEscape).join(","),
      );
    }
    if (r.courts.length === 0 && r.resting.length > 0) {
      rows.push([String(r.round), "", time, "", "", "", "", resting].map(csvEscape).join(","));
    }
  }

  return rows.join("\n");
}

function downloadTextFile(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function scheduleExportSlug(name: string) {
  return name.replace(/[^\w\-]+/g, "_").replace(/^_|_$/g, "") || "schedule";
}

async function resolveLogoForPdf(
  logoSrc: string | null | undefined,
): Promise<{ dataUrl: string; format: "PNG" | "JPEG" } | null> {
  if (!logoSrc) return null;

  const toResult = (dataUrl: string): { dataUrl: string; format: "PNG" | "JPEG" } | null => {
    if (dataUrl.startsWith("data:image/jpeg") || dataUrl.startsWith("data:image/jpg")) {
      return { dataUrl, format: "JPEG" };
    }
    if (dataUrl.startsWith("data:image/png") || dataUrl.startsWith("data:image/")) {
      return { dataUrl, format: "PNG" };
    }
    return null;
  };

  if (logoSrc.startsWith("data:image/")) {
    return toResult(logoSrc);
  }

  try {
    const res = await fetch(logoSrc);
    if (!res.ok) return null;
    const blob = await res.blob();
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });
    return toResult(dataUrl);
  } catch {
    return null;
  }
}

async function downloadRotationPdf(
  sch: PlaySchedule,
  rot: Rotation,
  nameOf: (id: string) => string,
  brand: { appName: string; appLogoText: string; appLogoBase64?: string | null },
) {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const marginX = 14;
  const contentW = pageW - marginX * 2;
  const roundCount = rot.rounds.length;
  const accent: [number, number, number] = [16, 185, 129];
  const ink: [number, number, number] = [17, 24, 22];
  const muted: [number, number, number] = [100, 116, 110];
  const cardBg: [number, number, number] = [248, 250, 249];
  const line: [number, number, number] = [226, 232, 230];
  const guestGold: [number, number, number] = [180, 130, 20];
  const mark = (brand.appLogoText || brand.appName || "C").slice(0, 2).toUpperCase();
  const logo = await resolveLogoForPdf(brand.appLogoBase64 || "/logo.png");

  const drawFooter = (pageNum: number, total: number) => {
    doc.setDrawColor(...line);
    doc.setLineWidth(0.3);
    doc.line(marginX, pageH - 14, pageW - marginX, pageH - 14);
    doc.setFontSize(8);
    doc.setTextColor(...muted);
    doc.text(`${brand.appName} · Court rotation sheet`, marginX, pageH - 8);
    doc.text(`Page ${pageNum} of ${total}`, pageW - marginX, pageH - 8, { align: "right" });
  };

  // Header band
  doc.setFillColor(...accent);
  doc.rect(0, 0, pageW, 28, "F");
  doc.setFillColor(255, 255, 255);
  doc.roundedRect(marginX, 7, 14, 14, 2, 2, "F");
  if (logo) {
    try {
      doc.addImage(logo.dataUrl, logo.format, marginX + 1.5, 8.5, 11, 11);
    } catch {
      doc.setTextColor(...accent);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      doc.text(mark, marginX + 7, 16, { align: "center" });
    }
  } else {
    doc.setTextColor(...accent);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text(mark, marginX + 7, 16, { align: "center" });
  }
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.text(brand.appName || "Connect App", marginX + 18, 13);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text("Court Rotation Sheet", marginX + 18, 20);
  doc.setFontSize(8);
  doc.text(fmtDateTime(sch.date), pageW - marginX, 13, { align: "right" });
  doc.text(sch.location, pageW - marginX, 20, { align: "right" });

  // Session title block
  let y = 38;
  doc.setTextColor(...ink);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text(sch.name, marginX, y);
  y += 7;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...muted);
  doc.text(
    `Capacity ${sch.players} players  ·  ${sch.courts} courts  ·  ${roundCount} rounds  ·  Slot ${sch.slotDuration}`,
    marginX,
    y,
  );
  y += 8;
  doc.setDrawColor(...accent);
  doc.setLineWidth(1);
  doc.line(marginX, y, marginX + 28, y);
  y += 8;

  const courtGap = 4;
  const courtW = (contentW - courtGap) / 2;
  const courtH = 42;
  const bottomLimit = pageH - 22;

  for (const r of rot.rounds) {
    const time = getCourtTimeRange(sch, r.round, roundCount).label;
    const courts = r.courts;
    const rowsNeeded = Math.ceil(Math.max(courts.length, 1) / 2);
    const restingH = r.resting.length > 0 ? 10 : 0;
    const blockH = 10 + rowsNeeded * (courtH + courtGap) + restingH + 6;

    if (y + blockH > bottomLimit) {
      doc.addPage();
      y = 20;
    }

    // Round header strip
    doc.setFillColor(...ink);
    doc.roundedRect(marginX, y, contentW, 9, 1.5, 1.5, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.text(`ROUND ${r.round}`, marginX + 4, y + 6);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.text(time, pageW - marginX - 4, y + 6, { align: "right" });
    y += 13;

    if (courts.length === 0) {
      doc.setTextColor(...muted);
      doc.setFontSize(9);
      doc.text("No courts assigned for this round.", marginX + 2, y + 4);
      y += 12;
    } else {
      courts.forEach((c, idx) => {
        const col = idx % 2;
        const row = Math.floor(idx / 2);
        const x = marginX + col * (courtW + courtGap);
        const cy = y + row * (courtH + courtGap);

        doc.setFillColor(...cardBg);
        doc.setDrawColor(...line);
        doc.setLineWidth(0.4);
        doc.roundedRect(x, cy, courtW, courtH, 2, 2, "FD");

        // Court accent bar
        doc.setFillColor(...accent);
        doc.rect(x, cy, 2.2, courtH, "F");

        doc.setTextColor(...ink);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(11);
        doc.text(courtDisplayName(c), x + 6, cy + 8);

        doc.setFont("helvetica", "normal");
        doc.setFontSize(8);
        doc.setTextColor(...accent);
        doc.text(time, x + courtW - 4, cy + 8, { align: "right" });

        const playerIds = c.players;
        const players = playerIds.map(nameOf);
        const cellW = (courtW - 14) / 2;
        const cellH = 10;
        const startY = cy + 14;
        for (let i = 0; i < 4; i++) {
          const px = x + 6 + (i % 2) * (cellW + 2);
          const py = startY + Math.floor(i / 2) * (cellH + 2);
          const playerId = playerIds[i];
          const isGuest = typeof playerId === "string" && playerId.startsWith("guest_");
          doc.setFillColor(255, 255, 255);
          doc.setDrawColor(...(isGuest ? ([253, 230, 138] as [number, number, number]) : line));
          doc.roundedRect(px, py, cellW, cellH, 1, 1, "FD");
          doc.setTextColor(...(isGuest ? guestGold : ink));
          doc.setFont("helvetica", isGuest ? "bold" : "normal");
          doc.setFontSize(8);
          const label = players[i] || "—";
          doc.text(label, px + cellW / 2, py + 6.5, { align: "center", maxWidth: cellW - 3 });
        }
      });

      y += rowsNeeded * (courtH + courtGap);
    }

    if (r.resting.length > 0) {
      const restingNames = r.resting.map(nameOf).join("  ·  ");
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      const restingLines = doc.splitTextToSize(restingNames, contentW - 28) as string[];
      const restingBoxH = Math.max(8, 4 + restingLines.length * 4);
      if (y + restingBoxH > bottomLimit) {
        doc.addPage();
        y = 20;
      }
      doc.setFillColor(255, 251, 235);
      doc.setDrawColor(253, 230, 138);
      doc.roundedRect(marginX, y, contentW, restingBoxH, 1.5, 1.5, "FD");
      doc.setTextColor(146, 64, 14);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8);
      doc.text("Resting", marginX + 3, y + 5.3);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(...ink);
      doc.text(restingLines, marginX + 22, y + 5.3);
      y += restingBoxH + 4;
    } else {
      y += 4;
    }
  }

  const totalPages = doc.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    drawFooter(p, totalPages);
  }

  doc.save(`${scheduleExportSlug(sch.name)}_court_rotation.pdf`);
}

function SchedulePage() {
  const { id } = Route.useParams();
  const user = useCurrentUser()!;
  const s = useStore();
  const sch = s.schedules.find((x) => x.id === id);
  const invs = s.playInvites.filter((i) => i.scheduleId === id);
  const rot = s.rotations.find((r) => r.scheduleId === id);
  const [rotateConfirmOpen, setRotateConfirmOpen] = useState(false);
  const [rotating, setRotating] = useState(false);
  const [editingRotation, setEditingRotation] = useState(false);
  const [draftRounds, setDraftRounds] = useState<RotationRound[] | null>(null);
  const [savingRotation, setSavingRotation] = useState(false);
  const [revertConfirmOpen, setRevertConfirmOpen] = useState(false);
  const [reverting, setReverting] = useState(false);
  const [actionRequest, setActionRequest] = useState<ConfirmActionRequest | null>(null);
  const [replaceDialogOpen, setReplaceDialogOpen] = useState(false);
  const [outgoingMid, setOutgoingMid] = useState<string | null>(null);
  const [selectedReplacementId, setSelectedReplacementId] = useState<string | null>(null);
  const [replaceSearch, setReplaceSearch] = useState("");
  const [replaceFilter, setReplaceFilter] = useState<"all" | "waiting" | "yetToAccept">("all");
  const [confirmReplaceOpen, setConfirmReplaceOpen] = useState(false);
  const [replacing, setReplacing] = useState(false);

  const handleOpenReplace = (mid: string) => {
    setOutgoingMid(mid);
    setSelectedReplacementId(null);
    setReplaceSearch("");
    setReplaceFilter("all");
    setReplaceDialogOpen(true);
  };

  if (!sch) return <Navigate to="/schedules" />;

  const isAdmin = user.role === "admin";
  const canEditRotation =
    isAdmin && !!rot && (sch.status === "rotated" || sch.status === "published");

  const startEditRotation = () => {
    if (!rot) return;
    setDraftRounds(cloneRounds(rot.rounds));
    setEditingRotation(true);
  };

  const cancelEditRotation = () => {
    setEditingRotation(false);
    setDraftRounds(null);
  };

  const saveEditRotation = async () => {
    if (!draftRounds) return;
    setSavingRotation(true);
    try {
      await s.updateRotation(sch.id, stripEmptySlots(draftRounds));
      toast.success("Court rotation updated");
      setEditingRotation(false);
      setDraftRounds(null);
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "Failed to save rotation.");
    } finally {
      setSavingRotation(false);
    }
  };

  const requestReleaseSchedule = (scheduleToRelease: PlaySchedule) => {
    setActionRequest({
      title: "Release session?",
      description: (
        <>
          <span className="block">
            Release <strong className="text-[#F1F0EE]">“{scheduleToRelease.name}”</strong> and send
            invitations to eligible members?
          </span>
          <span className="block text-[#8A8A98]">
            Members will be able to accept or decline from Events.
          </span>
        </>
      ),
      confirmLabel: "Release",
      onConfirm: async () => {
        try {
          await s.releaseSchedule(scheduleToRelease.id);
          toast.success("Session released — invitations sent");
        } catch (error: unknown) {
          toast.error(error instanceof Error ? error.message : "Failed to release schedule.");
          throw error;
        }
      },
    });
  };

  const memberName = (mid: string) => {
    if (typeof mid === "string" && mid.startsWith("guest_")) {
      return `Guest Player ${mid.split("_")[1]}`;
    }
    const m = s.members.find((x) => x.id === mid);
    return m ? `${m.firstName} ${m.lastName}` : "?";
  };

  const memberGrade = (mid: string) => {
    if (typeof mid === "string" && mid.startsWith("guest_")) return undefined;
    return s.members.find((x) => x.id === mid)?.grade || undefined;
  };

  const grouped = {
    accepted: invs.filter((i) => i.status === "accepted").sort(byFirstCome),
    yetToAccept: invs
      .filter((i) => i.status === "open" || i.status === "declined")
      .sort(byFirstCome),
    waiting: invs.filter((i) => i.status === "waiting").sort(byFirstCome),
  };

  const realAccepted = grouped.accepted.filter(
    (i) => !(typeof i.memberId === "string" && i.memberId.startsWith("guest_")),
  );
  const guestNeeded = Math.max(0, sch.players - realAccepted.length);
  const underCapacity = realAccepted.length > 0 && realAccepted.length < sch.players;

  const columns = [
    { key: "accepted" as const, label: "Accepted", color: "text-[#2DD4BF]" },
    { key: "waiting" as const, label: "Waiting", color: "text-[#F59E0B]" },
    { key: "yetToAccept" as const, label: "Yet to Accept", color: "text-[#10B981]" },
  ];

  const discounts = discountsFromStore(s);

  const memberSkipsLeagueFee = (memberId: string) => {
    if (!sch.isLeagueMatch || !sch.leagueGroupIds?.length) return false;
    const skipNames = new Set(
      (s.playerPositionItems ?? []).filter((p) => p.skipLeagueFee).map((p) => p.name),
    );
    if (skipNames.size === 0) return false;
    for (const gid of sch.leagueGroupIds) {
      const group = s.leagueGroups.find((g) => g.id === gid);
      const pos = group?.memberPositions?.[memberId];
      if (pos && skipNames.has(pos)) return true;
    }
    return false;
  };

  const getMemberFee = (mid: string) => {
    if (typeof mid === "string" && mid.startsWith("guest_")) {
      return 0;
    }
    const m = s.members.find((x) => x.id === mid);
    if (sch.isLeagueMatch && memberSkipsLeagueFee(mid)) {
      return 0;
    }
    const base = playSessionBaseFee(sch.sessionRate);
    return applyMemberFee(base, m, discounts);
  };

  const replacementCandidates = useMemo(() => {
    if (!outgoingMid) return [];

    const acceptedMemberIds = new Set(grouped.accepted.map((inv) => inv.memberId));

    const items: Array<{
      invitation: PlayInvitation;
      memberId: string;
      member: (typeof s.members)[number] | undefined;
      source: "waiting" | "yetToAccept";
      fee: number;
      walletMember: (typeof s.members)[number] | undefined;
      availableCredit: number;
      bypassesCredit: boolean;
      hasSufficientCredit: boolean;
    }> = [];

    const seenMemberIds = new Set<string>();

    for (const inv of grouped.waiting) {
      const mid = inv.memberId;
      if (typeof mid === "string" && mid.startsWith("guest_")) continue;
      if (mid === outgoingMid || acceptedMemberIds.has(mid) || seenMemberIds.has(mid)) continue;
      const mem = s.members.find((m) => m.id === mid);
      if (!mem || mem.status !== "active" || !mem.membership) continue;
      seenMemberIds.add(mid);

      const fee = getMemberFee(mid);
      const wallet = mem.parentMemberId ? s.members.find((m) => m.id === mem.parentMemberId) || mem : mem;
      const skipsLeague = memberSkipsLeagueFee(mid);
      const bypassesCredit = !!wallet.skipCreditConsumption || skipsLeague;
      const hasSufficientCredit = bypassesCredit || fee <= 0 || wallet.credit >= fee;

      items.push({
        invitation: inv,
        memberId: mid,
        member: mem,
        source: "waiting",
        fee,
        walletMember: wallet,
        availableCredit: wallet.credit,
        bypassesCredit,
        hasSufficientCredit,
      });
    }

    for (const inv of grouped.yetToAccept) {
      const mid = inv.memberId;
      if (typeof mid === "string" && mid.startsWith("guest_")) continue;
      if (mid === outgoingMid || acceptedMemberIds.has(mid) || seenMemberIds.has(mid)) continue;
      const mem = s.members.find((m) => m.id === mid);
      if (!mem || mem.status !== "active" || !mem.membership) continue;
      seenMemberIds.add(mid);

      const fee = getMemberFee(mid);
      const wallet = mem.parentMemberId ? s.members.find((m) => m.id === mem.parentMemberId) || mem : mem;
      const skipsLeague = memberSkipsLeagueFee(mid);
      const bypassesCredit = !!wallet.skipCreditConsumption || skipsLeague;
      const hasSufficientCredit = bypassesCredit || fee <= 0 || wallet.credit >= fee;

      items.push({
        invitation: inv,
        memberId: mid,
        member: mem,
        source: "yetToAccept",
        fee,
        walletMember: wallet,
        availableCredit: wallet.credit,
        bypassesCredit,
        hasSufficientCredit,
      });
    }

    return items;
  }, [outgoingMid, grouped.accepted, grouped.waiting, grouped.yetToAccept, s.members]);

  const filteredCandidates = useMemo(() => {
    return replacementCandidates.filter((cand) => {
      if (replaceFilter === "waiting" && cand.source !== "waiting") return false;
      if (replaceFilter === "yetToAccept" && cand.source !== "yetToAccept") return false;
      if (replaceSearch.trim()) {
        const q = replaceSearch.toLowerCase().trim();
        const name = cand.member ? `${cand.member.firstName} ${cand.member.lastName}`.toLowerCase() : "";
        const email = cand.member?.email?.toLowerCase() || "";
        const grade = cand.member?.grade?.toLowerCase() || "";
        if (!name.includes(q) && !email.includes(q) && !grade.includes(q)) return false;
      }
      return true;
    });
  }, [replacementCandidates, replaceFilter, replaceSearch]);

  const selectedCandidate = useMemo(() => {
    return replacementCandidates.find((c) => c.memberId === selectedReplacementId) || null;
  }, [replacementCandidates, selectedReplacementId]);

  const outgoingFee = outgoingMid ? getMemberFee(outgoingMid) : 0;

  const executeReplacement = async () => {
    if (!outgoingMid || !selectedReplacementId) return;
    setReplacing(true);
    try {
      const res = await s.replacePlayPlayer(sch.id, outgoingMid, selectedReplacementId);
      toast.success(res.message || "Player replaced successfully");
      setConfirmReplaceOpen(false);
      setReplaceDialogOpen(false);
      setOutgoingMid(null);
      setSelectedReplacementId(null);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to replace player");
    } finally {
      setReplacing(false);
    }
  };

  const runGenerateRotation = async () => {
    setRotating(true);
    try {
      await s.generateRotation(sch.id);
      toast.success(
        guestNeeded > 0
          ? `Rotation generated with ${guestNeeded} guest player${guestNeeded === 1 ? "" : "s"}`
          : "Rotation generated & fees deducted",
      );
      setRotateConfirmOpen(false);
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "Failed to generate rotation.");
      throw error;
    } finally {
      setRotating(false);
    }
  };

  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelling, setCancelling] = useState(false);

  const handleCancelSession = async () => {
    if (!cancelReason.trim()) return;
    setCancelling(true);
    try {
      await s.cancelSchedule(sch.id, cancelReason.trim());
      toast.success("Session cancelled and member fees refunded.");
      setCancelDialogOpen(false);
      setCancelReason("");
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "Failed to cancel session.");
    } finally {
      setCancelling(false);
    }
  };

  const onGenerateClick = () => {
    if (underCapacity) {
      setRotateConfirmOpen(true);
      return;
    }
    setActionRequest({
      title: "Generate court rotation?",
      description: (
        <>
          <span className="block">
            Generate court rotations for <strong className="text-[#F1F0EE]">“{sch.name}”</strong>?
          </span>
          <span className="block text-[#8A8A98]">
            {realAccepted.length} accepted player{realAccepted.length === 1 ? "" : "s"} will be
            assigned to courts. After this, members can no longer accept or decline.
          </span>
        </>
      ),
      confirmLabel: "Generate rotation",
      onConfirm: async () => {
        await runGenerateRotation();
      },
    });
  };

  const requestPublish = () => {
    setActionRequest({
      title: "Publish court rotation?",
      description: (
        <>
          <span className="block">
            Publish court assignments for <strong className="text-[#F1F0EE]">“{sch.name}”</strong>{" "}
            to members?
          </span>
          <span className="block text-[#8A8A98]">
            Members will be able to view court details from Events.
          </span>
        </>
      ),
      confirmLabel: "Publish to members",
      onConfirm: async () => {
        try {
          await s.publishSchedule(sch.id);
          toast.success("Court rotation published to members");
        } catch (error: unknown) {
          toast.error(error instanceof Error ? error.message : "Failed to publish rotation.");
          throw error;
        }
      },
    });
  };

  const requestClose = () => {
    setActionRequest({
      title: "Close session?",
      description: (
        <>
          <span className="block">
            Close <strong className="text-[#F1F0EE]">“{sch.name}”</strong>?
          </span>
          <span className="block text-[#8A8A98]">
            The session will be marked closed. This cannot be undone from the list.
          </span>
        </>
      ),
      confirmLabel: "Close session",
      destructive: true,
      onConfirm: async () => {
        try {
          await s.closeSchedule(sch.id);
          toast.success("Schedule closed");
        } catch (error: unknown) {
          toast.error(error instanceof Error ? error.message : "Failed to close schedule.");
          throw error;
        }
      },
    });
  };

  const canRevertRotation =
    isAdmin && !!rot && (sch.status === "rotated" || sch.status === "published");

  const runRevertRotation = async () => {
    setReverting(true);
    try {
      await s.revertRotation(sch.id);
      setEditingRotation(false);
      setDraftRounds(null);
      setRevertConfirmOpen(false);
      toast.success("Court rotation reverted. You can generate a new one.");
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "Failed to revert rotation.");
    } finally {
      setReverting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Replace Player Selection Dialog */}
      <Dialog
        open={replaceDialogOpen && !confirmReplaceOpen}
        onOpenChange={(open) => {
          if (!open) {
            setReplaceDialogOpen(false);
            setOutgoingMid(null);
            setSelectedReplacementId(null);
          }
        }}
      >
        <DialogContent className="bg-white dark:bg-[#131916] text-gray-900 dark:text-[#EEF2F0] border border-gray-200 dark:border-white/10 sm:max-w-xl max-h-[90dvh] flex flex-col p-4 sm:p-5 gap-0 overflow-hidden shadow-2xl rounded-2xl">
          {/* Header */}
          <DialogHeader className="shrink-0 pb-3 text-left">
            <div className="flex items-center gap-2.5">
              <div className="size-8 rounded-lg bg-blue-50 dark:bg-[#2DD4BF]/10 border border-blue-200 dark:border-[#2DD4BF]/20 flex items-center justify-center shrink-0 text-blue-600 dark:text-[#2DD4BF]">
                <ArrowLeftRight className="size-4" />
              </div>
              <div>
                <DialogTitle className="text-base sm:text-lg font-bold text-gray-900 dark:text-[#EEF2F0] tracking-tight">
                  Replace Player
                </DialogTitle>
                <DialogDescription className="text-xs text-gray-500 dark:text-[#8FA89F]">
                  Select an eligible member from the Waiting List or Yet to Accept.
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          {/* Outgoing player summary */}
          <div className="shrink-0 mb-3 rounded-xl border border-rose-200 dark:border-rose-500/20 bg-rose-50/60 dark:bg-rose-500/10 p-3 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="size-8 rounded-full bg-rose-100 dark:bg-rose-500/20 border border-rose-200 dark:border-rose-500/30 flex items-center justify-center shrink-0 text-rose-600 dark:text-rose-400">
                <UserMinus className="size-4" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-[10px] uppercase font-mono tracking-wider text-rose-700 dark:text-rose-400 font-bold">
                    Outgoing (Accepted)
                  </span>
                  {outgoingMid && memberGrade(outgoingMid) && (
                    <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-white dark:bg-white/5 border border-gray-200 dark:border-white/10 text-gray-700 dark:text-[#C4D4CF]">
                      {memberGrade(outgoingMid)}
                    </span>
                  )}
                </div>
                <div className="font-bold text-sm text-gray-900 dark:text-[#EEF2F0] truncate mt-0.5">
                  {outgoingMid ? memberName(outgoingMid) : ""}
                </div>
              </div>
            </div>
            <div className="flex sm:flex-col items-center sm:items-end justify-between sm:justify-center border-t sm:border-t-0 border-rose-200/60 dark:border-white/5 pt-2 sm:pt-0 shrink-0">
              <span className="font-mono text-xs font-bold text-emerald-700 dark:text-emerald-400">
                Full Refund: +{fmtMoney(outgoingFee)}
              </span>
              <span className="text-gray-500 dark:text-[#8FA89F] text-[10px]">Moves to Yet to Accept</span>
            </div>
          </div>

          {/* Search & List Filter */}
          <div className="shrink-0 flex flex-col sm:flex-row items-stretch sm:items-center gap-2 mb-2.5">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-gray-400 dark:text-[#8FA89F]" />
              <Input
                placeholder="Search by name, grade, or email..."
                value={replaceSearch}
                onChange={(e) => setReplaceSearch(e.target.value)}
                className="pl-8 pr-7 bg-gray-50 dark:bg-[#0A0D0C] border-gray-200 dark:border-white/15 focus-visible:border-blue-500 dark:focus-visible:border-[#2DD4BF]/60 focus-visible:ring-1 focus-visible:ring-blue-500/20 dark:focus-visible:ring-[#2DD4BF]/30 text-xs h-9 text-gray-900 dark:text-[#EEF2F0] placeholder:text-gray-400 dark:placeholder:text-[#6B8580] rounded-lg"
              />
              {replaceSearch && (
                <button
                  type="button"
                  onClick={() => setReplaceSearch("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 rounded text-gray-400 hover:text-gray-700 dark:text-[#8FA89F] dark:hover:text-[#EEF2F0] hover:bg-gray-200 dark:hover:bg-white/10 transition-colors cursor-pointer"
                  title="Clear search"
                >
                  <X className="size-3.5" />
                </button>
              )}
            </div>
            <div className="flex items-center gap-1 bg-gray-100 dark:bg-[#0A0D0C] p-1 rounded-lg border border-gray-200 dark:border-white/10 shrink-0">
              <button
                type="button"
                onClick={() => setReplaceFilter("all")}
                className={cn(
                  "px-2.5 py-1 text-[11px] rounded-md transition-all font-medium cursor-pointer flex items-center gap-1.5",
                  replaceFilter === "all"
                    ? "bg-white dark:bg-white/10 text-gray-900 dark:text-[#EEF2F0] shadow-sm font-semibold border border-gray-200/80 dark:border-white/10"
                    : "text-gray-600 dark:text-[#8FA89F] hover:text-gray-900 dark:hover:text-[#EEF2F0] hover:bg-gray-200/50 dark:hover:bg-white/[0.04]"
                )}
              >
                <span>All</span>
                <span
                  className={cn(
                    "px-1.5 py-0.2 text-[10px] rounded-full font-mono",
                    replaceFilter === "all"
                      ? "bg-gray-100 dark:bg-white/15 text-gray-800 dark:text-[#EEF2F0]"
                      : "bg-gray-200/70 dark:bg-white/5 text-gray-600 dark:text-[#8FA89F]"
                  )}
                >
                  {replacementCandidates.length}
                </span>
              </button>
              <button
                type="button"
                onClick={() => setReplaceFilter("waiting")}
                className={cn(
                  "px-2.5 py-1 text-[11px] rounded-md transition-all font-medium cursor-pointer flex items-center gap-1.5",
                  replaceFilter === "waiting"
                    ? "bg-amber-100 dark:bg-amber-500/20 text-amber-900 dark:text-amber-300 shadow-sm font-semibold border border-amber-300 dark:border-amber-500/30"
                    : "text-gray-600 dark:text-[#8FA89F] hover:text-amber-800 dark:hover:text-amber-300 hover:bg-amber-50 dark:hover:bg-white/[0.04]"
                )}
              >
                <span>Waiting</span>
                <span
                  className={cn(
                    "px-1.5 py-0.2 text-[10px] rounded-full font-mono",
                    replaceFilter === "waiting"
                      ? "bg-amber-200 dark:bg-amber-500/30 text-amber-900 dark:text-amber-200"
                      : "bg-amber-100/80 dark:bg-amber-500/10 text-amber-800 dark:text-amber-400"
                  )}
                >
                  {replacementCandidates.filter((c) => c.source === "waiting").length}
                </span>
              </button>
              <button
                type="button"
                onClick={() => setReplaceFilter("yetToAccept")}
                className={cn(
                  "px-2.5 py-1 text-[11px] rounded-md transition-all font-medium cursor-pointer flex items-center gap-1.5",
                  replaceFilter === "yetToAccept"
                    ? "bg-emerald-100 dark:bg-emerald-500/20 text-emerald-900 dark:text-emerald-300 shadow-sm font-semibold border border-emerald-300 dark:border-emerald-500/30"
                    : "text-gray-600 dark:text-[#8FA89F] hover:text-emerald-800 dark:hover:text-emerald-300 hover:bg-emerald-50 dark:hover:bg-white/[0.04]"
                )}
              >
                <span>Yet to Accept</span>
                <span
                  className={cn(
                    "px-1.5 py-0.2 text-[10px] rounded-full font-mono",
                    replaceFilter === "yetToAccept"
                      ? "bg-emerald-200 dark:bg-emerald-500/30 text-emerald-900 dark:text-emerald-200"
                      : "bg-emerald-100/80 dark:bg-emerald-500/10 text-emerald-800 dark:text-emerald-400"
                  )}
                >
                  {replacementCandidates.filter((c) => c.source === "yetToAccept").length}
                </span>
              </button>
            </div>
          </div>

          {/* Candidates list */}
          <div className="flex-1 min-h-[140px] max-h-[220px] sm:max-h-[250px] overflow-y-auto space-y-1.5 pr-1 border border-gray-200 dark:border-white/10 rounded-xl p-2 bg-gray-50/70 dark:bg-[#0A0D0C]/80">
            {filteredCandidates.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-center px-4">
                <AlertCircle className="size-6 text-gray-400 dark:text-[#8FA89F] mb-2 opacity-60" />
                <p className="text-xs font-semibold text-gray-600 dark:text-[#C4D4CF]">
                  {replacementCandidates.length === 0
                    ? "No eligible replacement members found."
                    : "No members match your search or filter."}
                </p>
                {replacementCandidates.length > 0 && (replaceSearch || replaceFilter !== "all") && (
                  <button
                    type="button"
                    onClick={() => {
                      setReplaceSearch("");
                      setReplaceFilter("all");
                    }}
                    className="mt-2 text-xs text-blue-600 dark:text-[#2DD4BF] font-medium hover:underline cursor-pointer"
                  >
                    Reset filters and search
                  </button>
                )}
              </div>
            ) : (
              filteredCandidates.map((cand) => {
                const isSelected = selectedReplacementId === cand.memberId;
                return (
                  <div
                    key={cand.memberId}
                    role="button"
                    tabIndex={0}
                    onClick={() => setSelectedReplacementId(cand.memberId)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        setSelectedReplacementId(cand.memberId);
                      }
                    }}
                    className={cn(
                      "p-2.5 rounded-lg border cursor-pointer transition-all duration-150 flex items-center justify-between text-xs gap-3 group focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:focus-visible:ring-[#2DD4BF]",
                      isSelected
                        ? "bg-blue-50/90 dark:bg-blue-950/30 border-blue-400 dark:border-blue-500/50 ring-1 ring-blue-300 dark:ring-blue-500/30 text-gray-900 dark:text-[#EEF2F0] shadow-sm"
                        : "bg-white dark:bg-[#131916]/60 border-gray-200 dark:border-white/8 text-gray-800 dark:text-[#C4D4CF] hover:bg-blue-50/30 hover:border-blue-200 dark:hover:bg-white/[0.04] dark:hover:border-white/15"
                    )}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div
                        className={cn(
                          "size-4 rounded-full border flex items-center justify-center shrink-0 transition-colors",
                          isSelected
                            ? "border-blue-600 bg-blue-600 text-white dark:border-[#2DD4BF] dark:bg-[#2DD4BF] dark:text-[#0C0F0E]"
                            : "border-gray-300 bg-white group-hover:border-gray-400 dark:border-white/20 dark:bg-[#0A0D0C] dark:group-hover:border-white/40"
                        )}
                      >
                        {isSelected && <Check className="size-2.5 stroke-[3]" />}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span
                            className={cn(
                              "font-bold truncate text-xs sm:text-sm",
                              isSelected ? "text-blue-950 dark:text-[#EEF2F0]" : "text-gray-900 dark:text-[#EEF2F0]/90"
                            )}
                          >
                            {cand.member ? `${cand.member.firstName} ${cand.member.lastName}` : cand.memberId}
                          </span>
                          {cand.member?.grade && (
                            <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-gray-100 dark:bg-white/5 text-gray-700 dark:text-[#C4D4CF] border border-gray-200 dark:border-white/10">
                              {cand.member.grade}
                            </span>
                          )}
                          <span
                            className={cn(
                              "text-[10px] font-semibold px-2 py-0.5 rounded-full border inline-flex items-center gap-1",
                              cand.source === "waiting"
                                ? "bg-amber-50 text-amber-800 border-amber-200/80 dark:bg-amber-500/10 dark:text-amber-300 dark:border-amber-500/25"
                                : "bg-emerald-50 text-emerald-800 border-emerald-200/80 dark:bg-emerald-500/10 dark:text-emerald-300 dark:border-emerald-500/25"
                            )}
                          >
                            <span
                              className={cn(
                                "size-1.5 rounded-full shrink-0",
                                cand.source === "waiting" ? "bg-amber-500 dark:bg-amber-400" : "bg-emerald-500 dark:bg-emerald-400"
                              )}
                            />
                            {cand.source === "waiting" ? "Waiting List" : "Yet to Accept"}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <span className="font-mono text-xs font-bold text-emerald-700 dark:text-[#34D399] block">
                        {fmtMoney(cand.fee)}
                      </span>
                      <span
                        className={cn(
                          "text-[10px] font-mono block",
                          cand.bypassesCredit
                            ? "text-gray-500 dark:text-[#8FA89F]"
                            : cand.hasSufficientCredit
                            ? "text-gray-500 dark:text-[#8FA89F]"
                            : "text-rose-600 dark:text-rose-400 font-bold"
                        )}
                      >
                        {cand.bypassesCredit ? (
                          "Bypassed"
                        ) : (
                          <>
                            Bal:{" "}
                            <span className={cand.hasSufficientCredit ? "text-gray-900 dark:text-[#C4D4CF] font-semibold" : "text-rose-600 dark:text-rose-400"}>
                              {fmtMoney(cand.availableCredit)}
                            </span>
                            {!cand.hasSufficientCredit && " (Low)"}
                          </>
                        )}
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Selected Candidate Details Panel */}
          {selectedCandidate && (
            <div className="shrink-0 mt-3 rounded-xl border border-blue-200 dark:border-white/10 bg-blue-50/40 dark:bg-[#0C100E] p-2.5 sm:p-3 space-y-2 border-l-4 border-l-blue-600 dark:border-l-[#2DD4BF] text-xs shadow-sm">
              <div className="flex justify-between items-center gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-[10px] uppercase font-mono tracking-wider text-blue-700 dark:text-[#8FA89F] font-bold">
                    Selected Replacement:
                  </span>
                  <h4 className="font-bold text-xs sm:text-sm text-gray-900 dark:text-[#EEF2F0] truncate">
                    {selectedCandidate.member
                      ? `${selectedCandidate.member.firstName} ${selectedCandidate.member.lastName}`
                      : ""}
                  </h4>
                  {selectedCandidate.member?.grade && (
                    <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-white dark:bg-white/5 text-gray-700 dark:text-[#C4D4CF] border border-gray-200 dark:border-white/10">
                      {selectedCandidate.member.grade}
                    </span>
                  )}
                </div>
                <span
                  className={cn(
                    "text-[10px] font-semibold px-2 py-0.5 rounded-full border shrink-0 inline-flex items-center gap-1",
                    selectedCandidate.source === "waiting"
                      ? "bg-amber-50 text-amber-800 border-amber-200/80 dark:bg-amber-500/10 dark:text-amber-300 dark:border-amber-500/25"
                      : "bg-emerald-50 text-emerald-800 border-emerald-200/80 dark:bg-emerald-500/10 dark:text-emerald-300 dark:border-emerald-500/25"
                  )}
                >
                  <span
                    className={cn(
                      "size-1.5 rounded-full shrink-0",
                      selectedCandidate.source === "waiting" ? "bg-amber-500 dark:bg-amber-400" : "bg-emerald-500 dark:bg-emerald-400"
                    )}
                  />
                  {selectedCandidate.source === "waiting" ? "Waiting List" : "Yet to Accept"}
                </span>
              </div>

              <div className="grid grid-cols-3 gap-2 py-2 px-2.5 rounded-lg bg-white dark:bg-[#0A0D0C] border border-blue-100 dark:border-white/5 text-xs shadow-xs">
                <div>
                  <span className="text-gray-500 dark:text-[#8FA89F] block text-[10px] uppercase font-semibold font-mono">Session Fee</span>
                  <span className="font-mono text-xs sm:text-sm font-bold text-emerald-700 dark:text-[#34D399]">
                    {fmtMoney(selectedCandidate.fee)}
                  </span>
                </div>
                <div>
                  <span className="text-gray-500 dark:text-[#8FA89F] block text-[10px] uppercase font-semibold font-mono">Available Credit</span>
                  <span
                    className={cn(
                      "font-mono text-xs sm:text-sm font-bold",
                      selectedCandidate.hasSufficientCredit ? "text-gray-900 dark:text-[#EEF2F0]" : "text-rose-600 dark:text-rose-400"
                    )}
                  >
                    {selectedCandidate.bypassesCredit ? "Bypassed" : fmtMoney(selectedCandidate.availableCredit)}
                  </span>
                </div>
                <div>
                  <span className="text-gray-500 dark:text-[#8FA89F] block text-[10px] uppercase font-semibold font-mono">After Replacement</span>
                  <span
                    className={cn(
                      "font-mono text-xs sm:text-sm font-bold",
                      selectedCandidate.bypassesCredit
                        ? "text-gray-700 dark:text-[#8FA89F]"
                        : selectedCandidate.hasSufficientCredit
                        ? "text-gray-800 dark:text-[#C4D4CF]"
                        : "text-rose-600 dark:text-rose-400"
                    )}
                  >
                    {selectedCandidate.bypassesCredit
                      ? "Unlimited"
                      : selectedCandidate.hasSufficientCredit
                      ? fmtMoney(selectedCandidate.availableCredit - selectedCandidate.fee)
                      : `-${fmtMoney(selectedCandidate.fee - selectedCandidate.availableCredit)}`}
                  </span>
                </div>
              </div>

              {selectedCandidate.walletMember && selectedCandidate.walletMember.id !== selectedCandidate.member?.id && (
                <p className="text-[11px] text-gray-600 dark:text-[#8FA89F] truncate">
                  Using parent wallet: <strong className="text-gray-900 dark:text-[#C4D4CF]">{selectedCandidate.walletMember.firstName} {selectedCandidate.walletMember.lastName}</strong>
                </p>
              )}

              {!selectedCandidate.hasSufficientCredit && (
                <div className="p-2.5 rounded-lg bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/25 text-rose-800 dark:text-rose-300 text-xs flex items-center gap-2 font-medium">
                  <AlertTriangle className="size-4 shrink-0 text-rose-600 dark:text-rose-400" />
                  <span className="leading-tight">
                    Insufficient credits: Needs <strong className="font-mono text-rose-900 dark:text-rose-200">{fmtMoney(selectedCandidate.fee)}</strong>, but only <strong className="font-mono text-rose-900 dark:text-rose-200">{fmtMoney(selectedCandidate.availableCredit)}</strong> is available. Replacement cannot proceed.
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Footer */}
          <DialogFooter className="shrink-0 gap-2 sm:gap-2 pt-3 border-t border-gray-200 dark:border-white/10 mt-3 flex flex-row justify-end items-center">
            <Button
              type="button"
              variant="outline"
              className="border border-gray-300 dark:border-white/15 bg-white dark:bg-transparent text-gray-700 dark:text-[#8FA89F] hover:bg-gray-100 dark:hover:bg-white/5 cursor-pointer text-xs h-9 px-4 font-semibold rounded-lg"
              onClick={() => {
                setReplaceDialogOpen(false);
                setOutgoingMid(null);
                setSelectedReplacementId(null);
              }}
            >
              Cancel
            </Button>
            <Button
              type="button"
              className="btn-premium-solid cursor-pointer text-xs font-semibold h-9 px-4 flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={!selectedCandidate || !selectedCandidate.hasSufficientCredit}
              onClick={() => setConfirmReplaceOpen(true)}
            >
              <span>Continue to Confirm</span>
              <ArrowRight className="size-3.5" />
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirmation Dialog */}
      <AlertDialog open={confirmReplaceOpen} onOpenChange={setConfirmReplaceOpen}>
        <AlertDialogContent className="bg-white dark:bg-[#131916] text-gray-900 dark:text-[#EEF2F0] border border-gray-200 dark:border-white/10 sm:max-w-lg p-5 z-[60] shadow-2xl rounded-2xl">
          <AlertDialogHeader>
            <div className="flex items-center gap-2.5 text-blue-600 dark:text-[#2DD4BF]">
              <div className="size-9 rounded-xl bg-blue-50 dark:bg-[#2DD4BF]/10 border border-blue-200 dark:border-[#2DD4BF]/20 flex items-center justify-center shrink-0">
                <ArrowLeftRight className="size-4.5" />
              </div>
              <div>
                <AlertDialogTitle className="text-base sm:text-lg font-bold text-gray-900 dark:text-[#EEF2F0]">
                  Confirm Player Replacement
                </AlertDialogTitle>
                <p className="text-xs text-gray-500 dark:text-[#8FA89F]">Review financial adjustments and roster changes</p>
              </div>
            </div>
            <AlertDialogDescription asChild>
              <div className="space-y-3 pt-2 text-xs text-gray-700 dark:text-[#C4D4CF]">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {/* Outgoing player box */}
                  <div className="rounded-xl border border-rose-200 dark:border-white/10 bg-rose-50/50 dark:bg-[#0C100E] p-3.5 space-y-1.5 text-left shadow-xs">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] uppercase font-mono tracking-wider text-rose-700 dark:text-rose-400 font-bold flex items-center gap-1">
                        <UserMinus className="size-3" /> Outgoing
                      </span>
                      <span className="text-[10px] font-semibold text-rose-700 dark:text-rose-300 bg-rose-100 dark:bg-rose-500/20 px-2 py-0.5 rounded-full">Yet to Accept</span>
                    </div>
                    <div className="font-bold text-sm text-gray-900 dark:text-[#EEF2F0] truncate">
                      {outgoingMid ? memberName(outgoingMid) : ""}
                    </div>
                    <div className="pt-2 border-t border-rose-200/80 dark:border-white/5 flex justify-between items-center text-xs">
                      <span className="text-gray-600 dark:text-[#8FA89F]">Full Refund:</span>
                      <span className="font-mono font-bold text-emerald-700 dark:text-emerald-400">
                        +{fmtMoney(outgoingFee)}
                      </span>
                    </div>
                    <p className="text-[10px] text-gray-500 dark:text-[#8FA89F]">Credited to wallet balance</p>
                  </div>

                  {/* Incoming player box */}
                  <div className="rounded-xl border border-blue-200 dark:border-white/10 bg-blue-50/50 dark:bg-[#0C100E] p-3.5 space-y-1.5 text-left shadow-xs">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] uppercase font-mono tracking-wider text-blue-700 dark:text-[#2DD4BF] font-bold flex items-center gap-1">
                        <UserPlus className="size-3" /> Incoming
                      </span>
                      <span className="text-[10px] font-semibold text-blue-700 dark:text-emerald-400 bg-blue-100 dark:bg-emerald-500/20 px-2 py-0.5 rounded-full">Accepted</span>
                    </div>
                    <div className="font-bold text-sm text-gray-900 dark:text-[#EEF2F0] truncate">
                      {selectedCandidate?.member
                        ? `${selectedCandidate.member.firstName} ${selectedCandidate.member.lastName}`
                        : ""}
                    </div>
                    <div className="pt-2 border-t border-blue-200/80 dark:border-white/5 flex justify-between items-center text-xs">
                      <span className="text-gray-600 dark:text-[#8FA89F]">Session Debit:</span>
                      <span className="font-mono font-bold text-blue-700 dark:text-[#34D399]">
                        {selectedCandidate ? fmtMoney(selectedCandidate.fee) : "$0.00"}
                      </span>
                    </div>
                    <p className="text-[10px] text-gray-500 dark:text-[#8FA89F]">
                      Debited from wallet ({selectedCandidate?.bypassesCredit ? "Bypassed" : `Bal: ${fmtMoney(selectedCandidate?.availableCredit ?? 0)}`})
                    </p>
                  </div>
                </div>

                <div className="rounded-lg bg-gray-50 dark:bg-white/[0.02] border border-gray-200 dark:border-white/5 p-3 space-y-1.5 text-xs text-gray-600 dark:text-[#8FA89F] text-left">
                  <p className="flex items-start gap-1.5">
                    <Check className="size-3.5 text-blue-600 dark:text-[#2DD4BF] shrink-0 mt-0.5" />
                    <span>Court rotation matchups and slots will be updated in-place with the replacement player.</span>
                  </p>
                  <p className="flex items-start gap-1.5">
                    <Check className="size-3.5 text-blue-600 dark:text-[#2DD4BF] shrink-0 mt-0.5" />
                    <span>Original schedule capacity is maintained ({sch.players} players).</span>
                  </p>
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2 sm:gap-2 pt-3 border-t border-gray-200 dark:border-white/10 mt-3 flex flex-row justify-end items-center">
            <AlertDialogCancel
              className="border border-gray-300 dark:border-white/15 bg-white dark:bg-transparent text-gray-700 dark:text-[#8FA89F] hover:bg-gray-100 dark:hover:bg-white/5 cursor-pointer text-xs h-9 px-4 font-semibold rounded-lg mt-0"
              disabled={replacing}
              onClick={() => setConfirmReplaceOpen(false)}
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              className="btn-premium-solid cursor-pointer text-xs font-semibold h-9 px-5 disabled:opacity-50"
              disabled={replacing}
              onClick={(e) => {
                e.preventDefault();
                void executeReplacement();
              }}
            >
              {replacing ? "Processing replacement…" : "Confirm Replacement"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={rotateConfirmOpen} onOpenChange={setRotateConfirmOpen}>
        <AlertDialogContent className="bg-[#131916] border-[rgba(255,255,255,0.10)] text-[#F1F0EE]">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-[#F1F0EE]">
              Accepted players are less than Max Players
            </AlertDialogTitle>
            <AlertDialogDescription className="text-[#C4D4CF] space-y-2">
              <span className="block">
                Only <strong className="text-[#F1F0EE]">{realAccepted.length}</strong> of{" "}
                <strong className="text-[#F1F0EE]">{sch.players}</strong> max players have accepted.
              </span>
              <span className="block">
                <strong className="text-[#F59E0B]">
                  {guestNeeded} guest player{guestNeeded === 1 ? "" : "s"}
                </strong>{" "}
                will be added to fill the remaining seats, then the rotation will be generated.
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2 sm:gap-2">
            <AlertDialogCancel className="btn-premium-outline cursor-pointer" disabled={rotating}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              className="btn-premium-solid cursor-pointer"
              disabled={rotating}
              onClick={(e) => {
                e.preventDefault();
                void runGenerateRotation();
              }}
            >
              {rotating ? "Generating…" : "Add guests & generate"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={revertConfirmOpen} onOpenChange={setRevertConfirmOpen}>
        <AlertDialogContent className="bg-[#131916] border-[rgba(255,255,255,0.10)] text-[#F1F0EE]">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-[#F1F0EE]">Revert court rotation?</AlertDialogTitle>
            <AlertDialogDescription className="text-[#C4D4CF] space-y-2">
              <span className="block">
                This removes the current court assignments
                {sch.status === "published" ? " and hides them from members" : ""}. The session
                returns to <strong className="text-[#F1F0EE]">Released</strong> so you can generate
                a new rotation.
              </span>
              <span className="block">Accepted players and session fees are kept.</span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2 sm:gap-2">
            <AlertDialogCancel className="btn-premium-outline cursor-pointer" disabled={reverting}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-[#EF4444] hover:bg-[#DC2626] text-white cursor-pointer"
              disabled={reverting}
              onClick={(e) => {
                e.preventDefault();
                void runRevertRotation();
              }}
            >
              {reverting ? "Reverting…" : "Revert rotation"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <ConfirmActionDialog
        request={actionRequest}
        onOpenChange={(open) => !open && setActionRequest(null)}
      />

      <PageHeader
        title={sch.name}
        description={`${fmtDateTime(sch.date)} · ${sch.location} · Session Rate: ${fmtMoney(sch.sessionRate)} · Capacity: ${sch.players} players`}
        backTo="/schedules"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={sch.status} />
            {sch.status === "open" && (
              <Button
                className="btn-premium-solid h-9 px-4 text-xs font-semibold cursor-pointer w-full sm:w-auto"
                onClick={() => requestReleaseSchedule(sch)}
              >
                <Send className="size-3.5 mr-1" /> Release Session
              </Button>
            )}
            {sch.status === "released" && realAccepted.length > 0 && (
              <div className="flex flex-col items-stretch sm:items-end gap-1 w-full sm:w-auto">
                <Button
                  className="btn-premium-solid h-9 px-4 text-xs font-semibold cursor-pointer w-full sm:w-auto"
                  onClick={onGenerateClick}
                  disabled={rotating}
                >
                  <Shuffle className="size-3.5 mr-1" /> Generate rotation
                </Button>
                <p className="text-[10px] text-muted-foreground text-right max-w-[220px]">
                  Courts are grouped by similar grade strength.
                </p>
              </div>
            )}
            {sch.status === "rotated" && rot && (
              <Button
                className="btn-premium-solid h-9 px-4 text-xs font-semibold cursor-pointer w-full sm:w-auto"
                onClick={requestPublish}
              >
                <Send className="size-3.5 mr-1" /> Publish to members
              </Button>
            )}
            {sch.status !== "closed" && sch.status !== "cancelled" && (
              <>
                <Button
                  variant="outline"
                  className="btn-premium-outline h-9 px-4 text-xs cursor-pointer w-full sm:w-auto"
                  onClick={requestClose}
                >
                  Close Session
                </Button>
                <Button
                  variant="outline"
                  className="bg-[#EF4444]/10 text-[#EF4444] border-[#EF4444]/30 hover:bg-[#EF4444]/20 hover:text-white h-9 px-4 text-xs font-semibold cursor-pointer w-full sm:w-auto"
                  onClick={() => setCancelDialogOpen(true)}
                >
                  Cancel Session
                </Button>
              </>
            )}
          </div>
        }
      />

      <Dialog
        open={cancelDialogOpen}
        onOpenChange={(open) => {
          if (!open && !cancelling) {
            setCancelDialogOpen(false);
            setCancelReason("");
          }
        }}
      >
        <DialogContent className="bg-[#131916] border-[rgba(255,255,255,0.10)] text-[#F1F0EE] sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-[#F1F0EE]">Cancel Session</DialogTitle>
            <DialogDescription className="text-[#C4D4CF] text-xs">
              Enter a reason for cancelling <strong className="text-[#F1F0EE]">“{sch.name}”</strong>
              . Members will be notified and any paid fees will be refunded automatically.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label className="text-xs font-medium text-[#C4D4CF]">
              Reason <span className="text-red-400">*</span>
            </Label>
            <Textarea
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              placeholder="Enter cancellation reason (e.g. Coach unavailable, Court maintenance)..."
              rows={3}
              className="bg-[#1A2120] border-[rgba(255,255,255,0.1)] text-white text-xs placeholder:text-[#64748B] focus:border-[#EF4444]"
            />
            {!cancelReason.trim() && (
              <p className="text-[11px] text-red-400 font-light">
                Reason is required to cancel this session.
              </p>
            )}
          </div>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button
              variant="outline"
              className="btn-premium-outline cursor-pointer text-xs"
              disabled={cancelling}
              onClick={() => {
                setCancelDialogOpen(false);
                setCancelReason("");
              }}
            >
              Close
            </Button>
            <Button
              className="bg-[#EF4444] hover:bg-[#DC2626] text-white cursor-pointer text-xs font-semibold"
              disabled={!cancelReason.trim() || cancelling}
              onClick={() => void handleCancelSession()}
            >
              {cancelling ? "Cancelling…" : "Cancel Session"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {sch.status === "open" && (
        <div className="rounded-lg border border-[#34D399]/30 bg-[#34D399]/10 p-4 text-[#34D399] flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h4 className="font-semibold text-sm">Session Not Released Yet</h4>
            <p className="text-xs text-[#34D399]/90 font-light mt-0.5">
              Invitations and eligible members will be generated once you click{" "}
              <strong>Release Session</strong>.
            </p>
          </div>
          <Button
            size="sm"
            className="btn-premium-solid h-8 px-3 text-xs font-semibold cursor-pointer shrink-0"
            onClick={() => requestReleaseSchedule(sch)}
          >
            <Send className="size-3.5 mr-1" /> Release Session
          </Button>
        </div>
      )}

      {sch.status === "cancelled" && (
        <div className="rounded-lg border border-[#EF4444]/30 bg-[#EF4444]/10 p-4 text-[#EF4444] flex items-start gap-2.5">
          <AlertTriangle className="size-4 shrink-0 mt-0.5" />
          <div className="space-y-0.5">
            <h4 className="font-semibold text-sm">Session Cancelled</h4>
            <p className="text-xs text-[#EF4444]/90 font-light">
              <span className="font-semibold">Reason:</span>{" "}
              {sch.cancelReason || "No reason specified."}
            </p>
          </div>
        </div>
      )}

      <div className="admin-card-grid grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 mb-8">
        {columns.map((col) => (
          <Card key={col.key} className="bg-[#131916] border-[rgba(255,255,255,0.06)]">
            <CardHeader className="pb-3 border-b border-[rgba(255,255,255,0.04)]">
              <CardTitle className="text-[11px] font-medium tracking-[0.12em] text-[#8A8A98] uppercase flex items-center justify-between">
                <span>{col.label}</span>
                <span className={cn("font-mono text-xs", col.color)}>
                  ({grouped[col.key].length}
                  {col.key === "accepted" ? ` / ${sch.players}` : ""}
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-4 space-y-2.5 max-h-[280px] overflow-y-auto">
              {grouped[col.key].length === 0 ? (
                <p className="text-[13px] font-light text-[#4A5E58] py-3 text-center">
                  {sch.status === "open" ? "Session not released yet." : "No members listed."}
                </p>
              ) : (
                grouped[col.key].map((i, idx) => (
                  <div
                    key={i.id}
                    className="text-[13px] text-[#EEF2F0] py-2 border-b border-white/[0.03] last:border-0 font-semibold flex justify-between items-center gap-2"
                  >
                    <span className="truncate">
                      <span className="font-mono text-[10px] text-[#8A8A98] mr-2">{idx + 1}.</span>
                      <span
                        className={
                          typeof i.memberId === "string" && i.memberId.startsWith("guest_")
                            ? "text-[#D97706]"
                            : undefined
                        }
                      >
                        {memberName(i.memberId)}
                      </span>
                    </span>
                    <div className="flex items-center gap-2 shrink-0">
                      <span
                        className={cn(
                          "font-mono text-xs",
                          typeof i.memberId === "string" && i.memberId.startsWith("guest_")
                            ? "text-[#8A8A98]"
                            : "text-[#34D399]",
                        )}
                      >
                        {typeof i.memberId === "string" && i.memberId.startsWith("guest_")
                          ? "Guest"
                          : fmtMoney(getMemberFee(i.memberId))}
                      </span>
                      {col.key === "accepted" && isAdmin && !["closed", "cancelled"].includes(sch.status) && (
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="h-6 w-6 p-0 text-[#2DD4BF] hover:text-[#2DD4BF] hover:bg-[#2DD4BF]/10 cursor-pointer border border-[#2DD4BF]/20 rounded"
                          onClick={() => handleOpenReplace(i.memberId)}
                          title="Replace Player"
                          aria-label="Replace Player"
                        >
                          <ArrowLeftRight className="size-3.5" aria-hidden="true" />
                        </Button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {rot && (
        <div className="space-y-6">
          <div className="signature-divider !h-[1px] my-6" />
          <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
            <div>
              <span className="text-[11px] font-medium tracking-[0.14em] text-[#34D399] uppercase">
                COURT ROTATIONS & MATCHUPS
              </span>
              {sch.status === "rotated" && (
                <p className="text-[12px] text-[#8A8A98] mt-1">
                  Draft — members cannot see courts until you publish.
                </p>
              )}
              {sch.status === "published" && (
                <p className="text-[12px] text-[#8A8A98] mt-1">
                  Published — members can view courts from their invitations.
                </p>
              )}
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {canRevertRotation && !editingRotation && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="btn-premium-outline h-8 px-3 text-xs cursor-pointer"
                  onClick={() => setRevertConfirmOpen(true)}
                  disabled={reverting}
                >
                  <RotateCcw className="size-3.5 mr-1.5" />
                  Revert rotation
                </Button>
              )}
              {canEditRotation && !editingRotation && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="btn-premium-outline h-8 px-3 text-xs cursor-pointer"
                  onClick={startEditRotation}
                >
                  <Pencil className="size-3.5 mr-1.5" />
                  Edit rotation
                </Button>
              )}
              {editingRotation && (
                <>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="btn-premium-outline h-8 px-3 text-xs cursor-pointer"
                    onClick={cancelEditRotation}
                    disabled={savingRotation}
                  >
                    <X className="size-3.5 mr-1.5" />
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    className="btn-premium-solid h-8 px-3 text-xs cursor-pointer"
                    onClick={() => void saveEditRotation()}
                    disabled={savingRotation}
                  >
                    {savingRotation ? "Saving…" : "Save changes"}
                  </Button>
                </>
              )}
              {!editingRotation && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      className="btn-premium-outline h-8 px-3 text-xs cursor-pointer"
                    >
                      <Download className="size-3.5 mr-1.5" />
                      Export
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent
                    align="end"
                    className="bg-[#1A2120] border-[rgba(255,255,255,0.10)] text-[#F1F0EE]"
                  >
                    <DropdownMenuItem
                      className="cursor-pointer text-xs focus:bg-white/5"
                      onClick={() => {
                        downloadTextFile(
                          `${scheduleExportSlug(sch.name)}_court_rotation.csv`,
                          buildRotationCsv(sch, rot, memberName),
                          "text/csv;charset=utf-8",
                        );
                        toast.success("CSV downloaded");
                      }}
                    >
                      <FileSpreadsheet className="size-3.5 mr-2" />
                      Download CSV
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      className="cursor-pointer text-xs focus:bg-white/5"
                      onClick={async () => {
                        try {
                          await downloadRotationPdf(sch, rot, memberName, {
                            appName: s.appName,
                            appLogoText: s.appLogoText,
                            appLogoBase64: s.appLogoBase64,
                          });
                          toast.success("PDF downloaded");
                        } catch (error: unknown) {
                          toast.error(
                            error instanceof Error ? error.message : "Failed to create PDF.",
                          );
                        }
                      }}
                    >
                      <FileText className="size-3.5 mr-2" />
                      Download PDF
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
          </div>
          <CourtRotationView
            schedule={sch}
            rotation={rot}
            memberName={memberName}
            memberGrade={memberGrade}
            editing={editingRotation}
            draftRounds={draftRounds ?? undefined}
            onDraftRoundsChange={setDraftRounds}
            isAdmin={isAdmin}
          />
        </div>
      )}
    </div>
  );
}
