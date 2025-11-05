# Whispey Database Setup Guide

Follow these steps to set up the database properly with correct permissions.

## Step 1: Connect as PostgreSQL superuser

```bash
# Connect as postgres superuser
sudo -u postgres psql
```

## Step 2: Create Database and User

```sql
-- Create database
CREATE DATABASE whispey;

-- Create user with password
CREATE USER whispey_user WITH ENCRYPTED PASSWORD 'your_secure_password_here';

-- Grant database privileges
GRANT ALL PRIVILEGES ON DATABASE whispey TO whispey_user;

-- Connect to the new database
\c whispey

-- Grant schema privileges
GRANT ALL ON SCHEMA public TO whispey_user;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO whispey_user;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO whispey_user;
GRANT ALL PRIVILEGES ON ALL FUNCTIONS IN SCHEMA public TO whispey_user;

-- Set default privileges for future objects
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO whispey_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO whispey_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO whispey_user;

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Exit psql
\q
```

## Step 3: Run the migration script as the whispey_user

```bash
# Run the migration script as whispey_user
psql -h localhost -U whispey_user -d whispey -f setup-db.sql
```

## Alternative: All-in-one script

If you prefer to run everything as postgres superuser:

```bash
# As postgres superuser, run:
sudo -u postgres psql -f setup-db.sql
```

## Step 4: Update your .env.local

Update your environment file with the database credentials:

```bash
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_DATABASE=whispey
POSTGRES_USER=whispey_user
POSTGRES_PASSWORD=your_secure_password_here
POSTGRES_SSL=false
```

## Troubleshooting

If you get permission errors:

1. **Make sure you're running as postgres superuser:**
   ```bash
   sudo -u postgres psql
   ```

2. **Check user permissions:**
   ```sql
   -- Connect to whispey database as postgres
   \c whispey
   
   -- Check current user
   SELECT current_user;
   
   -- Grant permissions again if needed
   GRANT ALL ON SCHEMA public TO whispey_user;
   GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO whispey_user;
   GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO whispey_user;
   ```

3. **If tables already exist with wrong permissions:**
   ```sql
   -- As postgres user, fix permissions
   \c whispey
   GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO whispey_user;
   GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO whispey_user;
   ```

## Verification

After setup, verify everything works:

```bash
# Connect as whispey_user
psql -h localhost -U whispey_user -d whispey

# Check tables exist
\dt

# Check default admin user
SELECT email, is_admin FROM pype_voice_users WHERE email = 'admin@whispey.local';

# Exit
\q
```

The default admin credentials are:
- Email: admin@whispey.local
- Password: admin123

**Remember to change the password after first login!**