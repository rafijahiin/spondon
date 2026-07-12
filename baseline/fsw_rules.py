from __future__ import annotations

import hashlib
import math
import re
from collections import Counter, defaultdict
from dataclasses import dataclass, replace
from datetime import datetime
from statistics import median
from typing import Any, Iterable, Mapping, Sequence

from .anomaly_engine import (
    Anomaly,
    AnomalyEngine,
    Severity,
    as_bool,
    as_datetime,
    as_int,
    as_number,
    clean_text,
    normalized_text,
    record_context,
)


@dataclass(frozen=True)
class FieldMap:
    record_id: str | None
    enumerator: str | None
    site: str | None
    version: str | None
    consent: str | None
    interview_start: str | None
    interview_end: str | None
    age_screening: str | None
    age_demographic: str | None
    children_total: str | None
    children_with_respondent: str | None
    children_other_location: str | None
    living_arrangement: str | None
    sex_work_start_age: str | None
    sex_work_years: str | None
    sex_work_income: str | None
    other_income_none: str | None
    expenses_total: str | None
    latitude: str | None
    longitude: str | None
    gps_precision: str | None
    observation: str | None
    headers: tuple[str, ...]


PATTERNS: dict[str, tuple[str, ...]] = {
    "record_id": (
        r"^_uuid$",
        r"^_id$",
        r"submission.?id",
        r"instance.?id",
        r"^key$",
    ),
    "enumerator": (
        r"^data collector$",
        r"data collector \(name",
        r"enumerator",
        r"interviewer.?name",
    ),
    "site": (
        r"brothel site code",
        r"site.?code",
        r"cluster.?code",
    ),
    "version": (r"^__version__$", r"form.?version"),
    "consent": (r"consent.*participat", r"do you agree.*participat"),
    "interview_start": (
        r"^interview_start$",
        r"^interview_start_actual$",
        r"^start time$",
    ),
    "interview_end": (
        r"^interview_end_actual$",
        r"^interview_end$",
        r"^end time$",
    ),
    "age_screening": (
        r"what is your current age in years",
        r"screen.*age",
    ),
    "age_demographic": (
        r"^a20\d.*current age",
        r"demographic.*age",
    ),
    "children_total": (r"^a213\b", r"how many living children"),
    "children_with_respondent": (
        r"^a214\b",
        r"how many.*children.*currently living with you",
    ),
    "children_other_location": (
        r"^a215\b",
        r"where do your other children",
    ),
    "living_arrangement": (
        r"^b103\b",
        r"who do you live with",
    ),
    "sex_work_start_age": (
        r"^b104\b",
        r"at what age did you first start providing sexual services",
    ),
    "sex_work_years": (
        r"^b105\b",
        r"for how many years in total.*sexual services",
    ),
    "sex_work_income": (
        r"^b108\b",
        r"past month.*total income.*sexual services",
    ),
    "other_income_none": (
        r"^b109.*\/none$",
        r"other sources of income.*\/none$",
    ),
    "expenses_total": (
        r"^b110\b",
        r"from last month's income.*how much in total did you spend",
        r"total.*expenses",
    ),
    "latitude": (r"_latitude$", r"^latitude$"),
    "longitude": (r"_longitude$", r"^longitude$"),
    "gps_precision": (r"_precision$", r"gps.*precision", r"gps.*accuracy"),
    "observation": (
        r"interviewer.?observation",
        r"data collector.?observation",
        r"privacy.*comfort.*distress",
    ),
}


def _find_header(headers: Sequence[str], patterns: Sequence[str]) -> str | None:
    compiled = [re.compile(p, re.I) for p in patterns]
    matches: list[str] = []
    for header in headers:
        text = clean_text(header)
        if any(regex.search(text) for regex in compiled):
            matches.append(header)
    if not matches:
        return None
    # Prefer exact/specific and shorter headers over long instruction columns.
    matches.sort(key=lambda x: (len(clean_text(x)), clean_text(x)))
    return matches[0]


def build_field_map(headers: Sequence[str]) -> FieldMap:
    fields: dict[str, Any] = {"headers": tuple(headers)}
    for canonical, patterns in PATTERNS.items():
        fields[canonical] = _find_header(headers, patterns)
    return FieldMap(**fields)


def _ctx(record: Mapping[str, Any], row: int, field_map: FieldMap) -> dict[str, Any]:
    return record_context(record, row, field_map.record_id, field_map.enumerator)


