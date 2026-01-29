/**
 * AI Director Service
 * 
 * The intelligent orchestrator that helps users plan and execute
 * multi-step AI workflows through natural conversation.
 */

const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { buildSystemPromptKnowledge, getModelLookup } = require('./modelKnowledge');
const { buildSOTAPromptSection, loadSOTAGuide } = require('./modelSOTAKnowledge');

// ============================================================
// MODEL FEEDBACK TRACKING - For AI Director Learning
// ============================================================

/**
 * Track when a user selects a model option from the AI Director suggestions
 * @param {Object} db - Database instance
 * @param {Object} feedback - Feedback data
 * @param {string} feedback.userId - User ID
 * @param {string} feedback.conversationId - Conversation ID
 * @param {string} feedback.useCase - Use case category (e.g., 'ugc-content', 'product-video')
 * @param {string[]} feedback.suggestedModels - Array of model IDs that were suggested
 * @param {string} feedback.selectedModel - Model ID the user selected
 * @param {string} feedback.executionId - Optional execution ID if execution started
 */
function trackModelSelection(db, feedback) {
  const id = uuidv4();
  try {
    db.prepare(`
      INSERT INTO model_feedback (id, userId, conversationId, useCase, suggestedModels, selectedModel, executionId, createdAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `).run(
      id,
      feedback.userId,
      feedback.conversationId || null,
      feedback.useCase || null,
      JSON.stringify(feedback.suggestedModels || []),
      feedback.selectedModel,
      feedback.executionId || null
    );
    console.log(`[Feedback] Tracked model selection: ${feedback.selectedModel} for ${feedback.useCase}`);
    return id;
  } catch (e) {
    console.error('[Feedback] Failed to track selection:', e.message);
    return null;
  }
}

/**
 * Update feedback record with execution result
 * @param {Object} db - Database instance
 * @param {string} executionId - Execution ID
 * @param {boolean} success - Whether execution succeeded
 * @param {number} rating - Optional user rating (1-5)
 */
function updateFeedbackResult(db, executionId, success, rating = null) {
  try {
    db.prepare(`
      UPDATE model_feedback 
      SET success = ?, rating = ?
      WHERE executionId = ?
    `).run(success ? 1 : 0, rating, executionId);
    console.log(`[Feedback] Updated execution ${executionId}: success=${success}`);
  } catch (e) {
    console.error('[Feedback] Failed to update result:', e.message);
  }
}

/**
 * Build user preference context from feedback data
 * @param {Object} db - Database instance
 * @param {string} userId - Optional user ID to filter by specific user
 * @returns {string} Formatted preference context for LLM
 */
function buildUserPreferenceContext(db, userId = null) {
  try {
    // Get aggregated stats from last 30 days
    let query = `
      SELECT useCase, selectedModel, 
             COUNT(*) as picks,
             AVG(CASE WHEN success = 1 THEN 1.0 WHEN success = 0 THEN 0.0 ELSE NULL END) as successRate
      FROM model_feedback
      WHERE createdAt > datetime('now', '-30 days')
    `;
    
    if (userId) {
      query += ` AND userId = ?`;
    }
    
    query += `
      GROUP BY useCase, selectedModel
      HAVING picks >= 2
      ORDER BY picks DESC
      LIMIT 20
    `;
    
    const stats = userId 
      ? db.prepare(query).all(userId)
      : db.prepare(query).all();
    
    if (stats.length === 0) {
      return '';
    }
    
    let context = '\n### USER PREFERENCE TRENDS (Last 30 Days)\n\n';
    context += 'Based on what users have selected and their results:\n\n';
    
    // Group by use case
    const byUseCase = {};
    stats.forEach(s => {
      const useCase = s.useCase || 'general';
      if (!byUseCase[useCase]) byUseCase[useCase] = [];
      byUseCase[useCase].push(s);
    });
    
    Object.entries(byUseCase).forEach(([useCase, models]) => {
      context += `**${useCase.replace(/-/g, ' ')}:**\n`;
      models.forEach(m => {
        const successStr = m.successRate !== null 
          ? ` (${(m.successRate * 100).toFixed(0)}% success)`
          : '';
        context += `- ${m.selectedModel}: ${m.picks} selections${successStr}\n`;
      });
      context += '\n';
    });
    
    // Add model success rates across all use cases
    const modelSuccess = db.prepare(`
      SELECT selectedModel, 
             COUNT(*) as total,
             SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) as successes,
             AVG(CASE WHEN success = 1 THEN 1.0 WHEN success = 0 THEN 0.0 ELSE NULL END) as successRate
      FROM model_feedback
      WHERE createdAt > datetime('now', '-30 days')
        AND success IS NOT NULL
      GROUP BY selectedModel
      HAVING total >= 3
      ORDER BY successRate DESC
      LIMIT 10
    `).all();
    
    if (modelSuccess.length > 0) {
      context += '**Model Reliability:**\n';
      modelSuccess.forEach(m => {
        const rate = (m.successRate * 100).toFixed(0);
        context += `- ${m.selectedModel}: ${rate}% success (${m.successes}/${m.total})\n`;
      });
      context += '\n';
    }
    
    // Add failing models warning
    const failingModels = db.prepare(`
      SELECT selectedModel, 
             COUNT(*) as failures
      FROM model_feedback
      WHERE createdAt > datetime('now', '-7 days')
        AND success = 0
      GROUP BY selectedModel
      HAVING failures >= 3
      ORDER BY failures DESC
      LIMIT 5
    `).all();
    
    if (failingModels.length > 0) {
      context += '**⚠️ Models with Recent Failures (consider alternatives):**\n';
      failingModels.forEach(m => {
        context += `- ${m.selectedModel}: ${m.failures} failures this week\n`;
      });
      context += '\n';
    }
    
    return context;
  } catch (e) {
    console.error('[Feedback] Failed to build preference context:', e.message);
    return '';
  }
}

