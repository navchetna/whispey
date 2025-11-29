import os
import asyncio
from pathlib import Path
import tempfile
import shutil
import logging
from fastapi import FastAPI, HTTPException, UploadFile, File, Form, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sarvamai import AsyncSarvamAI
from dotenv import load_dotenv
import json

logger = logging.getLogger(__name__)

# Load environment variables - handle being run from different directories
script_dir = Path(__file__).parent
env_paths = [
    script_dir / '.env.local',           # Same directory
    script_dir.parent / '.env.local',    # Parent directory (whispey root)
    Path('.env.local'),                   # Current working directory
]
for env_path in env_paths:
    if env_path.exists():
        load_dotenv(env_path)
        break

app = FastAPI(title="SarvamAI Transcription Backend")

# Enable CORS for Next.js to call this API
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, specify exact origins
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class TranscribeResponse(BaseModel):
    success: bool
    transcript: dict | None = None
    error: str | None = None

@app.get("/health")
async def health():
    return {"status": "healthy"}

@app.post("/transcribe", response_model=TranscribeResponse)
async def transcribe(request: Request, file: UploadFile = File(None)):
    temp_file_path = None
    try:
        api_key = os.getenv('SARVAM_API_KEY')
        
        if not api_key:
            raise HTTPException(status_code=500, detail="SARVAM_API_KEY not configured in environment")
        
        # Debug: Log request details
        content_type = request.headers.get('content-type', '')
        
        # If file is None, try to get it from form data manually
        if file is None:
            form = await request.form()
            
            # Try common field names
            for field_name in ['file', 'audio', 'audio_file', 'recording']:
                if field_name in form:
                    file = form[field_name]
                    break
        
        if file is None:
            logger.error("No file found in request")
            raise HTTPException(status_code=400, detail="Audio file is required. Send as multipart/form-data with field name 'file'")
        
        print(f"📁 Received file: {file.filename}, content_type: {file.content_type}")
        
        # Save uploaded file to a temporary location
        suffix = Path(file.filename).suffix if file.filename else '.wav'
        if not suffix:
            suffix = '.wav'
        
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as temp_file:
            temp_file_path = temp_file.name
            content = await file.read()
            logger.info(f"File size: {len(content)} bytes")
            
            if len(content) == 0:
                raise HTTPException(status_code=400, detail="Uploaded file is empty")
            
            temp_file.write(content)
        
        logger.info(f"Starting transcription for uploaded file: {file.filename} (saved to {temp_file_path})")
        
        # Run async transcription
        result = await transcribe_audio(temp_file_path, api_key)
        
        if result.get('success'):
            logger.info(f"Transcription completed successfully")
            return result
        else:
            logger.error(f"Transcription failed: {result.get('error')}")
            raise HTTPException(status_code=500, detail=result.get('error'))
            
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error in transcribe endpoint: {str(e)}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        # Clean up temporary file
        if temp_file_path and os.path.exists(temp_file_path):
            os.unlink(temp_file_path)

async def transcribe_audio(audio_file_path: str, api_key: str):
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
        final_status = await job.wait_until_complete()
        
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
        return {
            "success": False,
            "error": str(e)
        }

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
        
        logger.info(f"Merged {len(entries)} entries into {len(merged_entries)} turns")
        
        # Step 2: Format turns with required fields
        # Latency for turn N is calculated as: turn N start_time - turn N-1 end_time
        # This measures the gap/response time between consecutive speakers
        turns = []
        for i, entry in enumerate(merged_entries):
            speaker_id = entry['speaker_id']
            # Map speaker IDs: 0 = agent, 1 = user
            role = 'agent' if speaker_id == '0' else 'user'
            
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
        print(f"Error formatting transcript: {str(e)}")
        import traceback
        traceback.print_exc()
        return {
            'turns': [],
            'metadata': {},
            'error': str(e)
        }

if __name__ == '__main__':
    import uvicorn
    port = int(os.getenv('PYTHON_BACKEND_PORT', 5006))
    print(f"Starting Python backend on port {port}")
    print(f"API endpoint: http://localhost:{port}/transcribe")
    uvicorn.run(app, host='0.0.0.0', port=port, log_level="info")
