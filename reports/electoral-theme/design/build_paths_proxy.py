"""Expose the province projection of ../geo/build_paths.py without re-running its main build."""
import importlib.util, os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, "..", "geo", "build_paths.py")
spec = importlib.util.spec_from_file_location("build_paths_src", SRC)
_mod = importlib.util.module_from_spec(spec)
# build_paths.py runs its build at import; that is acceptable (fast) but we silence its prints.
import io, contextlib
with contextlib.redirect_stdout(io.StringIO()):
    spec.loader.exec_module(_mod)
geom_to_path = _mod.geom_to_path
proj = _mod.proj
W, H = _mod.W, _mod.H
