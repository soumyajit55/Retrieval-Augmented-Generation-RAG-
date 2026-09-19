from google import genai          #type:ignore
from fastapi import FastAPI, UploadFile, File, Form, HTTPException, Request, Query       #type:ignore
from fastapi.middleware.cors import CORSMiddleware  # type: ignore
import pymupdf                    # type: ignore
import numpy as np                #type:ignore
import os
from dotenv import load_dotenv    #type:ignore
import re
import docx                       #type:ignore
from PIL import Image             #type:ignore
import io                         #type:ignore
import bcrypt                     #type:ignore
from pymongo import MongoClient   #type:ignore
import uuid
from pathlib import Path

load_dotenv(dotenv_path=Path(__file__).resolve().parent / ".env")
load_dotenv()

app = FastAPI()

allowed_origins = [
    origin.strip()
    for origin in os.getenv("CORS_ALLOWED_ORIGINS", "*").split(",")
    if origin.strip()
]
app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

client = genai.Client(
    api_key=os.getenv("gemini-api-key")
)


from pymongo.read_preferences import ReadPreference       #type:ignore

MONGO_URI = os.getenv("my_mongo_uri")

client_2 = MongoClient(MONGO_URI, read_preference=ReadPreference.PRIMARY_PREFERRED)
print("MongoDB connection initialized!")

db = client_2["RAG_db"]
Users = db["Users"]                          # collection name where user data is stored


@app.get("/")
def root_check():
    return {
        "status": "ok",
        "service": "rag_backend",
        "message": "RAG backend is running. Use /health for diagnostics.",
    }


@app.post("/register")
def register_user(user: dict):
    if "email" not in user or "password" not in user:
        return {
            "status": False,
            "message": "Email and password are required"
        }
        
    try:
        existing_user = Users.find_one({"email": user["email"]})
        if existing_user:
            return {
                "status": False,
                "message": "User already exists with this email"
            }

        password = user["password"]
        password_bytes = password.encode('utf-8')            # Unicode Transformation Format.
        hashed_password = bcrypt.hashpw(password_bytes, bcrypt.gensalt())
        user["password"] = hashed_password.decode("utf-8")
        token = str(uuid.uuid4())                            # generate 128 bits token (uuid4)
        user["token"] = token
        result = Users.insert_one(user)
        return {
            "status": True,
            "message": "User registered successfully",
            "inserted_id": str(result.inserted_id),
            "token": token
        }
    except Exception as e:
        return {
            "status": False,
            "message": f"Database temporarily unavailable ({str(e)}). Please retry in a moment."
        }


@app.post("/login")
def login_user(user: dict):
    if "email" not in user or "password" not in user:
        return {
            "status": False,
            "message": "Email and password are required"
        }

    try:
        email = user["email"]
        password = user["password"]
        existing_user = Users.find_one({
            "email": email
        })
        if existing_user is None:
            return {
                "status": False,
                "message": "Invalid email"
            }
        
        password_bytes = password.encode('utf-8')
        stored_password = existing_user["password"].encode("utf-8")
        
        password_correct = bcrypt.checkpw(
            password_bytes,
            stored_password
        )
        if not password_correct:
            return {
                "status": False,
                "message": "Invalid password"
            }
        return {
            "status": True,
            "message": "Login successful", 
            "user_id": str(existing_user["_id"]), 
            "name": existing_user.get("name", existing_user.get("username", "")),
            "email": existing_user["email"], 
            "token": existing_user.get("token", "")
        }
    except Exception as e:
        return {
            "status": False,
            "message": f"Database temporarily unavailable ({str(e)}). Please retry in a moment."
        }


@app.get("/health")
def health_check():
    db_status = "disconnected"
    try:
        client_2.admin.command('ping')
        db_status = "connected"
    except Exception:
        pass
    return {
        "status": "ok",
        "service": "rag_backend",
        "database": db_status
    }


