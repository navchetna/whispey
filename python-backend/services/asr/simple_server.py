import os
import json
import logging
from fastapi import FastAPI, File, UploadFile, Form
from fastapi.responses import JSONResponse
import uvicorn
from engine import AudioToText

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI()

# Global ASR model
asr_model = None


@app.on_event("startup")
async def startup_event():
    global asr_model
    model_path = os.getenv("MODEL_PATH", "/app/models")
    language = os.getenv("LANGUAGE", "hindi")
    logger.info(f"Loading ASR model: {language} from {model_path}")
    asr_model = AudioToText(model_path=model_path, language=language)
    logger.info("ASR model loaded successfully")


@app.post("/v1/audio/")
async def transcribe(
    file: UploadFile = File(...),
    diarized_input: str = Form(None)
):
    try:
        # Read audio bytes
        audio_bytes = await file.read()

        # Parse diarized input if provided
        diarized_inputs = []
        if diarized_input:
            try:
                diarized_inputs = json.loads(diarized_input)
            except json.JSONDecodeError:
                pass

        # Perform transcription
        if diarized_inputs:
            logger.info("Diarization input found. Performing diarized transcription.")
            transcription = asr_model.diarized_transcript(audio_bytes, diarized_inputs)
        else:
            transcription = asr_model.transcribe(audio_bytes)

        return JSONResponse(content={"transcriptions": transcription})

    except Exception as e:
        logger.error(f"Transcription error: {str(e)}", exc_info=True)
        return JSONResponse(
            status_code=500,
            content={"error": f"Transcription failed: {str(e)}"}
        )


@app.get("/health")
async def health():
    return {"status": "healthy"}


if __name__ == "__main__":
    port = int(os.getenv("PORT", 8001))
    logger.info(f"Starting ASR service on port {port}")
    uvicorn.run(app, host="0.0.0.0", port=port)
