# AI Creative Director - SOTA Model Guide

**Last Updated:** January 2026  
**Maintained by:** OmniHub Team

> This guide provides the AI Director with expert-level knowledge about AI models for creative generation.
> It includes leaderboard rankings, pricing, API providers, and field-tested recommendations.

---

## Leaderboard References

Always check these for the latest rankings:
- **Text-to-Video:** https://artificialanalysis.ai/video/leaderboard/text-to-video
- **Image-to-Video:** https://artificialanalysis.ai/video/leaderboard/image-to-video
- **Text-to-Image:** https://artificialanalysis.ai/image/leaderboard/text-to-image
- **Image Editing:** https://artificialanalysis.ai/image/leaderboard/editing

---

## VIDEO MODELS - Comprehensive Guide

### Text-to-Video Rankings (January 2026)

| Rank | Model | ELO | Provider | Price/min | Best For |
|------|-------|-----|----------|-----------|----------|
| 1 | grok-imagine-video | 1248 | xAI | $4.20 | General quality |
| 2 | Runway Gen-4.5 | 1236 | Runway | Coming soon | Cinematic |
| 3 | Kling 2.5 Turbo 1080p | 1227 | KlingAI/Fal.ai | $4.20 | Motion control |
| 4 | Veo 3.1 Fast Preview | 1226 | Google/Fal.ai | $9.00 | Quality + Audio |
| 5 | Veo 3.1 Preview | 1224 | Google/Fal.ai | $12.00 | Premium quality |
| 6 | Veo 3 | 1224 | Google/Fal.ai | $12.00 | Premium quality |
| 7 | Kling 2.6 Pro | 1215 | KlingAI/Fal.ai | $4.20 | Motion control |
| 8 | Kling O1 Pro | 1213 | KlingAI/Fal.ai | $10.08 | Advanced reasoning |
| 9 | Sora 2 Pro | 1210 | OpenAI | $30.00 | Highest quality |
| 10 | Ray 3 | 1209 | Luma Labs | $13.20 | Creative |
| 14 | Seedance 1.5 Pro | 1189 | ByteDance | $1.56 | Budget quality |
| 15 | Hailuo 02 Standard | 1187 | MiniMax/Fal.ai | $2.80 | Cost-effective |
| 18 | Wan 2.6 | 1184 | Alibaba/Fal.ai | $9.00 | Native audio, UGC |
| 28 | LTX-2 Pro | 1141 | Lightricks/Fal.ai | $3.60 | Fast, open weights |
| 29 | LTX-2 Fast | 1130 | Lightricks/Fal.ai | $2.40 | Budget, fast |

### Image-to-Video Rankings (January 2026)

| Rank | Model | ELO | Provider | Price/min | Best For |
|------|-------|-----|----------|-----------|----------|
| 1 | grok-imagine-video | 1334 | xAI | $4.20 | General |
| 2 | Kling 2.5 Turbo 1080p | 1304 | KlingAI/Fal.ai | $4.20 | Motion control |
| 3 | Veo 3.1 Fast Preview | 1301 | Google/Fal.ai | $9.00 | Quality + Audio |
| 4 | Veo 3.1 Preview | 1297 | Google/Fal.ai | $12.00 | Premium |
| 5 | PixVerse V5.5 | 1280 | PixVerse | $6.40 | Creative |
| 8 | Kling 2.6 Pro | 1268 | KlingAI/Fal.ai | $4.20 | Best motion control |
| 10 | Hailuo 02 Pro | 1261 | MiniMax/Fal.ai | $4.90 | Good value |
| 11 | Hailuo 2.3 | 1259 | MiniMax/Fal.ai | $2.80 | Budget |
| 12 | Seedance 1.5 Pro | 1258 | ByteDance | $1.56 | Cheapest quality |
| 15 | Hailuo 2.3 Fast | 1255 | MiniMax/Fal.ai | $1.00 | Ultra budget |
| 25 | LTX-2 Pro | 1202 | Lightricks/Fal.ai | $3.60 | Fast |

---

## EXPERT RECOMMENDATIONS (Field-Tested)

### Motion Control - Camera Movements
**Winner: Kling 2.6 Pro**
- Best for: orbit, pan, zoom, tilt, tracking shots
- Precise camera trajectory control
- Excellent for product showcases, 360 views
- Alternative: Kling 2.5 Turbo (faster, similar quality)

