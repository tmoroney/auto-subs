import test from 'node:test';
import assert from 'node:assert/strict';
import { buildProcessingSteps, stepIdFromEvent } from '../src/queue/progress-steps.ts';

const settings = {
  targetLanguage: 'en', language: 'ja', enableForcedAlignment: true,
  enableDiarize: true, audioInputMode: 'file' as const,
};
const title = (id: string) => id;

test('queued progress shows predicted steps and concurrent observed steps', () => {
  const steps = buildProcessingSteps({
    settings, title, runComplete: false,
    stepMap: { 'prepare.normalize': { progress: 40 }, 'prepare.asr': { progress: 20 } },
    seenOrder: ['prepare.normalize', 'prepare.asr'],
  });
  assert.deepEqual(steps.map((step) => step.id), [
    'prepare.normalize', 'prepare.asr', 'analyze.vad', 'analyze.diarize',
    'analyze.loading', 'transcribe', 'refine', 'finish',
  ]);
  assert.equal(steps[0].isActive, true);
  assert.equal(steps[1].isActive, true);
  assert.equal(steps[2].isActive, false);
});

test('completed runs do not leave predicted steps incomplete', () => {
  const steps = buildProcessingSteps({ settings, title, runComplete: true, stepMap: {}, seenOrder: [] });
  assert.ok(steps.every((step) => step.isCompleted && step.progress === 100));
});

test('event identities match the normal pipeline', () => {
  assert.equal(stepIdFromEvent('progressSteps.analyze.vad'), 'analyze.vad');
  assert.equal(stepIdFromEvent(undefined, 'Transcribe'), 'transcribe');
});

test('speaker count is shown only on diarization progress', () => {
  const steps = buildProcessingSteps({
    settings, title, runComplete: false, speakerDetail: '3 speakers',
    stepMap: { 'analyze.diarize': { progress: 50 } },
    seenOrder: ['analyze.diarize'],
  });
  assert.equal(steps.find((step) => step.id === 'analyze.diarize')?.detail, '3 speakers');
  assert.ok(steps.filter((step) => step.id !== 'analyze.diarize').every((step) => step.detail === undefined));
});
