
import React, { useState, useEffect, useRef } from 'react';
import { Task, TaskStatus, TaskPriority, MemberInfo, TaskComment, TaskEvaluation, Attachment } from '../types';
import {
  ChevronDown, Plus, Clock, History,
  CheckCircle2, Check, Edit2, MessageSquare, UserPlus, X,
  Settings, Star, Target, ShieldCheck, Calculator, Users, Lock, AlertTriangle, Save, Loader2,
  Paperclip, ExternalLink, Trash2, Send, Link as LinkIcon, FileText,
  Activity, TrendingUp, ChevronRight, List, BrainCircuit, UploadCloud, Bell
} from 'lucide-react';

interface Props {
  task: Task;
  isInitiallyExpanded?: boolean;
  autoEditTitle?: boolean;
  initialTab?: 'basic' | 'chat' | 'files' | 'hierarchy';
  isAdmin?: boolean;
  currentUserName: string;
  onAddProgress: (taskId: string, content: string) => void;
  onAddComment: (taskId: string, content: string) => void;
  onUpdateStatus: (taskId: string, status: TaskStatus) => void;
  onUpdatePriority: (taskId: string, priority: TaskPriority) => void;
  onUpdateTaskDetails?: (taskId: string, details: Partial<Task>, immediate?: boolean) => void;
  onMarkAsViewed: (taskId: string) => void;
  onManualSync: (task: Task) => Promise<void>;
  onAddSubTask?: (parentId: string) => void;
  onAddSiblingTask?: (predecessorId: string) => void;
  onDeleteTask?: (taskId: string) => void;
  members?: MemberInfo[];
  epics?: string[];
  allTasks?: Task[]; // To show sub-tasks
  depth?: number;
  projectDepartment?: string; // プロジェクト部署（メンバー優先表示用）
}

