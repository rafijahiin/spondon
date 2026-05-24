from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand


class Command(BaseCommand):
    help = 'Create default users if they do not exist (idempotent)'

    USERS = [
        {
            'email': 'rafijahiin@gmail.com',
            'password': 'REDACTED',
            'full_name': 'Rafi Jahin',
            'organisation': 'CIPRB',
            'role': 'developer',
        },
        {
            'email': 'ciprb@spondon.app',
            'password': 'REDACTED',
            'full_name': 'CIPRB Admin',
            'organisation': 'CIPRB',
            'role': 'super_admin',
        },
        {
            'email': 'unfpa@spondon.app',
            'password': 'REDACTED',
            'full_name': 'UNFPA Admin',
            'organisation': 'UNFPA',
            'role': 'super_admin',
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
