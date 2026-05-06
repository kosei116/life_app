import { useSources } from './useSources';
import { useSourceFilter } from './source-filter-store';

export function SourceFilterBar() {
  const { data: sources = [] } = useSources();
  const hidden = useSourceFilter((s) => s.hidden);
  const toggle = useSourceFilter((s) => s.toggle);

  const pills = sources.map((s) => ({ id: s.id, name: s.name, color: s.color }));

  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
      {pills.map((p) => {
        const isHidden = hidden.has(p.id);
        return (
          <button
            key={p.id}
            onClick={() => toggle(p.id)}
            title={isHidden ? `${p.name} を表示` : `${p.name} を非表示`}
            className="source-pill"
            data-active={!isHidden}
            style={{ ['--pill-color' as string]: p.color }}
          >
            <span className="source-pill-dot" />
            {p.name}
          </button>
        );
      })}
    </div>
  );
}
