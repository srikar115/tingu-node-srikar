/**
 * SOTA (State-of-the-Art) Model Knowledge Service
 * 
 * This provides expert-level knowledge about which models excel at specific tasks.
 * The AI Director uses this information to make intelligent model recommendations.
 * 
 * Data Sources:
 * - Artificial Analysis Leaderboards (https://artificialanalysis.ai)
 * - Field-tested observations from production usage
 * 
 * MAINTENANCE: Update this file when new models are released or capabilities change.
 * Last Updated: January 2026
 */

const fs = require('fs');
const path = require('path');

// ============================================================
// LEADERBOARD RANKINGS (January 2026)
// Source: https://artificialanalysis.ai
// ============================================================
const LEADERBOARD_RANKINGS = {
  textToVideo: [
    { model: 'grok-imagine-video', elo: 1248, provider: 'xAI', price: 4.20 },
    { model: 'runway-gen-4.5', elo: 1236, provider: 'Runway', price: null },
    { model: 'kling-2.5-turbo-1080p', elo: 1227, provider: 'KlingAI', price: 4.20 },
    { model: 'veo-3.1-fast', elo: 1226, provider: 'Google', price: 9.00 },
    { model: 'veo-3.1', elo: 1224, provider: 'Google', price: 12.00 },
    { model: 'veo-3', elo: 1224, provider: 'Google', price: 12.00 },
    { model: 'kling-2.6-pro', elo: 1215, provider: 'KlingAI', price: 4.20 },
    { model: 'kling-o1-pro', elo: 1213, provider: 'KlingAI', price: 10.08 },
    { model: 'sora-2-pro', elo: 1210, provider: 'OpenAI', price: 30.00 },
    { model: 'ray-3', elo: 1209, provider: 'Luma Labs', price: 13.20 },
    { model: 'seedance-1.5-pro', elo: 1189, provider: 'ByteDance', price: 1.56 },
    { model: 'hailuo-02-standard', elo: 1187, provider: 'MiniMax', price: 2.80 },
    { model: 'hailuo-2.3', elo: 1185, provider: 'MiniMax', price: 2.80 },
    { model: 'wan-2.6', elo: 1184, provider: 'Alibaba', price: 9.00 },
    { model: 'ltx-2-pro', elo: 1141, provider: 'Lightricks', price: 3.60 },
    { model: 'ltx-2-fast', elo: 1130, provider: 'Lightricks', price: 2.40 },
  ],
  imageToVideo: [
    { model: 'grok-imagine-video', elo: 1334, provider: 'xAI', price: 4.20 },
    { model: 'kling-2.5-turbo-1080p', elo: 1304, provider: 'KlingAI', price: 4.20 },
    { model: 'veo-3.1-fast', elo: 1301, provider: 'Google', price: 9.00 },
    { model: 'veo-3.1', elo: 1297, provider: 'Google', price: 12.00 },
    { model: 'pixverse-v5.5', elo: 1280, provider: 'PixVerse', price: 6.40 },
    { model: 'kling-2.6-pro', elo: 1268, provider: 'KlingAI', price: 4.20 },
    { model: 'hailuo-02-pro', elo: 1261, provider: 'MiniMax', price: 4.90 },
    { model: 'hailuo-2.3', elo: 1259, provider: 'MiniMax', price: 2.80 },
    { model: 'seedance-1.5-pro', elo: 1258, provider: 'ByteDance', price: 1.56 },
    { model: 'hailuo-2.3-fast', elo: 1255, provider: 'MiniMax', price: 1.00 },
    { model: 'wan-2.6', elo: 1219, provider: 'Alibaba', price: 9.00 },
    { model: 'ltx-2-pro', elo: 1202, provider: 'Lightricks', price: 3.60 },
  ]
};

