from rest_framework.permissions import BasePermission
from .models import Role


class IsSuperAdmin(BasePermission):
    """Super admins only."""

    def has_permission(self, request, view):
        return (
            request.user.is_authenticated
            and request.user.role == Role.SUPER_ADMIN
        )


class IsManager(BasePermission):
    """Managers and developers."""

    def has_permission(self, request, view):
        return (
            request.user.is_authenticated
            and request.user.role in (Role.MANAGER, Role.DEVELOPER)
        )


class IsSuperAdminOrManager(BasePermission):
    """Super admins, managers, or developers. Used by most dashboard views."""

    def has_permission(self, request, view):
        return (
            request.user.is_authenticated
            and request.user.role in (Role.SUPER_ADMIN, Role.MANAGER, Role.DEVELOPER)
        )


class IsDeveloper(BasePermission):
    def has_permission(self, request, view):
        return (
            request.user.is_authenticated
            and request.user.role == Role.DEVELOPER
        )


class IsSuperAdminOrDeveloper(BasePermission):
    """Super admins or developers. Used for user management and other admin-only actions."""

    def has_permission(self, request, view):
        return (
            request.user.is_authenticated
            and request.user.role in (Role.SUPER_ADMIN, Role.DEVELOPER)
        )


class OrgFilterMixin:
    """
    DRF ViewSet mixin enforcing org-level queryset isolation.
    Super admins and developers see all rows.
    Managers see only rows where `org_field` matches their organisation.
    Set `org_field` on the ViewSet to match the model's partner column.
    """

    org_field = 'partner'

    def get_queryset(self):
        qs = super().get_queryset()
        if self.request.user.can_see_all_orgs:
            return qs
        return qs.filter(**{self.org_field: self.request.user.organisation})
