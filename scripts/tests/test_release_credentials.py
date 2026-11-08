"""Release credential transport contract; synthetic data only."""

import importlib.util
import os
import subprocess
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[2]
SPEC = importlib.util.spec_from_file_location(
    "credentials", ROOT / "scripts/macos_ci_credentials.py"
)
HELPER = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(HELPER)


class CredentialTests(unittest.TestCase):
    def test_password_only_in_stdin(self):
        value = 'dummy "quotes" backslash \\ $value'
        with (
            patch.dict(os.environ, {"P12_PASSWORD": value}),
            patch.object(
                HELPER.subprocess,
                "run",
                return_value=subprocess.CompletedProcess([], 0),
            ) as run,
        ):
            HELPER.security("import", "dummy.p12", "-P", value)
        self.assertEqual(run.call_args.args[0], ["/usr/bin/security", "-i"])
        self.assertNotIn(value, str(run.call_args.args))
        self.assertNotIn("P12_PASSWORD", run.call_args.kwargs["env"])
        self.assertIn('\\"quotes\\"', run.call_args.kwargs["input"])

    def test_interactive_status_failure_is_rejected(self):
        with patch.object(
            HELPER.subprocess,
            "run",
            return_value=subprocess.CompletedProcess(
                [], 0, "", "unlock-keychain: returned -25291"
            ),
        ), self.assertRaisesRegex(RuntimeError, "output withheld"):
            HELPER.security("unlock-keychain", "-p", "dummy", "missing")

    def test_keychain_list_preserves_literal_quotes_and_backslashes(self):
        path = '/tmp/a "quoted" \\ keychain'
        self.assertEqual(HELPER.parse_keychain_list('    "' + path + '"\n'), [path])
        for bad in ["not a quoted path", '"relative"', '"/tmp/path" garbage']:
            with self.assertRaises(RuntimeError):
                HELPER.parse_keychain_list(bad)

    def test_unicode_keychain_path(self):
        path = "/tmp/a\u2028b\u0085keychain"
        self.assertEqual(HELPER.parse_keychain_list('    "' + path + '"\n'), [path])

    def test_success_status_diagnostic(self):
        with patch.object(
            HELPER.subprocess,
            "run",
            return_value=subprocess.CompletedProcess(
                [], 0, "", "set-keychain-settings: returned 0"
            ),
        ):
            HELPER.security("set-keychain-settings", "-lut", "21600", "dummy")

    def test_refuse_line_separators(self):
        for value in ["a\nb", "a\rb", "a\0b"]:
            with self.assertRaises(ValueError):
                HELPER.quote(value)

    def test_notary_password_uses_private_tty(self):
        with tempfile.TemporaryDirectory() as directory:
            folder = Path(directory)
            executable = folder / "xcrun"
            marker = folder / "passed"
            executable.write_text(
                "#!/usr/bin/env python3\n"
                "import getpass, os, pathlib, sys\n"
                'if "--password" in sys.argv or "APPLE_APP_PASSWORD" in os.environ: raise SystemExit(4)\n'
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
                "KEYCHAIN_PATH": str(folder / "keychain"),
                "TEST_MARKER": str(marker),
            }
            with patch.dict(os.environ, env):
                HELPER.store_notary_credentials()
            self.assertEqual(marker.read_text(), "passed")

    def test_workflow_transport(self):
        workflows = list((ROOT / ".github/workflows").glob("*.y*ml"))
        text = "\n".join(p.read_text() for p in workflows)
        for bad in [
            "security create-keychain -p",
            "security import $",
            'security import "$',
            '--password "$APPLE_APP_PASSWORD"',
        ]:
            self.assertNotIn(bad, text)
        self.assertIn("macos_ci_credentials.py import-certificate", text)
        self.assertIn("Native dummy-keychain transport smoke check", text)
        helper = (ROOT / "scripts/macos_ci_credentials.py").read_text()
        self.assertIn('"/usr/bin/security", "-i"', helper)
        self.assertNotIn('"--password",', helper)


if __name__ == "__main__":
    unittest.main()
