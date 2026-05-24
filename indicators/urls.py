from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import IndicatorTargetViewSet, IndicatorProgressView, SingleIndicatorProgressView

router = DefaultRouter()
router.register('targets', IndicatorTargetViewSet, basename='indicator-target')

urlpatterns = [
    path('', include(router.urls)),
    path('progress/', IndicatorProgressView.as_view(), name='indicator-progress'),
    path('progress/<str:code>/', SingleIndicatorProgressView.as_view(), name='indicator-progress-single'),
]
