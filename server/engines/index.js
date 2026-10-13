// Which AI engines we support, how, and honest reasons for the ones we don't.
// Prices are list-price ESTIMATES (USD) checked Oct 2026 and editable in Settings. The provider's bill is the truth.
export const ENGINES = {
  chatgpt: {
    id: 'chatgpt', label: 'ChatGPT', supported: true, color: '#10a37f',
    via: 'OpenAI API (Responses API) with the web search tool',
    keySetting: 'key_openai', modelSetting: 'model_openai', defaultModel: 'gpt-5-mini',
    caveat: 'Same company and model family as ChatGPT, but not the exact ChatGPT app: the app adds its own instructions, memory and personalisation.',
    price: { inPerM: 0.25, outPerM: 2.0, perSearch: 0.01, typicalIn: 3000, typicalOut: 900, typicalSearches: 1 },
  },
  gemini: {
    id: 'gemini', label: 'Gemini', supported: true, color: '#4285f4',
    via: 'Gemini API with "Grounding with Google Search"',
    keySetting: 'key_gemini', modelSetting: 'model_gemini', defaultModel: 'gemini-flash-latest',
    caveat: 'Same model family as the Gemini app, grounded with Google Search. It is NOT Google AI Mode or AI Overviews.',
    price: { inPerM: 0.30, outPerM: 2.5, perSearch: 0.014, typicalIn: 1500, typicalOut: 900, typicalSearches: 1.5 },
  },
  perplexity: {
    id: 'perplexity', label: 'Perplexity', supported: true, color: '#20808d',
    via: 'Perplexity Agent API (official) with web search',
    keySetting: 'key_perplexity', modelSetting: 'model_perplexity', defaultModel: 'perplexity/sonar',
    caveat: 'Uses Perplexity\'s own Sonar model and search through their paid API, which their terms allow (their terms ban scraping the website).',
    price: { inPerM: 1.0, outPerM: 1.0, perSearch: 0.005, typicalIn: 2000, typicalOut: 800, typicalSearches: 1 },
  },
  claude: {
    id: 'claude', label: 'Claude', supported: true, color: '#d97757',
    via: 'Anthropic API (Messages API) with the web search tool',
    keySetting: 'key_anthropic', modelSetting: 'model_anthropic', defaultModel: 'claude-opus-5-5',
    caveat: 'Same models as the Claude app, but without the app\'s own instructions and personalisation.',
    price: { inPerM: 4.0, outPerM: 20.0, perSearch: 0.01, typicalIn: 8000, typicalOut: 900, typicalSearches: 2 },
  },
  copilot: {
    id: 'copilot', label: 'Microsoft Copilot', supported: false, color: '#7f5af0',
    reason: 'Microsoft offers no public API that returns Copilot\'s answers. The Bing Search API was retired in August 2025. Azure\'s "Grounding with Bing" would give a different model\'s answer, so labelling it "Copilot" would be fake.',
  },
  google_ai_mode: {
    id: 'google_ai_mode', label: 'Google AI Mode', supported: false, color: '#ea4335',
    reason: 'Google has no public API for AI Mode. The only way to read it is to scrape Google Search (directly or through a "SERP API" company that scrapes for you). That breaks Google\'s terms, so we leave it out.',
  },
  google_ai_overviews: {
    id: 'google_ai_overviews', label: 'Google AI Overviews', supported: false, color: '#fbbc05',
    reason: 'Same as AI Mode: no official API. Search Console shows some AI traffic for your own site, but not the answers. Left out rather than scraped.',
  },
};

export const SUPPORTED_ENGINES = Object.values(ENGINES).filter(e => e.supported).map(e => e.id);

export function estimateAnswerCost(engineId, prices) {
  const p = { ...ENGINES[engineId].price, ...(prices?.[engineId] || {}) };
  return (p.typicalIn * p.inPerM + p.typicalOut * p.outPerM) / 1e6 + p.typicalSearches * p.perSearch;
}

export function actualCost(engineId, usage, prices) {
  const p = { ...ENGINES[engineId].price, ...(prices?.[engineId] || {}) };
  if (!usage) return estimateAnswerCost(engineId, prices);
  const tokens = ((usage.inTokens || 0) * p.inPerM + (usage.outTokens || 0) * p.outPerM) / 1e6;
  const searches = (usage.searches ?? p.typicalSearches) * p.perSearch;
  return tokens + searches;
}
