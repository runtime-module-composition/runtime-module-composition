import type {
  RouteOverrideConfig,
  RuntimeCompositionManifest,
  RuntimeRouteMatch,
  SliceConfig,
} from "./types.js";

const normalizePath = (path: string): string => {
  const withoutHash = path.split("#")[0] ?? "/";
  const withoutSearch = withoutHash.split("?")[0] ?? "/";
  const normalized = withoutSearch.startsWith("/")
    ? withoutSearch
    : `/${withoutSearch}`;
  return normalized.length > 1 && normalized.endsWith("/")
    ? normalized.slice(0, -1)
    : normalized;
};

const routePatternsFor = (slice: SliceConfig): string[] =>
  Array.isArray(slice.route) ? slice.route : [slice.route];

const routePatternsForOverride = (
  route: string,
  override: RouteOverrideConfig,
): string[] => {
  if (typeof override === "string" || !override.route) {
    return [route];
  }

  return Array.isArray(override.route) ? override.route : [override.route];
};

const ensureNamespacePrefix = (namespace: string): string =>
  namespace.endsWith("/") ? namespace : `${namespace}/`;

const resolveConventionalSliceName = (path: string): string | null => {
  const [firstSegment] = normalizePath(path).split("/").filter(Boolean);
  return firstSegment ?? null;
};

const buildConventionalSpecifier = (
  manifest: RuntimeCompositionManifest,
  sliceName: string,
): string =>
  `${ensureNamespacePrefix(manifest.namespace)}${manifest.slicePrefix ?? ""}${sliceName}/${manifest.entryFile ?? "index.mjs"}`;

const matchRoutePattern = (
  pattern: string,
  pathname: string,
): { matched: boolean; score: number } => {
  const normalizedPattern = normalizePath(pattern);
  const normalizedPathname = normalizePath(pathname);

  if (normalizedPattern.endsWith("/*")) {
    const prefix = normalizedPattern.slice(0, -2);
    return {
      matched:
        normalizedPathname === prefix ||
        normalizedPathname.startsWith(`${prefix}/`),
      score: prefix.length,
    };
  }

  if (normalizedPattern === normalizedPathname) {
    return {
      matched: true,
      score: normalizedPattern.length + 1000,
    };
  }

  return {
    matched: false,
    score: -1,
  };
};

const resolveExplicitRoute = (
  manifest: RuntimeCompositionManifest,
  path: string,
): RuntimeRouteMatch | null => {
  const matches: Array<RuntimeRouteMatch & { score: number }> = [];

  for (const [route, override] of Object.entries(manifest.routeOverrides ?? {})) {
    for (const pattern of routePatternsForOverride(route, override)) {
      const match = matchRoutePattern(pattern, path);
      if (match.matched) {
        const specifier =
          typeof override === "string" ? override : override.specifier;
        matches.push({
          sliceName:
            specifier
              .slice(ensureNamespacePrefix(manifest.namespace).length)
              .split("/")[0] ?? "",
          specifier,
          route: pattern,
          score: match.score + 2000,
        });
      }
    }
  }

  for (const [sliceName, slice] of Object.entries(manifest.sliceOverrides ?? {})) {
    for (const route of routePatternsFor(slice)) {
      const match = matchRoutePattern(route, path);
      if (match.matched) {
        matches.push({
          sliceName,
          slice,
          specifier: slice.specifier,
          route,
          score: match.score,
        });
      }
    }
  }

  const [bestMatch] = matches.sort((a, b) => b.score - a.score);
  if (!bestMatch) {
    return null;
  }

  const { score: _score, ...routeMatch } = bestMatch;
  return routeMatch;
};

export const resolveRoute = (
  manifest: RuntimeCompositionManifest,
  path: string,
): RuntimeRouteMatch | null => {
  const explicitMatch = resolveExplicitRoute(manifest, path);
  if (explicitMatch) {
    return explicitMatch;
  }

  const sliceName = resolveConventionalSliceName(path);
  if (!sliceName) {
    return null;
  }

  return {
    sliceName,
    specifier: buildConventionalSpecifier(manifest, sliceName),
    route: `/${sliceName}/*`,
  };
};

