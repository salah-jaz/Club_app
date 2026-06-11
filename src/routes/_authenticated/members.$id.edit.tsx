import { createFileRoute, useNavigate, Navigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { PageHeader } from "@/components/PageHeader";
import { MemberForm } from "@/components/MemberForm";
import { useStore } from "@/lib/store";

export const Route = createFileRoute("/_authenticated/members/$id/edit")({ component: EditMember });

function EditMember() {
  const { id } = Route.useParams();
  const member = useStore((s) => s.members.find((m) => m.id === id));
  const update = useStore((s) => s.updateMember);
  const navigate = useNavigate();
  if (!member) return <Navigate to="/members" />;
  return (
    <div>
      <PageHeader title={`Edit ${member.firstName}`} description="Update member details." backTo="/members" />
      <MemberForm
        initial={member}
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