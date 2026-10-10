"""Build lumos_B_train.ipynb from the jupytext-style percent script lumos_B_train.py (no jupytext dependency)."""
import sys
from pathlib import Path
import nbformat
from nbformat.v4 import new_notebook, new_code_cell, new_markdown_cell

HERE = Path(__file__).resolve().parent
SRC = HERE / "lumos_B_train.py"
OUT = HERE / "lumos_B_train.ipynb"


def parse_percent(text):
    cells, kind, buf = [], None, []

    def flush():
        if kind is None:
            return
        body = "\n".join(buf).strip("\n")
        if kind == "markdown":
            lines = [l[2:] if l.startswith("# ") else (l[1:] if l.startswith("#") else l) for l in body.split("\n")]
            cells.append(new_markdown_cell("\n".join(lines)))
        elif body.strip():
            cells.append(new_code_cell(body))

    for line in text.split("\n"):
        if line.startswith("# %%"):
            flush()
            kind = "markdown" if "[markdown]" in line else "code"
            buf = []
        else:
            buf.append(line)
    flush()
    return cells


def main():
    nb = new_notebook()
    nb.cells = parse_percent(SRC.read_text(encoding="utf-8"))
    nb.metadata = {
        "kernelspec": {"display_name": "Python 3", "language": "python", "name": "python3"},
        "language_info": {"name": "python"},
        "kaggle": {"accelerator": "gpu", "isInternetEnabled": False, "isGpuEnabled": True},
    }
    nbformat.validate(nb)
    nbformat.write(nb, OUT)
    print(f"wrote {OUT} with {len(nb.cells)} cells")


if __name__ == "__main__":
    sys.exit(main())
