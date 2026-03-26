import { useState, useRef, useEffect } from 'react';
import { JARGON, JARGON_TERMS } from '../jargon.js';

// Split a paragraph string into alternating plain-text / jargon-term segments.
// maxTerms caps how many jargon highlights appear (default 3).
function tokenize(text, maxTerms = 3) {
  const lowerText = text.toLowerCase();
  const tokens = [];
  let pos = 0;
  let jargonCount = 0;

  while (pos < text.length) {
    // Once we've hit the cap, dump the rest as plain text
    if (jargonCount >= maxTerms) {
      tokens.push({ type: 'text', value: text.slice(pos) });
      break;
    }

    let matched = null;
    let matchStart = -1;

    for (const term of JARGON_TERMS) {
      const idx = lowerText.indexOf(term, pos);
      if (idx === -1) continue;

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
    jargonCount++;
    pos = matchStart + matched.length;
  }

  return tokens;
}

// Single jargon term with smart-positioned tooltip
function JargonTerm({ term, display }) {
  const [open, setOpen]       = useState(false);
  const [offset, setOffset]   = useState(0);   // px correction to keep tooltip on-screen
  const wrapperRef = useRef(null);
  const tooltipRef = useRef(null);

  // Close on outside tap/click
  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    document.addEventListener('touchstart', handler, { passive: true });
    return () => {
      document.removeEventListener('mousedown', handler);
      document.removeEventListener('touchstart', handler);
    };
  }, [open]);

  // After tooltip renders, clamp it within the viewport with 12px margin
  useEffect(() => {
    if (!open || !tooltipRef.current) return;
    const rect   = tooltipRef.current.getBoundingClientRect();
    const margin = 12;
    let shift = 0;
    if (rect.left < margin)                      shift = margin - rect.left;
    else if (rect.right > window.innerWidth - margin) shift = (window.innerWidth - margin) - rect.right;
    setOffset(shift);
  }, [open]);

  // Reset offset when closing
  const handleToggle = (e) => {
    e.stopPropagation();
    setOffset(0);
    setOpen(o => !o);
  };

  return (
    <span className="jargon-wrapper" ref={wrapperRef}>
      <span
        className={`jargon-term${open ? ' open' : ''}`}
        onClick={handleToggle}
        onTouchEnd={(e) => { e.preventDefault(); handleToggle(e); }}
      >
        {display}
      </span>
      {open && (
        <span
          className="jargon-tooltip"
          ref={tooltipRef}
          role="tooltip"
          style={{ transform: `translateX(calc(-50% + ${offset}px))` }}
        >
          <span className="jargon-tooltip-term">
            {term.charAt(0).toUpperCase() + term.slice(1)}
          </span>
          <span className="jargon-tooltip-def">{JARGON[term]}</span>
        </span>
      )}
    </span>
  );
}

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
