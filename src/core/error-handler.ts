import {
  SdkAuthError,
  SdkCanceledError,
  type SdkError,
  SdkForbiddenError,
  SdkNetworkError,
  SdkProjectError,
  SdkRateLimitError,
  SdkServerError,
  SdkTimeoutError,
} from '@/core';
import type { ErrorCodeCatalog, ErrorCodeNameOf } from '@/core/error-code';
import { ERROR_MESSAGES } from '@/core/error-messages';
import type { ApiBaseError } from '@/core/types';

export type ErrorHandlerCallback<TError extends SdkError> = (error: TError) => void;

export interface ApiErrorHandlerConfig<TCodes extends ErrorCodeCatalog = ErrorCodeCatalog> {
  onServerError?: ErrorHandlerCallback<SdkServerError>;
  onNetworkError?: ErrorHandlerCallback<SdkNetworkError>;
  onTimeout?: ErrorHandlerCallback<SdkTimeoutError>;
  onAuthError?: ErrorHandlerCallback<SdkAuthError>;
  onForbidden?: ErrorHandlerCallback<SdkForbiddenError>;
  onRateLimit?: ErrorHandlerCallback<SdkRateLimitError>;

  codeHandlers?: Partial<Record<ErrorCodeNameOf<TCodes>, ErrorHandlerCallback<SdkProjectError<ApiBaseError<TCodes>>>>>;

  globalErrorMessage?: (message: string, error: SdkError) => void;
  skipGlobalErrorHandler?: boolean;
}

export class ApiErrorHandler {
  private readonly config: ApiErrorHandlerConfig;

  constructor(config: ApiErrorHandlerConfig = {}) {
    this.config = config;
  }

  public process(error: SdkError, localConfig?: ApiErrorHandlerConfig): void {
    if (error instanceof SdkCanceledError) return;

    const skipGlobal = Boolean(localConfig?.skipGlobalErrorHandler);

    if (error instanceof SdkTimeoutError) {
      const handler =
        localConfig?.onTimeout ?? this.config.onTimeout ?? localConfig?.onNetworkError ?? this.config.onNetworkError;

      handler?.(error);
      this.notifyFallback(error, ERROR_MESSAGES.timeoutFallback, skipGlobal);
      return;
    }

    if (error instanceof SdkNetworkError) {
      const handler = localConfig?.onNetworkError ?? this.config.onNetworkError;
      handler?.(error);
      this.notifyFallback(error, ERROR_MESSAGES.offlineFallback, skipGlobal);
      return;
    }

    if (error instanceof SdkServerError) {
      const handler = localConfig?.onServerError ?? this.config.onServerError;
      handler?.(error);
      this.notifyFallback(error, ERROR_MESSAGES.serverFallback, skipGlobal);
      return;
    }

    if (error instanceof SdkAuthError) {
      (localConfig?.onAuthError ?? this.config.onAuthError)?.(error);
      return;
    }

    if (error instanceof SdkForbiddenError) {
      (localConfig?.onForbidden ?? this.config.onForbidden)?.(error);
      this.notifyFallback(error, ERROR_MESSAGES.forbiddenFallback, skipGlobal);
      return;
    }

    if (error instanceof SdkRateLimitError) {
      (localConfig?.onRateLimit ?? this.config.onRateLimit)?.(error);
      this.notifyFallback(error, ERROR_MESSAGES.rateLimitFallback, skipGlobal);
      return;
    }

    if (error instanceof SdkProjectError) {
      const localCodeHandler = localConfig?.codeHandlers?.[error.payload?.error];
      if (localCodeHandler) {
        localCodeHandler(error);
        return;
      }

      const globalCodeHandler = !skipGlobal ? this.config.codeHandlers?.[error.payload?.error] : undefined;
      if (globalCodeHandler) {
        globalCodeHandler(error);
        return;
      }

      this.notifyFallback(error, error.payload.message, skipGlobal);
      return;
    }

    this.notifyFallback(error, error.message, skipGlobal);
  }

  private notifyFallback(error: SdkError, fallbackMessage: string, skip = false): void {
    if (skip) return;
    const msg = error.message || fallbackMessage;
    this.config.globalErrorMessage?.(msg, error);
  }
}
