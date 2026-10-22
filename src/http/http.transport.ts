import axios, { type AxiosInstance, type AxiosResponse, type CreateAxiosDefaults, type Method } from 'axios';

import { normalizeResponse } from '@/http/http.interceptors';
import { HttpErrorParser } from '@/http/http-error.parser';

import type { ApiErrorHandler } from '@/core/error-handler';
import { SdkAuthError } from '@/core/errors';
import type { SdkRequestConfig } from '@/core/types';
import { SIGNAL_CLEANUP_KEY } from '@/core/types';

import { paramsSerializer } from '@/shared';
import type { ResponseBody } from '@/shared/types/case-converter';
import { keysToSnake } from '@/shared/utils/case-converter';
import { composeSignals } from '@/shared/utils/compose-signals';

export interface HttpRequestOptions<TData = unknown> extends SdkRequestConfig {
  url: string;
  method?: Method | string;
  data?: TData;
}

type TransportConfig = Omit<CreateAxiosDefaults, 'errorConfig'> & {
  baseUrl?: string;
  getLocales?: () => string;
  convertCase?: boolean;
};

export class HttpTransport<TConvertCase extends boolean = false> {
  private instance: AxiosInstance;
  private errorHandler: ApiErrorHandler;
  private readonly convertCase: TConvertCase;
  private sessionAbortController = new AbortController();
  private isSessionInvalidated = false;

  constructor(config: TransportConfig, errorHandler: ApiErrorHandler) {
    this.errorHandler = errorHandler;
    this.convertCase = (config.convertCase ?? false) as TConvertCase;
    this.instance = axios.create({
      withCredentials: true,
      paramsSerializer,
      ...config,
      baseURL: config.baseURL ?? config.baseUrl ?? '/api',
    });
    this.setupInterceptors(config);
  }

  public invalidateSession(reason = 'Unauthorized: Active requests cancelled'): void {
    if (this.isSessionInvalidated) return;
    this.isSessionInvalidated = true;

    this.sessionAbortController.abort(new SdkAuthError(reason));
  }

  public resetSession(): void {
    this.isSessionInvalidated = false;
    this.sessionAbortController = new AbortController();
  }

  private setupInterceptors(config: TransportConfig): void {
    this.instance.interceptors.request.use((req) => {
      const customConfig = req as SdkRequestConfig;
      const isAuthExempt = Boolean(customConfig.skipAuthAbort);

      if (this.isSessionInvalidated && !isAuthExempt) {
        return Promise.reject(new SdkAuthError('Request blocked: User session is expired (401)'));
      }

      const locale = config.getLocales?.();

      if (locale) req.headers['Accept-Language'] = locale.toLowerCase();
      if (this.convertCase && req.data) req.data = keysToSnake(req.data);
      if (this.convertCase && req.params) req.params = keysToSnake(req.params);

      if (!isAuthExempt) {
        const { signal, cleanup } = composeSignals(req.signal, this.sessionAbortController.signal);

        if (signal) req.signal = signal;

        if (cleanup) customConfig[SIGNAL_CLEANUP_KEY] = cleanup;
      }

      return req;
    });

    this.instance.interceptors.response.use(
      (response) => {
        const customConfig = response.config as SdkRequestConfig | undefined;
        customConfig?.[SIGNAL_CLEANUP_KEY]?.();

        return normalizeResponse(response, this.convertCase);
      },
      async (rawAxiosError: unknown) => {
        if (axios.isAxiosError(rawAxiosError) && rawAxiosError.config) {
          const customConfig = rawAxiosError.config as SdkRequestConfig;
          customConfig[SIGNAL_CLEANUP_KEY]?.();
        }

        const sdkError = await HttpErrorParser.parse(rawAxiosError, this.convertCase);

        if (sdkError instanceof SdkAuthError) {
          this.invalidateSession('Unauthorized: Session terminated by 401 response');
        }

        const requestConfig = (axios.isAxiosError(rawAxiosError) ? rawAxiosError.config : undefined) as
          SdkRequestConfig | undefined;

        this.errorHandler.process(sdkError, requestConfig?.errorConfig);

        return Promise.reject(sdkError);
      }
    );
  }

  public async request<TResponse, TData = unknown>(
    options: HttpRequestOptions<TData>
  ): Promise<ResponseBody<TResponse, TConvertCase>> {
    const { method = 'GET', url, data, ...axiosConfig } = options;

    const result = await this.instance.request({ ...axiosConfig, method, url, data });

    return result as ResponseBody<TResponse, TConvertCase>;
  }

  public get<TResponse>(
    urlOrOptions: string | Omit<HttpRequestOptions, 'method'>,
    config?: SdkRequestConfig
  ): Promise<ResponseBody<TResponse, TConvertCase>> {
    if (typeof urlOrOptions === 'string') {
      return this.request<TResponse>({ ...config, method: 'GET', url: urlOrOptions });
    }
    return this.request<TResponse>({ ...urlOrOptions, method: 'GET' });
  }

  public post<TResponse, TData = unknown>(
    urlOrOptions: string | Omit<HttpRequestOptions<TData>, 'method'>,
    data?: TData,
    config?: SdkRequestConfig
  ): Promise<ResponseBody<TResponse, TConvertCase>> {
    if (typeof urlOrOptions === 'string') {
      return this.request<TResponse, TData>({ ...config, method: 'POST', url: urlOrOptions, data });
    }
    return this.request<TResponse, TData>({ ...urlOrOptions, method: 'POST' });
  }

  public put<TResponse, TData = unknown>(
    urlOrOptions: string | Omit<HttpRequestOptions<TData>, 'method'>,
    data?: TData,
    config?: SdkRequestConfig
  ): Promise<ResponseBody<TResponse, TConvertCase>> {
    if (typeof urlOrOptions === 'string') {
      return this.request<TResponse, TData>({ ...config, method: 'PUT', url: urlOrOptions, data });
    }
    return this.request<TResponse, TData>({ ...urlOrOptions, method: 'PUT' });
  }

  public patch<TResponse, TData = unknown>(
    urlOrOptions: string | Omit<HttpRequestOptions<TData>, 'method'>,
    data?: TData,
    config?: SdkRequestConfig
  ): Promise<ResponseBody<TResponse, TConvertCase>> {
    if (typeof urlOrOptions === 'string') {
      return this.request<TResponse, TData>({ ...config, method: 'PATCH', url: urlOrOptions, data });
    }
    return this.request<TResponse, TData>({ ...urlOrOptions, method: 'PATCH' });
  }

  public delete<TResponse>(
    urlOrOptions: string | Omit<HttpRequestOptions, 'method'>,
    config?: SdkRequestConfig
  ): Promise<ResponseBody<TResponse, TConvertCase>> {
    if (typeof urlOrOptions === 'string') {
      return this.request<TResponse>({ ...config, method: 'DELETE', url: urlOrOptions });
    }
    return this.request<TResponse>({ ...urlOrOptions, method: 'DELETE' });
  }

  public getRaw<TResponse>(options: HttpRequestOptions): Promise<AxiosResponse<TResponse>> {
    return this.instance.request<TResponse, AxiosResponse<TResponse>>({
      ...options,
      method: options.method ?? 'GET',
      rawResponse: true,
    } as SdkRequestConfig);
  }
}
