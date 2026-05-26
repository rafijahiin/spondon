"""
Permission classes for the IDMS role taxonomy.

Two layers:

  1. Identity classes — `IsSupervisor`, `IsManager`, etc. — check one role.
     Use sparingly; prefer capability classes.

  2. Capability classes — `CanApproveSubmissions`, `CanConfigureTargets`,
     `CanWriteFieldRecord`, `CanWriteOutreach`, `CanAccessMPDSR` — encapsulate
     the rules in the User-model capability methods. Views should use these
     so the permission rules live in one place (the User model) and not
     scattered across ViewSets.

Backward-compat aliases (`IsSuperAdmin`, `IsSuperAdminOrManager`,
`IsSuperAdminOrDeveloper`) are kept so the migration to new roles can land
without touching every ViewSet at once. They will be removed in a follow-up
commit after every call site is migrated to the new classes.
"""
from rest_framework.permissions import BasePermission, SAFE_METHODS

from .models import Role


# ── Identity classes ──────────────────────────────────────────────────────────

class _RoleIn(BasePermission):
    """Internal helper: subclass and set `roles` to a tuple of Role values."""
    roles: tuple = ()

    def has_permission(self, request, view):
        return (
            request.user.is_authenticated
            and request.user.role in self.roles
        )


class IsDeveloper(_RoleIn):
    roles = (Role.DEVELOPER,)


class IsSupervisor(_RoleIn):
    roles = (Role.SUPERVISOR,)


class IsOrgLead(_RoleIn):
    roles = (Role.ORG_LEAD,)


class IsManager(_RoleIn):
    """Manager only. For write actions, prefer CanWriteOutreach."""
    roles = (Role.MANAGER,)


class IsFieldStaff(_RoleIn):
    roles = (Role.FIELD_STAFF,)


class IsCIPRBBaseline(_RoleIn):
    roles = (Role.CIPRB_BASELINE,)


class IsFocal(_RoleIn):
    roles = (Role.FOCAL,)


# ── Capability classes (preferred) ────────────────────────────────────────────

class CanApproveSubmissions(BasePermission):
    """Approve/reject Kobo submissions. Manager+Org Lead+Supervisor+Developer."""
    def has_permission(self, request, view):
        u = request.user
        return u.is_authenticated and u.can_approve_submissions


class CanConfigureTargets(BasePermission):
    """
    Edit IndicatorTarget rows.

    Supervisor/Developer for any partner; Org Lead only for their own org.
    For write actions, the partner being edited is taken from request body
    (`partner` field) or the URL/query. Falls back to instance.partner for
    detail actions.
    """
    def has_permission(self, request, view):
        u = request.user
        if not u.is_authenticated:
            return False
        if request.method in SAFE_METHODS:
            # Read access is broader — covered by CanReadIndicatorTargets if
            # we add it later; for now read uses the org filter on the
            # queryset.
            return True
        # Determine partner from request data
        partner = (
            request.data.get('partner')
            if hasattr(request, 'data') else None
        ) or request.query_params.get('partner', '')
        # If not specified on a write, fall through to per-object check
        if not partner:
            # Detail actions (PATCH /targets/<id>/) — check via object below.
            return u.role in (
                Role.DEVELOPER, Role.SUPERVISOR, Role.ORG_LEAD, Role.SUPER_ADMIN,
            )
        return u.can_configure_targets(partner)

    def has_object_permission(self, request, view, obj):
        u = request.user
        if request.method in SAFE_METHODS:
            return True
        partner = getattr(obj, 'partner', '') or getattr(obj, 'organisation', '')
        return u.can_configure_targets(partner)


class CanWriteFieldRecord(BasePermission):
    """
    Write access for FIELD records: HTC, HIV/STI, GBV, MH (depression/PTSD).

    These records originate from field staff via Kobo. Managers are
    EXPLICITLY excluded from write — managers approve, not enter.

    Read access is granted to all authenticated users (queryset filtering
    enforces org isolation downstream).
    """
    def has_permission(self, request, view):
        u = request.user
        if not u.is_authenticated:
            return False
        if request.method in SAFE_METHODS:
            return True
        return u.can_enter_field_records


class CanWriteOutreach(BasePermission):
    """
    Write access for Outreach Movement Register + Community Sessions.

    Mandatory for managers per the handoff; cannot delegate. Field staff are
    explicitly excluded — they record clinical encounters, not outreach.
    """
    def has_permission(self, request, view):
        u = request.user
        if not u.is_authenticated:
            return False
        if request.method in SAFE_METHODS:
            return True
        return u.can_enter_outreach_records


class CanAccessMPDSR(BasePermission):
    """
    MPDSR is CIPRB-owned. Dev + Supervisor see all; Org Lead only if
    organisation is CIPRB. Everyone else (managers, field staff, focal,
    baseline) gets 403.
    """
    def has_permission(self, request, view):
        u = request.user
        return u.is_authenticated and u.can_access_mpdsr


# ── Backward-compat aliases (DO NOT add new uses; deprecate in follow-up) ─────

class IsSuperAdmin(BasePermission):
    """Deprecated. Use IsSupervisor for UNFPA-style access, IsOrgLead for
    CIPRB-style. Retained so the data migration can land before every view
    is updated."""
    def has_permission(self, request, view):
        u = request.user
        return u.is_authenticated and u.role in (
            Role.SUPER_ADMIN, Role.SUPERVISOR, Role.ORG_LEAD,
        )


class IsSuperAdminOrManager(BasePermission):
    """Deprecated. Most read-only dashboard views accept this. New code should
    use a specific capability class (CanApproveSubmissions, CanWriteOutreach,
    etc.) or rely on the queryset's org filter alone."""
    def has_permission(self, request, view):
        u = request.user
        return u.is_authenticated and u.role in (
            Role.SUPER_ADMIN, Role.SUPERVISOR, Role.ORG_LEAD,
            Role.MANAGER, Role.DEVELOPER, Role.FIELD_STAFF,
        )


class IsSuperAdminOrDeveloper(BasePermission):
    """Deprecated. User management endpoint protector. Only DEV and
    SUPERVISOR retain this level post-migration."""
    def has_permission(self, request, view):
        u = request.user
        return u.is_authenticated and u.role in (
            Role.DEVELOPER, Role.SUPERVISOR, Role.SUPER_ADMIN,
        )


# ── OrgFilterMixin (unchanged from the old file) ──────────────────────────────

class OrgFilterMixin:
    """
    DRF ViewSet mixin enforcing org-level queryset isolation.
    Super admins, supervisors, developers, and org leads see all rows (org
    leads see other-org rows read-only — write blocked at the permission
    layer). Managers / field staff / focal see only rows where `org_field`
    matches their organisation.
    """
    org_field = 'partner'

    def get_queryset(self):
        qs = super().get_queryset()
        if self.request.user.can_see_all_orgs or self.request.user.can_read_other_orgs:
            return qs
        return qs.filter(**{self.org_field: self.request.user.organisation})
