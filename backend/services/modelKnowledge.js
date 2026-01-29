/**
 * Model Knowledge Service
 * 
 * Dynamically builds LLM-friendly model knowledge from the database.
 * This service creates structured information about all available AI models
 * that can be injected into the AI Director's system prompt.
 */

/**
 * Build comprehensive model knowledge for the AI Director
 * @param {Object} db - Database instance
 * @returns {Object} Structured model knowledge
 */
function buildModelKnowledge(db) {
  // Get all enabled models from database
  const models = db.prepare(`
    SELECT id, name, type, category, baseCost, credits, imageInput, maxInputImages,
           tags, options, providerName, apiEndpoint, capabilities
    FROM models 
    WHERE enabled = 1
    ORDER BY type, displayOrder
  `).all();

  // Parse JSON fields
  models.forEach(m => {
    m.tags = JSON.parse(m.tags || '[]');
    m.options = JSON.parse(m.options || '{}');
    m.capabilities = JSON.parse(m.capabilities || '{}');
  });

  // Group by type
  const byType = {
    image: models.filter(m => m.type === 'image'),
    video: models.filter(m => m.type === 'video'),
    chat: models.filter(m => m.type === 'chat')
  };

  // Further categorize image models
  const imageCategories = {
    textToImage: byType.image.filter(m => m.category === 'text-to-image' || m.category === 'both'),
    imageToImage: byType.image.filter(m => m.category === 'image-to-image' || m.category === 'both'),
    upscale: byType.image.filter(m => m.category === 'upscale')
  };

  // Categorize video models
  const videoCategories = {
    textToVideo: byType.video.filter(m => m.category === 'text-to-video'),
    imageToVideo: byType.video.filter(m => m.category === 'image-to-video'),
    videoExtension: byType.video.filter(m => m.category === 'video-extension')
  };

  return {
    summary: {
      totalModels: models.length,
      imageModels: byType.image.length,
      videoModels: byType.video.length,
      chatModels: byType.chat.length
    },
    imageGeneration: imageCategories,
    videoGeneration: videoCategories,
    chatModels: byType.chat,
    allModels: models
  };
}

/**
 * Format model for LLM consumption - concise but informative
 * @param {Object} model - Model object
 * @returns {Object} Formatted model info
 */
function formatModelForLLM(model) {
  // Determine input requirements
  let inputsRequired = 'prompt only';
  if (model.imageInput === 'required') {
    inputsRequired = 'image + prompt (required)';
  } else if (model.imageInput === 'optional') {
    inputsRequired = 'prompt (image optional)';
  }

  // Get available options
  const availableOptions = Object.keys(model.options || {});

  return {
    id: model.id,
    name: model.name,
    provider: model.providerName,
    cost: model.baseCost,
    bestFor: model.tags.slice(0, 5), // Top 5 tags as use cases
    inputsRequired,
    options: availableOptions.length > 0 ? availableOptions : undefined
  };
}

/**
 * Build the system prompt knowledge section for AI Director
 * @param {Object} db - Database instance
 * @returns {string} Formatted knowledge string for system prompt
 */
