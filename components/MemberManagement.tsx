
// =========================================================
// チームメンバー管理コンポーネント
// ログインユーザーとは独立したメンバーマスター管理
// エピック・タスクへの担当者割り当てに使用
// =========================================================

import React, { useState, useRef, useMemo } from 'react';
import {
    Users, UserPlus, Trash2, Edit2, Check, X, Upload, Download, ChevronDown, ChevronRight,
    FileSpreadsheet, AlertTriangle, TrendingUp, Briefcase, Star, Search, Plus, Copy
} from 'lucide-react';
import { MemberInfo, PeriodPoint, MemberProjectScore } from '../types';
import { parseMemberFile, exportMembersToCSV, generateMemberCSVTemplate } from '../memberCSVParser';

interface Props {
    members: MemberInfo[];
    onSave: (members: MemberInfo[]) => void;
    darkMode?: boolean;
}

const ROLE_LABELS: Record<string, string> = {
    admin: '管理者',
    manager: 'マネージャー',
    executive: '役員',
    user: 'スタッフ',
};

const ROLE_COLORS: Record<string, string> = {
    admin: '#ef4444',
    manager: '#f97316',
    executive: '#8b5cf6',
    user: '#3b82f6',
};

const TYPE_LABELS: Record<string, string> = {
    internal: '社内',
    external: '外部',
};

const emptyMember = (): MemberInfo => ({
    name: '',
    email: '',
    type: 'internal',
    role: 'user',
    employeeId: '',
    department: '',
    periodPoints: [],
    projectScores: [],
});

