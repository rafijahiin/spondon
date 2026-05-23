from django.test import TestCase
from django.urls import reverse
from rest_framework.test import APIClient

from .models import Organisation, Role, User


def make_user(email, org, role, password='testpass123'):
    return User.objects.create_user(
        email=email,
        password=password,
        full_name='Test User',
        organisation=org,
        role=role,
    )


# ---------------------------------------------------------------------------
# Model tests
# ---------------------------------------------------------------------------

class UserModelTest(TestCase):
    def test_create_user_sets_fields(self):
        user = make_user('a@phd.org', Organisation.PHD, Role.MANAGER)
        self.assertEqual(user.organisation, Organisation.PHD)
        self.assertEqual(user.role, Role.MANAGER)
        self.assertTrue(user.is_active)
        self.assertFalse(user.is_staff)

    def test_email_is_username_field(self):
        self.assertEqual(User.USERNAME_FIELD, 'email')

    def test_super_admin_can_see_all_orgs(self):
        user = make_user('a@ciprb.org', Organisation.CIPRB, Role.SUPER_ADMIN)
        self.assertTrue(user.can_see_all_orgs)

    def test_developer_can_see_all_orgs(self):
        user = make_user('dev@ciprb.org', Organisation.CIPRB, Role.DEVELOPER)
        self.assertTrue(user.can_see_all_orgs)

    def test_manager_cannot_see_all_orgs(self):
        user = make_user('m@phd.org', Organisation.PHD, Role.MANAGER)
        self.assertFalse(user.can_see_all_orgs)

    def test_is_super_admin_property(self):
        user = make_user('a@ciprb.org', Organisation.CIPRB, Role.SUPER_ADMIN)
        self.assertTrue(user.is_super_admin)
        self.assertFalse(user.is_manager)

    def test_is_manager_property(self):
        user = make_user('m@phd.org', Organisation.PHD, Role.MANAGER)
        self.assertTrue(user.is_manager)
        self.assertFalse(user.is_super_admin)

    def test_create_superuser_sets_flags(self):
        user = User.objects.create_superuser('admin@ciprb.org', 'pass123')
        self.assertTrue(user.is_staff)
        self.assertTrue(user.is_superuser)

    def test_user_str_contains_org(self):
        user = make_user('a@phd.org', Organisation.PHD, Role.MANAGER)
        self.assertIn('PHD', str(user))

    def test_email_is_normalised(self):
        user = make_user('Test@PHD.ORG', Organisation.PHD, Role.MANAGER)
        self.assertEqual(user.email, 'Test@phd.org')

    def test_no_email_raises(self):
        with self.assertRaises(ValueError):
            User.objects.create_user(
                email='',
                password='pass123',
                full_name='No Email',
                organisation=Organisation.PHD,
            )


# ---------------------------------------------------------------------------
# Login view
# ---------------------------------------------------------------------------

