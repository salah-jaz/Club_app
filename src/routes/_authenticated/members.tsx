import { createFileRoute, Link, Outlet, useMatches } from "@tanstack/react-router";
import { useCurrentUser, useStore } from "@/lib/store";
import { useMemo, useRef, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/PageHeader";
import { StatusBadge } from "@/components/StatusBadge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Plus, Pencil, Wallet, LayoutGrid, List, Users, UserRound, Trophy,
  Upload, Download, Mail, IdCard,
} from "lucide-react";
import { fmtMoney } from "@/lib/format";
import { SearchFilterBar, useSearchFilters } from "@/components/SearchFilterBar";
import { EmptyIllustration } from "@/components/EmptyIllustration";
import { AnimatedCounter } from "@/components/AnimatedCounter";
import { toast } from "sonner";
import { Trash2, LogIn } from "lucide-react";
import { motion } from "framer-motion";
import { staggerContainer, staggerItem } from "@/components/MotionWrapper";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { Member } from "@/lib/types";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/members")({ component: MembersLayout });

function MembersLayout() {
  const matches = useMatches();
  const isIndex = matches[matches.length - 1].routeId === Route.id;
  if (!isIndex) return <Outlet />;
  return <MembersList />;
}

const STAT_ACCENTS = [
  { border: "var(--primary)", iconBg: "var(--violet-dim)", iconColor: "var(--primary)" },
  { border: "#F59E0B", iconBg: "rgba(245,158,11,0.12)", iconColor: "#F59E0B" },
  { border: "var(--gold)", iconBg: "var(--gold-dim)", iconColor: "var(--gold)" },
  { border: "#818CF8", iconBg: "rgba(129,140,248,0.12)", iconColor: "#818CF8" },
];