def _selected(value: Any) -> bool:
    parsed = as_bool(value)
    if parsed is not None:
        return parsed
    return normalized_text(value) not in {"", "0", "false", "no", "none", "nan"}


def _years_lower_bound(value: Any) -> int | None:
    text = normalized_text(value)
    if not text:
        return None
    numbers = [int(n) for n in re.findall(r"\d+", text)]
    if "more than" in text or "over" in text or "above" in text:
        return numbers[0] + 1 if numbers else None
    if numbers:
        return min(numbers)
    mapping = {
        "less than one year": 0,
        "under one year": 0,
    }
    return mapping.get(text)


def _is_other_choice(label: str) -> bool:
    text = normalized_text(label)
    return bool(re.search(r"(^|/)(other|other \(specify\)|others)(\b|$)", text))


def _group_choice_columns(headers: Sequence[str]) -> dict[str, list[str]]:
    groups: dict[str, list[str]] = defaultdict(list)
    for header in headers:
        if "/" not in header:
            continue
        parent, _choice = header.rsplit("/", 1)
        if len(parent) < 8:
            continue
        groups[parent].append(header)
    return groups


def _simple_record_rules(field_map: FieldMap, current_version: str | None):
    def rules(record: Mapping[str, Any], row: int) -> Iterable[Anomaly]:
        ctx = _ctx(record, row, field_map)

        # Consent
        if field_map.consent:
            consent = as_bool(record.get(field_map.consent))
            if consent is False:
                populated = sum(
                    1
                    for key, value in record.items()
                    if key not in {
                        field_map.record_id,
                        field_map.enumerator,
                        field_map.consent,
                        field_map.interview_start,
                        field_map.interview_end,
                    }
                    and clean_text(value)
                )
                if populated > 15:
                    yield Anomaly(
                        "CONSENT_NO_BUT_INTERVIEW_COMPLETED",
                        Severity.CRITICAL,
                        "Consent is recorded as No, but substantial interview data are present.",
                        fields=(field_map.consent,),
                        observed=populated,
                        expected="Interview should stop after non-consent",
                        action="Verify consent immediately; quarantine the record until resolved.",
                        category="ethics",
                        **ctx,
                    )

        # Version
        if current_version and field_map.version:
            version = clean_text(record.get(field_map.version))
            if version and version != current_version:
                yield Anomaly(
                    "OLD_FORM_VERSION",
                    Severity.LOW,
                    "The interview used an older form version.",
                    fields=(field_map.version,),
                    observed=version,
                    expected=current_version,
                    action="Confirm that the enumerator has refreshed/re-downloaded the current form.",
                    category="form_version",
                    **ctx,
                )

        # Timing
        start = as_datetime(record.get(field_map.interview_start)) if field_map.interview_start else None
        end = as_datetime(record.get(field_map.interview_end)) if field_map.interview_end else None

        if start and not end:
            yield Anomaly(
                "MISSING_INTERVIEW_END",
                Severity.MEDIUM,
                "Interview start exists but usable interview end time is blank.",
                fields=tuple(k for k in (field_map.interview_start, field_map.interview_end) if k),
                action="Check form version and device refresh status; do not calculate duration from this record.",
                category="timing",
                **ctx,
            )
        elif start and end:
            minutes = (end - start).total_seconds() / 60
            if minutes < 0:
                yield Anomaly(
                    "END_BEFORE_START",
                    Severity.CRITICAL,
                    "Interview end time occurs before the start time.",
                    observed=round(minutes, 1),
                    expected="Duration >= 0 minutes",
                    action="Check timestamps and device clock.",
                    category="timing",
                    **ctx,
                )
            elif minutes < 10:
                yield Anomaly(
                    "INTERVIEW_TOO_SHORT",
                    Severity.HIGH,
                    "Interview duration is implausibly short for this questionnaire.",
                    observed=round(minutes, 1),
                    expected="Normally at least 20–30 minutes",
                    action="Review the full record for skipped modules or rushed administration.",
                    category="timing",
                    **ctx,
                )
            elif minutes > 180:
                yield Anomaly(
                    "INTERVIEW_EXTREMELY_LONG",
                    Severity.HIGH,
                    "Interview duration exceeds three hours, usually because the form was left open.",
                    observed=round(minutes, 1),
                    expected="Normally about 30–90 minutes",
                    action="Exclude this duration from averages and verify whether the form was paused.",
                    category="timing",
                    **ctx,
                )
            elif minutes > 120:
                yield Anomaly(
                    "INTERVIEW_LONG",
                    Severity.MEDIUM,
                    "Interview duration exceeds two hours.",
                    observed=round(minutes, 1),
                    expected="Normally about 30–90 minutes",
                    action="Review whether the form was left open or the interview was interrupted.",
                    category="timing",
                    **ctx,
                )

        # Age
        age1 = as_int(record.get(field_map.age_screening)) if field_map.age_screening else None
        age2 = as_int(record.get(field_map.age_demographic)) if field_map.age_demographic else None
        for key, age in ((field_map.age_screening, age1), (field_map.age_demographic, age2)):
            if age is not None and age != 99 and not (18 <= age <= 80):
                yield Anomaly(
                    "AGE_OUT_OF_RANGE",
                    Severity.HIGH,
                    "Respondent age falls outside the expected eligible range.",
                    fields=(key,) if key else (),
                    observed=age,
                    expected="18–80, or the designated refusal code",
                    action="Verify against the source form or respondent.",
                    category="demographics",
                    **ctx,
                )
        if age1 is not None and age2 is not None and age1 != 99 and age2 != 99 and age1 != age2:
            yield Anomaly(
                "AGE_MISMATCH",
                Severity.HIGH,
                "Screening age and demographic age do not match.",
                fields=tuple(k for k in (field_map.age_screening, field_map.age_demographic) if k),
                observed={"screening": age1, "demographic": age2},
                expected="The same age in both fields",
                action="Verify and correct one of the two age fields.",
                category="demographics",
                **ctx,
            )

        current_age = age2 if age2 not in (None, 99) else age1

        # Children
        total = as_int(record.get(field_map.children_total)) if field_map.children_total else None
        with_respondent = (
            as_int(record.get(field_map.children_with_respondent))
            if field_map.children_with_respondent
            else None
        )
        other_location = (
            clean_text(record.get(field_map.children_other_location))
            if field_map.children_other_location
            else ""
        )
        living = normalized_text(record.get(field_map.living_arrangement)) if field_map.living_arrangement else ""

        if total is not None and total < 0:
            yield Anomaly(
                "NEGATIVE_CHILD_COUNT",
                Severity.CRITICAL,
                "Number of living children is negative.",
                observed=total,
                expected="0 or more",
                category="children",
                **ctx,
            )
        if total is not None and with_respondent is not None and with_respondent > total:
            yield Anomaly(
                "CHILDREN_WITH_RESPONDENT_EXCEED_TOTAL",
                Severity.CRITICAL,
                "Children living with respondent exceeds total living children.",
                observed={"total": total, "living_with_respondent": with_respondent},
                expected="living_with_respondent <= total",
                action="Verify both child-count fields.",
                category="children",
                **ctx,
            )
        if total == 0 and (with_respondent not in (None, 0) or other_location):
            yield Anomaly(
                "CHILD_DETAILS_WHEN_TOTAL_ZERO",
                Severity.HIGH,
                "Child follow-up information is present even though total living children is zero.",
                observed={
                    "living_with_respondent": with_respondent,
                    "other_location": other_location,
                },
                expected="Child follow-ups should be blank/zero",
                action="Review skip logic and correct the follow-up fields.",
                category="children",
                **ctx,
            )
        if total is not None and with_respondent is not None:
            remaining = total - with_respondent
            if remaining <= 0 and other_location and normalized_text(other_location) not in {"0", "na", "n/a", "o"}:
                yield Anomaly(
                    "OTHER_CHILD_LOCATION_NOT_NEEDED",
                    Severity.MEDIUM,
                    "A location for other children is entered although no other children remain.",
                    observed=other_location,
                    expected="Blank",
                    action="Clear the unnecessary location or verify the child counts.",
                    category="children",
                    **ctx,
                )
            if remaining > 0 and normalized_text(other_location) in {"", "0", "o", "na", "n/a"}:
                yield Anomaly(
                    "OTHER_CHILD_LOCATION_MISSING",
                    Severity.HIGH,
                    "Some children are reported elsewhere, but their location is blank or invalid.",
                    observed=other_location,
                    expected="A meaningful location",
                    action="Verify where the other child/children live.",
                    category="children",
                    **ctx,
                )
        if with_respondent and re.search(r"\balone\b", living):
            yield Anomaly(
                "LIVES_ALONE_WITH_CHILD_PRESENT",
                Severity.HIGH,
                "Respondent reports living alone while also reporting a child living with her.",
                observed={"children_with_respondent": with_respondent, "living_arrangement": living},
                expected="Living arrangement should include child/children",
                action="Verify B103 or the child-residence answer.",
                category="children",
                **ctx,
            )

        # Work history
        start_age = as_int(record.get(field_map.sex_work_start_age)) if field_map.sex_work_start_age else None
        years_value = record.get(field_map.sex_work_years) if field_map.sex_work_years else None
        years_min = _years_lower_bound(years_value)

        if current_age is not None and start_age is not None and start_age != 99:
            if start_age > current_age:
                yield Anomaly(
                    "SEX_WORK_START_AFTER_CURRENT_AGE",
                    Severity.CRITICAL,
                    "Age at starting sex work is greater than current age.",
                    observed={"current_age": current_age, "start_age": start_age},
                    expected="start_age <= current_age",
                    action="Verify both ages.",
                    category="work_history",
                    **ctx,
                )
            possible_years = current_age - start_age
            if years_min is not None and years_min > possible_years:
                yield Anomaly(
                    "SEX_WORK_YEARS_IMPOSSIBLE",
                    Severity.HIGH,
                    "Reported duration of sex work exceeds the years available since starting.",
                    observed={
                        "current_age": current_age,
                        "start_age": start_age,
                        "duration_answer": clean_text(years_value),
                    },
                    expected=f"At most about {possible_years} years",
                    action="Verify starting age or duration category.",
                    category="work_history",
                    **ctx,
                )

        # Income
        income = as_number(record.get(field_map.sex_work_income)) if field_map.sex_work_income else None
        expenses = as_number(record.get(field_map.expenses_total)) if field_map.expenses_total else None
        no_other_income = (
            _selected(record.get(field_map.other_income_none))
            if field_map.other_income_none
            else False
        )

        if income is not None and 0 < income < 100:
            yield Anomaly(
                "LIKELY_MISSING_ZERO_IN_INCOME",
                Severity.HIGH,
                "Monthly income is below BDT 100 and is likely missing zeros.",
                fields=(field_map.sex_work_income,) if field_map.sex_work_income else (),
                observed=income,
                expected="A realistic monthly BDT amount or the refusal code",
                action="Verify the original amount; do not automatically multiply it.",
                category="income",
                **ctx,
            )
        if expenses is not None and 0 < expenses < 100:
            yield Anomaly(
                "LIKELY_MISSING_ZERO_IN_EXPENSE",
                Severity.HIGH,
                "Monthly expense is below BDT 100 and is likely missing zeros.",
                observed=expenses,
                expected="A realistic monthly BDT amount",
                action="Verify the original amount.",
                category="income",
                **ctx,
            )
        if income is not None and expenses is not None and expenses > income and no_other_income:
            ratio = round(expenses / income, 2) if income > 0 else None
            severity = Severity.HIGH if income > 0 and ratio and ratio >= 2 else Severity.MEDIUM
            yield Anomaly(
                "EXPENSES_EXCEED_INCOME_NO_OTHER_SOURCE",
                severity,
                "Reported expenses exceed sex-work income while no other income source is selected.",
                observed={"income": income, "expenses": expenses, "ratio": ratio},
                expected="Explanation such as borrowing, savings, debt, or another income source",
                action="Verify; this may be genuine, so do not auto-correct.",
                category="income",
                **ctx,
            )

        # GPS
        lat = as_number(record.get(field_map.latitude)) if field_map.latitude else None
        lon = as_number(record.get(field_map.longitude)) if field_map.longitude else None
        precision = as_number(record.get(field_map.gps_precision)) if field_map.gps_precision else None

        if (lat is None) != (lon is None):
            yield Anomaly(
                "INCOMPLETE_GPS",
                Severity.HIGH,
                "Only one GPS coordinate is present.",
                observed={"latitude": lat, "longitude": lon},
                expected="Both latitude and longitude",
                category="gps",
                **ctx,
            )
        if lat is not None and lon is not None:
            if not (-90 <= lat <= 90 and -180 <= lon <= 180) or (lat == 0 and lon == 0):
                yield Anomaly(
                    "INVALID_GPS",
                    Severity.CRITICAL,
                    "GPS coordinates are invalid.",
                    observed={"latitude": lat, "longitude": lon},
                    category="gps",
                    **ctx,
                )
        if precision is not None and precision > 50:
            yield Anomaly(
                "LOW_GPS_PRECISION",
                Severity.MEDIUM,
                "GPS precision is worse than 50 metres.",
                observed=round(precision, 1),
                expected="Preferably <= 20 metres; investigate > 50 metres",
                action="Confirm the interview location if site assignment matters.",
                category="gps",
                **ctx,
            )

        # Weak observation
        if field_map.observation:
            observation = clean_text(record.get(field_map.observation))
            weak = normalized_text(observation)
            if weak in {"valo", "bhalo", "good", "ok", "okay", "motamuti", "fine"} or (
                observation and len(observation) < 12
            ):
                yield Anomaly(
                    "WEAK_INTERVIEWER_OBSERVATION",
                    Severity.LOW,
                    "Interviewer observation is too vague to document privacy, comfort, distress, or referral.",
                    observed=observation,
                    expected="A brief structured observation covering the required domains",
                    action="Improve future observation notes; do not invent detail for existing interviews.",
                    category="documentation",
                    **ctx,
                )

    return rules


