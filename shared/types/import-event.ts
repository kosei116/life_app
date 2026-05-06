import type { DisplayMetadata } from './display-field.js';

export type ImportEvent = {
  source: string;
  source_event_id: string;
  title: string;
  start: string;
  end: string;
  all_day: boolean;
  location?: string;
  description?: string;
  category?: string;
  color?: string;
  reminders?: number[];
  metadata?: {
    display?: DisplayMetadata;
    raw?: unknown;
  };
};
