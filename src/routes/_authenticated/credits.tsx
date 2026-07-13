import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect, useMemo } from "react";
import { toast } from "sonner";
import { useCurrentUser, useStore } from "@/lib/store";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatusBadge } from "@/components/StatusBadge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { fmtDate, fmtMoney } from "@/lib/format";
import { Wallet, Search, X, SlidersHorizontal, Calendar } from "lucide-react";
import { motion } from "framer-motion";
import { EmptyIllustration } from "@/components/EmptyIllustration";
import { cn } from "@/lib/utils";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";

type CreditsSearch = {
  memberId?: string;
};

export const Route = createFileRoute("/_authenticated/credits")({
  validateSearch: (search: Record<string, unknown>): CreditsSearch => {
    return {
      memberId: search.memberId as string | undefined,
    };
  },
  component: CreditsPage,
});

function CreditsPage() {
  const user = useCurrentUser()!;
  const s = useStore();
  const search = Route.useSearch();
  const myMembers = user.role === "admin" ? s.members : s.members.filter((m) => m.userId === user.id);
  const [memberId, setMemberId] = useState(() => search.memberId || (myMembers[0]?.id ?? ""));
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));

  useEffect(() => {
    if (search.memberId) {
      setMemberId(search.memberId);
    }
  }, [search.memberId]);
  const myReqs = s.creditRequests.filter((r) =>
    user.role === "admin" ? true : myMembers.some((m) => m.id === r.memberId),
  );

  const pendingCount = myReqs.filter((r) => r.status === "created").length;

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

  const hasActiveFilters = searchTerm !== "" || statusFilter !== "all" || fromDate !== "" || toDate !== "" || sortBy !== "newest";

  const filteredReqs = useMemo(() => {
    return myReqs
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
          reqDate.setHours(0,0,0,0);
          filterFrom.setHours(0,0,0,0);
          if (reqDate < filterFrom) return false;
        }
        if (toDate) {
          const reqDate = new Date(r.date);
          const filterTo = new Date(toDate);
          reqDate.setHours(0,0,0,0);
          filterTo.setHours(0,0,0,0);
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
  }, [myReqs, s.members, searchTerm, statusFilter, fromDate, toDate, sortBy]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!memberId || !amount) return;
    try {
      await s.requestCredit(memberId, parseFloat(amount), date);
      if (user.role === "admin") {
        toast.success("Credit added successfully");
      } else {
        toast.success("Credit request submitted for approval");
      }
      setAmount("");
    } catch (error: any) {
      toast.error(error.message || "Failed to submit credit request.");
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader title="Credits" description="Top-up requests and balance management." />

      <Card className="border-[rgba(255,255,255,0.06)] bg-[#131916]">
        <CardHeader>
          <CardTitle className="text-[13px] font-medium tracking-[0.12em] text-[#8A8A98] uppercase">
            {user.role === "admin" ? "Add member credit top-up" : "Request credit top-up"}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="grid sm:grid-cols-4 gap-4 items-end">
            <div className="space-y-2 sm:col-span-2">
              <Label className="text-[11px] font-medium text-[#8A8A98] uppercase tracking-[0.08em]">Member</Label>
              <Select value={memberId} onValueChange={setMemberId}>
                <SelectTrigger className="bg-[#0C0F0E] border-[rgba(255,255,255,0.06)] text-[#F1F0EE] h-[38px] cursor-pointer">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-[#1A2120] border-[rgba(255,255,255,0.10)] text-[#F1F0EE]">
                  {myMembers.map((m) => (
                    <SelectItem key={m.id} value={m.id} className="cursor-pointer hover:bg-white/5">
                      {m.firstName} {m.lastName} — bal {fmtMoney(m.credit)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-[11px] font-medium text-[#8A8A98] uppercase tracking-[0.08em]">Amount</Label>
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
            <div className="space-y-2">
              <Label className="text-[11px] font-medium text-[#8A8A98] uppercase tracking-[0.08em]">Date</Label>
              <Input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="bg-[#0C0F0E] border-[rgba(255,255,255,0.06)] text-[#F1F0EE] h-[38px] cursor-pointer"
              />
            </div>
            <Button type="submit" className="sm:col-span-4 btn-premium-solid h-[38px] font-medium hover:cursor-pointer mt-2">
              {user.role === "admin" ? "Add credit" : "Submit request"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card className="border-[rgba(255,255,255,0.06)] bg-[#131916] overflow-hidden">
        <CardHeader className="border-b border-[rgba(255,255,255,0.06)] py-4.5 px-6 flex flex-row items-center justify-between">
          <CardTitle className="text-[13px] font-medium tracking-[0.12em] text-[#8A8A98] uppercase flex items-center gap-2">
            <span>Credit Requests</span>
            {pendingCount > 0 && (
              <span className="text-[11px] font-semibold bg-[#F59E0B]/10 text-[#F59E0B] px-2 py-0.5 rounded-full">
                {pendingCount} pending
              </span>
            )}
          </CardTitle>
        </CardHeader>
        <div className="px-6 py-4 border-b border-[rgba(255,255,255,0.06)] bg-[#131916]">
          {/* Mobile Layout (sm and down) */}
          <div className="flex items-center gap-2 md:hidden">
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
            <Button
              variant="outline"
              onClick={() => setShowFilters(!showFilters)}
              className={cn(
                "flex items-center justify-center gap-2 border-[rgba(255,255,255,0.08)] bg-[#0C0F0E] hover:bg-white/5 text-[#F1F0EE] h-10 rounded-lg text-xs px-4 cursor-pointer",
                showFilters && "border-[#10B981] bg-[#10B981]/5 text-[#10B981]"
              )}
            >
              <SlidersHorizontal className="size-3.5" />
              <span>Filters</span>
              {hasActiveFilters && (
                <span className="size-1.5 rounded-full bg-[#10B981]" />
              )}
            </Button>
          </div>

          {/* Collapsible Mobile Filters Area */}
          {showFilters && (
            <div className="flex flex-col gap-3 mt-3 md:hidden p-3 bg-[#0C0F0E]/50 rounded-lg border border-[rgba(255,255,255,0.06)]">
              {/* Status */}
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

              {/* Date Range Selection inside mobile panel */}
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

              {/* Sort By */}
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

          {/* Desktop Toolbar (Hidden on mobile) */}
          <div className="hidden md:flex md:items-center justify-between gap-3 w-full">
            {/* Left side filters */}
            <div className="flex items-center gap-3 flex-wrap flex-1">
              {/* Search */}
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

              {/* Status */}
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className={cn(
                  "bg-[#0C0F0E] border-[rgba(255,255,255,0.08)] text-[#F1F0EE] h-10 w-[140px] rounded-lg cursor-pointer text-xs",
                  statusFilter !== "all" && "border-[#10B981] bg-[#10B981]/5 text-[#10B981]"
                )}>
                  <SelectValue placeholder="All Statuses" />
                </SelectTrigger>
                <SelectContent className="bg-[#1A2120] border-[rgba(255,255,255,0.10)] text-[#F1F0EE]">
                  <SelectItem value="all" className="text-xs">All Statuses</SelectItem>
                  <SelectItem value="created" className="text-xs">Pending</SelectItem>
                  <SelectItem value="approved" className="text-xs">Approved</SelectItem>
                  <SelectItem value="rejected" className="text-xs">Rejected</SelectItem>
                </SelectContent>
              </Select>

              {/* Date Range Popover */}
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "flex items-center gap-2 border-[rgba(255,255,255,0.08)] bg-[#0C0F0E] hover:bg-white/5 text-[#F1F0EE] h-10 rounded-lg px-3.5 text-xs cursor-pointer",
                      (fromDate || toDate) && "border-[#10B981] bg-[#10B981]/5 text-[#10B981]"
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
                <PopoverContent align="start" className="w-[300px] bg-[#131916] border-[rgba(255,255,255,0.1)] p-4 text-[#F1F0EE] rounded-lg shadow-xl">
                  <div className="space-y-3">
                    <h4 className="font-semibold text-xs text-[#8A8A98] tracking-wider uppercase">Filter by Date Range</h4>
                    <div className="grid gap-2">
                      <div className="grid gap-1">
                        <Label htmlFor="from" className="text-[10px] text-[#8A8A98]">From Date</Label>
                        <Input
                          id="from"
                          type="date"
                          value={fromDate}
                          onChange={(e) => setFromDate(e.target.value)}
                          className="bg-[#0C0F0E] border-[rgba(255,255,255,0.08)] text-[#F1F0EE] h-9 rounded-md text-xs"
                        />
                      </div>
                      <div className="grid gap-1">
                        <Label htmlFor="to" className="text-[10px] text-[#8A8A98]">To Date</Label>
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

            {/* Right side Sort */}
            <div className="flex items-center gap-2">
              <Select value={sortBy} onValueChange={setSortBy}>
                <SelectTrigger className="bg-[#0C0F0E] border-[rgba(255,255,255,0.08)] text-[#F1F0EE] h-10 w-[180px] rounded-lg cursor-pointer text-xs">
                  <SelectValue placeholder="Sort By" />
                </SelectTrigger>
                <SelectContent className="bg-[#1A2120] border-[rgba(255,255,255,0.10)] text-[#F1F0EE]">
                  <SelectItem value="newest" className="text-xs">Newest First</SelectItem>
                  <SelectItem value="oldest" className="text-xs">Oldest First</SelectItem>
                  <SelectItem value="amount_high" className="text-xs">Amount High to Low</SelectItem>
                  <SelectItem value="amount_low" className="text-xs">Amount Low to High</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        {/* Active Chips Row (below toolbar) */}
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
                <span>Status: {statusFilter === "created" ? "Pending" : statusFilter.charAt(0).toUpperCase() + statusFilter.slice(1)}</span>
                <button onClick={() => setStatusFilter("all")} className="hover:text-white transition-colors cursor-pointer">
                  <X className="size-3 text-[#10B981]" />
                </button>
              </span>
            )}
            {(fromDate || toDate) && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-medium bg-[#10B981]/15 text-[#10B981] rounded-full border border-[#10B981]/20">
                <span>
                  Date: {fromDate && toDate
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
          <Table>
            <TableHeader className="bg-[#0C0F0E]/30">
              <TableRow className="border-b border-[rgba(255,255,255,0.06)] hover:bg-transparent">
                <TableHead className="type-table-head py-3.5 px-6">Member</TableHead>
                <TableHead className="type-table-head py-3.5 px-6">Amount</TableHead>
                <TableHead className="type-table-head py-3.5 px-6">Date</TableHead>
                <TableHead className="type-table-head py-3.5 px-6">Status</TableHead>
                {user.role === "admin" && (
                  <TableHead className="type-table-head py-3.5 px-6">Actions</TableHead>
                )}
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredReqs.length === 0 ? (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={user.role === "admin" ? 5 : 4} className="p-0">
                    <EmptyIllustration
                      icon="wallet"
                      title={hasActiveFilters ? "No credit requests found" : "No credit requests yet"}
                      description={hasActiveFilters ? "Try adjusting your filters or search terms." : "Submit a top-up request and it will appear here for admin approval."}
                    />
                  </TableCell>
                </TableRow>
              ) : (
                filteredReqs.map((r, i) => {
                  const m = s.members.find((x) => x.id === r.memberId);
                  const initials = m ? `${m.firstName[0]}${m.lastName[0]}` : "??";
                  const avatarBgClass = m?.memberType.toLowerCase() === "junior" ? "bg-[#1A1A0A] text-[#F59E0B]" : "bg-[#0D2E22] text-[#10B981]";

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
                          <span className="font-bold text-[14px] text-[#EEF2F0]">
                            {m ? `${m.firstName} ${m.lastName}` : "Unknown Member"}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="py-3 px-6 type-mono-value">
                        {fmtMoney(r.amount)}
                      </TableCell>
                      <TableCell className="py-3 px-6 type-mono-value text-[#EEF2F0]">
                        {fmtDate(r.date)}
                      </TableCell>
                      <TableCell className="py-3 px-6">
                        <StatusBadge status={r.status} />
                      </TableCell>
                      {user.role === "admin" && (
                        <TableCell className="py-3 px-6">
                          {r.status === "created" ? (
                            <div className="flex items-center gap-2">
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
                            </div>
                          ) : (
                            <span className="text-[12px] text-[#4A5E58]">Processed</span>
                          )}
                        </TableCell>
                      )}
                    </motion.tr>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}