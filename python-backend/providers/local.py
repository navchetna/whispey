import os
import asyncio
from loguru import logger
import aiohttp 
import json
from pathlib import Path
from typing import Literal


async def transcribe_audio_local(audio_file_path: str):
    try:
        URL = os.getenv("LOCAL_INFERENCE_API_URL", "http://localhost:8005/v1/preprocess/")
        TRANSCRIPTION_URL = os.getenv("LOCAL_TRANSCRIPTION_API_URL", "http://localhost:8005/v1/audio/")
        async with aiohttp.ClientSession() as session:
            with open(audio_file_path, 'rb') as f:
                audio_data = f.read()
                form = aiohttp.FormData()
                form.add_field(
                    'file',
                    audio_data,
                    filename=Path(audio_file_path).name,
                    content_type='audio/wav'
                )    

                async with session.post(URL, data=form) as resp:
                    if resp.status == 200:
                        result = await resp.json()
                        diarized_output = result.get("diarization", [])
                        language = result.get("language", "unknown")
                        logger.info(f"Preprocessing completed. Detected language: {language}, Diarization segments: {len(diarized_output)}")
                    else:
                        return {
                            "success": False,
                            "error": f"Request failed with status {resp.status}"
                        }
                    
                form.add_field(
                    "diarized_input", 
                    json.dumps(diarized_output),
                    content_type="application/json"
                )
                    
                async with session.post(TRANSCRIPTION_URL, data=form) as resp:
                    if resp.status == 200:
                        result = await resp.json()
                        diarized_transcription = result.get("transcriptions", "")
                        logger.info(f"Transcription generation completed.")
                    else:
                        return {
                            "success": False,
                            "error": f"Request failed with status {resp.status}"
                        }
                
                formatted_result = await format_diarization_results(diarized_transcription, language)

                return {
                    "success": True,
                    "transcript": formatted_result
                }
    except Exception as e:
        return {
            "success": False,
            "error": str(e)
        }

            
async def translate_text_local(text: str,   source_language: str, target_language: str = "en-IN"):
    URL = os.getenv("LOCAL_TRANSLATION_API_URL", "http://localhost:8005/v1/translate/")

    try:
        async with aiohttp.ClientSession() as session:
            payload = {
                "sentences": [text],
                "source_language": source_language,
                "target_language": target_language,
            }
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
                

async def format_diarization_results(diarization_output: list, language: str):
    """
    Formatting the diarization results into a structured format.
    """
    turns = []
    agent_speaker = diarization_output[0]['speaker'] if diarization_output else "SPEAKER_00"
    for i, entry in enumerate(diarization_output):
        speaker_id = entry['speaker']
        start_time = entry['start']
        end_time = entry['end']

        transcript = entry.get('transcript', '')

        latency = None
        if i > 0:
            prev_end = diarization_output[i - 1]['end']
            curr_start = entry['start']
            latency = round(curr_start - prev_end, 3)

            if latency < 0:
                latency = 0

        # Get the translated text
        translated_response = await translate_text_local(
                transcript,
                target_language="en-IN",
                source_language=language
            )
        translated_transcript = translated_response.get("translated_text", "") if translated_response.get("success") else ""

        turns.append({
            'role': 'agent' if speaker_id == agent_speaker else 'user',
            'start_time': start_time,
            'end_time': end_time,
            'content': transcript,
            'translated_text': translated_transcript,
            'duration': round(end_time - start_time),
            'cost': None,
            'latency': latency
        })

    total_duration = max([t['end_time'] for t in turns]) if turns else 0
    speakers = list(set([t['role'] for t in turns]))

    return {
        "turns": turns,
        "metadata": {
            "total_turns": len(turns),
            "total_duration": round(total_duration, 2),
            "speakers": speakers,
            "language": language,
            "model": "local"
        }
    }

