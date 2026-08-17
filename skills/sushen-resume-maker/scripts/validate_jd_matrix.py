#!/usr/bin/env python3
"""Validate a JD Matrix and its references to a Sushen Claim Ledger."""

from __future__ import annotations

import argparse
import copy
import json
import math
import sys
from pathlib import Path
from typing import Any


CATEGORIES = {"core_duty", "must_have", "preferred", "context"}
MATCH_LEVELS = {"strong", "medium", "weak", "gap", "conflict"}
MATCH_TYPES = {"direct", "transferable", "credential_only", "self_reported", "none"}
SENIORITIES = {"intern", "new_grad", "junior", "mid", "senior", "lead", "unknown"}
QUESTION_STATUSES = {"open", "asked", "answered", "skipped"}
USABLE_VERIFICATIONS = {"source_grounded", "user_attested"}
MATCH_FACTORS = {"strong": 1.0, "medium": 0.65, "weak": 0.30, "gap": 0.0, "conflict": 0.0}


class Result:
    def __init__(self) -> None:
        self.errors: list[str] = []
        self.warnings: list[str] = []

    def error(self, path: str, message: str) -> None:
        self.errors.append(f"{path}: {message}")

    def warn(self, path: str, message: str) -> None:
        self.warnings.append(f"{path}: {message}")


def is_number(value: Any) -> bool:
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value)


def load_claims(ledger: Any, result: Result) -> dict[str, dict[str, Any]]:
    if not isinstance(ledger, dict):
        result.error("ledger", "top level must be an object")
        return {}
    claims: dict[str, dict[str, Any]] = {}
    for index, claim in enumerate(ledger.get("claims", [])):
        if not isinstance(claim, dict):
            result.error(f"ledger.claims[{index}]", "must be an object")
            continue
        claim_id = claim.get("claim_id")
        if isinstance(claim_id, str):
            claims[claim_id] = claim
    return claims


