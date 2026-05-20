"""
Language Identification Core Logic

Uses SpeechBrain's voxlingua107 model for 107-language identification
"""
from speechbrain.inference.classifiers import EncoderClassifier

from utils.logging import get_logger

logger = get_logger(__name__)


class LanguageIdentifier:
    def __init__(
        self,
        model_source: str = "speechbrain/lang-id-voxlingua107-ecapa",
        savedir: str = "tmp"
    ):
        """Initialize language identification model"""
        logger.info(f"Loading language ID model: {model_source}")
        self.classifier = EncoderClassifier.from_hparams(
            source=model_source,
            savedir=savedir
        )
        logger.info("Language ID model loaded successfully")

    def identify(self, audio_path: str) -> dict:
        """
        Identify language from audio file

        Returns:
            dict: {
                "language_code": str (e.g., "en", "hi"),
                "language_name": str (e.g., "English", "Hindi"),
                "confidence": float (0-1)
            }
        """
        # Load audio
        signal = self.classifier.load_audio(audio_path)

        # Classify
        prediction = self.classifier.classify_batch(signal)

        # Extract results
        # prediction format: (scores, confidence, index, language_code)
        confidence = prediction[1].exp().item()  # Convert log-likelihood to probability
        language_full = prediction[3][0]  # e.g., 'en: English'

        # Parse language code and name
        if ':' in language_full:
            code, name = language_full.split(':', 1)
            code = code.strip()
            name = name.strip()
        else:
            code = language_full
            name = language_full

        return {
            "language_code": code,
            "language_name": name,
            "confidence": round(confidence, 4)
        }
