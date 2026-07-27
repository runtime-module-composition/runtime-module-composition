# Runtime Module Composition

Runtime Module Composition is a small toolkit for building import-map-based microfrontends with native ESM and dynamic imports.

The project is intentionally split into a framework-agnostic core plus adapters:

- `@rmc-toolkit/core`: manifest, import map, route resolution, validation, and dynamic module loading primitives.
- `@rmc-toolkit/vite`: Vite/Rollup helpers for externalizing import-map-owned dependencies and generating HTML with import maps before module execution.
- `@rmc-toolkit/react`: React boundary for rendering dynamically imported module components.

```bash
npm install @rmc-toolkit/core @rmc-toolkit/vite @rmc-toolkit/react
```

## Vite Local Development With Import Maps

Use environment-specific origins in the manifest when a slice should resolve to a local Vite dev server during development:

```ts
// runtime-composition.manifest.ts
import { defineManifest } from "@rmc-toolkit/core";

export const manifest = defineManifest({
  namespace: "@acme",
  assetsOrigin: "https://assets.example.com",
  externalDepsOrigin: "https://esm.sh",
  externalDeps: [
    // The shared React singleton every other entry's peerDeps pins to by
    // name. Has no peer deps of its own, so it opts out of defaultPeerDeps
    // rather than self-referencing itself.
    { name: "react", version: "19.2.7", peerDeps: false },
    // Needs the same React instance — matches defaultPeerDeps below, so no
    // peerDeps field needed here.
    { name: "react-dom/client", version: "19.2.7" },
    {
      name: "@radix-ui/themes",
      version: "3.3.0",
      // Needs both react and react-dom, which differs from defaultPeerDeps
      // — their versions are looked up from the entries above at
      // generation time, never hand-typed here.
      peerDeps: ["react", "react-dom"],
    },
  ],
  // Applied automatically to every externalDeps entry that doesn't set its
  // own peerDeps (react-dom/client, above).
  defaultPeerDeps: ["react"],
});
```

Then enable the Vite adapter in the host or local shell:

```ts
// vite.config.ts
import { defineConfig } from "vite";
import { runtimeComposition } from "@rmc-toolkit/vite";
import { manifest } from "./runtime-composition.manifest";

export default defineConfig({
  plugins: [
    ...runtimeComposition({
      manifest,
      environment: "development",
    }),
  ],
});
```

The Vite adapter includes the generated import map in Vite's transformed HTML and externalizes manifest-owned specifiers so Vite does not rewrite or bundle imports that should be resolved by the browser. The import map must be present in the initial HTML before any dependent module scripts execute.

## Status

Early scaffold. The current goal is to prove the package boundaries and keep the core portable before adding framework-specific behavior.

## Security Model

The manifest is executable configuration. Every URL it references — `assetsOrigin`, `externalDepsOrigin`, per-environment `sliceOrigins`, `exactImports`, slice entries — becomes an import map entry or a dynamic `import()` target in the browser. Whoever controls the manifest controls what code runs on the page.

What that means in practice:

- **Treat the manifest as code, not data.** Ship it from the same trusted pipeline as your application source and review changes to it with the same rigor. Never build a manifest from user input or fetch it from an origin you don't control.
- **`validateManifest` is a linter, not a security boundary.** It checks shape and consistency (absolute HTTP(S) URLs, namespace conventions, version conflicts). It cannot distinguish a trusted origin from a hostile one that happens to be well-formed.
- **`externalDepsOrigin` is a supply-chain trust decision.** Pointing it at a public CDN (e.g. `esm.sh`) means every page trusts that CDN to serve the exact code it claims. Self-host the external dependencies if your threat model doesn't allow that.
- **Use CSP as the enforcement layer.** A `script-src` policy restricted to your `assetsOrigin` and `externalDepsOrigin` makes the browser reject module loads from anywhere else, even if a manifest entry is compromised. Import maps have no built-in integrity mechanism, so CSP is where origin restrictions are actually enforced.

## Implementation Guides

Each public method has a usage guide in [docs/implementation-guide.md](docs/implementation-guide.md).

## Example

```ts
import {
  createExternalMatcher,
  createImportMap,
  resolveRoute,
} from "@rmc-toolkit/core";

const manifest = {
  namespace: "@acme",
  assetsOrigin: "https://assets.example.com",
  externalDepsOrigin: "https://esm.sh",
};

const importMap = createImportMap(manifest);
const match = resolveRoute(manifest, "/search/routes");
const isExternal = createExternalMatcher(manifest);
```

## Examples

- [`examples/vite-host`](examples/vite-host): a minimal Vite host shell using `runtimeComposition()`. `npm run build` inside this directory produces `dist/index.html` with the import map already present in `<head>`, proving import maps are generated before the browser receives the page rather than injected at runtime.
- [`examples/react-slice`](examples/react-slice): a minimal slice built with Vite library mode using `createRollupExternal()`. It imports React via the `@esm.sh/react` convention specifier, so `npm run build` inside this directory produces a `dist/index.mjs` that never bundles React — the browser resolves it through the host's import map instead.

These two examples are independent, separately-verified fixtures for two distinct architectural claims — they are not wired together into a working end-to-end demo. `react-slice` exports a plain React component for `DynamicModuleBoundary`, which is a different module contract than `vite-host`'s `importModule()`/`unwrapDefault()`/`mount()` DOM contract.

## Development

```bash
npm install
npm run build
npm test
```
