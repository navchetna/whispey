.PHONY: help setup build run stop clean test health-check logs

# Default target
help:
	@echo "Whispey Python Backend - Available Commands:"
	@echo ""
	@echo "Docker Mode:"
	@echo "  make setup            - Setup and run all services with Docker"
	@echo "  make build            - Build all Docker images"
	@echo "  make build-gateway    - Build gateway service only"
	@echo "  make run              - Start all services"
	@echo "  make stop             - Stop all services"
	@echo "  make logs             - View logs from all services"
	@echo "  make logs-gateway     - View gateway logs"
	@echo "  make logs-asr-vllm    - View ASR vLLM logs"
	@echo "  make logs-translate   - View Translation vLLM logs"
	@echo "  make clean            - Remove containers and volumes"
	@echo ""
	@echo "Testing:"
	@echo "  make test             - Run all service tests"
	@echo "  make health-check     - Check health of all services"
	@echo "  make test-pipeline    - Test full transcription pipeline"
	@echo ""
	@echo "Development:"
	@echo "  make ps               - Show running services"
	@echo "  make restart          - Restart all services"
	@echo "  make restart-gateway  - Restart gateway only"

# =============================================================================
# Docker Mode
# =============================================================================

setup: build run
	@echo "✓ Docker setup complete! Services are starting..."
	@echo "  Gateway:              http://localhost:8000"
	@echo "  ASR vLLM:             http://localhost:8002"
	@echo "  Translation vLLM:     http://localhost:8005"

build:
	@echo "Building all Docker images..."
	docker compose build

build-gateway:
	@echo "Building gateway service..."
	docker compose build gateway

run:
	@echo "Starting all services..."
	docker compose up -d
	@echo "Waiting for services to start..."
	@sleep 5
	@echo "Services started. Check logs with 'make logs'"

stop:
	@echo "Stopping all services..."
	docker compose down

logs:
	@echo "Showing logs (Ctrl+C to exit)..."
	docker compose logs -f

logs-gateway:
	@echo "Showing gateway logs..."
	docker compose logs -f gateway

logs-asr-vllm:
	@echo "Showing ASR vLLM logs..."
	docker compose logs -f asr-vllm

logs-translate:
	@echo "Showing Translation vLLM logs..."
	docker compose logs -f translate-vllm

clean:
	@echo "Removing containers and volumes..."
	docker compose down -v
	@echo "Removing images..."
	docker rmi -f whispey-gateway:latest 2>/dev/null || true

# =============================================================================
# Testing
# =============================================================================

health-check:
	@echo "Checking service health..."
	@echo -n "Gateway:            "; curl -sf http://localhost:8000/health && echo "✓ OK" || echo "✗ FAILED"
	@echo -n "ASR vLLM:           "; curl -sf http://localhost:8002/health && echo "✓ OK" || echo "✗ FAILED"
	@echo -n "Translation vLLM:   "; curl -sf http://localhost:8005/health && echo "✓ OK" || echo "✗ FAILED"

# Install test dependencies
install-test-deps:
	@echo "Installing test dependencies..."
	pip install -r tests/requirements.txt
	@echo "✓ Test dependencies installed"

# Run pytest test suite
test: install-test-deps
	@echo "Running pytest test suite..."
	pytest tests/ -v

# Run tests with coverage
test-coverage:
	@echo "Running tests with coverage..."
	pytest tests/ -v --cov=. --cov-report=html --cov-report=term
	@echo "Coverage report generated in htmlcov/"

# Run specific test files
test-diarization:
	@echo "Testing diarization service..."
	pytest tests/test_diarization.py -v

test-language-id:
	@echo "Testing language ID service..."
	pytest tests/test_language_id.py -v

test-asr:
	@echo "Testing ASR service..."
	pytest tests/test_asr.py -v

test-translation:
	@echo "Testing translation service..."
	pytest tests/test_translation.py -v

test-pipeline:
	@echo "Testing complete pipeline..."
	pytest tests/test_pipeline.py -v

test-health:
	@echo "Testing health endpoints..."
	pytest tests/test_health.py -v

# Quick smoke test
smoke-test: health-check
	@echo ""
	@echo "Running smoke tests..."
	@echo "Testing root endpoint..."
	@curl -sf http://localhost:8000/ > /dev/null && echo "✓ Root endpoint OK" || echo "✗ Root endpoint failed"
	@echo "Testing health endpoint..."
	@curl -sf http://localhost:8000/health > /dev/null && echo "✓ Health endpoint OK" || echo "✗ Health endpoint failed"

# =============================================================================
# Development Helpers
# =============================================================================

ps:
	@docker compose ps

restart:
	@echo "Restarting all services..."
	docker compose restart

restart-gateway:
	@echo "Restarting gateway..."
	docker compose restart gateway

restart-asr:
	@echo "Restarting ASR vLLM..."
	docker compose restart asr-vllm

restart-translate:
	@echo "Restarting Translation vLLM..."
	docker compose restart translate-vllm

# Local development (without Docker)
local-install:
	@echo "Installing dependencies locally..."
	pip install -r requirements.txt
	@echo "✓ Local installation complete"

local-run:
	@echo "Starting gateway locally on port 8000..."
	@echo "Note: Make sure vLLM servers are running (via Docker or separately)"
	VLLM_ASR_BASE_URL=http://localhost:8002/v1 \
	VLLM_TRANSLATE_BASE_URL=http://localhost:8005/v1 \
	python app.py
