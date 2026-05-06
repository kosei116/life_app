import type { DisplayField } from '@life-app/types';
import { formatJst } from '../../../lib/date-utils';

export function DisplayFieldRenderer({ field }: { field: DisplayField }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 2 }}>{field.label}</div>
      <div style={{ fontSize: 14 }}>{renderValue(field)}</div>
    </div>
  );
}

function renderValue(field: DisplayField) {
  switch (field.type) {
    case 'text':
      return <span>{field.value}</span>;
    case 'multiline':
      return <pre style={{ whiteSpace: 'pre-wrap', margin: 0, fontFamily: 'inherit' }}>{field.value}</pre>;
    case 'link':
      return (
        <a href={field.url} target="_blank" rel="noopener noreferrer">
          {field.value}
        </a>
      );
    case 'badge':
      return (
        <span
          style={{
            background: field.color ?? '#6b7280',
            color: '#fff',
            padding: '2px 8px',
            borderRadius: 12,
            fontSize: 12,
          }}
        >
          {field.value}
        </span>
      );
    case 'progress': {
      const pct = field.max > 0 ? Math.min(100, (field.value / field.max) * 100) : 0;
      return (
        <div>
          <div style={{ background: '#e5e7eb', height: 6, borderRadius: 3, overflow: 'hidden' }}>
            <div style={{ background: '#3b82f6', height: '100%', width: `${pct}%` }} />
          </div>
          <div style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>
            {field.value} / {field.max} {field.unit ?? ''}
          </div>
        </div>
      );
    }
    case 'date':
      return <span>{formatJst(field.value, 'yyyy-MM-dd HH:mm')}</span>;
    case 'tags':
      return (
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {field.value.map((t, i) => (
            <span
              key={i}
              style={{
                background: '#f3f4f6',
                padding: '2px 8px',
                borderRadius: 12,
                fontSize: 12,
              }}
            >
              {t}
            </span>
          ))}
        </div>
      );
  }
}
