"""
Translation Route

Calls vLLM server directly with translation prompts
"""
import os
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from openai import AsyncOpenAI

from utils.logging import get_logger, log_request, set_request_id

logger = get_logger(__name__)

router = APIRouter(tags=["translation"])

# vLLM client configuration
VLLM_TRANSLATE_BASE_URL = os.getenv("VLLM_TRANSLATE_BASE_URL", "http://translate-vllm:8005/v1")
VLLM_TRANSLATE_API_KEY = os.getenv("VLLM_TRANSLATE_API_KEY", "token-abc123")
VLLM_TRANSLATE_MODEL = os.getenv("VLLM_TRANSLATE_MODEL", "google/gemma-3-4b-it")

# Initialize OpenAI client for vLLM
vllm_client = AsyncOpenAI(
    base_url=VLLM_TRANSLATE_BASE_URL,
    api_key=VLLM_TRANSLATE_API_KEY
)


class TranslationRequest(BaseModel):
    text: str
    src_lang: str
    tgt_lang: str = "English"
    request_id: str | None = None


class TranslationResponse(BaseModel):
    translated_text: str
    request_id: str | None = None


@router.post("/translate", response_model=TranslationResponse)
async def translate_text(request: TranslationRequest):
    """
    Translate text from source to target language

    Args:
        text: Text to translate
        src_lang: Source language name (e.g., "Hindi")
        tgt_lang: Target language name (e.g., "English")
        request_id: Optional request ID for tracking
    """
    try:
        if request.request_id:
            set_request_id(request.request_id)
            log_request(request.request_id, "translation", "request_received",
                       src_lang=request.src_lang,
                       tgt_lang=request.tgt_lang,
                       text_len=len(request.text))

        if not request.text or not request.text.strip():
            log_request(request.request_id, "translation", "skip", reason="Empty text")
            return TranslationResponse(
                translated_text="",
                request_id=request.request_id
            )

        log_request(request.request_id, "translation", "processing",
                   src_lang=request.src_lang, tgt_lang=request.tgt_lang)

        # Build translation prompt
        prompt = f"""Translate the following text from {request.src_lang} to {request.tgt_lang}:

{request.text}

Translation:"""

        # Call vLLM server
        response = await vllm_client.chat.completions.create(
            model=VLLM_TRANSLATE_MODEL,
            messages=[
                {
                    "role": "system",
                    "content": "You are a professional translator. Translate accurately without adding explanations or extra text. Only output the translation."
                },
                {
                    "role": "user",
                    "content": prompt
                }
            ],
            max_tokens=512,
            temperature=0.1,
        )

        translated_text = response.choices[0].message.content.strip()

        # Clean up output
        translated_text = _clean_translation(translated_text)

        log_request(request.request_id, "translation", "complete", chars=len(translated_text))

        return TranslationResponse(
            translated_text=translated_text,
            request_id=request.request_id
        )

    except Exception as e:
        log_request(request.request_id, "translation", "error_exception", error=str(e))
        raise HTTPException(status_code=500, detail=str(e))


def _clean_translation(text: str) -> str:
    """Clean up translation output"""
    # Remove common artifacts
    text = text.replace("Translation:", "").strip()
    text = text.replace("translation:", "").strip()

    # Remove quotes if the entire text is quoted
    if text.startswith('"') and text.endswith('"'):
        text = text[1:-1]
    if text.startswith("'") and text.endswith("'"):
        text = text[1:-1]

    return text.strip()
