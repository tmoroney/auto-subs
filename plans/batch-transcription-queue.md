# Batch transcription queue (issue #568)

> Historical planning document: the implementation evolved after this was
> written. For example, settings now save automatically, outputs default to
> source-adjacent SRT/TXT files with dated backups, and pause is cooperative.
> Cross-item model prefetch remains a follow-up, not part of this change.

Status: implementation plan. Reviewed against commit `79e7329` on
`feature/batch-transcription-queue`. Issue: https://github.com/tmoroney/auto-subs/issues/568

## Goal and scope

Queue multiple local audio/video files, process them unattended, and export one
subtitle file per input. Bulk selection or a folder applies the current settings
to each item; individual pending items can then have different settings. Keep
the existing single-file Generate flow working. First delivery targets standalone
files; queued Resolve/Adobe timelines and merged output are separate follow-ups.
Timeline selection and editor state can change while a queue waits, so those
sources need a separate identity and audio-capture design.

## Current code and constraints

- `AutoSubs-App/src/components/transcription/transcription-panel-view.tsx` has
  the Generate button and a single-file drop target; settings are hidden during
  processing. Multi-file selection must not silently discard all but the first
  file, and queue controls must remain accessible during a run.
- `transcription-panel.tsx` currently prepares source audio and models together,
  builds `TranscriptionOptions`, runs `transcribe_audio`, and passes the result
  to `processTranscriptionResults`. The latter receives live settings, so
  looping the existing handler does not provide immutable job settings. Its
  existing `Promise.all` already overlaps source-audio acquisition and model
  preparation for the same job; it does not establish safe prefetch during a
  different job's inference.
- `src/contexts/SubtitleDocumentContext.tsx` result handling updates the active
  document and uses current integration/timeline state. Its interactive export
  opens a save dialog. Queue processing must not replace the document a user is
  editing, and unattended export needs an explicit destination. Reuse the pure
  export builders in `src/utils/export-file.ts` and `src/utils/subtitle-export.ts`
  where their existing behaviour fits. `src/utils/file-utils.ts` has a
  non-UI `saveSubtitleDocument` helper for normalizing and persisting a document;
  evaluate it for queue results using explicit source metadata, without changing
  the active context. Its storage side effects must be part of the job contract.
- `src-tauri/capabilities/default.json` restricts filesystem operations; the
  existing save dialog provides a selected destination's dynamic scope. Verify
  folder grants, atomic writes and their persistence after restart on each
  supported platform. Do not assume source-adjacent output or a restored path is
  writable, and do not silently broaden filesystem access.
- `src-tauri/src/transcription_api.rs` has process-wide `SHOULD_CANCEL` and
  `PROGRESS_QUEUE`, and untagged `labeled-progress` events. Normalization uses
  one `normalized_audio.wav` path in non-test builds. Only one transcription,
  including an ordinary Generate run, may own this pipeline at a time until
  those resources are isolated.
- `ensure_models` already resolves ASR, VAD, diarization and alignment models and
  returns paths accepted by transcription. However, its cancellation and
  progress are shared with the transcription flow. In
  `crates/transcription-engine/src/model_manager.rs`, `setup_new_download`
  cancels the previous `ACTIVE_DOWNLOAD`, and is called before the cached-file
  fast path. A concurrent model check can therefore cancel a download. This is
  not a waiting download lock; do not start independent `ensure_models` calls
  in parallel without changing coordination. Cache cleanup scans shared files,
  and flat downloads use shared `.part` paths; coordination must also cover
  the model manager UI and other users of the cache.

## User experience

1. Add **Add to Queue** beside Generate for the selected file. Support selecting
   multiple files and a folder, and dropping multiple files/folders. Enumerate
   supported files, report skipped and unreadable entries, and make folder
   recursion explicit. Each selected file gets the current settings snapshot.
2. Show a queue panel with file name, concise settings, status, progress and
   expandable error/output details. Pending items can be edited, reordered,
   duplicated and removed, including while another item is running. Changes to
   the main form apply to new items only. Editing a queued item must not change
   another item's snapshot.
3. Provide Start, Pause after current item, Resume, Cancel current item, retry
   failed/interrupted items and clear completed items. Pause does not claim to
   suspend inference mid-job. Cancel current stops that job and leaves the
   queue paused; the user can resume. Completed and failed items remain visible.
4. Before start, summarize unreadable files, settings incompatibilities, output
   directory/access and collisions, missing model dependencies and estimated
   download/disk requirements where available. Explain that downloads and any
   selected online translation need a connection. Offer download-and-start;
   missing dependencies can also be fetched when a later item needs them.
