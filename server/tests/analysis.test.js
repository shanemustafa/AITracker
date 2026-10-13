import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyzeAnswer, classifySource, toneOf } from '../analysis.js';

const brands = [
  { id: 1, name: 'LeoVegas', aliases: ['Leo Vegas'], is_own: 1, domain: 'leovegas.com' },
  { id: 2, name: 'Betsson', aliases: [], is_own: 0, domain: 'betsson.com' },
  { id: 3, name: 'Relax Gaming', aliases: ['Relax'], is_own: 0, domain: 'relax-gaming.com' },
  { id: 4, name: "Play'n GO", aliases: [], is_own: 0, domain: 'playngo.com' },
];

test('finds brands, ranks them by first appearance, counts unknown brands', () => {
  const text = 'Top picks:\n1. **Betsson** is trusted and fast.\n2. **Veikkaus** is the state operator.\n3. **LeoVegas** has some complaints about slow withdrawals.';
  const r = analyzeAnswer(text, brands);
  const byId = Object.fromEntries(r.mentions.map(m => [m.brand_id, m]));
  assert.equal(byId[2].position, 1);
  assert.equal(byId[1].position, 3);
  assert.ok(r.others.includes('Veikkaus'));
  assert.ok(byId[2].sentiment > 50, 'Betsson positive');
  assert.ok(byId[1].sentiment < 50, 'LeoVegas negative');
});

test('whole words only and case rules for common-word aliases', () => {
  const r = analyzeAnswer('Players can relax and enjoy games. Relaxing evenings.', brands);
  assert.equal(r.mentions.length, 0);
  const r2 = analyzeAnswer('Relax offers great slots, and Play’n GO too.', brands);
  assert.deepEqual(r2.mentions.map(m => m.brand_id).sort(), [3, 4]);
});

test('aliases count for the brand', () => {
  const r = analyzeAnswer('Leo Vegas is popular.', brands);
  assert.equal(r.mentions[0].brand_id, 1);
});

test('tone scale', () => {
  assert.equal(toneOf('It offers casino games.'), 50);
  assert.ok(toneOf('A trusted and reliable brand.') > 60);
  assert.ok(toneOf('Many complaints and delays.') < 40);
});

test('source types', () => {
  assert.equal(classifySource('leovegas.com', brands), 'own');
  assert.equal(classifySource('betsson.com', brands), 'competitor');
  assert.equal(classifySource('askgamblers.com', brands), 'review');
  assert.equal(classifySource('en.wikipedia.org', brands), 'reference');
  assert.equal(classifySource('poliisi.fi', brands), 'official');
  assert.equal(classifySource('reddit.com', brands), 'forum');
  assert.equal(classifySource('yle.fi', brands), 'news');
  assert.equal(classifySource('veikkaus.fi', brands), 'brand');
});
