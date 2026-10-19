import type { AxiosResponse } from 'axios';

import type { SnakeToCamelObject } from '@/shared/types/case-converter';
import { keysToCamel } from '@/shared/utils/case-converter';

export function normalizeResponse<T>(
  response: AxiosResponse<T>,
  convertCase = false
): SnakeToCamelObject<T> | T | AxiosResponse<T> {
  const { data, config, headers } = response;
  const isBlob = data instanceof Blob || config.responseType === 'blob';
  const isExport = !!config.url?.includes('/export') && headers?.['x-has-next-page'] !== undefined;

  if (isBlob || isExport) {
    return response;
  }

  if (!convertCase) {
    return data;
  }

  return keysToCamel(data);
}
