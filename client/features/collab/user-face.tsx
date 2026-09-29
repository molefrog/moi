import { Facehash } from 'facehash'

type UserFaceProps = { name: string }

export function UserFace({ name }: UserFaceProps) {
  return (
    <Facehash
      name={name}
      size="100%"
      variant="solid"
      intensity3d="none"
      interactive={false}
      colorClasses={['bg-collab']}
      className="text-collab-foreground"
    />
  )
}
