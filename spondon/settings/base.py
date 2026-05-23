from pathlib import Path
import os
import dj_database_url

BASE_DIR = Path(__file__).resolve().parent.parent.parent

SECRET_KEY = os.environ.get('SECRET_KEY', 'unsafe-default-for-dev-only-change-in-production')

INSTALLED_APPS = [
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',
    # Third-party
    'rest_framework',
    'django_otp',
    'django_otp.plugins.otp_totp',
    # Local
    'accounts',
    'submissions',
    'dashboard',
    'fistula',
    'mpdsr',
    'tracker',
    'reports',
    'baseline',
    'training',
]

MIDDLEWARE = [
    'django.middleware.security.SecurityMiddleware',
    'whitenoise.middleware.WhiteNoiseMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django_otp.middleware.OTPMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
    'accounts.middleware.OrganisationMiddleware',
]

ROOT_URLCONF = 'spondon.urls'

TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [],
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.debug',
                'django.template.context_processors.request',
                'django.contrib.auth.context_processors.auth',
                'django.contrib.messages.context_processors.messages',
            ],
        },
    },
]

WSGI_APPLICATION = 'spondon.wsgi.application'

DATABASES = {
    'default': dj_database_url.config(
        default=f'sqlite:///{BASE_DIR / "db.sqlite3"}',
        conn_max_age=600,
    )
}

AUTH_USER_MODEL = 'accounts.User'

AUTH_PASSWORD_VALIDATORS = [
    {'NAME': 'django.contrib.auth.password_validation.UserAttributeSimilarityValidator'},
    {'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator'},
    {'NAME': 'django.contrib.auth.password_validation.CommonPasswordValidator'},
    {'NAME': 'django.contrib.auth.password_validation.NumericPasswordValidator'},
]

LANGUAGE_CODE = 'en-us'
TIME_ZONE = 'Asia/Dhaka'
USE_I18N = True
USE_TZ = True

STATIC_URL = '/static/'
STATIC_ROOT = BASE_DIR / 'staticfiles'
# WhiteNoise serves the React build at the root URL (not under /static/)
WHITENOISE_ROOT = BASE_DIR / 'frontend' / 'dist'
WHITENOISE_INDEX_FILE = True

DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'

REST_FRAMEWORK = {
    'DEFAULT_AUTHENTICATION_CLASSES': [
        'rest_framework.authentication.SessionAuthentication',
    ],
    'DEFAULT_PERMISSION_CLASSES': [
        'rest_framework.permissions.IsAuthenticated',
    ],
    'DEFAULT_PAGINATION_CLASS': 'rest_framework.pagination.PageNumberPagination',
    'PAGE_SIZE': 50,
}

LOGIN_URL = '/login/'
LOGIN_REDIRECT_URL = '/'
LOGOUT_REDIRECT_URL = '/login/'

OTP_TOTP_ISSUER = 'Spondon — CIPRB/UNFPA'

# App-level config pulled from env — consumed by individual apps
FERNET_KEY = os.environ.get('FERNET_KEY', '')
GROQ_API_KEY = os.environ.get('GROQ_API_KEY', '')
TELEGRAM_BOT_TOKEN = os.environ.get('TELEGRAM_BOT_TOKEN', '')
TELEGRAM_CHAT_IDS = os.environ.get('TELEGRAM_CHAT_IDS', '{}')
KOBO_WEBHOOK_SECRET = os.environ.get('KOBO_WEBHOOK_SECRET', '')
KOBO_ASSET_UID_MPDSR = os.environ.get('KOBO_ASSET_UID_MPDSR', 'placeholder')
KOBO_ASSET_UID_FISTULA = os.environ.get('KOBO_ASSET_UID_FISTULA', 'placeholder')
KOBO_ASSET_UID_ACTIVITY = os.environ.get('KOBO_ASSET_UID_ACTIVITY', 'placeholder')
KOBO_ASSET_UID_BASELINE = os.environ.get('KOBO_ASSET_UID_BASELINE', 'placeholder')
KOBO_SERVER_URL = os.environ.get('KOBO_SERVER_URL', 'https://kobo.humanitarianresponse.info')
