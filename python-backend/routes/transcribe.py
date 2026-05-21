"""
Transcription API Routes

Main pipeline orchestration with centralized logging
"""
import os
import io
import base64
import asyncio
import tempfile
import soundfile as sf
import numpy as np
from uuid import uuid4
from pathlib import Path
from fastapi import APIRouter, UploadFile, File, HTTPException
from pydantic import BaseModel

from utils.logging import get_logger, log_request, set_request_id

logger = get_logger(__name__)
router = APIRouter(tags=["transcription"])


class TranscribeResponse(BaseModel):
    success: bool
    transcript: dict | None = None
    error: str | None = None


@router.post("/transcribe", response_model=TranscribeResponse)
async def transcribe_audio(file: UploadFile = File(...)):
    """
    Transcribe audio file with full pipeline:
    1. Diarization - Speaker turns
    2. Language ID - Detect language
    3. ASR - Transcribe with language context (async)
    4. Translation - Translate to target language (async)
    """
    request_id = str(uuid4())[:8]
    set_request_id(request_id)
    temp_file_path = None

    try:
        if not file:
            raise HTTPException(status_code=400, detail="Audio file is required")

        log_request(request_id, "pipeline", "start", filename=file.filename)

        # Save uploaded file
        suffix = Path(file.filename).suffix if file.filename else '.wav'
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as temp_file:
            temp_file_path = temp_file.name
            content = await file.read()

            if len(content) == 0:
                raise HTTPException(status_code=400, detail="Empty file")

            temp_file.write(content)

        log_request(request_id, "pipeline", "file_saved", size=len(content), path=temp_file_path)

        # Execute pipeline
        result = await _execute_pipeline(request_id, temp_file_path)

        if result.get('success'):
            log_request(request_id, "pipeline", "complete",
                       turns=len(result['transcript']['turns']))
            return result
        else:
            error_msg = result.get('error', 'Unknown error')
            log_request(request_id, "pipeline", "error", error=error_msg)
            raise HTTPException(status_code=500, detail=error_msg)

    except HTTPException:
        raise
    except Exception as e:
        log_request(request_id, "pipeline", "error_exception", error=str(e), exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if temp_file_path and Path(temp_file_path).exists():
            Path(temp_file_path).unlink()


async def _execute_pipeline(request_id: str, audio_file_path: str) -> dict:
    """
    Execute full transcription pipeline with detailed logging

    Args:
        request_id: Request ID for tracing
        audio_file_path: Path to audio file

    Returns:
        dict: Pipeline result
    """
    # Get transcription prompt from environment
    TRANSCRIPTION_PROMPT = os.getenv("TRANSCRIPTION_PROMPT", "Transcribe the speech into written text:")
    VLLM_TRANSLATE_MODEL = os.getenv("VLLM_TRANSLATE_MODEL", "google/gemma-3-4b-it")

    try:
        # Import services
        from routes.diarization import diarizer as global_diarizer
        from routes.language_id import language_identifier as global_language_identifier
        from routes.asr import vllm_client as asr_client
        from routes.translation import vllm_client as translate_client

        # Check if models are loaded
        if global_diarizer is None:
            log_request(request_id, "pipeline", "error", reason="Diarization model not loaded")
            return {"success": False, "error": "Diarization model not loaded yet"}
        if global_language_identifier is None:
            log_request(request_id, "pipeline", "error", reason="Language ID model not loaded")
            return {"success": False, "error": "Language ID model not loaded yet"}

        # Step 1: Diarization
        log_request(request_id, "diarization", "start")
        segments = global_diarizer.diarize(audio_file_path)
        log_request(request_id, "diarization", "complete", segments=len(segments))

        if not segments:
            log_request(request_id, "diarization", "error", reason="No segments found")
            return {"success": False, "error": "No speaker segments found"}

        # Step 2: Language Identification
        log_request(request_id, "language_id", "start")
        language_result = global_language_identifier.identify(audio_file_path)

        language_code = language_result.get("language_code", "unknown")
        language_name = language_result.get("language_name", "Unknown")
        confidence = language_result.get("confidence", 0)

        log_request(request_id, "language_id", "complete",
                   language=language_name, code=language_code, confidence=f"{confidence:.2%}")

        # Step 3: ASR - Transcribe each segment (async)
        log_request(request_id, "asr", "start", segments=len(segments), language=language_name)

        # Load full audio
        audio_array, sr = sf.read(audio_file_path, dtype="float32")
        if len(audio_array.shape) > 1:
            audio_array = np.mean(audio_array, axis=1)

        # Build language context
        language_iso = language_code.lower()[:2] if language_code != "unknown" else None

        # Transcribe all segments in parallel
        async def transcribe_segment(i, segment):
            start_sample = int(float(segment['start']) * sr)
            end_sample = int(float(segment['end']) * sr)

            # Extract segment audio
            segment_audio = audio_array[start_sample:end_sample]

            # Convert to bytes
            segment_bytes = io.BytesIO()
            sf.write(segment_bytes, segment_audio, sr, format='WAV')
            segment_bytes.seek(0)

            try:
                log_request(request_id, "asr", "segment_start", segment=i,
                           start=segment['start'], end=segment['end'])

                # Encode audio to base64
                audio_data = segment_bytes.read()
                audio_base64 = base64.b64encode(audio_data).decode("utf-8")

                # Build transcription prompt with language context
                # Use custom prompt from environment variable, optionally with language context
                if language_name and language_name != "Unknown" and "{language}" in TRANSCRIPTION_PROMPT:
                    prompt = TRANSCRIPTION_PROMPT.replace("{language}", language_name)
                else:
                    prompt = TRANSCRIPTION_PROMPT

                # Call vLLM ASR using chat completions
                response = await asr_client.chat.completions.create(
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
                                    "url": f"data:audio/wav;base64,{audio_base64}"
                                },
                            },
                        ],
                    }],
                    temperature=0.0,
                    max_tokens=512,
                )
                transcript = response.choices[0].message.content.strip()

                log_request(request_id, "asr", "segment_complete", segment=i,
                           chars=len(transcript), text=transcript[:100] if transcript else "[EMPTY]")
            except Exception as e:
                log_request(request_id, "asr", "segment_error", segment=i, error=str(e))
                transcript = f"[Transcription failed]"

            return {
                "speaker": segment["speaker"],
                "start": segment["start"],
                "end": segment["end"],
                "transcript": transcript
            }

        # Process all segments in parallel
        transcribed_segments = await asyncio.gather(*[
            transcribe_segment(i, segment)
            for i, segment in enumerate(segments)
        ])

        log_request(request_id, "asr", "complete", total_segments=len(transcribed_segments))

        # Step 4: Translation (async)
        log_request(request_id, "translation", "start", segments=len(transcribed_segments))
        target_language = os.getenv("TARGET_LANGUAGE", "English")

        async def translate_segment(i, segment):
            # Skip empty or error transcripts
            if not segment["transcript"] or segment["transcript"].startswith("["):
                translated_text = segment["transcript"]
                log_request(request_id, "translation", "segment_skip", segment=i,
                           reason="empty_or_error",
                           text=segment["transcript"][:100] if segment["transcript"] else "[EMPTY]")
            else:
                try:
                    log_request(request_id, "translation", "segment_start", segment=i,
                               src_lang=language_name, tgt_lang=target_language)

                    # Build translation prompt
                    prompt = f"""Translate the following text from {language_name} to {target_language}:

{segment["transcript"]}

Translation:"""

                    # Call vLLM translation
                    response = await translate_client.chat.completions.create(
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
                    # Clean output
                    translated_text = _clean_translation(translated_text)

                    log_request(request_id, "translation", "segment_complete", segment=i,
                               chars=len(translated_text),
                               original=segment["transcript"][:100] if segment["transcript"] else "[EMPTY]",
                               translated=translated_text[:100] if translated_text else "[EMPTY]")
                except Exception as e:
                    log_request(request_id, "translation", "segment_error", segment=i,
                               error=str(e))
                    translated_text = segment["transcript"]

            # Calculate latency
            latency = None
            if i > 0:
                prev_end = transcribed_segments[i - 1]["end"]
                curr_start = segment["start"]
                latency = max(0, round(curr_start - prev_end, 3))

            return {
                "role": "agent" if segment["speaker"] == segments[0]["speaker"] else "user",
                "start_time": segment["start"],
                "end_time": segment["end"],
                "duration": round(segment["end"] - segment["start"], 2),
                "content": segment["transcript"],
                "translated_text": translated_text,
                "latency": latency,
                "cost": None
            }

        # Process all translations in parallel
        final_segments = await asyncio.gather(*[
            translate_segment(i, segment)
            for i, segment in enumerate(transcribed_segments)
        ])

        log_request(request_id, "translation", "complete", total_segments=len(final_segments))

        # Build final response
        total_duration = max([s["end_time"] for s in final_segments]) if final_segments else 0
        speakers = list(set([s["role"] for s in final_segments]))

        result = {
            "success": True,
            "transcript": {
                "turns": final_segments,
                "metadata": {
                    "total_turns": len(final_segments),
                    "total_duration": round(total_duration, 2),
                    "speakers": speakers,
                    "source_language": language_name,
                    "source_language_code": language_code,
                    "language_confidence": confidence,
                    "target_language": target_language,
                    "model": "distributed",
                    "request_id": request_id
                }
            }
        }

        # Log summary of transcript content
        non_empty_turns = sum(1 for s in final_segments if s.get("content") and s["content"].strip())
        empty_turns = len(final_segments) - non_empty_turns
        log_request(request_id, "pipeline", "result_summary",
                   total_turns=len(final_segments),
                   non_empty_turns=non_empty_turns,
                   empty_turns=empty_turns,
                   sample_content=final_segments[0]["content"][:50] if final_segments and final_segments[0].get("content") else "[NO CONTENT]")

        # Validate that transcript has meaningful content
        if non_empty_turns == 0:
            log_request(request_id, "pipeline", "validation_failed",
                       reason="no_meaningful_content",
                       total_turns=len(final_segments))
            return {
                "success": False,
                "error": "No meaningful content found in transcript. All segments are empty.",
                "transcript": None
            }

        return result

    except Exception as e:
        log_request(request_id, "pipeline", "error_internal", error=str(e), exc_info=True)
        return {
            "success": False,
            "error": f"Pipeline error: {str(e)}"
        }


def _clean_translation(text: str) -> str:
    """Clean up translation output"""
    text = text.replace("Translation:", "").strip()
    text = text.replace("translation:", "").strip()

    if text.startswith('"') and text.endswith('"'):
        text = text[1:-1]
    if text.startswith("'") and text.endswith("'"):
        text = text[1:-1]

    return text.strip()


@router.get("/health")
async def health_check():
    """Health check endpoint"""
    return {"status": "healthy", "service": "gateway"}
