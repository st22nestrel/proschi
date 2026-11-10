/**
 * Where a diagram's use case player stands, as the editor's: the diagram or a
 * scenario playing (`<useCase>:<scenario>`), which step, whether it plays, and
 * whether the use case explorer is open. And which systems it draws open
 * (`expanded`), which one it is focused into (`focus`), and which one the
 * system keys act on (`selected`), each by its path from the root document
 * (`orders`, `orders.warehouse`). And whether a scenario plays over the
 * architecture instead of as its sequence diagram (`view`).
 */
export type Player = {
  pick: string
  step: number
  isPlaying: boolean
  mode: 'diagram' | 'play'
  explorer: boolean
  expanded: string[]
  focus?: string
  selected?: string
  /** What a playing scenario is drawn as: its sequence diagram (the default), or played over the architecture. */
  view?: 'architecture'
}

/** A document the pane draws when it shows no file: a fenced block focused from a reply, with its imports. */
export type PaneSource = { source: string; path?: string; imports?: Record<string, string> }

declare module 'claude-code' {
  interface PluginState {
    proschi: {
      /** One per drawn diagram, by `<requestId>:<n>`. */
      player: StateFamily<Player>
      /** The file `/proschi view` shows in its pane. */
      paneFile: string
      /** What the pane draws while `paneFile` is empty: the block a Focus press opened. */
      paneSource: PaneSource
    }
  }
}
