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
applications.", set in HTML with his name in the line above it. Beside it (under it on a phone)
is a planet with two words orbiting it, FULL-STACK and CLOUD ENGINEERING, under "Currently
orbiting between…". That was the old site's hero (a CSS planet with the words curved round it:
his full-stack work on one side, his pull toward cloud on the other), and on 2026-10-02 he
asked for it back in place of the particle coffee mug, which had grown commit counts, shape
chips and hints around it. The hero now carries the copy and the planet and nothing else.

`src/hero/planet.ts` draws it with three.js, with no post-processing:
- The planet is one sphere and one shader: soft violet bands, the old planet's latitude and
  longitude lines (every 30°, about a pixel wide at any size), a half-moon light from the upper
  left, ember lamps on the night side (the site's "after hours"), and an atmosphere rim. A
  premultiplied glow sits behind it.
- Each word is drawn round a canvas strip (`ringTexture`: the word, a thin track, a star, four
  or three times round) and mapped onto an open cylinder. The rings are tilted just enough that
  their near sides clear the planet's edge, so FULL-STACK arcs over it and CLOUD ENGINEERING
  under it, where the old site set them, and both start with a whole word in front. Letters
  thin out as the band turns edge-on, and the far side, seen through the ring from behind, is a
  faint ghost. A dark halo under each letter keeps it legible against the lit planet.
- Two comets with dotted orbits pass behind the planet.
- The canvas is transparent: the page's sky (see below) shows through the whole hero.

Moving the pointer tilts the system a few degrees. Dragging the planet spins it and winds the
rings up, then they coast; a tap on the planet (not a drag) calls up a meteor shower and a
flash along the rings. When a GameOver beat plays, the atmosphere breathes with the bass and
the words brighten a touch on each kick, kept faint as Omer asked of the old hero.

`hero/index.ts` runs the intro: "Hey, I'm Omer Elammary." rises in the headline's own type
while dawn comes round the planet's left limb (a crescent growing into the half-moon) and the
words write themselves round their rings, then the greeting lifts away and the headline rises
word by word. Leaving the hero, the copy lifts away and the planet sinks a little slower than
the page. Nothing is pinned. Without WebGL, the old site's flat planet (CSS and an SVG
`textPath`) takes the canvas's place. Reduced motion shows the formed scene, still.

Debug flags (append to the URL): `?still` starts with everything in place and no intro,
`?nogl` forces the flat planet, `?slow=10` slows all animation, and `?debug` lets a test set
`window.__levels` to fake the music.

