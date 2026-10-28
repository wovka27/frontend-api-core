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
import { ERROR_MESSAGES } from '@/core/error-messages';
import { extractErrorMessage, isApiErrorPayload } from '@/core/type-guards';

import { keysToCamel } from '@/shared/utils/case-converter';

export class HttpErrorParser {
  public static async parse(error: unknown, convertCase = false): Promise<SdkError> {
    if (axios.isCancel(error)) {
      const message = error instanceof Error ? error.message : ERROR_MESSAGES.requestCanceled;

      if (error instanceof Error && 'cause' in error && error.cause instanceof SdkAuthError) return error.cause;

      return new SdkCanceledError(message, { originalError: error });
    }

    if (!axios.isAxiosError(error)) {
      if (error instanceof SdkError) return error;
      return new SdkServerError(error instanceof Error ? error.message : ERROR_MESSAGES.unknownRuntimeError, {
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
        return new SdkTimeoutError(ERROR_MESSAGES.requestTimeout, context);
      }
      return new SdkNetworkError(error.message || ERROR_MESSAGES.networkConnectionFailed, context);
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

    if (status === 401) return new SdkAuthError(extractedMessage ?? ERROR_MESSAGES.unauthorized, context, data);

    if (status >= 500) {
      const isHtml = typeof data === 'string' && (data.includes('<html') || data.includes('<!DOCTYPE'));

      const serverMessage = isHtml
        ? ERROR_MESSAGES.serverTemporarilyUnavailable(status)
        : (extractedMessage ?? ERROR_MESSAGES.serverErrorStatus(status));

      return new SdkServerError(serverMessage, context, isHtml);
    }

    if (isApiErrorPayload(data)) return new SdkProjectError(data, context);

    switch (status) {
      case 403:
        return new SdkForbiddenError(extractedMessage ?? ERROR_MESSAGES.forbiddenResponse, context);
      case 404:
        return new SdkNotFoundError(extractedMessage ?? ERROR_MESSAGES.notFoundResponse, context);
      case 429: {
        const retryHeader = response.headers?.['retry-after'];
        const retrySeconds = this.parseRetryAfter(retryHeader);
        return new SdkRateLimitError(extractedMessage ?? ERROR_MESSAGES.tooManyRequests, retrySeconds, context);
      }
      default:
        return new SdkServerError(extractedMessage ?? ERROR_MESSAGES.httpRequestFailed(status), context);
    }
  }

  private static parseRetryAfter(value: unknown): number | undefined {
    if (typeof value !== 'string' || value.trim() === '') return undefined;

    const trimmed = value.trim();
    if (/^\d+(?:\.\d+)?$/.test(trimmed)) return Number(trimmed);

    const retryAt = Date.parse(trimmed);
    if (Number.isNaN(retryAt)) return undefined;

    return Math.max(0, Math.ceil((retryAt - Date.now()) / 1000));
  }
}
