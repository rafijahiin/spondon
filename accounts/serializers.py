from django.contrib.auth import authenticate
from django.contrib.auth.password_validation import validate_password
from rest_framework import serializers
from .models import User


class UserSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ['id', 'email', 'full_name', 'organisation', 'role', 'date_joined']
        read_only_fields = fields


class AdminUserSerializer(serializers.ModelSerializer):
    """Extended read serializer for the admin user management panel."""
    username = serializers.SerializerMethodField()
    first_name = serializers.SerializerMethodField()
    last_name = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = [
            'id', 'email', 'full_name', 'username', 'first_name', 'last_name',
            'organisation', 'role', 'is_active', 'last_login', 'date_joined',
        ]
        read_only_fields = fields

    def get_username(self, obj):
        return obj.email.split('@')[0]

    def get_first_name(self, obj):
        parts = obj.full_name.split(None, 1)
        return parts[0] if parts else ''

    def get_last_name(self, obj):
        parts = obj.full_name.split(None, 1)
        return parts[1] if len(parts) > 1 else ''


class LoginSerializer(serializers.Serializer):
    email = serializers.EmailField()
    password = serializers.CharField(write_only=True)

    def validate(self, data):
        user = authenticate(
            request=self.context.get('request'),
            username=data['email'],
            password=data['password'],
        )
        if not user:
            raise serializers.ValidationError('Invalid credentials.')
        if not user.is_active:
            raise serializers.ValidationError('Account is disabled.')
        data['user'] = user
        return data


class PasswordChangeSerializer(serializers.Serializer):
    current_password = serializers.CharField(write_only=True)
    new_password = serializers.CharField(write_only=True)

    def validate_current_password(self, value):
        if not self.context['request'].user.check_password(value):
            raise serializers.ValidationError('Current password is incorrect.')
        return value

    def validate_new_password(self, value):
        validate_password(value, self.context['request'].user)
        return value


class UserCreateSerializer(serializers.ModelSerializer):
    """Accepts first_name + last_name (combined into full_name) for the admin panel."""
    password = serializers.CharField(write_only=True)
    first_name = serializers.CharField(write_only=True, required=False, default='', allow_blank=True)
    last_name = serializers.CharField(write_only=True, required=False, default='', allow_blank=True)
    username = serializers.CharField(write_only=True, required=False, default='', allow_blank=True)

    class Meta:
        model = User
        fields = ['email', 'username', 'first_name', 'last_name', 'full_name', 'organisation', 'role', 'password']
        extra_kwargs = {'full_name': {'required': False, 'default': ''}}

    def create(self, validated_data):
        first = validated_data.pop('first_name', '')
        last = validated_data.pop('last_name', '')
        validated_data.pop('username', None)
        password = validated_data.pop('password')
        if not validated_data.get('full_name'):
            validated_data['full_name'] = f'{first} {last}'.strip() or validated_data['email'].split('@')[0]
        user = User(**validated_data)
        user.set_password(password)
        user.save()
        return user
