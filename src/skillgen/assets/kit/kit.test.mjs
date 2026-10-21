// The kit templates as they ship: each sample's generated skill is written to a temp directory
// and its kit/*.mjs files are imported from there (and run once with plain `node`).
// SKILL_DUMP_DIR=<dir> keeps the generated skills there for review instead of deleting them.
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildGraph } from '../../../graph/index.ts';
import { exampleArgs } from '../../../model/examples.ts';
import { SAMPLES, sampleModel } from '../../../samples/index.ts';
import { generateSkill } from '../../index.ts';

const keep = process.env.SKILL_DUMP_DIR;
const root = keep ?? mkdtempSync(join(tmpdir(), 'spec2skill-kit-'));
const skills = {};
const kit = (id, file) => import(/* @vite-ignore */ pathToFileURL(join(skills[id].dir, 'kit', file)).href);
const ENV = { TASKS_API_TOKEN: 'tok', SWAGGER_PETSTORE_API_KEY: 'key', SWAGGER_PETSTORE_TOKEN: 'oauth' };

beforeAll(async () => {
  for (const sample of SAMPLES) {
    const model = await sampleModel(sample);
    const tree = generateSkill(model, buildGraph(model));
    const dir = join(root, sample.id);
    rmSync(dir, { recursive: true, force: true });
    for (const [path, text] of Object.entries(tree)) {
      mkdirSync(dirname(join(dir, path)), { recursive: true });
      writeFileSync(join(dir, path), text);
    }
    skills[sample.id] = { dir, model };
  }
});
afterAll(() => {
  if (!keep) rmSync(root, { recursive: true, force: true });
});

describe('kit/client.mjs buildRequest', () => {
  it('builds method, URL and body for every Tasks and Petstore operation from placeholder arguments', async () => {
    for (const id of ['tasks', 'petstore']) {
      const { model } = skills[id];
      const { buildRequest } = await kit(id, 'client.mjs');
      const { api } = await kit(id, 'args.mjs');
      const json = [];
      for (const op of model.operations) {
        const args = exampleArgs(op.inputs);
        const req = buildRequest(op.id, args, { env: ENV });
        expect(req.method).toBe(op.method.toUpperCase());
        expect(req.url).toMatch(new RegExp(`^${model.servers[0]}${op.path.replace(/\{[^}]+\}.*/, '')}`));
        expect(req.url).not.toMatch(/[{}]/);
        for (const p of op.inputs.filter((i) => i.in === 'path')) expect(req.url).toContain(encodeURIComponent(String(args[p.name])));
        const sent = op.inputs.filter((i) => i.in === 'body' && args[i.name] !== undefined);
        expect(req.body === undefined).toBe(sent.length === 0);
        if (sent.length && op.requestBody.contentType.includes('json')) {
          const fields = Object.fromEntries(sent.map((p) => [p.name, args[p.name]]));
          json.push([op.id, JSON.parse(req.body), api.operations.find((o) => o.id === op.id).body.whole ? args.body : fields]);
        }
        expect(req.missingAuth).toEqual([]);
      }
      expect(json.length).toBeGreaterThan(5);
      for (const [, sent, expected] of json) expect(sent).toEqual(expected);
    }
  });

  it('places path, query, body and credentials (Tasks)', async () => {
    const { buildRequest } = await kit('tasks', 'client.mjs');
    const create = buildRequest('createTask', { projectId: 'p 1', title: 'Write', labelIds: ['a'] }, { env: ENV });
    expect(create).toEqual({
      method: 'POST',
      url: 'https://tasks.example.com/v1/projects/p%201/tasks',
      headers: { authorization: 'Bearer tok', 'content-type': 'application/json' },
      body: '{"labelIds":["a"],"title":"Write"}', // declared order
      missingAuth: [],
    });
    const list = buildRequest('listTasks', { projectId: 'p', status: 'done', cursor: 'c2' }, { env: {}, baseUrl: 'http://127.0.0.1:9/' });
    expect(list.url).toBe('http://127.0.0.1:9/projects/p/tasks?cursor=c2&status=done');
    expect(list.headers.authorization).toBe('Bearer $TASKS_API_TOKEN');
    expect(list.missingAuth).toEqual(['TASKS_API_TOKEN']);
    expect(buildRequest('getTask', { taskId: 't' }, { env: { TASKS_API_BASE_URL: 'https://staging.test' } }).url).toBe('https://staging.test/tasks/t');
  });

  it('handles api keys, query arrays, form and multipart bodies and whole-array bodies (Petstore)', async () => {
    const { buildRequest } = await kit('petstore', 'client.mjs');
    expect(buildRequest('getPetById', { petId: 5 }, { env: ENV }).headers).toEqual({ api_key: 'key' });
    expect(buildRequest('findPetsByStatus', { status: ['available', 'sold'] }, { env: ENV }).url).toBe(
      'https://petstore.swagger.io/v2/pet/findByStatus?status=available&status=sold',
    );
    const form = buildRequest('updatePetWithForm', { petId: 1, name: 'Rex' }, { env: ENV });
    expect([form.headers['content-type'], form.body]).toEqual(['application/x-www-form-urlencoded', 'name=Rex']);
    const upload = buildRequest('uploadFile', { petId: 1, file: 'bytes' }, { env: ENV });
    expect(upload.body).toBeInstanceOf(FormData);
    expect(upload.body.get('file')).toBe('bytes');
    expect(buildRequest('createUsersWithArrayInput', { body: [{ username: 'a' }] }, { env: {} })).toMatchObject({ body: '[{"username":"a"}]', missingAuth: [] });
    expect(buildRequest('loginUser', { username: 'a', password: 'b' }, { env: {} }).url).toBe('https://petstore.swagger.io/v2/user/login?username=a&password=b');
  });

  it('rejects bad arguments with an ArgsError naming the operation and argument', async () => {
    const { buildRequest, ArgsError } = await kit('tasks', 'client.mjs');
    const cases = [
      ['createTask', { projectId: 'p' }, 'createTask: missing required argument "title"'],
      ['getTask', { taskId: 't', verbose: true }, 'getTask: unknown argument "verbose" (takes taskId)'],
      ['listTasks', { projectId: 'p', status: 'nope' }, 'listTasks: argument "status" must be one of todo, in_progress, done'],
      ['listTasks', { projectId: 'p', limit: '10' }, 'listTasks: argument "limit" must be integer, got string'],
      ['getTasks', {}, 'unknown operation "getTasks": use an id from kit/operations.json'],
    ];
    for (const [id, args, message] of cases) {
      expect(() => buildRequest(id, args)).toThrow(message);
      expect(() => buildRequest(id, args)).toThrow(ArgsError);
    }
  });
});

