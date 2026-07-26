import { create } from "zustand";
import type {
  AdminRole,
  CreditRequest,
  Member,
  Permission,
  PlayInvitation,
  PlaySchedule,
  Role,
  Rotation,
  Training,
  TrainingDate,
  TrainingInvitation,
  Transaction,
  User,
  LeagueGroup,
  PlayerPositionItem,
  HolidayItem,
} from "./types";
import { api } from "./api";

interface State {
  currentUserId: string | null;
  currentUser: User | null;
  activeRole: Role | null;
  users: User[];
  members: Member[];
  creditRequests: CreditRequest[];
  transactions: Transaction[];
  schedules: PlaySchedule[];
  playInvites: PlayInvitation[];
  rotations: Rotation[];
  trainings: Training[];
  trainingInvites: TrainingInvitation[];
  trainingDates: TrainingDate[];
  locations: string[];
  coaches: string[];
  grades: string[];
  adultGrades: string[];
  juniorGrades: string[];
  holidays: string[];
  holidayItems: HolidayItem[];
  playerPositions: string[];
  playerPositionItems: PlayerPositionItem[];
  leagueGroups: LeagueGroup[];
  adminRoles: AdminRole[];
  allPermissions: Permission[];
  adminUsers: User[];
  appName: string;
  appLogoText: string;
  appLogoBase64: string | null;
  currency: string;
  timezone: string;
  mailHost: string;
  mailPort: string;
  mailUsername: string;
  mailPassword: string;
  mailEncryption: string;
  mailFromAddress: string;
  mailFromName: string;
  emailPrimaryColor: string;
  emailBgColor: string;
  emailTextColor: string;
  emailCardBgColor: string;
  emailFooterText: string;
  skipCreditConsumption: boolean;
  cancellationLockHours: number;
  debitTimingHours: number;
  /** When true, court rotation chips show member grade (admin + members). */
  showGradeInCourtRotation: boolean;
  adultDiscountPercent: number;
  adultDiscountAmount: number;
  adultDiscountMode: "percent" | "amount";
  juniorDiscountPercent: number;
  juniorDiscountAmount: number;
  juniorDiscountMode: "percent" | "amount";

  // sync
  fetchSettings: () => Promise<void>;
  syncData: () => Promise<void>;
  syncCurrentUser: () => Promise<User | null>;

  // auth
  register: (u: Omit<User, "id" | "role" | "status" | "createdAt">) => Promise<string>;
  verifyOtp: (email: string, otp: string) => Promise<void>;
  resendOtp: (email: string) => Promise<void>;
  login: (email: string, password: string) => Promise<User | null>;
  loginAs: (memberId: string) => Promise<void>;
  logout: () => Promise<void>;

  // user admin
  approveUser: (
    id: string,
    opts?: {
      memberType?: Member["memberType"];
      grade?: string;
      membership?: boolean;
      trainingEligible?: boolean;
      playEligible?: boolean;
      skipCreditConsumption?: boolean;
      applyDiscount?: boolean;
    },
  ) => Promise<void>;
  approveAllUsers: () => Promise<void>;
  rejectUser: (id: string) => Promise<void>;
  setUserRole: (id: string, role: User["role"]) => Promise<void>;

  // members
  addMember: (
    m: Omit<Member, "id" | "credit"> & { mobile?: string; address?: string; password?: string },
    createLogin?: boolean,
  ) => Promise<void>;
  updateMember: (id: string, patch: Partial<Member>) => Promise<void>;
  deleteMember: (id: string) => Promise<void>;
  bulkDeleteMembers: (ids: string[]) => Promise<number>;
  approveJunior: (
    id: string,
    opts?: { membership?: boolean; trainingEligible?: boolean; playEligible?: boolean; grade?: string },
  ) => Promise<void>;
  rejectJunior: (id: string) => Promise<void>;

  // credits
  requestCredit: (memberId: string, amount: number, date: string, type?: "credit" | "debit", reason?: string) => Promise<void>;
  approveCredit: (id: string) => Promise<void>;
  approveAllCredits: () => Promise<void>;
  rejectCredit: (id: string) => Promise<void>;

