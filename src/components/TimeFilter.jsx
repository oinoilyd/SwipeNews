const OPTIONS = [
  { value: '24h', label: '24h' },
  { value: '48h', label: '48h' },
  { value: '72h', label: '72h' },
];

export default function TimeFilter({ activeFilter, onSelect }) {
  return (
    <div className="time-filter" role="tablist" aria-label="Time range">
      {OPTIONS.map(opt => (
        <button
          key={opt.value}
          role="tab"
          aria-selected={activeFilter === opt.value}
          className={`time-pill${activeFilter === opt.value ? ' active' : ''}`}
          onClick={() => onSelect(opt.value)}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
