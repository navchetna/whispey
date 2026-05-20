# Whispey Python Backend

This directory contains the Python backend services for Whispey audio transcription, using a **microservices architecture** with vLLM-powered ASR and translation.

## Architecture

The system consists of multiple specialized services:

### 1. Gateway Service (python-backend)
- **Port**: 8000
- **Purpose**: FastAPI gateway that routes transcription requests
- **Features**:
  - Audio file upload and validation
  - Automatic audio conversion to WAV 16kHz mono (ffmpeg)
  - Coordinates between diarization, ASR, and translation services
  - Proper error handling and structured logging

### 2. Diarization Service
- **Port**: 8004
- **Purpose**: Speaker diarization and language detection
- **Models**: 
  - pyannote/speaker-diarization-3.1 (speaker separation)
  - facebook/mms-lid-126 (language detection)
- **Features**: Identifies speaker turns and detects spoken language

### 3. ASR Service (vLLM + Granite)
- **vLLM Server Port**: 8002
- **Client Port**: 8001
- **Model**: ibm-granite/granite-speech-4.1-2b
- **Features**: 
  - GPU-accelerated speech-to-text via vLLM
  - Supports both full audio and diarized segment transcription
  - OpenAI-compatible API
  - Automatic model caching

### 4. Translation Service (vLLM + Gemma3)
- **vLLM Server Port**: 8005
- **Client Port**: 8003
- **Model**: google/gemma-2-2b-it
- **Features**:
  - Prompt-based translation with configurable languages
  - Batch processing support
  - GPU-accelerated inference via vLLM
  - OpenAI-compatible API
  - Automatic model caching

### Service Architecture

The gateway orchestrates multiple specialized services:

```
Audio Upload → Gateway (8000)
              ↓
              ├─→ Diarization (8004) → Speaker turns + Language
              ↓
              ├─→ ASR vLLM (8002) → Transcription Server
              │   └─→ ASR Client (8001) → Client wrapper
              ↓
              └─→ Translation vLLM (8005) → Translation Server
                  └─→ Translation Client (8003) → Client wrapper
```

**Benefits:**
- ✅ Microservices architecture for scalability
- ✅ GPU-accelerated inference with vLLM
- ✅ OpenAI-compatible API endpoints
- ✅ Automatic model caching (no re-downloads)
- ✅ High throughput with continuous batching
- ✅ All models run locally on the same system

## Environment Variables

### Gateway Service (python-backend)
| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `PYTHON_BACKEND_PORT` | Port to run on | 8000 | No |
| `MODEL_PROVIDER` | Provider: `local` | `local` | Yes |
| `LOCAL_DIARIZATION_API_URL` | Diarization endpoint URL | `http://diarization:8004/v1/diarize/` | Yes |
| `LOCAL_TRANSCRIPTION_API_URL` | Transcription endpoint URL | `http://transcribe:8001/v1/audio/` | Yes |
| `LOCAL_TRANSLATION_API_URL` | Translation endpoint URL | `http://translate:8003/v1/translate/` | Yes |

### Diarization Service
| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `PORT` | Service port | 8004 | No |
| `HF_TOKEN` | HuggingFace token | - | Yes (for pyannote) |

### ASR vLLM Server
| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `VLLM_CPU_OMP_THREADS_BIND` | CPU thread binding | `0-15` | No |
| `OMP_NUM_THREADS` | OpenMP threads | `16` | No |
| `VLLM_CPU_SGL_KERNEL` | CPU kernel optimization | `1` | No |
| `HF_TOKEN` | HuggingFace token | - | Yes |

**Command Arguments:**
- `--model`: `ibm-granite/granite-speech-4.1-2b`
- `--port`: `8002`
- `--max-model-len`: `2048`
- `--max-num-seqs`: `256`
- `--tp`: `1` (tensor parallel)
- `--api-key`: `token-abc123`

### ASR Client Service
| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `PORT` | Service port | 8001 | No |
| `VLLM_BASE_URL` | vLLM server URL | `http://asr-vllm:8002/v1` | Yes |
| `VLLM_API_KEY` | vLLM API key | `token-abc123` | Yes |

