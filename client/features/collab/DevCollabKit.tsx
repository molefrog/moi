import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'

import {
  IconChevronDown,
  IconCursorText,
  IconPhoto,
  IconPlus,
  IconPointer
} from '@tabler/icons-react'

import { Button } from '@/client/components/ui/button'
import { Checkbox } from '@/client/components/ui/checkbox'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger
} from '@/client/components/ui/collapsible'
import { Input } from '@/client/components/ui/input'
import { Switch } from '@/client/components/ui/switch'
import { Textarea } from '@/client/components/ui/textarea'
import { cn } from '@/client/lib/cn'
import type {
  CollabIdentity,
  CollabJsonValue,
  CollabParticipant,
  CollabPresenceRegistration
} from '@/lib/collab/types'
import { Card, CardDescription, CardHeader, CardTitle } from '@/ui-components/card'

import { Activity, Cursors, PresenceField, Selection } from './components'
import { createFakeBackend } from './fake-backend'
import type { FakeCollabBackend } from './fake-backend'
import {
  AppletCollabProvider,
  CollabBackendProvider,
  presenceChannels,
  useOthers,
  usePerson,
  usePresence,
  useSelf,
  useSharedState,
  useSharedStore
} from './hooks'
import { Cursor, Facepile, Person, PresenceFrame, PresenceGutter } from './primitives'

// Made-up people in an in-memory room (fake-backend.ts), so everything on this
// page runs its real code with no server: ids resolve, presence travels, and
// shared state saves. Some people are connected, the rest are only remembered.
const fig: CollabIdentity = { id: 'fig', name: 'Fig', color: '#f59e0b' }
const alex: CollabIdentity = { id: 'alex', name: 'Alex Hao', color: '#3b82f6' }
const andrea: CollabIdentity = { id: 'andrea', name: 'Andrea Lim', color: '#ec4899' }
const pierre: CollabIdentity = { id: 'pierre', name: 'Pierre', color: '#f97316' }
const DIRECTORY: CollabIdentity[] = [
  fig,
  alex,
  andrea,
  { id: 'david', name: 'David Tibbitts', color: '#10b981' },
  { id: 'lauren', name: 'Lauren Oliveri', color: '#06b6d4' },
  { id: 'monica', name: 'Monica Perez', color: '#8b5cf6' },
  pierre,
  { id: 'ada', name: 'Ada', color: '#84cc16' }
]
// The person looking at this page.
const you: CollabIdentity = { id: 'you', name: 'You', color: '#8b5cf6' }
const PAGE = 'kit'
const APPLET = { kind: 'view', name: 'kit' } as const
const SURFACE = `${APPLET.kind}:${APPLET.name}`
const SCOPE = 'demo:kit'

type Point = { x: number; y: number }
type BotState = { cursor: Point; focusing: boolean }
function registration(
  who: string,
  channel: string,
  value: CollabJsonValue
): CollabPresenceRegistration {
  return { registrationId: `${who}:${channel}`, surface: SURFACE, channel, value }
}
// Everyone else in the room. Fig and Alex are on this page, Pierre is on
// another one, and Andrea has every tab hidden.
function everyoneElse({ cursor, focusing }: BotState): CollabParticipant[] {
  return [
    {
      connectionId: 'bot-fig',
      identity: fig,
      location: { page: PAGE },
      presence: [
        registration('fig', presenceChannels.cursor('lab'), cursor),
        registration('fig', presenceChannels.custom('mood'), 'Reviewing'),
        ...(focusing ? [registration('fig', presenceChannels.field('launch-note'), true)] : [])
      ]
    },
    {
      connectionId: 'bot-alex',
      identity: alex,
      location: { page: PAGE },
      presence: [
        registration('alex', presenceChannels.selection('task-1'), true),
        registration('alex', presenceChannels.custom('mood'), 'Ready')
      ]
    },
    {
      connectionId: 'bot-pierre',
      identity: pierre,
      location: { page: 'view:board' },
      presence: []
    },
    { connectionId: 'bot-andrea', identity: andrea, location: null, presence: [] }
  ]
}
const START: BotState = { cursor: { x: 140, y: 60 }, focusing: true }

