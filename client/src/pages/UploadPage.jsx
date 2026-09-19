import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { UploadCloud, FileText, CheckCircle2, X, Plus, BrainCircuit, Send, Image, Pencil, Globe } from 'lucide-react';
import { askAboutDocuments, askStoredDocument, saveConversation, storeDocument } from '../lib/api';
import { useAuth } from '../context/AuthContext';

export default function UploadPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [question, setQuestion] = useState('');

  const handleFileSelection = (files) => {
    const validFiles = Array.from(files || []);
    const oversizedFile = validFiles.find((file) => file.size > 20 * 1024 * 1024);
    if (oversizedFile) {
      setUploadError(`${oversizedFile.name} is larger than the 20 MB limit.`);
      return;
    }

    setSelectedFiles((currentFiles) => {
      const existingNames = new Set(currentFiles.map((item) => item.name));
      const newFiles = validFiles
        .filter((file) => !existingNames.has(file.name))
        .map((file) => ({
          file,
          name: file.name,
          size: `${(file.size / 1024 / 1024).toFixed(1)} MB`,
        }));
      return [...currentFiles, ...newFiles];
    });
    setUploadError('');
  };

  const handleFileInput = (event) => {
    handleFileSelection(event.target.files);
    event.target.value = '';
  };

  const handleDrop = (event) => {
    event.preventDefault();
    handleFileSelection(event.dataTransfer.files);
  };

  const handleUploadSubmit = async () => {
    if (selectedFiles.length === 0) {
      setUploadError('Choose a file before asking a question.');
      return;
    }

    if (!question.trim()) {
      setUploadError('Enter a question about the selected material.');
      return;
    }

    setIsProcessing(true);
    setUploadError('');

    try {
      const storedDocuments = await Promise.all(
        selectedFiles.map((selectedFile) => storeDocument(selectedFile.file, user.email)),
      );
      const result = selectedFiles.length === 1
        ? await askStoredDocument(storedDocuments[0].id, user.email, question.trim())
        : await askAboutDocuments(selectedFiles.map((selectedFile) => selectedFile.file), question.trim());

      await Promise.all(storedDocuments.map((storedDocument, index) => saveConversation({
        owner_email: user.email,
        document_id: storedDocument.id,
        fileName: selectedFiles[index].name,
        question: question.trim(),
        answer: result.answer,
        citations: result.citations || [],
      })));
      setIsProcessing(false);
      navigate('/library', {
        state: {
          result,
          fileName: selectedFiles.map((selectedFile) => selectedFile.name).join(', '),
        },
      });
    } catch (error) {
      setIsProcessing(false);
      setUploadError(error.message || 'Unable to connect to the RAG backend.');
    }
  };

  return (
    <div className="upload-page min-h-screen bg-[#07111E] text-white flex flex-col items-center px-4">
      <main className="upload-workspace w-full max-w-3xl">
        <div className="upload-welcome text-center">
          <div className="upload-welcome-icon"><BrainCircuit className="w-5 h-5" /></div>
          <h1 className="text-3xl font-semibold tracking-tight">Ready when you are.</h1>
          <p className="text-sm text-gray-400 mt-2">Add a document, ask a question, and build your Second Brain.</p>
        </div>

        {/* Chat-style composer and drop target */}
        <div
          onDrop={handleDrop}
          onDragOver={(event) => event.preventDefault()}
          className="upload-composer"
        >
          <div className="upload-composer-row">
            <label htmlFor="file-upload" className="upload-icon-button" title="Attach a document" aria-label="Attach a document">
              <Plus className="w-5 h-5" />
            </label>
            <input
              id="file-upload"
              type="file"
              accept=".pdf,.png,.jpg,.jpeg,.txt,.docx"
              onChange={handleFileInput}
              className="sr-only"
            />
            <textarea
              id="question"
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              placeholder="Ask anything about your document"
              rows={1}
              className="upload-question"
            />
            <span className="upload-mode"><BrainCircuit className="w-4 h-4" /> Think</span>
            <button
              onClick={handleUploadSubmit}
              disabled={isProcessing}
              className="upload-send"
              title="Ask and add document"
              aria-label="Ask and add document"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
          <div className="upload-composer-hint">
            <UploadCloud className="w-4 h-4" />
            <span>Drop a file here or click <label htmlFor="file-upload" className="text-cyan-400 cursor-pointer">+</label> to browse</span>
          </div>
        </div>

        {uploadError && <p className="upload-error">{uploadError}</p>}

        {/* Uploaded File Pill */}
        {selectedFiles.length > 0 && (
          <div className="space-y-2">
            {selectedFiles.map((selectedFile) => (
              <div key={selectedFile.name} className="upload-file-chip">
                <div className="flex items-center gap-3 min-w-0">
                  <FileText className="w-6 h-6 text-green-600 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-xs font-bold truncate">{selectedFile.name}</p>
                    <p className="text-[10px] text-gray-500">{selectedFile.size}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <CheckCircle2 className="w-5 h-5 text-green-600" />
                  <button
                    onClick={() => setSelectedFiles((currentFiles) => currentFiles.filter((item) => item.name !== selectedFile.name))}
                    className="text-gray-400 hover:text-red-500"
                    aria-label={`Remove ${selectedFile.name}`}
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="upload-shortcuts">
          <span><Image className="w-4 h-4" /> First upload your document</span>
          <span><Pencil className="w-4 h-4" /> Write your instruction...!</span>
          <span><Globe className="w-4 h-4" /> Get the best response</span>
        </div>

        {/* Footnote */}
        <div className="upload-footnote">
          <span>Private and secure</span>
          <span>Used only to build your Second Brain</span>
          <span>You can delete files anytime</span>
        </div>

      </main>
    </div>
  );
}