# Module: Design System

> Visual foundation for the app. Owns tokens (CSS variables), themes (light / dark / high-contrast), the Tailwind v4 binding, motion primitives, the React `ThemeProvider`, the icon set, and every Radix-backed primitive + compound the rest of the codebase uses.

**Status:** Phase 2 — complete. Token-contrast tests gate WCAG AA in CI. Chromatic visual regression and a global per-story axe sweep are deferred to Phase 12. SHA-pinning for the theme bootstrap lands in Phase 11.

---

## Purpose

Every visual surface in the app — buttons, dialogs, toasts, list rows, dashboards — composes from this module. Feature code never writes literal colors, radii, durations, or focus styles; it consumes tokens (via Tailwind classes or CSS variables) and primitives. The module exists so that:

- Theme switches are instant (CSS variable swap; no React re-render).
- Accessibility (focus rings, keyboard handling, ARIA) is correct by default.
- Reduced-motion users get a usable experience without each feature reinventing the fallback.
- A contrast regression in any theme fails CI, not a user's eyes.

## Folder shape

```
frontend/src/design-system/
├── tokens/
│   ├── colors.ts            # bg / fg / border / accent / status / focus references
│   ├── typography.ts        # fontFamily, fontSize, lineHeight
│   ├── spacing.ts           # 0–8 scale
│   ├── radius.ts            # xs / sm / md / lg / xl / full
│   ├── shadow.ts            # 1 / 2 / 3
│   ├── motion.ts            # duration + easing tokens, easingTuple for Framer
│   ├── index.ts             # barrel
│   ├── contrast.test.ts     # WCAG AA assertions, 21 cases across 3 themes
│   └── themes/
│       ├── light.css
│       ├── dark.css
│       └── highContrast.css
├── theme/
│   ├── ThemeProvider.tsx    # <ThemeProvider>, useTheme(), localStorage persistence
│   ├── ThemeProvider.test.tsx
│   ├── types.ts             # ThemePreference, ResolvedTheme, THEME_OPTIONS, THEME_STORAGE_KEY
│   └── index.ts
├── motion/
│   ├── variants.ts          # fadeIn, slideUp, slideDown, popIn, staggerList, instant
│   ├── transitions.ts       # fast / base / slow / emphasized / entry / exit / spring
│   ├── usePrefersReducedMotion.ts
│   ├── usePrefersReducedMotion.test.tsx
│   └── index.ts
├── primitives/
│   ├── Button/              # Button.tsx + .stories + .test + index
│   ├── Input/
│   ├── Textarea/
│   ├── Dialog/
│   ├── Popover/
│   ├── Tooltip/
│   ├── Dropdown/
│   ├── Switch/
│   ├── Checkbox/
│   ├── Tabs/
│   ├── Toast/               # ToastProvider + useToast() context wrapper
│   ├── Avatar/
│   ├── Badge/
│   ├── Spinner/
│   ├── Skeleton/
│   └── index.ts             # barrel
├── compounds/
│   ├── EmptyState/
│   ├── SectionHeader/
│   ├── Tag/
│   ├── IconButton/
│   └── index.ts
├── icons/index.ts            # curated lucide-react re-exports
└── index.ts                  # top-level barrel
```

Adjacent files outside `design-system/` that belong to the system:

| Path | Role |
|---|---|
| `frontend/src/styles/tailwind.css` | Imports `tailwindcss` + theme CSS files, declares the `@theme` block that exposes tokens to Tailwind utilities. |
| `frontend/src/styles/reset.css` | Token-driven reset (body bg/fg, focus-visible ring, link color). |
| `frontend/src/styles/globals.css` | Imports `tailwind.css` then `reset.css`. Loaded once from `src/main.tsx`. |
| `frontend/public/theme-bootstrap.js` | Synchronous `<script>` in `<head>` that reads stored preference and sets `data-theme` + `data-theme-preference` on `<html>` before React mounts. No FOUC. |
| `frontend/src/shared/utils/cn.ts` | `cn(...inputs)` — clsx + tailwind-merge. Every primitive uses it. |
| `frontend/src/app/ui/Styleguide.tsx` | Dev-only `/__styleguide` screen that renders every primitive + compound for visual smoke. |
| `frontend/.storybook/` | Storybook 8 config (themed toolbar + addon-a11y). One story per primitive and compound. |

## Tokens

