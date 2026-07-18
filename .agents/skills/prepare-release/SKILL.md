---
name: prepare-release
description: Use this skill whenever the user wants to prepare/draft a new release of AutoSubs. Trigger on phrases like "prepare for release", "make a release", "release the app", "draft a release", or any mention of publishing a new version. This skill reads commits since the last tag, writes user-facing release notes, recommends a semantic version bump, asks the user to confirm, updates all version files via the bump-version script, commits, tags, creates a draft GitHub release, and triggers the Mac/Linux packaging workflow.
---

# Prepare a new AutoSubs release

This skill turns release preparation into a single conversation. You (the agent) will gather the changelog, write user-friendly release notes, recommend a version bump, ask the user to confirm, bump the version everywhere, commit and tag, create a draft GitHub release, and trigger the Mac/Linux build workflow.

## Pre-requisites

Before running, verify that these are available and configured:
- `git` is available and the repo has a clean working tree.
- `gh` CLI is authenticated and can create releases for `tmoroney/auto-subs`.
- Node.js and npm are available in `AutoSubs-App/`.
- The user is on a branch where they want to release from (usually `main` or `enhance-model-manager`).

> **Git state:** If there are uncommitted changes, stop and ask the user if they
> want to commit, stash, or abort before continuing.

## Workflow

Run these steps in order. Do not skip the user confirmation step.

### 1. Discover the last release

```bash
cd /Users/moroneyt/Documents/AutoSubsV3
git fetch --tags
git describe --tags --abbrev=0
```

Record this tag as `LAST_TAG` (e.g. `v3.6.2`).

### 2. Collect changes since the last release

Run these commands to get commits for analysis:

```bash
git log ${LAST_TAG}..HEAD --oneline
git log ${LAST_TAG}..HEAD --pretty=format:"%h %s%n%b" --no-merges
```

Also read the shortlog to see who contributed:

```bash
git shortlog ${LAST_TAG}..HEAD --no-merges
```

Check whether the Fusion caption macro has changed since the last release:

```bash
git diff --name-only ${LAST_TAG}..HEAD -- Resolve-Integration/autosubs-macro.setting
```

If that command prints `Resolve-Integration/autosubs-macro.setting`, make an explicit note that `autosubs-macro.setting` has changed. Advise the user to open a project in DaVinci Resolve and run **AutoSubs - Update Caption Template** from the **Workspace -> Scripts** menu to regenerate `AutoSubs-App/src-tauri/resources/caption-bin.drb` before finalizing the release. (The script is generated there by `AutoSubs-App/scripts/setup-resolve-dev.js` with your checkout path baked in.)

### 3. Write user-facing release notes

Analyze the commits and rewrite them for **end users** of AutoSubs (video
editors, subtitlers, Resolve/Premiere users), not for developers. Focus on the
user-visible impact. Remove or collapse internal refactors, dependency bumps,
test-only changes, and code cleanups unless they fix a user-facing bug.

Use this exact structure:

```markdown
## What's New
- New feature or capability and why it helps the user.

## Improvements
- UX, performance, or quality-of-life improvements.

## Bug Fixes
- Fixes for crashes, incorrect behavior, or workflow blockers.
```

**Writing rules:**
- Start each bullet with a verb in the present tense (`Added`, `Improved`,
  `Fixed`, `Reduced`, `Updated`).
- Explain the benefit, not the implementation.
  - Bad: `refactor(settings): migrate SettingsContext to Zustand store`
  - Good: `Improved settings responsiveness and fixed a brief language flash on
    startup`
- Keep bullets concise (one sentence preferred).
- Group related changes under one bullet.
- If a change only affects developers or internal architecture, omit it.
- If there are no changes in a section, remove the section header.

### 4. Recommend a semantic version bump

Apply these rules to the commits and pick the highest matching level:

| Level | When to use | Examples |
|-------|-------------|----------|
| **major** | Breaking change that requires user action, drops OS support, changes project file formats, or removes a feature users depend on. | Dropping macOS 13 support, changing subtitle file format, removing an engine |
| **minor** | New user-facing feature, significant UX improvement, new integration, or large addition that users would notice in the app. | New transcription engine, new animation, redesigned settings, new editor integration |
| **patch** | Bug fixes, small tweaks, performance improvements, crash fixes, or minor polish. | Fix model download stall, fix UI overflow, fix Resolve bin import |

