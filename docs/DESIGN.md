# Design of the new website

Chosen by Menno on 2026-11-23: direction A, "Clear and academic". The mock-ups (course home,
exercise, reader and home on a phone) are on the design canvas in claude.ai.

## Colours

| Name | Colour | Used for |
|---|---|---|
| ink | `#16213A` | text, dark buttons, headings |
| ink-soft | `#3C465A` | body text next to headings, menu links |
| muted | `#5A6478` | captions, counts, labels (4.5:1 on white and on the background) |
| background | `#F4F6F9` | page background |
| surface | `#FFFFFF` | cards, header |
| line | `#DDE2EA` | card borders, header line |
| line-strong | `#C5CDDA` | borders of secondary buttons and text boxes |
| track | `#E6EAF0` | the empty part of progress bars |
| accent | `#1F5FBF` | main buttons, links, progress, the selected level |
| accent-soft | `#EAF0FA` | the active menu item, the unit you are reading |
| right | `#1D5B36` on `#E7F4EC` | a correct answer |
| wrong | `#8A2A1C` on `#FCEDEA` | a wrong answer |

## Type

- Headings: Source Serif 4, weight 600–700 (h1 30–34 px, h2 20–24 px).
- Everything else: Inter, 400/500/600; body 15–16 px, small labels 13 px in capitals with
  0.06em letter spacing.

## Shapes and sizes

- Cards: white, 1 px border in `line`, corners 12 px, padding 24–32 px.
- Buttons and text boxes: corners 8 px, at least 44 px high (48–52 px in exercises).
- Main button: accent background, white text. Secondary: white with a `line-strong` border.
- Icons: simple line icons (2 px stroke), never emoji.
- Page width at most 1200 px (exercises 760 px), 24 px side margins; on a phone 16 px and a
  menu bar at the bottom with five items: Course, Schedule, Progress, Words, Exams.
