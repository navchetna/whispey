"""
Centralized Logging Utility

Provides request ID tracking across all components
"""
import logging
import sys
from contextvars import ContextVar
from typing import Optional

# Context variable for request ID (thread-safe)
request_id_context: ContextVar[Optional[str]] = ContextVar('request_id', default=None)


class RequestIdFilter(logging.Filter):
    """Add request ID to log records"""

    def filter(self, record):
        record.request_id = request_id_context.get() or "NO-ID"
        return True


def setup_logging(level: str = "INFO") -> None:
    """
    Setup centralized logging with request ID tracking

    Args:
        level: Logging level (DEBUG, INFO, WARNING, ERROR)
    """
    # Create formatter with request ID
    formatter = logging.Formatter(
        '%(asctime)s - [%(request_id)s] - %(name)s - %(levelname)s - %(message)s',
        datefmt='%Y-%m-%d %H:%M:%S'
    )

    # Setup handler
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(formatter)
    handler.addFilter(RequestIdFilter())

    # Configure root logger
    root_logger = logging.getLogger()
    root_logger.setLevel(getattr(logging, level.upper()))
    root_logger.handlers = []  # Clear existing handlers
    root_logger.addHandler(handler)


def get_logger(name: str) -> logging.Logger:
    """
    Get a logger with request ID tracking

    Args:
        name: Logger name (usually __name__)

    Returns:
        Logger instance
    """
    return logging.getLogger(name)


def log_request(request_id: str, component: str, action: str, **kwargs) -> None:
    """
    Log a request action with structured data

    Args:
        request_id: Request ID for tracing
        component: Component name (e.g., "diarization", "asr")
        action: Action being performed (e.g., "start", "complete", "error")
        **kwargs: Additional context data
    """
    logger = get_logger(f"whispey.{component}")

    # Set request ID in context
    request_id_context.set(request_id)

    # Build message
    parts = [f"{action}"]
    for key, value in kwargs.items():
        parts.append(f"{key}={value}")
    message = " | ".join(parts)

    # Log based on action type
    if action.startswith("error"):
        logger.error(message)
    elif action.startswith("warning"):
        logger.warning(message)
    elif action == "start":
        logger.info(message)
    elif action == "complete":
        logger.info(message)
    else:
        logger.debug(message)


def set_request_id(request_id: str) -> None:
    """Set the current request ID in context"""
    request_id_context.set(request_id)


def get_request_id() -> Optional[str]:
    """Get the current request ID from context"""
    return request_id_context.get()
