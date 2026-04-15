
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { X, UserPlus, Trash2, Shield, Users, Award, Star, Save, Download, Upload, Key, Loader2, Edit2, Check, RefreshCw, FileCode, Copy, AlertTriangle, BarChart3, TrendingUp, Target, FileSpreadsheet, ChevronDown, ChevronRight } from 'lucide-react';
import { PortalUser, ProjectMeta, getHalfYearPeriods, getCurrentHalfYear, getProjectPeriodLabel, getFiscalYearOptions } from '../portalTypes';
import { createFullBackup, restoreFromBackup, getProjectTasks, getProjectMembers, getGlobalTeamMembers, saveGlobalTeamMembers } from '../projectDataService';
import { fetchPortalUsers, savePortalUsers as savePortalUsersToSheet, PortalUserFromSheet } from '../mysqlService';
import { DEFAULT_GAS_URL } from '../constants';
import { TaskStatus, MemberInfo } from '../types';
import GAS_CODE from '../server/Code.js?raw';
import MemberManagement from './MemberManagement';

interface PortalSettingsProps {
    onClose: () => void;
    projects: ProjectMeta[];
    onUpdateProject: (project: ProjectMeta) => void;
    currentUser: PortalUser;
    gasUrl: string;
    onUpdateGasUrl: (url: string) => void;
}

// =========================================================
// ポータルレベルの個人評価計算ロジック
// =========================================================

interface MemberProjectScore {
    projectId: string;
    projectName: string;
    projectIcon: string;
    projectEvaluation: number; // 0-10 (プロジェクト評価)
    multiplier: number;        // projectEvaluation / 10
    rawPoints: number;         // プロジェクト内での個人ポイント合計
    finalPoints: number;       // rawPoints × multiplier
    taskCount: number;
}

interface MemberTotalScore {
    memberName: string;
    projectScores: MemberProjectScore[];
    totalFinalPoints: number;
}

function calculatePortalEvaluation(projects: ProjectMeta[]): MemberTotalScore[] {
    const memberMap: Record<string, MemberProjectScore[]> = {};

    for (const project of projects) {
        const tasks = getProjectTasks(project.id);
        const members = getProjectMembers(project.id);
        const projectEval = project.projectScore || 0; // 0-10
        const multiplier = projectEval / 10;

        // 完了＆評価済みタスクのみ
        const evaluatedTasks = tasks.filter(t =>
            !t.isSoftDeleted &&
            t.status === TaskStatus.COMPLETED &&
            t.evaluation &&
            t.evaluation.memberEvaluations?.length > 0
        );

        // メンバーごとにポイントを集計
        const memberPoints: Record<string, { total: number; count: number }> = {};

        for (const task of evaluatedTasks) {
            const evalData = task.evaluation!;
            const difficulty = evalData.difficulty || 0;
            const outcomeMult = (evalData.outcome || 0) / 5;

            for (const me of evalData.memberEvaluations) {
                if (!memberPoints[me.memberId]) {
                    memberPoints[me.memberId] = { total: 0, count: 0 };
                }
                const ratingMult = me.rating / 5;
                const score = difficulty * outcomeMult * ratingMult;
                memberPoints[me.memberId].total += score;
                memberPoints[me.memberId].count += 1;
            }
        }

        // メンバーマップに追加
        for (const [memberName, points] of Object.entries(memberPoints)) {
            if (!memberMap[memberName]) {
                memberMap[memberName] = [];
            }
            memberMap[memberName].push({
                projectId: project.id,
                projectName: project.name,
                projectIcon: project.icon,
                projectEvaluation: projectEval,
                multiplier,
                rawPoints: parseFloat(points.total.toFixed(1)),
                finalPoints: parseFloat((points.total * multiplier).toFixed(1)),
                taskCount: points.count,
            });
        }
    }

    // 合計を計算しソート
    const result: MemberTotalScore[] = Object.entries(memberMap).map(([name, scores]) => ({
        memberName: name,
        projectScores: scores,
        totalFinalPoints: parseFloat(scores.reduce((sum, s) => sum + s.finalPoints, 0).toFixed(1)),
    }));

    result.sort((a, b) => b.totalFinalPoints - a.totalFinalPoints);
    return result;
}

