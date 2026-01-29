import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Sparkles, X, Send, Loader2, Wand2,
  Play, ChevronRight, ChevronDown, DollarSign,
  Check, AlertCircle, RotateCcw, Minimize2, Maximize2,
  Image, Link2, Settings, SkipForward, Eye,
  Zap, Crown, Coins, Clock, RefreshCw
} from 'lucide-react';
import axios from 'axios';
import ReactMarkdown from 'react-markdown';

const API_BASE = 'http://localhost:3001/api';

// ============================================================
// ENHANCED OPTION PARSING - Extract cost, tier, models
// ============================================================
const parseOptions = (content) => {
  if (!content || typeof content !== 'string') return [];
  try {
    // Match patterns like "**Option A (Budget):** description" or "**Option A:** description"
    const optionPattern = /\*\*Option ([A-C])(?:\s*\(([^)]+)\))?(?::|\*\*:)\*?\*?\s*([^\n]+(?:\n(?!\*\*Option)[^\n]*)*)/gi;
    const options = [];
    let match;
    
    while ((match = optionPattern.exec(content)) !== null) {
      const letter = match[1].toUpperCase();
      const tier = match[2] || 'Balanced';
      const description = (match[3] || '').trim();
      
      // Extract cost from description - multiple patterns supported:
      // ~$1.50 credits, $1.50, ~1.50 credits, Cost: ~1.50, 1.50 cr, ~$1.50
      let cost = null;
      const costPatterns = [
        /~?\$\s*([\d.]+)\s*(credits?|cr)?/i,           // ~$1.50 or $1.50 credits
        /~\s*([\d.]+)\s*(credits?|cr)/i,               // ~1.50 credits
        /cost:?\s*~?\$?\s*([\d.]+)/i,                  // Cost: ~1.50
        /([\d.]+)\s*(credits?|cr)\b/i,                 // 1.50 credits
      ];
      
      for (const pattern of costPatterns) {
        const costMatch = description.match(pattern);
        if (costMatch && costMatch[1]) {
          const parsed = parseFloat(costMatch[1]);
          if (!isNaN(parsed) && parsed > 0 && parsed < 100) {
            cost = parsed;
            break;
          }
        }
      }
      
      // Extract model names (e.g., "flux-1.1-pro" or "kling-2.6-pro")
      const modelPattern = /\b(flux[\w.-]*|kling[\w.-]*|veo[\w.-]*|sora[\w.-]*|minimax[\w.-]*|ltx[\w.-]*|ideogram[\w.-]*|nano[\w.-]*|recraft[\w.-]*|sd[\w.-]*|stable[\w.-]*)\b/gi;
      const models = [];
      let modelMatch;
      while ((modelMatch = modelPattern.exec(description)) !== null) {
        models.push(modelMatch[1].toLowerCase());
      }
      
      // Determine tier color
      const tierLower = tier.toLowerCase();
      const tierInfo = {
        budget: { color: 'emerald', icon: Coins },
        balanced: { color: 'cyan', icon: Zap },
        premium: { color: 'amber', icon: Crown },
        recommended: { color: 'cyan', icon: Zap }
      };
      
      // Clean description - remove cost references
      let cleanDescription = description
        .replace(/~?\$\s*[\d.]+\s*(credits?|cr)?/gi, '')
        .replace(/~\s*[\d.]+\s*(credits?|cr)/gi, '')
        .replace(/cost:?\s*~?\$?\s*[\d.]+/gi, '')
        .replace(/([\d.]+)\s*(credits?|cr)\b/gi, '')
        .replace(/\s+/g, ' ')
        .trim();
      
      options.push({
        letter,
        tier,
        tierInfo: tierInfo[tierLower] || tierInfo.balanced,
        description: cleanDescription,
        cost,
        models
      });
    }
    return options;
  } catch (e) {
    console.warn('parseOptions error:', e);
    return [];
  }
};

// Parse question choices from AI response
const parseQuestionChoices = (content) => {
  if (!content || typeof content !== 'string') return [];
  
  const allChoices = [];
  const seenChoices = new Set();
  
  const addChoice = (text) => {
    if (!text || typeof text !== 'string') return;
    const clean = text.trim().replace(/^[-•*]\s*/, '').replace(/[?.,!]+$/, '').trim();
    if (clean && clean.length >= 2 && clean.length <= 35 && !seenChoices.has(clean.toLowerCase())) {
      if (/^(what|how|why|when|where|which|do|does|is|are|can|could|would|will)\b/i.test(clean)) return;
      if (/\d{4}/.test(clean)) return;
      
      seenChoices.add(clean.toLowerCase());
      allChoices.push({
        value: String(clean),
        label: String(clean.charAt(0).toUpperCase() + clean.slice(1))
      });
    }
  };
  
  try {
    // Pattern 1: Bold options
    const boldPattern = /\*\*([^*]{2,30})\*\*/g;
    let match;
    while ((match = boldPattern.exec(content)) !== null) {
      const item = match[1].trim();
      if (item.split(/\s+/).length <= 4 && !item.includes(':') && !/^(step|option|total|your|the|a|ready|plan)\s/i.test(item)) {
        addChoice(item);
      }
    }
    
    // Pattern 2: "X, Y, or Z?"
    const simpleOrPattern = /(\b[\w\s/]+),\s*([\w\s/]+),?\s+or\s+([\w\s/]+)\?/gi;
    while ((match = simpleOrPattern.exec(content)) !== null) {
      addChoice(match[1]);
      addChoice(match[2]);
      addChoice(match[3]);
    }
  } catch (e) {
    console.warn('parseQuestionChoices error:', e);
    return [];
  }
  
  return allChoices.filter(c => c && typeof c.label === 'string' && c.label.length > 0).slice(0, 6);
};

// Strip plan tags from content
const stripPlanTags = (content) => {
  if (!content) return '';
  if (typeof content !== 'string') return String(content);
  return content.replace(/<plan>[\s\S]*?<\/plan>/g, '').trim();
};

// ============================================================
// SETTINGS SCHEMA FOR GENERATION OPTIONS
// ============================================================
const STEP_SETTINGS = {
  image: {
    aspectRatio: ['1:1', '16:9', '9:16', '4:3', '21:9'],
    resolution: ['1K', '2K', '4K'],  // Matches Nano Banana Pro and other modern models
    variations: [1, 2, 3, 4]
  },
  video: {
    aspectRatio: ['16:9', '9:16', '1:1'],
    // Duration options: Kling uses 5/10, Sora uses 4/8/12, Veo uses 5/8
    duration: ['4', '5', '8', '10', '12'],
    fps: [24, 30]
  }
};

