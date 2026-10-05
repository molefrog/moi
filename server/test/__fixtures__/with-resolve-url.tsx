import { resolveUrl } from 'moi'
export const videoUrl = resolveUrl('moi:/files/clips/a b.mp4')
export const config = { title: 'Files' }
export default function WithFile() {
  return <video src={videoUrl} />
}
