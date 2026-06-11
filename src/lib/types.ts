export type Role = "admin" | "member" | "volunteer";
export type UserStatus = "created" | "active" | "rejected";

export interface User {
  id: string;
  firstName: string;
  lastName: string;
  sex: "male" | "female";
  dob: string;
  email: string;
  mobile: string;
  address: string;
  password: string;
  role: Role;
  status: UserStatus;
  createdAt: string;
}

export type MemberType = "adult" | "junior";
export interface Member {
  id: string;
  userId: string;
  firstName: string;
  lastName: string;
  dob: string;
  email: string;
  sex: "male" | "female";
  memberType: MemberType;
  membership: boolean;
  league: boolean;
  grade: string;
  biMemberId: string;
  status: "active" | "disabled";
  credit: number;
}

export interface CreditRequest {
  id: string;
  memberId: string;
  amount: number;
  date: string;
  status: "created" | "approved" | "rejected";
  createdAt: string;
}

export interface Transaction {
  id: string;
  memberId: string;
  type: "credit" | "debit";
  amount: number;
  description: string;
  date: string;
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
  status: "open" | "released" | "rotated" | "closed";
}

export type InviteStatus = "open" | "accepted" | "declined" | "waiting";
export interface PlayInvitation {
  id: string;
  scheduleId: string;
  memberId: string;
  status: InviteStatus;
}

export interface RotationRound {
  round: number;
  courts: { courtNo: number; players: string[] }[];
  resting: string[];
}
export interface Rotation {
  scheduleId: string;
  rounds: RotationRound[];
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