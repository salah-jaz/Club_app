import { PolicyCard } from "./PolicyCard";

export function PoliciesSection() {
  return (
    <div className="space-y-4 md:col-span-2">
      <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2">
        <h2 className="text-sm font-semibold tracking-wide text-foreground uppercase">
          Policies & Documents
        </h2>
        <span className="text-xs text-muted-foreground">
          Manage club policies, member terms, and privacy agreements (PDF or Google Docs)
        </span>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <PolicyCard
          type="member_policy"
          title="Member Policy"
          description="Governs club membership charges, cancellations, and terms. Visible to all club members."
        />

        <PolicyCard
          type="privacy_policy"
          title="Privacy Policy"
          description="Club GDPR and data protection policy required during new member registration."
        />
      </div>
    </div>
  );
}
