// tcf.js — IAB TCF v2.0 / v2.2 Consent & TC String Analyzer.
// Decodes base64url TCF v2 core strings (bits 0..229+ including vendor bitfields/ranges),
// merges live window.__tcfapi('getTCData') state with network gampad/ads parameters,
// and evaluates Purpose 1–10 consents, Legitimate Interests, Special Features, and GAM eligibility.

export const TCF_PURPOSES = [
  { id: 1, name: 'Store and/or access information on a device', gamRole: 'Consent required for personalized & non-personalized ads (cookies/local storage)' },
  { id: 2, name: 'Use limited data to select advertising', gamRole: 'Consent or LI required for all ad serving (Basic Ads)' },
  { id: 3, name: 'Create profiles for personalised advertising', gamRole: 'Consent required for personalized ads' },
  { id: 4, name: 'Use profiles to select personalised advertising', gamRole: 'Consent required for personalized ads' },
  { id: 5, name: 'Create profiles to personalise content', gamRole: 'Not required by GAM ad serving' },
  { id: 6, name: 'Use profiles to select personalised content', gamRole: 'Not required by GAM ad serving' },
  { id: 7, name: 'Measure advertising performance', gamRole: 'Consent or LI required for ad & viewability measurement' },
  { id: 8, name: 'Measure content performance', gamRole: 'Not required by GAM ad serving' },
  { id: 9, name: 'Understand audiences through statistics or combinations of data', gamRole: 'Consent or LI required for audience insights' },
  { id: 10, name: 'Develop and improve services', gamRole: 'Consent or LI required for product delivery & improvement' }
];

export const TCF_SPECIAL_FEATURES = [
  { id: 1, name: 'Use precise geolocation data' },
  { id: 2, name: 'Actively scan device characteristics for identification' }
];

export const GOOGLE_VENDOR_ID = 755;

function readBits(buf, bitOffset, bitLength) {
  let val = 0;
  for (let i = 0; i < bitLength; i++) {
    const pos = bitOffset + i;
    const byteIdx = pos >> 3;
    if (byteIdx >= buf.length) return 0;
    const bitIdx = 7 - (pos & 7);
    const bit = (buf[byteIdx] >> bitIdx) & 1;
    val = val * 2 + bit;
  }
  return val;
}

function readChar2(buf, bitOffset) {
  const c1 = readBits(buf, bitOffset, 6) + 65;
  const c2 = readBits(buf, bitOffset + 6, 6) + 65;
  return String.fromCharCode(c1, c2);
}

function parseVendorSection(buf, offset, targetVendorId) {
  const maxVendorId = readBits(buf, offset, 16);
  const isRange = readBits(buf, offset + 16, 1) === 1;
  let pos = offset + 17;
  let hasTarget = false;

  if (!isRange) {
    if (targetVendorId <= maxVendorId) {
      hasTarget = readBits(buf, pos + (targetVendorId - 1), 1) === 1;
    }
    pos += maxVendorId;
  } else {
    const numEntries = readBits(buf, pos, 12);
    pos += 12;
    for (let i = 0; i < numEntries; i++) {
      const rangeFlag = readBits(buf, pos, 1) === 1;
      pos += 1;
      const startId = readBits(buf, pos, 16);
      pos += 16;
      const endId = rangeFlag ? readBits(buf, pos, 16) : startId;
      if (rangeFlag) pos += 16;
      if (targetVendorId >= startId && targetVendorId <= endId) {
        hasTarget = true;
      }
    }
  }
  return { maxVendorId, isRange, nextOffset: pos, hasTarget };
}

/**
 * Decodes an IAB TCF v2 core string into structured fields.
 * Returns null if the string is empty or not a valid TCF v2 base64url core segment.
 */
