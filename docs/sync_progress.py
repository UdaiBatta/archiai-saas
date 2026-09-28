"""Copy the checklists in PROGRESS.md into roadmap.html (the published
roadmap page), so the two never drift. Run after ticking PROGRESS.md:

    python docs/sync_progress.py
"""
import re
from html import escape
from pathlib import Path

DOCS = Path(__file__).parent
md = (DOCS / "PROGRESS.md").read_text(encoding="utf-8")
page = (DOCS / "roadmap.html").read_text(encoding="utf-8")


def phase_id(heading: str) -> str:
    return "P0" if heading.startswith("Foundation") else heading.split(":")[0]


def inline(text: str) -> str:
    return re.sub(r"`([^`]+)`", r'<span class="mono">\1</span>', escape(text))


done_all = total_all = 0
for section in re.split(r"^## ", md, flags=re.M)[1:]:
    heading = section.splitlines()[0]
    items = re.findall(r"^- \[( |x)\] (.+)$", section, flags=re.M)
    if not items:
        continue
    done = sum(mark == "x" for mark, _ in items)
    done_all, total_all = done_all + done, total_all + len(items)
    pid = phase_id(heading)
    rows = "\n".join(
        f'        <li{" class=\"ok\"" if mark == "x" else ""}>{inline(text)}</li>' for mark, text in items
    )
    block = (
        f'<!--{pid}--><div class="meter" aria-hidden="true"><i style="width:{100 * done / len(items):.0f}%"></i></div>'
        f'<span class="tag prog">{done} / {len(items)} done</span>\n'
        f'      <ul class="check">\n{rows}\n      </ul><!--/{pid}-->'
    )
    page, count = re.subn(rf"<!--{pid}-->.*?<!--/{pid}-->", lambda _: block, page, flags=re.S)
    assert count == 1, f"no marker for {pid} in roadmap.html"

updated = re.search(r"_Last updated: ([^_]+)_", md).group(1)
page = re.sub(r'(<dd id="updated">).*?(</dd>)', rf"\g<1>{updated}\g<2>", page)
page = re.sub(r'(<dd id="overall">).*?(</dd>)', rf"\g<1>{done_all} / {total_all} items\g<2>", page)
(DOCS / "roadmap.html").write_text(page, encoding="utf-8")
print(f"synced: {done_all}/{total_all} done")
