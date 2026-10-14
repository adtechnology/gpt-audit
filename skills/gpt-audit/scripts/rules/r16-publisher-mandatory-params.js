// R16: Publisher mandatory parameters check
// Severity: High / Medium
// Evidence: Snapshot or ad requests lack parameters specified in publisher config
//           (e.g., PPID, cust_params, gpt.pageTargeting, slot targeting, required slots)

import { getSingleRequestConfig } from '../batching.js';
import { initialRequestsMayBeMissing } from '../capture.js';

export function normalizeConfig(rawConfig = {}) {
  if (!rawConfig || typeof rawConfig !== 'object') {
    return null;
  }

  const req = rawConfig.required || rawConfig;
  const requestParams = Array.isArray(req.requestParams) ? req.requestParams : (Array.isArray(rawConfig.requestParams) ? rawConfig.requestParams : []);
  const ppidRequired = req.ppid === true || rawConfig.ppid === true || requestParams.includes('ppid');

  const custParams = Array.isArray(req.custParams) ? req.custParams :
    (Array.isArray(req.cust_params) ? req.cust_params :
    (Array.isArray(rawConfig.custParams) ? rawConfig.custParams :
    (Array.isArray(rawConfig.cust_params) ? rawConfig.cust_params : [])));

  const pageTargeting = Array.isArray(req.pageTargeting) ? req.pageTargeting :
    (Array.isArray(req.page_targeting) ? req.page_targeting :
    (Array.isArray(rawConfig.pageTargeting) ? rawConfig.pageTargeting :
    (Array.isArray(rawConfig.page_targeting) ? rawConfig.page_targeting : [])));

  const slotTargeting = Array.isArray(req.slotTargeting) ? req.slotTargeting :
    (Array.isArray(req.slot_targeting) ? req.slot_targeting :
    (Array.isArray(rawConfig.slotTargeting) ? rawConfig.slotTargeting :
    (Array.isArray(rawConfig.slot_targeting) ? rawConfig.slot_targeting : [])));

  const requiredElementIds = Array.isArray(rawConfig.slots?.requiredElementIds) ? rawConfig.slots.requiredElementIds :
    (Array.isArray(req.requiredElementIds) ? req.requiredElementIds :
    (Array.isArray(rawConfig.requiredElementIds) ? rawConfig.requiredElementIds : []));

  const minSlots = typeof req.minSlots === 'number' ? req.minSlots :
    (typeof rawConfig.minSlots === 'number' ? rawConfig.minSlots : null);

  const requireSafeFrame = req.requireSafeFrame === true || rawConfig.requireSafeFrame === true;
  const requireSra = req.requireSra === true || rawConfig.requireSra === true;

  const hasAnyRequirement = ppidRequired ||
    custParams.length > 0 ||
    pageTargeting.length > 0 ||
    slotTargeting.length > 0 ||
    requiredElementIds.length > 0 ||
    minSlots !== null ||
    requireSafeFrame ||
    requireSra;

  if (!hasAnyRequirement) {
    return null;
  }

  return {
    publisher: rawConfig.publisher || 'Publisher',
    ppid: ppidRequired,
    custParams,
    pageTargeting,
    slotTargeting,
    requiredElementIds,
    minSlots,
    requireSafeFrame,
    requireSra,
    raw: rawConfig
  };
}

