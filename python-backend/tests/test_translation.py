"""
Test Translation Service

Validates output format matches pipeline requirements
"""
import pytest
import requests


def test_translation_output_format(base_url):
    """Test that translation returns correct format"""

    # Prepare request
    payload = {
        "text": "Hello, how are you?",
        "src_lang": "English",
        "tgt_lang": "Hindi",
        "request_id": "test-001"
    }

    # Make request
    response = requests.post(
        f"{base_url}/translate",
        json=payload,
        timeout=30
    )

    # Check response status
    assert response.status_code == 200, f"Expected 200, got {response.status_code}"

    # Parse JSON
    result = response.json()

    # Validate structure
    assert "translated_text" in result, "Missing 'translated_text' field"
    assert "request_id" in result, "Missing 'request_id' field"

    # Validate types
    assert isinstance(result["translated_text"], str), "Translated text must be string"
    assert result["request_id"] == "test-001", "Request ID mismatch"


def test_translation_empty_text(base_url):
    """Test translation with empty text"""

    payload = {
        "text": "",
        "src_lang": "English",
        "tgt_lang": "Hindi"
    }

    response = requests.post(
        f"{base_url}/translate",
        json=payload,
        timeout=30
    )

    # Should return successfully with empty translation
    assert response.status_code == 200
    result = response.json()
    assert result["translated_text"] == ""


def test_translation_language_pairs(base_url):
    """Test different language pairs"""

    test_cases = [
        ("English", "Hindi"),
        ("Hindi", "English"),
        ("Spanish", "English"),
    ]

    for src_lang, tgt_lang in test_cases:
        payload = {
            "text": "Test text",
            "src_lang": src_lang,
            "tgt_lang": tgt_lang
        }

        response = requests.post(
            f"{base_url}/translate",
            json=payload,
            timeout=30
        )

        assert response.status_code == 200, f"Failed for {src_lang} → {tgt_lang}"
        result = response.json()
        assert "translated_text" in result


def test_translation_output_for_pipeline(base_url):
    """Test that translation output is compatible with pipeline"""

    payload = {
        "text": "This is a test",
        "src_lang": "English",
        "tgt_lang": "Hindi",
        "request_id": "test-pipeline"
    }

    response = requests.post(f"{base_url}/translate", json=payload, timeout=30)

    assert response.status_code == 200
    result = response.json()

    # Pipeline expects this exact structure
    translated_text = result["translated_text"]

    # Pipeline uses translated text
    assert translated_text is not None
    assert isinstance(translated_text, str)

    # Pipeline adds this to final segment
    segment = {
        "content": "This is a test",
        "translated_text": translated_text,
        "role": "user",
        "start_time": 0.0,
        "end_time": 1.0,
        "duration": 1.0
    }

    # This should not raise any errors
    assert segment["translated_text"] == translated_text
