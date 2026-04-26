#!/usr/bin/env python3
"""
Test script for Whispey Python Backend Services
Tests the main API service and optionally the local inference server
"""

import os
import sys
import time
import json
import argparse
import requests
from pathlib import Path
from typing import Optional

# ANSI color codes for output
class Colors:
    GREEN = '\033[92m'
    RED = '\033[91m'
    YELLOW = '\033[93m'
    BLUE = '\033[94m'
    RESET = '\033[0m'

def print_success(msg: str):
    print(f"{Colors.GREEN}✓ {msg}{Colors.RESET}")

def print_error(msg: str):
    print(f"{Colors.RED}✗ {msg}{Colors.RESET}")

def print_info(msg: str):
    print(f"{Colors.BLUE}ℹ {msg}{Colors.RESET}")

def print_warning(msg: str):
    print(f"{Colors.YELLOW}⚠ {msg}{Colors.RESET}")


class ServiceTester:
    def __init__(self, api_url: str = "http://localhost:8000", inference_url: Optional[str] = None):
        self.api_url = api_url.rstrip('/')
        self.inference_url = inference_url.rstrip('/') if inference_url else None
        self.results = {
            'main_api': {'passed': 0, 'failed': 0},
            'inference': {'passed': 0, 'failed': 0}
        }

    def test_health_endpoint(self, url: str, service_name: str) -> bool:
        """Test the /health endpoint"""
        print_info(f"Testing {service_name} health endpoint...")
        try:
            response = requests.get(f"{url}/health", timeout=5)
            if response.status_code == 200:
                data = response.json()
                if data.get('status') == 'healthy':
                    print_success(f"{service_name} is healthy")
                    return True
                else:
                    print_error(f"{service_name} returned unexpected health status: {data}")
                    return False
            else:
                print_error(f"{service_name} health check failed: HTTP {response.status_code}")
                return False
        except requests.exceptions.ConnectionError:
            print_error(f"Cannot connect to {service_name} at {url}")
            return False
        except Exception as e:
            print_error(f"{service_name} health check error: {str(e)}")
            return False

    def create_test_audio(self) -> bytes:
        """Create a simple test WAV file (1 second of silence at 16kHz)"""
        import wave
        import struct

        sample_rate = 16000
        duration = 1  # seconds
        num_samples = sample_rate * duration

        # Create in-memory WAV file
        import io
        wav_buffer = io.BytesIO()

        with wave.open(wav_buffer, 'wb') as wav_file:
            wav_file.setnchannels(1)  # Mono
            wav_file.setsampwidth(2)  # 16-bit
            wav_file.setframerate(sample_rate)

            # Write silent audio
            for _ in range(num_samples):
                wav_file.writeframes(struct.pack('h', 0))

        wav_buffer.seek(0)
        return wav_buffer.read()

    def test_transcribe_endpoint(self) -> bool:
        """Test the /transcribe endpoint with a test audio file"""
        print_info("Testing transcribe endpoint...")

        try:
            # Create test audio
            audio_data = self.create_test_audio()

            # Prepare the file upload
            files = {'file': ('test_audio.wav', audio_data, 'audio/wav')}

            print_info(f"Uploading test audio to {self.api_url}/transcribe...")
            response = requests.post(
                f"{self.api_url}/transcribe",
                files=files,
                timeout=120  # Transcription can take a while
            )

            if response.status_code == 200:
                data = response.json()
                if data.get('success'):
                    print_success("Transcription endpoint working correctly")
                    print_info(f"Response structure: {json.dumps(data, indent=2)[:200]}...")
                    return True
                else:
                    print_error(f"Transcription failed: {data.get('error')}")
                    return False
            elif response.status_code == 429:
                print_warning("Rate limited - this is expected behavior")
                return True
            else:
                print_error(f"Transcription failed: HTTP {response.status_code}")
                print_error(f"Response: {response.text[:200]}")
                return False

        except Exception as e:
            print_error(f"Transcription test error: {str(e)}")
            return False

    def test_inference_preprocessing(self) -> bool:
        """Test the local inference preprocessing endpoint"""
        if not self.inference_url:
            print_warning("Skipping inference tests (not configured)")
            return True

        print_info("Testing inference preprocessing endpoint...")

        try:
            audio_data = self.create_test_audio()
            files = {'file': ('test_audio.wav', audio_data, 'audio/wav')}

            response = requests.post(
                f"{self.inference_url}/v1/preprocess/",
                files=files,
                timeout=60
            )

            if response.status_code == 200:
                data = response.json()
                if 'diarization' in data and 'language' in data:
                    print_success("Preprocessing endpoint working correctly")
                    print_info(f"Detected language: {data.get('language')}")
                    return True
                else:
                    print_error(f"Unexpected preprocessing response: {data}")
                    return False
            else:
                print_error(f"Preprocessing failed: HTTP {response.status_code}")
                return False

        except requests.exceptions.ConnectionError:
            print_error(f"Cannot connect to inference server at {self.inference_url}")
            return False
        except Exception as e:
            print_error(f"Preprocessing test error: {str(e)}")
            return False

    def test_inference_transcription(self) -> bool:
        """Test the local inference transcription endpoint"""
        if not self.inference_url:
            return True

        print_info("Testing inference transcription endpoint...")

        try:
            audio_data = self.create_test_audio()
            files = {'file': ('test_audio.wav', audio_data, 'audio/wav')}

            # Also need diarized_input
            data = {
                'diarized_input': json.dumps([])
            }

            response = requests.post(
                f"{self.inference_url}/v1/audio/",
                files=files,
                data=data,
                timeout=60
            )

            if response.status_code == 200:
                result = response.json()
                if 'transcriptions' in result:
                    print_success("Transcription endpoint working correctly")
                    return True
                else:
                    print_error(f"Unexpected transcription response: {result}")
                    return False
            else:
                print_error(f"Transcription failed: HTTP {response.status_code}")
                return False

        except Exception as e:
            print_error(f"Transcription test error: {str(e)}")
            return False

    def test_inference_translation(self) -> bool:
        """Test the local inference translation endpoint"""
        if not self.inference_url:
            return True

        print_info("Testing inference translation endpoint...")

        try:
            payload = {
                "sentences": ["नमस्ते"],
                "source_language": "hi-IN",
                "target_language": "en-IN"
            }

            response = requests.post(
                f"{self.inference_url}/v1/translate/",
                json=payload,
                timeout=30
            )

            if response.status_code == 200:
                result = response.json()
                if 'translations' in result:
                    print_success("Translation endpoint working correctly")
                    print_info(f"Translation: {result.get('translations')}")
                    return True
                else:
                    print_error(f"Unexpected translation response: {result}")
                    return False
            else:
                print_error(f"Translation failed: HTTP {response.status_code}")
                return False

        except Exception as e:
            print_error(f"Translation test error: {str(e)}")
            return False

    def run_all_tests(self):
        """Run all tests and print summary"""
        print("\n" + "="*60)
        print("WHISPEY BACKEND SERVICE TESTS")
        print("="*60 + "\n")

        # Test Main API
        print(f"\n{Colors.BLUE}=== MAIN API SERVICE ==={Colors.RESET}\n")

        tests = [
            ("Health Check", lambda: self.test_health_endpoint(self.api_url, "Main API")),
            ("Transcribe Endpoint", self.test_transcribe_endpoint)
        ]

        for test_name, test_func in tests:
            try:
                if test_func():
                    self.results['main_api']['passed'] += 1
                else:
                    self.results['main_api']['failed'] += 1
            except Exception as e:
                print_error(f"{test_name} crashed: {str(e)}")
                self.results['main_api']['failed'] += 1
            print()  # Blank line between tests

        # Test Local Inference (if configured)
        if self.inference_url:
            print(f"\n{Colors.BLUE}=== LOCAL INFERENCE SERVICE ==={Colors.RESET}\n")

            inference_tests = [
                ("Health Check", lambda: self.test_health_endpoint(self.inference_url, "Inference Server")),
                ("Preprocessing", self.test_inference_preprocessing),
                ("Transcription", self.test_inference_transcription),
                ("Translation", self.test_inference_translation)
            ]

            for test_name, test_func in inference_tests:
                try:
                    if test_func():
                        self.results['inference']['passed'] += 1
                    else:
                        self.results['inference']['failed'] += 1
                except Exception as e:
                    print_error(f"{test_name} crashed: {str(e)}")
                    self.results['inference']['failed'] += 1
                print()

        # Print summary
        self.print_summary()

    def print_summary(self):
        """Print test results summary"""
        print("\n" + "="*60)
        print("TEST SUMMARY")
        print("="*60 + "\n")

        total_passed = self.results['main_api']['passed'] + self.results['inference']['passed']
        total_failed = self.results['main_api']['failed'] + self.results['inference']['failed']

        print(f"Main API Service:")
        print(f"  Passed: {self.results['main_api']['passed']}")
        print(f"  Failed: {self.results['main_api']['failed']}")

        if self.inference_url:
            print(f"\nLocal Inference Service:")
            print(f"  Passed: {self.results['inference']['passed']}")
            print(f"  Failed: {self.results['inference']['failed']}")

        print(f"\nTotal: {total_passed} passed, {total_failed} failed")

        if total_failed == 0:
            print_success("\n✓ All tests passed!")
            return 0
        else:
            print_error(f"\n✗ {total_failed} test(s) failed")
            return 1


def main():
    parser = argparse.ArgumentParser(description="Test Whispey backend services")
    parser.add_argument(
        '--api-url',
        default=os.getenv('PYTHON_BACKEND_URL', 'http://localhost:8000'),
        help='Main API URL (default: http://localhost:8000)'
    )
    parser.add_argument(
        '--inference-url',
        default=os.getenv('LOCAL_INFERENCE_URL'),
        help='Local inference server URL (optional, e.g., http://localhost:8005)'
    )
    parser.add_argument(
        '--wait',
        type=int,
        default=0,
        help='Wait N seconds before starting tests (useful for Docker startup)'
    )

    args = parser.parse_args()

    if args.wait > 0:
        print_info(f"Waiting {args.wait} seconds for services to start...")
        time.sleep(args.wait)

    tester = ServiceTester(api_url=args.api_url, inference_url=args.inference_url)
    exit_code = tester.run_all_tests()
    sys.exit(exit_code)


if __name__ == '__main__':
    main()
