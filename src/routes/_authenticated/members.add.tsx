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
  const isAdmin = user.role === "admin";

  return (
    <div>
      <PageHeader
        title={isAdmin ? "Add member" : "Add family member"}
        description={
          isAdmin
            ? "Create a member profile and login account."
            : "Register a new family member to your club account."
        }
        backTo="/members"
      />
      <MemberForm
        showLoginFields={isAdmin}
        familyMemberMode={!isAdmin}
        initial={{
          userId: user.id,
          firstName: "",
          lastName: "",
          dob: "",
          email: "",
          sex: "male",
          memberType: isAdmin ? "adult" : "junior",
          membership: false,
          league: false,
          trainingEligible: !isAdmin,
          skipCreditConsumption: false,
          grade: "B",
          biMemberId: "",
          status: "active",
          ...(isAdmin ? { mobile: "", address: "", password: "" } : {}),
        }}
        onSubmit={async (v) => {
          try {
            await add(v, isAdmin);
            toast.success(isAdmin ? "Member and login account created" : "Member added");
            navigate({ to: "/members" });
          } catch (error: any) {
            toast.error(error.message || "Failed to add member.");
          }
        }}
      />
    </div>
  );
}