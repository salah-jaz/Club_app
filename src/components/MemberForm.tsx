import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { Member } from "@/lib/types";
import { useStore, useCurrentUser } from "@/lib/store";
import { motion } from "framer-motion";
import { staggerContainer, staggerItem } from "@/components/MotionWrapper";

export type MemberFormValues = Omit<Member, "id" | "credit"> & {
  credit?: number;
  mobile?: string;
  address?: string;
  password?: string;
  parentMemberId?: string | null;
  /** Present when editing an existing member */
  id?: string;
};

/** Animated form field wrapper — adds focus glow ring and label animation */
function FormField({
  label,
  children,
  span2 = false,
}: {
  label: string;
  children: React.ReactNode;
  span2?: boolean;
}) {
  return (
    <div className={`space-y-1.5${span2 ? " sm:col-span-2" : ""}`}>
      <Label>
        {label}
      </Label>
      <div className="relative transition-all duration-150 rounded-lg focus-within:ring-2 focus-within:ring-[#10B981]/20">
        {children}
      </div>
    </div>
  );
}

export function MemberForm({
  initial, onSubmit, submitLabel = "Save member", showLoginFields = false, familyMemberMode = false,
}: {
  initial: MemberFormValues;
  onSubmit: (v: MemberFormValues) => void;
  submitLabel?: string;
  showLoginFields?: boolean;
  /** Adult users adding juniors under their account — training eligibility applies here. */
  familyMemberMode?: boolean;
}) {
  const adultGrades = useStore((s) => s.adultGrades);
  const juniorGrades = useStore((s) => s.juniorGrades);
  const members = useStore((s) => s.members);
  const users = useStore((s) => s.users);
  const currentUser = useCurrentUser();
  const isAdmin = currentUser?.role === "admin";
  const [v, setV] = useState(initial);
  const [submitting, setSubmitting] = useState(false);
  const set = <K extends keyof MemberFormValues>(k: K, val: MemberFormValues[K]) =>
    setV((p) => {
      const next = { ...p, [k]: val };
      if (k === "memberType" && val === "adult") {
        next.parentMemberId = null;
      }
      return next;
    });

  const adultOptions = members.filter(
    (m) => m.memberType.toLowerCase() === "adult" && m.id !== v.id,
  );

  const getParentEmail = () => {
    if (v.userId) {
      const parent = users.find((u) => u.id === v.userId);
      if (parent) return parent.email;
    }
    if (currentUser) return currentUser.email;
    return "";
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    try {
      let finalV = { ...v };
      if (v.memberType === "junior") {
        finalV.email = getParentEmail();
        finalV.password = "";
      }
      const payload = familyMemberMode
        ? {
            ...finalV,
            memberType: "junior" as const,
            status: "pending" as const,
            membership: false,
            trainingEligible: false,
            playEligible: false,
            skipCreditConsumption: false,
            applyDiscount: false,
            // Nest under the adult profile on this login when present
            parentMemberId:
              finalV.parentMemberId ||
              members.find(
                (m) =>
                  m.userId === (finalV.userId || currentUser?.id) &&
                  m.memberType.toLowerCase() === "adult",
              )?.id ||
              null,
          }
        : finalV;
      await Promise.resolve(onSubmit(payload));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <motion.form
      onSubmit={handleSubmit}
      className="space-y-6"
      variants={staggerContainer}
      initial="hidden"
      animate="show"
    >
      {/* Personal Information */}
      <motion.div variants={staggerItem}>
        <Card className="signature-card-top bg-[#131916] border-[rgba(255,255,255,0.06)]">
          <CardHeader className="p-6 pb-4">
            <CardTitle className="type-section-cap text-[#34D399]">
              Personal information
            </CardTitle>
          </CardHeader>
          <CardContent className="grid sm:grid-cols-2 gap-4">
            <FormField label="BI Member ID">
              <Input
                value={v.biMemberId}
                onChange={(e) => set("biMemberId", e.target.value)}
                className="bg-[#1A2120] border-[rgba(255,255,255,0.06)] focus:border-[#10B981] text-[#F1F0EE] rounded-lg transition-colors duration-150"
              />
            </FormField>
            <FormField label="Nickname">
              <Input
                value={v.nickname ?? ""}
                onChange={(e) => set("nickname", e.target.value)}
                className="bg-[#1A2120] border-[rgba(255,255,255,0.06)] focus:border-[#10B981] text-[#F1F0EE] rounded-lg transition-colors duration-150"
              />
            </FormField>
            <FormField label="First name">
              <Input
                required
                value={v.firstName}
                onChange={(e) => set("firstName", e.target.value)}
                className="bg-[#1A2120] border-[rgba(255,255,255,0.06)] focus:border-[#10B981] text-[#F1F0EE] rounded-lg transition-colors duration-150"
              />
            </FormField>
            <FormField label="Last name">
              <Input
                required
                value={v.lastName}
                onChange={(e) => set("lastName", e.target.value)}
                className="bg-[#1A2120] border-[rgba(255,255,255,0.06)] focus:border-[#10B981] text-[#F1F0EE] rounded-lg transition-colors duration-150"
              />
            </FormField>
            <FormField label="Date of birth">
              <Input
                required
                type="date"
                value={v.dob}
                onChange={(e) => set("dob", e.target.value)}
                className="bg-[#1A2120] border-[rgba(255,255,255,0.06)] focus:border-[#10B981] text-[#F1F0EE] rounded-lg transition-colors duration-150"
              />
            </FormField>
            {v.memberType !== "junior" && (
              <FormField label="Email">
                <Input
                  required
                  type="email"
                  value={v.email}
                  onChange={(e) => set("email", e.target.value)}
                  className="bg-[#1A2120] border-[rgba(255,255,255,0.06)] focus:border-[#10B981] text-[#F1F0EE] rounded-lg transition-colors duration-150"
                />
              </FormField>
            )}
            <FormField label="Sex">
              <Select value={v.sex} onValueChange={(x) => set("sex", x as any)}>
                <SelectTrigger className="bg-[#1A2120] border-[rgba(255,255,255,0.06)] text-[#F1F0EE] rounded-lg">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-[#1A2120] border-[rgba(255,255,255,0.10)] text-[#F1F0EE]">
                  <SelectItem value="male">Male</SelectItem>
                  <SelectItem value="female">Female</SelectItem>
                </SelectContent>
              </Select>
            </FormField>
            {!showLoginFields && v.memberType !== "junior" && (
              <FormField label="Password">
                <Input
                  type="password"
                  placeholder="Leave blank to keep unchanged"
                  value={v.password ?? ""}
                  onChange={(e) => set("password", e.target.value)}
                  className="bg-[#1A2120] border-[rgba(255,255,255,0.06)] focus:border-[#10B981] text-[#F1F0EE] rounded-lg transition-colors duration-150"
                />
              </FormField>
            )}
          </CardContent>
        </Card>
      </motion.div>

      {/* Login Account (conditional) */}
      {showLoginFields && v.memberType !== "junior" && (
        <motion.div variants={staggerItem}>
          <Card className="signature-card-top bg-[#131916] border-[rgba(255,255,255,0.06)]">
            <CardHeader className="p-6 pb-4">
              <CardTitle className="type-section-cap text-[#34D399]">
                Login account
              </CardTitle>
            </CardHeader>
            <CardContent className="grid sm:grid-cols-2 gap-4">
              <FormField label="Mobile">
                <Input
                  required
                  value={v.mobile ?? ""}
                  onChange={(e) => set("mobile", e.target.value)}
                  className="bg-[#1A2120] border-[rgba(255,255,255,0.06)] focus:border-[#10B981] text-[#F1F0EE] rounded-lg transition-colors duration-150"
                />
              </FormField>
              <FormField label="Password">
                <Input
                  required
                  type="password"
                  minLength={6}
                  value={v.password ?? ""}
                  onChange={(e) => set("password", e.target.value)}
                  className="bg-[#1A2120] border-[rgba(255,255,255,0.06)] focus:border-[#10B981] text-[#F1F0EE] rounded-lg transition-colors duration-150"
                />
              </FormField>
              <FormField label="Address" span2>
                <Textarea
                  required
                  value={v.address ?? ""}
                  onChange={(e) => set("address", e.target.value)}
                  className="bg-[#1A2120] border-[rgba(255,255,255,0.06)] focus:border-[#10B981] text-[#F1F0EE] min-h-[60px] rounded-lg transition-colors duration-150"
                />
              </FormField>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* Membership */}
      <motion.div variants={staggerItem}>
        <Card className="signature-card-top bg-[#131916] border-[rgba(255,255,255,0.06)]">
          <CardHeader className="p-6 pb-4">
            <CardTitle className="type-section-cap text-[#34D399]">
              Membership
            </CardTitle>
          </CardHeader>
          <CardContent className="grid sm:grid-cols-2 gap-4">
            <FormField label="Member type">
              {familyMemberMode ? (
                <Input
                  readOnly
                  value="Junior"
                  className="bg-[#1A2120] border-[rgba(255,255,255,0.06)] text-[#F1F0EE] rounded-lg capitalize"
                />
              ) : (
                <Select
                  value={v.memberType}
                  onValueChange={(x) => {
                    const type = x as Member["memberType"];
                    const relevantGrades = type === "junior" ? juniorGrades : adultGrades;
                    const nextGrade = relevantGrades.length > 0 ? relevantGrades[0] : "";
                    setV((p) => ({
                      ...p,
                      memberType: type,
                      grade: nextGrade,
                      ...(type === "adult"
                        ? {
                            membership: true,
                            trainingEligible: false,
                            skipCreditConsumption: false,
                          }
                        : {}),
                    }));
                  }}
                >
                  <SelectTrigger className="bg-[#1A2120] border-[rgba(255,255,255,0.06)] text-[#F1F0EE] rounded-lg">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-[#1A2120] border-[rgba(255,255,255,0.10)] text-[#F1F0EE]">
                    <SelectItem value="adult">Adult</SelectItem>
                    <SelectItem value="junior">Junior</SelectItem>
                  </SelectContent>
                </Select>
              )}
            </FormField>
            <FormField label="Grade">
              <Select
                value={v.grade || undefined}
                onValueChange={(x) => set("grade", x)}
              >
                <SelectTrigger className="bg-[#1A2120] border-[rgba(255,255,255,0.06)] text-[#F1F0EE] rounded-lg">
                  <SelectValue placeholder="Select grade" />
                </SelectTrigger>
                <SelectContent className="bg-[#1A2120] border-[rgba(255,255,255,0.10)] text-[#F1F0EE]">
                  {(v.memberType === "junior" ? juniorGrades : adultGrades).map((g) => (
                    <SelectItem key={g} value={g}>{g}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormField>

            {/* Parent adult — same field on Add & Edit for admin / non-family juniors */}
            {v.memberType === "junior" && !familyMemberMode && (
              <FormField label="Parent adult" span2>
                <Select
                  value={v.parentMemberId || "__none__"}
                  onValueChange={(x) => set("parentMemberId", x === "__none__" ? null : x)}
                >
                  <SelectTrigger className="bg-[#1A2120] border-[rgba(255,255,255,0.06)] text-[#F1F0EE] rounded-lg">
                    <SelectValue placeholder="Select parent adult…" />
                  </SelectTrigger>
                  <SelectContent className="bg-[#1A2120] border-[rgba(255,255,255,0.10)] text-[#F1F0EE]">
                    <SelectItem value="__none__">No parent linked</SelectItem>
                    {adultOptions.map((a) => (
                      <SelectItem key={a.id} value={a.id}>
                        {a.firstName} {a.lastName}
                        {a.biMemberId ? ` (${a.biMemberId})` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-[11px] text-[#8A8A98] mt-1.5">
                  Links this junior as a sub-member under the adult in the All members list.
                </p>
              </FormField>
            )}

            {!isAdmin && (
              <div className="sm:col-span-2 rounded-lg border border-[#F59E0B]/25 bg-[#F59E0B]/10 px-4 py-3">
                <p className="text-[12px] text-[#FBBF24] leading-relaxed">
                  An admin must approve this junior before they can join training. Membership and
                  training settings are set by an admin on approval.
                </p>
              </div>
            )}

            {isAdmin && (
              <>
                <FormField label="Status">
                  <Select value={v.status} onValueChange={(x) => set("status", x as Member["status"])}>
                    <SelectTrigger className="bg-[#1A2120] border-[rgba(255,255,255,0.06)] text-[#F1F0EE] rounded-lg">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-[#1A2120] border-[rgba(255,255,255,0.10)] text-[#F1F0EE]">
                      <SelectItem value="active">Active</SelectItem>
                      <SelectItem value="disabled">Disabled</SelectItem>
                      <SelectItem value="pending">Pending</SelectItem>
                      <SelectItem value="rejected">Rejected</SelectItem>
                    </SelectContent>
                  </Select>
                </FormField>
                <div className="sm:col-span-2 grid sm:grid-cols-2 gap-4 mt-2">
                  <div className="flex items-center justify-between rounded-lg border border-[rgba(255,255,255,0.06)] bg-[#1A2120]/50 p-4.5">
                    <div>
                      <Label className="text-[13px] font-semibold text-[#EEF2F0] capitalize">Club membership</Label>
                      <p className="type-helper mt-1">
                        {v.memberType === "junior"
                          ? "Paid yearly fee."
                          : "Paid yearly fee. Receives play schedule invitations."}
                      </p>
                    </div>
                    <Switch checked={v.membership} onCheckedChange={(x) => set("membership", x)} />
                  </div>
                  <div className="flex items-center justify-between rounded-lg border border-[rgba(255,255,255,0.06)] bg-[#1A2120]/50 p-4.5">
                    <div>
                      <Label className="text-[13px] font-semibold text-[#EEF2F0] capitalize">Training eligible</Label>
                      <p className="type-helper mt-1">
                        {v.memberType === "adult"
                          ? "Family can enroll children in junior training sessions"
                          : "Can be invited to junior training sessions"}
                      </p>
                    </div>
                    <Switch
                      checked={v.trainingEligible ?? false}
                      onCheckedChange={(x) => set("trainingEligible", x)}
                    />
                  </div>
                  {v.memberType === "junior" && (
                    <div className="flex items-center justify-between rounded-lg border border-[rgba(255,255,255,0.06)] bg-[#1A2120]/50 p-4.5">
                      <div>
                        <Label className="text-[13px] font-semibold text-[#EEF2F0] capitalize">
                          Play schedule eligible
                        </Label>
                        <p className="type-helper mt-1">
                          Family head can enroll this junior in play sessions.
                        </p>
                      </div>
                      <Switch
                        checked={v.playEligible ?? false}
                        onCheckedChange={(x) => set("playEligible", x)}
                      />
                    </div>
                  )}
                  <div className="flex items-center justify-between rounded-lg border border-[rgba(255,255,255,0.06)] bg-[#1A2120]/50 p-4.5">
                    <div>
                      <Label className="text-[13px] font-semibold text-[#EEF2F0] capitalize">Bypass Credit Consumption</Label>
                      <p className="type-helper mt-1">Do not deduct credits when participating in play schedules.</p>
                    </div>
                    <Switch
                      checked={v.skipCreditConsumption ?? false}
                      onCheckedChange={(x) => set("skipCreditConsumption", x)}
                    />
                  </div>
                  <div className="flex items-center justify-between rounded-lg border border-[rgba(255,255,255,0.06)] bg-[#1A2120]/50 p-4.5">
                    <div>
                      <Label className="text-[13px] font-semibold text-[#EEF2F0] capitalize">Apply Discount</Label>
                      <p className="type-helper mt-1">
                        Use {v.memberType === "junior" ? "junior" : "adult"} discount settings on play and training fees.
                      </p>
                    </div>
                    <Switch
                      checked={v.applyDiscount ?? false}
                      onCheckedChange={(x) => set("applyDiscount", x)}
                    />
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </motion.div>

      <div className="flex gap-2 justify-end">
        <motion.div whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}>
          <Button
            type="submit"
            disabled={submitting}
            className="btn-premium-solid h-10 px-6 font-semibold cursor-pointer min-w-[130px] relative"
          >
            {submitting ? (
              <span className="flex items-center gap-2">
                <svg
                  className="animate-spin size-4"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <circle cx="12" cy="12" r="10" strokeOpacity="0.25" />
                  <path d="M12 2a10 10 0 0 1 10 10" />
                </svg>
                Saving...
              </span>
            ) : (
              submitLabel
            )}
          </Button>
        </motion.div>
      </div>
    </motion.form>
  );
}