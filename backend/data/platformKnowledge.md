# OmniHub Platform Knowledge

This document provides the AI Creative Director with comprehensive knowledge about the OmniHub platform.

## Platform Overview

OmniHub is a unified AI generation platform that provides access to multiple AI providers (Fal.ai, Replicate, OpenRouter) through a single interface. Users don't need to understand individual providers - the platform handles routing automatically.

## Credit System

- **1 Credit = 1 USD** (direct provider pricing passthrough)
- Users purchase credits and spend them on generations
- Each model has a base cost displayed in credits
- Credits are reserved before generation starts
- On success: credits are committed (spent)
- On failure: credits are refunded

### Credit Best Practices
- Start with budget models for prototyping
- Switch to premium models for final outputs
- Multi-step workflows may use more credits

## Generation Types

### Image Generation
- **Text-to-Image**: Generate images from text descriptions
- **Image-to-Image**: Transform or edit existing images
- **Upscaling**: Enhance resolution and detail of images
- **Inpainting**: Edit specific regions of images
- **Background Removal**: Remove backgrounds from images

### Video Generation
- **Text-to-Video**: Generate videos from text descriptions
- **Image-to-Video**: Animate still images into videos
- **Video Extension**: Extend existing video clips
- **Lip Sync**: Add lip movement to face videos

### Aspect Ratios
- **1:1**: Square (Instagram posts)
- **16:9**: Landscape (YouTube, presentations)
- **9:16**: Vertical (TikTok, Reels, Shorts)
- **4:3**: Classic (some photography)
- **21:9**: Ultrawide (cinematic)

## User Interface

### Main Gallery (OmniHub Page)
- Shows all user generations
- Filterable by type, status, date
- Thumbnails with loading states
- Click to view full generation details

### AI Creative Director
- Floating assistant panel
- Conversational interface
- Plan generation and review
- Multi-step execution with progress

### Generation Modal
- Full view of generated content
- Download options
- Generation parameters display
- Regeneration options

## Common Use Cases

### Social Media Content
- TikTok/Reels: 9:16 vertical videos
- Instagram: 1:1 or 9:16 images/videos
- YouTube: 16:9 thumbnails and videos
- Stories: 9:16 vertical content

### E-commerce
- Product photography on white backgrounds
- 360-degree product videos
- Before/after comparisons
- Lifestyle shots

### UGC (User Generated Content)
- Authentic-looking influencer content
- Character consistency across shots
- Natural movements and expressions

### Branding
- Logo generation with text
- Brand asset variations
- Animated logos
- Marketing materials

## Quality Tiers

### Budget (Fast & Cheap)
- Good for testing concepts
- Rapid iterations
- High volume needs
- Examples: flux-schnell, ltx-video

### Balanced (Quality & Value)
- Production-ready content
- Social media posts
- Regular marketing
- Examples: flux-1.1-pro, minimax-video

### Premium (Best Quality)
- Commercial deliverables
- Hero assets
- Final outputs
- Examples: sora-2, veo-3.1, kling-2.6-pro

## Workflow Tips

### Starting a Project
1. Describe your goal clearly
2. Mention the intended use (social media, e-commerce, etc.)
3. Specify aspect ratio if important
4. Note any budget constraints

### Refining Results
1. Start with budget models to find the right prompt
2. Iterate on prompt wording
3. Switch to premium for final output
4. Use upscaling for extra detail

### Multi-Step Workflows
1. Generate base image first
2. Review before proceeding
3. Video generation uses image as input
4. Each step can be customized

## Platform Limitations

### Rate Limits
- Concurrent generations per user: 5
- Some models have queue times during peak hours

### File Sizes
- Image uploads: max 10MB
- Video outputs: typically 5-15 seconds

### Model Availability
- Some models may be temporarily unavailable
- Check model status before large batches

## Best Practices

1. **Be Specific**: Detailed prompts get better results
2. **Test First**: Use budget models to validate concepts
3. **Iterate**: Refine prompts based on results
4. **Consider Use Case**: Match model to final output needs
5. **Check Credits**: Ensure sufficient balance before workflows
