# Voice Evals Harness On-Premise Deployment Guide

Welcome to Voice Evals Harness, the comprehensive voice agent analytics platform designed for on-premise deployment. This guide will walk you through setting up Voice Evals Harness in your own infrastructure without any cloud service dependencies.

---
This branch supports both **local open-source models** and **cloud APIs** for speech processing. 
You can choose between:
- **Local Inference**: Run speech recognition models on your own infrastructure (requires more compute resources)
- **Sarvam API**: Use cloud-based speech recognition (requires API key)

Switch between providers by setting `MODEL_PROVIDER` in your environment configuration.
---

## 🚀 Quick Start

### Prerequisites

- **Docker & Docker Compose** (Recommended)
- **Node.js** 18.x or higher (for local development)
- **PostgreSQL** 12.x or higher (managed via Docker)
- **Python** 3.11 or higher (for python-backend)
- **Git** for version control
- **GPU** (Optional but recommended for local inference - CPU-only deployment supported)

### 1. Clone and Setup

```bash
# Clone the repository
git clone <repository-url>
cd whispey
```

### 2. Choose Your Provider and Deploy

**Option A: Quick Deploy with Helper Script (Recommended)**

```bash
# Run the deployment script
./deploy.sh

# The script will:
# 1. Create .env.local if it doesn't exist
# 2. Detect MODEL_PROVIDER setting
# 3. Deploy appropriate services
# 4. Show access URLs
```

**Option B: Manual Configuration**

```bash
# Create environment configuration
cat > .env.local << 'EOF'
# Speech Processing Provider (local or sarvam)
MODEL_PROVIDER=local

# Sarvam API Key (only required if MODEL_PROVIDER=sarvam)
SARVAM_API_KEY=your-sarvam-api-key-here

# Frontend and Backend Ports
APP_PORT=3003
PYTHON_BACKEND_PORT=8000

# Database credentials
DB_USER=admin
DB_PASSWORD=admin123
DB_NAME=agent_evals

# Security keys (CHANGE IN PRODUCTION!)
JWT_SECRET=2c2c2e1e5e1491abe5d7e11233a047edf017e509b7b7bca236288e127df85711
WHISPEY_MASTER_KEY=change-this-master-key
VAPI_MASTER_KEY=change-this-vapi-key

# Hugging Face Token (only required for local inference model downloads)
HUGGING_FACE_TOKEN=your-huggingface-token-here
EOF

# Deploy based on provider
# For local inference:
docker compose --profile local up -d

# For Sarvam API:
docker compose up -d
```

### 2. Choose Your Deployment Method

#### Option A: Docker Compose (Recommended)

**Start all services:**
```bash
# Build and start all services
docker-compose up -d

# Check service status
docker-compose ps

# View logs
docker-compose logs -f
```

**Services running:**
- Frontend: http://localhost:3003
- Python Backend: http://localhost:8000
- Local Inference (if MODEL_PROVIDER=local): http://localhost:8005
- PostgreSQL Database: localhost:5432

**To use Sarvam API instead of local inference:**
1. Edit `.env.local` and set `MODEL_PROVIDER=sarvam`
2. Add your `SARVAM_API_KEY`
3. Restart services: `docker-compose restart python-backend`

#### Option B: Manual Setup (For Development)

**Database Setup:**
```bash
# Install PostgreSQL
sudo apt update && sudo apt install postgresql postgresql-contrib

# Run database setup script
sudo -u postgres psql -f setup-db.sql

# Verify connection
psql -U admin -d agent_evals -h localhost -c "\dt"
```

**Python Backend Setup:**
```bash
cd python-backend

# Create virtual environment
python3 -m venv .venv
source .venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Set environment variables
export MODEL_PROVIDER=local
export PYTHON_BACKEND_PORT=8000

# Run the backend
python3 app.py
```

**Frontend Setup:**
```bash
# Install Node.js dependencies
npm install

# Build the application
npm run build

# Start the frontend
npm start
```

