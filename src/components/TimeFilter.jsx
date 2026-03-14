export default function TimeFilter({ activeFilter, onSelect }) {
  return (
    <div className="time-filter">
      <select
        className="time-filter-select"
        value={activeFilter}
        onChange={e => onSelect(e.target.value)}
        aria-label="Time filter"
      >
        <option value="24h">Last 24 Hours</option>
        <option value="48h">Last 48 Hours</option>
        <option value="72h">Last 72 Hours</option>
      </select>
    </div>
  );
}
