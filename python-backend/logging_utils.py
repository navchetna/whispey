"""
Simple distributed logging utility for tracking requests across services.
"""
import logging
import time
import uuid
from typing import Optional


def generate_request_id() -> str:
    """Generate a unique request ID."""
    return str(uuid.uuid4())[:8]


def log_request_step(
    logger: logging.Logger,
    request_id: str,
    step: str,
    details: Optional[str] = None,
    **kwargs
):
    """
    Log a step in the request processing pipeline.

    Args:
        logger: Logger instance
        request_id: Unique request identifier
        step: Description of the step (e.g., "PREPROCESS_START", "PREPROCESS_DONE")
        details: Optional additional details
        **kwargs: Additional key-value pairs to log
    """
    timestamp = time.time()
    log_parts = [
        f"[REQ_ID: {request_id}]",
        f"[STEP: {step}]",
        f"[TIME: {timestamp:.3f}]"
    ]

    if details:
        log_parts.append(f"[DETAILS: {details}]")

    for key, value in kwargs.items():
        log_parts.append(f"[{key.upper()}: {value}]")

    logger.info(" ".join(log_parts))


def extract_request_id(headers: dict) -> Optional[str]:
    """Extract request ID from headers."""
    return headers.get("x-request-id")