// Fig's pointer wanders and Fig steps in and out of the note field.
function useBots(room: FakeCollabBackend) {
  useEffect(() => {
    let at = START.cursor
    let to = { x: 360, y: 150 }
    let tick = 0
    const timer = setInterval(() => {
      tick++
      const dx = to.x - at.x
      const dy = to.y - at.y
      if (Math.hypot(dx, dy) < 6) to = { x: 40 + Math.random() * 480, y: 30 + Math.random() * 190 }
      else at = { x: at.x + dx * 0.12, y: at.y + dy * 0.12 }
      room.setOthers(everyoneElse({ cursor: at, focusing: Math.floor(tick / 40) % 2 === 0 }))
    }, 100)
    return () => clearInterval(timer)
  }, [room])
}

const IDS = DIRECTORY.map(person => person.id)
const WALKERS = ['pierre', 'fig', 'alex', 'andrea']
const TASKS = ['Confirm the venue', 'Draft the announcement', 'Book the studio']
const BLOCKS = [
  'Q3 launch checklist',
  'Confirm the venue and the catering count by Friday.',
  'Draft the announcement post and the email to customers.',
  'Collect screenshots from the design team for the press kit.',
  'Book the recording studio for the walkthrough video.'
]

// Approximate applet usage, one snippet per section.
const CODE = {
  person: [
    "import { Person, usePerson } from 'moi/collab'",
    '',
    '// A person is an id. Name, face, and the presence dot resolve on their own,',
    '// also for people who have left. An unknown id renders as "Unknown person".',
    '<Person id="alex" />',
    '<Person id={task.assigneeId} detail="Team board" />',
    '<Person id={self.identity.id} you />',
    '',
    '// Just the face, in four sizes.',
    '<Person id="alex" avatarOnly size="xs" />',
    '',
    '// Compact keeps one line and puts the detail inline.',
    '<Person id="alex" size="xs" detail="Overview" />',
    '',
    '// The green dot means the person has the workspace open in a visible tab',
    '// right now. It is on by default; turn it off where it adds nothing.',
    '<Person id="alex" showStatus={false} />',
    '',
    '// The same lookup as a hook: { id, identity | null, status }.',
    'const { identity, status } = usePerson(task.assigneeId)'
  ].join('\n'),
  facepile: [
    "import { Facepile, useOthers } from 'moi/collab'",
    '',
    '// Deduplicates, shows `max` faces (3 by default), then a count.',
    '<Facepile ids={task.watcherIds} />',
    '<Facepile ids={task.watcherIds} max={5} size="md" />',
    '',
    '// The green dots are off in a pile. Turn them on when they matter.',
    '<Facepile ids={task.watcherIds} showStatus />',
    '',
    "const others = useOthers({ scope: 'workspace' })",
    '<Facepile ids={others.map(other => other.identity.id)} size="xs" />'
  ].join('\n'),
  frames: [
    "import { PresenceFrame, PresenceField, Selection } from 'moi/collab'",
    '',
    '// Wrap anything and say who is there. The frame hugs the element inside and',
    '// takes its corner radius. The first person’s color draws it.',
    '<PresenceFrame ids={["fig"]}>',
    '  <Input value={note} onChange={event => setNote(event.target.value)} />',
    '</PresenceFrame>',
    '<PresenceFrame ids={["alex", "andrea"]}>',
    '  <TaskCard task={task} />',
    '</PresenceFrame>',
    '<PresenceFrame ids={["lauren"]}>',
    '  <Button>Publish</Button>',
    '</PresenceFrame>',
    '',
    '// Connected: the workspace reports who is focused on or has selected a target.',
    '<PresenceField target="launch-note">',
    '  <Input value={note} onChange={event => setNote(event.target.value)} />',
    '</PresenceField>',
    '<Selection target={`task/${task.id}`} selected={selectedId === task.id}>',
    '  <TaskCard task={task} />',
    '</Selection>'
  ].join('\n'),
  gutter: [
    "import { PresenceGutter } from 'moi/collab'",
    '',
    '// A face beside the block each person is on. Blocks carry data-collab-target;',
    '// a face glides to the next block instead of reappearing there.',
    '<PresenceGutter',
    '  people={[',
    "    { id: 'fig', target: 'block-1' },",
    "    { id: 'alex', target: 'block-3' }",
    '  ]}',
    '>',
    '  {blocks.map(block => (',
    '    <p key={block.id} data-collab-target={block.id}>',
    '      {block.text}',
    '    </p>',
    '  ))}',
    '</PresenceGutter>'
  ].join('\n'),
  connected: [
    "import { Activity, Cursors, PresenceField, Selection } from 'moi/collab'",
    '',
    '// No data props: each one reports you and shows everyone else by itself.',
    '<Activity />',
    '<Cursors surface="lab">',
    '  <PresenceField target="launch-note">',
    '    <Input value={note} onChange={event => setNote(event.target.value)} />',
    '  </PresenceField>',
    '  <Selection target={`task-${task.id}`} selected={selectedId === task.id}>',
    '    <TaskCard task={task} />',
    '  </Selection>',
    '</Cursors>'
  ].join('\n'),
  hooks: [
    "import { useSelf, useOthers, usePerson, usePresence, useSharedState, useSharedStore } from 'moi/collab'",
    '',
    'const self = useSelf() // participant | null',
    "const others = useOthers({ scope: 'workspace' }) // connections, not people",
    "const { identity, status } = usePerson('alex')",
    '',
    '// Temporary, gone when you leave.',
    "const mood = usePresence<string>('mood', 'Exploring')",
    "mood.setValue('Ready')",
    'mood.others // [{ participant, value }]',
    '',
    '// Saved for everyone.',
    "const note = useSharedState<string>('note', { scope: 'demo:kit', defaultValue: '' })",
    "await note.setValue('Ship it') // { status: 'committed', revision }",
    "const tasks = useSharedStore('task/', { scope: 'demo:kit' })",
    "await tasks.set('42/title', 'Ship demo')"
  ].join('\n'),
  cursors: [
    "import { Cursor, Cursors } from 'moi/collab'",
    '',
    '// One pointer at x, y inside a relative parent. Updates glide over 100 ms,',
    '// so 20 updates a second look continuous.',
    '<div className="relative h-96">',
    '  {pointers.map(pointer => (',
    '    <Cursor key={pointer.id} id={pointer.id} x={pointer.x} y={pointer.y} />',
    '  ))}',
    '</div>',
    '',
    '// Connected: everyone else’s pointer on this surface. Pointers over a',
    '// data-collab-target element follow that element on every screen.',
    '<Cursors surface="board">',
    '  <Board />',
    '</Cursors>'
  ].join('\n')
}

