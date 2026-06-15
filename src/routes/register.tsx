import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { AuthShell } from "@/components/AuthShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useStore } from "@/lib/store";

export const Route = createFileRoute("/register")({ component: RegisterPage });

function RegisterPage() {
  const register = useStore((s) => s.register);
  const verifyOtp = useStore((s) => s.verifyOtp);
  const resendOtp = useStore((s) => s.resendOtp);
  const navigate = useNavigate();
  
  const [f, setF] = useState({
    firstName: "", lastName: "", sex: "male" as "male" | "female", dob: "",
    email: "", mobile: "", address: "", password: "",
  });
  
  const [showOtpScreen, setShowOtpScreen] = useState(false);
  const [otp, setOtp] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [resending, setResending] = useState(false);

  const update = (k: keyof typeof f, v: string) => setF((p) => ({ ...p, [k]: v }));

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await register(f);
      toast.success("OTP sent to your email. Please verify.");
      setShowOtpScreen(true);
    } catch (error: any) {
      toast.error(error.message || "Failed to submit registration.");
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (otp.length !== 6) {
      toast.error("Please enter a valid 6-digit code.");
      return;
    }
    setVerifying(true);
    try {
      await verifyOtp(f.email, otp);
      toast.success("Email verified successfully. Awaiting admin approval.");
      navigate({ to: "/login" });
    } catch (error: any) {
      toast.error(error.message || "Failed to verify OTP.");
    } finally {
      setVerifying(false);
    }
  };

  const handleResendOtp = async () => {
    setResending(true);
    try {
      await resendOtp(f.email);
      toast.success("A new OTP has been sent to your email.");
    } catch (error: any) {
      toast.error(error.message || "Failed to resend OTP.");
    } finally {
      setResending(false);
    }
  };

  if (showOtpScreen) {
    return (
      <AuthShell
        title="Verify your email"
        subtitle={`We've sent a 6-digit verification code to ${f.email}`}
        footer={
          <button
            onClick={() => setShowOtpScreen(false)}
            className="text-[#10B981] font-medium hover:underline transition-all bg-transparent border-0 cursor-pointer text-xs"
          >
            ← Back to registration
          </button>
        }
      >
        <form onSubmit={handleVerifyOtp} className="space-y-6">
          <div className="space-y-2">
            <Label className="text-[10px] font-medium tracking-[0.1em] text-[#8A8A98] uppercase block text-center">
              Verification Code
            </Label>
            <Input
              required
              maxLength={6}
              value={otp}
              onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
              placeholder="000000"
              className="bg-[#131916] border-[rgba(255,255,255,0.06)] focus:border-[#10B981] focus:ring-1 focus:ring-[#10B981] text-[#F1F0EE] rounded-lg text-center text-2xl tracking-[0.5em] font-mono h-12"
            />
          </div>

          <div className="space-y-3">
            <Button
              type="submit"
              disabled={verifying}
              className="w-full btn-premium-solid h-10 font-semibold cursor-pointer"
            >
              {verifying ? "Verifying..." : "Verify OTP"}
            </Button>

            <div className="text-center">
              <button
                type="button"
                disabled={resending}
                onClick={handleResendOtp}
                className="text-xs text-muted-foreground hover:text-foreground transition-all bg-transparent border-0 cursor-pointer disabled:opacity-50"
              >
                {resending ? "Resending..." : "Resend code"}
              </button>
            </div>
          </div>
        </form>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Create account"
      subtitle="Submit your details — an admin will approve you shortly."
      footer={<>Already have an account? <Link to="/login" className="text-[#10B981] font-medium hover:underline transition-all">Sign in</Link></>}
    >
      <form onSubmit={onSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-[10px] font-medium tracking-[0.1em] text-[#8A8A98] uppercase">First name</Label>
            <Input required value={f.firstName} onChange={(e) => update("firstName", e.target.value)} className="bg-[#131916] border-[rgba(255,255,255,0.06)] focus:border-[#10B981] focus:ring-1 focus:ring-[#10B981] text-[#F1F0EE] rounded-lg" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-[10px] font-medium tracking-[0.1em] text-[#8A8A98] uppercase">Last name</Label>
            <Input required value={f.lastName} onChange={(e) => update("lastName", e.target.value)} className="bg-[#131916] border-[rgba(255,255,255,0.06)] focus:border-[#10B981] focus:ring-1 focus:ring-[#10B981] text-[#F1F0EE] rounded-lg" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-[10px] font-medium tracking-[0.1em] text-[#8A8A98] uppercase">Sex</Label>
            <Select value={f.sex} onValueChange={(v) => update("sex", v as any)}>
              <SelectTrigger className="bg-[#131916] border-[rgba(255,255,255,0.06)] text-[#F1F0EE] rounded-lg"><SelectValue /></SelectTrigger>
              <SelectContent className="bg-[#1A2120] border-[rgba(255,255,255,0.10)] text-[#F1F0EE]">
                <SelectItem value="male">Male</SelectItem>
                <SelectItem value="female">Female</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-[10px] font-medium tracking-[0.1em] text-[#8A8A98] uppercase">Date of birth</Label>
            <Input required type="date" value={f.dob} onChange={(e) => update("dob", e.target.value)} className="bg-[#131916] border-[rgba(255,255,255,0.06)] focus:border-[#10B981] focus:ring-1 focus:ring-[#10B981] text-[#F1F0EE] rounded-lg" />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label className="text-[10px] font-medium tracking-[0.1em] text-[#8A8A98] uppercase">Email</Label>
          <Input required type="email" value={f.email} onChange={(e) => update("email", e.target.value)} className="bg-[#131916] border-[rgba(255,255,255,0.06)] focus:border-[#10B981] focus:ring-1 focus:ring-[#10B981] text-[#F1F0EE] rounded-lg" />
        </div>
        <div className="space-y-1.5">
          <Label className="text-[10px] font-medium tracking-[0.1em] text-[#8A8A98] uppercase">Mobile</Label>
          <Input required value={f.mobile} onChange={(e) => update("mobile", e.target.value)} className="bg-[#131916] border-[rgba(255,255,255,0.06)] focus:border-[#10B981] focus:ring-1 focus:ring-[#10B981] text-[#F1F0EE] rounded-lg" />
        </div>
        <div className="space-y-1.5">
          <Label className="text-[10px] font-medium tracking-[0.1em] text-[#8A8A98] uppercase">Address</Label>
          <Textarea required value={f.address} onChange={(e) => update("address", e.target.value)} className="bg-[#131916] border-[rgba(255,255,255,0.06)] focus:border-[#10B981] focus:ring-1 focus:ring-[#10B981] text-[#F1F0EE] min-h-[60px] rounded-lg" />
        </div>
        <div className="space-y-1.5">
          <Label className="text-[10px] font-medium tracking-[0.1em] text-[#8A8A98] uppercase">Password</Label>
          <Input required type="password" value={f.password} onChange={(e) => update("password", e.target.value)} className="bg-[#131916] border-[rgba(255,255,255,0.06)] focus:border-[#10B981] focus:ring-1 focus:ring-[#10B981] text-[#F1F0EE] rounded-lg" />
        </div>
        <Button type="submit" className="w-full btn-premium-solid h-10 font-semibold cursor-pointer">
          Submit registration
        </Button>
      </form>
    </AuthShell>
  );
}