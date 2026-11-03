import { describe, expect, it } from 'vitest';
import { AVAILABLE_ICONS } from './components/iconRegistry';
import { starterTopics } from './starterTopics';

describe('starterTopics', () => {
  it('has unique ids and names and covers income, expense and savings', () => {
    expect(new Set(starterTopics.map((t) => t.id)).size).toBe(
      starterTopics.length
    );
    expect(new Set(starterTopics.map((t) => t.name)).size).toBe(
      starterTopics.length
    );
    expect(starterTopics.some((t) => t.type === 'INCOME')).toBe(true);
    expect(starterTopics.some((t) => t.type === 'EXPENSE')).toBe(true);
    expect(starterTopics.some((t) => t.type === 'SAVINGS')).toBe(true);
  });

  it('includes the two ids the app logic depends on, with the right types', () => {
    expect(
      starterTopics.find((t) => t.id === 'topic_1787580821277')
    ).toMatchObject({ type: 'EXPENSE', icon: 'CreditCard' });
    expect(starterTopics.find((t) => t.id === 'topic_ahorros')).toMatchObject({
      type: 'SAVINGS',
      icon: 'PiggyBank',
    });
  });

  it('only uses icons the app can draw and sets no spending limits', () => {
    for (const t of starterTopics) {
      expect(AVAILABLE_ICONS).toContain(t.icon);
      expect(t.color).toBeTruthy();
      expect(t.monthlyLimit).toBeUndefined();
    }
  });
});