  // schedules
  createSchedule: (s: Omit<PlaySchedule, "id" | "status"> & { repeatWeeks?: number }) => Promise<void>;
  updateSchedule: (id: string, patch: Partial<PlaySchedule>) => Promise<void>;
  releaseSchedule: (id: string) => Promise<{ message?: string; inviteCount?: number }>;
  closeSchedule: (id: string) => Promise<void>;
  cancelSchedule: (id: string, reason: string) => Promise<void>;
  deleteSchedule: (id: string) => Promise<void>;
  publishSchedule: (id: string) => Promise<void>;
  respondPlay: (inviteId: string, status: "accepted" | "declined") => Promise<PlayInvitation>;
  enrollPlay: (scheduleId: string, memberIds: string[], autoAccept?: boolean) => Promise<void>;
  generateRotation: (scheduleId: string) => Promise<void>;
  updateRotation: (scheduleId: string, rounds: Rotation["rounds"]) => Promise<void>;
  updateRotationShowGrades: (scheduleId: string, showMemberGrades: boolean) => Promise<void>;
  revertRotation: (scheduleId: string) => Promise<void>;

  // trainings
  createTraining: (t: Omit<Training, "id" | "status">) => Promise<void>;
  updateTraining: (id: string, patch: Partial<Training>) => Promise<void>;
  releaseTraining: (id: string, memberIds?: string[]) => Promise<{ message?: string }>;
  deleteTraining: (id: string) => Promise<void>;
  enrollTraining: (trainingId: string, memberIds: string[]) => Promise<void>;
  registerTrainingJunior: (trainingId: string, memberId: string, status: "accepted" | "declined") => Promise<void>;
  respondTraining: (inviteId: string, status: "accepted" | "declined") => Promise<void>;
  markAttendance: (dateId: string, attended: boolean) => Promise<void>;
  updateSettings: (settings: {
    appName?: string;
    appLogoText?: string;
    appLogoBase64?: string | null;
    currency?: string;
    timezone?: string;
    locations?: string[];
    coaches?: string[];
    grades?: string[];
    adultGrades?: string[];
    juniorGrades?: string[];
    holidays?: string[];
    holidayItems?: HolidayItem[];
    playerPositions?: string[];
    playerPositionItems?: PlayerPositionItem[];
    mailHost?: string;
    mailPort?: string;
    mailUsername?: string;
    mailPassword?: string;
    mailEncryption?: string;
    mailFromAddress?: string;
    mailFromName?: string;
    emailPrimaryColor?: string;
    emailBgColor?: string;
    emailTextColor?: string;
    emailCardBgColor?: string;
    emailFooterText?: string;
    skipCreditConsumption?: boolean;
    cancellationLockHours?: number;
    debitTimingHours?: number;
    showGradeInCourtRotation?: boolean;
    adultDiscountPercent?: number;
    adultDiscountAmount?: number;
    adultDiscountMode?: "percent" | "amount";
    juniorDiscountPercent?: number;
    juniorDiscountAmount?: number;
    juniorDiscountMode?: "percent" | "amount";
  }) => Promise<void>;
  updateProfile: (profile: {
    firstName: string;
    lastName: string;
    sex: "male" | "female";
    dob: string;
    email: string;
    mobile: string;
    address: string;
    password?: string;
  }) => Promise<void>;
  testSmtp: (settings: {
    mailHost: string;
    mailPort: string;
    mailUsername?: string;
    mailPassword?: string;
    mailEncryption?: string;
    mailFromAddress: string;
    mailFromName: string;
    testEmail?: string;
  }) => Promise<{ status: string; message: string }>;
  createLeagueGroup: (g: { name: string; description: string; memberIds: string[]; memberPositions?: Record<string, string | null> }) => Promise<void>;
  updateLeagueGroup: (id: string, patch: { name?: string; description?: string; memberIds?: string[]; memberPositions?: Record<string, string | null> }) => Promise<void>;
  deleteLeagueGroup: (id: string) => Promise<void>;
  setActiveRole: (role: Role) => void;
  bulkUploadMembers: (file: File, options?: { allowExamples?: boolean }) => Promise<number>;

  // admin management
  fetchAdminRoles: () => Promise<void>;
  fetchAllPermissions: () => Promise<void>;
  fetchAdminUsers: () => Promise<void>;
  createAdminRole: (role: { name: string; description?: string; permissionIds: string[] }) => Promise<void>;
  updateAdminRole: (id: string, patch: { name?: string; description?: string; permissionIds?: string[] }) => Promise<void>;
  deleteAdminRole: (id: string) => Promise<void>;
  createAdminUser: (u: { firstName: string; lastName: string; email: string; password: string; mobile?: string; adminRoleId: string }) => Promise<void>;
  updateAdminUser: (id: string, patch: { firstName?: string; lastName?: string; email?: string; mobile?: string; adminRoleId?: string }) => Promise<void>;
  deleteAdminUser: (id: string) => Promise<void>;
  resetAdminPassword: (id: string, password: string) => Promise<void>;
}

