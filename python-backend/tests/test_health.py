"""
Test Health Endpoints

Validates health check responses
"""
import pytest
import requests


def test_gateway_health(base_url):
    """Test gateway health endpoint"""

    response = requests.get(f"{base_url}/health", timeout=10)

    assert response.status_code == 200, "Health check should return 200"

    result = response.json()

    # Validate structure
    assert "status" in result, "Missing 'status' field"
    assert "service" in result, "Missing 'service' field"
    assert "models" in result, "Missing 'models' field"

    # Validate values
    assert result["status"] == "healthy", "Status should be 'healthy'"
    assert result["service"] == "gateway", "Service should be 'gateway'"

    # Validate models status
    models = result["models"]
    assert isinstance(models, dict), "Models must be a dict"

    assert "diarization" in models, "Missing diarization model status"
    assert "language_id" in models, "Missing language_id model status"

    # Models should be ready or loading
    for model_name, status in models.items():
        assert status in ["ready", "loading", "error"] or status.startswith("error:"), \
            f"Invalid model status: {status}"


def test_root_endpoint(base_url):
    """Test root endpoint"""

    response = requests.get(f"{base_url}/", timeout=10)

    assert response.status_code == 200, "Root endpoint should return 200"

    result = response.json()

    # Validate structure
    assert "service" in result, "Missing 'service' field"
    assert "version" in result, "Missing 'version' field"
    assert "status" in result, "Missing 'status' field"

    # Validate values
    assert result["service"] == "Whispey Gateway"
    assert result["status"] == "running"
