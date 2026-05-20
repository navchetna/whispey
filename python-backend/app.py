"""
Gateway FastAPI Application

Loads models in background processes to avoid blocking startup
"""
import os
import asyncio
from pathlib import Path
from contextlib import asynccontextmanager
from concurrent.futures import ThreadPoolExecutor
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

# Setup centralized logging
from utils.logging import setup_logging, get_logger

setup_logging(level=os.getenv("LOG_LEVEL", "INFO"))
logger = get_logger(__name__)

# Load environment variables
script_dir = Path(__file__).parent
env_paths = [
    script_dir / '.env.local',
    script_dir.parent / '.env.local',
    Path('.env.local'),
]
for env_path in env_paths:
    if env_path.exists():
        load_dotenv(env_path)
        break

# Model loading status
model_status = {
    "diarization": "loading",
    "language_id": "loading"
}


def load_diarization_model():
    """Load diarization model in background thread"""
    try:
        logger.info("Loading diarization model in background...")
        from services import Diarizer
        from routes import diarization

        diarizer = Diarizer()
        diarization.set_diarizer(diarizer)

        model_status["diarization"] = "ready"
        logger.info("Diarization model loaded successfully")
    except Exception as e:
        model_status["diarization"] = f"error: {str(e)}"
        logger.error(f"Failed to load diarization model: {str(e)}", exc_info=True)


def load_language_id_model():
    """Load language ID model in background thread"""
    try:
        logger.info("Loading language ID model in background...")
        from services import LanguageIdentifier
        from routes import language_id

        identifier = LanguageIdentifier()
        language_id.set_language_identifier(identifier)

        model_status["language_id"] = "ready"
        logger.info("Language ID model loaded successfully")
    except Exception as e:
        model_status["language_id"] = f"error: {str(e)}"
        logger.error(f"Failed to load language ID model: {str(e)}", exc_info=True)


@asynccontextmanager
async def lifespan(app: FastAPI):  # noqa: ARG001
    """Lifespan event handler for startup and shutdown"""
    # Startup
    logger.info("Starting model loading in background threads...")

    # Create thread pool for parallel model loading
    executor = ThreadPoolExecutor(max_workers=2)
    loop = asyncio.get_event_loop()

    # Load models in parallel without blocking startup
    loop.run_in_executor(executor, load_diarization_model)
    loop.run_in_executor(executor, load_language_id_model)

    logger.info("Model loading initiated. API is ready for requests.")

    yield

    # Shutdown (cleanup if needed)
    logger.info("Shutting down application...")


# Create FastAPI app with lifespan handler
app = FastAPI(
    title="Whispey Gateway",
    description="Voice AI Transcription Gateway",
    version="1.0.0",
    lifespan=lifespan
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Import and include routers
from routes import (
    transcribe_router,
    diarization_router,
    language_id_router,
    asr_router,
    translation_router
)

app.include_router(transcribe_router)
app.include_router(diarization_router)
app.include_router(language_id_router)
app.include_router(asr_router)
app.include_router(translation_router)


@app.get("/")
async def root():
    """Root endpoint"""
    return {
        "service": "Whispey Gateway",
        "version": "1.0.0",
        "status": "running"
    }


@app.get("/health")
async def health_check():
    """Health check with model status"""
    return {
        "status": "healthy",
        "service": "gateway",
        "models": model_status
    }


if __name__ == '__main__':
    import uvicorn
    port = int(os.getenv('PORT', 8000))
    logger.info(f"Starting Gateway on port {port}")
    uvicorn.run(app, host='0.0.0.0', port=port, log_level="info")
