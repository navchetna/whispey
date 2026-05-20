"""
API Routes
"""
from .transcribe import router as transcribe_router
from .diarization import router as diarization_router
from .language_id import router as language_id_router
from .asr import router as asr_router
from .translation import router as translation_router

__all__ = [
    "transcribe_router",
    "diarization_router",
    "language_id_router",
    "asr_router",
    "translation_router"
]
