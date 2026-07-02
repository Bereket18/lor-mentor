FROM python:3.12-slim

# Chromium + driver are required by the BOA extractor (Selenium WebDriver).
# The other banks only need HTTP + PDF parsing, but bundling Chrome keeps the
# service able to handle every supported bank from one image.
RUN apt-get update && apt-get install -y --no-install-recommends \
        chromium \
        chromium-driver \
        fonts-liberation \
    && rm -rf /var/lib/apt/lists/*

ENV CHROME_BIN=/usr/bin/chromium \
    CHROMEDRIVER_PATH=/usr/bin/chromedriver \
    PYTHONUNBUFFERED=1

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 8000

# One worker: the extractors are I/O-bound and Chrome is heavy. Scale with
# replicas, not threads, if you need more throughput.
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
