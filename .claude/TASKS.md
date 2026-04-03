## TASK_01 — ThemeProvider + token system
Context: All color/font/animation values are defined in this task spec directly. Do not read other files.

Output files:
  src/ThemeProvider.tsx
  src/themes/industrial.ts
  src/themes/minimal.ts
  src/themes/cyberpunk.ts

TypeScript interfaces (define in ThemeProvider.tsx, import in theme files):

```typescript
export interface ThemeColors {
  pageBg: string
  pageText: string
  sidebarBg: string
  sidebarBorder: string
  terminalBg: string
  aiPanelBg: string
  aiPanelBorder: string
  accent: string
  accent2?: string
  accent3?: string
  textMuted: string
  textDim: string
  green: string
  red: string
  cursorColor: string
  promptColor: string
  badgeBg: string
  badgeBorder: string
  badgeText: string
  statusOnline: string
  statusWarn: string
  statusOffline: string
}
export interface ThemeFonts { shell: string; ui: string }
export interface ThemeAnimations { scanline: boolean }
export interface ThemeConfig {
  name: 'industrial' | 'minimal' | 'cyberpunk'
  colors: ThemeColors
  fonts: ThemeFonts
  animations: ThemeAnimations
}
```

CSS custom properties to inject on :root (map from ThemeColors fields):
  --color-bg, --color-text, --color-sidebar-bg, --color-sidebar-border,
  --color-terminal-bg, --color-ai-bg, --color-ai-border,
  --color-accent, --color-accent2, --color-accent3,
  --color-muted, --color-dim, --color-green, --color-red,
  --color-cursor, --color-prompt,
  --color-badge-bg, --color-badge-border, --color-badge-text,
  --color-online, --color-warn, --color-offline,
  --font-shell, --font-ui

ThemeProvider behavior:
- Read localStorage key "agentshell-theme" on init (default: "industrial")
- On theme switch: update :root CSS vars + save to localStorage
- Inject Google Fonts <link> dynamically once on mount:
  href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@300;400;600&family=Rajdhani:wght@400;500;600;700&family=IBM+Plex+Mono:wght@300;400;500&family=DM+Sans:wght@300;400;500;600&family=Share+Tech+Mono&family=Orbitron:wght@400;500;700;900&display=swap"

Token values — industrial (src/themes/industrial.ts):
  pageBg: '#060910', pageText: '#c8d4e8',
  sidebarBg: '#0b0f18', sidebarBorder: 'rgba(212,168,75,0.12)',
  terminalBg: '#060910', aiPanelBg: '#0b0f18', aiPanelBorder: 'rgba(212,168,75,0.12)',
  accent: '#d4a84b', accent2: '#2dd4bf',
  textMuted: '#5a7090', textDim: '#253040',
  green: '#34d399', red: '#f87171', cursorColor: '#d4a84b', promptColor: '#d4a84b',
  badgeBg: 'rgba(212,168,75,0.1)', badgeBorder: 'rgba(212,168,75,0.3)', badgeText: '#d4a84b',
  statusOnline: '#34d399', statusWarn: '#fbbf24', statusOffline: '#5a7090'
  fonts: { shell: "'JetBrains Mono', monospace", ui: "'Rajdhani', sans-serif" }
  animations: { scanline: false }

Token values — minimal (src/themes/minimal.ts):
  pageBg: '#eeecea', pageText: '#1a1917',
  sidebarBg: '#f8f7f5', sidebarBorder: '#e0dedd',
  terminalBg: '#f8f7f5', aiPanelBg: '#ffffff', aiPanelBorder: '#e0dedd',
  accent: '#1a1917',
  textMuted: '#b0aead', textDim: '#d4d2ce',
  green: '#16a34a', red: '#dc2626', cursorColor: '#1a1917', promptColor: '#6b6a67',
  badgeBg: '#f2f0ed', badgeBorder: '#d0cecc', badgeText: '#6b6a67',
  statusOnline: '#16a34a', statusWarn: '#d97706', statusOffline: '#b0aead'
  fonts: { shell: "'IBM Plex Mono', monospace", ui: "'DM Sans', sans-serif" }
  animations: { scanline: false }