export function decodeTcString(tcString) {
  if (!tcString || typeof tcString !== 'string') return null;
  const core = tcString.trim().split('.')[0];
  if (!core || core.length < 20 || /^(.)\1{19,}$/.test(core)) return null;

  try {
    const buf = Buffer.from(core, 'base64url');
    if (buf.length < 29) return null; // Core header up to bit 229 requires at least 29 bytes

    const version = readBits(buf, 0, 6);
    if (version !== 2) return null;

    const createdDs = readBits(buf, 6, 36);
    const updatedDs = readBits(buf, 42, 36);
    const cmpId = readBits(buf, 78, 12);
    const cmpVersion = readBits(buf, 90, 12);
    const consentScreen = readBits(buf, 102, 6);
    const consentLanguage = readChar2(buf, 108);
    const vendorListVersion = readBits(buf, 120, 12);
    const tcfPolicyVersion = readBits(buf, 132, 6);
    if (cmpId === 0 || tcfPolicyVersion === 0 || tcfPolicyVersion > 10) return null;
    const isServiceSpecific = readBits(buf, 138, 1) === 1;
    const useNonStandardTexts = readBits(buf, 139, 1) === 1;

    const specialFeatureOptins = {};
    for (let i = 1; i <= 2; i++) {
      specialFeatureOptins[i] = readBits(buf, 140 + (i - 1), 1) === 1;
    }

    const purposeConsents = {};
    const purposeLegitimateInterests = {};
    for (let i = 1; i <= 10; i++) {
      purposeConsents[i] = readBits(buf, 152 + (i - 1), 1) === 1;
      purposeLegitimateInterests[i] = readBits(buf, 176 + (i - 1), 1) === 1;
    }

    const purposeOneTreatment = readBits(buf, 200, 1) === 1;
    const publisherCC = readChar2(buf, 201);

    let googleVendorConsent = null;
    let googleVendorLI = null;
    if (buf.length * 8 >= 230) {
      const vc = parseVendorSection(buf, 213, GOOGLE_VENDOR_ID);
      googleVendorConsent = vc.hasTarget;
      if (buf.length * 8 >= vc.nextOffset + 17) {
        const vli = parseVendorSection(buf, vc.nextOffset, GOOGLE_VENDOR_ID);
        googleVendorLI = vli.hasTarget;
      }
    }

    return {
      valid: true,
      version,
      created: createdDs > 0 ? new Date(createdDs * 100).toISOString() : null,
      lastUpdated: updatedDs > 0 ? new Date(updatedDs * 100).toISOString() : null,
      cmpId,
      cmpVersion,
      consentScreen,
      consentLanguage,
      vendorListVersion,
      tcfPolicyVersion,
      isServiceSpecific,
      useNonStandardTexts,
      purposeOneTreatment,
      publisherCC,
      specialFeatureOptins,
      purposeConsents,
      purposeLegitimateInterests,
      googleVendorConsent,
      googleVendorLI
    };
  } catch (_) {
    return null;
  }
}

/**
 * Combines live __tcfapi snapshot data and network gampad/ads parameters into a full TCF analysis.
 */
