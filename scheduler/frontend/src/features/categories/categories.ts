export interface Category {
  id: string;
  name: string;
  color: string;
}

export const CATEGORIES: Category[] = [
  { id: 'work', name: '仕事', color: '#0d9488' },
  { id: 'private', name: 'プライベート', color: '#10b981' },
  { id: 'study', name: '勉強', color: '#2563eb' },
  { id: 'health', name: '健康', color: '#ef4444' },
  { id: 'hobby', name: '趣味', color: '#f59e0b' },
  { id: 'other', name: 'その他', color: '#6b7280' },
];

export const DEFAULT_CATEGORY = CATEGORIES[0]!;

export function findCategoryByName(name: string | null | undefined): Category | undefined {
  if (!name) return undefined;
  return CATEGORIES.find((c) => c.name === name);
}