### Translation vLLM Server
| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `VLLM_CPU_OMP_THREADS_BIND` | CPU thread binding | `0-15` | No |
| `OMP_NUM_THREADS` | OpenMP threads | `16` | No |
| `VLLM_CPU_SGL_KERNEL` | CPU kernel optimization | `1` | No |
| `HF_TOKEN` | HuggingFace token | - | Yes |

**Command Arguments:**
- `--model`: `google/gemma-2-2b-it`
- `--port`: `8005`
- `--max-model-len`: `2048`
- `--max-num-seqs`: `256`
- `--tp`: `1` (tensor parallel)
- `--api-key`: `token-abc123`

### Translation Client Service
| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `PORT` | Service port | 8003 | No |
| `VLLM_BASE_URL` | vLLM server URL | `http://translate-vllm:8005/v1` | Yes |
| `VLLM_API_KEY` | vLLM API key | `token-abc123` | Yes |

## Docker Setup

> **Note**: This setup uses vLLM for optimized inference. See [VLLM_DEPLOYMENT.md](VLLM_DEPLOYMENT.md) for advanced configuration, performance tuning, and customization options.

### Building Services

```bash
# From project root directory

# Build all services
docker compose build

# Build specific services
docker compose build python-backend
docker compose build diarization
docker compose build language-id
```

### Starting Services

```bash
# Start all services
docker compose up -d

# View logs
docker compose logs -f

# Check service health
docker compose ps
```

**Services that will start:**
- ✅ python-backend (gateway) - Port 8000
- ✅ diarization - Port 8004
- ✅ asr-vllm (Granite model server) - Port 8002
- ✅ transcribe (ASR client) - Port 8001
- ✅ translate-vllm (Gemma3 model server) - Port 8005
- ✅ translate (Translation client) - Port 8003

### GPU Requirements

The vLLM services require NVIDIA GPU with:
- CUDA-compatible GPU
- nvidia-docker runtime
- Sufficient VRAM (recommended: 8GB+ per vLLM service, 16GB+ total)
- Models cached in `~/.cache/huggingface` (5-10GB per model)

**First run**: Models will download automatically (~10-15GB total), takes 5-10 minutes
**Subsequent runs**: Uses cached models, instant startup

If you don't have GPU, vLLM won't work. You'll need to use alternative deployment methods.

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
├── registry.py                 # Provider registry
│
├── providers/                  # Service client providers
│   └── local.py               # Local services orchestrator
│
├── services/                   # Microservices
│   ├── diarization/           # Speaker diarization service
│   │   ├── core.py           # Diarization & language detection
│   │   ├── server.py         # LitServe API (port 8004)
│   │   ├── Dockerfile
│   │   └── requirements.txt
│   │
│   ├── asr/                   # ASR service (vLLM client)
│   │   ├── engine.py         # Granite ASR client
│   │   ├── server.py         # LitServe API (port 8001)
│   │   ├── Dockerfile
│   │   └── requirements.txt
│   │
│   └── translate/             # Translation service (vLLM client)
│       ├── engine.py         # Gemma3 translation client
│       ├── server.py         # LitServe API (port 8003)
│       ├── Dockerfile
│       └── requirements.txt
│
├── Dockerfile                  # Gateway service
├── requirements.txt            # Gateway dependencies
├── test_requirements.txt       # Test dependencies
├── test_services.py           # Test script
└── README.md                  # This file
```

## Troubleshooting

### Service won't start
```bash
# Check logs for specific service
docker compose logs diarization
docker compose logs transcribe
docker compose logs translate

# Check all service statuses
docker compose ps

# Restart specific service
docker compose restart diarization
```

### GPU not available
```bash
# Check if NVIDIA runtime is available
docker run --rm --gpus all nvidia/cuda:12.0.0-base-ubuntu22.04 nvidia-smi

# If GPU is not detected, ensure nvidia-docker is installed
# Ubuntu/Debian:
# distribution=$(. /etc/os-release;echo $ID$VERSION_ID)
# curl -s -L https://nvidia.github.io/nvidia-docker/gpgkey | sudo apt-key add -
# curl -s -L https://nvidia.github.io/nvidia-docker/$distribution/nvidia-docker.list | \
#   sudo tee /etc/apt/sources.list.d/nvidia-docker.list
# sudo apt-get update && sudo apt-get install -y nvidia-docker2
# sudo systemctl restart docker
```

### Model loading errors
```bash
# Check service logs
docker compose logs transcribe
docker compose logs translate

