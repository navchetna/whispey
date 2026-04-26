FROM python:3.10-slim

WORKDIR /app

# Install system dependencies (ffmpeg for audio conversion)
RUN apt-get update && \
    apt-get install -y ffmpeg curl && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# Copy and install Python dependencies
COPY gateway-requirements.txt requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY app.py .
COPY registry.py .
COPY logging_utils.py .
COPY providers/ providers/

EXPOSE 8000

CMD ["python3", "app.py"]
