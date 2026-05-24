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
RUN mkdir -p staticfiles && python manage.py collectstatic --noinput

EXPOSE 8080

CMD ["sh", "-c", "python manage.py migrate --noinput && gunicorn spondon.wsgi --bind 0.0.0.0:$PORT --workers 2 --timeout 120"]
