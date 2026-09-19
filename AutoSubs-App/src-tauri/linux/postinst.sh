#!/bin/sh
# deb/rpm post-install hook. AutoSubs 3.10.0 wrote a startup scriptlib into
# each user's Resolve Scripts folder; it runs the bridge via fusion:Execute and
# breaks Fusion's scripted controls for the whole Resolve session. The package
# upgrade only removes the /opt copy it owned, so delete the per-user copies
# here too — otherwise Resolve runs the stale one until the new app is opened.
# Only this exact file is touched. Never fail the install.
getent passwd | while IFS=: read -r _ _ _ _ _ home _; do
    [ -n "$home" ] || continue
    rm -f "$home/.local/share/DaVinciResolve/Fusion/Scripts/AutoSubs.scriptlib" 2>/dev/null
done
exit 0