// ============================================================
// MODEL ID NORMALIZATION - Maps short names to actual IDs
// ============================================================
const MODEL_ID_ALIASES = {
  // Video models - short names to full IDs
  'kling-2.6-pro': 'fal-kling-v2.6-pro-i2v',      // Default to i2v (more common)
  'kling-2.6-pro-i2v': 'fal-kling-v2.6-pro-i2v',
  'kling-2.6-pro-t2v': 'fal-kling-v2.6-pro-t2v',
  'kling-1.6-pro': 'fal-kling-v1.6-pro',
  'kling-1.5-standard': 'fal-kling-v1.5-standard',
  'veo-3.1': 'fal-veo3.1-i2v',                    // Map to Veo 3.1 Image-to-Video
  'veo-3.1-i2v': 'fal-veo3.1-i2v',
  'veo-3.1-t2v': 'fal-veo3.1-t2v',
  'veo-3': 'fal-veo3-fast-t2v',
  'sora-2': 'fal-sora2-i2v',                      // Map to Sora 2 Image-to-Video
  'sora-2-i2v': 'fal-sora2-i2v',
  'sora-2-t2v': 'fal-sora2-t2v',
  'ltx-video': 'fal-ltx-video-v0.9.1',
  'minimax-video': 'fal-minimax-video-01',
  'runway-gen3-turbo': 'fal-runway-gen3-turbo',
  'runway-gen3-alpha': 'fal-runway-gen3-alpha-turbo',
  'wan-2.1-turbo': 'fal-wan-v2.1-turbo',
  'wan-2.1-14b': 'fal-wan-v2.1-14b',
  
  // Image models - short names to full IDs
  'flux-1.1-pro': 'fal-flux-1.1-pro',
  'flux-1.1-pro-ultra': 'fal-flux-1.1-pro-ultra',
  'flux-schnell': 'fal-flux-schnell',
  'flux-dev': 'fal-flux-dev',
  'ideogram-v3': 'fal-ideogram-v3',
  'nano-banana-pro': 'fal-nano-banana-pro',
  'recraft-v3': 'fal-recraft-v3',
  'sd3-ultra': 'fal-sd3-ultra',
  'gpt-image-1.5': 'fal-gpt-image-1',
  
  // Also support the full IDs (passthrough)
  'fal-kling-v2.6-pro-i2v': 'fal-kling-v2.6-pro-i2v',
  'fal-kling-v2.6-pro-t2v': 'fal-kling-v2.6-pro-t2v',
  'fal-flux-1.1-pro': 'fal-flux-1.1-pro',
  'fal-ltx-video-v0.9.1': 'fal-ltx-video-v0.9.1',
};

/**
 * Normalize a model ID from short name to actual database ID
 */
function normalizeModelId(shortId, hasInputImage = false) {
  if (!shortId) return null;
  
  const normalizedKey = shortId.toLowerCase().trim();
  
  // Check if it's a short name that needs mapping
  if (MODEL_ID_ALIASES[normalizedKey]) {
    // Special handling for kling-2.6-pro - choose i2v or t2v based on context
    if (normalizedKey === 'kling-2.6-pro') {
      return hasInputImage ? 'fal-kling-v2.6-pro-i2v' : 'fal-kling-v2.6-pro-t2v';
    }
    return MODEL_ID_ALIASES[normalizedKey];
  }
  
  // If no alias found, try adding 'fal-' prefix
  const withPrefix = `fal-${normalizedKey}`;
  if (MODEL_ID_ALIASES[withPrefix]) {
    return MODEL_ID_ALIASES[withPrefix];
  }
  
  // Return as-is (might be a valid full ID)
  return shortId;
}

/**
 * AI Director class - handles conversation, planning, and execution
 */
class AIDirector {
  constructor(options = {}) {
    this.db = options.db;
    this.getSetting = options.getSetting;
    this.getModel = options.getModel;
    this.calculatePrice = options.calculatePrice;
    this.processGeneration = options.processGeneration; // Function to actually process a generation
    this.reserveCredits = options.reserveCredits;
    this.commitCredits = options.commitCredits;
    this.releaseCredits = options.releaseCredits;
  }

  /**
   * Get the configured director model from settings or user preference
   * @param {string} userId - Optional user ID to check for preference
   */
  getDirectorModel(userId = null) {
    // Check for user preference first
    if (userId) {
      try {
        const userPref = this.db.prepare(`
          SELECT value FROM user_settings 
          WHERE userId = ? AND key = 'preferredDirectorModel'
        `).get(userId);
        if (userPref?.value) {
          return userPref.value;
        }
      } catch (e) {
        // Table might not exist yet, fall through to default
      }
    }
    return this.getSetting('aiDirectorModel') || 'anthropic/claude-sonnet-4.5';
  }

