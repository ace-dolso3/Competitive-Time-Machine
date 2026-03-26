/**
 * Competitive Time Machine - Viewer Application
 * 
 * Interactive dashboard for viewing screenshots, diffs, and analysis.
 * Runs entirely in the browser from the filesystem.
 */

// ═══════════════════════════════════════════════════════════════
// STATE
// ═══════════════════════════════════════════════════════════════

const state = {
  competitors: [],
  currentCompetitor: null,
  currentPage: null,
  currentDate: null,
  currentViewport: 'desktop',
  viewMode: 'sidebyside', // 'sidebyside', 'diff', 'slider'
  capturesPath: '../captures'
};

// ═══════════════════════════════════════════════════════════════
// DATA LOADING
// ═══════════════════════════════════════════════════════════════

/**
 * Scan captures directory structure
 * Note: Due to browser security, this uses a predefined structure
 * In a real deployment, you'd use a generated index.json
 */
async function loadCapturesIndex() {
  try {
    // Try to load generated index (cache-busted)
    const response = await fetch(`../captures/index.json?t=${Date.now()}`);
    if (response.ok) {
      return await response.json();
    }
  } catch (e) {
    console.log('No index.json found, using fallback detection');
  }
  
  // Fallback: try to detect competitors from known list
  const knownCompetitors = ['lowes', 'homedepot', 'menards', 'amazon'];
  const competitors = [];
  
  for (const name of knownCompetitors) {
    try {
      // Try to access competitor directory
      const testPath = `../captures/${name}`;
      competitors.push({
        name: name,
        displayName: formatCompetitorName(name),
        pages: [] // Will be populated when selected
      });
    } catch (e) {
      // Competitor doesn't exist
    }
  }
  
  return { competitors };
}

/**
 * Load metadata for a specific capture
 */
async function loadMetadata(competitor, page, date) {
  try {
    const path = `../captures/${competitor}/${page}/${date}/metadata.json`;
    const response = await fetch(path);
    if (response.ok) {
      return await response.json();
    }
  } catch (e) {
    console.log('No metadata found for', competitor, page, date);
  }
  return null;
}

/**
 * Load AI analysis for a specific capture
 */
async function loadAnalysis(competitor, page, date) {
  try {
    const path = `../captures/${competitor}/${page}/${date}/analysis.json`;
    const response = await fetch(path);
    if (response.ok) {
      return await response.json();
    }
  } catch (e) {
    console.log('No analysis found for', competitor, page, date);
  }
  return null;
}

// ═══════════════════════════════════════════════════════════════
// RENDERING
// ═══════════════════════════════════════════════════════════════

/**
 * Render competitor list in sidebar
 */
function renderCompetitorList() {
  const list = document.getElementById('competitor-list');
  list.innerHTML = '';
  
  for (const competitor of state.competitors) {
    const li = document.createElement('li');
    const a = document.createElement('a');
    a.href = '#';
    a.textContent = competitor.displayName;
    a.dataset.competitor = competitor.name;
    
    if (competitor.name === state.currentCompetitor) {
      a.classList.add('active');
    }
    
    a.addEventListener('click', (e) => {
      e.preventDefault();
      selectCompetitor(competitor.name);
    });
    
    li.appendChild(a);
    list.appendChild(li);
  }
}

/**
 * Render page navigation buttons
 */
function renderPageNav(pages) {
  const nav = document.getElementById('page-nav');
  nav.innerHTML = '';
  
  for (const page of pages) {
    const btn = document.createElement('button');
    btn.className = 'page-btn';
    btn.textContent = formatPageLabel(page.label);
    btn.dataset.page = page.label;
    
    if (page.changeLevel) {
      const badge = document.createElement('span');
      badge.className = `change-badge ${page.changeLevel}`;
      btn.appendChild(badge);
    }
    
    if (page.label === state.currentPage) {
      btn.classList.add('active');
    }
    
    btn.addEventListener('click', () => selectPage(page.label));
    nav.appendChild(btn);
  }
}

/**
 * Render timeline for a page
 */
function renderTimeline(dates) {
  const timeline = document.getElementById('timeline');
  timeline.innerHTML = '';
  
  for (const date of dates) {
    const item = document.createElement('button');
    item.className = 'timeline-item';
    item.textContent = formatDate(date);
    item.dataset.date = date;
    
    if (date === state.currentDate) {
      item.classList.add('active');
    }
    
    item.addEventListener('click', () => selectDate(date));
    timeline.appendChild(item);
  }
}

/**
 * Render screenshot viewer based on current mode
 */
