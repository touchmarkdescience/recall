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

// Spoken clock times survive punctuation and retain explicit-time metadata.
for (const [phrase,hour,minute,date] of [
  ['call Kartikeyan by 12:30 p.m.',12,30,'2026-11-04'],
  ['1:00 p.m. tomorrow',13,0,'2026-11-05'],
  ['5 pm',17,0,'2026-11-04'],
  ['9 a.m. on 17th November',9,0,'2026-11-17'],
  ['tomorrow',9,0,'2026-11-05'],
  ['call Kartikeyan next Monday at 5 pm',17,0,'2026-11-09'],
  ['12:30',12,30,'2026-11-04'],
  ['12.30',12,30,'2026-11-04'],
  ['by 12:30',12,30,'2026-11-04'],
  ['12:30 am',0,30,'2026-11-04'],
]) {
  const parsed=DateTime.fromISO(parseIST(phrase,now)).setZone('Asia/Kolkata');
  assert.equal(parsed.toISODate(),date,phrase);assert.equal(parsed.hour,hour,phrase);assert.equal(parsed.minute,minute,phrase);
}
for(const clock of ['12:30 p.m.','12:30 pm','12:30','12.30']){
  const draft=localExtract(`remind me to call Kartikeyan by ${clock}`,now);
  assert.equal(draft.contactName,'Kartikeyan');assert.equal(draft.actions.length,1);
  assert.equal(draft.actions[0].timeSpecified,true);assert.equal(DateTime.fromISO(draft.actions[0].dueAt).setZone('Asia/Kolkata').toFormat('HH:mm'),'12:30');
}
assert.equal(localExtract('call Kartikeyan tomorrow',now).actions[0].timeSpecified,false);
assert.equal(localExtract('call Kartikeyan by 25:99',now).actions[0].dueAt,null);
assert.equal(localExtract('call Kartikeyan by 25:99',now).actions[0].timeSpecified,true);
assert.equal(localExtract('Call Priya at 5 pm. Send slides tomorrow',now).actions.length,2);
console.log('Clock-time regression tests passed');

const {reminderAt,validReminder}=await import('../src/lib/reminders.ts');
const due='2026-11-17T07:00:00.000Z'; // 12:30 PM IST
for(const offset of [0,10,30,60,1440]){
  assert.equal(validReminder(offset),true);
  assert.equal(Date.parse(reminderAt(due,true,offset)),Date.parse(due)-offset*60000);
}
assert.equal(DateTime.fromISO(reminderAt(due,true,30)).setZone('Asia/Kolkata').toFormat('h:mm a'),'12:00 PM');
assert.equal(reminderAt(null,true,30),null);
assert.equal(reminderAt(due,false,30),null);
assert.equal(reminderAt('invalid',true,0),null);
assert.equal(validReminder(15),false);
assert.equal(validReminder('30'),false);
assert.equal(reminderAt('2026-11-18T07:00:00.000Z',true,30),'2026-11-18T06:30:00.000Z');
console.log('Reminder offset tests passed');
