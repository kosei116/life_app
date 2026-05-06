export type DisplayFieldType =
  | 'text'
  | 'multiline'
  | 'link'
  | 'badge'
  | 'progress'
  | 'date'
  | 'tags';

export type DisplayField =
  | { type: 'text'; label: string; value: string }
  | { type: 'multiline'; label: string; value: string }
  | { type: 'link'; label: string; value: string; url: string }
  | { type: 'badge'; label: string; value: string; color?: string }
  | { type: 'progress'; label: string; value: number; max: number; unit?: string }
  | { type: 'date'; label: string; value: string }
  | { type: 'tags'; label: string; value: string[] };

export type DisplayAction = {
  label: string;
  url: string;
  icon?: string;
};

export type DisplayMetadata = {
  fields?: DisplayField[];
  actions?: DisplayAction[];
};
