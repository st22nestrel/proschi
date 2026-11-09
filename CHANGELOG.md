# Changelog

All notable changes to Proschi are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the tooling
(the `proschi` npm package and the VS Code extension) follows
[Semantic Versioning](https://semver.org/). Versions are tagged
`tooling-v<version>`; the web app at <https://proschi.app/> is
deployed from `main` and ships with the same changes. From 0.12.0 on,
[release-please](https://github.com/googleapis/release-please) writes each
section from the conventional commit titles of the merged pull requests.

## [0.16.2](https://github.com/gvart/proschi/compare/tooling-v0.16.1...tooling-v0.16.2) (2026-11-09)


### Fixed

* **billing:** hide credit-metered features until paid plans launch ([#193](https://github.com/gvart/proschi/issues/193)) ([b62181c](https://github.com/gvart/proschi/commit/b62181cb576a8d1ead999abe8919823e5e1a92d2))
* **practice:** steps not stages, a one-row phone header, readable skill map labels ([#191](https://github.com/gvart/proschi/issues/191)) ([84869a2](https://github.com/gvart/proschi/commit/84869a285d3897f357fe551ca0746c7729c11e7d))

## [0.16.1](https://github.com/gvart/proschi/compare/tooling-v0.16.0...tooling-v0.16.1) (2026-11-09)


### Fixed

* **backend:** the full Turnstile site key ([#189](https://github.com/gvart/proschi/issues/189)) ([85685ff](https://github.com/gvart/proschi/commit/85685ff80b46dff6dd8110b6ae550825e2666728))

## [0.16.0](https://github.com/gvart/proschi/compare/tooling-v0.15.1...tooling-v0.16.0) (2026-11-09)


### Added

* paid plans on metered credits, mock interviews, Design partner, email sign-up, campaigns and feedback ([#182](https://github.com/gvart/proschi/issues/182)) ([fab4f20](https://github.com/gvart/proschi/commit/fab4f209ec5cc9a3ad75da7b4f634f5605a9a420))

## [0.15.1](https://github.com/gvart/proschi/compare/tooling-v0.15.0...tooling-v0.15.1) (2026-11-02)


### Fixed

* **editor:** let Add component be clicked on an empty diagram ([#178](https://github.com/gvart/proschi/issues/178)) ([084b6b5](https://github.com/gvart/proschi/commit/084b6b5f1de0a25ae5edfa59865ff9df13981ebb))
* **playback:** play a response where it is written, and a par group as one frame ([#176](https://github.com/gvart/proschi/issues/176)) ([9339be6](https://github.com/gvart/proschi/commit/9339be60aaf1a3a28a841b253d21dccadcccdd39))

## [0.15.0](https://github.com/gvart/proschi/compare/tooling-v0.14.0...tooling-v0.15.0) (2026-11-01)


### Added

* **editor:** diagrams sidebar with folders, quick open and a leaner header ([#171](https://github.com/gvart/proschi/issues/171)) ([82d1c47](https://github.com/gvart/proschi/commit/82d1c475fed82cf6c1e23bbdf9237aadaddc520d))

## [0.14.0](https://github.com/gvart/proschi/compare/tooling-v0.13.0...tooling-v0.14.0) (2026-11-01)


### Added

* diagram versions and cloud references ([#169](https://github.com/gvart/proschi/issues/169)) ([eea0e13](https://github.com/gvart/proschi/commit/eea0e13d288b733d5f7147485a8a64e761ae6fcb))


### Fixed

* **dsl:** the formatter keeps references to a system's entry points (orders.api) whole ([eea0e13](https://github.com/gvart/proschi/commit/eea0e13d288b733d5f7147485a8a64e761ae6fcb))
* **editor:** save pulled diagrams before the sync state, so closing the tab right after a pull can no longer delete a diagram from the account ([eea0e13](https://github.com/gvart/proschi/commit/eea0e13d288b733d5f7147485a8a64e761ae6fcb))

## [0.13.0](https://github.com/gvart/proschi/compare/tooling-v0.12.0...tooling-v0.13.0) (2026-11-01)


### ⚠ BREAKING CHANGES

* imports are confined to a root. Without a proschi.json and outside a git repository, a file can no longer import ../ paths above its own folder; add a proschi.json at the folder that should be the root.

### Added

* team system boxes and pinned imports across repositories ([#166](https://github.com/gvart/proschi/issues/166)) ([7102996](https://github.com/gvart/proschi/commit/7102996e292aceab13ef972979a167d128597b13))

## [0.12.0](https://github.com/gvart/proschi/compare/tooling-v0.11.0...tooling-v0.12.0) (2026-10-29)


### Added

* **plugin:** draw Proschi diagrams natively in the Claude Code terminal ([#164](https://github.com/gvart/proschi/issues/164)) ([81575ad](https://github.com/gvart/proschi/commit/81575ad7cd935d34f4d0e89d4cc33f2ad63d27c8))

## [0.11.0] - 2026-10-25

### Added
- **Colors, a legend and a critical marker.** Nodes are now tinted by
  category (clients, edge, services, data stores, queues, external) in
  calm colors that work in light and dark. `color teal` or `color #0891b2`
  sets a node's or group's color. A `legend { owned "Owned by us" green }`
  block names styles (a color, and `dashed` or `dotted`), and `.owned`
  applies one to a node, a group or a connection (`a -> b .planned : label`).
  The legend is drawn on the canvas, in PNG and SVG exports and by
  `proschi render`. `critical` puts a warning badge on a node. Unknown tags
  and colors are errors. The editor, VS Code and JetBrains highlight the new
  words, and the new "Colors and legend" example (`?example=styled`) shows
  all of it.
- **Colors in the Mermaid export.** The Mermaid architecture flowchart (Copy
  Mermaid, the `.mmd` download, `proschi render --format md` and the HLD
  Markdown) now keeps the diagram's colors: a `classDef` per style for nodes,
  `style` for colored groups, and `linkStyle` for tagged connections,
  including dashed and dotted lines. Mermaid has no legend, so it is left out.
- **Layout hints.** `layout ordered` lays edges out in declaration order,
  so what is declared first sits higher. `rank 0`, `rank 1`, … (or
  `rank first` / `rank last`) on a node or group puts it in a row among its
  siblings. `direction right` (or down, up, left) turns the whole diagram, or
  only the members of a group, such as a Kafka cluster's topics in one row.
  The editor, VS Code
  and JetBrains highlight and complete the new words, and the "Colors and
  legend" example now uses `layout ordered`, so Order Events stays below
  the services around it. See "Steering the layout" in the language
  reference.
- **Agent skills that draw readable diagrams.** A new `image-to-proschi`
  skill recreates a screenshot or image of an architecture diagram, keeping
  its legend and reading order. Every skill now teaches edge direction,
  declaration order by tier, grouping, one edge to a group instead of one per
  member, when to use a legend, tags and `critical`, and a mandatory step
  that renders the diagram and fixes crossings and sprawl before finishing.
  The shared cheat-sheet is now a short core (about 150 lines) that agents
  can skim; the simulation numbers and use case step rules moved into the
  skills that need them, and every drawing skill declares siblings in the
  source's reading order, which the layout keeps wherever that adds no
  crossings.
- **A `broker` kind for message brokers and event logs.** Kafka, Redpanda,
  Pulsar, NATS, RabbitMQ, ActiveMQ, Kinesis, MSK, SNS, EventBridge,
  Pub/Sub, Service Bus, Event Hubs and Event Grid are now brokers, with
  their own icon and colour and a generic `[Message Broker]`. SQS and other
  plain queues stay `queue`. A broker is simulated exactly like a queue,
  and `any queue` still selects brokers, so existing tests keep passing;
  `any broker` selects brokers only.
- **Resize the editor's panes.** Drag the splitter between the code and
  the diagram (or focus it and use the arrow keys); the diagram re-fits
  and the size is remembered in this browser. Phones keep one pane at a
  time.
- **One account control on every page.** The header shows a Sign in
  button when signed out and your name with a menu when signed in, now
  also in the editor, the docs, problem and card pages and the 404 page.
- **Offers after a first solve.** The "First solve" card offers the
  leaderboard and email reminders right there.
- **Leave playback with Escape** or the new "Exit playback" button.
- **A plugin for JetBrains IDEs** (IntelliJ IDEA, WebStorm, PyCharm and the
  others, 2025.3 and newer), in `tooling/jetbrains`: highlighting from the
  TextMate grammar, with node ids, tech stacks and teams colored through the
  language server (*Settings | Editor | Color Scheme | Proschi*), the
  language server through the IDE's built-in LSP client (errors as you type,
  quick fixes, completion, hover, go to definition, find usages, structure,
  Reformat Code), *Check File*, *Run Tests*, a diagram preview tool window
  that fits the diagrams to its width and follows the IDE theme, and *Open
  in Proschi*, with a settings page for the server, CLI and Node.js paths.
  Install it from the
  [JetBrains Marketplace](https://plugins.jetbrains.com/plugin/34955-proschi).
- **The language server sends semantic tokens** for node ids, tech stacks
  and teams, so editors can color them apart from other names.
- **`proschi render`, the VS Code preview and HLD exports draw in the
  editor's new look**: paper background, monochrome cards with a thick
  border, hard shadow and handles, monospace tech stacks and edge labels,
  upper-case group names, and pink step numbers in sequence diagrams.
- **The VS Code preview fits the diagrams to the panel's width** instead of
  showing them at full size with scroll bars.
- **Admin panel** at `/admin/`, signed in with a **passkey** (no username
  or password). The first passkey is registered with a one-time
  `ADMIN_SETUP_TOKEN` secret and only while none exists; more can be added
  as backups. Tabs: **Overview** (accounts, active users, sign-ups, content
  and the daily usage counts as charts), **Health** (database, deployed
  version, each scheduled job's last run, errors and rate limits,
  configuration checks), **Users** (search, filter, an account's detail;
  block and unblock, sign out everywhere, rename, make the profile private,
  remove the email address, delete), **Short links** (list and delete),
  **Events** (server errors, failed sign-ins, rate limits, cron runs),
  **Audit log** and **Passkeys** (backend/README.md, "Admin panel").
- **Blocked accounts** are signed out everywhere and cannot sign in (the
  practice page says so), their profile is made private and their short
  links answer "not found" while blocked.

### Changed
- **Diagrams read in the order they are written.** Nodes side by side in a
  row now come left to right in declaration order wherever that costs no
  crossing: a group's members keep their order, and a layout that came out
  mirrored is turned round. Edges into one member of a group with its own
  `direction` now meet it side by side instead of in one point.
- **Tidier automatic layout for large diagrams.** Connections are drawn as
  right-angled routes around the boxes, with an arrowhead and the label on
  the line, in the editor and in `proschi render`. When connections form a
  cycle, the node declared first goes higher. On a 50-node benchmark
  diagram, crossings drop from 116 to 17 and no connection passes through
  a box any more. While you drag a node its connections take a simple
  right-angled path until the next layout.
- **Clearer practice navigation.** Problems, Roadmap, Review, Challenge,
  Arcade and Progress are now one row of buttons at the top of every
  practice page, the current one in yellow, and the bar no longer moves
  when you switch. On a phone they show as a grid of three by two instead
  of a strip that scrolled sideways. Switching to a section whose code is
  still loading keeps the page's height instead of collapsing to a small
  spinner and growing back, and pointing at a section starts loading it.
- **Running a problem's tests shows that they are running.** The Run tests
  button spins and the last results dim for a moment before the new
  verdict appears.
- **Docs that are easier to follow.** The previous / next links follow the
  sidebar, starting with *Why Proschi*. The language reference explains
  parallel steps, starts each high-level design block with what it is for,
  uses plain words instead of strings of code, and its scenario and design
  examples are complete diagrams. Wide tables and the model page's formulas
  and default profiles fit the column without scrolling sideways. *Editor
  support* links the plugins on the JetBrains Marketplace and Open VSX, and
  the contributor guides have their own *Contribute* group.
- The server keeps each account's last active day (a date, at most one
  write a day) for the admin's active-user counts, and app events and an
  audit log of admin actions (docs/PRIVACY.md, "The site's operator").
- **Practice problems open on their lesson, then a calmer workspace.** An
  unread lesson comes first, as a page of its own with "Start the
  challenge" at the top and the bottom. The workspace then shows the
  problem, the editor and the diagram side by side in panes you can resize
  by dragging. The tests stay folded under them until the first run. The
  tests panel shows no warnings before you run. The **Lesson** button opens
  the lesson in a drawer beside your work, and anything you revealed or
  answered in it stays open. Phones follow the same steps, with Problem,
  Code, Diagram and Tests tabs. The roadmap banner is a single slim line.
- **Landing page SEO.** A shorter title and meta description that fit in
  search results, the main keywords in the hero heading (read by search
  engines and screen readers, not shown), and Twitter title and
  description tags.
- **A shorter landing page**: one "Break it, then test it" section,
  three featured problems with a link to all of them, the examples under
  the editor button, and the Arcade as a banner.
- **The Practice home leads with one "Your next step" card**, with
  compact chips for the daily review, challenge and Arcade run.
- **Progress (`#/progress`) is the one place for your level, streaks,
  skills, roadmap, badges and solved problems**, led by your next step
  and the next three badges to earn (all badges fold away). `#/me` is
  now Settings: leaderboard, email reminders, display name, sign-in
  methods, data download, sign out and a danger zone for deleting the
  account. The account menu has only Your progress, Settings and Sign
  out.
- **The problem Tests panel shows failing tests and their fixes first**,
  folds the passing tests and "How others did", and grows taller while
  tests fail. On phones, Reset and Help share one "More" menu.
- **Leaderboards show from 3 entries**; until then one line invites you
  to opt in.
- **Every roadmap lesson is readable**; only the challenges keep their
  order. Stages count the optional tutorial ("+ 1 optional").
- **A Scale or Fail run fills the screen**: the practice tabs, streak and
  footer hide, the forecast sits beside the board, and the palette and
  Deploy stay in a sticky bar. The HUD explains Trust, and the report
  explains mutators and bounties when they unlock.
- **Daily review** brings each new card into view and keeps Next on
  screen; estimates within 10% say "Correct" instead of "Close enough".
- **The daily challenge shows when it resets in your local time.**
- **The editor tour's last step** covers only sharing and saving.
- The design review no longer announces an AI reviewer.

### Fixed
- **Connections to and from a group show on the web canvas.** An edge
  such as `gw -> services`, where `services` is a group, was left out of
  the editor, docs and practice canvases (the CLI render drew it). It is
  now drawn with its route, label, tag style and arrowhead.
- **Playing a use case no longer flickers.** In the editor, the docs'
  live examples and the landing page demo, Play, Replay and leaving
  playback restyle the diagram already on screen instead of swapping in a
  new canvas: no flash, no jump, and the packet moves smoothly without
  redrawing the whole diagram on every frame. In the editor the diagram
  glides to fit the room left by the step panel.
- A test that names a missing use case suggests adding it
  (`Add usecase "Redirect" { … }`); an existing name is suggested only
  for a likely typo.
- "Solved by X of Y" and the problem leaderboards update right after a
  solve instead of up to a minute later.
- The quick tour popover no longer jumps under the cursor, and a
  finished step stays finished.
- Practice pages scroll to the top on a new tab and restore the position
  on back and forward.
- No console errors when a page-to-page transition is cut short.
- "1 component" and "1 use case" in the HLD instead of "1 components",
  "1 use cases".
- Playback shows request and response formats as JSON, XML or Text
  instead of `FREE_TEXT`.
- Edge labels no longer hide behind a node beside a long edge.
- The arcade wave summary says "Trust is full (100)" instead of
  "Trust +0 (+5 clean)".
- Selected text in the editor is clearly visible in both themes, also on
  the cursor's line.
- Tab in the editor accepts the open completion; otherwise it indents at
  the cursor (or indents the selected lines), and Shift-Tab outdents.
- The header's "Open the editor" button no longer drifts toward the
  pointer and over the theme toggle.

## [0.10.0] - 2026-10-08

### Added
- **Livelier lessons.** Every roadmap lesson and the "Read first" guide
  are rewritten tighter, with new lesson blocks: an *In 30 seconds*
  summary at the top, key-number tiles in the back-of-the-envelope,
  tip / pitfall / interview / takeaway callouts, folding deep dives for
  the long tangents, and **quick checks**: review cards answered right in
  the lesson and graded on the spot with their explanation (practice
  only; the review schedule is untouched). The static problem pages show
  the same blocks as plain HTML, the quick checks linked to their cards.
  Authors write them as fenced blocks (`tldr`, `callout`, `numbers`,
  `deepdive`, `quiz`), checked by `proschi problem check`
  (docs/PRACTICE.md, "Lesson blocks").
- **Reading progress.** A lesson counts as read once you reach its end
  or start its challenge. The roadmap marks each lesson and the guide
  read, and counts the lessons read per stage and in all. Signed in,
  reads are kept with your account (`POST /api/me/lessons`), so they show
  on every device and come along when you sign in.
- **Four reading badges**: First lesson, Avid reader (10 lessons), Stage
  scholar (every lesson of a stage) and Bookworm (every lesson), with the
  new rule kinds `lessons`, `stage-lessons` and `all-lessons`.

## [0.9.0] - 2026-10-07

### Added
- **Agent skills.** Six skills in the open Agent Skills format
  (`plugin/skills/`) teach AI coding agents to turn what a repository
  already has into Proschi and check it: `infra-to-proschi` (docs, Mermaid,
  Terraform, CloudFormation, CDK, Kubernetes, Helm, docker-compose),
  `code-to-usecases` (routes, handlers, consumers and clients, or an OpenAPI
  spec, to use cases with failure scenarios), `proschi-capacity-plan`,
  `proschi-design-review`, `proschi-keep-in-sync` (architecture drift in a
  pull request) and `proschi-hld-doc`. Each validates with `proschi check`
  and `test` until clean and ends with a share link. In Claude Code the
  repository is a plugin marketplace: `/plugin marketplace add
  gvart/proschi`, then `/plugin install proschi@proschi`; for Codex, Cursor,
  Copilot and Gemini CLI, `npx degit gvart/proschi/plugin/skills
  .agents/skills` and one line in the agent's instructions file. See the new
  *Agent skills* docs page.
- **Three new practice problems**, each with a lesson, hints, an interview
  mode and five known mistakes: **Web Crawler** (a durable frontier,
  per-host politeness and a Bloom filter for seen URLs; in *Queues and async
  work*), **Distributed Key-Value Store** (consistent hashing, N = 3 with
  quorum reads and writes, hinted handoff and read repair; in *Partitioning
  and replication*) and **Collaborative Docs** (one sequencer per document,
  an operation log written before the ack, pub/sub fan-out of edits and
  cursors, snapshots; in *Fan-out and real-time delivery*). 29 problems in
  all.
- **Failing tests teach.** When your design fails a problem's tests the way a
  known mistake does, the problem page names it under the tests (*Common
  mistake: …*), explains what breaks and what to do instead, links the lesson
  section that teaches the fix and lists the review cards that train it.
  **Add these cards to my review** puts them first in your daily review, due
  now. Every one of the 90 wrong designs names its mistake, and
  `proschi problem check` checks the new `# mistake:`, `# explain:`,
  `# lesson:` and `# cards:` lines.
- **Hello, Proschi**, a tutorial problem for the language: nodes,
  connections, a use case with its request and response, the traffic, a
  requirement, and a replica that fixes availability, one test per idea. It
  is the first step of the roadmap, recommended and open without signing in,
  but optional: it locks nothing and stage completion and badges do not
  count it.
- **Your diagrams on every device.** Signed in on proschi.app, the editor
  keeps your diagrams in your account as well as in the browser: edits are
  saved about two seconds after you stop typing (and when you leave the
  page), changes from your other devices arrive when you open or return to
  the editor, and the diagrams already in your browser are uploaded the
  first time you sign in. Editing never waits for the network: offline, the
  editor says so and catches up later. A diagram changed on two devices is
  never overwritten: both versions are kept, yours as "<name> (conflict
  <date>)". The Diagrams menu shows where your work is saved, and cloud sync
  can be turned off there; **Delete my cloud copies** removes them from your
  account. Your account keeps up to 5 diagrams for now: the others stay in
  the browser, marked "This browser only" in the Diagrams menu, which says
  how full the account is ("Saved to your account (3 of 5)") and lets you
  swap a diagram in or out of the cloud. Synced diagrams are in **Download
  my data** and go with the account (docs/PRIVACY.md). On a shared computer another account never gets
  your diagrams: they leave the browser when it signs in, diagrams already
  there are only added after asking, and signing out can remove the synced
  ones from the browser.
- **Email reminders, opt-in.** Signed in, enter an email address on your
  account page and confirm it from the link we send: then get a nudge in
  your evening when your streak is at risk or 5 or more cards are due, and a
  weekly recap on Monday morning, each switchable. At most one email a day;
  after three in a row with no practice they pause until you resume them.
  Every email has a one-click unsubscribe link, which deletes the address.
  The address is in **Download my data** and goes with your account
  ([privacy](docs/PRIVACY.md#email-reminders)).
- **A GitHub Action**, `gvart/proschi/action@<tag>`: checks and tests the
  `.proschi` files in a repository (errors and failing requirements as
  annotations; the job fails on them) and, on pull requests, keeps one
  comment up to date with a row per changed diagram (nodes, tests passed,
  requirements met, monthly cost, worst p99) and an *Open in Proschi* link.
  Inputs `files`, `test`, `openapi`, `comment`, `render` and `version`; it
  needs `pull-requests: write` for the comment and skips it on forks. See
  [the GitHub Action](docs/EDITORS.md#github-action).
- **`proschi share-link <file>`** prints the web editor's `#code=` share link
  for a file, with the files it imports.
- **The VS Code extension is published to the VS Code Marketplace and Open
  VSX** on each tooling release, with an icon and a screenshot.
- **One daily streak for any daily practice.** The daily goal is now met by
  your cards for the day, a solved problem, the daily challenge or a
  finished Arcade run (played to the end, not just started), with freezes
  and milestones as before. Past challenges and Arcade runs count too, so a
  streak may have grown. The challenge page shows the challenge's own days
  in a row as a sub-stat ("Challenge: 4 days in a row") under the one streak
  at the top of interview prep, and the weekly recap lists challenges and
  Arcade runs when the week had any.
- **Per-problem leaderboards**: under how others did on a problem, after a
  run, the cheapest passing design and the lowest p99 of those who chose to
  appear on the leaderboard, with your own rank. They come only from designs
  the server ran the tests on itself, keep your best (a cheaper design later
  moves you up) and break ties by who got there first.
- **Share your results.** A finished Arcade daily run shares a square per
  wave (🟩 clean, 🟨 hit, 🟥 lost), the score and today's rank, and "Beat my
  score" dares a friend with a link that opens today's daily run
  (`#/arcade/daily`). A first solve shares its cost against the reference and
  its p99 with a link to the problem, and a new badge, with a public profile,
  a link to it. On phones the share sheet opens; elsewhere the text is copied.
- **Public profiles have addresses of their own**, `proschi.app/u/<id>`,
  with the profile's name, solved problems, badges and streak in the link
  preview and a picture card made for it. Only profiles their owner made
  public have one; `#/u/<id>` keeps working.
- **Short links with a preview, and embeds.** The editor's Share button is a
  menu now. Signed in, **Short link with preview** stores the diagram on
  proschi.app and copies `https://proschi.app/s/<id>`: short whatever the
  diagram's size, and link previews in chat apps show its title and an
  image of the diagram. **Embed** copies an `<iframe>` of a new read-only
  page (`/embed/`): the diagram, its use cases to play and **Open in
  Proschi**, with `theme=light|dark`; short links also answer oEmbed.
  **Your short links** lists and deletes yours; they are in Download my
  data and go with the account. Signed out, links work as before, and the
  long-link warning points to short links. See
  [Sharing and embedding](docs/SHARING.md).
- **Import from Mermaid and OpenAPI.** *Diagrams › Import Mermaid or
  OpenAPI…* turns a Mermaid flowchart or sequence diagram (or Markdown with
  several ```` ```mermaid ```` blocks) into a Proschi document: shapes and
  labels become kinds, subgraphs groups, link labels connection labels, and
  messages, `alt` and `par` blocks a use case. An OpenAPI 3 spec (YAML or
  JSON) becomes a starter design with a use case per operation. Paste or pick
  a file, check the preview and its warnings, open it as a new diagram. The
  CLI has the same: `proschi import mermaid|openapi <file>`.
- **Start from…** The editor's examples gallery is searchable and filtered by
  pattern (cache, queue, CDN, fan-out, sharding, replication, rate limiting…),
  with tags derived from each design. It also offers the reference solution of
  every practice problem you have solved; the others are listed as "Solve …
  to unlock", linking to the problem.
- **Every review card has a page of its own** at `practice/cards/<topic>/<id>/`:
  the question, the answer with why (every option of a choice card with the
  right one marked, the full sentence of a fill-in-the-blank, the worked
  estimate), the problems it prepares for, the previous and next card of its
  topic and a way into daily review. `practice/cards/` lists the topics and
  each topic has a page listing its cards. All are in the sitemap, and a
  problem's page now links to the cards that prepare for it.
- **Shared links show what they are about**: each problem page and card topic
  has its own preview image (title, difficulty, a line about it) instead of
  the site-wide one.
- **Interview mode** on every practice problem, off unless you turn it on:
  a 30, 45 or 60 minute clock you can pause, and four phases. *Clarify*
  hides the scale and constraints until you ask good questions (weak ones
  get told why); *Estimate* grades back-of-the-envelope numbers against a
  range and shows the worked answer; *Design* is the usual editor and
  tests; *Wrap-up* is a self-review and a summary of time per phase,
  questions, estimates and tests. Everything stays in your browser.
- **Guided walkthrough** for the roadmap's first stage (URL Shortener,
  Pastebin, Always-writable Shopping Cart, Snowflake IDs): a side panel of
  short steps, each unlocked by a checkpoint on your design. Skippable, and
  it remembers where you were.
- `proschi problem check` validates `interview.md` (good questions must
  reveal facts from the statement; estimates need a number and a range) and
  `guided.md` (valid checks that the reference solution passes).
- **A gentler first run in the Arcade.** Until your first clear of a Scale
  or Fail scenario, runs play the basic rules: no mutators, bounties,
  contracts or card sets, an exact forecast, no unannounced or cascading
  incidents, and no live changes during a wave. In Shortly's first wave
  Kernel walks you through it: place a load balancer, add a replica, load
  test, deploy (skippable, shown once). After your first clear, Kernel
  introduces the twists before your next run. The daily run always has
  every twist, for everyone. The server decides the rules from your stored
  progress, so ranked runs replay exactly. New leaderboards start with this
  version.
- **Anonymous usage counts.** proschi.app now counts, per day, how often a
  few things happen (the editor opened, a first edit, tests run, a problem
  solved, a sign-in, …) to see where people get stuck. Only the event's name
  is sent, and the server keeps one number per day and event: no user id,
  IP address, cookie or page address, kept for 400 days. Nothing is sent when
  the browser asks not to be tracked (Do Not Track or Global Privacy
  Control). The privacy page lists every count.
- **Hold the line**: in the Arcade a wave's run is no longer something you
  watch. Change the board while it runs and ship it live: scaling lands the
  next tick, new components and wires in two, and a cache that goes live
  mid-wave starts cold. Three live changes a wave, next to the on-call's
  instant (and dearer) actions. Works on a phone: the dock swaps the on-call
  menu for the palette.
- **Scale or Fail is less of a solved puzzle.**
  - **Forecasts are now ranges.** The real traffic lands within 12% of the forecast (20% on a boss), so a load test tests the middle and headroom is a choice.
  - **Some incidents come unannounced** from wave 5.
  - **Incidents can cascade.** One that broke something badly sets off the next (at most one a wave): a lost cache node comes back cold, a stampede knocks the database over, a dead primary brings a storm of retries.
  - **The on-call has a menu**, paid in three points of attention a wave: one more replica, bring a lost node back, warm the cache, rate-limit at the edge, or switch a feature off.
  - **Each wave offers three bounties.** Take one or none; missing it costs a quarter of its cash.
  - **Six new cards bend a rule for a price.** Kubernetes autoscales at 25% more per app server, and Skip staging pays $600 and costs Trust.
  - **Three cards of one topic make a set:** points ×1.1.
  - **A right-sized wave refunds** a tenth of its bill.
  - New leaderboards start with this version.
- **The Arcade teaches Proschi as you play.** The code pane opens in steps:
  in Shortly it first watches the board, lighting up the line each change
  writes, and lets you type from wave 3; in Drop, act 3 is typed only (on a
  wide screen). Completion inside `[ ]` offers only the components you can
  place, Users and the externals cannot be typed away, and a burst of typing
  is one undo step. A new **Compiled** tab shows the whole document the
  simulation runs (your board, the use cases, the peak traffic and the
  requirements), with a warning on every line that broke after a load test
  or during the run. Which use cases an app server handles can be typed as
  `# handles: book, pay`, and a **Code only** button in a run's header lets
  you type every scenario. "Open in editor" now keeps instance sizes.
- **Favicon fallbacks**: a `favicon.ico` for browsers and search results
  that skip SVG icons, and an Apple touch icon for home screens.
- **Mutators and bounties** in Scale or Fail, so no two runs want the same
  design. A run starts with a choice of three mutators: users on another
  continent, a dearer SQL licence, a read storm, a write-heavy crowd, a
  flaky zone, a lean seed round or a cache vendor in trouble. Each changes
  the design that wins and multiplies your points (×1.1 to ×1.3). Every wave
  also has an optional bounty, such as keeping app servers under 50%,
  keeping the bill under 40% of revenue, or getting through a boss without
  dropping a request. Met, it pays cash at once and points. Kernel mentions
  both, the debrief and the report count them, and the daily run offers
  everyone the same ones. New leaderboards start with this version.
- **Kernel**, the Arcade's cat SRE lead: at the start of every wave it briefs
  you in a speech bubble that types itself out. It says how traffic changed
  since last month, which use cases go live, and the new requirements in
  plain words ("Redirect must answer in under 200 ms for 99% of requests"),
  plus the incidents coming. Boss waves open with their own intro and a
  worried cat. Tap to show it all, "Got it" to put it away, and the cat
  button in the run's header turns briefings off.
- **Legacy rescue** and **Cost crunch**, the last two design-first Arcade
  modes. **Monolith** (8 waves): strangle a ten-year-old shop's monolith
  behind a gateway, extract search and a catalog API, split the orders table
  with expand and contract, and retire the XML export once partners stop
  calling it. **Runway** (7 waves): an over-built startup must halve its
  cloud bill while keeping its SLA, a failover and a zone drill.
- **On-call**, a design-first Arcade mode, and its scenario **Dinnerbell**:
  five pages for a food-delivery app (a TV-ad spike, a dead database primary,
  a bot flood, a cold cache, a lost zone), each with its alert and logs. Name
  the root cause before you act (every answer explains why it is right or
  wrong), then fix it on the board.
- **Chaotic Startup**, a design-first Arcade mode, and its first scenario,
  **Pawprint**: a pet-sitter startup where a ticket lands every wave (a
  feature, a customer complaint, a lawyer, a launch). Ship booking API v2 next
  to v1 and sunset v1 only once its clients are gone; change the schema by
  expand and contract, one phase a wave (expand, dual-write, backfill,
  cutover, contract), with rollback, or all at once and watch writes lock.
  No card draft: the design is the game. Two review cards join the deck:
  expand-and-contract migrations and online backfills.
- **Scale or Fail on the editor's canvas.** The Arcade's board is drawn with
  the editor's nodes, icons and connections, with the simulation overlay
  (heat, stacked replicas, load bars, request particles); drag from a node's
  bottom dot to another to wire them. A **Code** tab shows the board as
  Proschi text you can edit instead of tapping.
- **`size S|M|L`** in `capacity` blocks: an instance size that scales a
  tech's default capacity (×1, ×2, ×4) and cost (×1, ×1.8, ×3.5); an explicit
  rate or cost wins. The editor's settings panel has an **Instance size**
  picker. The Arcade's sizes are the same numbers.
- **Overlay: load** on the editor's canvas, for documents with a `traffic`
  block: each node heats up from paper to yellow, pink and red with how busy
  it is, shows its replicas (stacked), shards and load, shakes past 100%,
  and requests flow along the connections as dots (hollow for async work).
  The Arcade will draw its board the same way.
- **Build diagrams without typing.** The editor's canvas has an **Add
  component** palette (search the catalog, click to add or drag onto the
  canvas) and a settings panel for the selected node or connection: name,
  tech, replicas, owner, description, capacity, latency, availability, cost,
  shards and connection labels. Every change is written into the text, which
  stays the source of truth, touching only the part of the line it changes.
  `proschi parse` output gains `blocks`: where each section block starts and
  ends.
- **Scale or Fail**: every perk, tech card and incident has its own icon, on
  a tile coloured by the card's rarity or the event's kind (incident or
  spike): in the draft, your hand, the shop, your equipped perks, the
  forecast, the debrief, breach callouts and the end-of-run timeline. Content
  names it with an `icon` field, and `proschi game check` rejects an unknown
  icon or one used twice among the perks, the cards or the events.
- **Scale or Fail** is playable: the Arcade tab of Interview prep
  (`practice/#/arcade`). Pick a scenario and build its system by tapping or
  dragging components onto the board (they wire themselves sensibly; tap a
  node to scale it out, size it up, shard it, rewire or remove it), read the
  forecast, load test, deploy, and watch eight ticks of traffic flow as
  particles while nodes heat up and break. Page the on-call mid-wave, then
  read the debrief (what happened, why, what a senior engineer would do, and
  the review cards that explain it), draft a tech card and take contracts.
  Runs earn Blueprints for new components, rare cards and perks; scenarios
  and difficulty levels open as you go; there is a daily run and, signed in,
  leaderboards. The report shows your worst mistakes, the design in interview
  words, and opens your final design in the editor. Optional sound. Four game
  badges join the achievements, and game lessons add a small bonus to the
  skill map's topics.
- The engine and content of **Scale or Fail**, a system design roguelite for
  the Interview prep page: pick a scenario (a URL shortener, a photo app, a
  notification service, a flash sale), place and wire components, and keep
  the system up for twelve waves of growing traffic, new use cases, stricter
  requirements and incidents (zone outages, cache stampedes, failovers, hot
  keys, bot floods). Every tick runs Proschi's simulation on the board, so
  every failure comes with the bottleneck and the fix. Runs are seeded and
  replayable, so the server can check a score. Scenarios, tech cards and
  incidents are plain files in `frontend/src/game/content/`
  ([docs/GAME.md](docs/GAME.md)); `proschi game check` validates them and
  plays every scenario's reference and wrong runs, `proschi game lock`
  records new ids, and `proschi game sim` prints a run wave by wave for
  balancing.
- Scale or Fail on the server (`/api/game/*`, backend/README.md): ranked
  runs are started by the server, which picks the seed and the loadout from
  your stored progress, and scored only by replaying their moves with the
  same engine. Leaderboards per scenario and difficulty and for the daily
  run, purchases of unlocks and perks, and runs played signed out carried
  over when you sign in. Your game progress and runs are in the data export.
- `analyze()` takes the percentiles to compute, and `runTests()` the options
  the analysis was made with (so `survive` re-analyses the same way). A
  latency quantile without parallel steps is computed in closed form, which
  makes analysing a design several times faster.
- `CONTRIBUTING.md`: how to set up, the checks before a pull request, and
  step-by-step guides to adding a practice problem and a review card. The
  practice list ends with "Have a system design problem in mind? Contribute
  it", with a link to suggest an idea instead, and the footer links to the
  guide. New issue templates suggest a problem or a card without writing
  code.
- Interview prep is a hub (`practice/#/roadmap`, "Interview prep" in the
  header) with tabs for the roadmap, daily review, the daily challenge and
  your progress, and your streak and today's goal at the top. The old
  addresses (`#/review`, `#/review/<topic>`, `#/challenge`, `#/progress`,
  `#/roadmap/<id>`) open inside it. The
  Practice list is now just the problems, with one small link to interview
  prep.
- Your profile page (`practice/#/me`, "Your profile" in the account menu):
  your streak, freezes and daily goal, your daily challenge streak and best
  score, problems solved by difficulty, cards reviewed and mastered, the interview-ready score, the skill map, every
  badge and the problems you solved, and the public profile setting. Badges
  are a compact grid of small medals, here and on the progress page; tap one
  for what it is and how far along you are.
- Public profiles (`practice/#/u/<id>`), linked from the leaderboard and
  the daily challenge's leaderboard, for users who opt in: name, month
  joined, problems solved, streaks, the daily challenge streak and best
  score, readiness, topic mastery and badges, never designs, review history
  or challenge answers
  (`GET /api/users/<id>/profile`; docs/PRIVACY.md lists exactly what is
  shown).
- 311 practice cards for daily review, from estimation and networking to
  consistency, streaming, security, observability, coordination and
  probabilistic data structures: one Markdown file
  per card in `frontend/src/practice/cards/<topic>/<id>.md`, as flip,
  multiple-choice, estimate or fill-in-the-gap cards in 18 topics, with a
  32-card sample deck. `proschi cards check` validates them (fields,
  ids that are never deleted or reused, topics, related problems, phone-sized
  text and near-duplicate cards) and `proschi cards lock` records new ids.
  How to write them: `docs/CARDS.md`.
- Daily review on the practice page (`practice/#/review`): a few minutes of
  cards a day, each scheduled to come back just before you would forget it
  (FSRS). Recall a concept and rate yourself, pick an option, estimate a
  number (typed as `2300`, `2.3k` or `1e6`) or fill a gap, with the reasoning
  shown after each answer. Train one topic, or take the day's due and new
  cards; keyboard shortcuts (space to flip, 1–4 to rate) and phone-sized
  buttons. Signed in, every card is reviewed and your reviews are kept in
  your account, even when sent later from a phone that was offline; signed
  out, try the free sample deck. Find it from the "Daily review" card on the
  practice list or in the footer. The cards are also published as
  `practice/cards.json` for apps.
- A daily goal and streak: review 10 cards (or pick 5, 20 or 30) or solve a
  problem each day to keep your streak going. The flame, a ring filling up
  toward today's goal and your streak freezes show on the review page and the
  practice list; every 7 days in a row earn a freeze (up to 2) that covers a
  missed day for you. Signed in, your account keeps the streak, so every
  device shows the same one.
- Celebrations: a summary with a little confetti when a review session ends,
  marking the daily goal and streaks of 3, 7, 14, 30, 50 and 100 days; on a
  problem's first solve, the runs it took and your design's cost and p99 next
  to the reference solution's, with links to the next roadmap problem and the
  cards that train for it; a moment when you finish a roadmap stage; and a
  weekly recap of last week's cards, solves and goal days on the review page.
  With reduced motion set, there is no animation, just the summary.
- A progress page on the practice page (`practice/#/progress`): a skill map
  that scores how well you know each of the 18 topics, from the cards you
  remember, how many of them you have seen, the related problems you solved
  and, for estimation, how often your numbers land; an "interview ready"
  score; and your three weakest topics, each with a "Train this topic"
  button. Plus 32 badges in bronze, silver and gold for reviewing, streaks,
  mastered cards, solving problems (hard ones, on the first run, or cheaper
  than the reference solution), estimating and finishing roadmap stages,
  each locked one with a progress bar; the streak badges count your daily
  streak, so your goal, solves and freezes count. A new badge pops up once
  when you earn it, after a session's summary has had its moment. Signed
  in, your badges are kept in your account and included in "Download my
  data"; on a copy of the site without accounts they are kept
  in the browser. Find it from the daily review page or the progress strip
  on the practice list. `proschi achievements check` validates the badges'
  definitions, and `proschi achievements lock` records new ids in
  `achievements.lock`, so a badge's id is never deleted or reused (a badge is
  retired with `"retired": true` instead).
- A daily challenge (`practice/#/challenge`): five cards a day, the same for
  everyone and new at 00:00 UTC, mixing topics and difficulties with at least
  one estimate. Each right answer scores 100 points plus up to 20 for
  answering within 10 seconds (fading to nothing at a minute), for at most
  600. Signed in, the server grades your answers, keeps your first attempt
  and ranks it on today's leaderboard (top 20 of those who chose to appear on
  it); signed out, play and see your score, then sign in to save it. The
  result shows each right answer with why, your rank, a challenge streak and
  a "Copy result" button for sharing, e.g. `Proschi daily challenge
  2026-10-06: 480/600 ✅✅❌✅✅`, and a perfect score gets confetti. Every
  answer also counts as a review toward your daily goal, and a reload in the
  middle carries on at the next card. Three new badges:
  a first challenge, a perfect score and a 7-day challenge streak. Find it
  as the Challenge tab of interview prep, or in the footer.
- Sign-in for native apps, ready for a future mobile app: an app signs in
  with GitHub or Google in the system browser
  (`/auth/<provider>/start?client=app`, OAuth 2 with PKCE, back to an
  allow-listed `APP_REDIRECT_URIS` address with a one-time code), exchanges
  the code at `POST /auth/token` for an hour-long access token and a 60-day
  refresh token that rotates on every use (a reused one signs that app out),
  and calls every `/api` endpoint with `Authorization: Bearer`.
  `POST /auth/revoke` signs an app out; "Sign out everywhere" and deleting
  the account include apps, and "Download my data" lists each session with
  its kind. The site keeps its cookie as before. How it works:
  `backend/README.md`, "Mobile apps".
- "Numbers to know" in the docs (`docs/numbers/`): a cheat sheet of the
  round numbers system design runs on (latency, throughput and connections
  per server, disk and network speeds, time and size conversions,
  availability nines, object sizes and approximate cloud prices) with a
  fully worked estimate, and how Proschi's simulation defaults compare.
  Every estimate card and the interview guide link to the section they use.

### Changed
- **Reminder emails with some attitude.** The confirmation, streak, cards-due,
  weekly recap and reminders-paused emails now look like the site: a chunky
  wordmark, a colour of their own per email, thick ink borders, hard
  shadows, a big number (your streak, the cards due) or a stat grid (the
  recap), a big button, and a one-liner from Kernel the cat SRE. The
  cards-due email names the topics most of the cards are from. Subjects got
  livelier ("🔥 Day 6 streak — don't let it go out") and every email has
  preview text. The plain-text part carries the same content, and the
  confirm and unsubscribe pages got the same look.
- **Scale or Fail's home sorts the scenarios in two.** The Scale or Fail
  scenarios (Shortly and what it opens) come first, as their own chain; the
  four design-first scenarios (Pawprint, Dinnerbell, Monolith and Runway)
  are listed apart under **Design challenges**, each with a line on what its
  mode asks: migrations and API versions, naming the root cause, strangling a
  monolith, cutting the bill.
- **Editor: one Results tab, one Export menu.** The Analysis and Tests tabs
  are now a single **Results** tab: failing requirements and tests first with
  their hints, the passing ones folded away, then the load, latency,
  availability and cost per node, then *Review my design*. The views are
  Diagram, Results and HLD; the HLD opens with a one-line summary of the
  checks that links to Results, and `?view=analysis` or `?view=tests` links
  open Results. **Export**, next to Share, now holds every way out: PNG and
  SVG images (from any tab), Mermaid (copy, or download as `.mmd`), the
  `.proschi` file and *Export all (.zip)*; the canvas's own Export menu is
  gone and the Diagrams menu keeps New, Open, Import and Import backup. On
  phones, Examples moves into the Diagrams menu so the header still fits at
  320px.
- **One practice hub.** The header has a single **Practice** link (next to
  Docs, GitHub and the editor) instead of Practice, Interview prep and
  Arcade. Practice opens on a **Today** panel: your streak and daily goal,
  the cards due with **Review now**, today's challenge, today's Arcade daily
  run and **Continue** (the last problem you opened, or the roadmap's next
  step). Under it one bar of tabs, Problems, Roadmap, Review, Challenge,
  Arcade and Progress, which scrolls sideways on a phone. Every old address
  (`#/roadmap`, `#/review`, `#/challenge`, `#/arcade`, `#/arcade/daily`,
  `#/me`, `#/u/<id>`) still works, and the footer groups the practice links
  under Practice.
- **Progress reads as one system.** The Progress tab leads with your
  **level** and XP: 100 XP per problem solved, 20 per card mastered and 10
  per day of your longest streak, level *L* starting at 50 × (*L* − 1)² XP.
  Your skill map and interview-ready score, your roadmap progress and your
  badges follow as sections under it.
- **A shorter landing page with two ways in.** The hero offers "Design a
  system" (the editor) and "Prepare for interviews" (the roadmap) side by
  side, next to the live demo. "How it works" is gone (the demo plays the
  same three steps), the interview prep section moved below the examples,
  and a new card links the Arcade, Scale or Fail, which the header and
  footer now link too. The practice list and its problem count are in the
  page from the build, so they show before any JavaScript runs.
- **The interview prep roadmap's first stage needs no account.** Signed
  out, you can work through stage 1 with your progress kept in this
  browser; signing in is optional and keeps your progress on every device
  and opens the stages after it. The landing page no longer says both "No
  account" and "Sign in to start".
- **The editor's first visit opens a small design with traffic and
  requirements** (Hello Proschi), so the tour's "Will it scale?" step shows
  real numbers on Analysis and Tests without switching documents. On a
  phone, a first visit opens on the Code pane; share links still open on
  the diagram.
- **Example links**: `app/?example=<id>` opens that bundled example (`hello`,
  `ecommerce`, `serverless`, `login`, `events`, `url-shortener`), and the
  landing page's example cards use them.
- The Arcade's per-wave "on-call" actions are now **Hotfixes**, so they
  are no longer confused with the On-call mode (Dinnerbell).
- The Arcade shop shows an icon and a one-line description for every item:
  components with the icon the board draws for them, features with their
  own. Each tab (Components, Features, Rare cards, Perks) says what it sells,
  under the tabs and as a tooltip.
- The practice list's filters take one row on a phone: a search box and a
  "Filters" button that shows how many are on (for example "Filters · 2").
  It opens the difficulty, tag, company and status filters; Escape closes
  them. The filters in use show as chips under the search, each with an ×
  to remove it, and "Clear all".
- Signed in, reviews not sent to your account yet (made offline, say) now
  count toward the streak and today's goal on the daily review page and the
  practice list right away, as they already did in a session's summary. Once
  sent, they count once.

### Fixed
-- Confirming a reminder email address no longer fails with "Cross-site request refused".
 The editor docs install `proschi` from npm (`npm install -g proschi` or
  `npx proschi`) and the VS Code extension from the GitHub release, instead
  of saying the packages are not published yet.
- On phones, the on-screen keyboard no longer covers the field you are
  typing in.
- Diagram selection actions no longer run under the Export and load buttons
  on narrow screens: Delete is in the settings card's header, and with the
  card closed or several items selected, Rename and Delete show in a bar at
  the bottom of the diagram.
- Arcade: a run, and each new wave, opens at the top of the page instead of
  wherever the scenario list or the draft was scrolled to.
- Daily review on a phone: after you answer a card, the next one scrolls
  into view with its topic, type and question below the site header, and
  keyboard focus moves to its heading. Showing an answer brings it into view
  without scrolling the question away. Scrolling is instant when your device
  asks for reduced motion.
- On the interview prep roadmap, a locked step's "Read the lesson" is locked
  too, with a lock and what opens it ("Solve URL Shortener first", or sign
  in). Opening a locked step's address (`#/roadmap/<id>` or
  `#/roadmap/<id>/lesson`) shows the roadmap with that message instead of
  the step. The "Read first" guide, and lessons opened from the problem
  list, stay open to everyone.
- On phones the header fits the screen on the practice pages: with the
  account and help menus it no longer pushes the menu button off screen or
  makes the page scroll sideways (the "Open the editor" button, also in the
  menu, waits for wider screens, and below 380px the logo keeps its tile
  only). The account, help and editor menus open inside the screen, spanning
  it on phones, and a long display name is shortened in the header. The
  editor's toolbar wraps instead of overflowing between 640 and 700px.
- The practice problems' statements and lessons, and the interview approach
  guide, are clearer and more accurate: plainer English with shorter
  sentences, jargon explained where it first appears, estimates that match
  the problem files (for example the payments budget, Pastebin's egress
  ratio, notification fan-out's SMS share and the ride-matching shard cost),
  and "Common mistakes" sections that name every check each wrong design
  fails.

## [0.8.0] - 2026-10-05

### Changed
- The site moves to <https://proschi.app/>, served by a Cloudflare Worker
  (`backend/`) together with its API. The old address,
  `gvart.github.io/proschi/`, redirects every page and share link to the same
  path on proschi.app.
- Interview prep is easier to find: a section right under the landing page's
  hero with the roadmap's stages, an "Interview prep" link in the header, and
  a roadmap card with your progress at the top of the practice list. Pages no
  longer scroll sideways on phones (the landing page's "How it works" cards,
  the simulation docs' formulas and tables, the problem pages' big button).

### Added
- An interview prep roadmap in practice (`practice/#/roadmap`): the problems
  in eight stages, from foundations through caching, partitioning, queues,
  fan-out, streams and consistency to large systems, each with a note on what
  it teaches. A problem on the roadmap opens once every problem before it is
  solved, with your progress, the current stage and a Continue button; a
  problem opened from the roadmap links to the next one after a solve. Anyone
  can see the roadmap; starting it takes signing in. The problem list stays
  open.
- Practice problems based on a published system name its company: an
  optional `company` field in problem.md (docs/PRACTICE.md), set on Snowflake
  IDs (Twitter), Shopping Cart (Amazon), Job Queue (Slack), View Counting
  (Reddit) and Social Graph Cache (Meta). The problem list shows it as a
  badge and filters by it, and the problem page and its static page show the
  badge. It says where the design comes from, not that the company asks the
  problem in interviews.
- An "AI review" view next to the tests on the practice page, with a "Review
  my design" button. It is a placeholder for now: it says the review is
  coming soon and gives no feedback. The request it will send (the design,
  its parsed model, test results, and cost, p99 and availability from the
  simulation) and the review it expects are defined in
  `frontend/src/review/`, and the Worker has a stub `POST /api/review` that
  validates the request and answers 501 (backend/README.md). Builds with
  `VITE_AI_REVIEW=true` call it.
- Practice accounts and global stats, from the Worker's API and a D1
  database. Sign in with GitHub or Google from the practice
  header to keep progress and designs across devices; progress already in the
  browser is uploaded on first sign-in. The server re-runs a problem's tests
  with the same parser and simulation before it records a solve. The problem
  list shows each problem's solve rate, a solved problem shows how many
  solved it, the median number of test runs to solve it, and where your
  cheapest design's cost and fastest p99 fall among other solvers', and a
  leaderboard lists those who opt in under a display name they choose. No
  email address is stored; the session is an HttpOnly cookie on proschi.app,
  and the account menu deletes the account and its data. Builds without
  `VITE_ACCOUNTS=true` work as before, with progress in the browser only.
- A "page not found" page for any missing path on proschi.app, with the site
  header and links to the editor, practice and docs, in place of Cloudflare's
  default.
- The editor and practice show a "Something went wrong" screen, with a reload
  button and a link to file a GitHub issue (the error and the browser only,
  never your designs), when a page crashes, instead of a blank page.
- `robots.txt` and a `sitemap.xml` of the landing page, editor, practice,
  every problem's page and every docs page, generated at build time.
- Every practice problem has a page of its own, `practice/<id>/`, that search
  engines can index: the statement, difficulty and tags, a button that opens
  it in practice, and links to the other problems. The landing page's
  practice list links to these pages.
- Search and link previews: the editor and practice pages have descriptions,
  canonical URLs and Open Graph tags; docs pages get the preview image; the
  landing page and problem pages carry schema.org data (the app; each
  problem as a learning resource, with breadcrumbs). Page titles name what
  people search for: architecture diagrams as code, system design practice.
- Account controls in the practice account menu: link a second sign-in
  (GitHub and Google) to the same account and unlink one, sign out everywhere,
  and download everything the server stores about you as JSON. Sessions
  renew while in use and expired ones are purged daily.
- Problems have an optional `version` in their front matter (docs/PRACTICE.md),
  and the simulation a version of its own; global stats count only solves of
  the current versions, so a changed problem's stats start afresh.
- The API is hardened: rate limits on sign-in, account changes, uploads and
  stats; security headers and a request id on every response; structured
  logs without query strings; sign-in refuses to run without a strong
  session secret; display names that impersonate the site or contain slurs
  are refused; browser progress is uploaded in one request on sign-in. Every
  deploy goes to staging.proschi.app and passes a smoke test before
  production, which records a database bookmark to restore from.
- Five practice problems based on published systems, each naming its
  sources under *Based on*: Snowflake IDs (Twitter's id generator, easy),
  Always-writable Shopping Cart (Amazon's Dynamo, easy), Durable Job Queue
  (Slack's Kafka in front of Redis, medium), View Counting (Reddit's
  HyperLogLog pipeline, medium) and Social Graph Cache (Facebook's TAO,
  hard). Their scale and limits come from the posts and papers where these
  give numbers.
- Eight more problems based on published systems, each with its company:
  Discord Messages (Discord, hard), Notion Sharding (Notion, medium), Tiered
  CDN Cache (Cloudflare, medium), Replicated Git Storage (GitHub, medium),
  Push Gateway (Netflix, medium), Flash Sale (Shopify, hard), Metrics Ingest
  (Uber, hard) and Trending Topics (Twitter, medium). Twenty-five problems in
  all.
- A design review on the practice page (the "Review" view next to the tests,
  formerly the "AI review" placeholder) and in the editor's Analysis view.
  Worked out on the page from the simulation and the tests, it lists findings
  by severity (saturated nodes, single points of failure, latency,
  availability and cost against the requirements, failing tests, …), what
  the design does well and up to three next steps. An AI reviewer will come
  later behind the same interface.
- Lessons in practice: each roadmap step is now "Learn → Challenge →
  Review". A problem's optional `lesson.md` (docs/PRACTICE.md) explains the
  concepts behind it in eight fixed sections; a problem opened from the
  roadmap shows its lesson first with a table of contents and a "Start the
  challenge" button, remembers once it was read, and keeps it a tab away. The
  roadmap shows each step's reading time and opens with a "Read first"
  guide, *How to approach a system design interview*
  (`practice/#/roadmap/approach`, and `practice/approach/`). Lessons and the
  guide need no sign-in, and are part of the static problem pages and the
  sitemap. Statements and lessons understand tables, blockquotes and
  highlighted ```` ```proschi ```` blocks, and `proschi problem check`
  validates lessons.
- A lesson for every one of the 25 problems: the problem explained,
  back-of-the-envelope numbers, the concepts it needs, a step-by-step design,
  why each wrong design fails, what interviewers ask, and further reading
  (engineering posts and papers, the System Design Primer, awesome-scalability
  and the *System Design Interview* chapters by title).

### Security
- The static site sends HSTS and refuses to be framed (`X-Frame-Options`,
  `frame-ancestors`), along with `nosniff`, a referrer policy, a
  cross-origin opener policy and a permissions policy, from
  `frontend/public/_headers`. Hashed assets are cached for a year. The deploy
  smoke test checks these headers, the 404 page, the sitemap and robots.txt.

## [0.7.0] - 2026-10-04

### Added
- First-run onboarding. The editor opens with a five-step tour the first time
  (text → diagram, change a line, play a use case, Analysis/Tests, share and
  backup); most steps move on when you do the thing. Practice gets a three-step
  intro on the first problem. Tours are small non-modal popovers (Esc or X to
  skip, keyboard and screen reader friendly, reduced motion respected) and load
  only when shown. Shared diagrams and example links open without a tour, with
  at most a small corner hint. `?tour=1` / `?tour=0` force or suppress it.
- A Help (?) menu in the editor and practice headers: replay the tour, a syntax
  cheat-sheet (checked against the parser and docs/LANGUAGE.md in tests), the
  language reference and how the simulation works.
- An empty diagram offers a start: a template with the syntax in comments, an
  example, or practice. An example picked while the diagram is empty replaces it.
- A "How the simulation works" page at `/proschi/model/`: every rule the
  simulation uses (load from traffic, reads and writes, replicas, shards and
  single-primary writes, queueing, percentiles, fan-out and payloads,
  availability, cost, failures, kinds and consistency) with its default
  numbers, worked examples, the simplifications and omissions that make its
  numbers optimistic or pessimistic, how to calibrate `capacity` with your own
  measurements, and what a practice verdict means. A test recomputes every
  number on the page from the simulation code. Linked from the landing page,
  the editor's Analysis and Tests tabs and the practice test panel
  ("How is this calculated?").
- The tech catalog knows about 205 tech stacks instead of 110, with the names
  people write as aliases: `[S3]`, `[GCS]`, `[Azure Blob]`, `[MinIO]`,
  `[Postgres]`, `[CockroachDB]`, `[ScyllaDB]`, `[Valkey]`, `[Kinesis]`,
  `[Pub/Sub]`, `[OpenSearch]`, `[Fastly]`, `[ALB]`, `[nginx]`, `[Kong]`,
  `[Spring Boot]`, `[Go]`, `[Node.js]`, `[Kubernetes]`, `[Snowflake]`,
  `[ClickHouse]`, `[Stripe]`, … and a generic tech per kind (`[Service]`,
  `[Database]`, `[Message Queue]`, `[Object Storage]`, `[WAF]`, …). Matching
  ignores case, spaces, punctuation and a trailing version (`[PostgreSQL 16]`).
  The editor's and the language server's completion list the whole catalog and
  filter on aliases.
- The language server offers a quick fix for an unknown tech stack: replace it
  with the closest catalog tech.
- `capacity { db timeout 250ms }`: what a failed call (`-x`) to a node costs
  (1 000 ms by default).

### Changed
- An unknown tech stack no longer becomes a free, infinitely fast client. The
  node keeps the name you wrote and is simulated as the kind its name suggests
  (`[TigerBeetle DB]` is a database), else the kind of the closest catalog tech
  (`[Postgress]`), else a service. It is still a warning, so existing diagrams
  keep working, and the warning names the closest known tech.
- Latency percentiles: each hop is a fixed half of its service time plus an
  exponential tail for the rest of its mean, so the tail widens as a node fills
  up (an idle hop's p99 is 2.8× its mean). Timeouts and transfer time add once
  instead of being multiplied by the tail factor.
- A use case's percentile is now the percentile of its scenarios mixed by their
  shares, instead of one scenario's: it no longer jumps when a share crosses
  1 − q. With 10% cache misses, p99 is close to the miss path's p90.
- Queueing is M/M/c (Erlang C) over a shard's replicas, so large pools are no
  longer penalised; writes that bind a single-primary store queue for its one
  primary.
- `survive` analyses the design again with one instance fewer and also
  re-checks the latency requirements that held. On a sharded store it takes one
  replica from one shard, and a single-primary store fails over to a replica.
- Writes to a single-primary store depend on its primary: with a replica,
  failover loses a tenth of each outage (PostgreSQL with replicas: 99.995% for
  writes instead of 99.99999%).
- Egress is charged on payloads a node you run sends to clients and third
  parties: $0.09/GB from anything, $0.02/GB from a CDN. Services answering
  users now pay; storage answering your own services or a CDN no longer does.
- Nodes you run saturate on bandwidth as well as on requests; object storage
  and CDNs scale out. A fan-out of N moves N payloads.
- Failed calls (`-x`) add no load or egress to their target.
- The practice problems are recalibrated: latency limits set against the old,
  inflated tail are tightened to keep their margin over the reference
  solutions (chat, file storage, news feed, pastebin, rate limiter, ride
  matching, search autocomplete, ticket booking, URL shortener, video
  streaming), and the statements explain egress as data sent to users.

### Fixed
- On phones, switching back from Code to Diagram re-fits the diagram once the
  canvas has its real size again; it used to be fitted into a stale 500×500
  box and end up off centre or partly off screen. While a tour card is docked
  over the canvas, the diagram is fitted into the space above it.

## [0.6.0] - 2026-10-04

### Security
- Share links are decompressed with a 2 MB cap, so a crafted link can no longer
  freeze the tab.
- The parser and formatter are linear on adversarial input (unclosed payloads,
  deep `alt` nesting, now capped at 16, repeated connections); a fuzz suite
  guards this.
- `proschi render` always escapes labels in SVG/HTML output; HTML exports carry
  a strict Content-Security-Policy.
- Corrupt or crafted saved state, progress and imported file maps are
  validated, and `__proto__` keys are dropped.
- Content-Security-Policy and referrer-policy meta tags on every page.

### Added
- Diagrams menu: Export all (.zip) and Import backup, with merging.
- A notice with a download button when a share link is very long.
- Playwright browser tests in CI; the Pages deploy waits for them.
- Root README with a feature overview, links, quick start and contributing guide.
- This changelog.
- Dependabot for the frontend and tooling npm packages (weekly, minor and patch
  updates grouped) and for GitHub Actions (monthly).
- CI runs `proschi problem check` on the practice problems.

### Changed
- Diagram layout runs in a Web Worker and shows a provisional grid that glides
  into place.
- Smaller pages: the landing page loads without React, the practice list loads
  without the editor, and a problem loads only its own files.
  The editor panes load on demand.
- Workflows use the Node 24 majors of `actions/checkout`, `actions/setup-node`,
  `actions/upload-artifact`, `actions/upload-pages-artifact` and
  `actions/deploy-pages`.

### Removed
- The "Visual builder (classic)" drag-and-drop editor, its project list and its
  use case editor. The text editor covers everything it did.
- The unused Kotlin/Spring `backend/`; it is still in the history at
  `tooling-v0.5.0`.

## [0.5.0] - 2026-10-04

### Added
- `proschi problem check [dir]` validates practice problem folders: front
  matter, the solution passes, the starter fails, and every wrong design fails
  exactly the tests it names.
- `proschi problem new <id>` scaffolds a problem that already passes the check.

### Changed
- Practice problems are folders of plain files (`problem.md`, `given.proschi`,
  `starter.proschi`, `solution.proschi`, `wrong/*.proschi`) instead of
  TypeScript modules. The landing page builds its practice list from them.

### Fixed
- Capacity is set by the problem: `capacity` lines in a solver's design are an
  error and the simulation ignores them, so a solution can no longer claim
  unlimited throughput.

## [0.4.0] - 2026-10-04

### Added
- Language v2: precise assertions, selector unions, label prefixes, read/write
  access on steps and per-operation capacity keys.
- Simulation v2: separate reads and writes, shards, fan-out, egress and
  consistency, with new assertions for them.
- Twelve v2 practice problems: file storage, search autocomplete, ride matching,
  payments, ticket booking, video streaming, pastebin, rate limiter, URL
  shortener, chat, news feed and notification fan-out.

### Changed
- HLD documents and the CLI show reads and writes separately.

## [0.3.0] - 2026-10-04

### Added
- HLD language: traffic, requirements, replicas, capacity, entities, decisions
  and tests.
- Deterministic simulation: load, latency, availability and cost per node;
  Analysis and Tests panels in the editor; `proschi test` and `proschi analyze`.
- HLD documents: an HLD view in the editor and `proschi render --format
  hld-md|hld-html`.
- The system design practice platform at `/practice/`, with problems checked by
  tests in the browser, and a practice section on the landing page.

## [0.2.0] - 2026-10-03

### Added
- A warning for use case steps between nodes with no connection, path
  templates and scenario conditions (`when "…"`).
- Checking use case steps against OpenAPI 3.0/3.1 specs (`--openapi`,
  `proschi.json`), in `proschi check` and the language server.
- A formatter: `proschi fmt`, LSP formatting and Format in the web editor.
- Multi-file documents with `import`.
- Export: Mermaid, `proschi render` (SVG, Markdown, HTML) and a diagram preview
  in VS Code.
- A landing page and `when` completion.

### Changed
- Releasing the tooling can also be started by running the workflow on `main`.

## [0.1.0] - 2026-10-03

### Added
- The Proschi language: nodes, groups, connections and use cases with requests,
  responses, fire-and-forget calls, `par` blocks, `alt` scenarios and failed
  calls; endpoint grouping.
- The web editor: live text editing with auto-layout (elkjs), animated use case
  playback, share links, saved diagrams, PNG/SVG export, examples and canvas
  edits written back to the text. Runs fully in the browser on GitHub Pages.
- Tooling: the `proschi` CLI (`check`, `parse`), a language server, a TextMate
  grammar, a JSON Schema for the parsed diagram and a VS Code extension,
  released on tag push.

[0.11.0]: https://github.com/gvart/proschi/compare/tooling-v0.10.0...tooling-v0.11.0
[0.10.0]: https://github.com/gvart/proschi/compare/tooling-v0.9.0...tooling-v0.10.0
[0.9.0]: https://github.com/gvart/proschi/compare/tooling-v0.8.0...tooling-v0.9.0
[0.8.0]: https://github.com/gvart/proschi/compare/tooling-v0.7.0...tooling-v0.8.0
[0.7.0]: https://github.com/gvart/proschi/compare/tooling-v0.6.0...tooling-v0.7.0
[0.6.0]: https://github.com/gvart/proschi/compare/tooling-v0.5.0...tooling-v0.6.0
[0.5.0]: https://github.com/gvart/proschi/compare/tooling-v0.4.0...tooling-v0.5.0
[0.4.0]: https://github.com/gvart/proschi/compare/tooling-v0.3.0...tooling-v0.4.0
[0.3.0]: https://github.com/gvart/proschi/compare/tooling-v0.2.0...tooling-v0.3.0
[0.2.0]: https://github.com/gvart/proschi/compare/tooling-v0.1.0...tooling-v0.2.0
[0.1.0]: https://github.com/gvart/proschi/releases/tag/tooling-v0.1.0
