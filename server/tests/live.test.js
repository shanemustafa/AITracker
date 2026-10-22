// Tests the real-engine code against a local fake server that returns responses shaped like each
// provider's documented API. This checks OUR parsing, cost and cap logic — not the providers themselves.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

let server, port;
const seen = [];
const ANSWER = 'For Finland, **Betsson** is trusted and fast. **LeoVegas** has a great app. Veikkaus is the state operator.';

before(async () => {
  server = http.createServer((req, res) => {
    let body = '';
    req.on('data', c => (body += c));
    req.on('end', () => {
      seen.push({ url: req.url, body: body ? JSON.parse(body) : null });
      const send = obj => { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(obj)); };
      if (req.url.startsWith('/redirect/')) { res.writeHead(302, { Location: 'https://www.askgamblers.com/finland' }); return res.end(); }
      if (req.url.startsWith('/openai/v1/responses')) return send({
        id: 'resp_1', object: 'response', status: 'completed', model: 'gpt-5-mini-2026', created_at: 1,
        output: [
          { type: 'web_search_call', id: 'ws_1', status: 'completed' },
          { type: 'message', id: 'm1', role: 'assistant', status: 'completed', content: [{ type: 'output_text', text: ANSWER,
            annotations: [{ type: 'url_citation', url: 'https://bonusetu.com/x', title: 'Bonusetu', start_index: 0, end_index: 5 }] }] }],
        usage: { input_tokens: 1000, output_tokens: 500, total_tokens: 1500 },
      });
      if (req.url.startsWith('/pplx/v1/responses')) return send({
        status: 'completed', model: 'perplexity/sonar',
        output: [{ type: 'search_results' }, { type: 'message', content: [{ type: 'output_text', text: ANSWER, annotations: [{ type: 'url_citation', url: 'https://casino.guru/fi' }] }] }],
        search_results: { results: [{ url: 'https://yle.fi/a', title: 'Yle' }] }, usage: { input_tokens: 800, output_tokens: 300 },
      });
      if (req.url.includes(':generateContent')) return send({
        candidates: [{ content: { role: 'model', parts: [{ text: ANSWER }] }, finishReason: 'STOP',
          groundingMetadata: { webSearchQueries: ['best casino finland'], groundingChunks: [{ web: { uri: 'https://vertexaisearch.cloud.google.com/grounding-api-redirect/abc', title: 'askgamblers.com' } }] } }],
        usageMetadata: { promptTokenCount: 200, candidatesTokenCount: 400 }, modelVersion: 'gemini-flash-latest',
      });
      if (req.url.startsWith('/anthropic/v1/messages')) return send({
        id: 'msg_1', type: 'message', role: 'assistant', model: 'claude-opus-5-5', stop_reason: 'end_turn',
        content: [
          { type: 'server_tool_use', id: 'st1', name: 'web_search', input: { query: 'x' } },
          { type: 'web_search_tool_result', tool_use_id: 'st1', content: [{ type: 'web_search_result', url: 'https://reddit.com/r/x', title: 'Reddit' }] },
          { type: 'text', text: ANSWER, citations: [{ type: 'web_search_result_location', url: 'https://kasinohai.com/', title: 'Kasinohai', cited_text: 'x' }] },
        ],
        usage: { input_tokens: 5000, output_tokens: 600, server_tool_use: { web_search_requests: 2 } },
      });
      res.writeHead(404); res.end('{}');
    });
  });
  await new Promise(r => server.listen(0, r));
  port = server.address().port;
  process.env.OPENAI_BASE_URL = `http://localhost:${port}/openai/v1`;
  process.env.ANTHROPIC_BASE_URL = `http://localhost:${port}/anthropic`;
  process.env.GEMINI_BASE_URL = `http://localhost:${port}`;
  process.env.PERPLEXITY_BASE_URL = `http://localhost:${port}/pplx`;
  process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'ait-test-'));
  // Google's redirect host is answered locally (no real network call in tests).
  const realFetch = globalThis.fetch;
  globalThis.fetch = (url, opts) => String(url).startsWith('https://vertexaisearch.cloud.google.com/')
    ? Promise.resolve(new Response(null, { status: 302, headers: { Location: 'https://www.askgamblers.com/finland' } }))
    : realFetch(url, opts);
});
after(() => server.close());

