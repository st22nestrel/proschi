/**
 * `proschi check` validates .proschi files (for CI and pre-commit hooks);
 * `proschi parse` prints the parsed diagram as JSON (see schema/);
 * `proschi fmt` formats them (see fmt.ts);
 * `proschi test` and `proschi analyze` run the simulation (see simulation.ts);
 * `proschi problem check|new` validates and scaffolds practice problems (see problem.ts);
 * `proschi cards check|lock` validates the practice cards (see cards.ts);
 * `proschi achievements check|lock` validates the practice achievements (see achievements.ts);
 * `proschi game check|lock|sim` validates and plays the Scale or Fail content (see game.ts);
 * `proschi preview` serves the preview-html page of any file (see render/serve.ts);
 * `proschi share-link` prints a web editor link for a file (see share.ts).
 * `proschi import mermaid|openapi` converts other formats to Proschi (see importCommand.ts).
 * `proschi imports sync` fetches git, https and cloud imports into the cache and proschi.lock (see sync.ts).
 * `proschi login|logout|whoami` signs in to the account (see login.ts);
 * `proschi versions list|diff` reads a diagram's saved versions (see versions.ts).
 */
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { openApiDiagnostics, parseSpecFlag } from './openapi/config';
import type { Diagnostic } from './proschi';
import { PREVIEW_HELP, PREVIEW_USAGE, RENDER_HELP, RENDER_USAGE } from './render/usage';
import { FMT_HELP, FMT_USAGE, runFmt } from './fmt';
import { checkFiles, parseFile } from './imports';
import { SIM_HELP, SIM_USAGE, runAnalyze, runTest } from './simulation';
import { PROBLEM_HELP, PROBLEM_USAGE, runProblem } from './problem';
import { CARDS_HELP, CARDS_USAGE, runCards } from './cards';
import { ACHIEVEMENTS_HELP, ACHIEVEMENTS_USAGE, runAchievements } from './achievements';
import { GAME_HELP, GAME_USAGE, runGame } from './game';
import { SHARE_HELP, SHARE_USAGE, runShareLink } from './share';
import { IMPORT_HELP, IMPORT_USAGE, runImport } from './importCommand';
import { IMPORTS_HELP, IMPORTS_USAGE, runImports } from './sync';
import { LOGIN_HELP, LOGIN_USAGE, runAuth } from './login';
import { VERSIONS_HELP, VERSIONS_USAGE, runVersions } from './versions';

declare const PROSCHI_VERSION: string;
const VERSION = typeof PROSCHI_VERSION === 'string' ? PROSCHI_VERSION : 'dev';

const USAGE = `Usage:
  proschi check [--strict] [--format text|github|json] [--openapi <node>=<spec>]... <file|dir>...
  proschi parse <file>
${RENDER_USAGE}
${PREVIEW_USAGE}
${FMT_USAGE}
${SIM_USAGE}
${PROBLEM_USAGE}
${CARDS_USAGE}
${ACHIEVEMENTS_USAGE}
${GAME_USAGE}
${SHARE_USAGE}
${IMPORT_USAGE}
${IMPORTS_USAGE}
${LOGIN_USAGE}
${VERSIONS_USAGE}
  proschi --version

check   Reports errors and warnings. Directories are searched for *.proschi files.
        Imports are followed; problems are reported under the file they occur in.
        Exits with 1 if any file has an error (or a warning, with --strict).
        --openapi checks the steps calling <node> against an OpenAPI 3 spec
        (YAML or JSON); it overrides the "openapi" map of the nearest
        proschi.json.
parse   Prints {"diagram", "diagnostics"} as JSON; the shape is described by
        schema/proschi-diagram.schema.json.
${RENDER_HELP}
${PREVIEW_HELP}
${FMT_HELP}
${SIM_HELP}
${PROBLEM_HELP}
${CARDS_HELP}
${ACHIEVEMENTS_HELP}
${GAME_HELP}
${SHARE_HELP}
${IMPORT_HELP}
${IMPORTS_HELP}
${LOGIN_HELP}
${VERSIONS_HELP}`;

export interface CheckResult {
  file: string;
  diagnostics: Diagnostic[];
}

/** Expands directories into the .proschi files below them, skipping node_modules and dot dirs. */
export function collectFiles(paths: string[]): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
      const full = join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith('.proschi')) out.push(full);
    }
  };
  for (const p of paths) {
    if (statSync(p).isDirectory()) walk(p);
    else out.push(p);
  }
  return out;
}

