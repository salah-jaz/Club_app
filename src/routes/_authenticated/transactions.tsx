import { createFileRoute } from "@tanstack/react-router";
import { useCurrentUser, useStore } from "@/lib/store";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { fmtDateTime, fmtMoney } from "@/lib/format";
import { cn } from "@/lib/utils";
import { ArrowUpRight, ArrowDownLeft, Scale } from "lucide-react";

export const Route = createFileRoute("/_authenticated/transactions")({ component: Txns });

function Txns() {
  const user = useCurrentUser()!;
  const s = useStore();
  const myMemberIds = s.members.filter((m) => m.userId === user.id).map((m) => m.id);
  const txns = (user.role === "admin" ? s.transactions : s.transactions.filter((t) => myMemberIds.includes(t.memberId)))
    .slice().reverse();

  // Compute luxury summary statistics
  const creditTxns = txns.filter((t) => t.type === "credit");
  const debitTxns = txns.filter((t) => t.type === "debit");
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
              <div className="text-xl font-semibold mt-1 font-mono text-[#2DD4BF]">{fmtMoney(totalCredited)}</div>
            </div>
            <div className="size-9 rounded-lg bg-[#2DD4BF]/10 text-[#2DD4BF] grid place-items-center">
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
              <div className={cn("text-xl font-semibold mt-1 font-mono", netFlow >= 0 ? "text-[#34D399]" : "text-[#EF4444]")}>
                {netFlow >= 0 ? "+" : ""}{fmtMoney(netFlow)}
              </div>
            </div>
            <div className={cn("size-9 rounded-lg grid place-items-center", netFlow >= 0 ? "bg-[#34D399]/10 text-[#34D399]" : "bg-[#EF4444]/10 text-[#EF4444]")}>
              <Scale className="size-5" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Luxury Table Card */}
      <Card className="bg-[#131916] border-[rgba(255,255,255,0.06)] overflow-hidden">
        <CardContent className="p-0">
          {/* Mobile view */}
          <div className="block md:hidden divide-y divide-[rgba(255,255,255,0.04)]">
            {txns.length === 0 ? (
              <div className="text-center text-[#4A5E58] py-10 font-light text-[13px]">
                No transactions recorded.
              </div>
            ) : (
              txns.map((t) => {
                const m = s.members.find((x) => x.id === t.memberId);
                const isCredit = t.type === "credit";
                return (
                  <div key={t.id} className="p-4 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-[#F1F0EE]">{m?.firstName} {m?.lastName}</span>
                      <span className={cn(
                        "font-mono text-sm font-semibold",
                        isCredit ? "text-[#2DD4BF]" : "text-[#EF4444]"
                      )}>
                        {isCredit ? "+" : "−"}{fmtMoney(t.amount)}
                      </span>
                    </div>
                    <div className="text-xs text-[#8A8A98] font-light">
                      {t.description}
                    </div>
                    <div className="flex items-center justify-between text-[11px] pt-1">
                      <span className="font-mono text-[#8A8A98]/80">{fmtDateTime(t.date)}</span>
                      <span className={cn(
                        "px-1.5 py-0.5 rounded text-[9px] font-medium tracking-wider uppercase",
                        isCredit ? "bg-[#2DD4BF]/10 text-[#2DD4BF] border border-[#2DD4BF]/20" : "bg-[#EF4444]/10 text-[#EF4444] border border-[#EF4444]/20"
                      )}>
                        {t.type}
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Desktop view */}
          <div className="hidden md:block">
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
                {txns.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-[#4A5E58] py-10 font-light text-[13px]">
                      No transactions recorded.
                    </TableCell>
                  </TableRow>
                ) : (
                  txns.map((t) => {
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
                            isCredit ? "bg-[#2DD4BF]/10 text-[#2DD4BF] border border-[#2DD4BF]/20" : "bg-[#EF4444]/10 text-[#EF4444] border border-[#EF4444]/20"
                          )}>
                            {t.type}
                          </span>
                        </TableCell>
                        <TableCell className={cn(
                          "text-right font-mono text-[14px] font-medium px-5 py-4",
                          isCredit ? "text-[#2DD4BF]" : "text-[#EF4444]"
                        )}>
                          {isCredit ? "+" : "−"}{fmtMoney(t.amount)}
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}