export function evaluateCompliance(snapshot, network, rawConfig) {
  const config = normalizeConfig(rawConfig);
  if (!config) {
    return {
      active: false,
      publisher: null,
      passed: true,
      status: 'not_configured',
      checks: [],
      findings: []
    };
  }

  const findings = [];
  const checks = [];

  const slots = snapshot?.slots || [];
  const requests = network?.requests || [];
  const displayRequests = requests.filter(r => (r.kind || 'display') === 'display');
  const initialRequestsUnverified = displayRequests.length === 0 && initialRequestsMayBeMissing(snapshot, network);

  // 1. PPID Check
  if (config.ppid) {
    if (displayRequests.length === 0) {
      checks.push({
        name: 'PPID (Publisher Provided Identifier)',
        type: 'Ad Request',
        required: true,
        passed: initialRequestsUnverified ? null : false,
        details: initialRequestsUnverified
          ? 'No display ad requests were captured in the partial initial network log; earlier calls may be missing, so PPID is unverified'
          : 'No display ad requests were captured to check for PPID'
      });
      if (!initialRequestsUnverified) findings.push({
        id: 'R16',
        severity: 'high',
        slot: null,
        evidence: 'Mandatory PPID check failed: no display ad requests were captured',
        fix: 'Ensure googletag.pubads().setPublisherProvidedId(...) is configured and ad requests are sent'
      });
    } else {
      const withPpid = displayRequests.filter(r => r.ppid === true);
      const passed = withPpid.length === displayRequests.length;
      checks.push({
        name: 'PPID (Publisher Provided Identifier)',
        type: 'Ad Request',
        required: true,
        passed,
        details: passed
          ? `Present across all ${displayRequests.length} display ad request(s)`
          : `Missing in ${displayRequests.length - withPpid.length} of ${displayRequests.length} display ad request(s)`
      });

      if (!passed) {
        findings.push({
          id: 'R16',
          severity: 'high',
          slot: null,
          evidence: `Mandatory parameter 'ppid' is missing: ${displayRequests.length - withPpid.length} of ${displayRequests.length} display ad request(s) omit the ppid parameter`,
          fix: 'Call googletag.pubads().setPublisherProvidedId("<id>") before ad requests are dispatched'
        });
      }
    }
  }

  // 2. Custom Parameters (cust_params) in Ad Requests
  for (const key of config.custParams) {
    if (displayRequests.length === 0) {
      checks.push({
        name: `cust_params: '${key}'`,
        type: 'Ad Request',
        required: true,
        passed: initialRequestsUnverified ? null : false,
        details: initialRequestsUnverified
          ? 'No display ad requests were captured in the partial initial network log; earlier calls may be missing, so custom parameters are unverified'
          : 'No display ad requests captured'
      });
      if (!initialRequestsUnverified) findings.push({
        id: 'R16',
        severity: 'high',
        slot: null,
        evidence: `Mandatory custom parameter '${key}' missing: no display ad requests were captured`,
        fix: `Pass '${key}' in targeting via googletag.pubads().setTargeting('${key}', value)`
      });
    } else {
      const missing = displayRequests.filter(r => {
        const val = r.cust_params?.[key];
        return val === undefined || val === null || val === '' || (Array.isArray(val) && val.length === 0);
      });
      const passed = missing.length === 0;
      checks.push({
        name: `cust_params: '${key}'`,
        type: 'Ad Request',
        required: true,
        passed,
        details: passed
          ? `Present across all ${displayRequests.length} display ad request(s)`
          : `Missing in ${missing.length} of ${displayRequests.length} display ad request(s)`
      });

      if (!passed) {
        findings.push({
          id: 'R16',
          severity: 'high',
          slot: null,
          evidence: `Mandatory custom parameter '${key}' is missing from cust_params in ${missing.length} display ad request(s)`,
          fix: `Set targeting key '${key}' via googletag.pubads().setTargeting('${key}', value) or slot.setTargeting('${key}', value)`
        });
      }
    }
  }

  // 3. Page-Level Targeting (gpt.pageTargeting)
  const pageTargeting = snapshot?.gpt?.pageTargeting || {};
  const presentPageKeys = Object.keys(pageTargeting);
  for (const key of config.pageTargeting) {
    const val = pageTargeting[key];
    const exists = val !== undefined && val !== null && val !== '' && !(Array.isArray(val) && val.length === 0);
    checks.push({
      name: `Page Targeting: '${key}'`,
      type: 'Page Config',
      required: true,
      passed: exists,
      details: exists
        ? `Configured: ${JSON.stringify(val)}`
        : `Missing from gpt.pageTargeting (present keys: [${presentPageKeys.join(', ')}])`
    });

    if (!exists) {
      findings.push({
        id: 'R16',
        severity: 'high',
        slot: null,
        evidence: `Mandatory page-level targeting key '${key}' is missing from gpt.pageTargeting (present: [${presentPageKeys.join(', ')}])`,
        fix: `Call googletag.pubads().setTargeting('${key}', '<value>') before calling enableServices()`
      });
    }
  }

  // 4. Slot-Level Targeting Keys
  for (const key of config.slotTargeting) {
    const missingSlots = slots.filter(s => {
      const val = s.targeting?.[key];
      return val === undefined || val === null || val === '' || (Array.isArray(val) && val.length === 0);
    });
    const passed = slots.length > 0 && missingSlots.length === 0;
    checks.push({
      name: `Slot Targeting: '${key}'`,
      type: 'Slot Config',
      required: true,
      passed,
      details: passed
        ? `Present on all ${slots.length} slot(s)`
        : `Missing on ${missingSlots.length} slot(s): [${missingSlots.map(s => s.elementId || 'unknown').join(', ')}]`
    });

    for (const slot of missingSlots) {
      findings.push({
        id: 'R16',
        severity: 'medium',
        slot: slot.elementId || null,
        evidence: `Slot '${slot.elementId || '(unknown)'}' is missing mandatory targeting key '${key}'`,
        fix: `Call slot.setTargeting('${key}', '<value>') on slot '${slot.elementId || 'slot'}'`
      });
    }
  }

  // 5. Required Element IDs
  for (const elemId of config.requiredElementIds) {
    const found = slots.some(s => s.elementId === elemId);
    checks.push({
      name: `Required Slot: '#${elemId}'`,
      type: 'Slot Existence',
      required: true,
      passed: found,
      details: found ? `Slot '#${elemId}' defined and registered` : `Slot '#${elemId}' not found on page`
    });

    if (!found) {
      findings.push({
        id: 'R16',
        severity: 'high',
        slot: elemId,
        evidence: `Mandatory ad slot '#${elemId}' required by publisher configuration was not found in defined slots`,
        fix: `Ensure googletag.defineSlot(..., '#${elemId}') is called and matching container div exists in DOM`
      });
    }
  }

  // 6. Minimum Slot Count
  if (config.minSlots !== null) {
    const passed = slots.length >= config.minSlots;
    checks.push({
      name: `Minimum Slot Count (>= ${config.minSlots})`,
      type: 'Slot Count',
      required: true,
      passed,
      details: `Found ${slots.length} slot(s) (minimum required: ${config.minSlots})`
    });

    if (!passed) {
      findings.push({
        id: 'R16',
        severity: 'medium',
        slot: null,
        evidence: `Page defines ${slots.length} ad slot(s), but publisher configuration mandates at least ${config.minSlots}`,
        fix: 'Verify all expected ad slots are initialized and registered on the page'
      });
    }
  }

  // 7. SafeFrame Policy
  if (config.requireSafeFrame) {
    const nonSafeFrameSlots = slots.filter(s => s.render && !s.render.isEmpty && s.iframe?.present && !s.iframe.safeFrame);
    const passed = nonSafeFrameSlots.length === 0;
    checks.push({
      name: 'SafeFrame Enforcement',
      type: 'Security Policy',
      required: true,
      passed,
      details: passed
        ? 'All rendered creatives use SafeFrame'
        : `${nonSafeFrameSlots.length} slot(s) rendered in friendly iframes`
    });

    for (const slot of nonSafeFrameSlots) {
      findings.push({
        id: 'R16',
        severity: 'medium',
        slot: slot.elementId || null,
        evidence: `Slot '${slot.elementId || '(unknown)'}' rendered inside a friendly iframe instead of a SafeFrame`,
        fix: 'Enable SafeFrame in Google Ad Manager creative and ad unit configuration'
      });
    }
  }

  // 8. SRA Policy
  if (config.requireSra) {
    const passed = getSingleRequestConfig(snapshot);
    checks.push({
      name: 'Single Request Architecture (SRA)',
      type: 'Architecture',
      required: true,
      passed,
      details: passed === true ? 'singleRequest is explicitly configured as true'
        : passed === false ? 'singleRequest is explicitly configured as false'
        : 'singleRequest configuration is unavailable; compressed transport or observed batching does not verify configured SRA'
    });

    if (passed === false) {
      findings.push({
        id: 'R16',
        severity: 'medium',
        slot: null,
        evidence: 'Publisher configuration mandates Single Request Architecture, but singleRequest is explicitly configured as false',
        fix: 'Call googletag.setConfig({ singleRequest: true }) before googletag.enableServices()'
      });
    }
  }

  const passed = checks.some(check => check.passed === false) ? false : checks.some(check => check.passed === null) ? null : true;
  return {
    active: true,
    publisher: config.publisher,
    passed,
    status: passed === null ? 'incomplete' : passed ? 'compliant' : 'non-compliant',
    checks,
    findings
  };
}

export default function r16PublisherMandatoryParams(snapshot, network, context = {}) {
  const config = context?.config || null;
  if (!config) {
    return [];
  }
  const evaluation = evaluateCompliance(snapshot, network, config);
  return evaluation.findings;
}