// ============================================================
// EXPERT RECOMMENDATIONS (Field-Tested)
// ============================================================
const EXPERT_RECOMMENDATIONS = {
  motionControl: {
    winner: 'kling-2.6-pro',
    winnerName: 'Kling 2.6 Pro',
    reason: 'Best camera movements - orbit, pan, zoom, tilt, tracking shots. Precise trajectory control.',
    alternatives: ['kling-2.5-turbo', 'runway-gen3-turbo'],
    useCases: ['product showcases', '360 views', 'camera orbits', 'cinematic movement']
  },
  premiumQuality: {
    winner: 'veo-3.1',
    winnerName: 'Veo 3.1',
    reason: 'Cinematic quality with native audio generation. Excellent coherence and production value.',
    alternatives: ['sora-2', 'kling-2.6-pro'],
    useCases: ['commercial content', 'final deliverables', 'hero assets']
  },
  ugcContent: {
    winner: 'wan-2.6',
    winnerName: 'Wan 2.6',
    reason: 'Excellent for talking heads, natural human movement, native audio support.',
    alternatives: ['kling-2.6-pro', 'veo-3.1'],
    useCases: ['influencer content', 'testimonials', 'talking head videos']
  },
  budgetQuality: {
    winner: 'seedance-1.5-pro',
    winnerName: 'Seedance 1.5 Pro',
    reason: 'Best quality-to-cost ratio at $1.56/min. ByteDance model with surprising quality.',
    alternatives: ['hailuo-2.3-fast', 'ltx-2-fast'],
    useCases: ['testing concepts', 'budget projects', 'high volume']
  },
  fastIteration: {
    winner: 'ltx-2-fast',
    winnerName: 'LTX-2 Fast',
    reason: 'Seconds to generate. Open weights from Lightricks. Perfect for rapid testing.',
    alternatives: ['wan-2.1-turbo', 'hailuo-2.3-fast'],
    useCases: ['prototyping', 'concept validation', 'quick iterations']
  },
  longDuration: {
    winner: 'kling-2.6-pro',
    winnerName: 'Kling 2.6 Pro',
    reason: 'Supports 5 or 10 second generation with coherent motion throughout.',
    alternatives: ['sora-2', 'minimax-video'],
    useCases: ['extended scenes', 'storytelling', 'longer narratives']
  },
  characterImage: {
    winner: 'nano-banana-pro',
    winnerName: 'Nano Banana Pro',
    reason: 'Best character consistency and face preservation. Supports up to 14 reference images.',
    alternatives: ['flux-1.1-pro', 'gpt-image-1.5'],
    useCases: ['UGC content', 'avatars', 'consistent characters']
  },
  textRendering: {
    winner: 'ideogram-v3',
    winnerName: 'Ideogram V3',
    reason: 'Near-perfect text accuracy in images. Best for logos and typography.',
    alternatives: ['ideogram-v2-turbo', 'flux-1.1-pro'],
    useCases: ['logos', 'signage', 'text overlays']
  },
  photorealism: {
    winner: 'flux-1.1-pro-ultra',
    winnerName: 'FLUX 1.1 Pro Ultra',
    reason: 'Highest photorealistic quality for product photography and real-world scenes.',
    alternatives: ['flux-1.1-pro', 'imagen-3'],
    useCases: ['product shots', 'stock photography', 'commercial imagery']
  }
};

