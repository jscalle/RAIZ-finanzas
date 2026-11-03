import { describe, expect, it } from 'vitest';
import { describeAssistantError } from './assistantErrors';

describe('describeAssistantError', () => {
  it('explains every server error code in plain Spanish', () => {
    expect(describeAssistantError('empty_message')).toContain(
      'Escribe un mensaje'
    );
    expect(describeAssistantError('text_too_long')).toContain('2000');
    expect(describeAssistantError('payload_too_large')).toContain('10 MB');
    expect(describeAssistantError('attachment_too_large')).toContain('10 MB');
    for (const code of [
      'attachment_type_not_allowed',
      'attachment_type_mismatch',
      'attachment_invalid',
    ]) {
      expect(describeAssistantError(code)).toContain('JPG');
    }
    expect(describeAssistantError('media_quota_exceeded')).toContain('hoy');
    for (const code of [
      'not_a_member',
      'space_not_found',
      'invalid_space_id',
    ]) {
      expect(describeAssistantError(code)).toContain('Nube y Compartir');
    }
  });

  it('turns the retry time into whole minutes, at least one', () => {
    expect(describeAssistantError('rate_limited', 60)).toContain('1 min');
    expect(describeAssistantError('rate_limited', 61)).toContain('2 min');
    expect(describeAssistantError('rate_limited', 5)).toContain('1 min');
    expect(describeAssistantError('rate_limited')).toContain('1 min');
  });

  it('falls back to a generic message for unknown or missing codes', () => {
    expect(describeAssistantError('assistant_failed')).toContain(
      'Algo salió mal'
    );
    expect(describeAssistantError(undefined)).toContain('Algo salió mal');
    expect(describeAssistantError('???')).toContain('Algo salió mal');
  });
});
