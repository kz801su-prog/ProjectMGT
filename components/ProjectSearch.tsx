
import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Search, X, MessageSquare, Paperclip, FileText, Target, ChevronRight, Activity } from 'lucide-react';
import { Task } from '../types';

type MatchType = 'title' | 'description' | 'goal' | 'epic' | 'comment' | 'progress' | 'attachment';

interface SearchResult {
  task: Task;
  matchType: MatchType;
  matchContext: string;
}

interface Props {
  tasks: Task[];
  onOpenTask: (taskId: string, tab: 'basic' | 'chat' | 'files') => void;
  onClose: () => void;
}

function getSnippet(text: string, query: string, maxLen = 90): string {
  if (!text) return '';
  const lower = text.toLowerCase();
  const idx = lower.indexOf(query.toLowerCase());
  if (idx === -1) return text.slice(0, maxLen) + (text.length > maxLen ? '…' : '');
  const start = Math.max(0, idx - 20);
  const end = Math.min(text.length, idx + query.length + 50);
  return (start > 0 ? '…' : '') + text.slice(start, end) + (end < text.length ? '…' : '');
}

const META: Record<MatchType, { label: string; Icon: any; color: string }> = {
  title:       { label: 'タイトル',     Icon: FileText,      color: 'text-red-600 bg-red-50' },
  description: { label: '内容・説明',   Icon: FileText,      color: 'text-slate-600 bg-slate-100' },
  goal:        { label: '完了定義',     Icon: Target,        color: 'text-green-600 bg-green-50' },
  epic:        { label: 'エピック',     Icon: ChevronRight,  color: 'text-purple-600 bg-purple-50' },
  comment:     { label: 'チャット',     Icon: MessageSquare, color: 'text-blue-600 bg-blue-50' },
  progress:    { label: '進捗',         Icon: Activity,      color: 'text-orange-600 bg-orange-50' },
  attachment:  { label: '添付',         Icon: Paperclip,     color: 'text-teal-600 bg-teal-50' },
};

const TAB_MAP: Record<MatchType, 'basic' | 'chat' | 'files'> = {
  title: 'basic', description: 'basic', goal: 'basic', epic: 'basic',
  comment: 'chat', progress: 'chat',
  attachment: 'files',
};

export const ProjectSearch: React.FC<Props> = ({ tasks, onOpenTask, onClose }) => {
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const results = useMemo((): SearchResult[] => {
    const q = query.trim().toLowerCase();
    if (q.length < 1) return [];
    const found: SearchResult[] = [];

    for (const task of tasks) {
      if (task.isSoftDeleted) continue;

      // Ordered by relevance priority
      const checks: [MatchType, string | undefined][] = [
        ['title',       task.title],
        ['description', task.description],
        ['goal',        task.goal],
        ['epic',        task.project],
      ];
      let matched = false;
      for (const [type, text] of checks) {
        if (text?.toLowerCase().includes(q)) {
          found.push({ task, matchType: type, matchContext: getSnippet(text, q) });
          matched = true;
          break;
        }
      }
      if (matched) continue;

      // Comments
      const matchComment = task.comments?.find(c => c.content.toLowerCase().includes(q));
      if (matchComment) {
        found.push({ task, matchType: 'comment', matchContext: getSnippet(matchComment.content, q) });
        continue;
      }
      // Progress
      const matchProgress = task.progress?.find(p => p.content.toLowerCase().includes(q));
      if (matchProgress) {
        found.push({ task, matchType: 'progress', matchContext: getSnippet(matchProgress.content, q) });
        continue;
      }
      // Attachments
      const matchAttachment = task.attachments?.find(a => a.name.toLowerCase().includes(q));
      if (matchAttachment) {
        found.push({ task, matchType: 'attachment', matchContext: matchAttachment.name });
        continue;
      }
    }

    return found.slice(0, 60);
  }, [query, tasks]);

  return (
    <div
      className="fixed inset-0 z-[300] bg-slate-900/70 backdrop-blur-sm flex items-start justify-center p-4 pt-16"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-[2rem] w-full max-w-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-150"
        onClick={e => e.stopPropagation()}
      >
        {/* Search bar */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-slate-100">
          <Search className="w-5 h-5 text-slate-400 flex-shrink-0" />
          <input
            ref={inputRef}
            type="text"
            placeholder="タイトル・内容・チャット・添付ファイル名を全文検索..."
            value={query}
            onChange={e => setQuery(e.target.value)}
            className="flex-1 text-sm font-bold outline-none text-slate-800 placeholder-slate-300"
          />
          {query && (
            <button onClick={() => setQuery('')} className="p-1 hover:bg-slate-100 rounded-full transition-all">
              <X className="w-4 h-4 text-slate-400" />
            </button>
          )}
          <button onClick={onClose} className="p-1.5 hover:bg-slate-100 rounded-full transition-all ml-1" title="閉じる (Esc)">
            <X className="w-5 h-5 text-slate-500" />
          </button>
        </div>

        {/* Results */}
        <div className="max-h-[60vh] overflow-y-auto custom-scrollbar">
          {query.trim().length === 0 ? (
            <div className="py-12 text-center text-slate-400">
              <Search className="w-10 h-10 mx-auto mb-3 opacity-20" />
              <p className="text-sm font-bold">キーワードを入力してください</p>
              <p className="text-[11px] mt-1 font-bold opacity-70">タイトル・内容・完了定義・チャット・進捗・添付ファイル名を検索します</p>
            </div>
          ) : results.length === 0 ? (
            <div className="py-12 text-center text-slate-400">
              <p className="text-sm font-bold">「{query}」に一致するタスクが見つかりません</p>
            </div>
          ) : (
            <div className="p-3">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider px-2 pb-2">
                {results.length}件ヒット
              </p>
              {results.map((r, i) => {
                const m = META[r.matchType];
                const Icon = m.Icon;
                return (
                  <button
                    key={`${r.task.id}-${i}`}
                    onClick={() => { onOpenTask(r.task.id, TAB_MAP[r.matchType]); onClose(); }}
                    className="w-full flex items-start gap-3 px-3 py-3 rounded-xl hover:bg-slate-50 transition-all text-left group"
                  >
                    <div className={`flex-shrink-0 p-1.5 rounded-lg mt-0.5 ${m.color}`}>
                      <Icon className="w-3.5 h-3.5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                        <p className="text-xs font-black text-slate-800 group-hover:text-red-600 transition-colors">
                          {r.task.title}
                        </p>
                        {r.task.project && (
                          <span className="text-[9px] font-black text-purple-600 bg-purple-50 px-2 py-0.5 rounded-full flex-shrink-0">
                            {r.task.project}
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-400 font-bold line-clamp-1">{r.matchContext}</p>
                    </div>
                    <div className={`flex-shrink-0 text-[9px] font-black px-2 py-1 rounded-full self-start mt-0.5 ${m.color}`}>
                      {m.label}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ProjectSearch;