// ============================================================
// IMAGE GENERATION - SOTA Rankings by Use Case
// ============================================================
const SOTA_MODEL_KNOWLEDGE = {
  imageGeneration: {
    textRendering: {
      sota: ['ideogram-v3', 'ideogram-v2-turbo', 'ideogram-v2'],
      reason: 'Ideogram models have best-in-class text rendering accuracy for logos, signage, and readable text',
      fallback: ['flux-1.1-pro', 'imagen-3', 'gpt-image-1.5'],
      tips: 'Use when logos, text overlays, or readable text is needed in images',
      quality: 'premium',
      eloRank: 1
    },
    photorealism: {
      sota: ['flux-1.1-pro-ultra', 'imagen-3', 'flux-realism', 'flux-1.1-pro'],
      reason: 'Highest photorealistic quality for product photography, portraits, and real-world scenes',
      fallback: ['flux-dev', 'stable-diffusion-3'],
      tips: 'Best for product shots, portraits, stock photography style',
      quality: 'premium',
      eloRank: 1
    },
    characterConsistency: {
      sota: ['nano-banana-pro', 'flux-pulid', 'flux-1.1-pro'],
      reason: 'Best for maintaining consistent character faces across multiple generations. Nano Banana supports up to 14 reference images.',
      fallback: ['flux-dev', 'stable-diffusion-3'],
      tips: 'Essential for UGC content, character-based campaigns, avatar creation',
      quality: 'balanced'
    },
    productPhotography: {
      sota: ['flux-1.1-pro', 'imagen-3', 'ideogram-v3', 'gpt-image-1.5'],
      reason: 'Clean backgrounds, professional lighting, commercial-grade quality',
      fallback: ['flux-dev', 'stable-diffusion-3'],
      tips: 'Use for e-commerce, catalogs, product marketing materials',
      quality: 'balanced'
    },
    artisticStyles: {
      sota: ['flux-dev', 'stable-diffusion-3', 'flux-1.1-pro'],
      reason: 'Best creative interpretation and artistic style rendering',
      fallback: ['flux-schnell', 'sdxl'],
      tips: 'Use for creative artwork, illustrations, stylized content',
      quality: 'balanced'
    },
    speed: {
      sota: ['flux-schnell', 'sdxl-lightning', 'hyper-sdxl'],
      reason: 'Sub-second generation for rapid iteration and prototyping',
      fallback: ['flux-dev'],
      tips: 'Use for testing concepts, quick iterations, cost-sensitive projects',
      quality: 'budget'
    },
    upscaling: {
      sota: ['clarity-upscaler', 'aura-sr', 'creative-upscaler'],
      reason: 'Best quality enhancement and resolution increase with detail preservation',
      fallback: ['real-esrgan'],
      tips: 'Use to enhance low-res images or add fine details',
      quality: 'balanced'
    },
    inpainting: {
      sota: ['flux-fill', 'flux-inpaint', 'stable-diffusion-3-inpaint'],
      reason: 'Seamless object removal and replacement within images',
      fallback: ['sdxl-inpaint'],
      tips: 'Use for editing specific regions while preserving the rest',
      quality: 'balanced'
    },
    backgrounds: {
      sota: ['bria-rmbg', 'birefnet', 'flux-1.1-pro'],
      reason: 'Clean background removal and replacement',
      fallback: ['rembg'],
      tips: 'Use for product shots on custom backgrounds, portrait isolation',
      quality: 'budget'
    }
  },

  // ============================================================
  // VIDEO GENERATION - SOTA Rankings by Use Case
  // ============================================================
  videoGeneration: {
    motionControl: {
      sota: ['kling-2.6-pro', 'kling-2.5-turbo', 'runway-gen3-turbo'],
      reason: 'Precise camera movement control (orbit, pan, zoom, tilt) and motion trajectories. Kling 2.6 Pro is field-tested best.',
      fallback: ['kling-1.6-pro', 'minimax-video'],
      tips: 'Use when specific camera movements are essential to the content',
      quality: 'premium',
      eloRank: { t2v: 7, i2v: 8 }
    },
    multiAngleShots: {
      sota: ['kling-2.6-pro', 'veo-3.1'],
      reason: 'Best for generating consistent multi-angle views of the same subject',
      fallback: ['sora-2', 'runway-gen3-alpha'],
      tips: 'Use for product showcases, character turnarounds, 360 views',
      quality: 'premium'
    },
    verticalVideo: {
      sota: ['veo-3.1', 'kling-2.6-pro', 'minimax-video'],
      reason: 'Native support for 9:16 vertical video generation optimized for mobile',
      fallback: ['runway-gen3'],
      tips: 'Essential for TikTok, Instagram Reels, YouTube Shorts content',
      quality: 'premium'
    },
    audioGeneration: {
      sota: ['veo-3.1', 'wan-2.6'],
      reason: 'Built-in synchronized audio/sound generation with video content. Veo 3.1 and Wan 2.6 have native audio.',
      fallback: ['kling-2.6-pro'],
      tips: 'Use when video needs matching sound effects or ambient audio',
      quality: 'premium'
    },
    longDuration: {
      sota: ['kling-2.6-pro', 'sora-2', 'minimax-video-01'],
      reason: 'Support for 10+ second video generation with coherent motion. Kling supports 5-10s, Sora up to 20s.',
      fallback: ['runway-gen3-turbo'],
      tips: 'Use for extended scenes, storytelling, longer narratives',
      quality: 'premium'
    },
    imageToVideo: {
      sota: ['kling-2.6-pro', 'veo-3.1', 'grok-imagine-video'],
      reason: 'Best animation quality from still images with natural motion. grok-imagine leads I2V leaderboard.',
      fallback: ['minimax-video', 'stable-video-diffusion'],
      tips: 'Use to bring product shots, portraits, or scenes to life',
      quality: 'premium',
      eloRank: { grok: 1334, kling: 1268, veo: 1297 }
    },
    characterAnimation: {
      sota: ['wan-2.6', 'kling-2.6-pro', 'veo-3.1'],
      reason: 'Natural human movement, facial expressions, and body language. Wan 2.6 excellent for UGC.',
      fallback: ['minimax-video', 'ltx-video'],
      tips: 'Best for UGC-style content with realistic people',
      quality: 'premium'
    },
    fastIteration: {
      sota: ['ltx-video', 'wan-2.1-turbo', 'hailuo-2.3-fast'],
      reason: 'Quick generation (seconds) for rapid prototyping and testing. Hailuo Fast is $1/min.',
      fallback: ['runway-gen3-turbo'],
      tips: 'Use for testing concepts before committing to premium generation',
      quality: 'budget'
    },
    premiumQuality: {
      sota: ['veo-3.1', 'sora-2', 'kling-2.6-pro'],
      reason: 'Highest overall video quality, coherence, and production value. Veo 3.1 includes native audio.',
      fallback: ['runway-gen3-alpha'],
      tips: 'Use for final deliverables, commercial content, hero assets',
      quality: 'premium',
      eloRank: { veo: 1226, sora: 1210, kling: 1215 }
    },
    textToVideo: {
      sota: ['grok-imagine-video', 'veo-3.1', 'kling-2.5-turbo'],
      reason: 'Best prompt understanding and video generation from text alone. grok leads T2V leaderboard.',
      fallback: ['minimax-video', 'ltx-video'],
      tips: 'Use when you have a detailed description but no source image',
      quality: 'premium',
      eloRank: { grok: 1248, veo: 1226, kling: 1227 }
    },
    lipSync: {
      sota: ['sync-lipsync', 'latentsync'],
      reason: 'Accurate lip synchronization for talking head videos',
      fallback: [],
      tips: 'Use for AI avatars, dubbing, talking product videos',
      quality: 'balanced'
    },
    budgetVideo: {
      sota: ['seedance-1.5-pro', 'hailuo-2.3-fast', 'ltx-2-fast'],
      reason: 'Best quality-to-cost ratio. Seedance at $1.56/min, Hailuo Fast at $1/min.',
      fallback: ['wan-2.1-turbo'],
      tips: 'Use for testing, budget projects, high volume generation',
      quality: 'budget',
      pricing: { seedance: 1.56, hailuo: 1.00, ltx: 2.40 }
    }
  },

  // ============================================================
  // USE CASE RECOMMENDATIONS - Quick Reference
  // ============================================================
  useCaseRecommendations: {
    'ugc-content': {
      imageModel: 'nano-banana-pro',
      videoModel: 'veo-3.1',
      reason: 'Character consistency with Nano Banana Pro + premium cinematic motion with Veo 3.1 (includes native audio)',
      workflow: ['Generate consistent character image with Nano Banana Pro', 'Animate with Veo 3.1 for best quality motion with audio'],
      estimatedCost: '1.20-1.50 credits',
      aspectRatio: '9:16',
      preferred: true
    },
    'talking-head': {
      imageModel: 'nano-banana-pro',
      videoModel: 'wan-2.6',
      reason: 'Wan 2.6 excels at natural talking head content with native audio support',
      workflow: ['Generate character with Nano Banana Pro', 'Create talking video with Wan 2.6'],
      estimatedCost: '1.00-1.30 credits',
      aspectRatio: '9:16',
      preferred: true
    },
    'product-video': {
      imageModel: 'flux-1.1-pro',
      videoModel: 'kling-2.6-pro',
      reason: 'Clean product shots with FLUX + smooth orbit/pan animations with Kling motion control',
      workflow: ['Generate clean product image with FLUX 1.1 Pro', 'Create orbit video with Kling 2.6 Pro'],
      estimatedCost: '0.50-1.00 credits',
      aspectRatio: '1:1 or 16:9',
      preferred: true
    },
    'social-media-vertical': {
      imageModel: 'flux-1.1-pro',
      videoModel: 'veo-3.1',
      reason: 'Native vertical video support optimized for TikTok/Reels/Shorts',
      workflow: ['Generate scene in 9:16', 'Create vertical video with motion'],
      estimatedCost: '1.50-2.50 credits',
      aspectRatio: '9:16'
    },
    'logo-animation': {
      imageModel: 'ideogram-v3',
      videoModel: 'kling-2.6-pro',
      reason: 'Perfect text rendering with Ideogram + motion graphics quality from Kling',
      workflow: ['Generate logo with accurate text', 'Animate with entrance effects'],
      estimatedCost: '1.00-1.50 credits',
      aspectRatio: '1:1 or 16:9'
    },
    'cinematic-trailer': {
      imageModel: 'flux-1.1-pro-ultra',
      videoModel: 'sora-2',
      reason: 'Ultra quality images + highest quality cinematic video (expensive but best)',
      workflow: ['Generate hero scenes', 'Create dramatic video sequences'],
      estimatedCost: '3.00-5.00 credits',
      aspectRatio: '16:9 or 21:9'
    },
    'fast-prototype': {
      imageModel: 'flux-schnell',
      videoModel: 'ltx-video',
      reason: 'Speed priority for quick concept testing and iteration',
      workflow: ['Quick image generation', 'Fast video preview'],
      estimatedCost: '0.10-0.30 credits',
      aspectRatio: 'any'
    },
    'budget-video': {
      imageModel: 'flux-schnell',
      videoModel: 'seedance-1.5-pro',
      reason: 'Best quality at lowest cost. Seedance $1.56/min is excellent value.',
      workflow: ['Quick image with FLUX Schnell', 'Quality video with Seedance'],
      estimatedCost: '0.20-0.40 credits',
      aspectRatio: 'any'
    },
    'e-commerce-product': {
      imageModel: 'flux-1.1-pro',
      videoModel: 'minimax-video',
      reason: 'Clean product shots with reliable, cost-effective video',
      workflow: ['Generate white background product shot', 'Create simple animation'],
      estimatedCost: '0.50-1.00 credits',
      aspectRatio: '1:1'
    },
    'ai-avatar': {
      imageModel: 'nano-banana-pro',
      videoModel: 'veo-3.1',
      reason: 'Nano Banana Pro for consistent face generation + Veo 3.1 for natural cinematic motion with audio',
      workflow: ['Generate consistent character with Nano Banana Pro', 'Animate with Veo 3.1 for premium quality with audio'],
      estimatedCost: '1.20-1.50 credits',
      aspectRatio: '9:16 or 1:1',
      preferred: true
    },
    'before-after': {
      imageModel: 'flux-1.1-pro',
      videoModel: 'kling-2.6-pro',
      reason: 'Clean comparison shots + smooth transition video',
      workflow: ['Generate before state', 'Generate after state', 'Create transition video'],
      estimatedCost: '2.00-3.00 credits',
      aspectRatio: '1:1 or 9:16'
    },
    'text-logo': {
      imageModel: 'ideogram-v3',
      videoModel: null,
      reason: 'Best-in-class text rendering for logos and signage',
      workflow: ['Generate logo with perfect text'],
      estimatedCost: '0.10-0.20 credits',
      aspectRatio: '1:1 or custom'
    },
    'photo-enhancement': {
      imageModel: 'clarity-upscaler',
      videoModel: null,
      reason: 'Upscale and enhance low-resolution images',
      workflow: ['Upscale image to higher resolution'],
      estimatedCost: '0.05-0.15 credits',
      aspectRatio: 'preserve original'
    }
  },

  // ============================================================
  // MODEL PRICING TIERS
  // ============================================================
  pricingTiers: {
    budget: {
      imageModels: ['flux-schnell', 'sdxl-lightning', 'hyper-sdxl', 'stable-diffusion-3'],
      videoModels: ['ltx-video', 'wan-2.1-turbo', 'hailuo-2.3-fast', 'seedance-1.5-pro'],
      typicalCost: '0.01-0.20 credits',
      bestFor: 'Prototyping, testing concepts, high-volume generation',
      pricing: {
        'hailuo-2.3-fast': '$1.00/min',
        'seedance-1.5-pro': '$1.56/min',
        'ltx-2-fast': '$2.40/min'
      }
    },
    balanced: {
      imageModels: ['flux-1.1-pro', 'flux-dev', 'ideogram-v2-turbo', 'nano-banana-pro'],
      videoModels: ['minimax-video', 'kling-1.6-pro', 'runway-gen3-turbo', 'hailuo-2.3'],
      typicalCost: '0.20-0.80 credits',
      bestFor: 'Production content, social media, regular marketing',
      pricing: {
        'hailuo-2.3': '$2.80/min',
        'ltx-2-pro': '$3.60/min',
        'kling-2.6-pro': '$4.20/min'
      }
    },
    premium: {
      imageModels: ['flux-1.1-pro-ultra', 'imagen-3', 'ideogram-v3', 'gpt-image-1.5'],
      videoModels: ['sora-2', 'veo-3.1', 'kling-2.6-pro', 'grok-imagine-video'],
      typicalCost: '0.80-3.00 credits',
      bestFor: 'Commercial content, hero assets, final deliverables',
      pricing: {
        'veo-3.1-fast': '$9.00/min',
        'veo-3.1': '$12.00/min',
        'sora-2': '$6.00/min',
        'sora-2-pro': '$30.00/min'
      }
    }
  },

  // ============================================================
  // MODEL CAPABILITIES QUICK REFERENCE
  // ============================================================
  modelCapabilities: {
    'kling-2.6-pro': {
      strengths: ['motion control', 'camera movements', 'character animation', 'long duration', 'orbit shots'],
      weaknesses: ['slower generation than turbo'],
      inputTypes: ['text', 'image'],
      maxDuration: 10,
      aspectRatios: ['16:9', '9:16', '1:1'],
      durationFormat: 'string without s',
      validDurations: ['5', '10'],
      provider: 'Fal.ai',
      apiId: 'fal-kling-v2.6-pro-i2v',
      pricePerMin: 4.20,
      eloT2V: 1215,
      eloI2V: 1268
    },
    'veo-3.1': {
      strengths: ['audio generation', 'vertical video', 'premium quality', 'prompt understanding', 'native audio'],
      weaknesses: ['higher cost'],
      inputTypes: ['text', 'image'],
      maxDuration: 8,
      aspectRatios: ['16:9', '9:16', '1:1'],
      durationFormat: 'string with s suffix',
      validDurations: ['4s', '6s', '8s'],
      provider: 'Fal.ai',
      apiId: 'fal-veo3.1-i2v',
      pricePerMin: 9.00,
      eloT2V: 1226,
      eloI2V: 1301
    },
    'sora-2': {
      strengths: ['cinematic quality', 'coherent motion', 'complex scenes', 'long duration'],
      weaknesses: ['highest cost', 'slower'],
      inputTypes: ['text', 'image'],
      maxDuration: 20,
      aspectRatios: ['16:9', '9:16', '1:1'],
      durationFormat: 'string without s',
      validDurations: ['4', '8', '12'],
      provider: 'Fal.ai',
      apiId: 'fal-sora2-i2v',
      pricePerMin: 6.00,
      pricePerMinPro: 30.00,
      eloT2V: 1210
    },
    'wan-2.6': {
      strengths: ['ugc content', 'talking heads', 'native audio', 'natural movement'],
      weaknesses: ['less motion control than kling'],
      inputTypes: ['text', 'image'],
      maxDuration: 10,
      aspectRatios: ['16:9', '9:16', '1:1'],
      provider: 'Fal.ai',
      apiId: 'fal-wan-v2.6',
      pricePerMin: 9.00,
      eloT2V: 1184,
      eloI2V: 1219
    },
    'grok-imagine-video': {
      strengths: ['general quality', 'prompt understanding', 'versatile'],
      weaknesses: ['new model, less tested'],
      inputTypes: ['text', 'image'],
      provider: 'xAI',
      pricePerMin: 4.20,
      eloT2V: 1248,
      eloI2V: 1334
    },
    'ltx-2-fast': {
      strengths: ['speed', 'open weights', 'cost effective'],
      weaknesses: ['lower quality than premium'],
      inputTypes: ['text', 'image'],
      provider: 'Fal.ai',
      apiId: 'fal-ltx-video-v0.9.1',
      pricePerMin: 2.40,
      eloT2V: 1130
    },
    'seedance-1.5-pro': {
      strengths: ['excellent value', 'good quality', 'budget friendly'],
      weaknesses: ['not top tier quality'],
      inputTypes: ['text', 'image'],
      provider: 'ByteDance',
      pricePerMin: 1.56,
      eloT2V: 1189,
      eloI2V: 1258
    },
    'hailuo-2.3-fast': {
      strengths: ['cheapest option', 'fast', 'decent quality'],
      weaknesses: ['lowest tier quality'],
      inputTypes: ['text', 'image'],
      provider: 'Fal.ai',
      apiId: 'fal-minimax-video-01',
      pricePerMin: 1.00,
      eloI2V: 1255
    },
    'flux-1.1-pro': {
      strengths: ['photorealism', 'prompt adherence', 'versatility', 'commercial quality'],
      weaknesses: ['no video'],
      inputTypes: ['text'],
      aspectRatios: ['any'],
      provider: 'Fal.ai',
      apiId: 'fal-flux-1.1-pro',
      costPerImage: 0.04
    },
    'nano-banana-pro': {
      strengths: ['character consistency', 'face preservation', 'UGC style', 'multi-reference'],
      weaknesses: ['specific use case'],
      inputTypes: ['text', 'image'],
      maxInputImages: 14,
      aspectRatios: ['any'],
      provider: 'Fal.ai',
      apiId: 'fal-nano-banana-pro',
      costPerImage: 0.15
    },
    'ideogram-v3': {
      strengths: ['text rendering', 'logos', 'typography', 'signage'],
      weaknesses: ['less photorealistic'],
      inputTypes: ['text'],
      aspectRatios: ['any'],
      provider: 'Fal.ai',
      apiId: 'fal-ideogram-v3',
      costPerImage: 0.08
    }
  }
};

