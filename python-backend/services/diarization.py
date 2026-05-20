"""
Diarization Core Logic

Uses pyannote.audio for speaker diarization
"""
import os
from pyannote.audio import Pipeline

from utils.logging import get_logger

logger = get_logger(__name__)


class Diarizer:
    def __init__(
        self,
        model_name: str = "pyannote/speaker-diarization-3.1",
    ):
        """Initialize diarization model"""
        hf_token = os.getenv("HF_TOKEN", "")
        if not hf_token:
            logger.warning("HF_TOKEN not set, model loading may fail")

        logger.info(f"Loading diarization model: {model_name}")
        # Use 'token' parameter (use_auth_token is deprecated)
        if hf_token:
            self.pipeline = Pipeline.from_pretrained(model_name, token=hf_token)
        else:
            self.pipeline = Pipeline.from_pretrained(model_name)
        logger.info("Diarization model loaded successfully")

    def diarize(self, audio_file_path: str) -> list:
        """
        Perform speaker diarization

        Returns:
            list: [{"speaker": str, "start": float, "end": float}, ...]
        """
        # Run diarization
        output = self.pipeline(audio_file_path)

        # Convert to list format using the correct API
        # The output has a speaker_diarization attribute to iterate over
        segments = []
        for turn, speaker in output.speaker_diarization:
            segments.append({
                "speaker": speaker,
                "start": turn.start,
                "end": turn.end
            })

        # Merge consecutive segments from same speaker
        merged_segments = self._merge_consecutive_speakers(segments)

        return merged_segments

    def _merge_consecutive_speakers(self, segments: list) -> list:
        """Merge consecutive turns from the same speaker"""
        if not segments:
            return []

        merged = [segments[0]]

        for segment in segments[1:]:
            if segment["speaker"] == merged[-1]["speaker"]:
                # Same speaker - extend end time
                merged[-1]["end"] = segment["end"]
            else:
                # Different speaker - add new segment
                merged.append(segment)

        return merged