function renderViewer() {
  const panel = document.getElementById('viewer-panel');
  
  if (!state.currentCompetitor || !state.currentPage || !state.currentDate) {
    panel.innerHTML = `
      <div class="empty-state">
        <p>👈 Select a competitor and page to begin</p>
      </div>
    `;
    return;
  }
  
  const basePath = `../captures/${state.currentCompetitor}/${state.currentPage}`;
  const currentPath = `${basePath}/${state.currentDate}`;
  const viewport = state.currentViewport;
  
  // Find previous date
  const dates = getAvailableDates();
  const currentIndex = dates.indexOf(state.currentDate);
  const previousDate = currentIndex < dates.length - 1 ? dates[currentIndex + 1] : null;
  const previousPath = previousDate ? `${basePath}/${previousDate}` : null;
  
  switch (state.viewMode) {
    case 'sidebyside':
      renderSideBySide(panel, currentPath, previousPath, viewport);
      break;
    case 'diff':
      renderDiffView(panel, currentPath, viewport);
      break;
    case 'slider':
      renderSliderView(panel, currentPath, previousPath, viewport);
      break;
  }
}

function renderSideBySide(panel, currentPath, previousPath, viewport) {
  const currentImg = `${currentPath}/${viewport}.png`;
  const previousImg = previousPath ? `${previousPath}/${viewport}.png` : null;
  
  panel.innerHTML = `
    <div class="side-by-side">
      <div class="comparison-panel">
        <h4>Current (${state.currentDate})</h4>
        <img src="${currentImg}" alt="Current capture" onerror="this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%22400%22 height=%22300%22><text x=%2250%%22 y=%2250%%22 text-anchor=%22middle%22 fill=%22%23888%22>Image not found</text></svg>'">
      </div>
      <div class="comparison-panel">
        <h4>Previous ${previousPath ? `(${previousPath.split('/').pop()})` : '(None)'}</h4>
        ${previousImg 
          ? `<img src="${previousImg}" alt="Previous capture" onerror="this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%22400%22 height=%22300%22><text x=%2250%%22 y=%2250%%22 text-anchor=%22middle%22 fill=%22%23888%22>Image not found</text></svg>'">`
          : '<div class="empty-state"><p>No previous capture</p></div>'
        }
      </div>
    </div>
  `;
}

function renderDiffView(panel, currentPath, viewport) {
  const diffImg = `${currentPath}/${viewport}-diff.png`;
  
  panel.innerHTML = `
    <div class="diff-view">
      <img src="${diffImg}" alt="Diff overlay" onerror="this.parentElement.innerHTML='<div class=\\'empty-state\\'><p>No diff available (first capture?)</p></div>'">
    </div>
  `;
}

function renderSliderView(panel, currentPath, previousPath, viewport) {
  const currentImg = `${currentPath}/${viewport}.png`;
  const previousImg = previousPath ? `${previousPath}/${viewport}.png` : null;
  
  if (!previousImg) {
    panel.innerHTML = `
      <div class="empty-state">
        <p>No previous capture for slider comparison</p>
      </div>
    `;
    return;
  }
  
  panel.innerHTML = `
    <div class="slider-view" id="slider-container">
      <img class="after-img" src="${currentImg}" alt="Current">
      <img class="before-img" src="${previousImg}" alt="Previous" id="before-img">
      <input type="range" min="0" max="100" value="50" id="comparison-slider">
    </div>
  `;
  
  // Set up slider interaction
  const slider = document.getElementById('comparison-slider');
  const beforeImg = document.getElementById('before-img');
  
  slider.addEventListener('input', (e) => {
    const value = e.target.value;
    beforeImg.style.clipPath = `inset(0 ${100 - value}% 0 0)`;
  });
}

/**
 * Render analysis panel content
 */
