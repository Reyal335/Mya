# Mya design reference

These files are static mockups. Open any `.html` file in a browser to see it.
They show the intended look and layout, not working code. Build the real
components in React and match these visually.

## Screens

| File | Screen |
| --- | --- |
| `1-inbox.html` | Inbox: nav, conversation list, selected conversation preview |
| `2-conversation.html` | Conversation: history, tool cards, mascot with RPG dialogue box, input |
| `3-agent-manager.html` | Agent list (project / global) and the edit form with 16x16 icon upload |
| `4-mascot-manager.html` | Mascot gallery and the upload dialog with one loop per state |
| `5-popup-notifications.html` | The three popup variants: finished, needs approval, error |
| `6-mascot-states.html` | The five mascot states |
| `7-sheet-slicer.html` | The sheet slicer in the mascot dialog: grid, picked frames, loop preview, REUSE SHEET |
| `8-chat-party.html` | CHAT with the party panel: the frame (history and stage), the input row with a called agent, the panel and its detail area |
| `8b-party-states.html` | Every state of a party member: panel row, rail icon, the rail hover card, and the input row |
| `8c-party-rail.html` | CHAT in a narrow window, with the party panel collapsed to a rail |
| `10-model-picker.html` | CHAT with the model and thinking picker open above the input row, and a reply with its tag |
| `11-chat-themes.html` | The chat theme picker: the tiles, the preview, the fade slider, and APPLY TO |
| `12-title-bar.html` | The custom title bar: where I am, RUNNING and WAITING pills, window buttons, and its states |
| `13-account.html` | ACCOUNT: who the agents run as, the session and weekly usage bars, and the sidebar meter that opens it |
| `13b-account-states.html` | Every state of the sidebar meter, the usage panel, and the account panel |
| `mascot.png` | Default mascot image used in the mockups |

## Colors

| Token | Hex | Use |
| --- | --- | --- |
| bg | `#0B132B` | App background, input backgrounds |
| panel | `#1C2541` | Panels, cards, sidebar |
| line | `#3A506B` | Default borders, user message bubble |
| accent | `#5BC0BE` | Active nav, primary buttons, agent names |
| text | `#F2F4F8` | Main text, emphasis borders |
| muted | `#A9B6C6` | Secondary text, "done" status |
| running | `#6FCF7F` | Running status |
| waiting | `#F2B84B` | Waiting for approval |
| error | `#F0706A` | Error status and validation errors |
| shadow | `#000000` | Hard drop shadows |
| check | `#26335A` | Checkerboard squares behind transparent pixels (on panel) |
| raised | `#26335A` | Slightly lighter than panel: inline code and table headers in Markdown |
| dim | `#0B132B` at 62% | Overlay on unpicked cells in the sheet slicer |

`#3A506B` is too dark for text on the navy backgrounds. Use it for borders only.

## Type

- Headings, labels, buttons, tags: `'Press Start 2P'`, 8 to 14px.
- Chat text, descriptions, code, inputs: `'IBM Plex Mono'`, 12 to 15px, line height 1.5.
- Never set paragraphs in the pixel font.

## Shape rules

- No rounded corners, no gradients, no blurred shadows.
- Borders are 4px solid (2px on small tags and tool cards).
- Shadows are hard offsets: `4px 4px 0 #000` on buttons, `6px 6px 0 #000` on dialogue boxes and dialogs.
- Selected or unread items: `#F2F4F8` border with a `4px 4px 0 #5BC0BE` shadow.
- Buttons and inputs are at least 44px tall.
- Pixel art scales by whole numbers only, with `image-rendering: pixelated`.

## Status

Every status shows a colored square and a text label, never color alone.

| Status | Color | Label |
| --- | --- | --- |
| Running | running | RUNNING |
| Waiting for approval | waiting | WAITING |
| Done | muted | DONE |
| Error | error | ERROR |

Conversations waiting for approval count as unread in the inbox.

## Mascots

- A mascot has seven states: idle, thinking, talking, working, asking, and, for boss
  battles, victory and hurt. Only idle is required.
- victory falls back to the talking loop and hurt to the idle loop; every other state
  falls back to idle. The upload dialog shows their rows after asking, with "Plays the
  talking loop" and "Plays the idle loop" as their empty text, and a gallery card counts
  "n of 7 loops".
- The mascot plays hurt for 1.2 seconds after a boss round with heals and victory for 3
  seconds after a victory. Both rank just below asking, and the 400ms minimum time
  holds.
- Each state has its own spritesheet and its own FPS.
- A loop can reverse at the end (REVERSE AT END, off by default). It plays the frames
  forward, then back down to the second frame, then starts again: 1, 2, ... n, n-1,
  ... 2, 1, 2, ... The two end frames each show once, so there is no pause at the
  turn. It needs at least 3 frames, and with fewer it does nothing. It is saved with the
  state in the mascot's `manifest.json` as `"reverse": true`, and the field is left
  out when it is off. The strip itself is not changed, so the 16-frame limit still
  holds.
- Spritesheet format: PNG, horizontal strip of 64x64 frames. Height exactly
  64px, width a multiple of 64, at most 16 frames. A sheet in any other
  layout opens the sheet slicer, which cuts it into such a strip (see Sheet
  slicer). A stored sheet that breaks these rules is reported with a specific
  message, for example "Height must be 64px. Yours is 128px."
- Idle is required. A state with no sheet plays its fallback loop (above).
- Display at 1x, 2x, or 3x only.

## Mascot voice

An optional `voice` field in the mascot's `manifest.json` shapes Claude's tone in the main
conversation, changing how Claude speaks and how often it uses emoji. The field is
`{ text: string; emoji: 'off' | 'some' | 'lots' }`, where `text` is the voice description
and `emoji` sets the emoji level.

### Voice text

Text is free prose from 1 to 1000 characters, trimmed, allowing newlines. No control
characters (ASCII 0–31 except tab and newline). It goes into the system prompt and is
never sent to agents or affects tool behavior; it shapes the tone of Claude's own replies only.

Example: "Draco Malfoid speaks with a dry, smug wit. Sarcastic, clever observations.
Short sentences with bite."

### Emoji levels

- `off`: Claude does not use emoji in its replies.
- `some`: Claude uses emoji occasionally, about 1–2 per reply where they fit naturally.
- `lots`: Claude uses emoji freely in conversational replies, as many as it wants.

Emoji never appear in code blocks, inline code, file paths, diffs, or any non-prose text.

### Rendering

- Emoji render in full color. Segoe UI is the fallback font for graphemes the main font
  does not cover.
- ZWJ sequences (emoji with modifiers, like skin tones or gendered forms) are supported
  and render as graphemes, never split.
- The typewriter handles grapheme boundaries correctly.

### Default mascot

The built-in default mascot has no voice by default, so Claude speaks plainly with no
emoji. A voice only applies when the mascot is explicitly named. An unnamed mascot (the
placeholder "Default" name) uses the system prompt without a voice field.

### Validation

Voice is validated strictly. A mascot with an invalid voice field is marked as broken.
Show the exact error:

- Text exceeds 1000 characters: "Voice text must be 1000 characters or fewer. This one is
  1247."
- Invalid emoji level (not 'off', 'some', or 'lots'): "Emoji level must be 'off', 'some',
  or 'lots'. Got 'lots2'."
- Control characters (ASCII 0–31 except tab and newline) in text: "Voice text must not
  contain control characters."

### Prompt injection safeguard

Voice text is user-written and trusted. It runs in the system prompt of the main
conversation only, not agents. If mascot sharing is added later, voice fields must be
reviewed before sharing.

## Sheet slicer

See `7-sheet-slicer.html`. A picked sheet that is already a legal strip is used
as it is and the slicer never opens. Any other sheet opens the slicer in its
state's row, unless it is refused.

Refused outright, checked in this order:

1. Not a PNG: "Sheet must be a PNG file."
2. Over 3 MB: "Sheet must be under 3 MB. This one is 3.6 MB."
3. Over 4096 pixels on a side: "Sheet must be at most 4096 pixels on each
   side. This one is 5000x300."
4. Does not decode: "This file could not be read as an image."

Slice rules, checked in this order. The first one that fails is shown, with
the real values:

1. Columns and rows are whole numbers from 1 to 16: "Columns and rows must be
   whole numbers from 1 to 16."
2. "Sheet width 384 does not divide into 5 columns."
3. "Sheet height 384 does not divide into 5 rows."
4. At least one cell is picked. No message: USE is disabled.
5. "A loop can have at most 16 frames. 20 are picked."
6. Every cell is inside the grid and picked once: "Each picked frame must be a
   cell in the grid, picked only once."

Frames need not be square: width and height each scale to 64 on their own, so
a non-square frame stretches to fill the 64x64 frame.

When no rule fails, one note shows. Notes never block:

- "64x64 frames, used as they are."
- "128x128 frames, scaled to 64x64." when each side is a multiple of 64 or
  divides 64 evenly (32, 16, 8). A non-square frame follows the same rule per
  side, e.g. "128x32 frames, scaled to 64x64."
- Warning: "96x96 is not a multiple of 64. Scaled frames may look uneven."
  The same warning covers a non-square frame, e.g. "153x102 is not a multiple
  of 64. Scaled frames may look uneven."

Other messages: "This sheet is no longer loaded. Upload it again." (the
loaded sheet is gone) and "Pick at least one frame." (a slice request with no
cells; the slicer itself disables USE instead).

- Status colors: running with OK for a note, waiting with ! for the warning,
  error with X for a failed rule. Grid lines follow: accent, waiting, error.
- The sheet is drawn on the checkerboard with `image-rendering: pixelated`, at
  a whole-number scale when it fits, scaled down to fit when it does not.
- Columns and rows are number fields you can type in, with - and + buttons
  beside them. A typed value that is not a whole number from 1 to 16 (empty,
  partial, fractional, out of range) is never clamped: the grid keeps its last
  good value, the field is marked invalid, the grid message above shows in the
  status box, and USE is disabled. The field snaps back to the grid's value on
  blur, and Enter does not submit the dialog.
- Starting grid: width / 64 by height / 64 when both are whole and at most 16,
  otherwise 1 by 1. A reused sheet starts from the grid last confirmed for it.
- When the grid changes, the picks reset: every cell in reading order if there
  are 16 or fewer, none if there are more.
- Picked cells show their place in the loop; unpicked cells are dimmed.
- REVERSE AT END is a checkbox in the LOOP FRAMES header, between the count and PICK
  ALL, off by default (it starts from the row's setting when the row already has an
  upload). It is disabled with fewer than 3 picked frames, with the title "Needs three or
  more frames.". When it is on, a line under the header reads "Plays 1 to <n>, back
  down to 2, then starts again.", the preview plays in that order, and its frame note
  adds " · back" on the way down. USE keeps the setting with the strip.
- A filled row (not slicing, 3 or more frames) shows the same checkbox under its loop,
  with the note "Plays forward, then back.", so the setting can be changed without
  slicing again. Replacing a sheet keeps it, like FPS. REMOVE clears it.
- Frames are scaled to 64x64 by nearest neighbour only: no smoothing, no
  blending. Width and height scale independently, so a non-square frame
  stretches to fill the square.
- SAVE MASCOT is disabled while a slicer is open.

## Party and inbox

See `8-chat-party.html`, `8b-party-states.html`, `8c-party-rail.html`, and
`1-inbox.html`. The sidebar reads CHAT, INBOX, AGENTS, MASCOTS, ACHIEVEMENTS (see
Progression), and the app opens on CHAT. The party panel's header is the PARTY | BOSS
tab bar (see Boss battles). CHAT shows a count of 1 while a request from the main
conversation itself is pending; INBOX shows the number of waiting tasks. Both
are hidden at zero. Under the project name sits the account meter, which opens
ACCOUNT (see Account and usage).

### Party panel

- 252px wide, as tall as the frame and the input row together. Header: PARTY,
  the number of agents, and the collapse button.
- Under the header: "Click a member to call them for your next message."
  While an agent is called: "Calling <agent> for your next message."
- One row per agent, project agents first, then global. A row is at least 56px
  tall: the icon at 32px, the agent's name, and its role as the smaller line
  (left out when it has none). Rows have no border until hovered, focused, or
  called. When they do not fit, the list scrolls inside the panel.
- The detail area is pinned to the bottom above a dividing line: the name, the
  model as a small tag (left out when the file sets none), the description cut
  to four lines, and the tools on one line, or "All tools". With nobody hovered,
  focused, or called: "Hover a member to see what they do."
