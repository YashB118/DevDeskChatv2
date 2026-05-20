import type { ReactElement } from 'react';
import { Switch } from '@/design-system/primitives/Switch';
import { useChatsUIStore } from '../../store/chats.store';

interface ToggleRowProps {
  id: string;
  label: string;
  checked: boolean;
  onChange: (next: boolean) => void;
}

function ToggleRow({ id, label, checked, onChange }: ToggleRowProps): ReactElement {
  return (
    <label
      htmlFor={id}
      className="flex cursor-pointer items-center justify-between gap-3 py-1 text-[length:var(--text-sm)]"
    >
      <span>{label}</span>
      <Switch id={id} checked={checked} onCheckedChange={onChange} />
    </label>
  );
}

export function ChatFilters(): ReactElement {
  const filters = useChatsUIStore((s) => s.filters);
  const setFilters = useChatsUIStore((s) => s.setFilters);

  return (
    <fieldset aria-label="Chat filters" className="flex flex-col gap-1">
      <ToggleRow
        id="filter-unread"
        label="Unread only"
        checked={filters.unreadOnly}
        onChange={(unreadOnly) => {
          setFilters({ unreadOnly });
        }}
      />
      <ToggleRow
        id="filter-mine"
        label="Assigned to me"
        checked={filters.assignedToMe}
        onChange={(assignedToMe) => {
          setFilters({ assignedToMe });
        }}
      />
      <ToggleRow
        id="filter-mute"
        label="Hide muted"
        checked={filters.hideMuted}
        onChange={(hideMuted) => {
          setFilters({ hideMuted });
        }}
      />
    </fieldset>
  );
}
