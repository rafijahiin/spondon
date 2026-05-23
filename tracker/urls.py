from django.urls import path
from rest_framework.routers import DefaultRouter
from . import views

router = DefaultRouter()
router.register(r'targets', views.MonthlyTargetViewSet, basename='tracker-targets')
router.register(r'alerts', views.AlertViewSet, basename='tracker-alerts')

urlpatterns = router.urls + [
    path('forecast/', views.ForecastView.as_view(), name='tracker-forecast'),
]