function buildSystemPromptKnowledge(db) {
  const knowledge = buildModelKnowledge(db);
  
  let prompt = `## AVAILABLE AI MODELS (${knowledge.summary.totalModels} total)\n\n`;

  // Image Generation Models
  prompt += `### IMAGE GENERATION (${knowledge.summary.imageModels} models)\n\n`;
  
  if (knowledge.imageGeneration.textToImage.length > 0) {
    prompt += `**Text-to-Image:**\n`;
    knowledge.imageGeneration.textToImage.slice(0, 10).forEach(m => {
      const formatted = formatModelForLLM(m);
      prompt += `- ${formatted.name} (${formatted.id}): ${formatted.cost} credits | Best for: ${formatted.bestFor.join(', ')}\n`;
    });
    prompt += `\n`;
  }

  if (knowledge.imageGeneration.imageToImage.length > 0) {
    prompt += `**Image-to-Image / Editing:**\n`;
    knowledge.imageGeneration.imageToImage.slice(0, 8).forEach(m => {
      const formatted = formatModelForLLM(m);
      prompt += `- ${formatted.name} (${formatted.id}): ${formatted.cost} credits | ${formatted.inputsRequired}\n`;
    });
    prompt += `\n`;
  }

  if (knowledge.imageGeneration.upscale.length > 0) {
    prompt += `**Upscaling:**\n`;
    knowledge.imageGeneration.upscale.forEach(m => {
      const formatted = formatModelForLLM(m);
      prompt += `- ${formatted.name} (${formatted.id}): ${formatted.cost} credits\n`;
    });
    prompt += `\n`;
  }

  // Video Generation Models
  prompt += `### VIDEO GENERATION (${knowledge.summary.videoModels} models)\n\n`;
  
  if (knowledge.videoGeneration.textToVideo.length > 0) {
    prompt += `**Text-to-Video:**\n`;
    knowledge.videoGeneration.textToVideo.slice(0, 8).forEach(m => {
      const formatted = formatModelForLLM(m);
      prompt += `- ${formatted.name} (${formatted.id}): ${formatted.cost} credits | Best for: ${formatted.bestFor.join(', ')}\n`;
    });
    prompt += `\n`;
  }

  if (knowledge.videoGeneration.imageToVideo.length > 0) {
    prompt += `**Image-to-Video (animate images):**\n`;
    knowledge.videoGeneration.imageToVideo.forEach(m => {
      const formatted = formatModelForLLM(m);
      prompt += `- ${formatted.name} (${formatted.id}): ${formatted.cost} credits | Requires: source image\n`;
    });
    prompt += `\n`;
  }

  // Chat/LLM Models
  prompt += `### CHAT/LLM MODELS (${knowledge.summary.chatModels} models)\n\n`;
  knowledge.chatModels.slice(0, 8).forEach(m => {
    const formatted = formatModelForLLM(m);
    prompt += `- ${formatted.name} (${formatted.id}): ~${formatted.cost} credits per message\n`;
  });
  prompt += `\n`;

  // Add usage guidelines
  prompt += `### MODEL SELECTION GUIDELINES\n\n`;
  prompt += `1. **Character/UGC content**: Use character-focused models like Nano Banana, FLUX Pro for consistent faces\n`;
  prompt += `2. **Product shots**: FLUX Pro 1.1, Imagen 3 for photorealistic product imagery\n`;
  prompt += `3. **Video from image**: Kling, Veo, Sora for animating still images with motion\n`;
  prompt += `4. **Motion control**: Kling 2.6 Pro, Wan Move for precise camera movements\n`;
  prompt += `5. **Audio in video**: Veo 3.1, Kling 2.6 Pro support audio generation\n`;
  prompt += `6. **Fast/cheap**: LTX, Wan 2.1 for quick iterations\n`;
  prompt += `7. **Premium quality**: Sora 2, Veo 3.1, Kling Pro for highest quality\n`;

  return prompt;
}

/**
 * Get a simplified model lookup for quick access
 * @param {Object} db - Database instance
 * @returns {Map} Model ID to model info map
 */
function getModelLookup(db) {
  const models = db.prepare(`
    SELECT id, name, type, category, baseCost, imageInput, options
    FROM models WHERE enabled = 1
  `).all();

  const lookup = new Map();
  models.forEach(m => {
    m.options = JSON.parse(m.options || '{}');
    lookup.set(m.id, m);
  });
  return lookup;
}

/**
 * Get model recommendations for a specific use case
 * @param {Object} db - Database instance
 * @param {string} useCase - Use case description
 * @returns {Array} Recommended models
 */
function getRecommendedModels(db, useCase) {
  const keywords = useCase.toLowerCase().split(/\s+/);
  
  const models = db.prepare(`
    SELECT id, name, type, category, baseCost, tags
    FROM models WHERE enabled = 1
  `).all();

  // Score models based on tag matches
  const scored = models.map(m => {
    const tags = JSON.parse(m.tags || '[]').map(t => t.toLowerCase());
    let score = 0;
    keywords.forEach(keyword => {
      if (tags.some(tag => tag.includes(keyword))) score += 2;
      if (m.name.toLowerCase().includes(keyword)) score += 1;
      if (m.category.toLowerCase().includes(keyword)) score += 1;
    });
    return { ...m, score };
  });

  // Return top matches
  return scored
    .filter(m => m.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);
}

module.exports = {
  buildModelKnowledge,
  buildSystemPromptKnowledge,
  formatModelForLLM,
  getModelLookup,
  getRecommendedModels
};
