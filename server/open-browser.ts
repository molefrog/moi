import open from 'open'

export async function openBrowser(url: string) {
  try {
    await open(url)
  } catch {}
}
