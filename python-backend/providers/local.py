import os
import logging
import aiohttp
import json
from pathlib import Path
from logging_utils import generate_request_id, log_request_step

logger = logging.getLogger(__name__)


async def transcribe_audio_local(audio_file_path: str):
    """
    Transcribe audio using local inference server.
    Requires local-inference service to be running on port 8005.

    To start local-inference:
    - Docker: docker-compose --profile local up -d local-inference
    - Or set MODEL_PROVIDER=sarvam to use cloud API instead
    """
    request_id = generate_request_id()
    log_request_step(logger, request_id, "REQUEST_START", f"Audio file: {audio_file_path}")
    timeout = aiohttp.ClientTimeout(total=600)

    try:
        URL = os.getenv("LOCAL_PREPROCESS_API_URL", "http://asr-preprocess:8002/v1/preprocess/")
        TRANSCRIPTION_URL = os.getenv("LOCAL_TRANSCRIPTION_API_URL", "http://asr-service:8001/v1/audio/")

        logger.info(f"Using local inference server: {URL}")

        async with aiohttp.ClientSession(timeout=timeout) as session:
            with open(audio_file_path, 'rb') as f:
                audio_data = f.read()
                form = aiohttp.FormData()
                form.add_field(
                    'file',
                    audio_data,
                    filename=Path(audio_file_path).name,
                    content_type='audio/wav'
                )
                form.add_field('request_id', request_id)

                log_request_step(logger, request_id, "PREPROCESS_SEND", f"Sending to {URL}")
                async with session.post(URL, data=form) as resp:
                    if resp.status == 200:
                        result = await resp.json()
                        diarized_output = result.get("diarization", [])
                        language = result.get("language", "unknown")
                        log_request_step(
                            logger, request_id, "PREPROCESS_DONE",
                            f"Language: {language}, Segments: {len(diarized_output)}"
                        )
                    else:
                        return {
                            "success": False,
                            "error": f"Request failed with status {resp.status}"
                        }

                # Create new form data for transcription request
                transcription_form = aiohttp.FormData()
                transcription_form.add_field(
                    'file',
                    audio_data,
                    filename=Path(audio_file_path).name,
                    content_type='audio/wav'
                )
                transcription_form.add_field(
                    "diarized_input",
                    json.dumps(diarized_output),
                    content_type="application/json"
                )
                transcription_form.add_field('request_id', request_id)

                log_request_step(logger, request_id, "TRANSCRIBE_SEND", f"Sending to {TRANSCRIPTION_URL}")
                async with session.post(TRANSCRIPTION_URL, data=transcription_form) as resp:
                    if resp.status == 200:
                        result = await resp.json()
                        diarized_transcription = result.get("transcriptions", "")
                        log_request_step(logger, request_id, "TRANSCRIBE_DONE", f"Segments: {len(diarized_transcription)}")
                    else:
                        return {
                            "success": False,
                            "error": f"Request failed with status {resp.status}"
                        }

                log_request_step(logger, request_id, "FORMAT_START", "Formatting and translating results")
                formatted_result = await format_diarization_results(diarized_transcription, language, request_id)
                log_request_step(logger, request_id, "REQUEST_COMPLETE", "All processing finished")

                return {
                    "success": True,
                    "transcript": formatted_result
                }
    except aiohttp.ClientConnectorError as e:
        error_msg = (
            f"Cannot connect to local inference server. "
            f"Please ensure local-inference service is running. "
            f"Start with: docker-compose --profile local up -d local-inference "
            f"Or switch to Sarvam API: MODEL_PROVIDER=sarvam {e}"
        )
        logger.error(error_msg)
        return {
            "success": False,
            "error": error_msg
        }
    except Exception as e:
        logger.error(f"Local transcription error: {str(e)}", exc_info=True)
        return {
            "success": False,
            "error": f"Local inference error: {str(e)}"
        }

            
