/**
 * GAS Calendar adapter contract.
 * Push: POST { action: 'mutations', upserts: [...], deletes: [...] }
 * Pull: GET ?action=events&from=ISO&to=ISO
 */

export interface GasUpsertPayload {
  id: string;
  title: string;
  description: string;
  location: string;
  startDateTime: string;
  endDateTime: string;
  allDay: boolean;
  reminderMinutes: number | null;
  googleEventId?: string | null;
}

export interface GasDeletePayload {
  id: string;
  googleEventId?: string | null;
  title?: string;
  startTime?: string;
  endTime?: string;
  allDay?: boolean;
}

export interface GasMutationsRequest {
  action: 'mutations';
  upserts: GasUpsertPayload[];
  deletes: GasDeletePayload[];
}

export interface GasMutationsResponse {
  success: boolean;
  message?: string;
  created?: number;
  updated?: number;
  deleted?: number;
  skipped?: number;
  results?: Array<{ id: string; googleEventId?: string }>;
  errors?: Array<{ id: string; reason: string; message?: string; googleEventId?: string }>;
  recurringMasterRejected?: number;
}

export interface GasFetchedEvent {
  scheduleMgrId: string | null;
  googleEventId: string;
  title: string;
  description: string;
  location: string;
  allDay: boolean;
  startDateTime: string;
  endDateTime: string;
  lastUpdated: string | null;
  reminderMinutes: number | null;
}

export interface GasFetchEventsResponse {
  success: boolean;
  fetchedAt: string;
  range: { start: string; end: string };
  events: GasFetchedEvent[];
}
