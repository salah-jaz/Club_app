import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { useStore } from "@/lib/store";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Palette, Eye, Mail, ShieldAlert } from "lucide-react";

export const Route = createFileRoute("/_authenticated/email-templates")({
  component: EmailTemplatesPage,
});

function EmailTemplatesPage() {
  const store = useStore();
  const updateSettings = store.updateSettings;
  const currentUser = store.currentUser;

  // Form states initialized from Zustand store
  const [primaryColor, setPrimaryColor] = useState(store.emailPrimaryColor || "#10B981");
  const [bgColor, setBgColor] = useState(store.emailBgColor || "#0C0F0E");
  const [textColor, setTextColor] = useState(store.emailTextColor || "#E8F0EE");
  const [cardBgColor, setCardBgColor] = useState(store.emailCardBgColor || "#131916");
  const [footerText, setFooterText] = useState(store.emailFooterText || "");

  // Preview options state
  const [previewType, setPreviewType] = useState<"approval" | "rejection" | "transaction" | "schedule" | "training">("transaction");

  // Sync state if store settings change later
  useEffect(() => {
    setPrimaryColor(store.emailPrimaryColor || "#10B981");
    setBgColor(store.emailBgColor || "#0C0F0E");
    setTextColor(store.emailTextColor || "#E8F0EE");
    setCardBgColor(store.emailCardBgColor || "#131916");
    setFooterText(store.emailFooterText || "");
  }, [
    store.emailPrimaryColor,
    store.emailBgColor,
    store.emailTextColor,
    store.emailCardBgColor,
    store.emailFooterText,
  ]);

  if (!currentUser || currentUser.role !== "admin") {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center space-y-4">
        <ShieldAlert className="size-16 text-red-500 animate-pulse" />
        <h2 className="text-xl font-bold text-[#F1F0EE]">Access Denied</h2>
        <p className="text-sm text-[#8A8A98] max-w-md">
          Only club administrators are authorized to access and modify outgoing email templates.
        </p>
      </div>
    );
  }

  const handleReset = () => {
    setPrimaryColor("#10B981");
    setBgColor("#0C0F0E");
    setTextColor("#E8F0EE");
    setCardBgColor("#131916");
    setFooterText(`© ${new Date().getFullYear()} ${store.appName || "ClubConnect"}. All rights reserved.`);
    toast.info("Reset local changes to system defaults.");
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await updateSettings({
        emailPrimaryColor: primaryColor,
        emailBgColor: bgColor,
        emailTextColor: textColor,
        emailCardBgColor: cardBgColor,
        emailFooterText: footerText,
      });
      toast.success("Email template settings saved successfully");
    } catch (err: any) {
      toast.error(err.message || "Failed to save settings");
    }
  };

  // Render dummy contents matching the helpers in MailHelper.php
  const renderPreviewContent = () => {
    switch (previewType) {
      case "approval":
        return (
          <>
            <h2 style={{ color: primaryColor, fontSize: "18px", marginTop: 0, fontWeight: "bold" }}>Account Approved</h2>
            <p style={{ margin: "14px 0 8px 0" }}>Hello John,</p>
            <p style={{ margin: "8px 0 16px 0", lineHeight: "1.5" }}>
              Great news! Your account has been reviewed and approved by the club administrator.
            </p>
            <p style={{ margin: "8px 0 16px 0", lineHeight: "1.5" }}>
              You can now log in to the club portal and access the dashboard, book schedules, and join training sessions.
            </p>
            <div style={{ marginTop: "25px", textAlign: "center" }}>
              <span
                style={{
                  display: "inline-block",
                  backgroundColor: primaryColor,
                  color: "#000000",
                  fontWeight: "bold",
                  textDecoration: "none",
                  padding: "10px 20px",
                  borderRadius: "4px",
                  fontSize: "13px",
                  fontFamily: "sans-serif",
                }}
              >
                Log In to Portal
              </span>
            </div>
          </>
        );

      case "rejection":
        return (
          <>
            <h2 style={{ color: "#EF4444", fontSize: "18px", marginTop: 0, fontWeight: "bold" }}>Account Registration</h2>
            <p style={{ margin: "14px 0 8px 0" }}>Hello John,</p>
            <p style={{ margin: "8px 0 16px 0", lineHeight: "1.5" }}>
              Thank you for your interest. We regret to inform you that your registration request has been declined at this time.
            </p>
            <p style={{ margin: "8px 0 16px 0", lineHeight: "1.5" }}>
              If you have any questions or believe this was in error, please contact the club administrator.
            </p>
          </>
        );

      case "transaction":
        return (
          <>
            <h2 style={{ color: primaryColor, fontSize: "18px", marginTop: 0, fontWeight: "bold" }}>Transaction Alert</h2>
            <p style={{ margin: "14px 0 8px 0" }}>Hello John,</p>
            <p style={{ margin: "8px 0 16px 0", lineHeight: "1.5" }}>
              A new transaction has been recorded on your member account.
            </p>
            <table style={{ width: "100%", borderCollapse: "collapse", marginTop: "15px" }}>
              <tbody>
                <tr>
                  <td style={{ padding: "8px 0", borderBottom: "1px solid rgba(255,255,255,0.06)", color: "#8A9E98", fontSize: "13px" }}>Description:</td>
                  <td style={{ padding: "8px 0", borderBottom: "1px solid rgba(255,255,255,0.06)", fontWeight: "bold", textAlign: "right", fontSize: "13px" }}>Play session: Monday Smash Arena</td>
                </tr>
                <tr>
                  <td style={{ padding: "8px 0", borderBottom: "1px solid rgba(255,255,255,0.06)", color: "#8A9E98", fontSize: "13px" }}>Type:</td>
                  <td style={{ padding: "8px 0", borderBottom: "1px solid rgba(255,255,255,0.06)", fontWeight: "bold", color: "#EF4444", textAlign: "right", fontSize: "13px" }}>Debited</td>
                </tr>
                <tr>
                  <td style={{ padding: "8px 0", borderBottom: "1px solid rgba(255,255,255,0.06)", color: "#8A9E98", fontSize: "13px" }}>Amount:</td>
                  <td style={{ padding: "8px 0", borderBottom: "1px solid rgba(255,255,255,0.06)", fontWeight: "bold", textAlign: "right", fontSize: "13px" }}>$15.00</td>
                </tr>
                <tr>
                  <td style={{ padding: "8px 0", borderBottom: "1px solid rgba(255,255,255,0.06)", color: "#8A9E98", fontSize: "13px" }}>Account Balance:</td>
                  <td style={{ padding: "8px 0", borderBottom: "1px solid rgba(255,255,255,0.06)", fontWeight: "bold", textAlign: "right", fontSize: "13px" }}>$45.00</td>
                </tr>
              </tbody>
            </table>
          </>
        );

      case "schedule":
        return (
          <>
            <h2 style={{ color: primaryColor, fontSize: "18px", marginTop: 0, fontWeight: "bold" }}>New Schedule Released</h2>
            <p style={{ margin: "14px 0 8px 0" }}>Hello John,</p>
            <p style={{ margin: "8px 0 16px 0", lineHeight: "1.5" }}>
              The play schedule <strong>Monday Smash Arena</strong> has been released by the club.
            </p>
            <table style={{ width: "100%", borderCollapse: "collapse", marginTop: "15px" }}>
              <tbody>
                <tr>
                  <td style={{ padding: "8px 0", borderBottom: "1px solid rgba(255,255,255,0.06)", color: "#8A9E98", fontSize: "13px" }}>Date:</td>
                  <td style={{ padding: "8px 0", borderBottom: "1px solid rgba(255,255,255,0.06)", fontWeight: "bold", textAlign: "right", fontSize: "13px" }}>2026-06-22</td>
                </tr>
                <tr>
                  <td style={{ padding: "8px 0", borderBottom: "1px solid rgba(255,255,255,0.06)", color: "#8A9E98", fontSize: "13px" }}>Location:</td>
                  <td style={{ padding: "8px 0", borderBottom: "1px solid rgba(255,255,255,0.06)", fontWeight: "bold", textAlign: "right", fontSize: "13px" }}>Main Court A</td>
                </tr>
                <tr>
                  <td style={{ padding: "8px 0", borderBottom: "1px solid rgba(255,255,255,0.06)", color: "#8A9E98", fontSize: "13px" }}>Status:</td>
                  <td style={{ padding: "8px 0", borderBottom: "1px solid rgba(255,255,255,0.06)", fontWeight: "bold", textTransform: "uppercase", textAlign: "right", fontSize: "13px" }}>RELEASED</td>
                </tr>
              </tbody>
            </table>
          </>
        );

      case "training":
        return (
          <>
            <h2 style={{ color: primaryColor, fontSize: "18px", marginTop: 0, fontWeight: "bold" }}>New Training Session Released</h2>
            <p style={{ margin: "14px 0 8px 0" }}>Hello John,</p>
            <p style={{ margin: "8px 0 16px 0", lineHeight: "1.5" }}>
              The training course <strong>Elite Junior Coaching</strong> has been released by the club.
            </p>
            <table style={{ width: "100%", borderCollapse: "collapse", marginTop: "15px" }}>
              <tbody>
                <tr>
                  <td style={{ padding: "8px 0", borderBottom: "1px solid rgba(255,255,255,0.06)", color: "#8A9E98", fontSize: "13px" }}>Coach:</td>
                  <td style={{ padding: "8px 0", borderBottom: "1px solid rgba(255,255,255,0.06)", fontWeight: "bold", textAlign: "right", fontSize: "13px" }}>Coach Sarah Miller</td>
                </tr>
                <tr>
                  <td style={{ padding: "8px 0", borderBottom: "1px solid rgba(255,255,255,0.06)", color: "#8A9E98", fontSize: "13px" }}>Start Date:</td>
                  <td style={{ padding: "8px 0", borderBottom: "1px solid rgba(255,255,255,0.06)", fontWeight: "bold", textAlign: "right", fontSize: "13px" }}>2026-06-25</td>
                </tr>
                <tr>
                  <td style={{ padding: "8px 0", borderBottom: "1px solid rgba(255,255,255,0.06)", color: "#8A9E98", fontSize: "13px" }}>Location:</td>
                  <td style={{ padding: "8px 0", borderBottom: "1px solid rgba(255,255,255,0.06)", fontWeight: "bold", textAlign: "right", fontSize: "13px" }}>Studio B</td>
                </tr>
                <tr>
                  <td style={{ padding: "8px 0", borderBottom: "1px solid rgba(255,255,255,0.06)", color: "#8A9E98", fontSize: "13px" }}>Status:</td>
                  <td style={{ padding: "8px 0", borderBottom: "1px solid rgba(255,255,255,0.06)", fontWeight: "bold", textTransform: "uppercase", textAlign: "right", fontSize: "13px" }}>RELEASED</td>
                </tr>
              </tbody>
            </table>
          </>
        );

      default:
        return null;
    }
  };

  const appLogoBase64 = store.appLogoBase64;
  const appLogoText = store.appLogoText;
  const appName = store.appName;

  return (
    <div className="space-y-6 pb-10">
      <PageHeader
        title="Email Templates"
        description="Customize the brand theme colors, typography, logos, and footer information for all outgoing emails."
      />

      <div className="grid lg:grid-cols-5 gap-6 items-start">
        {/* Settings Panel */}
        <Card className="bg-[#131916] border-[rgba(255,255,255,0.06)] signature-card-top lg:col-span-2">
          <CardHeader className="pb-3 border-b border-white/[0.03]">
            <CardTitle className="text-xs font-semibold tracking-wider text-[#34D399] uppercase flex items-center gap-1.5">
              <Palette className="size-4" /> Styling Options
            </CardTitle>
            <CardDescription className="text-[11px] text-muted-foreground">
              Define the visual presentation settings for HTML emails.
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-6">
            <form onSubmit={handleSave} className="space-y-5">
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="primaryColor" className="text-[10px] font-semibold text-[#8A8A98] uppercase tracking-wider">
                      Primary Accent
                    </Label>
                    <div className="flex gap-2">
                      <Input
                        type="color"
                        id="primaryColorPicker"
                        value={primaryColor}
                        onChange={(e) => setPrimaryColor(e.target.value)}
                        className="w-10 h-9 p-0.5 border-0 rounded bg-[#1A2120] cursor-pointer"
                      />
                      <Input
                        type="text"
                        id="primaryColor"
                        maxLength={7}
                        value={primaryColor}
                        onChange={(e) => setPrimaryColor(e.target.value)}
                        className="bg-[#1A2120] border-[rgba(255,255,255,0.06)] focus:border-[#10B981] text-[#F1F0EE] h-9 text-xs rounded-lg"
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="textColor" className="text-[10px] font-semibold text-[#8A8A98] uppercase tracking-wider">
                      Body Text
                    </Label>
                    <div className="flex gap-2">
                      <Input
                        type="color"
                        id="textColorPicker"
                        value={textColor}
                        onChange={(e) => setTextColor(e.target.value)}
                        className="w-10 h-9 p-0.5 border-0 rounded bg-[#1A2120] cursor-pointer"
                      />
                      <Input
                        type="text"
                        id="textColor"
                        maxLength={7}
                        value={textColor}
                        onChange={(e) => setTextColor(e.target.value)}
                        className="bg-[#1A2120] border-[rgba(255,255,255,0.06)] focus:border-[#10B981] text-[#F1F0EE] h-9 text-xs rounded-lg"
                      />
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="bgColor" className="text-[10px] font-semibold text-[#8A8A98] uppercase tracking-wider">
                      Page Background
                    </Label>
                    <div className="flex gap-2">
                      <Input
                        type="color"
                        id="bgColorPicker"
                        value={bgColor}
                        onChange={(e) => setBgColor(e.target.value)}
                        className="w-10 h-9 p-0.5 border-0 rounded bg-[#1A2120] cursor-pointer"
                      />
                      <Input
                        type="text"
                        id="bgColor"
                        maxLength={7}
                        value={bgColor}
                        onChange={(e) => setBgColor(e.target.value)}
                        className="bg-[#1A2120] border-[rgba(255,255,255,0.06)] focus:border-[#10B981] text-[#F1F0EE] h-9 text-xs rounded-lg"
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="cardBgColor" className="text-[10px] font-semibold text-[#8A8A98] uppercase tracking-wider">
                      Card Background
                    </Label>
                    <div className="flex gap-2">
                      <Input
                        type="color"
                        id="cardBgColorPicker"
                        value={cardBgColor}
                        onChange={(e) => setCardBgColor(e.target.value)}
                        className="w-10 h-9 p-0.5 border-0 rounded bg-[#1A2120] cursor-pointer"
                      />
                      <Input
                        type="text"
                        id="cardBgColor"
                        maxLength={7}
                        value={cardBgColor}
                        onChange={(e) => setCardBgColor(e.target.value)}
                        className="bg-[#1A2120] border-[rgba(255,255,255,0.06)] focus:border-[#10B981] text-[#F1F0EE] h-9 text-xs rounded-lg"
                      />
                    </div>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="footerText" className="text-[10px] font-semibold text-[#8A8A98] uppercase tracking-wider">
                    Footer HTML / Text Customization
                  </Label>
                  <Textarea
                    id="footerText"
                    value={footerText}
                    onChange={(e) => setFooterText(e.target.value)}
                    placeholder={`© ${new Date().getFullYear()} ${store.appName || "ClubConnect"}. All rights reserved.`}
                    rows={4}
                    className="bg-[#1A2120] border-[rgba(255,255,255,0.06)] focus:border-[#10B981] text-[#F1F0EE] text-xs rounded-lg resize-none min-h-[90px]"
                  />
                  <span className="text-[10px] text-muted-foreground/60 leading-normal block">
                    Dynamic variables used: Logo brand colors and app name are loaded automatically.
                  </span>
                </div>
              </div>

              <div className="flex justify-between items-center pt-4 border-t border-white/[0.03]">
                <Button
                  type="button"
                  onClick={handleReset}
                  className="bg-transparent hover:bg-white/5 border border-white/[0.06] text-muted-foreground hover:text-white h-9 px-4 font-semibold text-xs cursor-pointer rounded-lg"
                >
                  Reset Defaults
                </Button>
                <Button
                  type="submit"
                  className="btn-premium-solid h-9 px-5 font-semibold text-xs cursor-pointer rounded-lg"
                >
                  Save Settings
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        {/* Live Preview Panel */}
        <Card className="bg-[#131916] border-[rgba(255,255,255,0.06)] signature-card-top lg:col-span-3 h-full flex flex-col">
          <CardHeader className="pb-3 border-b border-white/[0.03] flex flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle className="text-xs font-semibold tracking-wider text-[#34D399] uppercase flex items-center gap-1.5">
                <Eye className="size-4" /> Live Template Preview
              </CardTitle>
              <CardDescription className="text-[11px] text-muted-foreground">
                See changes rendered in real-time as colors or texts change.
              </CardDescription>
            </div>
            <div className="w-40 shrink-0">
              <Select value={previewType} onValueChange={(val: any) => setPreviewType(val)}>
                <SelectTrigger className="bg-[#1A2120] border-[rgba(255,255,255,0.06)] text-[#F1F0EE] h-8 text-xs cursor-pointer rounded-lg">
                  <SelectValue placeholder="Preview Email" />
                </SelectTrigger>
                <SelectContent className="bg-[#1A2120] border-[rgba(255,255,255,0.10)] text-[#F1F0EE]">
                  <SelectItem value="approval" className="cursor-pointer text-xs hover:bg-white/5">Account Approved</SelectItem>
                  <SelectItem value="rejection" className="cursor-pointer text-xs hover:bg-white/5">Account Registration</SelectItem>
                  <SelectItem value="transaction" className="cursor-pointer text-xs hover:bg-white/5">Transaction Alert</SelectItem>
                  <SelectItem value="schedule" className="cursor-pointer text-xs hover:bg-white/5">Play Schedule released</SelectItem>
                  <SelectItem value="training" className="cursor-pointer text-xs hover:bg-white/5">Training session released</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardHeader>
          <CardContent className="pt-6 flex-1 flex items-center justify-center bg-[#090C0B] p-6 rounded-b-xl min-h-[420px]">
            {/* Simulation of the template frame */}
            <div
              style={{
                backgroundColor: bgColor,
                color: textColor,
                fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
                width: "100%",
                maxWidth: "460px",
                borderRadius: "8px",
                padding: "24px 16px",
                boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.4)",
                border: "1px solid rgba(255,255,255,0.03)",
                transition: "all 0.2s ease-in-out",
              }}
            >
              {/* Email Header */}
              <div style={{ textAlign: "center", paddingBottom: "20px" }}>
                {appLogoBase64 ? (
                  <img
                    src={appLogoBase64}
                    alt={appName}
                    style={{ maxHeight: "36px", display: "block", margin: "0 auto" }}
                  />
                ) : (
                  <div
                    style={{
                      display: "inline-block",
                      padding: "6px 12px",
                      backgroundColor: primaryColor,
                      color: "#000000",
                      fontWeight: "bold",
                      fontSize: "16px",
                      borderRadius: "4px",
                    }}
                  >
                    {appLogoText || "C"}
                  </div>
                )}
                <h1
                  style={{
                    fontSize: "16px",
                    marginTop: "8px",
                    marginBottom: "0",
                    fontWeight: "500",
                    color: textColor,
                  }}
                >
                  {appName || "ClubConnect"}
                </h1>
              </div>

              {/* Email Content Box */}
              <div
                style={{
                  backgroundColor: cardBgColor,
                  border: "1px solid rgba(255, 255, 255, 0.05)",
                  borderRadius: "6px",
                  padding: "20px",
                  fontSize: "13px",
                  color: textColor,
                }}
              >
                {renderPreviewContent()}
              </div>

              {/* Email Footer */}
              <div
                style={{
                  paddingTop: "20px",
                  textAlign: "center",
                  fontSize: "10px",
                  color: "#8A9E98",
                  lineHeight: "1.4",
                }}
              >
                {footerText || `© ${new Date().getFullYear()} ${appName || "ClubConnect"}. All rights reserved.`}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
