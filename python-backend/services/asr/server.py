import os
import json
import logging
import litserve as ls
from engine import AudioToText
from logging_utils import log_request_step, extract_request_id

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


class ASREngine(ls.LitAPI):
    def setup(self, device):
        model_path = os.getenv("MODEL_PATH", "/app/models")
        language = os.getenv("LANGUAGE", "hindi")
        logger.info(f"Loading ASR model: {language} from {model_path}")
        self.asr = AudioToText(model_path=model_path, language=language)

    def decode_request(self, request):
        upload_file = request["file"]
        upload_file.file.seek(0)
        audio_bytes = upload_file.file.read()
        diarized_inputs = request.get("diarized_input", [])
        diarized_inputs = json.loads(diarized_inputs) if diarized_inputs else []

        # Extract request ID from form data
        request_id = request.get("request_id")

        if request_id:
            log_request_step(
                logger, request_id, "TRANSCRIBE_RECEIVED",
                f"Audio file received with {len(diarized_inputs)} diarization segments"
            )

        return audio_bytes, diarized_inputs, request_id

    def predict(self, inputs):
        audio_bytes, diarized_inputs, request_id = inputs

        if request_id:
            mode = "diarized" if diarized_inputs else "standard"
            log_request_step(logger, request_id, "TRANSCRIBE_START", f"Starting {mode} transcription")

        try:
            if diarized_inputs:
                transcription = self.asr.diarized_transcript(audio_bytes, diarized_inputs)
            else:
                transcription = self.asr.transcribe(audio_bytes)

            if request_id:
                log_request_step(logger, request_id, "TRANSCRIBE_COMPLETE", f"Generated {len(transcription)} transcription segments")

            return transcription, request_id
        except Exception as e:
            error_msg = f"Transcription failed: {str(e)}"
            logger.error(error_msg, exc_info=True)
            if request_id:
                log_request_step(logger, request_id, "TRANSCRIBE_ERROR", error_msg)
            # Return empty transcription on error
            return [], request_id

    def encode_response(self, response):
        transcription, request_id = response

        if request_id:
            log_request_step(logger, request_id, "TRANSCRIBE_RESPONSE", "Sending response back to gateway")

        return {"transcriptions": transcription}


if __name__ == "__main__":
    port = int(os.getenv("PORT", 8001))
    api = ASREngine()
    # Use single worker to avoid pickling issues with file uploads
    server = ls.LitServer(
        api,
        api_path="/v1/audio/",
        timeout=600,
        accelerator="cpu",
        devices=1,
        workers_per_device=1
    )
    logger.info(f"Starting ASR service on port {port}")
    server.run(port=port)
