// The same Claude Code plugin steps as claude-plugin, in Ubuntu's GNOME
// Terminal: it shows no pictures, so the plugin draws everything in text cells.
import { recordPlugin } from './claude-plugin.mjs';

export const title = 'Claude Code plugin in GNOME Terminal: the same, drawn in text';
export const needs = ['gnome-terminal', 'dbus-run-session', 'claude', 'python3', 'wmctrl'];
export const size = [1920, 1080];

export const record = (ctx) =>
  recordPlugin(ctx, {
    terminal: { app: 'gnome-terminal' },
    intro: "The same plugin in Ubuntu's GNOME Terminal: no pictures there, so it draws in text",
    // No kitty keyboard protocol in GNOME Terminal (VTE): ctrl+x is the plain control byte.
    ctrlX: '\x18',
    // The stock font has no Nerd Font glyphs; `symbols` is the plugin's setting for that.
    options: { icons: 'symbols' },
  });
