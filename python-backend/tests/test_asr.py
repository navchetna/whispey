"""
Test ASR Service

Validates output format matches pipeline requirements
"""
import pytest
import requests
from io import BytesIO


def test_asr_output_format(base_url, test_audio_bytes):
    """Test that ASR returns correct format"""

    # Prepare request
    files = {'file': ('test.wav', BytesIO(test_audio_bytes), 'audio/wav')}
    data = {
        'language': 'English',
        'request_id': 'test-001'
    }

    # Make request
    response = requests.post(
        f"{base_url}/transcribe",
        files=files,
        data=data,
        timeout=30
    )

    # Check response status
    assert response.status_code == 200, f"Expected 200, got {response.status_code}"

    # Parse JSON
    result = response.json()

    # Validate structure
    assert "text" in result, "Missing 'text' field"
    assert "request_id" in result, "Missing 'request_id' field"

    # Validate types
    assert isinstance(result["text"], str), "Text must be string"
    assert result["request_id"] == "test-001", "Request ID mismatch"


def test_asr_with_language_context(base_url, test_audio_bytes):
    """Test ASR accepts language parameter"""

    files = {'file': ('test.wav', BytesIO(test_audio_bytes), 'audio/wav')}

    # Test with language
    data = {'language': 'Hindi'}
    response = requests.post(
        f"{base_url}/transcribe",
        files=files,
        data=data,
        timeout=30
    )

    assert response.status_code == 200
    result = response.json()
    assert "text" in result


def test_asr_output_for_pipeline(base_url, test_audio_bytes):
    """Test that ASR output is compatible with pipeline"""

    files = {'file': ('test.wav', BytesIO(test_audio_bytes), 'audio/wav')}
    data = {'language': 'English', 'request_id': 'test-pipeline'}

    response = requests.post(f"{base_url}/transcribe", files=files, data=data, timeout=30)

    assert response.status_code == 200
    result = response.json()

    # Pipeline expects this exact structure
    text = result["text"]

    # Pipeline uses transcribed text
    assert text is not None
    assert isinstance(text, str)

    # Pipeline adds this to segment
    segment = {
        "transcript": text,
        "speaker": "SPEAKER_00",
        "start": 0.0,
        "end": 1.0
    }

    # This should not raise any errors
    assert segment["transcript"] == text
