import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Eye, EyeOff, ArrowLeft, Mail, KeyRound, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { AuthShell } from "@/components/AuthShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useStore } from "@/lib/store";
import { firstAllowedAdminPath } from "@/lib/permissions";

export const Route = createFileRoute("/login")({ component: LoginPage });

type AuthMode = "login" | "forgot_email" | "forgot_otp" | "forgot_reset";

function LoginPage() {
  const login = useStore((s) => s.login);
  const forgotPassword = useStore((s) => s.forgotPassword);
  const verifyResetOtp = useStore((s) => s.verifyResetOtp);
  const resetPassword = useStore((s) => s.resetPassword);
  const navigate = useNavigate();

  const [mode, setMode] = useState<AuthMode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  // Forgot password state
  const [otp, setOtp] = useState("");
  const [maskedEmail, setMaskedEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const onLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const u = await login(email, password);
      if (!u) {
        toast.error("Invalid credentials or pending approval");
        return;
      }
      toast.success(`Welcome back, ${u.firstName}`);
      navigate({ to: u.role === "admin" ? firstAllowedAdminPath() : "/dashboard" });
    } catch (error: any) {
      toast.error(error.message || "Invalid credentials or pending approval");
    } finally {
      setLoading(false);
    }
  };

  const onSendOtpSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) {
      toast.error("Please enter your email address");
      return;
    }
    setLoading(true);
    try {
      const res = await forgotPassword(email);
      setMaskedEmail(res.maskedEmail || email);
      toast.success("OTP verification code sent to your email!");
      setMode("forgot_otp");
    } catch (error: any) {
      toast.error(error.message || "Failed to send OTP code");
    } finally {
      setLoading(false);
    }
  };

  const onVerifyOtpSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!otp || otp.length !== 6) {
      toast.error("Please enter a valid 6-digit OTP code");
      return;
    }
    setLoading(true);
    try {
      await verifyResetOtp(email, otp);
      toast.success("OTP verified successfully! Set your new password.");
      setMode("forgot_reset");
    } catch (error: any) {
      toast.error(error.message || "Invalid or expired OTP code");
    } finally {
      setLoading(false);
    }
  };

  const onResetPasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword.length < 6) {
      toast.error("Password must be at least 6 characters");
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error("Passwords do not match");
      return;
    }
    setLoading(true);
    try {
      await resetPassword(email, otp, newPassword, confirmPassword);
      toast.success("Password reset successfully! Please sign in with your new password.");
      setPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setOtp("");
      setMode("login");
    } catch (error: any) {
      toast.error(error.message || "Failed to reset password");
    } finally {
      setLoading(false);
    }
  };

  // Render Login Form
  if (mode === "login") {
    return (
      <AuthShell
        title="Sign in"
        subtitle="Access your club dashboard"
        footer={
          <>
            New here?{" "}
            <Link to="/register" className="text-[var(--primary)] font-medium hover:underline transition-all">
              Create an account
            </Link>
          </>
        }
      >
        <form onSubmit={onLoginSubmit} className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="email" className="text-xs font-medium tracking-wider text-[#8A8A98] uppercase">Email Address</Label>
            <Input 
              id="email" 
              type="email"
              name="email"
              autoComplete="username"
              value={email} 
              onChange={(e) => setEmail(e.target.value)} 
              required 
              className="border-[rgba(255,255,255,0.06)] focus:border-[var(--primary)] focus:ring-1 focus:ring-[var(--primary)] h-10 rounded-lg"
            />
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="password" className="text-xs font-medium tracking-wider text-[#8A8A98] uppercase">Password</Label>
              <button
                type="button"
                onClick={() => setMode("forgot_email")}
                className="text-xs text-[var(--primary)] hover:underline font-medium cursor-pointer transition-all"
              >
                Forgot password?
              </button>
            </div>
            <div className="relative">
              <Input
                id="password"
                type={showPassword ? "text" : "password"}
                name="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="border-[rgba(255,255,255,0.06)] focus:border-[var(--primary)] focus:ring-1 focus:ring-[var(--primary)] h-10 rounded-lg !pr-10"
              />
              <button
                type="button"
                aria-label={showPassword ? "Hide password" : "Show password"}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#8A8A98] hover:text-[var(--foreground)] cursor-pointer"
                onClick={() => setShowPassword((v) => !v)}
              >
                {showPassword ? <EyeOff className="size-4" aria-hidden="true" /> : <Eye className="size-4" aria-hidden="true" />}
              </button>
            </div>
          </div>
          <Button type="submit" disabled={loading} className="w-full btn-premium-solid h-10 font-semibold cursor-pointer">
            {loading ? "Signing in..." : "Sign in"}
          </Button>
        </form>
      </AuthShell>
    );
  }

  // Render Forgot Password - Step 1: Send Email OTP
  if (mode === "forgot_email") {
    return (
      <AuthShell
        title="Forgot Password"
        subtitle="Enter your email to receive a password reset OTP"
        footer={
          <button
            type="button"
            onClick={() => setMode("login")}
            className="text-xs text-[#8A8A98] hover:text-[#F1F0EE] font-medium flex items-center justify-center gap-1.5 mx-auto cursor-pointer transition-all"
          >
            <ArrowLeft className="size-3.5" /> Back to Sign in
          </button>
        }
      >
        <form onSubmit={onSendOtpSubmit} className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="reset-email" className="text-xs font-medium tracking-wider text-[#8A8A98] uppercase">Email Address</Label>
            <div className="relative">
              <Input 
                id="reset-email" 
                type="email"
                name="email"
                autoComplete="email"
                placeholder="your.email@example.com"
                value={email} 
                onChange={(e) => setEmail(e.target.value)} 
                required 
                className="border-[rgba(255,255,255,0.06)] focus:border-[var(--primary)] focus:ring-1 focus:ring-[var(--primary)] h-10 rounded-lg !pl-10"
              />
              <Mail className="size-4 text-[#8A8A98] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>
          </div>
          <Button type="submit" disabled={loading} className="w-full btn-premium-solid h-10 font-semibold cursor-pointer">
            {loading ? "Sending OTP..." : "Send OTP Code"}
          </Button>
        </form>
      </AuthShell>
    );
  }

  // Render Forgot Password - Step 2: Enter OTP
  if (mode === "forgot_otp") {
    return (
      <AuthShell
        title="Enter Verification Code"
        subtitle="Verify the OTP sent to your email"
        footer={
          <button
            type="button"
            onClick={() => setMode("login")}
            className="text-xs text-[#8A8A98] hover:text-[#F1F0EE] font-medium flex items-center justify-center gap-1.5 mx-auto cursor-pointer transition-all"
          >
            <ArrowLeft className="size-3.5" /> Back to Sign in
          </button>
        }
      >
        <form onSubmit={onVerifyOtpSubmit} className="space-y-5">
          <div className="p-3.5 bg-[var(--violet-dim,rgba(16,185,129,0.08))] border border-[var(--border-accent,rgba(16,185,129,0.2))] rounded-lg text-xs space-y-1">
            <p className="font-semibold text-[var(--primary)] flex items-center gap-1.5">
              <Mail className="size-3.5" /> OTP Email Sent
            </p>
            <p className="text-[var(--secondary-foreground,#4E615B)] dark:text-[#8A9E98] leading-relaxed">
              An email containing a 6-digit verification code (OTP) has been sent to{" "}
              <span className="font-semibold text-[var(--foreground,#0C0F0E)] dark:text-white tracking-wide">{maskedEmail}</span>. Please enter that code below:
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="otp" className="text-xs font-medium tracking-wider text-[#8A8A98] uppercase">Enter 6-Digit OTP</Label>
            <div className="relative">
              <Input
                id="otp"
                type="text"
                maxLength={6}
                placeholder="123456"
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
                required
                className="border-[rgba(255,255,255,0.06)] focus:border-[var(--primary)] focus:ring-1 focus:ring-[var(--primary)] h-11 rounded-lg text-center tracking-[0.5em] text-lg font-bold text-[var(--primary)] !pl-10 !pr-10"
              />
              <KeyRound className="size-4 text-[#8A8A98] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>
          </div>

          <Button type="submit" disabled={loading || otp.length !== 6} className="w-full btn-premium-solid h-10 font-semibold cursor-pointer">
            {loading ? "Verifying..." : "Verify OTP Code"}
          </Button>

          <div className="text-center pt-1">
            <button
              type="button"
              disabled={loading}
              onClick={onSendOtpSubmit}
              className="text-xs text-[var(--primary)] hover:underline font-medium cursor-pointer"
            >
              Didn't receive code? Resend OTP
            </button>
          </div>
        </form>
      </AuthShell>
    );
  }

  // Render Forgot Password - Step 3: Set New Password
  return (
    <AuthShell
      title="Reset Password"
      subtitle="Enter your new password to complete reset"
      footer={
        <button
          type="button"
          onClick={() => setMode("login")}
          className="text-xs text-[#8A8A98] hover:text-[#F1F0EE] font-medium flex items-center justify-center gap-1.5 mx-auto cursor-pointer transition-all"
        >
          <ArrowLeft className="size-3.5" /> Cancel & Back to Sign in
        </button>
      }
    >
      <form onSubmit={onResetPasswordSubmit} className="space-y-5">
        <div className="p-3.5 bg-[var(--violet-dim,rgba(16,185,129,0.08))] border border-[var(--border-accent,rgba(16,185,129,0.2))] rounded-lg text-xs text-[var(--secondary-foreground,#4E615B)] dark:text-[#8A9E98] flex items-center gap-2">
          <ShieldCheck className="size-4 text-[var(--primary)] shrink-0" />
          <span>
            OTP verified successfully for <strong className="font-semibold text-[var(--foreground,#0C0F0E)] dark:text-white">{maskedEmail}</strong>
          </span>
        </div>

        <div className="space-y-2">
          <Label htmlFor="new-password" className="text-xs font-medium tracking-wider text-[#8A8A98] uppercase">New Password</Label>
          <div className="relative">
            <Input
              id="new-password"
              type={showNewPassword ? "text" : "password"}
              name="newPassword"
              autoComplete="new-password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
              minLength={6}
              className="border-[rgba(255,255,255,0.06)] focus:border-[var(--primary)] focus:ring-1 focus:ring-[var(--primary)] h-10 rounded-lg !pr-10"
            />
            <button
              type="button"
              aria-label={showNewPassword ? "Hide password" : "Show password"}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#8A8A98] hover:text-[var(--foreground)] cursor-pointer"
              onClick={() => setShowNewPassword((v) => !v)}
            >
              {showNewPassword ? <EyeOff className="size-4" aria-hidden="true" /> : <Eye className="size-4" aria-hidden="true" />}
            </button>
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="confirm-password" className="text-xs font-medium tracking-wider text-[#8A8A98] uppercase">Confirm New Password</Label>
          <div className="relative">
            <Input
              id="confirm-password"
              type={showConfirmPassword ? "text" : "password"}
              name="confirmPassword"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              minLength={6}
              className="border-[rgba(255,255,255,0.06)] focus:border-[var(--primary)] focus:ring-1 focus:ring-[var(--primary)] h-10 rounded-lg !pr-10"
            />
            <button
              type="button"
              aria-label={showConfirmPassword ? "Hide password" : "Show password"}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#8A8A98] hover:text-[var(--foreground)] cursor-pointer"
              onClick={() => setShowConfirmPassword((v) => !v)}
            >
              {showConfirmPassword ? <EyeOff className="size-4" aria-hidden="true" /> : <Eye className="size-4" aria-hidden="true" />}
            </button>
          </div>
        </div>

        <Button type="submit" disabled={loading} className="w-full btn-premium-solid h-10 font-semibold cursor-pointer">
          {loading ? "Updating Password..." : "Confirm & Reset Password"}
        </Button>
      </form>
    </AuthShell>
  );
}