  /**
   * Build the system prompt for the AI Director
   * @param {string} userId - Optional user ID for personalized preferences
   */
  buildSystemPrompt(userId = null) {
    const modelKnowledge = buildSystemPromptKnowledge(this.db);
    const sotaKnowledge = buildSOTAPromptSection();
    const userPreferences = buildUserPreferenceContext(this.db, userId);
    
    // Load SOTA model guide
    let sotaGuide = '';
    try {
      sotaGuide = loadSOTAGuide();
      // Truncate if too long to fit in context
      if (sotaGuide.length > 15000) {
        sotaGuide = sotaGuide.slice(0, 15000) + '\n\n[Guide truncated for brevity]';
      }
    } catch (e) {
      console.warn('SOTA guide not loaded');
    }
    
    // Load platform knowledge
    let platformKnowledge = '';
    try {
      platformKnowledge = fs.readFileSync(
        path.join(__dirname, '../data/platformKnowledge.md'),
        'utf-8'
      );
    } catch (e) {
      console.warn('Platform knowledge file not found');
    }
    
    return `You are the AI Creative Director for OmniHub, an AI generation platform. Your role is to help users create amazing content by understanding their goals and orchestrating the right combination of AI models.

## PLATFORM KNOWLEDGE

${platformKnowledge}

## MODEL KNOWLEDGE

${modelKnowledge}

${sotaKnowledge}

${userPreferences}

## EXPERT SOTA MODEL GUIDE

${sotaGuide ? sotaGuide.slice(0, 8000) : 'Guide not available - use SOTA knowledge above.'}

## YOUR ROLE

You guide users through a structured creative process with 4 phases:

### PHASE 1: DISCOVERY (Always start here)
When a user describes their goal:
- Ask 1-2 clarifying questions with CLICKABLE OPTIONS
- Format questions like: "What style - **casual**, **professional**, **artistic**, or **something else**?"
- Use dashes to separate: "What's the focus - morning routine, product review, or before/after?"
- If they attached images/URLs, acknowledge and describe what you see
- Keep questions brief with clear options to click

### PHASE 2: OPTIONS (After you understand the goal)
Present 2-3 distinct approaches as CLICKABLE CARDS. Use this EXACT format for each option:

**Option A (Budget):** Quick and cost-effective approach. [Description of what this does]. Uses flux-schnell → ltx-video. ~$0.30 credits

**Option B (Balanced):** Recommended for most users. [Description of what this does]. Uses flux-1.1-pro → kling-2.6-pro. ~$0.50 credits

**Option C (Premium - PREFERRED):** Highest quality results using the best image + video combo. [Description of what this does]. Uses nano-banana-pro → veo-3.1. ~$1.50 credits

## RECOMMENDED MODELS (Use these first):
- **nano-banana-pro**: Google's best multimodal image model - excellent for UGC content, product shots, complex scenes, and photorealistic images. Supports up to 14 input images for reference. USE THIS FOR PREMIUM TIER. ~$0.15/image
- **veo-3.1**: Google's best video model - cinematic quality, supports audio generation, excellent for premium image-to-video. USE THIS WITH nano-banana-pro FOR PREMIUM TIER. Use duration "4s", "6s", or "8s" (WITH 's' suffix!). ~$1.00/video
- **sora-2**: OpenAI's video model - good cinematic quality, supports durations of 4, 8, or 12 seconds ONLY. ~$0.80/video
- **flux-1.1-pro**: Fast, reliable for general purposes. ~$0.04/image
- **kling-2.6-pro**: Great video model for motion control and I2V. Use duration "5" or "10" seconds. ~$0.35/5s video
- **flux-schnell**: Ultra-fast and cheap for budget tier. ~$0.003/image
- **ltx-video**: Budget video option, fast and affordable. ~$0.10/video

CRITICAL FORMATTING RULES:
1. **Tier in parentheses**: Always include (Budget), (Balanced), or (Premium) after the option letter
2. **Model names**: Use exact model IDs like nano-banana-pro, kling-2.6-pro, seed-dream-4.5
3. **Cost format**: MUST end with "~$X.XX credits" - use the tilde, dollar sign, and "credits" word. Examples: ~$0.30 credits, ~$1.50 credits, ~$3.00 credits
4. **Description**: Keep to 1-2 sentences explaining what this approach does

End with: "Which approach works best for you?"

### PHASE 3: CONFIRMATION (After user selects an option)
Show the detailed execution plan clearly. The UI will automatically render a beautiful plan card with Start buttons, so DO NOT tell the user to click Start.

### Your Plan: [Title]

**Step 1:** [Action] with **[Model Name]**
> Prompt: "[the prompt]" | ~X credits

**Step 2:** [Action] with **[Model Name]** (uses Step 1 output)
> Prompt: "[the prompt]" | ~X credits

📊 **Total: X credits** | ⏱️ **~X minutes**

End with something like: "Review the prompts and settings above, then use the Start button when ready. Let me know if you'd like any changes first!"

CRITICAL: When presenting a plan, you MUST ALWAYS include the <plan> tag at the END of your response so the UI can show the Start button:

<plan>
{"title":"...","summary":"...","steps":[{"order":1,"action":"...","model":"model-id","modelName":"Model Name","type":"image","prompt":"...","options":{},"estimatedCost":0.5,"dependsOn":[],"outputDescription":"..."}],"totalCost":1.5,"estimatedTime":"2-3 minutes","finalOutputs":["..."]}
</plan>

The <plan> tag is parsed by the system to render interactive buttons - users will NOT see it.

### PHASE 4: EXECUTION
When user says "execute", "start", "go", "yes", confirm they want to proceed and remind them to use the Start button in the plan card.

IMPORTANT - OPTIONS FOR EACH STEP TYPE:
- For IMAGE steps: options can include {"aspect_ratio": "16:9"} (or "9:16", "1:1")
- For VIDEO steps (image-to-video): 
  - options MUST include {"duration": "5", "aspect_ratio": "16:9"}
  - duration: MUST be "5" or "10" (as string, not number)
  - aspect_ratio: "16:9", "9:16", or "1:1"
  - dependsOn: MUST include the step number of the image generation, e.g., "dependsOn": [1]
  
CRITICAL: For multi-step workflows with image→video:
- Step 1 (image) should have "dependsOn": []
- Step 2 (video) MUST have "dependsOn": [1] to use the image from Step 1

## CRITICAL RULES

1. **FOLLOW THE PHASES** - Don't skip to options without asking questions first
2. **ALWAYS include <plan> tag** when presenting a plan - the UI needs it to show Start buttons
3. **Use REAL model IDs** from the available models list
4. **Set dependsOn correctly** - Image-to-video steps MUST depend on image generation step
5. **Be conversational** - This is a dialogue, not a form
6. **Acknowledge attachments** - If user shares images/URLs, describe what you see and how you'll use them

## EXAMPLE CONVERSATION

**User:** "I want to create a product video"

**You:** "I'd love to help with that! Quick questions:
1. What product is this for? (you can attach an image)
2. What style - **professional**, **casual/lifestyle**, **luxury**, or **something else**?"

**User:** [attaches product image] "It's a water bottle, professional style"

**You:** "Great choice! I can see your sleek water bottle. Here are 3 approaches:

**Option A (Budget):** Quick animation of your existing image with subtle motion. Perfect for testing the concept. Uses ltx-video. ~$0.30 credits

**Option B (Balanced):** Generate a professional product scene with FLUX Pro, then animate with Kling's smooth camera motion. Good value for quality. Uses flux-1.1-pro → kling-2.6-pro. ~$0.50 credits

**Option C (Premium - RECOMMENDED):** Create a stunning scene with Google's Nano Banana Pro, then produce cinematic video with Veo 3.1. Our best quality combo with audio! Uses nano-banana-pro → veo-3.1. ~$1.50 credits

Which approach works best for you?"

**User:** "Option B"

**You:** "Perfect! Here's the plan:

**Step 1: Generate Product Scene** using FLUX 1.1 Pro
- Prompt: 'Professional product photography of a sleek water bottle on a minimalist white surface, studio lighting, commercial style'
- Cost: ~0.05 credits

**Step 2: Animate to Video** using Kling 2.6 Pro
- Uses the generated image
- Prompt: 'Slow camera orbit around product, professional commercial style'
- Cost: ~1.15 credits

**Total: 1.20 credits | ~2 minutes**

The plan is ready above - review the prompts and hit Start when you're happy, or let me know what to change!"`;
  }

