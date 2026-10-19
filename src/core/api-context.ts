import { HttpTransport } from '@/http/http.transport';

import type { ErrorCodeCatalog } from '@/core/error-code';
import { ApiErrorHandler, type ApiErrorHandlerConfig } from '@/core/error-handler';
import type { SdkCreateConfig } from '@/core/types';

type CatalogOf<TConfig> = TConfig extends { errorCodes: infer TCodes }
  ? [TCodes] extends [ErrorCodeCatalog]
    ? TCodes
    : ErrorCodeCatalog
  : ErrorCodeCatalog;

export type ResolveConvertCase<TConfig> = 'convertCase' extends keyof TConfig
  ? Exclude<TConfig['convertCase'], undefined> extends never
    ? false
    : Exclude<TConfig['convertCase'], undefined> extends true
      ? true
      : Exclude<TConfig['convertCase'], undefined> extends false
        ? false
        : boolean
  : false;

export function createApiContext<const TConfig extends SdkCreateConfig<CatalogOf<TConfig>>>(
  config: TConfig
): ApiContext<ResolveConvertCase<TConfig>> {
  const errorHandler = new ApiErrorHandler(config.errorConfig as ApiErrorHandlerConfig | undefined);
  const http = new HttpTransport<ResolveConvertCase<TConfig>>(config, errorHandler);

  return { http, errorHandler };
}

export type ApiContext<TConvertCase extends boolean = false> = {
  http: HttpTransport<TConvertCase>;
  errorHandler: ApiErrorHandler;
};
