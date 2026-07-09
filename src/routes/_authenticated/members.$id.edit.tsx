import { createFileRoute, useNavigate, Navigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { PageHeader } from "@/components/PageHeader";
import { MemberForm } from "@/components/MemberForm";
import { useCurrentUser, useStore } from "@/lib/store";
import { useState } from "react";

export const Route = createFileRoute("/_authenticated/members/$id/edit")({ component: EditMember });

function EditMember() {
  const { id } = Route.useParams();
  const user = useCurrentUser()!;
  const [member] = useState(() => useStore.getState().members.find((m) => m.id === id));
  const update = useStore((s) => s.updateMember);
  const navigate = useNavigate();
  if (!member) return <Navigate to="/members" />;
  const canEdit = user.role === "admin" || member.userId === user.id;
  if (!canEdit) return <Navigate to="/members" />;
  return (
    <div>
      <PageHeader title={`Edit ${member.firstName}`} description="Update member details." backTo="/members" />
      <MemberForm
        initial={member}
        familyMemberMode={user.role === "member" && member.memberType === "junior"}
        submitLabel="Update member"
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