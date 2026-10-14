// A partial network log cannot establish absence when initial GPT events were also not captured.
export function initialRequestsMayBeMissing(snapshot, network) {
  return network?.capture?.initialCoverage === 'partial' &&
    snapshot?.meta?.capture?.initialEvents !== 'from-navigation';
}
