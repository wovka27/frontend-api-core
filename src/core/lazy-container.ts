import type { ApiContext } from '@/core/api-context';

export type FactoryMap<T, TConvertCase extends boolean = false> = {
  [K in keyof T]: (ctx: ApiContext<TConvertCase>) => T[K];
};

type AnyApiContext = ApiContext<true> | ApiContext<false> | ApiContext<boolean>;
type AnyFactoryRecord = Record<PropertyKey, (ctx: never) => unknown>;

export function createLazyContainer<A extends object, TConvertCase extends boolean = false>(
  ctx: ApiContext<TConvertCase>,
  factoriesA: FactoryMap<A, TConvertCase>
): A;
export function createLazyContainer<A extends object, B extends object, TConvertCase extends boolean = false>(
  ctx: ApiContext<TConvertCase>,
  factoriesA: FactoryMap<A, TConvertCase>,
  factoriesB: FactoryMap<B, TConvertCase>
): A & B;

export function createLazyContainer(ctx: AnyApiContext, ...factoriesList: ReadonlyArray<AnyFactoryRecord>): object {
  const instanceCache = new Map<PropertyKey, unknown>();
  const factoryRegistry: Record<PropertyKey, ((ctx: AnyApiContext) => unknown) | undefined> = Object.assign(
    {},
    ...factoriesList
  );

  const target: Record<PropertyKey, unknown> = {};

  return new Proxy(target, {
    get(_, prop: PropertyKey): unknown {
      if (typeof prop === 'symbol' || prop === 'then') {
        return undefined;
      }

      if (instanceCache.has(prop)) {
        return instanceCache.get(prop);
      }

      const factory = factoryRegistry[prop];
      if (!factory) {
        return undefined;
      }

      const instance = factory(ctx);
      instanceCache.set(prop, instance);
      return instance;
    },

    ownKeys(): ArrayLike<string | symbol> {
      return Reflect.ownKeys(factoryRegistry);
    },

    getOwnPropertyDescriptor(_, prop: PropertyKey): PropertyDescriptor | undefined {
      if (prop in factoryRegistry) {
        return {
          enumerable: true,
          configurable: true,
          writable: false,
        };
      }
      return undefined;
    },
  });
}
