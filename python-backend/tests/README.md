# Whispey Backend Tests

Comprehensive test suite for validating output formats across all services and the complete pipeline.

## Test Coverage

### Individual Services
- **test_diarization.py**: Diarization service output format
- **test_language_id.py**: Language identification output format
- **test_asr.py**: ASR service output format
- **test_translation.py**: Translation service output format

### Pipeline
- **test_pipeline.py**: Complete transcription pipeline
- **test_health.py**: Health check endpoints

## What Tests Validate

Tests focus on **output format validation**, not accuracy:

1. **Correct JSON structure**: All required fields present
2. **Correct data types**: Strings, numbers, lists, dicts as expected
3. **Value constraints**: Times >= 0, confidence 0-1, etc.
4. **Frontend compatibility**: Output matches frontend expectations
5. **Pipeline compatibility**: Services produce format pipeline needs

## Running Tests

### Prerequisites

```bash
# Install test dependencies
pip install pytest requests

# Start services
docker compose up -d

# Wait for services to be ready
make health-check
```

### Run All Tests

```bash
# From python-backend directory
pytest tests/ -v

# With coverage
pytest tests/ -v --cov=. --cov-report=html

# Specific test file
pytest tests/test_pipeline.py -v

# Specific test
pytest tests/test_pipeline.py::test_pipeline_output_format -v
```

### Run via Makefile

```bash
# Run all tests
make test

# Run specific tests
make test-diarization
make test-language-id
make test-pipeline
```

## Test Structure

### Fixtures (conftest.py)

- `test_audio_file`: Temporary WAV file for testing
- `test_audio_bytes`: Audio as bytes for API calls
- `mock_segments`: Mock diarization segments
- `mock_language_result`: Mock language ID result
- `base_url`: Configurable API base URL

### Test Organization

Each test file contains:

1. **Format validation tests**: Check output structure
2. **Error handling tests**: Verify error responses
3. **Pipeline compatibility tests**: Ensure format works with pipeline
4. **Frontend compatibility tests**: Ensure format works with frontend

## Expected Output Formats

### Diarization Output

```json
{
  "segments": [
    {
      "speaker": "SPEAKER_00",
      "start": 0.0,
      "end": 2.5
    }
  ],
  "request_id": "test-001"
}
```

### Language ID Output

```json
{
  "language_code": "en",
  "language_name": "English",
  "confidence": 0.95,
  "request_id": "test-001"
}
```

### ASR Output

```json
{
  "text": "Transcribed text here",
  "request_id": "test-001"
}
```

### Translation Output

```json
{
  "translated_text": "Translated text here",
  "request_id": "test-001"
}
```

### Pipeline Output (Frontend Format)

```json
{
  "success": true,
  "transcript": {
    "turns": [
      {
        "role": "agent|user",
        "start_time": 0.0,
        "end_time": 2.5,
        "duration": 2.5,
        "content": "Original text",
        "translated_text": "Translated text",
        "latency": 0.5,
        "cost": null
      }
    ],
    "metadata": {
      "total_turns": 1,
      "total_duration": 2.5,
      "speakers": ["agent", "user"],
      "source_language": "English",
      "source_language_code": "en",
      "language_confidence": 0.95,
      "target_language": "Hindi",
      "model": "distributed"
    }
  },
  "error": null
}
```

## Configuration

### Environment Variables

```bash
# Set API base URL (default: http://localhost:8000)
export API_BASE_URL=http://localhost:8000

# Run tests
pytest tests/
```

## Continuous Integration

Add to CI pipeline:

```yaml
# .github/workflows/test.yml
- name: Run tests
  run: |
    docker compose up -d
    sleep 30  # Wait for models to load
    pytest tests/ -v
    docker compose down
```

## Troubleshooting

### Tests Failing

1. **Check services are running**:
   ```bash
   make health-check
   docker compose ps
   ```

2. **Check logs**:
   ```bash
   make logs-gateway
   ```

3. **Verify model loading**:
   ```bash
   curl http://localhost:8000/health
   ```

4. **Check timeouts**: Some tests may need longer timeouts if models are slow to load

### Model Loading Delays

If tests timeout:
- Increase timeout in test: `timeout=120` → `timeout=180`
- Wait for models to load: `sleep 30` before running tests
- Check model status: `curl http://localhost:8000/health`

## Adding New Tests

1. Create test file: `tests/test_feature.py`
2. Import fixtures from `conftest.py`
3. Write format validation tests
4. Write pipeline compatibility tests
5. Run: `pytest tests/test_feature.py -v`

## Configuration

Tests use a centralized configuration system in `config.py`.

### Default Configuration

- **Base URL**: `http://localhost:8000`
- **Gateway Port**: `8000`
- **ASR vLLM Port**: `8002`
- **Translation vLLM Port**: `8005`
- **Request Timeout**: `30s`
- **Pipeline Timeout**: `120s`

### Environment Variables

Override defaults using environment variables:

```bash
# Change base URL
export TEST_BASE_URL=http://gateway:8000

# Change timeouts
export TEST_REQUEST_TIMEOUT=60
export TEST_PIPELINE_TIMEOUT=180

# Skip slow tests
export SKIP_SLOW_TESTS=true

# Verbose logging
export TEST_VERBOSE=true
```

### Using .env File

Create `tests/.env` from the example:

```bash
cd tests
cp .env.example .env
# Edit .env with your values
```

### Configuration in Code

```python
from config import config

# Use in tests
response = requests.post(
    config.BASE_URL + "/transcribe",
    timeout=config.REQUEST_TIMEOUT
)
```

### Available Configuration

See `config.py` for all available settings:
- Service URLs and ports
- Timeouts
- Test audio parameters
- Retry configuration
- Expected values
