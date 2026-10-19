export function paramsSerializer(params: Record<string, unknown>): string {
  const searchParams = new URLSearchParams();

  const getValidValue = (value: unknown): string | null => {
    if (value === null || value === undefined) {
      return null;
    }

    if (value instanceof Date) {
      return isNaN(value.getTime()) ? null : value.toISOString();
    }

    if (typeof value === 'object' && !Array.isArray(value)) {
      try {
        return JSON.stringify(value);
      } catch {
        return null;
      }
    }

    const strValue = String(value).trim();

    const blacklistedStrings = ['null', 'undefined', '[object Object]', ''];
    if (blacklistedStrings.includes(strValue)) {
      return null;
    }

    return strValue;
  };

  const appendParam = (key: string, value: unknown) => {
    if (Array.isArray(value)) {
      value.forEach((item) => appendParam(key, item));
      return;
    }

    const validValue = getValidValue(value);
    if (validValue !== null) {
      searchParams.append(key, validValue);
    }
  };

  Object.entries(params).forEach(([key, value]) => {
    appendParam(key, value);
  });

  return searchParams.toString();
}
