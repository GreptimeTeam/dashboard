export interface CommandPaletteRouteItem {
  kind: 'route'
  id: string
  title: string
  path: string
  routeName: string
}

export interface CommandPaletteUiItem {
  kind: 'ui'
  id: string
  title: string
  hint: string
  navigate: () => void
}

export interface CommandPaletteGroupItem {
  kind: 'group'
  id: string
  title: string
  hint: string
  children: Array<CommandPaletteRouteItem | CommandPaletteUiItem | CommandPaletteGroupItem>
}

export type CommandPaletteItem = CommandPaletteRouteItem | CommandPaletteUiItem | CommandPaletteGroupItem

export type CommandPaletteSection = {
  label: string
  items: CommandPaletteItem[]
}
