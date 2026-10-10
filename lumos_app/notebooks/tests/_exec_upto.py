"""Helper for test harnesses: exec Notebook B (lumos_B_train.py) cell by cell up to (excluding) the first cell whose header
contains `stop_marker`. Returns the namespace. Marker-based (not line-number based) so it survives edits."""
import os
SRC = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "lumos_B_train.py")

def exec_upto(stop_marker, extra_env=None):
    text = open(SRC, encoding="utf-8").read()
    cells = text.split("\n# %%")
    code = []
    for i, c in enumerate(cells):
        head = c.split("\n", 2)[:2]
        if i > 0 and any(stop_marker in h for h in head): break
        if i == 0 or not c.startswith(" [markdown]"):
            code.append(c if i == 0 else "# %%" + c)
    ns = {"__name__": "__main__"}
    exec(compile("\n".join(code), SRC, "exec"), ns)
    return ns
