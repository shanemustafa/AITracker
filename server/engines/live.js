// Real AI engines. Official APIs only — no browser automation, no scraping of consumer websites.
// Each function returns { text, citations: [{url, title}], model, usage: {inTokens, outTokens, searches} }.
import OpenAI from 'openai';
import { GoogleGenAI } from '@google/genai';
import Anthropic from '@anthropic-ai/sdk';

const COUNTRY_CODE = { FI: 'FI', SE: 'SE', UK: 'GB', DE: 'DE' };
const TIMEOUT_MS = 120_000;

function dedupe(citations) {
  const seen = new Set();
  return citations.filter(c => c.url && !seen.has(c.url) && seen.add(c.url));
}

// ---------- ChatGPT (OpenAI Responses API + web search) ----------
async function askOpenAI({ question, country, apiKey, model }) {
  const client = new OpenAI({ apiKey, timeout: TIMEOUT_MS, maxRetries: 2 });
  const loc = COUNTRY_CODE[country] ? { type: 'approximate', country: COUNTRY_CODE[country] } : { type: 'approximate' };
  const r = await client.responses.create({
    model, input: question,
    tools: [{ type: 'web_search', user_location: loc }],
    include: ['web_search_call.action.sources'],
  });
  const citations = [];
  let searches = 0;
  for (const item of r.output || []) {
    if (item.type === 'web_search_call') searches++;
    if (item.type === 'message') {
      for (const c of item.content || []) {
        for (const a of c.annotations || []) if (a.type === 'url_citation') citations.push({ url: a.url, title: a.title });
      }
    }
  }
  return {
    text: r.output_text || '', citations: dedupe(citations), model: r.model || model,
    usage: { inTokens: r.usage?.input_tokens, outTokens: r.usage?.output_tokens, searches },
  };
}

// ---------- Gemini (Gemini API + Grounding with Google Search) ----------
// Google returns short redirect links; we follow one hop to learn the real website address.
// Only Google's own redirect host is ever contacted (never an address taken from answer text),
// so a crafted link cannot make the server call internal or third-party addresses.
const REDIRECT_HOST = 'vertexaisearch.cloud.google.com';
export function isGoogleRedirect(uri) {
  try { const u = new URL(uri); return u.protocol === 'https:' && u.hostname === REDIRECT_HOST && !u.port && !u.username; } catch { return false; }
}
async function resolveRedirect(uri) {
  if (!isGoogleRedirect(uri)) return uri;
  try {
    const res = await fetch(uri, { method: 'HEAD', redirect: 'manual', signal: AbortSignal.timeout(8000) });
    const loc = res.headers.get('location');
    try { return loc && ['http:', 'https:'].includes(new URL(loc).protocol) ? loc : uri; } catch { return uri; }
  } catch { return uri; }
}
async function askGemini({ question, apiKey, model }) {
  const ai = new GoogleGenAI({ apiKey, ...(process.env.GEMINI_BASE_URL ? { httpOptions: { baseUrl: process.env.GEMINI_BASE_URL } } : {}) });
  const r = await ai.models.generateContent({
    model, contents: question, config: { tools: [{ googleSearch: {} }] },
  });
  const gm = r.candidates?.[0]?.groundingMetadata || {};
  const chunks = (gm.groundingChunks || []).map(c => c.web).filter(Boolean);
  const citations = await Promise.all(chunks.map(async w => {
    let url = w.uri;
    if (url && isGoogleRedirect(url)) {
      const real = await resolveRedirect(url);
      const fromTitle = /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(w.title || '') ? `https://${w.title}/` : url;
      url = real !== url ? real : fromTitle;
    }
    return { url, title: w.title };
  }));
  return {
    text: r.text || '', citations: dedupe(citations), model: r.modelVersion || model,
    usage: { inTokens: r.usageMetadata?.promptTokenCount, outTokens: r.usageMetadata?.candidatesTokenCount, searches: (gm.webSearchQueries || []).length || 1 },
  };
}

// ---------- Perplexity (official Agent API, OpenAI-compatible "responses" shape) ----------
async function askPerplexity({ question, apiKey, model }) {
  const res = await fetch(`${process.env.PERPLEXITY_BASE_URL || 'https://api.perplexity.ai'}/v1/responses`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, input: question, tools: [{ type: 'web_search' }] }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(`Perplexity said ${res.status}: ${String(body?.error?.message || 'request failed').slice(0, 300)}`), { status: res.status >= 500 ? 502 : 400, expose: true });
  if (body.status && !['completed', 'incomplete'].includes(body.status)) throw new Error(`Perplexity run ${body.status}`);
  let text = body.output_text || '';
  const citations = [];
  let searches = 0;
  for (const item of body.output || []) {
    if (/search/.test(item.type || '')) searches++;
    if (item.type === 'message') {
      for (const c of item.content || []) {
        if (!body.output_text && c.text) text += c.text;
        for (const a of c.annotations || []) if (a.url) citations.push({ url: a.url, title: a.title });
      }
    }
  }
  const sr = Array.isArray(body.search_results) ? body.search_results : body.search_results?.results || [];
  for (const s of sr) citations.push({ url: s.url, title: s.title });
  for (const u of body.citations || []) citations.push({ url: typeof u === 'string' ? u : u.url });
  return {
    text, citations: dedupe(citations), model: body.model || model,
    usage: { inTokens: body.usage?.input_tokens, outTokens: body.usage?.output_tokens, searches: searches || 1 },
  };
}

// ---------- Claude (Anthropic Messages API + web search tool) ----------
async function askClaude({ question, country, apiKey, model }) {
  const client = new Anthropic({ apiKey, timeout: TIMEOUT_MS * 3, maxRetries: 2 });
  const tool = { type: 'web_search_20260209', name: 'web_search', max_uses: 5 };
  if (COUNTRY_CODE[country]) tool.user_location = { type: 'approximate', country: COUNTRY_CODE[country] };
  const messages = [{ role: 'user', content: question }];
  const supportsFallbacks = /^claude-(opus-5|fable-5-1|sonnet-5-5)/.test(model);
  let r, inTokens = 0, outTokens = 0, searches = 0;
  for (let i = 0; i < 4; i++) {
    r = await client.beta.messages.create({
      model, max_tokens: 16000, messages, tools: [tool],
      output_config: { effort: 'low' },
      ...(supportsFallbacks ? { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' } : {}),
    });
    inTokens += r.usage?.input_tokens || 0;
    outTokens += r.usage?.output_tokens || 0;
    searches += r.usage?.server_tool_use?.web_search_requests || 0;
    if (r.stop_reason !== 'pause_turn') break;
    messages.push({ role: 'assistant', content: r.content }); // long searches can pause; continue them
  }
  if (r.stop_reason === 'refusal') throw new Error('Claude declined to answer this question (safety filter).');
  const cited = [], retrieved = [];
  let text = '';
  for (const block of r.content) {
    if (block.type === 'text') {
      text += block.text;
      for (const c of block.citations || []) if (c.url) cited.push({ url: c.url, title: c.title });
    }
    if (block.type === 'web_search_tool_result' && Array.isArray(block.content)) {
      for (const s of block.content) if (s.url) retrieved.push({ url: s.url, title: s.title });
    }
  }
  return {
    text, citations: dedupe(cited.length ? cited : retrieved), model: r.model || model,
    usage: { inTokens, outTokens, searches },
  };
}

export const LIVE_ADAPTERS = { chatgpt: askOpenAI, gemini: askGemini, perplexity: askPerplexity, claude: askClaude };
