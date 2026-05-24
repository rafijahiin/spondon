from django.contrib import admin
from django.conf.urls.static import static
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
    secret = request.GET.get('secret', '')
    if secret != 'REDACTED':
        return HttpResponse('Forbidden', status=403)
    from django.contrib.auth import get_user_model
    User = get_user_model()
    results = []
    users = [
        {'email': 'rafijahiin@gmail.com', 'password': 'REDACTED', 'full_name': 'Rafi Jahin', 'organisation': 'CIPRB', 'role': 'developer'},
        {'email': 'ciprb@spondon.app', 'password': 'REDACTED', 'full_name': 'CIPRB Admin', 'organisation': 'CIPRB', 'role': 'super_admin'},
        {'email': 'unfpa@spondon.app', 'password': 'REDACTED', 'full_name': 'UNFPA Admin', 'organisation': 'UNFPA', 'role': 'super_admin'},
    ]
    for u in users:
        if User.objects.filter(email=u['email']).exists():
            results.append(f"{u['email']}: already exists")
        else:
            User.objects.create_superuser(
                email=u['email'],
                password=u['password'],
                full_name=u['full_name'],
                organisation=u['organisation'],
                role=u['role'],
            )
            results.append(f"{u['email']}: created")
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
    path('api/programs/', include('programs.urls')),
    path('api/indicators/', include('indicators.urls')),
    path('webhook/kobo/', include('submissions.webhook_urls')),
    path('webhook/programs/', include('programs.webhook_urls')),
    re_path(r'^.*$', react_app),
]

urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
