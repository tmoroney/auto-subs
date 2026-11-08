#!/usr/bin/env python3
"""CI-only macOS credentials: passwords travel over stdin/TTY, never argv."""

import os
import pty
import re
import select
import signal
import shlex
import subprocess
import sys
import termios
import time


def quote(value):
    """Quote security(1)'s line protocol, refusing command separators."""
    if any(c in value for c in "\r\n\x00"):
        raise ValueError("Keychain input contains a forbidden line separator")
    return '"' + value.replace("\\", "\\\\").replace('"', '\\"') + '"'


def child_env():
    return {k: v for k, v in os.environ.items() if k not in {
        "KEYCHAIN_PASSWORD", "P12_PASSWORD", "APPLE_APP_PASSWORD",
        "BUILD_CERTIFICATE_BASE64", "BUILD_CERT_BASE64", "SIGNING_CERTIFICATE_P12",
        "SIGNING_CERTIFICATE_PASSWORD", "P12_PWD", "KEYCHAIN_PWD",
        "NOTARY_APP_PASSWORD", "APP_CERTIFICATE_PASSWORD", "INSTALLER_CERTIFICATE_PASSWORD",
        "TAURI_SIGNING_PRIVATE_KEY", "TAURI_SIGNING_PRIVATE_KEY_PASSWORD",
    }}


def security(*args):
    # One command per invocation: propagate its exit status and never log input.
    line = " ".join(quote(a) for a in args) + "\n"
    result = subprocess.run(
        ["/usr/bin/security", "-i"], input=line, text=True,
        capture_output=True, env=child_env(), check=False,
    )
    # One command per interpreter. Also fail on its explicit status diagnostic,
    # even on OS versions where the interpreter's exit status may differ.
    failed = re.search(r"returned\s+(-?\d+)", result.stderr or "")
    if result.returncode or (failed and int(failed.group(1)) != 0):
        raise RuntimeError("Keychain operation failed (output withheld)")


def import_certificate():
    keychain = os.environ["KEYCHAIN_PATH"]
    password = os.environ["KEYCHAIN_PASSWORD"]
    security("create-keychain", "-p", password, keychain)
    security("set-keychain-settings", "-lut", "21600", keychain)
    security("unlock-keychain", "-p", password, keychain)
    security("import", os.environ["CERTIFICATE_PATH"], "-P",
             os.environ["P12_PASSWORD"], "-T", "/usr/bin/codesign", "-k", keychain)
    security("set-key-partition-list", "-S", "apple-tool:,apple:,codesign:",
             "-s", "-k", password, keychain)
    current = subprocess.run(["/usr/bin/security", "list-keychains", "-d", "user"],
                             capture_output=True, text=True, env=child_env(), check=True)
    search = shlex.split(current.stdout)
    if keychain not in search:
        search.append(keychain)
    security("list-keychains", "-d", "user", "-s", *search)


def store_notary_credentials():
    # notarytool documents a secure prompt when --password is omitted. Give it
    # a real TTY (getpass can use /dev/tty), with echo disabled before spawning.
    password = os.environ["APPLE_APP_PASSWORD"]
    quote(password)  # Refuse multiline input before interacting with a prompt.
    command = ["xcrun", "notarytool", "store-credentials", "ci-notary",
               "--apple-id", os.environ["APPLE_ID"], "--team-id",
               os.environ["APPLE_TEAM_ID"], "--keychain", os.environ["KEYCHAIN_PATH"]]
    pid, master = pty.fork()
    if pid == 0:
        attrs = termios.tcgetattr(0)
        attrs[3] &= ~termios.ECHO
        termios.tcsetattr(0, termios.TCSANOW, attrs)
        # Fixed notarytool command; no shell or secret-bearing argument.
        os.execvpe(command[0], command, child_env())  # noqa: S606
    output = b""
    sent = False
    status = None
    deadline = time.monotonic() + 120
    try:
        while status is None:
            done, child_status = os.waitpid(pid, os.WNOHANG)
            if done:
                status = child_status
                break
            if time.monotonic() > deadline:
                raise RuntimeError("Notary credential prompt timed out")
            if select.select([master], [], [], 0.1)[0]:
                try:
                    chunk = os.read(master, 4096)
                except OSError:
                    continue
                output = (output + chunk)[-8192:]
                if not sent and re.search(rb"password[^\r\n]*:\s*$", output.lower()):
                    os.write(master, (password + "\n").encode())
                    sent = True
        if os.waitstatus_to_exitcode(status) != 0 or not sent:
            raise RuntimeError("Notary credential setup failed (output withheld)")
    finally:
        if status is None:
            os.kill(pid, signal.SIGKILL)
            os.waitpid(pid, 0)
        os.close(master)


if __name__ == "__main__":
    if sys.argv[1:] == ["import-certificate"]:
        import_certificate()
    elif sys.argv[1:] == ["import-additional-certificate"]:
        security("import", os.environ["CERTIFICATE_PATH"], "-P", os.environ["P12_PASSWORD"],
                 "-T", "/usr/bin/productsign", "-k", os.environ["KEYCHAIN_PATH"])
        security("set-key-partition-list", "-S", "apple-tool:,apple:,codesign:", "-s", "-k",
                 os.environ["KEYCHAIN_PASSWORD"], os.environ["KEYCHAIN_PATH"])
    elif sys.argv[1:] == ["store-notary-credentials"]:
        store_notary_credentials()
    else:
        raise SystemExit("Expected import-certificate or store-notary-credentials")