def _multi_select_rules(field_map: FieldMap, exclusive_options=None):
    """`exclusive_options`: {parent column prefix -> set of choice LABELS that are
    exclusive for THAT question} — an explicit, per-question configuration.
    Exclusivity is NEVER inferred from generic text matching: the old regex
    treated 'Never share needles or syringes' (a correct HIV-knowledge answer)
    as an exclusive 'none' choice and flooded the report with false conflicts."""
    groups = _group_choice_columns(field_map.headers)
    exclusive_options = exclusive_options or {}
    q95_groups = [
        (parent, cols)
        for parent, cols in groups.items()
        if re.search(r"q9\.5.*wellness cent(re|er).*(up to 5|maximum five|max\w*\s*5)",
                     parent, re.I)
    ]

    def rule(record: Mapping[str, Any], row: int) -> Iterable[Anomaly]:
        ctx = _ctx(record, row, field_map)

        for parent, columns in groups.items():
            selected = [col for col in columns if _selected(record.get(col))]
            if not selected:
                continue

            exclusive_labels = exclusive_options.get(parent)
            if exclusive_labels:
                chosen = [col.rsplit("/", 1)[-1] for col in selected]
                exclusive_sel = [c for c in chosen if c in exclusive_labels]
                others = [c for c in chosen if c not in exclusive_labels]
                if exclusive_sel and others:
                    yield Anomaly(
                        "MUTUALLY_EXCLUSIVE_MULTISELECT",
                        Severity.HIGH,
                        "An exclusive choice is selected together with other options "
                        "on the same question.",
                        fields=tuple(selected),
                        observed={"exclusive": exclusive_sel, "also_selected": others},
                        expected=f"'{exclusive_sel[0]}' alone, or the specific options "
                                 "without it",
                        action="Verify the respondent's intended answer.",
                        category="select_multiple",
                        **ctx,
                    )

            other_columns = [col for col in selected if _is_other_choice(col.rsplit("/", 1)[-1])]
            if other_columns:
                possible_specify = [
                    header
                    for header in field_map.headers
                    if header != parent
                    and normalized_text(header).startswith(normalized_text(parent))
                    and "specify" in normalized_text(header)
                    and "/" not in header
                ]
                if possible_specify and not any(clean_text(record.get(h)) for h in possible_specify):
                    yield Anomaly(
                        "OTHER_SELECTED_WITHOUT_SPECIFY",
                        Severity.MEDIUM,
                        "'Other' is selected but the specify field is blank.",
                        fields=tuple(other_columns + possible_specify),
                        action="Verify and complete the text if available.",
                        category="select_multiple",
                        **ctx,
                    )

        for parent, columns in q95_groups:
            selected = [col for col in columns if _selected(record.get(col))]
            if len(selected) > 5:
                severity = Severity.HIGH if len(selected) >= 8 else Severity.MEDIUM
                yield Anomaly(
                    "Q95_MORE_THAN_FIVE_SERVICES",
                    severity,
                    "More than five preferred Wellness Centre services were selected.",
                    fields=tuple(selected),
                    observed=len(selected),
                    expected="Maximum 5",
                    action="Fix the Kobo constraint and verify the respondent's top five choices.",
                    category="select_multiple",
                    **ctx,
                )

    return rule


