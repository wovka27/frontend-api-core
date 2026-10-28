import { ERROR_MESSAGES } from '@/core/error-messages';
import type { ApiErrorPayload, SdkErrorContext } from '@/core/types';

export abstract class SdkError extends Error {
  public readonly statusCode?: number;
  public readonly requestId?: string;
  public readonly context?: SdkErrorContext;

  protected constructor(message: string, context?: SdkErrorContext) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = context?.statusCode;
    this.requestId = context?.requestId;
    this.context = context;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class SdkNetworkError extends SdkError {
  constructor(message: string = ERROR_MESSAGES.networkError, context?: SdkErrorContext) {
    super(message, context);
  }
}

export class SdkTimeoutError extends SdkNetworkError {
  constructor(message: string = ERROR_MESSAGES.requestTimeout, context?: SdkErrorContext) {
    super(message, context);
  }
}

export class SdkCanceledError extends SdkError {
  constructor(message: string = ERROR_MESSAGES.requestCanceled, context?: SdkErrorContext) {
    super(message, context);
  }
}

export class SdkServerError extends SdkError {
  public readonly isHtmlResponse: boolean;

  constructor(message: string, context?: SdkErrorContext, isHtml = false) {
    super(message, context);
    this.isHtmlResponse = isHtml;
  }
}

export class SdkAuthError<TPayload = unknown> extends SdkError {
  public readonly payload?: TPayload;

  constructor(message: string = ERROR_MESSAGES.authSessionInvalid, context?: SdkErrorContext, payload?: TPayload) {
    super(message, { ...context, statusCode: 401 });
    this.payload = payload;
  }
}

export class SdkForbiddenError extends SdkError {
  constructor(message: string = ERROR_MESSAGES.forbidden, context?: SdkErrorContext) {
    super(message, context);
  }
}

export class SdkNotFoundError extends SdkError {
  constructor(message: string = ERROR_MESSAGES.resourceNotFound, context?: SdkErrorContext) {
    super(message, context);
  }
}

export class SdkRateLimitError extends SdkError {
  public readonly retryAfterSeconds?: number;

  constructor(message: string = ERROR_MESSAGES.tooManyRequests, retryAfter?: number, context?: SdkErrorContext) {
    super(message, context);
    this.retryAfterSeconds = retryAfter;
  }
}

export class SdkProjectError<
  TPayload extends { code: number | string; error: string; message: string } = ApiErrorPayload,
> extends SdkError {
  public readonly payload: TPayload;

  constructor(payload: TPayload, context: SdkErrorContext) {
    super(payload.message || ERROR_MESSAGES.projectError(payload.code), context);
    this.payload = payload;
  }

  public get code(): TPayload['code'] {
    return this.payload.code;
  }
}
