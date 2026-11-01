import { ParsedMovement } from '../types';

export interface GmailMessageItem {
  id: string;
  threadId: string;
}

export interface GmailMessageDetails {
  id: string;
  snippet: string;
  subject: string;
  from: string;
  date: string;
  body: string;
}

// Search recent Gmail messages with expense/bank keyword filters
export const fetchRecentBankEmails = async (
  accessToken: string,
  query = "subject:(Bancolombia OR Nequi OR Davivienda OR Daviplata OR Wompi OR PSE OR 'Mercado Pago' OR PayU OR Bold OR Nubank OR 'Banco de Bogota' OR BBVA OR Falabella OR Lulo OR RappiPay OR 'pago' OR 'compra' OR 'transferencia' OR 'abono' OR 'nómina' OR 'retiro' OR 'débito' OR 'crédito' OR 'transacción') OR from:(bancolombia.com OR nequi.com.co OR davivienda.com OR daviplata.com OR wompi.com OR wompi.co OR pse.com.co OR mercadopago.com OR payulatam.com OR bold.co OR nubank.com.co OR lulobank.com OR rappi.com)"
): Promise<GmailMessageDetails[]> => {
  try {
    const listUrl = `https://www.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(query)}&maxResults=10`;
    const res = await fetch(listUrl, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/json',
      },
    });

    if (!res.ok) {
      if (res.status === 401) {
        throw new Error('UNAUTHORIZED_GMAIL_TOKEN');
      }
      const errBody = await res.json().catch(() => ({}));
      const apiMsg =
        errBody?.error?.message ||
        errBody?.error?.status ||
        `Status ${res.status}`;
      console.error('Gmail API Error Details:', errBody);
      throw new Error(`Gmail API returned status ${res.status}: ${apiMsg}`);
    }

    const data = await res.json();
    const messages: GmailMessageItem[] = data.messages || [];

    if (messages.length === 0) {
      return [];
    }

    // Fetch details in parallel
    const detailPromises = messages.map(async (msg) => {
      try {
        const detailUrl = `https://www.googleapis.com/gmail/v1/users/me/messages/${msg.id}`;
        const detailRes = await fetch(detailUrl, {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        });

        if (!detailRes.ok) return null;

        const detailData = await detailRes.json();

        // Extract headers
        const headers: { name?: string; value: string }[] =
          detailData.payload?.headers || [];
        const subjectHeader = headers.find(
          (h) => h.name?.toLowerCase() === 'subject'
        );
        const fromHeader = headers.find(
          (h) => h.name?.toLowerCase() === 'from'
        );
        const dateHeader = headers.find(
          (h) => h.name?.toLowerCase() === 'date'
        );

        const subject = subjectHeader ? subjectHeader.value : 'Sin Asunto';
        const from = fromHeader ? fromHeader.value : 'Desconocido';
        const dateVal = dateHeader ? dateHeader.value : '';

        // Extract body text if available, fallback to snippet
        let bodyText = '';
        if (detailData.payload?.parts) {
          // Simple body finder from parts
          const textPart = detailData.payload.parts.find(
            (p: { mimeType?: string; body?: { data?: string } }) =>
              p.mimeType === 'text/plain'
          );
          if (textPart && textPart.body?.data) {
            // Base64 decode
            try {
              const decoded = atob(
                textPart.body.data.replace(/-/g, '+').replace(/_/g, '/')
              );
              bodyText = decoded;
            } catch {
              bodyText = '';
            }
          }
        }

        return {
          id: msg.id,
          snippet: detailData.snippet || '',
          subject,
          from,
          date: dateVal,
          body: bodyText || detailData.snippet || '',
        } as GmailMessageDetails;
      } catch (err) {
        console.error(`Error fetching Gmail message ${msg.id}:`, err);
        return null;
      }
    });

    const detailedMessages = await Promise.all(detailPromises);
    return detailedMessages.filter((m): m is GmailMessageDetails => m !== null);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    if (msg !== 'UNAUTHORIZED_GMAIL_TOKEN') {
      console.error('Error in fetchRecentBankEmails:', msg);
    }
    throw error;
  }
};

// AI Parsing request proxy to our local node server
export const parseEmailMovement = async (
  emailText: string,
  existingCategories: string[],
  idToken?: string | null
): Promise<ParsedMovement> => {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (idToken) {
    headers.Authorization = 'Bearer ' + idToken;
  }
  const res = await fetch('/api/parse-movement', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      text: emailText,
      existingCategories,
    }),
  });

  if (!res.ok) {
    throw new Error('Failed to contact transaction parsing service.');
  }

  const data = await res.json();
  if (data.success) {
    return data.data as ParsedMovement;
  } else {
    throw new Error(data.error || 'Failed to parse email movement.');
  }
};
