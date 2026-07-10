import { createFileRoute, Link, Outlet, useMatches } from "@tanstack/react-router";
import { useCurrentUser, useStore } from "@/lib/store";
import { useRef, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/PageHeader";
import { StatusBadge } from "@/components/StatusBadge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Plus, Pencil, Wallet, LayoutGrid, List } from "lucide-react";
import { fmtMoney } from "@/lib/format";
import { SearchFilterBar, useSearchFilters } from "@/components/SearchFilterBar";
import { EmptyIllustration } from "@/components/EmptyIllustration";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { motion } from "framer-motion";
import { staggerContainer, staggerItem } from "@/components/MotionWrapper";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

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
  const [viewMode, setViewMode] = useState<"grid" | "list">(
    () => (localStorage.getItem("clubapp-view-mode-members") as "grid" | "list") || "grid"
  );

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

  const downloadTemplate = () => {
    const headers = [
      "first_name",
      "last_name",
      "email",
      "sex",
      "dob",
      "mobile",
      "address",
      "member_type",
      "membership",
      "league",
      "training_eligible",
      "grade",
      "bi_member_id",
      "status"
    ];
    const exampleRow = [
      "Jane",
      "Doe",
      "jane.doe@example.com",
      "female",
      "1992-04-15",
      "+1 555 0199",
      "123 Main Street",
      "adult",
      "true",
      "true",
      "false",
      "Intermediate",
      "BI-9999",
      "active"
    ];
    const csvContent = "data:text/csv;charset=utf-8," 
      + [headers.join(","), exampleRow.join(",")].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "member_bulk_upload_template.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
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
              <>
                <Button
                  variant="outline"
                  className="btn-premium-outline h-[38px] px-4 hover:cursor-pointer"
                  onClick={() => fileInputRef.current?.click()}
                >
                  Bulk Upload
                </Button>
                <Button
                  variant="ghost"
                  className="text-xs text-[#8FA89F] hover:text-[#EEF2F0] hover:bg-white/5 h-[38px] px-3 border border-dashed border-[rgba(255,255,255,0.08)] rounded-lg hover:cursor-pointer"
                  onClick={downloadTemplate}
                  title="Download CSV Example Template"
                >
                  Download Template
                </Button>
              </>
            )}
            {(activeRole === "admin" || activeRole === "member") && (
              <motion.div whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}>
                <Button asChild className="btn-premium-solid h-[38px] px-4 hover:cursor-pointer">
                  <Link to="/members/add"><Plus className="size-4" /> Add member</Link>
                </Button>
              </motion.div>
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

      <div className="flex items-center justify-between mb-4 mt-6">
        <span className="type-helper text-xs">{processed.length} members found</span>
        <div className="flex items-center gap-1 bg-[#131916] border border-[rgba(255,255,255,0.06)] p-0.5 rounded-lg">
          <button
            onClick={() => {
              setViewMode("grid");
              localStorage.setItem("clubapp-view-mode-members", "grid");
            }}
            className={`p-1.5 rounded-md transition-all cursor-pointer ${
              viewMode === "grid" ? "bg-[#1A2120] text-[#2FD9A0]" : "text-[#8FA89F] hover:text-[#EEF2F0]"
            }`}
            title="Grid view"
          >
            <LayoutGrid className="size-4" />
          </button>
          <button
            onClick={() => {
              setViewMode("list");
              localStorage.setItem("clubapp-view-mode-members", "list");
            }}
            className={`p-1.5 rounded-md transition-all cursor-pointer ${
              viewMode === "list" ? "bg-[#1A2120] text-[#2FD9A0]" : "text-[#8FA89F] hover:text-[#EEF2F0]"
            }`}
            title="List view"
          >
            <List className="size-4" />
          </button>
        </div>
      </div>

      {processed.length === 0 ? (
        <EmptyIllustration
          icon="users"
          title="No members found"
          description={
            search || Object.values(filters).some((f) => f !== "all")
              ? "Try adjusting your search or filters to find what you're looking for."
              : "No members have been added yet. Add your first member to get started."
          }
          ctaLabel={
            search || Object.values(filters).some((f) => f !== "all")
              ? "Clear filters"
              : activeRole !== "volunteer" ? "Add member" : undefined
          }
          onCta={
            search || Object.values(filters).some((f) => f !== "all")
              ? clearFilters
              : undefined
          }
          ctaTo={
            !(search || Object.values(filters).some((f) => f !== "all")) && activeRole !== "volunteer"
              ? "/members/add"
              : undefined
          }
        />
      ) : viewMode === "grid" ? (
        <motion.div
          variants={staggerContainer}
          initial="hidden"
          animate="show"
          className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5"
        >
          {processed.map((m) => {
            const isJunior = m.memberType.toLowerCase() === "junior";
            const avatarBgClass = isJunior ? "bg-[#1A1A0A] text-[#F59E0B]" : "bg-[#0D2E22] text-[#10B981]";

            return (
              <motion.div
                key={m.id}
                variants={staggerItem}
                whileHover={{ y: -4, boxShadow: "0 14px 36px rgba(0,0,0,0.4), 0 0 0 1px rgba(16,185,129,0.10)" }}
                whileTap={{ scale: 0.98 }}
                transition={{ duration: 0.18, ease: "easeOut" }}
              >
                <Card className="bg-[#131916] border-[rgba(255,255,255,0.06)] hover:border-[rgba(255,255,255,0.10)] hover:bg-[#1A2120] transition-colors duration-200 h-full">
                  <CardContent className="p-6 flex flex-col justify-between h-full">
                    <div>
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <Avatar className="size-10 border border-white/5">
                            <AvatarFallback className={`${avatarBgClass} font-semibold text-[14px]`}>
                              {m.firstName[0]}{m.lastName[0]}
                            </AvatarFallback>
                          </Avatar>
                          <div className="flex flex-col min-w-0">
                            <div className="font-bold text-[16px] text-[#EEF2F0] truncate">{m.firstName} {m.lastName}</div>
                            <div className="text-[12.5px] font-medium text-[#8FA89F] capitalize mt-0.5">{m.memberType} · {m.grade}</div>
                          </div>
                        </div>
                        <StatusBadge status={m.status} />
                      </div>

                      <div className="h-[1px] bg-[rgba(255,255,255,0.06)] my-4.5" />

                      <div className="flex items-center justify-between text-sm">
                        <div className="flex items-center gap-1.5 text-[#8FA89F] text-[12.5px] font-medium">
                          <Wallet className="size-3.5 text-[#5A7068]" /> Balance
                        </div>
                        <div className="type-mono-value">{fmtMoney(m.credit)}</div>
                      </div>
                    </div>

                    <div className="mt-4 flex gap-2 w-full">
                      {(activeRole === "admin" || (activeRole === "member" && isJunior)) && (
                        <Button asChild variant="outline" className="flex-1 btn-premium-outline h-11 md:h-8 text-[13px] md:text-xs hover:cursor-pointer">
                          <Link to="/members/$id/edit" params={{ id: m.id }}><Pencil className="size-3.5 mr-1" /> Edit</Link>
                        </Button>
                      )}
                      {(activeRole === "admin" || (activeRole === "member" && isJunior)) && (
                        <Button
                          variant="destructive"
                          className="flex-1 btn-premium-danger h-11 md:h-8 text-[13px] md:text-xs hover:cursor-pointer"
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
              </motion.div>
            );
          })}
        </motion.div>
      ) : (
        <div className="bg-[#131916] border border-[rgba(255,255,255,0.06)] rounded-lg overflow-hidden">
          <Table>
            <TableHeader className="bg-[#0C0F0E]/60">
              <TableRow className="border-b border-[rgba(255,255,255,0.06)] hover:bg-transparent">
                <TableHead className="type-table-head h-11 px-5">Name</TableHead>
                <TableHead className="type-table-head h-11">Type</TableHead>
                <TableHead className="type-table-head h-11">Grade</TableHead>
                <TableHead className="type-table-head h-11">Balance</TableHead>
                <TableHead className="type-table-head h-11">Status</TableHead>
                <TableHead className="type-table-head h-11 text-right px-5">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {processed.map((m) => {
                const isJunior = m.memberType.toLowerCase() === "junior";
                const avatarBgClass = isJunior ? "bg-[#1A1A0A] text-[#F59E0B]" : "bg-[#0D2E22] text-[#10B981]";
                return (
                  <TableRow key={m.id} className="border-b border-[rgba(255,255,255,0.04)] hover:bg-white/[0.02] transition-colors">
                    <TableCell className="px-5 py-3">
                      <div className="flex items-center gap-3">
                        <Avatar className="size-8 border border-white/5">
                          <AvatarFallback className={`${avatarBgClass} font-semibold text-xs`}>
                            {m.firstName[0]}{m.lastName[0]}
                          </AvatarFallback>
                        </Avatar>
                        <span className="font-bold text-[14.5px] text-[#EEF2F0]">
                          {m.firstName} {m.lastName}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="type-table-body capitalize">{m.memberType}</TableCell>
                    <TableCell className="type-table-body font-mono">{m.grade}</TableCell>
                    <TableCell className="type-mono-value">{fmtMoney(m.credit)}</TableCell>
                    <TableCell><StatusBadge status={m.status} /></TableCell>
                    <TableCell className="text-right px-5 py-3 space-x-2">
                      {(activeRole === "admin" || (activeRole === "member" && isJunior)) && (
                        <Button asChild variant="outline" size="sm" className="btn-premium-outline h-8 text-xs hover:cursor-pointer">
                          <Link to="/members/$id/edit" params={{ id: m.id }}><Pencil className="size-3 mr-1" /> Edit</Link>
                        </Button>
                      )}
                      {(activeRole === "admin" || (activeRole === "member" && isJunior)) && (
                        <Button
                          variant="destructive"
                          size="sm"
                          className="btn-premium-danger h-8 text-xs hover:cursor-pointer"
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
                          <Trash2 className="size-3 mr-1" /> Remove
                        </Button>
                      )}
                      {(activeRole === "admin" || activeRole === "member") && (
                        <Button asChild variant="outline" size="sm" className="btn-premium-violet-outline h-8 text-xs hover:cursor-pointer">
                          <Link to={`/credits?memberId=${m.id}` as any}>Credits</Link>
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}