import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Globe, Send, Plus, FolderOpen, File, ChevronRight, ChevronDown,
  Code, Eye, Download, Trash2, Loader2, X, Image as ImageIcon,
  Sparkles, FileCode, FileJson, FileText, Folder, Clock,
  ArrowRight, RefreshCw, ExternalLink, Mic, MicOff, Paperclip
} from 'lucide-react';
import axios from 'axios';
import { AppLayout } from '../components/layout';

const API_BASE = 'http://localhost:3001/api';

const getFileIcon = (path) => {
  if (path.endsWith('.jsx') || path.endsWith('.tsx')) return FileCode;
  if (path.endsWith('.js') || path.endsWith('.ts')) return FileCode;
  if (path.endsWith('.json')) return FileJson;
  if (path.endsWith('.css') || path.endsWith('.html')) return FileText;
  return File;
};

// Typewriter effect component for code simulation
const TypewriterText = ({ texts }) => {
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

export default function WebsiteBuilder() {
  const { projectId } = useParams();
  return (
    <AppLayout>
      {({ user, updateUserCredits, showAuthModal }) => (
        <WebsiteBuilderContent
          user={user}
          updateUserCredits={updateUserCredits}
          showAuthModal={showAuthModal}
          projectId={projectId}
        />
      )}
    </AppLayout>
  );
}

function WebsiteBuilderContent({ user, updateUserCredits, showAuthModal, projectId: initialProjectId }) {
  const navigate = useNavigate();
  
  // State
  const [projects, setProjects] = useState([]);
  const [currentProject, setCurrentProject] = useState(null);
  const [files, setFiles] = useState([]);
  const [selectedFile, setSelectedFile] = useState(null);
  const [prompt, setPrompt] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [messages, setMessages] = useState([]);
  const [streamingMessage, setStreamingMessage] = useState('');
  const [selectedModel, setSelectedModel] = useState('anthropic/claude-opus-4.5');
  const [models, setModels] = useState([]);
  const [expandedFolders, setExpandedFolders] = useState(new Set(['src', 'src/components']));
  const [activeTab, setActiveTab] = useState('preview');
  const [previewKey, setPreviewKey] = useState(0);
  const [previewReady, setPreviewReady] = useState(false);
  const [buildPhase, setBuildPhase] = useState(''); // 'thinking' | 'planning' | 'coding' | 'done'
  const [referenceImage, setReferenceImage] = useState(null);
  const [isRecording, setIsRecording] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(null); // { id, name } of project to delete
  
  // Refs
  const chatEndRef = useRef(null);
  const fileInputRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  
  const getAuthHeaders = () => ({
    headers: { Authorization: `Bearer ${localStorage.getItem('userToken')}` }
  });

  // Fetch models
  useEffect(() => {
    axios.get(`${API_BASE}/website-builder/models`)
      .then(res => {
        setModels(res.data);
        const def = res.data.find(m => m.isDefault) || res.data[0];
        if (def) setSelectedModel(def.id);
      })
      .catch(console.error);
  }, []);

  // Fetch projects
  useEffect(() => {
    if (!user) return;
    axios.get(`${API_BASE}/website-builder/projects`, getAuthHeaders())
      .then(res => setProjects(res.data))
      .catch(console.error);
  }, [user]);

  // Load project from URL only (not from localStorage on home page)
  useEffect(() => {
    if (!user) return;
    
    if (initialProjectId) {
      // Only load from URL - don't auto-load from localStorage
      loadProject(initialProjectId);
    }
  }, [initialProjectId, user]);

  const loadProject = async (id) => {
    // Reset generation state when loading a project from history
    setIsGenerating(false);
    setBuildPhase('');
    setStreamingMessage('');
    
    try {
      const res = await axios.get(`${API_BASE}/website-builder/projects/${id}`, getAuthHeaders());
      setCurrentProject(res.data);
      setFiles(res.data.files || []);
      setMessages(res.data.messages || []);
      setPreviewReady(res.data.files?.some(f => f.path === 'src/App.jsx'));
      const appFile = res.data.files?.find(f => f.path === 'src/App.jsx');
      if (appFile) setSelectedFile(appFile);
    } catch (err) {
      console.error(err);
    }
  };

  const generateProjectName = (text) => {
    const words = text.slice(0, 40).split(' ').slice(0, 5).join(' ');
    return words || 'My Website';
  };

  const handleImageUpload = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => setReferenceImage(e.target.result);
      reader.readAsDataURL(file);
    }
  };

  const toggleRecording = async () => {
    if (isRecording) {
      mediaRecorderRef.current?.stop();
      setIsRecording(false);
    } else {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const mediaRecorder = new MediaRecorder(stream);
        const chunks = [];
        
        mediaRecorder.ondataavailable = (e) => chunks.push(e.data);
        mediaRecorder.onstop = async () => {
          const blob = new Blob(chunks, { type: 'audio/webm' });
          // For now, just show a message - could integrate with Whisper API
          setPrompt(prev => prev + ' [Voice input recorded]');
          stream.getTracks().forEach(t => t.stop());
        };
        
        mediaRecorderRef.current = mediaRecorder;
        mediaRecorder.start();
        setIsRecording(true);
      } catch (err) {
        console.error('Microphone access denied:', err);
      }
    }
  };

  const handleGenerate = async () => {
    if (!prompt.trim() || isGenerating) return;
    if (!user) { showAuthModal(); return; }
    
    setIsGenerating(true);
    setStreamingMessage('');
    setBuildPhase('thinking');
    setPreviewReady(false);
    
    let proj = currentProject;
    
    // Auto-create project
    if (!proj) {
      try {
        const res = await axios.post(`${API_BASE}/website-builder/projects`, {
          name: generateProjectName(prompt),
          framework: 'vite-react'
        }, getAuthHeaders());
        proj = res.data;
        setCurrentProject(res.data);
        setFiles(res.data.files || []);
        setProjects(p => [res.data, ...p]);
        navigate(`/website-builder/${res.data.id}`, { replace: true });
      } catch (err) {
        console.error(err);
        setIsGenerating(false);
        setBuildPhase('');
        return;
      }
    }
    
    // Add user message
    const userMsg = { role: 'user', content: prompt, image: referenceImage };
    setMessages(prev => [...prev, userMsg]);
    const userPrompt = prompt;
    setPrompt('');
    setReferenceImage(null);
    
    try {
      const response = await fetch(`${API_BASE}/website-builder/projects/${proj.id}/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('userToken')}`
        },
        body: JSON.stringify({ 
          prompt: userPrompt + (referenceImage ? '\n[Reference image provided]' : ''), 
          modelId: selectedModel 
        })
      });
      
      if (!response.ok) {
        throw new Error('Generation failed');
      }
      
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let fullContent = '';
      let hasFileChanges = false;
      let finalCreditsUsed = 0;
      let finalCostBreakdown = null;
      
      // Simulate build phases
      setTimeout(() => setBuildPhase('planning'), 1000);
      setTimeout(() => setBuildPhase('coding'), 3000);
      
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
              // Handle complete thinking block
              const completeThinking = fullContent.match(/<thinking>([\s\S]*?)<\/thinking>/);
              // Handle partial thinking block (still streaming)
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
              // Once in coding phase, streamingMessage stays empty - animation shows in preview
            }
            
            if (parsed.fileChanges && parsed.fileChanges.length > 0) {
              hasFileChanges = true;
              finalCreditsUsed = parsed.creditsUsed || 0;
              finalCostBreakdown = parsed.costBreakdown || null;
              setBuildPhase('done');
              const newFiles = [...files];
              for (const change of parsed.fileChanges) {
                const idx = newFiles.findIndex(f => f.path === change.path);
                if (idx >= 0) {
                  newFiles[idx] = { ...newFiles[idx], content: change.content };
                } else {
                  newFiles.push({ path: change.path, content: change.content, type: 'file' });
                }
              }
              setFiles(newFiles);
              setPreviewKey(k => k + 1);
              setPreviewReady(true);
              
              const appFile = newFiles.find(f => f.path === 'src/App.jsx');
              if (appFile) setSelectedFile(appFile);
            }
            
            if (parsed.creditsUsed) {
              finalCreditsUsed = parsed.creditsUsed;
              updateUserCredits(user.credits - parsed.creditsUsed);
            }
          } catch {}
        }
      }
      
      // Add assistant message - extract thinking content for summary
      let summary = '';
      const thinkingMatch = fullContent.match(/<thinking>([\s\S]*?)<\/thinking>/);
      const thinkingContent = thinkingMatch ? thinkingMatch[1].trim() : '';
      
      // Build cost info string
      const costInfo = finalCreditsUsed > 0 
        ? ` • ${finalCreditsUsed.toFixed(2)} credits` 
        : '';
      
      if (hasFileChanges) {
        // Count the new files
        const newFileCount = files.filter(f => f.path.startsWith('src/components/')).length;
        summary = `✅ Built ${newFileCount} component${newFileCount !== 1 ? 's' : ''}!${costInfo}`;
      } else {
        summary = thinkingContent.slice(0, 150) || 'Generation complete.';
        if (thinkingContent.length > 150) summary += '...';
        if (costInfo) summary += costInfo;
      }
      
      setMessages(prev => [...prev, { role: 'assistant', content: summary }]);
      setStreamingMessage('');
      
    } catch (err) {
      console.error('Generation error:', err);
      setMessages(prev => [...prev, { role: 'assistant', content: '❌ Error generating. Please try again.' }]);
      setStreamingMessage('');
    } finally {
      setIsGenerating(false);
      setBuildPhase('done');
    }
  };

  const handleDownload = async () => {
    if (!currentProject) return;
    try {
      const res = await axios.get(`${API_BASE}/website-builder/projects/${currentProject.id}/download`, getAuthHeaders());
      const JSZip = (await import('jszip')).default;
      const zip = new JSZip();
      for (const f of res.data.files) zip.file(f.path, f.content);
      const blob = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${res.data.projectName}.zip`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error(err);
    }
  };

  // Show delete confirmation modal
  const confirmDelete = (id, name, e) => {
    e?.stopPropagation();
    setDeleteConfirm({ id, name });
  };

  // Actually delete the project after confirmation
  const deleteProject = async (id) => {
    try {
      await axios.delete(`${API_BASE}/website-builder/projects/${id}`, getAuthHeaders());
      setProjects(p => p.filter(x => x.id !== id));
      if (currentProject?.id === id) {
        setCurrentProject(null);
        setFiles([]);
        setMessages([]);
        setPreviewReady(false);
        localStorage.removeItem('websiteBuilder_activeProject');
        navigate('/website-builder');
      }
      setDeleteConfirm(null);
    } catch (err) {
      console.error(err);
    }
  };

  // File tree
  const buildFileTree = (fileList) => {
    const tree = {};
    for (const file of fileList) {
      const parts = file.path.split('/');
      let current = tree;
      for (let i = 0; i < parts.length; i++) {
        const part = parts[i];
        if (i === parts.length - 1) {
          current[part] = { ...file, name: part, isFile: true };
        } else {
          if (!current[part]) current[part] = { name: part, isFile: false, children: {} };
          current = current[part].children;
        }
      }
    }
    return tree;
  };

  const renderFileTree = (tree, path = '') => {
    return Object.entries(tree)
      .sort(([, a], [, b]) => (a.isFile === b.isFile ? a.name.localeCompare(b.name) : a.isFile ? 1 : -1))
      .map(([name, item]) => {
        const fullPath = path ? `${path}/${name}` : name;
        if (item.isFile) {
          const Icon = getFileIcon(item.path);
          return (
            <button
              key={fullPath}
              onClick={() => setSelectedFile(item)}
              className={`w-full flex items-center gap-2 px-2 py-1 text-xs rounded hover:bg-[var(--bg-tertiary)] ${
                selectedFile?.path === item.path ? 'bg-[var(--bg-tertiary)] text-cyan-400' : 'text-[var(--text-secondary)]'
              }`}
            >
              <Icon className="w-3 h-3" />
              <span className="truncate">{name}</span>
            </button>
          );
        }
        const isExpanded = expandedFolders.has(fullPath);
        return (
          <div key={fullPath}>
            <button
              onClick={() => {
                const n = new Set(expandedFolders);
                isExpanded ? n.delete(fullPath) : n.add(fullPath);
                setExpandedFolders(n);
              }}
              className="w-full flex items-center gap-1 px-2 py-1 text-xs text-[var(--text-secondary)] rounded hover:bg-[var(--bg-tertiary)]"
            >
              {isExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
              <Folder className="w-3 h-3 text-cyan-400" />
              <span>{name}</span>
            </button>
            {isExpanded && <div className="ml-3">{renderFileTree(item.children, fullPath)}</div>}
          </div>
        );
      });
  };

  // Helper to remove all import statements
  const removeImports = (code) => {
    return code
      // Remove multiline imports: import { x, y, z } from '...'
      .replace(/^import\s+[\s\S]*?from\s+['"][^'"]*['"];?\s*$/gm, '')
      // Remove simple imports: import X from '...'
      .replace(/^import\s+\w+\s+from\s+['"][^'"]*['"];?\s*$/gm, '')
      // Remove side-effect imports: import '...'
      .replace(/^import\s+['"][^'"]*['"];?\s*$/gm, '')
      // Clean up empty lines
      .replace(/^\s*[\r\n]/gm, '\n');
  };

  // Helper to convert exports to declarations
  const convertExports = (code, componentName) => {
    return code
      // export default function Name() -> function Name()
      .replace(/export\s+default\s+function\s+(\w+)/g, 'function $1')
      // export default Name -> (remove, component already defined)
      .replace(/^export\s+default\s+\w+;?\s*$/gm, '')
      // export { Name } -> (remove)
      .replace(/^export\s+\{[^}]*\};?\s*$/gm, '')
      // export const X = ... -> const X = ...
      .replace(/^export\s+const\s+/gm, 'const ')
      // export function X -> function X
      .replace(/^export\s+function\s+/gm, 'function ');
  };

  // shadcn/ui CSS variables for theming
  const shadcnStyles = `
    :root {
      --background: 0 0% 100%;
      --foreground: 222.2 84% 4.9%;
      --card: 0 0% 100%;
      --card-foreground: 222.2 84% 4.9%;
      --popover: 0 0% 100%;
      --popover-foreground: 222.2 84% 4.9%;
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
    body { 
      margin: 0; 
      font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background-color: hsl(var(--background));
      color: hsl(var(--foreground));
      -webkit-font-smoothing: antialiased;
      -moz-osx-font-smoothing: grayscale;
    }
    
    /* Base component styles */
    .btn-primary {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      border-radius: calc(var(--radius) - 2px);
      font-size: 0.875rem;
      font-weight: 500;
      height: 2.5rem;
      padding: 0 1rem;
      background-color: hsl(var(--primary));
      color: hsl(var(--primary-foreground));
      transition: opacity 0.2s;
    }
    .btn-primary:hover { opacity: 0.9; }
    
    .card {
      border-radius: var(--radius);
      border: 1px solid hsl(var(--border));
      background-color: hsl(var(--card));
      color: hsl(var(--card-foreground));
      box-shadow: 0 1px 3px 0 rgb(0 0 0 / 0.1);
    }
  `;

  // Preview HTML
  const generatePreviewHtml = useCallback(() => {
    if (files.length === 0) return '';
    
    const appJsx = files.find(f => f.path === 'src/App.jsx')?.content || '';
    const indexCss = files.find(f => f.path === 'src/index.css')?.content || '';
    
    // Get all component files and process them - sort to ensure dependencies are defined first
    const componentFiles = files
      .filter(f => f.path.startsWith('src/components/') && f.path.endsWith('.jsx'))
      .sort((a, b) => a.path.localeCompare(b.path));
    
    const componentCode = componentFiles.map(f => {
      const name = f.path.split('/').pop().replace('.jsx', '');
      let code = f.content || '';
      code = removeImports(code);
      code = convertExports(code, name);
      return `// --- ${name} ---\n${code}`;
    });
    
    // Process App.jsx - must be last since it uses components
    let appCode = removeImports(appJsx);
    appCode = convertExports(appCode, 'App');
    
    // Clean CSS - remove Tailwind directives and PostCSS syntax
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
    // Configure Tailwind with shadcn colors
    tailwind.config = {
      theme: {
        extend: {
          colors: {
            border: "hsl(var(--border))",
            input: "hsl(var(--input))",
            ring: "hsl(var(--ring))",
            background: "hsl(var(--background))",
            foreground: "hsl(var(--foreground))",
            primary: {
              DEFAULT: "hsl(var(--primary))",
              foreground: "hsl(var(--primary-foreground))",
            },
            secondary: {
              DEFAULT: "hsl(var(--secondary))",
              foreground: "hsl(var(--secondary-foreground))",
            },
            destructive: {
              DEFAULT: "hsl(var(--destructive))",
              foreground: "hsl(var(--destructive-foreground))",
            },
            muted: {
              DEFAULT: "hsl(var(--muted))",
              foreground: "hsl(var(--muted-foreground))",
            },
            accent: {
              DEFAULT: "hsl(var(--accent))",
              foreground: "hsl(var(--accent-foreground))",
            },
            card: {
              DEFAULT: "hsl(var(--card))",
              foreground: "hsl(var(--card-foreground))",
            },
          },
          borderRadius: {
            lg: "var(--radius)",
            md: "calc(var(--radius) - 2px)",
            sm: "calc(var(--radius) - 4px)",
          },
        },
      },
    }
  </script>
  <script src="https://unpkg.com/react@18/umd/react.development.js"></script>
  <script src="https://unpkg.com/react-dom@18/umd/react-dom.development.js"></script>
  <script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>
    ${shadcnStyles}
    ${cleanCss}
  </style>
</head>
<body>
  <div id="root"></div>
  <div id="error-display" style="display:none;padding:40px;text-align:center;">
    <h2 style="color:#ef4444;margin-bottom:16px;">Preview Error</h2>
    <pre id="error-message" style="background:#fee2e2;padding:16px;border-radius:8px;text-align:left;overflow:auto;max-width:600px;margin:0 auto;white-space:pre-wrap;"></pre>
  </div>
  
  <script type="text/babel" data-presets="react">
    // React hooks and utilities
    const { useState, useEffect, useRef, useCallback, useMemo, useContext, createContext, Fragment } = React;
    
    // Simple SVG Icon component factory - renders inline SVGs as React elements
    const createIcon = (pathData, options = {}) => {
      const { viewBox = '0 0 24 24', fill = 'none', strokeWidth = 2 } = options;
      return function IconComponent({ className = '', size = 24, ...props }) {
        return React.createElement('svg', {
          xmlns: 'http://www.w3.org/2000/svg',
          width: size,
          height: size,
          viewBox,
          fill,
          stroke: 'currentColor',
          strokeWidth,
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
          className,
          ...props,
          dangerouslySetInnerHTML: { __html: pathData }
        });
      };
    };
    
    // Pre-defined icons - stored on window to allow AI components to override them
    // Using window assignment instead of const to prevent "already declared" errors
    window.Menu = createIcon('<line x1="4" x2="20" y1="12" y2="12"/><line x1="4" x2="20" y1="6" y2="6"/><line x1="4" x2="20" y1="18" y2="18"/>');
    window.X = createIcon('<path d="M18 6 6 18"/><path d="m6 6 12 12"/>');
    window.Check = createIcon('<path d="M20 6 9 17l-5-5"/>');
    window.ChevronDown = createIcon('<path d="m6 9 6 6 6-6"/>');
    window.ChevronUp = createIcon('<path d="m18 15-6-6-6 6"/>');
    window.ChevronLeft = createIcon('<path d="m15 18-6-6 6-6"/>');
    window.ChevronRight = createIcon('<path d="m9 18 6-6-6-6"/>');
    window.ArrowRight = createIcon('<path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>');
    window.ArrowLeft = createIcon('<path d="m12 19-7-7 7-7"/><path d="M19 12H5"/>');
    window.ArrowUp = createIcon('<path d="m5 12 7-7 7 7"/><path d="M12 19V5"/>');
    window.ArrowDown = createIcon('<path d="M12 5v14"/><path d="m19 12-7 7-7-7"/>');
    window.Search = createIcon('<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>');
    window.Home = createIcon('<path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>');
    window.User = createIcon('<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>');
    window.Users = createIcon('<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>');
    window.Settings = createIcon('<path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/>');
    window.Mail = createIcon('<rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>');
    window.Phone = createIcon('<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>');
    window.MapPin = createIcon('<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/>');
    window.Calendar = createIcon('<rect width="18" height="18" x="3" y="4" rx="2" ry="2"/><line x1="16" x2="16" y1="2" y2="6"/><line x1="8" x2="8" y1="2" y2="6"/><line x1="3" x2="21" y1="10" y2="10"/>');
    window.Clock = createIcon('<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>');
    window.Star = createIcon('<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>');
    window.Heart = createIcon('<path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/>');
    window.ThumbsUp = createIcon('<path d="M7 10v12"/><path d="M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2h0a3.13 3.13 0 0 1 3 3.88Z"/>');
    window.MessageCircle = createIcon('<path d="m3 21 1.9-5.7a8.5 8.5 0 1 1 3.8 3.8z"/>');
    window.Send = createIcon('<path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/>');
    window.Share = createIcon('<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" x2="15.42" y1="13.51" y2="17.49"/><line x1="15.41" x2="8.59" y1="6.51" y2="10.49"/>');
    window.Download = createIcon('<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/>');
    window.Upload = createIcon('<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" x2="12" y1="3" y2="15"/>');
    window.Plus = createIcon('<path d="M5 12h14"/><path d="M12 5v14"/>');
    window.Minus = createIcon('<path d="M5 12h14"/>');
    window.Edit = createIcon('<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4Z"/>');
    window.Trash = createIcon('<path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/>');
    window.Trash2 = createIcon('<path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" x2="10" y1="11" y2="17"/><line x1="14" x2="14" y1="11" y2="17"/>');
    window.Eye = createIcon('<path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/>');
    window.EyeOff = createIcon('<path d="M9.88 9.88a3 3 0 1 0 4.24 4.24"/><path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68"/><path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61"/><line x1="2" x2="22" y1="2" y2="22"/>');
    window.Lock = createIcon('<rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>');
    window.Unlock = createIcon('<rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/>');
    window.Shield = createIcon('<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10"/>');
    window.ShieldCheck = createIcon('<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10"/><path d="m9 12 2 2 4-4"/>');
    window.Globe = createIcon('<circle cx="12" cy="12" r="10"/><line x1="2" x2="22" y1="12" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>');
    window.Link = createIcon('<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>');
    window.ExternalLink = createIcon('<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" x2="21" y1="14" y2="3"/>');
    window.Copy = createIcon('<rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>');
    // Additional commonly used icons - using window assignment
    window.Clipboard = createIcon('<rect width="8" height="4" x="8" y="2" rx="1" ry="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/>');
    window.File = createIcon('<path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/>');
    window.FileText = createIcon('<path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/><line x1="16" x2="8" y1="13" y2="13"/><line x1="16" x2="8" y1="17" y2="17"/><line x1="10" x2="8" y1="9" y2="9"/>');
    window.Folder = createIcon('<path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z"/>');
    window.Image = createIcon('<rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/>');
    window.Camera = createIcon('<path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/><circle cx="12" cy="13" r="3"/>');
    window.Video = createIcon('<path d="m22 8-6 4 6 4V8Z"/><rect width="14" height="12" x="2" y="6" rx="2" ry="2"/>');
    window.Play = createIcon('<polygon points="5 3 19 12 5 21 5 3"/>');
    window.Pause = createIcon('<rect width="4" height="16" x="6" y="4"/><rect width="4" height="16" x="14" y="4"/>');
    window.Volume2 = createIcon('<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>');
    window.Mic = createIcon('<path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" x2="12" y1="19" y2="22"/>');
    window.Bell = createIcon('<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>');
    window.AlertCircle = createIcon('<circle cx="12" cy="12" r="10"/><line x1="12" x2="12" y1="8" y2="12"/><line x1="12" x2="12.01" y1="16" y2="16"/>');
    window.AlertTriangle = createIcon('<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" x2="12" y1="9" y2="13"/><line x1="12" x2="12.01" y1="17" y2="17"/>');
    window.Info = createIcon('<circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>');
    window.HelpCircle = createIcon('<circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><path d="M12 17h.01"/>');
    window.CheckCircle = createIcon('<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>');
    window.CheckCircle2 = createIcon('<circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/>');
    window.XCircle = createIcon('<circle cx="12" cy="12" r="10"/><path d="m15 9-6 6"/><path d="m9 9 6 6"/>');
    window.Loader = createIcon('<line x1="12" x2="12" y1="2" y2="6"/><line x1="12" x2="12" y1="18" y2="22"/><line x1="4.93" x2="7.76" y1="4.93" y2="7.76"/><line x1="16.24" x2="19.07" y1="16.24" y2="19.07"/><line x1="2" x2="6" y1="12" y2="12"/><line x1="18" x2="22" y1="12" y2="12"/><line x1="4.93" x2="7.76" y1="19.07" y2="16.24"/><line x1="16.24" x2="19.07" y1="7.76" y2="4.93"/>');
    window.Loader2 = createIcon('<path d="M21 12a9 9 0 1 1-6.219-8.56"/>');
    window.RefreshCw = createIcon('<path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M3 21v-5h5"/>');
    window.Zap = createIcon('<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>');
    window.Sparkles = createIcon('<path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/><path d="M5 3v4"/><path d="M19 17v4"/><path d="M3 5h4"/><path d="M17 19h4"/>');
    window.Rocket = createIcon('<path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z"/><path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z"/><path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0"/><path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5"/>');
    window.Target = createIcon('<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>');
    window.Award = createIcon('<circle cx="12" cy="8" r="6"/><path d="M15.477 12.89 17 22l-5-3-5 3 1.523-9.11"/>');
    window.Gift = createIcon('<polyline points="20 12 20 22 4 22 4 12"/><rect width="20" height="5" x="2" y="7"/><line x1="12" x2="12" y1="22" y2="7"/><path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z"/><path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z"/>');
    window.ShoppingCart = createIcon('<circle cx="8" cy="21" r="1"/><circle cx="19" cy="21" r="1"/><path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12"/>');
    window.ShoppingBag = createIcon('<path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z"/><path d="M3 6h18"/><path d="M16 10a4 4 0 0 1-8 0"/>');
    window.CreditCard = createIcon('<rect width="20" height="14" x="2" y="5" rx="2"/><line x1="2" x2="22" y1="10" y2="10"/>');
    window.DollarSign = createIcon('<line x1="12" x2="12" y1="2" y2="22"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>');
    window.TrendingUp = createIcon('<polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/>');
    window.TrendingDown = createIcon('<polyline points="22 17 13.5 8.5 8.5 13.5 2 7"/><polyline points="16 17 22 17 22 11"/>');
    window.BarChart = createIcon('<line x1="12" x2="12" y1="20" y2="10"/><line x1="18" x2="18" y1="20" y2="4"/><line x1="6" x2="6" y1="20" y2="16"/>');
    window.BarChart2 = createIcon('<line x1="18" x2="18" y1="20" y2="10"/><line x1="12" x2="12" y1="20" y2="4"/><line x1="6" x2="6" y1="20" y2="14"/>');
    window.BarChart3 = createIcon('<path d="M3 3v18h18"/><path d="M18 17V9"/><path d="M13 17V5"/><path d="M8 17v-3"/>');
    window.BarChart4 = createIcon('<path d="M3 3v18h18"/><path d="M13 17V9"/><path d="M18 17V5"/><path d="M8 17v-3"/>');
    window.LineChart = createIcon('<path d="M3 3v18h18"/><path d="m19 9-5 5-4-4-3 3"/>');
    window.PieChart = createIcon('<path d="M21.21 15.89A10 10 0 1 1 8 2.83"/><path d="M22 12A10 10 0 0 0 12 2v10z"/>');
    window.Activity = createIcon('<polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>');
    window.Database = createIcon('<ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5V19A9 3 0 0 0 21 19V5"/><path d="M3 12A9 3 0 0 0 21 12"/>');
    window.Server = createIcon('<rect width="20" height="8" x="2" y="2" rx="2" ry="2"/><rect width="20" height="8" x="2" y="14" rx="2" ry="2"/><line x1="6" x2="6.01" y1="6" y2="6"/><line x1="6" x2="6.01" y1="18" y2="18"/>');
    window.Cloud = createIcon('<path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"/>');
    window.Code = createIcon('<polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/>');
    window.Terminal = createIcon('<polyline points="4 17 10 11 4 5"/><line x1="12" x2="20" y1="19" y2="19"/>');
    window.Github = createIcon('<path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.403 5.403 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4"/><path d="M9 18c-4.51 2-5-2-7-2"/>');
    window.Twitter = createIcon('<path d="M22 4s-.7 2.1-2 3.4c1.6 10-9.4 17.3-18 11.6 2.2.1 4.4-.6 6-2C3 15.5.5 9.6 3 5c2.2 2.6 5.6 4.1 9 4-.9-4.2 4-6.6 7-3.8 1.1 0 3-1.2 3-1.2z"/>');
    window.Facebook = createIcon('<path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z"/>');
    window.Instagram = createIcon('<rect width="20" height="20" x="2" y="2" rx="5" ry="5"/><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/><line x1="17.5" x2="17.51" y1="6.5" y2="6.5"/>');
    window.Linkedin = createIcon('<path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z"/><rect width="4" height="12" x="2" y="9"/><circle cx="4" cy="4" r="2"/>');
    window.Youtube = createIcon('<path d="M2.5 17a24.12 24.12 0 0 1 0-10 2 2 0 0 1 1.4-1.4 49.56 49.56 0 0 1 16.2 0A2 2 0 0 1 21.5 7a24.12 24.12 0 0 1 0 10 2 2 0 0 1-1.4 1.4 49.55 49.55 0 0 1-16.2 0A2 2 0 0 1 2.5 17"/><path d="m10 15 5-3-5-3z"/>');
    window.Sun = createIcon('<circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/>');
    window.Moon = createIcon('<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>');
    window.Flame = createIcon('<path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/>');
    window.Briefcase = createIcon('<rect width="20" height="14" x="2" y="7" rx="2" ry="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/>');
    window.Building = createIcon('<rect width="16" height="20" x="4" y="2" rx="2" ry="2"/><path d="M9 22v-4h6v4"/><path d="M8 6h.01"/><path d="M16 6h.01"/><path d="M12 6h.01"/><path d="M12 10h.01"/><path d="M12 14h.01"/><path d="M16 10h.01"/><path d="M16 14h.01"/><path d="M8 10h.01"/><path d="M8 14h.01"/>');
    window.Monitor = createIcon('<rect width="20" height="14" x="2" y="3" rx="2"/><line x1="8" x2="16" y1="21" y2="21"/><line x1="12" x2="12" y1="17" y2="21"/>');
    window.Smartphone = createIcon('<rect width="14" height="20" x="5" y="2" rx="2" ry="2"/><path d="M12 18h.01"/>');
    window.Wifi = createIcon('<path d="M5 13a10 10 0 0 1 14 0"/><path d="M8.5 16.5a5 5 0 0 1 7 0"/><path d="M2 8.82a15 15 0 0 1 20 0"/><line x1="12" x2="12.01" y1="20" y2="20"/>');
    window.MoreHorizontal = createIcon('<circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/>');
    window.MoreVertical = createIcon('<circle cx="12" cy="12" r="1"/><circle cx="12" cy="5" r="1"/><circle cx="12" cy="19" r="1"/>');
    window.Filter = createIcon('<polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/>');
    window.Grid = createIcon('<rect width="7" height="7" x="3" y="3" rx="1"/><rect width="7" height="7" x="14" y="3" rx="1"/><rect width="7" height="7" x="14" y="14" rx="1"/><rect width="7" height="7" x="3" y="14" rx="1"/>');
    window.List = createIcon('<line x1="8" x2="21" y1="6" y2="6"/><line x1="8" x2="21" y1="12" y2="12"/><line x1="8" x2="21" y1="18" y2="18"/><line x1="3" x2="3.01" y1="6" y2="6"/><line x1="3" x2="3.01" y1="12" y2="12"/><line x1="3" x2="3.01" y1="18" y2="18"/>');
    window.Layers = createIcon('<polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/>');
    window.Package = createIcon('<path d="m7.5 4.27 9 5.15"/><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/>');
    window.Tag = createIcon('<path d="M12 2H2v10l9.29 9.29c.94.94 2.48.94 3.42 0l6.58-6.58c.94-.94.94-2.48 0-3.42L12 2Z"/><path d="M7 7h.01"/>');
    window.Bookmark = createIcon('<path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z"/>');
    window.Quote = createIcon('<path d="M3 21c3 0 7-1 7-8V5c0-1.25-.756-2.017-2-2H4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2 1 0 1 0 1 1v1c0 1-1 2-2 2s-1 .008-1 1.031V21c0 1 0 1 1 1z"/><path d="M15 21c3 0 7-1 7-8V5c0-1.25-.757-2.017-2-2h-4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2h.75c0 2.25.25 4-2.75 4v3c0 1 0 1 1 1z"/>');
    window.MessageSquare = createIcon('<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>');
    window.Hash = createIcon('<line x1="4" x2="20" y1="9" y2="9"/><line x1="4" x2="20" y1="15" y2="15"/><line x1="10" x2="8" y1="3" y2="21"/><line x1="16" x2="14" y1="3" y2="21"/>');
    window.AtSign = createIcon('<circle cx="12" cy="12" r="4"/><path d="M16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-4 8"/>');
    window.Key = createIcon('<circle cx="7.5" cy="15.5" r="5.5"/><path d="m21 2-9.6 9.6"/><path d="m15.5 7.5 3 3L22 7l-3-3"/>');
    window.Circle = createIcon('<circle cx="12" cy="12" r="10"/>');
    window.Square = createIcon('<rect width="18" height="18" x="3" y="3" rx="2"/>');
    window.Triangle = createIcon('<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/>');
    window.Hexagon = createIcon('<path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>');
    window.Percent = createIcon('<line x1="19" x2="5" y1="5" y2="19"/><circle cx="6.5" cy="6.5" r="2.5"/><circle cx="17.5" cy="17.5" r="2.5"/>');
    
    // Nature & Environment icons - using window assignment
    window.Leaf = createIcon('<path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10Z"/><path d="M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12"/>');
    window.TreePine = createIcon('<path d="m17 14 3 3.3a1 1 0 0 1-.7 1.7H4.7a1 1 0 0 1-.7-1.7L7 14h-.3a1 1 0 0 1-.7-1.7L9 9h-.2A1 1 0 0 1 8 7.3L12 3l4 4.3a1 1 0 0 1-.8 1.7H15l3 3.3a1 1 0 0 1-.7 1.7H17Z"/><path d="M12 22v-3"/>');
    window.Trees = createIcon('<path d="M10 10v.2A3 3 0 0 1 8.9 16v0H5v0h0a3 3 0 0 1-1-5.8V10a3 3 0 0 1 6 0Z"/><path d="M7 16v6"/><path d="M13 19v3"/><path d="M10.3 14.8 10 17h1l.2 2.2"/><path d="M16 6v.2a3 3 0 0 1 1.1 5.8v0h2.9v0a3 3 0 0 0 1-5.8V6a3 3 0 0 0-6 0Z"/>');
    window.Flower = createIcon('<path d="M12 7.5a4.5 4.5 0 1 1 4.5 4.5M12 7.5A4.5 4.5 0 1 0 7.5 12M12 7.5V9m-4.5 3a4.5 4.5 0 1 0 4.5 4.5M7.5 12H9m7.5 0a4.5 4.5 0 1 1-4.5 4.5m4.5-4.5H15m-3 4.5V15"/><circle cx="12" cy="12" r="3"/><path d="m8 16 1.5-1.5"/><path d="M14.5 9.5 16 8"/><path d="m8 8 1.5 1.5"/><path d="M14.5 14.5 16 16"/>');
    window.Mountain = createIcon('<path d="m8 3 4 8 5-5 5 15H2L8 3z"/>');
    window.Sunrise = createIcon('<path d="M12 2v8"/><path d="m4.93 10.93 1.41 1.41"/><path d="M2 18h2"/><path d="M20 18h2"/><path d="m19.07 10.93-1.41 1.41"/><path d="M22 22H2"/><path d="m8 6 4-4 4 4"/><path d="M16 18a4 4 0 0 0-8 0"/>');
    window.Sunset = createIcon('<path d="M12 10V2"/><path d="m4.93 10.93 1.41 1.41"/><path d="M2 18h2"/><path d="M20 18h2"/><path d="m19.07 10.93-1.41 1.41"/><path d="M22 22H2"/><path d="m16 6-4 4-4-4"/><path d="M16 18a4 4 0 0 0-8 0"/>');
    window.Droplets = createIcon('<path d="M7 16.3c2.2 0 4-1.83 4-4.05 0-1.16-.57-2.26-1.71-3.19S7.29 6.75 7 5.3c-.29 1.45-1.14 2.84-2.29 3.76S3 11.1 3 12.25c0 2.22 1.8 4.05 4 4.05z"/><path d="M12.56 6.6A10.97 10.97 0 0 0 14 3.02c.5 2.5 2 4.9 4 6.5s3 3.5 3 5.5a6.98 6.98 0 0 1-11.91 4.97"/>');
    window.Waves = createIcon('<path d="M2 6c.6.5 1.2 1 2.5 1C7 7 7 5 9.5 5c2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1"/><path d="M2 12c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1"/><path d="M2 18c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1"/>');
    
    // Building icons - using window assignment
    window.Building2 = createIcon('<path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z"/><path d="M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2"/><path d="M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2"/><path d="M10 6h4"/><path d="M10 10h4"/><path d="M10 14h4"/><path d="M10 18h4"/>');
    window.Factory = createIcon('<path d="M2 20a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8l-7 5V8l-7 5V4a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z"/><path d="M17 18h1"/><path d="M12 18h1"/><path d="M7 18h1"/>');
    window.Warehouse = createIcon('<path d="M22 8.35V20a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V8.35A2 2 0 0 1 3.26 6.5l8-3.2a2 2 0 0 1 1.48 0l8 3.2A2 2 0 0 1 22 8.35Z"/><path d="M6 18h12"/><path d="M6 14h12"/><rect width="12" height="12" x="6" y="10"/>');
    window.Hospital = createIcon('<path d="M12 6v4"/><path d="M14 14h-4"/><path d="M14 18h-4"/><path d="M14 8h-4"/><path d="M18 12h2a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-9a2 2 0 0 1 2-2h2"/><path d="M18 22V4a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v18"/>');
    window.Hotel = createIcon('<path d="M18 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2Z"/><path d="m9 16 .348-.24c1.465-1.013 3.84-1.013 5.304 0L15 16"/><path d="M8 7h.01"/><path d="M16 7h.01"/><path d="M12 7h.01"/><path d="M12 11h.01"/><path d="M16 11h.01"/><path d="M8 11h.01"/><path d="M10 22v-6.5m4 0V22"/>');
    window.Church = createIcon('<path d="m18 7 4 2v11a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9l4-2"/><path d="M14 22v-4a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v4"/><path d="M18 22V5l-6-3-6 3v17"/><path d="M12 7v5"/><path d="M10 9h4"/>');
    window.Landmark = createIcon('<line x1="3" x2="21" y1="22" y2="22"/><line x1="6" x2="6" y1="18" y2="11"/><line x1="10" x2="10" y1="18" y2="11"/><line x1="14" x2="14" y1="18" y2="11"/><line x1="18" x2="18" y1="18" y2="11"/><polygon points="12 2 20 7 4 7"/>');
    window.Store = createIcon('<path d="m2 7 4.41-4.41A2 2 0 0 1 7.83 2h8.34a2 2 0 0 1 1.42.59L22 7"/><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><path d="M15 22v-4a2 2 0 0 0-2-2h-2a2 2 0 0 0-2 2v4"/><path d="M2 7h20"/><path d="M22 7v3a2 2 0 0 1-2 2v0a2.7 2.7 0 0 1-1.59-.63.7.7 0 0 0-.82 0A2.7 2.7 0 0 1 16 12a2.7 2.7 0 0 1-1.59-.63.7.7 0 0 0-.82 0A2.7 2.7 0 0 1 12 12a2.7 2.7 0 0 1-1.59-.63.7.7 0 0 0-.82 0A2.7 2.7 0 0 1 8 12a2.7 2.7 0 0 1-1.59-.63.7.7 0 0 0-.82 0A2.7 2.7 0 0 1 4 12v0a2 2 0 0 1-2-2V7"/>');
    window.School = createIcon('<path d="m4 6 8-4 8 4"/><path d="m18 10 4 2v8a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-8l4-2"/><path d="M14 22v-4a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v4"/><path d="M18 5v17"/><path d="M6 5v17"/><circle cx="12" cy="9" r="2"/>');
    
    // Food & Drink icons - using window assignment
    window.Coffee = createIcon('<path d="M17 8h1a4 4 0 1 1 0 8h-1"/><path d="M3 8h14v9a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4Z"/><line x1="6" x2="6" y1="2" y2="4"/><line x1="10" x2="10" y1="2" y2="4"/><line x1="14" x2="14" y1="2" y2="4"/>');
    window.Wine = createIcon('<path d="M8 22h8"/><path d="M7 10h10"/><path d="M12 15v7"/><path d="M12 15a5 5 0 0 0 5-5c0-2-.5-4-2-8H9c-1.5 4-2 6-2 8a5 5 0 0 0 5 5Z"/>');
    window.Utensils = createIcon('<path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2"/><path d="M7 2v20"/><path d="M21 15V2v0a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7"/>');
    window.Pizza = createIcon('<path d="M15 11h.01"/><path d="M11 15h.01"/><path d="M16 16h.01"/><path d="m2 16 20 6-6-20A20 20 0 0 0 2 16"/><path d="M5.71 17.11a17.04 17.04 0 0 1 11.4-11.4"/>');
    window.Cake = createIcon('<path d="M20 21v-8a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8"/><path d="M4 16s.5-1 2-1 2.5 2 4 2 2.5-2 4-2 2.5 2 4 2 2-1 2-1"/><path d="M2 21h20"/><path d="M7 8v2"/><path d="M12 8v2"/><path d="M17 8v2"/><path d="M7 4h0.01"/><path d="M12 4h0.01"/><path d="M17 4h0.01"/>');
    
    // Transport icons - using window assignment
    window.Car = createIcon('<path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2"/><circle cx="7" cy="17" r="2"/><path d="M9 17h6"/><circle cx="17" cy="17" r="2"/>');
    window.Plane = createIcon('<path d="M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z"/>');
    window.Train = createIcon('<rect width="16" height="16" x="4" y="3" rx="2"/><path d="M4 11h16"/><path d="M12 3v8"/><path d="m8 19-2 3"/><path d="m18 22-2-3"/><path d="M8 15h0"/><path d="M16 15h0"/>');
    window.Bike = createIcon('<circle cx="18.5" cy="17.5" r="3.5"/><circle cx="5.5" cy="17.5" r="3.5"/><circle cx="15" cy="5" r="1"/><path d="M12 17.5V14l-3-3 4-3 2 3h2"/>');
    window.Ship = createIcon('<path d="M2 21c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1 .6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1"/><path d="M19.38 20A11.6 11.6 0 0 0 21 14l-9-4-9 4c0 2.9.94 5.34 2.81 7.76"/><path d="M19 13V7a2 2 0 0 0-2-2H7a2 2 0 0 0-2 2v6"/><path d="M12 10v4"/><path d="M12 2v3"/>');
    window.Bus = createIcon('<path d="M8 6v6"/><path d="M15 6v6"/><path d="M2 12h19.6"/><path d="M18 18h3s.5-1.7.8-2.8c.1-.4.2-.8.2-1.2 0-.4-.1-.8-.2-1.2l-1.4-5C20.1 6.8 19.1 6 18 6H4a2 2 0 0 0-2 2v10h3"/><circle cx="7" cy="18" r="2"/><path d="M9 18h5"/><circle cx="16" cy="18" r="2"/>');
    
    // Utility function for className merging (cn)
    const cn = (...classes) => classes.filter(Boolean).join(' ');
    
    // Error boundary component
    class ErrorBoundary extends React.Component {
      constructor(props) {
        super(props);
        this.state = { hasError: false, error: null };
      }
      static getDerivedStateFromError(error) {
        return { hasError: true, error };
      }
      componentDidCatch(error, errorInfo) {
        console.error('Component error:', error, errorInfo);
      }
      render() {
        if (this.state.hasError) {
          return (
            <div style={{padding: '40px', textAlign: 'center'}}>
              <h2 style={{color: '#ef4444', marginBottom: '16px'}}>Component Error</h2>
              <pre style={{background: '#fee2e2', padding: '16px', borderRadius: '8px', textAlign: 'left', overflow: 'auto', maxWidth: '600px', margin: '0 auto', whiteSpace: 'pre-wrap'}}>
                {this.state.error?.message || 'Unknown error'}
              </pre>
            </div>
          );
        }
        return this.props.children;
      }
    }
    
    // Components
    ${componentCode.join('\n\n')}
    
    // App
    ${appCode}
    
    // Render with error boundary
    try {
      const root = ReactDOM.createRoot(document.getElementById('root'));
      root.render(
        React.createElement(ErrorBoundary, null, 
          React.createElement(App)
        )
      );
    } catch (err) {
      console.error('Render error:', err);
      document.getElementById('root').style.display = 'none';
      document.getElementById('error-display').style.display = 'block';
      document.getElementById('error-message').textContent = err.message + '\\n\\n' + (err.stack || '');
    }
  </script>
  
  <script>
    // Catch any Babel compilation errors
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

  // Scroll chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingMessage]);

  // HOME VIEW
  if (!currentProject) {
    return (
      <div className="h-full flex flex-col items-center justify-center p-8">
        <div className="w-full max-w-2xl">
          <div className="text-center mb-8">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center mx-auto mb-4">
              <Globe className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-3xl font-bold mb-2">Website Builder</h1>
            <p className="text-[var(--text-muted)]">Describe what you want to build</p>
          </div>
          
          <div className="flex justify-center gap-3 mb-4">
            <select
              value={selectedModel}
              onChange={(e) => setSelectedModel(e.target.value)}
              className="px-4 py-2 bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-xl text-sm"
            >
              {models.map(m => (
                <option key={m.id} value={m.id}>{m.name}{m.isDefault ? ' (Default)' : ''}</option>
              ))}
            </select>
          </div>
          
          {/* Main Input */}
          <div className="bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-2xl p-4 mb-6">
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="A modern SaaS landing page with pricing, features, testimonials..."
              className="w-full bg-transparent text-[var(--text-primary)] placeholder:text-[var(--text-muted)] resize-none focus:outline-none"
              rows={3}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleGenerate();
                }
              }}
            />
            
            {/* Reference Image Preview */}
            {referenceImage && (
              <div className="relative inline-block mt-2">
                <img src={referenceImage} alt="Reference" className="h-20 rounded-lg" />
                <button
                  onClick={() => setReferenceImage(null)}
                  className="absolute -top-2 -right-2 p-1 bg-red-500 text-white rounded-full"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            )}
            
            {/* Action Bar */}
            <div className="flex items-center justify-between mt-3 pt-3 border-t border-[var(--border-color)]">
              <div className="flex items-center gap-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleImageUpload}
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="p-2 rounded-lg hover:bg-[var(--bg-tertiary)] text-[var(--text-muted)] hover:text-cyan-400"
                  title="Add reference image"
                >
                  <ImageIcon className="w-5 h-5" />
                </button>
                <button
                  onClick={toggleRecording}
                  className={`p-2 rounded-lg hover:bg-[var(--bg-tertiary)] ${isRecording ? 'text-red-400 animate-pulse' : 'text-[var(--text-muted)] hover:text-cyan-400'}`}
                  title={isRecording ? 'Stop recording' : 'Voice input'}
                >
                  {isRecording ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
                </button>
              </div>
              
              <button
                onClick={handleGenerate}
                disabled={!prompt.trim() || isGenerating || !user}
                className="flex items-center gap-2 px-5 py-2 bg-gradient-to-r from-cyan-500 to-blue-600 text-white rounded-xl font-medium disabled:opacity-50"
              >
                {isGenerating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                Generate
              </button>
            </div>
          </div>
          
          {/* Quick Prompts */}
          <div className="flex flex-wrap gap-2 justify-center mb-8">
            {['SaaS landing', 'Portfolio', 'E-commerce', 'Blog', 'Dashboard'].map(ex => (
              <button
                key={ex}
                onClick={() => setPrompt(ex + ' website')}
                className="px-3 py-1.5 bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-full text-sm text-[var(--text-muted)] hover:border-cyan-500 hover:text-cyan-400"
              >
                {ex}
              </button>
            ))}
          </div>
          
          {/* Recent Projects */}
          {projects.length > 0 && (
            <div className="w-full max-w-4xl mx-auto">
              <h3 className="text-sm font-medium text-[var(--text-muted)] mb-4 flex items-center gap-2">
                <Clock className="w-4 h-4" /> Your Projects ({projects.length})
              </h3>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {projects.map((p, idx) => (
                  <div
                    key={p.id}
                    onClick={() => { navigate(`/website-builder/${p.id}`); loadProject(p.id); }}
                    className="group cursor-pointer bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-xl overflow-hidden hover:border-cyan-500/50 hover:shadow-lg hover:shadow-cyan-500/10 transition-all"
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
                      <p className="font-medium text-sm truncate text-[var(--text-primary)]">{p.name}</p>
                      <p className="text-xs text-[var(--text-muted)] mt-0.5">
                        {p.updatedAt ? new Date(p.updatedAt).toLocaleDateString() : 'Recently created'}
                      </p>
                    </div>
                  </div>
                ))}
                
                {/* New Project Card */}
                <div
                  onClick={() => document.querySelector('textarea')?.focus()}
                  className="group cursor-pointer bg-[var(--bg-secondary)] border border-dashed border-[var(--border-color)] rounded-xl overflow-hidden hover:border-cyan-500/50 transition-all"
                >
                  <div className="aspect-[16/10] flex items-center justify-center bg-gradient-to-br from-gray-800/50 to-gray-900/50">
                    <div className="text-center">
                      <div className="w-10 h-10 rounded-full bg-cyan-500/20 flex items-center justify-center mx-auto mb-2 group-hover:bg-cyan-500/30 transition-colors">
                        <Plus className="w-5 h-5 text-cyan-400" />
                      </div>
                      <p className="text-xs text-[var(--text-muted)]">New Project</p>
                    </div>
                  </div>
                  <div className="p-3">
                    <p className="font-medium text-sm text-[var(--text-muted)]">Start building</p>
                    <p className="text-xs text-[var(--text-muted)] mt-0.5">Enter a prompt above</p>
                  </div>
                </div>
              </div>
            </div>
          )}
          
          {!user && (
            <div className="text-center mt-8">
              <button onClick={showAuthModal} className="px-6 py-3 bg-gradient-to-r from-cyan-500 to-blue-600 text-white rounded-xl font-medium">
                Sign in to start building
              </button>
            </div>
          )}
        </div>
        
        {/* Delete Confirmation Modal */}
        <AnimatePresence>
          {deleteConfirm && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50"
              onClick={() => setDeleteConfirm(null)}
            >
              <motion.div
                initial={{ scale: 0.95, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.95, opacity: 0 }}
                onClick={(e) => e.stopPropagation()}
                className="bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-2xl p-6 max-w-md w-full mx-4 shadow-2xl"
              >
                <div className="flex items-center gap-3 mb-4">
                  <div className="p-3 bg-red-500/20 rounded-full">
                    <Trash2 className="w-6 h-6 text-red-400" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold">Delete Project</h3>
                    <p className="text-sm text-[var(--text-muted)]">This action cannot be undone</p>
                  </div>
                </div>
                
                <div className="bg-[var(--bg-tertiary)] rounded-xl p-4 mb-6">
                  <p className="text-sm text-[var(--text-muted)] mb-1">You are about to delete:</p>
                  <p className="font-medium flex items-center gap-2">
                    <Globe className="w-4 h-4 text-cyan-400" />
                    {deleteConfirm.name || 'Untitled Project'}
                  </p>
                </div>
                
                <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4 mb-6">
                  <p className="text-sm text-amber-400">
                    <strong>Warning:</strong> All project files, messages, and generated content will be permanently deleted. This cannot be recovered.
                  </p>
                </div>
                
                <div className="flex gap-3">
                  <button
                    onClick={() => setDeleteConfirm(null)}
                    className="flex-1 px-4 py-2.5 bg-[var(--bg-tertiary)] hover:bg-[var(--bg-primary)] border border-[var(--border-color)] rounded-xl font-medium transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => deleteProject(deleteConfirm.id)}
                    className="flex-1 px-4 py-2.5 bg-red-500 hover:bg-red-600 text-white rounded-xl font-medium transition-colors"
                  >
                    Yes, Delete
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  }

  // PROJECT EDITOR VIEW
  return (
    <div className="h-full flex overflow-hidden">
      {/* LEFT - Chat Panel */}
      <div className="w-80 border-r border-[var(--border-color)] flex flex-col bg-[var(--bg-secondary)]">
        {/* Header */}
        <div className="p-3 border-b border-[var(--border-color)] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                setCurrentProject(null);
                setFiles([]);
                setMessages([]);
                setPreviewReady(false);
                localStorage.removeItem('websiteBuilder_activeProject');
                navigate('/website-builder');
              }}
              className="p-1.5 rounded-lg hover:bg-[var(--bg-tertiary)] text-[var(--text-muted)]"
              title="Back to home"
            >
              <ChevronRight className="w-4 h-4 rotate-180" />
            </button>
            <span className="font-medium truncate text-sm max-w-[120px]">{currentProject?.name}</span>
          </div>
          <div className="flex items-center gap-2">
            <select
              value={selectedModel}
              onChange={(e) => setSelectedModel(e.target.value)}
              className="text-xs px-2 py-1 bg-[var(--bg-tertiary)] border border-[var(--border-color)] rounded-lg"
            >
              {models.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
            <button
              onClick={() => confirmDelete(currentProject?.id, currentProject?.name)}
              className="p-1.5 rounded-lg hover:bg-red-500/20 text-[var(--text-muted)] hover:text-red-400"
              title="Delete project"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>
        
        {/* Chat Messages */}
        <div className="flex-1 overflow-auto p-3 space-y-3">
          {messages.length === 0 && !streamingMessage && (
            <div className="text-center text-[var(--text-muted)] text-sm py-8">
              <Sparkles className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p>Describe what you want to build or change</p>
            </div>
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
              <div key={i} className={`${msg.role === 'user' ? 'ml-8' : 'mr-8'}`}>
                <div className={`p-3 rounded-2xl text-sm ${
                  msg.role === 'user' 
                    ? 'bg-cyan-500/20 text-[var(--text-primary)]' 
                    : 'bg-[var(--bg-primary)] text-[var(--text-secondary)]'
                }`}>
                  {msg.image && (
                    <img src={msg.image} alt="Reference" className="h-16 rounded-lg mb-2" />
                  )}
                  {displayContent}
                </div>
              </div>
            );
          })}
          
          {/* Live AI Response - Shows streaming content during generation */}
          {isGenerating && (
            <motion.div 
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="mr-4"
            >
              <div className="p-4 rounded-2xl text-sm bg-gradient-to-br from-[var(--bg-primary)] to-[var(--bg-secondary)] border border-cyan-500/20 shadow-lg shadow-cyan-500/5">
                {/* Status Header */}
                <div className="flex items-center gap-3 mb-3 pb-3 border-b border-[var(--border-color)]">
                  <div className="relative">
                    <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-cyan-500/20 to-blue-500/20 flex items-center justify-center">
                      {buildPhase === 'done' ? (
                        <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }}>
                          <Code className="w-4 h-4 text-emerald-400" />
                        </motion.div>
                      ) : (
                        <Loader2 className="w-4 h-4 animate-spin text-cyan-400" />
                      )}
                    </div>
                    <motion.div 
                      className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-cyan-400"
                      animate={{ scale: [1, 1.2, 1], opacity: [1, 0.5, 1] }}
                      transition={{ duration: 1.5, repeat: Infinity }}
                    />
                  </div>
                  <div className="flex-1">
                    <p className="text-xs font-medium text-cyan-400">
                      {buildPhase === 'thinking' && '🧠 Understanding your request...'}
                      {buildPhase === 'planning' && '📐 Planning architecture...'}
                      {buildPhase === 'coding' && '⚡ Writing components...'}
                      {buildPhase === 'done' && '✨ Finalizing...'}
                      {!buildPhase && '🚀 Starting...'}
                    </p>
                    <div className="flex items-center gap-2 mt-1">
                      <div className="flex-1 h-1 bg-[var(--bg-tertiary)] rounded-full overflow-hidden">
                        <motion.div 
                          className="h-full bg-gradient-to-r from-cyan-500 to-blue-500 rounded-full"
                          initial={{ width: '0%' }}
                          animate={{ 
                            width: buildPhase === 'thinking' ? '25%' : 
                                   buildPhase === 'planning' ? '50%' : 
                                   buildPhase === 'coding' ? '75%' : 
                                   buildPhase === 'done' ? '100%' : '10%' 
                          }}
                          transition={{ duration: 0.5 }}
                        />
                      </div>
                      <span className="text-[10px] text-[var(--text-muted)]">
                        {buildPhase === 'thinking' ? '1/4' : 
                         buildPhase === 'planning' ? '2/4' : 
                         buildPhase === 'coding' ? '3/4' : 
                         buildPhase === 'done' ? '4/4' : '...'}
                      </span>
                    </div>
                  </div>
                </div>
                
                {/* Streaming AI Thoughts */}
                {streamingMessage && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="text-xs text-[var(--text-muted)] leading-relaxed max-h-32 overflow-y-auto scrollbar-thin"
                  >
                    <p className="text-[var(--text-secondary)]">
                      {streamingMessage.replace(/<[^>]+>/g, '').slice(0, 500)}
                      {streamingMessage.length > 500 && (
                        <span className="text-cyan-400">...</span>
                      )}
                    </p>
                  </motion.div>
                )}
                
                {/* Fallback when no streaming content */}
                {!streamingMessage && (
                  <div className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
                    <motion.span
                      animate={{ opacity: [0.4, 1, 0.4] }}
                      transition={{ duration: 1.5, repeat: Infinity }}
                    >
                      AI is working on your website
                    </motion.span>
                    <motion.span
                      animate={{ opacity: [0, 1, 0] }}
                      transition={{ duration: 1, repeat: Infinity, delay: 0.2 }}
                    >
                      .
                    </motion.span>
                    <motion.span
                      animate={{ opacity: [0, 1, 0] }}
                      transition={{ duration: 1, repeat: Infinity, delay: 0.4 }}
                    >
                      .
                    </motion.span>
                    <motion.span
                      animate={{ opacity: [0, 1, 0] }}
                      transition={{ duration: 1, repeat: Infinity, delay: 0.6 }}
                    >
                      .
                    </motion.span>
                  </div>
                )}
              </div>
            </motion.div>
          )}
          
          <div ref={chatEndRef} />
        </div>
        
        {/* Input Area */}
        <div className="p-3 border-t border-[var(--border-color)]">
          {referenceImage && (
            <div className="relative inline-block mb-2">
              <img src={referenceImage} alt="Reference" className="h-12 rounded-lg" />
              <button onClick={() => setReferenceImage(null)} className="absolute -top-1 -right-1 p-0.5 bg-red-500 text-white rounded-full">
                <X className="w-3 h-3" />
              </button>
            </div>
          )}
          
          <div className="flex items-end gap-2">
            <div className="flex-1 bg-[var(--bg-primary)] border border-[var(--border-color)] rounded-xl p-2">
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="Describe changes..."
                className="w-full bg-transparent text-sm resize-none focus:outline-none"
                rows={2}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleGenerate();
                  }
                }}
              />
              <div className="flex items-center gap-1 mt-1">
                <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
                <button onClick={() => fileInputRef.current?.click()} className="p-1.5 rounded hover:bg-[var(--bg-tertiary)] text-[var(--text-muted)]">
                  <ImageIcon className="w-4 h-4" />
                </button>
                <button onClick={toggleRecording} className={`p-1.5 rounded hover:bg-[var(--bg-tertiary)] ${isRecording ? 'text-red-400' : 'text-[var(--text-muted)]'}`}>
                  {isRecording ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                </button>
              </div>
            </div>
            <button
              onClick={handleGenerate}
              disabled={!prompt.trim() || isGenerating}
              className="p-3 bg-gradient-to-r from-cyan-500 to-blue-600 text-white rounded-xl disabled:opacity-50"
            >
              {isGenerating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            </button>
          </div>
        </div>
      </div>
      
      {/* RIGHT - Preview & Code */}
      <div className="flex-1 flex flex-col min-w-0 bg-[var(--bg-primary)]">
        {/* Toolbar */}
        <div className="flex items-center justify-between p-2 border-b border-[var(--border-color)] bg-[var(--bg-secondary)]">
          <div className="flex items-center gap-1">
            <button
              onClick={() => setActiveTab('preview')}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium ${activeTab === 'preview' ? 'bg-cyan-500/20 text-cyan-400' : 'text-[var(--text-muted)]'}`}
            >
              <Eye className="w-4 h-4" /> Preview
            </button>
            <button
              onClick={() => setActiveTab('code')}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium ${activeTab === 'code' ? 'bg-cyan-500/20 text-cyan-400' : 'text-[var(--text-muted)]'}`}
            >
              <Code className="w-4 h-4" /> Code
            </button>
          </div>
          
          <div className="flex items-center gap-2">
            <button onClick={() => setPreviewKey(k => k + 1)} className="p-2 rounded-lg hover:bg-[var(--bg-tertiary)] text-[var(--text-muted)]" title="Refresh">
              <RefreshCw className="w-4 h-4" />
            </button>
            <button onClick={handleDownload} className="p-2 rounded-lg hover:bg-[var(--bg-tertiary)] text-[var(--text-muted)]" title="Download">
              <Download className="w-4 h-4" />
            </button>
            <button onClick={() => window.open('data:text/html,' + encodeURIComponent(generatePreviewHtml()), '_blank')} className="p-2 rounded-lg hover:bg-[var(--bg-tertiary)] text-[var(--text-muted)]" title="Open in new tab">
              <ExternalLink className="w-4 h-4" />
            </button>
          </div>
        </div>
        
        {/* Content */}
        <div className="flex-1 overflow-hidden relative">
          {activeTab === 'preview' ? (
            <>
              {/* Building Animation - Beautiful Animated Background */}
              {isGenerating && !previewReady && (
                <div className="absolute inset-0 bg-[#030308] z-10 overflow-hidden">
                  {/* Animated gradient orbs */}
                  <div className="absolute inset-0">
                    {/* Large floating orb 1 */}
                    <motion.div
                      className="absolute w-[600px] h-[600px] rounded-full opacity-30"
                      style={{
                        background: 'radial-gradient(circle, rgba(6,182,212,0.4) 0%, rgba(6,182,212,0) 70%)',
                        filter: 'blur(60px)',
                      }}
                      animate={{
                        x: ['-20%', '30%', '-10%'],
                        y: ['-10%', '20%', '-20%'],
                        scale: [1, 1.2, 1],
                      }}
                      transition={{
                        duration: 15,
                        repeat: Infinity,
                        ease: 'easeInOut',
                      }}
                    />
                    
                    {/* Large floating orb 2 */}
                    <motion.div
                      className="absolute right-0 bottom-0 w-[500px] h-[500px] rounded-full opacity-25"
                      style={{
                        background: 'radial-gradient(circle, rgba(139,92,246,0.5) 0%, rgba(139,92,246,0) 70%)',
                        filter: 'blur(50px)',
                      }}
                      animate={{
                        x: ['20%', '-30%', '10%'],
                        y: ['10%', '-20%', '20%'],
                        scale: [1.2, 1, 1.1],
                      }}
                      transition={{
                        duration: 18,
                        repeat: Infinity,
                        ease: 'easeInOut',
                      }}
                    />
                    
                    {/* Medium orb 3 */}
                    <motion.div
                      className="absolute left-1/2 top-1/2 w-[400px] h-[400px] rounded-full opacity-20"
                      style={{
                        background: 'radial-gradient(circle, rgba(59,130,246,0.4) 0%, rgba(59,130,246,0) 70%)',
                        filter: 'blur(40px)',
                      }}
                      animate={{
                        x: ['-50%', '-30%', '-60%', '-50%'],
                        y: ['-50%', '-30%', '-60%', '-50%'],
                        scale: [1, 1.3, 0.9, 1],
                      }}
                      transition={{
                        duration: 12,
                        repeat: Infinity,
                        ease: 'easeInOut',
                      }}
                    />
                    
                    {/* Small accent orb */}
                    <motion.div
                      className="absolute left-1/4 bottom-1/4 w-[200px] h-[200px] rounded-full opacity-30"
                      style={{
                        background: 'radial-gradient(circle, rgba(236,72,153,0.4) 0%, rgba(236,72,153,0) 70%)',
                        filter: 'blur(30px)',
                      }}
                      animate={{
                        x: ['0%', '50%', '-30%', '0%'],
                        y: ['0%', '-40%', '30%', '0%'],
                      }}
                      transition={{
                        duration: 10,
                        repeat: Infinity,
                        ease: 'easeInOut',
                      }}
                    />
                  </div>
                  
                  {/* Animated mesh grid */}
                  <div className="absolute inset-0 opacity-[0.03]">
                    <motion.div 
                      className="absolute inset-0"
                      style={{
                        backgroundImage: `
                          linear-gradient(rgba(6,182,212,0.3) 1px, transparent 1px),
                          linear-gradient(90deg, rgba(6,182,212,0.3) 1px, transparent 1px)
                        `,
                        backgroundSize: '60px 60px',
                      }}
                      animate={{
                        backgroundPosition: ['0px 0px', '60px 60px'],
                      }}
                      transition={{
                        duration: 20,
                        repeat: Infinity,
                        ease: 'linear',
                      }}
                    />
                  </div>
                  
                  {/* Floating particles */}
                  <div className="absolute inset-0">
                    {[...Array(20)].map((_, i) => (
                      <motion.div
                        key={i}
                        className="absolute w-1 h-1 bg-cyan-400/40 rounded-full"
                        style={{
                          left: `${Math.random() * 100}%`,
                          top: `${Math.random() * 100}%`,
                        }}
                        animate={{
                          y: [0, -100, 0],
                          opacity: [0, 1, 0],
                        }}
                        transition={{
                          duration: 3 + Math.random() * 4,
                          repeat: Infinity,
                          delay: Math.random() * 5,
                          ease: 'easeInOut',
                        }}
                      />
                    ))}
                  </div>
                  
                  {/* Center pulsing ring */}
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <motion.div
                      className="w-32 h-32 rounded-full border border-cyan-500/20"
                      animate={{
                        scale: [1, 2, 1],
                        opacity: [0.3, 0, 0.3],
                      }}
                      transition={{
                        duration: 3,
                        repeat: Infinity,
                        ease: 'easeOut',
                      }}
                    />
                    <motion.div
                      className="absolute w-32 h-32 rounded-full border border-purple-500/20"
                      animate={{
                        scale: [1, 2.5, 1],
                        opacity: [0.2, 0, 0.2],
                      }}
                      transition={{
                        duration: 3,
                        repeat: Infinity,
                        ease: 'easeOut',
                        delay: 0.5,
                      }}
                    />
                    <motion.div
                      className="absolute w-32 h-32 rounded-full border border-blue-500/20"
                      animate={{
                        scale: [1, 3, 1],
                        opacity: [0.15, 0, 0.15],
                      }}
                      transition={{
                        duration: 3,
                        repeat: Infinity,
                        ease: 'easeOut',
                        delay: 1,
                      }}
                    />
                    
                    {/* Center glowing dot */}
                    <motion.div
                      className="absolute w-3 h-3 rounded-full bg-cyan-400"
                      style={{ boxShadow: '0 0 20px rgba(6,182,212,0.8), 0 0 40px rgba(6,182,212,0.4)' }}
                      animate={{
                        scale: [1, 1.2, 1],
                      }}
                      transition={{
                        duration: 2,
                        repeat: Infinity,
                        ease: 'easeInOut',
                      }}
                    />
                  </div>
                  
                  {/* Subtle vignette */}
                  <div 
                    className="absolute inset-0 pointer-events-none"
                    style={{
                      background: 'radial-gradient(ellipse at center, transparent 0%, rgba(0,0,0,0.4) 100%)',
                    }}
                  />
                </div>
              )}
              
              {/* Simple updating indicator for follow-up generations */}
              {isGenerating && previewReady && (
                <div className="absolute top-4 right-4 z-20 flex items-center gap-2 px-4 py-2 bg-[var(--bg-secondary)]/90 backdrop-blur border border-[var(--border-color)] rounded-full shadow-lg">
                  <Loader2 className="w-4 h-4 animate-spin text-cyan-400" />
                  <span className="text-sm text-[var(--text-secondary)]">Updating...</span>
                </div>
              )}
              
              {previewReady ? (
                <iframe
                  key={previewKey}
                  srcDoc={generatePreviewHtml()}
                  className="w-full h-full border-0 bg-white"
                  sandbox="allow-scripts"
                  title="Preview"
                />
              ) : !isGenerating && (
                <div className="flex items-center justify-center h-full text-[var(--text-muted)]">
                  <div className="text-center">
                    <Eye className="w-12 h-12 mx-auto mb-3 opacity-50" />
                    <p>Enter a prompt to generate your website</p>
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="h-full flex">
              {/* File Explorer */}
              <div className="w-48 border-r border-[var(--border-color)] bg-[var(--bg-secondary)] overflow-auto p-2">
                <div className="flex items-center gap-2 text-xs text-[var(--text-muted)] mb-2 px-2">
                  <FolderOpen className="w-3 h-3" /> Files
                </div>
                {files.length > 0 ? renderFileTree(buildFileTree(files)) : (
                  <p className="text-xs text-[var(--text-muted)] px-2">No files yet</p>
                )}
              </div>
              
              {/* Code View */}
              <div className="flex-1 overflow-auto">
                {selectedFile ? (
                  <div className="h-full flex flex-col">
                    <div className="flex items-center gap-2 px-4 py-2 bg-[var(--bg-secondary)] border-b border-[var(--border-color)]">
                      <FileCode className="w-4 h-4 text-cyan-400" />
                      <span className="text-sm font-medium">{selectedFile.path}</span>
                    </div>
                    <pre className="flex-1 p-4 text-sm font-mono text-[var(--text-primary)] overflow-auto bg-[var(--bg-primary)]">
                      <code>{selectedFile.content}</code>
                    </pre>
                  </div>
                ) : (
                  <div className="flex items-center justify-center h-full text-[var(--text-muted)]">
                    Select a file to view
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
      
      {/* Delete Confirmation Modal */}
      <AnimatePresence>
        {deleteConfirm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50"
            onClick={() => setDeleteConfirm(null)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-2xl p-6 max-w-md w-full mx-4 shadow-2xl"
            >
              <div className="flex items-center gap-3 mb-4">
                <div className="p-3 bg-red-500/20 rounded-full">
                  <Trash2 className="w-6 h-6 text-red-400" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold">Delete Project</h3>
                  <p className="text-sm text-[var(--text-muted)]">This action cannot be undone</p>
                </div>
              </div>
              
              <div className="bg-[var(--bg-tertiary)] rounded-xl p-4 mb-6">
                <p className="text-sm text-[var(--text-muted)] mb-1">You are about to delete:</p>
                <p className="font-medium flex items-center gap-2">
                  <Globe className="w-4 h-4 text-cyan-400" />
                  {deleteConfirm.name || 'Untitled Project'}
                </p>
              </div>
              
              <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4 mb-6">
                <p className="text-sm text-amber-400">
                  <strong>Warning:</strong> All project files, messages, and generated content will be permanently deleted. This cannot be recovered.
                </p>
              </div>
              
              <div className="flex gap-3">
                <button
                  onClick={() => setDeleteConfirm(null)}
                  className="flex-1 px-4 py-2.5 bg-[var(--bg-tertiary)] hover:bg-[var(--bg-primary)] border border-[var(--border-color)] rounded-xl font-medium transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={() => deleteProject(deleteConfirm.id)}
                  className="flex-1 px-4 py-2.5 bg-red-500 hover:bg-red-600 text-white rounded-xl font-medium transition-colors"
                >
                  Yes, Delete
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
