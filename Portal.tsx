
import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import {
    Plus, Settings, LogOut, Search, Shield, BarChart3, LayoutGrid,
    FolderPlus, X, Sparkles, Briefcase, Pin, Clock, Filter, ChevronDown,
    Upload, FileSpreadsheet, Target, CheckCircle2, AlertCircle, Building2,
    Save, CloudOff, Cloud, RefreshCw
} from 'lucide-react';
import { PortalUser, ProjectMeta, GoalEpic, PROJECT_COLORS, PROJECT_ICONS, getCurrentHalfYear, getProjectPeriodLabel, getFiscalYearOptions } from './portalTypes';
import { getProjects, saveProjects, sortProjects, addProject as addProjectToStore, updateProject as updateProjectInStore, deleteProject as deleteProjectFromStore, saveProjectEpics } from './projectDataService';
import { createProjectSheet, saveEpicsToSheet, saveGoalEpicsToSql, savePortalProjectsToSql, loadPortalProjectsFromSql } from './mysqlService';
import { DEFAULT_GAS_URL } from './constants';
import ProjectCard from './components/ProjectCard';
import BenchmarkView from './components/BenchmarkView';
import PortalSettings from './components/PortalSettings';
import ExecutiveDashboard from './components/ExecutiveDashboard';
import { parseGoalFile, convertToProjects, ParsedGoalProject } from './goalFileParser';

interface PortalProps {
    user: PortalUser;
    onOpenProject: (projectId: string) => void;
    onLogout: () => void;
}

