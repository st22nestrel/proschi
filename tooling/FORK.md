# This fork of the `proschi` CLI

This is [st22nestrel/proschi](https://github.com/st22nestrel/proschi), a fork
of [gvart/proschi](https://github.com/gvart/proschi) (MIT). It exists so other
projects can depend on a patched `proschi` CLI. Only
`tooling/` differs from upstream. The package keeps the name `proschi`, and
fork versions are upstream's version with a `-themes.N` suffix, for example
`0.16.1-themes.1`.

## What the fork adds

Selectable render themes for `proschi render` (SVG, and the `html` and
`hld-html` pages that embed the SVGs):

- `sketch` (default, upstream's current look): cream paper, ink outlines,
  hard shadows, pink step numbers.
- `classic`: the look the VS Code extension 0.10.0 preview still has. It has
  a white background, rounded light-grey cards, icon tiles coloured by
  component type, blue request arrows and step numbers, grey dashed
  lifelines, and red dashed error replies.

You pick the theme with `--theme <name>`, or with `"theme": "<name>"` in the
nearest `proschi.json`. The flag overrides the config. The themes are token
sets in `src/render/theme.ts`, which the architecture and sequence renderers
read. Without a theme, the output is byte-for-byte upstream's.

It also adds `proschi render --format preview-html`: `<file>.preview.html`,
the VS Code preview as a standalone page. The architecture sits in a
foldable `<details>`, and a picker shows one scenario at a time (kept in the
URL hash). Each use case's description sits above it, folded, with
`Label: name (detail); …` sentences shown as tables (`src/render/description.ts`).
The page's only script is allowed by its CSP hash.

## Cut a fork release

1. Bump `version` in `tooling/package.json` (and the two matching entries at
   the top of `tooling/package-lock.json`) to the next `-themes.N`, for
   example `0.16.1-themes.2`. After a rebase onto a newer upstream release,
   use that release's version with `-themes.1`.
2. In `tooling/`: `npm ci`, `npm test`, then `npm pack`. That writes
   `proschi-<version>.tgz`.
3. Commit and push. Then create a GitHub release on st22nestrel/proschi
   tagged `v<version>`, and attach the `.tgz`:

   ```sh
   gh release create v0.16.1-themes.2 tooling/proschi-0.16.1-themes.2.tgz \
     --repo st22nestrel/proschi --title "proschi 0.16.1-themes.2" --notes "…"
   ```

4. Consumers depend on the release asset URL:

   ```json
   "proschi": "https://github.com/st22nestrel/proschi/releases/download/v0.16.1-themes.2/proschi-0.16.1-themes.2.tgz"
   ```

Don't publish to npm or any marketplace. The name `proschi` belongs to
upstream. Leave GitHub Actions off on the fork, because upstream's workflows
deploy the site and publish releases.

## Rebase on upstream

```sh
git remote add upstream https://github.com/gvart/proschi.git   # once
git fetch upstream
git switch <fork branch>
git rebase upstream/main          # or the upstream release tag, e.g. tooling-v0.17.0
```

Conflicts usually land in `tooling/src/render/architecture.ts`,
`sequence.ts` and `svg.ts`. Upstream colours and sizes that are written
inline go into the `SKETCH` and `CLASSIC` objects in `theme.ts`, and the
drawing code reads them from the theme. Then run `npm test` in `tooling/`.
`test/render-themes.test.ts` covers both themes and how they are picked. Cut
a new fork release (above) after the rebase.
