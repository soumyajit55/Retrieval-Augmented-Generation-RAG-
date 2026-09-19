import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Search, Trash2, Eye, CheckCircle2, Loader2, BarChart2, MessageCircle, Send, X, Bell, Menu, PanelLeftOpen } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { getConversations, getStoredDocuments, askStoredDocument, deleteStoredDocument, getDocumentDownloadUrl, saveConversation } from '../lib/api';
import LibrarySidebar from '../components/LibrarySidebar';

function ExpandableAnswer({ answer, className = '' }) {
  const [expanded, setExpanded] = useState(false);
  const isLongAnswer = answer.length > 480 || answer.split('\n').length > 8;

  return (
    <div className={`expandable-answer ${expanded ? 'is-expanded' : ''} ${className}`}>
      <p className="whitespace-pre-wrap">{answer}</p>
      {isLongAnswer && (
        <button type="button" onClick={() => setExpanded((current) => !current)} className="answer-toggle">
          {expanded ? '...less' : 'more...'}
        </button>
      )}
    </div>
  );
}

export default function LibraryPage() {
  const [isSidebarOpen, setIsSidebarOpen] = useState(() => typeof window === 'undefined' || window.innerWidth >= 1024);
  const [search, setSearch] = useState('');
  const { state } = useLocation();
  const { user } = useAuth();
  const [documents, setDocuments] = useState([]);
  const [conversations, setConversations] = useState([]);
  const [activeDocument, setActiveDocument] = useState(null);
  const [question, setQuestion] = useState('');
  const [isAsking, setIsAsking] = useState(false);
  const [conversationError, setConversationError] = useState('');
  const [notice, setNotice] = useState(() => state?.result ? `New document added: ${state.fileName}` : '');

  useEffect(() => {
    let isMounted = true;

    Promise.all([getStoredDocuments(user.email), getConversations(user.email)])
      .then(([storedDocuments, storedConversations]) => {
        if (!isMounted) return;
        const normalizedConversations = storedConversations.map((conversation) => ({
          ...conversation,
          documentId: conversation.document_id || conversation.documentId,
          createdAt: conversation.created_at || conversation.createdAt,
        }));
        const summaries = new Map();
        normalizedConversations.forEach((conversation) => {
          if (!summaries.has(conversation.documentId)) summaries.set(conversation.documentId, conversation.answer);
        });
        setConversations(normalizedConversations);
        setDocuments(storedDocuments.map((document) => ({
          ...document,
          title: document.name,
          storageId: document.id,
          type: document.content_type,
          size: `${(document.size / 1024 / 1024).toFixed(1)} MB`,
          pages: 'RAG indexed',
          status: 'Processed',
          summary: summaries.get(document.id) || 'Stored document ready for questions.',
          uploadedAt: document.created_at,
        })));
      })
      .catch((error) => {
        if (isMounted) setConversationError(error.message || 'Unable to load your library.');
      });

    return () => { isMounted = false; };
  }, [user.email]);

  useEffect(() => {
    if (!notice) return undefined;
    const timeout = window.setTimeout(() => setNotice(''), 4000);
    return () => window.clearTimeout(timeout);
  }, [notice]);

  const filteredDocs = documents.filter(doc => doc.title.toLowerCase().includes(search.toLowerCase()));

  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth >= 1024) setIsSidebarOpen(true);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const handleDelete = async (document) => {
    if (document.storageId) {
      try {
        await deleteStoredDocument(document.storageId, user.email);
      } catch {
        return;
      }
    }

    setDocuments((currentDocuments) => currentDocuments.filter((item) => item.id !== document.id));
    setConversations((currentConversations) => currentConversations.filter((item) => item.documentId !== document.id));
    if (activeDocument?.id === document.id) {
      setActiveDocument(null);
    }
  };

  const handleContinue = (document) => {
    setActiveDocument(document);
    setQuestion('');
    setConversationError('');
    setNotice(`Continuing chat for ${document.title}`);
  };

  const handleAsk = async (event) => {
    event.preventDefault();
    if (!activeDocument || !question.trim()) return;

    setIsAsking(true);
    setConversationError('');
    try {
      const result = await askStoredDocument(activeDocument.storageId, user.email, question.trim());
      const conversation = await saveConversation({
        owner_email: user.email,
        document_id: activeDocument.id,
        fileName: activeDocument.title,
        question: question.trim(),
        answer: result.answer,
        citations: result.citations || [],
      });
      setConversations((currentConversations) => [{
        ...conversation,
        documentId: conversation.document_id || conversation.documentId || activeDocument.id,
        createdAt: conversation.created_at || conversation.createdAt,
      }, ...currentConversations]);
      setQuestion('');
    } catch (error) {
      setConversationError(error.message || 'Unable to continue this conversation.');
    } finally {
      setIsAsking(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#07111E] text-white flex">
      {notice && (
        <div className="library-toast" role="status" aria-live="polite">
          <Bell className="w-4 h-4" />
          <span>{notice}</span>
          <button type="button" onClick={() => setNotice('')} aria-label="Dismiss notification"><X className="w-3.5 h-3.5" /></button>
        </div>
      )}
      <LibrarySidebar isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} documents={documents} onRecentUpload={handleContinue} />

      {/* Main Content Area */}
      <main className="min-w-0 flex-1 p-6 md:p-8 overflow-y-auto space-y-6 transition-[width] duration-300 ease-in-out">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <button type="button" onClick={() => setIsSidebarOpen((current) => !current)} className="p-2 rounded-lg bg-[#122438] text-cyan-300 hover:text-white transition" title={isSidebarOpen ? 'Close sidebar' : 'Open sidebar'} aria-label={isSidebarOpen ? 'Close sidebar' : 'Open sidebar'}>
              {isSidebarOpen ? <Menu className="w-5 h-5" /> : <PanelLeftOpen className="w-5 h-5" />}
            </button>
            <div>
              <h1 className="text-2xl font-bold text-brand-accent">My Library</h1>
              <p className="text-xs text-gray-400">All your notes, PDFs, and files. Explained when you need them.</p>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            <div className="relative">
              <Search className="w-4 h-4 text-gray-400 absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder="Search documents..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 pr-4 py-1.5 bg-[#0D1B2A] border border-cyan-950 rounded-xl text-xs text-white placeholder-gray-500 focus:outline-none focus:border-brand-accent"
              />
            </div>
            <select className="bg-[#0D1B2A] border border-cyan-950 text-xs rounded-xl px-3 py-2 text-gray-300 focus:outline-none">
              <option>Sort by: Recent</option>
              <option>Sort by: Name</option>
            </select>
          </div>
        </div>

        {state?.result && (
          <section className="bg-[#0B1A2C] border border-cyan-800/70 rounded-2xl p-5 space-y-4">
            <div>
              <p className="text-[10px] uppercase tracking-widest text-cyan-400">RAG answer</p>
              <h2 className="text-sm font-bold text-white mt-1">{state.fileName}</h2>
            </div>
            <ExpandableAnswer answer={state.result.answer} className="text-sm text-gray-200" />
            {state.result.citations?.length > 0 && (
              <div className="space-y-2">
                <p className="text-[10px] uppercase tracking-widest text-gray-500">Sources</p>
                {state.result.citations.map((citation) => (
                  <ExpandableAnswer
                    key={citation.chunk_id}
                    answer={citation.text_snippet}
                    className="source-expandable text-[11px] text-gray-400 border-l-2 border-cyan-700 pl-3"
                  />
                ))}
              </div>
            )}
          </section>
        )}

        {activeDocument && (
          <section className="bg-[#0B1A2C] border border-cyan-700 rounded-2xl p-5 space-y-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[10px] uppercase tracking-widest text-cyan-400">Continue conversation</p>
                <h2 className="text-sm font-bold text-white mt-1">{activeDocument.title}</h2>
              </div>
              <button onClick={() => setActiveDocument(null)} className="text-gray-500 hover:text-white" aria-label="Close conversation">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="max-h-64 overflow-y-auto space-y-3">
              {conversations.filter((conversation) => conversation.documentId === activeDocument.id).map((conversation) => (
                <div key={conversation.id} className="border-t border-cyan-950/60 pt-3 space-y-1">
                  <p className="conversation-question text-xs"><span className="font-semibold">Q:</span> {conversation.question}</p>
                  <ExpandableAnswer answer={conversation.answer} className="conversation-answer text-xs" />
                </div>
              ))}
            </div>
            <form onSubmit={handleAsk} className="flex gap-2">
              <input
                value={question}
                onChange={(event) => setQuestion(event.target.value)}
                placeholder="Ask a follow-up question..."
                disabled={isAsking}
                className="flex-1 bg-[#0E2034] border border-cyan-900/60 rounded-xl px-3 py-2 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-brand-accent disabled:opacity-60"
              />
              <button type="submit" disabled={isAsking || !question.trim()} className="px-3 rounded-xl bg-[#D1B860] text-gray-950 disabled:opacity-40" aria-label="Send question">
                {isAsking ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              </button>
            </form>
            {conversationError && <p className="text-xs text-red-300">{conversationError}</p>}
          </section>
        )}

        {/* Documents Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredDocs.map((doc) => (
            <div
              key={doc.id}
              className="bg-[#0B1A2C] border border-cyan-950 rounded-2xl p-4 flex flex-col justify-between space-y-3 hover:border-cyan-800/60 transition shadow-lg"
            >
              <div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-gray-200 truncate max-w-[180px]">{doc.title}</span>
                  </div>
                  {doc.status === 'Processed' ? (
                    <span className="flex items-center gap-1 text-[10px] text-green-400">
                      <CheckCircle2 className="w-3 h-3" /> Processed
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 text-[10px] text-yellow-400 animate-pulse">
                      <Loader2 className="w-3 h-3 animate-spin" /> Processing...
                    </span>
                  )}
                </div>

                <p className="text-[11px] text-gray-400 mt-2 line-clamp-2">
                  {doc.summary}
                </p>
                <div className="text-[10px] text-gray-500 mt-2 flex gap-3">
                  <span>{doc.size}</span>
                  <span>•</span>
                  <span>{doc.pages}</span>
                </div>
              </div>

              {/* Card Actions */}
              <div className="flex items-center justify-between pt-2 border-t border-cyan-950/60">
                <button
                  onClick={() => doc.storageId && window.open(getDocumentDownloadUrl(doc.storageId, user.email), '_blank', 'noopener,noreferrer')}
                  disabled={!doc.storageId}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-[#12253B] hover:bg-cyan-900/40 rounded-lg text-xs font-semibold text-cyan-300 transition disabled:opacity-40"
                >
                  <Eye className="w-3.5 h-3.5" /> View
                </button>
                <button
                  onClick={() => handleContinue(doc)}
                  disabled={!doc.storageId}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-[#12253B] hover:bg-cyan-900/40 rounded-lg text-xs font-semibold text-cyan-300 transition disabled:opacity-40"
                >
                  <MessageCircle className="w-3.5 h-3.5" /> Chat
                </button>
                <button onClick={() => handleDelete(doc)} className="p-1.5 text-gray-500 hover:text-red-400 transition" aria-label={`Delete ${doc.title}`}>
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>

        <div className="analytics-card analytics-card-compact text-gray-950 rounded-2xl shadow-xl">
          <div className="analytics-compact-chart">
            <div className="w-14 h-14 rounded-full border-4 border-yellow-700 border-t-red-600 border-r-blue-600 border-l-green-600"></div>
            <BarChart2 className="w-4 h-4 absolute text-gray-900" />
          </div>
          <div>
            <h3 className="text-xs font-black">Analytics</h3>
            <p className="text-[9px] font-semibold text-gray-700">{documents.length} files indexed</p>
          </div>
        </div>
      </main>
    </div>
  );
}