describe('kit/mcp.mjs and kit/chains.mjs', () => {
  it('validateArgs accepts placeholder arguments for every filesystem tool and rejects missing ones', async () => {
    const { validateArgs, buildCall } = await kit('filesystem', 'mcp.mjs');
    const tools = skills.filesystem.model.operations;
    for (const op of tools) expect(validateArgs(op.id, exampleArgs(op.inputs)).id).toBe(op.id);
    for (const op of tools.filter((o) => o.inputs.some((p) => p.required))) {
      const required = op.inputs.find((p) => p.required);
      expect(() => validateArgs(op.id, {})).toThrow(`${op.id}: missing required argument "${required.name}"`);
    }
    expect(() => validateArgs('list_directory_with_sizes', { path: '/a', sortBy: 'date' })).toThrow('must be one of name, size');
    expect(buildCall('read_text_file', { path: '/a', head: 3 }, 7)).toEqual({
      jsonrpc: '2.0', id: 7, method: 'tools/call', params: { name: 'read_text_file', arguments: { path: '/a', head: 3 } },
    });
  });

  it('exposes the chains and next steps from operations.json', async () => {
    const { chains, nextSteps, sources } = await kit('tasks', 'chains.mjs');
    expect(chains[0].ops).toEqual(['listProjects', 'listTasks', 'getTask', 'getMember']);
    expect(nextSteps('listTasks')).toContainEqual({ to: 'getTask', via: 'id -> taskId', confidence: 'exact' });
    expect(sources('getTask').map((s) => s.from)).toEqual(['listTasks', 'createTask']);
  });

  it('runs under plain node, outside Vite', () => {
    const script = `import { buildRequest } from './kit/client.mjs'; import { chains } from './kit/chains.mjs';
      console.log(JSON.stringify([buildRequest('getTask', { taskId: 'x' }, { env: {} }).url, chains.length]));`;
    const out = execFileSync('node', ['--input-type=module', '-e', script], { cwd: skills.tasks.dir, encoding: 'utf8' });
    expect(JSON.parse(out)).toEqual(['https://tasks.example.com/v1/tasks/x', 5]);
  });
});
