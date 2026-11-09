# proschi

Command-line checker and language server for
[Proschi](https://proschi.app/), a small text language for
microservice architectures and the request flows that run through them.

```sh
npm install -g proschi
proschi check docs/                 # validate every *.proschi file below docs/
proschi check --strict --openapi orders=specs/orders.yaml docs/   # also against an OpenAPI spec
proschi parse checkout.proschi      # the parsed diagram as JSON
proschi fmt docs/                   # format files in place (--check: only report, exit 1 for CI)
proschi render checkout.proschi --out diagrams   # SVG diagrams (also --format md|html|hld-md|hld-html)
proschi test docs/                  # run requirements and tests (exit 1 on a failure)
proschi analyze shortener.proschi   # load, latency, availability and cost per node
proschi import mermaid arch.mmd     # Mermaid flowchart/sequence diagram to Proschi (also: import openapi spec.yaml)
proschi problem check               # validate practice problem folders (see docs/PRACTICE.md)
proschi problem new seat-map        # scaffold a practice problem
proschi imports sync                # fetch git:, https:// and cloud: imports into proschi.lock and .proschi/cache
proschi login                       # sign in to your proschi.app account (for cloud: imports and versions)
proschi versions diff orders v1     # what changed in a saved diagram since version v1
proschi-language-server --stdio     # for any editor with an LSP client
```

The commands run the parser of the web editor, so they report exactly what
the editor reports. The language server also formats documents, with the same
formatter as `proschi fmt`. Setup for VS Code, IntelliJ, Neovim, Helix, Sublime Text
and CI: [docs/EDITORS.md](https://github.com/gvart/proschi/blob/main/docs/EDITORS.md).

`check` and the language server can also compare use case steps with the
OpenAPI 3.0/3.1 specs of the services they call (endpoints, status codes,
JSON payloads), mapped in a `proschi.json` or with `--openapi`: see
[Checking against OpenAPI](https://github.com/gvart/proschi/blob/main/docs/EDITORS.md#checking-against-openapi).

`test` runs the `requirements { … }` and `test "…" { … }` blocks of each file
against a capacity model of its `traffic { … }` (`--format text|github|json`);
`analyze` prints that model as a table (`--format text|json`). The language
server reports failing requirements and tests as warnings and adds load to
node hovers. The model and its default numbers:
[Simulation and tests](https://github.com/gvart/proschi/blob/main/docs/EDITORS.md#simulation-and-tests).

`problem check [--format text|github|json] [dir]` validates the practice
problems, one folder each (front matter, given, starter, reference solution
and the `wrong/` designs that must fail, each naming the mistake it makes,
its lesson section and review cards), with the same rules as the practice
page's test suite; `problem new <id> [--dir <dir>]` scaffolds one. Inside the
repository both default to `frontend/src/practice/problems`. The format and
the rules: [docs/PRACTICE.md](https://github.com/gvart/proschi/blob/main/docs/PRACTICE.md).

## Remote imports, sign-in and versions

`proschi imports sync [--frozen | --update [<cloud:spec>...]] [<file|dir>...]` downloads the `git:`,
`https://` and `cloud:` imports of the files into `.proschi/cache` and pins
each in `proschi.lock` (commit it): a git ref to its commit, an https file
to its sha256, and `cloud:<name>` (the newest saved version) or
`cloud:<name>:<tag>` to the version's concrete tag, seq and sha256. A pinned
import stays pinned on later syncs. `--update` moves the given
`cloud:<name>` imports (default: every one) to the newest saved version and
prints each old and new tag; a concrete `cloud:<name>:<tag>` never moves (to
move a git or https pin, delete its entry from `proschi.lock`). `--frozen` (for CI) fails instead of changing the lock. Every other
command (`check`, `render`, `share-link`, the language server) reads the lock
and the cache only and never fetches.

`cloud:` imports are diagrams saved in your own account, so they need
`proschi login` first. It opens the browser to sign in (and prints the link,
for a machine without one), takes the answer on a one-time
`http://127.0.0.1:<port>/callback`, and stores the tokens in
`$XDG_CONFIG_HOME/proschi/credentials.json` (`~/.config/proschi/…`, or
`%APPDATA%\proschi\…` on Windows), readable by you only. `proschi logout`
ends the sign-in and deletes them; `proschi whoami` prints the account.
The tokens can only read your name and your saved diagrams: never billing,
credits, mock interviews or account settings. Settings on proschi.app lists
the sign-in.

`proschi versions list <name>` prints a diagram's saved versions, and
`proschi versions diff <name> <base-tag> [<target-tag>|<file.proschi>]` what
changed from one to another (default: latest) or to a local file: nodes,
edges, use cases, scenarios, requirements, traffic, capacity and systems,
with `--json` for scripts. They only read the account. `--base <url>` points
`login`, `logout`, `whoami`, `versions` and `imports sync` at another site
(https, or http://localhost for development).

## Rendering

```
proschi render [--out <dir>] [--format svg|md|html|hld-md|hld-html] [--theme sketch|classic] <file>
```

- `svg` (default): `architecture.svg`, plus `<usecase>--<scenario>.svg` with a
  sequence diagram for every scenario
- `md`: `<file>.md` with Mermaid blocks (architecture and every scenario),
  which GitHub and GitLab render natively
- `html`: `<file>.html`, a single self-contained page with all the SVGs and a
  scenario list

`--out` defaults to the current directory; the written paths are printed.
Imports are followed as for `check`. A document with errors in any of its
files is not rendered (the errors are printed, exit code 1); warnings don't
stop it. The SVGs are self-contained, with a white background, and look like
the web editor's canvas (same layout, cards and icons). The renderer is a
separate bundle (`dist/render.cjs`), loaded only by `proschi render`.

`--theme` picks the look of the SVGs (and of the `html` / `hld-html` pages
that embed them):

- `sketch` (default): the canvas look, with cream paper, ink outlines, hard
  shadows and pink step numbers
- `classic`: the earlier look, with a white background, rounded light-grey
  cards, icon tiles coloured by component type, blue request arrows and step
  numbers, and grey dashed lifelines

Without the flag, the `"theme"` key of the nearest `proschi.json` applies
(`{"theme": "classic"}`), so a repository sets it once; the flag overrides
it. An unknown theme is refused with exit code 2.

Also in this package:

- `grammar/proschi.tmLanguage.json`: TextMate grammar for syntax highlighting
- `schema/proschi-diagram.schema.json`: JSON Schema of `proschi parse` output

## Development

```sh
npm ci
npm test                 # builds, then runs the tests (CLI, server over stdio, OpenAPI checks, grammar, schema)
npm run typecheck
npm run package:vscode   # dist/proschi.vsix
```

`npm run build` also regenerates the JSON Schema; a test fails if the committed
copy is out of date.
