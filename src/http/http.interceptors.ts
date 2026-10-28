import type { AxiosResponse } from 'axios';

import type { SnakeToCamelObject } from '@/shared/types/case-converter';
import { keysToCamel } from '@/shared/utils/case-converter';

export function normalizeResponse<T>(response: AxiosResponse<T>, convertCase = false): SnakeToCamelObject<T> | T {
  const { data } = response;

  if (!convertCase) {
    return data;
  }

  return keysToCamel(data);
}
