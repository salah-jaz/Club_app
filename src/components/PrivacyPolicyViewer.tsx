import { PolicyDocumentModal } from "./PolicyDocumentModal";

/**
 * Backward compatibility export. Policy documents are now uploaded and managed
 * via Admin -> Settings -> Policies & Documents.
 */
export const PRIVACY_POLICY_URL = "";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function PrivacyPolicyViewer({ open, onOpenChange }: Props) {
  return (
    <PolicyDocumentModal
      open={open}
      onOpenChange={onOpenChange}
      type="privacy_policy"
      title="Privacy Policy"
      subtitle="AeroShuttle Badminton Club – Privacy Policy"
    />
  );
}
