"""
Selective reverse-encoding fix for files corrupted by a UTF-8->CP1256->UTF-8
mis-conversion. Operates on a per-line basis so that already-correct lines
(e.g. injected JavaScript with clean Arabic strings) are preserved untouched.
Creates a .bak_mojibake backup for every file it rewrites so the change is
fully reversible.
"""

from __future__ import annotations

import shutil
import sys
from pathlib import Path
from typing import Iterable

ROOT = Path(__file__).resolve().parent
TARGETS = [
    "index.html",
    "STAT102_1_1/index.html",
    "STAT102_1_2/index.html",
    "STAT102_2_1/index.html",
    "STAT102_2_2/index.html",
    "STAT102_3_1/index.html",
    "STAT102_3_2/index.html",
    "STAT102_3_3/lesson_3_3/index.html",
    "STAT102_3_4/lesson_3_4/index.html",
    "STAT102_3_5/lesson_3_5/index.html",
    "STAT102_4_1/index.html",
    "STAT102_4_2/index.html",
    "STAT102_4_3/index.html",
    "STAT102_5_1/index.html",
    "STAT102_5_2/index.html",
    "STAT102_5_3/index.html",
    "STAT102_5_4/index.html",
]


def looks_like_mojibake(s: str) -> bool:
    has_arabic = any(0x0600 <= ord(c) <= 0x06FF for c in s)
    if not has_arabic:
        return False
    suspicious = {
        0x00A0, 0x00A2, 0x00A3, 0x00A4, 0x00A5, 0x00A6, 0x00A7, 0x00A8,
        0x00A9, 0x00AA, 0x00AB, 0x00AC, 0x00AD, 0x00AE, 0x00AF, 0x00B0,
        0x00B1, 0x00B2, 0x00B3, 0x00B4, 0x00B5, 0x00B6, 0x00B7, 0x00B8,
        0x00B9, 0x00BA, 0x00BB, 0x00BC, 0x00BD, 0x00BE, 0x00BF,
        0x00C0, 0x00C1, 0x00C2, 0x00C3, 0x00C4, 0x00C5, 0x00C6, 0x00C7,
        0x00D8, 0x00D9, 0x00DA, 0x00DB, 0x00DC, 0x00DD, 0x00DE, 0x00DF,
        0x00E0, 0x00E1, 0x00E2, 0x00E3, 0x00E4, 0x00E5, 0x00E6, 0x00E7,
        0x00E8, 0x00E9, 0x00EA, 0x00EB, 0x00EC, 0x00ED, 0x00EE, 0x00EF,
        0x00F0, 0x00F1, 0x00F2, 0x00F3, 0x00F4, 0x00F5, 0x00F6, 0x00F7,
        0x2013, 0x2014, 0x2018, 0x2019, 0x201A, 0x201C, 0x201D, 0x201E,
        0x2020, 0x2021, 0x2022, 0x2026, 0x2030, 0x2039, 0x203A, 0x20AC,
        0x0152, 0x0153, 0x0160, 0x0161, 0x0178, 0x017D, 0x017E,
        0x0192, 0x02C6, 0x02DC, 0xFB01, 0xFB02,
    }
    return any(ord(c) in suspicious for c in s)


def reverse_line(s: str) -> str:
    if not looks_like_mojibake(s):
        return s
    try:
        return s.encode("cp1256", errors="strict").decode("utf-8", errors="strict")
    except Exception:
        return s


def count_arabic(s: str) -> int:
    return sum(1 for c in s if 0x0600 <= ord(c) <= 0x06FF)


def count_suspicious(s: str) -> int:
    return sum(
        1 for c in s
        if 0x00A0 <= ord(c) <= 0x00FF
        or 0x2013 <= ord(c) <= 0x203A
        or ord(c) == 0x20AC
    )


def fix_file(path: Path) -> dict:
    raw = path.read_bytes()
    bom = b""
    if raw.startswith(b"\xef\xbb\xbf"):
        bom = b"\xef\xbb\xbf"
        raw = raw[3:]
    text = raw.decode("utf-8")

    lines = text.splitlines(keepends=True)
    fixed_lines = [reverse_line(ln) for ln in lines]
    fixed = "".join(fixed_lines)

    before_moji = count_suspicious(text)
    after_moji = count_suspicious(fixed)
    before_ar = count_arabic(text)
    after_ar = count_arabic(fixed)

    if fixed == text:
        return {
            "path": str(path),
            "changed": False,
            "before_moji": before_moji,
            "after_moji": after_moji,
            "before_ar": before_ar,
            "after_ar": after_ar,
        }

    backup = path.with_suffix(path.suffix + ".bak_mojibake")
    if not backup.exists():
        shutil.copy2(path, backup)

    path.write_bytes(bom + fixed.encode("utf-8"))
    return {
        "path": str(path),
        "changed": True,
        "before_moji": before_moji,
        "after_moji": after_moji,
        "before_ar": before_ar,
        "after_ar": after_ar,
    }


def main(paths: Iterable[str]) -> int:
    results = []
    for rel in paths:
        p = (ROOT / rel).resolve()
        if not p.exists():
            print(f"SKIP  missing: {rel}")
            continue
        try:
            results.append(fix_file(p))
        except Exception as e:
            print(f"ERROR {rel}: {e}")
    print("\nSummary (suspicious-char count before -> after, arabic-char count before -> after):")
    for r in results:
        tag = "FIXED " if r["changed"] else "clean "
        print(
            f"{tag} moji {r['before_moji']:>6} -> {r['after_moji']:>6}"
            f"   arabic {r['before_ar']:>6} -> {r['after_ar']:>6}   {r['path']}"
        )
    return 0


if __name__ == "__main__":
    sys.exit(main(TARGETS))
