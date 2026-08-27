import { createFileRoute } from "@tanstack/react-router";
import { useCan } from "@/lib/permissions";
import { useCurrentUser, useStore } from "@/lib/store";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { fmtDateTime, fmtMoney, fmtDate, formatTxnDescription, txnDisplayType, isTxnInflow, txnSource } from "@/lib/format";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  ArrowUpRight,
  ArrowDownLeft,
  Receipt,
  ArrowDownRight,
  ArrowUpLeft,
  RotateCcw,
  Trash2,
  Plus,
  CircleDollarSign,
} from "lucide-react";
import { useState, useMemo, useCallback } from "react";
import { SearchFilterBar } from "@/components/SearchFilterBar";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { motion } from "framer-motion";
import { AnimatedCounter } from "@/components/AnimatedCounter";
import { staggerContainer, staggerItem } from "@/components/MotionWrapper";
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
import { EmptyIllustration } from "@/components/EmptyIllustration";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MemberCombobox } from "@/components/MemberCombobox";
import {
  ReportDialog,
  ReportTriggerButton,
  runReportExport,
  useReportDialog,
} from "@/components/ReportDialog";
import {
  EXPENSE_CATEGORIES,
  type ExpenseCategory,
  type TxnReportCategory,
  type TxnReportType,
  downloadTransactionsCsv,
  downloadTransactionsPdf,
  filterTransactionsForReport,
  formatExpenseReason,
} from "@/lib/transaction-report";

type SourceTab = "all" | "play" | "training";

type TransactionsSearch = {
  memberId?: string;
};

export const Route = createFileRoute("/_authenticated/transactions")({
  validateSearch: (search: Record<string, unknown>): TransactionsSearch => ({
    memberId: search.memberId as string | undefined,
  }),
  component: Txns,
});

const STAT_ACCENTS = [
  { border: "var(--primary)", iconBg: "var(--violet-dim)", iconColor: "var(--primary)" },
  { border: "#10B981", iconBg: "rgba(16,185,129,0.12)", iconColor: "#34D399" },
  { border: "#EF4444", iconBg: "rgba(239,68,68,0.12)", iconColor: "#EF4444" },
  { border: "#818CF8", iconBg: "rgba(129,140,248,0.12)", iconColor: "#818CF8" },
];

function TxnTypeBadge({ t }: { t: import("@/lib/types").Transaction }) {
  const displayType = txnDisplayType(t);
  const isCredit = displayType === "credit";
  const isRefund = displayType === "refund";
  const isExpense = displayType === "expense";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium tracking-wider uppercase shrink-0",
        isCredit
          ? "static-financial-credit-bg-dim static-financial-credit-text border static-financial-credit-border-dim"
          : isRefund
            ? "bg-[#818CF8]/12 text-[#818CF8] border border-[#818CF8]/25"
            : isExpense
              ? "bg-[#F59E0B]/12 text-[#FBBF24] border border-[#F59E0B]/25"
              : "bg-[#EF4444]/10 text-[#EF4444] border border-[#EF4444]/20",
      )}
    >
      {isCredit ? <ArrowUpLeft className="size-3" /> : isRefund ? <RotateCcw className="size-3" /> : <ArrowDownRight className="size-3" />}
      {displayType}
    </span>
  );
}

