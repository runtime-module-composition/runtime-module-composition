export type ImportMap = {
  imports: Record<string, string>;
  scopes?: Record<string, Record<string, string>>;
};

export type RuntimeEnvironment = "development" | "preview" | "production";

export type EnvironmentUrlMap = Partial<Record<RuntimeEnvironment, string>>;

export type SharedDependencyConfig =
  | string
  | {
      url: string;
      environments?: EnvironmentUrlMap;
      external?: boolean;
    };

export type SliceConfig = {
  route: string | string[];
  specifier: string;
  entry: string;
  environments?: EnvironmentUrlMap;
  external?: boolean;
};

export type RouteOverrideConfig =
  | string
  | {
      specifier: string;
      route?: string | string[];
    };

export type EnvironmentConfig = {
  assetsOrigin?: string;
  externalDepsOrigin?: string;
  sliceOrigins?: Record<string, string>;
};

export type PackageSpecifier = {
  basePackage: string;
  subpath: string | null;
};

export type ExternalDepEntry = {
  /** Bare package name, or a subpath import, e.g. "react" or "react-dom/client". */
  name: string;
  /** Always required — this is what prevents a bare entry from resolving to
   *  an unpinned "latest" CDN build. */
  version: string;
  /** Peer package NAMES (not versions) to pin via esm.sh's `?deps=` query.
   *  Versions are looked up from those names' own externalDeps entries at
   *  generation time — never hand-typed here. `false` opts this entry out
   *  of `defaultPeerDeps`. */
  peerDeps?: string[] | false;
};

export type RuntimeCompositionManifest = {
  namespace: string;
  assetsOrigin: string;
  externalDepsOrigin?: string;
  externalDepsPrefix?: string;
  entryFile?: string;
  /** Prepended to the URL path segment when building a *conventional* slice
   *  specifier: slicePrefix "web-" turns route "/booking" into
   *  "<namespace>/web-booking/<entryFile>". Does not affect routeOverrides or
   *  sliceOverrides, which carry explicit specifiers. */
  slicePrefix?: string;
  environments?: Partial<Record<RuntimeEnvironment, EnvironmentConfig>>;
  exactImports?: Record<string, SharedDependencyConfig>;
  sliceOverrides?: Record<string, SliceConfig>;
  routeOverrides?: Record<string, RouteOverrideConfig>;
  externalDeps?: ExternalDepEntry[];
  /** Peer package NAMES applied automatically to every externalDeps entry
   *  that doesn't set its own `peerDeps`. */
  defaultPeerDeps?: string[];
};

export type RuntimeRouteMatch = {
  sliceName: string;
  slice?: SliceConfig;
  specifier: string;
  route: string;
};

export type RuntimeCompositionDiagnostic = {
  level: "error" | "warning";
  code: string;
  message: string;
};

export type RuntimeModuleContext = {
  route?: RuntimeRouteMatch;
  manifest?: RuntimeCompositionManifest;
  data?: unknown;
};

export type RuntimeModule = {
  mount(target: Element, context?: RuntimeModuleContext): void | Promise<void>;
  unmount?(): void | Promise<void>;
};

export type DynamicImporter = (specifier: string) => Promise<unknown>;