Token values — cyberpunk (src/themes/cyberpunk.ts):
  pageBg: '#06030d', pageText: '#e2d9f3',
  sidebarBg: '#0a0614', sidebarBorder: 'rgba(192,132,252,0.12)',
  terminalBg: '#06030d', aiPanelBg: '#0a0614', aiPanelBorder: 'rgba(192,132,252,0.12)',
  accent: '#c084fc', accent2: '#f472b6', accent3: '#22d3ee',
  textMuted: '#7a6a99', textDim: '#2e1f44',
  green: '#4ade80', red: '#f87171', cursorColor: '#c084fc', promptColor: '#c084fc',
  badgeBg: 'rgba(192,132,252,0.08)', badgeBorder: 'rgba(192,132,252,0.25)', badgeText: '#c084fc',
  statusOnline: '#4ade80', statusWarn: '#fbbf24', statusOffline: '#7a6a99'
  fonts: { shell: "'Share Tech Mono', monospace", ui: "'Orbitron', sans-serif" }
  animations: { scanline: true }

Exports from ThemeProvider.tsx:
  - ThemeConfig, ThemeColors, ThemeFonts, ThemeAnimations interfaces
  - ThemeContext
  - ThemeProvider component (default export optional, named export required)
  - useTheme(): { theme: ThemeConfig; setTheme: (name: ThemeConfig['name']) => void }

Rules:
- TypeScript strict mode, no `any`
- DO NOT write UI components
Commit message: "feat(theme): ThemeProvider + 3 token configs"

---

## TASK_02 — Sidebar component
Context: ThemeProvider exists at src/ThemeProvider.tsx with useTheme() hook.
All color values are embedded in this spec. Do not read DESIGN_SPEC.md — use the values below.

Output: src/components/Sidebar.tsx

Interfaces:
```typescript
export interface ServerConnection {
  id: string
  name: string
  host: string
  status: 'online' | 'warn' | 'offline'
  group: string
}
export interface SidebarProps {
  connections: ServerConnection[]
  activeId: string | null
  onSelect: (id: string) => void
}
```

Requirements:
- import { useTheme } from '../ThemeProvider'
- ALL colors from useTheme().theme.colors — zero hardcoded hex anywhere in this file
- Background: colors.sidebarBg; right border: 1px solid colors.sidebarBorder
- Search box at top: bg=#111827(ind)/#fff(min)/#10091c(cyber) — use colors.terminalBg as fallback or
  use CSS var(--color-terminal-bg) so it adapts. Font: var(--font-shell), size 10.5px
- Group header: font-family var(--font-ui), 9px, uppercase, letter-spacing 0.14em, color: colors.textDim
- Each connection row:
    padding 7px 12px, flex, gap 9px
    border-left: 2px solid transparent (active: colors.accent)
    background transparent (active: colors.accent + '11' i.e. 7% alpha)
    Avatar 27×27px border-radius 4px: bg=colors.textDim, color=colors.accent, font var(--font-ui) 9px
    Server name: 11.5px font-weight 600, font var(--font-ui), color colors.pageText
    Host: 10px font var(--font-shell), color colors.textMuted
    Status dot: 6px circle, color per status:
      online → colors.statusOnline
      warn   → colors.statusWarn
      offline → colors.statusOffline
- Footer: border-top 1px solid colors.sidebarBorder; 3 buttons (New / Import / Config)
    Each: flex:1, 6px 0 padding, 9px font uppercase letter-spacing 0.06em, border-radius 4px
    Default: bg=transparent, border=1px solid colors.sidebarBorder, color=colors.textMuted
    Primary (New): border-color=colors.accent, color=colors.accent, bg=colors.accent+'1a' (10% alpha)
    Font: var(--font-ui)

No hardcoded hex. No `any`. Commit message: "feat(ui): Sidebar with theme tokens"

---

## TASK_03 — Terminal component
Context: ThemeProvider at src/ThemeProvider.tsx with useTheme() hook.

Output: src/components/Terminal.tsx

```typescript
export interface TerminalProps {
  sessionId: string | null
  onAskAI?: () => void
}
```

