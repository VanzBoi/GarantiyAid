import assert from 'node:assert/strict';
import test from 'node:test';
import { FaceChallenges, processRealFace } from '../src/face-processor.ts';

test('face challenges bind owner, session, consent, purpose, expiry and single use', () => {
  const store = new FaceChallenges();
  const challenge = store.issue('session', 'owner', 'consent', 'enroll', 1000);
  for (const [session, owner, consent, purpose] of [['other', 'owner', 'consent', 'enroll'], ['session', 'other', 'consent', 'enroll'], ['session', 'owner', 'other', 'enroll'], ['session', 'owner', 'consent', 'verify']] as const) {
    assert.throws(() => store.consume(challenge.id, session, owner, consent, purpose, 2000));
  }
  assert.equal(store.consume(challenge.id, 'session', 'owner', 'consent', 'enroll', 2000).id, challenge.id);
  assert.throws(() => store.consume(challenge.id, 'session', 'owner', 'consent', 'enroll', 2000));
  const expired = store.issue('session', 'owner', 'consent', 'verify', 1000);
  assert.throws(() => store.consume(expired.id, 'session', 'owner', 'consent', 'verify', 92000));
  const older = store.issue('session', 'owner', 'consent', 'verify', 1000);
  store.issue('session', 'owner', 'consent', 'verify', 2000);
  assert.throws(() => store.consume(older.id, 'session', 'owner', 'consent', 'verify', 3000));
});

test('remote face responses must prove real processing and bind the challenge, subject and model', async () => {
  const challenge = new FaceChallenges().issue('s', 'b', 'c', 'verify');
  const config = { url: 'https://processor.invalid', secret: 'synthetic-secret', version: 'validated-v1' };
  const good = { subject: 'opaque-owner', challengeId: challenge.id, processorVersion: config.version, simulated: false, facesCompared: true, livenessPassed: true, matched: true };
  const sender = (data: unknown) => (async (url: string | URL | Request, init?: RequestInit) => {
    assert.equal(url, 'https://processor.invalid/v1/verify');
    assert.equal((init?.headers as Record<string, string>).Authorization, 'Bearer synthetic-secret');
    assert.equal(init?.redirect, 'error');
    return new Response(JSON.stringify(data));
  }) as typeof fetch;
  assert.equal((await processRealFace(config, good.subject, challenge, ['synthetic'], sender(good))).matched, true);
  assert.equal((await processRealFace(config, good.subject, challenge, [], sender({ ...good, matched: false }))).matched, false);
  for (const change of [{ simulated: true }, { facesCompared: false }, { livenessPassed: false }, { subject: 'other' }, { challengeId: 'old' }, { processorVersion: 'wrong' }]) {
    await assert.rejects(processRealFace(config, good.subject, challenge, [], sender({ ...good, ...change })));
  }
  const offline = (async () => { throw new Error('private provider error'); }) as typeof fetch;
  await assert.rejects(processRealFace(config, good.subject, challenge, [], offline), error => error instanceof Error && !error.message.includes('private provider'));
});
