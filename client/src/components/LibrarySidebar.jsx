import { Link } from 'react-router-dom';
import { BookOpen, HelpCircle, Wrench, Upload, PanelLeftClose } from 'lucide-react';

export default function LibrarySidebar({ isOpen, onClose, documents = [], activePage = 'library', onRecentUpload }) {
  return (
    <>
      {isOpen && <button type="button" className="fixed inset-0 z-40 bg-black/50 lg:hidden" onClick={onClose} aria-label="Close sidebar" />}
      <aside className={`library-sidebar w-64 shrink-0 bg-[#0A1626] border-r border-cyan-950/60 p-5 flex flex-col justify-between transition-[transform,margin] duration-300 ease-in-out ${isOpen ? 'translate-x-0 lg:ml-0' : '-translate-x-full lg:-ml-64'} lg:relative lg:z-auto max-lg:fixed max-lg:inset-y-0 max-lg:left-0 max-lg:z-50`}>
        <div className="space-y-6">
          <div className="flex items-start justify-between gap-2">
            <Link to="/" className="text-xl font-bold tracking-wider text-brand-accent block">
              2nd <span className="text-white">BR@IN</span>
              <span className="text-[10px] block text-gray-400 font-normal">AI Study Assistant</span>
            </Link>
            <button type="button" onClick={onClose} className="hidden lg:block p-1 text-gray-400 hover:text-white" title="Close sidebar" aria-label="Close sidebar">
              <PanelLeftClose className="w-5 h-5" />
            </button>
          </div>

          <Link to="/upload" className="w-full flex items-center justify-center gap-2 py-2.5 bg-[#122438] hover:bg-cyan-950 border border-cyan-800/40 rounded-xl text-xs font-semibold transition">
            <Upload className="w-4 h-4 text-cyan-400" />
            <span>Upload Materials</span>
          </Link>

          <div className="space-y-1">
            <span className="text-[10px] text-gray-500 uppercase tracking-widest font-semibold px-2">Navigation</span>
            <Link to="/library" className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-semibold ${activePage === 'library' ? 'bg-[#12253B] text-brand-accent' : 'text-gray-400 hover:text-white'}`}>
              <BookOpen className="w-4 h-4" /> My Library
            </Link>
            <button type="button" className="w-full flex items-center gap-3 px-3 py-2 text-gray-400 hover:text-white rounded-lg text-xs font-medium">
              <HelpCircle className="w-4 h-4" /> Ask Questions
            </button>
            <button type="button" className="w-full flex items-center gap-3 px-3 py-2 text-gray-400 hover:text-white rounded-lg text-xs font-medium">
              <Wrench className="w-4 h-4" /> Study Tools
            </button>
          </div>

          <div className="space-y-2 pt-4 border-t border-cyan-950/40">
            <span className="text-[10px] text-gray-500 uppercase tracking-widest font-semibold px-2">Your History</span>
            <div className="space-y-2">
              {documents.slice(0, 2).map((document) => (
                <button key={document.id} type="button" onClick={() => onRecentUpload?.(document)} className="recent-upload-item" title={`Open conversation history for ${document.title || document.name}`}>
                  <span className="truncate max-w-[120px] text-gray-300">{document.title || document.name}</span>
                  <span className="text-[9px] text-cyan-400">Chat</span>
                </button>
              ))}
              {documents.length === 0 && <span className="text-[11px] text-gray-500 px-2">No uploads yet</span>}
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}
