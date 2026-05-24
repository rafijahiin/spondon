from django.urls import path
from .webhook import programs_webhook

urlpatterns = [
    path('', programs_webhook, name='programs-webhook'),
]
