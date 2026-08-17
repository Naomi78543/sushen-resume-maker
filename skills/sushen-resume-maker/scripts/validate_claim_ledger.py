#!/usr/bin/env python3
"""Validate a Sushen resume Claim Ledger using only the Python standard library."""

from __future__ import annotations

import argparse
import copy
import json
import math
import re
import sys
from pathlib import Path
from typing import Any


SOURCE_TYPES = {
    "resume_pdf", "resume_docx", "screenshot", "project_document", "portfolio",
    "repository", "official_webpage", "metric_dashboard", "certificate",
    "user_interview", "other",
}
RELIABILITIES = {
    "official_record", "system_record", "candidate_self_statement",
    "public_project_record", "third_party_commentary", "unknown",
}
EXPERIENCE_TYPES = {
    "education", "internship", "employment", "project", "research",
    "open_source", "entrepreneurship", "content_creator", "award", "other",
}
EXPERIENCE_STATUSES = {"completed", "ongoing", "planned", "unknown"}
CLAIM_TYPES = {
    "identity", "responsibility", "action", "method", "deliverable",
    "metric_result", "qualitative_result", "status", "causal_attribution",
    "credential", "other",
}
ROLE_SCOPES = {
    "executor", "module_contributor", "module_owner", "project_coordinator",
    "project_owner", "team_result_only", "unknown",
}
TENSES = {"delivered", "ongoing", "tested", "planned", "unknown"}
VERIFICATIONS = {"source_grounded", "user_attested", "planned", "unknown", "contradicted"}
SUPPORT_TYPES = {"supports", "partially_supports", "contradicts", "context_only"}
ATTRIBUTION_SCOPES = {
    "personal_result", "team_result_with_personal_module", "team_result",
    "correlated_only", "unknown",
}
RISK_FLAGS = {
    "missing_source", "missing_role_scope", "missing_baseline", "missing_result",
    "missing_time_window", "missing_denominator", "missing_measurement_method",
    "team_result_attribution", "causality_not_established", "strong_role_term",
    "planned_as_delivered", "cross_market_inflation", "cross_domain_inflation",
    "conflicting_dates", "conflicting_role", "private_information", "other",
}
STRONG_ROLE_RE = re.compile(r"主导|Owner|owner|从\s*0\s*(?:到|→|->)\s*1|负责人|lead", re.I)
DELIVERED_RE = re.compile(r"已上线|已落地|取得|提升至|实现|完成上线|正式发布")
PHONE_RE = re.compile(r"(?<!\d)1[3-9]\d{9}(?!\d)")
EMAIL_RE = re.compile(r"[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}", re.I)


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


def require_enum(result: Result, path: str, value: Any, allowed: set[str]) -> None:
    if value not in allowed:
        result.error(path, f"must be one of {sorted(allowed)}, got {value!r}")


def collect_unique_ids(result: Result, items: Any, key: str, path: str) -> set[str]:
    ids: set[str] = set()
    if not isinstance(items, list):
        result.error(path, "must be an array")
        return ids
    for index, item in enumerate(items):
        item_path = f"{path}[{index}]"
        if not isinstance(item, dict):
            result.error(item_path, "must be an object")
            continue
        value = item.get(key)
        if not isinstance(value, str) or not value.strip():
            result.error(f"{item_path}.{key}", "must be a non-empty string")
        elif value in ids:
            result.error(f"{item_path}.{key}", f"duplicate id {value!r}")
        else:
            ids.add(value)
    return ids


