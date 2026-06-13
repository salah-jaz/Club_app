import { create } from "zustand";
import type {
  CreditRequest,
  Member,
  PlayInvitation,
  PlaySchedule,
  Rotation,
  Training,
  TrainingDate,
  TrainingInvitation,
  Transaction,
  User,
} from "./types";
import { api } from "./api";

interface State {
  currentUserId: string | null;
  currentUser: User | null;
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
  grades: string[];
  holidays: string[];
  appName: string;
  appLogoText: string;
  appLogoBase64: string | null;
  currency: string;

  // sync
  syncData: () => Promise<void>;
  syncCurrentUser: () => Promise<User | null>;

  // auth
  register: (u: Omit<User, "id" | "role" | "status" | "createdAt">) => Promise<string>;
  login: (email: string, password: string) => Promise<User | null>;
  logout: () => Promise<void>;

  // user admin
  approveUser: (id: string) => Promise<void>;
  approveAllUsers: () => Promise<void>;
  rejectUser: (id: string) => Promise<void>;
  setUserRole: (id: string, role: User["role"]) => Promise<void>;

  // members
  addMember: (m: Omit<Member, "id" | "credit">) => Promise<void>;
  updateMember: (id: string, patch: Partial<Member>) => Promise<void>;
  deleteMember: (id: string) => Promise<void>;

  // credits
  requestCredit: (memberId: string, amount: number, date: string) => Promise<void>;
  approveCredit: (id: string) => Promise<void>;
  approveAllCredits: () => Promise<void>;
  rejectCredit: (id: string) => Promise<void>;

  // schedules
  createSchedule: (s: Omit<PlaySchedule, "id" | "status">) => Promise<void>;
  updateSchedule: (id: string, patch: Partial<PlaySchedule>) => Promise<void>;
  releaseSchedule: (id: string) => Promise<void>;
  closeSchedule: (id: string) => Promise<void>;
  deleteSchedule: (id: string) => Promise<void>;
  respondPlay: (inviteId: string, status: "accepted" | "declined") => Promise<void>;
  generateRotation: (scheduleId: string) => Promise<void>;

