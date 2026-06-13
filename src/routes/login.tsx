import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { AuthShell } from "@/components/AuthShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useStore } from "@/lib/store";

export const Route = createFileRoute("/login")({ component: LoginPage });

function LoginPage() {
  const login = useStore((s) => s.login);
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const u = await login(email, password);
      if (!u) {
        toast.error("Invalid credentials or pending approval");
        return;
      }
      toast.success(`Welcome back, ${u.firstName}`);
      navigate({ to: "/dashboard" });
    } catch (error: any) {
      toast.error(error.message || "Invalid credentials or pending approval");
    }
  };

  return (
    <AuthShell
      title="Sign in"
      subtitle="Access your club dashboard"
      footer={
        <>
          New here?{" "}
          <Link to="/register" className="text-[#10B981] font-medium hover:underline transition-all">
            Create an account
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} className="space-y-5">
        <div className="space-y-2">
          <Label htmlFor="email" className="text-xs font-medium tracking-wider text-[#8A8A98] uppercase">Email Address</Label>
          <Input 
            id="email" 
            type="email" 
            value={email} 
            onChange={(e) => setEmail(e.target.value)} 
            required 
            className="bg-[#131916] border-[rgba(255,255,255,0.06)] focus:border-[#10B981] focus:ring-1 focus:ring-[#10B981] text-[#F1F0EE] h-10 rounded-lg"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="password" className="text-xs font-medium tracking-wider text-[#8A8A98] uppercase">Password</Label>
          <Input 
            id="password" 
            type="password" 
            value={password} 
            onChange={(e) => setPassword(e.target.value)} 
            required 
            className="bg-[#131916] border-[rgba(255,255,255,0.06)] focus:border-[#10B981] focus:ring-1 focus:ring-[#10B981] text-[#F1F0EE] h-10 rounded-lg"
          />
        </div>
        <Button type="submit" className="w-full btn-premium-solid h-10 font-semibold cursor-pointer">
          Sign in
        </Button>

      </form>
    </AuthShell>
  );
}