Requirements:
- import { useTheme } from '../ThemeProvider'
- Wrap xterm.js: import { Terminal as XTerm, ITheme } from '@xterm/xterm' (or 'xterm' if @xterm not installed)
- Apply ITheme: background=colors.terminalBg, foreground=colors.pageText, cursor=colors.cursorColor,
  cursorAccent=colors.pageBg, fontFamily=theme.fonts.shell, fontSize=12
- Re-apply theme on theme change (useEffect dep on theme)
- Top bar (flex, 7px 14px padding, gap 9px):
    background: colors.terminalBg, border-bottom: 1px solid colors.sidebarBorder
    Status pill: "● LIVE" — color: colors.green (industrial/minimal) or colors.cyan (cyberpunk)
      font var(--font-ui), 9px, uppercase letter-spacing 0.16em
      bg: colors.green+'14', border: 1px solid colors.green+'33'
    Path text: font var(--font-shell), 11px, color colors.textMuted
    Latency "12ms": margin-left auto, font var(--font-ui), 10px bold, color colors.green
- Terminal body: flex:1, position relative, overflow hidden
    Industrial: subtle grid overlay via CSS background-image repeating-linear-gradient
      rgba(45,212,191,0.025) — apply as ::before pseudo or inline style
    Cyberpunk: scanline animation div (position absolute, inset 0, pointer-events none,
      background repeating-linear-gradient as in DESIGN_SPEC, + moving scanline div animated with scla)
- Cursor blink: xterm handles it; ensure cursorBlink: true in Terminal options
- Input row (8px 17px padding, flex, gap 9px):
    border-top: 1px solid colors.sidebarBorder, bg: colors.aiPanelBg
    Prompt "❯": colors.promptColor, font var(--font-shell) 11.5px
    Input: flex:1, font var(--font-shell) 11.5px, color colors.pageText, bg transparent, border none, outline none
    "Ask AI" button: 9px, letter-spacing 0.06em, padding 4px 11px
      bg: colors.accent2+'14' (industrial/teal), border: 1px solid colors.accent2+'33', color colors.accent2
      Cyberpunk: use accent3 (cyan) instead; Minimal: bg colors.accent, color #fff, border none

No hardcoded hex. Commit message: "feat(ui): Terminal component with theme support"

---

## TASK_04 — AIPanel component
Context: ThemeProvider at src/ThemeProvider.tsx with useTheme() hook.

Output: src/components/AIPanel.tsx

Interfaces (define in this file):
```typescript
export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  text: string
}
export interface CommandProposal {
  command: string
  explanation: string
  riskLevel: 'safe' | 'caution' | 'destructive'
}
export interface AIPanelProps {
  sessionId: string | null
  messages: ChatMessage[]
  onSendMessage: (text: string) => void
  pendingProposals: CommandProposal[]
  onApprove: (proposal: CommandProposal) => void
  onDismiss: (proposal: CommandProposal) => void
  loading?: boolean
}
```

Requirements:
- import { useTheme } from '../ThemeProvider'
- ALL colors from useTheme().theme.colors — zero hardcoded hex

Header (11px 13px padding, flex, gap 8px, border-bottom: 1px solid colors.aiPanelBorder):
  - AI avatar 24×24px border-radius 4px:
      Industrial: bg rgba(45,212,191,0.15), border 1px solid rgba(45,212,191,0.4), color colors.accent2, font var(--font-ui) 9px bold — shows "AI"
      Minimal: bg colors.accent, color #fff, font var(--font-ui) 9px bold
      Cyberpunk: bg rgba(192,132,252,0.15), border 1px solid colors.accent, color colors.accent, font var(--font-ui) 9px bold
    → Use theme.name to select avatar style
  - Agent pulse animation when loading=true: CSS animation pu (opacity 1→0.3→1, 1.8s ease-in-out infinite) on avatar
  - Title "AgentShell AI": font var(--font-ui) 12px bold, color colors.pageText
  - Model badge (margin-left auto): "claude-3" — 8px uppercase letter-spacing 0.12em padding 2px 7px border-radius 2px
      color: colors.accent2 (ind), colors.textMuted (min), colors.accent2 (cyber)
      border: 1px solid colors.accent2+'33'

