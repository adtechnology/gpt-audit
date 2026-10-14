// Multi-slot batching is a request property; compressed transport and configured SRA are separate evidence.
const entries = value => typeof value === 'string' ? value.split(',').map(v => v.trim()).filter(Boolean) : [];

export function getRequestSlotCount(request = {}) {
  if (Number.isInteger(request.slotCount) && request.slotCount > 0) return request.slotCount;

  // Identity fields are stronger than size delimiters: one compressed slot can carry several pipe-separated sizes.
  const identities = [
    entries(request.dids).length,
    entries(request.enc_prev_ius).length,
    Array.isArray(request.adUnits) ? request.adUnits.filter(Boolean).length : 0,
    request.iu ? 1 : 0
  ];
  const knownCounts = identities.filter(count => count > 0);
  if (new Set(knownCounts).size > 1) return null;
  if (knownCounts.length) return knownCounts[0];

  if (Array.isArray(request.prev_scp) && request.prev_scp.length > 0) return request.prev_scp.length;
  // prev_iu_szs separators can describe several sizes for one slot, so they cannot establish batching.
  return null;
}

export function getSingleRequestConfig(snapshot = {}) {
  const value = snapshot.gpt?.config?.singleRequest ?? snapshot.gpt?.pubadsConfig?.singleRequest;
  return typeof value === 'boolean' ? value : null;
}

export function summarizeBatching(network = {}) {
  const requests = (network?.requests || []).filter(request => (request.kind || 'display') === 'display');
  let batchedRequestCount = 0, singleSlotRequestCount = 0, unknownSlotCountRequestCount = 0;
  const singleIdentities = new Set();
  let identifiedSingleRequests = 0;
  for (const request of requests) {
    const count = getRequestSlotCount(request);
    if (count > 1) batchedRequestCount++;
    else if (count === 1) {
      singleSlotRequestCount++;
      const id = entries(request.dids)[0] || request.adUnits?.[0] || request.iu;
      if (id) {
        // frm denotes main-frame/iframe transport, not a unique GPT instance; it cannot prove distinct slots.
        singleIdentities.add(id);
        identifiedSingleRequests++;
      }
    } else unknownSlotCountRequestCount++;
  }

  return {
    observed: batchedRequestCount > 0 ? true : requests.length > 0 && unknownSlotCountRequestCount === 0 ? false : null,
    displayRequestCount: requests.length,
    batchedRequestCount,
    singleSlotRequestCount,
    unknownSlotCountRequestCount,
    uniqueSingleSlotCount: singleIdentities.size,
    repeatedSingleSlotRequestCount: identifiedSingleRequests - singleIdentities.size,
    transportCompressedRequestCount: requests.filter(request => request.isSra || request.iu_parts || request.enc_prev_ius || request.prev_iu_szs).length
  };
}