@app.get("/auth/me")
def get_current_user(token: str = Query(None)):
    if not token:
        raise HTTPException(status_code=401, detail="Authentication token required.")

    try:
        user = Users.find_one({"token": token.strip()})
        if not user:
            raise HTTPException(status_code=401, detail="Invalid or expired token.")
        return {
            "status": True,
            "user": {
                "user_id": str(user["_id"]),
                "name": user.get("name", user.get("username", "")),
                "email": user["email"]
            }
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")


def chunk_text(text: str, chunk_size: int = 6, overlap: int = 2) -> list[str]:
    """Splits text into chunks of `chunk_size` sentences with `overlap` sentences overlap."""
    sentences = re.split(r'(?<=[.!?])\s+', text)
    sentences = [s.strip() for s in sentences if s.strip()]
    
    if not sentences:
        return []

    chunks = []
    start = 0
    while start < len(sentences):
        end = start + chunk_size
        chunk = " ".join(sentences[start:end])
        chunks.append(chunk)
        step = max(1, chunk_size - overlap)
        start += step
        
    return chunks


def get_embedding(text: str) -> np.ndarray:
    """Helper to get a single embedding."""
    response = client.models.embed_content(
        model="gemini-embedding-2",
        contents=text
    )
    return np.array(response.embeddings[0].values)


def extract_text_from_bytes(file_bytes: bytes, filename: str) -> str:
    """Extracts raw text from multiple supported document/image formats."""
    filename = filename.lower()
    full_text = ""

    try:
        if filename.endswith(".pdf"):
            doc = pymupdf.open(stream=file_bytes, filetype="pdf")
            for page in doc:
                full_text += page.get_text()
            doc.close()
        elif filename.endswith(".txt"):
            full_text = file_bytes.decode("utf-8", errors="replace")
        elif filename.endswith(".docx"):
            doc = docx.Document(io.BytesIO(file_bytes))
            full_text = "\n".join([para.text for para in doc.paragraphs])
        elif filename.endswith((".png", ".jpg", ".jpeg")):
            image = Image.open(io.BytesIO(file_bytes))
            ocr_response = client.models.generate_content(
                model="gemini-3.5-flash-lite",
                contents=["Extract all the text from this document or image accurately. Return only the extracted text. If no text exists, return empty.", image]
            )
            full_text = ocr_response.text or ""
        else:
            raise HTTPException(status_code=400, detail="Unsupported file format. Please upload PDF, DOCX, TXT, or Image (.png/.jpg).")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Error processing file: {str(e)}")

    if not full_text.strip():
        raise HTTPException(status_code=400, detail="No readable text found in the uploaded file.")
    
    return full_text


def run_rag_pipeline_on_chunks(chunks: list[str], question: str, sources: list[str] = None) -> dict:
    """Executes embedding generation, vector similarity search, and Gemini response synthesis over chunks."""
    if not chunks:
        raise HTTPException(status_code=400, detail="No valid chunks found across uploaded file(s).")

    chunk_embeddings = [get_embedding(c) for c in chunks]
    vector_store = np.array(chunk_embeddings)
    question_embedding = get_embedding(question)

    norms = np.linalg.norm(vector_store, axis=1) * np.linalg.norm(question_embedding)
    norms = np.where(norms == 0, 1e-10, norms)
    similarities = np.dot(vector_store, question_embedding) / norms

    unique_sources = list(dict.fromkeys(sources)) if sources else []
    if len(unique_sources) > 1:
        selected_indices = set()
        # Guarantee representation from each uploaded source document
        for src in unique_sources:
            src_indices = [i for i, s in enumerate(sources) if s == src]
            if src_indices:
                src_sorted = sorted(src_indices, key=lambda i: similarities[i], reverse=True)
                selected_indices.update(src_sorted[:2])
        # Also include overall top-scoring chunks up to target_k
        global_sorted = np.argsort(similarities)[::-1]
        target_k = min(max(6, len(unique_sources) * 3), len(chunks), 12)
        for idx in global_sorted:
            if len(selected_indices) >= target_k:
                break
            selected_indices.add(int(idx))
        top_indices = sorted(list(selected_indices), key=lambda i: similarities[i], reverse=True)
    else:
        top_k = min(5, len(chunks))
        top_indices = np.argsort(similarities)[-top_k:][::-1].tolist()

    retrieved_chunks = [chunks[i] for i in top_indices]
    context = "\n\n---\n\n".join(retrieved_chunks)

    prompt = f"""You are a helpful AI assistant.
Answer the question accurately and thoroughly based ONLY on the provided document context.
The context contains excerpts from one or multiple uploaded documents (each indicated by its filename in brackets, e.g. [filename]).
If multiple questions are asked or the question relates to multiple documents, answer each part clearly using the corresponding document context.
If any specific information is not present in the context, explicitly state that that part was not found in the documents.

Context:
{context}

Question: {question}
"""
    generate_response = client.models.generate_content(
        model="gemini-3.5-flash-lite",
        contents=prompt
    )

    citations = []
    for idx in top_indices:
        citation_item = {
            "chunk_id": int(idx),
            "similarity_score": round(float(similarities[idx]), 4),
            "text_snippet": chunks[idx].strip()
        }
        if sources and idx < len(sources):
            citation_item["source_file"] = sources[idx]
        citations.append(citation_item)

    return {
        "status": True,
        "question": question,
        "answer": generate_response.text,
        "citations": citations
    }


def run_rag_pipeline(full_text: str, question: str) -> dict:
    """Backwards-compatible helper for single text RAG execution."""
    chunks = chunk_text(full_text, chunk_size=6, overlap=2)
    return run_rag_pipeline_on_chunks(chunks, question)


@app.post("/rag_3")
async def rag_3(
    request: Request,
    files: list[UploadFile] = File(default=[]),
    file: list[UploadFile] = File(default=[]),
    question: str = Form(None),
):
    """
    RAG endpoint supporting single or multiple files (PDF, DOCX, TXT, Images) simultaneously.
    Accepts multiple files under 'files', 'file', or repeated form keys in Postman/frontends.
    """
    upload_list = []
    if files:
        upload_list.extend(files)
    if file:
        upload_list.extend(file)

    form = await request.form()
    if not question:
        question = form.get("question", "")

    if not upload_list:
        for _, val in form.multi_items():
            if isinstance(val, UploadFile):
                upload_list.append(val)

    if not upload_list:
        raise HTTPException(status_code=400, detail="At least one file must be uploaded.")

    if not question or not str(question).strip():
        raise HTTPException(status_code=400, detail="question is required.")

    all_chunks = []
    chunk_sources = []
    processed_files = []

    for uploaded_file in upload_list:
        file_bytes = await uploaded_file.read()
        if not file_bytes:
            continue
        fname = uploaded_file.filename or "document.txt"
        extracted_text = extract_text_from_bytes(file_bytes, fname)
        file_chunks = chunk_text(extracted_text, chunk_size=6, overlap=2)
        for chunk in file_chunks:
            labeled_chunk = f"[{fname}] {chunk}"
            all_chunks.append(labeled_chunk)
            chunk_sources.append(fname)
        processed_files.append(fname)

    if not all_chunks:
        raise HTTPException(status_code=400, detail="No readable text found in any of the uploaded files.")

    result = run_rag_pipeline_on_chunks(all_chunks, str(question).strip(), sources=chunk_sources)
    result["processed_files"] = processed_files
    return result



# Persistent document storage API. The existing RAG endpoint above remains unchanged.
from datetime import datetime, timezone
from pathlib import Path
from threading import Lock
from uuid import uuid4
import json
from fastapi import Query   #type:ignore
from fastapi.responses import FileResponse    #type:ignore

DOCUMENT_STORAGE_DIR = Path(__file__).resolve().parent / "document_storage"
DOCUMENT_METADATA_FILE = DOCUMENT_STORAGE_DIR / "metadata.json"
DOCUMENT_STORAGE_DIR.mkdir(parents=True, exist_ok=True)
document_storage_lock = Lock()
stored_document_extensions = {".pdf", ".docx", ".txt", ".png", ".jpg", ".jpeg"}


def read_document_metadata():
    if not DOCUMENT_METADATA_FILE.exists():
        return []

    try:
        return json.loads(DOCUMENT_METADATA_FILE.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return []


def write_document_metadata(documents):
    temporary_file = DOCUMENT_METADATA_FILE.with_suffix(".tmp")
    temporary_file.write_text(json.dumps(documents, indent=2), encoding="utf-8")
    temporary_file.replace(DOCUMENT_METADATA_FILE)


def get_document_for_user(document_id, owner_email):
    return next(
        (
            document
            for document in read_document_metadata()
            if document["id"] == document_id
            and document["owner_email"] == owner_email.lower()
        ),
        None,
    )


@app.post("/documents")
async def store_document(
    file: UploadFile = File(...),
    owner_email: str = Form(...),
):
    original_name = Path(file.filename or "document").name
    extension = Path(original_name).suffix.lower()
    if extension not in stored_document_extensions:
        raise HTTPException(status_code=400, detail="Unsupported document format.")

    file_bytes = await file.read()
    if not file_bytes:
        raise HTTPException(status_code=400, detail="The uploaded document is empty.")
    if len(file_bytes) > 20 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Documents must be 20 MB or smaller.")

    document_id = str(uuid4())
    stored_file = DOCUMENT_STORAGE_DIR / f"{document_id}{extension}"
    document = {
        "id": document_id,
        "owner_email": owner_email.lower().strip(),
        "name": original_name,
        "content_type": file.content_type or "application/octet-stream",
        "size": len(file_bytes),
        "created_at": datetime.now(timezone.utc).isoformat(),
    }

    with document_storage_lock:
        stored_file.write_bytes(file_bytes)
        documents = read_document_metadata()
        documents.insert(0, document)
        write_document_metadata(documents)

    return document


@app.get("/documents")
def list_documents(owner_email: str = Query(...)):
    owner_email = owner_email.lower().strip()
    return [
        document
        for document in read_document_metadata()
        if document["owner_email"] == owner_email
    ]


@app.get("/documents/{document_id}/download")
def download_document(document_id: str, owner_email: str = Query(...)):
    document = get_document_for_user(document_id, owner_email.strip())
    if not document:
        raise HTTPException(status_code=404, detail="Document not found.")

    extension = Path(document["name"]).suffix.lower()
    stored_file = DOCUMENT_STORAGE_DIR / f"{document_id}{extension}"
    if not stored_file.exists():
        raise HTTPException(status_code=404, detail="Stored document file not found.")

    return FileResponse(
        stored_file,
        media_type=document["content_type"],
        filename=document["name"],
    )


@app.delete("/documents/{document_id}")
def delete_document(document_id: str, owner_email: str = Query(...)):
    with document_storage_lock:
        document = get_document_for_user(document_id, owner_email.strip())
        if not document:
            raise HTTPException(status_code=404, detail="Document not found.")

        extension = Path(document["name"]).suffix.lower()
        stored_file = DOCUMENT_STORAGE_DIR / f"{document_id}{extension}"
        stored_file.unlink(missing_ok=True)
        documents = [item for item in read_document_metadata() if item["id"] != document_id]
        write_document_metadata(documents)

    return {"status": True, "id": document_id}


@app.post("/documents/{document_id}/ask")
async def ask_stored_document(
    document_id: str,
    request: Request,
    owner_email: str = Query(None),
):
    """Executes RAG directly on a stored document without requiring re-upload."""
    question = ""
    email = owner_email or ""
    content_type = request.headers.get("content-type", "")

    if "application/json" in content_type:
        body = await request.json()
        question = body.get("question", "")
        if not email:
            email = body.get("owner_email", "")
    else:
        form = await request.form()
        question = form.get("question", "")
        if not email:
            email = form.get("owner_email", "")

    if not email:
        raise HTTPException(status_code=400, detail="owner_email is required.")
    if not question or not str(question).strip():
        raise HTTPException(status_code=400, detail="question is required.")

    document = get_document_for_user(document_id, email.strip())
    if not document:
        raise HTTPException(status_code=404, detail="Document not found.")

    extension = Path(document["name"]).suffix.lower()
    stored_file = DOCUMENT_STORAGE_DIR / f"{document_id}{extension}"
    if not stored_file.exists():
        raise HTTPException(status_code=404, detail="Stored document file not found on disk.")

    file_bytes = stored_file.read_bytes()
    full_text = extract_text_from_bytes(file_bytes, document["name"])
    result = run_rag_pipeline(full_text, str(question).strip())
    result["document_id"] = document_id
    result["fileName"] = document["name"]
    return result


# Cross-Device Conversation History
CONVERSATIONS_FILE = DOCUMENT_STORAGE_DIR / "conversations.json"


def read_file_conversations():
    if not CONVERSATIONS_FILE.exists():
        return []
    try:
        return json.loads(CONVERSATIONS_FILE.read_text(encoding="utf-8"))
    except Exception:
        return []


def write_file_conversations(convs):
    tmp = CONVERSATIONS_FILE.with_suffix(".tmp")
    tmp.write_text(json.dumps(convs, indent=2), encoding="utf-8")
    tmp.replace(CONVERSATIONS_FILE)


@app.get("/conversations")
def get_conversations(owner_email: str = Query(...)):
    owner_email = owner_email.lower().strip()
    with document_storage_lock:
        return [c for c in read_file_conversations() if c.get("owner_email") == owner_email]


@app.post("/conversations")
def save_conversation(conversation: dict):
    if "owner_email" not in conversation:
        raise HTTPException(status_code=400, detail="owner_email is required.")
    conversation["owner_email"] = conversation["owner_email"].lower().strip()
    if "created_at" not in conversation:
        conversation["created_at"] = datetime.now(timezone.utc).isoformat()
    if "id" not in conversation:
        conversation["id"] = str(uuid4())

    with document_storage_lock:
        convs = read_file_conversations()
        convs.insert(0, {k: v for k, v in conversation.items() if k != "_id"})
        write_file_conversations(convs)

    conversation.pop("_id", None)
    return {"status": True, "conversation": conversation}

