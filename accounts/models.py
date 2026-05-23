import uuid
from django.db import models
from django.contrib.auth.models import AbstractBaseUser, BaseUserManager, PermissionsMixin
from django.utils import timezone


class Organisation(models.TextChoices):
    CIPRB = 'CIPRB', 'CIPRB'
    UNFPA = 'UNFPA', 'UNFPA'
    PHD = 'PHD', 'PHD'
    BONDHU = 'Bondhu', 'Bondhu'


class Role(models.TextChoices):
    SUPER_ADMIN = 'super_admin', 'Super Admin'
    MANAGER = 'manager', 'Manager'
    DEVELOPER = 'developer', 'Developer'


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

    @property
    def is_super_admin(self):
        return self.role == Role.SUPER_ADMIN

    @property
    def is_manager(self):
        return self.role == Role.MANAGER

    @property
    def is_developer(self):
        return self.role == Role.DEVELOPER

    @property
    def can_see_all_orgs(self):
        return self.role in (Role.SUPER_ADMIN, Role.DEVELOPER)
