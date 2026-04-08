import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  List, Calendar, Settings, RefreshCw, Plus, Search,
  CloudUpload, BrainCircuit, X, LayoutGrid, Loader2,
  Armchair, ShieldCheck, Users, Trash2, UserPlus, Lock, CheckCircle, AlertTriangle, LogOut, Link as LinkIcon, Activity,
  FileCode, Copy, Check, Award, Briefcase, Edit2, Bell, Star, TrendingUp, Target, CheckCircle2,
  ArrowLeft, Download, Upload, Crown, Filter, Clock
} from 'lucide-react';
import { Task, TaskStatus, TaskPriority, MemberInfo, TaskComment, ProjectConcept, Attachment } from './types';
import { fetchTasksFromSheet, syncAllTasksToSheet, saveSingleTaskToSheet, saveProjectConceptToSheet, saveEpicsToSheet, saveGoalEpicsToSql } from './mysqlService';
import { analyzeProgress } from './geminiService';
import { DashboardCards } from './components/DashboardCards';
import { TaskItem } from './components/TaskItem';
import ProjectSearch from './components/ProjectSearch';
import { TimelineView } from './components/TimelineView';
import { MatrixView } from './components/MatrixView';
import { EvaluationView } from './components/EvaluationView';
import { EpicListView } from './components/EpicListView';
import { ActivityHistoryModal } from './components/ActivityHistoryModal';
import { DEFAULT_GAS_URL, INITIAL_TASKS, DEFAULT_CLIQ_URL, MEMBERS as INITIAL_MEMBERS, ADMIN_USER_NAME, SHEET_GID, DEFAULT_PROJECTS } from './constants';
import { PortalUser, getProjectPeriodLabel, GoalEpic } from './portalTypes';
import { getProjectGasUrl, saveProjectGasUrl, getProjectCliqUrl, saveProjectCliqUrl, getProjectPassword, saveProjectPassword, getProjects as getProjectsMeta, getProjectEpics, saveProjectEpics, getProjectMembers, saveProjectMembers, updateProject as updateProjectInStore } from './projectDataService';

import GAS_CODE from './server/Code.js?raw';

const APP_VERSION = "v13.0-MULTI-PROJECT";

interface AppProps {
  projectId?: string;
  portalUser?: PortalUser;
  onBackToPortal?: () => void;
}

