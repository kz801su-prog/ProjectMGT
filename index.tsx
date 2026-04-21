
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

  const [state, setState] = useState<AppState>({ screen: 'portal-login' });

  const handlePortalLogin = (user: PortalUser) => {
    // セッションはメモリのみ（localStorageに保存しない＝リロードで自動ログインしない）
    localStorage.removeItem('portal_current_user');
    localStorage.removeItem('portal_current_project');
    setState({ screen: 'portal', user });
  };

  const handleOpenProject = (projectId: string) => {
    if (state.screen !== 'portal') return;
    setState({ screen: 'project', user: state.user, projectId });
  };

  const handleBackToPortal = () => {
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
          onLogout={handlePortalLogout}
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
