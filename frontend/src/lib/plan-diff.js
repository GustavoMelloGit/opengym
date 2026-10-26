// How a finished session differs from the routine it was started from, and the routine you
// get by adopting what was actually done. Three things count as a difference: an exercise
// added on the day, a planned exercise done for a different number of sets, and a planned
// exercise removed from the session with its trash button. A planned exercise merely left
// untouched is NOT a removal — skipping one on a busy day says nothing about the plan, and
// offering to delete it every time would be the wrong lesson to learn. Taking it out of the
// session on purpose does.
import { cleanupSg } from './history.js'

const doneCount = e => (e.sets || []).filter(s => s.done).length

// Pair every performed entry with a planned exercise of the same id, first unused one first,
// so a plan that lists the same exercise twice matches each occurrence on its own. `removed`
// (ids of planned exercises taken out of the session) then claims the planned slots nothing
// performed matched — an exercise removed and later added back is done, not dropped.
function match(ex, entries, removed) {
  const used = new Set()
  const take = id => {
    const i = ex.findIndex((p, k) => !used.has(k) && p.id === id)
    if (i >= 0) used.add(i)
    return i
  }
  const done = entries
    .filter(e => doneCount(e) > 0)
    .map(e => ({ entry: e, planIdx: take(e.id), sets: doneCount(e) }))
  const dropped = (removed || []).map(take).filter(i => i >= 0)
  return { done, dropped }
}

// { changed: [{ id, from, to }], added: [{ id, sets }], removed: [{ id }] } — all empty means
// the plan was followed.
export function planDiff(routine, entries, removed) {
  const out = { changed: [], added: [], removed: [] }
  if (!routine) return out
  const ex = routine.ex || []
  const { done, dropped } = match(ex, entries || [], removed)
  dropped.forEach(i => out.removed.push({ id: ex[i].id }))
  done.forEach(m => {
    if (m.planIdx < 0) out.added.push({ id: m.entry.id, sets: m.sets })
    else {
      const from = Math.max(1, ex[m.planIdx].sets || 1)
      if (from !== m.sets) out.changed.push({ id: m.entry.id, from, to: m.sets })
    }
  })
  return out
}

export const followedPlan = d => !d.changed.length && !d.added.length && !(d.removed || []).length

// The routine's exercise list rewritten to match the session: done set counts replace the
// planned ones, added exercises go on the end with the config they were added with, removed
// ones are dropped, and everything else (skipped exercises included) stays exactly as it was.
export function adoptSession(ex, entries, removed) {
  const next = ex.map(p => ({ ...p }))
  const { done, dropped } = match(ex, entries || [], removed)
  done.forEach(m => {
    if (m.planIdx >= 0) next[m.planIdx].sets = m.sets
    else {
      const { sg, ...cfg } = m.entry.target || {}
      next.push({ ...cfg, id: m.entry.id, sets: m.sets })
    }
  })
  const out = next.filter((_, i) => !dropped.includes(i))
  cleanupSg(out)
  return out
}
