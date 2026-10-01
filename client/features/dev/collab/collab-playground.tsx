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
import type { UserProfile, Connection } from '@/lib/collab/types'

import { PresenceFrame } from '@/client/features/collab/components/presence-frame'
import { PresenceGroup } from '@/client/features/collab/components/presence-group'
import { PresenceAvatars } from '@/client/features/collab/components/presence-avatars'
import { Cursors } from '@/client/features/collab/components/cursors'
import { UserAvatarGroup } from '@/client/features/collab/components/user-avatar-group'
import { User } from '@/client/features/collab/components/user'
import { UserAvatar } from '@/client/features/collab/components/user-avatar'
import { createFakeEngine } from '@/client/features/collab/testing/fake-engine'
import type { FakeEngine } from '@/client/features/collab/testing/fake-engine'
import {
  useMe,
  usePeers,
  usePresence,
  usePublishPresence,
  useUser,
  useWorkspaceUsers
} from '@/client/features/collab/hooks'
import { AppletPresenceProvider, CollabContext } from '@/client/features/collab/provider'
import { connectPlaygroundParticipants } from './playground-room'

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
const BACKGROUND_CONNECTIONS: Connection[] = [
  {
    connectionId: 'sample-alex',
    userId: 'alex',
    location: { page: PAGE, status: 'active' },
    presence: []
  },
  {
    connectionId: 'sample-pierre',
    userId: 'pierre',
    location: { page: 'views/board', status: 'active' },
    presence: []
  },
  { connectionId: 'sample-andrea', userId: 'andrea', location: null, presence: [] }
]

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

function TargetPresenceDemo() {
  const [selected, setSelected] = useState(false)
  const [editing, setEditing] = useState(false)
  return (
    <Section
      title="Automatic and controlled presence"
      hint="Each automatic target contains two fields. Move between them: the other pane keeps showing presence at that target. Cards publish the boolean you control with their button, even when focus moves away."
      code={
        '<PresenceGroup id="comparison">\n  <PresenceFrame id="focus">\n    <Input />\n    <Input />\n  </PresenceFrame>\n  <PresenceAvatars id="avatars">\n    <>\n      <Input />\n      <Input />\n    </>\n  </PresenceAvatars>\n  <PresenceAvatars id="controlled-avatars" present={editing}>{children}</PresenceAvatars>\n  <PresenceFrame id="selection" present={selected} align="start">\n    <Button onClick={() => setSelected(value => !value)}>Select item</Button>\n  </PresenceFrame>\n</PresenceGroup>'
      }
    >
      <PresenceGroup id="comparison">
        <div className="grid gap-8 py-3 sm:grid-cols-2">
          <PresenceFrame id="focus" className="space-y-2">
            <label className="flex flex-col gap-2 text-sm">
              PresenceFrame
              <Input aria-label="PresenceFrame example" defaultValue="Focus this field" />
            </label>
            <Input
              aria-label="PresenceFrame second field"
              placeholder="Another field, same target"
            />
          </PresenceFrame>
          <PresenceAvatars id="avatars">
            <>
              <label className="flex flex-col gap-2 text-sm">
                PresenceAvatars
                <Input aria-label="PresenceAvatars example" defaultValue="Focus this field" />
              </label>
              <Input
                aria-label="PresenceAvatars second field"
                className="mt-2"
                placeholder="Another field, same target"
              />
            </>
          </PresenceAvatars>
        </div>
        <PresenceFrame id="selection" present={selected} align="start">
          <div className="flex flex-col items-start gap-3 rounded-lg bg-accent p-4">
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
        </PresenceFrame>
        <PresenceAvatars id="controlled-avatars" present={editing}>
          <div className="flex flex-col items-start gap-3 rounded-lg bg-accent p-4">
            <p className="text-sm">Controlled avatars: editing a card</p>
            <Button
              size="sm"
              variant="secondary"
              aria-pressed={editing}
              onClick={() => setEditing(value => !value)}
            >
              {editing ? 'Stop editing' : 'Start editing'}
            </Button>
            <Input
              aria-label="Controlled editing example"
              defaultValue="Focus alone does not publish here"
            />
          </div>
        </PresenceAvatars>
      </PresenceGroup>
    </Section>
  )
}

