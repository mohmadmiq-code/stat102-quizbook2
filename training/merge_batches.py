"""
Merge all per-student training_batch_*.json files into a single
student_training_log.json ready for training.

Usage:
    python training/merge_batches.py
    python training/merge_batches.py --input-dir training/data/collected
    python training/merge_batches.py --output training/data/student_training_log.json

The script:
  * Reads every *.json file in the input directory (default:
    training/data/collected).
  * Concatenates the arrays.
  * Drops obvious duplicates (same student_id + question_id + timestamp).
  * Prints a short summary.
  * Writes the merged list to the output file.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

DEFAULT_INPUT = Path("training/data/collected")
DEFAULT_OUTPUT = Path("training/data/student_training_log.json")


def _key(ev: dict) -> tuple:
    return (
        str(ev.get("student_id", "")),
        str(ev.get("question_id", "")),
        str(ev.get("timestamp", "")),
    )


def merge(input_dir: Path, output: Path) -> None:
    files = sorted(input_dir.glob("*.json"))
    if not files:
        print(f"No JSON files found in {input_dir}")
        return

    all_events: list[dict] = []
    per_student: dict[str, int] = {}
    bad_files = 0

    for f in files:
        try:
            data = json.loads(f.read_text(encoding="utf-8"))
            if not isinstance(data, list):
                print(f"  SKIP  {f.name}  (not a JSON array)")
                bad_files += 1
                continue
        except Exception as e:
            print(f"  SKIP  {f.name}  ({e})")
            bad_files += 1
            continue
        for ev in data:
            if not isinstance(ev, dict):
                continue
            all_events.append(ev)
            sid = str(ev.get("student_id", ""))
            per_student[sid] = per_student.get(sid, 0) + 1

    # drop duplicates
    seen: set = set()
    unique: list[dict] = []
    for ev in all_events:
        k = _key(ev)
        if k in seen:
            continue
        seen.add(k)
        unique.append(ev)
    dropped = len(all_events) - len(unique)

    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(
        json.dumps(unique, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

    print(f"\nFiles read        : {len(files)}  (bad: {bad_files})")
    print(f"Students merged   : {len(per_student)}")
    print(f"Events total      : {len(all_events)}")
    print(f"Duplicates removed: {dropped}")
    print(f"Events written    : {len(unique)}")
    print(f"Output            : {output}")

    if per_student:
        counts = sorted(per_student.values())
        print(f"Events per student: min={counts[0]}  median={counts[len(counts)//2]}  max={counts[-1]}")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input-dir", default=str(DEFAULT_INPUT))
    parser.add_argument("--output", default=str(DEFAULT_OUTPUT))
    args = parser.parse_args()
    merge(Path(args.input_dir), Path(args.output))


if __name__ == "__main__":
    main()