def validate_metric(result: Result, metric: Any, path: str, risk_flags: set[str]) -> None:
    if not isinstance(metric, dict):
        result.error(path, "must be an object")
        return
    require_enum(result, f"{path}.attribution_scope", metric.get("attribution_scope"), ATTRIBUTION_SCOPES)
    baseline = metric.get("baseline")
    final = metric.get("result")
    absolute = metric.get("absolute_change")
    relative = metric.get("relative_change")

    if baseline is not None and not is_number(baseline):
        result.error(f"{path}.baseline", "must be a finite number or null")
    if final is not None and not is_number(final):
        result.error(f"{path}.result", "must be a finite number or null")
    if baseline is None and "missing_baseline" not in risk_flags:
        result.warn(path, "baseline is missing but risk_flags lacks missing_baseline")
    if final is None and "missing_result" not in risk_flags:
        result.warn(path, "result is missing but risk_flags lacks missing_result")

    if is_number(baseline) and is_number(final):
        expected_absolute = final - baseline
        if absolute is None:
            result.warn(f"{path}.absolute_change", f"missing; expected {expected_absolute:.6g}")
        elif not is_number(absolute) or not math.isclose(absolute, expected_absolute, rel_tol=1e-4, abs_tol=1e-4):
            result.error(f"{path}.absolute_change", f"expected {expected_absolute:.6g}, got {absolute!r}")
        if baseline != 0:
            expected_relative = expected_absolute / baseline * 100
            if relative is None:
                result.warn(f"{path}.relative_change", f"missing; expected {expected_relative:.4f}")
            elif not is_number(relative) or not math.isclose(relative, expected_relative, rel_tol=1e-3, abs_tol=1e-2):
                result.error(f"{path}.relative_change", f"expected {expected_relative:.4f}, got {relative!r}")
        elif relative is not None:
            result.error(f"{path}.relative_change", "cannot be defined when baseline is zero")

    if not metric.get("window") and "missing_time_window" not in risk_flags:
        result.warn(path, "window is missing but risk_flags lacks missing_time_window")
    if not metric.get("measurement_system") and "missing_measurement_method" not in risk_flags:
        result.warn(path, "measurement_system is missing but risk_flags lacks missing_measurement_method")
    if metric.get("denominator") is None and "missing_denominator" not in risk_flags:
        result.warn(path, "denominator is missing but risk_flags lacks missing_denominator")


