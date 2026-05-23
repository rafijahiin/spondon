import io
import base64

import qrcode
from django.contrib.auth import login, logout, update_session_auth_hash
from django.utils.decorators import method_decorator
from django.views.decorators.csrf import ensure_csrf_cookie
from django_otp import login as otp_login
from django_otp.plugins.otp_totp.models import TOTPDevice
from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.viewsets import ModelViewSet

from .models import User
from .permissions import IsSuperAdmin
from .serializers import (
    AdminUserSerializer,
    LoginSerializer,
    PasswordChangeSerializer,
    TOTPVerifySerializer,
    UserCreateSerializer,
    UserSerializer,
)


class CSRFView(APIView):
    """Called by the frontend on mount to obtain the CSRF cookie."""
    permission_classes = [permissions.AllowAny]

    @method_decorator(ensure_csrf_cookie)
    def get(self, request):
        return Response({'detail': 'CSRF cookie set.'})


class LoginView(APIView):
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        serializer = LoginSerializer(data=request.data, context={'request': request})
        serializer.is_valid(raise_exception=True)
        user = serializer.validated_data['user']

        login(request, user)

        if user.is_super_admin:
            enrolled = TOTPDevice.objects.filter(user=user, confirmed=True).exists()
            return Response({
                'requires_2fa': True,
                'totp_enrolled': enrolled,
                'user': UserSerializer(user).data,
            })

        return Response({'requires_2fa': False, 'user': UserSerializer(user).data})


class LogoutView(APIView):
    def post(self, request):
        logout(request)
        return Response({'detail': 'Logged out.'})


class MeView(APIView):
    def get(self, request):
        if request.user.is_super_admin and not is_verified(request.user):
            return Response(
                {'detail': 'TOTP verification required.'},
                status=status.HTTP_403_FORBIDDEN,
            )
        return Response(UserSerializer(request.user).data)


class PasswordChangeView(APIView):
    def post(self, request):
        serializer = PasswordChangeSerializer(
            data=request.data, context={'request': request}
        )
        serializer.is_valid(raise_exception=True)
        request.user.set_password(serializer.validated_data['new_password'])
        request.user.save()
        update_session_auth_hash(request, request.user)
        return Response({'detail': 'Password changed.'})


class TOTPEnrolView(APIView):
    """
    GET  — generate a fresh QR code for the super admin to scan.
    POST — confirm enrolment by verifying the first token from the authenticator.
    """

    def get(self, request):
        if not request.user.is_super_admin:
            return Response(
                {'detail': 'Only super admins require 2FA.'},
                status=status.HTTP_403_FORBIDDEN,
            )

        TOTPDevice.objects.filter(user=request.user, confirmed=False).delete()
        device = TOTPDevice.objects.create(
            user=request.user,
            name=f'{request.user.email} TOTP',
            confirmed=False,
        )

        img = qrcode.make(device.config_url)
        buf = io.BytesIO()
        img.save(buf, format='PNG')
        qr_b64 = base64.b64encode(buf.getvalue()).decode()

        return Response({
            'qr_code': f'data:image/png;base64,{qr_b64}',
            'config_url': device.config_url,
        })

    def post(self, request):
        if not request.user.is_super_admin:
            return Response(
                {'detail': 'Only super admins require 2FA.'},
                status=status.HTTP_403_FORBIDDEN,
            )

        serializer = TOTPVerifySerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        device = TOTPDevice.objects.filter(user=request.user, confirmed=False).first()
        if not device:
            return Response(
                {'detail': 'No pending enrolment. Request a new QR code.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if not device.verify_token(serializer.validated_data['token']):
            return Response(
                {'detail': 'Invalid token. Try again.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        device.confirmed = True
        device.save()
        otp_login(request, device)
        return Response({'detail': 'Two-factor authentication enabled.'})


class TOTPVerifyView(APIView):
    """Verify TOTP token after password login (super admins only)."""

    def post(self, request):
        if not request.user.is_authenticated:
            return Response({'detail': 'Not authenticated.'}, status=status.HTTP_401_UNAUTHORIZED)
        if not request.user.is_super_admin:
            return Response(
                {'detail': 'Only super admins require 2FA.'},
                status=status.HTTP_403_FORBIDDEN,
            )

        serializer = TOTPVerifySerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        device = TOTPDevice.objects.filter(user=request.user, confirmed=True).first()
        if not device:
            return Response(
                {'detail': 'No TOTP device enrolled. Complete enrolment first.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if not device.verify_token(serializer.validated_data['token']):
            return Response({'detail': 'Invalid token.'}, status=status.HTTP_400_BAD_REQUEST)

        otp_login(request, device)
        return Response({'user': UserSerializer(request.user).data})


class UserViewSet(ModelViewSet):
    """User management — super admins and developers only."""
    queryset = User.objects.all().order_by('organisation', 'full_name')
    permission_classes = [IsSuperAdmin]

    def get_serializer_class(self):
        if self.action == 'create':
            return UserCreateSerializer
        return AdminUserSerializer

    def create(self, request, *args, **kwargs):
        serializer = UserCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        return Response(AdminUserSerializer(user).data, status=status.HTTP_201_CREATED)

    def partial_update(self, request, *args, **kwargs):
        instance = self.get_object()
        data = request.data

        first = data.get('first_name', '')
        last = data.get('last_name', '')
        if first or last:
            instance.full_name = f'{first} {last}'.strip() or instance.full_name

        for field in ('email', 'organisation', 'role', 'is_active'):
            if field in data:
                setattr(instance, field, data[field])

        password = data.get('password', '')
        if password:
            instance.set_password(password)

        instance.save()
        return Response(AdminUserSerializer(instance).data)
