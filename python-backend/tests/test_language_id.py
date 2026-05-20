"""
Test Language Identification Service

Validates output format matches pipeline requirements
"""
import pytest
import requests
from io import BytesIO


def test_language_id_output_format(base_url, test_audio_bytes):
    """Test that language ID returns correct format"""

    # Prepare request
    files = {'file': ('test.wav', BytesIO(test_audio_bytes), 'audio/wav')}
    data = {'request_id': 'test-001'}

    # Make request
    response = requests.post(
        f"{base_url}/identify",
        files=files,
        data=data,
        timeout=30
    )

    # Check response status
    assert response.status_code == 200, f"Expected 200, got {response.status_code}"

    # Parse JSON
    result = response.json()

    # Validate structure
    assert "language_code" in result, "Missing 'language_code' field"
    assert "language_name" in result, "Missing 'language_name' field"
    assert "confidence" in result, "Missing 'confidence' field"
    assert "request_id" in result, "Missing 'request_id' field"

    # Validate types
    assert isinstance(result["language_code"], str), "Language code must be string"
    assert isinstance(result["language_name"], str), "Language name must be string"
    assert isinstance(result["confidence"], (int, float)), "Confidence must be numeric"
    assert result["request_id"] == "test-001", "Request ID mismatch"

    # Validate values
    assert 0.0 <= result["confidence"] <= 1.0, "Confidence must be between 0 and 1"
    assert len(result["language_code"]) >= 2, "Language code should be at least 2 chars"
    assert len(result["language_name"]) > 0, "Language name should not be empty"


def test_language_id_empty_file(base_url):
    """Test language ID with empty file returns error"""

    files = {'file': ('empty.wav', BytesIO(b''), 'audio/wav')}

    response = requests.post(
        f"{base_url}/identify",
        files=files,
        timeout=30
    )

    # Should return 400 for empty file
    assert response.status_code in [400, 500], "Expected error status for empty file"


def test_language_id_output_for_pipeline(base_url, test_audio_bytes):
    """Test that language ID output is compatible with pipeline"""

    files = {'file': ('test.wav', BytesIO(test_audio_bytes), 'audio/wav')}
    response = requests.post(f"{base_url}/identify", files=files, timeout=30)

    assert response.status_code == 200
    result = response.json()

    # Pipeline expects these exact keys
    language_code = result["language_code"]
    language_name = result["language_name"]
    confidence = result["confidence"]

    # Pipeline uses these values
    assert language_code is not None
    assert language_name is not None
    assert confidence is not None

    # Pipeline passes language_name to ASR
    assert isinstance(language_name, str)
    assert len(language_name) > 0

    # Pipeline uses confidence in metadata
    assert isinstance(confidence, (int, float))
