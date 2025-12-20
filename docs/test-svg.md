# SVG Test Document

This document demonstrates embedding SVG in markdown.

## Inline SVG

<svg width="200" height="150" xmlns="http://www.w3.org/2000/svg">
  <rect x="10" y="10" width="180" height="130" rx="10" fill="#1a1a2e" stroke="#4a90d9" stroke-width="2"/>
  <text x="100" y="50" text-anchor="middle" fill="#4a90d9" font-family="sans-serif" font-size="14">PocketBase</text>
  <line x1="30" y1="70" x2="170" y2="70" stroke="#4a90d9" stroke-width="1"/>
  <text x="100" y="95" text-anchor="middle" fill="#888" font-family="sans-serif" font-size="12">Collections</text>
  <text x="100" y="115" text-anchor="middle" fill="#888" font-family="sans-serif" font-size="12">Auth</text>
  <text x="100" y="135" text-anchor="middle" fill="#888" font-family="sans-serif" font-size="12">Realtime</text>
</svg>

## Another Example - Simple Diagram

<svg width="300" height="80" xmlns="http://www.w3.org/2000/svg">
  <rect x="5" y="20" width="80" height="40" rx="5" fill="#3b82f6"/>
  <text x="45" y="45" text-anchor="middle" fill="white" font-family="sans-serif" font-size="12">Client</text>

  <line x1="90" y1="40" x2="130" y2="40" stroke="#666" stroke-width="2" marker-end="url(#arrow)"/>

  <rect x="135" y="20" width="80" height="40" rx="5" fill="#10b981"/>
  <text x="175" y="45" text-anchor="middle" fill="white" font-family="sans-serif" font-size="12">API</text>

  <line x1="220" y1="40" x2="260" y2="40" stroke="#666" stroke-width="2"/>

  <rect x="265" y="20" width="30" height="40" rx="5" fill="#f59e0b"/>
  <text x="280" y="45" text-anchor="middle" fill="white" font-family="sans-serif" font-size="10">DB</text>

  <defs>
    <marker id="arrow" markerWidth="10" markerHeight="10" refX="9" refY="3" orient="auto">
      <path d="M0,0 L0,6 L9,3 z" fill="#666"/>
    </marker>
  </defs>
</svg>
