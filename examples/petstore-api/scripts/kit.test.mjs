// Regression tests for the kit: every operation builds a valid call from placeholder arguments,
// bad arguments are named, destructive calls need confirmation, and nothing touches the network
// (fetch is always a stub). Run: node --test scripts/*.test.mjs
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ArgsError, HttpError, api, exampleArgs, guard, validateArgs } from '../kit/args.mjs';
import { chains, nextSteps } from '../kit/chains.mjs';

const mcp = api.kind === 'mcp';
const kit = await import(mcp ? '../kit/mcp.mjs' : '../kit/client.mjs');
const env = Object.fromEntries(api.auth.flatMap((s) => s.env.map((name) => [name, 'test-credential'])));
const reply = (body, headers = {}, status = 200) => new Response(body, { status, headers: { 'content-type': 'application/json', ...headers } });
/** Sends with a fetch stub that records each request and answers with `answers` in turn. */
const send = (id, args, answers, options = {}) => {
  const seen = [];
  const fetch = async (url, init) => (seen.push({ url, ...init }), answers.shift() ?? reply('{}'));
  const call = mcp ? kit.callTool('http://127.0.0.1:9/mcp', id, args, { fetch, ...options }) : kit.request(id, args, { fetch, env, baseUrl: 'https://api.test', ...options });
  return { call, seen };
};
const safe = api.operations.find((op) => !op.destructive);

test('every operation accepts its placeholder arguments and builds a call', () => {
  for (const op of api.operations) {
    const args = exampleArgs(op.id);
    assert.equal(validateArgs(op.id, args).id, op.id);
    if (mcp) assert.deepEqual(kit.buildCall(op.id, args).params, { name: op.id, arguments: args });
    else {
      const req = kit.buildRequest(op.id, args, { env, baseUrl: 'https://api.test' });
      assert.equal(req.method, op.method.toUpperCase());
      assert.ok(req.url.startsWith('https://api.test/') && !/[{}]/.test(req.url), req.url);
      assert.deepEqual(req.missingAuth, []);
    }
  }
});

test('missing, unknown and mistyped arguments are rejected with the name', () => {
  for (const op of api.operations.filter((o) => o.inputs.some((p) => p.required))) {
    const { [op.inputs.find((p) => p.required).name]: dropped, ...rest } = exampleArgs(op.id);
    assert.throws(() => validateArgs(op.id, rest), new RegExp(`${op.id}: missing required argument`));
    assert.ok(dropped !== undefined);
  }
  assert.throws(() => validateArgs(api.operations[0].id, { ...exampleArgs(api.operations[0].id), notAnArgument: 1 }), /unknown argument "notAnArgument"/);
  assert.throws(() => validateArgs('noSuchOperation'), ArgsError);
});

test('destructive calls need { confirmed: true } and send nothing without it', async () => {
  for (const op of api.operations.filter((o) => o.destructive)) {
    assert.throws(() => guard(op.id), /is destructive/);
    const { call, seen } = send(op.id, exampleArgs(op.id), []);
    await assert.rejects(call, /is destructive/);
    assert.equal(seen.length, 0);
  }
});

test('a call goes through fetch and returns the parsed reply; failures throw HttpError', async () => {
  const ok = mcp
    ? [reply('{"jsonrpc":"2.0","id":1,"result":{}}', { 'mcp-session-id': 's1' }), reply('', {}, 202), reply('event: message\ndata: {"jsonrpc":"2.0","id":2,"result":{"content":[{"type":"text","text":"done"}]}}\n\n', { 'content-type': 'text/event-stream' })]
    : [reply('{"done":true}')];
  const { call, seen } = send(safe.id, exampleArgs(safe.id), ok);
  assert.deepEqual(await call, mcp ? { content: [{ type: 'text', text: 'done' }] } : { done: true });
  if (mcp) assert.equal(seen[2].headers['mcp-session-id'], 's1');
  const failing = send(safe.id, exampleArgs(safe.id), [reply('{"error":"nope"}', {}, 404)]);
  await assert.rejects(failing.call, (error) => error instanceof HttpError && error.status === 404);
});

test('chains and next steps use known operations only', () => {
  const ids = new Set(api.operations.map((op) => op.id));
  for (const chain of chains) assert.ok(chain.ops.every((id) => ids.has(id)), chain.ops.join(' -> '));
  for (const op of api.operations) for (const step of nextSteps(op.id)) assert.ok(ids.has(step.to));
});
