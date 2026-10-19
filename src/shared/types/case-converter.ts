type Builtin = Date | RegExp | Blob | File | FormData | Function | boolean | number | string | null | undefined;

export type SnakeToCamel<S extends string> =
  S extends Uppercase<S> ? S : S extends `${infer T}_${infer U}` ? `${Lowercase<T>}${Capitalize<SnakeToCamel<U>>}` : S;

export type CamelToSnake<S extends string> =
  S extends Uppercase<S>
    ? S
    : S extends `${infer T}${infer U}`
      ? `${T extends Lowercase<T> ? T : `_${Lowercase<T>}`}${CamelToSnake<U>}`
      : S;

export type SnakeToCamelObject<T> = T extends Builtin
  ? T
  : T extends ReadonlyArray<infer U>
    ? Array<SnakeToCamelObject<U>>
    : T extends object
      ? { [K in keyof T as SnakeToCamel<K & string>]: SnakeToCamelObject<T[K]> }
      : T;

export type CamelToSnakeObject<T> = T extends Builtin
  ? T
  : T extends ReadonlyArray<infer U>
    ? Array<CamelToSnakeObject<U>>
    : T extends object
      ? { [K in keyof T as CamelToSnake<K & string>]: CamelToSnakeObject<T[K]> }
      : T;

export type ResponseBody<T, TConvertCase extends boolean = false> = TConvertCase extends true
  ? SnakeToCamelObject<T>
  : T;
