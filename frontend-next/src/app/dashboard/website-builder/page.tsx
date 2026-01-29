'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  Globe, Send, FolderOpen, File, ChevronRight, ChevronDown,
  Code, Eye, Download, Trash2, Loader2, X, Image as ImageIcon,
  Sparkles, FileCode, FileJson, FileText, Folder, Clock,
  RefreshCw, ExternalLink, Mic, MicOff
} from 'lucide-react';

const API_BASE = 'http://localhost:3001/api';

interface Model { id: string; name: string; isDefault?: boolean; }
interface ProjectFile { path: string; content: string; name?: string; isFile?: boolean; }
interface Project { id: string; name: string; files?: ProjectFile[]; messages?: Message[]; }
interface Message { role: 'user' | 'assistant'; content: string; image?: string; }

const getFileIcon = (path: string) => {
  if (path.endsWith('.jsx') || path.endsWith('.tsx')) return FileCode;
  if (path.endsWith('.js') || path.endsWith('.ts')) return FileCode;
  if (path.endsWith('.json')) return FileJson;
  if (path.endsWith('.css') || path.endsWith('.html')) return FileText;
  return File;
};

// Typewriter effect component for code simulation
const TypewriterText = ({ texts }: { texts: string[] }) => {
  const [currentText, setCurrentText] = useState('');
  const [textIndex, setTextIndex] = useState(0);
  
  useEffect(() => {
    const text = texts[textIndex % texts.length];
    let charIndex = 0;
    const interval = setInterval(() => {
      setCurrentText(text.slice(0, charIndex + 1));
      charIndex++;
      if (charIndex >= text.length) {
        clearInterval(interval);
        setTimeout(() => {
          setTextIndex(i => i + 1);
          setCurrentText('');
        }, 500);
      }
    }, 40);
    return () => clearInterval(interval);
  }, [textIndex, texts]);
  
  return <div>{currentText}<span className="animate-pulse">|</span></div>;
};