/**
 * Load the SOTA Model Guide markdown file
 * @returns {string} The guide content or empty string if not found
 */
function loadSOTAGuide() {
  try {
    const guidePath = path.join(__dirname, '../data/sotaModelGuide.md');
    return fs.readFileSync(guidePath, 'utf-8');
  } catch (e) {
    console.warn('[SOTA] Could not load sotaModelGuide.md:', e.message);
    return '';
  }
}

/**
 * Get SOTA recommendation for a specific task
 * @param {string} category - 'image' or 'video'
 * @param {string} task - Task name from SOTA_MODEL_KNOWLEDGE
 * @returns {Object|null} Recommendation with SOTA models and reason
 */
function getSOTARecommendation(category, task) {
  const categoryKey = category === 'image' ? 'imageGeneration' : 'videoGeneration';
  return SOTA_MODEL_KNOWLEDGE[categoryKey]?.[task] || null;
}

/**
 * Get expert recommendation for a specific need
 * @param {string} need - 'motionControl', 'premiumQuality', 'ugcContent', etc.
 * @returns {Object|null} Expert recommendation
 */
function getExpertRecommendation(need) {
  return EXPERT_RECOMMENDATIONS[need] || null;
}

/**
 * Get leaderboard ranking for a model
 * @param {string} modelId - Model identifier
 * @param {string} type - 't2v' or 'i2v'
 * @returns {Object|null} Ranking info
 */
