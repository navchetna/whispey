# Whispey Python Backend

This directory contains the Python backend services for Whispey audio transcription, using a **registry pattern** to support multiple speech processing providers.

## Architecture

The system consists of two services built from a **single multi-stage Dockerfile**:

### 1. Gateway Service (python-backend)
- **Port**: 8000
- **Purpose**: FastAPI gateway that routes transcription requests
- **Image**: Built from `Dockerfile` target `gateway` (~1.2GB)
- **Features**:
  - Audio file upload and validation
  - Automatic audio conversion to WAV 16kHz mono (ffmpeg)
  - **Registry-based provider routing** (Sarvam or Local)
  - Proper error handling and structured logging

### 2. Inference Service (local-inference)
- **Port**: 8005
- **Purpose**: ML inference server for local speech processing
- **Image**: Built from `Dockerfile` target `inference` (~5GB)
- **Features**:
  - Speech preprocessing and diarization
  - ASR (Automatic Speech Recognition)
  - Translation between languages
  - Uses: PyTorch, fairseq, librosa, litserve

### Registry Pattern

The gateway uses a **provider registry** to dynamically route requests:

```python
# registry.py
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

# app.py - Provider loaded at startup based on MODEL_PROVIDER env var
transcribe_audio_fn = get_model_provider(os.getenv('MODEL_PROVIDER', 'local'))
```

**Benefits:**
- ✅ Single codebase for multiple providers
- ✅ Runtime provider switching via environment variable
- ✅ Easy to add new providers
- ✅ Clean separation of concerns

## Environment Variables

### Gateway Service (python-backend)
| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `PYTHON_BACKEND_PORT` | Port to run on | 8000 | No |
| `MODEL_PROVIDER` | Provider: `local` or `sarvam` | `local` | Yes |
| `SARVAM_API_KEY` | Sarvam API key | - | If `MODEL_PROVIDER=sarvam` |
| `LOCAL_INFERENCE_API_URL` | Preprocessing endpoint URL | `http://local-inference:8005/v1/preprocess/` | If `MODEL_PROVIDER=local` |
| `LOCAL_TRANSCRIPTION_API_URL` | Transcription endpoint URL | `http://local-inference:8005/v1/audio/` | If `MODEL_PROVIDER=local` |
| `LOCAL_TRANSLATION_API_URL` | Translation endpoint URL | `http://local-inference:8005/v1/translate/` | If `MODEL_PROVIDER=local` |

### Inference Service (local-inference)
| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `HUGGING_FACE_TOKEN` | HF token for model downloads | - | No (but recommended) |

## Docker Setup

### Multi-Stage Dockerfile

This project uses a **single Dockerfile** with multiple build targets:

```dockerfile
# Dockerfile structure
FROM python:3.11-slim AS base      # Shared dependencies
FROM base AS gateway               # Lightweight gateway (~1.2GB)
FROM base AS inference             # Heavy ML inference (~5GB)
```

### Building Images

```bash
# From project root directory

# Build gateway only (lightweight)
docker compose build python-backend

# Build inference only (with ML dependencies)
docker compose --profile local build local-inference

# Build both services
docker compose --profile local build
```

### Deployment Scenarios

#### Scenario 1: Using Sarvam API (Cloud)

```bash
# Set in .env.local:
# MODEL_PROVIDER=sarvam
# SARVAM_API_KEY=your-api-key

# Start gateway only (no local-inference needed)
docker compose up -d python-backend

# View logs
docker compose logs -f python-backend
```

**Services running:**
- ✅ python-backend (gateway)
- ❌ local-inference (not needed)

#### Scenario 2: Using Local Inference (Open Source)

```bash
# Set in .env.local:
# MODEL_PROVIDER=local

# Start both gateway and inference server
docker compose --profile local up -d

# View logs
docker compose logs -f python-backend local-inference
```

**Services running:**
- ✅ python-backend (gateway)
- ✅ local-inference (ML server)

### Switching Providers

```bash
# Switch to local inference
# Update MODEL_PROVIDER=local in .env.local
docker compose --profile local up -d local-inference
docker compose restart python-backend

# Switch to Sarvam API
# Update MODEL_PROVIDER=sarvam in .env.local
docker compose restart python-backend
docker compose stop local-inference  # Optional: save resources
```

## Logging

All services use Python's standard logging module:
- **Level**: INFO
- **Format**: `%(asctime)s - %(name)s - %(levelname)s - %(message)s`
- **Output**: stdout (captured by Docker)
- **Log Rotation**: 10MB max size, 3 files retained (configured in docker-compose)

## Development

### Installing Dependencies

```bash
pip install -r requirements.txt
```

### Running Locally

```bash
python3 app.py
```

The service will start on port 8000 (or the port specified in `PYTHON_BACKEND_PORT`).

## Testing

A test script is provided to verify the service is working correctly.

### Install Test Dependencies
```bash
pip install -r test_requirements.txt
```

### Run Tests

**Basic test:**
```bash
python3 test_services.py
```

**Test with custom URL:**
```bash
python3 test_services.py --api-url http://localhost:8000
```

**Wait for service to start (useful after docker-compose up):**
```bash
python3 test_services.py --wait 10
```

**Inside Docker container:**
```bash
docker-compose exec python-backend python3 test_services.py
```

### What Gets Tested

