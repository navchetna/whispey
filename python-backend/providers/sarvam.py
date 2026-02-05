import os
import shutil
import json
import time

import asyncio
from typing import Literal
from loguru import logger 
from sarvamai import AsyncSarvamAI,  SarvamAI


async def transcribe_audio_sarvam(audio_file_path: str):
    api_key = os.getenv('SARVAM_API_KEY')
    if api_key is None:
        return {
            "success": False,
            "error": "SARVAM_API_KEY not configured in environment"
        }
    for _ in range(3):
        try:
            # Initialize SarvamAI client
            client = AsyncSarvamAI(api_subscription_key=api_key)
            
            # Create transcription job
            logger.info("Creating transcription job...")
            job = await client.speech_to_text_job.create_job(
                model="saarika:v2.5",
                with_diarization=True,
                num_speakers=2,
            )
            
            # Upload audio file
            await job.upload_files(file_paths=[audio_file_path])
            
            # Start job
            await job.start()
            
            # Wait for completion (this handles the 5+ minute wait)
            await job.wait_until_complete()


            file_results = await job.get_file_results()

            for f in file_results['successful']:
                logger.info(f"{f['file_name']}")
            

            # Check if failed
            if await job.is_failed():
                return {
                    "success": False,
                    "error": "STT job failed"
                }
            
            # Download outputs
            logger.info("Downloading transcript...")
            output_dir = "/tmp/sarvam_output"
            
            # Clean output directory before download
            if os.path.exists(output_dir):
                shutil.rmtree(output_dir)
            os.makedirs(output_dir, exist_ok=True)
            
            await job.download_outputs(output_dir=output_dir)
                    
            # Read the diarized transcript - check multiple possible filenames
            possible_transcript_files = [
                os.path.join(output_dir, "diarized_transcript.json"),
                os.path.join(output_dir, "transcript.json"),
                os.path.join(output_dir, "output.json"),
            ]
            
            # Also check for any JSON file in the directory
            json_files = []
            for root, dirs, files in os.walk(output_dir):
                for f in files:
                    if f.endswith('.json'):
                        json_files.append(os.path.join(root, f))
            
            transcript_path = None
            for path in possible_transcript_files + json_files:
                if os.path.exists(path):
                    transcript_path = path
                    logger.info(f"Found transcript file: {transcript_path}")
                    break
            
            if transcript_path:
                with open(transcript_path, 'r') as f:
                    transcript_data = json.load(f)
                
                # Format the transcript
                formatted_transcript = format_diarized_transcript(transcript_data)
                
                return {
                    "success": True,
                    "transcript": formatted_transcript
                }
            else:
                # List what files we did find
                all_files = []
                for root, dirs, files in os.walk(output_dir):
                    for f in files:
                        all_files.append(os.path.join(root, f))
                logger.info(f"No transcript JSON found. Files in output: {all_files}")
                return {
                    "success": False,
                    "error": f"Transcript file not found. Available files: {all_files}"
                }
                
        except Exception as e:
            # Extract clean error message from SarvamAI API errors
            error_message = str(e)
            
            # Check if it's a SarvamAI ApiError with body containing error details
            if hasattr(e, 'body') and isinstance(e.body, dict):
                body = e.body
                if 'error' in body:
                    error_info = body['error']
                    if isinstance(error_info, dict):
                        error_message = error_info.get('message', str(e))
                        error_code = error_info.get('code', '')
                        if error_code:
                            error_message = f"{error_message} ({error_code})"
                    else:
                        error_message = str(error_info)
                elif 'message' in body:
                    error_message = body['message']
            
            logger.info(f"Transcription failed: {error_message}")
            await asyncio.sleep(60)
            
    return {
        "success": False,
        "error": error_message
    }


def translate_text_sarvam(text, target_language='en-IN'):
    """Translate text to target language."""
    client = SarvamAI(
        api_subscription_key=os.getenv('SARVAM_API_KEY')
    )

    for _ in range(5):
        try:
            response = client.text.translate(
                input=text,
                source_language_code='auto',
                target_language_code=target_language
            )

            return response.translated_text

        except Exception as e:
            logger.info(f"Translation error: {str(e)}, Trying again...")
            time.sleep(60)
        
    logger.info("Translation failed after multiple attempts.")
    return "" # Return empty string if translation fails