### Premium Video Quality
**Winner: Veo 3.1**
- Cinematic quality, excellent coherence
- **Native audio generation** - huge advantage
- Best for: final deliverables, commercial content
- Duration: 4s, 6s, or 8s (use 's' suffix in API)
- Alternative: Sora 2 (higher quality but $30/min)

### UGC / Talking Head Content
**Winner: Wan 2.6**
- Excellent for natural human movement
- Native audio support
- Great facial expressions and lip movement
- Good for: influencer-style content, testimonials
- Alternative: Kling 2.6 Pro + separate audio

### Budget Video (Still Good Quality)
**Winner: Seedance 1.5 Pro @ $1.56/min**
- ByteDance model, surprisingly good quality
- Great for testing concepts
- Alternative: Hailuo 2.3 Fast @ $1.00/min, LTX-2 @ $2.40/min

### Fast Iteration / Prototyping
**Winner: LTX-2 Fast**
- Seconds to generate
- Open weights (Lightricks)
- Perfect for testing ideas before premium generation
- Alternative: Wan 2.1 Turbo

### Long Duration Video (10+ seconds)
**Winner: Kling 2.6 Pro**
- Supports 5 or 10 second generation
- Maintains coherence over time
- Alternative: Sora 2 (up to 20s but expensive)

---

## IMAGE MODELS - Comprehensive Guide

### Recommended Image Models by Use Case

| Use Case | Model | Provider | Cost | Why |
|----------|-------|----------|------|-----|
| **UGC/Character** | Nano Banana Pro | Google/Fal.ai | ~$0.15 | Best character consistency, face preservation |
| **Photorealism** | FLUX 1.1 Pro Ultra | BFL/Fal.ai | ~$0.06 | Highest photorealistic quality |
| **Product Shots** | FLUX 1.1 Pro | BFL/Fal.ai | ~$0.04 | Clean, commercial quality |
| **Text/Logos** | Ideogram V3 | Ideogram/Fal.ai | ~$0.08 | Best-in-class text rendering |
| **Fast/Budget** | FLUX Schnell | BFL/Fal.ai | ~$0.003 | Sub-second generation |
| **Multimodal** | GPT Image 1.5 | OpenAI/Fal.ai | ~$0.10 | Good prompt understanding |
| **Artistic** | FLUX Dev | BFL/Fal.ai | ~$0.025 | Creative interpretation |

### Image Model Details

#### Nano Banana Pro (Google)
- **Best for:** UGC content, character consistency, face preservation
- **Supports:** Up to 14 input images for reference
- **Resolution:** Up to 4K
- **Cost:** ~$0.15/image
- **API:** Fal.ai (fal-nano-banana-pro)
- **When to use:** Any content with people, avatars, consistent characters

#### FLUX 1.1 Pro / Pro Ultra (Black Forest Labs)
- **Best for:** Photorealism, product photography, stock photos
- **Pro Ultra:** Highest quality, ~$0.06/image
- **Pro:** Great value, ~$0.04/image
- **API:** Fal.ai (fal-flux-1.1-pro, fal-flux-1.1-pro-ultra)
- **When to use:** Commercial photography, realistic scenes

#### Ideogram V3
- **Best for:** Text rendering, logos, typography
- **Unique:** Near-perfect text accuracy in images
- **Cost:** ~$0.08/image
- **API:** Fal.ai (fal-ideogram-v3)
- **When to use:** Logos, signage, any image with readable text

#### FLUX Schnell
- **Best for:** Rapid prototyping, budget projects
- **Speed:** Sub-second generation
- **Cost:** ~$0.003/image (basically free)
- **API:** Fal.ai (fal-flux-schnell)
- **When to use:** Testing concepts, high-volume needs

---

## API PROVIDERS

### Fal.ai (Primary)
- **URL:** https://fal.ai
- **Docs:** https://fal.ai/docs
- **Models:** Kling, Veo, FLUX, Nano Banana, LTX, MiniMax, Wan, Ideogram
- **Pricing:** Pay-per-use, competitive rates
- **Webhooks:** Supported for async video generation

### OpenRouter (Chat/LLM)
- **URL:** https://openrouter.ai
- **Docs:** https://openrouter.ai/docs
- **Models:** Claude, GPT-4, Gemini, Llama, Mistral
- **Pricing:** Pass-through provider pricing

### Replicate (Alternative)
- **URL:** https://replicate.com
- **Best for:** Open source models, custom fine-tunes
- **Models:** Various community models

---

## WORKFLOW RECOMMENDATIONS

