from django.urls import include, path
from rest_framework.routers import DefaultRouter
from . import views

router = DefaultRouter()
router.register('cases', views.FistulaCaseViewSet, basename='fistula')

urlpatterns = [
    path('', include(router.urls)),
]
