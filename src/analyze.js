/**
 * Competitive Time Machine - Feature Analysis
 * 
 * Uses Claude's vision API, when available, to confirm feature-level
 * changes between captures and generate structured summaries.
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

// Initialize Anthropic client when a key is available.
const anthropic = process.env.ANTHROPIC_API_KEY ? new Anthropic() : null;

const FEATURE_STATUS = {
  NEW: 'new_feature',
  UPDATED: 'updated_feature',
  NONE: 'no_feature_change',
  REVIEW: 'review_required',
  UNCERTAIN: 'uncertain'
};

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

function extractJsonObject(text) {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');

  if (start === -1 || end === -1 || end <= start) {
    throw new Error('No JSON object found in model response');
  }

  return JSON.parse(text.slice(start, end + 1));
}

function ensureArray(value) {
  return Array.isArray(value)
    ? value.filter(item => typeof item === 'string' && item.trim())
    : [];
}

function normalizeFeatureStatus(status) {
  const allowed = new Set(Object.values(FEATURE_STATUS));
  return allowed.has(status) ? status : FEATURE_STATUS.UNCERTAIN;
}

function normalizeFeatureAnalysis(rawAnalysis, context) {
  const status = normalizeFeatureStatus(rawAnalysis?.status);
  const summary = typeof rawAnalysis?.summary === 'string' && rawAnalysis.summary.trim()
    ? rawAnalysis.summary.trim()
    : defaultFeatureSummary(status, context.changePercent);

  return {
    status,
    summary,
    newFeatures: ensureArray(rawAnalysis?.newFeatures),
    updatedFeatures: ensureArray(rawAnalysis?.updatedFeatures),
    removedFeatures: ensureArray(rawAnalysis?.removedFeatures),
    evidence: ensureArray(rawAnalysis?.evidence),
    ignoredNoise: ensureArray(rawAnalysis?.ignoredNoise),
    strategicInsights: ensureArray(rawAnalysis?.strategicInsights),
    confidence: typeof rawAnalysis?.confidence === 'string' ? rawAnalysis.confidence : 'medium'
  };
}

function defaultFeatureSummary(status, changePercent) {
  switch (status) {
    case FEATURE_STATUS.NEW:
      return 'A net-new page feature is visible in this comparison.';
    case FEATURE_STATUS.UPDATED:
      return 'An existing page feature appears to have been meaningfully updated.';
    case FEATURE_STATUS.NONE:
      return 'No new or updated feature is confirmed in this comparison.';
    case FEATURE_STATUS.REVIEW:
      return `Visual differences (${changePercent}%) were detected, but only confirmed feature changes should be surfaced. Review is still required.`;
    default:
      return 'The comparison is inconclusive for feature-level changes.';
  }
}

function formatFeatureAnalysisMarkdown(featureAnalysis) {
  const sections = [
    `**Summary**: ${featureAnalysis.summary}`,
    `**Status**: ${featureAnalysis.status}`
  ];

  if (featureAnalysis.newFeatures.length > 0) {
    sections.push(`**New Features**:\n- ${featureAnalysis.newFeatures.join('\n- ')}`);
  }

  if (featureAnalysis.updatedFeatures.length > 0) {
    sections.push(`**Updated Features**:\n- ${featureAnalysis.updatedFeatures.join('\n- ')}`);
  }

  if (featureAnalysis.removedFeatures.length > 0) {
    sections.push(`**Removed Features**:\n- ${featureAnalysis.removedFeatures.join('\n- ')}`);
  }

  if (featureAnalysis.evidence.length > 0) {
    sections.push(`**Evidence**:\n- ${featureAnalysis.evidence.join('\n- ')}`);
  }

  if (featureAnalysis.ignoredNoise.length > 0) {
    sections.push(`**Ignored Noise**:\n- ${featureAnalysis.ignoredNoise.join('\n- ')}`);
  }

  if (featureAnalysis.strategicInsights.length > 0) {
    sections.push(`**Strategic Insights**:\n- ${featureAnalysis.strategicInsights.join('\n- ')}`);
  }

  return sections.join('\n\n');
}

function createFallbackViewportAnalysis(context) {
  const status = context.changePercent === 0
    ? FEATURE_STATUS.NONE
    : FEATURE_STATUS.REVIEW;

  const featureAnalysis = {
    status,
    summary: defaultFeatureSummary(status, context.changePercent),
    newFeatures: [],
    updatedFeatures: [],
    removedFeatures: [],
    evidence: context.changePercent === 0
      ? ['No visual diff was detected for this viewport.']
      : ['A visual diff exists, but raw image or copy deltas are intentionally ignored until a feature change is confirmed.'],
    ignoredNoise: [
      'Copy, imagery, pricing, and simple styling changes are not treated as feature changes by default.'
    ],
    strategicInsights: [],
    confidence: context.changePercent === 0 ? 'high' : 'low'
  };

  return {
    success: true,
    source: 'fallback',
    featureStatus: status,
    changeSummary: featureAnalysis.summary,
    featureAnalysis,
    analysis: formatFeatureAnalysisMarkdown(featureAnalysis)
  };
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

Your task is feature-first analysis only.

RULES:
- Only report a change if it introduces, removes, or materially updates a feature, UI module, navigation pattern, merchandising mechanism, shopping-flow element, filtering/sorting tool, service widget, or reusable experience component.
- Treat pure text swaps, image swaps, pricing changes, SKU changes, seasonal art, and cosmetic styling tweaks as noise unless they clearly represent a changed feature.
- A promotion only counts if the promotional treatment itself is a new or materially changed feature or module.
- If there is visual movement but no confirmed feature change, say so.
- Be conservative. False negatives are better than false positives.

Return strict JSON only using this schema:
{
  "status": "new_feature" | "updated_feature" | "no_feature_change" | "review_required" | "uncertain",
  "summary": "one or two sentences",
  "newFeatures": ["..."],
  "updatedFeatures": ["..."],
  "removedFeatures": ["..."],
  "evidence": ["..."],
  "ignoredNoise": ["..."],
  "strategicInsights": ["..."],
  "confidence": "high" | "medium" | "low"
}`
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

    const rawText = response.content[0].text;
    const parsed = normalizeFeatureAnalysis(extractJsonObject(rawText), context);
    
    return {
      success: true,
      source: 'anthropic',
      featureStatus: parsed.status,
      changeSummary: parsed.summary,
      featureAnalysis: parsed,
      analysis: formatFeatureAnalysisMarkdown(parsed),
      rawResponse: rawText,
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
export function getCaptureDates(pagePath) {
  if (!existsSync(pagePath)) return [];
  
  return readdirSync(pagePath)
    .filter(name => /^\d{4}-\d{2}-\d{2}$/.test(name))
    .sort()
    .reverse();
}

/**
 * Load metadata for a capture date
 */
