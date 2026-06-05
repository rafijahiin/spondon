from django.apps import AppConfig


class ProgramsConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'programs'
    verbose_name = 'SRHR Programmes'

    def ready(self):
        # Import once at app boot so the post_save receiver registers.
        # Module side-effects only; nothing else to call.
        from . import signals  # noqa: F401