5. Choose an output directory, SRT format and a naming policy such as
   `{source}.{language}.srt`. Use a deterministic unique suffix on collisions
   by default; never silently overwrite. Reserve names across the queue, handle
   identical basenames from different folders, and enforce no-overwrite at write
   time even if another process creates a file after preflight. Mark an item
   complete only after a successful write; show the actual output path.

## Job and runner design

- Define a serializable job with a stable ID, source path, output policy and an
  immutable snapshot of the *effective* options: stable model identifier (not
  the mutable model-list index), source/target language, translation, GPU, VAD,
  DTW/alignment, diarization and speaker options, formatting, punctuation, case,
  active censor words and prompt. Snapshot any other effective settings found
  when extracting the existing handler. Never persist transient model paths as
  proof that dependencies still exist.
- Extract option construction, dependency resolution and transcription into a
  reusable job service. Keep editor-specific publication separate from running
  a job. Generate uses the same service but explicitly publishes to the active
  document; the queue builds and saves each result without switching documents.
- Use one application-wide pipeline owner, not merely one queue worker: prevent
  Generate and the queue from starting transcriptions simultaneously. Job state
  transitions: pending, preparing, transcribing, exporting, completed, failed,
  cancelled and interrupted. Store actionable error details and preserve a
  successfully exported result if a later operation fails.
- Persist job definitions, ordering, status and result paths using the app's
  existing persistence conventions; do not store audio or transcripts in queue
  metadata. Persist at state transitions. On restart convert in-flight work to
  interrupted, revalidate inputs/models/outputs and offer retry rather than
  silently restarting or declaring success. Ensure writes are crash-safe and
  don't truncate an existing destination on failure.
- Continue after an item-specific failure; retain its error for retry. A shared
  fatal condition, such as an unavailable output folder, should pause the queue
  with a clear explanation rather than generate repeated failures. A retry must
  not overwrite a previous successful output.

## Model preparation and concurrency

First implement a safe baseline: one pipeline owner and serialized preparation
and transcription, automatically downloading missing models. Preflight should
check all effective dependencies without starting destructive or interfering
downloads. Confirm that cache inspection handles partial/corrupt files, model
versions, platform-specific assets and estimated sizes; an existence check alone
must not imply a complete model. Recheck readiness immediately before use.

Then enable prefetch as a separate, bounded worker for the next distinct model
while a prepared job transcribes, only after these prerequisites are met:

- Replace cancel-the-previous-download behaviour with coordinated ownership:
  deduplicate requests by model/artifact, share the result among waiters, and
  serialize or otherwise safely coordinate writes and cleanup. Cached lookups
  must not cancel in-flight downloads. Coordinate the model manager UI and
  deletion with queued, downloading and in-use models.
- Give preparation and transcription separate operation IDs, cancellation
  tokens and progress streams. Route/filter events by job/operation, including
  segment and speaker events; neither a cancelled prefetch nor a new job may
  cancel or reset an unrelated active job. Preserve existing Generate behaviour.
- Verify that every model needed by the current job is resolved before starting
  inference, and that a prefetch failure leaves the active job unaffected. If
  the next job reaches an in-flight model, await the same operation; if it
  failed, report and allow retry. Bound network/disk use and release resources
  when pausing or shutting down.
- Test the overlap on supported platforms with real and simulated slow/failing
  downloads before enabling it. Do not claim parallel transcription support:
  the fixed normalization path and shared globals require isolation first, and
  memory/GPU contention needs measurement.

## Implementation order and acceptance checks

1. Extract a snapshot-based job service and non-interactive export, preserving
   current Generate and editor behaviour. Enforce exclusive pipeline ownership.
2. Add multi-file/folder intake and queue UI, pending-item settings and controls.
   Add all new user-facing strings to all eight locales, following `AGENTS.md`.
3. Add preflight, model acquisition, serial runner, safe export and recovery.
4. Refactor model coordination and operation-scoped events; then add bounded
   prefetch and validate it separately. Keep it disabled until those tests pass.
5. Test mixed per-item options and models; batch selection and unsupported files;
   duplicate names and existing outputs; missing input, disk full and write
   errors; offline, partial and failed downloads; pause, cancel, retry and app
   restart; queue/Generate exclusion; existing Generate and editor regressions.
   Test download deduplication, cancellation isolation and model deletion during
   prefetch, including overlap with an active transcription. Run relevant Rust
   and frontend tests and `npm run build:web`, plus platform smoke tests where
   toolchains and models are available.

## Decisions for maintainer review

- Initial folder recursion default and how to surface skipped entries.
- Queue persistence and interruption recovery versus a smaller session-only MVP.
- Whether to deliver overlap in the first PR or a follow-up after the safe
  serial baseline. Recommended: separate follow-up if the coordination refactor
  makes the initial PR difficult to review.
- Resolve/Adobe timeline support and merged source-labelled output are outside
  the first standalone-file milestone.
