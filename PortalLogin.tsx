
import React, { useState, useEffect } from 'react';
import { Shield, Lock, Eye, EyeOff, Sparkles, UserPlus, RefreshCw } from 'lucide-react';
import { PortalUser } from './portalTypes';
import { getPortalUsers, savePortalUsers } from './projectDataService';
import { fetchPortalUsers, savePortalUsers as savePortalUsersToSql } from './mysqlService';

interface PortalLoginProps {
    onLogin: (user: PortalUser) => void;
    apiUrl?: string;
}

const inputStyle: React.CSSProperties = {
    background: 'rgba(255,255,255,0.06)',
    border: '1px solid rgba(255,255,255,0.1)',
};
const inputFocus = (e: React.FocusEvent<HTMLInputElement | HTMLSelectElement>) => {
    e.target.style.borderColor = 'rgba(239, 68, 68, 0.5)';
    e.target.style.boxShadow = '0 0 0 4px rgba(239, 68, 68, 0.1)';
};
const inputBlur = (e: React.FocusEvent<HTMLInputElement | HTMLSelectElement>) => {
    e.target.style.borderColor = 'rgba(255,255,255,0.1)';
    e.target.style.boxShadow = 'none';
};

const PortalLogin: React.FC<PortalLoginProps> = ({ onLogin, apiUrl }) => {
    // ログイン用
    const [loginEmployeeId, setLoginEmployeeId] = useState('');
    const [loginPassword, setLoginPassword] = useState('');
    const [showLoginPassword, setShowLoginPassword] = useState(false);

    // 初期設定用
    const [setupEmployeeId, setSetupEmployeeId] = useState('');
    const [setupName, setSetupName] = useState('');
    const [setupPassword, setSetupPassword] = useState('');
    const [showSetupPassword, setShowSetupPassword] = useState(false);
    const [setupRole, setSetupRole] = useState<'admin' | 'manager' | 'user' | 'executive'>('admin');

    const [error, setError] = useState('');
    const [successMsg, setSuccessMsg] = useState('');
    const [isSetup, setIsSetup] = useState(false);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    // 起動時にMySQLからユーザーを取得してlocalStorageに同期
    useEffect(() => {
        const syncFromMysql = async () => {
            if (apiUrl) {
                try {
                    const mysqlUsers = await fetchPortalUsers(apiUrl);
                    // パスワードが設定されているユーザーのみ有効とする
                    const usersWithPassword = mysqlUsers.filter(u => u.portalPassword && u.portalPassword.trim() !== '');
                    if (usersWithPassword.length > 0) {
                        const localUsers: PortalUser[] = usersWithPassword.map(u => ({
                            id: u.employeeId || `user-${u.name}`,
                            name: u.name,
                            role: u.role as PortalUser['role'],
                            password: u.portalPassword,
                            department: u.department,
                            employeeId: u.employeeId,
                            allowedProjectIds: u.allowedProjectIds || [],
                        }));
                        savePortalUsers(localUsers);
                    } else {
                        // パスワード未設定ユーザーのみ → 初期設定モード
                        savePortalUsers([]);
                    }
                } catch {
                    // MySQL取得失敗時はlocalStorageのデータで続行
                }
            }
            const users = getPortalUsers();
            setIsSetup(users.length === 0);
            setLoading(false);
        };
        syncFromMysql();
    }, [apiUrl]);

    // ログイン処理
    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        if (!loginEmployeeId.trim()) { setError('社員IDまたは氏名を入力してください'); return; }
        if (!loginPassword.trim()) { setError('パスワードを入力してください'); return; }

        const users = getPortalUsers();
        const input = loginEmployeeId.trim();
        // 社員ID → id → 氏名の順で検索
        const user = users.find(u => u.employeeId === input)
            ?? users.find(u => u.id === input)
            ?? users.find(u => u.name === input);
        if (!user) { setError('ユーザーが見つかりません（社員IDまたは氏名を確認してください）'); return; }
        if (user.password !== loginPassword) { setError('パスワードが正しくありません'); return; }
        onLogin(user);
    };

    // 初期登録処理
    const handleSetup = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setSuccessMsg('');
        if (!setupEmployeeId.trim()) { setError('社員IDを入力してください'); return; }
        if (!setupName.trim()) { setError('氏名を入力してください'); return; }
        if (!setupPassword.trim()) { setError('パスワードを入力してください'); return; }
        if (setupPassword.length < 4) { setError('パスワードは4文字以上にしてください'); return; }

        setSaving(true);
        const newUser: PortalUser = {
            id: setupEmployeeId.trim(),
            name: setupName.trim(),
            role: setupRole,
            password: setupPassword,
            employeeId: setupEmployeeId.trim(),
        };

        // localStorageに保存
        savePortalUsers([newUser]);

        // MySQLに保存
        if (apiUrl) {
            try {
                await savePortalUsersToSql(apiUrl, [{
                    employeeId: setupEmployeeId.trim(),
                    name: setupName.trim(),
                    department: '',
                    portalPassword: setupPassword,
                    role: setupRole,
                    allowedProjectIds: [],
                }]);
                setSuccessMsg('登録完了！ログインします...');
                setTimeout(() => onLogin(newUser), 800);
            } catch (e) {
                // MySQL失敗でもlocalStorageには保存済みなのでログイン可能
                setSuccessMsg('登録完了（SQLへの保存は次回同期時）。ログインします...');
                setTimeout(() => onLogin(newUser), 800);
            }
        } else {
            setSuccessMsg('登録完了！ログインします...');
            setTimeout(() => onLogin(newUser), 800);
        }
        setSaving(false);
    };

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center"
                style={{ background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)' }}
            >
                <div className="flex flex-col items-center gap-3">
                    <RefreshCw className="w-8 h-8 text-red-400 animate-spin" />
                    <div className="text-white/50 text-sm font-bold">認証情報を読み込み中...</div>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen flex items-center justify-center p-4"
            style={{ background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)' }}
        >
            {/* 背景装飾 */}
            <div className="fixed inset-0 overflow-hidden pointer-events-none">
                <div className="absolute -top-40 -right-40 w-96 h-96 rounded-full opacity-10"
                    style={{ background: 'radial-gradient(circle, #ef4444, transparent)' }} />
                <div className="absolute -bottom-40 -left-40 w-96 h-96 rounded-full opacity-10"
                    style={{ background: 'radial-gradient(circle, #3b82f6, transparent)' }} />
            </div>

            <div className="relative w-full max-w-md">
                <div className="backdrop-blur-xl rounded-[2.5rem] border border-white/10 shadow-2xl overflow-hidden"
                    style={{ background: 'rgba(255,255,255,0.05)' }}
                >
                    {/* ヘッダー */}
                    <div className="p-8 pb-4 text-center">
                        <div className="inline-flex items-center justify-center w-20 h-20 rounded-3xl mb-6 shadow-2xl relative"
                            style={{
                                background: isSetup
                                    ? 'linear-gradient(135deg, #f59e0b, #d97706)'
                                    : 'linear-gradient(135deg, #ef4444, #dc2626)',
                                boxShadow: isSetup
                                    ? '0 20px 60px rgba(245,158,11,0.3)'
                                    : '0 20px 60px rgba(239,68,68,0.3)',
                            }}
                        >
                            {isSetup ? <UserPlus className="w-10 h-10 text-white" /> : <Shield className="w-10 h-10 text-white" />}
                            <div className="absolute -top-1 -right-1 w-6 h-6 bg-amber-400 rounded-full flex items-center justify-center">
                                <Sparkles className="w-3 h-3 text-amber-900" />
                            </div>
                        </div>
                        <h1 className="text-3xl font-black text-white mb-2 tracking-tight">Project MGT</h1>
                        <p className="text-xs font-bold uppercase tracking-[0.3em]"
                            style={{ color: isSetup ? '#fbbf24' : '#94a3b8' }}>
                            {isSetup ? '初期管理者登録' : 'PORTAL LOGIN'}
                        </p>
                        {isSetup && (
                            <p className="text-[10px] text-amber-400/70 mt-2 font-bold">
                                最初の管理者アカウントを作成してください
                            </p>
                        )}
                    </div>

                    {/* エラー・成功メッセージ */}
                    <div className="px-8">
                        {error && (
                            <div className="p-4 rounded-2xl text-xs font-bold text-red-300 flex items-center gap-3 mb-4"
                                style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)' }}
                            >
                                <span>⚠️</span> {error}
                            </div>
                        )}
                        {successMsg && (
                            <div className="p-4 rounded-2xl text-xs font-bold text-green-300 flex items-center gap-3 mb-4"
                                style={{ background: 'rgba(34,197,94,0.15)', border: '1px solid rgba(34,197,94,0.3)' }}
                            >
                                <span>✅</span> {successMsg}
                            </div>
                        )}
                    </div>

                    {/* ===== ログインフォーム ===== */}
                    {!isSetup && (
                        <form onSubmit={handleLogin} className="px-8 pb-6 space-y-5">
                            <div>
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block">
                                    社員ID または 氏名
                                </label>
                                <input
                                    type="text"
                                    value={loginEmployeeId}
                                    onChange={e => setLoginEmployeeId(e.target.value)}
                                    className="w-full p-4 rounded-2xl text-sm font-bold text-white outline-none transition-all"
                                    style={inputStyle}
                                    onFocus={inputFocus}
                                    onBlur={inputBlur}
                                    autoComplete="username"
                                    placeholder="社員IDまたは氏名を入力"
                                />
                            </div>
                            <div>
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block">
                                    パスワード
                                </label>
                                <div className="relative">
                                    <input
                                        type={showLoginPassword ? 'text' : 'password'}
                                        value={loginPassword}
                                        onChange={e => setLoginPassword(e.target.value)}
                                        className="w-full p-4 pr-14 rounded-2xl text-sm font-bold text-white outline-none transition-all"
                                        style={inputStyle}
                                        onFocus={inputFocus}
                                        onBlur={inputBlur}
                                        autoComplete="current-password"
                                        placeholder="パスワードを入力"
                                    />
                                    <button type="button" onClick={() => setShowLoginPassword(!showLoginPassword)}
                                        className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors">
                                        {showLoginPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                                    </button>
                                </div>
                            </div>
                            <button type="submit"
                                className="w-full p-4 rounded-2xl font-black text-sm text-white transition-all active:scale-[0.98] relative overflow-hidden group"
                                style={{ background: 'linear-gradient(135deg, #ef4444, #dc2626)', boxShadow: '0 10px 40px rgba(239,68,68,0.25)' }}
                            >
                                <span className="relative z-10 flex items-center justify-center gap-2">
                                    <Lock className="w-4 h-4" /> ログイン
                                </span>
                                <div className="absolute inset-0 bg-white/10 translate-y-full group-hover:translate-y-0 transition-transform duration-300" />
                            </button>
                        </form>
                    )}

                    {/* ===== 初期設定フォーム ===== */}
                    {isSetup && (
                        <form onSubmit={handleSetup} className="px-8 pb-6 space-y-4">
                            <div>
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block">
                                    社員ID <span className="text-red-400">*</span>
                                </label>
                                <input
                                    type="text"
                                    value={setupEmployeeId}
                                    onChange={e => setSetupEmployeeId(e.target.value)}
                                    className="w-full p-4 rounded-2xl text-sm font-bold text-white outline-none transition-all"
                                    style={inputStyle}
                                    onFocus={inputFocus}
                                    onBlur={inputBlur}
                                    autoComplete="off"
                                    placeholder="例: EMP001"
                                />
                            </div>
                            <div>
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block">
                                    氏名 <span className="text-red-400">*</span>
                                </label>
                                <input
                                    type="text"
                                    value={setupName}
                                    onChange={e => setSetupName(e.target.value)}
                                    className="w-full p-4 rounded-2xl text-sm font-bold text-white outline-none transition-all"
                                    style={inputStyle}
                                    onFocus={inputFocus}
                                    onBlur={inputBlur}
                                    autoComplete="off"
                                    placeholder="氏名を入力"
                                />
                            </div>
                            <div>
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block">
                                    パスワード <span className="text-red-400">*</span>
                                </label>
                                <div className="relative">
                                    <input
                                        type={showSetupPassword ? 'text' : 'password'}
                                        value={setupPassword}
                                        onChange={e => setSetupPassword(e.target.value)}
                                        className="w-full p-4 pr-14 rounded-2xl text-sm font-bold text-white outline-none transition-all"
                                        style={inputStyle}
                                        onFocus={inputFocus}
                                        onBlur={inputBlur}
                                        autoComplete="new-password"
                                        placeholder="4文字以上"
                                    />
                                    <button type="button" onClick={() => setShowSetupPassword(!showSetupPassword)}
                                        className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors">
                                        {showSetupPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                                    </button>
                                </div>
                            </div>
                            <div>
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block">
                                    ロール
                                </label>
                                <select
                                    value={setupRole}
                                    onChange={e => setSetupRole(e.target.value as PortalUser['role'])}
                                    className="w-full p-4 rounded-2xl text-sm font-bold text-white outline-none appearance-none cursor-pointer"
                                    style={inputStyle}
                                    onFocus={inputFocus}
                                    onBlur={inputBlur}
                                >
                                    <option value="admin" style={{ background: '#1e293b' }}>👑 Admin（管理者）</option>
                                    <option value="executive" style={{ background: '#1e293b' }}>🏢 Executive（役員）</option>
                                    <option value="manager" style={{ background: '#1e293b' }}>📋 Manager（部門長）</option>
                                    <option value="user" style={{ background: '#1e293b' }}>👤 User（一般）</option>
                                </select>
                            </div>
                            <button type="submit" disabled={saving}
                                className="w-full p-4 rounded-2xl font-black text-sm text-white transition-all active:scale-[0.98] relative overflow-hidden group disabled:opacity-60"
                                style={{ background: 'linear-gradient(135deg, #f59e0b, #d97706)', boxShadow: '0 10px 40px rgba(245,158,11,0.25)' }}
                            >
                                <span className="relative z-10 flex items-center justify-center gap-2">
                                    {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
                                    {saving ? '登録中...' : '管理者アカウントを作成'}
                                </span>
                                <div className="absolute inset-0 bg-white/10 translate-y-full group-hover:translate-y-0 transition-transform duration-300" />
                            </button>
                        </form>
                    )}

                    {/* フッター */}
                    <div className="px-8 pb-6 text-center space-y-3">
                        <p className="text-[10px] text-slate-600 font-bold">
                            Project MGT Portal — Multi-Project Management System
                        </p>
                        <button
                            type="button"
                            onClick={() => {
                                if (!window.confirm('ログイン設定を初期化しますか？\n\n⚠️ プロジェクト・タスク・目標データは消去されません。\nログインユーザー設定のみリセットされます。')) return;
                                const keysToKeep: string[] = [];
                                for (let i = 0; i < localStorage.length; i++) {
                                    const key = localStorage.key(i);
                                    if (key && (
                                        key.startsWith('portal_projects') ||
                                        key.startsWith('portal_team_members') ||
                                        key.startsWith('project_') ||
                                        key.startsWith('board_')
                                    )) keysToKeep.push(key);
                                }
                                const savedData: Record<string, string> = {};
                                keysToKeep.forEach(key => { savedData[key] = localStorage.getItem(key) || ''; });
                                localStorage.clear();
                                Object.entries(savedData).forEach(([key, val]) => { if (val) localStorage.setItem(key, val); });
                                window.location.reload();
                            }}
                            className="text-[9px] text-slate-700 hover:text-red-400 font-bold transition-colors underline underline-offset-4 opacity-50 hover:opacity-100"
                        >
                            ログイン設定を初期化（プロジェクトデータは保持）
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default PortalLogin;
