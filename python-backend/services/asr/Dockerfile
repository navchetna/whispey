FROM python:3.10-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && \
    apt-get install -y \
    build-essential \
    g++ \
    gcc \
    git \
    wget \
    sox \
    libsox-fmt-all \
    libsox-dev \
    libsndfile1 \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Set library path for sox
ENV LD_LIBRARY_PATH=/usr/lib/x86_64-linux-gnu:$LD_LIBRARY_PATH

# Copy requirements and install Python dependencies
COPY requirements.txt .

# Upgrade pip but not to latest (older versions accept fairseq's PyYAML >=5.1.* syntax)
RUN pip install --no-cache-dir pip==23.0.1 typing-extensions

# Install torch (CPU version)
RUN pip install --no-cache-dir \
    torch==2.8.0 \
    torchaudio==2.8.0 \
    --index-url https://download.pytorch.org/whl/cpu

# Install numpy before fairseq
RUN pip install --no-cache-dir "numpy<2.0.0"

# Install fairseq before other packages to avoid conflicts
RUN pip install --no-cache-dir \
    git+https://github.com/facebookresearch/fairseq.git@v0.12.1

# Install remaining dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY logging_utils.py .
COPY engine.py .
COPY utilities.py .
COPY server.py .

EXPOSE 8001

CMD ["python3", "server.py"]
