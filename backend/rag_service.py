import json
import threading
from dataclasses import dataclass
from typing import Any, List, Optional

import numpy as np

from pypdf import PdfReader

from sentence_transformers import SentenceTransformer

# Global variables for lazy loading
_embedding_model = None
_embedding_lock = threading.Lock()


# =========================================================
# DOCUMENT CLASS
# =========================================================


@dataclass
class Document:
    filename: str
    content: str
    chunk_index: int


# =========================================================
# CHUNK CLASS
# =========================================================


@dataclass
class Chunk:
    document: Optional[Document] = None
    content: str = ""
    embedding: Optional[str] = None


def get_embedding_model():
    """
    Lazily load the sentence-transformers model on first use.
    Avoids blocking the import of this module — the app can start
    even if the model isn't available yet.
    """
    global _embedding_model
    if _embedding_model is None:
        with _embedding_lock:
            if _embedding_model is None:
                _embedding_model = SentenceTransformer(
                    "all-MiniLM-L6-v2"
                )
    return _embedding_model


# =========================================================
# PDF TEXT EXTRACTION
# =========================================================

def extract_pdf_text(
    file_path: str,
) -> str:

    reader = PdfReader(file_path)

    pages = []

    for page in reader.pages:

        text = page.extract_text()

        if text:
            pages.append(text)

    return "\n".join(pages)


# =========================================================
# CLEAN TEXT
# =========================================================

def clean_text(
    text: str,
) -> str:

    if not text:
        return ""

    text = text.replace(
        "\x00",
        " ",
    )

    lines = [
        line.strip()
        for line in text.splitlines()
        if line.strip()
    ]

    return "\n".join(lines)


# =========================================================
# CREATE CHUNKS
# =========================================================

def create_chunks(
    text: str,
    chunk_size: int = 1000,
    overlap: int = 200,
) -> list[str]:

    if not text:
        return []

    if chunk_size <= 0:
        raise ValueError(
            "chunk_size must be greater than zero."
        )

    if overlap < 0:
        raise ValueError(
            "overlap cannot be negative."
        )

    if overlap >= chunk_size:
        raise ValueError(
            "overlap must be smaller than chunk_size."
        )

    chunks = []

    start = 0
    text_length = len(text)

    while start < text_length:

        end = min(
            start + chunk_size,
            text_length,
        )

        chunk = text[
            start:end
        ].strip()

        if chunk:
            chunks.append(chunk)

        if end >= text_length:
            break

        start = end - overlap

    return chunks


# =========================================================
# CREATE EMBEDDING
# =========================================================

def create_embedding(
    text: str,
) -> list[float]:

    if not text.strip():
        return []

    embedding = get_embedding_model().encode(
        text,
        normalize_embeddings=True,
    )

    return embedding.tolist()


# =========================================================
# SERIALIZE
# =========================================================

def serialize_embedding(
    embedding: list[float],
) -> str:

    return json.dumps(
        embedding,
        separators=(",", ":"),
    )


# =========================================================
# DESERIALIZE
# =========================================================

def deserialize_embedding(
    embedding: str,
) -> list[float]:

    value = json.loads(embedding)

    if not isinstance(value, list):
        raise ValueError(
            "Invalid embedding format."
        )

    return [
        float(item)
        for item in value
    ]


# =========================================================
# COSINE SIMILARITY
# =========================================================

def cosine_similarity(
    vector_a: list[float],
    vector_b: list[float],
) -> float:

    if not vector_a or not vector_b:
        return 0.0

    a = np.asarray(
        vector_a,
        dtype=np.float32,
    )

    b = np.asarray(
        vector_b,
        dtype=np.float32,
    )

    if a.shape != b.shape:
        return 0.0

    denominator = (
        np.linalg.norm(a)
        * np.linalg.norm(b)
    )

    if denominator == 0:
        return 0.0

    similarity = np.dot(
        a,
        b,
    ) / denominator

    return float(similarity)


# =========================================================
# SEARCH CHUNKS
# =========================================================

def search_chunks(
    query: str,
    chunks,
    top_k: int = 5,
):

    if not query.strip():
        return []

    if top_k <= 0:
        return []

    query_embedding = create_embedding(
        query
    )

    results = []

    for chunk in chunks:

        if not chunk.embedding:
            continue

        try:

            chunk_embedding = (
                deserialize_embedding(
                    chunk.embedding
                )
            )

            similarity = cosine_similarity(
                query_embedding,
                chunk_embedding,
            )

            results.append(
                {
                    "chunk": chunk,
                    "score": similarity,
                }
            )

        except (
            json.JSONDecodeError,
            ValueError,
            TypeError,
        ):
            continue

    results.sort(
        key=lambda item: item["score"],
        reverse=True,
    )

    return results[:top_k]


# =========================================================
# BUILD CONTEXT
# =========================================================

def build_context(
    results,
) -> str:

    if not results:
        return ""

    context_parts = []

    for index, result in enumerate(
        results,
        start=1,
    ):

        chunk = result["chunk"]

        filename = (
            chunk.document.filename
            if chunk.document
            else "Unknown document"
        )

        context_parts.append(
            f"""
SOURCE {index}
Document: {filename}
Chunk: {chunk.chunk_index}

{chunk.content}
""".strip()
        )

    return "\n\n".join(
        context_parts
    )