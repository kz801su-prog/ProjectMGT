
import React, { useMemo, useState, useEffect, useRef, useLayoutEffect } from 'react';
import { Task, TaskStatus, TaskPriority, Milestone, TaskComment, Attachment, MemberInfo } from '../types';
import { PROJECT_MEMBERS } from '../constants';
import { X, Calendar, Save, AlertTriangle, User, Diamond, Briefcase, Trash2, RotateCcw, CheckCircle2, Clock, PlayCircle, AlertCircle, MessageSquare, Paperclip, ExternalLink, Plus, Link as LinkIcon, ChevronLeft, ChevronRight } from 'lucide-react';

interface Props {
  tasks: Task[];
  members: MemberInfo[];
  onUpdateTask: (task: Task) => void;
  onUpdateTasks?: (tasks: Task[]) => void;
  onAddTask: (date: string) => void;
  onSoftDeleteTask?: (taskId: string) => void;
  currentUserName: string;
  isAdmin?: boolean;
  onEditTaskFromTimeline?: (taskId: string) => void;
}

type ViewMode = '1month' | '3months';
type GroupMode = 'person' | 'project';

interface EditModalProps {
  selectedTask: Task;
  setSelectedTask: (task: Task | null) => void;
  tasks: Task[];
  onUpdateTask: (task: Task) => void;
  handleTaskUpdateWithDependencies: (task: Task) => void;
  onSoftDeleteTask?: (taskId: string) => void;
  currentUserName: string;
}

const QuickStatusButton = ({ status, icon: Icon, label, colorClass, editStatus, setEditStatus }: any) => (
  <button
    onClick={() => setEditStatus(status)}
    className={`flex flex-col items-center justify-center p-4 rounded-xl border-2 transition-all hover:scale-105 active:scale-95 ${editStatus === status ? colorClass : 'bg-white border-slate-100 text-slate-400 hover:bg-slate-50'}`}
  >
    <Icon className="w-5 h-5 mb-1" />
    <span className="text-[10px] font-black">{label}</span>
  </button>
);

