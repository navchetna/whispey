"""
Pytest configuration and fixtures
"""
import os
import pytest
import tempfile
import numpy as np
import soundfile as sf

# Import test configuration
from .config import config as test_config


def pytest_configure(config):
    """Print test configuration on startup"""
    if test_config.VERBOSE_LOGGING:
        test_config.print_config()


@pytest.fixture
def test_audio_file():
    """Generate a test WAV audio file"""
    # Create a simple sine wave audio
    sample_rate = test_config.TEST_AUDIO_SAMPLE_RATE
    duration = test_config.TEST_AUDIO_DURATION
    frequency = test_config.TEST_AUDIO_FREQUENCY

    t = np.linspace(0, duration, int(sample_rate * duration))
    audio = np.sin(2 * np.pi * frequency * t).astype(np.float32)

    # Save to temporary file
    with tempfile.NamedTemporaryFile(delete=False, suffix='.wav') as f:
        sf.write(f.name, audio, sample_rate)
        yield f.name

    # Cleanup
    if os.path.exists(f.name):
        os.unlink(f.name)


@pytest.fixture
def test_audio_bytes():
    """Generate test audio as bytes"""
    sample_rate = test_config.TEST_AUDIO_SAMPLE_RATE
    duration = test_config.TEST_AUDIO_DURATION
    frequency = test_config.TEST_AUDIO_FREQUENCY

    t = np.linspace(0, duration, int(sample_rate * duration))
    audio = np.sin(2 * np.pi * frequency * t).astype(np.float32)

    # Convert to bytes
    import io
    buffer = io.BytesIO()
    sf.write(buffer, audio, sample_rate, format='WAV')
    buffer.seek(0)
    return buffer.read()


@pytest.fixture
def mock_segments():
    """Mock diarization segments"""
    return [
        {"speaker": "SPEAKER_00", "start": 0.0, "end": 2.5},
        {"speaker": "SPEAKER_01", "start": 2.5, "end": 5.0},
        {"speaker": "SPEAKER_00", "start": 5.0, "end": 7.5}
    ]


@pytest.fixture
def mock_language_result():
    """Mock language identification result"""
    return {
        "language_code": "en",
        "language_name": "English",
        "confidence": 0.95
    }


@pytest.fixture
def base_url():
    """Base URL for API tests"""
    return test_config.BASE_URL


@pytest.fixture
def request_timeout():
    """Request timeout for API calls"""
    return test_config.REQUEST_TIMEOUT


@pytest.fixture
def pipeline_timeout():
    """Timeout for pipeline tests"""
    return test_config.PIPELINE_TIMEOUT