function getLeaderboardRanking(modelId, type = 't2v') {
  const leaderboard = type === 't2v' ? LEADERBOARD_RANKINGS.textToVideo : LEADERBOARD_RANKINGS.imageToVideo;
  const normalizedId = modelId.toLowerCase().replace(/[_\s]/g, '-');
  return leaderboard.find(m => m.model.includes(normalizedId)) || null;
}

/**
 * Get use case recommendation
 * @param {string} useCase - Use case key (e.g., 'ugc-content', 'product-video')
 * @returns {Object|null} Recommendation with image/video models and workflow
 */
function getUseCaseRecommendation(useCase) {
  const normalizedKey = useCase.toLowerCase().replace(/\s+/g, '-');
  return SOTA_MODEL_KNOWLEDGE.useCaseRecommendations[normalizedKey] || null;
}

/**
 * Get models by pricing tier
 * @param {string} tier - 'budget', 'balanced', or 'premium'
 * @returns {Object|null} Image and video models for that tier
 */
function getModelsByPricingTier(tier) {
  return SOTA_MODEL_KNOWLEDGE.pricingTiers[tier.toLowerCase()] || null;
}

/**
 * Get model capabilities
 * @param {string} modelId - Model ID
 * @returns {Object|null} Model capabilities and characteristics
 */
