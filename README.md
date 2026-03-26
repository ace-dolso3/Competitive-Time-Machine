# 🕐 Competitive Time Machine

**Visual diffing and AI analysis for competitor monitoring.**

## Quick Start

```bash
# Install dependencies
npm install

# Add screenshots to captures folder (see Manual Capture Workflow below)

# Generate visual diffs
npm run diff

# Regenerate index for viewer
npm run index

# Open viewer
open viewer/index.html
```

## Commands

| Command | Description |
|---------|-------------|
| `npm run diff` | Generate visual diffs comparing to previous captures |
| `npm run index` | Regenerate the captures index for the viewer |

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

## AI Analysis

Use your IDE (Copilot, Claude) to analyze screenshots:

1. Open a screenshot in your IDE
2. Ask: "Analyze this e-commerce page for UX patterns, layout changes, or promotional strategies"
3. Save insights to `analysis.json` alongside the capture

## Troubleshooting

**Diff shows 100% change:**
- Normal for first capture (no baseline)
- Check if page has dynamic content (ads, timestamps)

**Viewer shows "Image not found":**
- Run `npm run index` to regenerate the index
- Verify captures exist in the expected path

---

Built for **Ace Hardware** competitive intelligence.
