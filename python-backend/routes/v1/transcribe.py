import time
import json
import logging
import litserve as ls
from services.asr.engine import AudioToText

logger = logging.getLogger(__name__)


class ASREngine(ls.LitAPI):
    def setup(self, device):
        self.asr = AudioToText()
    
    def decode_request(self, request):
        upload_file = request["file"]
        upload_file.file.seek(0)
        audio_bytes = upload_file.file.read()
        diarized_inputs = request.get("diarized_input", [])
        diarized_inputs = json.loads(diarized_inputs) if diarized_inputs else []
        return audio_bytes, diarized_inputs
    
    def predict(self, inputs):
        audio_bytes, diarized_inputs = inputs
        transcription = ""
        if diarized_inputs:
            logger.info("Diarization input found. Performing diarized transcription.")
            transcription = self.asr.diarized_transcript(
                audio_bytes, diarized_inputs
            )
        else:
            transcription = self.asr.transcribe(audio_bytes)
        return transcription        
    
    def encode_response(self, response):
        return {"transcriptions": response}


if __name__ == "__main__":
    api = ASREngine(api_path="/v1/audio/")
    server = ls.LitServer(api)
    server.run(port=8005)