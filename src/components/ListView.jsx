export default function ListView({ topics, onSelectTopic }) {
  return (
    <div className="list-view">
      {topics.map((topic, i) => {
        const firstSource = topic.sourceTiers?.all?.[0]?.name
          || topic.sourceTiers?.center?.[0]?.name
          || topic.sourceTiers?.left?.[0]?.name
          || topic.sourceTiers?.right?.[0]?.name
          || topic.category
          || '';

        return (
          <button
            key={topic.id}
            className="list-view-item"
            onClick={() => onSelectTopic(i)}
          >
            <div className="list-view-thumb">
              {topic.urlToImage
                ? <img src={topic.urlToImage} alt="" loading="lazy" />
                : <div className="list-view-thumb-placeholder" />}
            </div>
            <div className="list-view-text">
              <span className="list-view-headline">{topic.title}</span>
              <span className="list-view-meta">{firstSource}</span>
            </div>
          </button>
        );
      })}
    </div>
  );
}
