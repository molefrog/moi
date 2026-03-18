type SpaceNameProps = {
  name?: string
}

export function SpaceName({ name = 'New space' }: SpaceNameProps) {
  return <h1 className="text-sm font-medium">{name}</h1>
}
