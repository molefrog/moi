import { useState, type ComponentType } from 'react'

import {
  IconBold,
  IconFile,
  IconInfoCircle,
  IconItalic,
  IconSearch,
  IconUnderline,
  IconX
} from '@tabler/icons-react'
import { Bar, BarChart, CartesianGrid, XAxis } from 'recharts'

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger
} from '@/ui-components/accordion'
import { Alert, AlertDescription, AlertTitle } from '@/ui-components/alert'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger
} from '@/ui-components/alert-dialog'
import {
  Attachment,
  AttachmentAction,
  AttachmentActions,
  AttachmentContent,
  AttachmentDescription,
  AttachmentMedia,
  AttachmentTitle
} from '@/ui-components/attachment'
import { Avatar, AvatarBadge, AvatarFallback, AvatarGroup } from '@/ui-components/avatar'
import { Badge } from '@/ui-components/badge'
import { Bubble, BubbleContent, BubbleGroup, BubbleReactions } from '@/ui-components/bubble'
import { Button } from '@/ui-components/button'
import { ButtonGroup, ButtonGroupText } from '@/ui-components/button-group'
import { Calendar } from '@/ui-components/calendar'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle
} from '@/ui-components/card'
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious
} from '@/ui-components/carousel'
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig
} from '@/ui-components/chart'
import { Checkbox } from '@/ui-components/checkbox'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/ui-components/collapsible'
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList
} from '@/ui-components/combobox'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuGroup,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuTrigger
} from '@/ui-components/context-menu'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from '@/ui-components/dialog'
import {
  Drawer,
  DrawerBody,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger
} from '@/ui-components/drawer'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger
} from '@/ui-components/dropdown-menu'
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/ui-components/field'
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/ui-components/hover-card'
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupText
} from '@/ui-components/input-group'
import { Input } from '@/ui-components/input'
import { Label } from '@/ui-components/label'
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious
} from '@/ui-components/pagination'
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger
} from '@/ui-components/popover'
import { Progress, ProgressLabel, ProgressValue } from '@/ui-components/progress'
import { RadioGroup, RadioGroupItem } from '@/ui-components/radio-group'
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/ui-components/resizable'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue
} from '@/ui-components/select'
import { Separator } from '@/ui-components/separator'
import { Skeleton } from '@/ui-components/skeleton'
import { Slider } from '@/ui-components/slider'
import { Spinner } from '@/ui-components/spinner'
import { Switch } from '@/ui-components/switch'
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/ui-components/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/ui-components/tabs'
import { Textarea } from '@/ui-components/textarea'
import { Toggle } from '@/ui-components/toggle'
import { ToggleGroup, ToggleGroupItem } from '@/ui-components/toggle-group'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/ui-components/tooltip'

const comboboxItems = ['React', 'Vue', 'Svelte', 'Solid']
const selectItems = [
  { label: 'Apple', value: 'apple' },
  { label: 'Banana', value: 'banana' },
  { label: 'Pear', value: 'pear' }
]
const chartData = [
  { month: 'Jan', orders: 24 },
  { month: 'Feb', orders: 38 },
  { month: 'Mar', orders: 31 },
  { month: 'Apr', orders: 46 }
]
const chartConfig = {
  orders: { label: 'Orders', color: 'var(--primary)' }
} satisfies ChartConfig

function AccordionPreview() {
  return (
    <Accordion defaultValue={['shipping']} className="w-full max-w-md">
      <AccordionItem value="shipping">
        <AccordionTrigger>When will my order arrive?</AccordionTrigger>
        <AccordionContent>Standard delivery takes three to five business days.</AccordionContent>
      </AccordionItem>
      <AccordionItem value="returns">
        <AccordionTrigger>Can I return it?</AccordionTrigger>
        <AccordionContent>Unused items can be returned within 30 days.</AccordionContent>
      </AccordionItem>
    </Accordion>
  )
}

function AlertPreview() {
  return (
    <Alert className="w-full max-w-md">
      <IconInfoCircle stroke={1.75} />
      <AlertTitle>Order updated</AlertTitle>
      <AlertDescription>The delivery time changed to tomorrow at 10:00.</AlertDescription>
    </Alert>
  )
}

