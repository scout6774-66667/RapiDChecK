"""
Root forwarding entrypoint for generate_golden_vectors_report.py.
Organized location: scripts/validation/generate_golden_vectors_report.py
"""
import os
import runpy

target = os.path.join(os.path.dirname(os.path.abspath(__file__)), "scripts", "validation", "generate_golden_vectors_report.py")
runpy.run_path(target, run_name="__main__")
