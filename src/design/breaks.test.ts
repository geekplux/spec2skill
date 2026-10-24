import { describe, expect, it } from 'vitest';
import { idPieces } from './breaks';

describe('idPieces: identifiers wrap at word boundaries only', () => {
  it('breaks camelCase before each hump', () => {
    expect(idPieces('createUsersWithArrayInput')).toEqual(['create', 'Users', 'With', 'Array', 'Input']);
    expect(idPieces('getPetById')).toEqual(['get', 'Pet', 'By', 'Id']);
    expect(idPieces('listTasks')).toEqual(['list', 'Tasks']);
  });

  it('keeps acronyms and digits with their word', () => {
    expect(idPieces('HTTPServer')).toEqual(['HTTP', 'Server']);
    expect(idPieces('parseURL')).toEqual(['parse', 'URL']);
    expect(idPieces('int64')).toEqual(['int64']);
    expect(idPieces('oauth2Token')).toEqual(['oauth2', 'Token']);
  });

  it('breaks after _, -, / and ., and before {', () => {
    expect(idPieces('read_text_file')).toEqual(['read_', 'text_', 'file']);
    expect(idPieces('pagination-and-errors.md')).toEqual(['pagination-', 'and-', 'errors.md']);
    expect(idPieces('/projects/{projectId}/tasks')).toEqual(['/projects/', '{project', 'Id}/', 'tasks']);
    expect(idPieces('GET /user/createWithArray')).toEqual(['GET /', 'user/', 'create', 'With', 'Array']);
    expect(idPieces('io.example.Tool')).toEqual(['io.', 'example.', 'Tool']);
    expect(idPieces('a{b}')).toEqual(['a', '{b}']);
  });

  it('never makes an empty piece or one of separators alone, and keeps a short extension', () => {
    expect(idPieces('__init__')).toEqual(['__init__']);
    expect(idPieces('references/tasks.md')).toEqual(['references/', 'tasks.md']);
    expect(idPieces('x')).toEqual(['x']);
    expect(idPieces('')).toEqual(['']);
  });

  it('joins back to the text', () => {
    for (const s of ['createUsersWithListInput', 'GET /tasks/{taskId}', 'secure-filesystem-server', 'list_allowed_directories', 'SKILL.md']) {
      expect(idPieces(s).join('')).toBe(s);
    }
  });
});
