from providers.local import transcribe_audio_local, translate_text_local
from providers.sarvam import transcribe_audio_sarvam, translate_text_sarvam


MODEL_REGISTRY = {
    "local": {
        "transcribe_audio": transcribe_audio_local,
        "translate_text": translate_text_local
    },
    "sarvam": {
        "transcribe_audio": transcribe_audio_sarvam,
        "translate_text": translate_text_sarvam
    }
}


def get_model_provider(provider_name: str):
    return MODEL_REGISTRY.get(provider_name, MODEL_REGISTRY["local"]).get("transcribe_audio")
    
