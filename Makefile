.PHONY: setup start stop restart clean help

# Colors for output
CYAN := \033[0;36m
GREEN := \033[0;32m
YELLOW := \033[0;33m
RED := \033[0;31m
NC := \033[0m # No Color

# Port configurations
NEXTJS_PORT := 3004
PYTHON_PORT := 5006

help: ## Show this help message
	@echo "$(CYAN)Available commands:$(NC)"
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "$(GREEN)%-15s$(NC) %s\n", $$1, $$2}'

setup: ## Install all dependencies (Node.js, Python, Database)
	@echo "$(CYAN)🔧 Setting up Whispey...$(NC)"
	@echo "$(YELLOW)📦 Installing Node.js dependencies...$(NC)"
	npm install
	@echo "$(GREEN)✅ Node.js dependencies installed$(NC)"
	
	@echo "$(YELLOW)🐍 Installing uv package manager...$(NC)"
	@if ! command -v uv &> /dev/null; then \
		curl -LsSf https://astral.sh/uv/install.sh | sh; \
		echo "$(GREEN)✅ uv installed$(NC)"; \
	else \
		echo "$(GREEN)✅ uv already installed$(NC)"; \
	fi
	
	@echo "$(YELLOW)📦 Installing Python dependencies with uv...$(NC)"
	@if [ -f "python-backend/.venv/bin/activate" ]; then \
		echo "$(GREEN)✅ Python virtual environment already exists$(NC)"; \
	else \
		cd python-backend && uv venv --python=3.10 && uv pip install -r requirements.txt; \
		echo "$(GREEN)✅ Python virtual environment created$(NC)"; \
	fi

	@echo "$(GREEN)✅ Python dependencies installed$(NC)"
	
	@echo "$(YELLOW)🗄️  Running database migrations...$(NC)"
	@if [ -f "setup-db.sql" ]; then \
		sudo -u postgres psql -f setup-db.sql; \
		echo "$(GREEN)✅ Database migrations completed$(NC)"; \
	else \
		echo "$(YELLOW)⚠️  No migration script found, skipping...$(NC)"; \
	fi
	
	@echo "$(GREEN)✅ Setup completed successfully!$(NC)"
	@echo "$(CYAN)💡 Run 'make start' to start all services$(NC)"

start: ## Start all services (Next.js + Python backend)
	@echo "$(CYAN)🚀 Starting Whispey services...$(NC)"
	
	@echo "$(YELLOW)🔍 Clearing port $(NEXTJS_PORT)...$(NC)"
	@fuser -k $(NEXTJS_PORT)/tcp 2>/dev/null || true
	@sleep 1
	@echo "$(YELLOW)▶️  Starting Next.js dev server on port $(NEXTJS_PORT)...$(NC)"
	@mkdir -p logs
	@PORT=$(NEXTJS_PORT) nohup npm run dev > logs/nextjs.log 2>&1 & \
	echo $$! > .nextjs.pid; \
	echo "$(GREEN)✅ Next.js started (PID: $$(cat .nextjs.pid))$(NC)"; \
	sleep 3
	
	@echo "$(YELLOW)🔍 Clearing port $(PYTHON_PORT)...$(NC)"
	@fuser -k $(PYTHON_PORT)/tcp 2>/dev/null || true
	@sleep 1
	@echo "$(YELLOW)▶️  Starting Python backend on port $(PYTHON_PORT)...$(NC)"
	@nohup bash -c 'cd python-backend && source .venv/bin/activate && python app.py' > logs/python.log 2>&1 & \
	echo $$! > .python.pid; \
	sleep 2; \
	echo "$(GREEN)✅ Python backend started (PID: $$(cat .python.pid))$(NC)"
	
	@echo "$(GREEN)✅ All services started!$(NC)"
	@echo "$(CYAN)🌐 Next.js: http://localhost:$(NEXTJS_PORT)$(NC)"
	@echo "$(CYAN)🐍 Python Backend: http://localhost:$(PYTHON_PORT)$(NC)"
	@echo "$(CYAN)💡 Run 'make logs' to view logs$(NC)"
	@echo "$(CYAN)💡 Run 'make stop' to stop all services$(NC)"

stop: ## Stop all services
	@echo "$(CYAN)🛑 Stopping Whispey services...$(NC)"
	
	@echo "$(YELLOW)🛑 Stopping Next.js on port $(NEXTJS_PORT)...$(NC)"
	@fuser -k $(NEXTJS_PORT)/tcp 2>/dev/null || true
	@rm -f .nextjs.pid
	@echo "$(GREEN)✅ Next.js stopped$(NC)"
	
	@echo "$(YELLOW)🛑 Stopping Python backend on port $(PYTHON_PORT)...$(NC)"
	@fuser -k $(PYTHON_PORT)/tcp 2>/dev/null || true
	@rm -f .python.pid
	@echo "$(GREEN)✅ Python backend stopped$(NC)"
	
	@echo "$(GREEN)✅ All services stopped$(NC)"

restart: stop start ## Restart all services

status: ## Check status of all services
	@echo "$(CYAN)📊 Service Status:$(NC)"
	@echo ""
	@echo "$(YELLOW)Next.js (port $(NEXTJS_PORT)):$(NC)"
	@if lsof -Pi :$(NEXTJS_PORT) -sTCP:LISTEN -t >/dev/null 2>&1; then \
		PID=$$(lsof -Pi :$(NEXTJS_PORT) -sTCP:LISTEN -t); \
		echo "  $(GREEN)✅ Running (PID: $$PID)$(NC)"; \
	else \
		echo "  $(RED)❌ Not running$(NC)"; \
	fi
	@echo ""
	@echo "$(YELLOW)Python Backend (port $(PYTHON_PORT)):$(NC)"
	@if lsof -Pi :$(PYTHON_PORT) -sTCP:LISTEN -t >/dev/null 2>&1; then \
		PID=$$(lsof -Pi :$(PYTHON_PORT) -sTCP:LISTEN -t); \
		echo "  $(GREEN)✅ Running (PID: $$PID)$(NC)"; \
	else \
		echo "  $(RED)❌ Not running$(NC)"; \
	fi

logs: ## View logs (live tail)
	@echo "$(CYAN)📋 Tailing logs (Ctrl+C to stop)...$(NC)"
	@mkdir -p logs
	@touch logs/nextjs.log logs/python.log
	@tail -f logs/nextjs.log logs/python.log

logs-nextjs: ## View Next.js logs
	@mkdir -p logs
	@touch logs/nextjs.log
	@tail -f logs/nextjs.log

logs-python: ## View Python backend logs
	@mkdir -p logs
	@touch logs/python.log
	@tail -f logs/python.log

clean: stop ## Stop services and clean generated files
	@echo "$(CYAN)🧹 Cleaning up...$(NC)"
	@rm -f .nextjs.pid .python.pid
	@rm -rf logs/*.log
	@rm -rf python-backend/__pycache__
	@rm -rf python-backend/.pytest_cache
	@rm -rf .next
	@echo "$(GREEN)✅ Cleanup completed$(NC)"

dev: start ## Alias for 'start'

.DEFAULT_GOAL := help