export default function WebsiteBuilderPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const projectId = searchParams.get('project');
  
  const [projects, setProjects] = useState<Project[]>([]);
  const [currentProject, setCurrentProject] = useState<Project | null>(null);
  const [files, setFiles] = useState<ProjectFile[]>([]);
  const [selectedFile, setSelectedFile] = useState<ProjectFile | null>(null);
  const [prompt, setPrompt] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [streamingMessage, setStreamingMessage] = useState('');
  const [selectedModel, setSelectedModel] = useState('anthropic/claude-opus-4.5');
  const [models, setModels] = useState<Model[]>([]);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set(['src', 'src/components']));
  const [activeTab, setActiveTab] = useState<'preview' | 'code'>('preview');
  const [previewKey, setPreviewKey] = useState(0);
  const [previewReady, setPreviewReady] = useState(false);
  const [buildPhase, setBuildPhase] = useState<'thinking' | 'planning' | 'coding' | 'done' | ''>('');
  const [referenceImage, setReferenceImage] = useState<string | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [user, setUser] = useState<{ id: string; credits: number } | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{ id: string; name: string } | null>(null);
  
  const chatEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const getAuthHeaders = () => ({ headers: { Authorization: `Bearer ${localStorage.getItem('userToken')}` } });

  useEffect(() => {
    const token = localStorage.getItem('userToken');
    if (token) {
      fetch(`${API_BASE}/auth/me`, { headers: { Authorization: `Bearer ${token}` } })
        .then(r => r.json()).then(d => { if (d.id) setUser(d); }).catch(() => {});
    }
  }, []);

  useEffect(() => {
    fetch(`${API_BASE}/website-builder/models`).then(r => r.json())
      .then(d => { setModels(d); const def = d.find((m: Model) => m.isDefault) || d[0]; if (def) setSelectedModel(def.id); })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!user) return;
    fetch(`${API_BASE}/website-builder/projects`, getAuthHeaders()).then(r => r.json()).then(setProjects).catch(() => {});
  }, [user]);

  // Load project from URL only (not from localStorage on home page)
  useEffect(() => {
    if (!user) return;
    
    if (projectId) {
      // Only load from URL - don't auto-load from localStorage
      loadProject(projectId);
    }
  }, [projectId, user]);

  const loadProject = async (id: string) => {
    try {
      const res = await fetch(`${API_BASE}/website-builder/projects/${id}`, getAuthHeaders());
      const data = await res.json();
      setCurrentProject(data);
      setFiles(data.files || []);
      setMessages(data.messages || []);
      setPreviewReady(data.files?.some((f: ProjectFile) => f.path === 'src/App.jsx'));
      const appFile = data.files?.find((f: ProjectFile) => f.path === 'src/App.jsx');
      if (appFile) setSelectedFile(appFile);
      
      // Check if generation was interrupted (stored in localStorage)
      const interruptedGen = localStorage.getItem('websiteBuilder_generating');
      if (interruptedGen === id) {
        // Generation was interrupted, inform user
        setMessages(prev => [...prev, { 
          role: 'assistant', 
          content: '⚠️ Previous generation was interrupted. Please send your prompt again to continue building.'
        }]);
        localStorage.removeItem('websiteBuilder_generating');
      }
    } catch {}
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => setReferenceImage(e.target?.result as string);
      reader.readAsDataURL(file);
    }
  };

  const handleGenerate = async () => {
    if (!prompt.trim() || isGenerating || !user) return;
    
    const isFollowUp = previewReady; // Capture if this is a follow-up generation
    setIsGenerating(true);
    setStreamingMessage('Analyzing your request...');
    setBuildPhase('thinking');
    // Don't reset previewReady for follow-up generations - keep showing the preview
    if (!isFollowUp) setPreviewReady(false);
    
    let proj = currentProject;
    
    if (!proj) {
      try {
        const res = await fetch(`${API_BASE}/website-builder/projects`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('userToken')}` },
          body: JSON.stringify({ name: prompt.slice(0, 40).split(' ').slice(0, 5).join(' ') || 'My Website', framework: 'vite-react' })
        });
        const data = await res.json();
        proj = data;
        setCurrentProject(data);
        setFiles(data.files || []);
        setProjects(p => [data, ...p]);
        router.push(`/dashboard/website-builder?project=${data.id}`);
      } catch {
        setIsGenerating(false);
        setBuildPhase('');
        return;
      }
    }
    
    const userMsg: Message = { role: 'user', content: prompt, image: referenceImage || undefined };
    setMessages(prev => [...prev, userMsg]);
    const userPrompt = prompt;
    setPrompt('');
    setReferenceImage(null);
    
    // Track generation in localStorage so we can detect interruptions
    localStorage.setItem('websiteBuilder_generating', proj!.id);
    
    try {
      const response = await fetch(`${API_BASE}/website-builder/projects/${proj!.id}/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('userToken')}` },
        body: JSON.stringify({ prompt: userPrompt, modelId: selectedModel })
      });
      
      const reader = response.body?.getReader();
      if (!reader) throw new Error('No reader');
      
      const decoder = new TextDecoder();
      let fullContent = '';
      let hasFileChanges = false;
      let finalCreditsUsed = 0;
      let finalCostBreakdown: any = null;
      const allFileChanges: { path: string; content: string }[] = [];
      
      // Only show phase animations for first generation (use captured isFollowUp)
      if (!isFollowUp) {
        setTimeout(() => setBuildPhase('planning'), 1000);
        setTimeout(() => setBuildPhase('coding'), 3000);
      } else {
        setBuildPhase('coding'); // Skip to coding for follow-ups
      }
      
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        const chunk = decoder.decode(value);
        const lines = chunk.split('\n').filter(l => l.startsWith('data: '));
        
        for (const line of lines) {
          const data = line.slice(6);
          if (data === '[DONE]') continue;
          
          try {
            const parsed = JSON.parse(data);
            if (parsed.content) {
              fullContent += parsed.content;
              
              // Extract thinking block content for display
              const completeThinking = fullContent.match(/<thinking>([\s\S]*?)<\/thinking>/);
              const partialThinking = fullContent.match(/<thinking>([\s\S]*)$/);
              
              if (completeThinking) {
                // Thinking complete, now coding - clear streaming message
                setBuildPhase('coding');
                setStreamingMessage(''); // Don't show anything in chat during coding
              } else if (partialThinking && fullContent.includes('<thinking>')) {
                // Still in thinking phase - show thinking content
                const thinkingContent = partialThinking[1].trim();
                setStreamingMessage(thinkingContent || 'Analyzing your request...');
                setBuildPhase('thinking');
              } else if (!fullContent.includes('<')) {
                // No tags yet - AI still starting
                const cleaned = fullContent.trim();
                if (cleaned) {
                  setStreamingMessage(cleaned);
                  setBuildPhase('thinking');
                }
              }
            }
            if (parsed.fileChanges?.length) {
              hasFileChanges = true;
              // Track the file changes for summary
              for (const change of parsed.fileChanges) {
                allFileChanges.push(change);
              }
              finalCreditsUsed = parsed.creditsUsed || 0;
              finalCostBreakdown = parsed.costBreakdown || null;
              setBuildPhase('done');
              const newFiles = [...files];
              for (const change of parsed.fileChanges) {
                const idx = newFiles.findIndex(f => f.path === change.path);
                if (idx >= 0) newFiles[idx] = { ...newFiles[idx], content: change.content };
                else newFiles.push({ path: change.path, content: change.content });
              }
              setFiles(newFiles);
              setPreviewKey(k => k + 1);
              setPreviewReady(true);
              const appFile = newFiles.find(f => f.path === 'src/App.jsx');
              if (appFile) setSelectedFile(appFile);
            }
            if (parsed.creditsUsed) {
              finalCreditsUsed = parsed.creditsUsed;
            }
          } catch {}
        }
      }
      
      // Extract thinking content for summary
      const thinkingMatch = fullContent.match(/<thinking>([\s\S]*?)<\/thinking>/);
      const thinkingContent = thinkingMatch ? thinkingMatch[1].trim() : '';
      
      // Build cost info string
      const costInfo = finalCreditsUsed > 0 
        ? ` • ${finalCreditsUsed.toFixed(2)} credits` 
        : '';
      
      let summary = '';
      if (hasFileChanges && allFileChanges.length > 0) {
        // Count components from the actual file changes
        const componentFiles = allFileChanges.filter(f => f.path.startsWith('src/components/'));
        const otherFiles = allFileChanges.filter(f => !f.path.startsWith('src/components/'));
        
        // Build a descriptive summary
        const parts: string[] = [];
        if (componentFiles.length > 0) {
          const names = componentFiles.map(f => f.path.split('/').pop()?.replace('.jsx', '').replace('.tsx', '')).slice(0, 3);
          parts.push(`${componentFiles.length} component${componentFiles.length !== 1 ? 's' : ''} (${names.join(', ')}${componentFiles.length > 3 ? '...' : ''})`);
        }
        if (otherFiles.length > 0) {
          parts.push(`${otherFiles.length} file${otherFiles.length !== 1 ? 's' : ''}`);
        }
        summary = `✅ Updated ${parts.join(' and ')}${costInfo}`;
      } else {
        summary = thinkingContent.slice(0, 150) || 'Generation complete.';
        if (thinkingContent.length > 150) summary += '...';
        if (costInfo) summary += costInfo;
      }
      
      setMessages(prev => [...prev, { role: 'assistant', content: summary }]);
      setStreamingMessage('');
      localStorage.removeItem('websiteBuilder_generating');
    } catch (err) {
      console.error('Generation error:', err);
      setMessages(prev => [...prev, { role: 'assistant', content: '❌ Generation failed. Please try again.' }]);
      localStorage.removeItem('websiteBuilder_generating');
    } finally {
      setIsGenerating(false);
      setBuildPhase('done');
    }
  };

  const handleDownload = async () => {
    if (!currentProject) return;
    const res = await fetch(`${API_BASE}/website-builder/projects/${currentProject.id}/download`, getAuthHeaders());
    const data = await res.json();
    const JSZip = (await import('jszip')).default;
    const zip = new JSZip();
    for (const f of data.files) zip.file(f.path, f.content);
    const blob = await zip.generateAsync({ type: 'blob' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${data.projectName}.zip`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Show delete confirmation modal
  const confirmDelete = (id: string, name: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setDeleteConfirm({ id, name });
  };

  // Actually delete the project after confirmation
  const deleteProject = async (id: string) => {
    await fetch(`${API_BASE}/website-builder/projects/${id}`, { method: 'DELETE', ...getAuthHeaders() });
    setProjects(p => p.filter(x => x.id !== id));
    if (currentProject?.id === id) {
      setCurrentProject(null);
      setFiles([]);
      setMessages([]);
      localStorage.removeItem('websiteBuilder_activeProject');
      router.push('/dashboard/website-builder');
    }
    setDeleteConfirm(null);
  };

  const buildFileTree = (fileList: ProjectFile[]): Record<string, any> => {
    const tree: Record<string, any> = {};
    for (const file of fileList) {
      const parts = file.path.split('/');
      let current = tree;
      for (let i = 0; i < parts.length; i++) {
        const part = parts[i];
        if (i === parts.length - 1) current[part] = { ...file, name: part, isFile: true };
        else { if (!current[part]) current[part] = { name: part, isFile: false, children: {} }; current = current[part].children; }
      }
    }
    return tree;
  };

  const renderFileTree = (tree: Record<string, any>, path = ''): React.ReactNode => {
    return Object.entries(tree)
      .sort(([, a]: any, [, b]: any) => (a.isFile === b.isFile ? a.name.localeCompare(b.name) : a.isFile ? 1 : -1))
      .map(([name, item]: [string, any]) => {
        const fullPath = path ? `${path}/${name}` : name;
        if (item.isFile) {
          const Icon = getFileIcon(item.path);
          return (
            <button key={fullPath} onClick={() => setSelectedFile(item)} className={`w-full flex items-center gap-2 px-2 py-1 text-xs rounded hover:bg-gray-700/50 ${selectedFile?.path === item.path ? 'bg-gray-700/50 text-cyan-400' : 'text-gray-400'}`}>
              <Icon className="w-3 h-3" /><span className="truncate">{name}</span>
            </button>
          );
        }
        const isExpanded = expandedFolders.has(fullPath);
        return (
          <div key={fullPath}>
            <button onClick={() => { const n = new Set(expandedFolders); isExpanded ? n.delete(fullPath) : n.add(fullPath); setExpandedFolders(n); }} className="w-full flex items-center gap-1 px-2 py-1 text-xs text-gray-400 rounded hover:bg-gray-700/50">
              {isExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
              <Folder className="w-3 h-3 text-cyan-400" /><span>{name}</span>
            </button>
            {isExpanded && <div className="ml-3">{renderFileTree(item.children, fullPath)}</div>}
          </div>
        );
      });
  };

  // Helper to remove all import statements
  const removeImports = (code: string): string => {
    return code
      .replace(/^import\s+[\s\S]*?from\s+['"][^'"]*['"];?\s*$/gm, '')
      .replace(/^import\s+\w+\s+from\s+['"][^'"]*['"];?\s*$/gm, '')
      .replace(/^import\s+['"][^'"]*['"];?\s*$/gm, '')
      .replace(/^\s*[\r\n]/gm, '\n');
  };

  // Helper to convert exports to declarations
  const convertExports = (code: string): string => {
    return code
      .replace(/export\s+default\s+function\s+(\w+)/g, 'function $1')
      .replace(/^export\s+default\s+\w+;?\s*$/gm, '')
      .replace(/^export\s+\{[^}]*\};?\s*$/gm, '')
      .replace(/^export\s+const\s+/gm, 'const ')
      .replace(/^export\s+function\s+/gm, 'function ');
  };

  // shadcn/ui CSS variables
  const shadcnStyles = `
    :root {
      --background: 0 0% 100%;
      --foreground: 222.2 84% 4.9%;
      --card: 0 0% 100%;
      --card-foreground: 222.2 84% 4.9%;
      --primary: 222.2 47.4% 11.2%;
      --primary-foreground: 210 40% 98%;
      --secondary: 210 40% 96.1%;
      --secondary-foreground: 222.2 47.4% 11.2%;
      --muted: 210 40% 96.1%;
      --muted-foreground: 215.4 16.3% 46.9%;
      --accent: 210 40% 96.1%;
      --accent-foreground: 222.2 47.4% 11.2%;
      --destructive: 0 84.2% 60.2%;
      --destructive-foreground: 210 40% 98%;
      --border: 214.3 31.8% 91.4%;
      --input: 214.3 31.8% 91.4%;
      --ring: 222.2 84% 4.9%;
      --radius: 0.5rem;
    }
    * { box-sizing: border-box; border-color: hsl(var(--border)); }
    body { margin: 0; font-family: system-ui, -apple-system, sans-serif; background-color: hsl(var(--background)); color: hsl(var(--foreground)); }
  `;

  const generatePreviewHtml = useCallback(() => {
    if (files.length === 0) return '';
    
    const appJsx = files.find(f => f.path === 'src/App.jsx')?.content || '';
    const indexCss = files.find(f => f.path === 'src/index.css')?.content || '';
    
    const componentFiles = files
      .filter(f => f.path.startsWith('src/components/') && f.path.endsWith('.jsx'))
      .sort((a, b) => a.path.localeCompare(b.path));
    
    const componentCode = componentFiles.map(f => {
      const name = f.path.split('/').pop()?.replace('.jsx', '') || '';
      let code = f.content || '';
      code = removeImports(code);
      code = convertExports(code);
      return `// --- ${name} ---\n${code}`;
    });
    
    let appCode = removeImports(appJsx);
    appCode = convertExports(appCode);
    
    const cleanCss = indexCss
      .replace(/@tailwind[^;]+;/g, '')
      .replace(/@import[^;]+;/g, '')
      .replace(/@layer\s+\w+\s*\{[\s\S]*?\}/g, '')
      .replace(/@apply[^;]+;/g, '');
    
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <script src="https://cdn.tailwindcss.com"></script>
  <script>
    tailwind.config = {
      theme: {
        extend: {
          colors: {
            border: "hsl(var(--border))",
            background: "hsl(var(--background))",
            foreground: "hsl(var(--foreground))",
            primary: { DEFAULT: "hsl(var(--primary))", foreground: "hsl(var(--primary-foreground))" },
            secondary: { DEFAULT: "hsl(var(--secondary))", foreground: "hsl(var(--secondary-foreground))" },
            muted: { DEFAULT: "hsl(var(--muted))", foreground: "hsl(var(--muted-foreground))" },
            accent: { DEFAULT: "hsl(var(--accent))", foreground: "hsl(var(--accent-foreground))" },
            card: { DEFAULT: "hsl(var(--card))", foreground: "hsl(var(--card-foreground))" },
          },
          borderRadius: { lg: "var(--radius)", md: "calc(var(--radius) - 2px)", sm: "calc(var(--radius) - 4px)" },
        },
      },
    }
  </script>
  <script src="https://unpkg.com/react@18/umd/react.development.js"></script>
  <script src="https://unpkg.com/react-dom@18/umd/react-dom.development.js"></script>
  <script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>${shadcnStyles}${cleanCss}</style>
</head>
<body>
  <div id="root"></div>
  <div id="error-display" style="display:none;padding:40px;text-align:center;">
    <h2 style="color:#ef4444;margin-bottom:16px;">Preview Error</h2>
    <pre id="error-message" style="background:#fee2e2;padding:16px;border-radius:8px;text-align:left;overflow:auto;max-width:600px;margin:0 auto;"></pre>
  </div>
  <script type="text/babel" data-presets="react">
    const { useState, useEffect, useRef, useCallback, useMemo, useContext, createContext, Fragment } = React;
    const cn = (...classes) => classes.filter(Boolean).join(' ');
    
    class ErrorBoundary extends React.Component {
      constructor(props) { super(props); this.state = { hasError: false, error: null }; }
      static getDerivedStateFromError(error) { return { hasError: true, error }; }
      render() {
        if (this.state.hasError) {
          return React.createElement('div', {style:{padding:'40px',textAlign:'center'}},
            React.createElement('h2', {style:{color:'#ef4444'}}, 'Component Error'),
            React.createElement('pre', {style:{background:'#fee2e2',padding:'16px',borderRadius:'8px'}}, this.state.error?.message)
          );
        }
        return this.props.children;
      }
    }
    
    ${componentCode.join('\n\n')}
    
    ${appCode}
    
    try {
      const root = ReactDOM.createRoot(document.getElementById('root'));
      root.render(React.createElement(ErrorBoundary, null, React.createElement(App)));
    } catch (err) {
      document.getElementById('root').style.display = 'none';
      document.getElementById('error-display').style.display = 'block';
      document.getElementById('error-message').textContent = err.message;
    }
  </script>
  <script>
    window.addEventListener('error', function(e) {
      if (e.message) {
        document.getElementById('root').style.display = 'none';
        document.getElementById('error-display').style.display = 'block';
        document.getElementById('error-message').textContent = e.message;
      }
    });
  </script>
</body>
</html>`;
  }, [files]);

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, streamingMessage]);

  // HOME VIEW
  if (!currentProject) {
    return (
      <div className="min-h-[80vh] flex flex-col items-center justify-center p-8">
        <div className="w-full max-w-2xl">
          <div className="text-center mb-8">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center mx-auto mb-4">
              <Globe className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-3xl font-bold mb-2">Website Builder</h1>
            <p className="text-gray-400">Describe what you want to build</p>
          </div>
          
          <div className="flex justify-center mb-4">
            <select value={selectedModel} onChange={(e) => setSelectedModel(e.target.value)} className="px-4 py-2 bg-gray-800 border border-gray-700 rounded-xl text-sm">
              {models.map(m => <option key={m.id} value={m.id}>{m.name}{m.isDefault ? ' (Default)' : ''}</option>)}
            </select>
          </div>
          
          <div className="bg-gray-800 border border-gray-700 rounded-2xl p-4 mb-6">
            <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="A modern SaaS landing page with pricing, features, testimonials..." className="w-full bg-transparent text-white placeholder:text-gray-500 resize-none focus:outline-none" rows={3} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleGenerate(); } }} />
            
            {referenceImage && (
              <div className="relative inline-block mt-2">
                <img src={referenceImage} alt="Reference" className="h-20 rounded-lg" />
                <button onClick={() => setReferenceImage(null)} className="absolute -top-2 -right-2 p-1 bg-red-500 text-white rounded-full"><X className="w-3 h-3" /></button>
              </div>
            )}
            
            <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-700">
              <div className="flex items-center gap-2">
                <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
                <button onClick={() => fileInputRef.current?.click()} className="p-2 rounded-lg hover:bg-gray-700 text-gray-400 hover:text-cyan-400"><ImageIcon className="w-5 h-5" /></button>
                <button onClick={() => setIsRecording(!isRecording)} className={`p-2 rounded-lg hover:bg-gray-700 ${isRecording ? 'text-red-400' : 'text-gray-400 hover:text-cyan-400'}`}>
                  {isRecording ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
                </button>
              </div>
              <button onClick={handleGenerate} disabled={!prompt.trim() || isGenerating || !user} className="flex items-center gap-2 px-5 py-2 bg-gradient-to-r from-cyan-500 to-blue-600 text-white rounded-xl font-medium disabled:opacity-50">
                {isGenerating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />} Generate
              </button>
            </div>
          </div>
          
          <div className="flex flex-wrap gap-2 justify-center mb-8">
            {['SaaS landing', 'Portfolio', 'E-commerce', 'Blog', 'Dashboard'].map(ex => (
              <button key={ex} onClick={() => setPrompt(ex + ' website')} className="px-3 py-1.5 bg-gray-800 border border-gray-700 rounded-full text-sm text-gray-400 hover:border-cyan-500 hover:text-cyan-400">{ex}</button>
            ))}
          </div>
          
          {projects.length > 0 && (
            <div className="w-full max-w-4xl mx-auto">
              <h3 className="text-sm font-medium text-gray-500 mb-4 flex items-center gap-2"><Clock className="w-4 h-4" /> Your Projects ({projects.length})</h3>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {projects.map((p, idx) => (
                  <div
                    key={p.id}
                    onClick={() => { router.push(`/dashboard/website-builder?project=${p.id}`); loadProject(p.id); }}
                    className="group cursor-pointer bg-gray-800 border border-gray-700 rounded-xl overflow-hidden hover:border-cyan-500/50 hover:shadow-lg hover:shadow-cyan-500/10 transition-all"
                  >
                    {/* Thumbnail Preview */}
                    <div className="aspect-[16/10] bg-gradient-to-br from-gray-800 to-gray-900 relative overflow-hidden">
                      {/* Decorative preview placeholder */}
                      <div className="absolute inset-0 p-3">
                        {/* Fake navbar */}
                        <div className="h-2 bg-gray-700/50 rounded-full w-full mb-2" />
                        {/* Fake hero section */}
                        <div className="flex gap-2 h-[60%]">
                          <div className="flex-1 space-y-1.5">
                            <div className="h-2 bg-cyan-500/30 rounded w-3/4" />
                            <div className="h-1.5 bg-gray-600/50 rounded w-full" />
                            <div className="h-1.5 bg-gray-600/50 rounded w-2/3" />
                            <div className="h-2 bg-cyan-500/20 rounded w-1/3 mt-2" />
                          </div>
                          <div className="w-1/3 bg-gray-700/30 rounded" />
                        </div>
                        {/* Fake sections */}
                        <div className="mt-2 grid grid-cols-3 gap-1">
                          <div className="h-4 bg-gray-700/30 rounded" />
                          <div className="h-4 bg-gray-700/30 rounded" />
                          <div className="h-4 bg-gray-700/30 rounded" />
                        </div>
                      </div>
                      {/* Gradient overlay */}
                      <div className="absolute inset-0 bg-gradient-to-t from-gray-900/80 to-transparent" />
                      {/* Project number badge */}
                      <div className="absolute top-2 left-2 px-1.5 py-0.5 bg-cyan-500/20 rounded text-[10px] text-cyan-400 font-medium">
                        #{idx + 1}
                      </div>
                      {/* Delete button */}
                      <button 
                        onClick={(e) => confirmDelete(p.id, p.name, e)} 
                        className="absolute top-2 right-2 p-1.5 rounded-lg bg-red-500/20 text-red-400 opacity-0 group-hover:opacity-100 hover:bg-red-500/30 transition-opacity"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                      {/* Globe icon */}
                      <div className="absolute bottom-2 right-2 p-1.5 bg-cyan-500/20 rounded-lg">
                        <Globe className="w-4 h-4 text-cyan-400" />
                      </div>
                    </div>
                    {/* Project Info */}
                    <div className="p-3">
                      <p className="font-medium text-sm truncate text-white">{p.name}</p>
                      <p className="text-xs text-gray-500 mt-0.5">Click to continue</p>
                    </div>
                  </div>
                ))}
                
                {/* New Project Card */}
                <div
                  onClick={() => document.querySelector('textarea')?.focus()}
                  className="group cursor-pointer bg-gray-800 border border-dashed border-gray-700 rounded-xl overflow-hidden hover:border-cyan-500/50 transition-all"
                >
                  <div className="aspect-[16/10] flex items-center justify-center bg-gradient-to-br from-gray-800/50 to-gray-900/50">
                    <div className="text-center">
                      <div className="w-10 h-10 rounded-full bg-cyan-500/20 flex items-center justify-center mx-auto mb-2 group-hover:bg-cyan-500/30 transition-colors">
                        <Send className="w-5 h-5 text-cyan-400" />
                      </div>
                      <p className="text-xs text-gray-500">New Project</p>
                    </div>
                  </div>
                  <div className="p-3">
                    <p className="font-medium text-sm text-gray-500">Start building</p>
                    <p className="text-xs text-gray-600 mt-0.5">Enter a prompt above</p>
                  </div>
                </div>
              </div>
            </div>
          )}
          
          {!user && <div className="text-center mt-8"><a href="/auth/login" className="px-6 py-3 bg-gradient-to-r from-cyan-500 to-blue-600 text-white rounded-xl font-medium inline-block">Sign in to start building</a></div>}
        </div>
        
        {/* Delete Confirmation Modal */}
        {deleteConfirm && (
          <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50" onClick={() => setDeleteConfirm(null)}>
            <div onClick={(e) => e.stopPropagation()} className="bg-gray-800 border border-gray-700 rounded-2xl p-6 max-w-md w-full mx-4 shadow-2xl">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-3 bg-red-500/20 rounded-full"><Trash2 className="w-6 h-6 text-red-400" /></div>
                <div>
                  <h3 className="text-lg font-semibold">Delete Project</h3>
                  <p className="text-sm text-gray-400">This action cannot be undone</p>
                </div>
              </div>
              <div className="bg-gray-900 rounded-xl p-4 mb-6">
                <p className="text-sm text-gray-400 mb-1">You are about to delete:</p>
                <p className="font-medium flex items-center gap-2"><Globe className="w-4 h-4 text-cyan-400" />{deleteConfirm.name || 'Untitled Project'}</p>
              </div>
              <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4 mb-6">
                <p className="text-sm text-amber-400"><strong>Warning:</strong> All project files, messages, and generated content will be permanently deleted.</p>
              </div>
              <div className="flex gap-3">
                <button onClick={() => setDeleteConfirm(null)} className="flex-1 px-4 py-2.5 bg-gray-700 hover:bg-gray-600 border border-gray-600 rounded-xl font-medium">Cancel</button>
                <button onClick={() => deleteProject(deleteConfirm.id)} className="flex-1 px-4 py-2.5 bg-red-500 hover:bg-red-600 text-white rounded-xl font-medium">Yes, Delete</button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // PROJECT EDITOR
  return (
    <div className="h-[calc(100vh-80px)] flex overflow-hidden">
      {/* LEFT - Chat */}
      <div className="w-80 border-r border-gray-700 flex flex-col bg-gray-900">
        <div className="p-3 border-b border-gray-700 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button onClick={() => { setCurrentProject(null); setFiles([]); setMessages([]); router.push('/dashboard/website-builder'); }} className="p-1.5 rounded-lg hover:bg-gray-800 text-gray-400" title="Back to home"><ChevronRight className="w-4 h-4 rotate-180" /></button>
            <span className="font-medium truncate text-sm max-w-[120px]">{currentProject?.name}</span>
          </div>
          <div className="flex items-center gap-2">
            <select value={selectedModel} onChange={(e) => setSelectedModel(e.target.value)} className="text-xs px-2 py-1 bg-gray-800 border border-gray-700 rounded-lg">
              {models.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
            <button onClick={() => confirmDelete(currentProject?.id || '', currentProject?.name || '')} className="p-1.5 rounded-lg hover:bg-red-500/20 text-gray-400 hover:text-red-400" title="Delete project"><Trash2 className="w-4 h-4" /></button>
          </div>
        </div>
        
        <div className="flex-1 overflow-auto p-3 space-y-3">
          {messages.length === 0 && !streamingMessage && (
            <div className="text-center text-gray-500 text-sm py-8"><Sparkles className="w-8 h-8 mx-auto mb-2 opacity-50" /><p>Describe what you want</p></div>
          )}
          
          {messages.map((msg, i) => {
            // Clean up message content - remove any code blocks or tags that shouldn't be displayed
            let displayContent = msg.content;
            if (msg.role === 'assistant') {
              // Remove <thinking> blocks
              displayContent = displayContent.replace(/<thinking>[\s\S]*?<\/thinking>/g, '').trim();
              // Remove <file> blocks
              displayContent = displayContent.replace(/<file[\s\S]*?<\/file>/g, '').trim();
              // Remove any remaining XML-like tags
              displayContent = displayContent.replace(/<\/?[a-z][^>]*>/gi, '').trim();
              // If message is too long or looks like code, show a summary
              if (displayContent.length > 500 || displayContent.includes('import ') || displayContent.includes('export ')) {
                displayContent = '✅ Code generated successfully';
              }
              // If empty after cleanup, show default
              if (!displayContent) displayContent = '✅ Done';
            }
            return (
              <div key={i} className={msg.role === 'user' ? 'ml-8' : 'mr-8'}>
                <div className={`p-3 rounded-2xl text-sm ${msg.role === 'user' ? 'bg-cyan-500/20' : 'bg-gray-800'}`}>
                  {msg.image && <img src={msg.image} alt="" className="h-16 rounded-lg mb-2" />}
                  {displayContent}
                </div>
              </div>
            );
          })}
          
          {streamingMessage && (
            <div className="mr-8">
              <div className="p-3 rounded-2xl text-sm bg-gray-800">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
                  <span className="text-xs text-cyan-400">{buildPhase === 'thinking' ? 'Thinking...' : buildPhase === 'planning' ? 'Planning...' : buildPhase === 'coding' ? 'Writing code...' : 'Complete!'}</span>
                </div>
                {streamingMessage}
              </div>
            </div>
          )}
          
          {isGenerating && !streamingMessage && (
            <div className="mr-8"><div className="p-3 rounded-2xl text-sm bg-gray-800 flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin text-cyan-400" /><span className="text-cyan-400">Generating...</span></div></div>
          )}
          
          <div ref={chatEndRef} />
        </div>
        
        <div className="p-3 border-t border-gray-700">
          {referenceImage && (
            <div className="relative inline-block mb-2"><img src={referenceImage} alt="" className="h-12 rounded-lg" /><button onClick={() => setReferenceImage(null)} className="absolute -top-1 -right-1 p-0.5 bg-red-500 text-white rounded-full"><X className="w-3 h-3" /></button></div>
          )}
          <div className="flex items-end gap-2">
            <div className="flex-1 bg-gray-800 border border-gray-700 rounded-xl p-2">
              <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="Describe changes..." className="w-full bg-transparent text-sm resize-none focus:outline-none" rows={2} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleGenerate(); } }} />
              <div className="flex items-center gap-1 mt-1">
                <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
                <button onClick={() => fileInputRef.current?.click()} className="p-1.5 rounded hover:bg-gray-700 text-gray-500"><ImageIcon className="w-4 h-4" /></button>
                <button onClick={() => setIsRecording(!isRecording)} className={`p-1.5 rounded hover:bg-gray-700 ${isRecording ? 'text-red-400' : 'text-gray-500'}`}>{isRecording ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}</button>
              </div>
            </div>
            <button onClick={handleGenerate} disabled={!prompt.trim() || isGenerating} className="p-3 bg-gradient-to-r from-cyan-500 to-blue-600 text-white rounded-xl disabled:opacity-50">
              {isGenerating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            </button>
          </div>
        </div>
      </div>
      
      {/* RIGHT - Preview & Code */}
      <div className="flex-1 flex flex-col min-w-0 bg-gray-900">
        <div className="flex items-center justify-between p-2 border-b border-gray-700 bg-gray-800">
          <div className="flex items-center gap-1">
            <button onClick={() => setActiveTab('preview')} className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium ${activeTab === 'preview' ? 'bg-cyan-500/20 text-cyan-400' : 'text-gray-400'}`}><Eye className="w-4 h-4" /> Preview</button>
            <button onClick={() => setActiveTab('code')} className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium ${activeTab === 'code' ? 'bg-cyan-500/20 text-cyan-400' : 'text-gray-400'}`}><Code className="w-4 h-4" /> Code</button>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setPreviewKey(k => k + 1)} className="p-2 rounded-lg hover:bg-gray-700 text-gray-400"><RefreshCw className="w-4 h-4" /></button>
            <button onClick={handleDownload} className="p-2 rounded-lg hover:bg-gray-700 text-gray-400"><Download className="w-4 h-4" /></button>
            <button onClick={() => window.open('data:text/html,' + encodeURIComponent(generatePreviewHtml()), '_blank')} className="p-2 rounded-lg hover:bg-gray-700 text-gray-400"><ExternalLink className="w-4 h-4" /></button>
          </div>
        </div>
        
        <div className="flex-1 overflow-hidden relative">
          {activeTab === 'preview' ? (
            <>
              {/* Building Animation - Full for first generation */}
              {isGenerating && !previewReady && (
                <div className="absolute inset-0 bg-[#0a0a0f] flex items-center justify-center z-10 overflow-hidden">
                  {/* Animated background grid */}
                  <div className="absolute inset-0 opacity-20">
                    <div className="absolute inset-0" style={{
                      backgroundImage: 'linear-gradient(rgba(6,182,212,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(6,182,212,0.1) 1px, transparent 1px)',
                      backgroundSize: '50px 50px',
                      animation: 'moveGrid 20s linear infinite'
                    }} />
                  </div>
                  
                  {/* Floating code blocks in background */}
                  <div className="absolute inset-0 overflow-hidden pointer-events-none">
                    {[
                      { code: '<Hero />', x: '10%', y: '20%', delay: 0 },
                      { code: 'className="flex"', x: '80%', y: '15%', delay: 1 },
                      { code: 'export default', x: '15%', y: '70%', delay: 2 },
                      { code: '<Button>', x: '75%', y: '75%', delay: 3 },
                      { code: 'useState()', x: '60%', y: '40%', delay: 4 },
                      { code: '<Navbar />', x: '25%', y: '45%', delay: 5 },
                    ].map((item, i) => (
                      <div
                        key={i}
                        className="absolute font-mono text-xs text-cyan-500/30"
                        style={{
                          left: item.x,
                          top: item.y,
                          animation: `float 6s ease-in-out infinite`,
                          animationDelay: `${item.delay}s`
                        }}
                      >
                        {item.code}
                      </div>
                    ))}
                  </div>
                  
                  <div className="text-center max-w-lg px-6 relative z-10">
                    {/* Main visual - Building blocks animation */}
                    <div className="relative w-48 h-48 mx-auto mb-8">
                      {/* Orbiting files */}
                      <div className="absolute inset-0 animate-spin" style={{ animationDuration: '12s' }}>
                        {[
                          { name: 'App.jsx', color: 'from-cyan-400 to-cyan-600', angle: 0 },
                          { name: 'Hero.jsx', color: 'from-blue-400 to-blue-600', angle: 72 },
                          { name: 'Nav.jsx', color: 'from-violet-400 to-violet-600', angle: 144 },
                          { name: 'Footer.jsx', color: 'from-emerald-400 to-emerald-600', angle: 216 },
                          { name: 'styles.css', color: 'from-pink-400 to-pink-600', angle: 288 },
                        ].map((file, i) => (
                          <div
                            key={file.name}
                            className="absolute left-1/2 top-1/2"
                            style={{
                              transform: `rotate(${file.angle}deg) translateY(-70px) rotate(-${file.angle}deg)`,
                              marginLeft: '-28px',
                              marginTop: '-16px',
                            }}
                          >
                            <div 
                              className={`px-2 py-1 rounded-lg bg-gradient-to-r ${file.color} text-white text-[10px] font-medium shadow-lg`}
                              style={{
                                animation: buildPhase === 'coding' ? 'pulse 2s ease-in-out infinite' : 'none',
                                animationDelay: `${i * 0.2}s`
                              }}
                            >
                              {file.name}
                            </div>
                          </div>
                        ))}
                      </div>
                      
                      {/* Center pulsing circle */}
                      <div className="absolute inset-0 flex items-center justify-center">
                        <div className="w-20 h-20 rounded-full bg-gradient-to-br from-cyan-500/20 to-blue-500/20 flex items-center justify-center animate-pulse">
                          <div className="w-14 h-14 rounded-full bg-gradient-to-br from-cyan-500/30 to-blue-500/30 flex items-center justify-center">
                            <Sparkles className="w-7 h-7 text-cyan-400 animate-spin" style={{ animationDuration: '3s' }} />
                          </div>
                        </div>
                      </div>
                    </div>
                    
                    {/* Status text */}
                    <h3 className="text-xl font-semibold text-white mb-2">
                      {buildPhase === 'thinking' && 'Understanding your vision...'}
                      {buildPhase === 'planning' && 'Designing component structure...'}
                      {buildPhase === 'coding' && 'Writing beautiful code...'}
                      {buildPhase === 'done' && 'Almost ready!'}
                    </h3>
                    <p className="text-gray-400 text-sm mb-6">
                      {buildPhase === 'thinking' && 'Analyzing requirements and best practices'}
                      {buildPhase === 'planning' && 'Creating React components and layouts'}
                      {buildPhase === 'coding' && 'Building with Tailwind CSS & shadcn/ui'}
                      {buildPhase === 'done' && 'Finalizing your website'}
                    </p>
                    
                    {/* Progress bar */}
                    <div className="w-full h-1.5 bg-gray-800 rounded-full overflow-hidden mb-4">
                      <div 
                        className="h-full bg-gradient-to-r from-cyan-500 to-blue-500 rounded-full transition-all duration-1000"
                        style={{
                          width: buildPhase === 'thinking' ? '25%' : buildPhase === 'planning' ? '50%' : buildPhase === 'coding' ? '75%' : '100%'
                        }}
                      />
                    </div>
                    
                    {/* Live code preview */}
                    <div className="bg-gray-900/80 backdrop-blur rounded-xl p-4 text-left font-mono text-xs border border-gray-800 shadow-2xl">
                      <div className="flex items-center gap-2 mb-3">
                        <div className="w-2.5 h-2.5 rounded-full bg-red-500" />
                        <div className="w-2.5 h-2.5 rounded-full bg-yellow-500" />
                        <div className="w-2.5 h-2.5 rounded-full bg-green-500" />
                        <span className="ml-2 text-gray-500 text-[10px]">
                          {buildPhase === 'coding' ? 'Building components...' : 'Getting ready...'}
                        </span>
                      </div>
                      <div className="text-cyan-400 min-h-[60px]">
                        <TypewriterText texts={[
                          'function Hero() {',
                          '  return <section className="min-h-screen">',
                          '    <h1 className="text-5xl font-bold">',
                          '      {/* Your amazing content */}',
                          '    </h1>',
                          '  </section>',
                          '}',
                        ]} />
                      </div>
                    </div>
                  </div>
                  
                  {/* CSS for custom animations */}
                  <style>{`
                    @keyframes float {
                      0%, 100% { transform: translateY(0px) rotate(-2deg); opacity: 0.3; }
                      50% { transform: translateY(-20px) rotate(2deg); opacity: 0.6; }
                    }
                    @keyframes moveGrid {
                      0% { transform: translate(0, 0); }
                      100% { transform: translate(50px, 50px); }
                    }
                  `}</style>
                </div>
              )}
              
              {/* Simple updating indicator for follow-up generations */}
              {isGenerating && previewReady && (
                <div className="absolute top-4 right-4 z-20 flex items-center gap-2 px-4 py-2 bg-gray-900/90 backdrop-blur border border-gray-700 rounded-full shadow-lg">
                  <Loader2 className="w-4 h-4 animate-spin text-cyan-400" />
                  <span className="text-sm text-gray-300">Updating...</span>
                </div>
              )}
              {previewReady ? <iframe key={previewKey} srcDoc={generatePreviewHtml()} className="w-full h-full border-0 bg-white" sandbox="allow-scripts" title="Preview" /> : !isGenerating && <div className="flex items-center justify-center h-full text-gray-500"><div className="text-center"><Eye className="w-12 h-12 mx-auto mb-3 opacity-50" /><p>Enter a prompt to generate</p></div></div>}
            </>
          ) : (
            <div className="h-full flex">
              <div className="w-48 border-r border-gray-700 bg-gray-800 overflow-auto p-2">
                <div className="flex items-center gap-2 text-xs text-gray-500 mb-2 px-2"><FolderOpen className="w-3 h-3" /> Files</div>
                {files.length > 0 ? renderFileTree(buildFileTree(files)) : <p className="text-xs text-gray-500 px-2">No files yet</p>}
              </div>
              <div className="flex-1 overflow-auto">
                {selectedFile ? (
                  <div className="h-full flex flex-col">
                    <div className="flex items-center gap-2 px-4 py-2 bg-gray-800 border-b border-gray-700"><FileCode className="w-4 h-4 text-cyan-400" /><span className="text-sm font-medium">{selectedFile.path}</span></div>
                    <pre className="flex-1 p-4 text-sm font-mono text-gray-100 overflow-auto bg-gray-900"><code>{selectedFile.content}</code></pre>
                  </div>
                ) : <div className="flex items-center justify-center h-full text-gray-500">Select a file</div>}
              </div>
            </div>
          )}
        </div>
      </div>
      
      {/* Delete Confirmation Modal */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50" onClick={() => setDeleteConfirm(null)}>
          <div onClick={(e) => e.stopPropagation()} className="bg-gray-800 border border-gray-700 rounded-2xl p-6 max-w-md w-full mx-4 shadow-2xl">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-3 bg-red-500/20 rounded-full"><Trash2 className="w-6 h-6 text-red-400" /></div>
              <div>
                <h3 className="text-lg font-semibold">Delete Project</h3>
                <p className="text-sm text-gray-400">This action cannot be undone</p>
              </div>
            </div>
            <div className="bg-gray-900 rounded-xl p-4 mb-6">
              <p className="text-sm text-gray-400 mb-1">You are about to delete:</p>
              <p className="font-medium flex items-center gap-2"><Globe className="w-4 h-4 text-cyan-400" />{deleteConfirm.name || 'Untitled Project'}</p>
            </div>
            <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4 mb-6">
              <p className="text-sm text-amber-400"><strong>Warning:</strong> All project files, messages, and generated content will be permanently deleted.</p>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setDeleteConfirm(null)} className="flex-1 px-4 py-2.5 bg-gray-700 hover:bg-gray-600 border border-gray-600 rounded-xl font-medium">Cancel</button>
              <button onClick={() => deleteProject(deleteConfirm.id)} className="flex-1 px-4 py-2.5 bg-red-500 hover:bg-red-600 text-white rounded-xl font-medium">Yes, Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
