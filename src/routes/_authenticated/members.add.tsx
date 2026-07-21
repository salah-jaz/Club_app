import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { PageHeader } from "@/components/PageHeader";
import { MemberForm } from "@/components/MemberForm";
import { useCurrentUser, useStore } from "@/lib/store";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";

export const Route = createFileRoute("/_authenticated/members/add")({ component: AddMember });

function AddMember() {
  const user = useCurrentUser()!;
  const add = useStore((s) => s.addMember);
  const members = useStore((s) => s.members);
  const navigate = useNavigate();
  const isAdmin = user.role === "admin";
  const [initialBiMemberId, setInitialBiMemberId] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    api.get<{ nextBiMemberId: string }>("/members/next-bi-member-id")
      .then((res) => {
        if (active) {
          setInitialBiMemberId(res.nextBiMemberId);
          setLoading(false);
        }
      })
      .catch((err) => {
        console.error("Failed to fetch next BI Member ID", err);
        if (active) {
          setLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, []);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[300px] space-y-4">
        <div className="size-10 border-4 border-[#10B981]/20 border-t-[#10B981] rounded-full animate-spin" />
        <p className="text-sm text-[#34D399]/80 font-medium animate-pulse">Loading next BI Member ID...</p>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title={isAdmin ? "Add member" : "Add family member"}
        description={
          isAdmin
            ? "Create a member profile. Juniors can be linked under a parent adult."
            : "Register a new junior under your club account."
        }
        backTo="/members"
      />
      <MemberForm
        showLoginFields={isAdmin}
        familyMemberMode={!isAdmin}
        submitLabel="Save member"
        initial={{
          userId: user.id,
          firstName: "",
          lastName: "",
          dob: "",
          email: "",
          sex: "male",
          memberType: isAdmin ? "adult" : "junior",
          membership: false,
          trainingEligible: false,
          skipCreditConsumption: false,
          applyDiscount: false,
          grade: "",
          biMemberId: initialBiMemberId,
          nickname: "",
          status: isAdmin ? "active" : "pending",
          parentMemberId: null,
          ...(isAdmin ? { mobile: "", address: "", password: "" } : {}),
        }}
        onSubmit={async (v) => {
          try {
            const isJunior = v.memberType === "junior";
            let payload = { ...v };

            if (isJunior && v.parentMemberId) {
              const parent = members.find((m) => m.id === v.parentMemberId);
              if (parent?.userId) {
                payload = { ...payload, userId: parent.userId };
              }
            }

            // New login only for adults created by admin
            await add(payload, isAdmin && !isJunior);
            toast.success(
              !isAdmin
                ? "Junior submitted for admin approval"
                : isAdmin && !isJunior
                  ? "Member and login account created"
                  : "Member added",
            );
            navigate({ to: "/members" });
          } catch (error: any) {
            toast.error(error.message || "Failed to add member.");
          }
        }}
      />
    </div>
  );
}