Stats row (flex, gap 6px, padding 8px 12px, border-bottom colors.aiPanelBorder):
  3 stat cards (flex:1, border-radius 3px, padding 5px 7px, text-align center):
    bg: colors.terminalBg (dark themes) or colors.pageBg (minimal), border: 1px solid colors.sidebarBorder
    Value: font var(--font-ui) 13-15px bold, color colors.pageText
    Label: 8px uppercase letter-spacing 0.12em, color colors.textDim, font var(--font-ui)
  Labels/values: Sessions "3", Commands "47", Uptime "99.9%"

Message list (flex:1, padding 11px 12px, overflow-y auto, flex-direction column, gap 8px):
  Assistant message (msg-a):
    bg colors.terminalBg, border 1px solid colors.sidebarBorder, color colors.pageText
    padding 9px 11px, border-radius 5px, font-size 11px, line-height 1.65
    Label "AGENT": 8px uppercase letter-spacing 0.14em, color colors.accent2 (ind/cyber) or colors.textMuted (min)
      font var(--font-ui), margin-bottom 5px
  User message (msg-u):
    bg colors.accent+'11', border 1px solid colors.accent+'26', color colors.textMuted
    text-align right, font var(--font-ui) 10.5px
    Label "YOU": same style but color colors.accent

Command proposal card (rendered after assistant message text when proposals exist):
  Code block (margin-top 7px, border-radius 3px, padding 7px 9px, font-size 10px, line-height 1.75):
    bg colors.terminalBg, border 1px solid colors.sidebarBorder
    border-left: 2px solid colors.accent2 (safe/ind), colors.green (safe/min), colors.accent3 (safe/cyber)
    border-left-color for caution: #fbbf24; for destructive: colors.red
    font var(--font-shell), color colors.green
  Explanation text: 10px, color colors.textMuted, margin-top 5px
  Action buttons row (flex, gap 5px, margin-top 7px):
    Base button: 8px uppercase letter-spacing 0.08em padding 3px 9px border-radius 2px cursor pointer font-weight 700
      bg colors.terminalBg, border 1px solid colors.sidebarBorder, color colors.textMuted, font var(--font-ui)
    "Run" button: border-color colors.accent2+'4d', color colors.accent2, bg colors.accent2+'12'
      Destructive: disabled until checkbox checked; when enabled: border-color colors.red+'4d', color colors.red, bg colors.red+'12'
    Destructive confirmation checkbox: render inline above buttons: "I understand this may be irreversible"
      11px, color colors.textMuted; checkbox must be checked to enable Run
  onApprove called with proposal on Run; onDismiss on Dismiss

Input row (padding 9px 12px, flex, gap 7px, border-top: 1px solid colors.aiPanelBorder):
  Textarea: flex:1, border-radius 4px, padding 6px 9px, font var(--font-shell) 10.5px
    bg colors.terminalBg, border 1px solid colors.sidebarBorder, color colors.textDim (placeholder), color colors.pageText (value)
    resize none, rows=1
    Enter submits (onKeyDown: if Enter && !shiftKey → onSendMessage; preventDefault)
  Send button: 30×30px border-radius 4px flex items-center justify-center
    Industrial/Cyberpunk: bg colors.accent (ind: gold, cyber: purple)
    Minimal: bg colors.accent (near-black)
    Arrow icon: white triangle using CSS border trick or "→" character, 11px

No hardcoded hex. No `any`. Commit message: "feat(ui): AIPanel component with theme support"

---

## TASK_05 — ThemeSwitcher component
Context: ThemeProvider at src/ThemeProvider.tsx with useTheme() hook.
This component replicates the theme selector cards from agentshell-theme-switcher.html.

Output: src/components/ThemeSwitcher.tsx

Requirements:
- import { useTheme } from '../ThemeProvider'
- Outer container: bg var(--color-sidebar-bg), border 1px solid var(--color-sidebar-border),
  border-radius 12px, padding 20px
- Label "SELECT A THEME": 10px uppercase letter-spacing 0.16em, color var(--color-muted), font var(--font-ui), margin-bottom 14px
- 3-column grid (gap 12px):

