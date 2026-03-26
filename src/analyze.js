/**
 * Competitive Time Machine - AI Analysis
 * 
 * Uses Claude's vision API to analyze differences between captures
 * and generate human-readable descriptions of what changed.
 * 
 * Usage: npm run analyze
 * 
 * Requires: ANTHROPIC_API_KEY environment variable
 */

import Anthropic from '@anthropic-ai/sdk';
import { 
  readFileSync, 
  writeFileSync, 
  readdirSync, 
  existsSync 
} from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { statSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = join(__dirname, '..');
const CAPTURES_DIR = join(ROOT_DIR, 'captures');

// Initialize Anthropic client
const anthropic = new Anthropic();

/**
 * Convert image file to base64
 */
function imageToBase64(imagePath) {
  const buffer = readFileSync(imagePath);
  return buffer.toString('base64');
}

/**
 * Get image media type from path
 */
function getMediaType(imagePath) {
  if (imagePath.endsWith('.png')) return 'image/png';
  if (imagePath.endsWith('.jpg') || imagePath.endsWith('.jpeg')) return 'image/jpeg';
  if (imagePath.endsWith('.webp')) return 'image/webp';
  return 'image/png';
}

/**
 * Analyze changes between two captures using Claude Vision
 */
async function analyzeChanges(currentPath, previousPath, diffPath, context) {
  const { competitor, page, viewport, currentDate, previousDate, changePercent } = context;
  
  console.log(`    Analyzing ${viewport}...`);
  
  // Build message content with images
  const content = [];
  
  // Add context text
  content.push({
    type: 'text',
    text: `You are analyzing competitive intelligence screenshots for retail comparison.

CONTEXT:
- Competitor: ${competitor}
- Page: ${page}
- Viewport: ${viewport}
- Current Date: ${currentDate}
- Previous Date: ${previousDate}
- Pixel Change: ${changePercent}%

I'm showing you three images:
1. PREVIOUS screenshot (${previousDate})
2. CURRENT screenshot (${currentDate})  
3. DIFF image highlighting changes in magenta

Please analyze what changed and provide:
1. **Summary**: A 1-2 sentence summary of the key changes
2. **Promotional Changes**: Any new banners, sales, or promotions
3. **Product Changes**: New featured products or category highlights
4. **Layout Changes**: Any structural or navigation changes
5. **Pricing Signals**: Any visible price changes or discount messaging
6. **Strategic Insights**: What might this tell us about their strategy?

Be specific and actionable. Focus on changes that would be relevant to a competitor (Ace Hardware).`
  });
  
  // Add previous image
  if (existsSync(previousPath)) {
    content.push({
      type: 'image',
      source: {
        type: 'base64',
        media_type: getMediaType(previousPath),
        data: imageToBase64(previousPath)
      }
    });
    content.push({ type: 'text', text: `[PREVIOUS - ${previousDate}]` });
  }
  
  // Add current image
  if (existsSync(currentPath)) {
    content.push({
      type: 'image',
      source: {
        type: 'base64',
        media_type: getMediaType(currentPath),
        data: imageToBase64(currentPath)
      }
    });
    content.push({ type: 'text', text: `[CURRENT - ${currentDate}]` });
  }
  
  // Add diff image if it exists
  if (existsSync(diffPath)) {
    content.push({
      type: 'image',
      source: {
        type: 'base64',
        media_type: getMediaType(diffPath),
        data: imageToBase64(diffPath)
      }
    });
    content.push({ type: 'text', text: '[DIFF - Changes highlighted in magenta]' });
  }
  
  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1500,
      messages: [{ role: 'user', content }]
    });
    
    return {
      success: true,
      analysis: response.content[0].text,
      model: response.model,
      tokens: response.usage
    };
  } catch (error) {
    console.error(`    Error analyzing ${viewport}:`, error.message);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Get sorted list of capture dates for a page
 */
function getCaptureDates(pagePath) {
  if (!existsSync(pagePath)) return [];
  
  return readdirSync(pagePath)
    .filter(name => /^\d{4}-\d{2}-\d{2}$/.test(name))
    .sort()
    .reverse();
}

/**
 * Load metadata for a capture date
 */
function loadMetadata(datePath) {
  const metadataPath = join(datePath, 'metadata.json');
  if (!existsSync(metadataPath)) return null;
  return JSON.parse(readFileSync(metadataPath, 'utf-8'));
}

/**
 * Process analysis for a single page
 */
async function analyzePageChanges(competitorName, pageLabel, pagePath) {
  const dates = getCaptureDates(pagePath);
  
  if (dates.length < 2) {
    console.log(`  ${pageLabel}: Skipping (need 2+ captures)`);
    return { skipped: true, reason: 'insufficient_captures' };
  }
  
  const currentDate = dates[0];
  const previousDate = dates[1];
  
  console.log(`  ${pageLabel}: Analyzing changes (${currentDate} vs ${previousDate})`);
  
  const currentPath = join(pagePath, currentDate);
  const previousPath = join(pagePath, previousDate);
  
  // Load metadata for change percentages
  const metadata = loadMetadata(currentPath);
  
  const analysis = {
    generatedAt: new Date().toISOString(),
    competitor: competitorName,
    page: pageLabel,
    currentDate,
    previousDate,
    viewports: {}
  };
  
  // Analyze each viewport
  for (const viewport of ['desktop', 'mobile']) {
    const currentImg = join(currentPath, `${viewport}.png`);
    const previousImg = join(previousPath, `${viewport}.png`);
    const diffImg = join(currentPath, `${viewport}-diff.png`);
    
    if (!existsSync(currentImg) || !existsSync(previousImg)) {
      console.log(`    ${viewport}: Missing images, skipping`);
      analysis.viewports[viewport] = { skipped: true, reason: 'missing_images' };
      continue;
    }
    
    const changePercent = metadata?.viewports?.[viewport]?.changePercent ?? 'unknown';
    
    // Skip if no changes detected
    if (changePercent === 0) {
      console.log(`    ${viewport}: No changes detected, skipping AI analysis`);
      analysis.viewports[viewport] = { 
        skipped: true, 
        reason: 'no_changes',
        summary: 'No visual changes detected between captures.'
      };
      continue;
    }
    
    const result = await analyzeChanges(
      currentImg, 
      previousImg, 
      diffImg,
      {
        competitor: competitorName,
        page: pageLabel,
        viewport,
        currentDate,
        previousDate,
        changePercent
      }
    );
    
    analysis.viewports[viewport] = result;
  }
  
  // Save analysis
  const analysisPath = join(currentPath, 'analysis.json');
  writeFileSync(analysisPath, JSON.stringify(analysis, null, 2));
  console.log(`    ✓ Saved to ${analysisPath}`);
  
  return analysis;
}

/**
 * Main entry point
 */
async function main() {
  console.log('\n' + '═'.repeat(60));
  console.log('COMPETITIVE TIME MACHINE - AI Analysis');
  console.log('═'.repeat(60) + '\n');
  
  // Check for API key
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('ERROR: ANTHROPIC_API_KEY environment variable not set');
    console.error('');
    console.error('To set it:');
    console.error('  export ANTHROPIC_API_KEY="your-key-here"');
    console.error('');
    console.error('Or create a .env file with:');
    console.error('  ANTHROPIC_API_KEY=your-key-here');
    process.exit(1);
  }
  
  if (!existsSync(CAPTURES_DIR)) {
    console.error('No captures directory found. Add captures first.');
    process.exit(1);
  }
  
  const competitors = readdirSync(CAPTURES_DIR).filter(name => 
    !name.startsWith('.') && statSync(join(CAPTURES_DIR, name)).isDirectory()
  );
  
  if (competitors.length === 0) {
    console.error('No competitor captures found.');
    process.exit(1);
  }
  
  let totalAnalyzed = 0;
  
  for (const competitorName of competitors) {
    console.log(`\n${'─'.repeat(60)}`);
    console.log(`Competitor: ${competitorName.toUpperCase()}`);
    console.log('─'.repeat(60));
    
    const competitorPath = join(CAPTURES_DIR, competitorName);
    const pages = readdirSync(competitorPath).filter(name => 
      !name.startsWith('.') && statSync(join(competitorPath, name)).isDirectory()
    );
    
    for (const pageLabel of pages) {
      const pagePath = join(competitorPath, pageLabel);
      const result = await analyzePageChanges(competitorName, pageLabel, pagePath);
      
      if (!result.skipped) {
        totalAnalyzed++;
      }
    }
  }
  
  console.log(`\n${'═'.repeat(60)}`);
  console.log(`ANALYSIS COMPLETE`);
  console.log('═'.repeat(60));
  console.log(`Pages analyzed: ${totalAnalyzed}`);
  console.log('\nOpen viewer/index.html to see the results.');
}

main().catch(console.error);