class LoginViewTest(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.url = reverse('login')
        self.manager = make_user('manager@phd.org', Organisation.PHD, Role.MANAGER)

    def test_login_success_manager(self):
        r = self.client.post(self.url, {'email': 'manager@phd.org', 'password': 'testpass123'})
        self.assertEqual(r.status_code, 200)
        self.assertFalse(r.data['requires_2fa'])
        self.assertEqual(r.data['user']['email'], 'manager@phd.org')
        self.assertEqual(r.data['user']['organisation'], 'PHD')

    def test_login_wrong_password(self):
        r = self.client.post(self.url, {'email': 'manager@phd.org', 'password': 'wrongpass'})
        self.assertEqual(r.status_code, 400)

    def test_login_missing_fields(self):
        r = self.client.post(self.url, {'email': 'manager@phd.org'})
        self.assertEqual(r.status_code, 400)

    def test_login_super_admin_requires_2fa(self):
        make_user('admin@ciprb.org', Organisation.CIPRB, Role.SUPER_ADMIN)
        r = self.client.post(self.url, {'email': 'admin@ciprb.org', 'password': 'testpass123'})
        self.assertEqual(r.status_code, 200)
        self.assertTrue(r.data['requires_2fa'])
        self.assertFalse(r.data['totp_enrolled'])

    def test_login_inactive_user(self):
        self.manager.is_active = False
        self.manager.save()
        r = self.client.post(self.url, {'email': 'manager@phd.org', 'password': 'testpass123'})
        self.assertEqual(r.status_code, 400)


# ---------------------------------------------------------------------------
# Me view
# ---------------------------------------------------------------------------

class MeViewTest(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = make_user('m@phd.org', Organisation.PHD, Role.MANAGER)

    def test_me_authenticated_returns_user_data(self):
        self.client.force_authenticate(user=self.user)
        r = self.client.get(reverse('me'))
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.data['organisation'], 'PHD')
        self.assertEqual(r.data['role'], 'manager')

    def test_me_unauthenticated_returns_403(self):
        r = self.client.get(reverse('me'))
        self.assertEqual(r.status_code, 403)

    def test_me_does_not_expose_password(self):
        self.client.force_authenticate(user=self.user)
        r = self.client.get(reverse('me'))
        self.assertNotIn('password', r.data)


# ---------------------------------------------------------------------------
# Password change
# ---------------------------------------------------------------------------

class PasswordChangeViewTest(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = make_user('m@phd.org', Organisation.PHD, Role.MANAGER)
        self.client.force_authenticate(user=self.user)
        self.url = reverse('password-change')

    def test_password_change_success(self):
        r = self.client.post(self.url, {
            'current_password': 'testpass123',
            'new_password': 'NewSecurePass456!',
        })
        self.assertEqual(r.status_code, 200)
        self.user.refresh_from_db()
        self.assertTrue(self.user.check_password('NewSecurePass456!'))

    def test_wrong_current_password_rejected(self):
        r = self.client.post(self.url, {
            'current_password': 'wrongpass',
            'new_password': 'NewSecurePass456!',
        })
        self.assertEqual(r.status_code, 400)

    def test_unauthenticated_rejected(self):
        self.client.force_authenticate(user=None)
        r = self.client.post(self.url, {
            'current_password': 'testpass123',
            'new_password': 'NewSecurePass456!',
        })
        self.assertEqual(r.status_code, 403)


# ---------------------------------------------------------------------------
# Logout view
# ---------------------------------------------------------------------------

class LogoutViewTest(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = make_user('m@phd.org', Organisation.PHD, Role.MANAGER)

    def test_logout_success(self):
        self.client.force_authenticate(user=self.user)
        r = self.client.post(reverse('logout'))
        self.assertEqual(r.status_code, 200)


# ---------------------------------------------------------------------------
# Org isolation — middleware attaches correct attributes
# ---------------------------------------------------------------------------

class OrgMiddlewareTest(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.phd_manager = make_user('m@phd.org', Organisation.PHD, Role.MANAGER)
        self.bondhu_manager = make_user('m@bondhu.org', Organisation.BONDHU, Role.MANAGER)

    def test_phd_manager_org_in_response(self):
        self.client.force_authenticate(user=self.phd_manager)
        r = self.client.get(reverse('me'))
        self.assertEqual(r.data['organisation'], 'PHD')

    def test_bondhu_manager_org_in_response(self):
        self.client.force_authenticate(user=self.bondhu_manager)
        r = self.client.get(reverse('me'))
        self.assertEqual(r.data['organisation'], 'Bondhu')


# ---------------------------------------------------------------------------
# User management (super admin only)
# ---------------------------------------------------------------------------

class UserViewSetTest(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.manager = make_user('m@phd.org', Organisation.PHD, Role.MANAGER)

    def test_manager_cannot_list_users(self):
        self.client.force_authenticate(user=self.manager)
        r = self.client.get('/api/accounts/users/')
        # 403 — IsSuperAdmin rejects non-super-admin
        self.assertEqual(r.status_code, 403)
