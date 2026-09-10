export type Theme = 'light' | 'dark'

export function applyTheme(theme: Theme): void {
  document.documentElement.dataset.theme = theme
}

export function initTheme(): void {
  const media = window.matchMedia('(prefers-color-scheme: dark)')
  const sync = (): void => {
    applyTheme(media.matches ? 'dark' : 'light')
  }
  sync()
  media.addEventListener('change', sync)
}
