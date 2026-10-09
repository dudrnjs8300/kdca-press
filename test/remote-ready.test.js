import test from 'node:test';
import assert from 'node:assert/strict';
import {waitForRemoteReady} from '../scripts/remote-ready.js';

test('deployment check tolerates temporary route and secret propagation', async () => {
  const responses = [new Response('', {status: 404}), new Response('', {status: 503}), Response.json({status: 'ok'})];
  await waitForRemoteReady('https://example.workers.dev', {
    fetchImpl: async () => responses.shift(), attempts: 3, delayMs: 0,
  });
  assert.equal(responses.length, 0);
});

test('deployment check still fails for a persistently missing route', async () => {
  let calls = 0;
  await assert.rejects(waitForRemoteReady('https://example.workers.dev', {
    fetchImpl: async () => {calls++; return new Response('', {status: 404});},
    attempts: 2, delayMs: 0,
  }), /did not become ready/);
  assert.equal(calls, 2);
});

test('deployment check does not retry an authorization rejection', async () => {
  let calls = 0;
  await assert.rejects(waitForRemoteReady('https://example.workers.dev', {
    fetchImpl: async () => {calls++; return new Response('', {status: 403});},
    attempts: 3, delayMs: 0,
  }), /403/);
  assert.equal(calls, 1);
});