export const TaskItem: React.FC<Props> = ({
  task,
  isInitiallyExpanded = false,
  autoEditTitle = false,
  initialTab = 'basic',
  isAdmin = false,
  currentUserName,
  onAddProgress,
  onAddComment,
  onUpdateStatus,
  onUpdatePriority,
  onUpdateTaskDetails,
  onMarkAsViewed,
  members = [],
  epics = [],
  onManualSync,
  onAddSubTask,
  onAddSiblingTask,
  onDeleteTask,
  allTasks = [],
  depth = 0,
  projectDepartment = '',
}) => {
  // 部署に属するメンバーを上位に並べる (task.department → projectDepartment の順で優先)
  const sortedMembers = React.useMemo(() => {
    const dept = task.department || projectDepartment;
    if (!dept) return members;
    return [...members].sort((a, b) => {
      const aMatch = a.department === dept ? 0 : 1;
      const bMatch = b.department === dept ? 0 : 1;
      return aMatch - bMatch;
    });
  }, [members, task.department, projectDepartment]);
  const [isExpanded, setIsExpanded] = useState(isInitiallyExpanded);
  const [activeTab, setActiveTab] = useState<'basic' | 'chat' | 'files' | 'hierarchy'>(initialTab as any || 'basic');

  // Basic Info State
  const [newProgress, setNewProgress] = useState('');
  const [isEditingTitle, setIsEditingTitle] = useState(autoEditTitle);
  const [editTitle, setEditTitle] = useState(task.title);

  // Sync editTitle with prop only when NOT editing to avoid reverting during save
  useEffect(() => {
    if (!isEditingTitle) {
      setEditTitle(task.title);
    }
  }, [task.title, isEditingTitle]);

  // Chat State
  const [newComment, setNewComment] = useState('');

  // File State
  const [newFileName, setNewFileName] = useState('');
  const [newFileUrl, setNewFileUrl] = useState('');
  const [isDragOver, setIsDragOver] = useState(false);

  const [isMemberDropdownOpen, setIsMemberDropdownOpen] = useState(false);
  const [isTeamDropdownOpen, setIsTeamDropdownOpen] = useState(false);
  const [isProjectDropdownOpen, setIsProjectDropdownOpen] = useState(false);
  const [isReviewerDropdownOpen, setIsReviewerDropdownOpen] = useState(false);
  const [responsibleSearch, setResponsibleSearch] = useState('');
  const [reviewerSearch, setReviewerSearch] = useState('');
  const [teamSearch, setTeamSearch] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [localGoal, setLocalGoal] = useState(task.goal || '');
  const [localDescription, setLocalDescription] = useState(task.description || '');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setLocalGoal(task.goal || '');
  }, [task.goal]);

  useEffect(() => {
    setLocalDescription(task.description || '');
  }, [task.description]);

  useEffect(() => {
    if (isInitiallyExpanded) {
      setIsExpanded(true);
    }
    if (initialTab) {
      setActiveTab(initialTab);
    }
  }, [isInitiallyExpanded, initialTab]);

  useEffect(() => {
    if (autoEditTitle) {
      setIsEditingTitle(true);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [autoEditTitle]);

  const isCompleted = task.status === TaskStatus.COMPLETED;
  const isNew = task.id.startsWith('new-');

  const userView = task.lastViewedBy?.find(v => v.userName === currentUserName);
  const lastViewTime = userView ? new Date(userView.timestamp).getTime() : 0;

  const unreadProgress = task.progress?.filter(p => new Date(p.updatedAt).getTime() > lastViewTime && p.author !== currentUserName).length || 0;
  const unreadComments = task.comments?.filter(c => new Date(c.createdAt).getTime() > lastViewTime && c.author !== currentUserName).length || 0;
  const totalUnread = unreadProgress + unreadComments;

  useEffect(() => {
    if (isExpanded && totalUnread > 0) {
      onMarkAsViewed(task.id);
    }
  }, [isExpanded, totalUnread, task.id, onMarkAsViewed]);

  const handleUpdateEvaluation = (evalUpdate: Partial<TaskEvaluation>) => {
    if (!isAdmin) return;
    const currentEval = task.evaluation || { difficulty: 50, outcome: 3, memberEvaluations: [] };
    const updatedEval = { ...currentEval, ...evalUpdate };
    onUpdateTaskDetails?.(task.id, { evaluation: updatedEval });
  };

  const handleMemberRating = (memberName: string, rating: 1 | 2 | 3 | 4 | 5) => {
    if (!isAdmin) return;
    const currentEval = task.evaluation || { difficulty: 50, outcome: 3, memberEvaluations: [] };
    const existingIndex = currentEval.memberEvaluations.findIndex(m => m.memberId === memberName);

    let newMemberEvals = [...currentEval.memberEvaluations];
    if (existingIndex >= 0) {
      newMemberEvals[existingIndex] = { ...newMemberEvals[existingIndex], rating };
    } else {
      newMemberEvals.push({ memberId: memberName, rating });
    }

    handleUpdateEvaluation({ memberEvaluations: newMemberEvals });
  };

  const handleSave = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsSaving(true);
    try {
      // タイトル編集中に保存ボタンが押された場合、入力内容をReactのstateに反映させる。
      // ただし、直後にonManualSyncでサーバーへ送るため、onUpdateTaskDetailsでは通信フラグ(immediate)をfalseにする。
      let currentTaskToSave = task;
      if (isEditingTitle && editTitle !== task.title) {
        onUpdateTaskDetails?.(task.id, { title: editTitle }, false); // false = 通信しない
        setIsEditingTitle(false);
        currentTaskToSave = { ...task, title: editTitle };
      }
      // 最新のデータを手動保存
      await onManualSync(currentTaskToSave);
      setIsExpanded(false);
    } catch (e) {
      alert('保存に失敗しました');
    } finally {
      setIsSaving(false);
    }
  };

  const handlePostComment = () => {
    if (!newComment.trim()) return;
    onAddComment(task.id, newComment);
    setNewComment('');
  };

  const handleAddAttachment = () => {
    if (!newFileUrl || !newFileName) return;
    const att: Attachment = {
      id: Date.now().toString(),
      name: newFileName,
      url: newFileUrl,
      type: 'link',
      addedBy: currentUserName,
      addedAt: new Date().toISOString().split('T')[0]
    };
    const updatedAtts = [...(task.attachments || []), att];
    onUpdateTaskDetails?.(task.id, { attachments: updatedAtts });
    setNewFileName('');
    setNewFileUrl('');
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(false);
  };

  const handleDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(false);
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      await processFiles(files);
    }
  };

  const processFiles = async (files: FileList) => {
    const newAttachments: Attachment[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];

      // Limit file size to 2MB for Base64 storage in spreadsheet
      if (file.size > 2 * 1024 * 1024) {
        alert(`ファイル "${file.name}" は大きすぎます (最大2MB)。大きなファイルはGoogleドライブ等にアップロードしてリンクを貼ってください。`);
        continue;
      }

      try {
        const base64 = await fileToBase64(file);
        const newAttachment: Attachment = {
          id: `${Date.now()}-${i}`,
          name: file.name,
          url: base64,
          addedBy: currentUserName,
          addedAt: new Date().toISOString().split('T')[0],
          type: 'file',
        };
        newAttachments.push(newAttachment);
      } catch (err) {
        console.error("File conversion failed", err);
      }
    }

    if (newAttachments.length > 0) {
      onUpdateTaskDetails?.(task.id, {
        attachments: [...(task.attachments || []), ...newAttachments]
      });
    }
  };

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = error => reject(error);
    });
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      processFiles(e.target.files);
    }
  };

  const handleDeleteAttachment = (id: string) => {
    const updatedAtts = task.attachments?.filter(a => a.id !== id) || [];
    onUpdateTaskDetails?.(task.id, { attachments: updatedAtts });
  };

  const handleAddTeamMember = (memberName: string) => {
    if (task.team?.includes(memberName)) return;
    const newTeam = [...(task.team || []), memberName];
    onUpdateTaskDetails?.(task.id, { team: newTeam });
    setIsTeamDropdownOpen(false);
  };

  const handleRemoveTeamMember = (memberName: string) => {
    const newTeam = task.team?.filter(m => m !== memberName) || [];
    onUpdateTaskDetails?.(task.id, { team: newTeam });
  };

  const getEffectiveProject = (t: Task): string => {
    if (t.project && t.project !== '未分類') return t.project;
    if (t.parentId) {
      const parent = allTasks.find(p => p.id === t.parentId);
      if (parent) return getEffectiveProject(parent);
    }
    return t.project || '未分類';
  };

  const effectiveProject = getEffectiveProject(task);

  return (
    <div
      id={task.id}
      className={`rounded-[2rem] border transition-all ${isExpanded ? 'bg-white border-red-200 shadow-xl mb-6 scale-[1.01]' : 'bg-white border-slate-100 shadow-sm mb-3 hover:border-slate-300'} ${isNew ? 'new-task-highlight' : ''} ${task.parentId ? 'border-l-4 border-l-emerald-400' : ''}`}
      style={{
        marginLeft: depth > 0 ? `${depth * 2.5}rem` : undefined,
        position: 'relative'
      }}
    >
      {depth > 0 && (
        <div
          className="absolute top-0 bottom-0 w-px bg-slate-200"
          style={{ left: '-1.25rem' }}
        >
          <div className="absolute top-1/2 left-0 w-4 h-px bg-slate-200" />
        </div>
      )}
      <div className="p-5 md:p-6 cursor-pointer flex flex-col md:flex-row items-start md:items-center justify-between gap-4" onClick={() => setIsExpanded(!isExpanded)}>
        <div className="flex items-center space-x-4 flex-1 min-w-0">
          <div className="flex flex-col items-center">
            {task.parentId && <div className="text-[8px] font-black text-emerald-500 uppercase mb-1">Sub</div>}
            <div className={`w-12 h-12 rounded-xl flex items-center justify-center border-2 ${isCompleted ? 'bg-emerald-500 border-emerald-400 text-white' : 'bg-slate-50 border-slate-100 text-slate-300'}`}>
              {isCompleted ? <CheckCircle2 className="w-6 h-6" /> : <Clock className="w-6 h-6" />}
            </div>
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[9px] font-black uppercase px-2 py-0.5 rounded-full bg-slate-100 text-slate-500">{task.date}</span>
              <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-full ${task.priority === '高' ? 'bg-rose-100 text-rose-600' : 'bg-blue-100 text-blue-600'}`}>{task.priority}</span>
              <span className="text-[9px] font-black uppercase px-2 py-0.5 rounded-full bg-red-50 text-red-600">{effectiveProject}</span>
              {totalUnread > 0 && (
                <span className="text-[9px] font-black bg-red-600 text-white px-2 py-0.5 rounded-full flex items-center gap-1 animate-pulse">
                  <Bell className="w-2 h-2 fill-white" /> {totalUnread} NEW
                </span>
              )}
            </div>
            {isEditingTitle ? (
              <div className="flex gap-2 w-full" onClick={e => e.stopPropagation()}>
                <input
                  ref={inputRef}
                  className="flex-1 font-bold text-lg border-red-500 outline-none bg-red-50/20"
                  value={editTitle}
                  onChange={e => setEditTitle(e.target.value)}
                  placeholder="タスクタイトルを入力..."
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      onUpdateTaskDetails?.(task.id, { title: editTitle }, true);
                      setIsEditingTitle(false);
                    }
                  }}
                />
                <button onClick={() => { onUpdateTaskDetails?.(task.id, { title: editTitle }, true); setIsEditingTitle(false); }} className="p-2 bg-red-600 text-white rounded-lg"><Check className="w-4 h-4" /></button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <h3 className={`font-bold text-lg truncate ${isCompleted ? 'text-slate-400 line-through' : 'text-slate-800'}`}>{task.title}</h3>
                {isExpanded && <button onClick={e => { e.stopPropagation(); setIsEditingTitle(true); setTimeout(() => inputRef.current?.focus(), 100); }} className="p-1 text-slate-300 hover:text-red-600"><Edit2 className="w-3 h-3" /></button>}
              </div>
            )}
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="relative">
            <button
              onClick={(e) => { e.stopPropagation(); setIsMemberDropdownOpen(!isMemberDropdownOpen); }}
              className="flex items-center text-xs font-bold text-slate-500 bg-slate-50 px-3 py-1.5 rounded-full border border-slate-100 hover:bg-white hover:border-red-300 hover:text-red-600 hover:shadow-sm transition-all group"
            >
              <UserPlus className="w-3 h-3 mr-2 text-red-400 group-hover:text-red-600" />
              {task.responsiblePerson || "担当者未設定"}
            </button>

            {isMemberDropdownOpen && (
              <>
                <div className="fixed inset-0 z-[40]" onClick={(e) => { e.stopPropagation(); setIsMemberDropdownOpen(false); setResponsibleSearch(''); }} />
                <div className="absolute top-full right-0 mt-2 w-64 bg-white rounded-2xl shadow-xl border border-slate-100 z-[50] overflow-hidden animate-in fade-in zoom-in duration-200">
                  <div className="p-3 bg-slate-50 border-b border-slate-100 space-y-2">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">担当者を変更</p>
                    <input
                      autoFocus
                      type="text"
                      placeholder="名前・部門で絞り込み..."
                      value={responsibleSearch}
                      onChange={e => setResponsibleSearch(e.target.value)}
                      onClick={e => e.stopPropagation()}
                      className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-bold outline-none focus:border-red-400"
                    />
                  </div>
                  <div className="max-h-[260px] overflow-y-auto custom-scrollbar p-2">
                    {sortedMembers.filter(m =>
                      !responsibleSearch ||
                      m.name.toLowerCase().includes(responsibleSearch.toLowerCase()) ||
                      (m.department || '').toLowerCase().includes(responsibleSearch.toLowerCase())
                    ).length > 0 ? sortedMembers.filter(m =>
                      !responsibleSearch ||
                      m.name.toLowerCase().includes(responsibleSearch.toLowerCase()) ||
                      (m.department || '').toLowerCase().includes(responsibleSearch.toLowerCase())
                    ).map((m, i) => (
                      <button
                        key={i}
                        onClick={(e) => {
                          e.stopPropagation();
                          onUpdateTaskDetails?.(task.id, { responsiblePerson: m.name });
                          setIsMemberDropdownOpen(false);
                          setResponsibleSearch('');
                        }}
                        className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-bold transition-all ${task.responsiblePerson === m.name ? 'bg-red-50 text-red-600' : 'text-slate-600 hover:bg-slate-50'}`}
                      >
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-black flex-shrink-0 ${task.responsiblePerson === m.name ? 'bg-red-200 text-red-700' : 'bg-slate-200 text-slate-500'}`}>
                          {m.name.slice(0, 1)}
                        </div>
                        <div className="flex-1 min-w-0 text-left">
                          <p className="truncate">{m.name}</p>
                          {m.department && <p className="text-[9px] text-slate-400 font-bold">{m.department}</p>}
                        </div>
                        {task.responsiblePerson === m.name && <Check className="w-3 h-3 flex-shrink-0 text-red-500" />}
                      </button>
                    )) : (
                      <div className="p-4 text-center text-xs font-bold text-slate-400">
                        {responsibleSearch ? '一致するメンバーがいません' : 'メンバーが見つかりません'}
                      </div>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>
          <ChevronDown className={`w-5 h-5 text-slate-300 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
        </div>
      </div>

      {isExpanded && (
        <div className="px-6 pb-8 animate-in slide-in-from-top-2 duration-200">
          <div className="flex justify-between items-center border-b border-slate-50 mb-6 relative">
            <div className="flex space-x-1">
              <button onClick={() => setActiveTab('basic')} className={`px-6 py-3 text-xs font-black rounded-t-xl transition-all ${activeTab === 'basic' ? 'bg-slate-50 text-red-600 border-t border-x border-slate-100' : 'text-slate-400 hover:text-slate-600'}`}>
                基本情報
              </button>
              <button onClick={() => setActiveTab('chat')} className={`px-6 py-3 text-xs font-black rounded-t-xl transition-all flex items-center gap-2 ${activeTab === 'chat' ? 'bg-slate-50 text-red-600 border-t border-x border-slate-100' : 'text-slate-400 hover:text-slate-600'}`}>
                <MessageSquare className="w-3 h-3" /> チャット
                {task.comments?.length > 0 && <span className="bg-red-100 text-red-600 px-1.5 rounded-full text-[9px]">{task.comments.length}</span>}
              </button>
              <button onClick={() => setActiveTab('files')} className={`px-6 py-3 text-xs font-black rounded-t-xl transition-all flex items-center gap-2 ${activeTab === 'files' ? 'bg-slate-50 text-red-600 border-t border-x border-slate-100' : 'text-slate-400 hover:text-slate-600'}`}>
                <Paperclip className="w-3 h-3" /> ファイル
                {task.attachments?.length > 0 && <span className="bg-red-100 text-red-600 px-1.5 rounded-full text-[9px]">{task.attachments.length}</span>}
              </button>
              <button onClick={() => setActiveTab('hierarchy')} className={`px-6 py-3 text-xs font-black rounded-t-xl transition-all flex items-center gap-2 ${activeTab === 'hierarchy' ? 'bg-slate-50 text-red-600 border-t border-x border-slate-100' : 'text-slate-400 hover:text-slate-600'}`}>
                <Activity className="w-3 h-3" /> 構造 (WBS)
              </button>
            </div>
            {/* Upper Save Button */}
            <button
              onClick={handleSave}
              disabled={isSaving}
              className="bg-red-600 text-white px-4 py-2 rounded-lg font-black text-xs flex items-center gap-1.5 shadow-md hover:bg-red-700 active:scale-95 transition-all"
            >
              {isSaving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
              <span>保存</span>
            </button>
          </div>

          {/* === BASIC INFO TAB === */}
          {activeTab === 'basic' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4">
              <div className="space-y-6">
                {/* Status & Dates Block (Reorganized to match user screenshot style) */}
                <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-5">
                  <div>
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2">ステータス変更</label>
                    <div className="grid grid-cols-4 gap-2">
                      {[TaskStatus.TODO, TaskStatus.IN_PROGRESS, TaskStatus.OVERDUE, TaskStatus.COMPLETED].map(s => (
                        <button
                          key={s}
                          onClick={() => onUpdateStatus(task.id, s)}
                          className={`py-3 rounded-xl flex flex-col items-center justify-center gap-1 transition-all border-2 ${task.status === s
                            ? (s === TaskStatus.COMPLETED ? 'bg-slate-800 border-slate-800 text-white' : s === TaskStatus.IN_PROGRESS ? 'bg-emerald-50 border-emerald-500 text-emerald-600' : s === TaskStatus.OVERDUE ? 'bg-rose-50 border-rose-500 text-rose-600' : 'bg-blue-50 border-blue-500 text-blue-600')
                            : 'bg-white border-slate-100 text-slate-400 hover:bg-slate-50'
                            }`}
                        >
                          {s === TaskStatus.COMPLETED && <CheckCircle2 className="w-4 h-4" />}
                          {s === TaskStatus.IN_PROGRESS && <Loader2 className="w-4 h-4" />}
                          {s === TaskStatus.OVERDUE && <AlertTriangle className="w-4 h-4" />}
                          {s === TaskStatus.TODO && <Clock className="w-4 h-4" />}
                          <span className="text-[9px] font-black">{s === TaskStatus.COMPLETED ? '完了' : s === TaskStatus.IN_PROGRESS ? '進行中' : s === TaskStatus.OVERDUE ? '遅延' : '未着手'}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2">優先度変更</label>
                    <div className="grid grid-cols-3 gap-2">
                      {[TaskPriority.HIGH, TaskPriority.MEDIUM, TaskPriority.LOW].map(p => (
                        <button
                          key={p}
                          onClick={() => onUpdatePriority(task.id, p)}
                          className={`py-3 rounded-xl flex flex-col items-center justify-center gap-1 transition-all border-2 ${task.priority === p
                            ? (p === TaskPriority.HIGH ? 'bg-red-50 border-red-500 text-red-600' : p === TaskPriority.MEDIUM ? 'bg-amber-50 border-amber-500 text-amber-600' : 'bg-slate-50 border-slate-500 text-slate-600')
                            : 'bg-white border-slate-100 text-slate-400 hover:bg-slate-50'
                            }`}
                        >
                          <span className="text-[9px] font-black">{p}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1.5">開始日</label>
                      <input type="date" className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 outline-none focus:border-red-500" value={task.startDate || ''} onChange={e => onUpdateTaskDetails?.(task.id, { startDate: e.target.value })} />
                    </div>
                    <div>
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1.5">完了予定</label>
                      <input type="date" className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 outline-none focus:border-red-500" value={task.dueDate || ''} onChange={e => onUpdateTaskDetails?.(task.id, { dueDate: e.target.value })} />
                    </div>
                  </div>
                </div>

                {/* Member Management Block */}
                <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
                  <div className="flex justify-between items-center">
                    <h4 className="font-bold text-slate-700 text-sm flex items-center gap-2">
                      <Users className="w-4 h-4 text-red-600" /> チーム・関係者
                    </h4>
                    <div className="relative">
                      <button
                        onClick={(e) => { e.stopPropagation(); setIsProjectDropdownOpen(!isProjectDropdownOpen); }}
                        className="text-[10px] font-black bg-slate-100 text-slate-500 px-3 py-1.5 rounded-lg hover:bg-red-50 hover:text-red-600 transition-all"
                      >
                        エピック: {task.project || '未分類'}
                      </button>
                      {isProjectDropdownOpen && (
                        <>
                          <div className="fixed inset-0 z-10" onClick={() => setIsProjectDropdownOpen(false)} />
                          <div className="absolute top-full right-0 mt-2 w-48 bg-white border border-slate-100 rounded-xl shadow-xl z-20 max-h-48 overflow-y-auto custom-scrollbar">
                            {epics.map((p, i) => (
                              <button key={i} onClick={() => { onUpdateTaskDetails?.(task.id, { project: p }); setIsProjectDropdownOpen(false); }} className="w-full text-left px-4 py-2 text-xs font-bold text-slate-700 hover:bg-red-50">
                                {p}
                              </button>
                            ))}
                            <div className="p-2 border-t border-slate-50">
                              <input
                                type="text"
                                placeholder="新しいエピック名..."
                                className="w-full p-2 text-[10px] border border-slate-200 rounded outline-none focus:border-red-500"
                                onKeyDown={e => {
                                  if (e.key === 'Enter') {
                                    const val = (e.target as HTMLInputElement).value;
                                    if (val) {
                                      onUpdateTaskDetails?.(task.id, { project: val });
                                      setIsProjectDropdownOpen(false);
                                    }
                                  }
                                }}
                              />
                            </div>
                          </div>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Reviewer */}
                  <div>
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2">確認者 (Reporter)</label>
                    <div className="relative">
                      <button
                        onClick={(e) => { e.stopPropagation(); setIsReviewerDropdownOpen(!isReviewerDropdownOpen); }}
                        className="w-full flex items-center justify-between p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 hover:bg-slate-100 transition-colors"
                      >
                        <div className="flex items-center gap-2">
                          <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-black ${task.reviewer ? 'bg-amber-100 text-amber-600' : 'bg-slate-200 text-slate-400'}`}>
                            {task.reviewer ? task.reviewer.slice(0, 1) : <UserPlus className="w-3 h-3" />}
                          </div>
                          <span>{task.reviewer || "未設定"}</span>
                        </div>
                        <ChevronDown className="w-4 h-4 text-slate-400" />
                      </button>
                      {isReviewerDropdownOpen && (
                        <>
                          <div className="fixed inset-0 z-10" onClick={() => { setIsReviewerDropdownOpen(false); setReviewerSearch(''); }} />
                          <div className="absolute top-full left-0 right-0 mt-2 bg-white border border-slate-100 rounded-xl shadow-xl z-20 overflow-hidden">
                            <div className="p-2 border-b border-slate-100">
                              <input
                                autoFocus
                                type="text"
                                placeholder="名前・部門で絞り込み..."
                                value={reviewerSearch}
                                onChange={e => setReviewerSearch(e.target.value)}
                                onClick={e => e.stopPropagation()}
                                className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold outline-none focus:border-red-400"
                              />
                            </div>
                            <div className="max-h-48 overflow-y-auto custom-scrollbar">
                              <button onClick={() => { onUpdateTaskDetails?.(task.id, { reviewer: '' }); setIsReviewerDropdownOpen(false); setReviewerSearch(''); }} className="w-full text-left px-4 py-2 text-xs font-bold text-slate-400 hover:bg-slate-50">未設定</button>
                              {sortedMembers.filter(m =>
                                !reviewerSearch ||
                                m.name.toLowerCase().includes(reviewerSearch.toLowerCase()) ||
                                (m.department || '').toLowerCase().includes(reviewerSearch.toLowerCase())
                              ).map((m, i) => (
                                <button key={i} onClick={() => { onUpdateTaskDetails?.(task.id, { reviewer: m.name }); setIsReviewerDropdownOpen(false); setReviewerSearch(''); }} className="w-full text-left px-4 py-2 text-xs font-bold text-slate-700 hover:bg-red-50 flex items-center gap-2">
                                  <div className="w-5 h-5 rounded-full bg-slate-100 flex items-center justify-center text-[9px] flex-shrink-0">{m.name.slice(0, 1)}</div>
                                  <div>
                                    <p>{m.name}</p>
                                    {m.department && <p className="text-[9px] text-slate-400">{m.department}</p>}
                                  </div>
                                </button>
                              ))}
                              {sortedMembers.filter(m => !reviewerSearch || m.name.toLowerCase().includes(reviewerSearch.toLowerCase()) || (m.department || '').toLowerCase().includes(reviewerSearch.toLowerCase())).length === 0 && (
                                <p className="px-4 py-2 text-xs text-slate-400 font-bold text-center">一致するメンバーがいません</p>
                              )}
                            </div>
                          </div>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Team */}
                  <div>
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2">チームメンバー</label>
                    <div className="flex flex-wrap gap-2">
                      {task.team && task.team.length > 0 && task.team.map(member => (
                        <div key={member} className="flex items-center gap-1 pl-2 pr-1 py-1 bg-red-50 border border-red-100 rounded-full text-xs font-bold text-red-700">
                          <span>{member}</span>
                          <button onClick={() => handleRemoveTeamMember(member)} className="p-0.5 hover:bg-red-200 rounded-full text-red-400 hover:text-red-800 transition-colors"><X className="w-3 h-3" /></button>
                        </div>
                      ))}
                      <div className="relative">
                        <button onClick={(e) => { e.stopPropagation(); setIsTeamDropdownOpen(!isTeamDropdownOpen); }} className="flex items-center gap-1 px-3 py-1 bg-slate-100 border border-slate-200 rounded-full text-xs font-bold text-slate-500 hover:bg-slate-200 transition-colors">
                          <Plus className="w-3 h-3" /> 追加
                        </button>
                        {isTeamDropdownOpen && (
                          <>
                            <div className="fixed inset-0 z-10" onClick={() => { setIsTeamDropdownOpen(false); setTeamSearch(''); }} />
                            <div className="absolute top-full left-0 mt-2 w-64 bg-white border border-slate-100 rounded-xl shadow-xl z-20 overflow-hidden">
                              <div className="p-2 border-b border-slate-100">
                                <input
                                  autoFocus
                                  type="text"
                                  placeholder="名前・部門で絞り込み..."
                                  value={teamSearch}
                                  onChange={e => setTeamSearch(e.target.value)}
                                  onClick={e => e.stopPropagation()}
                                  className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold outline-none focus:border-red-400"
                                />
                              </div>
                              <div className="max-h-56 overflow-y-auto custom-scrollbar">
                                {sortedMembers.filter(m =>
                                  !task.team?.includes(m.name) && (
                                    !teamSearch ||
                                    m.name.toLowerCase().includes(teamSearch.toLowerCase()) ||
                                    (m.department || '').toLowerCase().includes(teamSearch.toLowerCase())
                                  )
                                ).map((m, i) => (
                                  <button key={i} onClick={() => { handleAddTeamMember(m.name); setTeamSearch(''); }} className="w-full text-left px-4 py-2 text-xs font-bold text-slate-700 hover:bg-red-50 flex items-center gap-2">
                                    <div className="w-6 h-6 rounded-full bg-slate-100 flex items-center justify-center text-[9px] flex-shrink-0">{m.name.slice(0, 1)}</div>
                                    <div>
                                      <p>{m.name}</p>
                                      {m.department && <p className="text-[9px] text-slate-400">{m.department}</p>}
                                    </div>
                                  </button>
                                ))}
                                {sortedMembers.filter(m => !task.team?.includes(m.name) && (!teamSearch || m.name.toLowerCase().includes(teamSearch.toLowerCase()) || (m.department || '').toLowerCase().includes(teamSearch.toLowerCase()))).length === 0 && (
                                  <div className="px-4 py-3 text-[10px] text-slate-400 font-bold text-center">
                                    {teamSearch ? '一致するメンバーがいません' : '追加できるメンバーがいません'}
                                  </div>
                                )}
                              </div>
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="bg-slate-50 p-6 rounded-2xl space-y-3">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">内容・説明</label>
                  <textarea
                    className="w-full h-24 bg-white border border-slate-200 rounded-xl p-4 text-sm font-bold outline-none focus:border-red-500"
                    placeholder="タスクの詳細・背景・内容を入力..."
                    value={localDescription}
                    onChange={e => setLocalDescription(e.target.value)}
                    onBlur={() => onUpdateTaskDetails?.(task.id, { description: localDescription })}
                  />
                </div>

                <div className="bg-slate-50 p-6 rounded-2xl space-y-3">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">完了定義 (DoD)</label>
                  <textarea
                    className="w-full h-24 bg-white border border-slate-200 rounded-xl p-4 text-sm font-bold outline-none focus:border-red-500"
                    placeholder="ゴールの状態を入力..."
                    value={localGoal}
                    onChange={e => setLocalGoal(e.target.value)}
                    onBlur={() => onUpdateTaskDetails?.(task.id, { goal: localGoal })}
                  />
                </div>
              </div>

              <div className="space-y-4">
                <div className="bg-red-50/50 p-6 rounded-2xl border border-red-100 h-full flex flex-col">
                  <h4 className="font-bold text-red-900 text-sm mb-4 flex items-center gap-2"><History className="w-4 h-4" /> 履歴・最新進捗</h4>

                  <div className="flex gap-2 mb-4">
                    <input className="flex-1 p-3 bg-white border border-red-100 rounded-xl text-xs font-bold outline-none focus:border-red-500" placeholder="現在の状況を報告..." value={newProgress} onChange={e => setNewProgress(e.target.value)} />
                    <button onClick={() => { if (newProgress) { onAddProgress(task.id, newProgress); setNewProgress(''); } }} className="p-3 bg-red-600 text-white rounded-xl hover:bg-red-700 transition-all"><Plus className="w-4 h-4" /></button>
                  </div>

                  <div className="space-y-4 flex-1 overflow-y-auto pr-2 custom-scrollbar max-h-[300px]">
                    {task.progress && task.progress.length > 0 ? task.progress.map((p, i) => (
                      <div key={i} className="bg-white p-4 rounded-xl border border-red-50 shadow-sm">
                        <p className="text-xs font-bold text-slate-700 leading-relaxed">{p.content}</p>
                        <p className="text-[9px] text-slate-400 mt-2 flex justify-between"><span>{p.author}</span><span>{p.updatedAt}</span></p>
                      </div>
                    )) : <p className="text-xs italic text-red-300 font-bold">報告なし</p>}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* === CHAT TAB === */}
          {activeTab === 'chat' && (
            <div className="space-y-6 pt-4 animate-in fade-in duration-200">
              <div className="bg-slate-50 rounded-2xl p-4 border border-slate-100 min-h-[300px] max-h-[400px] overflow-y-auto custom-scrollbar space-y-4">
                {task.comments && task.comments.length > 0 ? task.comments.map((comment) => (
                  <div key={comment.id} className={`flex flex-col ${comment.author === currentUserName ? 'items-end' : 'items-start'}`}>
                    <div className={`flex items-end gap-2 max-w-[80%] ${comment.author === currentUserName ? 'flex-row-reverse' : 'flex-row'}`}>
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-black flex-shrink-0 ${comment.author === currentUserName ? 'bg-slate-900 text-white' : 'bg-slate-200 text-slate-500'}`}>
                        {comment.author.slice(0, 1)}
                      </div>
                      <div className={`p-3 rounded-2xl text-xs font-bold ${comment.author === currentUserName ? 'bg-white border-2 border-slate-900 text-slate-900 rounded-tr-none' : 'bg-white border border-slate-200 text-slate-700 rounded-tl-none'}`}>
                        {comment.content}
                      </div>
                    </div>
                    <span className="text-[9px] text-slate-400 mt-1 px-11">{comment.author} • {comment.createdAt}</span>
                  </div>
                )) : (
                  <div className="h-full flex flex-col items-center justify-center text-slate-300 gap-2">
                    <MessageSquare className="w-12 h-12 opacity-20" />
                    <p className="text-xs font-bold">まだコメントはありません</p>
                  </div>
                )}
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="コメントを入力..."
                  className="flex-1 bg-white border-2 border-slate-100 focus:border-red-500 rounded-xl px-4 py-3 text-sm font-bold outline-none transition-colors"
                  value={newComment}
                  onChange={e => setNewComment(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handlePostComment()}
                />
                <button onClick={handlePostComment} className="bg-red-600 text-white px-6 rounded-xl hover:bg-red-700 active:scale-95 transition-all">
                  <Send className="w-5 h-5" />
                </button>
              </div>
            </div>
          )}

          {/* === FILES TAB === */}
          {activeTab === 'files' && (
            <div className="space-y-6 pt-4 animate-in fade-in duration-200">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {task.attachments && task.attachments.length > 0 ? task.attachments.map((att) => (
                  <div key={att.id} className="group relative bg-white p-4 rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition-all flex items-center justify-between">
                    <a href={att.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 flex-1 min-w-0">
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${att.type === 'file' ? 'bg-amber-50 text-amber-600' : 'bg-red-50 text-red-600'}`}>
                        {att.type === 'file' ? <FileText className="w-5 h-5" /> : <LinkIcon className="w-5 h-5" />}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-slate-700 truncate">{att.name}</p>
                        <p className="text-[10px] text-slate-400">{att.addedBy} • {att.addedAt}</p>
                      </div>
                    </a>
                    <div className="flex items-center gap-2">
                      <a href={att.url} target="_blank" rel="noopener noreferrer" className="p-2 text-slate-400 hover:text-red-600 transition-colors"><ExternalLink className="w-4 h-4" /></a>
                      <button onClick={() => handleDeleteAttachment(att.id)} className="p-2 text-slate-300 hover:text-rose-500 transition-colors"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  </div>
                )) : (
                  <div className="col-span-full py-12 flex flex-col items-center justify-center text-slate-300 border-2 border-dashed border-slate-200 rounded-2xl">
                    <Paperclip className="w-12 h-12 opacity-20 mb-2" />
                    <p className="text-xs font-bold">添付ファイルはありません</p>
                  </div>
                )}
              </div>

              <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                className={`bg-slate-50 p-6 rounded-2xl border-2 ${isDragOver ? 'border-red-500 border-dashed' : 'border-slate-200 border-dashed'} space-y-4 transition-all`}
              >
                <h4 className="text-xs font-black text-slate-500 uppercase tracking-widest flex items-center gap-2"><UploadCloud className="w-4 h-4" /> 新しいファイルをドラッグ＆ドロップ</h4>
                <div className="text-center text-slate-400 text-xs font-bold">
                  <p>または、以下のボタンからファイルを選択</p>
                  <input
                    type="file"
                    id={`file-upload-${task.id}`}
                    className="hidden"
                    multiple
                    onChange={handleFileSelect}
                  />
                  <button
                    onClick={() => document.getElementById(`file-upload-${task.id}`)?.click()}
                    className="mt-2 px-4 py-2 bg-white border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 transition-all"
                  >
                    ファイルを選択
                  </button>
                  <p className="mt-2 opacity-60">※ 最大2MBまで。それ以上はリンク登録を推奨</p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <input
                    type="text"
                    placeholder="表示名 (例: デザイン案V1)"
                    className="bg-white border border-slate-200 rounded-xl px-4 py-3 text-xs font-bold outline-none focus:border-red-500"
                    value={newFileName}
                    onChange={e => setNewFileName(e.target.value)}
                  />
                  <input
                    type="text"
                    placeholder="URL (https://...)"
                    className="md:col-span-2 bg-white border border-slate-200 rounded-xl px-4 py-3 text-xs font-bold outline-none focus:border-red-500"
                    value={newFileUrl}
                    onChange={e => setNewFileUrl(e.target.value)}
                  />
                </div>
                <div className="flex justify-end">
                  <button onClick={handleAddAttachment} className="bg-slate-900 text-white px-6 py-3 rounded-xl text-xs font-black hover:bg-slate-800 transition-all flex items-center gap-2">
                    <Paperclip className="w-4 h-4" /> リンクを追加
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* === HIERARCHY TAB === */}
          {activeTab === 'hierarchy' && (
            <div className="pt-4 space-y-8 animate-in fade-in duration-300">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-slate-50 p-6 rounded-3xl border border-slate-100 space-y-4">
                  <h4 className="font-black text-xs text-slate-400 uppercase tracking-widest flex items-center gap-2">
                    <TrendingUp className="w-4 h-4 text-red-600" /> 構造アクション
                  </h4>
                  <div className="grid grid-cols-1 gap-3">
                    <button
                      onClick={() => onAddSiblingTask?.(task.id)}
                      className="flex items-center justify-between p-4 bg-white border border-slate-200 rounded-2xl hover:border-red-300 hover:bg-red-50 transition-all group"
                    >
                      <div className="text-left">
                        <p className="text-sm font-black text-slate-700">兄弟タスクを追加</p>
                        <p className="text-[10px] text-slate-400 font-bold">同じライン上で続く次工程を作成します</p>
                      </div>
                      <ChevronRight className="w-5 h-5 text-slate-300 group-hover:text-red-500 transition-all" />
                    </button>

                    <button
                      onClick={() => onAddSubTask?.(task.id)}
                      className="flex items-center justify-between p-4 bg-white border border-slate-200 rounded-2xl hover:border-red-300 hover:bg-red-50 transition-all group"
                    >
                      <div className="text-left">
                        <p className="text-sm font-black text-slate-700">枝タスク (子) を追加</p>
                        <p className="text-[10px] text-slate-400 font-bold">このタスクを支える詳細な作業を作成します</p>
                      </div>
                      <Plus className="w-5 h-5 text-slate-300 group-hover:text-red-500 transition-all" />
                    </button>
                  </div>
                </div>

                <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm space-y-4">
                  <h4 className="font-black text-xs text-slate-400 uppercase tracking-widest flex items-center gap-2">
                    <List className="w-4 h-4 text-red-600" /> 関連タスク一覧
                  </h4>
                  <div className="space-y-2 max-h-[300px] overflow-y-auto custom-scrollbar pr-2">
                    {allTasks.filter(t => t.parentId === task.id).length > 0 ? (
                      allTasks.filter(t => t.parentId === task.id).map(sub => (
                        <div key={sub.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-100">
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="w-2 h-2 rounded-full bg-red-400" />
                            <span className="text-xs font-bold text-slate-700 truncate">{sub.title}</span>
                          </div>
                          <span className={`text-[8px] font-black px-2 py-0.5 rounded-full ${sub.status === TaskStatus.COMPLETED ? 'bg-emerald-100 text-emerald-600' : 'bg-amber-100 text-amber-600'}`}>
                            {sub.status === TaskStatus.COMPLETED ? '完了' : '進行中'}
                          </span>
                        </div>
                      ))
                    ) : (
                      <p className="text-[10px] font-bold text-slate-300 italic text-center py-8">関連タスクはありません</p>
                    )}
                  </div>
                </div>
              </div>

              <div className="bg-red-50/30 p-6 rounded-3xl border border-red-100">
                <h5 className="text-[10px] font-black text-red-400 uppercase tracking-widest mb-2 flex items-center gap-2">
                  <BrainCircuit className="w-4 h-4" /> WBS (Work Breakdown Structure) の概念
                </h5>
                <p className="text-[11px] font-bold text-red-700 leading-relaxed">
                  現代のプロジェクト管理では、大きな目標（エピック）を具体的な成果物（親タスク）に分解し、それをさらに実行可能な最小単位（枝タスク）に落とし込みます。
                  同じライン上の「兄弟タスク」は、一つの成果物を完成させるための連続したフローを表します。
                </p>
              </div>
            </div>
          )}

          {/* New Save & Delete Buttons in Task Item - Bottom */}
          <div className="mt-8 flex justify-between items-center pt-6 border-t border-slate-50">
            <button
              onClick={() => {
                console.log("Delete button clicked for task:", task.id);
                if (window.confirm('このタスクを削除してもよろしいですか？')) {
                  console.log("Confirmed deletion for task:", task.id);
                  onDeleteTask?.(task.id);
                }
              }}
              className="flex items-center gap-2 px-6 py-4 text-rose-500 font-black text-xs hover:bg-rose-50 rounded-xl transition-all"
            >
              <Trash2 className="w-4 h-4" />
              <span>タスクを削除</span>
            </button>

            <button
              onClick={handleSave}
              className="bg-slate-900 text-white px-8 py-4 rounded-xl font-black text-sm flex items-center gap-2 shadow-xl hover:bg-slate-800 active:scale-95 transition-all"
              disabled={isSaving}
            >
              {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              <span>変更を保存して閉じる</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
