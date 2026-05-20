"""
ASR Route

Calls vLLM server using chat completions endpoint with base64-encoded audio
"""
import os
import base64
from fastapi import APIRouter, UploadFile, File, Form, HTTPException
from pydantic import BaseModel
from openai import AsyncOpenAI

from utils.logging import get_logger, log_request, set_request_id

logger = get_logger(__name__)

router = APIRouter(tags=["asr"])

# vLLM client configuration
VLLM_ASR_BASE_URL = os.getenv("VLLM_ASR_BASE_URL", "http://asr-vllm:8002/v1")
VLLM_ASR_API_KEY = os.getenv("VLLM_ASR_API_KEY", "token-abc123")
TRANSCRIPTION_PROMPT = os.getenv("TRANSCRIPTION_PROMPT", "Transcribe the speech into written text:")

# Initialize OpenAI client for vLLM
vllm_client = AsyncOpenAI(
    base_url=VLLM_ASR_BASE_URL,
    api_key=VLLM_ASR_API_KEY
)


class ASRResponse(BaseModel):
    text: str
    request_id: str | None = None


def encode_audio_base64(audio_bytes: bytes) -> str:
    """Encode audio bytes to base64 format."""
    return base64.b64encode(audio_bytes).decode("utf-8")


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

        # Encode audio to base64
        audio_base64 = encode_audio_base64(audio_bytes)

        # Determine audio format from filename
        audio_format = "wav"
        if file.filename:
            ext = file.filename.lower().split('.')[-1]
            if ext in ['mp3', 'ogg', 'flac', 'wav', 'm4a']:
                audio_format = ext

        # Build transcription prompt with language context
        # Use custom prompt from environment variable, optionally with language context
        if language and "{language}" in TRANSCRIPTION_PROMPT:
            prompt = TRANSCRIPTION_PROMPT.replace("{language}", language)
        else:
            prompt = TRANSCRIPTION_PROMPT

        # Call vLLM server using chat completions endpoint
        response = await vllm_client.chat.completions.create(
            model="ibm-granite/granite-speech-4.1-2b",
            messages=[{
                "role": "user",
                "content": [
                    {
                        "type": "text",
                        "text": prompt
                    },
                    {
                        "type": "audio_url",
                        "audio_url": {
                            "url": f"data:audio/{audio_format};base64,{audio_base64}"
                        },
                    },
                ],
            }],
            temperature=0.0,
            max_tokens=512,
        )

        text = response.choices[0].message.content.strip()

        log_request(request_id, "asr", "complete", chars=len(text))

        return ASRResponse(text=text, request_id=request_id)

    except Exception as e:
        log_request(request_id, "asr", "error_exception", error=str(e))
        raise HTTPException(status_code=500, detail=str(e))
