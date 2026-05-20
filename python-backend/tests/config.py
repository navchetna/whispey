"""
Test Configuration

Centralized configuration for all tests.
Override via environment variables or modify defaults here.
"""
import os


class TestConfig:
    """Test configuration with environment variable overrides"""

    # Service URLs
    BASE_URL = os.getenv("TEST_BASE_URL", "http://localhost:8010")
    GATEWAY_URL = os.getenv("TEST_GATEWAY_URL", "http://localhost:8000")
    ASR_VLLM_URL = os.getenv("TEST_ASR_VLLM_URL", "http://localhost:8002")
    TRANSLATE_VLLM_URL = os.getenv("TEST_TRANSLATE_VLLM_URL", "http://localhost:8005")

    # Service Ports
    GATEWAY_PORT = int(os.getenv("TEST_GATEWAY_PORT", "8000"))
    ASR_VLLM_PORT = int(os.getenv("TEST_ASR_VLLM_PORT", "8002"))
    TRANSLATE_VLLM_PORT = int(os.getenv("TEST_TRANSLATE_VLLM_PORT", "8005"))

    # Timeouts (in seconds)
    REQUEST_TIMEOUT = int(os.getenv("TEST_REQUEST_TIMEOUT", "30"))
    PIPELINE_TIMEOUT = int(os.getenv("TEST_PIPELINE_TIMEOUT", "120"))
    MODEL_LOAD_TIMEOUT = int(os.getenv("TEST_MODEL_LOAD_TIMEOUT", "180"))

    # Test Data
    TEST_AUDIO_DURATION = float(os.getenv("TEST_AUDIO_DURATION", "1.0"))  # seconds
    TEST_AUDIO_SAMPLE_RATE = int(os.getenv("TEST_AUDIO_SAMPLE_RATE", "16000"))
    TEST_AUDIO_FREQUENCY = int(os.getenv("TEST_AUDIO_FREQUENCY", "440"))  # Hz

    # Test Behavior
    SKIP_SLOW_TESTS = os.getenv("SKIP_SLOW_TESTS", "false").lower() == "true"
    VERBOSE_LOGGING = os.getenv("TEST_VERBOSE", "false").lower() == "true"

    # Retry Configuration
    MAX_RETRIES = int(os.getenv("TEST_MAX_RETRIES", "3"))
    RETRY_DELAY = float(os.getenv("TEST_RETRY_DELAY", "1.0"))  # seconds

    # Expected Values
    EXPECTED_LANGUAGES = ["English", "Hindi", "Spanish", "French"]
    EXPECTED_ROLES = ["agent", "user"]

    @classmethod
    def get_endpoint_url(cls, endpoint: str) -> str:
        """Get full URL for an endpoint"""
        return f"{cls.BASE_URL}{endpoint}"

    @classmethod
    def print_config(cls):
        """Print current configuration"""
        print("\n=== Test Configuration ===")
        print(f"Base URL: {cls.BASE_URL}")
        print(f"Gateway Port: {cls.GATEWAY_PORT}")
        print(f"ASR vLLM Port: {cls.ASR_VLLM_PORT}")
        print(f"Translate vLLM Port: {cls.TRANSLATE_VLLM_PORT}")
        print(f"Request Timeout: {cls.REQUEST_TIMEOUT}s")
        print(f"Pipeline Timeout: {cls.PIPELINE_TIMEOUT}s")
        print(f"Skip Slow Tests: {cls.SKIP_SLOW_TESTS}")
        print("==========================\n")


# Create config instance for easy import
config = TestConfig()
