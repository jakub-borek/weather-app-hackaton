# Pitch deck

- `index.html`: the deck source, 5 slides. Edit only this file.
- `pitch.pdf`: the version for judges, generated from `index.html`. Do not edit it by hand.

## Preview

Open `index.html` in a browser. Arrow keys ← → switch slides, `F` toggles fullscreen. The slide number is in the URL (`#3`).

## Editing

- Each slide is one `<section class="slide">`, in order 01–05. Change the text directly in the HTML.
- A slide has a fixed size of 1600×900 and scales to the window. After a change, check that text does not overlap the footer.
- Colors are CSS variables at the top of the file (`--purple`, `--orange` etc.).
- The numbers on slide 3 (273 400 → 248 600 zł) come from the F05 run in rule mode. Replace them after a run with Grok.

## PDF after changes

```bash
./scripts/pitch-pdf.sh
```

Then check `pitch.pdf` and commit both files together.
