# Docker Setup Guide - Manual Result Analyzer

## Prerequisites

- Docker installed and running
- Docker Compose installed
- Port 3004 available (for the app)
- Port 5005 available (for database)

## Quick Start

### 1. Stop Existing financedb Container (if running separately)

If you have financedb running from another docker-compose, stop it first:

```bash
# From the financedb directory
docker-compose down

# Or manually stop the container
docker stop financedb-postgres
```

### 2. Update Environment Variables

The `.env` file is already configured:

```bash
cat .env
```

Should show:
```
MAIN_FINANCE_DB_URL=postgresql://postgres:financedb_secure_pass_2025@localhost:5005/financedb
JWT_SECRET=your-secret-key-change-in-production-env
```

### 3. Build and Start Containers

From the ManualResultAnalyzer root directory:

```bash
# Build the images and start containers
docker-compose up --build

# Or run in background
docker-compose up --build -d
```

### 4. Wait for Containers to Be Ready

The output should show:
```
manual-analyzer   | > manual-analyzer@0.1.0 start
manual-analyzer   | > next start -p 3004
manual-analyzer   | ▲ Next.js 16.1.6
manual-analyzer   | - Local:        http://localhost:3004
```

### 5. Test the Application

Open in your browser:
```
http://localhost:3004/auth/login
```

## Container Details

### manual-analyzer
- **Port**: 3004
- **Database**: Connected to financedb-postgres on port 5006
- **Image**: Built from local Dockerfile

### financedb-postgres
- **Port**: 5005 (mapped to container port 5006)
- **User**: postgres
- **Password**: financedb_secure_pass_2025
- **Database**: financedb
- **Image**: financedb:latest

## Common Commands

### View Logs
```bash
# All containers
docker-compose logs -f

# Specific container
docker-compose logs -f manual-analyzer
docker-compose logs -f financedb-postgres
```

### Stop Containers
```bash
docker-compose down
```

### Remove Everything (including volumes)
```bash
docker-compose down -v
```

### Restart Containers
```bash
docker-compose restart
```

### SSH into Container
```bash
docker-compose exec manual-analyzer /bin/bash
docker-compose exec financedb-postgres psql -U postgres -d financedb
```

## Troubleshooting

### Issue: "Cannot connect to database"

1. **Check container health**:
```bash
docker-compose ps
# Both containers should show "healthy" or "up"
```

2. **Check logs**:
```bash
docker-compose logs financedb-postgres | tail -20
```

3. **Test database connection**:
```bash
docker-compose exec manual-analyzer psql -h financedb-postgres -U postgres -d financedb -c "SELECT 1"
```

### Issue: "Port 3004 already in use"

Change the port in docker-compose.yml:
```yaml
ports:
  - "3005:3004"  # Map host port 3005 to container port 3004
```

Then visit: `http://localhost:3005`

### Issue: "financedb image not found"

Make sure you have the financedb image:
```bash
docker images | grep financedb

# If not found, build it from the financedb directory:
cd /path/to/financedb
docker build -t financedb:latest .
```

### Issue: Database migrations not running

The database schema should be initialized when the container starts. If needed, manually run:

```bash
docker-compose exec financedb-postgres psql -U postgres -d financedb -f /path/to/init-db.sql
```

## Environment Variables

All environment variables are passed from `.env`:

```bash
# Database
MAIN_FINANCE_DB_URL=postgresql://postgres:financedb_secure_pass_2025@localhost:5005/financedb

# Authentication
JWT_SECRET=your-secret-key-change-in-production-env

# AWS (from .env)
AWS_ACCESS_KEY_ID=xxx
AWS_SECRET_ACCESS_KEY=xxx
AWS_BUCKET_NAME=xxx
AWS_REGION=xxx

# Dexai Database
DEXAI_DB_URL=postgresql://...
```

## Production Considerations

1. **Change JWT_SECRET**: Set a strong random value in production
2. **Use secrets management**: Don't store passwords in docker-compose.yml
3. **Enable HTTPS**: Add reverse proxy (nginx/traefik)
4. **Database backups**: Configure volume backups
5. **Logging**: Configure Docker logging driver
6. **Resource limits**: Add memory/CPU limits to services

## Network Architecture

```
┌──────────────────────┐
│   manual-analyzer    │
│   (port 3004)        │
└──────────────────────┘
         │
         │ (Docker network: financedb_default)
         │
┌──────────────────────┐
│ financedb-postgres   │
│ (port 5006 internal) │
│ (port 5005 exposed)  │
└──────────────────────┘
```

Containers communicate via the Docker network bridge on `financedb_default`.

## Next Steps

1. Access the application: http://localhost:3004/auth/login
2. Create an admin user:
   ```bash
   docker-compose exec manual-analyzer node scripts/create-admin.js admin@test.com "Admin" "User" "Password123" "SUPER_ADMIN"
   ```
3. Login with the created credentials

## Useful Docker Commands

```bash
# See all containers
docker ps -a

# View resource usage
docker stats

# Clean up unused images/volumes
docker system prune

# Rebuild specific service
docker-compose build manual-analyzer

# View network info
docker network inspect financedb_default
```

## For Development

To run with live code changes:

```bash
# Run dev server instead of production build
docker-compose down
npm run dev
```

This runs Next.js in development mode with hot reload on your host machine.

---

For more information, see:
- `/AUTH.md` - Authentication system docs
- `/TROUBLESHOOTING.md` - General troubleshooting
- `docker-compose.yml` - Container configuration
- `Dockerfile` - Image build configuration