type CodeExampleProps = { code: string }
function CodeExample({ code }: CodeExampleProps) {
  return (
    <Collapsible className="flex flex-col items-start gap-2">
      <CollapsibleTrigger
        render={
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground [&[data-panel-open]>svg]:rotate-180"
          />
        }
      >
        <IconChevronDown stroke={1.75} className="transition-transform" />
        Code
      </CollapsibleTrigger>
      <CollapsibleContent className="w-full">
        <pre className="overflow-x-auto rounded-lg bg-muted p-3 font-mono text-xs leading-5">
          <code>{code}</code>
        </pre>
      </CollapsibleContent>
    </Collapsible>
  )
}

type SectionProps = { title: string; hint: string; code: string; children: ReactNode }
function Section({ title, hint, code, children }: SectionProps) {
  return (
    <section className="flex flex-col gap-3">
      <div>
        <h2 className="text-sm font-medium">{title}</h2>
        <p className="text-sm text-muted-foreground">{hint}</p>
      </div>
      {children}
      <CodeExample code={code} />
    </section>
  )
}

function PeopleDemo() {
  const [selected, setSelected] = useState('alex')
  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-4">
        <Person id="monica" avatarOnly size="xs" />
        <Person id="fig" avatarOnly size="sm" />
        <Person id="alex" avatarOnly size="md" />
        <Person id="andrea" avatarOnly size="lg" />
        <Person id="nobody" avatarOnly size="lg" />
      </div>
      <div className="grid gap-8 sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <p className="mb-1 text-xs text-muted-foreground">Select a person</p>
          {IDS.slice(0, 6).map(id => (
            <button
              key={id}
              type="button"
              aria-pressed={selected === id}
              className={cn(
                'flex cursor-pointer rounded-md px-2 py-1.5 text-left outline-none hover:bg-accent focus-visible:ring-3 focus-visible:ring-ring/50',
                selected === id && 'bg-accent'
              )}
              onClick={() => setSelected(id)}
            >
              <Person id={id} />
            </button>
          ))}
        </div>
        <div className="flex flex-col gap-4">
          <Person id="alex" you detail="Team board" />
          <Person id="fig" detail="Overview" />
          <Person id="andrea" detail="Away" />
          <Person id="fig" showStatus={false} detail="Dot turned off" />
          <Person id="david" size="lg" detail="Offline, from the directory" />
          <Person id="nobody" detail="An id nobody has used" />
        </div>
      </div>
      <div className="flex flex-col gap-3">
        <p className="text-xs text-muted-foreground">Compact</p>
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
          <Person id="fig" size="xs" />
          <Person id="alex" size="xs" you detail="Team board" />
          <Person id="andrea" size="xs" detail="Away" />
          <Person id="lauren" size="xs" detail="Offline" />
        </div>
        <p className="text-sm">
          Last edited by <Person id="david" size="xs" className="align-middle" /> a minute ago.
        </p>
      </div>
    </div>
  )
}

