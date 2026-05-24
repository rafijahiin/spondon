from django.contrib import admin
from django.urls import path, include, re_path
from django.conf import settings
from django.http import HttpResponse, Http404, JsonResponse
from rest_framework.routers import DefaultRouter
from accounts.views import UserViewSet

def react_app(request, *args, **kwargs):
    index = settings.BASE_DIR / 'frontend' / 'dist' / 'index.html'
    if not index.exists():
        raise Http404('Frontend not built. Run: cd frontend && npm run build')
    return HttpResponse(index.read_text(encoding='utf-8'), content_type='text/html')

def health(request):
    return HttpResponse('ok', content_type='text/plain')

def setup_users(request):
    import os
    secret = request.GET.get('secret', '')
    if secret != 'REDACTED':
        return HttpResponse('Forbidden', status=403)
    from django.contrib.auth import get_user_model
    User = get_user_model()
    results = []
    users = [
        {'username': 'rafijahiin', 'email': 'rafijahiin@gmail.com', 'password': 'REDACTED', 'is_superuser': True},
        {'username': 'ciprb_admin', 'email': '', 'password': 'REDACTED', 'is_superuser': True},
        {'username': 'unfpa_admin', 'email': '', 'password': 'REDACTED', 'is_superuser': True},
    ]
    for u in users:
        if User.objects.filter(username=u['username']).exists():
            results.append(f"{u['username']}: already exists")
        else:
            User.objects.create_superuser(u['username'], u['email'], u['password'])
            results.append(f"{u['username']}: created")
    return JsonResponse({'results': results})

_admin_router = DefaultRouter()
_admin_router.register('users', UserViewSet, basename='admin-user')

urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/health/', health),
    path('setup/', setup_users),
    path('api/accounts/', include('accounts.urls')),
    path('api/admin/', include(_admin_router.urls)),
    path('api/submissions/', include('submissions.urls')),
    path('api/dashboard/', include('dashboard.urls')),
    path('api/fistula/', include('fistula.urls')),
    path('api/mpdsr/', include('mpdsr.urls')),
    path('api/tracker/', include('tracker.urls')),
    path('api/reports/', include('reports.urls')),
    path('api/baseline/', include('baseline.urls')),
    path('api/training/', include('training.urls')),
    path('webhook/kobo/', include('submissions.webhook_urls')),
    # SPA catch-all — must be last
    re_path(r'^.*$', react_app),
]
