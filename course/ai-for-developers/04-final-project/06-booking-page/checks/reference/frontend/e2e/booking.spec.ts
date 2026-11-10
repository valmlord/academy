import { expect, test, type APIRequestContext } from '@playwright/test'

// The backend runs with CALENDAR_NOW=2026-03-01T08:00:00Z; every test creates its own schedule and event
// type through the /api proxy, so the tests do not depend on each other or on earlier runs.
async function createEventType(request: APIRequestContext, timeZone: string, day: number): Promise<string> {
  const weekly = [1, 2, 3, 4, 5, 6, 7].map((weekday) => ({ weekday, start: '00:00', end: '24:00' }))
  const schedule = await request.post('/api/schedules', { data: { name: `E2E ${day}`, timeZone, weekly, overrides: [] } })
  expect(schedule.status()).toBe(201)
  const eventType = await request.post('/api/event-types', {
    data: {
      title: 'E2E', durationMinutes: 30, slotIncrementMinutes: 30, bufferBeforeMinutes: 0, bufferAfterMinutes: 0,
      minimumNoticeMinutes: 0, bookingWindowDays: 60, scheduleId: (await schedule.json()).id,
    },
  })
  expect(eventType.status()).toBe(201)
  return (await eventType.json()).id
}

async function fillAndSubmit(page: import('@playwright/test').Page) {
  await page.getByLabel('Имя').fill('Анна Петрова')
  await page.getByLabel('Email').fill('anna@example.com')
  await page.getByRole('button', { name: 'Забронировать' }).click()
}

test('an invitee picks a free slot and sees the confirmation', async ({ page, request }) => {
  const id = await createEventType(request, 'UTC', 10)
  await page.goto(`/book/${id}?date=2026-03-10&tz=Asia/Kolkata`)
  await page.getByRole('button', { name: '10:00' }).click()
  await fillAndSubmit(page)
  await expect(page.getByRole('status')).toHaveText('Встреча забронирована.')
})

test('a slot taken by someone else while the form is open is reported, not booked twice', async ({ page, request }) => {
  const id = await createEventType(request, 'UTC', 11)
  await page.goto(`/book/${id}?date=2026-03-11&tz=UTC`)
  const slot = page.locator('[data-slot-start]').first()
  const start = await slot.getAttribute('data-slot-start')
  await slot.click()
  const other = await request.post('/api/bookings', {
    data: { eventTypeId: id, start, inviteeName: 'Other', inviteeEmail: 'other@example.com', inviteeTimeZone: 'UTC' },
  })
  expect(other.status()).toBe(201)
  await fillAndSubmit(page)
  await expect(page.getByRole('alert')).toHaveText('Это время только что заняли. Выберите другое.')
})

test('on the spring-forward date the local times skip the missing hour', async ({ page, request }) => {
  const id = await createEventType(request, 'UTC', 29)
  await page.goto(`/book/${id}?date=2026-03-29&tz=Europe/Berlin`)
  const times = await page.locator('[data-slot-start]').allTextContents()
  expect(times).toContain('01:30')
  expect(times).toContain('03:00')
  expect(times.filter((t) => t.startsWith('02:'))).toEqual([])
  expect(times).toHaveLength(46) // a 23-hour day in 30-minute slots
})