const TEXT_ICON = <IconCursorText size={12} stroke={1.75} />
const POINTER_ICON = <IconPointer size={12} stroke={1.75} />

type FrameExampleProps = { label: string; children: ReactNode }
function FrameExample({ label, children }: FrameExampleProps) {
  return (
    <div className="flex flex-col gap-2">
      {/* Room above the element for the name tag. */}
      <div className="pt-7">{children}</div>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  )
}

// None of the frames below is told a size or a radius.
function FramesDemo() {
  const [shown, setShown] = useState(true)
  const [note, setNote] = useState('Q3 launch checklist')
  const [details, setDetails] = useState('Confirm the venue and the catering count by Friday.')
  const [done, setDone] = useState([true, false, false])
  const at = (...ids: string[]) => (shown ? ids : [])
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <span className="text-sm text-muted-foreground">Frames</span>
        <Button size="sm" variant="secondary" onClick={() => setShown(value => !value)}>
          {shown ? 'Hide' : 'Show'}
        </Button>
      </div>
      <div className="grid gap-x-10 gap-y-4 sm:grid-cols-2">
        <FrameExample label="Input">
          <PresenceFrame ids={at('fig')} icon={TEXT_ICON}>
            <Input
              aria-label="Launch note"
              value={note}
              onChange={event => setNote(event.target.value)}
            />
          </PresenceFrame>
        </FrameExample>
        <FrameExample label="A small button in a full-width frame">
          <PresenceFrame ids={at('lauren')} icon={POINTER_ICON}>
            <Button>Publish</Button>
          </PresenceFrame>
        </FrameExample>
        <FrameExample label="Textarea">
          <PresenceFrame ids={at('david')} icon={TEXT_ICON}>
            <Textarea
              aria-label="Launch details"
              value={details}
              onChange={event => setDetails(event.target.value)}
            />
          </PresenceFrame>
        </FrameExample>
        <FrameExample label="Card, two people">
          <PresenceFrame ids={at('alex', 'andrea')} icon={POINTER_ICON}>
            <Card size="sm">
              <CardHeader>
                <CardTitle>Ship the demo</CardTitle>
                <CardDescription>Two people have this task selected.</CardDescription>
              </CardHeader>
            </Card>
          </PresenceFrame>
        </FrameExample>
        <FrameExample label="List row">
          <ul className="flex flex-col">
            {TASKS.map((task, index) => (
              <li key={task}>
                <PresenceFrame ids={index === 1 ? at('pierre') : []} icon={POINTER_ICON}>
                  <label className="flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 text-sm hover:bg-accent">
                    <Checkbox
                      checked={done[index]}
                      onCheckedChange={checked =>
                        setDone(current =>
                          current.map((value, position) => (position === index ? checked : value))
                        )
                      }
                    />
                    {task}
                  </label>
                </PresenceFrame>
              </li>
            ))}
          </ul>
        </FrameExample>
        <FrameExample label="Image">
          <PresenceFrame ids={at('monica')} icon={POINTER_ICON}>
            <div className="flex h-28 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
              <IconPhoto size={24} stroke={1.5} />
            </div>
          </PresenceFrame>
        </FrameExample>
        <FrameExample label="Switch and round button">
          <div className="flex items-center gap-16">
            <PresenceFrame ids={at('ada')}>
              <Switch aria-label="Notify the team" defaultChecked />
            </PresenceFrame>
            <PresenceFrame ids={at('fig')}>
              <Button
                size="icon"
                variant="secondary"
                className="rounded-full"
                aria-label="Add a task"
              >
                <IconPlus stroke={1.5} />
              </Button>
            </PresenceFrame>
          </div>
        </FrameExample>
        <FrameExample label="Text with no corners of its own">
          <PresenceFrame ids={at('andrea')} icon={TEXT_ICON}>
            <p className="text-sm leading-6">
              Draft the announcement post and the email to customers.
            </p>
          </PresenceFrame>
        </FrameExample>
      </div>
    </div>
  )
}