export function loadMetadata(datePath) {
  const metadataPath = join(datePath, 'metadata.json');
  if (!existsSync(metadataPath)) return null;
  return JSON.parse(readFileSync(metadataPath, 'utf-8'));
}

/**
 * Process analysis for a single page
 */
export async function analyzePageChanges(competitorName, pageLabel, pagePath, options = {}) {
  const {
    skipIfAnalysisExists = false,
    force = false
  } = options;

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
  const analysisPath = join(currentPath, 'analysis.json');

  if (skipIfAnalysisExists && !force && existsSync(analysisPath)) {
    console.log(`  ${pageLabel}: Skipping (analysis already exists)`);
    return {
      skipped: true,
      reason: 'analysis_exists',
      analysisPath,
      competitor: competitorName,
      page: pageLabel,
      currentDate,
      previousDate
    };
  }
  
  // Load metadata for change percentages
  const metadata = loadMetadata(currentPath);
  
  const analysis = {
    generatedAt: new Date().toISOString(),
    competitor: competitorName,
    page: pageLabel,
    currentDate,
    previousDate,
    analysisMode: process.env.ANTHROPIC_API_KEY ? 'anthropic' : 'fallback',
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
      analysis.viewports[viewport] = createFallbackViewportAnalysis({
        competitor: competitorName,
        page: pageLabel,
        viewport,
        currentDate,
        previousDate,
        changePercent
      });
      continue;
    }

    const context = {
      competitor: competitorName,
      page: pageLabel,
      viewport,
      currentDate,
      previousDate,
      changePercent
    };

    const result = process.env.ANTHROPIC_API_KEY
      ? await analyzeChanges(currentImg, previousImg, diffImg, context)
      : createFallbackViewportAnalysis(context);
    
    analysis.viewports[viewport] = result;
  }
  
  // Save analysis
  writeFileSync(analysisPath, JSON.stringify(analysis, null, 2));
  console.log(`    ✓ Saved to ${analysisPath}`);
  
    return {
      ...analysis,
      analysisPath
    };
}