## The sky (`src/sky.ts`)
Stars behind the whole page, a meteor every few seconds, and a shower when the contact section
comes up. Omer's first portfolio (`elammaryo/cosmic-portfolio`) had a starfield with meteors,
and he asked for it back on 2026-10-01. It returns quieter than it was, because this page
already moves a lot (the hero's planet, the beat pulse, the stacked cards):
- The stars hold still. They are drawn once onto a canvas from a seeded generator, so a resize
  redraws the same sky, and only 14 of them twinkle (CSS). One star per 7,000px² of window.
- One meteor at a time, every 3.5–8 s (sometimes a second just behind it), falling right and
  down at about 35° as on the old site, head first, brightening, then gone. The first waits
  until the hero's intro is over; a hidden tab gets none.
- The shower is ten meteors in under three seconds as `#contact` arrives, at most once every
  20 s. A tap on the hero's planet calls one too (`meteorShower(true)`), waiting only for the
  last to clear.

The layer sits at `z-index: -1` behind everything. The hero is transparent, so the planet hangs
in it; the cards cover it and the open stretches between them show it. That is why `body` has no background (it would paint over
the layer) and the page colour lives on `html`; the rhythm section's band became a
semi-transparent haze for the same reason. It is `100lvh` tall, so a phone's address bar coming
and going doesn't resize it. Meteors are elements moved by the Web Animations API, transform
and opacity only, so nothing redraws the stars. Reduced motion keeps the stars, still.

## Projects
On a wide screen the cards stack like a deck. Each card sticks 14px lower than the one before,
so the ones you have passed show as edges above it, and `main.ts` lifts a card taller than the
window so it stops with its bottom (links, stack) on screen. As the next card rises over it, a
card sinks back to 94% and dims, scrubbed to the scroll, from the moment its bottom starts being
covered until the next card lands. The dim is an overlay faded by opacity (`.project__shade`).

It used to hold each card still for 45vh of scrolling with the next one out of sight, then
dim it with a `brightness()` filter. On 2026-10-02 Omer said it stalled and then the card went
dark all at once: the hold was scrolling with nothing moving, and the filter repainted the
whole card, art and all, every frame. Now the hold is 16vh with the next card already rising
into view, the dim is spread over the whole cover, and the cards are a little shorter (smaller
names, tighter padding). The section went from 6,178px to 4,828px on a laptop. Phones and
tablets get the cards one after another, unstacked. `main.ts` also shrinks any project name
that would overflow its column.

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
One player for the page: the GameOver card plays it, the hero's planet reacts to it, and a
pill in the corner keeps it controllable while scrolling. With no tracks, the GameOver card is
a picture.

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

`levels()` feeds the hero's planet and the card. Mids and highs come from the visualizer's analyser;
bass and kicks come from a second, unsmoothed one, because an 808 pinned the visualizer's
bass at ~0.85 (it tops out at -30 dB) and the old kick test fired 4 times in 43 seconds. A
kick is now the 40–120 Hz band rising 10 dB within ~50 ms: tried offline on every beat used
so far, that is 1–2.5 hits a second, nearly all on a sixteenth. The kick also reports a full 1 on
the frame that hears it (it used to decay first and top out at 0.86, so the old particle
hero's kick shockwave, which waited for >0.95, never fired). Once bass and kicks really moved,
that hero's response was too strong and Omer asked twice to turn it down; the planet that
replaced it (2026-10-02) starts from that lesson, with a faint swell of the atmosphere and a
small brightening of the words, and the card's logo and aurora pulse about half their first
tuning.

## GlazeBot (`src/glazebot.ts`)
The chat widget talks to the bot at `ai-chatbot-kcyl.onrender.com` (repo
`elammaryo/ai-chatbot`, which owns the model, instructions and fact sheet). The server's CORS
list decides which sites may call it, so on any other host (a preview, localhost) the widget
says it's on mute rather than failing. Render's free tier sleeps: the widget pings the server
when someone hovers the launcher, and says so if a cold start is slow.

The launcher is the old site's: a glass tile with Lucide's bot icon, a pink dot, and a
"GlazeBot AI" label that slides out on hover. It stays hidden on the first screen (so the
headline lands before anything asks to chat) and slides in once the page scrolls; the first time, the label
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
A career map, then the roles side by side. `drawCareer` in `main.ts` reads the dates off the
role cards themselves (`data-from`, `data-to`, `data-lane`, `data-label`; `data-at` for the
degree), so the map and the cards can't disagree: every role sits at its real months on one
axis from 2023 to now, overlaps included (SuperOver began before Skinopathy ended; the degree
was finished while working). The current role runs to this month and pulses. Pointing at a
company lights its bars, and the other way round. Newest first, the way a recruiter reads.
The degree's label sits on the axis in the page colour, so the line breaks around it rather
than striking through, and on a phone it drops the year (half a year is ~50px there).

The roles run sideways since 2026-10-01, to shorten the page: stacked, they took 1,761px on a
laptop and 2,374px on a phone; the row takes 1,114 and 1,190. The row (`#roles`) is full-bleed
with native scrolling and `scroll-snap`, and its padding lines the first card up with the
column above. A finger or a trackpad swipes it. Lenis leaves sideways gestures over it to the
browser (`data-lenis-prevent-horizontal`) and still smooth-scrolls the page for up-and-down
ones. `initRoles` adds the rest:
- the arrows step one card (hidden on touch screens, where the next card showing at the edge
  says there is more);
- a mouse drags the row and lands on the card it was heading for (snapping is off mid-drag,
  or it would pull back every frame);
- Shift and the wheel step a card per notch. Left to the browser, a notch only nudged a
  snapping row, and it snapped straight back;
- the cards in full view light their bars on the map, and clicking a bar brings its card in.

The Skinopathy card holds two stints, side by side on a wide screen, so it is no taller than the
rest. On a phone one card shows at a time and the tallest sets the row's height, so a shorter
card keeps its stack pinned to the bottom.

## Capabilities
`src/capabilities.ts` is the skills × projects grid. A cell is lit only if the text says
what was actually built there; edit `ROWS` to add or change evidence. The first-view sweep
is a CSS animation on `scale` (a GSAP stagger on `transform` fought the hover transition
and left dots invisible), and dots stay visible if the reveal never runs.

## Search
The page is built to be found by his name first, then by what he does.
- The name leads everywhere a search engine reads first: the `<title>` ("Omer Elammary ·
  Software Engineer in Toronto"), the meta description, and the page's only `h1`, which is
  the small line above the headline. The headline itself is the `h2`, so the big line
  stays the big line and nothing on screen changed.
- A JSON-LD graph in `index.html` says what the page is: a `WebSite`, a `ProfilePage` and the
  `Person` it's about (job, employer, school, Toronto, skills, and his GitHub, LinkedIn and
  Instagram as `sameAs`, which ties those profiles to this site). Only facts the page states.
- `robots.txt` allows everything and points to `sitemap.xml` (the page and the resume PDF).
  When the content changes, bump the sitemap's `lastmod` and the ProfilePage's
  `dateModified`.
- Open Graph and Twitter tags carry a title, description, image and alt text for link
  previews; `og.jpg` is the share image. `site.webmanifest` names the site and its icons.
- Lighthouse (2026-09-30): SEO 100, Accessibility 100, Best Practices 100. The one failure
  before was the missing `robots.txt`.
- Off the page, and up to Omer: verify the domain in Google Search Console and submit the
  sitemap; point the website field on GitHub, LinkedIn and Instagram at omerelammary.com; and
  have the host redirect `www` to the bare domain, which the canonical tag names.

## Sharing
`public/og.jpg` is the link-preview image (1200×630), referenced by the Open Graph and
Twitter tags in `index.html`: his name and the old site's line on the left, the hero's planet
on the right. It is a screenshot of the real planet (`createPlanet` with `formed` and
`reduced`, so one still frame) on a 1200×630 page, saved as a JPEG; redo it when the hero
changes, so a shared link looks like the page it opens.

The icon is an OE monogram: a violet O and an ember E, the site's two accents, on its dark
ink. Omer picked it from seven ideas (a code mug, a coffee bean, a 3 AM moon, a prompt,
particles, the plus). `favicon.svg` is the source; `favicon.ico` (16, 32, 48) is for
browsers without SVG icons, and `apple-touch-icon.png` (180, square, full-bleed) is for iOS,
which rounds the corners itself. The strokes are heavy and the letters sit a hair apart, so
it still reads as two letters at 16 px.

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