function GutterDemo() {
  const [spots, setSpots] = useState({ fig: 1, alex: 3, you: 0 })
  // Fig and Alex wander between blocks the way people move through a document.
  useEffect(() => {
    const move = (who: 'fig' | 'alex') =>
      setSpots(current => {
        let next = current[who]
        while (next === current[who]) next = Math.floor(Math.random() * BLOCKS.length)
        return { ...current, [who]: next }
      })
    const figTimer = setInterval(() => move('fig'), 1600)
    const alexTimer = setInterval(() => move('alex'), 2500)
    return () => {
      clearInterval(figTimer)
      clearInterval(alexTimer)
    }
  }, [])
  return (
    <PresenceGutter
      people={[
        { id: 'fig', target: `block-${spots.fig}` },
        { id: 'alex', target: `block-${spots.alex}` },
        { id: 'you', target: `block-${spots.you}` }
      ]}
      className="max-w-xl"
    >
      {BLOCKS.map((text, index) => (
        <p
          key={text}
          data-collab-target={`block-${index}`}
          className={cn(
            'cursor-pointer rounded-md px-2 py-1 text-sm leading-6 hover:bg-accent',
            index === 0 && 'font-medium',
            spots.you === index && 'bg-accent'
          )}
          onClick={() => setSpots(current => ({ ...current, you: index }))}
        >
          {text}
        </p>
      ))}
    </PresenceGutter>
  )
}

type Walker = { at: Point; to: Point; pause: number }

function randomPoint(width: number, height: number): Point {
  const inset = 48
  return {
    x: inset + Math.random() * Math.max(0, width - inset * 2),
    y: inset + Math.random() * Math.max(0, height - inset * 2)
  }
}