function getModelCapabilities(modelId) {
  return SOTA_MODEL_KNOWLEDGE.modelCapabilities[modelId] || null;
}

/**
 * Find best model for a specific need
 * @param {string} category - 'image' or 'video'
 * @param {string} requirement - Primary requirement (e.g., 'speed', 'quality', 'text')
 * @returns {string|null} Best model ID for the requirement
 */
function findBestModel(category, requirement) {
  const categoryKey = category === 'image' ? 'imageGeneration' : 'videoGeneration';
  const categoryData = SOTA_MODEL_KNOWLEDGE[categoryKey];
  
  // Map common requirements to tasks
  const requirementMap = {
    'speed': 'speed',
    'fast': 'fastIteration',
    'quick': 'fastIteration',
    'quality': 'premiumQuality',
    'premium': 'premiumQuality',
    'best': 'premiumQuality',
    'text': 'textRendering',
    'logo': 'textRendering',
    'character': 'characterConsistency',
    'face': 'characterConsistency',
    'ugc': 'characterAnimation',
    'product': 'productPhotography',
    'photo': 'photorealism',
    'realistic': 'photorealism',
    'motion': 'motionControl',
    'camera': 'motionControl',
    'orbit': 'motionControl',
    'vertical': 'verticalVideo',
    'tiktok': 'verticalVideo',
    'reels': 'verticalVideo',
    'shorts': 'verticalVideo',
    'audio': 'audioGeneration',
    'sound': 'audioGeneration',
    'long': 'longDuration',
    'animate': 'imageToVideo',
    'animation': 'characterAnimation',
    'budget': 'budgetVideo',
    'cheap': 'budgetVideo'
  };
  
  const task = requirementMap[requirement.toLowerCase()];
  if (!task || !categoryData[task]) return null;
  
  return categoryData[task].sota[0];
}

