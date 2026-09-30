# omerelammary.com — v2 "After Hours"

Vite + TypeScript + three.js + GSAP + Lenis. Static output, deploys anywhere.

```bash
npm install
npm run dev      # local dev
npm run build    # outputs dist/
```

Deploy: point Vercel/Netlify at this folder (build `npm run build`, output `dist`).

## The hero
The headline is Omer's line from the old site, "Turning caffeine + code into beautiful
applications.", set in HTML with his name in the line above it. Beside it (below it on a phone)
a light sculpture: a mug of coffee whose steam rises as code. Tapping the Caffeine chip
while it's showing swaps in an iced coffee (his usual) with code frozen in the ice, and back;
`?coffee=iced` starts on it. Each shape's `lift` is a fraction of its own height, set so what
you actually see (the mug's steam fades before the top of its box) sits centred between the
"Last commit" label and the caption. The HUD is a CSS grid, and
`.hero__stage` is an empty cell the scene measures and fits every shape into, so where the
sculpture sits is decided in `style.css` at each width, not in the scene.

`src/hero/` holds the sculpture:
- `shapes.ts` builds every particle's target (position + colour) for each shape: the iced
  coffee, the mug, the phone, the systems circuit board, the portrait
  (`public/img/profile.webp`) and HELLO. Both coffees are sampled on real 3D surfaces, lit
  from the upper left. The iced cup is clear, so it's drawn thin and the drink does the
  colour (cream settled under coffee, a swirl, a lamp-coloured straw, a `</>` badge); each
  ice cube carries a glyph on the face that looks at the camera. The mug thins the far half of
  its wall so it reads as solid. Particle kinds live in the integer part of a target's `w`:
  2 a glyph of steam, 3 vapour, 4 a surface that ripples with the bass (the coffee, and the
  ice riding on it), 5+ dust.
- `scene.ts` runs the GPU simulation (position/velocity textures, springs, flow field,
  cursor wind, click shockwave), bloom and the lens pass. `STEAM_GLSL` moves the steam: each
  glyph (`{ } </> ; () => 0 1 []`, sampled from JetBrains Mono) rises up one of three columns,
  sways, turns and comes apart into vapour, fading in at the cup and out before the top.
  Brightness is normalised per shape, and quality drops automatically on slow devices.
- `index.ts` wires the HUD: intro (it says "Hey, I'm Omer Elammary." in the headline's own
  type while "brewing 0000 commits" counts and the coffee fills from the foot up, then the
  greeting lifts away and the headline rises word by word into its place), shape chips, menu-hover previews and the pinned
  scroll fly-through. The Caffeine caption is computed from the commit hours: 3 AM is the
  second-busiest hour of the day. "Last commit" is the newest commit in `commits.json`, so it
  moves when the data is regenerated, not live; times show as 12-hour with AM/PM.

The **♪ Beat** chip (shown when there is at least one track, see Audio below) plays the GameOver
beat and the sculpture pulses with it: each kick is a swell plus a soft push from the centre
(about half a click), the bass ripples the coffee, the mids stir the flow and the hi-hats
sparkle. Brightness moves only a little, so it reads as a pulse, not a strobe.

Debug flags (append to the URL): `?still=iced|mug|apps|systems|me|hello` starts already formed,
`?size=256` sets the particle texture size, `?nobloom`, `?slow=10` slows all animation,
`?fixeddt=0.0167` steps the simulation by a fixed time per frame (screenshots in a slow
headless browser), `?nogl` forces the plain-type fallback, and `?debug` lets a test set
`window.__levels` to fake the music.

## Projects
The cards stack on desktop. Each `.project`'s bottom padding (45vh) is the dwell: how far you
scroll with a card fully in view before the next one covers it. `main.ts` sets each card's
sticky `top` so a card taller than the window stops with its bottom (links, stack) on screen,
and shrinks any project name that would overflow its column.

## Under the hood (system flows)
`src/systems/flows.ts` holds four real request paths (SuperOver join, GameDay e-transfer,
Athena's 6 AM brief, Budget's bank sync), traced from the code. The rules the data follows:
- A hop is a real call or a real cause and effect between the two components. When the
  next hop starts somewhere else (the cron handler, not the inbox, writes to Postgres), the
  step says so with `from`, and the pulse jumps there.
- `via` is what travels along the hop; `guard` is a safeguard the code enforces at that
  step; `reject` is a failure the code handles there. Only claims checked in the code.
- `at` places a node in the 1000×600 desktop box; `tall` places it on the phone's two
  columns (x 116 and 344), with `rails` routing a hop round the outside when it would cross
  a node. Phones hide hop labels and show failures as red marks; the panel names both.

`diagram.ts` draws and animates them. The step panel is sized to the longest step of any
flow, so stepping never changes the stage's height.

## Easter eggs (`src/eggs/`)
Every project card's artwork is playable. Overlays they add carry `.egg-ui`, which keeps them
out of the card's reveal animation (a from-tween read their mid-transition opacity as 0).
- `gameday.ts`: the pitch is a canvas with the old CSS 3D tilt done by hand (so a click maps
  back to the pitch exactly). Click or tap to pass or shoot; long shots get air; a keeper
  guards the right goal, saving shots near him more often than corners. Goals fill spots on
  the session ticket. Where the art is wide and short (tablets, stacked phones) the pitch
  shrinks and drops until the goal and keeper are clear of the ticket and hint.
- `superover.ts`: an "Easter egg · Hit a six" chip. The right phone zooms in and becomes a
  six-ball bonus round with a target to chase, labelled as a game so nobody mistakes it for
  the app (which books pickup games). Timing decides six/four/runs/out; it ends pointing at
  the real app. Three ways out: the "Exit game" button above the phone, Escape, or a tap
  beside the phone. The screen area of `so-2.webp` is x 29–417, y 29–871.
- `athena.ts`: one message, sorted. "Dentist Tuesday at 3, send Sam the deck by Friday, and
  I want to start running" types in, each phrase lights up in a colour, and a row lands for
  each: the calendar, a promise with a nudge before it's due, a goal with a first step. "Hand
  her another" plays two more examples (an email drafted to wait for a yes, and a to-do; a
  third mix). Example data in her app's light look; the first example is in the HTML, so the
  card reads with no script. It replaced a five-page phone with a chat demo that had become a
  whole app demo rather than a small thing like the other cards (Omer, 2026-09-29).
