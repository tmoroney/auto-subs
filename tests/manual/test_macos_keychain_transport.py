"""Run explicitly on a disposable macOS runner; no Apple account or real secrets."""

import importlib.util
import os
import subprocess
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[2]
SPEC = importlib.util.spec_from_file_location(
    "macos_ci_credentials", ROOT / "scripts/macos_ci_credentials.py",
)
HELPER = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(HELPER)


def checked(condition):
    if not condition:
        raise AssertionError("Native keychain smoke check failed")


class NativeKeychainTransportTests(unittest.TestCase):
    def test_command_failure_is_not_success(self):
        with tempfile.TemporaryDirectory(prefix="missing keychain ") as directory:
            missing = str(Path(directory) / "does-not-exist.keychain-db")
            with self.assertRaisesRegex(RuntimeError, "output withheld"):
                HELPER.security("unlock-keychain", "-p", "dummy-not-a-secret", missing)

    def test_create_unlock_import_partition_and_delete(self):
        with tempfile.TemporaryDirectory(prefix="auto-subs signing smoke ") as directory:
            folder = Path(directory)
            keychain = folder / 'transport "quoted" \\ keychain-db'
            key = folder / "test.key"
            cert = folder / "test.crt"
            bundle = folder / "test.p12"
            password_file = folder / "test-password"
            value = 'dummy "quotes" \\ backslash $value'
            password_file.write_text(value)
            password_file.chmod(0o600)
            env = {"KEYCHAIN_PATH": str(keychain), "CERTIFICATE_PATH": str(bundle),
                   "KEYCHAIN_PASSWORD": value, "P12_PASSWORD": value}
            # Only a throwaway, self-signed identity. Its passphrase is dummy data.
            subprocess.run(  # noqa: S603 - fixed executable, generated fixture paths only
                ["/usr/bin/openssl", "req", "-x509", "-newkey", "rsa:2048",
                 "-nodes", "-keyout", str(key), "-out", str(cert), "-days", "1",
                 "-subj", "/CN=auto-subs transport smoke test"],
                capture_output=True, check=True,
            )
            subprocess.run(  # noqa: S603 - fixed executable, generated fixture paths only
                ["/usr/bin/openssl", "pkcs12", "-export", "-inkey", str(key),
                 "-in", str(cert), "-out", str(bundle), "-passout",
                 "file:" + str(password_file)], capture_output=True, check=True,
            )
            try:
                with patch.dict(os.environ, env):
                    HELPER.import_certificate()
                result = subprocess.run(  # noqa: S603 - fixed certificate lookup
                    ["/usr/bin/security", "find-certificate", "-c",
                     "auto-subs transport smoke test", str(keychain)],
                    capture_output=True, check=True,
                )
                checked(b"auto-subs transport smoke test" in result.stdout)
                # Prove the password was not silently truncated by -i quoting.
                HELPER.security("lock-keychain", str(keychain))
                HELPER.security("unlock-keychain", "-p", value, str(keychain))
            finally:
                HELPER.security("delete-keychain", str(keychain))


if __name__ == "__main__":
    unittest.main()