### Premium UGC Content (~$1.20-1.50)
1. **Image:** Nano Banana Pro - Generate consistent character
2. **Video:** Veo 3.1 - Animate with cinematic quality + audio
3. **Aspect:** 9:16 for TikTok/Reels/Shorts

### Product Video (~$0.50-1.00)
1. **Image:** FLUX 1.1 Pro - Clean product shot
2. **Video:** Kling 2.6 Pro - Smooth orbit/pan animation
3. **Aspect:** 1:1 or 16:9

### Budget Testing (~$0.10-0.30)
1. **Image:** FLUX Schnell - Quick concept
2. **Video:** LTX-2 Fast - Rapid preview
3. **Use for:** Validating ideas before premium generation

### Logo Animation (~$0.80-1.20)
1. **Image:** Ideogram V3 - Perfect text rendering
2. **Video:** Kling 2.6 Pro - Motion graphics style
3. **Aspect:** 1:1 or 16:9

### Cinematic Trailer (~$3.00-5.00)
1. **Image:** FLUX 1.1 Pro Ultra - Hero shots
2. **Video:** Sora 2 or Veo 3.1 - Maximum quality
3. **Aspect:** 16:9 or 21:9 widescreen

---

## MODEL PARAMETERS QUICK REFERENCE

### Video Duration Options

| Model | Durations | Format |
|-------|-----------|--------|
| Kling 2.6 Pro | 5, 10 seconds | String: "5" or "10" |
| Veo 3.1 | 4, 6, 8 seconds | String with 's': "4s", "6s", "8s" |
| Sora 2 | 4, 8, 12 seconds | String: "4", "8", "12" |
| LTX-2 | 2-10 seconds | Number |
| MiniMax | 5-10 seconds | Number |

### Aspect Ratios

| Use Case | Ratio | Pixels |
|----------|-------|--------|
| TikTok/Reels/Shorts | 9:16 | 1080x1920 |
| YouTube/Landscape | 16:9 | 1920x1080 |
| Square/Instagram | 1:1 | 1080x1080 |
| Cinematic | 21:9 | 2560x1080 |

---

## PRICING TIERS

### Budget Tier (~$0.01-0.15/generation)
- **Image:** FLUX Schnell, SDXL Lightning
- **Video:** LTX-2, Wan 2.1 Turbo, Hailuo Fast
- **Best for:** Prototyping, testing, high volume

### Balanced Tier (~$0.15-0.50/generation)
- **Image:** FLUX 1.1 Pro, Nano Banana Pro, Ideogram V2
- **Video:** Kling 1.6 Pro, MiniMax, Runway Gen3 Turbo
- **Best for:** Production content, social media

### Premium Tier (~$0.50-2.00/generation)
- **Image:** FLUX 1.1 Pro Ultra, Ideogram V3, Imagen 3
- **Video:** Veo 3.1, Kling 2.6 Pro, Sora 2
- **Best for:** Commercial content, final deliverables

---

## FAILURE HANDLING

### Common Failure Reasons

| Issue | Likely Cause | Solution |
|-------|--------------|----------|
| Video stuck "processing" | Server load | Retry, try different model |
| Poor motion quality | Wrong model choice | Use Kling 2.6 for motion |
| Bad text in image | Wrong model | Use Ideogram for text |
| Inconsistent faces | Wrong model | Use Nano Banana Pro |
| High cost | Premium model | Suggest budget alternative |

### Fallback Recommendations

| If This Fails | Try This Instead |
|---------------|------------------|
| Veo 3.1 | Kling 2.6 Pro |
| Kling 2.6 Pro | MiniMax Hailuo |
| Sora 2 | Veo 3.1 |
| FLUX 1.1 Pro | FLUX Dev |
| Ideogram V3 | Ideogram V2 Turbo |

---

## NOTES FOR AI DIRECTOR

1. **Always consider budget** - Offer Budget/Balanced/Premium options
2. **Match model to task** - Text needs Ideogram, UGC needs Nano Banana
3. **Audio matters** - Veo 3.1 and Wan 2.6 have native audio
4. **Aspect ratio is critical** - Always ask about platform (TikTok = 9:16)
5. **Motion control** - Kling 2.6 Pro is best for camera movements
6. **Test first** - Suggest budget option for concept validation
7. **Dependencies matter** - Video needs image first for I2V workflows

---

*This guide is updated based on Artificial Analysis leaderboards and field testing.*
