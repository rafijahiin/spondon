# Stage 1: Build React frontend
FROM node:20-slim AS frontend-builder

WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# Stage 2: Python runtime
FROM python:3.12-slim

WORKDIR /app

# Install Python dependencies
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# Copy Django project
COPY . .

# Copy built React frontend from Stage 1
COPY --from=frontend-builder /app/frontend/dist ./frontend/dist

# Create staticfiles directory and collect static
RUN mkdir -p staticfiles mediafiles && python manage.py collectstatic --noinput

EXPOSE 8080

# On every container start:
#   1. migrate  — idempotent, safe, runs every time.
#   2. seed_users / seed_centers  — both self-gate on SEED_DB env var.
#      They are no-ops unless SEED_DB is set in the Railway service
#      Variables. To bootstrap a fresh Postgres:
#         a. Set SEED_DB=1 (and the per-user password env vars).
#         b. Redeploy. The seed runs once.
#         c. Unset SEED_DB. Subsequent deploys do not reseed.
#   3. gunicorn — long-running web server.
CMD ["sh", "-c", "python manage.py migrate --noinput && python manage.py seed_users && python manage.py seed_centers && python manage.py seed_demo_mpdsr && python manage.py seed_demo_phd_bandhu && gunicorn spondon.wsgi --bind 0.0.0.0:$PORT --workers 2 --timeout 120"]
