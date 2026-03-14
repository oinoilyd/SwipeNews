export default function TimeFilter({ activeFilter, onSelect }) {
  const options = [
    { value: '24h', label: 'Last 24h' },
    { value: '48h', label: 'Last 48h' },
    { value: '72h', label: 'Last 72h' },
  ];

  return (
    <div className="time-filter" role="group" aria-label="Time filter">
      {options.map(({ value, label }) => (
        <button
          key={value}
          className={`time-filter-btn${activeFilter === value ? ' active' : ''}`}
          onClick={() => onSelect(value)}
          aria-pressed={activeFilter === value}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
