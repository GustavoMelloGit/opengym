import { describe, it, expect } from 'vitest'
import { planChanges, applyPlanChange } from './plan-changes.js'

const done = n => Array.from({ length: n }, () => ({ w: 50, r: 10, done: true }))
const open = n => Array.from({ length: n }, () => ({ w: 50, r: 10, done: false }))
const warm = { w: 20, r: 10, done: true, warmup: true }
const planned = (id, sets, target = {}) => ({ id, rid: 'r1', target: { sets: 3, reps: 10, ...target }, sets })
const added = (id, sets) => ({ id, rid: 'r1', addedInSession: true, target: { sets: 3, reps: 12, weight: 20, mode: 'reps' }, sets })
const routine = ex => ({ id: 'r1', name: 'Push', ex })
const R = () => routine([{ id: 'a', sets: 3, reps: 10 }, { id: 'b', sets: 3, reps: 8 }])
const session = (entries, removed) => ({ entries, ...(removed ? { removed } : {}) })

describe('planChanges', () => {
  it('reads a session that did what it prescribed as following the plan', () => {
    expect(planChanges(session([planned('a', done(3)), planned('b', done(3))]), [R()])).toEqual([])
  })

  it('never counts a skipped exercise, untouched or never ticked, as a change', () => {
    expect(planChanges(session([planned('a', done(3))]), [R()])).toEqual([])
    expect(planChanges(session([planned('a', done(3)), planned('b', open(3))]), [R()])).toEqual([])
  })

  it('counts the work sets done, not the rows on screen or the warm-ups', () => {
    const [c] = planChanges(session([planned('a', [warm, ...done(2), ...open(1)]), planned('b', done(4))]), [R()])
    expect(c.changed).toEqual([{ id: 'a', slot: 0, from: 3, to: 2 }, { id: 'b', slot: 1, from: 3, to: 4 }])
    expect(c).toMatchObject({ routineId: 'r1', name: 'Push', removed: [], added: [] })
  })

  it('holds the sets against the day’s prescription, so a set progression added is not a change', () => {
    // The routine says 3, triple progression asked for 4 today.
    expect(planChanges(session([planned('a', done(4), { sets: 4 })]), [R()])).toEqual([])
    // Done for 5 of those 4: one more than prescribed, so the routine's 3 becomes 4.
    expect(planChanges(session([planned('a', done(5), { sets: 4 })]), [R()])[0].changed).toEqual([{ id: 'a', slot: 0, from: 3, to: 4 }])
    // Per-set aims are the prescription when the session carries them.
    expect(planChanges(session([planned('a', done(4), { sets: 3, rowReps: [12, 12, 12, 9] })]), [R()])).toEqual([])
  })

  it('reports a planned exercise removed from the session', () => {
    const [c] = planChanges(session([planned('a', done(3))], [{ rid: 'r1', id: 'b' }]), [R()])
    expect(c.removed).toEqual([{ id: 'b', slot: 1 }])
  })

  it('does not drop an exercise removed and then added back and done', () => {
    expect(planChanges(session([planned('a', done(3)), added('b', done(3))], [{ rid: 'r1', id: 'b' }]), [R()])).toEqual([])
  })

  it('removes one occurrence of an exercise the routine lists twice', () => {
    const twice = routine([{ id: 'a', sets: 3 }, { id: 'a', sets: 2 }])
    const [c] = planChanges(session([planned('a', done(3))], [{ rid: 'r1', id: 'a' }]), [twice])
    expect(c.removed).toEqual([{ id: 'a', slot: 1 }])
  })

  it('offers an exercise added and done, with the setup it was done with', () => {
    const [c] = planChanges(session([planned('a', done(3)), planned('b', done(3)), added('c', done(2))]), [R()])
    expect(c.added).toEqual([expect.objectContaining({ id: 'c', sets: 2, reps: 10, weight: 50 })])
    expect(planChanges(session([planned('a', done(3)), added('c', open(2))]), [R()])).toEqual([])
  })

  it('leaves out a swapped exercise, a freestyle session and a deleted routine', () => {
    expect(planChanges(session([planned('a', done(3)), planned('z', done(5))]), [R()])).toEqual([])
    expect(planChanges(session([{ id: 'a', target: { sets: 3 }, sets: done(5) }]), [R()])).toEqual([])
    expect(planChanges(session([planned('a', done(5))]), [])).toEqual([])
  })

  it('groups by routine in a combined session', () => {
    const r2 = { id: 'r2', name: 'Legs', ex: [{ id: 'q', sets: 3 }] }
    const out = planChanges(session([planned('a', done(4)), { ...planned('q', done(3)), rid: 'r2' }], [{ rid: 'r2', id: 'q' }]), [R(), r2])
    expect(out.map(c => c.name)).toEqual(['Push'])
    const both = planChanges(session([planned('a', done(4)), { ...planned('q', done(2)), rid: 'r2' }]), [R(), r2])
    expect(both.map(c => [c.name, c.changed.map(x => x.to)])).toEqual([['Push', [4]], ['Legs', [2]]])
  })
})

describe('applyPlanChange', () => {
  it('takes the set counts, drops what was removed and appends what was added, leaving the rest as planned', () => {
    const r = routine([{ id: 'a', sets: 3, reps: 10, weight: 40 }, { id: 'b', sets: 3 }, { id: 'c', sets: 2 }])
    const [c] = planChanges(session([planned('a', done(4)), planned('c', open(2)), added('d', done(2))], [{ rid: 'r1', id: 'b' }]), [r])
    expect(applyPlanChange(r, c)).toBe(true)
    expect(r.ex.map(x => [x.id, x.sets])).toEqual([['a', 4], ['c', 2], ['d', 2]])
    expect(r.ex[0]).toMatchObject({ reps: 10, weight: 40 })
  })

  it('unlinks the superset partner of a removed exercise', () => {
    const r = routine([{ id: 'a', sets: 3, sg: 'x' }, { id: 'b', sets: 3, sg: 'x' }])
    const [c] = planChanges(session([planned('a', done(3))], [{ rid: 'r1', id: 'b' }]), [r])
    applyPlanChange(r, c)
    expect(r.ex).toEqual([{ id: 'a', sets: 3 }])
  })

  it('leaves a slot alone once it no longer holds the exercise it was matched with', () => {
    const r = R()
    const [c] = planChanges(session([planned('a', done(5))], [{ rid: 'r1', id: 'b' }]), [r])
    r.ex = [{ id: 'z', sets: 3 }, { id: 'y', sets: 3 }]   // edited elsewhere meanwhile
    expect(applyPlanChange(r, c)).toBe(false)
    expect(r.ex).toEqual([{ id: 'z', sets: 3 }, { id: 'y', sets: 3 }])
  })
})
