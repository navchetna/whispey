import os
import io
import time
import torch
import fairseq 
import librosa
import numpy as np
import soundfile as sf

from loguru import logger
import torch.nn.functional as F
import torchaudio.sox_effects as ta_sox

from .utilities import download_model


torch.serialization.add_safe_globals([fairseq.data.dictionary.Dictionary])


class AudioToText:
    def __init__(
        self,
        model_path: str = "models",
        language: str = "hindi",
        warmup_iterations: int = 3,
        batch_size: int = 1,
        dtype="bfloat16",
        sample_rate: int = 16000,
        max_audio_length: int = 30, 
    ):
        self.sample_rate = sample_rate
        self.max_audio_length = max_audio_length        # In seconds

        self.model_path = os.path.join(model_path, f"{language.lower()}.pt")
        if not os.path.exists(self.model_path):
            logger.warning(f"ASR model not found at {self.model_path}. Downloading...")
            download_model(language=language, model_dir=model_path)

        self.model, self.cfg, self.task = fairseq.checkpoint_utils.load_model_ensemble_and_task([self.model_path])
        self.model = self.model[0]
        self.dtype = torch.float32 if dtype == "float32" else torch.bfloat16
        self.model.to(self.dtype).eval()

        self.effects = [["gain", "-n"]]

        self.token = self.task.target_dictionary
        self.warmup(batch_size, warmup_iterations)

    def warmup(self, batch_size: int, iterations: int):
        dummy_audio = torch.randn(batch_size, self.sample_rate * self.max_audio_length).to(self.dtype)
        logger.info("Warming up the model...")
        for _ in range(iterations):
            _ = self.generate_logits(dummy_audio)


    def transcribe(self, audio: bytes) -> str:
        audio_array, sr = self.read_audio(audio)
        audio_processed = self._preprocess_audio(audio_array, sr)

        predicted_ids = self.generate_logits(audio_processed)
        
        transcription = self._post_processes(predicted_ids)

        if len(transcription) == 1:
            transcription = transcription[0]

        return transcription

    
    def diarized_transcript(self, audio: bytes, diarization_results: list) -> list:
        audio_array, sr = self.read_audio(audio)
        audio_processed = self._preprocess_audio(audio_array, sr)

        audio_segments = []
        for turn in diarization_results:
            start_stamp = int(float(turn['start']) * self.sample_rate)
            end_stamp = int(float(turn['end']) * self.sample_rate)
            turn_audio = audio_processed[:, start_stamp:end_stamp]
            padded_turn_audio = self._pad_audio(turn_audio.squeeze())
            audio_segments.append(torch.tensor(padded_turn_audio, dtype=torch.float32))
        
        # Stack the tensors for batch processing
        audio_segments = torch.cat(audio_segments, dim=0)

        predicted_ids = self.generate_logits(audio_segments)
        transcriptions = self._post_processes(predicted_ids)

        diarization_results = [{"transcript": transcriptions[i], **diarization_results[i]} for i in range(len(transcriptions))]
    
        return diarization_results
 

    def generate_logits(self, audio_processed: torch.Tensor) -> list:
        audio_processed = audio_processed.to(self.dtype)
        
        with torch.no_grad():
            audio_processed = F.layer_norm(audio_processed, audio_processed.shape)

        logits = self.model(source=audio_processed, padding_mask=None)['encoder_out']
        predicted_ids = torch.argmax(logits, axis=-1)
        predicted_ids = torch.unique_consecutive(
            predicted_ids.T, dim=1).tolist()
        return predicted_ids

    def read_audio(self, audio_bytes: bytes):
        audio_bytes = io.BytesIO(audio_bytes)
        audio_array, sr = sf.read(audio_bytes, dtype="float32")

        if audio_array.ndim == 2:
            audio_array = np.mean(audio_array, axis=1)

        return audio_array, sr

    def _preprocess_audio(self, audio_array: np.array, sr: int) -> torch.Tensor:
        # Resample if the sample rate don't match
        if sr != self.sample_rate:
            audio_array = librosa.resample(audio_array, orig_sr=sr, target_sr=self.sample_rate)

        padded_audio = self._pad_audio(audio_array)

        audio_processed, rate = ta_sox.apply_effects_tensor(
            torch.tensor(padded_audio), self.sample_rate, self.effects
        )
        audio_processed = audio_processed.float()
        return audio_processed

    def _pad_audio(self, audio: np.array):
        pad_buffer = np.array(
            [0] * (self.max_audio_length * self.sample_rate - len(audio)), dtype=np.float32
        )
        audio = np.append(audio, pad_buffer)
        audio = np.expand_dims(audio, axis=0)
        return audio
    
    def _post_processes(self, predicted_ids: list) -> str:
        transcriptions = []
        for ids in predicted_ids:
            transcription = self.token.string(ids)
            transcription = transcription.replace(
                " ", "").replace('|', " ").strip()
            transcriptions.append(transcription)
        return transcriptions
    

if __name__ == "__main__":
    download_model(language="hindi", model_dir="models")

    asr = AudioToText(
        model_path="models",
        language="hindi",
        batch_size=1
    )

    with open("../../samples/raya_voice.wav", "rb") as f:
        audio_bytes = f.read()

    # transcription = asr.transcribe_(audio_bytes)
    # print("Transcription:", transcription)

    diarized_results = [
        {"speaker":"SPEAKER_01","start":0.03096875,"end":15.336593750000002},
        {"speaker":"SPEAKER_00","start":17.83409375,"end":23.63909375},
        {"speaker":"SPEAKER_01","start":26.17034375,"end":36.00846875},
        {"speaker":"SPEAKER_00","start":37.34159375,"end":38.40471875},
        {"speaker":"SPEAKER_01","start":44.564093750000005,"end":62.51909375},
        {"speaker":"SPEAKER_00","start":65.21909375,"end":72.30659375}
    ]

    transcription = asr.diarized_transcript(audio_bytes, diarized_results)
    for turn in transcription:
        print(f"{turn['speaker']} [{turn['start']:.2f} - {turn['end']:.2f}]: {turn['transcript']}")