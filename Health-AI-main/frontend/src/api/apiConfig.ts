/**
 * apiConfig.ts — Centralized Frontend API Configuration & Client Module
 * ======================================================================
 * Phase 2: Reliability, Integration & Data Privacy
 *
 * Provides:
 *  - Configurable API Base URL via VITE_API_BASE_URL (fallback to VITE_API_URL or same-origin '')
 *  - URL builder ensuring consistent endpoint routing without hardcoded localhost
 *  - Robust apiFetch with automatic authorization header injection, request timeouts,
 *    and structured network error reporting.
 */

export interface ApiFetchOptions extends RequestInit {
  timeoutMs?: number;
  skipAuth?: boolean;
}

/**
 * Returns the normalized API base URL.
 * Defaults to empty string ('') which allows relative paths ('/api/...')
 * to leverage the Vite dev proxy or production reverse proxy (e.g. NGINX).
 */
export function getApiBaseUrl(): string {
  const envUrl =
    (import.meta as any).env?.VITE_API_BASE_URL ??
    (import.meta as any).env?.VITE_API_URL ??
    '';
  return envUrl ? String(envUrl).trim().replace(/\/+$/, '') : '';
}

/**
 * Constructs an absolute or proxy-relative URL for an API endpoint.
 *
 * Examples:
 *   apiUrl('/api/patients') -> '/api/patients' (when VITE_API_BASE_URL is not set)
 *   apiUrl('/api/patients') -> 'https://api.example.com/api/patients' (when VITE_API_BASE_URL is set)
 */
export function apiUrl(path: string): string {
  const base = getApiBaseUrl();
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  return base ? `${base}${cleanPath}` : cleanPath;
}

/**
 * Enhanced fetch wrapper with:
 *  - Configurable timeout (default: 15,000ms)
 *  - Automatic JWT bearer injection from 'rapidcheck_token'
 *  - Standard headers
 */
export async function apiFetch(
  path: string,
  options: ApiFetchOptions = {}
): Promise<Response> {
  const { timeoutMs = 15000, skipAuth = false, headers, ...rest } = options;
  const url = apiUrl(path);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  // If a custom signal was passed, chain its abort
  if (rest.signal) {
    rest.signal.addEventListener('abort', () => controller.abort());
  }

  const mergedHeaders: Record<string, string> = {};

  // Auto-inject JWT token if available
  if (!skipAuth) {
    try {
      const token = localStorage.getItem('rapidcheck_token');
      if (token) {
        mergedHeaders['Authorization'] = `Bearer ${token}`;
      }
    } catch {
      // localStorage may be restricted in private browsing
    }
  }

  // Preserve provided headers
  if (headers) {
    if (headers instanceof Headers) {
      headers.forEach((val, key) => {
        mergedHeaders[key] = val;
      });
    } else if (Array.isArray(headers)) {
      headers.forEach(([key, val]) => {
        mergedHeaders[key] = val;
      });
    } else {
      Object.assign(mergedHeaders, headers);
    }
  }

  // Set Content-Type for JSON payloads if not already set and body is string
  if (rest.body && typeof rest.body === 'string' && !mergedHeaders['Content-Type']) {
    mergedHeaders['Content-Type'] = 'application/json';
  }

  try {
    const response = await fetch(url, {
      ...rest,
      headers: mergedHeaders,
      signal: controller.signal,
    });
    return response;
  } catch (error: any) {
    if (error?.name === 'AbortError') {
      throw new Error(`Request to ${url} timed out after ${timeoutMs}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}
