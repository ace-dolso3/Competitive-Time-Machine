/**
 * Competitive Time Machine - Visual Diff Generator
 * 
 * Compares current captures against previous captures and generates
 * diff images highlighting changed regions.
 * 
 * Usage: npm run diff
 */

import pixelmatch from 'pixelmatch';
import { PNG } from 'pngjs';
import { 
  readFileSync, 
  writeFileSync, 
  readdirSync, 
  existsSync,
  appendFileSync 
} from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { statSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = join(__dirname, '..');
const CAPTURES_DIR = join(ROOT_DIR, 'captures');
const LOG_PATH = join(ROOT_DIR, 'capture-log.txt');

// Diff configuration
const DIFF_CONFIG = {
  threshold: 0.1,        // Matching threshold (0-1, lower = more sensitive)
  includeAA: false,      // Include anti-aliasing differences
  diffColor: [255, 0, 128],     // Magenta for changes
  diffColorAlt: [0, 255, 128],  // Cyan for anti-aliased changes
  alpha: 0.1             // Background opacity
};

/**
 * Log message to console and file
 */
function log(message, level = 'INFO') {
  const timestamp = new Date().toISOString();
  const logLine = `[${timestamp}] [${level}] ${message}`;
  console.log(logLine);
  appendFileSync(LOG_PATH, logLine + '\n');
}

/**
 * Get sorted list of capture dates for a page
 */
function getCaptureDates(pagePath) {
  if (!existsSync(pagePath)) return [];
  
  return readdirSync(pagePath)
    .filter(name => /^\d{4}-\d{2}-\d{2}$/.test(name))
    .sort()
    .reverse(); // Most recent first
}

/**
 * Load PNG image
 */
function loadPNG(imagePath) {
  const data = readFileSync(imagePath);
  return PNG.sync.read(data);
}

/**
 * Generate diff between two images
 */
function generateDiff(currentPath, previousPath, outputPath) {
  try {
    const current = loadPNG(currentPath);
    const previous = loadPNG(previousPath);
    
    // Handle different image sizes
    const width = Math.max(current.width, previous.width);
    const height = Math.max(current.height, previous.height);
    
    // Create canvases at max size
    const currentResized = resizeCanvas(current, width, height);
    const previousResized = resizeCanvas(previous, width, height);
    
    // Create diff output
    const diff = new PNG({ width, height });
    
    // Run pixelmatch
    const numDiffPixels = pixelmatch(
      previousResized.data,
      currentResized.data,
      diff.data,
      width,
      height,
      DIFF_CONFIG
    );
    
    // Calculate change percentage
    const totalPixels = width * height;
    const changePercent = ((numDiffPixels / totalPixels) * 100).toFixed(2);
    
    // Save diff image
    writeFileSync(outputPath, PNG.sync.write(diff));
    
    return {
      success: true,
      diffPixels: numDiffPixels,
      totalPixels,
      changePercent: parseFloat(changePercent),
      dimensions: { width, height }
    };
    
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Resize canvas to target dimensions (pad with transparent pixels)
 */
function resizeCanvas(img, targetWidth, targetHeight) {
  if (img.width === targetWidth && img.height === targetHeight) {
    return img;
  }
  
  const resized = new PNG({ width: targetWidth, height: targetHeight });
  
  // Fill with transparent white
  for (let i = 0; i < resized.data.length; i += 4) {
    resized.data[i] = 255;     // R
    resized.data[i + 1] = 255; // G
    resized.data[i + 2] = 255; // B
    resized.data[i + 3] = 255; // A
  }
  
  // Copy original image data
  for (let y = 0; y < img.height; y++) {
    for (let x = 0; x < img.width; x++) {
      const srcIdx = (y * img.width + x) * 4;
      const destIdx = (y * targetWidth + x) * 4;
      resized.data[destIdx] = img.data[srcIdx];
      resized.data[destIdx + 1] = img.data[srcIdx + 1];
      resized.data[destIdx + 2] = img.data[srcIdx + 2];
      resized.data[destIdx + 3] = img.data[srcIdx + 3];
    }
  }
  
  return resized;
}

/**
 * Write metadata JSON for a capture date
 */
function writeMetadata(datePath, viewportDiffs) {
  const metadataPath = join(datePath, 'metadata.json');
  
  const metadata = {
    captureDate: datePath.split('/').pop(),
    generatedAt: new Date().toISOString(),
    viewports: viewportDiffs
  };
  
  writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));
  return metadataPath;
}

/**
 * Process diffs for a single page
 */
function processPageDiffs(competitorName, pageLabel, pagePath) {
  const dates = getCaptureDates(pagePath);
  
  if (dates.length < 2) {
    log(`  ${pageLabel}: No previous capture to diff against (first run)`);
    return { skipped: true, reason: 'no_baseline' };
  }
  
  const currentDate = dates[0];
  const previousDate = dates[1];
  
  log(`  ${pageLabel}: Comparing ${currentDate} vs ${previousDate}`);
  
  const currentPath = join(pagePath, currentDate);
  const previousPath = join(pagePath, previousDate);
  
  const viewportResults = {};
  
  // Process each viewport
  for (const viewport of ['desktop', 'mobile']) {
    const currentImg = join(currentPath, `${viewport}.png`);
    const previousImg = join(previousPath, `${viewport}.png`);
    const diffOutput = join(currentPath, `${viewport}-diff.png`);
    
    if (!existsSync(currentImg)) {
      log(`    ${viewport}: Current image not found`, 'WARN');
      viewportResults[viewport] = { success: false, error: 'current_not_found' };
      continue;
    }
    
    if (!existsSync(previousImg)) {
      log(`    ${viewport}: Previous image not found`, 'WARN');
      viewportResults[viewport] = { success: false, error: 'previous_not_found' };
      continue;
    }
    
    const result = generateDiff(currentImg, previousImg, diffOutput);
    
    if (result.success) {
      const emoji = result.changePercent > 10 ? '🔴' : result.changePercent > 2 ? '🟡' : '🟢';
      log(`    ${viewport}: ${emoji} ${result.changePercent}% changed`);
    } else {
      log(`    ${viewport}: Failed - ${result.error}`, 'ERROR');
    }
    
    viewportResults[viewport] = result;
  }
  
  // Write metadata
  writeMetadata(join(pagePath, currentDate), viewportResults);
  
  return viewportResults;
}

/**
 * Process all diffs for a competitor
 */
function processCompetitorDiffs(competitorPath, competitorName) {
  log(`\n${'═'.repeat(60)}`);
  log(`Processing: ${competitorName.toUpperCase()}`);
  log(`${'═'.repeat(60)}`);
  
  const pages = readdirSync(competitorPath).filter(name => 
    !name.startsWith('.') && statSync(join(competitorPath, name)).isDirectory()
  );
  const results = {};
  
  for (const pageLabel of pages) {
    const pagePath = join(competitorPath, pageLabel);
    results[pageLabel] = processPageDiffs(competitorName, pageLabel, pagePath);
  }
  
  return results;
}

/**
 * Generate summary statistics
 */
function generateSummary(allResults) {
  let totalPages = 0;
  let pagesWithChanges = 0;
  let significantChanges = 0;
  
  for (const [competitor, pages] of Object.entries(allResults)) {
    for (const [page, viewports] of Object.entries(pages)) {
      if (viewports.skipped) continue;
      
      totalPages++;
      
      for (const [viewport, result] of Object.entries(viewports)) {
        if (result.success && result.changePercent > 0) {
          pagesWithChanges++;
          if (result.changePercent > 10) {
            significantChanges++;
          }
        }
      }
    }
  }
  
  return {
    totalPages,
    pagesWithChanges,
    significantChanges
  };
}

/**
 * Main entry point
 */
function main() {
  log(`\n${'═'.repeat(60)}`);
  log(`COMPETITIVE TIME MACHINE - Diff Generation`);
  log(`${'═'.repeat(60)}\n`);
  
  if (!existsSync(CAPTURES_DIR)) {
    log('No captures directory found. Run `npm run capture` first.', 'ERROR');
    process.exit(1);
  }
  
  const competitors = readdirSync(CAPTURES_DIR).filter(name => 
    !name.startsWith('.') && statSync(join(CAPTURES_DIR, name)).isDirectory()
  );
  
  if (competitors.length === 0) {
    log('No competitor captures found. Run `npm run capture` first.', 'ERROR');
    process.exit(1);
  }
  
  const allResults = {};
  
  for (const competitorName of competitors) {
    const competitorPath = join(CAPTURES_DIR, competitorName);
    allResults[competitorName] = processCompetitorDiffs(competitorPath, competitorName);
  }
  
  // Summary
  const summary = generateSummary(allResults);
  
  log(`\n${'═'.repeat(60)}`);
  log(`DIFF GENERATION COMPLETE`);
  log(`${'═'.repeat(60)}`);
  log(`Total pages processed: ${summary.totalPages}`);
  log(`Pages with changes: ${summary.pagesWithChanges}`);
  log(`Significant changes (>10%): ${summary.significantChanges}`);
  log(`\nOpen viewer/index.html to explore the results.\n`);
}

// Run
main();