export function format(results: CheckResult[], style: 'text' | 'github' | 'json'): string {
  if (style === 'json') return JSON.stringify(results, null, 2);
  const lines: string[] = [];
  for (const { file, diagnostics } of results) {
    for (const d of diagnostics) {
      if (style === 'github') {
        const level = d.severity === 'error' ? 'error' : 'warning';
        lines.push(`::${level} file=${file},line=${d.line},col=${d.col},title=proschi::${d.message.replace(/%/g, '%25').replace(/\r?\n/g, '%0A')}`);
      } else {
        lines.push(`${file}:${d.line}:${d.col}: ${d.severity}: ${d.message}`);
      }
    }
  }
  if (style === 'text') {
    const errors = results.reduce((n, r) => n + r.diagnostics.filter((d) => d.severity === 'error').length, 0);
    const warnings = results.reduce((n, r) => n + r.diagnostics.filter((d) => d.severity === 'warning').length, 0);
    const files = results.length === 1 ? '1 file' : `${results.length} files`;
    lines.push(errors || warnings ? `${files}: ${errors} error(s), ${warnings} warning(s)` : `${files}: no problems`);
  }
  return lines.join('\n');
}

export function run(argv: string[], out: (s: string) => void = console.log, err: (s: string) => void = console.error): number | Promise<number> {
  const [command, ...rest] = argv;
  if (command === '--version' || command === '-v') {
    out(VERSION);
    return 0;
  }
  if (!command || command === '--help' || command === '-h' || command === 'help') {
    out(USAGE);
    return command ? 0 : 2;
  }

  if (command === 'parse') {
    if (rest.length !== 1) {
      err(USAGE);
      return 2;
    }
    out(JSON.stringify(parseFile(rest[0]), null, 2));
    return 0;
  }

  // The renderer (ELK, React for the icons) is a separate bundle, loaded only here.
  if (command === 'render') return import('./render/command').then((m) => m.renderCommand(rest, out, err, USAGE));
  if (command === 'preview') return import('./render/command').then((m) => m.previewCommand(rest, (dir) => collectFiles([dir]), out, err, USAGE));
  if (command === 'fmt') return runFmt(rest, collectFiles, out, err);
  if (command === 'test') return runTest(rest, collectFiles, out, err);
  if (command === 'analyze') return runAnalyze(rest, out, err);
  if (command === 'problem') return runProblem(rest, out, err);
  if (command === 'cards') return runCards(rest, out, err);
  if (command === 'achievements') return runAchievements(rest, out, err);
  if (command === 'game') return runGame(rest, out, err);
  if (command === 'share-link') return runShareLink(rest, out, err);
  if (command === 'import') return runImport(rest, out, err);
  if (command === 'imports') return runImports(rest, collectFiles, out, err);
  if (command === 'login' || command === 'logout' || command === 'whoami') return runAuth(command, rest, out, err);
  if (command === 'versions') return runVersions(rest, out, err);

  if (command === 'check') {
    let strict = false;
    let style: 'text' | 'github' | 'json' = 'text';
    const paths: string[] = [];
    const specs: Record<string, string> = {};
    for (let i = 0; i < rest.length; i++) {
      const arg = rest[i];
      if (arg === '--strict') strict = true;
      else if (arg === '--format') {
        const value = rest[++i];
        if (value !== 'text' && value !== 'github' && value !== 'json') {
          err(`Unknown format '${value ?? ''}'; use text, github or json`);
          return 2;
        }
        style = value;
      } else if (arg === '--openapi') {
        const spec = parseSpecFlag(rest[++i] ?? '');
        if (!spec) {
          err(`Expected --openapi <node>=<path/to/spec.yaml>, got '${rest[i] ?? ''}'`);
          return 2;
        }
        specs[spec[0]] = spec[1];
      } else if (arg.startsWith('-')) {
        err(`Unknown option ${arg}\n\n${USAGE}`);
        return 2;
      } else paths.push(arg);
    }
    if (paths.length === 0) {
      err(USAGE);
      return 2;
    }

    let files: string[];
    try {
      files = collectFiles(paths);
    } catch (e) {
      err(String((e as Error).message));
      return 2;
    }
    const results = checkFiles(files, (file, diagram) => openApiDiagnostics(file, diagram, specs));
    const text = format(results, style);
    if (text) out(text);
    const failed = results.some((r) => r.diagnostics.some((d) => d.severity === 'error' || strict));
    return failed ? 1 : 0;
  }

  err(`Unknown command '${command}'\n\n${USAGE}`);
  return 2;
}

// Only run when executed, not when imported by the tests.
if (typeof PROSCHI_VERSION === 'string') Promise.resolve(run(process.argv.slice(2))).then((code) => (process.exitCode = code));
