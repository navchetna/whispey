



# Serving for Audios and Translation API service


## How to run

1. Translate API
- Server
    ```
    PYTHONPATH=$(pwd) python routes/v1/translate.py 
    ```
- Inference
    ```
    curl -X POST http://localhost:8003/v1/translate   -H "Content-Type: application/json"   -d '{
        "sentences": [
        "नमस्ते दुनिया" 
        ],
        "source_language": "hin_Deva",
        "target_language": "eng_Latn"
    }'
    ```

2. Diarization
- Server
    ```
    PYTHONPATH=$(pwd) python routes/v1/preprocess.py 
    ```
- Inference
    ```
    curl -X POST http://localhost:8002/v1/diarize/ \
    -H "Content-Type: multipart/form-data" \
    -F "file=@sample.wav"
    ```

3. Diarized Transcription
- Server
    ```
    PYTHONPATH=$(pwd) python routes/v1/transcribe.py
    ```
- Inference
    ```
    curl -X POST http://localhost:8005/v1/audio/ \
        -H "Content-Type: multipart/form-data" \
        -F "file=@samples/raya_voice.wav" \
        -F 'diarized_input=[
            {"speaker":"SPEAKER_01","start":0.03096875,"end":15.336593750000002},
            {"speaker":"SPEAKER_00","start":17.83409375,"end":23.63909375},
            {"speaker":"SPEAKER_01","start":26.17034375,"end":36.00846875},
            {"speaker":"SPEAKER_00","start":37.34159375,"end":38.40471875},
            {"speaker":"SPEAKER_01","start":44.564093750000005,"end":62.51909375},
            {"speaker":"SPEAKER_00","start":65.21909375,"end":72.30659375}
        ]'
    ```

4. Central Server
- Server
    ```
    PYTHONPATH=$(pwd) python routes/v1/main.py 
    ```

5. Main Server

- Server
    ```
    PYTHONPATH=$(pwd) python app.py
    ```
- Inference
    ```
    curl -X POST http://localhost:5006/transcribe \
        -H "Content-Type: multipart/form-data" \
        -F "file=@samples/raya_voice.wav"
    ```



### Translation API

```
uv pip install git+https://github.com/VarunGumma/IndicTransToolkit.git@728a7a9e8bcbbc59ca9e15c4297889df866b8c4a 
```
