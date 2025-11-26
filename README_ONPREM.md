# Whispey On-Premise Deployment Guide

Welcome to Whispey, the comprehensive voice agent analytics platform designed for on-premise deployment. This guide will walk you through setting up Whispey in your own infrastructure without any cloud service dependencies.

## 🚀 Quick Start

### Prerequisites

- **Node.js** 18.x or higher
- **PostgreSQL** 12.x or higher
- **npm** or **yarn** package manager
- **Git** for version control

### 1. Clone and Setup

```bash
# Clone the repository
git clone <repository-url>
cd whispey

# Install dependencies
npm install

# Copy environment configuration
cp .env.example .env.local
```

### 2. Database Setup

The application uses PostgreSQL as its database. Follow these steps to set up the database:

### 1. Install PostgreSQL

```bash
# Ubuntu/Debian
sudo apt update
sudo apt install postgresql postgresql-contrib

# macOS
brew install postgresql@15

# Start PostgreSQL service
sudo systemctl start postgresql  # Linux
brew services start postgresql@15  # macOS
```

### 2. Run the Database Setup Script

```bash
# Switch to postgres user and run the setup script
sudo -u postgres psql -f setup-db.sql

# Or run directly with postgres user
psql -U postgres -f setup-db.sql
```

The script will:
- Create database: `agent_evals`
- Create user: `admin` with password: `admin123`
- Set up all required tables, indexes, and functions
- Create a default admin user for the application

### 3. Update Environment Variables

Update your `.env.local` file with the database credentials:

```env
# Database Configuration
POSTGRES_USER=admin
POSTGRES_PASSWORD=admin123
POSTGRES_DB=agent_evals
POSTGRES_HOST=localhost
POSTGRES_PORT=5432

# Connection String
DATABASE_URL=postgresql://admin:admin123@localhost:5432/agent_evals
```

### 4. Verify Database Connection

```bash
# Test connection
psql -U admin -d agent_evals -h localhost

# List tables
psql -U admin -d agent_evals -c "\dt"
```

### Default Credentials

**Database User:**
- Username: `admin`
- Password: `admin123`
- Database: `agent_evals`

**Application Admin User:**
- Email: `admin@agent_evals.local`
- Password: `admin123`

⚠️ **Important:** Change these default passwords after first login in production!

...existing code...

### 3. Environment Configuration

Edit `.env.local` file with your configuration:

```bash
# Database Configuration
POSTGRES_USER=admin
POSTGRES_PASSWORD=admin123
POSTGRES_DB=agent_evals
POSTGRES_HOST=localhost
POSTGRES_PORT=5432

# JWT Secret (IMPORTANT: Change this in production!)
JWT_SECRET=your-super-secure-jwt-secret-key-minimum-32-characters

# API Keys
WHISPEY_MASTER_KEY=your-unique-master-key
VOICE_EVALS_MASTER_KEY=your-unique-voice-evals-key

# OpenAI (Optional - for AI evaluations)
OPENAI_API_KEY=your_openai_api_key_here
```

### 4. Build and Start

```bash
## Install the packages
npm install

# Build the application
npm run build

# Start in production mode
npm start

# Or start in development mode
npm run dev
```

The application will be available at `http://localhost:3000`

## 🔐 Initial Login

**Default Admin Credentials:**
- Email: `admin@whispey.local`
- Password: `admin123`

**⚠️ IMPORTANT:** Change the default password immediately after first login!

## 🏗️ Production Deployment

### Using Docker (Recommended)

Create a docker image
```
docker build --build-arg http_proxy=$http_proxy --build-arg https_proxy=$https_proxy --build-arg HTTP_PROXY=$HTTP_PROXY --build-arg HTTP_PROXY=$HTTPS_PROXY -t voice_evals:latest .
```

Run the container 
```
docker run -d -p 3001:3000 -e http_proxy=$http_proxy -e https_proxy=$https_proxy -e HTTP_PROXY=$HTTP_PROXY -e HTTPS_PROXY=$HTTPS_PROXY --name voice-evals-ui voice_evals:latest
```


Deploy with Docker Compose:

```bash
docker-compose up -d
```

### Manual Production Setup

#### 1. Setup Process Manager (PM2)

```bash
# Install PM2 globally
npm install -g pm2

# Create PM2 ecosystem file
cat > ecosystem.config.js << 'EOF'
module.exports = {
  apps: [{
    name: 'whispey',
    script: 'npm',
    args: 'start',
    cwd: '/path/to/whispey',
    env: {
      NODE_ENV: 'production'
    },
    instances: 'max',
    exec_mode: 'cluster',
    max_memory_restart: '1G',
    error_file: './logs/err.log',
    out_file: './logs/out.log',
    log_file: './logs/combined.log',
    time: true
  }]
}
EOF

# Start with PM2
pm2 start ecosystem.config.js
pm2 save
pm2 startup
```

#### 2. Setup Reverse Proxy (Nginx)

```bash
# Install Nginx
sudo apt install nginx

# Create Nginx configuration
cat > /etc/nginx/sites-available/whispey << 'EOF'
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
EOF

# Enable the site
sudo ln -s /etc/nginx/sites-available/whispey /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

#### 3. SSL Certificate (Let's Encrypt)

```bash
# Install Certbot
sudo apt install certbot python3-certbot-nginx

# Get SSL certificate
sudo certbot --nginx -d your-domain.com

