from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand


class Command(BaseCommand):
    help = 'Create default users if they do not exist (idempotent)'

    USERS = [
        # ── Developer ──────────────────────────────────────────────────────────
        {
            'email': 'rafijahiin@gmail.com',
            'password': 'REDACTED',
            'full_name': 'Rafi Jahin',
            'organisation': 'CIPRB',
            'role': 'developer',
        },
        # ── UNFPA focal persons (super admin — full access, all orgs) ──────────
        {
            'email': 'animesh@unfpa.org',
            'password': 'REDACTED',
            'full_name': 'Dr. Animesh Biswas',
            'organisation': 'UNFPA',
            'role': 'super_admin',
        },
        {
            'email': 'rokhsana@unfpa.org',
            'password': 'REDACTED',
            'full_name': 'Rokhsana',
            'organisation': 'UNFPA',
            'role': 'super_admin',
        },
        # ── CIPRB focal person (super admin — full access, all orgs) ───────────
        {
            'email': 'sayeed@ciprb.org',
            'password': 'REDACTED',
            'full_name': 'Dr. Abu Sayeed Md. Abdullah',
            'organisation': 'CIPRB',
            'role': 'super_admin',
        },
        # ── Org managers (role-based, org-scoped) ──────────────────────────────
        {
            'email': 'manager@bandhu.org',
            'password': 'REDACTED',
            'full_name': 'Bandhu Manager',
            'organisation': 'Bandhu',
            'role': 'manager',
        },
        {
            'email': 'manager@phd.org',
            'password': 'REDACTED',
            'full_name': 'PHD Manager',
            'organisation': 'PHD',
            'role': 'manager',
        },
    ]

    def handle(self, *args, **options):
        User = get_user_model()
        for u in self.USERS:
            if User.objects.filter(email=u['email']).exists():
                self.stdout.write(f"  exists  {u['email']}")
            else:
                User.objects.create_superuser(
                    email=u['email'],
                    password=u['password'],
                    full_name=u['full_name'],
                    organisation=u['organisation'],
                    role=u['role'],
                )
                self.stdout.write(self.style.SUCCESS(f"  created {u['email']}"))
