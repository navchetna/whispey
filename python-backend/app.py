import os
import asyncio
from pathlib import Path
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sarvamai import AsyncSarvamAI
from dotenv import load_dotenv

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

class TranscribeRequest(BaseModel):
    audio_file_path: str
    api_key: str | None = None

class TranscribeResponse(BaseModel):
    success: bool
    transcript: dict | None = None
    error: str | None = None

@app.get("/health")
async def health():
    return {"status": "healthy"}

@app.post("/transcribe", response_model=TranscribeResponse)
async def transcribe(request: TranscribeRequest):
    try:
        audio_file_path = request.audio_file_path
        api_key = request.api_key or os.getenv('SARVAM_API_KEY')
        
        if not audio_file_path:
            raise HTTPException(status_code=400, detail="audio_file_path is required")
        
        if not api_key:
            raise HTTPException(status_code=500, detail="API key not configured")
        
        # Check if file exists
        if not os.path.exists(audio_file_path):
            raise HTTPException(status_code=404, detail=f"File not found: {audio_file_path}")
        
        print(f"🎙️ Starting transcription for: {audio_file_path}")
        
        # Run async transcription
        result = await transcribe_audio(audio_file_path, api_key)
        
        if result.get('success'):
            print(f"✅ Transcription completed successfully")
            return result
        else:
            print(f"❌ Transcription failed: {result.get('error')}")
            raise HTTPException(status_code=500, detail=result.get('error'))
            
    except HTTPException:
        raise
    except Exception as e:
        print(f"❌ Error in transcribe endpoint: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

async def transcribe_audio(audio_file_path: str, api_key: str):
    try:
        # Initialize SarvamAI client
        client = AsyncSarvamAI(api_subscription_key=api_key)
        
        # Create transcription job
        print("📤 Creating transcription job...")
        job = await client.speech_to_text_job.create_job(
            model="saarika:v2.5",
            with_diarization=True,
            num_speakers=2,
            language_code="en-IN"
        )
        
        # Upload audio file
        print("📁 Uploading audio file...")
        await job.upload_files(file_paths=[audio_file_path])
        
        # Start job
        print("▶️ Starting transcription job...")
        await job.start()
        
        # Wait for completion (this handles the 5+ minute wait)
        print("⏳ Waiting for transcription to complete (this may take 5+ minutes)...")
        final_status = await job.wait_until_complete()
        
        # Check if failed
        if await job.is_failed():
            return {
                "success": False,
                "error": "STT job failed"
            }
        
        # Download outputs
        print("📥 Downloading transcript...")
        output_dir = "/tmp/sarvam_output"
        
        # Clean output directory before download
        import shutil
        if os.path.exists(output_dir):
            shutil.rmtree(output_dir)
        os.makedirs(output_dir, exist_ok=True)
        
        await job.download_outputs(output_dir=output_dir)
        
        # List all downloaded files for debugging
        print(f"📂 Files in output directory:")
        for root, dirs, files in os.walk(output_dir):
            for file in files:
                file_path = os.path.join(root, file)
                print(f"   - {file_path}")
        
        # Read the diarized transcript - check multiple possible filenames
        import json
        possible_transcript_files = [
            os.path.join(output_dir, "diarized_transcript.json"),
            os.path.join(output_dir, "transcript.json"),
            os.path.join(output_dir, "output.json"),
        ]
        
        # Also check for any JSON file in the directory
        json_files = []
        for root, dirs, files in os.walk(output_dir):
            for file in files:
                if file.endswith('.json'):
                    json_files.append(os.path.join(root, file))
        
        transcript_path = None
        for path in possible_transcript_files + json_files:
            if os.path.exists(path):
                transcript_path = path
                print(f"✅ Found transcript file: {transcript_path}")
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
                for file in files:
                    all_files.append(os.path.join(root, file))
            print(f"❌ No transcript JSON found. Files in output: {all_files}")
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
    """Format SarvamAI transcript to match the expected structure"""
    try:
        entries = transcript_data.get('diarized_transcript', {}).get('entries', [])
        
        turns = []
        for entry in entries:
            speaker_id = entry.get('speaker_id', 0)
            # Map speaker IDs: 0 = agent, 1 = user
            role = 'agent' if speaker_id == 0 else 'user'
            
            turns.append({
                'role': role,
                'speaker': f'Speaker {speaker_id}',
                'text': entry.get('transcript', ''),
                'start_time': entry.get('start_time_seconds', 0),
                'end_time': entry.get('end_time_seconds', 0),
                'duration': entry.get('end_time_seconds', 0) - entry.get('start_time_seconds', 0)
            })
        
        # Calculate metadata
        total_duration = max([t['end_time'] for t in turns]) if turns else 0
        speakers = list(set([t['speaker'] for t in turns]))
        
        return {
            'turns': turns,
            'metadata': {
                'total_turns': len(turns),
                'total_duration': total_duration,
                'speakers': speakers,
                'language': 'en-IN',
                'model': 'saarika:v2.5'
            }
        }
    except Exception as e:
        print(f"Error formatting transcript: {str(e)}")
        return {
            'turns': [],
            'metadata': {},
            'error': str(e)
        }

if __name__ == '__main__':
    import uvicorn
    port = int(os.getenv('PYTHON_BACKEND_PORT', 5006))
    print(f"🚀 Starting Python backend on port {port}")
    print(f"📋 API endpoint: http://localhost:{port}/transcribe")
    uvicorn.run(app, host='0.0.0.0', port=port, log_level="info")
