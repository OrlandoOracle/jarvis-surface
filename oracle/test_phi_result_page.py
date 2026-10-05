#!/usr/bin/env python3
"""Tests for phi-result-page (jarvis-phi-oracle Unit 3).

Mirror of the engine's test posture. The load-bearing assertion: the full lead values
land in the written HTML file and NEVER appear on the script's stdout (the only surface
a Claude tool result sees). Every other test guards a fail-closed refusal or the shape
of the one handle that returns — the URL.

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


def _load(name, filename):
    loader = importlib.machinery.SourceFileLoader(name, os.path.join(HERE, filename))
    spec = importlib.util.spec_from_loader(name, loader)
    mod = importlib.util.module_from_spec(spec)
    loader.exec_module(mod)
    return mod


rp = _load("phi_result_page", "phi-result-page")

TEST_HOST = "testhost-phi"
# A fake phone + name, built from parts so no literal identifier shape appears here.
FAKE_PHONE = "%03d-%03d-%04d" % (407, 555, 142)
FAKE_NAME = "Jane Doe"
FAKE_ROW = f"{FAKE_NAME} {FAKE_PHONE}"


def write_config(tmp, served=False):
    cfg = {
        "phi_host": [TEST_HOST],
        "results_dir": os.path.join(tmp, "results"),
        "queries": {
            "my-leads": {"columns": ["name", "phone"], "summary": "list"},
        },
    }
    if served:
        cfg["results_base_url"] = "https://oracle.example.ts.net/phi/"
    path = os.path.join(tmp, "queries.json")
    with open(path, "w") as f:
        json.dump(cfg, f)
    return path


def write_out_file(tmp, lines):
    path = os.path.join(tmp, "engine-out.out")
    with open(path, "w") as f:
        f.write("\n".join(lines) + "\n")
    return path


@contextlib.contextmanager
def phi_host():
    old = os.environ.get("PHI_ENGINE_HOST")
    os.environ["PHI_ENGINE_HOST"] = TEST_HOST
    try:
        yield
    finally:
        if old is None:
            os.environ.pop("PHI_ENGINE_HOST", None)
        else:
            os.environ["PHI_ENGINE_HOST"] = old


def run(argv):
    """Run main(), capturing stdout. Returns (exit_code, stdout_text, parsed_json)."""
    buf = io.StringIO()
    with contextlib.redirect_stdout(buf):
        code = rp.main(argv)
    out = buf.getvalue()
    try:
        parsed = json.loads(out)
    except json.JSONDecodeError:
        parsed = None
    return code, out, parsed


class ResultPageTests(unittest.TestCase):

    def test_values_in_html_never_in_stdout(self):
        """THE load-bearing test: a dirty row (name + phone) must be IN the written HTML
        and NOT anywhere on stdout."""
        with tempfile.TemporaryDirectory() as tmp, phi_host():
            cfg = write_config(tmp)
            out_file = write_out_file(tmp, [FAKE_ROW, f"John Roe {('%03d-%03d-%04d' % (321, 555, 909))}"])
            code, stdout, js = run(["render", "--out-file", out_file,
                                    "--config", cfg, "--query", "my-leads", "--now", "1000"])
            self.assertEqual(code, 0)
            # The value is NOWHERE on stdout.
            self.assertNotIn(FAKE_PHONE, stdout)
            self.assertNotIn(FAKE_NAME, stdout)
            # But it IS in the written HTML file.
            with open(js["out_html"]) as f:
                page = f.read()
            self.assertIn(FAKE_PHONE, page)
            self.assertIn(FAKE_NAME, page)

    def test_out_html_mode_600(self):
        with tempfile.TemporaryDirectory() as tmp, phi_host():
            cfg = write_config(tmp)
            out_file = write_out_file(tmp, [FAKE_ROW])
            _, _, js = run(["render", "--out-file", out_file, "--config", cfg,
                            "--query", "my-leads", "--now", "1000"])
            mode = stat.S_IMODE(os.stat(js["out_html"]).st_mode)
            self.assertEqual(mode, 0o600)

    def test_rows_counted_without_values(self):
        with tempfile.TemporaryDirectory() as tmp, phi_host():
            cfg = write_config(tmp)
            out_file = write_out_file(tmp, [FAKE_ROW, "A|1", "B|2"])
            _, stdout, js = run(["render", "--out-file", out_file, "--config", cfg,
                                 "--query", "my-leads", "--now", "1000"])
            self.assertEqual(js["rows"], 3)
            self.assertIn('"rows": 3', stdout)

    def test_host_guard_refuses_off_oracle(self):
        with tempfile.TemporaryDirectory() as tmp:
            os.environ["PHI_ENGINE_HOST"] = "some-laptop"
            try:
                cfg = write_config(tmp)
                out_file = write_out_file(tmp, [FAKE_ROW])
                code, stdout, js = run(["render", "--out-file", out_file,
                                        "--config", cfg, "--query", "my-leads"])
            finally:
                os.environ.pop("PHI_ENGINE_HOST", None)
            self.assertEqual(code, 4)
            self.assertTrue(js["refused"])
            self.assertNotIn(FAKE_PHONE, stdout)

    def test_missing_out_file_fails_closed(self):
        with tempfile.TemporaryDirectory() as tmp, phi_host():
            cfg = write_config(tmp)
            code, _, js = run(["render", "--out-file", os.path.join(tmp, "nope.out"),
                               "--config", cfg, "--query", "my-leads"])
            self.assertEqual(code, 2)
            self.assertTrue(js["refused"])

    def test_served_url_when_base_url_wired(self):
        with tempfile.TemporaryDirectory() as tmp, phi_host():
            cfg = write_config(tmp, served=True)
            out_file = write_out_file(tmp, [FAKE_ROW])
            _, _, js = run(["render", "--out-file", out_file, "--config", cfg,
                            "--query", "my-leads", "--now", "1000"])
            self.assertTrue(js["served"])
            self.assertTrue(js["url"].startswith("https://oracle.example.ts.net/phi/"))
            self.assertTrue(js["url"].endswith(".html"))

    def test_file_url_when_serving_parked(self):
        with tempfile.TemporaryDirectory() as tmp, phi_host():
            cfg = write_config(tmp)  # no results_base_url
            out_file = write_out_file(tmp, [FAKE_ROW])
            _, _, js = run(["render", "--out-file", out_file, "--config", cfg,
                            "--query", "my-leads", "--now", "1000"])
            self.assertFalse(js["served"])
            self.assertTrue(js["url"].startswith("file://"))

    def test_html_escapes_values(self):
        """A value containing markup must be escaped, not rendered — no injection."""
        with tempfile.TemporaryDirectory() as tmp, phi_host():
            cfg = write_config(tmp)
            out_file = write_out_file(tmp, ["<script>x</script>|1"])
            _, _, js = run(["render", "--out-file", out_file, "--config", cfg,
                            "--query", "my-leads", "--now", "1000"])
            with open(js["out_html"]) as f:
                page = f.read()
            self.assertNotIn("<script>x</script>", page)
            self.assertIn("&lt;script&gt;", page)

    def test_empty_out_file_renders_zero_rows(self):
        with tempfile.TemporaryDirectory() as tmp, phi_host():
            cfg = write_config(tmp)
            out_file = write_out_file(tmp, [""])
            code, _, js = run(["render", "--out-file", out_file, "--config", cfg,
                               "--query", "my-leads", "--now", "1000"])
            self.assertEqual(code, 0)
            self.assertEqual(js["rows"], 0)
            with open(js["out_html"]) as f:
                self.assertIn("(no rows)", f.read())

    def test_columns_override(self):
        with tempfile.TemporaryDirectory() as tmp, phi_host():
            cfg = write_config(tmp)
            out_file = write_out_file(tmp, ["a|b|c"])
            _, _, js = run(["render", "--out-file", out_file, "--config", cfg,
                            "--columns", "x,y,z", "--now", "1000"])
            with open(js["out_html"]) as f:
                page = f.read()
            for h in ("x", "y", "z"):
                self.assertIn(f"<th>{h}</th>", page)


if __name__ == "__main__":
    unittest.main(verbosity=2)