Card structure (each):
  bg var(--color-terminal-bg), border 1.5px solid var(--color-sidebar-border),
  border-radius 8px, padding 14px 16px, cursor pointer, position relative
  hover: border-color var(--color-accent)
  active: border-color var(--color-accent), bg var(--color-accent)+'0f'
  active checkmark: position absolute top 10px right 12px, content '✓', font-size 12px,
    color var(--color-accent), font-weight 700

Swatch row (flex, gap 5px, margin-bottom 10px):
  4 squares 22×22px border-radius 4px each

Card name: 13px font-weight 700 color var(--color-text) font var(--font-ui) letter-spacing 0.04em margin-bottom 3px
Card desc: 11px color var(--color-text) opacity 0.45 font var(--font-ui) line-height 1.5
Tags row (flex, gap 5px, margin-top 9px):
  Each tag: 9px uppercase letter-spacing 0.1em padding 2px 8px border-radius 20px
    bg var(--color-badge-bg), border 1px solid var(--color-badge-border), color var(--color-badge-text)
    font var(--font-ui)

Card data (hardcoded per card — this is meta-UI, not theme-sensitive display):
  Industrial card:
    swatches: ['#0b0f18 border rgba(212,168,75,0.3)', '#d4a84b', '#2dd4bf', '#34d399']
    name: 'Dark Industrial'
    desc: '精密仪表盘 · 青金配色 · 工业质感'
    tags: ['Dark', 'JetBrains Mono', 'Professional']
    onClick: setTheme('industrial')

  Minimal card:
    swatches: ['#ffffff border #d0cecc', '#1a1917', '#16a34a', '#dc2626']
    name: 'Light Minimal'
    desc: '极简白 · 日系精工 · 高对比清晰'
    tags: ['Light', 'IBM Plex Mono', 'Enterprise']
    onClick: setTheme('minimal')

  Cyberpunk card:
    swatches: ['#06030d border rgba(192,132,252,0.3)', '#c084fc', '#f472b6', '#22d3ee']
    name: 'Cyberpunk Neon'
    desc: '深空紫红 · 霓虹扫描线 · 极客文化'
    tags: ['Dark', 'Orbitron', 'Hacker']
    onClick: setTheme('cyberpunk')

No `any`. Commit message: "feat(ui): ThemeSwitcher card selector"

## TASK_08 — ProfileList tag grouping

Context: Modify the existing ProfileList sidebar to group connections by their first tag.

Target file: src/components/profiles/ProfileList.tsx

Current state:
- `ConnectionProfile` has a `tags: string[]` field.
- Profiles are currently rendered as a flat list in `profiles.map(...)`.
- The component uses `useTheme()` from `../../ThemeProvider` and the `c` color tokens.
- Inline forms for editing and connecting are already present and must be preserved exactly.

Required changes (minimal diff — do NOT rewrite the file):
1. Group profiles by `profile.tags[0] ?? "Ungrouped"`.
2. Render group headers before each group:
   - Style: fontSize 9, color = `c.textDim`, textTransform "uppercase", letterSpacing "0.14em",
     fontFamily "var(--font-ui)", paddingTop 8, paddingBottom 2, paddingLeft 2.
3. Profiles within each group render exactly as before (keep all existing inline form logic).
4. Sort groups: named tags alphabetically, then "Ungrouped" last.
5. If all profiles are in one group (or no profiles), show no group header.

Constraints:
- Must not change the profile list rendering logic beyond grouping.
- Must not add new state or imports beyond what is needed for grouping.
- No hardcoded hex colors. Use only theme color tokens from `useTheme()`.
- TypeScript strict: `npx tsc --noEmit` must pass with zero errors.
- Do not change the ProfileForm, QuickConnect, or saveCurrentAsProfile exports.

Commit: "feat(ui): group ProfileList by first tag"

## TASK_UI_01 — Theme-aware terminal: xterm.js colors + overlay effects

### Context

The xterm.js terminal in `src/hooks/useTerminal.ts` has hardcoded GitHub-dark colors and font.
`src/components/terminal/TerminalView.tsx` has a hardcoded Tailwind `bg-[#0d1117]` class.
These must use theme tokens. Also add theme-specific overlay effects:
- Industrial theme: subtle grid overlay using CSS `repeating-linear-gradient`
- Cyberpunk theme: animated scanline overlay

