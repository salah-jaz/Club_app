import { createFileRoute, useNavigate, Navigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { PageHeader } from "@/components/PageHeader";
import { MemberForm } from "@/components/MemberForm";
import { useCurrentUser, useStore } from "@/lib/store";

export const Route = createFileRoute("/_authenticated/members/$id/edit")({ component: EditMember });

function EditMember() {
  const { id } = Route.useParams();
  const user = useCurrentUser()!;
  const member = useStore((s) => s.members.find((m) => m.id === id));
  const update = useStore((s) => s.updateMember);
  const navigate = useNavigate();

  if (!member) return <Navigate to="/members" />;
  const canEdit = user.role === "admin" || member.userId === user.id;
  if (!canEdit) return <Navigate to="/members" />;

  const isAdmin = user.role === "admin";
  const familyMemberMode = !isAdmin && member.memberType === "junior";

  return (
    <div>
      <PageHeader
        title={isAdmin ? `Edit ${member.firstName}` : `Edit family member`}
        description={
          isAdmin
            ? "Update member details. Juniors can be linked under a parent adult."
            : "Update this junior’s club profile."
        }
        backTo="/members"
      />
      <MemberForm
        // Same form as Add — login block only on create (showLoginFields=false here)
        showLoginFields={false}
        familyMemberMode={familyMemberMode}
        submitLabel="Update member"
        initial={{
          id: member.id,
          userId: member.userId,
          firstName: member.firstName,
          lastName: member.lastName,
          dob: member.dob,
          email: member.email,
          sex: member.sex,
          memberType: member.memberType,
          membership: member.membership,
          league: member.league,
          trainingEligible: member.trainingEligible,
          skipCreditConsumption: member.skipCreditConsumption,
          applyDiscount: member.applyDiscount,
          grade: member.grade,
          biMemberId: member.biMemberId,
          nickname: member.nickname ?? "",
          status: member.status,
          parentMemberId: member.parentMemberId ?? null,
          password: "",
        }}
        onSubmit={async (v) => {
          try {
            await update(id, v);
            toast.success("Member updated");
            navigate({ to: "/members" });
          } catch (error: any) {
            toast.error(error.message || "Failed to update member.");
          }
        }}
      />
    </div>
  );
}
