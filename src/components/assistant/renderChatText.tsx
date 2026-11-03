import type { ReactNode } from 'react';

// The assistant answers with light Markdown: headings, **bold**, *bold* (the old Telegram
// style), _italic_, `code`, "- " bullet lists and "---" rules. This renders those as React
// elements, never as HTML, keeps line breaks, and leaves anything else (tags included) as
// plain text.
const INLINE =
  /`([^`\n]+)`|\*\*([^*\n]+)\*\*|(?<![\w*])\*([^*\n]+)\*(?![\w*])|(?<!\w)_([^_\n]+)_(?!\w)/g;

function renderInline(line: string, keyPrefix: string): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  for (const m of line.matchAll(INLINE)) {
    const start = m.index ?? 0;
    if (start > last) out.push(line.slice(last, start));
    const key = `${keyPrefix}-${start}`;
    if (m[1] !== undefined) {
      out.push(
        <code key={key} className="rounded bg-muted px-1 py-0.5 text-[0.9em]">
          {m[1]}
        </code>
      );
    } else if (m[2] !== undefined || m[3] !== undefined) {
      out.push(<strong key={key}>{m[2] ?? m[3]}</strong>);
    } else {
      out.push(<em key={key}>{m[4]}</em>);
    }
    last = start + m[0].length;
  }
  if (last < line.length) out.push(line.slice(last));
  return out;
}

type Block =
  | { type: 'p'; lines: string[] }
  | { type: 'h'; text: string }
  | { type: 'ul'; items: string[] }
  | { type: 'hr' };

function toBlocks(text: string): Block[] {
  const blocks: Block[] = [];
  for (const raw of text.split('\n')) {
    const line = raw.trimEnd();
    const last = blocks[blocks.length - 1];
    const heading = line.match(/^#{1,6}\s+(.*)$/);
    const bullet = line.match(/^\s*(?:[-*•])\s+(.*)$/);
    if (!line.trim()) {
      // A blank line ends the current paragraph or list.
      if (last && last.type === 'p') blocks.push({ type: 'p', lines: [] });
      continue;
    }
    if (/^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
      blocks.push({ type: 'hr' });
    } else if (heading) {
      blocks.push({ type: 'h', text: heading[1] });
    } else if (bullet) {
      if (last && last.type === 'ul') last.items.push(bullet[1]);
      else blocks.push({ type: 'ul', items: [bullet[1]] });
    } else if (last && last.type === 'p') {
      last.lines.push(line);
    } else {
      blocks.push({ type: 'p', lines: [line] });
    }
  }
  return blocks.filter((b) => b.type !== 'p' || b.lines.length > 0);
}

export function renderChatText(text: string): ReactNode[] {
  return toBlocks(text).map((block, i) => {
    const key = `b${i}`;
    switch (block.type) {
      case 'h':
        return (
          <p key={key} className="mt-3 font-bold first:mt-0">
            {renderInline(block.text, key)}
          </p>
        );
      case 'hr':
        return <hr key={key} className="my-3 border-border" />;
      case 'ul':
        return (
          <ul key={key} className="mt-2 list-disc space-y-1 pl-5 first:mt-0">
            {block.items.map((item, j) => (
              <li key={j}>{renderInline(item, `${key}-${j}`)}</li>
            ))}
          </ul>
        );
      default:
        return (
          <p key={key} className="mt-2 first:mt-0">
            {block.lines.flatMap((line, j) =>
              j < block.lines.length - 1
                ? [...renderInline(line, `${key}-${j}`), <br key={`br${j}`} />]
                : renderInline(line, `${key}-${j}`)
            )}
          </p>
        );
    }
  });
}
