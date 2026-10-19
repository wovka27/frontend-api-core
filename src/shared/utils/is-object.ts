export const isObject = (value: unknown): value is Record<string, unknown> => {
  return (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    !(value instanceof Date) &&
    !(value instanceof Blob) &&
    !(typeof FormData !== 'undefined' && value instanceof FormData)
  );
};