const getInitialUserId = () => {
  if (typeof window !== "undefined") {
    return localStorage.getItem("clubapp_user_id");
  }
  return null;
};

const getInitialActiveRole = () => {
  if (typeof window !== "undefined") {
    return localStorage.getItem("clubapp_active_role") as Role | null;
  }
  return null;
};

export const useStore = create<State>((set, get) => ({
  currentUserId: getInitialUserId(),
  currentUser: null,
  activeRole: getInitialActiveRole(),
  users: [],
  members: [],
  creditRequests: [],
  transactions: [],
  schedules: [],
  playInvites: [],
  leagueGroups: [],
  adminRoles: [],
  allPermissions: [],
  adminUsers: [],
  rotations: [],
  trainings: [],
  trainingInvites: [],
  trainingDates: [],
  locations: [],
  coaches: ["Coach Lee", "Coach Alex", "Coach Sarah"],
  grades: [],
  adultGrades: [],
  juniorGrades: [],
  holidays: [],
  holidayItems: [],
  playerPositions: [],
  playerPositionItems: [],
  appName: "Connect App",
  appLogoText: "C",
  appLogoBase64: "/logo.png",
  currency: "$",
  timezone: "Asia/Kolkata",
  mailHost: "",
  mailPort: "",
  mailUsername: "",
  mailPassword: "",
  mailEncryption: "",
  mailFromAddress: "",
  mailFromName: "",
  emailPrimaryColor: "#10B981",
  emailBgColor: "#0C0F0E",
  emailTextColor: "#E8F0EE",
  emailCardBgColor: "#131916",
  emailFooterText: "",
  skipCreditConsumption: false,
  cancellationLockHours: 24,
  debitTimingHours: 24,
  showGradeInCourtRotation: false,
  adultDiscountPercent: 0,
  adultDiscountAmount: 0,
  adultDiscountMode: "percent",
  juniorDiscountPercent: 0,
  juniorDiscountAmount: 0,
  juniorDiscountMode: "percent",

  fetchSettings: async () => {
    try {
      const settings = await api.get<any>("/settings");
      set({
        locations: settings.locations || [],
        coaches: settings.coaches || ["Coach Lee", "Coach Alex", "Coach Sarah"],
        grades: settings.grades || [],
        adultGrades: settings.adultGrades || [],
        juniorGrades: settings.juniorGrades || [],
        holidays: settings.holidays || [],
        holidayItems: settings.holidayItems ||
          (settings.holidays || []).map((date: string) => ({ name: "", date })),
        playerPositions: settings.playerPositions || [],
        playerPositionItems: settings.playerPositionItems ||
          (settings.playerPositions || []).map((name: string) => ({ name, skipLeagueFee: false })),
        appName: settings.appName || "Connect App",
        appLogoText: settings.appLogoText || "C",
        appLogoBase64: settings.appLogoBase64 || "/logo.png",
        currency: settings.currency || "$",
        timezone: settings.timezone || "Asia/Kolkata",
        mailHost: settings.mailHost || "",
        mailPort: settings.mailPort || "",
        mailUsername: settings.mailUsername || "",
        mailPassword: settings.mailPassword || "",
        mailEncryption: settings.mailEncryption || "",
        mailFromAddress: settings.mailFromAddress || "",
        mailFromName: settings.mailFromName || "",
        emailPrimaryColor: settings.emailPrimaryColor || "#10B981",
        emailBgColor: settings.emailBgColor || "#0C0F0E",
        emailTextColor: settings.emailTextColor || "#E8F0EE",
        emailCardBgColor: settings.emailCardBgColor || "#131916",
        emailFooterText: settings.emailFooterText || "",
        skipCreditConsumption: settings.skipCreditConsumption ?? false,
        cancellationLockHours: settings.cancellationLockHours ?? 24,
        debitTimingHours: settings.debitTimingHours ?? 24,
        showGradeInCourtRotation: settings.showGradeInCourtRotation ?? false,
        adultDiscountPercent: settings.adultDiscountPercent ?? 0,
        adultDiscountAmount: settings.adultDiscountAmount ?? 0,
        adultDiscountMode:
          settings.adultDiscountMode === "amount" || settings.adultDiscountMode === "percent"
            ? settings.adultDiscountMode
            : (settings.adultDiscountAmount ?? 0) > 0 && (settings.adultDiscountPercent ?? 0) <= 0
              ? "amount"
              : "percent",
        juniorDiscountPercent: settings.juniorDiscountPercent ?? 0,
        juniorDiscountAmount: settings.juniorDiscountAmount ?? 0,
        juniorDiscountMode:
          settings.juniorDiscountMode === "amount" || settings.juniorDiscountMode === "percent"
            ? settings.juniorDiscountMode
            : (settings.juniorDiscountAmount ?? 0) > 0 && (settings.juniorDiscountPercent ?? 0) <= 0
              ? "amount"
              : "percent",
      });
    } catch {
      // Ignore if unauthenticated or network error
    }
  },

  syncCurrentUser: async () => {
    try {
      const user = await api.get<User>("/me");
      set({ currentUser: user, currentUserId: user.id });
      if (!get().activeRole) {
        set({ activeRole: user.role });
      }
      if (typeof window !== "undefined") {
        localStorage.setItem("clubapp_user_id", user.id);
      }
      return user;
    } catch {
      set({ currentUser: null, currentUserId: null });
      if (typeof window !== "undefined") {
        localStorage.removeItem("clubapp_user_id");
        localStorage.removeItem("clubapp_token");
      }
      return null;
    }
  },

  syncData: async () => {
    try {
      const syncRes = await api.get<{
        members: Member[];
        schedules: PlaySchedule[];
        playInvites: PlayInvitation[];
        trainings: Training[];
        trainingInvites: TrainingInvitation[];
        settings: {
          locations: string[];
          coaches?: string[];
          grades: string[];
          adultGrades?: string[];
          juniorGrades?: string[];
          holidays: string[];
          holidayItems?: HolidayItem[];
          playerPositions: string[];
          playerPositionItems?: PlayerPositionItem[];
          appName: string;
          appLogoText: string;
          appLogoBase64?: string | null;
          currency?: string;
          timezone?: string;
          mailHost?: string;
          mailPort?: string;
          mailUsername?: string;
          mailPassword?: string;
          mailEncryption?: string;
          mailFromAddress?: string;
          mailFromName?: string;
          emailPrimaryColor?: string;
          emailBgColor?: string;
          emailTextColor?: string;
          emailCardBgColor?: string;
          emailFooterText?: string;
          skipCreditConsumption?: boolean;
          cancellationLockHours?: number;
          debitTimingHours?: number;
          showGradeInCourtRotation?: boolean;
          adultDiscountPercent?: number;
          adultDiscountAmount?: number;
          adultDiscountMode?: "percent" | "amount";
          juniorDiscountPercent?: number;
          juniorDiscountAmount?: number;
          juniorDiscountMode?: "percent" | "amount";
        };
        creditRequests: CreditRequest[];
        leagueGroups: LeagueGroup[];
        users: User[];
      }>("/sync-data");

      const {
        members,
        schedules,
        playInvites,
        trainings,
        trainingInvites,
        settings,
        creditRequests,
        leagueGroups,
        users,
      } = syncRes;

      set({
        members,
        schedules,
        playInvites,
        trainings,
        trainingInvites,
        locations: settings.locations,
        coaches: settings.coaches || ["Coach Lee", "Coach Alex", "Coach Sarah"],
        grades: settings.grades,
        adultGrades: settings.adultGrades || [],
        juniorGrades: settings.juniorGrades || [],
        holidays: settings.holidays || [],
        holidayItems: settings.holidayItems ||
          (settings.holidays || []).map((date) => ({ name: "", date })),
        playerPositions: settings.playerPositions || [],
        playerPositionItems: settings.playerPositionItems ||
          (settings.playerPositions || []).map((name) => ({ name, skipLeagueFee: false })),
        appName: settings.appName || "Connect App",
        appLogoText: settings.appLogoText || "C",
        appLogoBase64: settings.appLogoBase64 || "/logo.png",
        currency: settings.currency || "$",
        timezone: settings.timezone || "Asia/Kolkata",
        mailHost: settings.mailHost || "",
        mailPort: settings.mailPort || "",
        mailUsername: settings.mailUsername || "",
        mailPassword: settings.mailPassword || "",
        mailEncryption: settings.mailEncryption || "",
        mailFromAddress: settings.mailFromAddress || "",
        mailFromName: settings.mailFromName || "",
        emailPrimaryColor: settings.emailPrimaryColor || "#10B981",
        emailBgColor: settings.emailBgColor || "#0C0F0E",
        emailTextColor: settings.emailTextColor || "#E8F0EE",
        emailCardBgColor: settings.emailCardBgColor || "#131916",
        emailFooterText: settings.emailFooterText || "",
        skipCreditConsumption: settings.skipCreditConsumption ?? false,
        cancellationLockHours: settings.cancellationLockHours ?? 24,
        debitTimingHours: settings.debitTimingHours ?? 24,
        showGradeInCourtRotation: settings.showGradeInCourtRotation ?? false,
        adultDiscountPercent: settings.adultDiscountPercent ?? 0,
        adultDiscountAmount: settings.adultDiscountAmount ?? 0,
        adultDiscountMode:
          settings.adultDiscountMode === "amount" || settings.adultDiscountMode === "percent"
            ? settings.adultDiscountMode
            : (settings.adultDiscountAmount ?? 0) > 0 && (settings.adultDiscountPercent ?? 0) <= 0
              ? "amount"
              : "percent",
        juniorDiscountPercent: settings.juniorDiscountPercent ?? 0,
        juniorDiscountAmount: settings.juniorDiscountAmount ?? 0,
        juniorDiscountMode:
          settings.juniorDiscountMode === "amount" || settings.juniorDiscountMode === "percent"
            ? settings.juniorDiscountMode
            : (settings.juniorDiscountAmount ?? 0) > 0 && (settings.juniorDiscountPercent ?? 0) <= 0
              ? "amount"
              : "percent",
        users,
        creditRequests,
        leagueGroups,
      });

      // Fetch non-critical secondary data asynchronously in background
      void Promise.all([
        api.get<Rotation[]>("/rotations").catch(() => [] as Rotation[]),
        api.get<TrainingDate[]>("/training-dates").catch(() => [] as TrainingDate[]),
        api.get<Transaction[]>("/transactions").catch(() => [] as Transaction[]),
      ]).then(([rotations, trainingDates, transactions]) => {
        set({ rotations, trainingDates, transactions });
      });
    } catch (e) {
      console.error("Failed to sync backend data:", e);
    }
  },

  register: async (u) => {
    const res = await api.post<{ message: string; user_id: string; email?: string }>("/register", u);
    return res.user_id;
  },

  verifyOtp: async (email, otp) => {
    await api.post("/register/verify-otp", { email, otp });
  },

  resendOtp: async (email) => {
    await api.post("/register/resend-otp", { email });
  },

  login: async (email, password) => {
    const res = await api.post<{ token: string; user: User }>("/login", { email, password });
    if (typeof window !== "undefined") {
      localStorage.setItem("clubapp_token", res.token);
      localStorage.setItem("clubapp_user_id", res.user.id);
      localStorage.setItem("clubapp_active_role", res.user.role);
    }
    set({ currentUserId: res.user.id, currentUser: res.user, activeRole: res.user.role });
    return res.user;
  },

  loginAs: async (memberId) => {
    const res = await api.post<{ token: string; user: User }>(`/members/${memberId}/login-as`);
    if (typeof window !== "undefined") {
      localStorage.setItem("clubapp_token", res.token);
      localStorage.setItem("clubapp_user_id", res.user.id);
      localStorage.setItem("clubapp_active_role", res.user.role);
    }
    set({ currentUserId: res.user.id, currentUser: res.user, activeRole: res.user.role });
  },

  logout: async () => {
    try {
      await api.post("/logout");
    } catch (e) {
      console.warn("Backend logout failed or session already terminated", e);
    }
    if (typeof window !== "undefined") {
      localStorage.removeItem("clubapp_token");
      localStorage.removeItem("clubapp_user_id");
      localStorage.removeItem("clubapp_active_role");
    }
    set({ currentUserId: null, currentUser: null, activeRole: null });
  },

  approveUser: async (id, opts) => {
    await api.post<{ user: User }>(`/users/${id}/approve`, opts);
    await get().syncData();
  },

  approveAllUsers: async () => {
    await api.post<{ users: User[] }>("/users/approve-all");
    await get().syncData();
  },

  rejectUser: async (id) => {
    await api.post<{ user: User }>(`/users/${id}/reject`);
    await get().syncData();
  },

  setUserRole: async (id, role) => {
    const res = await api.patch<{ user: User }>(`/users/${id}/role`, { role });
    // If the active user updated their own role, update local state
    const currentUser = get().currentUser;
    if (currentUser && currentUser.id === id) {
      set({ currentUser: res.user });
    }
    await get().syncData();
  },

  addMember: async (m, createLogin = false) => {
    const { mobile, address, password, ...member } = m;
    const payload = createLogin
      ? { ...member, createLogin: true, mobile, address, password }
      : member;
    await api.post<Member>("/members", payload);
    await get().syncData();
  },

  updateMember: async (id, patch) => {
    await api.patch<Member>(`/members/${id}`, patch);
    await get().syncData();
  },

  deleteMember: async (id) => {
    await api.delete(`/members/${id}`);
    await get().syncData();
  },

  bulkDeleteMembers: async (ids) => {
    const unique = [...new Set(ids.filter(Boolean))];
    if (unique.length === 0) return 0;
    const res = await api.post<{ deletedCount?: number }>("/members/bulk-delete", { ids: unique });
    await get().syncData();
    return res.deletedCount ?? unique.length;
  },

  approveJunior: async (id, opts = {}) => {
    await api.post(`/members/${id}/approve`, opts);
    await get().syncData();
  },

  rejectJunior: async (id) => {
    await api.post(`/members/${id}/reject`);
    await get().syncData();
  },

  requestCredit: async (memberId, amount, date, type = "credit", reason) => {
    await api.post<CreditRequest>("/credit-requests", { memberId, amount, date, type, reason });
    await get().syncData();
  },

  approveCredit: async (id) => {
    await api.post<{ request: CreditRequest; memberCredit: number }>(
      `/credit-requests/${id}/approve`
    );
    await get().syncData();
  },

  approveAllCredits: async () => {
    await api.post<{ requests: CreditRequest[] }>("/credit-requests/approve-all");
    await get().syncData();
  },

  rejectCredit: async (id) => {
    await api.post<{ request: CreditRequest }>(`/credit-requests/${id}/reject`);
    await get().syncData();
  },

  createSchedule: async (sc) => {
    await api.post<PlaySchedule>("/schedules", sc);
    await get().syncData();
  },

  updateSchedule: async (id, patch) => {
    await api.patch<PlaySchedule>(`/schedules/${id}`, patch);
    await get().syncData();
  },

  releaseSchedule: async (id) => {
    const res = await api.post<{
      schedule: PlaySchedule;
      invitations: PlayInvitation[];
      message?: string;
      inviteCount?: number;
    }>(`/schedules/${id}/release`);
    await get().syncData();
    return { message: res.message, inviteCount: res.inviteCount };
  },

  closeSchedule: async (id) => {
    await api.post<{ schedule: PlaySchedule }>(`/schedules/${id}/close`);
    await get().syncData();
  },

  cancelSchedule: async (id, reason) => {
    await api.post<{ schedule: PlaySchedule }>(`/schedules/${id}/cancel`, { reason });
    await get().syncData();
  },

  deleteSchedule: async (id) => {
    await api.delete(`/schedules/${id}`);
    await get().syncData();
  },

  publishSchedule: async (id) => {
    await api.post<{ schedule: PlaySchedule }>(`/schedules/${id}/publish`);
    await get().syncData();
  },

  respondPlay: async (inviteId, status) => {
    const res = await api.post<PlayInvitation & { promoted?: PlayInvitation }>(
      `/play-invitations/${inviteId}/respond`,
      { status },
    );
    const { promoted, ...updated } = res;

    // Apply response immediately so the UI flips Accept → Decline without waiting
    set((state) => ({
      playInvites: state.playInvites.map((i) => {
        if (i.id === inviteId) return { ...i, ...updated };
        if (promoted && i.id === promoted.id) return { ...i, ...promoted };
        return i;
      }),
    }));

    // Refresh invites + member balances / transactions (fee debited or refunded on accept/cancel)
    await get().syncData();

    const playInvites = get().playInvites;
    return playInvites.find((i) => i.id === inviteId) ?? updated;
  },

  enrollPlay: async (scheduleId, memberIds, autoAccept = false) => {
    const res = await api.post<{
      invitations?: PlayInvitation[];
    }>(`/schedules/${scheduleId}/enroll`, { memberIds, autoAccept });
    const created = res.invitations ?? [];
    if (created.length === 0) {
      // Fallback: light refresh of invites only
      const playInvites = await api.get<PlayInvitation[]>("/play-invitations");
      set({ playInvites });
      return;
    }
    set((state) => {
      const byId = new Map(state.playInvites.map((i) => [i.id, i]));
      for (const inv of created) byId.set(inv.id, { ...byId.get(inv.id), ...inv });
      return { playInvites: Array.from(byId.values()) };
    });
    if (autoAccept) {
      await get().syncData();
    }
  },

  generateRotation: async (scheduleId) => {
    await api.post<{ schedule: PlaySchedule; rotation: Rotation }>(
      `/schedules/${scheduleId}/rotate`
    );
    await get().syncData();
  },

  updateRotation: async (scheduleId, rounds) => {
    await api.patch<{ schedule: PlaySchedule; rotation: Rotation }>(
      `/schedules/${scheduleId}/rotation`,
      { rounds },
    );
    await get().syncData();
  },

  updateRotationShowGrades: async (scheduleId, showMemberGrades) => {
    await api.patch<{ schedule: PlaySchedule; rotation: Rotation }>(
      `/schedules/${scheduleId}/rotation/show-grades`,
      { showMemberGrades },
    );
    await get().syncData();
  },

  revertRotation: async (scheduleId) => {
    await api.post<{ schedule: PlaySchedule }>(
      `/schedules/${scheduleId}/revert-rotation`,
    );
    await get().syncData();
  },

  createTraining: async (t) => {
    const tr = await api.post<Training>("/trainings", t);
    await api.post<{ training: Training }>(`/trainings/${tr.id}/release`, { memberIds: [] });
    await get().syncData();
  },

  updateTraining: async (id, patch) => {
    await api.patch<Training>(`/trainings/${id}`, patch);
    await get().syncData();
  },

  deleteTraining: async (id) => {
    await api.delete(`/trainings/${id}`);
    await get().syncData();
  },

  releaseTraining: async (trainingId, memberIds) => {
    const res = await api.post<{
      training: Training;
      invitations: TrainingInvitation[];
      dates: TrainingDate[];
      message?: string;
    }>(`/trainings/${trainingId}/release`, { memberIds: memberIds ?? [] });
    await get().syncData();
    return { message: res.message };
  },

  enrollTraining: async (trainingId, memberIds) => {
    await api.post(`/trainings/${trainingId}/enroll`, { memberIds });
    await get().syncData();
  },

  registerTrainingJunior: async (trainingId, memberId, status) => {
    await api.post(`/trainings/${trainingId}/register`, { memberId, status });
    await get().syncData();
  },

  respondTraining: async (inviteId, status) => {
    await api.post<TrainingInvitation>(
      `/training-invitations/${inviteId}/respond`,
      { status }
    );
    await get().syncData();
  },

  markAttendance: async (dateId, attended) => {
    await api.patch<TrainingDate>(`/training-dates/${dateId}/attendance`, {
      attended,
    });
    await get().syncData();
  },

  updateSettings: async (settings) => {
    const updated = await api.post<{
      locations: string[];
      coaches?: string[];
      grades: string[];
      adultGrades?: string[];
      juniorGrades?: string[];
      holidays: string[];
      holidayItems?: HolidayItem[];
      playerPositions: string[];
      playerPositionItems?: PlayerPositionItem[];
      appName: string;
      appLogoText: string;
      appLogoBase64: string | null;
      currency: string;
      timezone: string;
      mailHost: string;
      mailPort: string;
      mailUsername: string;
      mailPassword: string;
      mailEncryption: string;
      mailFromAddress: string;
      mailFromName: string;
      emailPrimaryColor: string;
      emailBgColor: string;
      emailTextColor: string;
      emailCardBgColor: string;
      emailFooterText: string;
      skipCreditConsumption: boolean;
      cancellationLockHours: number;
      debitTimingHours: number;
      showGradeInCourtRotation: boolean;
      adultDiscountPercent: number;
      adultDiscountAmount: number;
      adultDiscountMode: "percent" | "amount";
      juniorDiscountPercent: number;
      juniorDiscountAmount: number;
      juniorDiscountMode: "percent" | "amount";
    }>("/settings", settings);
    set({
      locations: updated.locations,
      coaches: updated.coaches || ["Coach Lee", "Coach Alex", "Coach Sarah"],
      grades: updated.grades,
      adultGrades: updated.adultGrades || [],
      juniorGrades: updated.juniorGrades || [],
      holidays: updated.holidays || [],
      holidayItems: updated.holidayItems ||
        (updated.holidays || []).map((date) => ({ name: "", date })),
      playerPositions: updated.playerPositions || [],
      playerPositionItems: updated.playerPositionItems ||
        (updated.playerPositions || []).map((name) => ({ name, skipLeagueFee: false })),
      appName: updated.appName,
      appLogoText: updated.appLogoText,
      appLogoBase64: updated.appLogoBase64,
      currency: updated.currency,
      timezone: updated.timezone || "Asia/Kolkata",
      mailHost: updated.mailHost,
      mailPort: updated.mailPort,
      mailUsername: updated.mailUsername,
      mailPassword: updated.mailPassword,
      mailEncryption: updated.mailEncryption,
      mailFromAddress: updated.mailFromAddress,
      mailFromName: updated.mailFromName,
      emailPrimaryColor: updated.emailPrimaryColor,
      emailBgColor: updated.emailBgColor,
      emailTextColor: updated.emailTextColor,
      emailCardBgColor: updated.emailCardBgColor,
      emailFooterText: updated.emailFooterText,
      skipCreditConsumption: updated.skipCreditConsumption,
      cancellationLockHours: updated.cancellationLockHours,
      debitTimingHours: updated.debitTimingHours,
      showGradeInCourtRotation: updated.showGradeInCourtRotation ?? false,
      adultDiscountPercent: updated.adultDiscountPercent ?? 0,
      adultDiscountAmount: updated.adultDiscountAmount ?? 0,
      adultDiscountMode:
        updated.adultDiscountMode === "amount" || updated.adultDiscountMode === "percent"
          ? updated.adultDiscountMode
          : "percent",
      juniorDiscountPercent: updated.juniorDiscountPercent ?? 0,
      juniorDiscountAmount: updated.juniorDiscountAmount ?? 0,
      juniorDiscountMode:
        updated.juniorDiscountMode === "amount" || updated.juniorDiscountMode === "percent"
          ? updated.juniorDiscountMode
          : "percent",
    });
    await get().syncData();
  },

  updateProfile: async (profile) => {
    const res = await api.post<{ message: string; user: User }>("/profile", profile);
    const members = await api.get<Member[]>("/members");
    set((s) => ({
      currentUser: res.user,
      users: s.users.map((u) => (u.id === res.user.id ? res.user : u)),
      members,
    }));
  },

  testSmtp: async (settings) => {
    return await api.post<{ status: string; message: string }>("/settings/test-smtp", settings);
  },

  createLeagueGroup: async (g) => {
    await api.post<LeagueGroup>("/league-groups", g);
    await get().syncData();
  },

  updateLeagueGroup: async (id, patch) => {
    await api.patch<LeagueGroup>(`/league-groups/${id}`, patch);
    await get().syncData();
  },

  deleteLeagueGroup: async (id) => {
    await api.delete(`/league-groups/${id}`);
    await get().syncData();
  },

  setActiveRole: (role: Role) => {
    if (typeof window !== "undefined") {
      localStorage.setItem("clubapp_active_role", role);
    }
    set({ activeRole: role });
  },

  bulkUploadMembers: async (file: File, options?: { allowExamples?: boolean }) => {
    const formData = new FormData();
    formData.append("file", file);
    if (options?.allowExamples) {
      formData.append("allow_examples", "1");
    }
    const res = await api.post<{ createdCount?: number }>("/members/bulk-upload", formData);
    await get().syncData();
    return res.createdCount ?? 0;
  },

  fetchAdminRoles: async () => {
    try {
      const roles = await api.get<AdminRole[]>("/admin-roles");
      set({ adminRoles: roles });
    } catch { /* non-admin */ }
  },

  fetchAllPermissions: async () => {
    try {
      const grouped = await api.get<Record<string, Omit<Permission, "module">[]>>("/admin-roles/permissions");
      const flat: Permission[] = Object.entries(grouped).flatMap(([module, perms]) =>
        perms.map((p) => ({ ...p, module }))
      );
      set({ allPermissions: flat });
    } catch { /* non-admin */ }
  },

  fetchAdminUsers: async () => {
    try {
      const users = await api.get<User[]>("/admin-users");
      set({ adminUsers: users });
    } catch { /* non-admin */ }
  },

  createAdminRole: async (role) => {
    await api.post("/admin-roles", role);
    await get().fetchAdminRoles();
  },

  updateAdminRole: async (id, patch) => {
    await api.patch(`/admin-roles/${id}`, patch);
    await get().fetchAdminRoles();
  },

  deleteAdminRole: async (id) => {
    await api.delete(`/admin-roles/${id}`);
    await get().fetchAdminRoles();
  },

  createAdminUser: async (u) => {
    await api.post("/admin-users", u);
    await get().fetchAdminUsers();
  },

  updateAdminUser: async (id, patch) => {
    await api.patch(`/admin-users/${id}`, patch);
    await get().fetchAdminUsers();
  },

  deleteAdminUser: async (id) => {
    await api.delete(`/admin-users/${id}`);
    await get().fetchAdminUsers();
  },

  resetAdminPassword: async (id, password) => {
    await api.post(`/admin-users/${id}/reset-password`, { password });
  },
}));

export function useCurrentUser() {
  return useStore((s) => s.currentUser);
}