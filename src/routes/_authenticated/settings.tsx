import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { useStore } from "@/lib/store";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Trash2, Plus, HelpCircle } from "lucide-react";

export const Route = createFileRoute("/_authenticated/settings")({
  component: SettingsPage,
});

function SettingsPage() {
  const store = useStore();
  const updateSettings = useStore((state) => state.updateSettings);
  const currentUser = useStore((state) => state.currentUser);
  const updateProfile = useStore((state) => state.updateProfile);

  const [appName, setAppName] = useState(store.appName);
  const [appLogoText, setAppLogoText] = useState(store.appLogoText);
  const [appLogoBase64, setAppLogoBase64] = useState<string | null>(store.appLogoBase64);
  const [currency, setCurrency] = useState(store.currency);
  const [locations, setLocations] = useState<string[]>(store.locations);
  const [grades, setGrades] = useState<string[]>(store.grades);
  const [holidays, setHolidays] = useState<string[]>(store.holidays);

  // States for Admin Credentials
  const [firstName, setFirstName] = useState(currentUser?.firstName || "");
  const [lastName, setLastName] = useState(currentUser?.lastName || "");
  const [sex, setSex] = useState<"male" | "female">(currentUser?.sex || "male");
  const [dob, setDob] = useState(currentUser?.dob || "");
  const [email, setEmail] = useState(currentUser?.email || "");
  const [mobile, setMobile] = useState(currentUser?.mobile || "");
  const [address, setAddress] = useState(currentUser?.address || "");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  // Sync state if currentUser updates
  useEffect(() => {
    if (currentUser) {
      setFirstName(currentUser.firstName);
      setLastName(currentUser.lastName);
      setSex(currentUser.sex);
      setDob(currentUser.dob);
      setEmail(currentUser.email);
      setMobile(currentUser.mobile);
      setAddress(currentUser.address);
    }
  }, [currentUser]);

  // States for adding new items
  const [newLocation, setNewLocation] = useState("");
  const [newGrade, setNewGrade] = useState("");
  const [newHoliday, setNewHoliday] = useState("");

  const handleSaveCredentials = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password && password !== confirmPassword) {
      toast.error("Passwords do not match");
      return;
    }
    try {
      await updateProfile({
        firstName,
        lastName,
        sex,
        dob,
        email,
        mobile,
        address,
        password: password || undefined,
      });
      toast.success("Credentials saved successfully");
      setPassword("");
      setConfirmPassword("");
    } catch (err: any) {
      toast.error(err.message || "Failed to save credentials");
    }
  };

  const handleSaveBranding = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await updateSettings({
        appName,
        appLogoText,
        appLogoBase64,
        currency,
      });
      toast.success("Branding settings saved successfully");
    } catch (err: any) {
      toast.error(err.message || "Failed to save branding");
    }
  };

  const handleAddLocation = () => {
    const trimmed = newLocation.trim();
    if (!trimmed) return;
    if (locations.includes(trimmed)) {
      toast.error("Location already exists");
      return;
    }
    const updated = [...locations, trimmed];
    setLocations(updated);
    setNewLocation("");
    saveUpdatedList({ locations: updated }, "Location added");
  };

  const handleDeleteLocation = (loc: string) => {
    const updated = locations.filter((l) => l !== loc);
    setLocations(updated);
    saveUpdatedList({ locations: updated }, "Location removed");
  };

  const handleAddGrade = () => {
    const trimmed = newGrade.trim();
    if (!trimmed) return;
    if (grades.includes(trimmed)) {
      toast.error("Grade already exists");
      return;
    }
    const updated = [...grades, trimmed];
    setGrades(updated);
    setNewGrade("");
    saveUpdatedList({ grades: updated }, "Grade added");
  };

  const handleDeleteGrade = (g: string) => {
    const updated = grades.filter((x) => x !== g);
    setGrades(updated);
    saveUpdatedList({ grades: updated }, "Grade removed");
  };

  const handleAddHoliday = () => {
    if (!newHoliday) return;
    if (holidays.includes(newHoliday)) {
      toast.error("Holiday date already exists");
      return;
    }
    const updated = [...holidays, newHoliday].sort();
    setHolidays(updated);
    setNewHoliday("");
    saveUpdatedList({ holidays: updated }, "Holiday added");
  };

  const handleDeleteHoliday = (h: string) => {
    const updated = holidays.filter((x) => x !== h);
    setHolidays(updated);
    saveUpdatedList({ holidays: updated }, "Holiday removed");
  };

  const saveUpdatedList = async (
    payload: { locations?: string[]; grades?: string[]; holidays?: string[] },
    successMsg: string
  ) => {
    try {
      await updateSettings(payload);
      toast.success(successMsg);
    } catch (err: any) {
      toast.error(err.message || "Failed to update configuration list");
      // Revert states from store
      setLocations(store.locations);
      setGrades(store.grades);
      setHolidays(store.holidays);
    }
  };

  return (
    <div className="space-y-6 pb-10">
      <PageHeader
        title="Settings"
        description="Configure your software branding, court locations, member grades, and official club holidays."
      />

      <div className="grid md:grid-cols-2 gap-6">
        {/* Branding Configurations */}
        <Card className="bg-[#131916] border-[rgba(255,255,255,0.06)] signature-card-top md:col-span-2">
          <CardHeader className="pb-3 border-b border-white/[0.03]">
            <CardTitle className="text-[12px] font-medium tracking-[0.12em] text-[#34D399] uppercase">
              Branding & App Configuration
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-6">
            <form onSubmit={handleSaveBranding} className="space-y-4">
              <div className="grid sm:grid-cols-3 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-[10px] font-medium tracking-[0.1em] text-[#8A8A98] uppercase">
                    Software / Club Name
                  </Label>
                  <Input
                    required
                    value={appName}
                    onChange={(e) => setAppName(e.target.value)}
                    placeholder="ClubApp"
                    className="bg-[#1A2120] border-[rgba(255,255,255,0.06)] focus:border-[#10B981] text-[#F1F0EE] rounded-lg"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[10px] font-medium tracking-[0.1em] text-[#8A8A98] uppercase">
                    Logo Text / Initial
                  </Label>
                  <Input
                    required
                    maxLength={5}
                    value={appLogoText}
                    onChange={(e) => setAppLogoText(e.target.value)}
                    placeholder="C"
                    className="bg-[#1A2120] border-[rgba(255,255,255,0.06)] focus:border-[#10B981] text-[#F1F0EE] rounded-lg"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[10px] font-medium tracking-[0.1em] text-[#8A8A98] uppercase">
                    Currency Symbol
                  </Label>
                  <Select value={currency} onValueChange={setCurrency}>
                    <SelectTrigger className="bg-[#1A2120] border-[rgba(255,255,255,0.06)] text-[#F1F0EE] h-9 rounded-lg cursor-pointer">
                      <SelectValue placeholder="Select Currency" />
                    </SelectTrigger>
                    <SelectContent className="bg-[#1A2120] border-[rgba(255,255,255,0.10)] text-[#F1F0EE]">
                      <SelectItem value="$" className="cursor-pointer hover:bg-white/5">USD ($)</SelectItem>
                      <SelectItem value="£" className="cursor-pointer hover:bg-white/5">GBP (£)</SelectItem>
                      <SelectItem value="€" className="cursor-pointer hover:bg-white/5">EUR (€)</SelectItem>
                      <SelectItem value="₹" className="cursor-pointer hover:bg-white/5">INR (₹)</SelectItem>
                      <SelectItem value="¥" className="cursor-pointer hover:bg-white/5">JPY (¥)</SelectItem>
                      <SelectItem value="CA$" className="cursor-pointer hover:bg-white/5">CAD (CA$)</SelectItem>
                      <SelectItem value="A$" className="cursor-pointer hover:bg-white/5">AUD (A$)</SelectItem>
                      <SelectItem value="S$" className="cursor-pointer hover:bg-white/5">SGD (S$)</SelectItem>
                      <SelectItem value="RM" className="cursor-pointer hover:bg-white/5">MYR (RM)</SelectItem>
                      <SelectItem value="AED" className="cursor-pointer hover:bg-white/5">AED (AED)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid sm:grid-cols-2 gap-4 items-center border-t border-white/[0.03] pt-4 mt-4">
                <div className="space-y-1.5">
                  <Label className="text-[10px] font-medium tracking-[0.1em] text-[#8A8A98] uppercase">
                    Logo Image
                  </Label>
                  <Input
                    type="file"
                    accept="image/*"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      const reader = new FileReader();
                      reader.onloadend = () => {
                        setAppLogoBase64(reader.result as string);
                      };
                      reader.readAsDataURL(file);
                    }}
                    className="bg-[#1A2120] border-[rgba(255,255,255,0.06)] focus:border-[#10B981] text-[#F1F0EE] rounded-lg cursor-pointer file:bg-[#10B981] file:text-white file:border-none file:rounded-md file:px-2 file:py-1 file:mr-2 file:text-xs"
                  />
                </div>
                <div className="flex items-center gap-4 pt-1.5">
                  {appLogoBase64 ? (
                    <div className="relative size-12 bg-white/5 rounded border border-white/[0.06] flex items-center justify-center overflow-hidden shrink-0">
                      <img src={appLogoBase64} alt="Preview" className="size-full object-contain" />
                      <button
                        type="button"
                        onClick={() => setAppLogoBase64(null)}
                        className="absolute inset-0 bg-black/60 hover:bg-black/80 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity text-red-500 font-semibold text-[10px] uppercase"
                      >
                        Remove
                      </button>
                    </div>
                  ) : (
                    <div className="size-12 rounded border border-dashed border-white/[0.1] flex items-center justify-center text-[10px] text-muted-foreground uppercase text-center shrink-0 leading-tight p-1">
                      No Image Logo
                    </div>
                  )}
                  <span className="text-[11px] text-muted-foreground/60 leading-relaxed font-light">
                    Upload a square PNG or JPEG logo (recommended size 64x64px). If not uploaded, the text logo above will be used.
                  </span>
                </div>
              </div>

              <div className="flex justify-end pt-2">
                <Button type="submit" className="btn-premium-solid h-9 px-4 font-semibold text-xs cursor-pointer">
                  Save Branding
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        {/* Admin Credentials & Profile */}
        <Card className="bg-[#131916] border-[rgba(255,255,255,0.06)] signature-card-top md:col-span-2">
          <CardHeader className="pb-3 border-b border-white/[0.03]">
            <CardTitle className="text-[12px] font-medium tracking-[0.12em] text-[#34D399] uppercase">
              Admin Credentials & Profile
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-6">
            <form onSubmit={handleSaveCredentials} className="space-y-4">
              <div className="grid sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-[10px] font-medium tracking-[0.1em] text-[#8A8A98] uppercase">
                    First Name
                  </Label>
                  <Input
                    required
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    placeholder="First Name"
                    className="bg-[#1A2120] border-[rgba(255,255,255,0.06)] focus:border-[#10B981] text-[#F1F0EE] rounded-lg h-9 text-xs"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[10px] font-medium tracking-[0.1em] text-[#8A8A98] uppercase">
                    Last Name
                  </Label>
                  <Input
                    required
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    placeholder="Last Name"
                    className="bg-[#1A2120] border-[rgba(255,255,255,0.06)] focus:border-[#10B981] text-[#F1F0EE] rounded-lg h-9 text-xs"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[10px] font-medium tracking-[0.1em] text-[#8A8A98] uppercase">
                    Email Address
                  </Label>
                  <Input
                    required
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="admin@example.com"
                    className="bg-[#1A2120] border-[rgba(255,255,255,0.06)] focus:border-[#10B981] text-[#F1F0EE] rounded-lg h-9 text-xs"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[10px] font-medium tracking-[0.1em] text-[#8A8A98] uppercase">
                    Mobile Contact
                  </Label>
                  <Input
                    required
                    value={mobile}
                    onChange={(e) => setMobile(e.target.value)}
                    placeholder="+1 555 0100"
                    className="bg-[#1A2120] border-[rgba(255,255,255,0.06)] focus:border-[#10B981] text-[#F1F0EE] rounded-lg h-9 text-xs"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[10px] font-medium tracking-[0.1em] text-[#8A8A98] uppercase">
                    Sex / Gender
                  </Label>
                  <Select value={sex} onValueChange={(val: "male" | "female") => setSex(val)}>
                    <SelectTrigger className="bg-[#1A2120] border-[rgba(255,255,255,0.06)] text-[#F1F0EE] h-9 rounded-lg cursor-pointer text-xs">
                      <SelectValue placeholder="Select gender" />
                    </SelectTrigger>
                    <SelectContent className="bg-[#1A2120] border-[rgba(255,255,255,0.10)] text-[#F1F0EE]">
                      <SelectItem value="male" className="cursor-pointer hover:bg-white/5">Male</SelectItem>
                      <SelectItem value="female" className="cursor-pointer hover:bg-white/5">Female</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[10px] font-medium tracking-[0.1em] text-[#8A8A98] uppercase">
                    Date of Birth
                  </Label>
                  <Input
                    required
                    type="date"
                    value={dob}
                    onChange={(e) => setDob(e.target.value)}
                    className="bg-[#1A2120] border-[rgba(255,255,255,0.06)] focus:border-[#10B981] text-[#F1F0EE] rounded-lg h-9 text-xs"
                  />
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label className="text-[10px] font-medium tracking-[0.1em] text-[#8A8A98] uppercase">
                    Registered Address
                  </Label>
                  <Input
                    required
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    placeholder="Address"
                    className="bg-[#1A2120] border-[rgba(255,255,255,0.06)] focus:border-[#10B981] text-[#F1F0EE] rounded-lg h-9 text-xs"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[10px] font-medium tracking-[0.1em] text-[#8A8A98] uppercase">
                    New Password (Optional)
                  </Label>
                  <Input
                    type="password"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="bg-[#1A2120] border-[rgba(255,255,255,0.06)] focus:border-[#10B981] text-[#F1F0EE] rounded-lg h-9 text-xs"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[10px] font-medium tracking-[0.1em] text-[#8A8A98] uppercase">
                    Confirm New Password
                  </Label>
                  <Input
                    type="password"
                    placeholder="••••••••"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="bg-[#1A2120] border-[rgba(255,255,255,0.06)] focus:border-[#10B981] text-[#F1F0EE] rounded-lg h-9 text-xs"
                  />
                </div>
              </div>

              <div className="flex justify-end pt-2">
                <Button type="submit" className="btn-premium-solid h-9 px-4 font-semibold text-xs cursor-pointer">
                  Save Credentials
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        {/* Locations Manager */}
        <Card className="bg-[#131916] border-[rgba(255,255,255,0.06)] signature-card-top flex flex-col">
          <CardHeader className="pb-3 border-b border-white/[0.03]">
            <CardTitle className="text-[12px] font-medium tracking-[0.12em] text-[#34D399] uppercase">
              Club Locations
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-4 flex-1 flex flex-col">
            <div className="flex gap-2 mb-4">
              <Input
                value={newLocation}
                onChange={(e) => setNewLocation(e.target.value)}
                placeholder="Add new location (e.g. Hall A)"
                onKeyDown={(e) => e.key === "Enter" && handleAddLocation()}
                className="bg-[#1A2120] border-[rgba(255,255,255,0.06)] focus:border-[#10B981] text-[#F1F0EE] rounded-lg h-9 text-xs"
              />
              <Button
                type="button"
                onClick={handleAddLocation}
                className="h-9 px-3 bg-[#10B981] hover:bg-[#059669] text-white rounded-lg cursor-pointer shrink-0"
              >
                <Plus className="size-4" />
              </Button>
            </div>
            <div className="flex-1 overflow-y-auto max-h-[220px] pr-1 space-y-1">
              {locations.length === 0 ? (
                <div className="text-center py-6 text-xs text-muted-foreground/60">No locations configured.</div>
              ) : (
                locations.map((loc) => (
                  <div
                    key={loc}
                    className="flex justify-between items-center px-3 py-2 bg-[#1A2120]/40 border border-white/[0.02] rounded-lg text-xs"
                  >
                    <span className="text-[#F1F0EE] font-medium">{loc}</span>
                    <button
                      onClick={() => handleDeleteLocation(loc)}
                      className="text-[#EF4444] hover:text-[#DC2626] transition-colors p-1"
                      title="Delete location"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>

        {/* Grades Manager */}
        <Card className="bg-[#131916] border-[rgba(255,255,255,0.06)] signature-card-top flex flex-col">
          <CardHeader className="pb-3 border-b border-white/[0.03]">
            <CardTitle className="text-[12px] font-medium tracking-[0.12em] text-[#34D399] uppercase">
              Member Grades / Levels
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-4 flex-1 flex flex-col">
            <div className="flex gap-2 mb-4">
              <Input
                value={newGrade}
                onChange={(e) => setNewGrade(e.target.value)}
                placeholder="Add new grade (e.g. Advanced)"
                onKeyDown={(e) => e.key === "Enter" && handleAddGrade()}
                className="bg-[#1A2120] border-[rgba(255,255,255,0.06)] focus:border-[#10B981] text-[#F1F0EE] rounded-lg h-9 text-xs"
              />
              <Button
                type="button"
                onClick={handleAddGrade}
                className="h-9 px-3 bg-[#10B981] hover:bg-[#059669] text-white rounded-lg cursor-pointer shrink-0"
              >
                <Plus className="size-4" />
              </Button>
            </div>
            <div className="flex-1 overflow-y-auto max-h-[220px] pr-1 space-y-1">
              {grades.length === 0 ? (
                <div className="text-center py-6 text-xs text-muted-foreground/60">No grades configured.</div>
              ) : (
                grades.map((g) => (
                  <div
                    key={g}
                    className="flex justify-between items-center px-3 py-2 bg-[#1A2120]/40 border border-white/[0.02] rounded-lg text-xs"
                  >
                    <span className="text-[#F1F0EE] font-medium">{g}</span>
                    <button
                      onClick={() => handleDeleteGrade(g)}
                      className="text-[#EF4444] hover:text-[#DC2626] transition-colors p-1"
                      title="Delete grade"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>

        {/* Holidays Manager */}
        <Card className="bg-[#131916] border-[rgba(255,255,255,0.06)] signature-card-top flex flex-col md:col-span-2">
          <CardHeader className="pb-3 border-b border-white/[0.03]">
            <CardTitle className="text-[12px] font-medium tracking-[0.12em] text-[#34D399] uppercase">
              Official Club / Public Holidays
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-4 flex-1">
            <div className="grid sm:grid-cols-2 gap-4 mb-4 items-end">
              <div className="space-y-1">
                <Label className="text-[9px] font-medium text-[#8A8A98] uppercase">Select Holiday Date</Label>
                <Input
                  type="date"
                  value={newHoliday}
                  onChange={(e) => setNewHoliday(e.target.value)}
                  className="bg-[#1A2120] border-[rgba(255,255,255,0.06)] focus:border-[#10B981] text-[#F1F0EE] rounded-lg h-9 text-xs"
                />
              </div>
              <Button
                type="button"
                onClick={handleAddHoliday}
                className="h-9 bg-[#10B981] hover:bg-[#059669] text-white rounded-lg cursor-pointer w-full sm:w-auto font-semibold text-xs"
              >
                <Plus className="size-4 mr-1.5 inline" /> Add Holiday
              </Button>
            </div>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2 overflow-y-auto max-h-[300px] pr-1">
              {holidays.length === 0 ? (
                <div className="text-center py-8 text-xs text-muted-foreground/60 sm:col-span-2 lg:col-span-3">
                  No holidays registered. Weekly training sessions will generate on all consecutive dates.
                </div>
              ) : (
                holidays.map((h) => (
                  <div
                    key={h}
                    className="flex justify-between items-center px-3 py-2 bg-[#1A2120]/40 border border-white/[0.02] rounded-lg text-xs"
                  >
                    <span className="text-[#F1F0EE] font-mono font-medium">{h}</span>
                    <button
                      onClick={() => handleDeleteHoliday(h)}
                      className="text-[#EF4444] hover:text-[#DC2626] transition-colors p-1"
                      title="Delete holiday"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
