import type { AxiosRequestConfig, CreateAxiosDefaults } from 'axios';

import type { ErrorCodeCatalog, ErrorCodeNameOf, ErrorCodeOf } from '@/core/error-code';
import type { ApiErrorHandlerConfig } from '@/core/error-handler';

export const SIGNAL_CLEANUP_KEY = Symbol('SIGNAL_CLEANUP_KEY');

export interface SdkErrorContext {
  statusCode?: number;
  requestId?: string;
  url?: string;
  method?: string;
  originalError?: unknown;
  rawPayload?: unknown;
}

export interface SdkCreateConfig<TCodes extends ErrorCodeCatalog = ErrorCodeCatalog>
  extends Omit<CreateAxiosDefaults, 'errorConfig'>, SdkErrorConfig<TCodes> {
  baseUrl?: string;
  getLocales?: () => string;
  /** Map request keys to snake_case and response keys to camelCase. */
  convertCase?: boolean;
  /** Application error-code catalog. The core does not own concrete codes. */
  errorCodes?: TCodes;
}

export interface SdkRequestConfig extends AxiosRequestConfig, SdkErrorConfig {
  [SIGNAL_CLEANUP_KEY]?: () => void;
  skipAuthAbort?: boolean;
  retry?: boolean;
}
export interface SdkErrorConfig<TCodes extends ErrorCodeCatalog = ErrorCodeCatalog> {
  errorConfig?: ApiErrorHandlerConfig<TCodes>;
}

export interface ApiBaseError<TCodes extends ErrorCodeCatalog = ErrorCodeCatalog> {
  code: ErrorCodeOf<TCodes>;
  error: ErrorCodeNameOf<TCodes>;
  message: string;
  [key: string]: unknown;
}

export type ApiErrorPayload<TCodes extends ErrorCodeCatalog = ErrorCodeCatalog> = ApiBaseError<TCodes>;
