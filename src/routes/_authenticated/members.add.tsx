import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { PageHeader } from "@/components/PageHeader";
import { MemberForm } from "@/components/MemberForm";
import { useCurrentUser, useStore } from "@/lib/store";

export const Route = createFileRoute("/_authenticated/members/add")({ component: AddMember });

function AddMember() {
  const user = useCurrentUser()!;
  const add = useStore((s) => s.addMember);
  const navigate = useNavigate();
  return (
    <div>
      <PageHeader title="Add family member" description="Register a new family member to your club account." backTo="/members" />
      <MemberForm
        initial={{
          userId: user.id, firstName: "", lastName: "", dob: "", email: "", sex: "male",
          memberType: "adult", membership: false, league: false, grade: "B", biMemberId: "", status: "active",
        }}
        onSubmit={async (v) => {
          try {
            await add(v);
            toast.success("Member added");
            navigate({ to: "/members" });
          } catch (error: any) {
            toast.error(error.message || "Failed to add member.");
          }
        }}
      />
    </div>
  );
}