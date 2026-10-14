# Audit targets

One URL per line. The agent audits each with one page load, accepts the CMP, never clicks a creative.

## Fixture (always first)

- http://localhost:8787/broken-page.html — planted anomalies R01, R02, R04, R05, R06, R09, R10, R13
- http://localhost:8787/broken-page-hb.html — planted anomaly R08

## Property I control

- https://www.telegraph.co.uk/

## Foreign properties (variety: one with Prebid, one with SRA on, one with lazy loading)

- https://www.telegraph.co.uk/
- https://www.bild.de/
