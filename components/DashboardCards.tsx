
import React from 'react';
import { DashboardStats } from '../types';

interface Props {
  stats: DashboardStats;
  onEpicClick?: () => void;
  onTotalClick?: () => void;
}

export const DashboardCards: React.FC<Props> = ({ stats, onEpicClick, onTotalClick }) => {
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4 mb-6">
      <div 
        className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 cursor-pointer hover:border-red-300 hover:bg-red-50/30 transition-all group"
        onClick={onEpicClick}
      >
        <p className="text-[10px] font-black text-red-500 uppercase tracking-widest mb-1 group-hover:text-red-600">エピック数</p>
        <p className="text-2xl font-bold text-red-600">{stats.epics}</p>
      </div>
      <div 
        className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 cursor-pointer hover:border-slate-400 transition-all group"
        onClick={onTotalClick}
      >
        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">タスク総数</p>
        <p className="text-2xl font-bold text-slate-900">
          {stats.total} <span className="text-sm font-medium text-slate-400">（{stats.rootCount}/{stats.subCount}）</span>
        </p>
      </div>
      <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200">
        <p className="text-[10px] font-black text-green-600 uppercase tracking-widest mb-1">完了済み</p>
        <p className="text-2xl font-bold text-green-700">{stats.completed}</p>
      </div>
      <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200">
        <p className="text-[10px] font-black text-amber-600 uppercase tracking-widest mb-1">進行中</p>
        <p className="text-2xl font-bold text-amber-700">{stats.pending}</p>
      </div>
      <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 col-span-2 md:col-span-1 lg:col-span-1">
        <p className="text-[10px] font-black text-rose-600 uppercase tracking-widest mb-1">期限切れ/遅延</p>
        <p className="text-2xl font-bold text-rose-700">{stats.overdue}</p>
      </div>
    </div>
  );
};
