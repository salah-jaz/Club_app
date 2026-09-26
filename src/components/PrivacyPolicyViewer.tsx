import { FileText } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { GoogleDocsEmbed } from "@/components/GoogleDocsEmbed";

/** Live Google Doc — always fetched from source, never stored locally. */
export const PRIVACY_POLICY_URL =
  "https://docs.google.com/document/d/1rwBQEUZle6zhx_Bx1dNFhBovVF9Ju7UurmUOUWbMOxU/edit";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function PrivacyPolicyViewer({ open, onOpenChange }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-[#131916] border-[rgba(255,255,255,0.10)] text-[#F1F0EE] w-[calc(100%-1rem)] sm:max-w-5xl h-[90dvh] max-h-[90dvh] p-0 gap-0 overflow-hidden flex flex-col">
        <DialogHeader className="px-4 sm:px-6 py-4 border-b border-[rgba(255,255,255,0.08)] shrink-0 pr-12 text-left">
          <DialogTitle className="flex items-center gap-2 text-[#F1F0EE] text-base sm:text-lg">
            <FileText className="size-5 text-primary shrink-0" />
            Privacy Policy
          </DialogTitle>
          <DialogDescription className="text-muted-foreground text-sm">
            AeroShuttle Badminton Club – Privacy Policy
          </DialogDescription>
        </DialogHeader>
        <GoogleDocsEmbed
          title="Privacy Policy"
          url={PRIVACY_POLICY_URL}
          active={open}
        />
      </DialogContent>
    </Dialog>
  );
}
