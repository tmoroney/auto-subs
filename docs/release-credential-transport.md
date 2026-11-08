# Release credential transport repair

Signing/keychain passwords must travel over security's stdin, not process
arguments. Apple app passwords enter notarytool through an echo-disabled
private TTY; submissions and logs use a keychain profile. Child environments
omit secret values. Errors do not repeat command input. Dummy-data guards and
an actual disposable macOS keychain smoke check cover the transport.

Scope: workflow/scripts only; no app version, behavior or signing policy change.
No merge, release tag or manual build dispatched. Existing automatic workflows
may run for this PR. Native smoke validation is reported separately from local
synthetic tests. No new artifact/cache write is introduced by the repair.