function CursorLab() {
  const canvas = useRef<HTMLDivElement>(null)
  const [count, setCount] = useState(3)
  const [labels, setLabels] = useState(true)
  const [dark, setDark] = useState(true)
  const [walkers, setWalkers] = useState<Walker[]>([])
  const [pointer, setPointer] = useState<Point | null>(null)
  const [echo, setEcho] = useState<Point | null>(null)

  // Made-up people wander at the cadence a real connection delivers updates.
  useEffect(() => {
    const element = canvas.current
    if (!element) return
    const { width, height } = element.getBoundingClientRect()
    let state: Walker[] = WALKERS.slice(0, count).map(() => ({
      at: randomPoint(width, height),
      to: randomPoint(width, height),
      pause: 0
    }))
    const timer = setInterval(() => {
      state = state.map(walker => {
        if (walker.pause > 0) return { ...walker, pause: walker.pause - 1 }
        const dx = walker.to.x - walker.at.x
        const dy = walker.to.y - walker.at.y
        if (Math.hypot(dx, dy) < 6) {
          return {
            at: walker.to,
            to: randomPoint(width, height),
            pause: 5 + Math.floor(Math.random() * 25)
          }
        }
        return { ...walker, at: { x: walker.at.x + dx * 0.08, y: walker.at.y + dy * 0.08 } }
      })
      setWalkers(state)
    }, 60)
    return () => clearInterval(timer)
  }, [count])

  // Your own pointer, echoed back with the delay a round trip would add.
  useEffect(() => {
    const timer = setTimeout(() => setEcho(pointer), 120)
    return () => clearTimeout(timer)
  }, [pointer])

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-muted-foreground">People</span>
        {[1, 2, 3, 4].map(n => (
          <Button
            key={n}
            size="sm"
            variant={count === n ? 'default' : 'secondary'}
            onClick={() => setCount(n)}
          >
            {n}
          </Button>
        ))}
        <span className="ml-3 text-sm text-muted-foreground">Names</span>
        <Button size="sm" variant="secondary" onClick={() => setLabels(value => !value)}>
          {labels ? 'Hide' : 'Show'}
        </Button>
        <span className="ml-3 text-sm text-muted-foreground">Surface</span>
        <Button size="sm" variant="secondary" onClick={() => setDark(value => !value)}>
          {dark ? 'Light' : 'Dark'}
        </Button>
      </div>
      <div
        ref={canvas}
        className={cn(
          'relative h-96 overflow-hidden rounded-xl',
          dark ? 'bg-foreground text-background' : 'bg-muted'
        )}
        onPointerMove={event => {
          const rect = event.currentTarget.getBoundingClientRect()
          setPointer({ x: event.clientX - rect.left, y: event.clientY - rect.top })
        }}
        onPointerLeave={() => setPointer(null)}
      >
        {walkers.slice(0, count).map((walker, index) => (
          <Cursor
            key={WALKERS[index]}
            id={WALKERS[index] ?? 'nobody'}
            x={walker.at.x}
            y={walker.at.y}
            label={labels}
          />
        ))}
        {echo && <Cursor id="you" x={echo.x} y={echo.y} label={labels} />}
        <p className="pointer-events-none absolute inset-x-0 bottom-6 text-center text-sm opacity-60">
          Move your cursor
        </p>
      </div>
      <p className="text-sm text-muted-foreground">
        Your own pointer comes back as a cursor about 120 ms late, the way it would for someone
        else.
      </p>
    </div>
  )
}

function ConnectedDemo() {
  const [note, setNote] = useState('Q3 launch checklist')
  const [selected, setSelected] = useState('task-2')
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-muted-foreground">
        <span className="flex items-center gap-2">
          On this page <Activity />
        </span>
        <span className="flex items-center gap-2">
          In the workspace <Activity scope="workspace" />
        </span>
      </div>
      <Cursors surface="lab" className="flex flex-col gap-8 rounded-xl bg-muted p-6 pt-10">
        <PresenceField target="launch-note" className="max-w-sm">
          <Input
            aria-label="Launch note"
            className="bg-background"
            value={note}
            onChange={event => setNote(event.target.value)}
          />
        </PresenceField>
        <div className="grid gap-4 sm:grid-cols-2">
          {['task-1', 'task-2'].map((task, index) => (
            <Selection key={task} target={task} selected={selected === task}>
              <Card
                size="sm"
                className={cn('cursor-pointer', selected === task && 'ring-2 ring-ring')}
                onClick={() => setSelected(task)}
              >
                <CardHeader>
                  <CardTitle>{index === 0 ? 'Ship the demo' : 'Write the announcement'}</CardTitle>
                  <CardDescription>
                    {index === 0 ? 'Alex has this one selected.' : 'Click to select it yourself.'}
                  </CardDescription>
                </CardHeader>
              </Card>
            </Selection>
          ))}
        </div>
      </Cursors>
    </div>
  )
}

