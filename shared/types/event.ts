import type { DisplayMetadata } from './display-field.js';

export type Event = {
  id: string;
  source: string;
  source_event_id: string | null;
  title: string;
  start_at: string;
  end_at: string;
  all_day: boolean;
  location: string | null;
  description: string | null;
  category: string | null;
  color: string | null;
  reminders: number[];
  metadata: {
    display?: DisplayMetadata;
    raw?: unknown;
  } | null;
  recurrence_group_id: string | null;
  recurrence_index: number | null;
  google_event_id: string | null;
  google_etag: string | null;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
  override: {
    hidden: boolean | null;
    color_override: string | null;
    note: string | null;
  } | null;
};

export type EventOverride = {
  id: string;
  event_id: string;
  hidden: boolean | null;
  color_override: string | null;
  note: string | null;
};

export type Source = {
  id: string;
  name: string;
  color: string;
  icon: string | null;
  enabled: boolean;
  priority: number;
};
