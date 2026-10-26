// How a finished session strayed from the routines it was built from, and those routines
// rewritten to match it. Asked as soon as the workout is finished (sheets.jsx PlanUpdate), one
// group per routine, since a combined day can draw on two.
//
// Three things count as a difference:
// - an exercise added during the session (`addedInSession`, the workout's Add exercise) and done,
//   which goes on the end of its routine the way routineAdditions copies it;
// - a planned exercise done for a different number of work sets than the session prescribed;
// - a planned exercise taken out of the session on purpose (the workout's Remove exercise, noted
//   in `active.removed`), which leaves its routine.
// A planned exercise merely left untouched is NOT a removal: skipping one on a busy day says
// nothing about the plan, and offering to delete it every time would be the wrong lesson to
// learn. A swap keeps its slot and is neither an addition nor a removal.
//
// Set counts are compared with what the session prescribed (`target.sets`, or triple
// progression's per-set aims), not with the routine: a set the progression added is the plan
// working, not a change to it. Adopting a difference moves the routine's own count by the same
// amount, so a routine of 3 sets that progression took to 4 for the day, done for 5, becomes 4.
import { setsFromRows, cleanupSg } from './history.js'
import { isWarmupRow, hasCompletedWork } from './workout-model.js'
import { routineAdditions, addToRoutine } from './session-routines.js'

const entriesOf = active => (Array.isArray(active?.entries) ? active.entries : [])
const doneWorkSets = entry => {
  const work = (entry.sets || []).filter(row => !isWarmupRow(row) && hasCompletedWork(row))
  return setsFromRows(entry.target || {}, work.length)
}
const prescribedSets = (entry, slot) => {
  const aims = entry.target?.rowReps
  if (Array.isArray(aims) && aims.length) return aims.length
  return Math.max(1, Number(entry.target?.sets) || Number(slot?.sets) || 1)
}

// Each entry still in the session claims the routine slot of the same exercise, first unused one
// first, so a routine that lists an exercise twice matches each occurrence on its own. A removed
// exercise then claims a slot nothing left in the session claimed: removed and added back again
// is done, not dropped.
function slotsFor(routine, active) {
  const used = new Set()
  const take = id => {
    const k = routine.ex.findIndex((x, i) => !used.has(i) && x?.id === id)
    if (k >= 0) used.add(k)
    return k
  }
  const matched = entriesOf(active)
    .filter(e => e?.rid === routine.id && e.addedInSession !== true)
    .map(entry => ({ entry, slot: take(entry.id) }))
    .filter(m => m.slot >= 0)
  // The same exercise added back by hand and done holds on to its slot as well.
  entriesOf(active)
    .filter(e => e?.rid === routine.id && e.addedInSession === true && doneWorkSets(e) > 0)
    .forEach(e => take(e.id))
  const removed = (Array.isArray(active?.removed) ? active.removed : [])
    .filter(r => r?.rid === routine.id)
    .map(r => take(r.id))
    .filter(k => k >= 0)
  return { matched, removed }
}

/**
 * [{ routineId, name, changed: [{ id, slot, from, to }], removed: [{ id, slot }], added: [cfg] }],
 * one per routine that differs; an empty list means the session followed its plan.
 */
export function planChanges(active, routines = []) {
  const list = Array.isArray(routines) ? routines : []
  const additions = new Map(routineAdditions(active, list).map(a => [a.routineId, a.ex]))
  const rids = new Set([
    ...entriesOf(active).map(e => e?.rid),
    ...(Array.isArray(active?.removed) ? active.removed : []).map(r => r?.rid),
  ].filter(Boolean))
  const out = []
  for (const rid of rids) {
    const routine = list.find(r => r?.id === rid)
    if (!routine || !Array.isArray(routine.ex)) continue
    const { matched, removed } = slotsFor(routine, active)
    const changed = []
    for (const { entry, slot } of matched) {
      const done = doneWorkSets(entry)
      if (!done) continue   // skipped: says nothing about the plan
      const from = Math.max(1, Number(routine.ex[slot].sets) || 1)
      const to = Math.max(1, from + done - prescribedSets(entry, routine.ex[slot]))
      if (to !== from) changed.push({ id: entry.id, slot, from, to })
    }
    const added = additions.get(rid) || []
    const gone = removed.map(slot => ({ id: routine.ex[slot].id, slot }))
    if (changed.length || gone.length || added.length) {
      out.push({ routineId: rid, name: routine.name, changed, removed: gone, added })
    }
  }
  return out
}

/**
 * Rewrite one routine (a store draft) to match its group from planChanges. A slot is only
 * touched while it still holds the exercise it was matched with, so a routine edited elsewhere in
 * the meantime is left alone where it no longer lines up. Returns whether anything changed.
 */
export function applyPlanChange(routine, change) {
  if (!routine || !Array.isArray(routine.ex) || !change) return false
  let n = 0
  for (const c of change.changed || []) {
    const slot = routine.ex[c.slot]
    if (slot?.id === c.id && slot.sets !== c.to) { slot.sets = c.to; n++ }
  }
  const drop = new Set((change.removed || []).filter(r => routine.ex[r.slot]?.id === r.id).map(r => r.slot))
  if (drop.size) { routine.ex = routine.ex.filter((_, i) => !drop.has(i)); n += drop.size }
  n += addToRoutine(routine, change.added || [])
  cleanupSg(routine.ex)
  return n > 0
}
