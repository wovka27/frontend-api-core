import { ApiErrorHandlerConfig } from '@/core';

declare module 'axios' {
  export interface AxiosRequestConfig {
    errorConfig?: ApiErrorHandlerConfig;
  }
  export interface InternalAxiosRequestConfig {
    errorConfig?: ApiErrorHandlerConfig;
  }
}