function EditableList() {
  const [tasks, setTasks] = useState(INITIAL_TASKS)
  return (
    <Section
      title="PresenceAvatars and stable list IDs"
      hint="PresenceGroup gives each task a stable focus ID. Focus a task in the other pane, then reorder or remove rows here. These buttons keep that field focused. Remote avatars and cursors follow the task ID, and disappear if it is removed. Text edits stay local."
      code={
        '<PresenceGroup id="tasks">\n  <div className="space-y-4">\n    {tasks.map(task => (\n      <PresenceAvatars key={task.id} id={task.id}>\n        <Input value={task.title} onChange={...} />\n      </PresenceAvatars>\n    ))}\n  </div>\n</PresenceGroup>'
      }
    >
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="secondary"
          onMouseDown={event => event.preventDefault()}
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
            <PresenceAvatars key={task.id} id={task.id}>
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
                  onMouseDown={event => event.preventDefault()}
                  onClick={() => setTasks(current => current.filter(item => item.id !== task.id))}
                >
                  <IconTrash stroke={1.75} />
                </Button>
              </div>
            </PresenceAvatars>
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
      title="PresenceFrame and nested groups"
      hint="PresenceGroup combines IDs without adding layout. PresenceFrame automatically tracks the controls inside each label. The nearest frame owns focus, so the outer frame stays quiet."
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

type RecordEditorProps = { record: Task; onChange: (record: Task) => void }
function RecordEditor({ record, onChange }: RecordEditorProps) {
  return (
    <PresenceGroup id="todo">
      <PresenceGroup id={record.id}>
        <PresenceFrame id="title">
          <label className="flex flex-col gap-2 text-sm">
            Record title ({record.id})
            <Input
              value={record.title}
              onChange={event => onChange({ ...record, title: event.target.value })}
            />
          </label>
        </PresenceFrame>
      </PresenceGroup>
    </PresenceGroup>
  )
}

function RecordDialogs() {
  const [record, setRecord] = useState(INITIAL_TASKS[0]!)
  const [open, setOpen] = useState(false)
  return (
    <Section
      title="Record scope and dialogs"
      hint="Choose the same record in both panes, then focus its title. Change the record in the receiving pane: the remote frame disappears. Open a dialog to test presence across a portal."
      code={
        '<PresenceGroup id="todo">\n  <PresenceGroup id={record.id}>\n    <PresenceFrame id="title"><Input /></PresenceFrame>\n  </PresenceGroup>\n</PresenceGroup>'
      }
    >
      <div className="flex flex-wrap gap-2">
        {INITIAL_TASKS.map(task => (
          <Button
            key={task.id}
            size="sm"
            variant="secondary"
            aria-pressed={record.id === task.id}
            onMouseDown={event => event.preventDefault()}
            onClick={() => setRecord(task)}
          >
            {task.id}
          </Button>
        ))}
        <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>
          Open dialog
        </Button>
      </div>
      {!open && <RecordEditor record={record} onChange={setRecord} />}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogTitle className="font-medium">Edit {record.id}</DialogTitle>
          <DialogDescription>Watch the matching record in the other pane.</DialogDescription>
          <Cursors id="examples" className="pt-6">
            <RecordEditor record={record} onChange={setRecord} />
          </Cursors>
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

function ConnectedUsersDemo() {
  const me = useMe()
  const pagePeers = usePeers()
  const workspacePeers = usePeers({ scope: 'workspace' })
  const ownIds = me ? [me.id] : []
  const pageIds = [...ownIds, ...pagePeers.map(user => user.id)]
  const workspaceIds = [...ownIds, ...workspacePeers.map(user => user.id)]

  return (
    <Section
      title="Connected users"
      hint="Compose useMe and usePeers with UserAvatarGroup to choose who appears. Workspace scope includes other pages and away users. Offline users are excluded."
      code={
        "const me = useMe()\nconst peers = usePeers() // Or { scope: 'workspace' }\nconst ids = [...(me ? [me.id] : []), ...peers.map(user => user.id)]\n<UserAvatarGroup ids={ids} max={ids.length} />"
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col items-start gap-2">
          <p className="text-sm text-muted-foreground">This page</p>
          <UserAvatarGroup ids={pageIds} max={pageIds.length} />
        </div>
        <div className="flex flex-col items-start gap-2">
          <p className="text-sm text-muted-foreground">Workspace</p>
          <UserAvatarGroup ids={workspaceIds} max={workspaceIds.length} />
        </div>
      </div>
    </Section>
  )
}

function MoodDemo() {
  const [mood, setMood] = useState('Exploring')
  usePublishPresence('mood', mood)
  const presence = usePresence<string>('mood')
  return (
    <Section
      title="Custom presence"
      hint="Change your mood here and watch it update in the other pane. Reading presence returns the other participants’ values."
      code={"usePublishPresence('mood', mood)\nconst presence = usePresence<string>('mood')"}
    >
      <label className="flex flex-col gap-2 text-sm">
        Your mood
        <Input value={mood} onChange={event => setMood(event.target.value)} />
      </label>
      <div className="flex flex-col gap-3">
        <p className="text-sm text-muted-foreground">Received from the other pane</p>
        {presence.map(entry => (
          <div key={entry.connectionId} className="flex flex-col gap-1">
            <User id={entry.userId} size="sm" />
            <p className="text-sm">{entry.value || '(empty)'}</p>
          </div>
        ))}
        {!presence.length && <p className="text-sm">No presence received yet.</p>}
      </div>
    </Section>
  )
}

function HooksInspector() {
  const me = useMe()
  const peers = usePeers({ scope: 'workspace' })
  const workspaceUsers = useWorkspaceUsers()
  const offline = useWorkspaceUsers({ status: 'offline' })
  const user = useUser('david')
  const presence = usePresence<string>('mood')
  const values = [
    ['useMe()', me],
    ["usePeers({ scope: 'workspace' })", peers],
    ['useWorkspaceUsers()', workspaceUsers],
    ["useWorkspaceUsers({ status: 'offline' })", offline],
    ["useUser('david')", user],
    ["usePresence('mood')", presence]
  ] as const
  return (
    <Collapsible className="flex min-w-0 flex-col items-start gap-2">
      <CollapsibleTrigger render={<Button variant="ghost" size="sm" />}>
        <IconChevronDown stroke={1.75} />
        Inspect hook values
      </CollapsibleTrigger>
      <CollapsibleContent className="flex w-full min-w-0 flex-col gap-4">
        {values.map(([label, value]) => (
          <div key={label} className="flex min-w-0 flex-col gap-2">
            <code className="font-mono text-xs">{label}</code>
            <Output value={value} />
          </div>
        ))}
      </CollapsibleContent>
    </Collapsible>
  )
}

type ParticipantPaneProps = { room: FakeEngine; user: UserProfile }
function ParticipantPane({ room, user }: ParticipantPaneProps) {
  return (
    <CollabContext value={room}>
      <AppletPresenceProvider appletId={APPLET_ID}>
        <section
          aria-label={user.id === YOU.id ? 'Your playground' : `${user.name}’s playground`}
          className="flex min-w-0 flex-col gap-4"
        >
          <User id={user.id} description="Interact here; presence appears in the other pane" />
          <div className="h-96 overflow-auto rounded-lg border border-border p-4">
            <Cursors id="examples" className="flex flex-col gap-8">
              <TargetPresenceDemo />
              <EditableList />
              <NestedForm />
              <RecordDialogs />
              <MoodDemo />
              <HooksInspector />
            </Cursors>
          </div>
        </section>
      </AppletPresenceProvider>
    </CollabContext>
  )
}

export function CollabPlayground() {
  const [rooms] = useState(() =>
    [YOU, USERS[1]!].map(self => createFakeEngine({ self, page: PAGE, users: USERS }))
  )
  const room = rooms[0]!
  const [renamed, setRenamed] = useState(false)
  const [david, setDavid] = useState(true)
  useEffect(() => connectPlaygroundParticipants(rooms, BACKGROUND_CONNECTIONS), [rooms])
  useEffect(() => {
    const users = USERS.filter(user => david || user.id !== 'david').map(user =>
      user.id === 'fig' && renamed
        ? { ...user, name: 'Fig Newton', color: 'emerald' as const }
        : user
    )
    rooms.forEach(room => room.setUsers(users))
  }, [rooms, renamed, david])
  return (
    <CollabContext value={room}>
      <AppletPresenceProvider appletId={APPLET_ID}>
        <div className="flex flex-col gap-10 border-t border-border pt-8">
          <header>
            <h2 className="text-base font-medium">Presence playground</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Two participants share presence in memory. You control both panes. Alex is on this
              page, Pierre is on another page, Andrea is away, and David is offline. No server
              connection is used.
            </p>
          </header>
          <Section
            title="User, UserAvatar, and UserAvatarGroup"
            hint="User shows an avatar and name; UserAvatar shows the avatar alone. UserAvatarGroup groups avatars with an overflow count. Profile edits update all three; removed IDs become unknown."
            code={
              '<User id="alex" size="xs" description="Online" />\n<User id="alex" size="sm" />\n<User id="alex" size="default" />\n<UserAvatar id="alex" size="sm" />\n<UserAvatarGroup ids={watcherIds} size="xs" />\n<UserAvatarGroup ids={watcherIds} size="sm" />\n<UserAvatarGroup ids={watcherIds} size="default" />\n<UserAvatarGroup ids={watcherIds} size="lg" />'
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
            </div>
            <div className="flex flex-wrap items-center gap-4">
              <UserAvatarGroup ids={USERS.map(user => user.id)} size="xs" />
              <UserAvatarGroup ids={USERS.map(user => user.id)} size="sm" />
              <UserAvatarGroup ids={USERS.map(user => user.id)} size="default" />
              <UserAvatarGroup ids={USERS.map(user => user.id)} size="lg" />
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
          <ConnectedUsersDemo />
          <Section
            title="Try collaboration"
            hint="Focus, select, or move your pointer in either pane and watch the other. Each pane scrolls independently. Field values stay local: collaboration shares presence, not document content."
            code={
              '<Cursors id="examples">\n  <PresenceFrame id="title"><Input /></PresenceFrame>\n  <PresenceAvatars id="notes"><Input /></PresenceAvatars>\n  <PresenceFrame id="card" present={selected}>{children}</PresenceFrame>\n</Cursors>'
            }
          >
            <div className="grid gap-6 md:grid-cols-2">
              <ParticipantPane room={rooms[0]!} user={YOU} />
              <ParticipantPane room={rooms[1]!} user={USERS[1]!} />
            </div>
          </Section>
        </div>
      </AppletPresenceProvider>
    </CollabContext>
  )
}