### Default Credentials

**Database User:**
- Username: `admin`
- Password: `admin123`
- Database: `agent_evals`

**Application Admin User:**
- Email: `admin@gmail.com`
- Password: `admin123`

⚠️ **Important:** Change these default passwords after first login in production!

### 3. Speech Processing Configuration

The application supports two speech processing providers:

#### Local Inference (Open Source Models)

**Advantages:**
- Complete data privacy - no external API calls
- No per-request costs
- Customizable models

**Requirements:**
- Higher compute resources (GPU recommended)
- Larger Docker image (~5GB with models)
- Models downloaded on first run

**Setup:**
```bash
# In .env.local
MODEL_PROVIDER=local
HUGGING_FACE_TOKEN=your-hf-token  # Optional: for downloading models
```

**Models Used:**
- ASR: Fairseq-based models (Hindi, English, etc.)
- Diarization: Custom speaker segmentation
- Translation: Local translation models

#### Sarvam API (Cloud-based)

**Advantages:**
- Lower resource requirements
- Faster startup time
- Always up-to-date models

**Requirements:**
- Internet connectivity
- Sarvam API key
- Per-request API costs

**Setup:**
```bash
# In .env.local
MODEL_PROVIDER=sarvam
SARVAM_API_KEY=your-sarvam-api-key

# Restart python-backend to apply
docker-compose restart python-backend
```

### 4. Access the Application

Once all services are running:

- **Frontend UI:** http://localhost:3003
- **Backend API:** http://localhost:3000/api
- **Python Backend:** http://localhost:8000
- **Health Checks:**
  - Frontend: http://localhost:3003/api/health
  - Python Backend: http://localhost:8000/health
  - Local Inference: http://localhost:8005/health (if using local mode)

## 🔐 Initial Login

**Default Admin Credentials:**
- Email: `admin@gmail.com`
- Password: `admin123`

**⚠️ IMPORTANT:** Change the default password immediately after first login!

## 🎯 Deployment Scenarios

The system uses a **registry pattern** for clean provider switching. The `python-backend` service acts as a single gateway that routes to either local or cloud processing based on `MODEL_PROVIDER`.

### Scenario 1: Deploy with Local Inference (Open Source Models)

```bash
# Set provider in .env.local
echo "MODEL_PROVIDER=local" >> .env.local

# Start all services including local-inference
docker-compose --profile local up -d

# Verify services
docker-compose ps

# Services running:
# - frontend (port 3003)
# - python-backend (port 8000) 
# - local-inference (port 8005)
# - database (internal)
```

**Resource requirements:**
- CPU: 4+ cores recommended
- RAM: 8GB+ (16GB with GPU)
- Disk: 10GB for models
- GPU: Optional but 10-20x faster

### Scenario 2: Deploy with Sarvam API (Cloud)

```bash
# Set provider and API key in .env.local
cat >> .env.local << EOF
MODEL_PROVIDER=sarvam
SARVAM_API_KEY=your-actual-api-key-here
EOF

# Start services (no local-inference needed)
docker-compose up -d

# Verify services
docker-compose ps

# Services running:
# - frontend (port 3003)
# - python-backend (port 8000)
# - database (internal)
# Note: local-inference is NOT started (saves resources)
```

**Resource requirements:**
- CPU: 2+ cores
- RAM: 2GB+
- Disk: 2GB
- Internet: Required for API calls

### Switching Between Providers

The architecture supports hot-switching:

```bash
# Switch to local
echo "MODEL_PROVIDER=local" > .env.local
docker-compose --profile local up -d local-inference
docker-compose restart python-backend

# Switch to Sarvam
echo "MODEL_PROVIDER=sarvam" > .env.local
echo "SARVAM_API_KEY=your-key" >> .env.local
docker-compose restart python-backend
docker-compose stop local-inference  # Optional: save resources
```