// ============================================================
// ENHANCED MARKDOWN COMPONENT - Clean and readable
// ============================================================
function ChatMarkdown({ content }) {
  return (
    <div className="prose prose-sm prose-invert max-w-none 
      prose-headings:text-white prose-headings:font-semibold prose-headings:mt-3 prose-headings:mb-2
      prose-h1:text-lg prose-h2:text-base prose-h3:text-sm
      prose-p:text-gray-300 prose-p:my-2 prose-p:leading-relaxed prose-p:text-sm
      prose-strong:text-white prose-strong:font-semibold
      prose-em:text-gray-400 prose-em:not-italic
      prose-li:text-gray-300 prose-li:my-0.5 prose-li:text-sm
      prose-ul:my-2 prose-ol:my-2 prose-ul:pl-4 prose-ol:pl-4
      prose-li:marker:text-cyan-500
      prose-code:bg-gray-800 prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:text-cyan-300 prose-code:text-xs prose-code:before:content-none prose-code:after:content-none
      prose-blockquote:border-l-2 prose-blockquote:border-cyan-500 prose-blockquote:pl-4 prose-blockquote:italic prose-blockquote:text-gray-400 prose-blockquote:bg-cyan-500/5 prose-blockquote:py-2 prose-blockquote:rounded-r prose-blockquote:not-italic
      prose-a:text-cyan-400 prose-a:no-underline hover:prose-a:underline
    ">
      <ReactMarkdown
        components={{
          // Clean, simple rendering
          p: ({ children }) => <p className="text-sm text-gray-300 leading-relaxed my-2">{children}</p>,
          strong: ({ children }) => <strong className="text-white font-semibold">{children}</strong>,
          em: ({ children }) => <em className="text-gray-400 not-italic">{children}</em>,
          ul: ({ children }) => <ul className="my-2 pl-4 space-y-1">{children}</ul>,
          ol: ({ children }) => <ol className="my-2 pl-5 space-y-1 list-decimal">{children}</ol>,
          li: ({ children }) => <li className="text-sm text-gray-300">{children}</li>,
          h1: ({ children }) => <h1 className="text-lg font-bold text-white mt-3 mb-2">{children}</h1>,
          h2: ({ children }) => <h2 className="text-base font-semibold text-white mt-3 mb-2">{children}</h2>,
          h3: ({ children }) => <h3 className="text-sm font-semibold text-white mt-2 mb-1">{children}</h3>,
          code: ({ inline, children }) => 
            inline ? (
              <code className="bg-gray-800 px-1.5 py-0.5 rounded text-cyan-300 text-xs">{children}</code>
            ) : (
              <code className="block bg-gray-800 p-3 rounded-lg text-cyan-300 text-xs overflow-x-auto">{children}</code>
            ),
          blockquote: ({ children }) => (
            <blockquote className="border-l-2 border-cyan-500 pl-4 py-2 bg-cyan-500/5 rounded-r text-gray-400 my-2">
              {children}
            </blockquote>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}

// ============================================================
// OPTION CARD COMPONENT - Rich interactive cards
// ============================================================
function OptionCard({ option, onSelect, isSelected }) {
  const TierIcon = option.tierInfo?.icon || Zap;
  const tierColor = option.tierInfo?.color || 'cyan';
  
  const colorClasses = {
    emerald: 'from-emerald-500 to-green-600 border-emerald-500/30 hover:border-emerald-400 bg-emerald-500/5',
    cyan: 'from-cyan-500 to-blue-600 border-cyan-500/30 hover:border-cyan-400 bg-cyan-500/5',
    amber: 'from-amber-500 to-orange-600 border-amber-500/30 hover:border-amber-400 bg-amber-500/5'
  };
  
  return (
    <motion.button
      onClick={() => onSelect(`Option ${option.letter}`)}
      whileHover={{ scale: 1.01, y: -2 }}
      whileTap={{ scale: 0.99 }}
      className={`w-full text-left p-4 rounded-xl border-2 transition-all duration-200 ${colorClasses[tierColor]} hover:shadow-lg hover:shadow-${tierColor}-500/10`}
    >
      <div className="flex items-start gap-4">
        {/* Letter Badge */}
        <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${colorClasses[tierColor].split(' ')[0]} ${colorClasses[tierColor].split(' ')[1]} flex items-center justify-center text-white font-bold text-lg shadow-lg`}>
          {option.letter}
        </div>
        
        <div className="flex-1 min-w-0">
          {/* Tier & Cost Row */}
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <TierIcon className={`w-4 h-4 text-${tierColor}-400`} />
              <span className={`text-sm font-medium text-${tierColor}-400`}>{option.tier}</span>
            </div>
            {/* Cost display with NaN guard */}
            {option.cost && !isNaN(option.cost) && option.cost > 0 ? (
              <span className="text-sm font-semibold text-[var(--text-primary)] flex items-center gap-1">
                <DollarSign className="w-3 h-3" />
                {option.cost.toFixed(2)}
              </span>
            ) : (
              <span className="text-xs text-[var(--text-muted)] italic">
                See details
              </span>
            )}
          </div>
          
          {/* Description */}
          <p className="text-sm text-[var(--text-secondary)] leading-relaxed line-clamp-2">
            {option.description}
          </p>
          
          {/* Model Chain */}
          {option.models.length > 0 && (
            <div className="mt-2 flex items-center gap-1 text-xs text-[var(--text-muted)]">
              <span className="opacity-60">Models:</span>
              {option.models.map((model, i) => (
                <span key={model}>
                  <span className="text-cyan-400">{model}</span>
                  {i < option.models.length - 1 && <span className="mx-1">→</span>}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </motion.button>
  );
}

// ============================================================
// INLINE CHOICES - Clickable options within message text
// ============================================================
function InlineChoices({ text, onChoiceClick }) {
  // Detect patterns like "option1, option2, or option3" or "**option1**, **option2**"
  // Returns JSX with clickable pills for detected options
  
  // Pattern to find choice lists: words separated by commas and "or"
  // e.g., "professional, casual, or luxury" or "social media, website, ads"
  const choicePattern = /\b([\w\s/]+(?:,\s*[\w\s/]+)+(?:,?\s*(?:or|and)\s*[\w\s/]+)?)\b/gi;
  
  // Also detect bold options: **option**
  const boldPattern = /\*\*([^*]+)\*\*/g;
  
  // Extract inline choices from text
  const extractChoices = (inputText) => {
    const choices = [];
    
    // Find bold options first (higher priority)
    let boldMatch;
    const boldOptions = [];
    while ((boldMatch = boldPattern.exec(inputText)) !== null) {
      const option = boldMatch[1].trim();
      // Filter out headers and full sentences
      if (option.length >= 3 && option.length <= 30 && !option.includes(':') && !/^(step|option|phase)\s*\d/i.test(option)) {
        boldOptions.push(option);
      }
    }
    
    // Look for comma/or separated lists
    const listMatch = inputText.match(/[-–]\s*([\w\s/]+(?:,\s*[\w\s/]+)*(?:,?\s*(?:or|and)\s*[\w\s/]+)?)\?/);
    if (listMatch) {
      const parts = listMatch[1].split(/,\s*|\s+(?:or|and)\s+/);
      parts.forEach(p => {
        const clean = p.trim();
        if (clean.length >= 3 && clean.length <= 25) {
          choices.push(clean);
        }
      });
    }
    
    // Add bold options that aren't already in choices
    boldOptions.forEach(opt => {
      if (!choices.some(c => c.toLowerCase() === opt.toLowerCase())) {
        choices.push(opt);
      }
    });
    
    return choices.slice(0, 6); // Limit to 6 choices
  };
  
  const choices = extractChoices(text);
  
  if (choices.length === 0) return null;
  
  return (
    <div className="flex flex-wrap gap-1.5 mt-2">
      {choices.map((choice, idx) => (
        <motion.button
          key={idx}
          whileHover={{ scale: 1.03 }}
          whileTap={{ scale: 0.97 }}
          onClick={() => onChoiceClick(choice)}
          className="px-3 py-1 text-xs rounded-lg bg-gradient-to-r from-purple-500/10 to-cyan-500/10 border border-purple-500/30 hover:border-cyan-400 text-purple-300 hover:text-cyan-300 transition-all"
        >
          {choice}
        </motion.button>
      ))}
    </div>
  );
}

// ============================================================
// INLINE PLAN CARD - Expandable with settings + Completion State
// ============================================================
function InlinePlanCard({ plan, onExecute, onEditPrompt, onStartFresh, onCreateAnother, isExecuting = false, executionStatus = null }) {
  const [expandedSteps, setExpandedSteps] = useState(new Set([1]));
  const [editedPrompts, setEditedPrompts] = useState({});
  const [stepOptions, setStepOptions] = useState({});

  if (!plan) return null;
  
  // Execution state detection
  const isCompleted = executionStatus?.status === 'completed';
  const isFailed = executionStatus?.status === 'failed';
  const isRunning = executionStatus && ['running', 'starting'].includes(executionStatus.status);
  
  // Single-step detection
  const isSingleStep = plan.steps?.length === 1;
  
  // Get step statuses from execution
  const stepStatuses = executionStatus?.stepStatuses || [];
  const completedSteps = stepStatuses.filter(s => s.status === 'completed');
  const failedSteps = stepStatuses.filter(s => s.status === 'failed');
  
  // Get final result thumbnail (from last completed step or generations)
  const getFinalResult = () => {
    if (!executionStatus?.generations?.length && !completedSteps.length) return null;
    
    // Try to get from generations first (prefer the last one)
    const gens = executionStatus?.generations || [];
    const completedGens = gens.filter(g => g.status === 'completed');
    const lastGen = completedGens[completedGens.length - 1];
    
    if (lastGen?.result) {
      // For videos, use the result URL directly (frontend will handle video preview)
      const isVideo = lastGen.type === 'video' || lastGen.result?.includes('.mp4') || lastGen.result?.includes('.webm');
      return { 
        thumbnail: lastGen.thumbnailUrl || lastGen.result, 
        fullUrl: lastGen.result,
        isVideo 
      };
    }
    
    // Fall back to step status
    const lastCompleted = completedSteps[completedSteps.length - 1];
    if (lastCompleted?.result) {
      const isVideo = lastCompleted.result?.includes('.mp4') || lastCompleted.result?.includes('.webm');
      return { 
        thumbnail: lastCompleted.thumbnailUrl || lastCompleted.result, 
        fullUrl: lastCompleted.result,
        isVideo 
      };
    }
    
    return null;
  };
  
  const finalResult = getFinalResult();

  const toggleStep = (order) => {
    setExpandedSteps(prev => {
      const next = new Set(prev);
      if (next.has(order)) next.delete(order);
      else next.add(order);
      return next;
    });
  };

  const handlePromptChange = (order, newPrompt) => {
    setEditedPrompts(prev => ({ ...prev, [order]: newPrompt }));
  };

  const handleOptionChange = (order, key, value) => {
    setStepOptions(prev => ({
      ...prev,
      [order]: { ...prev[order], [key]: value }
    }));
  };

  const getUpdatedPlan = () => ({
    ...plan,
    steps: plan.steps.map(step => ({
      ...step,
      prompt: editedPrompts[step.order] || step.prompt,
      options: { ...step.options, ...stepOptions[step.order] }
    }))
  });

  // COMPLETED STATE - Show success with results and next actions
  if (isCompleted && failedSteps.length === 0) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-gradient-to-br from-green-500/10 to-emerald-500/5 border-2 border-green-500/30 rounded-2xl overflow-hidden shadow-xl"
      >
        {/* Completed Header */}
        <div className="px-5 py-4 border-b border-green-500/20 bg-gradient-to-r from-green-500/10 to-emerald-500/10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-green-500 to-emerald-600 flex items-center justify-center shadow-lg">
              <Check className="w-5 h-5 text-white" />
            </div>
            <div className="flex-1">
              <h4 className="font-semibold text-green-400">All Done!</h4>
              <p className="text-xs text-[var(--text-muted)]">
                {isSingleStep ? 'Generation complete' : `${completedSteps.length} steps completed`} • ${(executionStatus?.creditsUsed || 0).toFixed(2)} credits used
              </p>
            </div>
          </div>
        </div>

        {/* Result Preview */}
        {finalResult && (
          <div className="p-4">
            <a 
              href={finalResult.fullUrl || finalResult.thumbnail}
              target="_blank"
              rel="noopener noreferrer"
              className="block relative group"
            >
              {finalResult.isVideo ? (
                <video 
                  src={finalResult.fullUrl}
                  className="w-full h-48 object-cover rounded-xl border border-green-500/20 group-hover:opacity-90 transition-opacity"
                  muted
                  loop
                  autoPlay
                  playsInline
                />
              ) : (
                <img 
                  src={finalResult.thumbnail}
                  alt="Final result"
                  className="w-full h-48 object-cover rounded-xl border border-green-500/20 group-hover:opacity-90 transition-opacity"
                />
              )}
              <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                <div className="px-4 py-2 rounded-lg bg-black/60 text-white text-sm flex items-center gap-2">
                  <Eye className="w-4 h-4" /> {finalResult.isVideo ? 'View Video' : 'View Full Size'}
                </div>
              </div>
            </a>
          </div>
        )}

        {/* What's Next Actions */}
        <div className="px-5 py-4 border-t border-green-500/20 bg-[var(--bg-secondary)]">
          <p className="text-xs text-[var(--text-muted)] mb-3">What would you like to do next?</p>
          <div className="flex gap-2 flex-wrap">
            {onCreateAnother && (
              <button
                onClick={() => onCreateAnother(getUpdatedPlan())}
                className="flex-1 py-2.5 px-4 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 text-white text-sm font-medium hover:from-cyan-400 hover:to-blue-500 transition-all flex items-center justify-center gap-2 shadow-lg shadow-cyan-500/20"
              >
                <RefreshCw className="w-4 h-4" /> Create Another
              </button>
            )}
            {onStartFresh && (
              <button
                onClick={onStartFresh}
                className="flex-1 py-2.5 px-4 rounded-xl border border-[var(--border-color)] text-[var(--text-primary)] text-sm font-medium hover:bg-[var(--bg-tertiary)] transition-all flex items-center justify-center gap-2"
              >
                <Sparkles className="w-4 h-4" /> Start Fresh
              </button>
            )}
          </div>
        </div>
      </motion.div>
    );
  }

  // FAILED STATE - Show error with retry options
  if (isFailed || failedSteps.length > 0) {
    const allFailed = failedSteps.length === plan.steps?.length;
    
    return (
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-gradient-to-br from-red-500/10 to-orange-500/5 border-2 border-red-500/30 rounded-2xl overflow-hidden shadow-xl"
      >
        {/* Failed Header */}
        <div className="px-5 py-4 border-b border-red-500/20 bg-gradient-to-r from-red-500/10 to-orange-500/10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-red-500 to-orange-600 flex items-center justify-center shadow-lg">
              <AlertCircle className="w-5 h-5 text-white" />
            </div>
            <div className="flex-1">
              <h4 className="font-semibold text-red-400">
                {allFailed ? 'Generation Failed' : 'Partially Completed'}
              </h4>
              <p className="text-xs text-[var(--text-muted)]">
                {allFailed 
                  ? 'All steps failed - credits have been refunded'
                  : `${completedSteps.length}/${plan.steps?.length} steps succeeded • ${failedSteps.length} failed`
                }
              </p>
            </div>
          </div>
        </div>

        {/* Show completed results if any */}
        {finalResult && completedSteps.length > 0 && (
          <div className="p-4 border-b border-red-500/20">
            <p className="text-xs text-[var(--text-muted)] mb-2">Completed results:</p>
            <a 
              href={finalResult.fullUrl || finalResult.thumbnail}
              target="_blank"
              rel="noopener noreferrer"
              className="block"
            >
              {finalResult.isVideo ? (
                <video 
                  src={finalResult.fullUrl}
                  className="w-full h-32 object-cover rounded-xl border border-[var(--border-color)] hover:opacity-90 transition-opacity"
                  muted
                  loop
                  autoPlay
                  playsInline
                />
              ) : (
                <img 
                  src={finalResult.thumbnail}
                  alt="Partial result"
                  className="w-full h-32 object-cover rounded-xl border border-[var(--border-color)] hover:opacity-90 transition-opacity"
                />
              )}
            </a>
          </div>
        )}

        {/* Error Details */}
        <div className="px-5 py-3 bg-red-500/5">
          <p className="text-xs text-red-400 mb-1">Failed steps:</p>
          <ul className="text-xs text-[var(--text-muted)] space-y-1">
            {failedSteps.map(step => (
              <li key={step.order} className="flex items-center gap-2">
                <X className="w-3 h-3 text-red-400" />
                Step {step.order}: {step.action || step.modelName}
              </li>
            ))}
          </ul>
        </div>

        {/* Retry Actions */}
        <div className="px-5 py-4 border-t border-red-500/20 bg-[var(--bg-secondary)]">
          <p className="text-xs text-[var(--text-muted)] mb-3">What would you like to do?</p>
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={() => onExecute('full_auto', getUpdatedPlan())}
              className="flex-1 py-2.5 px-4 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 text-white text-sm font-medium hover:from-cyan-400 hover:to-blue-500 transition-all flex items-center justify-center gap-2"
            >
              <RotateCcw className="w-4 h-4" /> Retry
            </button>
            {onStartFresh && (
              <button
                onClick={onStartFresh}
                className="flex-1 py-2.5 px-4 rounded-xl border border-[var(--border-color)] text-[var(--text-primary)] text-sm font-medium hover:bg-[var(--bg-tertiary)] transition-all flex items-center justify-center gap-2"
              >
                <Sparkles className="w-4 h-4" /> Start Fresh
              </button>
            )}
          </div>
        </div>
      </motion.div>
    );
  }

  // DEFAULT STATE - Show plan with start buttons
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-gradient-to-br from-[var(--bg-secondary)] to-[var(--bg-tertiary)] border border-[var(--border-color)] rounded-2xl overflow-hidden shadow-xl"
    >
      {/* Plan Header */}
      <div className="px-5 py-4 border-b border-[var(--border-color)] bg-gradient-to-r from-cyan-500/10 to-blue-500/10">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center">
            <Wand2 className="w-4 h-4 text-white" />
          </div>
          <div>
            <h4 className="font-semibold text-[var(--text-primary)]">{plan.title}</h4>
            <p className="text-xs text-[var(--text-muted)]">
              {isSingleStep ? '1 step' : `${plan.steps?.length || 0} steps`} • {plan.estimatedTime}
            </p>
          </div>
        </div>
      </div>

      {/* Steps */}
      <div className="p-4 space-y-3">
        {plan.steps?.map((step, i) => {
          const isExpanded = expandedSteps.has(step.order);
          const settings = STEP_SETTINGS[step.type] || STEP_SETTINGS.image;
          const stepStatus = stepStatuses.find(s => s.order === step.order);
          const isStepRunning = stepStatus?.status === 'running' || (isRunning && executionStatus?.currentStep === step.order);
          const isStepCompleted = stepStatus?.status === 'completed';
          const isStepFailed = stepStatus?.status === 'failed';
          
          return (
            <div key={step.order} className={`bg-[var(--bg-primary)] border rounded-xl overflow-hidden transition-all ${
              isStepCompleted ? 'border-green-500/50 bg-green-500/5' :
              isStepFailed ? 'border-red-500/50 bg-red-500/5' :
              isStepRunning ? 'border-cyan-500/50 bg-cyan-500/5 animate-pulse' :
              'border-[var(--border-color)]'
            }`}>
              {/* Step Header - Always visible */}
              <button
                onClick={() => toggleStep(step.order)}
                className="w-full flex items-center gap-3 p-3 text-left hover:bg-[var(--bg-secondary)] transition-colors"
              >
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold ${
                  isStepCompleted ? 'bg-green-500/20 text-green-400' :
                  isStepFailed ? 'bg-red-500/20 text-red-400' :
                  isStepRunning ? 'bg-cyan-500/30 text-cyan-300' :
                  'bg-cyan-500/20 text-cyan-400'
                }`}>
                  {isStepCompleted ? <Check className="w-4 h-4" /> :
                   isStepFailed ? <AlertCircle className="w-4 h-4" /> :
                   isStepRunning ? <Loader2 className="w-4 h-4 animate-spin" /> :
                   step.order}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-[var(--text-primary)] truncate">{step.action}</p>
                  <p className="text-xs text-[var(--text-muted)]">
                    {isStepCompleted ? 'Completed' :
                     isStepFailed ? 'Failed' :
                     isStepRunning ? 'Running...' :
                     step.modelName}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs font-medium text-cyan-400">${step.estimatedCost?.toFixed(2)}</span>
                  {isExpanded ? (
                    <ChevronDown className="w-4 h-4 text-[var(--text-muted)]" />
                  ) : (
                    <ChevronRight className="w-4 h-4 text-[var(--text-muted)]" />
                  )}
                </div>
              </button>

              {/* Expanded Content */}
              <AnimatePresence>
                {isExpanded && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="border-t border-[var(--border-color)]"
                  >
                    <div className="p-4 space-y-4">
                      {/* Dependencies */}
                      {step.dependsOn?.length > 0 && (
                        <p className="text-xs text-purple-400 flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-purple-400"></span>
                          Uses output from Step {step.dependsOn.join(', ')}
                        </p>
                      )}
                      
                      {/* Prompt */}
                      <div>
                        <label className="text-xs text-[var(--text-muted)] mb-1 block">Prompt</label>
                        <textarea
                          value={editedPrompts[step.order] ?? step.prompt}
                          onChange={(e) => handlePromptChange(step.order, e.target.value)}
                          className="w-full text-sm bg-[var(--bg-secondary)] rounded-lg p-3 border border-[var(--border-color)] focus:border-cyan-500 focus:outline-none focus:ring-1 focus:ring-cyan-500/50 resize-none leading-relaxed"
                          rows={3}
                          disabled={isRunning}
                        />
                      </div>

                      {/* Settings Row */}
                      <div className="flex items-center gap-2 flex-wrap">
                        <Settings className="w-4 h-4 text-[var(--text-muted)]" />
                        
                        {/* Aspect Ratio */}
                        <select
                          value={stepOptions[step.order]?.aspectRatio || step.options?.aspectRatio || settings.aspectRatio[0]}
                          onChange={(e) => handleOptionChange(step.order, 'aspectRatio', e.target.value)}
                          className="text-xs bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-lg px-2 py-1.5 focus:outline-none focus:border-cyan-500"
                          disabled={isRunning}
                        >
                          {settings.aspectRatio.map(ar => (
                            <option key={ar} value={ar}>{ar}</option>
                          ))}
                        </select>

                        {/* Resolution or Duration */}
                        {step.type === 'image' && settings.resolution && (
                          <select
                            value={stepOptions[step.order]?.resolution || step.options?.resolution || settings.resolution[2]}
                            onChange={(e) => handleOptionChange(step.order, 'resolution', e.target.value)}
                            className="text-xs bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-lg px-2 py-1.5 focus:outline-none focus:border-cyan-500"
                            disabled={isRunning}
                          >
                            {settings.resolution.map(res => (
                              <option key={res} value={res}>{res}px</option>
                            ))}
                          </select>
                        )}

                        {step.type === 'video' && settings.duration && (
                          <select
                            value={stepOptions[step.order]?.duration || step.options?.duration || settings.duration[0]}
                            onChange={(e) => handleOptionChange(step.order, 'duration', e.target.value)}
                            className="text-xs bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-lg px-2 py-1.5 focus:outline-none focus:border-cyan-500"
                            disabled={isRunning}
                          >
                            {settings.duration.map(dur => (
                              <option key={dur} value={dur}>{dur}s</option>
                            ))}
                          </select>
                        )}
                      </div>
                      
                      {/* Step Result Preview (when completed) */}
                      {isStepCompleted && stepStatus?.result && (
                        <div className="pt-3 border-t border-[var(--border-color)]">
                          <p className="text-xs text-green-400 mb-2 flex items-center gap-1">
                            <Check className="w-3 h-3" /> Result ready
                          </p>
                          <a 
                            href={stepStatus.result}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="block"
                          >
                            {step.type === 'video' || stepStatus.result?.includes('.mp4') || stepStatus.result?.includes('.webm') ? (
                              <video 
                                src={stepStatus.result}
                                className="w-full h-24 object-cover rounded-lg border border-green-500/30 hover:opacity-90 transition-opacity"
                                muted
                                loop
                                autoPlay
                                playsInline
                              />
                            ) : (
                              <img 
                                src={stepStatus.thumbnailUrl || stepStatus.result}
                                alt={`Step ${step.order} result`}
                                className="w-full h-24 object-cover rounded-lg border border-green-500/30 hover:opacity-90 transition-opacity"
                              />
                            )}
                          </a>
                        </div>
                      )}
                      
                      {/* Step Failed Message */}
                      {isStepFailed && (
                        <div className="pt-3 border-t border-[var(--border-color)]">
                          <p className="text-xs text-red-400 flex items-center gap-1">
                            <AlertCircle className="w-3 h-3" /> Generation failed - credits refunded
                          </p>
                        </div>
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })}
      </div>

      {/* Footer - Cost & Actions */}
      <div className="px-5 py-4 border-t border-[var(--border-color)] bg-[var(--bg-secondary)]">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <DollarSign className="w-4 h-4 text-cyan-400" />
              <span className="text-lg font-bold text-[var(--text-primary)]">{plan.totalCost?.toFixed(2)}</span>
              <span className="text-sm text-[var(--text-muted)]">credits</span>
            </div>
            <div className="flex items-center gap-2 text-sm text-[var(--text-muted)]">
              <Clock className="w-4 h-4" />
              <span>{plan.estimatedTime}</span>
            </div>
          </div>
        </div>

        <div className="flex gap-3">
          {isRunning ? (
            <div className="flex-1 py-3 px-4 rounded-xl bg-gradient-to-r from-cyan-500/50 to-blue-600/50 text-white text-sm font-medium flex items-center justify-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" /> 
              {executionStatus?.status === 'starting' ? 'Starting...' : 
               isSingleStep ? 'Generating...' :
               `Running Step ${executionStatus?.currentStep || 1} of ${executionStatus?.totalSteps || plan.steps?.length}`}
            </div>
          ) : (
            <>
              <button
                onClick={() => onExecute('full_auto', getUpdatedPlan())}
                className="flex-1 py-3 px-4 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 text-white text-sm font-medium hover:from-cyan-400 hover:to-blue-500 transition-all flex items-center justify-center gap-2 shadow-lg shadow-cyan-500/20"
              >
                <Play className="w-4 h-4" /> {isSingleStep ? 'Generate' : 'Start All Steps'}
              </button>
              {/* Only show Step by Step for multi-step plans */}
              {!isSingleStep && (
                <button
                  onClick={() => onExecute('step_by_step', getUpdatedPlan())}
                  className="flex-1 py-3 px-4 rounded-xl border border-[var(--border-color)] text-[var(--text-primary)] text-sm font-medium hover:bg-[var(--bg-tertiary)] transition-all flex items-center justify-center gap-2"
                >
                  <SkipForward className="w-4 h-4" /> Step by Step
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </motion.div>
  );
}

// ============================================================
// EXECUTION STATUS CARD - Inline progress in chat
// ============================================================
function ExecutionStatusCard({ execution, onRetry, onTryDifferentModel }) {
  if (!execution) return null;

  const steps = execution.stepStatuses || execution.plan?.steps?.map(s => ({
    order: s.order,
    action: s.action,
    modelName: s.modelName,
    status: 'pending',
    credits: null
  })) || [];

  const completedSteps = steps.filter(s => s.status === 'completed').length;
  const failedSteps = steps.filter(s => s.status === 'failed').length;
  const totalSteps = steps.length;
  const isSingleStep = totalSteps === 1;
  const isRunning = execution.status === 'running' || execution.status === 'starting';
  const isFailed = execution.status === 'failed' || failedSteps.length > 0;
  const isComplete = execution.status === 'completed' || execution.status === 'failed';

  // Get status icon and styling (using explicit classes for Tailwind)
  const getStatusStyles = () => {
    if (execution.status === 'completed') {
      return { 
        Icon: Check, 
        iconClass: 'text-green-400',
        bgClass: 'bg-green-500/20',
        text: 'Completed' 
      };
    }
    if (execution.status === 'failed') {
      return { 
        Icon: AlertCircle, 
        iconClass: 'text-red-400',
        bgClass: 'bg-red-500/20',
        text: 'Failed' 
      };
    }
    if (execution.status === 'running') {
      return { 
        Icon: Loader2, 
        iconClass: 'text-cyan-400 animate-spin',
        bgClass: 'bg-cyan-500/20',
        text: 'Running' 
      };
    }
    return { 
      Icon: Clock, 
      iconClass: 'text-amber-400',
      bgClass: 'bg-amber-500/20',
      text: 'Pending' 
    };
  };

  const statusStyle = getStatusStyles();
  const StatusIcon = statusStyle.Icon;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={`rounded-xl border-2 overflow-hidden ${
        isComplete 
          ? (failedSteps.length > 0 ? 'border-amber-500/30 bg-amber-500/5' : 'border-green-500/30 bg-green-500/5')
          : 'border-cyan-500/30 bg-cyan-500/5'
      }`}
    >
      {/* Header */}
      <div className="px-4 py-3 border-b border-[var(--border-color)] flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className={`w-8 h-8 rounded-lg ${statusStyle.bgClass} flex items-center justify-center`}>
            <StatusIcon className={`w-4 h-4 ${statusStyle.iconClass}`} />
          </div>
          <div>
            <p className="text-sm font-medium text-[var(--text-primary)]">
              {isRunning ? (isSingleStep ? 'Generating...' : 'Generating...') : isFailed ? 'Failed' : statusStyle.text}
            </p>
            <p className="text-xs text-[var(--text-muted)]">
              {isSingleStep 
                ? (isComplete ? 'Done' : 'In progress')
                : `${completedSteps}/${totalSteps} steps ${failedSteps.length > 0 ? `• ${failedSteps.length} failed` : ''}`
              }
            </p>
          </div>
        </div>
      </div>

      {/* Step List with Thumbnails */}
      <div className="px-4 py-3 space-y-3">
        {steps.map((step, idx) => {
          const getStepIcon = () => {
            switch (step.status) {
              case 'completed': return <Check className="w-4 h-4 text-green-400" />;
              case 'running': return <Loader2 className="w-4 h-4 text-cyan-400 animate-spin" />;
              case 'failed': return <X className="w-4 h-4 text-red-400" />;
              default: return <div className="w-4 h-4 rounded-full border-2 border-[var(--text-muted)]" />;
            }
          };
          
          // Find matching generation for thumbnail
          const gen = execution.generations?.find(g => {
            const opts = typeof g.options === 'string' ? JSON.parse(g.options || '{}') : (g.options || {});
            return opts.directorStep === step.order;
          }) || execution.generations?.[idx];

          return (
            <div key={step.order} className={`rounded-lg border overflow-hidden transition-all ${
              step.status === 'completed' ? 'border-green-500/30 bg-green-500/5' :
              step.status === 'running' ? 'border-cyan-500/50 bg-cyan-500/10 animate-pulse' :
              step.status === 'failed' ? 'border-red-500/30 bg-red-500/5' :
              'border-[var(--border-color)] bg-[var(--bg-primary)]'
            }`}>
              {/* Step Header */}
              <div className="flex items-center gap-3 p-3">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                  step.status === 'completed' ? 'bg-green-500/20' :
                  step.status === 'running' ? 'bg-cyan-500/20' :
                  step.status === 'failed' ? 'bg-red-500/20' :
                  'bg-[var(--bg-tertiary)]'
                }`}>
                  {getStepIcon()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-medium ${
                    step.status === 'completed' ? 'text-green-400' :
                    step.status === 'running' ? 'text-cyan-400' :
                    step.status === 'failed' ? 'text-red-400' :
                    'text-[var(--text-muted)]'
                  }`}>
                    {step.status === 'completed' ? '✅ ' : step.status === 'running' ? '⏳ ' : step.status === 'failed' ? '❌ ' : ''}
                    Step {step.order}: {step.action || step.modelName}
                  </p>
                  <p className="text-xs text-[var(--text-muted)]">
                    {step.status === 'completed' ? 'Done' :
                     step.status === 'running' ? 'Generating...' :
                     step.status === 'failed' ? 'Failed - Credits refunded' :
                     'Waiting...'}
                    {step.status === 'completed' && step.credits ? ` • $${step.credits.toFixed(2)}` : ''}
                  </p>
                </div>
              </div>
              
              {/* Thumbnail for completed step - Show immediately! */}
              {step.status === 'completed' && (gen?.thumbnailUrl || gen?.result || step.thumbnailUrl || step.result) && (
                <div className="px-3 pb-3">
                  <a 
                    href={gen?.result || step.result || gen?.thumbnailUrl || step.thumbnailUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block"
                  >
                    <img 
                      src={gen?.thumbnailUrl || gen?.result || step.thumbnailUrl || step.result}
                      alt={`Step ${step.order} result`}
                      className="w-full h-24 object-cover rounded-lg border border-[var(--border-color)] hover:opacity-90 transition-opacity"
                    />
                  </a>
                </div>
              )}
              
              {/* Progress message for next step */}
              {step.status === 'completed' && idx < steps.length - 1 && steps[idx + 1]?.status === 'running' && (
                <div className="px-3 pb-3">
                  <p className="text-xs text-cyan-400 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse"></span>
                    Now running Step {idx + 2}...
                  </p>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Footer with totals */}
      {isComplete && (
        <div className="px-4 py-2 border-t border-[var(--border-color)] bg-[var(--bg-secondary)]">
          <div className="flex items-center justify-between text-xs">
            <span className="text-[var(--text-muted)]">Credits used</span>
            <span className={`font-medium ${failedSteps > 0 ? 'text-amber-400' : 'text-green-400'}`}>
              ${(execution.creditsUsed || 0).toFixed(2)}
            </span>
          </div>
        </div>
      )}

      {/* Thumbnails for completed generations */}
      {execution.generations?.length > 0 && (
        <div className="px-4 py-3 border-t border-[var(--border-color)]">
          <div className="flex gap-2 overflow-x-auto pb-1">
            {execution.generations.map((gen, idx) => (
              <a 
                key={idx}
                href={gen.result || gen.thumbnailUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-shrink-0"
              >
                <img 
                  src={gen.thumbnailUrl || gen.result}
                  alt={`Generation ${idx + 1}`}
                  className="w-16 h-16 object-cover rounded-lg border border-[var(--border-color)] hover:opacity-80 transition-opacity"
                />
              </a>
            ))}
          </div>
        </div>
      )}

      {/* Failure Actions - Show retry options when steps failed */}
      {isFailed && (onRetry || onTryDifferentModel) && (
        <div className="px-4 py-3 border-t border-[var(--border-color)] bg-red-500/5">
          <p className="text-xs text-red-400 mb-2">
            {failedSteps.length === totalSteps 
              ? 'All steps failed. Would you like to try again?' 
              : `${failedSteps.length} step${failedSteps.length > 1 ? 's' : ''} failed. What would you like to do?`}
          </p>
          <div className="flex gap-2">
            {onRetry && (
              <button
                onClick={onRetry}
                className="flex-1 px-3 py-2 rounded-lg bg-cyan-500/20 text-cyan-400 text-xs font-medium hover:bg-cyan-500/30 transition-colors flex items-center justify-center gap-1"
              >
                <RotateCcw className="w-3 h-3" /> Retry Failed
              </button>
            )}
            {onTryDifferentModel && (
              <button
                onClick={onTryDifferentModel}
                className="flex-1 px-3 py-2 rounded-lg bg-purple-500/20 text-purple-400 text-xs font-medium hover:bg-purple-500/30 transition-colors flex items-center justify-center gap-1"
              >
                <RefreshCw className="w-3 h-3" /> Try Different Model
              </button>
            )}
          </div>
        </div>
      )}
    </motion.div>
  );
}


// ============================================================
// MAIN FLOATING ASSISTANT COMPONENT
// ============================================================
export default function FloatingAssistant({ user }) {
  // Emit event for OmniHub to refresh generations
  const triggerGenerationsRefresh = useCallback(() => {
    window.dispatchEvent(new CustomEvent('director-generation-update'));
  }, []);

  const [isOpen, setIsOpen] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  
  // Chat state
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingContent, setStreamingContent] = useState('');
  const [conversationId, setConversationId] = useState(null);
  const [currentPlan, setCurrentPlan] = useState(null);
  const [attachments, setAttachments] = useState([]);
  
  // Execution state
  const [activeExecution, setActiveExecution] = useState(null);
  const [executionMode, setExecutionMode] = useState('auto'); // 'auto' or 'step_by_step'
  const [pausedAtStep, setPausedAtStep] = useState(null);
  
  // UI state
  const [suggestedActions, setSuggestedActions] = useState([]);
  const [selectedDirectorModel, setSelectedDirectorModel] = useState(null);
  const [availableDirectorModels, setAvailableDirectorModels] = useState([]);
  
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);
  const fileInputRef = useRef(null);

  const getAuthHeaders = () => ({
    headers: { Authorization: `Bearer ${localStorage.getItem('userToken')}` }
  });

  // Load director models
  useEffect(() => {
    const loadDirectorModels = async () => {
      try {
        const res = await axios.get(`${API_BASE}/director/models`, getAuthHeaders());
        setAvailableDirectorModels(res.data.models || []);
        setSelectedDirectorModel(res.data.current);
      } catch (e) {
        console.error('Failed to load director models:', e);
      }
    };
    if (isOpen && user) loadDirectorModels();
  }, [isOpen, user]);

  const handleDirectorModelChange = async (modelId) => {
    try {
      await axios.post(`${API_BASE}/director/models`, { modelId }, getAuthHeaders());
      setSelectedDirectorModel(modelId);
    } catch (e) {
      console.error('Failed to update director model:', e);
    }
  };

  // Load active conversation
  useEffect(() => {
    if (user && isOpen && !conversationId) {
      loadActiveConversation();
    }
  }, [user, isOpen]);

  const loadActiveConversation = async () => {
    try {
      const res = await axios.get(`${API_BASE}/director/conversations`, getAuthHeaders());
      if (res.data && res.data.length > 0) {
        const activeConv = res.data.find(c => c.status === 'active') || res.data[0];
        setConversationId(activeConv.id);
        const sanitizedMessages = (activeConv.messages || []).map(m => ({
          ...m,
          content: typeof m.content === 'string' ? m.content : String(m.content || ''),
          attachments: Array.isArray(m.attachments) ? m.attachments.map(a => ({
            type: String(a?.type || 'unknown'),
            data: String(a?.data || ''),
            name: String(a?.name || 'attachment')
          })) : undefined
        }));
        setMessages(sanitizedMessages);
        if (activeConv.currentPlan) {
          setCurrentPlan(activeConv.currentPlan);
        }
      }
    } catch (e) {
      console.error('Failed to load conversation:', e);
    }
  };

  // Scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingContent]);

  // Focus input
  useEffect(() => {
    if (isOpen && !isMinimized) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen, isMinimized]);

  // Poll for execution updates and update inline status message
  useEffect(() => {
    const execId = activeExecution?.executionId || activeExecution?.id;
    const isActiveExecution = activeExecution && execId && 
      (activeExecution.status === 'running' || activeExecution.status === 'starting');
    
    if (isActiveExecution) {
      let pollCount = 0;
      const maxPolls = 300; // 10 minutes at 2s intervals
      
      const interval = setInterval(async () => {
        pollCount++;
        
        // Timeout detection - if polling for too long with no progress, mark as stuck
        if (pollCount > maxPolls) {
          clearInterval(interval);
          setMessages(prev => [...prev, {
            role: 'assistant',
            content: `**Execution timed out** - The process took longer than expected. This might be due to high server load.\n\nWould you like me to:\n- **Retry** the execution\n- **Try a different model** that might be faster`,
            isError: true
          }]);
          setActiveExecution(prev => prev ? { ...prev, status: 'failed' } : null);
          return;
        }
        
        try {
          const res = await axios.get(`${API_BASE}/director/executions/${execId}`, getAuthHeaders());
          setActiveExecution(res.data);
          
          // Update the execution message in the chat
          setMessages(prev => prev.map(msg => 
            msg.role === 'execution' && (msg.executionId === execId || msg.execution?.id === execId || msg.execution?.executionId === execId)
              ? { ...msg, execution: res.data }
              : msg
          ));
          
          triggerGenerationsRefresh();
          
          // Check for step-by-step pause
          if (executionMode === 'step_by_step' && res.data.currentStep > (pausedAtStep || 0)) {
            setPausedAtStep(res.data.currentStep);
          }
          
          // When execution finishes (completed, failed, or any non-running status), add a summary message
          if (res.data.status !== 'running' && res.data.status !== 'starting') {
            clearInterval(interval);
            
            // Generate completion summary
            const steps = res.data.stepStatuses || [];
            const completedSteps = steps.filter(s => s.status === 'completed');
            const failedSteps = steps.filter(s => s.status === 'failed');
            const totalCredits = res.data.creditsUsed || 0;
            
            let summaryContent = '';
            if (res.data.status === 'completed' && failedSteps.length === 0) {
              summaryContent = `**All done!** Successfully completed ${completedSteps.length} step${completedSteps.length !== 1 ? 's' : ''} using **$${totalCredits.toFixed(2)} credits**.\n\nYour generations are ready in the gallery. Would you like to:\n- **Create another** version with different settings\n- **Upscale or enhance** these results\n- Start something **completely new**`;
            } else if (failedSteps.length > 0) {
              const failedNames = failedSteps.map(s => s.action || `Step ${s.order}`).join(', ');
              summaryContent = `**Partially completed** - ${completedSteps.length}/${steps.length} steps succeeded.\n\n**Failed:** ${failedNames}\n\nCredits for failed steps have been refunded. Would you like me to:\n- **Retry** the failed steps\n- **Try a different model** for those steps\n- **Continue** with what we have`;
            } else {
              summaryContent = `Execution finished with status: ${res.data.status}. Let me know if you'd like to try again or do something different.`;
            }
            
            setMessages(prev => [...prev, {
              role: 'assistant',
              content: summaryContent,
              isCompletionSummary: true
            }]);
          }
        } catch (e) {
          console.error('Failed to poll execution:', e);
          clearInterval(interval);
        }
      }, 2000);
      return () => clearInterval(interval);
    }
  }, [activeExecution?.executionId, activeExecution?.id, activeExecution?.status, executionMode, pausedAtStep, triggerGenerationsRefresh]);

  // Detect suggested actions - show quick actions based on conversation state
  const detectSuggestedActions = useCallback((content) => {
    const actions = [];
    
    // When plan exists but execution not started - show "Looks good, start!" option
    if (currentPlan && !activeExecution) {
      setSuggestedActions([
        { label: 'Looks good, start!', value: '__EXECUTE__', primary: true },
        { label: 'Make changes', value: "I'd like to make some changes to the plan" },
      ]);
      return;
    }
    
    // When execution is running or completed, don't show start actions
    if (activeExecution) {
      setSuggestedActions([]);
      return;
    }
    
    // Default actions for empty conversation
    if (messages.length === 0) {
      actions.push({ label: '🎨 Create image', value: 'I want to create an image' });
      actions.push({ label: '🎬 Create video', value: 'I want to create a video' });
      actions.push({ label: '🎭 UGC content', value: 'Help me create UGC content' });
      actions.push({ label: '✨ Multi-step workflow', value: 'Help me create a multi-step workflow' });
    }
    
    const validActions = actions.filter(a => 
      a && typeof a.label === 'string' && a.label.length > 0 && 
      !a.label.includes('[object') && typeof a.value === 'string' && !a.value.includes('[object')
    );
    setSuggestedActions(validActions);
  }, [currentPlan, activeExecution, messages.length]);

  useEffect(() => {
    if (!isStreaming && messages.length > 0) {
      const lastMsg = messages[messages.length - 1];
      if (lastMsg?.role === 'assistant' && typeof lastMsg.content === 'string') {
        detectSuggestedActions(lastMsg.content);
      }
    } else if (messages.length === 0) {
      detectSuggestedActions('');
    }
  }, [messages, isStreaming, detectSuggestedActions]);
  
  // Also trigger when plan or execution state changes
  useEffect(() => {
    detectSuggestedActions('');
  }, [currentPlan, activeExecution, detectSuggestedActions]);

  const handleSend = async (overrideMessage = null) => {
    if (overrideMessage && typeof overrideMessage === 'object') {
      if (overrideMessage.target || overrideMessage.type || overrideMessage.nativeEvent) {
        overrideMessage = null;
      }
    }
    
    const messageToSend = String(overrideMessage || input || '').trim();
    if (messageToSend === '[object Object]' || messageToSend.includes('[object Object]')) return;
    if ((!messageToSend && attachments.length === 0) || isStreaming || !user) return;

    // Auto-detect and fetch URLs in the message before sending
    const urlPattern = /https?:\/\/[^\s<>"{}|\\^`\[\]]+/gi;
    const detectedUrls = messageToSend.match(urlPattern) || [];
    let enhancedAttachments = [...attachments];
    
    // Try to fetch content from detected URLs (YouTube, images, etc.)
    for (const url of detectedUrls.slice(0, 3)) { // Limit to 3 URLs
      try {
        const response = await axios.post(`${API_BASE}/director/analyze-url`, { url }, {
          headers: { Authorization: `Bearer ${localStorage.getItem('userToken')}` },
          timeout: 10000
        });
        
        if (response.data.success && response.data.data) {
          enhancedAttachments.push({
            type: 'image',
            data: response.data.data,
            name: response.data.metadata?.title || response.data.type + ' preview',
            sourceUrl: url,
            sourceType: response.data.type
          });
        }
      } catch (e) {
        console.log('URL fetch skipped:', url);
      }
    }

    const userMessage = messageToSend;
    const simpleAttachments = enhancedAttachments.length > 0 
      ? enhancedAttachments.map(a => ({
          type: String(a.type || 'unknown'),
          data: String(a.data || ''),
          name: String(a.name || 'attachment')
        }))
      : [];
    
    setInput('');
    setAttachments([]);
    setMessages(prev => [...prev, { role: 'user', content: userMessage }]);
    setIsStreaming(true);
    setStreamingContent('');

    try {
      const requestBody = {
        message: userMessage,
        conversationId: conversationId || null,
        attachments: simpleAttachments.length > 0 ? simpleAttachments : undefined
      };
      
      const response = await fetch(`${API_BASE}/director/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('userToken')}`
        },
        body: JSON.stringify(requestBody)
      });

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let fullContent = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));
              
              if (data.type === 'start') {
                setConversationId(data.conversationId);
              } else if (data.type === 'content') {
                fullContent += data.content;
                setStreamingContent(fullContent);
              } else if (data.type === 'plan') {
                setCurrentPlan(data.plan);
              } else if (data.type === 'done') {
                const displayContent = stripPlanTags(fullContent);
                setMessages(prev => [...prev, { role: 'assistant', content: displayContent }]);
                setStreamingContent('');
                detectSuggestedActions(displayContent);
              } else if (data.type === 'error') {
                setMessages(prev => [...prev, { 
                  role: 'assistant', 
                  content: `Error: ${data.content}`,
                  isError: true 
                }]);
              }
            } catch (e) { /* Skip */ }
          }
        }
      }
    } catch (error) {
      console.error('Chat error:', error);
      setMessages(prev => [...prev, { 
        role: 'assistant', 
        content: 'Sorry, I encountered an error. Please try again.',
        isError: true 
      }]);
    } finally {
      setIsStreaming(false);
    }
  };

  const handleExecute = async (mode = 'full_auto', updatedPlan = null) => {
    const planToExecute = updatedPlan || currentPlan;
    if (!planToExecute) return;
    
    // Prevent double execution - check if already executing
    if (activeExecution && activeExecution.status === 'running') {
      console.log('[Director] Execution already in progress, ignoring duplicate click');
      return;
    }

    setExecutionMode(mode);
    setPausedAtStep(null);
    
    // Immediately set a placeholder execution to show UI feedback
    const placeholderExecution = {
      status: 'starting',
      plan: planToExecute,
      currentStep: 0,
      totalSteps: planToExecute.steps?.length || 0
    };
    setActiveExecution(placeholderExecution);
    
    try {
      const res = await axios.post(`${API_BASE}/director/execute`, {
        plan: planToExecute,
        mode,
        conversationId: conversationId || null
      }, getAuthHeaders());

      setActiveExecution(res.data);
      
      // Add execution status message to chat (stay in Create tab)
      const executionMessage = {
        role: 'execution',
        executionId: res.data.executionId || res.data.id,
        execution: res.data,
        timestamp: new Date().toISOString()
      };
      setMessages(prev => [...prev, executionMessage]);
      
      triggerGenerationsRefresh();
    } catch (error) {
      console.error('Execute error:', error);
      // Reset execution state on error
      setActiveExecution(null);
      const errorMsg = error.response?.data?.error || error.message || 'Failed to start execution';
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: `Execution failed: ${errorMsg}`,
        isError: true
      }]);
    }
  };

  const startNewConversation = async () => {
    try {
      const res = await axios.post(`${API_BASE}/director/conversations`, {}, getAuthHeaders());
      setConversationId(res.data.conversationId);
      setMessages([]);
      setCurrentPlan(null);
      setActiveExecution(null);
    } catch (e) {
      console.error('Failed to start new conversation:', e);
    }
  };
  
  // Clear plan and start fresh (for post-completion)
  const handleStartFresh = () => {
    setCurrentPlan(null);
    setActiveExecution(null);
    // Optionally start a new conversation
    startNewConversation();
  };
  
  // Create another with same plan settings
  const handleCreateAnother = (plan) => {
    // Reset execution state but keep the plan
    setActiveExecution(null);
    // Trigger execution again with the same plan
    handleExecute('full_auto', plan);
  };

  const handleFileSelect = async (e) => {
    const files = Array.from(e.target.files);
    
    for (const file of files) {
      // Check if it's a video file
      if (file.type.startsWith('video/')) {
        // Extract first frame from video
        try {
          const videoUrl = URL.createObjectURL(file);
          const frameData = await extractVideoFrame(videoUrl);
          URL.revokeObjectURL(videoUrl);
          
          if (frameData) {
            setAttachments(prev => [...prev, {
              type: 'image',
              data: frameData,
              name: file.name + ' (frame)',
              sourceType: 'video',
              originalFile: file
            }]);
          }
        } catch (error) {
          console.error('Failed to extract video frame:', error);
          // Fall back to just noting the video
          setAttachments(prev => [...prev, {
            type: 'video',
            data: URL.createObjectURL(file),
            name: file.name,
            originalFile: file
          }]);
        }
      } else if (file.type.startsWith('image/')) {
        // Handle image files
        const reader = new FileReader();
        reader.onload = (event) => {
          setAttachments(prev => [...prev, {
            type: 'image',
            data: event.target.result,
            name: file.name
          }]);
        };
        reader.readAsDataURL(file);
      }
    }
    e.target.value = '';
  };

  // Extract first frame from a video file
  const extractVideoFrame = (videoUrl) => {
    return new Promise((resolve, reject) => {
      const video = document.createElement('video');
      video.crossOrigin = 'anonymous';
      video.src = videoUrl;
      video.muted = true;
      
      video.onloadeddata = () => {
        // Seek to 1 second or 10% of duration
        video.currentTime = Math.min(1, video.duration * 0.1);
      };
      
      video.onseeked = () => {
        try {
          const canvas = document.createElement('canvas');
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(video, 0, 0);
          const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
          resolve(dataUrl);
        } catch (e) {
          reject(e);
        }
      };
      
      video.onerror = () => reject(new Error('Failed to load video'));
      
      // Timeout after 10 seconds
      setTimeout(() => reject(new Error('Video loading timeout')), 10000);
    });
  };

  const handleActionClick = (value) => {
    if (value === '__EXECUTE__') {
      handleExecute('full_auto', currentPlan);
    } else {
      handleSend(value);
    }
  };

  if (!user) return null;

  return (
    <>
      {/* Floating Button */}
      <AnimatePresence>
        {!isOpen && (
          <motion.button
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            onClick={() => setIsOpen(true)}
            className="fixed bottom-6 right-6 z-50 w-14 h-14 rounded-2xl bg-gradient-to-r from-cyan-500 to-blue-600 text-white shadow-xl shadow-cyan-500/30 flex items-center justify-center hover:scale-110 hover:shadow-cyan-500/40 transition-all"
          >
            <Sparkles className="w-6 h-6" />
          </motion.button>
        )}
      </AnimatePresence>

      {/* Main Panel */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ x: 540, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 540, opacity: 0 }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className={`fixed right-0 top-0 bottom-0 z-50 w-[520px] bg-[var(--bg-primary)] border-l border-[var(--border-color)] flex flex-col shadow-2xl ${isMinimized ? 'h-16' : ''}`}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border-color)] bg-gradient-to-r from-[var(--bg-secondary)] to-[var(--bg-primary)]">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center shadow-lg shadow-cyan-500/25">
                  <Sparkles className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h3 className="font-semibold text-[var(--text-primary)]">AI Creative Director</h3>
                  <p className="text-xs text-[var(--text-muted)]">Your creative AI assistant</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {availableDirectorModels.length > 0 && (
                  <select 
                    value={selectedDirectorModel || ''}
                    onChange={(e) => handleDirectorModelChange(e.target.value)}
                    className="text-xs bg-[var(--bg-tertiary)] border border-[var(--border-color)] rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-cyan-500/50"
                  >
                    {availableDirectorModels.map(m => (
                      <option key={m.id} value={m.id}>
                        {m.name} {m.recommended ? '★' : ''}
                      </option>
                    ))}
                  </select>
                )}
                <button
                  onClick={() => setIsMinimized(!isMinimized)}
                  className="p-2 rounded-lg hover:bg-[var(--bg-secondary)] transition-colors"
                >
                  {isMinimized ? <Maximize2 className="w-4 h-4" /> : <Minimize2 className="w-4 h-4" />}
                </button>
                <button
                  onClick={() => setIsOpen(false)}
                  className="p-2 rounded-lg hover:bg-[var(--bg-secondary)] transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {!isMinimized && (
              <div className="flex-1 overflow-hidden flex flex-col">
                <CreateTab
                  messages={messages}
                  streamingContent={streamingContent}
                  isStreaming={isStreaming}
                  input={input}
                  setInput={setInput}
                  handleSend={handleSend}
                  inputRef={inputRef}
                  fileInputRef={fileInputRef}
                  messagesEndRef={messagesEndRef}
                  startNewConversation={startNewConversation}
                  attachments={attachments}
                  setAttachments={setAttachments}
                  handleFileSelect={handleFileSelect}
                  currentPlan={currentPlan}
                  onExecute={handleExecute}
                  onStartFresh={handleStartFresh}
                  onCreateAnother={handleCreateAnother}
                  suggestedActions={suggestedActions}
                  handleActionClick={handleActionClick}
                  activeExecution={activeExecution}
                />
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

