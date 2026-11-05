# Pitch deck

- `index.html`: the deck source, 8 slides. Screenshots live in `img/deck-*.jpg`. Edit only this file.
- `pitch.pdf`: the version for judges, generated from `index.html`. Do not edit it by hand.

## Preview

Open `index.html` in a browser. Arrow keys ← → switch slides, `F` toggles fullscreen. The slide number is in the URL (`#3`).

## Editing

- Each slide is one `<section class="slide">`, in order 01–08. Change the text directly in the HTML.
- A slide has a fixed size of 1600×900 and scales to the window. After a change, check that text does not overlap the footer.
- Colors are CSS variables at the top of the file (`--purple`, `--orange` etc.).
- Slides 3–6 use a real run with Grok agents: RFQ `rfq_01M6PK1FD1YD3H4KZ1NCHBM4JV` (141 700 → 127 700 zł) and order #1 in iStacja's vendor panel. Screenshots were taken with Playwright (storefront header cropped off).

## PDF after changes

```bash
./scripts/pitch-pdf.sh
```

Then check `pitch.pdf` and commit both files together.
