import { createFileRoute } from "@tanstack/react-router";
import { useCurrentUser, useStore } from "@/lib/store";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { fmtDateTime, fmtMoney, fmtDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { ArrowUpRight, ArrowDownLeft, Scale, Search, X, SlidersHorizontal, Calendar } from "lucide-react";
import { useState, useMemo } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/transactions")({ component: Txns });

function Txns() {
  const user = useCurrentUser()!;
  const s = useStore();
  const myMemberIds = useMemo(() => s.members.filter((m) => m.userId === user.id).map((m) => m.id), [s.members, user.id]);

  const [searchTerm, setSearchTerm] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [sortBy, setSortBy] = useState("newest");

  const resetFilters = () => {
    setSearchTerm("");
    setTypeFilter("all");
    setFromDate("");
    setToDate("");
    setSortBy("newest");
  };

  const hasActiveFilters = searchTerm !== "" || typeFilter !== "all" || fromDate !== "" || toDate !== "";

  const filteredTxns = useMemo(() => {
    let result = (user.role === "admin" ? s.transactions : s.transactions.filter((t) => myMemberIds.includes(t.memberId)));

    // Search filter (member name or description)
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      result = result.filter((t) => {
        const m = s.members.find((x) => x.id === t.memberId);
        const fullName = (m ? `${m.firstName} ${m.lastName} ${m.nickname || ""}` : "").toLowerCase();
        return fullName.includes(term) || t.description.toLowerCase().includes(term);
      });
    }

    // Type filter
    if (typeFilter !== "all") {
      result = result.filter((t) => t.type === typeFilter);
    }

    // Date range filter
    if (fromDate) {
      const filterFrom = new Date(fromDate);
      filterFrom.setHours(0, 0, 0, 0);
      result = result.filter((t) => {
        const txnDate = new Date(t.date);
        txnDate.setHours(0, 0, 0, 0);
        return txnDate >= filterFrom;
      });
    }
    if (toDate) {
      const filterTo = new Date(toDate);
      filterTo.setHours(0, 0, 0, 0);
      result = result.filter((t) => {
        const txnDate = new Date(t.date);
        txnDate.setHours(0, 0, 0, 0);
        return txnDate <= filterTo;
      });
    }

    // Sorting
    return result.slice().sort((a, b) => {
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
  }, [s.transactions, s.members, myMemberIds, user.role, searchTerm, typeFilter, fromDate, toDate, sortBy]);

  // Compute luxury summary statistics dynamically from filtered transactions
  const creditTxns = filteredTxns.filter((t) => t.type === "credit");
  const debitTxns = filteredTxns.filter((t) => t.type === "debit");
  const totalCredited = creditTxns.reduce((sum, t) => sum + t.amount, 0);
  const totalDebited = debitTxns.reduce((sum, t) => sum + t.amount, 0);
  const netFlow = totalCredited - totalDebited;

  return (
    <div className="space-y-6">
      <PageHeader title="Transactions" description="Sleek audit log of all account credits and session debits." />

      {/* Premium Summary Statistics Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="signature-card-top bg-[#131916] border-[rgba(255,255,255,0.06)]">
          <CardContent className="p-5 flex items-center justify-between">
            <div>
              <span className="text-[10px] font-medium tracking-[0.12em] text-[#8A8A98] uppercase block">Total Credited</span>
              <div className="text-xl font-semibold mt-1 font-mono static-financial-credit-text">{fmtMoney(totalCredited)}</div>
            </div>
            <div className="size-9 rounded-lg static-financial-credit-bg-dim static-financial-credit-text grid place-items-center">
              <ArrowUpRight className="size-5" />
            </div>
          </CardContent>
        </Card>

        <Card className="signature-card-top bg-[#131916] border-[rgba(255,255,255,0.06)]">
          <CardContent className="p-5 flex items-center justify-between">
            <div>
              <span className="text-[10px] font-medium tracking-[0.12em] text-[#8A8A98] uppercase block">Total Debited</span>
              <div className="text-xl font-semibold mt-1 font-mono text-[#EF4444]">{fmtMoney(totalDebited)}</div>
            </div>
            <div className="size-9 rounded-lg bg-[#EF4444]/10 text-[#EF4444] grid place-items-center">
              <ArrowDownLeft className="size-5" />
            </div>
          </CardContent>
        </Card>

        <Card className="signature-card-top bg-[#131916] border-[rgba(255,255,255,0.06)]">
          <CardContent className="p-5 flex items-center justify-between">
            <div>
              <span className="text-[10px] font-medium tracking-[0.12em] text-[#8A8A98] uppercase block">Net Account Flow</span>
              <div className={cn("text-xl font-semibold mt-1 font-mono", netFlow >= 0 ? "static-financial-inflow-text" : "text-[#EF4444]")}>
                {netFlow >= 0 ? "+" : ""}{fmtMoney(netFlow)}
              </div>
            </div>
            <div className={cn("size-9 rounded-lg grid place-items-center", netFlow >= 0 ? "static-financial-inflow-bg-dim static-financial-inflow-text" : "bg-[#EF4444]/10 text-[#EF4444]")}>
              <Scale className="size-5" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filter Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6 bg-[#131916] border border-[rgba(255,255,255,0.06)] p-3.5 rounded-xl">
        <div className="flex items-center gap-3 flex-1 flex-wrap">
          {/* Search */}
          <div className="relative w-full max-w-[320px]">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-[#8A8A98]" />
            <Input
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search member or description..."
              className="pl-9 pr-9 bg-[#0C0F0E] border-[rgba(255,255,255,0.08)] text-[#F1F0EE] h-10 rounded-lg text-xs focus-visible:ring-1 focus-visible:ring-[#10B981]"
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm("")}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[#8A8A98] hover:text-white cursor-pointer"
              >
                <X className="size-3.5" />
              </button>
            )}
          </div>

          {/* Type Filter Dropdown */}
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className={cn(
              "bg-[#0C0F0E] border-[rgba(255,255,255,0.08)] text-[#F1F0EE] h-10 w-[150px] rounded-lg cursor-pointer text-xs",
              typeFilter !== "all" && "border-[#10B981] bg-[#10B981]/5 text-[#10B981]"
            )}>
              <SelectValue placeholder="All Types" />
            </SelectTrigger>
            <SelectContent className="bg-[#1A2120] border-[rgba(255,255,255,0.10)] text-[#F1F0EE]">
              <SelectItem value="all" className="text-xs">All Types</SelectItem>
              <SelectItem value="credit" className="text-xs">Credit</SelectItem>
              <SelectItem value="debit" className="text-xs">Debit</SelectItem>
            </SelectContent>
          </Select>

          {/* Date Range Popover */}
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className={cn(
                  "bg-[#0C0F0E] border-[rgba(255,255,255,0.08)] text-[#8A8A98] h-10 rounded-lg text-xs flex items-center gap-2 px-3 cursor-pointer hover:bg-white/5 hover:text-[#F1F0EE]",
                  (fromDate || toDate) && "border-[#10B981] bg-[#10B981]/5 text-[#10B981] hover:bg-[#10B981]/10 hover:text-[#10B981]"
                )}
              >
                <Calendar className="size-4 shrink-0" />
                <span>
                  {fromDate && toDate
                    ? `${fmtDate(fromDate)} – ${fmtDate(toDate)}`
                    : fromDate
                    ? `From ${fmtDate(fromDate)}`
                    : toDate
                    ? `To ${fmtDate(toDate)}`
                    : "Display Date Range"}
                </span>
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-80 bg-[#131916] border-[rgba(255,255,255,0.08)] p-4 text-[#F1F0EE] rounded-xl shadow-2xl space-y-4">
              <div className="space-y-1">
                <h4 className="font-medium text-xs text-[#F1F0EE]">Filter by Date Range</h4>
                <p className="text-[10px] text-[#8A8A98]">Select date range to filter transactions</p>
              </div>
              <div className="grid gap-3">
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

      {/* Active Chips Row */}
      {hasActiveFilters && (
        <div className="flex flex-wrap items-center gap-2 mb-6 bg-[#131916] p-3 border border-[rgba(255,255,255,0.06)] rounded-xl">
          <span className="text-[11px] font-medium text-[#8A8A98]">Active Filters:</span>
          {searchTerm && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-medium bg-[#10B981]/15 text-[#10B981] rounded-full border border-[#10B981]/20">
              <span>Search: {searchTerm}</span>
              <button onClick={() => setSearchTerm("")} className="hover:text-white transition-colors cursor-pointer">
                <X className="size-3 text-[#10B981]" />
              </button>
            </span>
          )}
          {typeFilter !== "all" && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-medium bg-[#10B981]/15 text-[#10B981] rounded-full border border-[#10B981]/20">
              <span className="capitalize">Type: {typeFilter}</span>
              <button onClick={() => setTypeFilter("all")} className="hover:text-white transition-colors cursor-pointer">
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

      {/* Luxury Table Card */}
      <Card className="bg-[#131916] border-[rgba(255,255,255,0.06)] overflow-hidden">
        <CardContent className="p-0">
          <Table>
            <TableHeader className="bg-[#0C0F0E]/60">
              <TableRow className="border-b border-[rgba(255,255,255,0.06)] hover:bg-transparent">
                <TableHead className="text-[10px] font-medium tracking-[0.12em] text-[#8A8A98] uppercase h-11 px-5">Date & Time</TableHead>
                <TableHead className="text-[10px] font-medium tracking-[0.12em] text-[#8A8A98] uppercase h-11">Member</TableHead>
                <TableHead className="text-[10px] font-medium tracking-[0.12em] text-[#8A8A98] uppercase h-11">Description</TableHead>
                <TableHead className="text-[10px] font-medium tracking-[0.12em] text-[#8A8A98] uppercase h-11">Type</TableHead>
                <TableHead className="text-[10px] font-medium tracking-[0.12em] text-[#8A8A98] uppercase h-11 text-right px-5">Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredTxns.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-[#4A5E58] py-10 font-light text-[13px]">
                    {hasActiveFilters ? "No transactions found matching your filters." : "No transactions recorded."}
                  </TableCell>
                </TableRow>
              ) : (
                filteredTxns.map((t) => {
                  const m = s.members.find((x) => x.id === t.memberId);
                  const isCredit = t.type === "credit";
                  return (
                    <TableRow key={t.id} className="border-b border-[rgba(255,255,255,0.04)] hover:bg-white/[0.02] transition-colors">
                      <TableCell className="font-mono text-xs text-[#8A8A98] px-5 py-4">{fmtDateTime(t.date)}</TableCell>
                      <TableCell className="text-[#F1F0EE] font-medium text-[13px]">{m?.firstName} {m?.lastName}</TableCell>
                      <TableCell className="text-[#8A8A98] text-[13px] font-light">{t.description}</TableCell>
                      <TableCell className="py-4">
                        <span className={cn(
                          "px-2 py-0.5 rounded text-[10px] font-medium tracking-wider uppercase",
                          isCredit ? "static-financial-credit-bg-dim static-financial-credit-text border static-financial-credit-border-dim" : "bg-[#EF4444]/10 text-[#EF4444] border border-[#EF4444]/20"
                        )}>
                          {t.type}
                        </span>
                      </TableCell>
                      <TableCell className={cn(
                        "text-right font-mono text-[14px] font-medium px-5 py-4",
                        isCredit ? "static-financial-credit-text" : "text-[#EF4444]"
                      )}>
                        {isCredit ? "+" : "−"}{fmtMoney(t.amount)}
                      </TableCell>
                    </TableRow>
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