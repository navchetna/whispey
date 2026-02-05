import litserve as ls
from routes.v1.transcribe import ASREngine
from routes.v1.preprocess import InferenceEngine
from routes.v1.translate import TranslationEngine



if __name__ == "__main__":
    preprocess_api = InferenceEngine(api_path="/v1/preprocess/")
    transcription_api = ASREngine(api_path="/v1/audio/")
    translation_api = TranslationEngine(api_path="/v1/translate/")
    server = ls.LitServer([preprocess_api, transcription_api, translation_api], timeout=600)
    server.run(port=8005)