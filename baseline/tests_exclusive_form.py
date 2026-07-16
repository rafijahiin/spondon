from django.test import TestCase

from baseline.anomaly import EXCLUSIVE_CHOICE_CODES
from programs.management.commands.build_baseline_forms import (
    FORMS, _add_other_specify, _enforce_exclusive_choices, _require_all,
)


def _survey(population):
    f = next(x for x in FORMS if population in x['id'])
    choices = f['choices']()
    survey = _require_all(_add_other_specify(f['survey'](), choices))
    return _enforce_exclusive_choices(survey, population), choices


class ExclusiveChoiceConstraintTest(TestCase):
    """Enketo accepts an exclusive option ticked alongside the options it
    excludes, so 'No concerns' + two concerns reached the data and had to be
    caught after the fact. The form must reject it at entry."""

    def test_every_exclusive_field_gets_a_constraint(self):
        for population, fields in EXCLUSIVE_CHOICE_CODES.items():
            survey, _ = _survey(population)
            by_name = {r[1]: r for r in survey}
            for field, codes in fields.items():
                row = by_name[field]
                self.assertIn('count-selected(.) > 1', row[7] or '',
                              f'{population}/{field} has no exclusive constraint')
                for c in codes:
                    self.assertIn(f"selected(.,'{c}')", row[7],
                                  f'{population}/{field} misses code {c}')
                self.assertTrue(row[8], f'{population}/{field} has no message')

    def test_codes_exist_in_the_choice_list(self):
        # A code that is not in the list compiles fine and silently never fires.
        for population, fields in EXCLUSIVE_CHOICE_CODES.items():
            survey, choices = _survey(population)
            by_name = {r[1]: r for r in survey}
            for field, codes in fields.items():
                lst = (by_name[field][0] or '').split()[-1]
                names = {str(c[1]) for c in choices if c[0] == lst}
                for c in codes:
                    self.assertIn(c, names, f'{population}/{field}: {c} not in {lst}')

    def test_existing_constraint_is_kept(self):
        # Q9.5 caps the answer at five services; the exclusive pass must AND onto
        # that, never replace it.
        survey, _ = _survey('fsw')
        q9_5 = next(r for r in survey if r[1] == 'q9_5')
        self.assertIn('count-selected(.) <= 5', q9_5[7])

    def test_a_missing_field_fails_loudly(self):
        with self.assertRaises(ValueError):
            _enforce_exclusive_choices([['select_multiple x', 'unrelated'] + [''] * 10], 'fsw')
