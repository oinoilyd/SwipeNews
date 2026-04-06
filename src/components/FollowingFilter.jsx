export default function FollowingFilter({ threads, activeThread, onSelect }) {
  if (!threads.length) return null;

  return (
    <div className="following-filter" role="tablist" aria-label="Following stories">
      <span className="following-filter-label">Following</span>
      <div className="following-filter-pills">
        {threads.map(thread => {
          const isActive = activeThread?.id === thread.id;
          return (
            <button
              key={thread.id}
              role="tab"
              aria-selected={isActive}
              className={`following-pill${isActive ? ' active' : ''}`}
              onClick={() => onSelect(isActive ? null : thread)}
            >
              {thread.title}
            </button>
          );
        })}
      </div>
    </div>
  );
}
