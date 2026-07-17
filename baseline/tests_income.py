"""Hijra income is measured on two mutually exclusive branches.

B101 (who do you live with) splits the instrument:
  dera (B101='2')  -> B106 = B104 - (B105 / B103)  PERSONAL income
  otherwise        -> B107 total                    HOUSEHOLD earnings

The published chart and SRHR tile read B104 — the gross share handed over BEFORE
the dera's shared expenses are deducted, which the questionnaire itself does not
call income, and which only the dera branch is ever asked. 42 of 370 Hijra
answered it; the other 328 dropped out of a figure titled "Monthly income"
without the chart saying so.
"""
from django.test import TestCase

from .insights import compute_insights
from .srhr import compute_srhr

HIJRA_UID = 'aBT7aCL9p4FGcW4WwXZcr6'


class _Resp:
    survey_round = 'baseline'
    district = 'Dhaka'
    age = 30
    population = 'hijra'

    def __init__(self, raw):
        self.raw_data = raw


def _dera(**over):
    """Lives in a dera: answers B103/B104/B105, and B106 is calculated."""
    base = {'_xform_id_string': HIJRA_UID, 'grp_a2/a205_age': 30,
            'grp_b1/b101_live_with': '2', 'grp_b1/b103_dera_members': 10,
            'grp_b1/b104_share': 15000, 'grp_b1/b105_shared_exp': 45000,
            'grp_b1/b106_personal_income': 10500}
    base.update(over)
    return base


def _non_dera(**over):
    """Does not live in a dera: answers the itemised B107 block instead."""
    base = {'_xform_id_string': HIJRA_UID, 'grp_a2/a205_age': 30,
            'grp_b1/b101_live_with': '1', 'grp_b1/b107_sexwork': 20000,
            'grp_b1/b107_total': 20000}
    base.update(over)
    return base


def _bands(rows, key='income_band'):
    return {b['name']: b['value'] for b in compute_insights(rows)[key]['hijra']}


class HijraIncomeBranchTest(TestCase):
    def test_personal_income_uses_b106_not_the_gross_share(self):
        # B104 = 15,000 would band 15k-20k. B106 = 10,500 is the actual income.
        by = _bands([_Resp(_dera())])
        self.assertEqual(by.get('10k–15k', 0), 1, 'income must come from B106')
        self.assertEqual(by.get('15k–20k', 0), 0, 'B104 gross share was banded as income')

    def test_household_income_is_a_separate_series_never_pooled(self):
        rows = [_Resp(_dera()), _Resp(_non_dera())]
        personal = _bands(rows)
        household = _bands(rows, 'hh_income_band')
        self.assertEqual(sum(personal.values()), 1, 'only the dera record has personal income')
        self.assertEqual(sum(household.values()), 1, 'only the non-dera record has household income')
        self.assertEqual(household.get('20k–30k', 0), 1)

    def test_coverage_is_published_so_a_gate_cannot_hide_a_denominator(self):
        rows = [_Resp(_dera())] + [_Resp(_non_dera()) for _ in range(3)]
        cov = compute_insights(rows)['income_covered']['hijra']
        self.assertEqual(cov['total'], 4)
        self.assertEqual(cov['n'], 1, 'personal income covers only the dera branch')
        self.assertEqual(cov['hh_n'], 3)

    def test_srhr_reports_the_two_branches_as_two_tiles(self):
        out = compute_srhr([_Resp(_dera()), _Resp(_non_dera())])['hijra']
        tiles = [t for mod in out['modules'] for t in mod['indicators']]
        refs = {t.get('ref'): t for t in tiles}
        self.assertNotIn('B104', refs, 'B104 gross share is still published as income')
        self.assertEqual(refs['B106']['value'], 10500)
        self.assertEqual(refs['B106']['n'], 1)
        self.assertEqual(refs['B107']['value'], 20000)
        self.assertEqual(refs['B107']['n'], 1)