def _duplicate_id_rule(field_map: FieldMap):
    def rule(records: Sequence[Mapping[str, Any]]) -> Iterable[Anomaly]:
        if not field_map.record_id:
            return
        groups: dict[str, list[int]] = defaultdict(list)
        for row, record in enumerate(records, start=2):
            record_id = clean_text(record.get(field_map.record_id))
            if record_id:
                groups[record_id].append(row)
        for record_id, rows in groups.items():
            if len(rows) > 1:
                for row in rows:
                    record = records[row - 2]
                    ctx = _ctx(record, row, field_map)
                    yield Anomaly(
                        "DUPLICATE_SUBMISSION_ID",
                        Severity.CRITICAL,
                        "The same submission ID appears more than once.",
                        observed={"submission_id": record_id, "rows": rows},
                        expected="Unique submission IDs",
                        action="Quarantine duplicates and verify which record is authoritative.",
                        category="duplicates",
                        **ctx,
                    )
    return rule


def _burst_rule(field_map: FieldMap):
    def rule(records: Sequence[Mapping[str, Any]]) -> Iterable[Anomaly]:
        if not field_map.enumerator or not field_map.interview_start:
            return
        by_enum: dict[str, list[tuple[datetime, int, Mapping[str, Any]]]] = defaultdict(list)
        for row, record in enumerate(records, start=2):
            enum = clean_text(record.get(field_map.enumerator))
            start = as_datetime(record.get(field_map.interview_start))
            if enum and start:
                by_enum[enum].append((start, row, record))

        for enum, items in by_enum.items():
            items.sort(key=lambda x: x[0])
            for previous, current in zip(items, items[1:]):
                gap = (current[0] - previous[0]).total_seconds() / 60
                if 0 <= gap < 12:
                    ctx = _ctx(current[2], current[1], field_map)
                    yield Anomaly(
                        "INTERVIEWS_STARTED_TOO_CLOSE",
                        Severity.HIGH,
                        "Two interviews by the same enumerator started less than 12 minutes apart.",
                        observed={
                            "previous_row": previous[1],
                            "current_row": current[1],
                            "gap_minutes": round(gap, 1),
                        },
                        expected="Enough time to complete the previous interview",
                        action="Check whether interviews overlapped, were back-entered, or timestamps are wrong.",
                        category="timing",
                        **ctx,
                    )
    return rule


