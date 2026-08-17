#!/usr/bin/env python3
"""Validate interview-defense JSON against Claim Ledger and optional JD Matrix."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path


ALLOWED_CATEGORIES = {
    "resume_claim",
    "role_scope",
    "metric_attribution",
    "method_decision",
    "failure_reflection",
    "jd_case",
    "behavioral",
    "language_tool",
}
ALLOWED_RISKS = {"high", "medium", "low"}
ALLOWED_STATUS = {"prepare", "ready", "needs_evidence", "drop_claim"}
STRONG_SCOPES = {"module_owner", "project_owner", "project_coordinator"}


def load(path: Path) -> dict:
    with path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def main() -> None:
    parser = argparse.ArgumentParser(description="Validate interview-defense JSON")
    parser.add_argument("defense", type=Path)
    parser.add_argument("--ledger", required=True, type=Path)
    parser.add_argument("--matrix", type=Path)
    args = parser.parse_args()

    defense = load(args.defense)
    ledger = load(args.ledger)
    matrix = load(args.matrix) if args.matrix else None
    errors: list[str] = []

    if defense.get("schema_version") != "1.0":
        errors.append("schema_version must be 1.0")
    if defense.get("case_id") != ledger.get("case_id"):
        errors.append("case_id does not match Claim Ledger")
    if matrix:
        if defense.get("case_id") != matrix.get("case_id"):
            errors.append("case_id does not match JD Matrix")
        matrix_job_id = (matrix.get("job") or {}).get("job_id")
        if defense.get("job_id") != matrix_job_id:
            errors.append("job_id does not match JD Matrix")

    claims = {item.get("claim_id"): item for item in ledger.get("claims", [])}
    requirements = {
        item.get("requirement_id"): item for item in (matrix or {}).get("requirements", [])
    }
    seen_ids: set[str] = set()
    covered_claims: set[str] = set()
    covered_requirements: set[str] = set()

    for index, question in enumerate(defense.get("questions", [])):
        prefix = f"questions[{index}]"
        qid = question.get("question_id")
        if not qid:
            errors.append(f"{prefix}.question_id is required")
        elif qid in seen_ids:
            errors.append(f"duplicate question_id: {qid}")
        else:
            seen_ids.add(qid)

        if question.get("category") not in ALLOWED_CATEGORIES:
            errors.append(f"{prefix}.category is invalid")
        if question.get("risk_level") not in ALLOWED_RISKS:
            errors.append(f"{prefix}.risk_level is invalid")
        if question.get("status") not in ALLOWED_STATUS:
            errors.append(f"{prefix}.status is invalid")

        claim_ids = question.get("claim_ids", [])
        req_ids = question.get("requirement_ids", [])
        if not claim_ids and not req_ids:
            errors.append(f"{prefix} must reference at least one claim or requirement")
        for claim_id in claim_ids:
            if claim_id not in claims:
                errors.append(f"{prefix} references unknown claim: {claim_id}")
            else:
                covered_claims.add(claim_id)
        for requirement_id in req_ids:
            if requirement_id not in requirements:
                errors.append(f"{prefix} references unknown requirement: {requirement_id}")
            else:
                covered_requirements.add(requirement_id)

        for field in ("resume_anchor", "primary_question", "interviewer_intent", "safe_boundary"):
            if not str(question.get(field, "")).strip():
                errors.append(f"{prefix}.{field} is required")
        if not 1 <= len(question.get("follow_ups", [])) <= 3:
            errors.append(f"{prefix}.follow_ups must contain 1-3 items")
        if not 2 <= len(question.get("answer_framework", [])) <= 5:
            errors.append(f"{prefix}.answer_framework must contain 2-5 items")
        if not question.get("evidence_to_prepare"):
            errors.append(f"{prefix}.evidence_to_prepare cannot be empty")

    selected = set(((matrix or {}).get("selection") or {}).get("selected_claim_ids", []))
    for claim_id in selected:
        claim = claims.get(claim_id, {})
        needs_question = bool(claim.get("risk_flags") or claim.get("metric")) or claim.get("role_scope") in STRONG_SCOPES
        if needs_question and claim_id not in covered_claims:
            errors.append(f"selected high-risk claim is not covered by a question: {claim_id}")

    for requirement_id, requirement in requirements.items():
        high_gap = requirement.get("weight", 0) >= 4 and requirement.get("match_level") in {"gap", "weak"}
        if high_gap and requirement_id not in covered_requirements:
            errors.append(f"high-weight JD gap is not covered by a question: {requirement_id}")

    if errors:
        print(f"Interview Defense validation: {len(errors)} error(s)", file=sys.stderr)
        for error in errors:
            print(f"- {error}", file=sys.stderr)
        raise SystemExit(1)
    print("Interview Defense validation: 0 error(s)")


if __name__ == "__main__":
    main()
