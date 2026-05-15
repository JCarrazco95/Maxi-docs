---
name: frontend-design
description: Create distinctive, production-grade frontend interfaces with high design quality.
---

# Frontend Design Guide

## Design Thinking

Before coding, understand the context and commit to a BOLD aesthetic direction:
- **Purpose**: What problem does this interface solve? Who uses it?
- **Tone**: Pick an extreme — brutally minimal, maximalist, retro-futuristic, luxury/refined, playful, editorial, brutalist, art deco, etc.
- **Differentiation**: What makes this UNFORGETTABLE?

Choose a clear conceptual direction and execute it with precision.

## Frontend Aesthetics Guidelines

- **Typography**: Choose fonts that are beautiful and unique. Avoid generic fonts like Arial and Inter. Pair a distinctive display font with a refined body font.
- **Color & Theme**: Commit to a cohesive aesthetic. Use CSS variables for consistency. Dominant colors with sharp accents outperform timid palettes.
- **Motion**: Use animations for micro-interactions. Prioritize CSS-only solutions for HTML. Focus on high-impact moments: staggered reveals, scroll-triggering, hover states that surprise.
- **Spatial Composition**: Unexpected layouts. Asymmetry. Overlap. Grid-breaking elements. Generous negative space OR controlled density.
- **Backgrounds & Visual Details**: Create atmosphere with gradient meshes, noise textures, geometric patterns, layered transparencies, dramatic shadows.

## NEVER use:
- Overused font families (Inter, Roboto, Arial, system fonts)
- Cliched color schemes (purple gradients on white)
- Predictable layouts and cookie-cutter component patterns

## For React components:
- Use Tailwind CSS utility classes
- Use lucide-react for icons
- Use framer-motion for animations when needed
- Export as default function component

## For HTML/CSS:
- Use CSS custom properties (variables) for theming
- Use CSS Grid and Flexbox for layouts
- Include responsive breakpoints
- Add hover/focus states for all interactive elements