async def translate_text_local(text: str, source_language: str, target_language: str = "en-IN", request_id: str = None):
    URL = os.getenv("LOCAL_TRANSLATION_API_URL", "http://asr-translate:8003/v1/translate/")
    timeout = aiohttp.ClientTimeout(total=120)

    try:
        async with aiohttp.ClientSession(timeout=timeout) as session:
            payload = {
                "sentences": [text],
                "source_language": source_language,
                "target_language": target_language,
            }
            if request_id:
                payload["request_id"] = request_id

            async with session.post(
                URL,
                json=payload
            ) as resp:
                if resp.status == 200:
                    result = await resp.json()
                    return {
                        "success": True,
                        "translated_text": result.get("translations", [""])[0]
                    }
                else:
                    return {
                        "success": False,
                        "error": f"Request failed with status {resp.status}"
                    }
    except Exception as e:
        return {
            "success": False,
            "error": str(e)
        }
                

async def format_diarization_results(diarization_output: list, language: str, request_id: str = None):
    """
    Formatting the diarization results into a structured format.
    Applies fallback for turns longer than 60 seconds.
    """
    MAX_TURN_DURATION_SECONDS = 60
    turns = []
    skipped_turns = 0
    agent_speaker = diarization_output[0]['speaker'] if diarization_output else "SPEAKER_00"

    if request_id:
        log_request_step(logger, request_id, "TRANSLATE_BATCH_START", f"Translating {len(diarization_output)} segments")

    for i, entry in enumerate(diarization_output):
        speaker_id = entry['speaker']
        start_time = entry['start']
        end_time = entry['end']
        turn_duration = round(end_time - start_time, 2)

        transcript = entry.get('transcript', '')

        latency = None
        if i > 0:
            prev_end = diarization_output[i - 1]['end']
            curr_start = entry['start']
            latency = round(curr_start - prev_end, 3)

            if latency < 0:
                latency = 0

        # Check turn duration - apply fallback if > 60 seconds
        if turn_duration > MAX_TURN_DURATION_SECONDS:
            skipped_turns += 1
            fallback_reason = f"Failed to generate transcription: Turn duration ({turn_duration}s) exceeds maximum allowed ({MAX_TURN_DURATION_SECONDS}s)"

            if request_id:
                log_request_step(
                    logger, request_id, "TURN_SKIPPED",
                    f"Segment {i+1}: {fallback_reason}"
                )
            else:
                logger.warning(f"⚠️ SKIPPED Turn {i+1}: {fallback_reason}")

            # Add turn with fallback - same schema for DB
            turns.append({
                'role': 'agent' if speaker_id == agent_speaker else 'user',
                'start_time': start_time,
                'end_time': end_time,
                'content': transcript if transcript else f"[{fallback_reason}]",
                'translated_text': f"[{fallback_reason}]",
                'duration': turn_duration,
                'cost': None,
                'latency': latency
            })
            continue

        # Process valid turns normally
        if request_id and i == 0:
            log_request_step(logger, request_id, "TRANSLATE_SEND", f"Sending segment {i+1} to translation service")

        translated_response = await translate_text_local(
                transcript,
                target_language="en-IN",
                source_language=language,
                request_id=request_id
            )
        translated_transcript = translated_response.get("translated_text", "") if translated_response.get("success") else ""

        if request_id and i == 0:
            log_request_step(logger, request_id, "TRANSLATE_DONE", f"Received translation for segment {i+1}")

        turns.append({
            'role': 'agent' if speaker_id == agent_speaker else 'user',
            'start_time': start_time,
            'end_time': end_time,
            'content': transcript,
            'translated_text': translated_transcript,
            'duration': turn_duration,
            'cost': None,
            'latency': latency
        })

    total_duration = max([t['end_time'] for t in turns]) if turns else 0
    speakers = list(set([t['role'] for t in turns]))

    if request_id and skipped_turns > 0:
        log_request_step(
            logger, request_id, "TURNS_SKIPPED_SUMMARY",
            f"{skipped_turns}/{len(diarization_output)} turns skipped (duration > 60s)"
        )

    return {
        "turns": turns,
        "metadata": {
            "total_turns": len(turns),
            "total_duration": round(total_duration, 2),
            "speakers": speakers,
            "language": language,
            "model": "local",
            "skipped_turns": skipped_turns
        }
    }