- With no agents: "No agents yet. Make one on the AGENTS screen."
- States, from `8b-party-states.html`: IDLE, HOVER OR FOCUS, CALLING (accent
  fill, text border, hard shadow), WORKING (line border, the latest activity in
  the running color, a running square; the icon hops 2px in hard steps, never
  with reduced motion), WAITING FOR YOU (waiting border, "Needs your
  approval"), CANNOT BE CALLED (dashed border, dimmed icon, not a button).
- Reasons an agent cannot be called: "Sets its own permission mode", "Runs in
  the background", "File has a problem", "Hidden by a project agent", and
  "Three agents are working" (on every row that is not itself working or
  waiting, while three agents are going; a run going is not enough).
- The rail is 72px with 48px icon buttons. Hovering or focusing one shows the
  hover card to its left: name, role, model, description, and "Click to call
  for your next message". The panel is open at 1200px and wider and a rail below
  that, until the collapse button is pressed; that choice is kept in
  settings.json.
- With an agent called, the composer's toolbar shows its chip (icon, name, and a
  remove button) and the placeholder "Message for <agent>...". Otherwise the
  placeholder is "Message <name>...", where <name> is the speaker name below.
- The message box is the composer (see Composer). It grows one line at a time up to
  10 lines, then scrolls. SEND and STOP sit at the right end of its toolbar. The
  history gives up height first, so the stage stays visible (see Composer).
- The input stays enabled during a run. SEND stays, and STOP is its own text button
  beside it, shown only while a run is going. With nobody called, the placeholder
  during a run is "Message <name> or call an agent...".

### The speaker name

The main conversation speaks under the active mascot's name, not "Claude". It shows
as the name in the dialogue box (and its "<name> says" label), as the title at the top
of CHAT, and in the input placeholder and its hidden label. It follows the mascot
chosen on the MASCOTS screen. The built-in default mascot has no name of its own until
it is renamed ("Default" is only a placeholder), so until then the name stays
"Claude". Agents Claude brings in keep their own names, and the popups and the
inbox are not changed.

### Agents at work

- In the history a task is an agent card: icon, name, role and task label, and
  its status as a word. While it runs, its latest activity; when it ends, the
  first three lines of the report and OPEN IN INBOX >.
- A message sent with an agent called shows the agent's chip on top of the text.
- The mascot is WORKING while an agent runs, and the dialogue box reads
  "<agent> is working: <latest activity>". A request from inside an agent has
  one extra line on top: the agent's icon and "<agent> asks".
- Messages during a run: a message sent while a run is going goes into that
  run, at the end of the history, with its chip if one was set. Claude reads it
  after the agent that is working has finished, because Claude Code does not
  read a message while an agent runs in the foreground. Until Claude takes it
  in, the message shows a small QUEUED word; a message still unreceived when the
  run ends shows "Not delivered. The run ended." and is not sent again. Calling
  an agent this way starts that agent after the first one ends, so at most the
  agents Claude itself runs in parallel can be working together; a call with
  three agents already working is refused with "Three agents are already
  working." and nothing is sent. With more than one agent working, the dialogue
  box reads "<n> agents are working".
- NEW CHAT asks "Start a new conversation? The current one is cleared from
  Mya."
- Saved history: "Earlier messages are not shown." (more than 200 messages) and
  "Earlier messages are not available." (the saved conversation cannot be
  read). A lost session: "The saved conversation was not found. This reply
  starts from a fresh context."

### Agent messages

- The sentence put in front of a message sent with an agent called: "Use the
  <name> agent for this request."
- "The agent <name> sets its own permission mode (<value>). Mya keeps
  approvals on, so it does not run this agent."
- "The agent <name> is set to run in the background. Mya runs agents in the
  foreground."
- "This agent went to the background, which Mya does not support yet."

### Inbox

- One row per task, newest first: icon, agent name, the PROJECT or GLOBAL tag
  (none for a built-in agent), the task label, a one-line preview, the time,
  and the status as a word: RUNNING (running), WAITING (waiting), DONE (muted),
  ERROR (error), STOPPED (muted).
- Preview: the latest activity while running, "Waiting: <the request's label>"
  while waiting, then the start of the report.
- A waiting task has the unread look (text border, accent shadow) and the NEW
  tag. A finished task not yet opened shows NEW and does not count on the nav
  badge.
- The detail sits beside the list: the header (icon, name, tag, status, start
  time, how long it took), TASK, ACTIVITY, and REPORT. Cut text says "Shown in
  part." While the task waits, the request and APPROVE / DENY show at the top.
  ASK AGAIN opens CHAT with that agent called.
- CLEAR FINISHED removes done, error, and stopped tasks after one confirmation.
  A running or waiting task cannot be deleted.
- Empty: "Nothing here yet. Call an agent from the party panel on CHAT."
- A task cut off when the app closed: "Interrupted when Mya closed."

## Model and thinking

See `10-model-picker.html`. A control at the left of the Composer's toolbar picks
the model and the thinking level for the main conversation, each one AUTO or a
choice. The mockup's backdrop picture and its nav label are not part of the
build.

### What is saved

- Each chat saves `{ model, effort }`. `model` is "auto" or a model value from
  the account's model list. `effort` is "auto" or one of the levels that model
  supports. A chat saved before the picker loads as auto and auto. A chat is the
  open project's conversation.
- settings.json keeps `defaultModel` and `defaultEffort`, both "auto" at first.
  A new chat (NEW CHAT, or a chat with no choice yet) starts from them. With
  "Use for new chats too" checked, a pick is saved as the defaults too, so NEW
  CHAT starts on the same choice. Unchecked, NEW CHAT starts on the defaults
  saved earlier.
- AUTO means Claude Code's default, for both model and thinking. With AUTO the
  app does not set the option at all. The app does not route messages between
  models.
- A pick applies at once. During a run the model goes through `setModel()` (no
  argument for AUTO) and the level through `applyFlagSettings({ effortLevel })`
  (null for AUTO). Both apply from the next message.
- Party agents are not touched and their files are never written. An agent
  whose file sets a model keeps it. An agent with no model line follows the
  main model.

### The model list

- It comes from `supportedModels()`, fetched once per project folder in a
  query opened with no message (nothing is sent to a model), kept in main, and
  shown in the order the SDK returns. No model name is written in the code.
  AUTO is the first row. The SDK's own "default" row is not a row of its own,
  because AUTO is it: its levels are the levels AUTO offers.
- The list scrolls inside the picker.
- If the call fails, the list is AUTO only and the picker shows "Couldn't load
  the model list."
- POWER and SPEED bars come from a table keyed by family, matched on the
  model's value or exact model: opus 3 and 1, sonnet 2 and 2, haiku 1 and 3. A
  model of no listed family shows no bars. AUTO shows dotted bars.
- A row's description is the table's line for the three families, and the
  SDK's own description for any other model.
- Levels: AUTO plus one button per level the selected model supports, in order
  (LOW, MED, HIGH, XHIGH, MAX). If the SDK gives no effort fields for any
  model, every model shows AUTO, LOW, MED, HIGH, MAX. If the SDK gives them for
  other models but not this one, or says it takes none, only AUTO shows, with
  "This model doesn't take a thinking level." The line under the buttons
  describes the selected level.
- The thinking meter has 4 blocks: LOW 1, MED 2, HIGH 3, XHIGH 4, MAX 4. AUTO
  shows alternating blocks. The word, not the blocks, tells XHIGH from MAX.

### A saved choice that no longer fits

The chat falls back, saves the fallback, and shows one line in the
conversation, once:

- A saved model not in the list: "<Name> isn't available right now. Using AUTO."
- A saved level the model does not take: it uses the nearest supported level
  below, else AUTO: "<LEVEL> isn't available on <Name>. Using <LEVEL>."

While the list cannot be loaded nothing is saved, so a failed fetch never costs
the choice.

### The control and the picker

- The control reads "<MODEL> · THINK <LEVEL>" in the pixel font, with the
  4-block meter before it and a caret after, at the left of the composer's
  toolbar, before the agent chip. It has `aria-expanded` and `aria-haspopup="dialog"`.
- Below 520px of composer width, or with an agent called, a run going, and the composer
  at 760px or narrower, it shows only the meter and caret (see Composer).
- It opens the picker above the composer. Escape, DONE, and a click outside
  close it. Focus moves onto the selected model when it opens, and back to the
  control after Escape or DONE. Arrow keys move through the models (up and
  down) and the levels (left and right); Tab moves through everything.
- MODEL section: one row per model, AUTO first. The selected row has the accent
  fill, dark text, and a text-colored border. POWER and SPEED bars sit on the
  right. THINKING section: the level buttons and the line under them.
- Footer: a "Use for new chats too" checkbox, checked by default, and DONE.
  Under it, one muted line: "Changes apply from your next message. Party agents
  you call keep the model set in their agent file."
- When the model changes in a chat that already has replies, one more muted
  line: "Switching models re-reads the whole chat, which uses more of your plan."
  The change is not blocked.
- Picking applies at once, and the control updates at once.

### The reply tag

- Each of Claude's replies shows a small tag above its text, and the dialogue
  box shows the same tag beside the speaker name: "<MODEL> · <LEVEL>", the model that
  answered (the exact model the SDK reports on the reply) and the level in force
  when the reply started. With AUTO the level reads AUTO.
- When Claude thought for at least 1 second before replying, the tag adds " ·
  THOUGHT <n>s". Thinking text is hidden by Claude Code by default, so only the
  time is shown.
- A reply loaded from a saved chat shows the model only: the saved chat keeps
  the model, not the level or the thinking time.

### Copy

Models:

- AUTO: "Claude Code's default model. Follows it when the default changes."
- opus: "Strongest. For hard bugs and big refactors. Uses plan limits fastest."
- sonnet: "Balanced. A good default for everyday coding."
- haiku: "Fastest and lightest. Small edits and quick questions."

Thinking:

- AUTO: "Claude Code's default thinking for this model."
- LOW: "Quick answers. Little thinking before it replies."
- MED: "Thinks through a normal task before acting."
- HIGH: "Plans carefully. Slower, better on tricky changes."
- XHIGH: "Thinks longer than HIGH on hard problems."
- MAX: "Thinks as long as it needs. Slowest and heaviest on limits."

## Chat themes

See `11-chat-themes.html` (the picker) and `8-chat-party.html` (the theme layer behind
the history and the stage, and the THEME button in the header). CHAT shows a
picture (pixel art or a bigger image) behind the history and the stage, under a stepped navy fade so
text stays easy to read. Themes show on CHAT only, not INBOX, AGENTS, or MASCOTS.

### Themes and where they live

- Tokyo Night is the only built-in theme. Its id is "tokyo-night". It is bundled
  with the app as a renderer asset (`src/renderer/src/assets/tokyo-night.png`), so it
  is in the installed build. It cannot be renamed or deleted.
- Uploaded themes live in `userData/themes/`: one image file per theme (PNG or JPG,
  as uploaded), named by a generated id plus its extension, and `themes.json` with
  `{ id, name, file, addedAt }` for each. Main never trusts a path or an id from the
  window without checking it against `themes.json`. The file is stored as is: nothing
  is resized or pixelated on import.
- A theme choice is `{ themeId, fade }`. `themeId` is "none", "tokyo-night", or an
  uploaded id. `fade` is 0 to 100 in steps of 10.
- settings.json holds `defaultTheme`, `{ themeId: "tokyo-night", fade: 60 }` until I
  save another. The current chat may hold its own choice in chats.json. With none,
  it uses `defaultTheme`. NEW CHAT starts with none.
- "THIS CHAT" changes the current conversation only. "ALL CHATS" changes the
  default, which NEW CHAT starts from.

### Uploads

Lenient on size and shape, unlike mascots and icons: PNG or JPG, any aspect ratio,
160x100 up to 6000x6000, 5 MB at most. The file is stored as is; nothing is resized or
pixelated on import. ADD THEME opens a file dialog filtered to PNG and JPG. Main reads
the file and checks, in order:

1. Not larger than 5 MB. Error: "Theme must be 5 MB or smaller."
2. A real PNG or JPEG (the file signature is checked, not the extension). Error: "Theme
   must be a PNG or JPG."
3. Dimensions, read with Electron's nativeImage. If the image cannot be read, the error
   from step 2. At least 160x100, else "Theme must be at least 160x100. <file name> is
   <w>x<h>." At most 6000 on each side, else "Theme must be 6000 px or smaller on each
   side. <file name> is <w>x<h>."

Errors show in the picker in the error style, under the ADD THEME tile, and clear on
the next attempt. A valid file is copied in and gets the file name without its
extension as its name, cut to 24 characters. It appears in the grid and becomes the
draft selection.

Uploaded themes can be renamed (1 to 24 characters, trimmed, not blank) and deleted.
Delete asks first, in the confirm dialog style: "Delete <name>? Chats using it go back
to the default." After a delete, a chat whose choice used that theme drops its own
choice and uses the default. If the default used it, the default becomes "none" with
the same fade.

### Drawing the theme

One ThemeBackdrop component draws it behind the CHAT history and stage frame and in
the picker's preview.