const EditModal: React.FC<EditModalProps> = ({
  selectedTask,
  setSelectedTask,
  tasks,
  onUpdateTask,
  handleTaskUpdateWithDependencies,
  onSoftDeleteTask,
  currentUserName
}) => {
  const [activeTab, setActiveTab] = useState<'details' | 'chat' | 'files'>('details');
  const [editTitle, setEditTitle] = useState(selectedTask.title);
  const [editStart, setEditStart] = useState(selectedTask.startDate || selectedTask.date);
  const [editDue, setEditDue] = useState(selectedTask.dueDate);
  const [editStatus, setEditStatus] = useState(selectedTask.status);
  const [newComment, setNewComment] = useState('');
  const [newFileName, setNewFileName] = useState('');
  const [newFileUrl, setNewFileUrl] = useState('');

  const handleSave = () => {
    const updated = { ...selectedTask, title: editTitle, startDate: editStart, dueDate: editDue, status: editStatus };
    handleTaskUpdateWithDependencies(updated);
    setSelectedTask(null);
  };

  const handlePostComment = () => {
    if (!newComment.trim()) return;
    const comment: TaskComment = {
      id: Date.now().toString(),
      content: newComment,
      author: currentUserName,
      createdAt: new Date().toISOString().split('T')[0]
    };
    const updatedComments = [...(selectedTask.comments || []), comment];
    onUpdateTask({ ...selectedTask, comments: updatedComments });
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
    const updatedAtts = [...(selectedTask.attachments || []), att];
    onUpdateTask({ ...selectedTask, attachments: updatedAtts });
    setNewFileName('');
    setNewFileUrl('');
  };

  const handleDeleteAttachment = (id: string) => {
    const updated = selectedTask.attachments?.filter(a => a.id !== id) || [];
    onUpdateTask({ ...selectedTask, attachments: updated });
  };

  const handleRemoveDependency = (depId: string) => {
    const newDeps = selectedTask.dependencies?.filter(d => d !== depId) || [];
    onUpdateTask({ ...selectedTask, dependencies: newDeps });
  };

  return (
    <div className="fixed inset-0 z-[300] bg-slate-900/60 backdrop-blur-md flex items-center justify-center p-4">
      <div className="bg-white rounded-[2.5rem] p-8 md:p-10 w-full max-w-lg shadow-2xl animate-in zoom-in duration-200 flex flex-col max-h-[80vh] border border-white/20">
        <div className="flex justify-between items-start mb-6 flex-shrink-0">
          <div>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">{selectedTask.responsiblePerson}</p>
            <h3 className="text-xl font-black text-slate-800 line-clamp-2">{selectedTask.title}</h3>
          </div>
          <button onClick={() => setSelectedTask(null)} className="p-2 bg-slate-100 rounded-full hover:bg-slate-200"><X className="w-5 h-5 text-slate-500" /></button>
        </div>

        <div className="flex space-x-1 border-b border-slate-100 pb-1 mb-4 flex-shrink-0">
          <button onClick={() => setActiveTab('details')} className={`flex-1 py-3 text-xs font-black rounded-t-xl transition-all ${activeTab === 'details' ? 'bg-slate-50 text-slate-900 border-t border-x border-slate-100' : 'text-slate-400 hover:text-slate-600 hover:bg-slate-50'}`}>基本情報</button>
          <button onClick={() => setActiveTab('chat')} className={`flex-1 py-3 text-xs font-black rounded-t-xl transition-all flex justify-center items-center gap-1 ${activeTab === 'chat' ? 'bg-slate-50 text-slate-900 border-t border-x border-slate-100' : 'text-slate-400 hover:text-slate-600 hover:bg-slate-50'}`}>
            <MessageSquare className="w-3 h-3" /> チャット {selectedTask.comments && selectedTask.comments.length > 0 && <span className="bg-red-600 text-white text-[9px] px-1.5 rounded-full">{selectedTask.comments.length}</span>}
          </button>
          <button onClick={() => setActiveTab('files')} className={`flex-1 py-3 text-xs font-black rounded-t-xl transition-all flex justify-center items-center gap-1 ${activeTab === 'files' ? 'bg-slate-50 text-slate-900 border-t border-x border-slate-100' : 'text-slate-400 hover:text-slate-600 hover:bg-slate-50'}`}>
            <Paperclip className="w-3 h-3" /> ファイル {selectedTask.attachments && selectedTask.attachments.length > 0 && <span className="bg-red-600 text-white text-[9px] px-1.5 rounded-full">{selectedTask.attachments.length}</span>}
          </button>
        </div>

        <div className="space-y-6 overflow-y-auto custom-scrollbar flex-1 pr-2">
          {activeTab === 'details' && (
            <>
              <div className="space-y-2">
                <label className="text-xs font-black text-slate-400 uppercase tracking-widest block">タスク名</label>
                <input
                  type="text"
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl text-sm font-bold text-slate-700 focus:ring-2 focus:ring-red-500/20 focus:border-red-500 outline-none transition-all"
                  placeholder="タスク名を入力..."
                />
              </div>

              <div className="space-y-2">
                <label className="text-xs font-black text-slate-400 uppercase tracking-widest block">ステータス変更</label>
                <div className="grid grid-cols-4 gap-2">
                  <QuickStatusButton status={TaskStatus.TODO} icon={Clock} label="未着手" colorClass="bg-blue-50 border-blue-500 text-blue-600" editStatus={editStatus} setEditStatus={setEditStatus} />
                  <QuickStatusButton status={TaskStatus.IN_PROGRESS} icon={PlayCircle} label="進行中" colorClass="bg-emerald-50 border-emerald-500 text-emerald-600" editStatus={editStatus} setEditStatus={setEditStatus} />
                  <QuickStatusButton status={TaskStatus.OVERDUE} icon={AlertCircle} label="遅延" colorClass="bg-rose-50 border-rose-500 text-rose-600" editStatus={editStatus} setEditStatus={setEditStatus} />
                  <QuickStatusButton status={TaskStatus.COMPLETED} icon={CheckCircle2} label="完了" colorClass="bg-slate-900 border-slate-900 text-white" editStatus={editStatus} setEditStatus={setEditStatus} />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
                  <label className="text-xs font-black text-slate-400 uppercase tracking-widest block mb-2">開始日</label>
                  <input
                    type="date"
                    value={editStart}
                    onChange={(e) => setEditStart(e.target.value)}
                    className="w-full bg-white border-2 border-slate-200 rounded-xl px-4 py-3 font-bold text-slate-800 focus:border-red-500 outline-none text-xs"
                  />
                </div>
                <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
                  <label className="text-xs font-black text-slate-400 uppercase tracking-widest block mb-2">完了予定</label>
                  <input
                    type="date"
                    value={editDue}
                    onChange={(e) => setEditDue(e.target.value)}
                    className="w-full bg-white border-2 border-slate-200 rounded-xl px-4 py-3 font-bold text-slate-800 focus:border-red-500 outline-none text-xs"
                  />
                </div>
              </div>

              {/* Dependency Management in Modal */}
              <div className="space-y-2">
                <label className="text-xs font-black text-slate-400 uppercase tracking-widest block">先行タスク (依存関係)</label>
                {selectedTask.dependencies && selectedTask.dependencies.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {selectedTask.dependencies.map(depId => {
                      const depTask = tasks.find(t => t.id === depId);
                      return (
                        <div key={depId} className="flex items-center space-x-1 px-3 py-1 bg-red-50 border border-red-100 rounded-full text-xs font-bold text-red-700">
                          <LinkIcon className="w-3 h-3" />
                          <span className="truncate max-w-[150px]">{depTask?.title || 'Unknown'}</span>
                          <button onClick={() => handleRemoveDependency(depId)} className="p-1 hover:text-rose-500"><X className="w-3 h-3" /></button>
                        </div>
                      );
                    })}
                  </div>
                ) : <p className="text-xs text-slate-300 font-bold italic">設定なし (タイムラインでリンク可能)</p>}
              </div>
            </>
          )}

          {activeTab === 'chat' && (
            <div className="space-y-4">
              <div className="space-y-2 max-h-[250px] overflow-y-auto">
                {selectedTask.comments?.map(c => (
                  <div key={c.id} className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
                    <div className="flex justify-between mb-1">
                      <span className="text-[10px] font-black text-red-600">{c.author}</span>
                      <span className="text-[9px] text-slate-400">{c.createdAt}</span>
                    </div>
                    <p className="text-xs text-slate-700 font-bold">{c.content}</p>
                  </div>
                ))}
              </div>
              <div className="flex gap-2">
                <input type="text" placeholder="コメント" className="flex-1 bg-white border-2 border-slate-200 rounded-xl px-4 py-2 text-xs font-bold" value={newComment} onChange={e => setNewComment(e.target.value)} />
                <button onClick={handlePostComment} className="bg-red-600 text-white p-3 rounded-xl hover:scale-105 active:scale-95 transition-all"><Plus className="w-4 h-4" /></button>
              </div>
            </div>
          )}

          {activeTab === 'files' && (
            <div className="space-y-4">
              <div className="space-y-2">
                {selectedTask.attachments?.map(att => (
                  <div key={att.id} className="flex justify-between items-center bg-slate-50 p-3 rounded-2xl border border-slate-100">
                    <a href={att.url} target="_blank" rel="noopener noreferrer" className="flex items-center text-xs font-bold text-slate-700 hover:text-red-600 underline">
                      <ExternalLink className="w-3 h-3 mr-2" /> {att.name}
                    </a>
                    <button onClick={() => handleDeleteAttachment(att.id)} className="text-slate-300 hover:text-rose-500"><Trash2 className="w-3 h-3" /></button>
                  </div>
                ))}
              </div>
              <div className="space-y-2 bg-slate-50 p-4 rounded-2xl">
                <input type="text" placeholder="ファイル名" className="w-full bg-white border border-slate-200 rounded-lg px-2 py-2 text-xs font-bold mb-2" value={newFileName} onChange={e => setNewFileName(e.target.value)} />
                <div className="flex gap-2">
                  <input type="text" placeholder="URL" className="flex-1 bg-white border border-slate-200 rounded-lg px-2 py-2 text-xs font-bold" value={newFileUrl} onChange={e => setNewFileUrl(e.target.value)} />
                  <button onClick={handleAddAttachment} className="bg-slate-900 text-white px-4 py-2 rounded-lg text-xs font-black hover:bg-slate-800">追加</button>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="mt-6 flex-shrink-0 flex gap-3">
          <button
            onClick={() => {
              if (window.confirm('このタスクを削除してもよろしいですか？')) {
                onSoftDeleteTask?.(selectedTask.id);
                setSelectedTask(null);
              }
            }}
            className="p-4 text-rose-500 hover:bg-rose-50 rounded-2xl transition-all flex items-center justify-center"
            title="タスクを削除"
          >
            <Trash2 className="w-5 h-5" />
          </button>
          <button onClick={handleSave} className="flex-1 py-4 bg-slate-900 text-white rounded-2xl font-black shadow-xl hover:bg-slate-800 flex items-center justify-center gap-2 hover:scale-[1.02] active:scale-95 transition-all">
            <Save className="w-4 h-4" />
            <span>変更を保存</span>
          </button>
        </div>
      </div>
    </div>
  );
};

export const TimelineView: React.FC<Props> = ({ tasks, members, onUpdateTask, onUpdateTasks, onAddTask, onSoftDeleteTask, currentUserName, isAdmin, onEditTaskFromTimeline }) => {
  const [viewMode, setViewMode] = useState<ViewMode>('1month');
  const [groupMode, setGroupMode] = useState<GroupMode>('project');
  const [baseDate, setBaseDate] = useState(new Date());

  // Force re-render for SVG lines after DOM update
  const [, forceUpdate] = useState({});

  // Dragging state to handle drop target visibility
  const [isDragging, setIsDragging] = useState(false);

  // Dependency Linking State
  const [isLinking, setIsLinking] = useState(false);
  const [linkStartTask, setLinkStartTask] = useState<string | null>(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement>(null);

  // Context Menu State
  const [contextMenu, setContextMenu] = useState<{ x: number, y: number, taskId: string, isDeleted: boolean } | null>(null);

  const [deadlineDates, setDeadlineDates] = useState<{ date: string, label: string }[]>(() => {
    try {
      return JSON.parse(localStorage.getItem('board_deadline_dates_v2') || '[]');
    } catch {
      return [];
    }
  });

  const toggleDeadline = (dateStr: string) => {
    setDeadlineDates(prev => {
      const existing = prev.find(d => d.date === dateStr);
      if (existing) {
        const next = prev.filter(d => d.date !== dateStr);
        localStorage.setItem('board_deadline_dates_v2', JSON.stringify(next));
        return next;
      } else {
        const title = prompt("締切線の名前を入力してください:", "締切");
        if (!title) return prev;
        const next = [...prev, { date: dateStr, label: title }];
        localStorage.setItem('board_deadline_dates_v2', JSON.stringify(next));
        return next;
      }
    });
  };

  useEffect(() => {
    const handleClickOutside = () => setContextMenu(null);
    window.addEventListener('click', handleClickOutside);
    return () => window.removeEventListener('click', handleClickOutside);
  }, []);

  // Re-calculate SVG lines when view/tasks change
  useLayoutEffect(() => {
    forceUpdate({});
  }, [tasks, viewMode, groupMode, baseDate]);

  // Mouse Move for Link Drawing
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isLinking && containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        setMousePos({
          x: e.clientX - rect.left + containerRef.current.scrollLeft,
          y: e.clientY - rect.top
        });
      }
    };
    const handleMouseUp = () => {
      if (isLinking) {
        setIsLinking(false);
        setLinkStartTask(null);
      }
    };

    if (isLinking) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isLinking]);

  const handlePrevPeriod = () => {
    const newDate = new Date(baseDate);
    newDate.setMonth(newDate.getMonth() - 1);
    setBaseDate(newDate);
  };

  const handleNextPeriod = () => {
    const newDate = new Date(baseDate);
    newDate.setMonth(newDate.getMonth() + 1);
    setBaseDate(newDate);
  };

  const getDaysDiff = (start: Date, end: Date) => {
    return Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
  };

  const { startDate, endDate, totalDays, dates } = useMemo(() => {
    const start = new Date(baseDate);
    start.setDate(start.getDate() - 7);

    const end = new Date(start);
    const daysToAdd = viewMode === '1month' ? 45 : 90;
    end.setDate(end.getDate() + daysToAdd);

    const days = getDaysDiff(start, end);
    const dateArray = [];
    for (let i = 0; i <= days; i++) {
      const d = new Date(start);
      d.setDate(d.getDate() + i);
      dateArray.push(d);
    }

    return { startDate: start, endDate: end, totalDays: days, dates: dateArray };
  }, [baseDate, viewMode]);

  const tasksById = useMemo(() => {
    const map = new Map<string, Task>();
    tasks.forEach(t => map.set(t.id, t));
    return map;
  }, [tasks]);

  const getEffectiveProject = (task: Task): string => {
    if (task.project && task.project !== '未分類') return task.project;
    if (task.parentId) {
      const parent = tasksById.get(task.parentId);
      if (parent) return getEffectiveProject(parent);
    }
    return task.project || '未分類';
  };

  const groupedTasks = useMemo((): Record<string, Record<string, Task[]>> => {
    const groups: Record<string, Record<string, Task[]>> = {};

    const addToGroup = (swimlane: string, task: Task) => {
      if (!groups[swimlane]) groups[swimlane] = {};
      const trackId = task.trackId || `track-${task.id}`;
      if (!groups[swimlane][trackId]) groups[swimlane][trackId] = [];
      groups[swimlane][trackId].push(task);
    };

    const memberNames = members.map(m => m.name);

    if (groupMode === 'person') {
      memberNames.forEach(exec => { groups[exec] = {}; });
      groups['その他/未割当'] = {};

      tasks.forEach(task => {
        const exec = memberNames.find(e => task.responsiblePerson.includes(e));
        addToGroup(exec || 'その他/未割当', task);
      });
    } else {
      // Group by Project
      tasks.forEach(task => {
        const projName = getEffectiveProject(task);
        addToGroup(projName, task);
      });
    }

    return groups;
  }, [tasks, groupMode, tasksById]);

  // --- Critical Path Logic ---
  const criticalPathTasks = useMemo(() => {
    const adj: Record<string, string[]> = {};
    const revAdj: Record<string, string[]> = {};

    tasks.forEach(t => {
      adj[t.id] = [];
      revAdj[t.id] = [];
    });

    tasks.forEach(t => {
      if (t.dependencies) {
        t.dependencies.forEach(depId => {
          if (adj[depId]) adj[depId].push(t.id);
          if (revAdj[t.id]) revAdj[t.id].push(depId);
        });
      }
    });

    let maxFinishTime = 0;
    tasks.forEach(t => {
      const end = t.dueDate ? new Date(t.dueDate).getTime() : new Date(t.date).getTime();
      if (end > maxFinishTime) maxFinishTime = end;
    });

    const criticalSet = new Set<string>();

    const checkCritical = (taskId: string) => {
      if (criticalSet.has(taskId)) return;
      criticalSet.add(taskId);
      const predecessors = revAdj[taskId] || [];
      const currentTask = tasks.find(t => t.id === taskId);
      if (!currentTask) return;

      const currentStart = currentTask.startDate ? new Date(currentTask.startDate).getTime() : new Date(currentTask.date).getTime();

      predecessors.forEach(predId => {
        const predTask = tasks.find(t => t.id === predId);
        if (!predTask) return;
        const predEnd = predTask.dueDate ? new Date(predTask.dueDate).getTime() : new Date(predTask.date).getTime();

        const diffDays = (currentStart - predEnd) / (1000 * 60 * 60 * 24);
        if (diffDays <= 3) {
          checkCritical(predId);
        }
      });
    };

    tasks.forEach(t => {
      const end = t.dueDate ? new Date(t.dueDate).getTime() : new Date(t.date).getTime();
      if ((maxFinishTime - end) / (1000 * 60 * 60 * 24) <= 2) {
        checkCritical(t.id);
      }
    });

    return criticalSet;
  }, [tasks]);

  // Purely Calculate Position for Task Bar (No DOM dependency)
  const getTaskPosition = (task: Task) => {
    const taskStart = task.startDate ? new Date(task.startDate) : new Date(task.date);
    const taskEnd = task.dueDate ? new Date(task.dueDate) : new Date(taskStart.getTime() + (86400000 * 30));

    if (taskEnd < startDate || taskStart > endDate) return null;

    const visibleStart = taskStart < startDate ? startDate : taskStart;
    const visibleEnd = taskEnd > endDate ? endDate : taskEnd;

    const offsetDays = getDaysDiff(startDate, visibleStart);
    const durationDays = Math.max(1, getDaysDiff(visibleStart, visibleEnd));

    const leftPct = (offsetDays / totalDays) * 100;
    const widthPct = (durationDays / totalDays) * 100;

    return { left: `${leftPct}%`, width: `${widthPct}%` };
  };

  // Helper to calculate coordinates for SVG lines (Requires DOM)
  const getTaskDOMCoords = (task: Task) => {
    const el = document.getElementById(`task-bar-${task.id}`);
    if (!el || !containerRef.current) return null;

    const rect = el.getBoundingClientRect();
    const containerRect = containerRef.current.getBoundingClientRect();

    return {
      absX: rect.left - containerRect.left + containerRef.current.scrollLeft, // px
      absY: rect.top - containerRect.top + rect.height / 2, // px center
      absLeft: rect.left - containerRect.left + containerRef.current.scrollLeft,
      absRight: rect.right - containerRect.left + containerRef.current.scrollLeft
    };
  };

  const getStatusColor = (task: Task) => {
    const isCritical = criticalPathTasks.has(task.id);
    if (task.isSoftDeleted) return 'bg-slate-200 border-slate-300 text-slate-400 opacity-60';
    if (task.status === TaskStatus.COMPLETED) return 'bg-slate-500 border-slate-600 text-slate-100 opacity-90';

    // Sub-tasks are green (emerald) to distinguish from parents
    if (task.parentId || task.hierarchyType === 'subtask') {
      return 'bg-gradient-to-r from-emerald-500 to-emerald-600 border-emerald-600 text-white shadow-lg shadow-emerald-500/20';
    }

    if (isCritical) return 'bg-gradient-to-r from-rose-500 to-rose-600 border-rose-600 text-white shadow-lg shadow-rose-500/30';

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const dueDate = task.dueDate ? new Date(task.dueDate) : null;
    const isOverdue = dueDate && dueDate < today;

    if (isOverdue) return 'bg-gradient-to-r from-rose-500 to-red-600 border-rose-600 text-white shadow-lg shadow-rose-500/30';
    if (task.isCommitted || task.priority === TaskPriority.HIGH) {
      return 'bg-gradient-to-r from-orange-400 to-orange-500 border-orange-500 text-white shadow-lg shadow-orange-500/30';
    }
    if (task.status === TaskStatus.IN_PROGRESS) {
      return 'bg-gradient-to-r from-emerald-400 to-emerald-500 border-emerald-500 text-white shadow-lg shadow-emerald-500/30';
    }
    return 'bg-gradient-to-r from-blue-400 to-red-500 border-red-500 text-white shadow-lg shadow-red-500/30';
  };

  const today = new Date();
  const todayOffset = getDaysDiff(startDate, today);
  const todayPosition = (todayOffset / totalDays) * 100;

  // --- Drag and Drop Logic ---
  const handleDragStart = (e: React.DragEvent, task: Task) => {
    e.dataTransfer.setData('taskId', task.id);
    e.dataTransfer.effectAllowed = 'move';
    setTimeout(() => setIsDragging(true), 0);
  };

  const handleDragEnd = () => {
    setIsDragging(false);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = (e: React.DragEvent, dateIndex: number) => {
    e.preventDefault();
    setIsDragging(false);
    const taskId = e.dataTransfer.getData('taskId');
    const droppedTask = tasks.find(t => t.id === taskId);

    if (droppedTask && dateIndex >= 0 && dateIndex < dates.length) {
      const newStartDate = dates[dateIndex];
      const oldStartDate = droppedTask.startDate ? new Date(droppedTask.startDate) : new Date(droppedTask.date);
      const durationMillis = droppedTask.dueDate
        ? new Date(droppedTask.dueDate).getTime() - oldStartDate.getTime()
        : 86400000 * 30;
      const newDueDate = new Date(newStartDate.getTime() + durationMillis);

      const updatedTask = {
        ...droppedTask,
        startDate: newStartDate.toISOString().split('T')[0],
        dueDate: newDueDate.toISOString().split('T')[0]
      };

      handleTaskUpdateWithDependencies(updatedTask);
    }
  };

  // --- Dependency Linking Logic ---
  const startLink = (e: React.MouseEvent, taskId: string) => {
    e.stopPropagation();
    e.preventDefault();
    setIsLinking(true);
    setLinkStartTask(taskId);
    if (containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      setMousePos({
        x: e.clientX - rect.left + containerRef.current.scrollLeft,
        y: e.clientY - rect.top
      });
    }
  };

  const completeLink = (e: React.MouseEvent, targetTaskId: string) => {
    if (isLinking && linkStartTask) {
      e.stopPropagation();
      e.preventDefault();
      if (linkStartTask !== targetTaskId) {
        const targetTask = tasks.find(t => t.id === targetTaskId);
        if (targetTask) {
          const currentDeps = targetTask.dependencies || [];
          if (!currentDeps.includes(linkStartTask)) {
            const newDeps = [...currentDeps, linkStartTask];
            const updatedTarget = { ...targetTask, dependencies: newDeps };
            handleTaskUpdateWithDependencies(updatedTarget, true);
          }
        }
      }
      setIsLinking(false);
      setLinkStartTask(null);
    }
  };

  // --- Auto-Scheduling ---
  const handleTaskUpdateWithDependencies = (updatedTask: Task, forceReschedule = false) => {
    const newTasksMap = new Map<string, Task>(tasks.map(t => [t.id, t] as [string, Task]));
    newTasksMap.set(updatedTask.id, updatedTask);

    const queue = [updatedTask.id];
    const processed = new Set<string>();

    while (queue.length > 0) {
      const currentId = queue.shift()!;
      if (processed.has(currentId)) continue;
      processed.add(currentId);

      const currentTask = newTasksMap.get(currentId)!;
      const currentEnd = currentTask.dueDate ? new Date(currentTask.dueDate) : new Date(new Date(currentTask.startDate || currentTask.date).getTime() + 86400000 * 30);

      const successors = Array.from(newTasksMap.values()).filter(t => t.dependencies?.includes(currentId));

      for (const successor of successors) {
        const succStart = successor.startDate ? new Date(successor.startDate) : new Date(successor.date);

        const minStartDate = new Date(currentEnd);
        minStartDate.setDate(minStartDate.getDate() + 1);

        if (succStart < minStartDate || forceReschedule) {
          const durationMillis = successor.dueDate
            ? new Date(successor.dueDate).getTime() - succStart.getTime()
            : 86400000 * 30;

          const newSuccStart = minStartDate;
          const newSuccEnd = new Date(newSuccStart.getTime() + durationMillis);

          const updatedSucc = {
            ...successor,
            startDate: newSuccStart.toISOString().split('T')[0],
            dueDate: newSuccEnd.toISOString().split('T')[0]
          };
          newTasksMap.set(successor.id, updatedSucc);
          queue.push(successor.id);
        }
      }
    }

    if (onUpdateTasks) {
      onUpdateTasks(Array.from(newTasksMap.values()));
    } else {
      onUpdateTask(updatedTask);
    }
  };

  const handleCellClick = (dateIndex: number) => {
    if (dateIndex >= 0 && dateIndex < dates.length) {
      const dateStr = dates[dateIndex].toISOString().split('T')[0];
      onAddTask(dateStr);
    }
  };

  const handleContextMenu = (e: React.MouseEvent, task: Task) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      taskId: task.id,
      isDeleted: !!task.isSoftDeleted
    });
  };

  return (
    <div className="h-full flex flex-col bg-white rounded-[3rem] border border-slate-200 shadow-xl overflow-hidden relative" ref={containerRef}>
      <div className="p-8 border-b border-slate-100 bg-white/80 backdrop-blur z-20 flex flex-col xl:flex-row justify-between items-start xl:items-center gap-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
          <h3 className="text-xl font-black flex items-center text-slate-800"><Calendar className="w-6 h-6 mr-3 text-red-600" />全体工程表</h3>

          {/* View Switcher */}
          <div className="flex bg-slate-100 p-1.5 rounded-2xl">
            <button onClick={() => setGroupMode('person')} className={`flex items-center space-x-2 px-5 py-2.5 rounded-xl text-xs font-black transition-all ${groupMode === 'person' ? 'bg-white shadow text-red-600' : 'text-slate-400 hover:text-slate-600'}`}>
              <User className="w-3 h-3" /><span>担当別</span>
            </button>
            <button onClick={() => setGroupMode('project')} className={`flex items-center space-x-2 px-5 py-2.5 rounded-xl text-xs font-black transition-all ${groupMode === 'project' ? 'bg-white shadow text-red-600' : 'text-slate-400 hover:text-slate-600'}`}>
              <Briefcase className="w-3 h-3" /><span>エピック別</span>
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Legend */}
          <div className="hidden lg:flex items-center space-x-3 mr-4 text-[9px] font-bold text-slate-500 bg-slate-50 px-4 py-2 rounded-xl border border-slate-100">
            <span className="flex items-center"><span className="w-2 h-2 rounded-full bg-blue-500 mr-1.5 shadow-sm"></span>標準</span>
            <span className="flex items-center"><span className="w-2 h-2 rounded-full bg-emerald-500 mr-1.5 shadow-sm"></span>順調</span>
            <span className="flex items-center"><span className="w-2 h-2 rounded-full bg-orange-400 mr-1.5 shadow-sm"></span>リスク</span>
            <span className="flex items-center"><span className="w-2 h-2 rounded-full bg-rose-500 mr-1.5 shadow-sm"></span>遅延</span>
            <span className="flex items-center"><span className="w-2 h-2 rounded-full bg-slate-500 mr-1.5 shadow-sm"></span>完了</span>
          </div>

          <div className="flex items-center space-x-1">
            <button onClick={handlePrevPeriod} className="p-2.5 bg-slate-100 text-slate-500 rounded-xl hover:bg-slate-200 transition-all"><ChevronLeft className="w-4 h-4" /></button>
            <button onClick={() => setBaseDate(new Date())} className="px-5 py-2.5 bg-red-50 text-red-600 rounded-2xl text-xs font-black hover:bg-red-100 transition-all border border-red-100">今日</button>
            <button onClick={handleNextPeriod} className="p-2.5 bg-slate-100 text-slate-500 rounded-xl hover:bg-slate-200 transition-all"><ChevronRight className="w-4 h-4" /></button>
          </div>

          <div className="flex bg-slate-100 p-1.5 rounded-2xl">
            <button onClick={() => setViewMode('1month')} className={`px-5 py-2 rounded-xl text-xs font-black transition-all ${viewMode === '1month' ? 'bg-white shadow text-red-600' : 'text-slate-400 hover:text-slate-600'}`}>1.5ヶ月</button>
            <button onClick={() => setViewMode('3months')} className={`px-5 py-2 rounded-xl text-xs font-black transition-all ${viewMode === '3months' ? 'bg-white shadow text-red-600' : 'text-slate-400 hover:text-slate-600'}`}>3ヶ月</button>
          </div>
        </div>
      </div>

      {/* ... Rest of the component (Body, SVG, Grid, Swimlanes, ContextMenu) remains the same ... */}
      <div className="flex-1 overflow-x-auto overflow-y-hidden custom-scrollbar relative select-none bg-slate-50/30">
        <div className="min-w-[1000px] h-full flex flex-col relative">

          {/* Header */}
          <div className="flex border-b border-slate-100 bg-white/50 h-12 sticky top-0 z-30">
            <div className="w-56 flex-shrink-0 px-6 flex items-center border-r border-slate-100 bg-white/80 backdrop-blur sticky left-0 z-40 font-black text-xs text-slate-400 tracking-wider uppercase">
              {groupMode === 'person' ? '担当者' : 'エピック'}
            </div>
            <div className="flex-1 relative">
              {dates.map((d, i) => {
                const isStartOfMonth = d.getDate() === 1;
                const isWeekend = d.getDay() === 0 || d.getDay() === 6;
                const showDate = viewMode === '1month' || i % 2 === 0;

                return (
                  <div key={i} className={`absolute h-full flex items-center justify-start border-l border-slate-100 pl-2 cursor-pointer hover:bg-red-50/30 transition-colors ${isStartOfMonth ? 'bg-red-50/10' : ''}`} style={{ left: `${(i / totalDays) * 100}%` }} onDoubleClick={() => handleCellClick(i)} onContextMenu={(e) => { e.preventDefault(); toggleDeadline(dates[i].toISOString().split('T')[0]); }} title="ダブルクリック: タスク追加 / 右クリック: 締切線を引く">
                    {showDate && (
                      <span className={`text-[10px] font-bold ${isStartOfMonth ? 'text-red-600' : isWeekend ? 'text-rose-300' : 'text-slate-300'}`}>
                        {`${d.getMonth() + 1}/${d.getDate()}`}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto custom-scrollbar relative">
            {/* Dependency Lines SVG Layer */}
            <svg className="absolute inset-0 w-full h-full pointer-events-none z-10" style={{ minHeight: '100%' }}>
              <defs>
                <marker id="arrowhead" markerWidth="6" markerHeight="4" refX="5" refY="2" orient="auto">
                  <polygon points="0 0, 6 2, 0 4" fill="#94a3b8" />
                </marker>
                <marker id="arrowhead-critical" markerWidth="6" markerHeight="4" refX="5" refY="2" orient="auto">
                  <polygon points="0 0, 6 2, 0 4" fill="#f43f5e" />
                </marker>
              </defs>
              {tasks.map(task =>
                task.dependencies?.map(depId => {
                  const depTask = tasks.find(t => t.id === depId);
                  if (!depTask) return null;
                  const startCoords = getTaskDOMCoords(depTask); // Predecessor (DOM based)
                  const endCoords = getTaskDOMCoords(task); // Successor (DOM based)

                  if (!startCoords || !endCoords) return null;

                  // Highlight if both on critical path
                  const isCritical = criticalPathTasks.has(task.id) && criticalPathTasks.has(depId);
                  const strokeColor = isCritical ? '#f43f5e' : '#cbd5e1';
                  const marker = isCritical ? 'url(#arrowhead-critical)' : 'url(#arrowhead)';
                  const strokeWidth = isCritical ? 2 : 1.5;

                  // Bezier Curve
                  const startX = startCoords.absRight;
                  const startY = startCoords.absY;
                  const endX = endCoords.absLeft;
                  const endY = endCoords.absY;

                  // Control points for S-curve
                  const cp1x = startX + 20;
                  const cp2x = endX - 20;

                  return (
                    <path
                      key={`${task.id}-${depId}`}
                      d={`M ${startX} ${startY} C ${cp1x} ${startY}, ${cp2x} ${endY}, ${endX} ${endY}`}
                      fill="none"
                      stroke={strokeColor}
                      strokeWidth={strokeWidth}
                      markerEnd={marker}
                      className="transition-all duration-300"
                    />
                  );
                })
              )}
              {/* Temporary line while linking */}
              {isLinking && linkStartTask && (
                <path
                  d={`M ${(() => {
                    const t = tasks.find(x => x.id === linkStartTask);
                    const c = t ? getTaskDOMCoords(t) : null;
                    return c ? `${c.absRight} ${c.absY}` : '0 0';
                  })()} L ${mousePos.x} ${mousePos.y}`}
                  stroke="#6366f1"
                  strokeWidth="2"
                  strokeDasharray="5,5"
                  fill="none"
                />
              )}
            </svg>

            {/* Grid Lines & Drop Targets */}
            <div className="absolute inset-0 flex pointer-events-none">
              <div className="w-56 flex-shrink-0 border-r border-slate-100 bg-white sticky left-0 z-10" />
              <div className="flex-1 relative pointer-events-auto">
                {dates.map((d, i) => (
                  <div
                    key={i}
                    className={`absolute top-0 bottom-0 border-r transition-colors z-0 ${d.getDay() === 0 || d.getDay() === 6 ? 'bg-slate-50/50 border-slate-100' : 'border-slate-50'} hover:bg-red-50/20`}
                    style={{ left: `${(i / totalDays) * 100}%`, width: `${100 / totalDays}%` }}
                    onDragOver={handleDragOver}
                    onDrop={(e) => handleDrop(e, i)}
                    onDoubleClick={() => handleCellClick(i)}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      toggleDeadline(dates[i].toISOString().split('T')[0]);
                    }}
                    title="ダブルクリック: タスク追加 / 右クリック: 締切線を引く"
                  />
                ))}
                {todayPosition >= 0 && todayPosition <= 100 && (
                  <div className="absolute top-0 bottom-0 w-px bg-rose-500 z-10 pointer-events-none" style={{ left: `${todayPosition}%` }}>
                    <div className="absolute -top-1 -translate-x-1/2 bg-rose-500 text-white text-[9px] font-black px-1.5 py-0.5 rounded shadow-sm z-50">TODAY</div>
                  </div>
                )}
                {deadlineDates.map(item => {
                  const dObj = new Date(item.date);
                  const offset = getDaysDiff(startDate, dObj);
                  if (offset >= 0 && offset <= totalDays) {
                    const pos = (offset / totalDays) * 100;
                    return (
                      <div key={item.date} className="absolute top-0 bottom-0 border-l-[3px] border-red-500/50 z-10 pointer-events-none" style={{ left: `${pos}%` }}>
                        <div className="absolute top-6 -translate-x-1/2 bg-red-600 text-white text-[10px] font-black px-2 py-1 rounded shadow-md whitespace-nowrap z-50">
                          {item.label}
                        </div>
                      </div>
                    );
                  }
                  return null;
                })}
              </div>
            </div>

            {/* Swimlanes */}
            {Object.entries(groupedTasks).map(([groupName, tracks]) => {
              const allGroupTasks = Object.values(tracks).flat();
              if (allGroupTasks.length === 0 && groupName === 'その他/未割当') return null;

              return (
                <div key={groupName} className="border-b border-slate-100 relative pointer-events-none group/lane hover:bg-slate-50/50 transition-colors">
                  <div className="flex min-h-[72px]">
                    <div className="w-56 flex-shrink-0 p-4 flex flex-col justify-center border-r border-slate-100 bg-white sticky left-0 z-20 shadow-[4px_0_12px_rgba(0,0,0,0.02)] pointer-events-auto">
                      <div className="flex items-center space-x-3">
                        <div className="w-8 h-8 rounded-xl bg-red-50 flex items-center justify-center text-red-600 shadow-sm border border-red-100">
                          {groupMode === 'person' ? <User className="w-4 h-4" /> : <Briefcase className="w-4 h-4" />}
                        </div>
                        <span className="font-bold text-sm text-slate-700 truncate" title={groupName}>{groupName}</span>
                      </div>
                      <div className="mt-1 flex items-center space-x-2 text-[10px] text-slate-400 font-bold ml-11">
                        <span>{allGroupTasks.length} tasks</span>
                      </div>
                    </div>

                    <div className="flex-1 relative py-3">
                      {allGroupTasks.length === 0 ? (
                        <div className="absolute inset-0 flex items-center justify-center text-[10px] text-slate-300 font-bold italic">No active tasks</div>
                      ) : (
                        Object.entries(tracks).map(([trackId, trackTasks]) => (
                          <div key={trackId} className="h-12 relative my-1 group pointer-events-auto">
                            {trackTasks.map((task) => {
                              const style = getTaskPosition(task);
                              if (!style) return null;

                              return (
                                <div
                                  key={task.id}
                                  id={`task-bar-${task.id}`}
                                  className={`absolute h-8 top-2 rounded-lg shadow-sm cursor-grab active:cursor-grabbing hover:scale-[1.01] hover:shadow-md transition-all flex items-center px-3 overflow-hidden ${getStatusColor(task)} ${isDragging ? 'pointer-events-none' : ''}`}
                                  style={{ left: style.left, width: style.width }}
                                  draggable={!task.isSoftDeleted}
                                  onDragStart={(e) => handleDragStart(e, task)}
                                  onDragEnd={handleDragEnd}
                                  onClick={() => onEditTaskFromTimeline && onEditTaskFromTimeline(task.id)}
                                  onContextMenu={(e) => handleContextMenu(e, task)}
                                  onMouseUp={(e) => completeLink(e, task.id)}
                                >
                                  {task.isSoftDeleted && <div className="absolute inset-0 bg-white/40 backdrop-blur-[1px]" />}
                                  <span className={`relative text-[10px] font-bold truncate drop-shadow-md z-10 flex-1 ${task.isSoftDeleted ? 'line-through text-slate-500' : ''}`}>
                                    {groupMode === 'project' && <span className="mr-2 opacity-70 font-normal">({task.responsiblePerson})</span>}
                                    {task.title}
                                    {(task.comments?.length > 0 || task.attachments?.length > 0) && (
                                      <span className="ml-2 inline-flex items-center gap-1 opacity-70">
                                        {task.comments?.length > 0 && <MessageSquare className="w-3 h-3" />}
                                        {task.attachments?.length > 0 && <Paperclip className="w-3 h-3" />}
                                      </span>
                                    )}
                                  </span>
                                  {/* Link Handle */}
                                  {!task.isSoftDeleted && (
                                    <div
                                      className="absolute right-0 top-0 bottom-0 w-4 cursor-crosshair opacity-0 group-hover:opacity-100 hover:bg-white/20 z-20 flex items-center justify-center transition-opacity"
                                      onMouseDown={(e) => startLink(e, task.id)}
                                      title="ドラッグして他のタスクにリンク"
                                    >
                                      <div className="w-2 h-2 rounded-full bg-white shadow-sm ring-1 ring-black/10" />
                                    </div>
                                  )}

                                  {/* Milestones on Timeline */}
                                  {!task.isSoftDeleted && task.milestones && task.milestones.map((ms, idx) => {
                                    const msPos = (getDaysDiff(startDate, new Date(ms.date)) / totalDays) * 100;
                                    if (msPos < 0 || msPos > 100) return null;
                                    return (
                                      <div
                                        key={idx}
                                        className="absolute top-3 w-4 h-4 -ml-2 z-30 cursor-pointer group/ms pointer-events-auto hover:scale-125 transition-transform"
                                        style={{ left: `${msPos}%` }}
                                      >
                                        <Diamond className={`w-4 h-4 fill-current drop-shadow-md ${ms.isCompleted ? 'text-emerald-400' : 'text-slate-800'}`} />
                                        {/* Milestone Tooltip */}
                                        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-max max-w-[150px] bg-slate-900 text-white text-[9px] p-2 rounded-xl opacity-0 group-hover/ms:opacity-100 transition-opacity pointer-events-none z-50 shadow-xl">
                                          <p className="font-bold">{ms.title}</p>
                                          <p className="text-slate-400">{ms.date}</p>
                                          <div className="absolute bottom-[-4px] left-1/2 -translate-x-1/2 w-2 h-2 bg-slate-900 rotate-45" />
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              );
                            })}
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Context Menu */}
      {contextMenu && (
        <div
          className="fixed z-[500] bg-white rounded-xl shadow-2xl border border-slate-100 py-2 w-56 animate-in fade-in zoom-in duration-150"
          style={{ top: contextMenu.y, left: contextMenu.x }}
        >
          {onSoftDeleteTask && (
            <button
              onClick={() => { onSoftDeleteTask(contextMenu.taskId); setContextMenu(null); }}
              className="w-full text-left px-4 py-3 hover:bg-slate-50 flex items-center space-x-3 text-xs font-bold text-slate-700 transition-colors"
            >
              {contextMenu.isDeleted ? (
                <>
                  <RotateCcw className="w-4 h-4 text-emerald-500" />
                  <span>仮削除を取り消す (復元)</span>
                </>
              ) : (
                <>
                  <Trash2 className="w-4 h-4 text-rose-500" />
                  <span>仮削除 (グレーアウト)</span>
                </>
              )}
            </button>
          )}
        </div>
      )}

    </div>
  );
};
