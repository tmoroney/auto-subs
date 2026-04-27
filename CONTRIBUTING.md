
# Contributing to auto-subs

Thank you for considering contributing to AutoSubs! <br>
I welcome contributions from everyone. I will try to review any pull requests as soon possible 😊

## Dev Setup

1. Clone the repo.
2. Install prerequisites: Node.js + Rust toolchain — see [tauri.app](https://tauri.app).
3. Start the app in dev mode:
   ```bash
   cd AutoSubs-App
   npm install
   npm run tauri dev
   ```
4. For Resolve integration during development, copy `AutoSubs-App/src-tauri/resources/Testing-AutoSubs.lua` into your Resolve scripts folder:
   - **Windows:** `%appdata%/Blackmagic Design/DaVinci Resolve/Support/Fusion/Scripts/Utility`
   - **macOS:** `/Library/Application Support/Blackmagic Design/DaVinci Resolve/Fusion/Scripts/Utility`

   Then change the path in `Testing-AutoSubs.lua` to point to your local AutoSubs installation and open it from Resolve via **Workspace → Scripts → Testing-AutoSubs**.

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
