
import React, { useMemo, useState } from 'react';
import { Trophy, Medal, TrendingUp, ChevronDown, ChevronUp, Award, Target, BarChart3 } from 'lucide-react';
import { ProjectMeta, BenchmarkEntry, getHalfYearPeriods, getCurrentHalfYear } from '../portalTypes';
import { calculateBenchmark } from '../projectDataService';

interface BenchmarkViewProps {
    projects: ProjectMeta[];
}

const BenchmarkView: React.FC<BenchmarkViewProps> = ({ projects }) => {
    const periods = useMemo(() => getHalfYearPeriods(), []);
    const [selectedPeriod, setSelectedPeriod] = useState(getCurrentHalfYear().id);
    const [expandedMember, setExpandedMember] = useState<string | null>(null);

    const benchmark = useMemo(() =>
        calculateBenchmark(projects, selectedPeriod),
        [projects, selectedPeriod]
    );

    const maxPoints = useMemo(() =>
        Math.max(...benchmark.map(b => b.totalPoints), 1),
        [benchmark]
    );

    const getRankIcon = (rank: number) => {
        switch (rank) {
            case 1: return <Trophy className="w-5 h-5 text-amber-400" />;
            case 2: return <Medal className="w-5 h-5 text-slate-300" />;
            case 3: return <Medal className="w-5 h-5 text-amber-600" />;
            default: return <span className="text-sm font-black text-slate-500">#{rank}</span>;
        }
    };

    const getRankColor = (rank: number) => {
        switch (rank) {
            case 1: return { bg: 'rgba(251, 191, 36, 0.12)', border: 'rgba(251, 191, 36, 0.25)', glow: 'rgba(251, 191, 36, 0.1)' };
            case 2: return { bg: 'rgba(148, 163, 184, 0.12)', border: 'rgba(148, 163, 184, 0.25)', glow: 'rgba(148, 163, 184, 0.1)' };
            case 3: return { bg: 'rgba(217, 119, 6, 0.12)', border: 'rgba(217, 119, 6, 0.25)', glow: 'rgba(217, 119, 6, 0.1)' };
            default: return { bg: 'rgba(255,255,255,0.04)', border: 'rgba(255,255,255,0.08)', glow: 'transparent' };
        }
    };

    return (
        <div className="space-y-6">
            {/* ヘッダー */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-2xl flex items-center justify-center"
                        style={{ background: 'linear-gradient(135deg, rgba(251,191,36,0.2), rgba(245,158,11,0.2))' }}
                    >
                        <BarChart3 className="w-6 h-6 text-amber-400" />
                    </div>
                    <div>
                        <h2 className="text-xl font-black text-white">ベンチマーク</h2>
                        <p className="text-xs text-slate-500 font-bold">個人ポイントランキング</p>
                    </div>
                </div>

                {/* 半期選択 */}
                <select
                    value={selectedPeriod}
                    onChange={e => setSelectedPeriod(e.target.value)}
                    className="px-4 py-3 rounded-2xl text-sm font-bold text-white outline-none appearance-none cursor-pointer"
                    style={{
                        background: 'rgba(255,255,255,0.06)',
                        border: '1px solid rgba(255,255,255,0.1)',
                    }}
                >
                    {periods.map(p => (
                        <option key={p.id} value={p.id} style={{ background: '#1e293b' }}>
                            {p.label}
                        </option>
                    ))}
                </select>
            </div>

            {/* 計算式の説明 */}
            <div className="p-4 rounded-2xl flex items-center gap-3"
                style={{ background: 'rgba(99, 102, 241, 0.08)', border: '1px solid rgba(99, 102, 241, 0.15)' }}
            >
                <Target className="w-5 h-5 text-indigo-400 flex-shrink-0" />
                <p className="text-xs text-indigo-300 font-bold">
                    最終ポイント = 個人平均点 × プロジェクト評価点 ÷ 100 （例: 60点 × 80点 = 48ポイント）
                </p>
            </div>

            {/* ランキング */}
            {benchmark.length === 0 ? (
                <div className="text-center py-16">
                    <div className="w-20 h-20 rounded-3xl flex items-center justify-center mx-auto mb-4"
                        style={{ background: 'rgba(255,255,255,0.04)' }}
                    >
                        <Trophy className="w-10 h-10 text-slate-600" />
                    </div>
                    <p className="text-sm font-bold text-slate-500">データがありません</p>
                    <p className="text-xs text-slate-600 mt-1">プロジェクトの評価を完了するとランキングが表示されます</p>
                </div>
            ) : (
                <div className="space-y-3">
                    {benchmark.map(entry => {
                        const rankStyle = getRankColor(entry.rank);
                        const isExpanded = expandedMember === entry.memberName;
                        const barWidth = (entry.totalPoints / maxPoints) * 100;

                        return (
                            <div key={entry.memberName}>
                                <div
                                    className="p-5 rounded-2xl cursor-pointer transition-all duration-300 hover:scale-[1.01]"
                                    style={{
                                        background: rankStyle.bg,
                                        border: `1px solid ${rankStyle.border}`,
                                        boxShadow: `0 4px 20px ${rankStyle.glow}`,
                                    }}
                                    onClick={() => setExpandedMember(isExpanded ? null : entry.memberName)}
                                >
                                    <div className="flex items-center gap-4">
                                        {/* ランク */}
                                        <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                                            style={{ background: 'rgba(255,255,255,0.06)' }}
                                        >
                                            {getRankIcon(entry.rank)}
                                        </div>

                                        {/* 名前 */}
                                        <div className="flex-1 min-w-0">
                                            <h3 className="text-sm font-black text-white">{entry.memberName}</h3>
                                            <p className="text-[10px] text-slate-500 font-bold">
                                                {entry.projectBreakdown.length}プロジェクト参加
                                            </p>
                                        </div>

                                        {/* スコアバー */}
                                        <div className="flex-1 hidden md:block">
                                            <div className="h-3 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
                                                <div
                                                    className="h-full rounded-full transition-all duration-1000"
                                                    style={{
                                                        width: `${barWidth}%`,
                                                        background: `linear-gradient(90deg, ${entry.rank <= 3 ? '#fbbf24' : '#6366f1'}, ${entry.rank <= 3 ? '#f59e0b' : '#8b5cf6'})`,
                                                    }}
                                                />
                                            </div>
                                        </div>

                                        {/* ポイント */}
                                        <div className="text-right flex-shrink-0">
                                            <span className="text-2xl font-black text-white">{entry.totalPoints}</span>
                                            <span className="text-xs text-slate-500 font-bold ml-1">pt</span>
                                        </div>

                                        {/* 展開ボタン */}
                                        <div className="flex-shrink-0">
                                            {isExpanded
                                                ? <ChevronUp className="w-5 h-5 text-slate-500" />
                                                : <ChevronDown className="w-5 h-5 text-slate-500" />
                                            }
                                        </div>
                                    </div>
                                </div>

                                {/* 展開: プロジェクト別内訳 */}
                                {isExpanded && (
                                    <div className="mt-2 ml-6 space-y-2 animate-in slide-in-from-top-2">
                                        {entry.projectBreakdown.map(pp => (
                                            <div key={pp.projectId} className="p-4 rounded-xl flex items-center gap-4"
                                                style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}
                                            >
                                                <Award className="w-4 h-4 text-slate-500 flex-shrink-0" />
                                                <div className="flex-1">
                                                    <p className="text-xs font-bold text-slate-300">{pp.projectName}</p>
                                                    <p className="text-[10px] text-slate-500 font-bold">
                                                        {pp.taskCount}タスク参加
                                                    </p>
                                                </div>
                                                <div className="text-right space-y-0.5">
                                                    <div className="flex items-center gap-2 text-[10px] font-bold">
                                                        <span className="text-slate-500">個人点</span>
                                                        <span className="text-blue-400">{pp.averageIndividualScore}</span>
                                                        <span className="text-slate-600">×</span>
                                                        <span className="text-slate-500">PJ評価</span>
                                                        <span className="text-green-400">{pp.projectScore}</span>
                                                        <span className="text-slate-600">=</span>
                                                        <span className="text-amber-400 text-sm font-black">{pp.finalPoint}pt</span>
                                                    </div>
                                                </div>
                                            </div>
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
};

export default BenchmarkView;
