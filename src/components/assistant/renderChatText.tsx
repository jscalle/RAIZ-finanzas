import type { ReactNode } from 'react';

// The assistant answers with the light Markdown the Telegram bot used: *bold* and _italic_.
// This renders just those two as React elements (never as HTML), keeps line breaks, and
// leaves anything else, including tags, as plain text.
const TOKEN = /(?<![\w*])\*([^*\n]+)\*(?![\w*])|(?<!\w)_([^_\n]+)_(?!\w)/g;

function renderLine(line: string, keyPrefix: string): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  for (const m of line.matchAll(TOKEN)) {
    const start = m.index ?? 0;
    if (start > last) out.push(line.slice(last, start));
    out.push(
      m[1] !== undefined ? (
        <strong key={`${keyPrefix}-${start}`}>{m[1]}</strong>
      ) : (
        <em key={`${keyPrefix}-${start}`}>{m[2]}</em>
      )
    );
    last = start + m[0].length;
  }
  if (last < line.length) out.push(line.slice(last));
  return out;
}

export function renderChatText(text: string): ReactNode[] {
  return text.split('\n').flatMap((line, i, all) => {
    const nodes = renderLine(line, `l${i}`);
    return i < all.length - 1 ? [...nodes, <br key={`br${i}`} />] : nodes;
  });
}