export function analyzeTcf(snapshot, network) {
  const tcfSnap = snapshot?.neighbours?.consent?.tcf || {};
  const requests = network?.requests || [];

  const apiPresent = Boolean(tcfSnap.present);
  const netGdprReq = requests.find(r => r.gdpr !== undefined && r.gdpr !== null);
  const netTcReq = requests.find(r => (r.tcString && r.tcString.length > 0) || (r.raw?.gdpr_consent && r.raw.gdpr_consent.length > 0));
  const netTcString = netTcReq?.tcString || netTcReq?.raw?.gdpr_consent || null;
  const snapTcString = typeof tcfSnap.tcString === 'string' && tcfSnap.tcString.length > 0 ? tcfSnap.tcString : null;

  const tcString = snapTcString || netTcString || null;
  const tcStringSource = snapTcString ? '__tcfapi' : (netTcString ? 'network' : 'none');
  const tcStringLength = tcString ? tcString.length : (tcfSnap.tcStringLength ?? netGdprReq?.gdpr_consent ?? 0);

  const decoded = tcString ? decodeTcString(tcString) : null;

  const gdprApplies = typeof tcfSnap.gdprApplies === 'boolean'
    ? tcfSnap.gdprApplies
    : (netGdprReq ? netGdprReq.gdpr === '1' : null);

  const cmpId = tcfSnap.cmpId ?? decoded?.cmpId ?? null;
  const cmpVersion = tcfSnap.cmpVersion ?? decoded?.cmpVersion ?? null;
  const tcfPolicyVersion = tcfSnap.tcfPolicyVersion ?? decoded?.tcfPolicyVersion ?? null;
  const vendorListVersion = decoded?.vendorListVersion ?? null;
  const publisherCC = tcfSnap.publisherCC || decoded?.publisherCC || null;
  const eventStatus = tcfSnap.eventStatus || null;
  const cmpStatus = tcfSnap.cmpStatus || null;
  const isServiceSpecific = tcfSnap.isServiceSpecific ?? decoded?.isServiceSpecific ?? null;
  const addtlConsent = tcfSnap.addtlConsent || requests.find(r => r.addtl_consent)?.addtl_consent || null;

  // Resolve Purpose 1..10 consents and legitimate interests
  const hasSnapPurposes = tcfSnap.purposeConsents && typeof tcfSnap.purposeConsents === 'object' && Object.keys(tcfSnap.purposeConsents).length > 0;
  const hasSnapLI = tcfSnap.purposeLegitimateInterests && typeof tcfSnap.purposeLegitimateInterests === 'object' && Object.keys(tcfSnap.purposeLegitimateInterests).length > 0;

  const purposes = TCF_PURPOSES.map(p => {
    let consent = null;
    if (hasSnapPurposes && p.id in tcfSnap.purposeConsents) {
      consent = Boolean(tcfSnap.purposeConsents[p.id]);
    } else if (decoded?.purposeConsents && p.id in decoded.purposeConsents) {
      consent = Boolean(decoded.purposeConsents[p.id]);
    } else if (p.id === 1 && typeof tcfSnap.purpose1 === 'boolean') {
      consent = tcfSnap.purpose1;
    }

    let legitimateInterest = null;
    if (hasSnapLI && p.id in tcfSnap.purposeLegitimateInterests) {
      legitimateInterest = Boolean(tcfSnap.purposeLegitimateInterests[p.id]);
    } else if (decoded?.purposeLegitimateInterests && p.id in decoded.purposeLegitimateInterests) {
      legitimateInterest = Boolean(decoded.purposeLegitimateInterests[p.id]);
    }

    return {
      id: p.id,
      name: p.name,
      consent,
      legitimateInterest,
      gamRole: p.gamRole
    };
  });

  const specialFeatures = TCF_SPECIAL_FEATURES.map(sf => {
    let optIn = null;
    if (tcfSnap.specialFeatureOptins && sf.id in tcfSnap.specialFeatureOptins) {
      optIn = Boolean(tcfSnap.specialFeatureOptins[sf.id]);
    } else if (decoded?.specialFeatureOptins && sf.id in decoded.specialFeatureOptins) {
      optIn = Boolean(decoded.specialFeatureOptins[sf.id]);
    }
    return {
      id: sf.id,
      name: sf.name,
      optIn
    };
  });

  const googleVendorConsent = tcfSnap.googleVendorConsent ?? decoded?.googleVendorConsent ?? null;
  const googleVendorLI = tcfSnap.googleVendorLI ?? decoded?.googleVendorLI ?? null;

  // Evaluate GAM ad serving eligibility based on purposes
  const pMap = Object.fromEntries(purposes.map(p => [p.id, p]));
  const hasAnyPurposeData = purposes.some(p => p.consent !== null || p.legitimateInterest !== null);
  const p1Consent = pMap[1]?.consent;
  const p34Consent = pMap[3]?.consent === true && pMap[4]?.consent === true;
  const p27910Ok = [2, 7, 9, 10].every(id => {
    const p = pMap[id];
    if (p.consent === null && p.legitimateInterest === null) return true;
    return p.consent === true || p.legitimateInterest === true;
  });

  const gamEligibility = {
    personalizedAds: hasAnyPurposeData ? Boolean(p1Consent === true && p34Consent && p27910Ok && googleVendorConsent !== false) : null,
    nonPersonalizedAds: hasAnyPurposeData ? Boolean(p1Consent === true && p27910Ok && googleVendorConsent !== false) : null,
    limitedAds: hasAnyPurposeData ? Boolean(p1Consent === false && p27910Ok) : null
  };

  // Diagnostic checks for TCF health
  const checks = [];
  const tcfActive = apiPresent || gdprApplies === true || tcStringLength > 0 || Boolean(netGdprReq);

  if (tcfActive) {
    checks.push({
      name: '__tcfapi Present',
      passed: apiPresent,
      details: apiPresent ? `window.__tcfapi detected${cmpId !== null ? ` (CMP ID: ${cmpId})` : ''}` : 'window.__tcfapi not found in main frame'
    });

    const hasValidTc = tcStringLength > 0 && (decoded !== null || !tcString);
    checks.push({
      name: 'TC String Present & Valid',
      passed: gdprApplies === false ? true : hasValidTc,
      details: tcStringLength > 0
        ? `TC string length ${tcStringLength} chars (${tcStringSource})${decoded ? `, TCF v${decoded.version} Policy v${decoded.tcfPolicyVersion}` : ''}`
        : (gdprApplies === false ? 'GDPR does not apply (gdpr=0)' : 'TC string is empty or missing while GDPR applies')
    });

    if (eventStatus) {
      const statusOk = eventStatus === 'tcloaded' || eventStatus === 'useractioncomplete';
      checks.push({
        name: 'CMP Event Status',
        passed: statusOk,
        details: `eventStatus="${eventStatus}"${statusOk ? ' (consent ready)' : ' (user interaction not completed before collection)'}`
      });
    }

    if (p1Consent !== null) {
      const npaOrLtdSent = requests.length === 0 || requests.every(r => r.npa === '1' || r.ltd === '1');
      const p1Consistent = p1Consent === true || npaOrLtdSent;
      checks.push({
        name: 'Purpose 1 (Device Storage) Consistency',
        passed: p1Consistent,
        details: p1Consent === true
          ? 'Purpose 1 consented (true)'
          : (npaOrLtdSent ? 'Purpose 1 denied (false); ad requests carry npa=1 / ltd=1' : 'Purpose 1 denied (false), but ad requests omit npa=1 and ltd=1')
      });
    }

    if (snapTcString && netTcString) {
      const inSync = snapTcString === netTcString;
      checks.push({
        name: 'Network gdpr_consent Sync',
        passed: inSync,
        details: inSync ? '__tcfapi tcString matches gampad/ads gdpr_consent' : '__tcfapi tcString differs from gampad/ads gdpr_consent parameter'
      });
    }
  }

  let status = 'not_applicable';
  let statusSummary = 'TCF / GDPR not active on this page';
  if (tcfActive) {
    const failedChecks = checks.filter(c => !c.passed);
    if (failedChecks.length > 0) {
      status = 'error';
      statusSummary = `TCF issues detected: ${failedChecks.map(c => c.name).join(', ')}`;
    } else if (gdprApplies === false) {
      status = 'healthy';
      statusSummary = 'TCF present; GDPR does not apply (gdpr=0)';
    } else {
      status = 'healthy';
      const consentedIds = purposes.filter(p => p.consent === true).map(p => p.id);
      statusSummary = `Healthy TCF v2 signal${cmpId !== null ? ` (CMP #${cmpId})` : ''} — ${consentedIds.length}/10 purposes consented`;
    }
  }

  return {
    active: tcfActive,
    status,
    statusSummary,
    apiPresent,
    gdprApplies,
    tcString,
    tcStringLength,
    tcStringSource,
    decodedValid: Boolean(decoded?.valid),
    cmpId,
    cmpVersion,
    tcfPolicyVersion,
    vendorListVersion,
    publisherCC,
    eventStatus,
    cmpStatus,
    isServiceSpecific,
    addtlConsent,
    googleVendor: {
      id: GOOGLE_VENDOR_ID,
      name: 'Google Advertising Products',
      consent: googleVendorConsent,
      legitimateInterest: googleVendorLI
    },
    gamEligibility,
    purposes,
    specialFeatures,
    checks
  };
}