No code changes needed—the registry handles provider selection at runtime.

## 🏗️ Production Deployment

### Using Docker Compose (Recommended)

**Full deployment with all services:**

```bash
# Build all images
docker-compose build

# Start all services
docker-compose up -d

# View service status
docker-compose ps

# View logs
docker-compose logs -f

# Stop all services
docker-compose down
```

**Services Architecture:**
- `frontend` - Next.js UI (port 3003)
- `python-backend` - FastAPI transcription gateway (port 8000)
- `local-inference` - ML inference server (port 8005, optional)
- `database` - PostgreSQL (port 5432, internal only)

**Switching Between Local and Cloud Processing:**

```bash
# Switch to local inference
# Edit .env.local: MODEL_PROVIDER=local
docker-compose restart python-backend

# Switch to Sarvam API
# Edit .env.local: MODEL_PROVIDER=sarvam, add SARVAM_API_KEY
docker-compose restart python-backend

# Stop local-inference to save resources when using Sarvam
docker-compose stop local-inference
```

### GPU Support for Local Inference

To enable GPU acceleration for the local inference service:

1. Install NVIDIA Docker runtime:
```bash
# Install nvidia-docker2
distribution=$(. /etc/os-release;echo $ID$VERSION_ID)
curl -s -L https://nvidia.github.io/nvidia-docker/gpgkey | sudo apt-key add -
curl -s -L https://nvidia.github.io/nvidia-docker/$distribution/nvidia-docker.list | \
  sudo tee /etc/apt/sources.list.d/nvidia-docker.list
sudo apt-get update && sudo apt-get install -y nvidia-docker2
sudo systemctl restart docker
```

2. Uncomment GPU settings in `docker-compose.yaml`:
```yaml
local-inference:
  # ...
  deploy:
    resources:
      reservations:
        devices:
          - driver: nvidia
            count: 1
            capabilities: [gpu]
```

3. Restart the service:
```bash
docker-compose up -d local-inference
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

### Update the database of an existing db container

```bash
docker exec -i voiceharness-database psql -U admin -d agent_evals < setup-db.sql
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
| `MODEL_PROVIDER` | Speech provider (local/sarvam) | local | Yes |
| `SARVAM_API_KEY` | Sarvam API key | - | If using sarvam |
| `HUGGING_FACE_TOKEN` | HF token for model downloads | - | If using local |
| `APP_PORT` | Frontend port | 3003 | No |
| `PYTHON_BACKEND_PORT` | Backend API port | 8000 | No |
| `POSTGRES_HOST` | PostgreSQL server host | database | Yes |
| `POSTGRES_PORT` | PostgreSQL server port | 5432 | Yes |
| `POSTGRES_DATABASE` | Database name | agent_evals | Yes |
| `POSTGRES_USER` | Database username | admin | Yes |
| `POSTGRES_PASSWORD` | Database password | admin123 | Yes |
| `JWT_SECRET` | JWT signing secret | - | Yes |
| `WHISPEY_MASTER_KEY` | Master API key | - | Yes |
| `VAPI_MASTER_KEY` | VAPI Master key | - | Yes |

### Security Configuration

1. **Change Default Credentials**
   - Login with admin@gmail.com / admin123
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
   ```bash
   # Check database container
   docker-compose logs database
   
   # Verify database is healthy
   docker-compose ps database
   
   # Test connection
   docker-compose exec database psql -U admin -d agent_evals -c "\dt"
   ```

2. **Python Backend Errors**
   ```bash
   # Check backend logs
   docker-compose logs python-backend
   
   # Common issue: No module 'registry' found
   # Solution: Ensure app.py uses absolute import (from registry import ...)
   
   # Restart backend
   docker-compose restart python-backend
   ```

