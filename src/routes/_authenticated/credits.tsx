import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect, useMemo } from "react";
import { toast } from "sonner";
import { useCurrentUser, useStore } from "@/lib/store";
import type { CreditRequest } from "@/lib/types";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { StatusBadge } from "@/components/StatusBadge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { fmtDate, fmtMoney } from "@/lib/format";
import { Search, X, SlidersHorizontal, Calendar, Plus, Wallet, Clock3, CheckCircle2, CircleDollarSign, ArrowDownLeft, ArrowUpRight, Trash2, RotateCcw } from "lucide-react";
import { motion } from "framer-motion";
import { EmptyIllustration } from "@/components/EmptyIllustration";
import { AnimatedCounter } from "@/components/AnimatedCounter";
import { staggerContainer, staggerItem } from "@/components/MotionWrapper";
import { cn } from "@/lib/utils";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { MemberCombobox } from "@/components/MemberCombobox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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

type CreditsSearch = {
  memberId?: string;
};

type TypeTab = "all" | "debit" | "credit";
type EntryType = "credit" | "debit" | "refund";

export const Route = createFileRoute("/_authenticated/credits")({
  validateSearch: (search: Record<string, unknown>): CreditsSearch => {
    return {
      memberId: search.memberId as string | undefined,
    };
  },
  component: CreditsPage,
});

const STAT_ACCENTS = [
  { border: "var(--primary)", iconBg: "var(--violet-dim)", iconColor: "var(--primary)" },
  { border: "#F59E0B", iconBg: "rgba(245,158,11,0.12)", iconColor: "#F59E0B" },
  { border: "#10B981", iconBg: "rgba(16,185,129,0.12)", iconColor: "#34D399" },
  { border: "#818CF8", iconBg: "rgba(129,140,248,0.12)", iconColor: "#818CF8" },
];

function CreditStatCard({
  label,
  value,
  hint,
  icon: Icon,
  index,
  format,
}: {
  label: string;
  value: number;
  hint?: string;
  icon: typeof Wallet;
  index: number;
  format?: (n: number) => string;
}) {
  const accent = STAT_ACCENTS[index % STAT_ACCENTS.length];
  return (
    <motion.div variants={staggerItem} className="h-full">
      <Card
        className="signature-card-top h-full bg-[#131916] border-[rgba(255,255,255,0.06)]"
        style={{ borderTopColor: accent.border, borderTopWidth: 1, borderImage: "none" }}
      >
        <CardContent className="p-4 sm:p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[11px] font-semibold tracking-wider text-[#8FA89F] uppercase">{label}</p>
              <p className="type-stat-value mt-1.5 text-2xl sm:text-3xl">
                <AnimatedCounter value={value} format={format} />
              </p>
              {hint && <p className="text-[11px] text-[#6B7F78] mt-1">{hint}</p>}
            </div>
            <div
              className="size-9 sm:size-10 rounded-lg grid place-items-center shrink-0"
              style={{ background: accent.iconBg }}
            >
              <Icon className="size-4 sm:size-5" style={{ color: accent.iconColor }} />
            </div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}

function TypeBadge({ type }: { type: EntryType }) {
  const isCredit = type === "credit";
  const isRefund = type === "refund";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold uppercase tracking-wide",
        isCredit
          ? "bg-[#10B981]/12 text-[#34D399] border border-[#10B981]/25"
          : isRefund
            ? "bg-[#818CF8]/12 text-[#818CF8] border border-[#818CF8]/25"
            : "bg-[#EF4444]/12 text-[#F87171] border border-[#EF4444]/25",
      )}
    >
      {isCredit ? <ArrowDownLeft className="size-3" /> : isRefund ? <RotateCcw className="size-3" /> : <ArrowUpRight className="size-3" />}
      {isCredit ? "Credit" : isRefund ? "Refund" : "Debit"}
    </span>
  );
}

