import { describe, expect, it } from 'vitest';
import hostile from '../detail/__fixtures__/hostile-strings.json';
import { getSample, sampleModel } from '../samples';
import { envName, example, outputFields, typeLabel } from './examples';
import { normalise } from './normalise';
import type { ApiModel } from './types';

const load = (id: string) => sampleModel(getSample(id)!);
const ex = (model: ApiModel, id: string) => example(model, model.operations.find((o) => o.id === id)!);

describe('curl examples', () => {
  it('Tasks: path placeholders, bearer token from the environment, JSON body skeleton', async () => {
    const tasks = await load('tasks');
    expect(envName(tasks)).toBe('TASKS_API');
    expect(ex(tasks, 'getTask')).toBe(`curl 'https://tasks.example.com/v1/tasks/<taskId>' \\\n  -H "Authorization: Bearer $TASKS_API_TOKEN"`);
    expect(ex(tasks, 'createTask')).toBe(
      `curl -X POST 'https://tasks.example.com/v1/projects/<projectId>/tasks' \\\n  -H "Authorization: Bearer $TASKS_API_TOKEN" \\\n  -H 'Content-Type: application/json' \\\n  -d '{\n  "title": "<title>"\n}'`,
    );
  });

  it('Petstore: api key header, oauth2 bearer, form and multipart bodies, required query params', async () => {
    const pets = await load('petstore');
    expect(ex(pets, 'getPetById')).toBe(`curl 'https://petstore.swagger.io/v2/pet/<petId>' \\\n  -H "api_key: $PETSTORE_API_API_KEY"`);
    expect(ex(pets, 'updatePetWithForm')).toContain(`-H "Authorization: Bearer $PETSTORE_API_TOKEN" \\\n  --data-urlencode 'name=<name>'`);
    expect(ex(pets, 'uploadFile')).toContain(`-F 'file=@<file>'`);
    expect(ex(pets, 'loginUser')).toBe(`curl 'https://petstore.swagger.io/v2/user/login?username=<username>&password=<password>'`);
    expect(ex(pets, 'addPet')).toContain(`-d '{\n  "name": "<name>",\n  "photoUrls": []\n}'`);
  });

  it('keeps hostile spec text inside single quotes', async () => {
    const model = await normalise(hostile);
    const curl = ex(model, 'getThing');
    expect(curl).toBe(`curl 'https://api.example.com/'\\''$(touch x)'\\''/things/<id>?q'\\''"<i>=<q'\\''"<i>>'`);
  });
});

describe('MCP tools/call examples', () => {
  it('Filesystem: a JSON-RPC body with required arguments as placeholders', async () => {
    const fs = await load('filesystem');
    expect(JSON.parse(ex(fs, 'read_text_file'))).toEqual({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'read_text_file', arguments: { path: '<path>' } } });
    expect(JSON.parse(ex(fs, 'edit_file')).params.arguments).toEqual({ edits: [], path: '<path>' });
  });
});

describe('type labels and output fields', () => {
  it('names refs, arrays, variants and formats', () => {
    expect(typeLabel(undefined)).toBe('any');
    expect(typeLabel({ ref: 'Task' })).toBe('Task');
    expect(typeLabel({ type: 'array', items: { ref: 'Label' } })).toBe('Label[]');
    expect(typeLabel({ variants: [{ type: 'string' }, { type: 'integer' }] })).toBe('string | integer');
    expect(typeLabel({ type: 'string', format: 'date-time' })).toBe('string (date-time)');
  });

  it("reads a named schema's fields, or its items' fields", async () => {
    const tasks = await load('tasks');
    const op = (id: string) => tasks.operations.find((o) => o.id === id)!;
    expect(outputFields(tasks, op('getTask').output?.schema).map((f) => f.name)).toContain('assigneeId');
    expect(outputFields(tasks, op('listTasks').output?.schema).map((f) => f.name)).toContain('nextCursor');
    expect(outputFields(tasks, undefined)).toEqual([]);
  });
});