def validate_matrix(matrix: Any, ledger: Any) -> Result:
    result = Result()
    if not isinstance(matrix, dict):
        result.error("$", "top level must be an object")
        return result
    if matrix.get("schema_version") != "1.0":
        result.error("schema_version", "must equal '1.0'")
    if not isinstance(matrix.get("case_id"), str) or not matrix.get("case_id", "").strip():
        result.error("case_id", "must be a non-empty string")
    if isinstance(ledger, dict) and ledger.get("case_id") != matrix.get("case_id"):
        result.error("case_id", "must match Claim Ledger case_id")

    claims = load_claims(ledger, result)
    job = matrix.get("job")
    if not isinstance(job, dict):
        result.error("job", "must be an object")
    else:
        for key in ("job_id", "title", "source_text"):
            if not isinstance(job.get(key), str) or not job.get(key, "").strip():
                result.error(f"job.{key}", "must be a non-empty string")
        if job.get("seniority") not in SENIORITIES:
            result.error("job.seniority", f"must be one of {sorted(SENIORITIES)}")

    requirements = matrix.get("requirements", [])
    if not isinstance(requirements, list):
        result.error("requirements", "must be an array")
        requirements = []
    requirement_ids: set[str] = set()
    weighted_sum = 0.0
    total_weight = 0.0
    counts = {level: 0 for level in MATCH_LEVELS}

    for index, requirement in enumerate(requirements):
        path = f"requirements[{index}]"
        if not isinstance(requirement, dict):
            result.error(path, "must be an object")
            continue
        requirement_id = requirement.get("requirement_id")
        if not isinstance(requirement_id, str) or not requirement_id.strip():
            result.error(f"{path}.requirement_id", "must be a non-empty string")
        elif requirement_id in requirement_ids:
            result.error(f"{path}.requirement_id", f"duplicate id {requirement_id!r}")
        else:
            requirement_ids.add(requirement_id)
        for key in ("original_text", "capability"):
            if not isinstance(requirement.get(key), str) or not requirement.get(key, "").strip():
                result.error(f"{path}.{key}", "must be a non-empty string")
        category = requirement.get("category")
        if category not in CATEGORIES:
            result.error(f"{path}.category", f"must be one of {sorted(CATEGORIES)}")
        weight = requirement.get("weight")
        if not is_number(weight) or weight < 1 or weight > 5:
            result.error(f"{path}.weight", "must be a number from 1 to 5")
            weight = 0
        level = requirement.get("match_level")
        match_type = requirement.get("match_type")
        if level not in MATCH_LEVELS:
            result.error(f"{path}.match_level", f"must be one of {sorted(MATCH_LEVELS)}")
        if match_type not in MATCH_TYPES:
            result.error(f"{path}.match_type", f"must be one of {sorted(MATCH_TYPES)}")

        evidence_ids = requirement.get("evidence_claim_ids", [])
        if not isinstance(evidence_ids, list):
            result.error(f"{path}.evidence_claim_ids", "must be an array")
            evidence_ids = []
        evidence_claims: list[dict[str, Any]] = []
        for claim_id in evidence_ids:
            if claim_id not in claims:
                result.error(f"{path}.evidence_claim_ids", f"unknown claim_id {claim_id!r}")
            else:
                evidence_claims.append(claims[claim_id])

        if level == "strong":
            if match_type != "direct":
                result.error(path, "strong match requires match_type direct")
            if not evidence_claims:
                result.error(path, "strong match requires at least one evidence Claim")
            for claim in evidence_claims:
                if claim.get("verification") not in USABLE_VERIFICATIONS:
                    result.error(path, f"strong match uses unusable Claim {claim.get('claim_id')!r}")
                if claim.get("role_scope") in {"unknown", "team_result_only"} and claim.get("claim_type") not in {"credential", "identity"}:
                    result.error(path, f"strong match uses Claim {claim.get('claim_id')!r} without personal scope")
        if match_type in {"credential_only", "self_reported"} and level == "strong":
            result.error(path, f"{match_type} cannot be strong")
        if level == "gap":
            if match_type != "none":
                result.error(path, "gap requires match_type none")
            if evidence_ids:
                result.warn(path, "gap contains evidence Claim IDs; consider weak or medium instead")
        if match_type == "none" and level not in {"gap", "conflict"}:
            result.error(path, "match_type none requires gap or conflict")
        if match_type == "transferable" and not requirement.get("gap"):
            result.warn(f"{path}.gap", "transferable match should state its boundary or gap")

        for claim in evidence_claims:
            if claim.get("verification") in {"unknown", "contradicted"}:
                result.error(path, f"references unusable Claim {claim.get('claim_id')!r}")

        if level in MATCH_FACTORS and is_number(weight):
            total_weight += weight
            weighted_sum += weight * MATCH_FACTORS[level]
            counts[level] += 1

    questions = matrix.get("questions", [])
    if not isinstance(questions, list):
        result.error("questions", "must be an array")
        questions = []
    question_ids: set[str] = set()
    for index, question in enumerate(questions):
        path = f"questions[{index}]"
        if not isinstance(question, dict):
            result.error(path, "must be an object")
            continue
        question_id = question.get("question_id")
        if not isinstance(question_id, str) or not question_id.strip():
            result.error(f"{path}.question_id", "must be a non-empty string")
        elif question_id in question_ids:
            result.error(f"{path}.question_id", f"duplicate id {question_id!r}")
        else:
            question_ids.add(question_id)
        if question.get("requirement_id") not in requirement_ids:
            result.error(f"{path}.requirement_id", f"unknown requirement_id {question.get('requirement_id')!r}")
        for claim_id in question.get("claim_ids", []):
            if claim_id not in claims:
                result.error(f"{path}.claim_ids", f"unknown claim_id {claim_id!r}")
        priority = question.get("priority")
        if not is_number(priority) or priority < 0 or priority > 1:
            result.error(f"{path}.priority", "must be a number from 0 to 1")
        if question.get("status") not in QUESTION_STATUSES:
            result.error(f"{path}.status", f"must be one of {sorted(QUESTION_STATUSES)}")

    selection = matrix.get("selection", {})
    if not isinstance(selection, dict):
        result.error("selection", "must be an object")
        selection = {}
    selected = selection.get("selected_claim_ids", [])
    if not isinstance(selected, list):
        result.error("selection.selected_claim_ids", "must be an array")
        selected = []
    for claim_id in selected:
        claim = claims.get(claim_id)
        if claim is None:
            result.error("selection.selected_claim_ids", f"unknown claim_id {claim_id!r}")
        elif claim.get("verification") not in USABLE_VERIFICATIONS:
            result.error("selection.selected_claim_ids", f"Claim {claim_id!r} is not usable in final resume")

    expected_coverage = round(weighted_sum / total_weight * 100, 2) if total_weight else 0.0
    summary = matrix.get("summary", {})
    if not isinstance(summary, dict):
        result.error("summary", "must be an object")
    else:
        coverage = summary.get("weighted_coverage")
        if not is_number(coverage):
            result.error("summary.weighted_coverage", "must be a finite number")
        elif not math.isclose(coverage, expected_coverage, rel_tol=1e-4, abs_tol=0.05):
            result.error("summary.weighted_coverage", f"expected {expected_coverage}, got {coverage}")
        for level in ("strong", "medium", "weak", "gap"):
            key = f"{level}_count"
            if summary.get(key) != counts[level]:
                result.error(f"summary.{key}", f"expected {counts[level]}, got {summary.get(key)!r}")
    return result


