# 🕐 Competitive Time Machine

**Automated screenshot capture, visual diffing, and AI analysis for competitor monitoring.**

## Quick Start

```bash
# Install dependencies
npm install

# Run first capture
npm run capture

# Generate visual diffs
npm run diff

# Open viewer
open viewer/index.html
```

## Commands

| Command | Description |
|---------|-------------|
| `npm run capture` | Capture screenshots from all configured competitors |
| `npm run diff` | Generate visual diffs comparing to previous captures |
| `npm run full` | Run capture + diff + index in sequence |
| `npm run index` | Regenerate the captures index for the viewer |

## Project Structure

```
├── src/
│   ├── config.yaml      # Competitor URLs and settings
│   ├── capture.js       # Playwright capture script
│   ├── diff.js          # Pixelmatch diff generator
│   └── generate-index.js # Index generator for viewer
├── captures/            # Output directory (auto-created)
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

Edit `src/config.yaml`:

```yaml
competitors:
  newcompetitor:
    pages:
      - label: homepage
        url: https://example.com/
```

## AI Analysis

Use your IDE (Copilot, Claude) to analyze screenshots:

1. Open a screenshot in your IDE
2. Ask: "Analyze this e-commerce page for UX patterns, layout changes, or promotional strategies"
3. Save insights to `analysis.json` alongside the capture

## Troubleshooting

**Capture fails with timeout:**
- Increase timeout in config.yaml
- Check if site requires different dismiss selectors

**Diff shows 100% change:**
- Normal for first capture (no baseline)
- Check if page has dynamic content (ads, timestamps)

**Viewer shows "Image not found":**
- Run `npm run index` to regenerate the index
- Verify captures exist in the expected path

---

Built for **Ace Hardware** competitive intelligence.
