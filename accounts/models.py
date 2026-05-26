import uuid
from django.db import models
from django.contrib.auth.models import AbstractBaseUser, BaseUserManager, PermissionsMixin
from django.utils import timezone


class Organisation(models.TextChoices):
    CIPRB = 'CIPRB', 'CIPRB'
    UNFPA = 'UNFPA', 'UNFPA'
    PHD = 'PHD', 'PHD'
    BANDHU = 'Bandhu', 'Bandhu'


class Role(models.TextChoices):
    """7-role taxonomy per IDMS Developer Handoff, May 2026."""
    DEVELOPER       = 'developer',       'Developer'
    SUPERVISOR      = 'supervisor',      'UNFPA / Supervisor'
    ORG_LEAD        = 'org_lead',        'Org Lead'
    MANAGER         = 'manager',         'Wellness Center Manager'
    FIELD_STAFF     = 'field_staff',     'Field Staff / Lab Technician'
    CIPRB_BASELINE  = 'ciprb_baseline',  'CIPRB Baseline Entry'
    FOCAL           = 'focal',           'Focal Person (view-only)'


class UserManager(BaseUserManager):
    def create_user(self, email, password=None, **extra_fields):
        if not email:
            raise ValueError('Email is required')
        email = self.normalize_email(email)
        user = self.model(email=email, **extra_fields)
        user.set_password(password)
        user.save(using=self._db)
        return user

    def create_superuser(self, email, password=None, **extra_fields):
        extra_fields.setdefault('full_name', 'Superuser')
        extra_fields.setdefault('role', Role.DEVELOPER)
        extra_fields.setdefault('organisation', Organisation.CIPRB)
        extra_fields.setdefault('is_staff', True)
        extra_fields.setdefault('is_superuser', True)
        return self.create_user(email, password, **extra_fields)


class User(AbstractBaseUser, PermissionsMixin):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    email = models.EmailField(unique=True)
    full_name = models.CharField(max_length=200)
    organisation = models.CharField(max_length=20, choices=Organisation.choices)
    role = models.CharField(max_length=20, choices=Role.choices, default=Role.MANAGER)
    is_active = models.BooleanField(default=True)
    is_staff = models.BooleanField(default=False)
    date_joined = models.DateTimeField(default=timezone.now)

    USERNAME_FIELD = 'email'
    REQUIRED_FIELDS = ['full_name', 'organisation']

    objects = UserManager()

    class Meta:
        ordering = ['full_name']

    def __str__(self):
        return f'{self.full_name} ({self.organisation})'

    # ── Role identity helpers ─────────────────────────────────────────────
    @property
    def is_developer(self):
        return self.role == Role.DEVELOPER

    @property
    def is_supervisor(self):
        return self.role == Role.SUPERVISOR

    @property
    def is_org_lead(self):
        return self.role == Role.ORG_LEAD

    @property
    def is_manager(self):
        return self.role == Role.MANAGER

    @property
    def is_field_staff(self):
        return self.role == Role.FIELD_STAFF

    @property
    def is_ciprb_baseline(self):
        return self.role == Role.CIPRB_BASELINE

    @property
    def is_focal(self):
        return self.role == Role.FOCAL

    # ── Capability checks (use these, not raw role compares) ──────────────
    @property
    def can_see_all_orgs(self):
        """Full cross-org dashboard access. UNFPA + system maintenance only."""
        return self.role in (Role.DEVELOPER, Role.SUPERVISOR)

    @property
    def can_read_other_orgs(self):
        """Read-only visibility into other orgs' aggregated dashboards.
        Includes ORG_LEAD (CIPRB Sayeed-style — full own org, read-only others)."""
        return self.role in (Role.DEVELOPER, Role.SUPERVISOR, Role.ORG_LEAD)

    @property
    def can_approve_submissions(self):
        """Approve/reject pending Kobo submissions for own org.
        Managers approve their own center's submissions; Supervisor/Dev/OrgLead
        approve broader. Field staff, focal, baseline — never."""
        return self.role in (
            Role.DEVELOPER, Role.SUPERVISOR, Role.ORG_LEAD, Role.MANAGER,
        )

    def can_configure_targets(self, partner: str) -> bool:
        """Edit IndicatorTarget rows. Supervisor + Developer for any partner;
        Org Lead only for their own org. Everyone else: never."""
        if self.role in (Role.DEVELOPER, Role.SUPERVISOR):
            return True
        if self.role == Role.ORG_LEAD:
            return partner == self.organisation
        return False

    @property
    def can_enter_field_records(self):
        """Write access to HTC, HIV/STI, GBV, Mental Health records.
        Field staff (own center) only — managers are explicitly excluded.
        Dev/Supervisor/OrgLead retain write for admin/seed scenarios."""
        return self.role in (
            Role.DEVELOPER, Role.SUPERVISOR, Role.ORG_LEAD, Role.FIELD_STAFF,
        )

    @property
    def can_enter_outreach_records(self):
        """Write access to Outreach Movement Register + Community Sessions.
        Manager-only per the handoff (mandatory, cannot delegate).
        Dev/Supervisor/OrgLead retain write for admin scenarios."""
        return self.role in (
            Role.DEVELOPER, Role.SUPERVISOR, Role.ORG_LEAD, Role.MANAGER,
        )

    @property
    def can_access_mpdsr(self):
        """MPDSR is CIPRB-owned. Dev + Supervisor see all; Org Lead only
        if their organisation is CIPRB. Managers (PHD/Bandhu) lose access."""
        if self.role in (Role.DEVELOPER, Role.SUPERVISOR):
            return True
        if self.role == Role.ORG_LEAD:
            return self.organisation == Organisation.CIPRB
        return False
