
# Contributing to auto-subs

Thank you for considering contributing to AutoSubs! <br>
I welcome contributions from everyone. I will try to review any pull requests as soon possible 😊

## Documentation

- **[CLI Guide](CLI.md)** - Command-line interface reference
- **[AutoSubs-App README](AutoSubs-App/README.md)** - Technical architecture and code organization
- **[Resolve Integration](Resolve-Integration/README.md)** - DaVinci Resolve integration architecture and development
- **[Adobe Extension](Adobe-Extension/README.md)** - Adobe Premiere Pro/After Effects integration details
- **[AGENTS.md](AGENTS.md)** - AI agent context with architecture gotchas and bridge details

## Dev Setup

1. Clone the repo.
2. Navigate to the app directory and install dependencies:
   ```bash
   cd AutoSubs-App
   npm install
   ```

3. (Optional) For **DaVinci Resolve** integration during development, run:
   ```bash
   npm run setup-resolve
   ```
   This generates a self-contained `AutoSubs (Dev).lua` launcher in your Resolve scripts folder, automatically detecting the correct path for your platform.

   The dev launcher points Resolve at your repo and starts the local server in dev mode (without opening the app window). Open it from Resolve via **Workspace → Scripts → AutoSubs (Dev)**.

   If you close the app window, the server stops — relaunch the script to restart it.

   Edits to the Lua under `src-tauri/resources/` (e.g. `modules/autosubs_core.lua`, the Resolve integration) take effect the next time you run the "AutoSubs (Dev)" script in Resolve — no rebuild or restart needed. Re-run `npm run setup-resolve` only if you move the repository.

4. (Optional) For **Premiere Pro / After Effects** integration during development, build the CEP extension and symlink it into Adobe's extensions folder:
   ```bash
   cd ../Adobe-Extension
   npm install
   npm run symlink   # links the extension into the Adobe CEP extensions folder
   npm run dev       # live-reload dev server for the panel
   ```
   The Bolt-CEP tooling also enables `PlayerDebugMode` so the unsigned dev extension loads. Run `npm run delsymlink` to remove it.

5. Start the app in dev mode:
   ```bash
   cd ../AutoSubs-App
   npm run dev
   ```
   This automatically detects your platform and architecture (macOS ARM/Intel, Windows, Linux) and passes the correct Cargo feature flags to Tauri.

   If you only want to run the React frontend without the Rust backend:
   ```bash
   npm run dev:frontend
   ```

### Platform-Specific Build Commands

The app uses platform-specific Cargo features for AI acceleration:

- **macOS (Apple Silicon)**: `--features mac-aarch` (Metal + CoreML)
- **Windows**: `--features windows` (Vulkan + DirectML)
- **Linux**: `--features linux` (Vulkan)

These are passed automatically by the npm scripts:

| Command | Purpose |
|---|---|
| `npm run dev` | Auto-detect platform and run dev mode |
| `npm run dev:mac:arm64` | macOS Apple Silicon dev mode |
| `npm run dev:mac:x86_64` | macOS Intel dev mode |
| `npm run dev:win` | Windows dev mode |
| `npm run dev:linux` | Linux dev mode |
| `npm run build:mac:arm64` | Build for macOS Apple Silicon |
| `npm run build:mac:x86_64` | Build for macOS Intel |
| `npm run build:win` | Build for Windows |
| `npm run build:linux` | Build for Linux |

### Windows Prerequisites

In addition to the standard Tauri prerequisites, Windows builds require:

1. **LLVM** — needed by `bindgen` to generate FFI bindings:
   ```powershell
   winget install LLVM.LLVM
   ```
   Then set the environment variable: `LIBCLANG_PATH=C:\Program Files\LLVM\bin`

2. **Vulkan SDK** — needed for GPU-accelerated transcription via Whisper:
   Download from [vulkan.lunarg.com](https://vulkan.lunarg.com/sdk/home#windows) and install. The installer sets `VULKAN_SDK` automatically.

3. **Short Cargo target directory** — the Vulkan shader build generates deeply nested paths that exceed Windows' 260-character limit. Set a short output directory once as a user environment variable (no admin required):
   ```powershell
   [System.Environment]::SetEnvironmentVariable("CARGO_TARGET_DIR", "C:\cargo-target", "User")
   ```
   Open a new terminal after running this for it to take effect.

Backend code lives under `AutoSubs-App/src-tauri/`. For a full breakdown of the codebase before diving in, see the **[AutoSubs DeepWiki](https://deepwiki.com/tmoroney/auto-subs)**.

For detailed information about the DaVinci Resolve integration (architecture, Lua server, Fusion macro system, and development workflow), see [Resolve-Integration/README.md](Resolve-Integration/README.md).

---

## Getting Started

### Fork and Clone the Repository

1. Fork the repository by clicking the "Fork" button at the top right of the repository page.
2. Clone your forked repository to your local machine:
   ```sh
   git clone https://github.com/YOUR-USERNAME/auto-subs.git
   ```
3. Navigate to the cloned directory:
   ```sh
   cd auto-subs
   ```

### Create a Branch

Create a new branch for your work. Use a descriptive name for your branch (e.g., `fix-bug-123` or `add-new-feature`):
```sh
git checkout -b my-branch-name
```

### Install Dependencies

Ensure you have the necessary dependencies installed (guide in the readme.md)

### Making Changes

1. Make sure your changes follow the project's coding style and guidelines.
2. Write clear and concise commit messages.
3. Test your changes thoroughly.

### Commit and Push Your Changes

1. Add and commit your changes:
   ```sh
   git add .
   git commit -m "A brief description of your changes"
   ```
2. Push your changes to your fork:
   ```sh
   git push origin my-branch-name
   ```

## Submitting a Pull Request

1. Navigate to your fork on GitHub.
2. Click the "Compare & pull request" button.
3. Provide a clear and detailed description of your changes.
4. Submit the pull request.

## Review Process

1. Your pull request will be reviewed by me (the repository maintainer).
2. Ensure you address any feedback and make the necessary changes.
3. Once your pull request is approved, it will be merged into the `main` branch.

## Getting Help

If you need any help, feel free to open an issue on GitHub and I will try to get back to you.

---

Thank you for your contributions and for helping improve AutoSubs!