type OutputProps = { value: unknown }
// Faces are long data URLs; they would drown the rest.
function Output({ value }: OutputProps) {
  return (
    <pre className="max-h-48 overflow-auto rounded-lg bg-muted p-3 font-mono text-xs leading-5">
      {JSON.stringify(value, (key, entry) => (key === 'avatar' ? undefined : entry), 2) ?? 'null'}
    </pre>
  )
}

type HookCardProps = { signature: string; children: ReactNode }
function HookCard({ signature, children }: HookCardProps) {
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <p className="font-mono text-xs">{signature}</p>
      {children}
    </div>
  )
}

type HooksDemoProps = { room: FakeCollabBackend }
function HooksDemo({ room }: HooksDemoProps) {
  const self = useSelf()
  const [scope, setScope] = useState<'page' | 'workspace'>('page')
  const others = useOthers({ scope })
  const [personId, setPersonId] = useState('alex')
  const person = usePerson(personId)
  const mood = usePresence<string>('mood', 'Exploring')
  const note = useSharedState<string>('note', { scope: SCOPE, defaultValue: '' })
  const tasks = useSharedStore('task/', { scope: SCOPE })
  const status = ({ loaded, canWrite, isSaving, error }: typeof note | typeof tasks) => ({
    loaded,
    canWrite,
    isSaving,
    error
  })
  return (
    <div className="grid gap-x-10 gap-y-8 sm:grid-cols-2">
      <HookCard signature="useSelf()">
        <Output
          value={
            self && {
              identity: self.identity,
              location: self.location,
              presence: self.presence.length
            }
          }
        />
      </HookCard>
      <HookCard signature={`useOthers({ scope: '${scope}' })`}>
        <div className="flex gap-2">
          {(['page', 'workspace'] as const).map(option => (
            <Button
              key={option}
              size="sm"
              variant={scope === option ? 'default' : 'secondary'}
              onClick={() => setScope(option)}
            >
              {option}
            </Button>
          ))}
        </div>
        <Output
          value={others.map(other => ({
            name: other.identity.name,
            page: other.location?.page ?? null
          }))}
        />
      </HookCard>
      <HookCard signature={`usePerson('${personId}')`}>
        <div className="flex flex-wrap gap-2">
          {['alex', 'andrea', 'david', 'nobody'].map(id => (
            <Button
              key={id}
              size="sm"
              variant={personId === id ? 'default' : 'secondary'}
              onClick={() => setPersonId(id)}
            >
              {id}
            </Button>
          ))}
        </div>
        <Output value={person} />
      </HookCard>
      <HookCard signature="usePresence('mood', 'Exploring')">
        <div className="flex flex-wrap gap-2">
          {['Exploring', 'Reviewing', 'Ready'].map(option => (
            <Button
              key={option}
              size="sm"
              variant={mood.value === option ? 'default' : 'secondary'}
              onClick={() => mood.setValue(option)}
            >
              {option}
            </Button>
          ))}
        </div>
        <Output
          value={{
            value: mood.value,
            others: mood.others.map(other => ({
              name: other.participant.identity.name,
              value: other.value
            }))
          }}
        />
      </HookCard>
      <HookCard signature="useSharedState('note', { scope })">
        <div className="flex gap-2">
          <Input
            aria-label="Shared note"
            placeholder="Type to save"
            value={note.value ?? ''}
            disabled={!note.canWrite}
            onChange={event => void note.setValue(event.target.value)}
          />
          <Button
            size="sm"
            variant="secondary"
            onClick={() => room.write(SCOPE, [{ type: 'set', key: 'note', value: 'Fig was here' }])}
          >
            Edit as Fig
          </Button>
        </div>
        <Output value={{ value: note.value, exists: note.exists, ...status(note) }} />
      </HookCard>
      <HookCard signature="useSharedStore('task/', { scope })">
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="secondary"
            disabled={!tasks.canWrite}
            onClick={() => {
              const id = crypto.randomUUID().slice(0, 4)
              void tasks.batch([
                { type: 'set', key: `${id}/exists`, value: true },
                { type: 'set', key: `${id}/title`, value: `Task ${id}` }
              ])
            }}
          >
            Add task
          </Button>
          <Button
            size="sm"
            variant="secondary"
            disabled={!tasks.canWrite || !Object.keys(tasks.entries).length}
            onClick={() =>
              void tasks.batch(
                Object.keys(tasks.entries).map(key => ({ type: 'delete' as const, key }))
              )
            }
          >
            Clear
          </Button>
        </div>
        <Output value={{ entries: tasks.entries, ...status(tasks) }} />
      </HookCard>
    </div>
  )
}

