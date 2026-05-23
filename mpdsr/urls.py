from rest_framework.routers import DefaultRouter
from . import views

router = DefaultRouter()
router.register(r'cases', views.MPDSRCaseViewSet, basename='mpdsr')

urlpatterns = router.urls
