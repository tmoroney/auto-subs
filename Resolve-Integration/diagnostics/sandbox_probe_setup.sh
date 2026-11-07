#!/bin/sh
# Prepares the fixtures sandbox_probe.lua reads (Lua cannot create them itself in
# the sandboxed state), backs up Fusion.prefs and installs the probe into Resolve's
# Utility scripts. Run it with Resolve closed.
#
#   sh sandbox_probe_setup.sh          set up
#   sh sandbox_probe_setup.sh --clean  remove the fixtures and the installed probe
#
# Linux and macOS. Reads Fusion.prefs, never writes it. The backup of the first
# run is kept until --clean.

set -eu

TOKEN="autosubs-probe-7f3a"
# Must match BIG_LINE and BIG_LINES in sandbox_probe.lua.
BIG_LINE='AutoSubs 0123456789 "quoted" back\slash ]] äöü 日本語 Привет'
BIG_LINES=15000

case "$(uname -s)" in
    Darwin)
        SUPPORT="$HOME/Library/Application Support/Blackmagic Design/DaVinci Resolve"
        FIXTURES="$HOME/Library/Application Support/com.autosubs/sandbox-probe"
        ;;
    *)
        SUPPORT="$HOME/.local/share/DaVinciResolve"
        FIXTURES="${XDG_DATA_HOME:-$HOME/.local/share}/com.autosubs/sandbox-probe"
        ;;
esac

SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
INSTALLED="$SUPPORT/Fusion/Scripts/Utility/AutoSubs Sandbox Probe.lua"
PREFS="$SUPPORT/Fusion/Profiles/Default/Fusion.prefs"

if [ "${1:-}" = "--clean" ]; then
    rm -f "$INSTALLED"
    rm -rf "$FIXTURES"
    rm -f "$(dirname "$FIXTURES")/sandbox-probe-Fusion.prefs.backup"
    echo "removed $INSTALLED and $FIXTURES"
    exit 0
fi

# Matched on the path: Resolve renames its main thread to "GUI Thread".
case "$(uname -s)" in
    Darwin) RESOLVE_PROCESS="DaVinci Resolve.app/Contents/MacOS/Resolve" ;;
    *) RESOLVE_PROCESS="/opt/resolve/bin/resolve" ;;
esac
if pgrep -f "$RESOLVE_PROCESS" >/dev/null 2>&1; then
    echo "error: Resolve is running. Close it first, so the prefs backup is current." >&2
    exit 1
fi
if [ ! -f "$PREFS" ]; then
    echo "error: $PREFS not found. Start Resolve once, or adjust the profile name." >&2
    exit 1
fi

# A re-run keeps the first backup: later copies may already hold probe keys.
BACKUP="$(dirname "$FIXTURES")/sandbox-probe-Fusion.prefs.backup"
mkdir -p "$(dirname "$FIXTURES")"
[ -f "$BACKUP" ] || [ ! -f "$FIXTURES/Fusion.prefs.backup" ] || cp "$FIXTURES/Fusion.prefs.backup" "$BACKUP"
[ -f "$BACKUP" ] || cp "$PREFS" "$BACKUP"

rm -rf "$FIXTURES"
mkdir -p "$FIXTURES/dirlist" "$FIXTURES/dirlist_1000"

cp "$BACKUP" "$FIXTURES/Fusion.prefs.backup"

