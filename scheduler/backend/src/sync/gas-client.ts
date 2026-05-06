import type {
  GasFetchEventsResponse,
  GasMutationsRequest,
  GasMutationsResponse,
} from './types.js';

export class GasClientError extends Error {
  constructor(public status: number, public body: string, message: string) {
    super(message);
    this.name = 'GasClientError';
  }
}

function getEndpoint(): string {
  const url = process.env.GAS_WEBAPP_URL;
  if (!url) throw new Error('GAS_WEBAPP_URL is not set');
  return url;
}

const TIMEOUT_MS = 300_000;

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  ms: number
): Promise<Response> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: ctl.signal });
  } finally {
    clearTimeout(timer);
  }
}

export async function postMutations(
  payload: GasMutationsRequest
): Promise<GasMutationsResponse> {
  const res = await fetchWithTimeout(
    getEndpoint(),
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      redirect: 'follow',
    },
    TIMEOUT_MS
  );
  const text = await res.text();
  if (!res.ok) {
    throw new GasClientError(res.status, text, `GAS mutations failed: ${res.status}`);
  }
  try {
    return JSON.parse(text) as GasMutationsResponse;
  } catch {
    throw new GasClientError(res.status, text, 'GAS returned non-JSON body');
  }
}

export async function fetchCalendarEvents(): Promise<GasFetchEventsResponse> {
  const url = `${getEndpoint()}?action=events`;
  const res = await fetchWithTimeout(
    url,
    { method: 'GET', redirect: 'follow' },
    TIMEOUT_MS
  );
  const text = await res.text();
  if (!res.ok) {
    throw new GasClientError(res.status, text, `GAS fetch failed: ${res.status}`);
  }
  try {
    return JSON.parse(text) as GasFetchEventsResponse;
  } catch {
    throw new GasClientError(res.status, text, 'GAS returned non-JSON body');
  }
}
