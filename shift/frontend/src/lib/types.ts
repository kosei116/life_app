export type Workplace = {
  id: string;
  name: string;
  color: string;
  hourlyRate: number;
  breakThresholdMinutes: number;
  breakMinutes: number;
  nightStartHour: number;
  nightEndHour: number;
  nightMultiplier: string;
  createdAt: string;
  updatedAt: string;
};

export type ShiftCalc = {
  rawDurationHours: number;
  breakHours: number;
  paidHours: number;
  nightHours: number;
  basePay: number;
  nightPay: number;
  totalPay: number;
};

export type Shift = {
  id: string;
  workplaceId: string;
  startAt: string;
  endAt: string;
  rateOverride: number | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  calc?: ShiftCalc;
};

export type IncomeMonth = {
  yearMonth: string;
  totalPay: number;
  paidHours: number;
  shiftCount: number;
  target: number;
};

export type IncomeYear = {
  year: number;
  months: { month: number; totalPay: number; hours: number; count: number }[];
  totalPay: number;
  totalHours: number;
  totalCount: number;
  avgMonthly: number;
  high: { month: number; totalPay: number } | null;
  low: { month: number; totalPay: number } | null;
};
