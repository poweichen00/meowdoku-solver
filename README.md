# Meowdoku Screenshot Solver

A mobile-first, fully client-side Meowdoku screenshot solver. Select a screenshot containing an untouched puzzle board and the page detects the grid, solves the color/row/column constraints, and annotates the answer directly on the image.

Images never leave the browser.

## Local preview

```bash
python3 -m http.server 4173 --directory dist
```

Then open `http://localhost:4173`.
