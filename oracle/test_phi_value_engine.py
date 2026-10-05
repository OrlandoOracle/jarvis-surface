#!/usr/bin/env python3
"""Tests for phi-value-engine (jarvis-phi-oracle Unit 2).

The load-bearing assertion of this whole unit: raw values land in the out-file and
NEVER appear on the engine's stdout (the only surface a Claude tool result sees). Every
other test guards a fail-closed refusal.

Synthetic PHI is constructed at runtime (never a literal in source) so this file does
not itself carry an identifier shape and reads as deliberately fake.
"""
import contextlib
import importlib.machinery
import importlib.util
import io
import json
import os
import stat
import tempfile
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
_loader = importlib.machinery.SourceFileLoader("phi_value_engine",
                                               os.path.join(HERE, "phi-value-engine"))
_spec = importlib.util.spec_from_loader("phi_value_engine", _loader)
eng = importlib.util.module_from_spec(_spec)
_loader.exec_module(eng)

TEST_HOST = "testhost-phi"
# A fake phone, built from parts so no literal phone shape appears in this source.
FAKE_PHONE = "%03d-%03d-%04d" % (407, 555, 142)
FAKE_ROW = f"Jane Doe {FAKE_PHONE}"

# Fixture command: prints two clean rows + (optionally) the dirty row from PHI_ARG_dirty.
# The trailing "{{SEB_SCOPE}}" argv element satisfies the scope assertion; the fixture
# ignores it (it arrives as sys.argv[1] of the -c program).
FIXTURE_PY = (
    "import os;"
    "print('clean-row-alpha');"
    "print('clean-row-beta');"
    "d=os.environ.get('PHI_ARG_dirty');"
    "print(d) if d else None"
)


def write_registry(tmp, scope_sql="assignedTo='SEBID'", scoped=True, cmd=None):
    if cmd is None:
        cmd = ["python3", "-c", FIXTURE_PY]
        if scoped:
            cmd.append("{{SEB_SCOPE}}")
    reg = {
        "phi_host": [TEST_HOST],
        "scope_token": "{{SEB_SCOPE}}",
        "scope_sql": scope_sql,
        "results_dir": os.path.join(tmp, "results"),
        "queries": {"fixture": {"cmd": cmd, "columns": ["a", "b"], "summary": "count"}},
    }
    path = os.path.join(tmp, "queries.json")
    with open(path, "w") as f:
        json.dump(reg, f)
    return path


def run(argv, host=TEST_HOST):
    """Invoke the engine; return (exit_code, parsed_stdout_json, raw_stdout)."""
    old = os.environ.get("PHI_ENGINE_HOST")
    if host is None:
        os.environ.pop("PHI_ENGINE_HOST", None)
    else:
        os.environ["PHI_ENGINE_HOST"] = host
    buf = io.StringIO()
    try:
        with contextlib.redirect_stdout(buf):
            code = eng.main(argv)
    finally:
        if old is None:
            os.environ.pop("PHI_ENGINE_HOST", None)
        else:
            os.environ["PHI_ENGINE_HOST"] = old
    raw = buf.getvalue()
    try:
        parsed = json.loads(raw)
    except Exception:
        parsed = None
    return code, parsed, raw


class HostGuard(unittest.TestCase):
    def test_refuses_on_non_phi_host(self):
        with tempfile.TemporaryDirectory() as d:
            reg = write_registry(d)
            code, out, _ = run(["run", "--query", "fixture", "--config", reg],
                               host="some-random-laptop")
            self.assertEqual(code, 4)
            self.assertTrue(out["refused"])

    def test_runs_on_designated_host(self):
        with tempfile.TemporaryDirectory() as d:
            reg = write_registry(d)
            code, out, _ = run(["run", "--query", "fixture", "--config", reg])
            self.assertEqual(code, 0)
            self.assertTrue(out["ok"])


