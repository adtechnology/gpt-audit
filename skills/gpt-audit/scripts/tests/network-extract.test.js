import test from 'node:test';
import assert from 'node:assert/strict';
import { parseAdRequestUrl, extractNetworkData } from '../network-extract.js';

test('parseAdRequestUrl: non-SRA request', () => {
  const url = 'https://securepubads.g.doubleclick.net/gampad/ads?iu=/6355419/Travel/Europe&sz=300x250&correlator=987654321&cust_params=section%3Deurope%26edition%3Duk%26topics%3Dskiing,alps&gdpr=1&gdpr_consent=CP1234567890ABCDEF&npa=1&ppid=user_anon_123&pvsid=pvs_555&ifi=1';
  const parsed = parseAdRequestUrl(url);

  assert.equal(parsed.host, 'securepubads.g.doubleclick.net');
  assert.equal(parsed.isSra, false);
  assert.equal(parsed.correlator, '987654321');
  assert.deepEqual(parsed.adUnits, ['/6355419/Travel/Europe']);
  assert.equal(parsed.iu, '/6355419/Travel/Europe');
  assert.equal(parsed.sz, '300x250');
  assert.equal(parsed.gdpr, '1');
  assert.equal(parsed.gdpr_consent, 18); // length of CP1234567890ABCDEF
  assert.equal(parsed.npa, '1');
  assert.equal(parsed.ppid, true);
  assert.equal(parsed.pvsid, 'pvs_555');
  assert.equal(parsed.ifi, '1');

  // cust_params decoded
  assert.equal(parsed.cust_params.section, 'europe');
  assert.equal(parsed.cust_params.edition, 'uk');
  assert.deepEqual(parsed.cust_params.topics, ['skiing', 'alps']);
});

test('parseAdRequestUrl: SRA request with iu_parts and enc_prev_ius', () => {
  const url = 'https://securepubads.g.doubleclick.net/gampad/ads?iu_parts=6355419,Travel,Europe,France,Paris&enc_prev_ius=/0/1/2/3/4,/0/1/2&prev_iu_szs=300x250,300x600|728x90&correlator=11223344&scp=pos%3Dtop%26slot%3Dleaderboard&gdpr=0&gdpr_consent=';
  const parsed = parseAdRequestUrl(url);

  assert.equal(parsed.isSra, true);
  assert.equal(parsed.correlator, '11223344');
  assert.equal(parsed.iu_parts, '6355419,Travel,Europe,France,Paris');
  assert.equal(parsed.enc_prev_ius, '/0/1/2/3/4,/0/1/2');
  assert.deepEqual(parsed.adUnits, [
    '/6355419/Travel/Europe/France/Paris',
    '/6355419/Travel/Europe'
  ]);
  assert.equal(parsed.prev_iu_szs, '300x250,300x600|728x90');
  assert.equal(parsed.gdpr, '0');
  assert.equal(parsed.gdpr_consent, 0);
  assert.equal(parsed.ppid, false);
  assert.equal(parsed.scp.pos, 'top');
  assert.equal(parsed.scp.slot, 'leaderboard');
});

test('parseAdRequestUrl: SRA request without enc_prev_ius', () => {
  const url = 'https://securepubads.g.doubleclick.net/gampad/ads?iu_parts=6355419,News,FrontPage&correlator=556677';
  const parsed = parseAdRequestUrl(url);

  assert.equal(parsed.isSra, true);
  assert.deepEqual(parsed.adUnits, ['/6355419/News/FrontPage']);
});

test('extractNetworkData: filters ad requests and libraries correctly', () => {
  const rawItems = [
    {
      url: 'https://securepubads.g.doubleclick.net/tag/js/gpt.js',
      status: 200,
      startTime: 100,
      duration: 35
    },
    {
      url: 'https://securepubads.g.doubleclick.net/gampad/ads?iu=/6355419/Home&sz=728x90&correlator=999',
      status: 200,
      timing: { startTime: 250, duration: 60 }
    },
    {
      url: 'https://securepubads.g.doubleclick.net/pagead/managed/js/gpt/pubads_impl_2026.js',
      status: 200,
      startTime: 180,
      duration: 50
    },
    {
      url: 'https://www.example.com/styles.css',
      status: 200,
      startTime: 10,
      duration: 5
    }
  ];

  const result = extractNetworkData(rawItems);
  assert.equal(result.requests.length, 1);
  assert.equal(result.requests[0].correlator, '999');
  assert.equal(result.requests[0].adUnits[0], '/6355419/Home');
  assert.equal(result.requests[0].status, 200);
  assert.equal(result.requests[0].startTime, 250);
  assert.equal(result.requests[0].duration, 60);

  assert.equal(result.libraries.length, 2);
  assert.equal(result.libraries[0].name, 'gpt.js');
  assert.equal(result.libraries[1].name, 'pubads_impl');
});
