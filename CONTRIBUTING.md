
# Contributing to auto-subs

Thank you for considering contributing to AutoSubs! <br>
I welcome contributions from everyone. I will try to review any pull requests as soon possible 😊

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
   This generates a self-contained `AutoSubs (Dev).lua` launcher in your Resolve scripts folder, with the path to your local checkout baked in:
   - **Windows:** `%appdata%/Blackmagic Design/DaVinci Resolve/Support/Fusion/Scripts/Utility`
   - **macOS:** `~/Library/Application Support/Blackmagic Design/DaVinci Resolve/Fusion/Scripts/Utility`
   - **Linux:** `/opt/resolve/Fusion/Scripts/Utility` (or `~/resolve/Fusion/Scripts/Utility` depending on installation)

   You do **not** need to have AutoSubs installed normally first — the dev launcher points Resolve straight at your repo and starts the local server in dev mode. Open it from Resolve via **Workspace → Scripts → AutoSubs (Dev)**.

   Edits to the Lua under `src-tauri/resources/` (e.g. `modules/autosubs_core.lua`, the Resolve integration) take effect the next time you run the script in Resolve — no rebuild needed. Re-run `npm run setup-resolve` only if you move the repository.

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

Backend code lives under `AutoSubs-App/src-tauri/`. For a full breakdown of the codebase before diving in, see the **[AutoSubs DeepWiki](https://deepwiki.com/tmoroney/auto-subs)**.

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
