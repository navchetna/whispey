"""
Test Diarization Service

Validates output format matches pipeline requirements
"""
import pytest
import requests
from io import BytesIO
from .config import config


def test_diarization_output_format(base_url, test_audio_bytes, request_timeout):
    """Test that diarization returns correct format"""

    # Prepare request
    files = {'file': ('test.wav', BytesIO(test_audio_bytes), 'audio/wav')}
    data = {'request_id': 'test-001'}

    # Make request
    response = requests.post(
        f"{base_url}/diarize",
        files=files,
        data=data,
        timeout=request_timeout
    )

    # Check response status
    assert response.status_code == 200, f"Expected 200, got {response.status_code}"

    # Parse JSON
    result = response.json()

    # Validate structure
    assert "segments" in result, "Missing 'segments' field"
    assert "request_id" in result, "Missing 'request_id' field"
    assert result["request_id"] == "test-001", "Request ID mismatch"

    # Validate segments format
    segments = result["segments"]
    assert isinstance(segments, list), "Segments must be a list"

    if len(segments) > 0:
        # Validate segment structure
        for segment in segments:
            assert "speaker" in segment, "Missing 'speaker' field in segment"
            assert "start" in segment, "Missing 'start' field in segment"
            assert "end" in segment, "Missing 'end' field in segment"

            # Validate types
            assert isinstance(segment["speaker"], str), "Speaker must be string"
            assert isinstance(segment["start"], (int, float)), "Start must be numeric"
            assert isinstance(segment["end"], (int, float)), "End must be numeric"

            # Validate values
            assert segment["end"] >= segment["start"], "End time must be >= start time"
            assert segment["start"] >= 0, "Start time must be non-negative"


def test_diarization_empty_file(base_url):
    """Test diarization with empty file returns error"""

    files = {'file': ('empty.wav', BytesIO(b''), 'audio/wav')}

    response = requests.post(
        f"{base_url}/diarize",
        files=files,
        timeout=30
    )

    # Should return 400 for empty file
    assert response.status_code in [400, 500], "Expected error status for empty file"


def test_diarization_output_for_pipeline(base_url, test_audio_bytes):
    """Test that diarization output is compatible with pipeline"""

    files = {'file': ('test.wav', BytesIO(test_audio_bytes), 'audio/wav')}
    response = requests.post(f"{base_url}/diarize", files=files, timeout=30)

    assert response.status_code == 200
    result = response.json()

    # Pipeline expects this exact structure
    segments = result["segments"]

    # Simulate pipeline processing
    for segment in segments:
        # Pipeline needs these exact keys
        speaker = segment["speaker"]
        start = segment["start"]
        end = segment["end"]

        # These should not raise KeyError
        assert speaker is not None
        assert start is not None
        assert end is not None

        # Pipeline calculates duration
        duration = end - start
        assert duration > 0, "Segment duration must be positive"
