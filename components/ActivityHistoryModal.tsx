
import React, { useMemo, useState } from 'react';
import { Task } from '../types';
import { X, MessageSquare, Activity, Paperclip, Clock, Search } from 'lucide-react';

interface ActivityEntry {
  id: string;
  timestamp: string;
  author: string;
  taskId: string;
  taskTitle: string;
  epicName: string;
  type: 'comment' | 'progress' | 'attachment';
  content: string;
}

interface Props {
  tasks: Task[];
  onClose: () => void;
  onTaskClick?: (taskId: string) => void;
}

const TYPE_CONFIG = {
  comment:    { icon: MessageSquare, color: 'text-blue-600',   bg: 'bg-blue-50',   label: 'コメント'     },
  progress:   { icon: Activity,      color: 'text-green-600',  bg: 'bg-green-50',  label: '進捗報告'     },
  attachment: { icon: Paperclip,     color: 'text-purple-600', bg: 'bg-purple-50', label: '添付ファイル' },
};

function formatDate(ts: string): string {
  try {
    const d = new Date(ts);
    if (isNaN(d.getTime())) return ts;
    return d.toLocaleString('ja-JP', {
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit',
    });
  } catch {
    return ts;
  }
}

export const ActivityHistoryModal: React.FC<Props> = ({ tasks, onClose, onTaskClick }) => {
  const [filter, setFilter] = useState<'all' | 'comment' | 'progress' | 'attachment'>('all');
  const [searchText, setSearchText] = useState('');

  const activities = useMemo<ActivityEntry[]>(() => {
    const entries: ActivityEntry[] = [];

    tasks.filter(t => !t.isSoftDeleted).forEach(task => {
      // コメント
      task.comments?.forEach(c => {
        entries.push({
          id: `comment-${c.id}`,
          timestamp: c.createdAt,
          author: c.author,
          taskId: task.id,
          taskTitle: task.title,
          epicName: task.project || '',
          type: 'comment',
          content: c.content,
        });
      });

      // 進捗報告
      task.progress?.forEach((p, i) => {
        entries.push({
          id: `progress-${task.id}-${i}`,
          timestamp: p.updatedAt,
          author: p.author,
          taskId: task.id,
          taskTitle: task.title,
          epicName: task.project || '',
          type: 'progress',
          content: p.content,
        });
      });

      // 添付ファイル
      task.attachments?.forEach(a => {
        entries.push({
          id: `attachment-${a.id}`,
          timestamp: a.addedAt,
          author: a.addedBy,
          taskId: task.id,
          taskTitle: task.title,
          epicName: task.project || '',
          type: 'attachment',
          content: a.name,
        });
      });
    });

    entries.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    return entries;
  }, [tasks]);

  const filtered = useMemo(() => {
    const q = searchText.toLowerCase();
    return activities
      .filter(a => filter === 'all' || a.type === filter)
      .filter(a => !q ||
        a.content.toLowerCase().includes(q) ||
        a.taskTitle.toLowerCase().includes(q) ||
        a.author.toLowerCase().includes(q) ||
        a.epicName.toLowerCase().includes(q)
      );
  }, [activities, filter, searchText]);

  return (
    <div className="fixed inset-0 z-[200] bg-slate-900/60 backdrop-blur-md flex items-center justify-center p-4">
      <div className="bg-white rounded-[2.5rem] w-full max-w-2xl shadow-2xl overflow-hidden animate-in zoom-in duration-200 max-h-[90vh] flex flex-col">

        {/* ヘッダー */}
        <div className="p-6 border-b flex justify-between items-center bg-slate-50/50 flex-shrink-0">
          <h2 className="font-black text-xl flex items-center gap-3 text-slate-800">
            <Clock className="w-6 h-6 text-slate-600" /> 更新履歴
          </h2>
          <button onClick={onClose} className="p-2 hover:bg-slate-200 rounded-full transition-all">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* フィルター */}
        <div className="bg-slate-50 border-b p-3 flex flex-wrap items-center gap-2 flex-shrink-0">
          {(['all', 'comment', 'progress', 'attachment'] as const).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`py-1.5 px-3 text-[10px] font-black uppercase tracking-widest transition-all rounded-lg ${
                filter === f ? 'bg-white text-red-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'
              }`}
            >
              {f === 'all' ? 'すべて' : TYPE_CONFIG[f].label}
            </button>
          ))}
          <div className="flex-1" />
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400" />
            <input
              type="text"
              placeholder="検索..."
              value={searchText}
              onChange={e => setSearchText(e.target.value)}
              className="pl-7 pr-3 py-1.5 text-[10px] font-bold border border-slate-200 rounded-lg outline-none focus:border-red-500 w-36 bg-white"
            />
          </div>
        </div>

        {/* タイムライン */}
        <div className="p-6 overflow-y-auto flex-1 custom-scrollbar">
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-slate-400 space-y-3">
              <Clock className="w-12 h-12 opacity-20" />
              <p className="font-bold text-sm">更新履歴がありません</p>
              <p className="text-xs">タスクにコメント・進捗・添付ファイルが追加されると表示されます</p>
            </div>
          ) : (
            <div className="space-y-1">
              {filtered.map((entry, i) => {
                const cfg = TYPE_CONFIG[entry.type];
                const Icon = cfg.icon;
                return (
                  <div key={entry.id} className="flex gap-3 group">
                    {/* アイコン + 縦線 */}
                    <div className="flex flex-col items-center flex-shrink-0">
                      <div className={`w-8 h-8 rounded-xl ${cfg.bg} flex items-center justify-center`}>
                        <Icon className={`w-4 h-4 ${cfg.color}`} />
                      </div>
                      {i < filtered.length - 1 && (
                        <div className="w-0.5 flex-1 bg-slate-100 my-1 min-h-[12px]" />
                      )}
                    </div>

                    {/* コンテンツ */}
                    <div className="flex-1 pb-4 min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5 mb-1.5">
                        <span className="text-xs font-black text-slate-700">{entry.author}</span>
                        <span className={`text-[9px] font-black px-2 py-0.5 rounded-full ${cfg.bg} ${cfg.color}`}>
                          {cfg.label}
                        </span>
                        <button
                          onClick={() => { onTaskClick?.(entry.taskId); onClose(); }}
                          className="text-[9px] font-black text-slate-400 hover:text-red-600 transition-colors underline underline-offset-2 truncate max-w-[180px] text-left"
                          title={entry.taskTitle}
                        >
                          {entry.taskTitle}
                        </button>
                        {entry.epicName && (
                          <span className="text-[9px] text-slate-400 font-bold">• {entry.epicName}</span>
                        )}
                      </div>
                      <p className="text-xs text-slate-600 font-medium leading-relaxed bg-slate-50 rounded-xl p-3 border border-slate-100 break-words">
                        {entry.content}
                      </p>
                      <p className="text-[9px] text-slate-400 font-bold mt-1.5">{formatDate(entry.timestamp)}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* フッター */}
        <div className="p-4 border-t bg-slate-50/50 flex-shrink-0 flex justify-between items-center">
          <span className="text-[10px] font-black text-slate-400">{filtered.length} 件 / 合計 {activities.length} 件</span>
          <button
            onClick={onClose}
            className="px-6 py-2.5 bg-slate-900 text-white rounded-xl font-black text-xs hover:bg-slate-800 transition-all"
          >
            閉じる
          </button>
        </div>
      </div>
    </div>
  );
};
