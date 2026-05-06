export type Semester = {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  isCurrent: boolean;
  createdAt: string;
  updatedAt: string;
};

export type Period = {
  id: string;
  semesterId: string;
  periodNumber: number;
  startTime: string;
  endTime: string;
  createdAt: string;
};

export type Subject = {
  id: string;
  semesterId: string;
  name: string;
  color: string;
  lecturesAttended: number;
  evaluation: unknown;
  createdAt: string;
  updatedAt: string;
};

export type TimetableSlot = {
  id: string;
  semesterId: string;
  dayOfWeek: number;
  periodId: string;
  subjectId: string;
  createdAt: string;
};

export type ClassDay = {
  semesterId: string;
  date: string;
};

export type TaskType = 'assignment' | 'report' | 'test' | 'other';

export type Task = {
  id: string;
  semesterId: string;
  subjectId: string | null;
  type: TaskType;
  title: string;
  detail: string | null;
  dueDate: string;
  completed: boolean;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
};
