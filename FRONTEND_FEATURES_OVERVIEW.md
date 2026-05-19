# Frontend Features Overview

DevChatDesk frontend is a React 19 + Vite single-page application that provides a shared WhatsApp inbox UI for internal development teams. It supports two roles — **Admin** and **Developer** — with role-gated routing and feature access throughout.

---

## 1. Authentication

### Login
- Email/password login form.
- JWT access token stored in memory (never localStorage) for security.
- Refresh token stored in an HTTP-only cookie; auto-refreshed on expiry via axios interceptor.
- Redirects to role-appropriate dashboard on success.

### Route Guards
- `ProtectedRoute` — blocks unauthenticated users, redirects to `/login`.
- `AdminRoute` — blocks non-admin users from admin pages.
- `PublicRoute` — redirects already-authenticated users away from `/login`.
- `RootRedirect` — sends users to `/dashboard` or `/admin` based on role.

### Logout
- Clears access token from memory, calls logout endpoint to invalidate refresh token cookie.

### Password Change
- Both admins and developers can change their own passwords from within the app.

---

## 2. Chat List Sidebar

The left panel shows all WhatsApp conversations accessible to the logged-in user.

### Chat List Display
- Shows each chat with avatar, contact name, last message preview, timestamp, and unread count badge.
- Phone numbers are never shown; fallback display name is "Contact".
- Timestamps use 12-hour AM/PM format.
- Group chats display group name and last sender.

### Session Switcher
- Dropdown to switch between active WAHA sessions (WhatsApp numbers).
- Filters the chat list to conversations belonging to the selected session.

### Filtering & Search
- Real-time search by contact name or message content.
- Filter dialog with persistent options (stored in localStorage):
  - Show unread only
  - Show assigned to me only
  - Show muted / unmuted chats
  - Show groups / individual chats

### Pagination
- Infinite scroll loads additional chats as user scrolls down.

### Context Menu
- Right-click on a chat to access quick actions:
  - Assign chat to a developer (admin only)
  - Mute / unmute chat
  - Mark as read

### Mark as Read
- Marks a chat's unread count to zero, persisted via API.

### Mute Toggle
- Per-chat mute silences desktop notifications for that conversation.

### Real-Time Updates
- New incoming messages update the chat's last-message preview and unread count live without page reload.
- Chat order re-sorts to surface the most recently active conversation.
- Assignment changes appear instantly (assigned/unassigned events).

---

## 3. Chat Window

The right panel for reading and replying to a selected conversation.

### Message List
- Virtualized with `react-virtuoso` for smooth performance with large histories.
- Infinite scroll pagination (loads older messages upward).
- Messages grouped by date dividers.
- Scroll-to-bottom button appears when user has scrolled up.
- Auto-scrolls to bottom on new incoming messages when already at bottom.

### Message Composer
- Multi-line text input with `Enter` to send, `Shift+Enter` for newline.
- Emoji picker integration for inserting emoji.
- `@mention` support for tagging group participants (autocomplete dropdown).
- Reply-to-message (quoted reply) — click Reply on any message to set context.
- Media attachment upload (images, videos, audio, documents).
- Caption field for media messages.
- Pending message optimistic UI — sent message appears immediately with a "pending" indicator while in transit.

### Message Editing
- Inline edit for sent text messages.
- Edited indicator shown on the message bubble.

### Message Deletion
- Delete own messages; deleted messages show "This message was deleted" placeholder.

### Message Reactions
- Emoji reaction picker on each message.
- Reactions shown as an emoji strip below the message bubble with per-sender attribution.
- Toggle off own reaction by clicking it again.

### Reply / Quoted Message
- Displays quoted original message inside the reply bubble.
- Tapping quoted block scrolls to the original message.

### In-Chat Search
- Search bar to find messages within the current conversation.
- Highlights matches; navigate through results with prev/next arrows.
- Scroll-to-message on result selection.

### Chat Header
- Shows contact name, avatar, and online/last-seen status where available.
- Links to contact profile / group info dialog.

### Profile & Contact Dialog
- View contact details (name, phone number hidden per convention, avatar).
- View group participants list for group chats.

### Forward Dialog
- Forward a received message to another chat in the inbox.

### Assign Dialog
- Admin can reassign the current chat to a different developer from inside the chat window.

### Mute Toggle
- Mute/unmute the current chat directly from the chat window header.

---

## 4. Message Bubbles

Each message is rendered by `MessageBubble` with format-aware display.