// ============================================================
// URL DETECTION HELPERS
// ============================================================
const URL_PATTERN = /https?:\/\/[^\s<>"{}|\\^`\[\]]+/gi;

function detectUrlInText(text) {
  if (!text || typeof text !== 'string') return null;
  const match = text.match(URL_PATTERN);
  return match ? match[0] : null;
}

function getUrlType(url) {
  if (!url) return 'unknown';
  if (/youtube\.com|youtu\.be/i.test(url)) return 'youtube';
  if (/instagram\.com/i.test(url)) return 'instagram';
  if (/tiktok\.com|vm\.tiktok/i.test(url)) return 'tiktok';
  if (/twitter\.com|x\.com/i.test(url)) return 'twitter';
  if (/\.(jpg|jpeg|png|gif|webp)(\?.*)?$/i.test(url)) return 'image';
  if (/\.(mp4|webm|mov)(\?.*)?$/i.test(url)) return 'video';
  return 'unknown';
}

// ============================================================
// CREATE TAB - Unified Chat + Inline Plan
// ============================================================
function CreateTab({ 
  messages, streamingContent, isStreaming, input, setInput, 
  handleSend, inputRef, fileInputRef, messagesEndRef, startNewConversation,
  attachments, setAttachments, handleFileSelect, currentPlan, onExecute,
  onStartFresh, onCreateAnother,
  suggestedActions, handleActionClick, activeExecution
}) {
  const [showUrlInput, setShowUrlInput] = useState(false);
  const [urlInput, setUrlInput] = useState('');
  const [isAnalyzingUrl, setIsAnalyzingUrl] = useState(false);
  const [urlAnalysisError, setUrlAnalysisError] = useState(null);
  const [detectedUrl, setDetectedUrl] = useState(null);

  // Detect URLs in main input as user types
  useEffect(() => {
    const url = detectUrlInText(input);
    setDetectedUrl(url);
  }, [input]);

  // Analyze and fetch URL content
  const handleAnalyzeUrl = async (url) => {
    if (!url || isAnalyzingUrl) return;
    
    setIsAnalyzingUrl(true);
    setUrlAnalysisError(null);
    
    try {
      const response = await axios.post(`${API_BASE}/director/analyze-url`, { url }, {
        headers: { Authorization: `Bearer ${localStorage.getItem('userToken')}` }
      });
      
      if (response.data.success) {
        // Add the fetched image as an attachment
        setAttachments(prev => [...prev, {
          type: 'image',
          data: response.data.data,
          name: response.data.metadata?.title || getUrlType(url) + ' preview',
          sourceUrl: url,
          sourceType: response.data.type
        }]);
        
        // Clear the URL from input if it was detected there
        if (detectedUrl) {
          setInput(prev => prev.replace(detectedUrl, '').trim());
        }
        setShowUrlInput(false);
        setUrlInput('');
      } else {
        // Show error but keep URL for manual use
        setUrlAnalysisError(response.data.error || 'Could not fetch URL content');
        
        // If requires upload, add as reference URL anyway
        if (response.data.requiresUpload) {
          setAttachments(prev => [...prev, {
            type: 'url',
            data: url,
            name: getUrlType(url) + ' (needs screenshot)',
            needsScreenshot: true
          }]);
        }
      }
    } catch (error) {
      console.error('URL analysis error:', error);
      setUrlAnalysisError('Failed to analyze URL');
    } finally {
      setIsAnalyzingUrl(false);
    }
  };

  const handleAddUrl = async () => {
    if (urlInput.trim()) {
      await handleAnalyzeUrl(urlInput.trim());
    }
  };

  const questionChoices = useMemo(() => {
    try {
      if (isStreaming || !messages || messages.length === 0) return [];
      let lastContent = '';
      for (let i = messages.length - 1; i >= 0; i--) {
        const msg = messages[i];
        if (msg?.role === 'assistant' && typeof msg?.content === 'string') {
          lastContent = msg.content;
          break;
        }
      }
      if (!lastContent) return [];
      const choices = parseQuestionChoices(lastContent);
      return choices.filter(c => c && typeof c.label === 'string' && typeof c.value === 'string' && !c.label.includes('[object') && !c.value.includes('[object')).map(c => ({ label: String(c.label), value: String(c.value) }));
    } catch (e) {
      return [];
    }
  }, [messages, isStreaming]);

  return (
    <>
      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
        {messages.length === 0 && !streamingContent && (
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center py-12"
          >
            <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-cyan-500/20 to-blue-600/20 flex items-center justify-center">
              <Sparkles className="w-8 h-8 text-cyan-400" />
            </div>
            <h4 className="font-semibold text-lg mb-2 text-[var(--text-primary)]">What would you like to create?</h4>
            <p className="text-sm text-[var(--text-muted)] max-w-xs mx-auto">
              Describe your vision and I'll help you bring it to life with the perfect AI workflow.
            </p>
          </motion.div>
        )}

        {messages.map((msg, i) => {
          // Handle execution status messages
          if (msg.role === 'execution') {
            return (
              <motion.div 
                key={i} 
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex justify-start"
              >
                <div className="max-w-[95%] w-full">
                  <ExecutionStatusCard 
                    execution={msg.execution}
                    onRetry={() => {
                      // Clear failed execution and suggest retry
                      handleSend("Please retry the failed steps with the same settings");
                    }}
                    onTryDifferentModel={() => {
                      // Suggest trying a different model
                      handleSend("The video step failed. Can you suggest a different video model to try?");
                    }}
                  />
                </div>
              </motion.div>
            );
          }
          
          const msgContent = typeof msg.content === 'string' ? msg.content : String(msg.content || '');
          const cleanContent = stripPlanTags(msgContent);
          const options = msg.role === 'assistant' ? parseOptions(cleanContent) : [];
          const hasOptions = options.length > 0;
          
          let displayContent = cleanContent;
          if (hasOptions && cleanContent) {
            try {
              displayContent = cleanContent.split(/\*\*Option [A-C]/)[0] || cleanContent;
            } catch (e) {
              displayContent = cleanContent;
            }
          }
          
          return (
            <motion.div 
              key={i} 
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div className={`max-w-[90%] rounded-2xl ${
                msg.role === 'user' 
                  ? 'bg-gradient-to-r from-cyan-500 to-blue-600 text-white px-4 py-3' 
                  : msg.isError 
                    ? 'bg-red-500/10 text-red-400 border border-red-500/20 px-4 py-3'
                    : 'bg-[var(--bg-secondary)] border border-[var(--border-color)] px-5 py-4 shadow-sm'
              }`}>
                {msg.role === 'assistant' ? (
                  <div>
                    <ChatMarkdown content={displayContent} />
                    
                    {/* Option Cards */}
                    {hasOptions && (
                      <div className="mt-4 space-y-3">
                        {options.map((opt) => (
                          <OptionCard
                            key={opt.letter}
                            option={opt}
                            onSelect={handleActionClick}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="text-sm leading-relaxed">{msg.content}</p>
                )}
              </div>
            </motion.div>
          );
        })}

        {/* Streaming content */}
        {streamingContent && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex justify-start"
          >
            <div className="max-w-[90%] rounded-2xl bg-[var(--bg-secondary)] border border-[var(--border-color)] px-5 py-4 shadow-sm">
              <ChatMarkdown content={stripPlanTags(streamingContent)} />
              <span className="inline-block w-2 h-4 bg-cyan-400 animate-pulse ml-1 rounded" />
            </div>
          </motion.div>
        )}

        {/* Inline Plan Card */}
        {currentPlan && !isStreaming && (
          <div className="mt-4">
            <InlinePlanCard 
              plan={currentPlan} 
              onExecute={onExecute}
              onStartFresh={onStartFresh}
              onCreateAnother={onCreateAnother}
              isExecuting={activeExecution && (activeExecution.status === 'running' || activeExecution.status === 'starting')}
              executionStatus={activeExecution}
            />
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Attachments Preview */}
      {attachments.length > 0 && (
        <div className="px-5 py-2 flex gap-2 flex-wrap border-t border-[var(--border-color)]">
          {attachments.map((att, idx) => (
            <div key={idx} className="relative group">
              <div className="w-16 h-16 rounded-lg overflow-hidden border border-[var(--border-color)]">
                {att.type === 'image' ? (
                  <img src={att.data} alt="" className="w-full h-full object-cover" />
                ) : att.type === 'video' ? (
                  <div className="w-full h-full bg-gradient-to-br from-purple-500/20 to-pink-500/20 flex items-center justify-center">
                    <Play className="w-6 h-6 text-purple-400" />
                  </div>
                ) : (
                  <div className="w-full h-full bg-[var(--bg-tertiary)] flex items-center justify-center">
                    <Link2 className="w-5 h-5 text-cyan-400" />
                  </div>
                )}
              </div>
              {/* Source type badge */}
              {att.sourceType && (
                <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 px-1.5 py-0.5 bg-[var(--bg-primary)] border border-[var(--border-color)] rounded text-[10px] text-cyan-400 capitalize">
                  {att.sourceType}
                </span>
              )}
              {att.needsScreenshot && (
                <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 px-1.5 py-0.5 bg-amber-500/20 border border-amber-500/30 rounded text-[10px] text-amber-400">
                  needs upload
                </span>
              )}
              <button
                onClick={() => setAttachments(prev => prev.filter((_, i) => i !== idx))}
                className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <X className="w-3 h-3 text-white" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* URL Input */}
      {showUrlInput && (
        <div className="px-5 py-2 border-t border-[var(--border-color)]">
          <div className="flex gap-2">
            <input
              type="url"
              value={urlInput}
              onChange={(e) => { setUrlInput(e.target.value); setUrlAnalysisError(null); }}
              onKeyDown={(e) => e.key === 'Enter' && !isAnalyzingUrl && handleAddUrl()}
              placeholder="Paste YouTube, Instagram, image URL..."
              className="flex-1 bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-cyan-500"
              autoFocus
              disabled={isAnalyzingUrl}
            />
            <button 
              onClick={handleAddUrl} 
              disabled={isAnalyzingUrl || !urlInput.trim()}
              className="px-3 py-2 bg-gradient-to-r from-cyan-500 to-blue-600 rounded-lg text-white text-sm font-medium disabled:opacity-50 flex items-center gap-1"
            >
              {isAnalyzingUrl ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Fetching...</>
              ) : (
                <><Eye className="w-4 h-4" /> Analyze</>
              )}
            </button>
            <button 
              onClick={() => { setShowUrlInput(false); setUrlInput(''); setUrlAnalysisError(null); }} 
              className="p-2 bg-[var(--bg-tertiary)] rounded-lg hover:bg-[var(--card-hover)]"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          {urlAnalysisError && (
            <p className="text-xs text-amber-400 mt-2 flex items-center gap-1">
              <AlertCircle className="w-3 h-3" /> {urlAnalysisError}
            </p>
          )}
          <p className="text-xs text-[var(--text-muted)] mt-2">
            Supports: YouTube, Instagram, TikTok, direct image URLs
          </p>
        </div>
      )}

      {/* Detected URL in main input */}
      {detectedUrl && !showUrlInput && !isAnalyzingUrl && (
        <div className="px-5 py-2 border-t border-[var(--border-color)] bg-cyan-500/5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm">
              <Link2 className="w-4 h-4 text-cyan-400" />
              <span className="text-[var(--text-muted)]">URL detected:</span>
              <span className="text-cyan-400 truncate max-w-[200px]">{detectedUrl}</span>
            </div>
            <button
              onClick={() => handleAnalyzeUrl(detectedUrl)}
              className="px-3 py-1.5 bg-gradient-to-r from-cyan-500 to-blue-600 rounded-lg text-white text-xs font-medium flex items-center gap-1"
            >
              <Eye className="w-3 h-3" /> Fetch Preview
            </button>
          </div>
        </div>
      )}

      {/* URL Analyzing Indicator */}
      {isAnalyzingUrl && (
        <div className="px-5 py-3 border-t border-[var(--border-color)] bg-cyan-500/5">
          <div className="flex items-center gap-2 text-sm text-cyan-400">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span>Fetching content from URL...</span>
          </div>
        </div>
      )}

      {/* Question Choices */}
      {questionChoices.length > 0 && !isStreaming && !currentPlan && (
        <div className="px-5 py-3 border-t border-[var(--border-color)] bg-gradient-to-r from-purple-500/5 to-cyan-500/5">
          <p className="text-xs text-[var(--text-muted)] mb-2 flex items-center gap-1">
            <span className="w-2 h-2 bg-purple-500 rounded-full animate-pulse"></span>
            Click to add to your response:
          </p>
          <div className="flex flex-wrap gap-2">
            {questionChoices.map((choice, idx) => (
              <motion.button
                key={idx}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => {
                  setInput(prev => (prev ? prev + ', ' : '') + choice.value);
                  setTimeout(() => inputRef.current?.focus(), 50);
                }}
                className="px-4 py-2 rounded-xl text-sm bg-[var(--bg-tertiary)] border border-[var(--border-color)] hover:border-purple-500 hover:bg-purple-500/10 hover:text-purple-400 transition-all font-medium"
              >
                {choice.label}
              </motion.button>
            ))}
          </div>
        </div>
      )}

      {/* Suggested Actions */}
      {suggestedActions.length > 0 && !isStreaming && !currentPlan && questionChoices.length === 0 && (
        <div className="px-5 py-3 border-t border-[var(--border-color)]">
          <div className="flex flex-wrap gap-2">
            {suggestedActions.map((action, idx) => (
              <button
                key={idx}
                onClick={() => handleActionClick(action.value)}
                className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                  action.primary 
                    ? 'bg-gradient-to-r from-cyan-500 to-blue-600 text-white hover:from-cyan-400 hover:to-blue-500 shadow-lg shadow-cyan-500/20' 
                    : 'bg-[var(--bg-tertiary)] border border-[var(--border-color)] hover:border-cyan-500 hover:text-cyan-400'
                }`}
              >
                {action.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Input Area */}
      <div className="p-4 border-t border-[var(--border-color)] bg-gradient-to-t from-[var(--bg-primary)] to-[var(--bg-secondary)]">
        {/* New Conversation Button - Styled */}
        <div className="flex items-center justify-center mb-3">
          <motion.button
            onClick={startNewConversation}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            className="px-4 py-2 rounded-full text-xs font-medium bg-gradient-to-r from-[var(--bg-tertiary)] to-[var(--bg-secondary)] border border-[var(--border-color)] hover:border-cyan-500/50 text-[var(--text-muted)] hover:text-cyan-400 flex items-center gap-2 transition-all shadow-sm hover:shadow-cyan-500/10"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Start Fresh Conversation
          </motion.button>
        </div>

        {/* Input Row */}
        <div className="flex items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,video/*"
            multiple
            onChange={handleFileSelect}
            className="hidden"
          />
          
          {/* Action buttons */}
          <div className="flex gap-1">
            <button
              onClick={() => fileInputRef.current?.click()}
              className="p-2.5 rounded-lg bg-[var(--bg-tertiary)] hover:bg-cyan-500/10 hover:text-cyan-400 transition-all border border-transparent hover:border-cyan-500/30"
              title="Attach image or video"
            >
              <Image className="w-4 h-4" />
            </button>
            <button
              onClick={() => setShowUrlInput(!showUrlInput)}
              className={`p-2.5 rounded-lg transition-all border ${showUrlInput ? 'bg-cyan-500/10 text-cyan-400 border-cyan-500/30' : 'bg-[var(--bg-tertiary)] hover:bg-cyan-500/10 hover:text-cyan-400 border-transparent hover:border-cyan-500/30'}`}
              title="Add URL (YouTube, Instagram, etc.)"
            >
              <Link2 className="w-4 h-4" />
            </button>
          </div>

          {/* Main Input */}
          <div className="flex-1 relative">
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSend()}
              placeholder="Describe what you want to create..."
              className="w-full bg-[var(--bg-primary)] border border-[var(--border-color)] rounded-xl px-4 py-3 pr-12 text-sm focus:outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20 transition-all"
              disabled={isStreaming}
            />
            {input && !isStreaming && (
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-[var(--text-muted)] opacity-50">
                ↵
              </span>
            )}
          </div>
          <button
            onClick={() => handleSend()}
            disabled={(!input.trim() && attachments.length === 0) || isStreaming}
            className="p-3 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 text-white disabled:opacity-50 disabled:cursor-not-allowed hover:from-cyan-400 hover:to-blue-500 transition-all shadow-lg shadow-cyan-500/20"
          >
            {isStreaming ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
          </button>
        </div>
      </div>
    </>
  );
}

