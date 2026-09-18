# Arch Linux

AutoSubs publishes `.deb` and `.rpm` packages but no Arch package. Nothing in
the build is distro-specific, so Arch works — it just needs the dependency list
mapped by hand, and one setting inside Resolve that the packaged installs happen
to get right for you.

This page covers what differs on Arch. Everything else — the Lua bridge, the
Resolve integration, the models — is the same code the other Linux builds run,
and is documented in [`Resolve-Integration/README.md`](../Resolve-Integration/README.md).

- [System dependencies](#system-dependencies)
- [Running under Wayland](#running-under-wayland)
- [DaVinci Resolve integration paths](#davinci-resolve-integration-paths)
- [Media Storage: the export hang](#media-storage-the-export-hang)
- [Fonts](#fonts)
- [Troubleshooting](#troubleshooting)

## System dependencies

The rpm package declares its dependencies as `webkit2gtk4.1`, `openssl`,
`libappindicator-gtk3`, `librsvg2` and `ffmpeg` (see the `linux.rpm.depends`
array in [`AutoSubs-App/src-tauri/tauri.conf.json`](../AutoSubs-App/src-tauri/tauri.conf.json)).
Those map onto Arch like this:

```bash
sudo pacman -S webkit2gtk-4.1 openssl libayatana-appindicator librsvg ffmpeg
```

`ffmpeg` is a real dependency, not a bundled one: on macOS and Windows AutoSubs
ships ffmpeg as a Tauri sidecar, but on Linux it falls back to the binary on
`PATH` ([`audio_preprocess.rs`](../AutoSubs-App/src-tauri/src/audio_preprocess.rs)).

### GPU acceleration

The Linux build enables `vulkan`, which in
[`transcription-engine/Cargo.toml`](../AutoSubs-App/src-tauri/crates/transcription-engine/Cargo.toml)
expands to `whisper-rs/vulkan` — so Vulkan accelerates the **Whisper** models
and nothing else:

```bash
sudo pacman -S vulkan-icd-loader
# then the driver matching your GPU:
sudo pacman -S vulkan-radeon    # AMD
sudo pacman -S vulkan-intel     # Intel
sudo pacman -S nvidia-utils     # NVIDIA (proprietary driver)
```

`vulkaninfo | head` should list at least one device. Without a working ICD,
Whisper falls back to CPU and is considerably slower on long files.

The ONNX Runtime models — Moonshine, Parakeet, SenseVoice, Canary, Cohere,
GigaAM and Omni-ASR — and speaker diarization both go through `ort`, and the
Linux preset enables no execution provider for it, so **they run on CPU
regardless of your GPU**. This is a property of the presets rather than an
oversight: ONNX Runtime has no Vulkan execution provider to enable, so the
other presets pair Vulkan with a separate ONNX backend — `windows` adds
`directml` and `mac-aarch` adds `coreml`. Picking a Whisper model is therefore
how you get GPU acceleration on Linux; picking an ONNX model will not use it.

### Building from source

```bash
sudo pacman -S base-devel clang cmake nodejs npm rustup

cd AutoSubs-App
npm install
npm run dev:linux     # passes --features linux for you
```

`npm run dev` auto-detects the platform, so it works too — `dev:linux` just
skips the detection.

## Running under Wayland

WebKitGTK 2.42+ composites the webview through `zwp_linux_dmabuf`. On some
Wayland sessions — most often with the NVIDIA proprietary driver, where the
EGL/DMA-BUF export path is incomplete — the window comes up blank, tears, or
the process dies on the first paint. Setting both variables is the standard
Tauri workaround:

```bash
GDK_BACKEND=x11 WEBKIT_DISABLE_DMABUF_RENDERER=1 npm run dev
```

- `WEBKIT_DISABLE_DMABUF_RENDERER=1` makes WebKitGTK fall back to software
  compositing instead of sharing DMA-BUF buffers.
- `GDK_BACKEND=x11` forces the GTK window onto XWayland, because the
  software-composited path is more reliable there than under a native Wayland
  surface.

This is environment-dependent, not an Arch requirement — plenty of Wayland
sessions run the app with neither variable set. If the window renders fine
without them, don't set them: you give up hardware-accelerated webview
compositing for nothing. If you set them permanently, put them in the
`.desktop` `Exec=` line or your compositor's app-specific environment, not in a
shell profile that affects everything else.

## DaVinci Resolve integration paths

Resolve reads per-user scripts and macros from `~/.local/share/DaVinciResolve`
on Linux. This is the same directory `fusion_support_dir()` resolves to in
[`resolve_bridge.rs`](../AutoSubs-App/src-tauri/src/resolve_bridge.rs), so the
app and Resolve agree without any configuration.

| What | Path |
|---|---|
| Startup scriptlib (autostart) | `~/.local/share/DaVinciResolve/Fusion/Scripts/AutoSubs.scriptlib` |
| Launcher (Workspace ▸ Scripts) | `~/.local/share/DaVinciResolve/Fusion/Scripts/Utility/AutoSubs.lua` |
| Mailbox (Rust ⇄ Lua) | `~/.local/share/com.autosubs/resolve-bridge/request.lua` |
| Response channel | `Global.AutoSubsBridge.Ack` / `.Response` in `~/.local/share/DaVinciResolve/Fusion/Profiles/Default/Fusion.prefs` |

The launcher and scriptlib are template files with
`[[__AUTOSUBS_RESOURCES_FOLDER__]]` placeholders that get substituted at
install time. In a release build the app writes them itself; in a dev build
`npm run setup-resolve` does.

`npm run setup-resolve` resolves all three of these for you and needs no root,
because the per-user tree is always writable.

The caption template is not copied into `Fusion/Templates`. It ships as
`caption-bin.drb` and is imported into the project's media pool on demand, which
is why first use creates an **AutoSubs** bin.

### Verifying the bridge

With Resolve open and the scriptlib loaded, running a request by hand should
produce a `Response` key:

1. **Workspace ▸ Console**, switch to the **Lua** tab.
2. Look for `[AutoSubs]` lines. `Export started with PID: …` is the audio
   export; a path error or encoder failure prints here too.

If the Scripts menu has no AutoSubs entry, the launcher is in the wrong tree —
check both `~/.local/share/...` and `/opt/resolve/Fusion/Scripts/Utility/`.

## Media Storage: the export hang

**This is the one that bites on Linux.** Before transcribing a timeline,
AutoSubs asks Resolve to render an audio-only WAV, then transcribes that file.
On Linux, Resolve refuses to render into any directory that is not registered
as a Media Storage location — and the refusal is silent. The render job is
accepted and never starts, so the app sits at *"Exporting audio from
timeline…"* forever with no error on either side.

AutoSubs exports to `~/Videos/AutoSubs`
([`file-utils.ts`](../AutoSubs-App/src/utils/file-utils.ts)), on the assumption
that `~/Videos` is registered by default. On a fresh Arch install it is often
not, because the home directory Resolve auto-registers depends on XDG user
dirs being present.

Fix:

1. **DaVinci Resolve ▸ Preferences ▸ System ▸ Media Storage** (`Ctrl+,`).
2. **Add** → select `~/Videos` (or `~`).
3. **Save**, restart Resolve.

While you are in the Deliver page, also clear the **Render Queue**: a job left
stalled by an earlier failure blocks later ones from starting, which looks
identical from the app's side. The **⋯** menu in the Render Queue panel has
**Clear All**.

Relevant only if you are debugging the export path in code: progress is read
from the playhead against `MarkIn`/`MarkOut` rather than from the job record,
and completion is confirmed by `GetRenderJobStatus` because
`IsRenderingInProgress()` going false does not mean the job succeeded — see
`ExportAudio` and `GetExportProgress` in
[`modules/autosubs_core.lua`](../AutoSubs-App/src-tauri/resources/modules/autosubs_core.lua).

## Fonts

Caption presets reference fonts that ship on macOS and Windows — *Arial Rounded
MT Bold* is the macro default, and presets use Futura, Chalkboard, Menlo and
others. Arch ships none of them, so AutoSubs logs:

> No installed font found for en captions

and captions render in whatever Resolve substitutes, usually with wrong metrics.
Install a broad font set before trying to match a preset visually:

```bash
sudo pacman -S noto-fonts noto-fonts-cjk noto-fonts-emoji \
               ttf-liberation ttf-dejavu

# Microsoft core fonts (Arial, Trebuchet MS, …) from the AUR:
yay -S ttf-ms-fonts
```

Restart Resolve afterwards so it rescans the font cache. `fontconfig` lists what
it found with `fc-list | grep -i arial`.

The warning is advisory — it names a font-family substitution, and the export
still completes. It just means the on-screen look will not match the preset.

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| Stuck at *"Exporting audio…"* | `~/Videos` not a Media Storage location | Add it in Preferences ▸ System ▸ Media Storage |
| Stuck at *"Exporting audio…"* | Stalled job in the Render Queue | Deliver page → Render Queue → ⋯ → Clear All |
| Blank / crashing window on Wayland | WebKitGTK DMA-BUF compositing | `GDK_BACKEND=x11 WEBKIT_DISABLE_DMABUF_RENDERER=1` |
| *"No installed font found for…"* | Preset font absent on Arch | Install `noto-fonts` + `ttf-ms-fonts` |
| No **AutoSubs** entry under Workspace ▸ Scripts | Launcher missing from both Scripts trees | Re-run `npm run setup-resolve`; verify the paths above |
| Transcription succeeds but a crash notification appears | The GPU worker's process teardown can raise a coredump after the result is already returned | Harmless — the transcript is complete. Inspect with `coredumpctl info autosubs` |

## Upstream status

None of the above is Arch-specific in a way that needs a separate build. The
remaining thing worth fixing upstream is the Media Storage requirement being
silent: the app could check that the export directory is registered before
rendering, and report an error instead of hanging.
