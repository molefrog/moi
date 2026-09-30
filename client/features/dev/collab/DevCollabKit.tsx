import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'

import { IconChevronDown, IconPlus, IconTrash } from '@tabler/icons-react'

import { Button } from '@/client/components/ui/button'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger
} from '@/client/components/ui/collapsible'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle
} from '@/client/components/ui/dialog'
import { Input } from '@/client/components/ui/input'
import { Textarea } from '@/client/components/ui/textarea'
import type { JsonValue } from 'moi'
import type { UserProfile, Connection, PresenceRegistration } from '@/lib/collab/types'

import {
  Activity,
  Cursors,
  Facepile,
  PresenceFrame,
  PresenceGroup,
  PresenceGutter,
  Selection,
  User
} from '@/client/features/collab/components'
import { createFakeEngine } from '@/client/features/collab/fake-engine'
import type { FakeEngine } from '@/client/features/collab/fake-engine'
import {
  AppletPresenceProvider,
  CollabContext,
  presenceChannels,
  useMe,
  usePeers,
  usePresence,
  usePublishPresence,
  useUser,
  useWorkspaceUsers
} from '@/client/features/collab/hooks'
import { presenceTarget } from '@/client/features/collab/presence-target'

const YOU: UserProfile = {
  id: 'you',
  name: 'You',
  email: 'you@example.com',
  color: 'violet'
}
const USERS: UserProfile[] = [
  YOU,
  { id: 'fig', name: 'Fig', email: 'fig@example.com', color: 'amber' },
  { id: 'alex', name: 'Alex Hao', email: 'alex@example.com', color: 'blue' },
  { id: 'andrea', name: 'Andrea Lim', email: 'andrea@example.com', color: 'pink' },
  { id: 'pierre', name: 'Pierre', email: 'pierre@example.com', color: 'orange' },
  { id: 'david', name: 'David Tibbitts', email: 'david@example.com', color: 'emerald' }
]
const PAGE = 'kit'
const APPLET_ID = 'view:kit'
const TARGETS = [
  ['First task', presenceTarget('tasks', 'launch')],
  ['Second task', presenceTarget('tasks', 'notes')],
  ['Nested form', presenceTarget('project', 'launch', 'fields', 'name')],
  ['Launch dialog', presenceTarget('todo', 'launch', 'dialog', 'title')]
] as const

function registration(userId: string, channel: string, value: JsonValue): PresenceRegistration {
  return { registrationId: `${userId}:${channel}`, appletId: APPLET_ID, channel, value }
}

function sampleConnections(target: string, tick = 0): Connection[] {
  return [
    {
      connectionId: 'bot-fig',
      userId: 'fig',
      location: { page: PAGE, status: 'active' },
      presence: [
        registration('fig', presenceChannels.field(target), true),
        registration('fig', presenceChannels.cursor('examples'), {
          x: 100,
          y: 50,
          target,
          targetX: 0.45 + Math.sin(tick / 10) * 0.15,
          targetY: 0.6
        }),
        registration('fig', presenceChannels.custom('mood'), 'Reviewing')
      ]
    },
    {
      connectionId: 'bot-alex',
      userId: 'alex',
      location: { page: PAGE, status: 'active' },
      presence: [
        registration(
          'alex',
          presenceChannels.selection(presenceTarget('tasks', 'selected:notes')),
          true
        ),
        registration('alex', presenceChannels.custom('mood'), 'Ready')
      ]
    },
    {
      connectionId: 'bot-pierre',
      userId: 'pierre',
      location: { page: 'view:board', status: 'active' },
      presence: []
    },
    { connectionId: 'bot-andrea', userId: 'andrea', location: null, presence: [] }
  ]
}

function useBots(room: FakeEngine, target: string) {
  useEffect(() => {
    let tick = 0
    room.setOtherConnections(sampleConnections(target))
    const timer = setInterval(
      () => room.setOtherConnections(sampleConnections(target, ++tick)),
      100
    )
    return () => clearInterval(timer)
  }, [room, target])
}

