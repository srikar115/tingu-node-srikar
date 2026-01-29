/**
 * URL Analyzer Service
 * 
 * Detects URL types, fetches media content, and extracts thumbnails/frames
 * for AI vision analysis.
 */

const https = require('https');
const http = require('http');
const { URL } = require('url');

// ============================================================
// URL TYPE DETECTION
// ============================================================

const URL_PATTERNS = {
  youtube: [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/v\/)([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/
  ],
  instagram: [
    /instagram\.com\/(?:p|reel|tv)\/([a-zA-Z0-9_-]+)/,
    /instagram\.com\/stories\/([^/]+)\/(\d+)/
  ],
  tiktok: [
    /tiktok\.com\/@[^/]+\/video\/(\d+)/,
    /tiktok\.com\/t\/([a-zA-Z0-9]+)/,
    /vm\.tiktok\.com\/([a-zA-Z0-9]+)/
  ],
  twitter: [
    /(?:twitter\.com|x\.com)\/[^/]+\/status\/(\d+)/
  ],
  vimeo: [
    /vimeo\.com\/(\d+)/
  ],
  directImage: [
    /\.(jpg|jpeg|png|gif|webp|bmp|svg)(\?.*)?$/i
  ],
  directVideo: [
    /\.(mp4|webm|mov|avi|mkv)(\?.*)?$/i
  ]
};

/**
 * Detect the type of URL
 * @param {string} url - The URL to analyze
 * @returns {Object} { type: string, id: string|null, url: string }
 */
function detectUrlType(url) {
  if (!url || typeof url !== 'string') {
    return { type: 'unknown', id: null, url };
  }

  const trimmedUrl = url.trim();

  // Check YouTube
  for (const pattern of URL_PATTERNS.youtube) {
    const match = trimmedUrl.match(pattern);
    if (match) {
      return { type: 'youtube', id: match[1], url: trimmedUrl };
    }
  }

  // Check Instagram
  for (const pattern of URL_PATTERNS.instagram) {
    const match = trimmedUrl.match(pattern);
    if (match) {
      return { type: 'instagram', id: match[1], url: trimmedUrl };
    }
  }

  // Check TikTok
  for (const pattern of URL_PATTERNS.tiktok) {
    const match = trimmedUrl.match(pattern);
    if (match) {
      return { type: 'tiktok', id: match[1], url: trimmedUrl };
    }
  }

  // Check Twitter/X
  for (const pattern of URL_PATTERNS.twitter) {
    const match = trimmedUrl.match(pattern);
    if (match) {
      return { type: 'twitter', id: match[1], url: trimmedUrl };
    }
  }

  // Check Vimeo
  for (const pattern of URL_PATTERNS.vimeo) {
    const match = trimmedUrl.match(pattern);
    if (match) {
      return { type: 'vimeo', id: match[1], url: trimmedUrl };
    }
  }

  // Check direct image URL
  for (const pattern of URL_PATTERNS.directImage) {
    if (pattern.test(trimmedUrl)) {
      return { type: 'image', id: null, url: trimmedUrl };
    }
  }

  // Check direct video URL
  for (const pattern of URL_PATTERNS.directVideo) {
    if (pattern.test(trimmedUrl)) {
      return { type: 'video', id: null, url: trimmedUrl };
    }
  }

  return { type: 'unknown', id: null, url: trimmedUrl };
}

// ============================================================
// IMAGE FETCHING
// ============================================================

/**
 * Fetch an image from URL and convert to base64
 * @param {string} imageUrl - The image URL to fetch
 * @param {Object} options - Options { maxSize: number, timeout: number }
 * @returns {Promise<Object>} { success, data, mimeType, error }
 */
async function fetchImageAsBase64(imageUrl, options = {}) {
  const { maxSize = 10 * 1024 * 1024, timeout = 15000 } = options; // 10MB default, 15s timeout

  return new Promise((resolve) => {
    try {
      const parsedUrl = new URL(imageUrl);
      const protocol = parsedUrl.protocol === 'https:' ? https : http;

      const request = protocol.get(imageUrl, { 
        timeout,
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; OmniHub/1.0)',
          'Accept': 'image/*'
        }
      }, (response) => {
        // Handle redirects
        if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
          fetchImageAsBase64(response.headers.location, options).then(resolve);
          return;
        }

        if (response.statusCode !== 200) {
          resolve({ success: false, error: `HTTP ${response.statusCode}` });
          return;
        }

        const contentType = response.headers['content-type'] || 'image/jpeg';
        const contentLength = parseInt(response.headers['content-length'] || '0', 10);

        // Check size before downloading
        if (contentLength > maxSize) {
          resolve({ success: false, error: `File too large (${Math.round(contentLength / 1024 / 1024)}MB)` });
          return;
        }

        const chunks = [];
        let totalSize = 0;

        response.on('data', (chunk) => {
          totalSize += chunk.length;
          if (totalSize > maxSize) {
            request.destroy();
            resolve({ success: false, error: 'File too large' });
            return;
          }
          chunks.push(chunk);
        });

        response.on('end', () => {
          const buffer = Buffer.concat(chunks);
          const base64 = buffer.toString('base64');
          const dataUrl = `data:${contentType};base64,${base64}`;
          resolve({ 
            success: true, 
            data: dataUrl, 
            mimeType: contentType,
            size: buffer.length 
          });
        });

        response.on('error', (err) => {
          resolve({ success: false, error: err.message });
        });
      });

      request.on('timeout', () => {
        request.destroy();
        resolve({ success: false, error: 'Request timed out' });
      });

      request.on('error', (err) => {
        resolve({ success: false, error: err.message });
      });
    } catch (err) {
      resolve({ success: false, error: err.message });
    }
  });
}

