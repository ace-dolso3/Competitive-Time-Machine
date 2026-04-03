# 🕐 Competitive Time Machine

**Visual diffing and feature-first analysis for competitor monitoring.**

Default workflow: add screenshots, regenerate diffs/index, then have Copilot manually review the latest comparisons and write feature findings into the time machine.

## Quick Start

```bash
# Install dependencies
npm install

# Add screenshots to captures folder (see Manual Capture Workflow below)

# Generate visual diffs
npm run diff

# Regenerate index for viewer
npm run index

# Optional: create review placeholders for latest captures
npm run analyze

# Open viewer
open viewer/index.html
```

## Commands

| Command | Description |
|---------|-------------|
| `npm run diff` | Generate visual diffs comparing to previous captures |
| `npm run index` | Regenerate the captures index for the viewer |
| `npm run analyze` | Create placeholder feature-review statuses for the latest captures |

## Manual Capture Workflow

1. **Take screenshots** using Safari or your browser's dev tools
2. **Name files** `desktop.png` and `mobile.png`
3. **Save to** `captures/{competitor}/{page}/{YYYY-MM-DD}/`

Example folder structure after capture:
```
captures/
  homedepot/
    homepage/
      2026-03-26/
        desktop.png
        mobile.png
```

## Project Structure

```
├── src/
│   ├── diff.js          # Pixelmatch diff generator
│   └── generate-index.js # Index generator for viewer
├── captures/            # Screenshot storage
│   └── {competitor}/
│       └── {page}/
│           └── {date}/
│               ├── desktop.png
│               ├── mobile.png
│               ├── desktop-diff.png
│               ├── mobile-diff.png
│               └── metadata.json
├── viewer/              # Dashboard application
│   ├── index.html
│   ├── viewer.js
│   └── styles.css
└── DESIGN.md           # Detailed design documentation
```

## Adding Competitors

Create the folder structure manually:
```
captures/{competitor-name}/{page-name}/{YYYY-MM-DD}/
```

Then add `desktop.png` and `mobile.png` screenshots.

## Feature Analysis

The analysis workflow is intentionally conservative:

- New or updated features are the signal.
- Copy swaps, image swaps, pricing changes, and cosmetic drift are noise unless they clearly indicate a changed feature.
- The preferred review method is manual Copilot analysis inside this workspace, not a paid external model pipeline.

Recommended workflow:

1. Generate visual diffs with `npm run diff`
2. Regenerate navigation with `npm run index`
3. Ask Copilot to analyze the latest captures and write feature findings into the relevant `analysis.json` files
4. Optionally run `npm run analyze` only if you want placeholder review statuses for all latest captures

If `ANTHROPIC_API_KEY` is unavailable, `npm run analyze` will only populate fallback review statuses without inventing feature changes.

## Troubleshooting

**Diff shows 100% change:**
- Normal for first capture (no baseline)
- Check if page has dynamic content (ads, timestamps)

**Viewer shows "Image not found":**
- Run `npm run index` to regenerate the index
- Verify captures exist in the expected path

---

Built for **Ace Hardware** competitive intelligence.
