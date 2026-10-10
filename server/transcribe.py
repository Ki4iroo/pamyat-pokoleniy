"""
Whisper transcription proxy — запускать рядом с ботом на VPS
pip install fastapi uvicorn python-multipart openai
uvicorn transcribe:app --host 0.0.0.0 --port 8765
"""
import os
from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from openai import OpenAI

OPENAI_API_KEY = os.environ.get("OPENAI_API_KEY", "")

app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],   # можно сузить до домена приложения
    allow_methods=["POST"],
    allow_headers=["*"],
)

client = OpenAI(api_key=OPENAI_API_KEY)

@app.post("/transcribe")
async def transcribe(file: UploadFile = File(...)):
    if not OPENAI_API_KEY:
        raise HTTPException(500, "OPENAI_API_KEY not set")
    data = await file.read()
    if len(data) > 25 * 1024 * 1024:  # 25 MB лимит Whisper
        raise HTTPException(400, "File too large")
    try:
        result = client.audio.transcriptions.create(
            model="whisper-1",
            file=(file.filename or "audio.webm", data, file.content_type or "audio/webm"),
            language="ru",
        )
        return {"text": result.text}
    except Exception as e:
        raise HTTPException(500, str(e))
