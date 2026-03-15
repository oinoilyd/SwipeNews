import { useState, useRef, useEffect } from 'react';
import { JARGON, JARGON_TERMS } from '../jargon.js';

// Split a paragraph string into alternating plain-text / jargon-term segments.
function tokenize(text) {
  const lowerText = text.toLowerCase();
  const tokens = [];
  let pos = 0;

  while (pos < text.length) {
    let matched = null;
    let matchStart = -1;

    // Find the earliest jargon term from current position
    for (const term of JARGON_TERMS) {
      const idx = lowerText.indexOf(term, pos);
      if (idx === -1) continue;

      // Only match on word boundaries
      const before = idx === 0 || /\W/.test(lowerText[idx - 1]);
      const after  = idx + term.length >= lowerText.length || /\W/.test(lowerText[idx + term.length]);
      if (!before || !after) continue;

      if (matchStart === -1 || idx < matchStart) {
        matchStart = idx;
        matched    = term;
      }
    }

    if (matched === null) {
      tokens.push({ type: 'text', value: text.slice(pos) });
      break;
    }

    if (matchStart > pos) {
      tokens.push({ type: 'text', value: text.slice(pos, matchStart) });
    }
    tokens.push({ type: 'jargon', term: matched, value: text.slice(matchStart, matchStart + matched.length) });
    pos = matchStart + matched.length;
  }

  return tokens;
}

// Single jargon term with tooltip
function JargonTerm({ term, display }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  // Close on outside click / tap
  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    document.addEventListener('touchstart', handler);
    return () => {
      document.removeEventListener('mousedown', handler);
      document.removeEventListener('touchstart', handler);
    };
  }, [open]);

  return (
    <span className="jargon-wrapper" ref={ref}>
      <span
        className={`jargon-term${open ? ' open' : ''}`}
        onClick={(e) => { e.stopPropagation(); setOpen(o => !o); }}
      >
        {display}
      </span>
      {open && (
        <span className="jargon-tooltip" role="tooltip">
          <strong>{term.charAt(0).toUpperCase() + term.slice(1)}</strong>
          <br />
          {JARGON[term]}
        </span>
      )}
    </span>
  );
}

// Render a paragraph string with jargon terms highlighted
export default function JargonText({ children }) {
  if (typeof children !== 'string') return <>{children}</>;
  const tokens = tokenize(children);

  return (
    <>
      {tokens.map((tok, i) =>
        tok.type === 'jargon'
          ? <JargonTerm key={i} term={tok.term} display={tok.value} />
          : <span key={i}>{tok.value}</span>
      )}
    </>
  );
}