const Portal: React.FC<PortalProps> = ({ user, onOpenProject, onLogout }) => {
    const [projects, setProjects] = useState<ProjectMeta[]>(() => {
        const existing = getProjects();
        // 初回起動: SincolLeatherが未登録なら自動登録
        const hasSincol = existing.some(p => p.sheetName === '決定事項' || p.name === 'SincolLeather');
        if (!hasSincol) {
            const sincolProject: ProjectMeta = {
                id: `proj-sincol-leather`,
                name: 'SincolLeather',
                description: 'Sincol Leather 2027 - 既存プロジェクト',
                createdAt: '2026-01-01T00:00:00Z',
                updatedAt: new Date().toISOString(),
                isPinned: true,
                status: 'active',
                color: '#ef4444',
                icon: '🏭',
                members: [],
                sheetName: '決定事項', // 既存のシート名
            };
            const updated = addProjectToStore(sincolProject);
            return updated;
        }
        return existing;
    });

    const [gasUrl, setGasUrl] = useState(() => localStorage.getItem('board_gas_url') || DEFAULT_GAS_URL);
    const [viewMode, setViewMode] = useState<'projects' | 'benchmark' | 'executive'>(() =>
        (user.role === 'executive') ? 'executive' : 'projects'
    );
    const [searchTerm, setSearchTerm] = useState('');
    const [showNewProjectModal, setShowNewProjectModal] = useState(false);
    const [showSettings, setShowSettings] = useState(false);
    const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
    const [editingProject, setEditingProject] = useState<ProjectMeta | null>(null);

    // ======================================================
    // 自動保存・強制保存ステータス
    // ======================================================
    // 'idle' | 'saving' | 'saved' | 'error' | 'restoring'
    const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error' | 'restoring'>('idle');
    const [saveErrorMsg, setSaveErrorMsg] = useState('');
    const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const isFirstMountRef = useRef(true);

    const currentYear = new Date().getFullYear();

    // 目標ファイルアップロード
    const [showGoalUploadModal, setShowGoalUploadModal] = useState(false);
    const [goalParsedProjects, setGoalParsedProjects] = useState<ParsedGoalProject[]>([]);
    const [goalUploadError, setGoalUploadError] = useState('');
    const [goalUploading, setGoalUploading] = useState(false);
    const [goalFiscalYear, setGoalFiscalYear] = useState(currentYear);
    const [goalHalfPeriod, setGoalHalfPeriod] = useState<'H1' | 'H2'>('H1');
    const goalFileInputRef = useRef<HTMLInputElement>(null);

    // フィルター
    const [filterYear, setFilterYear] = useState<string>('all');
    const [filterPeriod, setFilterPeriod] = useState<string>('all');
    const [filterStatus, setFilterStatus] = useState<string>('all');

    const fiscalYearOptions = useMemo(() => getFiscalYearOptions(), []);

    // ======================================================
    // SQLへの保存ロジック（手動・自動共通）
    // ======================================================
    const effectiveGasUrl = gasUrl || DEFAULT_GAS_URL;

    const persistProjectsToSql = useCallback(async (currentProjects: ProjectMeta[]) => {
        setSaveStatus('saving');
        setSaveErrorMsg('');
        try {
            await savePortalProjectsToSql(effectiveGasUrl, currentProjects);
            setSaveStatus('saved');
            setTimeout(() => setSaveStatus('idle'), 3000);
        } catch (e: any) {
            setSaveStatus('error');
            setSaveErrorMsg(e.message || 'SQL保存失敗');
        }
    }, [effectiveGasUrl]);

    // projectsが変化したら3秒デバウンスで自動保存
    useEffect(() => {
        if (isFirstMountRef.current) return; // 初回マウント時はスキップ
        if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
        autoSaveTimerRef.current = setTimeout(() => {
            persistProjectsToSql(projects);
        }, 3000);
        return () => {
            if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
        };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [projects]);

    // 起動時: localStorageが空または古い場合はSQLから復元
    useEffect(() => {
        const existing = getProjects();
        const hasGoalEpics = existing.some(p => p.goalEpics && p.goalEpics.length > 0);

        if (!hasGoalEpics) {
            // SQLから復元を試みる
            setSaveStatus('restoring');
            loadPortalProjectsFromSql(effectiveGasUrl).then(result => {
                if (result && result.projects.length > 0) {
                    const sqlHasGoalEpics = result.projects.some((p: any) => p.goalEpics && p.goalEpics.length > 0);
                    if (sqlHasGoalEpics) {
                        // SQLのデータをlocalStorageに書き戻し、Reactステートも更新
                        saveProjects(result.projects as ProjectMeta[]);
                        setProjects(sortProjects(result.projects as ProjectMeta[]));
                        console.log('[Portal] SQLからプロジェクト復元:', result.projects.length, '件');
                    }
                }
                setSaveStatus('idle');
            }).catch(() => {
                setSaveStatus('idle');
            });
        } else {
            setSaveStatus('idle');
        }

        // 初回マウント完了フラグ（自動保存のスキップ解除は少し遅らせる）
        const t = setTimeout(() => { isFirstMountRef.current = false; }, 500);
        return () => clearTimeout(t);
    // 初回のみ実行
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // 強制保存ハンドラ（ボタン用）
    const handleForceSave = useCallback(async () => {
        if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
        await persistProjectsToSql(projects);
    }, [projects, persistProjectsToSql]);

    // 新規プロジェクトフォーム
    const [newProject, setNewProject] = useState({
        name: '',
        description: '',
        color: PROJECT_COLORS[0],
        icon: PROJECT_ICONS[0],
        fiscalYear: currentYear,
        halfPeriod: 'H1' as 'H1' | 'H2',
    });

    const isAdmin = user.role === 'admin';
    const isManager = user.role === 'manager';
    const isExecutive = user.role === 'executive';

    // フィルタリングされたプロジェクト一覧
    const filteredProjects = useMemo(() => {
        let sorted = sortProjects(projects);

        // 年度フィルタ
        if (filterYear !== 'all') {
            sorted = sorted.filter(p => p.fiscalYear === parseInt(filterYear));
        }

        // 期フィルタ
        if (filterPeriod !== 'all') {
            sorted = sorted.filter(p => p.halfPeriod === filterPeriod);
        }

        // ステータスフィルタ
        if (filterStatus !== 'all') {
            sorted = sorted.filter(p => p.status === filterStatus);
        }

        // フリーテキスト検索
        if (searchTerm.trim()) {
            const term = searchTerm.toLowerCase();
            sorted = sorted.filter(p =>
                p.name.toLowerCase().includes(term) ||
                p.description.toLowerCase().includes(term) ||
                getProjectPeriodLabel(p.fiscalYear, p.halfPeriod).includes(searchTerm)
            );
        }

        return sorted;
    }, [projects, searchTerm, filterYear, filterPeriod, filterStatus]);

    // プロジェクトにある年度の一覧（フィルタ用）
    const availableYears = useMemo(() => {
        const years = new Set<number>();
        projects.forEach(p => { if (p.fiscalYear) years.add(p.fiscalYear); });
        return Array.from(years).sort((a, b) => b - a);
    }, [projects]);

    const handleAddProject = useCallback(async () => {
        if (!newProject.name.trim()) return;

        const sheetName = newProject.name.trim();

        const project: ProjectMeta = {
            id: `proj-${Date.now()}-${Math.random().toString(36).slice(2)}`,
            name: sheetName,
            description: newProject.description.trim(),
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            isPinned: false,
            status: 'active',
            color: newProject.color,
            icon: newProject.icon,
            members: [],
            sheetName: sheetName,
            fiscalYear: newProject.fiscalYear,
            halfPeriod: newProject.halfPeriod,
        };

        // GASにシート自動作成リクエスト
        try {
            await createProjectSheet(gasUrl, sheetName);
            console.log('[Portal] Project sheet created:', sheetName);
        } catch (e) {
            console.warn('[Portal] Could not create sheet via GAS:', e);
        }

        setProjects(addProjectToStore(project));
        setShowNewProjectModal(false);
        setNewProject({ name: '', description: '', color: PROJECT_COLORS[0], icon: PROJECT_ICONS[0], fiscalYear: currentYear, halfPeriod: 'H1' });
    }, [newProject, gasUrl, currentYear]);

    const handleTogglePin = useCallback((projectId: string) => {
        const updated = projects.map(p =>
            p.id === projectId ? { ...p, isPinned: !p.isPinned, updatedAt: new Date().toISOString() } : p
        );
        saveProjects(updated);
        setProjects(updated);
    }, [projects]);

    const handleDeleteProject = useCallback((projectId: string) => {
        if (!confirm('このプロジェクトを削除しますか？すべてのデータが失われます。')) return;
        setProjects(deleteProjectFromStore(projectId));
    }, []);

    const handleUpdateProject = useCallback((project: ProjectMeta) => {
        setProjects(updateProjectInStore({ ...project, updatedAt: new Date().toISOString() }));
        setEditingProject(null);
    }, []);

    const handleEditProject = useCallback((project: ProjectMeta) => {
        setEditingProject(project);
        setShowNewProjectModal(true);
        setNewProject({
            name: project.name,
            description: project.description,
            color: project.color,
            icon: project.icon,
            fiscalYear: project.fiscalYear || currentYear,
            halfPeriod: project.halfPeriod || 'H1',
        });
    }, [currentYear]);

    const handleSaveEdit = useCallback(() => {
        if (!editingProject || !newProject.name.trim()) return;
        handleUpdateProject({
            ...editingProject,
            name: newProject.name.trim(),
            description: newProject.description.trim(),
            color: newProject.color,
            icon: newProject.icon,
            fiscalYear: newProject.fiscalYear,
            halfPeriod: newProject.halfPeriod,
        });
        setShowNewProjectModal(false);
        setEditingProject(null);
        setNewProject({ name: '', description: '', color: PROJECT_COLORS[0], icon: PROJECT_ICONS[0], fiscalYear: currentYear, halfPeriod: 'H1' });
    }, [editingProject, newProject, handleUpdateProject, currentYear]);

    // ===== 目標ファイルアップロード処理 =====
    const handleGoalFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setGoalUploadError('');
        setGoalUploading(true);

        try {
            console.log('[Portal] ファイル選択:', file.name);
            const parsed = await parseGoalFile(file);
            console.log('[Portal] パース結果:', parsed.length, 'プロジェクト');
            if (parsed.length === 0) {
                setGoalUploadError('ファイルからプロジェクトを検出できませんでした。ブラウザのコンソール(F12)でログを確認してください。');
            } else {
                setGoalParsedProjects(parsed);
            }
        } catch (err: any) {
            console.error('[Portal] parseGoalFile エラー:', err);
            setGoalUploadError(err.message || 'ファイルの解析に失敗しました');
        } finally {
            setGoalUploading(false);
            // ファイル入力をリセット
            if (goalFileInputRef.current) goalFileInputRef.current.value = '';
        }
    }, []);

    const handleGoalCreateProjects = useCallback(async () => {
        if (goalParsedProjects.length === 0) return;

        const newProjects = convertToProjects(goalParsedProjects, goalFiscalYear, goalHalfPeriod);

        let currentProjects = getProjects();
        for (const proj of newProjects) {
            // GASにシート作成
            try {
                await createProjectSheet(gasUrl, proj.sheetName || proj.name);
            } catch (e) {
                console.warn('[GoalUpload] Sheet creation skipped:', e);
            }
            currentProjects = addProjectToStore(proj);
            if (proj.goalEpics && proj.goalEpics.length > 0) {
                const epicNames = proj.goalEpics.map(e => e.name);
                saveProjectEpics(proj.id, epicNames);
                // epicsテーブルとgoal_epicsテーブルへ並列保存
                const sqlEpics = proj.goalEpics.map(e => ({
                    id: e.id, name: e.name,
                    dueDate: e.dueDate || '', goal: e.goal || '',
                    rule: e.rule || '', weight: e.weight || 0,
                    status: e.status || 'active',
                }));
                const results = await Promise.allSettled([
                    saveEpicsToSheet(epicNames, gasUrl, proj.sheetName || proj.name),
                    saveGoalEpicsToSql(gasUrl, proj.department || '', proj.evaluatorTitle || '',
                        proj.fiscalYear || goalFiscalYear, proj.halfPeriod || goalHalfPeriod, sqlEpics),
                ]);
                const failed = results.filter(r => r.status === 'rejected');
                if (failed.length > 0) {
                    const msgs = failed.map(r => (r as PromiseRejectedResult).reason?.message || 'SQL保存失敗').join(', ');
                    setGoalUploadError(`SQL保存エラー (${proj.department} / ${proj.evaluatorTitle}): ${msgs}`);
                }
            }
        }

        setProjects(currentProjects);
        setShowGoalUploadModal(false);
        setGoalParsedProjects([]);
        setGoalUploadError('');

        // 目標ファイル取込後に即時SQLバックアップ（自動保存より優先）
        if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
        persistProjectsToSql(currentProjects);
    }, [goalParsedProjects, goalFiscalYear, goalHalfPeriod, gasUrl, persistProjectsToSql]);

    const currentHalf = getCurrentHalfYear();

    // フィルタが有効かどうか
    const hasActiveFilters = filterYear !== 'all' || filterPeriod !== 'all' || filterStatus !== 'all';

    return (
        <div className="min-h-screen" style={{ background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)' }}>
            {/* 背景装飾 */}
            <div className="fixed inset-0 overflow-hidden pointer-events-none">
                <div className="absolute -top-40 -right-40 w-[500px] h-[500px] rounded-full opacity-[0.03]"
                    style={{ background: 'radial-gradient(circle, #ef4444, transparent)' }} />
                <div className="absolute bottom-0 left-0 w-[600px] h-[600px] rounded-full opacity-[0.03]"
                    style={{ background: 'radial-gradient(circle, #3b82f6, transparent)' }} />
            </div>

            {/* トップバー */}
            <div className="sticky top-0 z-50 backdrop-blur-xl"
                style={{ background: 'rgba(15,23,42,0.85)', borderBottom: '1px solid rgba(255,255,255,0.06)' }}
            >
                <div className="max-w-[1400px] mx-auto px-6 py-3 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl flex items-center justify-center shadow-lg"
                            style={{ background: 'linear-gradient(135deg, #ef4444, #dc2626)' }}
                        >
                            <Briefcase className="w-5 h-5 text-white" />
                        </div>
                        <div>
                            <h1 className="text-sm font-black text-white tracking-tight">WisteriaProjectMGT</h1>
                            <p className="text-[9px] text-slate-500 font-bold uppercase tracking-widest">Multi-Project Portal</p>
                        </div>
                    </div>

                    <div className="flex items-center gap-2">
                        <div className="hidden md:flex items-center gap-2 px-4 py-2 rounded-xl mr-2"
                            style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}
                        >
                            <Clock className="w-3.5 h-3.5 text-slate-500" />
                            <span className="text-[10px] text-slate-400 font-bold">{currentHalf.label}</span>
                        </div>

                        <div className="flex items-center gap-2 px-3 py-2 rounded-xl"
                            style={{
                                background: user.role === 'admin'
                                    ? 'rgba(251,191,36,0.1)'
                                    : user.role === 'executive'
                                        ? 'rgba(139,92,246,0.1)'
                                        : user.role === 'manager'
                                            ? 'rgba(59,130,246,0.1)'
                                            : 'rgba(255,255,255,0.04)'
                            }}
                        >
                            <span className="text-xs">
                                {user.role === 'admin' ? '👑' : user.role === 'executive' ? '🏢' : user.role === 'manager' ? '📋' : '👤'}
                            </span>
                            <span className="text-xs font-bold text-white">{user.name}</span>
                        </div>

                        {/* 保存ステータス + 強制保存ボタン */}
                        {saveStatus === 'restoring' && (
                            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[10px] font-bold"
                                style={{ background: 'rgba(59,130,246,0.12)', color: '#60a5fa' }}>
                                <RefreshCw className="w-3 h-3 animate-spin" /> SQLから復元中...
                            </div>
                        )}
                        {saveStatus === 'saving' && (
                            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[10px] font-bold"
                                style={{ background: 'rgba(234,179,8,0.12)', color: '#fbbf24' }}>
                                <RefreshCw className="w-3 h-3 animate-spin" /> 保存中...
                            </div>
                        )}
                        {saveStatus === 'saved' && (
                            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[10px] font-bold"
                                style={{ background: 'rgba(34,197,94,0.12)', color: '#4ade80' }}>
                                <Cloud className="w-3 h-3" /> 保存済み
                            </div>
                        )}
                        {saveStatus === 'error' && (
                            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[10px] font-bold cursor-pointer"
                                style={{ background: 'rgba(239,68,68,0.12)', color: '#f87171' }}
                                title={saveErrorMsg}
                                onClick={handleForceSave}
                            >
                                <CloudOff className="w-3 h-3" /> 保存失敗（クリックで再試行）
                            </div>
                        )}
                        {isAdmin && (
                            <button
                                onClick={handleForceSave}
                                disabled={saveStatus === 'saving' || saveStatus === 'restoring'}
                                className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-[10px] font-black transition-all hover:opacity-80 disabled:opacity-40"
                                style={{ background: 'rgba(34,197,94,0.15)', color: '#4ade80' }}
                                title="プロジェクトデータをSQLに強制保存"
                            >
                                <Save className="w-3.5 h-3.5" />
                                <span className="hidden sm:inline">強制保存</span>
                            </button>
                        )}

                        {isAdmin && (
                            <button
                                onClick={() => setShowSettings(true)}
                                className="p-2.5 rounded-xl transition-all hover:bg-white/5"
                                title="ポータル設定"
                            >
                                <Settings className="w-5 h-5 text-slate-500 hover:text-red-400 transition-colors" />
                            </button>
                        )}

                        <button
                            onClick={() => setShowLogoutConfirm(true)}
                            className="p-2.5 rounded-xl transition-all hover:bg-red-500/10"
                            title="ログアウト"
                        >
                            <LogOut className="w-5 h-5 text-slate-500 hover:text-red-400 transition-colors" />
                        </button>
                    </div>
                </div>
            </div>

            {/* メインコンテンツ */}
            <div className="max-w-[1400px] mx-auto px-6 pt-8 pb-16 relative z-10">
                {/* ヒーローセクション */}
                <div className="mb-10">
                    <h2 className="text-3xl md:text-4xl font-black text-white mb-2">
                        {viewMode === 'projects' ? 'プロジェクト' : viewMode === 'executive' ? '役員ダッシュボード' : 'ベンチマーク'}
                    </h2>
                    <p className="text-sm text-slate-500 font-bold">
                        {viewMode === 'projects'
                            ? `${projects.length}件のプロジェクトを管理中${hasActiveFilters ? ` (${filteredProjects.length}件表示中)` : ''}`
                            : viewMode === 'executive'
                                ? '部署別・期別の進捗状況とエピック評価一覧'
                                : '全プロジェクト横断の個人ポイントランキング'
                        }
                    </p>
                </div>

                {/* ツールバー */}
                <div className="flex flex-col gap-4 mb-8">
                    {/* 上段: ビューモード切替 + 検索 + 新規追加 */}
                    <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                        <div className="flex items-center gap-2">
                            <div className="flex p-1 rounded-xl" style={{ background: 'rgba(255,255,255,0.04)' }}>
                                <button
                                    onClick={() => setViewMode('projects')}
                                    className={`px-4 py-2.5 rounded-lg text-xs font-black flex items-center gap-2 transition-all ${viewMode === 'projects' ? 'bg-white/10 text-white shadow' : 'text-slate-500 hover:text-slate-300'
                                        }`}
                                >
                                    <LayoutGrid className="w-4 h-4" /> プロジェクト
                                </button>
                                <button
                                    onClick={() => setViewMode('benchmark')}
                                    className={`px-4 py-2.5 rounded-lg text-xs font-black flex items-center gap-2 transition-all ${viewMode === 'benchmark' ? 'bg-white/10 text-white shadow' : 'text-slate-500 hover:text-slate-300'
                                        }`}
                                >
                                    <BarChart3 className="w-4 h-4" /> ベンチマーク
                                </button>
                                {(isExecutive || isAdmin) && (
                                    <button
                                        onClick={() => setViewMode('executive')}
                                        className={`px-4 py-2.5 rounded-lg text-xs font-black flex items-center gap-2 transition-all ${viewMode === 'executive' ? 'shadow text-white' : 'text-slate-500 hover:text-slate-300'
                                            }`}
                                        style={viewMode === 'executive' ? { background: 'rgba(139,92,246,0.3)' } : {}}
                                    >
                                        <Building2 className="w-4 h-4" /> 役員ダッシュボード
                                    </button>
                                )}
                            </div>
                        </div>

                        <div className="flex items-center gap-3 w-full md:w-auto">
                            {viewMode === 'projects' && (
                                <>
                                    <div className="relative flex-1 md:w-64">
                                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                                        <input
                                            type="text"
                                            placeholder="プロジェクト検索..."
                                            value={searchTerm}
                                            onChange={e => setSearchTerm(e.target.value)}
                                            className="w-full pl-10 pr-4 py-3 rounded-xl text-sm font-bold text-white outline-none"
                                            style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)' }}
                                        />
                                    </div>
                                    {(isAdmin || isManager) && (
                                        <>
                                        <button
                                            onClick={() => {
                                                setGoalParsedProjects([]);
                                                setGoalUploadError('');
                                                setShowGoalUploadModal(true);
                                            }}
                                            className="px-5 py-3 rounded-xl text-sm font-black text-white flex items-center gap-2 transition-all active:scale-95 flex-shrink-0"
                                            style={{
                                                background: 'linear-gradient(135deg, #f59e0b, #d97706)',
                                                boxShadow: '0 8px 30px rgba(245, 158, 11, 0.2)',
                                            }}
                                        >
                                            <Upload className="w-4 h-4" /> 目標ファイル
                                        </button>
                                        <button
                                            onClick={() => {
                                                setEditingProject(null);
                                                setNewProject({ name: '', description: '', color: PROJECT_COLORS[Math.floor(Math.random() * PROJECT_COLORS.length)], icon: PROJECT_ICONS[Math.floor(Math.random() * PROJECT_ICONS.length)], fiscalYear: currentYear, halfPeriod: 'H1' });
                                                setShowNewProjectModal(true);
                                            }}
                                            className="px-5 py-3 rounded-xl text-sm font-black text-white flex items-center gap-2 transition-all active:scale-95 flex-shrink-0"
                                            style={{
                                                background: 'linear-gradient(135deg, #ef4444, #dc2626)',
                                                boxShadow: '0 8px 30px rgba(239, 68, 68, 0.2)',
                                            }}
                                        >
                                            <Plus className="w-4 h-4" /> 新規プロジェクト
                                        </button>
                                        </>
                                    )}
                                </>
                            )}
                        </div>
                    </div>

                    {/* 下段: フィルター */}
                    {viewMode === 'projects' && (
                        <div className="flex flex-wrap items-center gap-2">
                            <div className="flex items-center gap-1.5 text-[10px] font-black text-slate-500 uppercase tracking-widest mr-1">
                                <Filter className="w-3.5 h-3.5" /> フィルタ
                            </div>

                            {/* 年度フィルタ */}
                            <select
                                value={filterYear}
                                onChange={e => setFilterYear(e.target.value)}
                                className="px-3 py-2 rounded-lg text-xs font-bold text-white outline-none appearance-none cursor-pointer"
                                style={{ background: filterYear !== 'all' ? 'rgba(6,182,212,0.2)' : 'rgba(255,255,255,0.06)', border: `1px solid ${filterYear !== 'all' ? 'rgba(6,182,212,0.4)' : 'rgba(255,255,255,0.08)'}` }}
                            >
                                <option value="all" style={{ background: '#1e293b' }}>全年度</option>
                                {(availableYears.length > 0 ? availableYears : fiscalYearOptions).map(y => (
                                    <option key={y} value={y} style={{ background: '#1e293b' }}>{y}年度</option>
                                ))}
                            </select>

                            {/* 期フィルタ */}
                            <select
                                value={filterPeriod}
                                onChange={e => setFilterPeriod(e.target.value)}
                                className="px-3 py-2 rounded-lg text-xs font-bold text-white outline-none appearance-none cursor-pointer"
                                style={{ background: filterPeriod !== 'all' ? 'rgba(6,182,212,0.2)' : 'rgba(255,255,255,0.06)', border: `1px solid ${filterPeriod !== 'all' ? 'rgba(6,182,212,0.4)' : 'rgba(255,255,255,0.08)'}` }}
                            >
                                <option value="all" style={{ background: '#1e293b' }}>全期</option>
                                <option value="H1" style={{ background: '#1e293b' }}>上半期</option>
                                <option value="H2" style={{ background: '#1e293b' }}>下半期</option>
                            </select>

                            {/* ステータスフィルタ */}
                            <select
                                value={filterStatus}
                                onChange={e => setFilterStatus(e.target.value)}
                                className="px-3 py-2 rounded-lg text-xs font-bold text-white outline-none appearance-none cursor-pointer"
                                style={{ background: filterStatus !== 'all' ? 'rgba(6,182,212,0.2)' : 'rgba(255,255,255,0.06)', border: `1px solid ${filterStatus !== 'all' ? 'rgba(6,182,212,0.4)' : 'rgba(255,255,255,0.08)'}` }}
                            >
                                <option value="all" style={{ background: '#1e293b' }}>全ステータス</option>
                                <option value="active" style={{ background: '#1e293b' }}>進行中</option>
                                <option value="completed" style={{ background: '#1e293b' }}>完了</option>
                                <option value="archived" style={{ background: '#1e293b' }}>アーカイブ</option>
                            </select>

                            {/* フィルタクリア */}
                            {hasActiveFilters && (
                                <button
                                    onClick={() => { setFilterYear('all'); setFilterPeriod('all'); setFilterStatus('all'); }}
                                    className="px-3 py-2 rounded-lg text-xs font-bold text-red-400 transition-all hover:bg-red-500/10"
                                    style={{ border: '1px solid rgba(239,68,68,0.3)' }}
                                >
                                    ✕ クリア
                                </button>
                            )}
                        </div>
                    )}
                </div>

                {/* プロジェクト一覧 */}
                {viewMode === 'projects' && (
                    <>
                        {filteredProjects.length === 0 ? (
                            <div className="text-center py-24">
                                <div className="w-24 h-24 rounded-3xl flex items-center justify-center mx-auto mb-6"
                                    style={{ background: 'rgba(255,255,255,0.04)' }}
                                >
                                    <FolderPlus className="w-12 h-12 text-slate-600" />
                                </div>
                                <h3 className="text-lg font-black text-slate-400 mb-2">
                                    {hasActiveFilters ? '条件に一致するプロジェクトがありません' : 'プロジェクトがありません'}
                                </h3>
                                <p className="text-sm text-slate-600 font-bold mb-6">
                                    {hasActiveFilters ? 'フィルタ条件を変更してみてください' : '最初のプロジェクトを作成してみましょう'}
                                </p>
                                {!hasActiveFilters && (isAdmin || isManager) && (
                                    <button
                                        onClick={() => setShowNewProjectModal(true)}
                                        className="px-6 py-3 rounded-xl text-sm font-black text-white inline-flex items-center gap-2"
                                        style={{ background: 'linear-gradient(135deg, #ef4444, #dc2626)' }}
                                    >
                                        <Plus className="w-4 h-4" /> プロジェクトを作成
                                    </button>
                                )}
                            </div>
                        ) : (() => {
                            // 部署ごとにグループ化（department があるものは部署別囲い、ないものは単独表示）
                            const deptOrder: string[] = [];
                            const deptGroups = new Map<string, typeof filteredProjects>();

                            filteredProjects.forEach(p => {
                                const key = p.department ? p.department.replace(/[\r\n]/g, ' ').trim() : '__ungrouped__';
                                if (!deptGroups.has(key)) {
                                    deptOrder.push(key);
                                    deptGroups.set(key, []);
                                }
                                deptGroups.get(key)!.push(p);
                            });

                            return (
                                <div className="space-y-8">
                                    {deptOrder.map(deptKey => {
                                        const deptProjects = deptGroups.get(deptKey)!;
                                        const isGrouped = deptKey !== '__ungrouped__' && deptProjects.length > 0;
                                        const hasDeptLabel = deptKey !== '__ungrouped__';

                                        if (!hasDeptLabel) {
                                            // 部署情報なし → 従来通りグリッド
                                            return (
                                                <div key={deptKey} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                                                    {deptProjects.map(project => (
                                                        <ProjectCard
                                                            key={project.id}
                                                            project={project}
                                                            onOpen={onOpenProject}
                                                            onTogglePin={handleTogglePin}
                                                            onEdit={handleEditProject}
                                                            onDelete={handleDeleteProject}
                                                            isAdmin={isAdmin}
                                                        />
                                                    ))}
                                                </div>
                                            );
                                        }

                                        // 部署囲い（同一部署のプロジェクトをボックスで括る）
                                        return (
                                            <div key={deptKey} className="rounded-[2rem] p-5"
                                                style={{
                                                    border: '2px solid rgba(255,255,255,0.12)',
                                                    background: 'rgba(255,255,255,0.02)',
                                                    boxShadow: '0 4px 30px rgba(0,0,0,0.3)',
                                                }}
                                            >
                                                {/* 部署ラベル */}
                                                <div className="flex items-center gap-3 mb-4">
                                                    <div className="px-4 py-1.5 rounded-xl text-xs font-black text-white"
                                                        style={{ background: 'linear-gradient(135deg, rgba(99,102,241,0.4), rgba(139,92,246,0.4))', border: '1px solid rgba(139,92,246,0.4)' }}
                                                    >
                                                        🏢 {deptKey}
                                                    </div>
                                                    <span className="text-[10px] text-slate-500 font-bold">
                                                        {deptProjects.length}プロジェクト
                                                    </span>
                                                </div>
                                                {/* 囲い内プロジェクトカード */}
                                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                                    {deptProjects.map(project => (
                                                        <ProjectCard
                                                            key={project.id}
                                                            project={project}
                                                            onOpen={onOpenProject}
                                                            onTogglePin={handleTogglePin}
                                                            onEdit={handleEditProject}
                                                            onDelete={handleDeleteProject}
                                                            isAdmin={isAdmin}
                                                        />
                                                    ))}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            );
                        })()}
                    </>
                )}

                {/* ベンチマーク */}
                {viewMode === 'benchmark' && (
                    <BenchmarkView projects={projects} />
                )}

                {/* 役員ダッシュボード */}
                {viewMode === 'executive' && (
                    <ExecutiveDashboard projects={projects} />
                )}
            </div>

            {/* 新規プロジェクトモーダル */}
            {showNewProjectModal && (
                <div className="fixed inset-0 z-[200] flex items-center justify-center p-4"
                    style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(12px)' }}
                    onClick={() => { setShowNewProjectModal(false); setEditingProject(null); }}
                >
                    <div
                        className="w-full max-w-lg rounded-[2.5rem] overflow-hidden shadow-2xl max-h-[90vh] overflow-y-auto"
                        style={{ background: '#0f172a', border: '1px solid rgba(255,255,255,0.08)' }}
                        onClick={e => e.stopPropagation()}
                    >
                        <div className="p-6 flex justify-between items-center"
                            style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}
                        >
                            <h2 className="text-lg font-black text-white flex items-center gap-3">
                                <FolderPlus className="w-5 h-5 text-red-400" />
                                {editingProject ? 'プロジェクトを編集' : '新規プロジェクト'}
                            </h2>
                            <button onClick={() => { setShowNewProjectModal(false); setEditingProject(null); }}
                                className="p-2 rounded-xl hover:bg-white/5 transition-colors">
                                <X className="w-5 h-5 text-slate-500" />
                            </button>
                        </div>

                        <div className="p-6 space-y-5">
                            {/* プロジェクト名 */}
                            <div>
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block">
                                    プロジェクト名
                                </label>
                                <input
                                    type="text"
                                    value={newProject.name}
                                    onChange={e => setNewProject({ ...newProject, name: e.target.value })}
                                    className="w-full px-4 py-3 rounded-xl text-sm font-bold text-white outline-none"
                                    style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }}
                                    placeholder="例: Sincol Leather"
                                    autoFocus
                                />
                            </div>

                            {/* 対象年度・期 */}
                            <div>
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block">
                                    📅 対象年度・期
                                </label>
                                <div className="grid grid-cols-2 gap-3">
                                    <select
                                        value={newProject.fiscalYear}
                                        onChange={e => setNewProject({ ...newProject, fiscalYear: parseInt(e.target.value) })}
                                        className="px-4 py-3 rounded-xl text-sm font-bold text-white outline-none appearance-none cursor-pointer"
                                        style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }}
                                    >
                                        {fiscalYearOptions.map(y => (
                                            <option key={y} value={y} style={{ background: '#1e293b' }}>{y}年度</option>
                                        ))}
                                    </select>
                                    <select
                                        value={newProject.halfPeriod}
                                        onChange={e => setNewProject({ ...newProject, halfPeriod: e.target.value as 'H1' | 'H2' })}
                                        className="px-4 py-3 rounded-xl text-sm font-bold text-white outline-none appearance-none cursor-pointer"
                                        style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }}
                                    >
                                        <option value="H1" style={{ background: '#1e293b' }}>上半期 (4月〜9月)</option>
                                        <option value="H2" style={{ background: '#1e293b' }}>下半期 (10月〜3月)</option>
                                    </select>
                                </div>
                            </div>

                            {/* 説明 */}
                            <div>
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block">
                                    説明
                                </label>
                                <textarea
                                    value={newProject.description}
                                    onChange={e => setNewProject({ ...newProject, description: e.target.value })}
                                    className="w-full px-4 py-3 rounded-xl text-sm font-bold text-white outline-none h-20 resize-none"
                                    style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }}
                                    placeholder="プロジェクトの概要を入力..."
                                />
                            </div>

                            {/* アイコン選択 */}
                            <div>
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block">
                                    アイコン
                                </label>
                                <div className="flex flex-wrap gap-2">
                                    {PROJECT_ICONS.map(icon => (
                                        <button
                                            key={icon}
                                            onClick={() => setNewProject({ ...newProject, icon })}
                                            className={`w-10 h-10 rounded-xl flex items-center justify-center text-lg transition-all ${newProject.icon === icon ? 'scale-110 ring-2 ring-red-500' : 'hover:bg-white/5'
                                                }`}
                                            style={{
                                                background: newProject.icon === icon ? 'rgba(239,68,68,0.15)' : 'rgba(255,255,255,0.04)',
                                            }}
                                        >
                                            {icon}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* カラー選択 */}
                            <div>
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block">
                                    テーマカラー
                                </label>
                                <div className="flex flex-wrap gap-2">
                                    {PROJECT_COLORS.map(color => (
                                        <button
                                            key={color}
                                            onClick={() => setNewProject({ ...newProject, color })}
                                            className={`w-8 h-8 rounded-lg transition-all ${newProject.color === color ? 'scale-125 ring-2 ring-white shadow-lg' : 'hover:scale-110'
                                                }`}
                                            style={{ background: color }}
                                        />
                                    ))}
                                </div>
                            </div>

                            {/* プレビュー */}
                            <div className="p-4 rounded-2xl flex items-center gap-4"
                                style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}
                            >
                                <div className="w-12 h-12 rounded-xl flex items-center justify-center text-xl shadow-lg"
                                    style={{
                                        background: `linear-gradient(135deg, ${newProject.color}22, ${newProject.color}44)`,
                                        border: `1px solid ${newProject.color}33`,
                                    }}
                                >
                                    {newProject.icon}
                                </div>
                                <div>
                                    <p className="text-sm font-black text-white">{newProject.name || 'プロジェクト名'}</p>
                                    <p className="text-[10px] text-cyan-400 font-bold">
                                        📅 {getProjectPeriodLabel(newProject.fiscalYear, newProject.halfPeriod)}
                                    </p>
                                    <p className="text-[10px] text-slate-500 font-bold">{newProject.description || '説明'}</p>
                                </div>
                            </div>
                        </div>

                        {/* フッター */}
                        <div className="p-6" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                            <button
                                onClick={editingProject ? handleSaveEdit : handleAddProject}
                                disabled={!newProject.name.trim()}
                                className="w-full py-4 rounded-2xl text-sm font-black text-white transition-all active:scale-[0.98] disabled:opacity-40"
                                style={{
                                    background: newProject.name.trim() ? 'linear-gradient(135deg, #ef4444, #dc2626)' : 'rgba(255,255,255,0.06)',
                                    boxShadow: newProject.name.trim() ? '0 10px 40px rgba(239, 68, 68, 0.2)' : 'none',
                                }}
                            >
                                {editingProject ? 'プロジェクトを更新' : 'プロジェクトを作成'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* 目標ファイルアップロードモーダル */}
            {showGoalUploadModal && (
                <div className="fixed inset-0 z-[200] flex items-center justify-center p-4"
                    style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(12px)' }}
                    onClick={() => setShowGoalUploadModal(false)}
                >
                    <div
                        className="w-full max-w-2xl rounded-[2.5rem] overflow-hidden shadow-2xl max-h-[90vh] overflow-y-auto custom-scrollbar"
                        style={{ background: '#0f172a', border: '1px solid rgba(255,255,255,0.08)' }}
                        onClick={e => e.stopPropagation()}
                    >
                        {/* ヘッダ */}
                        <div className="p-6 flex justify-between items-center"
                            style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}
                        >
                            <h2 className="text-lg font-black text-white flex items-center gap-3">
                                <Target className="w-5 h-5 text-amber-400" />
                                目標ファイルから一括作成
                            </h2>
                            <button onClick={() => setShowGoalUploadModal(false)}
                                className="p-2 rounded-xl hover:bg-white/5 transition-colors">
                                <X className="w-5 h-5 text-slate-500" />
                            </button>
                        </div>

                        <div className="p-6 space-y-5">
                            {/* 対象年度・期 */}
                            <div>
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block">
                                    📅 対象年度・期
                                </label>
                                <div className="grid grid-cols-2 gap-3">
                                    <select
                                        value={goalFiscalYear}
                                        onChange={e => setGoalFiscalYear(parseInt(e.target.value))}
                                        className="px-4 py-3 rounded-xl text-sm font-bold text-white outline-none appearance-none cursor-pointer"
                                        style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }}
                                    >
                                        {fiscalYearOptions.map(y => (
                                            <option key={y} value={y} style={{ background: '#1e293b' }}>{y}年度</option>
                                        ))}
                                    </select>
                                    <select
                                        value={goalHalfPeriod}
                                        onChange={e => setGoalHalfPeriod(e.target.value as 'H1' | 'H2')}
                                        className="px-4 py-3 rounded-xl text-sm font-bold text-white outline-none appearance-none cursor-pointer"
                                        style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }}
                                    >
                                        <option value="H1" style={{ background: '#1e293b' }}>上半期 (4月〜9月)</option>
                                        <option value="H2" style={{ background: '#1e293b' }}>下半期 (10月〜3月)</option>
                                    </select>
                                </div>
                            </div>

                            {/* ファイルアップロード */}
                            <div>
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block">
                                    📎 目標ファイル (Excel / CSV)
                                </label>
                                {/* input をゾーン全体に重ねる方式（最も確実） */}
                                <div style={{ position: 'relative', width: '100%' }}>
                                    <div
                                        className="w-full py-8 rounded-2xl border-2 border-dashed flex flex-col items-center gap-3"
                                        style={{ borderColor: goalUploading ? 'rgba(245,158,11,0.4)' : 'rgba(255,255,255,0.15)' }}
                                    >
                                        {goalUploading ? (
                                            <div className="animate-spin w-8 h-8 border-2 border-amber-500 border-t-transparent rounded-full" />
                                        ) : (
                                            <>
                                                <FileSpreadsheet className="w-10 h-10 text-amber-400" />
                                                <span className="text-sm font-bold text-slate-400">クリックしてファイルを選択</span>
                                                <span className="text-[10px] text-slate-600">対応形式: .xlsx, .xls, .csv</span>
                                            </>
                                        )}
                                    </div>
                                    {/* 透明inputをゾーン全体に絶対配置 */}
                                    <input
                                        ref={goalFileInputRef}
                                        type="file"
                                        accept=".xlsx,.xls,.csv"
                                        onChange={handleGoalFileSelect}
                                        disabled={goalUploading}
                                        style={{
                                            position: 'absolute',
                                            top: 0, left: 0,
                                            width: '100%', height: '100%',
                                            opacity: 0,
                                            cursor: 'pointer',
                                        }}
                                    />
                                </div>
                            </div>

                            {/* エラー表示 */}
                            {goalUploadError && (
                                <div className="p-4 rounded-xl flex items-start gap-3"
                                    style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)' }}
                                >
                                    <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
                                    <p className="text-sm font-bold text-red-300">{goalUploadError}</p>
                                </div>
                            )}

                            {/* プレビュー */}
                            {goalParsedProjects.length > 0 && (
                                <div className="space-y-3">
                                    <div className="flex items-center gap-2">
                                        <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                                        <span className="text-xs font-black text-emerald-400">
                                            {goalParsedProjects.length}件のプロジェクトを検出
                                        </span>
                                    </div>

                                    {goalParsedProjects.map((proj, pi) => (
                                        <div key={pi} className="rounded-2xl p-4 space-y-3"
                                            style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}
                                        >
                                            <div className="flex items-center justify-between">
                                                <div>
                                                    <h4 className="text-sm font-black text-white flex items-center gap-2">
                                                        🏢 {proj.department}
                                                    </h4>
                                                    <p className="text-[10px] text-slate-500 font-bold mt-0.5">
                                                        評価者: {proj.evaluatorTitle}
                                                    </p>
                                                </div>
                                                <span className="text-[10px] px-2.5 py-1 rounded-full font-black text-amber-400"
                                                    style={{ background: 'rgba(245,158,11,0.15)' }}
                                                >
                                                    {proj.epics.length}エピック
                                                </span>
                                            </div>

                                            {/* エピック一覧 */}
                                            <div className="space-y-1.5">
                                                {proj.epics.map((epic, ei) => (
                                                    <div key={ei} className="flex items-center gap-3 px-3 py-2 rounded-xl"
                                                        style={{ background: 'rgba(255,255,255,0.02)' }}
                                                    >
                                                        <span className="text-[10px] font-black text-amber-400 w-10 text-right">
                                                            {epic.weight}%
                                                        </span>
                                                        <div className="flex-1 min-w-0">
                                                            <p className="text-xs font-bold text-white truncate">{epic.name}</p>
                                                            <p className="text-[10px] text-slate-500 truncate">
                                                                {epic.dueDate} | {epic.goal}
                                                            </p>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>

                                            {/* 重み合計 */}
                                            <div className="flex justify-end">
                                                <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${
                                                    proj.epics.reduce((s, e) => s + e.weight, 0) === 100
                                                        ? 'text-emerald-400 bg-emerald-500/10'
                                                        : 'text-red-400 bg-red-500/10'
                                                }`}>
                                                    合計: {proj.epics.reduce((s, e) => s + e.weight, 0)}%
                                                </span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {/* ファイルフォーマットの説明 */}
                            {goalParsedProjects.length === 0 && !goalUploadError && (
                                <div className="p-4 rounded-xl" style={{ background: 'rgba(255,255,255,0.02)' }}>
                                    <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">ファイルフォーマット</p>
                                    <div className="grid grid-cols-7 gap-1 text-[9px] font-bold text-slate-500">
                                        {['部署', '役職', '役割', 'いつまで', 'どのような状態', 'ルール', '重み(配分)'].map((h, i) => (
                                            <div key={i} className="px-2 py-1.5 rounded text-center"
                                                style={{ background: 'rgba(245,158,11,0.1)', color: '#fbbf24' }}
                                            >{h}</div>
                                        ))}
                                    </div>
                                    <p className="text-[9px] text-slate-600 mt-2">※ 1つの部署 = 1プロジェクト、各行 = エピック（最大5つ）</p>
                                </div>
                            )}
                        </div>

                        {/* フッター */}
                        {goalParsedProjects.length > 0 && (
                            <div className="p-6" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                                <button
                                    onClick={handleGoalCreateProjects}
                                    className="w-full py-4 rounded-2xl text-sm font-black text-white transition-all active:scale-[0.98]"
                                    style={{
                                        background: 'linear-gradient(135deg, #f59e0b, #d97706)',
                                        boxShadow: '0 10px 40px rgba(245, 158, 11, 0.2)',
                                    }}
                                >
                                    🎯 {goalParsedProjects.length}件のプロジェクトを一括作成
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* ポータル設定 */}
            {showSettings && isAdmin && (
                <PortalSettings
                    onClose={() => setShowSettings(false)}
                    projects={projects}
                    onUpdateProject={handleUpdateProject}
                    currentUser={user}
                    gasUrl={gasUrl}
                    onUpdateGasUrl={(url: string) => {
                        localStorage.setItem('board_gas_url', url);
                        setGasUrl(url);
                    }}
                />
            )}

            {/* ログアウト確認 */}
            {showLogoutConfirm && (
                <div className="fixed inset-0 z-[200] flex items-center justify-center p-4"
                    style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(12px)' }}
                >
                    <div className="w-full max-w-sm rounded-[2rem] p-8 text-center"
                        style={{ background: '#0f172a', border: '1px solid rgba(255,255,255,0.08)' }}
                    >
                        <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4"
                            style={{ background: 'rgba(239,68,68,0.15)' }}
                        >
                            <LogOut className="w-8 h-8 text-red-400" />
                        </div>
                        <h3 className="text-lg font-black text-white mb-2">ログアウトしますか？</h3>
                        <p className="text-xs text-slate-500 font-bold mb-6">ポータルからログアウトします</p>
                        <div className="flex gap-3">
                            <button
                                onClick={() => setShowLogoutConfirm(false)}
                                className="flex-1 py-3 rounded-xl text-sm font-bold text-slate-400 transition-all"
                                style={{ background: 'rgba(255,255,255,0.06)' }}
                            >
                                キャンセル
                            </button>
                            <button
                                onClick={onLogout}
                                className="flex-1 py-3 rounded-xl text-sm font-black text-white transition-all active:scale-95"
                                style={{ background: 'linear-gradient(135deg, #ef4444, #dc2626)' }}
                            >
                                ログアウト
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Portal;
