export default function TimeFilter({ activeFilter, onSelect, counts = {} }) {
  const options = [
    { value: '24h', label: 'Last 24h' },
    { value: '48h', label: 'Last 48h' },
    { value: '72h', label: 'Last 72h' },
  ];

  return (
    <div className="time-filter" role="group" aria-label="Time filter">
      {options.map(({ value, label }) => {
        const count = counts[value];
        return (
          <button
            key={value}
            className={`time-filter-btn${activeFilter === value ? ' active' : ''}`}
            onClick={() => onSelect(value)}
            aria-pressed={activeFilter === value}
          >
            {label}
            {count != null && (
              <span className="time-filter-count">{count}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