type CodeExampleProps = { code: string }
function CodeExample({ code }: CodeExampleProps) {
  return (
    <Collapsible className="flex flex-col items-start gap-2">
      <CollapsibleTrigger
        render={<Button variant="ghost" size="sm" className="text-muted-foreground" />}
      >
        <IconChevronDown stroke={1.75} />
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

type SectionProps = { title: string; hint: string; code?: string; children: ReactNode }
function Section({ title, hint, code, children }: SectionProps) {
  return (
    <section className="flex min-w-0 flex-col gap-4">
      <header>
        <h2 className="text-sm font-medium">{title}</h2>
        <p className="text-sm text-muted-foreground">{hint}</p>
      </header>
      {children}
      {code && <CodeExample code={code} />}
    </section>
  )
}

type Task = { id: string; title: string }
const INITIAL_TASKS: Task[] = [
  { id: 'launch', title: 'Ship the demo' },
  { id: 'notes', title: 'Write the announcement' }
]

function EditableList() {
  const [tasks, setTasks] = useState(INITIAL_TASKS)
  const [selected, setSelected] = useState('launch')
  return (
    <Section
      title="Editable list"
      hint="Each task has an explicit presence ID inside the tasks group. Reorder or remove rows: Fig stays with the same task. Alex has the announcement selected. Text edits stay local."
      code={
        '<PresenceGroup id="tasks">\n  <div className="space-y-4">\n    {tasks.map(task => (\n      <PresenceGutter key={task.id} id={task.id}>\n        <Selection id={`selected:${task.id}`} selected={selected === task.id}>\n          <Input value={task.title} onChange={...} />\n        </Selection>\n      </PresenceGutter>\n    ))}\n  </div>\n</PresenceGroup>'
      }
    >
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="secondary"
          onClick={() => setTasks(current => [...current].reverse())}
        >
          Reverse order
        </Button>
        <Button
          size="sm"
          variant="secondary"
          onClick={() =>
            setTasks(current => [...current, { id: crypto.randomUUID(), title: 'New task' }])
          }
        >
          <IconPlus stroke={1.75} /> Add task
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setTasks(INITIAL_TASKS)}>
          Reset list
        </Button>
      </div>
      <PresenceGroup id="tasks">
        <div className="flex flex-col gap-8 py-3">
          {tasks.map(task => (
            <PresenceGutter key={task.id} id={task.id}>
              <Selection id={`selected:${task.id}`} selected={selected === task.id}>
                <div className="flex items-center gap-2">
                  <Input
                    className="min-w-0 flex-1"
                    aria-label={`Title for ${task.id}`}
                    value={task.title}
                    onFocus={() => setSelected(task.id)}
                    onChange={event =>
                      setTasks(current =>
                        current.map(item =>
                          item.id === task.id ? { ...item, title: event.target.value } : item
                        )
                      )
                    }
                  />
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    aria-label={`Remove ${task.title}`}
                    onClick={() => setTasks(current => current.filter(item => item.id !== task.id))}
                  >
                    <IconTrash stroke={1.75} />
                  </Button>
                </div>
              </Selection>
            </PresenceGutter>
          ))}
        </div>
      </PresenceGroup>
      {!tasks.length && (
        <p className="text-sm text-muted-foreground">No tasks. Add a task or reset the list.</p>
      )}
    </Section>
  )
}

function NestedForm() {
  const [name, setName] = useState('Q3 launch')
  const [notes, setNotes] = useState('Confirm the venue by Friday.')
  return (
    <Section
      title="Nested controls"
      hint="Nested groups combine their IDs without adding layout. Each field has its own frame, including the controls inside its label. The nearest frame owns focus, so the outer frame stays quiet."
      code={
        '<PresenceGroup id="project">\n  <PresenceGroup id="launch">\n    <PresenceFrame id="section">\n      <div className="space-y-6">\n        <PresenceGroup id="fields">\n          <PresenceFrame id="name">\n            <label>Project name <Input /></label>\n          </PresenceFrame>\n          <PresenceFrame id="notes">\n            <label>Project notes <Textarea /></label>\n          </PresenceFrame>\n        </PresenceGroup>\n      </div>\n    </PresenceFrame>\n  </PresenceGroup>\n</PresenceGroup>'
      }
    >
      <PresenceGroup id="project">
        <PresenceGroup id="launch">
          <PresenceFrame id="section">
            <div className="flex flex-col gap-6 rounded-lg bg-muted p-4">
              <PresenceGroup id="fields">
                <PresenceFrame id="name">
                  <label className="flex flex-col gap-2 text-sm">
                    Project name
                    <Input value={name} onChange={event => setName(event.target.value)} />
                  </label>
                </PresenceFrame>
                <PresenceFrame id="notes">
                  <label className="flex flex-col gap-2 text-sm">
                    Project notes
                    <Textarea value={notes} onChange={event => setNotes(event.target.value)} />
                  </label>
                </PresenceFrame>
                <PresenceFrame id="reset">
                  <Button
                    size="sm"
                    variant="secondary"
                    className="self-start"
                    onClick={() => setNotes('Confirm the venue by Friday.')}
                  >
                    Reset notes
                  </Button>
                </PresenceFrame>
              </PresenceGroup>
            </div>
          </PresenceFrame>
        </PresenceGroup>
      </PresenceGroup>
    </Section>
  )
}

function RecordDialogs() {
  const [record, setRecord] = useState<Task | null>(null)
  return (
    <Section
      title="One dialog, different records"
      hint="Choose Launch dialog in Fig’s controls, then open each record. Fig only appears on the matching record, even though both use the same dialog component."
      code={
        '<PresenceGroup id="todo">\n  <PresenceGroup id={record.id}>\n    <PresenceGroup id="dialog">\n      <PresenceFrame id="title">\n        <Input value={record.title} onChange={...} />\n      </PresenceFrame>\n    </PresenceGroup>\n  </PresenceGroup>\n</PresenceGroup>'
      }
    >
      <div className="flex flex-wrap gap-2">
        {INITIAL_TASKS.map(task => (
          <Button key={task.id} size="sm" variant="secondary" onClick={() => setRecord(task)}>
            Open {task.id}
          </Button>
        ))}
      </div>
      <Dialog
        open={record !== null}
        onOpenChange={open => {
          if (!open) setRecord(null)
        }}
      >
        <DialogContent>
          <DialogTitle className="font-medium">Edit {record?.id}</DialogTitle>
          <DialogDescription>Presence follows the record’s stable ID.</DialogDescription>
          {record && (
            <Cursors id="examples" className="pt-6">
              <PresenceGroup id="todo">
                <PresenceGroup id={record.id}>
                  <PresenceGroup id="dialog">
                    <PresenceFrame id="title">
                      <Input
                        aria-label="Record title"
                        value={record.title}
                        onChange={event => setRecord({ ...record, title: event.target.value })}
                      />
                    </PresenceFrame>
                  </PresenceGroup>
                </PresenceGroup>
              </PresenceGroup>
            </Cursors>
          )}
          <div className="flex gap-2">
            {INITIAL_TASKS.filter(task => task.id !== record?.id).map(task => (
              <Button key={task.id} size="sm" variant="secondary" onClick={() => setRecord(task)}>
                Switch to {task.id}
              </Button>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </Section>
  )
}

type OutputProps = { value: unknown }
function Output({ value }: OutputProps) {
  return (
    <pre className="max-h-48 overflow-auto rounded-lg bg-muted p-3 font-mono text-xs leading-5">
      {JSON.stringify(value, (key, entry) => (key === 'avatar' ? undefined : entry), 2) ??
        'undefined'}
    </pre>
  )
}

function HooksDemo() {
  const me = useMe()
  const peers = usePeers({ scope: 'workspace' })
  const workspaceUsers = useWorkspaceUsers()
  const offline = useWorkspaceUsers({ status: 'offline' })
  const user = useUser('david')
  const [mood, setMood] = useState('Exploring')
  usePublishPresence('mood', mood)
  const presence = usePresence<string>('mood')
  return (
    <Section
      title="Hooks"
      hint="Profiles and connection status are separate from ephemeral channel values. Reading a channel does not publish to it."
      code={
        "const me = useMe()\nconst peers = usePeers({ scope: 'workspace', status: 'active' })\nconst workspaceUsers = useWorkspaceUsers() // Includes you and offline users\nconst offline = useWorkspaceUsers({ status: 'offline' })\nconst user = useUser(assigneeId)\nusePublishPresence('mood', mood)\nconst presence = usePresence<string>('mood')"
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <code className="font-mono text-xs">useMe()</code>
          <Output value={me} />
        </div>
        <div className="flex flex-col gap-2">
          <code className="font-mono text-xs">usePeers({'{ scope: "workspace" }'})</code>
          <Output value={peers} />
        </div>
        <div className="flex flex-col gap-2">
          <code className="font-mono text-xs">useWorkspaceUsers()</code>
          <Output value={workspaceUsers} />
        </div>
        <div className="flex flex-col gap-2">
          <code className="font-mono text-xs">useWorkspaceUsers({'{ status: "offline" }'})</code>
          <Output value={offline} />
        </div>
        <div className="flex flex-col gap-2">
          <code className="font-mono text-xs">useUser('david')</code>
          <Output value={user} />
        </div>
        <div className="flex flex-col gap-2">
          <label className="flex flex-col gap-2 text-sm">
            Your mood
            <Input value={mood} onChange={event => setMood(event.target.value)} />
          </label>
          <code className="font-mono text-xs">usePresence('mood')</code>
          <Output value={presence} />
        </div>
      </div>
    </Section>
  )
}

export function DevCollabKit() {
  const [room] = useState(() =>
    createFakeEngine({
      self: YOU,
      page: PAGE,
      otherConnections: sampleConnections(TARGETS[0][1]),
      users: USERS
    })
  )
  const [target, setTarget] = useState<string>(TARGETS[0][1])
  const [renamed, setRenamed] = useState(false)
  const [david, setDavid] = useState(true)
  useBots(room, target)
  useEffect(() => {
    room.setUsers(
      USERS.filter(user => david || user.id !== 'david').map(user =>
        user.id === 'fig' && renamed ? { ...user, name: 'Fig Newton', color: 'emerald' } : user
      )
    )
  }, [room, renamed, david])
  return (
    <CollabContext value={room}>
      <AppletPresenceProvider appletId={APPLET_ID}>
        <div className="flex flex-col gap-10 border-t border-border pt-8">
          <header>
            <h2 className="text-base font-medium">Presence playground</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              An in-memory room with sample users. Fig and Alex are here, Pierre is on another page,
              Andrea is away, and David is offline.
            </p>
          </header>
          <Section
            title="Users and directory updates"
            hint="Changing a profile updates every avatar and label. Removing an offline user makes their ID unknown."
            code={'<User id="fig" />\n<Facepile ids={watcherIds} />'}
          >
            <div className="flex flex-wrap items-center gap-5">
              <User id="fig" /> <User id="andrea" detail="Away" />{' '}
              <User id="david" detail={david ? 'Offline' : 'Removed'} /> <User id="unknown" />
            </div>
            <div className="flex flex-wrap items-center gap-5">
              <User id="alex" avatarOnly size="xs" />
              <User id="alex" avatarOnly size="sm" />
              <User id="alex" avatarOnly size="md" />
              <User id="alex" avatarOnly size="lg" />
              <Facepile ids={USERS.map(user => user.id)} />
            </div>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="secondary" onClick={() => setRenamed(value => !value)}>
                {renamed ? 'Restore Fig' : 'Rename Fig'}
              </Button>
              <Button size="sm" variant="secondary" onClick={() => setDavid(value => !value)}>
                {david ? 'Remove David' : 'Restore David'}
              </Button>
            </div>
          </Section>
          <Section
            title="Activity"
            hint="Includes you and connected users. Workspace scope also includes Pierre on another page and Andrea while away. Offline users are excluded."
            code={'<Activity />\n<Activity scope="workspace" />'}
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex flex-col items-start gap-2">
                <p className="text-sm text-muted-foreground">This page</p>
                <Activity />
              </div>
              <div className="flex flex-col items-start gap-2">
                <p className="text-sm text-muted-foreground">Workspace</p>
                <Activity scope="workspace" />
              </div>
            </div>
          </Section>
          <Section
            title="Fig’s focus"
            hint="Choose a semantic target. Fig’s cursor and focus indicator move together; a missing target renders neither."
          >
            <div className="flex flex-wrap gap-2">
              {TARGETS.map(([label, value]) => (
                <Button
                  key={value}
                  size="sm"
                  variant={target === value ? 'default' : 'secondary'}
                  onClick={() => setTarget(value)}
                >
                  {label}
                </Button>
              ))}
            </div>
          </Section>
          <Cursors id="examples" className="flex flex-col gap-10">
            <EditableList />
            <NestedForm />
            <RecordDialogs />
          </Cursors>
          <HooksDemo />
        </div>
      </AppletPresenceProvider>
    </CollabContext>
  )
}
