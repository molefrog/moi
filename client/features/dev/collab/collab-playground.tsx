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

import { FocusFrame } from '@/client/features/collab/components/focus-frame'
import { PresenceGroup } from '@/client/features/collab/components/presence-group'
import { FocusAvatars } from '@/client/features/collab/components/focus-avatars'
import { Selection } from '@/client/features/collab/components/selection'
import { Cursors } from '@/client/features/collab/components/cursors'
import { Activity } from '@/client/features/collab/components/activity'
import { AvatarGroup } from '@/client/features/collab/components/avatar-group'
import { User } from '@/client/features/collab/components/user'
import { UserAvatar } from '@/client/features/collab/components/user-avatar'
import { createFakeEngine } from '@/client/features/collab/testing/fake-engine'
import type { FakeEngine } from '@/client/features/collab/testing/fake-engine'
import {
  presenceChannels,
  useMe,
  usePeers,
  usePresence,
  usePublishPresence,
  useUser,
  useWorkspaceUsers
} from '@/client/features/collab/hooks'
import { AppletPresenceProvider, CollabContext } from '@/client/features/collab/provider'
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
const APPLET_ID = 'views/kit'
const TARGETS = [
  ['First task', presenceTarget('tasks', 'launch')],
  ['Second task', presenceTarget('tasks', 'notes')],
  ['Nested form', presenceTarget('project', 'launch', 'fields', 'name')],
  ['Launch dialog', presenceTarget('todo', 'launch', 'dialog', 'title')]
] as const

function registration(userId: string, channel: string, value: JsonValue): PresenceRegistration {
  return { registrationId: `${userId}:${channel}`, appletId: APPLET_ID, channel, value }
}

function sampleConnections(target: string, tick = 0, alexSelected = true): Connection[] {
  return [
    {
      connectionId: 'bot-fig',
      userId: 'fig',
      location: { page: PAGE, status: 'active' },
      presence: [
        registration('fig', presenceChannels.field(target), true),
        registration('fig', presenceChannels.field(presenceTarget('comparison', 'focus')), true),
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
          presenceChannels.selection(presenceTarget('comparison', 'selection')),
          alexSelected
        ),
        registration('alex', presenceChannels.field(presenceTarget('comparison', 'avatars')), true),
        registration('alex', presenceChannels.custom('mood'), 'Ready')
      ]
    },
    {
      connectionId: 'bot-pierre',
      userId: 'pierre',
      location: { page: 'views/board', status: 'active' },
      presence: []
    },
    { connectionId: 'bot-andrea', userId: 'andrea', location: null, presence: [] }
  ]
}