// ============================================================
// YOUTUBE HANDLER
// ============================================================

/**
 * Get YouTube video thumbnail
 * @param {string} videoId - YouTube video ID
 * @returns {Promise<Object>} { success, data, metadata }
 */
async function getYouTubeThumbnail(videoId) {
  // Try different thumbnail qualities in order of preference
  const thumbnailUrls = [
    `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`,
    `https://img.youtube.com/vi/${videoId}/sddefault.jpg`,
    `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`,
    `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`,
    `https://img.youtube.com/vi/${videoId}/default.jpg`
  ];

  for (const thumbnailUrl of thumbnailUrls) {
    const result = await fetchImageAsBase64(thumbnailUrl);
    if (result.success) {
      return {
        success: true,
        type: 'youtube',
        data: result.data,
        mimeType: result.mimeType,
        metadata: {
          videoId,
          thumbnailQuality: thumbnailUrl.includes('maxres') ? 'maxres' : 
                           thumbnailUrl.includes('sd') ? 'sd' : 
                           thumbnailUrl.includes('hq') ? 'hq' : 'default',
          videoUrl: `https://www.youtube.com/watch?v=${videoId}`
        }
      };
    }
  }

  return { success: false, error: 'Could not fetch YouTube thumbnail' };
}

/**
 * Get YouTube video metadata using oEmbed
 * @param {string} videoUrl - Full YouTube URL
 * @returns {Promise<Object>} Metadata object
 */
async function getYouTubeMetadata(videoUrl) {
  return new Promise((resolve) => {
    const oEmbedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(videoUrl)}&format=json`;
    
    https.get(oEmbedUrl, { timeout: 10000 }, (response) => {
      if (response.statusCode !== 200) {
        resolve({ success: false });
        return;
      }

      let data = '';
      response.on('data', chunk => data += chunk);
      response.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve({
            success: true,
            title: parsed.title,
            author: parsed.author_name,
            thumbnailUrl: parsed.thumbnail_url
          });
        } catch (e) {
          resolve({ success: false });
        }
      });
    }).on('error', () => resolve({ success: false }));
  });
}

// ============================================================
// INSTAGRAM/TIKTOK HANDLER (oEmbed fallback)
// ============================================================

/**
 * Try to get Instagram post info via oEmbed
 * @param {string} postUrl - Instagram post URL
 * @returns {Promise<Object>}
 */
async function getInstagramEmbed(postUrl) {
  return new Promise((resolve) => {
    const oEmbedUrl = `https://api.instagram.com/oembed?url=${encodeURIComponent(postUrl)}`;
    
    https.get(oEmbedUrl, { timeout: 10000 }, (response) => {
      if (response.statusCode !== 200) {
        resolve({ 
          success: false, 
          error: 'Instagram requires authentication. Please upload a screenshot instead.',
          requiresUpload: true
        });
        return;
      }

      let data = '';
      response.on('data', chunk => data += chunk);
      response.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve({
            success: true,
            type: 'instagram',
            thumbnailUrl: parsed.thumbnail_url,
            title: parsed.title,
            author: parsed.author_name
          });
        } catch (e) {
          resolve({ 
            success: false, 
            error: 'Could not parse Instagram data. Please upload a screenshot.',
            requiresUpload: true
          });
        }
      });
    }).on('error', () => {
      resolve({ 
        success: false, 
        error: 'Could not access Instagram. Please upload a screenshot.',
        requiresUpload: true
      });
    });
  });
}

/**
 * Try to get TikTok video info via oEmbed
 * @param {string} videoUrl - TikTok video URL
 * @returns {Promise<Object>}
 */
