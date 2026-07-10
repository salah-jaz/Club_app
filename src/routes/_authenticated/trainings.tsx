import { createFileRoute, Link, Outlet, useMatches } from "@tanstack/react-router";
import { useCurrentUser, useStore } from "@/lib/store";
import { Navigate } from "@tanstack/react-router";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/PageHeader";
import { StatusBadge } from "@/components/StatusBadge";
import { fmtDate, fmtMoney } from "@/lib/format";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { motion } from "framer-motion";
import { EmptyIllustration } from "@/components/EmptyIllustration";
import { staggerContainer, staggerItem } from "@/components/MotionWrapper";

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
  return (
    <div>
      <PageHeader
        title="Training programs"
        description="Coach-led programs for junior members."
        actions={user.role === "admin" && <Button asChild><Link to="/trainings/new"><Plus /> New training</Link></Button>}
      />
      {s.trainings.length === 0 ? (
        <EmptyIllustration
          icon="training"
          title="No training programs yet"
          description="Create a coach-led program for junior members to enroll in."
          ctaLabel={user.role === "admin" ? "New training" : undefined}
          ctaTo={user.role === "admin" ? "/trainings/new" : undefined}
        />
      ) : (
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

      )}
    </div>
  );
}