- Layers, back to front: the navy background (`--bg`), the image, the fade, then the
  content. Bubbles, tool cards, agent cards, the dialogue box, and the input row keep
  their solid fills. The plain lines in the history (notices, "Stopped.", errors) get
  the same navy fill, so they stay readable over the picture.
- Two scaling modes, chosen from the image's own size (iw by ih). Both are anchored to
  the bottom edge, and whatever does not fit is cropped by the frame:
  - Pixel art, when iw <= 640 and ih <= 640 (Tokyo Night is 320x200):
    `scale = max(1, ceil(max(width / iw, height / ih)))`, a whole number, where width
    and height are the frame's. The image is drawn at iw*scale by ih*scale, centered
    horizontally, its bottom edge on the frame's bottom edge, with
    `image-rendering: pixelated`.
  - Picture, when either side is over 640: `scale = max(width / iw, height / ih)`, not
    rounded, with smooth scaling, same anchoring.
  The frame is measured again whenever it resizes (ResizeObserver). The picker's tile
  thumbnails show the whole picture, anchored the same way, at a scale that fits the
  160x100 tile, and the preview uses the same rule as CHAT.
- The fade is five flat bands, top to bottom, at 0-14%, 14-28%, 28-42%, 42-56%, and
  56-100% of the frame's height. At fade S, band i has navy (`--bg`) at opacity
  `min(0.95, base[i] * S / 60)`, with base 0.9, 0.8, 0.7, 0.6, 0.55. So 60 matches the
  mockup, 0 shows the image as it is, and 100 nearly hides it. No smooth gradient.
- themeId "none": the plain frame, no image, no fade.
- The image is decorative: empty alt, `aria-hidden`.
- If the image fails to load, it draws as "none" and logs one warning.

### The THEME button

In the CHAT header, before NEW CHAT: "THEME: <NAME IN CAPITALS>" with a 12px swatch
before it (the accent color for a theme; `--bg` with a `--line` border for none). It
opens the picker. It works during a run.

### The picker

A modal dialog over CHAT.

- It opens with a draft equal to the chat's current choice, and APPLY TO set to THIS
  CHAT if the chat has its own choice, else ALL CHATS.
- Left: a grid of tiles. None first, then Tokyo Night, then the uploads oldest first,
  then the ADD THEME tile, then the FORMAT box. The FORMAT box reads: "PNG or JPG,
  160x100 to 6000x6000, up to 5 MB, any shape. Small pixel art keeps crisp pixels;
  bigger pictures scale smoothly. Anchored to the bottom edge." Tiles are radio inputs
  in a fieldset with the legend "Theme", so the arrow keys move between them. A tile
  shows a 160x100 thumbnail, the name, and "Built-in" or "Uploaded" ("Plain navy" for
  None). The draft selection has the selected look (a `--text` border and a hard
  `--accent` shadow). The theme in use has the ACTIVE tag. The selected uploaded tile
  shows RENAME and DELETE buttons. If the grid does not fit, it scrolls inside its
  column.
- Right: PREVIEW, a ThemeBackdrop with two sample bubbles, showing the draft theme and
  fade live. Under it, the FADE STRENGTH slider (0 to 100, step 10, its value shown as
  a percent), then APPLY TO with THIS CHAT and ALL CHATS.
- APPLY: THIS CHAT saves the draft as the chat's own choice. ALL CHATS saves it as
  `defaultTheme` and clears the chat's own choice. Then the dialog closes and CHAT
  shows the new theme at once.
- CANCEL, Escape, and a click on the backdrop close without saving. Uploads, renames,
  and deletes are saved when made, even if I cancel.
- Focus moves into the dialog on open, stays inside while it is open, and returns to
  the THEME button on close. At the minimum window size (960x600) the whole dialog fits,
  and the grid scrolls if needed.

## Composer

The CHAT input is one bordered box, called the composer. It holds the text I type,
the paste chips (text and images), and a toolbar with the model control, the agent chip, and the
SEND and STOP buttons. Nothing else in CHAT sits beside it on the same row.

### Structure

- `.composer` is the box. It has the border, the fill, and the shadow.
- `.composer-attachments` holds the paste chips. It is there only when there are chips.
- A visually hidden `<label>` and the `<textarea>`.
- `.composer-toolbar`, in DOM order: ModelPicker, AgentChip (only while an agent is
  called), `.spacer`, STOP, SEND. The meta and the hint sit inside `.spacer`.

### Layout

- `.composer` is a flex column with the `bg` fill, a 3px `line` border, and the
  `4px 4px 0` hard shadow in `shadow` that the other panels use. Corners are square.
  It sets `container-type: inline-size`.
- `.composer:focus-within` turns the border `accent`.
- A click on the empty part of the box (padding, toolbar gaps) puts the cursor in the
  textarea.
- The textarea has no outline of its own.
- The box never sets `overflow`, so the picker popover can open above it. Only the
  textarea scrolls.
- Textarea: full width, no border, transparent background, `resize: none`. IBM Plex
  Mono 14px with a 22px line height, padding `14px 16px 6px`. It is at least 44px
  tall (one line) and at most 240px (10 lines). Past that it scrolls inside, with its
  scrollbar styled like the other scrolling panels.
- `overflow-wrap: anywhere` and `white-space: pre-wrap` let long paths and log lines
  wrap, so they never widen the box.
- It grows with its text through `field-sizing: content`. Electron's Chrome is 152,
  which supports it.
- `.composer-toolbar`: flex, centered, 8px gap, padding `6px 8px 8px`. Its height never
  changes. `.spacer` is `flex: 1` with `min-width: 0`. It holds the meta and the hint,
  and each of them shows only when it fits whole.
- ModelPicker and AgentChip keep their behavior from steps 10 and 7. They are restyled
  as toolbar chips: 36px tall, 2px border, `panel` fill, Press Start 2P 12px. A label
  that does not fit is cut with an ellipsis. It never wraps.
- The ModelPicker's caret is `^` when the picker is closed (it opens upward) and `v`
  when it is open. Its `title` holds its full text.
- The AgentChip's `title` holds the agent's name.
- STOP and SEND: 36px tall, padding `0 14px`, Press Start 2P 13px, `flex: none`.
  - SEND with text: `accent` fill, dark text (`bg`), `3px 3px 0` hard shadow in `shadow`.
  - SEND with nothing to send: transparent, `muted` text, `line` border, disabled.
  - STOP: transparent, `error` text and border. It is a text button reading "STOP".
    During a run it sits left of SEND, and both show side by side.
- meta: when the message has more than 3 lines, "<n> LINES" in Press Start 2P 11px,
  `muted`. Lines are split by newline in the text, not by wrapping. It needs room for
  its digits, so a very long count may not show.
- hint: "⏎ send · ⇧⏎ newline" in IBM Plex Mono 11px, `muted` (see Sizes that differ
  from the shape rules). It shows only when the message has 3 lines or fewer, the
  composer is a box of 520px or more (see Narrow), and there are 136px free in
  `.spacer`. It is hidden from screen readers.
- The picker popover opens above the composer. Its height limit follows the composer's
  height, so it is fully visible at 1 line and at 10 lines.
- Chat column: the frame (history and stage) takes the leftover height. It is never
  shorter than the stage needs: the mascot, the dialogue box, and the frame's padding
  and border. The history gives up height first, and may shrink to nothing (it scrolls).
  The composer gives up last, through its textarea, which scrolls sooner on a short
  window. The page never scrolls, and SEND is never pushed out of view. At 960x600 the
  textarea shows about 6 lines. 10 lines need a window about 680px tall or more.

### Narrow

"Narrow" means the composer is narrower than 520px, measured as its outer width,
including its two 3px borders. The container query on `.composer` reads the content
box, which is 6px less, so the switch happens at 514px of content.

When the composer is narrow (a container query on `.composer`):

- ModelPicker shows only its thinking meter and caret.
- AgentChip shows only its avatar and its remove button. The remove button stays, so
  an agent can still be uncalled from the composer.
- The hint is hidden.

ModelPicker also shows only its meter and caret when an agent is called, a run is going,
and the composer is 760px or narrower.

Both chips keep their full names in `aria-label` at every width:

- The model control reads "Model: <model name> · THINK <level>". Its visible text is
  part of that name, so a voice-control user can say what they see.
- The agent chip is a group that reads "Agent: <name>". Its remove button keeps
  "Stop calling <name>".

Example: with the party panel open at the minimum window (960x600), the composer is
436px wide, so it is narrow. With the panel collapsed to the rail, it is 616px, so it
is wide.

### Keyboard and focus

- Enter sends. Shift+Enter adds a new line. Enter during IME composition does nothing.
- Enter on the picker's checkbox does nothing. It never sends the draft.
- Tab order follows the DOM: the paste chips' remove buttons come first, since the
  chips sit above the textarea. Then the textarea, model picker, the agent chip's remove
  button (only while an agent is called), STOP (while running), then SEND. No positive
  `tabindex` anywhere.
- Every toolbar button has a focus-visible outline: 2px, `text` color, 2px offset.
- After send and after NEW CHAT, focus goes to the textarea, and the textarea is one
  line tall again.
- When the model picker closes with Escape or DONE, focus goes back to the picker's
  control, not to the textarea.
- Removing the agent chip puts focus in the textarea.

### Screen readers

- The textarea is described by a hidden sentence: "Enter sends. Shift plus Enter adds
  a line." The visual hint is hidden from screen readers.
- The paste chips are in a list labelled "Pasted attachments".
- Each chip's visual text is hidden from screen readers. Its remove button is described
  by a hidden sentence, for example "Pasted text, 30 lines, 200 B" or "Pasted image,
  64x48, 6.3 KB".
- The X glyphs on the chips and on the agent chip are hidden from screen readers. Their
  buttons keep "Remove pasted text", "Remove pasted image", and "Stop calling <name>".
- A polite status line announces: "Pasted text added, <n> lines", "Pasted text
  removed", "Pasted image added, <w>x<h>", "<n> pasted images added" (several in one
  paste), and "Pasted image removed".

### Large paste

- A paste of more than 20 lines or more than 2,000 characters does not go into the
  textarea. It becomes a chip in `.composer-attachments`: padding `10px 10px 0`, chips
  in a wrapping row with an 8px gap.
- Each chip has a file icon, "PASTED" in Press Start 2P 11px, then "<n> lines · <size>"
  in `muted`, then a remove button with aria-label "Remove pasted text". A single line
  reads "1 line". Example: "PASTED 45 lines · 1.4 KB".
- Size is shown as B, KB with one decimal, or MB (for example "812 B" or "1.4 KB").
  It is the UTF-8 byte size.
- Lines are counted by newline. CRLF counts as one newline, and one trailing newline
  is ignored.
- Ctrl+Shift+V (Cmd+Shift+V on macOS) pastes into the textarea as usual, whatever the
  size. It counts only if the V key went down within the last second. The V key is
  matched by its physical key, so other keyboard layouts work. Blur clears that.
- Several pastes make several chips, in paste order.
- SEND is enabled when the textarea has text, or there is at least one text chip or
  image chip (see Pasted images).
- On send, the message is the typed text. Then, for each chip, a blank line and the
  pasted text in a fenced code block. The fence is longer than any run of backticks
  in the pasted text, and at least three backticks. Chips are cleared after send. The
  history draws the fenced blocks as code boxes (see Markdown). If the typed text ends
  inside an unclosed code fence, the message closes it before the first pasted block,
  so a pasted block is never swallowed by it.

````
Why does this fail?

```
Error: port 5173 is in use
```
````

- Chips are not saved if the app closes before send.
- The composer resets when the project changes, so a draft and its chips never cross
  projects.

### Pasted images

- When the clipboard holds an image and no plain text, the image becomes a chip in
  `.composer-attachments`, in paste order with the text chips. An image can come from
  a screenshot, "Copy image" in a browser, or an image file copied in the file manager.
- If the clipboard holds any non-empty plain text, even only whitespace, the text wins
  and the image is ignored. For example, a copy from a spreadsheet or a document carries
  a picture of the cells, and that picture is not attached.
- Only files the clipboard claims as images are tried. Then the file signature is
  checked.
- Ctrl+Shift+V (Cmd+Shift+V on macOS) never attaches images.
- Dragging and dropping files is not supported.

Chip:

- An image chip is the same size and style as a text chip (see Large paste), with:
  - a 24x24 thumbnail of the image, including its 2px `line` border, on a `bg` fill,
    scaled to fit and centered, smooth scaling, and no rounded corners;
  - "IMAGE" in Press Start 2P 11px;
  - "<w>x<h> · <size>" in `muted`, for example "1280x720 · 312.4 KB". Size is B, KB
    with one decimal, or MB;
  - a remove button with aria-label "Remove pasted image".
