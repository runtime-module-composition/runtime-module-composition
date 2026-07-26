// @vitest-environment happy-dom
import { describe, expect, test, vi } from "vitest";
import {
  createExternalMatcher,
  createImportMap,
  createImportMapBootstrapScript,
  createRuntimeHost,
  createRuntimeHostObservable,
  defineManifest,
  notifyInternalNavigation,
  resolveImportMapSpecifier,
  resolveRoute,
  splitPackageSpecifier,
  validateManifest,
} from "./index.js";

const manifest = defineManifest({
  namespace: "@acme",
  assetsOrigin: "https://assets.example.com",
  externalDepsOrigin: "https://esm.sh",
});

describe("runtime composition core", () => {
  test("splitPackageSpecifier splits a bare package name with no subpath", () => {
    expect(splitPackageSpecifier("react")).toEqual({
      basePackage: "react",
      subpath: null,
    });
  });

  test("splitPackageSpecifier splits a package name with a subpath", () => {
    expect(splitPackageSpecifier("react-dom/client")).toEqual({
      basePackage: "react-dom",
      subpath: "client",
    });
  });

  test("splitPackageSpecifier splits a scoped package name with no subpath", () => {
    expect(splitPackageSpecifier("@radix-ui/themes")).toEqual({
      basePackage: "@radix-ui/themes",
      subpath: null,
    });
  });

  test("splitPackageSpecifier splits a scoped package name with a multi-segment subpath", () => {
    expect(splitPackageSpecifier("@radix-ui/themes/some/path")).toEqual({
      basePackage: "@radix-ui/themes",
      subpath: "some/path",
    });
  });

  test("creates an import map from namespace and external dependency origins", () => {
    expect(createImportMap(manifest)).toEqual({
      imports: {
        "@acme/": "https://assets.example.com/",
        "@esm.sh/": "https://esm.sh/",
      },
    });
  });

  test("uses environment-specific origins and slice origins", () => {
    expect(
      createImportMap(
        {
          ...manifest,
          environments: {
            development: {
              assetsOrigin: "http://localhost:5173/assets",
              externalDepsOrigin: "https://esm.sh",
              sliceOrigins: {
                search: "http://localhost:5174",
              },
            },
          },
        },
        { environment: "development" },
      ),
    ).toEqual({
      imports: {
        "@acme/": "http://localhost:5173/assets/",
        "@esm.sh/": "https://esm.sh/",
        "@acme/search/": "http://localhost:5174/",
      },
    });
  });

  test("includes exactImports entries in the generated import map", () => {
    expect(
      createImportMap({
        ...manifest,
        exactImports: {
          react: "https://esm.sh/react@19.2.4",
        },
      }),
    ).toEqual({
      imports: {
        "@acme/": "https://assets.example.com/",
        "@esm.sh/": "https://esm.sh/",
        react: "https://esm.sh/react@19.2.4",
      },
    });
  });

  test("generates externalDeps entries with defaultPeerDeps resolved from a sibling entry's version", () => {
    expect(
      createImportMap({
        ...manifest,
        externalDeps: [
          { name: "react", version: "19.2.4", peerDeps: false },
          { name: "zustand", version: "4.5.0" },
        ],
        defaultPeerDeps: ["react"],
      }),
    ).toEqual({
      imports: {
        "@acme/": "https://assets.example.com/",
        "@esm.sh/": "https://esm.sh/",
        "@esm.sh/react": "https://esm.sh/react@19.2.4",
        "@esm.sh/zustand": "https://esm.sh/zustand@4.5.0?deps=react@19.2.4",
      },
    });
  });

  test("supports externalDeps entries that opt out of peerDeps", () => {
    expect(
      createImportMap({
        ...manifest,
        externalDeps: [
          { name: "react", version: "19.2.4", peerDeps: false },
          { name: "date-fns", version: "3.6.0", peerDeps: false },
        ],
        defaultPeerDeps: ["react"],
      }),
    ).toEqual({
      imports: {
        "@acme/": "https://assets.example.com/",
        "@esm.sh/": "https://esm.sh/",
        "@esm.sh/react": "https://esm.sh/react@19.2.4",
        "@esm.sh/date-fns": "https://esm.sh/date-fns@3.6.0",
      },
    });
  });

  test("supports externalDeps entries with a custom peerDeps override", () => {
    expect(
      createImportMap({
        ...manifest,
        externalDeps: [
          { name: "react", version: "19.2.4", peerDeps: false },
          { name: "react-dom", version: "19.2.4", peerDeps: false },
          {
            name: "@radix-ui/themes",
            version: "3.0.0",
            peerDeps: ["react", "react-dom"],
          },
        ],
        defaultPeerDeps: ["react"],
      }),
    ).toEqual({
      imports: {
        "@acme/": "https://assets.example.com/",
        "@esm.sh/": "https://esm.sh/",
        "@esm.sh/react": "https://esm.sh/react@19.2.4",
        "@esm.sh/react-dom": "https://esm.sh/react-dom@19.2.4",
        "@esm.sh/@radix-ui/themes":
          "https://esm.sh/@radix-ui/themes@3.0.0?deps=react@19.2.4,react-dom@19.2.4",
      },
    });
  });

  test("devDeps appends ?dev to exact external entries but not the catch-all prefix", () => {
    expect(
      createImportMap(
        {
          ...manifest,
          externalDeps: [
            { name: "react", version: "19.2.4", peerDeps: false },
            { name: "zustand", version: "4.5.0" },
          ],
          defaultPeerDeps: ["react"],
        },
        { devDeps: true },
      ),
    ).toEqual({
      imports: {
        "@acme/": "https://assets.example.com/",
        "@esm.sh/": "https://esm.sh/",
        "@esm.sh/react": "https://esm.sh/react@19.2.4?dev",
        "@esm.sh/zustand": "https://esm.sh/zustand@4.5.0?deps=react@19.2.4&dev",
      },
    });
  });

  test("externalDeps entries resolve with no ?deps= query when defaultPeerDeps is unset", () => {
    expect(
      createImportMap({
        ...manifest,
        externalDeps: [{ name: "zustand", version: "4.5.0" }],
      }),
    ).toEqual({
      imports: {
        "@acme/": "https://assets.example.com/",
        "@esm.sh/": "https://esm.sh/",
        "@esm.sh/zustand": "https://esm.sh/zustand@4.5.0",
      },
    });
  });

  test("externalDeps entry's specifier key excludes the version while the URL includes it", () => {
    expect(
      createImportMap({
        ...manifest,
        externalDeps: [{ name: "react", version: "19.2.4" }],
      }),
    ).toEqual({
      imports: {
        "@acme/": "https://assets.example.com/",
        "@esm.sh/": "https://esm.sh/",
        "@esm.sh/react": "https://esm.sh/react@19.2.4",
      },
    });
  });

  test("a subpath externalDeps entry inserts the version after the base package, before the subpath", () => {
    expect(
      createImportMap({
        ...manifest,
        externalDeps: [{ name: "react-dom/client", version: "19.2.4" }],
      }),
    ).toEqual({
      imports: {
        "@acme/": "https://assets.example.com/",
        "@esm.sh/": "https://esm.sh/",
        "@esm.sh/react-dom/client": "https://esm.sh/react-dom@19.2.4/client",
      },
    });
  });

  test("an unresolvable peerDeps name is silently omitted rather than throwing", () => {
    expect(
      createImportMap({
        ...manifest,
        externalDeps: [
          { name: "react", version: "19.2.4", peerDeps: false },
          {
            name: "@radix-ui/themes",
            version: "3.0.0",
            peerDeps: ["react", "svelte"],
          },
        ],
      }),
    ).toEqual({
      imports: {
        "@acme/": "https://assets.example.com/",
        "@esm.sh/": "https://esm.sh/",
        "@esm.sh/react": "https://esm.sh/react@19.2.4",
        // "svelte" has no externalDeps entry, so it's silently dropped from
        // the query instead of throwing — only "react" resolves.
        "@esm.sh/@radix-ui/themes":
          "https://esm.sh/@radix-ui/themes@3.0.0?deps=react@19.2.4",
      },
    });
  });

  test("entries sharing a base package with different versions each keep their own URL, and peer lookups use the first-declared version", () => {
    expect(
      createImportMap({
        ...manifest,
        externalDeps: [
          { name: "react-dom", version: "19.2.4", peerDeps: false },
          { name: "react-dom/client", version: "19.2.5", peerDeps: false },
          { name: "react", version: "19.2.4", peerDeps: false },
          {
            name: "@radix-ui/themes",
            version: "3.0.0",
            peerDeps: ["react-dom"],
          },
        ],
      }),
    ).toEqual({
      imports: {
        "@acme/": "https://assets.example.com/",
        "@esm.sh/": "https://esm.sh/",
        // Each entry's own URL always uses its own declared version — the
        // conflict (19.2.4 vs 19.2.5) stays visible here, it's never
        // silently normalized to one value.
        "@esm.sh/react-dom": "https://esm.sh/react-dom@19.2.4",
        "@esm.sh/react-dom/client": "https://esm.sh/react-dom@19.2.5/client",
        "@esm.sh/react": "https://esm.sh/react@19.2.4",
        // Peer lookup for "react-dom" uses the FIRST-declared version
        // (19.2.4, from the "react-dom" entry, not "react-dom/client").
        "@esm.sh/@radix-ui/themes":
          "https://esm.sh/@radix-ui/themes@3.0.0?deps=react-dom@19.2.4",
      },
    });
  });

  test("resolveImportMapSpecifier prefers an exact match over a shorter matching prefix", () => {
    const importMap = createImportMap({
      ...manifest,
      externalDeps: [{ name: "react", version: "19.2.4" }],
    });

    expect(resolveImportMapSpecifier(importMap, "@esm.sh/react")).toBe(
      "https://esm.sh/react@19.2.4",
    );
  });

  test("resolveImportMapSpecifier resolves via the longest matching prefix when no exact key exists", () => {
    const importMap = createImportMap(manifest);

    expect(resolveImportMapSpecifier(importMap, "@acme/search/index.mjs")).toBe(
      "https://assets.example.com/search/index.mjs",
    );
  });

  test("resolveImportMapSpecifier prefers the longest of two overlapping prefix keys", () => {
    const importMap = createImportMap(
      {
        ...manifest,
        environments: {
          development: {
            sliceOrigins: { search: "http://localhost:5174" },
          },
        },
      },
      { environment: "development" },
    );

    expect(resolveImportMapSpecifier(importMap, "@acme/search/index.mjs")).toBe(
      "http://localhost:5174/index.mjs",
    );
  });

  test("resolveImportMapSpecifier returns undefined when nothing matches", () => {
    const importMap = createImportMap(manifest);

    expect(resolveImportMapSpecifier(importMap, "lodash")).toBeUndefined();
  });

  test("resolves routes by convention without explicit slice config", () => {
    expect(resolveRoute(manifest, "/search/routes")?.specifier).toBe(
      "@acme/search/index.mjs",
    );
  });

  test("applies slicePrefix to conventional specifiers", () => {
    expect(
      resolveRoute({ ...manifest, slicePrefix: "web-" }, "/booking/anything")
        ?.specifier,
    ).toBe("@acme/web-booking/index.mjs");
  });

  test("returns null for the root route unless an override is configured", () => {
    expect(resolveRoute(manifest, "/")).toBeNull();
  });

  test("supports explicit routeOverrides for exceptions", () => {
    const match = resolveRoute(
      {
        ...manifest,
        routeOverrides: {
          "/": "@acme/home/index.mjs",
        },
      },
      "/",
    );

    expect(match?.specifier).toBe("@acme/home/index.mjs");
  });

  test("supports sliceOverrides for slices outside the entryFile convention", () => {
    const match = resolveRoute(
      {
        ...manifest,
        sliceOverrides: {
          legacy: {
            route: "/legacy/*",
            specifier: "@acme/legacy",
            entry: "/legacy/index.mjs",
          },
        },
      },
      "/legacy/anything",
    );

    expect(match?.specifier).toBe("@acme/legacy");
  });

  test("creates an external matcher from the manifest", () => {
    const isExternal = createExternalMatcher(manifest);

    expect(isExternal("@esm.sh/react")).toBe(true);
    expect(isExternal("@acme/search/index.mjs")).toBe(true);
    expect(isExternal("@acme/anything")).toBe(true);
    expect(isExternal("lodash")).toBe(false);
  });

  test("external matcher also matches exactImports and sliceOverrides specifiers", () => {
    const isExternal = createExternalMatcher({
      ...manifest,
      exactImports: {
        react: "https://esm.sh/react@19.2.4",
      },
      sliceOverrides: {
        legacy: {
          route: "/legacy/*",
          specifier: "@vendor/legacy",
          entry: "/legacy/index.mjs",
        },
      },
    });

    expect(isExternal("react")).toBe(true);
    expect(isExternal("@vendor/legacy")).toBe(true);
    expect(isExternal("lodash")).toBe(false);
  });

  test("validates the base manifest without errors", () => {
    expect(
      validateManifest(manifest).filter((item) => item.level === "error"),
    ).toHaveLength(0);
  });

  test("validateManifest warns when externalDeps entries share a base package but declare different versions", () => {
    const diagnostics = validateManifest({
      ...manifest,
      externalDeps: [
        { name: "react-dom", version: "19.2.4" },
        { name: "react-dom/client", version: "19.2.5" },
      ],
    });

    expect(
      diagnostics.some(
        (d) => d.level === "warning" && d.code === "external-deps-version-conflict",
      ),
    ).toBe(true);
  });

  test("validateManifest emits exactly one warning for a group of 3+ conflicting entries, not one per pair", () => {
    const diagnostics = validateManifest({
      ...manifest,
      externalDeps: [
        { name: "react-dom", version: "19.2.4" },
        { name: "react-dom/client", version: "19.2.5" },
        { name: "react-dom/server", version: "19.2.6" },
      ],
    });

    expect(
      diagnostics.filter((d) => d.code === "external-deps-version-conflict"),
    ).toHaveLength(1);
  });

  test("validateManifest does not warn when externalDeps entries sharing a base package agree on version", () => {
    const diagnostics = validateManifest({
      ...manifest,
      externalDeps: [
        { name: "react-dom", version: "19.2.4" },
        { name: "react-dom/client", version: "19.2.4" },
      ],
    });

    expect(
      diagnostics.some((d) => d.code === "external-deps-version-conflict"),
    ).toBe(false);
  });

  test("validateManifest warns when a peerDeps name has no matching externalDeps entry", () => {
    const diagnostics = validateManifest({
      ...manifest,
      externalDeps: [
        {
          name: "@radix-ui/themes",
          version: "3.0.0",
          peerDeps: ["react", "svelte"],
        },
      ],
    });

    expect(
      diagnostics.some(
        (d) => d.level === "warning" && d.code === "external-deps-unresolvable-peer",
      ),
    ).toBe(true);
  });

  test("validateManifest does not warn when every peerDeps name resolves, including via defaultPeerDeps", () => {
    const diagnostics = validateManifest({
      ...manifest,
      externalDeps: [
        { name: "react", version: "19.2.4", peerDeps: false },
        { name: "@radix-ui/themes", version: "3.0.0" },
      ],
      defaultPeerDeps: ["react"],
    });

    expect(
      diagnostics.some((d) => d.code === "external-deps-unresolvable-peer"),
    ).toBe(false);
  });

  test("createImportMapBootstrapScript generates valid, parseable JavaScript", () => {
    const script = createImportMapBootstrapScript(manifest);
    expect(() => new Function(script)).not.toThrow();
  });

  test("createImportMapBootstrapScript embeds the computed import map", () => {
    const script = createImportMapBootstrapScript(manifest);
    expect(script).toContain('"@acme/":"https://assets.example.com/"');
    expect(script).toContain('"@esm.sh/":"https://esm.sh/"');
  });

  test("createImportMapBootstrapScript embeds the manifest's own external dependency configuration, not hardcoded esm.sh defaults", () => {
    const script = createImportMapBootstrapScript({
      ...manifest,
      externalDepsOrigin: "https://cdn.example.org",
      externalDepsPrefix: "@cdn/",
    });
    expect(script).toContain("https://cdn.example.org");
    expect(script).not.toContain("esm.sh");
  });

  test("createImportMapBootstrapScript injects an importmap script via document.head.appendChild", () => {
    const script = createImportMapBootstrapScript(manifest);
    expect(script).toContain("document.head.appendChild(script)");
    expect(script).toContain('script.type = "importmap"');
  });

  test("createImportMapBootstrapScript's embedded dev-flag logic matches createImportMap's own devDeps behavior", () => {
    const manifestWithExternalDeps = defineManifest({
      ...manifest,
      externalDeps: [
        { name: "react", version: "19.2.4", peerDeps: false },
        { name: "zustand", version: "4.5.0" },
      ],
      defaultPeerDeps: ["react"],
    });

    const expectedWithDevDeps = createImportMap(manifestWithExternalDeps, {
      devDeps: true,
    }).imports;

    const script = createImportMapBootstrapScript(manifestWithExternalDeps);

    // Simulate the generated script running with a `?dev` script src, using
    // the same DOM-shape the real browser execution relies on.
    const documentStub = {
      currentScript: { src: "http://localhost/importmap.js?dev" },
      createElement: () => ({}),
      head: { appendChild: (el: { textContent?: string }) => {
        (documentStub as unknown as { result: string | undefined }).result =
          el.textContent;
      } },
    };
    const windowStub = { location: { origin: "http://localhost" } };

    const run = new Function("document", "window", "URL", script);
    run(documentStub, windowStub, URL);

    const producedImports = JSON.parse(
      (documentStub as unknown as { result: string }).result,
    ).imports;

    expect(producedImports["@esm.sh/zustand"]).toBe(
      expectedWithDevDeps["@esm.sh/zustand"],
    );
    expect(producedImports["@esm.sh/"]).toBe(expectedWithDevDeps["@esm.sh/"]);
  });

  test("re-exports createRuntimeHost and notifyInternalNavigation from the public barrel", async () => {
    const target = document.createElement("div");
    const mountSpy = vi.fn(async () => {});
    const importer = vi.fn(async () => ({ default: { mount: mountSpy } }));

    const host = createRuntimeHost({
      manifest: { namespace: "@acme", assetsOrigin: "https://assets.example.com" },
      target,
      importer,
    });
    await host.resolveAndMount("/search");

    expect(mountSpy).toHaveBeenCalledTimes(1);
    expect(typeof notifyInternalNavigation).toBe("function");
  });

  test("re-exports createRuntimeHostObservable from the public barrel", () => {
    const target = document.createElement("div");
    const observable = createRuntimeHostObservable({
      manifest: { namespace: "@acme", assetsOrigin: "https://assets.example.com" },
      target,
    });

    expect(observable.getSnapshot()).toEqual({ type: "idle" });
  });
});