def validate_ledger(data: Any) -> Result:
    result = Result()
    if not isinstance(data, dict):
        result.error("$", "top level must be an object")
        return result
    if data.get("schema_version") != "1.0":
        result.error("schema_version", "must equal '1.0'")
    if not isinstance(data.get("case_id"), str) or not data.get("case_id", "").strip():
        result.error("case_id", "must be a non-empty string")

    sources = data.get("sources", [])
    experiences = data.get("experiences", [])
    claims = data.get("claims", [])
    conflicts = data.get("conflicts", [])
    gaps = data.get("evidence_gaps", [])

    source_ids = collect_unique_ids(result, sources, "source_id", "sources")
    experience_ids = collect_unique_ids(result, experiences, "experience_id", "experiences")
    claim_ids = collect_unique_ids(result, claims, "claim_id", "claims")
    collect_unique_ids(result, conflicts, "conflict_id", "conflicts")
    collect_unique_ids(result, gaps, "gap_id", "evidence_gaps")

    if isinstance(sources, list):
        for index, source in enumerate(sources):
            if not isinstance(source, dict):
                continue
            path = f"sources[{index}]"
            require_enum(result, f"{path}.source_type", source.get("source_type"), SOURCE_TYPES)
            require_enum(result, f"{path}.reliability", source.get("reliability"), RELIABILITIES)
            if not source.get("title"):
                result.error(f"{path}.title", "is required")

    if isinstance(experiences, list):
        for index, experience in enumerate(experiences):
            if not isinstance(experience, dict):
                continue
            path = f"experiences[{index}]"
            require_enum(result, f"{path}.experience_type", experience.get("experience_type"), EXPERIENCE_TYPES)
            require_enum(result, f"{path}.status", experience.get("status"), EXPERIENCE_STATUSES)
            for source_id in experience.get("source_ids", []):
                if source_id not in source_ids:
                    result.error(f"{path}.source_ids", f"unknown source_id {source_id!r}")

    if isinstance(claims, list):
        for index, claim in enumerate(claims):
            if not isinstance(claim, dict):
                continue
            path = f"claims[{index}]"
            experience_id = claim.get("experience_id")
            if experience_id not in experience_ids:
                result.error(f"{path}.experience_id", f"unknown experience_id {experience_id!r}")
            require_enum(result, f"{path}.claim_type", claim.get("claim_type"), CLAIM_TYPES)
            require_enum(result, f"{path}.role_scope", claim.get("role_scope"), ROLE_SCOPES)
            require_enum(result, f"{path}.tense", claim.get("tense"), TENSES)
            verification = claim.get("verification")
            require_enum(result, f"{path}.verification", verification, VERIFICATIONS)

            text = " ".join(str(claim.get(key, "")) for key in ("raw_claim", "normalized_claim", "action", "result"))
            if STRONG_ROLE_RE.search(text) and claim.get("role_scope") not in {"module_owner", "project_owner"}:
                result.error(f"{path}.role_scope", "strong role wording requires module_owner or project_owner")
            if claim.get("tense") == "planned" and DELIVERED_RE.search(text):
                result.error(f"{path}.tense", "planned claim uses delivered-result wording")
            if verification == "planned" and claim.get("tense") != "planned":
                result.error(f"{path}.tense", "verification planned requires tense planned")

            source_refs = claim.get("source_refs", [])
            usable = verification in {"source_grounded", "user_attested"}
            supportive = False
            if not isinstance(source_refs, list):
                result.error(f"{path}.source_refs", "must be an array")
                source_refs = []
            for ref_index, source_ref in enumerate(source_refs):
                ref_path = f"{path}.source_refs[{ref_index}]"
                if not isinstance(source_ref, dict):
                    result.error(ref_path, "must be an object")
                    continue
                if source_ref.get("source_id") not in source_ids:
                    result.error(f"{ref_path}.source_id", f"unknown source_id {source_ref.get('source_id')!r}")
                support_type = source_ref.get("support_type")
                require_enum(result, f"{ref_path}.support_type", support_type, SUPPORT_TYPES)
                supportive = supportive or support_type in {"supports", "partially_supports"}
            if usable and not supportive:
                result.error(f"{path}.source_refs", "usable claim requires supportive evidence")

            risk_flags_raw = claim.get("risk_flags", [])
            if not isinstance(risk_flags_raw, list):
                result.error(f"{path}.risk_flags", "must be an array")
                risk_flags_raw = []
            risk_flags = set(risk_flags_raw)
            unknown_flags = risk_flags - RISK_FLAGS
            if unknown_flags:
                result.error(f"{path}.risk_flags", f"unknown flags {sorted(unknown_flags)}")
            if "metric" in claim:
                validate_metric(result, claim.get("metric"), f"{path}.metric", risk_flags)

    if isinstance(conflicts, list):
        for index, conflict in enumerate(conflicts):
            if not isinstance(conflict, dict):
                continue
            path = f"conflicts[{index}]"
            for claim_id in conflict.get("claim_ids", []):
                if claim_id not in claim_ids:
                    result.error(f"{path}.claim_ids", f"unknown claim_id {claim_id!r}")
            if conflict.get("status") not in {"unresolved", "resolved"}:
                result.error(f"{path}.status", "must be unresolved or resolved")

    if isinstance(gaps, list):
        for index, gap in enumerate(gaps):
            if not isinstance(gap, dict):
                continue
            path = f"evidence_gaps[{index}]"
            if gap.get("claim_id") not in claim_ids:
                result.error(f"{path}.claim_id", f"unknown claim_id {gap.get('claim_id')!r}")
            if gap.get("priority") not in {"high", "medium", "low"}:
                result.error(f"{path}.priority", "must be high, medium or low")
            if gap.get("status") not in {"open", "answered", "dismissed"}:
                result.error(f"{path}.status", "must be open, answered or dismissed")

    serialized = json.dumps(data, ensure_ascii=False)
    if PHONE_RE.search(serialized):
        result.warn("$", "possible phone number detected; confirm privacy handling")
    if EMAIL_RE.search(serialized):
        result.warn("$", "possible email detected; confirm privacy handling")
    return result


