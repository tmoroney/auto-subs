# Privacy

AutoSubs runs entirely on your machine. Audio, video, transcripts and models never leave your
computer as part of transcription: there is no cloud transcription service, no account, and no
upload of your media.

Three things do involve the network, and only one of them is optional telemetry.

| What | When | Can be turned off |
| --- | --- | --- |
| Model downloads | The first time you use a model | Not applicable, the model has to be fetched once |
| Update check | On launch, asks GitHub for the latest release | Yes, ignore the prompt; no data about you is sent |
| Anonymous usage stats | Weekly, only if you opt in | Yes, off unless you say yes |

## Anonymous usage stats

AutoSubs is free and open source, and there is no signup, so there is no way to see which features
are worth improving other than asking. The app therefore asks once, after your first transcription,
whether it may send an anonymous weekly summary. **Nothing is recorded, stored or sent before you
answer yes.** Declining is a single click and the question is never asked again.

You can change your mind at any time in Settings, under Privacy. Turning it off also deletes the
local counters and the random install id, so turning it back on later starts a completely new
identity.

### What is sent

One JSON object, at most once every seven days (and once more shortly after an app update, so a
version's problems show up before the next weekly window). If you never go online, nothing is ever
sent.

```json
{
  "v": 1,
  "install_id": "3f2504e0-4f89-41d3-9a0c-0305e82c3301",
  "app_version": "3.8.0",
  "channel": "release",
  "os": "windows",
  "arch": "x86_64",
  "gpu_backend": "directml",
  "integration": "davinci",
  "ui_language": "en",
  "engine": "whisper-large-v3",
  "language": "auto",
  "period_days": 7,
  "runs": 12,
  "runs_failed": 1,
  "runs_diarize": 3,
  "runs_translate": 0,
  "runs_forced_alignment": 2,
  "runs_dtw": 9,
  "runs_censor": 0,
  "runs_custom_template": 4,
  "runs_file_input": 2,
  "audio_minutes": 143
}
```

That is the entire payload; the schema is enforced on both ends, so a build cannot send extra
fields even by accident. `engine`, `language` and `integration` are the *most used* value over the
period, not a list. `install_id` is a random UUID generated on your machine, tied to nothing else,
and used only so that one install sending twice in a week can be ignored. You can see the exact
pending payload at any time from the same Settings section.

### What is never sent

- Audio or video, in any form
- Transcript text, subtitle text, or speaker names
- File names, file paths, project names or timeline names
- Anything you typed: custom prompts, censor word lists, replacement strings
- Error messages or stack traces (only a count of runs that failed)
- Your IP address. The receiving Cloudflare Worker sees it, as any server does, but it is never
  stored; only the country Cloudflare derives from it is kept

### Where it goes

To a Cloudflare Worker maintained by the AutoSubs author, which writes the summary into Cloudflare
Analytics Engine. The Worker's full source, including everything it stores, is in
[`telemetry-worker/`](telemetry-worker/) in this repository. Data is aggregated for deciding what to
build next, and is not sold, shared or used for advertising.

### Builds that cannot send anything

The endpoint and signing key are supplied at compile time. Any build that was not produced by the
official release workflow, including every build you make from source, has no endpoint compiled in:
the consent prompt and the Settings section do not appear at all, and no counters are recorded.
This is why the feature is invisible when you run `npm run dev`.

## Questions

Open an issue at <https://github.com/tmoroney/auto-subs/issues>.
