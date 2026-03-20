import './index.css'

export async function init(el: HTMLElement) {
  const { mount } = await import('./main')
  mount(el)
}

// Expose init globally so the preload script can call it
globalThis.__init = init