def valid_fixture() -> dict[str, Any]:
    return {
        "schema_version": "1.0",
        "case_id": "CASE-TEST",
        "sources": [{
            "source_id": "S-001", "source_type": "resume_pdf", "title": "resume",
            "locator": "page 1", "provided_by": "user",
            "reliability": "candidate_self_statement", "contains_private_data": False,
        }],
        "experiences": [{
            "experience_id": "EXP-001", "experience_type": "internship",
            "organization": "Example", "team": "", "role": "运营实习生",
            "start_date": "2025-01", "end_date": "2025-06", "status": "completed",
            "source_ids": ["S-001"],
        }],
        "claims": [{
            "claim_id": "C-001", "experience_id": "EXP-001", "claim_type": "metric_result",
            "raw_claim": "转化率由2.3%提升至3%", "normalized_claim": "转化率由2.3%提升至3%",
            "action": "优化页面", "methods": ["A/B测试"], "business_object": "商品页",
            "deliverables": ["新版商品页"], "result": "转化率由2.3%提升至3%",
            "role_scope": "module_owner", "tense": "delivered", "verification": "user_attested",
            "source_refs": [{"source_id": "S-001", "support_type": "supports", "locator": "item 1", "excerpt": "2.3%到3%"}],
            "metric": {
                "name": "转化率", "baseline": 2.3, "result": 3.0, "unit": "%",
                "absolute_change": 0.7, "relative_change": 30.43,
                "numerator": None, "denominator": None, "window": None,
                "measurement_system": "Shopify",
                "attribution_scope": "team_result_with_personal_module",
            },
            "risk_flags": ["missing_time_window", "missing_denominator"], "notes": "",
        }],
        "conflicts": [],
        "evidence_gaps": [{
            "gap_id": "GAP-001", "claim_id": "C-001",
            "missing_fields": ["metric.window", "metric.denominator"],
            "impact": "口径不完整", "recommended_question": "时间窗和分母是什么？",
            "priority": "high", "status": "open",
        }],
    }


def run_self_test() -> int:
    good = valid_fixture()
    good_result = validate_ledger(good)
    bad = copy.deepcopy(good)
    bad["claims"][0]["role_scope"] = "executor"
    bad["claims"][0]["normalized_claim"] = "主导商品页优化并提升转化率"
    bad["claims"][0]["source_refs"] = []
    bad["claims"][0]["metric"]["relative_change"] = 99
    bad_result = validate_ledger(bad)
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


def main() -> int:
    parser = argparse.ArgumentParser(description="Validate a Sushen Claim Ledger JSON file")
    parser.add_argument("ledger", nargs="?", type=Path)
    parser.add_argument("--json", action="store_true", help="print validation result as JSON")
    parser.add_argument("--self-test", action="store_true")
    args = parser.parse_args()
    if args.self_test:
        return run_self_test()
    if args.ledger is None:
        parser.error("ledger path is required unless --self-test is used")
    try:
        data = json.loads(args.ledger.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        print(f"ERROR: cannot read ledger: {exc}", file=sys.stderr)
        return 2
    result = validate_ledger(data)
    if args.json:
        print(json.dumps({"valid": not result.errors, "errors": result.errors, "warnings": result.warnings}, ensure_ascii=False, indent=2))
    else:
        for item in result.errors:
            print(f"ERROR: {item}")
        for item in result.warnings:
            print(f"WARNING: {item}")
        print(f"Claim Ledger validation: {len(result.errors)} error(s), {len(result.warnings)} warning(s)")
    return 1 if result.errors else 0


if __name__ == "__main__":
    raise SystemExit(main())