- `budget.ts`: "Sync bank". Five sample transactions arrive as a bank sends them
  (card-processor noise and all), then tidy up the way the app does it: clean merchant name,
  a category from a rule, a subscription spotted, a friend's e-transfer matched to the dinner
  it settles. The forecast moves with each one.
- `gameover.ts`: the player bar plays (see Audio); the waveform becomes a live spectrum.

`?debug` also exposes `__gd` (pitch) and `__so` (Super Over) for scripted tests.

## Audio (`src/audio.ts`)
One player for the page: the GameOver card plays it, the hero reacts to it, and a pill in the
corner keeps it controllable while scrolling. With no tracks, the GameOver card is a picture
and the Beat chip is hidden.

The tracks are two of Omer's beats, the newest version of each in his Drive: Starlight
(#17, trap, 130 BPM) and Senses (#41, drill, 134 BPM). He swapped them in on 2026-09-29 for
the first three (Shooting Stars, Taka Tak, #92). `scripts/cut-beats.py` cuts each to about
forty seconds (two bars of lead-in, the drop, and a fade that ends on a bar line), so a
visitor hears the best part at once and the full beats never sit on a public page. Both are
matched to -16 LUFS with a plain gain change (ffmpeg's `loudnorm` compressed the drums; the
script's header says why). The Drive connector can't carry a file over about 6.3 MB (its
response tops out near 8 MiB of base64, and the connection drops rather than erroring), so
Starlight (6.4 MB) came as an attachment and Senses (6.2 MB) through Drive.

**One file, not one per beat.** The beats are joined, with 0.6 s of silence after each,
into one file in `public/audio/` (constant 192 kbps, 81 s, 2 MB), and `TRACKS` holds where
each starts. The file is named by its content (`set-<hash>.mp3`), because the start times
belong to one exact file: a browser still holding an older set under the same name would
start each beat in the wrong place. On the published page, a file per beat meant only the first ever played: moving
on swapped the element's source and called `play()` outside a tap, the browser refused, and
the card sat at 0:00, Next included. One continuous, looping file never stops, so the next
beat just arrives and Next is a seek. Constant bitrate because browsers seek a VBR MP3 by a
rough table of contents and can land a second off. `play()` also calls `resume()` and
`play()` together without awaiting in between (Safari honours a tap only before the first
await), and a file that won't load says so on the card instead of showing 0:00. To add a
beat: run `grid` on it, pick the bars, add it to the script's `SPEC`, run `cut`, and copy the
starts and lengths it prints into `TRACKS`.

`levels()` feeds the hero and the card. Mids and highs come from the visualizer's analyser;
bass and kicks come from a second, unsmoothed one, because an 808 pinned the visualizer's
bass at ~0.85 (it tops out at -30 dB) and the old kick test fired 4 times in 43 seconds. A
kick is now the 40–120 Hz band rising 10 dB within ~50 ms: tried offline on every beat used
so far, that is 1–2.5 hits a second, nearly all on a sixteenth. The kick also reports a full 1 on
the frame that hears it (it used to decay first and top out at 0.86, so the hero's kick
shockwave, which waits for >0.95, never fired). Once bass and kicks really moved, the hero's
response was too strong: Omer asked twice to turn it down, so every amount in `scene.ts`
(swell, brightness, ripple, sparkle, flow, the kick's shockwave) is now about a quarter of
the first tuning, and the card's logo and aurora pulse about half.

## GlazeBot (`src/glazebot.ts`)
The chat widget talks to the bot at `ai-chatbot-kcyl.onrender.com` (repo
`elammaryo/ai-chatbot`, which owns the model, instructions and fact sheet). The server's CORS
list decides which sites may call it, so on any other host (a preview, localhost) the widget
says it's on mute rather than failing. Render's free tier sleeps: the widget pings the server
when someone hovers the launcher, and says so if a cold start is slow.

The launcher is the old site's: a glass tile with Lucide's bot icon, a pink dot, and a
"GlazeBot AI" label that slides out on hover. It stays hidden on the first screen (it sat on
the hero's chips on a phone) and slides in once the page scrolls; the first time, the label
opens for a few seconds, once per visit.

## When I ship
The rhythm section is computed from `commits.json`: commits by hour, the facts, a
"built with" chart and the contribution calendar. "Built with" counts each repo's commits
toward every framework in its `stack` (`src/repos.ts`), so the bars overlap and show counts,
not shares. It replaced a languages chart: by lines, TypeScript was 71% and Dart 11%, which
hid that the most-worked-on app here is Flutter. The calendar says under it that day-job code
(Skinopathy, CMiC) isn't in these repos.

The nav clock is always Omer's time in Toronto. Its status is a guess from that clock: "at
CMiC" 8:30 to 5 on weekdays, "probably committing" 10 PM to 5 AM, "off the clock" otherwise.

## Journey (where I've built)
A career map, then each company. `drawCareer` in `main.ts` reads the dates off the role
list itself (`data-from`, `data-to`, `data-lane`, `data-label`; `data-at` for the degree), so
the map and the list can't disagree: every role sits at its real months on one axis from
2023 to now, overlaps included (SuperOver began before Skinopathy ended; the degree was
finished while working). The current role runs to this month and pulses. Pointing at a
company lights its bars, and the other way round. Newest first, the way a recruiter reads.
The degree's label sits on the axis in the page colour, so the line breaks around it rather
than striking through, and on a phone it drops the year (half a year is ~50px there).

## Capabilities
`src/capabilities.ts` is the skills × projects grid. A cell is lit only if the text says
what was actually built there; edit `ROWS` to add or change evidence. The first-view sweep
is a CSS animation on `scale` (a GSAP stagger on `transform` fought the hover transition
and left dots invisible), and dots stay visible if the reveal never runs.

## Sharing
`public/og.jpg` is the link-preview image (1200×630), referenced by the Open Graph and
Twitter tags in `index.html`.

## Commit data
`src/data/commits.json` is generated from local clones of your repos:
1. Clone each repo with full history (`git clone --filter=blob:none <url>`).
2. Edit the repo → path map at the top of `scripts/mine.py`, then run
   `python3 scripts/mine.py && python3 scripts/prep.py`.
3. Copy the resulting `commits.json` into `src/data/`.
Only commits authored by you are counted; messages mentioning secrets/tokens are withheld.
Only the 90 messages the ticker shows are kept (the rule matches `fillTicker`); every other
message is blanked, so the file and the site's bundle carry no text the page doesn't show.
Most of the dropped ones came from SuperOver's private company repos. Timestamps and
projects are kept for every commit, which is all the charts and the calendar use.
Repo labels and colors live in `src/repos.ts`.
