
import React, { useState } from 'react';
import { Shield, Lock, Eye, EyeOff, Sparkles } from 'lucide-react';
import { PortalUser } from './portalTypes';
import { getPortalUsers, savePortalUsers } from './projectDataService';

interface PortalLoginProps {
    onLogin: (user: PortalUser) => void;
}

const PortalLogin: React.FC<PortalLoginProps> = ({ onLogin }) => {
    const [name, setName] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [error, setError] = useState('');
    const [isSetup, setIsSetup] = useState(() => {
        const users = getPortalUsers();
        return users.length === 0;
    });
    const [setupRole, setSetupRole] = useState<'admin' | 'manager' | 'user'>('admin');

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        setError('');

        if (!name.trim()) {
            setError('名前を入力してください');
            return;
        }
        if (!password.trim()) {
            setError('パスワードを入力してください');
            return;
        }

        if (isSetup) {
            // 初回セットアップ: 管理者アカウント作成
            const newUser: PortalUser = {
                id: `user-${Date.now()}`,
                name: name.trim(),
                role: setupRole,
                password: password,
            };
            savePortalUsers([newUser]);
            onLogin(newUser);
        } else {
            // ログイン検証
            const users = getPortalUsers();
            const user = users.find(u => u.name === name.trim());
            if (!user) {
                setError('ユーザーが見つかりません');
                return;
            }
            if (user.password !== password) {
                setError('パスワードが正しくありません');
                return;
            }
            onLogin(user);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center p-4"
            style={{
                background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)',
            }}
        >
            {/* 背景装飾 */}
            <div className="fixed inset-0 overflow-hidden pointer-events-none">
                <div className="absolute -top-40 -right-40 w-96 h-96 rounded-full opacity-10"
                    style={{ background: 'radial-gradient(circle, #ef4444, transparent)' }} />
                <div className="absolute -bottom-40 -left-40 w-96 h-96 rounded-full opacity-10"
                    style={{ background: 'radial-gradient(circle, #3b82f6, transparent)' }} />
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full opacity-5"
                    style={{ background: 'radial-gradient(circle, #8b5cf6, transparent)' }} />
            </div>

            <div className="relative w-full max-w-md">
                {/* グラスモーフィズムカード */}
                <div className="backdrop-blur-xl rounded-[2.5rem] border border-white/10 shadow-2xl overflow-hidden"
                    style={{ background: 'rgba(255,255,255,0.05)' }}
                >
                    {/* ヘッダー */}
                    <div className="p-8 pb-4 text-center">
                        <div className="inline-flex items-center justify-center w-20 h-20 rounded-3xl mb-6 shadow-2xl relative"
                            style={{
                                background: 'linear-gradient(135deg, #ef4444, #dc2626)',
                                boxShadow: '0 20px 60px rgba(239, 68, 68, 0.3)',
                            }}
                        >
                            <Shield className="w-10 h-10 text-white" />
                            <div className="absolute -top-1 -right-1 w-6 h-6 bg-amber-400 rounded-full flex items-center justify-center">
                                <Sparkles className="w-3 h-3 text-amber-900" />
                            </div>
                        </div>
                        <h1 className="text-3xl font-black text-white mb-2 tracking-tight">
                            Project MGT
                        </h1>
                        <p className="text-xs text-slate-400 font-bold uppercase tracking-[0.3em]">
                            {isSetup ? 'ADMIN SETUP' : 'PORTAL LOGIN'}
                        </p>
                    </div>

                    {/* フォーム */}
                    <form onSubmit={handleSubmit} className="p-8 pt-4 space-y-5">
                        {error && (
                            <div className="p-4 rounded-2xl text-xs font-bold text-red-300 flex items-center gap-3"
                                style={{ background: 'rgba(239, 68, 68, 0.15)', border: '1px solid rgba(239, 68, 68, 0.3)' }}
                            >
                                <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0"
                                    style={{ background: 'rgba(239, 68, 68, 0.2)' }}>
                                    ⚠️
                                </div>
                                {error}
                            </div>
                        )}

                        <div>
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block">
                                name
                            </label>
                            <input
                                type="text"
                                value={name}
                                onChange={e => setName(e.target.value)}
                                className="w-full p-4 rounded-2xl text-sm font-bold text-white outline-none transition-all"
                                style={{
                                    background: 'rgba(255,255,255,0.06)',
                                    border: '1px solid rgba(255,255,255,0.1)',
                                }}
                                onFocus={e => {
                                    e.target.style.borderColor = 'rgba(239, 68, 68, 0.5)';
                                    e.target.style.boxShadow = '0 0 0 4px rgba(239, 68, 68, 0.1)';
                                }}
                                onBlur={e => {
                                    e.target.style.borderColor = 'rgba(255,255,255,0.1)';
                                    e.target.style.boxShadow = 'none';
                                }}
                                autoComplete="off"
                                placeholder="名前を入力"
                            />
                        </div>

                        <div>
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block">
                                {isSetup ? 'NEW PASSWORD' : 'PASSWORD'}
                            </label>
                            <div className="relative">
                                <input
                                    type={showPassword ? 'text' : 'password'}
                                    value={password}
                                    onChange={e => setPassword(e.target.value)}
                                    className="w-full p-4 pr-14 rounded-2xl text-sm font-bold text-white outline-none transition-all"
                                    style={{
                                        background: 'rgba(255,255,255,0.06)',
                                        border: '1px solid rgba(255,255,255,0.1)',
                                    }}
                                    onFocus={e => {
                                        e.target.style.borderColor = 'rgba(239, 68, 68, 0.5)';
                                        e.target.style.boxShadow = '0 0 0 4px rgba(239, 68, 68, 0.1)';
                                    }}
                                    onBlur={e => {
                                        e.target.style.borderColor = 'rgba(255,255,255,0.1)';
                                        e.target.style.boxShadow = 'none';
                                    }}
                                    autoComplete="new-password"
                                    placeholder="パスワードを入力"
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPassword(!showPassword)}
                                    className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors"
                                >
                                    {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                                </button>
                            </div>
                            {isSetup && (
                                <p className="text-[9px] text-amber-400/70 mt-2 font-bold ml-1">
                                    ※ このパスワードは管理者アカウントに使用されます
                                </p>
                            )}
                        </div>

                        {isSetup && (
                            <div>
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block">
                                    ROLE
                                </label>
                                <select
                                    value={setupRole}
                                    onChange={e => setSetupRole(e.target.value as 'admin' | 'manager' | 'user')}
                                    className="w-full p-4 rounded-2xl text-sm font-bold text-white outline-none appearance-none cursor-pointer"
                                    style={{
                                        background: 'rgba(255,255,255,0.06)',
                                        border: '1px solid rgba(255,255,255,0.1)',
                                    }}
                                >
                                    <option value="admin" style={{ background: '#1e293b' }}>👑 Admin（管理者）</option>
                                    <option value="manager" style={{ background: '#1e293b' }}>📋 Manager</option>
                                    <option value="user" style={{ background: '#1e293b' }}>👤 User</option>
                                </select>
                            </div>
                        )}

                        <button
                            type="submit"
                            className="w-full p-4 rounded-2xl font-black text-sm text-white transition-all active:scale-[0.98] relative overflow-hidden group"
                            style={{
                                background: 'linear-gradient(135deg, #ef4444, #dc2626)',
                                boxShadow: '0 10px 40px rgba(239, 68, 68, 0.25)',
                            }}
                        >
                            <span className="relative z-10 flex items-center justify-center gap-2">
                                <Lock className="w-4 h-4" />
                                {isSetup ? '管理者アカウントを作成' : 'ログイン'}
                            </span>
                            <div className="absolute inset-0 bg-white/10 translate-y-full group-hover:translate-y-0 transition-transform duration-300" />
                        </button>
                    </form>

                    {/* フッター */}
                    <div className="px-8 pb-6 text-center space-y-4">
                        <p className="text-[10px] text-slate-600 font-bold">
                            Project MGT Portal — Multi-Project Management System
                        </p>
                        <button
                            type="button"
                            onClick={() => {
                                if (window.confirm('ポータルの設定を初期化しますか？（作成した全てのプロジェクトやユーザー設定が消去されます）')) {
                                    localStorage.clear();
                                    window.location.reload();
                                }
                            }}
                            className="text-[9px] text-slate-700 hover:text-red-400 font-bold transition-colors underline underline-offset-4 opacity-50 hover:opacity-100"
                        >
                            データを初期化して最初からやり直す
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default PortalLogin;
