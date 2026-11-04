import assert from 'node:assert/strict';
import { DateTime } from 'luxon';
import { localExtract, parseIST } from '../src/lib/extract.ts';
import { appendTranscript } from '../src/lib/transcription.ts';

const now = new Date('2026-11-03T18:30:00Z'); // 4 Nov 2026, 00:00 IST
const day = text => DateTime.fromISO(parseIST(text, now)).setZone('Asia/Kolkata').toISODate();

assert.equal(day('17th November'), '2026-11-17');
assert.equal(day('17 November'), '2026-11-17');
assert.equal(day('November 17'), '2026-11-17');
assert.equal(day('on 3rd Dec'), '2026-12-03');
assert.equal(day('on 3rd Oct'), '2026-10-03'); // preserve a past date
assert.equal(parseIST('No date was mentioned', now), null);
assert.equal(localExtract('Follow up with Dr. Sri pratap about the proposal').actions[0].dueAt, null);

for (const honorific of ['Dr Sri pratap', 'Dr. Sri pratap']) {
  const note = `I have a follow up with ${honorific} on 17th November`;
  const result = localExtract(note);
  assert.equal(result.contactName, 'Dr Sri pratap');
  assert.equal(result.actions.length, 1);
  assert.match(result.actions[0].title, /Sri pratap on 17th November/);
}

const split = localExtract('Call Dr. Sri pratap on 17th November. Remind me to send slides tomorrow');
assert.equal(split.actions.length, 2);
assert.match(split.actions[0].title, /Dr\. Sri pratap/);
assert.equal(appendTranscript('Call Dr.', 'Sri pratap on 17th November'), 'Call Dr. Sri pratap on 17th November');
const ambiguous=localExtract('Tomorrow I am meeting Sujay for a demo about startup product; remind me at 1:00 p.m. — or the meeting is at 4:00 p.m.');
assert.equal(ambiguous.contactName,'Sujay');
assert.equal(ambiguous.topic,'startup product');
assert.equal(ambiguous.actions[0].timeChoices?.length,2);

console.log('Extraction and segment tests passed');
