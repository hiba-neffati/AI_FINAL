import React, { useState, useEffect, useRef } from "react";
import {
  BookOpen,
  LogOut,
  User as UserIcon,
  Send,
  FileText,
  UploadCloud,
  Brain,
  Award,
  ArrowRight,
  Loader2,
  FileCheck,
  ListChecks,
  RefreshCw,
  Sparkles,
  Database,
  Plus,
  Trash2,
  CheckCircle2,
  XCircle,
  Info,
  ChevronRight,
  HelpCircle,
  ChevronDown,
  ShieldAlert,
  Search,
  Clock,
  Edit2,
  PanelLeft,
  FileCode,
  Folder,
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { User, Course, Message, Quiz, QuizAttempt, CourseSummary } from "./types.js";

export default function App() {
  // Authentication state
  const [token, setToken] = useState<string | null>(localStorage.getItem("token"));
  const [user, setUser] = useState<User | null>(
    localStorage.getItem("user") ? JSON.parse(localStorage.getItem("user")!) : null
  );
  
  // Auth Form State
  const [isLogin, setIsLogin] = useState(true);
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authName, setAuthName] = useState("");
  const [authError, setAuthError] = useState("");
  const [authLoading, setAuthLoading] = useState(false);

  // App General State
  const [courses, setCourses] = useState<Course[]>([]);
  const [activeCourseId, setActiveCourseId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"chat" | "summary" | "quiz">("chat");

  // Dashboard Statistics
  const [stats, setStats] = useState({
    totalCourses: 0,
    totalChunks: 0,
    totalQuizzes: 0,
    totalAttempts: 0,
    avgQuizScore: 0,
    recentAttempts: [] as QuizAttempt[],
  });

  // Chat State
  const [chatMessages, setChatMessages] = useState<{ [courseId: string]: Message[] }>({});
  const [inputValue, setInputValue] = useState("");
  const [selectedAgent, setSelectedAgent] = useState<"RAG" | "RetrievalAgent">("RAG");
  const [chatLoading, setChatLoading] = useState(false);
  const chatBottomRef = useRef<HTMLDivElement>(null);

  // Summary State
  const [summaryLoading, setSummaryLoading] = useState(false);

  // Quiz State
  
  const [quizLoading, setQuizLoading] = useState(false);
  const [quizAnswers, setQuizAnswers] = useState<{ [questionId: string]: number }>({});
  const [quizSubmitted, setQuizSubmitted] = useState(false);
  const [submittedAttempt, setSubmittedAttempt] = useState<QuizAttempt | null>(null);

  // Drag and Drop Upload State
  const [dragActive, setDragActive] = useState(false);
  const [uploadLoading, setUploadLoading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Sidebar State
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [expandedSections, setExpandedSections] = useState<{ [key: string]: boolean }>({
    chatHistory: true,
    knowledgeBase: true,
  });
  const [chatHistorySearch, setChatHistorySearch] = useState("");
  const [renamingChatId, setRenamingChatId] = useState<string | null>(null);
  const [newChatName, setNewChatName] = useState("");
  
  // Mock chat sessions data (in production, would come from backend)
  const [chatSessions, setChatSessions] = useState<{ id: string; courseId: string; title: string; timestamp: string }[]>([]);

  // Automatic state pooling for processing files
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (token && courses.some((c) => c.isProcessing)) {
      interval = setInterval(() => {
        fetchCourses();
        fetchStats();
      }, 3000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [token, courses]);

  // Scroll to chat bottom on change
  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages, activeCourseId, chatLoading]);

  // Initial downloads on auth success
  useEffect(() => {
    if (token) {
      fetchCourses();
      fetchStats();
    }
  }, [token]);

  // API Call Helpers
  const apiFetch = async (endpoint: string, options: RequestInit = {}) => {
    const headers = {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    };

    const res = await fetch(endpoint, { ...options, headers });
    
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error || `Request failed with status ${res.status}`);
    }
    
    return res.json();
  };

  const fetchCourses = async () => {
    try {
      const data = await apiFetch("/api/courses");
      setCourses(data);
      if (data.length > 0 && !activeCourseId) {
        setActiveCourseId(data[0].id);
      }
    } catch (e: any) {
      console.error("Failed to load courses:", e.message);
    }
  };

  const fetchStats = async () => {
    try {
      const data = await apiFetch("/api/dashboard/stats");
      setStats(data);
    } catch (e: any) {
      console.error("Failed to load dashboard stats:", e.message);
    }
  };

  // Auth Operations
  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError("");
    setAuthLoading(true);

    const endpoint = isLogin ? "/api/auth/login" : "/api/auth/register";
    const payload = isLogin
      ? { email: authEmail, password: authPassword }
      : { name: authName, email: authEmail, password: authPassword };

    try {
      const data = await apiFetch(endpoint, {
        method: "POST",
        body: JSON.stringify(payload),
      });

      localStorage.setItem("token", data.token);
      localStorage.setItem("user", JSON.stringify(data.user));
      setToken(data.token);
      setUser(data.user);
      
      // Clear forms
      setAuthEmail("");
      setAuthPassword("");
      setAuthName("");
    } catch (err: any) {
      setAuthError(err.message || "An error occurred during authentication.");
    } finally {
      setAuthLoading(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    setToken(null);
    setUser(null);
    setCourses([]);
    setActiveCourseId(null);
    setChatMessages({});
    setChatSessions([]);
  };

  // Drag & Drop File Upload Handler
  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileUpload(e.dataTransfer.files[0]);
    }
  };

  const selectFile = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      handleFileUpload(e.target.files[0]);
    }
  };

  const handleFileUpload = async (file: File) => {
    if (!file.name.endsWith(".pdf")) {
      setUploadError("Please upload a valid PDF course textbook file.");
      return;
    }

    setUploadError("");
    setUploadLoading(true);

    const formData = new FormData();
    formData.append("file", file);

    try {
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      const res = await fetch("/api/courses/upload", {
        method: "POST",
        headers,
        body: formData,
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "File upload failed.");
      }

      const uploadedCourse = await res.json();
      setCourses((prev) => [uploadedCourse, ...prev]);
      setActiveCourseId(uploadedCourse.id);
      fetchStats();
    } catch (e: any) {
      setUploadError(e.message || "Failed to upload course file.");
    } finally {
      setUploadLoading(false);
    }
  };

  // Course Delete
  const handleDeleteCourse = async (courseId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!window.confirm("Are you sure you want to delete this course material? All related chats and quizzes will be removed.")) {
      return;
    }

    try {
      await apiFetch(`/api/courses/${courseId}`, { method: "DELETE" });
      setCourses((prev) => prev.filter((c) => c.id !== courseId));
      if (activeCourseId === courseId) {
        setActiveCourseId(courses.find((c) => c.id !== courseId)?.id || null);
      }
      fetchStats();
    } catch (err: any) {
      alert("Failed to delete course: " + err.message);
    }
  };

  const handleNewChat = () => {
    if (courses.length === 0) return;

    const courseId = activeCourseId || courses[0].id;
    const newSession = {
      id: `session_${Math.random().toString(36).substring(2, 10)}`,
      courseId,
      title: "New Chat",
      timestamp: new Date().toISOString(),
    };

    setActiveCourseId(courseId);
    setChatSessions((prev) => [newSession, ...prev]);
    setChatMessages((prev) => ({ ...prev, [courseId]: [] }));
    setNewChatName("New Chat");
    setRenamingChatId(newSession.id);
  };

  // Chat/RAG Operations
  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputValue.trim() || !activeCourseId || chatLoading) return;

    const userMsgText = inputValue.trim();
    setInputValue("");
    setChatLoading(true);

    // Append student client message
    const userMsg: Message = {
      id: "msg_" + Math.random().toString(36).substring(2, 11),
      role: "user",
      text: userMsgText,
      timestamp: new Date().toISOString(),
    };

    setChatMessages((prev) => ({
      ...prev,
      [activeCourseId]: [...(prev[activeCourseId] || []), userMsg],
    }));

    try {
      const responseMsg = await apiFetch(`/api/courses/${activeCourseId}/chat`, {
        method: "POST",
        body: JSON.stringify({ message: userMsgText, agentName: selectedAgent }),
      });

      setChatMessages((prev) => ({
        ...prev,
        [activeCourseId]: [...(prev[activeCourseId] || []), responseMsg],
      }));
    } catch (err: any) {
      const errorMsg: Message = {
        id: "msg_err_" + Math.random().toString(36).substring(2, 11),
        role: "assistant",
        text: `Error calling agent: ${err.message}. Make sure your   API Key is loaded.`,
        timestamp: new Date().toISOString(),
      };
      setChatMessages((prev) => ({
        ...prev,
        [activeCourseId]: [...(prev[activeCourseId] || []), errorMsg],
      }));
    } finally {
      setChatLoading(false);
    }
  };

  // Summary Agent Operations
  const handleGenerateSummary = async (courseId: string) => {
    setSummaryLoading(true);
    try {
      const summ: CourseSummary = await apiFetch(`/api/courses/${courseId}/summary`, {
        method: "POST",
      });
      setCourses((prev) =>
        prev.map((c) => (c.id === courseId ? { ...c, summary: summ } : c))
      );
    } catch (err: any) {
      alert("Summary generation failed: " + err.message);
    } finally {
      setSummaryLoading(false);
    }
  };

  const handleGenerateQuiz = async (courseId: string) => {
  setQuizLoading(true);
  setQuizAnswers({});
  setQuizSubmitted(false);
  setSubmittedAttempt(null);
  try {
    const updatedCourse = await apiFetch(`/api/courses/${courseId}/quiz`, {
      method: "POST",
    });
    // Update the course in your courses list
    setCourses((prev) => 
      prev.map((c) => c.id === courseId ? { ...c, quiz: updatedCourse } : c)
    );
  } catch (err: any) {
    alert("Quiz generation failed: " + err.message);
  } finally {
    setQuizLoading(false);
  }
};

  const handleSelectQuizOption = (questionId: string, optionIndex: number) => {
    if (quizSubmitted) return;
    setQuizAnswers((prev) => ({ ...prev, [questionId]: optionIndex }));
  };

  const handleSubmitQuiz = async (quizId: string) => {
  // Get quiz from the active course instead of activeQuizzes state
  const activeQuiz = activeCourse?.quiz;
  if (!activeQuiz) {
    console.error("No quiz found for this course");
    return;
  }

  // Check if everything is answered
  const unanswered = activeQuiz.questions.some((q) => quizAnswers[q.id] === undefined);
  if (unanswered && !window.confirm("You haven't answered all questions. Submit anyway?")) {
    return;
  }

  setQuizLoading(true);
  try {
    const attempt: QuizAttempt = await apiFetch(`/api/quizzes/${quizId}/submit`, {
      method: "POST",
      body: JSON.stringify({
        answers: quizAnswers,
        courseId: activeCourseId,
      }),
    });

    setSubmittedAttempt(attempt);
    setQuizSubmitted(true);
    fetchStats();
  } catch (err: any) {
    console.error("Submit error:", err);
    alert("Failed to submit quiz: " + err.message);
  } finally {
    setQuizLoading(false);
  }
};

  // Dynamic values
  const activeCourse = courses.find((c) => c.id === activeCourseId);
  const activeChat = activeCourseId ? chatMessages[activeCourseId] || [] : [];
  const currentQuiz = activeCourse?.quiz || null;

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 flex flex-col font-sans selection:bg-indigo-500 selection:text-white" id="main-assistant-container">
      {/* HEADER SECTION */}
      <header className="bg-slate-950 border-b border-slate-800 px-6 py-4 flex items-center justify-between shadow-2xl sticky top-0 z-40">
        <div className="flex items-center space-x-3">
          <div className="bg-gradient-to-tr from-indigo-600 to-violet-500 p-2 rounded-xl text-white shadow-md">
            <Brain className="w-6 h-6 animate-pulse" />
          </div>
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-white flex items-center">
              AI Course PDF Assistant <span className="ml-2 text-xs font-mono font-normal bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 px-2 py-0.5 rounded-full">v1.0</span>
            </h1>
            <p className="text-xs text-slate-400">RAG-powered intelligent companion for textbook studying</p>
          </div>
        </div>

        {token && user ? (
          <div className="flex items-center space-x-6">
            {/* Quick Stats Banner */}
            <div className="hidden md:flex items-center space-x-6 text-xs bg-slate-900 border border-slate-800 px-4 py-1.5 rounded-xl">
              <div>
                <span className="text-slate-400 mr-1.5">Books:</span>
                <span className="font-semibold text-white font-mono">{stats.totalCourses}</span>
              </div>
              <div className="h-4 w-px bg-slate-800" />
              <div>
                <span className="text-slate-400 mr-1.5">Syllabus Segments:</span>
                <span className="font-semibold text-indigo-400 font-mono">{stats.totalChunks}</span>
              </div>
              <div className="h-4 w-px bg-slate-800" />
              <div>
                <span className="text-slate-400 mr-1.5 font-sans">Quiz Confidence:</span>
                <span className="font-semibold text-emerald-400 font-mono">{stats.avgQuizScore}%</span>
              </div>
            </div>

            {/* Profile Dropdown */}
            <div className="flex items-center space-x-3 bg-slate-900 px-3.5 py-1.5 rounded-xl border border-slate-800">
              <div className="w-8 h-8 rounded-full bg-indigo-600 text-white font-semibold flex items-center justify-center text-sm uppercase">
                {user.name.charAt(0)}
              </div>
              <div className="text-left hidden lg:block">
                <p className="text-xs font-medium text-white max-w-[120px] truncate">{user.name}</p>
                <p className="text-[10px] text-slate-500 max-w-[120px] truncate">{user.email}</p>
              </div>
              <button
                onClick={handleLogout}
                className="hover:text-rose-400 text-slate-400 transition-colors p-1 rounded-md hover:bg-slate-800"
                title="Log Out From Assistant"
                id="logout_btn"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          </div>
        ) : (
          <div className="text-xs text-slate-400 font-mono">
            Unauthenticated Mode
          </div>
        )}
      </header>

      {/* CORE CONTAINER */}
      <main className="flex-1 flex overflow-hidden">
        {!token ? (
          /* AUTH SCREEN */
          <div className="flex-1 flex items-center justify-center p-6 bg-slate-900" id="auth_container">
            <div className="w-full max-w-md bg-slate-950 border border-slate-800 rounded-2xl p-8 shadow-2xl relative overflow-hidden">
              <div className="absolute top-0 right-0 w-48 h-48 bg-indigo-600/10 rounded-full blur-3xl" />
              <div className="absolute bottom-0 left-0 w-36 h-36 bg-violet-600/5 rounded-full blur-2xl" />

              <div className="text-center mb-8 relative z-10">
                <div className="inline-flex bg-indigo-500/10 p-3.5 rounded-full text-indigo-400 mb-4 border border-indigo-500/20">
                  <Brain className="w-8 h-8" />
                </div>
                <h2 className="text-2xl font-bold tracking-tight text-white">University Course Portal</h2>
                <p className="text-sm text-slate-400 mt-2">Log in or Register to upload, summarize, and quiz textbook files</p>
              </div>

              {authError && (
                <div className="mb-6 p-4 bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs rounded-xl flex items-start space-x-2">
                  <ShieldAlert className="w-4 h-4 mt-0.5 shrink-0" />
                  <span>{authError}</span>
                </div>
              )}

              <form onSubmit={handleAuth} className="space-y-4 relative z-10">
                {!isLogin && (
                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1">Full Student Name</label>
                    <input
                      type="text"
                      className="w-full bg-slate-900 border border-slate-800 rounded-xl px-4 py-2.5 text-slate-100 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all outline-none"
                      placeholder="e.g. Marie Curie"
                      value={authName}
                      onChange={(e) => setAuthName(e.target.value)}
                      required={!isLogin}
                      id="auth_name_input"
                    />
                  </div>
                )}

                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">University Email Address</label>
                  <input
                    type="email"
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl px-4 py-2.5 text-slate-100 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all outline-none"
                    placeholder="student@university.edu"
                    value={authEmail}
                    onChange={(e) => setAuthEmail(e.target.value)}
                    required
                    id="auth_email_input"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Password Credentials</label>
                  <input
                    type="password"
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl px-4 py-2.5 text-slate-100 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all outline-none"
                    placeholder="••••••••"
                    value={authPassword}
                    onChange={(e) => setAuthPassword(e.target.value)}
                    required
                    id="auth_password_input"
                  />
                </div>

                <button
                  type="submit"
                  className="w-full bg-indigo-600 hover:bg-indigo-500 text-white py-3 rounded-xl text-sm font-semibold hover:shadow-lg hover:shadow-indigo-600/20 active:translate-y-[1px] transition-all flex items-center justify-center space-x-2"
                  disabled={authLoading}
                  id="auth_submit_btn"
                >
                  {authLoading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Authenticating Credentials...</span>
                    </>
                  ) : (
                    <>
                      <span>{isLogin ? "Sign In to Assistant" : "Create Student Account"}</span>
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </form>

              <div className="mt-6 text-center text-xs text-slate-500 relative z-10">
                {isLogin ? (
                  <p>
                    New to the Course Portal?{" "}
                    <button onClick={() => setIsLogin(false)} className="text-indigo-400 hover:underline">
                      Create a registered profile
                    </button>
                  </p>
                ) : (
                  <p>
                    Already have a student profile?{" "}
                    <button onClick={() => setIsLogin(true)} className="text-indigo-400 hover:underline">
                      Log in here
                    </button>
                  </p>
                )}
              </div>
            </div>
          </div>
        ) : (
          /* MAIN COLLEGE PLATFORM INTERFACE */
          <div className="flex-1 flex overflow-hidden bg-slate-900" id="course-portal-layout">
            
            {/* ENHANCED SIDEBAR - CHAT & DOCUMENT MANAGEMENT */}
            <aside className={`bg-slate-950 border-r border-slate-800 flex flex-col shrink-0 transition-all duration-300 ${
              sidebarCollapsed ? "w-20" : "w-80"
            }`}>
              
              {/* SIDEBAR HEADER - COLLAPSE TOGGLE & NEW CHAT BUTTON */}
              <div className="px-3 py-3.5 border-b border-slate-800/60 flex items-center justify-between gap-2">
                <motion.button
                  onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  className="p-2 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-slate-200 transition-all duration-150"
                  title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
                >
                  <PanelLeft className="w-4 h-4" />
                </motion.button>

                {!sidebarCollapsed && (
                  <motion.button
                    onClick={handleNewChat}
                    whileHover={{ scale: 1.02, x: 2 }}
                    whileTap={{ scale: 0.98 }}
                    className="flex items-center justify-center gap-2.5 px-3.5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-lg transition-all duration-200 hover:shadow-lg hover:shadow-indigo-500/25 active:shadow-md flex-1 group"
                    title="Start a new chat session"
                  >
                    <Plus className="w-3.5 h-3.5 group-hover:rotate-90 transition-transform duration-300" />
                    <span>New Chat</span>
                  </motion.button>
                )}
              </div>

              {!sidebarCollapsed ? (
                <>
                  {/* CHAT HISTORY SECTION */}
                  <div className="flex-1 flex flex-col overflow-hidden border-b border-slate-800/60">
                    {/* Section Header with Toggle */}
                    <motion.button
                      onClick={() =>
                        setExpandedSections((prev) => ({
                          ...prev,
                          chatHistory: !prev.chatHistory,
                        }))
                      }
                      whileHover={{ backgroundColor: "rgba(51, 65, 85, 0.3)" }}
                      className="px-4 py-3.5 flex items-center justify-between transition-colors group"
                    >
                      <div className="flex items-center gap-2.5">
                        <Clock className="w-4 h-4 text-indigo-400/80" />
                        <span className="text-xs font-semibold text-slate-300 uppercase tracking-wide">
                          Chat History
                        </span>
                      </div>
                      <motion.div
                        animate={{ rotate: expandedSections.chatHistory ? 0 : -90 }}
                        transition={{ duration: 0.2 }}
                      >
                        <ChevronDown className="w-3.5 h-3.5 text-slate-500" />
                      </motion.div>
                    </motion.button>

                    {/* Chat History Content */}
                    <AnimatePresence>
                      {expandedSections.chatHistory && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: "auto" }}
                          exit={{ opacity: 0, height: 0 }}
                          transition={{ duration: 0.2 }}
                          className="flex-1 overflow-hidden flex flex-col"
                        >
                          {/* Search Bar */}
                          <div className="px-3 py-2.5 border-b border-slate-800/40 bg-slate-900/20">
                            <div className="relative">
                              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-600" />
                              <input
                                type="text"
                                placeholder="Search chats..."
                                value={chatHistorySearch}
                                onChange={(e) => setChatHistorySearch(e.target.value)}
                                className="w-full pl-9 pr-3 py-2 bg-slate-900 border border-slate-800 rounded-md text-xs text-slate-100 placeholder-slate-600 focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/30 outline-none transition-all duration-150"
                              />
                            </div>
                          </div>

                          {/* Chat Sessions List */}
                          <div className="flex-1 overflow-y-auto space-y-1 p-2.5">
                            {chatSessions.length === 0 ? (
                              <motion.div
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                className="text-center py-8 px-2"
                              >
                                <Clock className="w-6 h-6 text-slate-700 mx-auto mb-2" />
                                <p className="text-xs text-slate-500">No chat history yet</p>
                              </motion.div>
                            ) : (
                              chatSessions
                                .filter((session) =>
                                  session.title.toLowerCase().includes(chatHistorySearch.toLowerCase())
                                )
                                .map((session) => (
                                  <motion.div
                                    key={session.id}
                                    layout
                                    initial={{ opacity: 0, x: -10 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    exit={{ opacity: 0, x: -10 }}
                                    className="group p-2.5 rounded-lg hover:bg-slate-800/50 transition-colors border border-transparent hover:border-slate-700/50 cursor-pointer"
                                  >
                                    <div className="flex items-start justify-between gap-2">
                                      <div className="flex-1 min-w-0">
                                        {renamingChatId === session.id ? (
                                          <motion.input
                                            initial={{ opacity: 0 }}
                                            animate={{ opacity: 1 }}
                                            type="text"
                                            value={newChatName}
                                            onChange={(e) => setNewChatName(e.target.value)}
                                            onBlur={() => setRenamingChatId(null)}
                                            onKeyDown={(e) => {
                                              if (e.key === "Enter") setRenamingChatId(null);
                                            }}
                                            className="w-full text-xs bg-slate-800 border border-indigo-500/50 rounded-md px-2.5 py-1.5 text-slate-100 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/30 outline-none"
                                            autoFocus
                                          />
                                        ) : (
                                          <>
                                            <p className="text-xs font-medium text-slate-300 truncate leading-snug">
                                              {session.title}
                                            </p>
                                            <p className="text-xs text-slate-500 mt-0.5">
                                              {new Date(session.timestamp).toLocaleDateString(undefined, {
                                                month: "short",
                                                day: "numeric",
                                              })}
                                            </p>
                                          </>
                                        )}
                                      </div>

                                      {/* Edit & Delete Actions */}
                                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                        <motion.button
                                          whileHover={{ scale: 1.1 }}
                                          whileTap={{ scale: 0.95 }}
                                          onClick={() => {
                                            setRenamingChatId(session.id);
                                            setNewChatName(session.title);
                                          }}
                                          className="p-1.5 hover:bg-slate-700 rounded-md text-slate-600 hover:text-slate-300 transition-colors"
                                          title="Rename chat"
                                        >
                                          <Edit2 className="w-3.5 h-3.5" />
                                        </motion.button>
                                        <motion.button
                                          whileHover={{ scale: 1.1 }}
                                          whileTap={{ scale: 0.95 }}
                                          onClick={() => {
                                            setChatSessions((prev) =>
                                              prev.filter((s) => s.id !== session.id)
                                            );
                                          }}
                                          className="p-1.5 hover:bg-slate-700 rounded-md text-slate-600 hover:text-rose-400 transition-colors"
                                          title="Delete chat"
                                        >
                                          <Trash2 className="w-3.5 h-3.5" />
                                        </motion.button>
                                      </div>
                                    </div>
                                  </motion.div>
                                ))
                            )}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>

                  {/* KNOWLEDGE BASE SECTION */}
                  <div className="flex-1 flex flex-col overflow-hidden">
                    {/* Section Header with Toggle */}
                    <motion.button
                      onClick={() =>
                        setExpandedSections((prev) => ({
                          ...prev,
                          knowledgeBase: !prev.knowledgeBase,
                        }))
                      }
                      whileHover={{ backgroundColor: "rgba(51, 65, 85, 0.3)" }}
                      className="px-4 py-3.5 flex items-center justify-between transition-colors group"
                    >
                      <div className="flex items-center gap-2.5">
                        <Folder className="w-4 h-4 text-violet-400/80" />
                        <span className="text-xs font-semibold text-slate-300 uppercase tracking-wide">
                          Knowledge Base
                        </span>
                      </div>
                      <motion.div
                        animate={{ rotate: expandedSections.knowledgeBase ? 0 : -90 }}
                        transition={{ duration: 0.2 }}
                      >
                        <ChevronDown className="w-3.5 h-3.5 text-slate-500" />
                      </motion.div>
                    </motion.button>

                    {/* Knowledge Base Content */}
                    <AnimatePresence>
                      {expandedSections.knowledgeBase && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: "auto" }}
                          exit={{ opacity: 0, height: 0 }}
                          transition={{ duration: 0.2 }}
                          className="flex-1 overflow-y-auto flex flex-col p-3 space-y-3"
                        >
                          {/* Drag & Drop Upload Area */}
                          <motion.div
                            onDragEnter={handleDrag}
                            onDragOver={handleDrag}
                            onDragLeave={handleDrag}
                            onDrop={handleDrop}
                            onClick={selectFile}
                            whileHover={{ scale: dragActive ? 1 : 1.01 }}
                            className={`border-2 border-dashed rounded-lg p-4 text-center cursor-pointer transition-all duration-200 group ${
                              dragActive
                                ? "border-indigo-500 bg-indigo-500/10 scale-105"
                                : "border-slate-700 bg-slate-900/30 hover:border-slate-600 hover:bg-slate-900/50"
                            }`}
                          >
                            <input
                              type="file"
                              ref={fileInputRef}
                              onChange={handleFileChange}
                              accept=".pdf"
                              className="hidden"
                            />
                            <motion.div
                              animate={{
                                y: uploadLoading ? [0, -4, 0] : 0,
                              }}
                              transition={{ duration: 1.5, repeat: uploadLoading ? Infinity : 0 }}
                            >
                              <UploadCloud
                                className={`w-6 h-6 mx-auto mb-2 transition-all ${
                                  uploadLoading
                                    ? "text-indigo-400 animate-pulse"
                                    : "text-slate-500 group-hover:text-indigo-400"
                                }`}
                              />
                            </motion.div>
                            <p className="text-xs font-semibold text-slate-300">
                              {uploadLoading ? "Uploading PDF..." : "Drop PDF files here"}
                            </p>
                            <p className="text-xs text-slate-500 mt-1">or click to browse</p>
                          </motion.div>

                          {uploadError && (
                            <motion.div
                              initial={{ opacity: 0, y: -10 }}
                              animate={{ opacity: 1, y: 0 }}
                              className="p-2.5 bg-rose-500/10 border border-rose-500/30 rounded-lg text-xs text-rose-300 flex items-start gap-2"
                            >
                              <ShieldAlert className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                              <span>{uploadError}</span>
                            </motion.div>
                          )}

                          {/* Uploaded Documents List */}
                          <div className="space-y-2">
                            <div className="flex items-center justify-between px-1">
                              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                                Indexed Materials
                              </p>
                              <span className="text-xs text-slate-500 bg-slate-800 px-2 py-0.5 rounded-full">
                                {courses.length}
                              </span>
                            </div>

                            {courses.length === 0 ? (
                              <motion.div
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                className="text-center py-6 text-xs text-slate-500"
                              >
                                <FileText className="w-5 h-5 mx-auto mb-2 text-slate-700" />
                                <p>No documents indexed yet</p>
                              </motion.div>
                            ) : (
                              <div className="space-y-1.5">
                                {courses.map((course) => {
                                  const isActive = course.id === activeCourseId;
                                  return (
                                    <motion.div
                                      key={course.id}
                                      layout
                                      initial={{ opacity: 0, x: -10 }}
                                      animate={{ opacity: 1, x: 0 }}
                                      onClick={() => {
                                        if (!course.isProcessing) {
                                          setActiveCourseId(course.id);
                                        }
                                      }}
                                      className={`group p-2.5 rounded-lg border-2 transition-all cursor-pointer ${
                                        isActive
                                          ? "border-indigo-500 bg-indigo-500/15"
                                          : "border-slate-800 hover:border-slate-700 hover:bg-slate-800/30"
                                      } ${course.isProcessing ? "opacity-60" : ""}`}
                                    >
                                      <div className="flex items-start gap-2.5">
                                        <div className={`flex-shrink-0 p-1.5 rounded-md ${
                                          isActive
                                            ? "bg-indigo-500/30"
                                            : "bg-slate-800"
                                        }`}>
                                          <FileText className={`w-3.5 h-3.5 ${
                                            isActive ? "text-indigo-400" : "text-slate-500"
                                          }`} />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                          <p className="text-xs font-semibold text-slate-300 truncate">
                                            {course.title}
                                          </p>
                                          <p className="text-xs text-slate-500 mt-0.5">
                                            {(course.fileSize / (1024 * 1024)).toFixed(1)} MB
                                          </p>
                                        </div>
                                        <motion.button
                                          whileHover={{ scale: 1.1 }}
                                          whileTap={{ scale: 0.95 }}
                                          onClick={(e) => handleDeleteCourse(course.id, e)}
                                          className="text-slate-600 hover:text-rose-400 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
                                          title="Delete document"
                                        >
                                          <Trash2 className="w-3.5 h-3.5" />
                                        </motion.button>
                                      </div>

                                      {/* Processing Status Indicator */}
                                      {course.isProcessing && (
                                        <motion.div
                                          initial={{ opacity: 0 }}
                                          animate={{ opacity: 1 }}
                                          className="mt-2 pt-2 border-t border-slate-700/50 text-xs text-indigo-400 flex items-center gap-1.5"
                                        >
                                          <Loader2 className="w-3 h-3 animate-spin" />
                                          <span>Processing file...</span>
                                        </motion.div>
                                      )}
                                    </motion.div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>

                </>
              ) : (
                /* COLLAPSED SIDEBAR - ICON-ONLY VIEW */
                <div className="flex-1 flex flex-col items-center justify-between py-4 px-2">
                  {/* Top Actions */}
                  <div className="space-y-3">
                    <motion.button
                      whileHover={{ scale: 1.08 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={handleNewChat}
                      className="w-full p-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg transition-all hover:shadow-lg hover:shadow-indigo-500/20"
                      title="New Chat"
                    >
                      <Plus className="w-4 h-4 mx-auto" />
                    </motion.button>

                    <motion.button
                      whileHover={{ scale: 1.08 }}
                      whileTap={{ scale: 0.95 }}
                      className="w-full p-2.5 hover:bg-slate-800 text-slate-400 hover:text-slate-300 rounded-lg transition-colors"
                      title="Chat History"
                      onClick={() =>
                        setExpandedSections((prev) => ({
                          ...prev,
                          chatHistory: !prev.chatHistory,
                        }))
                      }
                    >
                      <Clock className="w-4 h-4 mx-auto" />
                    </motion.button>

                    <motion.button
                      whileHover={{ scale: 1.08 }}
                      whileTap={{ scale: 0.95 }}
                      className="w-full p-2.5 hover:bg-slate-800 text-slate-400 hover:text-slate-300 rounded-lg transition-colors"
                      title="Knowledge Base"
                      onClick={() =>
                        setExpandedSections((prev) => ({
                          ...prev,
                          knowledgeBase: !prev.knowledgeBase,
                        }))
                      }
                    >
                      <Folder className="w-4 h-4 mx-auto" />
                    </motion.button>
                  </div>

                  {/* Bottom Status */}
                  <motion.div
                    whileHover={{ scale: 1.08 }}
                    className="p-2.5 hover:bg-slate-800 text-slate-400 hover:text-slate-300 rounded-lg transition-colors"
                    title="Database"
                  >
                    <Database className="w-4 h-4 mx-auto" />
                  </motion.div>
                </div>
              )}
            </aside>

            {/* RIGHT PANEL - ACTIVE HUB DETAILS */}
            <section className="flex-1 flex flex-col bg-slate-900 overflow-hidden" id="portal-workspace">
              {activeCourse ? (
                <>
                  {/* WORKSPACE HEADER */}
                  <div className="px-6 py-4 border-b border-slate-800 bg-slate-950 flex flex-col md:flex-row md:items-center justify-between gap-4 shrink-0">
                    <div>
                      <div className="flex items-center space-x-2 text-xs text-indigo-400 font-semibold mb-1">
                        <Sparkles className="w-3 h-3" />
                        <span>ACTIVE STUDY SESSION</span>
                      </div>
                      <h2 className="text-base font-bold text-white uppercase tracking-tight max-w-md truncate md:max-w-xl">
                        {activeCourse.title}
                      </h2>
                    </div>

                    {/* SELECT NAVIGATION TAB CODES */}
                    <div className="flex space-x-1 bg-slate-900 p-0.5 rounded-xl border border-slate-800 max-w-xs md:max-w-none">
                      <button
                        onClick={() => setActiveTab("chat")}
                        className={`flex items-center space-x-1.5 px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                          activeTab === "chat"
                            ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/10"
                            : "text-slate-400 hover:text-slate-100"
                        }`}
                        id="tab_chat_btn"
                      >
                        <Send className="w-3.5 h-3.5" />
                        <span>Chat & Retrieval</span>
                      </button>

                      <button
                        onClick={() => setActiveTab("summary")}
                        className={`flex items-center space-x-1.5 px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                          activeTab === "summary"
                            ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/10"
                            : "text-slate-400 hover:text-slate-100"
                        }`}
                        id="tab_summary_btn"
                      >
                        <FileText className="w-3.5 h-3.5" />
                        <span>Summary Agent</span>
                      </button>

                      <button
                        onClick={() => setActiveTab("quiz")}
                        className={`flex items-center space-x-1.5 px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                          activeTab === "quiz"
                            ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/10"
                            : "text-slate-400 hover:text-slate-100"
                        }`}
                        id="tab_quiz_btn"
                      >
                        <Award className="w-3.5 h-3.5" />
                        <span>Quiz Agent</span>
                      </button>
                    </div>
                  </div>

                  {/* ACTIVE WORKSPACE PANELS */}
                  <div className="flex-1 overflow-hidden relative">
                    <AnimatePresence mode="wait">
                      
                      {/* TAB 1: RETRIEVAL & CHAT ASSISTANT */}
                      {activeTab === "chat" && (
                        <motion.div
                          key="chat-panel"
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -10 }}
                          className="absolute inset-0 flex flex-col"
                          id="chat_panel"
                        >
                          <div className="p-4 bg-slate-900 border-b border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shrink-0">
                            <div className="text-xs text-slate-400">
                              Choose your active cognitive model agent to analyze course resources:
                            </div>

                            <div className="flex items-center space-x-2">
                              {/* RAG or Specialized Retrieval Agent option */}
                              <button
                                onClick={() => setSelectedAgent("RAG")}
                                className={`px-3 py-1 text-xs rounded-lg border font-semibold tracking-tight transition-all ${
                                  selectedAgent === "RAG"
                                    ? "bg-indigo-500/10 border-indigo-500 text-indigo-400"
                                    : "bg-slate-900 border-slate-800 text-slate-400 hover:text-white"
                                }`}
                              >
                                ⚡ Standard RAG
                              </button>
                              
                              <button
                                onClick={() => setSelectedAgent("RetrievalAgent")}
                                className={`px-3 py-1 text-xs rounded-lg border font-semibold tracking-tight transition-all ${
                                  selectedAgent === "RetrievalAgent"
                                    ? "bg-violet-500/10 border-violet-500 text-violet-400 font-bold"
                                    : "bg-slate-900 border-slate-800 text-slate-400 hover:text-white"
                                }`}
                              >
                                🔍 Retrieval Agent (Strict Citations)
                              </button>
                            </div>
                          </div>

                          {/* Message Flow Area */}
                          <div className="flex-1 overflow-y-auto px-6 py-6 space-y-6">
                            {/* Greeting card if empty */}
                            {activeChat.length === 0 ? (
                              <div className="max-w-2xl mx-auto text-center py-16 space-y-5">
                                <div className="inline-flex bg-indigo-500/10 p-5 rounded-3xl text-indigo-400 border border-indigo-500/20">
                                  {selectedAgent === "RetrievalAgent" ? (
                                    <ListChecks className="w-10 h-10 animate-bounce" />
                                  ) : (
                                    <Sparkles className="w-10 h-10 animate-pulse" />
                                  )}
                                </div>
                                <div>
                                  <h3 className="text-lg font-bold text-white mb-2">
                                    {selectedAgent === "RetrievalAgent" 
                                      ? "Knowledge Mining under Retrieval Agent"
                                      : "Chat with Course Intelligence"}
                                  </h3>
                                  <p className="text-sm text-slate-400 leading-relaxed max-w-md mx-auto">
                                    {selectedAgent === "RetrievalAgent"
                                      ? "The Retrieval Agent will strictly parse internal syllabus database text matching your query, extract exact citations, list relevance percentages, and limit external extrapolation."
                                      : "Conversational prompt learning allows you to ask summaries, explain difficult formulas, extract vocabulary, or analyze textbook outlines with  ."}
                                  </p>
                                </div>

                                <div className="grid grid-cols-2 gap-3 text-left max-w-md mx-auto pt-4 text-xs text-slate-400">
                                  <button
                                    onClick={() => setInputValue("Explain the key summaries of the course?")}
                                    className="p-3 bg-slate-950 border border-slate-800 rounded-xl hover:border-indigo-500 transition-colors"
                                  >
                                    "Explain the key summaries..."
                                  </button>
                                  <button
                                    onClick={() => setInputValue("What are the primary formulas/concepts described?")}
                                    className="p-3 bg-slate-950 border border-slate-800 rounded-xl hover:border-indigo-500 transition-colors"
                                  >
                                    "What are the primary concepts..."
                                  </button>
                                </div>
                              </div>
                            ) : (
                              activeChat.map((msg) => {
                                const isUser = msg.role === "user";
                                return (
                                  <div
                                    key={msg.id}
                                    className={`flex max-w-3xl items-start space-x-3 ${
                                      isUser ? "ml-auto flex-row-reverse space-x-reverse" : "mr-auto text-left"
                                    }`}
                                  >
                                    <div className={`w-8 h-8 rounded-lg shrink-0 font-bold flex items-center justify-center text-sm ${
                                      isUser
                                        ? "bg-indigo-600 text-white"
                                        : msg.agentName === "RetrievalAgent"
                                        ? "bg-violet-600/30 border border-violet-500 text-violet-400"
                                        : "bg-slate-950 text-indigo-400 border border-slate-800"
                                    }`}>
                                      {isUser ? "S" : "AI"}
                                    </div>

                                    <div className="space-y-2">
                                      <div className={`rounded-2xl p-4 text-sm leading-relaxed ${
                                        isUser
                                          ? "bg-indigo-600 text-white"
                                          : "bg-slate-950 text-slate-100 border border-slate-800"
                                      }`}>
                                        <p className="whitespace-pre-line">{msg.text}</p>
                                        
                                        {/* Reference Grounding citations if present */}
                                        {!isUser && msg.references && msg.references.length > 0 && (
                                          <div className="mt-4 pt-3 border-t border-slate-800">
                                            <div className="flex items-center space-x-1.5 text-xs text-slate-400 font-semibold mb-2">
                                              <Info className="w-3.5 h-3.5 text-indigo-400" />
                                              <span>Retrieval Grounding Sources:</span>
                                            </div>
                                            <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                                              {msg.references.map((ref, rIdx) => (
                                                <details key={rIdx} className="group border border-slate-800 bg-slate-900/60 rounded-xl">
                                                  <summary className="list-none flex items-center justify-between p-2.5 text-xs font-semibold text-slate-300 hover:text-white cursor-pointer select-none">
                                                    <span className="flex items-center">
                                                      <FileText className="w-3.5 h-3.5 text-indigo-400 mr-2 shrink-0" />
                                                      <span>Source #{rIdx + 1} (Page {ref.pageNumber})</span>
                                                    </span>
                                                    <span className="flex items-center space-x-2">
                                                      <span className="bg-indigo-500/10 text-indigo-400 text-[10px] font-mono px-2 py-0.5 rounded-full border border-indigo-500/20">
                                                        Score: {(ref.score * 100).toFixed(1)}%
                                                      </span>
                                                      <ChevronDown className="w-3 h-3 group-open:rotate-180 transition-transform text-slate-500" />
                                                    </span>
                                                  </summary>
                                                  <div className="p-3 pt-0 text-xs text-slate-400 leading-relaxed whitespace-pre-line border-t border-slate-800/40 italic bg-slate-950/20 font-serif">
                                                    "{ref.text}"
                                                  </div>
                                                </details>
                                              ))}
                                            </div>
                                          </div>
                                        )}

                                        {/* Search Metadata - Advanced RAG Info */}
                                        {!isUser && msg.searchMetadata && (
                                          <div className="mt-3 pt-3 border-t border-slate-800/60">
                                            <div className="flex items-center space-x-2 text-[10px] text-slate-500 font-mono">
                                              <Database className="w-3 h-3 text-emerald-400" />
                                              <span>Semantic Search: {msg.searchMetadata.chunksRetrieved}/{msg.searchMetadata.totalRelevantChunks} chunks • {msg.searchMetadata.contextTokens} tokens</span>
                                            </div>
                                          </div>
                                        )}
                                      </div>
                                      <p className="text-[9px] text-slate-500 font-mono text-right capitalize px-1">
                                        {isUser ? "Student" : msg.agentName || "RAG Agent"} • {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                      </p>
                                    </div>
                                  </div>
                                );
                              })
                            )}

                            {chatLoading && (
                              <div className="flex max-w-2xl items-center space-x-3 mr-auto">
                                <div className="w-8 h-8 rounded-lg bg-slate-950 border border-slate-800 text-indigo-400 font-bold flex items-center justify-center text-sm animate-pulse">
                                  ...
                                </div>
                                <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4 text-xs font-mono text-indigo-400 animate-pulse flex items-center space-x-2">
                                  <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-500" />
                                  <span>{selectedAgent === "RetrievalAgent" ? "Retrieval Agent is examining cosine vector records..." : "  is synthesizing textbook response..."}</span>
                                </div>
                              </div>
                            )}
                            <div ref={chatBottomRef} />
                          </div>

                          {/* Chat Input Bar */}
                          <div className="p-4 bg-slate-950 border-t border-slate-800 shrink-0">
                            <form onSubmit={handleSendMessage} className="max-w-4xl mx-auto flex items-center space-x-2">
                              <input
                                type="text"
                                className="flex-1 bg-slate-900 border border-slate-800 rounded-xl px-4 py-3 text-slate-100 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none transition-all"
                                placeholder={`Ask the AI dynamic questions about "${activeCourse.title}"...`}
                                value={inputValue}
                                onChange={(e) => setInputValue(e.target.value)}
                                disabled={chatLoading}
                                id="chat_input"
                              />
                              <button
                                type="submit"
                                className="bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl p-3 shadow-lg shadow-indigo-600/10 active:scale-95 transition-all cursor-pointer"
                                disabled={!inputValue.trim() || chatLoading}
                                id="send_msg_btn"
                              >
                                <Send className="w-4.5 h-4.5" />
                              </button>
                            </form>
                          </div>
                        </motion.div>
                      )}

                      {/* TAB 2: CHAPTER STUDY GUIDE & COURSE SUMMARIES */}
                      {activeTab === "summary" && (
                        <motion.div
                          key="summary-panel"
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -10 }}
                          className="absolute inset-0 overflow-y-auto p-6"
                          id="summary_panel"
                        >
                          {!activeCourse.summary ? (
                            <div className="max-w-md mx-auto text-center py-20 space-y-6">
                              <div className="inline-flex bg-violet-500/10 p-5 rounded-3xl text-violet-400 border border-violet-500/20">
                                <FileText className="w-10 h-10" />
                              </div>
                              <div>
                                <h3 className="text-lg font-bold text-white mb-2">Syllabus Summary Agent</h3>
                                <p className="text-xs text-slate-400 leading-relaxed">
                                  Command the Summary Agent to compile textbook chapters outline and build flashcard concept definitions dynamically using  .
                                </p>
                              </div>

                              <button
                                onClick={() => handleGenerateSummary(activeCourse.id)}
                                className="bg-indigo-600 hover:bg-indigo-500 text-white px-6 py-3 rounded-xl text-xs font-semibold shadow-lg hover:shadow-indigo-600/20 active:translate-y-[1px] transition-all flex items-center justify-center space-x-2 mx-auto cursor-pointer"
                                disabled={summaryLoading}
                                id="generate_summary_btn"
                              >
                                {summaryLoading ? (
                                  <>
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                    <span>Compiling Chapters Study Guide...</span>
                                  </>
                                ) : (
                                  <>
                                    <Sparkles className="w-4 h-4 text-amber-300 animate-pulse" />
                                    <span>Trigger Summary Agent</span>
                                  </>
                                )}
                              </button>
                            </div>
                          ) : (
                            <div className="max-w-4xl mx-auto space-y-8 animate-fade-in text-left">
                              {/* Summary Core Overview */}
                              <div className="bg-slate-950 border border-slate-800 p-6 rounded-2xl relative overflow-hidden">
                                <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/5 rounded-full blur-2xl" />
                                <div className="flex items-center space-x-2.5 text-xs text-indigo-400 font-semibold mb-2">
                                  <Info className="w-4 h-4 text-indigo-500" />
                                  <span>COURSE COMPACT OVERVIEW</span>
                                </div>
                                <h3 className="text-lg font-bold text-white mb-3">Study Companion Abstract</h3>
                                <p className="text-sm text-slate-300 leading-relaxed font-serif italic">
                                  "{activeCourse.summary.overview}"
                                </p>
                              </div>

                              {/* Chapters Broken Down */}
                              <div className="space-y-4">
                                <h3 className="text-sm uppercase font-bold text-slate-400 tracking-wider flex items-center space-x-2 font-mono">
                                  <ListChecks className="w-4 h-4 text-indigo-400" />
                                  <span>Chapter Outlines Compiled by Agent:</span>
                                </h3>

                                <div className="grid md:grid-cols-2 gap-4">
                                  {activeCourse.summary.chapters.map((ch, idx) => (
                                    <div key={idx} className="bg-slate-950 border border-slate-800 p-5 rounded-2xl flex flex-col justify-between">
                                      <div className="space-y-3">
                                        <div className="flex items-center justify-between">
                                          <h4 className="text-sm font-bold text-white truncate max-w-[200px] uppercase">
                                            {ch.title}
                                          </h4>
                                          <span className="bg-slate-900 border border-slate-800 px-2.5 py-0.5 rounded-full text-[10px] font-medium text-slate-400">
                                            Chapter {idx + 1}
                                          </span>
                                        </div>
                                        <p className="text-xs text-slate-400 leading-relaxed">
                                          {ch.summary}
                                        </p>
                                      </div>

                                      <div className="mt-4 pt-3 border-t border-slate-900">
                                        <span className="text-[10px] font-bold tracking-widest text-indigo-400 uppercase block mb-1.5 font-mono">
                                          Action takeaways:
                                        </span>
                                        <ul className="text-[11px] text-slate-400 space-y-1.5 list-disc list-inside">
                                          {ch.takeaways.map((take, tIdx) => (
                                            <li key={tIdx} className="line-clamp-2">{take}</li>
                                          ))}
                                        </ul>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>

                              {/* Vocabulary Cards */}
                              <div className="space-y-4">
                                <h3 className="text-sm uppercase font-bold text-slate-400 tracking-wider flex items-center space-x-2 font-mono">
                                  <Brain className="w-4 h-4 text-indigo-400" />
                                  <span>Course Vocabulary & Key Concepts:</span>
                                </h3>

                                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                                  {activeCourse.summary.keyConcepts.map((concept, idx) => (
                                    <div key={idx} className="bg-slate-950 border border-slate-800/80 p-4 rounded-xl hover:border-slate-700 transition-colors">
                                      <h5 className="font-bold text-xs text-indigo-400 uppercase tracking-tight mb-1">
                                        {concept.term}
                                      </h5>
                                      <p className="text-xs text-slate-400 leading-normal">
                                        {concept.definition}
                                      </p>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            </div>
                          )}
                        </motion.div>
                      )}

                      {/* TAB 3: QUIZ ASSESSMENT FOR LEARNING COMPREHENSION */}
                      {activeTab === "quiz" && (
                        <motion.div
                          key="quiz-panel"
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -10 }}
                          className="absolute inset-0 overflow-y-auto p-6"
                          id="quiz_panel"
                        >
                          {!activeCourse?.quiz ? (
                            <div className="max-w-md mx-auto text-center py-20 space-y-6">
                              <div className="inline-flex bg-indigo-500/10 p-5 rounded-3xl text-indigo-400 border border-indigo-500/20">
                                <Award className="w-10 h-10" />
                              </div>
                              <div>
                                <h3 className="text-lg font-bold text-white mb-2">Syllabus Quiz Agent</h3>
                                <p className="text-xs text-slate-400 leading-relaxed">
                                  Challenge your study progress by requesting the Quiz Agent to extract concepts from text segments to build an interactive college MCQ test.
                                </p>
                              </div>

                              <button
                                onClick={() => handleGenerateQuiz(activeCourse.id)}
                                className="bg-indigo-600 hover:bg-indigo-500 text-white px-6 py-3 rounded-xl text-xs font-semibold shadow-lg hover:shadow-indigo-600/20 active:translate-y-[1px] transition-all flex items-center justify-center space-x-2 mx-auto cursor-pointer"
                                disabled={quizLoading}
                                id="generate_quiz_btn"
                              >
                                {quizLoading ? (
                                  <>
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                    <span>Generating Assessment Questions...</span>
                                  </>
                                ) : (
                                  <>
                                    <Plus className="w-4 h-4" />
                                    <span>Generate Quiz Agent Assessment</span>
                                  </>
                                )}
                              </button>
                            </div>
                          ) : (
                            <div className="max-w-3xl mx-auto space-y-6 text-left pb-12">
                              {/* Quiz Stats Overview */}
                              <div className="bg-slate-950 border border-slate-800 p-5 rounded-2xl flex flex-col sm:flex-row items-center justify-between gap-4">
                                <div>
                                  <p className="text-xs text-indigo-400 font-semibold uppercase">ACTIVE TEST CHALLENGE</p>
                                  <h3 className="text-sm font-bold text-white mt-0.5">{currentQuiz.title}</h3>
                                </div>
                                
                                <div className="flex items-center space-x-3 text-xs">
                                  <button
                                    onClick={() => handleGenerateQuiz(activeCourse.id)}
                                    className="bg-slate-900 border border-slate-800 hover:border-slate-700 text-slate-400 hover:text-white px-3 py-1.5 rounded-lg flex items-center space-x-1.5 font-semibold transition-colors cursor-pointer"
                                    disabled={quizLoading}
                                    id="quiz_rebuild_btn"
                                  >
                                    <RefreshCw className="w-3.5 h-3.5" />
                                    <span>Remix Quiz Questions</span>
                                  </button>
                                </div>
                              </div>

                              <div className="space-y-4">
                                {activeCourse.quiz.questions.map((q, idx) => {
                                  const selectedOption = quizAnswers[q.id];
                                  const isCorrect = selectedOption === q.correctAnswerIndex;
                                  
                                  return (
                                    <div key={q.id} className="bg-slate-950 border border-slate-800 p-6 rounded-2xl space-y-4">
                                      <div className="flex items-start space-x-3">
                                        <span className="bg-slate-900 border border-slate-800 w-6 h-6 rounded-md text-[10px] font-bold flex items-center justify-center text-indigo-400 font-mono mt-0.5">
                                          Q{idx + 1}
                                        </span>
                                        <h4 className="text-sm font-semibold text-slate-100 flex-1 leading-relaxed">
                                          {q.question}
                                        </h4>
                                      </div>

                                      {/* Options Panel List */}
                                      <div className="grid gap-2.5 pl-9">
                                        {q.options.map((option, optIdx) => {
                                          const isSelected = selectedOption === optIdx;
                                          let btnStyle = "bg-slate-905 hover:bg-slate-900 text-slate-300 border-slate-800";
                                          
                                          if (isSelected) {
                                            btnStyle = "bg-indigo-600/10 border-indigo-500 text-indigo-300 font-medium";
                                          }

                                          // After submit show correct and incorrect highlights
                                          if (quizSubmitted) {
                                            if (optIdx === q.correctAnswerIndex) {
                                              btnStyle = "bg-emerald-500/10 border-emerald-500 text-emerald-300 font-bold";
                                            } else if (isSelected && !isCorrect) {
                                              btnStyle = "bg-rose-500/10 border-rose-500 text-rose-300";
                                            } else {
                                              btnStyle = "bg-slate-950 text-slate-500 border-slate-900 pointer-events-none opacity-50";
                                            }
                                          }

                                          return (
                                            <button
                                              key={optIdx}
                                              onClick={() => handleSelectQuizOption(q.id, optIdx)}
                                              className={`w-full text-left px-4.5 py-3 rounded-xl border text-xs leading-normal transition-all outline-none text-left flex items-center justify-between ${btnStyle}`}
                                              disabled={quizSubmitted}
                                            >
                                              <span>{option}</span>
                                              {/* Check indicators on submitted values */}
                                              {quizSubmitted && optIdx === q.correctAnswerIndex && (
                                                <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 ml-2" />
                                              )}
                                              {quizSubmitted && isSelected && !isCorrect && (
                                                <XCircle className="w-4 h-4 text-rose-500 shrink-0 ml-2" />
                                              )}
                                            </button>
                                          );
                                        })}
                                      </div>

                                      {/* Question explanation feedback */}
                                      {quizSubmitted && (
                                        <div className="pl-9 animate-slide-down">
                                          <div className={`p-4 rounded-xl text-xs leading-relaxed border flex items-start space-x-2 ${
                                            isCorrect 
                                              ? "bg-emerald-500/5 border-emerald-500/20 text-emerald-300"
                                              : "bg-rose-500/5 border-rose-500/20 text-slate-300"
                                          }`}>
                                            <HelpCircle className="w-4 h-4 text-indigo-400 shrink-0 mt-0.5" />
                                            <div>
                                              <p className="font-bold flex items-center">
                                                {isCorrect ? "Correct Solution!" : "Incorrect Answer"}
                                              </p>
                                              <p className="mt-1 font-serif">{q.explanation}</p>
                                            </div>
                                          </div>
                                        </div>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>

                              {/* Submission Bar */}
                              {!quizSubmitted ? (
                                <div className="text-center pt-4">
                                  <button
                                    onClick={() => handleSubmitQuiz(activeCourse.quiz.id)}
                                    className="bg-emerald-600 hover:bg-emerald-500 text-white px-8 py-3.5 rounded-xl text-xs font-semibold shadow-lg hover:shadow-emerald-600/20 active:translate-y-[1px] transition-all cursor-pointer"
                                    disabled={quizLoading}
                                    id="submit_quiz_btn"
                                  >
                                    Submit Test Assessment
                                  </button>
                                </div>
                              ) : (
                                <div className="p-6 bg-slate-950 border border-slate-800 rounded-2xl flex flex-col md:flex-row items-center justify-between gap-6 animate-fade-in">
                                  <div>
                                    <h4 className="text-base font-bold text-white">Quiz Attempt Completed!</h4>
                                    <p className="text-xs text-slate-400 mt-1">Grade details successfully registered in student database records.</p>
                                  </div>

                                  <div className="flex items-center space-x-5">
                                    <div className="text-center font-mono">
                                      <p className="text-[10px] text-slate-400 tracking-wider">SCORE</p>
                                      <p className="text-2xl font-bold text-white">
                                        {submittedAttempt?.score} <span className="text-slate-500">/</span> {submittedAttempt?.total}
                                      </p>
                                    </div>
                                    <div className="text-center font-mono">
                                      <p className="text-[10px] text-slate-400 tracking-wider">ACCURACY</p>
                                      <p className={`text-2xl font-bold ${
                                        (submittedAttempt?.score || 0) >= 3 ? "text-emerald-400" : "text-rose-400"
                                      }`}>
                                        {submittedAttempt ? Math.round((submittedAttempt.score / submittedAttempt.total) * 100) : 0}%
                                      </p>
                                    </div>

                                    <button
                                      onClick={() => handleGenerateQuiz(activeCourse.id)}
                                      className="bg-indigo-600 hover:bg-indigo-500 text-white px-5 py-2.5 rounded-xl text-xs font-semibold shadow-lg cursor-pointer transition-colors"
                                    >
                                      New Assessment
                                    </button>
                                  </div>
                                </div>
                              )}
                            </div>
                          )}
                        </motion.div>
                      )}

                    </AnimatePresence>
                  </div>
                </>
              ) : (
                /* NO ACTIVE COGNITIVE FILE SELECTED */
                <div className="flex-1 flex flex-col items-center justify-center p-6 text-center max-w-lg mx-auto space-y-6">
                  <div className="bg-gradient-to-tr from-indigo-600/10 to-violet-500/10 p-6 rounded-3xl border border-indigo-540 border-indigo-500/20 text-indigo-400">
                    <Brain className="w-12 h-12" />
                  </div>
                  
                  <div>
                    <h3 className="text-lg font-bold text-white">Active Student Learning Dashboard</h3>
                    <p className="text-sm text-slate-400 mt-2 leading-relaxed">
                      Select any uploaded textbook in the left registry panel to access standard RAG chat, chapter summary agent tools, and interactive multiple-choice study assessments.
                    </p>
                  </div>

                  <div className="border border-slate-800 bg-slate-950 p-5 rounded-2xl max-w-md w-full">
                    <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest text-left mb-2.5 font-mono">
                      Student Dashboard Activity Logs
                    </h4>
                    <div className="space-y-2 text-left text-xs text-slate-400">
                      <div className="flex items-center justify-between">
                        <span>Total Text Books:</span>
                        <span className="font-semibold text-white font-mono">{stats.totalCourses}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span>Linguistic database chunks:</span>
                        <span className="font-semibold text-white font-mono">{stats.totalChunks}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span>Average Grade Score:</span>
                        <span className="font-semibold text-emerald-400 font-mono">{stats.avgQuizScore}%</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </section>

          </div>
        )}
      </main>
    </div>
  );
}
