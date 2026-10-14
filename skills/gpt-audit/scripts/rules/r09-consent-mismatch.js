// R09: Consent mismatch
// Severity: High
// Evidence: gdpr=1 with empty gdpr_consent; gdpr=1 but no __tcfapi; npa absent while purpose1 consent false

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
  if (hasGdprRequest && !hasTcfApi) {
    findings.push({
      id: 'R09',
      severity: 'high',
      slot: null,
      evidence: `ad requests indicate gdpr=1 but window.__tcfapi is not detected on the page`,
      fix: `ensure the IAB TCF CMP stub is installed in the document <head> prior to loading GPT`
    });
  }

  // 3. npa absent while purpose1 consent is false
  if (tcf?.present && tcf.gdprApplies === true && tcf.purpose1 === false) {
    const nonCompliantReqs = requests.filter(r => r.npa !== '1' && r.ltd !== '1');
    if (nonCompliantReqs.length > 0) {
      findings.push({
        id: 'R09',
        severity: 'high',
        slot: null,
        evidence: `TCF purpose 1 consent is false under GDPR, but ${nonCompliantReqs.length} ad request(s) omit npa=1 and ltd=1`,
        fix: `configure CMP / GPT privacy settings to request non-personalized ads (npa=1) or limited ads (ltd=1) when Purpose 1 consent is denied`
      });
    }
  }

  return findings;
}
