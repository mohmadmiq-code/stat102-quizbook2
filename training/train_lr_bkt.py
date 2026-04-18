"""
Offline training script for:
1) BKT parameter estimation (simple frequency-based heuristic)
2) Logistic Regression for mastery prediction

Usage:
    python training/train_lr_bkt.py --input training/data/student_training_log.json
"""

from __future__ import annotations

import argparse
import json
import math
from pathlib import Path
from typing import Dict, List


DEFAULT_BKT = {"p_init": 0.25, "p_learn": 0.2, "p_guess": 0.2, "p_slip": 0.1}
DEFAULT_LR = {
    "intercept": -0.4,
    "feature_order": [
        "difficulty_num",
        "attempts_count",
        "used_help",
        "time_spent_sec",
        "showed_solution",
        "bkt_mastery",
    ],
    "coefficients": [0.75, -0.35, -0.45, -0.015, -0.5, 2.0],
    "threshold": 0.6,
}


def sigmoid(x: float) -> float:
    if x >= 0:
        z = math.exp(-x)
        return 1.0 / (1.0 + z)
    z = math.exp(x)
    return z / (1.0 + z)


def normalize_difficulty(v) -> float:
    if isinstance(v, (int, float)):
        return float(v)
    txt = str(v or "").strip().lower()
    mapping = {"سهل": 1.0, "easy": 1.0, "متوسط": 2.0, "medium": 2.0, "صعب": 3.0, "hard": 3.0}
    return mapping.get(txt, 2.0)


def load_events(path: Path) -> List[Dict]:
    rows = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(rows, list):
        raise ValueError("Input JSON must be a list of event objects.")
    return rows


def estimate_bkt(events: List[Dict]) -> Dict:
    if not events:
        return DEFAULT_BKT
    total = len(events)
    correct = sum(1 for e in events if int(e.get("is_correct", 0)) == 1)
    used_help = sum(1 for e in events if int(e.get("used_help", 0)) == 1)
    showed_solution = sum(1 for e in events if int(e.get("showed_solution", 0)) == 1)
    attempts_more_than_one = sum(1 for e in events if int(e.get("attempts_count", 1)) > 1)

    p_init = max(0.05, min(0.6, correct / total))
    p_guess = max(0.05, min(0.35, (attempts_more_than_one / total) * 0.5))
    p_slip = max(0.03, min(0.3, (showed_solution / total) * 0.6))
    p_learn = max(0.05, min(0.5, 0.15 + (1 - used_help / total) * 0.25))
    return {"p_init": p_init, "p_learn": p_learn, "p_guess": p_guess, "p_slip": p_slip}


def build_features(events: List[Dict], bkt_cfg: Dict) -> List[Dict]:
    skill_mastery: Dict[str, float] = {}
    rows = []
    for e in events:
        sid = str(e.get("skill_id", "unknown_skill"))
        current_mastery = skill_mastery.get(sid, bkt_cfg["p_init"])
        row = {
            "difficulty_num": normalize_difficulty(e.get("difficulty")),
            "attempts_count": float(e.get("attempts_count", 1)),
            "used_help": float(int(e.get("used_help", 0))),
            "time_spent_sec": float(e.get("time_spent_sec", 0)),
            "showed_solution": float(int(e.get("showed_solution", 0))),
            "bkt_mastery": float(current_mastery),
            "label": float(int(e.get("is_correct", 0))),
        }
        rows.append(row)

        # lightweight BKT update to track evolving mastery during training set generation
        p_l = current_mastery
        p_guess = bkt_cfg["p_guess"]
        p_slip = bkt_cfg["p_slip"]
        p_learn = bkt_cfg["p_learn"]
        if row["label"] >= 0.5:
            num = p_l * (1 - p_slip)
            den = num + (1 - p_l) * p_guess
        else:
            num = p_l * p_slip
            den = num + (1 - p_l) * (1 - p_guess)
        posterior = p_l if den == 0 else (num / den)
        skill_mastery[sid] = posterior + (1 - posterior) * p_learn
    return rows


def train_lr(rows: List[Dict], epochs: int = 800, lr: float = 0.01) -> Dict:
    feature_order = DEFAULT_LR["feature_order"]
    w = [0.0 for _ in feature_order]
    b = 0.0
    n = max(1, len(rows))

    for _ in range(epochs):
        grad_w = [0.0 for _ in feature_order]
        grad_b = 0.0
        for row in rows:
            z = b + sum(w[i] * row[feature_order[i]] for i in range(len(feature_order)))
            pred = sigmoid(z)
            err = pred - row["label"]
            for i, feat in enumerate(feature_order):
                grad_w[i] += err * row[feat]
            grad_b += err
        for i in range(len(w)):
            w[i] -= lr * (grad_w[i] / n)
        b -= lr * (grad_b / n)

    return {
        "intercept": b,
        "feature_order": feature_order,
        "coefficients": w,
        "threshold": 0.6,
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True, help="Path to student_training_log.json")
    parser.add_argument("--models-dir", default="models", help="Output directory for model JSON files")
    args = parser.parse_args()

    in_path = Path(args.input)
    models_dir = Path(args.models_dir)
    models_dir.mkdir(parents=True, exist_ok=True)

    events = load_events(in_path)
    if len(events) < 20:
        print("Warning: few records found. Model quality may be weak.")

    bkt = estimate_bkt(events)
    rows = build_features(events, bkt)
    lr_model = train_lr(rows)

    (models_dir / "bkt_model.json").write_text(
        json.dumps(bkt, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    (models_dir / "lr_model.json").write_text(
        json.dumps(lr_model, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    print("Saved:", models_dir / "bkt_model.json")
    print("Saved:", models_dir / "lr_model.json")


if __name__ == "__main__":
    main()