3. **Local Inference Connection Errors**
   ```bash
   # Check if local-inference service is running
   docker-compose ps local-inference
   
   # View inference logs
   docker-compose logs -f local-inference
   
   # If using MODEL_PROVIDER=local but service isn't running:
   docker-compose up -d local-inference
   
   # Wait for models to download (first run only)
   # This can take 5-10 minutes
   ```

4. **Frontend Not Accessible**
   ```bash
   # Check frontend logs
   docker-compose logs frontend
   
   # Verify port mapping (should be 3003:3000)
   docker-compose ps frontend
   
   # Access at http://localhost:3003 (not 3000!)
   curl http://localhost:3003/api/health
   ```

5. **Import/Module Errors in Python Backend**
   ```bash
   # Rebuild python-backend image
   docker-compose build python-backend
   docker-compose up -d python-backend
   
   # Check for relative import issues
   # Fix: Change "from .registry" to "from registry" in app.py
   ```

6. **Model Download Failures (Local Inference)**
   ```bash
   # Check if HuggingFace token is set (if required)
   docker-compose exec local-inference env | grep HUGGING_FACE_TOKEN
   
   # Check disk space for model downloads
   df -h
   
   # View download progress
   docker-compose logs -f local-inference
   ```

7. **Port Already in Use**
   ```bash
   # Check running processes
   lsof -i :3003  # Frontend
   lsof -i :8000  # Python backend
   lsof -i :8005  # Local inference
   
   # Change ports in .env.local if needed
   APP_PORT=3004
   PYTHON_BACKEND_PORT=8001
   ```

8. **Transcription Errors**
   ```bash
   # Verify MODEL_PROVIDER setting
   docker-compose exec python-backend env | grep MODEL_PROVIDER
   
   # If using sarvam, check API key
   docker-compose exec python-backend env | grep SARVAM_API_KEY
   
   # Test backend health
   curl http://localhost:8000/health
   
   # Test transcription endpoint
   curl -X POST http://localhost:8000/transcribe \
     -F "file=@/path/to/audio.wav"
   ```

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

3. **Local Inference Optimization**
   - Use GPU for 10-20x faster inference
   - Adjust batch size in model configurations
   - Pre-download models before production deployment
   - Consider model quantization for faster inference

## 🧪 Testing Your Setup

### Test Python Backend

```bash
# Install test dependencies
cd python-backend
pip install -r test_requirements.txt

# Run tests
python3 test_services.py

# Or test inside Docker
docker-compose exec python-backend python3 test_services.py
```

### Test Transcription Pipeline

```bash
# Test with a sample audio file
curl -X POST http://localhost:8000/transcribe \
  -F "file=@/path/to/sample.wav" \
  | jq '.'

# Expected response:
# {
#   "success": true,
#   "transcript": {
#     "turns": [...],
#     "metadata": {...}
#   }
# }
```

### Test Local Inference Endpoints

```bash
# Health check
curl http://localhost:8005/health

# Test preprocessing endpoint
curl -X POST http://localhost:8005/v1/preprocess/ \
  -F "file=@sample.wav"

# Test transcription endpoint
curl -X POST http://localhost:8005/v1/audio/ \
  -F "file=@sample.wav" \
  -F "diarized_input=[]"

# Test translation endpoint
curl -X POST http://localhost:8005/v1/translate/ \
  -H "Content-Type: application/json" \
  -d '{
    "sentences": ["नमस्ते"],
    "source_language": "hi-IN",
    "target_language": "en-IN"
  }'
```

## 🏛️ Architecture Overview

### System Components

