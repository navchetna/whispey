#!/bin/bash
# Voice Evals Harness - Deployment Script
# Automatically deploys the correct services based on MODEL_PROVIDER setting

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "🚀 Voice Evals Harness Deployment"
echo "=================================="

# Check if .env.local exists
if [ ! -f .env.local ]; then
    echo -e "${RED}Error: .env.local file not found!${NC}"
    echo "Creating .env.local with default settings..."

    cat > .env.local << 'EOF'
MODEL_PROVIDER=local
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

# Hugging Face Token (for local model downloads)
HUGGING_FACE_TOKEN=your-huggingface-token-here
EOF
    echo -e "${GREEN}Created .env.local - please review and update!${NC}"
fi

# Load environment variables
source .env.local

# Check MODEL_PROVIDER setting
if [ -z "$MODEL_PROVIDER" ]; then
    echo -e "${YELLOW}MODEL_PROVIDER not set, defaulting to 'local'${NC}"
    MODEL_PROVIDER="local"
fi

echo ""
echo "Configuration:"
echo "  Provider: $MODEL_PROVIDER"
echo "  Frontend: http://localhost:${APP_PORT:-3003}"
echo "  Backend:  http://localhost:${PYTHON_BACKEND_PORT:-8000}"
echo ""

# Deploy based on provider
if [ "$MODEL_PROVIDER" = "local" ]; then
    echo -e "${GREEN}Deploying with LOCAL inference (open-source models)${NC}"
    echo "This will start:"
    echo "  ✓ Frontend (Next.js)"
    echo "  ✓ Python Backend (FastAPI gateway)"
    echo "  ✓ Local Inference Server (ML models)"
    echo "  ✓ PostgreSQL Database"
    echo ""
    echo "Resource requirements: ~8GB RAM, 4+ CPU cores, 10GB disk"
    echo ""

    read -p "Continue? (y/n) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        echo "Building and starting services..."
        docker-compose --profile local up -d --build

        echo ""
        echo -e "${GREEN}Deployment complete!${NC}"
        echo ""
        echo "Services starting up (this may take a few minutes)..."
        echo "First run: Models will be downloaded (~5-10 minutes)"
        echo ""
        echo "Check status: docker-compose ps"
        echo "View logs:    docker-compose logs -f"
        echo ""
        echo "Access the application:"
        echo "  Frontend: http://localhost:${APP_PORT:-3003}"
        echo "  API:      http://localhost:${PYTHON_BACKEND_PORT:-8000}/health"
    fi

elif [ "$MODEL_PROVIDER" = "sarvam" ]; then
    echo -e "${GREEN}Deploying with SARVAM API (cloud-based)${NC}"
    echo "This will start:"
    echo "  ✓ Frontend (Next.js)"
    echo "  ✓ Python Backend (FastAPI gateway)"
    echo "  ✓ PostgreSQL Database"
    echo ""
    echo "Resource requirements: ~2GB RAM, 2+ CPU cores, 2GB disk"
    echo ""

    # Validate API key
    if [ "$SARVAM_API_KEY" = "your-sarvam-api-key-here" ] || [ -z "$SARVAM_API_KEY" ]; then
        echo -e "${RED}Warning: SARVAM_API_KEY not configured!${NC}"
        echo "Please update SARVAM_API_KEY in .env.local"
        echo ""
        read -p "Continue anyway? (y/n) " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            exit 1
        fi
    fi

    read -p "Continue? (y/n) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        echo "Building and starting services..."
        docker-compose up -d --build

        echo ""
        echo -e "${GREEN}Deployment complete!${NC}"
        echo ""
        echo "Services starting up..."
        echo ""
        echo "Check status: docker-compose ps"
        echo "View logs:    docker-compose logs -f"
        echo ""
        echo "Access the application:"
        echo "  Frontend: http://localhost:${APP_PORT:-3003}"
        echo "  API:      http://localhost:${PYTHON_BACKEND_PORT:-8000}/health"
    fi
else
    echo -e "${RED}Error: Invalid MODEL_PROVIDER='$MODEL_PROVIDER'${NC}"
    echo "Valid options: 'local' or 'sarvam'"
    echo "Update MODEL_PROVIDER in .env.local"
    exit 1
fi

echo ""
echo "Default credentials:"
echo "  Email:    admin@gmail.com"
echo "  Password: admin123"
echo ""
echo -e "${YELLOW}⚠️  Change default passwords after first login!${NC}"
