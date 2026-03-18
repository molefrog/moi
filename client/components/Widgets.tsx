import { SpaceName } from './SpaceName'

export function Widgets() {
  return (
    <div className="flex h-full flex-col">
      <header className="pb-4">
        <SpaceName />
      </header>
      <div className="grid grid-cols-2 grid-rows-[136px_136px_auto] gap-4">
        <div className="bg-black/4 col-span-2 rounded-xl" />
        <div className="bg-black/4 rounded-xl" />
        <div className="bg-black/4 rounded-xl" />
        <div className="bg-black/4 col-span-2 rounded-xl" />
      </div>
    </div>
  )
}
