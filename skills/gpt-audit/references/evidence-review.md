# Reviewing audit evidence

Use this after the deterministic report, especially for conditional ad formats or third-party wrappers.

- **Hidden slots:** a definition with no request is observable, but may be deliberately inactive for
  the breakpoint, campaign or test. A Publisher Console “Displayed” registration can still say
  “Ad unit did not fetch.” Inspect wrapper activation before recommending another display call.
- **Layout:** inspect the slot and ancestor reservation. Hidden source iframes, takeover rendering,
  fluid/native content and extra label space can legitimately differ from the slot box. A missing
  min-height is not a measured CLS defect. State when initial layout-shift evidence is unavailable.
- **Request identity:** `dids` identifies slots; ad-unit paths can be shared. MCM paths use a colon
  in network encoding and a comma in GPT slot paths. Correlators may change during a valid refresh;
  different correlators alone do not establish duplicate initial requests.
- **Configuration:** GPT getConfig exposes only supported readable keys. Missing lazy-load or SRA
  configuration in a snapshot is unknown. SRA can fetch below-fold slots together with the first
  eligible slot, and wrappers can implement lazy loading without GPT's native configuration.
- **Consent:** TC-string presence is a signal, not consent validation. P1 rejection or an absent
  top-level CMP global alone does not prove invalid requests; limited ads and frame integration exist.
  Missing npa/ltd parameters are not automatically zeros or violations.
- **Vendor chains:** unresolved `[gdpr]`/`[gdpr_consent]` placeholders, inconsistent privacy parameters,
  failed signal collectors and empty/non-JSON responses warrant vendor/creative-owner review. Keep
  these observations separate from core GAM consent behavior and unmeasured commercial/legal impact.
- **Tool artifacts:** distinguish collector-originated console errors from page/vendor errors.
  Never extract timing from response-body JavaScript, assume HTTP200, or infer serving failure from
  an unobserved initial render or short refresh observation window.

Supplemental `review-notes.md` should include the observation, source request/message reference,
the likely owner if established, confidence/limits and the next validation step. Do not copy cookie
headers, identifiers or complete TC strings into shareable notes. Raw artifacts stay in git-ignored out/.

Primary references:

- [GPT API reference](https://developers.google.com/publisher-tag/reference) — supported getConfig keys,
  setConfig, and refresh correlator behavior.
- [Control loading and refresh](https://developers.google.com/publisher-tag/guides/control-ad-loading).
- [SRA lazy-loading sample](https://developers.google.com/publisher-tag/samples/lazy-loading).
- [Reserve space](https://developers.google.com/publisher-tag/samples/reserve-space).
- [Limited-ads sample](https://developers.google.com/publisher-tag/samples/display-limited-ad).