### Files to modify

1. `src/hooks/useTerminal.ts`
2. `src/components/terminal/TerminalView.tsx`

### Step 1: Update useTerminal.ts

Add two optional fields to `UseTerminalOptions`:
```typescript
export interface UseTerminalOptions {
  sessionId: string | null;
  onDisconnected?: () => void;
  xtermTheme?: import('@xterm/xterm').ITheme;
  fontFamily?: string;
}
```

In the `useEffect([sessionId, onDisconnected])` where `new Terminal({...})` is called, replace the hardcoded values:
- `fontFamily`: use `options.fontFamily ?? '"JetBrains Mono", "Cascadia Code", monospace'`
- `theme`: use `options.xtermTheme ?? { background: "#0d1117", foreground: "#c9d1d9", cursor: "#58a6ff" }`

Keep all other Terminal options unchanged. The `options` object is the whole `UseTerminalOptions` parameter.

Also add a `termRef` exposure so TerminalView can update theme. Add to `UseTerminalReturn`:
```typescript
export interface UseTerminalReturn {
  containerRef: React.RefObject<HTMLDivElement | null>;
  fit: () => void;
  searchAddon: React.RefObject<SearchAddon | null>;
  updateXtermTheme: (theme: import('@xterm/xterm').ITheme, fontFamily: string) => void;
}
```

Implement `updateXtermTheme`:
```typescript
const updateXtermTheme = useCallback((xtTheme: import('@xterm/xterm').ITheme, ff: string) => {
  const term = termRef.current;
  if (!term) return;
  term.options.theme = xtTheme;
  term.options.fontFamily = ff;
  fitAddonRef.current?.fit();
}, []);
```

Return `updateXtermTheme` in the return object.

### Step 2: Update TerminalView.tsx

Replace the current file content with the following implementation. This file imports useTheme and builds the xterm theme object from current theme tokens.

```typescript
/**
 * TerminalView — renders the xterm.js terminal for one session.
 * Uses the useTerminal hook for lifecycle management.
 * Terminal colors and font are driven by the active theme.
 */
import { useEffect } from "react";
import { useTheme } from "../../ThemeProvider";
import { useTerminal } from "../../hooks/useTerminal";

interface TerminalViewProps {
  sessionId: string;
  onDisconnected?: () => void;
}

export function TerminalView({ sessionId, onDisconnected }: TerminalViewProps) {
  const { theme } = useTheme();
  const c = theme.colors;

  // Build xterm ITheme from current ThemeColors
  const xtermTheme = {
    background: c.terminalBg,
    foreground: c.pageText,
    cursor: c.cursorColor,
    cursorAccent: c.terminalBg,
    selectionBackground: c.accent + "33",
    black: "#484f58",
    red: c.red,
    green: c.green,
    yellow: theme.name === "minimal" ? "#d97706" : "#fbbf24",
    blue: "#60a5fa",
    magenta: c.accent,
    cyan: c.accent2 ?? c.accent,
    white: c.pageText,
    brightBlack: c.textMuted,
    brightRed: c.red,
    brightGreen: c.green,
    brightYellow: theme.name === "minimal" ? "#d97706" : "#fbbf24",
    brightBlue: "#60a5fa",
    brightMagenta: c.accent,
    brightCyan: c.accent2 ?? c.accent,
    brightWhite: c.pageText,
  };

  const { containerRef, updateXtermTheme } = useTerminal({
    sessionId,
    onDisconnected,
    xtermTheme,
    fontFamily: theme.fonts.shell,
  });

  // Update xterm theme when user switches themes (theme.name changes)
  useEffect(() => {
    updateXtermTheme(xtermTheme, theme.fonts.shell);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [theme.name]);

  // Overlay styles per theme
  const overlayStyle: React.CSSProperties | null =
    theme.name === "industrial"
      ? {
          position: "absolute",
          inset: 0,
          pointerEvents: "none",
          backgroundImage:
            "repeating-linear-gradient(0deg, transparent, transparent 23px, rgba(45,212,191,0.025) 23px, rgba(45,212,191,0.025) 24px), repeating-linear-gradient(90deg, transparent, transparent 23px, rgba(45,212,191,0.025) 23px, rgba(45,212,191,0.025) 24px)",
          zIndex: 1,
        }
      : theme.name === "cyberpunk"
        ? {
            position: "absolute",
            inset: 0,
            pointerEvents: "none",
            backgroundImage:
              "repeating-linear-gradient(0deg, transparent, transparent 3px, rgba(192,132,252,0.018) 3px, rgba(192,132,252,0.018) 4px)",
            animation: "scanlineMove 7s linear infinite",
            zIndex: 1,
          }
        : null;

  return (
    <div style={{ position: "relative", width: "100%", height: "100%", background: c.terminalBg }}>
      <div
        ref={containerRef}
        style={{ width: "100%", height: "100%", padding: "4px", boxSizing: "border-box" }}
      />
      {overlayStyle && <div style={overlayStyle} />}
      <style>{`
        @keyframes scanlineMove { from { background-position: 0 0; } to { background-position: 0 100%; } }
      `}</style>
    </div>
  );
}
```