export function DevCollabKit() {
  const [room] = useState(() =>
    createFakeBackend({
      self: you,
      page: PAGE,
      others: everyoneElse(START),
      people: DIRECTORY,
      entries: { [SCOPE]: { note: 'Saved for everyone' } },
      latency: 400
    })
  )
  useBots(room)
  return (
    <CollabBackendProvider backend={room}>
      <AppletCollabProvider workspaceId="preview" applet={APPLET}>
        <div className="flex flex-col gap-10 border-t border-border pt-8">
          <header>
            <h2 className="text-base font-medium">Playground</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Everything applets get from moi/collab, running on an in-memory room instead of a
              server. The people are made up: Fig and Alex are on this page, Pierre is elsewhere in
              the workspace, Andrea is away, and the rest exist only in the directory. The first
              part is what it looks like, the second part is how it behaves.
            </p>
          </header>

          <Section
            title="Person"
            hint="One component for a person, given by id. The dot marks a visible tab; an unknown id stays readable."
            code={CODE.person}
          >
            <PeopleDemo />
          </Section>

          <Section
            title="Facepile"
            hint="Overlapping faces, then a count for everyone else."
            code={CODE.facepile}
          >
            <div className="flex flex-wrap items-center gap-8">
              <Facepile ids={IDS.slice(0, 4)} size="xs" />
              <Facepile ids={IDS.slice(0, 2)} />
              <Facepile ids={IDS.slice(0, 5)} />
              <Facepile ids={IDS} max={5} size="md" />
              <Facepile ids={IDS.slice(0, 4)} size="md" showStatus />
            </div>
          </Section>

          <Section
            title="Frames"
            hint="Wrap anything. The frame hugs the element inside and takes its corner radius, and a small element gets its name tag from the left edge."
            code={CODE.frames}
          >
            <FramesDemo />
          </Section>

          <Section
            title="Gutter"
            hint="A face beside the block each person is on. Click a paragraph to move yourself; Fig and Alex wander."
            code={CODE.gutter}
          >
            <GutterDemo />
          </Section>

          <Section
            title="Cursors"
            hint="Other people’s pointers on a shared surface, moving the way live updates arrive."
            code={CODE.cursors}
          >
            <CursorLab />
          </Section>

          <div className="border-t border-border pt-8">
            <h2 className="text-base font-medium">Behavior</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              The same exports an applet imports, wired to the in-memory room. Fig and Alex are
              scripted; you are a real participant.
            </p>
          </div>

          <Section
            title="Connected components"
            hint="They take no people or positions: each reports you and shows everyone else. Fig’s pointer wanders, Fig steps in and out of the note, and Alex holds the first card."
            code={CODE.connected}
          >
            <ConnectedDemo />
          </Section>

          <Section
            title="Hooks"
            hint="Live return values. Saves take 400 ms here so the saving state is visible."
            code={CODE.hooks}
          >
            <HooksDemo room={room} />
          </Section>
        </div>
      </AppletCollabProvider>
    </CollabBackendProvider>
  )
}
