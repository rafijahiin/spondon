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

# Playwright Chromium — renders the HTML-first report kit (infographic / report /
# pptx / web) to PNG/PDF server-side. --with-deps installs the system libraries
# Chromium needs on Debian slim.
RUN python -m playwright install --with-deps chromium

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
# approve_pending_bandhu_clients is a fast, NON-destructive cleanup (not a wipe):
# Bandhu registration is auto-approved, so any Bandhu client left PENDING is
# stranded — this flips it to APPROVED. It is GATED on APPROVE_PENDING_BANDHU=1
# (deliberate one-time run, like SEED_DB): set it, redeploy, then unset it.
# DESTRUCTIVE WIPES ARE NO LONGER AUTO-RUN FROM THE ENTRYPOINT. A stale env
# var must never wipe live PII on a routine redeploy (security hardening,
# audit DCK-1/DCK-4). Run them deliberately, out-of-band, AFTER a backup:
#   railway run python manage.py flush_practice_data --confirm
#   railway run python manage.py purge_phd_data --confirm
#   railway run python manage.py prune_phd_centres --confirm
# SEED_BASELINE_DEMO=1 is a deliberate one-time run (like APPROVE_PENDING_BANDHU):
# it seeds realistic Hijra + FSW baseline interviews (--wipe clears prior demo
# rows first) so the /baseline dashboard shows insights and the verification card
# shows real detail. Set it, redeploy, verify, then UNSET it so routine deploys
# do not re-wipe/re-seed. Demo-only; only removes its own DEMO-BL- rows.
CMD ["sh", "-c", "python manage.py migrate --noinput && python manage.py seed_users && python manage.py seed_centers && python manage.py backfill_f4_facility && if [ \"$APPROVE_PENDING_BANDHU\" = \"1\" ]; then python manage.py approve_pending_bandhu_clients; fi && if [ \"$SEED_BASELINE_DEMO\" = \"1\" ]; then python manage.py seed_baseline_demo --wipe; fi && if [ \"$REFRESH_DEMO_SEED\" = \"1\" ]; then python manage.py seed_demo_mpdsr --purge && python manage.py seed_demo_fistula --purge && python manage.py seed_demo_phd_bandhu --purge && python manage.py seed_demo_mpdsr && python manage.py seed_demo_phd_bandhu && python manage.py seed_demo_fistula && python manage.py backfill_worker_name && python manage.py backfill_f4_facility; fi && gunicorn spondon.wsgi --bind 0.0.0.0:$PORT --workers 1 --threads 4 --timeout 120"]
