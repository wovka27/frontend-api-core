import axios, { type AxiosError } from 'axios';

import {
  SdkAuthError,
  SdkCanceledError,
  SdkError,
  type SdkErrorContext,
  SdkForbiddenError,
  SdkNetworkError,
  SdkNotFoundError,
  SdkProjectError,
  SdkRateLimitError,
  SdkServerError,
  SdkTimeoutError,
} from '@/core';
import { extractErrorMessage, isApiErrorPayload } from '@/core/type-guards';

import { keysToCamel } from '@/shared/utils/case-converter';

export class HttpErrorParser {
  public static async parse(error: unknown, convertCase = false): Promise<SdkError> {
    if (axios.isCancel(error)) {
      const message = error instanceof Error ? error.message : 'Request was canceled';

      if (error instanceof Error && 'cause' in error && error.cause instanceof SdkAuthError) return error.cause;

      return new SdkCanceledError(message, { originalError: error });
    }

    if (!axios.isAxiosError(error)) {
      if (error instanceof SdkError) return error;
      return new SdkServerError(error instanceof Error ? error.message : 'Unknown runtime error', {
        originalError: error,
      });
    }

    return this.fromAxiosError(error, convertCase);
  }

  private static async fromAxiosError(error: AxiosError, convertCase: boolean): Promise<SdkError> {
    const { response, config, code } = error;

    const requestIdHeader = response?.headers?.['x-request-id'] ?? response?.headers?.['traceparent'];
    const requestId = typeof requestIdHeader === 'string' ? requestIdHeader : undefined;

    const context: SdkErrorContext = {
      statusCode: response?.status,
      requestId,
      url: config?.url,
      method: config?.method?.toUpperCase(),
      originalError: error,
    };

    if (!response) {
      if (code === 'ECONNABORTED' || error.message.toLowerCase().includes('timeout')) {
        return new SdkTimeoutError('Request timeout exceeded', context);
      }
      return new SdkNetworkError(error.message || 'Network connection failed', context);
    }

    let rawData: unknown = response.data;
    if (rawData instanceof Blob) {
      try {
        const text = await rawData.text();
        rawData = JSON.parse(text);
      } catch {
        /* empty */
      }
    }

    if (typeof rawData === 'string') {
      try {
        rawData = JSON.parse(rawData);
      } catch {
        /* empty */
      }
    }

    const data: unknown = convertCase && rawData && typeof rawData === 'object' ? keysToCamel(rawData) : rawData;
    context.rawPayload = data;

    const status = response.status;
    const extractedMessage = extractErrorMessage(data);

    if (status === 401) return new SdkAuthError(extractedMessage ?? 'Unauthorized', context, data);

    if (status >= 500) {
      const isHtml = typeof data === 'string' && (data.includes('<html') || data.includes('<!DOCTYPE'));

      const serverMessage = isHtml
        ? `Server Error (${status}): Service temporarily unavailable`
        : (extractedMessage ?? `Server error with status code ${status}`);

      return new SdkServerError(serverMessage, context, isHtml);
    }

    if (isApiErrorPayload(data)) return new SdkProjectError(data, context);

    switch (status) {
      case 403:
        return new SdkForbiddenError(extractedMessage ?? 'Forbidden', context);
      case 404:
        return new SdkNotFoundError(extractedMessage ?? 'Not Found', context);
      case 429: {
        const retryHeader = response.headers?.['retry-after'];
        const retrySeconds = typeof retryHeader === 'string' ? parseInt(retryHeader, 10) : undefined;
        return new SdkRateLimitError(
          extractedMessage ?? 'Too many requests',
          Number.isNaN(retrySeconds) ? undefined : retrySeconds,
          context
        );
      }
      default:
        return new SdkServerError(extractedMessage ?? `HTTP Request failed with status ${status}`, context);
    }
  }
}
