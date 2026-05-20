"""
Test Complete Pipeline

Validates full transcription pipeline output format
"""
import pytest
import requests
from io import BytesIO


def test_pipeline_output_format(base_url, test_audio_bytes):
    """Test that full pipeline returns correct format"""

    # Prepare request
    files = {'file': ('test.wav', BytesIO(test_audio_bytes), 'audio/wav')}

    # Make request
    response = requests.post(
        f"{base_url}/transcribe",
        files=files,
        timeout=120  # Pipeline takes longer
    )

    # Check response status
    assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"

    # Parse JSON
    result = response.json()

    # Validate top-level structure
    assert "success" in result, "Missing 'success' field"
    assert result["success"] is True, "Pipeline should succeed"

    assert "transcript" in result, "Missing 'transcript' field"
    assert "error" not in result or result["error"] is None, "Should not have error on success"

    # Validate transcript structure
    transcript = result["transcript"]
    assert isinstance(transcript, dict), "Transcript must be a dict"

    assert "turns" in transcript, "Missing 'turns' field in transcript"
    assert "metadata" in transcript, "Missing 'metadata' field in transcript"


def test_pipeline_turns_format(base_url, test_audio_bytes):
    """Test that turns have correct format"""

    files = {'file': ('test.wav', BytesIO(test_audio_bytes), 'audio/wav')}
    response = requests.post(f"{base_url}/transcribe", files=files, timeout=120)

    assert response.status_code == 200
    result = response.json()

    turns = result["transcript"]["turns"]
    assert isinstance(turns, list), "Turns must be a list"

    # If there are turns, validate their structure
    if len(turns) > 0:
        for turn in turns:
            # Required fields for frontend
            assert "role" in turn, "Missing 'role' field"
            assert "start_time" in turn, "Missing 'start_time' field"
            assert "end_time" in turn, "Missing 'end_time' field"
            assert "duration" in turn, "Missing 'duration' field"
            assert "content" in turn, "Missing 'content' field"
            assert "translated_text" in turn, "Missing 'translated_text' field"
            assert "latency" in turn, "Missing 'latency' field"
            assert "cost" in turn, "Missing 'cost' field"

            # Validate types
            assert isinstance(turn["role"], str), "Role must be string"
            assert turn["role"] in ["agent", "user"], "Role must be 'agent' or 'user'"

            assert isinstance(turn["start_time"], (int, float)), "Start time must be numeric"
            assert isinstance(turn["end_time"], (int, float)), "End time must be numeric"
            assert isinstance(turn["duration"], (int, float)), "Duration must be numeric"

            assert isinstance(turn["content"], str), "Content must be string"
            assert isinstance(turn["translated_text"], str), "Translated text must be string"

            assert turn["latency"] is None or isinstance(turn["latency"], (int, float)), \
                "Latency must be None or numeric"

            # Validate values
            assert turn["end_time"] >= turn["start_time"], "End time must be >= start time"
            assert turn["start_time"] >= 0, "Start time must be non-negative"
            assert turn["duration"] > 0, "Duration must be positive"


def test_pipeline_metadata_format(base_url, test_audio_bytes):
    """Test that metadata has correct format"""

    files = {'file': ('test.wav', BytesIO(test_audio_bytes), 'audio/wav')}
    response = requests.post(f"{base_url}/transcribe", files=files, timeout=120)

    assert response.status_code == 200
    result = response.json()

    metadata = result["transcript"]["metadata"]
    assert isinstance(metadata, dict), "Metadata must be a dict"

    # Required metadata fields
    assert "total_turns" in metadata, "Missing 'total_turns' field"
    assert "total_duration" in metadata, "Missing 'total_duration' field"
    assert "speakers" in metadata, "Missing 'speakers' field"
    assert "source_language" in metadata, "Missing 'source_language' field"
    assert "source_language_code" in metadata, "Missing 'source_language_code' field"
    assert "language_confidence" in metadata, "Missing 'language_confidence' field"
    assert "target_language" in metadata, "Missing 'target_language' field"
    assert "model" in metadata, "Missing 'model' field"

    # Validate types
    assert isinstance(metadata["total_turns"], int), "Total turns must be int"
    assert isinstance(metadata["total_duration"], (int, float)), "Total duration must be numeric"
    assert isinstance(metadata["speakers"], list), "Speakers must be list"
    assert isinstance(metadata["source_language"], str), "Source language must be string"
    assert isinstance(metadata["source_language_code"], str), "Source language code must be string"
    assert isinstance(metadata["language_confidence"], (int, float)), "Language confidence must be numeric"
    assert isinstance(metadata["target_language"], str), "Target language must be string"
    assert isinstance(metadata["model"], str), "Model must be string"

    # Validate values
    assert metadata["total_turns"] >= 0, "Total turns must be non-negative"
    assert metadata["total_duration"] >= 0, "Total duration must be non-negative"
    assert 0.0 <= metadata["language_confidence"] <= 1.0, "Confidence must be between 0 and 1"


def test_pipeline_frontend_compatibility(base_url, test_audio_bytes):
    """Test that pipeline output is fully compatible with frontend expectations"""

    files = {'file': ('test.wav', BytesIO(test_audio_bytes), 'audio/wav')}
    response = requests.post(f"{base_url}/transcribe", files=files, timeout=120)

    assert response.status_code == 200
    result = response.json()

    # Frontend expects this exact structure
    assert result["success"] is True

    transcript = result["transcript"]
    turns = transcript["turns"]
    metadata = transcript["metadata"]

    # Simulate frontend processing
    for turn in turns:
        # Frontend displays these fields
        role = turn["role"]
        content = turn["content"]
        translated_text = turn["translated_text"]
        start_time = turn["start_time"]
        end_time = turn["end_time"]
        duration = turn["duration"]
        latency = turn["latency"]

        # These should not raise KeyError
        assert role in ["agent", "user"]
        assert isinstance(content, str)
        assert isinstance(translated_text, str)
        assert start_time >= 0
        assert end_time >= start_time
        assert duration > 0

    # Frontend displays metadata
    total_turns = metadata["total_turns"]
    total_duration = metadata["total_duration"]
    source_language = metadata["source_language"]
    target_language = metadata["target_language"]

    assert total_turns == len(turns)
    assert total_duration >= 0
    assert isinstance(source_language, str)
    assert isinstance(target_language, str)


def test_pipeline_error_handling(base_url):
    """Test pipeline error response format"""

    # Send invalid file
    files = {'file': ('empty.wav', BytesIO(b''), 'audio/wav')}
    response = requests.post(f"{base_url}/transcribe", files=files, timeout=120)

    # Should return error
    assert response.status_code in [400, 500]


def test_pipeline_consistency(base_url, test_audio_bytes):
    """Test that pipeline output is consistent across calls"""

    files1 = {'file': ('test.wav', BytesIO(test_audio_bytes), 'audio/wav')}
    files2 = {'file': ('test.wav', BytesIO(test_audio_bytes), 'audio/wav')}

    response1 = requests.post(f"{base_url}/transcribe", files=files1, timeout=120)
    response2 = requests.post(f"{base_url}/transcribe", files=files2, timeout=120)

    assert response1.status_code == 200
    assert response2.status_code == 200

    result1 = response1.json()
    result2 = response2.json()

    # Structure should be identical
    assert result1.keys() == result2.keys()
    assert result1["transcript"].keys() == result2["transcript"].keys()

    # Metadata structure should match
    metadata1 = result1["transcript"]["metadata"]
    metadata2 = result2["transcript"]["metadata"]
    assert metadata1.keys() == metadata2.keys()
