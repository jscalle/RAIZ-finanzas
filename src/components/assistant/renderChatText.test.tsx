import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { renderChatText } from './renderChatText';

const html = (text: string) =>
  render(<p>{renderChatText(text)}</p>).container.innerHTML;

describe('renderChatText', () => {
  it('renders *bold* and _italic_', () => {
    expect(html('Tienes *$1.200.000* libres, _sin tope_.')).toBe(
      '<p>Tienes <strong>$1.200.000</strong> libres, <em>sin tope</em>.</p>'
    );
  });

  it('keeps line breaks', () => {
    expect(html('uno\ndos')).toBe('<p>uno<br>dos</p>');
  });

  it('never turns text into HTML', () => {
    const out = html('<img src=x onerror=alert(1)> y <b>negrita</b>');
    expect(out).not.toContain('<img');
    expect(out).not.toContain('<b>');
    expect(out).toContain('&lt;img');
  });

  it('leaves underscores and asterisks inside words and arithmetic alone', () => {
    expect(html('topic_comida y 2*3*4')).toBe('<p>topic_comida y 2*3*4</p>');
  });

  it('ignores unclosed markers', () => {
    expect(html('*sin cerrar y _tampoco')).toBe(
      '<p>*sin cerrar y _tampoco</p>'
    );
  });
});
