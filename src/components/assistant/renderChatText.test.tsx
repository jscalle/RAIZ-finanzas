import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { renderChatText } from './renderChatText';

const view = (text: string) =>
  render(<div>{renderChatText(text)}</div>).container;
const html = (text: string) =>
  view(text).innerHTML.replace(/ class="[^"]*"/g, '');

describe('renderChatText', () => {
  it('renders *bold* and _italic_ as the Telegram-style answers used', () => {
    expect(html('Tienes *$1.200.000* libres, _sin tope_.')).toBe(
      '<div><p>Tienes <strong>$1.200.000</strong> libres, <em>sin tope</em>.</p></div>'
    );
  });

  it('renders **bold** and `code`', () => {
    const c = view('Quedaron en `default`: **sin categoría**');
    expect(c.querySelector('code')?.textContent).toBe('default');
    expect(c.querySelector('strong')?.textContent).toBe('sin categoría');
    expect(c.textContent).not.toContain('`');
    expect(c.textContent).not.toContain('**');
  });

  it('turns # headings into bold lines without showing the hash marks', () => {
    const c = view(
      '### 💡 ¿Por qué aparecen como default?\nEn tus registros...'
    );
    expect(c.textContent).not.toContain('#');
    expect(c.querySelector('p.font-bold')?.textContent).toBe(
      '💡 ¿Por qué aparecen como default?'
    );
  });

  it('renders "-", "*" and "•" lines as one bullet list', () => {
    const c = view('Ideas:\n- uno\n* dos\n• **tres**');
    const items = [...c.querySelectorAll('li')];
    expect(items.map((li) => li.textContent)).toEqual(['uno', 'dos', 'tres']);
    expect(c.querySelectorAll('ul')).toHaveLength(1);
    expect(items[2].querySelector('strong')).not.toBeNull();
  });

  it('renders --- as a rule and keeps single line breaks inside a paragraph', () => {
    expect(view('a\n---\nb').querySelector('hr')).not.toBeNull();
    expect(html('uno\ndos')).toBe('<div><p>uno<br>dos</p></div>');
  });

  it('separates paragraphs at blank lines', () => {
    expect(view('uno\n\ndos').querySelectorAll('p')).toHaveLength(2);
  });

  it('never turns text into HTML', () => {
    const c = view('<img src=x onerror=alert(1)> y <b>negrita</b>');
    expect(c.querySelector('img')).toBeNull();
    expect(c.querySelector('b')).toBeNull();
    expect(c.innerHTML).toContain('&lt;img');
  });

  it('leaves underscores and asterisks inside words and arithmetic alone', () => {
    expect(view('topic_comida y 2*3*4').textContent).toBe(
      'topic_comida y 2*3*4'
    );
  });

  it('ignores unclosed markers', () => {
    expect(view('*sin cerrar y _tampoco').textContent).toBe(
      '*sin cerrar y _tampoco'
    );
  });
});
