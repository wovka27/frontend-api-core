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

        const hasExtraConfig = args.length > handler.length;
        const config = (hasExtraConfig ? args.pop() : undefined) as SdkRequestConfig | undefined;

        const result = (handler as (...args: unknown[]) => unknown)(...rawArgs);

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
