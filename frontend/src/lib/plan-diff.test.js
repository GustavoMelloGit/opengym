import { describe, it, expect } from 'vitest'
import { planDiff, followedPlan, adoptSession } from './plan-diff.js'

const done = n => Array.from({ length: n }, () => ({ w: 50, r: 10, done: true }))
const open = n => Array.from({ length: n }, () => ({ w: 50, r: 10, done: false }))
const entry = (id, sets, target = { sets: 3, reps: 10, weight: 0 }) => ({ id, sets, target })
const routine = ex => ({ id: 'r1', name: 'Push', ex })

describe('planDiff', () => {
  const R = routine([{ id: 'a', sets: 3, reps: 10 }, { id: 'b', sets: 4, reps: 8 }])

  it('reads a session that did exactly the plan as followed', () => {
    const d = planDiff(R, [entry('a', done(3)), entry('b', done(4))])
    expect(followedPlan(d)).toBe(true)
  })

  it('does not count a skipped exercise as removed', () => {
    expect(followedPlan(planDiff(R, [entry('a', done(3))]))).toBe(true)
    expect(followedPlan(planDiff(R, [entry('a', done(3)), entry('b', open(4))]))).toBe(true)
  })

  it('counts the sets actually done, not the rows on screen', () => {
    const d = planDiff(R, [entry('a', [...done(2), ...open(1)]), entry('b', done(5))])
    expect(d.changed).toEqual([{ id: 'a', from: 3, to: 2 }, { id: 'b', from: 4, to: 5 }])
    expect(d.added).toEqual([])
  })

  it('reports an exercise added on the day', () => {
    const d = planDiff(R, [entry('a', done(3)), entry('b', done(4)), entry('c', done(2))])
    expect(d.added).toEqual([{ id: 'c', sets: 2 }])
    expect(d.changed).toEqual([])
  })

  it('ignores an added exercise that was never done', () => {
    expect(followedPlan(planDiff(R, [entry('a', done(3)), entry('c', open(3))]))).toBe(true)
  })

  it('ignores order — the same work in a different sequence is the same plan', () => {
    expect(followedPlan(planDiff(R, [entry('b', done(4)), entry('a', done(3))]))).toBe(true)
  })

  it('matches each occurrence of an exercise the plan lists twice', () => {
    const R2 = routine([{ id: 'a', sets: 3 }, { id: 'a', sets: 2 }])
    expect(followedPlan(planDiff(R2, [entry('a', done(3)), entry('a', done(2))]))).toBe(true)
    expect(planDiff(R2, [entry('a', done(3)), entry('a', done(2)), entry('a', done(1))]).added).toEqual([{ id: 'a', sets: 1 }])
  })

  it('has nothing to compare for a freestyle session or a deleted routine', () => {
    expect(followedPlan(planDiff(null, [entry('a', done(3))]))).toBe(true)
  })
})

describe('adoptSession', () => {
  it('takes the done set counts and keeps the rest of each exercise as planned', () => {
    const ex = [{ id: 'a', sets: 3, reps: 10, weight: 40 }, { id: 'b', sets: 4, reps: 8 }]
    const next = adoptSession(ex, [entry('a', done(4)), entry('b', done(4))])
    expect(next).toEqual([{ id: 'a', sets: 4, reps: 10, weight: 40 }, { id: 'b', sets: 4, reps: 8 }])
    expect(ex[0].sets).toBe(3)   // input untouched
  })

  it('leaves a skipped exercise in the plan', () => {
    const ex = [{ id: 'a', sets: 3 }, { id: 'b', sets: 4 }]
    expect(adoptSession(ex, [entry('a', done(2))])).toEqual([{ id: 'a', sets: 2 }, { id: 'b', sets: 4 }])
  })

  it('appends added exercises with the config they were added with', () => {
    const ex = [{ id: 'a', sets: 3, reps: 10 }]
    const next = adoptSession(ex, [entry('a', done(3)), entry('c', done(2), { sets: 3, reps: 12, weight: 20, mode: 'reps' })])
    expect(next[1]).toEqual({ id: 'c', sets: 2, reps: 12, weight: 20, mode: 'reps' })
  })

  it('drops a superset link that lost its partner', () => {
    const ex = [{ id: 'a', sets: 3, sg: 'x' }, { id: 'b', sets: 3, sg: 'x' }]
    const next = adoptSession(ex, [entry('a', done(3)), entry('c', done(1), { sets: 1, sg: 'y' })])
    expect(next[0].sg).toBe('x')
    expect(next[2].sg).toBeUndefined()
  })
})
