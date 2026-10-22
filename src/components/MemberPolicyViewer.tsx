import { PolicyDocumentModal } from "./PolicyDocumentModal";

/**
 * Backward compatibility export. Policy documents are now uploaded and managed
 * via Admin -> Settings -> Policies & Documents.
 */
export const MEMBER_POLICY_URL = "";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function MemberPolicyViewer({ open, onOpenChange }: Props) {
  return (
    <PolicyDocumentModal
      open={open}
      onOpenChange={onOpenChange}
      type="member_policy"
      title="Member Policy"
      subtitle="AeroShuttle Badminton Club – Policy for Club Members Charges"
    />
  );
}