# Common issues:
# 1. Out of memory - models are large (4-8GB each)
# 2. Model download timeout - ensure stable internet connection
# 3. CUDA errors - update GPU drivers
# 4. Import errors - ensure all dependencies are installed
```

### Diarization service errors
```bash
# Check HuggingFace token
docker compose exec diarization env | grep HF_TOKEN

# Note: pyannote models require accepting license on HuggingFace
# Visit: https://huggingface.co/pyannote/speaker-diarization-3.1

# View diarization logs
docker compose logs -f diarization
```

### Connection errors between services
```bash
# Ensure all services are on the same network
docker compose ps

# Check network connectivity
docker compose exec python-backend ping diarization
docker compose exec python-backend ping transcribe
docker compose exec python-backend ping translate
```

### Models not downloading
```bash
# Check disk space (models can be 5-10GB each)
df -h

# Check HuggingFace cache
ls -lh ~/.cache/huggingface

# Clear cache if needed
rm -rf ~/.cache/huggingface/*

# Restart services to re-download
docker compose --profile local restart
```

## Performance Tips

### GPU Optimization:
1. **Allocate sufficient VRAM**: Each service needs 4-8GB VRAM
2. **Use GPU acceleration**: Already configured for NVIDIA GPUs with PyTorch
3. **Use FP16/BF16**: Models use half-precision for faster inference
4. **Monitor GPU usage**: Use `nvidia-smi` to check utilization

### Model Loading:
1. **Pre-download models**: First run downloads ~10-15GB of models
2. **Use persistent volumes**: Models cached in `~/.cache/huggingface`
3. **Offline mode**: Set `HF_HUB_OFFLINE=1` after initial download
4. **Warm-up time**: Models take 1-3 minutes to load on startup

### Service Scaling:
1. **Scale services independently**: Use `docker compose up --scale translate=2`
2. **Load balancing**: Add nginx for production deployments
3. **Resource allocation**: Adjust CPU/memory limits per service
4. **Model optimization**: Use quantization for lower VRAM usage

## Customization

### Changing Models

Edit `docker-compose.yaml` to use different models:

```yaml
# Change ASR model
transcribe:
  environment:
    - ASR_MODEL=your-hf-model-name

# Change translation model
translate:
  environment:
    - TRANSLATE_MODEL=your-hf-model-name
```

Models must be compatible with:
- ASR: AutoModelForSpeechSeq2Seq or similar speech models
- Translation: AutoModelForCausalLM (instruction-tuned models work best)

## Alternative: Using vLLM for Inference

For production deployments requiring higher throughput, you can use vLLM servers instead of direct model loading. vLLM provides optimized inference with features like continuous batching and paged attention.

### ASR with vLLM

**1. Start vLLM Server for ASR:**

```bash
docker run -d \
  --name asr-vllm \
  --gpus all \
  -p 8002:8002 \
  -v ~/.cache/huggingface:/root/.cache/huggingface \
  -e VLLM_CPU_OMP_THREADS_BIND=0-15 \
  -e OMP_NUM_THREADS=16 \
  -e VLLM_CPU_SGL_KERNEL=1 \
  vllm/vllm-openai:latest \
  --model ibm-granite/granite-speech-4.1-2b \
  --port 8002 \
  --max-model-len 2048 \
  --max-num-seqs 256 \
  --tp 1 \
  --api-key token-abc123
```

**Environment Variables:**
- `VLLM_CPU_OMP_THREADS_BIND`: CPU threads to bind (e.g., `0-15` for 16 cores)
- `OMP_NUM_THREADS`: Number of OpenMP threads (match your CPU cores)
- `VLLM_CPU_SGL_KERNEL`: Enable CPU kernel optimization (`1` to enable)

**Arguments:**
- `--model`: HuggingFace model name
- `--port`: Port to serve on
- `--max-model-len`: Maximum sequence length (tokens)
- `--max-num-seqs`: Maximum number of sequences to process in parallel
- `--tp`: Tensor parallel size (number of GPUs for model parallelism)
- `--api-key`: API key for authentication

**Volume Mapping:**
- `-v ~/.cache/huggingface:/root/.cache/huggingface` - Caches models to avoid re-downloading

### Translation with vLLM

**1. Start vLLM Server for Translation:**

```bash
docker run -d \
  --name translate-vllm \
  --gpus all \
  -p 8005:8005 \
  -v ~/.cache/huggingface:/root/.cache/huggingface \
  -e VLLM_CPU_OMP_THREADS_BIND=0-15 \
  -e OMP_NUM_THREADS=16 \
  -e VLLM_CPU_SGL_KERNEL=1 \
  vllm/vllm-openai:latest \
  --model google/gemma-2-2b-it \
  --port 8005 \
  --max-model-len 2048 \
  --max-num-seqs 256 \
  --tp 1 \
  --api-key token-abc123
```

### Docker Compose with vLLM

Add to `docker-compose.yaml`:

```yaml
services:
  # ASR vLLM Server
  asr-vllm:
    image: vllm/vllm-openai:latest
    container_name: voiceharness-asr-vllm
    restart: unless-stopped
    profiles:
      - vllm
    command: >
      --model ibm-granite/granite-speech-4.1-2b
      --port 8002
      --max-model-len 2048
      --max-num-seqs 256
      --tp 1
      --api-key token-abc123
    ports:
      - "8002:8002"
    environment:
      - VLLM_CPU_OMP_THREADS_BIND=0-15
      - OMP_NUM_THREADS=16
      - VLLM_CPU_SGL_KERNEL=1
    volumes:
      - ~/.cache/huggingface:/root/.cache/huggingface
    networks:
      - agent-evals
    deploy:
      resources:
        reservations:
          devices:
            - driver: nvidia
              count: all
              capabilities: [gpu]

  # Translation vLLM Server
  translate-vllm:
    image: vllm/vllm-openai:latest
    container_name: voiceharness-translate-vllm
    restart: unless-stopped
    profiles:
      - vllm
    command: >
      --model google/gemma-2-2b-it
      --port 8005
      --max-model-len 2048
      --max-num-seqs 256
      --tp 1
      --api-key token-abc123
    ports:
      - "8005:8005"
    environment:
      - VLLM_CPU_OMP_THREADS_BIND=0-15
      - OMP_NUM_THREADS=16
      - VLLM_CPU_SGL_KERNEL=1
    volumes:
      - ~/.cache/huggingface:/root/.cache/huggingface
    networks:
      - agent-evals
    deploy:
      resources:
        reservations:
          devices:
            - driver: nvidia
              count: all
              capabilities: [gpu]
```

**Start vLLM services:**
```bash
# Start with vLLM servers
docker compose --profile vllm up -d

# Or start both local and vLLM
docker compose --profile local --profile vllm up -d
```

### vLLM Configuration Guide

**Tensor Parallelism (--tp):**
- `--tp 1`: Single GPU (default)
- `--tp 2`: Split model across 2 GPUs
- `--tp 4`: Split model across 4 GPUs
- Use when model doesn't fit in single GPU VRAM

**Max Model Length (--max-model-len):**
- `2048`: Good for most transcription tasks
- `4096`: For longer audio segments
- `8192`: Maximum context for very long audio
- Lower values = less VRAM usage

**Max Num Sequences (--max-num-seqs):**
- `32`: Low concurrency, less VRAM
- `128`: Medium concurrency
- `256`: High concurrency, more throughput
- Adjust based on expected load

**CPU Optimization:**
- Set `OMP_NUM_THREADS` to match your CPU cores
- Use `VLLM_CPU_OMP_THREADS_BIND` to pin threads
- Enable `VLLM_CPU_SGL_KERNEL=1` for better CPU performance

**Volume Caching:**
- Always mount `~/.cache/huggingface` to persist models
- First run will download models (~5-10GB)
- Subsequent runs use cached models (instant startup)

### Configuring Translation Languages

The translation service uses prompts to specify languages. Update in your code:

```python
# Example: Translate from Hindi to French
translation = await translate_text_local(
    text="आपका स्वागत है",
    source_language="Hindi",
    target_language="French"
)
```

Supported languages depend on the model's training data (Gemma3 supports 100+ languages).