const MemberManagement: React.FC<Props> = ({ members, onSave, darkMode = true }) => {
    const [search, setSearch] = useState('');
    const [expandedId, setExpandedId] = useState<string | null>(null);
    const [editingIdx, setEditingIdx] = useState<number | null>(null);
    const [editForm, setEditForm] = useState<MemberInfo>(emptyMember());
    const [isAdding, setIsAdding] = useState(false);
    const [addForm, setAddForm] = useState<MemberInfo>(emptyMember());
    const [importStatus, setImportStatus] = useState<{ type: 'success' | 'error' | 'warning'; msg: string } | null>(null);
    const [confirmDeleteIdx, setConfirmDeleteIdx] = useState<number | null>(null);

    // 半期ポイント編集用
    const [periodEditMemberIdx, setPeriodEditMemberIdx] = useState<number | null>(null);
    const [newPeriod, setNewPeriod] = useState({ periodId: '', points: '' });

    // プロジェクトスコア編集用
    const [scoreEditMemberIdx, setScoreEditMemberIdx] = useState<number | null>(null);
    const [newScore, setNewScore] = useState({ projectId: '', projectName: '', periodId: '', score: '' });

    const fileInputRef = useRef<HTMLInputElement>(null);

    // スタイル定数 (darkMode対応)
    const bg = darkMode ? '#0f172a' : '#fff';
    const cardBg = darkMode ? 'rgba(255,255,255,0.04)' : '#f8fafc';
    const cardBorder = darkMode ? 'rgba(255,255,255,0.08)' : '#e2e8f0';
    const textMain = darkMode ? '#f1f5f9' : '#0f172a';
    const textSub = darkMode ? '#64748b' : '#94a3b8';

    const filteredMembers = useMemo(() => {
        if (!search.trim()) return members;
        const q = search.toLowerCase();
        return members.filter(m =>
            m.name.toLowerCase().includes(q) ||
            (m.department || '').toLowerCase().includes(q) ||
            (m.employeeId || '').toLowerCase().includes(q) ||
            (m.email || '').toLowerCase().includes(q)
        );
    }, [members, search]);

    const getMemberKey = (m: MemberInfo, idx: number) => m.employeeId || `${m.name}-${idx}`;

    // ============================================================
    // CSV インポート
    // ============================================================
    const handleImportCSV = () => fileInputRef.current?.click();

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        e.target.value = '';

        setImportStatus(null);
        try {
            const result = await parseMemberFile(file);
            if (result.errors.length > 0) {
                setImportStatus({ type: 'error', msg: result.errors.join(' / ') });
                return;
            }

            // 既存メンバーとマージ (名前または社員IDで重複チェック)
            const merged = [...members];
            let added = 0;
            let updated = 0;

            for (const imported of result.members) {
                const existIdx = merged.findIndex(m =>
                    (imported.employeeId && m.employeeId === imported.employeeId) ||
                    m.name === imported.name
                );
                if (existIdx >= 0) {
                    // 既存メンバーを更新（実績データのみマージ）
                    const existing = merged[existIdx];
                    const mergedPeriods = mergePeriodPoints(existing.periodPoints || [], imported.periodPoints || []);
                    const mergedScores = mergeProjectScores(existing.projectScores || [], imported.projectScores || []);
                    merged[existIdx] = {
                        ...existing,
                        // 基本情報を上書き（空でなければ）
                        department: imported.department || existing.department,
                        email: imported.email || existing.email,
                        type: imported.type || existing.type,
                        role: imported.role || existing.role,
                        periodPoints: mergedPeriods,
                        projectScores: mergedScores,
                    };
                    updated++;
                } else {
                    merged.push(imported);
                    added++;
                }
            }

            onSave(merged);

            const msgs: string[] = [];
            if (added > 0) msgs.push(`${added}人追加`);
            if (updated > 0) msgs.push(`${updated}人更新`);
            if (result.warnings.length > 0) msgs.push(`${result.warnings.length}件の警告あり`);

            setImportStatus({
                type: result.warnings.length > 0 ? 'warning' : 'success',
                msg: msgs.join(' / ') || 'インポート完了'
            });
        } catch (err: any) {
            setImportStatus({ type: 'error', msg: `インポート失敗: ${err.message}` });
        }
    };

    // ============================================================
    // CSV エクスポート
    // ============================================================
    const handleExportCSV = () => {
        const csv = exportMembersToCSV(members);
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `team_members_${new Date().toISOString().split('T')[0]}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    };

    // テンプレートDL
    const handleDownloadTemplate = () => {
        const csv = generateMemberCSVTemplate();
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'team_members_template.csv';
        a.click();
        URL.revokeObjectURL(url);
    };

    // ============================================================
    // メンバー追加
    // ============================================================
    const handleAddMember = () => {
        if (!addForm.name.trim()) return;
        onSave([...members, { ...addForm, periodPoints: [], projectScores: [] }]);
        setAddForm(emptyMember());
        setIsAdding(false);
    };

    // ============================================================
    // メンバー編集
    // ============================================================
    const startEdit = (idx: number) => {
        setEditingIdx(idx);
        setEditForm({ ...members[idx] });
    };

    const handleSaveEdit = () => {
        if (editingIdx === null || !editForm.name.trim()) return;
        const updated = members.map((m, i) => i === editingIdx ? editForm : m);
        onSave(updated);
        setEditingIdx(null);
    };

    // ============================================================
    // メンバー削除
    // ============================================================
    const handleDelete = (idx: number) => {
        onSave(members.filter((_, i) => i !== idx));
        setConfirmDeleteIdx(null);
    };

    // ============================================================
    // 半期ポイント追加
    // ============================================================
    const handleAddPeriodPoint = (memberIdx: number) => {
        if (!newPeriod.periodId || !newPeriod.points) return;
        const points = parseFloat(newPeriod.points);
        if (isNaN(points)) return;

        const updated = members.map((m, i) => {
            if (i !== memberIdx) return m;
            const existing = (m.periodPoints || []).filter(p => p.periodId !== newPeriod.periodId);
            const label = formatPeriodLabel(newPeriod.periodId);
            return {
                ...m,
                periodPoints: [...existing, { periodId: newPeriod.periodId, periodLabel: label, points }]
                    .sort((a, b) => a.periodId.localeCompare(b.periodId)),
            };
        });
        onSave(updated);
        setNewPeriod({ periodId: '', points: '' });
    };

    const handleDeletePeriodPoint = (memberIdx: number, periodId: string) => {
        const updated = members.map((m, i) => {
            if (i !== memberIdx) return m;
            return { ...m, periodPoints: (m.periodPoints || []).filter(p => p.periodId !== periodId) };
        });
        onSave(updated);
    };

    // ============================================================
    // プロジェクトスコア追加
    // ============================================================
    const handleAddProjectScore = (memberIdx: number) => {
        if (!newScore.projectName || !newScore.score) return;
        const score = parseFloat(newScore.score);
        if (isNaN(score)) return;

        const updated = members.map((m, i) => {
            if (i !== memberIdx) return m;
            const existing = (m.projectScores || []).filter(ps =>
                !(ps.projectId === newScore.projectId && ps.periodId === newScore.periodId)
            );
            return {
                ...m,
                projectScores: [...existing, {
                    projectId: newScore.projectId,
                    projectName: newScore.projectName,
                    periodId: newScore.periodId || undefined,
                    score,
                }],
            };
        });
        onSave(updated);
        setNewScore({ projectId: '', projectName: '', periodId: '', score: '' });
    };

    const handleDeleteProjectScore = (memberIdx: number, projectId: string, projectName: string) => {
        const updated = members.map((m, i) => {
            if (i !== memberIdx) return m;
            return {
                ...m,
                projectScores: (m.projectScores || []).filter(
                    ps => !(ps.projectId === projectId && ps.projectName === projectName)
                )
            };
        });
        onSave(updated);
    };

    // ============================================================
    // レンダリング
    // ============================================================
    return (
        <div className="space-y-4">
            {/* hidden file input */}
            <input
                ref={fileInputRef}
                type="file"
                accept=".csv,.xlsx,.xls"
                style={{ display: 'none' }}
                onChange={handleFileChange}
            />

            {/* ツールバー */}
            <div className="flex flex-wrap gap-2 items-center justify-between">
                <div className="flex items-center gap-2 flex-1 min-w-0">
                    <div className="relative flex-1 max-w-xs">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: textSub }} />
                        <input
                            type="text"
                            placeholder="名前・部署・IDで検索"
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            className="w-full pl-9 pr-3 py-2 rounded-xl text-xs font-bold outline-none"
                            style={{
                                background: cardBg,
                                border: `1px solid ${cardBorder}`,
                                color: textMain,
                            }}
                        />
                    </div>
                    <span className="text-xs font-bold" style={{ color: textSub }}>
                        {filteredMembers.length}/{members.length}人
                    </span>
                </div>
                <div className="flex gap-2 flex-wrap">
                    <button
                        onClick={handleDownloadTemplate}
                        className="px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all hover:opacity-80"
                        style={{ background: 'rgba(100,116,139,0.15)', color: textSub }}
                        title="CSVテンプレートをダウンロード"
                    >
                        <FileSpreadsheet className="w-3.5 h-3.5" /> テンプレート
                    </button>
                    <button
                        onClick={handleImportCSV}
                        className="px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all hover:opacity-80"
                        style={{ background: 'rgba(34,197,94,0.15)', color: '#22c55e' }}
                    >
                        <Upload className="w-3.5 h-3.5" /> CSV一括インポート
                    </button>
                    <button
                        onClick={handleExportCSV}
                        className="px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all hover:opacity-80"
                        style={{ background: 'rgba(59,130,246,0.15)', color: '#3b82f6' }}
                    >
                        <Download className="w-3.5 h-3.5" /> エクスポート
                    </button>
                    <button
                        onClick={() => { setIsAdding(true); setAddForm(emptyMember()); }}
                        className="px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all hover:opacity-80"
                        style={{ background: 'rgba(239,68,68,0.15)', color: '#ef4444' }}
                    >
                        <UserPlus className="w-3.5 h-3.5" /> 手動追加
                    </button>
                </div>
            </div>

            {/* インポート結果 */}
            {importStatus && (
                <div className="flex items-center gap-2 px-4 py-3 rounded-xl text-xs font-bold"
                    style={{
                        background: importStatus.type === 'error' ? 'rgba(239,68,68,0.1)' :
                            importStatus.type === 'warning' ? 'rgba(234,179,8,0.1)' : 'rgba(34,197,94,0.1)',
                        color: importStatus.type === 'error' ? '#ef4444' :
                            importStatus.type === 'warning' ? '#eab308' : '#22c55e',
                        border: `1px solid ${importStatus.type === 'error' ? 'rgba(239,68,68,0.2)' :
                            importStatus.type === 'warning' ? 'rgba(234,179,8,0.2)' : 'rgba(34,197,94,0.2)'}`,
                    }}
                >
                    <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                    {importStatus.msg}
                    <button onClick={() => setImportStatus(null)} className="ml-auto"><X className="w-3.5 h-3.5" /></button>
                </div>
            )}

            {/* 新規追加フォーム */}
            {isAdding && (
                <div className="p-4 rounded-2xl space-y-3" style={{ background: cardBg, border: `1px solid ${cardBorder}` }}>
                    <p className="text-xs font-black" style={{ color: '#ef4444' }}>新規メンバー追加</p>
                    <MemberForm
                        form={addForm}
                        onChange={setAddForm}
                        textMain={textMain}
                        textSub={textSub}
                        cardBg={cardBg}
                        cardBorder={cardBorder}
                    />
                    <div className="flex gap-2 justify-end">
                        <button onClick={() => setIsAdding(false)}
                            className="px-4 py-2 rounded-xl text-xs font-bold" style={{ color: textSub }}>
                            キャンセル
                        </button>
                        <button
                            onClick={handleAddMember}
                            disabled={!addForm.name.trim()}
                            className="px-4 py-2 rounded-xl text-xs font-black text-white transition-all disabled:opacity-40"
                            style={{ background: '#ef4444' }}
                        >
                            追加
                        </button>
                    </div>
                </div>
            )}

            {/* メンバーリスト */}
            {filteredMembers.length === 0 ? (
                <div className="text-center py-12" style={{ color: textSub }}>
                    <Users className="w-10 h-10 mx-auto mb-3 opacity-30" />
                    <p className="text-sm font-bold">メンバーが登録されていません</p>
                    <p className="text-xs mt-1">CSV一括インポートまたは手動で追加してください</p>
                </div>
            ) : (
                <div className="space-y-2">
                    {filteredMembers.map((m, displayIdx) => {
                        // 実際のインデックスを取得
                        const actualIdx = members.indexOf(m);
                        const key = getMemberKey(m, actualIdx);
                        const isExpanded = expandedId === key;
                        const isEditing = editingIdx === actualIdx;
                        const totalPeriodPoints = (m.periodPoints || []).reduce((sum, p) => sum + p.points, 0);
                        const projectCount = (m.projectScores || []).length;

                        return (
                            <div key={key} className="rounded-2xl overflow-hidden"
                                style={{ background: cardBg, border: `1px solid ${cardBorder}` }}>

                                {/* メインロウ */}
                                <div className="flex items-center gap-3 px-4 py-3">
                                    {/* アバター */}
                                    <div className="w-9 h-9 rounded-xl flex items-center justify-center text-sm font-black flex-shrink-0 text-white"
                                        style={{ background: ROLE_COLORS[m.role] || '#64748b' }}>
                                        {m.name.slice(0, 1)}
                                    </div>

                                    {/* 基本情報 */}
                                    {isEditing ? (
                                        <div className="flex-1 min-w-0">
                                            <MemberForm
                                                form={editForm}
                                                onChange={setEditForm}
                                                textMain={textMain}
                                                textSub={textSub}
                                                cardBg={cardBg}
                                                cardBorder={cardBorder}
                                                compact
                                            />
                                        </div>
                                    ) : (
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2 flex-wrap">
                                                <span className="text-sm font-black" style={{ color: textMain }}>{m.name}</span>
                                                {m.employeeId && (
                                                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md" style={{ background: 'rgba(100,116,139,0.15)', color: textSub }}>
                                                        {m.employeeId}
                                                    </span>
                                                )}
                                                <span className="text-[10px] font-black px-2 py-0.5 rounded-full text-white"
                                                    style={{ background: ROLE_COLORS[m.role] }}>
                                                    {ROLE_LABELS[m.role]}
                                                </span>
                                                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md"
                                                    style={{ background: 'rgba(100,116,139,0.1)', color: textSub }}>
                                                    {TYPE_LABELS[m.type]}
                                                </span>
                                            </div>
                                            <div className="flex gap-3 mt-0.5 text-[11px] flex-wrap" style={{ color: textSub }}>
                                                {m.department && <span>{m.department}</span>}
                                                {m.email && <span>{m.email}</span>}
                                                {totalPeriodPoints > 0 && (
                                                    <span className="flex items-center gap-0.5 font-bold" style={{ color: '#22c55e' }}>
                                                        <TrendingUp className="w-3 h-3" /> 累計 {totalPeriodPoints.toFixed(1)}pt
                                                    </span>
                                                )}
                                                {projectCount > 0 && (
                                                    <span className="flex items-center gap-0.5" style={{ color: '#3b82f6' }}>
                                                        <Briefcase className="w-3 h-3" /> {projectCount}プロジェクト
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    )}

                                    {/* アクションボタン */}
                                    <div className="flex items-center gap-1 flex-shrink-0">
                                        {isEditing ? (
                                            <>
                                                <button onClick={handleSaveEdit}
                                                    className="p-2 rounded-lg transition-all hover:bg-green-500/20"
                                                    style={{ color: '#22c55e' }}>
                                                    <Check className="w-4 h-4" />
                                                </button>
                                                <button onClick={() => setEditingIdx(null)}
                                                    className="p-2 rounded-lg transition-all hover:bg-slate-500/20"
                                                    style={{ color: textSub }}>
                                                    <X className="w-4 h-4" />
                                                </button>
                                            </>
                                        ) : (
                                            <>
                                                <button onClick={() => startEdit(actualIdx)}
                                                    className="p-2 rounded-lg transition-all hover:bg-blue-500/20"
                                                    style={{ color: textSub }}>
                                                    <Edit2 className="w-3.5 h-3.5" />
                                                </button>
                                                {confirmDeleteIdx === actualIdx ? (
                                                    <>
                                                        <button onClick={() => handleDelete(actualIdx)}
                                                            className="px-2 py-1 rounded-lg text-[10px] font-black text-white"
                                                            style={{ background: '#ef4444' }}>削除</button>
                                                        <button onClick={() => setConfirmDeleteIdx(null)}
                                                            className="p-2 rounded-lg" style={{ color: textSub }}>
                                                            <X className="w-3.5 h-3.5" />
                                                        </button>
                                                    </>
                                                ) : (
                                                    <button onClick={() => setConfirmDeleteIdx(actualIdx)}
                                                        className="p-2 rounded-lg transition-all hover:bg-red-500/20"
                                                        style={{ color: textSub }}>
                                                        <Trash2 className="w-3.5 h-3.5" />
                                                    </button>
                                                )}
                                                <button
                                                    onClick={() => setExpandedId(isExpanded ? null : key)}
                                                    className="p-2 rounded-lg transition-all hover:bg-slate-500/20"
                                                    style={{ color: textSub }}
                                                >
                                                    {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                                                </button>
                                            </>
                                        )}
                                    </div>
                                </div>

                                {/* 展開: 実績データ */}
                                {isExpanded && !isEditing && (
                                    <div className="px-4 pb-4 space-y-4 border-t" style={{ borderColor: cardBorder }}>

                                        {/* 半期ポイント */}
                                        <div className="pt-3">
                                            <div className="flex items-center justify-between mb-2">
                                                <p className="text-xs font-black flex items-center gap-1.5" style={{ color: textMain }}>
                                                    <TrendingUp className="w-3.5 h-3.5 text-green-400" /> 毎期の獲得点数
                                                </p>
                                                <button
                                                    onClick={() => setPeriodEditMemberIdx(periodEditMemberIdx === actualIdx ? null : actualIdx)}
                                                    className="text-[10px] font-bold px-2 py-1 rounded-lg flex items-center gap-1"
                                                    style={{ color: '#22c55e', background: 'rgba(34,197,94,0.1)' }}
                                                >
                                                    <Plus className="w-3 h-3" /> 追加
                                                </button>
                                            </div>

                                            {/* 半期ポイント追加フォーム */}
                                            {periodEditMemberIdx === actualIdx && (
                                                <div className="flex gap-2 mb-2 flex-wrap">
                                                    <input
                                                        type="text"
                                                        placeholder="半期ID (例: 2025-H1)"
                                                        value={newPeriod.periodId}
                                                        onChange={e => setNewPeriod(p => ({ ...p, periodId: e.target.value }))}
                                                        className="flex-1 min-w-[140px] px-3 py-1.5 rounded-lg text-xs font-bold outline-none"
                                                        style={{ background: 'rgba(255,255,255,0.06)', border: `1px solid ${cardBorder}`, color: textMain }}
                                                    />
                                                    <input
                                                        type="number"
                                                        placeholder="点数"
                                                        value={newPeriod.points}
                                                        onChange={e => setNewPeriod(p => ({ ...p, points: e.target.value }))}
                                                        className="w-24 px-3 py-1.5 rounded-lg text-xs font-bold outline-none"
                                                        style={{ background: 'rgba(255,255,255,0.06)', border: `1px solid ${cardBorder}`, color: textMain }}
                                                    />
                                                    <button
                                                        onClick={() => handleAddPeriodPoint(actualIdx)}
                                                        disabled={!newPeriod.periodId || !newPeriod.points}
                                                        className="px-3 py-1.5 rounded-lg text-xs font-black text-white disabled:opacity-40"
                                                        style={{ background: '#22c55e' }}
                                                    >
                                                        保存
                                                    </button>
                                                </div>
                                            )}

                                            {(m.periodPoints || []).length === 0 ? (
                                                <p className="text-xs" style={{ color: textSub }}>実績なし</p>
                                            ) : (
                                                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                                                    {(m.periodPoints || []).map(pp => (
                                                        <div key={pp.periodId} className="flex items-center justify-between px-3 py-2 rounded-xl group"
                                                            style={{ background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.15)' }}>
                                                            <div>
                                                                <p className="text-[10px] font-bold" style={{ color: textSub }}>{pp.periodLabel}</p>
                                                                <p className="text-sm font-black" style={{ color: '#22c55e' }}>{pp.points.toFixed(1)} pt</p>
                                                            </div>
                                                            <button
                                                                onClick={() => handleDeletePeriodPoint(actualIdx, pp.periodId)}
                                                                className="opacity-0 group-hover:opacity-100 p-1 rounded-lg transition-all"
                                                                style={{ color: '#ef4444' }}
                                                            >
                                                                <X className="w-3 h-3" />
                                                            </button>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>

                                        {/* プロジェクトスコア */}
                                        <div>
                                            <div className="flex items-center justify-between mb-2">
                                                <p className="text-xs font-black flex items-center gap-1.5" style={{ color: textMain }}>
                                                    <Briefcase className="w-3.5 h-3.5 text-blue-400" /> 関わったプロジェクトと点数評価
                                                </p>
                                                <button
                                                    onClick={() => setScoreEditMemberIdx(scoreEditMemberIdx === actualIdx ? null : actualIdx)}
                                                    className="text-[10px] font-bold px-2 py-1 rounded-lg flex items-center gap-1"
                                                    style={{ color: '#3b82f6', background: 'rgba(59,130,246,0.1)' }}
                                                >
                                                    <Plus className="w-3 h-3" /> 追加
                                                </button>
                                            </div>

                                            {/* プロジェクトスコア追加フォーム */}
                                            {scoreEditMemberIdx === actualIdx && (
                                                <div className="flex gap-2 mb-2 flex-wrap">
                                                    <input
                                                        type="text"
                                                        placeholder="プロジェクト名"
                                                        value={newScore.projectName}
                                                        onChange={e => setNewScore(s => ({ ...s, projectName: e.target.value }))}
                                                        className="flex-1 min-w-[160px] px-3 py-1.5 rounded-lg text-xs font-bold outline-none"
                                                        style={{ background: 'rgba(255,255,255,0.06)', border: `1px solid ${cardBorder}`, color: textMain }}
                                                    />
                                                    <input
                                                        type="text"
                                                        placeholder="半期ID (任意)"
                                                        value={newScore.periodId}
                                                        onChange={e => setNewScore(s => ({ ...s, periodId: e.target.value }))}
                                                        className="w-32 px-3 py-1.5 rounded-lg text-xs font-bold outline-none"
                                                        style={{ background: 'rgba(255,255,255,0.06)', border: `1px solid ${cardBorder}`, color: textMain }}
                                                    />
                                                    <input
                                                        type="number"
                                                        placeholder="点数"
                                                        value={newScore.score}
                                                        onChange={e => setNewScore(s => ({ ...s, score: e.target.value }))}
                                                        className="w-20 px-3 py-1.5 rounded-lg text-xs font-bold outline-none"
                                                        style={{ background: 'rgba(255,255,255,0.06)', border: `1px solid ${cardBorder}`, color: textMain }}
                                                    />
                                                    <button
                                                        onClick={() => handleAddProjectScore(actualIdx)}
                                                        disabled={!newScore.projectName || !newScore.score}
                                                        className="px-3 py-1.5 rounded-lg text-xs font-black text-white disabled:opacity-40"
                                                        style={{ background: '#3b82f6' }}
                                                    >
                                                        保存
                                                    </button>
                                                </div>
                                            )}

                                            {(m.projectScores || []).length === 0 ? (
                                                <p className="text-xs" style={{ color: textSub }}>実績なし</p>
                                            ) : (
                                                <div className="space-y-1.5">
                                                    {(m.projectScores || []).map((ps, psIdx) => (
                                                        <div key={`${ps.projectId}-${ps.projectName}-${psIdx}`}
                                                            className="flex items-center justify-between px-3 py-2 rounded-xl group"
                                                            style={{ background: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.15)' }}>
                                                            <div className="flex items-center gap-3 min-w-0">
                                                                <div className="min-w-0">
                                                                    <p className="text-xs font-bold truncate" style={{ color: textMain }}>{ps.projectName}</p>
                                                                    {ps.periodId && (
                                                                        <p className="text-[10px]" style={{ color: textSub }}>{formatPeriodLabel(ps.periodId)}</p>
                                                                    )}
                                                                </div>
                                                            </div>
                                                            <div className="flex items-center gap-2 flex-shrink-0">
                                                                <ScoreBar score={ps.score} />
                                                                <span className="text-sm font-black w-10 text-right" style={{ color: '#3b82f6' }}>{ps.score}</span>
                                                                <button
                                                                    onClick={() => handleDeleteProjectScore(actualIdx, ps.projectId, ps.projectName)}
                                                                    className="opacity-0 group-hover:opacity-100 p-1 rounded-lg transition-all"
                                                                    style={{ color: '#ef4444' }}
                                                                >
                                                                    <X className="w-3 h-3" />
                                                                </button>
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
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

// ============================================================
// サブコンポーネント: メンバー基本情報フォーム
// ============================================================
interface MemberFormProps {
    form: MemberInfo;
    onChange: (m: MemberInfo) => void;
    textMain: string;
    textSub: string;
    cardBg: string;
    cardBorder: string;
    compact?: boolean;
}

const MemberForm: React.FC<MemberFormProps> = ({ form, onChange, textMain, textSub, cardBg, cardBorder, compact }) => {
    const inputClass = "px-3 py-1.5 rounded-xl text-xs font-bold outline-none w-full";
    const inputStyle = { background: 'rgba(255,255,255,0.06)', border: `1px solid ${cardBorder}`, color: textMain };

    if (compact) {
        return (
            <div className="flex flex-wrap gap-2">
                <input type="text" placeholder="名前*" value={form.name}
                    onChange={e => onChange({ ...form, name: e.target.value })}
                    className={inputClass} style={{ ...inputStyle, minWidth: 100 }} />
                <input type="text" placeholder="社員ID" value={form.employeeId || ''}
                    onChange={e => onChange({ ...form, employeeId: e.target.value })}
                    className={inputClass} style={{ ...inputStyle, width: 90 }} />
                <input type="text" placeholder="部署" value={form.department || ''}
                    onChange={e => onChange({ ...form, department: e.target.value })}
                    className={inputClass} style={{ ...inputStyle, minWidth: 90 }} />
                <select value={form.role} onChange={e => onChange({ ...form, role: e.target.value as MemberInfo['role'] })}
                    className={inputClass} style={{ ...inputStyle, minWidth: 90 }}>
                    <option value="user">スタッフ</option>
                    <option value="manager">マネージャー</option>
                    <option value="executive">役員</option>
                    <option value="admin">管理者</option>
                </select>
                <select value={form.type} onChange={e => onChange({ ...form, type: e.target.value as MemberInfo['type'] })}
                    className={inputClass} style={{ ...inputStyle, width: 80 }}>
                    <option value="internal">社内</option>
                    <option value="external">外部</option>
                </select>
            </div>
        );
    }

    return (
        <div className="grid grid-cols-2 gap-2">
            <div>
                <label className="text-[10px] font-black mb-1 block" style={{ color: textSub }}>名前 *</label>
                <input type="text" placeholder="名前" value={form.name}
                    onChange={e => onChange({ ...form, name: e.target.value })}
                    className={inputClass} style={inputStyle} />
            </div>
            <div>
                <label className="text-[10px] font-black mb-1 block" style={{ color: textSub }}>社員ID</label>
                <input type="text" placeholder="EMP001" value={form.employeeId || ''}
                    onChange={e => onChange({ ...form, employeeId: e.target.value })}
                    className={inputClass} style={inputStyle} />
            </div>
            <div>
                <label className="text-[10px] font-black mb-1 block" style={{ color: textSub }}>メールアドレス</label>
                <input type="email" placeholder="name@example.com" value={form.email}
                    onChange={e => onChange({ ...form, email: e.target.value })}
                    className={inputClass} style={inputStyle} />
            </div>
            <div>
                <label className="text-[10px] font-black mb-1 block" style={{ color: textSub }}>部署</label>
                <input type="text" placeholder="営業部" value={form.department || ''}
                    onChange={e => onChange({ ...form, department: e.target.value })}
                    className={inputClass} style={inputStyle} />
            </div>
            <div>
                <label className="text-[10px] font-black mb-1 block" style={{ color: textSub }}>役職</label>
                <select value={form.role} onChange={e => onChange({ ...form, role: e.target.value as MemberInfo['role'] })}
                    className={inputClass} style={inputStyle}>
                    <option value="user">スタッフ</option>
                    <option value="manager">マネージャー</option>
                    <option value="executive">役員</option>
                    <option value="admin">管理者</option>
                </select>
            </div>
            <div>
                <label className="text-[10px] font-black mb-1 block" style={{ color: textSub }}>タイプ</label>
                <select value={form.type} onChange={e => onChange({ ...form, type: e.target.value as MemberInfo['type'] })}
                    className={inputClass} style={inputStyle}>
                    <option value="internal">社内</option>
                    <option value="external">外部</option>
                </select>
            </div>
        </div>
    );
};

// ============================================================
// サブコンポーネント: スコアバー
// ============================================================
const ScoreBar: React.FC<{ score: number }> = ({ score }) => {
    const color = score >= 80 ? '#22c55e' : score >= 60 ? '#3b82f6' : score >= 40 ? '#f59e0b' : '#ef4444';
    return (
        <div className="w-16 h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.1)' }}>
            <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(100, score)}%`, background: color }} />
        </div>
    );
};

// ============================================================
// ユーティリティ
// ============================================================
function formatPeriodLabel(periodId: string): string {
    const match = periodId.match(/^(\d{4})-(H[12])$/);
    if (!match) return periodId;
    return `${match[1]}年度 ${match[2] === 'H1' ? '上半期' : '下半期'}`;
}

function mergePeriodPoints(existing: PeriodPoint[], imported: PeriodPoint[]): PeriodPoint[] {
    const map = new Map<string, PeriodPoint>(existing.map(p => [p.periodId, p]));
    for (const p of imported) {
        if (!map.has(p.periodId)) map.set(p.periodId, p);
    }
    return Array.from(map.values()).sort((a, b) => a.periodId.localeCompare(b.periodId));
}

function mergeProjectScores(existing: MemberProjectScore[], imported: MemberProjectScore[]): MemberProjectScore[] {
    const seen = new Set(existing.map(ps => `${ps.projectId}:${ps.projectName}:${ps.periodId || ''}`));
    const result = [...existing];
    for (const ps of imported) {
        const k = `${ps.projectId}:${ps.projectName}:${ps.periodId || ''}`;
        if (!seen.has(k)) {
            result.push(ps);
            seen.add(k);
        }
    }
    return result;
}

export default MemberManagement;
