import { test } from 'node:test'
import assert from 'node:assert/strict'
import { clockLabel, dayClockLabel, resumedLabel, timeLabel } from './chatTime.ts'

// Local-time dates, so the tests read the same in every time zone. Thu 19 Nov 2026, 3:15 PM.
const now = new Date(2026, 10, 19, 15, 15).getTime()
const at = (month: number, day: number, hour = 12, minute = 0): number =>
  new Date(2026, month - 1, day, hour, minute).getTime()

test('time: today reads as a 12 hour clock with a, p', () => {
  assert.equal(timeLabel(at(11, 19, 14, 41), now), '2:41p')
  assert.equal(timeLabel(at(11, 19, 10, 12), now), '10:12a')
  assert.equal(timeLabel(at(11, 19, 0, 5), now), '12:05a')
  assert.equal(timeLabel(at(11, 19, 12, 0), now), '12:00p')
  assert.equal(timeLabel(at(11, 19, 23, 59), now), '11:59p')
})

test('time: within 7 days it is the weekday', () => {
  assert.equal(timeLabel(at(11, 18, 23, 59), now), 'Wed')
  assert.equal(timeLabel(at(11, 17), now), 'Tue')
  assert.equal(timeLabel(at(11, 13, 0, 1), now), 'Fri')
})

test('time: 7 days or more it is the date', () => {
  assert.equal(timeLabel(at(11, 12), now), 'Nov 12')
  assert.equal(timeLabel(at(10, 3), now), 'Oct 3')
  assert.equal(timeLabel(at(1, 30), now), 'Jan 30')
})

test('time: yesterday late and today early are different days', () => {
  const justAfterMidnight = new Date(2026, 10, 19, 0, 10).getTime()
  assert.equal(timeLabel(new Date(2026, 10, 18, 23, 50).getTime(), justAfterMidnight), 'Wed')
  assert.equal(timeLabel(new Date(2026, 10, 19, 0, 1).getTime(), justAfterMidnight), '12:01a')
})

test('time: a time after now (clock skew) reads as today', () => {
  assert.equal(timeLabel(at(11, 19, 18, 30), now), '6:30p')
  assert.equal(timeLabel(at(11, 25, 9, 0), now), '9:00a')
})

test('clock: 9:30 PM', () => {
  assert.equal(clockLabel(at(11, 18, 21, 30)), '9:30 PM')
  assert.equal(clockLabel(at(11, 18, 0, 7)), '12:07 AM')
})

test('resumed: weekday, clock, and a message count', () => {
  assert.equal(resumedLabel(at(11, 18, 21, 30), now, 44), 'Wed 9:30 PM · 44 messages')
  assert.equal(resumedLabel(at(11, 18, 21, 30), now, 1), 'Wed 9:30 PM · 1 message')
  assert.equal(resumedLabel(at(11, 19, 9, 5), now, 0), 'Thu 9:05 AM · 0 messages')
})

test('resumed: an older chat gets its date', () => {
  assert.equal(dayClockLabel(at(11, 2, 8, 0), now), 'Nov 2 8:00 AM')
})