Source of truth lives in the three CSS files under `tokens/themes/`. Each file scopes its variables to `[data-theme='<name>']`, so swapping the attribute on `<html>` swaps every token atomically. Categories:

- **Colors** — `--color-bg-{canvas,elevated,sunken,overlay}`, `--color-fg-{primary,secondary,muted,on-accent}`, `--color-border-{subtle,default,strong}`, `--color-accent{,-hover,-fg}`, `--color-{success,warning,danger}{,-fg}`, `--color-focus-ring`, `--color-overlay-scrim`.
- **Radius** — `--radius-{xs,sm,md,lg,xl,full}`.
- **Shadow** — `--shadow-{1,2,3}` (high-contrast theme replaces these with outline rings).
- **Spacing** — `--space-{0..8}` (light theme defines; dark / high-contrast inherit from `:root` if needed). The 0–8 scale is the canonical spacing scale; ad-hoc pixel values are forbidden.
- **Typography** — `--font-{sans,mono}`, `--text-{xs,sm,md,lg,xl,2xl}`, `--leading-{tight,normal,loose}`.
- **Motion** — `--motion-{fast,base,slow}` (durations), `--easing-{standard,emphasized,entry,exit}` (cubic-bezier strings).

The TypeScript modules in `tokens/*.ts` export the same names as `var(--…)` strings, so code that needs a token at runtime (e.g. inline `style` or Framer's variant objects) reads the same source.

`tokens/contrast.test.ts` parses each theme file, computes WCAG AA contrast for seven fg/bg pairs, and fails CI on any ratio under 4.5:1 (or 3:1 for `fg-muted`). 21 assertions in total (7 pairs × 3 themes).

## Tailwind v4 binding

`src/styles/tailwind.css`:

```css
@import 'tailwindcss';
@import '../design-system/tokens/themes/light.css';
@import '../design-system/tokens/themes/dark.css';
@import '../design-system/tokens/themes/highContrast.css';

@theme {
  --color-bg-canvas: var(--color-bg-canvas);
  /* … all tokens re-exposed to Tailwind … */
}
```

Tailwind v4 reads the `@theme` block to populate utilities. The double-binding (`--color-bg-canvas: var(--color-bg-canvas)`) is intentional: the LHS is the Tailwind-facing name, the RHS resolves at runtime to whatever the active theme set. The result: `bg-bg-canvas` in JSX always resolves to the live theme's canvas color.

`tailwind.css` also declares two named keyframes (`fadeIn`, `slideUp`) used by Radix `data-[state=open]` selectors, and a global `prefers-reduced-motion: reduce` block that collapses every animation / transition to ~0ms.

## Theme provider

`design-system/theme/ThemeProvider.tsx` exposes:

```ts
type ThemePreference = 'light' | 'dark' | 'high-contrast' | 'system';
type ResolvedTheme = 'light' | 'dark' | 'high-contrast';

const { preference, resolved, setPreference } = useTheme();
```

Behavior:
- Initial preference is read from the `data-theme-preference` attribute that `public/theme-bootstrap.js` set in `<head>` (so the first React render agrees with the pre-paint state — no flicker).
- `setPreference(next)` persists to `localStorage` under key `devdesk:theme`, recomputes `resolved`, and applies both attributes to `document.documentElement`.
- When the preference is `system`, the provider listens to `(prefers-color-scheme: dark)` and updates `resolved` automatically.
- `useTheme()` throws if called outside the provider — there's exactly one `<ThemeProvider>` in the tree (mounted by `AppProviders`).

`THEME_OPTIONS` and `THEME_STORAGE_KEY` are re-exported for settings UIs (Phase 10) and for the bootstrap script (kept in sync manually).

## Motion

`design-system/motion/`:

- **`variants.ts`** — Framer Motion variants: `fadeIn`, `slideUp`, `slideDown`, `popIn`, `staggerList`. `instant` is the collapse target for reduced motion; `reducedMotionVariants(v, reducedMotion)` returns `instant` when reduced motion is active.
- **`transitions.ts`** — duration + easing presets typed for Framer (`fast`, `base`, `slow`, `emphasized`, `entry`, `exit`, `spring`).
- **`usePrefersReducedMotion.ts`** — subscribes to `(prefers-reduced-motion: reduce)`. Returns `false` if `matchMedia` is unavailable (older browsers, jsdom in some test setups).

Components must use `usePrefersReducedMotion()` to gate Framer variants. Pure CSS transitions are caught by the global `prefers-reduced-motion` block in `tailwind.css`.

## Primitives

Every primitive sits in its own folder `primitives/<Name>/` with three files: the component, a Storybook `.stories.tsx`, and an `index.ts`. Most also ship a co-located `.test.tsx`.

| Primitive | Backed by | Key API surface |
|---|---|---|
| `Button` | native `<button>` + `@radix-ui/react-slot` | `variant`: primary / secondary / ghost / danger / link; `size`: sm / md / lg / icon; `asChild`, `isLoading`, `leadingIcon`, `trailingIcon` |
| `Input` | native | `size`: sm / md / lg; `aria-invalid` styles |
| `Textarea` | native | rows-defaulted, token-driven |
| `Dialog` | `@radix-ui/react-dialog` | `Dialog`, `DialogTrigger`, `DialogContent` (auto portal + overlay + close), `DialogHeader/Footer/Title/Description` |
| `Popover` | `@radix-ui/react-popover` | `Popover`, `PopoverTrigger`, `PopoverContent` (portaled) |
| `Tooltip` | `@radix-ui/react-tooltip` | `TooltipProvider`, `Tooltip`, `TooltipTrigger`, `TooltipContent` |
| `Dropdown` | `@radix-ui/react-dropdown-menu` | `DropdownMenu*` family + `DropdownMenuCheckboxItem`; items support `destructive` flag |
| `Switch` | `@radix-ui/react-switch` | thumb-driven, focus ring, `data-state` styling |
| `Checkbox` | `@radix-ui/react-checkbox` | check indicator via `lucide` |
| `Tabs` | `@radix-ui/react-tabs` | `Tabs`, `TabsList`, `TabsTrigger`, `TabsContent` |
| `Toast` | `@radix-ui/react-toast` | `ToastProvider` wrapping Radix provider + viewport + queue; `useToast()` returns `{ push, dismiss }` |
| `Avatar` | `@radix-ui/react-avatar` | `Avatar` + `AvatarImage` + `AvatarFallback`; `size`: sm / md / lg |
| `Badge` | native | `tone`: neutral / accent / success / warning / danger |
| `Spinner` | native + `Loader2` icon | `size`: sm / md / lg; renders `role="status"` w/ visually hidden label |
| `Skeleton` | native | token-driven pulsing block |

Conventions for every primitive:
- Variants live in `cva(...)` blocks; never inline conditional class strings.
- `forwardRef` so Radix and feature code can attach refs.
- Class merging via `cn()` (clsx + tailwind-merge).
- No hard-coded colors. Tokens only.
- Focus ring uses `var(--color-focus-ring)` and `var(--color-bg-canvas)` for the offset.
- ARIA attributes are forwarded (`aria-invalid`, `aria-label`, etc.).

## Compounds

`compounds/` builds on primitives without introducing new visual primitives:

- **`EmptyState`** — centered icon + title + description + optional action; `role="status"`.
- **`SectionHeader`** — title + description + optional trailing action slot.
- **`Tag`** — token-bordered pill with optional remove button.
- **`IconButton`** — `Button` wrapper that requires a `label` prop and renders a square icon-only surface (`aria-label` enforced).

Compounds are the right place to add small UI patterns shared across features. Feature-specific composition stays in the feature folder.

## Icons

`design-system/icons/index.ts` re-exports a curated set of `lucide-react` icons (Bell, Check, MessageSquare, Send, Search, …). New icons get added here, not imported ad hoc from `lucide-react` in feature code — this keeps the icon set audited and tree-shakable.

## Styleguide

`app/ui/Styleguide.tsx` (in the app-shell module, not here) renders every primitive and compound in a token-themed page, plus a theme switcher. Mounted at `/__styleguide` only when `import.meta.env.DEV`. Phase 4 moves this into the router table.

## Storybook

`.storybook/main.ts` globs `src/**/*.stories.@(ts|tsx)`. Every primitive and compound ships one. `preview.ts` adds:
- A "Theme" toolbar global (`light / dark / high-contrast`) that applies `data-theme` to the document.
- The `addon-a11y` addon (`a11y.test: 'todo'` for now; Phase 12 promotes this to a CI gate).
- Backgrounds set from tokens (`canvas`, `sunken`).

Stories are intentionally minimal — variants and edge cases come from co-located RTL/axe tests, not 50-story explosions.

## Testing

| Test file | What it covers |
|---|---|
| `tokens/contrast.test.ts` | 21 WCAG AA assertions across light / dark / high-contrast. |
| `theme/ThemeProvider.test.tsx` | `setPreference()` updates `data-theme`, persists to `localStorage`, switches between explicit themes. |
| `motion/usePrefersReducedMotion.test.tsx` | Hook returns true when `matchMedia` matches; false otherwise. |
| `primitives/Button/Button.test.tsx` | Click handler, `isLoading` disables interaction, axe-clean. |
| `primitives/Input/Input.test.tsx` | `aria-invalid` forwarding, axe-clean with associated `<label>`. |
| `primitives/Switch/Switch.test.tsx` | Toggle on click, axe-clean. |
| `primitives/Checkbox/Checkbox.test.tsx` | Toggle via keyboard, axe-clean. |
| `primitives/Dialog/Dialog.test.tsx` | Opens on trigger, closes on Escape. |
| `primitives/Toast/Toast.test.tsx` | `push()` renders title + description in the Radix viewport. |

42 tests pass in total (these plus Phase 1's). Per-story axe sweep across all primitives lands in Phase 10/12.

## Import rules

Per `eslint-plugin-boundaries`:

- `design-system` may import `design-system`, `lib`, `shared`. It may **not** import `features`, `app`, `realtime`, or `styles`.
- Features import the design system either through `@/design-system/primitives/Button` (or compound) form, or through the top-level barrel `@/design-system`. Both are allowed.

`shared/utils/cn` is the only `shared` dependency primitives reach for; tokens are not imported in TS-land because primitives consume them via CSS variables in className strings.

## How to extend / modify

| Need | What to do |
|---|---|
| Add a new color / radius / shadow | Add the variable in all three theme CSS files. Re-export from the appropriate `tokens/*.ts`. Add a pair to `tokens/contrast.test.ts` if it's a foreground color. |
| Add a new primitive | Create `primitives/<Name>/<Name>.tsx`, an `index.ts`, a `.stories.tsx`, and a `.test.tsx`. Use CVA for variants, `cn()` for class merging, and Radix when accessibility behavior is non-trivial. Re-export from `primitives/index.ts`. |
| Add a new compound | Same pattern under `compounds/`. Compounds may import primitives. |
| Add a new motion variant | Append to `motion/variants.ts`. Ensure it has an `instant` fallback path (or use `reducedMotionVariants()`). |
| Add a new icon | Add the named export to `icons/index.ts` only. Never import directly from `lucide-react` in feature code. |
| Add a new theme | Add a fourth CSS file under `tokens/themes/`, add it to `THEME_OPTIONS`, update `public/theme-bootstrap.js`'s allow-list, add it to `contrast.test.ts`. |
| Move the styleguide behind a real route | Phase 4 — register it under `app/router/routes.ts` and remove the path-check in `App.tsx`. |
| Replace the Vitest-axe matcher source | The package's `extend-expect.js` is empty; we register matchers manually in `src/tests/setup.ts`. If you upgrade or swap, keep both registration AND the `vitest-axe.d.ts` augmentation. |

## Known deviations

- **`vitest-axe/extend-expect`** ships empty; matchers are registered in `setup.ts` via `expect.extend(axeMatchers)`. Types live in `src/tests/vitest-axe.d.ts`.
- **CSP**: `style-src 'unsafe-inline'` is still allowed (Radix and Tailwind v4 inject runtime styles). Phase 11 will revisit.
- **Theme bootstrap script** is static (CSP-clean), not inline. SHA-pinning is unnecessary in this form; it returns if Phase 11 inlines the script for fewer round-trips.
- **Bundle**: design-system + Radix + Framer pushes initial JS over the 250 KB budget. Code-splitting (Phase 4 router, Phase 9 admin chunk) fixes this.

## References

- Architecture: [`FRONTEND_ARCHITECTURE.md`](../../../FRONTEND_ARCHITECTURE.md) §7 (UI system: tokens, theme switching, primitives, motion, accessibility), §17 (performance budgets).
- Implementation plan: [`FRONTEND_IMPLEMENTATION_PLAN.md`](../../../FRONTEND_IMPLEMENTATION_PLAN.md) Phase 2.
- App-shell integration (provider mounting): [`app-shell.md`](app-shell.md).
- Master context: [`../context.md`](../context.md).
