// report-html.js — Generates a modern, rich, interactive HTML audit report.
// Features a Hero banner with evidence scope, KPI metric cards,
// interactive filterable slot tables, ad request inspector, findings explorer with code fixes,
// publisher compliance matrix, and visual screenshot embeds.

function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function renderHtmlReport(snapshot, network, findings = [], jsonReport = {}, compliance = null) {
  const meta = snapshot?.meta || {};
  const gpt = snapshot?.gpt || {};
  const slots = jsonReport?.slots || [];
  const requests = jsonReport?.requests || [];
  const neighbours = snapshot?.neighbours || {};
  const summary = jsonReport?.summary || { high: 0, medium: 0, low: 0, total: 0 };
  const consent = jsonReport?.meta?.consent || {};
  const tcf = jsonReport?.tcf || null;

  // Keep the report's visual layout without inventing a quantitative quality score.
  const radius = 45;

  const url = meta.url || 'Unknown Target';
  let hostname = 'Target Property';
  try { if (meta.url) hostname = new URL(meta.url).hostname; } catch (_) { hostname = meta.url; }

  const auditDate = meta.timestamp ? new Date(meta.timestamp).toUTCString() : new Date().toUTCString();
  const displayRequests = requests.filter(r => r.kind === 'display');
  const videoRequests = requests.filter(r => r.kind === 'video');
  const ppidDetected = requests.some(r => r.ppid === true);
  const sra = jsonReport?.meta?.sra;
  const batching = jsonReport?.meta?.batching || {};
  const sraLabel = sra === true ? 'on' : sra === false ? 'off' : 'unknown';
  const batchingLabel = batching.observed === true ? 'yes' : batching.observed === false ? 'no' : 'unknown';
  const privacyLabel = (request, key) => request.parameterPresence?.[key] === false ? 'absent' : request[key] === null || request[key] === undefined ? 'unknown' : request[key] === '' ? 'empty' : String(request[key]);
  const scopeNotes = jsonReport?.meta?.scopeNotes || ['Scope: one captured page session; capture coverage and consent action are unknown.'];

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>GPT Audit Report — ${escapeHtml(hostname)}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600&family=Outfit:wght@400;500;600;700;800&family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>
    :root {
      --bg: #0a0e17;
      --bg-card: rgba(17, 24, 39, 0.75);
      --bg-card-hover: rgba(26, 36, 56, 0.85);
      --bg-elevated: #151d2f;
      --border: rgba(255, 255, 255, 0.08);
      --border-accent: rgba(56, 189, 248, 0.25);
      --text: #f1f5f9;
      --text-muted: #94a3b8;
      --text-dim: #64748b;
      --primary: #38bdf8;
      --primary-glow: rgba(56, 189, 248, 0.25);
      --accent-purple: #818cf8;
      --accent-emerald: #34d399;
      --accent-amber: #fbbf24;
      --accent-rose: #f43f5e;
      --font-heading: 'Outfit', sans-serif;
      --font-body: 'Plus Jakarta Sans', sans-serif;
      --font-mono: 'JetBrains Mono', monospace;
      --radius-sm: 8px;
      --radius-md: 12px;
      --radius-lg: 16px;
      --radius-full: 9999px;
      --shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.4), 0 8px 10px -6px rgba(0, 0, 0, 0.3);
    }

    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background-color: var(--bg);
      color: var(--text);
      font-family: var(--font-body);
      line-height: 1.6;
      -webkit-font-smoothing: antialiased;
      background-image:
        radial-gradient(circle at 10% 10%, rgba(56, 189, 248, 0.08) 0%, transparent 45%),
        radial-gradient(circle at 90% 20%, rgba(129, 140, 248, 0.08) 0%, transparent 45%),
        radial-gradient(circle at 50% 80%, rgba(52, 211, 153, 0.04) 0%, transparent 50%);
      background-attachment: fixed;
      padding-bottom: 80px;
    }

    .container {
      max-width: 1380px;
      margin: 0 auto;
      padding: 0 24px;
    }

    /* Top Navigation Bar */
    .top-nav {
      height: 70px;
      border-bottom: 1px solid var(--border);
      background: rgba(10, 14, 23, 0.8);
      backdrop-filter: blur(16px);
      position: sticky;
      top: 0;
      z-index: 100;
    }
    .top-nav .container {
      height: 100%;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .brand-wrap {
      display: flex;
      align-items: center;
      gap: 12px;
      text-decoration: none;
    }
    .brand-badge {
      width: 36px;
      height: 36px;
      border-radius: var(--radius-md);
      background: linear-gradient(135deg, var(--primary), var(--accent-purple));
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 800;
      font-family: var(--font-heading);
      font-size: 16px;
      color: #0a0e17;
      box-shadow: 0 0 16px var(--primary-glow);
    }
    .brand-title {
      font-family: var(--font-heading);
      font-size: 18px;
      font-weight: 700;
      color: #fff;
    }
    .brand-sub {
      font-size: 11px;
      color: var(--primary);
      text-transform: uppercase;
      letter-spacing: 1px;
      font-weight: 600;
      margin-left: 6px;
    }
    .nav-actions {
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .btn-action {
      background: rgba(255, 255, 255, 0.06);
      border: 1px solid var(--border);
      color: var(--text);
      padding: 8px 16px;
      border-radius: var(--radius-sm);
      font-size: 13px;
      font-weight: 500;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 8px;
      transition: all 0.2s;
      text-decoration: none;
    }
    .btn-action:hover {
      background: rgba(255, 255, 255, 0.12);
      border-color: var(--border-accent);
      color: #fff;
    }

    /* Hero Section */
    .hero {
      margin-top: 32px;
      margin-bottom: 36px;
      background: linear-gradient(135deg, rgba(21, 29, 47, 0.9), rgba(15, 23, 42, 0.8));
      backdrop-filter: blur(20px);
      border: 1px solid var(--border-accent);
      border-radius: var(--radius-lg);
      padding: 36px;
      box-shadow: 0 20px 40px rgba(0, 0, 0, 0.4);
      position: relative;
      overflow: hidden;
    }
    .hero::before {
      content: '';
      position: absolute;
      top: -100px;
      right: -100px;
      width: 300px;
      height: 300px;
      background: radial-gradient(circle, rgba(56, 189, 248, 0.15), transparent 70%);
      pointer-events: none;
    }
    .hero-layout {
      display: grid;
      grid-template-columns: 1fr auto;
      gap: 32px;
      align-items: center;
    }
    @media (max-width: 900px) {
      .hero-layout { grid-template-columns: 1fr; }
    }
    .hero-meta-badge {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      background: rgba(56, 189, 248, 0.12);
      border: 1px solid rgba(56, 189, 248, 0.3);
      padding: 4px 12px;
      border-radius: var(--radius-full);
      font-size: 12px;
      font-weight: 600;
      color: var(--primary);
      margin-bottom: 14px;
    }
    .hero-meta-badge .dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: var(--accent-emerald);
      box-shadow: 0 0 8px var(--accent-emerald);
    }
    .hero-title {
      font-family: var(--font-heading);
      font-size: 32px;
      font-weight: 800;
      letter-spacing: -0.5px;
      color: #fff;
      margin-bottom: 8px;
      line-height: 1.2;
      word-break: break-all;
    }
    .hero-subtitle {
      font-size: 15px;
      color: var(--text-muted);
      margin-bottom: 20px;
    }
    .pill-list {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
    }
    .pill {
      font-size: 12px;
      font-family: var(--font-mono);
      background: rgba(255, 255, 255, 0.05);
      border: 1px solid var(--border);
      padding: 4px 10px;
      border-radius: var(--radius-sm);
      color: var(--text);
      display: inline-flex;
      align-items: center;
      gap: 6px;
    }
    .pill.pill-pass {
      background: rgba(52, 211, 153, 0.12);
      border-color: rgba(52, 211, 153, 0.3);
      color: var(--accent-emerald);
    }
    .pill.pill-fail {
      background: rgba(244, 63, 94, 0.12);
      border-color: rgba(244, 63, 94, 0.3);
      color: var(--accent-rose);
    }
    .pill.pill-primary {
      background: rgba(56, 189, 248, 0.12);
      border-color: rgba(56, 189, 248, 0.3);
      color: var(--primary);
    }

    /* Score Gauge Card */
    .score-card {
      background: rgba(10, 14, 23, 0.6);
      border: 1px solid var(--border);
      border-radius: var(--radius-md);
      padding: 24px;
      text-align: center;
      min-width: 220px;
      box-shadow: inset 0 0 20px rgba(0, 0, 0, 0.3);
    }
    .gauge-wrap {
      position: relative;
      width: 120px;
      height: 120px;
      margin: 0 auto 12px;
    }
    .gauge-svg {
      transform: rotate(-90deg);
    }
    .gauge-bg {
      stroke: rgba(255, 255, 255, 0.08);
    }
    .gauge-fill {
      transition: stroke-dashoffset 1s ease-out;
      stroke-linecap: round;
    }
    .gauge-number {
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      font-family: var(--font-heading);
      font-size: 28px;
      font-weight: 800;
      color: #fff;
    }
    .gauge-number span {
      font-size: 14px;
      color: var(--text-dim);
      font-weight: 500;
    }
    .score-title {
      font-size: 13px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-bottom: 2px;
    }
    .score-desc {
      font-size: 11px;
      color: var(--text-muted);
    }

    /* Hero KPI Metrics Grid */
    .kpi-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 16px;
      margin-bottom: 32px;
    }
    .kpi-card {
      background: var(--bg-card);
      border: 1px solid var(--border);
      border-radius: var(--radius-md);
      padding: 20px;
      transition: transform 0.2s, border-color 0.2s;
    }
    .kpi-card:hover {
      transform: translateY(-2px);
      border-color: var(--border-accent);
    }
    .kpi-label {
      font-size: 12px;
      font-weight: 600;
      color: var(--text-muted);
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-bottom: 8px;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .kpi-value {
      font-family: var(--font-heading);
      font-size: 26px;
      font-weight: 800;
      color: #fff;
      line-height: 1.1;
      margin-bottom: 4px;
    }
    .kpi-sub {
      font-size: 12px;
      color: var(--text-dim);
    }

    /* Navigation Tabs */
    .tabs-bar {
      display: flex;
      gap: 8px;
      border-bottom: 1px solid var(--border);
      margin-bottom: 24px;
      overflow-x: auto;
      padding-bottom: 2px;
    }
    .tab-btn {
      background: transparent;
      border: none;
      color: var(--text-muted);
      font-family: var(--font-heading);
      font-size: 15px;
      font-weight: 600;
      padding: 12px 18px;
      cursor: pointer;
      position: relative;
      transition: color 0.2s;
      white-space: nowrap;
      display: inline-flex;
      align-items: center;
      gap: 8px;
    }
    .tab-btn:hover {
      color: #fff;
    }
    .tab-btn.active {
      color: var(--primary);
    }
    .tab-btn.active::after {
      content: '';
      position: absolute;
      bottom: -3px;
      left: 0;
      width: 100%;
      height: 3px;
      background: var(--primary);
      border-radius: 3px 3px 0 0;
      box-shadow: 0 0 10px var(--primary-glow);
    }
    .tab-badge {
      font-size: 11px;
      padding: 2px 7px;
      border-radius: var(--radius-full);
      background: rgba(255, 255, 255, 0.08);
      font-weight: 600;
    }

    /* Tab Panes */
    .tab-pane {
      display: none;
    }
    .tab-pane.active {
      display: block;
      animation: fadeIn 0.3s ease-in-out;
    }
    @keyframes fadeIn {
      from { opacity: 0; transform: translateY(4px); }
      to { opacity: 1; transform: translateY(0); }
    }

    /* Section Cards & Tables */
    .section-card {
      background: var(--bg-card);
      border: 1px solid var(--border);
      border-radius: var(--radius-md);
      padding: 24px;
      margin-bottom: 24px;
    }
    .section-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 20px;
    }
    .section-title {
      font-family: var(--font-heading);
      font-size: 20px;
      font-weight: 700;
      color: #fff;
    }

    .table-responsive {
      width: 100%;
      overflow-x: auto;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 13px;
      text-align: left;
    }
    th {
      background: rgba(15, 23, 42, 0.85);
      color: var(--text-muted);
      font-weight: 600;
      text-transform: uppercase;
      font-size: 11px;
      letter-spacing: 0.5px;
      padding: 12px 14px;
      border-bottom: 1px solid var(--border);
    }
    td {
      padding: 12px 14px;
      border-bottom: 1px solid var(--border);
      color: var(--text);
    }
    tr:last-child td { border-bottom: none; }
    tr:hover td {
      background: rgba(255, 255, 255, 0.02);
    }

    code {
      font-family: var(--font-mono);
      font-size: 12px;
      background: rgba(0, 0, 0, 0.3);
      padding: 2px 6px;
      border-radius: 4px;
      color: #7dd3fc;
    }

    /* Badges */
    .badge-sev {
      display: inline-block;
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      padding: 2px 8px;
      border-radius: var(--radius-full);
    }
    .badge-sev.high {
      background: rgba(244, 63, 94, 0.15);
      color: var(--accent-rose);
      border: 1px solid rgba(244, 63, 94, 0.3);
    }
    .badge-sev.medium {
      background: rgba(251, 191, 36, 0.15);
      color: var(--accent-amber);
      border: 1px solid rgba(251, 191, 36, 0.3);
    }
    .badge-sev.low {
      background: rgba(56, 189, 248, 0.15);
      color: var(--primary);
      border: 1px solid rgba(56, 189, 248, 0.3);
    }
    .badge-fill {
      font-size: 11px;
      font-weight: 600;
      padding: 2px 8px;
      border-radius: var(--radius-full);
    }
    .badge-fill.adx {
      background: rgba(129, 140, 248, 0.15);
      color: var(--accent-purple);
      border: 1px solid rgba(129, 140, 248, 0.3);
    }
    .badge-fill.direct {
      background: rgba(52, 211, 153, 0.15);
      color: var(--accent-emerald);
      border: 1px solid rgba(52, 211, 153, 0.3);
    }
    .badge-fill.unfilled {
      background: rgba(244, 63, 94, 0.15);
      color: var(--accent-rose);
      border: 1px solid rgba(244, 63, 94, 0.3);
    }

    /* Findings Cards */
    .finding-card {
      background: rgba(15, 23, 42, 0.6);
      border: 1px solid var(--border);
      border-left: 4px solid var(--primary);
      border-radius: var(--radius-sm);
      padding: 16px 20px;
      margin-bottom: 12px;
      transition: border-color 0.2s;
    }
    .finding-card.high { border-left-color: var(--accent-rose); }
    .finding-card.medium { border-left-color: var(--accent-amber); }
    .finding-card.low { border-left-color: var(--primary); }
    .finding-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 8px;
    }
    .finding-id {
      font-family: var(--font-mono);
      font-weight: 700;
      font-size: 14px;
      color: #fff;
    }
    .finding-slot {
      font-size: 12px;
      color: var(--text-dim);
    }
    .finding-evidence {
      font-size: 13px;
      color: var(--text);
      margin-bottom: 8px;
    }
    .finding-fix {
      font-size: 12px;
      background: rgba(0, 0, 0, 0.25);
      border: 1px solid var(--border);
      border-radius: var(--radius-sm);
      padding: 8px 12px;
      color: #38bdf8;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }

    /* Screenshots Grid */
    .screenshots-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(400px, 1fr));
      gap: 20px;
    }
    .screenshot-card {
      background: rgba(15, 23, 42, 0.6);
      border: 1px solid var(--border);
      border-radius: var(--radius-md);
      padding: 16px;
    }
    .screenshot-card h4 {
      font-size: 14px;
      font-weight: 600;
      margin-bottom: 12px;
      color: #fff;
    }
    .screenshot-img-wrap {
      border-radius: var(--radius-sm);
      overflow: hidden;
      border: 1px solid var(--border);
      background: #000;
    }
    .screenshot-img-wrap img {
      width: 100%;
      height: auto;
      display: block;
      cursor: zoom-in;
    }

    /* Search & Filter Toolbar */
    .toolbar {
      display: flex;
      gap: 12px;
      margin-bottom: 16px;
      align-items: center;
      flex-wrap: wrap;
    }
    .search-input {
      background: rgba(0, 0, 0, 0.3);
      border: 1px solid var(--border);
      border-radius: var(--radius-sm);
      color: #fff;
      font-family: var(--font-body);
      font-size: 13px;
      padding: 8px 14px;
      min-width: 260px;
      outline: none;
    }
    .search-input:focus { border-color: var(--primary); }

    /* Footer */
    footer {
      margin-top: 60px;
      text-align: center;
      font-size: 12px;
      color: var(--text-dim);
    }
  </style>
