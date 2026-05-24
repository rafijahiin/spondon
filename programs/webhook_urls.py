from django.urls import path
from .webhook import programs_webhook, programs_webhook_phd, programs_webhook_bondhu

urlpatterns = [
    # Org-specific endpoints (recommended) — submissions are tagged by URL,
    # so the KoboToolbox form does not need an explicit organisation field.
    #
    # KoboToolbox REST Service setup per form:
    #   PHD forms   → URL: https://<domain>/webhook/programs/PHD/
    #   Bondhu forms → URL: https://<domain>/webhook/programs/Bondhu/
    #   Method: POST
    #   Header: Authorization: Token REDACTED
    path('PHD/',    programs_webhook_phd,    name='programs-webhook-phd'),
    path('Bondhu/', programs_webhook_bondhu, name='programs-webhook-bondhu'),

    # Shared fallback — org resolved from payload's `organisation` /
    # `partner_org` / `partner` field (used when both orgs share one form set).
    path('', programs_webhook, name='programs-webhook'),
]