def _gps_outlier_rule(field_map: FieldMap, threshold_km: float = 1.5):
    def haversine(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
        radius = 6371.0088
        p1, p2 = math.radians(lat1), math.radians(lat2)
        dphi = math.radians(lat2 - lat1)
        dlambda = math.radians(lon2 - lon1)
        a = math.sin(dphi / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dlambda / 2) ** 2
        return 2 * radius * math.asin(math.sqrt(a))

    def rule(records: Sequence[Mapping[str, Any]]) -> Iterable[Anomaly]:
        if not all((field_map.site, field_map.latitude, field_map.longitude)):
            return
        groups: dict[str, list[tuple[float, float, int, Mapping[str, Any]]]] = defaultdict(list)
        for row, record in enumerate(records, start=2):
            site = clean_text(record.get(field_map.site))
            lat = as_number(record.get(field_map.latitude))
            lon = as_number(record.get(field_map.longitude))
            if site and lat is not None and lon is not None and lat != 0 and lon != 0:
                groups[site].append((lat, lon, row, record))

        for site, items in groups.items():
            if len(items) < 4:
                continue
            center_lat = median(item[0] for item in items)
            center_lon = median(item[1] for item in items)
            for lat, lon, row, record in items:
                distance = haversine(lat, lon, center_lat, center_lon)
                if distance > threshold_km:
                    ctx = _ctx(record, row, field_map)
                    yield Anomaly(
                        "GPS_SITE_OUTLIER",
                        Severity.MEDIUM,
                        "GPS is far from the median location of other interviews assigned to the same site.",
                        observed={"site": site, "distance_km": round(distance, 2)},
                        expected=f"Within approximately {threshold_km} km of the site cluster",
                        action="Confirm site coding and interview location; this may be a legitimate second location.",
                        category="gps",
                        **ctx,
                    )
    return rule


def _exact_answer_duplicate_rule(field_map: FieldMap):
    metadata_patterns = re.compile(
        r"(^_|timestamp|start|end|date|time|gps|latitude|longitude|precision|"
        r"collector|enumerator|interviewer|version|submission|instance|device|site code)",
        re.I,
    )

    def rule(records: Sequence[Mapping[str, Any]]) -> Iterable[Anomaly]:
        usable_headers = [
            header
            for header in field_map.headers
            if not metadata_patterns.search(clean_text(header))
        ]
        signatures: dict[str, list[tuple[int, Mapping[str, Any]]]] = defaultdict(list)

        for row, record in enumerate(records, start=2):
            values = [normalized_text(record.get(header)) for header in usable_headers]
            nonblank = sum(bool(v) for v in values)
            if nonblank < 30:
                continue
            payload = "\x1f".join(values).encode("utf-8")
            signature = hashlib.sha256(payload).hexdigest()
            signatures[signature].append((row, record))

        for _signature, items in signatures.items():
            if len(items) < 2:
                continue
            rows = [row for row, _ in items]
            for row, record in items:
                ctx = _ctx(record, row, field_map)
                yield Anomaly(
                    "EXACT_DUPLICATE_ANSWER_PATTERN",
                    Severity.CRITICAL,
                    "Two or more records have exactly the same non-metadata answer pattern.",
                    observed={"matching_rows": rows},
                    expected="Distinct respondent answer patterns",
                    action="Investigate duplication or copied/back-entered interviews.",
                    category="duplicates",
                    **ctx,
                )
    return rule


def _repeated_observation_rule(field_map: FieldMap):
    def rule(records: Sequence[Mapping[str, Any]]) -> Iterable[Anomaly]:
        if not field_map.enumerator or not field_map.observation:
            return
        by_enum: dict[str, list[tuple[int, Mapping[str, Any], str]]] = defaultdict(list)
        for row, record in enumerate(records, start=2):
            enum = clean_text(record.get(field_map.enumerator))
            obs = normalized_text(record.get(field_map.observation))
            if enum and obs:
                by_enum[enum].append((row, record, obs))

        for enum, items in by_enum.items():
            if len(items) < 5:
                continue
            counts = Counter(obs for _, _, obs in items)
            text, count = counts.most_common(1)[0]
            ratio = count / len(items)
            if count >= 5 and ratio >= 0.8:
                for row, record, obs in items:
                    if obs != text:
                        continue
                    ctx = _ctx(record, row, field_map)
                    yield Anomaly(
                        "REPEATED_ENUMERATOR_OBSERVATION",
                        Severity.LOW,
                        "The same interviewer observation is repeated in at least 80% of this enumerator's records.",
                        observed={"text": clean_text(record.get(field_map.observation)), "ratio": round(ratio, 2)},
                        expected="Record-specific observation where relevant",
                        action="Coach the enumerator to document privacy, comfort, distress, and referral specifically.",
                        category="enumerator_pattern",
                        **ctx,
                    )
    return rule


def build_fsw_engine(
    headers: Sequence[str],
    *,
    current_version: str | None = None,
    gps_outlier_km: float = 1.5,
    field_map: FieldMap | None = None,
    exclusive_options: Mapping[str, set] | None = None,
) -> tuple[AnomalyEngine, FieldMap]:
    # Auto-resolve from headers, or accept an explicit map (recommended for
    # production: locks resolved keys so a wording change can't silently remap a
    # field — see README). An explicit map still gets `headers` filled in.
    if field_map is None:
        field_map = build_field_map(headers)
    elif not field_map.headers:
        field_map = replace(field_map, headers=tuple(headers))
    engine = AnomalyEngine(
        record_id_key=field_map.record_id,
        enumerator_key=field_map.enumerator,
    )
    engine.add_record_rule(_simple_record_rules(field_map, current_version))
    engine.add_record_rule(_multi_select_rules(field_map, exclusive_options))
    engine.add_dataset_rule(_duplicate_id_rule(field_map))
    engine.add_dataset_rule(_burst_rule(field_map))
    engine.add_dataset_rule(_gps_outlier_rule(field_map, gps_outlier_km))
    engine.add_dataset_rule(_exact_answer_duplicate_rule(field_map))
    engine.add_dataset_rule(_repeated_observation_rule(field_map))
    return engine, field_map