function useBots(room: FakeEngine, target: string, alexSelected: boolean) {
  useEffect(() => {
    let tick = 0
    room.setOtherConnections(sampleConnections(target, 0, alexSelected))
    const timer = setInterval(
      () => room.setOtherConnections(sampleConnections(target, ++tick, alexSelected)),
      100
    )
    return () => clearInterval(timer)
  }, [room, target, alexSelected])
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

type FocusAndSelectionDemoProps = { alexSelected: boolean; onToggleAlex: () => void }

function FocusAndSelectionDemo({ alexSelected, onToggleAlex }: FocusAndSelectionDemoProps) {
  const [selected, setSelected] = useState(false)
  return (
    <Section
      title="FocusFrame, FocusAvatars, and Selection"
      hint="FocusFrame tracks focus inside a field and shows an outline with names. FocusAvatars tracks the same activity and shows avatars beside the field. Selection follows the selected value your app supplies and stays selected when focus moves away."
      code={
        '<PresenceGroup id="comparison">\n  <FocusFrame id="focus"><Input /></FocusFrame>\n  <FocusAvatars id="avatars"><Input /></FocusAvatars>\n  <Selection id="selection" selected={selected}>\n    <Button onClick={() => setSelected(value => !value)}>Select item</Button>\n  </Selection>\n</PresenceGroup>'
      }
    >
      <PresenceGroup id="comparison">
        <div className="grid gap-8 py-3 sm:grid-cols-2">
          <FocusFrame id="focus">
            <label className="flex flex-col gap-2 text-sm">
              FocusFrame: Fig is editing
              <Input aria-label="FocusFrame example" defaultValue="Focus this field" />
            </label>
          </FocusFrame>
          <FocusAvatars id="avatars">
            <label className="flex flex-col gap-2 text-sm">
              FocusAvatars: Alex is editing
              <Input aria-label="FocusAvatars example" defaultValue="Focus this field" />
            </label>
          </FocusAvatars>
        </div>
        <Selection id="selection" selected={selected}>
          <div className="flex flex-col items-start gap-3 rounded-lg bg-muted p-4">
            <p className="text-sm">Selection: a task card</p>
            <Button
              size="sm"
              variant="secondary"
              aria-pressed={selected}
              onClick={() => setSelected(value => !value)}
            >
              {selected ? 'Deselect your item' : 'Select your item'}
            </Button>
            <p className="text-sm text-muted-foreground">
              Your selection: {selected ? 'selected' : 'unselected'}. Focus another field to keep
              this selection.
            </p>
          </div>
        </Selection>
      </PresenceGroup>
      <Button size="sm" variant="secondary" className="self-start" onClick={onToggleAlex}>
        {alexSelected ? 'Clear Alex’s selection' : 'Select item as Alex'}
      </Button>
    </Section>
  )
}

function EditableList() {
  const [tasks, setTasks] = useState(INITIAL_TASKS)
  return (
    <Section
      title="FocusAvatars and stable list IDs"
      hint="PresenceGroup gives each task a stable focus ID. Reorder or remove rows: Fig’s focus avatar and cursor stay with the same task. Text edits stay local."
      code={
        '<PresenceGroup id="tasks">\n  <div className="space-y-4">\n    {tasks.map(task => (\n      <FocusAvatars key={task.id} id={task.id}>\n        <Input value={task.title} onChange={...} />\n      </FocusAvatars>\n    ))}\n  </div>\n</PresenceGroup>'
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
            <FocusAvatars key={task.id} id={task.id}>
              <div className="flex items-center gap-2">
                <Input
                  className="min-w-0 flex-1"
                  aria-label={`Title for ${task.id}`}
                  value={task.title}
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
            </FocusAvatars>
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
      title="FocusFrame and nested groups"
      hint="PresenceGroup combines IDs without adding layout. FocusFrame automatically tracks the controls inside each label. The nearest frame owns focus, so the outer frame stays quiet."
      code={
        '<PresenceGroup id="project">\n  <PresenceGroup id="launch">\n    <FocusFrame id="section">\n      <div className="space-y-6">\n        <PresenceGroup id="fields">\n          <FocusFrame id="name">\n            <label>Project name <Input /></label>\n          </FocusFrame>\n          <FocusFrame id="notes">\n            <label>Project notes <Textarea /></label>\n          </FocusFrame>\n        </PresenceGroup>\n      </div>\n    </FocusFrame>\n  </PresenceGroup>\n</PresenceGroup>'
      }
    >
      <PresenceGroup id="project">
        <PresenceGroup id="launch">
          <FocusFrame id="section">
            <div className="flex flex-col gap-6 rounded-lg bg-muted p-4">
              <PresenceGroup id="fields">
                <FocusFrame id="name">
                  <label className="flex flex-col gap-2 text-sm">
                    Project name
                    <Input value={name} onChange={event => setName(event.target.value)} />
                  </label>
                </FocusFrame>
                <FocusFrame id="notes">
                  <label className="flex flex-col gap-2 text-sm">
                    Project notes
                    <Textarea value={notes} onChange={event => setNotes(event.target.value)} />
                  </label>
                </FocusFrame>
                <FocusFrame id="reset">
                  <Button
                    size="sm"
                    variant="secondary"
                    className="self-start"
                    onClick={() => setNotes('Confirm the venue by Friday.')}
                  >
                    Reset notes
                  </Button>
                </FocusFrame>
              </PresenceGroup>
            </div>
          </FocusFrame>
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
        '<PresenceGroup id="todo">\n  <PresenceGroup id={record.id}>\n    <PresenceGroup id="dialog">\n      <FocusFrame id="title">\n        <Input value={record.title} onChange={...} />\n      </FocusFrame>\n    </PresenceGroup>\n  </PresenceGroup>\n</PresenceGroup>'
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
                    <FocusFrame id="title">
                      <Input
                        aria-label="Record title"
                        value={record.title}
                        onChange={event => setRecord({ ...record, title: event.target.value })}
                      />
                    </FocusFrame>
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
      title="User and presence hooks"
      hint="Profiles and connection status are separate from ephemeral channel values. Reading a channel does not publish to it."
      code={
        "const me = useMe()\nconst peers = usePeers({ scope: 'workspace' })\nconst workspaceUsers = useWorkspaceUsers() // Includes you and offline users\nconst offline = useWorkspaceUsers({ status: 'offline' })\nconst user = useUser('david')\nusePublishPresence('mood', mood)\nconst presence = usePresence<string>('mood')"
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
          <code className="font-mono text-xs">usePublishPresence('mood', mood)</code>
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

export function CollabPlayground() {
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
  const [alexSelected, setAlexSelected] = useState(true)
  useBots(room, target, alexSelected)
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
            title="User, UserAvatar, and AvatarGroup"
            hint="User shows an avatar and name; UserAvatar shows the avatar alone. AvatarGroup groups avatars with an overflow count. Profile edits update all three; removed IDs become unknown."
            code={
              '<User id="alex" size="xs" description="Online" />\n<User id="alex" size="sm" />\n<User id="alex" size="default" />\n<UserAvatar id="alex" size="sm" />\n<AvatarGroup ids={watcherIds} />'
            }
          >
            <div className="flex flex-wrap items-center gap-5">
              <User id="fig" /> <User id="andrea" description="Away" />{' '}
              <User id="david" description={david ? 'Offline' : 'Removed'} /> <User id="unknown" />
            </div>
            <div className="flex flex-wrap items-center gap-5">
              <User id="alex" size="xs" description="Online" />
              <User id="alex" size="sm" description="Online" />
              <User id="alex" size="default" description="Online" />
            </div>
            <div className="flex flex-wrap items-center gap-5">
              <UserAvatar id="alex" size="xs" />
              <UserAvatar id="alex" size="sm" />
              <UserAvatar id="alex" size="default" />
              <UserAvatar id="alex" size="lg" />
              <AvatarGroup ids={USERS.map(user => user.id)} />
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
            hint="Choose where Fig is focused in the examples below. His cursor follows that field through scrolling and reordering, and disappears when the field is removed."
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
          <FocusAndSelectionDemo
            alexSelected={alexSelected}
            onToggleAlex={() => setAlexSelected(value => !value)}
          />
          <Section
            title="Cursors"
            hint="Cursors shares pointers within its wrapped area. Fig’s pointer is anchored to the field selected above; scroll, reorder rows, or open the matching dialog to see it follow the same record."
            code={'<Cursors id="examples">{children}</Cursors>'}
          >
            <Cursors id="examples" className="flex flex-col gap-10">
              <EditableList />
              <NestedForm />
              <RecordDialogs />
            </Cursors>
          </Section>
          <HooksDemo />
        </div>
      </AppletPresenceProvider>
    </CollabContext>
  )
}
