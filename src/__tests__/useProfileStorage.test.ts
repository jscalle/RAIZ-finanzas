import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useProfileStorage } from '../hooks/useProfileStorage';

describe('useProfileStorage', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('should initialize profile storage with default values', () => {
    const { result } = renderHook(() =>
      useProfileStorage('test_profile', false)
    );

    expect(result.current.topics.length).toBeGreaterThan(0);
    expect(result.current.startingSavings).toBe(1000);
  });

  it('should update starting savings', () => {
    const { result } = renderHook(() =>
      useProfileStorage('test_profile', false)
    );

    act(() => {
      result.current.setStartingSavings(500000);
    });

    expect(result.current.startingSavings).toBe(500000);
  });
});