- ✓ Health endpoint (`/health`)
- ✓ Transcribe endpoint (`/transcribe`) with synthetic test audio
- ✓ Error handling and response validation

See [TESTING.md](TESTING.md) for detailed testing documentation.

## API Endpoints

### GET /health
Health check endpoint.

**Response:**
```json
{
  "status": "healthy"
}
```

### POST /transcribe
Transcribe an audio file.

**Request:**
- Method: POST
- Content-Type: multipart/form-data
- Field: `file` (audio file in WAV, MP3, etc.)

**Response (Success):**
```json
{
  "success": true,
  "transcript": {
    "turns": [...],
    "metadata": {...}
  }
}
```

**Response (Error):**
```json
{
  "success": false,
  "error": "Error message"
}
```

## Manual Testing

### Using cURL

**Health check:**
```bash
curl http://localhost:8000/health
```

**Transcription:**
```bash
curl -X POST http://localhost:8000/transcribe \
  -F "file=@/path/to/audio.wav"
```

### Using Python

```python
import requests

# Health check
response = requests.get('http://localhost:8000/health')
print(response.json())

# Transcription
with open('audio.wav', 'rb') as f:
    files = {'file': f}
    response = requests.post('http://localhost:8000/transcribe', files=files)
    print(response.json())
```

## Project Structure

```
python-backend/
├── app.py                      # FastAPI gateway (port 8000)
├── registry.py                 # Provider registry pattern
│
├── providers/                  # Speech processing providers
│   ├── local.py               # Local inference client
│   └── sarvam.py              # Sarvam API client
│
├── routes/v1/                  # Local inference API routes
│   ├── main.py                # Inference server entry (port 8005)
│   ├── preprocess.py          # Diarization endpoint
│   ├── transcribe.py          # ASR endpoint
│   └── translate.py           # Translation endpoint
│
├── services/                   # ML model services
│   ├── asr/                   # Automatic Speech Recognition
│   │   ├── engine.py         # ASR model (fairseq)
│   │   └── utilities.py      # Model download helpers
│   ├── preprocess/            # Audio preprocessing & diarization
│   │   └── core.py
│   └── translate/             # Translation models
│       ├── engine.py
│       └── languages.py
│
├── Dockerfile                  # Multi-stage: gateway + inference
├── requirements.txt            # Base Python dependencies
├── test_requirements.txt       # Test dependencies
├── test_services.py           # Test script
└── README.md                  # This file
```

## Troubleshooting

### Service won't start
```bash
# Check logs
docker compose logs python-backend

# Check if container is running
docker compose ps python-backend

# Restart service
docker compose restart python-backend
```

### Import/Module errors (`No module 'registry' found`)
This happens if using relative imports. Ensure `app.py` uses absolute imports:
```python
# Correct (absolute import)
from registry import get_model_provider

# Wrong (relative import)
from .registry import get_model_provider
```

Rebuild if needed:
```bash
docker compose build python-backend
docker compose up -d python-backend
```

### Local inference connection errors
```bash
# Error: "Cannot connect to local-inference:8005"

# Solution 1: Check if local-inference is running
docker compose ps local-inference

# Solution 2: Start local-inference service
docker compose --profile local up -d local-inference

# Solution 3: Wait for models to download (first run)
docker compose logs -f local-inference

# Solution 4: Switch to Sarvam if local isn't needed
# Set MODEL_PROVIDER=sarvam in .env.local
docker compose restart python-backend
```

### Build failures (`g++ not found`)
If fairseq compilation fails, ensure build tools are installed in Dockerfile:
```dockerfile
RUN apt-get install -y build-essential g++ gcc
```

This is already included in the inference stage.

### Audio conversion fails
Ensure ffmpeg is installed (already included in both gateway and inference stages).

### Transcription errors with Sarvam
```bash
# Check API key is set
docker compose exec python-backend env | grep SARVAM_API_KEY

# Verify provider is set correctly
docker compose exec python-backend env | grep MODEL_PROVIDER

# Should output: MODEL_PROVIDER=sarvam
```

### Models not downloading (local inference)
```bash
# Check disk space
df -h

# Check HuggingFace token (optional but recommended)
docker compose exec local-inference env | grep HUGGING_FACE_TOKEN

# View download progress
docker compose logs -f local-inference
```

## Performance Tips

### For Local Inference:
1. **Use GPU**: Uncomment GPU config in `docker-compose.yaml` for 10-20x speedup
2. **Pre-download models**: Models download on first run (~5-10 min)
3. **Increase resources**: Allocate 8GB+ RAM for better performance

### For Sarvam API:
1. **Check API limits**: Monitor your API quota
2. **Handle rate limits**: Implement retry logic if needed
3. **Network latency**: Ensure stable internet connection

## Adding New Providers

To add a new speech provider:

1. Create provider implementation in `providers/`:
```python
# providers/new_provider.py
async def transcribe_audio_new_provider(audio_file_path: str):
    # Implementation
    return {"success": True, "transcript": {...}}
```

2. Register in `registry.py`:
```python
MODEL_REGISTRY = {
    "local": {...},
    "sarvam": {...},
    "new_provider": {
        "transcribe_audio": transcribe_audio_new_provider,
        "translate_text": translate_text_new_provider
    }
}
```

3. Use it:
```bash
# Set MODEL_PROVIDER=new_provider in .env.local
docker compose restart python-backend
```

No code changes in `app.py` needed - the registry handles it!
