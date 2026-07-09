import { createFileRoute, Link, Outlet, useRouterState, useMatches } from "@tanstack/react-router";
import { useCurrentUser, useStore } from "@/lib/store";
import { useRef } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/PageHeader";
import { StatusBadge } from "@/components/StatusBadge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Plus, Pencil, Wallet } from "lucide-react";
import { fmtMoney } from "@/lib/format";
import { SearchFilterBar, useSearchFilters, EmptyState } from "@/components/SearchFilterBar";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/members")({ component: MembersLayout });

function MembersLayout() {
  const matches = useMatches();
  const isIndex = matches[matches.length - 1].routeId === Route.id;
  if (!isIndex) return <Outlet />;
  return <MembersList />;
}

function MembersList() {
  const user = useCurrentUser()!;
  const all = useStore((s) => s.members);
  const deleteMember = useStore((s) => s.deleteMember);
  const activeRole = useStore((s) => s.activeRole) || user.role;
  const store = useStore();
  const fileInputRef = useRef<HTMLInputElement>(null);

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
    
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const {
    search,
    filters,
    sortBy,
    setSearch,
    setFilter,
    clearFilters,
    setSortBy,
  } = useSearchFilters({
    category: "all",
    status: "all",
    balance: "all",
    league: "all",
  }, "name-asc");

  const filterConfig = [
    {
      key: "category",
      label: "Category",
      options: [
        { value: "all", label: "All Categories" },
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
        { value: "inactive", label: "Inactive" },
      ],
    },
    {
      key: "balance",
      label: "Balance",
      options: [
        { value: "all", label: "All Balances" },
        { value: "positive", label: "Positive Balance" },
        { value: "negative", label: "Negative Balance" },
      ],
    },
    {
      key: "league",
      label: "League",
      options: [
        { value: "all", label: "All Members" },
        { value: "league", label: "League Only" },
        { value: "non-league", label: "Exclude League" },
      ],
    },
  ];

  const sortOptions = [
    { value: "name-asc", label: "Name A-Z" },
    { value: "name-desc", label: "Name Z-A" },
    { value: "balance-desc", label: "Balance: High to Low" },
    { value: "balance-asc", label: "Balance: Low to High" },
  ];

  const baseMembers = activeRole === "admin" ? all : all.filter((m) => m.userId === user.id);

  // Apply filters
  let processed = baseMembers.filter((m) => {
    const fullName = `${m.firstName} ${m.lastName}`.toLowerCase();
    return fullName.includes(search.toLowerCase());
  });

  if (filters.category !== "all") {
    processed = processed.filter((m) => m.memberType.toLowerCase() === filters.category);
  }

  if (filters.status !== "all") {
    processed = processed.filter((m) => m.status.toLowerCase() === filters.status);
  }

  if (filters.balance !== "all") {
    if (filters.balance === "positive") {
      processed = processed.filter((m) => m.credit >= 0);
    } else if (filters.balance === "negative") {
      processed = processed.filter((m) => m.credit < 0);
    }
  }

  if (filters.league !== "all") {
    if (filters.league === "league") {
      processed = processed.filter((m) => m.league);
    } else if (filters.league === "non-league") {
      processed = processed.filter((m) => !m.league);
    }
  }

  // Apply sorting
  processed = [...processed].sort((a, b) => {
    if (sortBy === "name-asc") {
      return `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`);
    }
    if (sortBy === "name-desc") {
      return `${b.firstName} ${b.lastName}`.localeCompare(`${a.firstName} ${a.lastName}`);
    }
    if (sortBy === "balance-desc") {
      return b.credit - a.credit;
    }
    if (sortBy === "balance-asc") {
      return a.credit - b.credit;
    }
    return 0;
  });

  return (
    <div>
      <PageHeader
        title={activeRole === "admin" ? "Members" : "Family roster"}
        description={activeRole === "admin" ? "Every member registered in the club." : "Manage your family's club profiles."}
        actions={
          <div className="flex gap-2">
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleBulkUpload}
              accept=".csv"
              className="hidden"
            />
            {activeRole === "admin" && (
              <Button
                variant="outline"
                className="btn-premium-outline h-[38px] px-4 hover:cursor-pointer"
                onClick={() => fileInputRef.current?.click()}
              >
                Bulk Upload
              </Button>
            )}
            {(activeRole === "admin" || activeRole === "member") && (
              <Button asChild className="btn-premium-solid h-[38px] px-4 hover:cursor-pointer">
                <Link to="/members/add"><Plus className="size-4" /> Add member</Link>
              </Button>
            )}
          </div>
        }
      />

      <SearchFilterBar
        searchPlaceholder="Search members by name..."
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

      {processed.length === 0 ? (
        <EmptyState onClear={clearFilters} />
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {processed.map((m) => {
            const isJunior = m.memberType.toLowerCase() === "junior";
            const avatarBgClass = isJunior ? "bg-[#1A1A0A] text-[#F59E0B]" : "bg-[#0D2E22] text-[#10B981]";

            return (
              <Card key={m.id} className="bg-[#131916] border-[rgba(255,255,255,0.06)] hover:border-[rgba(255,255,255,0.10)] hover:bg-[#1A2120] transition-all duration-200">
                <CardContent className="p-5 flex flex-col justify-between h-full">
                  <div>
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <Avatar className="size-10 border border-white/5">
                          <AvatarFallback className={`${avatarBgClass} font-semibold text-[14px]`}>
                            {m.firstName[0]}{m.lastName[0]}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex flex-col min-w-0">
                          <div className="font-semibold text-[15px] text-[#F1F0EE] truncate">{m.firstName} {m.lastName}</div>
                          <div className="text-[12px] text-[#8A8A9A] capitalize mt-0.5">{m.memberType} · {m.grade}</div>
                        </div>
                      </div>
                      <StatusBadge status={m.status} />
                    </div>

                    <div className="h-[1px] bg-[rgba(255,255,255,0.06)] my-4.5" />

                    <div className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-1.5 text-[#8A8A9A] text-[12px]">
                        <Wallet className="size-3.5 text-[#4A4A5A]" /> Balance
                      </div>
                      <div className="font-mono text-[15px] text-[#F1F0EE]">{fmtMoney(m.credit)}</div>
                    </div>
                  </div>

                  <div className="mt-4 flex gap-2 w-full">
                    {activeRole === "admin" && (
                      <Button asChild variant="outline" className="flex-1 btn-premium-outline h-11 md:h-8 text-[13px] md:text-xs hover:cursor-pointer">
                        <Link to="/members/$id/edit" params={{ id: m.id }}><Pencil className="size-3.5 mr-1" /> Edit</Link>
                      </Button>
                    )}
                    {activeRole === "admin" && (
                      <Button
                        variant="destructive"
                        className="flex-1 h-11 md:h-8 text-[13px] md:text-xs hover:cursor-pointer bg-red-950/40 border border-red-900/40 text-red-400 hover:bg-red-900/60 hover:text-red-200"
                        onClick={async () => {
                          if (confirm(`Are you sure you want to remove ${m.firstName} ${m.lastName}?`)) {
                            try {
                              await deleteMember(m.id);
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
                    {(activeRole === "admin" || activeRole === "member") && (
                      <Button asChild variant="outline" className="flex-1 btn-premium-violet-outline h-11 md:h-8 text-[13px] md:text-xs hover:cursor-pointer">
                        <Link to={`/credits?memberId=${m.id}` as any}>Credits</Link>
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}