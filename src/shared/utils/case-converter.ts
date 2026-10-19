import type { CamelToSnake, CamelToSnakeObject, SnakeToCamel, SnakeToCamelObject } from '@/shared/types/case-converter';
import { isObject } from '@/shared/utils/is-object';

const MAX_CACHE = 1000;
const camelCache = new Map<string, string>();
const snakeCache = new Map<string, string>();

export const snakeToCamel = <T extends string>(str: T): SnakeToCamel<T> => {
  let cached = camelCache.get(str);
  if (!cached) {
    if (camelCache.size >= MAX_CACHE) {
      camelCache.clear();
    }
    cached = str.replace(/_([a-z0-9])/gi, (_, letter: string) => letter.toUpperCase());
    camelCache.set(str, cached);
  }
  return cached as SnakeToCamel<T>;
};

export const camelToSnake = <T extends string>(str: T): CamelToSnake<T> => {
  let cached = snakeCache.get(str);
  if (!cached) {
    if (snakeCache.size >= MAX_CACHE) {
      snakeCache.clear();
    }
    cached = str.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase();
    snakeCache.set(str, cached);
  }
  return cached as CamelToSnake<T>;
};

export function keysToCamel<T>(obj: T): SnakeToCamelObject<T> {
  if (obj === null || obj === undefined || typeof obj !== 'object') {
    return obj as unknown as SnakeToCamelObject<T>;
  }

  if (
    (typeof FormData !== 'undefined' && obj instanceof FormData) ||
    (typeof Blob !== 'undefined' && obj instanceof Blob) ||
    (typeof File !== 'undefined' && obj instanceof File) ||
    obj instanceof Date ||
    obj instanceof RegExp
  ) {
    return obj as unknown as SnakeToCamelObject<T>;
  }

  if (Array.isArray(obj)) {
    return (obj.length === 0 ? [] : obj.map(keysToCamel)) as unknown as SnakeToCamelObject<T>;
  }

  if (isObject(obj)) {
    const res: Record<string, unknown> = {};

    for (const [key, val] of Object.entries(obj)) {
      const camelKey = snakeToCamel(key);

      if (val === undefined || val === null) {
        res[camelKey] = val;
        continue;
      }

      if (Array.isArray(val)) {
        res[camelKey] = val.length === 0 ? [] : val.map(keysToCamel);
        continue;
      }

      if (isObject(val)) {
        res[camelKey] = Object.keys(val).length === 0 ? {} : keysToCamel(val);
        continue;
      }

      res[camelKey] = val;
    }

    return res as unknown as SnakeToCamelObject<T>;
  }

  return obj as unknown as SnakeToCamelObject<T>;
}

export function keysToSnake<T>(obj: T): CamelToSnakeObject<T> {
  if (obj === null || obj === undefined || typeof obj !== 'object') {
    return obj as unknown as CamelToSnakeObject<T>;
  }

  if (typeof FormData !== 'undefined' && obj instanceof FormData) {
    const res = new FormData();

    for (const [key, val] of obj.entries()) {
      const snakeKey = camelToSnake(key);

      if (typeof val === 'string') {
        const transformedValue = transformJsonStringIfPossible(val);
        res.append(snakeKey, transformedValue);
      } else {
        res.append(snakeKey, val);
      }
    }

    return res as unknown as CamelToSnakeObject<T>;
  }

  if (Array.isArray(obj)) {
    return (obj.length === 0 ? [] : obj.map(keysToSnake)) as unknown as CamelToSnakeObject<T>;
  }

  if (isObject(obj)) {
    const res: Record<string, unknown> = {};

    for (const [key, val] of Object.entries(obj)) {
      const snakeKey = camelToSnake(key);

      if (val === undefined || val === null) {
        res[snakeKey] = val;
        continue;
      }

      if (Array.isArray(val)) {
        res[snakeKey] = val.length === 0 ? [] : val.map(keysToSnake);
        continue;
      }

      if (isObject(val)) {
        res[snakeKey] = Object.keys(val).length === 0 ? {} : keysToSnake(val);
        continue;
      }

      res[snakeKey] = val;
    }

    return res as unknown as CamelToSnakeObject<T>;
  }

  return obj as unknown as CamelToSnakeObject<T>;
}

function transformJsonStringIfPossible(val: string): string {
  const trimmed = val.trim();
  const isObj = trimmed.startsWith('{') && trimmed.endsWith('}');
  const isArr = trimmed.startsWith('[') && trimmed.endsWith(']');

  if (isObj || isArr) {
    try {
      const parsed: unknown = JSON.parse(val);
      if (typeof parsed === 'object' && parsed !== null) {
        return JSON.stringify(keysToSnake(parsed));
      }
    } catch {
      return val;
    }
  }
  return val;
}
