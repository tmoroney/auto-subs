"""Run explicitly on a disposable macOS runner; no Apple account or real secrets."""

import importlib.util
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[2]
SPEC = importlib.util.spec_from_file_location(
    "macos_ci_credentials",
    ROOT / "scripts/macos_ci_credentials.py",
)
HELPER = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(HELPER)


def checked(condition):
    if not condition:
        raise AssertionError("Native keychain smoke check failed")


@unittest.skipUnless(
    sys.platform == "darwin", "requires macOS keychain; CI has a dedicated native job"
)
class NativeKeychainTransportTests(unittest.TestCase):
    def test_command_failure_is_not_success(self):
        with tempfile.TemporaryDirectory(prefix="missing keychain ") as directory:
            missing = str(Path(directory) / "does-not-exist.keychain-db")
            with self.assertRaisesRegex(RuntimeError, "output withheld"):
                HELPER.security("unlock-keychain", "-p", "dummy-not-a-secret", missing)

    def test_notary_private_tty_prompt(self):
        with tempfile.TemporaryDirectory(prefix="notary prompt smoke ") as directory:
            folder = Path(directory).resolve()
            executable = folder / "xcrun"
            marker = folder / "passed"
            executable.write_text(
                "#!/usr/bin/env python3\n"
                "import getpass, os, pathlib, sys, termios\n"
                'if "--password" in sys.argv or "APPLE_APP_PASSWORD" in os.environ: raise SystemExit(4)\n'
                "if termios.tcgetattr(0)[3] & termios.ECHO: raise SystemExit(6)\n"
                'value = getpass.getpass("App-specific password: ")\n'
                'if value != "dummy-apple": raise SystemExit(5)\n'
                'pathlib.Path(os.environ["TEST_MARKER"]).write_text("passed")\n'
            )
            executable.chmod(0o700)
            env = {
                "PATH": str(folder) + os.pathsep + os.environ["PATH"],
                "APPLE_APP_PASSWORD": "dummy-apple",
                "APPLE_ID": "test@example.invalid",
                "APPLE_TEAM_ID": "DUMMYTEAM",
                "KEYCHAIN_PATH": str(folder / "dummy"),
                "TEST_MARKER": str(marker),
            }
            with patch.dict(os.environ, env):
                HELPER.store_notary_credentials()
            checked(marker.read_text() == "passed")

    def test_create_unlock_import_partition_and_delete(self):
        with tempfile.TemporaryDirectory(
            prefix="auto-subs signing smoke "
        ) as directory:
            folder = Path(directory).resolve()
            keychain = folder / 'transport "quoted" \\ keychain.keychain-db'
            key = folder / "test.key"
            cert = folder / "test.crt"
            bundle = folder / "test.p12"
            password_file = folder / "test-password"
            value = 'dummy "quotes" \\ backslash $value'
            password_file.write_text(value)
            password_file.chmod(0o600)
            env = {
                "KEYCHAIN_PATH": str(keychain),
                "CERTIFICATE_PATH": str(bundle),
                "KEYCHAIN_PASSWORD": value,
                "P12_PASSWORD": value,
            }
            # Only a throwaway, self-signed identity. Its passphrase is dummy data.
            subprocess.run(
                [
                    "/usr/bin/openssl",
                    "req",
                    "-x509",
                    "-newkey",
                    "rsa:2048",
                    "-nodes",
                    "-keyout",
                    str(key),
                    "-out",
                    str(cert),
                    "-days",
                    "1",
                    "-subj",
                    "/CN=auto-subs transport smoke test",
                ],
                capture_output=True,
                check=True,
            )
            subprocess.run(
                [
                    "/usr/bin/openssl",
                    "pkcs12",
                    "-export",
                    "-inkey",
                    str(key),
                    "-in",
                    str(cert),
                    "-out",
                    str(bundle),
                    "-passout",
                    "file:" + str(password_file),
                ],
                capture_output=True,
                check=True,
            )
            original_result = subprocess.run(
                ["/usr/bin/security", "list-keychains", "-d", "user"],
                capture_output=True,
                text=True,
                check=True,
            )
            original = HELPER.parse_keychain_list(original_result.stdout)
            try:
                with patch.dict(os.environ, env):
                    HELPER.import_certificate()
                result = subprocess.run(
                    [
                        "/usr/bin/security",
                        "find-certificate",
                        "-c",
                        "auto-subs transport smoke test",
                        str(keychain),
                    ],
                    capture_output=True,
                    check=True,
                )
                checked(b"auto-subs transport smoke test" in result.stdout)
                current_result = subprocess.run(
                    ["/usr/bin/security", "list-keychains", "-d", "user"],
                    capture_output=True,
                    text=True,
                    check=True,
                )
                current = HELPER.parse_keychain_list(current_result.stdout)
                self.assertIn(str(keychain.resolve()), current)
                checked(set(original).issubset(current))
                # Prove the password was not silently truncated by -i quoting.
                HELPER.security("lock-keychain", str(keychain))
                HELPER.security("unlock-keychain", "-p", value, str(keychain))
            finally:
                HELPER.security("delete-keychain", str(keychain))


if __name__ == "__main__":
    unittest.main()
