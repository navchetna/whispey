FROM python:3.10-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && \
    apt-get install -y git && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# Copy requirements
COPY requirements.txt .

# Install typing-extensions first to avoid conflicts
RUN pip install --no-cache-dir --upgrade pip typing-extensions

# Install torch (CPU version)
RUN pip install --no-cache-dir \
    torch==2.8.0 \
    --index-url https://download.pytorch.org/whl/cpu

# Install numpy
RUN pip install --no-cache-dir "numpy<2.0.0"

# Install remaining dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY logging_utils.py .
COPY engine.py .
COPY languages.py .
COPY server.py .

EXPOSE 8003

CMD ["python3", "server.py"]
