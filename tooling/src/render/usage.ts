// Kept apart from command.ts so the CLI can print its usage without loading the renderer.
export const RENDER_USAGE = `  proschi render [--out <dir>] [--format svg|md|html|preview-html|hld-md|hld-html] [--expand <id>[,<id>…]] [--focus <id>] [--theme sketch|classic] <file>`;

export const RENDER_HELP = `render  Writes the diagram as static files into --out (default: the current
        directory). svg (default): architecture.svg and <usecase>--<scenario>.svg
        per scenario; md: <file>.md with Mermaid blocks; html: <file>.html with
        the SVGs; preview-html: <file>.preview.html, the VS Code preview as
        a page (a foldable architecture, a scenario picker and each use
        case's description, folded); hld-md / hld-html: <file>.hld.md / <file>.hld.html, the
        high-level design document (overview, requirements, capacity,
        components, data model, APIs, scenarios, decisions, risks).
        Systems are drawn as one box each, with the team's promise and what
        they are sent against their headroom; --expand opens them in place
        (orders.warehouse names one inside another), --focus draws one
        system's design alone. An id that names no system exits with 2.
        --theme sketch (default: cream paper, ink outlines, pink step
        numbers) or classic (white, rounded grey cards, coloured icon tiles,
        blue arrows); without it, the "theme" key of the nearest proschi.json
        applies. An unknown theme exits with 2.
        Refuses (exit 1) when the document has errors.`;

export const PREVIEW_USAGE = `  proschi preview [--port <n>] [--root <dir>] [--theme sketch|classic] [<file>]`;

export const PREVIEW_HELP = `preview Serves the preview-html page of any .proschi file at
        http://127.0.0.1:4280/ (--port to change; 0 picks a free one) until
        Ctrl+C. The start page lists the .proschi files under --root (default:
        the current directory) and has a box to paste a path: absolute, ~/…,
        file://… or relative to the root. Each page has the same box, and
        files are rendered on every request, so a reload shows your edits.
        With <file>, also prints its page's address. It listens on 127.0.0.1
        only and opens only .proschi files. --theme as for render.`;