- Removing a chip puts focus back in the textarea.

Limits:

- Formats: PNG, JPG, GIF, or WebP. The file signature is checked in main, never the
  claimed type.
- 5 MB at most per image, 8000 px at most on each side, 5 images at most per message,
  and 20 MB in total per message. The total cap exists because five 5 MB images would
  go over the API's request size.
- Main checks each image in paste order, using items 1 to 4 for each one. Then it
  checks the count (5) and the total (6). The first failure is the error:
  1. Not larger than 5 MB. Error: "Image must be 5 MB or smaller. This one is <size>."
  2. A real PNG, JPEG, GIF, or WebP whose header can be read. Error: "Image must be a
     PNG, JPG, GIF, or WebP."
  3. At most 8000 px on each side. Error: "Image must be 8000 px or smaller on each
     side. This one is <w>x<h>."
  4. The browser can decode it. A damaged or truncated image that has a valid header
     gets the same error as item 2: "Image must be a PNG, JPG, GIF, or WebP."
  5. At most 5 images. Error: "A message can hold up to 5 images."
  6. The images together are 20 MB or smaller. Error: "Images in one message must be
     20 MB or smaller together. These are <size>."
- The sizes in items 1 and 6 are rounded up to the next 0.1 MB, so the number shown
  always exceeds the limit shown. Examples: "Image must be 5 MB or smaller. This one is
  5.1 MB." and "Images in one message must be 20 MB or smaller together. These are
  20.1 MB." The chips still show the normal size, for example "312.4 KB".
- A paste with one failing image still adds the other images that pass, up to the
  limits. The first failure is the one shown.
- Files are not read once the count is full, so a paste of many files never reads more
  than it can attach. A file the clipboard says is over 5 MB is refused without being
  read.
- The error shows in the error color, with `role="alert"`, right under the chips. In a
  narrow box it wraps to two lines and is never cut off. While an error shows, the chips
  area is about 1.5 rows tall, so the page never scrolls. It clears when the next paste
  is accepted, when a small text paste is accepted, when a chip is removed, or on send.
- Main checks every image again before anything is sent, so a message is never sent
  with an image that fails.

Send:

- SEND is enabled when the textarea has text, or there is at least one text chip or
  image chip. An image on its own is a valid message.
- On send, the typed text and the pasted-text blocks go as one text part (as in Large
  paste). The images go with it, in paste order, as image parts.
- The images are sent to Claude, so they use my Claude plan like any other message.
- Chips are cleared after send. The app writes nothing to disk. The image lives in
  memory until it is sent, and is not saved if the app closes before send.
- Claude Code keeps its own session transcript, which contains the images like any
  other message. So an image with a secret in it stays in that transcript.

History:

- My message shows its images as thumbnails above its text. Each is at most 160px wide
  and 120px tall, scaled to fit, with a 2px `muted` border, `image-rendering` smooth, and
  the alt text "Pasted image". Thumbnails are not clickable. The border is `muted`, not
  `line`, because the bubble is filled with `line` and a `line` border would vanish.
- A pasted code block uses the same `muted` border.
- A bubble with a code box may use the full row width. Its code is at most 220px tall
  and scrolls inside.
- The history's scrollbar is thin, with 4px of right padding.
- The app frees an image's memory when its message leaves the conversation (NEW CHAT
  or a project change).
- Thumbnails are kept only while the app is open. A conversation loaded from a saved
  session shows a line "<n> image attached" or "<n> images attached" in the text color
  instead, because the app does not read the images back.
- An image-only message shows no text line.
- If the message was queued (sent during a run), the QUEUED word shows as it does for
  any message.

Screen readers:

- A chip's thumbnail is decorative (empty alt). The chip's visual text is hidden from
  screen readers, and its remove button is described by "Pasted image, <w>x<h>, <size>",
  for example "Pasted image, 64x48, 6.3 KB". The status announcements are listed under
  Screen readers in Composer.

### Sizes that differ from the shape rules

The composer is the one place that breaks these rules:

- Its border is 3px, not 4px.
- Its toolbar controls are 36px tall, not 44px.
- The remove button on each paste chip and the agent chip's X are 32px, not 44px.
- The hint is IBM Plex Mono 11px. The type rule sets 12px as the smallest mono text.

This is a deliberate exception for the composer only. The textarea itself is at least 44px.

## Title bar

See `12-title-bar.html`. The main window has no system title bar. The app draws its own,
once, at the very top of the app shell across the full width, above the sidebar and the
screens. The rest of the app fills the space below it, and nothing scrolls under it. The
popup notification window is not changed.

### Platforms

- Windows and Linux: the window is frameless (`frame: false`), still resizable, with its
  minimum size (960x600) unchanged. The bar draws three window buttons. The trade-off is
  that Windows 11's Snap Layouts menu (hovering Maximize) is gone. Win+Z, Win+arrows, and
  dragging to a screen edge still work. Windows resizes a frameless window from its outer
  edge, just outside the visible border.
- macOS: `titleBarStyle: 'hiddenInset'`. Apple's red, yellow, and green buttons stay. The
  bar leaves 78px clear at its left for them and does not draw its three buttons.
- The window's buttons act through a window IPC group: minimize, toggleMaximize, close,
  getState, and a state event. Each command acts only on the window that sent it. Close
  calls `win.close()`, so it does exactly what closing the window does anywhere else.
  Main sends the state on maximize, unmaximize, enter and leave full screen, focus, and
  blur.

### The bar

- 36px tall plus a 4px `--line` bottom border (40px in all). Fill `--panel`.
- Left to right: the app icon, the app name, a 4x16 `--line` divider, the breadcrumb, an
  empty flexible gap, the status pills, then the window buttons.
- App icon: the pixel icon (the cloud with a face), 16x12 at 1x with crisp edges. It is
  drawn from the same grid as `scripts/make-icon.mjs`; keep the two the same. Decorative:
  `aria-hidden`.
- App name: MYA, Press Start 2P, 10px, `--accent`.
- Breadcrumb: 12px, `--muted`, one line, an ellipsis when it does not fit. The screen name
  in capitals, then " / " and the item in view in `--text`. On CHAT: "<chat title> in
  <project>", with only the title in `--text`: the same title (the speaker name) and project
  the CHAT header shows. On INBOX with a thread open: that thread's title, the heading its
  detail shows. Anywhere else the screen name alone.
- Below 1100px of window width: the breadcrumb shows only the item in view (or the screen
  name), and the pills show only their counts.
- Text in the bar cannot be selected.

### Window not focused

The bar's fill is `--bg`, and every text, icon, glyph, and pill turns `--muted` (pill
borders `--line`, as in the mockup). A filled WAITING pill dims with the rest.

### Status pills

- RUNNING counts the threads (tasks) with status running, WAITING the threads waiting for
  approval, both read from the inbox. The main conversation's own run or approval is not
  counted: CHAT shows that itself. A pill shows only when its count is above 0.
- 24px tall, a 2px border in the status color (`--running` or `--waiting`), `--bg` fill,
  an 8x8 dot in the status color, and "<n> RUNNING" or "<n> WAITING" in Press Start 2P 8px.
  Compact pills (see above) keep an aria-label such as "2 waiting".
- WAITING is filled (`--waiting` fill, `--bg` text and dot) while any thread started
  waiting after the last time INBOX was opened: a thread that was in another status in the
  previous list, or one that started after the app began watching. Opening INBOX clears it,
  and a thread that starts waiting while INBOX is open does not fill it. The first list,
  and threads that were already there (after switching project), never fill it. It is kept
  in memory only: after a restart it starts unfilled.
- Clicking a pill opens INBOX. INBOX has no status filter, so it opens as it is.

### Window buttons (Windows and Linux)

- Three real buttons, 46x36, with aria-labels "Minimize", "Maximize" or "Restore", and
  "Close". Maximize shows the restore glyph and label while the window is maximized or full
  screen.
- Glyphs are 12x12 inline SVGs with 2px strokes, `shape-rendering: crispEdges`, filled with
  `currentColor`. No anti-aliasing.
- Rest: no fill, `--text` glyph. Hover: `--line` fill; Close uses `--error` fill and a
  `--bg` glyph. Pressed: Minimize and Maximize use `--bg` fill and an `--accent` glyph,
  Close keeps the red; the glyph moves down 2px. Keyboard focus: a 2px `--accent` outline,
  inset 6px.
- No transitions and no rounded corners.

### Dragging

- The bar is a drag region (`-webkit-app-region: drag`). The pills and the window buttons
  are `no-drag`, and so is anything else clickable that is added to the bar.
- Double-clicking an empty part of the bar maximizes or restores the window. Windows does
  this by itself for a drag region. Linux may not, so there the bar asks main to do it
  (`toggleMaximize` from a double-click), and main ignores the request if the window
  changed size in the last 400ms, so a system that already did it is not undone.

### Dialogs and the sidebar

- A dialog's backdrop starts below the bar, so the window buttons stay usable while a
  dialog is open. Sizes that follow the window height subtract the bar's height
  (`--titlebar-height`).
- The sidebar no longer shows the app name, since the bar does. Its nav order and focus
  order are unchanged. Tab reaches the bar's pills and buttons first, as it would an
  operating system title bar.

## Account and usage

See `13-account.html` and `13b-account-states.html`. ACCOUNT shows who the agents run as
and how much of the plan's session (5 hour) and weekly (7 day) limits is used. It has no
nav button: the meter at the bottom of the sidebar opens it, and the title bar shows
ACCOUNT as the screen name. The mockups and the app both say "Mya".

### Where the numbers come from

