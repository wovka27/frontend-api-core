export type ErrorCodeCatalog<TName extends string = string> = Readonly<Record<TName, number>>;

export type ErrorCodeOf<TCodes extends ErrorCodeCatalog> = TCodes[keyof TCodes];

export type ErrorCodeNameOf<TCodes extends ErrorCodeCatalog> = keyof TCodes & string;
