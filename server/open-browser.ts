export async function openBrowser(url: string) {
  try {
    if (process.platform === 'darwin') await Bun.$`open ${url}`.quiet()
    else if (process.platform === 'linux') await Bun.$`xdg-open ${url}`.quiet()
  } catch {}
}
