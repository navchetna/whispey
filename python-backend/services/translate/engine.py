import torch
import intel_extension_for_pytorch as ipex
from transformers import AutoModelForSeq2SeqLM, AutoTokenizer
from IndicTransToolkit.processor import IndicProcessor
import time
from loguru import logger


hard_hi_sentences = [
    "एक सौ दो दशमलव छह मेगाहर्ट पर  किया जाएगा। यह कार्ययक्रम आकाशवाणी के दिल्ली केंद्र  से प्रसारित किया गया।",
    "कुछ न कुछ  नया  करने की ऊर्जा ।",
    "आकाशवाणी  के  माध्यम से  माननीय  प्रधानमंत्री श्ररी नरेंद्र मोदी अपने मन की  बबातें साझा कर  रहे थे। हम आपको बता दें कि माननीय प्रधानमंत्री के इस प्रसारण के बाद",
    "मन की  बात के क््षेत्रीय भाषा  में अनुवाद का प्रसारण आकाशवाणी और दूरदर््शन के संबद्ध प्रादेशिक केंद्रों से तथा संस््कृत भाषा में अनुवाद का प्रसारण आकाशवाणी दिल्ली के।",
    "इंद्रप््रस्थ चैनल मीडियम।",
    "मन की  बात  के क्षेत्रीय भाषाओं  का पुनः प्रसारण आज रात आठ बजे आकाशवाणी के संबद्ध प्रादेशिक केंद्रों से और अंग्रेजी अनुवाद का  प्रसारण एफएम रेनबो।",
    "एक सौ दो दशमलव छह मेगाहर्ट पर  किया जाएगा। यह कार्यक्रम आकाशवाणी के  दिल्ली केंद्र  से प्रसारित किया गया।",
]


class IndicTranslator:
    def __init__(
            self, 
            checkpoint_dir: str = "ai4bharat/indictrans2-indic-en-1B",
            sample_src: str = "hin_Deva",
            sample_target: str = "eng_Latn",
            max_length: int = 256,
            batch_size=4,
        ):
        self.checkpoint_dir = checkpoint_dir
        self.tokenizer = AutoTokenizer.from_pretrained(self.checkpoint_dir, trust_remote_code=True)
        self.model = AutoModelForSeq2SeqLM.from_pretrained(self.checkpoint_dir, trust_remote_code=True, output_attentions=True)
        self.ip = IndicProcessor(inference=True)
        self.batch_size = batch_size
        self.max_length = max_length
        self.model = ipex.llm.optimize(self.model, dtype=torch.bfloat16)
        self.model.eval()
        self.sample_src = sample_src
        self.sample_target = sample_target
        self.warmup()
        
    def pre_print(self, print_str: str):
        logger.debug("=================================================")
        logger.debug(print_str)
        logger.debug("=================================================")

    def preprocess_input(self, sentences, src_lang, tgt_lang):
        preprocessed = self.ip.preprocess_batch(sentences, src_lang=src_lang, tgt_lang=tgt_lang)
        inputs = self.tokenizer(
            preprocessed, 
            truncation=True, 
            padding="max_length", 
            max_length=self.max_length, 
            return_tensors="pt", 
            return_attention_mask=True
        )
        return inputs

    def translate(self, inputs, tgt_lang):
        with torch.no_grad(), torch.amp.autocast("cpu", dtype=torch.bfloat16):
                generated_tokens = self.model.generate(
                                                    **inputs,
                                                    use_cache=True,
                                                    min_length=0,
                                                    max_length=self.max_length,
                                                    num_beams=5,
                                                    num_return_sequences=1,
                                                    no_repeat_ngram_size=3,
                                                    remove_invalid_values=True
                                                )
        decoded_tokens = self.tokenizer.batch_decode(generated_tokens.tolist(), src=False)
        postprocessed = self.ip.postprocess_batch(decoded_tokens, lang=tgt_lang)
        return postprocessed

    def batch_translate(self, input_sentences: list[str], src_lang="hin_Deva", tgt_lang="eng_Latn"):
        translations = []
        total_sentences = len(input_sentences)
        
        logger.debug(f"Total translations to be done: {total_sentences}\n")
        # Process batches
        for i in range(0, total_sentences, self.batch_size):
            logger.debug(f"Processing Batch {int(i / self.batch_size) + 1}")
            batch_start_time = time.time()
            batch = input_sentences[i:i+self.batch_size]
            if len(batch) < self.batch_size:
                batch += [batch[-1]] * (self.batch_size - len(batch))  # Repeat last element

            # Preprocess and translate the batch
            inputs = self.preprocess_input(batch, src_lang, tgt_lang)
            translated_batch = self.translate(inputs, tgt_lang)
            translations.extend(translated_batch)
            del inputs
            batch_time = time.time() - batch_start_time
            logger.debug(f"Batch Time: {batch_time}\n")

        translations = translations[:total_sentences]    
        for i in range(len(translations)):
            translations[i] = translations[i].replace("</s>", "").strip()
        return translations

    def single_translate(self, sentence, src_lang, tgt_lang):
        translations, time_taken = self.batch_translate([sentence], src_lang, tgt_lang)
        return translations[0], time_taken

    def warmup(self):
        self.pre_print("Translation Warming up!")
        for i in range(2):
            self.batch_translate(hard_hi_sentences, self.sample_src, self.sample_target)
        self.pre_print("Translation Warmup finished!")
    