// @vitest-environment happy-dom
// Finishing a routine's workout that strayed from the plan asks first, before the summary: an
// exercise added (#592), a different set count or one removed on purpose (lib/plan-changes.js).
// Update plan rewrites the routine; keeping it leaves the routine exactly as it was.
import React, { act } from 'react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createRoot } from 'react-dom/client'
import { DEF, useStore } from './store/useStore.js'
import { useUI } from './store/useUI.js'
import { finishWorkoutNow } from './sheets.jsx'

const clone = v => JSON.parse(JSON.stringify(v))
const S = () => useStore.getState().S
const mounted = []
let host

function renderTopSheet() {
  const sheet = useUI.getState().sheets.at(-1)
  host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  mounted.push(root)
  act(() => root.render(sheet.render(() => useUI.getState().closeSheet(sheet.id))))
}
// The photo section asks the media store whether it can keep files; let that answer land.
const settle = () => act(async () => {})
const button = text => [...host.querySelectorAll('button')].find(b => b.textContent.trim() === text)

function install(entries) {
  const st = clone(DEF)
  st.routines = [{ id: 'r1', name: 'Push A', ex: [{ id: '0025', sets: 1, reps: 5, weight: 60 }] }]
  st.active = {
    id: 'fin', d: '2026-09-28', start: Date.now() - 20 * 60000, routineIds: ['r1'], routineId: 'r1', name: 'Push A', bw: null, cur: 0,
    entries,
  }
  useStore.setState({ S: st, user: null })
}
const bench = { id: '0025', rid: 'r1', target: { sets: 1, reps: 5, weight: 60 }, sets: [{ w: 60, r: 5, done: true }] }
const raise = { id: '0334', rid: 'r1', addedInSession: true, target: { sets: 2, reps: 12, weight: 8 }, sets: [{ w: 8, r: 12, done: true }, { w: 8, r: 12, done: true }] }

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  localStorage.clear()
  useUI.setState({ sheets: [], timer: null, work: null })
})
afterEach(() => {
  mounted.splice(0).forEach(r => act(() => r.unmount()))
  document.body.innerHTML = ''
})

describe('finishing a workout that strayed from its plan', () => {
  const summaryShown = () => useUI.getState().sheets.length === 1 && !host.querySelector('[data-plan-update]')

  it('asks before the summary, and Update plan adds what was added with the setup of the session', async () => {
    install([clone(bench), clone(raise)])
    act(() => finishWorkoutNow())
    renderTopSheet()
    expect(host.querySelector('[data-plan-update]')).toBeTruthy()
    expect(host.textContent).toContain('Push A')
    // The workout is saved already; the routine is untouched until the answer.
    expect(S().workouts).toHaveLength(1)
    expect(S().routines[0].ex.map(x => x.id)).toEqual(['0025'])
    act(() => button('Update plan').click())
    expect(S().routines[0].ex.map(x => x.id)).toEqual(['0025', '0334'])
    expect(S().routines[0].ex[1]).toMatchObject({ sets: 2, reps: 12, weight: 8 })
    // On to the summary.
    renderTopSheet()
    await settle()
    expect(summaryShown()).toBe(true)
    expect(host.textContent).toContain('Workout complete!')
    // The saved workout carries no trace of the marker.
    expect(JSON.stringify(S().workouts.at(-1))).not.toContain('addedInSession')
  })

  it('Keep the plan as it is leaves the routine alone and still shows the summary', async () => {
    install([clone(bench), clone(raise)])
    act(() => finishWorkoutNow())
    renderTopSheet()
    act(() => button('Keep the plan as it is').click())
    expect(S().routines[0].ex.map(x => x.id)).toEqual(['0025'])
    renderTopSheet()
    await settle()
    expect(host.textContent).toContain('Workout complete!')
  })

  it('takes a different set count, and drops an exercise removed from the session on purpose', () => {
    const st = clone(DEF)
    st.routines = [{ id: 'r1', name: 'Push A', ex: [{ id: '0025', sets: 1, reps: 5, weight: 60 }, { id: '0334', sets: 2, reps: 12, weight: 8 }] }]
    st.active = {
      id: 'fin', d: '2026-09-28', start: Date.now() - 20 * 60000, routineIds: ['r1'], routineId: 'r1', name: 'Push A', bw: null, cur: 0,
      entries: [{ ...clone(bench), sets: [{ w: 60, r: 5, done: true }, { w: 60, r: 5, done: true }] }],
      removed: [{ rid: 'r1', id: '0334' }],
    }
    useStore.setState({ S: st, user: null })
    act(() => finishWorkoutNow())
    renderTopSheet()
    expect(host.textContent).toContain('Removed')
    act(() => button('Update plan').click())
    expect(S().routines[0].ex).toEqual([{ id: '0025', sets: 2, reps: 5, weight: 60 }])
  })

  it('goes straight to the summary when the session followed its plan', async () => {
    install([clone(bench)])
    act(() => finishWorkoutNow())
    renderTopSheet()
    await settle()
    expect(host.querySelector('[data-plan-update]')).toBeNull()
    expect(host.textContent).toContain('Workout complete!')
  })
})
