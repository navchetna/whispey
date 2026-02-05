import time
import litserve as ls
from services.preprocess.core import Preprocessor


class InferenceEngine(ls.LitAPI):
    def setup(self, device):
        self.preprocessor = Preprocessor()

    def decode_request(self, request):
        upload_file = request["file"]
        upload_file.file.seek(0)
        audio_bytes = upload_file.file.read()
        audio_path = f"/tmp/audio_{int(time.time())}.wav"
        with open(audio_path, "wb") as temp_audio_file:
            temp_audio_file.write(audio_bytes)
        return audio_path
        
    def predict(self, inputs):
        diarization_results = self.preprocessor.diarize(inputs)
        language = self.preprocessor.detect_language(inputs)
        return  diarization_results, language

    def encode_response(self, response):
        diarization_results, language = response
        return {
            "diarization": diarization_results,
            "language": language
        }
    

if __name__ == "__main__":
    api = InferenceEngine(api_path="/v1/preprocess/")
    server = ls.LitServer(api)
    server.run(port=8002)
