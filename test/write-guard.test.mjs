// Integration tests for read-only mode and the DELETE confirmation guard.
// They start the built server (dist/index.js) over stdio, exactly as an MCP
// host would, and point it at a local stand-in for the Moneybird API so every
// request that leaves the server is recorded.
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const SERVER = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../dist/index.js');
const ADMINISTRATION_ID = '123';

function startFakeApi() {
  const received = [];
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => {
      received.push({ method: req.method, url: req.url, body });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, method: req.method }));
    });
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      resolve({ server, received, baseURL: `http://127.0.0.1:${server.address().port}` });
    });
  });
}

async function connect(baseURL, extraEnv = {}) {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [SERVER],
    // A cwd without a .env file, so only the variables below reach the server.
    cwd: os.tmpdir(),
    env: {
      PATH: process.env.PATH,
      MONEYBIRD_API_TOKEN: 'test-token',
      MONEYBIRD_ADMINISTRATION_ID: ADMINISTRATION_ID,
      MONEYBIRD_API_BASE_URL: baseURL,
      ...extraEnv,
    },
    stderr: 'ignore',
  });
  const client = new Client({ name: 'write-guard-test', version: '0.0.0' });
  await client.connect(transport);
  return client;
}

function call(client, name, args) {
  return client.callTool({ name, arguments: args }, undefined, { timeout: 10_000 });
}

function requestTool(tools) {
  return tools.find((t) => t.name === 'moneybird_request');
}

describe('read-only mode (MONEYBIRD_READ_ONLY=true)', { timeout: 30_000 }, () => {
  let api;
  let client;

  before(async () => {
    api = await startFakeApi();
    client = await connect(api.baseURL, { MONEYBIRD_READ_ONLY: 'true' });
  });

  after(async () => {
    await client?.close();
    api?.server.close();
  });

  test('advertises only GET on moneybird_request', async () => {
    const { tools } = await client.listTools();
    assert.deepEqual(requestTool(tools).inputSchema.properties.method.enum, ['get']);
  });

  test('allows GET requests', async () => {
    api.received.length = 0;
    const result = await call(client, 'moneybird_request', { method: 'get', path: 'contacts' });
    assert.ok(!result.isError, result.content[0].text);
    assert.equal(api.received.length, 1);
    assert.equal(api.received[0].method, 'GET');
    assert.equal(api.received[0].url, `/${ADMINISTRATION_ID}/contacts`);
  });

  test('allows moneybird_list and moneybird_get', async () => {
    api.received.length = 0;
    assert.ok(!(await call(client, 'moneybird_list', { entity: 'contacts' })).isError);
    assert.ok(!(await call(client, 'moneybird_get', { entity: 'contact', id: '1' })).isError);
    assert.equal(api.received.length, 2);
  });

  for (const method of ['post', 'put', 'delete']) {
    test(`rejects ${method.toUpperCase()} without calling the API`, async () => {
      api.received.length = 0;
      const result = await call(client, 'moneybird_request', {
        method,
        path: 'contacts/1',
        data: { contact: { company_name: 'x' } },
        confirm: true,
      });
      assert.equal(result.isError, true);
      assert.match(result.content[0].text, /read-only/i);
      assert.equal(api.received.length, 0, 'no request may reach the API');
    });
  }

  test('rejects an HTTP method spelled in upper case', async () => {
    api.received.length = 0;
    const result = await call(client, 'moneybird_request', { method: 'POST', path: 'contacts' });
    assert.equal(result.isError, true);
    assert.equal(api.received.length, 0);
  });
});

describe('DELETE confirmation (read-write mode)', { timeout: 30_000 }, () => {
  let api;
  let client;

  before(async () => {
    api = await startFakeApi();
    client = await connect(api.baseURL);
  });

  after(async () => {
    await client?.close();
    api?.server.close();
  });

  test('advertises all methods and the confirm field', async () => {
    const { tools } = await client.listTools();
    const tool = requestTool(tools);
    assert.deepEqual(tool.inputSchema.properties.method.enum, ['get', 'post', 'put', 'delete']);
    assert.equal(tool.inputSchema.properties.confirm.type, 'boolean');
  });

  test('rejects DELETE without confirm', async () => {
    api.received.length = 0;
    const result = await call(client, 'moneybird_request', { method: 'delete', path: 'contacts/1' });
    assert.equal(result.isError, true);
    assert.match(result.content[0].text, /confirm/i);
    assert.equal(api.received.length, 0, 'no request may reach the API');
  });

  for (const confirm of [false, 'true', 1]) {
    test(`rejects DELETE with confirm=${JSON.stringify(confirm)}`, async () => {
      api.received.length = 0;
      const result = await call(client, 'moneybird_request', { method: 'delete', path: 'contacts/1', confirm });
      assert.equal(result.isError, true);
      assert.equal(api.received.length, 0);
    });
  }

  test('sends DELETE when confirm is true', async () => {
    api.received.length = 0;
    const result = await call(client, 'moneybird_request', { method: 'delete', path: 'contacts/1', confirm: true });
    assert.ok(!result.isError, result.content[0].text);
    assert.equal(api.received.length, 1);
    assert.equal(api.received[0].method, 'DELETE');
    assert.equal(api.received[0].url, `/${ADMINISTRATION_ID}/contacts/1`);
  });

  test('sends POST and PUT without confirm', async () => {
    api.received.length = 0;
    const post = await call(client, 'moneybird_request', {
      method: 'post', path: 'contacts', data: { contact: { company_name: 'x' } },
    });
    const put = await call(client, 'moneybird_request', {
      method: 'put', path: 'contacts/1', data: '{"contact":{"company_name":"y"}}',
    });
    assert.ok(!post.isError, post.content[0].text);
    assert.ok(!put.isError, put.content[0].text);
    assert.deepEqual(api.received.map((r) => r.method), ['POST', 'PUT']);
    assert.deepEqual(JSON.parse(api.received[1].body), { contact: { company_name: 'y' } });
  });
});

describe('MONEYBIRD_READ_ONLY parsing', { timeout: 30_000 }, () => {
  for (const [value, readOnly] of [['1', true], ['TRUE', true], ['yes', true], ['false', false], ['0', false], ['', false]]) {
    test(`"${value}" means ${readOnly ? 'read-only' : 'read-write'}`, async () => {
      const api = await startFakeApi();
      const client = await connect(api.baseURL, { MONEYBIRD_READ_ONLY: value });
      try {
        const { tools } = await client.listTools();
        const methods = requestTool(tools).inputSchema.properties.method.enum;
        assert.deepEqual(methods, readOnly ? ['get'] : ['get', 'post', 'put', 'delete']);
      } finally {
        await client.close();
        api.server.close();
      }
    });
  }

  test('an unrecognised value stops the server instead of guessing', () => {
    const run = spawnSync(process.execPath, [SERVER], {
      cwd: os.tmpdir(),
      env: {
        PATH: process.env.PATH,
        MONEYBIRD_API_TOKEN: 'test-token',
        MONEYBIRD_ADMINISTRATION_ID: ADMINISTRATION_ID,
        MONEYBIRD_READ_ONLY: 'maybe',
      },
      input: '',
      encoding: 'utf8',
      timeout: 10_000,
    });
    assert.equal(run.status, 1);
    assert.match(run.stderr, /Invalid MONEYBIRD_READ_ONLY value "maybe"/);
  });
});