# full.prefs is the real file plus one marker, so loading it is safe whether
# LoadPrefs merges or replaces. Anchored on the first line of the Global section.
# A probe run leaves an emptied Global.AutoSubsProbe table behind; it is dropped,
# because a second table later in Global would win over the inserted marker.
awk -v token="$TOKEN" '
    skip {
        if (/^\t\t\}/) skip = 0
        next
    }
    /^\tGlobal = \{/ { in_global = 1 }
    in_global && /^\t\}/ { in_global = 0 }
    in_global && /^\t\tAutoSubsProbe = \{/ {
        if (!/\},?[ \t\r]*$/) skip = 1
        next
    }
    !done && /^\tGlobal = \{/ {
        print
        print "\t\tAutoSubsProbe = {"
        print "\t\t\tFullMarker = \"" token "\""
        print "\t\t},"
        done = 1
        next
    }
    { print }
' "$PREFS" > "$FIXTURES/full.prefs"
if ! grep -q "FullMarker" "$FIXTURES/full.prefs"; then
    echo "error: no Global section found in $PREFS" >&2
    exit 1
fi

cat > "$FIXTURES/minimal.prefs" <<EOF
{
	Global = {
		AutoSubsProbe = {
			Marker = "$TOKEN"
		}
	}
}
EOF

printf '%s\nsecond line\n' "$TOKEN" > "$FIXTURES/plain.txt"
yes "$BIG_LINE" | head -n "$BIG_LINES" > "$FIXTURES/big.txt"
{ tr -d '\n' < "$FIXTURES/big.txt"; echo; } > "$FIXTURES/oneline.txt"

cat > "$FIXTURES/runscript_marker.lua" <<'EOF'
local f = rawget(_G, "fusion") or rawget(_G, "fu") or bmd.scriptapp("Fusion")
AUTOSUBS_PROBE_GLOBAL = "set by RunScript"
local state = {}
for _, name in ipairs({ "fu", "fusion", "comp", "bmd", "resolve", "io", "loadfile", "load", "loadstring" }) do
    state[#state + 1] = name .. "=" .. type(rawget(_G, name))
end
f:SetData("AutoSubsProbe.RunScript", "set by RunScript")
state[#state + 1] = "SavePrefs=" .. type(f.SavePrefs)
f:SetPrefs("Global.AutoSubsProbe.RunScript", table.concat(state, " "))
EOF

echo '-- Does nothing, so that only the end of a RunScript can flush prefs.' > "$FIXTURES/runscript_noop.lua"

{
    echo 'local payload = [==['
    cat "$FIXTURES/big.txt"
    echo ']==]'
    cat <<'EOF'
local f = rawget(_G, "fusion") or rawget(_G, "fu") or bmd.scriptapp("Fusion")
AUTOSUBS_PROBE_BIG = payload
f:SetData("AutoSubsProbe.Big", payload)
f:SetPrefs("Global.AutoSubsProbe.Big", payload)
f:SetPrefs("Global.AutoSubsProbe.BigDone", tostring(#payload))
EOF
} > "$FIXTURES/runscript_big.lua"

cat > "$FIXTURES/marker.setting" <<EOF
{
	Tools = ordered() {
		ProbeBackground = Background {
			CustomData = { Marker = "$TOKEN" },
		},
	},
	ActiveTool = "ProbeBackground"
}
EOF

cat > "$FIXTURES/marker.comp" <<EOF
Composition {
	CurrentTime = 0,
	CustomData = { Marker = "$TOKEN" },
	Tools = ordered() {
	},
}
EOF

# Names sized for the name-as-data case: a Rust side would need close to 255 bytes.
LONG_NAME="$(printf 'a%.0s' $(seq 1 240))"
mkdir "$FIXTURES/dirlist/folder-$LONG_NAME"
: > "$FIXTURES/dirlist/plain-file.txt"
: > "$FIXTURES/dirlist/media-file.wav"
i=0
while [ "$i" -lt 1000 ]; do
    mkdir "$FIXTURES/dirlist_1000/$(printf '%04d' "$i")-$LONG_NAME"
    i=$((i + 1))
done

mkdir -p "$(dirname "$INSTALLED")"
cp "$SCRIPT_DIR/sandbox_probe.lua" "$INSTALLED"

echo "fixtures:  $FIXTURES"
echo "backup:    $FIXTURES/Fusion.prefs.backup"
echo "installed: $INSTALLED"
