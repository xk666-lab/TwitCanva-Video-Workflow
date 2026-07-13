export const readErrorMessage = async (response: Response): Promise<string> => {
  const fallback = `${response.status} ${response.statusText}`.trim();
  const text = await response.text().catch(() => '');
  if (!text) return fallback || 'Request failed';

  try {
    const data = JSON.parse(text);
    return data.error || data.message || data.details || fallback || text;
  } catch {
    return text || fallback || 'Request failed';
  }
};

const normalizeNetworkError = (error: unknown): Error => {
  const message = error instanceof Error ? error.message : String(error);
  if (/failed to fetch|networkerror|load failed/i.test(message)) {
    return new Error('Unable to reach the local backend. Check that the backend on port 3001 is still running.');
  }
  return error instanceof Error ? error : new Error(message);
};

async function apiRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  try {
    const response = await fetch(path, options);
    if (!response.ok) {
      throw new Error(await readErrorMessage(response));
    }

    if (response.status === 204) {
      return undefined as T;
    }

    return await response.json() as T;
  } catch (error) {
    throw normalizeNetworkError(error);
  }
}

export function apiGet<T>(path: string): Promise<T> {
  return apiRequest<T>(path);
}

export function apiPost<T>(path: string, body?: unknown, init: RequestInit = {}): Promise<T> {
  return apiRequest<T>(path, {
    ...init,
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...init.headers },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
}

export function apiPut<T>(path: string, body?: unknown, init: RequestInit = {}): Promise<T> {
  return apiRequest<T>(path, {
    ...init,
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...init.headers },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
}

export function apiDelete<T>(path: string, body?: unknown, init: RequestInit = {}): Promise<T> {
  return apiRequest<T>(path, {
    ...init,
    method: 'DELETE',
    headers: body === undefined ? init.headers : { 'Content-Type': 'application/json', ...init.headers },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
}