Compute the recommended version from `AutoSubs-App/package.json`:
- If current version is `3.6.2` and recommended is **patch** → `3.6.3`
- If current version is `3.6.2` and recommended is **minor** → `3.7.0`
- If current version is `3.6.2` and recommended is **major** → `4.0.0`

### 5. Ask the user for confirmation

Use the ask_user_question tool to present the recommendation and options.
Show the draft release notes first, then ask the version question.

**Question header:** `Release version`

**Question text:**

> Based on the changes since `${LAST_TAG}`, I recommend a **{recommended}**
> release to **v{recommendedVersion}**.
>
> Current version: {currentVersion}
>
> {brief reason for recommendation}

**Options:**
- `{recommendedVersion} ({recommended})` (the recommended option)
- `{otherPatchVersion} (patch)`
- `{otherMinorVersion} (minor)`
- `{otherMajorVersion} (major)`
- `Other` (free text for a custom version)

If the user selects `Other`, validate that it is a valid semver string
(`\d+\.\d+\.\d+`). If not, ask again.

### 6. Bump the version

Once the user confirms the version `NEW_VERSION` (without the leading `v`):

```bash
cd /Users/moroneyt/Documents/AutoSubsV3/AutoSubs-App
npm run bump-version {bump-type-or-version}
```

The `bump-version` script accepts:
- `patch`, `minor`, `major`
- an exact version like `3.7.0`
- no argument (syncs from `package.json` to other files)

This updates:
- `package.json`
- `package-lock.json`
- `src-tauri/Cargo.toml`
- `src-tauri/tauri.conf.json`
- `src-tauri/Cargo.lock`

Verify the files were updated by checking the version strings in those files.

### 7. Commit and tag

Commit all version changes together:

```bash
cd /Users/moroneyt/Documents/AutoSubsV3
git add -A
git commit -m "chore(release): bump version to v${NEW_VERSION}"
git tag "v${NEW_VERSION}"
git push origin HEAD
git push origin "v${NEW_VERSION}"
```

Use the current branch name in place of `HEAD` if needed.

### 8. Create a draft GitHub release

Create the release with the generated notes:

```bash
gh release create "v${NEW_VERSION}" \
  --draft \
  --prerelease \
  --title "AutoSubs v${NEW_VERSION}" \
  --notes-file release-notes.md
```

If you stored the release notes in a different file, adjust the path.

### 9. Trigger the Mac/Linux packaging workflow

```bash
gh workflow run package.yml \
  --repo tmoroney/auto-subs \
  -f tag="v${NEW_VERSION}"
```

### 10. Tell the user what is left

After the draft release is created and the workflow is running, tell the user:
- The draft release URL.
- That the Mac and Linux builds are running in GitHub Actions.
- That they still need to build Windows locally and upload the artifacts (or,
  if a Windows CI job exists, that it will run separately).

Provide the exact Windows commands they need:

```powershell
# On the Windows laptop:
git fetch --tags
git checkout v${NEW_VERSION}
cd AutoSubs-App
npm run build:win
.\scripts\upload-windows-artifacts.ps1 v${NEW_VERSION}
```

If `upload-windows-artifacts.ps1` does not exist, tell the user to upload
`AutoSubs_${NEW_VERSION}_x64-setup.exe` and its `.sig` file manually, renaming
them to `AutoSubs-windows-x86_64.exe` and `AutoSubs-windows-x86_64.exe.sig`.

## Common gotchas

- **No tags yet:** If `git describe --tags --abbrev=0` fails, there are no
  tags. Ask the user for the starting version or use the first commit as the
  baseline.
- **No commits since last tag:** If the log is empty, there is nothing to
  release. Stop and tell the user.
- **Working tree not clean:** Ask the user to commit or stash before bumping.
- **Version already exists:** If the tag `v${NEW_VERSION}` already exists, stop
  and ask the user whether to overwrite or pick a different version.
- **Release already exists:** If `gh release create` fails because the release
  exists, use `gh release edit` to update the notes instead.

## Example

**User:** "prepare for release"

**Agent flow:**
1. Run `git describe --tags --abbrev=0` → `v3.6.2`
2. Run `git log v3.6.2..HEAD --oneline` and analyze commits.
3. Draft release notes in the user-facing format.
4. Recommend `minor` → `3.7.0`.
5. Ask the user to confirm.
6. User selects `3.7.0 (minor)`.
7. Run `npm run bump-version minor` in `AutoSubs-App/`.
8. Commit, tag `v3.7.0`, and push.
9. Create draft GitHub release.
10. Trigger `package.yml` and report status to the user.