```
┌─────────────────────────────────────────────────────────────┐
│                         User Browser                         │
└────────────────────────┬────────────────────────────────────┘
                         │ HTTP :3003
                         ▼
┌─────────────────────────────────────────────────────────────┐
│                    Next.js Frontend                          │
│                  (voiceharness-frontend)                     │
└────────────┬───────────────────────────────┬────────────────┘
             │                               │
             │ API Calls                     │ DB Queries
             ▼                               ▼
┌────────────────────────┐      ┌────────────────────────────┐
│   Python Backend       │      │    PostgreSQL Database     │
│ (voiceharness-python-  │      │  (voiceharness-database)   │
│       backend)         │      │                            │
│   Port: 8000           │      │    Port: 5432 (internal)   │
└──────────┬─────────────┘      └────────────────────────────┘
           │
           │ /transcribe requests
           │ (routes to provider)
           │
    ┌──────┴───────┐
    │              │
    ▼              ▼
┌─────────┐  ┌──────────────────┐
│ Sarvam  │  │ Local Inference  │
│   API   │  │     Server       │
│(Cloud)  │  │  Port: 8005      │
└─────────┘  └──────────────────┘
             (voiceharness-local-inference)
```

### Data Flow

1. **User uploads audio** → Frontend (Next.js)
2. **Frontend sends audio** → Python Backend `/transcribe`
3. **Python Backend** (Single Gateway):
   - Converts audio to WAV 16kHz mono (ffmpeg)
   - Uses **Registry Pattern** to load provider function at startup
   - Routes to appropriate provider based on `MODEL_PROVIDER`
4. **Speech Processing** (Provider-specific):
   - **Local**: Calls local-inference service endpoints
     - `/v1/preprocess/` - Diarization & language detection
     - `/v1/audio/` - Transcription generation
     - `/v1/translate/` - Translation (if needed)
   - **Sarvam**: Calls Sarvam cloud API
5. **Results returned** → Frontend displays transcription

### Design Benefits

**Registry Pattern Implementation:**

```python
# registry.py - Clean provider abstraction
MODEL_REGISTRY = {
    "local": {
        "transcribe_audio": transcribe_audio_local,
        "translate_text": translate_text_local
    },
    "sarvam": {
        "transcribe_audio": transcribe_audio_sarvam,
        "translate_text": translate_text_sarvam
    }
}

# app.py - Single entry point
transcribe_audio_fn = get_model_provider(os.getenv('MODEL_PROVIDER'))
```

**Benefits:**
- ✅ **Single Deployment**: One `python-backend` service handles both providers
- ✅ **Runtime Switching**: Change provider via env var, no code changes
- ✅ **Clean Abstraction**: Providers implement same interface
- ✅ **Easy Extension**: Add new providers by implementing the interface
- ✅ **Resource Efficiency**: Only run services you need
- ✅ **Consistent API**: Frontend code unchanged regardless of provider

### File Structure

```
whispey/
├── docker-compose.yaml          # Multi-service orchestration
├── Dockerfile                   # Frontend container
├── .env.local                   # Environment configuration
├── README_ONPREM.md            # This file
├── setup-db.sql                # Database initialization
│
├── python-backend/
│   ├── app.py                  # Main FastAPI app (port 8000)
│   ├── registry.py             # Provider registry
│   ├── Dockerfile              # Multi-stage: gateway + inference
│   │                           # (Builds both services from one file!)
│   ├── requirements.txt        # Python dependencies
│   │
│   ├── providers/              # Speech provider implementations
│   │   ├── local.py           # Local inference client
│   │   └── sarvam.py          # Sarvam API client
│   │
│   ├── routes/v1/             # Local inference API routes
│   │   ├── main.py            # Inference server entry (port 8005)
│   │   ├── preprocess.py      # Diarization endpoint
│   │   ├── transcribe.py      # ASR endpoint
│   │   └── translate.py       # Translation endpoint
│   │
│   └── services/              # ML model services
│       ├── asr/               # Automatic Speech Recognition
│       │   ├── engine.py      # ASR model (Fairseq)
│       │   └── utilities.py   # Model download helpers
│       ├── preprocess/        # Audio preprocessing & diarization
│       │   └── core.py
│       └── translate/         # Translation models
│           ├── engine.py
│           └── languages.py
│
└── src/                       # Next.js frontend source
    └── app/
        └── api/               # API routes
```

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