function TxnStatCard({
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
  icon: typeof Receipt;
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

function Txns() {
  const user = useCurrentUser()!;
  const s = useStore();
  const search = Route.useSearch();
  const myMembers = user.role === "admin" ? s.members : s.members.filter((m) => m.userId === user.id);
  const myMemberIds = useMemo(() => myMembers.map((m) => m.id), [myMembers]);

  const focusMember = search.memberId
    ? myMembers.find((m) => m.id === search.memberId) ||
      s.members.find((m) => m.id === search.memberId)
    : undefined;
  const isMemberScoped = Boolean(focusMember);

  // If focusMember is a junior, transactions are recorded on the parent's wallet.
  const walletMember = focusMember
    ? focusMember.memberType === "junior" && focusMember.parentMemberId
      ? s.members.find((m) => m.id === focusMember.parentMemberId) ?? focusMember
      : focusMember
    : undefined;

  const isAdmin = user.role === "admin";
  const canCreateCredits = useCan("credits.create");
  const canAddExpense = isAdmin && canCreateCredits;
  const adultMembers = useMemo(
    () => myMembers.filter((m) => m.memberType === "adult"),
    [myMembers],
  );
  const expenseMembers = focusMember
    ? walletMember
      ? [walletMember]
      : [focusMember]
    : adultMembers;

  const [searchTerm, setSearchTerm] = useState("");
  const [sourceTab, setSourceTab] = useState<SourceTab>("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [memberTypeFilter, setMemberTypeFilter] = useState("all");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [sortBy, setSortBy] = useState("newest");
  const [selectedTxnDetail, setSelectedTxnDetail] = useState<import("@/lib/types").Transaction | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<import("@/lib/types").Transaction | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Add Expense
  const [expenseOpen, setExpenseOpen] = useState(false);
  const [expenseMemberId, setExpenseMemberId] = useState("");
  const [expenseAmount, setExpenseAmount] = useState("");
  const [expenseCategory, setExpenseCategory] = useState<ExpenseCategory>("Other");
  const [expenseReason, setExpenseReason] = useState("");
  const [expenseReasonError, setExpenseReasonError] = useState<string | null>(null);
  const [expenseDate, setExpenseDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [expenseSubmitting, setExpenseSubmitting] = useState(false);
  const report = useReportDialog();

  const resetFilters = () => {
    setSearchTerm("");
    setTypeFilter("all");
    setMemberTypeFilter("all");
    setFromDate("");
    setToDate("");
    setSortBy("newest");
  };

  const txnFilterConfig = useMemo(
    () => [
      {
        key: "type",
        label: "Type",
        options: [
          { value: "all", label: "All Types" },
          { value: "credit", label: "Credit" },
          { value: "refund", label: "Refund" },
          { value: "debit", label: "Debit" },
          { value: "expense", label: "Expense" },
        ],
      },
      {
        key: "memberType",
        label: "Member Type",
        options: [
          { value: "all", label: "All" },
          { value: "adult", label: "Adult" },
          { value: "junior", label: "Junior" },
        ],
      },
      { key: "fromDate", label: "From", type: "date" as const },
      { key: "toDate", label: "To", type: "date" as const },
    ],
    [],
  );

  const txnSortOptions = useMemo(
    () => [
      { value: "newest", label: "Newest First" },
      { value: "oldest", label: "Oldest First" },
      { value: "amount_high", label: "Amount High to Low" },
      { value: "amount_low", label: "Amount Low to High" },
    ],
    [],
  );

  const handleTxnFilterChange = useCallback((key: string, value: string) => {
    if (key === "type") setTypeFilter(value);
    else if (key === "memberType") setMemberTypeFilter(value);
    else if (key === "fromDate") setFromDate(value);
    else if (key === "toDate") setToDate(value);
  }, []);

  const hasActiveFilters =
    searchTerm !== "" ||
    typeFilter !== "all" ||
    memberTypeFilter !== "all" ||
    fromDate !== "" ||
    toDate !== "" ||
    sortBy !== "newest";

  const baseTxns = useMemo(() => {
    let list = user.role === "admin" ? s.transactions : s.transactions.filter((t) => Boolean(t.memberId && myMemberIds.includes(t.memberId)));
    if (focusMember) {
      // Show transactions for the wallet member (parent for juniors)
      const wid = walletMember?.id ?? focusMember.id;
      list = list.filter((t) => t.memberId === wid);
    }
    return list;
  }, [s.transactions, user.role, myMemberIds, focusMember, walletMember]);

  const filteredTxns = useMemo(() => {
    return baseTxns
      .filter((t) => {
        const m = s.members.find((x) => x.id === t.memberId);
        if (sourceTab !== "all" && txnSource(t) !== sourceTab) return false;
        if (memberTypeFilter !== "all") {
          if (!m || m.memberType.toLowerCase() !== memberTypeFilter.toLowerCase()) {
            return false;
          }
        }
        if (searchTerm.trim()) {
          const fullName = (m ? `${m.firstName} ${m.lastName} ${m.nickname || ""}` : "").toLowerCase();
          const descDisplay = formatTxnDescription(t).toLowerCase();
          if (
            !fullName.includes(searchTerm.toLowerCase()) &&
            !t.description.toLowerCase().includes(searchTerm.toLowerCase()) &&
            !descDisplay.includes(searchTerm.toLowerCase())
          ) {
            return false;
          }
        }
        if (typeFilter !== "all" && txnDisplayType(t) !== typeFilter) return false;
        if (fromDate) {
          const txnDate = new Date(t.date);
          const filterFrom = new Date(fromDate);
          txnDate.setHours(0, 0, 0, 0);
          filterFrom.setHours(0, 0, 0, 0);
          if (txnDate < filterFrom) return false;
        }
        if (toDate) {
          const txnDate = new Date(t.date);
          const filterTo = new Date(toDate);
          txnDate.setHours(0, 0, 0, 0);
          filterTo.setHours(0, 0, 0, 0);
          if (txnDate > filterTo) return false;
        }
        return true;
      })
      .sort((a, b) => {
        if (sortBy === "newest") return new Date(b.date).getTime() - new Date(a.date).getTime();
        if (sortBy === "oldest") return new Date(a.date).getTime() - new Date(b.date).getTime();
        if (sortBy === "amount_high") return b.amount - a.amount;
        if (sortBy === "amount_low") return a.amount - b.amount;
        return 0;
      });
  }, [baseTxns, s.members, sourceTab, memberTypeFilter, searchTerm, typeFilter, fromDate, toDate, sortBy]);

  const playCount = baseTxns.filter((t) => txnSource(t) === "play").length;
  const trainingCount = baseTxns.filter((t) => txnSource(t) === "training").length;

  const stats = useMemo(() => {
    const creditTxns = filteredTxns.filter((t) => txnDisplayType(t) === "credit");
    const debitTxns = filteredTxns.filter((t) => txnDisplayType(t) === "debit");
    const refundTxns = filteredTxns.filter((t) => txnDisplayType(t) === "refund");

    const creditSum = creditTxns.reduce((sum, t) => sum + t.amount, 0);
    const debitSum = debitTxns.reduce((sum, t) => sum + t.amount, 0);
    const refundSum = refundTxns.reduce((sum, t) => sum + t.amount, 0);

    const totalCredited = creditSum;
    const totalDebited = Math.max(0, debitSum - refundSum);

    const balanceTotal = focusMember
      ? (walletMember?.credit ?? focusMember.credit ?? 0)
      : adultMembers.reduce((sum, m) => sum + (m.credit || 0), 0);

    return {
      total: filteredTxns.length,
      totalCredited,
      totalDebited,
      balanceTotal,
    };
  }, [filteredTxns, focusMember, walletMember, adultMembers]);

  const openExpenseDialog = () => {
    if (!canAddExpense) return;
    setExpenseAmount("");
    setExpenseCategory("Other");
    setExpenseReason("");
    setExpenseReasonError(null);
    setExpenseDate(new Date().toISOString().slice(0, 10));
    setExpenseOpen(true);
  };

  const submitExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!expenseAmount) return;

    const trimmedReason = expenseReason.trim();
    if (!trimmedReason) {
      setExpenseReasonError("Reason is required.");
      return;
    }
    if (trimmedReason.length < 5) {
      setExpenseReasonError("Reason must be at least 5 characters.");
      return;
    }
    if (trimmedReason.length > 480) {
      setExpenseReasonError("Reason must not exceed 480 characters.");
      return;
    }

    setExpenseSubmitting(true);
    setExpenseReasonError(null);
    try {
      const reason = formatExpenseReason(expenseCategory, trimmedReason);
      await s.requestCredit(undefined, parseFloat(expenseAmount), expenseDate, "expense", reason);
      toast.success("Expense recorded");
      setExpenseOpen(false);
      setExpenseAmount("");
      setExpenseReason("");
    } catch (error: any) {
      if (error.response?.data?.errors?.reason?.[0]) {
        setExpenseReasonError(error.response.data.errors.reason[0]);
      } else if (error.response?.data?.message && String(error.response.data.message).includes("Reason")) {
        setExpenseReasonError(error.response.data.message);
      } else {
        toast.error(error.message || "Failed to record expense.");
      }
    } finally {
      setExpenseSubmitting(false);
    }
  };

  const openReportDialog = () => {
    report.openWith({
      fromDate,
      toDate,
      memberId: walletMember?.id ?? focusMember?.id ?? "all",
      type: typeFilter === "all" ? "all" : typeFilter,
      category: sourceTab === "all" ? "all" : sourceTab,
    });
  };

  const reportPreviewCount = useMemo(
    () =>
      filterTransactionsForReport(baseTxns, s.members, {
        fromDate: report.values.fromDate,
        toDate: report.values.toDate,
        memberId: report.values.memberId,
        type: report.values.type as TxnReportType,
        category: report.values.category as TxnReportCategory,
      }).length,
    [baseTxns, s.members, report.values],
  );

  const exportReport = (format: "csv" | "pdf") =>
    runReportExport({
      count: reportPreviewCount,
      emptyMessage: "No transactions match the selected filters.",
      format,
      setExporting: report.setExporting,
      setOpen: report.setOpen,
      exportFn: (fmt) => {
        const filters = {
          fromDate: report.values.fromDate,
          toDate: report.values.toDate,
          memberId: report.values.memberId,
          type: report.values.type as TxnReportType,
          category: report.values.category as TxnReportCategory,
        };
        const rows = filterTransactionsForReport(baseTxns, s.members, filters);
        if (fmt === "csv") downloadTransactionsCsv(rows, s.members, filters);
        else downloadTransactionsPdf(rows, s.members, filters, { appName: s.appName });
      },
    });

  return (
    <div className="space-y-6">
      <PageHeader
        title={focusMember ? `${focusMember.firstName} ${focusMember.lastName}` : "Transactions"}
        description={
          focusMember
            ? focusMember.memberType === "junior" && walletMember && walletMember.id !== focusMember.id
              ? `Junior member — transactions recorded on ${walletMember.firstName} ${walletMember.lastName}'s shared wallet. Balance: ${fmtMoney(walletMember.credit || 0)}.`
              : `Account credits and debits for this member only. Current balance ${fmtMoney(walletMember?.credit ?? focusMember.credit ?? 0)}.`
            : "Audit log of all account credits and session debits."
        }
        eyebrow={focusMember ? "FINANCE / MEMBER HISTORY" : undefined}
        backTo={focusMember ? "/members" : undefined}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <ReportTriggerButton onClick={openReportDialog} />
            {canAddExpense && (
              <Button
                type="button"
                className="btn-premium-solid cursor-pointer"
                onClick={openExpenseDialog}
              >
                <Plus className="size-4 mr-1.5" />
                Add Expense
              </Button>
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
        <TxnStatCard
          label="Total"
          value={stats.total}
          hint={isMemberScoped ? "Entries for this member" : "All transactions"}
          icon={Receipt}
          index={0}
        />
        <TxnStatCard
          label="Credited"
          value={stats.totalCredited}
          hint="From member credit recharges"
          icon={ArrowUpRight}
          index={1}
          format={fmtMoney}
        />
        <TxnStatCard
          label="Debited"
          value={stats.totalDebited}
          hint="Debits from members"
          icon={ArrowDownLeft}
          index={2}
          format={fmtMoney}
        />
        <TxnStatCard
          label="Total Balance"
          value={stats.balanceTotal}
          hint={
            focusMember
              ? `Current balance for ${focusMember.firstName}`
              : `${fmtMoney(stats.totalCredited)} approved credits`
          }
          icon={CircleDollarSign}
          index={3}
          format={fmtMoney}
        />
      </motion.div>

      <Tabs value={sourceTab} onValueChange={(v) => setSourceTab(v as SourceTab)} className="w-full">
        <TabsList className="bg-[#131916] border border-[rgba(255,255,255,0.06)] p-1 rounded-lg inline-flex mb-0 h-auto min-h-10 max-w-full overflow-x-auto flex-wrap sm:flex-nowrap gap-1">
          <TabsTrigger
            value="all"
            className="data-[state=active]:bg-[#10B981]/15 data-[state=active]:text-[#10B981] text-[#8A8A98] rounded-md px-4 py-2 text-xs font-medium cursor-pointer"
          >
            All ({baseTxns.length})
          </TabsTrigger>
          <TabsTrigger
            value="play"
            className="data-[state=active]:bg-[#10B981]/15 data-[state=active]:text-[#10B981] text-[#8A8A98] rounded-md px-4 py-2 text-xs font-medium cursor-pointer"
          >
            Play Schedules ({playCount})
          </TabsTrigger>
          <TabsTrigger
            value="training"
            className="data-[state=active]:bg-[#10B981]/15 data-[state=active]:text-[#10B981] text-[#8A8A98] rounded-md px-4 py-2 text-xs font-medium cursor-pointer"
          >
            Trainings ({trainingCount})
          </TabsTrigger>
        </TabsList>
      </Tabs>

      <SearchFilterBar
        searchPlaceholder="Search member or description..."
        searchValue={searchTerm}
        onSearchChange={setSearchTerm}
        showSearch={!isMemberScoped}
        filters={txnFilterConfig}
        activeFilters={{
          type: typeFilter,
          memberType: memberTypeFilter,
          fromDate,
          toDate,
        }}
        onFilterChange={handleTxnFilterChange}
        onClearAll={resetFilters}
        sortOptions={txnSortOptions}
        currentSort={sortBy}
        onSortChange={setSortBy}
      />

      <Card className="border-[rgba(255,255,255,0.06)] bg-[#131916] overflow-hidden">
        <CardHeader className="border-b border-[rgba(255,255,255,0.06)] py-4.5 px-4 sm:px-6">
          <CardTitle className="text-[13px] font-medium tracking-[0.12em] text-[#8A8A98] uppercase">
            {focusMember
              ? `${focusMember.firstName} ${focusMember.lastName} — ${
                  sourceTab === "play"
                    ? "Play Schedule History"
                    : sourceTab === "training"
                      ? "Training History"
                      : "Transaction History"
                }`
              : sourceTab === "play"
                ? "Play Schedule History"
                : sourceTab === "training"
                  ? "Training History"
                  : "Transaction History"}
          </CardTitle>
        </CardHeader>

        <CardContent className="p-0">
          {/* Mobile Cards View (< md) */}
          <div className="block md:hidden p-4 space-y-3">
            {filteredTxns.length === 0 ? (
              <EmptyIllustration
                icon="wallet"
                title={hasActiveFilters ? "No transactions found" : "No transactions recorded"}
                description={
                  hasActiveFilters
                    ? "Try adjusting your filters or search terms."
                    : focusMember
                      ? "Credits and debits for this member will appear here."
                      : "Session debits and credit top-ups will show up in this ledger."
                }
              />
            ) : (
              filteredTxns.map((t, i) => {
                const m = s.members.find((x) => x.id === t.memberId);
                const isExpenseOrNoMember = t.type === "expense" || !t.memberId;
                const initials = m
                  ? `${m.firstName[0]}${m.lastName[0]}`
                  : isExpenseOrNoMember
                    ? "AD"
                    : "—";
                const memberDisplayName = m
                  ? `${m.firstName} ${m.lastName}`
                  : isExpenseOrNoMember
                    ? "Admin"
                    : "—";
                const avatarBgClass =
                  m?.memberType.toLowerCase() === "junior"
                    ? "bg-[#1A1A0A] text-[#F59E0B]"
                    : isExpenseOrNoMember
                      ? "bg-[#1E293B] text-[#94A3B8]"
                      : "bg-[#0D2E22] text-[#10B981]";
                const isInflow = isTxnInflow(t);

                return (
                  <motion.div
                    key={t.id}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.03, duration: 0.18 }}
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
                            {memberDisplayName}
                          </span>
                          <span className="text-[11px] text-[#8A8A98] font-mono block">
                            {fmtDateTime(t.date)}
                          </span>
                        </div>
                      </div>
                      <TxnTypeBadge t={t} />
                    </div>

                    <div className="flex items-center justify-between pt-1 border-t border-white/[0.04]">
                      <button
                        type="button"
                        onClick={() => setSelectedTxnDetail(t)}
                        className="text-left text-xs text-[#C4D4CF] hover:text-[#EEF2F0] hover:underline cursor-pointer truncate max-w-[200px]"
                      >
                        {formatTxnDescription(t)}
                      </button>
                      <span
                        className={cn(
                          "type-mono-value text-base font-semibold shrink-0 ml-2",
                          isInflow ? "static-financial-credit-text" : "text-[#EF4444]",
                        )}
                      >
                        {isInflow ? "+" : "−"}
                        {fmtMoney(t.amount)}
                      </span>
                    </div>

                    {isAdmin && (
                      <div className="flex items-center justify-end pt-2 border-t border-white/[0.04]">
                        <button
                          type="button"
                          onClick={() => setDeleteTarget(t)}
                          className="p-1.5 text-[#8A8A98] hover:text-[#EF4444] hover:bg-[#EF4444]/10 rounded-lg cursor-pointer transition-all"
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
                  <TableHead className="type-table-head py-3.5 px-4 sm:px-6">Date & Time</TableHead>
                  <TableHead className="type-table-head py-3.5 px-4 sm:px-6">Member</TableHead>
                  <TableHead className="type-table-head py-3.5 px-4 sm:px-6">Description</TableHead>
                  <TableHead className="type-table-head py-3.5 px-4 sm:px-6">Type</TableHead>
                  <TableHead className="type-table-head py-3.5 px-4 sm:px-6 text-right">Amount</TableHead>
                  {isAdmin && (
                    <TableHead className="type-table-head py-3.5 px-4 sm:px-6">Actions</TableHead>
                  )}
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredTxns.length === 0 ? (
                  <TableRow className="hover:bg-transparent">
                    <TableCell colSpan={isAdmin ? 6 : 5} className="p-0">
                      <EmptyIllustration
                        icon="wallet"
                        title={hasActiveFilters ? "No transactions found" : "No transactions recorded"}
                        description={
                          hasActiveFilters
                            ? "Try adjusting your filters or search terms."
                            : focusMember
                              ? "Credits and debits for this member will appear here."
                              : "Session debits and credit top-ups will show up in this ledger."
                        }
                      />
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredTxns.map((t, i) => {
                    const m = s.members.find((x) => x.id === t.memberId);
                    const isExpenseOrNoMember = t.type === "expense" || !t.memberId;
                    const initials = m
                      ? `${m.firstName[0]}${m.lastName[0]}`
                      : isExpenseOrNoMember
                        ? "AD"
                        : "—";
                    const memberDisplayName = m
                      ? `${m.firstName} ${m.lastName}`
                      : isExpenseOrNoMember
                        ? "Admin"
                        : "—";
                    const avatarBgClass =
                      m?.memberType.toLowerCase() === "junior"
                        ? "bg-[#1A1A0A] text-[#F59E0B]"
                        : isExpenseOrNoMember
                          ? "bg-[#1E293B] text-[#94A3B8]"
                          : "bg-[#0D2E22] text-[#10B981]";
                    const isInflow = isTxnInflow(t);

                    return (
                      <motion.tr
                        key={t.id}
                        initial={{ opacity: 0, x: -8 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: i * 0.03, duration: 0.18, ease: "easeOut" }}
                        className="border-b border-[rgba(255,255,255,0.06)] hover:bg-[#1A2120]/40 transition-colors"
                      >
                        <TableCell className="py-3 px-6 type-mono-value text-[#8A8A98]">
                          {fmtDateTime(t.date)}
                        </TableCell>
                        <TableCell className="py-3 px-6">
                          <div className="flex items-center gap-3">
                            <Avatar className="size-7.5 border border-white/5">
                              <AvatarFallback className={`${avatarBgClass} font-semibold text-[11px]`}>
                                {initials}
                              </AvatarFallback>
                            </Avatar>
                            <span className="font-bold text-[14px] text-[#EEF2F0]">
                              {memberDisplayName}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="py-3 px-6 text-[13px] text-[#C4D4CF] font-light max-w-[280px] truncate">
                          <button
                            type="button"
                            onClick={() => setSelectedTxnDetail(t)}
                            className="text-left hover:text-[#EEF2F0] hover:underline cursor-pointer transition-colors"
                            title={formatTxnDescription(t)}
                          >
                            {formatTxnDescription(t)}
                          </button>
                        </TableCell>
                        <TableCell className="py-3 px-6">
                          <TxnTypeBadge t={t} />
                        </TableCell>
                        <TableCell
                          className={cn(
                            "py-3 px-6 text-right type-mono-value text-[14px] font-medium",
                            isInflow ? "static-financial-credit-text" : "text-[#EF4444]",
                          )}
                        >
                          {isInflow ? "+" : "−"}
                          {fmtMoney(t.amount)}
                        </TableCell>
                        {isAdmin && (
                          <TableCell className="py-3 px-6">
                            <button
                              type="button"
                              onClick={() => setDeleteTarget(t)}
                              className="p-1.5 text-[#8A8A98] hover:text-[#EF4444] hover:bg-[#EF4444]/10 rounded cursor-pointer transition-all"
                              title="Delete transaction"
                            >
                              <Trash2 className="size-4" />
                            </button>
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

      <Dialog open={Boolean(selectedTxnDetail)} onOpenChange={(open) => !open && setSelectedTxnDetail(null)}>
        <DialogContent className="bg-[#131916] border-[rgba(255,255,255,0.10)] text-[#F1F0EE] sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-[#F1F0EE]">
              {selectedTxnDetail
                ? txnDisplayType(selectedTxnDetail) === "debit"
                  ? "Debit Details"
                  : txnDisplayType(selectedTxnDetail) === "refund"
                    ? "Refund Details"
                    : "Transaction Details"
                : "Transaction Details"}
            </DialogTitle>
            <DialogDescription className="text-[#8A8A98]">
              {selectedTxnDetail && txnDisplayType(selectedTxnDetail) === "debit"
                ? "Details of the member debit transaction."
                : selectedTxnDetail && txnDisplayType(selectedTxnDetail) === "refund"
                  ? "Details of the member refund transaction."
                  : "Details of the recorded transaction."}
            </DialogDescription>
          </DialogHeader>
          {selectedTxnDetail && (() => {
            const tm = s.members.find((x) => x.id === selectedTxnDetail.memberId);
            const isInflow = isTxnInflow(selectedTxnDetail);
            const displayType = txnDisplayType(selectedTxnDetail);
            const isExpenseOrNoMember = selectedTxnDetail.type === "expense" || !selectedTxnDetail.memberId;
            const tmName = tm
              ? `${tm.firstName} ${tm.lastName}`
              : isExpenseOrNoMember
                ? "Admin"
                : "Unknown Member";
            return (
              <div className="space-y-4 py-2">
                <div className="flex items-center justify-between p-3 rounded-lg bg-[#0C0F0E] border border-[rgba(255,255,255,0.06)]">
                  <span className="text-xs text-[#8A8A98]">Member</span>
                  <span className="text-sm font-semibold text-[#EEF2F0]">
                    {tmName}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="p-3 rounded-lg bg-[#0C0F0E] border border-[rgba(255,255,255,0.06)]">
                    <span className="text-[11px] text-[#8A8A98] uppercase block mb-1">Amount</span>
                    <span className={cn("text-base font-bold", isInflow ? "text-[#34D399]" : "text-[#EF4444]")}>
                      {isInflow ? "+" : "−"}{fmtMoney(selectedTxnDetail.amount)}
                    </span>
                  </div>
                  <div className="p-3 rounded-lg bg-[#0C0F0E] border border-[rgba(255,255,255,0.06)]">
                    <span className="text-[11px] text-[#8A8A98] uppercase block mb-1">Date & Time</span>
                    <span className="text-xs font-medium text-[#EEF2F0]">{fmtDateTime(selectedTxnDetail.date)}</span>
                  </div>
                </div>
                <div className="flex items-center justify-between p-3 rounded-lg bg-[#0C0F0E] border border-[rgba(255,255,255,0.06)]">
                  <span className="text-xs text-[#8A8A98]">Type</span>
                  <TxnTypeBadge t={selectedTxnDetail} />
                </div>
                <div className="space-y-1.5">
                  <span className="text-[11px] font-medium text-[#8A8A98] uppercase tracking-[0.08em]">
                    {displayType === "debit" ? "Reason" : "Description"}
                  </span>
                  <div className="p-3.5 rounded-lg bg-[#0C0F0E] border border-[rgba(255,255,255,0.06)] text-sm text-[#EEF2F0] leading-relaxed whitespace-pre-wrap">
                    {formatTxnDescription(selectedTxnDetail)}
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
              onClick={() => setSelectedTxnDetail(null)}
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
                  await s.deleteTransaction(deleteTarget.id);
                  toast.success("Wallet transaction deleted and reversed successfully");
                  setDeleteTarget(null);
                } catch (error: any) {
                  toast.error(error.message || "Failed to delete transaction.");
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

      <Dialog open={expenseOpen} onOpenChange={setExpenseOpen}>
        <DialogContent className="bg-[#131916] border-[rgba(255,255,255,0.10)] text-[#F1F0EE] sm:max-w-md overflow-visible">
          <DialogHeader>
            <DialogTitle className="text-[#F1F0EE]">Add expense</DialogTitle>
            <DialogDescription className="text-[#8A8A98]">
              Record a club expense entry in the ledger.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={submitExpense} className="space-y-4">
            <div className="space-y-2">
              <Label className="text-[11px] font-medium text-[#8A8A98] uppercase tracking-[0.08em]">
                Category <span className="text-[#EF4444]">*</span>
              </Label>
              <Select
                value={expenseCategory}
                onValueChange={(v) => setExpenseCategory(v as ExpenseCategory)}
              >
                <SelectTrigger className="bg-[#0C0F0E] border-[rgba(255,255,255,0.06)] text-[#F1F0EE] h-[38px] cursor-pointer">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-[#1A2120] border-[rgba(255,255,255,0.10)] text-[#F1F0EE]">
                  {EXPENSE_CATEGORIES.map((cat) => (
                    <SelectItem key={cat} value={cat} className="text-sm">
                      {cat}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-[11px] font-medium text-[#8A8A98] uppercase tracking-[0.08em]">
                Amount <span className="text-[#EF4444]">*</span>
              </Label>
              <Input
                type="number"
                min="0.01"
                step="0.01"
                required
                value={expenseAmount}
                onChange={(e) => setExpenseAmount(e.target.value)}
                className="bg-[#0C0F0E] border-[rgba(255,255,255,0.06)] text-[#F1F0EE] h-[38px]"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-[11px] font-medium text-[#8A8A98] uppercase tracking-[0.08em]">
                Reason <span className="text-[#EF4444]">*</span>
              </Label>
              <Textarea
                rows={3}
                value={expenseReason}
                onChange={(e) => {
                  setExpenseReason(e.target.value);
                  if (expenseReasonError) setExpenseReasonError(null);
                }}
                placeholder="Describe this expense…"
                className={cn(
                  "bg-[#0C0F0E] border-[rgba(255,255,255,0.06)] text-[#F1F0EE] resize-none focus-visible:ring-1 focus-visible:ring-[#10B981]",
                  expenseReasonError && "border-[#EF4444] focus-visible:ring-[#EF4444]",
                )}
              />
              {expenseReasonError && (
                <p className="text-xs text-[#EF4444] mt-1 font-medium">{expenseReasonError}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label className="text-[11px] font-medium text-[#8A8A98] uppercase tracking-[0.08em]">
                Date <span className="text-[#EF4444]">*</span>
              </Label>
              <Input
                type="date"
                value={expenseDate}
                onChange={(e) => setExpenseDate(e.target.value)}
                className="bg-[#0C0F0E] border-[rgba(255,255,255,0.06)] text-[#F1F0EE] h-[38px] cursor-pointer"
              />
            </div>
            <DialogFooter className="gap-2 sm:gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                className="btn-premium-outline cursor-pointer"
                onClick={() => setExpenseOpen(false)}
                disabled={expenseSubmitting}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                className="btn-premium-solid cursor-pointer"
                disabled={expenseSubmitting}
              >
                {expenseSubmitting ? "Saving…" : "Add expense"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ReportDialog
        open={report.open}
        onOpenChange={report.setOpen}
        values={report.values}
        onValuesChange={report.setValues}
        previewCount={reportPreviewCount}
        exporting={report.exporting}
        onExport={exportReport}
        config={{
          entityLabel: "transactions",
          showDateRange: true,
          showMember: !isMemberScoped,
          memberLocked: isMemberScoped,
          members: adultMembers,
          typeOptions: [
            { value: "all", label: "All types" },
            { value: "credit", label: "Credit" },
            { value: "debit", label: "Debit" },
            { value: "refund", label: "Refund" },
          ],
          categoryOptions: [
            { value: "all", label: "All categories" },
            { value: "play", label: "Play" },
            { value: "training", label: "Training" },
            { value: "other", label: "Other / Wallet" },
          ],
          typeLabel: "Transaction type",
        }}
      />
    </div>
  );
}
