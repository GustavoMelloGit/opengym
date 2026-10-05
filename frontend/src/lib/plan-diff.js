// How a finished session differs from the routine it was started from, and the routine you
// get by adopting what was actually done. Only two things count as a difference: an exercise
// added on the day, and a planned exercise done for a different number of sets. A planned
// exercise left untouched is NOT a removal — skipping one on a busy day says nothing about
// the plan, and offering to delete it every time would be the wrong lesson to learn.
import { cleanupSg } from './history.js'

const doneCount = e => (e.sets || []).filter(s => s.done).length

// Pair every performed entry with a planned exercise of the same id, first unused one first,
// so a plan that lists the same exercise twice matches each occurrence on its own.
function match(ex, entries) {
  const used = new Set()
  return entries
    .filter(e => doneCount(e) > 0)
    .map(e => {
      const i = ex.findIndex((p, k) => !used.has(k) && p.id === e.id)
      if (i >= 0) used.add(i)
      return { entry: e, planIdx: i, sets: doneCount(e) }
    })
}

// { changed: [{ id, from, to }], added: [{ id, sets }] } — both empty means the plan was followed.
export function planDiff(routine, entries) {
  const out = { changed: [], added: [] }
  if (!routine) return out
  const ex = routine.ex || []
  match(ex, entries || []).forEach(m => {
    if (m.planIdx < 0) out.added.push({ id: m.entry.id, sets: m.sets })
    else {
      const from = Math.max(1, ex[m.planIdx].sets || 1)
      if (from !== m.sets) out.changed.push({ id: m.entry.id, from, to: m.sets })
    }
  })
  return out
}

export const followedPlan = d => !d.changed.length && !d.added.length

// The routine's exercise list rewritten to match the session: done set counts replace the
// planned ones, added exercises go on the end with the config they were added with, and
// everything else (skipped exercises included) stays exactly as it was.
export function adoptSession(ex, entries) {
  const next = ex.map(p => ({ ...p }))
  match(ex, entries || []).forEach(m => {
    if (m.planIdx >= 0) next[m.planIdx].sets = m.sets
    else {
      const { sg, ...cfg } = m.entry.target || {}
      next.push({ ...cfg, id: m.entry.id, sets: m.sets })
    }
  })
  cleanupSg(next)
  return next
}
