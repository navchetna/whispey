import time
import litserve as ls
from services.translate.languages import Locale, LANG_SCRIPT_TO_LOCALE
from services.translate.engine import IndicTranslator


class TranslationEngine(ls.LitAPI):
    def setup(self, device):
        self.translator = IndicTranslator()
    
    def decode_request(self, request):
        sentences = request.get("sentences", [])
        src_lang = request.get("source_language", "hin_Deva")
        tgt_lang = request.get("target_language", "eng_Latn")
        return sentences, src_lang, tgt_lang

    def predict(self, inputs):
        sentences, source_language, target_language = inputs
        src_lang = LANG_SCRIPT_TO_LOCALE[Locale(source_language)].value
        tgt_lang = LANG_SCRIPT_TO_LOCALE[Locale(target_language)].value
        translations = self.translator.batch_translate(
            sentences, src_lang=src_lang, tgt_lang=tgt_lang
        )
        return translations
    
    def encode_response(self, response):
        return {"translations": response}


if __name__ == "__main__":
    api = TranslationEngine(api_path="/v1/translate")
    server = ls.LitServer(api)
    server.run(port=8003)