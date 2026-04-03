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
  viewMode: 'sidebyside', // 'sidebyside', 'slider'
  capturesPath: '../captures'
};

// Keep a stable cache-bust token for this viewer session so refreshed analysis
// files are fetched reliably after local regenerate/re-run commands.
const cacheBust = Date.now();

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
  const knownCompetitors = ['lowes', 'homedepot', 'walmart', 'menards', 'amazon'];
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
    const response = await fetch(`${path}?t=${cacheBust}`);
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
    const response = await fetch(`${path}?t=${cacheBust}`);
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
  nav.classList.remove('hidden');
  document.querySelector('.timeline-controls').classList.remove('hidden');
  Array.from(nav.children).forEach(el => {
    if (!el.classList.contains('nav-section-title')) el.remove();
  });
  
  for (let i = 0; i < pages.length; i++) {
    const page = pages[i];

    if (i > 0) {
      const sep = document.createElement('span');
      sep.className = 'page-sep';
      sep.setAttribute('aria-hidden', 'true');
      sep.textContent = '→';
      nav.appendChild(sep);
    }

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
  const existingSelect = timeline.querySelector('.timeline-select');
  if (existingSelect) {
    existingSelect.remove();
  }

  if (dates.length === 0) return;

  const select = document.createElement('select');
  select.className = 'timeline-select';
  select.id = 'date-select';

  for (const date of dates) {
    const option = document.createElement('option');
    option.value = date;
    option.textContent = formatDate(date);
    if (date === state.currentDate) option.selected = true;
    select.appendChild(option);
  }

  select.addEventListener('change', () => selectDate(select.value));
  timeline.appendChild(select);
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
    case 'slider':
      renderSliderView(panel, currentPath, previousPath, viewport);
      break;
    default:
      renderSideBySide(panel, currentPath, previousPath, viewport);
      break;
  }
}

function renderSideBySide(panel, currentPath, previousPath, viewport) {
  const currentImg = `${currentPath}/${viewport}.png`;
  const previousImg = previousPath ? `${previousPath}/${viewport}.png` : null;
  
  panel.innerHTML = `
    <div class="side-by-side">
      <div class="comparison-panel">
        <div class="comparison-panel-header comparison-panel-header--previous">
          <h4>Previous ${previousPath ? `(${previousPath.split('/').pop()})` : '(None)'}</h4>
          <div class="panel-header-actions">
            ${previousImg
              ? `<button class="panel-copy-btn" data-img="${previousImg}" title="Copy image to clipboard"><span class="material-symbols-outlined">content_copy</span></button>`
              : ''
            }
            ${previousImg
              ? `<a class="panel-download-btn" href="${previousImg}" download title="Download image"><span class="material-symbols-outlined">download</span></a>`
              : ''
            }
            ${previousImg
              ? `<a class="panel-open-link" href="${previousImg}" target="_blank" title="Open image in new tab"><span class="material-symbols-outlined">open_in_new</span></a>`
              : ''
            }
          </div>
        </div>
        ${previousImg 
          ? `<img src="${previousImg}" alt="Previous capture" onerror="this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%22400%22 height=%22300%22><text x=%2250%%22 y=%2250%%22 text-anchor=%22middle%22 fill=%22%23888%22>Image not found</text></svg>'">`
          : '<div class="empty-state"><p>No previous capture</p></div>'
        }
      </div>
      <div class="comparison-panel">
        <div class="comparison-panel-header">
          <h4>Current (${state.currentDate})</h4>
          <div class="panel-header-actions">
            <button class="panel-copy-btn" data-img="${currentImg}" title="Copy image to clipboard"><span class="material-symbols-outlined">content_copy</span></button>
            <a class="panel-download-btn" href="${currentImg}" download title="Download image"><span class="material-symbols-outlined">download</span></a>
            <a class="panel-open-link" href="${currentImg}" target="_blank" title="Open image in new tab">
              <span class="material-symbols-outlined">open_in_new</span>
            </a>
          </div>
        </div>
        <img src="${currentImg}" alt="Current capture" onerror="this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%22400%22 height=%22300%22><text x=%2250%%22 y=%2250%%22 text-anchor=%22middle%22 fill=%22%23888%22>Image not found</text></svg>'">
      </div>
    </div>
  `;
  
  // Attach copy button listeners
  panel.querySelectorAll('.panel-copy-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.preventDefault();
      const imgPath = btn.dataset.img;
      await copyImageToClipboard(imgPath, btn);
    });
  });
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

