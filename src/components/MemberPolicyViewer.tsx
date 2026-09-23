import { FileText } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import memberPolicyPdfUrl from "@/assets/member-policy.pdf?url";

/** Bundled AeroShuttle member policy PDF — served as a static asset, not an app route. */
export const MEMBER_POLICY_PDF_URL = memberPolicyPdfUrl;

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function MemberPolicyViewer({ open, onOpenChange }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-[#131916] border-[rgba(255,255,255,0.10)] text-[#F1F0EE] w-[calc(100%-1rem)] sm:max-w-5xl h-[90dvh] max-h-[90dvh] p-0 gap-0 overflow-hidden flex flex-col">
        <DialogHeader className="px-4 sm:px-6 py-4 border-b border-[rgba(255,255,255,0.08)] shrink-0 pr-12 text-left">
          <DialogTitle className="flex items-center gap-2 text-[#F1F0EE] text-base sm:text-lg">
            <FileText className="size-5 text-primary shrink-0" />
            Member Policy
          </DialogTitle>
          <DialogDescription className="text-muted-foreground text-sm">
            AeroShuttle Badminton Club – Policy for Club Members Charges
          </DialogDescription>
        </DialogHeader>
        <div className="flex-1 min-h-0 bg-[#0c100e]">
          {open && (
            <iframe
              title="Member Policy PDF"
              src={`${MEMBER_POLICY_PDF_URL}#toolbar=1&navpanes=0`}
              className="w-full h-full border-0"
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