class Refusals(unittest.TestCase):
    def test_unknown_query(self):
        with tempfile.TemporaryDirectory() as d:
            reg = write_registry(d)
            code, out, _ = run(["run", "--query", "nope", "--config", reg])
            self.assertEqual(code, 3)
            self.assertTrue(out["refused"])

    def test_unscoped_query_refused(self):
        with tempfile.TemporaryDirectory() as d:
            reg = write_registry(d, scoped=False)   # cmd lacks the scope token
            code, out, _ = run(["run", "--query", "fixture", "--config", reg])
            self.assertEqual(code, 5)

    def test_scope_not_wired_refused(self):
        with tempfile.TemporaryDirectory() as d:
            reg = write_registry(d, scope_sql=None)  # token present, no clause
            code, out, _ = run(["run", "--query", "fixture", "--config", reg])
            self.assertEqual(code, 6)

    def test_shipped_registry_is_parked(self):
        # The real queries.json must refuse (scope_sql null) so nothing runs by guess.
        code, out, _ = run(["run", "--query", "my-leads-count",
                             "--config", os.path.join(HERE, "queries.json")],
                            host="sebastian-gerhardt-B550M-AORUS-PRO-P")
        self.assertEqual(code, 6)


class Isolation(unittest.TestCase):
    """The reason the unit exists: values go to the file, never to stdout."""

    def test_raw_values_reach_the_out_file(self):
        with tempfile.TemporaryDirectory() as d:
            reg = write_registry(d)
            code, out, _ = run(["run", "--query", "fixture", "--config", reg,
                                "--arg", f"dirty={FAKE_ROW}"])
            self.assertEqual(code, 0)
            with open(out["out_file"]) as f:
                body = f.read()
            self.assertIn(FAKE_PHONE, body)      # the raw value IS on Oracle disk

    def test_raw_values_never_reach_stdout(self):
        with tempfile.TemporaryDirectory() as d:
            reg = write_registry(d)
            code, out, raw = run(["run", "--query", "fixture", "--config", reg,
                                  "--arg", f"dirty={FAKE_ROW}"])
            self.assertEqual(code, 0)
            self.assertNotIn(FAKE_PHONE, raw)    # ...and NOT in what Claude would see
            self.assertNotIn("Jane Doe", raw)

    def test_rows_counted_without_values(self):
        with tempfile.TemporaryDirectory() as d:
            reg = write_registry(d)
            code, out, _ = run(["run", "--query", "fixture", "--config", reg,
                                "--arg", f"dirty={FAKE_ROW}"])
            self.assertEqual(out["rows"], 3)     # two clean + one dirty
            self.assertEqual(out["columns"], ["a", "b"])

    def test_out_file_is_mode_600(self):
        with tempfile.TemporaryDirectory() as d:
            reg = write_registry(d)
            code, out, _ = run(["run", "--query", "fixture", "--config", reg])
            mode = stat.S_IMODE(os.stat(out["out_file"]).st_mode)
            self.assertEqual(mode, 0o600)


class Sample(unittest.TestCase):
    def test_clean_only_sample_drops_dirty_lines(self):
        with tempfile.TemporaryDirectory() as d:
            reg = write_registry(d)
            code, out, raw = run(["run", "--query", "fixture", "--config", reg,
                                  "--arg", f"dirty={FAKE_ROW}", "--sample", "5"])
            self.assertEqual(out["sample_mode"], "clean-only")
            self.assertEqual(out["sample_dropped"], 1)          # the dirty row dropped
            self.assertEqual(sorted(out["sample"]),
                             ["clean-row-alpha", "clean-row-beta"])
            self.assertNotIn(FAKE_PHONE, raw)

    def test_redact_sample_masks_values(self):
        with tempfile.TemporaryDirectory() as d:
            reg = write_registry(d)
            code, out, raw = run(["run", "--query", "fixture", "--config", reg,
                                  "--arg", f"dirty={FAKE_ROW}", "--sample", "5", "--redact"])
            self.assertEqual(out["sample_mode"], "redact")
            self.assertEqual(out["sample_dropped"], 0)
            joined = "\n".join(out["sample"])
            self.assertIn("〈us-phone〉", joined)                # value masked...
            self.assertNotIn(FAKE_PHONE, joined)               # ...not present
            self.assertNotIn(FAKE_PHONE, raw)


if __name__ == "__main__":
    unittest.main(verbosity=2)
