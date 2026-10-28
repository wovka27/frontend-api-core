import type { Method } from 'axios';

import type { HttpTransport } from '@/http/http.transport';

import type { SdkRequestConfig } from '@/core/types';

import type { ResponseBody } from '@/shared/types/case-converter';

export interface RouteDescriptor<TResponse = unknown> {
  url: string;
  method?: Method | string;
  params?: unknown;
  data?: unknown;
  headers?: Record<string, string>;

  readonly _responseType?: TResponse;
}

export type NormalizeResponseType<T, TConvertCase extends boolean = false> = T extends
  void | undefined | null | boolean | number | string | Blob
  ? T
  : ResponseBody<T, TConvertCase>;

export type ExecutableApi<TDefinitions, TConvertCase extends boolean = false> = {
  [K in keyof TDefinitions]: TDefinitions[K] extends (...args: infer TArgs) => RouteDescriptor<infer TResponse>
    ? (...args: [...TArgs, config?: SdkRequestConfig]) => Promise<NormalizeResponseType<TResponse, TConvertCase>>
    : TDefinitions[K] extends (...args: infer TArgs) => Promise<infer TResponse>
      ? TDefinitions[K]
      : never;
};

export type RouteHandler = ((...args: never[]) => RouteDescriptor<unknown>) | ((...args: never[]) => Promise<unknown>);
export type DomainDefinitions = Record<string, RouteHandler>;

const REQUEST_CONFIG_KEYS = new Set([
  'adapter',
  'allowAbsoluteUrls',
  'allowedSocketPaths',
  'auth',
  'baseURL',
  'beforeRedirect',
  'cancelToken',
  'data',
  'decompress',
  'env',
  'errorConfig',
  'family',
  'fetchOptions',
  'formDataHeaderPolicy',
  'formSerializer',
  'headers',
  'httpAgent',
  'http2Options',
  'httpVersion',
  'httpsAgent',
  'insecureHTTPParser',
  'lookup',
  'maxBodyLength',
  'maxContentLength',
  'maxRedirects',
  'maxRate',
  'method',
  'onDownloadProgress',
  'onUploadProgress',
  'parseReviver',
  'params',
  'paramsSerializer',
  'proxy',
  'redact',
  'responseEncoding',
  'responseType',
  'signal',
  'sensitiveHeaders',
  'skipAuthAbort',
  'socketPath',
  'timeout',
  'timeoutErrorMessage',
  'transport',
  'transformRequest',
  'transformResponse',
  'transitional',
  'url',
  'validateStatus',
  'withCredentials',
  'withXSRFToken',
  'xsrfCookieName',
  'xsrfHeaderName',
  'retry',
]);

// Function.length only counts required parameters, so distinguish Axios config
// by its own keys instead of treating every trailing object as transport config.
function isRequestConfig(value: unknown): value is SdkRequestConfig {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;

  return Object.keys(value).some((key) => REQUEST_CONFIG_KEYS.has(key));
}

export function defineDomainApi<TDefinitions extends DomainDefinitions>(
  factory: (http: HttpTransport) => TDefinitions
): <TConvertCase extends boolean = false>(
  http: HttpTransport<TConvertCase>
) => ExecutableApi<TDefinitions, TConvertCase> {
  return <TConvertCase extends boolean = false>(
    http: HttpTransport<TConvertCase>
  ): ExecutableApi<TDefinitions, TConvertCase> => {
    const routes = factory(http as HttpTransport);
    const client = {} as Record<string, (...args: readonly unknown[]) => Promise<unknown>>;

    for (const [methodName, handler] of Object.entries(routes)) {
      client[methodName] = (...rawArgs: readonly unknown[]): Promise<unknown> => {
        const args = [...rawArgs];

        const candidateConfig = args[args.length - 1];
        const hasExtraConfig = args.length > handler.length && isRequestConfig(candidateConfig);
        const config = hasExtraConfig ? (args.pop() as SdkRequestConfig) : undefined;

        const result = (handler as (...args: unknown[]) => unknown)(...args);

        if (result instanceof Promise || (result && typeof (result as Record<string, unknown>).then === 'function')) {
          return result as Promise<unknown>;
        }

        const descriptor = result as RouteDescriptor<unknown>;

        return http.request({
          ...config,
          method: descriptor.method ?? 'GET',
          url: descriptor.url,
          params: descriptor.params,
          data: descriptor.data,
          headers: {
            ...descriptor.headers,
            ...config?.headers,
          },
        });
      };
    }

    return client as unknown as ExecutableApi<TDefinitions, TConvertCase>;
  };
}