# Auto-renewal
sudo crontab -e
# Add: 0 12 * * * /usr/bin/certbot renew --quiet
```

## 📊 Database Management

### Backup Database

```bash
# Create backup
pg_dump -h localhost -U whispey_user -d whispey > whispey_backup_$(date +%Y%m%d_%H%M%S).sql
```

### Restore Database

```bash
# Restore from backup
psql -h localhost -U whispey_user -d whispey < whispey_backup_YYYYMMDD_HHMMSS.sql
```

### Database Maintenance

```bash
# Connect to database
psql -h localhost -U whispey_user -d whispey

-- Vacuum and analyze
VACUUM ANALYZE;

-- Refresh materialized views
REFRESH MATERIALIZED VIEW call_summary_materialized;

-- Clean up expired sessions
SELECT cleanup_expired_sessions();
```

## 🔧 Configuration Options

### Environment Variables

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `POSTGRES_HOST` | PostgreSQL server host | localhost | Yes |
| `POSTGRES_PORT` | PostgreSQL server port | 5432 | Yes |
| `POSTGRES_DATABASE` | Database name | whispey | Yes |
| `POSTGRES_USER` | Database username | postgres | Yes |
| `POSTGRES_PASSWORD` | Database password | - | Yes |
| `JWT_SECRET` | JWT signing secret | - | Yes |
| `WHISPEY_MASTER_KEY` | Master API key | - | Yes |
| `OPENAI_API_KEY` | OpenAI API key | - | No |
| `SESSION_TIMEOUT_HOURS` | Session timeout | 24 | No |
| `LOG_LEVEL` | Logging level | info | No |

### Security Configuration

1. **Change Default Credentials**
   - Login with admin@whispey.local / admin123
   - Go to Settings > User Management
   - Change password immediately

2. **JWT Secret**
   - Use a strong, random 32+ character secret
   - Never share or commit this secret

3. **Database Security**
   - Use strong database passwords
   - Enable SSL for database connections in production
   - Restrict database access to application server only

4. **API Keys**
   - Generate unique API keys for different environments
   - Rotate API keys regularly
   - Store API keys securely

## 🔍 Monitoring and Logging

### Application Logs

```bash
# View PM2 logs
pm2 logs whispey

# View specific log files
tail -f logs/combined.log
```

### Database Monitoring

```sql
-- Active connections
SELECT count(*) FROM pg_stat_activity;

-- Table sizes
SELECT 
    schemaname as table_schema,
    tablename as table_name,
    pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as size
FROM pg_tables 
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;

-- Performance insights
SELECT * FROM pg_stat_user_tables;
```

### Health Check Endpoint

The application provides a health check endpoint at `/api/health`:

```bash
curl http://localhost:3000/api/health
```

## 🚨 Troubleshooting

### Common Issues

1. **Database Connection Failed**
   - Check PostgreSQL is running: `sudo systemctl status postgresql`
   - Verify credentials in `.env.local`
   - Check network connectivity

2. **JWT Token Errors**
   - Verify JWT_SECRET is set and consistent
   - Check token expiration settings

3. **Permission Denied**
   - Check file permissions: `chmod +x start.sh`
   - Verify user has access to required directories

4. **Port Already in Use**
   - Check running processes: `lsof -i :3000`
   - Change port in configuration if needed

### Performance Optimization

1. **Database Optimization**
   ```sql
   -- Update statistics
   ANALYZE;
   
   -- Add indexes for performance
   CREATE INDEX IF NOT EXISTS idx_call_logs_performance 
   ON pype_voice_call_logs(agent_id, created_at DESC);
   ```

2. **Application Optimization**
   - Increase Node.js memory limit: `--max-old-space-size=4096`
   - Enable gzip compression in Nginx
   - Use Redis for session storage (optional)

## 📈 Scaling

### Horizontal Scaling

1. **Load Balancer Setup**
   ```nginx
   upstream whispey_backend {
       server 127.0.0.1:3000;
       server 127.0.0.1:3001;
       server 127.0.0.1:3002;
   }
   ```

2. **Database Replication**
   - Setup PostgreSQL master-slave replication
   - Use read replicas for analytics queries

### Vertical Scaling

- Increase server resources (CPU, RAM)
- Optimize PostgreSQL configuration
- Use connection pooling (PgBouncer)

## 🔄 Updates and Maintenance

### Application Updates

```bash
# Backup before update
pg_dump -h localhost -U whispey_user -d whispey > backup_before_update.sql

# Pull latest changes
git pull origin main

# Install new dependencies
npm install

# Build application
npm run build

# Restart application
pm2 restart whispey
```

### Database Migrations

Future database schema changes will be provided as migration scripts. Always backup before applying migrations.

## 📞 Support

For technical support and questions:

1. Check the troubleshooting section above
2. Review application logs for error details
3. Verify environment configuration
4. Check database connectivity and permissions

## 🔒 Security Best Practices

1. **Regular Updates**
   - Keep Node.js and PostgreSQL updated
   - Monitor for security vulnerabilities
   - Update dependencies regularly

2. **Access Control**
   - Use strong passwords
   - Implement IP whitelisting if needed
   - Regular audit of user access

3. **Data Protection**
   - Regular database backups
   - Encrypt sensitive data at rest
   - Use HTTPS in production

4. **Network Security**
   - Configure firewall rules
   - Use VPN for remote access
   - Monitor network traffic

---

**Note:** This deployment removes all cloud dependencies (Supabase, Clerk, PostHog) and provides a fully self-contained, on-premise solution for voice agent analytics and evaluation.