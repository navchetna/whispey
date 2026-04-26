.PHONY: help setup build run stop clean test local docker-setup non-docker-setup

# Default target
help:
	@echo "Whispey Python Backend - Available Commands:"
	@echo ""
	@echo "Docker Mode:"
	@echo "  make docker-setup      - Setup and run all services with Docker"
	@echo "  make build            - Build all Docker images"
	@echo "  make build-gateway    - Build gateway service only"
	@echo "  make build-asr        - Build ASR service only"
	@echo "  make build-preprocess - Build preprocessing service only"
	@echo "  make build-translate  - Build translation service only"
	@echo "  make run              - Start all services with Docker"
	@echo "  make run-local        - Start with local inference services"
	@echo "  make stop             - Stop all services"
	@echo "  make logs             - View logs from all services"
	@echo "  make clean            - Remove containers and volumes"
	@echo ""
	@echo "Non-Docker Mode:"
	@echo "  make non-docker-setup - Install dependencies locally"
	@echo "  make run-gateway-local     - Run gateway locally (requires services running)"
	@echo "  make run-asr-local         - Run ASR service locally"
	@echo "  make run-preprocess-local  - Run preprocessing service locally"
	@echo "  make run-translate-local   - Run translation service locally"
	@echo ""
	@echo "Testing:"
	@echo "  make test             - Run all tests"
	@echo "  make health-check     - Check health of all services"

# =============================================================================
# Docker Mode
# =============================================================================

docker-setup: build run-local
	@echo "✓ Docker setup complete! Services are starting..."
	@echo "  Gateway:      http://localhost:8000"
	@echo "  ASR:          http://localhost:8001"
	@echo "  Preprocessing: http://localhost:8002"
	@echo "  Translation:  http://localhost:8003"

build:
	@echo "Building all Docker images..."
	docker compose --profile local build

build-gateway:
	@echo "Building gateway service..."
	docker compose build python-backend

build-transcribe:
	@echo "Building transcription service..."
	docker compose build transcribe

build-preprocess:
	@echo "Building preprocessing service..."
	docker compose build preprocess

build-translate:
	@echo "Building translation service..."
	docker compose build translate

run:
	@echo "Starting services (gateway only, Sarvam API)..."
	docker compose up -d python-backend

run-local:
	@echo "Starting all services (local inference)..."
	docker compose --profile local up -d

stop:
	@echo "Stopping all services..."
	docker compose --profile local down

logs:
	@echo "Showing logs (Ctrl+C to exit)..."
	docker compose --profile local logs -f

logs-gateway:
	docker compose logs -f python-backend

logs-transcribe:
	docker compose logs -f transcribe

logs-preprocess:
	docker compose logs -f preprocess

logs-translate:
	docker compose logs -f translate

clean:
	@echo "Removing containers and volumes..."
	docker compose --profile local down -v
	@echo "Removing images..."
	docker rmi -f python-backend:latest transcribe:latest preprocess:latest translate:latest 2>/dev/null || true

health-check:
	@echo "Checking service health..."
	@echo -n "Gateway:        "; curl -sf http://localhost:8000/health && echo "✓ OK" || echo "✗ FAILED"
	@echo -n "Transcribe:     "; curl -sf http://localhost:8001/health && echo "✓ OK" || echo "✗ FAILED"
	@echo -n "Preprocess:     "; curl -sf http://localhost:8002/health && echo "✓ OK" || echo "✗ FAILED"
	@echo -n "Translate:      "; curl -sf http://localhost:8003/health && echo "✓ OK" || echo "✗ FAILED"

# =============================================================================
# Non-Docker Mode
# =============================================================================

non-docker-setup:
	@echo "Setting up local development environment..."
	@echo "Installing gateway dependencies..."
	pip install -r gateway-requirements.txt
	@echo "Installing ASR dependencies..."
	pip install -r services/asr/requirements.txt
	@echo "Installing preprocessing dependencies..."
	pip install -r services/preprocess/requirements.txt
	@echo "Installing translation dependencies..."
	pip install -r services/translate/requirements.txt
	@echo "✓ Setup complete! Create models directory if needed:"
	@echo "  mkdir -p models"

run-gateway-local:
	@echo "Starting gateway on port 8000..."
	PYTHON_BACKEND_PORT=8000 MODEL_PROVIDER=local \
	LOCAL_PREPROCESS_API_URL=http://localhost:8002/v1/preprocess/ \
	LOCAL_TRANSCRIPTION_API_URL=http://localhost:8001/v1/audio/ \
	LOCAL_TRANSLATION_API_URL=http://localhost:8003/v1/translate/ \
	python3 app.py

run-asr-local:
	@echo "Starting ASR service on port 8001..."
	cd services/asr && \
	PORT=8001 MODEL_PATH=../../models LANGUAGE=hindi \
	python3 server.py

run-preprocess-local:
	@echo "Starting preprocessing service on port 8002..."
	cd services/preprocess && \
	PORT=8002 python3 server.py

run-translate-local:
	@echo "Starting translation service on port 8003..."
	cd services/translate && \
	PORT=8003 python3 server.py

# =============================================================================
# Testing
# =============================================================================

test:
	@echo "Running tests..."
	python3 test_services.py

test-gateway:
	@echo "Testing gateway..."
	curl -X GET http://localhost:8000/health

test-asr:
	@echo "Testing ASR service..."
	curl -X GET http://localhost:8001/health

# =============================================================================
# Development Helpers
# =============================================================================

ps:
	docker compose --profile local ps

restart:
	@echo "Restarting all services..."
	docker compose --profile local restart

restart-gateway:
	docker compose restart python-backend

restart-transcribe:
	docker compose restart transcribe

restart-preprocess:
	docker compose restart preprocess

restart-translate:
	docker compose restart translate
