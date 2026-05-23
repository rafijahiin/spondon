"""
Strip personally identifiable information from raw KoboSubmission data
before including it in exported reports.

PII keys confirmed by CIPRB — extend this list as more forms are onboarded.
"""
import re

_PII_KEYS = frozenset({
    'patient_name', 'patient_id', 'nid', 'phone', 'phone_number',
    'mobile', 'name', 'respondent_name', 'mother_name',
    'husband_name', 'guardian_name', 'address',
})

_PHONE_RE = re.compile(r'\b(?:\+?880|0)1[3-9]\d{8}\b')
_NID_RE = re.compile(r'\b\d{10,17}\b')


def strip_pii(data: dict) -> dict:
    """
    Return a shallow copy of `data` with PII fields removed and
    phone/NID patterns in remaining string values replaced with [REDACTED].
    """
    cleaned = {}
    for key, value in data.items():
        if key.lower() in _PII_KEYS:
            continue
        if isinstance(value, str):
            value = _PHONE_RE.sub('[REDACTED]', value)
            value = _NID_RE.sub('[REDACTED]', value)
        cleaned[key] = value
    return cleaned