  /**
   * Get or create a conversation for a user
   */
  getOrCreateConversation(userId) {
    // Try to get existing active conversation
    let conversation = this.db.prepare(`
      SELECT * FROM director_conversations 
      WHERE userId = ? AND status = 'active'
      ORDER BY updatedAt DESC LIMIT 1
    `).get(userId);

    if (!conversation) {
      // Create new conversation
      const id = uuidv4();
      this.db.prepare(`
        INSERT INTO director_conversations (id, userId, messages, status, createdAt, updatedAt)
        VALUES (?, ?, '[]', 'active', datetime('now'), datetime('now'))
      `).run(id, userId);
      
      conversation = {
        id,
        userId,
        messages: [],
        currentPlan: null,
        status: 'active'
      };
    } else {
      conversation.messages = JSON.parse(conversation.messages || '[]');
      conversation.currentPlan = conversation.currentPlan ? JSON.parse(conversation.currentPlan) : null;
    }

    return conversation;
  }

  /**
   * Save conversation state
   */
  saveConversation(conversation) {
    this.db.prepare(`
      UPDATE director_conversations 
      SET messages = ?, currentPlan = ?, updatedAt = datetime('now')
      WHERE id = ?
    `).run(
      JSON.stringify(conversation.messages),
      conversation.currentPlan ? JSON.stringify(conversation.currentPlan) : null,
      conversation.id
    );
  }

