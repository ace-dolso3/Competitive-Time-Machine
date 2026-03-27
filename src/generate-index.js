/**
 * Index Generator
 * 
 * Scans the captures directory and generates an index.json
 * that the viewer uses to navigate screenshots.
 * 
 * Run: npm run index
 */

import { readdir, stat, writeFile } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';

const CAPTURES_DIR = './captures';

async function generateIndex() {
  console.log('📋 Generating captures index...\n');
  
  if (!existsSync(CAPTURES_DIR)) {
    console.log('No captures directory found. Run `npm run capture` first.');
    return;
  }
  
  const index = {
    generated: new Date().toISOString(),
    competitors: []
  };
  
  // Scan competitors
  const competitors = await readdir(CAPTURES_DIR);
  
  for (const competitor of competitors) {
    const competitorPath = join(CAPTURES_DIR, competitor);
    const competitorStat = await stat(competitorPath);
    
    if (!competitorStat.isDirectory()) continue;
    
    const competitorData = {
      name: competitor,
      displayName: formatName(competitor),
      pages: []
    };
    
    // Scan pages
    const pages = await readdir(competitorPath);
    
    for (const page of pages) {
      const pagePath = join(competitorPath, page);
      const pageStat = await stat(pagePath);
      
      if (!pageStat.isDirectory()) continue;
      
      const pageData = {
        label: page,
        dates: []
      };
      
      // Scan dates
      const dates = await readdir(pagePath);
      
      for (const date of dates) {
        const datePath = join(pagePath, date);
        const dateStat = await stat(datePath);
        
        if (!dateStat.isDirectory()) continue;
        
        // Check what files exist
        const files = await readdir(datePath);
        
        pageData.dates.push({
          date: date,
          hasDesktop: files.includes('desktop.png'),
          hasMobile: files.includes('mobile.png'),
          hasDesktopDiff: files.includes('desktop-diff.png'),
          hasMobileDiff: files.includes('mobile-diff.png'),
          hasMetadata: files.includes('metadata.json'),
          hasAnalysis: files.includes('analysis.json')
        });
      }
      
      // Sort dates descending (newest first)
      pageData.dates.sort((a, b) => b.date.localeCompare(a.date));
      
      if (pageData.dates.length > 0) {
        competitorData.pages.push(pageData);
      }
    }
    
    // Sort pages in canonical flow order
    const PAGE_ORDER = ['homepage', 'category', 'PLP', 'PDP', 'cart', 'checkout'];
    competitorData.pages.sort((a, b) => {
      const ai = PAGE_ORDER.indexOf(a.label);
      const bi = PAGE_ORDER.indexOf(b.label);
      if (ai === -1 && bi === -1) return a.label.localeCompare(b.label);
      if (ai === -1) return 1;
      if (bi === -1) return -1;
      return ai - bi;
    });

    if (competitorData.pages.length > 0) {
      index.competitors.push(competitorData);
    }
  }
  
  // Write index
  const indexPath = join(CAPTURES_DIR, 'index.json');
  await writeFile(indexPath, JSON.stringify(index, null, 2));
  
  console.log(`✓ Index generated: ${indexPath}`);
  console.log(`  - ${index.competitors.length} competitors`);
  
  let totalPages = 0;
  let totalCaptures = 0;
  
  for (const c of index.competitors) {
    totalPages += c.pages.length;
    for (const p of c.pages) {
      totalCaptures += p.dates.length;
    }
  }
  
  console.log(`  - ${totalPages} pages`);
  console.log(`  - ${totalCaptures} captures`);
}

function formatName(name) {
  const names = {
    lowes: "Lowe's",
    homedepot: 'Home Depot',
    menards: 'Menards',
    amazon: 'Amazon'
  };
  return names[name] || name.charAt(0).toUpperCase() + name.slice(1);
}

generateIndex();