function CreditsPage() {
  const user = useCurrentUser()!;
  const s = useStore();
  const search = Route.useSearch();
  const isAdmin = user.role === "admin";
  // All members the current user can see
  const myMembers = isAdmin ? s.members : s.members.filter((m) => m.userId === user.id);
  // Adults-only list used for wallet pickers (juniors share the parent adult's wallet)
  const adultMembers = myMembers.filter((m) => m.memberType === "adult");

  const [typeTab, setTypeTab] = useState<TypeTab>("all");
  const [entryType, setEntryType] = useState<EntryType>("credit");
  const [addOpen, setAddOpen] = useState(false);
  const [memberId, setMemberId] = useState(() => search.memberId || (myMembers[0]?.id ?? ""));
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [reasonError, setReasonError] = useState<string | null>(null);
  const [selectedDebitDetail, setSelectedDebitDetail] = useState<CreditRequest | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<CreditRequest | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (search.memberId) {
      setMemberId(search.memberId);
    }
  }, [search.memberId]);

  const myReqs = s.creditRequests.filter((r) =>
    isAdmin ? true : myMembers.some((m) => m.id === r.memberId),
  );

  // When opened from Members → Credits, lock the page to that member only.
  const focusMember = search.memberId
    ? myMembers.find((m) => m.id === search.memberId) ||
      s.members.find((m) => m.id === search.memberId)
    : undefined;
  const isMemberScoped = Boolean(focusMember);

  // If focusMember is a junior, resolve the effective wallet member (parent)
  const walletMember = focusMember
    ? focusMember.memberType === "junior" && focusMember.parentMemberId
      ? s.members.find((m) => m.id === focusMember.parentMemberId) ?? focusMember
      : focusMember
    : undefined;

  const scopedReqs = focusMember ? myReqs.filter((r) => r.memberId === focusMember.id) : myReqs;
  // For the add dialog: if scoped to a junior, show its parent in the picker; otherwise show adults
  const addMembers = focusMember
    ? walletMember ? [walletMember] : [focusMember]
    : adultMembers;

  const tabReqs = useMemo(() => {
    if (typeTab === "all") return scopedReqs;
    if (typeTab === "credit") return scopedReqs.filter((r) => (r.type || "credit") === "credit" || r.type === "refund");
    return scopedReqs.filter((r) => (r.type || "credit") === typeTab);
  }, [scopedReqs, typeTab]);

  const stats = useMemo(() => {
    const pending = scopedReqs.filter((r) => (r.type === "credit" || !r.type) && r.status === "created").length;
    const approved = scopedReqs.filter((r) => r.status === "approved").length;
    const approvedTotal = scopedReqs
      .filter((r) => r.status === "approved" && (r.type || "credit") === "credit")
      .reduce((sum, r) => sum + r.amount, 0);
    // Balance: for a junior focusMember, show the parent (wallet) member's credit
    const balanceTotal = focusMember
      ? (walletMember?.credit ?? focusMember.credit ?? 0)
      : adultMembers.reduce((sum, m) => sum + (m.credit || 0), 0);
    return {
      total: tabReqs.length,
      pending,
      approved,
      approvedTotal,
      balanceTotal,
    };
  }, [scopedReqs, tabReqs, adultMembers, focusMember, walletMember]);

  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [sortBy, setSortBy] = useState("newest");
  const [showFilters, setShowFilters] = useState(false);

  const resetFilters = () => {
    setSearchTerm("");
    setStatusFilter("all");
    setFromDate("");
    setToDate("");
    setSortBy("newest");
  };

  const hasActiveFilters =
    searchTerm !== "" || statusFilter !== "all" || fromDate !== "" || toDate !== "" || sortBy !== "newest";

  const filteredReqs = useMemo(() => {
    return tabReqs
      .filter((r) => {
        if (searchTerm.trim()) {
          const m = s.members.find((x) => x.id === r.memberId);
          if (!m) return false;
          const fullName = `${m.firstName} ${m.lastName}`.toLowerCase();
          if (!fullName.includes(searchTerm.toLowerCase())) return false;
        }
        if (statusFilter !== "all" && r.status !== statusFilter) {
          return false;
        }
        if (fromDate) {
          const reqDate = new Date(r.date);
          const filterFrom = new Date(fromDate);
          reqDate.setHours(0, 0, 0, 0);
          filterFrom.setHours(0, 0, 0, 0);
          if (reqDate < filterFrom) return false;
        }
        if (toDate) {
          const reqDate = new Date(r.date);
          const filterTo = new Date(toDate);
          reqDate.setHours(0, 0, 0, 0);
          filterTo.setHours(0, 0, 0, 0);
          if (reqDate > filterTo) return false;
        }
        return true;
      })
      .sort((a, b) => {
        if (sortBy === "newest") {
          return new Date(b.date).getTime() - new Date(a.date).getTime();
        }
        if (sortBy === "oldest") {
          return new Date(a.date).getTime() - new Date(b.date).getTime();
        }
        if (sortBy === "amount_high") {
          return b.amount - a.amount;
        }
        if (sortBy === "amount_low") {
          return a.amount - b.amount;
        }
        return 0;
      });
  }, [tabReqs, s.members, searchTerm, statusFilter, fromDate, toDate, sortBy]);

  const openAddDialog = (type: EntryType) => {
    if (type === "debit" && !isAdmin) return;
    setEntryType(type);
    if (focusMember) {
      setMemberId(focusMember.id);
    } else if (!memberId && myMembers[0]) {
      setMemberId(myMembers[0].id);
    }
    setDate(new Date().toISOString().slice(0, 10));
    setReason("");
    setReasonError(null);
    setAddOpen(true);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const targetMemberId = focusMember?.id || memberId;
    if (!targetMemberId || !amount) return;

    if (entryType === "debit") {
      const trimmedReason = reason.trim();
      if (!trimmedReason) {
        setReasonError("Reason is required.");
        return;
      }
      if (trimmedReason.length < 5) {
        setReasonError("Reason must be at least 5 characters.");
        return;
      }
      if (trimmedReason.length > 500) {
        setReasonError("Reason must not exceed 500 characters.");
        return;
      }
    }

    setSubmitting(true);
    setReasonError(null);
    try {
      const trimmedReason = entryType === "debit" ? reason.trim() : undefined;
      await s.requestCredit(targetMemberId, parseFloat(amount), date, entryType, trimmedReason);
      if (entryType === "debit") {
        toast.success("Debit applied — member balance reduced");
      } else if (entryType === "refund") {
        toast.success("Refund applied — member balance credited");
      } else if (isAdmin) {
        toast.success("Credit added successfully");
      } else {
        toast.success("Credit request submitted for approval");
      }
      setAmount("");
      setReason("");
      setAddOpen(false);
    } catch (error: any) {
      if (error.response?.data?.errors?.reason?.[0]) {
        setReasonError(error.response.data.errors.reason[0]);
      } else if (error.response?.data?.message && error.response.data.message.includes("Reason")) {
        setReasonError(error.response.data.message);
      } else {
        toast.error(error.message || `Failed to submit ${entryType} request.`);
      }
    } finally {
      setSubmitting(false);
    }
  };

  const creditCount = scopedReqs.filter((r) => (r.type || "credit") === "credit" || r.type === "refund").length;
  const debitCount = scopedReqs.filter((r) => r.type === "debit").length;
  const colSpan = isAdmin ? 6 : 5;

  const historyTitle = focusMember
    ? `${focusMember.firstName} ${focusMember.lastName} — History`
    : typeTab === "debit"
      ? "Debit History"
      : typeTab === "credit"
        ? "Credit History"
        : "Wallet History";

  return (
    <div className="space-y-6">
      <PageHeader
        title={
          focusMember
            ? `${focusMember.firstName} ${focusMember.lastName}`
            : "Wallet"
        }
        description={
          focusMember
            ? focusMember.memberType === "junior" && walletMember && walletMember.id !== focusMember.id
              ? `Junior member — wallet shared with ${walletMember.firstName} ${walletMember.lastName}. Current balance ${fmtMoney(walletMember.credit || 0)}.`
              : `Wallet history for this member. Current balance ${fmtMoney(walletMember?.credit ?? focusMember.credit ?? 0)}.`
            : "Top-ups, debits, and balance management."
        }
        eyebrow={focusMember ? "FINANCE / MEMBER WALLET" : undefined}
        backTo={focusMember ? "/members" : undefined}
        actions={
          <div className="flex items-center gap-2 flex-wrap">
            {isAdmin && (typeTab === "debit" || typeTab === "all") && (
              <Button
                type="button"
                variant="outline"
                className="btn-premium-outline h-[38px] px-4 hover:cursor-pointer"
                onClick={() => openAddDialog("debit")}
                disabled={addMembers.length === 0}
              >
                <Plus className="size-4 mr-1.5" />
                Add debit
              </Button>
            )}
            {(typeTab === "credit" || typeTab === "all") && (
              <>
                <Button
                  type="button"
                  className="btn-premium-solid h-[38px] px-4 hover:cursor-pointer"
                  onClick={() => openAddDialog("credit")}
                  disabled={addMembers.length === 0}
                >
                  <Plus className="size-4 mr-1.5" />
                  {isAdmin ? "Add credit" : "Request credit"}
                </Button>
                {isAdmin && (
                  <Button
                    type="button"
                    variant="outline"
                    className="h-[38px] px-4 hover:cursor-pointer border-[#818CF8]/40 text-[#818CF8] hover:bg-[#818CF8]/10 hover:text-[#818CF8]"
                    onClick={() => openAddDialog("refund")}
                    disabled={addMembers.length === 0}
                  >
                    <RotateCcw className="size-4 mr-1.5" />
                    Add refund
                  </Button>
                )}
              </>
            )}
            {typeTab === "debit" && !isAdmin && (
              <span className="text-xs text-[#8A8A98]">Only admins can add debits</span>
            )}
          </div>
        }
      />

      <motion.div
        variants={staggerContainer}
        initial="hidden"
        animate="show"
        className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4"
      >
        <CreditStatCard
          label="Total"
          value={stats.total}
          hint={
            typeTab === "debit"
              ? "Debit entries"
              : typeTab === "credit"
                ? "Credit requests"
                : isMemberScoped
                  ? "Entries for this member"
                  : "All wallet entries"
          }
          icon={Wallet}
          index={0}
        />
        <CreditStatCard label="Pending" value={stats.pending} hint="Credit requests awaiting approval" icon={Clock3} index={1} />
        <CreditStatCard label="Approved" value={stats.approved} hint="Completed entries" icon={CheckCircle2} index={2} />
        <CreditStatCard
          label="Total Balance"
          value={stats.balanceTotal}
          hint={`${fmtMoney(stats.approvedTotal)} approved credits`}
          icon={CircleDollarSign}
          index={3}
          format={fmtMoney}
        />
      </motion.div>

      <Tabs value={typeTab} onValueChange={(v) => setTypeTab(v as TypeTab)} className="w-full">
        <TabsList className="bg-[#131916] border border-[rgba(255,255,255,0.06)] p-1 rounded-lg inline-flex mb-0 h-auto min-h-10 max-w-full overflow-x-auto flex-wrap sm:flex-nowrap gap-1">
          <TabsTrigger
            value="all"
            className="data-[state=active]:bg-[#10B981]/15 data-[state=active]:text-[#10B981] text-[#8A8A98] rounded-md px-4 py-2 text-xs font-medium cursor-pointer"
          >
            All ({scopedReqs.length})
          </TabsTrigger>
          <TabsTrigger
            value="debit"
            className="data-[state=active]:bg-[#10B981]/15 data-[state=active]:text-[#10B981] text-[#8A8A98] rounded-md px-4 py-2 text-xs font-medium cursor-pointer"
          >
            Debit ({debitCount})
          </TabsTrigger>
          <TabsTrigger
            value="credit"
            className="data-[state=active]:bg-[#10B981]/15 data-[state=active]:text-[#10B981] text-[#8A8A98] rounded-md px-4 py-2 text-xs font-medium cursor-pointer"
          >
            Credit ({creditCount})
          </TabsTrigger>
        </TabsList>
      </Tabs>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="bg-[#131916] border-[rgba(255,255,255,0.10)] text-[#F1F0EE] sm:max-w-md overflow-visible">
          <DialogHeader>
            <DialogTitle className="text-[#F1F0EE]">
              {entryType === "debit"
                ? "Add member debit"
                : entryType === "refund"
                  ? "Add member refund"
                  : isAdmin
                    ? "Add member credit top-up"
                    : "Request credit top-up"}
            </DialogTitle>
            <DialogDescription className="text-[#8A8A98]">
              {entryType === "debit"
                ? focusMember
                  ? `Amount will be deducted from ${focusMember.firstName} ${focusMember.lastName}'s balance (same as play session debits).`
                  : "Amount is deducted from the member's balance and recorded as a debit (same as play session debits)."
                : entryType === "refund"
                  ? focusMember
                    ? `Refund will be credited to ${focusMember.firstName} ${focusMember.lastName}'s wallet immediately.`
                    : "Refund is applied to the member's wallet immediately and recorded as a refund."
                  : focusMember
                    ? `Top-up will be applied to ${focusMember.firstName} ${focusMember.lastName} only.`
                    : isAdmin
                      ? "Credit is applied after you submit. Pending requests from members still need approval."
                      : "Your request will be sent for admin approval."}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-2">
              <Label
                htmlFor="credits-member-combobox"
                className="text-[11px] font-medium text-[#8A8A98] uppercase tracking-[0.08em]"
              >
                Member
              </Label>
              {focusMember ? (
                <div className="flex h-[38px] items-center rounded-md border border-[rgba(255,255,255,0.06)] bg-[#0C0F0E] px-3 text-sm text-[#F1F0EE]">
                  {focusMember.memberType === "junior" && walletMember && walletMember.id !== focusMember.id ? (
                    <>
                      {walletMember.firstName} {walletMember.lastName}
                      <span className="ml-2 text-[#8A8A98]">— bal {fmtMoney(walletMember.credit || 0)}</span>
                      <span className="ml-2 text-[10px] text-[#6B7F78]">(parent wallet for {focusMember.firstName})</span>
                    </>
                  ) : (
                    <>
                      {focusMember.firstName} {focusMember.lastName}
                      <span className="ml-2 text-[#8A8A98]">— bal {fmtMoney(focusMember.credit || 0)}</span>
                    </>
                  )}
                </div>
              ) : (
                <MemberCombobox
                  id="credits-member-combobox"
                  members={addMembers}
                  value={memberId}
                  onValueChange={setMemberId}
                />
              )}
            </div>
            <div className="space-y-2">
              <Label className="text-[11px] font-medium text-[#8A8A98] uppercase tracking-[0.08em]">
                Amount <span className="text-[#EF4444]">*</span>
              </Label>
              <Input
                type="number"
                min="1"
                step="0.01"
                required
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="bg-[#0C0F0E] border-[rgba(255,255,255,0.06)] text-[#F1F0EE] h-[38px]"
              />
            </div>
            {entryType === "debit" && (
              <div className="space-y-2">
                <Label className="text-[11px] font-medium text-[#8A8A98] uppercase tracking-[0.08em]">
                  Reason <span className="text-[#EF4444]">*</span>
                </Label>
                <Textarea
                  rows={3}
                  value={reason}
                  onChange={(e) => {
                    setReason(e.target.value);
                    if (reasonError) setReasonError(null);
                  }}
                  placeholder="Enter the reason for deducting this amount..."
                  className={cn(
                    "bg-[#0C0F0E] border-[rgba(255,255,255,0.06)] text-[#F1F0EE] resize-none focus-visible:ring-1 focus-visible:ring-[#10B981]",
                    reasonError && "border-[#EF4444] focus-visible:ring-[#EF4444]",
                  )}
                />
                {reasonError && (
                  <p className="text-xs text-[#EF4444] mt-1 font-medium">{reasonError}</p>
                )}
              </div>
            )}
            <div className="space-y-2">
              <Label className="text-[11px] font-medium text-[#8A8A98] uppercase tracking-[0.08em]">
                Date <span className="text-[#EF4444]">*</span>
              </Label>
              <Input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="bg-[#0C0F0E] border-[rgba(255,255,255,0.06)] text-[#F1F0EE] h-[38px] cursor-pointer"
              />
            </div>
            <DialogFooter className="gap-2 sm:gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                className="btn-premium-outline cursor-pointer"
                onClick={() => setAddOpen(false)}
                disabled={submitting}
              >
                Cancel
              </Button>
              <Button type="submit" className="btn-premium-solid cursor-pointer" disabled={submitting || !(focusMember?.id || memberId)}>
                {submitting
                  ? "Saving…"
                  : entryType === "debit"
                    ? "Add debit"
                    : entryType === "refund"
                      ? "Add refund"
                      : isAdmin
                        ? "Add credit"
                        : "Submit request"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Card className="border-[rgba(255,255,255,0.06)] bg-[#131916] overflow-hidden">
        <CardHeader className="border-b border-[rgba(255,255,255,0.06)] py-4.5 px-4 sm:px-6 flex flex-row items-center justify-between">
          <CardTitle className="text-[13px] font-medium tracking-[0.12em] text-[#8A8A98] uppercase flex items-center gap-2">
            <span>{historyTitle}</span>
            {stats.pending > 0 && typeTab !== "debit" && (
              <span className="text-[11px] font-semibold bg-[#F59E0B]/10 text-[#F59E0B] px-2 py-0.5 rounded-full">
                {stats.pending} pending
              </span>
            )}
          </CardTitle>
        </CardHeader>
        <div className="px-4 sm:px-6 py-4 border-b border-[rgba(255,255,255,0.06)] bg-[#131916]">
          <div className="flex items-center gap-2 md:hidden">
            {!isMemberScoped && (
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-[#8A8A98]" />
                <Input
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Search member..."
                  className="pl-9 pr-9 bg-[#0C0F0E] border-[rgba(255,255,255,0.08)] text-[#F1F0EE] h-10 rounded-lg text-xs focus-visible:ring-1 focus-visible:ring-[#10B981]"
                />
                {searchTerm && (
                  <button
                    onClick={() => setSearchTerm("")}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[#8A8A98] hover:text-white cursor-pointer"
                  >
                    <X className="size-3.5" />
                  </button>
                )}
              </div>
            )}
            <Button
              variant="outline"
              onClick={() => setShowFilters(!showFilters)}
              className={cn(
                "flex items-center justify-center gap-2 border-[rgba(255,255,255,0.08)] bg-[#0C0F0E] hover:bg-white/5 text-[#F1F0EE] h-10 rounded-lg text-xs px-4 cursor-pointer",
                isMemberScoped && "flex-1",
                showFilters && "border-[#10B981] bg-[#10B981]/5 text-[#10B981]",
              )}
            >
              <SlidersHorizontal className="size-3.5" />
              <span>Filters</span>
              {hasActiveFilters && <span className="size-1.5 rounded-full bg-[#10B981]" />}
            </Button>
          </div>

          {showFilters && (
            <div className="flex flex-col gap-3 mt-3 md:hidden p-3 bg-[#0C0F0E]/50 rounded-lg border border-[rgba(255,255,255,0.06)]">
              <div className="space-y-1">
                <Label className="text-[10px] font-medium text-[#8A8A98]">Status</Label>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="bg-[#0C0F0E] border-[rgba(255,255,255,0.08)] text-[#F1F0EE] h-10 rounded-lg">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-[#1A2120] border-[rgba(255,255,255,0.10)] text-[#F1F0EE]">
                    <SelectItem value="all">All Statuses</SelectItem>
                    <SelectItem value="created">Pending</SelectItem>
                    <SelectItem value="approved">Approved</SelectItem>
                    <SelectItem value="rejected">Rejected</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label className="text-[10px] font-medium text-[#8A8A98]">Date Range</Label>
                <div className="grid grid-cols-2 gap-2">
                  <Input
                    type="date"
                    value={fromDate}
                    onChange={(e) => setFromDate(e.target.value)}
                    className="bg-[#0C0F0E] border-[rgba(255,255,255,0.08)] text-[#F1F0EE] h-10 rounded-lg text-xs"
                  />
                  <Input
                    type="date"
                    value={toDate}
                    onChange={(e) => setToDate(e.target.value)}
                    className="bg-[#0C0F0E] border-[rgba(255,255,255,0.08)] text-[#F1F0EE] h-10 rounded-lg text-xs"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <Label className="text-[10px] font-medium text-[#8A8A98]">Sort By</Label>
                <Select value={sortBy} onValueChange={setSortBy}>
                  <SelectTrigger className="bg-[#0C0F0E] border-[rgba(255,255,255,0.08)] text-[#F1F0EE] h-10 rounded-lg">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-[#1A2120] border-[rgba(255,255,255,0.10)] text-[#F1F0EE]">
                    <SelectItem value="newest">Newest First</SelectItem>
                    <SelectItem value="oldest">Oldest First</SelectItem>
                    <SelectItem value="amount_high">Amount High to Low</SelectItem>
                    <SelectItem value="amount_low">Amount Low to High</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          <div className="hidden md:flex md:items-center justify-between gap-3 w-full">
            <div className="flex items-center gap-3 flex-wrap flex-1">
              {!isMemberScoped && (
                <div className="relative w-full max-w-[280px]">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-[#8A8A98]" />
                  <Input
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Search member..."
                    className="pl-9 pr-9 bg-[#0C0F0E] border-[rgba(255,255,255,0.08)] text-[#F1F0EE] h-10 rounded-lg text-xs focus-visible:ring-1 focus-visible:ring-[#10B981]"
                  />
                  {searchTerm && (
                    <button
                      onClick={() => setSearchTerm("")}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-[#8A8A98] hover:text-white cursor-pointer"
                    >
                      <X className="size-3.5" />
                    </button>
                  )}
                </div>
              )}

              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger
                  className={cn(
                    "bg-[#0C0F0E] border-[rgba(255,255,255,0.08)] text-[#F1F0EE] h-10 w-[140px] rounded-lg cursor-pointer text-xs",
                    statusFilter !== "all" && "border-[#10B981] bg-[#10B981]/5 text-[#10B981]",
                  )}
                >
                  <SelectValue placeholder="All Statuses" />
                </SelectTrigger>
                <SelectContent className="bg-[#1A2120] border-[rgba(255,255,255,0.10)] text-[#F1F0EE]">
                  <SelectItem value="all" className="text-xs">
                    All Statuses
                  </SelectItem>
                  <SelectItem value="created" className="text-xs">
                    Pending
                  </SelectItem>
                  <SelectItem value="approved" className="text-xs">
                    Approved
                  </SelectItem>
                  <SelectItem value="rejected" className="text-xs">
                    Rejected
                  </SelectItem>
                </SelectContent>
              </Select>

              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "flex items-center gap-2 border-[rgba(255,255,255,0.08)] bg-[#0C0F0E] hover:bg-white/5 text-[#F1F0EE] h-10 rounded-lg px-3.5 text-xs cursor-pointer",
                      (fromDate || toDate) && "border-[#10B981] bg-[#10B981]/5 text-[#10B981]",
                    )}
                  >
                    <Calendar className="size-4 text-[#8A8A98]" />
                    <span>
                      {fromDate && toDate
                        ? `${fmtDate(fromDate)} – ${fmtDate(toDate)}`
                        : fromDate
                          ? `From ${fmtDate(fromDate)}`
                          : toDate
                            ? `To ${fmtDate(toDate)}`
                            : "Date Range"}
                    </span>
                  </Button>
                </PopoverTrigger>
                <PopoverContent
                  align="start"
                  className="w-[300px] bg-[#131916] border-[rgba(255,255,255,0.1)] p-4 text-[#F1F0EE] rounded-lg shadow-xl"
                >
                  <div className="space-y-3">
                    <h4 className="font-semibold text-xs text-[#8A8A98] tracking-wider uppercase">
                      Filter by Date Range
                    </h4>
                    <div className="grid gap-2">
                      <div className="grid gap-1">
                        <Label htmlFor="from" className="text-[10px] text-[#8A8A98]">
                          From Date
                        </Label>
                        <Input
                          id="from"
                          type="date"
                          value={fromDate}
                          onChange={(e) => setFromDate(e.target.value)}
                          className="bg-[#0C0F0E] border-[rgba(255,255,255,0.08)] text-[#F1F0EE] h-9 rounded-md text-xs"
                        />
                      </div>
                      <div className="grid gap-1">
                        <Label htmlFor="to" className="text-[10px] text-[#8A8A98]">
                          To Date
                        </Label>
                        <Input
                          id="to"
                          type="date"
                          value={toDate}
                          onChange={(e) => setToDate(e.target.value)}
                          className="bg-[#0C0F0E] border-[rgba(255,255,255,0.08)] text-[#F1F0EE] h-9 rounded-md text-xs"
                        />
                      </div>
                    </div>
                    {(fromDate || toDate) && (
                      <Button
                        variant="ghost"
                        onClick={() => {
                          setFromDate("");
                          setToDate("");
                        }}
                        className="w-full text-xs text-red-400 hover:text-red-300 hover:bg-red-400/5 h-8 cursor-pointer"
                      >
                        Clear Date Filter
                      </Button>
                    )}
                  </div>
                </PopoverContent>
              </Popover>
            </div>

            <div className="flex items-center gap-2">
              <Select value={sortBy} onValueChange={setSortBy}>
                <SelectTrigger className="bg-[#0C0F0E] border-[rgba(255,255,255,0.08)] text-[#F1F0EE] h-10 w-full sm:w-[180px] rounded-lg cursor-pointer text-xs">
                  <SelectValue placeholder="Sort By" />
                </SelectTrigger>
                <SelectContent className="bg-[#1A2120] border-[rgba(255,255,255,0.10)] text-[#F1F0EE]">
                  <SelectItem value="newest" className="text-xs">
                    Newest First
                  </SelectItem>
                  <SelectItem value="oldest" className="text-xs">
                    Oldest First
                  </SelectItem>
                  <SelectItem value="amount_high" className="text-xs">
                    Amount High to Low
                  </SelectItem>
                  <SelectItem value="amount_low" className="text-xs">
                    Amount Low to High
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        {hasActiveFilters && (
          <div className="flex flex-wrap items-center gap-2 px-6 pb-4 bg-[#131916]">
            <span className="text-[11px] font-medium text-[#8A8A98]">Active Filters:</span>
            {searchTerm && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-medium bg-[#10B981]/15 text-[#10B981] rounded-full border border-[#10B981]/20">
                <span>Search: {searchTerm}</span>
                <button onClick={() => setSearchTerm("")} className="hover:text-white transition-colors cursor-pointer">
                  <X className="size-3 text-[#10B981]" />
                </button>
              </span>
            )}
            {statusFilter !== "all" && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-medium bg-[#10B981]/15 text-[#10B981] rounded-full border border-[#10B981]/20">
                <span>
                  Status:{" "}
                  {statusFilter === "created"
                    ? "Pending"
                    : statusFilter.charAt(0).toUpperCase() + statusFilter.slice(1)}
                </span>
                <button
                  onClick={() => setStatusFilter("all")}
                  className="hover:text-white transition-colors cursor-pointer"
                >
                  <X className="size-3 text-[#10B981]" />
                </button>
              </span>
            )}
            {(fromDate || toDate) && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-medium bg-[#10B981]/15 text-[#10B981] rounded-full border border-[#10B981]/20">
                <span>
                  Date:{" "}
                  {fromDate && toDate
                    ? `${fmtDate(fromDate)} – ${fmtDate(toDate)}`
                    : fromDate
                      ? `From ${fmtDate(fromDate)}`
                      : `To ${fmtDate(toDate)}`}
                </span>
                <button
                  onClick={() => {
                    setFromDate("");
                    setToDate("");
                  }}
                  className="hover:text-white transition-colors cursor-pointer"
                >
                  <X className="size-3 text-[#10B981]" />
                </button>
              </span>
            )}
            <button
              onClick={resetFilters}
              className="text-[11px] font-medium text-[#8A8A98] hover:text-[#EEF2F0] underline underline-offset-4 ml-1 cursor-pointer transition-colors"
            >
              Clear all
            </button>
          </div>
        )}
        <CardContent className="p-0">
          {/* Mobile / Tablet Cards View (< md) */}
          <div className="block md:hidden p-4 space-y-3">
            {filteredReqs.length === 0 ? (
              <EmptyIllustration
                icon="wallet"
                title={
                  hasActiveFilters
                    ? "No entries found"
                    : focusMember
                      ? "No wallet history for this member"
                      : typeTab === "debit"
                        ? "No debit entries yet"
                        : typeTab === "credit"
                          ? "No credit requests yet"
                          : "No wallet entries yet"
                }
                description={
                  hasActiveFilters
                    ? "Try adjusting your filters or search terms."
                    : focusMember
                      ? "Use Add credit or Add debit for this member."
                      : typeTab === "debit"
                        ? "Click Add debit to deduct from a member's balance."
                        : "Click Add credit to submit a top-up request."
                }
              />
            ) : (
              filteredReqs.map((r, i) => {
                const m = s.members.find((x) => x.id === r.memberId);
                const initials = m ? `${m.firstName[0]}${m.lastName[0]}` : "??";
                const avatarBgClass =
                  m?.memberType.toLowerCase() === "junior"
                    ? "bg-[#1A1A0A] text-[#F59E0B]"
                    : "bg-[#0D2E22] text-[#10B981]";
                const reqType: EntryType = (r.type || "credit") as EntryType;
                const canApprove = reqType === "credit" && r.status === "created";

                return (
                  <motion.div
                    key={r.id}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.04, duration: 0.18 }}
                    className="p-4 rounded-xl bg-[#0C0F0E] border border-[rgba(255,255,255,0.06)] space-y-3"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <Avatar className="size-8 border border-white/5 shrink-0">
                          <AvatarFallback className={`${avatarBgClass} font-semibold text-xs`}>
                            {initials}
                          </AvatarFallback>
                        </Avatar>
                        <div className="min-w-0">
                          <span className="font-bold text-sm text-[#EEF2F0] block truncate">
                            {m ? `${m.firstName} ${m.lastName}` : "Unknown Member"}
                          </span>
                          <span className="text-[11px] text-[#8A8A98] block">
                            {fmtDate(r.date)}
                          </span>
                        </div>
                      </div>
                      <StatusBadge status={r.status} />
                    </div>

                    <div className="flex items-center justify-between pt-1 border-t border-white/[0.04]">
                      <TypeBadge type={reqType} />
                      <span className="type-mono-value text-base font-semibold text-[#EEF2F0]">
                        {fmtMoney(r.amount)}
                      </span>
                    </div>

                    {r.reason && (
                      <button
                        type="button"
                        onClick={() => setSelectedDebitDetail(r)}
                        className="text-left text-xs text-[#8A8A98] hover:text-[#34D399] bg-white/[0.02] p-2 rounded-lg border border-white/[0.04] w-full block cursor-pointer transition-colors"
                      >
                        <span className="font-semibold text-[#34D399]">Reason:</span> {r.reason}
                      </button>
                    )}

                    {isAdmin && (
                      <div className="flex items-center justify-between pt-2 border-t border-white/[0.04] gap-2">
                        <div className="flex items-center gap-2">
                          {canApprove ? (
                            <>
                              <button
                                onClick={async () => {
                                  try {
                                    await s.approveCredit(r.id);
                                    toast.success("Request approved successfully");
                                  } catch (error: any) {
                                    toast.error(error.message || "Failed to approve request.");
                                  }
                                }}
                                className="px-3 py-1.5 text-xs font-semibold rounded-md border static-financial-credit-border-medium static-financial-credit-text static-financial-credit-hover cursor-pointer"
                              >
                                Approve
                              </button>
                              <button
                                onClick={async () => {
                                  try {
                                    await s.rejectCredit(r.id);
                                    toast.success("Request rejected successfully");
                                  } catch (error: any) {
                                    toast.error(error.message || "Failed to reject request.");
                                  }
                                }}
                                className="px-3 py-1.5 text-xs font-semibold rounded-md border border-[rgba(239,68,68,0.3)] text-[#EF4444] hover:bg-[#EF4444]/10 cursor-pointer"
                              >
                                Reject
                              </button>
                            </>
                          ) : (
                            <span className="text-xs text-[#4A5E58]">Processed</span>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() => setDeleteTarget(r)}
                          className="p-2 text-[#8A8A98] hover:text-[#EF4444] hover:bg-[#EF4444]/10 rounded-lg cursor-pointer transition-all"
                          title="Delete transaction"
                        >
                          <Trash2 className="size-4" />
                        </button>
                      </div>
                    )}
                  </motion.div>
                );
              })
            )}
          </div>

          {/* Desktop Table View (>= md) */}
          <div className="hidden md:block overflow-x-auto">
            <Table>
              <TableHeader className="bg-[#0C0F0E]/30">
                <TableRow className="border-b border-[rgba(255,255,255,0.06)] hover:bg-transparent">
                  <TableHead className="type-table-head py-3.5 px-4 sm:px-6">Member</TableHead>
                  <TableHead className="type-table-head py-3.5 px-4 sm:px-6">Type</TableHead>
                  <TableHead className="type-table-head py-3.5 px-4 sm:px-6">Amount</TableHead>
                  <TableHead className="type-table-head py-3.5 px-4 sm:px-6">Date</TableHead>
                  <TableHead className="type-table-head py-3.5 px-4 sm:px-6">Status</TableHead>
                  {isAdmin && (
                    <TableHead className="type-table-head py-3.5 px-4 sm:px-6">Actions</TableHead>
                  )}
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredReqs.length === 0 ? (
                  <TableRow className="hover:bg-transparent">
                    <TableCell colSpan={colSpan} className="p-0">
                      <EmptyIllustration
                        icon="wallet"
                        title={
                          hasActiveFilters
                            ? "No entries found"
                            : focusMember
                              ? "No wallet history for this member"
                              : typeTab === "debit"
                                ? "No debit entries yet"
                                : typeTab === "credit"
                                  ? "No credit requests yet"
                                  : "No wallet entries yet"
                        }
                        description={
                          hasActiveFilters
                            ? "Try adjusting your filters or search terms."
                            : focusMember
                              ? "Use Add credit or Add debit for this member."
                              : typeTab === "debit"
                                ? "Click Add debit to deduct from a member's balance."
                                : "Click Add credit to submit a top-up request."
                        }
                      />
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredReqs.map((r, i) => {
                    const m = s.members.find((x) => x.id === r.memberId);
                    const initials = m ? `${m.firstName[0]}${m.lastName[0]}` : "??";
                    const avatarBgClass =
                      m?.memberType.toLowerCase() === "junior"
                        ? "bg-[#1A1A0A] text-[#F59E0B]"
                        : "bg-[#0D2E22] text-[#10B981]";
                    const reqType: EntryType = (r.type || "credit") as EntryType;
                    const canApprove = reqType === "credit" && r.status === "created";

                    return (
                      <motion.tr
                        key={r.id}
                        initial={{ opacity: 0, x: -8 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: i * 0.05, duration: 0.18, ease: "easeOut" }}
                        className="border-b border-[rgba(255,255,255,0.06)] hover:bg-[#1A2120]/40 transition-colors"
                      >
                        <TableCell className="py-3 px-6">
                          <div className="flex items-center gap-3">
                            <Avatar className="size-7.5 border border-white/5">
                              <AvatarFallback className={`${avatarBgClass} font-semibold text-[11px]`}>
                                {initials}
                              </AvatarFallback>
                            </Avatar>
                            <div>
                              <span className="font-bold text-[14px] text-[#EEF2F0] block">
                                {m ? `${m.firstName} ${m.lastName}` : "Unknown Member"}
                              </span>
                              {r.reason && (
                                <button
                                  type="button"
                                  onClick={() => setSelectedDebitDetail(r)}
                                  className="text-left text-xs text-[#8A8A98] hover:text-[#34D399] font-normal block mt-0.5 max-w-[240px] truncate cursor-pointer transition-colors"
                                  title={`Reason: ${r.reason} (Click to view details)`}
                                >
                                  Reason: {r.reason}
                                </button>
                              )}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="py-3 px-6">
                          <TypeBadge type={reqType} />
                        </TableCell>
                        <TableCell className="py-3 px-6 type-mono-value">{fmtMoney(r.amount)}</TableCell>
                        <TableCell className="py-3 px-6 type-mono-value text-[#EEF2F0]">{fmtDate(r.date)}</TableCell>
                        <TableCell className="py-3 px-6">
                          <StatusBadge status={r.status} />
                        </TableCell>
                        {isAdmin && (
                          <TableCell className="py-3 px-6">
                            <div className="flex items-center gap-2">
                              {canApprove ? (
                                <>
                                  <button
                                    onClick={async () => {
                                      try {
                                        await s.approveCredit(r.id);
                                        toast.success("Request approved successfully");
                                      } catch (error: any) {
                                        toast.error(error.message || "Failed to approve request.");
                                      }
                                    }}
                                    className="px-3 py-1 text-[11.5px] font-medium rounded border static-financial-credit-border-medium static-financial-credit-text static-financial-credit-hover cursor-pointer transition-all"
                                  >
                                    Approve
                                  </button>
                                  <button
                                    onClick={async () => {
                                      try {
                                        await s.rejectCredit(r.id);
                                        toast.success("Request rejected successfully");
                                      } catch (error: any) {
                                        toast.error(error.message || "Failed to reject request.");
                                      }
                                    }}
                                    className="px-3 py-1 text-[11.5px] font-medium rounded border border-[rgba(239,68,68,0.3)] text-[#EF4444] hover:bg-[#EF4444]/10 cursor-pointer transition-all"
                                  >
                                    Reject
                                  </button>
                                </>
                              ) : (
                                <>
                                  <span className="text-[12px] text-[#4A5E58]">Processed</span>
                                  {r.reason && (
                                    <button
                                      type="button"
                                      onClick={() => setSelectedDebitDetail(r)}
                                      className="text-xs text-[#10B981] hover:underline cursor-pointer ml-1"
                                    >
                                      Details
                                    </button>
                                  )}
                                </>
                              )}
                              <button
                                type="button"
                                onClick={() => setDeleteTarget(r)}
                                className="p-1.5 text-[#8A8A98] hover:text-[#EF4444] hover:bg-[#EF4444]/10 rounded cursor-pointer transition-all"
                                title="Delete transaction"
                              >
                                <Trash2 className="size-4" />
                              </button>
                            </div>
                          </TableCell>
                        )}
                      </motion.tr>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={Boolean(selectedDebitDetail)} onOpenChange={(open) => !open && setSelectedDebitDetail(null)}>
        <DialogContent className="bg-[#131916] border-[rgba(255,255,255,0.10)] text-[#F1F0EE] sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-[#F1F0EE]">Debit Details</DialogTitle>
            <DialogDescription className="text-[#8A8A98]">
              Details of the member debit transaction.
            </DialogDescription>
          </DialogHeader>
          {selectedDebitDetail && (() => {
            const dm = s.members.find((x) => x.id === selectedDebitDetail.memberId);
            return (
              <div className="space-y-4 py-2">
                <div className="flex items-center justify-between p-3 rounded-lg bg-[#0C0F0E] border border-[rgba(255,255,255,0.06)]">
                  <span className="text-xs text-[#8A8A98]">Member</span>
                  <span className="text-sm font-semibold text-[#EEF2F0]">
                    {dm ? `${dm.firstName} ${dm.lastName}` : "Unknown Member"}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="p-3 rounded-lg bg-[#0C0F0E] border border-[rgba(255,255,255,0.06)]">
                    <span className="text-[11px] text-[#8A8A98] uppercase block mb-1">Amount</span>
                    <span className="text-base font-bold text-[#EF4444]">{fmtMoney(selectedDebitDetail.amount)}</span>
                  </div>
                  <div className="p-3 rounded-lg bg-[#0C0F0E] border border-[rgba(255,255,255,0.06)]">
                    <span className="text-[11px] text-[#8A8A98] uppercase block mb-1">Date</span>
                    <span className="text-sm font-medium text-[#EEF2F0]">{fmtDate(selectedDebitDetail.date)}</span>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <span className="text-[11px] font-medium text-[#8A8A98] uppercase tracking-[0.08em]">Reason</span>
                  <div className="p-3.5 rounded-lg bg-[#0C0F0E] border border-[rgba(255,255,255,0.06)] text-sm text-[#EEF2F0] leading-relaxed whitespace-pre-wrap">
                    {selectedDebitDetail.reason || "No reason specified"}
                  </div>
                </div>
              </div>
            );
          })()}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              className="btn-premium-outline cursor-pointer"
              onClick={() => setSelectedDebitDetail(null)}
            >
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={Boolean(deleteTarget)} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent className="bg-[#131916] border-[rgba(255,255,255,0.10)] text-[#F1F0EE] sm:max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-[#F1F0EE]">Delete this wallet transaction?</AlertDialogTitle>
            <AlertDialogDescription className="text-[#8A8A98]">
              This action will permanently delete the transaction and reverse its wallet effect.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2 sm:gap-2">
            <AlertDialogCancel
              className="btn-premium-outline cursor-pointer"
              disabled={deleting}
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-[#EF4444] hover:bg-[#DC2626] text-white cursor-pointer"
              disabled={deleting}
              onClick={async (e) => {
                e.preventDefault();
                if (!deleteTarget) return;
                setDeleting(true);
                try {
                  await s.deleteCreditRequest(deleteTarget.id);
                  toast.success("Wallet transaction deleted and reversed successfully");
                  setDeleteTarget(null);
                } catch (error: any) {
                  toast.error(error.message || "Failed to delete wallet transaction.");
                } finally {
                  setDeleting(false);
                }
              }}
            >
              {deleting ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