const PortalSettings: React.FC<PortalSettingsProps> = ({
    onClose, projects, onUpdateProject, currentUser, gasUrl, onUpdateGasUrl
}) => {
    const [activeTab, setActiveTab] = useState<'users' | 'team_members' | 'evaluation' | 'results' | 'backup' | 'gas' | 'goal_epics'>('users');
    const [teamMembers, setTeamMembers] = useState<MemberInfo[]>(() => getGlobalTeamMembers());
    const [expandedEpicDept, setExpandedEpicDept] = useState<string | null>(null);
    const [users, setUsers] = useState<PortalUserFromSheet[]>([]);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [editingIdx, setEditingIdx] = useState<number | null>(null);
    const [userSaveStatus, setUserSaveStatus] = useState<'idle' | 'success' | 'error'>('idle');
    const [userSaveErrorMsg, setUserSaveErrorMsg] = useState('');
    const [localGasUrl, setLocalGasUrl] = useState(gasUrl);
    const [gasCopied, setGasCopied] = useState(false);

    // 新規ユーザーフォーム
    const [newUser, setNewUser] = useState<PortalUserFromSheet>({
        employeeId: '', name: '', department: '', portalPassword: '', role: 'user'
    });

    const [selectedPeriod, setSelectedPeriod] = useState(getCurrentHalfYear().id);
    const periods = getHalfYearPeriods();
    const fiscalYears = useMemo(() => getFiscalYearOptions(), []);

    // 評価結果フィルタ: 年度・期の選択
    const [selectedEvalYears, setSelectedEvalYears] = useState<Set<number>>(() => {
        const currentYear = new Date().getFullYear();
        return new Set([currentYear]);
    });
    const [selectedEvalPeriods, setSelectedEvalPeriods] = useState<Set<string>>(new Set(['H1', 'H2']));

    // プロジェクトにある年度の一覧
    const availableYears = useMemo(() => {
        const years = new Set<number>();
        projects.forEach(p => { if (p.fiscalYear) years.add(p.fiscalYear); });
        return Array.from(years).sort((a, b) => b - a);
    }, [projects]);

    const effectiveGasUrl = gasUrl || DEFAULT_GAS_URL;

    // 評価結果の計算 (フィルタ適用)
    const filteredProjectsForEval = useMemo(() => {
        return projects.filter(p => {
            if (!p.fiscalYear) return selectedEvalYears.size === 0; // 年度未設定は選択なしの時のみ
            const yearMatch = selectedEvalYears.has(p.fiscalYear);
            const periodMatch = !p.halfPeriod || selectedEvalPeriods.has(p.halfPeriod);
            return yearMatch && periodMatch;
        });
    }, [projects, selectedEvalYears, selectedEvalPeriods]);

    const evaluationData = useMemo(() => calculatePortalEvaluation(filteredProjectsForEval), [filteredProjectsForEval]);

    const toggleEvalYear = (year: number) => {
        setSelectedEvalYears(prev => {
            const next = new Set(prev);
            if (next.has(year)) next.delete(year); else next.add(year);
            return next;
        });
    };

    const toggleEvalPeriod = (period: string) => {
        setSelectedEvalPeriods(prev => {
            const next = new Set(prev);
            if (next.has(period)) next.delete(period); else next.add(period);
            return next;
        });
    };

    // ユーザー読み込み
    const loadUsers = useCallback(async () => {
        setLoading(true);
        try {
            const fetched = await fetchPortalUsers(effectiveGasUrl);
            setUsers(fetched);
        } catch (e) {
            console.error("Failed to load portal users:", e);
        } finally {
            setLoading(false);
        }
    }, [effectiveGasUrl]);

    useEffect(() => {
        loadUsers();
    }, [loadUsers]);

    // SQL + localStorage への共通保存処理
    const persistUsers = useCallback(async (userList: PortalUserFromSheet[]) => {
        await savePortalUsersToSheet(effectiveGasUrl, userList);
        const local = userList.map(u => ({
            id: `user-${u.employeeId || u.name}`,
            name: u.name, role: u.role,
            password: u.portalPassword,
            department: u.department,
            employeeId: u.employeeId,
        }));
        localStorage.setItem('portal_users', JSON.stringify(local));
    }, [effectiveGasUrl]);

    // 明示的な保存ボタン
    const handleSaveUsersExplicit = useCallback(async () => {
        setSaving(true);
        setUserSaveStatus('idle');
        setUserSaveErrorMsg('');
        try {
            await persistUsers(users);
            setUserSaveStatus('success');
            setTimeout(() => setUserSaveStatus('idle'), 3000);
        } catch (e: any) {
            console.error("Failed to save portal users:", e);
            setUserSaveStatus('error');
            setUserSaveErrorMsg(e.message || '保存に失敗しました');
        } finally {
            setSaving(false);
        }
    }, [persistUsers, users]);

    // usersが変わったら自動保存（初回ロード時は除く、800msデバウンス）
    const isFirstLoad = useRef(true);
    useEffect(() => {
        if (isFirstLoad.current) { isFirstLoad.current = false; return; }
        if (users.length === 0) return;
        const timer = setTimeout(async () => {
            try {
                await persistUsers(users);
                setUserSaveStatus('success');
                setTimeout(() => setUserSaveStatus('idle'), 2000);
            } catch (e: any) {
                setUserSaveStatus('error');
                setUserSaveErrorMsg(e.message || '自動保存失敗');
            }
        }, 800);
        return () => clearTimeout(timer);
    }, [users, persistUsers]);

    const handleAddUser = () => {
        if (!newUser.name.trim()) return;
        setUsers([...users, { ...newUser }]);
        setNewUser({ employeeId: '', name: '', department: '', portalPassword: '', role: 'user' });
    };

    const handleDeleteUser = (idx: number) => {
        if (users[idx].name === currentUser.name) {
            alert('自分自身は削除できません');
            return;
        }
        setUsers(users.filter((_, i) => i !== idx));
    };

    const handleUpdateUser = (idx: number, updates: Partial<PortalUserFromSheet>) => {
        setUsers(users.map((u, i) => i === idx ? { ...u, ...updates } : u));
        setEditingIdx(null);
    };

    const handleBackupDownload = () => {
        const backup = createFullBackup();
        const blob = new Blob([backup], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `project_mgt_backup_${new Date().toISOString().split('T')[0]}.json`;
        a.click();
        URL.revokeObjectURL(url);
    };

    const handleBackupRestore = () => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';
        input.onchange = (e) => {
            const file = (e.target as HTMLInputElement).files?.[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = (ev) => {
                try {
                    restoreFromBackup(ev.target?.result as string);
                    alert('バックアップの復元が完了しました。ページを再読込してください。');
                    window.location.reload();
                } catch {
                    alert('バックアップの復元に失敗しました。');
                }
            };
            reader.readAsText(file);
        };
        input.click();
    };

    // グラフ用の色
    const CHART_COLORS = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#06b6d4', '#3b82f6', '#8b5cf6', '#ec4899'];

    const maxTotalPoints = useMemo(() =>
        Math.max(...evaluationData.map(d => d.totalFinalPoints), 1),
        [evaluationData]
    );

    // 目標エピック: goalEpicsを持つプロジェクトを部署別にグループ化
    const goalEpicGroups = useMemo(() => {
        const deptOrder: string[] = [];
        const deptMap = new Map<string, { title: string; epics: typeof projects[0]['goalEpics'] }[]>();
        projects.forEach(p => {
            if (!p.goalEpics || p.goalEpics.length === 0) return;
            const dept = p.department || p.name;
            if (!deptMap.has(dept)) { deptOrder.push(dept); deptMap.set(dept, []); }
            deptMap.get(dept)!.push({ title: p.evaluatorTitle || p.name, epics: p.goalEpics });
        });
        return deptOrder.map(dept => ({ dept, projects: deptMap.get(dept)! }));
    }, [projects]);

    // チームメンバー保存ハンドラ
    const handleSaveTeamMembers = useCallback((updated: MemberInfo[]) => {
        setTeamMembers(updated);
        saveGlobalTeamMembers(updated);
    }, []);

    // タブ定義
    const tabs = [
        { key: 'users' as const, label: 'ユーザー管理', icon: <Users className="w-4 h-4" /> },
        { key: 'team_members' as const, label: 'チームメンバー', icon: <UserPlus className="w-4 h-4" /> },
        { key: 'evaluation' as const, label: 'プロジェクト評価', icon: <Award className="w-4 h-4" /> },
        { key: 'results' as const, label: '評価結果', icon: <BarChart3 className="w-4 h-4" /> },
        { key: 'goal_epics' as const, label: '目標エピック', icon: <FileSpreadsheet className="w-4 h-4" /> },
        { key: 'gas' as const, label: 'GAS設定', icon: <FileCode className="w-4 h-4" /> },
        { key: 'backup' as const, label: 'バックアップ', icon: <Download className="w-4 h-4" /> },
    ];

    return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4"
            style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(12px)' }}
            onClick={onClose}
        >
            <div
                className="w-full max-w-5xl max-h-[90vh] flex flex-col rounded-[2.5rem] overflow-hidden shadow-2xl"
                style={{ background: '#0f172a', border: '1px solid rgba(255,255,255,0.08)' }}
                onClick={e => e.stopPropagation()}
            >
                {/* ヘッダー */}
                <div className="p-6 flex justify-between items-center flex-shrink-0"
                    style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}
                >
                    <h2 className="font-black text-lg text-white flex items-center gap-3">
                        <Shield className="w-5 h-5 text-red-400" /> ポータル設定
                    </h2>
                    <button onClick={onClose} className="p-2 rounded-xl hover:bg-white/5 transition-colors">
                        <X className="w-5 h-5 text-slate-500" />
                    </button>
                </div>

                {/* タブ - flex-wrap で折り返し */}
                <div className="px-4 py-2 flex flex-wrap gap-1" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                    {tabs.map(tab => (
                        <button
                            key={tab.key}
                            onClick={() => setActiveTab(tab.key)}
                            className="px-4 py-2.5 text-xs font-black flex items-center gap-2 transition-all relative rounded-lg"
                            style={{
                                color: activeTab === tab.key ? '#fff' : '#64748b',
                                background: activeTab === tab.key ? 'rgba(239,68,68,0.15)' : 'transparent',
                            }}
                        >
                            {tab.icon} {tab.label}
                        </button>
                    ))}
                </div>

                {/* コンテンツ */}
                <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar">

                    {/* ==================== ユーザー管理 ==================== */}
                    {activeTab === 'users' && (
                        <>
                            <div className="flex flex-col gap-3">
                                <div className="p-4 rounded-2xl flex items-center justify-between gap-3"
                                    style={{ background: 'rgba(59, 130, 246, 0.08)', border: '1px solid rgba(59, 130, 246, 0.15)' }}
                                >
                                    <div className="flex items-center gap-3">
                                        <Users className="w-5 h-5 text-blue-400 flex-shrink-0" />
                                        <p className="text-xs text-blue-300 font-bold">
                                            ユーザーは「portal_users」シートで管理されます。追加・編集後、「設定をまとめて保存」を押してください。
                                        </p>
                                    </div>
                                    <button onClick={loadUsers} className="p-2 rounded-xl text-blue-400 hover:bg-white/5 transition-colors flex-shrink-0" title="再読み込み">
                                        <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                                    </button>
                                </div>

                                <div className="flex items-center justify-between p-4 rounded-2xl"
                                    style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                                    <div className="flex-1">
                                        {userSaveStatus === 'success' && (
                                            <p className="text-xs font-bold text-green-400 flex items-center gap-2">
                                                <Check className="w-4 h-4" /> スプレッドシートに保存しました
                                            </p>
                                        )}
                                        {userSaveStatus === 'error' && (
                                            <p className="text-xs font-bold text-red-400 flex items-center gap-2">
                                                <AlertTriangle className="w-4 h-4" /> {userSaveErrorMsg}
                                            </p>
                                        )}
                                    </div>
                                    <button onClick={handleSaveUsersExplicit} disabled={loading || saving}
                                        className="px-6 py-3 rounded-xl text-sm font-black text-white transition-all active:scale-95 disabled:opacity-50 flex items-center gap-2 shadow-lg"
                                        style={{ background: 'linear-gradient(135deg, #22c55e, #16a34a)' }}
                                    >
                                        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                                        設定をまとめて保存
                                    </button>
                                </div>
                            </div>

                            {/* 新規ユーザー追加 */}
                            <div className="p-5 rounded-2xl space-y-4"
                                style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}
                            >
                                <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                                    <UserPlus className="w-4 h-4" /> 新規ユーザー追加
                                </h3>
                                <div className="grid grid-cols-1 md:grid-cols-6 gap-3">
                                    <input type="text" value={newUser.employeeId} onChange={e => setNewUser({ ...newUser, employeeId: e.target.value })} placeholder="社員ID"
                                        className="px-3 py-3 rounded-xl text-sm font-bold text-white outline-none" style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }} />
                                    <input type="text" value={newUser.name} onChange={e => setNewUser({ ...newUser, name: e.target.value })} placeholder="人名"
                                        className="px-3 py-3 rounded-xl text-sm font-bold text-white outline-none" style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }} />
                                    <input type="text" value={newUser.department} onChange={e => setNewUser({ ...newUser, department: e.target.value })} placeholder="部門"
                                        className="px-3 py-3 rounded-xl text-sm font-bold text-white outline-none" style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }} />
                                    <input type="text" value={newUser.portalPassword} onChange={e => setNewUser({ ...newUser, portalPassword: e.target.value })} placeholder="ポータルPW"
                                        className="px-3 py-3 rounded-xl text-sm font-bold text-white outline-none" style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }} />
                                    <select value={newUser.role} onChange={e => setNewUser({ ...newUser, role: e.target.value as any })}
                                        className="px-3 py-3 rounded-xl text-sm font-bold text-white outline-none appearance-none cursor-pointer" style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }}>
                                        <option value="admin" style={{ background: '#1e293b' }}>👑 Admin</option>
                                        <option value="manager" style={{ background: '#1e293b' }}>📋 Manager</option>
                                        <option value="user" style={{ background: '#1e293b' }}>👤 User</option>
                                    </select>
                                    <button onClick={handleAddUser} disabled={!newUser.name.trim()}
                                        className="px-4 py-3 rounded-xl text-sm font-black text-white transition-all active:scale-95 disabled:opacity-40" style={{ background: '#3b82f6' }}>追加</button>
                                </div>
                            </div>

                            {/* ユーザー一覧 */}
                            {loading ? (
                                <div className="flex items-center justify-center py-12"><Loader2 className="w-8 h-8 text-slate-500 animate-spin" /></div>
                            ) : (
                                <div className="space-y-2">
                                    <div className="grid grid-cols-6 gap-3 px-4 py-2">
                                        {['社員ID', '人名', '部門', 'ポータルPW', 'ロール', '操作'].map(h => (
                                            <span key={h} className="text-[9px] font-black text-slate-500 uppercase tracking-widest">{h}</span>
                                        ))}
                                    </div>
                                    {users.map((user, idx) => (
                                        <div key={`${user.employeeId}-${idx}`} className="p-4 rounded-2xl group"
                                            style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                                            {editingIdx === idx ? (
                                                <div className="grid grid-cols-6 gap-3">
                                                    <input type="text" defaultValue={user.employeeId} id={`edit-empid-${idx}`} className="px-2 py-2 rounded-lg text-xs font-bold text-white outline-none" style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)' }} />
                                                    <input type="text" defaultValue={user.name} id={`edit-name-${idx}`} className="px-2 py-2 rounded-lg text-xs font-bold text-white outline-none" style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)' }} />
                                                    <input type="text" defaultValue={user.department} id={`edit-dept-${idx}`} className="px-2 py-2 rounded-lg text-xs font-bold text-white outline-none" style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)' }} />
                                                    <input type="text" defaultValue={user.portalPassword} id={`edit-pw-${idx}`} className="px-2 py-2 rounded-lg text-xs font-bold text-white outline-none" style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)' }} />
                                                    <select defaultValue={user.role} id={`edit-role-${idx}`} className="px-2 py-2 rounded-lg text-xs font-bold text-white outline-none appearance-none cursor-pointer" style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)' }}>
                                                        <option value="admin" style={{ background: '#1e293b' }}>👑 Admin</option>
                                                        <option value="manager" style={{ background: '#1e293b' }}>📋 Manager</option>
                                                        <option value="user" style={{ background: '#1e293b' }}>👤 User</option>
                                                    </select>
                                                    <div className="flex items-center gap-1">
                                                        <button onClick={() => {
                                                            const empId = (document.getElementById(`edit-empid-${idx}`) as HTMLInputElement).value;
                                                            const name = (document.getElementById(`edit-name-${idx}`) as HTMLInputElement).value;
                                                            const dept = (document.getElementById(`edit-dept-${idx}`) as HTMLInputElement).value;
                                                            const pw = (document.getElementById(`edit-pw-${idx}`) as HTMLInputElement).value;
                                                            const role = (document.getElementById(`edit-role-${idx}`) as HTMLSelectElement).value;
                                                            handleUpdateUser(idx, { employeeId: empId, name, department: dept, portalPassword: pw, role: role as any });
                                                        }} className="p-2 rounded-lg text-green-400 hover:bg-green-500/10 transition-all"><Check className="w-4 h-4" /></button>
                                                        <button onClick={() => setEditingIdx(null)} className="p-2 rounded-lg text-slate-500 hover:bg-white/5 transition-all"><X className="w-4 h-4" /></button>
                                                    </div>
                                                </div>
                                            ) : (
                                                <div className="grid grid-cols-6 gap-3 items-center">
                                                    <span className="text-xs font-bold text-slate-400">{user.employeeId || '—'}</span>
                                                    <span className="text-xs font-bold text-white">
                                                        {user.name}
                                                        {user.name === currentUser.name && (<span className="ml-1 text-[8px] text-amber-400 font-black">(自分)</span>)}
                                                    </span>
                                                    <span className="text-xs font-bold text-slate-400">{user.department || '—'}</span>
                                                    <span className="text-xs font-bold text-slate-500">{'•'.repeat(user.portalPassword?.length || 0) || '—'}</span>
                                                    <span className="text-xs font-bold" style={{ color: user.role === 'admin' ? '#fbbf24' : user.role === 'manager' ? '#3b82f6' : '#94a3b8' }}>
                                                        {user.role === 'admin' ? '👑 Admin' : user.role === 'manager' ? '📋 Manager' : '👤 User'}
                                                    </span>
                                                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                        <button onClick={() => setEditingIdx(idx)} className="p-2 rounded-lg text-blue-400 hover:bg-blue-500/10 transition-all"><Edit2 className="w-3.5 h-3.5" /></button>
                                                        <button onClick={() => handleDeleteUser(idx)} className="p-2 rounded-lg text-red-400 hover:bg-red-500/10 transition-all" disabled={user.name === currentUser.name}><Trash2 className="w-3.5 h-3.5" /></button>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                    {users.length === 0 && !loading && (
                                        <div className="text-center py-8">
                                            <p className="text-sm font-bold text-slate-500">ユーザーが登録されていません</p>
                                        </div>
                                    )}
                                </div>
                            )}
                        </>
                    )}

                    {/* ==================== チームメンバー管理 ==================== */}
                    {activeTab === 'team_members' && (
                        <>
                            <div className="p-4 rounded-2xl flex items-start gap-3"
                                style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.15)' }}
                            >
                                <UserPlus className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
                                <div>
                                    <p className="text-xs text-red-300 font-black mb-1">チームメンバーマスター</p>
                                    <p className="text-xs text-red-300/70 font-bold leading-relaxed">
                                        ログインアカウントとは独立したメンバー一覧です。エピック・タスクの担当者選択に使われます。<br />
                                        CSVで一括インポートするか、手動で追加してください。毎期の獲得点数とプロジェクトごとの評価点数も記録できます。
                                    </p>
                                </div>
                            </div>
                            <MemberManagement
                                members={teamMembers}
                                onSave={handleSaveTeamMembers}
                                darkMode={true}
                            />
                        </>
                    )}

                    {/* ==================== プロジェクト評価 (0-10段階) ==================== */}
                    {activeTab === 'evaluation' && (
                        <>
                            {/* 説明 */}
                            <div className="p-4 rounded-2xl flex items-start gap-3"
                                style={{ background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.15)' }}
                            >
                                <Award className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
                                <div>
                                    <p className="text-xs text-amber-300 font-bold">
                                        各プロジェクトを0〜10段階で評価します。
                                    </p>
                                    <p className="text-[10px] text-amber-300/70 font-bold mt-1">
                                        評価「1」= ×0.1、「5」= ×0.5、「10」= ×1.0 の倍率が個人ポイントに掛けられます。<br/>
                                        例: 個人ポイント100点 × プロジェクト評価3 → 100 × 0.3 = 30ポイント
                                    </p>
                                </div>
                            </div>

                            {/* 半期選択 */}
                            <div className="flex items-center gap-3">
                                <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">対象期間</span>
                                <select
                                    value={selectedPeriod}
                                    onChange={e => setSelectedPeriod(e.target.value)}
                                    className="px-4 py-3 rounded-xl text-sm font-bold text-white outline-none appearance-none cursor-pointer"
                                    style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }}
                                >
                                    {periods.map(p => (
                                        <option key={p.id} value={p.id} style={{ background: '#1e293b' }}>{p.label}</option>
                                    ))}
                                </select>
                            </div>

                            {/* プロジェクト一覧 */}
                            <div className="space-y-4">
                                {projects.map(project => {
                                    const score = project.projectScore || 0;
                                    return (
                                        <div key={project.id} className="p-5 rounded-2xl"
                                            style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}
                                        >
                                            <div className="flex items-center gap-4 mb-4">
                                                <span className="text-2xl">{project.icon}</span>
                                                <div className="flex-1">
                                                    <h3 className="text-sm font-black text-white">{project.name}</h3>
                                                    <p className="text-[10px] text-slate-500 font-bold">
                                                        {getProjectPeriodLabel(project.fiscalYear, project.halfPeriod) && <span className="text-cyan-400 mr-2">{getProjectPeriodLabel(project.fiscalYear, project.halfPeriod)}</span>}
                                                        {project.status === 'active' ? '進行中' : project.status === 'completed' ? '完了' : 'アーカイブ'}
                                                    </p>
                                                </div>
                                                <div className="flex items-center gap-3">
                                                    <div className="text-center">
                                                        <div className="text-3xl font-black" style={{ color: score === 0 ? '#64748b' : score <= 3 ? '#ef4444' : score <= 6 ? '#f59e0b' : '#22c55e' }}>
                                                            {score}
                                                        </div>
                                                        <div className="text-[9px] font-black text-slate-500 uppercase">/ 10</div>
                                                    </div>
                                                    <div className="text-center px-3 py-1.5 rounded-lg" style={{ background: 'rgba(255,255,255,0.04)' }}>
                                                        <div className="text-xs font-black text-slate-400">×{(score / 10).toFixed(1)}</div>
                                                        <div className="text-[8px] font-black text-slate-600 uppercase">倍率</div>
                                                    </div>
                                                </div>
                                            </div>

                                            {/* スライダー 0-10 */}
                                            <div className="flex items-center gap-3">
                                                <span className="text-[10px] font-black text-slate-600 w-4 text-center">0</span>
                                                <input
                                                    type="range" min="0" max="10" step="1"
                                                    value={score}
                                                    onChange={e => {
                                                        onUpdateProject({
                                                            ...project,
                                                            projectScore: parseInt(e.target.value),
                                                            evaluationPeriod: selectedPeriod,
                                                        });
                                                    }}
                                                    className="flex-1 accent-amber-500 h-2"
                                                />
                                                <span className="text-[10px] font-black text-slate-600 w-6 text-center">10</span>
                                            </div>

                                            {/* 数値ボタン */}
                                            <div className="flex gap-1.5 mt-3">
                                                {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(n => (
                                                    <button
                                                        key={n}
                                                        onClick={() => onUpdateProject({ ...project, projectScore: n, evaluationPeriod: selectedPeriod })}
                                                        className="flex-1 py-1.5 rounded-lg text-[10px] font-black transition-all"
                                                        style={{
                                                            background: score === n ? (n <= 3 ? '#ef4444' : n <= 6 ? '#f59e0b' : '#22c55e') : 'rgba(255,255,255,0.04)',
                                                            color: score === n ? '#fff' : '#64748b',
                                                        }}
                                                    >
                                                        {n}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </>
                    )}

                    {/* ==================== 評価結果 (全プロジェクト横断グラフ) ==================== */}
                    {activeTab === 'results' && (
                        <>
                            {/* 説明 */}
                            <div className="p-4 rounded-2xl flex items-start gap-3"
                                style={{ background: 'rgba(99, 102, 241, 0.08)', border: '1px solid rgba(99, 102, 241, 0.15)' }}
                            >
                                <BarChart3 className="w-5 h-5 text-indigo-400 flex-shrink-0 mt-0.5" />
                                <div>
                                    <p className="text-xs text-indigo-300 font-bold">
                                        全プロジェクト横断の個人評価ランキングです。
                                    </p>
                                    <p className="text-[10px] text-indigo-300/70 font-bold mt-1">
                                        計算式: 各プロジェクトの個人ポイント × プロジェクト評価倍率 → 全プロジェクト合算
                                    </p>
                                </div>
                            </div>

                            {/* フィルタUI */}
                            <div className="p-4 rounded-2xl space-y-4" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
                                <div>
                                    <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">表示する年度を選択</h4>
                                    <div className="flex flex-wrap gap-2">
                                        {(availableYears.length > 0 ? availableYears : fiscalYears).map(year => (
                                            <button
                                                key={`year-${year}`}
                                                onClick={() => toggleEvalYear(year)}
                                                className="px-4 py-2 rounded-xl text-xs font-bold transition-all"
                                                style={{
                                                    background: selectedEvalYears.has(year) ? 'linear-gradient(135deg, #10b981, #059669)' : 'rgba(255,255,255,0.04)',
                                                    color: selectedEvalYears.has(year) ? '#fff' : '#64748b'
                                                }}
                                            >
                                                {selectedEvalYears.has(year) && <Check className="w-3 h-3 inline-block mr-1 -mt-0.5" />}
                                                {year}年度
                                            </button>
                                        ))}
                                    </div>
                                </div>
                                <div>
                                    <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">表示する期を選択</h4>
                                    <div className="flex flex-wrap gap-2">
                                        <button
                                            onClick={() => toggleEvalPeriod('H1')}
                                            className="px-4 py-2 rounded-xl text-xs font-bold transition-all"
                                            style={{
                                                background: selectedEvalPeriods.has('H1') ? 'linear-gradient(135deg, #3b82f6, #2563eb)' : 'rgba(255,255,255,0.04)',
                                                color: selectedEvalPeriods.has('H1') ? '#fff' : '#64748b'
                                            }}
                                        >
                                            {selectedEvalPeriods.has('H1') && <Check className="w-3 h-3 inline-block mr-1 -mt-0.5" />}
                                            上半期
                                        </button>
                                        <button
                                            onClick={() => toggleEvalPeriod('H2')}
                                            className="px-4 py-2 rounded-xl text-xs font-bold transition-all"
                                            style={{
                                                background: selectedEvalPeriods.has('H2') ? 'linear-gradient(135deg, #3b82f6, #2563eb)' : 'rgba(255,255,255,0.04)',
                                                color: selectedEvalPeriods.has('H2') ? '#fff' : '#64748b'
                                            }}
                                        >
                                            {selectedEvalPeriods.has('H2') && <Check className="w-3 h-3 inline-block mr-1 -mt-0.5" />}
                                            下半期
                                        </button>
                                    </div>
                                </div>
                            </div>

                            {evaluationData.length === 0 ? (
                                <div className="text-center py-16">
                                    <div className="w-20 h-20 rounded-3xl flex items-center justify-center mx-auto mb-4"
                                        style={{ background: 'rgba(255,255,255,0.04)' }}
                                    >
                                        <BarChart3 className="w-10 h-10 text-slate-600" />
                                    </div>
                                    <p className="text-sm font-bold text-slate-500">評価データがありません</p>
                                    <p className="text-xs text-slate-600 mt-1">プロジェクト内でタスクの評価を完了するとここに集計されます</p>
                                </div>
                            ) : (
                                <>
                                    {/* 棒グラフ風ランキング */}
                                    <div className="space-y-3">
                                        <h3 className="text-sm font-black text-white flex items-center gap-2">
                                            <TrendingUp className="w-4 h-4 text-amber-400" /> 個人ポイントランキング
                                        </h3>
                                        {evaluationData.map((entry, idx) => {
                                            const barWidth = Math.max(5, (entry.totalFinalPoints / maxTotalPoints) * 100);
                                            const color = CHART_COLORS[idx % CHART_COLORS.length];
                                            return (
                                                <div key={entry.memberName} className="p-4 rounded-2xl"
                                                    style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}
                                                >
                                                    <div className="flex items-center gap-4 mb-2">
                                                        <div className="w-8 h-8 rounded-xl flex items-center justify-center text-sm font-black"
                                                            style={{
                                                                background: idx === 0 ? 'rgba(251,191,36,0.2)' : idx === 1 ? 'rgba(148,163,184,0.2)' : idx === 2 ? 'rgba(217,119,6,0.2)' : 'rgba(255,255,255,0.06)',
                                                                color: idx === 0 ? '#fbbf24' : idx === 1 ? '#94a3b8' : idx === 2 ? '#d97706' : '#64748b',
                                                            }}
                                                        >
                                                            {idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : `#${idx + 1}`}
                                                        </div>
                                                        <span className="text-sm font-black text-white flex-1">{entry.memberName}</span>
                                                        <span className="text-2xl font-black text-white">{entry.totalFinalPoints}</span>
                                                        <span className="text-xs font-bold text-slate-500">pt</span>
                                                    </div>
                                                    {/* バー */}
                                                    <div className="h-4 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.04)' }}>
                                                        <div className="h-full rounded-full transition-all duration-700"
                                                            style={{ width: `${barWidth}%`, background: `linear-gradient(90deg, ${color}, ${color}aa)` }} />
                                                    </div>
                                                    {/* プロジェクト内訳 */}
                                                    <div className="flex flex-wrap gap-2 mt-3">
                                                        {entry.projectScores.map(ps => (
                                                            <div key={ps.projectId} className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-bold"
                                                                style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}
                                                            >
                                                                <span>{ps.projectIcon}</span>
                                                                <span className="text-slate-400">{ps.projectName}</span>
                                                                <span className="text-slate-600">|</span>
                                                                <span className="text-slate-500">{ps.rawPoints}pt</span>
                                                                <span className="text-slate-600">×{ps.multiplier.toFixed(1)}</span>
                                                                <span className="text-slate-600">=</span>
                                                                <span className="text-amber-400 font-black">{ps.finalPoints}pt</span>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>

                                    {/* テーブル */}
                                    <div className="p-5 rounded-2xl" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                                        <h3 className="text-sm font-black text-white mb-4 flex items-center gap-2">
                                            <Target className="w-4 h-4 text-red-400" /> プロジェクト別倍率一覧
                                        </h3>
                                        <div className="overflow-x-auto">
                                            <table className="w-full text-left">
                                                <thead>
                                                    <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                                                        <th className="pb-3 text-[9px] font-black text-slate-500 uppercase tracking-widest">プロジェクト</th>
                                                        <th className="pb-3 text-[9px] font-black text-slate-500 uppercase tracking-widest text-center">評価 (0-10)</th>
                                                        <th className="pb-3 text-[9px] font-black text-slate-500 uppercase tracking-widest text-center">倍率</th>
                                                        <th className="pb-3 text-[9px] font-black text-slate-500 uppercase tracking-widest text-center">対象期間</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {projects.map(p => (
                                                        <tr key={p.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                                                            <td className="py-3">
                                                                <div className="flex items-center gap-2">
                                                                    <span className="text-lg">{p.icon}</span>
                                                                    <span className="text-xs font-bold text-white">{p.name}</span>
                                                                </div>
                                                            </td>
                                                            <td className="py-3 text-center">
                                                                <span className="text-sm font-black" style={{ color: (p.projectScore || 0) <= 3 ? '#ef4444' : (p.projectScore || 0) <= 6 ? '#f59e0b' : '#22c55e' }}>
                                                                    {p.projectScore || 0}
                                                                </span>
                                                            </td>
                                                            <td className="py-3 text-center text-xs font-bold text-slate-400">
                                                                ×{((p.projectScore || 0) / 10).toFixed(1)}
                                                            </td>
                                                            <td className="py-3 text-center text-[10px] font-bold text-slate-500">
                                                                {p.evaluationPeriod || '—'}
                                                            </td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>
                                </>
                            )}
                        </>
                    )}

                    {/* ==================== GAS設定 ==================== */}
                    {activeTab === 'gas' && (
                        <div className="space-y-4">
                            <div className="p-6 rounded-2xl space-y-4"
                                style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}
                            >
                                <h3 className="text-sm font-black text-white flex items-center gap-2">
                                    <FileCode className="w-4 h-4 text-emerald-400" /> GASサーバーURL設定
                                </h3>
                                <p className="text-xs text-slate-400 font-bold mb-2">
                                    Google Apps Script（ウェブアプリとして公開したURL）を入力して保存してください。
                                </p>
                                <div className="flex gap-2">
                                    <input type="text" value={localGasUrl} onChange={e => setLocalGasUrl(e.target.value)}
                                        className="flex-1 px-4 py-3 rounded-xl text-sm font-bold text-white outline-none"
                                        style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }}
                                        placeholder="https://script.google.com/macros/s/..." />
                                    <button onClick={() => { if (localGasUrl) { onUpdateGasUrl(localGasUrl); alert('GAS URLを保存しました'); } }}
                                        className="px-6 py-3 rounded-xl text-sm font-black text-white transition-all active:scale-95 flex items-center gap-2"
                                        style={{ background: 'linear-gradient(135deg, #10b981, #059669)' }}>
                                        <Save className="w-4 h-4" /> 保存
                                    </button>
                                </div>
                            </div>
                            <div className="p-6 rounded-2xl space-y-4"
                                style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}
                            >
                                <div className="flex items-center justify-between">
                                    <h3 className="text-sm font-black text-white flex items-center gap-2">
                                        <FileCode className="w-4 h-4 text-blue-400" /> Google Apps Script コード
                                    </h3>
                                    <button onClick={() => { navigator.clipboard.writeText(GAS_CODE); setGasCopied(true); setTimeout(() => setGasCopied(false), 2000); }}
                                        className="px-4 py-2 rounded-lg text-xs font-black text-white transition-all flex items-center gap-2"
                                        style={{ background: 'rgba(59, 130, 246, 0.2)', border: '1px solid rgba(59, 130, 246, 0.4)' }}>
                                        {gasCopied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                                        {gasCopied ? 'コピーしました' : 'コードをコピー'}
                                    </button>
                                </div>
                                <textarea readOnly value={GAS_CODE}
                                    className="w-full h-64 px-4 py-3 rounded-xl text-[10px] font-mono text-emerald-300 outline-none resize-y custom-scrollbar"
                                    style={{ background: '#020617', border: '1px solid rgba(255,255,255,0.1)' }} />
                            </div>
                        </div>
                    )}

                    {/* ==================== 目標エピック ==================== */}
                    {activeTab === 'goal_epics' && (
                        <div className="space-y-4">
                            <div className="flex items-center gap-2 mb-2">
                                <FileSpreadsheet className="w-4 h-4 text-amber-400" />
                                <span className="text-sm font-black text-white">目標ファイルから生成されたエピック一覧</span>
                                <span className="text-[10px] text-slate-500 font-bold ml-auto">
                                    {goalEpicGroups.reduce((s, g) => s + g.projects.reduce((ss, p) => ss + (p.epics?.length || 0), 0), 0)} エピック
                                </span>
                            </div>

                            {goalEpicGroups.length === 0 ? (
                                <div className="text-center py-12 rounded-2xl"
                                    style={{ background: 'rgba(255,255,255,0.02)', border: '1px dashed rgba(255,255,255,0.08)' }}
                                >
                                    <FileSpreadsheet className="w-10 h-10 text-slate-600 mx-auto mb-3" />
                                    <p className="text-sm font-black text-slate-500">目標ファイルがまだアップロードされていません</p>
                                    <p className="text-xs text-slate-600 font-bold mt-1">TOP画面の「目標ファイル」ボタンからExcelをアップロードしてください</p>
                                </div>
                            ) : (
                                <div className="space-y-4">
                                    {goalEpicGroups.map(({ dept, projects: deptProjects }) => {
                                        const isOpen = expandedEpicDept === dept || expandedEpicDept === null;
                                        return (
                                            <div key={dept} className="rounded-2xl overflow-hidden"
                                                style={{ border: '1px solid rgba(139,92,246,0.3)', background: 'rgba(139,92,246,0.04)' }}
                                            >
                                                {/* 部署ヘッダ */}
                                                <button
                                                    className="w-full flex items-center gap-3 px-5 py-3 text-left"
                                                    style={{ borderBottom: isOpen ? '1px solid rgba(139,92,246,0.2)' : 'none' }}
                                                    onClick={() => setExpandedEpicDept(expandedEpicDept === dept ? null : dept)}
                                                >
                                                    {isOpen
                                                        ? <ChevronDown className="w-4 h-4 text-violet-400 flex-shrink-0" />
                                                        : <ChevronRight className="w-4 h-4 text-violet-400 flex-shrink-0" />
                                                    }
                                                    <span className="text-sm font-black text-white">🏢 {dept}</span>
                                                    <span className="text-[10px] text-violet-300 font-bold ml-auto">
                                                        {deptProjects.length}役職 / {deptProjects.reduce((s, p) => s + (p.epics?.length || 0), 0)}エピック
                                                    </span>
                                                </button>

                                                {/* 役職別エピック一覧 */}
                                                {isOpen && (
                                                    <div className="p-4 space-y-4">
                                                        {deptProjects.map(({ title, epics }) => (
                                                            <div key={title}>
                                                                {/* 役職ラベル */}
                                                                <div className="flex items-center gap-2 mb-2">
                                                                    <span className="px-3 py-1 rounded-lg text-[10px] font-black text-cyan-300"
                                                                        style={{ background: 'rgba(6,182,212,0.15)', border: '1px solid rgba(6,182,212,0.25)' }}>
                                                                        👤 {title}
                                                                    </span>
                                                                    <span className="text-[10px] text-slate-500 font-bold">{epics?.length || 0}エピック</span>
                                                                </div>

                                                                {/* エピックカード一覧 */}
                                                                <div className="space-y-2 ml-2">
                                                                    {(epics || []).map((epic, idx) => (
                                                                        <div key={epic.id || idx}
                                                                            className="rounded-xl p-3"
                                                                            style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}
                                                                        >
                                                                            <div className="flex items-start justify-between gap-2 mb-1">
                                                                                <span className="text-xs font-black text-white">{epic.name}</span>
                                                                                <span className="flex-shrink-0 px-2 py-0.5 rounded-md text-[10px] font-black"
                                                                                    style={{ background: 'rgba(34,197,94,0.15)', color: '#22c55e' }}>
                                                                                    {epic.weight}%
                                                                                </span>
                                                                            </div>
                                                                            <div className="grid grid-cols-2 gap-x-4 gap-y-1 mt-2">
                                                                                {epic.dueDate && (
                                                                                    <p className="text-[10px] text-slate-400 font-bold col-span-2">
                                                                                        📅 {epic.dueDate}
                                                                                    </p>
                                                                                )}
                                                                                {epic.goal && (
                                                                                    <p className="text-[10px] text-slate-400 col-span-2">
                                                                                        <span className="font-black text-amber-400">どのような状態: </span>{epic.goal}
                                                                                    </p>
                                                                                )}
                                                                                {epic.rule && (
                                                                                    <p className="text-[10px] text-slate-500 col-span-2">
                                                                                        <span className="font-black text-slate-400">ルール: </span>{epic.rule}
                                                                                    </p>
                                                                                )}
                                                                            </div>
                                                                        </div>
                                                                    ))}
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
                    )}

                    {/* ==================== バックアップ ==================== */}
                    {activeTab === 'backup' && (
                        <div className="space-y-4">
                            <div className="p-6 rounded-2xl space-y-4"
                                style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}
                            >
                                <h3 className="text-sm font-black text-white flex items-center gap-2">
                                    <Download className="w-4 h-4 text-blue-400" /> バックアップをダウンロード
                                </h3>
                                <p className="text-xs text-slate-500 font-bold">
                                    すべてのプロジェクトデータ、ユーザー、設定を含むバックアップファイルをダウンロードします。
                                </p>
                                <button onClick={handleBackupDownload}
                                    className="px-6 py-3 rounded-xl text-sm font-black text-white transition-all active:scale-95"
                                    style={{ background: 'linear-gradient(135deg, #3b82f6, #2563eb)' }}>
                                    バックアップをダウンロード
                                </button>
                            </div>
                            <div className="p-6 rounded-2xl space-y-4"
                                style={{ background: 'rgba(239, 68, 68, 0.05)', border: '1px solid rgba(239, 68, 68, 0.15)' }}
                            >
                                <h3 className="text-sm font-black text-white flex items-center gap-2">
                                    <Upload className="w-4 h-4 text-red-400" /> バックアップから復元
                                </h3>
                                <p className="text-xs text-red-300/70 font-bold">
                                    ⚠️ 現在のデータは上書きされます。この操作は取り消せません。
                                </p>
                                <button onClick={handleBackupRestore}
                                    className="px-6 py-3 rounded-xl text-sm font-black text-white transition-all active:scale-95"
                                    style={{ background: 'linear-gradient(135deg, #ef4444, #dc2626)' }}>
                                    バックアップを復元
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default PortalSettings;
