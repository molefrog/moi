import sharp from 'sharp'

// Normalize any image (PNG/JPG/WebP and animated GIF) into a 128×128
// transparent WebP, returned as a base64 data URL for inlining in the workspace
// config. `animated: true` keeps every frame of a GIF; static images are read
// as a single frame. `fit: 'contain'` preserves aspect with transparent padding.
export async function processIcon(input: string | Buffer | Uint8Array): Promise<string> {
  const webp = await sharp(input, { animated: true })
    .resize(128, 128, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .webp({ quality: 90 })
    .toBuffer()
  return `data:image/webp;base64,${webp.toString('base64')}`
}