function MemberStatCard({
  label,
  value,
  hint,
  icon: Icon,
  index,
}: {
  label: string;
  value: number;
  hint?: string;
  icon: typeof Users;
  index: number;
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
                <AnimatedCounter value={value} />
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

function MemberTags({ member }: { member: Member }) {
  const isJunior = member.memberType.toLowerCase() === "junior";
  return (
    <div className="flex flex-wrap gap-1.5">
      <Badge
        variant="outline"
        className={cn(
          "text-[10px] font-medium border px-2 py-0",
          isJunior
            ? "bg-[#F59E0B]/10 text-[#F59E0B] border-[#F59E0B]/25"
            : "bg-[#10B981]/10 text-[#34D399] border-[#10B981]/25",
        )}
      >
        {isJunior ? "Junior" : "Adult"}
      </Badge>
      {member.grade && (
        <Badge variant="outline" className="text-[10px] font-medium bg-white/[0.03] border-white/10 text-[#C4D4CF] px-2 py-0">
          {member.grade}
        </Badge>
      )}
      {member.league && (
        <Badge variant="outline" className="text-[10px] font-medium bg-[#818CF8]/10 text-[#A5B4FC] border-[#818CF8]/25 px-2 py-0">
          League
        </Badge>
      )}
      {member.membership && (
        <Badge variant="outline" className="text-[10px] font-medium bg-[#2DD4BF]/10 text-[#5EEAD4] border-[#2DD4BF]/25 px-2 py-0">
          Member
        </Badge>
      )}
      {member.trainingEligible && (
        <Badge variant="outline" className="text-[10px] font-medium bg-white/[0.03] border-white/10 text-[#8FA89F] px-2 py-0">
          Training
        </Badge>
      )}
    </div>
  );
}

function MemberActions({
  member,
  activeRole,
  deleteMember,
  compact = false,
}: {
  member: Member;
  activeRole: string;
  deleteMember: (id: string) => Promise<void>;
  compact?: boolean;
}) {
  const loginAs = useStore((s) => s.loginAs);
  const isJunior = member.memberType.toLowerCase() === "junior";
  const canEdit = activeRole === "admin" || (activeRole === "member" && isJunior);
  const canCredits = activeRole === "admin" || activeRole === "member";
  const btnClass = compact ? "h-8 text-xs" : "h-9 text-xs flex-1";

  return (
    <div className={cn("flex gap-2", compact ? "justify-end flex-wrap" : "w-full")}>
      {activeRole === "admin" && !isJunior && (
        <Button
          variant="outline"
          className={cn("bg-[#10B981]/10 text-[#34D399] border-[#10B981]/25 hover:bg-[#10B981]/20 hover:cursor-pointer", btnClass)}
          onClick={async () => {
            if (confirm(`Login as ${member.firstName} ${member.lastName}?`)) {
              try {
                await loginAs(member.id);
                toast.success(`Logged in as ${member.firstName}`);
                window.location.href = "/dashboard";
              } catch (error: any) {
                toast.error(error.message || "Failed to login as member.");
              }
            }
          }}
        >
          <LogIn className="size-3.5 mr-1" /> Login
        </Button>
      )}
      {canEdit && (
        <Button asChild variant="outline" className={cn("btn-premium-outline hover:cursor-pointer", btnClass)}>
          <Link to="/members/$id/edit" params={{ id: member.id }}>
            <Pencil className="size-3.5 mr-1" /> Edit
          </Link>
        </Button>
      )}
      {canCredits && (
        <Button asChild variant="outline" className={cn("btn-premium-violet-outline hover:cursor-pointer", btnClass)}>
          <Link to={`/credits?memberId=${member.id}` as any}>
            <Wallet className="size-3.5 mr-1" /> Credits
          </Link>
        </Button>
      )}
      {canEdit && (
        <Button
          variant="destructive"
          className={cn("btn-premium-danger hover:cursor-pointer", btnClass)}
          onClick={async () => {
            if (confirm(`Remove ${member.firstName} ${member.lastName} from the club?`)) {
              try {
                await deleteMember(member.id);
                toast.success("Member removed successfully");
              } catch (e: any) {
                toast.error(e.message || "Failed to remove member");
              }
            }
          }}
        >
          <Trash2 className="size-3.5 mr-1" /> Remove
        </Button>
      )}
    </div>
  );
}

function MembersList() {
  const user = useCurrentUser()!;
  const all = useStore((s) => s.members);
  const deleteMember = useStore((s) => s.deleteMember);
  const activeRole = useStore((s) => s.activeRole) || user.role;
  const store = useStore();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [viewMode, setViewMode] = useState<"grid" | "list">(
    () => (localStorage.getItem("clubapp-view-mode-members") as "grid" | "list") || "list",
  );

  const {
    search,
    filters,
    sortBy,
    setSearch,
    setFilter,
    clearFilters,
    setSortBy,
  } = useSearchFilters(
    { category: "all", status: "all", balance: "all", league: "all" },
    "name-asc",
  );

  const filterConfig = [
    {
      key: "category",
      label: "Type",
      options: [
        { value: "all", label: "All Types" },
        { value: "adult", label: "Adult" },
        { value: "junior", label: "Junior" },
      ],
    },
    {
      key: "status",
      label: "Status",
      options: [
        { value: "all", label: "All Statuses" },
        { value: "active", label: "Active" },
        { value: "disabled", label: "Disabled" },
      ],
    },
    {
      key: "balance",
      label: "Balance",
      options: [
        { value: "all", label: "All Balances" },
        { value: "positive", label: "Has Credit" },
        { value: "negative", label: "Owes / Negative" },
      ],
    },
    {
      key: "league",
      label: "League",
      options: [
        { value: "all", label: "Everyone" },
        { value: "league", label: "League Players" },
        { value: "non-league", label: "Non-League" },
      ],
    },
  ];

  const sortOptions = [
    { value: "name-asc", label: "Name A → Z" },
    { value: "name-desc", label: "Name Z → A" },
    { value: "balance-desc", label: "Balance: High → Low" },
    { value: "balance-asc", label: "Balance: Low → High" },
  ];

  const baseMembers = useMemo(
    () => (activeRole === "admin" ? all : all.filter((m) => m.userId === user.id)),
    [activeRole, all, user.id],
  );

  const stats = useMemo(() => ({
    total: baseMembers.length,
    adults: baseMembers.filter((m) => m.memberType.toLowerCase() === "adult").length,
    juniors: baseMembers.filter((m) => m.memberType.toLowerCase() === "junior").length,
    league: baseMembers.filter((m) => m.league).length,
    active: baseMembers.filter((m) => m.status === "active").length,
  }), [baseMembers]);

  const processed = useMemo(() => {
    let list = baseMembers.filter((m) => {
      const fullName = `${m.firstName} ${m.lastName}`.toLowerCase();
      const email = m.email.toLowerCase();
      const q = search.toLowerCase();
      return fullName.includes(q) || email.includes(q) || (m.biMemberId?.toLowerCase().includes(q) ?? false);
    });

    if (filters.category !== "all") {
      list = list.filter((m) => m.memberType.toLowerCase() === filters.category);
    }
    if (filters.status !== "all") {
      list = list.filter((m) => m.status.toLowerCase() === filters.status);
    }
    if (filters.balance === "positive") {
      list = list.filter((m) => m.credit > 0);
    } else if (filters.balance === "negative") {
      list = list.filter((m) => m.credit < 0);
    }
    if (filters.league === "league") {
      list = list.filter((m) => m.league);
    } else if (filters.league === "non-league") {
      list = list.filter((m) => !m.league);
    }

    return [...list].sort((a, b) => {
      if (sortBy === "name-asc") {
        return `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`);
      }
      if (sortBy === "name-desc") {
        return `${b.firstName} ${b.lastName}`.localeCompare(`${a.firstName} ${a.lastName}`);
      }
      if (sortBy === "balance-desc") return b.credit - a.credit;
      if (sortBy === "balance-asc") return a.credit - b.credit;
      return 0;
    });
  }, [baseMembers, search, filters, sortBy]);

  const hasActiveFilters =
    !!search || Object.values(filters).some((f) => f !== "all");

  const quickFilters = [
    { id: "all", label: "All", apply: () => { clearFilters(); } },
    { id: "adult", label: "Adults", apply: () => setFilter("category", "adult") },
    { id: "junior", label: "Juniors", apply: () => setFilter("category", "junior") },
    { id: "league", label: "League", apply: () => setFilter("league", "league") },
    { id: "active", label: "Active", apply: () => setFilter("status", "active") },
  ];

  const isQuickActive = (id: string) => {
    if (id === "all") return !hasActiveFilters;
    if (id === "adult") return filters.category === "adult" && !search;
    if (id === "junior") return filters.category === "junior" && !search;
    if (id === "league") return filters.league === "league" && !search;
    if (id === "active") return filters.status === "active" && !search;
    return false;
  };

  const handleBulkUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const loadingToast = toast.loading("Uploading CSV and creating members...");
    try {
      await store.bulkUploadMembers(file);
      toast.dismiss(loadingToast);
      toast.success("Members uploaded successfully!");
    } catch (err: any) {
      toast.dismiss(loadingToast);
      toast.error(err.message || "Failed to upload members.");
    }
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const downloadTemplate = () => {
    const headers = [
      "first_name", "last_name", "email", "sex", "dob", "mobile", "address",
      "member_type", "membership", "league", "training_eligible", "grade", "bi_member_id", "status",
    ];
    const exampleRow = [
      "Jane", "Doe", "jane.doe@example.com", "female", "1992-04-15", "+1 555 0199",
      "123 Main Street", "adult", "true", "true", "false", "Intermediate", "BI-9999", "active",
    ];
    const link = document.createElement("a");
    link.href = encodeURI("data:text/csv;charset=utf-8," + [headers.join(","), exampleRow.join(",")].join("\n"));
    link.download = "member_bulk_upload_template.csv";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6 pb-8">
      <PageHeader
        title={activeRole === "admin" ? "Members" : "Family roster"}
        description={
          activeRole === "admin"
            ? "Browse, filter, and manage every club member in one place."
            : "View and manage your family's club profiles."
        }
        actions={
          <div className="flex flex-wrap gap-2">
            <input type="file" ref={fileInputRef} onChange={handleBulkUpload} accept=".csv" className="hidden" />
            {activeRole === "admin" && (
              <>
                <Button
                  variant="outline"
                  className="btn-premium-outline h-[38px] px-3 hover:cursor-pointer"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Upload className="size-4 mr-1.5" /> Bulk upload
                </Button>
                <Button
                  variant="ghost"
                  className="text-xs text-[#8FA89F] hover:text-[#EEF2F0] h-[38px] px-3 border border-dashed border-[rgba(255,255,255,0.08)] rounded-lg hover:cursor-pointer"
                  onClick={downloadTemplate}
                >
                  <Download className="size-4 mr-1.5" /> Template
                </Button>
              </>
            )}
            {(activeRole === "admin" || activeRole === "member") && (
              <Button asChild className="btn-premium-solid h-[38px] px-4 hover:cursor-pointer">
                <Link to="/members/add"><Plus className="size-4 mr-1.5" /> Add member</Link>
              </Button>
            )}
          </div>
        }
      />

      {/* Overview stats */}
      <motion.div
        variants={staggerContainer}
        initial="hidden"
        animate="show"
        className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4"
      >
        <MemberStatCard label="Total" value={stats.total} hint="Registered members" icon={Users} index={0} />
        <MemberStatCard label="Adults" value={stats.adults} hint={`${stats.juniors} juniors`} icon={UserRound} index={1} />
        <MemberStatCard label="League" value={stats.league} hint="League-eligible" icon={Trophy} index={2} />
        <MemberStatCard label="Active" value={stats.active} hint="Currently active" icon={Users} index={3} />
      </motion.div>

      {/* Quick filters */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[10px] font-semibold tracking-wider text-[#6B7F78] uppercase mr-1">Quick view</span>
        {quickFilters.map((qf) => (
          <button
            key={qf.id}
            type="button"
            onClick={qf.apply}
            className={cn(
              "px-3 py-1.5 rounded-full text-xs font-medium transition-all cursor-pointer border",
              isQuickActive(qf.id)
                ? "bg-[rgba(16,185,129,0.12)] text-[#34D399] border-[rgba(16,185,129,0.35)]"
                : "bg-transparent text-[#8A8A98] border-transparent hover:text-[#EEF2F0] hover:border-white/10",
            )}
          >
            {qf.label}
          </button>
        ))}
      </div>

      <SearchFilterBar
        searchPlaceholder="Search by name, email, or BI ID..."
        searchValue={search}
        onSearchChange={setSearch}
        filters={filterConfig}
        activeFilters={filters}
        onFilterChange={setFilter}
        onClearAll={clearFilters}
        sortOptions={sortOptions}
        currentSort={sortBy}
        onSortChange={setSortBy}
      />

      {/* Results toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 -mt-2">
        <div className="text-sm text-[#8FA89F]">
          Showing <span className="text-[#EEF2F0] font-semibold">{processed.length}</span>
          {processed.length !== baseMembers.length && (
            <> of <span className="text-[#EEF2F0] font-semibold">{baseMembers.length}</span></>
          )}{" "}
          members
        </div>
        <div className="flex items-center gap-1 bg-[#131916] border border-[rgba(255,255,255,0.06)] p-0.5 rounded-lg self-start">
          <button
            type="button"
            onClick={() => { setViewMode("list"); localStorage.setItem("clubapp-view-mode-members", "list"); }}
            className={cn(
              "p-1.5 rounded-md transition-all cursor-pointer",
              viewMode === "list" ? "bg-[#1A2120] text-[#2FD9A0]" : "text-[#8FA89F] hover:text-[#EEF2F0]",
            )}
            title="Table view"
          >
            <List className="size-4" />
          </button>
          <button
            type="button"
            onClick={() => { setViewMode("grid"); localStorage.setItem("clubapp-view-mode-members", "grid"); }}
            className={cn(
              "p-1.5 rounded-md transition-all cursor-pointer",
              viewMode === "grid" ? "bg-[#1A2120] text-[#2FD9A0]" : "text-[#8FA89F] hover:text-[#EEF2F0]",
            )}
            title="Card view"
          >
            <LayoutGrid className="size-4" />
          </button>
        </div>
      </div>

      {processed.length === 0 ? (
        <EmptyIllustration
          icon="users"
          title="No members found"
          description={
            hasActiveFilters
              ? "No members match your search or filters. Try a different keyword or clear filters."
              : "No members have been added yet. Add your first member to get started."
          }
          ctaLabel={hasActiveFilters ? "Clear filters" : activeRole !== "volunteer" ? "Add member" : undefined}
          onCta={hasActiveFilters ? clearFilters : undefined}
          ctaTo={!hasActiveFilters && activeRole !== "volunteer" ? "/members/add" : undefined}
        />
      ) : viewMode === "grid" ? (
        <motion.div
          variants={staggerContainer}
          initial="hidden"
          animate="show"
          className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4"
        >
          {processed.map((m) => {
            const isJunior = m.memberType.toLowerCase() === "junior";
            const avatarBg = isJunior ? "bg-[#1A1A0A] text-[#F59E0B]" : "bg-[#0D2E22] text-[#10B981]";
            return (
              <motion.div key={m.id} variants={staggerItem} whileHover={{ y: -3 }} transition={{ duration: 0.18 }}>
                <Card className="bg-[#131916] border-[rgba(255,255,255,0.06)] hover:border-[rgba(255,255,255,0.12)] h-full signature-card-top">
                  <CardContent className="p-5 flex flex-col gap-4 h-full">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <Avatar className="size-11 border border-white/10 shrink-0">
                          <AvatarFallback className={cn(avatarBg, "font-semibold text-sm")}>
                            {m.firstName[0]}{m.lastName[0]}
                          </AvatarFallback>
                        </Avatar>
                        <div className="min-w-0">
                          <h3 className="font-semibold text-[15px] text-[#EEF2F0] truncate">
                            {m.firstName} {m.lastName}
                          </h3>
                          <p className="text-[12px] text-[#8FA89F] truncate flex items-center gap-1 mt-0.5">
                            <Mail className="size-3 shrink-0" /> {m.email}
                          </p>
                        </div>
                      </div>
                      <StatusBadge status={m.status} />
                    </div>

                    <MemberTags member={m} />

                    <div className="grid grid-cols-2 gap-3 text-xs">
                      <div className="rounded-lg bg-[#0C0F0E]/60 border border-white/[0.04] px-3 py-2.5">
                        <p className="text-[#6B7F78] uppercase tracking-wider text-[10px] font-medium mb-1">Balance</p>
                        <p className={cn("font-mono font-semibold text-sm", m.credit < 0 ? "text-[#F87171]" : "text-[#34D399]")}>
                          {fmtMoney(m.credit)}
                        </p>
                      </div>
                      <div className="rounded-lg bg-[#0C0F0E]/60 border border-white/[0.04] px-3 py-2.5">
                        <p className="text-[#6B7F78] uppercase tracking-wider text-[10px] font-medium mb-1">BI ID</p>
                        <p className="font-mono text-[#C4D4CF] truncate flex items-center gap-1">
                          <IdCard className="size-3 shrink-0 text-[#6B7F78]" />
                          {m.biMemberId || "—"}
                        </p>
                      </div>
                    </div>

                    <div className="mt-auto pt-1">
                      <MemberActions member={m} activeRole={activeRole} deleteMember={deleteMember} />
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            );
          })}
        </motion.div>
      ) : (
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader className="bg-muted/70 border-b border-border">
                <TableRow className="border-b border-border hover:bg-transparent">
                  <TableHead className="type-table-head h-11 px-4 min-w-[200px]">Member</TableHead>
                  <TableHead className="type-table-head h-11">Type</TableHead>
                  <TableHead className="type-table-head h-11">Grade</TableHead>
                  <TableHead className="type-table-head h-11">Flags</TableHead>
                  <TableHead className="type-table-head h-11 text-right">Balance</TableHead>
                  <TableHead className="type-table-head h-11">Status</TableHead>
                  <TableHead className="type-table-head h-11 text-right px-4 min-w-[200px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {processed.map((m) => {
                  const isJunior = m.memberType.toLowerCase() === "junior";
                  const avatarBg = isJunior ? "bg-[#1A1A0A] text-[#F59E0B]" : "bg-[#0D2E22] text-[#10B981]";
                  return (
                    <TableRow
                      key={m.id}
                      className="border-b border-border hover:bg-muted/40 transition-colors"
                    >
                      <TableCell className="px-4 py-3.5">
                        <div className="flex items-center gap-3 min-w-0">
                          <Avatar className="size-9 border border-white/10 shrink-0">
                            <AvatarFallback className={cn(avatarBg, "font-semibold text-xs")}>
                              {m.firstName[0]}{m.lastName[0]}
                            </AvatarFallback>
                          </Avatar>
                          <div className="min-w-0">
                            <p className="font-semibold text-[14px] text-[#EEF2F0] truncate">
                              {m.firstName} {m.lastName}
                            </p>
                            <p className="text-[11px] text-[#6B7F78] truncate">{m.email}</p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="type-table-body capitalize">{m.memberType}</TableCell>
                      <TableCell className="type-table-body">{m.grade || "—"}</TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1 max-w-[140px]">
                          {m.league && (
                            <Badge variant="outline" className="text-[9px] px-1.5 py-0 border-[#818CF8]/30 text-[#A5B4FC]">L</Badge>
                          )}
                          {m.membership && (
                            <Badge variant="outline" className="text-[9px] px-1.5 py-0 border-[#2DD4BF]/30 text-[#5EEAD4]">M</Badge>
                          )}
                          {m.trainingEligible && (
                            <Badge variant="outline" className="text-[9px] px-1.5 py-0 border-white/15 text-[#8FA89F]">T</Badge>
                          )}
                          {!m.league && !m.membership && !m.trainingEligible && (
                            <span className="text-[#6B7F78] text-xs">—</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className={cn("type-mono-value text-right", m.credit < 0 && "text-[#F87171]")}>
                        {fmtMoney(m.credit)}
                      </TableCell>
                      <TableCell><StatusBadge status={m.status} /></TableCell>
                      <TableCell className="text-right px-4">
                        <MemberActions member={m} activeRole={activeRole} deleteMember={deleteMember} compact />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
          <div className="px-4 py-2.5 border-t border-border text-[10px] text-muted-foreground bg-muted/30">
            Flags: <span className="text-[#A5B4FC]">L</span> = League · <span className="text-[#5EEAD4]">M</span> = Membership · <span className="text-[#8FA89F]">T</span> = Training eligible
          </div>
        </div>
      )}
    </div>
  );
}
