import os
import tempfile
import logging
import litserve as ls
from core import Preprocessor
from logging_utils import log_request_step, extract_request_id

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


class InferenceEngine(ls.LitAPI):
    def setup(self, device):
        logger.info("Loading preprocessing/diarization models")
        self.preprocessor = Preprocessor()

    def decode_request(self, request):
        upload_file = request["file"]
        upload_file.file.seek(0)
        audio_bytes = upload_file.file.read()

        # Extract request ID from form data
        request_id = request.get("request_id")

        if request_id:
            log_request_step(logger, request_id, "PREPROCESS_RECEIVED", "Audio file received")

        return audio_bytes, request_id

    def predict(self, inputs):
        audio_bytes, request_id = inputs

        if request_id:
            log_request_step(logger, request_id, "PREPROCESS_START", "Starting diarization and language detection")

        # Save audio bytes to temporary file
        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as temp_audio:
            temp_audio.write(audio_bytes)
            temp_audio_path = temp_audio.name

        try:
            # Process using temporary file path
            diarization_results = self.preprocessor.diarize(temp_audio_path)
            language = self.preprocessor.detect_language(temp_audio_path)

            if request_id:
                log_request_step(
                    logger, request_id, "PREPROCESS_COMPLETE",
                    f"Language: {language}, Segments: {len(diarization_results)}"
                )

            return diarization_results, language, request_id
        except Exception as e:
            error_msg = f"Preprocessing failed: {str(e)}"
            logger.error(error_msg, exc_info=True)
            if request_id:
                log_request_step(logger, request_id, "PREPROCESS_ERROR", error_msg)
            raise
        finally:
            # Clean up temporary file
            if os.path.exists(temp_audio_path):
                os.remove(temp_audio_path)

    def encode_response(self, response):
        diarization_results, language, request_id = response

        if request_id:
            log_request_step(logger, request_id, "PREPROCESS_RESPONSE", "Sending response back to gateway")

        return {
            "diarization": diarization_results,
            "language": language
        }

if __name__ == "__main__":
    port = int(os.getenv("PORT", 8002))
    api = InferenceEngine()
    server = ls.LitServer(api, api_path="/v1/preprocess/", timeout=600)
    logger.info(f"Starting Preprocessing service on port {port}")
    server.run(port=port)
