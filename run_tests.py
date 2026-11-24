"""Runs every test, one after the other, and says at the end which ones failed.
Run with:  .venv\\Scripts\\python.exe run_tests.py"""
import os, subprocess, sys
from pathlib import Path

HERE = Path(__file__).parent
sys.stdout.reconfigure(encoding="utf-8")  # the tests print emoji; a plain Windows window would choke on them
TESTS = ["test_content.py", "test_practice.py", "test_schedule.py", "test_place.py", "test_ui_text.py", "test_pdfs.py"]
GOOD = ("All content checks passed.", "All checks passed.", "All good:", "All texts are translated.",
        "All PDFs made without problems.", "ReportLab is not installed")  # the last line of a passing test

failed = []
for test in TESTS:
    print(f"---------- {test}")
    run = subprocess.run([sys.executable, str(HERE / test)], capture_output=True, text=True, encoding="utf-8",
                         cwd=HERE, env={**os.environ, "PYTHONIOENCODING": "utf-8"})  # so emoji print everywhere
    output = (run.stdout + run.stderr).strip()
    lines = [line for line in output.splitlines() if "MemoryCacheStorageManager" not in line]
    print("\n".join(lines[-8:]))  # the end of each test is enough; run it alone to see everything
    if run.returncode != 0 or not lines or not lines[-1].startswith(GOOD):
        failed.append(test)
print("==========")
print("FAILED: " + ", ".join(failed) if failed else "Every test passed.")
sys.exit(1 if failed else 0)
