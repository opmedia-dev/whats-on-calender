import test from 'node:test';
import assert from 'node:assert/strict';
import { describeRecurrence, mergeRecurrenceTexts } from '../scripts/lib/recurrence.mjs';

const d = (rule, start = '2026-01-05T10:00:00Z') => describeRecurrence([rule], start);

test('weekly rules', () => {
  assert.equal(d('RRULE:FREQ=WEEKLY;BYDAY=SU'), 'Every Sunday');
  assert.equal(d('RRULE:FREQ=WEEKLY;BYDAY=TU,TH'), 'Every Tuesday and Thursday');
  assert.equal(d('RRULE:FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR'), 'Every weekday');
  assert.equal(d('RRULE:FREQ=WEEKLY;INTERVAL=2;BYDAY=WE'), 'Every other week on Wednesday');
  assert.equal(d('RRULE:FREQ=WEEKLY'), 'Every Monday'); // day taken from the start date
});

test('monthly rules', () => {
  assert.equal(d('RRULE:FREQ=MONTHLY;BYDAY=2MO'), 'Second Monday of each month');
  assert.equal(d('RRULE:FREQ=MONTHLY;BYDAY=-1TH'), 'Last Thursday of each month');
  assert.equal(d('RRULE:FREQ=MONTHLY;INTERVAL=1;BYDAY=1TU'), 'First Tuesday of each month');
  assert.equal(d('RRULE:FREQ=MONTHLY;BYDAY=TU;BYSETPOS=3'), 'Third Tuesday of each month');
  assert.equal(d('RRULE:FREQ=MONTHLY;BYMONTHDAY=15'), 'The 15th of each month');
  assert.equal(d('RRULE:FREQ=MONTHLY;INTERVAL=2;BYDAY=1SU'), 'First Sunday of every other month');
});

test('yearly, daily and unknown rules', () => {
  assert.equal(describeRecurrence(['RRULE:FREQ=YEARLY;INTERVAL=1;BYMONTH=6;BYMONTHDAY=24'], '2013-06-24'), 'Every year on 24 June');
  assert.equal(d('RRULE:FREQ=DAILY'), 'Daily');
  assert.equal(d('RRULE:FREQ=DAILY;INTERVAL=3'), 'Every 3 days');
  assert.equal(describeRecurrence(['EXDATE;TZID=Europe/London:20230802T113000'], '2026-01-01'), null);
  assert.equal(describeRecurrence(undefined), null);
});

test('merging series with the same title', () => {
  assert.equal(mergeRecurrenceTexts(['Every Thursday', 'Every Tuesday']), 'Every Tuesday and Thursday');
  assert.equal(mergeRecurrenceTexts(['Every Sunday', 'Every Sunday']), 'Every Sunday');
  assert.equal(mergeRecurrenceTexts(['Every Sunday', 'First Monday of each month']), 'Every Sunday; First Monday of each month');
});
