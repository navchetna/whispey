FROM python:3.10-slim

WORKDIR /app

# Install system dependencies including FFmpeg 6+ libraries
RUN apt-get update && \
    apt-get install -y \
    build-essential \
    g++ \
    gcc \
    git \
    sox \
    libsox-fmt-all \
    libsox-dev \
    ffmpeg \
    libavcodec61 \
    libavformat61 \
    libavutil59 \
    libavfilter10 \
    libavdevice61 \
    libswresample5 \
    libswscale8 \
    libavcodec-dev \
    libavformat-dev \
    libavutil-dev \
    libavfilter-dev \
    libavdevice-dev \
    libswresample-dev \
    libswscale-dev \
    libsndfile1 \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Set library path
ENV LD_LIBRARY_PATH=/usr/lib/x86_64-linux-gnu:$LD_LIBRARY_PATH

# Copy requirements
COPY requirements.txt .

# Install typing-extensions first to avoid conflicts
RUN pip install --no-cache-dir --upgrade pip typing-extensions

# Install torch (CPU version)
RUN pip install --no-cache-dir \
    torch==2.8.0 \
    torchaudio==2.8.0 torchcodec==0.7 \
    --index-url https://download.pytorch.org/whl/cpu

# Install numpy before other packages
RUN pip install --no-cache-dir "numpy<2.0.0"

# Install omegaconf
RUN pip install --no-cache-dir omegaconf==2.1.2

# Install remaining dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY logging_utils.py .
COPY core.py .
COPY server.py .

EXPOSE 8002

CMD ["python3", "server.py"]