/**
 * Build SOTA knowledge section for system prompt
 * @returns {string} Formatted string for LLM consumption
 */
function buildSOTAPromptSection() {
  let prompt = '\n### SOTA (State-of-the-Art) MODEL RECOMMENDATIONS\n\n';
  prompt += 'Use these models for best results in specific scenarios:\n\n';
  
  // Expert recommendations first (most actionable)
  prompt += '**EXPERT RECOMMENDATIONS (Field-Tested):**\n';
  Object.entries(EXPERT_RECOMMENDATIONS).forEach(([key, rec]) => {
    prompt += `- **${key}**: ${rec.winnerName} - ${rec.reason}\n`;
  });
  prompt += '\n';
  
  // Image recommendations
  prompt += '**IMAGE GENERATION:**\n';
  const imageGen = SOTA_MODEL_KNOWLEDGE.imageGeneration;
  prompt += `- Text/Logo Rendering: ${imageGen.textRendering.sota[0]} - ${imageGen.textRendering.reason}\n`;
  prompt += `- Photorealism: ${imageGen.photorealism.sota[0]} - ${imageGen.photorealism.reason}\n`;
  prompt += `- Character Consistency: ${imageGen.characterConsistency.sota[0]} - ${imageGen.characterConsistency.reason}\n`;
  prompt += `- Product Photography: ${imageGen.productPhotography.sota[0]} - ${imageGen.productPhotography.reason}\n`;
  prompt += `- Fast/Budget: ${imageGen.speed.sota[0]} - ${imageGen.speed.reason}\n\n`;
  
  // Video recommendations
  prompt += '**VIDEO GENERATION:**\n';
  const videoGen = SOTA_MODEL_KNOWLEDGE.videoGeneration;
  prompt += `- Motion Control: ${videoGen.motionControl.sota[0]} - ${videoGen.motionControl.reason}\n`;
  prompt += `- Vertical Video (TikTok/Reels): ${videoGen.verticalVideo.sota[0]} - ${videoGen.verticalVideo.reason}\n`;
  prompt += `- Audio in Video: ${videoGen.audioGeneration.sota[0]} - ${videoGen.audioGeneration.reason}\n`;
  prompt += `- UGC/Talking Head: ${videoGen.characterAnimation.sota[0]} - ${videoGen.characterAnimation.reason}\n`;
  prompt += `- Premium Quality: ${videoGen.premiumQuality.sota[0]} - ${videoGen.premiumQuality.reason}\n`;
  prompt += `- Fast/Budget: ${videoGen.fastIteration.sota[0]} - ${videoGen.fastIteration.reason}\n`;
  prompt += `- Budget Quality: ${videoGen.budgetVideo.sota[0]} - ${videoGen.budgetVideo.reason}\n\n`;
  
  // Pricing reference
  prompt += '**PRICING QUICK REFERENCE:**\n';
  prompt += '- Budget ($1-2/min): Seedance 1.5 Pro, Hailuo Fast, LTX-2\n';
  prompt += '- Balanced ($3-5/min): Kling 2.6 Pro, Hailuo 2.3, MiniMax\n';
  prompt += '- Premium ($9-30/min): Veo 3.1, Sora 2, Sora 2 Pro\n\n';
  
  // Use case quick reference
  prompt += '### QUICK USE CASE REFERENCE\n\n';
  Object.entries(SOTA_MODEL_KNOWLEDGE.useCaseRecommendations).forEach(([useCase, rec]) => {
    const videoNote = rec.videoModel ? `, Video: ${rec.videoModel}` : '';
    const preferred = rec.preferred ? ' [PREFERRED]' : '';
    prompt += `- **${useCase.replace(/-/g, ' ')}:** Image: ${rec.imageModel}${videoNote} (~${rec.estimatedCost})${preferred}\n`;
  });
  
  return prompt;
}

module.exports = {
  SOTA_MODEL_KNOWLEDGE,
  LEADERBOARD_RANKINGS,
  EXPERT_RECOMMENDATIONS,
  loadSOTAGuide,
  getSOTARecommendation,
  getExpertRecommendation,
  getLeaderboardRanking,
  getUseCaseRecommendation,
  getModelsByPricingTier,
  getModelCapabilities,
  findBestModel,
  buildSOTAPromptSection
};
