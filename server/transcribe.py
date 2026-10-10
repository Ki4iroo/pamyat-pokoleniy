"""
Whisper transcription proxy — запускать рядом с ботом на VPS.

pip install fastapi uvicorn python-multipart openai
OPENAI_API_KEY=... TELEGRAM_BOT_TOKEN=... uvicorn transcribe:app --host 0.0.0.0 --port 8765

Переменные окружения:
  OPENAI_API_KEY      — ключ OpenAI
  TELEGRAM_BOT_TOKEN  — токен бота; им проверяется подпись initData, без него сервер не принимает запросы
  ALLOWED_ORIGINS     — через запятую, по умолчанию https://ki4iroo.github.io
"""
import logging
import os

from fastapi import FastAPI, File, Header, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from openai import OpenAI

from telegram_auth import validate_init_data

OPENAI_API_KEY = os.environ.get("OPENAI_API_KEY", "")
TELEGRAM_BOT_TOKEN = os.environ.get("TELEGRAM_BOT_TOKEN", "")
ALLOWED_ORIGINS = [
    o.strip() for o in os.environ.get("ALLOWED_ORIGINS", "https://ki4iroo.github.io").split(",") if o.strip()
]
MAX_BYTES = 25 * 1024 * 1024  # лимит Whisper

log = logging.getLogger("transcribe")

app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_methods=["POST"],
    allow_headers=["X-Telegram-Init-Data"],
)

client = OpenAI(api_key=OPENAI_API_KEY)


# Обычная (не async) функция: FastAPI выполнит её в пуле потоков,
# и синхронный вызов OpenAI не заблокирует остальные запросы.
@app.post("/transcribe")
def transcribe(
    file: UploadFile = File(...),
    x_telegram_init_data: str = Header(default=""),
):
    if not OPENAI_API_KEY or not TELEGRAM_BOT_TOKEN:
        raise HTTPException(500, "Server is not configured")

    user = validate_init_data(x_telegram_init_data, TELEGRAM_BOT_TOKEN)
    if user is None:
        raise HTTPException(401, "Invalid Telegram init data")

    data = file.file.read(MAX_BYTES + 1)
    if len(data) > MAX_BYTES:
        raise HTTPException(413, "File too large")

    try:
        result = client.audio.transcriptions.create(
            model="whisper-1",
            file=(file.filename or "audio.webm", data, file.content_type or "audio/webm"),
            language="ru",
        )
    except Exception:
        # Подробности — только в лог сервера, клиенту не отдаём
        log.exception("Transcription failed for user %s", user.get("id"))
        raise HTTPException(502, "Transcription failed")

    return {"text": result.text}
