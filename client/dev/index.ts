import '../structured-clone-shim'
import 'blobatar/motion.css'

// Load only the selected sandbox. Each sandbox installs its own mocks.
globalThis.__init = async element => {
  switch (location.pathname) {
    case '/dev/workspace-setup/preview': {
      const { mountSetupPreview } = await import('../features/dev/workspace-setup-preview')
      await mountSetupPreview(element)
      break
    }
    default:
      element.textContent = 'Unknown dev sandbox'
  }
}