async function renderAnalysis() {
  if (!state.currentCompetitor || !state.currentPage || !state.currentDate) {
    return;
  }
  
  // Load metadata
  const metadata = await loadMetadata(
    state.currentCompetitor, 
    state.currentPage, 
    state.currentDate
  );
  
  // Update change stats
  const desktopStat = document.getElementById('stat-desktop');
  const mobileStat = document.getElementById('stat-mobile');
  
  if (metadata?.viewports) {
    updateStatDisplay(desktopStat, metadata.viewports.desktop);
    updateStatDisplay(mobileStat, metadata.viewports.mobile);
  } else {
    desktopStat.textContent = '-';
    desktopStat.className = 'stat-value';
    mobileStat.textContent = '-';
    mobileStat.className = 'stat-value';
  }
  
  // Load AI analysis
  const analysis = await loadAnalysis(
    state.currentCompetitor,
    state.currentPage,
    state.currentDate
  );
  
  const insightsEl = document.getElementById('ai-insights');
  
  // New viewport-based format from analyze.js
  if (analysis?.viewports) {
    const viewport = state.currentViewport;
    const viewportAnalysis = analysis.viewports[viewport];
    
    if (viewportAnalysis?.skipped) {
      insightsEl.innerHTML = `
        <p class="placeholder">${viewportAnalysis.summary || 'Analysis skipped: ' + viewportAnalysis.reason}</p>
      `;
    } else if (viewportAnalysis?.success && viewportAnalysis?.analysis) {
      // Convert markdown-style text to HTML
      const html = formatAnalysisMarkdown(viewportAnalysis.analysis);
      insightsEl.innerHTML = `
        <div class="analysis-content">
          ${html}
        </div>
        <div class="analysis-meta">
          <small>Comparing ${analysis.currentDate} to ${analysis.previousDate}</small>
        </div>
      `;
    } else if (viewportAnalysis?.error) {
      insightsEl.innerHTML = `
        <p class="placeholder error">Analysis error: ${viewportAnalysis.error}</p>
      `;
    } else {
      insightsEl.innerHTML = `
        <p class="placeholder">No analysis for ${viewport} viewport.</p>
      `;
    }
  } 
  // Legacy insights array format
  else if (analysis?.insights) {
    insightsEl.innerHTML = analysis.insights.map(insight => `
      <div class="insight-item">
        <div class="insight-category">${insight.category}</div>
        <div class="insight-text">${insight.text}</div>
      </div>
    `).join('');
  } else {
    insightsEl.innerHTML = `
      <p class="placeholder">No analysis available yet.</p>
      <p class="placeholder hint">Run <code>npm run analyze</code> to generate AI insights.</p>
    `;
  }
}

/**
 * Convert markdown-style analysis text to HTML
 */
function formatAnalysisMarkdown(text) {
  return text
    // Bold headers like **Summary**:
    .replace(/\*\*([^*]+)\*\*:/g, '<h4>$1</h4>')
    // Bold text
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    // Bullet points
    .replace(/^- (.+)$/gm, '<li>$1</li>')
    // Wrap consecutive li elements in ul
    .replace(/(<li>.*<\/li>\n?)+/g, '<ul>$&</ul>')
    // Numbered lists
    .replace(/^\d+\. (.+)$/gm, '<li>$1</li>')
    // Paragraphs (double newline)
    .replace(/\n\n/g, '</p><p>')
    // Single newlines in remaining text
    .replace(/\n/g, '<br>')
    // Wrap in paragraph
    .replace(/^/, '<p>')
    .replace(/$/, '</p>')
    // Clean up empty paragraphs
    .replace(/<p><\/p>/g, '')
    .replace(/<p><h4>/g, '<h4>')
    .replace(/<\/h4><\/p>/g, '</h4>');
}

function updateStatDisplay(element, viewportData) {
  if (!viewportData?.success) {
    element.textContent = '-';
    element.className = 'stat-value';
    return;
  }
  
  const percent = viewportData.changePercent;
  element.textContent = `${percent}%`;
  
  if (percent > 10) {
    element.className = 'stat-value high';
  } else if (percent > 2) {
    element.className = 'stat-value medium';
  } else {
    element.className = 'stat-value low';
  }
}

// ═══════════════════════════════════════════════════════════════
// SELECTION HANDLERS
// ═══════════════════════════════════════════════════════════════

function selectCompetitor(name) {
  state.currentCompetitor = name;
  state.currentPage = null;
  state.currentDate = null;
  
  document.getElementById('current-competitor').textContent = formatCompetitorName(name);
  document.getElementById('current-page').textContent = '-';
  
  renderCompetitorList();
  
  // Load pages for this competitor
  const pages = getAvailablePages(name);
  renderPageNav(pages);
  
  // Clear timeline and viewer
  document.getElementById('timeline').innerHTML = '';
  renderViewer();
}

function selectPage(label) {
  state.currentPage = label;
  state.currentDate = null;
  
  document.getElementById('current-page').textContent = formatPageLabel(label);
  
  // Update active state
  document.querySelectorAll('.page-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.page === label);
  });
  
  // Load dates for this page
  const dates = getAvailableDates();
  renderTimeline(dates);
  
  // Auto-select most recent date
  if (dates.length > 0) {
    selectDate(dates[0]);
  } else {
    renderViewer();
  }
}

function selectDate(date) {
  state.currentDate = date;
  
  // Update active state
  document.querySelectorAll('.timeline-item').forEach(item => {
    item.classList.toggle('active', item.dataset.date === date);
  });
  
  renderViewer();
  renderAnalysis();
}

