const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api';

async function parseResponse(response, fallbackMessage) {
  let payload;
  try {
    payload = await response.json();
  } catch {
    throw new Error('The backend returned an invalid response.');
  }

  if (!response.ok) {
    const detail = typeof payload.detail === 'string' ? payload.detail : fallbackMessage;
    throw new Error(detail);
  }

  if (payload && payload.status === false) {
    throw new Error(payload.message || fallbackMessage);
  }

  return payload;
}

export async function registerUser(name, email, password) {
  const response = await fetch(`${API_BASE_URL}/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, email, password }),
  });

  return parseResponse(response, 'Registration failed.');
}

export async function loginUser(email, password) {
  const response = await fetch(`${API_BASE_URL}/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });

  return parseResponse(response, 'Login failed.');
}

export async function getStoredDocuments(ownerEmail) {
  const response = await fetch(`${API_BASE_URL}/documents?owner_email=${encodeURIComponent(ownerEmail)}`);
  return parseResponse(response, 'The document library could not be loaded.');
}

export async function getConversations(ownerEmail) {
  const response = await fetch(`${API_BASE_URL}/conversations?owner_email=${encodeURIComponent(ownerEmail)}`);
  return parseResponse(response, 'Conversation history could not be loaded.');
}

export async function saveConversation(conversation) {
  const response = await fetch(`${API_BASE_URL}/conversations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(conversation),
  });

  const payload = await parseResponse(response, 'The conversation could not be saved.');
  return payload.conversation || payload;
}

export async function storeDocument(file, ownerEmail) {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('owner_email', ownerEmail);

  const response = await fetch(`${API_BASE_URL}/documents`, {
    method: 'POST',
    body: formData,
  });

  return parseResponse(response, 'The document could not be stored.');
}

export function getDocumentDownloadUrl(documentId, ownerEmail) {
  return `${API_BASE_URL}/documents/${encodeURIComponent(documentId)}/download?owner_email=${encodeURIComponent(ownerEmail)}`;
}

export async function getStoredDocumentFile(documentId, ownerEmail, fileName) {
  const response = await fetch(getDocumentDownloadUrl(documentId, ownerEmail));
  if (!response.ok) {
    throw new Error('The stored document could not be loaded.');
  }

  const blob = await response.blob();
  return new File([blob], fileName, { type: blob.type || 'application/octet-stream' });
}

export async function deleteStoredDocument(documentId, ownerEmail) {
  const response = await fetch(
    `${API_BASE_URL}/documents/${encodeURIComponent(documentId)}?owner_email=${encodeURIComponent(ownerEmail)}`,
    { method: 'DELETE' },
  );

  return parseResponse(response, 'The stored document could not be deleted.');
}

export async function askAboutDocument(file, question) {
  return askAboutDocuments([file], question);
}

export async function askAboutDocuments(files, question) {
  const formData = new FormData();
  files.forEach((file) => formData.append('files', file));
  formData.append('question', question);

  const response = await fetch(`${API_BASE_URL}/rag_3`, {
    method: 'POST',
    body: formData,
  });

  return parseResponse(response, 'The RAG request failed.');
}

export async function askStoredDocument(documentId, ownerEmail, question) {
  const response = await fetch(`${API_BASE_URL}/documents/${encodeURIComponent(documentId)}/ask`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ owner_email: ownerEmail, question }),
  });

  return parseResponse(response, 'The stored document query failed.');
}