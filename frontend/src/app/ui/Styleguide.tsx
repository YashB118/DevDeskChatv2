import type { ReactElement, ReactNode } from 'react';
import { useTheme } from '@/design-system/theme';
import { THEME_OPTIONS } from '@/design-system/theme';
import { Button } from '@/design-system/primitives/Button';
import { Input } from '@/design-system/primitives/Input';
import { Textarea } from '@/design-system/primitives/Textarea';
import { Badge } from '@/design-system/primitives/Badge';
import { Spinner } from '@/design-system/primitives/Spinner';
import { Skeleton } from '@/design-system/primitives/Skeleton';
import { Switch } from '@/design-system/primitives/Switch';
import { Checkbox } from '@/design-system/primitives/Checkbox';
import { Avatar, AvatarFallback } from '@/design-system/primitives/Avatar';
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/design-system/primitives/Dialog';
import { Popover, PopoverTrigger, PopoverContent } from '@/design-system/primitives/Popover';
import {
  TooltipProvider,
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from '@/design-system/primitives/Tooltip';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from '@/design-system/primitives/Dropdown';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/design-system/primitives/Tabs';
import { useToast } from '@/design-system/primitives/Toast';
import { EmptyState } from '@/design-system/compounds/EmptyState';
import { SectionHeader } from '@/design-system/compounds/SectionHeader';
import { Tag } from '@/design-system/compounds/Tag';
import { IconButton } from '@/design-system/compounds/IconButton';
import { MessageSquare, Plus, Search, Trash2 } from '@/design-system/icons';

function Block({ title, children }: { title: string; children: ReactNode }): ReactElement {
  return (
    <section className="rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] bg-[var(--color-bg-canvas)] p-4">
      <h3 className="mb-3 text-[length:var(--text-sm)] font-semibold text-[var(--color-fg-secondary)]">
        {title}
      </h3>
      <div className="flex flex-wrap items-center gap-3">{children}</div>
    </section>
  );
}

export function Styleguide(): ReactElement {
  const { preference, resolved, setPreference } = useTheme();
  const { push } = useToast();

  return (
    <TooltipProvider>
      <div className="min-h-screen bg-[var(--color-bg-sunken)] p-6 text-[var(--color-fg-primary)]">
        <header className="mb-6 flex items-center justify-between">
          <SectionHeader
            title="Design system styleguide"
            description={`Theme preference: ${preference} (resolved: ${resolved})`}
          />
          <div className="flex items-center gap-2">
            {THEME_OPTIONS.map((opt) => (
              <Button
                key={opt}
                variant={preference === opt ? 'primary' : 'secondary'}
                size="sm"
                onClick={() => { setPreference(opt); }}
              >
                {opt}
              </Button>
            ))}
          </div>
        </header>

        <div className="grid gap-4 lg:grid-cols-2">
          <Block title="Buttons">
            <Button>Primary</Button>
            <Button variant="secondary">Secondary</Button>
            <Button variant="ghost">Ghost</Button>
            <Button variant="danger">Danger</Button>
            <Button variant="link">Link</Button>
            <Button isLoading>Loading</Button>
            <Button leadingIcon={<Plus className="h-4 w-4" aria-hidden />}>With icon</Button>
            <Button disabled>Disabled</Button>
          </Block>

          <Block title="Inputs">
            <Input placeholder="Default input" className="w-48" />
            <Input placeholder="Invalid" aria-invalid className="w-32" />
            <Textarea placeholder="Textarea" className="w-full" />
          </Block>

          <Block title="Badges / Tags">
            <Badge>Neutral</Badge>
            <Badge tone="accent">Accent</Badge>
            <Badge tone="success">Success</Badge>
            <Badge tone="warning">Warning</Badge>
            <Badge tone="danger">Danger</Badge>
            <Tag>Plain tag</Tag>
            <Tag onRemove={() => undefined}>Removable</Tag>
          </Block>

          <Block title="Loading">
            <Spinner size="sm" />
            <Spinner />
            <Spinner size="lg" />
            <div className="flex w-full flex-col gap-2">
              <Skeleton className="h-3 w-3/4" />
              <Skeleton className="h-3 w-1/2" />
            </div>
          </Block>

          <Block title="Switch / Checkbox">
            <Switch defaultChecked aria-label="Toggle on" />
            <Switch aria-label="Toggle off" />
            <Checkbox defaultChecked aria-label="Checked" />
            <Checkbox aria-label="Unchecked" />
          </Block>

          <Block title="Avatar">
            <Avatar size="sm"><AvatarFallback>AB</AvatarFallback></Avatar>
            <Avatar><AvatarFallback>YB</AvatarFallback></Avatar>
            <Avatar size="lg"><AvatarFallback>DK</AvatarFallback></Avatar>
          </Block>

          <Block title="Overlay primitives">
            <Dialog>
              <DialogTrigger asChild><Button>Open dialog</Button></DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Hello world</DialogTitle>
                  <DialogDescription>Radix dialog wrapped with tokens.</DialogDescription>
                </DialogHeader>
                <DialogFooter>
                  <Button>Confirm</Button>
                  <Button variant="ghost">Cancel</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            <Popover>
              <PopoverTrigger asChild><Button variant="secondary">Popover</Button></PopoverTrigger>
              <PopoverContent>Popover content with tokens.</PopoverContent>
            </Popover>

            <Tooltip>
              <TooltipTrigger asChild><Button variant="ghost">Hover me</Button></TooltipTrigger>
              <TooltipContent>Tooltip body</TooltipContent>
            </Tooltip>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <IconButton label="Actions" icon={<MessageSquare className="h-4 w-4" />} />
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuLabel>Actions</DropdownMenuLabel>
                <DropdownMenuItem>Mark read</DropdownMenuItem>
                <DropdownMenuItem>Mute</DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem destructive>Delete</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </Block>

          <Block title="Tabs">
            <Tabs defaultValue="a" className="w-full">
              <TabsList>
                <TabsTrigger value="a">First</TabsTrigger>
                <TabsTrigger value="b">Second</TabsTrigger>
              </TabsList>
              <TabsContent value="a">Tab one body.</TabsContent>
              <TabsContent value="b">Tab two body.</TabsContent>
            </Tabs>
          </Block>

          <Block title="Toasts">
            <Button onClick={() => push({ title: 'Saved', description: 'Your changes are stored.', tone: 'success' })}>
              Success toast
            </Button>
            <Button variant="danger" onClick={() => push({ title: 'Error', description: 'Something broke.', tone: 'danger' })}>
              Danger toast
            </Button>
          </Block>

          <Block title="Empty state">
            <EmptyState
              icon={<Search />}
              title="No results"
              description="Try a different filter or search term."
              action={<Button leadingIcon={<Plus className="h-4 w-4" aria-hidden />}>New chat</Button>}
            />
          </Block>

          <Block title="Icon button">
            <IconButton label="Search" icon={<Search className="h-4 w-4" />} />
            <IconButton label="Delete" icon={<Trash2 className="h-4 w-4" />} variant="danger" />
          </Block>
        </div>
      </div>
    </TooltipProvider>
  );
}
