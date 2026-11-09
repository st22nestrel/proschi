/**
 * Which node has which OpenAPI spec: `proschi.json` next to (or above) a
 * .proschi file, overridden by `--openapi node=path` flags.
 */
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import type { Diagnostic, Diagram } from '../proschi';
import { checkOpenApi, type SpecMap } from './check';

export const CONFIG_FILE = 'proschi.json';

export interface Config {
  file: string;
  openapi: SpecMap;
  /** `proschi render`'s default theme (render/theme.ts); checked by the render command. */
  theme?: string;
}

/** The nearest proschi.json at or above a directory, if any. */
export function findConfigFile(dir: string): string | undefined {
  for (let current = resolve(dir); ; current = dirname(current)) {
    const candidate = join(current, CONFIG_FILE);
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
    if (dirname(current) === current) return undefined;
  }
}

/** Config and spec files used so far, so the language server can notice when they change. */
const used = new Set<string>();

export function watchedFiles(): string[] {
  return [...used];
}

const configs = new Map<string, { mtimeMs: number; config: Config }>();

/** Reads a config file, with spec paths made absolute; throws a readable Error when it is invalid. */
export function readConfig(file: string): Config {
  const { mtimeMs } = statSync(file);
  const cached = configs.get(file);
  if (cached?.mtimeMs === mtimeMs) return cached.config;
  let json: unknown;
  try {
    json = JSON.parse(readFileSync(file, 'utf8'));
  } catch (e) {
    throw new Error(`Invalid ${file}: ${(e as Error).message}`);
  }
  const openapi = (json as { openapi?: unknown })?.openapi ?? {};
  if (typeof openapi !== 'object' || openapi === null || Array.isArray(openapi) || Object.values(openapi).some((v) => typeof v !== 'string')) {
    throw new Error(`Invalid ${file}: "openapi" must map node ids to spec paths, e.g. {"openapi": {"orders": "specs/orders.yaml"}}`);
  }
  const theme = (json as { theme?: unknown })?.theme;
  if (theme !== undefined && typeof theme !== 'string') {
    throw new Error(`Invalid ${file}: "theme" must be a theme name, e.g. {"theme": "classic"}`);
  }
  const config: Config = {
    file,
    ...(theme !== undefined ? { theme } : {}),
    openapi: Object.fromEntries(Object.entries(openapi as Record<string, string>).map(([id, path]) => [id, resolve(dirname(file), path)])),
  };
  configs.set(file, { mtimeMs, config });
  return config;
}

/** Parses `--openapi orders=specs/orders.yaml` values; paths are relative to the working directory. */
export function parseSpecFlag(value: string): [string, string] | undefined {
  const eq = value.indexOf('=');
  if (eq <= 0 || eq === value.length - 1) return undefined;
  return [value.slice(0, eq), resolve(value.slice(eq + 1))];
}

/**
 * OpenAPI findings for one .proschi file: specs from the nearest proschi.json,
 * with `overrides` (from the command line) taking precedence. Returns nothing
 * when no node has a spec.
 */
export function openApiDiagnostics(file: string, diagram: Diagram, overrides: SpecMap = {}): Diagnostic[] {
  let specs: SpecMap = {};
  const configFile = findConfigFile(dirname(resolve(file)));
  if (configFile) {
    used.add(configFile);
    try {
      specs = readConfig(configFile).openapi;
    } catch (e) {
      return [{ severity: 'error', message: (e as Error).message, line: 1, col: 1, length: 0 }];
    }
  }
  specs = { ...specs, ...overrides };
  for (const spec of Object.values(specs)) used.add(spec);
  return Object.keys(specs).length ? checkOpenApi(diagram, specs) : [];
}
