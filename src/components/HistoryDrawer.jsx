import { HISTORY_DISPUTES } from '../lib/historyData.js';

export default function HistoryDrawer({ disputeIndex, onSelect, onClose }) {
  return (
    <div className="following-drawer-backdrop" onClick={onClose}>
      <div className="history-drawer" onClick={e => e.stopPropagation()}>

        <div className="following-drawer-header">
          <div className="following-drawer-title-row">
            <span className="history-drawer-eyebrow">⚔ HISTORICAL CONTEXT</span>
          </div>
          <button className="following-drawer-close" onClick={onClose} aria-label="Close">✕</button>
        </div>

        <div className="following-drawer-list">
          {HISTORY_DISPUTES.map((dispute, i) => {
            const isActive = i === disputeIndex;
            return (
              <button
                key={dispute.id}
                className={`following-thread-item history-drawer-item${isActive ? ' active' : ''}`}
                onClick={() => onSelect(i)}
              >
                <div className="following-thread-main">
                  <span className="following-thread-title">{dispute.title}</span>
                  <span className="following-thread-meta">
                    {dispute.period} · {dispute.perspectives.length} perspectives
                  </span>
                </div>
                {isActive && <span className="history-drawer-check">✓</span>}
              </button>
            );
          })}
        </div>

      </div>
    </div>
  );
}