### Supported Message Types
| Type | Display |
|---|---|
| TEXT | Plain text, with linkification |
| IMAGE | Thumbnail with tap-to-expand lightbox; caption shown below |
| VIDEO | Video player with caption |
| AUDIO | Audio player (waveform-style) |
| DOCUMENT | File icon, file name, download link; caption if present |
| STICKER | Rendered as image, no background bubble |
| SYSTEM | Centered gray pill (e.g., "You were added") |

### Media Lazy Decryption
- Encrypted media (WAHA NOWEB) is decrypted on-demand when the message scrolls into view.
- Decrypted blobs are cached in memory to avoid re-decryption.

### Message Status (ACK)
- Outbound messages show delivery/read receipt ticks (sent / delivered / read).

### Forwarded Label
- Messages forwarded from another chat display a "Forwarded" label.

### Direction
- Outbound (fromMe) messages align right with distinct background.
- Inbound messages align left.

### Sender Name in Groups
- Group messages show sender's display name above the bubble.

---

## 5. Real-Time Notifications

### Desktop Notifications
- Browser push notifications for new messages when the app is in background or a different chat is open.
- Notification includes sender name and message preview.
- Muted chats do not trigger notifications.
- Own sent messages never trigger notifications.

### Unread Count Badge
- Tab/favicon unread badge increments on new messages.

### Toast Notifications
- In-app toasts (via `sonner`) for events like chat assignment, session status changes, and errors.

---

## 6. Admin Dashboard

Separate `/admin` route with an icon-based sidebar for navigation between panels.

### Session Management Panel
- List all WAHA sessions with status indicators (WORKING, STOPPED, SCAN_QR_CODE, etc.).
- Start / stop / delete sessions.
- Create new sessions.

### QR Code Panel
- Displays live QR code (SVG, format=raw) for scanning with WhatsApp to activate a session.
- Auto-refreshes when session status changes to SCAN_QR_CODE via socket events.

### Chat Assignment Panel
- View all chats across all sessions.
- Assign any chat to a developer.
- Unassign chats.
- See current assignee per chat.

### Developer Management Panel
- Create, edit, enable, and disable developer accounts.
- Role-based: admins can manage all user accounts.

### Feedback Viewing Panel
- View feedback submitted by developers.
- Read/unread status management.

### Global Mute Toggle
- Single toggle to mute all notification sounds globally across the admin account.

### Admin Chat View
- Admins can read any chat regardless of assignment.
- Admins see a read-only indicator for chats not assigned to themselves.

---

## 7. Developer Dashboard

The primary `/dashboard` route for developers.

### Assigned Chats Only
- Chat list shows only chats assigned to the logged-in developer.
- Assignment changes reflected instantly via socket.

### Full Messaging
- All composer, reaction, edit, delete, and media features available.

### Notification Awareness
- Notifications only for assigned chats; background chats in the assigned set still update live.

---

## 8. WAHA Session Status Monitoring

- Frontend polls WAHA session status at intervals.
- Session banner in the chat list sidebar warns when the WhatsApp session is disconnected or requires re-scanning.
- Status transitions (WORKING → STOPPED → SCAN_QR_CODE) update live via socket events.

---

## 9. Feedback

### Submit Feedback
- Developers can submit feedback/bug reports via `FeedbackForm`.

### View Own Feedback
- Developers see their own submission history in `MyFeedbackLog`.

---

## 10. User Preferences

- Per-user preferences stored via API (e.g., notification sounds on/off).
- Preferences persist across sessions.

---

## 11. API & Data Layer

### Axios Client
- Single axios instance with base URL from `VITE_BACKEND_URL`.
- Request interceptor attaches Bearer access token.
- Response interceptor handles 401s: attempts silent token refresh, then retries the original request; logs out if refresh fails.

### TanStack Query
- All server state managed via TanStack Query v5.
- Defaults: `staleTime: 30s`, `retry: 1`, `refetchOnWindowFocus: false`.
- Cache update helpers (`updateChatListQuery`) mutate the in-memory cache directly on socket events to avoid full refetches.

### Infinite Queries
- Chat list and message list use `useInfiniteQuery` for cursor-based pagination.

---

## 12. Infrastructure & Configuration

| Concern | Detail |
|---|---|
| UI Components | Radix UI primitives + class-variance-authority (shadcn-style) |
| Styling | Tailwind CSS v4 via `@tailwindcss/vite` |
| Animations | Framer Motion |
| Virtualization | react-virtuoso for chat and message lists |
| Toasts | sonner |
| Emoji Picker | emoji-picker-react |
| Environment | `VITE_BACKEND_URL`, `VITE_FEEDBACK_ENABLED` |
