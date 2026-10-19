import { type ApiContext, createApiContext } from '@/core/api-context';
import type { ErrorCodeCatalog } from '@/core/error-code';
import { createLazyContainer, type FactoryMap } from '@/core/lazy-container';
import type { SdkCreateConfig } from '@/core/types';

export interface SdkSessionManagement {
  resetSession(): void;
  invalidateSession(reason?: string): void;
}

const createSessionFactories = <TConvertCase extends boolean>(): FactoryMap<SdkSessionManagement, TConvertCase> => ({
  resetSession: (ctx) => () => ctx.http.resetSession(),
  invalidateSession: (ctx) => (reason?: string) => ctx.http.invalidateSession(reason),
});

type SdkConfigFor<
  TConvertCase extends boolean,
  TCodes extends ErrorCodeCatalog = ErrorCodeCatalog,
> = SdkCreateConfig<TCodes> & (TConvertCase extends true ? { convertCase: true } : { convertCase?: TConvertCase });

export const defineApiSdk =
  <F extends object, TConvertCase extends boolean = false>(factories: FactoryMap<F, TConvertCase>) =>
  <const TCodes extends ErrorCodeCatalog = ErrorCodeCatalog>(config: SdkConfigFor<TConvertCase, TCodes>) => {
    const context = createApiContext(config as SdkCreateConfig) as ApiContext<TConvertCase>;

    return createLazyContainer<F, SdkSessionManagement, TConvertCase>(
      context,
      factories,
      createSessionFactories<TConvertCase>()
    );
  };

export const defineSubApiSdk =
  <F extends object, TConvertCase extends boolean = false>(factories: FactoryMap<F, TConvertCase>) =>
  (ctx: ApiContext<TConvertCase>) => {
    return createLazyContainer<F, TConvertCase>(ctx, factories);
  };
