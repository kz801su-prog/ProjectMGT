
import React from 'react';
import { Pin, PinOff, Calendar, Users, CheckCircle2, TrendingUp, MoreVertical, Star, Trash2, Edit2, Archive } from 'lucide-react';
import { ProjectMeta, GoalEpic, getProjectPeriodLabel } from '../portalTypes';

interface ProjectCardProps {
    project: ProjectMeta;
    onOpen: (projectId: string) => void;
    onTogglePin: (projectId: string) => void;
    onEdit: (project: ProjectMeta) => void;
    onDelete: (projectId: string) => void;
    isAdmin: boolean;
}

const ProjectCard: React.FC<ProjectCardProps> = ({
    project, onOpen, onTogglePin, onEdit, onDelete, isAdmin
}) => {
    const [showMenu, setShowMenu] = React.useState(false);
    const menuRef = React.useRef<HTMLDivElement>(null);

    React.useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
                setShowMenu(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const statusColors = {
        active: { bg: 'rgba(34, 197, 94, 0.15)', text: '#22c55e', label: '進行中' },
        completed: { bg: 'rgba(59, 130, 246, 0.15)', text: '#3b82f6', label: '完了' },
        archived: { bg: 'rgba(148, 163, 184, 0.15)', text: '#94a3b8', label: 'アーカイブ' },
    };

    const statusStyle = statusColors[project.status];
    const memberCount = project.members.length;
    const daysSinceUpdate = Math.floor((Date.now() - new Date(project.updatedAt).getTime()) / (1000 * 60 * 60 * 24));

    return (
        <div
            className="group relative rounded-[2rem] overflow-hidden cursor-pointer transition-all duration-300 hover:scale-[1.02] hover:shadow-2xl"
            style={{
                background: 'rgba(255,255,255,0.06)',
                border: '1px solid rgba(255,255,255,0.08)',
                backdropFilter: 'blur(20px)',
            }}
            onClick={() => onOpen(project.id)}
        >
            {/* カラーアクセント */}
            <div className="absolute top-0 left-0 right-0 h-1 opacity-80"
                style={{ background: `linear-gradient(90deg, ${project.color}, transparent)` }}
            />

            {/* ピン止めバッジ */}
            {project.isPinned && (
                <div className="absolute top-4 right-4 z-10">
                    <div className="w-8 h-8 rounded-xl flex items-center justify-center"
                        style={{ background: 'rgba(251, 191, 36, 0.2)' }}
                    >
                        <Pin className="w-4 h-4 text-amber-400" style={{ transform: 'rotate(45deg)' }} />
                    </div>
                </div>
            )}

            {/* メニュー */}
            {isAdmin && (
                <div className="absolute top-4 right-4 z-20" ref={menuRef}>
                    <button
                        onClick={e => { e.stopPropagation(); setShowMenu(!showMenu); }}
                        className="w-8 h-8 rounded-xl flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                        style={{ background: 'rgba(255,255,255,0.1)' }}
                    >
                        <MoreVertical className="w-4 h-4 text-slate-400" />
                    </button>
                    {showMenu && (
                        <div className="absolute top-10 right-0 w-48 rounded-2xl shadow-2xl overflow-hidden z-30"
                            style={{ background: '#1e293b', border: '1px solid rgba(255,255,255,0.1)' }}
                        >
                            <button
                                onClick={e => { e.stopPropagation(); onTogglePin(project.id); setShowMenu(false); }}
                                className="w-full px-4 py-3 text-left text-xs font-bold text-slate-300 hover:bg-white/5 flex items-center gap-3 transition-colors"
                            >
                                {project.isPinned ? <PinOff className="w-4 h-4 text-amber-400" /> : <Pin className="w-4 h-4 text-amber-400" />}
                                {project.isPinned ? 'ピン止め解除' : 'ピン止め'}
                            </button>
                            <button
                                onClick={e => { e.stopPropagation(); onEdit(project); setShowMenu(false); }}
                                className="w-full px-4 py-3 text-left text-xs font-bold text-slate-300 hover:bg-white/5 flex items-center gap-3 transition-colors"
                            >
                                <Edit2 className="w-4 h-4 text-blue-400" /> 編集
                            </button>
                            <button
                                onClick={e => { e.stopPropagation(); onDelete(project.id); setShowMenu(false); }}
                                className="w-full px-4 py-3 text-left text-xs font-bold text-red-400 hover:bg-red-500/10 flex items-center gap-3 transition-colors"
                            >
                                <Trash2 className="w-4 h-4" /> 削除
                            </button>
                        </div>
                    )}
                </div>
            )}

            {/* コンテンツ */}
            <div className="p-6 pt-8">
                {/* アイコン & タイトル */}
                <div className="flex items-start gap-4 mb-4">
                    <div className="w-14 h-14 rounded-2xl flex items-center justify-center text-2xl flex-shrink-0 shadow-lg"
                        style={{
                            background: `linear-gradient(135deg, ${project.color}22, ${project.color}44)`,
                            border: `1px solid ${project.color}33`,
                        }}
                    >
                        {project.icon}
                    </div>
                    <div className="flex-1 min-w-0">
                        <h3 className="text-lg font-black text-white truncate group-hover:text-red-400 transition-colors">
                            {project.name}
                        </h3>
                        {project.fiscalYear && (
                            <p className="text-[10px] font-black text-cyan-400 mt-0.5">
                                📅 {getProjectPeriodLabel(project.fiscalYear, project.halfPeriod)}
                            </p>
                        )}
                        <p className="text-xs text-slate-500 font-bold line-clamp-2 mt-1">
                            {project.description || 'プロジェクト説明なし'}
                        </p>
                    </div>
                </div>

                {/* ステータスバッジ */}
                <div className="flex items-center gap-2 mb-4">
                    <span className="px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider"
                        style={{ background: statusStyle.bg, color: statusStyle.text }}
                    >
                        {statusStyle.label}
                    </span>
                    {project.projectScore !== undefined && project.projectScore > 0 && (
                        <span className="px-3 py-1.5 rounded-xl text-[10px] font-black flex items-center gap-1"
                            style={{ background: 'rgba(251, 191, 36, 0.15)', color: '#fbbf24' }}
                        >
                            <Star className="w-3 h-3" /> {project.projectScore}点
                        </span>
                    )}
                </div>

                {/* 目標エピック配分バー */}
                {project.goalEpics && project.goalEpics.length > 0 && (
                    <div className="mb-4">
                        <p className="text-[9px] text-slate-500 font-bold uppercase mb-1.5">EPICS ({project.goalEpics.length})</p>
                        <div className="flex rounded-lg overflow-hidden h-2.5 mb-1.5" style={{ background: 'rgba(255,255,255,0.04)' }}>
                            {project.goalEpics.map((epic, idx) => {
                                const colors = ['#ef4444', '#f59e0b', '#22c55e', '#3b82f6', '#8b5cf6'];
                                return (
                                    <div key={epic.id}
                                        style={{
                                            width: `${epic.weight}%`,
                                            background: epic.status === 'completed'
                                                ? `${colors[idx % colors.length]}cc`
                                                : `${colors[idx % colors.length]}66`,
                                        }}
                                        title={`${epic.name}: ${epic.weight}%${epic.score ? ` (${epic.score}点)` : ''}`}
                                    />
                                );
                            })}
                        </div>
                        <div className="flex flex-wrap gap-x-3 gap-y-0.5">
                            {project.goalEpics.map((epic, idx) => {
                                const colors = ['#ef4444', '#f59e0b', '#22c55e', '#3b82f6', '#8b5cf6'];
                                return (
                                    <span key={epic.id} className="text-[8px] font-bold flex items-center gap-1" style={{ color: colors[idx % colors.length] }}>
                                        {epic.status === 'completed' ? '✓' : '•'} {epic.name} ({epic.weight}%)
                                    </span>
                                );
                            })}
                        </div>
                    </div>
                )}

                {/* メトリクス */}
                <div className="grid grid-cols-3 gap-3">
                    <div className="p-3 rounded-xl" style={{ background: 'rgba(255,255,255,0.04)' }}>
                        <p className="text-[9px] text-slate-500 font-bold uppercase mb-1">MEMBERS</p>
                        <div className="flex items-center gap-1.5">
                            <Users className="w-3.5 h-3.5 text-blue-400" />
                            <span className="text-sm font-black text-white">{memberCount}</span>
                        </div>
                    </div>
                    <div className="p-3 rounded-xl" style={{ background: 'rgba(255,255,255,0.04)' }}>
                        <p className="text-[9px] text-slate-500 font-bold uppercase mb-1">UPDATED</p>
                        <div className="flex items-center gap-1.5">
                            <Calendar className="w-3.5 h-3.5 text-green-400" />
                            <span className="text-sm font-black text-white">{daysSinceUpdate}日前</span>
                        </div>
                    </div>
                    <div className="p-3 rounded-xl" style={{ background: 'rgba(255,255,255,0.04)' }}>
                        <p className="text-[9px] text-slate-500 font-bold uppercase mb-1">SCORE</p>
                        <div className="flex items-center gap-1.5">
                            <TrendingUp className="w-3.5 h-3.5 text-amber-400" />
                            <span className="text-sm font-black text-white">{project.projectScore || '—'}</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* ホバーグロウ */}
            <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none rounded-[2rem]"
                style={{
                    background: `radial-gradient(circle at 50% 50%, ${project.color}08, transparent)`,
                }}
            />
        </div>
    );
};

export default ProjectCard;
