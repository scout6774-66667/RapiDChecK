"""
Root forwarding entrypoint for generate_sync_validation_report.py.
Organized location: scripts/validation/generate_sync_validation_report.py
"""
import os
import runpy

target = os.path.join(os.path.dirname(os.path.abspath(__file__)), "scripts", "validation", "generate_sync_validation_report.py")
runpy.run_path(target, run_name="__main__")