  /**
   * Chat with the AI Director (streaming)
   * @param {string} userId - User ID
   * @param {string} message - User message
   * @param {string} conversationId - Conversation ID
   * @param {Array} attachments - Optional attachments (images/URLs)
   */
  async *chat(userId, message, conversationId = null, attachments = []) {
    const openrouterKey = this.getSetting('openrouterApiKey');
    if (!openrouterKey) {
      yield { type: 'error', content: 'OpenRouter API key not configured' };
      return;
    }

    // Get or create conversation
    let conversation;
    if (conversationId) {
      conversation = this.db.prepare('SELECT * FROM director_conversations WHERE id = ? AND userId = ?')
        .get(conversationId, userId);
      if (conversation) {
        conversation.messages = JSON.parse(conversation.messages || '[]');
        conversation.currentPlan = conversation.currentPlan ? JSON.parse(conversation.currentPlan) : null;
      }
    }
    if (!conversation) {
      conversation = this.getOrCreateConversation(userId);
    }

    // Build message content with attachments
    let messageContent = message;
    if (attachments && attachments.length > 0) {
      const attachmentDescriptions = attachments.map((a, i) => {
        if (a.type === 'image') {
          return `[Attached image ${i + 1}: ${a.name}]`;
        } else if (a.type === 'url') {
          return `[Reference URL: ${a.data}]`;
        }
        return '';
      }).filter(Boolean).join('\n');
      
      messageContent = `${attachmentDescriptions}\n\n${message}`;
    }

    // Add user message with attachment info
    conversation.messages.push({
      role: 'user',
      content: messageContent,
      attachments: attachments,
      timestamp: new Date().toISOString()
    });

    // Build messages for API - for vision models, include image data
    const systemPrompt = this.buildSystemPrompt(userId);
    const directorModel = this.getDirectorModel(userId);
    
    // Check if using a vision model and we have image attachments
    const isVisionModel = directorModel.includes('sonnet') || directorModel.includes('gpt-4') || directorModel.includes('gemini');
    const hasImageAttachments = attachments?.some(a => a.type === 'image');
    
    let apiMessages;
    if (isVisionModel && hasImageAttachments) {
      // Build multimodal messages for vision models
      apiMessages = [
        { role: 'system', content: systemPrompt },
        ...conversation.messages.slice(-20).map(m => {
          if (m.attachments?.some(a => a.type === 'image')) {
            // Multimodal message with images
            const content = [
              { type: 'text', text: m.content }
            ];
            m.attachments.filter(a => a.type === 'image').forEach(a => {
              content.push({
                type: 'image_url',
                image_url: { url: a.data }
              });
            });
            return { role: m.role, content };
          }
          return { role: m.role, content: m.content };
        })
      ];
    } else {
      apiMessages = [
        { role: 'system', content: systemPrompt },
        ...conversation.messages.slice(-20).map(m => ({ role: m.role, content: m.content }))
      ];
    }
    
    console.log(`[Director] Using model: ${directorModel}, Vision: ${isVisionModel && hasImageAttachments}`);

    try {
      // Stream response from OpenRouter
      const response = await axios.post(
        'https://openrouter.ai/api/v1/chat/completions',
        {
          model: directorModel,
          messages: apiMessages,
          stream: true,
          max_tokens: 2000,
          temperature: 0.7
        },
        {
          headers: {
            'Authorization': `Bearer ${openrouterKey}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': 'http://localhost:5173',
            'X-Title': 'OmniHub AI Director'
          },
          responseType: 'stream'
        }
      );

      let fullContent = '';
      let buffer = '';

      yield { type: 'start', conversationId: conversation.id };

      for await (const chunk of response.data) {
        buffer += chunk.toString();
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') continue;
            
            try {
              const parsed = JSON.parse(data);
              const content = parsed.choices?.[0]?.delta?.content;
              if (content) {
                fullContent += content;
                yield { type: 'content', content };
              }
            } catch (e) {
              // Skip parse errors
            }
          }
        }
      }

      // Check if response contains a plan
      const planMatch = fullContent.match(/<plan>([\s\S]*?)<\/plan>/);
      if (planMatch) {
        try {
          const plan = JSON.parse(planMatch[1]);
          // Validate and enhance the plan with accurate costs
          const enhancedPlan = await this.enhancePlan(plan);
          conversation.currentPlan = enhancedPlan;
          yield { type: 'plan', plan: enhancedPlan };
        } catch (e) {
          console.error('[Director] Failed to parse plan:', e.message);
        }
      }

      // Save assistant message
      conversation.messages.push({
        role: 'assistant',
        content: fullContent,
        timestamp: new Date().toISOString()
      });

      this.saveConversation(conversation);
      yield { type: 'done', conversationId: conversation.id };

    } catch (error) {
      console.error('[Director] Chat error:', error.message);
      yield { type: 'error', content: error.message };
    }
  }

  /**
   * Enhance a plan with accurate cost estimates
   */
  async enhancePlan(plan) {
    let totalCost = 0;
    
    // First pass: identify image generation steps
    const imageSteps = new Set();
    for (const step of plan.steps) {
      const hasInputImage = step.dependsOn && step.dependsOn.length > 0;
      const normalizedModelId = normalizeModelId(step.model, hasInputImage);
      const model = this.getModel(normalizedModelId) || this.getModel(step.model);
      if (model && model.type === 'image') {
        imageSteps.add(step.order);
      }
    }

    for (const step of plan.steps) {
      // Get the actual model - normalize it first
      const hasInputImage = step.dependsOn && step.dependsOn.length > 0;
      const normalizedModelId = normalizeModelId(step.model, hasInputImage);
      const model = this.getModel(normalizedModelId) || this.getModel(step.model);
      
      if (model) {
        // Ensure step has options object
        step.options = step.options || {};
        
        // Ensure dependsOn is an array
        step.dependsOn = step.dependsOn || [];
        
        // Add default options for video models if missing
        if (model.type === 'video') {
          // Determine valid durations based on model
          const modelLower = (step.model || '').toLowerCase();
          const isSoraModel = modelLower.includes('sora');
          const isVeoModel = modelLower.includes('veo');
          const isKlingModel = modelLower.includes('kling');
          
          // Sora 2 only accepts 4, 8, or 12 seconds (no 's' suffix)
          // Veo 3.1 accepts 4s, 6s, or 8s (WITH 's' suffix - API requirement)
          // Kling accepts 5 or 10 seconds (no 's' suffix)
          if (!step.options.duration) {
            if (isSoraModel) {
              step.options.duration = '8'; // Default for Sora (allowed: 4, 8, 12)
              console.log(`[Director] Added default duration "8" to Sora step ${step.order}`);
            } else if (isVeoModel) {
              step.options.duration = '6s'; // Default for Veo (allowed: 4s, 6s, 8s - WITH 's' suffix!)
              console.log(`[Director] Added default duration "6s" to Veo step ${step.order}`);
            } else if (isKlingModel) {
              step.options.duration = '5'; // Default for Kling (allowed: 5, 10)
              console.log(`[Director] Added default duration "5" to Kling step ${step.order}`);
            } else {
              step.options.duration = '5'; // Generic default
              console.log(`[Director] Added default duration "5" to step ${step.order}`);
            }
          } else {
            // Validate and fix duration for specific models
            const dur = String(step.options.duration);
            if (isSoraModel && !['4', '8', '12'].includes(dur)) {
              step.options.duration = '8'; // Fix to valid Sora duration
              console.log(`[Director] Fixed Sora duration from "${dur}" to "8" for step ${step.order}`);
            } else if (isVeoModel && !['4s', '6s', '8s'].includes(dur)) {
              // Veo requires 's' suffix - convert if needed
              if (dur === '4' || dur === '5') {
                step.options.duration = '4s';
              } else if (dur === '6') {
                step.options.duration = '6s';
              } else {
                step.options.duration = '8s';
              }
              console.log(`[Director] Fixed Veo duration from "${dur}" to "${step.options.duration}" for step ${step.order}`);
            } else {
              step.options.duration = dur;
            }
          }
          
          // Add default aspect ratio if missing
          if (!step.options.aspect_ratio) {
            step.options.aspect_ratio = '16:9'; // Default landscape
          }
          
          // AUTO-FIX: If video model requires image input and has no dependsOn, 
          // automatically link to previous image step
          if (model.imageInput === 'required' && step.dependsOn.length === 0) {
            // Find the most recent image step before this one
            for (let i = step.order - 1; i >= 1; i--) {
              if (imageSteps.has(i)) {
                step.dependsOn = [i];
                console.log(`[Director] Auto-linked video step ${step.order} to image step ${i}`);
                break;
              }
            }
          }
          
          // IMPORTANT: Ensure Kling models use I2V variant when dependsOn exists
          if (step.dependsOn.length > 0) {
            const modelLower = step.model.toLowerCase();
            if (modelLower.includes('kling') && !modelLower.includes('i2v') && !modelLower.includes('image-to-video')) {
              // Switch to I2V variant
              if (modelLower.includes('2.6') || modelLower.includes('v2.6')) {
                step.model = 'fal-kling-v2.6-pro-i2v';
                console.log(`[Director] Switched step ${step.order} to Kling 2.6 Pro I2V (has image dependency)`);
              } else if (modelLower.includes('1.6') || modelLower.includes('v1.6')) {
                step.model = 'fal-kling-v1.6-pro-i2v';
                console.log(`[Director] Switched step ${step.order} to Kling 1.6 Pro I2V (has image dependency)`);
              }
              // Re-fetch model info for updated ID
              const updatedModel = this.getModel(step.model);
              if (updatedModel) {
                step.modelName = updatedModel.name;
              }
            }
          }
        }
        
        // Calculate accurate price
        const price = this.calculatePrice(model, step.options);
        step.estimatedCost = price;
        step.modelName = model.name;
        step.type = model.type;
        totalCost += price;
      } else {
        console.warn(`[Director] Model not found: ${step.model}`);
      }
    }

    plan.totalCost = Math.round(totalCost * 100) / 100;
    plan.validated = true;
    plan.createdAt = new Date().toISOString();

    return plan;
  }

  /**
   * Start executing a plan - creates actual generations
   */
  async executePlan(userId, plan, mode = 'full_auto', workspaceId = null, conversationId = null) {
    const executionId = uuidv4();
    
    console.log(`[Director] Executing plan: ${plan.title}`);
    console.log(`[Director] Steps: ${plan.steps.length}, Mode: ${mode}`);
    
    // Create execution record
    this.db.prepare(`
      INSERT INTO director_executions (id, conversationId, planJson, status, mode, currentStep, createdAt)
      VALUES (?, ?, ?, 'running', ?, 0, datetime('now'))
    `).run(executionId, conversationId, JSON.stringify(plan), mode);

    // Track model selections for feedback learning
    // Extract models used in the plan
    const modelsUsed = plan.steps.map(step => step.model).filter(Boolean);
    const uniqueModels = [...new Set(modelsUsed)];
    
    // Determine use case from plan title/summary
    let useCase = 'general';
    const titleLower = (plan.title || '').toLowerCase();
    const summaryLower = (plan.summary || '').toLowerCase();
    
    if (titleLower.includes('ugc') || summaryLower.includes('ugc')) useCase = 'ugc-content';
    else if (titleLower.includes('product') || summaryLower.includes('product')) useCase = 'product-video';
    else if (titleLower.includes('talking') || summaryLower.includes('talking')) useCase = 'talking-head';
    else if (titleLower.includes('logo') || summaryLower.includes('logo')) useCase = 'logo-animation';
    else if (titleLower.includes('avatar') || summaryLower.includes('avatar')) useCase = 'ai-avatar';
    else if (titleLower.includes('social') || summaryLower.includes('tiktok') || summaryLower.includes('reel')) useCase = 'social-media-vertical';
    
    // Track each unique model selection
    for (const model of uniqueModels) {
      this.trackSelection(userId, conversationId, useCase, uniqueModels, model, executionId);
    }

    // Start execution in background
    this.executeSteps(executionId, userId, plan, workspaceId, mode).then(result => {
      // Update feedback with execution result
      this.updateFeedback(executionId, !result.failed);
    }).catch(err => {
      console.error(`[Director] Execution failed:`, err.message);
      this.db.prepare(`UPDATE director_executions SET status = 'failed' WHERE id = ?`).run(executionId);
      this.updateFeedback(executionId, false);
    });

    return {
      executionId,
      status: 'running',
      mode,
      stepsCount: plan.steps.length
    };
  }

  /**
   * Execute plan steps sequentially, creating real generations
   * Stops execution if any step fails or dependencies are not met
   */
  async executeSteps(executionId, userId, plan, workspaceId, mode) {
    const stepOutputs = {}; // Store outputs for dependency resolution
    const failedSteps = new Set(); // Track failed steps
    let creditsUsed = 0;

    for (let i = 0; i < plan.steps.length; i++) {
      const step = plan.steps[i];
      console.log(`[Director] Executing step ${step.order}: ${step.action}`);
      
      // Update current step
      this.db.prepare(`UPDATE director_executions SET currentStep = ? WHERE id = ?`).run(i + 1, executionId);

      try {
        // Check if any dependency has failed - if so, skip this step
        if (step.dependsOn && step.dependsOn.length > 0) {
          const hasDependencyFailed = step.dependsOn.some(depOrder => failedSteps.has(depOrder));
          if (hasDependencyFailed) {
            console.error(`[Director] Step ${step.order} skipped - dependency failed`);
            failedSteps.add(step.order);
            continue;
          }
        }

        // Resolve dependencies - get image URLs from previous steps
        let inputImages = [];
        if (step.dependsOn && step.dependsOn.length > 0) {
          for (const depOrder of step.dependsOn) {
            const depOutput = stepOutputs[depOrder];
            if (depOutput?.resultUrl) {
              inputImages.push(depOutput.resultUrl);
            }
          }
          
          // Check if we have all required dependencies
          if (inputImages.length === 0) {
            console.error(`[Director] Step ${step.order} requires input from steps [${step.dependsOn.join(', ')}] but none available`);
            // Mark as failed and stop execution
            failedSteps.add(step.order);
            this.db.prepare(`UPDATE director_executions SET status = 'failed' WHERE id = ?`).run(executionId);
            console.error(`[Director] Stopping execution - missing required dependencies for step ${step.order}`);
            return { creditsUsed, stepOutputs, failed: true, failedStep: step.order, reason: 'missing_dependencies' };
          }
        }

        // Get the model - normalize the ID first (supports short names like 'kling-2.6-pro')
        const hasInputImage = inputImages.length > 0;
        const normalizedModelId = normalizeModelId(step.model, hasInputImage);
        console.log(`[Director] Model lookup: "${step.model}" -> "${normalizedModelId}"`);
        
        let model = this.getModel(normalizedModelId);
        if (!model) {
          // Try fallback: search by name pattern
          console.log(`[Director] Model not found with ID: ${normalizedModelId}, trying name search...`);
          
          // Try to find by searching models table
          const modelByName = this.db.prepare(`
            SELECT * FROM models WHERE 
              id LIKE ? OR 
              name LIKE ? OR 
              id LIKE ?
            LIMIT 1
          `).get(`%${step.model}%`, `%${step.model}%`, `fal-%${step.model}%`);
          
          if (modelByName) {
            console.log(`[Director] Found model by name search: ${modelByName.id}`);
            // Parse the options JSON if it exists
            if (modelByName.options && typeof modelByName.options === 'string') {
              try {
                modelByName.options = JSON.parse(modelByName.options);
              } catch (e) {}
            }
            model = modelByName;
          } else {
            console.error(`[Director] Model not found: ${step.model} (normalized: ${normalizedModelId})`);
            failedSteps.add(step.order);
            this.db.prepare(`UPDATE director_executions SET status = 'failed' WHERE id = ?`).run(executionId);
            return { creditsUsed, stepOutputs, failed: true, failedStep: step.order, reason: 'model_not_found' };
          }
        }

        // Check if model requires image input but none provided
        if (model.imageInput === 'required' && inputImages.length === 0) {
          console.error(`[Director] Step ${step.order}: Model ${model.name} requires image input but none available`);
          failedSteps.add(step.order);
          this.db.prepare(`UPDATE director_executions SET status = 'failed' WHERE id = ?`).run(executionId);
          return { creditsUsed, stepOutputs, failed: true, failedStep: step.order, reason: 'image_required' };
        }

        const type = model.type || step.type || 'image';
        const price = this.calculatePrice(model, step.options || {});

        // Create a generation record
        const genId = uuidv4();
        const visibleId = genId.slice(0, 8);

        // Build options
        const genOptions = {
          ...step.options,
          inputImages: inputImages.length > 0 ? inputImages : undefined,
          directorExecutionId: executionId,
          directorStep: step.order
        };

        // Reserve credits first
        if (this.reserveCredits) {
          const reservation = this.reserveCredits(userId, price, workspaceId);
          if (!reservation.success) {
            console.error(`[Director] Step ${step.order} failed: insufficient credits`);
            failedSteps.add(step.order);
            this.db.prepare(`UPDATE director_executions SET status = 'failed' WHERE id = ?`).run(executionId);
            return { creditsUsed, stepOutputs, failed: true, failedStep: step.order, reason: 'insufficient_credits' };
          }
          genOptions.creditSource = reservation.source;
        }

        // Insert generation record
        this.db.prepare(`
          INSERT INTO generations (id, visibleId, userId, type, model, modelName, prompt, options, credits, status, workspaceId, queuedAt, maxWaitTime) 
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, datetime('now'), ?)
        `).run(
          genId,
          visibleId,
          userId,
          type,
          step.model,
          model.name,
          step.prompt,
          JSON.stringify(genOptions),
          price,
          workspaceId,
          type === 'video' ? 600 : 120
        );

        console.log(`[Director] Created generation ${visibleId} for step ${step.order}`);

        // IMPORTANT: Actually trigger the generation processing
        if (this.processGeneration) {
          console.log(`[Director] Triggering generation process for ${visibleId}`);
          // Process in background - don't await here, we'll poll for status
          this.processGeneration([genId], model, step.prompt, genOptions, inputImages, 1);
        } else {
          console.warn(`[Director] No processGeneration function - generation will not be processed!`);
        }

        // Wait for generation to complete (poll status)
        const result = await this.waitForGeneration(genId, 600000); // 10 min timeout
        
        if (result.status === 'completed') {
          stepOutputs[step.order] = {
            generationId: genId,
            resultUrl: result.result,
            thumbnailUrl: result.thumbnailUrl
          };
          creditsUsed += result.credits || price;
          console.log(`[Director] Step ${step.order} completed: ${result.result?.slice(0, 50)}...`);
        } else {
          // Step failed - mark as failed and stop execution
          console.error(`[Director] Step ${step.order} failed: ${result.error}`);
          failedSteps.add(step.order);
          this.db.prepare(`UPDATE director_executions SET status = 'failed' WHERE id = ?`).run(executionId);
          console.error(`[Director] Stopping execution - Step ${step.order} failed`);
          return { creditsUsed, stepOutputs, failed: true, failedStep: step.order, reason: result.error || 'generation_failed' };
        }

      } catch (error) {
        console.error(`[Director] Step ${step.order} error:`, error.message);
        failedSteps.add(step.order);
        this.db.prepare(`UPDATE director_executions SET status = 'failed' WHERE id = ?`).run(executionId);
        return { creditsUsed, stepOutputs, failed: true, failedStep: step.order, reason: error.message };
      }
    }

    // Mark execution as complete only if all steps succeeded
    this.db.prepare(`
      UPDATE director_executions SET status = 'completed', currentStep = ? WHERE id = ?
    `).run(plan.steps.length, executionId);
    
    console.log(`[Director] Execution ${executionId} completed successfully. Credits used: ${creditsUsed}`);
    return { creditsUsed, stepOutputs, failed: false };
  }

  /**
   * Wait for a generation to complete
   */
  async waitForGeneration(genId, timeoutMs = 300000) {
    const startTime = Date.now();
    const pollInterval = 2000; // 2 seconds

    while (Date.now() - startTime < timeoutMs) {
      const gen = this.db.prepare('SELECT * FROM generations WHERE id = ?').get(genId);
      
      if (!gen) {
        return { status: 'failed', error: 'Generation not found' };
      }

      if (gen.status === 'completed') {
        return {
          status: 'completed',
          result: gen.result,
          thumbnailUrl: gen.thumbnailUrl,
          credits: gen.credits
        };
      }

      if (gen.status === 'failed') {
        return { status: 'failed', error: gen.error || 'Generation failed' };
      }

      // Wait before next poll
      await new Promise(resolve => setTimeout(resolve, pollInterval));
    }

    return { status: 'failed', error: 'Generation timed out' };
  }

  /**
   * Get execution status with generation details
   */
  getExecutionStatus(executionId) {
    const execution = this.db.prepare(`
      SELECT * FROM director_executions WHERE id = ?
    `).get(executionId);

    if (!execution) return null;

    const plan = JSON.parse(execution.planJson);

    // Get all generations created for this execution
    const generations = this.db.prepare(`
      SELECT id, visibleId, type, model, modelName, prompt, status, result, thumbnailUrl, credits, createdAt
      FROM generations 
      WHERE json_extract(options, '$.directorExecutionId') = ?
      ORDER BY json_extract(options, '$.directorStep')
    `).all(executionId);

    // Map generations to steps
    const stepStatuses = plan.steps.map((step, idx) => {
      const gen = generations.find(g => {
        const opts = JSON.parse(this.db.prepare('SELECT options FROM generations WHERE id = ?').get(g.id)?.options || '{}');
        return opts.directorStep === step.order;
      }) || generations[idx];
      
      return {
        order: step.order,
        action: step.action,
        model: step.model,
        modelName: step.modelName,
        status: gen?.status || 'pending',
        generationId: gen?.id,
        result: gen?.result,
        thumbnailUrl: gen?.thumbnailUrl,
        credits: gen?.credits || step.estimatedCost
      };
    });

    // Calculate total credits used
    const creditsUsed = generations
      .filter(g => g.status === 'completed')
      .reduce((sum, g) => sum + (g.credits || 0), 0);

    return {
      id: execution.id,
      plan,
      mode: execution.mode,
      status: execution.status,
      currentStep: execution.currentStep,
      totalSteps: plan.steps.length,
      creditsUsed,
      stepStatuses,
      generations: generations.map(g => ({
        id: g.id,
        visibleId: g.visibleId,
        type: g.type,
        status: g.status,
        result: g.result,
        thumbnailUrl: g.thumbnailUrl
      })),
      createdAt: execution.createdAt
    };
  }

  /**
   * Start a new conversation (clear existing)
   */
  startNewConversation(userId) {
    // Mark existing conversations as archived
    this.db.prepare(`
      UPDATE director_conversations SET status = 'archived' WHERE userId = ? AND status = 'active'
    `).run(userId);

    // Create new conversation
    return this.getOrCreateConversation(userId);
  }

  /**
   * Get conversation history for a user
   */
  getConversationHistory(userId, limit = 10) {
    const conversations = this.db.prepare(`
      SELECT id, messages, currentPlan, status, createdAt, updatedAt
      FROM director_conversations
      WHERE userId = ?
      ORDER BY updatedAt DESC
      LIMIT ?
    `).all(userId, limit);

    return conversations.map(c => ({
      ...c,
      messages: JSON.parse(c.messages || '[]'),
      currentPlan: c.currentPlan ? JSON.parse(c.currentPlan) : null
    }));
  }

  /**
   * Track when user selects a model option
   * @param {string} userId - User ID
   * @param {string} conversationId - Conversation ID
   * @param {string} useCase - Use case category
   * @param {string[]} suggestedModels - Models that were suggested
   * @param {string} selectedModel - Model user selected
   * @param {string} executionId - Optional execution ID
   */
  trackSelection(userId, conversationId, useCase, suggestedModels, selectedModel, executionId = null) {
    return trackModelSelection(this.db, {
      userId,
      conversationId,
      useCase,
      suggestedModels,
      selectedModel,
      executionId
    });
  }

  /**
   * Update feedback with execution result
   * @param {string} executionId - Execution ID
   * @param {boolean} success - Whether execution succeeded
   * @param {number} rating - Optional user rating
   */
  updateFeedback(executionId, success, rating = null) {
    return updateFeedbackResult(this.db, executionId, success, rating);
  }

  /**
   * Get user preference trends for analytics
   * @param {string} userId - Optional user ID
   */
  getPreferenceTrends(userId = null) {
    return buildUserPreferenceContext(this.db, userId);
  }
}

/**
 * Create an AI Director instance
 */
function createAIDirector(options) {
  return new AIDirector(options);
}

module.exports = {
  AIDirector,
  createAIDirector,
  trackModelSelection,
  updateFeedbackResult,
  buildUserPreferenceContext
};
