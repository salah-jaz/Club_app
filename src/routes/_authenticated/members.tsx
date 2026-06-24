import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import { useCurrentUser, useStore } from "@/lib/store";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/PageHeader";
import { StatusBadge } from "@/components/StatusBadge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Plus, Pencil, Wallet } from "lucide-react";
import { fmtMoney } from "@/lib/format";
import { useState } from "react";

export const Route = createFileRoute("/_authenticated/members")({ component: MembersLayout });

function MembersLayout() {
  const pathname = useRouterState({ select: (r) => r.location.pathname });
  if (pathname !== "/members") return <Outlet />;
  return <MembersList />;
}

function MembersList() {
  const user = useCurrentUser()!;
  const all = useStore((s) => s.members);
  const [filter, setFilter] = useState<"all" | "adult" | "junior">("all");

  const baseMembers = user.role === "admin" ? all : all.filter((m) => m.userId === user.id);
  const members = baseMembers.filter((m) => {
    if (filter === "all") return true;
    return m.memberType.toLowerCase() === filter;
  });

  return (
    <div>
      <PageHeader
        title={user.role === "admin" ? "Members" : "Family roster"}
        description={user.role === "admin" ? "Every member registered in the club." : "Manage your family's club profiles."}
        actions={
          (user.role === "admin" || user.role === "member") && (
            <Button asChild className="btn-premium-solid h-[38px] px-4 hover:cursor-pointer">
              <Link to="/members/add"><Plus className="size-4" /> Add member</Link>
            </Button>
          )
        }
      />

      {/* Filter bar */}
      <div className="flex items-center gap-2 mb-6">
        <button
          onClick={() => setFilter("all")}
          className={`px-3.5 py-1.5 rounded-full text-[13px] font-medium transition-all cursor-pointer border ${filter === "all" ? "bg-[rgba(16,185,129,0.12)] text-[#10B981] border-[rgba(16,185,129,0.4)]" : "bg-transparent text-[#8A8A98] border-transparent hover:text-[#F1F0EE]"}`}
        >
          All
        </button>
        <button
          onClick={() => setFilter("adult")}
          className={`px-3.5 py-1.5 rounded-full text-[13px] font-medium transition-all cursor-pointer border ${filter === "adult" ? "bg-[rgba(16,185,129,0.12)] text-[#10B981] border-[rgba(16,185,129,0.4)]" : "bg-transparent text-[#8A8A98] border-transparent hover:text-[#F1F0EE]"}`}
        >
          Adult
        </button>
        <button
          onClick={() => setFilter("junior")}
          className={`px-3.5 py-1.5 rounded-full text-[13px] font-medium transition-all cursor-pointer border ${filter === "junior" ? "bg-[rgba(16,185,129,0.12)] text-[#10B981] border-[rgba(16,185,129,0.4)]" : "bg-transparent text-[#8A8A98] border-transparent hover:text-[#F1F0EE]"}`}
        >
          Junior
        </button>
      </div>

      {members.length === 0 ? (
        <Card className="border-[rgba(255,255,255,0.06)] bg-[#131916]">
          <CardContent className="p-10 text-center text-[#8A8A98]">
            No members found.
          </CardContent>
        </Card>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {members.map((m) => {
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
                    {user.role === "admin" && (
                      <Button asChild variant="outline" size="sm" className="flex-1 btn-premium-outline hover:cursor-pointer">
                        <Link to="/members/$id/edit" params={{ id: m.id }}><Pencil className="size-3.5" /> Edit</Link>
                      </Button>
                    )}
                    {(user.role === "admin" || user.role === "member") && (
                      <Button asChild variant="outline" size="sm" className="flex-1 btn-premium-violet-outline hover:cursor-pointer">
                        <Link to="/credits">Credits</Link>
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