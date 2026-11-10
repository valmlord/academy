import { describe, expect, it, vi } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import SlotPicker from '~/components/SlotPicker.vue'

// The generated client is replaced, so the test sees exactly what the component asks the API for and
// controls what it gets back; no request leaves the test.
const { get } = vi.hoisted(() => ({ get: vi.fn() }))
vi.mock('~/api/client', () => ({ useApiClient: () => ({ GET: get, POST: vi.fn() }) }))

describe('SlotPicker', () => {
  it('shows only the slots of the local date, as HH:MM in the invitee zone, across the spring gap', async () => {
    get.mockResolvedValue({
      data: {
        items: [
          { start: '2026-03-28T22:30:00Z', end: '2026-03-28T23:00:00Z' }, // 23:30 on 28 March in Berlin
          { start: '2026-03-29T00:30:00Z', end: '2026-03-29T01:00:00Z' }, // 01:30, before the gap
          { start: '2026-03-29T01:00:00Z', end: '2026-03-29T01:30:00Z' }, // 03:00, right after it
        ],
      },
      error: undefined,
    })

    const wrapper = await mountSuspended(SlotPicker, { props: { eventTypeId: 'et-1', date: '2026-03-29', tz: 'Europe/Berlin' } })

    expect(wrapper.findAll('[data-slot-start]').map((slot) => [slot.attributes('data-slot-start'), slot.text()])).toEqual([
      ['2026-03-29T00:30:00Z', '01:30'],
      ['2026-03-29T01:00:00Z', '03:00'],
    ])
    expect(get).toHaveBeenCalledWith('/event-types/{eventTypeId}/slots', {
      params: { path: { eventTypeId: 'et-1' }, query: { from: '2026-03-28T00:00:00Z', to: '2026-03-31T00:00:00Z' } },
    })
  })
})
