import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { useStore } from "@/lib/store";
import { applyCustomTheme } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Trash2, Plus, HelpCircle, Pencil, Check, X, ChevronUp, ChevronDown } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import {
  ConfirmDeleteDialog,
  type ConfirmDeleteRequest,
} from "@/components/ConfirmDeleteDialog";
import { TIMEZONE_OPTIONS, resolveTimezone } from "@/lib/timezones";

export const Route = createFileRoute("/_authenticated/settings")({
  component: SettingsPage,
});

type EditableListKey = "locations" | "adultGrades" | "juniorGrades" | "playerPositions";

function EditableConfigRow({
  value,
  isEditing,
  editValue,
  onEditValueChange,
  onStartEdit,
  onSave,
  onCancel,
  onDelete,
  rankLabel,
  onMoveUp,
  onMoveDown,
  canMoveUp,
  canMoveDown,
}: {
  value: string;
  isEditing: boolean;
  editValue: string;
  onEditValueChange: (value: string) => void;
  onStartEdit: () => void;
  onSave: () => void;
  onCancel: () => void;
  onDelete: () => void;
  /** Optional strength rank badge (1 = strongest) */
  rankLabel?: string;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  canMoveUp?: boolean;
  canMoveDown?: boolean;
}) {
  if (isEditing) {
    return (
      <div className="flex items-center gap-2 px-2 py-1.5 bg-[#1A2120]/40 border border-[#10B981]/30 rounded-lg text-xs">
        <Input
          value={editValue}
          onChange={(e) => onEditValueChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") onSave();
            if (e.key === "Escape") onCancel();
          }}
          autoFocus
          className="bg-[#1A2120] border-[rgba(255,255,255,0.06)] focus:border-[#10B981] text-[#F1F0EE] rounded-lg h-8 text-xs flex-1"
        />
        <button
          type="button"
          onClick={onSave}
          className="text-[#10B981] hover:text-[#34D399] transition-colors p-1"
          title="Save"
        >
          <Check className="size-3.5" />
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="text-[#8A8A98] hover:text-[#F1F0EE] transition-colors p-1"
          title="Cancel"
        >
          <X className="size-3.5" />
        </button>
      </div>
    );
  }

  return (
    <div className="flex justify-between items-center px-3 py-2 bg-[#1A2120]/40 border border-white/[0.02] rounded-lg text-xs gap-2">
      <div className="flex items-center gap-2 min-w-0">
        {rankLabel && (
          <span className="shrink-0 font-mono text-[10px] text-[#8FA89F] w-5 text-center">{rankLabel}</span>
        )}
        <span className="text-[#F1F0EE] font-medium truncate">{value}</span>
      </div>
      <div className="flex items-center gap-0.5 shrink-0">
        {(onMoveUp || onMoveDown) && (
          <>
            <button
              type="button"
              onClick={onMoveUp}
              disabled={!canMoveUp}
              className="text-[#8A8A98] hover:text-[#10B981] transition-colors p-1 disabled:opacity-30 disabled:pointer-events-none"
              title="Stronger (move up)"
            >
              <ChevronUp className="size-3.5" />
            </button>
            <button
              type="button"
              onClick={onMoveDown}
              disabled={!canMoveDown}
              className="text-[#8A8A98] hover:text-[#10B981] transition-colors p-1 disabled:opacity-30 disabled:pointer-events-none"
              title="Weaker (move down)"
            >
              <ChevronDown className="size-3.5" />
            </button>
          </>
        )}
        <button
          type="button"
          onClick={onStartEdit}
          className="text-[#8A8A98] hover:text-[#10B981] transition-colors p-1"
          title="Edit"
        >
          <Pencil className="size-3.5" />
        </button>
        <button
          type="button"
          onClick={onDelete}
          className="text-[#EF4444] hover:text-[#DC2626] transition-colors p-1"
          title="Delete"
        >
          <Trash2 className="size-3.5" />
        </button>
      </div>
    </div>
  );
}

