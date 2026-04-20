
import React, { useState } from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import Portal from './Portal';
import PortalLogin from './PortalLogin';
import { PortalUser } from './portalTypes';
import { MemberInfo } from './types';
import { getGlobalTeamMembers } from './projectDataService';
import { DEFAULT_GAS_URL } from './constants';

console.log("%c[SYSTEM] V13.0-MULTI-PROJECT LOADED", "color: #ef4444; font-weight: bold; font-size: 16px;");

type AppState =
  | { screen: 'portal-login' }
  | { screen: 'portal'; user: PortalUser }
  | { screen: 'project'; user: PortalUser; projectId: string };

const Root: React.FC = () => {
  // 社員マスター（Portal起動時にSQLから同期、設定変更時も更新）
  const [globalTeamMembers, setGlobalTeamMembers] = useState<MemberInfo[]>(() => getGlobalTeamMembers() as MemberInfo[]);

  const [state, setState] = useState<AppState>(() => {
    // セッション復元: ログイン状態のみ復元（プロジェクトには自動で入らない）
    // プロジェクトへはポータル画面から手動でクリックして入る
    localStorage.removeItem('portal_current_project'); // 前回のプロジェクト選択をクリア
    const savedUser = localStorage.getItem('portal_current_user');
    if (savedUser) {
      try {
        const user = JSON.parse(savedUser) as PortalUser;
        return { screen: 'portal', user };
      } catch { }
    }
    return { screen: 'portal-login' };
  });

  const handlePortalLogin = (user: PortalUser) => {
    localStorage.setItem('portal_current_user', JSON.stringify(user));
    setState({ screen: 'portal', user });
  };

  const handleOpenProject = (projectId: string) => {
    if (state.screen !== 'portal') return;
    localStorage.setItem('portal_current_project', projectId);
    setState({ screen: 'project', user: state.user, projectId });
  };

  const handleBackToPortal = () => {
    localStorage.removeItem('portal_current_project');
    if (state.screen === 'project') {
      setState({ screen: 'portal', user: state.user });
    }
  };

  const handlePortalLogout = () => {
    localStorage.removeItem('portal_current_user');
    localStorage.removeItem('portal_current_project');
    setState({ screen: 'portal-login' });
  };

  switch (state.screen) {
    case 'portal-login':
      return <PortalLogin onLogin={handlePortalLogin} apiUrl={localStorage.getItem('board_gas_url') || DEFAULT_GAS_URL} />;

    case 'portal':
      return (
        <Portal
          user={state.user}
          onOpenProject={handleOpenProject}
          onLogout={handlePortalLogout}
          onTeamMembersLoaded={setGlobalTeamMembers}
        />
      );

    case 'project':
      return (
        <App
          projectId={state.projectId}
          portalUser={state.user}
          onBackToPortal={handleBackToPortal}
          globalTeamMembers={globalTeamMembers}
        />
      );
  }
};

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>
);
