import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fetchRecentBankEmails, parseEmailMovement } from './gmail';

/**
 * Builds a minimal Response-like stub compatible with the code under test.
 * Only the members actually consumed by gmail.ts are implemented.
 */
function makeResponse(
  ok: boolean,
  status: number,
  jsonBody: unknown
): Response {
  return {
    ok,
    status,
    json: async () => jsonBody,
  } as unknown as Response;
}

/** Encodes a UTF-8 string as base64url, as Gmail returns message bodies. */
function toBase64Url(input: string): string {
  const base64 = Buffer.from(input, 'utf-8').toString('base64');
  return base64.replace(/\+/g, '-').replace(/\//g, '_');
}

describe('gmail', () => {
  const TOKEN = 'test-access-token';
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('fetchRecentBankEmails', () => {
    it('should throw UNAUTHORIZED_GMAIL_TOKEN on a 401 list response', async () => {
      fetchMock.mockResolvedValueOnce(makeResponse(false, 401, {}));

      await expect(fetchRecentBankEmails(TOKEN)).rejects.toThrow(
        'UNAUTHORIZED_GMAIL_TOKEN'
      );
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('should throw a descriptive error on a non-401 error status', async () => {
      fetchMock.mockResolvedValueOnce(
        makeResponse(false, 500, { error: { message: 'Backend failure' } })
      );

      await expect(fetchRecentBankEmails(TOKEN)).rejects.toThrow(
        'Gmail API returned status 500: Backend failure'
      );
    });

    it('should fall back to a generic status message when the error body has no message', async () => {
      fetchMock.mockResolvedValueOnce(makeResponse(false, 503, {}));

      await expect(fetchRecentBankEmails(TOKEN)).rejects.toThrow(
        'Gmail API returned status 503: Status 503'
      );
    });

    it('should return an empty array when there are no messages', async () => {
      fetchMock.mockResolvedValueOnce(
        makeResponse(true, 200, { messages: [] })
      );

      const result = await fetchRecentBankEmails(TOKEN);
      expect(result).toEqual([]);
      // Only the list call happens; no detail fetches.
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('should return an empty array when the messages field is missing', async () => {
      fetchMock.mockResolvedValueOnce(makeResponse(true, 200, {}));

      const result = await fetchRecentBankEmails(TOKEN);
      expect(result).toEqual([]);
    });

    it('should send the bearer token and URL-encode the query on the list request', async () => {
      fetchMock.mockResolvedValueOnce(
        makeResponse(true, 200, { messages: [] })
      );

      await fetchRecentBankEmails(TOKEN, 'subject:test space');

      const [url, options] = fetchMock.mock.calls[0];
      expect(url).toContain('q=subject%3Atest%20space');
      expect(url).toContain('maxResults=10');
      expect(options.headers.Authorization).toBe(`Bearer ${TOKEN}`);
    });

    it('should fetch message details in parallel and decode a base64url text/plain body', async () => {
      const decodedBody = 'Compra aprobada por $50.000 en tienda';
      fetchMock
        .mockResolvedValueOnce(
          makeResponse(true, 200, {
            messages: [
              { id: 'm1', threadId: 't1' },
              { id: 'm2', threadId: 't2' },
            ],
          })
        )
        .mockResolvedValueOnce(
          makeResponse(true, 200, {
            snippet: 'snippet-1',
            payload: {
              headers: [
                { name: 'Subject', value: 'Bancolombia: compra' },
                { name: 'From', value: 'alerts@bancolombia.com' },
                { name: 'Date', value: 'Mon, 01 Jan 2024 10:00:00 -0500' },
              ],
              parts: [
                {
                  mimeType: 'text/plain',
                  body: { data: toBase64Url(decodedBody) },
                },
              ],
            },
          })
        )
        .mockResolvedValueOnce(
          makeResponse(true, 200, {
            snippet: 'snippet-2',
            payload: { headers: [] },
          })
        );

      const result = await fetchRecentBankEmails(TOKEN);

      expect(fetchMock).toHaveBeenCalledTimes(3);
      expect(result).toHaveLength(2);

      const first = result.find((m) => m.id === 'm1')!;
      expect(first.subject).toBe('Bancolombia: compra');
      expect(first.from).toBe('alerts@bancolombia.com');
      expect(first.date).toBe('Mon, 01 Jan 2024 10:00:00 -0500');
      expect(first.body).toBe(decodedBody);
    });

    it('should apply Spanish default headers when subject/from/date are missing', async () => {
      fetchMock
        .mockResolvedValueOnce(
          makeResponse(true, 200, { messages: [{ id: 'm1', threadId: 't1' }] })
        )
        .mockResolvedValueOnce(
          makeResponse(true, 200, {
            snippet: 'only snippet',
            payload: { headers: [] },
          })
        );

      const [msg] = await fetchRecentBankEmails(TOKEN);
      expect(msg.subject).toBe('Sin Asunto');
      expect(msg.from).toBe('Desconocido');
      expect(msg.date).toBe('');
      // Body falls back to snippet when no text/plain part is present.
      expect(msg.body).toBe('only snippet');
    });

    it('should drop messages whose detail fetch fails but keep the successful ones', async () => {
      fetchMock
        .mockResolvedValueOnce(
          makeResponse(true, 200, {
            messages: [
              { id: 'ok', threadId: 't1' },
              { id: 'bad', threadId: 't2' },
            ],
          })
        )
        .mockResolvedValueOnce(
          makeResponse(true, 200, {
            snippet: 'good',
            payload: { headers: [] },
          })
        )
        .mockResolvedValueOnce(makeResponse(false, 404, {}));

      const result = await fetchRecentBankEmails(TOKEN);
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('ok');
    });

    it('should skip a message when its detail request rejects', async () => {
      fetchMock
        .mockResolvedValueOnce(
          makeResponse(true, 200, { messages: [{ id: 'm1', threadId: 't1' }] })
        )
        .mockRejectedValueOnce(new Error('network down'));

      const result = await fetchRecentBankEmails(TOKEN);
      expect(result).toEqual([]);
    });
  });

  describe('parseEmailMovement', () => {
    it('should return the parsed data on a successful envelope', async () => {
      const parsed = { amount: 50000, category: 'Comida' };
      fetchMock.mockResolvedValueOnce(
        makeResponse(true, 200, { success: true, data: parsed })
      );

      const result = await parseEmailMovement('email body', ['Comida']);
      expect(result).toEqual(parsed);

      const [url, options] = fetchMock.mock.calls[0];
      expect(url).toBe('/api/parse-movement');
      expect(options.method).toBe('POST');
      expect(JSON.parse(options.body)).toEqual({
        text: 'email body',
        existingCategories: ['Comida'],
      });
    });

    it('should throw a service error when the response is not ok', async () => {
      fetchMock.mockResolvedValueOnce(makeResponse(false, 502, {}));

      await expect(parseEmailMovement('body', [])).rejects.toThrow(
        'Failed to contact transaction parsing service.'
      );
    });

    it('should throw the server-provided error on an unsuccessful envelope', async () => {
      fetchMock.mockResolvedValueOnce(
        makeResponse(true, 200, { success: false, error: 'No movement found' })
      );

      await expect(parseEmailMovement('body', [])).rejects.toThrow(
        'No movement found'
      );
    });

    it('should throw a default error when the failure envelope omits an error field', async () => {
      fetchMock.mockResolvedValueOnce(
        makeResponse(true, 200, { success: false })
      );

      await expect(parseEmailMovement('body', [])).rejects.toThrow(
        'Failed to parse email movement.'
      );
    });

    it('should attach a Bearer Authorization header when an idToken is provided', async () => {
      fetchMock.mockResolvedValueOnce(
        makeResponse(true, 200, { success: true, data: {} })
      );

      await parseEmailMovement('body', [], 'id-token-123');

      const [, options] = fetchMock.mock.calls[0];
      expect(options.headers.Authorization).toBe('Bearer id-token-123');
    });

    it('should not set an Authorization header when no idToken is provided', async () => {
      fetchMock.mockResolvedValueOnce(
        makeResponse(true, 200, { success: true, data: {} })
      );

      await parseEmailMovement('body', []);

      const [, options] = fetchMock.mock.calls[0];
      expect(options.headers.Authorization).toBeUndefined();
    });
  });
});