def format_diarized_transcript(transcript_data):
    """Format SarvamAI transcript to match the expected structure.
    
    Step 1: Merge consecutive turns from the same speaker
    Step 2: Add start_time, end_time, cost (empty), and latency (gap between turns)
    
    Latency is calculated as: next_turn.start_time - current_turn.end_time
    This represents the gap between speakers, excluding the time they are speaking.
    """
    try:
        entries = transcript_data.get('diarized_transcript', {}).get('entries', [])
        language_code = transcript_data.get('language_code', 'unknown')
        
        if not entries:
            return {
                'turns': [],
                'metadata': {
                    'total_turns': 0,
                    'total_duration': 0,
                    'speakers': [],
                    'language': language_code,
                    'model': 'saarika:v2.5'
                }
            }
        
        # Step 1: Merge consecutive turns from the same speaker
        merged_entries = []
        current_entry = None
        
        for entry in entries:
            speaker_id = str(entry.get('speaker_id', '0'))
            
            if current_entry is None:
                # First entry
                current_entry = {
                    'speaker_id': speaker_id,
                    'transcript': entry.get('transcript', ''),
                    'start_time_seconds': entry.get('start_time_seconds', 0),
                    'end_time_seconds': entry.get('end_time_seconds', 0),
                }
            elif current_entry['speaker_id'] == speaker_id:
                # Same speaker - merge by appending text and extending end time
                current_entry['transcript'] += ' ' + entry.get('transcript', '')
                current_entry['end_time_seconds'] = entry.get('end_time_seconds', current_entry['end_time_seconds'])
            else:
                # Different speaker - save current and start new
                merged_entries.append(current_entry)
                current_entry = {
                    'speaker_id': speaker_id,
                    'transcript': entry.get('transcript', ''),
                    'start_time_seconds': entry.get('start_time_seconds', 0),
                    'end_time_seconds': entry.get('end_time_seconds', 0),
                }

        # Don't forget the last entry
        if current_entry:
            merged_entries.append(current_entry)
        
        # Determine which speaker_id should be 'agent' based on who speaks first
        # The first speaker in the timeline is always the agent/assistant
        first_speaker_id = merged_entries[0]['speaker_id'] if merged_entries else '0'
        logger.info(f"First speaker ID: {first_speaker_id} - will be assigned as 'agent'")
        
        # Translate all transcriptions for Indic languages to English
        if language_code not in ["en-IN", "en-US"]:
            for entry in merged_entries:
                entry["translated_text"] = translate_text_sarvam(entry["transcript"], target_language="en-IN")

        logger.info(f"Merged {len(entries)} entries into {len(merged_entries)} turns")
        
        # Step 2: Format turns with required fields
        # Latency for turn N is calculated as: turn N start_time - turn N-1 end_time
        # This measures the gap/response time between consecutive speakers
        turns = []
        for i, entry in enumerate(merged_entries):
            speaker_id = entry['speaker_id']
            # Map speaker IDs: first speaker = agent, other speaker = user
            # This ensures the assistant/agent always comes first in the transcript
            role = 'agent' if speaker_id == first_speaker_id else 'user'
            
            # Calculate latency as the gap between this turn's start and previous turn's end
            # This excludes the speaking duration and only measures the response delay
            latency = None
            if i > 0:
                prev_end = merged_entries[i - 1]['end_time_seconds']
                curr_start = entry['start_time_seconds']
                latency = round(curr_start - prev_end, 3)
                # Latency can be negative if there's overlap, set to 0 in that case
                if latency < 0:
                    latency = 0
            
            turns.append({
                'role': role,
                'content': entry['transcript'].strip(),
                'translated_text': entry.get('translated_text', ''),
                'start_time': entry['start_time_seconds'],
                'end_time': entry['end_time_seconds'],
                'duration': round(entry['end_time_seconds'] - entry['start_time_seconds']),
                'cost': None,  # Empty as requested
                'latency': latency,
            })
        
        # Calculate metadata
        total_duration = max([t['end_time'] for t in turns]) if turns else 0
        speakers = list(set([t['role'] for t in turns]))
        
        return {
            'turns': turns,
            'metadata': {
                'total_turns': len(turns),
                'total_duration': round(total_duration, 2),
                'speakers': speakers,
                'language': language_code,
                'model': 'saarika:v2.5'
            }
        }
    except Exception as e:
        logger.info(f"Error formatting transcript: {str(e)}")
        import traceback
        traceback.print_exc()
        return {
            'turns': [],
            'metadata': {},
            'error': str(e)
        }