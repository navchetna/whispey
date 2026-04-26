import os
import logging
import litserve as ls
from engine import IndicTranslator
from languages import Locale, LANG_SCRIPT_TO_LOCALE
from logging_utils import log_request_step, extract_request_id

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


class TranslationEngine(ls.LitAPI):
    def setup(self, device):
        logger.info("Loading translation models")
        self.translator = IndicTranslator()

    def decode_request(self, request):
        sentences = request.get("sentences", [])
        source_language = request.get("source_language", "hin_Deva")
        target_language = request.get("target_language", "eng_Latn")

        # Extract request ID from payload
        request_id = request.get("request_id")

        if request_id:
            log_request_step(
                logger, request_id, "TRANSLATE_RECEIVED",
                f"{len(sentences)} sentences from {source_language} to {target_language}"
            )

        return sentences, source_language, target_language, request_id

    def predict(self, inputs):
        sentences, source_language, target_language, request_id = inputs

        if request_id:
            log_request_step(
                logger, request_id, "TRANSLATE_START",
                f"Translating {len(sentences)} sentences from {source_language} to {target_language}"
            )

        try:
            # Convert locale codes (e.g., "mr-IN") to lang_script codes (e.g., "mar_Deva")
            src_lang = LANG_SCRIPT_TO_LOCALE[Locale(source_language)].value
            tgt_lang = LANG_SCRIPT_TO_LOCALE[Locale(target_language)].value

            if request_id:
                log_request_step(
                    logger, request_id, "TRANSLATE_CONVERT",
                    f"Converted {source_language} -> {src_lang}, {target_language} -> {tgt_lang}"
                )

            translations = self.translator.batch_translate(sentences, src_lang=src_lang, tgt_lang=tgt_lang)

            if request_id:
                log_request_step(logger, request_id, "TRANSLATE_COMPLETE", f"Translated {len(translations)} sentences")

            return translations, request_id
        except Exception as e:
            error_msg = f"Translation failed: {str(e)}"
            logger.error(error_msg, exc_info=True)
            if request_id:
                log_request_step(logger, request_id, "TRANSLATE_ERROR", error_msg)
            # Return empty translations on error
            return [""] * len(sentences), request_id

    def encode_response(self, response):
        translations, request_id = response

        if request_id:
            log_request_step(logger, request_id, "TRANSLATE_RESPONSE", "Sending response back to gateway")

        return {"translations": translations}


if __name__ == "__main__":
    port = int(os.getenv("PORT", 8003))
    api = TranslationEngine()
    server = ls.LitServer(api, api_path="/v1/translate/", timeout=600)
    logger.info(f"Starting Translation service on port {port}")
    server.run(port=port)
