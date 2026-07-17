import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useState } from "react";
import { useCurrentUser, useStore } from "@/lib/store";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/StatusBadge";
import {
  CourtRotationView,
  cloneRounds,
  getCourtTimeRange,
  stripEmptySlots,
} from "@/components/CourtRotationView";
import { fmtDateTime } from "@/lib/format";
import { applyMemberFee, discountsFromStore, playSessionBaseFee } from "@/lib/fees";
import { toast } from "sonner";
import { Download, FileSpreadsheet, FileText, Pencil, Shuffle, Send, X, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";
import type { PlayInvitation, PlaySchedule, Rotation, RotationRound } from "@/lib/types";
import { jsPDF } from "jspdf";
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
        [
          String(r.round),
          `Court ${c.courtNo}`,
          time,
          ...players,
          resting,
        ]
          .map(csvEscape)
          .join(","),
      );
    }
    if (r.courts.length === 0 && r.resting.length > 0) {
      rows.push(
        [String(r.round), "", time, "", "", "", "", resting].map(csvEscape).join(","),
      );
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
        doc.text(`Court ${c.courtNo}`, x + 6, cy + 8);

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
      (s.playerPositionItems ?? [])
        .filter((p) => p.skipLeagueFee)
        .map((p) => p.name),
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
    } catch (error: any) {
      toast.error(error.message || "Failed to generate rotation.");
    } finally {
      setRotating(false);
    }
  };

  const onGenerateClick = () => {
    if (underCapacity) {
      setRotateConfirmOpen(true);
      return;
    }
    void runGenerateRotation();
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
                <strong className="text-[#F59E0B]">{guestNeeded} guest player{guestNeeded === 1 ? "" : "s"}</strong>{" "}
                will be added to fill the remaining seats, then the rotation will be generated.
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2 sm:gap-2">
            <AlertDialogCancel
              className="btn-premium-outline cursor-pointer"
              disabled={rotating}
            >
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

      <PageHeader
        title={sch.name}
        description={`${fmtDateTime(sch.date)} · ${sch.location} · Session Rate: $${sch.sessionRate.toFixed(2)} · Capacity: ${sch.players} players`}
        backTo="/schedules"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={sch.status} />
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
                onClick={async () => {
                  try {
                    await s.publishSchedule(sch.id);
                    toast.success("Court rotation published to members");
                  } catch (error: any) {
                    toast.error(error.message || "Failed to publish rotation.");
                  }
                }}
              >
                <Send className="size-3.5 mr-1" /> Publish to members
              </Button>
            )}
            {sch.status !== "closed" && (
              <Button
                variant="outline"
                className="btn-premium-outline h-9 px-4 text-xs cursor-pointer w-full sm:w-auto"
                onClick={async () => {
                  try {
                    await s.closeSchedule(sch.id);
                    toast.success("Schedule closed");
                  } catch (error: any) {
                    toast.error(error.message || "Failed to close schedule.");
                  }
                }}
              >
                Close Session
              </Button>
            )}
          </div>
        }
      />

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 mb-8">
        {columns.map((col) => (
          <Card key={col.key} className="bg-[#131916] border-[rgba(255,255,255,0.06)]">
            <CardHeader className="pb-3 border-b border-[rgba(255,255,255,0.04)]">
              <CardTitle className="text-[11px] font-medium tracking-[0.12em] text-[#8A8A98] uppercase flex items-center justify-between">
                <span>{col.label}</span>
                <span className={cn("font-mono text-xs", col.color)}>
                  ({grouped[col.key].length}
                  {col.key === "accepted" ? ` / ${sch.players}` : ""})
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-4 space-y-2.5 max-h-[280px] overflow-y-auto">
              {grouped[col.key].length === 0 ? (
                <p className="text-[13px] font-light text-[#4A5E58] py-3 text-center">No members listed.</p>
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
                    <span
                      className={cn(
                        "font-mono text-xs shrink-0",
                        typeof i.memberId === "string" && i.memberId.startsWith("guest_")
                          ? "text-[#8A8A98]"
                          : "text-[#34D399]",
                      )}
                    >
                      {typeof i.memberId === "string" && i.memberId.startsWith("guest_")
                        ? "Guest"
                        : `$${getMemberFee(i.memberId).toFixed(2)}`}
                    </span>
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
          />
        </div>
      )}
    </div>
  );
}
