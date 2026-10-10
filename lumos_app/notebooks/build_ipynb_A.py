#!/usr/bin/env python3
"""Convert lumos_A_fetch.py (jupytext percent format) into lumos_A_fetch.ipynb with nbformat.

Usage: python build_ipynb.py [src.py] [out.ipynb]
No jupytext dependency: '# %%' starts a code cell, '# %% [markdown]' a markdown cell
(leading '# ' stripped from markdown lines). Text before the first marker (the jupytext
header) is ignored.
"""
import sys
from pathlib import Path

import nbformat
from nbformat.v4 import new_code_cell, new_markdown_cell, new_notebook

HERE = Path(__file__).resolve().parent


def parse_percent(text: str):
    cells, kind, buf = [], None, []

    def flush():
        if kind is None:
            return
        lines = list(buf)
        while lines and not lines[-1].strip():
            lines.pop()
        while lines and not lines[0].strip():
            lines.pop(0)
        if kind == "markdown":
            lines = [l[2:] if l.startswith("# ") else l[1:] if l.startswith("#") else l for l in lines]
            cells.append(new_markdown_cell("\n".join(lines)))
        elif lines:
            cells.append(new_code_cell("\n".join(lines)))

    for line in text.splitlines():
        if line.startswith("# %%"):
            flush()
            kind = "markdown" if "[markdown]" in line else "code"
            buf = []
        elif kind is not None:
            buf.append(line)
    flush()
    return cells


def build(src: Path, out: Path) -> Path:
    nb = new_notebook(cells=parse_percent(src.read_text(encoding="utf-8")))
    nb.metadata["kernelspec"] = {"display_name": "Python 3", "language": "python", "name": "python3"}
    nb.metadata["language_info"] = {"name": "python"}
    nbformat.validate(nb)
    nbformat.write(nb, str(out))
    print(f"wrote {out} ({len(nb.cells)} cells)")
    return out


if __name__ == "__main__":
    src = Path(sys.argv[1]) if len(sys.argv) > 1 else HERE / "lumos_A_fetch.py"
    out = Path(sys.argv[2]) if len(sys.argv) > 2 else HERE / "lumos_A_fetch.ipynb"
    build(src, out)