  // trainings
  createTraining: (t: Omit<Training, "id" | "status">) => Promise<void>;
  updateTraining: (id: string, patch: Partial<Training>) => Promise<void>;
  releaseTraining: (id: string, memberIds?: string[]) => Promise<void>;
  deleteTraining: (id: string) => Promise<void>;
  registerTrainingJunior: (trainingId: string, memberId: string, status: "accepted" | "declined") => Promise<void>;
  respondTraining: (inviteId: string, status: "accepted" | "declined") => Promise<void>;
  markAttendance: (dateId: string, attended: boolean) => Promise<void>;
  updateSettings: (settings: {
    appName?: string;
    appLogoText?: string;
    appLogoBase64?: string | null;
    currency?: string;
    locations?: string[];
    grades?: string[];
    holidays?: string[];
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
}

const getInitialUserId = () => {
  if (typeof window !== "undefined") {
    return localStorage.getItem("clubapp_user_id");
  }
  return null;
};

export const useStore = create<State>((set, get) => ({
  currentUserId: getInitialUserId(),
  currentUser: null,
  users: [],
  members: [],
  creditRequests: [],
  transactions: [],
  schedules: [],
  playInvites: [],
  rotations: [],
  trainings: [],
  trainingInvites: [],
  trainingDates: [],
  locations: [],
  grades: [],
  holidays: [],
  appName: "ClubApp",
  appLogoText: "C",
  appLogoBase64: null,
  currency: "$",

  syncCurrentUser: async () => {
    try {
      const user = await api.get<User>("/me");
      set({ currentUser: user, currentUserId: user.id });
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
      const [
        members,
        schedules,
        playInvites,
        rotations,
        trainings,
        trainingInvites,
        trainingDates,
        transactions,
        settings,
        creditRequests,
      ] = await Promise.all([
        api.get<Member[]>("/members"),
        api.get<PlaySchedule[]>("/schedules"),
        api.get<PlayInvitation[]>("/play-invitations"),
        api.get<Rotation[]>("/rotations"),
        api.get<Training[]>("/trainings"),
        api.get<TrainingInvitation[]>("/training-invitations"),
        api.get<TrainingDate[]>("/training-dates"),
        api.get<Transaction[]>("/transactions"),
        api.get<{ locations: string[]; grades: string[]; holidays: string[]; appName: string; appLogoText: string; appLogoBase64?: string | null; currency?: string }>("/settings"),
        api.get<CreditRequest[]>("/credit-requests"),
      ]);

      let users: User[] = [];
      try {
        users = await api.get<User[]>("/users");
      } catch {
        // Fallback for non-admin users who cannot list all users
        users = [];
      }

      set({
        members,
        schedules,
        playInvites,
        rotations,
        trainings,
        trainingInvites,
        trainingDates,
        transactions,
        locations: settings.locations,
        grades: settings.grades,
        holidays: settings.holidays,
        appName: settings.appName || "ClubApp",
        appLogoText: settings.appLogoText || "C",
        appLogoBase64: settings.appLogoBase64 || null,
        currency: settings.currency || "$",
        users,
        creditRequests,
      });
    } catch (e) {
      console.error("Failed to sync backend data:", e);
    }
  },

  register: async (u) => {
    const res = await api.post<{ message: string; user_id: string }>("/register", u);
    return res.user_id;
  },

  login: async (email, password) => {
    const res = await api.post<{ token: string; user: User }>("/login", { email, password });
    if (typeof window !== "undefined") {
      localStorage.setItem("clubapp_token", res.token);
      localStorage.setItem("clubapp_user_id", res.user.id);
    }
    set({ currentUserId: res.user.id, currentUser: res.user });
    return res.user;
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
    }
    set({ currentUserId: null, currentUser: null });
  },

  approveUser: async (id) => {
    const res = await api.post<{ user: User }>(`/users/${id}/approve`);
    const members = await api.get<Member[]>("/members");
    set((s) => ({
      users: s.users.map((u) => (u.id === id ? res.user : u)),
      members,
    }));
  },

  approveAllUsers: async () => {
    const res = await api.post<{ users: User[] }>("/users/approve-all");
    const members = await api.get<Member[]>("/members");
    set((s) => {
      const updatedMap = new Map(res.users.map((u) => [u.id, u]));
      return {
        users: s.users.map((u) => updatedMap.get(u.id) || u),
        members,
      };
    });
  },

  rejectUser: async (id) => {
    const res = await api.post<{ user: User }>(`/users/${id}/reject`);
    set((s) => ({
      users: s.users.map((u) => (u.id === id ? res.user : u)),
    }));
  },

  setUserRole: async (id, role) => {
    const res = await api.patch<{ user: User }>(`/users/${id}/role`, { role });
    set((s) => ({
      users: s.users.map((u) => (u.id === id ? res.user : u)),
    }));
    // If the active user updated their own role, update local state
    const currentUser = get().currentUser;
    if (currentUser && currentUser.id === id) {
      set({ currentUser: res.user });
    }
  },

  addMember: async (m) => {
    const newMember = await api.post<Member>("/members", m);
    set((s) => ({ members: [...s.members, newMember] }));
  },

  updateMember: async (id, patch) => {
    const updated = await api.patch<Member>(`/members/${id}`, patch);
    set((s) => ({
      members: s.members.map((m) => (m.id === id ? updated : m)),
    }));
  },

  deleteMember: async (id) => {
    await api.delete(`/members/${id}`);
    set((s) => ({ members: s.members.filter((m) => m.id !== id) }));
  },

  requestCredit: async (memberId, amount, date) => {
    const req = await api.post<CreditRequest>("/credit-requests", { memberId, amount, date });
    const currentUser = get().currentUser;
    if (currentUser && currentUser.role === "admin") {
      const members = await api.get<Member[]>("/members");
      const txs = await api.get<Transaction[]>("/transactions");
      set((s) => ({
        creditRequests: [...s.creditRequests, req],
        members,
        transactions: txs,
      }));
    } else {
      set((s) => ({ creditRequests: [...s.creditRequests, req] }));
    }
  },

  approveCredit: async (id) => {
    const res = await api.post<{ request: CreditRequest; memberCredit: number }>(
      `/credit-requests/${id}/approve`
    );
    // Refresh ledger/members
    const members = await api.get<Member[]>("/members");
    const txs = await api.get<Transaction[]>("/transactions");
    set((s) => ({
      creditRequests: s.creditRequests.map((c) => (c.id === id ? res.request : c)),
      members,
      transactions: txs,
    }));
  },

  approveAllCredits: async () => {
    const res = await api.post<{ requests: CreditRequest[] }>("/credit-requests/approve-all");
    // Refresh ledger/members
    const members = await api.get<Member[]>("/members");
    const txs = await api.get<Transaction[]>("/transactions");
    set((s) => {
      const updatedMap = new Map(res.requests.map((r) => [r.id, r]));
      return {
        creditRequests: s.creditRequests.map((c) => updatedMap.get(c.id) || c),
        members,
        transactions: txs,
      };
    });
  },

  rejectCredit: async (id) => {
    const res = await api.post<{ request: CreditRequest }>(`/credit-requests/${id}/reject`);
    set((s) => ({
      creditRequests: s.creditRequests.map((c) => (c.id === id ? res.request : c)),
    }));
  },

  createSchedule: async (sc) => {
    const sch = await api.post<PlaySchedule>("/schedules", sc);
    set((s) => ({ schedules: [...s.schedules, sch] }));
  },

  updateSchedule: async (id, patch) => {
    const updated = await api.patch<PlaySchedule>(`/schedules/${id}`, patch);
    set((s) => ({
      schedules: s.schedules.map((x) => (x.id === id ? updated : x)),
    }));
  },

  releaseSchedule: async (id) => {
    const res = await api.post<{ schedule: PlaySchedule; invitations: PlayInvitation[] }>(
      `/schedules/${id}/release`
    );
    const invites = await api.get<PlayInvitation[]>("/play-invitations");
    set((s) => ({
      schedules: s.schedules.map((x) => (x.id === id ? res.schedule : x)),
      playInvites: invites,
    }));
  },

  closeSchedule: async (id) => {
    const res = await api.post<{ schedule: PlaySchedule }>(`/schedules/${id}/close`);
    set((s) => ({
      schedules: s.schedules.map((x) => (x.id === id ? res.schedule : x)),
    }));
  },

  deleteSchedule: async (id) => {
    await api.delete(`/schedules/${id}`);
    set((s) => ({ schedules: s.schedules.filter((x) => x.id !== id) }));
  },

  respondPlay: async (inviteId, status) => {
    const updated = await api.post<PlayInvitation>(`/play-invitations/${inviteId}/respond`, {
      status,
    });
    set((s) => ({
      playInvites: s.playInvites.map((i) => (i.id === inviteId ? updated : i)),
    }));
  },

  generateRotation: async (scheduleId) => {
    const res = await api.post<{ schedule: PlaySchedule; rotation: Rotation }>(
      `/schedules/${scheduleId}/rotate`
    );
    // Reload rotations, schedules, members, transactions
    const [rotations, schedules, members, transactions] = await Promise.all([
      api.get<Rotation[]>("/rotations"),
      api.get<PlaySchedule[]>("/schedules"),
      api.get<Member[]>("/members"),
      api.get<Transaction[]>("/transactions"),
    ]);
    set({
      rotations,
      schedules,
      members,
      transactions,
    });
  },

  createTraining: async (t) => {
    const tr = await api.post<Training>("/trainings", t);
    set((s) => ({ trainings: [...s.trainings, tr] }));
  },

  updateTraining: async (id, patch) => {
    const updated = await api.patch<Training>(`/trainings/${id}`, patch);
    set((s) => ({
      trainings: s.trainings.map((x) => (x.id === id ? updated : x)),
    }));
  },

  deleteTraining: async (id) => {
    await api.delete(`/trainings/${id}`);
    set((s) => ({ trainings: s.trainings.filter((x) => x.id !== id) }));
  },

  releaseTraining: async (trainingId, memberIds = []) => {
    const res = await api.post<{
      training: Training;
      invitations: TrainingInvitation[];
      dates: TrainingDate[];
    }>(`/trainings/${trainingId}/release`, { memberIds });

    const [invites, dates, trainings] = await Promise.all([
      api.get<TrainingInvitation[]>("/training-invitations"),
      api.get<TrainingDate[]>("/training-dates"),
      api.get<Training[]>("/trainings"),
    ]);

    set({
      trainings,
      trainingInvites: invites,
      trainingDates: dates,
    });
  },

  registerTrainingJunior: async (trainingId, memberId, status) => {
    await api.post(`/trainings/${trainingId}/register`, { memberId, status });

    const [invites, dates, trainings] = await Promise.all([
      api.get<TrainingInvitation[]>("/training-invitations"),
      api.get<TrainingDate[]>("/training-dates"),
      api.get<Training[]>("/trainings"),
    ]);

    set({
      trainingInvites: invites,
      trainingDates: dates,
      trainings,
    });
  },

  respondTraining: async (inviteId, status) => {
    const updated = await api.post<TrainingInvitation>(
      `/training-invitations/${inviteId}/respond`,
      { status }
    );
    set((s) => ({
      trainingInvites: s.trainingInvites.map((i) => (i.id === inviteId ? updated : i)),
    }));
  },

  markAttendance: async (dateId, attended) => {
    const updated = await api.patch<TrainingDate>(`/training-dates/${dateId}/attendance`, {
      attended,
    });
    set((s) => ({
      trainingDates: s.trainingDates.map((d) => (d.id === dateId ? updated : d)),
    }));
  },

  updateSettings: async (settings) => {
    const updated = await api.post<{
      locations: string[];
      grades: string[];
      holidays: string[];
      appName: string;
      appLogoText: string;
      appLogoBase64: string | null;
      currency: string;
    }>("/settings", settings);
    set({
      locations: updated.locations,
      grades: updated.grades,
      holidays: updated.holidays,
      appName: updated.appName,
      appLogoText: updated.appLogoText,
      appLogoBase64: updated.appLogoBase64,
      currency: updated.currency,
    });
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
}));

export function useCurrentUser() {
  return useStore((s) => s.currentUser);
}