### Constraints
- `npx tsc --noEmit` must pass with zero errors after changes.
- Do not change any behavior in useTerminal outside of: (1) using `xtermTheme`/`fontFamily` options in Terminal constructor, (2) adding `updateXtermTheme` function.
- Do not remove any existing useTerminal logic (scrollback replay, Zmodem, ResizeObserver, FitAddon).
- The `termRef` already exists in useTerminal — just use it in `updateXtermTheme`.
- Import `React` if needed for `React.CSSProperties`.

Commit: "feat(ui): theme-aware xterm.js colors + industrial grid / cyberpunk scanline overlays"

---

## TASK_UI_02 — Global font CSS + cyberpunk top border + misc polish

### Context

The app's root `font-family` is not set globally. The cyberpunk theme needs a visible top gradient border. Minor polish needed.

### Files to modify

1. `src/index.css`
2. `src/App.tsx`

### Step 1: index.css additions

Append after the existing rules (do NOT remove existing rules):

```css
:root {
  --font-ui: 'Rajdhani', sans-serif;
  --font-shell: 'JetBrains Mono', monospace;
}

body {
  font-family: var(--font-ui);
  color: var(--color-text, #c8d4e8);
  background: var(--color-bg, #060910);
}

button, input, textarea, select {
  font-family: inherit;
}

/* Cursor blink for xterm */
@keyframes bl { 0%,100%{opacity:.9} 50%{opacity:0} }
/* Agent pulse */
@keyframes pu { 0%,100%{opacity:1} 50%{opacity:0.3} }
```

### Step 2: App.tsx cyberpunk top border

In `App.tsx`, the root `<div>` (the outermost one with `display: 'flex', height: '100vh'`) needs a conditional top border for cyberpunk.

Find the root div that starts with:
```
style={{
  display: 'flex',
  height: '100vh',
  ...
```

Add to its style:
```typescript
borderTop: theme.name === 'cyberpunk'
  ? '1px solid transparent'
  : 'none',
backgroundImage: theme.name === 'cyberpunk'
  ? 'linear-gradient(var(--color-bg, #06030d), var(--color-bg, #06030d)), linear-gradient(90deg, transparent, #c084fc, #f472b6, transparent)'
  : undefined,
backgroundOrigin: theme.name === 'cyberpunk' ? 'border-box' : undefined,
backgroundClip: theme.name === 'cyberpunk' ? 'padding-box, border-box' : undefined,
```

This creates the cyberpunk gradient top border using the CSS background-clip border-box trick.

### Constraints
- `npx tsc --noEmit` must pass with zero errors.
- Do NOT remove any existing rules from index.css.
- Do NOT change any other logic in App.tsx beyond the root div style update.
- Only add the `theme` destructuring at the top of AppShell if it's not already there: `const { theme } = useTheme();`

Commit: "feat(ui): global font CSS vars + cyberpunk top gradient border"

## TASK_UI_03 — Remove hardcoded GitHub-dark colors from profile components

### Context

