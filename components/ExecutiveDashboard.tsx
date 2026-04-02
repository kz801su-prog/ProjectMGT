
import React, { useState, useMemo } from 'react';
import { BarChart3, Target, CheckCircle2, Clock, AlertCircle, TrendingUp, Users } from 'lucide-react';
import { ProjectMeta, GoalEpic, getHalfYearPeriods, getCurrentHalfYear } from '../portalTypes';
import { getProjectTasks, getProjectMembers } from '../projectDataService';
import { TaskStatus } from '../types';

interface ExecutiveDashboardProps {
    projects: ProjectMeta[];
}

interface DeptSummary {
    dept: string;
    projects: ProjectMeta[];
    activeCount: number;
    completedCount: number;
    totalTasks: number;
    completedTasks: number;
    overdueTasks: number;
    avgEpicScore: number | null;
    avgProjectScore: number | null;
}

function calcDeptSummary(dept: string, deptProjects: ProjectMeta[]): DeptSummary {
    let totalTasks = 0;
    let completedTasks = 0;
    let overdueTasks = 0;
    let epicScoreSum = 0;
    let epicScoreCount = 0;
    let projScoreSum = 0;
    let projScoreCount = 0;

    for (const proj of deptProjects) {
        const tasks = getProjectTasks(proj.id).filter(t => !t.isSoftDeleted);
        totalTasks += tasks.length;
        completedTasks += tasks.filter(t => t.status === TaskStatus.COMPLETED).length;
        overdueTasks += tasks.filter(t => t.status === TaskStatus.OVERDUE).length;

        if (proj.projectScore != null) {
            projScoreSum += proj.projectScore;
            projScoreCount++;
        }

        for (const ge of (proj.goalEpics || [])) {
            if (ge.totalScore != null) {
                epicScoreSum += ge.totalScore;
                epicScoreCount++;
            }
        }
    }

    return {
        dept,
        projects: deptProjects,
        activeCount: deptProjects.filter(p => p.status === 'active').length,
        completedCount: deptProjects.filter(p => p.status === 'completed').length,
        totalTasks,
        completedTasks,
        overdueTasks,
        avgEpicScore: epicScoreCount > 0 ? Math.round((epicScoreSum / epicScoreCount) * 10) / 10 : null,
        avgProjectScore: projScoreCount > 0 ? Math.round(projScoreSum / projScoreCount) : null,
    };
}

function scoreColor(score: number | null, max = 10): string {
    if (score == null) return '#64748b';
    const pct = score / max;
    if (pct >= 0.8) return '#22c55e';
    if (pct >= 0.6) return '#eab308';
    if (pct >= 0.4) return '#f97316';
    return '#ef4444';
}

function progressPct(completed: number, total: number): number {
    if (total === 0) return 0;
    return Math.round((completed / total) * 100);
}

