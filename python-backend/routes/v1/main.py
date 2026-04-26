import litserve as ls
from routes.v1.transcribe import ASREngine
from routes.v1.preprocess import InferenceEngine
from routes.v1.translate import TranslationEngine



if __name__ == "__main__":
    # Note: Preprocessing/diarization and translation services temporarily disabled
    preprocess_api = InferenceEngine()
    transcription_api = ASREngine()
    translation_api = TranslationEngine()

    # Running only ASR service
    server = ls.LitServer(transcription_api, api_path="/v1/audio/", timeout=600)
    
    server.run(port=8005)