`src/components/profiles/QuickConnect.tsx` and `src/components/profiles/ProfileList.tsx`
use Tailwind classes with hardcoded GitHub-dark hex values (bg-[#161b22], text-[#c9d1d9], etc.).
These break the light (minimal) theme and the cyberpunk theme. Must use theme tokens.

### Files to modify

1. `src/components/profiles/QuickConnect.tsx`
2. `src/components/profiles/ProfileList.tsx`

### Approach

For BOTH files:
- Add `import { useTheme } from "../../ThemeProvider";` at top
- Inside the component function, add: `const { theme } = useTheme(); const c = theme.colors;`
- Replace ALL Tailwind `className` attributes that contain hardcoded hex colors with `style={{...}}` inline styles using theme tokens
- Keep non-color Tailwind classes (e.g. `space-y-2`, `flex`, `gap-2`) where convenient, or convert to inline styles — your choice
- Never use hardcoded hex values; map colors to theme tokens as follows:
  - bg-[#161b22] (input backgrounds) → `background: c.terminalBg`
  - bg-[#21262d] (button backgrounds) → `background: c.sidebarBg`
  - border-[#30363d] → `borderColor: c.sidebarBorder`
  - text-[#c9d1d9] (primary text) → `color: c.pageText`
  - text-[#8b949e] (muted text) → `color: c.textMuted`
  - text-[#6e7681] (placeholder) → handled via CSS `color: c.textMuted`
  - focus:border-[#58a6ff] → use `c.accent` on `:focus` (use onFocus/onBlur state OR just style the border normally with `c.accent`)
  - text-[#ff7b72] (error) → `color: c.red`
  - hover effects → simplify: just use the base color (no hover state needed)
  - Font: `fontFamily: 'var(--font-ui)'` for labels/buttons, `fontFamily: 'var(--font-shell)'` for inputs/code

### Input field style helper (define once, reuse)

In QuickConnect.tsx, define this style object (use for all inputs and select):
```typescript
const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '4px 8px',
  fontSize: 11,
  fontFamily: 'var(--font-shell)',
  background: c.terminalBg,
  border: `1px solid ${c.sidebarBorder}`,
  borderRadius: 3,
  color: c.pageText,
  outline: 'none',
  boxSizing: 'border-box',
};
```

Use `style={inputStyle}` for all `<input>` and `<select>` elements. For the short port input, override width inline: `style={{ ...inputStyle, width: 56 }}`.

### Button style

Buttons in QuickConnect:
```typescript
const btnStyle: React.CSSProperties = {
  padding: '5px 0',
  fontSize: 11,
  fontFamily: 'var(--font-ui)',
  background: c.sidebarBg,
  border: `1px solid ${c.sidebarBorder}`,
  borderRadius: 3,
  color: c.textMuted,
  cursor: 'pointer',
  fontWeight: 500,
};
```

Connect button: use `{ ...btnStyle, flex: 1, color: c.pageText }`.
Save button: use `{ ...btnStyle, padding: '5px 8px' }`.

### ProfileList.tsx approach

- Read the current file. Replace EVERY occurrence of a Tailwind class string that contains `#` hex colors with an inline style using the same token mapping as above.
- Group headers already use theme tokens (from TASK_08) — don't break those.
- The search input at top: apply `inputStyle` pattern (without the `width: '100%'` wrapper, or include it).
- Profile rows: replace `bg-[#161b22] border border-[#30363d]` with inline style `background: c.terminalBg, border: \`1px solid ${c.sidebarBorder}\``.
- Active/hover profile rows: keep the accent border logic from existing code.
- Connect button in expanded row: `border: \`1px solid ${c.accent}\`, color: c.accent, background: 'transparent'`.
- Cancel button: `border: \`1px solid ${c.sidebarBorder}\`, color: c.textMuted`.

### Constraints
- `npx tsc --noEmit` must pass with zero errors.
- Do NOT change any business logic (form submission, connect/save/profile CRUD).
- Do NOT change the `saveCurrentAsProfile` export or any exported interfaces.
- All `className` attributes that contain `#` colors must be removed.
- All colors must come from `c.*` theme tokens only.
- Remove the `useTheme` and theme token imports if already present — just ensure they're there once.

Commit: "fix(ui): replace hardcoded GitHub-dark colors with theme tokens in profile components"
