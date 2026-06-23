import React, { useEffect, useRef } from 'react';

interface ActionLogProps {
  entries: string[];
  maxEntries?: number;
}

export default function ActionLog({ entries, maxEntries = 50 }: ActionLogProps) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const visible = entries.slice(-maxEntries);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [entries]);

  return (
    <div className="action-log">
      <div className="action-log__header">Action Log</div>
      <div className="action-log__entries">
        {visible.length === 0 && (
          <div className="action-log__empty">No actions yet</div>
        )}
        {visible.map((entry, i) => (
          <div key={i} className="action-log__entry">
            <span className="action-log__entry-idx">{entries.length - visible.length + i + 1}</span>
            <span className="action-log__entry-text">{entry}</span>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