- The account is the SDK's `accountInfo()`, asked through a query with no message in it:
  Claude Code answers from its start-up information, nothing is sent to a model, and
  nothing is used from the plan. It is read at app start, whenever a run starts (from that
  run's own query), and on CHECK AGAIN. The email goes to the window and is never logged.
- Usage is never asked for. It comes from the `rate_limit_event` messages every run
  already streams, caught in the one message loop in `agent.ts`. Nothing is requested to
  refresh it, so looking at it costs nothing.
- One event can carry both windows. The per-window block (`unifiedWindows`) is used when
  present; it is marked `@internal` and is not in the SDK's type file. Otherwise the
  event's own fields count when `rateLimitType` names the window. Per-model weekly limits
  and extra usage are ignored.
- `utilization` is a fraction of the window: 0.52 is 52%, and a value past 1 stops at
  100. `resetsAt` arrives in epoch seconds and is kept in milliseconds. A percent is never
  estimated: no number, no percent.
- The latest value of each window is saved in `userData/usage.json`, so it is back after a
  restart, with a short fingerprint of the email (not the email). Another account signing
  in drops the numbers that belonged to the last one.
- A window whose reset time has passed counts as reset and shows as "no percent yet"
  until a new event arrives.

### The account panel

- EMAIL, PLAN as a badge, SIGNED IN WITH, then the note about switching accounts (run
  `claude` in a terminal, use `/login`; the app picks the new account up on its next run).
  Switching accounts stays in the terminal.
- PLAN is the subscription type without "Claude ", in capitals: PRO, MAX. Missing, or
  something that does not look like a plan (an API account reports "Claude API"), shows
  "Claude plan". SIGNED IN WITH is "Claude Code login", or "API key (<source>)".
- Not signed in: "Not signed in to Claude Code, so agents can't run.", the three steps,
  and CHECK AGAIN. The USAGE panel and the legend are hidden. After CHECK AGAIN the panel
  says "Still not signed in." (read out as a status), or moves focus to the heading once
  the sign-in is found and the button is gone.
- API key (or another provider): SIGNED IN WITH and PLAN ("Claude Console") and the note
  that limits do not apply. The USAGE panel and the legend are hidden. Runs that use an API
  key are already refused (the `api_key_in_use` check in `agent.ts`); this only says so.
- Claude Code could not be asked: "Couldn't read the account from Claude Code." and CHECK
  AGAIN. Not in the mockups; the sign-in steps would be wrong here.

### The bars

20 segments, 5% each, 2px gaps, 16px tall on the screen; 10 segments, 10px tall in the
sidebar. Empty segments are a 2px solid `--line` border. No gradients, no transitions.
Each row is a group with an aria-label such as "Session (5 hr): 52 percent used"; the bar
itself is `aria-hidden`.

| Row | Bar | Value (screen / sidebar) |
| --- | --- | --- |
| Percent known | round(percent / 5) segments (round(percent / 10) in the sidebar). `--accent` under 80, `--waiting` 80 to 99, `--error` at 100 | `52%`, in `--text`, `--waiting`, or `--error` |
| Status `rejected` | all segments `--error`, even with no percent | `100%` in `--error` |
| No percent, `allowed_warning` | 16 of 20 (8 of 10) `--waiting` | `NEAR LIMIT` / `80%+` in `--waiting` |
| No percent, `allowed` | no fill, dashed `--line` segments | `UNDER 80%` / `--` in `--muted` |
| Nothing yet, or reset | no fill, dashed `--line` segments | `--` in `--muted` |

- Under each bar: "Resets at 7:30 PM, in 2 h 18 min" when it resets today, else "Resets
  Mon, Nov 16, 8:00 AM", in local time. The relative part updates every minute and when the
  window is focused. With nothing yet it says "Updates after a reply."
- Footer of the USAGE panel: "Updated after each reply. Last update 2 min ago.", or "No
  usage reported yet. Updates after a reply." With a row that has no percent, "Last update"
  follows the note "Claude Code reports exact percentages only near a limit. The reset
  times are exact." Claude Code sends an event when a window's whole percent, reset time,
  or status changes, so "Last update" is the last change.
- The legend under the panels: Under 80% (`--accent`), 80% and up (`--waiting`), Limit
  reached (`--error`).
- A window at its limit puts a red alert box (`role="alert"`) at the top of the USAGE
  panel: "Session limit reached. Agents can't start new replies until <time>." or "Weekly
  limit reached...", the time in bold. The time is the clock when it is today, else the day
  and the clock. How runs handle a limit is not changed. A window's own status decides, so
  with extra usage turned on the box can show while replies still go through.
- VIEW DETAILS ON CLAUDE.AI > is a button styled as a link. It asks main to open
  `https://claude.ai/settings/usage` in the default browser; main opens that one address.

### The sidebar meter

- At the bottom of the sidebar, under the project name, on every screen. One button:
  `--bg` fill, 4px `--line` border; with ACCOUNT open, a `--text` border and the hard
  shadow, and `aria-current="page"`. Inside: ACCOUNT in `--accent` (8px), then a 5H row
  and a 7D row with the 10-segment bars and their values.
- Under the bars: "Session resets 7:30 PM" for a window at its limit (the day and the
  clock when it is not today), or "Updates after a reply" while no row has a percent.
- Signed out: "Not signed in" instead of the bars. API key: "API key".
- aria-label such as "Account. Session 52 percent used, weekly 61 percent used."
- The sidebar is 200px wide (it was 176px) so the bars have room.

### Seeing each state

Start an unpackaged app (`npm start`) with `MYA_ACCOUNT_FIXTURE` set to one of: normal,
warning, limit, nopercent, nearnopercent, nothing, reset, signedout, apikey, unreadable.
Real reads and real events are ignored, and `usage.json` is not written, while it is set.
A packaged app ignores it.

## Markdown

Claude's replies and the agents' reports arrive as Markdown. The app renders
them in its own look with one component (`components/Markdown.tsx` and
`Markdown.css`). Every style sits under `.md` and uses the tokens only. The
stored text never changes: tasks.json and the saved session keep the source.

### Where it is rendered

- CHAT: Claude's reply, in the dialogue box while it types and in the history,
  including history loaded from a saved session.
- INBOX task detail: TASK (what Claude asked the agent), and REPORT when the
  task ended as done.
- CHAT: fenced code blocks in my own messages (the Composer turns a large paste into one).

### Where it is not

These stay plain text, character for character:

- My own messages, except fenced code blocks (three backticks, the code, three
  backticks), which are drawn as a code box like the ones in a reply, with a `muted` border and COPY. Everything else in them stays plain text,
  character for character.
- Tool card labels and activity lines ("Finding **/*.{test,spec}.*" keeps its
  asterisks).
- Request details, on CHAT, in INBOX, and in the popup.
- The report of a task that ended as error or stopped, error messages,
  notices, and every text the app itself writes.
- Agent descriptions in the party panel and on AGENTS, and the agent editor.

### Previews

`toPlainText` (src/shared/plainText.ts) turns Markdown into plain text with
one line per block: no heading, bold, italic, code, list, quote, or table
marks, a link's text and an image's alt text kept, and the harness note left
out. It is used for the INBOX row preview of a done task (then cut at 80
characters), the first three lines of a done report on the agent card, the
popup's first lines, and the screen-reader announcement of a reply. Activity
lines and "Waiting: <label>" are not Markdown and do not go through it.

### Look

- Body: IBM Plex Mono 13px, line height 1.6, 12px between blocks. In the
  INBOX detail a line of text is at most about 78 characters; code boxes and
  tables use the full width.
- Headings: Press Start 2P in the accent color, never bigger than the
  screen's section labels: levels 1 and 2 at 9px with a 2px line under them,
  level 3 at 8px with no line. Levels 4 to 6 are the body font in bold. More
  space above a heading (20px) than under it (8px).
- A paragraph that is only one bold run ("**Summary**") is drawn as a level 3
  heading.
- Bold: weight 600 in the text color. Italic: italic. Strikethrough: a line
  through, in muted.
- Lists: a 6px accent square for bullets, accent numbers, 6px between items,
  nested lists indented 20px. Task list items show a drawn pixel box, empty or
  filled; it is not an input and cannot be clicked.
- Inline code: the same font on raised, 1px line border, 4px side padding.
  Long paths wrap anywhere.
- Code blocks: a box with a 2px line border on bg. Lines do not wrap; the box
  scrolls sideways inside itself. The language, when named, is a small muted
  label at the top left. COPY at the top right copies exactly the code and
  reads COPIED for 1.5 seconds (COPY FAILED if the clipboard refuses). No
  syntax colors.
- Quotes: a 4px line bar on the left and muted text.
- Tables: 2px line borders on every cell, the header row bold on raised,
  6px 10px cell padding, sideways scrolling inside the table's own wrapper.
- A rule (---) is a 2px dashed line.
- Links: accent, underlined, with the app's focus ring.
- Nothing in the component is animated. At 960x600 nothing rendered makes the
  screen scroll sideways.

### Typing out

- The dialogue box keeps its speed, skip, reduced motion, size, scrolling, and
  the mascot's TALKING timing. It counts the visible characters of the
  rendered text, not the source: Markdown marks never show while typing.
- Structure appears with its first character: a bullet with the first letter
  of its item, a heading already in its heading look, a code box with its
  first character. A table appears whole. The cursor sits after the last
  character shown.
- While a reply streams, its last block can be unfinished: an unclosed code
  fence shows as a growing code box, and an unclosed ** or backtick may show as
  written until its closing mark arrives.
- Finished blocks are parsed once. Only the last block is parsed again when
  new text arrives, and a typing tick never parses. A reply with link
  reference or footnote definitions is parsed whole once the run ends, so it
  matches the history exactly.
- Loaded history, TASK, and REPORT appear at once and never type.

### Harness note

Claude Code's harness can put a note in square brackets in front of an
agent's report, for example "[harness: subagent output matched
instruction-shaped pattern(s): ...]". It is not in the SDK's docs; it comes
from the bundled Claude Code, which writes it as the report's own first block.

- When a done report's first block starts with "[harness:" and ends with "]",
  it is taken out of the body and shown above the report: the label HARNESS
  NOTE in the waiting color and a SHOW button, which becomes HIDE. Opened, it
  shows the whole note as plain text. It starts closed and is never dropped.
- A first block of any other shape stays in the body.
- Nothing the note describes is undone: "<\" stays "<\".

### Safety

The text comes from a model and can hold anything.

- No raw HTML: HTML in the text shows as text. No HTML plugin, and never
  `dangerouslySetInnerHTML`.
- Only http and https become links; every other address (javascript:, file:,
  relative links, file paths, in-page anchors) shows its text as plain text.
  Each link shows its full address as its title and opens in the system
  browser. Main stops any navigation of the app window and opens only http
  and https outside.
- Images are never loaded and no img element is made. An image with an http
  or https address shows as a link reading "[image: <alt text>]"; any other
  image shows its alt text.

## Agent icons

- PNG, square, 16x16 to 32x32. Reject anything else: "Icon must be a square
  PNG from 16x16 to 32x32." Do not auto-resize.
- Displayed at 16px (chips, bubbles), 32px (inbox rows), 40px (the QUEST CLEAR
  card), 48px (cards, headers), 64px (edit form preview), or 80px (the status
  sheet), whatever the source size.
- Agents without an icon get the default question-mark icon.
- The icons in the mockups are placeholders drawn as inline SVG.

## Popup notification

- Small frameless, always-on-top window in the bottom-right screen corner.
- About 340px wide, 140px tall. The approval variant is taller to fit its buttons.
- Layout: mascot on the left, speech bubble on the right with the agent's
  icon and name in the bubble header.
- Border color follows the variant: text color for finished, waiting color
  for approval, error color for error.
- Approval variant has Approve, Deny, and Open buttons.
- An agent's finished popup with loot is 234px tall (plus its 6px shadow): under the
  mascot row, two lines: "+<a> −<r> lines" and "+<xp> XP" (with "LV UP!" when it leveled),
  then the first two item names (NEW marked) and "+<n> more". The bubble reads "<agent> got
  <n> items." (or "<agent> found <n> files." for a read-only quest). The bubble beside the
  128px mascot holds about 17 characters a line, so the loot needs its own row.
- Achievement variant (see Progression): `--waiting` border, 222px tall like a compact
  approval, EQUIP and LATER.

## Progression

Agents are party members I raise. Each agent file shows a class from its tools, a level,
and an XP bar. A task that ends as done shows a QUEST CLEAR card with what it changed and
the XP it earned. Achievements unlock titles and mascot accessories. All of it is
cosmetic: it never changes what an agent may do or how approvals work. The mockups are
on the canvas ("17. Party classes and levels", "17b. Quest clear loot", "17c.
Achievements"); there are no HTML files for them.

### Classes

A class comes from the agent file's `tools:` line. Nothing is stored for it. One function,
`classFor(tools)` in `src/shared/progression.ts`, is used by main and the window.

- Edit-type tools: Edit, Write, MultiEdit, NotebookEdit. Shell tools: Bash, PowerShell.
  Read-type: everything else. An entry such as `Bash(git:*)` counts by its tool name.
- tools is null (no tools line, inherits everything): HERO.
- has an edit-type tool and a shell tool: KNIGHT.
- has an edit-type tool and no shell tool: BUILDER.
- has a shell tool and no edit-type tool: MAGE.
- otherwise: SCOUT. An empty tools line, and a line of only MCP tools or Agent, are SCOUT.

Each class has a one-line reason for the tooltip, for example "Has Bash, no Edit or
Write" or "No tools line: inherits every tool".

| Class | Token | Color |
| --- | --- | --- |
| SCOUT | `--class-scout` | the accent |
| BUILDER | `--class-builder` | `--waiting` |
| MAGE | `--class-mage` | `#B98CF0` |
| KNIGHT | `--class-knight` | `#6FCF7F` |
| HERO | `--class-hero` | `--text` |

A badge is the class word in the pixel font, 7px in rows and 10px on the status sheet,
dark text (`--bg`) on the class color, padding 3px 5px. These class colors and
`--loot-add` (`#6FCF7F`) are the only new hex values.

### XP and levels

- `userData/progression.json`: `{ version: 1, agents, achievements, equipped, counters }`.
  Written through a temporary file and a rename. A missing or corrupt file starts empty; a
  bad file is kept aside as `progression.json.bad`. Nothing is written into agent files.
- agents is keyed by the agent file path, normalized exactly as the icon map normalizes
  it. Each entry: xp (total), questsByProject (`{ projectPath: count }`), toolUse
  (`{ toolName: count }`), itemsTotal, bossesDefeated, joinedAt (first time the entry was
  made).
- A global agent's path is the same in every project, so its XP is shared. A project
  agent's path includes its project, so it levels on its own. Agents that match no file
  (built-in ones such as general-purpose) earn nothing. The main conversation (the mascot)
  counts toward achievements but has no level.
- When AGENTS moves an agent (project to global or back), its entry moves with it, as the
  icon mapping does. Deleting an agent drops its entry. A file renamed outside the app
  starts again at level 1.
- Level from total XP: level 1 starts at 0. Going from level L to L+1 costs 100 + 50 * L
  XP. Cap at 99. One pure function `levelFor(xp)` returns `{ level, intoLevel, toNext }`
  (toNext is 0 at the cap).
- XP is earned when a task ends as done (never on error or stopped):
  - quest: 50
  - items: 5 per changed file, at most 50
  - read-only quest (no changed files): 2 per distinct file read, at most 20
  - clean: 25 when none of the task's tool calls failed and none of its requests were
    denied
  Step 18 adds a boss bonus through the same function (`xpFor`).
- The task's tool calls are counted into toolUse by name, 1 is added to questsByProject
  for the open project, and the item count is added to itemsTotal.

Example: a BUILDER that adds a line to notes.txt and creates todo.md with no errors earns
Quest +50 · 2 items +10 · No errors +25 = 85 XP.

### Loot

One pure function, `lootFor` in `src/main/loot.ts`, reads a finished task's own tool calls.
Git is never run. **The counts are approximate**: they come from the Edit and Write inputs,
so they are close but not exact. An Edit with `replace_all` counts once, and lines an edit
leaves unchanged count as both added and removed.

- Each Edit (and MultiEdit) adds to its file: + the line count of new_string, − the line
  count of old_string, per edit.
- Each Write adds + the line count of content. If the first call that touches a file in
  this task is a Write and that file did not exist when the task started, the item is NEW.
  The file is checked when the Write's tool call arrives, before the tool runs (Write waits
  for my approval).
