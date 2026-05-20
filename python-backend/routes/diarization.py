"""
Diarization Route

Endpoint for speaker diarization
"""
import tempfile
from pathlib import Path
from fastapi import APIRouter, UploadFile, File, Form, HTTPException
from pydantic import BaseModel

from utils.logging import get_logger, log_request, set_request_id

logger = get_logger(__name__)

router = APIRouter(tags=["diarization"])

# Global diarizer instance (loaded on startup)
diarizer = None


def set_diarizer(diarizer_instance):
    """Set the global diarizer instance"""
    global diarizer
    diarizer = diarizer_instance


class DiarizationResponse(BaseModel):
    segments: list
    request_id: str | None = None


@router.post("/diarize", response_model=DiarizationResponse)
async def diarize_audio(
    file: UploadFile = File(...),
    request_id: str = Form(None)
):
    """
    Perform speaker diarization on audio file

    Returns list of speaker segments with timestamps
    """
    if diarizer is None:
        raise HTTPException(status_code=503, detail="Diarization model not loaded yet")

    temp_file_path = None

    try:
        if request_id:
            set_request_id(request_id)
            log_request(request_id, "diarization", "request_received",
                       filename=file.filename if file.filename else "unknown")

        # Save uploaded file
        suffix = Path(file.filename).suffix if file.filename else '.wav'
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as temp_file:
            temp_file_path = temp_file.name
            content = await file.read()

            if len(content) == 0:
                log_request(request_id, "diarization", "error", reason="Empty file")
                raise HTTPException(status_code=400, detail="Empty audio file")

            temp_file.write(content)

        log_request(request_id, "diarization", "processing", size=len(content))

        # Perform diarization
        segments = diarizer.diarize(temp_file_path)

        log_request(request_id, "diarization", "complete", segments=len(segments))

        return DiarizationResponse(segments=segments, request_id=request_id)

    except Exception as e:
        log_request(request_id, "diarization", "error_exception", error=str(e))
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if temp_file_path and Path(temp_file_path).exists():
            Path(temp_file_path).unlink()
