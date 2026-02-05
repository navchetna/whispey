import os
import torch
import torchaudio
from pyannote.audio import Pipeline
from transformers import Wav2Vec2ForSequenceClassification, AutoFeatureExtractor


class Preprocessor:
    # Works only for audio files
    def __init__(
            self,
            target_sr: int = 16000, 
            diarization_model_name: str = "pyannote/speaker-diarization-community-1",
            lid_model_id: str = "onecxi/vakgyata-small"
        ):
        self.pipeline = Pipeline.from_pretrained(
            diarization_model_name,
            token=os.environ.get("HF_TOKEN")
        )
        self.target_sr = target_sr
        self.lid_processor = AutoFeatureExtractor.from_pretrained(lid_model_id)
        self.lid_model = Wav2Vec2ForSequenceClassification.from_pretrained(lid_model_id)

    def _club_speakers(self, diarization_results: list) -> list:
        last_turn = diarization_results[0]["speaker"]
        if not diarization_results:
            return []
        clubbed_results = [diarization_results[0]]
        for turn in diarization_results:
            if turn["speaker"] == last_turn:
                clubbed_results[-1]["end"] = turn["end"]
            else:
                clubbed_results.append(turn)
                last_turn = turn["speaker"]
        return clubbed_results

    def diarize(self, audio_file: str):
        output = self.pipeline(audio_file)
        diarization_results = []
        for turn, speaker in output.speaker_diarization:
            diarization_results.append({
                "speaker": speaker,
                "start": turn.start,
                "end": turn.end
            })
        clubbed_results = self._club_speakers(diarization_results)
        return clubbed_results
    
    def detect_language(self, audio_path):
        audio, sr = torchaudio.load(audio_path)

        if sr != self.target_sr:
            audio = torchaudio.functional.resample(
                audio, orig_freq=sr, new_freq=self.target_sr
            )
        
        # Convert to mono
        if audio.shape[0] > 1:
            audio = torch.mean(audio, dim=0, keepdim=True)

        # Preprocess
        inputs = self.lid_processor(audio.squeeze(), sampling_rate=sr, return_tensors="pt")

        # Inference
        with torch.no_grad():
            logits = self.lid_model(**inputs).logits

        # Softmax to get probabilities
        probs = logits.softmax(dim=-1).cpu().numpy()
        # Predicted language
        language = self.lid_model.config.id2label.get(probs.argmax())

        return language
            

if __name__ == "__main__":
    preprocessor = Preprocessor()
    # results = preprocessor.diarize("samples/raya_voice.wav")
    # for res in results:
        # print(f"Speaker: {res['speaker']}, Start: {res['start']}, End: {res['end']}")
    # language = preprocessor.detect_language("samples/raya_voice.wav")
    language = preprocessor.detect_language("samples/hindi1_16.wav")
    print(f"Detected Language: {language}")