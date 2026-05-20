"""
ASR Route

Calls vLLM server directly with language context
"""
import os
from fastapi import APIRouter, UploadFile, File, Form, HTTPException
from pydantic import BaseModel
from openai import AsyncOpenAI

from utils.logging import get_logger, log_request, set_request_id

logger = get_logger(__name__)

router = APIRouter(tags=["asr"])

# vLLM client configuration
VLLM_ASR_BASE_URL = os.getenv("VLLM_ASR_BASE_URL", "http://asr-vllm:8002/v1")
VLLM_ASR_API_KEY = os.getenv("VLLM_ASR_API_KEY", "token-abc123")

# Initialize OpenAI client for vLLM
vllm_client = AsyncOpenAI(
    base_url=VLLM_ASR_BASE_URL,
    api_key=VLLM_ASR_API_KEY
)


class ASRResponse(BaseModel):
    text: str
    request_id: str | None = None


@router.post("/transcribe", response_model=ASRResponse)
async def transcribe_audio(
    file: UploadFile = File(...),
    language: str = Form(None),
    request_id: str = Form(None)
):
    """
    Transcribe audio with language context

    Args:
        file: Audio file
        language: Language name (e.g., "Hindi", "English")
        request_id: Optional request ID for tracking
    """
    try:
        if request_id:
            set_request_id(request_id)
            log_request(request_id, "asr", "request_received",
                       language=language or "auto",
                       filename=file.filename if file.filename else "unknown")

        # Read audio
        audio_bytes = await file.read()

        if len(audio_bytes) == 0:
            log_request(request_id, "asr", "error", reason="Empty file")
            raise HTTPException(status_code=400, detail="Empty audio file")

        log_request(request_id, "asr", "processing", size=len(audio_bytes), language=language or "auto")

        # Build language context for better accuracy
        language_code = None
        if language:
            language_code = language.lower()[:2]  # ISO code (e.g., "hi", "en")

        # Call vLLM server
        response = await vllm_client.audio.transcriptions.create(
            model="whisper-1",  # vLLM compatible model name
            file=(file.filename or "audio.wav", audio_bytes, "audio/wav"),
            language=language_code
        )

        text = response.text.strip()

        log_request(request_id, "asr", "complete", chars=len(text))

        return ASRResponse(text=text, request_id=request_id)

    except Exception as e:
        log_request(request_id, "asr", "error_exception", error=str(e))
        raise HTTPException(status_code=500, detail=str(e))
