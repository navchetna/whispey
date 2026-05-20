"""
Services - Core Logic

Contains the core model logic for diarization and language identification
"""
from .diarization import Diarizer
from .language_id import LanguageIdentifier

__all__ = ["Diarizer", "LanguageIdentifier"]
