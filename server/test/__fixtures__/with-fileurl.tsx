import { fileUrl } from 'moi'
export const config = { title: 'Files' }
export default function WithFile() {
  return <video src={fileUrl('clips/a b.mp4')} />
}