const App: React.FC<AppProps> = ({ projectId, portalUser, onBackToPortal }) => {
  // プロジェクトメタを1回だけ取得してすべての派生値に使い回す
  const currentProjectMeta = useMemo(() =>
    projectId ? getProjectsMeta().find(p => p.id === projectId) : undefined,
  [projectId]);

  const currentSheetName = currentProjectMeta?.sheetName;
  const portalProjectName = currentProjectMeta?.name;
  const portalProjectIcon = currentProjectMeta?.icon;
  const portalProjectPeriod = currentProjectMeta
    ? getProjectPeriodLabel(currentProjectMeta.fiscalYear, currentProjectMeta.halfPeriod)
    : '';

  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(false);
  const [isInitialLoadDone, setIsInitialLoadDone] = useState(false);
  const [viewMode, setViewMode] = useState<'list' | 'timeline' | 'matrix' | 'evaluation'>('list');
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showActivityModal, setShowActivityModal] = useState(false);
  const [showManagerSettingsModal, setShowManagerSettingsModal] = useState(false);
  const [managerSettingsTab, setManagerSettingsTab] = useState<'evaluation' | 'results' | 'members' | 'epics' | 'score'>('evaluation');
  const [showEvaluatorModal, setShowEvaluatorModal] = useState(false);
  const [evaluatorTab, setEvaluatorTab] = useState<'evaluation' | 'results' | 'epics' | 'score'>('evaluation');
  const [showSearch, setShowSearch] = useState(false);
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const [settingsTab, setSettingsTab] = useState<'general' | 'concept' | 'notifications' | 'members' | 'evaluation' | 'evaluation_tasks' | 'epics' | 'maintenance' | 'dept_evaluation' | 'scores'>('general');
  const [localProjectScore, setLocalProjectScore] = useState<number>(() => {
    if (projectId) {
      const proj = getProjectsMeta().find(p => p.id === projectId);
      return proj?.projectScore ?? 0;
    }
    return 0;
  });
  const [expandedTaskId, setExpandedTaskId] = useState<string | null>(null);
  const [initialTaskTab, setInitialTaskTab] = useState<'basic' | 'chat' | 'files' | 'hierarchy'>('basic');
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [copySuccess, setCopySuccess] = useState(false);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isSavingRef = useRef(false);
  const pendingSaveRef = useRef<{ task: Task; immediate: boolean } | null>(null);

  // GAS URLの二重化を自動修正するサニタイザー
  const sanitizeGasUrl = (url: string | null): string => {
    if (!url) return DEFAULT_GAS_URL;
    // URLが二重に結合されている場合を検出・修正 (例: ...exechttps://...exec → ...exec)
    const execIndex = url.indexOf('/exec');
    if (execIndex !== -1 && url.indexOf('https://', execIndex) !== -1) {
      const cleanUrl = url.substring(0, execIndex + '/exec'.length);
      console.warn('[URL Fix] Doubled GAS URL detected and fixed:', url, '->', cleanUrl);
      localStorage.setItem('board_gas_url', cleanUrl);
      return cleanUrl;
    }
    return url.trim();
  };

  const [settings, setSettings] = useState(() => {
    // プロジェクト固有のGAS URLがあればそちらを使用
    const projectGasUrl = projectId ? getProjectGasUrl(projectId) : '';
    const projectCliqUrl = projectId ? getProjectCliqUrl(projectId) : '';
    let savedGasUrl = sanitizeGasUrl(projectGasUrl || localStorage.getItem('board_gas_url'));
    if (savedGasUrl && savedGasUrl.includes('script.google.com')) {
      savedGasUrl = DEFAULT_GAS_URL;
      localStorage.setItem('board_gas_url', DEFAULT_GAS_URL);
    }
    return {
      gasUrl: savedGasUrl ?? DEFAULT_GAS_URL,
      cliqUrl: projectCliqUrl || localStorage.getItem('board_cliq_url') || DEFAULT_CLIQ_URL,
      reportTime: localStorage.getItem('board_report_time') || 'Monday 08:00',
      userName: portalUser?.name || localStorage.getItem('board_user_name') || ''
    };
  });

  // ポータルログイン名が変わった（または新規ログイン）場合に強制同期する
  useEffect(() => {
    if (portalUser?.name && settings.userName !== portalUser.name) {
      setSettings(prev => ({ ...prev, userName: portalUser.name }));
      localStorage.setItem('board_user_name', portalUser.name);
    }
  }, [portalUser?.name]);

  const [members, setMembers] = useState<MemberInfo[]>(() => {
    if (projectId) {
      const projectMembers = getProjectMembers(projectId);
      if (projectMembers.length > 0) return projectMembers;
      // goalEpicsがある＝Excelインポート新規プロジェクト → 他プロジェクトのメンバーを引き継がない
      const proj = getProjectsMeta().find(p => p.id === projectId);
      if (proj?.goalEpics && proj.goalEpics.length > 0) return [];
    }
    const saved = localStorage.getItem('board_members_v2');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      } catch (e) { }
    }
    return INITIAL_MEMBERS;
  });

  const isAdmin = useMemo(() => {
    const normalize = (name: string) => name.replace(/[\s　]+/g, '');
    if (normalize(settings.userName) === normalize(ADMIN_USER_NAME)) return true;
    if (portalUser?.role === 'admin') return true;
    const member = members?.find(m => normalize(m.name) === normalize(settings.userName));
    return member?.role === 'admin';
  }, [settings.userName, portalUser, members]);

  // Manager判定: portalUserのロールまたはメンバーリストのロールで判定
  // NOTE: members useState の後に配置すること！
  const isManager = useMemo(() => {
    if (portalUser?.role === 'manager') return true;
    const member = members?.find(m => m.name === settings.userName);
    return member?.role === 'manager';
  }, [settings.userName, portalUser, members]);

  const isExecutive = useMemo(() => {
    if (portalUser?.role === 'executive') return true;
    const member = members?.find(m => m.name === settings.userName);
    return member?.role === 'executive';
  }, [settings.userName, portalUser, members]);

  // 評価者: Manager/Admin は常に評価者。Adminが isEvaluator フラグをつけたメンバーも評価者
  const isEvaluatorUser = useMemo(() => {
    if (isAdmin || isManager) return true;
    return members?.find(m => m.name === settings.userName)?.isEvaluator === true;
  }, [isAdmin, isManager, members, settings.userName]);

  // Manager の担当部門: portalUser.department → メンバーリストのdepartment の順で取得
  const managerDepartment = useMemo(() => {
    if (!isManager) return null;
    if (portalUser?.department) return portalUser.department;
    return members.find(m => m.name === settings.userName)?.department || null;
  }, [isManager, portalUser, members, settings.userName]);

  const [epics, setEpics] = useState<string[]>(() => {
    if (projectId) {
      const proj = getProjectsMeta().find(p => p.id === projectId);
      // goalEpicsがあるプロジェクト: 常にgoalEpicsを最優先で使用
      if (proj?.goalEpics?.length) {
        return proj.goalEpics.map(e => e.name);
      }
      // goalEpicsがない場合は保存済みエピックを使用
      const projectEpics = getProjectEpics(projectId);
      if (projectEpics.length > 0) return projectEpics;
    }
    const saved = localStorage.getItem('board_epics');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      } catch (e) { }
    }
    return DEFAULT_PROJECTS;
  });

  // GoalEpics のローカル編集ステート (設定エピックタブで日付・メンバー配分を編集するため)
  const [localGoalEpics, setLocalGoalEpics] = useState<GoalEpic[]>(() => {
    if (projectId) {
      const proj = getProjectsMeta().find(p => p.id === projectId);
      return proj?.goalEpics ?? [];
    }
    return [];
  });

  const [searchTerm, setSearchTerm] = useState('');
  const [epicFilter, setEpicFilter] = useState<string | null>(null);
  const [showEpicList, setShowEpicList] = useState(false);
  const [showConceptModal, setShowConceptModal] = useState(false);
  const [isAiAnalyzing, setIsAiAnalyzing] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [showPushConfirm, setShowPushConfirm] = useState(false);
  const [timelineSelectedTaskId, setTimelineSelectedTaskId] = useState<string | null>(null);

  const [newEpicName, setNewEpicName] = useState('');
  const [editingEpicIdx, setEditingEpicIdx] = useState<number | null>(null);
  const [editingEpicName, setEditingEpicName] = useState('');
  const [newMemberName, setNewMemberName] = useState('');
  const [newMemberDept, setNewMemberDept] = useState('');
  const [newMemberBusinessUnit, setNewMemberBusinessUnit] = useState('');
  const [newMemberId, setNewMemberId] = useState('');
  const [editingMemberIdx, setEditingMemberIdx] = useState<number | null>(null);
  const [editingMemberName, setEditingMemberName] = useState('');
  const [newMemberRole, setNewMemberRole] = useState<'admin' | 'manager' | 'user' | 'executive'>('user');
  const [editingMemberRole, setEditingMemberRole] = useState<'admin' | 'manager' | 'user' | 'executive'>('user');
  const [memberDeptFilter, setMemberDeptFilter] = useState<string>('all');
  const csvMemberInputRef = useRef<HTMLInputElement>(null);

  const [projectConcept, setProjectConcept] = useState<ProjectConcept>(() => {
    const saved = localStorage.getItem('board_project_concept');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) { }
    }
    return { name: 'WisteriaProjectMGT', content: '', attachments: [] };
  });

  const totalUnreadCount = useMemo(() => {
    if (!settings.userName) return 0;
    return tasks.reduce((count, task) => {
      const userView = task.lastViewedBy?.find(v => v.userName === settings.userName);
      const lastViewTime = userView ? new Date(userView.timestamp).getTime() : 0;

      const hasNewProgress = task.progress?.some(p => new Date(p.updatedAt).getTime() > lastViewTime && p.author !== settings.userName);
      const hasNewComment = task.comments?.some(c => new Date(c.createdAt).getTime() > lastViewTime && c.author !== settings.userName);

      return (hasNewProgress || hasNewComment) ? count + 1 : count;
    }, 0);
  }, [tasks, settings.userName]);

  // セーブキュー: 同時に1つしかPOSTが走らないようにする
  const handleSingleTaskSave = useCallback(async (task: Task, immediate = false) => {
    if (!settings.gasUrl) {
      if (immediate) {
        alert("設定画面でGAS WebアプリのURLを入力してください。保存できません。");
        setShowSettingsModal(true);
      }
      return;
    }

    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);

    const executeSave = async (t: Task) => {
      if (isSavingRef.current) {
        // 既に保存中なら、最新のタスクだけキューに入れて待つ
        console.log("[SaveQueue] Save already in-flight, queuing:", t.title);
        pendingSaveRef.current = { task: t, immediate: true };
        return;
      }

      isSavingRef.current = true;
      try {
        console.log("[SaveQueue] Executing save for:", t.title, "uuid:", t.uuid);
        await saveSingleTaskToSheet(t, settings.gasUrl, undefined, members, undefined, settings.cliqUrl, currentSheetName);
        console.log("[SaveQueue] Save completed for:", t.title);
      } catch (e: any) {
        alert(e.message || "タスクの保存に失敗しました");
        console.error("Save error:", e);
      } finally {
        isSavingRef.current = false;
        // キューに溜まっている保存があれば次に実行
        if (pendingSaveRef.current) {
          const pending = pendingSaveRef.current;
          pendingSaveRef.current = null;
          console.log("[SaveQueue] Processing queued save for:", pending.task.title);
          // 少し間を空けてGASのロック解放を待つ
          setTimeout(() => executeSave(pending.task), 500);
        }
      }
    };

    if (immediate) {
      executeSave(task);
    } else {
      saveTimeoutRef.current = setTimeout(async () => {
        await executeSave(task);
        saveTimeoutRef.current = null;
      }, 1500);
    }
  }, [settings.gasUrl, members, settings.cliqUrl]);

  const markTaskAsViewed = useCallback((taskId: string) => {
    if (!settings.userName) return;

    setTasks(prevTasks => {
      const taskIndex = prevTasks.findIndex(t => t.id === taskId);
      if (taskIndex === -1) return prevTasks;

      const task = prevTasks[taskIndex];
      const now = new Date().toISOString();

      const lastViewedBy = [...(task.lastViewedBy || [])];
      const userViewIndex = lastViewedBy.findIndex(v => v.userName === settings.userName);

      let updatedLastViewedBy;
      if (userViewIndex !== -1) {
        updatedLastViewedBy = [...lastViewedBy];
        updatedLastViewedBy[userViewIndex] = { ...lastViewedBy[userViewIndex], timestamp: now };
      } else {
        updatedLastViewedBy = [...lastViewedBy, { userId: settings.userName, userName: settings.userName, timestamp: now }];
      }

      const updatedTask = { ...task, lastViewedBy: updatedLastViewedBy };

      // ★ markTaskAsViewedではGAS保存をしない（不要な2重保存を防止）
      // 既読情報はローカル状態のみ更新し、次の明示的な保存時にまとめて送信される

      const nextTasks = [...prevTasks];
      nextTasks[taskIndex] = updatedTask;
      return nextTasks;
    });
  }, [settings.userName, handleSingleTaskSave]);

  const loadData = useCallback(async () => {
    setLoading(true);
    setErrorMsg(null);
    // closureのstale化対策: localStorageから直接goalEpicsを再読み込みしつつuseMemo値もフォールバックとして使用
    const freshMeta = projectId ? getProjectsMeta().find(p => p.id === projectId) : null;
    const goalEpicSource = freshMeta?.goalEpics?.length ? freshMeta.goalEpics
      : currentProjectMeta?.goalEpics?.length ? currentProjectMeta.goalEpics : null;
    const goalEpicNames = goalEpicSource ? goalEpicSource.map(e => e.name) : null;
    try {
      const fetched = await fetchTasksFromSheet(settings.gasUrl, currentSheetName);
      setTasks(fetched.tasks);
      if (fetched.projectConcept) setProjectConcept(fetched.projectConcept);
      if (goalEpicNames) {
        setEpics(goalEpicNames);
      } else if (fetched.epics && fetched.epics.length > 0) {
        setEpics(fetched.epics);
      } else {
        setEpics(prev => (prev.length > 0 ? prev : DEFAULT_PROJECTS));
      }
      setIsInitialLoadDone(true);
    } catch (e: any) {
      setErrorMsg("スプレッドシートの読み込みに失敗しました。");
      if (goalEpicNames) setEpics(goalEpicNames);
      setIsInitialLoadDone(true);
    } finally {
      setLoading(false);
    }
  }, [settings.gasUrl, currentSheetName, currentProjectMeta, projectId]);

  useEffect(() => {
    if (settings.userName) {
      const timer = setTimeout(() => {
        loadData();
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [loadData, settings.userName]);

  useEffect(() => {
    if (projectId) {
      saveProjectMembers(projectId, members);
    } else {
      localStorage.setItem('board_members_v2', JSON.stringify(members));
    }
  }, [members, projectId]);

  // goalEpicsがあるプロジェクト: currentProjectMetaが確定したら必ずgoalEpicsで上書き
  useEffect(() => {
    if (currentProjectMeta?.goalEpics?.length) {
      setEpics(currentProjectMeta.goalEpics.map(e => e.name));
    }
  }, [currentProjectMeta]);

  useEffect(() => {
    if (projectId) {
      saveProjectEpics(projectId, epics);
    } else {
      localStorage.setItem('board_epics', JSON.stringify(epics));
    }
  }, [epics, projectId]);

  useEffect(() => {
    localStorage.setItem('board_project_concept', JSON.stringify(projectConcept));
  }, [projectConcept]);

  const handleCopyCode = () => {
    navigator.clipboard.writeText(GAS_CODE);
    setCopySuccess(true);
    setTimeout(() => setCopySuccess(false), 2000);
  };

  const executePushAll = async (currentTasks = tasks, currentMembers = members, currentProjectConcept = projectConcept) => {
    setLoading(true);
    try {
      await syncAllTasksToSheet(currentTasks, settings.gasUrl, undefined, currentMembers, undefined, settings.cliqUrl, currentProjectConcept, currentSheetName);
    } catch (e) {
      setErrorMsg('保存エラーが発生しました。');
    } finally {
      setLoading(false);
      setShowPushConfirm(false);
    }
  };

  const handlePushAll = (currentTasks = tasks, currentMembers = members, currentProjectConcept = projectConcept, skipConfirm = false) => {
    if (!settings.gasUrl) {
      setErrorMsg("設定画面でGAS WebアプリのURLを入力してください。");
      setShowSettingsModal(true);
      return;
    }
    if (currentTasks.length === 0) {
      alert("タスクが0件のため、上書きを中止しました。");
      return;
    }
    if (skipConfirm) {
      executePushAll(currentTasks, currentMembers, currentProjectConcept);
    } else {
      setShowPushConfirm(true);
    }
  };

  // GoalEpic フィールドを更新して localStorage に保存
  const handleUpdateGoalEpic = useCallback((epicId: string, updates: Partial<GoalEpic>) => {
    if (!projectId) return;
    setLocalGoalEpics(prev => {
      const updated = prev.map(ge => ge.id === epicId ? { ...ge, ...updates } : ge);
      // localStorage に保存
      const proj = getProjectsMeta().find(p => p.id === projectId);
      if (proj) {
        updateProjectInStore({ ...proj, goalEpics: updated, updatedAt: new Date().toISOString() });
      }
      return updated;
    });
  }, [projectId]);

  const updateTaskAndSave = useCallback((taskId: string, updater: (task: Task) => Task, saveMode: 'immediate' | 'debounced' | 'none' = 'debounced') => {
    setTasks(prev => {
      const taskIndex = prev.findIndex(t => t.id === taskId);
      if (taskIndex === -1) return prev;

      const updatedTask = updater(prev[taskIndex]);

      if (saveMode !== 'none') {
        setTimeout(() => {
          handleSingleTaskSave(updatedTask, saveMode === 'immediate');
        }, 0);
      }

      const nextTasks = [...prev];
      nextTasks[taskIndex] = updatedTask;
      return nextTasks;
    });
  }, [handleSingleTaskSave]);

  const addTask = (overrides?: Partial<Task>) => {
    setSearchTerm('');
    setViewMode('list');

    const newTaskId = `new-${Date.now()}`;
    const newTask: Task = {
      id: newTaskId,
      date: new Date().toISOString().split('T')[0],
      department: '未設定',
      project: '未分類',
      responsiblePerson: settings.userName,
      team: [],
      title: '新規タスク',
      isSoftDeleted: false,
      status: TaskStatus.TODO,
      priority: TaskPriority.MEDIUM,
      progress: [],
      milestones: [],
      comments: [],
      attachments: [],
      lastViewedBy: [{ userId: settings.userName, userName: settings.userName, timestamp: new Date().toISOString() }],
      dueDate: '',
      evaluation: undefined,
      uuid: typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : `uuid-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      trackId: `track-${Date.now()}`,
      hierarchyType: 'root',
      ...overrides
    };

    setTasks(prev => [...prev, newTask]);
    markTaskAsViewed(newTaskId);
    setTimeout(() => handleSingleTaskSave(newTask, true), 100);
  };

  const addSubTask = (parentId: string) => {
    const parent = tasks.find(t => t.id === parentId);
    if (!parent) return;

    addTask({
      parentId: parent.uuid || parent.id,
      hierarchyType: 'subtask',
      project: parent.project || '未分類',
      trackId: `track-sub-${Date.now()}`,
      title: `[子] ${parent.title} の作業`
    });
  };

  const addSiblingTask = (predecessorId: string) => {
    const pred = tasks.find(t => t.id === predecessorId);
    if (!pred) return;

    addTask({
      parentId: pred.parentId,
      hierarchyType: 'sibling',
      project: pred.project,
      trackId: pred.trackId,
      dependencies: [pred.uuid || pred.id],
      title: `[続] ${pred.title} の次工程`,
      startDate: pred.dueDate || pred.date
    });
  };

  const updateTask = (updatedTask: Task) => {
    setTasks(prev => prev.map(t => t.id === updatedTask.id ? updatedTask : t));
  };

  const updateTasks = (updatedTasks: Task[]) => {
    const updatedIds = new Set(updatedTasks.map(t => t.id));
    setTasks(prev => {
      const filtered = prev.filter(t => !updatedIds.has(t.id));
      return [...filtered, ...updatedTasks];
    });
  };

  const softDeleteTask = (taskId: string) => {
    updateTaskAndSave(taskId, t => ({ ...t, isSoftDeleted: true }), 'immediate');
    if (expandedTaskId === taskId) {
      setExpandedTaskId(null);
    }
  };

  const handleLogout = () => {
    setShowLogoutModal(true);
  };

  const executeLogout = () => {
    localStorage.removeItem('board_user_name');
    setTasks([]);
    setIsInitialLoadDone(false);
    setSettings(prev => ({ ...prev, userName: '' }));
    setShowLogoutModal(false);
    window.location.reload();
  };

  const filteredTasks = useMemo(() => {
    const baseFiltered = tasks.filter(t => {
      if (t.isSoftDeleted) return false;
      const matchesSearch = t.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
        t.responsiblePerson.includes(searchTerm);
      const matchesEpic = epicFilter ? (t.project === epicFilter) : true;
      return matchesSearch && matchesEpic;
    });

    const roots = baseFiltered.filter(t => {
      const pId = t.parentId?.trim();
      return !pId || !baseFiltered.find(p => (p.uuid === pId || p.id === pId));
    });
    const result: (Task & { depth: number })[] = [];
    const visited = new Set<string>();

    const addWithChildren = (parent: Task, depth = 0) => {
      if (depth > 10) return;

      const children = baseFiltered.filter(t => t.parentId?.trim() === parent.uuid || t.parentId?.trim() === parent.id);
      children.sort((a, b) => (a.status === TaskStatus.COMPLETED ? 1 : -1));

      children.forEach(child => {
        if (visited.has(child.id)) return;
        visited.add(child.id);
        result.push({ ...child, depth });
        addWithChildren(child, depth + 1);
      });
    };

    roots.sort((a, b) => (a.status === TaskStatus.COMPLETED ? 1 : -1));

    roots.forEach(root => {
      if (visited.has(root.id)) return;
      visited.add(root.id);
      result.push({ ...root, depth: 0 });
      addWithChildren(root, 1);
    });

    return result;
  }, [tasks, searchTerm, epicFilter]);

  const stats = useMemo(() => {
    const activeTasks = tasks.filter(t => !t.isSoftDeleted);
    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];

    return {
      total: activeTasks.length,
      rootCount: activeTasks.filter(t => t.status !== TaskStatus.COMPLETED && t.hierarchyType !== 'subtask').length,
      subCount: activeTasks.filter(t => t.status !== TaskStatus.COMPLETED && t.hierarchyType === 'subtask').length,
      completed: activeTasks.filter(t => t.status === TaskStatus.COMPLETED).length,
      pending: activeTasks.filter(t => t.status === TaskStatus.IN_PROGRESS || t.status === TaskStatus.TODO).length,
      overdue: activeTasks.filter(t => {
        if (t.status === TaskStatus.COMPLETED) return false;
        if (t.status === TaskStatus.OVERDUE) return true;
        return t.dueDate && t.dueDate < todayStr;
      }).length,
      epics: epics.length
    };
  }, [tasks, epics]);

  const handleAiAnalyze = async () => {
    setIsAiAnalyzing(true);
    try {
      const result = await analyzeProgress(tasks);
      alert(result);
    } catch (e) {
      alert('AI分析に失敗しました。');
    } finally {
      setIsAiAnalyzing(false);
    }
  };

  if (!settings.userName) {
    const storedPassword = localStorage.getItem('board_password');
    const isFirstTime = !storedPassword;

    const handleLoginSubmit = () => {
      const nameInput = document.getElementById('manual-login-name') as HTMLInputElement;
      const selectName = (document.getElementById('select-login-name') as HTMLSelectElement).value;
      const passwordInput = document.getElementById('login-password') as HTMLInputElement;

      const name = nameInput.value.trim() || selectName;
      const password = passwordInput.value.trim();

      if (!name) {
        alert('名前を選択または入力してください。');
        return;
      }

      if (!password) {
        alert('パスワードを入力してください。');
        return;
      }

      if (isFirstTime) {
        localStorage.setItem('board_password', password);
        localStorage.setItem('board_user_name', name);
        setSettings({
          ...settings,
          userName: name,
          gasUrl: localStorage.getItem('board_gas_url') || DEFAULT_GAS_URL
        });
      } else {
        if (password === storedPassword) {
          localStorage.setItem('board_user_name', name);
          setSettings({
            ...settings,
            userName: name,
            gasUrl: localStorage.getItem('board_gas_url') || DEFAULT_GAS_URL
          });
        } else {
          alert('パスワードが正しくありません。');
        }
      }
    };

    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="bg-white p-8 rounded-[2rem] shadow-xl max-w-md w-full border border-slate-100">
          <div className="flex justify-center mb-6">
            <div className="w-16 h-16 rounded-2xl flex items-center justify-center shadow-lg bg-red-600">
              <Armchair className="w-8 h-8 text-white" />
            </div>
          </div>
          <h1 className="text-2xl font-black text-center mb-2">{projectConcept.name || 'WisteriaProjectMGT'}</h1>
          <p className="text-xs text-slate-400 text-center font-bold mb-8 uppercase tracking-widest">
            {isFirstTime ? '初期パスワード設定' : 'ログイン'}
          </p>

          <div className="space-y-6">
            <div>
              <label className="text-[10px] font-black text-slate-500 uppercase mb-2 block">名前を選択</label>
              <select
                id="select-login-name"
                className="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl font-bold text-sm outline-none focus:border-red-500"
                defaultValue=""
              >
                <option value="" disabled>名前を選択してください</option>
                {members.map((m, i) => (
                  <option key={i} value={m.name}>{m.name}</option>
                ))}
              </select>
            </div>

            <div className="relative flex items-center py-2">
              <div className="flex-grow border-t border-slate-200"></div>
              <span className="flex-shrink-0 mx-4 text-slate-400 text-xs font-bold">または</span>
              <div className="flex-grow border-t border-slate-200"></div>
            </div>

            <div>
              <label className="text-[10px] font-black text-slate-500 uppercase mb-2 block">名前を直接入力</label>
              <input
                type="text"
                id="manual-login-name"
                className="w-full p-4 bg-white border border-slate-200 rounded-xl font-bold text-sm outline-none focus:border-red-500"
                placeholder="例: 山田太郎"
              />
            </div>

            <div className="pt-4 border-t border-slate-100">
              <label className="text-[10px] font-black text-slate-500 uppercase mb-2 block">
                {isFirstTime ? '設定するパスワード' : 'パスワード'}
              </label>
              <input
                type="password"
                id="login-password"
                className="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl font-bold text-sm outline-none focus:border-red-500"
                placeholder="パスワードを入力"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleLoginSubmit();
                }}
              />
              {isFirstTime && <p className="text-[9px] text-red-400 mt-2 font-bold">※ 次回からこのパスワードが必要になります。</p>}
            </div>

            <button
              onClick={handleLoginSubmit}
              className="w-full mt-3 bg-red-600 text-white p-4 rounded-xl font-bold text-sm hover:bg-red-700 transition-all shadow-lg active:scale-95"
            >
              {isFirstTime ? 'パスワードを設定してログイン' : 'ログイン'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 pb-20">
      <div className={`text-white text-[12px] font-black py-2.5 px-4 text-center tracking-[0.2em] flex items-center justify-center gap-4 sticky top-0 z-[100] shadow-2xl border-b ${isAdmin ? 'bg-amber-600 border-amber-400' : isExecutive ? 'bg-purple-800 border-purple-600' : isManager ? 'bg-blue-800 border-blue-600' : 'bg-slate-800 border-slate-700'}`}>
        {onBackToPortal && (
          <button
            onClick={onBackToPortal}
            className="mr-2 bg-white/20 hover:bg-white/30 px-3 py-1 rounded-full text-[10px] transition-all flex items-center gap-1"
          >
            <ArrowLeft className="w-3 h-3" /> ポータルへ戻る
          </button>
        )}
        {isAdmin ? <ShieldCheck className="w-5 h-5" /> : isExecutive ? <Crown className="w-4 h-4" /> : isManager ? <Briefcase className="w-4 h-4" /> : <Lock className="w-4 h-4" />}
        <span>
          {isAdmin ? `矢追様 管理者ログイン中 (評価機能 有効)` : isExecutive ? `役員: ${settings.userName}` : isManager ? `マネージャー: ${settings.userName}` : `ユーザー: ${settings.userName}`}
        </span>
        <button
          onClick={() => handleLogout()}
          className="ml-4 bg-white/20 hover:bg-white/30 px-3 py-1 rounded-full text-[10px] transition-all flex items-center gap-1"
        >
          <LogOut className="w-3 h-3" /> ログアウト
        </button>
      </div>

      <div className="max-w-[1400px] mx-auto p-4 md:p-8">
        {errorMsg && (
          <div className="mb-6 bg-rose-50 border-2 border-rose-200 p-6 rounded-[2rem] flex flex-col md:flex-row items-center gap-6 text-rose-700 shadow-xl">
            <div className="w-12 h-12 bg-rose-100 rounded-2xl flex items-center justify-center text-rose-600 flex-shrink-0">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <div className="flex-1 text-center md:text-left">
              <p className="font-black text-sm mb-1">{errorMsg}</p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setShowSettingsModal(true)}
                className="px-6 py-3 bg-white border border-rose-200 text-rose-600 rounded-xl font-black text-xs hover:bg-rose-100 transition-all"
              >
                設定を確認
              </button>
              <button
                onClick={loadData}
                className="px-6 py-3 bg-rose-600 text-white rounded-xl font-black text-xs hover:bg-rose-700 shadow-lg shadow-rose-200 transition-all active:scale-95"
              >
                再試行
              </button>
            </div>
          </div>
        )}

        <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 mb-8 bg-white p-6 rounded-[2rem] shadow-sm border border-slate-100">
          <div className="flex items-center space-x-4 cursor-pointer group" onClick={() => setShowConceptModal(true)}>
            <div className="relative">
               <div className="w-12 h-12 rounded-2xl flex items-center justify-center shadow-lg bg-red-600 group-hover:scale-105 transition-all">{portalProjectIcon ? <span className="text-2xl">{portalProjectIcon}</span> : <Armchair className="w-6 h-6 text-white" />}</div>
              {totalUnreadCount > 0 && (
                <div className="absolute -top-2 -right-2 bg-red-500 text-white text-[10px] font-black w-6 h-6 rounded-full flex items-center justify-center border-2 border-white shadow-lg animate-bounce">
                  {totalUnreadCount}
                </div>
              )}
            </div>
            <div>
              <div className="flex items-center gap-2">
              <h1 className="text-xl font-black group-hover:text-red-600 transition-colors">{portalProjectName || projectConcept.name || 'WisteriaProjectMGT'}</h1>
                 <span className={`text-[9px] px-2 py-0.5 rounded-full font-black bg-red-100 text-red-600`}>
                   {APP_VERSION}
                 </span>
               </div>
               <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">{portalProjectPeriod && <span className="text-cyan-600 mr-2 normal-case">{portalProjectPeriod}</span>}Decision Tracker</p>
             </div>
           </div>

          <div className="flex items-center gap-2 overflow-x-auto w-full md:w-auto">
            <div className="flex bg-slate-100 p-1 rounded-xl">
              <button onClick={() => setViewMode('list')} className={`p-2 rounded-lg ${viewMode === 'list' ? 'bg-white shadow text-red-600' : 'text-slate-400'}`}><List className="w-5 h-5" /></button>
              <button onClick={() => setViewMode('timeline')} className={`p-2 rounded-lg ${viewMode === 'timeline' ? 'bg-white shadow text-red-600' : 'text-slate-400'}`}><Calendar className="w-5 h-5" /></button>
              <button onClick={() => setViewMode('matrix')} className={`p-2 rounded-lg ${viewMode === 'matrix' ? 'bg-white shadow text-red-600' : 'text-slate-400'}`}><LayoutGrid className="w-5 h-5" /></button>
              {(isAdmin || isManager) && <button onClick={() => setViewMode('evaluation')} className={`p-2 rounded-lg ${viewMode === 'evaluation' ? 'bg-white shadow text-red-600' : 'text-slate-400'}`} title="評価"><Award className="w-5 h-5" /></button>}
              <button onClick={() => setShowActivityModal(true)} className={`p-2 rounded-lg text-slate-400 hover:text-slate-700`} title="更新履歴"><Clock className="w-5 h-5" /></button>
            </div>

            {/* 全文検索ボタン */}
            <button onClick={() => setShowSearch(true)} className="p-3 bg-white border border-slate-200 rounded-xl text-slate-500 hover:text-red-600 shadow-sm transition-all" title="全文検索">
              <Search className="w-5 h-5" />
            </button>

            <button onClick={handleAiAnalyze} className="p-3 bg-white border border-red-100 text-red-500 rounded-xl hover:bg-red-50 shadow-sm transition-all" title="AI分析">
              {isAiAnalyzing ? <Loader2 className="w-5 h-5 animate-spin" /> : <BrainCircuit className="w-5 h-5" />}
            </button>

            <button onClick={loadData} className="p-3 bg-white border border-slate-200 rounded-xl text-slate-500 hover:bg-slate-50 shadow-sm" title="更新"><RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} /></button>

            <button onClick={() => addTask()} className="bg-slate-900 text-white px-5 py-3 rounded-xl font-black text-xs flex items-center gap-2 shadow-lg active:scale-95 transition-all hover:bg-slate-800">
              <Plus className="w-4 h-4" /> 新規
            </button>

            {isManager && !isAdmin && (
              <button onClick={() => setShowManagerSettingsModal(true)} className="p-3 bg-blue-50 border border-blue-200 rounded-xl text-blue-500 hover:bg-blue-100 transition-all" title="部門長設定">
                <Settings className="w-5 h-5" />
              </button>
            )}
            {/* 評価者（Manager/Adminではないが isEvaluator フラグがある人）専用ボタン */}
            {isEvaluatorUser && !isManager && !isAdmin && (
              <button onClick={() => setShowEvaluatorModal(true)} className="p-3 bg-orange-50 border border-orange-200 rounded-xl text-orange-500 hover:bg-orange-100 transition-all" title="評価入力">
                <Award className="w-5 h-5" />
              </button>
            )}
            {(isAdmin || (!isEvaluatorUser)) && (
              <button onClick={() => setShowSettingsModal(true)} className="p-3 bg-white border border-slate-200 rounded-xl text-slate-400 hover:text-red-600 transition-all" title="設定">
                <Settings className="w-5 h-5" />
              </button>
            )}

            <button onClick={() => handleLogout()} className="p-3 bg-rose-50 border border-rose-100 text-rose-500 rounded-xl hover:bg-rose-100 shadow-sm transition-all" title="ログアウト">
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </header>

        <DashboardCards
          stats={stats}
          onEpicClick={() => setShowEpicList(true)}
          onTotalClick={() => setEpicFilter(null)}
        />

        <div className="mb-6 relative max-w-md">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="タスク検索..."
            className="w-full pl-10 pr-4 py-4 bg-white border border-slate-200 rounded-2xl font-bold text-sm outline-none focus:border-red-500 shadow-sm"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        <div className="space-y-4">
          {!isInitialLoadDone && loading && tasks.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-32 bg-white rounded-[2rem] border border-slate-100 shadow-sm">
              <div className="w-20 h-20 border-4 border-slate-100 border-t-red-600 rounded-full animate-spin"></div>
              <h2 className="text-xl font-black text-slate-800 mt-8">データを読み込み中</h2>
            </div>
          ) : (
            <>
              {viewMode === 'list' && filteredTasks.length === 0 && isInitialLoadDone && (
                <div className="flex flex-col items-center justify-center py-20 bg-white rounded-[2rem] border border-dashed border-slate-200 shadow-sm text-center">
                  <div className="text-5xl mb-4">📋</div>
                  <h3 className="text-lg font-black text-slate-500 mb-2">
                    {epicFilter ? `「${epicFilter}」のタスクはまだありません` : searchTerm ? '検索結果なし' : 'タスクがありません'}
                  </h3>
                  <p className="text-xs text-slate-400 font-bold mb-6">
                    {epicFilter ? 'このエピックに最初のタスクを追加しましょう' : '「＋ タスク追加」から始めてください'}
                  </p>
                  {epicFilter && (
                    <button
                      onClick={() => addTask({ project: epicFilter })}
                      className="flex items-center gap-2 px-6 py-3 bg-red-600 text-white rounded-xl font-black text-sm hover:bg-red-700 active:scale-95 transition-all shadow-lg shadow-red-100"
                    >
                      <Plus className="w-4 h-4" /> このエピックにタスクを追加
                    </button>
                  )}
                  {epicFilter && (
                    <button onClick={() => setEpicFilter(null)} className="mt-3 text-xs text-slate-400 font-bold hover:text-slate-600 underline underline-offset-2">
                      フィルターを解除してすべて表示
                    </button>
                  )}
                </div>
              )}
              {viewMode === 'list' && (
                filteredTasks.map(task => (
                  <TaskItem
                    key={task.id}
                    task={task}
                    depth={(task as any).depth}
                    isInitiallyExpanded={expandedTaskId === task.id}
                    initialTab={expandedTaskId === task.id ? initialTaskTab : 'basic'}
                    autoEditTitle={editingTaskId === task.id}
                    isAdmin={isAdmin}
                    currentUserName={settings.userName}
                    onUpdateTaskDetails={(tid, details) => {
                      // タイトル変更は遅延保存（保存ボタンで即時保存される）
                      const isImmediate = !!details.attachments || !!details.status;
                      updateTaskAndSave(tid, t => ({ ...t, ...details }), isImmediate ? 'immediate' : 'none');
                      if (details.title) setEditingTaskId(null);
                    }}
                    onUpdateStatus={(tid, status) => {
                      updateTaskAndSave(tid, t => ({ ...t, status }), 'immediate');
                    }}
                    onUpdatePriority={(tid, priority) => {
                      updateTaskAndSave(tid, t => ({ ...t, priority }), 'immediate');
                    }}
                    onAddProgress={async (tid, content) => {
                      updateTaskAndSave(tid, t => {
                        const newP = { week: t.progress.length + 1, content, updatedAt: new Date().toISOString(), author: settings.userName };
                        return { ...t, progress: [newP, ...t.progress] };
                      }, 'immediate');
                    }}
                    onAddComment={async (tid, content) => {
                      updateTaskAndSave(tid, t => {
                        const newC: TaskComment = { id: Date.now().toString(), content, author: settings.userName, createdAt: new Date().toISOString() };
                        return { ...t, comments: [...(t.comments || []), newC] };
                      }, 'immediate');
                    }}
                    onMarkAsViewed={() => markTaskAsViewed(task.id)}
                    onManualSync={async (t) => {
                      updateTaskAndSave(t.id, task => task, 'immediate');
                    }}
                    onDeleteTask={softDeleteTask}
                    onAddSubTask={addSubTask}
                    onAddSiblingTask={addSiblingTask}
                    members={members}
                    epics={epics}
                    allTasks={tasks}
                    projectDepartment={currentProjectMeta?.department}
                  />
                ))
              )}

              {viewMode === 'matrix' && <MatrixView tasks={tasks.filter(t => !t.isSoftDeleted)} />}

              {viewMode === 'timeline' && (
                <TimelineView
                  tasks={tasks}
                  members={members}
                  onUpdateTask={updateTask}
                  onUpdateTasks={updateTasks}
                  onSoftDeleteTask={softDeleteTask}
                  onAddTask={(date) => addTask({ startDate: date, dueDate: date })}
                  currentUserName={settings.userName}
                  isAdmin={isAdmin}
                  onEditTaskFromTimeline={(taskId) => setTimelineSelectedTaskId(taskId)}
                />
              )}

              {viewMode === 'evaluation' && (
                <div className="bg-white p-8 rounded-[2rem] shadow-sm border border-slate-100">
                  {isManager && !isAdmin && managerDepartment && (
                    <div className="mb-4 px-4 py-2 bg-blue-50 border border-blue-100 rounded-xl text-xs font-bold text-blue-700 flex items-center gap-2">
                      <Briefcase className="w-4 h-4" /> 部門フィルター適用中: {managerDepartment}
                    </div>
                  )}
                  <EvaluationView
                    tasks={tasks}
                    members={(!isAdmin && isManager && managerDepartment) ? members.filter(m => m.department === managerDepartment) : members}
                    isAdmin={isAdmin || isManager}
                    currentUserName={settings.userName}
                    isTopPage={true}
                    onTaskClick={(taskId) => {
                      setViewMode('list');
                      setSearchTerm('');
                      setEpicFilter(null);
                      setExpandedTaskId(null);
                      setTimeout(() => {
                        setExpandedTaskId(taskId);
                        setInitialTaskTab('basic');
                      }, 100);
                    }}
                  />
                </div>
              )}
            </>
          )}
        </div>

        {showEpicList && (
          <EpicListView
            tasks={tasks.filter(t => !t.isSoftDeleted)}
            epics={epics}
            goalEpics={currentProjectMeta?.goalEpics ?? []}
            onEpicClick={(name) => { setEpicFilter(name); setShowEpicList(false); }}
            onClose={() => setShowEpicList(false)}
          />
        )}

        {/* ======= 全文検索モーダル ======= */}
        {showSearch && (
          <ProjectSearch
            tasks={tasks}
            onOpenTask={(taskId, tab) => {
              setViewMode('list');
              setEpicFilter(null);
              setExpandedTaskId(null);
              setTimeout(() => {
                setExpandedTaskId(taskId);
                setInitialTaskTab(tab);
              }, 50);
            }}
            onClose={() => setShowSearch(false)}
          />
        )}

        {/* ======= 評価者専用モーダル (非Manager/非Admin の isEvaluator ユーザー) ======= */}
        {showEvaluatorModal && isEvaluatorUser && !isManager && !isAdmin && (
          <div className="fixed inset-0 z-[200] bg-slate-900/60 backdrop-blur-md flex items-center justify-center p-4">
            <div className="bg-white rounded-[2.5rem] w-full max-w-4xl shadow-2xl overflow-hidden animate-in zoom-in duration-200 max-h-[90vh] flex flex-col">
              <div className="p-6 border-b flex justify-between items-center bg-orange-50/50 flex-shrink-0">
                <h2 className="font-black text-xl flex items-center gap-3 text-orange-800"><Award className="w-6 h-6 text-orange-600" /> 評価入力</h2>
                <div className="flex items-center gap-3">
                  <div className="px-3 py-1 rounded-full text-[10px] font-black bg-orange-100 text-orange-700">
                    📊 評価者: {settings.userName}
                  </div>
                  <button onClick={() => setShowEvaluatorModal(false)} className="p-2 hover:bg-slate-200 rounded-full"><X className="w-5 h-5" /></button>
                </div>
              </div>
              <div className="bg-orange-50/30 border-b p-2 flex flex-wrap gap-1 flex-shrink-0">
                {([['evaluation','評価入力'],['results','評価結果'],['epics','エピック'],['score','総合評価']] as [typeof evaluatorTab, string][]).map(([tab, label]) => (
                  <button key={tab} onClick={() => setEvaluatorTab(tab)} className={`py-2 px-4 text-[10px] font-black uppercase tracking-widest transition-all rounded-lg ${evaluatorTab === tab ? 'bg-orange-600 text-white shadow-sm' : 'text-slate-400 hover:text-orange-600'}`}>{label}</button>
                ))}
              </div>
              <div className="p-6 overflow-y-auto flex-1 custom-scrollbar">
                {evaluatorTab === 'evaluation' && (
                  <div className="space-y-4">
                    <h3 className="font-black text-sm flex items-center gap-2 text-orange-700"><Target className="w-4 h-4" /> タスク評価入力</h3>
                    <div className="space-y-4">
                      {tasks.filter(t => !t.isSoftDeleted && t.status === TaskStatus.COMPLETED).map(task => (
                        <div key={task.id} className="p-4 bg-white rounded-2xl border border-slate-200 shadow-sm space-y-3">
                          <h4 className="text-sm font-bold text-slate-800">{task.title}</h4>
                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <label className="text-[10px] font-black text-slate-400 block mb-1">難易度 (1-100)</label>
                              <input type="number" className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold outline-none focus:border-orange-500" value={task.evaluation?.difficulty || 50} onChange={e => { const val = parseInt(e.target.value); const ev = task.evaluation || {difficulty:50,outcome:3,memberEvaluations:[]}; saveSingleTaskToSheet({...task,evaluation:{...ev,difficulty:val}},settings.gasUrl,undefined,undefined,undefined,undefined,currentSheetName); }} />
                            </div>
                            <div>
                              <label className="text-[10px] font-black text-slate-400 block mb-1">成果 (1-5)</label>
                              <input type="number" min="1" max="5" className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold outline-none focus:border-orange-500" value={task.evaluation?.outcome || 3} onChange={e => { const val = parseInt(e.target.value) as 1|2|3|4|5; const ev = task.evaluation || {difficulty:50,outcome:3,memberEvaluations:[]}; saveSingleTaskToSheet({...task,evaluation:{...ev,outcome:val}},settings.gasUrl,undefined,undefined,undefined,undefined,currentSheetName); }} />
                            </div>
                          </div>
                          <div className="space-y-1.5">
                            {members.filter(m => task.team?.includes(m.name)).map(m => {
                              const ed = task.evaluation?.memberEvaluations?.find(me => me.memberId === m.name);
                              return (
                                <div key={m.name} className="flex items-center justify-between p-2 bg-slate-50 rounded-lg">
                                  <div><span className="text-xs font-bold text-slate-700">{m.name}</span>{m.department && <span className="text-[9px] text-slate-400 ml-1.5">{m.department}</span>}</div>
                                  <div className="flex gap-1">
                                    {[1,2,3,4,5].map(r => (
                                      <button key={r} onClick={() => { const ev = task.evaluation||{difficulty:50,outcome:3,memberEvaluations:[]}; const idx = ev.memberEvaluations.findIndex(me=>me.memberId===m.name); const ne = idx>=0 ? ev.memberEvaluations.map((s,i)=>i===idx?{...s,rating:r as any}:s) : [...ev.memberEvaluations,{memberId:m.name,rating:r as any}]; const updated={...task,evaluation:{...ev,memberEvaluations:ne}}; setTasks(prev=>prev.map(t=>t.id===task.id?updated:t)); saveSingleTaskToSheet(updated,settings.gasUrl,undefined,undefined,undefined,undefined,currentSheetName); }} className={`w-7 h-7 rounded-lg text-[10px] font-bold transition-all ${ed?.rating===r?'bg-orange-600 text-white':'bg-white border border-slate-200 text-slate-500 hover:bg-orange-50'}`}>{r}</button>
                                    ))}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                      {tasks.filter(t=>!t.isSoftDeleted&&t.status===TaskStatus.COMPLETED).length===0 && <p className="text-xs text-slate-400 italic text-center py-8">評価対象の完了タスクがありません</p>}
                    </div>
                  </div>
                )}
                {evaluatorTab === 'results' && (
                  <div className="space-y-4">
                    <h3 className="font-black text-sm flex items-center gap-2 text-orange-700"><Award className="w-4 h-4" /> 評価結果</h3>
                    <EvaluationView tasks={tasks} members={members} isAdmin={true} currentUserName={settings.userName} />
                  </div>
                )}
                {evaluatorTab === 'epics' && (
                  <div className="space-y-4">
                    <h3 className="font-black text-sm flex items-center gap-2 text-orange-700"><Target className="w-4 h-4" /> エピック編集</h3>
                    {localGoalEpics.length === 0 && <p className="text-xs text-slate-400 italic">目標エピックが設定されていません</p>}
                    {localGoalEpics.map((ge, idx) => (
                      <div key={ge.id || idx} className="p-4 rounded-2xl border border-orange-100 bg-orange-50/30 space-y-3">
                        <span className="text-sm font-black text-slate-800">{ge.name}</span>
                        <div><label className="text-[10px] font-black text-slate-400 block mb-1">期日</label><input type="date" className="w-full p-2 bg-white border border-slate-200 rounded-lg text-xs font-bold outline-none focus:border-orange-500" value={ge.dueDate||''} onChange={e=>handleUpdateGoalEpic(ge.id,{dueDate:e.target.value})} /></div>
                        <div><label className="text-[10px] font-black text-slate-400 block mb-1">ゴール</label><textarea className="w-full p-2 bg-white border border-slate-200 rounded-lg text-xs font-bold outline-none focus:border-orange-500 h-14 resize-none" value={ge.goal||''} onChange={e=>handleUpdateGoalEpic(ge.id,{goal:e.target.value})} /></div>
                        <div><label className="text-[10px] font-black text-slate-400 block mb-1">ルール</label><textarea className="w-full p-2 bg-white border border-slate-200 rounded-lg text-xs font-bold outline-none focus:border-orange-500 h-14 resize-none" value={ge.rule||''} onChange={e=>handleUpdateGoalEpic(ge.id,{rule:e.target.value})} /></div>
                      </div>
                    ))}
                  </div>
                )}
                {evaluatorTab === 'score' && (
                  <div className="space-y-6">
                    <h3 className="font-black text-sm flex items-center gap-2 text-orange-700"><Star className="w-4 h-4" /> エピック総合評価 (0–10)</h3>
                    {localGoalEpics.length === 0 && <p className="text-xs text-slate-400 italic">目標エピックが設定されていません</p>}
                    {localGoalEpics.map((ge, idx) => (
                      <div key={ge.id || idx} className="p-5 bg-white border border-slate-200 rounded-2xl shadow-sm space-y-3">
                        <div className="flex justify-between items-center">
                          <span className="text-sm font-black text-slate-800">{ge.name}</span>
                          <span className="text-2xl font-black text-orange-600">{ge.totalScore ?? 0}<span className="text-sm text-slate-400 font-bold">/10</span></span>
                        </div>
                        <input type="range" min="0" max="10" step="0.5" className="w-full accent-orange-600" value={ge.totalScore ?? 0} onChange={e => handleUpdateGoalEpic(ge.id, { totalScore: parseFloat(e.target.value) })} />
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div className="p-5 border-t bg-slate-50/50 flex-shrink-0 flex justify-end">
                <button onClick={() => setShowEvaluatorModal(false)} className="px-6 py-2.5 bg-orange-600 text-white rounded-xl font-black text-xs hover:bg-orange-700 transition-all">閉じる</button>
              </div>
            </div>
          </div>
        )}

        {/* ======= Manager専用設定モーダル ======= */}
        {showManagerSettingsModal && isManager && !isAdmin && (
          <div className="fixed inset-0 z-[200] bg-slate-900/60 backdrop-blur-md flex items-center justify-center p-4">
            <div className="bg-white rounded-[2.5rem] w-full max-w-4xl shadow-2xl overflow-hidden animate-in zoom-in duration-200 max-h-[90vh] flex flex-col">
              <div className="p-6 border-b flex justify-between items-center bg-blue-50/50 flex-shrink-0">
                <h2 className="font-black text-xl flex items-center gap-3 text-blue-800"><Settings className="w-6 h-6 text-blue-600" /> 部門長設定</h2>
                <div className="flex items-center gap-3">
                  <div className="px-3 py-1 rounded-full text-[10px] font-black bg-blue-100 text-blue-700">
                    📋 Manager{managerDepartment ? ` — ${managerDepartment}` : ''}
                  </div>
                  <button onClick={() => setShowManagerSettingsModal(false)} className="p-2 hover:bg-slate-200 rounded-full"><X className="w-5 h-5" /></button>
                </div>
              </div>
              {/* タブ */}
              <div className="bg-blue-50/30 border-b p-2 flex flex-wrap gap-1 flex-shrink-0">
                {([['evaluation','評価入力'],['results','評価結果'],['members','メンバー'],['epics','エピック編集'],['score','総合評価']] as [typeof managerSettingsTab, string][]).map(([tab, label]) => (
                  <button key={tab} onClick={() => setManagerSettingsTab(tab)} className={`py-2 px-4 text-[10px] font-black uppercase tracking-widest transition-all rounded-lg ${managerSettingsTab === tab ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-400 hover:text-blue-600'}`}>{label}</button>
                ))}
              </div>
              <div className="p-6 overflow-y-auto flex-1 custom-scrollbar">
                {/* 評価入力タブ */}
                {managerSettingsTab === 'evaluation' && (
                  <div className="space-y-4">
                    <h3 className="font-black text-sm flex items-center gap-2 text-blue-700"><Target className="w-4 h-4" /> タスク評価入力 — {managerDepartment || '全部門'}</h3>
                    <div className="space-y-4">
                      {tasks.filter(t => !t.isSoftDeleted && t.status === TaskStatus.COMPLETED && (!managerDepartment || t.department === managerDepartment || t.team?.some(n => members.find(m => m.name === n)?.department === managerDepartment))).map(task => (
                        <div key={task.id} className="p-4 bg-white rounded-2xl border border-slate-200 shadow-sm space-y-3">
                          <h4 className="text-sm font-bold text-slate-800">{task.title}</h4>
                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <label className="text-[10px] font-black text-slate-400 block mb-1">難易度 (1-100)</label>
                              <input type="number" className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold outline-none focus:border-blue-500" value={task.evaluation?.difficulty || 50} onChange={e => { const val = parseInt(e.target.value); const ev = task.evaluation || {difficulty:50,outcome:3,memberEvaluations:[]}; saveSingleTaskToSheet({...task,evaluation:{...ev,difficulty:val}},settings.gasUrl,undefined,undefined,undefined,undefined,currentSheetName); }} />
                            </div>
                            <div>
                              <label className="text-[10px] font-black text-slate-400 block mb-1">成果 (1-5)</label>
                              <input type="number" min="1" max="5" className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold outline-none focus:border-blue-500" value={task.evaluation?.outcome || 3} onChange={e => { const val = parseInt(e.target.value) as 1|2|3|4|5; const ev = task.evaluation || {difficulty:50,outcome:3,memberEvaluations:[]}; saveSingleTaskToSheet({...task,evaluation:{...ev,outcome:val}},settings.gasUrl,undefined,undefined,undefined,undefined,currentSheetName); }} />
                            </div>
                          </div>
                          <div className="space-y-1.5">
                            {members.filter(m => task.team?.includes(m.name) && (!managerDepartment || m.department === managerDepartment)).map(m => {
                              const ed = task.evaluation?.memberEvaluations?.find(me => me.memberId === m.name);
                              return (
                                <div key={m.name} className="flex items-center justify-between p-2 bg-slate-50 rounded-lg">
                                  <div><span className="text-xs font-bold text-slate-700">{m.name}</span>{m.department && <span className="text-[9px] text-slate-400 ml-1.5">{m.department}</span>}</div>
                                  <div className="flex gap-1">
                                    {[1,2,3,4,5].map(r => (
                                      <button key={r} onClick={() => { const ev = task.evaluation||{difficulty:50,outcome:3,memberEvaluations:[]}; const idx = ev.memberEvaluations.findIndex(me=>me.memberId===m.name); const ne = idx>=0 ? ev.memberEvaluations.map((s,i)=>i===idx?{...s,rating:r as any}:s) : [...ev.memberEvaluations,{memberId:m.name,rating:r as any}]; const updated={...task,evaluation:{...ev,memberEvaluations:ne}}; setTasks(prev=>prev.map(t=>t.id===task.id?updated:t)); saveSingleTaskToSheet(updated,settings.gasUrl,undefined,undefined,undefined,undefined,currentSheetName); }} className={`w-7 h-7 rounded-lg text-[10px] font-bold transition-all ${ed?.rating===r?'bg-blue-600 text-white':'bg-white border border-slate-200 text-slate-500 hover:bg-blue-50'}`}>{r}</button>
                                    ))}
                                  </div>
                                </div>
                              );
                            })}
                            {members.filter(m=>task.team?.includes(m.name)&&(!managerDepartment||m.department===managerDepartment)).length===0 && <p className="text-xs text-slate-400 italic">担当部門メンバーがチームに含まれていません</p>}
                          </div>
                        </div>
                      ))}
                      {tasks.filter(t=>!t.isSoftDeleted&&t.status===TaskStatus.COMPLETED&&(!managerDepartment||t.department===managerDepartment||t.team?.some(n=>members.find(m=>m.name===n)?.department===managerDepartment))).length===0 && <p className="text-xs text-slate-400 italic text-center py-8">評価対象の完了タスクがありません</p>}
                    </div>
                  </div>
                )}
                {/* 評価結果タブ */}
                {managerSettingsTab === 'results' && (
                  <div className="space-y-4">
                    <h3 className="font-black text-sm flex items-center gap-2 text-blue-700"><Award className="w-4 h-4" /> 評価結果 — {managerDepartment || '全部門'}</h3>
                    <EvaluationView tasks={tasks} members={managerDepartment ? members.filter(m=>m.department===managerDepartment) : members} isAdmin={true} currentUserName={settings.userName} />
                  </div>
                )}
                {/* メンバータブ */}
                {managerSettingsTab === 'members' && (
                  <div className="space-y-4">
                    <h3 className="font-black text-sm flex items-center gap-2 text-blue-700"><Users className="w-4 h-4" /> 部門メンバー — {managerDepartment || '全部門'}</h3>
                    <div className="space-y-2">
                      {(managerDepartment ? members.filter(m=>m.department===managerDepartment) : members).map((m,i) => (
                        <div key={i} className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-100">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 bg-blue-100 text-blue-700 rounded-xl flex items-center justify-center text-[10px] font-black">{m.name[0]}</div>
                            <div><p className="text-xs font-bold text-slate-700">{m.name}</p>{m.department&&<p className="text-[9px] text-slate-400">{m.department}</p>}</div>
                          </div>
                          <span className={`text-[9px] font-black px-2 py-0.5 rounded-full ${m.role==='admin'?'bg-amber-100 text-amber-700':m.role==='manager'?'bg-blue-100 text-blue-700':'bg-slate-100 text-slate-500'}`}>{m.role}</span>
                        </div>
                      ))}
                      {(managerDepartment ? members.filter(m=>m.department===managerDepartment) : members).length===0 && <p className="text-xs text-slate-400 italic text-center py-8">部門メンバーが登録されていません</p>}
                    </div>
                  </div>
                )}
                {/* エピック編集タブ */}
                {managerSettingsTab === 'epics' && (() => {
                  const totalW = localGoalEpics.reduce((s, g) => s + (g.weight || 0), 0);
                  return (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <h3 className="font-black text-sm flex items-center gap-2 text-blue-700"><Briefcase className="w-4 h-4" /> エピック編集 (合計100ポイント)</h3>
                      <div className={`text-[10px] font-black px-3 py-1 rounded-full ${totalW === 100 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                        {totalW} / 100pt{totalW !== 100 && ' ⚠'}
                      </div>
                    </div>
                    {localGoalEpics.length === 0 && <p className="text-xs text-slate-400 italic">目標エピックが設定されていません</p>}
                    {localGoalEpics.map((ge, idx) => (
                      <div key={ge.id || idx} className="p-4 rounded-2xl border border-blue-100 bg-blue-50/30 space-y-3">
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-sm font-black text-slate-800">{ge.name}</span>
                          <div className="flex items-center gap-1.5 flex-shrink-0">
                            <label className="text-[10px] font-black text-slate-500">ポイント</label>
                            <input type="number" min="0" max="100" className="w-16 p-1.5 bg-white border border-blue-200 rounded-lg text-xs font-black text-blue-700 outline-none focus:border-blue-500 text-center" value={ge.weight} onChange={e=>handleUpdateGoalEpic(ge.id,{weight:parseInt(e.target.value)||0})} />
                            <span className="text-[10px] font-black text-blue-700">pt</span>
                          </div>
                        </div>
                        <div><label className="text-[10px] font-black text-slate-400 block mb-1">期日</label><input type="date" className="w-full p-2 bg-white border border-slate-200 rounded-lg text-xs font-bold text-slate-700 outline-none focus:border-blue-500" value={ge.dueDate||''} onChange={e=>handleUpdateGoalEpic(ge.id,{dueDate:e.target.value})} /></div>
                        <div><label className="text-[10px] font-black text-slate-400 block mb-1">ゴール</label><textarea className="w-full p-2 bg-white border border-slate-200 rounded-lg text-xs font-bold text-slate-700 outline-none focus:border-blue-500 h-14 resize-none" value={ge.goal||''} onChange={e=>handleUpdateGoalEpic(ge.id,{goal:e.target.value})} /></div>
                        <div><label className="text-[10px] font-black text-slate-400 block mb-1">ルール</label><textarea className="w-full p-2 bg-white border border-slate-200 rounded-lg text-xs font-bold text-slate-700 outline-none focus:border-blue-500 h-14 resize-none" value={ge.rule||''} onChange={e=>handleUpdateGoalEpic(ge.id,{rule:e.target.value})} /></div>
                      </div>
                    ))}
                  </div>
                  );
                })()}
                {/* 総合評価スライダータブ */}
                {managerSettingsTab === 'score' && (
                  <div className="space-y-6">
                    <h3 className="font-black text-sm flex items-center gap-2 text-blue-700"><Star className="w-4 h-4" /> エピック総合評価 (0–10)</h3>
                    <p className="text-xs text-slate-500 font-bold">各エピックの達成度を0〜10で評価してください。Executive（役員）の確認画面に表示されます。</p>
                    {localGoalEpics.length === 0 && <p className="text-xs text-slate-400 italic">目標エピックが設定されていません</p>}
                    {localGoalEpics.map((ge, idx) => (
                      <div key={ge.id || idx} className="p-5 bg-white border border-slate-200 rounded-2xl shadow-sm space-y-3">
                        <div className="flex justify-between items-center">
                          <span className="text-sm font-black text-slate-800">{ge.name}</span>
                          <span className="text-2xl font-black text-blue-600">{ge.totalScore ?? 0}<span className="text-sm text-slate-400 font-bold">/10</span></span>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-[10px] font-black text-slate-400">0</span>
                          <input
                            type="range" min="0" max="10" step="0.5"
                            className="flex-1 accent-blue-600"
                            value={ge.totalScore ?? 0}
                            onChange={e => handleUpdateGoalEpic(ge.id, { totalScore: parseFloat(e.target.value) })}
                          />
                          <span className="text-[10px] font-black text-slate-400">10</span>
                        </div>
                        <div className="flex justify-between text-[9px] text-slate-400 font-bold px-1">
                          {[0,2,4,6,8,10].map(v => <span key={v}>{v}</span>)}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div className="p-5 border-t bg-slate-50/50 flex-shrink-0 flex justify-end">
                <button onClick={() => setShowManagerSettingsModal(false)} className="px-6 py-2.5 bg-blue-600 text-white rounded-xl font-black text-xs hover:bg-blue-700 transition-all">閉じる</button>
              </div>
            </div>
          </div>
        )}

        {/* ======= 更新履歴モーダル ======= */}
        {showActivityModal && (
          <ActivityHistoryModal
            tasks={tasks}
            onClose={() => setShowActivityModal(false)}
            onTaskClick={(taskId) => {
              setExpandedTaskId(taskId);
              setInitialTaskTab('chat');
            }}
          />
        )}

        {showSettingsModal && (
          <div className="fixed inset-0 z-[200] bg-slate-900/60 backdrop-blur-md flex items-center justify-center p-4">
            <div className="bg-white rounded-[2.5rem] w-full max-w-4xl shadow-2xl overflow-hidden animate-in zoom-in duration-200 max-h-[90vh] flex flex-col">
              <div className="p-8 border-b flex justify-between items-center bg-slate-50/50 flex-shrink-0">
                <h2 className="font-black text-xl flex items-center gap-3"><Settings className="w-6 h-6 text-red-600" /> 設定</h2>
                <div className="flex flex-col items-end gap-1">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">ログイン:</span>
                    <span className="text-xs font-bold text-slate-600">{settings.userName}</span>
                  </div>
                  <div className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-tighter ${isAdmin ? 'bg-amber-100 text-amber-700' : isManager ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-500'}`}>
                    {isAdmin ? '👑 Administrator' : isManager ? `📋 Manager${managerDepartment ? ` (${managerDepartment})` : ''}` : '👤 Standard User'}
                  </div>
                </div>
                <button onClick={() => setShowSettingsModal(false)} className="p-2 hover:bg-slate-200 rounded-full transition-all ml-4"><X className="w-5 h-5" /></button>
              </div>
              <div className="bg-slate-50 border-b p-2 flex flex-wrap gap-1">
                <button onClick={() => setSettingsTab('general')} className={`py-2 px-4 text-[10px] font-black uppercase tracking-widest transition-all rounded-lg ${settingsTab === 'general' ? 'bg-white text-red-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}>基本設定</button>
                <button onClick={() => setSettingsTab('concept')} className={`py-2 px-4 text-[10px] font-black uppercase tracking-widest transition-all rounded-lg ${settingsTab === 'concept' ? 'bg-white text-red-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}>コンセプト</button>
                <button onClick={() => setSettingsTab('notifications')} className={`py-2 px-4 text-[10px] font-black uppercase tracking-widest transition-all rounded-lg ${settingsTab === 'notifications' ? 'bg-white text-red-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}>通知設定</button>
                
                {isAdmin && (
                  <div className="w-full mt-2 pt-2 border-t border-slate-200 flex flex-wrap gap-1">
                    <span className="w-full text-[9px] font-black text-slate-400 uppercase ml-2 mb-1 flex items-center gap-1">👑 Administrator Menu</span>
                    <button onClick={() => setSettingsTab('scores')} className={`py-2 px-4 text-[10px] font-black uppercase tracking-widest transition-all rounded-lg ${settingsTab === 'scores' ? 'bg-amber-50 text-amber-700 shadow-sm border border-amber-200' : 'text-slate-400 hover:text-slate-600'}`}>評価スコア</button>
                    <button onClick={() => setSettingsTab('evaluation_tasks')} className={`py-2 px-4 text-[10px] font-black uppercase tracking-widest transition-all rounded-lg ${settingsTab === 'evaluation_tasks' ? 'bg-amber-50 text-amber-700 shadow-sm border border-amber-200' : 'text-slate-400 hover:text-slate-600'}`}>評価</button>
                    <button onClick={() => setSettingsTab('evaluation')} className={`py-2 px-4 text-[10px] font-black uppercase tracking-widest transition-all rounded-lg ${settingsTab === 'evaluation' ? 'bg-amber-50 text-amber-700 shadow-sm border border-amber-200' : 'text-slate-400 hover:text-slate-600'}`}>評価結果</button>
                    <button onClick={() => setSettingsTab('members')} className={`py-2 px-4 text-[10px] font-black uppercase tracking-widest transition-all rounded-lg ${settingsTab === 'members' ? 'bg-amber-50 text-amber-700 shadow-sm border border-amber-200' : 'text-slate-400 hover:text-slate-600'}`}>メンバー</button>
                    <button onClick={() => setSettingsTab('epics')} className={`py-2 px-4 text-[10px] font-black uppercase tracking-widest transition-all rounded-lg ${settingsTab === 'epics' ? 'bg-amber-50 text-amber-700 shadow-sm border border-amber-200' : 'text-slate-400 hover:text-slate-600'}`}>エピック</button>
                    <button onClick={() => setSettingsTab('maintenance')} className={`py-2 px-4 text-[10px] font-black uppercase tracking-widest transition-all rounded-lg ${settingsTab === 'maintenance' ? 'bg-amber-50 text-amber-700 shadow-sm border border-amber-200' : 'text-slate-400 hover:text-slate-600'}`}>バックアップ</button>
                  </div>
                )}
                {isManager && !isAdmin && (
                  <div className="w-full mt-2 pt-2 border-t border-slate-200 flex flex-wrap gap-1">
                    <span className="w-full text-[9px] font-black text-blue-400 uppercase ml-2 mb-1 flex items-center gap-1">📋 Manager Menu{managerDepartment ? ` — ${managerDepartment}` : ''}</span>
                    <button onClick={() => setSettingsTab('dept_evaluation')} className={`py-2 px-4 text-[10px] font-black uppercase tracking-widest transition-all rounded-lg ${settingsTab === 'dept_evaluation' ? 'bg-blue-50 text-blue-700 shadow-sm border border-blue-200' : 'text-slate-400 hover:text-slate-600'}`}>部門評価</button>
                  </div>
                )}
              </div>

              <div className="p-8 overflow-y-auto flex-1 custom-scrollbar">
                {settingsTab === 'general' && (
                  <div className="space-y-8">
                    {/* ManagerにはGAS/Webhook/APIの設定を非表示 */}
                    {!isManager ? (
                      <>
                        <div className="space-y-4">
                          <label className="text-[10px] font-black text-slate-500 uppercase">GAS Web App URL</label>
                          <input type="text" className="w-full p-3 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-600 outline-none focus:border-red-500" value={settings.gasUrl} onChange={e => setSettings({ ...settings, gasUrl: e.target.value })} />
                        </div>
                        <div className="space-y-4">
                          <label className="text-[10px] font-black text-slate-500 uppercase">Cliq Webhook URL</label>
                          <input type="text" className="w-full p-3 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-600 outline-none focus:border-red-500" value={settings.cliqUrl} onChange={e => setSettings({ ...settings, cliqUrl: e.target.value })} />
                        </div>
                        <div className="space-y-4">
                          <div className="flex justify-between items-center">
                            <label className="text-[10px] font-black text-slate-500 uppercase">GASコード ({APP_VERSION})</label>
                            <button onClick={() => {
                              navigator.clipboard.writeText(GAS_CODE);
                              alert('GASコードをコピーしました。GASエディタに貼り付けて新しいデプロイを作成してください。');
                            }} className="text-[10px] font-black bg-slate-900 text-white px-3 py-1.5 rounded-lg hover:bg-slate-800 transition-all">コピー</button>
                          </div>
                          <pre className="w-full p-4 bg-slate-900 text-slate-100 rounded-xl text-[10px] font-mono overflow-x-auto h-64">
                            {GAS_CODE}
                          </pre>
                        </div>
                      </>
                    ) : (
                      <div className="p-6 bg-amber-50 border-2 border-amber-200 rounded-2xl text-center">
                        <Lock className="w-8 h-8 text-amber-500 mx-auto mb-3" />
                        <p className="text-sm font-black text-amber-700">GAS・Webhook・API設定へのアクセス権がありません</p>
                        <p className="text-xs text-amber-600 mt-1">管理者にお問い合わせください</p>
                      </div>
                    )}
                  </div>
                )}
                {settingsTab === 'concept' && (
                  <div className="space-y-4">
                    <label className="text-[10px] font-black text-slate-500 uppercase">プロジェクト名</label>
                    <input type="text" className="w-full p-3 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-600 outline-none focus:border-red-500" value={projectConcept.name} onChange={e => setProjectConcept({ ...projectConcept, name: e.target.value })} />
                    <label className="text-[10px] font-black text-slate-500 uppercase">コンセプト詳細</label>
                    <textarea className="w-full p-3 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-600 outline-none focus:border-red-500 h-32" value={projectConcept.content} onChange={e => setProjectConcept({ ...projectConcept, content: e.target.value })} />
                    <button onClick={async () => {
                      await saveProjectConceptToSheet(projectConcept, settings.gasUrl, currentSheetName);
                      localStorage.setItem('board_project_concept', JSON.stringify(projectConcept));
                      alert('保存しました');
                    }} className="w-full py-3 bg-slate-900 text-white rounded-xl font-black text-xs hover:bg-slate-800 transition-all">コンセプトを保存</button>
                  </div>
                )}
                {settingsTab === 'notifications' && (
                  <div className="space-y-4">
                    <label className="text-[10px] font-black text-slate-500 uppercase">レポート時間</label>
                    <select className="w-full p-3 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-600 outline-none focus:border-red-500" value={settings.reportTime} onChange={e => setSettings({ ...settings, reportTime: e.target.value })}>
                      <option value="Monday 08:00">月曜 08:00</option>
                      <option value="Monday 09:00">月曜 09:00</option>
                    </select>
                    <label className="text-[10px] font-black text-slate-500 uppercase">Cliq Webhook URL</label>
                    <input type="text" className="w-full p-3 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-600 outline-none focus:border-red-500" value={settings.cliqUrl} onChange={e => setSettings({ ...settings, cliqUrl: e.target.value })} />
                  </div>
                )}
                {settingsTab === 'epics' && isAdmin && (() => {
                  const totalWeight = localGoalEpics.reduce((s, g) => s + (g.weight || 0), 0);
                  return (
                  <div className="space-y-4">
                    {/* goalEpics詳細編集（Excel由来のプロジェクト） */}
                    {localGoalEpics.length > 0 && (
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <h3 className="font-black text-sm flex items-center gap-2 text-amber-600">
                            <Target className="w-4 h-4" /> 目標エピック詳細編集
                          </h3>
                          <div className={`text-xs font-black px-3 py-1 rounded-full ${totalWeight === 100 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                            合計ポイント: {totalWeight} / 100{totalWeight !== 100 && ' ⚠ 合計が100になるよう調整してください'}
                          </div>
                        </div>
                        {localGoalEpics.map((ge, idx) => (
                          <div key={ge.id || idx} className="p-5 rounded-2xl border border-amber-100 bg-amber-50/30 space-y-3">
                            {/* ヘッダー: 名前 + 配分% */}
                            <div className="flex items-center justify-between gap-3">
                              <span className="text-sm font-black text-slate-800 flex-1">{ge.name}</span>
                              <div className="flex items-center gap-1.5 flex-shrink-0">
                                <label className="text-[10px] font-black text-slate-500">配分</label>
                                <input
                                  type="number" min="0" max="100"
                                  className="w-16 p-1.5 bg-white border border-amber-200 rounded-lg text-xs font-black text-amber-700 outline-none focus:border-amber-500 text-center"
                                  value={ge.weight}
                                  onChange={e => handleUpdateGoalEpic(ge.id, { weight: parseInt(e.target.value) || 0 })}
                                />
                                <span className="text-[10px] font-black text-amber-700">%</span>
                              </div>
                            </div>
                            {/* 期日 */}
                            <div>
                              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">期日</label>
                              <input
                                type="date"
                                className="w-full p-2 bg-white border border-slate-200 rounded-lg text-xs font-bold text-slate-700 outline-none focus:border-amber-500"
                                value={ge.dueDate || ''}
                                onChange={e => handleUpdateGoalEpic(ge.id, { dueDate: e.target.value })}
                              />
                            </div>
                            {/* ゴール */}
                            <div>
                              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">どのような状態（ゴール）</label>
                              <textarea
                                className="w-full p-2 bg-white border border-slate-200 rounded-lg text-xs font-bold text-slate-700 outline-none focus:border-amber-500 h-16 resize-none"
                                value={ge.goal || ''}
                                onChange={e => handleUpdateGoalEpic(ge.id, { goal: e.target.value })}
                                placeholder="ゴールの状態を入力..."
                              />
                            </div>
                            {/* ルール */}
                            <div>
                              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">ルール</label>
                              <textarea
                                className="w-full p-2 bg-white border border-slate-200 rounded-lg text-xs font-bold text-slate-700 outline-none focus:border-amber-500 h-16 resize-none"
                                value={ge.rule || ''}
                                onChange={e => handleUpdateGoalEpic(ge.id, { rule: e.target.value })}
                                placeholder="ルールを入力..."
                              />
                            </div>
                            {/* Admin: 総合評価スライダー */}
                            <div className="bg-amber-50 p-3 rounded-xl border border-amber-100">
                              <div className="flex justify-between items-center mb-2">
                                <label className="text-[10px] font-black text-amber-600 uppercase tracking-widest">総合評価スコア (0–10) — Admin編集</label>
                                <span className="text-lg font-black text-amber-700">{ge.totalScore ?? 0}<span className="text-xs text-slate-400 font-bold">/10</span></span>
                              </div>
                              <input
                                type="range" min="0" max="10" step="0.5"
                                className="w-full accent-amber-600"
                                value={ge.totalScore ?? 0}
                                onChange={e => handleUpdateGoalEpic(ge.id, { totalScore: parseFloat(e.target.value) })}
                              />
                            </div>
                            {/* メンバー配分 */}
                            <div>
                              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2">メンバー配分 (%)</label>
                              {members.length === 0 ? (
                                <p className="text-[10px] text-slate-400 italic">メンバーが未登録です（設定→メンバーから追加）</p>
                              ) : (
                                <div className="space-y-1.5">
                                  {members.map(m => {
                                    const ms = ge.memberScores?.find(s => s.memberName === m.name);
                                    return (
                                      <div key={m.name} className="flex items-center justify-between gap-2 bg-white px-3 py-2 rounded-lg border border-slate-100">
                                        <div className="flex-1 min-w-0">
                                          <span className="text-xs font-bold text-slate-700">{m.name}</span>
                                          {m.department && <span className="text-[9px] text-slate-400 font-bold ml-1.5">{m.department}</span>}
                                        </div>
                                        <div className="flex items-center gap-1 flex-shrink-0">
                                          <input
                                            type="number" min="0" max="100"
                                            className="w-14 p-1 bg-slate-50 border border-slate-200 rounded text-[10px] font-black text-slate-700 outline-none focus:border-amber-500 text-center"
                                            value={ms?.allocation ?? 0}
                                            onChange={e => {
                                              const val = parseInt(e.target.value) || 0;
                                              const currentScores = ge.memberScores || [];
                                              const existingIdx = currentScores.findIndex(s => s.memberName === m.name);
                                              const newScores = existingIdx >= 0
                                                ? currentScores.map((s, i) => i === existingIdx ? { ...s, allocation: val } : s)
                                                : [...currentScores, { memberName: m.name, allocation: val }];
                                              handleUpdateGoalEpic(ge.id, { memberScores: newScores });
                                            }}
                                          />
                                          <span className="text-[9px] text-slate-400 font-black">%</span>
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          </div>
                        ))}
                        <div className="h-px bg-slate-200 my-2" />
                      </div>
                    )}
                    <div className="flex justify-between items-center">
                      <h3 className="font-black text-sm flex items-center gap-2 uppercase tracking-wider text-red-600"><Briefcase className="w-4 h-4" /> エピック管理</h3>
                      <div className="flex items-center gap-2">
                        <input type="text" value={newEpicName} onChange={e => setNewEpicName(e.target.value)} placeholder="新しいエピック名" className="p-2 border border-slate-200 rounded-lg text-xs outline-none focus:border-red-500" />
                        <button onClick={() => {
                          if (newEpicName) {
                            setEpics(prev => {
                              if (prev.includes(newEpicName)) return prev;
                              const next = [...prev, newEpicName];
                              saveEpicsToSheet(next, settings.gasUrl, currentSheetName);
                              return next;
                            });
                            setNewEpicName('');
                          }
                        }} className="text-[10px] font-black bg-red-50 text-red-600 px-4 py-2 rounded-lg hover:bg-red-100 transition-all flex items-center gap-1">
                          <Plus className="w-3 h-3" /> 追加
                        </button>
                      </div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {epics.map((epic, idx) => (
                        <div key={epic} className="flex justify-between items-center p-3 bg-slate-50 rounded-xl border border-slate-100 group">
                          <span className="text-xs font-bold text-slate-700">{epic}</span>
                          <button onClick={() => {
                            setEpics(prev => {
                              const next = prev.filter((_, i) => i !== idx);
                              saveEpicsToSheet(next, settings.gasUrl, currentSheetName);
                              return next;
                            });
                          }} className="p-1.5 text-rose-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                  );
                })()}
                {settingsTab === 'scores' && isAdmin && (
                  <div className="space-y-8">
                    <h3 className="font-black text-sm flex items-center gap-2 uppercase tracking-wider text-amber-600"><Star className="w-4 h-4" /> 評価スコア設定</h3>

                    {/* プロジェクト評価 0-10 */}
                    <div className="p-6 bg-white border border-amber-100 rounded-2xl shadow-sm space-y-4">
                      <div className="flex justify-between items-center">
                        <div>
                          <h4 className="font-black text-sm text-slate-800">プロジェクト総合評価</h4>
                          <p className="text-[10px] text-slate-400 font-bold mt-0.5">このプロジェクト全体の達成度・完成度を評価してください</p>
                        </div>
                        <span className="text-3xl font-black text-amber-600">
                          {localProjectScore}<span className="text-sm text-slate-400 font-bold">/10</span>
                        </span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-[10px] font-black text-slate-400">0</span>
                        <input
                          type="range" min="0" max="10" step="0.5"
                          className="flex-1 accent-amber-600"
                          value={localProjectScore}
                          onChange={e => {
                            const val = parseFloat(e.target.value);
                            setLocalProjectScore(val);
                            if (projectId) {
                              const proj = getProjectsMeta().find(p => p.id === projectId);
                              if (proj) updateProjectInStore({ ...proj, projectScore: val, updatedAt: new Date().toISOString() });
                            }
                          }}
                        />
                        <span className="text-[10px] font-black text-slate-400">10</span>
                      </div>
                      <div className="flex justify-between text-[9px] text-slate-400 font-bold px-1">
                        {[0,2,4,6,8,10].map(v => <span key={v}>{v}</span>)}
                      </div>
                      <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                        <div className="h-full bg-amber-500 transition-all" style={{ width: `${localProjectScore * 10}%` }} />
                      </div>
                    </div>

                    {/* エピック別評価 0-10 */}
                    {localGoalEpics.length > 0 && (
                      <div className="space-y-4">
                        <h4 className="font-black text-sm text-slate-700 flex items-center gap-2">
                          <Target className="w-4 h-4 text-amber-600" /> エピック別評価 (0–10)
                        </h4>
                        <p className="text-[10px] text-slate-400 font-bold -mt-2">各エピックの達成度を0〜10で評価してください。役員ダッシュボードに反映されます。</p>
                        {localGoalEpics.map((ge, idx) => (
                          <div key={ge.id || idx} className="p-5 bg-white border border-slate-200 rounded-2xl shadow-sm space-y-3">
                            <div className="flex justify-between items-center">
                              <span className="text-sm font-black text-slate-800">{ge.name}</span>
                              <span className="text-2xl font-black text-amber-600">
                                {ge.totalScore ?? 0}<span className="text-sm text-slate-400 font-bold">/10</span>
                              </span>
                            </div>
                            <div className="flex items-center gap-3">
                              <span className="text-[10px] font-black text-slate-400">0</span>
                              <input
                                type="range" min="0" max="10" step="0.5"
                                className="flex-1 accent-amber-600"
                                value={ge.totalScore ?? 0}
                                onChange={e => handleUpdateGoalEpic(ge.id, { totalScore: parseFloat(e.target.value) })}
                              />
                              <span className="text-[10px] font-black text-slate-400">10</span>
                            </div>
                            <div className="flex justify-between text-[9px] text-slate-400 font-bold px-1">
                              {[0,2,4,6,8,10].map(v => <span key={v}>{v}</span>)}
                            </div>
                            <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                              <div className="h-full bg-amber-400 transition-all" style={{ width: `${(ge.totalScore ?? 0) * 10}%` }} />
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                    {localGoalEpics.length === 0 && (
                      <p className="text-xs text-slate-400 italic text-center py-4">目標エピックが設定されていません（エピックタブで追加できます）</p>
                    )}
                  </div>
                )}
                {settingsTab === 'evaluation' && isAdmin && (
                  <div className="space-y-4">
                    <h3 className="font-black text-sm flex items-center gap-2 uppercase tracking-wider text-red-600"><Award className="w-4 h-4" /> 評価結果</h3>
                    <EvaluationView tasks={tasks} members={members} isAdmin={isAdmin} currentUserName={settings.userName} />
                  </div>
                )}
                {settingsTab === 'evaluation_tasks' && isAdmin && (
                  <div className="space-y-4">
                    <h3 className="font-black text-sm flex items-center gap-2 uppercase tracking-wider text-red-600"><Target className="w-4 h-4" /> 評価対象タスク</h3>
                    <div className="space-y-4">
                      {tasks.filter(t => !t.isSoftDeleted && t.status === TaskStatus.COMPLETED).map(task => (
                        <div key={task.id} className="p-4 bg-white rounded-2xl border border-slate-200 shadow-sm space-y-4">
                          <h4 className="text-sm font-bold text-slate-800">{task.title}</h4>
                          <div className="grid grid-cols-2 gap-4">
                            <div>
                              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2">難易度 (1-100)</label>
                              <input type="number" className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold text-slate-700 outline-none focus:border-red-500" value={task.evaluation?.difficulty || 50} onChange={e => {
                                const val = parseInt(e.target.value);
                                const currentEval = task.evaluation || { difficulty: 50, outcome: 3, memberEvaluations: [] };
                                saveSingleTaskToSheet({ ...task, evaluation: { ...currentEval, difficulty: val } }, settings.gasUrl, undefined, undefined, undefined, undefined, currentSheetName);
                              }} />
                            </div>
                            <div>
                              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2">成果 (1-5)</label>
                              <input type="number" min="1" max="5" className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold text-slate-700 outline-none focus:border-red-500" value={task.evaluation?.outcome || 3} onChange={e => {
                                const val = parseInt(e.target.value) as 1 | 2 | 3 | 4 | 5;
                                const currentEval = task.evaluation || { difficulty: 50, outcome: 3, memberEvaluations: [] };
                                saveSingleTaskToSheet({ ...task, evaluation: { ...currentEval, outcome: val } }, settings.gasUrl, undefined, undefined, undefined, undefined, currentSheetName);
                              }} />
                            </div>
                          </div>
                          <div>
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2">メンバー別評価</label>
                            <div className="space-y-2">
                              {members.filter(m => task.team?.includes(m.name)).map(m => {
                                const evalData = task.evaluation?.memberEvaluations?.find(me => me.memberId === m.name);
                                return (
                                  <div key={m.name} className="flex items-center justify-between p-2 bg-slate-50 rounded-lg border border-slate-100">
                                    <span className="text-xs font-bold text-slate-700">{m.name}</span>
                                    <div className="flex gap-1">
                                      {[1, 2, 3, 4, 5].map(r => (
                                        <button key={r} onClick={() => {
                                          const currentEval = task.evaluation || { difficulty: 50, outcome: 3, memberEvaluations: [] };
                                          const existingIndex = currentEval.memberEvaluations.findIndex(me => me.memberId === m.name);
                                          let newMemberEvals = [...currentEval.memberEvaluations];
                                          if (existingIndex >= 0) {
                                            newMemberEvals[existingIndex] = { ...newMemberEvals[existingIndex], rating: r as any };
                                          } else {
                                            newMemberEvals.push({ memberId: m.name, rating: r as any });
                                          }
                                          saveSingleTaskToSheet({ ...task, evaluation: { ...currentEval, memberEvaluations: newMemberEvals } }, settings.gasUrl, undefined, undefined, undefined, undefined, currentSheetName);
                                        }} className={`w-7 h-7 rounded-lg flex items-center justify-center text-[10px] font-bold transition-all ${evalData?.rating === r ? 'bg-red-600 text-white' : 'bg-white border border-slate-200 text-slate-500 hover:bg-red-50'}`}>
                                          {r}
                                        </button>
                                      ))}
                                    </div>
                                  </div>
                                );
                              })}
                              {(!task.team || task.team.length === 0) && (
                                <p className="text-xs font-bold text-slate-400 italic">チームメンバーが設定されていません</p>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {settingsTab === 'members' && isAdmin && (() => {
                  // 事業部・部署リスト（登録済みメンバーから収集）
                  const allBusinessUnits = Array.from(new Set(members.map(m => m.businessUnit).filter(Boolean))) as string[];
                  const allDepts = Array.from(new Set(members.map(m => m.department).filter(Boolean))) as string[];
                  const filteredMembers = memberDeptFilter === 'all' ? members
                    : members.filter(m => m.businessUnit === memberDeptFilter || m.department === memberDeptFilter);

                  // CSV解析: "ID,事業部,部署,氏名" 等に対応
                  const parseCsvMembers = (text: string): MemberInfo[] => {
                    const lines = text.split(/\r?\n/).filter(l => l.trim());
                    if (lines.length === 0) return [];
                    const results: MemberInfo[] = [];
                    const header = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
                    const idIdx = header.findIndex(h => /^(ID|社員ID|社員番号|id)$/i.test(h));
                    const buIdx = header.findIndex(h => h.includes('事業部') || h.includes('business'));
                    const deptIdx = header.findIndex(h => (h.includes('部署') || h.includes('部門') || h.includes('department')) && !h.includes('事業'));
                    const nameIdx = header.findIndex(h => h.includes('氏名') || h.includes('名前') || /^name$/i.test(h));
                    if (nameIdx < 0) return [];
                    for (let i = 1; i < lines.length; i++) {
                      const cols = lines[i].split(',').map(c => c.trim().replace(/"/g, ''));
                      const name = cols[nameIdx]?.trim();
                      if (!name) continue;
                      results.push({
                        name,
                        email: '',
                        type: 'internal',
                        role: 'user',
                        employeeId: idIdx >= 0 ? cols[idIdx]?.trim() || undefined : undefined,
                        businessUnit: buIdx >= 0 ? cols[buIdx]?.trim() || undefined : undefined,
                        department: deptIdx >= 0 ? cols[deptIdx]?.trim() || undefined : undefined,
                      });
                    }
                    return results;
                  };

                  return (
                  <div className="space-y-5">
                    <div className="flex flex-wrap justify-between items-center gap-3">
                      <h3 className="font-black text-sm flex items-center gap-2 uppercase tracking-wider text-red-600"><Users className="w-4 h-4" /> 評価対象メンバー名簿</h3>
                      <div className="flex items-center gap-2 flex-wrap">
                        {/* CSVアップロード */}
                        <input ref={csvMemberInputRef} type="file" accept=".csv,.txt" className="hidden" onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (!file) return;
                          const reader = new FileReader();
                          reader.onload = (ev) => {
                            const text = ev.target?.result as string;
                            const parsed = parseCsvMembers(text);
                            if (parsed.length === 0) { alert('CSVから名前を読み取れませんでした。\n列に「氏名」または「name」を含めてください。'); return; }
                            if (confirm(`${parsed.length}名を追加しますか？\n（既存メンバーと重複する名前はスキップします）`)) {
                              setMembers(prev => {
                                const existing = new Set(prev.map(m => m.name));
                                const newOnes = parsed.filter(m => !existing.has(m.name));
                                return [...prev, ...newOnes];
                              });
                            }
                            if (csvMemberInputRef.current) csvMemberInputRef.current.value = '';
                          };
                          reader.readAsText(file, 'UTF-8');
                        }} />
                        <button onClick={() => csvMemberInputRef.current?.click()} className="text-[10px] font-black bg-blue-50 text-blue-600 px-4 py-2 rounded-lg hover:bg-blue-100 transition-all flex items-center gap-1">
                          <Upload className="w-3 h-3" /> CSV名簿読込
                        </button>
                        <button onClick={() => setMembers([])} className="text-[10px] font-black bg-rose-50 text-rose-500 px-3 py-2 rounded-lg hover:bg-rose-100 transition-all">
                          全削除
                        </button>
                      </div>
                    </div>

                    {/* CSVフォーマットヒント */}
                    <div className="bg-blue-50 border border-blue-100 rounded-xl px-4 py-3 text-[10px] text-blue-700 font-bold">
                      📄 CSVフォーマット: 1行目にヘッダー「ID,事業部,部署,氏名」等を記載してください。Excelで「CSV(UTF-8)」として保存したファイルが使えます。
                    </div>

                    {/* 手動追加 */}
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-2 border border-slate-100 bg-slate-50 rounded-xl p-3">
                      <div className="col-span-2 md:col-span-3 text-[10px] font-black text-slate-500 mb-1">手動追加</div>
                      <input type="text" value={newMemberId} onChange={e => setNewMemberId(e.target.value)} placeholder="社員ID（任意）" className="p-2 border border-slate-200 rounded-lg text-xs outline-none focus:border-red-500 bg-white" />
                      <input type="text" value={newMemberName} onChange={e => setNewMemberName(e.target.value)} placeholder="氏名 *" className="p-2 border border-slate-200 rounded-lg text-xs outline-none focus:border-red-500 bg-white" onKeyDown={e => { if (e.key === 'Enter' && newMemberName) { setMembers(prev => [...prev, { name: newMemberName, email: '', type: 'internal', role: 'user', employeeId: newMemberId || undefined, businessUnit: newMemberBusinessUnit || undefined, department: newMemberDept || undefined }]); setNewMemberName(''); setNewMemberId(''); setNewMemberBusinessUnit(''); setNewMemberDept(''); }}} />
                      <input type="text" value={newMemberBusinessUnit} onChange={e => setNewMemberBusinessUnit(e.target.value)} placeholder="事業部名（任意）" className="p-2 border border-slate-200 rounded-lg text-xs outline-none focus:border-red-500 bg-white" />
                      <input type="text" value={newMemberDept} onChange={e => setNewMemberDept(e.target.value)} placeholder="部署名（任意）" className="p-2 border border-slate-200 rounded-lg text-xs outline-none focus:border-red-500 bg-white" />
                      <div className="flex justify-end items-center">
                        <button onClick={() => {
                          if (newMemberName) {
                            setMembers(prev => [...prev, { name: newMemberName, email: '', type: 'internal', role: 'user', employeeId: newMemberId || undefined, businessUnit: newMemberBusinessUnit || undefined, department: newMemberDept || undefined }]);
                            setNewMemberName(''); setNewMemberId(''); setNewMemberBusinessUnit(''); setNewMemberDept('');
                          }
                        }} className="text-[10px] font-black bg-red-50 text-red-600 px-4 py-2 rounded-lg hover:bg-red-100 transition-all flex items-center gap-1">
                          <UserPlus className="w-3 h-3" /> 追加
                        </button>
                      </div>
                    </div>

                    {/* 事業部・部署フィルター */}
                    {(allBusinessUnits.length > 0 || allDepts.length > 0) && (
                      <div className="flex items-center gap-2 flex-wrap">
                        <Filter className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                        <button onClick={() => setMemberDeptFilter('all')} className={`text-[10px] font-black px-3 py-1.5 rounded-full transition-all ${memberDeptFilter === 'all' ? 'bg-red-600 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}>すべて</button>
                        {allBusinessUnits.map(bu => (
                          <button key={bu} onClick={() => setMemberDeptFilter(bu)} className={`text-[10px] font-black px-3 py-1.5 rounded-full transition-all ${memberDeptFilter === bu ? 'bg-indigo-600 text-white' : 'bg-indigo-50 text-indigo-500 hover:bg-indigo-100'}`}>{bu}</button>
                        ))}
                        {allDepts.map(dept => (
                          <button key={dept} onClick={() => setMemberDeptFilter(dept)} className={`text-[10px] font-black px-3 py-1.5 rounded-full transition-all ${memberDeptFilter === dept ? 'bg-red-600 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}>{dept}</button>
                        ))}
                      </div>
                    )}

                    {/* メンバー一覧 */}
                    <div className="space-y-2">
                      <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">
                        {filteredMembers.length}名 {memberDeptFilter !== 'all' ? `(${memberDeptFilter})` : `/ 合計${members.length}名`}
                      </div>
                      <div className="grid grid-cols-1 gap-2">
                        {filteredMembers.map((m) => {
                          const realIdx = members.indexOf(m);
                          return (
                          <div key={`${m.name}-${realIdx}`} className={`flex items-center justify-between p-3 rounded-xl border group transition-all ${m.isLeader ? 'bg-amber-50 border-amber-200' : 'bg-slate-50 border-slate-100'}`}>
                            <div className="flex items-center gap-3 min-w-0">
                              <div className={`w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 ${m.isLeader ? 'bg-amber-400 text-white' : 'bg-slate-200 text-slate-500'}`}>
                                {m.isLeader ? <Crown className="w-4 h-4" /> : <span className="text-[10px] font-black">{m.name[0]}</span>}
                              </div>
                              <div className="min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  {m.employeeId && <span className="text-[9px] font-black text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded font-mono">{m.employeeId}</span>}
                                  <span className="text-xs font-black text-slate-700 truncate">{m.name}</span>
                                  {m.isLeader && <span className="text-[9px] font-black text-amber-600 bg-amber-100 px-2 py-0.5 rounded-full">リーダー</span>}
                                </div>
                                <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
                                  {m.businessUnit && <span className="text-[9px] text-indigo-500 font-bold">{m.businessUnit}</span>}
                                  {m.businessUnit && m.department && <span className="text-[9px] text-slate-300">›</span>}
                                  {m.department && <span className="text-[9px] text-slate-400 font-bold">{m.department}</span>}
                                </div>
                              </div>
                            </div>
                            <div className="flex items-center gap-2 flex-shrink-0">
                              {/* 評価者トグル */}
                              <button
                                onClick={() => setMembers(prev => prev.map((mem, i) => i === realIdx ? { ...mem, isEvaluator: !mem.isEvaluator } : mem))}
                                title={m.isEvaluator ? '評価者解除' : '評価者に指定'}
                                className={`p-1.5 rounded-lg transition-all ${m.isEvaluator ? 'text-orange-500 bg-orange-100 hover:bg-orange-200' : 'text-slate-300 hover:text-orange-500 hover:bg-orange-50'}`}
                              >
                                <Award className="w-4 h-4" />
                              </button>
                              {/* リーダートグル */}
                              <button
                                onClick={() => setMembers(prev => prev.map((mem, i) => i === realIdx ? { ...mem, isLeader: !mem.isLeader } : mem))}
                                title={m.isLeader ? 'リーダー解除' : 'リーダーに設定'}
                                className={`p-1.5 rounded-lg transition-all ${m.isLeader ? 'text-amber-500 bg-amber-100 hover:bg-amber-200' : 'text-slate-300 hover:text-amber-500 hover:bg-amber-50'}`}
                              >
                                <Crown className="w-4 h-4" />
                              </button>
                              <select
                                value={m.role}
                                onChange={(e) => {
                                  const newRole = e.target.value as 'admin' | 'manager' | 'user' | 'executive';
                                  setMembers(prev => prev.map((mem, i) => i === realIdx ? { ...mem, role: newRole } : mem));
                                }}
                                className="text-[10px] font-black bg-white border border-slate-200 rounded-lg p-1 outline-none focus:border-red-500"
                              >
                                <option value="user">User</option>
                                <option value="manager">Manager</option>
                                <option value="executive">Executive</option>
                                <option value="admin">Admin</option>
                              </select>
                              <button onClick={() => {
                                setMembers(prev => prev.filter((_, i) => i !== realIdx));
                              }} className="p-1.5 text-rose-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all">
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                  );
                })()}
                {settingsTab === 'maintenance' && isAdmin && (
                  <div className="space-y-6">
                    <div className="p-6 bg-slate-50 border border-slate-100 rounded-[2rem] space-y-4">
                      <h3 className="font-black text-sm flex items-center gap-2 uppercase tracking-wider text-blue-600"><Download className="w-4 h-4" /> プロジェクト・バックアップ</h3>
                      <p className="text-xs text-slate-500 font-bold leading-relaxed">
                        このプロジェクト（{projectConcept.name}）の全タスク、設定、メンバー、評価データを一つのJSONファイルとして書き出します。
                        データの移行や、編集前のバックアップとしてご利用ください。
                      </p>
                      <button 
                        onClick={() => {
                          const backupData = {
                            version: APP_VERSION,
                            projectId: projectId,
                            projectName: projectConcept.name,
                            timestamp: new Date().toISOString(),
                            data: {
                              tasks,
                              projectConcept,
                              epics,
                              members
                            }
                          };
                          const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: 'application/json' });
                          const url = URL.createObjectURL(blob);
                          const a = document.createElement('a');
                          a.href = url;
                          a.download = `backup_${projectConcept.name}_${new Date().toISOString().split('T')[0]}.json`;
                          a.click();
                          URL.revokeObjectURL(url);
                        }}
                        className="flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-xl font-black text-xs hover:bg-blue-700 transition-all shadow-lg shadow-blue-100"
                      >
                        <Download className="w-4 h-4" /> バックアップをダウンロード
                      </button>
                    </div>

                    <div className="p-6 bg-rose-50 border border-rose-100 rounded-[2rem] space-y-4">
                      <h3 className="font-black text-sm flex items-center gap-2 uppercase tracking-wider text-rose-600"><Upload className="w-4 h-4" /> プロジェクト・復元</h3>
                      <p className="text-xs text-rose-600 font-bold leading-relaxed">
                        ⚠️ 警告: バックアップファイル（JSON）を選択して復元します。
                        現在のプロジェクトデータはすべて上書きされます。この操作は取り消せません。
                      </p>
                      <div className="flex gap-2">
                        <input 
                          type="file" 
                          id="restore-file" 
                          accept=".json" 
                          className="hidden" 
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (!file) return;
                            const reader = new FileReader();
                            reader.onload = async (ev) => {
                              try {
                                const backup = JSON.parse(ev.target?.result as string);
                                if (!backup.data || !backup.data.tasks) {
                                  throw new Error("無効なバックアップファイルです");
                                }
                                if (confirm(`プロジェクト「${backup.projectName || '不明'}」のデータを復元し、現在のデータを上書きしますか？`)) {
                                  const rTasks = backup.data.tasks;
                                  const rConcept = backup.data.projectConcept || projectConcept;
                                  const rEpics = backup.data.epics || epics;
                                  const rMembers = backup.data.members || members;

                                  setTasks(rTasks);
                                  setProjectConcept(rConcept);
                                  setEpics(rEpics);
                                  setMembers(rMembers);
                                  
                                  // 復元後、サーバーへ即座に反映するか確認
                                  if (confirm("復元したデータをサーバー（MySQL/GAS）に即座に反映（一括保存）しますか？")) {
                                    handlePushAll(rTasks, rMembers, rConcept, true);
                                  } else {
                                    alert("データを読み込みました。後で「設定を保存して再読込」をクリックして反映させてください。");
                                  }
                                }
                              } catch (err) {
                                alert("復元に失敗しました: " + err);
                              }
                            };
                            reader.readAsText(file);
                          }}
                        />
                        <button 
                          onClick={() => document.getElementById('restore-file')?.click()}
                          className="flex items-center gap-2 px-6 py-3 bg-white border-2 border-rose-200 text-rose-600 rounded-xl font-black text-xs hover:bg-rose-50 transition-all"
                        >
                          <Upload className="w-4 h-4" /> ファイルを選択して復元
                        </button>
                      </div>
                    </div>
                  </div>
                )}
                {settingsTab === 'dept_evaluation' && isManager && !isAdmin && (
                  <div className="space-y-6">
                    <div className="p-4 bg-blue-50 border border-blue-100 rounded-xl flex items-center gap-3">
                      <Briefcase className="w-5 h-5 text-blue-600" />
                      <div>
                        <p className="text-sm font-black text-blue-700">部門評価ビュー</p>
                        <p className="text-xs text-blue-500 font-bold">
                          担当部門: {managerDepartment || '未設定 — 管理者にメンバー一覧で部門情報の設定を依頼してください'}
                        </p>
                      </div>
                    </div>

                    {/* 部門メンバーの評価結果 */}
                    <div>
                      <h3 className="font-black text-sm flex items-center gap-2 uppercase tracking-wider text-blue-600 mb-4">
                        <Award className="w-4 h-4" /> 評価結果 — {managerDepartment || '全部門'}
                      </h3>
                      <EvaluationView
                        tasks={tasks}
                        members={managerDepartment ? members.filter(m => m.department === managerDepartment) : members}
                        isAdmin={true}
                        currentUserName={settings.userName}
                      />
                    </div>

                    {/* タスク評価入力 */}
                    <div>
                      <h3 className="font-black text-sm flex items-center gap-2 uppercase tracking-wider text-blue-600 mb-4">
                        <Target className="w-4 h-4" /> タスク評価入力 — {managerDepartment || '全部門'}
                      </h3>
                      <div className="space-y-4">
                        {tasks.filter(t =>
                          !t.isSoftDeleted &&
                          t.status === TaskStatus.COMPLETED &&
                          (!managerDepartment ||
                            t.department === managerDepartment ||
                            t.team?.some(memberName => members.find(m => m.name === memberName)?.department === managerDepartment))
                        ).map(task => (
                          <div key={task.id} className="p-4 bg-white rounded-2xl border border-slate-200 shadow-sm space-y-4">
                            <h4 className="text-sm font-bold text-slate-800">{task.title}</h4>
                            <div className="grid grid-cols-2 gap-4">
                              <div>
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2">難易度 (1-100)</label>
                                <input
                                  type="number"
                                  className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold text-slate-700 outline-none focus:border-blue-500"
                                  value={task.evaluation?.difficulty || 50}
                                  onChange={e => {
                                    const val = parseInt(e.target.value);
                                    const currentEval = task.evaluation || { difficulty: 50, outcome: 3, memberEvaluations: [] };
                                    saveSingleTaskToSheet({ ...task, evaluation: { ...currentEval, difficulty: val } }, settings.gasUrl, undefined, undefined, undefined, undefined, currentSheetName);
                                  }}
                                />
                              </div>
                              <div>
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2">成果 (1-5)</label>
                                <input
                                  type="number" min="1" max="5"
                                  className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold text-slate-700 outline-none focus:border-blue-500"
                                  value={task.evaluation?.outcome || 3}
                                  onChange={e => {
                                    const val = parseInt(e.target.value) as 1 | 2 | 3 | 4 | 5;
                                    const currentEval = task.evaluation || { difficulty: 50, outcome: 3, memberEvaluations: [] };
                                    saveSingleTaskToSheet({ ...task, evaluation: { ...currentEval, outcome: val } }, settings.gasUrl, undefined, undefined, undefined, undefined, currentSheetName);
                                  }}
                                />
                              </div>
                            </div>
                            <div>
                              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2">メンバー別評価</label>
                              <div className="space-y-2">
                                {members.filter(m =>
                                  task.team?.includes(m.name) &&
                                  (!managerDepartment || m.department === managerDepartment)
                                ).map(m => {
                                  const evalData = task.evaluation?.memberEvaluations?.find(me => me.memberId === m.name);
                                  return (
                                    <div key={m.name} className="flex items-center justify-between p-2 bg-slate-50 rounded-lg border border-slate-100">
                                      <div>
                                        <span className="text-xs font-bold text-slate-700">{m.name}</span>
                                        {m.department && <span className="text-[10px] text-slate-400 ml-2">{m.department}</span>}
                                      </div>
                                      <div className="flex gap-1">
                                        {[1, 2, 3, 4, 5].map(r => (
                                          <button key={r} onClick={() => {
                                            const currentEval = task.evaluation || { difficulty: 50, outcome: 3, memberEvaluations: [] };
                                            const existingIndex = currentEval.memberEvaluations.findIndex(me => me.memberId === m.name);
                                            let newMemberEvals = [...currentEval.memberEvaluations];
                                            if (existingIndex >= 0) {
                                              newMemberEvals[existingIndex] = { ...newMemberEvals[existingIndex], rating: r as any };
                                            } else {
                                              newMemberEvals.push({ memberId: m.name, rating: r as any });
                                            }
                                            const updated = { ...task, evaluation: { ...currentEval, memberEvaluations: newMemberEvals } };
                                            setTasks(prev => prev.map(t => t.id === task.id ? updated : t));
                                            saveSingleTaskToSheet(updated, settings.gasUrl, undefined, undefined, undefined, undefined, currentSheetName);
                                          }} className={`w-7 h-7 rounded-lg flex items-center justify-center text-[10px] font-bold transition-all ${evalData?.rating === r ? 'bg-blue-600 text-white' : 'bg-white border border-slate-200 text-slate-500 hover:bg-blue-50'}`}>
                                            {r}
                                          </button>
                                        ))}
                                      </div>
                                    </div>
                                  );
                                })}
                                {members.filter(m => task.team?.includes(m.name) && (!managerDepartment || m.department === managerDepartment)).length === 0 && (
                                  <p className="text-xs font-bold text-slate-400 italic">担当部門のメンバーがチームに含まれていません</p>
                                )}
                              </div>
                            </div>
                          </div>
                        ))}
                        {tasks.filter(t =>
                          !t.isSoftDeleted && t.status === TaskStatus.COMPLETED &&
                          (!managerDepartment ||
                            t.department === managerDepartment ||
                            t.team?.some(memberName => members.find(m => m.name === memberName)?.department === managerDepartment))
                        ).length === 0 && (
                          <p className="text-xs font-bold text-slate-400 italic text-center py-8">評価対象の完了タスクはありません</p>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
              <div className="p-8 border-t flex-shrink-0">
                <button onClick={async () => {
                  localStorage.setItem('board_gas_url', sanitizeGasUrl(settings.gasUrl));
                  localStorage.setItem('board_cliq_url', settings.cliqUrl);
                  localStorage.setItem('board_report_time', settings.reportTime);
                  localStorage.setItem('board_members_v2', JSON.stringify(members));
                  setShowSettingsModal(false);
                  loadData();
                }} className="w-full py-5 bg-red-600 text-white rounded-2xl font-black shadow-xl hover:bg-red-700 transition-all active:scale-95">
                  設定を保存して再読込
                </button>
              </div>
            </div>
          </div>
        )}

        {timelineSelectedTaskId && (() => {
          const t = tasks.find(task => task.id === timelineSelectedTaskId);
          if (!t) return null;
          return (
            <div className="fixed inset-0 z-[300] bg-slate-900/60 backdrop-blur-md flex items-center justify-center p-4 lg:p-10" onClick={() => setTimelineSelectedTaskId(null)}>
              <div
                className="w-full max-w-4xl max-h-[95vh] overflow-y-auto custom-scrollbar relative bg-slate-50 rounded-[3rem] p-4 lg:p-8"
                onClick={e => e.stopPropagation()}
              >
                <div className="absolute top-6 right-6 z-[400]">
                  <button onClick={() => setTimelineSelectedTaskId(null)} className="p-3 bg-white text-slate-400 hover:text-red-500 rounded-full shadow-lg border border-slate-100 hover:scale-110 transition-all">
                    <X className="w-5 h-5" />
                  </button>
                </div>
                <TaskItem
                  task={t}
                  depth={0}
                  isInitiallyExpanded={true}
                  initialTab="basic"
                  autoEditTitle={false}
                  isAdmin={isAdmin}
                  currentUserName={settings.userName}
                  onUpdateTaskDetails={(tid, details) => {
                    const isImmediate = !!details.attachments || !!details.status;
                    updateTaskAndSave(tid, t2 => ({ ...t2, ...details }), isImmediate ? 'immediate' : 'none');
                  }}
                  onUpdateStatus={(tid, status) => updateTaskAndSave(tid, t2 => ({ ...t2, status }), 'immediate')}
                  onUpdatePriority={(tid, priority) => updateTaskAndSave(tid, t2 => ({ ...t2, priority }), 'immediate')}
                  onAddProgress={async (tid, content) => {
                    updateTaskAndSave(tid, t2 => {
                      const newP = { week: t2.progress.length + 1, content, updatedAt: new Date().toISOString(), author: settings.userName };
                      return { ...t2, progress: [newP, ...t2.progress] };
                    }, 'immediate');
                  }}
                  onAddComment={async (tid, content) => {
                    updateTaskAndSave(tid, t2 => {
                      const newC: TaskComment = { id: Date.now().toString(), content, author: settings.userName, createdAt: new Date().toISOString() };
                      return { ...t2, comments: [...(t2.comments || []), newC] };
                    }, 'immediate');
                  }}
                  onMarkAsViewed={() => markTaskAsViewed(t.id)}
                  onManualSync={async (taskObj) => {
                    updateTaskAndSave(taskObj.id, t2 => t2, 'immediate');
                  }}
                  onDeleteTask={(tid) => { softDeleteTask(tid); setTimelineSelectedTaskId(null); }}
                  onAddSubTask={addSubTask}
                  onAddSiblingTask={addSiblingTask}
                  members={members}
                  epics={epics}
                  allTasks={tasks}
                />
              </div>
            </div>
          );
        })()}
      </div>
    </div>
  );
};

export default App;
