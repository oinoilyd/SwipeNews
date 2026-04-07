import { t } from '../lib/i18n.js';

export default function FollowingDrawer({ threads, activeThread, onSelect, onClose, lang = 'en' }) {
  return (
    <div className="following-drawer-backdrop" onClick={onClose}>
      <div className="following-drawer" onClick={e => e.stopPropagation()}>
        <div className="following-drawer-header">
          <div className="following-drawer-title-row">
            <span className="following-drawer-eyebrow">{t('liveLabel', lang)}</span>
            <span className="following-drawer-title">{t('ongoingStories', lang)}</span>
          </div>
          <button className="following-drawer-close" onClick={onClose} aria-label="Close">✕</button>
        </div>

        <div className="following-drawer-list">
          {threads.length === 0 ? (
            <p className="following-drawer-empty">{t('noOngoingStories', lang)}</p>
          ) : threads.map(thread => {
            const isActive = activeThread?.id === thread.id;
            const cardCount = thread.topicIds?.length || 1;
            const cardWord  = cardCount === 1 ? t('card', lang) : t('cards', lang);
            return (
              <button key={thread.id}
                className={`following-thread-item${isActive ? ' active' : ''}`}
                onClick={() => onSelect(thread)}>
                <div className="following-thread-main">
                  <span className="following-thread-title">{thread.title}</span>
                  <span className="following-thread-meta">
                    {cardCount} {cardWord} · {thread.articleCount} {t('sources', lang)}
                  </span>
                </div>
                {isActive && <span className="following-thread-check">✓</span>}
              </button>
            );
          })}

          {activeThread && (
            <button className="following-thread-item following-thread-clear"
              onClick={() => onSelect(null)}>
              {t('clearFilter', lang)}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
