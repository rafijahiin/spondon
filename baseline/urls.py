from rest_framework.routers import DefaultRouter
from . import views

router = DefaultRouter()
router.register(r'surveys', views.BaselineSurveyViewSet, basename='baseline')
router.register(r'responses', views.BaselineResponseViewSet, basename='baseline-response')
router.register(r'verification', views.BaselineVerificationViewSet, basename='baseline-verification')

urlpatterns = router.urls