const ExecutiveDashboard: React.FC<ExecutiveDashboardProps> = ({ projects }) => {
    const periods = useMemo(() => getHalfYearPeriods(), []);
    const currentPeriod = useMemo(() => getCurrentHalfYear(), []);
    const [selectedPeriodId, setSelectedPeriodId] = useState(currentPeriod.id);
    const [expandedDept, setExpandedDept] = useState<string | null>(null);
    const [expandedProject, setExpandedProject] = useState<string | null>(null);

    // Filter projects by selected period
    const filteredProjects = useMemo(() => {
        return projects.filter(p => {
            if (!p.fiscalYear || !p.halfPeriod) return true; // no period set → show all
            const id = `${p.fiscalYear}-${p.halfPeriod}`;
            return id === selectedPeriodId;
        });
    }, [projects, selectedPeriodId]);

    // Group by department
    const deptOrder = useMemo(() => {
        const order: string[] = [];
        const seen = new Set<string>();
        filteredProjects.forEach(p => {
            const key = p.department?.trim() || '(部署未設定)';
            if (!seen.has(key)) { seen.add(key); order.push(key); }
        });
        return order;
    }, [filteredProjects]);

    const deptMap = useMemo(() => {
        const map = new Map<string, ProjectMeta[]>();
        filteredProjects.forEach(p => {
            const key = p.department?.trim() || '(部署未設定)';
            if (!map.has(key)) map.set(key, []);
            map.get(key)!.push(p);
        });
        return map;
    }, [filteredProjects]);

    const deptSummaries = useMemo(() => {
        return deptOrder.map(dept => calcDeptSummary(dept, deptMap.get(dept) || []));
    }, [deptOrder, deptMap]);

    // Only show periods that have projects (or the current one)
    const relevantPeriods = useMemo(() => {
        const ids = new Set(projects.map(p => p.fiscalYear && p.halfPeriod ? `${p.fiscalYear}-${p.halfPeriod}` : null).filter(Boolean));
        return periods.filter(p => ids.has(p.id) || p.id === currentPeriod.id);
    }, [periods, projects, currentPeriod]);

    return (
        <div className="space-y-8">
            {/* Period selector */}
            <div className="flex flex-wrap gap-2">
                {relevantPeriods.map(period => (
                    <button
                        key={period.id}
                        onClick={() => setSelectedPeriodId(period.id)}
                        className={`px-4 py-2 rounded-xl text-xs font-black transition-all ${selectedPeriodId === period.id
                            ? 'text-white shadow-lg'
                            : 'text-slate-400 hover:text-slate-200'
                            }`}
                        style={selectedPeriodId === period.id
                            ? { background: 'linear-gradient(135deg, #7c3aed, #6d28d9)', boxShadow: '0 4px 20px rgba(124,58,237,0.3)' }
                            : { background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }
                        }
                    >
                        {period.label}
                        {period.id === currentPeriod.id && <span className="ml-1.5 text-[9px] opacity-70">▶ 現在</span>}
                    </button>
                ))}
            </div>

            {filteredProjects.length === 0 ? (
                <div className="text-center py-20 text-slate-500 font-bold">
                    <BarChart3 className="w-12 h-12 mx-auto mb-4 opacity-30" />
                    <p>この期間のプロジェクトはありません</p>
                </div>
            ) : (
                <>
                    {/* Department summary cards */}
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
                        {deptSummaries.map(summary => {
                            const taskPct = progressPct(summary.completedTasks, summary.totalTasks);
                            const isExpanded = expandedDept === summary.dept;
                            return (
                                <div key={summary.dept}
                                    className="rounded-[1.5rem] overflow-hidden cursor-pointer transition-all hover:scale-[1.01]"
                                    style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', boxShadow: '0 4px 20px rgba(0,0,0,0.3)' }}
                                    onClick={() => setExpandedDept(isExpanded ? null : summary.dept)}
                                >
                                    {/* Card header */}
                                    <div className="p-5">
                                        <div className="flex items-start justify-between mb-4">
                                            <div>
                                                <div className="flex items-center gap-2 mb-1">
                                                    <span className="text-[10px] font-black text-purple-400 uppercase tracking-widest">部署</span>
                                                </div>
                                                <h3 className="text-sm font-black text-white leading-tight">{summary.dept}</h3>
                                                <p className="text-[10px] text-slate-500 font-bold mt-0.5">
                                                    {summary.projects.length}プロジェクト · {summary.activeCount}件進行中
                                                </p>
                                            </div>
                                            <div className="text-right">
                                                {summary.avgEpicScore != null ? (
                                                    <div>
                                                        <div className="text-2xl font-black" style={{ color: scoreColor(summary.avgEpicScore, 10) }}>
                                                            {summary.avgEpicScore}
                                                        </div>
                                                        <div className="text-[9px] text-slate-500 font-bold">総合評価 /10</div>
                                                    </div>
                                                ) : (
                                                    <div className="text-xs text-slate-600 font-bold">未評価</div>
                                                )}
                                            </div>
                                        </div>

                                        {/* Task progress bar */}
                                        <div className="mb-3">
                                            <div className="flex justify-between text-[10px] font-bold text-slate-400 mb-1.5">
                                                <span className="flex items-center gap-1"><Target className="w-3 h-3" /> タスク進捗</span>
                                                <span>{summary.completedTasks}/{summary.totalTasks} ({taskPct}%)</span>
                                            </div>
                                            <div className="h-2 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.08)' }}>
                                                <div className="h-full rounded-full transition-all duration-500"
                                                    style={{
                                                        width: `${taskPct}%`,
                                                        background: taskPct >= 80 ? '#22c55e' : taskPct >= 50 ? '#eab308' : '#ef4444',
                                                    }}
                                                />
                                            </div>
                                        </div>

                                        {/* Stats row */}
                                        <div className="flex gap-3">
                                            <div className="flex items-center gap-1.5 text-[10px] font-bold text-green-400">
                                                <CheckCircle2 className="w-3.5 h-3.5" />
                                                <span>{summary.completedTasks}完了</span>
                                            </div>
                                            {summary.overdueTasks > 0 && (
                                                <div className="flex items-center gap-1.5 text-[10px] font-bold text-red-400">
                                                    <AlertCircle className="w-3.5 h-3.5" />
                                                    <span>{summary.overdueTasks}遅延</span>
                                                </div>
                                            )}
                                            {summary.avgProjectScore != null && (
                                                <div className="flex items-center gap-1.5 text-[10px] font-bold text-blue-400">
                                                    <TrendingUp className="w-3.5 h-3.5" />
                                                    <span>評価 {summary.avgProjectScore}/100</span>
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    {/* Expanded: project list */}
                                    {isExpanded && (
                                        <div className="px-5 pb-5 space-y-3" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}
                                            onClick={e => e.stopPropagation()}
                                        >
                                            <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest pt-3">プロジェクト詳細</p>
                                            {summary.projects.map(proj => {
                                                const tasks = getProjectTasks(proj.id).filter(t => !t.isSoftDeleted);
                                                const done = tasks.filter(t => t.status === TaskStatus.COMPLETED).length;
                                                const pct = progressPct(done, tasks.length);
                                                const isProjectExpanded = expandedProject === proj.id;
                                                return (
                                                    <div key={proj.id}
                                                        className="rounded-xl p-3 cursor-pointer transition-all hover:brightness-110"
                                                        style={{ background: 'rgba(255,255,255,0.04)', border: `1px solid ${proj.color}33` }}
                                                        onClick={() => setExpandedProject(isProjectExpanded ? null : proj.id)}
                                                    >
                                                        <div className="flex items-center justify-between mb-2">
                                                            <div className="flex items-center gap-2">
                                                                <span className="text-base">{proj.icon}</span>
                                                                <div>
                                                                    <p className="text-xs font-black text-white">{proj.name}</p>
                                                                    <p className="text-[9px] text-slate-500 font-bold">
                                                                        {proj.status === 'active' ? '進行中' : proj.status === 'completed' ? '完了' : 'アーカイブ'}
                                                                        {tasks.length > 0 ? ` · ${done}/${tasks.length}タスク` : ''}
                                                                    </p>
                                                                </div>
                                                            </div>
                                                            {proj.projectScore != null && (
                                                                <span className="text-sm font-black" style={{ color: scoreColor(proj.projectScore, 100) }}>
                                                                    {proj.projectScore}<span className="text-[9px] text-slate-500">/100</span>
                                                                </span>
                                                            )}
                                                        </div>

                                                        {/* Mini task bar */}
                                                        {tasks.length > 0 && (
                                                            <div className="h-1.5 rounded-full overflow-hidden mb-2" style={{ background: 'rgba(255,255,255,0.08)' }}>
                                                                <div className="h-full rounded-full"
                                                                    style={{ width: `${pct}%`, background: proj.color }}
                                                                />
                                                            </div>
                                                        )}

                                                        {/* GoalEpics */}
                                                        {isProjectExpanded && proj.goalEpics && proj.goalEpics.length > 0 && (
                                                            <div className="mt-2 space-y-1.5">
                                                                <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest">エピック評価</p>
                                                                {proj.goalEpics.map(ge => (
                                                                    <EpicRow key={ge.id} epic={ge} />
                                                                ))}
                                                            </div>
                                                        )}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>

                    {/* Full evaluation table */}
                    <EvaluationTable projects={filteredProjects} />
                </>
            )}
        </div>
    );
};

// Epic row in project detail
const EpicRow: React.FC<{ epic: GoalEpic }> = ({ epic }) => (
    <div className="flex items-center gap-2 py-1">
        <div className="flex-1 min-w-0">
            <p className="text-[10px] font-bold text-slate-300 truncate">{epic.name}</p>
            <p className="text-[9px] text-slate-500">重み {epic.weight}%</p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
            {epic.totalScore != null ? (
                <span className="text-sm font-black" style={{ color: scoreColor(epic.totalScore, 10) }}>
                    {epic.totalScore}<span className="text-[9px] text-slate-500">/10</span>
                </span>
            ) : (
                <span className="text-[10px] text-slate-600 font-bold">未評価</span>
            )}
            <div className="w-16 h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.08)' }}>
                {epic.totalScore != null && (
                    <div className="h-full rounded-full"
                        style={{ width: `${(epic.totalScore / 10) * 100}%`, background: scoreColor(epic.totalScore, 10) }}
                    />
                )}
            </div>
        </div>
    </div>
);

// Evaluation table for all epics across filtered projects
const EvaluationTable: React.FC<{ projects: ProjectMeta[] }> = ({ projects }) => {
    const rows = useMemo(() => {
        const result: Array<{
            projName: string;
            projIcon: string;
            projColor: string;
            dept: string;
            epicName: string;
            weight: number;
            totalScore: number | null;
            goal: string;
            status: string;
        }> = [];

        for (const proj of projects) {
            for (const ge of (proj.goalEpics || [])) {
                result.push({
                    projName: proj.name,
                    projIcon: proj.icon,
                    projColor: proj.color,
                    dept: proj.department?.trim() || '—',
                    epicName: ge.name,
                    weight: ge.weight,
                    totalScore: ge.totalScore ?? null,
                    goal: ge.goal || '',
                    status: ge.status,
                });
            }
        }
        return result;
    }, [projects]);

    if (rows.length === 0) return null;

    return (
        <div className="rounded-[1.5rem] overflow-hidden" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
            <div className="px-6 py-4" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                <h3 className="text-sm font-black text-white flex items-center gap-2">
                    <BarChart3 className="w-4 h-4 text-purple-400" />
                    エピック評価一覧
                </h3>
                <p className="text-[10px] text-slate-500 font-bold mt-0.5">{rows.length}件のエピック</p>
            </div>
            <div className="overflow-x-auto">
                <table className="w-full text-xs">
                    <thead>
                        <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                            {['部署', 'プロジェクト', 'エピック名', '重み', '総合評価', 'ゴール', 'ステータス'].map(h => (
                                <th key={h} className="px-4 py-3 text-left text-[10px] font-black text-slate-500 uppercase tracking-wider whitespace-nowrap">
                                    {h}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {rows.map((row, i) => (
                            <tr key={i}
                                className="transition-colors hover:bg-white/[0.02]"
                                style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}
                            >
                                <td className="px-4 py-3 text-slate-400 font-bold whitespace-nowrap">{row.dept}</td>
                                <td className="px-4 py-3 whitespace-nowrap">
                                    <div className="flex items-center gap-2">
                                        <span>{row.projIcon}</span>
                                        <span className="font-black text-white" style={{ color: row.projColor }}>{row.projName}</span>
                                    </div>
                                </td>
                                <td className="px-4 py-3 text-slate-300 font-bold max-w-[200px] truncate">{row.epicName}</td>
                                <td className="px-4 py-3 text-slate-400 font-bold whitespace-nowrap">{row.weight}%</td>
                                <td className="px-4 py-3 whitespace-nowrap">
                                    {row.totalScore != null ? (
                                        <div className="flex items-center gap-2">
                                            <span className="font-black text-base" style={{ color: scoreColor(row.totalScore, 10) }}>
                                                {row.totalScore}
                                            </span>
                                            <span className="text-slate-500">/10</span>
                                            <div className="w-12 h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.08)' }}>
                                                <div className="h-full rounded-full"
                                                    style={{ width: `${(row.totalScore / 10) * 100}%`, background: scoreColor(row.totalScore, 10) }}
                                                />
                                            </div>
                                        </div>
                                    ) : (
                                        <span className="text-slate-600 font-bold">未評価</span>
                                    )}
                                </td>
                                <td className="px-4 py-3 text-slate-400 font-bold max-w-[240px]">
                                    <p className="truncate">{row.goal || '—'}</p>
                                </td>
                                <td className="px-4 py-3 whitespace-nowrap">
                                    <span className={`px-2 py-1 rounded-lg text-[10px] font-black ${row.status === 'completed' ? 'text-green-400 bg-green-400/10' : 'text-blue-400 bg-blue-400/10'}`}>
                                        {row.status === 'completed' ? '完了' : '進行中'}
                                    </span>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

export default ExecutiveDashboard;