</head>
<body>

  <!-- Top Navigation -->
  <nav class="top-nav">
    <div class="container">
      <div class="brand-wrap">
        <div class="brand-badge">GPT</div>
        <div>
          <span class="brand-title">gpt-audit</span>
          <span class="brand-sub">Inspector Report</span>
        </div>
      </div>
      <div class="nav-actions">
        <a href="${escapeHtml(url)}" target="_blank" rel="noopener" class="btn-action">
          <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/></svg>
          Open Target
        </a>
        <button onclick="window.print()" class="btn-action">
          <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"/></svg>
          Print / PDF
        </button>
      </div>
    </div>
  </nav>

  <div class="container">

    <!-- HERO SECTION -->
    <header class="hero">
      <div class="hero-layout">
        <div>
          <div class="hero-meta-badge">
            <span class="dot"></span>
            <span>Audit Complete &bull; ${escapeHtml(auditDate)}</span>
          </div>
          <h1 class="hero-title">${escapeHtml(hostname)}</h1>
          <p class="hero-subtitle">${escapeHtml(meta.title || url)}</p>

          <div class="pill-list">
            <span class="pill pill-primary">
              <svg width="12" height="12" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"/></svg>
              GPT: ${escapeHtml(gpt.version || (gpt.present ? 'version unknown' : 'not detected'))}
            </span>
            <span class="pill">
              TC String: ${consent.tcStringPresent === true ? `present (${consent.tcStringLength} chars)` : consent.tcStringPresent === false ? 'absent' : 'unknown'}
            </span>
            <span class="pill">
              Configured SRA: ${sraLabel}
            </span>
            <span class="pill">
              Observed multi-slot batching: ${batchingLabel}
            </span>
            <span class="pill">
              Transport-compressed requests: ${batching.transportCompressedRequestCount ?? 'unknown'}
            </span>
            <span class="pill">
              NPA parameter: ${escapeHtml(consent.npaState ?? 'unknown')}
            </span>
            <span class="pill ${ppidDetected ? 'pill-pass' : 'pill-fail'}">
              PPID: ${ppidDetected ? 'Present' : requests.length ? 'Absent' : 'unknown'}
            </span>
            ${compliance?.active ? `
              <span class="pill ${compliance.passed === true ? 'pill-pass' : compliance.passed === false ? 'pill-fail' : ''}">
                Policy: ${compliance.passed === true ? 'Compliant ✅' : compliance.passed === false ? 'Non-Compliant ❌' : 'Incomplete'}
              </span>
            ` : ''}
          </div>
          <div style="font-size:12px;color:var(--text-muted);margin-top:16px">${scopeNotes.map(note => `<p>${escapeHtml(note)}</p>`).join('')}</div>
        </div>

        <!-- Evidence scope ring -->
        <div class="score-card">
          <div class="gauge-wrap">
            <svg class="gauge-svg" width="120" height="120" viewBox="0 0 120 120">
              <circle class="gauge-bg" cx="60" cy="60" r="${radius}" fill="none" stroke-width="10"/>
            </svg>
            <div class="gauge-number">—</div>
          </div>
          <div class="score-title" style="color:var(--text-muted)">Score withheld</div>
          <div class="score-desc">Single-session evidence does not support a 0–100 quality score.</div>
          <div class="score-desc">${summary.high} High &bull; ${summary.medium} Med &bull; ${summary.low} Low</div>
        </div>
      </div>
    </header>

    <!-- KPI METRICS GRID -->
    <section class="kpi-grid">
      <div class="kpi-card">
        <div class="kpi-label">Slots Defined</div>
        <div class="kpi-value">${slots.length}</div>
        <div class="kpi-sub">${slots.filter(s => s.inViewportAtCapture === true).length} in viewport at capture${(jsonReport?.frames?.length) ? ` &bull; ${slots.filter(s => s.frame).length} in ${jsonReport.frames.length} iframe GPT instance(s)` : ''}</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Ad Requests (GAM)</div>
        <div class="kpi-value">${requests.length}</div>
        <div class="kpi-sub">${displayRequests.length} display &bull; ${videoRequests.length} video</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Fill Status</div>
        <div class="kpi-value" style="color:var(--accent-emerald)">
          ${slots.filter(s => s.fillStatus === 'filled').length} <span style="font-size:16px;color:var(--text-dim)">/ ${slots.length}</span>
        </div>
        <div class="kpi-sub">${slots.filter(s => s.fillStatus === 'unfilled').length} unfilled &bull; ${slots.filter(s => s.fillStatus === 'unknown').length} unknown</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Anomalies Detected</div>
        <div class="kpi-value" style="color:${summary.high > 0 ? 'var(--accent-rose)' : summary.medium > 0 ? 'var(--accent-amber)' : 'var(--accent-emerald)'}">
          ${findings.length}
        </div>
        <div class="kpi-sub">${summary.high} High &bull; ${summary.medium} Medium &bull; ${summary.low} Low</div>
      </div>
    </section>

    <!-- TABS BAR -->
    <div class="tabs-bar">
      <button class="tab-btn active" data-tab="tab-slots" onclick="switchTab('tab-slots')">
        Ad Slots <span class="tab-badge">${slots.length}</span>
      </button>
      <button class="tab-btn" data-tab="tab-requests" onclick="switchTab('tab-requests')">
        Ad Requests <span class="tab-badge">${requests.length}</span>
      </button>
      <button class="tab-btn" data-tab="tab-findings" onclick="switchTab('tab-findings')">
        Findings <span class="tab-badge" style="color:${summary.high > 0 ? 'var(--accent-rose)' : 'inherit'}">${findings.length}</span>
      </button>
      ${compliance?.active ? `
        <button class="tab-btn" data-tab="tab-compliance" onclick="switchTab('tab-compliance')">
          Publisher Policy <span class="tab-badge">${compliance.passed === true ? 'Pass' : compliance.passed === false ? 'Fail' : 'Incomplete'}</span>
        </button>
      ` : ''}
      <button class="tab-btn" data-tab="tab-targeting" onclick="switchTab('tab-targeting')">
        Targeting, TCF &amp; Signals
      </button>
      <button class="tab-btn" data-tab="tab-visual" onclick="switchTab('tab-visual')">
        Visual Screenshots
      </button>
    </div>

    <!-- TAB 1: SLOTS -->
    <div id="tab-slots" class="tab-pane active">
      <div class="section-card">
        <div class="section-head">
          <h2 class="section-title">Defined Ad Slots & Render Events</h2>
          <div class="toolbar">
            <input type="text" id="slotSearch" class="search-input" placeholder="Search element ID or ad unit path..." onkeyup="filterSlots()">
          </div>
        </div>

        <div class="table-responsive">
          <table id="slotsTable">
            <thead>
              <tr>
                <th>Element ID</th>
                <th>Frame</th>
                <th>Ad Unit Path</th>
                <th>Declared Sizes</th>
                <th>Rendered Size</th>
                <th>Fill Classification</th>
                <th>Line Item ID</th>
                <th>Creative ID</th>
                <th>SafeFrame</th>
                <th>In Viewport at Capture</th>
                <th>Targeting</th>
              </tr>
            </thead>
            <tbody>
              ${slots.map(s => {
                const sizesReq = (s.sizes || []).map(sz => Array.isArray(sz) ? `${sz[0]}×${sz[1]}` : sz).join(', ') || 'none';
                const sizeRend = Array.isArray(s.renderedSize) ? `${s.renderedSize[0]}×${s.renderedSize[1]}` : (s.renderedSize || 'none');
                const fillClass = s.fillStatus === 'unfilled' ? 'unfilled' : s.render?.isBackfill === true ? 'adx' : s.fillType === 'Standard Line Item' ? 'direct' : '';
                const fillBadge = `<span class="badge-fill ${fillClass}">${escapeHtml(s.fillType || 'Unknown')}</span>`;

                return `
                <tr>
                  <td><code>${escapeHtml(s.elementId)}</code></td>
                  <td>${s.frame ? `<code title="${escapeHtml(s.frame)}">${escapeHtml(s.frame.length > 24 ? s.frame.slice(0, 21) + '…' : s.frame)}</code>` : '<span style="color:var(--text-dim)">main</span>'}</td>
                  <td><code>${escapeHtml(s.adUnitPath)}</code></td>
                  <td>${escapeHtml(sizesReq)}</td>
                  <td><b>${escapeHtml(sizeRend)}</b></td>
                  <td>${fillBadge}</td>
                  <td>${escapeHtml(s.lineItemId ?? 'null')}</td>
                  <td>${escapeHtml(s.creativeId ?? 'null')}</td>
                  <td>${s.safeFrame ? '<span style="color:var(--accent-emerald)">Yes</span>' : '<span style="color:var(--text-dim)">No</span>'}</td>
                  <td>${s.inViewportAtCapture === true ? '<span style="color:var(--primary)">Yes</span>' : `<span style="color:var(--text-dim)">${s.inViewportAtCapture === false ? 'No' : 'Unknown'}</span>`}</td>
                  <td><span style="font-size:11px;color:var(--text-dim)">${(s.targetingKeys || []).slice(0, 3).join(', ')}${(s.targetingKeys?.length > 3 ? '…' : '') || 'none'}</span></td>
                </tr>`;
              }).join('')}
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- TAB 2: REQUESTS -->
    <div id="tab-requests" class="tab-pane">
      <div class="section-card">
        <div class="section-head">
          <h2 class="section-title">GAM Ad Requests (gampad/ads)</h2>
        </div>
        <div class="table-responsive">
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Kind</th>
                <th>Correlator</th>
                <th>PPID</th>
                <th>Ad Units</th>
                <th>Status</th>
                <th>Duration</th>
                <th>GDPR</th>
                <th>Consent Present</th>
                <th>Privacy Signals</th>
              </tr>
            </thead>
            <tbody>
              ${requests.map((r, idx) => `
                <tr>
                  <td><b>${idx + 1}</b></td>
                  <td><span class="badge-sev ${r.kind === 'video' ? 'medium' : 'low'}">${escapeHtml(r.kind)}</span></td>
                  <td><code>${escapeHtml(r.correlator || 'none')}</code></td>
                  <td>${r.ppid ? '<span style="color:var(--accent-emerald)">Yes</span>' : '<span style="color:var(--text-dim)">No</span>'}</td>
                  <td><code>${escapeHtml(r.adUnits?.[0] ? `${r.adUnits[0]} (${r.adUnits.length})` : 'none')}</code></td>
                  <td><span style="color:${r.status >= 200 && r.status < 300 ? 'var(--accent-emerald)' : 'var(--text-muted)'}">${escapeHtml(r.status ?? 'unknown')}</span></td>
                  <td>${r.duration !== null && r.duration !== undefined ? `${Math.round(r.duration)} ms` : '-'}</td>
                  <td>${escapeHtml(privacyLabel(r, 'gdpr'))}</td>
                  <td>${r.gdpr_consent_length > 0 ? `<span style="color:var(--accent-emerald)">Yes (${r.gdpr_consent_length} chars)</span>` : `<span style="color:var(--text-dim)">${escapeHtml(r.parameterPresence?.gdpr_consent === false ? 'absent' : r.gdpr_consent_length === null || r.gdpr_consent_length === undefined ? 'unknown' : 'empty')}</span>`}</td>
                  <td><code>npa:${escapeHtml(privacyLabel(r, 'npa'))}, ltd:${escapeHtml(privacyLabel(r, 'ltd'))}, rdp:${escapeHtml(privacyLabel(r, 'rdp'))}</code></td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- TAB 3: FINDINGS -->
    <div id="tab-findings" class="tab-pane">
      <div class="section-card">
        <div class="section-head">
          <h2 class="section-title">Audit Findings & Recommended Fixes</h2>
          <div class="toolbar">
            <button class="btn-action" onclick="filterFindings('all')">All (${findings.length})</button>
            <button class="btn-action" style="color:var(--accent-rose)" onclick="filterFindings('high')">High (${summary.high})</button>
            <button class="btn-action" style="color:var(--accent-amber)" onclick="filterFindings('medium')">Medium (${summary.medium})</button>
            <button class="btn-action" style="color:var(--primary)" onclick="filterFindings('low')">Low (${summary.low})</button>
          </div>
        </div>

        ${findings.length === 0 ? `
          <div style="text-align:center; padding: 48px; color:var(--accent-emerald)">
            <h3>No anomalies detected in the captured evidence.</h3>
          </div>
        ` : findings.map(f => `
          <div class="finding-card ${f.severity?.toLowerCase()}" data-sev="${f.severity?.toLowerCase()}">
            <div class="finding-header">
              <span class="finding-id">[${escapeHtml(f.id)}]</span>
              <span class="badge-sev ${f.severity?.toLowerCase()}">${escapeHtml(f.severity)}</span>
            </div>
            ${f.slot ? `<div class="finding-slot">Affected Slot: <code>${escapeHtml(f.slot)}</code></div>` : ''}
            <div class="finding-evidence"><b>Evidence:</b> ${escapeHtml(f.evidence)}</div>
            <div class="finding-fix">
              <div><b>Recommended Action:</b> ${escapeHtml(f.fix)}</div>
            </div>
          </div>
        `).join('')}
      </div>
    </div>

    <!-- TAB 4: COMPLIANCE -->
    ${compliance?.active ? `
    <div id="tab-compliance" class="tab-pane">
      <div class="section-card">
        <div class="section-head">
          <h2 class="section-title">Publisher Mandatory Parameters (${escapeHtml(compliance.publisher)})</h2>
          <span class="badge-sev ${compliance.passed === true ? 'low' : compliance.passed === false ? 'high' : 'medium'}">${compliance.passed === true ? 'COMPLIANT ✅' : compliance.passed === false ? 'NON-COMPLIANT ❌' : 'INCOMPLETE'}</span>
        </div>
        <div class="table-responsive">
          <table>
            <thead>
              <tr>
                <th>Requirement</th>
                <th>Category</th>
                <th>Status</th>
                <th>Verification Evidence / Details</th>
              </tr>
            </thead>
            <tbody>
              ${compliance.checks.map(c => `
                <tr>
                  <td><code>${escapeHtml(c.name)}</code></td>
                  <td>${escapeHtml(c.type)}</td>
                  <td>
                    ${c.passed === true
                      ? '<span class="badge-sev low" style="color:var(--accent-emerald);border-color:rgba(52,211,153,0.3);background:rgba(52,211,153,0.15)">✅ Passed</span>'
                      : c.passed === false ? '<span class="badge-sev high">❌ Failed</span>' : '<span class="badge-sev medium">➖ Unknown</span>'}
                  </td>
                  <td>${escapeHtml(c.details)}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    </div>
    ` : ''}

    <!-- TAB 5: TARGETING & SIGNALS -->
    <div id="tab-targeting" class="tab-pane">
      ${tcf ? `
      <div class="section-card">
        <div class="section-head">
          <h2 class="section-title">TCF v2 Consent &amp; Purpose Analysis</h2>
          <span class="badge-sev ${tcf.status === 'healthy' ? 'low' : tcf.status === 'error' ? 'high' : 'medium'}">
            ${escapeHtml(tcf.status === 'healthy' ? 'TCF Healthy ✅' : tcf.status === 'error' ? 'TCF Issues ❌' : tcf.status === 'incomplete' ? 'TCF Incomplete' : tcf.status === 'unknown' ? 'TCF Unknown' : 'TCF Inactive')}
          </span>
        </div>
        <p style="font-size:13px;color:var(--text-muted);margin-bottom:14px">${escapeHtml(tcf.statusSummary || '')}</p>
        <div class="pill-list" style="margin-bottom:16px">
          <span class="pill ${tcf.apiPresent === true ? 'pill-pass' : tcf.apiPresent === false ? 'pill-fail' : ''}">__tcfapi: ${tcf.apiPresent === null ? 'unknown' : String(tcf.apiPresent)}</span>
          <span class="pill">GDPR Applies: ${escapeHtml(tcf.gdprApplies === null ? 'unknown' : String(tcf.gdprApplies))}</span>
          <span class="pill">CMP ID: ${escapeHtml(tcf.cmpId ?? 'n/a')}</span>
          <span class="pill">Policy Ver: ${escapeHtml(tcf.tcfPolicyVersion ?? 'n/a')}</span>
          <span class="pill">Event Status: ${escapeHtml(tcf.eventStatus || 'n/a')}</span>
          <span class="pill">Google Vendor (755): ${escapeHtml(tcf.googleVendor?.consent === null ? 'n/a' : String(tcf.googleVendor?.consent))}</span>
          ${tcf.gamEligibility?.personalizedAds !== null ? `
            <span class="pill ${tcf.gamEligibility.personalizedAds ? 'pill-pass' : 'pill-fail'}">Personalized Ads: ${tcf.gamEligibility.personalizedAds ? 'true' : 'false'}</span>
            <span class="pill ${tcf.gamEligibility.nonPersonalizedAds ? 'pill-pass' : 'pill-fail'}">Non-Personalized Ads: ${tcf.gamEligibility.nonPersonalizedAds ? 'true' : 'false'}</span>
            <span class="pill">Limited Ads: ${tcf.gamEligibility.limitedAds ? 'true' : 'false'}</span>
          ` : ''}
        </div>
        <div style="margin-bottom:18px">
          <div style="font-size:12px;font-weight:600;color:var(--text-muted);margin-bottom:6px">
            TC String (<code>tcString</code> — ${tcf.tcStringLength || 0} chars, source: <code>${escapeHtml(tcf.tcStringSource || 'none')}</code>)
          </div>
          <div style="background:rgba(0,0,0,0.35);border:1px solid var(--border);border-radius:var(--radius-sm);padding:10px 12px;font-family:var(--font-mono);font-size:12px;color:#7dd3fc;word-break:break-all">
            ${escapeHtml(tcf.tcString || 'absent')}
          </div>
        </div>
        ${(tcf.checks || []).length ? `
        <div class="table-responsive" style="margin-bottom:18px">
          <table>
            <thead><tr><th>TCF Check</th><th>Status</th><th>Details</th></tr></thead>
            <tbody>${tcf.checks.map(check => `<tr><td>${escapeHtml(check.name)}</td><td>${check.passed === null ? 'Unknown' : check.passed ? 'Passed' : 'Failed'}</td><td>${escapeHtml(check.details)}</td></tr>`).join('')}</tbody>
          </table>
        </div>` : ''}
        <div class="table-responsive">
          <table>
            <thead>
              <tr>
                <th>Purpose</th>
                <th>Description</th>
                <th>Consent</th>
                <th>Legitimate Interest</th>
                <th>GAM Requirement</th>
              </tr>
            </thead>
            <tbody>
              ${(tcf.purposes || []).map(p => `
                <tr>
                  <td><b>Purpose ${p.id}</b></td>
                  <td>${escapeHtml(p.name)}</td>
                  <td>${p.consent === null ? '<span style="color:var(--text-dim)">n/a</span>' : p.consent ? '<span class="badge-fill direct">true</span>' : '<span class="badge-fill unfilled">false</span>'}</td>
                  <td>${p.legitimateInterest === null ? '<span style="color:var(--text-dim)">n/a</span>' : p.legitimateInterest ? '<span class="badge-fill direct">true</span>' : '<span style="color:var(--text-dim)">false</span>'}</td>
                  <td style="font-size:12px;color:var(--text-muted)">${escapeHtml(p.gamRole)}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
      ` : ''}

      <div class="section-card">
        <div class="section-head">
          <h2 class="section-title">Page-Level Targeting (pubads().getTargeting)</h2>
        </div>
        <div class="table-responsive">
          <table>
            <thead>
              <tr>
                <th>Key</th>
                <th>Configured Values</th>
              </tr>
            </thead>
            <tbody>
              ${Object.keys(gpt.pageTargeting || {}).length === 0 ? `
                <tr><td colspan="2" style="color:var(--text-dim);text-align:center">No page-level targeting set.</td></tr>
              ` : Object.entries(gpt.pageTargeting || {}).map(([k, v]) => `
                <tr>
                  <td><code>${escapeHtml(k)}</code></td>
                  <td><code>${escapeHtml(Array.isArray(v) ? v.join(', ') : v)}</code></td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>

      <div class="section-card">
        <div class="section-head">
          <h2 class="section-title">Prebid.js Integration</h2>
        </div>
        ${!neighbours.prebid?.present ? `
          <p style="color:var(--text-dim)">Prebid.js was not detected in global scope.</p>
        ` : `
          <div class="pill-list" style="margin-bottom:16px;">
            <span class="pill pill-primary">Version: ${escapeHtml(neighbours.prebid.version || 'unknown')}</span>
            <span class="pill">Timeout: ${escapeHtml(neighbours.prebid.bidderTimeout ? `${neighbours.prebid.bidderTimeout} ms` : 'unset')}</span>
            <span class="pill">Ad Units: ${escapeHtml(neighbours.prebid.adUnits?.length || 0)}</span>
            <span class="pill">Bids: ${escapeHtml(neighbours.prebid.bids?.length || 0)}</span>
          </div>
        `}
      </div>
    </div>

    <!-- TAB 6: VISUAL EVIDENCE -->
    <div id="tab-visual" class="tab-pane">
      <div class="section-card">
        <div class="section-head">
          <h2 class="section-title">Visual Evidence & Console State</h2>
        </div>
        <div class="screenshots-grid">
          <div class="screenshot-card">
            <h4>Initial Viewport Screenshot (page.png)</h4>
            <div class="screenshot-img-wrap">
              <a href="page.png" target="_blank">
                <img src="page.png" alt="Page Viewport" onerror="this.onerror=null;this.parentElement.innerHTML='<div style=\\'padding:40px;text-align:center;color:var(--text-dim)\\'>No screenshot found (page.png)</div>'">
              </a>
            </div>
          </div>
          <div class="screenshot-card">
            <h4>Google Publisher Console (console.png)</h4>
            <div class="screenshot-img-wrap">
              <a href="console.png" target="_blank">
                <img src="console.png" alt="Publisher Console" onerror="this.onerror=null;this.parentElement.innerHTML='<div style=\\'padding:40px;text-align:center;color:var(--text-dim)\\'>No console screenshot found (console.png)</div>'">
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>

    <footer>
      Generated with <b>gpt-audit</b> &bull; Node 22 ESM &bull; Google Publisher Tag & Ad Manager Inspector
    </footer>

  </div>

  <script>
    function switchTab(tabId) {
      document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tab === tabId);
      });
      document.querySelectorAll('.tab-pane').forEach(pane => {
        pane.classList.toggle('active', pane.id === tabId);
      });
    }

    function filterSlots() {
      const q = document.getElementById('slotSearch').value.toLowerCase();
      const rows = document.querySelectorAll('#slotsTable tbody tr');
      rows.forEach(r => {
        const text = r.innerText.toLowerCase();
        r.style.display = text.includes(q) ? '' : 'none';
      });
    }

    function filterFindings(sev) {
      const cards = document.querySelectorAll('.finding-card');
      cards.forEach(c => {
        if (sev === 'all' || c.dataset.sev === sev) {
          c.style.display = '';
        } else {
          c.style.display = 'none';
        }
      });
    }
  </script>
</body>
</html>`;
}