- Only calls that ended as done count. Denied and failed calls do not.
- Lines are counted at newlines; one trailing newline is ignored; empty text is 0.
- Paths are shown relative to the project when inside it, with forward slashes.
- Items keep the order of first touch. The result: items `[{ path, added, removed, isNew }]`,
  plus for read-only quests the distinct files read (Read calls), and the XP lines.
- The loot and the XP lines are saved on the task in tasks.json when it ends, so a QUEST
  CLEAR card looks the same after a restart. The calls themselves stay in memory only.

### QUEST CLEAR card

When a task ends as done, its agent card in the CHAT history grows into the QUEST CLEAR
card. INBOX's task detail shows the same card above REPORT, at the detail's full width. A
built-in agent's task keeps the plain agent card (it earns no XP).

- Border 4px `--waiting` with the 6px 6px 0 hard shadow. Header: the agent icon at 40px,
  "QUEST CLEAR!" in the pixel font at 14px in `--waiting`, then "<agent> · <task label>"
  muted at 13px, and the class badge on the right (the class when the quest ended).
- ITEMS OBTAINED (pixel font 9px, accent) with "<n> items · +<a> −<r>" on the right (+ in
  `--loot-add`, − in `--error`). Then a bordered list on `--bg`, one row per item: a 16px
  pixel file icon (yellow with a plus for NEW, muted otherwise), the path, a NEW tag (pixel
  7px, `--waiting` fill) when new, then +added and −removed right-aligned. Show at most 8
  rows and "+<n> more" after that.
- A read-only quest shows FOUND instead of ITEMS OBTAINED: the files read, at most 8,
  muted, no counts.
- XP: "+<xp> XP" in the pixel font at 12px in `--waiting`, then the breakdown muted ("Quest
  +50 · 4 items +20 · No errors +25"). Under it "LV <n>", a 14px bar with the old fill in
  the accent and the gained part in `--waiting`, and "LV <n+1>". The bar shows the level the
  agent was in; a level up fills it to the end. If the task leveled the agent up, a banner
  in `--waiting` fill: "LEVEL UP! <AGENT> IS LV <n>".
- Buttons: VIEW CHANGES (opens the INBOX detail on ACTIVITY) and OPEN IN INBOX (CHAT only).
- The "agent reported back" popup gains the loot (see Popup notification).

### Party panel, rail, and AGENTS

- Each party row adds, under the name line: the class badge and the role, and on the name
  line "LV <n>" on the right (pixel 8px, muted). Under them a 6px XP bar (2px border, accent
  fill; on the called row, dark fill). Rows stay at least 56px tall. Hovering the badge
  shows the reason as a tooltip, and the detail area at the bottom of the panel adds
  "<CLASS> · <reason>" for the hovered, focused, or called member. A row's accessible name
  adds "<CLASS>, level <n>".
- Rail icons: the level as a small corner tag "<n>" in the pixel font at 7px (bottom right;
  the working marker keeps the top right). Their hover card adds the badge and level.
- Agent cards on AGENTS: badge, level, XP bar, and a STATUS button under CALL.
- STATUS opens the status sheet as a dialog (focus trap, Escape, focus returns): the icon
  at 80px, the name in the pixel font at 18px, the class badge, the model tag, "<role> ·
  project agent" or "global agent", LEVEL in big pixel digits in `--waiting`, a 20-segment
  XP bar with "<into> / <toNext>" and "<n> to LV <n+1>", SKILLS (the tools as chips, the
  class-deciding tools starred and in the class color, with the reason under them), and
  RECORD: Quests cleared (total, and "(<n> in this project)"), Bosses defeated, Most used
  skill ("Read ×214"), Joined the party (date).
- A built-in agent row (no file) shows no badge, level, or bar.

### Achievements

Definitions live in `src/shared/achievements.ts`. Each has id, name, description, hidden,
goal, and reward. Triggers are pure functions in `src/main/achievementRules.ts`.

| Achievement | Unlocks when | Goal | Reward |
| --- | --- | --- | --- |
| FIRST QUEST | a task ends as done | 1 | title "Rookie" |
| PARTY OF 5 | 5 or more agents in the party list at once | 5 | accessory party-hat |
| NIGHT OWL | a run or task ends as done between 02:00 and 04:59 local time | 1 | accessory nightcap |
| FLAWLESS | 10 tasks in a row end as done with the clean bonus. A task ending as error, or done without the clean bonus, resets the streak; stopped does not | 10 | title "Flawless" |
| FULL PARTY | every runnable agent in the party (one that can be called) has a task started in one local day; needs at least 2 | party size that day | title "Leader" |
| HOARDER | itemsTotal over all agents reaches 100 | 100 | accessory backpack |
| BOSS SLAYER | step 18 | 1 | accessory crown |
| SPEEDRUN (hidden) | a task ends as done less than 30 seconds after it started | 1 | title "Speedrunner" |
| SECOND WIND (hidden) | a task ends as done after at least one of its requests was denied | 1 | title "Persistent" |

- "Called" for FULL PARTY means a task started for that agent file, whether I called it
  from the party panel or Claude chose it.
- Each id keeps `{ unlockedAt, progress, seen }`, and counters keeps the streak, the day,
  the agents called that day, and the runnable party. They are checked after each task end,
  run end, task start, and party list load. An event that changes nothing is not saved.
  Unlocks are never taken back.
- Night Owl gives the nightcap. Theme rewards wait until there are more built-in themes.

### Accessories and titles

- `designs/accessories/` is copied into `src/renderer/src/assets/accessories/`. Nothing is
  loaded from `designs/` at runtime. Each accessory is a 16x16 PNG drawn over the mascot at
  its anchor (x, y in 64px frame pixels), at the mascot's scale, with `image-rendering:
  pixelated`, on every mascot in CHAT, the popup, the toast, and the mascot manager's cards.
- Anchors: party-hat, nightcap, and crown at (24, 0); backpack at (46, 46), on the default
  mascot's right shoulder (the default mascot is a portrait that fills the frame).
- equipped: `{ title, accessory }`, each null or one unlocked id. One of each at a time.
- The title shows under the mascot's state caption on CHAT, in the pixel font at 7px in
  `--waiting`, for example "ROOKIE".
- Accessories are drawn over custom mascots too; a hat may sit wrong on a custom mascot.

### ACHIEVEMENTS screen

A nav item ACHIEVEMENTS under MASCOTS, same NavItem look. It shows a red dot (8px,
`--error`) while there is an unlock I have not seen.

- Header: "ACHIEVEMENTS" (pixel 14px), "<n> of <total> unlocked" muted, and a segmented bar
  with one segment per achievement on the right. Border-bottom 4px `--line`.
- A grid, 3 columns at full width and 2 under 900px of content width, 16px gap. Each card:
  4px border, panel fill, 14px padding, a 40px pixel medal (ribbon in the accent, medal in
  `--waiting`, its own little mark per achievement), the name (pixel 9px), the date or "NEW
  · today", the description, and "Reward: <reward>" in `--waiting`.
- Unlocked cards: `--waiting` border. The newest unseen one gets a second outer ring
  (box-shadow 0 0 0 4px `--bg`, 0 0 0 8px `--waiting`).
- Locked cards: `--line` border, muted text, a grey medal, "<p> / <goal>" and an 8px
  progress bar.
- Hidden locked cards: dashed `--line` border on `--bg`, a "?" medal, "???", and "Hidden.
  Keep playing to find it." Their reward is not shown.
- Right column (340px): UNLOCKED REWARDS, one row per unlocked title or accessory with an
  ON/OFF toggle button (aria-pressed). Turning one on turns the other of its kind off. Under
  it one muted line: "Accessories are drawn over any mascot, so they work with custom ones
  too." Under 760px of content width (the smallest windows) the column moves under the
  grid, so the cards keep room.
- Opening the screen marks all unlocks seen. The cards that were unseen keep "NEW · today"
  and the ring while the screen stays open.

### Unlock notice

- App in front: a toast in the bottom-right of the main window, the same card as the popup
  below, for 8 seconds, hover pauses, one at a time. It never takes focus.
- App in the background: the popup's achievement variant, queued like a finished popup:
  `--waiting` border, the mascot (talking loop), "ACHIEVEMENT UNLOCKED" (pixel 8px,
  `--waiting`), the name, the reward, and EQUIP and LATER. EQUIP equips the reward. LATER
  closes. It follows every popup rule (never takes focus, the popups setting, the queue). An
  unlock still queued when the app comes to the front is dropped like any queued popup; the
  red dot still shows it.

## Boss battles

When an agent (or Claude itself) runs the project's tests and some fail, a boss appears
for that conversation. Its HP is the number of tests still not passing. Each later test
run deals one hit per test that now passes and heals the boss for each test that broke. A
full run with nothing failing defeats it. The fight only reads output the agent already
produced: it never runs a command, never changes what an agent may do, and costs no extra
usage. The mockups are on the canvas: "20. BOSS tab in the party panel" and "20b/20c/20d.
Battle view" (one per default boss). Only the HP rules of "18. Boss battle" carry over.
The screen that adds and edits bosses is "21. Boss manager": see Boss manager.

### Detecting a test run

- A Bash or PowerShell call, from the main conversation or inside an agent, whose command
  contains one of these as whole words: npm test, npm run test, pnpm test, pnpm run test,
  yarn test, npx jest, jest, npx vitest, vitest, node --test, pytest, python -m pytest, go
  test, cargo test, dotnet test, php artisan test, phpunit, vendor/bin/pest. A path before
  the runner counts (`node_modules/.bin/jest`); a dot after it does not (`jest.config.js`).
  Or the project's own test command (settings.json `testCommands[projectPath]`, matched as
  a substring), set in the BOSS tab's TEST COMMAND field.
- Read when its tool_result arrives with the call ended as done or failed. Denied,
  stopped, interrupted, and background calls are ignored.
- The exit code is the `Exit code N` first line Claude Code writes for a failed command;
  none means 0.
- Output over about 30 KB arrives as a 2 KB preview of its start and the path of a file in
  Claude Code's own `projects/<project>/<session>/tool-results/` folder. That file is read
  (only inside that folder, at most 5 MB). Without it the preview is all there is.
- The attacker is the task's agent when the call came from inside a task, otherwise the
  main speaker.

### Parsing

`parseTestRun(command, output, exitCode)` in `src/shared/testRuns.ts`, tested against real
output captured from scratch projects (`src/shared/fixtures/test-runs/`): Jest 30, Vitest
5, node:test (Node 24), pytest 9, dotnet test (xUnit), PHPUnit 13, and Pest 4. Go and
Cargo were not installed; their parsers follow the documented formats and are unverified.
php artisan test prints Pest's format.

- ANSI color codes and CR are stripped. ✓ ✔ √ pass; × ✕ ✗ ✘ ✖ ⨯ fail.
- The count of tests is passed + failed. Skipped (and todo, deselected) tests never count,
  so a filtered run never looks like the whole suite.
- Files: the test file (forward slashes), the test class for dotnet, PHPUnit, and Pest,
  the package for go.
- parsed: `full` when every failure is named, `summary` with counts only, `exit-code`
  when nothing parses (failed unknown; the exit code says pass or fail).
- Cut output: what is there is used, and a missing summary is never zero failures.

### HP and rounds

One fight per conversation (project path plus session id), in
`userData/boss-fights.json` (`{ version: 1, fights, past, lastBoss }`, written through a
temporary file and a rename; a missing or corrupt file starts empty and a bad one is kept
as `boss-fights.json.bad`). `past` keeps the fights the conversation finished, so their
notices and end cards stay in its history.

- Encounter: the first test run in a conversation with no active fight that has failures
  (or a non-zero exit with nothing parsed). maxHp is the count of tests (or the failures
  when that is unknown; 1 for an exit code alone), hp the failures, round 1.
- A full run: its count covers maxHp, or it is the same command that started the fight.
  Otherwise it is partial.
- Each later test run is a round:
  - Named output: per file in the run (every file the fight knows, for a full run), hits
    are the tests that were failing and are not now, heals the tests failing now that were
    not before. A full run that does not list a file counts it as passing.
  - Summary only, full run: hits = max(0, previous hp − failed), heals = max(0, failed −
    previous hp), unnamed.
  - Summary only, partial run: HP does not change.
  - Exit code only: nothing changes.
  - hp is the sum of every file's failures (a full run's own count). A full run with more
    tests grows maxHp.
  - Energy: 1 per hit for the attacker, full at 10.
- Victory: a full run with nothing failing and at least 1 test.
- Escape: the run ends (done, error, or STOP) while the fight is active with HP left. The
  next test run in the conversation, or FIGHT ON, brings the same boss, HP, and lineup
  back.
- NEW CHAT, a lost session, or a fresh-context restart removes the conversation's fight.
- XP: the final hit's agent gets maxHp × 5 XP, at most 500. Every agent in the lineup that
  landed a hit gets bossesDefeated + 1. The first victory unlocks BOSS SLAYER (the crown).

### Lineup

- At encounter: the attacker, then up to 3 other runnable party agents at random.
- A later attacker not in the lineup replaces the member with the least energy.
- 'main' is the main speaker, drawn with the mascot. A built-in agent is
  'builtin:<name>' and earns no XP.
- Cosmetic health starts full; the active member loses 5% on each heal, never below 40%.

### Packs

A boss is a name, an accent color, one idle loop, and an optional background. Nothing else
is drawn for it: the hit, the heal, and the defeat are effects the app draws the same way
for every boss (see Boss effects), so a pack has no other strips.

- The defaults (red-suite, flaky-golem, null-wraith) are copied from `designs/bosses/<id>/`
  (`manifest.json`, `idle.png`, `background.png`) into `src/renderer/src/assets/bosses/`.
  Nothing is loaded from designs/ at runtime. They cannot be edited or deleted, and they are
  never problem cards (one that failed to load would be a bug).
- Format 2: `manifest.json` `{ version: 2, name, accent ("#RRGGBB"), background (a file name
  or null), idle: { file, frames, fps } }`. Name 1 to 24 characters after trimming, no line
  breaks. Accent a `#RRGGBB` color (stored in capitals). Idle passes the sheet rules (see
  Mascots): PNG, 64 high, width a multiple of 64, at most 16 frames, under 3 MB; the frame
  count comes from the image, whatever the manifest says; fps a whole number from 1 to 30.
  Background, when set, passes the background rules below.
