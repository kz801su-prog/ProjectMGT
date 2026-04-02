
import React, { useMemo } from 'react';
import { Task, MemberInfo, TaskStatus } from '../types';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  PieChart, Pie, Cell, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar
} from 'recharts';
import { Star, TrendingUp, Users, Target, Award } from 'lucide-react';

interface Props {
  tasks: Task[];
  members: MemberInfo[];
  onTaskClick?: (taskId: string) => void;
  viewMode?: 'all' | 'tasks-only';
  isAdmin?: boolean;
  currentUserName?: string;
  isTopPage?: boolean;
}

export const EvaluationView: React.FC<Props> = ({
  tasks,
  members,
  onTaskClick,
  viewMode = 'all',
  isAdmin = false,
  currentUserName = '',
  isTopPage = false
}) => {
  const completedTasks = useMemo(() => tasks.filter(t => !t.isSoftDeleted && t.status === TaskStatus.COMPLETED), [tasks]);
  const evaluatedTasks = useMemo(() => completedTasks.filter(t => t.evaluation && t.evaluation.memberEvaluations?.length > 0), [completedTasks]);

  const stats = useMemo(() => {
    const memberStats: Record<string, { total: number, count: number, avg: number }> = {};

    evaluatedTasks.forEach(task => {
      const evalData = task.evaluation!;
      const difficulty = evalData.difficulty || 0;
      const outcomeMult = (evalData.outcome || 0) / 5; // 1=0.2, 5=1.0

      evalData.memberEvaluations.forEach(me => {
        // Only include members that exist in the provided members list
        if (!members.find(m => m.name === me.memberId)) return;

        if (!memberStats[me.memberId]) {
          memberStats[me.memberId] = { total: 0, count: 0, avg: 0 };
        }
        // Formula: Difficulty * OutcomeMultiplier * (Rating / 5)
        // This gives a score out of 'Difficulty'
        const ratingMult = me.rating / 5;
        const score = difficulty * outcomeMult * ratingMult;

        memberStats[me.memberId].total += score;
        memberStats[me.memberId].count += 1;
      });
    });

    const data = Object.entries(memberStats)
      .filter(([name]) => isAdmin || name === currentUserName)
      .map(([name, s]) => ({
        name,
        total: parseFloat(s.total.toFixed(1)),
        avg: parseFloat((s.total / s.count).toFixed(2)),
        count: s.count
      })).sort((a, b) => b.total - a.total);

    const overallAvg = data.length > 0
      ? parseFloat((data.reduce((acc, curr) => acc + curr.avg, 0) / data.length).toFixed(2))
      : 0;

    return { data, overallAvg };
  }, [evaluatedTasks, isAdmin, currentUserName]);

  const personalStats = useMemo(() => {
    if (!currentUserName) return null;

    const userStat = stats.data.find(d => d.name === currentUserName);
    const userTasks = evaluatedTasks.filter(t => t.evaluation?.memberEvaluations.some(m => m.memberId === currentUserName));

    // 1. タスク量
    const avgTasks = members.length > 0 ? evaluatedTasks.length / members.length : 1;
    const volumeScore = Math.min(5, Math.max(1, 1 + 2 * (userTasks.length / (avgTasks || 1))));

    // 2. 成果物の品質
    const qualityScore = userStat ? userStat.avg : 3.0;

    // 3. コミュニケーション量
    let totalComms = 0;
    let userComms = 0;
    tasks.forEach(t => {
      t.comments?.forEach(c => {
        totalComms++;
        if (c.author === currentUserName) userComms++;
      });
      t.progress?.forEach(p => {
        totalComms++;
        if (p.author === currentUserName) userComms++;
      });
    });
    const avgComms = members.length > 0 ? totalComms / members.length : 1;
    const commScore = Math.min(5, Math.max(1, 1 + 2 * (userComms / (avgComms || 1))));

    // 4. 納期を守ったか
    const overdueCount = tasks.filter(t => t.status === TaskStatus.OVERDUE && t.responsiblePerson.includes(currentUserName)).length;
    const deadlineScore = Math.min(5, Math.max(1, 4.0 - (overdueCount * 0.5)));

    const radarData = [
      { subject: 'タスク量', A: parseFloat(volumeScore.toFixed(1)), fullMark: 5 },
      { subject: '納期遵守', A: parseFloat(deadlineScore.toFixed(1)), fullMark: 5 },
      { subject: '発信・報告', A: parseFloat(commScore.toFixed(1)), fullMark: 5 },
      { subject: '成果物品質', A: parseFloat(qualityScore.toFixed(1)), fullMark: 5 },
    ];

    return {
      totalPoints: userStat ? userStat.total : 0,
      evaluatedCount: userTasks.length,
      radarData,
      userTasks
    };
  }, [currentUserName, evaluatedTasks, stats, members, tasks]);

  const showPersonalView = isTopPage || !isAdmin;

  const COLORS = ['#ef4444', '#f97316', '#f59e0b', '#10b981', '#3b82f6', '#6366f1', '#8b5cf6', '#d946ef'];

  if (evaluatedTasks.length === 0 && viewMode === 'all') {
    return (
      <div className="bg-white rounded-[2rem] p-12 border border-slate-100 shadow-sm flex flex-col items-center justify-center text-slate-400 space-y-4">
        <Award className="w-16 h-16 opacity-20" />
        <p className="font-bold">評価データがまだありません</p>
        <p className="text-xs">完了したタスクの評価を行うとここに集計が表示されます</p>
      </div>
    );
  }

  if (showPersonalView) {
    if (!personalStats || personalStats.evaluatedCount === 0) {
      return (
        <div className="bg-white rounded-[2rem] p-12 border border-slate-100 shadow-sm flex flex-col items-center justify-center text-slate-400 space-y-4">
          <Award className="w-16 h-16 opacity-20" />
          <p className="font-bold">評価データがまだありません</p>
          <p className="text-xs">タスクが完了し評価されると、あなたのスコアが表示されます</p>
        </div>
      );
    }

    return (
      <div className="space-y-8 animate-in fade-in duration-500">
        <h2 className="text-2xl font-black text-slate-800 flex items-center gap-3 ml-2">
          <Award className="w-8 h-8 text-red-600" />
          {currentUserName} さんの個人評価レポート
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-white p-8 rounded-[2rem] border border-slate-100 shadow-sm flex flex-col justify-center text-center md:text-left">
            <h3 className="font-black text-sm text-slate-400 uppercase tracking-widest mb-2">獲得ポイント合計</h3>
            <p className="text-6xl font-black text-red-600 mb-8">{personalStats.totalPoints} <span className="text-xl text-slate-400">pt</span></p>

            <h3 className="font-black text-sm text-slate-400 uppercase tracking-widest mb-2">評価済みタスク数</h3>
            <p className="text-4xl font-black text-slate-800">{personalStats.evaluatedCount} <span className="text-xl text-slate-400">件</span></p>
          </div>

          <div className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm">
            <h3 className="font-black text-lg text-slate-800 mb-4 flex items-center gap-2">
              <Target className="w-5 h-5 text-red-600" /> スキルバランス (平均=3)
            </h3>
            <div className="h-[300px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <RadarChart cx="50%" cy="50%" outerRadius="65%" data={personalStats.radarData}>
                  <PolarGrid stroke="#e2e8f0" />
                  <PolarAngleAxis dataKey="subject" tick={{ fontSize: 12, fontWeight: 'bold', fill: '#64748b' }} />
                  <PolarRadiusAxis angle={30} domain={[0, 5]} tick={{ fontSize: 10, fill: '#94a3b8' }} />
                  <Radar
                    name={currentUserName}
                    dataKey="A"
                    stroke="#ef4444"
                    fill="#ef4444"
                    fillOpacity={0.4}
                  />
                  <Tooltip contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }} />
                </RadarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        <div className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm overflow-hidden">
          <h3 className="font-black text-lg text-slate-800 mb-6">個別のタスク評価</h3>
          <div className="space-y-3">
            {personalStats.userTasks.map(task => {
              const myEval = task.evaluation?.memberEvaluations?.find(me => me.memberId === currentUserName);
              if (!myEval) return null;

              return (
                <div
                  key={task.id}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onTaskClick?.(task.id);
                  }}
                  className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl border border-slate-100 hover:border-red-200 hover:bg-white transition-all cursor-pointer group"
                >
                  <div className="flex items-center gap-4 min-w-0">
                    <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center text-amber-600 flex-shrink-0">
                      <Star className="w-5 h-5 fill-amber-600" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-slate-700 truncate">{task.title}</p>
                      <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mt-0.5">
                        貢献度: <span className="text-amber-600 font-black">{myEval.rating}</span> / 難易度: {task.evaluation?.difficulty} / 成果: {task.evaluation?.outcome}
                      </p>
                    </div>
                  </div>
                  <div className="w-8 h-8 rounded-full bg-white border border-slate-200 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all">
                    <TrendingUp className="w-4 h-4 text-red-600" />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      {viewMode === 'all' && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 bg-red-50 rounded-xl flex items-center justify-center text-red-600"><Star className="w-5 h-5 fill-red-600" /></div>
                <h4 className="font-black text-xs text-slate-400 uppercase tracking-widest">評価済みタスク</h4>
              </div>
              <p className="text-4xl font-black text-slate-800">{evaluatedTasks.length}<span className="text-sm ml-2 text-slate-400">/ {completedTasks.length} 件</span></p>
            </div>
            <div className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 bg-amber-50 rounded-xl flex items-center justify-center text-amber-600"><TrendingUp className="w-5 h-5" /></div>
                <h4 className="font-black text-xs text-slate-400 uppercase tracking-widest">全体平均スコア</h4>
              </div>
              <p className="text-4xl font-black text-slate-800">{stats.overallAvg}<span className="text-sm ml-2 text-slate-400">/ 5.0</span></p>
            </div>
            <div className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center text-blue-600"><Users className="w-5 h-5" /></div>
                <h4 className="font-black text-xs text-slate-400 uppercase tracking-widest">評価対象人数</h4>
              </div>
              <p className="text-4xl font-black text-slate-800">{stats.data.length}<span className="text-sm ml-2 text-slate-400">名</span></p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <div className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm">
              <h3 className="font-black text-lg text-slate-800 mb-8 flex items-center gap-2">
                <Award className="w-5 h-5 text-red-600" /> 個人別合計スコア比較
              </h3>
              <div className="h-[400px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={stats.data} layout="vertical" margin={{ left: 40, right: 40 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
                    <XAxis type="number" hide />
                    <YAxis dataKey="name" type="category" width={80} tick={{ fontSize: 12, fontWeight: 'bold' }} axisLine={false} tickLine={false} />
                    <Tooltip
                      cursor={{ fill: '#f8fafc' }}
                      contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                    />
                    <Bar dataKey="total" name="合計スコア" radius={[0, 10, 10, 0]}>
                      {stats.data.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm">
              <h3 className="font-black text-lg text-slate-800 mb-8 flex items-center gap-2">
                <Target className="w-5 h-5 text-red-600" /> 平均スコア分布
              </h3>
              <div className="h-[400px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <RadarChart cx="50%" cy="50%" outerRadius="80%" data={stats.data}>
                    <PolarGrid stroke="#e2e8f0" />
                    <PolarAngleAxis dataKey="name" tick={{ fontSize: 10, fontWeight: 'bold', fill: '#64748b' }} />
                    <PolarRadiusAxis angle={30} domain={[0, 5]} />
                    <Radar
                      name="平均スコア"
                      dataKey="avg"
                      stroke="#ef4444"
                      fill="#ef4444"
                      fillOpacity={0.4}
                    />
                    <Tooltip contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }} />
                  </RadarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        </>
      )}

      <div className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm overflow-hidden">
        <h3 className="font-black text-lg text-slate-800 mb-6">タスク別評価状況 (完了タスク)</h3>
        <div className="space-y-3">
          {completedTasks.length === 0 ? (
            <p className="text-center py-8 text-slate-400 text-sm font-bold">完了したタスクはありません</p>
          ) : (
            completedTasks.map(task => {
              const isEvaluated = task.evaluation && task.evaluation.memberEvaluations?.length > 0;
              // Non-admins can only see evaluated tasks where they are involved
              if (!isAdmin && !isEvaluated) return null;
              if (!isAdmin && task.evaluation?.memberEvaluations.every(me => me.memberId !== currentUserName)) return null;

              return (
                <div
                  key={task.id}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onTaskClick?.(task.id);
                  }}
                  className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl border border-slate-100 hover:border-red-200 hover:bg-white transition-all cursor-pointer group"
                >
                  <div className="flex items-center gap-4 min-w-0">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${isEvaluated ? 'bg-amber-100 text-amber-600' : 'bg-slate-200 text-slate-400'}`}>
                      <Star className={`w-5 h-5 ${isEvaluated ? 'fill-amber-600' : ''}`} />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-slate-700 truncate">{task.title}</p>
                      <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">{task.responsiblePerson} • エピック: {task.project}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {isEvaluated ? (
                      <span className="text-[10px] font-black text-amber-600 bg-amber-50 px-3 py-1 rounded-full uppercase tracking-widest">評価済み</span>
                    ) : (
                      <span className="text-[10px] font-black text-slate-400 bg-slate-100 px-3 py-1 rounded-full uppercase tracking-widest">未評価</span>
                    )}
                    <div className="w-8 h-8 rounded-full bg-white border border-slate-200 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all">
                      <Award className="w-4 h-4 text-red-600" />
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {viewMode === 'all' && (
        <div className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm overflow-hidden">
          <h3 className="font-black text-lg text-slate-800 mb-6">個人別評価詳細</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-slate-100">
                  <th className="pb-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">メンバー</th>
                  <th className="pb-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">評価件数</th>
                  <th className="pb-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">合計スコア</th>
                  <th className="pb-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">平均スコア</th>
                  <th className="pb-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">パフォーマンス</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {stats.data.map((s, i) => (
                  <tr key={i} className="hover:bg-slate-50 transition-colors">
                    <td className="py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-[10px] font-black text-slate-500">{s.name.slice(0, 1)}</div>
                        <span className="text-sm font-bold text-slate-700">{s.name}</span>
                      </div>
                    </td>
                    <td className="py-4 text-sm font-bold text-slate-600">{s.count} 件</td>
                    <td className="py-4 text-sm font-black text-slate-800">{s.total} pt</td>
                    <td className="py-4 text-sm font-black text-red-600">{s.avg}</td>
                    <td className="py-4">
                      <div className="w-32 h-2 bg-slate-100 rounded-full overflow-hidden">
                        <div className="h-full bg-red-500" style={{ width: `${(s.avg / 5) * 100}%` }} />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
