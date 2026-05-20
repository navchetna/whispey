"""
Language Identification Route

Endpoint for language identification
"""
import tempfile
from pathlib import Path
from fastapi import APIRouter, UploadFile, File, Form, HTTPException
from pydantic import BaseModel

from utils.logging import get_logger, log_request, set_request_id

logger = get_logger(__name__)

router = APIRouter(tags=["language-id"])

# Global language identifier instance (loaded on startup)
language_identifier = None


def set_language_identifier(identifier_instance):
    """Set the global language identifier instance"""
    global language_identifier
    language_identifier = identifier_instance


class LanguageIDResponse(BaseModel):
    language_code: str
    language_name: str
    confidence: float
    request_id: str | None = None


@router.post("/identify", response_model=LanguageIDResponse)
async def identify_language(
    file: UploadFile = File(...),
    request_id: str = Form(None)
):
    """
    Identify language from audio file

    Returns language code, name, and confidence score
    """
    if language_identifier is None:
        raise HTTPException(status_code=503, detail="Language ID model not loaded yet")

    temp_file_path = None

    try:
        if request_id:
            set_request_id(request_id)
            log_request(request_id, "language_id", "request_received",
                       filename=file.filename if file.filename else "unknown")

        # Save uploaded file
        suffix = Path(file.filename).suffix if file.filename else '.wav'
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as temp_file:
            temp_file_path = temp_file.name
            content = await file.read()

            if len(content) == 0:
                log_request(request_id, "language_id", "error", reason="Empty file")
                raise HTTPException(status_code=400, detail="Empty audio file")

            temp_file.write(content)

        log_request(request_id, "language_id", "processing", size=len(content))

        # Identify language
        result = language_identifier.identify(temp_file_path)

        log_request(request_id, "language_id", "complete",
                   language=result['language_name'],
                   code=result['language_code'],
                   confidence=f"{result['confidence']:.2%}")

        return LanguageIDResponse(**result, request_id=request_id)

    except Exception as e:
        log_request(request_id, "language_id", "error_exception", error=str(e))
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if temp_file_path and Path(temp_file_path).exists():
            Path(temp_file_path).unlink()