- Format 1 (the first packs: `version: 1`, `background` a file name, and a `states` object
  with one entry per strip, `idle` required) still loads. `states.idle` is the idle loop; any
  other entry is ignored and not checked. Its name may be up to 32 characters. A pack is never
  rewritten only to upgrade it: one saved in the boss editor is written as format 2.
- User packs: `userData/bosses/<uuid>/` holds `manifest.json`, `idle.png`, and
  `background.png` or `background.jpg` exactly as uploaded (byte for byte). A folder whose
  name is not a UUID is skipped and logged, because an id is checked to be a UUID or a
  built-in id before a path is built from it. The manager reads the folders each time its tab
  opens; a fight uses what was read last. A pack that fails a rule is a problem card in the
  manager and is never picked or drawn.
- Writing: a new pack is built in `.tmp-<uuid>/` and renamed into place, `manifest.json`
  last, so a half-written pack never appears (a leftover is removed at the next read). An
  update writes the new files through temporary files, then the manifest, then deletes the
  files the manifest no longer uses; removing the background deletes its file.
- Background rules, in this order; the first failure is the message:
  1. 5 MB or smaller: "Background must be 5 MB or smaller."
  2. A real PNG or JPEG by its first bytes, not its name: "Background must be a PNG or JPG."
  3. The size, read from the file's header first (so a small file that claims a huge picture
     is refused before anything is allocated) and then with nativeImage, whose size counts;
     an image nativeImage cannot read gets the message from rule 2. At least 320x180:
     "Background must be at least 320x180. <file> is <w>x<h>." At most 4000 on each side:
     "Background must be 4000 px or smaller on each side. <file> is <w>x<h>."
  Any aspect ratio. A background is never resized or converted on import.
- Drawing a background (the battle view, the manager's thumbnails, and the editor's
  preview; the BOSS tab shows none): the chat theme scaling rule (see Chat themes).
  Pixel art, both sides 640 or less, is scaled by whole numbers with `image-rendering:
  pixelated`; a bigger picture is scaled smoothly to cover. It is anchored to the bottom edge,
  centered across, and cropped to the frame, with no theme fade. A boss with no background
  has plain `--bg` behind it.
- The pool: `settings.json` `bossesOutOfPool` is a list of boss ids; a missing list means every
  boss is in. At encounter a boss is drawn uniformly at random from the valid bosses that are
  in the pool, leaving out the project's last boss when at least two are in. If no valid boss
  is in the pool, every valid boss is. Turning the last boss in the pool off is refused: "At
  least one boss stays in the pool." A deleted boss's id is removed from the list. The boss
  never changes for that fight.
- A boss that no longer exists: a fight keeps its HP, rounds, and log, and is drawn with
  The Red Suite's sprite, accent, and background. Its notices and end cards use the name it
  had: a fight saves `bossName` (an empty string for a fight saved before it was kept, which
  then reads as "The Red Suite"). The name is refreshed on every round while the boss exists,
  so a rename shows from the next round, and the lines already in the history keep the name
  they were written with.

### Boss effects

`BossSprite` draws a boss everywhere (the BOSS tab, the battle view, the rail button,
notices, end cards, the manager's cards, and the editor's preview): the idle loop through the
Mascot component, and three effects, the same for every boss, built-in or custom. They are
CSS on a wrapper, not art.

- Hit: the whole sprite is a pure white silhouette (`filter: brightness(0) invert(1)`, so
  transparent pixels stay transparent) and sits 1 source pixel (the scale in CSS pixels) to
  the right, for 120ms. The move is a layout offset (`left`), not a transform: a transform
  can blur one device pixel at fractional display scaling (measured here at 125%, 150%, and
  175%). A new hit during a flash restarts it.
- Heal: a flat `--loot-add` (#6FCF7F) silhouette for 160ms. It is an SVG color matrix in a
  data URL (`filter: url("data:image/svg+xml,...")`) that sends every pixel to that green and
  keeps its alpha, so the shape and the hard edges stay; a chain of CSS filters can only come
  near the color.
- Defeated: over 800ms, in 4 hard steps (`steps(4)`, no easing), the sprite sinks 4 source
  pixels, turns grayscale, and drops to 35% opacity. Then it holds that look and the loop
  stops on frame 0. A boss that is defeated when it first appears (a view opened later, an
  end card) shows that look at once, without the animation.
- Reduced motion: no flash, tint, move, or sinking. A defeated boss shows its final look at
  once. The editor's HIT frame is a picture, not an animation, so it stays white.
- Checked with the built app at scales 1 to 4 and display scaling 100%, 125%, and 150%: a
  hit is 2 colors (the page and white), a heal 2 (the page and #6FCF7F), and a defeated boss
  3 (the page and two grays), the same count as the plain sprite or fewer, so no edge is
  blended.
- The effects are exposed as props: `effect` (`{ kind: 'hit' | 'heal', id }`; a new id plays
  it again), `defeated`, `hold="hit"` (held white, for the editor), and `still` (frame 0). The
  round replay, the editor's TEST HIT, and the end cards all use them.

### BOSS tab

- The party panel's header is a tab bar: PARTY | BOSS (role tablist; each a tab button,
  40px tall, pixel font 8px, flex 1; arrow keys move between them), then the collapse
  button (40px square). Selected PARTY: accent fill, dark text, 4px `--text` border.
  Selected BOSS: `--error` fill, dark text, 4px `--text` border. Unselected: `--bg` fill,
  4px `--line` border. While a fight is active and PARTY is selected, BOSS shows a 6px
  `--error` dot after its label. The agent count moves into the PARTY tab's panel, above
  the rows.
- The selected tab is remembered for the session, not across restarts. It never switches
  by itself.
- No fight: "No boss yet. One appears when a test run fails." muted, then TEST COMMAND (a
  40px text field, saved on blur) with the hint "Leave empty to use the usual runners."
  muted.
- Active fight, top to bottom, 10px gap: the boss box (4px border in the boss accent,
  `--bg` fill, 10px padding, the idle loop at scale 2, centered; after a round with hits,
  "<n> HITS" in pixel 9px `--waiting` with a 2px text shadow in its top-right corner for 2
  seconds); the name (pixel 9px, boss accent) and "<runner> · round <n>" (11px muted); the
  HP bar (12px, 2px `--line` border, `--bg` track, what is left in `--error`, the part just
  lost in `--waiting` draining over 600ms); "<hp> / <maxHp> tests left" (12px, hp bold);
  WEAK POINTS (pixel 7px muted) and one row per file with failures, most first, at most 6
  and "+<n> more files" (each a button, `--bg` fill, 2px border, `--error` on the first row
  and `--line` on the rest, the file and its count in `--error`; a click puts "Focus on
  <file>." into the composer after any draft, not sent, and focuses it); pinned to the
  bottom, EXPAND BATTLE (44px, `--error` fill, dark text, 4px `--text` border, 4px hard
  shadow, pixel 8px), which reads BACK TO CHAT (`--bg` fill) while the battle view is open.
- Got away: the same box, "GOT AWAY · <hp> left" in place of the HP line, the weak
  points, FIGHT ON in the EXPAND BATTLE style, and EXPAND BATTLE as a plain button.
- Defeated: the defeated look held (see Boss effects), "DEFEATED" (pixel 9px, `--waiting`), "<rounds> rounds
  · <time>", and DISMISS, which moves the fight out of the tab (its notices stay in the
  history).
- FIGHT ON makes the fight active again, then sends "Keep going until all the tests
  pass." through the normal send. It is disabled while a run is going.
- Rail: a 68px button (the 64px idle frame and a 2px border) at the top of the rail with a
  4px HP bar under the frame. It opens the battle view. Its name is "<Boss>, <hp> of <maxHp>
  tests left".

### Battle view

EXPAND BATTLE replaces the CHAT stage frame (history, stage, and theme) with the battle
view. The header, the composer, and the party panel stay. BACK TO CHAT (in the view or the
tab) and Escape go back; so do leaving CHAT, NEW CHAT, and the end of the fight's
conversation. A later fight never opens the view by itself.

- One frame: position relative, overflow hidden, 4px border in the boss accent.
- Background: the pack's background by the rule in Packs (pixel art at whole-number scales,
  a big picture smoothly), anchored to the bottom edge and cropped to the frame, with no
  theme fade; plain `--bg` without one. The lower 46% fades from transparent to `--bg` at
  85%.
- Floor glow: a 320x40 ellipse in the boss accent at 20% opacity, centered under the boss,
  its middle 20px above the sprite's bottom.
- TEST LOG, left: top 12px, left 12px, bottom 88px, width min(320px, 40%), `--bg` at 90%,
  4px `--text` border, 4px hard shadow, padding 10px 12px, 12px text, scrolls inside. Top
  row: the mascot in a 32px box with a 2px `--line` border (drawn at half scale,
  nearest-neighbour: hard edges, no blur), "TEST LOG" (pixel 8px, accent), "<runner> ·
  round <n>" muted on the right. Then the latest round: "▶ <attacker> strikes!" (13px);
  "✓ <test name> −1" rows (✓ in `--loot-add`, −1 in `--waiting`), at most 8 and "+<n>
  more", or "<n> tests now pass" when unnamed; a divider (2px `--line` top and bottom, 4px
  padding) with "<n> hit combo!" in `--waiting` bold and " <file> cleared." per file
  cleared; "✕ <test name> +1" rows (✕ and +1 in `--error`) and "<Boss> healed <n>!
  <file> broke."; "✕ <file short> · <test>" muted, at most 3 and "+<n> more still
  failing". A round with no change: "No change. <hp> tests still failing."
- HP plate, top: from 24px right of the test log to 168px from the right edge: the name
  (pixel 10px, boss accent, 2px text shadow; it gives way first only after the runner
  text), "<runner> · round <n>" (11px muted), "<hp> / <maxHp>" (13px, hp bold) on the
  right, and the HP bar at 14px with a 3px border. On a frame 640px wide or less, the plate
  sits under BACK TO CHAT (top 60px, right 12px) and the boss starts at 108px.
- BACK TO CHAT: top 12px, right 12px, 40px tall, `--bg` at 90%, 4px `--line` border, pixel
  8px.
- Boss: the idle loop, with its effects, centered in the space right of the test log, top
  78px:
  scale 4 (256px); scale 3 (192px) when that space is under 300px wide or the frame under
  420px tall; and scale 2 (128px) when even 192px would not fit above the lineup. At
  960x600 the frame is about 324px tall, so the boss is 128px there.