test('each adapter returns text, citations and usage', async () => {
  const { LIVE_ADAPTERS } = await import('../engines/live.js');
  const o = await LIVE_ADAPTERS.chatgpt({ question: 'q', country: 'FI', apiKey: 'k', model: 'gpt-5-mini' });
  assert.equal(o.text, ANSWER);
  assert.deepEqual(o.citations.map(c => c.url), ['https://bonusetu.com/x']);
  assert.equal(o.usage.searches, 1);
  assert.equal(seen.at(-1).body.tools[0].user_location.country, 'FI');

  const p = await LIVE_ADAPTERS.perplexity({ question: 'q', apiKey: 'k', model: 'perplexity/sonar' });
  assert.equal(p.text, ANSWER);
  assert.deepEqual(p.citations.map(c => c.url).sort(), ['https://casino.guru/fi', 'https://yle.fi/a']);

  const g = await LIVE_ADAPTERS.gemini({ question: 'q', apiKey: 'k', model: 'gemini-flash-latest' });
  assert.equal(g.text, ANSWER);
  assert.equal(g.citations[0].url, 'https://www.askgamblers.com/finland', 'redirect link resolved to the real site');
  assert.ok(seen.find(s => s.url.includes(':generateContent')).body.tools[0].googleSearch);

  const c = await LIVE_ADAPTERS.claude({ question: 'q', country: 'UK', apiKey: 'k', model: 'claude-opus-5-5' });
  assert.equal(c.text, ANSWER);
  assert.deepEqual(c.citations.map(x => x.url), ['https://kasinohai.com/']);
  assert.equal(c.usage.searches, 2);
  const req = seen.find(s => s.url.startsWith('/anthropic')).body;
  assert.equal(req.tools[0].type, 'web_search_20260209');
  assert.equal(req.tools[0].user_location.country, 'GB');
});

test('live run stores real answers with cost, and stops at the spending cap', async () => {
  process.env.NO_SEED = '1';
  const { run, get, setSetting } = await import('../db.js');
  const { startRun } = await import('../runner.js');
  const { addBrand, addPrompt } = await import('../seed/demo.js');
  const pid = Number(run("INSERT INTO projects(name, category, data_mode, engines) VALUES ('T', 'operator', 'live', '[\"chatgpt\",\"claude\",\"gemini\",\"perplexity\"]')").lastInsertRowid);
  addBrand(pid, { name: 'LeoVegas', is_own: true });
  addBrand(pid, { name: 'Betsson' });
  addPrompt(pid, { text: 'Best casino in Finland?', country: 'FI' });
  addPrompt(pid, { text: 'Fastest withdrawals?', country: 'FI' });
  for (const k of ['key_openai', 'key_anthropic', 'key_gemini', 'key_perplexity']) setSetting(k, 'test-key');

  const waitFor = async id => { for (let i = 0; i < 100; i++) { const r = get('SELECT * FROM runs WHERE id = ?', id); if (r.status !== 'running') return r; await new Promise(x => setTimeout(x, 50)); } };

  setSetting('monthly_cap', 0);
  let r = await waitFor(startRun(pid).runId);
  assert.equal(r.done, 0, 'no cap = nothing runs');
  assert.match(r.message, /no monthly spending cap/);

  setSetting('monthly_cap', 100);
  r = await waitFor(startRun(pid).runId);
  assert.equal(r.done, 8);
  assert.ok(r.cost > 0);
  const a = get('SELECT COUNT(*) n, SUM(simulated) s FROM answers WHERE project_id = ? AND error IS NULL', pid);
  assert.equal(a.n, 8); assert.equal(a.s, 0, 'real answers are never marked simulated');
  assert.ok(get('SELECT COUNT(*) n FROM mentions WHERE project_id = ?', pid).n >= 16);

  setSetting('monthly_cap', r.cost + 0.01);
  r = await waitFor(startRun(pid).runId);
  assert.ok(r.done < 8, 'stops before the cap');
  assert.match(r.message, /cap/);
});