def fixtures() -> tuple[dict[str, Any], dict[str, Any]]:
    ledger = {
        "schema_version": "1.0", "case_id": "CASE-TEST",
        "claims": [
            {"claim_id": "C-001", "claim_type": "metric_result", "verification": "user_attested", "role_scope": "module_owner"},
            {"claim_id": "C-002", "claim_type": "credential", "verification": "source_grounded", "role_scope": "executor"},
        ],
    }
    matrix = {
        "schema_version": "1.0", "case_id": "CASE-TEST",
        "job": {"job_id": "JOB-001", "title": "机构运营", "company": "", "source_text": "JD", "domain": ["电商"], "target_markets": ["菲律宾"], "seniority": "intern"},
        "requirements": [
            {"requirement_id": "JD-001", "original_text": "经营分析", "category": "core_duty", "capability": "经营分析", "business_context": "电商", "keywords": ["指标"], "weight": 5, "evidence_claim_ids": ["C-001"], "match_level": "strong", "match_type": "direct", "rationale": "有直接经营指标分析", "gap": None},
            {"requirement_id": "JD-002", "original_text": "英文工作", "category": "must_have", "capability": "英文", "business_context": "跨境", "keywords": ["英文"], "weight": 4, "evidence_claim_ids": ["C-002"], "match_level": "weak", "match_type": "credential_only", "rationale": "只有证书", "gap": "缺少英文工作案例"},
        ],
        "questions": [{"question_id": "Q-001", "requirement_id": "JD-002", "claim_ids": ["C-002"], "question": "是否有英文工作案例？", "expected_fields": ["deliverable"], "priority": 0.9, "status": "open"}],
        "selection": {"selected_claim_ids": ["C-001"], "excluded_claims": [], "selection_policy": "test"},
        "summary": {"weighted_coverage": 68.89, "strong_count": 1, "medium_count": 0, "weak_count": 1, "gap_count": 0, "top_strengths": ["经营分析"], "top_gaps": ["英文工作案例"]},
    }
    return ledger, matrix


def run_self_test() -> int:
    ledger, good = fixtures()
    good_result = validate_matrix(good, ledger)
    bad = copy.deepcopy(good)
    bad["requirements"][1]["match_level"] = "strong"
    bad["requirements"][1]["match_type"] = "credential_only"
    bad["requirements"][1]["evidence_claim_ids"] = ["C-NOT-FOUND"]
    bad["summary"]["weighted_coverage"] = 99
    bad_result = validate_matrix(bad, ledger)
    if good_result.errors:
        print("SELF-TEST FAIL: valid fixture produced errors")
        print("\n".join(good_result.errors))
        return 1
    if len(bad_result.errors) < 3:
        print("SELF-TEST FAIL: invalid fixture was not rejected strongly enough")
        print("\n".join(bad_result.errors))
        return 1
    print(f"SELF-TEST PASS: valid=0 errors, invalid={len(bad_result.errors)} errors")
    return 0


def read_json(path: Path, label: str) -> Any:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise ValueError(f"cannot read {label}: {exc}") from exc


def main() -> int:
    parser = argparse.ArgumentParser(description="Validate a JD Matrix against a Claim Ledger")
    parser.add_argument("matrix", nargs="?", type=Path)
    parser.add_argument("--ledger", type=Path)
    parser.add_argument("--json", action="store_true", help="print validation result as JSON")
    parser.add_argument("--self-test", action="store_true")
    args = parser.parse_args()
    if args.self_test:
        return run_self_test()
    if args.matrix is None or args.ledger is None:
        parser.error("matrix path and --ledger are required unless --self-test is used")
    try:
        matrix = read_json(args.matrix, "matrix")
        ledger = read_json(args.ledger, "ledger")
    except ValueError as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 2
    result = validate_matrix(matrix, ledger)
    if args.json:
        print(json.dumps({"valid": not result.errors, "errors": result.errors, "warnings": result.warnings}, ensure_ascii=False, indent=2))
    else:
        for item in result.errors:
            print(f"ERROR: {item}")
        for item in result.warnings:
            print(f"WARNING: {item}")
        print(f"JD Matrix validation: {len(result.errors)} error(s), {len(result.warnings)} warning(s)")
    return 1 if result.errors else 0


if __name__ == "__main__":
    raise SystemExit(main())

