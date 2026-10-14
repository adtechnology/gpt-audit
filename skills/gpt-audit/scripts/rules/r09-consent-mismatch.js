// R09: Review incomplete request consent signaling, without inferring legal compliance.

export default function r09ConsentMismatch(snapshot, network) {
  const findings = [];
  const requests = (network?.requests || []).filter(req => req.kind !== 'video' && !req.error && !req.urlTruncated);

  // Limited-ad requests can be valid without a TC string. The local TCF global and
  // Purpose 1 snapshot alone do not determine the permitted ad-serving treatment.
  const reqsWithGdprEmptyConsent = requests.filter(req => {
    if (String(req.gdpr) !== '1' || String(req.ltd) === '1') return false;
    const consent = req.gdpr_consent ?? req.raw?.gdpr_consent;
    return consent == null || consent === 0 || (typeof consent === 'string' && !consent.trim());
  });
  if (reqsWithGdprEmptyConsent.length > 0) {
    findings.push({
      id: 'R09',
      severity: 'medium',
      status: 'needs-validation',
      slot: null,
      evidence: `${reqsWithGdprEmptyConsent.length} display ad request(s) specify gdpr=1 with an empty or missing TC string and no explicit ltd=1 signal; this requires signaling review, not a conclusion about consent or legal compliance`,
      fix: `verify request timing, CMP signaling and the intended serving treatment, including automatic TCF-driven limited ads; inspect the full consent context before changing privacy settings`
    });
  }

  return findings;
}
