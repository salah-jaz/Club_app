import { createFileRoute, Link, Outlet, useMatches } from "@tanstack/react-router";
import { useCurrentUser, useStore } from "@/lib/store";
import { Navigate } from "@tanstack/react-router";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/PageHeader";
import { StatusBadge } from "@/components/StatusBadge";
import { fmtDate, fmtMoney } from "@/lib/format";
import { Plus, LayoutGrid, List } from "lucide-react";
import { toast } from "sonner";
import { motion } from "framer-motion";
import { useState } from "react";
import { EmptyIllustration } from "@/components/EmptyIllustration";
import { staggerContainer, staggerItem } from "@/components/MotionWrapper";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const Route = createFileRoute("/_authenticated/trainings")({ component: TrainingsLayout });

function TrainingsLayout() {
  const user = useCurrentUser()!;
  const activeRole = useStore((s) => s.activeRole) || user.role;
  const matches = useMatches();
  const isIndex = matches[matches.length - 1].routeId === Route.id;
  if (activeRole !== "admin" && activeRole !== "volunteer") return <Navigate to="/dashboard" />;
  if (!isIndex) return <Outlet />;
  return <TrainingsList />;
}

function TrainingsList() {
  const s = useStore();
  const releaseTraining = useStore((st) => st.releaseTraining);
  const user = useCurrentUser()!;
  const [viewMode, setViewMode] = useState<"grid" | "list">(
    () => (localStorage.getItem("clubapp-view-mode-trainings") as "grid" | "list") || "grid"
  );

  return (
    <div>
      <PageHeader
        title="Training programs"
        description="Coach-led programs for junior members."
        actions={user.role === "admin" && <Button asChild><Link to="/trainings/new"><Plus /> New training</Link></Button>}
      />

      {s.trainings.length > 0 && (
        <div className="flex items-center justify-between mb-4 mt-6">
          <span className="type-helper text-xs">{s.trainings.length} programs found</span>
          <div className="flex items-center gap-1 bg-[#131916] border border-[rgba(255,255,255,0.06)] p-0.5 rounded-lg">
            <button
              onClick={() => {
                setViewMode("grid");
                localStorage.setItem("clubapp-view-mode-trainings", "grid");
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
                localStorage.setItem("clubapp-view-mode-trainings", "list");
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
      )}

      {s.trainings.length === 0 ? (
        <EmptyIllustration
          icon="training"
          title="No training programs yet"
          description="Create a coach-led program for junior members to enroll in."
          ctaLabel={user.role === "admin" ? "New training" : undefined}
          ctaTo={user.role === "admin" ? "/trainings/new" : undefined}
        />
      ) : viewMode === "grid" ? (
        <motion.div
          variants={staggerContainer}
          initial="hidden"
          animate="show"
          className="grid md:grid-cols-2 gap-5"
        >
          {s.trainings.map((t) => (
            <motion.div
              key={t.id}
              variants={staggerItem}
              whileHover={{ y: -3, boxShadow: "0 10px 28px rgba(0,0,0,0.35), 0 0 0 1px rgba(16,185,129,0.10)" }}
              whileTap={{ scale: 0.98 }}
              transition={{ duration: 0.18 }}
            >
              <Card className="bg-[#131916] border-[rgba(255,255,255,0.06)] hover:border-[rgba(255,255,255,0.10)] hover:bg-[#1A2120] transition-colors duration-200 h-full">
                <CardContent className="p-6 space-y-4">
                  {/* Emerald dot & coach name */}
                  <div className="flex items-center gap-2">
                    <div className="size-1.5 rounded-full bg-[#34D399]" />
                    <span className="text-[12px] font-semibold text-[#8FA89F]">{t.coach}</span>
                  </div>

                  <div>
                    <h3 className="font-bold text-[16px] text-[#EEF2F0]">{t.name}</h3>
                    <div className="type-mono-value text-[12.5px] text-[#C4D4CF] mt-1">
                      {fmtDate(t.startDate)} → {fmtDate(t.endDate)}
                    </div>
                  </div>

                  {/* Stats Row */}
                  <div className="grid grid-cols-3 gap-4 border-t border-[rgba(255,255,255,0.06)] pt-4 text-sm">
                    <div>
                      <div className="text-[11px] font-semibold tracking-wider text-[#8FA89F] uppercase block">Sessions</div>
                      <div className="type-mono-value text-[15.5px] mt-1">{t.sessions}</div>
                    </div>
                    <div>
                      <div className="text-[11px] font-semibold tracking-wider text-[#8FA89F] uppercase block">Slots</div>
                      <div className="type-mono-value text-[15.5px] mt-1">{t.slots}</div>
                    </div>
                    <div>
                      <div className="text-[11px] font-semibold tracking-wider text-[#8FA89F] uppercase block">Fees</div>
                      <div className="type-mono-value text-[15.5px] mt-1">{fmtMoney(t.fees)}</div>
                    </div>
                  </div>

                  {/* Bottom Row */}
                  <div className="flex items-center justify-between pt-2 gap-2">
                    <StatusBadge status={t.status} />
                    <div className="flex items-center gap-1 flex-wrap justify-end">
                      {user.role === "admin" && t.status === "open" && (
                        <Button
                          size="sm"
                          className="btn-premium-solid h-8 text-[11px] cursor-pointer"
                          onClick={async () => {
                            try {
                              const res = await releaseTraining(t.id);
                              toast.success(res.message ?? "Training opened for family enrollment");
                            } catch (error: any) {
                              toast.error(error.message || "Failed to open training.");
                            }
                          }}
                        >
                          Open enrollment
                        </Button>
                      )}
                      <Button asChild size="sm" variant="ghost" className="h-8 text-[#8A8A98] hover:text-[#F1F0EE] hover:bg-white/5 cursor-pointer text-xs">
                        <Link to="/trainings/$id" params={{ id: t.id }}>Manage</Link>
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </motion.div>
      ) : (
        <div className="bg-[#131916] border border-[rgba(255,255,255,0.06)] rounded-lg overflow-hidden">
          <Table>
            <TableHeader className="bg-[#0C0F0E]/60">
              <TableRow className="border-b border-[rgba(255,255,255,0.06)] hover:bg-transparent">
                <TableHead className="type-table-head h-11 px-5">Program Name</TableHead>
                <TableHead className="type-table-head h-11">Coach</TableHead>
                <TableHead className="type-table-head h-11">Schedule</TableHead>
                <TableHead className="type-table-head h-11">Sessions</TableHead>
                <TableHead className="type-table-head h-11">Slots</TableHead>
                <TableHead className="type-table-head h-11">Fees</TableHead>
                <TableHead className="type-table-head h-11">Status</TableHead>
                <TableHead className="type-table-head h-11 text-right px-5">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {s.trainings.map((t) => (
                <TableRow key={t.id} className="border-b border-[rgba(255,255,255,0.04)] hover:bg-white/[0.02] transition-colors">
                  <TableCell className="px-5 py-3.5 font-bold text-[14.5px] text-[#EEF2F0]">{t.name}</TableCell>
                  <TableCell className="type-table-body">{t.coach}</TableCell>
                  <TableCell className="type-table-body font-mono text-xs">{fmtDate(t.startDate)} → {fmtDate(t.endDate)}</TableCell>
                  <TableCell className="type-mono-value">{t.sessions}</TableCell>
                  <TableCell className="type-mono-value">{t.slots}</TableCell>
                  <TableCell className="type-mono-value">{fmtMoney(t.fees)}</TableCell>
                  <TableCell><StatusBadge status={t.status} /></TableCell>
                  <TableCell className="text-right px-5 py-3 space-x-2">
                    {user.role === "admin" && t.status === "open" && (
                      <Button
                        size="sm"
                        className="btn-premium-solid h-8 text-xs cursor-pointer"
                        onClick={async () => {
                          try {
                            const res = await releaseTraining(t.id);
                            toast.success(res.message ?? "Training opened for family enrollment");
                          } catch (error: any) {
                            toast.error(error.message || "Failed to open training.");
                          }
                        }}
                      >
                        Open enrollment
                      </Button>
                    )}
                    <Button asChild size="sm" variant="ghost" className="h-8 text-[#8A8A98] hover:text-[#F1F0EE] hover:bg-white/5 cursor-pointer text-xs">
                      <Link to="/trainings/$id" params={{ id: t.id }}>Manage</Link>
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}