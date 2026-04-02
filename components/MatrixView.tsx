
import React from 'react';
import { Task, TaskStatus, TaskPriority } from '../types';
import { AlertTriangle, Star, Clock, Coffee, LayoutGrid } from 'lucide-react';

interface Props {
  tasks: Task[];
}

export const MatrixView: React.FC<Props> = ({ tasks }) => {
  // マトリクス分類ロジック
  const categorizeTasks = () => {
    const today = new Date();
    const nextWeek = new Date(today);
    nextWeek.setDate(today.getDate() + 7);

    const quadrants = {
      q1: [] as Task[], // 重要かつ緊急 (Do Now)
      q2: [] as Task[], // 重要だが緊急でない (Schedule)
      q3: [] as Task[], // 重要でないが緊急 (Delegate)
      q4: [] as Task[]  // 重要でなく緊急でない (Don't Do / Later)
    };

    tasks.filter(t => t.status !== TaskStatus.COMPLETED).forEach(task => {
      const isUrgent = task.dueDate ? new Date(task.dueDate) <= nextWeek : false;
      const isImportant = task.priority === TaskPriority.HIGH || task.isCommitted;

      if (isImportant && isUrgent) quadrants.q1.push(task);
      else if (isImportant && !isUrgent) quadrants.q2.push(task);
      else if (!isImportant && isUrgent) quadrants.q3.push(task);
      else quadrants.q4.push(task);
    });

    return quadrants;
  };

  const { q1, q2, q3, q4 } = categorizeTasks();

  const Quadrant = ({ title, icon, tasks, color, desc }: { title: string, icon: React.ReactNode, tasks: Task[], color: string, desc: string }) => (
    <div className={`rounded-[2.5rem] p-6 md:p-8 flex flex-col h-full border-2 ${color} bg-white shadow-sm hover:shadow-xl transition-all relative overflow-hidden group`}>
      <div className={`absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity scale-150`}>
        {icon}
      </div>
      <div className="flex items-center space-x-3 mb-2 z-10">
        <div className={`p-2 rounded-xl bg-white shadow-sm border`}>{icon}</div>
        <h4 className="font-black text-lg text-slate-800">{title}</h4>
      </div>
      <p className="text-[10px] font-bold text-slate-400 mb-6 uppercase tracking-widest z-10">{desc}</p>
      
      <div className="flex-1 overflow-y-auto custom-scrollbar space-y-3 pr-2 z-10">
        {tasks.length > 0 ? tasks.map(t => (
          <div key={t.id} className="bg-slate-50 p-4 rounded-2xl border border-slate-100 hover:border-slate-300 transition-all cursor-pointer">
            <div className="flex justify-between items-start mb-2">
              <span className="text-[9px] font-black uppercase px-2 py-1 rounded bg-white border border-slate-200 text-slate-500 tracking-wider">{t.dueDate ? t.dueDate.slice(5) : '期限なし'}</span>
              <span className="text-[9px] font-bold text-slate-400">{t.responsiblePerson}</span>
            </div>
            <p className="text-sm font-bold text-slate-700 line-clamp-2 leading-snug">{t.title}</p>
          </div>
        )) : (
          <div className="h-full flex items-center justify-center text-slate-300 font-bold text-sm italic">該当なし</div>
        )}
      </div>
      <div className="mt-4 pt-4 border-t border-slate-100 flex justify-between items-center z-10">
        <span className="text-xs font-black text-slate-400">Total</span>
        <span className="text-xl font-black text-slate-800">{tasks.length}</span>
      </div>
    </div>
  );

  return (
    <div className="h-full flex flex-col space-y-6">
      <div className="flex items-center space-x-3 px-2">
        <div className="w-10 h-10 bg-red-600 rounded-xl flex items-center justify-center shadow-lg"><LayoutGrid className="w-5 h-5 text-white" /></div>
        <div>
          <h3 className="text-xl font-black text-slate-800">優先順位マトリクス</h3>
          <p className="text-[10px] font-bold text-slate-400">アイゼンハワー・マトリクスによる戦略的分類</p>
        </div>
      </div>
      
      <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6 min-h-[600px]">
        {/* 重要かつ緊急 */}
        <Quadrant 
          title="最優先 (Do Now)" 
          icon={<AlertTriangle className="w-6 h-6 text-rose-500" />} 
          tasks={q1} 
          color="border-rose-100 hover:border-rose-300"
          desc="期限が近く、重要度が高い案件。直ちに着手してください。"
        />
        
        {/* 重要だが緊急でない */}
        <Quadrant 
          title="計画 (Schedule)" 
          icon={<Star className="w-6 h-6 text-emerald-500" />} 
          tasks={q2} 
          color="border-emerald-100 hover:border-emerald-300"
          desc="重要だが期限に余裕がある案件。確実に計画を立てて進行してください。"
        />
        
        {/* 緊急だが重要でない */}
        <Quadrant 
          title="委任/迅速処理 (Delegate)" 
          icon={<Clock className="w-6 h-6 text-amber-500" />} 
          tasks={q3} 
          color="border-amber-100 hover:border-amber-300"
          desc="期限が近いが重要度が低い案件。部下への委任や迅速な処理を検討。"
        />
        
        {/* 緊急でも重要でもない */}
        <Quadrant 
          title="保留/見直し (Review)" 
          icon={<Coffee className="w-6 h-6 text-slate-400" />} 
          tasks={q4} 
          color="border-slate-100 hover:border-slate-300"
          desc="優先度が低く期限も先。必要性を見直すか、後回しにしてください。"
        />
      </div>
    </div>
  );
};
