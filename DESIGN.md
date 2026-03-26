# Competitive Time Machine — Design Document

**Created:** March 26, 2026  
**Author:** David Olson (Senior UX/UI Designer, Ace Hardware)  
**Status:** Ready for Implementation

---

## Overview

An automated visual competitive intelligence system that captures screenshots of competitor e-commerce pages, generates visual diffs to highlight changes, and provides AI-powered UX analysis on demand.

---

## Understanding Summary

- **What:** Automated screenshot capture and visual diff system for competitor websites (Lowe's, Home Depot, Menards, Amazon home improvement)
- **Why:** Replace manual "browse and take notes" with a living visual record; support UX design decisions with concrete competitor evidence
- **Who:** Senior UX/UI Designer (primary), shared with marketing, product, and executives
- **Scope:** ~20 key pages including PDPs and customer journey steps; desktop (1440px) and mobile (390px) viewports
- **Key Capability:** Visual diff highlighting with on-demand AI analysis for layout changes, styling changes, and UX pattern detection
- **Output:** Integrated viewer/dashboard with analysis panel; ability to generate focused or consolidated reports
- **Operational Model:** Manually triggered captures; you maintain with minimal ongoing attention

### Explicit Non-Goals

- Real-time or daily tracking (weekly/on-demand is sufficient)
- Content, copy, or pricing change detection
- Internal Ace page tracking (competitors only)
- Automated scheduling (deferred for later)

### Assumptions

- Public competitor pages can be captured without legal/ToS issues (standard competitive research)
- SharePoint/OneDrive remains accessible for storage and sharing
- ~40 captures per run (20 pages × 2 viewports) is the operating scale
- AI analysis uses existing IDE credits (Copilot/Claude) at no additional cost

---

## Architecture

### Core Components

1. **URL Configuration File** (`config.yaml`)  
   List of competitor URLs organized by competitor and page type, with optional per-site overrides for wait times and modal dismissal.

2. **Screenshot Capture Engine** (`src/capture.js`)  
   Playwright-based headless browser automation. Handles lazy loading, cookie banners, full-page scroll capture, and retry logic.

3. **Visual Diff Generator** (`src/diff.js`)  
   Pixelmatch-based pixel comparison. Outputs diff images highlighting changed regions and calculates change percentage.

4. **Viewer Dashboard** (`viewer/index.html`)  
   Vanilla HTML/JS/CSS single-page application. Displays screenshots, diffs, and AI analysis. Runs from filesystem with no build step.

5. **AI Analysis Integration**  
   On-demand via IDE (Claude/Copilot). Reads captures, generates UX-focused insights, writes to `analysis.json` for viewer display.

### Data Flow

```
Manual trigger (npm run capture)
    ↓
Capture screenshots (both viewports)
    ↓
Save to dated folders
    ↓
Generate diffs against previous capture
    ↓
Update viewer index
    ↓
[Optional] Run AI analysis via IDE → writes to analysis.json
    ↓
View in dashboard
```

---

## Folder Structure

```
/Competitive Time Machine
  /captures
    /lowes
      /homepage
        /2026-03-26
          desktop.png
          desktop-diff.png
          mobile.png
          mobile-diff.png
          metadata.json
          analysis.json
        /2026-03-19
          ...
    /homedepot
      ...
    /menards
      ...
    /amazon
      ...
  /viewer
    index.html
    viewer.js
    styles.css
  /src
    capture.js
    diff.js
    config.yaml
  capture-log.txt
  package.json
  DESIGN.md
```

---

## Screenshot Capture Details

### Handling Web Complexity

- **Wait for Full Load:** Network idle + configurable delay for lazy content
- **Dismiss Interruptions:** Auto-click cookie banners and close modals via configurable selectors
- **Full-Page Capture:** Scroll entire page to trigger lazy loading, capture full height
- **Consistent Viewports:** Desktop 1440px, Mobile 390px (iPhone 14 Pro)
- **Retry Logic:** One retry on failure before logging and continuing

### Per-Site Configuration

```yaml
competitors:
  - name: lowes
    pages:
      - url: https://www.lowes.com
        label: homepage
        wait_extra: 2000
        dismiss_selectors:
          - "#cookie-accept-btn"
          - ".modal-close"
      - url: https://www.lowes.com/pl/Power-tools
        label: category-power-tools
```

---

## Visual Diff Generation

- **Tool:** Pixelmatch (lightweight, fast, no dependencies)
- **Output:** Diff image with changed pixels highlighted in magenta/red
- **Change Percentage:** Calculated and stored in metadata for quick triage
- **Threshold Tolerance:** Configurable sensitivity to ignore anti-aliasing artifacts

### Output Files Per Capture

```
/2026-03-26
  desktop.png           # Current screenshot
  desktop-diff.png      # Visual diff overlay
  mobile.png
  mobile-diff.png
  metadata.json         # Change %, timestamps, status
  analysis.json         # AI insights (when generated)
```

---

## Viewer Dashboard

### Features

- **Competitor Navigation:** Sidebar listing all tracked competitors
- **Timeline View:** Click any capture date to load that week's data
- **Viewport Toggle:** Switch between Desktop and Mobile
- **Comparison Modes:**
  - Side-by-side (current vs. previous)
  - Diff overlay
  - Before/after slider
- **Change Indicators:** Color-coded badges (green/yellow/red) by change percentage
- **Insights Panel:** Displays AI analysis inline with screenshots
- **Notes Field:** Editable annotations saved to metadata

### Technical Approach

Vanilla HTML + JavaScript + CSS. No framework, no build step. Opens directly from filesystem, works offline, shareable via OneDrive.

---

## AI Analysis Integration

### Workflow

1. Open project in IDE (VS Code with Copilot/Claude)
2. Run analysis command specifying date range and scope
3. AI examines screenshots and diffs
4. Structured insights written to `analysis.json`
5. Viewer displays insights in panel

### Analysis Categories

- 🔶 **Layout:** Element positioning, section changes, above-fold content
- 🎨 **Styling:** Colors, typography, button styles, visual hierarchy
- 📐 **UX Patterns:** Navigation behavior, interaction patterns, new components

### Report Flexibility

- Analyze all competitors for a given week (consolidated)
- Analyze single competitor (focused)
- Analyze date range (monthly summary)

---

## Error Handling

| Scenario | Behavior |
|----------|----------|
| Site down/timeout | Log failure, skip URL, continue with others |
| Drastic layout change | High diff % displayed (valuable signal) |
| Bot detection block | Use Playwright stealth options; add per-site workarounds |
| Modal dismissal fails | Capture includes overlay; refine selector in config |
| Geolocation variation | Accept for MVP; can pin location via proxy later |
| First run (no baseline) | No diff generated; baseline established |

### Logging

All runs logged to `capture-log.txt` with timestamps, success/failure status, and change percentages.

---

## Technology Stack

| Component | Technology | Rationale |
|-----------|------------|-----------|
| Screenshot Capture | Playwright (Node.js) | Handles modern JS sites, viewports, stealth |
| Visual Diffing | Pixelmatch | Lightweight, fast, widely used |
| Configuration | YAML | Human-readable, easy to edit |
| Viewer | Vanilla HTML/JS/CSS | No build step, filesystem-portable |
| Storage | OneDrive | Auto-sync, shareable, existing workflow |
| AI Analysis | Claude via IDE | Zero additional cost |
| Data Format | JSON | Simple, extensible, viewer-readable |

### Dependencies

- Node.js
- Playwright (`npm install playwright`)
- Pixelmatch (`npm install pixelmatch`)
- pngjs (`npm install pngjs`)

---

## Decision Log

| # | Decision | Alternatives Considered | Rationale |
|---|----------|------------------------|-----------|
| 1 | Broad stakeholder audience | Personal; team only | Cross-functional value |
| 2 | Weekly capture frequency | Daily; event-triggered | Signal vs. noise balance |
| 3 | Track PDPs + journeys | Homepages only | UX research focus |
| 4 | Desktop + mobile viewports | Single viewport | Responsive matters |
| 5 | OneDrive storage | Google Drive; custom | Existing workflow |
| 6 | Layout, styling, UX patterns | All changes; content focus | Matches UX role |
| 7 | Self-maintained, low attention | IT-managed; SaaS | Technical comfort + budget |
| 8 | Start free, upgrade later | Pay upfront | Validate first |
| 9 | Custom automation | SaaS tools | UX-tailored; no cost |
| 10 | AI via IDE credits | Paid API; no AI | Zero extra cost |
| 11 | Flexible report scope | Fixed format | Adapts to audience |
| 12 | Analysis in viewer | Separate files | Single source of truth |
| 13 | Manual trigger to start | Auto-scheduled | Reduce initial complexity |
| 14 | Playwright + Pixelmatch + vanilla HTML | Other tools | Reliable, lightweight, free |

---

## Future Enhancements (Post-MVP)

- Automated weekly scheduling via macOS launchd
- Interactive journey recordings (video capture)
- Slack/Teams notifications on significant changes
- Hosted web version for easier stakeholder access
- Historical trend analysis across months

---

## Implementation Handoff

When ready to implement:

1. Initialize Node.js project with dependencies
2. Create folder structure
3. Build capture script with Playwright
4. Build diff generator with Pixelmatch
5. Create viewer HTML/JS/CSS
6. Define initial URL configuration
7. Run first capture and verify output
8. Test AI analysis workflow via IDE

---

*Document generated during brainstorming session, March 26, 2026*
