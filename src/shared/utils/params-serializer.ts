export function paramsSerializer(params: Record<string, unknown> | null | undefined): string {
  if (!params) return '';

  const searchParams = new URLSearchParams();
  const ancestors = new WeakSet<object>();

  const append = (key: string, value: unknown): void => {
    if (value === null || value === undefined) return;

    if (value instanceof Date) {
      if (!Number.isNaN(value.getTime())) searchParams.append(key, value.toISOString());
      return;
    }

    if (Array.isArray(value)) {
      if (ancestors.has(value)) return;
      ancestors.add(value);
      value.forEach((item, index) => {
        if (item !== null && item !== undefined && typeof item === 'object' && !(item instanceof Date)) {
          append(`${key}[${index}]`, item);
        } else {
          append(`${key}[]`, item);
        }
      });
      ancestors.delete(value);
      return;
    }

    if (typeof value === 'object') {
      if (ancestors.has(value)) return;
      ancestors.add(value);
      Object.entries(value).forEach(([childKey, childValue]) => append(`${key}[${childKey}]`, childValue));
      ancestors.delete(value);
      return;
    }

    searchParams.append(key, String(value));
  };

  Object.entries(params).forEach(([key, value]) => append(key, value));
  return searchParams.toString();
}
