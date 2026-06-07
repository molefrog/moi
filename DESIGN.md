# Design principles

How to make hand-written UI (HTML + Tailwind) feel designed, not assembled. Distilled craft
principles — pair with the Tailwind/icons/animations rules in `.claude/rules/`.

## Before building a new surface

Commit to three things before writing markup, even informally:

- **A mood word** — a physical register the surface evokes (e.g. _mineral, bookish, editorial,
  terminal, candlelit, signage, brutalist_). Pick one that _isn't_ your first instinct; first
  instincts regress to the same few generic answers.
- **A palette** — 5–6 values with roles (ground, text, muted, one accent, borders), every color
  derived from a real object in that scene. "Bookish" = plaster, oak, ink, candle flame. If you
  can't name the reference for a color, it's abstract and will look glued-on.
- **A type scale** — font, the weights you'll use, and the size steps.

## Color

- **One accent, used deliberately.** One intense color moment beats five competing ones. Most of the
  surface is neutral; color marks the few things that matter (primary action, active state, a key number).
- **Default to a pure-white ground (`#FFFFFF`) and light mode.** White is the common case for
  dashboards, product UI, and docs — not a "stark" choice. Off-white/cream is a _specific_ aesthetic
  (sun-bleached, candlelit, bookish), not a generic neutral.
- **Derive grays from the scene or stay truly neutral** (`#EEE`, `#CCC`, `#888`, `#444`). Tinted gray
  without a reason reads as indecision. Pure black `#000` only for high-chroma accents, "inky"/
  "nocturnal" moods, or when asked.
- **Proven ground × accent pairings** (families to interpret, not fixed hex): bone × oxidized copper ·
  fog gray × deep navy · graphite × rust · concrete × safety orange · plaster × ink · slate × amethyst ·
  pure white × cobalt · pure white × cadmium red · ink × chrome yellow · pure white × pure black.
- **Avoid the clichés:** warm off-white × terracotta/burnt-orange (recent overuse) · navy/charcoal ×
  electric purple/lime/teal (2019–2024 SaaS) · pure white × muted earth tone (earth tones fall flat on
  white; they want a tinted ground from the same scene) · tinted warm ground × any high-chroma accent
  (the tint mutes the chroma — use pure white or pure black instead).
- **Secondary accents only with a job** — categories, data viz, semantic states (success/warning/error).
  Pull them from the same scene as the primary so the palette reads as one. Keep overall saturation low.

## Typography

- **Maximize contrast between display and label.** Pair a heavy, large headline with light/regular
  small text. Scale contrast (very large next to very small) is the main lever for hierarchy — lean on
  it rather than boxes and dividers.
- **Tracking:** slightly tighter on large/display type; open or none on small caps and tiny labels.
- **Units:** `px` for font size, `em` for letter-spacing, `px` (or unitless) for line-height.
- **Contrast is non-negotiable.** Reduced-opacity / muted text is for hierarchy, used sparingly.
  Anything below 16px needs higher contrast — if you'd squint, fix it. Avoid text ≤12px except in
  dense productivity UI or as an all-caps stylistic accent.

## Layout & spacing

- **Restraint by default.** Choosing between adding an element and removing one, remove. White space
  is a feature. Refined and minimal beats busy.
- **Vary spacing deliberately** — tight to group related things, generous to let hero/primary content
  breathe. Uniform spacing everywhere reads as no spacing decision at all.
- **Favor asymmetry and scale contrast over grid-like sameness.** Vary scale/weight/spacing to create
  rhythm; identical repeated blocks feel like a component dump.
- **Put information directly on surfaces** rather than boxing everything in cards. Reach for a card only
  when grouping genuinely needs a container.
- **Avoid late-2010s habits** — stacked gradients and heavy drop shadows. If used, apply subtly so
  elements don't compete.
- **Repeated rows must form vertical lanes** (lists, nav, tables). Give icons / indicators / trailing
  actions fixed-width slots (`w-*` + `shrink-0`), even when empty in some rows. Never rely on `gap`
  alone to align columns across rows with varying content.

## Style vs. clarity

Decide which the surface is for:

- **Clarity** (product UI, usability, dense data) → restraint, legibility, predictable layout.
- **Impress** (marketing, landing, brand, "make it bold/fun") → stronger personality. A _playful_
  register can use a 2–3 color duo/trio, tilt or sticker elements, offset shadows, hand-drawn marks,
  quippy copy — pick one or two that fit, not all. If you spend the budget on color, spend less on
  decoration.

## Self-review checklist

After a section looks done, reread it as a critical designer and fix before moving on:

- **Spacing** — uneven gaps, cramped groups, accidentally-empty areas. Is there visual rhythm?
- **Typography** — readable sizes, decent line-height, clear heading/body/caption hierarchy.
- **Contrast** — no low-contrast text or elements blending into the background.
- **Alignment** — elements that should share a lane do; icons/actions line up across repeated rows.
- **Repetition** — not so grid-uniform it's lifeless; vary scale/weight/spacing for interest.
- **Fit** — nothing clipped at edges; no large dead gap at the bottom.