export function collectAnalyzablePages(filters = {}) {
  const {
    competitors: competitorFilter,
    pages: pageFilter,
    since
  } = filters;

  if (!existsSync(CAPTURES_DIR)) {
    return [];
  }

  const normalizedCompetitorFilter = competitorFilter
    ? new Set(competitorFilter.map(item => item.toLowerCase()))
    : null;
  const normalizedPageFilter = pageFilter
    ? new Set(pageFilter.map(item => item.toLowerCase()))
    : null;

  const competitors = readdirSync(CAPTURES_DIR).filter(name =>
    !name.startsWith('.') && statSync(join(CAPTURES_DIR, name)).isDirectory()
  );

  const jobs = [];

  for (const competitorName of competitors) {
    if (normalizedCompetitorFilter && !normalizedCompetitorFilter.has(competitorName.toLowerCase())) {
      continue;
    }

    const competitorPath = join(CAPTURES_DIR, competitorName);
    const pages = readdirSync(competitorPath).filter(name =>
      !name.startsWith('.') && statSync(join(competitorPath, name)).isDirectory()
    );

    for (const pageLabel of pages) {
      if (normalizedPageFilter && !normalizedPageFilter.has(pageLabel.toLowerCase())) {
        continue;
      }

      const pagePath = join(competitorPath, pageLabel);
      const dates = getCaptureDates(pagePath);
      if (dates.length < 2) {
        continue;
      }

      const currentDate = dates[0];
      const previousDate = dates[1];
      if (since && currentDate < since) {
        continue;
      }

      jobs.push({
        id: `${competitorName}/${pageLabel}/${currentDate}`,
        competitor: competitorName,
        page: pageLabel,
        pagePath,
        currentDate,
        previousDate
      });
    }
  }

  return jobs;
}

export async function runStandardAnalysis() {
  let totalAnalyzed = 0;

  const jobs = collectAnalyzablePages();
  const grouped = new Map();

  for (const job of jobs) {
    if (!grouped.has(job.competitor)) {
      grouped.set(job.competitor, []);
    }
    grouped.get(job.competitor).push(job);
  }

  for (const [competitorName, competitorJobs] of grouped.entries()) {
    console.log(`\n${'─'.repeat(60)}`);
    console.log(`Competitor: ${competitorName.toUpperCase()}`);
    console.log('─'.repeat(60));

    for (const job of competitorJobs) {
      const result = await analyzePageChanges(job.competitor, job.page, job.pagePath);
      if (!result.skipped) {
        totalAnalyzed++;
      }
    }
  }

  return { totalAnalyzed, totalJobs: jobs.length };
}

/**
 * Main entry point
 */
async function main() {
  console.log('\n' + '═'.repeat(60));
  console.log('COMPETITIVE TIME MACHINE - Feature Analysis');
  console.log('═'.repeat(60) + '\n');
  
  if (!process.env.ANTHROPIC_API_KEY) {
    console.warn('WARNING: ANTHROPIC_API_KEY environment variable not set');
    console.warn('Using fallback feature-review mode.');
  }
  
  if (!existsSync(CAPTURES_DIR)) {
    console.error('No captures directory found. Add captures first.');
    process.exit(1);
  }
  
  const jobs = collectAnalyzablePages();

  if (jobs.length === 0) {
    console.error('No competitor captures found.');
    process.exit(1);
  }

  const { totalAnalyzed } = await runStandardAnalysis();
  
  console.log(`\n${'═'.repeat(60)}`);
  console.log(`ANALYSIS COMPLETE`);
  console.log('═'.repeat(60));
  console.log(`Pages analyzed: ${totalAnalyzed}`);
  console.log('\nOpen viewer/index.html to see the results.');
}

const isDirectRun = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isDirectRun) {
  main().catch(console.error);
}
