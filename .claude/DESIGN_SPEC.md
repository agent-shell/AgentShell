# AgentShell Design Specification
Source: test/agentshell-theme-switcher.html

## Fonts (Google Fonts)
- Shell font Industrial:  'JetBrains Mono', monospace (weights: 300, 400, 600)
- Shell font Minimal:     'IBM Plex Mono', monospace (weights: 300, 400, 500)
- Shell font Cyberpunk:   'Share Tech Mono', monospace
- UI font Industrial:     'Rajdhani', sans-serif (weights: 400, 500, 600, 700)
- UI font Minimal:        'DM Sans', sans-serif (weights: 300, 400, 500, 600)
- UI font Cyberpunk:      'Orbitron', sans-serif (weights: 400, 500, 700, 900)

Google Fonts URL:
https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@300;400;600&family=Rajdhani:wght@400;500;600;700&family=IBM+Plex+Mono:wght@300;400;500&family=DM+Sans:wght@300;400;500;600&family=Share+Tech+Mono&family=Orbitron:wght@400;500;700;900&display=swap

## Theme: industrial
page-bg:              #060910
page-text:            #c8d4e8
selector-bg:          #0b0f18
selector-border:      rgba(212,168,75,0.2)
card-bg:              #0e131c
card-border:          rgba(212,168,75,0.15)
card-active-border:   #d4a84b
card-active-bg:       rgba(212,168,75,0.06)
card-check:           #d4a84b
badge-bg:             rgba(212,168,75,0.1)
badge-border:         rgba(212,168,75,0.3)
badge-text:           #d4a84b
accent:               #d4a84b      (gold)
accent2:              #2dd4bf      (teal)
terminal-bg:          #060910
sidebar-bg:           #0b0f18
sidebar-border:       rgba(212,168,75,0.12)
ai-panel-bg:          #0b0f18
ai-panel-border:      rgba(212,168,75,0.12)
tab-active-bg:        #111827
cursor-color:         #d4a84b
prompt-color:         #d4a84b
text-muted:           #5a7090
text-dim:             #253040
green:                #34d399
red:                  #f87171
blue:                 #60a5fa
teal:                 #2dd4bf
amber:                #fbbf24
scanline:             none (subtle grid overlay: rgba(45,212,191,0.025))
status-online:        #34d399
status-warn:          #fbbf24
status-offline:       #5a7090

## Theme: minimal
page-bg:              #eeecea
page-text:            #1a1917
selector-bg:          #ffffff
selector-border:      #d4d2ce
card-bg:              #f8f7f5
card-border:          #e0dedd
card-active-border:   #1a1917
card-active-bg:       #f2f0ed
card-check:           #1a1917
badge-bg:             #f2f0ed
badge-border:         #d0cecc
badge-text:           #6b6a67
accent:               #1a1917      (near-black)
terminal-bg:          #f8f7f5
sidebar-bg:           #f8f7f5
sidebar-border:       #e0dedd
ai-panel-bg:          #ffffff
ai-panel-border:      #e0dedd
tab-active-border:    #1a1917 (bottom border only)
cursor-color:         #1a1917
prompt-color:         #6b6a67
text-muted:           #b0aead
text-dim:             #d4d2ce
green:                #16a34a
red:                  #dc2626
blue:                 #2563eb
status-online:        #16a34a
status-warn:          #d97706
status-offline:       #b0aead

## Theme: cyberpunk
page-bg:              #06030d
page-text:            #e2d9f3
selector-bg:          #0a0614
selector-border:      rgba(192,132,252,0.2)
card-bg:              #10091c
card-border:          rgba(192,132,252,0.12)
card-active-border:   #c084fc
card-active-bg:       rgba(192,132,252,0.08)
card-check:           #c084fc
badge-bg:             rgba(192,132,252,0.08)
badge-border:         rgba(192,132,252,0.25)
badge-text:           #c084fc
accent:               #c084fc      (purple)
accent2:              #f472b6      (pink)
accent3:              #22d3ee      (cyan)
terminal-bg:          #06030d
sidebar-bg:           #0a0614
sidebar-border:       rgba(192,132,252,0.12)
ai-panel-bg:          #0a0614
ai-panel-border:      rgba(192,132,252,0.12)
cursor-color:         #c084fc
prompt-color:         #c084fc
text-muted:           #7a6a99
text-dim:             #2e1f44
green:                #4ade80
red:                  #f87171
cyan:                 #22d3ee
pink:                 #f472b6
scanline:             repeating-linear-gradient(0deg, transparent, transparent 3px, rgba(192,132,252,0.018) 3px, rgba(192,132,252,0.018) 4px)
top-border:           linear-gradient(90deg, transparent, #c084fc, #f472b6, transparent) opacity 0.6
status-online:        #4ade80
status-warn:          #fbbf24
status-offline:       #7a6a99

## Animations
cursor-blink:   @keyframes bl { 0%,100%{opacity:.9} 50%{opacity:0} } 1s step-end infinite
agent-pulse:    @keyframes pu { 0%,100%{opacity:1} 50%{opacity:0.3} } 1.8s ease-in-out infinite
sweep (pill):   @keyframes sw { 0%{left:-100%} 100%{left:200%} } 3s ease-in-out infinite
scanline move:  @keyframes scla { from{top:0} to{top:100%} } 7s linear infinite

## Layout
Shell grid: 3 columns
  Industrial: grid-template-columns: 210px 1fr 260px; rows: 40px 30px 1fr
  Minimal:    grid-template-columns: 205px 1fr 250px; rows: 38px 1fr
  Cyberpunk:  grid-template-columns: 210px 1fr 260px; rows: 42px 1fr
Height: 620px
Columns: Sidebar | Terminal | AI Panel