- Lineup, bottom: left 12px, right 12px, bottom 12px, a card per member in a row, 8px gap,
  flex 1: 4px border (`--line`; the active member `--waiting` on `--lineup-active`
  #2A3558), padding 6px 8px, the agent's icon at 32px (the mascot for 'main') in a 40px
  box, the name (12px, 600), a 6px health bar in `--loot-add`, and a 4px energy bar in the
  accent (`--waiting` when full).
- Victory: a banner over the boss, "<BOSS> IS DEFEATED!" (pixel 14px, `--waiting`) and
  "<total> / <total> passing · +<xp> XP". Got away: "<BOSS> GOT AWAY." and "<hp> tests
  still failing." with FIGHT ON.

### The round replay

After each round, in the battle view and the BOSS tab (renderer only; the fight in main is
already final):

- Hits one at a time, 120ms apart, at most 2 seconds in total (evenly spaced past 16).
  Each: a "−1" (pixel 13px, `--waiting`, 2px text shadow) at a random spot around the
  sprite's edge, rising 12px and fading over 600ms; the white hit flash (see Boss effects);
  the HP bar down by one.
- After the last hit: "<n> HIT COMBO!" (pixel 16px, `--waiting`, 3px text shadow) above the
  sprite for 1.5 seconds.
- Heals after the hits: "+1" in `--loot-add`, the green heal tint, the bar up by one.
- Victory: after the last hit the defeat plays (the sprite sinks, grays, and fades) and
  holds; the banner comes with it.
- Reduced motion: no pops and no combo text; the bar and the log are final at once; the
  sprite shows frame 0 with no flash, tint, or sinking, and a victory shows the defeated look
  at once.

### History, nav, and popups

- Each encounter, round, victory, and escape adds a one-line notice to the history, right
  after the tool card of the test run (or the card of its task, for a run inside an
  agent); one whose card is not in the history goes at the end. A notice is the boss's idle
  frame in a 32px box, the log line, and a 2px border in the boss accent. Notices are never
  typed out and never go into the dialogue box.
- The log lines: "A wild <Boss> appears! <hp> of <maxHp> tests left.", "<n> hit combo!
  <hp> of <maxHp> tests left.", "<Boss> healed <n>! <file> broke.", "No change. <hp> tests
  still failing.", "Partial run: <passed> / <total> passed. It counts once a full run
  confirms it.", "<Boss> is defeated! All <total> tests pass.", "<Boss> got away. <hp>
  tests still failing.", and "<Boss> is back! <hp> of <maxHp> tests left."
- An ended fight adds an end card after its last notice. Defeated: the defeated look
  held, "<BOSS> DEFEATED" (pixel 9px, `--waiting`), "<rounds> rounds · <start hp> → 0
  tests left · <total> / <total> passing · +<xp> XP", and BATTLE LOG, which opens the
  battle view read-only on the final round. Got away: the idle frame, "<BOSS> GOT AWAY"
  (pixel 9px, muted), "<hp> / <maxHp> tests left", and FIGHT ON.
- Notices and end cards come back after a restart, in place, from the saved fight.
- CHAT's nav item shows a 6px `--error` dot while a fight is active and CHAT is not open.
- Popups, in the background only (see Popup notification): a victory uses the finished
  variant, "<Boss> is defeated! All <total> tests pass."; an escape the error variant,
  "<Boss> got away. <hp> tests still failing."
- The mascot plays hurt for 1.2 seconds after a round with heals and victory for 3 seconds
  after a victory (see Mascots).

## Boss manager

The mockup is "21. Boss manager (MASCOTS > BOSSES)" on the "MyClaud app mockup" canvas. The
MASCOTS screen has two tabs, MASCOTS and BOSSES. BOSSES shows every boss, lets me choose which
ones are in the random pool, and adds, edits, and deletes custom bosses. The files are
described under Boss battles (Packs, Boss effects); this section is the screen.

### Tabs

- Under the screen's header row (MASCOTS and the POPUPS, TEST POPUP, and EDITOR buttons): a
  tablist with MASCOTS and BOSSES. Each is a button with role tab, 44px tall, padding 0 16px,
  pixel font 10px. Selected MASCOTS: accent fill, dark text, 4px `--text` border, 4px hard
  shadow. Selected BOSSES: `--error` fill, dark text, 4px `--text` border, 4px hard shadow.
  Unselected: `--bg` fill, `--text`, 4px `--line` border. Arrow keys (and Home and End) move
  between the tabs and select the one they land on; only the selected tab is in the Tab order.
- Next to the tabs on BOSSES, one muted 12px line: "A random boss from the pool appears when
  a test run fails."
- The mascot gallery and editor are under the MASCOTS tab, unchanged.
- The tab is remembered for the session, not across restarts. The title bar reads "MASCOTS /
  Bosses" on the BOSSES tab and "MASCOTS" on the other.

### Gallery

- "BOSSES" (pixel 14px) and "<n> of <total> in the pool" muted. The total counts valid
  bosses; a problem card is not one.
- A 2-column grid, 14px gap (1 column when the tab is narrower than 360px). The built-in
  bosses first, then custom ones oldest first, then the ADD BOSS card.
- A boss card: 10px padding, panel fill, 4px `--line` border, 8px gap. The card being edited:
  4px `--text` border and a `4px 4px 0` shadow in the boss's accent. A card that is out of the
  pool is drawn at 75% opacity.
  - Thumbnail: 104px tall, 2px border in the accent, the background drawn by the rule in
    Packs, a bottom gradient from transparent to `--bg` at 70% over the lower half, and the
    BossSprite at scale 1 (64px), centered, 6px above the bottom, playing idle.
  - A row: a 10px square in the accent, then the name (13px, 600).
  - A row: "Built-in" or "Custom" (11px muted, plus " · editing" while it is open in the
    editor), and on the right the POOL toggle: a button, 32px tall, padding 0 8px, pixel font
    7px, `aria-pressed`, `aria-label` "<name> in the random pool", reading POOL: ON (accent
    fill, dark text, 2px accent border) or POOL: OFF (`--bg`, muted, 2px `--line` border).
  - Custom cards only: EDIT and DELETE, side by side, 32px tall. DELETE uses the danger style
    (`--error` text and border on `--bg`).
- A problem card (a pack that failed a rule): the reason in `--error`, the folder name, and
  DELETE only. Built-in bosses are never problem cards.
- ADD BOSS: a button card, min-height 220px, `--bg`, 4px dashed `--error` border, `--error`
  text, a "+" at 28px over "ADD BOSS" in the pixel font at 10px.
- Under the grid, a box with a 4px `--line` border and 12px muted text: "Turn POOL off to
  keep a boss out of the draw. At least one boss stays in the pool. Built-in bosses can't be
  edited or deleted."
- Turning off the last boss in the pool shows "At least one boss stays in the pool." above the
  grid; the toggle stays on.
- Delete asks first in the dialog style of the other screens (DELETE BOSS?, danger tone):
  "Delete <name>? Its folder goes to the trash." When a saved fight, in any project, used the
  boss, add: "A fight using this boss will show The Red Suite instead." (Whether a fight used
  it is read again when DELETE is pressed.) The folder goes to the OS trash with
  `shell.trashItem`. For a problem card, <name> is the folder name.

### Editor

In the same dialog the mascot editor uses (wide, modal): 4px `--text` border, panel fill, 6px
hard shadow, 20px padding, 16px gap. Title "ADD BOSS" or "EDIT BOSS" (pixel 11px, accent).

- NAME: label (pixel 9px), a 44px text field. Required, 1 to 24 characters after trimming
  ("Name is required." and "Name must be at most 24 characters.").
- FORMAT box (4px accent border, `--bg`, 13px): "FORMAT" in the pixel font, then "One idle
  loop: a horizontal strip of 64x64 frames, PNG. Height 64px, width a multiple of 64, up to 16
  frames. Drawn 4x in battle." and the slicer's grid wording: "A strip of 64x64 frames is used
  as it is. Any other sheet opens the slicer: set columns and rows, then pick the frames for
  the loop. Frames are scaled to 64x64, even when not square."
- IDLE LOOP row: the mascot editor's state row (one component, `SheetRow`, for both): the
  file name, its size and frame count, FPS (1 to 30, starts at 4; a replaced strip keeps its
  speed), UPLOAD or REPLACE, the slicer for grid sheets, the playing loop, and the strip with
  frame dividers. There is no REUSE SHEET, REMOVE, or REVERSE AT END. Required: with no strip,
  SAVE BOSS is disabled and the row says "Idle loop is required." The picks go through
  the same checks as a mascot sheet (see Mascots and Sheet slicer), with the same messages.
- BACKGROUND row (the same row frame): "<file> · <w>x<h>", UPLOAD or REPLACE, and REMOVE when
  set. Under it a 240x125 thumbnail (4px `--line` border, the background rule) and three muted
  lines: "PNG or JPG, 320x180 to 4000x4000, up to 5 MB.", "Anchored to the bottom edge,
  cropped to fit. Small pixel art keeps crisp pixels.", and "No background: the battle uses
  plain navy." A refused file shows its message in the row in `--error` (the background rules
  under Packs) and leaves the previous background in place. Nothing is written until SAVE.
- ACCENT: a fieldset (legend "Accent color", visually hidden) of 8 radio swatches, 32px
  squares: #F0706A, #F2B84B, #6FCF7F, #5BC0BE, #B98CF0, #F4A9C0, #A9B6C6, #F2F4F8. Unselected:
  2px `--bg` border. Selected: 4px `--text` border and a `3px 3px 0` hard shadow. Each has its
  hex value as its accessible name. Native radios, so arrow keys move between them. Then
  muted: "Used for the battle frame, the name, and the floor glow." A new boss starts on
  #F0706A. A pack with an accent that is not one of the eight shows none selected and keeps
  its accent until one is picked.
- PREVIEW (label in the pixel font at 9px): a 250px-tall frame with a 4px border in the accent.
  Inside: the background (or plain `--bg`), `--bg` at 35% over it, the battle view's bottom
  gradient (the lower 46%, to `--bg` at 85%), a name plate at the top (the name in capitals,
  pixel 10px, accent, 2px text shadow; "12 / 30" on the right; a 12px HP bar at 40% in
  `--error`), a 220x30 floor glow ellipse in the accent at 22% (its bottom edge on the sprite's
  bottom), and the BossSprite at scale 2 (128px) centered, 30px above the bottom. It updates
  live as anything changes.
- ADDED FOR YOU box (12px padding, `--bg`, 4px dashed `--line` border): the idle frame and the
  hit frame at 64px side by side with a "›" between them, labelled IDLE and HIT (pixel 7px;
  HIT in `--waiting` with a 2px `--waiting` border), then "ADDED FOR YOU" (pixel 8px, accent),
  the text "Every boss flashes white for a moment when it takes a hit, like the built-in
  ones. Heals flash green, and a defeated boss sinks and fades. You only draw the idle loop.",
  and TEST HIT. TEST HIT plays one hit on the preview sprite: the white flash and a "−1" pop.
  The HIT frame is the same BossSprite held in its hit look (`hold="hit"`), not a separate
  image. TEST HIT is disabled until there is a strip.
- Buttons: SAVE BOSS (primary; disabled until the form is valid and something changed),
  CANCEL, and in edit mode DELETE BOSS on the right (danger style; it asks first, as above).
  SAVE BOSS is also disabled while the slicer is open.
- CANCEL, Escape, or leaving the screen with unsaved changes asks once (DISCARD CHANGES?:
  "This boss has unsaved changes. They will be lost, with any pictures not yet saved." with
  KEEP EDITING and DISCARD). Unsaved picks and slicer sources are dropped in main when the
  editor closes. Built-in bosses never open in the editor.

### Storage and the preload API

`window.mya.bosses` gains `list()`, `pickIdle()`, `sliceIdle(sourceToken, columns, rows,
cells)`, `dropSources()`, `pickBackground()`, `create(draft)`, `update(id, draft)`,
`remove(id)`, `setInPool(id, on)`, and `onChanged(callback)`.

- `list()` answers every boss in order: the three built-in ones (only their pool setting; the
  window bundles their pictures), then each folder in `userData/bosses`, oldest first, as a
  pack (id, name, accent, `builtIn`, `inPool`, the idle strip and background as data URLs, the
  stored file names and background size, and `inFight`) or a problem (id, `problem`). It always
  reads the folders.
- A draft holds `name`, `accent`, `fps`, the idle change (`keep` or a token) and the background
  change (`keep`, `remove`, or a token). The window never sends a path or image bytes; a pick
  waits in main behind a token until SAVE.
- Main checks every field again. An id is a UUID or a built-in id, checked before any path is
  built; `update` and `remove` refuse a built-in id ("The built-in bosses cannot be edited."
  and "The built-in bosses cannot be deleted.") and any other id ("That is not a boss id.").
  An extra field in a draft is ignored.
- After any change main sends `bosses:changed`. The BOSS tab, the battle view, and saved
  fights redraw with the new name, accent, loop, and background at once.
