// Forgiving exercise search. Typing the name almost right should be enough: accents and
// punctuation don't matter ("elevacao" finds "elevação", "pull-up" finds "pull up"), words can
// come in any order ("press bench"), a word can be cut short ("benc pre"), split or glued
// differently ("pull down" / "pulldown") or carry a typo or two ("bicpes", "tricep").
// Results come back best match first.

export const normalize = s => String(s || '')
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase()
  .replace(/[^a-z0-9\u0080-￿]+/g, ' ')
  .trim()

const words = s => normalize(s).split(' ').filter(Boolean)

// Optimal string alignment distance: Levenshtein plus swapping two neighbours ("tirceps").
function dist(a, b) {
  const m = a.length, n = b.length
  let pp = null, p = Array.from({ length: n + 1 }, (_, j) => j)
  for (let i = 1; i <= m; i++) {
    const c = [i]
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      c[j] = Math.min(p[j] + 1, c[j - 1] + 1, p[j - 1] + cost)
      if (pp && i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) c[j] = Math.min(c[j], pp[j - 2] + 1)
    }
    pp = p; p = c
  }
  return p[n]
}

// Typos allowed for a query word of this length. Short words have to be typed right — one
// wrong letter in "row" matches half the library.
const allowed = len => len >= 8 ? 2 : len >= 4 ? 1 : 0

// How well one query word matches one word of the exercise; 0 is no match.
function wordScore(q, w) {
  if (w === q) return 4
  if (w.startsWith(q)) return 3
  if (q.length >= 3 && w.includes(q)) return 2
  const k = allowed(q.length)
  if (!k) return 0
  // Against the whole word ("bicpes" → "biceps") and, from five letters, against its start,
  // so a half-typed word with a typo still counts ("bicpe" → "biceps"). Shorter than that the
  // start of almost any word is one letter away ("lats" → "late…ral").
  if (Math.abs(w.length - q.length) > k && q.length < 5) return 0
  let d = dist(q, w)
  if (q.length >= 5) for (let L = q.length - 1; L <= q.length + 1 && d > 0; L++) if (L < w.length) d = Math.min(d, dist(q, w.slice(0, L)))
  return d <= k ? 1.5 - d * 0.25 : 0
}

// The library repeats the same few thousand words over and over ("com", "barra", "dumbbell"),
// so within one search each word is scored once.
const scorer = q => {
  const seen = new Map()
  return list => {
    let m = 0
    for (const w of list) {
      let v = seen.get(w)
      if (v === undefined) seen.set(w, v = wordScore(q, w))
      if (v > m) m = v
    }
    return m
  }
}

// Normalising 1300 exercises on every keystroke is most of the cost, so each item's index is
// kept until its fields change (a language switch, a renamed custom exercise).
const cache = new WeakMap()
function indexOf(item, fields) {
  const f = fields(item)
  const key = [...f.names, '|', ...(f.tags || []), '|', f.text || ''].join('\u0001')
  const hit = cache.get(item)
  if (hit && hit.key === key) return hit
  const names = f.names.map(normalize)
  const idx = {
    key, names,
    compact: names.map(n => n.replace(/ /g, '')),
    nameWords: [...new Set(names.flatMap(n => n.split(' ').filter(Boolean)))],
    tagWords: [...new Set((f.tags || []).flatMap(words))],
    text: normalize(f.text),
    len: names[names.length - 1].split(' ').length   // the name shown, the last one given
  }
  cache.set(item, idx)
  return idx
}

// fields(item) → { names: [...], tags: [...], text: '' }: names weigh most (an exercise's
// name in English and in the app language, the one shown last), tags less (body part, target, equipment), and
// free text (a custom exercise's description) only on a plain substring hit.
//
// Every query word has to match. When nothing matches them all, the items matching the most
// of them come back instead: "puxada frente" still lists the pulldowns, whose names say
// "frontal", rather than an empty screen.
export function fuzzySearch(list, query, fields) {
  const qw = words(query)
  if (!qw.length) return list
  const qn = qw.join(' ')
  const qc = qw.join('')
  const best = qw.map(scorer)
  const scored = []
  list.forEach((item, i) => {
    const x = indexOf(item, fields)
    let score = 0, hits = 0
    for (let k = 0; k < qw.length; k++) {
      const q = qw[k]
      const s = Math.max(best[k](x.nameWords), best[k](x.tagWords) * 0.6, q.length >= 3 && x.text.includes(q) ? 0.3 : 0)
      if (s) { hits++; score += s }
    }
    // Words split or glued differently: "pull down" for "pulldown", "pushup" for "push up".
    if (hits < qw.length && qc.length >= 4 && x.compact.some(n => n.includes(qc))) { hits = qw.length; score = 2.5 * qw.length }
    if (!hits) return
    // The whole name typed out, give or take a typo ("tricep corda" for "tríceps corda").
    if (x.names.some(n => n === qn || (Math.abs(n.length - qn.length) <= allowed(qn.length) && dist(qn, n) <= allowed(qn.length)))) score += 3
    else if (x.names.some(n => n.startsWith(qn))) score += 2
    else if (x.names.some(n => n.includes(qn))) score += 1
    // Among equal matches the shorter name is usually the plain version of the exercise.
    scored.push({ item, hits, score: score - x.len * 0.05, i })
  })
  const most = scored.reduce((m, x) => Math.max(m, x.hits), 0)
  return scored
    .filter(x => x.hits === most)
    .sort((a, b) => b.score - a.score || a.i - b.i)
    .map(x => x.item)
}
