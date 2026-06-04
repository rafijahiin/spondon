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
# Boot must be fast or the healthcheck times out. migrate + the gated
# user/centre seeds are quick; the heavy demo seeds + worker_name backfill
# now run ONLY when REFRESH_DEMO_SEED=1 (on demand), not on every boot.
CMD ["sh", "-c", "python manage.py migrate --noinput && python manage.py seed_users && python manage.py seed_centers && if [ \"$REFRESH_DEMO_SEED\" = \"1\" ]; then python manage.py seed_demo_mpdsr --purge && python manage.py seed_demo_fistula --purge && python manage.py seed_demo_phd_bandhu --purge && python manage.py seed_demo_mpdsr && python manage.py seed_demo_phd_bandhu && python manage.py seed_demo_fistula && python manage.py backfill_worker_name; fi && gunicorn spondon.wsgi --bind 0.0.0.0:$PORT --workers 1 --threads 4 --timeout 120"]