function AlertDialogPreview() {
  return (
    <AlertDialog>
      <AlertDialogTrigger render={<Button variant="outline" />}>Delete order</AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete this order?</AlertDialogTitle>
          <AlertDialogDescription>This action cannot be undone.</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction variant="destructive">Delete</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

function AttachmentPreview() {
  return (
    <Attachment className="w-full max-w-sm">
      <AttachmentMedia>
        <IconFile stroke={1.75} />
      </AttachmentMedia>
      <AttachmentContent>
        <AttachmentTitle>order-summary.pdf</AttachmentTitle>
        <AttachmentDescription>PDF · 240 KB</AttachmentDescription>
      </AttachmentContent>
      <AttachmentActions>
        <AttachmentAction aria-label="Remove attachment">
          <IconX stroke={1.75} />
        </AttachmentAction>
      </AttachmentActions>
    </Attachment>
  )
}

function AvatarPreview() {
  return (
    <AvatarGroup>
      <Avatar>
        <AvatarFallback>MC</AvatarFallback>
        <AvatarBadge />
      </Avatar>
      <Avatar>
        <AvatarFallback>JW</AvatarFallback>
      </Avatar>
      <Avatar>
        <AvatarFallback>LH</AvatarFallback>
      </Avatar>
    </AvatarGroup>
  )
}

function BadgePreview() {
  return (
    <div className="flex flex-wrap justify-center gap-2">
      <Badge>Ready</Badge>
      <Badge variant="secondary">Picking</Badge>
      <Badge variant="outline">Draft</Badge>
      <Badge variant="destructive">Blocked</Badge>
    </div>
  )
}

function BubblePreview() {
  return (
    <div className="flex w-full max-w-sm flex-col gap-5">
      <BubbleGroup>
        <Bubble variant="muted">
          <BubbleContent>Can you check order #1048?</BubbleContent>
        </Bubble>
        <Bubble variant="muted">
          <BubbleContent>It is packed and ready to ship.</BubbleContent>
          <BubbleReactions>👍 2</BubbleReactions>
        </Bubble>
      </BubbleGroup>
      <Bubble align="end">
        <BubbleContent>Perfect, thanks.</BubbleContent>
      </Bubble>
    </div>
  )
}

function ButtonPreview() {
  return (
    <div className="flex flex-wrap justify-center gap-2">
      <Button>Default</Button>
      <Button variant="secondary">Secondary</Button>
      <Button variant="outline">Outline</Button>
      <Button variant="ghost">Ghost</Button>
      <Button variant="destructive">Delete</Button>
    </div>
  )
}

function ButtonGroupPreview() {
  return (
    <ButtonGroup>
      <ButtonGroupText>Status</ButtonGroupText>
      <Button variant="outline">Picking</Button>
      <Button variant="outline">Packed</Button>
    </ButtonGroup>
  )
}

function CalendarPreview() {
  const [date, setDate] = useState<Date | undefined>(new Date())
  return <Calendar mode="single" selected={date} onSelect={setDate} />
}

function CardPreview() {
  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle>Order #1048</CardTitle>
        <CardDescription>Desk lamp / Moss</CardDescription>
      </CardHeader>
      <CardContent className="text-sm">Two units, due today at 16:30.</CardContent>
      <CardFooter>
        <Button>Open order</Button>
      </CardFooter>
    </Card>
  )
}

function CarouselPreview() {
  return (
    <Carousel className="w-full max-w-xs">
      <CarouselContent>
        {[1, 2, 3].map(item => (
          <CarouselItem key={item}>
            <div className="p-1">
              <Card>
                <CardContent className="flex aspect-video items-center justify-center text-2xl">
                  {item}
                </CardContent>
              </Card>
            </div>
          </CarouselItem>
        ))}
      </CarouselContent>
      <CarouselPrevious />
      <CarouselNext />
    </Carousel>
  )
}

function ChartPreview() {
  return (
    <ChartContainer config={chartConfig} className="h-64 w-full max-w-lg">
      <BarChart accessibilityLayer data={chartData}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="month" tickLine={false} axisLine={false} />
        <ChartTooltip content={<ChartTooltipContent hideLabel />} />
        <Bar dataKey="orders" fill="var(--color-orders)" radius={4} />
      </BarChart>
    </ChartContainer>
  )
}

function CheckboxPreview() {
  return (
    <FieldGroup className="w-full max-w-sm">
      <Field orientation="horizontal">
        <Checkbox id="preview-checkbox" defaultChecked />
        <FieldLabel htmlFor="preview-checkbox">Send shipping updates</FieldLabel>
      </Field>
    </FieldGroup>
  )
}

function CollapsiblePreview() {
  const [open, setOpen] = useState(false)
  return (
    <Collapsible open={open} onOpenChange={setOpen} className="w-full max-w-sm">
      <div className="flex items-center justify-between gap-4">
        <p className="text-sm font-medium">Order details</p>
        <CollapsibleTrigger render={<Button variant="outline" size="sm" />}>
          {open ? 'Hide' : 'Show'}
        </CollapsibleTrigger>
      </div>
      <CollapsibleContent className="pt-3 text-sm text-muted-foreground">
        Two desk lamps shipping to Berlin.
      </CollapsibleContent>
    </Collapsible>
  )
}

function ComboboxPreview() {
  return (
    <Combobox items={comboboxItems}>
      <ComboboxInput placeholder="Choose a framework" />
      <ComboboxContent>
        <ComboboxEmpty>No matches.</ComboboxEmpty>
        <ComboboxList>
          {item => (
            <ComboboxItem key={item} value={item}>
              {item}
            </ComboboxItem>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  )
}

function ContextMenuPreview() {
  return (
    <ContextMenu>
      <ContextMenuTrigger className="flex h-40 w-full max-w-sm items-center justify-center rounded-xl bg-muted text-sm">
        Right-click here
      </ContextMenuTrigger>
      <ContextMenuContent className="w-48">
        <ContextMenuGroup>
          <ContextMenuLabel>Order</ContextMenuLabel>
          <ContextMenuSeparator />
          <ContextMenuItem>
            Open <ContextMenuShortcut>↵</ContextMenuShortcut>
          </ContextMenuItem>
          <ContextMenuItem>Duplicate</ContextMenuItem>
          <ContextMenuItem variant="destructive">Delete</ContextMenuItem>
        </ContextMenuGroup>
      </ContextMenuContent>
    </ContextMenu>
  )
}

function DialogPreview() {
  return (
    <Dialog>
      <DialogTrigger render={<Button variant="outline" />}>Open dialog</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit order</DialogTitle>
          <DialogDescription>Change the customer-facing order name.</DialogDescription>
        </DialogHeader>
        <Input defaultValue="Desk lamp / Moss" aria-label="Order name" />
        <DialogFooter showCloseButton>
          <Button>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function DrawerPreview() {
  return (
    <Drawer>
      <DrawerTrigger render={<Button variant="outline" />}>Open drawer</DrawerTrigger>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>Drawer</DrawerTitle>
          <DrawerDescription>The component stays inside this view frame.</DrawerDescription>
        </DrawerHeader>
        <DrawerBody>
          <dl className="grid grid-cols-[6rem_1fr] gap-x-4 gap-y-3 text-sm">
            <dt className="text-muted-foreground">Customer</dt>
            <dd>Mira Chen</dd>
            <dt className="text-muted-foreground">Status</dt>
            <dd>Picking</dd>
            <dt className="text-muted-foreground">Due</dt>
            <dd>Today, 16:30</dd>
          </dl>
        </DrawerBody>
        <DrawerFooter>
          <Button>Mark packed</Button>
          <DrawerClose render={<Button variant="outline" />}>Close</DrawerClose>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  )
}

function DropdownMenuPreview() {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="outline" />}>Open menu</DropdownMenuTrigger>
      <DropdownMenuContent className="w-48">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Order actions</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem>
            Open <DropdownMenuShortcut>↵</DropdownMenuShortcut>
          </DropdownMenuItem>
          <DropdownMenuItem>Duplicate</DropdownMenuItem>
          <DropdownMenuItem variant="destructive">Delete</DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function FieldPreview() {
  return (
    <FieldGroup className="w-full max-w-sm">
      <Field>
        <FieldLabel htmlFor="preview-email">Email</FieldLabel>
        <Input id="preview-email" type="email" placeholder="you@example.com" />
        <FieldDescription>We will send order updates here.</FieldDescription>
      </Field>
    </FieldGroup>
  )
}

function HoverCardPreview() {
  return (
    <HoverCard>
      <HoverCardTrigger render={<Button variant="outline" />}>Hover for details</HoverCardTrigger>
      <HoverCardContent>
        <p className="font-medium">Mira Chen</p>
        <p className="mt-1 text-muted-foreground">Five orders since March.</p>
      </HoverCardContent>
    </HoverCard>
  )
}

function InputPreview() {
  return <Input className="w-full max-w-sm" placeholder="Filter orders…" />
}

function InputGroupPreview() {
  return (
    <InputGroup className="w-full max-w-sm">
      <InputGroupAddon>
        <IconSearch stroke={1.75} />
      </InputGroupAddon>
      <InputGroupInput placeholder="Search orders…" />
      <InputGroupAddon align="inline-end">
        <InputGroupText>⌘K</InputGroupText>
      </InputGroupAddon>
    </InputGroup>
  )
}

function LabelPreview() {
  return (
    <div className="flex items-center gap-2">
      <Checkbox id="preview-label" />
      <Label htmlFor="preview-label">Accept terms and conditions</Label>
    </div>
  )
}

function PaginationPreview() {
  return (
    <Pagination>
      <PaginationContent>
        <PaginationItem>
          <PaginationPrevious href="#preview" />
        </PaginationItem>
        <PaginationItem>
          <PaginationLink href="#preview">1</PaginationLink>
        </PaginationItem>
        <PaginationItem>
          <PaginationLink href="#preview" isActive>
            2
          </PaginationLink>
        </PaginationItem>
        <PaginationItem>
          <PaginationEllipsis />
        </PaginationItem>
        <PaginationItem>
          <PaginationNext href="#preview" />
        </PaginationItem>
      </PaginationContent>
    </Pagination>
  )
}

function PopoverPreview() {
  return (
    <Popover>
      <PopoverTrigger render={<Button variant="outline" />}>Open popover</PopoverTrigger>
      <PopoverContent className="w-72">
        <PopoverHeader>
          <PopoverTitle>Delivery details</PopoverTitle>
          <PopoverDescription>Choose where the order should be left.</PopoverDescription>
        </PopoverHeader>
        <Input placeholder="Delivery note" />
      </PopoverContent>
    </Popover>
  )
}

function ProgressPreview() {
  return (
    <Progress value={68} className="w-full max-w-sm">
      <ProgressLabel>Upload</ProgressLabel>
      <ProgressValue />
    </Progress>
  )
}

function RadioGroupPreview() {
  return (
    <RadioGroup defaultValue="standard" className="w-fit">
      <div className="flex items-center gap-3">
        <RadioGroupItem value="standard" id="preview-standard" />
        <Label htmlFor="preview-standard">Standard delivery</Label>
      </div>
      <div className="flex items-center gap-3">
        <RadioGroupItem value="express" id="preview-express" />
        <Label htmlFor="preview-express">Express delivery</Label>
      </div>
    </RadioGroup>
  )
}

function ResizablePreview() {
  return (
    <ResizablePanelGroup
      orientation="horizontal"
      className="h-56 w-full max-w-lg rounded-xl bg-muted"
    >
      <ResizablePanel defaultSize="50%">
        <div className="flex h-full items-center justify-center text-sm">Orders</div>
      </ResizablePanel>
      <ResizableHandle withHandle />
      <ResizablePanel defaultSize="50%">
        <div className="flex h-full items-center justify-center text-sm">Details</div>
      </ResizablePanel>
    </ResizablePanelGroup>
  )
}

function SelectPreview() {
  return (
    <Select items={selectItems} defaultValue="apple">
      <SelectTrigger className="w-48">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          <SelectLabel>Fruit</SelectLabel>
          {selectItems.map(item => (
            <SelectItem key={item.value} value={item.value}>
              {item.label}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  )
}

function SeparatorPreview() {
  return (
    <div className="flex w-full max-w-sm flex-col gap-4 text-sm">
      <div>
        <p className="font-medium">Order #1048</p>
        <p className="text-muted-foreground">Desk lamp / Moss</p>
      </div>
      <Separator />
      <p>Delivery today at 16:30.</p>
    </div>
  )
}

function SkeletonPreview() {
  return (
    <div className="flex w-full max-w-sm items-center gap-4">
      <Skeleton className="size-12 rounded-full" />
      <div className="flex flex-1 flex-col gap-2">
        <Skeleton className="h-4 w-2/3" />
        <Skeleton className="h-4 w-full" />
      </div>
    </div>
  )
}

function SliderPreview() {
  return <Slider defaultValue={[65]} className="w-full max-w-sm" />
}

function SpinnerPreview() {
  return (
    <div className="flex items-center gap-2 text-sm text-muted-foreground">
      <Spinner /> Processing order…
    </div>
  )
}

function SwitchPreview() {
  return (
    <div className="flex items-center gap-3">
      <Switch id="preview-switch" defaultChecked />
      <Label htmlFor="preview-switch">Send notifications</Label>
    </div>
  )
}

function TablePreview() {
  return (
    <Table className="w-full max-w-2xl">
      <TableCaption>Recent orders</TableCaption>
      <TableHeader>
        <TableRow>
          <TableHead>Order</TableHead>
          <TableHead>Status</TableHead>
          <TableHead className="text-right">Total</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        <TableRow>
          <TableCell>#1048</TableCell>
          <TableCell>Picking</TableCell>
          <TableCell className="text-right">€184.00</TableCell>
        </TableRow>
        <TableRow>
          <TableCell>#1047</TableCell>
          <TableCell>Packed</TableCell>
          <TableCell className="text-right">€320.00</TableCell>
        </TableRow>
      </TableBody>
    </Table>
  )
}

function TabsPreview() {
  return (
    <Tabs defaultValue="overview" className="w-full max-w-md">
      <TabsList>
        <TabsTrigger value="overview">Overview</TabsTrigger>
        <TabsTrigger value="activity">Activity</TabsTrigger>
      </TabsList>
      <TabsContent value="overview" className="pt-3">
        Five orders are ready to ship.
      </TabsContent>
      <TabsContent value="activity" className="pt-3">
        Two orders changed in the last hour.
      </TabsContent>
    </Tabs>
  )
}

function TextareaPreview() {
  return <Textarea className="w-full max-w-sm" placeholder="Add a delivery note…" />
}

function TogglePreview() {
  return (
    <Toggle variant="outline" aria-label="Toggle bold">
      <IconBold stroke={1.75} /> Bold
    </Toggle>
  )
}

function ToggleGroupPreview() {
  return (
    <ToggleGroup variant="outline" multiple>
      <ToggleGroupItem value="bold" aria-label="Toggle bold">
        <IconBold stroke={1.75} />
      </ToggleGroupItem>
      <ToggleGroupItem value="italic" aria-label="Toggle italic">
        <IconItalic stroke={1.75} />
      </ToggleGroupItem>
      <ToggleGroupItem value="underline" aria-label="Toggle underline">
        <IconUnderline stroke={1.75} />
      </ToggleGroupItem>
    </ToggleGroup>
  )
}

function TooltipPreview() {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger render={<Button variant="outline" />}>Hover</TooltipTrigger>
        <TooltipContent>Open order details</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

export const UI_COMPONENT_PREVIEWS = {
  accordion: AccordionPreview,
  alert: AlertPreview,
  'alert-dialog': AlertDialogPreview,
  attachment: AttachmentPreview,
  avatar: AvatarPreview,
  badge: BadgePreview,
  bubble: BubblePreview,
  button: ButtonPreview,
  'button-group': ButtonGroupPreview,
  calendar: CalendarPreview,
  card: CardPreview,
  carousel: CarouselPreview,
  chart: ChartPreview,
  checkbox: CheckboxPreview,
  collapsible: CollapsiblePreview,
  combobox: ComboboxPreview,
  'context-menu': ContextMenuPreview,
  dialog: DialogPreview,
  drawer: DrawerPreview,
  'dropdown-menu': DropdownMenuPreview,
  field: FieldPreview,
  'hover-card': HoverCardPreview,
  input: InputPreview,
  'input-group': InputGroupPreview,
  label: LabelPreview,
  pagination: PaginationPreview,
  popover: PopoverPreview,
  progress: ProgressPreview,
  'radio-group': RadioGroupPreview,
  resizable: ResizablePreview,
  select: SelectPreview,
  separator: SeparatorPreview,
  skeleton: SkeletonPreview,
  slider: SliderPreview,
  spinner: SpinnerPreview,
  switch: SwitchPreview,
  table: TablePreview,
  tabs: TabsPreview,
  textarea: TextareaPreview,
  toggle: TogglePreview,
  'toggle-group': ToggleGroupPreview,
  tooltip: TooltipPreview
} satisfies Record<string, ComponentType>