function setViewport(viewport) {
  state.currentViewport = viewport;
  
  document.getElementById('viewport-desktop').classList.toggle('active', viewport === 'desktop');
  document.getElementById('viewport-mobile').classList.toggle('active', viewport === 'mobile');
  
  renderViewer();
  renderAnalysis();
}

function setViewMode(mode) {
  state.viewMode = mode;
  
  document.getElementById('mode-sidebyside').classList.toggle('active', mode === 'sidebyside');
  document.getElementById('mode-diff').classList.toggle('active', mode === 'diff');
  document.getElementById('mode-slider').classList.toggle('active', mode === 'slider');
  
  renderViewer();
}

// ═══════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════

function formatCompetitorName(name) {
  const names = {
    lowes: "Lowe's",
    homedepot: 'Home Depot',
    menards: 'Menards',
    amazon: 'Amazon'
  };
  return names[name] || name.charAt(0).toUpperCase() + name.slice(1);
}

function formatPageLabel(label) {
  return label
    .split('-')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function formatDate(dateStr) {
  const date = new Date(dateStr + 'T00:00:00');
  return date.toLocaleDateString('en-US', { 
    month: 'short', 
    day: 'numeric',
    year: 'numeric'
  });
}

/**
 * Get available pages for a competitor
 * In production, this would come from the index
 */
function getAvailablePages(competitor) {
  // Use index.json data if available, fall back to hardcoded
  const competitorData = state.competitors.find(c => c.name === competitor);
  if (competitorData && competitorData.pages) {
    return competitorData.pages.map(p => ({ label: p.label }));
  }
  
  // Fallback hardcoded config
  const pages = {
    lowes: ['homepage', 'category', 'PLP', 'product', 'cart'],
    homedepot: ['homepage', 'category', 'PLP', 'product', 'cart', 'checkout'],
    menards: ['homepage', 'category', 'product', 'weekly-ad'],
    amazon: ['home-improvement-storefront', 'power-tools', 'pdp-drill', 'bestsellers-tools']
  };
  
  return (pages[competitor] || []).map(label => ({ label }));
}

/**
 * Get available dates for current page from the index
 */
function getAvailableDates() {
  if (!state.currentCompetitor || !state.currentPage) {
    return [];
  }
  
  // Find competitor in state
  const competitor = state.competitors.find(c => c.name === state.currentCompetitor);
  if (!competitor) return [];
  
  // Find page
  const page = competitor.pages.find(p => p.label === state.currentPage);
  if (!page || !page.dates) return [];
  
  // Return sorted dates (most recent first)
  return page.dates.map(d => d.date).sort().reverse();
}

// ═══════════════════════════════════════════════════════════════
// EVENT HANDLERS
// ═══════════════════════════════════════════════════════════════

function setupEventListeners() {
  // Viewport toggle
  document.getElementById('viewport-desktop').addEventListener('click', () => setViewport('desktop'));
  document.getElementById('viewport-mobile').addEventListener('click', () => setViewport('mobile'));
  
  // View mode toggle
  document.getElementById('mode-sidebyside').addEventListener('click', () => setViewMode('sidebyside'));
  document.getElementById('mode-diff').addEventListener('click', () => setViewMode('diff'));
  document.getElementById('mode-slider').addEventListener('click', () => setViewMode('slider'));
  
  // Analysis panel toggle
  document.getElementById('toggle-analysis').addEventListener('click', () => {
    document.getElementById('analysis-panel').classList.toggle('collapsed');
  });
  
  // Refresh button
  document.getElementById('refresh-btn').addEventListener('click', () => {
    location.reload();
  });
  
  // Save notes
  document.getElementById('save-notes').addEventListener('click', async () => {
    const notes = document.getElementById('notes-input').value;
    console.log('Notes would be saved:', notes);
    // In a real implementation, this would save to metadata.json
    alert('Notes saved! (In production, this would update metadata.json)');
  });
}

// ═══════════════════════════════════════════════════════════════
// INITIALIZATION
// ═══════════════════════════════════════════════════════════════

async function init() {
  console.log('🕐 Competitive Time Machine - Viewer Starting');
  
  // Load captures index
  const index = await loadCapturesIndex();
  state.competitors = index.competitors || [];
  
  // Render initial UI
  renderCompetitorList();
  
  // Set up event listeners
  setupEventListeners();
  
  console.log('✓ Viewer initialized');
}

// Start when DOM is ready
document.addEventListener('DOMContentLoaded', init);
