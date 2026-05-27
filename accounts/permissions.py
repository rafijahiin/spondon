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
            return u.role in (Role.DEVELOPER, Role.SUPERVISOR, Role.ORG_LEAD)
        return u.can_configure_targets(partner)

    def has_object_permission(self, request, view, obj):
        u = request.user
        if request.method in SAFE_METHODS:
            return True
        # `obj.partner` may be a Partner FK instance (new IndicatorTarget
        # shape) or a raw string (legacy models). Normalise to the code.
        partner_obj = getattr(obj, 'partner', None)
        if partner_obj is None:
            partner_code = getattr(obj, 'organisation', '')
        elif hasattr(partner_obj, 'code'):
            partner_code = partner_obj.code
        else:
            partner_code = partner_obj   # already a string
        return u.can_configure_targets(partner_code)


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


# ── Cross-org / multi-role membership classes ────────────────────────────────
#
# The legacy `IsSuperAdmin*` names have been removed entirely (audit FIX 1.2).
# The new names below carry the same membership rules but read accurately
# against the 7-role taxonomy — no role called "super admin" ever existed
# in the new taxonomy, and the rename eliminates a class of bugs where the
# reader assumed Sayeed (ORG_LEAD) had only narrow access.

class IsSupervisorOrOrgLead(BasePermission):
    """Cross-org read/write — accepts SUPERVISOR + ORG_LEAD.

    Replaces the deprecated `IsSuperAdmin`. CIPRB org lead (Sayeed) retains
    his full-CIPRB access plus read-only-others through this class."""
    def has_permission(self, request, view):
        u = request.user
        return u.is_authenticated and u.role in (Role.SUPERVISOR, Role.ORG_LEAD)


class IsSupervisorOrManager(BasePermission):
    """Generic authenticated-app-user gate — accepts everyone except FOCAL
    and CIPRB_BASELINE on the write path. Used by dashboard and tracker
    endpoints that every operational role consumes.

    Replaces the deprecated `IsSuperAdminOrManager`."""
    def has_permission(self, request, view):
        u = request.user
        return u.is_authenticated and u.role in (
            Role.SUPERVISOR, Role.ORG_LEAD,
            Role.MANAGER, Role.DEVELOPER, Role.FIELD_STAFF,
        )


class IsSupervisorOrDeveloper(BasePermission):
    """Cross-org admin gate — accepts DEVELOPER + SUPERVISOR.

    Used where Rafi + Animesh + Rokhsana need access but not org leads."""
    def has_permission(self, request, view):
        u = request.user
        return u.is_authenticated and u.role in (Role.DEVELOPER, Role.SUPERVISOR)


class IsDeveloperOnly(BasePermission):
    """Developer-only gate — used by user-management endpoints (audit FIX 1.4).

    Supervisor retains all other access, but cannot manage users. Only
    Rafi (DEVELOPER) can create / modify / deactivate user accounts."""
    def has_permission(self, request, view):
        u = request.user
        return u.is_authenticated and u.role == Role.DEVELOPER


# ── OrgFilterMixin ────────────────────────────────────────────────────────────

class OrgFilterMixin:
    """
    DRF ViewSet mixin enforcing org-level queryset isolation.
    Supervisors, developers, and org leads see all rows (org leads see
    other-org rows read-only — write blocked at the permission layer).
    Managers / focal see only rows where `org_field` matches their org.

    Audit FIX 15.7 — field staff see only their OWN entries on top of the
    org filter. The mixin probes the model for an `approved_by` /
    `submitted_by` / `created_by` field (whichever exists, in that order)
    and adds a per-user filter when the user is FIELD_STAFF. Models without
    any such field fall back to plain org isolation (no leak — just a
    less-strict scope than the spec demands).
    """
    org_field = 'partner'

    # Candidate per-row owner fields, in priority order. The first one
    # that exists on the model is used.
    OWNER_FIELDS = ('submitted_by', 'created_by', 'approved_by', 'prescribed_by')

    def _owner_field_for(self, model):
        for fname in self.OWNER_FIELDS:
            if any(f.name == fname for f in model._meta.get_fields()):
                return fname
        return None

    def get_queryset(self):
        qs = super().get_queryset()
        user = self.request.user
        if user.can_see_all_orgs or user.can_read_other_orgs:
            return qs

        # Org scope.
        qs = qs.filter(**{self.org_field: user.organisation})

        # Audit FIX 15.7 — field staff additionally restricted to own entries.
        from .models import Role
        if user.role == Role.FIELD_STAFF:
            owner = self._owner_field_for(qs.model)
            if owner is not None:
                qs = qs.filter(**{owner: user})

        return qs
