# AI Creative Director & Website Builder - Technical Specification Document

> **Version:** 3.0  
> **Last Updated:** January 29, 2026  
> **Purpose:** Complete implementation guide for developers and AI assistants

## Changelog (v3.0)
- Added comprehensive SOTA Model Guide (`sotaModelGuide.md`) with leaderboard rankings
- Implemented model feedback tracking system for AI Director learning
- Added user preference trends injection into system prompt
- Updated `modelSOTAKnowledge.js` with ELO rankings and expert recommendations
- Added `model_feedback` SQLite table for tracking selections
- New API endpoints for feedback tracking

---

## Overview

This document provides complete implementation details for two major OmniHub features:

1. **AI Creative Director** - An intelligent orchestrator that helps users create amazing content by understanding their goals and orchestrating the right combination of AI models - without requiring users to know anything about specific models or technical details.

2. **AI Website Builder** - An AI-powered website generation tool that creates complete React/Tailwind websites from natural language descriptions, with live preview and code export capabilities.

---

## Table of Contents

### Part 1: AI Creative Director
1. [Architecture Overview](#1-architecture-overview)
2. [Database Schema](#2-database-schema)
3. [Model Knowledge Base (SOTA Intelligence)](#3-model-knowledge-base-sota-intelligence)
4. [SOTA Model Guide & Leaderboard Data](#4-sota-model-guide--leaderboard-data)
5. [Feedback Tracking & Self-Learning](#5-feedback-tracking--self-learning)
6. [Switchable AI Director Models](#6-switchable-ai-director-models)
7. [Platform Knowledge Document](#7-platform-knowledge-document)
8. [Backend Implementation](#8-backend-implementation)
9. [Frontend Implementation](#9-frontend-implementation)
10. [API Endpoints Reference](#10-api-endpoints-reference)
11. [Plan Object Schema](#11-plan-object-schema)
12. [Latest Features (v3.0)](#12-latest-features-v30)
13. [Implementation Checklist](#13-implementation-checklist)
14. [Testing Scenarios](#14-testing-scenarios)

### Part 2: AI Website Builder
13. [Website Builder Overview](#13-website-builder-overview)
14. [Website Builder Architecture](#14-website-builder-architecture)
15. [Website Builder Database Schema](#15-website-builder-database-schema)
16. [Website Builder API Endpoints](#16-website-builder-api-endpoints)
17. [Website Builder Frontend Implementation](#17-website-builder-frontend-implementation)
18. [Website Builder Model Integration](#18-website-builder-model-integration)
19. [Preview System & Icon Library](#19-preview-system--icon-library)
20. [Website Builder Testing Scenarios](#20-website-builder-testing-scenarios)

---

## 1. Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           FRONTEND LAYER                                 │
│  ┌────────────────────────────────────────────────────────────────────┐ │
│  │                    FloatingAssistant Component                      │ │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────────┐ │ │
│  │  │   ChatTab    │  │   PlanTab    │  │       ExecuteTab         │ │ │
│  │  │              │  │              │  │                          │ │ │
│  │  │ - Messages   │  │ - Plan View  │  │ - Progress Tracking      │ │ │
│  │  │ - Streaming  │  │ - Edit Prpts │  │ - Step Status            │ │ │
│  │  │ - Choices    │  │ - Cost View  │  │ - Output Previews        │ │ │
│  │  │ - Attachmnts │  │ - Execute    │  │ - Error Handling         │ │ │
│  │  └──────────────┘  └──────────────┘  └──────────────────────────┘ │ │
│  └────────────────────────────────────────────────────────────────────┘ │
│                              │ SSE Stream                               │
└──────────────────────────────┼──────────────────────────────────────────┘
                               ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                           BACKEND LAYER                                  │
│  ┌────────────────────────────────────────────────────────────────────┐ │
│  │                      AI Director Service                            │ │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────────┐ │ │
│  │  │ Chat Handler │  │Plan Executor │  │  Model Knowledge Svc     │ │ │
│  │  │              │  │              │  │                          │ │ │
│  │  │ - Streaming  │  │ - Step Exec  │  │ - SOTA Recommendations   │ │ │
│  │  │ - Vision     │  │ - Credits    │  │ - Use Case Mapping       │ │ │
│  │  │ - Plan Parse │  │ - Gen Proc   │  │ - Dynamic Prompts        │ │ │
│  │  └──────────────┘  └──────────────┘  └──────────────────────────┘ │ │
│  └────────────────────────────────────────────────────────────────────┘ │
│                              │                                          │
│  ┌───────────────────────────▼────────────────────────────────────────┐ │
│  │                         External APIs                               │ │
│  │  ┌──────────────────────────┐  ┌──────────────────────────────────┐│ │
│  │  │      OpenRouter API      │  │           Fal.ai API             ││ │
│  │  │  (LLM for conversation)  │  │    (Image/Video generation)      ││ │
│  │  └──────────────────────────┘  └──────────────────────────────────┘│ │
│  └────────────────────────────────────────────────────────────────────┘ │
│                              │                                          │
│  ┌───────────────────────────▼────────────────────────────────────────┐ │
│  │                    Database (SQLite/PostgreSQL)                     │ │
│  │  models | director_conversations | director_executions | settings  │ │
│  └────────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────┘
```

### Key Components

1. **FloatingAssistant** - Sliding panel UI with three tabs (Chat, Plan, Execute)
2. **AI Director Service** - Backend orchestrator handling conversation, planning, execution
3. **Model Knowledge Service** - Dynamic knowledge about all available models and SOTA recommendations
4. **Plan Executor** - Executes multi-step plans with dependency management
5. **Generation Processor** - Triggers actual AI generation via Fal.ai

---

## 2. Database Schema

### 2.1 Director Conversations Table

```sql
CREATE TABLE IF NOT EXISTS director_conversations (
    id TEXT PRIMARY KEY,
    userId TEXT NOT NULL,
    messages TEXT DEFAULT '[]',        -- JSON array of messages
    currentPlan TEXT,                   -- JSON plan object
    status TEXT DEFAULT 'active',       -- active, archived, completed
    createdAt TEXT,
    updatedAt TEXT
);

CREATE INDEX IF NOT EXISTS idx_director_conversations_userId 
    ON director_conversations(userId);
CREATE INDEX IF NOT EXISTS idx_director_conversations_status 
    ON director_conversations(status);
```

### 2.2 Director Executions Table

```sql
CREATE TABLE IF NOT EXISTS director_executions (
    id TEXT PRIMARY KEY,
    conversationId TEXT,
    workflowRunId TEXT,
    plan TEXT NOT NULL,                 -- JSON plan object
    status TEXT DEFAULT 'pending',      -- pending, running, completed, failed
    currentStep INTEGER DEFAULT 0,
    stepResults TEXT DEFAULT '[]',      -- JSON array of step results
    generationIds TEXT DEFAULT '[]',    -- JSON array of generation IDs
    error TEXT,
    createdAt TEXT,
    completedAt TEXT,
    FOREIGN KEY (conversationId) REFERENCES director_conversations(id)
);

CREATE INDEX IF NOT EXISTS idx_director_executions_status 
    ON director_executions(status);
```

### 2.3 Models Table Extended Fields (Optional Enhancement)

```sql
-- These columns can be added to enhance model knowledge
ALTER TABLE models ADD COLUMN sotaRanking INTEGER DEFAULT 0;
ALTER TABLE models ADD COLUMN specialties TEXT DEFAULT '[]';
ALTER TABLE models ADD COLUMN limitations TEXT DEFAULT '[]';
ALTER TABLE models ADD COLUMN recommendedFor TEXT DEFAULT '[]';
ALTER TABLE models ADD COLUMN notRecommendedFor TEXT DEFAULT '[]';
ALTER TABLE models ADD COLUMN versionInfo TEXT;
ALTER TABLE models ADD COLUMN releaseDate TEXT;
ALTER TABLE models ADD COLUMN benchmarkScores TEXT DEFAULT '{}';
```

### 2.4 Message Object Structure

```javascript
// Each message in the messages JSON array
{
  role: 'user' | 'assistant',
  content: string,
  attachments?: [
    {
      type: 'image' | 'url',
      data: string,  // base64 for images, URL string for urls
      name: string
    }
  ],
  timestamp: string  // ISO date string
}
```

---

## 3. Model Knowledge Base (SOTA Intelligence)

### 3.1 SOTA Model Knowledge Structure

Create file: `backend/services/modelSOTAKnowledge.js`

```javascript
/**
 * SOTA (State-of-the-Art) Model Knowledge
 * 
 * This provides expert-level knowledge about which models excel at specific tasks.
 * Keep this updated as new models are released.
 */

const SOTA_MODEL_KNOWLEDGE = {
  // ============================================================
  // IMAGE GENERATION - SOTA Rankings by Use Case
  // ============================================================
  imageGeneration: {
    textRendering: {
      sota: ['ideogram-v3', 'ideogram-v2-turbo'],
      reason: 'Ideogram models have best-in-class text rendering accuracy',
      fallback: ['flux-1.1-pro', 'imagen-3'],
      tips: 'Use when logos, text overlays, or readable text is needed in images'
    },
    photorealism: {
      sota: ['flux-1.1-pro-ultra', 'imagen-3', 'flux-realism'],
      reason: 'Highest photorealistic quality for product and portrait photography',
      fallback: ['flux-1.1-pro', 'flux-dev'],
      tips: 'Best for product shots, portraits, real-world scenes'
    },
    characterConsistency: {
      sota: ['nano-banana-pro', 'flux-pulid', 'flux-pro-1.1'],
      reason: 'Best for maintaining consistent character faces across generations',
      fallback: ['flux-dev', 'stable-diffusion-3'],
      tips: 'Essential for UGC content, character-based campaigns'
    },
    productPhotography: {
      sota: ['flux-1.1-pro', 'imagen-3', 'ideogram-v3'],
      reason: 'Clean backgrounds, professional lighting, commercial quality',
      fallback: ['flux-dev', 'stable-diffusion-3'],
      tips: 'Use for e-commerce, catalogs, product marketing'
    },
    artisticStyles: {
      sota: ['midjourney-v6', 'flux-dev', 'stable-diffusion-3'],
      reason: 'Best creative interpretation and artistic rendering',
      fallback: ['flux-schnell', 'sdxl'],
      tips: 'Use for creative artwork, illustrations, stylized content'
    },
    speed: {
      sota: ['flux-schnell', 'sdxl-lightning', 'lcm-models'],
      reason: 'Sub-second generation for rapid iteration',
      fallback: ['flux-dev'],
      tips: 'Use for prototyping, quick iterations, cost-sensitive projects'
    },
    upscaling: {
      sota: ['clarity-upscaler', 'aura-sr', 'real-esrgan'],
      reason: 'Best quality enhancement and resolution increase',
      fallback: ['creative-upscaler'],
      tips: 'Use to enhance low-res images or add detail'
    }
  },

  // ============================================================
  // VIDEO GENERATION - SOTA Rankings by Use Case
  // ============================================================
  videoGeneration: {
    motionControl: {
      sota: ['kling-2.6-pro', 'wan-move', 'runway-gen3-turbo'],
      reason: 'Precise camera movement control and motion trajectories',
      fallback: ['kling-1.6-pro', 'minimax-video'],
      tips: 'Use when specific camera movements are needed (orbit, pan, zoom)'
    },
    multiAngleShots: {
      sota: ['qwen-2.5-vl-12b', 'kling-2.6-pro'],
      reason: 'Best for generating consistent multi-angle views of same subject',
      fallback: ['veo-3.1', 'sora-2'],
      tips: 'Use for product showcases, character turnarounds'
    },
    verticalVideo: {
      sota: ['veo-3.1', 'kling-2.6-pro'],
      reason: 'Native support for 9:16 vertical video generation',
      fallback: ['minimax-video', 'runway-gen3'],
      tips: 'Essential for TikTok, Instagram Reels, YouTube Shorts'
    },
    audioGeneration: {
      sota: ['veo-3.1', 'kling-2.6-pro-audio'],
      reason: 'Built-in audio/sound generation with video',
      fallback: ['sora-2'],
      tips: 'Use when video needs synchronized audio/music'
    },
    longDuration: {
      sota: ['kling-2.6-pro', 'veo-3.1', 'minimax-video-01'],
      reason: 'Support for 10+ second video generation',
      fallback: ['runway-gen3-turbo'],
      tips: 'Use for extended scenes, longer narratives'
    },
    imageToVideo: {
      sota: ['kling-2.6-pro', 'veo-3.1', 'runway-gen3-turbo'],
      reason: 'Best animation quality from still images',
      fallback: ['minimax-video', 'stable-video-diffusion'],
      tips: 'Use to animate product shots, portraits, scenes'
    },
    characterAnimation: {
      sota: ['kling-2.6-pro', 'veo-3.1', 'wan-2.1-14b'],
      reason: 'Natural human movement and facial expressions',
      fallback: ['minimax-video', 'ltx-video'],
      tips: 'Best for UGC-style content with people'
    },
    fastIteration: {
      sota: ['ltx-video', 'wan-2.1-turbo', 'runway-gen3-turbo'],
      reason: 'Quick generation for rapid prototyping',
      fallback: ['minimax-video'],
      tips: 'Use for testing concepts before premium generation'
    },
    premiumQuality: {
      sota: ['sora-2', 'veo-3.1', 'kling-2.6-pro'],
      reason: 'Highest overall video quality and coherence',
      fallback: ['runway-gen3-alpha'],
      tips: 'Use for final deliverables, commercial content'
    }
  },

  // ============================================================
  // USE CASE RECOMMENDATIONS - Quick Reference
  // ============================================================
  useCaseRecommendations: {
    'ugc-content': {
      imageModel: 'nano-banana-pro',
      videoModel: 'kling-2.6-pro',
      reason: 'Character consistency + natural movement for influencer-style content',
      workflow: ['Generate character image', 'Animate to video with natural motion']
    },
    'product-video': {
      imageModel: 'flux-1.1-pro',
      videoModel: 'kling-2.6-pro',
      reason: 'Professional product shots + smooth camera orbits',
      workflow: ['Generate product image', 'Create 360 orbit video']
    },
    'social-media-vertical': {
      imageModel: 'flux-1.1-pro',
      videoModel: 'veo-3.1',
      reason: 'Native vertical video support for TikTok/Reels',
      workflow: ['Generate scene', 'Create 9:16 video with motion']
    },
    'logo-animation': {
      imageModel: 'ideogram-v3',
      videoModel: 'kling-2.6-pro',
      reason: 'Perfect text rendering + motion graphics capability',
      workflow: ['Generate logo image', 'Animate with entrance effects']
    },
    'cinematic-trailer': {
      imageModel: 'flux-1.1-pro-ultra',
      videoModel: 'sora-2',
      reason: 'Ultra quality images + cinematic video generation',
      workflow: ['Generate hero scenes', 'Create dramatic video sequences']
    },
    'fast-prototype': {
      imageModel: 'flux-schnell',
      videoModel: 'ltx-video',
      reason: 'Speed priority for quick iterations and concept testing',
      workflow: ['Quick image generation', 'Fast video preview']
    },
    'e-commerce-product': {
      imageModel: 'flux-1.1-pro',
      videoModel: 'minimax-video',
      reason: 'Clean product shots with reliable video quality',
      workflow: ['Generate white background product shot', 'Create simple animation']
    },
    'ai-avatar': {
      imageModel: 'nano-banana-pro',
      videoModel: 'kling-2.6-pro',
      reason: 'Consistent face + natural talking/movement',
      workflow: ['Generate consistent character', 'Animate with lip sync']
    }
  },

  // ============================================================
  // MODEL PRICING TIERS (for budget recommendations)
  // ============================================================
  pricingTiers: {
    budget: {
      imageModels: ['flux-schnell', 'sdxl-lightning', 'stable-diffusion-3'],
      videoModels: ['ltx-video', 'wan-2.1-turbo'],
      typicalCost: '0.01-0.10 credits'
    },
    balanced: {
      imageModels: ['flux-1.1-pro', 'flux-dev', 'ideogram-v2-turbo'],
      videoModels: ['minimax-video', 'kling-1.6-pro', 'runway-gen3-turbo'],
      typicalCost: '0.10-0.50 credits'
    },
    premium: {
      imageModels: ['flux-1.1-pro-ultra', 'imagen-3', 'midjourney-v6'],
      videoModels: ['sora-2', 'veo-3.1', 'kling-2.6-pro'],
      typicalCost: '0.50-2.00 credits'
    }
  }
};

/**
 * Get SOTA recommendation for a specific task
 * @param {string} category - 'image' or 'video'
 * @param {string} task - Task name from SOTA_MODEL_KNOWLEDGE
 * @returns {Object} Recommendation with sota models and reason
 */
function getSOTARecommendation(category, task) {
  const categoryKey = category === 'image' ? 'imageGeneration' : 'videoGeneration';
  return SOTA_MODEL_KNOWLEDGE[categoryKey]?.[task] || null;
}

/**
 * Get use case recommendation
 * @param {string} useCase - Use case key (e.g., 'ugc-content', 'product-video')
 * @returns {Object} Recommendation with image/video models and workflow
 */
function getUseCaseRecommendation(useCase) {
  return SOTA_MODEL_KNOWLEDGE.useCaseRecommendations[useCase] || null;
}

/**
 * Get models by pricing tier
 * @param {string} tier - 'budget', 'balanced', or 'premium'
 * @returns {Object} Image and video models for that tier
 */
function getModelsByPricingTier(tier) {
  return SOTA_MODEL_KNOWLEDGE.pricingTiers[tier] || null;
}

module.exports = {
  SOTA_MODEL_KNOWLEDGE,
  getSOTARecommendation,
  getUseCaseRecommendation,
  getModelsByPricingTier
};
```

### 3.2 Enhanced Model Knowledge Builder

The `backend/services/modelKnowledge.js` file should be updated to include SOTA recommendations in the system prompt:

```javascript
// In buildSystemPromptKnowledge function, add after existing model listing:

const { SOTA_MODEL_KNOWLEDGE } = require('./modelSOTAKnowledge');

// ADD SOTA RECOMMENDATIONS SECTION
prompt += `\n### SOTA (State-of-the-Art) RECOMMENDATIONS\n\n`;
prompt += `Use these models for best results in specific scenarios:\n\n`;

// Image recommendations
prompt += `**IMAGE GENERATION:**\n`;
prompt += `- Text Rendering: ${SOTA_MODEL_KNOWLEDGE.imageGeneration.textRendering.sota[0]} - ${SOTA_MODEL_KNOWLEDGE.imageGeneration.textRendering.reason}\n`;
prompt += `- Photorealism: ${SOTA_MODEL_KNOWLEDGE.imageGeneration.photorealism.sota[0]} - ${SOTA_MODEL_KNOWLEDGE.imageGeneration.photorealism.reason}\n`;
prompt += `- Character Consistency: ${SOTA_MODEL_KNOWLEDGE.imageGeneration.characterConsistency.sota[0]} - ${SOTA_MODEL_KNOWLEDGE.imageGeneration.characterConsistency.reason}\n`;
prompt += `- Product Photography: ${SOTA_MODEL_KNOWLEDGE.imageGeneration.productPhotography.sota[0]} - ${SOTA_MODEL_KNOWLEDGE.imageGeneration.productPhotography.reason}\n\n`;

// Video recommendations
prompt += `**VIDEO GENERATION:**\n`;
prompt += `- Motion Control: ${SOTA_MODEL_KNOWLEDGE.videoGeneration.motionControl.sota[0]} - ${SOTA_MODEL_KNOWLEDGE.videoGeneration.motionControl.reason}\n`;
prompt += `- Multi-Angle Shots: ${SOTA_MODEL_KNOWLEDGE.videoGeneration.multiAngleShots.sota[0]} - ${SOTA_MODEL_KNOWLEDGE.videoGeneration.multiAngleShots.reason}\n`;
prompt += `- Vertical Video: ${SOTA_MODEL_KNOWLEDGE.videoGeneration.verticalVideo.sota[0]} - ${SOTA_MODEL_KNOWLEDGE.videoGeneration.verticalVideo.reason}\n`;
prompt += `- Audio in Video: ${SOTA_MODEL_KNOWLEDGE.videoGeneration.audioGeneration.sota[0]} - ${SOTA_MODEL_KNOWLEDGE.videoGeneration.audioGeneration.reason}\n\n`;

// Use case quick reference
prompt += `### QUICK USE CASE REFERENCE\n\n`;
Object.entries(SOTA_MODEL_KNOWLEDGE.useCaseRecommendations).forEach(([useCase, rec]) => {
  prompt += `- **${useCase.replace(/-/g, ' ')}:** Image: ${rec.imageModel}, Video: ${rec.videoModel}\n`;
});
```

---

## 4. SOTA Model Guide & Leaderboard Data

### 4.1 SOTA Model Guide File

Create `backend/data/sotaModelGuide.md` - A comprehensive human-readable guide that the AI Director reads to understand model capabilities:

```markdown
# AI Creative Director - SOTA Model Guide

**Last Updated:** January 2026

## Leaderboard References
- **Text-to-Video:** https://artificialanalysis.ai/video/leaderboard/text-to-video
- **Image-to-Video:** https://artificialanalysis.ai/video/leaderboard/image-to-video
- **Text-to-Image:** https://artificialanalysis.ai/image/leaderboard/text-to-image
- **Image Editing:** https://artificialanalysis.ai/image/leaderboard/editing

## Video Model Rankings (January 2026)

### Text-to-Video Top Performers
| Rank | Model | ELO | Provider | Price/min | Best For |
|------|-------|-----|----------|-----------|----------|
| 1 | grok-imagine-video | 1248 | xAI | $4.20 | General |
| 2 | Runway Gen-4.5 | 1236 | Runway | Coming soon | Cinematic |
| 3 | Kling 2.5 Turbo 1080p | 1227 | KlingAI | $4.20 | Motion control |
| 4 | Veo 3.1 Fast Preview | 1226 | Google | $9.00 | Quality + Audio |
| 7 | Kling 2.6 Pro | 1215 | KlingAI | $4.20 | Motion control |
| 14 | Seedance 1.5 Pro | 1189 | ByteDance | $1.56 | Budget quality |
| 18 | Wan 2.6 | 1184 | Alibaba | $9.00 | UGC + Audio |

### Expert Recommendations (Field-Tested)
- **Motion Control**: Kling 2.6 Pro - Best camera movements, orbits, pans
- **Premium Quality**: Veo 3.1 - Cinematic quality with native audio
- **Budget Quality**: Seedance 1.5 Pro @ $1.56/min
- **UGC Content**: Wan 2.6 - Great for talking head, native audio
- **Fast Iteration**: LTX-2 Fast - Seconds to generate
```

### 4.2 Loading the Guide in AI Director

```javascript
// In aiDirector.js - buildSystemPrompt()
const { loadSOTAGuide } = require('./modelSOTAKnowledge');

buildSystemPrompt(userId = null) {
  const modelKnowledge = buildSystemPromptKnowledge(this.db);
  const sotaKnowledge = buildSOTAPromptSection();
  
  // Load SOTA model guide (truncate if too long)
  let sotaGuide = '';
  try {
    sotaGuide = loadSOTAGuide();
    if (sotaGuide.length > 15000) {
      sotaGuide = sotaGuide.slice(0, 15000) + '\n\n[Guide truncated]';
    }
  } catch (e) {
    console.warn('SOTA guide not loaded');
  }
  
  return `You are the AI Creative Director...
  
## EXPERT SOTA MODEL GUIDE

${sotaGuide}
  `;
}
```

### 4.3 Updated modelSOTAKnowledge.js Structure

The `modelSOTAKnowledge.js` file now includes:

```javascript
// Leaderboard rankings with ELO scores
const LEADERBOARD_RANKINGS = {
  textToVideo: [
    { model: 'grok-imagine-video', elo: 1248, provider: 'xAI', price: 4.20 },
    { model: 'kling-2.6-pro', elo: 1215, provider: 'KlingAI', price: 4.20 },
    { model: 'veo-3.1', elo: 1224, provider: 'Google', price: 12.00 },
    // ... more models
  ],
  imageToVideo: [
    { model: 'grok-imagine-video', elo: 1334, provider: 'xAI', price: 4.20 },
    { model: 'kling-2.6-pro', elo: 1268, provider: 'KlingAI', price: 4.20 },
    // ... more models
  ]
};

// Expert recommendations (field-tested)
const EXPERT_RECOMMENDATIONS = {
  motionControl: {
    winner: 'kling-2.6-pro',
    winnerName: 'Kling 2.6 Pro',
    reason: 'Best camera movements - orbit, pan, zoom, tilt, tracking shots',
    alternatives: ['kling-2.5-turbo', 'runway-gen3-turbo'],
    useCases: ['product showcases', '360 views', 'camera orbits']
  },
  premiumQuality: {
    winner: 'veo-3.1',
    winnerName: 'Veo 3.1',
    reason: 'Cinematic quality with native audio generation',
    alternatives: ['sora-2', 'kling-2.6-pro']
  },
  ugcContent: {
    winner: 'wan-2.6',
    winnerName: 'Wan 2.6',
    reason: 'Excellent for talking heads, natural human movement, native audio',
    alternatives: ['kling-2.6-pro', 'veo-3.1']
  },
  budgetQuality: {
    winner: 'seedance-1.5-pro',
    winnerName: 'Seedance 1.5 Pro',
    reason: 'Best quality-to-cost ratio at $1.56/min',
    alternatives: ['hailuo-2.3-fast', 'ltx-2-fast']
  }
};

// Model capabilities with API details
const modelCapabilities = {
  'kling-2.6-pro': {
    strengths: ['motion control', 'camera movements', 'long duration'],
    durationFormat: 'string without s',  // "5" or "10"
    validDurations: ['5', '10'],
    provider: 'Fal.ai',
    apiId: 'fal-kling-v2.6-pro-i2v',
    pricePerMin: 4.20,
    eloT2V: 1215,
    eloI2V: 1268
  },
  'veo-3.1': {
    strengths: ['audio generation', 'premium quality', 'native audio'],
    durationFormat: 'string with s suffix',  // "4s", "6s", "8s"
    validDurations: ['4s', '6s', '8s'],
    provider: 'Fal.ai',
    apiId: 'fal-veo3.1-i2v',
    pricePerMin: 9.00,
    eloT2V: 1226,
    eloI2V: 1301
  }
  // ... more models
};

// Exported functions
module.exports = {
  SOTA_MODEL_KNOWLEDGE,
  LEADERBOARD_RANKINGS,
  EXPERT_RECOMMENDATIONS,
  loadSOTAGuide,              // Load the markdown guide
  getSOTARecommendation,
  getExpertRecommendation,    // Get field-tested recommendations
  getLeaderboardRanking,      // Get ELO ranking for a model
  getUseCaseRecommendation,
  getModelsByPricingTier,
  getModelCapabilities,
  findBestModel,
  buildSOTAPromptSection      // Build formatted section for system prompt
};
```

---

## 5. Feedback Tracking & Self-Learning

### 5.1 Overview

The AI Director implements a feedback loop to learn from user behavior:

```
┌─────────────────────────────────────────────────────────────────┐
│                    Knowledge Sources                             │
│  ┌───────────────┐ ┌───────────────┐ ┌───────────────────────┐ │
│  │sotaModelGuide │ │ models table  │ │ model_feedback table  │ │
│  │    (.md)      │ │  (SQLite)     │ │     (SQLite)          │ │
│  └───────┬───────┘ └───────┬───────┘ └───────────┬───────────┘ │
│          │                 │                     │              │
│          └─────────────────┴─────────────────────┘              │
│                           │                                      │
│  ┌────────────────────────▼────────────────────────────────────┐│
│  │              System Prompt Builder                           ││
│  │  - Model capabilities from DB                                ││
│  │  - SOTA recommendations from guide                           ││
│  │  - User preference trends from feedback                      ││
│  └────────────────────────┬────────────────────────────────────┘│
│                           │                                      │
│  ┌────────────────────────▼────────────────────────────────────┐│
│  │                LLM (Claude/GPT)                              ││
│  │     Makes recommendations based on combined knowledge        ││
│  └────────────────────────┬────────────────────────────────────┘│
└───────────────────────────┼──────────────────────────────────────┘
                            │
                            ▼
         ┌─────────────────────────────────────┐
         │         User Selects Option          │
         │     (Tracked in model_feedback)      │
         └─────────────────┬───────────────────┘
                           │
                           ▼
         ┌─────────────────────────────────────┐
         │      Execution Success/Fail          │
         │    (Updates model_feedback.success)  │
         └─────────────────────────────────────┘
```

### 5.2 Model Feedback Table

```sql
CREATE TABLE IF NOT EXISTS model_feedback (
  id TEXT PRIMARY KEY,
  userId TEXT NOT NULL,
  conversationId TEXT,
  useCase TEXT,               -- 'ugc-content', 'product-video', etc.
  suggestedModels TEXT,       -- JSON array of suggested model IDs
  selectedModel TEXT,         -- Model ID user actually selected
  executionId TEXT,
  success INTEGER,            -- 1 if completed, 0 if failed, NULL if pending
  rating INTEGER,             -- User rating 1-5 (optional future feature)
  notes TEXT,                 -- Optional notes
  createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (userId) REFERENCES users(id),
  FOREIGN KEY (conversationId) REFERENCES director_conversations(id)
);

CREATE INDEX IF NOT EXISTS idx_model_feedback_usecase ON model_feedback(useCase);
CREATE INDEX IF NOT EXISTS idx_model_feedback_model ON model_feedback(selectedModel);
CREATE INDEX IF NOT EXISTS idx_model_feedback_userId ON model_feedback(userId);
```

### 5.3 Tracking Functions

```javascript
// In aiDirector.js

/**
 * Track when a user selects a model option
 */
function trackModelSelection(db, feedback) {
  const id = uuidv4();
  db.prepare(`
    INSERT INTO model_feedback (id, userId, conversationId, useCase, 
                                suggestedModels, selectedModel, executionId, createdAt)
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
  return id;
}

/**
 * Update feedback record with execution result
 */
function updateFeedbackResult(db, executionId, success, rating = null) {
  db.prepare(`
    UPDATE model_feedback 
    SET success = ?, rating = ?
    WHERE executionId = ?
  `).run(success ? 1 : 0, rating, executionId);
}

/**
 * Build user preference context from feedback data
 */
function buildUserPreferenceContext(db, userId = null) {
  // Get aggregated stats from last 30 days
  const stats = db.prepare(`
    SELECT useCase, selectedModel, 
           COUNT(*) as picks,
           AVG(CASE WHEN success = 1 THEN 1.0 
                    WHEN success = 0 THEN 0.0 
                    ELSE NULL END) as successRate
    FROM model_feedback
    WHERE createdAt > datetime('now', '-30 days')
    GROUP BY useCase, selectedModel
    HAVING picks >= 2
    ORDER BY picks DESC
    LIMIT 20
  `).all();
  
  if (stats.length === 0) return '';
  
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
  
  // Add failing models warning
  const failingModels = db.prepare(`
    SELECT selectedModel, COUNT(*) as failures
    FROM model_feedback
    WHERE createdAt > datetime('now', '-7 days') AND success = 0
    GROUP BY selectedModel
    HAVING failures >= 3
    ORDER BY failures DESC
    LIMIT 5
  `).all();
  
  if (failingModels.length > 0) {
    context += '**⚠️ Models with Recent Failures:**\n';
    failingModels.forEach(m => {
      context += `- ${m.selectedModel}: ${m.failures} failures this week\n`;
    });
  }
  
  return context;
}
```

### 5.4 Integration with executePlan()

```javascript
async executePlan(userId, plan, mode = 'full_auto', workspaceId = null, conversationId = null) {
  const executionId = uuidv4();
  
  // Create execution record
  this.db.prepare(`
    INSERT INTO director_executions (id, conversationId, planJson, status, mode, currentStep, createdAt)
    VALUES (?, ?, ?, 'running', ?, 0, datetime('now'))
  `).run(executionId, conversationId, JSON.stringify(plan), mode);

  // Track model selections for feedback learning
  const modelsUsed = plan.steps.map(step => step.model).filter(Boolean);
  const uniqueModels = [...new Set(modelsUsed)];
  
  // Determine use case from plan
  let useCase = 'general';
  const titleLower = (plan.title || '').toLowerCase();
  if (titleLower.includes('ugc')) useCase = 'ugc-content';
  else if (titleLower.includes('product')) useCase = 'product-video';
  else if (titleLower.includes('talking')) useCase = 'talking-head';
  // ... more use case detection
  
  // Track each unique model selection
  for (const model of uniqueModels) {
    this.trackSelection(userId, conversationId, useCase, uniqueModels, model, executionId);
  }

  // Start execution in background
  this.executeSteps(executionId, userId, plan, workspaceId, mode).then(result => {
    // Update feedback with execution result
    this.updateFeedback(executionId, !result.failed);
  }).catch(err => {
    this.updateFeedback(executionId, false);
  });

  return { executionId, status: 'running', mode, stepsCount: plan.steps.length };
}
```

### 5.5 System Prompt with User Preferences

```javascript
buildSystemPrompt(userId = null) {
  const modelKnowledge = buildSystemPromptKnowledge(this.db);
  const sotaKnowledge = buildSOTAPromptSection();
  const userPreferences = buildUserPreferenceContext(this.db, userId);  // NEW
  
  let sotaGuide = '';
  try {
    sotaGuide = loadSOTAGuide();
  } catch (e) {}
  
  return `You are the AI Creative Director for OmniHub...

## PLATFORM KNOWLEDGE
${platformKnowledge}

## MODEL KNOWLEDGE
${modelKnowledge}

${sotaKnowledge}

${userPreferences}  // Injected user preference trends

## EXPERT SOTA MODEL GUIDE
${sotaGuide.slice(0, 8000)}

## YOUR ROLE
...`;
}
```

### 5.6 API Endpoint for Feedback

```javascript
// POST /api/director/execute - Updated to include conversationId
app.post('/api/director/execute', userAuthMiddleware, async (req, res) => {
  const { plan, mode, workspaceId, conversationId } = req.body;
  
  if (!plan) {
    return res.status(400).json({ error: 'Plan is required' });
  }

  try {
    const result = await aiDirector.executePlan(
      req.user.id, 
      plan, 
      mode || 'full_auto', 
      workspaceId,
      conversationId  // Pass for feedback tracking
    );
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
```

---

## 6. Switchable AI Director Models

### 4.1 Settings Configuration

Add to settings table initialization in `backend/index.js`:

```javascript
// Default settings for AI Director
const defaultSettings = [
  ['aiDirectorModel', 'anthropic/claude-sonnet-4.5'],
  ['aiDirectorModelOptions', JSON.stringify([
    {
      id: 'anthropic/claude-sonnet-4.5',
      name: 'Claude Sonnet 4.5',
      description: 'Best balance of speed and intelligence',
      costPerMessage: 0.003,
      recommended: true,
      capabilities: ['vision', 'planning', 'creative']
    },
    {
      id: 'anthropic/claude-opus-4.5',
      name: 'Claude Opus 4.5',
      description: 'Most capable, best for complex planning',
      costPerMessage: 0.015,
      recommended: false,
      capabilities: ['vision', 'planning', 'creative', 'reasoning']
    },
    {
      id: 'openai/o3',
      name: 'OpenAI o3',
      description: 'Advanced reasoning, excellent for multi-step planning',
      costPerMessage: 0.02,
      recommended: false,
      capabilities: ['reasoning', 'planning']
    },
    {
      id: 'google/gemini-3-pro-preview',
      name: 'Gemini 3 Pro',
      description: 'Fast, good multimodal understanding',
      costPerMessage: 0.005,
      recommended: false,
      capabilities: ['vision', 'speed', 'multimodal']
    }
  ])]
];
```

### 4.2 API Endpoints for Model Selection

```javascript
// GET /api/director/models - Get available director models
app.get('/api/director/models', userAuthMiddleware, (req, res) => {
  const current = getSetting('aiDirectorModel');
  const optionsJson = getSetting('aiDirectorModelOptions');
  const models = JSON.parse(optionsJson || '[]');
  
  // Check for user preference
  const userPref = db.prepare(`
    SELECT value FROM user_settings 
    WHERE userId = ? AND key = 'preferredDirectorModel'
  `).get(req.user.id);
  
  res.json({ 
    current: userPref?.value || current, 
    models,
    isUserPreference: !!userPref
  });
});

// POST /api/director/models - Set user's preferred director model
app.post('/api/director/models', userAuthMiddleware, (req, res) => {
  const { modelId } = req.body;
  
  // Validate modelId exists in options
  const optionsJson = getSetting('aiDirectorModelOptions');
  const models = JSON.parse(optionsJson || '[]');
  if (!models.find(m => m.id === modelId)) {
    return res.status(400).json({ error: 'Invalid model ID' });
  }
  
  // Store user preference
  db.prepare(`
    INSERT OR REPLACE INTO user_settings (userId, key, value)
    VALUES (?, 'preferredDirectorModel', ?)
  `).run(req.user.id, modelId);
  
  res.json({ success: true, model: modelId });
});
```

### 4.3 Frontend Model Selector Component

Add to `FloatingAssistant.jsx`:

```jsx
// State for model selection
const [selectedDirectorModel, setSelectedDirectorModel] = useState(null);
const [availableDirectorModels, setAvailableDirectorModels] = useState([]);

// Load available director models
useEffect(() => {
  const loadDirectorModels = async () => {
    try {
      const res = await axios.get(`${API_BASE}/director/models`, getAuthHeaders());
      setAvailableDirectorModels(res.data.models);
      setSelectedDirectorModel(res.data.current);
    } catch (e) {
      console.error('Failed to load director models');
    }
  };
  if (isOpen) loadDirectorModels();
}, [isOpen]);

// Handle model change
const handleDirectorModelChange = async (modelId) => {
  try {
    await axios.post(`${API_BASE}/director/models`, { modelId }, getAuthHeaders());
    setSelectedDirectorModel(modelId);
    // Optionally show success toast
  } catch (e) {
    console.error('Failed to update director model');
  }
};

// Render model selector in header
<div className="flex items-center gap-2">
  <span className="text-xs text-[var(--text-muted)]">AI:</span>
  <select 
    value={selectedDirectorModel || ''}
    onChange={(e) => handleDirectorModelChange(e.target.value)}
    className="text-xs bg-[var(--bg-tertiary)] border border-[var(--border-color)] rounded px-2 py-1"
  >
    {availableDirectorModels.map(m => (
      <option key={m.id} value={m.id}>
        {m.name} {m.recommended ? '★' : ''}
      </option>
    ))}
  </select>
</div>
```

---

## 7. Platform Knowledge Document

### 5.1 Platform Knowledge File

Create `backend/data/platformKnowledge.md`:

```markdown
# OmniHub Platform Knowledge

## Platform Overview
OmniHub is a unified AI generation platform that provides access to multiple AI providers 
(Fal.ai, Replicate, OpenRouter) through a single interface. Users don't need to understand 
individual providers - the platform handles routing automatically.

## Credit System
- 1 Credit = 1 USD (direct provider pricing passthrough)
- Users purchase credits and spend them on generations
- Each model has a base cost displayed in credits
- Credits are reserved before generation and committed/refunded after

## Generation Types

### Image Generation
- **Text-to-Image**: Generate images from text descriptions
- **Image-to-Image**: Transform or edit existing images
- **Upscaling**: Enhance resolution and detail of images

### Video Generation
- **Text-to-Video**: Generate videos from text descriptions
- **Image-to-Video**: Animate still images into videos
- **Video Extension**: Extend existing video clips

### Chat/LLM
- Conversational AI for various purposes
- Used internally by AI Director for planning

## Workflow System
- Multi-step workflows allow chaining generations
- Step outputs can be used as inputs for subsequent steps
- Support for dependencies between steps
- Human-in-the-loop approval for sensitive steps

## Key Features
- **AI Creative Director**: Intelligent assistant for planning complex content
- **Batch Generation**: Generate multiple variations at once
- **Model Comparison**: Compare outputs from different models
- **Project Organization**: Organize generations into projects

## User Roles
- **User**: Generate content within credit balance
- **Admin**: Full platform management and configuration
- **Workspace Members**: Shared credit pools for teams

## API Structure
- All generations use unified `/api/generate` endpoint
- Real-time status updates via polling
- Webhook support for completion notifications
```

### 5.2 Inject Platform Knowledge into System Prompt

Update `aiDirector.js` to include platform knowledge:

```javascript
const fs = require('fs');
const path = require('path');

buildSystemPrompt() {
  const modelKnowledge = buildSystemPromptKnowledge(this.db);
  
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
  
  return `You are the AI Creative Director for OmniHub.

${platformKnowledge}

${modelKnowledge}

## YOUR ROLE
... (rest of existing system prompt)
`;
}
```

---

## 8. Backend Implementation

### 6.1 AIDirector Class Structure

File: `backend/services/aiDirector.js`

```javascript
class AIDirector {
  constructor(options = {}) {
    this.db = options.db;
    this.getSetting = options.getSetting;
    this.getModel = options.getModel;
    this.calculatePrice = options.calculatePrice;
    this.processGeneration = options.processGeneration;
    this.reserveCredits = options.reserveCredits;
    this.commitCredits = options.commitCredits;
    this.releaseCredits = options.releaseCredits;
  }

  // Get director model from settings or user preference
  getDirectorModel(userId = null) {
    if (userId) {
      const userPref = this.db.prepare(`
        SELECT value FROM user_settings 
        WHERE userId = ? AND key = 'preferredDirectorModel'
      `).get(userId);
      if (userPref?.value) return userPref.value;
    }
    return this.getSetting('aiDirectorModel') || 'anthropic/claude-sonnet-4.5';
  }

  // Build system prompt with all knowledge
  buildSystemPrompt() { /* ... */ }

  // Get or create conversation
  getOrCreateConversation(userId) { /* ... */ }

  // Save conversation state
  saveConversation(conversation) { /* ... */ }

  // Stream chat response (async generator)
  async *chat(userId, message, conversationId, attachments) { /* ... */ }

  // Execute a plan
  async executePlan(userId, plan, workspaceId, conversationId) { /* ... */ }

  // Execute plan steps with dependency management
  async executeSteps(executionId, plan, workspaceId, userId) { /* ... */ }

  // Get execution status
  getExecutionStatus(executionId) { /* ... */ }

  // Start new conversation (archive old ones)
  startNewConversation(userId) { /* ... */ }

  // Get conversation history
  getConversationHistory(userId, limit) { /* ... */ }
}
```

### 6.2 Key Method: chat()

```javascript
async *chat(userId, message, conversationId = null, attachments = []) {
  const openrouterKey = this.getSetting('openrouterApiKey');
  if (!openrouterKey) {
    yield { type: 'error', content: 'OpenRouter API key not configured' };
    return;
  }

  // Get or create conversation
  let conversation;
  if (conversationId) {
    conversation = this.db.prepare(
      'SELECT * FROM director_conversations WHERE id = ? AND userId = ?'
    ).get(conversationId, userId);
    if (conversation) {
      conversation.messages = JSON.parse(conversation.messages || '[]');
      conversation.currentPlan = conversation.currentPlan 
        ? JSON.parse(conversation.currentPlan) : null;
    }
  }
  if (!conversation) {
    conversation = this.getOrCreateConversation(userId);
  }

  yield { type: 'start', conversationId: conversation.id };

  // Build message content with attachments
  let messageContent = message;
  if (attachments?.length > 0) {
    const attachmentDescriptions = attachments.map((a, i) => {
      if (a.type === 'image') return `[Attached image ${i + 1}: ${a.name}]`;
      if (a.type === 'url') return `[Reference URL: ${a.data}]`;
      return '';
    }).filter(Boolean).join('\n');
    messageContent = `${attachmentDescriptions}\n\n${message}`;
  }

  // Add user message
  conversation.messages.push({
    role: 'user',
    content: messageContent,
    attachments,
    timestamp: new Date().toISOString()
  });

  // Build API messages (handle vision models)
  const directorModel = this.getDirectorModel(userId);
  const systemPrompt = this.buildSystemPrompt();
  const isVisionModel = directorModel.includes('sonnet') || 
                        directorModel.includes('gpt-4') || 
                        directorModel.includes('gemini');
  const hasImageAttachments = attachments?.some(a => a.type === 'image');

  let apiMessages;
  if (isVisionModel && hasImageAttachments) {
    // Build multimodal messages
    apiMessages = [
      { role: 'system', content: systemPrompt },
      ...conversation.messages.slice(-20).map(m => {
        if (m.attachments?.some(a => a.type === 'image')) {
          return {
            role: m.role,
            content: [
              { type: 'text', text: m.content },
              ...m.attachments.filter(a => a.type === 'image').map(a => ({
                type: 'image_url',
                image_url: { url: a.data }
              }))
            ]
          };
        }
        return { role: m.role, content: m.content };
      })
    ];
  } else {
    apiMessages = [
      { role: 'system', content: systemPrompt },
      ...conversation.messages.slice(-20).map(m => ({ 
        role: m.role, 
        content: m.content 
      }))
    ];
  }

  // Stream response from OpenRouter
  try {
    const response = await axios.post(
      'https://openrouter.ai/api/v1/chat/completions',
      {
        model: directorModel,
        messages: apiMessages,
        stream: true,
        temperature: 0.7,
        max_tokens: 4000
      },
      {
        headers: {
          'Authorization': `Bearer ${openrouterKey}`,
          'Content-Type': 'application/json'
        },
        responseType: 'stream'
      }
    );

    let fullContent = '';
    
    // Process SSE stream
    for await (const chunk of response.data) {
      const lines = chunk.toString().split('\n');
      for (const line of lines) {
        if (line.startsWith('data: ') && line !== 'data: [DONE]') {
          try {
            const data = JSON.parse(line.slice(6));
            const content = data.choices?.[0]?.delta?.content;
            if (content) {
              fullContent += content;
              yield { type: 'content', content };
            }
          } catch (e) { /* skip */ }
        }
      }
    }

    // Check for plan in response
    const planMatch = fullContent.match(/<plan>([\s\S]*?)<\/plan>/);
    if (planMatch) {
      try {
        const plan = JSON.parse(planMatch[1]);
        conversation.currentPlan = plan;
        yield { type: 'plan', plan };
      } catch (e) {
        console.error('Failed to parse plan:', e);
      }
    }

    // Save assistant message
    conversation.messages.push({
      role: 'assistant',
      content: fullContent,
      timestamp: new Date().toISOString()
    });

    this.saveConversation(conversation);
    yield { type: 'done' };

  } catch (error) {
    console.error('AI Director chat error:', error);
    yield { type: 'error', content: error.message };
  }
}
```

### 6.3 Key Method: executePlan()

```javascript
async executePlan(userId, plan, workspaceId, conversationId = null) {
  const executionId = uuidv4();
  
  // Create execution record
  this.db.prepare(`
    INSERT INTO director_executions 
    (id, conversationId, plan, status, currentStep, stepResults, generationIds, createdAt)
    VALUES (?, ?, ?, 'running', 0, '[]', '[]', datetime('now'))
  `).run(executionId, conversationId, JSON.stringify(plan));

  // Start execution in background
  this.executeSteps(executionId, plan, workspaceId, userId).catch(err => {
    console.error('Execution error:', err);
    this.db.prepare(`
      UPDATE director_executions 
      SET status = 'failed', error = ?
      WHERE id = ?
    `).run(err.message, executionId);
  });

  return { executionId, status: 'running', plan };
}
```

---

## 9. Frontend Implementation

### 7.1 FloatingAssistant Component Structure

File: `frontend/src/components/director/FloatingAssistant.jsx`

```jsx
export default function FloatingAssistant({ user }) {
  // ============================================================
  // STATE MANAGEMENT
  // ============================================================
  
  // Panel state
  const [isOpen, setIsOpen] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [activeTab, setActiveTab] = useState('chat');

  // Chat state
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingContent, setStreamingContent] = useState('');
  const [conversationId, setConversationId] = useState(null);
  const [attachments, setAttachments] = useState([]);

  // Plan & Execution state
  const [currentPlan, setCurrentPlan] = useState(null);
  const [activeExecution, setActiveExecution] = useState(null);
  const [suggestedActions, setSuggestedActions] = useState([]);

  // Director model state
  const [selectedDirectorModel, setSelectedDirectorModel] = useState(null);
  const [availableDirectorModels, setAvailableDirectorModels] = useState([]);

  // Refs
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  // ============================================================
  // KEY FUNCTIONS
  // ============================================================

  // Send message via SSE stream
  const handleSend = async (overrideMessage = null) => { /* ... */ };

  // Execute the current plan
  const handleExecute = async (mode = 'full_auto', updatedPlan = null) => { /* ... */ };

  // Parse AI response for clickable actions
  const detectSuggestedActions = useCallback((content) => { /* ... */ }, []);

  // Dispatch event to refresh OmniHub gallery
  const triggerGenerationsRefresh = useCallback(() => {
    window.dispatchEvent(new CustomEvent('director-generation-update'));
  }, []);

  // ============================================================
  // RENDER
  // ============================================================

  return (
    <>
      {/* Floating Button */}
      <AnimatePresence>
        {!isOpen && (
          <motion.button onClick={() => setIsOpen(true)} /* ... */ />
        )}
      </AnimatePresence>

      {/* Sliding Panel */}
      <AnimatePresence>
        {isOpen && (
          <motion.div /* panel container */>
            {/* Header with model selector */}
            {/* Tab navigation */}
            {/* Tab content (ChatTab, PlanTab, ExecuteTab) */}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
```

### 7.2 ChatTab Component

```jsx
function ChatTab({ 
  messages, streamingContent, isStreaming, input, setInput,
  handleSend, inputRef, messagesEndRef, attachments, setAttachments,
  onSelectOption, suggestedActions, onExecutePlan 
}) {
  // File input ref for attachments
  const fileInputRef = useRef(null);
  
  // Parse question choices from last assistant message
  const questionChoices = useMemo(() => { /* ... */ }, [messages, isStreaming]);

  return (
    <>
      {/* Messages container */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Render each message */}
        {messages.map((msg, i) => (
          <MessageBubble key={i} message={msg} onSelectOption={onSelectOption} />
        ))}
        
        {/* Streaming content */}
        {streamingContent && <StreamingMessage content={streamingContent} />}
        
        <div ref={messagesEndRef} />
      </div>

      {/* Attachments preview */}
      {attachments.length > 0 && <AttachmentsPreview /* ... */ />}

      {/* Question choices (clickable pills) */}
      {questionChoices.length > 0 && <QuestionChoices /* ... */ />}

      {/* Suggested actions (clickable buttons) */}
      {suggestedActions.length > 0 && <SuggestedActions /* ... */ />}

      {/* Input area */}
      <div className="p-4 border-t">
        <input 
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSend()}
          placeholder="Describe what you want to create..."
        />
        <button onClick={handleSend}>Send</button>
      </div>
    </>
  );
}
```

---

## 10. API Endpoints Reference

### 8.1 Chat Endpoint (SSE Streaming)

```
POST /api/director/chat
Headers: Authorization: Bearer <token>
Content-Type: application/json

Request Body:
{
  "message": "I want to create a product video",
  "conversationId": "uuid-string" | null,
  "attachments": [
    {
      "type": "image",
      "data": "data:image/png;base64,...",
      "name": "product.png"
    }
  ]
}

Response: Server-Sent Events stream
Events:
  data: {"type":"start","conversationId":"uuid"}
  data: {"type":"content","content":"Here's what I suggest..."}
  data: {"type":"content","content":" for your product video."}
  data: {"type":"plan","plan":{...planObject}}
  data: {"type":"done"}
  data: {"type":"error","content":"Error message"}
```

### 8.2 Execute Plan Endpoint

```
POST /api/director/execute
Headers: Authorization: Bearer <token>
Content-Type: application/json

Request Body:
{
  "plan": {
    "title": "Product Video",
    "steps": [...],
    "totalCost": 1.5
  },
  "mode": "full_auto"  // or "step_by_step"
}

Response:
{
  "executionId": "uuid",
  "status": "running",
  "plan": {...}
}
```

### 8.3 Get Execution Status

```
GET /api/director/executions/:id
Headers: Authorization: Bearer <token>

Response:
{
  "id": "uuid",
  "status": "running" | "completed" | "failed",
  "currentStep": 1,
  "stepResults": [
    {
      "stepOrder": 1,
      "status": "completed",
      "generationId": "uuid",
      "outputUrl": "https://..."
    }
  ],
  "generationIds": ["uuid1", "uuid2"],
  "error": null
}
```

### 8.4 Get Conversations

```
GET /api/director/conversations
Headers: Authorization: Bearer <token>

Response:
[
  {
    "id": "uuid",
    "status": "active",
    "messages": [...],
    "currentPlan": {...} | null,
    "createdAt": "2026-01-27T...",
    "updatedAt": "2026-01-27T..."
  }
]
```

### 8.5 Start New Conversation

```
POST /api/director/conversations
Headers: Authorization: Bearer <token>

Response:
{
  "conversationId": "uuid"
}
```

---

## 11. Plan Object Schema

### 9.1 TypeScript Interface

```typescript
interface Plan {
  title: string;
  summary: string;
  steps: PlanStep[];
  totalCost: number;
  estimatedTime: string;
  finalOutputs: string[];
}

interface PlanStep {
  order: number;
  action: string;           // Human-readable action description
  model: string;            // Model ID from database (e.g., 'flux-1.1-pro')
  modelName: string;        // Display name (e.g., 'FLUX 1.1 Pro')
  type: 'image' | 'video' | 'chat';
  prompt: string;           // The prompt for generation
  options: {                // Model-specific options
    aspectRatio?: string;
    numImages?: number;
    duration?: number;
    // ... other model options
  };
  estimatedCost: number;
  dependsOn: number[];      // Array of step order numbers this step depends on
  outputDescription: string; // Description of expected output
}
```

### 9.2 Example Plan JSON

```json
{
  "title": "UGC Skincare Video",
  "summary": "Create an authentic UGC-style video featuring a character using skincare products",
  "steps": [
    {
      "order": 1,
      "action": "Generate character image",
      "model": "nano-banana-pro",
      "modelName": "Nano Banana Pro",
      "type": "image",
      "prompt": "Young woman with natural makeup, morning lighting, bathroom setting, holding skincare product, authentic casual style",
      "options": {
        "aspectRatio": "9:16"
      },
      "estimatedCost": 0.15,
      "dependsOn": [],
      "outputDescription": "Base character image for video"
    },
    {
      "order": 2,
      "action": "Animate to video",
      "model": "kling-2.6-pro",
      "modelName": "Kling 2.6 Pro",
      "type": "video",
      "prompt": "Character naturally applying skincare product, gentle movements, authentic UGC style, soft morning light",
      "options": {
        "duration": 5,
        "aspectRatio": "9:16"
      },
      "estimatedCost": 1.20,
      "dependsOn": [1],
      "outputDescription": "Final UGC-style video"
    }
  ],
  "totalCost": 1.35,
  "estimatedTime": "2-3 minutes",
  "finalOutputs": ["UGC skincare video in 9:16 format"]
}
```

---

## 12. Latest Features (v3.0)

### 12.1 Comprehensive SOTA Model Guide (NEW in v3.0)

Created `backend/data/sotaModelGuide.md` - a comprehensive guide with:
- Artificial Analysis leaderboard rankings with ELO scores
- Expert field-tested recommendations
- API provider information and pricing
- Workflow recommendations for different use cases
- Failure handling and fallback strategies

The AI Director now reads this guide and incorporates the knowledge into recommendations.

### 12.2 Feedback Tracking System (NEW in v3.0)

Implemented self-learning capabilities through feedback tracking:

```javascript
// What gets tracked:
- User model selections (which model they picked from suggestions)
- Use case context (ugc-content, product-video, etc.)
- Execution success/failure outcomes

// How it's used:
- User preference trends injected into system prompt
- Failing models get warnings in recommendations
- Most popular models for each use case are surfaced
```

**Database Table:** `model_feedback`
- Tracks every model selection with use case context
- Records success/failure of executions
- Aggregated into preference trends for LLM consumption

### 12.3 Suggested Actions - "Looks good, start!"

When the AI presents a plan, the system now shows suggested action buttons above the chat input:

```javascript
// In FloatingAssistant.jsx - detectSuggestedActions function
if (currentPlan && !activeExecution) {
  setSuggestedActions([
    { label: 'Looks good, start!', value: '__EXECUTE__', primary: true },
    { label: 'Make changes', value: "I'd like to make some changes to the plan" },
  ]);
  return;
}
```

**Behavior:**
- Shows immediately when plan is generated
- Primary "Looks good, start!" button triggers execution
- "Make changes" option allows plan modification
- Disappears once execution starts

### 12.4 Resolution Settings (1K/2K/4K)

Updated `STEP_SETTINGS` to match modern model capabilities like Nano Banana Pro:

```javascript
const STEP_SETTINGS = {
  image: {
    aspectRatio: ['1:1', '16:9', '9:16', '4:3', '21:9'],
    resolution: ['1K', '2K', '4K'],  // Matches Nano Banana Pro API
    variations: [1, 2, 3, 4]
  },
  video: {
    aspectRatio: ['16:9', '9:16', '1:1'],
    duration: ['5', '10'],  // String format for Kling API compatibility
    fps: [24, 30]
  }
};
```

### 12.5 Kling I2V Auto-Switching

The `enhancePlan()` function now automatically switches Kling models to Image-to-Video variant when a step depends on an image generation step:

```javascript
// In aiDirector.js - enhancePlan function
if (step.dependsOn.length > 0) {
  const modelLower = step.model.toLowerCase();
  if (modelLower.includes('kling') && !modelLower.includes('i2v')) {
    // Switch to I2V variant
    if (modelLower.includes('2.6') || modelLower.includes('v2.6')) {
      step.model = 'fal-kling-v2.6-pro-i2v';
      console.log(`[Director] Switched step ${step.order} to Kling 2.6 Pro I2V`);
    }
    // Update model name
    const updatedModel = this.getModel(step.model);
    if (updatedModel) step.modelName = updatedModel.name;
  }
}
```

**Why this matters:**
- Kling has separate Text-to-Video (T2V) and Image-to-Video (I2V) endpoints
- I2V requires `start_image_url` parameter
- Auto-switching ensures the correct endpoint is called

### 12.6 Failure Handling with Retry Options

Enhanced `ExecutionStatusCard` component to show actionable failure states:

```jsx
// ExecutionStatusCard now includes:
{isFailed && (
  <div className="px-4 py-3 border-t border-[var(--border-color)] bg-red-500/5">
    <p className="text-xs text-red-400 mb-2">
      {failedSteps.length === totalSteps 
        ? 'All steps failed. Would you like to try again?' 
        : `${failedSteps.length} step(s) failed. What would you like to do?`}
    </p>
    <div className="flex gap-2">
      <button onClick={onRetry}>Retry Failed</button>
      <button onClick={onTryDifferentModel}>Try Different Model</button>
    </div>
  </div>
)}
```

**Key behaviors:**
- Shows clear "Failed" status instead of stuck "Generating..."
- Provides "Retry Failed" button to retry failed steps
- Provides "Try Different Model" to suggest alternatives
- Credits for failed steps are automatically refunded

### 12.7 Stuck Execution Timeout Detection

Added timeout mechanism to detect and recover from stuck executions:

```javascript
// In FloatingAssistant.jsx - polling useEffect
if (isActiveExecution) {
  let pollCount = 0;
  const maxPolls = 300; // 10 minutes at 2s intervals
  
  const interval = setInterval(async () => {
    pollCount++;
    
    // Timeout detection
    if (pollCount > maxPolls) {
      clearInterval(interval);
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: '**Execution timed out** - The process took longer than expected...',
        isError: true
      }]);
      setActiveExecution(prev => ({ ...prev, status: 'failed' }));
      return;
    }
    // ... continue polling
  }, 2000);
}
```

### 12.8 Double-Click Prevention

Prevents accidental double execution:

```javascript
const handleExecute = async (mode = 'full_auto', updatedPlan = null) => {
  // Prevent double execution
  if (activeExecution && activeExecution.status === 'running') {
    console.log('[Director] Execution already in progress, ignoring duplicate click');
    return;
  }
  
  // Set placeholder execution immediately for UI feedback
  setActiveExecution({
    status: 'starting',
    plan: planToExecute,
    currentStep: 0
  });
  // ... continue execution
};
```

### 12.9 Recommended Models Update

System prompt now recommends better models:

```javascript
// In aiDirector.js - buildSystemPrompt
## RECOMMENDED MODELS (Use these first):
- **nano-banana-pro**: Google's best multimodal image model - excellent for product shots,
  complex scenes, and photorealistic images. Supports up to 14 input images. ~$0.15/image
- **seed-dream-4.5**: ByteDance's flagship - great for creative and artistic images. ~$0.04/image  
- **flux-1.1-pro**: Fast, reliable for general purposes. ~$0.04/image
- **kling-2.6-pro**: Best video model for motion control and I2V. Duration "5" or "10". ~$0.35/5s
- **qwen-2512**: Excellent for multi-angle shots from a single product image. ~$0.02/image
```

---

## 13. Implementation Checklist

### Backend Tasks
- [ ] Create `director_conversations` table with proper indexes
- [ ] Create `director_executions` table
- [ ] Implement `AIDirector` class with all methods
- [ ] Create `modelKnowledge.js` service for dynamic model info
- [ ] Create `modelSOTAKnowledge.js` with SOTA recommendations
- [ ] Create `platformKnowledge.md` documentation file
- [ ] Add director API routes (chat, execute, models, conversations)
- [ ] Integrate with existing generation processor
- [ ] Add credit reservation/commitment for executions
- [ ] Add user preference storage for director model

### Frontend Tasks
- [ ] Create `FloatingAssistant` component with sliding panel
- [ ] Implement SSE streaming for chat
- [ ] Build `ChatTab` with message rendering and markdown support
- [ ] Build `PlanTab` with editable prompts and cost view
- [ ] Build `ExecuteTab` with progress tracking
- [ ] Add clickable options/choices parsing (parseQuestionChoices)
- [ ] Implement attachment upload (images, URLs)
- [ ] Add director model selector dropdown
- [ ] Connect to OmniHub gallery refresh events
- [ ] Add suggested actions detection and rendering

### Model Knowledge Tasks
- [x] Document all SOTA models by category
- [x] Create use case recommendation mappings
- [x] Add model specialties, limitations to SOTA knowledge
- [x] Build dynamic system prompt with SOTA knowledge
- [x] Create `sotaModelGuide.md` with leaderboard data
- [x] Add expert recommendations (field-tested)
- [ ] Create maintenance process for keeping SOTA data updated
- [ ] Set up automated leaderboard sync (future)

### Feedback Tracking Tasks
- [x] Create `model_feedback` SQLite table
- [x] Implement `trackModelSelection()` function
- [x] Implement `updateFeedbackResult()` function  
- [x] Implement `buildUserPreferenceContext()` function
- [x] Inject user preference trends into system prompt
- [x] Update `executePlan()` to track selections
- [x] Update API endpoint to pass `conversationId`
- [x] Update frontend to send `conversationId` on execute
- [ ] Add user rating feature (future)
- [ ] Add analytics dashboard for feedback data (future)

---

## 14. Testing Scenarios

### 14.1 Basic Conversation Flow
1. Open AI Director panel
2. Type: "I want to create a product video"
3. Verify: AI asks clarifying questions with clickable options
4. Click an option (e.g., "professional style")
5. Verify: AI presents 2-3 options (budget/balanced/premium)
6. Click an option
7. Verify: AI shows detailed plan with steps and costs
8. Click "Start" or say "execute"
9. Verify: Execution starts and progress is tracked

### 14.2 Image Attachment Flow
1. Click attachment button
2. Select/upload a product image
3. Type: "Make a video from this"
4. Verify: AI acknowledges the image
5. Verify: AI suggests image-to-video workflow
6. Execute and verify the attached image is used

### 14.3 Complex Multi-Step Workflow
1. Request: "Create a cinematic product trailer with multiple shots"
2. Verify: Plan includes multiple image + video steps
3. Verify: Dependencies are correctly set (video steps depend on image steps)
4. Execute and verify steps run in correct order
5. Verify: If step 1 fails, dependent steps are skipped

### 14.4 Model Switching
1. Change director model via dropdown
2. Start a new conversation
3. Verify: New model is used for responses
4. Verify: Model knowledge and capabilities are preserved

### 14.5 Error Handling
1. Test with insufficient credits
2. Test with invalid model in plan
3. Test network disconnection during streaming
4. Verify: Appropriate error messages are shown
5. Verify: Credits are refunded on failure

### 14.6 Feedback Tracking
1. Execute a plan with multiple models
2. Query `model_feedback` table - verify records created
3. Verify `useCase` is correctly detected from plan title
4. Complete execution - verify `success` is updated to 1
5. Fail an execution - verify `success` is updated to 0
6. Start new conversation after multiple executions
7. Verify: System prompt includes user preference trends
8. Verify: Failing models show warning in system prompt

### 14.7 SOTA Knowledge Integration
1. Ask AI Director about best model for motion control
2. Verify: AI recommends Kling 2.6 Pro (from SOTA guide)
3. Ask about budget video options
4. Verify: AI mentions Seedance 1.5 Pro at $1.56/min
5. Ask about UGC content with audio
6. Verify: AI recommends Wan 2.6 or Veo 3.1 for native audio

---

## Appendix A: File Structure

```
omnihub/
├── backend/
│   ├── services/
│   │   ├── aiDirector.js           # AI Director class (chat, planning, execution, feedback)
│   │   ├── modelKnowledge.js       # Dynamic model knowledge builder
│   │   ├── modelSOTAKnowledge.js   # SOTA recommendations + leaderboard rankings
│   │   └── urlAnalyzer.js          # URL content analyzer
│   ├── data/
│   │   ├── platformKnowledge.md    # Platform documentation
│   │   └── sotaModelGuide.md       # Comprehensive SOTA model guide (NEW)
│   ├── migrations/
│   │   └── schema.js               # Database migrations
│   ├── .env                        # API keys (create manually)
│   └── index.js                    # API routes + model_feedback table (10,000+ lines)
│
├── frontend/
│   └── src/
│       ├── components/
│       │   ├── director/
│       │   │   ├── FloatingAssistant.jsx  # AI Director sliding panel
│       │   │   └── index.js               # Component export
│       │   └── layout/
│       │       ├── AppLayout.jsx          # Main app layout
│       │       └── Sidebar.jsx            # Sidebar with Website Builder link
│       └── pages/
│           ├── OmniHub.jsx         # Main generation gallery
│           └── WebsiteBuilder.jsx  # AI Website Builder (1600+ lines)
│
├── frontend-next/                  # Alternative Next.js frontend
│   └── src/
│       ├── app/dashboard/
│       │   └── website-builder/    # Website Builder route
│       └── components/
│           └── layout/
│               └── Sidebar.tsx     # Sidebar with Website Builder link
│
└── AI_CREATIVE_DIRECTOR_SPEC.md    # This document
```

---

## Appendix B: Environment Variables

```bash
# Required for AI Director
OPENROUTER_API_KEY=sk-or-...     # OpenRouter API key for LLM
FAL_KEY=...                       # Fal.ai API key for generations

# Optional
AI_DIRECTOR_MODEL=anthropic/claude-sonnet-4.5  # Default director model
AI_DIRECTOR_MAX_TOKENS=4000                     # Max response tokens
```

---

## Appendix C: Maintenance Notes

### Updating SOTA Knowledge
The `modelSOTAKnowledge.js` file should be updated when:
1. New major models are released (e.g., new Kling version, new Flux model)
2. Benchmark results show capability changes
3. New use cases emerge that need specific recommendations

### Adding New Director Models
1. Add model to `aiDirectorModelOptions` in settings
2. Ensure model is available in OpenRouter
3. Test vision capabilities if applicable
4. Update documentation

### Monitoring
- Track director conversation lengths and completion rates
- Monitor execution success/failure rates
- Track most requested use cases for SOTA improvement
- Monitor credit usage patterns

---

# Part 2: AI Website Builder

---

## 13. Website Builder Overview

The AI Website Builder is a conversational AI-powered tool that generates complete, functional React/Tailwind websites from natural language descriptions. It features live preview, code editing, and export capabilities.

### Key Features
- **Conversational Generation**: Describe what you want, AI generates the code
- **Multiple AI Models**: Claude Sonnet 4.5, Kimi K2.5 (via direct Moonshot API)
- **Live Preview**: Real-time website preview in sandboxed iframe
- **Code Editor**: View and edit generated code
- **Project History**: Save and load previous projects
- **Export**: Download as ZIP with all files

### User Flow
1. User describes desired website ("Create a landing page for a SaaS product")
2. AI generates React/JSX code with Tailwind CSS
3. Live preview renders in real-time
4. User can iterate with follow-up prompts
5. Export final website as downloadable ZIP

---

## 14. Website Builder Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           FRONTEND                                       │
│  ┌────────────────────────────────────────────────────────────────────┐ │
│  │                    WebsiteBuilder Component                         │ │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────────┐ │ │
│  │  │ Chat Panel   │  │ Code Editor  │  │     Live Preview         │ │ │
│  │  │              │  │              │  │                          │ │ │
│  │  │ - Messages   │  │ - File Tree  │  │ - Sandboxed iframe       │ │ │
│  │  │ - Streaming  │  │ - Syntax HL  │  │ - Babel transform        │ │ │
│  │  │ - Model Sel  │  │ - Edit Code  │  │ - Inline SVG Icons       │ │ │
│  │  └──────────────┘  └──────────────┘  └──────────────────────────┘ │ │
│  └────────────────────────────────────────────────────────────────────┘ │
│                              │ SSE Stream                               │
└──────────────────────────────┼──────────────────────────────────────────┘
                               ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                           BACKEND                                        │
│  ┌────────────────────────────────────────────────────────────────────┐ │
│  │              Website Builder API Endpoints                          │ │
│  │  ┌──────────────────────┐  ┌──────────────────────────────────────┐│ │
│  │  │   /projects          │  │   /projects/:id/generate             ││ │
│  │  │   (CRUD operations)  │  │   (SSE streaming generation)         ││ │
│  │  └──────────────────────┘  └──────────────────────────────────────┘│ │
│  └────────────────────────────────────────────────────────────────────┘ │
│                              │                                          │
│  ┌───────────────────────────▼────────────────────────────────────────┐ │
│  │                    AI Provider Routing                              │ │
│  │  ┌──────────────────────────┐  ┌──────────────────────────────────┐│ │
│  │  │      OpenRouter API      │  │      Moonshot API (Kimi K2.5)    ││ │
│  │  │  (Claude, other models)  │  │    (Direct API for full caps)    ││ │
│  │  └──────────────────────────┘  └──────────────────────────────────┘│ │
│  └────────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 15. Website Builder Database Schema

### 15.1 Website Builder Projects Table

```sql
CREATE TABLE IF NOT EXISTS website_builder_projects (
    id TEXT PRIMARY KEY,
    userId TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    files TEXT DEFAULT '[]',           -- JSON array of file objects
    messages TEXT DEFAULT '[]',        -- JSON array of chat messages
    settings TEXT DEFAULT '{}',        -- JSON project settings
    createdAt TEXT,
    updatedAt TEXT,
    FOREIGN KEY (userId) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_website_projects_userId 
    ON website_builder_projects(userId);
```

### 15.2 File Object Structure

```javascript
{
  path: 'src/App.jsx',           // File path in project
  content: '// React code...',   // File content
  language: 'jsx',               // Syntax highlighting language
  updatedAt: '2026-01-27T...'    // Last modified timestamp
}
```

### 15.3 Message Object Structure

```javascript
{
  role: 'user' | 'assistant',
  content: string,
  timestamp: string  // ISO date string
}
```

---

## 16. Website Builder API Endpoints

### 16.1 Get Available Models

```
GET /api/website-builder/models
Headers: Authorization: Bearer <token>

Response:
{
  "models": [
    {
      "id": "anthropic/claude-sonnet-4",
      "name": "Claude Sonnet 4",
      "description": "Fast and intelligent",
      "provider": "openrouter"
    },
    {
      "id": "moonshotai/kimi-k2.5",
      "name": "Kimi K2.5",
      "description": "Advanced multimodal with tool calling",
      "provider": "moonshot",
      "capabilities": {
        "toolCalling": true,
        "videoUnderstanding": true
      }
    }
  ]
}
```

### 16.2 Create Project

```
POST /api/website-builder/projects
Headers: Authorization: Bearer <token>
Content-Type: application/json

Request Body:
{
  "name": "My Landing Page",
  "description": "SaaS landing page with pricing"
}

Response:
{
  "id": "uuid",
  "name": "My Landing Page",
  "files": [],
  "messages": [],
  "createdAt": "2026-01-27T..."
}
```

### 16.3 Generate Code (SSE Streaming)

```
POST /api/website-builder/projects/:id/generate
Headers: Authorization: Bearer <token>
Content-Type: application/json

Request Body:
{
  "prompt": "Create a modern landing page with hero section and pricing",
  "modelId": "anthropic/claude-sonnet-4"
}

Response: Server-Sent Events stream
Events:
  data: {"type":"start"}
  data: {"type":"content","content":"import React..."}
  data: {"type":"content","content":"from 'react';\n"}
  data: {"type":"file","path":"src/App.jsx","content":"...full content..."}
  data: {"type":"done"}
  data: {"type":"error","message":"Error description"}
```

### 16.4 Get Project

```
GET /api/website-builder/projects/:id
Headers: Authorization: Bearer <token>

Response:
{
  "id": "uuid",
  "name": "My Landing Page",
  "files": [
    { "path": "src/App.jsx", "content": "...", "language": "jsx" }
  ],
  "messages": [...],
  "createdAt": "...",
  "updatedAt": "..."
}
```

### 16.5 List Projects

```
GET /api/website-builder/projects
Headers: Authorization: Bearer <token>

Response:
[
  {
    "id": "uuid",
    "name": "My Landing Page",
    "createdAt": "...",
    "updatedAt": "..."
  }
]
```

### 16.6 Update Project Files

```
PUT /api/website-builder/projects/:id/files
Headers: Authorization: Bearer <token>
Content-Type: application/json

Request Body:
{
  "files": [
    { "path": "src/App.jsx", "content": "...updated content..." }
  ]
}

Response:
{ "success": true }
```

### 16.7 Delete Project

```
DELETE /api/website-builder/projects/:id
Headers: Authorization: Bearer <token>

Response:
{ "success": true }
```

---

## 17. Website Builder Frontend Implementation

### 17.1 Component Structure

File: `frontend/src/pages/WebsiteBuilder.jsx`

```jsx
export default function WebsiteBuilder() {
  // ============================================================
  // STATE MANAGEMENT
  // ============================================================
  
  // Project state
  const [currentProject, setCurrentProject] = useState(null);
  const [projects, setProjects] = useState([]);
  const [files, setFiles] = useState([]);
  const [selectedFile, setSelectedFile] = useState(null);
  
  // Chat state
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [streamingMessage, setStreamingMessage] = useState('');
  
  // Preview state
  const [previewReady, setPreviewReady] = useState(false);
  const [buildPhase, setBuildPhase] = useState('');
  
  // Model selection
  const [availableModels, setAvailableModels] = useState([]);
  const [selectedModel, setSelectedModel] = useState(null);
  
  // ============================================================
  // KEY FUNCTIONS
  // ============================================================
  
  // Generate website from prompt
  const handleGenerate = async () => { /* SSE streaming */ };
  
  // Generate preview HTML with embedded libraries
  const generatePreviewHtml = () => { /* Returns complete HTML */ };
  
  // Export project as ZIP
  const handleExport = async () => { /* Creates ZIP download */ };
  
  // Load project from history
  const loadProject = async (id) => {
    // Reset generation state first
    setIsGenerating(false);
    setBuildPhase('');
    setStreamingMessage('');
    // Then load project data
    const res = await axios.get(`${API_BASE}/website-builder/projects/${id}`);
    setCurrentProject(res.data);
    setFiles(res.data.files || []);
    // ...
  };
  
  // ============================================================
  // RENDER - Three-column layout
  // ============================================================
  return (
    <div className="flex h-screen">
      {/* Left: Chat Panel */}
      <div className="w-1/4">
        <ChatPanel />
      </div>
      
      {/* Middle: Code Editor */}
      <div className="w-1/4">
        <FileTree />
        <CodeEditor />
      </div>
      
      {/* Right: Live Preview */}
      <div className="w-1/2">
        <PreviewIframe />
      </div>
    </div>
  );
}
```

### 17.2 Loading Animation

Professional loading animation during generation:

```jsx
{isGenerating && !previewReady && (
  <div className="absolute inset-0 bg-[#0a0a0f] flex flex-col items-center justify-center z-20">
    <div className="relative">
      {/* Animated rings */}
      <div className="w-24 h-24 rounded-full border-2 border-cyan-500/20 
                      animate-[ping_2s_ease-in-out_infinite]" />
      <div className="absolute inset-0 w-24 h-24 rounded-full border-2 
                      border-cyan-400/40 animate-spin" 
           style={{ animationDuration: '3s' }} />
      
      {/* Center icon */}
      <div className="absolute inset-0 flex items-center justify-center">
        <Code className="w-8 h-8 text-cyan-400 animate-pulse" />
      </div>
    </div>
    
    {/* Build phase text */}
    <div className="mt-8 text-center">
      <p className="text-lg font-medium text-white mb-2">
        {buildPhase || 'Preparing your website...'}
      </p>
      <TypewriterText texts={[
        'Analyzing requirements...',
        'Designing components...',
        'Writing React code...',
        'Styling with Tailwind...'
      ]} />
    </div>
  </div>
)}
```

---

## 18. Website Builder Model Integration

### 18.1 Model Configuration

```javascript
// In backend/index.js - FAL_MODELS.websiteBuilder
FAL_MODELS.websiteBuilder = [
  {
    id: 'anthropic/claude-sonnet-4',
    name: 'Claude Sonnet 4',
    description: 'Fast and intelligent code generation',
    provider: 'openrouter'
  },
  {
    id: 'moonshotai/kimi-k2.5',
    name: 'Kimi K2.5',
    description: 'Advanced multimodal with tool calling',
    provider: 'moonshot',           // Uses direct Moonshot API
    apiEndpoint: 'https://api.moonshot.cn/v1/chat/completions',
    moonshotModel: 'kimi-k2.5-0125',
    capabilities: {
      toolCalling: true,
      videoUnderstanding: true
    }
  }
];
```

### 18.2 Provider Routing Logic

```javascript
// In /api/website-builder/projects/:id/generate
if (model.provider === 'moonshot') {
  // Use direct Moonshot API
  const moonshotKey = getSetting('moonshotApiKey');
  if (!moonshotKey) {
    return res.status(500).json({ error: 'Moonshot API key not configured' });
  }
  
  response = await axios.post(model.apiEndpoint, {
    model: model.moonshotModel,
    messages: [
      { role: 'system', content: buildWebsiteBuilderSystemPrompt() },
      ...existingMessages,
      { role: 'user', content: prompt }
    ],
    stream: true
  }, {
    headers: {
      'Authorization': `Bearer ${moonshotKey}`,
      'Content-Type': 'application/json'
    },
    responseType: 'stream'
  });
} else {
  // Use OpenRouter for other models
  response = await axios.post('https://openrouter.ai/api/v1/chat/completions', {
    model: modelId,
    messages: [...],
    stream: true
  }, {
    headers: { 'Authorization': `Bearer ${openrouterKey}` },
    responseType: 'stream'
  });
}
```

### 18.3 System Prompt for Website Builder

```javascript
function buildWebsiteBuilderSystemPrompt() {
  return `You are an expert React/Tailwind developer. Generate complete, working code.

## AVAILABLE LIBRARIES & ICONS
- React hooks: useState, useEffect, useRef, useMemo, useCallback
- Tailwind CSS: All utility classes available
- Icons: 80+ Lucide icons available as React components:
  Menu, X, Check, Star, Heart, Home, User, Mail, Phone, Search,
  ChevronDown, ChevronRight, ArrowRight, Plus, Minus, Edit, Trash,
  BarChart3, PieChart, TrendingUp, Zap, Shield, Lock, Unlock,
  Globe, MapPin, Calendar, Clock, Bell, Settings, LogOut, Eye,
  Code, Terminal, Database, Cloud, Download, Upload, Share, Link,
  Image, Video, Music, File, Folder, Copy, Clipboard, Save,
  Sparkles, Wand2, Palette, Layers, Grid, List, Filter, Sort,
  Play, Pause, SkipForward, SkipBack, Volume2, VolumeX, Mic,
  Camera, Leaf, TreePine, Building, Building2, Lightbulb, Target,
  Award, Trophy, Gift, ShoppingCart, CreditCard, DollarSign, Percent
  
## OUTPUT FORMAT
Return ONLY the App.jsx code. No explanations. Start with imports.

## REQUIREMENTS
- Use functional components with hooks
- Use Tailwind CSS for all styling
- Make it responsive (mobile-first)
- Include smooth animations where appropriate
- Ensure accessibility (semantic HTML, ARIA labels)`;
}
```

---

## 19. Preview System & Icon Library

### 19.1 Inline SVG Icon System

The preview uses a custom inline SVG icon factory instead of the Lucide CDN to avoid conflicts with AI-generated component names:

```javascript
// In generatePreviewHtml() - Icon factory pattern
const createIcon = (pathData) => {
  return ({ className = '', size = 24, ...props }) => {
    return React.createElement('svg', {
      xmlns: 'http://www.w3.org/2000/svg',
      width: size,
      height: size,
      viewBox: '0 0 24 24',
      fill: 'none',
      stroke: 'currentColor',
      strokeWidth: 2,
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
      className: className,
      ...props
    }, React.createElement('g', { 
      dangerouslySetInnerHTML: { __html: pathData } 
    }));
  };
};

// Icons assigned to window object to avoid naming conflicts
window.Menu = createIcon('<line x1="4" x2="20" y1="12" y2="12"/><line x1="4" x2="20" y1="6" y2="6"/><line x1="4" x2="20" y1="18" y2="18"/>');
window.X = createIcon('<path d="M18 6 6 18"/><path d="m6 6 12 12"/>');
window.Check = createIcon('<path d="M20 6 9 17l-5-5"/>');
// ... 80+ more icons
```

**Why window assignment?**
- AI-generated code may declare `function Menu() {...}` for navigation
- Using `const Menu = createIcon(...)` would cause "Identifier already declared" error
- `window.Menu = createIcon(...)` allows AI code to override if needed

### 19.2 Preview HTML Structure

```javascript
const generatePreviewHtml = () => {
  const appFile = files.find(f => f.path === 'src/App.jsx');
  if (!appFile) return '';
  
  return `<!DOCTYPE html>
<html>
<head>
  <script src="https://unpkg.com/react@18/umd/react.development.js"></script>
  <script src="https://unpkg.com/react-dom@18/umd/react-dom.development.js"></script>
  <script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>
  <script src="https://cdn.tailwindcss.com"></script>
</head>
<body>
  <div id="root"></div>
  
  <script>
    // Icon factory and icon definitions
    ${iconFactoryCode}
    
    // Expose React hooks globally
    const { useState, useEffect, useRef, useMemo, useCallback, Fragment } = React;
  </script>
  
  <script type="text/babel">
    // Error boundary for graceful error handling
    class ErrorBoundary extends React.Component {
      state = { hasError: false, error: null };
      static getDerivedStateFromError(error) {
        return { hasError: true, error };
      }
      render() {
        if (this.state.hasError) {
          return <div className="p-8 bg-red-50 text-red-600">
            <h2>Something went wrong</h2>
            <pre>{this.state.error?.message}</pre>
          </div>;
        }
        return this.props.children;
      }
    }
    
    // AI-generated App component
    ${appFile.content}
    
    // Render with error boundary
    const root = ReactDOM.createRoot(document.getElementById('root'));
    root.render(
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    );
  </script>
</body>
</html>`;
};
```

---

## 20. Website Builder Testing Scenarios

### 20.1 Basic Generation Flow
1. Navigate to Website Builder
2. Click "New Project" or start typing
3. Enter: "Create a modern landing page for a coffee shop"
4. Verify: Loading animation shows with phase text
5. Verify: Code appears in editor
6. Verify: Live preview renders correctly
7. Verify: Icons display properly

### 20.2 Model Switching
1. Select "Claude Sonnet 4" from model dropdown
2. Generate a website
3. Switch to "Kimi K2.5"
4. Generate another version
5. Verify: Both use appropriate API endpoints
6. Verify: Moonshot API key is validated for Kimi

### 20.3 Iteration Flow
1. Generate initial website
2. Enter follow-up: "Add a pricing section with 3 tiers"
3. Verify: AI modifies existing code
4. Verify: Preview updates with new section
5. Verify: Conversation history maintained

### 20.4 Project History
1. Generate a website
2. Click project name to rename
3. Start a new project
4. Verify: Previous project appears in sidebar
5. Click to load old project
6. Verify: Files and preview load correctly
7. Verify: No "Writing code" status on loaded projects

### 20.5 Export Functionality
1. Generate a complete website
2. Click "Export" button
3. Verify: ZIP file downloads
4. Extract ZIP and verify contents:
   - `src/App.jsx`
   - `package.json`
   - `index.html`
   - `README.md`

### 20.6 Error Handling
1. Test with invalid API key
2. Test with network disconnection
3. Verify: Appropriate error messages shown
4. Verify: UI recovers gracefully
5. Verify: Error boundary catches render errors

### 20.7 Icon Rendering
1. Request: "Create a features section with technology icons"
2. Verify: Icons render as SVGs
3. Verify: No "X is not defined" errors
4. Verify: AI can create custom `function Menu()` without conflicts

---

## Appendix D: Environment Variables (Updated)

```bash
# Required for AI Director & Website Builder
OPENROUTER_API_KEY=sk-or-...     # OpenRouter API key for LLM
FAL_KEY=...                       # Fal.ai API key for generations

# Required for Kimi K2.5 in Website Builder
MOONSHOT_API_KEY=...              # Moonshot API key for Kimi K2.5

# Optional
AI_DIRECTOR_MODEL=anthropic/claude-sonnet-4.5  # Default director model
AI_DIRECTOR_MAX_TOKENS=4000                     # Max response tokens
```

---

## Appendix E: Updated File Structure

```
omnihub/
├── backend/
│   ├── services/
│   │   ├── aiDirector.js           # AI Director class
│   │   ├── modelKnowledge.js       # Model knowledge builder
│   │   ├── modelSOTAKnowledge.js   # SOTA recommendations
│   │   └── urlAnalyzer.js          # URL content analyzer
│   ├── data/
│   │   └── platformKnowledge.md    # Platform documentation
│   ├── .env                        # API keys (create this)
│   └── index.js                    # API routes
│
├── frontend/
│   └── src/
│       ├── components/
│       │   └── director/
│       │       ├── FloatingAssistant.jsx  # AI Director UI
│       │       └── index.js               # Export
│       └── pages/
│           ├── OmniHub.jsx         # Main generation page
│           └── WebsiteBuilder.jsx  # Website builder page
│
├── frontend-next/                  # Next.js alternative frontend
│   └── src/app/dashboard/
│       └── website-builder/        # Website builder route
│
├── AI_CREATIVE_DIRECTOR_SPEC.md    # This document
└── README.md                       # Project overview
```
