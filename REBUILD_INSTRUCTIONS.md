# Rebuild Instructions for Logging Changes

## Quick Rebuild

To apply the logging changes, you need to rebuild the Docker containers:

```bash
# Stop existing containers
docker-compose down

# Rebuild all services (force rebuild to pick up logging_utils.py)
docker-compose build --no-cache

# Start services
docker-compose up -d
```

## Or rebuild specific services:

```bash
# Rebuild just the python-backend (gateway)
docker-compose build --no-cache voiceharness-python-backend

# Rebuild preprocessing service
docker-compose build --no-cache voiceharness-preprocess

# Rebuild ASR service  
docker-compose build --no-cache voiceharness-asr

# Rebuild translation service
docker-compose build --no-cache voiceharness-translate

# Start the rebuilt services
docker-compose up -d
```

## What changed in Dockerfiles:

Each Dockerfile now includes:
```dockerfile
COPY logging_utils.py .
```

This ensures the logging utility is available in each container.

## Verify it's working:

After rebuild, check logs:
```bash
# Watch for request IDs in logs
docker-compose logs -f | grep "REQ_ID"

# Or check a specific service
docker-compose logs -f voiceharness-preprocess | grep "REQ_ID"
```

You should see log entries like:
```
[REQ_ID: a1b2c3d4] [STEP: PREPROCESS_RECEIVED] [TIME: 1714132530.789] ...
```