async function renderAnalysis() {
  const analysisDateEl = document.getElementById('analysis-date');
  if (analysisDateEl) {
    analysisDateEl.textContent = '';
    analysisDateEl.style.display = 'none';
  }
}

function getViewportFeatureState(metadataViewport, analysisViewport) {
  if (analysisViewport?.featureStatus) {
    return analysisViewport.featureStatus;
  }

  if (analysisViewport?.featureAnalysis?.status) {
    return analysisViewport.featureAnalysis.status;
  }

  if (metadataViewport?.success && metadataViewport.changePercent === 0) {
    return 'no_feature_change';
  }

  if (metadataViewport?.success && metadataViewport.changePercent > 0) {
    return 'review_required';
  }

  return 'unavailable';
}

function formatFeatureAnalysis(featureAnalysis) {
  const sections = [];
  sections.push(`<h4>Summary</h4><p>${escapeHtml(featureAnalysis.summary || 'No summary available.')}</p>`);

  if (featureAnalysis.newFeatures?.length) {
    sections.push(`<h4>New Features</h4>${renderFeatureList(featureAnalysis.newFeatures)}`);
  }

  if (featureAnalysis.updatedFeatures?.length) {
    sections.push(`<h4>Updated Features</h4>${renderFeatureList(featureAnalysis.updatedFeatures)}`);
  }

  if (featureAnalysis.removedFeatures?.length) {
    sections.push(`<h4>Removed Features</h4>${renderFeatureList(featureAnalysis.removedFeatures)}`);
  }

  if (featureAnalysis.evidence?.length) {
    sections.push(`<h4>Evidence</h4>${renderFeatureList(featureAnalysis.evidence)}`);
  }

  if (featureAnalysis.ignoredNoise?.length) {
    sections.push(`<h4>Ignored Noise</h4>${renderFeatureList(featureAnalysis.ignoredNoise)}`);
  }

  if (featureAnalysis.strategicInsights?.length) {
    sections.push(`<h4>Strategic Insights</h4>${renderFeatureList(featureAnalysis.strategicInsights)}`);
  }

  return sections.join('');
}

function renderFeatureList(items) {
  return `<ul>${items.map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul>`;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
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
  const status = typeof viewportData === 'string'
    ? viewportData
    : getViewportFeatureState(viewportData, null);

  switch (status) {
    case 'new_feature':
      element.textContent = 'New feature';
      element.className = 'stat-value high';
      break;
    case 'updated_feature':
      element.textContent = 'Updated feature';
      element.className = 'stat-value medium';
      break;
    case 'no_feature_change':
      element.textContent = 'No feature change';
      element.className = 'stat-value low';
      break;
    case 'review_required':
      element.textContent = 'Needs review';
      element.className = 'stat-value medium';
      break;
    case 'uncertain':
      element.textContent = 'Uncertain';
      element.className = 'stat-value medium';
      break;
    default:
      element.textContent = '-';
      element.className = 'stat-value';
      break;
  }
}

// ═══════════════════════════════════════════════════════════════
// SELECTION HANDLERS
// ═══════════════════════════════════════════════════════════════

function selectCompetitor(name) {
  state.currentCompetitor = name;
  state.currentPage = null;
  state.currentDate = null;

  const currentCompetitorEl = document.getElementById('current-competitor');
  const currentPageEl = document.getElementById('current-page');
  if (currentCompetitorEl) currentCompetitorEl.textContent = formatCompetitorName(name);
  if (currentPageEl) currentPageEl.textContent = '-';
  
  renderCompetitorList();

  // Reload notes scoped to this competitor
  refreshNotesList();

  // Load pages for this competitor
  const pages = getAvailablePages(name);
  renderPageNav(pages);
  
  // Auto-select Homepage if available, otherwise first page
  const defaultPage = pages.find(p => p.label === 'homepage') || pages[0];
  if (defaultPage) {
    selectPage(defaultPage.label);
  } else {
    // Clear timeline and viewer if no pages
    document.getElementById('timeline').innerHTML = '';
    renderViewer();
  }
}

function selectPage(label) {
  state.currentPage = label;
  state.currentDate = null;

  const currentPageEl = document.getElementById('current-page');
  if (currentPageEl) currentPageEl.textContent = formatPageLabel(label);
  
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

  const select = document.getElementById('date-select');
  if (select) select.value = date;

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
  document.getElementById('mode-slider').classList.toggle('active', mode === 'slider');
  
  renderViewer();
}

// ═══════════════════════════════════════════════════════════════
// CLIPBOARD UTILITIES
// ═══════════════════════════════════════════════════════════════

