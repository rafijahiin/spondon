"""
Seed default user accounts from environment-supplied passwords.

Gating
------
This command no-ops unless the SEED_DB environment variable is truthy
(any value other than empty/0/false). This prevents accidental reseeding
of the production database on every container restart. To run a seed:

    1. Set SEED_DB=1 in the Railway web service Variables.
    2. Set the per-account password env vars (see USERS below).
    3. Trigger a redeploy. The seed runs once.
    4. UNSET SEED_DB=1 (or set to 0). Subsequent deploys no-op.

Idempotency
-----------
For each user, the row is created only if the email doesn't already
exist. Existing users are NEVER modified — passwords are not reset,
roles are not changed, organisations are not corrected.

Passwords
---------
Every account password is read from an environment variable. If the
env var is missing or blank, that single account is SKIPPED with a
warning — we never fall back to a hardcoded default. If you want a
specific account to be created, you must set its env var.
"""
import os

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand


# Per-account password env var mapping.
# Each tuple: (email, full_name, organisation, role, password_env_var_name)
# If the env var below doesn't match your Railway variables, rename it
# either here or in Railway.
USERS = [
    # Order matches the authoritative Admin Panel sequence.
    # ── Developer (CIPRB, can_see_all_orgs=True via Role.DEVELOPER) ────────
    {
        'email':        'rafijahiin@gmail.com',
        'full_name':    'Rafi Jahin',
        'organisation': 'CIPRB',
        'role':         'developer',
        'password_env': 'DEV_PASSWORD',
    },
    # ── CIPRB super admin (can_see_all_orgs=True via Role.SUPER_ADMIN) ────
    {
        'email':        'sayeed@ciprb.org',
        'full_name':    'Dr. Abu Sayeed Md. Abdullah',
        'organisation': 'CIPRB',
        'role':         'super_admin',
        'password_env': 'CIPRB_SAYEED_PASSWORD',
    },
    # ── UNFPA super admins (can_see_all_orgs=True via Role.SUPER_ADMIN) ───
    {
        'email':        'animesh@unfpa.org',
        'full_name':    'Dr. Animesh Biswas',
        'organisation': 'UNFPA',
        'role':         'super_admin',
        'password_env': 'UNFPA_ANIMESH_PASSWORD',
    },
    {
        'email':        'rokhsana@unfpa.org',
        'full_name':    'Rokhsana',
        'organisation': 'UNFPA',
        'role':         'super_admin',
        'password_env': 'UNFPA_ROKHSANA_PASSWORD',
    },
    # ── Org managers (can_see_all_orgs=False — role-based queryset clamp) ─
    {
        'email':        'manager@bandhu.org',
        'full_name':    'Bandhu Manager',
        'organisation': 'Bandhu',   # canonical spelling with 'a'
        'role':         'manager',
        'password_env': 'BANDHU_MANAGER_PASSWORD',
    },
    {
        'email':        'manager@phd.org',
        'full_name':    'PHD Manager',
        'organisation': 'PHD',
        'role':         'manager',
        'password_env': 'PHD_MANAGER_PASSWORD',
    },
]


def _seed_db_enabled() -> bool:
    """Return True iff the SEED_DB env var is set to a truthy value."""
    raw = os.environ.get('SEED_DB', '').strip().lower()
    return raw not in ('', '0', 'false', 'no', 'off')


class Command(BaseCommand):
    help = 'Create default users from env-supplied passwords. Gated by SEED_DB.'

    def handle(self, *args, **options):
        if not _seed_db_enabled():
            self.stdout.write(
                'SEED_DB is not set — seed_users is a no-op. '
                'Set SEED_DB=1 in the environment to enable seeding.'
            )
            return

        User = get_user_model()
        created = 0
        skipped_exists = 0
        skipped_no_password = 0

        for u in USERS:
            email = u['email']
            password = os.environ.get(u['password_env'], '').strip()

            if User.objects.filter(email=email).exists():
                self.stdout.write(f'  exists      {email}')
                skipped_exists += 1
                continue

            if not password:
                self.stderr.write(
                    f'  SKIP        {email}  (env var {u["password_env"]} '
                    f'is not set — refusing to create account without password)'
                )
                skipped_no_password += 1
                continue

            # Managers must NOT receive Django superuser flags. create_user
            # leaves is_staff and is_superuser at their model defaults (False).
            # Developer + super_admin get create_superuser so they can reach
            # /admin and django.contrib.admin for emergency maintenance.
            create = (
                User.objects.create_superuser
                if u['role'] in ('developer', 'super_admin')
                else User.objects.create_user
            )
            create(
                email=email,
                password=password,
                full_name=u['full_name'],
                organisation=u['organisation'],
                role=u['role'],
            )
            self.stdout.write(self.style.SUCCESS(f'  created     {email}'))
            created += 1

        self.stdout.write(
            self.style.SUCCESS(
                f'\nseed_users done. created={created} '
                f'exists={skipped_exists} skipped_no_password={skipped_no_password}'
            )
        )
