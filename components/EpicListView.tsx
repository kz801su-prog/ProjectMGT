
import React, { useMemo } from 'react';
import { Task, TaskStatus } from '../types';
import { Briefcase, ChevronRight, CheckCircle2, Clock, AlertTriangle, TrendingUp } from 'lucide-react';

interface Props {
  tasks: Task[];
  epics: string[];
  onEpicClick: (epicName: string) => void;
  onClose: () => void;
}

export const EpicListView: React.FC<Props> = ({ tasks, epics, onEpicClick, onClose }) => {
  const epicStats = useMemo(() => {
    const stats: Record<string, {
      name: string,
      total: number,
      rootCount: number,
      subCount: number,
      completed: number,
      pending: number,
      overdue: number,
      lastUpdated: string
    }> = {};

    // Seed stats with defined epics so they appear even when no tasks exist yet
    epics.forEach(name => {
      if (name && name !== '未分類') {
        stats[name] = { name, total: 0, rootCount: 0, subCount: 0, completed: 0, pending: 0, overdue: 0, lastUpdated: '' };
      }
    });

    tasks.forEach(task => {
      const name = task.project || '未分類';
      if (!stats[name]) {
        stats[name] = { name, total: 0, rootCount: 0, subCount: 0, completed: 0, pending: 0, overdue: 0, lastUpdated: task.date };
      }

      const s = stats[name];
      s.total++;
      if (!s.lastUpdated) s.lastUpdated = task.date;

      // Only count active (non-completed) tasks in the root/sub breakdown
      if (task.status !== TaskStatus.COMPLETED) {
        if (task.hierarchyType === 'subtask') s.subCount++;
        else s.rootCount++;
      }

      if (task.status === TaskStatus.COMPLETED) s.completed++;
      else if (task.status === TaskStatus.IN_PROGRESS) s.pending++;

      const isOverdue = task.dueDate && new Date(task.dueDate) < new Date() && task.status !== TaskStatus.COMPLETED;
      if (isOverdue) s.overdue++;

      if (task.date && (!s.lastUpdated || new Date(task.date) > new Date(s.lastUpdated))) {
        s.lastUpdated = task.date;
      }
    });

    return Object.values(stats).sort((a, b) => b.total - a.total);
  }, [tasks, epics]);

  return (
    <div className="fixed inset-0 z-[200] bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-[2.5rem] w-full max-w-4xl max-h-[85vh] overflow-hidden shadow-2xl flex flex-col animate-in zoom-in duration-200">
        <div className="p-8 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-red-600 rounded-2xl flex items-center justify-center text-white shadow-lg">
              <Briefcase className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-2xl font-black text-slate-800">エピック・マスターリスト</h2>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">全プロジェクトの進捗状況と統計</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-3 bg-white border border-slate-200 rounded-xl text-slate-400 hover:text-red-600 transition-all shadow-sm"
          >
            閉じる
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {epicStats.map((epic) => {
              const progress = epic.total > 0 ? Math.round((epic.completed / epic.total) * 100) : 0;
              
              return (
                <div 
                  key={epic.name}
                  onClick={() => onEpicClick(epic.name)}
                  className="group bg-white border border-slate-100 rounded-3xl p-6 shadow-sm hover:shadow-xl hover:border-red-200 transition-all cursor-pointer flex flex-col"
                >
                  <div className="flex justify-between items-start mb-4">
                    <div className="flex-1 min-w-0">
                      <h3 className="text-lg font-black text-slate-800 truncate group-hover:text-red-600 transition-colors">{epic.name}</h3>
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">最終更新: {epic.lastUpdated}</p>
                    </div>
                    <div className="bg-red-50 text-red-600 px-3 py-1 rounded-full text-[10px] font-black">
                      {epic.total}（{epic.rootCount}/{epic.subCount}）Tasks
                    </div>
                  </div>

                  <div className="flex-1 space-y-4">
                    <div className="flex items-center gap-4">
                      <div className="flex-1 h-3 bg-slate-100 rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-gradient-to-r from-red-500 to-red-600 transition-all duration-1000"
                          style={{ width: `${progress}%` }}
                        />
                      </div>
                      <span className="text-sm font-black text-slate-700">{progress}%</span>
                    </div>

                    <div className="grid grid-cols-3 gap-2">
                      <div className="bg-emerald-50 p-3 rounded-2xl border border-emerald-100 flex flex-col items-center">
                        <CheckCircle2 className="w-4 h-4 text-emerald-500 mb-1" />
                        <span className="text-xs font-black text-emerald-700">{epic.completed}</span>
                        <span className="text-[8px] font-bold text-emerald-600/60 uppercase">完了</span>
                      </div>
                      <div className="bg-amber-50 p-3 rounded-2xl border border-amber-100 flex flex-col items-center">
                        <Clock className="w-4 h-4 text-amber-500 mb-1" />
                        <span className="text-xs font-black text-amber-700">{epic.pending}</span>
                        <span className="text-[8px] font-bold text-amber-600/60 uppercase">進行</span>
                      </div>
                      <div className="bg-rose-50 p-3 rounded-2xl border border-rose-100 flex flex-col items-center">
                        <AlertTriangle className="w-4 h-4 text-rose-500 mb-1" />
                        <span className="text-xs font-black text-rose-700">{epic.overdue}</span>
                        <span className="text-[8px] font-bold text-rose-600/60 uppercase">遅延</span>
                      </div>
                    </div>
                  </div>

                  <div className="mt-6 pt-4 border-t border-slate-50 flex justify-end">
                    <span className="text-[10px] font-black text-red-500 flex items-center gap-1 group-hover:translate-x-1 transition-transform">
                      詳細を見る <ChevronRight className="w-3 h-3" />
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="p-6 bg-slate-50 border-t border-slate-100 flex justify-between items-center">
          <div className="flex items-center gap-2 text-slate-400">
            <TrendingUp className="w-4 h-4" />
            <span className="text-[10px] font-bold uppercase tracking-widest">Total Epics: {epicStats.length}</span>
          </div>
          <p className="text-[10px] font-bold text-slate-400 italic">エピックをクリックすると、そのエピックに属するタスクのみを表示します</p>
        </div>
      </div>
    </div>
  );
};
