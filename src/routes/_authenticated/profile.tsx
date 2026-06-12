import { createFileRoute } from "@tanstack/react-router";
import { useCurrentUser } from "@/lib/store";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/PageHeader";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/profile")({ component: Profile });

function Profile() {
  const u = useCurrentUser()!;
  const Row = ({ k, v, isMono = false }: { k: string; v: string; isMono?: boolean }) => (
    <div className="flex justify-between py-4 border-b border-white/[0.04] last:border-0 items-center">
      <span className="text-[10px] font-medium tracking-[0.1em] text-[#8A8A98] uppercase">{k}</span>
      <span className={cn("text-[13px] text-[#F1F0EE] font-medium", isMono && "font-mono text-xs")}>{v}</span>
    </div>
  );
  return (
    <div className="space-y-6">
      <PageHeader title="My profile" description="Review your personal member profile credentials." />
      <Card className="bg-[#131916] border-[rgba(255,255,255,0.06)] signature-card-top">
        <CardHeader className="pb-3 border-b border-white/[0.03]">
          <CardTitle className="text-xl font-playfair font-normal text-[#F1F0EE]">
            {u.firstName} {u.lastName}
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-4">
          <Row k="Email Address" v={u.email} />
          <Row k="Mobile Contact" v={u.mobile} isMono />
          <Row k="Registered Address" v={u.address} />
          <Row k="Account Role" v={u.role.charAt(0).toUpperCase() + u.role.slice(1)} />
          <Row k="Date of Birth" v={u.dob} isMono />
          <Row k="Membership Status" v={u.status.toUpperCase()} isMono />
        </CardContent>
      </Card>
    </div>
  );
}