import hashlib
import hmac

from django.conf import settings


def validate_kobo_signature(request) -> bool:
    """
    Two validation modes:

    1. HMAC-SHA256: KoboToolbox (or a proxy) sends
       Authorization: Token <hex_digest_of_body>
       We verify by recomputing HMAC(secret, raw_body, sha256).

    2. Simple token: ?token=<secret> in the query string —
       the common pattern when KoboToolbox is configured to call
       a URL that embeds the secret.

    If KOBO_WEBHOOK_SECRET is empty (dev / placeholder), every
    request passes so we can test the endpoint locally.
    """
    secret = settings.KOBO_WEBHOOK_SECRET
    if not secret:
        return True

    auth = request.headers.get('Authorization', '')
    if auth.startswith('Token '):
        received = auth[6:].strip()
        expected = hmac.new(
            secret.encode('utf-8'),
            request.body,
            hashlib.sha256,
        ).hexdigest()
        return hmac.compare_digest(received, expected)

    token = request.GET.get('token', '')
    return hmac.compare_digest(token, secret)