async function getTikTokEmbed(videoUrl) {
  return new Promise((resolve) => {
    const oEmbedUrl = `https://www.tiktok.com/oembed?url=${encodeURIComponent(videoUrl)}`;
    
    https.get(oEmbedUrl, { timeout: 10000 }, (response) => {
      if (response.statusCode !== 200) {
        resolve({ 
          success: false, 
          error: 'Could not fetch TikTok preview. Please upload a screenshot.',
          requiresUpload: true
        });
        return;
      }

      let data = '';
      response.on('data', chunk => data += chunk);
      response.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (parsed.thumbnail_url) {
            resolve({
              success: true,
              type: 'tiktok',
              thumbnailUrl: parsed.thumbnail_url,
              title: parsed.title,
              author: parsed.author_name
            });
          } else {
            resolve({ 
              success: false, 
              error: 'TikTok preview not available. Please upload a screenshot.',
              requiresUpload: true
            });
          }
        } catch (e) {
          resolve({ 
            success: false, 
            error: 'Could not parse TikTok data. Please upload a screenshot.',
            requiresUpload: true
          });
        }
      });
    }).on('error', () => {
      resolve({ 
        success: false, 
        error: 'Could not access TikTok. Please upload a screenshot.',
        requiresUpload: true
      });
    });
  });
}

// ============================================================
// MAIN ANALYZER FUNCTION
// ============================================================

/**
 * Analyze a URL and extract visual content
 * @param {string} url - The URL to analyze
 * @returns {Promise<Object>} Analysis result
 */
async function analyzeUrl(url) {
  const detection = detectUrlType(url);

  switch (detection.type) {
    case 'youtube': {
      const thumbnail = await getYouTubeThumbnail(detection.id);
      const metadata = await getYouTubeMetadata(url);
      
      return {
        success: thumbnail.success,
        type: 'youtube',
        data: thumbnail.data,
        mimeType: thumbnail.mimeType,
        metadata: {
          ...thumbnail.metadata,
          title: metadata.success ? metadata.title : null,
          author: metadata.success ? metadata.author : null
        },
        error: thumbnail.success ? null : thumbnail.error
      };
    }

    case 'instagram': {
      const embed = await getInstagramEmbed(url);
      if (embed.success && embed.thumbnailUrl) {
        const thumbnail = await fetchImageAsBase64(embed.thumbnailUrl);
        return {
          success: thumbnail.success,
          type: 'instagram',
          data: thumbnail.data,
          mimeType: thumbnail.mimeType,
          metadata: {
            title: embed.title,
            author: embed.author,
            originalUrl: url
          }
        };
      }
      return {
        success: false,
        type: 'instagram',
        error: embed.error || 'Could not fetch Instagram content',
        requiresUpload: embed.requiresUpload
      };
    }

    case 'tiktok': {
      const embed = await getTikTokEmbed(url);
      if (embed.success && embed.thumbnailUrl) {
        const thumbnail = await fetchImageAsBase64(embed.thumbnailUrl);
        return {
          success: thumbnail.success,
          type: 'tiktok',
          data: thumbnail.data,
          mimeType: thumbnail.mimeType,
          metadata: {
            title: embed.title,
            author: embed.author,
            originalUrl: url
          }
        };
      }
      return {
        success: false,
        type: 'tiktok',
        error: embed.error || 'Could not fetch TikTok content',
        requiresUpload: embed.requiresUpload
      };
    }

    case 'image': {
      const image = await fetchImageAsBase64(url);
      return {
        success: image.success,
        type: 'image',
        data: image.data,
        mimeType: image.mimeType,
        metadata: {
          originalUrl: url,
          size: image.size
        },
        error: image.error
      };
    }

    case 'video': {
      // For direct video URLs, we can't easily extract frames without FFmpeg
      // Return a message asking user to upload instead
      return {
        success: false,
        type: 'video',
        error: 'Direct video URL detected. Please upload the video file for analysis.',
        requiresUpload: true,
        metadata: {
          originalUrl: url
        }
      };
    }

    case 'twitter': {
      return {
        success: false,
        type: 'twitter',
        error: 'Twitter/X requires authentication. Please upload a screenshot.',
        requiresUpload: true,
        metadata: {
          tweetId: detection.id,
          originalUrl: url
        }
      };
    }

    case 'vimeo': {
      // Vimeo oEmbed could work, but keeping it simple for now
      return {
        success: false,
        type: 'vimeo',
        error: 'Vimeo support coming soon. Please upload a screenshot.',
        requiresUpload: true,
        metadata: {
          videoId: detection.id,
          originalUrl: url
        }
      };
    }

    default:
      return {
        success: false,
        type: 'unknown',
        error: 'URL type not recognized. Please paste an image URL or upload a file.',
        requiresUpload: true
      };
  }
}

/**
 * Check if a string contains a URL
 * @param {string} text - Text to check
 * @returns {string|null} First URL found or null
 */
function extractUrl(text) {
  if (!text || typeof text !== 'string') return null;
  
  const urlPattern = /https?:\/\/[^\s<>"{}|\\^`\[\]]+/gi;
  const match = text.match(urlPattern);
  return match ? match[0] : null;
}

/**
 * Check if URL is potentially analyzable
 * @param {string} url - URL to check
 * @returns {boolean}
 */
function isAnalyzableUrl(url) {
  const detection = detectUrlType(url);
  return detection.type !== 'unknown';
}

module.exports = {
  detectUrlType,
  analyzeUrl,
  fetchImageAsBase64,
  getYouTubeThumbnail,
  getYouTubeMetadata,
  extractUrl,
  isAnalyzableUrl
};