/**
 * Copy image from URL to clipboard
 */
async function copyImageToClipboard(imagePath, buttonElement) {
  try {
    const absoluteUrl = new URL(imagePath, window.location.href).href;

    // Use a Promise<Blob> in ClipboardItem (Chrome's "deferred clipboard" API).
    // This passes the raw PNG bytes through to the paste destination at OS level,
    // instead of having the browser decode→re-encode the image (which changes DPI).
    const blobPromise = fetch(absoluteUrl).then(r => {
      if (!r.ok) throw new Error('Failed to fetch image');
      return r.blob();
    });

    await navigator.clipboard.write([
      new ClipboardItem({ 'image/png': blobPromise })
    ]);
    
    // Show feedback
    const originalHTML = buttonElement.innerHTML;
    buttonElement.classList.add('copied');
    buttonElement.innerHTML = '<span class="material-symbols-outlined">check</span>';
    
    setTimeout(() => {
      buttonElement.classList.remove('copied');
      buttonElement.innerHTML = originalHTML;
    }, 2000);
  } catch (error) {
    console.error('Failed to copy image:', error);
    // Show error feedback
    const originalHTML = buttonElement.innerHTML;
    buttonElement.classList.add('error');
    buttonElement.innerHTML = '<span class="material-symbols-outlined">error</span>';
    
    setTimeout(() => {
      buttonElement.classList.remove('error');
      buttonElement.innerHTML = originalHTML;
    }, 2000);
  }
}

// ═══════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════

function formatCompetitorName(name) {
  const names = {
    lowes: "Lowe's",
    homedepot: 'Home Depot',
    walmart: 'Walmart',
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
    lowes: ['homepage', 'category', 'PLP', 'PDP', 'cart', 'checkout'],
    homedepot: ['homepage', 'category', 'PLP', 'PDP', 'cart', 'checkout'],
    walmart: ['homepage', 'category', 'PLP', 'PDP', 'cart', 'checkout'],
    menards: ['homepage', 'category', 'PDP', 'weekly-ad'],
    amazon: ['home-improvement-storefront', 'power-tools', 'PDP', 'bestsellers-tools']
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
// NOTES (scoped per competitor)
// ═══════════════════════════════════════════════════════════════

function notesKey() {
  return `ctm_notes_${state.currentCompetitor || '_global'}`;
}

function loadNotes() {
  try { return JSON.parse(localStorage.getItem(notesKey())) || []; }
  catch { return []; }
}

function saveNotes(notes) {
  localStorage.setItem(notesKey(), JSON.stringify(notes));
}

function renderNoteEntry(note) {
  const entry = document.createElement('div');
  entry.className = 'note-entry';
  entry.dataset.id = note.id;
  entry.innerHTML = `
    <div class="note-entry-header">
      <span class="note-timestamp">${note.timestamp}</span>
      <button class="note-delete-btn" title="Delete note">
        <span class="material-symbols-outlined">delete</span>
      </button>
    </div>
    <p class="note-entry-text">${note.text.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</p>
  `;
  entry.querySelector('.note-delete-btn').addEventListener('click', () => {
    if (confirm('Delete this note?')) {
      entry.remove();
      const notes = loadNotes().filter(n => n.id !== note.id);
      saveNotes(notes);
    }
  });
  return entry;
}

function refreshNotesList() {
  const notesList = document.getElementById('notes-list');
  if (!notesList) return;
  notesList.innerHTML = '';
  loadNotes().forEach(note => notesList.appendChild(renderNoteEntry(note)));
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
  document.getElementById('mode-slider').addEventListener('click', () => setViewMode('slider'));
  
  // Analysis panel toggle
  document.getElementById('toggle-analysis').addEventListener('click', () => {
    document.getElementById('analysis-panel').classList.toggle('collapsed');
  });
  
  // Refresh button
  document.getElementById('refresh-btn').addEventListener('click', () => {
    location.reload();
  });

  // Load notes for current context (scoped per competitor)
  refreshNotesList();

  // Save notes
  document.getElementById('save-notes').addEventListener('click', () => {
    const input = document.getElementById('notes-input');
    const text = input.value.trim();
    if (!text) return;

    const now = new Date();
    const note = {
      id: Date.now(),
      timestamp: now.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
        + ' ' + now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }),
      text
    };

    const notes = loadNotes();
    notes.push(note);
    saveNotes(notes);

    document.getElementById('notes-list').appendChild(renderNoteEntry(note));
    input.value = '';
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
