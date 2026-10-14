// R09: Consent mismatch
// Severity: High
// Evidence: gdpr=1 with empty gdpr_consent; gdpr=1 but explicitly absent __tcfapi;
//           gdpr=1 while a custom key-value (gdpr_applies / gdpr) in cust_params, scp, prev_scp or slot targeting says 0;
//           ad requests fired while __tcfapi eventStatus is cmpuishown; or __tcfapi tcString differs from network gdpr_consent

export default function r09ConsentMismatch(snapshot, network) {
  const findings = [];
  const requests = network?.requests || [];
  const tcf = snapshot?.neighbours?.consent?.tcf;

  // 1. gdpr=1 with empty gdpr_consent
  const reqsWithGdprEmptyConsent = requests.filter(r => r.gdpr === '1' && (!r.gdpr_consent || r.gdpr_consent === 0));
  if (reqsWithGdprEmptyConsent.length > 0) {
    findings.push({
      id: 'R09',
      severity: 'high',
      slot: null,
      evidence: `${reqsWithGdprEmptyConsent.length} ad request(s) specify gdpr=1 but gdpr_consent (TC string) is empty or missing`,
      fix: `ensure CMP generates and provides a valid IAB TC string before ad requests are sent`
    });
  }

  // 2. gdpr=1 but no __tcfapi
  const hasGdprRequest = requests.some(r => r.gdpr === '1');
  const hasTcfApi = tcf?.present === true;
  if (hasGdprRequest && tcf?.present === false) {
    findings.push({
      id: 'R09',
      severity: 'high',
      slot: null,
      evidence: `ad requests indicate gdpr=1 but window.__tcfapi is not detected on the page`,
      fix: `ensure the IAB TCF CMP stub is installed in the document <head> prior to loading GPT`
    });
  }

  // GPT can consume CMP signals and select limited ads automatically. Missing npa/ltd
  // parameters do not establish personalized serving or a Purpose 1 violation.

  // 4. gdpr=1 on the request while a custom key-value says GDPR does not apply
  const GDPR_KEYS = ['gdpr_applies', 'gdprapplies', 'gdpr'];
  const saysNo = v => {
    const vals = Array.isArray(v) ? v : [v];
    return vals.some(x => ['0', 'false', 'no'].includes(String(x).trim().toLowerCase()));
  };
  const keyIn = obj => Object.keys(obj || {}).find(k => GDPR_KEYS.includes(k.toLowerCase()) && saysNo(obj[k]));
  const contradictions = [];
  for (const r of requests.filter(r => r.gdpr === '1')) {
    const k = keyIn(r.cust_params) || keyIn(r.scp) || (r.prev_scp || []).map(keyIn).find(Boolean);
    if (k) contradictions.push(`request ${r.correlator || '?'} (${k})`);
  }
  for (const s of (snapshot?.slots || [])) {
    const k = keyIn(s.targeting);
    if (k && requests.some(r => r.gdpr === '1')) contradictions.push(`slot ${s.elementId} (${k})`);
  }
  if (contradictions.length > 0) {
    findings.push({
      id: 'R09',
      severity: 'medium',
      slot: null,
      evidence: `ad requests carry gdpr=1 while a custom targeting key says GDPR does not apply: ${contradictions.slice(0, 6).join(', ')}${contradictions.length > 6 ? ` and ${contradictions.length - 6} more` : ''}`,
      fix: `derive the custom key from the same TCF signal as the gdpr parameter (e.g. __tcfapi getTCData gdprApplies) or drop it; line items and reports keyed on it currently see the wrong value`
    });
  }

  // A final CMP snapshot cannot establish when earlier requests were sent.
  if (tcf?.present && tcf.gdprApplies === true && tcf.eventStatus === 'cmpuishown' && hasGdprRequest) {
    findings.push({
      id: 'R09',
      severity: 'medium',
      slot: null,
      evidence: `captured GDPR ad requests coexist with final TCF eventStatus "cmpuishown"; request ordering relative to consent is not established`,
      fix: `review timestamped CMP and request events to verify consent handling; a user may have reopened the consent dialog after earlier requests`
    });
  }

  // 6. __tcfapi tcString out of sync with network gdpr_consent
  if (tcf?.present && typeof tcf.tcString === 'string' && tcf.tcString.length > 0) {
    const mismatchedReqs = requests.filter(r => {
      const netTc = r.tcString || r.raw?.gdpr_consent;
      return typeof netTc === 'string' && netTc.length > 0 && netTc !== tcf.tcString;
    });
    if (mismatchedReqs.length > 0) {
      findings.push({
        id: 'R09',
        severity: 'medium',
        slot: null,
        evidence: `${mismatchedReqs.length} ad request(s) carry a gdpr_consent string that differs from window.__tcfapi tcString`,
        fix: `refresh ad slots after CMP updates consent so GPT sends the latest TC string on gampad/ads requests`
      });
    }
  }

  return findings;
}
