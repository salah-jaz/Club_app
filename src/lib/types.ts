export type Role = "admin" | "member" | "volunteer";
export type UserStatus = "created" | "active" | "rejected";

export interface User {
  id: string;
  firstName: string;
  lastName: string;
  nickname?: string;
  sex: "male" | "female";
  dob: string;
  email: string;
  mobile: string;
  address: string;
  password: string;
  role: Role;
  status: UserStatus;
  createdAt: string;
  adminRoleId?: string | null;
  adminRoleName?: string | null;
  isSuperAdmin?: boolean;
  permissions?: string[];
}

export interface AdminRole {
  id: string;
  name: string;
  description: string | null;
  isSuper: boolean;
  isSystem: boolean;
  permissionIds: string[];
  userCount?: number;
}

export interface Permission {
  id: string;
  module: string;
  action: string;
  label: string;
}

export type MemberType = "adult" | "junior";
export interface Member {
  id: string;
  userId: string;
  /** Adult this junior belongs to (null for adults / unlinked juniors) */
  parentMemberId?: string | null;
  firstName: string;
  lastName: string;
  dob: string;
  email: string;
  sex: "male" | "female";
  memberType: MemberType;
  membership: boolean;
  trainingEligible: boolean;
  playEligible: boolean;
  skipCreditConsumption: boolean;
  applyDiscount: boolean;
  grade: string;
  biMemberId: string;
  nickname?: string;
  status: "active" | "disabled" | "pending" | "rejected";
  credit: number;
}

export interface CreditRequest {
  id: string;
  memberId: string;
  amount: number;
  date: string;
  type: "credit" | "debit";
  status: "created" | "approved" | "rejected";
  reason?: string;
  createdAt: string;
}

export interface Transaction {
  id: string;
  memberId: string;
  type: "credit" | "debit";
  amount: number;
  description: string;
  reason?: string;
  date: string;
}

export interface PlayerPositionItem {
  name: string;
  skipLeagueFee: boolean;
}

export interface HolidayItem {
  name: string;
  date: string;
}

export interface LeagueGroupMember {
  id: string;
  firstName: string;
  lastName: string;
  grade?: string | null;
  position?: string | null;
}

export interface LeagueGroup {
  id: string;
  name: string;
  description: string;
  memberIds: string[];
  memberPositions?: Record<string, string | null>;
  /** Populated by API for display (view-only member screens). */
  members?: LeagueGroupMember[];
}

export interface PlaySchedule {
  id: string;
  name: string;
  date: string;
  courts: number;
  players: number;
  slotHours: number;
  slotDuration: string;
  sessionRate: number;
  hallRate: number;
  location: string;
  status: "open" | "released" | "rotated" | "published" | "closed";
  isLeagueMatch?: boolean;
  leagueGroupIds?: string[];
}

export type InviteStatus = "open" | "accepted" | "declined" | "waiting";
export interface PlayInvitation {
  id: string;
  scheduleId: string;
  memberId: string;
  status: InviteStatus;
  debited?: boolean;
  /** When the member accepted (ISO). */
  acceptedAt?: string | null;
  updatedAt?: string;
  createdAt?: string;
  isGuest?: boolean;
}

export interface RotationRound {
  round: number;
  courts: { courtNo: number; players: string[] }[];
  resting: string[];
}
export interface Rotation {
  scheduleId: string;
  rounds: RotationRound[];
  /** Admin-set before publish; locked after publish */
  showMemberGrades?: boolean;
}

export interface Training {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  sessions: number;
  slots: number;
  duration: string;
  fees: number;
  coach: string;
  location: string;
  status: "open" | "released" | "closed";
}

export interface TrainingInvitation {
  id: string;
  trainingId: string;
  memberId: string;
  status: InviteStatus;
}

export interface TrainingDate {
  id: string;
  trainingId: string;
  memberId: string;
  date: string;
  attended: boolean | null;
}