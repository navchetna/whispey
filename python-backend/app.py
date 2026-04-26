import os
from pathlib import Path
import tempfile
import logging
import sys
import subprocess
from registry import get_model_provider

from fastapi import FastAPI, HTTPException, UploadFile, File, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dotenv import load_dotenv

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[logging.StreamHandler(sys.stdout)]
)

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

# load the function to use for transcription based on MODEL_PROVIDER env variable
transcribe_audio_fn = get_model_provider(os.getenv('MODEL_PROVIDER', 'local'))


class TranscribeResponse(BaseModel):
    success: bool
    transcript: dict | None = None
    error: str | None = None


# TODO: Define in the context of the local models
def convert_to_wav_16k_mono(
    input_audio: str | Path,
    output_wav: str | Path,
):
    cmd = [
        "ffmpeg",
        "-y",                     # overwrite output
        "-i", str(input_audio),   # input file
        "-ac", "1",               # mono
        "-ar", "16000",            # 16 kHz
        "-c:a", "pcm_s16le",       # 16-bit PCM (standard WAV)
        str(output_wav),
    ]

    try:
        subprocess.run(cmd, check=True)
    except subprocess.CalledProcessError as e:
        logger.error(f"Error converting audio: {e}")
        return None


@app.get("/health")
async def health():
    return {"status": "healthy"}


@app.post("/transcribe", response_model=TranscribeResponse)
async def transcribe(request: Request, file: UploadFile = File(None)):
    temp_file_path = None
    temp_file_path_mono_16k = None
    try:
        if file is None:
            form = await request.form()
            for field_name in ['file', 'audio', 'audio_file', 'recording']:
                if field_name in form:
                    file = form[field_name]
                    break

        if file is None:
            logger.error("No file found in request")
            raise HTTPException(status_code=400, detail="Audio file is required")

        logger.info(f"Received file: {file.filename}, content_type: {file.content_type}")

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

        logger.info(f"Starting transcription for: {file.filename}")

        temp_file_path_mono_16k = temp_file_path + "_converted.wav"
        convert_to_wav_16k_mono(temp_file_path, temp_file_path_mono_16k)

        result = await transcribe_audio_fn(temp_file_path_mono_16k)

        if result.get('success'):
            logger.info("Transcription completed successfully")
            return result
        else:
            error_msg = result.get('error', 'Unknown error')
            logger.error(f"Transcription failed: {error_msg}")

            if 'rate_limit' in error_msg.lower():
                raise HTTPException(status_code=429, detail=error_msg)

            raise HTTPException(status_code=500, detail=error_msg)

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error in transcribe endpoint: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        for path in [temp_file_path, temp_file_path_mono_16k]:
            if path and os.path.exists(path):
                os.unlink(path)
    

if __name__ == '__main__':
    import uvicorn
    port = int(os.getenv('PYTHON_BACKEND_PORT', 5006))
    logger.info(f"Starting Python backend on port {port}")
    logger.info(f"API endpoint: http://localhost:{port}/transcribe")
    uvicorn.run(app, host='0.0.0.0', port=port, log_level="info")
