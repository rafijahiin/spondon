from rest_framework.routers import DefaultRouter
from . import views

router = DefaultRouter()
router.register(r'surveys', views.BaselineSurveyViewSet, basename='baseline')

urlpatterns = router.urls