function SettingsPage() {
  const store = useStore();
  const updateSettings = useStore((state) => state.updateSettings);
  const currentUser = useStore((state) => state.currentUser);
  const updateProfile = useStore((state) => state.updateProfile);

  const [appName, setAppName] = useState(store.appName);
  const [appLogoText, setAppLogoText] = useState(store.appLogoText);
  const [appLogoBase64, setAppLogoBase64] = useState<string | null>(store.appLogoBase64);
  const [currency, setCurrency] = useState(store.currency);
  const [timezone, setTimezone] = useState(resolveTimezone(store.timezone));
  const [skipCreditConsumption, setSkipCreditConsumption] = useState(store.skipCreditConsumption);
  const [locations, setLocations] = useState<string[]>(store.locations);
  const [deleteRequest, setDeleteRequest] = useState<ConfirmDeleteRequest | null>(null);

  useEffect(() => {
    setSkipCreditConsumption(store.skipCreditConsumption);
  }, [store.skipCreditConsumption]);

  useEffect(() => {
    setTimezone(resolveTimezone(store.timezone));
  }, [store.timezone]);

  useEffect(() => {
    setCurrency(store.currency);
  }, [store.currency]);
  const [cancellationLockHours, setCancellationLockHours] = useState(store.cancellationLockHours);
  const [debitTimingHours, setDebitTimingHours] = useState(store.debitTimingHours);
  const [adultDiscountPercent, setAdultDiscountPercent] = useState(store.adultDiscountPercent);
  const [adultDiscountAmount, setAdultDiscountAmount] = useState(store.adultDiscountAmount);
  const [adultDiscountMode, setAdultDiscountMode] = useState<"percent" | "amount">(
    store.adultDiscountMode === "amount" ? "amount" : "percent",
  );
  const [juniorDiscountPercent, setJuniorDiscountPercent] = useState(store.juniorDiscountPercent);
  const [juniorDiscountAmount, setJuniorDiscountAmount] = useState(store.juniorDiscountAmount);
  const [juniorDiscountMode, setJuniorDiscountMode] = useState<"percent" | "amount">(
    store.juniorDiscountMode === "amount" ? "amount" : "percent",
  );

  useEffect(() => {
    setCancellationLockHours(store.cancellationLockHours);
  }, [store.cancellationLockHours]);

  useEffect(() => {
    setDebitTimingHours(store.debitTimingHours);
  }, [store.debitTimingHours]);

  useEffect(() => {
    setAdultDiscountPercent(store.adultDiscountPercent);
    setAdultDiscountAmount(store.adultDiscountAmount);
    setAdultDiscountMode(store.adultDiscountMode === "amount" ? "amount" : "percent");
    setJuniorDiscountPercent(store.juniorDiscountPercent);
    setJuniorDiscountAmount(store.juniorDiscountAmount);
    setJuniorDiscountMode(store.juniorDiscountMode === "amount" ? "amount" : "percent");
  }, [
    store.adultDiscountPercent,
    store.adultDiscountAmount,
    store.adultDiscountMode,
    store.juniorDiscountPercent,
    store.juniorDiscountAmount,
    store.juniorDiscountMode,
  ]);
  const [adultGrades, setAdultGrades] = useState<string[]>(store.adultGrades);
  const [juniorGrades, setJuniorGrades] = useState<string[]>(store.juniorGrades);

  useEffect(() => {
    setAdultGrades(store.adultGrades);
  }, [store.adultGrades]);

  useEffect(() => {
    setJuniorGrades(store.juniorGrades);
  }, [store.juniorGrades]);
  const [holidays, setHolidays] = useState<string[]>(store.holidays);
  const [playerPositions, setPlayerPositions] = useState<string[]>(store.playerPositions);

  // States for SMTP Settings
  const [mailHost, setMailHost] = useState(store.mailHost || "");
  const [mailPort, setMailPort] = useState(store.mailPort || "");
  const [mailUsername, setMailUsername] = useState(store.mailUsername || "");
  const [mailPassword, setMailPassword] = useState(store.mailPassword || "");
  const [mailEncryption, setMailEncryption] = useState(store.mailEncryption || "tls");
  const [mailFromAddress, setMailFromAddress] = useState(store.mailFromAddress || "");
  const [mailFromName, setMailFromName] = useState(store.mailFromName || "");
  const [testingSmtp, setTestingSmtp] = useState(false);

  // Sync SMTP states when store syncs
  useEffect(() => {
    setMailHost(store.mailHost || "");
    setMailPort(store.mailPort || "");
    setMailUsername(store.mailUsername || "");
    setMailPassword(store.mailPassword || "");
    setMailEncryption(store.mailEncryption || "tls");
    setMailFromAddress(store.mailFromAddress || "");
    setMailFromName(store.mailFromName || "");
  }, [
    store.mailHost,
    store.mailPort,
    store.mailUsername,
    store.mailPassword,
    store.mailEncryption,
    store.mailFromAddress,
    store.mailFromName,
  ]);

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

  const [localTheme, setLocalTheme] = useState<"dark" | "light">(() => {
    if (typeof window !== "undefined") {
      return (localStorage.getItem("clubapp-theme") as "dark" | "light") || "dark";
    }
    return "dark";
  });

  const handleThemeChange = (mode: "dark" | "light") => {
    setLocalTheme(mode);
    localStorage.setItem("clubapp-theme", mode);
    if (mode === "light") {
      document.documentElement.classList.add("light");
    } else {
      document.documentElement.classList.remove("light");
    }
    window.dispatchEvent(new Event("clubapp-theme-changed"));
    toast.success(`Theme switched to ${mode} mode`);
  };

  const [localColorTheme, setLocalColorTheme] = useState<"emerald" | "sapphire" | "ruby" | "amber" | "amethyst" | "custom">(() => {
    if (typeof window !== "undefined") {
      return (localStorage.getItem("clubapp-color-theme") as any) || "sapphire";
    }
    return "sapphire";
  });

  const [customHex, setCustomHex] = useState<string>(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("clubapp-custom-hex") || "#10B981";
    }
    return "#10B981";
  });

  const [customSecHex, setCustomSecHex] = useState<string>(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("clubapp-custom-sec-hex") || "#2DD4BF";
    }
    return "#2DD4BF";
  });

  const handleCustomHexChange = (hex: string) => {
    setCustomHex(hex);
    localStorage.setItem("clubapp-custom-hex", hex);
    if (localColorTheme === "custom") {
      applyCustomTheme(hex, customSecHex, localTheme === "light");
      window.dispatchEvent(new Event("clubapp-color-theme-changed"));
    }
  };

  const handleCustomSecHexChange = (hex: string) => {
    setCustomSecHex(hex);
    localStorage.setItem("clubapp-custom-sec-hex", hex);
    if (localColorTheme === "custom") {
      applyCustomTheme(customHex, hex, localTheme === "light");
      window.dispatchEvent(new Event("clubapp-color-theme-changed"));
    }
  };

  const handleColorThemeChange = (color: "emerald" | "sapphire" | "ruby" | "amber" | "amethyst" | "custom") => {
    setLocalColorTheme(color);
    localStorage.setItem("clubapp-color-theme", color);
    
    document.documentElement.classList.forEach((cls) => {
      if (cls.startsWith("theme-")) {
        document.documentElement.classList.remove(cls);
      }
    });
    
    if (color === "custom") {
      document.documentElement.classList.add("theme-custom");
      applyCustomTheme(customHex, customSecHex, localTheme === "light");
    } else {
      const root = document.documentElement;
      root.style.removeProperty('--primary');
      root.style.removeProperty('--ring');
      root.style.removeProperty('--sidebar-primary');
      root.style.removeProperty('--sidebar-ring');
      root.style.removeProperty('--violet');
      root.style.removeProperty('--input-border-focus');
      root.style.removeProperty('--accent-foreground');
      root.style.removeProperty('--success-text');
      root.style.removeProperty('--success-color');
      root.style.removeProperty('--border-accent');
      root.style.removeProperty('--violet-dim');
      root.style.removeProperty('--bg-glass');
      root.style.removeProperty('--gold');
      root.style.removeProperty('--gold-dim');
      root.style.removeProperty('--success-bg');
      root.style.removeProperty('--success-border');
      
      if (color !== "sapphire") {
        document.documentElement.classList.add(`theme-${color}`);
      }
    }
    
    window.dispatchEvent(new Event("clubapp-color-theme-changed"));
    toast.success(`Color Theme switched to ${color}`);
  };

  useEffect(() => {
    const syncColorTheme = () => {
      const color = (localStorage.getItem("clubapp-color-theme") as any) || "sapphire";
      setLocalColorTheme(color);
      const hex = localStorage.getItem("clubapp-custom-hex") || "#10B981";
      setCustomHex(hex);
      const secHex = localStorage.getItem("clubapp-custom-sec-hex") || "#2DD4BF";
      setCustomSecHex(secHex);
    };
    window.addEventListener("clubapp-color-theme-changed", syncColorTheme);
    return () => window.removeEventListener("clubapp-color-theme-changed", syncColorTheme);
  }, []);

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
  const [newAdultGrade, setNewAdultGrade] = useState("");
  const [newJuniorGrade, setNewJuniorGrade] = useState("");
  const [newHoliday, setNewHoliday] = useState("");
  const [newPlayerPosition, setNewPlayerPosition] = useState("");
  const [editingList, setEditingList] = useState<EditableListKey | null>(null);
  const [editingOriginal, setEditingOriginal] = useState("");
  const [editingValue, setEditingValue] = useState("");

  const startEditing = (list: EditableListKey, value: string) => {
    setEditingList(list);
    setEditingOriginal(value);
    setEditingValue(value);
  };

  const cancelEditing = () => {
    setEditingList(null);
    setEditingOriginal("");
    setEditingValue("");
  };

  const renameListItem = async (
    list: EditableListKey,
    items: string[],
    setItems: (items: string[]) => void,
    successLabel: string,
  ) => {
    const trimmed = editingValue.trim();
    if (!trimmed) {
      toast.error("Name cannot be empty");
      return;
    }
    if (trimmed === editingOriginal) {
      cancelEditing();
      return;
    }
    if (items.includes(trimmed)) {
      toast.error(`${successLabel} already exists`);
      return;
    }
    const updated = items.map((item) => (item === editingOriginal ? trimmed : item));
    setItems(updated);
    cancelEditing();
    const payload =
      list === "locations"
        ? { locations: updated }
        : list === "adultGrades"
          ? { adultGrades: updated }
          : list === "juniorGrades"
            ? { juniorGrades: updated }
            : { playerPositions: updated };
    await saveUpdatedList(payload, `${successLabel} updated`);
  };

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

  const handleSaveMailSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await updateSettings({
        mailHost,
        mailPort,
        mailUsername,
        mailPassword,
        mailEncryption,
        mailFromAddress,
        mailFromName,
      });
      toast.success("SMTP settings saved successfully");
    } catch (err: any) {
      toast.error(err.message || "Failed to save SMTP settings");
    }
  };

  const handleTestSmtp = async (e: React.MouseEvent) => {
    e.preventDefault();
    if (!mailHost || !mailPort || !mailFromAddress || !mailFromName) {
      toast.error("Please fill in SMTP Host, Port, From Name, and From Address first.");
      return;
    }

    const testEmail = window.prompt(
      "Enter the recipient email address for the SMTP test:",
      currentUser?.email || "admin@club.com"
    );
    if (testEmail === null) {
      return;
    }
    if (!testEmail || !testEmail.includes("@")) {
      toast.error("Please enter a valid email address.");
      return;
    }

    setTestingSmtp(true);
    try {
      const res = await store.testSmtp({
        mailHost,
        mailPort,
        mailUsername,
        mailPassword,
        mailEncryption,
        mailFromAddress,
        mailFromName,
        testEmail,
      });
      if (res.status === "success") {
        toast.success(res.message);
      } else {
        toast.error(res.message || "Failed to connect to SMTP server");
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to test SMTP connection. Check configuration details.");
    } finally {
      setTestingSmtp(false);
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
        timezone,
        skipCreditConsumption,
        cancellationLockHours,
        debitTimingHours,
      });
      toast.success("Branding settings saved successfully");
    } catch (err: any) {
      toast.error(err.message || "Failed to save branding");
    }
  };

  const handleSaveDiscounts = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await updateSettings({
        adultDiscountMode,
        adultDiscountPercent: adultDiscountMode === "percent" ? Number(adultDiscountPercent) || 0 : 0,
        adultDiscountAmount: adultDiscountMode === "amount" ? Number(adultDiscountAmount) || 0 : 0,
        juniorDiscountMode,
        juniorDiscountPercent: juniorDiscountMode === "percent" ? Number(juniorDiscountPercent) || 0 : 0,
        juniorDiscountAmount: juniorDiscountMode === "amount" ? Number(juniorDiscountAmount) || 0 : 0,
      });
      toast.success("Discount settings saved successfully");
    } catch (err: any) {
      toast.error(err.message || "Failed to save discounts");
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
    const scheduleCount = store.schedules.filter((sch) => sch.location === loc).length;
    const trainingCount = store.trainings.filter((t) => t.location === loc).length;
    setDeleteRequest({
      title: "Delete location",
      entityName: loc,
      related: [
        { label: scheduleCount === 1 ? "schedule" : "schedules", count: scheduleCount },
        { label: trainingCount === 1 ? "training" : "trainings", count: trainingCount },
      ],
      warning:
        scheduleCount > 0 || trainingCount > 0
          ? "This location is protected by a foreign key (restrict). Reassign or delete related schedules/trainings first, or deletion may fail."
          : undefined,
      onConfirm: async () => {
        if (scheduleCount > 0 || trainingCount > 0) {
          toast.error("Cannot delete location while schedules or trainings still use it.");
          throw new Error("Location in use");
        }
        const updated = locations.filter((l) => l !== loc);
        setLocations(updated);
        saveUpdatedList({ locations: updated }, "Location removed");
      },
    });
  };

  const handleAddAdultGrade = () => {
    const trimmed = newAdultGrade.trim();
    if (!trimmed) return;
    if (adultGrades.includes(trimmed)) {
      toast.error("Grade already exists in Adult Grades");
      return;
    }
    const updated = [...adultGrades, trimmed];
    setAdultGrades(updated);
    setNewAdultGrade("");
    saveUpdatedList({ adultGrades: updated }, "Adult grade added");
  };

  const handleDeleteAdultGrade = (g: string) => {
    const memberCount = store.members.filter(
      (m) => m.grade === g && m.memberType.toLowerCase() === "adult",
    ).length;
    setDeleteRequest({
      title: "Delete adult grade",
      entityName: g,
      related: [{ label: memberCount === 1 ? "member" : "members", count: memberCount }],
      warning:
        memberCount > 0
          ? "Grades are protected by a foreign key (restrict). Reassign members first, or deletion may fail."
          : undefined,
      onConfirm: async () => {
        if (memberCount > 0) {
          toast.error("Cannot delete grade while members still use it.");
          throw new Error("Grade in use");
        }
        const updated = adultGrades.filter((x) => x !== g);
        setAdultGrades(updated);
        saveUpdatedList({ adultGrades: updated }, "Adult grade removed");
      },
    });
  };

  const handleAddJuniorGrade = () => {
    const trimmed = newJuniorGrade.trim();
    if (!trimmed) return;
    if (juniorGrades.includes(trimmed)) {
      toast.error("Grade already exists in Junior Grades");
      return;
    }
    const updated = [...juniorGrades, trimmed];
    setJuniorGrades(updated);
    setNewJuniorGrade("");
    saveUpdatedList({ juniorGrades: updated }, "Junior grade added");
  };

  const moveGrade = (
    list: "adultGrades" | "juniorGrades",
    items: string[],
    setItems: (items: string[]) => void,
    index: number,
    direction: -1 | 1,
  ) => {
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= items.length) return;
    const updated = [...items];
    const tmp = updated[index];
    updated[index] = updated[nextIndex];
    updated[nextIndex] = tmp;
    setItems(updated);
    const payload = list === "adultGrades" ? { adultGrades: updated } : { juniorGrades: updated };
    void saveUpdatedList(payload, "Grade strength order updated");
  };

  const handleDeleteJuniorGrade = (g: string) => {
    const memberCount = store.members.filter(
      (m) => m.grade === g && m.memberType.toLowerCase() === "junior",
    ).length;
    setDeleteRequest({
      title: "Delete junior grade",
      entityName: g,
      related: [{ label: memberCount === 1 ? "member" : "members", count: memberCount }],
      warning:
        memberCount > 0
          ? "Grades are protected by a foreign key (restrict). Reassign members first, or deletion may fail."
          : undefined,
      onConfirm: async () => {
        if (memberCount > 0) {
          toast.error("Cannot delete grade while members still use it.");
          throw new Error("Grade in use");
        }
        const updated = juniorGrades.filter((x) => x !== g);
        setJuniorGrades(updated);
        saveUpdatedList({ juniorGrades: updated }, "Junior grade removed");
      },
    });
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

  const handleAddPlayerPosition = () => {
    const trimmed = newPlayerPosition.trim();
    if (!trimmed) return;
    if (playerPositions.includes(trimmed)) {
      toast.error("Position already exists");
      return;
    }
    const updated = [...playerPositions, trimmed];
    setPlayerPositions(updated);
    setNewPlayerPosition("");
    saveUpdatedList({ playerPositions: updated }, "Player position added");
  };

  const handleDeletePlayerPosition = (pos: string) => {
    const usageCount = (store.leagueGroups ?? []).filter((g) =>
      Object.values(g.memberPositions ?? {}).includes(pos),
    ).length;
    setDeleteRequest({
      title: "Delete player position",
      entityName: pos,
      related: [{ label: usageCount === 1 ? "league group" : "league groups", count: usageCount }],
      warning:
        usageCount > 0
          ? "Positions are protected by a foreign key (restrict). Clear this position from league members first."
          : undefined,
      onConfirm: async () => {
        if (usageCount > 0) {
          toast.error("Cannot delete position while league groups still use it.");
          throw new Error("Position in use");
        }
        const updated = playerPositions.filter((x) => x !== pos);
        setPlayerPositions(updated);
        saveUpdatedList({ playerPositions: updated }, "Player position removed");
      },
    });
  };

  const saveUpdatedList = async (
    payload: {
      locations?: string[];
      adultGrades?: string[];
      juniorGrades?: string[];
      holidays?: string[];
      playerPositions?: string[];
    },
    successMsg: string
  ) => {
    try {
      await updateSettings(payload);
      toast.success(successMsg);
    } catch (err: any) {
      toast.error(err.message || "Failed to update configuration list");
      // Revert states from store
      setLocations(store.locations);
      setAdultGrades(store.adultGrades);
      setJuniorGrades(store.juniorGrades);
      setHolidays(store.holidays);
      setPlayerPositions(store.playerPositions);
    }
  };

  return (
    <div className="space-y-6 pb-10">
      <ConfirmDeleteDialog
        request={deleteRequest}
        onOpenChange={(open) => !open && setDeleteRequest(null)}
      />
      <PageHeader
        title="Settings"
        description={
          currentUser?.role === "admin"
            ? "Configure your software branding, court locations, member grades, and official club holidays."
            : "Manage your profile details, credentials, and app theme preferences."
        }
      />

      <div className="grid md:grid-cols-2 gap-6">
        {/* Branding Configurations */}
        {currentUser?.role === "admin" && (
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
                      placeholder="Connect App"
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

                <div className="space-y-1.5">
                  <Label className="text-[10px] font-medium tracking-[0.1em] text-[#8A8A98] uppercase">
                    Clock Timezone
                  </Label>
                  <Select value={timezone} onValueChange={setTimezone}>
                    <SelectTrigger className="bg-[#1A2120] border-[rgba(255,255,255,0.06)] text-[#F1F0EE] h-9 rounded-lg cursor-pointer">
                      <SelectValue placeholder="Select timezone" />
                    </SelectTrigger>
                    <SelectContent className="bg-[#1A2120] border-[rgba(255,255,255,0.10)] text-[#F1F0EE] max-h-72">
                      {TIMEZONE_OPTIONS.map((tz) => (
                        <SelectItem
                          key={tz.value}
                          value={tz.value}
                          className="cursor-pointer hover:bg-white/5"
                        >
                          {tz.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-[11px] text-[#8A8A98]">
                    Controls the live clock in the top-right corner.
                  </p>
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
                      className="bg-[#1A2120] border-[rgba(255,255,255,0.06)] focus:border-[#10B981] text-[#F1F0EE] rounded-lg cursor-pointer file:bg-primary file:text-primary-foreground file:border-none file:rounded-md file:px-2 file:py-1 file:mr-2 file:text-xs"
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

                <div className="grid sm:grid-cols-2 gap-4 border-t border-white/[0.03] pt-4 mt-4">
                  <div className="space-y-1.5">
                    <Label className="text-[10px] font-medium tracking-[0.1em] text-[#8A8A98] uppercase">
                      Cancellation Lock Window (Hours)
                    </Label>
                    <Input
                      type="number"
                      min={0}
                      value={cancellationLockHours}
                      onChange={(e) => setCancellationLockHours(Number(e.target.value))}
                      className="bg-[#1A2120] border-[rgba(255,255,255,0.06)] focus:border-[#10B981] text-[#F1F0EE] rounded-lg"
                    />
                    <p className="text-[10px] text-muted-foreground/60 font-light">
                      Hours before the match starts when users are blocked from cancelling accepted invitations.
                    </p>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-[10px] font-medium tracking-[0.1em] text-[#8A8A98] uppercase">
                      Auto-Debit Timing (Hours)
                    </Label>
                    <Input
                      type="number"
                      min={0}
                      value={debitTimingHours}
                      onChange={(e) => setDebitTimingHours(Number(e.target.value))}
                      className="bg-[#1A2120] border-[rgba(255,255,255,0.06)] focus:border-[#10B981] text-[#F1F0EE] rounded-lg"
                    />
                    <p className="text-[10px] text-muted-foreground/60 font-light">
                      Hours before the match starts when accepted users are automatically debited.
                    </p>
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
        )}

        {/* Member Discounts */}
        {currentUser?.role === "admin" && (
          <Card className="bg-[#131916] border-[rgba(255,255,255,0.06)] signature-card-top md:col-span-2">
            <CardHeader className="pb-3 border-b border-white/[0.03]">
              <CardTitle className="text-[12px] font-medium tracking-[0.12em] text-[#34D399] uppercase">
                Member Discounts
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-6">
              <form onSubmit={handleSaveDiscounts} className="space-y-6">
                <p className="text-xs text-muted-foreground font-light">
                  Choose percentage or fixed amount for each member type — only one applies.
                  Only members with &quot;Apply Discount&quot; enabled receive these rates on play and
                  training fees.
                </p>
                <div className="grid sm:grid-cols-2 gap-6">
                  <div className="space-y-4 rounded-lg border border-[rgba(255,255,255,0.06)] bg-[#1A2120]/40 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <h3 className="text-[11px] font-medium tracking-[0.12em] text-[#34D399] uppercase">Adult</h3>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] uppercase tracking-wider text-[#8A8A98]">%</span>
                        <Switch
                          checked={adultDiscountMode === "amount"}
                          onCheckedChange={(checked) =>
                            setAdultDiscountMode(checked ? "amount" : "percent")
                          }
                          aria-label="Adult discount type"
                        />
                        <span className="text-[10px] uppercase tracking-wider text-[#8A8A98]">Amount</span>
                      </div>
                    </div>
                    {adultDiscountMode === "percent" ? (
                      <div className="space-y-1.5">
                        <Label className="text-[10px] font-medium tracking-[0.1em] text-[#8A8A98] uppercase">
                          Discount %
                        </Label>
                        <Input
                          type="number"
                          min={0}
                          max={100}
                          step={0.01}
                          value={adultDiscountPercent}
                          onChange={(e) => setAdultDiscountPercent(Number(e.target.value))}
                          className="bg-[#1A2120] border-[rgba(255,255,255,0.06)] focus:border-[#10B981] text-[#F1F0EE] rounded-lg font-mono"
                        />
                      </div>
                    ) : (
                      <div className="space-y-1.5">
                        <Label className="text-[10px] font-medium tracking-[0.1em] text-[#8A8A98] uppercase">
                          Discount Amount
                        </Label>
                        <Input
                          type="number"
                          min={0}
                          step={0.01}
                          value={adultDiscountAmount}
                          onChange={(e) => setAdultDiscountAmount(Number(e.target.value))}
                          className="bg-[#1A2120] border-[rgba(255,255,255,0.06)] focus:border-[#10B981] text-[#F1F0EE] rounded-lg font-mono"
                        />
                      </div>
                    )}
                  </div>
                  <div className="space-y-4 rounded-lg border border-[rgba(255,255,255,0.06)] bg-[#1A2120]/40 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <h3 className="text-[11px] font-medium tracking-[0.12em] text-[#818CF8] uppercase">Junior</h3>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] uppercase tracking-wider text-[#8A8A98]">%</span>
                        <Switch
                          checked={juniorDiscountMode === "amount"}
                          onCheckedChange={(checked) =>
                            setJuniorDiscountMode(checked ? "amount" : "percent")
                          }
                          aria-label="Junior discount type"
                        />
                        <span className="text-[10px] uppercase tracking-wider text-[#8A8A98]">Amount</span>
                      </div>
                    </div>
                    {juniorDiscountMode === "percent" ? (
                      <div className="space-y-1.5">
                        <Label className="text-[10px] font-medium tracking-[0.1em] text-[#8A8A98] uppercase">
                          Discount %
                        </Label>
                        <Input
                          type="number"
                          min={0}
                          max={100}
                          step={0.01}
                          value={juniorDiscountPercent}
                          onChange={(e) => setJuniorDiscountPercent(Number(e.target.value))}
                          className="bg-[#1A2120] border-[rgba(255,255,255,0.06)] focus:border-[#818CF8] text-[#F1F0EE] rounded-lg font-mono"
                        />
                      </div>
                    ) : (
                      <div className="space-y-1.5">
                        <Label className="text-[10px] font-medium tracking-[0.1em] text-[#8A8A98] uppercase">
                          Discount Amount
                        </Label>
                        <Input
                          type="number"
                          min={0}
                          step={0.01}
                          value={juniorDiscountAmount}
                          onChange={(e) => setJuniorDiscountAmount(Number(e.target.value))}
                          className="bg-[#1A2120] border-[rgba(255,255,255,0.06)] focus:border-[#818CF8] text-[#F1F0EE] rounded-lg font-mono"
                        />
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex justify-end pt-2">
                  <Button type="submit" className="btn-premium-solid h-9 px-4 font-semibold text-xs cursor-pointer">
                    Save Discounts
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        )}

        {/* Credentials & Profile */}
        <Card className="bg-[#131916] border-[rgba(255,255,255,0.06)] signature-card-top md:col-span-2">
          <CardHeader className="pb-3 border-b border-white/[0.03]">
            <CardTitle className="text-[12px] font-medium tracking-[0.12em] text-[#34D399] uppercase">
              {currentUser?.role === "admin" ? "Admin Credentials & Profile" : "Profile Details & Credentials"}
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

        {/* Theme Preference */}
        <Card className="bg-[#131916] border-[rgba(255,255,255,0.06)] signature-card-top md:col-span-2">
          <CardHeader className="pb-3 border-b border-white/[0.03]">
            <CardTitle className="text-[12px] font-medium tracking-[0.12em] text-[#34D399] uppercase">
              Theme Preference
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-6">
            <div className="space-y-6">
              {/* Theme Mode */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-white/[0.03]">
                <div>
                  <Label className="text-sm font-semibold text-[#EEF2F0] capitalize">App Theme Mode</Label>
                  <p className="text-xs text-muted-foreground mt-1 font-light">Select your preferred color layout theme for the portal.</p>
                </div>
                <Select value={localTheme} onValueChange={(v) => handleThemeChange(v as "dark" | "light")}>
                  <SelectTrigger className="w-full sm:w-[180px] bg-[#1A2120] border-[rgba(255,255,255,0.06)] text-[#F1F0EE] h-10 rounded-lg cursor-pointer text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-[#1A2120] border-[rgba(255,255,255,0.10)] text-[#F1F0EE]">
                    <SelectItem value="dark" className="cursor-pointer hover:bg-white/5 text-xs">Dark Mode</SelectItem>
                    <SelectItem value="light" className="cursor-pointer hover:bg-white/5 text-xs">Light Mode</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Color Scheme Preset */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <Label className="text-sm font-semibold text-[#EEF2F0] capitalize">Brand Color Theme</Label>
                  <p className="text-xs text-muted-foreground mt-1 font-light">Select your preferred branding colors for accents, buttons, and badges.</p>
                </div>
                <Select value={localColorTheme} onValueChange={(v) => handleColorThemeChange(v as any)}>
                  <SelectTrigger className="w-full sm:w-[180px] bg-[#1A2120] border-[rgba(255,255,255,0.06)] text-[#F1F0EE] h-10 rounded-lg cursor-pointer text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-[#1A2120] border-[rgba(255,255,255,0.10)] text-[#F1F0EE]">
                    <SelectItem value="emerald" className="cursor-pointer hover:bg-white/5 text-xs">Emerald Green</SelectItem>
                    <SelectItem value="sapphire" className="cursor-pointer hover:bg-white/5 text-xs">Sapphire Blue (Default)</SelectItem>
                    <SelectItem value="ruby" className="cursor-pointer hover:bg-white/5 text-xs">Ruby Crimson</SelectItem>
                    <SelectItem value="amber" className="cursor-pointer hover:bg-white/5 text-xs">Amber Gold</SelectItem>
                    <SelectItem value="amethyst" className="cursor-pointer hover:bg-white/5 text-xs">Amethyst Purple</SelectItem>
                    <SelectItem value="custom" className="cursor-pointer hover:bg-white/5 text-xs">Custom Theme Color</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Custom Color Pickers (conditional) */}
              {localColorTheme === "custom" && (
                <div className="space-y-4 pt-4 border-t border-white/[0.03] animate-in fade-in-50 duration-200">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div>
                      <Label className="text-sm font-semibold text-[#EEF2F0] capitalize">Select Primary Accent Color</Label>
                      <p className="text-xs text-muted-foreground mt-1 font-light">Pick a custom primary brand color for your portal interface.</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-xs font-mono text-muted-foreground uppercase">{customHex}</span>
                      <input
                        type="color"
                        value={customHex}
                        onChange={(e) => handleCustomHexChange(e.target.value)}
                        className="size-10 rounded-lg cursor-pointer bg-transparent border-0 p-0 [&::-webkit-color-swatch-wrapper]:p-0 [&::-webkit-color-swatch]:rounded-lg [&::-webkit-color-swatch]:border-border"
                      />
                    </div>
                  </div>

                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-4 border-t border-white/[0.03]">
                    <div>
                      <Label className="text-sm font-semibold text-[#EEF2F0] capitalize">Select Secondary Accent Color</Label>
                      <p className="text-xs text-muted-foreground mt-1 font-light">Pick a custom secondary color (for credits, positive amounts, and badges).</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-xs font-mono text-muted-foreground uppercase">{customSecHex}</span>
                      <input
                        type="color"
                        value={customSecHex}
                        onChange={(e) => handleCustomSecHexChange(e.target.value)}
                        className="size-10 rounded-lg cursor-pointer bg-transparent border-0 p-0 [&::-webkit-color-swatch-wrapper]:p-0 [&::-webkit-color-swatch]:rounded-lg [&::-webkit-color-swatch]:border-border"
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Email SMTP Configuration */}
        {currentUser?.role === "admin" && (
          <>
            <Card className="bg-[#131916] border-[rgba(255,255,255,0.06)] signature-card-top md:col-span-2">
              <CardHeader className="pb-3 border-b border-white/[0.03]">
                <CardTitle className="text-[12px] font-medium tracking-[0.12em] text-[#34D399] uppercase flex items-center gap-1.5">
                  Email SMTP Configuration
                  <span title="Configures outgoing email settings. Recommended host for Google SMTP is smtp.gmail.com with port 587 and TLS.">
                    <HelpCircle className="size-3.5 text-muted-foreground/60 cursor-pointer" />
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-6">
                <form onSubmit={handleSaveMailSettings} className="space-y-4">
                  <div className="grid sm:grid-cols-3 gap-4">
                    <div className="space-y-1.5">
                      <Label className="text-[10px] font-medium tracking-[0.1em] text-[#8A8A98] uppercase">
                        SMTP Host
                      </Label>
                      <Input
                        value={mailHost}
                        onChange={(e) => setMailHost(e.target.value)}
                        placeholder="smtp.gmail.com"
                        className="bg-[#1A2120] border-[rgba(255,255,255,0.06)] focus:border-[#10B981] text-[#F1F0EE] rounded-lg h-9 text-xs"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-[10px] font-medium tracking-[0.1em] text-[#8A8A98] uppercase">
                        SMTP Port
                      </Label>
                      <Input
                        value={mailPort}
                        onChange={(e) => setMailPort(e.target.value)}
                        placeholder="587"
                        className="bg-[#1A2120] border-[rgba(255,255,255,0.06)] focus:border-[#10B981] text-[#F1F0EE] rounded-lg h-9 text-xs"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-[10px] font-medium tracking-[0.1em] text-[#8A8A98] uppercase">
                        Encryption
                      </Label>
                      <Select value={mailEncryption} onValueChange={setMailEncryption}>
                        <SelectTrigger className="bg-[#1A2120] border-[rgba(255,255,255,0.06)] text-[#F1F0EE] h-9 rounded-lg cursor-pointer text-xs">
                          <SelectValue placeholder="Select Encryption" />
                        </SelectTrigger>
                        <SelectContent className="bg-[#1A2120] border-[rgba(255,255,255,0.10)] text-[#F1F0EE]">
                          <SelectItem value="tls" className="cursor-pointer hover:bg-white/5">TLS</SelectItem>
                          <SelectItem value="ssl" className="cursor-pointer hover:bg-white/5">SSL</SelectItem>
                          <SelectItem value="none" className="cursor-pointer hover:bg-white/5">None</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-[10px] font-medium tracking-[0.1em] text-[#8A8A98] uppercase">
                        SMTP Username / Email
                      </Label>
                      <Input
                        value={mailUsername}
                        onChange={(e) => setMailUsername(e.target.value)}
                        placeholder="your_email@gmail.com"
                        className="bg-[#1A2120] border-[rgba(255,255,255,0.06)] focus:border-[#10B981] text-[#F1F0EE] rounded-lg h-9 text-xs"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-[10px] font-medium tracking-[0.1em] text-[#8A8A98] uppercase">
                        SMTP Password
                      </Label>
                      <Input
                        type="password"
                        value={mailPassword}
                        onChange={(e) => setMailPassword(e.target.value)}
                        placeholder="••••••••••••••••"
                        className="bg-[#1A2120] border-[rgba(255,255,255,0.06)] focus:border-[#10B981] text-[#F1F0EE] rounded-lg h-9 text-xs"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-[10px] font-medium tracking-[0.1em] text-[#8A8A98] uppercase">
                        From Name
                      </Label>
                      <Input
                        value={mailFromName}
                        onChange={(e) => setMailFromName(e.target.value)}
                        placeholder="ClubConnect"
                        className="bg-[#1A2120] border-[rgba(255,255,255,0.06)] focus:border-[#10B981] text-[#F1F0EE] rounded-lg h-9 text-xs"
                      />
                    </div>
                    <div className="space-y-1.5 sm:col-span-3">
                      <Label className="text-[10px] font-medium tracking-[0.1em] text-[#8A8A98] uppercase">
                        From Address
                      </Label>
                      <Input
                        type="email"
                        value={mailFromAddress}
                        onChange={(e) => setMailFromAddress(e.target.value)}
                        placeholder="no-reply@clubconnect.com"
                        className="bg-[#1A2120] border-[rgba(255,255,255,0.06)] focus:border-[#10B981] text-[#F1F0EE] rounded-lg h-9 text-xs"
                      />
                    </div>
                  </div>

                  <div className="text-[11px] text-muted-foreground/60 leading-relaxed font-light mt-2 bg-[#1A2120]/40 p-3 rounded-lg border border-white/[0.02]">
                    <strong className="text-[#34D399] font-medium">Google SMTP Setup Tip:</strong> Use <code className="bg-white/5 px-1 py-0.5 rounded font-mono text-[10px]">smtp.gmail.com</code> with port <code className="bg-white/5 px-1 py-0.5 rounded font-mono text-[10px]">587</code> and encryption <code className="bg-white/5 px-1 py-0.5 rounded font-mono text-[10px]">TLS</code>. You must create an <strong>App Password</strong> in your Google Account settings; entering your normal Gmail password will result in a connection failure. Leave the host blank to disable SMTP and fallback to application log capture.
                  </div>

                  <div className="flex justify-end gap-3 pt-2">
                    <Button
                      type="button"
                      onClick={handleTestSmtp}
                      disabled={testingSmtp}
                      className="btn-premium-outline h-9 px-4 font-semibold text-xs cursor-pointer disabled:opacity-50"
                    >
                      {testingSmtp ? "Testing..." : "Test Connection"}
                    </Button>
                    <Button type="submit" className="btn-premium-solid h-9 px-4 font-semibold text-xs cursor-pointer">
                      Save SMTP Settings
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
                      <EditableConfigRow
                        key={loc}
                        value={loc}
                        isEditing={editingList === "locations" && editingOriginal === loc}
                        editValue={editingValue}
                        onEditValueChange={setEditingValue}
                        onStartEdit={() => startEditing("locations", loc)}
                        onSave={() => renameListItem("locations", locations, setLocations, "Location")}
                        onCancel={cancelEditing}
                        onDelete={() => handleDeleteLocation(loc)}
                      />
                    ))
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Adult Grades Manager */}
            <Card className="bg-[#131916] border-[rgba(255,255,255,0.06)] signature-card-top flex flex-col">
              <CardHeader className="pb-3 border-b border-white/[0.03]">
                <CardTitle className="text-[12px] font-medium tracking-[0.12em] text-[#34D399] uppercase flex items-center justify-between">
                  <span>Adult Grades</span>
                  <span className="text-[10px] text-muted-foreground font-normal">For Adult Members</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-4 flex-1 flex flex-col">
                <p className="text-[11px] text-[#8FA89F] mb-3 leading-relaxed">
                  Order from strongest (top, rank 1) to weakest. Court rotation groups similar grades together.
                </p>
                <div className="flex gap-2 mb-4">
                  <Input
                    value={newAdultGrade}
                    onChange={(e) => setNewAdultGrade(e.target.value)}
                    placeholder="Add adult grade (e.g. A)"
                    onKeyDown={(e) => e.key === "Enter" && handleAddAdultGrade()}
                    className="bg-[#1A2120] border-[rgba(255,255,255,0.06)] focus:border-[#10B981] text-[#F1F0EE] rounded-lg h-9 text-xs"
                  />
                  <Button
                    type="button"
                    onClick={handleAddAdultGrade}
                    className="h-9 px-3 bg-[#10B981] hover:bg-[#059669] text-white rounded-lg cursor-pointer shrink-0"
                  >
                    <Plus className="size-4" />
                  </Button>
                </div>
                <div className="flex-1 overflow-y-auto max-h-[220px] pr-1 space-y-1">
                  {adultGrades.length === 0 ? (
                    <div className="text-center py-6 text-xs text-muted-foreground/60">No adult grades configured.</div>
                  ) : (
                    adultGrades.map((g, index) => (
                      <EditableConfigRow
                        key={g}
                        value={g}
                        rankLabel={`${index + 1}`}
                        isEditing={editingList === "adultGrades" && editingOriginal === g}
                        editValue={editingValue}
                        onEditValueChange={setEditingValue}
                        onStartEdit={() => startEditing("adultGrades", g)}
                        onSave={() => renameListItem("adultGrades", adultGrades, setAdultGrades, "Adult Grade")}
                        onCancel={cancelEditing}
                        onDelete={() => handleDeleteAdultGrade(g)}
                        canMoveUp={index > 0}
                        canMoveDown={index < adultGrades.length - 1}
                        onMoveUp={() => moveGrade("adultGrades", adultGrades, setAdultGrades, index, -1)}
                        onMoveDown={() => moveGrade("adultGrades", adultGrades, setAdultGrades, index, 1)}
                      />
                    ))
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Junior Grades Manager */}
            <Card className="bg-[#131916] border-[rgba(255,255,255,0.06)] signature-card-top flex flex-col">
              <CardHeader className="pb-3 border-b border-white/[0.03]">
                <CardTitle className="text-[12px] font-medium tracking-[0.12em] text-[#818CF8] uppercase flex items-center justify-between">
                  <span>Junior Grades</span>
                  <span className="text-[10px] text-muted-foreground font-normal">For Junior Members</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-4 flex-1 flex flex-col">
                <p className="text-[11px] text-[#8FA89F] mb-3 leading-relaxed">
                  Order from strongest (top, rank 1) to weakest. Used when you need grade strength for juniors.
                </p>
                <div className="flex gap-2 mb-4">
                  <Input
                    value={newJuniorGrade}
                    onChange={(e) => setNewJuniorGrade(e.target.value)}
                    placeholder="Add junior grade (e.g. Beginner)"
                    onKeyDown={(e) => e.key === "Enter" && handleAddJuniorGrade()}
                    className="bg-[#1A2120] border-[rgba(255,255,255,0.06)] focus:border-[#818CF8] text-[#F1F0EE] rounded-lg h-9 text-xs"
                  />
                  <Button
                    type="button"
                    onClick={handleAddJuniorGrade}
                    className="h-9 px-3 bg-[#818CF8] hover:bg-[#6366F1] text-white rounded-lg cursor-pointer shrink-0"
                  >
                    <Plus className="size-4" />
                  </Button>
                </div>
                <div className="flex-1 overflow-y-auto max-h-[220px] pr-1 space-y-1">
                  {juniorGrades.length === 0 ? (
                    <div className="text-center py-6 text-xs text-muted-foreground/60">No junior grades configured.</div>
                  ) : (
                    juniorGrades.map((g, index) => (
                      <EditableConfigRow
                        key={g}
                        value={g}
                        rankLabel={`${index + 1}`}
                        isEditing={editingList === "juniorGrades" && editingOriginal === g}
                        editValue={editingValue}
                        onEditValueChange={setEditingValue}
                        onStartEdit={() => startEditing("juniorGrades", g)}
                        onSave={() => renameListItem("juniorGrades", juniorGrades, setJuniorGrades, "Junior Grade")}
                        onCancel={cancelEditing}
                        onDelete={() => handleDeleteJuniorGrade(g)}
                        canMoveUp={index > 0}
                        canMoveDown={index < juniorGrades.length - 1}
                        onMoveUp={() => moveGrade("juniorGrades", juniorGrades, setJuniorGrades, index, -1)}
                        onMoveDown={() => moveGrade("juniorGrades", juniorGrades, setJuniorGrades, index, 1)}
                      />
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

            {/* Player Positions Manager */}
            <Card className="bg-[#131916] border-[rgba(255,255,255,0.06)] signature-card-top flex flex-col">
              <CardHeader className="pb-3 border-b border-white/[0.03]">
                <CardTitle className="text-[12px] font-medium tracking-[0.12em] text-[#34D399] uppercase">
                  Player Positions / Roles
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-4 flex-1 flex flex-col">
                <div className="flex gap-2 mb-4">
                  <Input
                    value={newPlayerPosition}
                    onChange={(e) => setNewPlayerPosition(e.target.value)}
                    placeholder="Add new position (e.g. Singles, Doubles)"
                    onKeyDown={(e) => e.key === "Enter" && handleAddPlayerPosition()}
                    className="bg-[#1A2120] border-[rgba(255,255,255,0.06)] focus:border-[#10B981] text-[#F1F0EE] rounded-lg h-9 text-xs"
                  />
                  <Button
                    type="button"
                    onClick={handleAddPlayerPosition}
                    className="h-9 px-3 bg-[#10B981] hover:bg-[#059669] text-white rounded-lg cursor-pointer shrink-0"
                  >
                    <Plus className="size-4" />
                  </Button>
                </div>
                <div className="flex-1 overflow-y-auto max-h-[220px] pr-1 space-y-1">
                  {playerPositions.length === 0 ? (
                    <div className="text-center py-6 text-xs text-muted-foreground/60">No player positions configured.</div>
                  ) : (
                    playerPositions.map((pos) => (
                      <EditableConfigRow
                        key={pos}
                        value={pos}
                        isEditing={editingList === "playerPositions" && editingOriginal === pos}
                        editValue={editingValue}
                        onEditValueChange={setEditingValue}
                        onStartEdit={() => startEditing("playerPositions", pos)}
                        onSave={() => renameListItem("playerPositions", playerPositions, setPlayerPositions, "Player position")}
                        onCancel={cancelEditing}
                        onDelete={() => handleDeletePlayerPosition(pos)}
                      />
                    ))
                  )}
                </div>
              </CardContent>
            </Card>
          </>
        )}

      </div>
    </div>
  );
}
