import { useCan } from "@/lib/permissions";
import { createFileRoute, useNavigate, Navigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { PageHeader } from "@/components/PageHeader";
import { MemberForm } from "@/components/MemberForm";
import { useCurrentUser, useStore } from "@/lib/store";

export const Route = createFileRoute("/_authenticated/members/add")({ component: AddMember });

function AddMember() {
  const user = useCurrentUser()!;
  const add = useStore((s) => s.addMember);
  const members = useStore((s) => s.members);
  const navigate = useNavigate();
  const isAdmin = user.role === "admin";
  const canCreate = useCan("members.create");
  if (isAdmin && !canCreate) return <Navigate to="/members" />;

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
          mobile: "",
          sex: "male",
          memberType: isAdmin ? "adult" : "junior",
          membership: isAdmin,
          trainingEligible: false,
          playEligible: false,
          skipCreditConsumption: false,
          applyDiscount: false,
          grade: "",
          biMemberId: "",
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
